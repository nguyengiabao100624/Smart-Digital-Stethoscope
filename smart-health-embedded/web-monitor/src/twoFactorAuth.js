"use strict";

const crypto = require("node:crypto");

function readString(value, maxLength = 4096) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function parseEncryptionKey(value) {
  const encoded = readString(value, 256);
  if (!encoded) return null;
  let key;
  if (/^[0-9a-f]{64}$/i.test(encoded)) {
    key = Buffer.from(encoded, "hex");
  } else {
    // Buffer.from(value, "base64") silently ignores invalid characters. Require
    // canonical standard base64 (padded or unpadded) before accepting a key.
    if (!/^[A-Za-z0-9+/]{43}=?$/.test(encoded)) return null;
    try {
      key = Buffer.from(encoded, "base64");
    } catch {
      return null;
    }
    const canonical = key.toString("base64").replace(/=+$/u, "");
    if (canonical !== encoded.replace(/=+$/u, "")) return null;
  }
  return key.length === 32 ? key : null;
}

function getTwoFactorAvailability(env = process.env) {
  const configured = Boolean(readString(env.TWO_FACTOR_ENCRYPTION_KEY, 256));
  const available = Boolean(parseEncryptionKey(env.TWO_FACTOR_ENCRYPTION_KEY));
  return {
    available,
    status: available ? "available" : "unavailable",
    methods: available ? ["app"] : [],
    reason: available ? "" : configured ? "invalid_encryption_key" : "encryption_key_not_configured",
  };
}

function twoFactorError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function requireEncryptionKey(env = process.env) {
  const key = parseEncryptionKey(env.TWO_FACTOR_ENCRYPTION_KEY);
  if (!key) {
    throw twoFactorError(
      503,
      "TWO_FACTOR_UNAVAILABLE",
      "Two-factor authentication is unavailable because secure encryption is not configured",
      { availability: getTwoFactorAvailability(env) },
    );
  }
  return key;
}

function enrollmentAad(userId, enrollmentId) {
  return Buffer.from(`shcare:2fa:enrollment:v1:${userId}:${enrollmentId}`, "utf8");
}

function encryptTotpSecret(secret, userId, enrollmentId, env = process.env) {
  const key = requireEncryptionKey(env);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(enrollmentAad(userId, enrollmentId));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    secretCiphertext: ciphertext.toString("base64"),
    secretIv: iv.toString("base64"),
    secretTag: cipher.getAuthTag().toString("base64"),
    secretVersion: 1,
  };
}

function decryptTotpSecret(record, env = process.env) {
  const key = requireEncryptionKey(env);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(record.secretIv, "base64"));
    decipher.setAAD(enrollmentAad(record.userId, record.enrollmentId || record.id));
    decipher.setAuthTag(Buffer.from(record.secretTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(record.secretCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw twoFactorError(503, "TWO_FACTOR_SECRET_UNAVAILABLE", "Two-factor secret could not be decrypted");
  }
}

function normalizeOtp(value) {
  const token = readString(value, 20);
  return /^\d{6}$/.test(token) ? token : "";
}

async function verifyTotpCode(record, token, options = {}, env = process.env) {
  const otp = normalizeOtp(token);
  if (!otp) return { valid: false };
  const secret = decryptTotpSecret(record, env);
  const { verify } = await import("otplib");
  const verificationOptions = {
    secret,
    token: otp,
    epochTolerance: 30,
    ...(Number.isFinite(options.epoch) ? { epoch: options.epoch } : {}),
    ...(Number.isFinite(options.afterTimeStep) ? { afterTimeStep: options.afterTimeStep } : {}),
  };
  const result = await verify(verificationOptions);
  if (result.valid || !Number.isFinite(options.afterTimeStep)) return result;
  const replayProbe = await verify({
    secret,
    token: otp,
    epochTolerance: 30,
    ...(Number.isFinite(options.epoch) ? { epoch: options.epoch } : {}),
  });
  if (replayProbe.valid && Number(replayProbe.timeStep) <= Number(options.afterTimeStep)) {
    return { valid: false, replayed: true, timeStep: Number(replayProbe.timeStep) };
  }
  return result;
}

function derivePurposeKey(masterKey, purpose, salt = Buffer.alloc(0)) {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      masterKey,
      salt,
      Buffer.from(`shcare:2fa:${purpose}:v1`, "utf8"),
      32,
    ),
  );
}

