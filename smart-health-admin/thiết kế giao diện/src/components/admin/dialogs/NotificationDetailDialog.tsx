import * as Dialog from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Info,
  UserCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { findAdminRouteContract } from "@/contracts/admin-route-contract";
import { getNotificationTone, getNotificationTypeLabel } from "@/lib/notification-events";
import { WEB_SURFACE } from "@/lib/surface";

export interface NotificationItem {
  id: number | string;
  title: string;
  message: string;
  time: string;
  type: "warning" | "success" | "info" | string;
  isRead: boolean;
  channel?: string;
  campaignId?: string;
  audienceType?: string;
  audienceRole?: string;
  requestedChannels?: string[];
  inAppStatus?: string;
  emailStatus?: string;
  organizationId?: string;
  userId?: string;
  recipientName?: string;
  recipientEmail?: string;
  deliveryStatus?: string;
  pushStatus?: string;
  sentAt?: string;
  failedAt?: string;
  pushSentAt?: string;
  pushFailedAt?: string;
  readAt?: string;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

interface Props {
  notification: NotificationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readAcknowledgementError?: string;
}

type DetailRow = {
  key: string;
  label: string;
  value: string;
  icon: LucideIcon;
  fromMetadata?: boolean;
};

const METADATA_LABELS: Record<string, string> = {
  actionPath: "Trang liên quan",
  actionLabel: "Tên thao tác",
  workspaceId: "Mã workspace",
  organizationId: "Mã workspace",
  userId: "Mã người dùng",
  patientId: "Mã bệnh nhân",
  deviceId: "Mã thiết bị",
  scanId: "Mã lượt đo",
  doctorUserId: "Mã bác sĩ",
  doctorName: "Bác sĩ",
  doctorEmail: "Email bác sĩ",
  clinicName: "Cơ sở y tế",
  specialty: "Chuyên khoa",
  license: "Số CCHN",
  status: "Trạng thái",
  reason: "Lý do",
  provider: "Provider",
  roleRequestStatus: "Trạng thái yêu cầu",
  requiredFields: "Trường cần bổ sung",
  requestMessage: "Nội dung yêu cầu",
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  ready: "Sẵn sàng",
  disabled: "Đã tắt",
  unavailable: "Provider chưa sẵn sàng",
  skipped: "Đã bỏ qua",
  no_recipient: "Không có địa chỉ nhận",
  no_devices: "Không có thiết bị nhận",
  sent: "Provider đã nhận",
  delivered: "Đã giao",
  deferred: "Provider đang thử lại",
  soft_bounce: "Bị trả lại tạm thời",
  hard_bounce: "Bị trả lại",
  blocked: "Bị provider chặn",
  invalid: "Địa chỉ email không hợp lệ",
  spam: "Bị báo spam",
  partial: "Gửi một phần",
  failed: "Gửi thất bại",
};

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "Trong ứng dụng",
  email: "Email",
  push: "Push notification",
};

const TOP_LEVEL_METADATA_KEYS = new Set([
  "id",
  "type",
  "title",
  "message",
  "channel",
  "read",
  "readAt",
  "createdAt",
  "updatedAt",
  "userId",
  "organizationId",
]);

function isSafeMetadataKey(key: string) {
  return (
    Boolean(key.trim()) &&
    !TOP_LEVEL_METADATA_KEYS.has(key) &&
    !/password|token|secret|api.?key|credential|private/i.test(key)
  );
}

function metadataLabel(key: string) {
  if (METADATA_LABELS[key]) return METADATA_LABELS[key];
  const readable = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : "Thông tin";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function metadataValue(key: string, value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim().slice(0, 500);
    if (!normalized) return null;
    return /At$|Date$|Time$/i.test(key) ? formatDateTime(normalized) : normalized;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return typeof value === "boolean"
      ? value
        ? "Có"
        : "Không"
      : new Intl.NumberFormat("vi-VN").format(value);
  }
  return null;
}

function metadataIcon(key: string): LucideIcon {
  if (/workspace|organization|clinic/i.test(key)) return Building2;
  if (/user|doctor|patient/i.test(key)) return UserCheck;
  if (/At$|Date$|Time$/i.test(key)) return Clock;
  if (key === "actionPath") return ExternalLink;
  return Info;
}

function deliveryStatusLabel(value: string) {
  return DELIVERY_STATUS_LABELS[value] || value;
}

function channelLabel(value: string) {
  return CHANNEL_LABELS[value] || value;
}

