const crypto = require("node:crypto");

const OTA_HARDWARE_TARGET = "MSM261S4030H0";
const OTA_PARTITION_TARGET = "app";
const OTA_MINIMUM_PROTOCOL_VERSION = 1;

function otaError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeHttpsUrl(value) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input || input.length > 800) {
    throw otaError("OTA_URL_INVALID", "Firmware HTTPS URL is required");
  }
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw otaError("OTA_URL_INVALID", "Firmware URL is invalid");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
    throw otaError("OTA_HTTPS_REQUIRED", "Firmware URL must use HTTPS without embedded credentials");
  }
  return parsed.toString();
}

function normalizeVersion(value) {
  const version = typeof value === "string" ? value.trim() : "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw otaError("OTA_VERSION_INVALID", "Firmware version must use strict major.minor.patch SemVer");
  }
  return version;
}

function normalizeChecksum(value) {
  const checksum = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw otaError("OTA_SHA256_REQUIRED", "Firmware SHA-256 checksum is required");
  }
  return checksum;
}

function assertOtaUpgradeVersion(currentVersion, targetVersion) {
  const target = normalizeVersion(targetVersion);
  const current = typeof currentVersion === "string" ? currentVersion.trim() : "";
  if (!/^\d+\.\d+\.\d+$/.test(current)) return target;
  const currentParts = current.split(".").map(Number);
  const targetParts = target.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (targetParts[index] > currentParts[index]) return target;
    if (targetParts[index] < currentParts[index]) {
      throw otaError("OTA_DOWNGRADE_FORBIDDEN", "Firmware downgrade is forbidden");
    }
  }
  throw otaError("OTA_DOWNGRADE_FORBIDDEN", "Firmware version must be newer than the installed version");
}

function hashOtaDownloadToken(token) {
  const value = typeof token === "string" ? token : "";
  return `sha256:${crypto.createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function verifyOtaDownloadToken(token, verificationMaterial) {
  const expected = /^sha256:([a-f0-9]{64})$/i.exec(String(verificationMaterial || ""));
  if (!expected || typeof token !== "string" || !token) return false;
  const actualBuffer = Buffer.from(hashOtaDownloadToken(token).slice(7), "hex");
  const expectedBuffer = Buffer.from(expected[1], "hex");
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function buildOtaSignatureMessage(manifest) {
  return [
    "SHCARE-OTA-MANIFEST-V1",
    `sha256=${manifest.checksum}`,
    `firmwareVersion=${manifest.firmwareVersion}`,
    `hardwareTarget=${manifest.hardwareTarget}`,
    `partitionTarget=${manifest.partitionTarget}`,
    `minimumProtocolVersion=${manifest.minimumProtocolVersion}`,
    "",
  ].join("\n");
}

function getOtaSignerAvailability(env = process.env) {
  const privateKeyPem = typeof env.OTA_SIGNING_PRIVATE_KEY_PEM === "string"
    ? env.OTA_SIGNING_PRIVATE_KEY_PEM.trim()
    : "";
  if (!privateKeyPem) {
    return { available: false, code: "OTA_SIGNER_UNAVAILABLE", keyType: "" };
  }
  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    return {
      available: true,
      code: "OTA_SIGNER_READY",
      keyType: privateKey.asymmetricKeyType || "unknown",
    };
  } catch {
    return { available: false, code: "OTA_SIGNER_INVALID", keyType: "" };
  }
}

function buildSignedOtaManifest(input, env = process.env) {
  const hardwareTarget = typeof input.hardwareTarget === "string" && input.hardwareTarget.trim()
    ? input.hardwareTarget.trim()
    : OTA_HARDWARE_TARGET;
  const partitionTarget = typeof input.partitionTarget === "string" && input.partitionTarget.trim()
    ? input.partitionTarget.trim()
    : OTA_PARTITION_TARGET;
  const minimumProtocolVersion = Number(
    input.minimumProtocolVersion === undefined
      ? OTA_MINIMUM_PROTOCOL_VERSION
      : input.minimumProtocolVersion,
  );
  if (hardwareTarget !== OTA_HARDWARE_TARGET) {
    throw otaError("OTA_HARDWARE_TARGET_MISMATCH", "Firmware hardware target is incompatible");
  }
  if (partitionTarget !== OTA_PARTITION_TARGET) {
    throw otaError("OTA_PARTITION_TARGET_MISMATCH", "Firmware partition target is incompatible");
  }
  if (minimumProtocolVersion !== OTA_MINIMUM_PROTOCOL_VERSION) {
    throw otaError("OTA_MIN_PROTOCOL_INVALID", "Firmware minimum protocol is incompatible");
  }

  const manifest = {
    url: normalizeHttpsUrl(input.url),
    firmwareVersion: normalizeVersion(input.firmwareVersion),
    checksum: normalizeChecksum(input.checksum),
    hardwareTarget,
    partitionTarget,
    minimumProtocolVersion,
  };
  const signer = getOtaSignerAvailability(env);
  if (!signer.available) {
    throw otaError(
      signer.code,
      signer.code === "OTA_SIGNER_INVALID" ? "OTA signing key is invalid" : "OTA signing key is unavailable",
    );
  }
  const privateKeyPem = env.OTA_SIGNING_PRIVATE_KEY_PEM.trim();
  try {
    manifest.signature = crypto
      .sign("sha256", Buffer.from(buildOtaSignatureMessage(manifest), "utf8"), privateKeyPem)
      .toString("base64url");
  } catch {
    throw otaError("OTA_SIGNER_INVALID", "OTA signing key is invalid");
  }
  return manifest;
}

module.exports = {
  OTA_HARDWARE_TARGET,
  OTA_MINIMUM_PROTOCOL_VERSION,
  OTA_PARTITION_TARGET,
  assertOtaUpgradeVersion,
  buildOtaSignatureMessage,
  buildSignedOtaManifest,
  getOtaSignerAvailability,
  hashOtaDownloadToken,
  verifyOtaDownloadToken,
};
