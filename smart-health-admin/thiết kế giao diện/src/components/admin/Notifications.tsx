import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Loader2,
  Trash2,
} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import {
  NotificationDetailDialog,
  type NotificationItem,
} from "./dialogs/NotificationDetailDialog";
import { PageHeader } from "./design-system";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { smartHealthApi, type SmartHealthNotification } from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  dispatchNotificationSync,
  getNotificationTone,
  getNotificationTypeLabel,
  NOTIFICATION_SYNC_EVENT,
} from "@/lib/notification-events";
import { CapabilityGate } from "./AdminAccessContext";
import { NOTIFICATION_MANAGE_CAPABILITIES } from "./action-permissions";
import { useNavigate } from "./router-shim";
import { NotificationComposer } from "./NotificationComposer";
import { createNotificationInboxIdempotencyKey } from "@/lib/notification-operations";

function formatNotificationTime(value?: string | null) {
  if (!value) {
    return "Chưa có thời gian";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 2) {
    return "Vừa xong";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} phút trước`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) {
    return `${diffHours} giờ trước`;
  }
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function mapBackendNotification(notification: SmartHealthNotification): NotificationItem {
  return {
    id: notification.id,
    title: notification.title || "Thông báo Shcare",
    message: notification.message || "Backend chưa có nội dung chi tiết.",
    time: formatNotificationTime(notification.createdAt || notification.updatedAt),
    type: notification.type || "info",
    isRead: Boolean(notification.read),
    channel: notification.channel,
    campaignId: notification.campaignId,
    audienceType: notification.audienceType,
    audienceRole: notification.audienceRole,
    requestedChannels: notification.requestedChannels,
    inAppStatus: notification.inAppStatus,
    emailStatus: notification.emailStatus,
    organizationId: notification.organizationId,
    userId: notification.userId,
    recipientName: notification.recipientName,
    recipientEmail: notification.recipientEmail,
    deliveryStatus: notification.deliveryStatus,
    pushStatus: notification.pushStatus,
    sentAt: notification.sentAt,
    failedAt: notification.failedAt,
    pushSentAt: notification.pushSentAt,
    pushFailedAt: notification.pushFailedAt,
    readAt: notification.readAt,
    retryCount: notification.retryCount,
    metadata: notification.metadata,
  };
}

export function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [detail, setDetail] = useState<NotificationItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState("");
  const [markAllLoading, setMarkAllLoading] = useState(false);
  const [readingIds, setReadingIds] = useState<Set<string>>(() => new Set());
  const readIntentKeysRef = React.useRef(new Map<string, string>());
  const deleteIntentKeysRef = React.useRef(new Map<string, string>());
  const markAllIntentKeyRef = React.useRef<string | null>(null);
  const deleteAllIntentKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadNotifications = (showLoading: boolean) => {
      if (showLoading) {
        setIsLoading(true);
      }

      smartHealthApi
        .listNotifications()
        .then(({ notifications }) => {
          if (cancelled) {
            return;
          }
          setItems(notifications.map(mapBackendNotification));
          setBackendError(null);
        })
        .catch((err) => {
          if (!cancelled) {
            setBackendError(toVietnameseErrorMessage(err, "Không thể tải thông báo."));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    };

    const handleNotificationSync = () => loadNotifications(false);

    loadNotifications(true);
    window.addEventListener(NOTIFICATION_SYNC_EVENT, handleNotificationSync);

    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATION_SYNC_EVENT, handleNotificationSync);
    };
  }, []);

  const unreadCount = useMemo(() => items.filter((i) => !i.isRead).length, [items]);
  const unreadItems = useMemo(() => items.filter((i) => !i.isRead), [items]);

  const getIcon = (type: string) => {
    switch (getNotificationTone(type)) {
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-warning" />;
      case "success":
        return <CheckCircle2 className="w-5 h-5 text-success" />;
      case "error":
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
      case "info":
      default:
        return <Info className="w-5 h-5 text-primary" />;
    }
  };

  const getIconBg = (type: string) => {
    switch (getNotificationTone(type)) {
      case "warning":
        return "bg-warning/10";
      case "success":
        return "bg-success/10";
      case "error":
        return "bg-destructive/10";
      case "info":
      default:
        return "bg-primary/10";
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (getNotificationTone(type)) {
      case "warning":
        return "border-warning/30 bg-warning/10 text-warning-foreground";
      case "success":
        return "border-success/30 bg-success/10 text-success-foreground";
      case "error":
        return "border-destructive/30 bg-destructive/10 text-destructive";
      case "info":
      default:
        return "border-primary/20 bg-primary/10 text-primary";
    }
  };

  const markRead = async (id: NotificationItem["id"]) => {
    const normalizedId = String(id);
    const target = items.find((item) => String(item.id) === normalizedId);
    if (!target || target.isRead || readingIds.has(normalizedId)) return;

    setReadingIds((current) => new Set(current).add(normalizedId));
    setItems((current) =>
      current.map((item) => (String(item.id) === normalizedId ? { ...item, isRead: true } : item)),
    );
    try {
      const idempotencyKey =
        readIntentKeysRef.current.get(normalizedId) ||
        createNotificationInboxIdempotencyKey("read", normalizedId);
      readIntentKeysRef.current.set(normalizedId, idempotencyKey);
      const receipt = await smartHealthApi.markNotificationRead(normalizedId, idempotencyKey);
      if (
        receipt.action !== "read" ||
        receipt.notification?.id !== normalizedId ||
        receipt.notification.read !== true
      ) {
        throw new Error("Máy chủ chưa xác nhận đúng thông báo đã đọc.");
      }
      setItems(receipt.notifications.map(mapBackendNotification));
      readIntentKeysRef.current.delete(normalizedId);
      dispatchNotificationSync();
    } catch (error) {
      setItems((current) =>
        current.map((item) =>
          String(item.id) === normalizedId ? { ...item, isRead: false } : item,
        ),
      );
      toast.error(toVietnameseErrorMessage(error, "Không thể đánh dấu thông báo là đã đọc."));
    } finally {
      setReadingIds((current) => {
        const next = new Set(current);
        next.delete(normalizedId);
        return next;
      });
    }
  };

  const openDetail = (notification: NotificationItem) => {
    setDetail(notification);
    setDetailOpen(true);
    if (!notification.isRead) {
      void markRead(notification.id);
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0 || markAllLoading) return;
    const snapshot = items;
    setMarkAllLoading(true);
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    try {
      const idempotencyKey =
        markAllIntentKeyRef.current || createNotificationInboxIdempotencyKey("read_all");
      markAllIntentKeyRef.current = idempotencyKey;
      const receipt = await smartHealthApi.markAllNotificationsRead(idempotencyKey);
      if (receipt.action !== "read_all" || receipt.notifications.some((item) => !item.read)) {
        throw new Error("Máy chủ chưa xác nhận toàn bộ hộp thư đã đọc.");
      }
      setItems(receipt.notifications.map(mapBackendNotification));
      markAllIntentKeyRef.current = null;
      dispatchNotificationSync();
      toast.success("Đã đánh dấu tất cả thông báo là đã đọc.");
    } catch (error) {
      setItems(snapshot);
      toast.error(toVietnameseErrorMessage(error, "Không thể đánh dấu tất cả thông báo."));
    } finally {
      setMarkAllLoading(false);
    }
  };

  const removeOne = (id: NotificationItem["id"]) => {
    const normalizedId = String(id);
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const idempotencyKey =
      deleteIntentKeysRef.current.get(normalizedId) ||
      createNotificationInboxIdempotencyKey("delete", normalizedId);
    deleteIntentKeysRef.current.set(normalizedId, idempotencyKey);
    smartHealthApi
      .deleteNotification(normalizedId, idempotencyKey)
      .then((receipt) => {
        if (receipt.action !== "delete" || receipt.deletedId !== normalizedId) {
          throw new Error("Máy chủ chưa xác nhận đúng thông báo đã xóa.");
        }
        setItems(receipt.notifications.map(mapBackendNotification));
        deleteIntentKeysRef.current.delete(normalizedId);
        dispatchNotificationSync();
        toast.success("Đã xóa thông báo.");
      })
      .catch((error) => {
        setItems(snapshot);
        toast.error(toVietnameseErrorMessage(error, "Không thể xóa thông báo."));
      });
  };

  const removeAll = async () => {
    if (items.length === 0) return;
    setDeleteAllLoading(true);
    setDeleteAllError("");
    const snapshot = items;
    setItems([]);
    try {
      const idempotencyKey =
        deleteAllIntentKeyRef.current || createNotificationInboxIdempotencyKey("delete_all");
      deleteAllIntentKeyRef.current = idempotencyKey;
      const receipt = await smartHealthApi.deleteAllNotifications(idempotencyKey);
      if (receipt.action !== "delete_all" || receipt.notifications.length !== 0) {
        throw new Error("Máy chủ chưa xác nhận hộp thư đã được xóa.");
      }
      setItems([]);
      deleteAllIntentKeyRef.current = null;
      dispatchNotificationSync();
      toast.success("Đã xóa tất cả thông báo.");
      setDeleteAllConfirmOpen(false);
    } catch (error) {
      setItems(snapshot);
      const message = toVietnameseErrorMessage(error, "Không thể xóa tất cả thông báo.");
      setDeleteAllError(message);
      toast.error(message);
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const requestRemoveAll = () => {
    if (items.length === 0) return;
    setDeleteAllError("");
    setDeleteAllConfirmOpen(true);
  };

  const renderList = (list: NotificationItem[]) => (
    <div className="divide-y divide-border">
      <AnimatePresence initial={false}>
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-0"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex gap-4 p-4">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </motion.div>
        ) : list.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              <Bell className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Không có thông báo</p>
            <p className="text-xs text-muted-foreground mt-1">
              Mọi thông báo mới sẽ hiển thị tại đây.
            </p>
          </motion.div>
        ) : (
          list.map((note) => (
            <motion.div
              key={note.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 24, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={`group p-4 flex gap-4 hover:bg-muted/30 transition-colors relative ${
                !note.isRead ? "bg-primary/5" : ""
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getIconBg(
                  note.type,
                )}`}
              >
                {getIcon(note.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <h3
                    className={`text-sm ${
                      !note.isRead ? "font-bold text-foreground" : "font-medium text-foreground/90"
                    }`}
                  >
                    {note.title}
                  </h3>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${getTypeBadgeClass(
                        note.type,
                      )}`}
                    >
                      {getNotificationTypeLabel(note.type)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {note.time}
                    </span>
                  </div>
                </div>
                <p
                  className={`text-sm mt-1 ${
                    !note.isRead ? "text-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {note.message}
                </p>
                {(note.recipientName || note.recipientEmail) && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    Người nhận: {note.recipientName || note.userId}
                    {note.recipientEmail ? ` · ${note.recipientEmail}` : ""}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetail(note);
                    }}
                    className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10 hover:underline"
                  >
                    Xem chi tiết
                  </button>
                  {!note.isRead && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void markRead(note.id);
                      }}
                      disabled={readingIds.has(String(note.id))}
                      className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:underline"
                    >
                      Đánh dấu đã đọc
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2 shrink-0">
                {!note.isRead && (
                  <div className="w-2 h-2 bg-primary rounded-full mt-2" title="Chưa đọc" />
                )}
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeOne(note.id);
                  }}
                  title="Xóa thông báo"
                  aria-label="Xóa thông báo"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>
          ))
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="space-y-6 h-full flex flex-col max-w-4xl mx-auto w-full">
      <PageHeader
        eyebrow="Dữ liệu notification từ backend"
        title="Trung tâm thông báo"
        description="Theo dõi thông báo và trạng thái đọc thật; trạng thái provider chỉ xuất hiện khi backend trả về."
        action={
          <CapabilityGate capabilities={NOTIFICATION_MANAGE_CAPABILITIES}>
            <button
              type="button"
              onClick={() => navigate("/settings?section=notifications")}
              className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Settings className="w-4 h-4" />
              Cài đặt thông báo
            </button>
          </CapabilityGate>
        }
      />

      {backendError && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
          Chưa tải được thông báo từ backend. Trang sẽ không dùng dữ liệu mẫu để tránh hiển thị sai:{" "}
          {backendError}
        </div>
      )}

      <CapabilityGate capabilities={NOTIFICATION_MANAGE_CAPABILITIES}>
        <NotificationComposer
          onCreated={() => {
            dispatchNotificationSync();
          }}
        />
      </CapabilityGate>

      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <Tabs.Root defaultValue="all" className="flex-1 flex flex-col">
          <div className="flex flex-col gap-3 border-b border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs.List className="flex flex-wrap gap-2">
              <Tabs.Trigger
                value="all"
                className="min-h-11 rounded-md px-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                Tất cả{" "}
                <span className="ml-1.5 bg-primary/10 text-primary py-0.5 px-2 rounded-full text-xs">
                  {items.length}
                </span>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="unread"
                className="min-h-11 rounded-md px-3 text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
              >
                Chưa đọc{" "}
                <span className="ml-1.5 bg-destructive/10 text-destructive py-0.5 px-2 rounded-full text-xs">
                  {unreadCount}
                </span>
              </Tabs.Trigger>
            </Tabs.List>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                onClick={markAllRead}
                className="inline-flex min-h-11 items-center rounded-md px-2 font-medium text-primary hover:bg-primary/10 hover:underline disabled:opacity-50 disabled:no-underline"
                disabled={unreadCount === 0 || markAllLoading}
              >
                {markAllLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    Đang lưu...
                  </>
                ) : (
                  "Đánh dấu tất cả là đã đọc"
                )}
              </button>
              <button
                onClick={requestRemoveAll}
                disabled={items.length === 0}
                className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> Xóa tất cả
              </button>
            </div>
          </div>

          <Tabs.Content value="all" className="flex-1 overflow-y-auto outline-none">
            {renderList(items)}
          </Tabs.Content>
          <Tabs.Content value="unread" className="flex-1 overflow-y-auto outline-none">
            {renderList(unreadItems)}
          </Tabs.Content>
        </Tabs.Root>
      </div>

      <NotificationDetailDialog
        notification={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      <ConfirmActionDialog
        open={deleteAllConfirmOpen}
        onOpenChange={(open) => {
          setDeleteAllConfirmOpen(open);
          if (!open) setDeleteAllError("");
        }}
        title="Xóa tất cả thông báo"
        description={
          <span>
            Bạn có chắc chắn muốn xóa toàn bộ {items.length} thông báo đang hiển thị? Hành động này
            không thể hoàn tác.
          </span>
        }
        confirmLabel="Xóa tất cả"
        tone="danger"
        loading={deleteAllLoading}
        error={deleteAllError}
        onConfirm={removeAll}
      />
    </div>
  );
}
