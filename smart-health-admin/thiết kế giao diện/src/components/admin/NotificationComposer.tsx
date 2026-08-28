import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Building2, Mail, RefreshCw, Send, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "./design-system";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_ROLE_LABELS,
  parseNotificationCampaignReceipt,
  parseNotificationOptions,
  resolveNotificationCampaignAttempt,
  type NotificationAudienceType,
  type NotificationCampaignAttempt,
  type NotificationCampaignIntent,
  type NotificationCampaignReceipt,
  type NotificationChannel,
  type NotificationOptions,
} from "@/lib/notification-operations";
import { smartHealthApi, type SmartHealthNotification } from "@/lib/smart-health-api";

type Props = {
  onCreated: (
    notifications: SmartHealthNotification[],
    receipt: NotificationCampaignReceipt,
  ) => void;
};

const CHANNEL_ICONS = {
  in_app: Bell,
  email: Mail,
  push: Smartphone,
} satisfies Record<NotificationChannel, typeof Bell>;

function availabilityLabel(status: string) {
  switch (status) {
    case "ready":
      return "Sẵn sàng";
    case "disabled":
      return "Đã tắt";
    case "unavailable":
      return "Chưa cấu hình";
    case "sent":
      return "Provider đã nhận";
    case "delivered":
      return "Đã giao";
    case "deferred":
      return "Đang thử lại";
    case "soft_bounce":
      return "Bị trả lại tạm thời";
    case "hard_bounce":
      return "Bị trả lại";
    case "blocked":
      return "Bị chặn";
    case "invalid":
      return "Email không hợp lệ";
    case "spam":
      return "Bị báo spam";
    case "no_recipient":
      return "Không có email hợp lệ";
    case "no_devices":
      return "Không có thiết bị nhận";
    case "skipped":
      return "Đã bỏ qua";
    case "failed":
      return "Thất bại";
    default:
      return status;
  }
}

