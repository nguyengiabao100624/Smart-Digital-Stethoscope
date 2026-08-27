const crypto = require("node:crypto");

const {
  DeviceSetupSecurityError,
  assertCanonicalDeviceId,
} = require("./deviceSetupSecurity");

const SMART_CONFIG_TRANSPORT = "esptouch_v2";
const SMART_CONFIG_PROTOCOL_VERSION = 2;
const SMART_CONFIG_SECURITY = "aes128";
const SMART_CONFIG_AES_KEY_BYTES = 16;
const SMART_CONFIG_BINDING_DIGEST_BYTES = 16;
const SMART_CONFIG_RESERVED_DATA_PREFIX = "v2:";
const SMART_CONFIG_RESERVED_DATA_BYTES =
  SMART_CONFIG_RESERVED_DATA_PREFIX.length + (SMART_CONFIG_BINDING_DIGEST_BYTES * 2);
const SMART_CONFIG_KEY_DOMAIN = "shcare/esptouch-v2/aes128\n";
const SMART_CONFIG_BINDING_DOMAIN = "shcare/esptouch-v2/device\n";

function parseSmartConfigMaterial(input = {}) {
  const deviceId = assertCanonicalDeviceId(input.deviceId);
  const secretHash = String(input.secretHash || "");
  const match = /^sha256:([a-f0-9]{64})$/.exec(secretHash);
  if (!match) {
    throw new DeviceSetupSecurityError(
      "DEVICE_SETUP_MATERIAL_INVALID",
      "Device SmartConfig material is unavailable",
    );
  }
  return { deviceId, verificationKey: Buffer.from(match[1], "hex") };
}

/**
 * Derives the exact 128-bit ESPTouch V2 AES key accepted by the firmware.
 * The raw device secret is never returned or included in a setup response.
 */
function deriveSmartConfigV2ProvisioningKey(input = {}) {
  const { deviceId, verificationKey } = parseSmartConfigMaterial(input);
  try {
    return crypto
      .createHmac("sha256", verificationKey)
      .update(`${SMART_CONFIG_KEY_DOMAIN}${deviceId}`, "utf8")
      .digest()
      .subarray(0, SMART_CONFIG_AES_KEY_BYTES);
  } finally {
    verificationKey.fill(0);
  }
}

/**
 * Versioned ASCII identity binding carried in ESPTouch reserved data.  The
 * official Android 2.2.1 V2 broadcaster corrupts arbitrary high-bit custom
 * bytes on this ESP-IDF receiver; printable ASCII is protocol-safe while the
 * whole payload remains AES-128 encrypted.  It lets firmware reject broadcasts
 * meant for another device before persisting Wi-Fi.
 */
function deriveSmartConfigV2ReservedData(input = {}) {
  const deviceId = assertCanonicalDeviceId(input.deviceId);
  const digest = crypto
    .createHash("sha256")
    .update(`${SMART_CONFIG_BINDING_DOMAIN}${deviceId}`, "utf8")
    .digest();
  try {
    return Buffer.from(
      `${SMART_CONFIG_RESERVED_DATA_PREFIX}${digest
        .subarray(0, SMART_CONFIG_BINDING_DIGEST_BYTES)
        .toString("hex")}`,
      "ascii",
    );
  } finally {
    digest.fill(0);
  }
}

function buildSmartConfigV2Material(input = {}) {
  const provisioningKey = deriveSmartConfigV2ProvisioningKey(input);
  const reservedData = deriveSmartConfigV2ReservedData(input);
  try {
    return {
      protocolVersion: SMART_CONFIG_PROTOCOL_VERSION,
      transport: SMART_CONFIG_TRANSPORT,
      smartConfig: {
        security: SMART_CONFIG_SECURITY,
        provisioningKey: provisioningKey.toString("base64url"),
        reservedData: reservedData.toString("base64url"),
      },
    };
  } finally {
    provisioningKey.fill(0);
    reservedData.fill(0);
  }
}

module.exports = {
  SMART_CONFIG_AES_KEY_BYTES,
  SMART_CONFIG_BINDING_DOMAIN,
  SMART_CONFIG_BINDING_DIGEST_BYTES,
  SMART_CONFIG_KEY_DOMAIN,
  SMART_CONFIG_PROTOCOL_VERSION,
  SMART_CONFIG_RESERVED_DATA_BYTES,
  SMART_CONFIG_RESERVED_DATA_PREFIX,
  SMART_CONFIG_SECURITY,
  SMART_CONFIG_TRANSPORT,
  buildSmartConfigV2Material,
  deriveSmartConfigV2ProvisioningKey,
  deriveSmartConfigV2ReservedData,
};