function normalizeRecoveryCode(value) {
  return readString(value, 40).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function hashRecoveryCode(code, userId, credentialId, recoverySalt, env = process.env) {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return "";
  const salt = Buffer.from(recoverySalt, "base64");
  const masterKey = requireEncryptionKey(env);
  const pepper = derivePurposeKey(masterKey, `recovery:${userId}:${credentialId}`, salt);
  return crypto.createHmac("sha256", pepper).update(normalized, "utf8").digest("base64url");
}

function createRecoveryCodeBundle(userId, credentialId, count = 8, env = process.env) {
  requireEncryptionKey(env);
  const recoverySalt = crypto.randomBytes(16).toString("base64");
  const codes = Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(6).toString("hex").toUpperCase();
    return `${raw.slice(0, 6)}-${raw.slice(6)}`;
  });
  const recoveryCodes = codes.map((code, index) => ({
    id: `recovery_${index + 1}_${crypto.randomBytes(4).toString("hex")}`,
    hash: hashRecoveryCode(code, userId, credentialId, recoverySalt, env),
    usedAt: null,
  }));
  return { codes, recoverySalt, recoveryCodes };
}

function normalizeEnrollmentDeliveryBindingInput(input = {}) {
  const userId = readString(input.userId, 160);
  const credentialId = readString(input.credentialId, 200);
  const enrollmentId = readString(input.enrollmentId, 200);
  const idempotencyKey = readString(input.idempotencyKey, 160);
  const primaryBinding = readString(input.primaryBinding, 1000);
  if (!userId || !credentialId || !enrollmentId || !idempotencyKey || !primaryBinding) {
    throw twoFactorError(
      400,
      "TWO_FACTOR_DELIVERY_INPUT_INVALID",
      "Recovery-code delivery must be bound to the user, enrollment, primary session, and idempotency key",
    );
  }
  return { userId, credentialId, enrollmentId, idempotencyKey, primaryBinding };
}

function deriveEnrollmentDeliveryBinding(input = {}, env = process.env) {
  const normalized = normalizeEnrollmentDeliveryBindingInput(input);
  const masterKey = requireEncryptionKey(env);
  const deliveryKey = derivePurposeKey(
    masterKey,
    `enrollment-delivery:${normalized.userId}:${normalized.credentialId}:${normalized.enrollmentId}`,
  );
  const primaryBindingHash = hashPrimaryBinding(normalized.primaryBinding, env);
  const bindingSeed = crypto
    .createHmac("sha256", deliveryKey)
    .update(normalized.idempotencyKey, "utf8")
    .update("\0", "utf8")
    .update(primaryBindingHash, "utf8")
    .digest();
  const acknowledgementKeyHash = crypto
    .createHmac("sha256", bindingSeed)
    .update("acknowledgement-key", "utf8")
    .digest("base64url");
  return { ...normalized, primaryBindingHash, bindingSeed, acknowledgementKeyHash };
}

function deriveEnrollmentDeliverySeed(input = {}, env = process.env) {
  const binding = deriveEnrollmentDeliveryBinding(input, env);
  const verificationCode = readString(input.verificationCode, 20);
  if (!verificationCode) {
    throw twoFactorError(
      400,
      "TWO_FACTOR_DELIVERY_INPUT_INVALID",
      "Recovery-code delivery must be bound to the verified one-time code",
    );
  }
  const seed = crypto
    .createHmac("sha256", binding.bindingSeed)
    .update(verificationCode, "utf8")
    .digest();
  return { ...binding, verificationCode, seed };
}