function buildNotificationMetadataRows(notification: NotificationItem): DetailRow[] {
  return Object.entries(notification.metadata || {}).flatMap(([key, value]) => {
    if (!isSafeMetadataKey(key)) return [];
    const formattedValue = metadataValue(key, value);
    if (!formattedValue) return [];
    return [
      {
        key: `metadata-${key}`,
        label: metadataLabel(key),
        value: formattedValue,
        icon: metadataIcon(key),
        fromMetadata: true,
      },
    ];
  });
}

function buildNotificationDetailRows(notification: NotificationItem): DetailRow[] {
  const rows: DetailRow[] = [
    {
      key: "type",
      label: "Loại sự kiện",
      value: getNotificationTypeLabel(notification.type),
      icon: Info,
    },
    {
      key: "id",
      label: "Mã thông báo",
      value: String(notification.id),
      icon: FileText,
    },
    {
      key: "time",
      label: "Thời gian",
      value: notification.time,
      icon: Clock,
    },
    {
      key: "read",
      label: "Trạng thái đọc",
      value: notification.isRead ? "Đã đọc" : "Chưa đọc",
      icon: CheckCircle2,
    },
  ];

  if (notification.channel) {
    rows.push({
      key: "channel",
      label: "Kênh",
      value: channelLabel(notification.channel),
      icon: Info,
    });
  }
  if (notification.campaignId) {
    rows.push({
      key: "campaign-id",
      label: "Mã chiến dịch",
      value: notification.campaignId,
      icon: FileText,
    });
  }
  if (notification.requestedChannels?.length) {
    rows.push({
      key: "requested-channels",
      label: "Kênh được yêu cầu",
      value: notification.requestedChannels.map(channelLabel).join(", "),
      icon: Info,
    });
  }
  if (notification.inAppStatus) {
    rows.push({
      key: "in-app-status",
      label: "Trạng thái in-app",
      value: deliveryStatusLabel(notification.inAppStatus),
      icon: CheckCircle2,
    });
  }
  if (notification.emailStatus) {
    rows.push({
      key: "email-status",
      label: "Trạng thái email",
      value: deliveryStatusLabel(notification.emailStatus),
      icon: CheckCircle2,
    });
  }
  if (notification.deliveryStatus) {
    rows.push({
      key: "delivery-status",
      label: "Trạng thái gửi",
      value: deliveryStatusLabel(notification.deliveryStatus),
      icon: CheckCircle2,
    });
  }
  if (notification.pushStatus) {
    rows.push({
      key: "push-status",
      label: "Trạng thái push",
      value: deliveryStatusLabel(notification.pushStatus),
      icon: CheckCircle2,
    });
  }
  if (notification.organizationId) {
    rows.push({
      key: "organization-id",
      label: "Mã workspace",
      value: notification.organizationId,
      icon: Building2,
    });
  }
  if (notification.recipientName || notification.recipientEmail) {
    rows.push({
      key: "recipient",
      label: "Người nhận",
      value: [notification.recipientName, notification.recipientEmail].filter(Boolean).join(" · "),
      icon: UserCheck,
    });
  }
  if (notification.userId) {
    rows.push({
      key: "user-id",
      label: "Mã người liên quan",
      value: notification.userId,
      icon: UserCheck,
    });
  }
  if (notification.sentAt) {
    rows.push({
      key: "sent-at",
      label: "Đã gửi lúc",
      value: formatDateTime(notification.sentAt),
      icon: Clock,
    });
  }
  if (notification.failedAt) {
    rows.push({
      key: "failed-at",
      label: "Thất bại lúc",
      value: formatDateTime(notification.failedAt),
      icon: AlertTriangle,
    });
  }
  if (notification.pushSentAt) {
    rows.push({
      key: "push-sent-at",
      label: "Push đã gửi lúc",
      value: formatDateTime(notification.pushSentAt),
      icon: Clock,
    });
  }
  if (notification.pushFailedAt) {
    rows.push({
      key: "push-failed-at",
      label: "Push thất bại lúc",
      value: formatDateTime(notification.pushFailedAt),
      icon: AlertTriangle,
    });
  }
  if (notification.readAt) {
    rows.push({
      key: "read-at",
      label: "Đã đọc lúc",
      value: formatDateTime(notification.readAt),
      icon: Clock,
    });
  }
  if (typeof notification.retryCount === "number") {
    rows.push({
      key: "retry-count",
      label: "Số lần thử lại",
      value: new Intl.NumberFormat("vi-VN").format(notification.retryCount),
      icon: Info,
    });
  }

  return [...rows, ...buildNotificationMetadataRows(notification)];
}

