import React, { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, CheckCircle2, Clock3, Loader2, Wifi, X } from "lucide-react";
import { toast } from "sonner";
import { createDeviceOperationIdempotencyKey } from "@/lib/device-operations";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { smartHealthApi, type SmartHealthApiError } from "@/lib/smart-health-api";

interface ActivateDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivated?: () => void | Promise<void>;
}

type PairingStep = "input" | "activating" | "awaiting_online" | "online";
type PairingFailureKind = "" | "ambiguous" | "api";

type PairingFieldErrors = {
  deviceId?: string;
  claimCode?: string;
};

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/;
const CLAIM_CODE_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;

function validatePairingIntent(deviceId: string, claimCode: string): PairingFieldErrors {
  const errors: PairingFieldErrors = {};

  if (!deviceId) {
    errors.deviceId = "Vui lòng nhập Device ID.";
  } else if (!DEVICE_ID_PATTERN.test(deviceId)) {
    errors.deviceId =
      "Device ID chỉ được chứa chữ, số, dấu gạch ngang hoặc gạch dưới; dài 3–63 ký tự.";
  }

  if (!claimCode) {
    errors.claimCode = "Vui lòng nhập claim code.";
  } else if (!CLAIM_CODE_PATTERN.test(claimCode)) {
    errors.claimCode =
      "Claim code phải có từ 6 đến 80 ký tự gồm chữ, số, dấu gạch ngang hoặc gạch dưới.";
  }

  return errors;
}

function isAmbiguousNetworkFailure(error: unknown) {
  const apiError = error as SmartHealthApiError;
  return typeof apiError?.status !== "number" || apiError.status === 0;
}