function createEnrollmentRecoveryAcknowledgementBinding(input = {}, env = process.env) {
  const binding = deriveEnrollmentDeliveryBinding(input, env);
  return {
    primaryBindingHash: binding.primaryBindingHash,
    acknowledgementKeyHash: binding.acknowledgementKeyHash,
  };
}

function hashRecoveryAckToken(token, userId, enrollmentId, env = process.env) {
  const normalizedToken = readString(token, 1024);
  const normalizedUserId = readString(userId, 160);
  const normalizedEnrollmentId = readString(enrollmentId, 200);
  if (!normalizedToken || !normalizedUserId || !normalizedEnrollmentId) return "";
  const key = derivePurposeKey(
    requireEncryptionKey(env),
    `recovery-ack-token:${normalizedUserId}:${normalizedEnrollmentId}`,
  );
  return crypto.createHmac("sha256", key).update(normalizedToken, "utf8").digest("base64url");
}

function createEnrollmentRecoveryDelivery(input = {}, env = process.env) {
  const derived = deriveEnrollmentDeliverySeed(input, env);
  const verifiedAtMs = Number.isFinite(input.verifiedAtMs)
    ? Number(input.verifiedAtMs)
    : Number.isFinite(input.enabledAtMs)
      ? Number(input.enabledAtMs)
      : Date.now();
  const deliveryTtlMs = Math.min(
    15 * 60 * 1000,
    Math.max(60 * 1000, Number(input.deliveryTtlMs || 10 * 60 * 1000)),
  );
  const digest = (label) => crypto.createHmac("sha256", derived.seed).update(label, "utf8").digest();
  const recoverySalt = digest("recovery-salt").subarray(0, 16).toString("base64");
  const codes = Array.from({ length: 8 }, (_, index) => {
    const raw = digest(`recovery-code:${index + 1}`).subarray(0, 6).toString("hex").toUpperCase();
    return `${raw.slice(0, 6)}-${raw.slice(6)}`;
  });
  const deliveryId = `2fa_delivery_${digest("delivery-id").subarray(0, 16).toString("base64url")}`;
  const operationHash = digest("operation-binding").toString("base64url");
  const recoveryAckToken = digest("recovery-ack-token").toString("base64url");
  const recoveryAckTokenHash = hashRecoveryAckToken(
    recoveryAckToken,
    derived.userId,
    derived.enrollmentId,
    env,
  );
  const delivery = {
    version: 1,
    id: deliveryId,
    operationHash,
    primaryBindingHash: derived.primaryBindingHash,
    acknowledgementKeyHash: derived.acknowledgementKeyHash,
    recoveryAckTokenHash,
    expiresAt: new Date(verifiedAtMs + deliveryTtlMs).toISOString(),
    acknowledgedAt: null,
  };
  const recoveryCodes = codes.map((code, index) => ({
    id: `recovery_${index + 1}_${digest(`recovery-id:${index + 1}`).subarray(0, 4).toString("hex")}`,
    hash: hashRecoveryCode(code, derived.userId, derived.credentialId, recoverySalt, env),
    usedAt: null,
    ...(index === 0 ? { delivery } : {}),
  }));
  return {
    userId: derived.userId,
    credentialId: derived.credentialId,
    enrollmentId: derived.enrollmentId,
    codes,
    recoverySalt,
    recoveryCodes,
    delivery,
    recoveryAckToken,
    recoveryAckTokenHash,
    verifiedAt: new Date(verifiedAtMs).toISOString(),
  };
}

