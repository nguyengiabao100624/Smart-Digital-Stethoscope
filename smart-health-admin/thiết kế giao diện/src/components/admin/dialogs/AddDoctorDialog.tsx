import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, Calendar, Loader2, Mail, Phone, Stethoscope, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { smartHealthApi, type SmartHealthClinic, type SmartHealthSpecialty } from "@/lib/smart-health-api";

type DoctorFormData = {
  fullName: string;
  specialty: string;
  clinic: string;
  phone: string;
  email: string;
  licenseNumber: string;
  startDate: string;
};

interface AddDoctorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
}

const emptyForm: DoctorFormData = {
  fullName: "",
  specialty: "",
  clinic: "",
  phone: "",
  email: "",
  licenseNumber: "",
  startDate: "",
};

export function AddDoctorDialog({ open, onOpenChange, onCreated }: AddDoctorDialogProps) {
  const [formData, setFormData] = useState<DoctorFormData>(emptyForm);
  const [clinics, setClinics] = useState<SmartHealthClinic[]>([]);
  const [specialties, setSpecialties] = useState<SmartHealthSpecialty[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.all([smartHealthApi.listCatalogClinics(), smartHealthApi.listSpecialties()])
      .then(([clinicResponse, specialtyResponse]) => {
        setClinics(clinicResponse.clinics);
        setSpecialties(specialtyResponse.specialties);
      })
      .catch((error) => {
        toast.error("Không thể tải danh mục", {
          description: error instanceof Error ? error.message : "Vui lòng kiểm tra backend.",
        });
      });
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const clinic = clinics.find((item) => item.id === formData.clinic);
      const specialty = specialties.find((item) => item.id === formData.specialty);
      await smartHealthApi.createDoctor({
        fullName: formData.fullName,
        phone: formData.phone,
        email: formData.email,
        licenseNumber: formData.licenseNumber,
        specialty: specialty?.name || formData.specialty,
        department: specialty?.name || formData.specialty,
        organizationId: clinic?.id || formData.clinic,
        clinicName: clinic?.name,
      });
      toast.success("Đã tạo tài khoản bác sĩ", {
        description: `BS. ${formData.fullName} đã được thêm vào hệ thống.`,
      });
      await onCreated?.();
      onOpenChange(false);
      setFormData(emptyForm);
    } catch (error) {
      toast.error("Không thể tạo bác sĩ", {
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
                <Dialog.Title className="font-semibold text-foreground">Thêm bác sĩ</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Tạo hồ sơ bác sĩ đã được duyệt trong hệ thống quản trị.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            <section className="space-y-4">
              <h3 className="font-medium text-foreground">Thông tin cá nhân</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Họ và tên" required className="sm:col-span-2">
                  <input
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="VD: Trần Văn Nam"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
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
                    placeholder="doctor@clinic.vn"
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-4">
              <h3 className="font-medium text-foreground">Thông tin chuyên môn</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Chuyên khoa" required icon={<Stethoscope className="h-4 w-4" />}>
                  <select
                    required
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Chọn chuyên khoa</option>
                    {specialties.map((specialty) => (
                      <option key={specialty.id} value={specialty.id}>
                        {specialty.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Số chứng chỉ hành nghề" required>
                  <input
                    required
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    placeholder="VD: 12345/BYT-CCHN"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Phòng khám" required icon={<Building2 className="h-4 w-4" />}>
                  <select
                    required
                    value={formData.clinic}
                    onChange={(e) => setFormData({ ...formData, clinic: e.target.value })}
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Chọn phòng khám</option>
                    {clinics.map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinic.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Ngày bắt đầu làm việc" icon={<Calendar className="h-4 w-4" />}>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
              </div>
            </section>

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
                Thêm bác sĩ
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
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
