import React, { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Clock3, KeyRound, Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import {
  createDeviceOperationIdempotencyKey,
  DEVICE_ROTATION_STATUS_PRESENTATION,
  isDeviceRotationTerminal,
} from "@/lib/device-operations";
import {
  smartHealthApi,
  type SmartHealthDevice,
  type SmartHealthDeviceCredentialRotation,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";

interface RotateDeviceSecretDialogProps {
  device: SmartHealthDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRotated: (device: SmartHealthDevice) => void;
}

function wait(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Rotation polling aborted", "AbortError"));
      return;
    }
    const timeout = globalThis.setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timeout);
        reject(new DOMException("Rotation polling aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function RotateDeviceSecretDialog({
  device,
  open,
  onOpenChange,
  onRotated,
}: RotateDeviceSecretDialogProps) {
  const [rotation, setRotation] = useState<SmartHealthDeviceCredentialRotation | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const idempotencyKeyRef = useRef("");
  const submitInFlightRef = useRef(false);
  const monitorAbortRef = useRef<AbortController | null>(null);
  const selectedDeviceRef = useRef(device);
  selectedDeviceRef.current = device;

  const stopMonitoring = () => {
    monitorAbortRef.current?.abort();
    monitorAbortRef.current = null;
    setIsMonitoring(false);
  };

  const reset = () => {
    stopMonitoring();
    setRotation(null);
    setError("");
    setIsSubmitting(false);
    submitInFlightRef.current = false;
    idempotencyKeyRef.current = "";
  };

  useEffect(() => {
    if (!open) {
      monitorAbortRef.current?.abort();
      monitorAbortRef.current = null;
      setIsMonitoring(false);
      setRotation(null);
      setError("");
      setIsSubmitting(false);
      idempotencyKeyRef.current = "";
      return;
    }
    setRotation(selectedDeviceRef.current?.credentialRotation ?? null);
    setError("");
    return () => monitorAbortRef.current?.abort();
    // Reset only when the selected device/dialog changes, not on each polling update.
  }, [open, device?.id]);

  const monitorRotation = async (deviceId: string) => {
    stopMonitoring();
    const controller = new AbortController();
    monitorAbortRef.current = controller;
    setIsMonitoring(true);
    try {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        await wait(1_200, controller.signal);
        const result = await smartHealthApi.getDevice(deviceId, controller.signal);
        onRotated(result.device);
        const latest = result.device.credentialRotation;
        if (!latest) continue;
        setRotation(latest);
        if (isDeviceRotationTerminal(latest.state)) {
          idempotencyKeyRef.current = "";
        }
        if (latest.state === "confirmed") {
          toast.success("Credential mới đã được thiết bị xác nhận", {
            description: "Backend đã thu hồi credential cũ sau reconnect được xác thực.",
          });
          return;
        }
        if (isDeviceRotationTerminal(latest.state)) {
          setError(DEVICE_ROTATION_STATUS_PRESENTATION[latest.state].detail);
          return;
        }
      }
      toast.info("Thiết bị vẫn đang hoàn tất xoay credential", {
        description:
          "Bạn có thể đóng hộp thoại; trạng thái backend vẫn được giữ và không báo thành công sớm.",
      });
    } catch (caughtError) {
      if ((caughtError as Error)?.name !== "AbortError") {
        setError(
          toVietnameseErrorMessage(caughtError, "Không thể cập nhật trạng thái xoay credential."),
        );
      }
    } finally {
      if (monitorAbortRef.current === controller) monitorAbortRef.current = null;
      setIsMonitoring(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && submitInFlightRef.current) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!device || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setError("");
    setIsSubmitting(true);
    const operationKey =
      idempotencyKeyRef.current || createDeviceOperationIdempotencyKey("rotate-secret", device.id);
    idempotencyKeyRef.current = operationKey;
    try {
      const result = await smartHealthApi.rotateDeviceSecret(device.id, operationKey);
      setRotation(result.rotation);
      onRotated(result.device);
      toast.info("Đã bắt đầu xoay credential", {
        description: "Đang chờ thiết bị lưu candidate và reconnect bằng credential mới.",
      });
      void monitorRotation(device.id);
    } catch (caughtError) {
      setError(
        toVietnameseErrorMessage(caughtError, "Không thể bắt đầu xoay credential thiết bị."),
      );
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const presentation = rotation ? DEVICE_ROTATION_STATUS_PRESENTATION[rotation.state] : null;
  const active = rotation && !isDeviceRotationTerminal(rotation.state);

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95"
          onEscapeKeyDown={(event) => {
            if (submitInFlightRef.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (submitInFlightRef.current) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (submitInFlightRef.current) event.preventDefault();
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border p-6">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">
                  Xoay credential thiết bị
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                  {device ? `Thiết bị ${device.name || device.id}` : "Thiết bị đã chọn"}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              aria-label="Đóng hộp thoại"
              disabled={isSubmitting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <form method="post" onSubmit={handleSubmit} className="space-y-5 p-6">
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-foreground">
                    Không nhập hoặc hiển thị credential mới
                  </p>
                  <p className="text-muted-foreground">
                    Backend tự tạo candidate, chỉ lưu verification material và bọc candidate theo
                    phiên WSS đã xác thực. Credential cũ chỉ bị thu hồi sau khi thiết bị reconnect
                    thành công bằng candidate.
                  </p>
                </div>
              </div>
            </div>

            {presentation && rotation ? (
              <div className="rounded-lg border border-border bg-background p-4" aria-live="polite">
                <div className="flex items-start gap-3">
                  {rotation.state === "confirmed" ? (
                    <ShieldCheck
                      className="mt-0.5 h-5 w-5 shrink-0 text-success"
                      aria-hidden="true"
                    />
                  ) : (
                    <Clock3
                      className={`mt-0.5 h-5 w-5 shrink-0 ${presentation.tone}`}
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${presentation.tone}`}>
                      {presentation.label}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{presentation.detail}</p>
                    {rotation.expiresAt && active ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Hết hạn: {new Date(rotation.expiresAt).toLocaleString("vi-VN")}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={isSubmitting}
                  className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Đóng
                </button>
              </Dialog.Close>
              {!active && rotation?.state !== "confirmed" ? (
                <button
                  type="submit"
                  disabled={!device || isSubmitting || isMonitoring || device?.online !== true}
                  className="min-h-11 rounded-md bg-warning px-4 py-2 text-sm font-semibold text-warning-foreground transition-colors hover:bg-warning/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Đang khởi tạo…
                    </span>
                  ) : (
                    "Bắt đầu xoay credential"
                  )}
                </button>
              ) : active ? (
                <button
                  type="button"
                  disabled={isMonitoring}
                  onClick={() => device && void monitorRotation(device.id)}
                  className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"
                >
                  {isMonitoring ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Đang chờ reconnect…
                    </span>
                  ) : (
                    "Cập nhật trạng thái"
                  )}
                </button>
              ) : null}
            </div>

            {device?.online !== true && !rotation ? (
              <p className="text-sm text-muted-foreground">
                Thiết bị phải online qua WSS đã xác thực trước khi bắt đầu.
              </p>
            ) : null}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
