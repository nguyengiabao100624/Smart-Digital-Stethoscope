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

module.exports = {
  createRecoveryCodeBundle,
  createTwoFactorToken,
  createTotpEnrollment,
  decryptTotpSecret,
  getTwoFactorAvailability,
  hashPrimaryBinding,
  hashRecoveryCode,
  hashTwoFactorToken,
  parseEncryptionKey,
  requireEncryptionKey,
  twoFactorError,
  verifyRecoveryCode,
  verifyTotpCode,
};