function safeNotificationActionPath(value: unknown) {
  if (typeof value !== "string") return "";
  const actionPath = value.trim();
  if (!actionPath.startsWith("/") || actionPath.startsWith("//") || actionPath.includes("\\")) {
    return "";
  }
  return actionPath.split(/[?#]/, 1)[0];
}

export function NotificationDetailDialog({
  notification,
  open,
  onOpenChange,
  readAcknowledgementError = "",
}: Props) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  if (!notification) return null;

  const detailRows = buildNotificationDetailRows(notification);
  const hasMetadata = detailRows.some((row) => row.fromMetadata);
  const actionPath = safeNotificationActionPath(notification.metadata?.actionPath);
  const actionContract = actionPath ? findAdminRouteContract(WEB_SURFACE, actionPath) : undefined;
  const supportedActionPath = actionContract ? actionPath : "";
  const rawActionLabel = metadataValue("actionLabel", notification.metadata?.actionLabel);
  const actionLabel =
    rawActionLabel || (actionContract ? `Mở ${actionContract.title}` : "Mở trang liên quan");
  const actionUnavailableReason = actionPath
    ? "Trang liên quan không thuộc bề mặt quản trị hiện tại."
    : "Backend không cung cấp thao tác cho thông báo này.";

  const tone = getNotificationTone(notification.type);
  const Icon =
    tone === "warning" || tone === "error"
      ? AlertTriangle
      : tone === "success"
        ? CheckCircle2
        : Info;
  const iconColor =
    tone === "warning"
      ? "text-warning"
      : tone === "error"
        ? "text-destructive"
        : tone === "success"
          ? "text-success"
          : "text-primary";
  const iconBg =
    tone === "warning"
      ? "bg-warning/10"
      : tone === "error"
        ? "bg-destructive/10"
        : tone === "success"
          ? "bg-success/10"
          : "bg-primary/10";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/50 data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content asChild>
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.2, ease: "easeOut" }}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
                >
                  <Icon className={`h-5 w-5 ${iconColor}`} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold leading-snug text-foreground">
                    {notification.title}
                  </Dialog.Title>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {notification.time}
                  </p>
                </div>
              </div>
              <Dialog.Close
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                aria-label="Đóng chi tiết thông báo"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Dialog.Close>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
              {readAcknowledgementError ? (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
                >
                  {readAcknowledgementError}
                </p>
              ) : null}
              <Dialog.Description className="text-sm leading-6 text-foreground/85">
                {notification.message}
              </Dialog.Description>

              <section aria-labelledby="notification-backend-data-heading">
                <h2
                  id="notification-backend-data-heading"
                  className="mb-3 text-sm font-semibold text-foreground"
                >
                  Dữ liệu backend
                </h2>
                <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {detailRows.map((row) => {
                    const RowIcon = row.icon;
                    return (
                      <div
                        key={row.key}
                        className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] sm:gap-4"
                      >
                        <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                          <RowIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {row.label}
                        </dt>
                        <dd className="break-words text-sm font-medium text-foreground sm:text-right">
                          {row.value}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {!hasMetadata && (
                  <p
                    className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground"
                    role="status"
                  >
                    Backend chưa cung cấp metadata bổ sung cho thông báo này.
                  </p>
                )}
              </section>

              {!supportedActionPath && (
                <p
                  id="notification-action-unavailable"
                  className="text-xs leading-5 text-muted-foreground"
                  role="status"
                >
                  {actionUnavailableReason}
                </p>
              )}
            </div>

            <footer className="grid gap-3 border-t border-border bg-muted/20 p-5 sm:grid-cols-2 sm:p-6">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  Đóng
                </button>
              </Dialog.Close>
              {supportedActionPath ? (
                <button
                  type="button"
                  onClick={() => {
                    navigate({ to: supportedActionPath as never });
                    onOpenChange(false);
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {actionLabel}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={true}
                  aria-describedby="notification-action-unavailable"
                  className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-md border border-border bg-muted px-4 text-sm font-medium text-muted-foreground opacity-70"
                >
                  <Info className="h-4 w-4" aria-hidden="true" />
                  Không có thao tác khả dụng
                </button>
              )}
            </footer>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
