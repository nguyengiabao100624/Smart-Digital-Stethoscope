import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRef } from "react";
import {
  Search,
  Filter,
  Plus,
  MoreVertical,
  Stethoscope,
  Mail,
  Phone,
  Building2,
  Calendar,
  Eye,
  Trash2,
  Lock,
  LockOpen,
  X,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Clipboard,
  Loader2,
  RotateCcw,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { AddDoctorDialog } from "./dialogs/AddDoctorDialog";
import { PageHeader, StatusBadge } from "./design-system";
import { PaginationFooter } from "./PaginationFooter";
import { ADMIN_TABLE_PAGE_SIZE, paginateItems } from "./pagination-utils";
import {
  smartHealthApi,
  type SmartHealthAuthUser,
  type SmartHealthFirebaseReconciliation,
  type SmartHealthStaffInvitation,
  type SmartHealthStaffInvitationDelivery,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  assertDoctorAccountStateOutcome,
  assertDoctorDeleteOutcome,
  assertStaffInvitationStatusOutcome,
  createStaffOperationIdempotencyKey,
  parseFirebaseReconciliationOutcome,
  parseStaffInvitationList,
  parseStaffInvitationOutcome,
} from "@/lib/staff-operations";
import { CapabilityGate } from "./AdminAccessContext";
import { useAdminAccess } from "./useAdminAccess";
import { PLATFORM_USER_MANAGE_CAPABILITIES, STAFF_MANAGE_CAPABILITIES } from "./action-permissions";

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  clinic: string;
  phone: string;
  email: string;
  status: "active" | "inactive" | "unknown";
  patientsCount: number | null;
  measurementsCount: number | null;
  joinDate: string;
  avatarColor: string;
};

