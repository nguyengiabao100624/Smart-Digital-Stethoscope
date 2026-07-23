import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, Globe, IdCard, Loader2, Mail, MapPin, Phone, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import {
  smartHealthApi,
  type SmartHealthApiError,
  type SmartHealthClinic,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  parseWorkspaceMutationOutcome,
  resolveWorkspaceOperationAttempt,
  type CanonicalWorkspace,
  type WorkspaceOperationAttempt,
} from "@/lib/workspace-operations";
import { ConfirmActionDialog } from "../ConfirmActionDialog";

type ClinicFormData = {
  name: string;
  workspaceType: string;
  type: string;
  legalName: string;
  representative: string;
  address: string;
  phone: string;
  email: string;
  website: string;
};

type ClinicField = keyof ClinicFormData;
type ClinicFieldErrors = Partial<Record<ClinicField, string>>;

interface AddClinicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
  onSaved?: (workspace: CanonicalWorkspace) => void;
  clinic?: SmartHealthClinic | null;
}

const emptyForm: ClinicFormData = {
  name: "",
  workspaceType: "clinic",
  type: "general",
  legalName: "",
  representative: "",
  address: "",
  phone: "",
  email: "",
  website: "",
};

const knownWorkspaceTypes = new Set(["hospital", "clinic", "solo_practice", "personal"]);
const knownClinicalTypes = new Set(["general", "cardiology", "respiratory", "pediatrics", "other"]);

function initialFormFor(clinic?: SmartHealthClinic | null): ClinicFormData {
  if (!clinic) return { ...emptyForm };
  return {
    name: clinic.name ?? "",
    workspaceType: clinic.workspaceType ?? "",
    type: clinic.type ?? "",
    legalName: clinic.legalName ?? "",
    representative: clinic.representative ?? "",
    address: clinic.address ?? "",
    phone: clinic.phone ?? "",
    email: clinic.email ?? "",
    website: clinic.website ?? "",
  };
}

function normalizeForm(form: ClinicFormData) {
  return {
    name: form.name.trim(),
    workspaceType: form.workspaceType.trim(),
    type: form.type.trim(),
    legalName: form.legalName.trim(),
    representative: form.representative.trim(),
    address: form.address.trim(),
    phone: form.phone.trim(),
    email: form.email.trim().toLowerCase(),
    website: form.website.trim(),
  };
}

function formFingerprint(form: ClinicFormData) {
  return JSON.stringify(normalizeForm(form));
}

function validateForm(form: ReturnType<typeof normalizeForm>): ClinicFieldErrors {
  const errors: ClinicFieldErrors = {};
  if (!form.name) errors.name = "Nhập tên workspace.";
  if (!knownWorkspaceTypes.has(form.workspaceType)) {
    errors.workspaceType = "Chọn loại workspace hợp lệ.";
  }
  if (!form.type) errors.type = "Chọn phân loại chuyên môn.";
  if (!form.address) errors.address = "Nhập địa chỉ hoạt động.";
  if (!form.phone) {
    errors.phone = "Nhập số điện thoại liên hệ.";
  } else if (!/^[+0-9().\s-]{8,24}$/.test(form.phone)) {
    errors.phone = "Số điện thoại không đúng định dạng.";
  }
  if (!form.email) {
    errors.email = "Nhập email liên hệ.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = "Email không đúng định dạng.";
  }
  if (form.website) {
    try {
      const url = new URL(form.website);
      if (!/^https?:$/.test(url.protocol)) errors.website = "Website phải dùng HTTP hoặc HTTPS.";
    } catch {
      errors.website = "Website không đúng định dạng URL.";
    }
  }
  return errors;
}

function apiFieldErrors(error: unknown): ClinicFieldErrors {
  const fields = (error as SmartHealthApiError | undefined)?.fieldErrors ?? {};
  const result: ClinicFieldErrors = {};
  for (const field of Object.keys(emptyForm) as ClinicField[]) {
    const message = fields[field] ?? (field === "name" ? fields.workspaceName : undefined);
    if (message) result[field] = message;
  }
  return result;
}

