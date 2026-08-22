import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Check,
  CheckCheck,
  CircleAlert,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
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
  resolveClinicalWorkflowIntent,
  type ClinicalWorkflowIntent,
} from "../../../lib/clinical-workflow-intent";
import {
  smartHealthApi,
  type ApiError,
  type NotificationInboxAction,
  type NotificationInboxItem,
  type NotificationInboxMutationResponse,
  type NotificationInboxResponse,
} from "../../../lib/smart-health-api";
import { portalWorkspaceQueryKey } from "../../../lib/workspace-query-cache";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";

type InboxMutationInput = {
  action: NotificationInboxAction;
  notificationId?: string;
  idempotencyKey: string;
  userId: string;
  workspaceId: string;
  operationEpoch: number;
};

class NotificationConfirmationError extends Error {}
class NotificationOperationSupersededError extends Error {}

function confirmationError(message: string) {
  return new NotificationConfirmationError(message);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Không xác định"
    : date.toLocaleString("vi-VN");
}

function assertInboxAuthority(
  inbox: NotificationInboxResponse,
  expectedUserId: string,
  expectedWorkspaceId: string,
) {
  if (
    !expectedUserId ||
    !expectedWorkspaceId ||
    inbox.userId !== expectedUserId ||
    inbox.workspaceId !== expectedWorkspaceId ||
    inbox.notifications.some(
      (notification) =>
        notification.userId !== expectedUserId ||
        notification.workspaceId !== expectedWorkspaceId ||
        (
          notification.organizationId !== "" &&
          notification.organizationId !== expectedWorkspaceId
        ),
    )
  ) {
    throw confirmationError(
      "Shcare đã chặn phản hồi không thuộc tài khoản hoặc workspace hiện tại.",
    );
  }
}

function assertMutationConfirmation(
  receipt: NotificationInboxMutationResponse,
  input: InboxMutationInput,
  expectedUserId: string,
  expectedWorkspaceId: string,
) {
  assertInboxAuthority(
    {
      userId: receipt.userId,
      workspaceId: receipt.workspaceId,
      notifications: receipt.notifications,
      updatedAt: receipt.updatedAt,
    },
    expectedUserId,
    expectedWorkspaceId,
  );
  if (receipt.action !== input.action) {
    throw confirmationError("Máy chủ chưa xác nhận đúng thao tác thông báo.");
  }
  if (input.action === "read") {
    const id = input.notificationId || "";
    if (
      receipt.notification?.id !== id ||
      receipt.notification.userId !== expectedUserId ||
      receipt.notification.workspaceId !== expectedWorkspaceId ||
      !receipt.notification.read ||
      !receipt.notification.readAt ||
      !receipt.affectedIds.includes(id) ||
      !receipt.notifications.some(
        (notification) =>
          notification.id === id &&
          notification.read &&
          Boolean(notification.readAt),
      )
    ) {
      throw confirmationError("Máy chủ chưa xác nhận thông báo là đã đọc.");
    }
  }
  if (
    input.action === "read_all" &&
    receipt.notifications.some(
      (notification) => !notification.read || !notification.readAt,
    )
  ) {
    throw confirmationError("Máy chủ chưa xác nhận toàn bộ hộp thư là đã đọc.");
  }
  if (input.action === "delete") {
    const id = input.notificationId || "";
    if (
      receipt.deletedId !== id ||
      receipt.notification?.id !== id ||
      receipt.notification.userId !== expectedUserId ||
      receipt.notification.workspaceId !== expectedWorkspaceId ||
      !receipt.affectedIds.includes(id) ||
      receipt.notifications.some((notification) => notification.id === id)
    ) {
      throw confirmationError("Máy chủ chưa xác nhận xóa đúng thông báo.");
    }
  }
}

function mutationLabel(action: NotificationInboxAction) {
  if (action === "read") return "Đã đánh dấu thông báo là đã đọc";
  if (action === "read_all") return "Đã đánh dấu tất cả thông báo là đã đọc";
  return "Đã xóa thông báo";
}

function notificationIcon(type: string) {
  if (type === "warning" || type === "doctor_info_requested") {
    return <TriangleAlert aria-hidden="true" className="size-5" />;
  }
  if (type === "error") {
    return <CircleAlert aria-hidden="true" className="size-5" />;
  }
  return <Info aria-hidden="true" className="size-5" />;
}

