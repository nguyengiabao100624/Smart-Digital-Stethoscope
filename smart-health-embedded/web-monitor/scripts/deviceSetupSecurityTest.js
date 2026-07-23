const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  deriveDeviceSetupPassword,
  buildSecureSetupQrPayload,
} = require("../src/deviceSetupSecurity");

const secretHash = `sha256:${"ab".repeat(32)}`;

test("per-device setup password is deterministic, WPA2-safe and domain separated", () => {
  const first = deriveDeviceSetupPassword({ deviceId: "dev_alpha", secretHash });
  const replay = deriveDeviceSetupPassword({ deviceId: "dev_alpha", secretHash });
  const otherDevice = deriveDeviceSetupPassword({ deviceId: "dev_beta", secretHash });
  const otherSecret = deriveDeviceSetupPassword({
    deviceId: "dev_alpha",
    secretHash: `sha256:${"cd".repeat(32)}`,
  });

  assert.equal(first, replay);
  assert.notEqual(first, otherDevice);
  assert.notEqual(first, otherSecret);
  assert.match(first, /^[A-Za-z0-9_-]{20}$/);
  assert.equal(first, "4hxulJ_mCLIz2XhP-KXh");
  assert.equal(
    buildSecureSetupQrPayload(
      {
        deviceId: "dev_alpha",
        secretHash,
        claimCode: "CLAIM123456",
        claimExpiresAt: "2026-07-19T00:00:00.000Z",
      },
      { now: Date.parse("2026-07-18T00:00:00.000Z") },
    ).setupAp.ssid,
    "Shcare-9487FC14F3E6",
  );
});

test("secure setup QR contains only the derived PoP and one-time claim material", () => {
  const payload = buildSecureSetupQrPayload(
    {
      deviceId: "dev_alpha",
      secretHash,
      claimCode: "CLAIM123456",
      claimExpiresAt: "2026-07-19T00:00:00.000Z",
    },
    { now: Date.parse("2026-07-18T00:00:00.000Z") },
  );

  assert.deepEqual(Object.keys(payload).sort(), [
    "claimCode",
    "claimExpiresAt",
    "deviceId",
    "protocolVersion",
    "setupAp",
    "type",
  ]);
  assert.equal(payload.type, "shcare.device.setup");
  assert.equal(payload.protocolVersion, 1);
  assert.equal(payload.setupAp.security, "WPA2_PSK");
  assert.match(payload.setupAp.ssid, /^Shcare-[A-F0-9]{12}$/);
  assert.match(payload.setupAp.proofOfPossession, /^[A-Za-z0-9_-]{20}$/);
  assert.equal(JSON.stringify(payload).includes(secretHash), false);
  assert.equal(JSON.stringify(payload).includes("secretHash"), false);
});

test("setup derivation fails closed for malformed identity or verification material", () => {
  for (const [input, expectedCode] of [
    [{ deviceId: "", secretHash }, "DEVICE_ID_INVALID"],
    [{ deviceId: "dev_alpha", secretHash: "" }, "DEVICE_SETUP_MATERIAL_INVALID"],
    [{ deviceId: "dev_alpha", secretHash: "sha256:not-a-hash" }, "DEVICE_SETUP_MATERIAL_INVALID"],
  ]) {
    assert.throws(
      () => deriveDeviceSetupPassword(input),
      (error) => error.code === expectedCode,
    );
  }

  for (const [invalidPayload, expectedCode] of [
    [{
      deviceId: " dev_alpha ",
      secretHash,
      claimCode: "CLAIM123456",
      claimExpiresAt: "2026-07-19T00:00:00.000Z",
    }, "DEVICE_ID_INVALID"],
    [{
      deviceId: `${"a".repeat(64)}`,
      secretHash,
      claimCode: "CLAIM123456",
      claimExpiresAt: "2026-07-19T00:00:00.000Z",
    }, "DEVICE_ID_INVALID"],
    [{
      deviceId: "dev_alpha",
      secretHash,
      claimCode: `${"A".repeat(81)}`,
      claimExpiresAt: "2026-07-19T00:00:00.000Z",
    }, "DEVICE_CLAIM_CODE_INVALID"],
    [{
      deviceId: "dev_alpha",
      secretHash,
      claimCode: "CLAIM123456",
      claimExpiresAt: "2020-01-01T00:00:00.000Z",
    }, "DEVICE_CLAIM_EXPIRED"],
  ]) {
    assert.throws(
      () =>
        buildSecureSetupQrPayload(invalidPayload, {
          now: Date.parse("2026-07-18T00:00:00.000Z"),
        }),
      (error) => error.code === expectedCode,
    );
  }
});
