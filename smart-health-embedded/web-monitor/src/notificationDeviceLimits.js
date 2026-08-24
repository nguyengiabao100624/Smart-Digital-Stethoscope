const MAX_ACTIVE_NOTIFICATION_DEVICES_PER_USER = 8;
const MAX_NOTIFICATION_DEVICE_HISTORY_PER_USER = 32;
const MAX_NOTIFICATION_PUSH_FANOUT = 8;
const MIN_FCM_REGISTRATION_TOKEN_LENGTH = 8;
const MAX_FCM_REGISTRATION_TOKEN_LENGTH = 4096;
const FCM_REGISTRATION_TOKEN_PATTERN = /^[A-Za-z0-9:_-]+$/;

function isValidFcmRegistrationToken(value) {
  if (typeof value !== "string") return false;
  const token = value.trim();
  return (
    token === value &&
    token.length >= MIN_FCM_REGISTRATION_TOKEN_LENGTH &&
    token.length <= MAX_FCM_REGISTRATION_TOKEN_LENGTH &&
    FCM_REGISTRATION_TOKEN_PATTERN.test(token)
  );
}

function notificationDeviceLimitError() {
  const error = new Error(
    `An account can have at most ${MAX_ACTIVE_NOTIFICATION_DEVICES_PER_USER} active notification devices`,
  );
  error.statusCode = 409;
  error.code = "NOTIFICATION_DEVICE_LIMIT_REACHED";
  error.details = { maximumActiveDevices: MAX_ACTIVE_NOTIFICATION_DEVICES_PER_USER };
  return error;
}

function assertNotificationDeviceCapacity(devices, userId, fcmToken, enabled = true) {
  if (!enabled) return;
  const activeOtherTokens = new Set(
    (Array.isArray(devices) ? devices : [])
      .filter(
        (device) =>
          device?.enabled !== false &&
          String(device?.userId || "") === String(userId || "") &&
          String(device?.fcmToken || "") !== String(fcmToken || ""),
      )
      .map((device) => String(device.fcmToken || ""))
      .filter(Boolean),
  );
  if (activeOtherTokens.size >= MAX_ACTIVE_NOTIFICATION_DEVICES_PER_USER) {
    throw notificationDeviceLimitError();
  }
}

function selectBoundedNotificationDevices(devices, limit = MAX_NOTIFICATION_PUSH_FANOUT) {
  const boundedLimit = Math.min(
    MAX_NOTIFICATION_PUSH_FANOUT,
    Math.max(0, Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : MAX_NOTIFICATION_PUSH_FANOUT),
  );
  return [...(Array.isArray(devices) ? devices : [])]
    .sort((left, right) =>
      String(right?.updatedAt || right?.createdAt || "").localeCompare(
        String(left?.updatedAt || left?.createdAt || ""),
      ),
    )
    .slice(0, boundedLimit);
}

module.exports = {
  MAX_ACTIVE_NOTIFICATION_DEVICES_PER_USER,
  MAX_NOTIFICATION_DEVICE_HISTORY_PER_USER,
  MAX_NOTIFICATION_PUSH_FANOUT,
  isValidFcmRegistrationToken,
  notificationDeviceLimitError,
  assertNotificationDeviceCapacity,
  selectBoundedNotificationDevices,
};
