import { useRef, useState } from "react";
import { Building2, FileCheck2, Stethoscope, UploadCloud } from "lucide-react";
import { Link } from "react-router";

import {
  AuthAlert,
  AuthField,
  AuthPageIntro,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthStepper,
  AuthSubmissionStatus,
  AuthUnsavedChangesGuard,
} from "../../components/auth/AuthPrimitives";
import {
  getSafeAuthErrorMessage,
  validateDoctorRegistrationStep,
  type AuthFieldErrors,
} from "../../auth/auth-form";
import { createFirebaseAccount } from "../../../lib/firebase-client";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { useSEO } from "@/lib/useSEO";

const steps = [
  "Tài khoản",
  "Mô hình hoạt động",
  "Chuyên môn",
  "Nơi làm việc",
  "Xác minh",
  "Xác nhận",
];

const acceptedDocumentTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maxDocumentSize = 10 * 1024 * 1024;

type DoctorForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  type: "private" | "clinic" | "";
  specialty: string;
  license: string;
  reason: string;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  facilitySearch: string;
  agreed: boolean;
};

const initialForm: DoctorForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  type: "",
  specialty: "",
  license: "",
  reason: "",
  clinicName: "",
  clinicAddress: "",
  clinicPhone: "",
  facilitySearch: "",
  agreed: false,
};

