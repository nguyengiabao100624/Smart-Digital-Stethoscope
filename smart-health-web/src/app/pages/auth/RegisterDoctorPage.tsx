import { useEffect, useRef, useState } from "react";
import {
  Building2,
  FileCheck2,
  Fingerprint,
  UploadCloud,
} from "lucide-react";
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
import {
  createFirebaseAccount,
  getCurrentFirebaseUid,
} from "../../../lib/firebase-client";
import {
  createRoleRequestIdempotencyKey,
  parseRoleRequestReceipt,
  type PublicClinicOption,
  type RoleRequestIntent,
} from "../../../lib/role-request-contract";
import {
  inspectRoleRequestDocument,
  parseRoleRequestDocumentReceipt,
  type RoleRequestDocumentIdentity,
} from "../../../lib/role-request-document-contract";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { useSEO } from "@/lib/useSEO";

const steps = [
  "Tài khoản",
  "Loại đăng ký",
  "Chuyên môn",
  "Nơi làm việc",
  "Chứng chỉ",
  "Xác nhận",
];

const acceptedDocumentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
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
  facilityId: string;
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
  facilityId: "",
  facilitySearch: "",
  agreed: false,
};

type RegistrationCheckpoint = {
  accountFingerprint: string;
  roleFingerprint: string;
  documentFingerprint: string;
  idToken: string;
  firebaseUid: string;
  authenticatedUserId: string;
  canonicalOrganizationId: string;
  authenticated: boolean;
  roleRequestKey: string;
  roleRequested: boolean;
  documentUploaded: boolean;
};

function emptyCheckpoint(accountFingerprint = ""): RegistrationCheckpoint {
  return {
    accountFingerprint,
    roleFingerprint: "",
    documentFingerprint: "",
    idToken: "",
    firebaseUid: "",
    authenticatedUserId: "",
    canonicalOrganizationId: "",
    authenticated: false,
    roleRequestKey: "",
    roleRequested: false,
    documentUploaded: false,
  };
}

function accountFingerprint(form: DoctorForm) {
  return JSON.stringify({
    email: form.email.trim().toLowerCase(),
    password: form.password,
  });
}