function createCompletedEnrollmentSession(input = {}, env = process.env) {
  const userId = readString(input.userId, 160);
  const credentialId = readString(input.credentialId, 200);
  const enrollmentId = readString(input.enrollmentId, 200);
  const recoveryAckToken = readString(input.recoveryAckToken, 1024);
  const primaryBindingHash = readString(input.primaryBindingHash, 200);
  const verifiedAt = readString(input.verifiedAt, 100);
  const deliveryExpiresAt = readString(input.deliveryExpiresAt, 100);
  if (
    !userId ||
    !credentialId ||
    !enrollmentId ||
    !recoveryAckToken ||
    !primaryBindingHash ||
    !Number.isFinite(Date.parse(verifiedAt)) ||
    !Number.isFinite(Date.parse(deliveryExpiresAt))
  ) {
    throw twoFactorError(
      400,
      "TWO_FACTOR_COMPLETION_INPUT_INVALID",
      "Completed second-factor session binding is incomplete",
    );
  }
  const key = derivePurposeKey(
    requireEncryptionKey(env),
    `enrollment-completion:${userId}:${credentialId}:${enrollmentId}`,
  );
  const seed = crypto
    .createHmac("sha256", key)
    .update(recoveryAckToken, "utf8")
    .update("\0", "utf8")
    .update(primaryBindingHash, "utf8")
    .digest();
  const digest = (label) => crypto.createHmac("sha256", seed).update(label, "utf8").digest();
  const token = digest("two-factor-token").toString("base64url");
  const expiresAt = new Date(Date.parse(deliveryExpiresAt) + 10 * 60 * 1000).toISOString();
  return {
    token,
    record: {
      id: `2fa_token_${digest("two-factor-token-id").subarray(0, 16).toString("base64url")}`,
      userId,
      tokenHash: hashTwoFactorToken(token, env),
      primaryBindingHash,
      createdAt: verifiedAt,
      expiresAt,
      lastUsedAt: null,
      revokedAt: null,
    },
  };
}