export function AddClinicDialog({
  open,
  onOpenChange,
  onCreated,
  onSaved,
  clinic,
}: AddClinicDialogProps) {
  const [formData, setFormData] = useState<ClinicFormData>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<ClinicFieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const initialFingerprintRef = useRef(formFingerprint(emptyForm));
  const attemptRef = useRef<WorkspaceOperationAttempt | null>(null);
  const isEditing = Boolean(clinic?.id);
  const currentFingerprint = useMemo(() => formFingerprint(formData), [formData]);
  const isDirty = currentFingerprint !== initialFingerprintRef.current;

  useEffect(() => {
    if (!open) return;
    const nextForm = initialFormFor(clinic);
    setFormData(nextForm);
    initialFingerprintRef.current = formFingerprint(nextForm);
    attemptRef.current = null;
    setFieldErrors({});
    setSubmitError("");
    setDiscardDialogOpen(false);
  }, [clinic, open]);

  const closeNow = () => {
    attemptRef.current = null;
    setDiscardDialogOpen(false);
    setFieldErrors({});
    setSubmitError("");
    onOpenChange(false);
  };

  const requestClose = () => {
    if (isSubmitting) return;
    if (isDirty) {
      setDiscardDialogOpen(true);
      return;
    }
    closeNow();
  };

  const updateField = (field: ClinicField, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const normalized = normalizeForm(formData);
    const validationErrors = validateForm(normalized);
    setFieldErrors(validationErrors);
    setSubmitError("");
    if (Object.keys(validationErrors).length > 0) return;

    if (isEditing && (!clinic?.version || !Number.isInteger(clinic.version))) {
      setSubmitError(
        "Backend chưa cung cấp version của workspace. Tải lại danh sách trước khi cập nhật.",
      );
      return;
    }

    const payload = {
      name: normalized.name,
      workspaceType: normalized.workspaceType,
      type: normalized.type,
      address: normalized.address,
      phone: normalized.phone,
      email: normalized.email,
      website: normalized.website,
      legalName: normalized.legalName,
      representative: normalized.representative,
    };
    const action = isEditing ? "update" : "create";
    const intent = isEditing
      ? {
          ...payload,
          workspaceId: clinic?.id,
          expectedVersion: clinic?.version,
        }
      : payload;
    const attempt = resolveWorkspaceOperationAttempt(attemptRef.current, action, intent);
    attemptRef.current = attempt;

    setIsSubmitting(true);
    try {
      const response = isEditing
        ? await smartHealthApi.updateClinic(
            clinic!.id,
            { ...payload, expectedVersion: clinic!.version! },
            attempt.idempotencyKey,
          )
        : await smartHealthApi.createClinic(payload, attempt.idempotencyKey);
      const outcome = parseWorkspaceMutationOutcome(response, action, intent);

      attemptRef.current = null;
      onSaved?.(outcome.workspace);
      void Promise.resolve(onCreated?.()).catch(() => undefined);
      toast.success(isEditing ? "Đã cập nhật workspace" : "Đã tạo workspace chờ duyệt", {
        description: isEditing
          ? `${outcome.workspace.name} đã được backend xác nhận ở version ${outcome.workspace.version}.`
          : `${outcome.workspace.name} đã được tạo ở trạng thái chờ duyệt.`,
      });
      closeNow();
    } catch (error) {
      setFieldErrors(apiFieldErrors(error));
      setSubmitError(
        toVietnameseErrorMessage(
          error,
          isEditing ? "Không thể cập nhật workspace." : "Không thể tạo workspace.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const unknownWorkspaceType =
    formData.workspaceType && !knownWorkspaceTypes.has(formData.workspaceType);
  const unknownClinicalType = formData.type && !knownClinicalTypes.has(formData.type);

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-slate-950/50 motion-reduce:animate-none" />
          <Dialog.Content
            onEscapeKeyDown={(event) => {
              if (isSubmitting) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (isSubmitting) event.preventDefault();
            }}
            className="fixed left-1/2 top-1/2 z-50 max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 motion-reduce:animate-none"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <Dialog.Title className="font-semibold text-foreground">
                    {isEditing ? "Chỉnh sửa workspace" : "Tạo workspace"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                    {isEditing
                      ? "Cập nhật đúng thông tin đang được backend quản lý."
                      : "Workspace mới bắt đầu ở trạng thái chờ duyệt."}
                  </Dialog.Description>
                </div>
              </div>
              <button
                type="button"
                onClick={requestClose}
                disabled={isSubmitting}
                aria-label="Đóng hộp thoại workspace"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form method="post" onSubmit={handleSubmit} noValidate className="space-y-6 p-5 sm:p-6">
              <section className="space-y-4" aria-labelledby="workspace-scope-heading">
                <div>
                  <h3 id="workspace-scope-heading" className="font-medium text-foreground">
                    Phạm vi workspace
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Loại workspace và phân loại chuyên môn là hai trường độc lập.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    id="workspace-name"
                    label="Tên hiển thị"
                    required
                    error={fieldErrors.name}
                    className="sm:col-span-2"
                  >
                    <input
                      id="workspace-name"
                      required
                      autoComplete="organization"
                      value={formData.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? "workspace-name-error" : undefined}
                      placeholder="Ví dụ: Phòng khám An Tâm"
                      className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field
                    id="workspace-type"
                    label="Loại workspace"
                    required
                    error={fieldErrors.workspaceType}
                  >
                    <select
                      id="workspace-type"
                      required
                      value={formData.workspaceType}
                      onChange={(event) => updateField("workspaceType", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.workspaceType)}
                      aria-describedby={
                        fieldErrors.workspaceType ? "workspace-type-error" : undefined
                      }
                      className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Chọn loại workspace</option>
                      {unknownWorkspaceType ? (
                        <option value={formData.workspaceType}>
                          Giá trị hiện tại: {formData.workspaceType}
                        </option>
                      ) : null}
                      <option value="hospital">Bệnh viện</option>
                      <option value="clinic">Phòng khám</option>
                      <option value="solo_practice">Bác sĩ tư</option>
                      <option value="personal">Cá nhân / gia đình</option>
                    </select>
                  </Field>
                  <Field
                    id="workspace-clinical-type"
                    label="Phân loại chuyên môn"
                    required
                    error={fieldErrors.type}
                  >
                    <select
                      id="workspace-clinical-type"
                      required
                      value={formData.type}
                      onChange={(event) => updateField("type", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.type)}
                      aria-describedby={
                        fieldErrors.type ? "workspace-clinical-type-error" : undefined
                      }
                      className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Chọn phân loại</option>
                      {unknownClinicalType ? (
                        <option value={formData.type}>Giá trị hiện tại: {formData.type}</option>
                      ) : null}
                      <option value="general">Đa khoa</option>
                      <option value="cardiology">Tim mạch</option>
                      <option value="respiratory">Hô hấp</option>
                      <option value="pediatrics">Nhi khoa</option>
                      <option value="other">Khác</option>
                    </select>
                  </Field>
                </div>
              </section>

              <section className="space-y-4" aria-labelledby="workspace-contact-heading">
                <div>
                  <h3 id="workspace-contact-heading" className="font-medium text-foreground">
                    Liên hệ và pháp lý
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Không dùng số điện thoại thay cho người đại diện pháp lý.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    id="workspace-legal-name"
                    label="Tên pháp lý"
                    error={fieldErrors.legalName}
                    icon={<IdCard className="h-4 w-4" />}
                  >
                    <input
                      id="workspace-legal-name"
                      value={formData.legalName}
                      onChange={(event) => updateField("legalName", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.legalName)}
                      aria-describedby={
                        fieldErrors.legalName ? "workspace-legal-name-error" : undefined
                      }
                      className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field
                    id="workspace-representative"
                    label="Người đại diện"
                    error={fieldErrors.representative}
                    icon={<UserRound className="h-4 w-4" />}
                  >
                    <input
                      id="workspace-representative"
                      autoComplete="name"
                      value={formData.representative}
                      onChange={(event) => updateField("representative", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.representative)}
                      aria-describedby={
                        fieldErrors.representative ? "workspace-representative-error" : undefined
                      }
                      className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field
                    id="workspace-address"
                    label="Địa chỉ"
                    required
                    error={fieldErrors.address}
                    icon={<MapPin className="h-4 w-4" />}
                    className="sm:col-span-2"
                  >
                    <input
                      id="workspace-address"
                      required
                      autoComplete="street-address"
                      value={formData.address}
                      onChange={(event) => updateField("address", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.address)}
                      aria-describedby={fieldErrors.address ? "workspace-address-error" : undefined}
                      className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field
                    id="workspace-phone"
                    label="Số điện thoại"
                    required
                    error={fieldErrors.phone}
                    icon={<Phone className="h-4 w-4" />}
                  >
                    <input
                      id="workspace-phone"
                      required
                      type="tel"
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? "workspace-phone-error" : undefined}
                      placeholder="0901 234 567"
                      className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field
                    id="workspace-email"
                    label="Email"
                    required
                    error={fieldErrors.email}
                    icon={<Mail className="h-4 w-4" />}
                  >
                    <input
                      id="workspace-email"
                      required
                      type="email"
                      autoComplete="email"
                      value={formData.email}
                      onChange={(event) => updateField("email", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? "workspace-email-error" : undefined}
                      placeholder="contact@clinic.vn"
                      className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field
                    id="workspace-website"
                    label="Website"
                    error={fieldErrors.website}
                    icon={<Globe className="h-4 w-4" />}
                    className="sm:col-span-2"
                  >
                    <input
                      id="workspace-website"
                      type="url"
                      autoComplete="url"
                      value={formData.website}
                      onChange={(event) => updateField("website", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.website)}
                      aria-describedby={fieldErrors.website ? "workspace-website-error" : undefined}
                      placeholder="https://clinic.vn"
                      className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                </div>
              </section>

              {submitError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {submitError}
                </div>
              ) : null}

              <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-3 border-t border-border bg-card px-5 py-4 sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={requestClose}
                  disabled={isSubmitting}
                  className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none sm:min-w-28"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 motion-reduce:transition-none sm:min-w-40"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {isSubmitting
                    ? "Đang chờ backend..."
                    : isEditing
                      ? "Lưu thay đổi"
                      : "Tạo workspace"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmActionDialog
        open={discardDialogOpen}
        onOpenChange={setDiscardDialogOpen}
        title="Thay đổi chưa được lưu"
        description="Bạn đã chỉnh sửa thông tin workspace. Nếu đóng bây giờ, các thay đổi chưa gửi sẽ bị mất."
        confirmLabel="Bỏ thay đổi"
        cancelLabel="Tiếp tục chỉnh sửa"
        tone="warning"
        onConfirm={closeNow}
      />
    </>
  );
}

function Field({
  id,
  label,
  required,
  icon,
  error,
  className = "",
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
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </label>
      {icon ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
          {children}
        </div>
      ) : (
        children
      )}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
