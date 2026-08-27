"use strict";

const NOTIFICATION_PROTOCOL_VERSION = "2";

function readPushString(value, maxLength) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function buildPushNotificationPayload(notification = {}, options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const workspaceId = readPushString(
    notification.workspaceId || notification.organizationId,
    120,
  );
  const data = {
    notificationId: readPushString(notification.id, 120),
    workspaceId,
    organizationId: workspaceId,
    userId: readPushString(notification.userId, 120),
    notificationProtocolVersion: NOTIFICATION_PROTOCOL_VERSION,
    createdAt: readPushString(notification.createdAt, 80) || nowIso(),
  };

  return {
    data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== "")),
    android: {
      priority: "high",
    },
  };
}

module.exports = {
  buildPushNotificationPayload,
  NOTIFICATION_PROTOCOL_VERSION,
};