function timingSafeStringEqual(leftValue, rightValue) {
  const left = Buffer.from(readString(leftValue, 1000), "utf8");
  const right = Buffer.from(readString(rightValue, 1000), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getEnrollmentRecoveryDelivery(credential) {
  const firstCode = Array.isArray(credential?.recoveryCodes) ? credential.recoveryCodes[0] : null;
  const delivery = firstCode?.delivery;
  if (!delivery || Number(delivery.version) !== 1) return null;
  const id = readString(delivery.id, 200);
  const operationHash = readString(delivery.operationHash, 200);
  const primaryBindingHash = readString(delivery.primaryBindingHash, 200);
  const acknowledgementKeyHash = readString(delivery.acknowledgementKeyHash, 200);
  const recoveryAckTokenHash = readString(delivery.recoveryAckTokenHash, 200);
  const expiresAt = readString(delivery.expiresAt, 100);
  const acknowledgedAt = readString(delivery.acknowledgedAt, 100) || null;
  if (
    !id ||
    !operationHash ||
    !primaryBindingHash ||
    !acknowledgementKeyHash ||
    !recoveryAckTokenHash ||
    !Number.isFinite(Date.parse(expiresAt))
  ) return null;
  return {
    version: 1,
    id,
    operationHash,
    primaryBindingHash,
    acknowledgementKeyHash,
    recoveryAckTokenHash,
    expiresAt,
    acknowledgedAt,
  };
}

function isEnrollmentRecoveryDeliveryReplay(record, expected) {
  if (!record || !expected) return false;
  if (!timingSafeStringEqual(record.userId, expected.userId)) return false;
  if (!timingSafeStringEqual(record.enrollmentId || record.id, expected.enrollmentId || "")) return false;
  if (!timingSafeStringEqual(record.credentialId || record.id, expected.credentialId || "")) return false;
  if (!timingSafeStringEqual(record.recoverySalt, expected.recoverySalt)) return false;
  const delivery = getEnrollmentRecoveryDelivery(record);
  const storedAckTokenHash = record.recoveryAckTokenHash || delivery?.recoveryAckTokenHash;
  if (!timingSafeStringEqual(storedAckTokenHash, expected.recoveryAckTokenHash)) return false;
  if (!delivery || !timingSafeStringEqual(delivery.id, expected.delivery?.id)) return false;
  if (!timingSafeStringEqual(delivery.operationHash, expected.delivery?.operationHash)) return false;
  if (!timingSafeStringEqual(delivery.primaryBindingHash, expected.delivery?.primaryBindingHash)) return false;
  if (!timingSafeStringEqual(delivery.acknowledgementKeyHash, expected.delivery?.acknowledgementKeyHash)) return false;
  if (!timingSafeStringEqual(delivery.recoveryAckTokenHash, expected.delivery?.recoveryAckTokenHash)) return false;
  const storedCodes = Array.isArray(record.recoveryCodes) ? record.recoveryCodes : [];
  const expectedCodes = Array.isArray(expected.recoveryCodes) ? expected.recoveryCodes : [];
  if (storedCodes.length !== expectedCodes.length) return false;
  return storedCodes.every((item, index) => timingSafeStringEqual(item?.hash, expectedCodes[index]?.hash));
}

function verifyRecoveryAckToken(record, token, env = process.env) {
  const storedHash = readString(
    record?.recoveryAckTokenHash || getEnrollmentRecoveryDelivery(record)?.recoveryAckTokenHash,
    200,
  );
  const candidateHash = hashRecoveryAckToken(
    token,
    record?.userId,
    record?.enrollmentId || record?.id,
    env,
  );
  return Boolean(storedHash && candidateHash && timingSafeStringEqual(storedHash, candidateHash));
}

function verifyRecoveryCode(credential, code, env = process.env) {
  const candidateHash = hashRecoveryCode(
    code,
    credential.userId,
    credential.id || `2fa_credential_${credential.userId}`,
    credential.recoverySalt,
    env,
  );
  if (!candidateHash) return null;
  let match = null;
  for (const item of Array.isArray(credential.recoveryCodes) ? credential.recoveryCodes : []) {
    const storedHash = readString(item?.hash, 200);
    if (!storedHash || item.usedAt) continue;
    const left = Buffer.from(candidateHash, "utf8");
    const right = Buffer.from(storedHash, "utf8");
    if (left.length === right.length && crypto.timingSafeEqual(left, right)) match = item;
  }
  return match;
}

function hashPrimaryBinding(binding, env = process.env) {
  const key = derivePurposeKey(requireEncryptionKey(env), "primary-binding");
  return crypto.createHmac("sha256", key).update(readString(binding, 1000), "utf8").digest("base64url");
}

function hashTwoFactorToken(token, env = process.env) {
  const key = derivePurposeKey(requireEncryptionKey(env), "access-token");
  return crypto.createHmac("sha256", key).update(readString(token, 500), "utf8").digest("base64url");
}

function createEnrollmentStartBinding(input = {}, env = process.env) {
  const userId = readString(input.userId, 160);
  const idempotencyKey = readString(input.idempotencyKey, 160);
  const primaryBinding = readString(input.primaryBinding, 1000);
  const method = readString(input.method, 40) || "app";
  if (!userId || !idempotencyKey || !primaryBinding || method !== "app") {
    throw twoFactorError(
      400,
      "TWO_FACTOR_ENROLLMENT_START_INTENT_INVALID",
      "Enrollment start must be bound to an account, primary session, method, and idempotency key",
    );
  }
  const startKey = derivePurposeKey(
    requireEncryptionKey(env),
    `enrollment-start:${userId}`,
  );
  return {
    version: 1,
    idempotencyKeyHash: crypto
      .createHmac("sha256", startKey)
      .update(idempotencyKey, "utf8")
      .digest("base64url"),
    primaryBindingHash: hashPrimaryBinding(primaryBinding, env),
    method,
    superseded: false,
  };
}

function createTwoFactorToken(input = {}, env = process.env) {
  const id = readString(input.id, 200);
  const userId = readString(input.userId, 160);
  const primaryBinding = readString(input.primaryBinding, 1000);
  if (!id || !userId || !primaryBinding) {
    throw twoFactorError(400, "TWO_FACTOR_TOKEN_INPUT_INVALID", "Second-factor token binding is required");
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const ttlMs = Math.min(30 * 60 * 1000, Math.max(60 * 1000, Number(input.ttlMs || 10 * 60 * 1000)));
  const record = {
    id,
    userId,
    tokenHash: hashTwoFactorToken(token, env),
    primaryBindingHash: hashPrimaryBinding(primaryBinding, env),
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    lastUsedAt: null,
    revokedAt: null,
  };
  return { token, record };
}

async function createTotpEnrollment(input = {}, env = process.env) {
  requireEncryptionKey(env);
  const userId = readString(input.userId, 160);
  const enrollmentId = readString(input.id, 200);
  const accountLabel = readString(input.accountLabel, 200) || userId;
  if (!userId || !enrollmentId) {
    throw twoFactorError(400, "TWO_FACTOR_ENROLLMENT_INPUT_INVALID", "Enrollment identity is required");
  }
  const { generateSecret, generateURI } = await import("otplib");
  const manualKey = generateSecret();
  const otpauthUri = generateURI({
    issuer: "Shcare",
    label: accountLabel,
    secret: manualKey,
  });
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const ttlMs = Math.min(30 * 60 * 1000, Math.max(60 * 1000, Number(input.ttlMs || 10 * 60 * 1000)));
  const record = {
    id: enrollmentId,
    userId,
    method: "app",
    ...encryptTotpSecret(manualKey, userId, enrollmentId, env),
    attempts: 0,
    maxAttempts: 5,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    consumedAt: null,
  };
  return { record, manualKey, otpauthUri };
}

async function materializeTotpEnrollment(record = {}, input = {}, env = process.env) {
  const userId = readString(record.userId, 160);
  const enrollmentId = readString(record.id || record.enrollmentId, 200);
  const accountLabel = readString(input.accountLabel, 200) || userId;
  const invalidatedByEnrollmentId = readString(
    record.startIntent?.invalidatedByEnrollmentId,
    200,
  );
  const isSupersededStartReplay =
    Boolean(record.consumedAt) &&
    Boolean(invalidatedByEnrollmentId) &&
    invalidatedByEnrollmentId !== enrollmentId;
  if (!userId || !enrollmentId || (record.consumedAt && !isSupersededStartReplay)) {
    throw twoFactorError(
      410,
      "TWO_FACTOR_ENROLLMENT_ALREADY_USED",
      "Enrollment bootstrap material is no longer available",
    );
  }
  if (Date.parse(record.expiresAt || "") <= Date.now()) {
    throw twoFactorError(
      410,
      "TWO_FACTOR_ENROLLMENT_EXPIRED",
      "Enrollment bootstrap material has expired",
    );
  }
  const manualKey = decryptTotpSecret(record, env);
  const { generateURI } = await import("otplib");
  const otpauthUri = generateURI({
    issuer: "Shcare",
    label: accountLabel,
    secret: manualKey,
  });
  return { record, manualKey, otpauthUri };
}

module.exports = {
  createCompletedEnrollmentSession,
  createEnrollmentStartBinding,
  createEnrollmentRecoveryAcknowledgementBinding,
  createEnrollmentRecoveryDelivery,
  createRecoveryCodeBundle,
  createTwoFactorToken,
  createTotpEnrollment,
  decryptTotpSecret,
  getTwoFactorAvailability,
  getEnrollmentRecoveryDelivery,
  hashPrimaryBinding,
  hashRecoveryCode,
  hashRecoveryAckToken,
  hashTwoFactorToken,
  materializeTotpEnrollment,
  parseEncryptionKey,
  requireEncryptionKey,
  isEnrollmentRecoveryDeliveryReplay,
  twoFactorError,
  verifyRecoveryCode,
  verifyRecoveryAckToken,
  verifyTotpCode,
};
