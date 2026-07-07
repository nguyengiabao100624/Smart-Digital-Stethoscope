import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, Calendar, Hash, Loader2, Stethoscope, Wifi, X } from "lucide-react";
import { toast } from "sonner";
import { smartHealthApi } from "@/lib/smart-health-api";
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

export function AddDeviceDialog({ open, onOpenChange, onCreated }: AddDeviceDialogProps) {
  const [formData, setFormData] = useState<DeviceFormData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [claimCode, setClaimCode] = useState("");
  const { isPlatformAdmin } = useAdminAccess();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await smartHealthApi.createDeviceProvision({
        deviceId: formData.deviceId || undefined,
        name: formData.deviceName,
        organizationId: isPlatformAdmin ? formData.clinic || undefined : undefined,
      });
      setClaimCode(response.claim.claimCode);
      toast.success("Đã đăng ký thiết bị", {
        description: `Claim code: ${response.claim.claimCode}`,
      });
      await onCreated?.();
    } catch (error) {
      toast.error("Không thể đăng ký thiết bị", {
        description: error instanceof Error ? error.message : "Vui lòng kiểm tra backend.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeAndReset = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setFormData(emptyForm);
      setClaimCode("");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={closeAndReset}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Stethoscope className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">Thêm thiết bị</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Tạo thiết bị và claim code để ghép nối bằng QR hoặc nhập tay.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form method="post" onSubmit={handleSubmit} className="space-y-6 p-6">
            {claimCode && (
              <div className="rounded-lg border border-success/20 bg-success/10 p-4 text-sm text-success">
                <div className="font-semibold">Thiết bị đã được tạo</div>
                <div className="mt-1 font-mono text-base tracking-wide">
                  Claim code: {claimCode}
                </div>
              </div>
            )}

            <section className="space-y-4">
              <h3 className="font-medium text-foreground">Thông tin thiết bị</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Device ID" icon={<Hash className="h-4 w-4" />}>
                  <input
                    value={formData.deviceId}
                    onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                    placeholder="Tự sinh nếu bỏ trống"
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Tên thiết bị" required>
                  <input
                    required
                    value={formData.deviceName}
                    onChange={(e) => setFormData({ ...formData, deviceName: e.target.value })}
                    placeholder="VD: Stetho-AI Pro"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Loại thiết bị" required>
                  <select
                    required
                    value={formData.deviceType}
                    onChange={(e) => setFormData({ ...formData, deviceType: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="stethoscope">Ống nghe thông minh</option>
                    <option value="respiratory">Thiết bị hô hấp</option>
                    <option value="other">Khác</option>
                  </select>
                </Field>
                {isPlatformAdmin && (
                  <Field label="Workspace ID" icon={<Building2 className="h-4 w-4" />}>
                    <input
                      value={formData.clinic}
                      onChange={(e) => setFormData({ ...formData, clinic: e.target.value })}
                      placeholder="organizationId hoặc để trống"
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                )}
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-4">
              <h3 className="font-medium text-foreground">Thông tin kỹ thuật</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nhà sản xuất">
                  <input
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    placeholder="VD: Smart Health"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Model">
                  <input
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    placeholder="VD: SH-STETHO-X1"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Số serial">
                  <input
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    placeholder="VD: SN123456789"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Ngày mua" icon={<Calendar className="h-4 w-4" />}>
                  <input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
              </div>
            </section>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Wifi className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  QR/claim code chỉ chứa Device ID và claim code. Secret thiết bị sẽ do backend cấp
                  sau khi claim thành công.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Đóng
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
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
  label,
  required,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-foreground">
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