function buildRoleRequest(form: DoctorForm) {
  const clinicRequest = form.type === "clinic";
  const clinicName = clinicRequest
    ? form.facilitySearch.trim()
    : form.clinicName.trim();
  const intent: RoleRequestIntent = {
    requestedRole: "doctor",
    accountType: clinicRequest ? "doctor" : "solo_doctor",
    workspaceType: clinicRequest ? "clinic" : "solo_practice",
    ...(clinicRequest ? { organizationId: form.facilityId.trim() } : {}),
  };
  const payload = {
    ...intent,
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim().toLowerCase(),
    specialty: form.specialty.trim(),
    department: form.specialty.trim(),
    license: form.license.trim(),
    reason: form.reason.trim(),
    registrationReason: form.reason.trim(),
    clinicName,
    hospital: clinicName,
    ...(clinicRequest
      ? {}
      : {
          workspaceName: clinicName,
          address: form.clinicAddress.trim(),
        }),
  };
  return { intent, payload, fingerprint: JSON.stringify(payload) };
}

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
  const [verificationFileIdentity, setVerificationFileIdentity] =
    useState<RoleRequestDocumentIdentity | null>(null);
  const [verificationFileCheck, setVerificationFileCheck] = useState<
    "idle" | "checking" | "ready" | "error"
  >("idle");
  const [submitting, setSubmitting] = useState(false);
  const [identityLocked, setIdentityLocked] = useState(false);
  const [submissionStage, setSubmissionStage] = useState("");
  const [done, setDone] = useState(false);
  const [verificationDelivery, setVerificationDelivery] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [clinicCatalog, setClinicCatalog] = useState<PublicClinicOption[]>([]);
  const [clinicCatalogState, setClinicCatalogState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [clinicCatalogReload, setClinicCatalogReload] = useState(0);
  const checkpoint = useRef<RegistrationCheckpoint>(emptyCheckpoint());
  const fileCheckRequest = useRef(0);

  useEffect(() => {
    if (form.type !== "clinic") return;
    let cancelled = false;
    setClinicCatalogState("loading");
    void smartHealthApi
      .listPublicClinics()
      .then(({ clinics }) => {
        if (cancelled) return;
        if (!clinics.length) {
          setClinicCatalog([]);
          setClinicCatalogState("error");
          return;
        }
        setClinicCatalog(clinics);
        setClinicCatalogState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setClinicCatalog([]);
        setClinicCatalogState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [clinicCatalogReload, form.type]);

  const update = <K extends keyof DoctorForm>(key: K, value: DoctorForm[K]) => {
    if (
      identityLocked &&
      (key === "email" || key === "password" || key === "confirmPassword")
    ) {
      return;
    }
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "type" && value !== "clinic"
        ? { facilityId: "", facilitySearch: "" }
        : {}),
    }));
    setErrors((current) => ({ ...current, [key]: "", submit: "" }));
  };

  const selectFacility = (facilityId: string) => {
    const facility = clinicCatalog.find((item) => item.id === facilityId);
    setForm((current) => ({
      ...current,
      facilityId: facility?.id || "",
      facilitySearch: facility?.name || "",
    }));
    setErrors((current) => ({
      ...current,
      facilitySearch: "",
      submit: "",
    }));
  };

  const dirty =
    !done &&
    !submitting &&
    (verificationFile !== null ||
      Object.entries(form).some(
        ([key, value]) => key !== "agreed" && Boolean(value),
      ) ||
      form.agreed);

  const validateCurrentStep = () => {
    const nextErrors = validateDoctorRegistrationStep(step, {
      ...form,
      verificationFile,
    });
    if (step === 3 && form.type === "clinic" && !form.facilityId.trim()) {
      nextErrors.facilitySearch =
        "Vui lòng chọn cơ sở y tế từ danh mục đã được Shcare xác nhận.";
    }
    if (
      step === 4 &&
      verificationFile &&
      (verificationFileCheck !== "ready" || !verificationFileIdentity)
    ) {
      nextErrors.file =
        verificationFileCheck === "error"
          ? "Không thể kiểm tra nội dung tài liệu. Vui lòng chọn lại tệp."
          : "Đang kiểm tra nội dung tài liệu. Vui lòng đợi trong giây lát.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const clearCheckpointTokenIfStillOwned = () => {
    const current = checkpoint.current;
    if (!current.idToken) return false;
    return smartHealthApi.clearTokenIfMatches(current.idToken);
  };

  const invalidateCheckpointAuthority = () => {
    checkpoint.current.authenticated = false;
    checkpoint.current.authenticatedUserId = "";
  };

  const assertFirebaseOwner = (message: string) => {
    const current = checkpoint.current;
    if (
      !current.firebaseUid ||
      getCurrentFirebaseUid() !== current.firebaseUid
    ) {
      clearCheckpointTokenIfStillOwned();
      invalidateCheckpointAuthority();
      throw new Error(message);
    }
  };

  const assertCheckpointAuthority = (message: string) => {
    assertFirebaseOwner(message);
    const current = checkpoint.current;
    if (
      !current.idToken ||
      smartHealthApi.getTokenSnapshot() !== current.idToken
    ) {
      invalidateCheckpointAuthority();
      throw new Error(message);
    }
  };

  const submitRegistration = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setVerificationDelivery(null);

    try {
      const nextAccountFingerprint = accountFingerprint(form);
      const roleRequest = buildRoleRequest(form);
      const nextDocumentFingerprint = verificationFile
        ? verificationFileIdentity?.fingerprint || ""
        : "none";
      if (verificationFile && !nextDocumentFingerprint) {
        throw new Error(
          "Nội dung tài liệu chưa được kiểm tra. Vui lòng chọn lại tệp.",
        );
      }
      const previous = checkpoint.current;

      if (
        previous.accountFingerprint &&
        previous.accountFingerprint !== nextAccountFingerprint
      ) {
        throw new Error(
          "Tài khoản xác thực đã được tạo. Email và mật khẩu không thể đổi trong hồ sơ đang gửi.",
        );
      }

      const current = checkpoint.current;
      if (
        current.roleFingerprint &&
        current.roleFingerprint !== roleRequest.fingerprint
      ) {
        current.roleRequestKey = "";
        current.roleRequested = false;
        current.canonicalOrganizationId = "";
        current.documentUploaded = false;
      }
      current.roleFingerprint = roleRequest.fingerprint;
      if (
        current.documentFingerprint &&
        current.documentFingerprint !== nextDocumentFingerprint
      ) {
        current.documentUploaded = false;
      }
      current.documentFingerprint = nextDocumentFingerprint;

      if (!checkpoint.current.idToken) {
        setSubmissionStage("Đang tạo tài khoản xác thực...");
        const ownerBeforeCreate = getCurrentFirebaseUid();
        try {
          const account = await createFirebaseAccount(
            form.email.trim(),
            form.password,
          );
          checkpoint.current.accountFingerprint = nextAccountFingerprint;
          checkpoint.current.idToken = account.idToken;
          checkpoint.current.firebaseUid = account.user.uid;
          setIdentityLocked(true);
          if (
            !account.idToken ||
            !account.user.uid ||
            getCurrentFirebaseUid() !== account.user.uid
          ) {
            throw new Error(
              "Tài khoản xác thực đã thay đổi trong khi tạo hồ sơ đăng ký.",
            );
          }
        } catch (error) {
          const ownerAfterCreate = getCurrentFirebaseUid();
          if (
            !checkpoint.current.idToken &&
            ownerAfterCreate &&
            ownerAfterCreate !== ownerBeforeCreate
          ) {
            checkpoint.current.accountFingerprint = nextAccountFingerprint;
            checkpoint.current.firebaseUid = ownerAfterCreate;
            setIdentityLocked(true);
            throw new Error(
              "Tài khoản xác thực có thể đã được tạo nhưng phiên đăng ký chưa hoàn tất. Vui lòng đăng nhập lại bằng đúng email vừa đăng ký để tiếp tục.",
            );
          }
          throw error;
        }
      }

      if (
        checkpoint.current.authenticated &&
        smartHealthApi.getTokenSnapshot() !== checkpoint.current.idToken
      ) {
        invalidateCheckpointAuthority();
      }

      if (!checkpoint.current.authenticated) {
        assertFirebaseOwner(
          "Tài khoản xác thực đã thay đổi. Hồ sơ đăng ký cũ chưa được gửi.",
        );
        setSubmissionStage("Đang xác nhận tài khoản với Shcare...");
        const authenticated = await smartHealthApi.authenticateFirebase(
          checkpoint.current.idToken,
        );
        assertCheckpointAuthority(
          "Tài khoản xác thực đã thay đổi trong khi Shcare xác nhận danh tính.",
        );
        if (
          authenticated.user?.firebaseUid !== checkpoint.current.firebaseUid ||
          !authenticated.user?.id
        ) {
          clearCheckpointTokenIfStillOwned();
          invalidateCheckpointAuthority();
          throw new Error(
            "Backend chưa xác nhận chủ sở hữu của tài khoản vừa đăng ký.",
          );
        }
        checkpoint.current.authenticatedUserId = authenticated.user.id;
        checkpoint.current.authenticated = true;
      }

      if (!checkpoint.current.roleRequested) {
        assertCheckpointAuthority(
          "Tài khoản xác thực đã thay đổi. Hồ sơ đăng ký cũ chưa được gửi.",
        );
        setSubmissionStage("Đang gửi hồ sơ quyền bác sĩ...");
        checkpoint.current.roleRequestKey ||= createRoleRequestIdempotencyKey();
        const response = await smartHealthApi.requestRole(
          roleRequest.payload,
          checkpoint.current.roleRequestKey,
        );
        assertCheckpointAuthority(
          "Tài khoản xác thực đã thay đổi trước khi hồ sơ được xác nhận.",
        );
        const receipt = parseRoleRequestReceipt(
          response,
          roleRequest.intent,
          checkpoint.current.authenticatedUserId,
        );
        checkpoint.current.canonicalOrganizationId =
          receipt.user.organizationId;
        checkpoint.current.roleRequested = true;
      }

      if (verificationFile && !checkpoint.current.documentUploaded) {
        if (!verificationFileIdentity) {
          throw new Error(
            "Nội dung tài liệu chưa được kiểm tra. Vui lòng chọn lại tệp.",
          );
        }
        assertCheckpointAuthority(
          "Tài khoản xác thực đã thay đổi trước khi tải tài liệu xác minh.",
        );
        setSubmissionStage("Đang tải tài liệu xác minh...");
        const response = await smartHealthApi.uploadRoleRequestDocument(
          verificationFile,
          verificationFileIdentity.idempotencyKey,
        );
        assertCheckpointAuthority(
          "Tài khoản xác thực đã thay đổi trong khi tải tài liệu xác minh.",
        );
        parseRoleRequestDocumentReceipt(response, {
          userId: checkpoint.current.authenticatedUserId,
          organizationId: checkpoint.current.canonicalOrganizationId,
          identity: verificationFileIdentity,
        });
        checkpoint.current.documentUploaded = true;
      }

      assertCheckpointAuthority(
        "Tài khoản xác thực đã thay đổi trước khi gửi email xác minh.",
      );
      setSubmissionStage("Đang gửi email xác minh...");
      let delivery: Awaited<
        ReturnType<typeof smartHealthApi.sendEmailVerification>
      > | null = null;
      try {
        delivery = await smartHealthApi.sendEmailVerification();
      } catch (_error) {
        delivery = null;
      }
      assertCheckpointAuthority(
        "Tài khoản xác thực đã thay đổi trong khi gửi email xác minh.",
      );
      if (delivery) {
        setVerificationDelivery({
          ok: true,
          message:
            delivery.status === "verified"
              ? "Email đã được xác minh. Bạn có thể theo dõi trạng thái hồ sơ."
              : `Email xác minh đã được gửi đến ${delivery.email}.`,
        });
      } else {
        setVerificationDelivery({
          ok: false,
          message:
            "Hồ sơ đã được tiếp nhận nhưng email xác minh chưa gửi được. Bạn có thể gửi lại ở bước xác minh email.",
        });
      }
      setDone(true);
    } catch (error) {
      setErrors({
        submit: getSafeAuthErrorMessage(
          error,
          "Không thể gửi hồ sơ bác sĩ. Vui lòng thử lại.",
        ),
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

  const selectVerificationFile = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const requestId = ++fileCheckRequest.current;
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setVerificationFile(null);
      setVerificationFileIdentity(null);
      setVerificationFileCheck("idle");
      checkpoint.current.documentUploaded = false;
      return;
    }
    if (!acceptedDocumentTypes.has(file.type)) {
      setVerificationFile(null);
      setVerificationFileIdentity(null);
      setVerificationFileCheck("error");
      checkpoint.current.documentUploaded = false;
      setErrors((current) => ({
        ...current,
        file: "Tài liệu cần là PDF, JPG hoặc PNG.",
      }));
      event.target.value = "";
      return;
    }
    if (file.size > maxDocumentSize) {
      setVerificationFile(null);
      setVerificationFileIdentity(null);
      setVerificationFileCheck("error");
      checkpoint.current.documentUploaded = false;
      setErrors((current) => ({
        ...current,
        file: "Tài liệu không được vượt quá 10 MB.",
      }));
      event.target.value = "";
      return;
    }
    setVerificationFile(file);
    setVerificationFileIdentity(null);
    setVerificationFileCheck("checking");
    checkpoint.current.documentUploaded = false;
    setErrors((current) => ({ ...current, file: "", submit: "" }));
    void inspectRoleRequestDocument(file)
      .then((identity) => {
        if (fileCheckRequest.current !== requestId) return;
        setVerificationFileIdentity(identity);
        setVerificationFileCheck("ready");
      })
      .catch((error) => {
        if (fileCheckRequest.current !== requestId) return;
        setVerificationFileIdentity(null);
        setVerificationFileCheck("error");
        setErrors((current) => ({
          ...current,
          file: getSafeAuthErrorMessage(
            error,
            "Không thể kiểm tra nội dung tài liệu. Vui lòng chọn lại tệp.",
          ),
        }));
      });
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
        icon={Fingerprint}
        title="Đăng ký Chuyên Gia Y Tế"
        description="Yêu cầu quyền Workspace Portal"
      />
      <AuthStepper steps={steps} current={step} />

      <form className="shc-auth-form" noValidate onSubmit={handleSubmit}>
        <div className="shc-auth-step-panel" key={step}>
          {step === 0 ? (
            <>
              {identityLocked ? (
                <AuthAlert tone="info" title="Danh tính đăng nhập đã được khóa">
                  Tài khoản xác thực đã được tạo. Email và mật khẩu được giữ
                  nguyên để lần thử lại tiếp tục đúng tài khoản, không tạo hồ sơ
                  trùng.
                </AuthAlert>
              ) : null}
              <AuthField
                id="doctor-name"
                label="Họ và tên"
                required
                error={errors.name}
              >
                <input
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                />
              </AuthField>
              <AuthField
                id="doctor-email"
                label="Email đăng nhập"
                required
                error={errors.email}
              >
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={form.email}
                  disabled={identityLocked}
                  onChange={(event) => update("email", event.target.value)}
                />
              </AuthField>
              <AuthField
                id="doctor-phone"
                label="Số điện thoại"
                required
                error={errors.phone}
              >
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
                hint={
                  identityLocked
                    ? "Mật khẩu được khóa cho lần gửi hồ sơ hiện tại."
                    : "Dùng ít nhất 8 ký tự."
                }
                error={errors.password}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  disabled={identityLocked}
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
                  disabled={identityLocked}
                  onChange={(event) =>
                    update("confirmPassword", event.target.value)
                  }
                />
              </AuthField>
            </>
          ) : null}

          {step === 1 ? (
            <fieldset
              className="shc-auth-fieldset"
              aria-describedby={errors.type ? "doctor-type-error" : undefined}
            >
              <legend>Mô hình hoạt động</legend>
              <p>Chọn mô hình phù hợp với công việc hiện tại.</p>
              <div className="shc-auth-choice-list">
                {[
                  {
                    value: "private" as const,
                    title: "Bác sĩ hành nghề độc lập",
                    description:
                      "Tạo hồ sơ cho phòng khám hoặc hoạt động cá nhân.",
                  },
                  {
                    value: "clinic" as const,
                    title: "Bác sĩ thuộc cơ sở y tế",
                    description: "Yêu cầu quyền trong cơ sở đang làm việc.",
                  },
                ].map((option) => (
                  <label
                    className="shc-auth-choice"
                    data-selected={form.type === option.value}
                    key={option.value}
                  >
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
              {errors.type ? (
                <p
                  id="doctor-type-error"
                  className="shc-auth-field-error"
                  role="alert"
                >
                  {errors.type}
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {step === 2 ? (
            <>
              <AuthField
                id="doctor-specialty"
                label="Chuyên khoa"
                required
                error={errors.specialty}
              >
                <select
                  value={form.specialty}
                  onChange={(event) => update("specialty", event.target.value)}
                >
                  <option value="">Chọn chuyên khoa</option>
                  {[
                    "Tim mạch",
                    "Hô hấp",
                    "Nội tổng quát",
                    "Nhi khoa",
                    "Lão khoa",
                    "Y học gia đình",
                    "Khác",
                  ].map((specialty) => (
                    <option key={specialty} value={specialty}>
                      {specialty}
                    </option>
                  ))}
                </select>
              </AuthField>
              <AuthField
                id="doctor-license"
                label="Mã chứng chỉ hành nghề"
                required
                error={errors.license}
              >
                <input
                  value={form.license}
                  onChange={(event) => update("license", event.target.value)}
                />
              </AuthField>
              <AuthField
                id="doctor-reason"
                label="Mục tiêu sử dụng"
                hint="Không nhập dữ liệu định danh hoặc thông tin sức khỏe của bệnh nhân."
              >
                <textarea
                  rows={4}
                  value={form.reason}
                  onChange={(event) => update("reason", event.target.value)}
                />
              </AuthField>
            </>
          ) : null}

          {step === 3 ? (
            form.type === "private" ? (
              <>
                <AuthField
                  id="doctor-clinic-name"
                  label="Tên phòng khám"
                  required
                  error={errors.clinicName}
                >
                  <input
                    value={form.clinicName}
                    onChange={(event) =>
                      update("clinicName", event.target.value)
                    }
                  />
                </AuthField>
                <AuthField
                  id="doctor-clinic-address"
                  label="Địa chỉ"
                  required
                  error={errors.clinicAddress}
                >
                  <input
                    autoComplete="street-address"
                    value={form.clinicAddress}
                    onChange={(event) =>
                      update("clinicAddress", event.target.value)
                    }
                  />
                </AuthField>
                <AuthField id="doctor-clinic-phone" label="Hotline phòng khám">
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    value={form.clinicPhone}
                    onChange={(event) =>
                      update("clinicPhone", event.target.value)
                    }
                  />
                </AuthField>
              </>
            ) : (
              <>
                <AuthField
                  id="doctor-facility"
                  label="Cơ sở y tế đang làm việc"
                  required
                  hint="Chọn đúng cơ sở đã được Shcare xác nhận để ràng buộc hồ sơ với workspace canonical."
                  error={errors.facilitySearch}
                >
                  <select
                    value={form.facilityId}
                    disabled={clinicCatalogState === "loading"}
                    onChange={(event) => selectFacility(event.target.value)}
                  >
                    <option value="">
                      {clinicCatalogState === "loading"
                        ? "Đang tải danh mục cơ sở..."
                        : clinicCatalogState === "error"
                          ? "Danh mục cơ sở chưa sẵn sàng"
                          : "Chọn cơ sở y tế"}
                    </option>
                    {clinicCatalog.map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinic.name}
                        {clinic.address ? ` — ${clinic.address}` : ""}
                      </option>
                    ))}
                  </select>
                </AuthField>
                {clinicCatalogState === "error" ? (
                  <AuthAlert
                    tone="error"
                    title="Không thể tải danh mục cơ sở y tế"
                  >
                    Hồ sơ chưa thể gửi khi Shcare chưa xác nhận đúng workspace.
                    <div className="shc-auth-inline-actions">
                      <AuthSecondaryButton
                        type="button"
                        onClick={() =>
                          setClinicCatalogReload((current) => current + 1)
                        }
                      >
                        Tải lại danh mục
                      </AuthSecondaryButton>
                    </div>
                  </AuthAlert>
                ) : null}
              </>
            )
          ) : null}

          {step === 4 ? (
            <div className="shc-auth-upload-section">
              <div className="shc-auth-section-heading">
                <span aria-hidden="true">
                  <UploadCloud size={20} />
                </span>
                <div>
                  <h2>Tài liệu xác minh</h2>
                  <p>Chọn một bản PDF, JPG hoặc PNG, tối đa 10 MB.</p>
                </div>
              </div>
              <label
                className="shc-auth-upload"
                data-selected={verificationFile ? "true" : undefined}
              >
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  aria-describedby={
                    errors.file ? "doctor-file-error" : "doctor-file-hint"
                  }
                  aria-invalid={Boolean(errors.file)}
                  onChange={selectVerificationFile}
                />
                <UploadCloud size={26} aria-hidden="true" />
                <span>
                  {verificationFile
                    ? verificationFile.name
                    : "Chọn tài liệu xác minh"}
                </span>
                <small id="doctor-file-hint">
                  {verificationFile
                    ? "Tài liệu sẽ được tải lên khi bạn gửi hồ sơ."
                    : "PDF, JPG hoặc PNG · tối đa 10 MB"}
                </small>
              </label>
              {verificationFileCheck === "checking" ? (
                <p className="shc-auth-field-hint" role="status">
                  Đang kiểm tra nội dung tài liệu...
                </p>
              ) : null}
              {verificationFileCheck === "ready" ? (
                <p className="shc-auth-field-hint" role="status">
                  Nội dung tài liệu đã được kiểm tra.
                </p>
              ) : null}
              {errors.file ? (
                <p
                  id="doctor-file-error"
                  className="shc-auth-field-error"
                  role="alert"
                >
                  {errors.file}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 5 ? (
            <>
              <div className="shc-auth-review">
                <div className="shc-auth-section-heading">
                  <span aria-hidden="true">
                    <Building2 size={20} />
                  </span>
                  <div>
                    <h2>Kiểm tra hồ sơ</h2>
                    <p>Xác nhận thông tin trước khi gửi.</p>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Người đăng ký</dt>
                    <dd>{form.name}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{form.email}</dd>
                  </div>
                  <div>
                    <dt>Chuyên khoa</dt>
                    <dd>{form.specialty}</dd>
                  </div>
                  <div>
                    <dt>Nơi làm việc</dt>
                    <dd>{form.clinicName || form.facilitySearch}</dd>
                  </div>
                  <div>
                    <dt>Tài liệu</dt>
                    <dd>{verificationFile?.name}</dd>
                  </div>
                </dl>
              </div>
              <label
                className="shc-auth-checkbox"
                data-invalid={errors.agreed ? "true" : undefined}
              >
                <input
                  type="checkbox"
                  checked={form.agreed}
                  onChange={(event) => update("agreed", event.target.checked)}
                />
                <span>
                  Tôi xác nhận thông tin là chính xác và đồng ý với{" "}
                  <Link target="_blank" rel="noreferrer" to="/dieu-khoan">
                    điều khoản sử dụng
                  </Link>{" "}
                  và{" "}
                  <Link target="_blank" rel="noreferrer" to="/bao-mat">
                    chính sách bảo mật
                  </Link>
                  .
                </span>
              </label>
              {errors.agreed ? (
                <p className="shc-auth-field-error" role="alert">
                  {errors.agreed}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        {errors.submit ? (
          <AuthAlert tone="error">{errors.submit}</AuthAlert>
        ) : null}
        {submitting && submissionStage ? (
          <AuthSubmissionStatus label={submissionStage} />
        ) : null}

        <div className="shc-auth-actions">
          {step > 0 ? (
            <AuthSecondaryButton
              type="button"
              disabled={submitting}
              onClick={() => {
                setErrors({});
                setStep((current) => current - 1);
              }}
            >
              Quay lại
            </AuthSecondaryButton>
          ) : (
            <Link className="shc-auth-text-link" to="/login">
              Đã có Workspace? Đăng Nhập
            </Link>
          )}
          <AuthPrimaryButton
            type="submit"
            loading={submitting}
            loadingLabel="Đang gửi hồ sơ..."
          >
            {step === steps.length - 1 ? "Gửi hồ sơ" : "Tiếp tục"}
          </AuthPrimaryButton>
        </div>
      </form>
    </section>
  );
}
