import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type FormEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clipboard,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  UserRoundCog,
  Users,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { useAuth } from "../../context/AuthContext";
import {
  smartHealthApi,
  type ApiError,
  type ApiUser,
  type StaffInvitation,
  type StaffInvitationDelivery,
  type StaffInvitationRole,
  type WorkspaceMembershipAction,
} from "../../../lib/smart-health-api";
import {
  assertMembershipLifecycleOutcome,
  assertPortalStaffInvitationStatus,
  createPortalStaffIdempotencyKey,
  parsePortalStaffInvitationList,
  parsePortalStaffInvitationOutcome,
} from "../../../lib/staff-invitation-operations";
import { parsePortalStaffLedger } from "../../../lib/staff-operations";

type InvitationForm = {
  name: string;
  email: string;
  phone: string;
  role: StaffInvitationRole;
  specialty: string;
  license: string;
};

type ManualAcceptance = {
  invitationId: string;
  email: string;
  url: string;
  delivery: StaffInvitationDelivery;
};

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "warning" | "success";
  run: () => Promise<void>;
};

const MANAGEABLE_ROLES: StaffInvitationRole[] = [
  "workspace_admin",
  "doctor",
  "nurse",
  "technician",
  "billing",
  "viewer",
];

const EMPTY_FORM: InvitationForm = {
  name: "",
  email: "",
  phone: "",
  role: "doctor",
  specialty: "",
  license: "",
};

const ROLE_LABELS: Record<StaffInvitationRole, string> = {
  workspace_admin: "Quản trị workspace",
  doctor: "Bác sĩ",
  nurse: "Điều dưỡng",
  technician: "Kỹ thuật viên",
  billing: "Phụ trách thanh toán",
  viewer: "Chỉ xem",
};

function errorMessage(error: unknown, fallback: string) {
  const code = (error as ApiError | undefined)?.code || "";
  const messages: Record<string, string> = {
    MEMBERSHIP_ROLE_INVALID: "Vai trò workspace không hợp lệ.",
    MEMBERSHIP_ROLE_SELF_CHANGE_DENIED:
      "Không thể tự thay đổi vai trò của chính tài khoản đang đăng nhập.",
    WORKSPACE_OWNER_TRANSFER_REQUIRED:
      "Không thể đổi vai trò chủ sở hữu. Hãy chuyển quyền sở hữu trước.",
    STAFF_INVITATION_PENDING:
      "Email này đã có một lời mời đang chờ trong workspace.",
    STAFF_INVITATION_NOT_FOUND:
      "Không tìm thấy lời mời trong workspace hiện tại.",
    STAFF_INVITATION_NOT_PENDING:
      "Lời mời không còn ở trạng thái có thể thao tác.",
    STAFF_INVITATION_WORKSPACE_INACTIVE:
      "Workspace hiện tại không còn hoạt động.",
    STAFF_MEMBERSHIP_EXISTS: "Tài khoản đã là thành viên của workspace này.",
    LAST_WORKSPACE_OWNER_REQUIRED:
      "Không thể thay đổi thành viên chủ sở hữu cuối cùng.",
    MEMBERSHIP_STORAGE_UNAVAILABLE: "Kho membership tạm thời chưa khả dụng.",
    IDEMPOTENCY_KEY_REQUIRED:
      "Thiếu khóa chống gửi lặp. Hãy tải lại trang rồi thử lại.",
  };
  if (messages[code]) return messages[code];
  const message = error instanceof Error ? error.message.trim() : "";
  return message && /[À-ỹ]/.test(message) ? message : fallback;
}

function formatDate(value?: string) {
  if (!value) return "Chưa ghi nhận";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa ghi nhận";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function deliveryLabel(delivery?: StaffInvitationDelivery) {
  if (!delivery) return "Chưa ghi nhận";
  if (delivery.email === "sent") return "Provider đã xác nhận gửi";
  if (delivery.email === "ready") return "Sẵn sàng, chưa xác nhận gửi";
  if (delivery.email === "failed") return "Gửi thất bại";
  return "Chưa có provider";
}

function roleLabel(value?: string) {
  if (value === "workspace_owner") return "Chủ sở hữu workspace";
  return ROLE_LABELS[value as StaffInvitationRole] || value || "Chưa xác định";
}

function roleCanManageDevices(value?: string) {
  return ["workspace_owner", "workspace_admin", "nurse", "technician"].includes(
    value || "",
  );
}

