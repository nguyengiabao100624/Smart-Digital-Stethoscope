import assert from "node:assert/strict";
import test from "node:test";

import {
  createProvisionArtifactFilename,
  getProvisionArtifactStatus,
  parseProvisionArtifact,
  serializeProvisionQrPayload,
} from "../../src/lib/device-provisioning.ts";

const response = {
  device: {
    id: "Shcare_Device-01",
    name: "Thiết bị phòng khám 1",
  },
  claim: {
    deviceId: "Shcare_Device-01",
    claimCode: "Claim_Code-01",
    expiresAt: "2026-07-19T02:00:00.000Z",
    qrPayload: {
      type: "shcare.device.setup",
      protocolVersion: 1,
      deviceId: "Shcare_Device-01",
      claimCode: "Claim_Code-01",
      claimExpiresAt: "2026-07-19T02:00:00.000Z",
      setupAp: {
        ssid: "Shcare-9487FC14F3E6",
        security: "WPA2_PSK",
        proofOfPossession: "4hxulJ_mCLIz2XhP-KXh",
      },
    },
  },
};

test("creates one canonical, case-preserving provisioning artifact", () => {
  const artifact = parseProvisionArtifact(response);

  assert.equal(artifact.deviceId, "Shcare_Device-01");
  assert.equal(artifact.claimCode, "Claim_Code-01");
  assert.equal(artifact.expiresAt, "2026-07-19T02:00:00.000Z");
  assert.equal(artifact.qrPayload.setupAp.ssid, "Shcare-9487FC14F3E6");
  assert.equal(artifact.qrPayload.setupAp.security, "WPA2_PSK");
  assert.equal(serializeProvisionQrPayload(artifact), JSON.stringify(response.claim.qrPayload));
  assert.equal(createProvisionArtifactFilename(artifact), "shcare-Shcare_Device-01-setup.svg");
});

test("rejects a drifted or incomplete setup QR instead of rendering a misleading artifact", () => {
  assert.throws(
    () =>
      parseProvisionArtifact({
        ...response,
        claim: {
          ...response.claim,
          qrPayload: {
            ...response.claim.qrPayload,
            deviceId: "shcare_device-01",
          },
        },
      }),
    /không khớp/i,
  );

  assert.throws(
    () =>
      parseProvisionArtifact({
        ...response,
        claim: {
          ...response.claim,
          qrPayload: {
            ...response.claim.qrPayload,
            setupAp: { ssid: "SmartHealth-01", security: "OPEN", proofOfPossession: "" },
          },
        },
      }),
    /WPA2/i,
  );
});

test("distinguishes active, nearly expired, and expired artifacts", () => {
  const artifact = parseProvisionArtifact(response);

  assert.equal(
    getProvisionArtifactStatus(artifact, Date.parse("2026-07-18T12:00:00.000Z")),
    "active",
  );
  assert.equal(
    getProvisionArtifactStatus(artifact, Date.parse("2026-07-19T01:55:00.000Z")),
    "expiring",
  );
  assert.equal(
    getProvisionArtifactStatus(artifact, Date.parse("2026-07-19T02:00:00.000Z")),
    "expired",
  );
});
