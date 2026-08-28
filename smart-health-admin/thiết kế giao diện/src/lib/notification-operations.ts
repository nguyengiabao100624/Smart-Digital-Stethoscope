export type NotificationChannel = "in_app" | "email" | "push";
export type NotificationAudienceType = "workspace" | "role" | "users";
export type NotificationDeliveryStatus =
  | "ready"
  | "disabled"
  | "unavailable"
  | "skipped"
  | "no_recipient"
  | "no_devices"
  | "sent"
  | "delivered"
  | "deferred"
  | "soft_bounce"
  | "hard_bounce"
  | "blocked"
  | "invalid"
  | "spam"
  | "partial"
  | "failed";

export type NotificationAudience = {
  type: NotificationAudienceType;
  workspaceId: string;
  role?: string;
  userIds?: string[];
};

export type NotificationCampaignIntent = {
  title: string;
  message: string;
  type: string;
  audience: NotificationAudience;
  channels: NotificationChannel[];
};

export type NotificationCampaignAttempt = { fingerprint: string; idempotencyKey: string };

export type NotificationChannelAvailability = {
  available: boolean;
  status: NotificationDeliveryStatus;
  provider: string;
  reasonCode?: string;
};

export type NotificationOptions = {
  audiences: {
    workspaces: Array<{ id: string; name: string; workspaceType: string }>;
    roles: string[];
    users: Array<{
      id: string;
      workspaceId: string;
      name: string;
      email?: string;
      emailEligible: boolean;
      emailReasonCode?: string;
      role: string;
    }>;
  };
  channels: Record<NotificationChannel, NotificationChannelAvailability>;
};

export type NotificationCampaignReceipt = {
  campaign: {
    id: string;
    operationId: string;
    organizationId: string;
    audience: NotificationAudience;
    requestedChannels: NotificationChannel[];
    recipientCount: number;
    notificationIds: string[];
    channelSummary: Record<string, Record<string, number>>;
    status: "ready" | "pending" | "delivered" | "partial" | "failed" | "unavailable";
    createdAt: string;
  };
  notifications: Array<{
    id: string;
    userId: string;
    organizationId: string;
    campaignId: string;
    requestedChannels: NotificationChannel[];
    inAppStatus: NotificationDeliveryStatus;
    emailStatus: NotificationDeliveryStatus;
    pushStatus: NotificationDeliveryStatus;
  }>;
  idempotent: boolean;
  channelAvailability: Record<NotificationChannel, NotificationChannelAvailability>;
};

const CHANNELS = new Set<NotificationChannel>(["in_app", "email", "push"]);
const AUDIENCE_TYPES = new Set<NotificationAudienceType>(["workspace", "role", "users"]);
const DELIVERY_STATUSES = new Set<NotificationDeliveryStatus>([
  "ready",
  "disabled",
  "unavailable",
  "skipped",
  "no_recipient",
  "no_devices",
  "sent",
  "delivered",
  "deferred",
  "soft_bounce",
  "hard_bounce",
  "blocked",
  "invalid",
  "spam",
  "partial",
  "failed",
]);
const CAMPAIGN_STATUSES = new Set([
  "ready",
  "pending",
  "delivered",
  "partial",
  "failed",
  "unavailable",
]);

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi notification thiếu ${label}.`);
  }
  return value.trim();
}

function requiredBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`Phản hồi notification thiếu ${label}.`);
  return value;
}

function requiredStatus(value: unknown, label: string) {
  const status = requiredString(value, label) as NotificationDeliveryStatus;
  if (!DELIVERY_STATUSES.has(status)) {
    throw new Error(`Phản hồi notification có ${label} không hợp lệ.`);
  }
  return status;
}

function parseChannels(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Phản hồi notification thiếu ${label}.`);
  }
  const channels = value.map((item) => requiredString(item, label) as NotificationChannel);
  if (new Set(channels).size !== channels.length || channels.some((item) => !CHANNELS.has(item))) {
    throw new Error(`Phản hồi notification có ${label} không hợp lệ.`);
  }
  return channels;
}

