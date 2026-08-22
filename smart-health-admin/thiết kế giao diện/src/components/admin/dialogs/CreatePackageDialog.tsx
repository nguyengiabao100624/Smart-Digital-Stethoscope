import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Clock, DollarSign, Loader2, Package, X } from "lucide-react";
import { toast } from "sonner";
import { smartHealthApi, type SmartHealthServicePackage } from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  createPackageOperationIdempotencyKey,
  packageIntentFingerprint,
  parsePackageMutationOutcome,
  type PackageMutationIntent,
} from "@/lib/package-operations";

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
  { id: "aiDiagnosis", label: "Hỗ trợ phân tích tín hiệu" },
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
  status: "active",
  features: {
    cloudStorage: true,
    analytics: false,
    aiDiagnosis: false,
    multiClinic: false,
    apiAccess: false,
    customReports: false,
  },
};

type PackageFormData = typeof defaultFormData;
type PackageFieldErrors = Partial<Record<keyof PackageFormData, string>>;

const numericFields: Array<{
  key:
    | "price"
    | "maxDevices"
    | "maxDoctors"
    | "maxPatients"
    | "storageGb"
    | "aiMonthly"
    | "retentionDays";
  label: string;
  integer?: boolean;
}> = [
  { key: "price", label: "Giá" },
  { key: "maxDevices", label: "Số thiết bị", integer: true },
  { key: "maxDoctors", label: "Số bác sĩ", integer: true },
  { key: "maxPatients", label: "Số hồ sơ/bệnh nhân", integer: true },
  { key: "storageGb", label: "Dung lượng" },
  { key: "aiMonthly", label: "Lượt phân tích", integer: true },
  { key: "retentionDays", label: "Số ngày lưu", integer: true },
];

function validatePackageForm(formData: PackageFormData) {
  const errors: PackageFieldErrors = {};
  const packageName = formData.packageName.trim();
  if (!packageName) errors.packageName = "Vui lòng nhập tên gói.";
  else if (packageName.length > 160) errors.packageName = "Tên gói tối đa 160 ký tự.";

  for (const field of numericFields) {
    if (formData.segment === "personal" && field.key === "maxDoctors") continue;
    const value = Number(formData[field.key]);
    if (!Number.isFinite(value) || value < 0) {
      errors[field.key] = `${field.label} phải là số không âm.`;
    } else if (field.integer && !Number.isInteger(value)) {
      errors[field.key] = `${field.label} phải là số nguyên.`;
    }
  }
  return errors;
}

function mutationIntent(formData: PackageFormData, packageId?: string): PackageMutationIntent {
  return {
    ...(packageId ? { id: packageId } : {}),
    name: formData.packageName.trim(),
    type: formData.packageType,
    segment: formData.segment,
    duration: formData.duration,
    status: formData.status,
    price: formData.price,
    maxDevices: formData.maxDevices,
    maxDoctors: formData.segment === "personal" ? "0" : formData.maxDoctors,
    maxPatients: formData.maxPatients,
    storageGb: formData.storageGb,
    aiMonthly: formData.aiMonthly,
    retentionDays: formData.retentionDays,
    features: formData.features,
  };
}

