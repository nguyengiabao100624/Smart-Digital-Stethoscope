import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  Trash2,
  Send,
  Mail,
  Smartphone,
  Users,
} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import {
  NotificationDetailDialog,
  type NotificationItem,
} from "./dialogs/NotificationDetailDialog";
import { PageHeader, StatusBadge } from "./design-system";
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
import { useAdminAccess } from "./useAdminAccess";
import { NOTIFICATION_MANAGE_CAPABILITIES } from "./action-permissions";

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
    title: notification.title || "Thông báo Smart Health",
    message: notification.message || "Backend chưa có nội dung chi tiết.",
    time: formatNotificationTime(notification.createdAt || notification.updatedAt),
    type: notification.type || "info",
    isRead: Boolean(notification.read),
  };
}

export function Notifications() {
  const { hasAnyCapability } = useAdminAccess();
  const canManageNotifications = hasAnyCapability(NOTIFICATION_MANAGE_CAPABILITIES);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [detail, setDetail] = useState<NotificationItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [eventType, setEventType] = useState("info");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState("");

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
        return "border-warning/30 bg-warning/10 text-[#B45309]";
      case "success":
        return "border-success/30 bg-success/10 text-success";
      case "error":
        return "border-destructive/30 bg-destructive/10 text-destructive";
      case "info":
      default:
        return "border-primary/20 bg-primary/10 text-primary";
    }
  };

  const openDetail = (n: NotificationItem) => {
    setDetail(n);
    setDetailOpen(true);
    if (!n.isRead) {
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, isRead: true } : i)));
      smartHealthApi
        .markNotificationRead(String(n.id))
        .then(() => dispatchNotificationSync())
        .catch(() => undefined);
    }
  };

  const markRead = (id: NotificationItem["id"]) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)));
    smartHealthApi
      .markNotificationRead(String(id))
      .then(() => dispatchNotificationSync())
      .catch(() => undefined);
  };

  const markAllRead = () => {
    if (unreadCount === 0) return;
    const snapshot = items;
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    smartHealthApi
      .markAllNotificationsRead()
      .then(() => {
        dispatchNotificationSync();
        toast.success("Đã đánh dấu tất cả thông báo là đã đọc.");
      })
      .catch((error) => {
        setItems(snapshot);
        toast.error(toVietnameseErrorMessage(error, "Không thể đánh dấu tất cả thông báo."));
      });
  };

  const removeOne = (id: NotificationItem["id"]) => {
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    smartHealthApi
      .deleteNotification(String(id))
      .then(() => {
        dispatchNotificationSync();
        toast.success("Đã xóa thông báo.");
      })
      .catch((error) => {
        setItems(snapshot);
        toast.error(toVietnameseErrorMessage(error, "Không thể xóa thông báo."));
      });
  };

  const removeAll = async () => {
    if (!canManageNotifications) {
      toast.error("Tài khoản không có quyền quản lý thông báo.");
      return;
    }
    if (items.length === 0) return;
    setDeleteAllLoading(true);
    setDeleteAllError("");
    const snapshot = items;
    setItems([]);
    try {
      await smartHealthApi.deleteAllNotifications();
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
    if (!canManageNotifications) {
      toast.error("Tài khoản không có quyền quản lý thông báo.");
      return;
    }
    if (items.length === 0) return;
    setDeleteAllError("");
    setDeleteAllConfirmOpen(true);
  };

  const createNotification = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageNotifications) {
      toast.error("Tài khoản không có quyền quản lý thông báo.");
      return;
    }
    if (!title.trim() || !message.trim()) {
      toast.error("Vui lòng nhập tiêu đề và nội dung thông báo");
      return;
    }
    try {
      const { notification } = await smartHealthApi.createNotification({
        title,
        message,
        type: eventType,
        channel: "in_app",
      });
      setItems((prev) => [mapBackendNotification(notification), ...prev]);
      setTitle("");
      setMessage("");
      setEventType("info");
      dispatchNotificationSync();
      toast.success("Đã tạo thông báo và lưu vào backend.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể tạo thông báo."));
    }
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
              whileHover={{ x: 2 }}
              onClick={() => openDetail(note)}
              className={`group p-4 flex gap-4 hover:bg-muted/30 transition-colors cursor-pointer relative ${
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
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetail(note);
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Xem chi tiết
                  </button>
                  {!note.isRead && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markRead(note.id);
                      }}
                      className="text-xs font-medium text-muted-foreground hover:underline"
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
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
        eyebrow="FCM và in-app"
        title="Trung tâm thông báo"
        description="Quản lý thông báo đã gửi, hàng chờ gửi, trạng thái đọc và các kênh in-app, FCM, email."
        action={
          <CapabilityGate capabilities={NOTIFICATION_MANAGE_CAPABILITIES}>
            <button className="flex items-center gap-2 bg-card border border-border text-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors">
              <Settings className="w-4 h-4" />
              Cài đặt thông báo
            </button>
          </CapabilityGate>
        }
      />

      {backendError && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#B45309]">
          Chưa tải được thông báo từ backend. Trang sẽ không dùng dữ liệu mẫu để tránh hiển thị sai:{" "}
          {backendError}
        </div>
      )}

      <CapabilityGate capabilities={NOTIFICATION_MANAGE_CAPABILITIES}>
        <motion.form
          onSubmit={createNotification}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Tạo thông báo</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Gửi đến người nhận, phòng khám hoặc toàn hệ thống.
              </p>
            </div>
            <StatusBadge label="Chờ gửi" tone="warning" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Tiêu đề</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Ví dụ: Thiết bị mất kết nối"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Người nhận</span>
              <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring">
                <option>Phòng khám Đa khoa Tâm Anh</option>
                <option>Tất cả admin phòng khám</option>
                <option>Một bác sĩ cụ thể</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Loại sự kiện</span>
              <select
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              >
                <option value="info">{getNotificationTypeLabel("info")}</option>
                <option value="warning">{getNotificationTypeLabel("warning")}</option>
                <option value="success">{getNotificationTypeLabel("success")}</option>
                <option value="error">{getNotificationTypeLabel("error")}</option>
              </select>
            </label>
            <label className="space-y-1.5 md:col-span-3">
              <span className="text-sm font-medium">Nội dung</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-[88px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Nhập nội dung thông báo bằng tiếng Việt..."
              />
            </label>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                <Bell className="h-3.5 w-3.5" /> in-app
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2.5 py-1 text-secondary">
                <Smartphone className="h-3.5 w-3.5" /> FCM
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> email
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> nhóm người nhận
              </span>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90">
              <Send className="h-4 w-4" />
              Tạo thông báo
            </button>
          </div>
        </motion.form>
      </CapabilityGate>

      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <Tabs.Root defaultValue="all" className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
            <Tabs.List className="flex space-x-2">
              <Tabs.Trigger
                value="all"
                className="px-3 py-1.5 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"
              >
                Tất cả{" "}
                <span className="ml-1.5 bg-primary/10 text-primary py-0.5 px-2 rounded-full text-xs">
                  {items.length}
                </span>
              </Tabs.Trigger>
              <Tabs.Trigger
                value="unread"
                className="px-3 py-1.5 text-sm font-medium rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"
              >
                Chưa đọc{" "}
                <span className="ml-1.5 bg-destructive/10 text-destructive py-0.5 px-2 rounded-full text-xs">
                  {unreadCount}
                </span>
              </Tabs.Trigger>
            </Tabs.List>
            <div className="flex items-center gap-4 text-sm">
              <button
                onClick={markAllRead}
                className="text-primary hover:underline font-medium disabled:opacity-50 disabled:no-underline"
                disabled={unreadCount === 0}
              >
                Đánh dấu tất cả là đã đọc
              </button>
              <CapabilityGate capabilities={NOTIFICATION_MANAGE_CAPABILITIES}>
                <div className="w-px h-4 bg-border" />
                <button
                  onClick={requestRemoveAll}
                  disabled={items.length === 0}
                  className="text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> Xóa tất cả
                </button>
              </CapabilityGate>
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
