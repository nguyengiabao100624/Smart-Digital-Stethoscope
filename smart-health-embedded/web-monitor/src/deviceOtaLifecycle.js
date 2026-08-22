const crypto = require("node:crypto");

const OTA_LIFECYCLE_STATUSES = Object.freeze([
  "pending",
  "delivered",
  "downloading",
  "verifying",
  "rebooting",
  "rolling_back",
  "confirmed",
  "rolled_back",
  "failed",
  "expired",
]);

const OTA_STATUS_SET = new Set(OTA_LIFECYCLE_STATUSES);
const OTA_TERMINAL_STATUSES = new Set([
  "confirmed",
  "rolled_back",
  "failed",
  "expired",
]);

const OTA_STATUS_ORDER = new Map([
  ["pending", 0],
  ["delivered", 1],
  ["downloading", 2],
  ["verifying", 3],
  ["rebooting", 4],
  ["rolling_back", 5],
  ["rolled_back", 6],
]);

const OTA_PRIVATE_STRING_FIELDS = Object.freeze([
  "id",
  "commandId",
  "correlationId",
  "firmwareVersion",
  "checksum",
  "firmwareFileId",
  "firmwareFileName",
  "firmwareStorageBucket",
  "firmwareObjectKey",
  "hardwareTarget",
  "partitionTarget",
  "tokenHash",
  "expiresAt",
  "requestedByUserId",
  "requestedSessionId",
  "organizationId",
  "ownerUserId",
  "ownershipState",
  "ownershipBinding",
  "createdAt",
  "updatedAt",
  "confirmedAt",
  "failedAt",
  "rolledBackAt",
  "failureCode",
  "error",
  "detail",
]);

function objectOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boundedString(value, maxLength = 800) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function normalizeDeviceOtaStatus(value, eventType = "") {
  const event = boundedString(eventType, 120).trim().toLowerCase();
  const reported = boundedString(value, 80).trim().toLowerCase();
  const candidate = reported || event.replace(/^ota\./, "");
  const aliases = {
    accepted: "pending",
    queued: "pending",
    acknowledged: "pending",
    applying: "pending",
    applied: "rebooting",
    requested: "pending",
    download: "downloading",
    download_expired: "expired",
    rollback: "rolling_back",
    rollback_requested: "rolling_back",
  };
  const normalized = aliases[candidate] || candidate;
  return OTA_STATUS_SET.has(normalized) ? normalized : "";
}

function sanitizeDeviceOtaLifecycle(value = {}) {
  const input = objectOf(value);
  const sanitized = {};
  if (input.protocolVersion !== undefined) {
    const protocolVersion = Number(input.protocolVersion);
    if (Number.isInteger(protocolVersion) && protocolVersion > 0) {
      sanitized.protocolVersion = protocolVersion;
    }
  }
  if (input.minimumProtocolVersion !== undefined) {
    const minimumProtocolVersion = Number(input.minimumProtocolVersion);
    if (Number.isInteger(minimumProtocolVersion) && minimumProtocolVersion > 0) {
      sanitized.minimumProtocolVersion = minimumProtocolVersion;
    }
  }
  if (input.firmwareByteSize !== undefined) {
    const firmwareByteSize = Number(input.firmwareByteSize);
    if (Number.isSafeInteger(firmwareByteSize) && firmwareByteSize > 0) {
      sanitized.firmwareByteSize = firmwareByteSize;
    }
  }
  for (const field of OTA_PRIVATE_STRING_FIELDS) {
    const valueForField = boundedString(input[field], field === "error" || field === "detail" ? 500 : 800);
    if (valueForField) sanitized[field] = valueForField;
  }
  const status = normalizeDeviceOtaStatus(input.status || input.otaStatus);
  if (status) sanitized.status = status;
  if (OTA_TERMINAL_STATUSES.has(status)) {
    // Fail closed while hydrating legacy/runtime snapshots as well as during
    // explicit transitions. A terminal OTA can never retain a bearer verifier.
    delete sanitized.tokenHash;
  }
  return sanitized;
}

function isCanonicalDeviceOtaLifecycle(value = {}) {
  const ota = sanitizeDeviceOtaLifecycle(value);
  return Boolean(
    ota.protocolVersion === 1 &&
    ota.id &&
    ota.commandId &&
    ota.correlationId &&
    /^\d+\.\d+\.\d+$/.test(ota.firmwareVersion || "") &&
    /^[a-f0-9]{64}$/.test(ota.checksum || "") &&
    ota.hardwareTarget === "MSM261S4030H0" &&
    ota.partitionTarget === "app" &&
    ota.minimumProtocolVersion === 1 &&
    Number.isFinite(Date.parse(ota.expiresAt || "")) &&
    normalizeDeviceOtaStatus(ota.status) &&
    Number.isFinite(Date.parse(ota.createdAt || "")) &&
    Number.isFinite(Date.parse(ota.updatedAt || ""))
  );
}