function invitationStatus(invitation: StaffInvitation) {
  if (invitation.status === "accepted") {
    return (
      <Badge className="border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
        Đã chấp nhận
      </Badge>
    );
  }
  if (invitation.status === "revoked") {
    return <Badge variant="destructive">Đã thu hồi</Badge>;
  }
  if (invitation.status === "expired") {
    return (
      <Badge className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]">
        Đã hết hạn
      </Badge>
    );
  }
  return (
    <Badge className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]">
      Đang chờ
    </Badge>
  );
}

function membershipStatus(member: ApiUser) {
  const status = member.workspaceMembership?.status;
  if (status === "active") {
    return (
      <Badge className="border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
        Đang hoạt động
      </Badge>
    );
  }
  if (status === "suspended") {
    return (
      <Badge className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]">
        Tạm ngưng
      </Badge>
    );
  }
  if (status === "revoked")
    return <Badge variant="destructive">Đã thu hồi</Badge>;
  return <Badge variant="outline">Chưa xác định</Badge>;
}

function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

function isPermissionError(error: unknown) {
  return (error as ApiError | undefined)?.status === 403;
}

class StaffOperationSupersededError extends Error {
  constructor() {
    super("Workspace đã thay đổi; phản hồi nhân sự cũ đã bị bỏ qua.");
    this.name = "StaffOperationSupersededError";
  }
}

