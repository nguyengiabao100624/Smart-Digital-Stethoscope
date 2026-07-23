import { useRef, useState, type ElementType, type FormEvent } from "react";
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
  return ROLE_LABELS[value as StaffInvitationRole] || value || "Chưa xác định";
}

function invitationStatus(invitation: StaffInvitation) {
  if (invitation.status === "accepted") {
    return (
      <Badge className="border-success/25 bg-success/10 text-success">
        Đã chấp nhận
      </Badge>
    );
  }
  if (invitation.status === "revoked") {
    return <Badge variant="destructive">Đã thu hồi</Badge>;
  }
  if (invitation.status === "expired") {
    return (
      <Badge className="border-warning/25 bg-warning/10 text-warning">
        Đã hết hạn
      </Badge>
    );
  }
  return (
    <Badge className="border-warning/25 bg-warning/10 text-warning">
      Đang chờ
    </Badge>
  );
}

function membershipStatus(member: ApiUser) {
  const status = member.workspaceMembership?.status;
  if (status === "active") {
    return (
      <Badge className="border-success/25 bg-success/10 text-success">
        Đang hoạt động
      </Badge>
    );
  }
  if (status === "suspended") {
    return (
      <Badge className="border-warning/25 bg-warning/10 text-warning">
        Tạm ngưng
      </Badge>
    );
  }
  if (status === "revoked")
    return <Badge variant="destructive">Đã thu hồi</Badge>;
  return <Badge variant="outline">Chưa xác định</Badge>;
}