export default function RegisterDoctorPage() {
  useSEO({
    title: "Đăng ký bác sĩ | Shcare",
    description: "Gửi hồ sơ đăng ký bác sĩ để sử dụng Workspace Portal Shcare.",
    path: "/register",
  });

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<DoctorForm>(initialForm);
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionStage, setSubmissionStage] = useState("");
  const [done, setDone] = useState(false);
  const [verificationDelivery, setVerificationDelivery] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const checkpoint = useRef({
    idToken: "",
    authenticated: false,
    roleRequested: false,
    documentUploaded: false,
  });

  const update = <K extends keyof DoctorForm>(key: K, value: DoctorForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "", submit: "" }));
  };

  const dirty =
    !done &&
    !submitting &&
    (verificationFile !== null ||
      Object.entries(form).some(([key, value]) => key !== "agreed" && Boolean(value)) ||
      form.agreed);

  const validateCurrentStep = () => {
    const nextErrors = validateDoctorRegistrationStep(step, {
      ...form,
      verificationFile,
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitRegistration = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setVerificationDelivery(null);

    try {
      if (!checkpoint.current.idToken) {
        setSubmissionStage("Đang tạo tài khoản xác thực...");
        const account = await createFirebaseAccount(form.email.trim(), form.password);
        checkpoint.current.idToken = account.idToken;
      }

      if (!checkpoint.current.authenticated) {
        setSubmissionStage("Đang xác nhận tài khoản với Shcare...");
        await smartHealthApi.authenticateFirebase(checkpoint.current.idToken);
        checkpoint.current.authenticated = true;
      }

      if (!checkpoint.current.roleRequested) {
        setSubmissionStage("Đang gửi hồ sơ quyền bác sĩ...");
        await smartHealthApi.requestRole({
          requestedRole: "doctor",
          accountType: form.type === "private" ? "solo_doctor" : "doctor",
          workspaceType: form.type === "private" ? "solo_practice" : "clinic",
          name: form.name.trim(),
          phone: form.phone.trim(),
          specialty: form.specialty,
          license: form.license.trim(),
          reason: form.reason.trim(),
          clinicName: form.type === "private" ? form.clinicName.trim() : form.facilitySearch.trim(),
          hospital: form.type === "private" ? form.clinicName.trim() : form.facilitySearch.trim(),
        });
        checkpoint.current.roleRequested = true;
      }

      if (verificationFile && !checkpoint.current.documentUploaded) {
        setSubmissionStage("Đang tải tài liệu xác minh...");
        await smartHealthApi.uploadRoleRequestDocument(verificationFile);
        checkpoint.current.documentUploaded = true;
      }

      setSubmissionStage("Đang gửi email xác minh...");
      try {
        const delivery = await smartHealthApi.sendEmailVerification();
        setVerificationDelivery({
          ok: true,
          message:
            delivery.status === "verified"
              ? "Email đã được xác minh. Bạn có thể theo dõi trạng thái hồ sơ."
              : `Email xác minh đã được gửi đến ${delivery.email}.`,
        });
      } catch (_error) {
        setVerificationDelivery({
          ok: false,
          message:
            "Hồ sơ đã được tiếp nhận nhưng email xác minh chưa gửi được. Bạn có thể gửi lại ở bước xác minh email.",
        });
      }
      setDone(true);
    } catch (error) {
      setErrors({
        submit: getSafeAuthErrorMessage(error, "Không thể gửi hồ sơ bác sĩ. Vui lòng thử lại."),
      });
    } finally {
      setSubmitting(false);
      setSubmissionStage("");
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateCurrentStep()) return;
    if (step === steps.length - 1) {
      void submitRegistration();
      return;
    }
    setStep((current) => current + 1);
  };

  const selectVerificationFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setVerificationFile(null);
      return;
    }
    if (!acceptedDocumentTypes.has(file.type)) {
      setErrors((current) => ({
        ...current,
        file: "Tài liệu cần là PDF, JPG hoặc PNG.",
      }));
      event.target.value = "";
      return;
    }
    if (file.size > maxDocumentSize) {
      setErrors((current) => ({ ...current, file: "Tài liệu không được vượt quá 10 MB." }));
      event.target.value = "";
      return;
    }
    setVerificationFile(file);
    setErrors((current) => ({ ...current, file: "", submit: "" }));
  };

  if (done) {
    return (
      <section className="shc-auth-page shc-auth-complete">
        <AuthPageIntro
          icon={FileCheck2}
          title="Hồ sơ bác sĩ đã được tiếp nhận"
          description="Quyền bác sĩ chỉ được kích hoạt sau khi quản trị viên kiểm tra hồ sơ."
        />
        {verificationDelivery ? (
          <AuthAlert tone={verificationDelivery.ok ? "success" : "warning"}>
            {verificationDelivery.message}
          </AuthAlert>
        ) : null}
        <div className="shc-auth-next-steps" aria-label="Các bước tiếp theo">
          <h2>Tiếp theo</h2>
          <ol>
            <li>Xác minh địa chỉ email đăng nhập.</li>
            <li>Theo dõi trạng thái hồ sơ trên trang chờ duyệt.</li>
            <li>Đăng nhập lại sau khi quyền đã được phê duyệt.</li>
          </ol>
        </div>
        <div className="shc-auth-actions shc-auth-actions-stack">
          <Link className="shc-auth-primary-link" to="/xac-nhan-email">
            Mở trang xác minh email
          </Link>
          <Link className="shc-auth-text-link" to="/login">
            Về trang đăng nhập
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="shc-auth-page shc-auth-registration-page">
      <AuthUnsavedChangesGuard when={dirty} />
      <AuthPageIntro
        icon={Stethoscope}
        title="Đăng ký tài khoản bác sĩ"
        description="Cung cấp thông tin theo từng bước. Shcare chỉ cấp quyền sau khi hồ sơ được kiểm tra."
      />
      <AuthStepper steps={steps} current={step} />

      <form className="shc-auth-form" noValidate onSubmit={handleSubmit}>
        <div className="shc-auth-step-panel" key={step}>
          {step === 0 ? (
            <>
              <AuthField id="doctor-name" label="Họ và tên" required error={errors.name}>
                <input
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                />
              </AuthField>
              <AuthField id="doctor-email" label="Email đăng nhập" required error={errors.email}>
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                />
              </AuthField>
              <AuthField id="doctor-phone" label="Số điện thoại" required error={errors.phone}>
                <input
                  autoComplete="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => update("phone", event.target.value)}
                />
              </AuthField>
              <AuthField
                id="doctor-password"
                label="Mật khẩu"
                required
                hint="Dùng ít nhất 8 ký tự."
                error={errors.password}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => update("password", event.target.value)}
                />
              </AuthField>
              <AuthField
                id="doctor-password-confirmation"
                label="Xác nhận mật khẩu"
                required
                error={errors.confirmPassword}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(event) => update("confirmPassword", event.target.value)}
                />
              </AuthField>
            </>
          ) : null}

          {step === 1 ? (
            <fieldset className="shc-auth-fieldset" aria-describedby={errors.type ? "doctor-type-error" : undefined}>
              <legend>Mô hình hoạt động</legend>
              <p>Chọn mô hình phù hợp với công việc hiện tại.</p>
              <div className="shc-auth-choice-list">
                {[
                  {
                    value: "private" as const,
                    title: "Bác sĩ hành nghề độc lập",
                    description: "Tạo hồ sơ cho phòng khám hoặc hoạt động cá nhân.",
                  },
                  {
                    value: "clinic" as const,
                    title: "Bác sĩ thuộc cơ sở y tế",
                    description: "Yêu cầu quyền trong cơ sở đang làm việc.",
                  },
                ].map((option) => (
                  <label className="shc-auth-choice" data-selected={form.type === option.value} key={option.value}>
                    <input
                      type="radio"
                      name="doctor-registration-type"
                      value={option.value}
                      checked={form.type === option.value}
                      onChange={() => update("type", option.value)}
                    />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>
              {errors.type ? <p id="doctor-type-error" className="shc-auth-field-error" role="alert">{errors.type}</p> : null}
            </fieldset>
          ) : null}

          {step === 2 ? (
            <>
              <AuthField id="doctor-specialty" label="Chuyên khoa" required error={errors.specialty}>
                <select value={form.specialty} onChange={(event) => update("specialty", event.target.value)}>
                  <option value="">Chọn chuyên khoa</option>
                  {[
                    "Tim mạch",
                    "Hô hấp",
                    "Nội tổng quát",
                    "Nhi khoa",
                    "Lão khoa",
                    "Y học gia đình",
                    "Khác",
                  ].map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
                </select>
              </AuthField>
              <AuthField id="doctor-license" label="Mã chứng chỉ hành nghề" required error={errors.license}>
                <input value={form.license} onChange={(event) => update("license", event.target.value)} />
              </AuthField>
              <AuthField
                id="doctor-reason"
                label="Mục tiêu sử dụng"
                hint="Không nhập dữ liệu định danh hoặc thông tin sức khỏe của bệnh nhân."
              >
                <textarea rows={4} value={form.reason} onChange={(event) => update("reason", event.target.value)} />
              </AuthField>
            </>
          ) : null}

          {step === 3 ? (
            form.type === "private" ? (
              <>
                <AuthField id="doctor-clinic-name" label="Tên phòng khám" required error={errors.clinicName}>
                  <input value={form.clinicName} onChange={(event) => update("clinicName", event.target.value)} />
                </AuthField>
                <AuthField id="doctor-clinic-address" label="Địa chỉ" required error={errors.clinicAddress}>
                  <input autoComplete="street-address" value={form.clinicAddress} onChange={(event) => update("clinicAddress", event.target.value)} />
                </AuthField>
                <AuthField id="doctor-clinic-phone" label="Hotline phòng khám">
                  <input autoComplete="tel" inputMode="tel" value={form.clinicPhone} onChange={(event) => update("clinicPhone", event.target.value)} />
                </AuthField>
              </>
            ) : (
              <AuthField
                id="doctor-facility"
                label="Cơ sở y tế đang làm việc"
                required
                hint="Nhập tên đầy đủ để quản trị viên đối chiếu."
                error={errors.facilitySearch}
              >
                <input value={form.facilitySearch} onChange={(event) => update("facilitySearch", event.target.value)} />
              </AuthField>
            )
          ) : null}

          {step === 4 ? (
            <div className="shc-auth-upload-section">
              <div className="shc-auth-section-heading">
                <span aria-hidden="true"><UploadCloud size={20} /></span>
                <div>
                  <h2>Tài liệu xác minh</h2>
                  <p>Chọn một bản PDF, JPG hoặc PNG, tối đa 10 MB.</p>
                </div>
              </div>
              <label className="shc-auth-upload" data-selected={verificationFile ? "true" : undefined}>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  aria-describedby={errors.file ? "doctor-file-error" : "doctor-file-hint"}
                  aria-invalid={Boolean(errors.file)}
                  onChange={selectVerificationFile}
                />
                <UploadCloud size={26} aria-hidden="true" />
                <span>{verificationFile ? verificationFile.name : "Chọn tài liệu xác minh"}</span>
                <small id="doctor-file-hint">
                  {verificationFile ? "Tài liệu sẽ được tải lên khi bạn gửi hồ sơ." : "PDF, JPG hoặc PNG · tối đa 10 MB"}
                </small>
              </label>
              {errors.file ? <p id="doctor-file-error" className="shc-auth-field-error" role="alert">{errors.file}</p> : null}
            </div>
          ) : null}

          {step === 5 ? (
            <>
              <div className="shc-auth-review">
                <div className="shc-auth-section-heading">
                  <span aria-hidden="true"><Building2 size={20} /></span>
                  <div><h2>Kiểm tra hồ sơ</h2><p>Xác nhận thông tin trước khi gửi.</p></div>
                </div>
                <dl>
                  <div><dt>Người đăng ký</dt><dd>{form.name}</dd></div>
                  <div><dt>Email</dt><dd>{form.email}</dd></div>
                  <div><dt>Chuyên khoa</dt><dd>{form.specialty}</dd></div>
                  <div><dt>Nơi làm việc</dt><dd>{form.clinicName || form.facilitySearch}</dd></div>
                  <div><dt>Tài liệu</dt><dd>{verificationFile?.name}</dd></div>
                </dl>
              </div>
              <label className="shc-auth-checkbox" data-invalid={errors.agreed ? "true" : undefined}>
                <input type="checkbox" checked={form.agreed} onChange={(event) => update("agreed", event.target.checked)} />
                <span>
                  Tôi xác nhận thông tin là chính xác và đồng ý với{" "}
                  <Link target="_blank" rel="noreferrer" to="/dieu-khoan">điều khoản sử dụng</Link> và{" "}
                  <Link target="_blank" rel="noreferrer" to="/bao-mat">chính sách bảo mật</Link>.
                </span>
              </label>
              {errors.agreed ? <p className="shc-auth-field-error" role="alert">{errors.agreed}</p> : null}
            </>
          ) : null}
        </div>

        {errors.submit ? <AuthAlert tone="error">{errors.submit}</AuthAlert> : null}
        {submitting && submissionStage ? <AuthSubmissionStatus label={submissionStage} /> : null}

        <div className="shc-auth-actions">
          {step > 0 ? (
            <AuthSecondaryButton type="button" disabled={submitting} onClick={() => { setErrors({}); setStep((current) => current - 1); }}>
              Quay lại
            </AuthSecondaryButton>
          ) : (
            <Link className="shc-auth-text-link" to="/login">Đã có tài khoản?</Link>
          )}
          <AuthPrimaryButton type="submit" loading={submitting} loadingLabel="Đang gửi hồ sơ...">
            {step === steps.length - 1 ? "Gửi hồ sơ" : "Tiếp tục"}
          </AuthPrimaryButton>
        </div>
      </form>
    </section>
  );
}
