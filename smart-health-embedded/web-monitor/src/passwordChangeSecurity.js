const crypto = require("node:crypto");

const PASSWORD_FINGERPRINT_DOMAIN = "shcare:password-idempotency:v1";
const MINIMUM_KEY_BYTES = 32;

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function serializePasswordFingerprintInput(input = {}) {
  return JSON.stringify(stableJsonValue({
    operation: String(input.operation || ""),
    targetUserId: String(input.targetUserId || ""),
    payload: input.payload && typeof input.payload === "object"
      ? input.payload
      : {},
  }));
}

function passwordFingerprintConfigurationError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = "PASSWORD_IDEMPOTENCY_HMAC_KEY_UNAVAILABLE";
  return error;
}

function derivePasswordFingerprintKey(env = process.env) {
  const dedicated = String(env.PASSWORD_IDEMPOTENCY_HMAC_KEY || "");
  const phiKey = String(env.PHI_ENCRYPTION_KEY || "");
  const source = dedicated || phiKey;
  if (!source || !source.trim()) {
    throw passwordFingerprintConfigurationError(
      "Password change idempotency protection is not configured",
    );
  }
  if (Buffer.byteLength(source, "utf8") < MINIMUM_KEY_BYTES) {
    throw passwordFingerprintConfigurationError(
      "Password change idempotency protection requires at least 32 bytes of secret material",
    );
  }
  return crypto
    .createHmac("sha256", Buffer.from(source, "utf8"))
    .update(PASSWORD_FINGERPRINT_DOMAIN, "utf8")
    .digest();
}

function createPasswordIdempotencyFingerprint(input = {}, env = process.env) {
  return crypto
    .createHmac("sha256", derivePasswordFingerprintKey(env))
    .update(serializePasswordFingerprintInput(input), "utf8")
    .digest("hex");
}

module.exports = {
  createPasswordIdempotencyFingerprint,
  derivePasswordFingerprintKey,
  serializePasswordFingerprintInput,
};
