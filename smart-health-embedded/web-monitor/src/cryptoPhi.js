const crypto = require("node:crypto");

function getKey(env = process.env) {
  const raw = env.PHI_ENCRYPTION_KEY || "";
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptJson(value, env = process.env) {
  const key = getKey(env);
  if (!key) {
    return {
      encrypted: false,
      value,
    };
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    encrypted: true,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

module.exports = {
  encryptJson,
};
