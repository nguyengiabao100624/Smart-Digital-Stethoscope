const crypto = require("node:crypto");

const PHI_FORMAT_VERSION = 1;
const PHI_ALGORITHM = "aes-256-gcm";
const DEFAULT_KEY_VERSION = "v1";

function readKeyMaterial(env = process.env) {
  return String(env.PHI_ENCRYPTION_KEY || "");
}

function getKey(env = process.env) {
  const raw = readKeyMaterial(env);
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

function isPhiEncryptionConfigured(env = process.env) {
  return readKeyMaterial(env).length >= 32;
}

function aadFor(context) {
  const canonical = String(context || "runtime-state").trim() || "runtime-state";
  return Buffer.from(`shcare-phi|${PHI_FORMAT_VERSION}|${canonical}`, "utf8");
}

function encryptJson(value, env = process.env, context = "runtime-state") {
  const key = getKey(env);
  if (!key) return { encrypted: false, value };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(PHI_ALGORITHM, key, iv);
  cipher.setAAD(aadFor(context));
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    encrypted: true,
    formatVersion: PHI_FORMAT_VERSION,
    keyVersion: String(env.PHI_ENCRYPTION_KEY_VERSION || DEFAULT_KEY_VERSION),
    algorithm: PHI_ALGORITHM,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function phiCryptoError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function decryptJson(envelope, env = process.env, context = "runtime-state") {
  if (!envelope || typeof envelope !== "object" || envelope.encrypted !== true) {
    if (envelope && typeof envelope === "object" && envelope.encrypted === false) {
      return envelope.value;
    }
    return envelope;
  }
  const key = getKey(env);
  if (!key) throw phiCryptoError("PHI_KEY_REQUIRED", "PHI encryption key is required");
  if (
    Number(envelope.formatVersion) !== PHI_FORMAT_VERSION ||
    envelope.algorithm !== PHI_ALGORITHM ||
    !envelope.iv ||
    !envelope.tag ||
    !envelope.ciphertext
  ) {
    throw phiCryptoError("PHI_ENVELOPE_INVALID", "PHI encrypted envelope is invalid");
  }
  try {
    const decipher = crypto.createDecipheriv(
      PHI_ALGORITHM,
      key,
      Buffer.from(envelope.iv, "base64"),
    );
    decipher.setAAD(aadFor(context));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch (cause) {
    throw phiCryptoError(
      "PHI_DECRYPTION_FAILED",
      "PHI ciphertext authentication failed",
      cause,
    );
  }
}

module.exports = {
  PHI_ALGORITHM,
  PHI_FORMAT_VERSION,
  decryptJson,
  encryptJson,
  isPhiEncryptionConfigured,
};
