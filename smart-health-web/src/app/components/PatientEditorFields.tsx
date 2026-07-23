import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import type { PatientFormData } from "../../lib/patient-form";

type PatientEditorFieldsProps = {
  form: PatientFormData;
  errors: Partial<Record<keyof PatientFormData, string>>;
  disabled?: boolean;
  onChange: (field: keyof PatientFormData, value: string) => void;
};

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

export function PatientEditorFields({
  form,
  errors,
  disabled = false,
  onChange,
}: PatientEditorFieldsProps) {
  return (
    <div className="space-y-6">
      <fieldset disabled={disabled} className="space-y-4">
        <legend className="text-sm font-semibold text-foreground">
          Thông tin định danh
        </legend>
        <p className="text-xs leading-5 text-muted-foreground">
          Mã hồ sơ dùng để hiển thị. ID hệ thống luôn do backend quản lý riêng.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            id="patient-name"
            label="Họ và tên"
            required
            error={errors.name}
            className="md:col-span-2"
          >
            <Input
              id="patient-name"
              name="name"
              autoComplete="name"
              value={form.name}
              onChange={(event) => onChange("name", event.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "patient-name-error" : undefined}
            />
          </FormField>
          <FormField
            id="patient-code"
            label="Mã hồ sơ"
            error={errors.patientCode}
          >
            <Input
              id="patient-code"
              name="patientCode"
              value={form.patientCode}
              onChange={(event) => onChange("patientCode", event.target.value)}
              placeholder="Để trống để backend cấp mã"
            />
          </FormField>
          <FormField
            id="patient-dob"
            label="Ngày sinh"
            required
            error={errors.dateOfBirth}
          >
            <Input
              id="patient-dob"
              name="dateOfBirth"
              type="date"
              required
              value={form.dateOfBirth}
              onChange={(event) => onChange("dateOfBirth", event.target.value)}
              aria-invalid={Boolean(errors.dateOfBirth)}
              aria-describedby={
                errors.dateOfBirth ? "patient-dob-error" : undefined
              }
            />
          </FormField>
          <FormField
            id="patient-gender"
            label="Giới tính"
            required
            error={errors.gender}
          >
            <select
              id="patient-gender"
              name="gender"
              value={form.gender}
              onChange={(event) => onChange("gender", event.target.value)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-11 w-full rounded-md border px-3 text-sm text-foreground outline-none focus-visible:ring-[3px]"
            >
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác</option>
            </select>
          </FormField>
          <FormField
            id="patient-blood-type"
            label="Nhóm máu"
            error={errors.bloodType}
          >
            <select
              id="patient-blood-type"
              name="bloodType"
              value={form.bloodType}
              onChange={(event) => onChange("bloodType", event.target.value)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-11 w-full rounded-md border px-3 text-sm text-foreground outline-none focus-visible:ring-[3px]"
            >
              <option value="">Chưa xác định</option>
              {BLOOD_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </fieldset>

      <fieldset
        disabled={disabled}
        className="space-y-4 border-t border-border pt-5"
      >
        <legend className="text-sm font-semibold text-foreground">
          Liên hệ
        </legend>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            id="patient-phone"
            label="Số điện thoại"
            required
            error={errors.phone}
          >
            <Input
              id="patient-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              value={form.phone}
              onChange={(event) => onChange("phone", event.target.value)}
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={
                errors.phone ? "patient-phone-error" : undefined
              }
            />
          </FormField>
          <FormField id="patient-email" label="Email" error={errors.email}>
            <Input
              id="patient-email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => onChange("email", event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? "patient-email-error" : undefined
              }
            />
          </FormField>
          <FormField
            id="patient-address"
            label="Địa chỉ"
            error={errors.address}
            className="md:col-span-2"
          >
            <Textarea
              id="patient-address"
              name="address"
              rows={2}
              value={form.address}
              onChange={(event) => onChange("address", event.target.value)}
            />
          </FormField>
        </div>
      </fieldset>

      <fieldset
        disabled={disabled}
        className="space-y-4 border-t border-border pt-5"
      >
        <legend className="text-sm font-semibold text-foreground">
          An toàn và liên hệ khẩn cấp
        </legend>
        <FormField
          id="patient-allergies"
          label="Dị ứng"
          error={errors.allergies}
        >
          <Textarea
            id="patient-allergies"
            name="allergies"
            rows={2}
            value={form.allergies}
            onChange={(event) => onChange("allergies", event.target.value)}
            placeholder="Phân tách bằng dấu phẩy hoặc xuống dòng"
          />
        </FormField>
        <div className="grid gap-4 lg:grid-cols-3">
          <FormField
            id="patient-emergency-name"
            label="Người liên hệ"
            error={errors.emergencyName}
          >
            <Input
              id="patient-emergency-name"
              name="emergencyName"
              value={form.emergencyName}
              onChange={(event) =>
                onChange("emergencyName", event.target.value)
              }
              aria-invalid={Boolean(errors.emergencyName)}
            />
          </FormField>
          <FormField
            id="patient-emergency-phone"
            label="Số khẩn cấp"
            error={errors.emergencyPhone}
          >
            <Input
              id="patient-emergency-phone"
              name="emergencyPhone"
              type="tel"
              value={form.emergencyPhone}
              onChange={(event) =>
                onChange("emergencyPhone", event.target.value)
              }
              aria-invalid={Boolean(errors.emergencyPhone)}
            />
          </FormField>
          <FormField
            id="patient-emergency-relationship"
            label="Mối quan hệ"
            error={errors.emergencyRelationship}
          >
            <Input
              id="patient-emergency-relationship"
              name="emergencyRelationship"
              value={form.emergencyRelationship}
              onChange={(event) =>
                onChange("emergencyRelationship", event.target.value)
              }
              aria-invalid={Boolean(errors.emergencyRelationship)}
            />
          </FormField>
        </div>
        <FormField
          id="patient-notes"
          label="Ghi chú hồ sơ"
          error={errors.notes}
        >
          <Textarea
            id="patient-notes"
            name="notes"
            rows={3}
            value={form.notes}
            onChange={(event) => onChange("notes", event.target.value)}
          />
        </FormField>
      </fieldset>
    </div>
  );
}

function FormField({
  id,
  label,
  required,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-2">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
