import { cloneElement, useEffect, useMemo, useState, type ReactElement } from "react";
import { CheckCircle, Clock, Loader2, Upload, XCircle } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { useAuth } from "../../context/AuthContext";

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
const defaultWorkspaceRequiredFields = ["workspaceName", "address", "representative", "phone"];

function normalizeStatus(status?: unknown, fallback?: ApprovalState): ApprovalState {
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
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
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
    const normalized = raw
      .map((field) => String(field))
      .filter((field) => fieldLabels[field]);
    if (normalized.length) return normalized;
    return isWorkspaceOwnerRequest ? defaultWorkspaceRequiredFields : defaultRequiredFields;
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
      clinic: String(raw.hospital || raw.clinicName || raw.currentWorkspace?.name || ""),
      workspaceName: String(raw.currentWorkspace?.name || raw.clinicName || raw.hospital || ""),
      address: String(raw.currentWorkspace?.address || raw.address || ""),
      representative: String(raw.currentWorkspace?.representative || raw.name || ""),
      legalName: String(raw.currentWorkspace?.legalName || raw.legalName || ""),
      reason: String(raw.registrationReason || ""),
    });
  }, [user?.raw]);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      await refreshUser();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật trạng thái.");
    } finally {
      setLoading(false);
    }
  };

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setSuccess("");
  };

  const submitMoreInfo = async () => {
    const missing = requiredFields.filter((field) => {
      const key = field === "clinic" ? "clinic" : field;
      return !String(form[key as keyof typeof form] || "").trim();
    });
    if (missing.length) {
      setError(`Vui lòng bổ sung: ${missing.map((field) => fieldLabels[field]).join(", ")}.`);
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      if (isWorkspaceOwnerRequest) {
        const workspaceType = String(user?.raw.workspaceType || "clinic");
        await smartHealthApi.requestWorkspace({
          name: form.workspaceName.trim() || form.clinic.trim(),
          clinicName: form.workspaceName.trim() || form.clinic.trim(),
          workspaceType,
          address: form.address.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || user?.raw.email || "",
          representative: form.representative.trim() || form.name.trim(),
          legalName: form.legalName.trim(),
          metadata: {
            resubmissionReason: form.reason.trim(),
          },
        });
      } else {
        const workspaceType =
          String(user?.raw.workspaceType || user?.currentWorkspace?.type || "") === "solo_practice"
            ? "solo_practice"
            : "clinic";
        await smartHealthApi.requestRole({
          requestedRole: "doctor",
          accountType: workspaceType === "solo_practice" ? "solo_doctor" : "doctor",
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
      if (documentFile) {
        await smartHealthApi.uploadRoleRequestDocument(documentFile);
      }
      await refreshUser();
      setSuccess("Đã gửi lại hồ sơ. Trạng thái đã chuyển về chờ duyệt.");
      navigate("/cho-duyet", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gửi lại hồ sơ.");
    } finally {
      setSubmitting(false);
    }
  };

  const subjectLabel = isWorkspaceOwnerRequest ? "Workspace" : "Hồ sơ";
  const config =
    status === "approved"
      ? {
          icon: CheckCircle,
          color: "#00FFD1",
          title: `${subjectLabel} đã được duyệt`,
          text: "Tài khoản đã có quyền truy cập portal.",
        }
      : status === "rejected"
        ? {
            icon: XCircle,
            color: "#FF6B6B",
            title: `${subjectLabel} bị từ chối`,
            text: String(
              user?.raw.roleRejectReason || "Liên hệ quản trị viên để biết thêm chi tiết.",
            ),
          }
        : status === "info_requested"
          ? {
              icon: Clock,
              color: "#F59E0B",
              title: "Cần bổ sung thông tin",
              text: String(
                user?.raw.roleInfoRequestMessage || "Quản trị viên yêu cầu cập nhật hồ sơ.",
              ),
            }
          : {
              icon: Clock,
              color: "#4AA4E0",
              title: `${subjectLabel} đang chờ duyệt`,
              text: "Trạng thái được lấy trực tiếp từ backend Smart Health.",
            };
  const Icon = config.icon;

  return (
    <div className="py-5">
      <div className="text-center">
        <Icon size={48} className="mx-auto mb-5" style={{ color: config.color }} />
        <h1 className="text-2xl font-black text-white">{config.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/70">{config.text}</p>
      </div>

      {status === "info_requested" && (
        <form
          method="post"
          className="mt-7 space-y-4 rounded-2xl border border-white/10 bg-white/8 p-5 text-left backdrop-blur-md"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMoreInfo();
          }}
        >
          <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3 text-xs leading-relaxed text-[#FDE68A]">
            Admin yêu cầu bổ sung:{" "}
            <span className="font-semibold">
              {requiredFields.map((field) => fieldLabels[field]).join(", ")}
            </span>
          </div>

          {isWorkspaceOwnerRequest ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoField label="Tên workspace/cơ sở" required={requiredFields.includes("workspaceName")}>
                  <input
                    id="needs-info-workspace-name"
                    name="needsInfoWorkspaceName"
                    value={form.workspaceName}
                    onChange={(event) => update("workspaceName", event.target.value)}
                  />
                </InfoField>
                <InfoField label="Số điện thoại" required={requiredFields.includes("phone")}>
                  <input
                    id="needs-info-phone"
                    name="needsInfoPhone"
                    autoComplete="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                  />
                </InfoField>
              </div>

              <InfoField label="Địa chỉ pháp lý" required={requiredFields.includes("address")}>
                <input
                  id="needs-info-address"
                  name="needsInfoAddress"
                  value={form.address}
                  onChange={(event) => update("address", event.target.value)}
                />
              </InfoField>

              <div className="grid gap-4 sm:grid-cols-2">
                <InfoField label="Người đại diện" required={requiredFields.includes("representative")}>
                  <input
                    id="needs-info-representative"
                    name="needsInfoRepresentative"
                    value={form.representative}
                    onChange={(event) => update("representative", event.target.value)}
                  />
                </InfoField>
                <InfoField label="Email" required={requiredFields.includes("email")}>
                  <input
                    id="needs-info-email"
                    name="needsInfoEmail"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                  />
                </InfoField>
              </div>

              <InfoField label="Mã số pháp lý" required={requiredFields.includes("legalName")}>
                <input
                  id="needs-info-legal-name"
                  name="needsInfoLegalName"
                  value={form.legalName}
                  onChange={(event) => update("legalName", event.target.value)}
                />
              </InfoField>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoField label="Họ và tên" required={requiredFields.includes("name")}>
                  <input
                    id="needs-info-name"
                    name="needsInfoName"
                    autoComplete="name"
                    value={form.name}
                    onChange={(event) => update("name", event.target.value)}
                  />
                </InfoField>
                <InfoField label="Số điện thoại" required={requiredFields.includes("phone")}>
                  <input
                    id="needs-info-phone"
                    name="needsInfoPhone"
                    autoComplete="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                  />
                </InfoField>
              </div>

              <InfoField label="Mã chứng chỉ hành nghề" required={requiredFields.includes("license")}>
                <input
                  id="needs-info-license"
                  name="needsInfoLicense"
                  value={form.license}
                  onChange={(event) => update("license", event.target.value)}
                />
              </InfoField>

              <div className="grid gap-4 sm:grid-cols-2">
                <InfoField label="Chuyên khoa" required={requiredFields.includes("specialty")}>
                  <input
                    id="needs-info-specialty"
                    name="needsInfoSpecialty"
                    value={form.specialty}
                    onChange={(event) => update("specialty", event.target.value)}
                  />
                </InfoField>
                <InfoField label="Cơ sở y tế / phòng khám" required={requiredFields.includes("clinic")}>
                  <input
                    id="needs-info-clinic"
                    name="needsInfoClinic"
                    value={form.clinic}
                    onChange={(event) => update("clinic", event.target.value)}
                  />
                </InfoField>
              </div>
            </>
          )}

          <InfoField label="Lý do đăng ký" required={requiredFields.includes("reason")}>
            <textarea
              id="needs-info-reason"
              name="needsInfoReason"
              rows={3}
              value={form.reason}
              onChange={(event) => update("reason", event.target.value)}
              className="min-h-24 resize-none py-3"
            />
          </InfoField>

          <label className="block rounded-xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-white/75">
            <span className="mb-2 flex items-center gap-2 font-semibold text-white">
              <Upload size={16} />
              Tài liệu bổ sung
            </span>
            <input
              id="needs-info-document"
              name="needsInfoDocument"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="block w-full text-xs text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-[#00FFD1] file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#0d1a30]"
              onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
            />
            {documentFile && <span className="mt-2 block text-xs text-[#B9FFF1]">{documentFile.name}</span>}
          </label>

          <button
            id="needs-info-submit"
            type="submit"
            disabled={submitting}
            className="premium-button flex w-full items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Gửi lại hồ sơ
          </button>
        </form>
      )}

      {success && <p className="mt-4 rounded-xl border border-[#00FFD1]/30 bg-[#00FFD1]/10 p-3 text-xs text-[#B9FFF1]">{success}</p>}
      {error && <p className="mt-4 rounded-xl border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 p-3 text-xs text-[#FF9A9A]">{error}</p>}

      <div className="mt-7 grid gap-3">
        {status === "approved" && (
          <Link to="/portal" className="premium-button">
            Mở portal
          </Link>
        )}
        <button
          onClick={refresh}
          disabled={loading}
          className="flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 text-sm text-white"
        >
          {loading && <Loader2 size={15} className="animate-spin" />}
          Cập nhật trạng thái
        </button>
        <Link to="/login" className="text-center text-xs text-white/60">
          Về đăng nhập
        </Link>
      </div>
    </div>
  );
}

function InfoField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactElement<{
    className?: string;
    id?: string;
    name?: string;
    "aria-required"?: boolean;
  }>;
}) {
  const fieldClass =
    "w-full rounded-xl border border-white/10 bg-white/8 px-4 text-sm text-white outline-none transition-all backdrop-blur-md placeholder:text-white/25 focus:border-[#00FFD1]/50 focus:ring-1 focus:ring-[#00FFD1]/50";

  return (
    <label htmlFor={children.props.id} className="block text-sm text-white">
      <span className="mb-2 block">
        {label} {required && <span className="text-[#F59E0B]">*</span>}
      </span>
      {cloneElement(children, {
        "aria-required": required || undefined,
        className: `${fieldClass} ${children.type === "textarea" ? "py-3" : "h-12"} ${children.props.className || ""}`,
      })}
    </label>
  );
}
