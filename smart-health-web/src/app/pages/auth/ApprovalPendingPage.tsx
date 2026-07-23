import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileUp,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

import {
  AuthAlert,
  AuthField,
  AuthPageIntro,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthSubmissionStatus,
  AuthUnsavedChangesGuard,
} from "../../components/auth/AuthPrimitives";
import {
  getSafeAuthErrorMessage,
  type AuthFieldErrors,
} from "../../auth/auth-form";
import { smartHealthApi } from "../../../lib/smart-health-api";
import {
  createWorkspaceRequestIdempotencyKey,
  parseWorkspaceRequestReceipt,
} from "../../../lib/workspace-request-contract";
import { useAuth } from "../../context/AuthContext";
import { useSEO } from "@/lib/useSEO";

type ApprovalState = "info_requested" | "rejected" | "approved" | "pending";

const fieldLabels: Record<string, string> = {
  name: "Họ và tên",
  phone: "Số điện thoại",
  email: "Email",
  license: "Mã chứng chỉ hành nghề",
  clinic: "Cơ sở y tế / phòng khám",
  workspaceName: "Tên workspace/cơ sở",
  address: "Địa chỉ pháp lý",
  representative: "Người đại diện",
  legalName: "Mã số pháp lý",
  specialty: "Chuyên khoa",
  reason: "Lý do đăng ký",
};

const defaultRequiredFields = ["name", "phone", "license", "specialty"];
const defaultWorkspaceRequiredFields = [
  "workspaceName",
  "address",
  "representative",
  "phone",
];
const acceptedDocumentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const maxDocumentSize = 10 * 1024 * 1024;

function normalizeStatus(
  status?: unknown,
  fallback?: ApprovalState,
): ApprovalState {
  if (status === "needs_info") return "info_requested";
  if (status === "rejected") return "rejected";
  if (status === "approved") return "approved";
  if (status === "pending") return "pending";
  return fallback || "pending";
}

