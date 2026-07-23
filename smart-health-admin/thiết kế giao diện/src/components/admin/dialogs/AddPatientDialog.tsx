import React, { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Calendar,
  HeartPulse,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  smartHealthApi,
  type SmartHealthApiError,
  type SmartHealthPatient,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  parsePatientMutationOutcome,
  patientIntentFingerprint,
  resolvePatientOperationAttempt,
  type PatientMutationIntent,
  type PatientOperationAttempt,
} from "@/lib/patient-operations";
import { ConfirmActionDialog } from "../ConfirmActionDialog";

type PatientFormData = {
  name: string;
  patientCode: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  bloodType: string;
  allergies: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  notes: string;
};

interface AddPatientDialogProps {
  open: boolean;
  patient?: SmartHealthPatient | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (patient: SmartHealthPatient) => void | Promise<void>;
  onCreated?: () => void | Promise<void>;
}

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const CONTROL_CLASS =
  "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60";

function formFromPatient(patient?: SmartHealthPatient | null): PatientFormData {
  return {
    name: patient?.name || "",
    patientCode: patient?.patientCode || "",
    dateOfBirth: patient?.dateOfBirth || "",
    gender: patient?.gender || "male",
    phone: patient?.phone || "",
    email: patient?.email || "",
    address: patient?.address || "",
    bloodType: patient?.bloodType || "",
    allergies: patient?.allergies?.join(", ") || "",
    emergencyName: patient?.emergencyContact?.name || "",
    emergencyPhone: patient?.emergencyContact?.phone || "",
    emergencyRelationship: patient?.emergencyContact?.relationship || "",
    notes: patient?.notes || "",
  };
}