export function ActivateDeviceDialog({
  open,
  onOpenChange,
  onActivated,
}: ActivateDeviceDialogProps) {
  const [step, setStep] = useState<PairingStep>("input");
  const [deviceId, setDeviceId] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [failureKind, setFailureKind] = useState<PairingFailureKind>("");
  const [fieldErrors, setFieldErrors] = useState<PairingFieldErrors>({});
  const idempotencyKeyRef = useRef<string>("");
  const submitInFlightRef = useRef<boolean>(false);

  const isDismissBlocked = () => submitInFlightRef.current;

  const reset = () => {
    setStep("input");
    setDeviceId("");
    setClaimCode("");
    setErrorMessage("");
    setFailureKind("");
    setFieldErrors({});
    idempotencyKeyRef.current = "";
    submitInFlightRef.current = false;
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isDismissBlocked()) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const updateDeviceId = (value: string) => {
    setDeviceId(value);
    setErrorMessage("");
    setFailureKind("");
    setFieldErrors((current) => ({ ...current, deviceId: undefined }));
    idempotencyKeyRef.current = "";
  };

  const updateClaimCode = (value: string) => {
    setClaimCode(value);
    setErrorMessage("");
    setFailureKind("");
    setFieldErrors((current) => ({ ...current, claimCode: undefined }));
    idempotencyKeyRef.current = "";
  };

  const handleActivate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitInFlightRef.current) return;

    const validationErrors = validatePairingIntent(deviceId, claimCode);
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    const operationKey =
      idempotencyKeyRef.current || createDeviceOperationIdempotencyKey("pair", deviceId);
    idempotencyKeyRef.current = operationKey;
    setErrorMessage("");
    setFailureKind("");

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setFailureKind("ambiguous");
      setErrorMessage("Chưa xác định backend đã nhận yêu cầu hay chưa.");
      return;
    }

    submitInFlightRef.current = true;
    setStep("activating");

    try {
      const result = await smartHealthApi.activateDeviceByClaim(
        {
          deviceId,
          claimCode,
          connectionMethod: "QR",
        },
        operationKey,
      );
      setClaimCode("");
      if (result.device.id !== deviceId) {
        idempotencyKeyRef.current = "";
        setFailureKind("api");
        setErrorMessage("Backend trả về sai định danh thiết bị đã gửi.");
        setStep("input");
        toast.error("Không thể xác nhận thiết bị", {
          description: "Backend trả về sai định danh thiết bị đã gửi.",
        });
        return;
      }
      idempotencyKeyRef.current = "";

      if (result.pairing.onlineConfirmed === true) {
        setStep("online");
        toast.success("Thiết bị đã xác thực trực tuyến", {
          description: "Backend đã xác nhận kết nối WSS của đúng thiết bị.",
        });
      } else {
        setStep("awaiting_online");
        toast.info("Đã chấp nhận ghép thiết bị", {
          description: "Chưa thể báo sẵn sàng cho đến khi thiết bị xác thực trực tuyến.",
        });
      }

      try {
        await onActivated?.();
      } catch (refreshError) {
        toast.error("Đã ghép thiết bị nhưng chưa làm mới danh sách", {
          description: toVietnameseErrorMessage(
            refreshError,
            "Mở lại danh sách thiết bị để tải trạng thái mới nhất.",
          ),
        });
      }
    } catch (error) {
      setStep("input");
      const ambiguous = isAmbiguousNetworkFailure(error);
      const message = ambiguous
        ? "Chưa xác định backend đã nhận yêu cầu hay chưa."
        : toVietnameseErrorMessage(
            error,
            "Không thể ghép thiết bị. Vui lòng kiểm tra Device ID, claim code và thử lại.",
          );
      setFailureKind(ambiguous ? "ambiguous" : "api");
      setErrorMessage(message);
      toast.error(ambiguous ? "Mất kết nối khi đang ghép thiết bị" : "Không thể ghép thiết bị", {
        description: message,
      });
    } finally {
      submitInFlightRef.current = false;
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-black/50 motion-reduce:animate-none" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 motion-reduce:animate-none"
          onEscapeKeyDown={(event) => {
            if (isDismissBlocked()) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isDismissBlocked()) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (isDismissBlocked()) event.preventDefault();
          }}
        >
          <div className="flex items-center justify-between border-b border-border p-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-semibold text-foreground">Ghép thiết bị</Dialog.Title>
                <Dialog.Description className="text-sm leading-5 text-muted-foreground">
                  Claim thiết bị trước, sau đó chờ chính thiết bị xác thực WSS.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              disabled={isDismissBlocked()}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              aria-label="Đóng hộp thoại ghép thiết bị"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form method="post" onSubmit={handleActivate} className="space-y-6 p-6" noValidate>
            {step === "input" && (
              <>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-primary" />
                    <div className="text-sm leading-5 text-muted-foreground">
                      Thiết bị đã thu hồi hoặc claim code hết hạn sẽ bị backend từ chối.
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="activate-device-id"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Device ID <span className="text-destructive">*</span>
                  </label>
                  <input
                    required
                    id="activate-device-id"
                    name="deviceId"
                    autoComplete="off"
                    value={deviceId}
                    onChange={(event) => updateDeviceId(event.target.value)}
                    placeholder="VD: dev_20260525_abcd1234"
                    className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    aria-invalid={Boolean(fieldErrors.deviceId)}
                    aria-describedby={fieldErrors.deviceId ? "activate-device-id-error" : undefined}
                  />
                  {fieldErrors.deviceId ? (
                    <p
                      id="activate-device-id-error"
                      role="alert"
                      className="mt-2 text-sm text-destructive"
                    >
                      {fieldErrors.deviceId}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label
                    htmlFor="activate-claim-code"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Claim code <span className="text-destructive">*</span>
                  </label>
                  <input
                    required
                    id="activate-claim-code"
                    name="claimCode"
                    autoComplete="off"
                    value={claimCode}
                    onChange={(event) => updateClaimCode(event.target.value)}
                    placeholder="VD: A1B2C3D4E5F6"
                    className="min-h-12 w-full rounded-md border border-border bg-background px-4 py-3 text-center font-mono text-lg tracking-widest outline-none focus:border-ring focus:ring-2 focus:ring-ring"
                    aria-invalid={Boolean(fieldErrors.claimCode)}
                    aria-describedby={
                      fieldErrors.claimCode ? "activate-claim-code-error" : undefined
                    }
                  />
                  {fieldErrors.claimCode ? (
                    <p
                      id="activate-claim-code-error"
                      role="alert"
                      className="mt-2 text-sm text-destructive"
                    >
                      {fieldErrors.claimCode}
                    </p>
                  ) : null}
                </div>

                {errorMessage ? (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
                    <div className="font-medium">
                      {failureKind === "ambiguous"
                        ? "Chưa xác định backend đã nhận yêu cầu"
                        : "Ghép thiết bị chưa thành công"}
                    </div>
                    <div className="mt-1 leading-5">{errorMessage}</div>
                    {failureKind === "ambiguous" ? (
                      <div className="mt-2 leading-5">
                        Giữ nguyên Device ID và claim code; hệ thống sẽ dùng lại cùng mã yêu cầu để
                        tránh ghép trùng.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex gap-3">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      disabled={isDismissBlocked()}
                      className="min-h-11 flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      Hủy
                    </button>
                  </Dialog.Close>
                  <button
                    type="submit"
                    disabled={!deviceId || !claimCode || isDismissBlocked()}
                    className="min-h-11 flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {failureKind === "ambiguous"
                      ? "Thử lại cùng yêu cầu"
                      : errorMessage
                        ? "Thử lại ghép thiết bị"
                        : "Xác nhận ghép"}
                  </button>
                </div>
              </>
            )}

            {step === "activating" && (
              <div
                className="flex flex-col items-center gap-4 py-8 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary motion-reduce:animate-none" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Đang xác minh yêu cầu ghép...</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Backend đang xác minh claim code và quyền quản trị.
                  </p>
                </div>
              </div>
            )}

            {step === "awaiting_online" && (
              <div
                className="flex flex-col items-center gap-4 py-8 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
                  <Clock3 className="h-8 w-8 text-warning" />
                </div>
                <div className="max-w-sm">
                  <p className="font-medium text-foreground">Đã chấp nhận ghép thiết bị</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Đang chờ thiết bị xác thực trực tuyến. Trạng thái này chưa có nghĩa thiết bị đã
                    kết nối hoặc sẵn sàng đo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="min-h-11 rounded-md border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  Đóng và theo dõi trạng thái
                </button>
              </div>
            )}

            {step === "online" && (
              <div
                className="flex flex-col items-center gap-4 py-8 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
                <div className="max-w-sm">
                  <p className="font-medium text-foreground">Thiết bị đã xác thực trực tuyến</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Backend đã xác nhận đúng thiết bị đang online qua kênh WSS đã xác thực.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="min-h-11 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  Hoàn tất
                </button>
              </div>
            )}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
