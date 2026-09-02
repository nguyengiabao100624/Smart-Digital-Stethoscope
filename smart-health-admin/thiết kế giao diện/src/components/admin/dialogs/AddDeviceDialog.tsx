import React, { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect } from "react";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  Clipboard,
  Clock3,
  Download,
  Hash,
  Loader2,
  ShieldCheck,
  Stethoscope,
  Wifi,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { smartHealthApi, type SmartHealthDevice } from "@/lib/smart-health-api";
import {
  createProvisionArtifactFilename,
  getProvisionArtifactStatus,
  parseProvisionArtifact,
  serializeProvisionQrPayload,
  type DeviceProvisionArtifact,
} from "@/lib/device-provisioning";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { useAdminAccess } from "../useAdminAccess";

type DeviceFormData = {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  clinic: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
};

interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
  initialDevice?: SmartHealthDevice | null;
}

const emptyForm: DeviceFormData = {
  deviceId: "",
  deviceName: "",
  deviceType: "stethoscope",
  clinic: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  purchaseDate: "",
};

function createProvisionIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `device-provision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatProvisionExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function AddDeviceDialog({
  open,
  onOpenChange,
  onCreated,
  initialDevice = null,
}: AddDeviceDialogProps) {
  const [formData, setFormData] = useState<DeviceFormData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [provisionArtifact, setProvisionArtifact] = useState<DeviceProvisionArtifact | null>(null);
  const [artifactClock, setArtifactClock] = useState(() => Date.now());
  const [copiedField, setCopiedField] = useState<"device" | "claim" | "payload" | "">("");
  const [submitError, setSubmitError] = useState("");
  const submitInFlightRef = useRef<boolean>(false);
  const provisionIdempotencyKeyRef = useRef<string | null>(null);
  const qrRef = useRef<SVGSVGElement | null>(null);
  const { isPlatformAdmin } = useAdminAccess();
  const isExistingDeviceClaim = Boolean(initialDevice?.id);

  useEffect(() => {
    if (!open || !initialDevice) return;
    setFormData({
      deviceId: initialDevice.id,
      deviceName: initialDevice.name || "",
      deviceType: initialDevice.type || "stethoscope",
      clinic: initialDevice.organizationId || "",
      manufacturer: initialDevice.manufacturer || "",
      model: initialDevice.model || "",
      serialNumber: initialDevice.serialNumber || "",
      purchaseDate: initialDevice.purchaseDate || "",
    });
    setProvisionArtifact(null);
    setCopiedField("");
    setSubmitError("");
    provisionIdempotencyKeyRef.current = null;
  }, [initialDevice, open]);

  const isDismissBlocked = () => isSubmitting || submitInFlightRef.current;
  const updateFormData = (update: React.SetStateAction<DeviceFormData>) => {
    provisionIdempotencyKeyRef.current = null;
    setProvisionArtifact(null);
    setCopiedField("");
    setSubmitError("");
    setFormData(update);
  };

  useEffect(() => {
    if (!provisionArtifact) return undefined;
    setArtifactClock(Date.now());
    const timer = window.setInterval(() => setArtifactClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [provisionArtifact]);

  const copyArtifactValue = async (
    field: "device" | "claim" | "payload",
    value: string,
    label: string,
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? "" : current));
      }, 1_800);
      toast.success(`Đã sao chép ${label}`);
    } catch {
      toast.error(`Không thể sao chép ${label}`, {
        description: "Trình duyệt chưa cấp quyền clipboard. Hãy chọn và sao chép thủ công.",
      });
    }
  };

  const downloadProvisionQr = () => {
    if (!provisionArtifact || !qrRef.current) return;
    const serialized = new XMLSerializer().serializeToString(qrRef.current);
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = createProvisionArtifactFilename(provisionArtifact);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlightRef.current) return;

    setSubmitError("");
    submitInFlightRef.current = true;
    setIsSubmitting(true);
    setProvisionArtifact(null);
    setCopiedField("");

    const provisionIdempotencyKey =
      provisionIdempotencyKeyRef.current ??
      (provisionIdempotencyKeyRef.current = createProvisionIdempotencyKey());

    try {
      let response: Awaited<ReturnType<typeof smartHealthApi.createDeviceProvision>>;
      try {
        response = await smartHealthApi.createDeviceProvision(
          {
            deviceId: formData.deviceId,
            name: formData.deviceName,
            type: formData.deviceType,
            manufacturer: formData.manufacturer || undefined,
            model: formData.model || undefined,
            serialNumber: formData.serialNumber || undefined,
            purchaseDate: formData.purchaseDate || undefined,
            organizationId: isPlatformAdmin ? formData.clinic || undefined : undefined,
          },
          provisionIdempotencyKey,
        );
      } catch (error) {
        setSubmitError(toVietnameseErrorMessage(error, "Vui lòng kiểm tra kết nối rồi thử lại."));
        toast.error("Không thể đăng ký thiết bị", {
          description: toVietnameseErrorMessage(error, "Vui lòng kiểm tra backend."),
        });
        return;
      }

      let artifact: DeviceProvisionArtifact;
      try {
        artifact = parseProvisionArtifact(response);
      } catch (error) {
        const message = toVietnameseErrorMessage(
          error,
          "Backend trả về QR setup không đầy đủ. Không sử dụng artifact này.",
        );
        setSubmitError(message);
        toast.error("Thiết bị có thể đã được tạo nhưng QR không an toàn", {
          description: `${message} Thử lại cùng dữ liệu để kiểm tra kết quả idempotent.`,
        });
        return;
      }

      setProvisionArtifact(artifact);
      setArtifactClock(Date.now());
      provisionIdempotencyKeyRef.current = null;
      toast.success("Đã tạo QR claim", {
        description: "Tải hoặc bàn giao QR setup trước khi đóng hộp thoại.",
      });

      try {
        await onCreated?.();
      } catch (refreshError) {
        toast.error("Đã tạo thiết bị nhưng chưa làm mới danh sách", {
          description: toVietnameseErrorMessage(
            refreshError,
            "Thiết bị đã được tạo; hãy thử tải lại danh sách.",
          ),
        });
      }
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const closeAndReset = (nextOpen: boolean) => {
    if (!nextOpen && isDismissBlocked()) return;

    onOpenChange(nextOpen);
    if (!nextOpen) {
      provisionIdempotencyKeyRef.current = null;
      setFormData(emptyForm);
      setProvisionArtifact(null);
      setCopiedField("");
      setSubmitError("");
    }
  };

  const artifactStatus = provisionArtifact
    ? getProvisionArtifactStatus(provisionArtifact, artifactClock)
    : null;

  return (
    <Dialog.Root open={open} onOpenChange={closeAndReset}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-black/50 motion-reduce:animate-none" />
        <Dialog.Content
          aria-busy={isDismissBlocked()}
          onEscapeKeyDown={(event) => {
            if (isDismissBlocked()) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isDismissBlocked()) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (isDismissBlocked()) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 motion-reduce:animate-none"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Stethoscope className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">
                  {isExistingDeviceClaim ? "Tạo mã claim mới" : "Thêm thiết bị"}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  {isExistingDeviceClaim
                    ? "Cấp lại mã dùng một lần cho thiết bị đang chờ bàn giao."
                    : "Đăng ký thiết bị factory và cấp claim code một lần cho bác sĩ/workspace."}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              disabled={isDismissBlocked()}
              aria-label="Đóng hộp thoại thêm thiết bị"
              title={isExistingDeviceClaim ? "Đóng tạo mã claim" : undefined}
              className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form method="post" onSubmit={handleSubmit} className="space-y-6 p-6">
            {provisionArtifact && artifactStatus ? (
              <section
                role="status"
                aria-live="polite"
                aria-label="Artifact ghép thiết bị vừa tạo"
                className={`rounded-xl border p-4 sm:p-5 ${
                  artifactStatus === "expired"
                    ? "border-destructive/30 bg-destructive/5"
                    : artifactStatus === "expiring"
                      ? "border-warning/30 bg-warning/5"
                      : "border-success/30 bg-success/5"
                }`}
              >
                <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
                  <div className="min-w-0 space-y-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">Thiết bị đã được tạo</h3>
                        <span
                          className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-medium ${
                            artifactStatus === "expired"
                              ? "bg-destructive/10 text-destructive"
                              : artifactStatus === "expiring"
                                ? "bg-warning/10 text-warning-foreground"
                                : "bg-success/10 text-success"
                          }`}
                        >
                          {artifactStatus === "expired"
                            ? "Đã hết hạn"
                            : artifactStatus === "expiring"
                              ? "Sắp hết hạn"
                              : "Chỉ dùng nội bộ factory"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Đây là artifact factory một lần để xác minh và nạp thiết bị. Không gửi
                        Device ID, claim code hoặc QR này cho bác sĩ, bệnh nhân hay người dùng App.
                      </p>
                    </div>

                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">Device ID</dt>
                        <dd className="mt-1 flex min-w-0 items-center gap-2">
                          <code className="min-w-0 flex-1 break-all font-mono text-foreground">
                            {provisionArtifact.deviceId}
                          </code>
                          <button
                            type="button"
                            aria-label="Sao chép Device ID"
                            onClick={() =>
                              void copyArtifactValue(
                                "device",
                                provisionArtifact.deviceId,
                                "Device ID",
                              )
                            }
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                          >
                            {copiedField === "device" ? (
                              <Check className="h-4 w-4 text-success" />
                            ) : (
                              <Clipboard className="h-4 w-4" />
                            )}
                          </button>
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">Claim code</dt>
                        <dd className="mt-1 flex min-w-0 items-center gap-2">
                          <code className="min-w-0 flex-1 break-all font-mono text-foreground">
                            Claim code: {provisionArtifact.claimCode}
                          </code>
                          <button
                            type="button"
                            disabled={artifactStatus === "expired"}
                            aria-label="Sao chép claim code"
                            onClick={() =>
                              void copyArtifactValue(
                                "claim",
                                provisionArtifact.claimCode,
                                "claim code",
                              )
                            }
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {copiedField === "claim" ? (
                              <Check className="h-4 w-4 text-success" />
                            ) : (
                              <Clipboard className="h-4 w-4" />
                            )}
                          </button>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Trạng thái factory</dt>
                        <dd className="mt-1 font-mono text-foreground">
                          Đã xác minh danh tính thiết bị
                        </dd>
                        <dd className="mt-1 text-xs text-muted-foreground">
                          Claim code chỉ hiển thị một lần; không chứa device secret hoặc mật khẩu
                          Wi‑Fi
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Có hiệu lực đến</dt>
                        <dd className="mt-1 flex items-center gap-2 text-foreground">
                          <Clock3 className="h-4 w-4 text-muted-foreground" />
                          {formatProvisionExpiry(provisionArtifact.expiresAt)}
                        </dd>
                      </div>
                    </dl>

                    <div className="rounded-lg bg-background/80 p-3 text-sm leading-6 text-muted-foreground">
                      <div className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p>
                          Sau khi hoàn tất bước factory, đóng hộp thoại và mở đúng thiết bị trong
                          danh sách, rồi chọn “Tạo mã/QR truy cập”. Chỉ mã SHC/QR đó mới được bàn
                          giao cho người dùng; App và Portal không yêu cầu Device ID hay claim code
                          factory. Cấu hình Wi‑Fi tiếp tục dùng ESPTouch V2 Broadcast trong App.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={artifactStatus === "expired"}
                        onClick={() =>
                          void copyArtifactValue(
                            "payload",
                            serializeProvisionQrPayload(provisionArtifact),
                            "payload QR",
                          )
                        }
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {copiedField === "payload" ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Clipboard className="h-4 w-4" />
                        )}
                        Sao chép payload
                      </button>
                      <button
                        type="button"
                        disabled={artifactStatus === "expired"}
                        onClick={downloadProvisionQr}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Download className="h-4 w-4" />
                        Tải QR SVG
                      </button>
                    </div>
                  </div>

                  <div className="flex min-h-[220px] items-center justify-center rounded-lg bg-white p-3">
                    {artifactStatus === "expired" ? (
                      <div className="max-w-[180px] text-center text-sm text-destructive">
                        <AlertTriangle className="mx-auto mb-2 h-7 w-7" />
                        QR đã hết hạn và không còn được phép sử dụng.
                      </div>
                    ) : (
                      <QRCodeSVG
                        ref={qrRef}
                        value={serializeProvisionQrPayload(provisionArtifact)}
                        title={`QR setup thiết bị ${provisionArtifact.deviceId}`}
                        aria-label={`Quét để claim và setup thiết bị ${provisionArtifact.deviceId}`}
                        role="img"
                        size={196}
                        level="M"
                        marginSize={4}
                        bgColor="#FFFFFF"
                        fgColor="#0B1F33"
                      />
                    )}
                  </div>
                </div>
              </section>
            ) : null}

            {submitError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {submitError}
              </div>
            ) : null}

            <section className="space-y-4">
              <h3 className="font-medium text-foreground">Thông tin thiết bị</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="deviceId"
                  label="Device ID đã nạp tại factory"
                  required
                  icon={<Hash className="h-4 w-4" />}
                >
                  <input
                    id="deviceId"
                    name="deviceId"
                    required
                    readOnly={isExistingDeviceClaim}
                    value={formData.deviceId}
                    onChange={(e) => updateFormData({ ...formData, deviceId: e.target.value })}
                    placeholder="Quét hoặc nhập đúng ID trên nhãn thiết bị"
                    className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring read-only:cursor-not-allowed read-only:bg-muted"
                  />
                </Field>
                <Field id="deviceName" label="Tên thiết bị" required>
                  <input
                    id="deviceName"
                    name="deviceName"
                    required
                    value={formData.deviceName}
                    onChange={(e) => updateFormData({ ...formData, deviceName: e.target.value })}
                    placeholder="VD: Stetho-AI Pro"
                    className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field id="deviceType" label="Loại thiết bị" required>
                  <select
                    id="deviceType"
                    name="deviceType"
                    required
                    value={formData.deviceType}
                    onChange={(e) => updateFormData({ ...formData, deviceType: e.target.value })}
                    className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="stethoscope">Ống nghe thông minh</option>
                    <option value="respiratory">Thiết bị hô hấp</option>
                    <option value="other">Khác</option>
                  </select>
                </Field>
                {isPlatformAdmin && (
                  <Field
                    id="organizationId"
                    label="Workspace ID"
                    icon={<Building2 className="h-4 w-4" />}
                  >
                    <input
                      id="organizationId"
                      name="organizationId"
                      readOnly={isExistingDeviceClaim}
                      value={formData.clinic}
                      onChange={(e) => updateFormData({ ...formData, clinic: e.target.value })}
                      placeholder="organizationId hoặc để trống"
                      className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring read-only:cursor-not-allowed read-only:bg-muted"
                    />
                  </Field>
                )}
              </div>
            </section>

            <section className="space-y-2 border-t border-border pt-4">
              <h3 className="font-medium text-foreground">Credential thiết bị</h3>
              <p className="text-sm text-muted-foreground">
                Credential phải được nạp bằng quy trình factory bảo mật trước khi tạo QR claim.
                Admin không nhập, xem hoặc gửi raw device secret qua trình duyệt.
              </p>
            </section>

            <section className="space-y-4 border-t border-border pt-4">
              <h3 className="font-medium text-foreground">Thông tin kỹ thuật</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="manufacturer" label="Nhà sản xuất">
                  <input
                    id="manufacturer"
                    name="manufacturer"
                    value={formData.manufacturer}
                    onChange={(e) => updateFormData({ ...formData, manufacturer: e.target.value })}
                    placeholder="VD: Shcare"
                    className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field id="model" label="Model">
                  <input
                    id="model"
                    name="model"
                    value={formData.model}
                    onChange={(e) => updateFormData({ ...formData, model: e.target.value })}
                    placeholder="VD: SH-STETHO-X1"
                    className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field id="serialNumber" label="Số serial">
                  <input
                    id="serialNumber"
                    name="serialNumber"
                    value={formData.serialNumber}
                    onChange={(e) => updateFormData({ ...formData, serialNumber: e.target.value })}
                    placeholder="VD: SN123456789"
                    className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field id="purchaseDate" label="Ngày mua" icon={<Calendar className="h-4 w-4" />}>
                  <input
                    id="purchaseDate"
                    name="purchaseDate"
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => updateFormData({ ...formData, purchaseDate: e.target.value })}
                    className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
              </div>
            </section>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Wifi className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  QR factory này chứa Device ID và claim code nội bộ, không chứa device secret hay
                  mật khẩu Wi‑Fi. Không dùng QR này để cấp quyền người dùng; hãy tạo mã/QR truy cập
                  SHC từ dòng thiết bị sau khi hoàn tất.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={isDismissBlocked()}
                  className="min-h-11 flex-1 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  Đóng
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isDismissBlocked()}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none disabled:opacity-60"
              >
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                )}
                Tạo claim code
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  id,
  label,
  required,
  icon,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {icon ? (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
