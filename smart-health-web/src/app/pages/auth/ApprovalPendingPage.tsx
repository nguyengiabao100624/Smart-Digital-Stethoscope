import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileUp,
  Loader2,
  LogIn,
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
import { smartHealthApi, type ApiUser } from "../../../lib/smart-health-api";
import {
  createRoleRequestIdempotencyKey,
  parseRoleRequestReceipt,
  type RoleRequestIntent,
} from "../../../lib/role-request-contract";
import {
  createWorkspaceRequestIdempotencyKey,
  parseWorkspaceRequestReceipt,
} from "../../../lib/workspace-request-contract";
import {
  inspectRoleRequestDocument,
  parseRoleRequestDocumentReceipt,
  type RoleRequestDocumentIdentity,
} from "../../../lib/role-request-document-contract";
import { useAuth } from "../../context/AuthContext";
import { useSEO } from "@/lib/useSEO";

type ApprovalState =
  | "info_requested"
  | "rejected"
  | "approved"
  | "pending"
  | "invalid";

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

type ApprovalCheckpoint = {
  accountId: string;
  requestFingerprint: string;
  requestSent: boolean;
  roleRequestKey: string;
  workspaceRequestKey: string;
  canonicalOrganizationId: string;
  documentUploaded: boolean;
};

function emptyApprovalCheckpoint(accountId = ""): ApprovalCheckpoint {
  return {
    accountId,
    requestFingerprint: "",
    requestSent: false,
    roleRequestKey: "",
    workspaceRequestKey: "",
    canonicalOrganizationId: "",
    documentUploaded: false,
  };
}