export function CreatePackageDialog({
  open,
  onOpenChange,
  onCreated,
  onSaved,
  packageToEdit,
}: CreatePackageDialogProps) {
  const [formData, setFormData] = useState(defaultFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<PackageFieldErrors>({});
  const initialFingerprintRef = React.useRef(
    packageIntentFingerprint(mutationIntent(defaultFormData)),
  );
  const idempotencyIntentRef = React.useRef<{ fingerprint: string; key: string } | null>(null);
  const isEditing = Boolean(packageToEdit?.id);

  useEffect(() => {
    if (!open) return;
    if (!packageToEdit) {
      setFormData(defaultFormData);
      setSubmitError("");
      setFieldErrors({});
      idempotencyIntentRef.current = null;
      initialFingerprintRef.current = packageIntentFingerprint(mutationIntent(defaultFormData));
      return;
    }
    const nextFormData: PackageFormData = {
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
      status: packageToEdit.status === "archived" ? "archived" : "active",
      features: {
        cloudStorage: Boolean(packageToEdit.features?.cloudStorage),
        analytics: Boolean(packageToEdit.features?.analytics),
        aiDiagnosis: Boolean(packageToEdit.features?.aiDiagnosis),
        multiClinic: Boolean(packageToEdit.features?.multiClinic),
        apiAccess: Boolean(packageToEdit.features?.apiAccess),
        customReports: Boolean(packageToEdit.features?.customReports),
      },
    };
    setFormData(nextFormData);
    setSubmitError("");
    setFieldErrors({});
    idempotencyIntentRef.current = null;
    initialFingerprintRef.current = packageIntentFingerprint(
      mutationIntent(nextFormData, packageToEdit.id),
    );
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
    setFieldErrors((current) => ({ ...current, segment: undefined, maxDoctors: undefined }));
    setSubmitError("");
  };

  const updateField = <Key extends keyof PackageFormData>(
    field: Key,
    value: PackageFormData[Key],
  ) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextFieldErrors = validatePackageForm(formData);
    setFieldErrors(nextFieldErrors);
    setSubmitError("");
    if (Object.keys(nextFieldErrors).length > 0) return;

    const intent = mutationIntent(formData, packageToEdit?.id);
    const fingerprint = packageIntentFingerprint(intent);
    if (!idempotencyIntentRef.current || idempotencyIntentRef.current.fingerprint !== fingerprint) {
      idempotencyIntentRef.current = {
        fingerprint,
        key: createPackageOperationIdempotencyKey(
          isEditing ? "update" : "create",
          packageToEdit?.id,
        ),
      };
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        packageName: formData.packageName.trim(),
        maxDoctors: formData.segment === "personal" ? "0" : formData.maxDoctors,
      };
      if (isEditing && packageToEdit?.id) {
        const response = await smartHealthApi.updatePackage(
          packageToEdit.id,
          payload,
          idempotencyIntentRef.current.key,
        );
        parsePackageMutationOutcome(response, "update", intent);
        toast.success("Đã cập nhật gói dịch vụ", {
          description: `Gói ${formData.packageName} đã được lưu vào backend.`,
        });
      } else {
        const response = await smartHealthApi.createPackage(
          payload,
          idempotencyIntentRef.current.key,
        );
        parsePackageMutationOutcome(response, "create", intent);
        toast.success("Đã tạo gói dịch vụ", {
          description: `Gói ${formData.packageName} đã được lưu vào backend.`,
        });
      }
      idempotencyIntentRef.current = null;
      await onCreated?.();
      await onSaved?.();
      onOpenChange(false);
    } catch (error) {
      const description = toVietnameseErrorMessage(error, "Vui lòng kiểm tra backend.");
      setSubmitError(description);
      toast.error(isEditing ? "Không thể cập nhật gói dịch vụ" : "Không thể tạo gói dịch vụ", {
        description,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentFingerprint = packageIntentFingerprint(mutationIntent(formData, packageToEdit?.id));
  const hasUnsavedChanges = currentFingerprint !== initialFingerprintRef.current;
  const handleOpenChange = (nextOpen: boolean) => {
    if (
      !nextOpen &&
      hasUnsavedChanges &&
      !isSubmitting &&
      typeof window !== "undefined" &&
      !window.confirm("Thay đổi chưa được lưu. Bạn có muốn đóng biểu mẫu không?")
    ) {
      return;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-black/50 motion-reduce:animate-none" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 motion-reduce:animate-none">
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
                  Thiết lập billing thủ công và giới hạn hiển thị cho workspace.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form method="post" onSubmit={handleSubmit} className="space-y-6 p-6">
            {submitError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <p className="font-semibold">Chưa thể lưu gói dịch vụ</p>
                <p className="mt-1">{submitError}</p>
              </div>
            ) : null}
            <section className="space-y-4">
              <h3 className="font-medium text-foreground">Thông tin cơ bản</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="package-name"
                  label="Tên gói"
                  required
                  error={fieldErrors.packageName}
                  className="sm:col-span-2"
                >
                  <input
                    id="package-name"
                    required
                    value={formData.packageName}
                    onChange={(e) => updateField("packageName", e.target.value)}
                    aria-invalid={Boolean(fieldErrors.packageName)}
                    aria-describedby={fieldErrors.packageName ? "package-name-error" : undefined}
                    placeholder="VD: Clinic Pro"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </Field>
                <Field id="package-type" label="Loại gói" required>
                  <select
                    id="package-type"
                    required
                    value={formData.packageType}
                    onChange={(e) => updateField("packageType", e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="trial">Dùng thử</option>
                    <option value="basic">Cơ bản</option>
                    <option value="professional">Chuyên nghiệp</option>
                    <option value="enterprise">Doanh nghiệp</option>
                    <option value="custom">Tùy chỉnh</option>
                    <option value="solo">Bác sĩ tư</option>
                    <option value="personal">Cá nhân / gia đình</option>
                  </select>
                </Field>
                <Field id="package-segment" label="Phân khúc khách hàng" required>
                  <select
                    id="package-segment"
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
                <Field
                  id="package-duration"
                  label="Chu kỳ thanh toán"
                  required
                  icon={<Clock className="h-4 w-4" />}
                >
                  <select
                    id="package-duration"
                    required
                    value={formData.duration}
                    onChange={(e) => updateField("duration", e.target.value)}
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring"
                  >
                    <option value="monthly">Hằng tháng</option>
                    <option value="quarterly">Hằng quý</option>
                    <option value="yearly">Hằng năm</option>
                  </select>
                </Field>
                <Field
                  id="package-price"
                  label="Giá"
                  required
                  error={fieldErrors.price}
                  icon={<DollarSign className="h-4 w-4" />}
                >
                  <input
                    id="package-price"
                    required
                    type="number"
                    min="0"
                    value={formData.price}
                    onChange={(e) => updateField("price", e.target.value)}
                    aria-invalid={Boolean(fieldErrors.price)}
                    aria-describedby={fieldErrors.price ? "package-price-error" : undefined}
                    placeholder="0"
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-14 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    VND
                  </span>
                </Field>
                {isEditing ? (
                  <Field id="package-status" label="Trạng thái" required>
                    <select
                      id="package-status"
                      required
                      value={formData.status}
                      onChange={(e) => updateField("status", e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                    >
                      <option value="active">Đang hoạt động</option>
                      <option value="archived">Đã lưu trữ</option>
                    </select>
                  </Field>
                ) : null}
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-4">
              <h3 className="font-medium text-foreground">Giới hạn sử dụng</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <NumberField
                  id="package-max-devices"
                  label="Thiết bị kích hoạt"
                  value={formData.maxDevices}
                  error={fieldErrors.maxDevices}
                  onChange={(value) => updateField("maxDevices", value)}
                />
                {formData.segment !== "personal" && (
                  <NumberField
                    id="package-max-doctors"
                    label="Số bác sĩ"
                    value={formData.maxDoctors}
                    error={fieldErrors.maxDoctors}
                    onChange={(value) => updateField("maxDoctors", value)}
                  />
                )}
                <NumberField
                  id="package-max-patients"
                  label={formData.segment === "personal" ? "Hồ sơ gia đình" : "Bệnh nhân theo dõi"}
                  value={formData.maxPatients}
                  error={fieldErrors.maxPatients}
                  onChange={(value) => updateField("maxPatients", value)}
                />
                <NumberField
                  id="package-storage"
                  label="Dung lượng GB"
                  value={formData.storageGb}
                  error={fieldErrors.storageGb}
                  onChange={(value) => updateField("storageGb", value)}
                />
                <NumberField
                  id="package-ai-monthly"
                  label="Lượt phân tích/tháng"
                  value={formData.aiMonthly}
                  error={fieldErrors.aiMonthly}
                  onChange={(value) => updateField("aiMonthly", value)}
                />
                <NumberField
                  id="package-retention-days"
                  label="Thời hạn hiển thị (ngày)"
                  value={formData.retentionDays}
                  error={fieldErrors.retentionDays}
                  onChange={(value) => updateField("retentionDays", value)}
                />
              </div>
            </section>

            <section className="space-y-4 border-t border-border pt-4">
              <div>
                <h3 className="font-medium text-foreground">Nãn tính năng</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Dùng để mô tả gói trong billing; không tự bật provider, cấp quyền hay thay thế xác
                  nhận lâm sàng.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {featureOptions.map((feature) => (
                  <label
                    key={feature.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/50 motion-reduce:transition-none"
                  >
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
                <button
                  type="button"
                  className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted motion-reduce:transition-none"
                >
                  Hủy
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 motion-reduce:transition-none disabled:opacity-60"
              >
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                )}
                {isEditing ? "Lưu thay đổi" : "Tạo gói dịch vụ"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NumberField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <input
        id={id}
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
      />
    </Field>
  );
}

function Field({
  id,
  label,
  required,
  icon,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
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
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
