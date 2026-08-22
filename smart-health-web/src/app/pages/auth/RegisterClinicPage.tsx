import { useRef, useState } from "react";
import { Building2, FileCheck2, UploadCloud, UsersRound } from "lucide-react";
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
  validateClinicRegistrationStep,
  type AuthFieldErrors,
} from "../../auth/auth-form";
import {
  createFirebaseAccount,
  getCurrentFirebaseUid,
} from "../../../lib/firebase-client";
import { smartHealthApi } from "../../../lib/smart-health-api";
import {
  createWorkspaceRequestIdempotencyKey,
  parseWorkspaceRequestReceipt,
} from "../../../lib/workspace-request-contract";
import {
  inspectRoleRequestDocument,
  parseRoleRequestDocumentReceipt,
  type RoleRequestDocumentIdentity,
} from "../../../lib/role-request-document-contract";
import { useSEO } from "@/lib/useSEO";

const steps = ["Người đại diện", "Cơ sở", "Quy mô", "Xác minh", "Xác nhận"];
const acceptedDocumentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const maxDocumentSize = 10 * 1024 * 1024;
const needs = [
  "Theo dõi trực tiếp",
  "Quản lý thiết bị",
  "Báo cáo dữ liệu",
  "Chăm sóc từ xa",
  "Phân quyền nhân sự",
];

type ClinicForm = {
  repName: string;
  repEmail: string;
  repPhone: string;
  repRole: string;
  password: string;
  confirmPassword: string;
  clinicName: string;
  clinicType: string;
  address: string;
  clinicPhone: string;
  clinicEmail: string;
  website: string;
  staffCount: string;
  patientCount: string;
  deviceCount: string;
  needs: string[];
  agreed: boolean;
};

const initialForm: ClinicForm = {
  repName: "",
  repEmail: "",
  repPhone: "",
  repRole: "",
  password: "",
  confirmPassword: "",
  clinicName: "",
  clinicType: "",
  address: "",
  clinicPhone: "",
  clinicEmail: "",
  website: "",
  staffCount: "",
  patientCount: "",
  deviceCount: "",
  needs: [],
  agreed: false,
};

type ClinicRegistrationCheckpoint = {
  accountFingerprint: string;
  workspaceFingerprint: string;
  documentFingerprint: string;
  idToken: string;
  firebaseUid: string;
  authenticatedUserId: string;
  authenticated: boolean;
  workspaceRequested: boolean;
  workspaceRequestKey: string;
  canonicalOrganizationId: string;
  documentUploaded: boolean;
};

function emptyClinicCheckpoint(): ClinicRegistrationCheckpoint {
  return {
    accountFingerprint: "",
    workspaceFingerprint: "",
    documentFingerprint: "",
    idToken: "",
    firebaseUid: "",
    authenticatedUserId: "",
    authenticated: false,
    workspaceRequested: false,
    workspaceRequestKey: "",
    canonicalOrganizationId: "",
    documentUploaded: false,
  };
}

function clinicAccountFingerprint(form: ClinicForm) {
  return JSON.stringify({
    email: form.repEmail.trim().toLowerCase(),
    password: form.password,
  });
}

function buildWorkspaceRequest(form: ClinicForm) {
  const workspaceType = form.clinicType === "hospital" ? "hospital" : "clinic";
  const name = form.clinicName.trim();
  const payload = {
    name,
    workspaceType,
    address: form.address.trim(),
    phone: form.clinicPhone.trim() || form.repPhone.trim(),
    email: form.clinicEmail.trim() || form.repEmail.trim().toLowerCase(),
    website: form.website.trim(),
    representative: form.repName.trim(),
    metadata: {
      repRole: form.repRole,
      staffCount: form.staffCount,
      patientCount: form.patientCount,
      deviceCount: form.deviceCount,
      needs: form.needs,
    },
  };
  return {
    intent: { name, workspaceType },
    payload,
    fingerprint: JSON.stringify(payload),
  };
}

