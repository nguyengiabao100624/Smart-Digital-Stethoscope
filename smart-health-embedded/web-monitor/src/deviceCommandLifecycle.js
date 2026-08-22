const DEVICE_COMMAND_PROTOCOL_VERSION = 1;

const DEVICE_COMMAND_TYPES = new Set([
  "restart",
  "wifi.status",
  "device.lock",
  "device.revoke",
  "device.rotate_secret",
  "wifi.update",
  "ota.update",
  "audio.session.start",
  "audio.session.stop",
]);

// The generic Platform Admin endpoint is intentionally narrower than the
// device wire protocol. Commands with ownership, credential, OTA, or clinical
// session side effects must go through their audited specialized workflows.
const GENERIC_SAFE_DEVICE_COMMAND_TYPES = new Set([
  "restart",
  "wifi.status",
  "device.lock",
]);

const SPECIALIZED_DEVICE_COMMAND_ROUTES = new Map([
  ["device.revoke", "/v1/devices/{deviceId}/revoke"],
  ["device.rotate_secret", "/v1/devices/{deviceId}/rotate-secret"],
  ["ota.update", "/v1/devices/{deviceId}/ota"],
  ["audio.session.start", "/v1/scans/start"],
  ["audio.session.stop", "/v1/scans/{scanId}/stop"],
]);

const DEVICE_COMMAND_STATES = new Set([
  "accepted",
  "queued",
  "delivered",
  "acknowledged",
  "applying",
  "applied",
  "failed",
  "expired",
]);

const DEVICE_REPORTED_STATES = new Set([
  "acknowledged",
  "applying",
  "applied",
  "failed",
  "expired",
]);

const TERMINAL_DEVICE_COMMAND_STATES = new Set(["applied", "failed", "expired"]);

const OTA_EXECUTION_STATES = new Set(["acknowledged", "applying"]);

const ALLOWED_TRANSITIONS = new Map([
  ["accepted", new Set(["queued", "delivered", "acknowledged", "failed", "expired"])],
  ["queued", new Set(["delivered", "acknowledged", "failed", "expired"])],
  ["delivered", new Set(["acknowledged", "failed", "expired"])],
  ["acknowledged", new Set(["applying", "applied", "failed", "expired"])],
  ["applying", new Set(["applied", "failed", "expired"])],
]);

function readBoundedString(value, maximum = 128) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function lifecycleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isSupportedDeviceCommandType(value) {
  return DEVICE_COMMAND_TYPES.has(readBoundedString(value, 80));
}

function isGenericSafeDeviceCommandType(value) {
  return GENERIC_SAFE_DEVICE_COMMAND_TYPES.has(readBoundedString(value, 80));
}

function getSpecializedDeviceCommandRoute(value) {
  return SPECIALIZED_DEVICE_COMMAND_ROUTES.get(readBoundedString(value, 80)) || "";
}

function createDeviceCommandEnvelope({
  id,
  type,
  payload = {},
  correlationId,
  issuedAt,
  expiresAt,
  ttlMs = 30_000,
  now = () => new Date(),
}) {
  const commandType = readBoundedString(type, 80);
  if (!DEVICE_COMMAND_TYPES.has(commandType)) {
    throw lifecycleError("DEVICE_COMMAND_TYPE_UNSUPPORTED", "Unsupported device command type");
  }
  const commandId = readBoundedString(id, 128);
  const correlation = readBoundedString(correlationId, 128);
  if (!commandId || !correlation) {
    throw lifecycleError("DEVICE_COMMAND_IDENTITY_INVALID", "Command id and correlation id are required");
  }

  const issued = issuedAt ? new Date(issuedAt) : now();
  const expires = expiresAt ? new Date(expiresAt) : new Date(issued.getTime() + Math.max(1, Number(ttlMs) || 30_000));
  if (!Number.isFinite(issued.getTime()) || !Number.isFinite(expires.getTime()) || expires <= issued) {
    throw lifecycleError("DEVICE_COMMAND_TIME_INVALID", "Command expiry must be later than issue time");
  }

  return {
    protocolVersion: DEVICE_COMMAND_PROTOCOL_VERSION,
    id: commandId,
    type: commandType,
    issuedAt: issued.toISOString(),
    expiresAt: expires.toISOString(),
    payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {},
    correlationId: correlation,
  };
}