function parseAudience(value: unknown): NotificationAudience {
  const record = recordOf(value);
  const type = requiredString(record.type, "loại audience") as NotificationAudienceType;
  if (!AUDIENCE_TYPES.has(type)) throw new Error("Phản hồi notification có audience không hợp lệ.");
  const workspaceId = requiredString(record.workspaceId, "workspace audience");
  const role =
    typeof record.role === "string" && record.role.trim() ? record.role.trim() : undefined;
  const userIds = Array.isArray(record.userIds)
    ? record.userIds.map((id) => requiredString(id, "userId audience"))
    : undefined;
  if (type === "role" && !role) throw new Error("Phản hồi notification thiếu role audience.");
  if (type === "users" && (!userIds || userIds.length === 0)) {
    throw new Error("Phản hồi notification thiếu users audience.");
  }
  return { type, workspaceId, ...(role ? { role } : {}), ...(userIds ? { userIds } : {}) };
}

function parseChannelAvailability(value: unknown, label: string): NotificationChannelAvailability {
  const record = recordOf(value);
  return {
    available: requiredBoolean(record.available, `available của ${label}`),
    status: requiredStatus(record.status, `trạng thái ${label}`),
    provider: requiredString(record.provider, `provider ${label}`),
    ...(typeof record.reasonCode === "string" && record.reasonCode.trim()
      ? { reasonCode: record.reasonCode.trim() }
      : {}),
  };
}

