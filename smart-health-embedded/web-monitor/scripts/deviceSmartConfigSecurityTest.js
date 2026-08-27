const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  SMART_CONFIG_PROTOCOL_VERSION,
  SMART_CONFIG_RESERVED_DATA_BYTES,
  SMART_CONFIG_RESERVED_DATA_PREFIX,
  SMART_CONFIG_SECURITY,
  SMART_CONFIG_TRANSPORT,
  buildSmartConfigV2Material,
  deriveSmartConfigV2ProvisioningKey,
  deriveSmartConfigV2ReservedData,
} = require("../src/deviceSmartConfigSecurity");

// The non-secret fixture is mirrored in Kotlin and ESP32 firmware.
const secretHash = "sha256:3eb1bd439947eb762998e566ccc2e099c791118b2f40579cc4f7da2b5061b7f9";

test("ESPTouch V2 material has stable cross-platform golden vectors", () => {
  const key = deriveSmartConfigV2ProvisioningKey({ deviceId: "dev_alpha", secretHash });
  const reserved = deriveSmartConfigV2ReservedData({ deviceId: "dev_alpha" });
  assert.equal(key.length, 16);
  assert.equal(reserved.length, SMART_CONFIG_RESERVED_DATA_BYTES);
  assert.equal(key.toString("base64url"), "CwvrODXsPpP9lFz2EhaEKQ");
  assert.equal(reserved.toString("ascii"), "v2:ec1ed31a41a7430defd880bc96532810");
  assert.equal(reserved.toString("ascii").startsWith(SMART_CONFIG_RESERVED_DATA_PREFIX), true);
});

test("ESPTouch V2 response exposes only derived bounded setup material", () => {
  const material = buildSmartConfigV2Material({ deviceId: "dev_alpha", secretHash });
  assert.deepEqual(Object.keys(material).sort(), ["protocolVersion", "smartConfig", "transport"]);
  assert.equal(material.protocolVersion, 2);
  assert.equal(material.transport, SMART_CONFIG_TRANSPORT);
  assert.equal(material.smartConfig.security, SMART_CONFIG_SECURITY);
  assert.equal(JSON.stringify(material).includes(secretHash), false);
  assert.equal(JSON.stringify(material).includes("secretHash"), false);
});

test("ESPTouch V2 derivation fails closed for malformed material", () => {
  for (const input of [
    { deviceId: "", secretHash },
    { deviceId: "dev_alpha", secretHash: "" },
    { deviceId: "dev_alpha", secretHash: "sha256:not-a-hash" },
  ]) {
    assert.throws(() => deriveSmartConfigV2ProvisioningKey(input));
  }
  assert.throws(() => deriveSmartConfigV2ReservedData({ deviceId: " dev_alpha " }));
});