function createDeviceCommandRecord({
  envelope,
  deviceId,
  organizationId = "",
  requestedByUserId = "",
  idempotencyKey = "",
  requestFingerprint = "",
  executionExpiresAt = "",
}) {
  const executionDeadline = executionExpiresAt ? new Date(executionExpiresAt) : null;
  if (
    executionDeadline &&
    (!Number.isFinite(executionDeadline.getTime()) || executionDeadline <= new Date(envelope.expiresAt))
  ) {
    throw lifecycleError(
      "DEVICE_COMMAND_EXECUTION_TIME_INVALID",
      "Command execution expiry must be later than its delivery expiry",
    );
  }
  return {
    protocolVersion: DEVICE_COMMAND_PROTOCOL_VERSION,
    id: envelope.id,
    deviceId: readBoundedString(deviceId, 120),
    organizationId: readBoundedString(organizationId, 120),
    type: envelope.type,
    correlationId: envelope.correlationId,
    state: "accepted",
    code: "COMMAND_ACCEPTED",
    detail: "",
    requestedByUserId: readBoundedString(requestedByUserId, 120),
    idempotencyKey: readBoundedString(idempotencyKey, 160),
    requestFingerprint: readBoundedString(requestFingerprint, 128),
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    ...(executionDeadline ? { executionExpiresAt: executionDeadline.toISOString() } : {}),
    acceptedAt: envelope.issuedAt,
    createdAt: envelope.issuedAt,
    updatedAt: envelope.issuedAt,
  };
}

function transitionDeviceCommand(record, nextState, options = {}) {
  const state = readBoundedString(nextState, 40);
  if (!DEVICE_COMMAND_STATES.has(state)) {
    throw lifecycleError("DEVICE_COMMAND_STATE_INVALID", "Unsupported device command state");
  }
  if (record.state === state || TERMINAL_DEVICE_COMMAND_STATES.has(record.state)) {
    return { command: record, changed: false };
  }
  const allowed = ALLOWED_TRANSITIONS.get(record.state);
  if (!allowed || !allowed.has(state)) {
    throw lifecycleError(
      "DEVICE_COMMAND_TRANSITION_INVALID",
      `Cannot move device command from ${record.state || "unknown"} to ${state}`,
    );
  }

  const timestamp = options.at ? new Date(options.at) : new Date();
  if (!Number.isFinite(timestamp.getTime())) {
    throw lifecycleError("DEVICE_COMMAND_TIME_INVALID", "Command status timestamp is invalid");
  }
  record.state = state;
  record.code = readBoundedString(options.code, 80) || record.code || "COMMAND_STATUS_UPDATED";
  record.detail = readBoundedString(options.detail, 240);
  record.updatedAt = timestamp.toISOString();
  record[`${state}At`] = record.updatedAt;
  if (options.delivery && typeof options.delivery === "object") {
    record.delivery = {
      websocket: Boolean(options.delivery.websocket),
      mqtt: Boolean(options.delivery.mqtt),
      delivered: Boolean(options.delivery.delivered),
    };
  }
  return { command: record, changed: true };
}

function applyDeviceCommandDelivery(record, delivery, at = new Date()) {
  const delivered = Boolean(delivery?.delivered);
  return transitionDeviceCommand(record, delivered ? "delivered" : "failed", {
    at,
    code: delivered ? "TRANSPORT_DELIVERED" : "TRANSPORT_LOST",
    detail: delivered
      ? "Command delivered to an authenticated transport"
      : "Authenticated device transport disconnected before command delivery",
    delivery,
  });
}

function isOtaExecutionInProgress(record) {
  return record?.type === "ota.update" && OTA_EXECUTION_STATES.has(record?.state);
}

function getDeviceCommandExpiry(record) {
  const deadline = isOtaExecutionInProgress(record)
    ? record.executionExpiresAt
    : record.expiresAt;
  return new Date(deadline || record.expiresAt);
}

function expireDeviceCommandIfOverdue(record, at = new Date()) {
  if (TERMINAL_DEVICE_COMMAND_STATES.has(record.state)) {
    return { command: record, changed: false };
  }
  const timestamp = new Date(at);
  const expiresAt = getDeviceCommandExpiry(record);
  if (!Number.isFinite(timestamp.getTime()) || !Number.isFinite(expiresAt.getTime())) {
    throw lifecycleError("DEVICE_COMMAND_TIME_INVALID", "Command expiry timestamp is invalid");
  }
  if (timestamp.getTime() < expiresAt.getTime()) {
    return { command: record, changed: false };
  }
  return transitionDeviceCommand(record, "expired", {
    at: timestamp,
    code: isOtaExecutionInProgress(record) ? "OTA_EXECUTION_EXPIRED" : "COMMAND_EXPIRED",
    detail: isOtaExecutionInProgress(record)
      ? "OTA did not provide a terminal boot-health result before its execution deadline"
      : "Device did not report a terminal result before command expiry",
  });
}

