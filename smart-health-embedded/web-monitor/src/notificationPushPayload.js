"use strict";

const PUSH_METADATA_FIELDS = new Set([
  "appointmentId",
  "patientId",
  "deviceId",
  "scanId",
  "status",
  "pairingOutcome",
  "presence",
  "onlineConfirmed",
  "connectionMethod",
  "destination",
  "actionPath",
]);

const PUSH_DESTINATIONS = new Set([
  "appointment_detail",
  "appointments",
  "device_detail",
  "notification_detail",
  "record_detail",
  "scan_detail",
]);

function readPushString(value, maxLength) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function readSafeActionPath(value) {
  const path = readPushString(value, 240);
  if (!path || !/^\/(?:portal\/)?(?:appointments|devices|notifications|records|scans)(?:\/[A-Za-z0-9_.:-]+)?$/.test(path)) {
    return "";
  }
  return path;
}

function readSafeDestination(value) {
  const destination = readPushString(value, 80);
  return PUSH_DESTINATIONS.has(destination) ? destination : "";
}

function buildPushNotificationPayload(notification = {}, options = {}) {
  const nowIso = typeof options.nowIso === "function" ? options.nowIso : () => new Date().toISOString();
  const metadata = notification.metadata && typeof notification.metadata === "object" ? notification.metadata : {};
  const data = {
    notificationId: readPushString(notification.id, 120),
    type: readPushString(notification.type, 40) || "info",
    channel: readPushString(notification.channel, 40) || "in_app",
    organizationId: readPushString(notification.organizationId, 120),
    userId: readPushString(notification.userId, 120),
    createdAt: readPushString(notification.createdAt, 80) || nowIso(),
  };

  for (const field of PUSH_METADATA_FIELDS) {
    let value = "";
    if (field === "actionPath") {
      value = readSafeActionPath(metadata[field]);
    } else if (field === "destination") {
      value = readSafeDestination(metadata[field]);
    } else {
      value = readPushString(metadata[field], 120);
    }
    if (value) data[field] = value;
  }

  return {
    notification: {
      title: readPushString(notification.title, 120) || "Shcare",
      body: readPushString(notification.message, 240) || "Bạn có thông báo mới từ Shcare.",
    },
    data: Object.fromEntries(Object.entries(data).filter(([, value]) => value !== "")),
    android: {
      priority: "high",
      notification: {
        channelId: "smart_health_alerts",
        sound: "default",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
        },
      },
    },
  };
}

module.exports = {
  buildPushNotificationPayload,
};
