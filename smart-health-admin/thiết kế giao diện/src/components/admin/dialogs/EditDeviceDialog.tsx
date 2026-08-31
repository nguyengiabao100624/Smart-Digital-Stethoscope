import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, PencilLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { smartHealthApi, type SmartHealthDevice } from "@/lib/smart-health-api";
import { createDeviceOperationIdempotencyKey } from "@/lib/device-operations";
import { toVietnameseErrorMessage } from "@/lib/error-messages";

type EditDeviceDialogProps = {
  device: SmartHealthDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (device: SmartHealthDevice) => void;
};

type DeviceMetadataDraft = {
  name: string;
  type: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  purchaseDate: string;
};

const EMPTY_DRAFT: DeviceMetadataDraft = {
  name: "",
  type: "stethoscope",
  manufacturer: "",
  model: "",
  serialNumber: "",
  purchaseDate: "",
};

function draftFromDevice(device: SmartHealthDevice | null): DeviceMetadataDraft {
  if (!device) return EMPTY_DRAFT;
  return {
    name: device.name || "",
    type: device.type || "stethoscope",
    manufacturer: device.manufacturer || "",
    model: device.model || "",
    serialNumber: device.serialNumber || "",
    purchaseDate: device.purchaseDate?.slice(0, 10) || "",
  };
}

const inputClassName =
  "mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors motion-reduce:transition-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function EditDeviceDialog({ device, open, onOpenChange, onUpdated }: EditDeviceDialogProps) {
  const [draft, setDraft] = useState<DeviceMetadataDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!open) {
      attemptRef.current = null;
      return;
    }
    attemptRef.current = null;
    setDraft(draftFromDevice(device));
    setError("");
  }, [device, open]);

  const updateField = (field: keyof DeviceMetadataDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!device || saving) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Tên thiết bị không được để trống.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        type: draft.type,
        manufacturer: draft.manufacturer.trim(),
        model: draft.model.trim(),
        serialNumber: draft.serialNumber.trim(),
        purchaseDate: draft.purchaseDate,
      };
      const fingerprint = JSON.stringify(payload);
      if (attemptRef.current?.fingerprint !== fingerprint) {
        attemptRef.current = {
          fingerprint,
          key: createDeviceOperationIdempotencyKey("metadata", device.id),
        };
      }
      const result = await smartHealthApi.patchDevice(device.id, payload, attemptRef.current.key);
      attemptRef.current = null;
      onUpdated(result.device);
      toast.success("Đã cập nhật thông tin thiết bị.");
      onOpenChange(false);
    } catch (submitError) {
      setError(
        toVietnameseErrorMessage(
          submitError,
          "Không thể cập nhật thông tin thiết bị. Vui lòng thử lại.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-slate-950/50 data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] max-h-[90vh] w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <PencilLine className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Chỉnh sửa thông tin thiết bị
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                  Cập nhật dữ liệu quản lý. Trạng thái kết nối, pin và telemetry chỉ do thiết bị báo
                  về nên không thể sửa tại đây.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={saving}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors motion-reduce:transition-none hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label="Đóng chỉnh sửa thiết bị"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <form className="mt-6 space-y-5" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-foreground sm:col-span-2">
                Tên thiết bị
                <input
                  name="name"
                  value={draft.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  maxLength={120}
                  required
                  disabled={saving}
                  className={inputClassName}
                  autoFocus
                />
              </label>

              <label className="text-sm font-medium text-foreground">
                Loại thiết bị
                <select
                  name="type"
                  value={draft.type}
                  onChange={(event) => updateField("type", event.target.value)}
                  disabled={saving}
                  className={inputClassName}
                >
                  <option value="stethoscope">Ống nghe thông minh</option>
                  <option value="respiratory">Thiết bị hô hấp</option>
                  <option value="other">Thiết bị khác</option>
                </select>
              </label>

              <label className="text-sm font-medium text-foreground">
                Nhà sản xuất
                <input
                  name="manufacturer"
                  value={draft.manufacturer}
                  onChange={(event) => updateField("manufacturer", event.target.value)}
                  maxLength={120}
                  disabled={saving}
                  className={inputClassName}
                />
              </label>

              <label className="text-sm font-medium text-foreground">
                Model
                <input
                  name="model"
                  value={draft.model}
                  onChange={(event) => updateField("model", event.target.value)}
                  maxLength={120}
                  disabled={saving}
                  className={inputClassName}
                />
              </label>

              <label className="text-sm font-medium text-foreground">
                Số serial
                <input
                  name="serialNumber"
                  value={draft.serialNumber}
                  onChange={(event) => updateField("serialNumber", event.target.value)}
                  maxLength={120}
                  disabled={saving}
                  className={inputClassName}
                  autoComplete="off"
                />
              </label>

              <label className="text-sm font-medium text-foreground sm:col-span-2">
                Ngày mua
                <input
                  name="purchaseDate"
                  type="date"
                  value={draft.purchaseDate}
                  onChange={(event) => updateField("purchaseDate", event.target.value)}
                  disabled={saving}
                  className={inputClassName}
                />
              </label>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-danger-text"
              >
                {error}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={saving}
                  className="min-h-11 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  Hủy
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={saving || !device}
                className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors motion-reduce:transition-none hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : null}
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