function formatDate(value?: string) {
  if (!value) return "Chưa ghi nhận";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function toDoctor(user: SmartHealthAuthUser): Doctor {
  return {
    id: user.id,
    name: user.name || user.email || "Bác sĩ chưa cập nhật tên",
    specialty: user.department || user.specialty || "",
    clinic: user.hospital || user.clinicName || "",
    phone: user.phone || "Chưa cung cấp",
    email: user.email || "Chưa có email",
    status:
      user.accountStatus === "locked"
        ? "inactive"
        : user.accountStatus === "active"
          ? "active"
          : "unknown",
    patientsCount: user.patientsCount ?? null,
    measurementsCount: user.measurementsCount ?? null,
    joinDate: formatDate(user.roleApprovedAt || user.updatedAt || user.createdAt),
    avatarColor: "bg-blue-100 text-blue-600",
  };
}

function formatOptionalMetric(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("vi-VN") : "—";
}

function getInvitationStatusBadge(status: SmartHealthStaffInvitation["status"]) {
  if (status === "accepted") return <StatusBadge label="Đã chấp nhận" tone="success" />;
  if (status === "revoked") return <StatusBadge label="Đã thu hồi" tone="error" />;
  if (status === "expired") return <StatusBadge label="Đã hết hạn" tone="warning" />;
  return <StatusBadge label="Đang chờ" tone="warning" />;
}

function getDeliveryLabel(delivery?: SmartHealthStaffInvitationDelivery) {
  if (!delivery) return "Chưa ghi nhận";
  if (delivery.email === "sent") return "Provider đã gửi";
  if (delivery.email === "ready") return "Sẵn sàng gửi";
  if (delivery.email === "failed") return "Gửi thất bại";
  return "Chưa có provider";
}

export function Doctors() {
  const { currentUser, hasAnyCapability } = useAdminAccess();
  const canManageStaff = hasAnyCapability(STAFF_MANAGE_CAPABILITIES);
  const canManagePlatformUsers = hasAnyCapability(PLATFORM_USER_MANAGE_CAPABILITIES);
  const currentWorkspaceId =
    currentUser?.currentWorkspaceId ||
    currentUser?.currentMembership?.organizationId ||
    currentUser?.currentMembership?.workspaceId ||
    currentUser?.organizationId ||
    currentUser?.workspaceId ||
    "";
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSpecialty, setFilterSpecialty] = useState("all");
  const [filterClinic, setFilterClinic] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [invitations, setInvitations] = useState<SmartHealthStaffInvitation[]>([]);
  const [loadError, setLoadError] = useState("");
  const [invitationLoadError, setInvitationLoadError] = useState("");
  const [invitationActionError, setInvitationActionError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isInvitationsLoading, setIsInvitationsLoading] = useState(true);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconciliation, setReconciliation] = useState<SmartHealthFirebaseReconciliation | null>(
    null,
  );
  const [invitationActionId, setInvitationActionId] = useState("");
  const [manualAcceptance, setManualAcceptance] = useState<{
    invitationId: string;
    email: string;
    url: string;
    delivery: SmartHealthStaffInvitationDelivery;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const invitationAttemptRef = useRef(new Map<string, string>());
  const [confirmAction, setConfirmAction] = useState<null | {
    title: string;
    description: string;
    confirm: string;
    tone?: "danger" | "success";
    action: () => Promise<void>;
  }>(null);

  const handleConfirmAction = async () => {
    if (confirmAction && !isConfirming) {
      setIsConfirming(true);
      setConfirmError("");
      try {
        await confirmAction.action();
        setConfirmAction(null);
      } catch (error) {
        setConfirmError(toVietnameseErrorMessage(error, "Không thể hoàn tất thao tác nhân sự."));
      } finally {
        setIsConfirming(false);
      }
    }
  };

  const loadDoctors = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await smartHealthApi.listApprovedDoctors();
      setDoctors(response.doctors.map(toDoctor));
      setLoadError("");
    } catch (error) {
      setDoctors([]);
      setLoadError(toVietnameseErrorMessage(error, "Không thể tải danh sách bác sĩ đã duyệt."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadInvitations = useCallback(async () => {
    setIsInvitationsLoading(true);
    try {
      const response = await smartHealthApi.listStaffInvitations({ role: "doctor" });
      setInvitations(parseStaffInvitationList(response));
      setInvitationLoadError("");
    } catch (error) {
      setInvitations([]);
      setInvitationLoadError(
        toVietnameseErrorMessage(error, "Không thể tải danh sách lời mời bác sĩ."),
      );
    } finally {
      setIsInvitationsLoading(false);
    }
  }, []);

  const handleSyncFirebase = async () => {
    if (!canManagePlatformUsers) {
      toast.error("Tài khoản không có quyền đồng bộ Firebase.");
      return;
    }
    setIsReconciling(true);
    try {
      const report = parseFirebaseReconciliationOutcome(await smartHealthApi.syncFirebase());
      setReconciliation(report);
      const mismatchCount = report.missingProviderAccountCount + report.missingBackendAccountCount;
      if (mismatchCount > 0) {
        toast.warning(`Đối soát hoàn tất: phát hiện ${mismatchCount} tài khoản cần kiểm tra.`);
      } else {
        toast.success("Đối soát hoàn tất, chưa phát hiện tài khoản lệch giữa hai nguồn.");
      }
    } catch (e) {
      toast.error(toVietnameseErrorMessage(e, "Không thể đối soát Firebase."));
    } finally {
      setIsReconciling(false);
    }
  };

  const handleDelete = (doc: Doctor) => {
    if (!canManagePlatformUsers) {
      toast.error("Chỉ Platform Admin mới có quyền xóa danh tính bác sĩ.");
      return;
    }
    const idempotencyKey = createStaffOperationIdempotencyKey("doctor-delete", doc.id);
    setConfirmError("");
    setConfirmAction({
      title: "Xóa bác sĩ và tài khoản Firebase",
      description: `Bạn có chắc chắn muốn xóa bác sĩ ${doc.name}? Hệ thống sẽ xóa hồ sơ backend, phiên đăng nhập, phân quyền và tài khoản Firebase Auth nếu tài khoản đã liên kết. Hành động này không thể hoàn tác.`,
      confirm: "Xóa bác sĩ",
      tone: "danger",
      action: async () => {
        const result = await smartHealthApi.deleteDoctor(doc.id, idempotencyKey);
        assertDoctorDeleteOutcome(result, doc.id);
        if (selectedDoctor?.id === doc.id) setSelectedDoctor(null);
        await loadDoctors();
        if (result.warning) {
          toast.warning(result.warning);
        } else if (result.firebaseDeleted) {
          toast.success("Backend và Firebase Auth đã xác nhận xóa danh tính bác sĩ.");
        } else if (result.firebaseAlreadyMissing) {
          toast.success("Backend đã xóa bác sĩ; tài khoản Firebase đã không còn tồn tại.");
        } else {
          toast.success("Backend đã xác nhận xóa dữ liệu bác sĩ.");
        }
      },
    });
  };

  const handleLock = (doc: Doctor) => {
    if (!canManagePlatformUsers) {
      toast.error("Chỉ Platform Admin mới có quyền khóa danh tính bác sĩ.");
      return;
    }
    const idempotencyKey = createStaffOperationIdempotencyKey("doctor-lock", doc.id);
    setConfirmError("");
    setConfirmAction({
      title: "Khóa tài khoản",
      description: `Khóa tài khoản ${doc.name}? Họ sẽ không thể đăng nhập với quyền bác sĩ nữa.`,
      confirm: "Khóa tài khoản",
      tone: "danger",
      action: async () => {
        const result = await smartHealthApi.lockDoctor(doc.id, idempotencyKey);
        assertDoctorAccountStateOutcome(result, doc.id, "locked");
        if (selectedDoctor?.id === doc.id) setSelectedDoctor(null);
        await loadDoctors();
        if (result.warning) {
          toast.warning(result.warning);
        } else {
          toast.success("Backend đã xác nhận khóa tài khoản bác sĩ.");
        }
      },
    });
  };

  const handleUnlock = (doc: Doctor) => {
    if (!canManagePlatformUsers) {
      toast.error("Chỉ Platform Admin mới có quyền mở khóa danh tính bác sĩ.");
      return;
    }
    const idempotencyKey = createStaffOperationIdempotencyKey("doctor-unlock", doc.id);
    setConfirmError("");
    setConfirmAction({
      title: "Mở khóa tài khoản",
      description: `Khôi phục quyền bác sĩ cho ${doc.name}? Họ sẽ có thể đăng nhập lại vào hệ thống dành cho bác sĩ.`,
      confirm: "Mở khóa tài khoản",
      tone: "success",
      action: async () => {
        const result = await smartHealthApi.unlockDoctor(doc.id, idempotencyKey);
        assertDoctorAccountStateOutcome(result, doc.id, "active");
        if (selectedDoctor?.id === doc.id) setSelectedDoctor(null);
        await loadDoctors();
        if (result.warning) {
          toast.warning(result.warning);
        } else {
          toast.success("Backend đã xác nhận mở khóa tài khoản bác sĩ.");
        }
      },
    });
  };

  useEffect(() => {
    void loadDoctors();
    void loadInvitations();
  }, [loadDoctors, loadInvitations]);

  const handleResendInvitation = async (invitation: SmartHealthStaffInvitation) => {
    const attemptId = `resend:${invitation.id}`;
    const idempotencyKey =
      invitationAttemptRef.current.get(attemptId) ||
      createStaffOperationIdempotencyKey("invite-resend", invitation.id);
    invitationAttemptRef.current.set(attemptId, idempotencyKey);
    setInvitationActionId(attemptId);
    setInvitationActionError("");
    try {
      const outcome = parseStaffInvitationOutcome(
        await smartHealthApi.resendStaffInvitation(invitation.id, idempotencyKey),
        {
          organizationId: invitation.organizationId,
          email: invitation.email,
          role: invitation.role,
        },
      );
      invitationAttemptRef.current.delete(attemptId);
      if (outcome.acceptanceUrl) {
        setManualAcceptance({
          invitationId: invitation.id,
          email: invitation.email,
          url: outcome.acceptanceUrl,
          delivery: outcome.delivery,
        });
      }
      await loadInvitations();
      if (outcome.delivery.email === "sent") {
        toast.success("Provider đã xác nhận gửi lại email lời mời.");
      } else {
        toast.warning("Đã tạo lượt gửi lại nhưng email chưa được xác nhận là đã gửi.");
      }
    } catch (error) {
      setInvitationActionError(toVietnameseErrorMessage(error, "Không thể gửi lại lời mời."));
    } finally {
      setInvitationActionId("");
    }
  };

  const handleRevokeInvitation = (invitation: SmartHealthStaffInvitation) => {
    const attemptId = `revoke:${invitation.id}`;
    const idempotencyKey =
      invitationAttemptRef.current.get(attemptId) ||
      createStaffOperationIdempotencyKey("invite-revoke", invitation.id);
    invitationAttemptRef.current.set(attemptId, idempotencyKey);
    setConfirmError("");
    setConfirmAction({
      title: "Thu hồi lời mời",
      description: `Thu hồi lời mời dành cho ${invitation.email}? Liên kết chưa sử dụng sẽ không còn hợp lệ.`,
      confirm: "Thu hồi lời mời",
      tone: "danger",
      action: async () => {
        const response = await smartHealthApi.revokeStaffInvitation(
          invitation.id,
          "Thu hồi bởi quản trị viên",
          idempotencyKey,
        );
        assertStaffInvitationStatusOutcome(response, invitation.id, "revoked");
        invitationAttemptRef.current.delete(attemptId);
        if (manualAcceptance?.invitationId === invitation.id) setManualAcceptance(null);
        await loadInvitations();
        toast.success("Backend đã xác nhận thu hồi lời mời.");
      },
    });
  };

  const copyManualAcceptance = async () => {
    if (!manualAcceptance) return;
    try {
      await navigator.clipboard.writeText(manualAcceptance.url);
      toast.success("Đã sao chép liên kết một lần.");
    } catch {
      toast.error("Không thể sao chép tự động. Hãy chọn và sao chép thủ công.");
    }
  };

  const specialtyOptions = useMemo(
    () =>
      [...new Set(doctors.map((doctor) => doctor.specialty).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "vi"),
      ),
    [doctors],
  );
  const clinicOptions = useMemo(
    () =>
      [...new Set(doctors.map((doctor) => doctor.clinic).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "vi"),
      ),
    [doctors],
  );

  const filteredDoctors = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return doctors.filter((doc) => {
      const matchesSearch =
        !keyword ||
        doc.name.toLowerCase().includes(keyword) ||
        doc.email.toLowerCase().includes(keyword) ||
        doc.phone.toLowerCase().includes(keyword);
      const matchesStatus = filterStatus === "all" || doc.status === filterStatus;
      const matchesSpecialty = filterSpecialty === "all" || doc.specialty === filterSpecialty;
      const matchesClinic = filterClinic === "all" || doc.clinic === filterClinic;
      return matchesSearch && matchesStatus && matchesSpecialty && matchesClinic;
    });
  }, [doctors, filterClinic, filterSpecialty, filterStatus, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterSpecialty, filterClinic, filterStatus, doctors.length]);

  const pagedDoctors = useMemo(
    () => paginateItems(filteredDoctors, page, ADMIN_TABLE_PAGE_SIZE),
    [filteredDoctors, page],
  );

  return (
    <div className="space-y-6 h-full flex flex-col relative">
      <PageHeader
        eyebrow="Tài khoản đã duyệt"
        title="Quản lý bác sĩ"
        description="Theo dõi bác sĩ đã duyệt, mời nhân sự vào workspace và quản lý trạng thái danh tính theo đúng quyền."
        action={
          <div className="flex items-center gap-2">
            <CapabilityGate capabilities={PLATFORM_USER_MANAGE_CAPABILITIES}>
              <button
                onClick={handleSyncFirebase}
                disabled={isReconciling}
                className="flex items-center gap-2 bg-card border border-border text-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isReconciling ? "animate-spin" : ""}`} />
                {isReconciling ? "Đang đối soát..." : "Đối soát Firebase"}
              </button>
            </CapabilityGate>
            <CapabilityGate capabilities={STAFF_MANAGE_CAPABILITIES}>
              <button
                onClick={() => setAddDialogOpen(true)}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Mời bác sĩ
              </button>
            </CapabilityGate>
          </div>
        }
      />

      {loadError && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#B45309]">
          Chưa tải được danh sách bác sĩ đã duyệt từ backend. Trang không dùng dữ liệu mẫu để tránh
          hiển thị sai: {loadError}
        </div>
      )}

      {reconciliation && (
        <section
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
          aria-live="polite"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Kết quả đối soát Firebase</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Chế độ chỉ báo cáo; không tài khoản nào bị xóa hoặc thay đổi.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-border bg-muted/40 px-3 py-1.5">
                Firebase: {reconciliation.providerAccountCount}
              </span>
              <span className="rounded-full border border-border bg-muted/40 px-3 py-1.5">
                Backend liên kết: {reconciliation.backendLinkedAccountCount}
              </span>
              <span className="rounded-full border border-warning/25 bg-warning/10 px-3 py-1.5 text-[#B45309]">
                Thiếu trên Firebase: {reconciliation.missingProviderAccountCount}
              </span>
              <span className="rounded-full border border-warning/25 bg-warning/10 px-3 py-1.5 text-[#B45309]">
                Thiếu trên backend: {reconciliation.missingBackendAccountCount}
              </span>
            </div>
          </div>
          {reconciliation.resultsTruncated && (
            <p className="mt-3 text-xs text-warning">
              Kết quả chi tiết đã được giới hạn; dùng audit/export có quyền để kiểm tra toàn bộ.
            </p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">Lời mời bác sĩ</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tài khoản chỉ trở thành thành viên sau khi đúng người nhận xác thực và chấp nhận lời
              mời.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadInvitations()}
            disabled={isInvitationsLoading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isInvitationsLoading ? "animate-spin" : ""}`} />
            Tải lại
          </button>
        </div>

        {(invitationLoadError || invitationActionError) && (
          <div
            role="alert"
            className="m-4 rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm text-[#B45309]"
          >
            {invitationActionError || invitationLoadError}
          </div>
        )}

        {manualAcceptance && (
          <div className="m-4 rounded-xl border border-warning/25 bg-warning/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Liên kết chấp nhận một lần
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {manualAcceptance.email} · {getDeliveryLabel(manualAcceptance.delivery)}. Chỉ
                  chuyển liên kết này cho đúng người nhận bằng kênh an toàn.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualAcceptance(null)}
                aria-label="Ẩn liên kết một lần"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                aria-label="Liên kết chấp nhận lời mời một lần"
                value={manualAcceptance.url}
                className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs"
              />
              <button
                type="button"
                onClick={copyManualAcceptance}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <Clipboard className="h-4 w-4" /> Sao chép
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Người nhận</th>
                <th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Hết hạn</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invitations.map((invitation) => (
                <tr key={invitation.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {invitation.name || "Chưa cung cấp tên"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{invitation.email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {invitation.organizationId}
                  </td>
                  <td className="px-4 py-3">{getInvitationStatusBadge(invitation.status)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {getDeliveryLabel(invitation.delivery)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(invitation.expiresAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManageStaff && invitation.status === "pending" ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleResendInvitation(invitation)}
                          disabled={Boolean(invitationActionId)}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                        >
                          {invitationActionId === `resend:${invitation.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          Gửi lại
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeInvitation(invitation)}
                          disabled={Boolean(invitationActionId)}
                          className="min-h-10 rounded-md px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          Thu hồi
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Không có thao tác</span>
                    )}
                  </td>
                </tr>
              ))}
              {isInvitationsLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Đang tải lời mời từ backend...
                  </td>
                </tr>
              )}
              {!isInvitationsLoading && !invitationLoadError && invitations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Chưa có lời mời bác sĩ nào trong phạm vi được phép xem.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center bg-muted/20">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm tên bác sĩ, email, SĐT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-shadow"
            />
          </div>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button className="flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex-shrink-0">
                <Filter className="w-4 h-4" /> Lọc
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="bg-popover border border-border rounded-lg shadow-lg p-4 w-80 z-50 mr-4"
                sideOffset={5}
              >
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Bộ lọc</h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Chuyên khoa
                      </label>
                      <select
                        value={filterSpecialty}
                        onChange={(e) => setFilterSpecialty(e.target.value)}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-ring bg-background"
                      >
                        <option value="all">Tất cả chuyên khoa</option>
                        {specialtyOptions.map((specialty) => (
                          <option key={specialty} value={specialty}>
                            {specialty}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Phòng khám
                      </label>
                      <select
                        value={filterClinic}
                        onChange={(e) => setFilterClinic(e.target.value)}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-ring bg-background"
                      >
                        <option value="all">Tất cả phòng khám</option>
                        {clinicOptions.map((clinic) => (
                          <option key={clinic} value={clinic}>
                            {clinic}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Trạng thái
                      </label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-ring bg-background"
                      >
                        <option value="all">Tất cả trạng thái</option>
                        <option value="active">Tài khoản hoạt động</option>
                        <option value="inactive">Đã khóa</option>
                        {doctors.some((doctor) => doctor.status === "unknown") && (
                          <option value="unknown">Chưa xác định</option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => {
                        setFilterSpecialty("all");
                        setFilterClinic("all");
                        setFilterStatus("all");
                      }}
                      className="flex-1 px-3 py-1.5 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
                    >
                      Đặt lại
                    </button>
                    <Popover.Close asChild>
                      <button className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                        Áp dụng
                      </button>
                    </Popover.Close>
                  </div>
                </div>
                <Popover.Arrow className="fill-border" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Bác sĩ</th>
                <th className="px-5 py-3 font-medium">Liên hệ</th>
                <th className="px-5 py-3 font-medium">Nơi công tác</th>
                <th className="px-5 py-3 font-medium text-center">Hoạt động</th>
                <th className="px-5 py-3 font-medium">Trạng thái</th>
                <th className="px-5 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedDoctors.map((doc) => (
                <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${doc.avatarColor}`}
                      >
                        {doc.name.split(" ").pop()?.charAt(0)}
                      </div>
                      <div>
                        <button
                          onClick={() => setSelectedDoctor(doc)}
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {doc.name}
                        </button>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <span className="text-primary font-medium">{doc.id}</span>
                          <span>•</span>
                          <span>{doc.specialty || "Chưa cung cấp"}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{doc.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        <span>{doc.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Building2 className="w-4 h-4" />
                      <span>{doc.clinic || "Chưa xác định"}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center gap-4 text-xs font-medium">
                      <div className="flex flex-col items-center">
                        <span className="text-foreground">
                          {formatOptionalMetric(doc.patientsCount)}
                        </span>
                        <span className="text-muted-foreground text-[10px]">Bệnh nhân</span>
                      </div>
                      <div className="w-px h-6 bg-border"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-foreground">
                          {formatOptionalMetric(doc.measurementsCount)}
                        </span>
                        <span className="text-muted-foreground text-[10px]">Lượt khám</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {doc.status === "active" ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-success mr-1.5"></span>
                        Tài khoản hoạt động
                      </span>
                    ) : doc.status === "inactive" ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mr-1.5"></span>
                        Đã khóa
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 text-xs font-medium text-[#B45309]">
                        Chưa xác định
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors outline-none">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="min-w-[160px] bg-popover text-popover-foreground rounded-md shadow-md border border-border p-1 z-50 mr-2">
                          <DropdownMenu.Item
                            onSelect={() => setSelectedDoctor(doc)}
                            className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" /> Xem hồ sơ
                          </DropdownMenu.Item>
                          {canManagePlatformUsers && (
                            <>
                              <DropdownMenu.Separator className="h-px bg-border my-1" />
                              {doc.status === "inactive" ? (
                                <DropdownMenu.Item
                                  onSelect={() => handleUnlock(doc)}
                                  className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-success/10 text-success hover:text-success rounded-sm flex items-center gap-2"
                                >
                                  <LockOpen className="w-4 h-4" /> Mở khóa tài khoản
                                </DropdownMenu.Item>
                              ) : (
                                <DropdownMenu.Item
                                  onSelect={() => handleLock(doc)}
                                  className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-warning/10 text-warning hover:text-warning rounded-sm flex items-center gap-2"
                                >
                                  <Lock className="w-4 h-4" /> Khóa tài khoản
                                </DropdownMenu.Item>
                              )}
                              <DropdownMenu.Item
                                onClick={() => handleDelete(doc)}
                                className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-destructive/10 text-destructive hover:text-destructive rounded-sm flex items-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" /> Xóa dữ liệu
                              </DropdownMenu.Item>
                            </>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}
              {!isLoading && filteredDoctors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không tìm thấy bác sĩ phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          totalItems={filteredDoctors.length}
          sourceTotalItems={doctors.length}
          itemLabel="bác sĩ"
          onPageChange={setPage}
        />
      </div>

      <AddDoctorDialog
        open={canManageStaff && addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={loadInvitations}
        lockedOrganizationId={canManagePlatformUsers ? undefined : currentWorkspaceId || null}
      />

      <AnimatePresence>
        {selectedDoctor && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDoctor(null)}
              className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px]"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col border-l border-border bg-card shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full font-bold ${selectedDoctor.avatarColor}`}
                  >
                    {selectedDoctor.name.split(" ").pop()?.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{selectedDoctor.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedDoctor.email}</p>
                    <div className="mt-2">
                      {selectedDoctor.status === "active" ? (
                        <StatusBadge label="Tài khoản hoạt động" tone="success" />
                      ) : selectedDoctor.status === "inactive" ? (
                        <StatusBadge label="Tạm khóa" tone="error" />
                      ) : (
                        <StatusBadge label="Chưa xác định" tone="warning" />
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDoctor(null)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                <section className="grid grid-cols-2 gap-3">
                  <DoctorMetric
                    label="Bệnh nhân"
                    value={formatOptionalMetric(selectedDoctor.patientsCount)}
                  />
                  <DoctorMetric
                    label="Lượt đo"
                    value={formatOptionalMetric(selectedDoctor.measurementsCount)}
                  />
                  <DoctorMetric label="Vai trò" value="Bác sĩ" />
                  <DoctorMetric label="Ngày duyệt" value={selectedDoctor.joinDate} />
                </section>

                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Thông tin quyền truy cập
                  </h3>
                  <div className="space-y-3 text-sm">
                    <DoctorInfo
                      icon={Stethoscope}
                      label="Chuyên khoa"
                      value={selectedDoctor.specialty || "Chưa cung cấp"}
                    />
                    <DoctorInfo
                      icon={Building2}
                      label="Phòng khám"
                      value={selectedDoctor.clinic || "Chưa xác định"}
                    />
                    <DoctorInfo
                      icon={ShieldCheck}
                      label="Phạm vi dữ liệu"
                      value="Theo membership và quyền do backend cấp"
                    />
                  </div>
                </section>
              </div>

              <CapabilityGate capabilities={PLATFORM_USER_MANAGE_CAPABILITIES}>
                <div className="grid grid-cols-1 gap-2 border-t border-border bg-muted/30 p-5 sm:grid-cols-2">
                  {selectedDoctor.status === "inactive" ? (
                    <button
                      onClick={() => handleUnlock(selectedDoctor)}
                      className="rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success hover:bg-success/20 transition-colors"
                    >
                      Mở khóa tài khoản
                    </button>
                  ) : (
                    <button
                      onClick={() => handleLock(selectedDoctor)}
                      className="rounded-md bg-warning/10 px-3 py-2 text-sm font-medium text-[#B45309] hover:bg-warning/15"
                    >
                      Khóa tài khoản
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(selectedDoctor)}
                    className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/15"
                  >
                    Xóa dữ liệu
                  </button>
                </div>
              </CapabilityGate>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <Dialog.Root
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open && !isConfirming) {
            setConfirmAction(null);
            setConfirmError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div
              className={`mb-4 flex items-center gap-3 ${confirmAction?.tone === "success" ? "text-success" : "text-destructive"}`}
            >
              {confirmAction?.tone === "success" ? (
                <ShieldCheck className="h-6 w-6" />
              ) : (
                <ShieldAlert className="h-6 w-6" />
              )}
              <Dialog.Title className="text-lg font-bold">{confirmAction?.title}</Dialog.Title>
            </div>
            <Dialog.Description className="text-sm leading-6 text-muted-foreground">
              {confirmAction?.description}
            </Dialog.Description>
            {confirmError && (
              <div
                role="alert"
                className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {confirmError}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setConfirmAction(null);
                  setConfirmError("");
                }}
                disabled={isConfirming}
                className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={isConfirming}
                className={`inline-flex min-h-11 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-60 ${
                  confirmAction?.tone === "success"
                    ? "bg-success text-white hover:bg-success/90"
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                }`}
              >
                {isConfirming && <Loader2 className="h-4 w-4 animate-spin" />}
                {isConfirming ? "Đang xử lý..." : confirmAction?.confirm}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function DoctorMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

function DoctorInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}
