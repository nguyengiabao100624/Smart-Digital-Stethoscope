import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, Globe, Loader2, Mail, MapPin, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { smartHealthApi, type SmartHealthClinic } from "@/lib/smart-health-api";

type ClinicFormData = {
  name: string;
  type: string;
  address: string;
  phone: string;
  email: string;
  website: string;
};

interface AddClinicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
  clinic?: SmartHealthClinic | null;
}

const emptyForm: ClinicFormData = {
  name: "",
  type: "general",
  address: "",
  phone: "",
  email: "",
  website: "",
};

export function AddClinicDialog({ open, onOpenChange, onCreated, clinic }: AddClinicDialogProps) {
  const [formData, setFormData] = useState<ClinicFormData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(clinic?.id);

  useEffect(() => {
    if (!open) return;
    setFormData(
      clinic
        ? {
            name: clinic.name || "",
            type: clinic.type || "general",
            address: clinic.address || "",
            phone: clinic.phone || "",
            email: clinic.email || "",
            website: clinic.website || "",
          }
        : emptyForm,
    );
  }, [clinic, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (clinic?.id) {
        await smartHealthApi.updateClinic(clinic.id, formData);
        toast.success("Đã cập nhật phòng khám", {
          description: `${formData.name} đã được lưu thay đổi.`,
        });
      } else {
        await smartHealthApi.createClinic(formData);
        toast.success("Đã tạo phòng khám", {
          description: `${formData.name} đã được thêm vào hệ thống.`,
        });
      }
      await onCreated?.();
      onOpenChange(false);
      setFormData(emptyForm);
    } catch (error) {
      toast.error(isEditing ? "Không thể cập nhật phòng khám" : "Không thể tạo phòng khám", {
        description: error instanceof Error ? error.message : "Vui lòng kiểm tra backend.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-border p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">
                  {isEditing ? "Chỉnh sửa phòng khám" : "Tạo phòng khám"}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  {isEditing ? "Cập nhật thông tin tổ chức hoặc cơ sở y tế." : "Nhập thông tin tổ chức hoặc cơ sở y tế."}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            <Field label="Tên phòng khám" required>
              <input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="VD: Phòng khám Đa khoa Tâm Anh"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </Field>

            <Field label="Loại hình" required>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              >
                <option value="hospital">Bệnh viện</option>
                <option value="clinic">Phòng khám</option>
                <option value="general">Đa khoa</option>
                <option value="cardiology">Chuyên khoa Tim mạch</option>
                <option value="respiratory">Chuyên khoa Hô hấp</option>
                <option value="pediatrics">Chuyên khoa Nhi</option>
                <option value="other">Khác</option>
              </select>
            </Field>

            <Field label="Địa chỉ" required icon={<MapPin className="h-4 w-4" />}>
              <input
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Địa chỉ chi tiết"
                className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Số điện thoại" required icon={<Phone className="h-4 w-4" />}>
                <input
                  required
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0901 234 567"
                  className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </Field>
              <Field label="Email" required icon={<Mail className="h-4 w-4" />}>
                <input
                  required
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contact@clinic.vn"
                  className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </Field>
            </div>

            <Field label="Website" icon={<Globe className="h-4 w-4" />}>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://clinic.vn"
                className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </Field>

            <div className="flex gap-3 pt-4">
              <Dialog.Close asChild>
                <button type="button" className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                  Hủy
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEditing ? "Lưu thay đổi" : "Tạo phòng khám"}
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
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