export default function StaffPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = user?.currentWorkspace.id || "";
  const canManage = Boolean(
    user?.capabilities.includes("workspace.staff.manage"),
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState<InvitationForm>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [manualAcceptance, setManualAcceptance] =
    useState<ManualAcceptance | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionId, setActionId] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const attemptRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const actionAttemptsRef = useRef(new Map<string, string>());
  const inFlightRef = useRef(false);

  const staffQuery = useQuery({
    queryKey: ["portal", "staff", workspaceId],
    queryFn: smartHealthApi.listStaff,
    enabled: canManage && Boolean(workspaceId),
  });
  const invitationsQuery = useQuery({
    queryKey: ["portal", "staff-invitations", workspaceId],
    queryFn: async () =>
      parsePortalStaffInvitationList(
        await smartHealthApi.listStaffInvitations({
          organizationId: workspaceId,
        }),
      ),
    enabled: canManage && Boolean(workspaceId),
  });

  const staff = staffQuery.data?.staff || [];
  const invitations = invitationsQuery.data || [];

  const refreshStaff = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["portal", "staff", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["portal", "staff-invitations", workspaceId],
      }),
    ]);
  };

  const resetInvite = () => {
    setForm(EMPTY_FORM);
    setSubmitError("");
    setManualAcceptance(null);
    attemptRef.current = null;
  };

  const handleInviteOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    if (!nextOpen) resetInvite();
    setInviteOpen(nextOpen);
  };

  const submitInvitation = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlightRef.current || !workspaceId) return;
    setSubmitError("");
    const payload = {
      organizationId: workspaceId,
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
        : createPortalStaffIdempotencyKey("invite-create", workspaceId);
    attemptRef.current = { fingerprint, idempotencyKey };
    inFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const outcome = parsePortalStaffInvitationOutcome(
        await smartHealthApi.createStaffInvitation(payload, idempotencyKey),
        payload,
      );
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
      await refreshStaff();
      if (outcome.delivery.email === "sent") {
        toast.success("Provider đã xác nhận gửi lời mời.");
      } else {
        toast.warning(
          "Lời mời đã được tạo nhưng email chưa được xác nhận là đã gửi.",
        );
      }
    } catch (error) {
      setSubmitError(errorMessage(error, "Không thể tạo lời mời nhân sự."));
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const resendInvitation = async (invitation: StaffInvitation) => {
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
      actionAttemptsRef.current.delete(operationId);
      setManualAcceptance({
        invitationId: invitation.id,
        email: invitation.email,
        url: outcome.acceptanceUrl || "",
        delivery: outcome.delivery,
      });
      await refreshStaff();
      if (outcome.delivery.email === "sent") {
        toast.success("Provider đã xác nhận gửi lại lời mời.");
      } else {
        toast.warning(
          "Đã tạo lượt gửi lại nhưng email chưa được xác nhận là đã gửi.",
        );
      }
    } catch (error) {
      setActionError(errorMessage(error, "Không thể gửi lại lời mời."));
    } finally {
      setActionId("");
    }
  };

  const confirmInvitationRevoke = (invitation: StaffInvitation) => {
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
        const response = await smartHealthApi.revokeStaffInvitation(
          invitation.id,
          "Thu hồi bởi quản trị viên workspace",
          idempotencyKey,
        );
        assertPortalStaffInvitationStatus(response, invitation.id, "revoked");
        actionAttemptsRef.current.delete(operationId);
        if (manualAcceptance?.invitationId === invitation.id)
          setManualAcceptance(null);
        await refreshStaff();
        toast.success("Backend đã xác nhận thu hồi lời mời.");
      },
    });
  };

  const confirmMembershipAction = (
    member: ApiUser,
    action: WorkspaceMembershipAction,
  ) => {
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
        assertMembershipLifecycleOutcome(response, member.id, action);
        actionAttemptsRef.current.delete(operationId);
        await refreshStaff();
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

  const runConfirmation = async () => {
    if (!confirmation || isConfirming) return;
    setIsConfirming(true);
    setConfirmationError("");
    try {
      await confirmation.run();
      setConfirmation(null);
    } catch (error) {
      setConfirmationError(
        errorMessage(error, "Không thể hoàn tất thao tác nhân sự."),
      );
    } finally {
      setIsConfirming(false);
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

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Không có quyền quản lý nhân sự</CardTitle>
          <CardDescription>
            Tài khoản cần capability `workspace.staff.manage` để mở bề mặt này.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
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
          disabled={!workspaceId}
          className="min-h-11 gap-2"
        >
          <Plus className="h-4 w-4" /> Mời nhân sự
        </Button>
      </div>

      {!workspaceId && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/10 p-4 text-sm text-warning"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> Hãy chọn một
          workspace hợp lệ trước khi mời hoặc quản lý nhân sự.
        </div>
      )}

      {manualAcceptance && (
        <Card className="border-warning/30 bg-warning/5">
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
        <TabsList>
          <TabsTrigger value="members">Thành viên ({staff.length})</TabsTrigger>
          <TabsTrigger value="invitations">
            Lời mời ({invitations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4">
          {staffQuery.isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : staffQuery.error ? (
            <RetryState
              message={errorMessage(
                staffQuery.error,
                "Không thể tải thành viên workspace.",
              )}
              onRetry={() => void staffQuery.refetch()}
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
                      {isCurrentUser ? (
                        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                          Đây là membership đang dùng. Hãy nhờ quản trị viên
                          khác thay đổi nếu cần.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                          {status === "suspended" ? (
                            <Button
                              size="sm"
                              variant="outline"
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
                            className="text-destructive hover:text-destructive"
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
          {invitationsQuery.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : invitationsQuery.error ? (
            <RetryState
              message={errorMessage(
                invitationsQuery.error,
                "Không thể tải danh sách lời mời.",
              )}
              onRetry={() => void invitationsQuery.refetch()}
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
                            disabled={Boolean(actionId)}
                            onClick={() => void resendInvitation(invitation)}
                            className="gap-2"
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
                            disabled={Boolean(actionId)}
                            className="text-destructive hover:text-destructive"
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
              <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
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
                      className="gap-2"
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
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !workspaceId}
                  className="gap-2"
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
                <ShieldCheck className="h-5 w-5 text-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-warning" />
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
            <AlertDialogCancel disabled={isConfirming}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={isConfirming}
              onClick={(event) => {
                event.preventDefault();
                void runConfirmation();
              }}
              className={
                confirmation?.tone === "success"
                  ? "bg-success text-white hover:bg-success/90"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
}: {
  message: string;
  onRetry: () => void;
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
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Tải lại
        </Button>
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
