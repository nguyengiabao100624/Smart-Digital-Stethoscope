import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Clock, DollarSign, Loader2, Package, X } from "lucide-react";
import { toast } from "sonner";
import { smartHealthApi, type SmartHealthServicePackage } from "@/lib/smart-health-api";

interface CreatePackageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
  onSaved?: () => void | Promise<void>;
  packageToEdit?: SmartHealthServicePackage | null;
}

const featureOptions = [
  { id: "cloudStorage", label: "Lưu trữ đám mây" },
  { id: "analytics", label: "Phân tích dữ liệu" },
  { id: "aiDiagnosis", label: "Hỗ trợ AI" },
  { id: "multiClinic", label: "Đa workspace" },
  { id: "apiAccess", label: "Truy cập API" },
  { id: "customReports", label: "Báo cáo tùy chỉnh" },
] as const;

const defaultFormData = {
  packageName: "",
  packageType: "basic",
  segment: "organization",
  price: "",
  duration: "monthly",
  maxDevices: "10",
  maxDoctors: "5",
  maxPatients: "1000",
  storageGb: "200",
  aiMonthly: "2000",
  retentionDays: "365",
  features: {
    cloudStorage: true,
    analytics: false,
    aiDiagnosis: false,
    multiClinic: false,
    apiAccess: false,
    customReports: false,
  },
};

export function CreatePackageDialog({
  open,
  onOpenChange,
  onCreated,
  onSaved,
  packageToEdit,
}: CreatePackageDialogProps) {
  const [formData, setFormData] = useState(defaultFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = Boolean(packageToEdit?.id);

  useEffect(() => {
    if (!open) return;
    if (!packageToEdit) {
      setFormData(defaultFormData);
      return;
    }
    setFormData({
      packageName: packageToEdit.name || "",
      packageType: packageToEdit.type || "basic",
      segment: packageToEdit.segment || "organization",
      price: String(packageToEdit.price ?? ""),
      duration: packageToEdit.duration || "monthly",
      maxDevices: String(packageToEdit.maxDevices ?? 0),
      maxDoctors: String(packageToEdit.maxDoctors ?? 0),
      maxPatients: String(packageToEdit.maxPatients ?? 0),
      storageGb: String(packageToEdit.storageGb ?? 0),
      aiMonthly: String(packageToEdit.aiMonthly ?? 0),
      retentionDays: String(packageToEdit.retentionDays ?? 0),
      features: {
        cloudStorage: Boolean(packageToEdit.features?.cloudStorage),
        analytics: Boolean(packageToEdit.features?.analytics),
        aiDiagnosis: Boolean(packageToEdit.features?.aiDiagnosis),
        multiClinic: Boolean(packageToEdit.features?.multiClinic),
        apiAccess: Boolean(packageToEdit.features?.apiAccess),
        customReports: Boolean(packageToEdit.features?.customReports),
      },
    });
  }, [open, packageToEdit]);

  const toggleFeature = (feature: keyof typeof formData.features) => {
    setFormData((current) => ({
      ...current,
      features: {
        ...current.features,
        [feature]: !current.features[feature],
      },
    }));
  };

  const handleSegmentChange = (segment: string) => {
    setFormData((current) => ({
      ...current,
      segment,
      maxDoctors:
        segment === "personal"
          ? "0"
          : current.maxDoctors === "0"
            ? defaultFormData.maxDoctors
            : current.maxDoctors,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (isEditing && packageToEdit?.id) {
        await smartHealthApi.updatePackage(packageToEdit.id, formData);
        toast.success("Đã cập nhật gói dịch vụ", {
          description: `Gói ${formData.packageName} đã được lưu vào backend.`,
        });
      } else {
        await smartHealthApi.createPackage(formData);
        toast.success("Đã tạo gói dịch vụ", {
          description: `Gói ${formData.packageName} đã được lưu vào backend.`,
        });
      }
      await onCreated?.();
      await onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(isEditing ? "Không thể cập nhật gói dịch vụ" : "Không thể tạo gói dịch vụ", {
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
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">
                  {isEditing ? "Cập nhật gói dịch vụ" : "Tạo gói dịch vụ"}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Thiết lập phân khúc, giới hạn thuê bao, lưu trữ, AI và retention.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            <section className="space-y-4">
              <h3 className="font-medium text-foreground">Thông tin cơ bản</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Tên gói" required className="sm:col-span-2">
                  <input
                    required
                    value={formData.packageName}
                    onChange={(e) => setFormData({ ...formData, packageName: e.target.value })}
                    placeholder="VD: Clinic Pro"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field label="Loại gói" required>
                  <select
                    required
                    value={formData.packageType}
                    onChange={(e) => setFormData({ ...formData, packageType: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="trial">Dùng thử</option>
                    <option value="basic">Cơ bản</option>
                    <option value="professional">Chuyên nghiệp</option>
                    <option value="enterprise">Doanh nghiệp</option>
                    <option value="custom">Tùy chỉnh</option>
                  </select>
                </Field>
                <Field label="Phân khúc khách hàng" required>
                  <select
                    required
                    value={formData.segment}
                    onChange={(e) => handleSegmentChange(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="organization">Bệnh viện / phòng khám</option>
                    <option value="solo_practice">Bác sĩ tư</option>
                    <option value="personal">Cá nhân / gia đình</option>
                  </select>
                </Field>
                <Field label="Chu kỳ thanh toán" required icon={<Clock className="h-4 w-4" />}>
                  <select
                    required
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="monthly">Hằng tháng</option>
                    <option value="quarterly">Hằng quý</option>
                    <option value="yearly">Hằng năm</option>
                  </select>
                </Field>
                <Field label="Giá" required icon={<DollarSign className="h-4 w-4" />}>
                  <input
                    required
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0"
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-14 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">VND</span>
                </Field>
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-4">
              <h3 className="font-medium text-foreground">Giới hạn sử dụng</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <NumberField label="Thiết bị kích hoạt" value={formData.maxDevices} onChange={(value) => setFormData({ ...formData, maxDevices: value })} />
                {formData.segment !== "personal" && (
                  <NumberField label="Số bác sĩ" value={formData.maxDoctors} onChange={(value) => setFormData({ ...formData, maxDoctors: value })} />
                )}
                <NumberField label={formData.segment === "personal" ? "Hồ sơ gia đình" : "Bệnh nhân theo dõi"} value={formData.maxPatients} onChange={(value) => setFormData({ ...formData, maxPatients: value })} />
                <NumberField label="Dung lượng GB" value={formData.storageGb} onChange={(value) => setFormData({ ...formData, storageGb: value })} />
                <NumberField label="Lượt AI/tháng" value={formData.aiMonthly} onChange={(value) => setFormData({ ...formData, aiMonthly: value })} />
                <NumberField label="Retention ngày" value={formData.retentionDays} onChange={(value) => setFormData({ ...formData, retentionDays: value })} />
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-4">
              <h3 className="font-medium text-foreground">Tính năng</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {featureOptions.map((feature) => (
                  <label key={feature.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={formData.features[feature.id]}
                      onChange={() => toggleFeature(feature.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{feature.label}</span>
                  </label>
                ))}
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
                {isEditing ? "Lưu thay đổi" : "Tạo gói dịch vụ"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      />
    </Field>
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