export default function StaffPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = user?.currentWorkspace.id || "";
  const canManage = Boolean(
    user?.capabilities.includes("workspace.staff.manage"),
  );
  const activeWorkspaceRef = useRef(workspaceId);
  const operationEpochRef = useRef(0);
  const [settledWorkspaceId, setSettledWorkspaceId] =
    useState(workspaceId);
  const workspaceChanging = settledWorkspaceId !== workspaceId;
  const [online, setOnline] = useState(() => !isOffline());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState<InvitationForm>(EMPTY_FORM);
  const [discardInviteOpen, setDiscardInviteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [manualAcceptance, setManualAcceptance] =
    useState<ManualAcceptance | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionId, setActionId] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const [roleEditor, setRoleEditor] = useState<{
    member: ApiUser;
    role: StaffInvitationRole;
  } | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState("");
  const attemptRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const actionAttemptsRef = useRef(new Map<string, string>());
  const inFlightRef = useRef(false);
  const inviteDirty = Boolean(
    inviteOpen &&
      !manualAcceptance &&
      JSON.stringify(form) !== JSON.stringify(EMPTY_FORM),
  );

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useLayoutEffect(() => {
    activeWorkspaceRef.current = workspaceId;
    if (settledWorkspaceId === workspaceId) return;
    operationEpochRef.current += 1;
    attemptRef.current = null;
    actionAttemptsRef.current.clear();
    inFlightRef.current = false;
    setInviteOpen(false);
    setForm(EMPTY_FORM);
    setDiscardInviteOpen(false);
    setIsSubmitting(false);
    setSubmitError("");
    setManualAcceptance(null);
    setActionError("");
    setActionId("");
    setConfirmation(null);
    setIsConfirming(false);
    setConfirmationError("");
    setRoleEditor(null);
    setRoleSaving(false);
    setRoleError("");
    setSettledWorkspaceId(workspaceId);
  }, [settledWorkspaceId, workspaceId]);

  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (!inviteDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [inviteDirty]);

  const staffQuery = useQuery({
    queryKey: ["portal", "workspace", workspaceId, "staff"],
    queryFn: async () =>
      parsePortalStaffLedger(await smartHealthApi.listStaff(), workspaceId),
    enabled: Boolean(
      canManage && workspaceId && online && !workspaceChanging,
    ),
    retry: false,
  });
  const invitationsQuery = useQuery({
    queryKey: ["portal", "workspace", workspaceId, "staff-invitations"],
    queryFn: async () =>
      parsePortalStaffInvitationList(
        await smartHealthApi.listStaffInvitations({
          organizationId: workspaceId,
        }),
        workspaceId,
      ),
    enabled: Boolean(
      canManage && workspaceId && online && !workspaceChanging,
    ),
    retry: false,
  });

  const staff = staffQuery.data?.staff || [];
  const invitations = invitationsQuery.data || [];

  const refreshStaff = async (operationWorkspaceId = workspaceId) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["portal", "workspace", operationWorkspaceId, "staff"],
      }),
      queryClient.invalidateQueries({
        queryKey: [
          "portal",
          "workspace",
          operationWorkspaceId,
          "staff-invitations",
        ],
      }),
    ]);
  };

  const assertCurrentOperation = (
    operationWorkspaceId: string,
    operationEpoch: number,
  ) => {
    if (
      activeWorkspaceRef.current !== operationWorkspaceId ||
      operationEpochRef.current !== operationEpoch
    ) {
      throw new StaffOperationSupersededError();
    }
  };

  const resetInvite = () => {
    setForm(EMPTY_FORM);
    setSubmitError("");
    setManualAcceptance(null);
    attemptRef.current = null;
  };

  const handleInviteOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    if (!nextOpen && inviteDirty) {
      setDiscardInviteOpen(true);
      return;
    }
    if (!nextOpen) resetInvite();
    setInviteOpen(nextOpen);
  };

  const discardInviteDraft = () => {
    resetInvite();
    setDiscardInviteOpen(false);
    setInviteOpen(false);
  };

  const submitInvitation = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlightRef.current || !workspaceId || !online) {
      if (!online) {
        setSubmitError(
          "Thiết bị đang ngoại tuyến. Kết nối mạng rồi gửi lại cùng bản nháp.",
        );
      }
      return;
    }
    const operationWorkspaceId = workspaceId;
    const operationEpoch = operationEpochRef.current;
    setSubmitError("");
    const payload = {
      organizationId: operationWorkspaceId,
      email: form.email.trim().toLowerCase(),
      role: form.role,
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      specialty:
        form.role === "doctor" ? form.specialty.trim() || undefined : undefined,
      license:
        form.role === "doctor" ? form.license.trim() || undefined : undefined,
    };
    const fingerprint = JSON.stringify(payload);
    const idempotencyKey =
      attemptRef.current?.fingerprint === fingerprint
        ? attemptRef.current.idempotencyKey
        : createPortalStaffIdempotencyKey(
            "invite-create",
            operationWorkspaceId,
          );
    attemptRef.current = { fingerprint, idempotencyKey };
    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const outcome = parsePortalStaffInvitationOutcome(
        await smartHealthApi.createStaffInvitation(payload, idempotencyKey),
        payload,
      );
      assertCurrentOperation(operationWorkspaceId, operationEpoch);
      attemptRef.current = null;
      if (outcome.acceptanceUrl) {
        setManualAcceptance({
          invitationId: outcome.invitation.id,
          email: outcome.invitation.email,
          url: outcome.acceptanceUrl,
          delivery: outcome.delivery,
        });
      } else {
        setManualAcceptance({
          invitationId: outcome.invitation.id,
          email: outcome.invitation.email,
          url: "",
          delivery: outcome.delivery,
        });
      }
      void refreshStaff(operationWorkspaceId);
      if (outcome.delivery.email === "sent") {
        toast.success("Provider đã xác nhận gửi lời mời.");
      } else {
        toast.warning(
          "Lời mời đã được tạo nhưng email chưa được xác nhận là đã gửi.",
        );
      }
    } catch (error) {
      if (error instanceof StaffOperationSupersededError) return;
      setSubmitError(errorMessage(error, "Không thể tạo lời mời nhân sự."));
    } finally {
      if (
        activeWorkspaceRef.current === operationWorkspaceId &&
        operationEpochRef.current === operationEpoch
      ) {
        inFlightRef.current = false;
        setIsSubmitting(false);
      }
    }
  };

  const resendInvitation = async (invitation: StaffInvitation) => {
    if (!online) {
      setActionError(
        "Thiết bị đang ngoại tuyến. Kết nối mạng trước khi gửi lại lời mời.",
      );
      return;
    }
    const operationWorkspaceId = workspaceId;
    const operationEpoch = operationEpochRef.current;
    const operationId = `resend:${invitation.id}`;
    const idempotencyKey =
      actionAttemptsRef.current.get(operationId) ||
      createPortalStaffIdempotencyKey("invite-resend", invitation.id);
    actionAttemptsRef.current.set(operationId, idempotencyKey);
    setActionId(operationId);
    setActionError("");
    try {
      const outcome = parsePortalStaffInvitationOutcome(
        await smartHealthApi.resendStaffInvitation(
          invitation.id,
          idempotencyKey,
        ),
        {
          organizationId: invitation.organizationId,
          email: invitation.email,
          role: invitation.role,
        },
      );
      assertCurrentOperation(operationWorkspaceId, operationEpoch);
      actionAttemptsRef.current.delete(operationId);
      setManualAcceptance({
        invitationId: invitation.id,
        email: invitation.email,
        url: outcome.acceptanceUrl || "",
        delivery: outcome.delivery,
      });
      void refreshStaff(operationWorkspaceId);
      if (outcome.delivery.email === "sent") {
        toast.success("Provider đã xác nhận gửi lại lời mời.");
      } else {
        toast.warning(
          "Đã tạo lượt gửi lại nhưng email chưa được xác nhận là đã gửi.",
        );
      }
    } catch (error) {
      if (error instanceof StaffOperationSupersededError) return;
      setActionError(errorMessage(error, "Không thể gửi lại lời mời."));
    } finally {
      if (
        activeWorkspaceRef.current === operationWorkspaceId &&
        operationEpochRef.current === operationEpoch
      ) {
        setActionId("");
      }
    }
  };

  const confirmInvitationRevoke = (invitation: StaffInvitation) => {
    const operationWorkspaceId = workspaceId;
    const operationEpoch = operationEpochRef.current;
    const operationId = `revoke-invitation:${invitation.id}`;
    const idempotencyKey =
      actionAttemptsRef.current.get(operationId) ||
      createPortalStaffIdempotencyKey("invite-revoke", invitation.id);
    actionAttemptsRef.current.set(operationId, idempotencyKey);
    setConfirmationError("");
    setConfirmation({
      title: "Thu hồi lời mời",
      description: `Thu hồi lời mời dành cho ${invitation.email}? Liên kết chưa sử dụng sẽ không còn hợp lệ.`,
      confirmLabel: "Thu hồi lời mời",
      tone: "danger",
      run: async () => {
        if (!online) {
          throw new Error(
            "Thiết bị đang ngoại tuyến. Kết nối mạng trước khi thu hồi lời mời.",
          );
        }
        const response = await smartHealthApi.revokeStaffInvitation(
          invitation.id,
          "Thu hồi bởi quản trị viên workspace",
          idempotencyKey,
        );
        assertCurrentOperation(operationWorkspaceId, operationEpoch);
        assertPortalStaffInvitationStatus(
          response,
          invitation.id,
          "revoked",
          operationWorkspaceId,
        );
        actionAttemptsRef.current.delete(operationId);
        if (manualAcceptance?.invitationId === invitation.id)
          setManualAcceptance(null);
        void refreshStaff(operationWorkspaceId);
        toast.success("Backend đã xác nhận thu hồi lời mời.");
      },
    });
  };

  const confirmMembershipAction = (
    member: ApiUser,
    action: WorkspaceMembershipAction,
  ) => {
    const operationWorkspaceId = workspaceId;
    const operationEpoch = operationEpochRef.current;
    const operationId = `${action}-member:${member.id}`;
    const idempotencyKey =
      actionAttemptsRef.current.get(operationId) ||
      createPortalStaffIdempotencyKey(`member-${action}`, member.id);
    actionAttemptsRef.current.set(operationId, idempotencyKey);
    const copy = {
      suspend: {
        title: "Tạm ngưng thành viên",
        description: `Tạm ngưng quyền truy cập workspace của ${member.name || member.email || member.id}?`,
        confirmLabel: "Tạm ngưng",
        tone: "warning" as const,
      },
      reactivate: {
        title: "Kích hoạt lại thành viên",
        description: `Khôi phục quyền truy cập workspace của ${member.name || member.email || member.id}?`,
        confirmLabel: "Kích hoạt lại",
        tone: "success" as const,
      },
      revoke: {
        title: "Thu hồi membership",
        description: `Thu hồi membership của ${member.name || member.email || member.id}? Tài khoản không bị xóa khỏi hệ thống.`,
        confirmLabel: "Thu hồi membership",
        tone: "danger" as const,
      },
    }[action];
    setConfirmationError("");
    setConfirmation({
      ...copy,
      run: async () => {
        if (!online) {
          throw new Error(
            "Thiết bị đang ngoại tuyến. Kết nối mạng trước khi đổi membership.",
          );
        }
        const response =
          action === "suspend"
            ? await smartHealthApi.suspendStaffMember(member.id, idempotencyKey)
            : action === "reactivate"
              ? await smartHealthApi.reactivateStaffMember(
                  member.id,
                  idempotencyKey,
                )
              : await smartHealthApi.revokeStaffMember(
                  member.id,
                  idempotencyKey,
                );
        assertCurrentOperation(operationWorkspaceId, operationEpoch);
        assertMembershipLifecycleOutcome(
          response,
          member.id,
          action,
          operationWorkspaceId,
        );
        actionAttemptsRef.current.delete(operationId);
        void refreshStaff(operationWorkspaceId);
        toast.success(
          action === "suspend"
            ? "Backend đã xác nhận tạm ngưng membership."
            : action === "reactivate"
              ? "Backend đã xác nhận kích hoạt lại membership."
              : "Backend đã xác nhận thu hồi membership.",
        );
      },
    });
  };

  const openRoleEditor = (member: ApiUser) => {
    const currentRole = member.workspaceMembership?.role as StaffInvitationRole;
    if (!MANAGEABLE_ROLES.includes(currentRole)) return;
    setRoleError("");
    setRoleEditor({ member, role: currentRole });
  };

  const saveRoleChange = async () => {
    if (!roleEditor || roleSaving || !canMutate) return;
    const operationWorkspaceId = workspaceId;
    const operationEpoch = operationEpochRef.current;
    const { member, role } = roleEditor;
    if (member.id === user?.id) {
      setRoleError("Không thể tự thay đổi vai trò của chính tài khoản đang đăng nhập.");
      return;
    }
    const operationId = `role-member:${member.id}`;
    const idempotencyKey =
      actionAttemptsRef.current.get(operationId) ||
      createPortalStaffIdempotencyKey("member-role", member.id);
    actionAttemptsRef.current.set(operationId, idempotencyKey);
    setRoleSaving(true);
    setRoleError("");
    try {
      const response = await smartHealthApi.changeStaffMemberRole(
        member.id,
        role,
        idempotencyKey,
      );
      assertCurrentOperation(operationWorkspaceId, operationEpoch);
      if (
        response.action !== "change_role" ||
        response.membership?.organizationId !== operationWorkspaceId ||
        response.membership?.userId !== member.id ||
        response.membership?.role !== role
      ) {
        throw new Error("Backend trả về quyền không khớp workspace hoặc tài khoản đã chọn.");
      }
      actionAttemptsRef.current.delete(operationId);
      setRoleEditor(null);
      void refreshStaff(operationWorkspaceId);
      toast.success("Backend đã xác nhận thay đổi quyền thành viên.");
    } catch (error) {
      if (error instanceof StaffOperationSupersededError) return;
      setRoleError(errorMessage(error, "Không thể thay đổi quyền thành viên."));
    } finally {
      if (
        activeWorkspaceRef.current === operationWorkspaceId &&
        operationEpochRef.current === operationEpoch
      ) {
        setRoleSaving(false);
      }
    }
  };

  const runConfirmation = async () => {
    if (!confirmation || isConfirming) return;
    const operationWorkspaceId = workspaceId;
    const operationEpoch = operationEpochRef.current;
    setIsConfirming(true);
    setConfirmationError("");
    try {
      await confirmation.run();
      assertCurrentOperation(operationWorkspaceId, operationEpoch);
      setConfirmation(null);
    } catch (error) {
      if (error instanceof StaffOperationSupersededError) return;
      setConfirmationError(
        errorMessage(error, "Không thể hoàn tất thao tác nhân sự."),
      );
    } finally {
      if (
        activeWorkspaceRef.current === operationWorkspaceId &&
        operationEpochRef.current === operationEpoch
      ) {
        setIsConfirming(false);
      }
    }
  };

  const copyAcceptanceUrl = async () => {
    if (!manualAcceptance?.url) return;
    try {
      await navigator.clipboard.writeText(manualAcceptance.url);
      toast.success("Đã sao chép liên kết một lần.");
    } catch {
      toast.error("Không thể sao chép tự động. Hãy chọn và sao chép thủ công.");
    }
  };

  const permissionError = [staffQuery.error, invitationsQuery.error].find(
    isPermissionError,
  ) as (ApiError & { requestId?: string }) | undefined;
  const hasStaffSnapshot = staffQuery.data !== undefined;
  const hasInvitationSnapshot = invitationsQuery.data !== undefined;
  const hasStaleSnapshot =
    Boolean(staffQuery.error && hasStaffSnapshot) ||
    Boolean(invitationsQuery.error && hasInvitationSnapshot);
  const canMutate =
    canManage &&
    Boolean(workspaceId) &&
    online &&
    !workspaceChanging &&
    !permissionError;

  if (!canManage) {
    return (
      <div
        className="space-y-5"
        data-testid="portal-staff"
        data-workspace-id={workspaceId}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Bác sĩ và nhân sự
        </h1>
        <Card role="alert" className="border-destructive/30">
          <CardHeader>
            <CardTitle>Không có quyền quản lý nhân sự</CardTitle>
            <CardDescription>
              Tài khoản cần capability `workspace.staff.manage` để mở bề mặt
              này.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="space-y-6"
      data-testid="portal-staff"
      data-workspace-id={workspaceId}
    >
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4" /> Workspace ·{" "}
            {user?.currentWorkspace.name || "Chưa xác định"}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Bác sĩ và nhân sự
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Mời thành viên, theo dõi trạng thái chấp nhận và quản lý membership
            trong workspace hiện tại.
          </p>
        </div>
        <Button
          onClick={() => {
            setManualAcceptance(null);
            setInviteOpen(true);
          }}
          disabled={!canMutate}
          className="min-h-11 gap-2"
        >
          <Plus className="h-4 w-4" /> Mời nhân sự
        </Button>
      </header>

      {!workspaceId && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-sm text-[var(--status-warning-fg)]"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Hãy chọn một
          workspace hợp lệ trước khi mời hoặc quản lý nhân sự.
        </div>
      )}

      {!online && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-sm text-[var(--status-warning-fg)]"
        >
          <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>
            Thiết bị đang ngoại tuyến. Dữ liệu đã xác nhận gần nhất vẫn được
            hiển thị nhưng mọi thao tác nhân sự đã bị khóa.
          </span>
        </div>
      )}

      {hasStaleSnapshot && !permissionError ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-sm text-[var(--status-warning-fg)]"
        >
          <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            Chưa thể làm mới. Shcare đang giữ snapshot nhân sự đã xác nhận gần
            nhất.
          </span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!online}
            onClick={() => void refreshStaff()}
          >
            Thử lại
          </Button>
        </div>
      ) : null}

      {permissionError ? (
        <Card role="alert" className="border-destructive/30">
          <CardHeader>
            <CardTitle>Không có quyền xem nhân sự workspace</CardTitle>
            <CardDescription>
              Backend đã từ chối truy cập. Không có dữ liệu nhân sự nào được
              hiển thị.
              {permissionError.requestId
                ? ` Mã yêu cầu: ${permissionError.requestId}.`
                : ""}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {manualAcceptance && (
        <Card className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]">
          <CardHeader>
            <CardTitle className="text-base">
              Liên kết chấp nhận một lần
            </CardTitle>
            <CardDescription>
              {manualAcceptance.email} ·{" "}
              {deliveryLabel(manualAcceptance.delivery)}. Chỉ chuyển cho đúng
              người nhận bằng kênh an toàn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {manualAcceptance.url ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  readOnly
                  aria-label="Liên kết chấp nhận lời mời một lần"
                  value={manualAcceptance.url}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={copyAcceptanceUrl}
                  className="min-h-11 gap-2"
                >
                  <Clipboard className="h-4 w-4" /> Sao chép
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Phản hồi idempotent không trả lại bí mật. Nếu email chưa gửi,
                hãy bấm “Gửi lại” để tạo liên kết mới.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {actionError}
        </div>
      )}

      <Tabs defaultValue="members" className="space-y-4">
        <TabsList className="h-auto min-h-11 p-0">
          <TabsTrigger value="members" className="min-h-11">
            Thành viên ({staff.length})
          </TabsTrigger>
          <TabsTrigger value="invitations" className="min-h-11">
            Lời mời ({invitations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          {!online && !hasStaffSnapshot ? (
            <OfflineState label="Chưa có snapshot thành viên cho workspace này." />
          ) : staffQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : staffQuery.error && !hasStaffSnapshot ? (
            <RetryState
              message={errorMessage(
                staffQuery.error,
                "Không thể tải thành viên workspace.",
              )}
              onRetry={() => void staffQuery.refetch()}
              disabled={!online || Boolean(permissionError)}
            />
          ) : staff.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Workspace chưa có thành viên"
              description="Tạo lời mời để bắt đầu thêm bác sĩ hoặc nhân sự vận hành."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {staff.map((member) => {
                const status = member.workspaceMembership?.status;
                const isCurrentUser = member.id === user?.id;
                return (
                  <Card key={member.id}>
                    <CardHeader className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            {member.role === "doctor" ? (
                              <Stethoscope className="h-5 w-5" />
                            ) : (
                              <UserRoundCog className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="truncate text-base">
                              {member.name ||
                                member.email ||
                                "Chưa cập nhật tên"}
                            </CardTitle>
                            <CardDescription className="mt-1 truncate">
                              {member.email || "Chưa có email"}
                            </CardDescription>
                          </div>
                        </div>
                        {membershipStatus(member)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Vai trò
                          </dt>
                          <dd className="mt-1 font-medium">
                            {roleLabel(
                              member.workspaceMembership?.role || member.role,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Điện thoại
                          </dt>
                          <dd className="mt-1 font-medium">
                            {member.phone || "Chưa cung cấp"}
                          </dd>
                        </div>
                      </dl>
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                        <span>
                          {roleCanManageDevices(member.workspaceMembership?.role)
                            ? "Có quyền quản lý/ghép thiết bị"
                            : "Chỉ xem; chưa có quyền ghép thiết bị"}
                        </span>
                      </div>
                      {isCurrentUser ? (
                        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                          Đây là membership đang dùng. Hãy nhờ quản trị viên
                          khác thay đổi nếu cần.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                            disabled={
                              !canMutate ||
                              member.workspaceMembership?.role === "workspace_owner"
                            }
                            onClick={() => openRoleEditor(member)}
                          >
                            Điều chỉnh quyền
                          </Button>
                          {status === "suspended" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11"
                              disabled={!canMutate}
                              onClick={() =>
                                confirmMembershipAction(member, "reactivate")
                              }
                            >
                              Kích hoạt lại
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-11"
                              disabled={!canMutate}
                              onClick={() =>
                                confirmMembershipAction(member, "suspend")
                              }
                            >
                              Tạm ngưng
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11 text-destructive hover:text-destructive"
                            disabled={!canMutate}
                            onClick={() =>
                              confirmMembershipAction(member, "revoke")
                            }
                          >
                            Thu hồi membership
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="invitations" className="space-y-4">
          {!online && !hasInvitationSnapshot ? (
            <OfflineState label="Chưa có snapshot lời mời cho workspace này." />
          ) : invitationsQuery.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : invitationsQuery.error && !hasInvitationSnapshot ? (
            <RetryState
              message={errorMessage(
                invitationsQuery.error,
                "Không thể tải danh sách lời mời.",
              )}
              onRetry={() => void invitationsQuery.refetch()}
              disabled={!online || Boolean(permissionError)}
            />
          ) : invitations.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Chưa có lời mời"
              description="Các lời mời tạo trong workspace sẽ xuất hiện tại đây."
            />
          ) : (
            <div className="space-y-3">
              {invitations.map((invitation) => {
                const canRetry =
                  invitation.status === "pending" ||
                  invitation.status === "expired";
                return (
                  <Card key={invitation.id}>
                    <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-foreground">
                            {invitation.name || invitation.email}
                          </h3>
                          {invitationStatus(invitation)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>{invitation.email}</span>
                          <span>{roleLabel(invitation.role)}</span>
                          <span>{deliveryLabel(invitation.delivery)}</span>
                          <span>
                            Hết hạn: {formatDate(invitation.expiresAt)}
                          </span>
                        </div>
                      </div>
                      {canRetry ? (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(actionId) || !canMutate}
                            onClick={() => void resendInvitation(invitation)}
                            className="min-h-11 gap-2"
                          >
                            {actionId === `resend:${invitation.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            Gửi lại
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={Boolean(actionId) || !canMutate}
                            className="min-h-11 text-destructive hover:text-destructive"
                            onClick={() => confirmInvitationRevoke(invitation)}
                          >
                            <Ban className="mr-2 h-4 w-4" /> Thu hồi
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={inviteOpen} onOpenChange={handleInviteOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Mời nhân sự</DialogTitle>
            <DialogDescription>
              Tạo lời mời cho{" "}
              {user?.currentWorkspace.name || "workspace hiện tại"}. Membership
              chỉ được cấp sau khi đúng người nhận chấp nhận.
            </DialogDescription>
          </DialogHeader>

          {manualAcceptance && inviteOpen ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-success-fg)]" />
                <div>
                  <h3 className="font-semibold">Lời mời đã được tạo</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {manualAcceptance.email} ·{" "}
                    {deliveryLabel(manualAcceptance.delivery)}
                  </p>
                </div>
              </div>
              {manualAcceptance.url ? (
                <div className="space-y-2">
                  <Label htmlFor="staff-one-time-url">
                    Liên kết chấp nhận một lần
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="staff-one-time-url"
                      readOnly
                      value={manualAcceptance.url}
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={copyAcceptanceUrl}
                      className="min-h-11 gap-2"
                    >
                      <Clipboard className="h-4 w-4" /> Sao chép
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Liên kết chứa bí mật dùng một lần. Không đăng lên kênh công
                    khai hoặc audit log.
                  </p>
                </div>
              ) : (
                <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  Phản hồi này không trả lại liên kết bí mật. Nếu email chưa
                  gửi, dùng “Gửi lại” trong tab Lời mời.
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => handleInviteOpenChange(false)}
                  className="min-h-11"
                >
                  Đóng
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              method="post"
              onSubmit={submitInvitation}
              className="space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="staff-name">Họ và tên</Label>
                  <Input
                    id="staff-name"
                    name="name"
                    required
                    autoComplete="name"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-email">Email</Label>
                  <Input
                    id="staff-email"
                    name="email"
                    required
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-phone">Số điện thoại</Label>
                  <Input
                    id="staff-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) =>
                      setForm({ ...form, phone: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="staff-role">Vai trò</Label>
                  <select
                    id="staff-role"
                    name="role"
                    value={form.role}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        role: event.target.value as StaffInvitationRole,
                      })
                    }
                    className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="workspace_admin">Quản trị workspace</option>
                    <option value="doctor">Bác sĩ</option>
                    <option value="nurse">Điều dưỡng</option>
                    <option value="technician">Kỹ thuật viên</option>
                    <option value="billing">Phụ trách thanh toán</option>
                    <option value="viewer">Chỉ xem</option>
                  </select>
                </div>
                {form.role === "doctor" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="staff-specialty">Chuyên khoa</Label>
                      <Input
                        id="staff-specialty"
                        name="specialty"
                        value={form.specialty}
                        onChange={(event) =>
                          setForm({ ...form, specialty: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="staff-license">
                        Số chứng chỉ hành nghề
                      </Label>
                      <Input
                        id="staff-license"
                        name="license"
                        value={form.license}
                        onChange={(event) =>
                          setForm({ ...form, license: event.target.value })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{" "}
                  {submitError}
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => handleInviteOpenChange(false)}
                  className="min-h-11"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !canMutate}
                  className="min-h-11 gap-2"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {isSubmitting ? "Đang tạo lời mời..." : "Mời nhân sự"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(roleEditor)}
        onOpenChange={(open) => {
          if (!open && !roleSaving) {
            setRoleEditor(null);
            setRoleError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Điều chỉnh quyền workspace</DialogTitle>
            <DialogDescription>
              Vai trò membership quyết định capability của tài khoản trong workspace hiện tại.
              Muốn ghép/cấu hình thiết bị, chọn Quản trị workspace, Điều dưỡng hoặc Kỹ thuật viên.
            </DialogDescription>
          </DialogHeader>
          {roleEditor ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="font-medium text-foreground">
                  {roleEditor.member.name || roleEditor.member.email || roleEditor.member.id}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {roleEditor.member.email || "Không có email"}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff-membership-role">Vai trò trong workspace</Label>
                <select
                  id="staff-membership-role"
                  value={roleEditor.role}
                  disabled={roleSaving}
                  onChange={(event) =>
                    setRoleEditor({
                      ...roleEditor,
                      role: event.target.value as StaffInvitationRole,
                    })
                  }
                  className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {MANAGEABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
                Thay đổi chỉ áp dụng cho membership của workspace này, không đổi vai trò Admin toàn hệ thống.
                Người được đổi quyền cần đăng nhập lại hoặc tải lại phiên để app nhận capability mới.
              </div>
              {roleError ? (
                <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
                  {roleError}
                </div>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={roleSaving}
                  onClick={() => setRoleEditor(null)}
                >
                  Hủy
                </Button>
                <Button
                  type="button"
                  className="min-h-11 gap-2"
                  disabled={roleSaving || !canMutate}
                  onClick={() => void saveRoleChange()}
                >
                  {roleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {roleSaving ? "Đang lưu..." : "Lưu quyền"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={discardInviteOpen}
        onOpenChange={(open) => {
          if (!open) setDiscardInviteOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bỏ bản nháp lời mời?</AlertDialogTitle>
            <AlertDialogDescription>
              Thông tin nhân sự chưa được gửi tới backend sẽ bị xóa khỏi biểu
              mẫu này.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">
              Tiếp tục chỉnh sửa
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                discardInviteDraft();
              }}
            >
              Bỏ bản nháp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !isConfirming) {
            setConfirmation(null);
            setConfirmationError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="mb-2 flex items-center gap-2 text-foreground">
              {confirmation?.tone === "success" ? (
                <ShieldCheck className="h-5 w-5 text-[var(--status-success-fg)]" />
              ) : (
                <AlertCircle className="h-5 w-5 text-[var(--status-warning-fg)]" />
              )}
              <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmationError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {confirmationError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isConfirming}
              className="min-h-11"
            >
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isConfirming || !online}
              onClick={(event) => {
                event.preventDefault();
                void runConfirmation();
              }}
              className={
                confirmation?.tone === "success"
                  ? "min-h-11"
                  : "min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
            >
              {isConfirming && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isConfirming ? "Đang xử lý..." : confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RetryState({
  message,
  onRetry,
  disabled = false,
}: {
  message: string;
  onRetry: () => void;
  disabled?: boolean;
}) {
  return (
    <Card className="border-destructive/25">
      <CardContent className="flex flex-col items-start gap-3 p-5">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onRetry}
          disabled={disabled}
          className="min-h-11 gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Tải lại
        </Button>
      </CardContent>
    </Card>
  );
}

function OfflineState({ label }: { label: string }) {
  return (
    <Card className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]">
      <CardContent className="flex items-start gap-3 p-5 text-sm text-[var(--status-warning-fg)]">
        <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>
          {label} Kết nối mạng để tải dữ liệu đã xác nhận từ backend.
        </span>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: ElementType;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