function applyDeviceReportedCommandStatus(record, status, deviceId, at = new Date()) {
  if (!status || status.protocolVersion !== DEVICE_COMMAND_PROTOCOL_VERSION || status.type !== "command.status") {
    throw lifecycleError("DEVICE_COMMAND_STATUS_INVALID", "Device command status envelope is invalid");
  }
  if (readBoundedString(deviceId, 120) !== record.deviceId) {
    throw lifecycleError("DEVICE_COMMAND_DEVICE_MISMATCH", "Device cannot update another device command");
  }
  if (readBoundedString(status.commandId, 128) !== record.id) {
    throw lifecycleError("DEVICE_COMMAND_ID_MISMATCH", "Device command status id does not match");
  }
  if (readBoundedString(status.correlationId, 128) !== record.correlationId) {
    throw lifecycleError("DEVICE_COMMAND_CORRELATION_MISMATCH", "Device command correlation does not match");
  }
  const state = readBoundedString(status.state, 40);
  const code = readBoundedString(status.code, 80);
  if (!DEVICE_REPORTED_STATES.has(state) || !code) {
    throw lifecycleError("DEVICE_COMMAND_STATUS_INVALID", "Device command status state and code are required");
  }
  if (
    getDeviceCommandExpiry(record).getTime() <= new Date(at).getTime() &&
    !TERMINAL_DEVICE_COMMAND_STATES.has(record.state)
  ) {
    const executionInProgress = isOtaExecutionInProgress(record);
    return transitionDeviceCommand(record, "expired", {
      at,
      code: executionInProgress ? "OTA_EXECUTION_EXPIRED" : "COMMAND_EXPIRED",
      detail: executionInProgress
        ? "OTA progress arrived after its terminal execution deadline"
        : "Device status arrived after command expiry",
    });
  }
  return transitionDeviceCommand(record, state, {
    at,
    code,
    detail: status.detail,
  });
}

function publicDeviceCommand(record) {
  if (!record) return null;
  const delivery = record.delivery && typeof record.delivery === "object"
    ? {
        websocket: Boolean(record.delivery.websocket),
        mqtt: Boolean(record.delivery.mqtt),
        delivered: Boolean(record.delivery.delivered),
      }
    : { websocket: false, mqtt: false, delivered: false };
  return {
    protocolVersion: record.protocolVersion,
    id: record.id,
    deviceId: record.deviceId,
    organizationId: record.organizationId || "",
    type: record.type,
    correlationId: record.correlationId,
    state: record.state,
    status: record.state,
    code: record.code || "",
    detail: record.detail || "",
    requestedByUserId: record.requestedByUserId || "",
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    ...(record.executionExpiresAt ? { executionExpiresAt: record.executionExpiresAt } : {}),
    acceptedAt: record.acceptedAt || "",
    queuedAt: record.queuedAt || "",
    deliveredAt: record.deliveredAt || "",
    acknowledgedAt: record.acknowledgedAt || "",
    applyingAt: record.applyingAt || "",
    appliedAt: record.appliedAt || "",
    failedAt: record.failedAt || "",
    expiredAt: record.expiredAt || "",
    delivery,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

module.exports = {
  DEVICE_COMMAND_PROTOCOL_VERSION,
  DEVICE_COMMAND_STATES,
  DEVICE_COMMAND_TYPES,
  GENERIC_SAFE_DEVICE_COMMAND_TYPES,
  SPECIALIZED_DEVICE_COMMAND_ROUTES,
  TERMINAL_DEVICE_COMMAND_STATES,
  applyDeviceCommandDelivery,
  applyDeviceReportedCommandStatus,
  createDeviceCommandEnvelope,
  createDeviceCommandRecord,
  expireDeviceCommandIfOverdue,
  getSpecializedDeviceCommandRoute,
  isGenericSafeDeviceCommandType,
  isOtaExecutionInProgress,
  getDeviceCommandExpiry,
  isSupportedDeviceCommandType,
  publicDeviceCommand,
  transitionDeviceCommand,
};