function campaignStatusPresentation(status: NotificationCampaignReceipt["campaign"]["status"]) {
  switch (status) {
    case "delivered":
      return { label: "Đã giao", tone: "success" as const };
    case "pending":
    case "ready":
      return { label: "Đang gửi", tone: "info" as const };
    case "partial":
      return { label: "Một phần", tone: "warning" as const };
    case "failed":
      return { label: "Thất bại", tone: "error" as const };
    default:
      return { label: "Kênh chưa sẵn sàng", tone: "warning" as const };
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function countSummary(summary: Record<string, number> | undefined) {
  if (!summary) return "Chưa có dữ liệu";
  return (
    Object.entries(summary)
      .filter(([, count]) => Number(count) > 0)
      .map(([status, count]) => `${count} ${availabilityLabel(status).toLowerCase()}`)
      .join(" · ") || "Không yêu cầu"
  );
}

export function NotificationComposer({ onCreated }: Props) {
  const [options, setOptions] = useState<NotificationOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [eventType, setEventType] = useState("info");
  const [audienceType, setAudienceType] = useState<NotificationAudienceType>("workspace");
  const [workspaceId, setWorkspaceId] = useState("");
  const [role, setRole] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>(["in_app"]);
  const [attempt, setAttempt] = useState<NotificationCampaignAttempt | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [lastReceipt, setLastReceipt] = useState<NotificationCampaignReceipt | null>(null);
  const [isRefreshingReceipt, setIsRefreshingReceipt] = useState(false);
  const submitLockRef = useRef(false);
  const mountedRef = useRef(true);
  const lastIntentRef = useRef<NotificationCampaignIntent | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError("");
    smartHealthApi
      .getNotificationOptions()
      .then((response) => {
        if (cancelled) return;
        const parsed = parseNotificationOptions(response);
        setOptions(parsed);
        setWorkspaceId((current) =>
          parsed.audiences.workspaces.some((workspace) => workspace.id === current)
            ? current
            : parsed.audiences.workspaces.length === 1
              ? parsed.audiences.workspaces[0].id
              : "",
        );
        setRole((current) =>
          parsed.audiences.roles.includes(current) ? current : parsed.audiences.roles[0] || "",
        );
      })
      .catch((error) => {
        if (cancelled) return;
        setOptions(null);
        setOptionsError(
          toVietnameseErrorMessage(error, "Không thể tải audience và trạng thái provider."),
        );
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const workspaceUsers = useMemo(
    () => options?.audiences.users.filter((user) => user.workspaceId === workspaceId) || [],
    [options, workspaceId],
  );
  const recipientCount = useMemo(() => {
    if (audienceType === "users") return selectedUserIds.length;
    if (audienceType === "role") return workspaceUsers.filter((user) => user.role === role).length;
    return workspaceUsers.length;
  }, [audienceType, role, selectedUserIds.length, workspaceUsers]);
  const audienceUsers = useMemo(() => {
    if (audienceType === "users") {
      const selected = new Set(selectedUserIds);
      return workspaceUsers.filter((user) => selected.has(user.id));
    }
    if (audienceType === "role") return workspaceUsers.filter((user) => user.role === role);
    return workspaceUsers;
  }, [audienceType, role, selectedUserIds, workspaceUsers]);
  const emailRecipientCount = audienceUsers.filter((user) => user.emailEligible).length;
  const blockedEmailRecipientCount = audienceUsers.length - emailRecipientCount;

  useEffect(() => {
    setSelectedUserIds((current) =>
      current.filter((id) => workspaceUsers.some((user) => user.id === id)),
    );
  }, [workspaceUsers]);

  const toggleChannel = (channel: NotificationChannel) => {
    const availability = options?.channels[channel];
    if (!availability?.available) return;
    setChannels((current) =>
      current.includes(channel)
        ? current.length === 1
          ? current
          : current.filter((item) => item !== channel)
        : [...current, channel],
    );
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  const refreshCampaignReceipt = async (campaignId: string, intent: NotificationCampaignIntent) => {
    const response = await smartHealthApi.refreshNotificationCampaign(campaignId);
    const receipt = parseNotificationCampaignReceipt(response, intent);
    if (mountedRef.current) {
      setLastReceipt(receipt);
      onCreated(response.notifications, receipt);
    }
    return receipt;
  };

  const pollCampaignReceipt = async (campaignId: string, intent: NotificationCampaignIntent) => {
    if (mountedRef.current) setIsRefreshingReceipt(true);
    try {
      for (const waitMs of [1200, 2500, 5000, 8000]) {
        await delay(waitMs);
        if (!mountedRef.current) return;
        const receipt = await refreshCampaignReceipt(campaignId, intent);
        if (["delivered", "failed", "unavailable"].includes(receipt.campaign.status)) break;
      }
    } catch (error) {
      if (mountedRef.current) {
        setSubmitError(
          toVietnameseErrorMessage(
            error,
            "Đã tạo chiến dịch nhưng chưa thể đồng bộ trạng thái giao email. Bạn có thể bấm Cập nhật trạng thái.",
          ),
        );
      }
    } finally {
      if (mountedRef.current) setIsRefreshingReceipt(false);
    }
  };

  const refreshLastReceipt = async () => {
    const intent = lastIntentRef.current;
    if (!lastReceipt || !intent || isRefreshingReceipt) return;
    setIsRefreshingReceipt(true);
    setSubmitError("");
    try {
      const receipt = await refreshCampaignReceipt(lastReceipt.campaign.id, intent);
      if (receipt.campaign.status === "delivered")
        toast.success("Email trong chiến dịch đã được giao.");
      else if (["failed", "unavailable"].includes(receipt.campaign.status)) {
        toast.error("Chiến dịch có kênh gửi thất bại. Xem trạng thái chi tiết bên dưới.");
      }
    } catch (error) {
      const errorMessage = toVietnameseErrorMessage(
        error,
        "Không thể cập nhật trạng thái giao email từ provider.",
      );
      setSubmitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsRefreshingReceipt(false);
    }
  };

  const createCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitLockRef.current) return;
    setSubmitError("");
    if (!options || !workspaceId || !title.trim() || !message.trim()) {
      setSubmitError("Vui lòng nhập đủ workspace, tiêu đề và nội dung.");
      return;
    }
    if (recipientCount < 1) {
      setSubmitError("Audience hiện không có người nhận đang hoạt động.");
      return;
    }
    if (channels.length === 1 && channels[0] === "email" && emailRecipientCount < 1) {
      setSubmitError("Audience này không có địa chỉ email thật có thể giao.");
      return;
    }
    const audience = {
      type: audienceType,
      workspaceId,
      ...(audienceType === "role" ? { role } : {}),
      ...(audienceType === "users" ? { userIds: [...selectedUserIds].sort() } : {}),
    } satisfies NotificationCampaignIntent["audience"];
    const intent: NotificationCampaignIntent = {
      title: title.trim(),
      message: message.trim(),
      type: eventType,
      audience,
      channels,
    };
    const nextAttempt = resolveNotificationCampaignAttempt(attempt, intent);
    setAttempt(nextAttempt);
    lastIntentRef.current = intent;
    submitLockRef.current = true;
    setIsCreating(true);
    try {
      const response = await smartHealthApi.createNotification(intent, nextAttempt.idempotencyKey);
      const receipt = parseNotificationCampaignReceipt(response, intent);
      setLastReceipt(receipt);
      onCreated(response.notifications, receipt);
      setAttempt(null);
      if (receipt.campaign.status === "ready") {
        toast.success(
          `Đã tạo chiến dịch cho ${receipt.campaign.recipientCount} người nhận và đang gửi.`,
        );
      } else {
        toast.warning("Chiến dịch đã được ghi nhận; có kênh chưa sẵn sàng hoặc chưa có provider.");
      }
      void pollCampaignReceipt(receipt.campaign.id, intent);
    } catch (error) {
      const errorMessage = toVietnameseErrorMessage(
        error,
        "Không thể tạo chiến dịch thông báo. Có thể thử lại mà không tạo trùng.",
      );
      setSubmitError(errorMessage);
      toast.error(errorMessage);
    } finally {
      submitLockRef.current = false;
      setIsCreating(false);
    }
  };

  if (optionsLoading) {
    return (
      <section aria-busy="true" className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      </section>
    );
  }

  if (!isOnline || optionsError || !options) {
    return (
      <section className="rounded-xl border border-warning/30 bg-warning/10 p-5">
        <h2 className="font-semibold text-foreground">
          {!isOnline ? "Đang ngoại tuyến" : "Chưa tải được cấu hình gửi thông báo"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {!isOnline
            ? "Kết nối mạng để tải audience và trạng thái provider trước khi tạo chiến dịch."
            : optionsError}
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={!isOnline}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Thử lại
        </button>
      </section>
    );
  }

  return (
    <form
      data-testid="notification-composer"
      onSubmit={createCampaign}
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Tạo chiến dịch thông báo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn audience và kênh thật. Backend chỉ báo đã gửi sau khi provider xác nhận.
          </p>
        </div>
        <StatusBadge
          label={`${recipientCount} người nhận phù hợp`}
          tone={recipientCount ? "info" : "warning"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Workspace</span>
          <select
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>
              Chọn workspace cần gửi
            </option>
            {options.audiences.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Kiểu audience</span>
          <select
            value={audienceType}
            onChange={(event) => setAudienceType(event.target.value as NotificationAudienceType)}
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <option value="workspace">Toàn bộ workspace</option>
            <option value="role">Theo vai trò</option>
            <option value="users">Chọn người dùng</option>
          </select>
        </label>
      </div>

      {audienceType === "role" && (
        <label className="mt-4 block space-y-1.5">
          <span className="text-sm font-medium">Vai trò</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring lg:max-w-md"
          >
            {options.audiences.roles.map((item) => (
              <option key={item} value={item}>
                {NOTIFICATION_ROLE_LABELS[item] || item}
              </option>
            ))}
          </select>
        </label>
      )}

      {audienceType === "users" && (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Người nhận</legend>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border p-2">
            {workspaceUsers.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                Workspace chưa có thành viên hoạt động.
              </p>
            ) : (
              workspaceUsers.map((user) => (
                <label
                  key={user.id}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {NOTIFICATION_ROLE_LABELS[user.role] || user.role}
                      {user.email ? ` · ${user.email}` : " · Chưa có email"}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </fieldset>
      )}

      {workspaceId && audienceUsers.length > 0 && (
        <section
          aria-label="Xem trước người nhận"
          className="mt-4 rounded-lg border border-border bg-muted/20 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Người nhận của chiến dịch</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {audienceUsers.length} tài khoản · {emailRecipientCount} email có thể giao
                {blockedEmailRecipientCount > 0
                  ? ` · ${blockedEmailRecipientCount} email thử/không hợp lệ sẽ không gửi`
                  : ""}
              </p>
            </div>
            {blockedEmailRecipientCount > 0 && channels.includes("email") && (
              <StatusBadge label={`${blockedEmailRecipientCount} email bị loại`} tone="warning" />
            )}
          </div>
          <ul className="mt-3 grid gap-2 text-xs md:grid-cols-2">
            {audienceUsers.slice(0, 6).map((user) => (
              <li key={user.id} className="min-w-0 rounded-md bg-background px-3 py-2">
                <span className="block truncate font-medium text-foreground">{user.name}</span>
                <span className="block truncate text-muted-foreground">
                  {user.email || "Chưa có email"}
                  {channels.includes("email") && !user.emailEligible ? " · Không gửi email" : ""}
                </span>
              </li>
            ))}
          </ul>
          {audienceUsers.length > 6 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Và {audienceUsers.length - 6} người nhận khác.
            </p>
          )}
        </section>
      )}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Kênh gửi</legend>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          {(Object.keys(options.channels) as NotificationChannel[]).map((channel) => {
            const availability = options.channels[channel];
            const Icon = CHANNEL_ICONS[channel];
            const selected = channels.includes(channel);
            return (
              <button
                key={channel}
                data-testid={`notification-channel-${channel}`}
                type="button"
                aria-pressed={selected}
                disabled={!availability.available}
                onClick={() => toggleChannel(channel)}
                className={`min-h-[76px] rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-muted/40"
                } disabled:cursor-not-allowed disabled:opacity-65`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Icon className="h-4 w-4" /> {NOTIFICATION_CHANNEL_LABELS[channel]}
                  </span>
                  <StatusBadge
                    label={availabilityLabel(availability.status)}
                    tone={availability.available ? "success" : "warning"}
                  />
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">
                  Provider: {availability.provider}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <label className="space-y-1.5 lg:col-span-2">
          <span className="text-sm font-medium">Tiêu đề</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={180}
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            placeholder="Ví dụ: Thiết bị cần kiểm tra"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Mức thông báo</span>
          <select
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-ring"
          >
            <option value="info">Thông tin</option>
            <option value="warning">Cảnh báo</option>
            <option value="success">Thành công</option>
            <option value="error">Lỗi</option>
          </select>
        </label>
        <label className="space-y-1.5 lg:col-span-3">
          <span className="text-sm font-medium">Nội dung</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            placeholder="Nhập nội dung thông báo bằng tiếng Việt..."
          />
        </label>
      </div>

      {submitError && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {submitError}
        </div>
      )}

      {lastReceipt && (
        <div
          data-testid="notification-campaign-receipt"
          className="mt-4 rounded-lg border border-border bg-muted/30 p-4"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Backend đã ghi nhận chiến dịch {lastReceipt.campaign.id}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {lastReceipt.campaign.recipientCount} người nhận ·{" "}
                {lastReceipt.idempotent ? "Kết quả replay" : "Thao tác mới"}
              </p>
            </div>
            <StatusBadge
              label={campaignStatusPresentation(lastReceipt.campaign.status).label}
              tone={campaignStatusPresentation(lastReceipt.campaign.status).tone}
            />
          </div>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
            <span>In-app: {countSummary(lastReceipt.campaign.channelSummary.in_app)}</span>
            <span>Email: {countSummary(lastReceipt.campaign.channelSummary.email)}</span>
            <span>Push: {countSummary(lastReceipt.campaign.channelSummary.push)}</span>
          </div>
          <button
            type="button"
            onClick={refreshLastReceipt}
            disabled={isRefreshingReceipt}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshingReceipt ? "animate-spin" : ""}`} />
            {isRefreshingReceipt ? "Đang đồng bộ trạng thái..." : "Cập nhật trạng thái giao"}
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          {audienceType === "workspace" ? (
            <Building2 className="h-4 w-4" />
          ) : (
            <Users className="h-4 w-4" />
          )}
          Thành công ở API chỉ có nghĩa backend đã nhận và tạo ledger; email/push có trạng thái
          riêng.
        </div>
        <button
          data-testid="notification-campaign-submit"
          type="submit"
          disabled={
            isCreating ||
            !isOnline ||
            recipientCount < 1 ||
            (channels.length === 1 && channels[0] === "email" && emailRecipientCount < 1)
          }
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {isCreating ? "Đang tạo chiến dịch..." : `Tạo chiến dịch (${recipientCount} người nhận)`}
        </button>
      </div>
    </form>
  );
}
