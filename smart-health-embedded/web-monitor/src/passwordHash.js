const crypto = require("node:crypto");

const PASSWORD_HASH_PREFIX = "scrypt$v1";
const PASSWORD_HASH_KEY_LENGTH = 64;
const PASSWORD_HASH_SALT_BYTES = 16;
const PASSWORD_HASH_N = 16_384;
const PASSWORD_HASH_R = 8;
const PASSWORD_HASH_P = 1;
const PASSWORD_HASH_MAX_MEMORY = 64 * 1024 * 1024;

function assertPasswordSecret(secret) {
  if (typeof secret !== "string" || secret.length === 0 || secret.length > 200) {
    const error = new Error(
      "Password hashing requires an exact secret between 1 and 200 characters",
    );
    error.code = "PASSWORD_HASH_INPUT_INVALID";
    throw error;
  }
  return secret;
}

function parsePasswordHash(value) {
  if (typeof value !== "string") return null;
  const parts = value.split("$");
  if (parts.length !== 8 || `${parts[0]}$${parts[1]}` !== PASSWORD_HASH_PREFIX) {
    return null;
  }
  const n = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  if (
    n !== PASSWORD_HASH_N ||
    r !== PASSWORD_HASH_R ||
    p !== PASSWORD_HASH_P
  ) {
    return null;
  }
  try {
    const salt = Buffer.from(parts[5], "base64url");
    const digest = Buffer.from(parts[6], "base64url");
    const checksum = Buffer.from(parts[7], "base64url");
    if (
      salt.length !== PASSWORD_HASH_SALT_BYTES ||
      digest.length !== PASSWORD_HASH_KEY_LENGTH ||
      checksum.length !== 32
    ) {
      return null;
    }
    const expectedChecksum = crypto
      .createHash("sha256")
      .update(`${PASSWORD_HASH_PREFIX}$${n}$${r}$${p}$${parts[5]}$${parts[6]}`)
      .digest();
    if (!crypto.timingSafeEqual(checksum, expectedChecksum)) return null;
    return { n, r, p, salt, digest };
  } catch {
    return null;
  }
}

function isPasswordHash(value) {
  return Boolean(parsePasswordHash(value));
}

function hashPasswordSecret(secret) {
  const exactSecret = assertPasswordSecret(secret);
  const salt = crypto.randomBytes(PASSWORD_HASH_SALT_BYTES);
  const digest = crypto.scryptSync(exactSecret, salt, PASSWORD_HASH_KEY_LENGTH, {
    N: PASSWORD_HASH_N,
    r: PASSWORD_HASH_R,
    p: PASSWORD_HASH_P,
    maxmem: PASSWORD_HASH_MAX_MEMORY,
  });
  const prefix = [
    PASSWORD_HASH_PREFIX,
    PASSWORD_HASH_N,
    PASSWORD_HASH_R,
    PASSWORD_HASH_P,
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
  const checksum = crypto.createHash("sha256").update(prefix).digest("base64url");
  salt.fill(0);
  digest.fill(0);
  return `${prefix}$${checksum}`;
}

function verifyLegacyPasswordSecret(secret, storedSecret) {
  const suppliedDigest = crypto
    .createHash("sha256")
    .update(secret, "utf8")
    .digest();
  const storedDigest = crypto
    .createHash("sha256")
    .update(storedSecret, "utf8")
    .digest();
  const matches = crypto.timingSafeEqual(suppliedDigest, storedDigest);
  suppliedDigest.fill(0);
  storedDigest.fill(0);
  return matches;
}

function verifyPasswordSecret(secret, storedValue) {
  if (
    typeof secret !== "string" ||
    secret.length === 0 ||
    secret.length > 200 ||
    typeof storedValue !== "string" ||
    storedValue.length === 0
  ) {
    return false;
  }
  const parsed = parsePasswordHash(storedValue);
  if (!parsed) {
    return verifyLegacyPasswordSecret(secret, storedValue);
  }
  try {
    const digest = crypto.scryptSync(
      secret,
      parsed.salt,
      PASSWORD_HASH_KEY_LENGTH,
      {
        N: parsed.n,
        r: parsed.r,
        p: parsed.p,
        maxmem: PASSWORD_HASH_MAX_MEMORY,
      },
    );
    const matches = crypto.timingSafeEqual(digest, parsed.digest);
    digest.fill(0);
    return matches;
  } catch {
    return false;
  } finally {
    parsed.salt.fill(0);
    parsed.digest.fill(0);
  }
}

function normalizePasswordHash(value) {
  if (value === undefined || value === null || value === "") return "";
  if (isPasswordHash(value)) return value;
  return hashPasswordSecret(value);
}

module.exports = {
  PASSWORD_HASH_PREFIX,
  hashPasswordSecret,
  isPasswordHash,
  normalizePasswordHash,
  verifyPasswordSecret,
};
