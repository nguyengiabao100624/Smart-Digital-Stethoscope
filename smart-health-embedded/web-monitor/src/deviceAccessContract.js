const crypto = require("node:crypto");

const DEVICE_ACCESS_LEVELS = Object.freeze(["viewer", "manager"]);
const DEVICE_ACCESS_CODE_PREFIX = "SHC";
const DEVICE_ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEVICE_ACCESS_CODE_PATTERN = /^SHC-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;

function cleanString(value, maximum = 160) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function normalizeDeviceAccessLevel(value) {
  const normalized = cleanString(value, 40).toLowerCase();
  if (!DEVICE_ACCESS_LEVELS.includes(normalized)) {
    const error = new Error("Device access level must be viewer or manager");
    error.statusCode = 400;
    error.code = "DEVICE_ACCESS_LEVEL_INVALID";
    throw error;
  }
  return normalized;
}

function normalizeDeviceAccessCode(value) {
  const compact = cleanString(value, 120)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact.startsWith(DEVICE_ACCESS_CODE_PREFIX) || compact.length !== 19) {
    return "";
  }
  const body = compact.slice(3);
  const formatted = `${DEVICE_ACCESS_CODE_PREFIX}-${body.match(/.{1,4}/g).join("-")}`;
  return DEVICE_ACCESS_CODE_PATTERN.test(formatted) ? formatted : "";
}

function bytesToAccessAlphabet(bytes) {
  let result = "";
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5 && result.length < 16) {
      bits -= 5;
      result += DEVICE_ACCESS_CODE_ALPHABET[(accumulator >>> bits) & 31];
    }
    accumulator &= (1 << bits) - 1;
  }
  if (bits > 0 && result.length < 16) {
    result += DEVICE_ACCESS_CODE_ALPHABET[(accumulator << (5 - bits)) & 31];
  }
  return result.padEnd(16, DEVICE_ACCESS_CODE_ALPHABET[0]).slice(0, 16);
}

function deriveDeviceAccessCode(input = {}) {
  const deviceId = cleanString(input.deviceId);
  const organizationId = cleanString(input.organizationId);
  const accessLevel = normalizeDeviceAccessLevel(input.accessLevel);
  const expiresAt = cleanString(input.expiresAt, 40);
  const secretMaterial = cleanString(input.secretMaterial, 512);
  const idempotencyKey = cleanString(input.idempotencyKey, 200);
  const fingerprint = cleanString(input.fingerprint, 512);
  if (!deviceId || !organizationId || !expiresAt || !secretMaterial || !idempotencyKey || !fingerprint) {
    throw new TypeError("Complete device access derivation material is required");
  }
  const digest = crypto
    .createHmac("sha256", secretMaterial)
    .update("shcare.device-access.v1\0")
    .update(deviceId)
    .update("\0")
    .update(organizationId)
    .update("\0")
    .update(accessLevel)
    .update("\0")
    .update(expiresAt)
    .update("\0")
    .update(idempotencyKey)
    .update("\0")
    .update(fingerprint)
    .digest();
  const body = bytesToAccessAlphabet(digest);
  return `${DEVICE_ACCESS_CODE_PREFIX}-${body.match(/.{1,4}/g).join("-")}`;
}

function hashDeviceAccessCode(code) {
  const normalized = normalizeDeviceAccessCode(code);
  if (!normalized) {
    const error = new Error("Device access code is invalid");
    error.statusCode = 400;
    error.code = "DEVICE_ACCESS_CODE_INVALID";
    throw error;
  }
  return crypto
    .createHash("sha256")
    .update("shcare.device-access.code.v1\0")
    .update(normalized)
    .digest("hex");
}

function buildDeviceAccessQrPayload(code) {
  const normalized = normalizeDeviceAccessCode(code);
  if (!normalized) {
    const error = new Error("Device access code is invalid");
    error.statusCode = 400;
    error.code = "DEVICE_ACCESS_CODE_INVALID";
    throw error;
  }
  return `shcare://device-access?v=1&code=${encodeURIComponent(normalized)}`;
}

function classifyDeviceAccessInvite(invite, now = Date.now()) {
  if (!invite || typeof invite !== "object") return "invalid";
  if (invite.revokedAt) return "revoked";
  if (invite.redeemedAt) return "redeemed";
  const expiresAt = Date.parse(invite.expiresAt || "");
  return Number.isFinite(expiresAt) && Number(now) < expiresAt ? "active" : "expired";
}

function publicDeviceAccessInvite(invite = {}) {
  return {
    id: cleanString(invite.id),
    deviceId: cleanString(invite.deviceId),
    organizationId: cleanString(invite.organizationId),
    accessLevel: normalizeDeviceAccessLevel(invite.accessLevel),
    status: classifyDeviceAccessInvite(invite),
    expiresAt: cleanString(invite.expiresAt, 40),
    redeemedAt: cleanString(invite.redeemedAt, 40) || null,
    redeemedByUserId: cleanString(invite.redeemedByUserId) || null,
    revokedAt: cleanString(invite.revokedAt, 40) || null,
    createdAt: cleanString(invite.createdAt, 40),
  };
}

module.exports = {
  DEVICE_ACCESS_CODE_PATTERN,
  DEVICE_ACCESS_LEVELS,
  buildDeviceAccessQrPayload,
  classifyDeviceAccessInvite,
  deriveDeviceAccessCode,
  hashDeviceAccessCode,
  normalizeDeviceAccessCode,
  normalizeDeviceAccessLevel,
  publicDeviceAccessInvite,
};
