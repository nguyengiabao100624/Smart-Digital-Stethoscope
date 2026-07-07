import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Calendar, CreditCard, Loader2, Mail, MapPin, Phone, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { smartHealthApi } from "@/lib/smart-health-api";

type PatientFormData = {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  idNumber: string;
  bloodType: string;
  allergies: string;
};

interface AddPatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
}

const emptyForm: PatientFormData = {
  fullName: "",
  dateOfBirth: "",
  gender: "male",
  phone: "",
  email: "",
  address: "",
  idNumber: "",
  bloodType: "",
  allergies: "",
};

function calculateAge(dateOfBirth: string) {
  const date = new Date(dateOfBirth);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) age -= 1;
  return age;
}

export function AddPatientDialog({ open, onOpenChange, onCreated }: AddPatientDialogProps) {
  const [formData, setFormData] = useState<PatientFormData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await smartHealthApi.createPatient({
        name: formData.fullName,
        age: calculateAge(formData.dateOfBirth),
        gender: formData.gender,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        notes: [
          formData.idNumber ? `CCCD: ${formData.idNumber}` : "",
          formData.bloodType ? `Nhóm máu: ${formData.bloodType}` : "",
          formData.allergies ? `Dị ứng: ${formData.allergies}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
      toast.success("Đã tạo hồ sơ bệnh nhân", {
        description: `Hồ sơ của ${formData.fullName} đã được lưu.`,
      });
      await onCreated?.();
      onOpenChange(false);
      setFormData(emptyForm);
    } catch (error) {
      toast.error("Không thể tạo hồ sơ bệnh nhân", {
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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <UserPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">
                  Thêm hồ sơ bệnh nhân
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Tạo hồ sơ bệnh nhân và lưu vào backend Smart Health.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form method="post" onSubmit={handleSubmit} className="space-y-6 p-6">
            <section className="space-y-4">
              <h3 className="font-medium text-foreground">Thông tin cơ bản</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Họ và tên" required className="sm:col-span-2">
                  <input
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="VD: Nguyễn Văn An"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Ngày sinh" required icon={<Calendar className="h-4 w-4" />}>
                  <input
                    required
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Giới tính" required>
                  <select
                    required
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="male">Nam</option>
                    <option value="female">Nữ</option>
                    <option value="other">Khác</option>
                  </select>
                </Field>
                <Field label="Số CMND/CCCD" icon={<CreditCard className="h-4 w-4" />}>
                  <input
                    value={formData.idNumber}
                    onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                    placeholder="123456789"
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Nhóm máu">
                  <select
                    value={formData.bloodType}
                    onChange={(e) => setFormData({ ...formData, bloodType: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="">Chọn nhóm máu</option>
                    {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-4">
              <h3 className="font-medium text-foreground">Thông tin liên hệ</h3>
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
                <Field label="Email" icon={<Mail className="h-4 w-4" />}>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="patient@example.com"
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field
                  label="Địa chỉ"
                  className="sm:col-span-2"
                  icon={<MapPin className="h-4 w-4" />}
                >
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Địa chỉ nơi ở hiện tại"
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
              </div>
            </section>

            <Field label="Tiền sử dị ứng">
              <textarea
                value={formData.allergies}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                placeholder="Ghi chú thuốc hoặc chất gây dị ứng..."
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </Field>

            <div className="flex gap-3 pt-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Hủy
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Tạo hồ sơ
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
  className,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {icon ? (
        <div className="relative">
          <span className="absolute left-3 top-3 text-muted-foreground">{icon}</span>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