function createDeviceOtaOwnershipBinding(value = {}) {
  const organizationId = boundedString(value.organizationId, 800);
  const ownerUserId = boundedString(value.ownerUserId, 800);
  const ownershipState = boundedString(value.ownershipState, 80).toLowerCase();
  if (!organizationId || !ownershipState) return "";
  const canonical = JSON.stringify({ organizationId, ownerUserId, ownershipState });
  return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

function createDeviceOtaAuthoritySnapshot(device = {}, otaInput = device.ota) {
  const ota = sanitizeDeviceOtaLifecycle(otaInput);
  return {
    otaId: ota.id || "",
    commandId: ota.commandId || "",
    tokenHash: ota.tokenHash || "",
    expiresAt: ota.expiresAt || "",
    firmwareFileId: ota.firmwareFileId || "",
    firmwareStorageBucket: ota.firmwareStorageBucket || "",
    firmwareObjectKey: ota.firmwareObjectKey || "",
    firmwareByteSize: Number(ota.firmwareByteSize || 0),
    checksum: ota.checksum || "",
    organizationId: boundedString(device.organizationId, 800),
    ownerUserId: boundedString(device.ownerUserId || device.pairedUserId, 800),
    ownershipState: boundedString(device.ownershipState, 80).toLowerCase(),
    grantOrganizationId: ota.organizationId || "",
    grantOwnerUserId: ota.ownerUserId || "",
    grantOwnershipState: ota.ownershipState || "",
    ownershipBinding: ota.ownershipBinding || "",
  };
}

function isCanonicalPrivateDeviceOtaGrant(value = {}, options = {}) {
  const ota = sanitizeDeviceOtaLifecycle(value);
  const now = options.now instanceof Date
    ? options.now
    : new Date(options.now || Date.now());
  const expiresAt = Date.parse(ota.expiresAt || "");
  return Boolean(
    isCanonicalDeviceOtaLifecycle(ota) &&
    /^sha256:[a-f0-9]{64}$/.test(ota.tokenHash || "") &&
    ota.firmwareFileId &&
    ota.firmwareStorageBucket === "device-firmware" &&
    ota.firmwareObjectKey &&
    Number.isSafeInteger(ota.firmwareByteSize) &&
    ota.firmwareByteSize > 0 &&
    ota.organizationId &&
    ["provisioned", "claimed", "assigned", "unassigned"].includes(ota.ownershipState) &&
    (ota.ownershipState === "provisioned" || ota.ownerUserId) &&
    ota.ownershipBinding === createDeviceOtaOwnershipBinding(ota) &&
    Number.isFinite(now.getTime()) &&
    Number.isFinite(expiresAt) &&
    expiresAt > now.getTime()
  );
}

function lifecycleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function transitionDeviceOtaLifecycle(currentInput, nextStatusInput, options = {}) {
  const current = sanitizeDeviceOtaLifecycle(currentInput);
  const nextStatus = normalizeDeviceOtaStatus(nextStatusInput, options.eventType);
  if (!current.id || !current.commandId) {
    throw lifecycleError(
      "DEVICE_OTA_LIFECYCLE_INVALID",
      "A persisted OTA lifecycle requires canonical OTA and command identifiers",
    );
  }
  if (!nextStatus) {
    throw lifecycleError("DEVICE_OTA_STATUS_INVALID", "Unsupported OTA lifecycle status");
  }
  if (nextStatus === "confirmed" && options.allowConfirmed !== true) {
    throw lifecycleError(
      "DEVICE_OTA_CONFIRMATION_RECONNECT_REQUIRED",
      "OTA confirmation requires an authenticated reconnect with the requested firmware version",
    );
  }

  const currentStatus = normalizeDeviceOtaStatus(current.status) || "pending";
  let changed = currentStatus !== nextStatus;
  if (currentStatus === "confirmed" || currentStatus === "rolled_back") changed = false;
  if (["failed", "expired"].includes(currentStatus)) changed = false;
  if (
    changed &&
    !["failed", "expired", "confirmed"].includes(nextStatus) &&
    Number(OTA_STATUS_ORDER.get(nextStatus)) < Number(OTA_STATUS_ORDER.get(currentStatus))
  ) {
    changed = false;
  }
  if (currentStatus === "rolling_back" && nextStatus !== "rolled_back" && nextStatus !== "failed") {
    changed = false;
  }

  if (!changed) {
    return { ota: current, changed: false, previousStatus: currentStatus };
  }

  const at = boundedString(options.at, 40) || new Date().toISOString();
  const metadata = sanitizeDeviceOtaLifecycle(options.metadata);
  const ota = {
    ...current,
    ...metadata,
    status: nextStatus,
    updatedAt: at,
  };
  if (nextStatus === "confirmed") ota.confirmedAt = at;
  if (nextStatus === "rolled_back") ota.rolledBackAt = at;
  if (nextStatus === "failed") ota.failedAt = at;
  if (OTA_TERMINAL_STATUSES.has(nextStatus)) {
    // A firmware download grant belongs to exactly one active lifecycle.
    // Terminal OTA state revokes the verifier even before wall-clock expiry.
    delete ota.tokenHash;
  }
  return { ota, changed: true, previousStatus: currentStatus };
}

module.exports = {
  OTA_LIFECYCLE_STATUSES,
  OTA_TERMINAL_STATUSES,
  createDeviceOtaAuthoritySnapshot,
  createDeviceOtaOwnershipBinding,
  isCanonicalDeviceOtaLifecycle,
  isCanonicalPrivateDeviceOtaGrant,
  normalizeDeviceOtaStatus,
  sanitizeDeviceOtaLifecycle,
  transitionDeviceOtaLifecycle,
};
