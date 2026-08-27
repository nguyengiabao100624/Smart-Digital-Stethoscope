"use strict";

const CLOUD_NOTIFICATION_PREFERENCE_KEYS = Object.freeze([
  "enabled",
  "doctorRequests",
  "abnormalResults",
  "deviceOffline",
  "appointments",
  "messages",
  "aiUpdates",
  "newLogin",
]);

const LEGACY_DEVICE_PREFERENCE_KEYS = Object.freeze(["sound", "vibration"]);
const ALL_NOTIFICATION_PREFERENCE_KEYS = Object.freeze([
  "enabled",
  ...LEGACY_DEVICE_PREFERENCE_KEYS,
  ...CLOUD_NOTIFICATION_PREFERENCE_KEYS.filter((key) => key !== "enabled"),
]);
const CATEGORY_NOTIFICATION_PREFERENCE_KEYS = new Set(
  CLOUD_NOTIFICATION_PREFERENCE_KEYS.filter((key) => key !== "enabled"),
);
const NOTIFICATION_CAMPAIGN_TYPES = Object.freeze([
  "info",
  "warning",
  "success",
  "error",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createPreferenceError(code, message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function normalizeNotificationPreferences(value = {}) {
  const current = isObject(value) ? value : {};
  return {
    enabled: current.enabled !== false,
    sound: current.sound !== false,
    vibration: current.vibration !== false,
    doctorRequests: current.doctorRequests !== false,
    abnormalResults: current.abnormalResults !== false,
    deviceOffline: current.deviceOffline !== false,
    appointments: current.appointments !== false,
    messages: current.messages !== false,
    aiUpdates: current.aiUpdates === true,
    newLogin: current.newLogin !== false,
  };
}

function mergeNotificationPreferences(currentValue = {}, patch = {}) {
  const next = normalizeNotificationPreferences(currentValue);
  if (!isObject(patch)) return next;
  for (const key of ALL_NOTIFICATION_PREFERENCE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && typeof patch[key] === "boolean") {
      next[key] = patch[key];
    }
  }
  return next;
}

function parseNotificationPreferencePatch(payload) {
  if (!isObject(payload)) {
    throw createPreferenceError(
      "NOTIFICATION_PREFERENCE_PATCH_INVALID",
      "Notification preference patch must be an object",
    );
  }
  const keys = Object.keys(payload).sort();
  if (keys.length !== 2 || keys[0] !== "enabled" || keys[1] !== "key") {
    throw createPreferenceError(
      "NOTIFICATION_PREFERENCE_PATCH_INVALID",
      "Notification preference patch must contain only key and enabled",
    );
  }
  if (
    typeof payload.key !== "string" ||
    !CLOUD_NOTIFICATION_PREFERENCE_KEYS.includes(payload.key)
  ) {
    throw createPreferenceError(
      "NOTIFICATION_PREFERENCE_FIELD_INVALID",
      "Notification preference field is not supported",
    );
  }
  if (typeof payload.enabled !== "boolean") {
    throw createPreferenceError(
      "NOTIFICATION_PREFERENCE_PATCH_INVALID",
      "Notification preference enabled value must be boolean",
    );
  }
  return { key: payload.key, enabled: payload.enabled };
}

function parseNotificationCampaignType(value) {
  const type = readType(value);
  if (!NOTIFICATION_CAMPAIGN_TYPES.includes(type)) {
    throw createPreferenceError(
      "NOTIFICATION_TYPE_INVALID",
      "Notification type must be info, warning, success or error",
    );
  }
  return type;
}

function mergeNotificationPushStatus(currentValue, nextValue) {
  const current = readType(currentValue);
  const next = readType(nextValue);
  if (current === "sent") return "sent";
  if (current === "partial" && !["sent"].includes(next)) return "partial";
  return next || current || "ready";
}

function readType(value) {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 80) : "";
}

function resolveNotificationPreferenceKey(notification = {}) {
  const metadata = isObject(notification.metadata) ? notification.metadata : {};
  const explicit = typeof metadata.preferenceKey === "string" ? metadata.preferenceKey.trim() : "";
  if (CATEGORY_NOTIFICATION_PREFERENCE_KEYS.has(explicit)) return explicit;

  const type = readType(notification.type);
  if (type === "doctor_info_requested" || type.startsWith("doctor_")) return "doctorRequests";
  if (
    ["abnormal_result", "abnormal_results", "scan_abnormal", "clinical_alert"].includes(type)
  ) {
    return "abnormalResults";
  }
  if (["device_offline", "device_disconnected"].includes(type)) return "deviceOffline";
  if (metadata.appointmentId || type.startsWith("appointment_")) return "appointments";
  if (type === "message" || type.startsWith("message_")) return "messages";
  if (type.startsWith("ai_")) return "aiUpdates";
  if (type === "new_login" || type.startsWith("login_")) return "newLogin";
  return null;
}

function resolveNotificationPreferenceDecision(preferences, notification = {}) {
  const normalized = normalizeNotificationPreferences(preferences);
  const preferenceKey = resolveNotificationPreferenceKey(notification);
  if (!normalized.enabled) {
    return {
      allowed: false,
      preferenceKey,
      reasonCode: "NOTIFICATION_PREFERENCES_DISABLED",
    };
  }
  if (preferenceKey && normalized[preferenceKey] === false) {
    return {
      allowed: false,
      preferenceKey,
      reasonCode: "NOTIFICATION_PREFERENCE_DISABLED",
    };
  }
  return { allowed: true, preferenceKey, reasonCode: "" };
}

module.exports = {
  ALL_NOTIFICATION_PREFERENCE_KEYS,
  CLOUD_NOTIFICATION_PREFERENCE_KEYS,
  LEGACY_DEVICE_PREFERENCE_KEYS,
  NOTIFICATION_CAMPAIGN_TYPES,
  mergeNotificationPreferences,
  mergeNotificationPushStatus,
  normalizeNotificationPreferences,
  parseNotificationCampaignType,
  parseNotificationPreferencePatch,
  resolveNotificationPreferenceDecision,
  resolveNotificationPreferenceKey,
};