export function parseNotificationOptions(value: unknown): NotificationOptions {
  const root = recordOf(value);
  const audiences = recordOf(root.audiences);
  const channels = recordOf(root.channels);
  if (
    !Array.isArray(audiences.workspaces) ||
    !Array.isArray(audiences.roles) ||
    !Array.isArray(audiences.users)
  ) {
    throw new Error("Backend chưa trả đủ catalog audience notification.");
  }
  const workspaces = audiences.workspaces.map((item) => {
    const record = recordOf(item);
    return {
      id: requiredString(record.id, "workspaceId"),
      name: requiredString(record.name, "tên workspace"),
      workspaceType: requiredString(record.workspaceType, "loại workspace"),
    };
  });
  const roles = audiences.roles.map((role) => requiredString(role, "role"));
  const users = audiences.users.map((item) => {
    const record = recordOf(item);
    return {
      id: requiredString(record.id, "userId"),
      workspaceId: requiredString(record.workspaceId, "workspaceId của user"),
      name: requiredString(record.name, "tên user"),
      role: requiredString(record.role, "role của user"),
      emailEligible: requiredBoolean(record.emailEligible, "emailEligible của user"),
      ...(typeof record.email === "string" ? { email: record.email.trim() } : {}),
      ...(typeof record.emailReasonCode === "string" && record.emailReasonCode.trim()
        ? { emailReasonCode: record.emailReasonCode.trim() }
        : {}),
    };
  });
  return {
    audiences: { workspaces, roles, users },
    channels: {
      in_app: parseChannelAvailability(channels.in_app, "in-app"),
      email: parseChannelAvailability(channels.email, "email"),
      push: parseChannelAvailability(channels.push, "push"),
    },
  };
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function normalizeIntent(intent: NotificationCampaignIntent) {
  return {
    title: intent.title.trim(),
    message: intent.message.trim(),
    type: intent.type.trim(),
    audience: {
      type: intent.audience.type,
      workspaceId: intent.audience.workspaceId.trim(),
      ...(intent.audience.role?.trim() ? { role: intent.audience.role.trim() } : {}),
      ...(intent.audience.userIds
        ? {
            userIds: Array.from(
              new Set(intent.audience.userIds.map((id) => id.trim()).filter(Boolean)),
            ).sort(),
          }
        : {}),
    },
    channels: Array.from(new Set(intent.channels)).sort(),
  };
}

export function notificationCampaignFingerprint(intent: NotificationCampaignIntent) {
  return JSON.stringify(normalizeIntent(intent));
}

export function resolveNotificationCampaignAttempt(
  previous: NotificationCampaignAttempt | null | undefined,
  intent: NotificationCampaignIntent,
): NotificationCampaignAttempt {
  const fingerprint = notificationCampaignFingerprint(intent);
  if (previous?.fingerprint === fingerprint) return previous;
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return { fingerprint, idempotencyKey: `admin-notification-campaign-${nonce}` };
}

export function parseNotificationCampaignReceipt(
  value: unknown,
  intent: NotificationCampaignIntent,
): NotificationCampaignReceipt {
  const root = recordOf(value);
  const campaignRecord = recordOf(root.campaign);
  const campaignId = requiredString(campaignRecord.id, "campaignId");
  const operationId = requiredString(campaignRecord.operationId, "operationId");
  if (operationId !== campaignId) throw new Error("Backend trả operationId khác campaignId.");
  const organizationId = requiredString(campaignRecord.organizationId, "workspace campaign");
  const audience = parseAudience(campaignRecord.audience);
  const requestedChannels = parseChannels(campaignRecord.requestedChannels, "requestedChannels");
  const expected = normalizeIntent(intent);
  if (
    organizationId !== expected.audience.workspaceId ||
    audience.workspaceId !== expected.audience.workspaceId
  ) {
    throw new Error("Backend trả campaign khác workspace đang gửi.");
  }
  if (audience.type !== expected.audience.type || audience.role !== expected.audience.role) {
    throw new Error("Backend trả campaign khác audience đang gửi.");
  }
  if (
    audience.type === "users" &&
    !sameStrings([...(audience.userIds || [])].sort(), expected.audience.userIds || [])
  ) {
    throw new Error("Backend trả campaign khác danh sách người nhận.");
  }
  if (!sameStrings([...requestedChannels].sort(), expected.channels)) {
    throw new Error("Backend trả campaign khác kênh đang gửi.");
  }
  const recipientCount = Number(campaignRecord.recipientCount);
  if (!Number.isInteger(recipientCount) || recipientCount < 1 || recipientCount > 200) {
    throw new Error("Backend trả số người nhận notification không hợp lệ.");
  }
  if (!Array.isArray(campaignRecord.notificationIds) || !Array.isArray(root.notifications)) {
    throw new Error("Backend chưa trả đủ notification receipt.");
  }
  const notificationIds = campaignRecord.notificationIds.map((id) =>
    requiredString(id, "notificationId"),
  );
  if (notificationIds.length !== recipientCount || root.notifications.length !== recipientCount) {
    throw new Error("Số notification backend trả không khớp recipientCount.");
  }
  const notifications = root.notifications.map((item) => {
    const record = recordOf(item);
    const notification = {
      id: requiredString(record.id, "notificationId"),
      userId: requiredString(record.userId, "userId notification"),
      organizationId: requiredString(record.organizationId, "workspace notification"),
      campaignId: requiredString(record.campaignId, "campaignId notification"),
      requestedChannels: parseChannels(record.requestedChannels, "kênh notification"),
      inAppStatus: requiredStatus(record.inAppStatus, "in-app"),
      emailStatus: requiredStatus(record.emailStatus, "email"),
      pushStatus: requiredStatus(record.pushStatus, "push"),
    };
    if (notification.campaignId !== campaignId || notification.organizationId !== organizationId) {
      throw new Error("Backend trả notification ngoài campaign/workspace đang gửi.");
    }
    if (!notificationIds.includes(notification.id)) {
      throw new Error("Backend trả notificationId không thuộc campaign receipt.");
    }
    return notification;
  });
  const campaignStatus = requiredString(campaignRecord.status, "trạng thái campaign");
  if (!CAMPAIGN_STATUSES.has(campaignStatus))
    throw new Error("Backend trả trạng thái campaign không hợp lệ.");
  const createdAt = requiredString(campaignRecord.createdAt, "thời điểm tạo campaign");
  if (Number.isNaN(Date.parse(createdAt)))
    throw new Error("Backend trả thời điểm campaign không hợp lệ.");
  const channelSummary = recordOf(campaignRecord.channelSummary) as Record<
    string,
    Record<string, number>
  >;
  const availability = recordOf(root.channelAvailability);
  return {
    campaign: {
      id: campaignId,
      operationId,
      organizationId,
      audience,
      requestedChannels,
      recipientCount,
      notificationIds,
      channelSummary,
      status: campaignStatus as NotificationCampaignReceipt["campaign"]["status"],
      createdAt,
    },
    notifications,
    idempotent: requiredBoolean(root.idempotent, "idempotent"),
    channelAvailability: {
      in_app: parseChannelAvailability(availability.in_app, "in-app"),
      email: parseChannelAvailability(availability.email, "email"),
      push: parseChannelAvailability(availability.push, "push"),
    },
  };
}

export const NOTIFICATION_ROLE_LABELS: Record<string, string> = {
  workspace_owner: "Chủ workspace",
  workspace_admin: "Quản trị workspace",
  doctor: "Bác sĩ",
  nurse: "Điều dưỡng",
  technician: "Kỹ thuật viên",
  billing: "Kế toán",
  viewer: "Chỉ xem",
  patient: "Bệnh nhân",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: "Trong ứng dụng",
  email: "Email",
  push: "Push",
};