function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id || "";
  const workspaceId = user?.currentWorkspace.id || "";
  const canView = Boolean(user?.capabilities.includes("notifications.view"));
  const authorityKey = `${userId}:${workspaceId}`;
  const activeUserRef = useRef(userId);
  const activeWorkspaceRef = useRef(workspaceId);
  const operationEpochRef = useRef(0);
  const [settledAuthorityKey, setSettledAuthorityKey] =
    useState(authorityKey);
  const workspaceChanging = settledAuthorityKey !== authorityKey;
  const queryKey = portalWorkspaceQueryKey(
    workspaceId,
    "personal-notification-inbox",
  );
  const intentRef = useRef<ClinicalWorkflowIntent | null>(null);
  const [online, setOnline] = useState(() => !isOffline());
  const [pendingDelete, setPendingDelete] =
    useState<NotificationInboxItem | null>(null);

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
    activeUserRef.current = userId;
    activeWorkspaceRef.current = workspaceId;
    if (settledAuthorityKey === authorityKey) return;
    operationEpochRef.current += 1;
    intentRef.current = null;
    setPendingDelete(null);
    setSettledAuthorityKey(authorityKey);
  }, [authorityKey, settledAuthorityKey, userId, workspaceId]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const inbox = await smartHealthApi.getNotificationInbox();
      assertInboxAuthority(inbox, userId, workspaceId);
      return inbox;
    },
    enabled: Boolean(
      canView &&
        userId &&
        workspaceId &&
        online &&
        !workspaceChanging,
    ),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async (input: InboxMutationInput) => {
      if (isOffline()) {
        throw new Error(
          "Thiết bị đang ngoại tuyến. Kết nối mạng rồi thử lại.",
        );
      }
      const receipt = input.action === "read"
        ? await smartHealthApi.markNotificationInboxRead(
          input.notificationId || "",
          input.idempotencyKey,
        )
        : input.action === "read_all"
          ? await smartHealthApi.markAllNotificationInboxRead(
            input.idempotencyKey,
          )
          : await smartHealthApi.deleteNotificationInboxItem(
            input.notificationId || "",
            input.idempotencyKey,
          );
      if (
        activeUserRef.current !== input.userId ||
        activeWorkspaceRef.current !== input.workspaceId ||
        operationEpochRef.current !== input.operationEpoch
      ) {
        throw new NotificationOperationSupersededError();
      }
      assertMutationConfirmation(
        receipt,
        input,
        input.userId,
        input.workspaceId,
      );
      return receipt;
    },
    onSuccess: (receipt, input) => {
      intentRef.current = null;
      if (input.action === "delete") setPendingDelete(null);
      queryClient.setQueryData<NotificationInboxResponse>(
        portalWorkspaceQueryKey(
          input.workspaceId,
          "personal-notification-inbox",
        ),
        {
          userId: receipt.userId,
          workspaceId: receipt.workspaceId,
          notifications: receipt.notifications,
          updatedAt: receipt.updatedAt,
        },
      );
      toast.success(mutationLabel(input.action));
    },
    onError: (error: ApiError) => {
      if (error instanceof NotificationOperationSupersededError) return;
      if (
        typeof error.status === "number" ||
        error instanceof NotificationConfirmationError
      ) {
        intentRef.current = null;
      }
      toast.error(error.message);
    },
  });

  const submitMutation = (
    action: NotificationInboxAction,
    notificationId?: string,
  ) => {
    if (
      mutation.isPending ||
      !userId ||
      !workspaceId ||
      !canView ||
      !online ||
      workspaceChanging
    ) {
      return;
    }
    const intent = resolveClinicalWorkflowIntent(
      intentRef.current,
      "notification-inbox",
      {
        action,
        notificationId: notificationId || "",
        userId,
        workspaceId,
      },
    );
    intentRef.current = intent;
    mutation.mutate({
      action,
      notificationId,
      idempotencyKey: intent.idempotencyKey,
      userId,
      workspaceId,
      operationEpoch: operationEpochRef.current,
    });
  };

  const notifications = query.data?.notifications || [];
  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;
  const hasAuthority = Boolean(userId && workspaceId);
  const permissionError =
    (query.error as (ApiError & { requestId?: string }) | null)?.status === 403
      ? (query.error as ApiError & { requestId?: string })
      : null;
  const hasSnapshot = query.data !== undefined;

  return (
    <div
      className="mx-auto max-w-5xl space-y-5"
      data-testid="portal-notifications"
      data-workspace-id={workspaceId}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Bell aria-hidden="true" size={22} />
            Thông báo
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Hộp thư cá nhân được xác nhận theo tài khoản và workspace đang hoạt động.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 gap-2 sm:flex-none"
            disabled={
              query.isFetching ||
              mutation.isPending ||
              !hasAuthority ||
              !canView ||
              !online ||
              workspaceChanging
            }
            onClick={() => void query.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${query.isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
            Tải lại
          </Button>
          <Button
            id="notifications-mark-all-read"
            type="button"
            className="h-11 flex-1 gap-2 sm:flex-none"
            disabled={
              unreadCount === 0 ||
              mutation.isPending ||
              query.isFetching ||
              !hasAuthority ||
              !canView ||
              !online ||
              workspaceChanging
            }
            onClick={() => submitMutation("read_all")}
          >
            {mutation.isPending ? (
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <CheckCheck aria-hidden="true" className="size-4" />
            )}
            Đánh dấu tất cả đã đọc
          </Button>
        </div>
      </header>

      {!online ? (
        <Card
          role="status"
          aria-live="polite"
          className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] shadow-sm"
        >
          <CardContent className="flex items-start gap-3 p-4 text-sm text-[var(--status-warning-fg)]">
            <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <span>
              Thiết bị đang ngoại tuyến. Snapshot đã xác nhận vẫn được hiển
              thị, nhưng đọc, xóa và làm mới thông báo đã bị khóa.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              Trạng thái hộp thư
            </p>
            <p className="text-sm text-muted-foreground">
              {unreadCount} thông báo chưa đọc
            </p>
          </div>
          <Badge variant={unreadCount > 0 ? "default" : "secondary"}>
            {unreadCount > 0 ? "Cần xem" : "Đã cập nhật"}
          </Badge>
        </CardContent>
      </Card>

      {!canView ? (
        <Card role="alert" className="border-destructive/30 shadow-sm">
          <CardContent className="flex gap-3 p-5 text-sm">
            <ShieldAlert
              aria-hidden="true"
              className="size-5 shrink-0 text-destructive"
            />
            Tài khoản không có capability `notifications.view` cho hộp thư
            này.
          </CardContent>
        </Card>
      ) : !hasAuthority ? (
        <Card role="alert" className="border-destructive/30 shadow-sm">
          <CardContent className="flex gap-3 p-5 text-sm">
            <ShieldAlert
              aria-hidden="true"
              className="size-5 shrink-0 text-destructive"
            />
            Chưa có tài khoản và workspace đã được backend xác nhận cho hộp thư này.
          </CardContent>
        </Card>
      ) : permissionError ? (
        <Card role="alert" className="border-destructive/30 shadow-sm">
          <CardContent className="flex gap-3 p-5 text-sm">
            <ShieldAlert
              aria-hidden="true"
              className="size-5 shrink-0 text-destructive"
            />
            <span>
              Backend đã từ chối quyền xem hộp thư thông báo.
              {permissionError.requestId
                ? ` Mã yêu cầu: ${permissionError.requestId}.`
                : ""}
            </span>
          </CardContent>
        </Card>
      ) : !online && !hasSnapshot ? (
        <Card className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] shadow-sm">
          <CardContent className="flex gap-3 p-5 text-sm text-[var(--status-warning-fg)]">
            <WifiOff aria-hidden="true" className="size-5 shrink-0" />
            Chưa có snapshot hộp thư cho workspace này. Kết nối mạng để tải dữ
            liệu từ backend.
          </CardContent>
        </Card>
      ) : query.isPending ? (
        <PortalLoading label="Đang tải hộp thư thông báo..." />
      ) : query.error && !hasSnapshot ? (
        <PortalError
          error={query.error}
          retry={() => void query.refetch()}
        />
      ) : !notifications.length ? (
        <PortalEmpty label="Chưa có thông báo trong workspace hiện tại." />
      ) : (
        <div className="space-y-3">
          {query.error ? (
            <Card
              role="status"
              aria-live="polite"
              className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] shadow-sm"
            >
              <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <TriangleAlert
                  aria-hidden="true"
                  className="size-5 text-[var(--status-warning-fg)]"
                />
                <span className="min-w-0 flex-1">
                  Chưa thể làm mới. Shcare đang giữ ảnh chụp hộp thư đã xác nhận gần nhất.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={!online}
                  onClick={() => void query.refetch()}
                >
                  Thử lại
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              busy={mutation.isPending || !online || !canView}
              onMarkRead={() =>
                submitMutation("read", notification.id)}
              onDelete={() => {
                intentRef.current = null;
                setPendingDelete(notification);
              }}
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) {
            intentRef.current = null;
            setPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa thông báo?</AlertDialogTitle>
            <AlertDialogDescription>
              Thông báo “{pendingDelete?.title}” chỉ biến mất sau khi máy chủ xác nhận.
              Thao tác này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={mutation.isPending}
              className="min-h-11"
            >
              Giữ lại
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 gap-2"
              disabled={mutation.isPending || !pendingDelete || !online}
              aria-disabled={
                mutation.isPending || !pendingDelete || !online
              }
              onClick={() => {
                if (pendingDelete && online) {
                  submitMutation("delete", pendingDelete.id);
                }
              }}
            >
              {mutation.isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Trash2 aria-hidden="true" className="size-4" />
              )}
              Xóa
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NotificationCard({
  notification,
  busy,
  onMarkRead,
  onDelete,
}: {
  notification: NotificationInboxItem;
  busy: boolean;
  onMarkRead: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      role="article"
      data-notification-id={notification.id}
      aria-label={`${notification.title}. ${notification.read ? "Đã đọc" : "Chưa đọc"}`}
      className="shadow-sm transition-colors motion-reduce:transition-none"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            {notificationIcon(notification.type)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle className="text-base leading-6">
                {notification.title}
              </CardTitle>
              <Badge variant={notification.read ? "secondary" : "default"}>
                {notification.read ? "Đã đọc" : "Chưa đọc"}
              </Badge>
            </div>
            <CardDescription className="mt-1">
              {formatDate(notification.createdAt)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-foreground">
          {notification.message}
        </p>
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          {!notification.read ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 gap-2"
              disabled={busy}
              data-notification-read={notification.id}
              onClick={onMarkRead}
            >
              <Check aria-hidden="true" className="size-4" />
              Đánh dấu đã đọc
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="h-11 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            aria-label={`Xóa thông báo ${notification.title}`}
            data-notification-delete={notification.id}
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Xóa
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