export default function ApprovalPendingPage({
  state,
}: {
  state?: "info_requested" | "rejected" | "approved";
}) {
  useSEO({
    title: "Trạng thái hồ sơ | Shcare",
    description:
      "Theo dõi trạng thái hồ sơ và bổ sung thông tin khi được yêu cầu.",
    path: "/cho-duyet",
  });

  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionStage, setSubmissionStage] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [success, setSuccess] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [changed, setChanged] = useState(false);
  const checkpoint = useRef({
    requestSent: false,
    workspaceRequestKey: "",
    documentUploaded: false,
  });
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    license: "",
    specialty: "",
    clinic: "",
    workspaceName: "",
    address: "",
    representative: "",
    legalName: "",
    reason: "",
  });

  const isWorkspaceOwnerRequest = user?.raw.requestedRole === "workspace_owner";
  const status = normalizeStatus(user?.raw.roleRequestStatus, state);
  const requiredFields = useMemo(() => {
    const raw = Array.isArray(user?.raw.roleInfoRequiredFields)
      ? user.raw.roleInfoRequiredFields
      : [];
    const normalized = raw.map(String).filter((field) => fieldLabels[field]);
    if (normalized.length) return normalized;
    return isWorkspaceOwnerRequest
      ? defaultWorkspaceRequiredFields
      : defaultRequiredFields;
  }, [isWorkspaceOwnerRequest, user?.raw.roleInfoRequiredFields]);

  useEffect(() => {
    const raw = user?.raw;
    if (!raw) return;
    setForm({
      name: raw.name || "",
      phone: raw.phone || "",
      email: raw.email || "",
      license: String(raw.license || ""),
      specialty: String(raw.department || raw.specialty || ""),
      clinic: String(
        raw.hospital || raw.clinicName || raw.currentWorkspace?.name || "",
      ),
      workspaceName: String(
        raw.currentWorkspace?.name || raw.clinicName || raw.hospital || "",
      ),
      address: String(raw.currentWorkspace?.address || raw.address || ""),
      representative: String(
        raw.currentWorkspace?.representative || raw.name || "",
      ),
      legalName: String(raw.currentWorkspace?.legalName || raw.legalName || ""),
      reason: String(raw.registrationReason || ""),
    });
    setChanged(false);
    checkpoint.current = {
      requestSent: false,
      workspaceRequestKey: "",
      documentUploaded: false,
    };
  }, [user?.raw]);

  const refresh = async () => {
    setLoading(true);
    setErrors((current) => ({ ...current, submit: "" }));
    try {
      await refreshUser();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit: getSafeAuthErrorMessage(
          error,
          "Không thể cập nhật trạng thái. Vui lòng thử lại.",
        ),
      }));
    } finally {
      setLoading(false);
    }
  };

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "", submit: "" }));
    setSuccess("");
    setChanged(true);
    checkpoint.current.requestSent = false;
    checkpoint.current.workspaceRequestKey = "";
  };

  const validateRequestedFields = () => {
    const nextErrors: AuthFieldErrors = {};
    requiredFields.forEach((field) => {
      const value = form[field as keyof typeof form];
      if (!String(value || "").trim()) {
        nextErrors[field] =
          `Vui lòng nhập ${fieldLabels[field].toLocaleLowerCase("vi")}.`;
      }
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submitMoreInfo = async () => {
    if (submitting || !validateRequestedFields()) return;
    setSubmitting(true);
    setErrors({});
    setSuccess("");

    try {
      if (!checkpoint.current.requestSent) {
        setSubmissionStage("Đang gửi thông tin bổ sung...");
        if (isWorkspaceOwnerRequest) {
          const workspaceType = String(user?.raw.workspaceType || "clinic");
          const workspaceName = form.workspaceName.trim() || form.clinic.trim();
          checkpoint.current.workspaceRequestKey ||=
            createWorkspaceRequestIdempotencyKey(
              String(user?.raw.id || user?.raw.email || "workspace-owner"),
            );
          const response = await smartHealthApi.requestWorkspace(
            {
              name: workspaceName,
              clinicName: workspaceName,
              workspaceType,
              address: form.address.trim(),
              phone: form.phone.trim(),
              email: form.email.trim() || user?.raw.email || "",
              representative: form.representative.trim() || form.name.trim(),
              legalName: form.legalName.trim(),
              metadata: { resubmissionReason: form.reason.trim() },
            },
            checkpoint.current.workspaceRequestKey,
          );
          parseWorkspaceRequestReceipt(response, {
            name: workspaceName,
            workspaceType,
          });
        } else {
          const workspaceType =
            String(
              user?.raw.workspaceType || user?.currentWorkspace?.type || "",
            ) === "solo_practice"
              ? "solo_practice"
              : "clinic";
          await smartHealthApi.requestRole({
            requestedRole: "doctor",
            accountType:
              workspaceType === "solo_practice" ? "solo_doctor" : "doctor",
            workspaceType,
            name: form.name.trim(),
            phone: form.phone.trim(),
            license: form.license.trim(),
            specialty: form.specialty.trim(),
            department: form.specialty.trim(),
            clinicName: form.clinic.trim(),
            hospital: form.clinic.trim(),
            reason: form.reason.trim(),
            registrationReason: form.reason.trim(),
          });
        }
        checkpoint.current.requestSent = true;
      }

      if (documentFile && !checkpoint.current.documentUploaded) {
        setSubmissionStage("Đang tải tài liệu bổ sung...");
        await smartHealthApi.uploadRoleRequestDocument(documentFile);
        checkpoint.current.documentUploaded = true;
      }

      setSubmissionStage("Đang cập nhật trạng thái hồ sơ...");
      await refreshUser();
      setChanged(false);
      setSuccess("Hệ thống đã tiếp nhận hồ sơ bổ sung.");
      navigate("/cho-duyet", { replace: true });
    } catch (error) {
      setErrors({
        submit: getSafeAuthErrorMessage(
          error,
          "Không thể gửi lại hồ sơ. Vui lòng thử lại.",
        ),
      });
    } finally {
      setSubmitting(false);
      setSubmissionStage("");
    }
  };

  const selectDocument = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setDocumentFile(null);
      return;
    }
    if (!acceptedDocumentTypes.has(file.type)) {
      setErrors((current) => ({
        ...current,
        document: "Tài liệu cần là PDF, JPG hoặc PNG.",
      }));
      event.target.value = "";
      return;
    }
    if (file.size > maxDocumentSize) {
      setErrors((current) => ({
        ...current,
        document: "Tài liệu không được vượt quá 10 MB.",
      }));
      event.target.value = "";
      return;
    }
    setDocumentFile(file);
    setErrors((current) => ({ ...current, document: "", submit: "" }));
    setChanged(true);
    checkpoint.current.documentUploaded = false;
  };

  const subjectLabel = isWorkspaceOwnerRequest ? "Workspace" : "Hồ sơ";
  const config =
    status === "approved"
      ? {
          icon: CheckCircle2,
          tone: "success" as const,
          title: `${subjectLabel} đã được duyệt`,
          description:
            "Tài khoản đã có quyền truy cập portal theo quyền được cấp.",
        }
      : status === "rejected"
        ? {
            icon: XCircle,
            tone: "error" as const,
            title: `${subjectLabel} bị từ chối`,
            description: String(
              user?.raw.roleRejectReason ||
                "Liên hệ quản trị viên để biết thêm chi tiết.",
            ),
          }
        : status === "info_requested"
          ? {
              icon: ShieldAlert,
              tone: "warning" as const,
              title: "Cần bổ sung thông tin",
              description: String(
                user?.raw.roleInfoRequestMessage ||
                  "Quản trị viên yêu cầu cập nhật hồ sơ.",
              ),
            }
          : {
              icon: Clock3,
              tone: "info" as const,
              title: `${subjectLabel} đang chờ duyệt`,
              description:
                "Trạng thái này được lấy từ hồ sơ hiện tại trên hệ thống Shcare.",
            };

  return (
    <section className="shc-auth-page shc-auth-approval-page">
      <AuthUnsavedChangesGuard when={changed && !submitting} />
      <AuthPageIntro
        icon={config.icon}
        title={config.title}
        description={config.description}
      />
      <div className="shc-auth-status-summary" data-tone={config.tone}>
        <strong>Trạng thái hiện tại</strong>
        <span>
          {status === "info_requested"
            ? "Cần bổ sung"
            : status === "approved"
              ? "Đã duyệt"
              : status === "rejected"
                ? "Bị từ chối"
                : "Chờ duyệt"}
        </span>
      </div>

      {status === "info_requested" ? (
        <form
          className="shc-auth-form shc-auth-needs-info-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submitMoreInfo();
          }}
        >
          <AuthAlert tone="warning" title="Thông tin được yêu cầu">
            {requiredFields.map((field) => fieldLabels[field]).join(", ")}.
          </AuthAlert>

          {isWorkspaceOwnerRequest ? (
            <>
              <div className="shc-auth-field-grid">
                <AuthField
                  id="needs-info-workspace-name"
                  label="Tên workspace/cơ sở"
                  required={requiredFields.includes("workspaceName")}
                  error={errors.workspaceName}
                >
                  <input
                    value={form.workspaceName}
                    onChange={(event) =>
                      update("workspaceName", event.target.value)
                    }
                  />
                </AuthField>
                <AuthField
                  id="needs-info-phone"
                  label="Số điện thoại"
                  required={requiredFields.includes("phone")}
                  error={errors.phone}
                >
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                  />
                </AuthField>
              </div>
              <AuthField
                id="needs-info-address"
                label="Địa chỉ pháp lý"
                required={requiredFields.includes("address")}
                error={errors.address}
              >
                <input
                  value={form.address}
                  onChange={(event) => update("address", event.target.value)}
                />
              </AuthField>
              <div className="shc-auth-field-grid">
                <AuthField
                  id="needs-info-representative"
                  label="Người đại diện"
                  required={requiredFields.includes("representative")}
                  error={errors.representative}
                >
                  <input
                    value={form.representative}
                    onChange={(event) =>
                      update("representative", event.target.value)
                    }
                  />
                </AuthField>
                <AuthField
                  id="needs-info-email"
                  label="Email"
                  required={requiredFields.includes("email")}
                  error={errors.email}
                >
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                  />
                </AuthField>
              </div>
              <AuthField
                id="needs-info-legal-name"
                label="Mã số pháp lý"
                required={requiredFields.includes("legalName")}
                error={errors.legalName}
              >
                <input
                  value={form.legalName}
                  onChange={(event) => update("legalName", event.target.value)}
                />
              </AuthField>
            </>
          ) : (
            <>
              <div className="shc-auth-field-grid">
                <AuthField
                  id="needs-info-name"
                  label="Họ và tên"
                  required={requiredFields.includes("name")}
                  error={errors.name}
                >
                  <input
                    autoComplete="name"
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                  />
                </AuthField>
                <AuthField
                  id="needs-info-phone"
                  label="Số điện thoại"
                  required={requiredFields.includes("phone")}
                  error={errors.phone}
                >
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                  />
                </AuthField>
              </div>
              <AuthField
                id="needs-info-license"
                label="Mã chứng chỉ hành nghề"
                required={requiredFields.includes("license")}
                error={errors.license}
              >
                <input
                  value={form.license}
                  onChange={(event) => update("license", event.target.value)}
                />
              </AuthField>
              <div className="shc-auth-field-grid">
                <AuthField
                  id="needs-info-specialty"
                  label="Chuyên khoa"
                  required={requiredFields.includes("specialty")}
                  error={errors.specialty}
                >
                  <input
                    value={form.specialty}
                    onChange={(event) =>
                      update("specialty", event.target.value)
                    }
                  />
                </AuthField>
                <AuthField
                  id="needs-info-clinic"
                  label="Cơ sở y tế / phòng khám"
                  required={requiredFields.includes("clinic")}
                  error={errors.clinic}
                >
                  <input
                    value={form.clinic}
                    onChange={(event) => update("clinic", event.target.value)}
                  />
                </AuthField>
              </div>
            </>
          )}

          <AuthField
            id="needs-info-reason"
            label="Lý do đăng ký"
            required={requiredFields.includes("reason")}
            error={errors.reason}
          >
            <textarea
              rows={4}
              value={form.reason}
              onChange={(event) => update("reason", event.target.value)}
            />
          </AuthField>

          <div className="shc-auth-upload-section">
            <div className="shc-auth-section-heading">
              <span aria-hidden="true">
                <FileUp size={20} />
              </span>
              <div>
                <h2>Tài liệu bổ sung</h2>
                <p>Chỉ chọn khi quản trị viên yêu cầu tài liệu mới.</p>
              </div>
            </div>
            <label
              className="shc-auth-upload"
              data-selected={documentFile ? "true" : undefined}
            >
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                aria-invalid={Boolean(errors.document)}
                aria-describedby={
                  errors.document
                    ? "needs-info-document-error"
                    : "needs-info-document-hint"
                }
                onChange={selectDocument}
              />
              <FileUp size={24} aria-hidden="true" />
              <span>
                {documentFile ? documentFile.name : "Chọn tài liệu bổ sung"}
              </span>
              <small id="needs-info-document-hint">
                PDF, JPG hoặc PNG · tối đa 10 MB
              </small>
            </label>
            {errors.document ? (
              <p
                id="needs-info-document-error"
                className="shc-auth-field-error"
                role="alert"
              >
                {errors.document}
              </p>
            ) : null}
          </div>

          {errors.submit ? (
            <AuthAlert tone="error">{errors.submit}</AuthAlert>
          ) : null}
          {submitting && submissionStage ? (
            <AuthSubmissionStatus label={submissionStage} />
          ) : null}
          <AuthPrimaryButton
            type="submit"
            loading={submitting}
            loadingLabel="Đang gửi hồ sơ..."
          >
            Gửi lại hồ sơ
          </AuthPrimaryButton>
        </form>
      ) : null}

      {success ? <AuthAlert tone="success">{success}</AuthAlert> : null}
      {status !== "info_requested" && errors.submit ? (
        <AuthAlert tone="error">{errors.submit}</AuthAlert>
      ) : null}

      <div className="shc-auth-actions shc-auth-actions-stack">
        {status === "approved" ? (
          <Link to="/portal" className="shc-auth-primary-link">
            Mở portal
          </Link>
        ) : null}
        <AuthSecondaryButton
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? (
            <Loader2
              size={17}
              className="shc-auth-spinner"
              aria-hidden="true"
            />
          ) : null}
          <span>{loading ? "Đang cập nhật..." : "Cập nhật trạng thái"}</span>
        </AuthSecondaryButton>
        <Link to="/login" className="shc-auth-text-link">
          Về trang đăng nhập
        </Link>
      </div>
    </section>
  );
}
