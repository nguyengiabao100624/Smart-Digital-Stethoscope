const crypto = require("node:crypto");

const DEVICE_SETUP_POP_DOMAIN = "shcare-device-setup-pop-v1";
const DEVICE_SETUP_SSID_DOMAIN = "shcare-device-setup-ssid-v1";

class DeviceSetupSecurityError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "DeviceSetupSecurityError";
    this.code = code;
    this.status = status;
  }
}

function normalizeDeviceId(value) {
  const deviceId = typeof value === "string" ? value : "";
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(deviceId) ||
    Buffer.byteLength(deviceId, "utf8") > 63
  ) {
    throw new DeviceSetupSecurityError(
      "DEVICE_ID_INVALID",
      "Device identity must use 3-63 exact ASCII letters, numbers, underscores or hyphens",
      400,
    );
  }
  return deviceId;
}

function parseSetupMaterial(input = {}) {
  const deviceId = normalizeDeviceId(input.deviceId);
  const match = /^sha256:([a-f0-9]{64})$/i.exec(String(input.secretHash || ""));
  if (!match) {
    throw new DeviceSetupSecurityError(
      "DEVICE_SETUP_MATERIAL_INVALID",
      "Canonical device identity and verification material are required for secure setup",
      503,
    );
  }
  return { deviceId, verificationKey: Buffer.from(match[1], "hex") };
}

function deriveDeviceSetupPassword(input = {}) {
  const { deviceId, verificationKey } = parseSetupMaterial(input);
  try {
    return crypto
      .createHmac("sha256", verificationKey)
      .update(`${DEVICE_SETUP_POP_DOMAIN}\n${deviceId}`, "utf8")
      .digest("base64url")
      .slice(0, 20);
  } finally {
    verificationKey.fill(0);
  }
}

function deriveDeviceSetupSsid(input = {}) {
  const { deviceId, verificationKey } = parseSetupMaterial(input);
  verificationKey.fill(0);
  const suffix = crypto
    .createHash("sha256")
    .update(`${DEVICE_SETUP_SSID_DOMAIN}\n${deviceId}`, "utf8")
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `Shcare-${suffix}`;
}

function buildSecureSetupQrPayload(input = {}, options = {}) {
  const claimCode = typeof input.claimCode === "string" ? input.claimCode : "";
  const claimExpiresAt = typeof input.claimExpiresAt === "string" ? input.claimExpiresAt : "";
  const expiresAtMs = Date.parse(claimExpiresAt);
  const now = options.now === undefined ? Date.now() : Number(options.now);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(claimCode)) {
    throw new DeviceSetupSecurityError(
      "DEVICE_CLAIM_CODE_INVALID",
      "A one-time claim code and expiry are required for secure setup",
      400,
    );
  }
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(now)) {
    throw new DeviceSetupSecurityError(
      "DEVICE_CLAIM_EXPIRY_INVALID",
      "A valid claim expiry is required for secure setup",
      400,
    );
  }
  if (expiresAtMs <= now) {
    throw new DeviceSetupSecurityError(
      "DEVICE_CLAIM_EXPIRED",
      "The device claim has expired",
      410,
    );
  }
  const deviceId = normalizeDeviceId(input.deviceId);
  return {
    type: "shcare.device.setup",
    protocolVersion: 1,
    deviceId,
    claimCode,
    claimExpiresAt: new Date(expiresAtMs).toISOString(),
    setupAp: {
      ssid: deriveDeviceSetupSsid(input),
      security: "WPA2_PSK",
      proofOfPossession: deriveDeviceSetupPassword(input),
    },
  };
}

module.exports = {
  DEVICE_SETUP_POP_DOMAIN,
  DEVICE_SETUP_SSID_DOMAIN,
  DeviceSetupSecurityError,
  assertCanonicalDeviceId: normalizeDeviceId,
  buildSecureSetupQrPayload,
  deriveDeviceSetupPassword,
  deriveDeviceSetupSsid,
};