export default function RegisterClinicPage() {
  useSEO({
    title: "Đăng ký cơ sở y tế | Shcare",
    description:
      "Gửi yêu cầu tạo workspace Shcare cho phòng khám hoặc cơ sở y tế.",
    path: "/register/phong-kham",
  });

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ClinicForm>(initialForm);
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [licenseFileIdentity, setLicenseFileIdentity] =
    useState<RoleRequestDocumentIdentity | null>(null);
  const [licenseFileCheck, setLicenseFileCheck] = useState<
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
  const checkpoint = useRef<ClinicRegistrationCheckpoint>(
    emptyClinicCheckpoint(),
  );
  const licenseFileCheckRequest = useRef(0);

  const update = <K extends keyof ClinicForm>(key: K, value: ClinicForm[K]) => {
    if (
      identityLocked &&
      (key === "repEmail" || key === "password" || key === "confirmPassword")
    ) {
      return;
    }
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "", submit: "" }));
  };

  const toggleNeed = (need: string) => {
    setForm((current) => ({
      ...current,
      needs: current.needs.includes(need)
        ? current.needs.filter((item) => item !== need)
        : [...current.needs, need],
    }));
    setErrors((current) => ({ ...current, submit: "" }));
  };

  const dirty =
    !done &&
    !submitting &&
    (licenseFile !== null ||
      Object.entries(form).some(([key, value]) =>
        key === "needs" ? (value as string[]).length > 0 : Boolean(value),
      ));

  const validateCurrentStep = () => {
    const nextErrors = validateClinicRegistrationStep(step, {
      ...form,
      licenseFile,
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const clearCheckpointTokenIfStillOwned = () => {
    if (!checkpoint.current.idToken) return false;
    return smartHealthApi.clearTokenIfMatches(checkpoint.current.idToken);
  };

  const invalidateCheckpointAuthority = () => {
    checkpoint.current.authenticated = false;
    checkpoint.current.authenticatedUserId = "";
  };

  const assertFirebaseOwner = (message: string) => {
    if (
      !checkpoint.current.firebaseUid ||
      getCurrentFirebaseUid() !== checkpoint.current.firebaseUid
    ) {
      clearCheckpointTokenIfStillOwned();
      invalidateCheckpointAuthority();
      throw new Error(message);
    }
  };

  const assertCheckpointAuthority = (message: string) => {
    assertFirebaseOwner(message);
    if (
      !checkpoint.current.idToken ||
      smartHealthApi.getTokenSnapshot() !== checkpoint.current.idToken
    ) {
      invalidateCheckpointAuthority();
      throw new Error(message);
    }
  };

  const submitRegistration = async () => {
    if (submitting || !licenseFile) return;
    setSubmitting(true);
    setErrors({});
    setVerificationDelivery(null);

    try {
      const nextAccountFingerprint = clinicAccountFingerprint(form);
      const workspaceRequest = buildWorkspaceRequest(form);
      const documentIdentity = licenseFileIdentity;
      if (!documentIdentity) {
        throw new Error(
          "Nội dung giấy phép chưa được kiểm tra. Vui lòng chọn lại tệp.",
        );
      }
      const nextDocumentFingerprint = documentIdentity.fingerprint;
      if (
        checkpoint.current.accountFingerprint &&
        checkpoint.current.accountFingerprint !== nextAccountFingerprint
      ) {
        throw new Error(
          "Tài khoản xác thực đã được tạo. Email và mật khẩu không thể đổi trong hồ sơ đang gửi.",
        );
      }
      if (
        checkpoint.current.workspaceFingerprint &&
        checkpoint.current.workspaceFingerprint !== workspaceRequest.fingerprint
      ) {
        checkpoint.current.workspaceRequestKey = "";
        checkpoint.current.workspaceRequested = false;
        checkpoint.current.canonicalOrganizationId = "";
        checkpoint.current.documentUploaded = false;
      }
      checkpoint.current.workspaceFingerprint = workspaceRequest.fingerprint;
      if (
        checkpoint.current.documentFingerprint &&
        checkpoint.current.documentFingerprint !== nextDocumentFingerprint
      ) {
        checkpoint.current.documentUploaded = false;
      }
      checkpoint.current.documentFingerprint = nextDocumentFingerprint;

      if (!checkpoint.current.idToken) {
        setSubmissionStage("Đang tạo tài khoản xác thực...");
        const ownerBeforeCreate = getCurrentFirebaseUid();
        try {
          const account = await createFirebaseAccount(
            form.repEmail.trim(),
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
              "Tài khoản xác thực đã thay đổi trong khi tạo yêu cầu workspace.",
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
          "Tài khoản xác thực đã thay đổi. Yêu cầu workspace cũ chưa được gửi.",
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

      if (!checkpoint.current.workspaceRequested) {
        assertCheckpointAuthority(
          "Tài khoản xác thực đã thay đổi trước khi gửi yêu cầu workspace.",
        );
        setSubmissionStage("Đang gửi yêu cầu tạo workspace...");
        checkpoint.current.workspaceRequestKey ||=
          createWorkspaceRequestIdempotencyKey(form.repEmail);
        const response = await smartHealthApi.requestWorkspace(
          workspaceRequest.payload,
          checkpoint.current.workspaceRequestKey,
        );
        assertCheckpointAuthority(
          "Tài khoản xác thực đã thay đổi trong khi gửi yêu cầu workspace.",
        );
        const receipt = parseWorkspaceRequestReceipt(
          response,
          workspaceRequest.intent,
        );
        if (receipt.user.id !== checkpoint.current.authenticatedUserId) {
          throw new Error(
            "Backend trả yêu cầu workspace không thuộc tài khoản hiện tại.",
          );
        }
        checkpoint.current.canonicalOrganizationId = receipt.workspace.id;
        checkpoint.current.workspaceRequested = true;
      }

      if (!checkpoint.current.documentUploaded) {
        assertCheckpointAuthority(
          "Tài khoản xác thực đã thay đổi trước khi tải giấy phép hoạt động.",
        );
        if (!checkpoint.current.canonicalOrganizationId) {
          throw new Error(
            "Không xác định được workspace canonical của giấy phép hoạt động.",
          );
        }
        setSubmissionStage("Đang tải giấy phép hoạt động...");
        const response = await smartHealthApi.uploadRoleRequestDocument(
          licenseFile,
          documentIdentity.idempotencyKey,
        );
        assertCheckpointAuthority(
          "Tài khoản xác thực đã thay đổi trong khi tải giấy phép hoạt động.",
        );
        parseRoleRequestDocumentReceipt(response, {
          userId: checkpoint.current.authenticatedUserId,
          organizationId: checkpoint.current.canonicalOrganizationId,
          identity: documentIdentity,
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
              ? "Email đã được xác minh. Bạn có thể theo dõi trạng thái workspace."
              : `Email xác minh đã được gửi đến ${delivery.email}.`,
        });
      } else {
        setVerificationDelivery({
          ok: false,
          message:
            "Yêu cầu workspace đã được tiếp nhận nhưng email xác minh chưa gửi được. Bạn có thể gửi lại ở bước xác minh email.",
        });
      }
      setDone(true);
    } catch (error) {
      setErrors({
        submit: getSafeAuthErrorMessage(
          error,
          "Không thể gửi yêu cầu tạo workspace. Vui lòng thử lại.",
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

  const selectLicenseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const requestId = ++licenseFileCheckRequest.current;
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setLicenseFile(null);
      setLicenseFileIdentity(null);
      setLicenseFileCheck("idle");
      checkpoint.current.documentUploaded = false;
      return;
    }
    if (!acceptedDocumentTypes.has(file.type)) {
      setLicenseFile(null);
      setLicenseFileIdentity(null);
      setLicenseFileCheck("error");
      checkpoint.current.documentUploaded = false;
      setErrors((current) => ({
        ...current,
        licenseFile: "Giấy phép cần là PDF, JPG hoặc PNG.",
      }));
      event.target.value = "";
      return;
    }
    if (file.size > maxDocumentSize) {
      setLicenseFile(null);
      setLicenseFileIdentity(null);
      setLicenseFileCheck("error");
      checkpoint.current.documentUploaded = false;
      setErrors((current) => ({
        ...current,
        licenseFile: "Giấy phép không được vượt quá 10 MB.",
      }));
      event.target.value = "";
      return;
    }
    setLicenseFile(file);
    setLicenseFileIdentity(null);
    setLicenseFileCheck("checking");
    checkpoint.current.documentUploaded = false;
    setErrors((current) => ({ ...current, licenseFile: "", submit: "" }));
    void inspectRoleRequestDocument(file)
      .then((identity) => {
        if (licenseFileCheckRequest.current !== requestId) return;
        setLicenseFileIdentity(identity);
        setLicenseFileCheck("ready");
      })
      .catch((error) => {
        if (licenseFileCheckRequest.current !== requestId) return;
        setLicenseFileIdentity(null);
        setLicenseFileCheck("error");
        setErrors((current) => ({
          ...current,
          licenseFile: getSafeAuthErrorMessage(
            error,
            "Không thể kiểm tra nội dung giấy phép. Vui lòng chọn lại tệp.",
          ),
        }));
      });
  };

  if (done) {
    return (
      <section className="shc-auth-page shc-auth-complete">
        <AuthPageIntro
          icon={FileCheck2}
          title="Yêu cầu workspace đã được tiếp nhận"
          description="Workspace chỉ được kích hoạt sau khi quản trị viên kiểm tra cơ sở và giấy phép."
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
            <li>Theo dõi trạng thái yêu cầu trên trang chờ duyệt.</li>
            <li>
              Không chia sẻ mật khẩu hoặc tài liệu nhạy cảm qua kênh không chính
              thức.
            </li>
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
        icon={Building2}
        title="Đăng ký cơ sở y tế"
        description="Tạo yêu cầu workspace theo từng bước. Shcare không kích hoạt cơ sở trước khi hoàn tất kiểm tra."
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
                id="clinic-representative-name"
                label="Người đại diện"
                required
                error={errors.repName}
              >
                <input
                  autoComplete="name"
                  value={form.repName}
                  onChange={(event) => update("repName", event.target.value)}
                />
              </AuthField>
              <AuthField
                id="clinic-representative-email"
                label="Email đăng nhập"
                required
                error={errors.repEmail}
              >
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={form.repEmail}
                  disabled={identityLocked}
                  onChange={(event) => update("repEmail", event.target.value)}
                />
              </AuthField>
              <AuthField
                id="clinic-representative-phone"
                label="Số điện thoại"
                required
                error={errors.repPhone}
              >
                <input
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.repPhone}
                  onChange={(event) => update("repPhone", event.target.value)}
                />
              </AuthField>
              <AuthField
                id="clinic-representative-role"
                label="Vai trò quản trị"
                required
                error={errors.repRole}
              >
                <select
                  value={form.repRole}
                  onChange={(event) => update("repRole", event.target.value)}
                >
                  <option value="">Chọn vai trò</option>
                  <option value="owner">Chủ cơ sở</option>
                  <option value="director">Giám đốc y khoa</option>
                  <option value="manager">Quản trị vận hành</option>
                </select>
              </AuthField>
              <AuthField
                id="clinic-password"
                label="Mật khẩu"
                required
                hint={
                  identityLocked
                    ? "Mật khẩu được khóa cho lần gửi yêu cầu hiện tại."
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
                id="clinic-password-confirmation"
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
            <>
              <AuthField
                id="clinic-name"
                label="Tên cơ sở"
                required
                error={errors.clinicName}
              >
                <input
                  value={form.clinicName}
                  onChange={(event) => update("clinicName", event.target.value)}
                />
              </AuthField>
              <AuthField
                id="clinic-type"
                label="Loại hình cơ sở"
                required
                error={errors.clinicType}
              >
                <select
                  value={form.clinicType}
                  onChange={(event) => update("clinicType", event.target.value)}
                >
                  <option value="">Chọn loại hình</option>
                  <option value="private">
                    Phòng khám đa khoa hoặc tư nhân
                  </option>
                  <option value="specialist">Trung tâm chuyên khoa</option>
                  <option value="hospital">Bệnh viện</option>
                </select>
              </AuthField>
              <AuthField
                id="clinic-address"
                label="Địa chỉ cơ sở"
                required
                error={errors.address}
              >
                <input
                  autoComplete="street-address"
                  value={form.address}
                  onChange={(event) => update("address", event.target.value)}
                />
              </AuthField>
              <div className="shc-auth-field-grid">
                <AuthField
                  id="clinic-phone"
                  label="Hotline cơ sở"
                  required
                  error={errors.clinicPhone}
                >
                  <input
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.clinicPhone}
                    onChange={(event) =>
                      update("clinicPhone", event.target.value)
                    }
                  />
                </AuthField>
                <AuthField id="clinic-email" label="Email cơ sở">
                  <input
                    type="email"
                    inputMode="email"
                    value={form.clinicEmail}
                    onChange={(event) =>
                      update("clinicEmail", event.target.value)
                    }
                  />
                </AuthField>
              </div>
              <AuthField
                id="clinic-website"
                label="Website cơ sở"
                hint="Không bắt buộc."
              >
                <input
                  inputMode="url"
                  value={form.website}
                  onChange={(event) => update("website", event.target.value)}
                />
              </AuthField>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="shc-auth-section-heading">
                <span aria-hidden="true">
                  <UsersRound size={20} />
                </span>
                <div>
                  <h2>Quy mô dự kiến</h2>
                  <p>Các số liệu này không bắt buộc và có thể cập nhật sau.</p>
                </div>
              </div>
              <div className="shc-auth-field-grid shc-auth-field-grid-three">
                <AuthField
                  id="clinic-staff-count"
                  label="Nhân sự"
                  error={errors.staffCount}
                >
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={form.staffCount}
                    onChange={(event) =>
                      update("staffCount", event.target.value)
                    }
                  />
                </AuthField>
                <AuthField
                  id="clinic-patient-count"
                  label="Bệnh nhân"
                  error={errors.patientCount}
                >
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={form.patientCount}
                    onChange={(event) =>
                      update("patientCount", event.target.value)
                    }
                  />
                </AuthField>
                <AuthField
                  id="clinic-device-count"
                  label="Thiết bị"
                  error={errors.deviceCount}
                >
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={form.deviceCount}
                    onChange={(event) =>
                      update("deviceCount", event.target.value)
                    }
                  />
                </AuthField>
              </div>
              <fieldset className="shc-auth-fieldset">
                <legend>Nhu cầu sử dụng</legend>
                <p>Chọn các nhóm chức năng cơ sở quan tâm.</p>
                <div className="shc-auth-chip-list">
                  {needs.map((need) => (
                    <button
                      key={need}
                      type="button"
                      className="shc-auth-filter-chip"
                      aria-pressed={form.needs.includes(need)}
                      onClick={() => toggleNeed(need)}
                    >
                      {need}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}

          {step === 3 ? (
            <div className="shc-auth-upload-section">
              <div className="shc-auth-section-heading">
                <span aria-hidden="true">
                  <UploadCloud size={20} />
                </span>
                <div>
                  <h2>Giấy phép hoạt động</h2>
                  <p>Chọn một bản PDF, JPG hoặc PNG, tối đa 10 MB.</p>
                </div>
              </div>
              <label
                className="shc-auth-upload"
                data-selected={licenseFile ? "true" : undefined}
              >
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  aria-describedby={
                    errors.licenseFile
                      ? "clinic-license-error"
                      : "clinic-license-hint"
                  }
                  aria-invalid={Boolean(errors.licenseFile)}
                  onChange={selectLicenseFile}
                />
                <UploadCloud size={26} aria-hidden="true" />
                <span>
                  {licenseFile ? licenseFile.name : "Chọn giấy phép hoạt động"}
                </span>
                <small id="clinic-license-hint">
                  {licenseFile
                    ? licenseFileCheck === "checking"
                      ? "Đang kiểm tra nội dung giấy phép..."
                      : licenseFileCheck === "ready"
                        ? "Nội dung giấy phép đã được kiểm tra."
                        : "Không thể kiểm tra nội dung giấy phép."
                    : "PDF, JPG hoặc PNG · tối đa 10 MB"}
                </small>
              </label>
              {errors.licenseFile ? (
                <p
                  id="clinic-license-error"
                  className="shc-auth-field-error"
                  role="alert"
                >
                  {errors.licenseFile}
                </p>
              ) : null}
              <AuthAlert tone="info">
                Logo cơ sở chưa có API tải lên nên không được thu thập trong
                bước này.
              </AuthAlert>
            </div>
          ) : null}

          {step === 4 ? (
            <>
              <div className="shc-auth-review">
                <div className="shc-auth-section-heading">
                  <span aria-hidden="true">
                    <Building2 size={20} />
                  </span>
                  <div>
                    <h2>Kiểm tra yêu cầu</h2>
                    <p>Xác nhận thông tin trước khi gửi.</p>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Người đại diện</dt>
                    <dd>{form.repName}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{form.repEmail}</dd>
                  </div>
                  <div>
                    <dt>Cơ sở</dt>
                    <dd>{form.clinicName}</dd>
                  </div>
                  <div>
                    <dt>Loại hình</dt>
                    <dd>{form.clinicType}</dd>
                  </div>
                  <div>
                    <dt>Giấy phép</dt>
                    <dd>{licenseFile?.name}</dd>
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
                  Tôi xác nhận có thẩm quyền gửi yêu cầu và đồng ý với{" "}
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
              Đã có tài khoản?
            </Link>
          )}
          <AuthPrimaryButton
            type="submit"
            loading={submitting}
            loadingLabel="Đang gửi yêu cầu..."
            disabled={Boolean(licenseFile && !licenseFileIdentity)}
          >
            {step === steps.length - 1 ? "Gửi yêu cầu" : "Tiếp tục"}
          </AuthPrimaryButton>
        </div>
      </form>
    </section>
  );
}