function resolveApprovalStatus(raw?: ApiUser): ApprovalState {
  if (
    !raw ||
    typeof raw.id !== "string" ||
    !raw.id.trim() ||
    raw.accountStatus !== "active" ||
    (raw.requestedRole !== "doctor" && raw.requestedRole !== "workspace_owner")
  ) {
    return "invalid";
  }

  if (raw.roleRequestStatus === "needs_info") return "info_requested";
  if (raw.roleRequestStatus === "rejected") return "rejected";
  if (raw.roleRequestStatus === "pending") return "pending";
  if (raw.roleRequestStatus !== "approved") return "invalid";

  const membership = raw.currentMembership;
  const workspace = raw.currentWorkspace;
  const canonicalWorkspaceIds = [
    raw.organizationId,
    raw.currentWorkspaceId,
    membership?.workspaceId,
    membership?.organizationId,
    workspace?.id,
  ].map((value) => (typeof value === "string" ? value.trim() : ""));
  const effectiveRole = membership?.role;
  const hasPortalAuthority =
    Array.isArray(raw.allowedSurfaces) &&
    raw.allowedSurfaces.includes("portal");
  const hasOperationalMembership =
    membership?.operational === true &&
    membership.status === "active" &&
    membership.workspaceStatus === "active" &&
    (!membership.userId || membership.userId === raw.id);
  const hasOperationalWorkspace = workspace?.status === "active";
  const hasOneCanonicalWorkspace =
    canonicalWorkspaceIds.every(Boolean) &&
    new Set(canonicalWorkspaceIds).size === 1;
  return raw.role === raw.requestedRole &&
    effectiveRole === raw.requestedRole &&
    hasPortalAuthority &&
    hasOperationalMembership &&
    hasOperationalWorkspace &&
    hasOneCanonicalWorkspace
    ? "approved"
    : "invalid";
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
  const { user, isLoading, refreshUser } = useAuth();
  const activeUserIdRef = useRef("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionStage, setSubmissionStage] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [success, setSuccess] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentIdentity, setDocumentIdentity] =
    useState<RoleRequestDocumentIdentity | null>(null);
  const [documentCheck, setDocumentCheck] = useState<
    "idle" | "checking" | "ready" | "error"
  >("idle");
  const [changed, setChanged] = useState(false);
  const checkpoint = useRef<ApprovalCheckpoint>(emptyApprovalCheckpoint());
  const documentCheckRequest = useRef(0);
  activeUserIdRef.current = String(user?.raw.id || "");
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
  const status = resolveApprovalStatus(user?.raw);
  void state;
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
    const accountId = String(raw.id || "").trim();
    const hasAmbiguousCheckpoint = Boolean(
      checkpoint.current.roleRequestKey ||
      checkpoint.current.workspaceRequestKey ||
      checkpoint.current.requestSent,
    );
    if (checkpoint.current.accountId === accountId && hasAmbiguousCheckpoint) {
      return;
    }
    if (checkpoint.current.accountId !== accountId) {
      checkpoint.current = emptyApprovalCheckpoint(accountId);
    }
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
  }, [user?.raw]);

  const refresh = async () => {
    const expectedUserId = activeUserIdRef.current;
    setLoading(true);
    setErrors((current) => ({ ...current, submit: "" }));
    try {
      if (!expectedUserId || activeUserIdRef.current !== expectedUserId) {
        throw new Error("Không xác định được chủ sở hữu hồ sơ hiện tại.");
      }
      await refreshUser();
      if (activeUserIdRef.current !== expectedUserId) {
        throw new Error(
          "Tài khoản đã thay đổi trong khi cập nhật trạng thái hồ sơ.",
        );
      }
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
    const expectedUserId = String(user?.raw.id || "");
    const expectedToken = smartHealthApi.getTokenSnapshot();
    if (!expectedUserId) {
      setErrors({ submit: "Không xác định được chủ sở hữu hồ sơ hiện tại." });
      return;
    }
    if (!expectedToken) {
      setErrors({
        submit:
          "Không xác định được phiên xác thực hiện tại. Vui lòng đăng nhập lại.",
      });
      return;
    }
    setSubmitting(true);
    setErrors({});
    setSuccess("");

    try {
      const assertActiveUser = (message: string) => {
        if (
          activeUserIdRef.current !== expectedUserId ||
          smartHealthApi.getTokenSnapshot() !== expectedToken
        ) {
          throw new Error(message);
        }
      };

      assertActiveUser(
        "Tài khoản hoặc phiên xác thực đã thay đổi trước khi xác minh hồ sơ.",
      );
      setSubmissionStage("Đang xác minh phiên đăng nhập...");
      const authority = await smartHealthApi.me();
      assertActiveUser(
        "Tài khoản hoặc phiên xác thực đã thay đổi trong khi xác minh hồ sơ.",
      );
      if (String(authority.user?.id || "").trim() !== expectedUserId) {
        throw new Error(
          "Phiên xác thực hiện tại không thuộc tài khoản đang hiển thị. Chưa có thay đổi nào được gửi.",
        );
      }

      const requestFingerprint = isWorkspaceOwnerRequest
        ? JSON.stringify({
            accountId: expectedUserId,
            kind: "workspace",
            payload: {
              name: form.workspaceName.trim() || form.clinic.trim(),
              clinicName: form.workspaceName.trim() || form.clinic.trim(),
              workspaceType: String(user?.raw.workspaceType || "clinic"),
              address: form.address.trim(),
              phone: form.phone.trim(),
              email: form.email.trim() || user?.raw.email || "",
              representative: form.representative.trim() || form.name.trim(),
              legalName: form.legalName.trim(),
              metadata: { resubmissionReason: form.reason.trim() },
            },
          })
        : (() => {
            const workspaceType =
              String(
                user?.raw.workspaceType || user?.currentWorkspace?.type || "",
              ) === "solo_practice"
                ? "solo_practice"
                : "clinic";
            const organizationId = String(
              user?.raw.organizationId ||
                user?.raw.currentWorkspaceId ||
                user?.currentWorkspace?.id ||
                "",
            ).trim();
            const intent: RoleRequestIntent = {
              requestedRole: "doctor",
              accountType:
                workspaceType === "solo_practice" ? "solo_doctor" : "doctor",
              workspaceType,
              ...(workspaceType === "clinic" ? { organizationId } : {}),
            };
            return JSON.stringify({
              accountId: expectedUserId,
              kind: "role",
              payload: {
                ...intent,
                name: form.name.trim(),
                phone: form.phone.trim(),
                license: form.license.trim(),
                specialty: form.specialty.trim(),
                department: form.specialty.trim(),
                clinicName: form.clinic.trim(),
                hospital: form.clinic.trim(),
                reason: form.reason.trim(),
                registrationReason: form.reason.trim(),
              },
            });
          })();

      if (checkpoint.current.accountId !== expectedUserId) {
        checkpoint.current = emptyApprovalCheckpoint(expectedUserId);
      }
      if (checkpoint.current.requestFingerprint !== requestFingerprint) {
        checkpoint.current.requestFingerprint = requestFingerprint;
        checkpoint.current.requestSent = false;
        checkpoint.current.roleRequestKey = "";
        checkpoint.current.workspaceRequestKey = "";
        checkpoint.current.canonicalOrganizationId = "";
        checkpoint.current.documentUploaded = false;
      }

      if (!checkpoint.current.requestSent) {
        assertActiveUser(
          "Tài khoản đã thay đổi trước khi gửi hồ sơ. Yêu cầu cũ chưa được áp dụng.",
        );
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
          assertActiveUser(
            "Tài khoản đã thay đổi trong khi gửi hồ sơ. Kết quả cũ không được áp dụng.",
          );
          const receipt = parseWorkspaceRequestReceipt(response, {
            name: workspaceName,
            workspaceType,
          });
          if (receipt.user.id !== expectedUserId) {
            throw new Error(
              "Backend trả hồ sơ workspace không thuộc tài khoản hiện tại.",
            );
          }
          checkpoint.current.canonicalOrganizationId = receipt.workspace.id;
        } else {
          const workspaceType =
            String(
              user?.raw.workspaceType || user?.currentWorkspace?.type || "",
            ) === "solo_practice"
              ? "solo_practice"
              : "clinic";
          const organizationId = String(
            user?.raw.organizationId ||
              user?.raw.currentWorkspaceId ||
              user?.currentWorkspace?.id ||
              "",
          ).trim();
          if (workspaceType === "clinic" && !organizationId) {
            throw new Error(
              "Không xác định được workspace canonical của hồ sơ bác sĩ.",
            );
          }
          const intent: RoleRequestIntent = {
            requestedRole: "doctor",
            accountType:
              workspaceType === "solo_practice" ? "solo_doctor" : "doctor",
            workspaceType,
            ...(workspaceType === "clinic" ? { organizationId } : {}),
          };
          checkpoint.current.roleRequestKey ||=
            createRoleRequestIdempotencyKey();
          const response = await smartHealthApi.requestRole(
            {
              ...intent,
              name: form.name.trim(),
              phone: form.phone.trim(),
              license: form.license.trim(),
              specialty: form.specialty.trim(),
              department: form.specialty.trim(),
              clinicName: form.clinic.trim(),
              hospital: form.clinic.trim(),
              reason: form.reason.trim(),
              registrationReason: form.reason.trim(),
            },
            checkpoint.current.roleRequestKey,
          );
          assertActiveUser(
            "Tài khoản đã thay đổi trong khi gửi hồ sơ. Kết quả cũ không được áp dụng.",
          );
          const receipt = parseRoleRequestReceipt(
            response,
            intent,
            expectedUserId,
          );
          checkpoint.current.canonicalOrganizationId =
            receipt.user.organizationId;
        }
        assertActiveUser(
          "Tài khoản đã thay đổi trong khi gửi hồ sơ. Kết quả cũ không được áp dụng.",
        );
        checkpoint.current.requestSent = true;
      }

      if (documentFile && !checkpoint.current.documentUploaded) {
        if (!documentIdentity) {
          throw new Error(
            "Nội dung tài liệu chưa được kiểm tra. Vui lòng chọn lại tệp.",
          );
        }
        assertActiveUser(
          "Tài khoản đã thay đổi trước khi tải tài liệu. Yêu cầu cũ chưa được áp dụng.",
        );
        setSubmissionStage("Đang tải tài liệu bổ sung...");
        if (!checkpoint.current.canonicalOrganizationId) {
          throw new Error(
            "Không xác định được workspace canonical của tài liệu bổ sung.",
          );
        }
        const response = await smartHealthApi.uploadRoleRequestDocument(
          documentFile,
          documentIdentity.idempotencyKey,
        );
        assertActiveUser(
          "Tài khoản đã thay đổi trong khi tải tài liệu. Kết quả cũ không được áp dụng.",
        );
        parseRoleRequestDocumentReceipt(response, {
          userId: expectedUserId,
          organizationId: checkpoint.current.canonicalOrganizationId,
          identity: documentIdentity,
        });
        checkpoint.current.documentUploaded = true;
      }

      assertActiveUser(
        "Tài khoản đã thay đổi trước khi cập nhật trạng thái hồ sơ.",
      );
      setSubmissionStage("Đang cập nhật trạng thái hồ sơ...");
      await refreshUser();
      assertActiveUser(
        "Tài khoản đã thay đổi trong khi cập nhật trạng thái hồ sơ.",
      );
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
    const requestId = ++documentCheckRequest.current;
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setDocumentFile(null);
      setDocumentIdentity(null);
      setDocumentCheck("idle");
      return;
    }
    if (!acceptedDocumentTypes.has(file.type)) {
      setDocumentFile(null);
      setDocumentIdentity(null);
      setDocumentCheck("error");
      checkpoint.current.documentUploaded = false;
      setErrors((current) => ({
        ...current,
        document: "Tài liệu cần là PDF, JPG hoặc PNG.",
      }));
      event.target.value = "";
      return;
    }
    if (file.size > maxDocumentSize) {
      setDocumentFile(null);
      setDocumentIdentity(null);
      setDocumentCheck("error");
      checkpoint.current.documentUploaded = false;
      setErrors((current) => ({
        ...current,
        document: "Tài liệu không được vượt quá 10 MB.",
      }));
      event.target.value = "";
      return;
    }
    setDocumentFile(file);
    setDocumentIdentity(null);
    setDocumentCheck("checking");
    setErrors((current) => ({ ...current, document: "", submit: "" }));
    setChanged(true);
    checkpoint.current.documentUploaded = false;
    void inspectRoleRequestDocument(file)
      .then((identity) => {
        if (documentCheckRequest.current !== requestId) return;
        setDocumentIdentity(identity);
        setDocumentCheck("ready");
      })
      .catch((error) => {
        if (documentCheckRequest.current !== requestId) return;
        setDocumentIdentity(null);
        setDocumentCheck("error");
        setErrors((current) => ({
          ...current,
          document: getSafeAuthErrorMessage(
            error,
            "Không thể kiểm tra nội dung tài liệu. Vui lòng chọn lại tệp.",
          ),
        }));
      });
  };

  if (isLoading) {
    return (
      <section className="shc-auth-page shc-auth-approval-page">
        <AuthPageIntro
          icon={Clock3}
          title="Đang kiểm tra phiên tài khoản"
          description="Shcare đang xác nhận danh tính trước khi tải trạng thái hồ sơ."
        />
        <AuthSubmissionStatus label="Đang tải trạng thái đã được xác nhận..." />
      </section>
    );
  }

  if (!user) {
    return (
      <section className="shc-auth-page shc-auth-approval-page">
        <AuthPageIntro
          icon={LogIn}
          title="Đăng nhập để xem trạng thái hồ sơ"
          description="Shcare chỉ hiển thị trạng thái duyệt sau khi xác nhận đúng tài khoản."
        />
        <AuthAlert tone="info">
          URL này không tự chứng minh rằng hồ sơ đang chờ duyệt, đã được duyệt
          hay bị từ chối.
        </AuthAlert>
        <div className="shc-auth-actions shc-auth-actions-stack">
          <Link to="/login" className="shc-auth-primary-link">
            Đăng nhập
          </Link>
          <Link to="/quen-mat-khau" className="shc-auth-text-link">
            Khôi phục mật khẩu
          </Link>
        </div>
      </section>
    );
  }

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
          : status === "pending"
            ? {
                icon: Clock3,
                tone: "info" as const,
                title: `${subjectLabel} đang chờ duyệt`,
                description:
                  "Trạng thái này được lấy từ hồ sơ hiện tại trên hệ thống Shcare.",
              }
            : {
                icon: ShieldAlert,
                tone: "error" as const,
                title: "Không thể xác minh trạng thái hồ sơ",
                description:
                  "Backend chưa trả lifecycle, vai trò và quyền portal hợp lệ cho tài khoản hiện tại. Vui lòng cập nhật lại trạng thái.",
              };

  return (
    <section className="shc-auth-page shc-auth-approval-page">
      <AuthUnsavedChangesGuard when={changed && !submitting} />
      <AuthPageIntro
        icon={config.icon}
        title={config.title}
        description={config.description}
      />
      {status !== "invalid" ? (
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
      ) : null}

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
                {documentCheck === "checking"
                  ? "Đang kiểm tra nội dung tài liệu..."
                  : documentCheck === "ready"
                    ? "Nội dung tài liệu đã được kiểm tra."
                    : "PDF, JPG hoặc PNG · tối đa 10 MB"}
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
            disabled={Boolean(documentFile && !documentIdentity)}
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