function splitAllergies(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function intentFromForm(form: PatientFormData, patientId?: string): PatientMutationIntent {
  return {
    patientId,
    name: form.name,
    patientCode: form.patientCode,
    dateOfBirth: form.dateOfBirth,
    gender: form.gender,
    phone: form.phone,
    email: form.email,
    address: form.address,
    bloodType: form.bloodType,
    allergies: splitAllergies(form.allergies),
    emergencyContact: {
      name: form.emergencyName,
      phone: form.emergencyPhone,
      relationship: form.emergencyRelationship,
    },
    notes: form.notes,
  };
}

function validateForm(form: PatientFormData) {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Vui lòng nhập họ và tên.";
  if (!form.dateOfBirth) {
    errors.dateOfBirth = "Vui lòng chọn ngày sinh.";
  } else {
    const parsed = new Date(`${form.dateOfBirth}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== form.dateOfBirth ||
      parsed.getTime() > Date.now()
    ) {
      errors.dateOfBirth = "Ngày sinh không hợp lệ hoặc nằm trong tương lai.";
    }
  }
  const phoneDigits = form.phone.replace(/\D/g, "");
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    errors.phone = "Số điện thoại cần từ 8 đến 15 chữ số.";
  }
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Email chưa đúng định dạng.";
  }
  const hasEmergencyContact = Boolean(
    form.emergencyName.trim() || form.emergencyPhone.trim() || form.emergencyRelationship.trim(),
  );
  if (hasEmergencyContact) {
    if (!form.emergencyName.trim()) errors.emergencyName = "Cần nhập tên người liên hệ.";
    if (form.emergencyPhone.replace(/\D/g, "").length < 8) {
      errors.emergencyPhone = "Số liên hệ khẩn cấp chưa hợp lệ.";
    }
    if (!form.emergencyRelationship.trim()) {
      errors.emergencyRelationship = "Cần ghi mối quan hệ với bệnh nhân.";
    }
  }
  return errors;
}

export function AddPatientDialog({
  open,
  patient,
  onOpenChange,
  onSaved,
  onCreated,
}: AddPatientDialogProps) {
  const editing = Boolean(patient?.id);
  const [form, setForm] = useState<PatientFormData>(() => formFromPatient(patient));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const initialFingerprintRef = useRef("");
  const attemptRef = useRef<PatientOperationAttempt | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const nextForm = formFromPatient(patient);
    setForm(nextForm);
    setFieldErrors({});
    setServerError("");
    setDiscardOpen(false);
    attemptRef.current = null;
    initialFingerprintRef.current = patientIntentFingerprint(intentFromForm(nextForm, patient?.id));
  }, [open, patient]);

  const currentIntent = intentFromForm(form, patient?.id);
  const isDirty = open && patientIntentFingerprint(currentIntent) !== initialFingerprintRef.current;

  const closeWithoutPrompt = () => {
    setDiscardOpen(false);
    onOpenChange(false);
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (isSubmitting) return;
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    closeWithoutPrompt();
  };

  const updateField = (field: keyof PatientFormData, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setServerError("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlightRef.current) return;
    const validationErrors = validateForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setServerError("Vui lòng kiểm tra các trường được đánh dấu.");
      return;
    }

    const intent = intentFromForm(form, patient?.id);
    const operation = editing ? "update" : "create";
    const attempt = resolvePatientOperationAttempt(attemptRef.current, operation, intent);
    attemptRef.current = attempt;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setServerError("");
    try {
      const payload = {
        name: intent.name.trim(),
        patientCode: intent.patientCode?.trim() || "",
        dateOfBirth: intent.dateOfBirth,
        gender: intent.gender,
        phone: intent.phone.trim(),
        email: intent.email?.trim() || "",
        address: intent.address?.trim() || "",
        bloodType: intent.bloodType?.trim() || "",
        allergies: intent.allergies,
        emergencyContact: intent.emergencyContact,
        notes: intent.notes?.trim() || "",
      };
      const response =
        editing && patient
          ? await smartHealthApi.updatePatient(patient.id, payload, attempt.idempotencyKey)
          : await smartHealthApi.createPatient(payload, attempt.idempotencyKey);
      const outcome = parsePatientMutationOutcome(response, intent);
      toast.success(editing ? "Đã cập nhật hồ sơ bệnh nhân" : "Đã tạo hồ sơ bệnh nhân", {
        description: `${outcome.patient.name || "Hồ sơ"} đã được backend xác nhận.`,
      });
      attemptRef.current = null;
      initialFingerprintRef.current = patientIntentFingerprint(intent);
      await onSaved?.(outcome.patient);
      await onCreated?.();
      closeWithoutPrompt();
    } catch (error) {
      const apiError = error as SmartHealthApiError;
      if (apiError.fieldErrors) setFieldErrors(apiError.fieldErrors);
      setServerError(
        toVietnameseErrorMessage(
          error,
          editing
            ? "Backend chưa xác nhận cập nhật hồ sơ. Bạn có thể thử gửi lại an toàn."
            : "Backend chưa xác nhận tạo hồ sơ. Bạn có thể thử gửi lại an toàn.",
        ),
      );
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={requestOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] animate-in bg-slate-950/45 fade-in motion-reduce:animate-none" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 motion-reduce:animate-none">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card p-5 sm:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <UserPlus className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Dialog.Title className="font-semibold text-foreground">
                    {editing ? "Chỉnh sửa hồ sơ bệnh nhân" : "Thêm hồ sơ bệnh nhân"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                    Dữ liệu chỉ được báo thành công sau khi backend trả đúng ID và nội dung vừa lưu.
                  </Dialog.Description>
                </div>
              </div>
              <button
                type="button"
                aria-label="Đóng trình chỉnh sửa hồ sơ"
                disabled={isSubmitting}
                onClick={() => requestOpenChange(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form method="post" onSubmit={handleSubmit} noValidate className="space-y-6 p-5 sm:p-6">
              {serverError ? (
                <div
                  role="alert"
                  className="flex gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              ) : null}

              <section aria-labelledby="patient-basic-heading" className="space-y-4">
                <div>
                  <h3 id="patient-basic-heading" className="font-semibold text-foreground">
                    Thông tin định danh
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mã hồ sơ dùng để hiển thị; ID hệ thống được backend quản lý riêng.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    id="patient-name"
                    label="Họ và tên"
                    required
                    error={fieldErrors.name}
                    className="sm:col-span-2"
                  >
                    <input
                      id="patient-name"
                      name="name"
                      autoComplete="name"
                      value={form.name}
                      onChange={(event) => updateField("name", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? "patient-name-error" : undefined}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field id="patient-code" label="Mã hồ sơ" error={fieldErrors.patientCode}>
                    <input
                      id="patient-code"
                      name="patientCode"
                      value={form.patientCode}
                      onChange={(event) => updateField("patientCode", event.target.value)}
                      placeholder="Để trống để backend cấp mã"
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field
                    id="patient-dob"
                    label="Ngày sinh"
                    required
                    error={fieldErrors.dateOfBirth}
                    icon={<Calendar className="h-4 w-4" />}
                  >
                    <input
                      id="patient-dob"
                      name="dateOfBirth"
                      required
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(event) => updateField("dateOfBirth", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.dateOfBirth)}
                      aria-describedby={fieldErrors.dateOfBirth ? "patient-dob-error" : undefined}
                      className={`${CONTROL_CLASS} pl-10`}
                    />
                  </Field>
                  <Field id="patient-gender" label="Giới tính" required error={fieldErrors.gender}>
                    <select
                      id="patient-gender"
                      name="gender"
                      required
                      value={form.gender}
                      onChange={(event) => updateField("gender", event.target.value)}
                      className={CONTROL_CLASS}
                    >
                      <option value="male">Nam</option>
                      <option value="female">Nữ</option>
                      <option value="other">Khác</option>
                    </select>
                  </Field>
                  <Field
                    id="patient-blood-type"
                    label="Nhóm máu"
                    error={fieldErrors.bloodType}
                    icon={<HeartPulse className="h-4 w-4" />}
                  >
                    <select
                      id="patient-blood-type"
                      name="bloodType"
                      value={form.bloodType}
                      onChange={(event) => updateField("bloodType", event.target.value)}
                      className={`${CONTROL_CLASS} pl-10`}
                    >
                      <option value="">Chưa xác định</option>
                      {BLOOD_TYPES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>

              <section
                aria-labelledby="patient-contact-heading"
                className="space-y-4 border-t border-border pt-5"
              >
                <h3 id="patient-contact-heading" className="font-semibold text-foreground">
                  Thông tin liên hệ
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    id="patient-phone"
                    label="Số điện thoại"
                    required
                    error={fieldErrors.phone}
                    icon={<Phone className="h-4 w-4" />}
                  >
                    <input
                      id="patient-phone"
                      name="phone"
                      required
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? "patient-phone-error" : undefined}
                      className={`${CONTROL_CLASS} pl-10`}
                    />
                  </Field>
                  <Field
                    id="patient-email"
                    label="Email"
                    error={fieldErrors.email}
                    icon={<Mail className="h-4 w-4" />}
                  >
                    <input
                      id="patient-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) => updateField("email", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? "patient-email-error" : undefined}
                      className={`${CONTROL_CLASS} pl-10`}
                    />
                  </Field>
                  <Field
                    id="patient-address"
                    label="Địa chỉ"
                    error={fieldErrors.address}
                    icon={<MapPin className="h-4 w-4" />}
                    className="sm:col-span-2"
                  >
                    <textarea
                      id="patient-address"
                      name="address"
                      value={form.address}
                      onChange={(event) => updateField("address", event.target.value)}
                      rows={2}
                      className={`${CONTROL_CLASS} min-h-24 resize-y pl-10`}
                    />
                  </Field>
                </div>
              </section>

              <section
                aria-labelledby="patient-clinical-heading"
                className="space-y-4 border-t border-border pt-5"
              >
                <h3 id="patient-clinical-heading" className="font-semibold text-foreground">
                  Thông tin an toàn và liên hệ khẩn cấp
                </h3>
                <Field id="patient-allergies" label="Dị ứng" error={fieldErrors.allergies}>
                  <textarea
                    id="patient-allergies"
                    name="allergies"
                    value={form.allergies}
                    onChange={(event) => updateField("allergies", event.target.value)}
                    placeholder="Phân tách bằng dấu phẩy hoặc xuống dòng"
                    rows={2}
                    className={`${CONTROL_CLASS} min-h-24 resize-y`}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field
                    id="patient-emergency-name"
                    label="Người liên hệ"
                    error={fieldErrors.emergencyName}
                  >
                    <input
                      id="patient-emergency-name"
                      name="emergencyName"
                      value={form.emergencyName}
                      onChange={(event) => updateField("emergencyName", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.emergencyName)}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field
                    id="patient-emergency-phone"
                    label="Số khẩn cấp"
                    error={fieldErrors.emergencyPhone}
                  >
                    <input
                      id="patient-emergency-phone"
                      name="emergencyPhone"
                      type="tel"
                      value={form.emergencyPhone}
                      onChange={(event) => updateField("emergencyPhone", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.emergencyPhone)}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field
                    id="patient-emergency-relationship"
                    label="Mối quan hệ"
                    error={fieldErrors.emergencyRelationship}
                  >
                    <input
                      id="patient-emergency-relationship"
                      name="emergencyRelationship"
                      value={form.emergencyRelationship}
                      onChange={(event) => updateField("emergencyRelationship", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.emergencyRelationship)}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                </div>
                <Field id="patient-notes" label="Ghi chú hồ sơ" error={fieldErrors.notes}>
                  <textarea
                    id="patient-notes"
                    name="notes"
                    value={form.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                    rows={3}
                    className={`${CONTROL_CLASS} min-h-28 resize-y`}
                  />
                </Field>
              </section>

              <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => requestOpenChange(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {isSubmitting ? "Đang chờ backend..." : editing ? "Lưu thay đổi" : "Tạo hồ sơ"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmActionDialog
        open={discardOpen}
        title="Bỏ các thay đổi chưa lưu?"
        description="Dữ liệu bạn vừa nhập chưa được gửi tới backend. Nếu rời đi, các thay đổi này sẽ mất."
        confirmLabel="Bỏ thay đổi"
        tone="warning"
        onOpenChange={setDiscardOpen}
        onConfirm={closeWithoutPrompt}
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
        {label} {required ? <span className="text-destructive">*</span> : null}
      </label>
      <div className="relative">
        {icon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground"
          >
            {icon}
          </span>
        ) : null}
        {children}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
