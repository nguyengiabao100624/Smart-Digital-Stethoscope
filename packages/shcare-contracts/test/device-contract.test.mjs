import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

async function readText(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

function assertRequiredStrings(value, fields) {
  for (const field of fields) {
    assert.equal(typeof value[field], "string", `${field} must be a string`);
    assert.ok(value[field].length > 0, `${field} must not be empty`);
  }
}

describe("Shcare device protocol v1", () => {
  it("publishes closed JSON Schemas for auth and command messages", async () => {
    const schemaNames = [
      "auth-challenge.schema.json",
      "auth-response.schema.json",
      "auth-accepted.schema.json",
      "command.schema.json",
      "command-status.schema.json",
      "operational-event.schema.json",
      "event-receipt.schema.json",
    ];

    for (const name of schemaNames) {
      const schema = await readJson(`device/v1/${name}`);
      assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
      assert.equal(schema.type, "object");
      assert.equal(schema.additionalProperties, false);
      assert.ok(schema.required.includes("protocolVersion"));
      assert.equal(schema.properties.protocolVersion.const, 1);
    }
  });

  it("keeps secrets out of URL/hello fixtures and binds challenge proof", async () => {
    const challenge = await readJson("device/v1/fixtures/auth-challenge.json");
    const response = await readJson("device/v1/fixtures/auth-response.json");

    assert.equal(challenge.type, "auth.challenge");
    assert.equal(response.type, "auth.response");
    assert.equal(response.challengeId, challenge.challengeId);
    assertRequiredStrings(response, ["deviceId", "challengeId", "proof"]);
    assert.equal("secret" in response, false);
    assert.equal("secret" in response.telemetry, false);
  });

  it("defines nested command payload and correlated device outcome", async () => {
    const command = await readJson("device/v1/fixtures/wifi-update-command.json");
    const status = await readJson("device/v1/fixtures/wifi-update-applied.json");

    assert.equal(command.protocolVersion, 1);
    assertRequiredStrings(command, [
      "id",
      "type",
      "issuedAt",
      "expiresAt",
      "correlationId",
    ]);
    assert.equal(command.type, "wifi.update");
    assert.equal(typeof command.payload, "object");
    assert.equal(status.commandId, command.id);
    assert.equal(status.correlationId, command.correlationId);
    assert.equal(status.state, "applied");
  });

  it("uses the same command envelope to start a bound audio v2 session", async () => {
    const command = await readJson("device/v1/fixtures/audio-session-start-command.json");
    const commandSchema = await readJson("device/v1/command.schema.json");
    assert.equal(command.type, "audio.session.start");
    assert.equal(command.payload.protocolVersion, 2);
    assertRequiredStrings(command.payload, [
      "workspaceId",
      "patientId",
      "deviceId",
      "scanId",
      "sessionId",
    ]);
    assert.equal(command.payload.sampleRate, 16000);
    assert.equal(command.payload.sampleCount, 128);
    assert.equal(command.payload.frameEncoding, "shcare_audio_v2");
    assert.equal(command.payload.encoding, "pcm_s16le");

    const audioStartBranch = commandSchema.allOf.find(
      (branch) =>
        branch.if?.properties?.type?.const === "audio.session.start",
    );
    assert.equal(
      audioStartBranch.then.properties.payload.additionalProperties,
      false,
    );
    for (const field of [
      "protocolVersion",
      "frameEncoding",
      "workspaceId",
      "patientId",
      "deviceId",
      "scanId",
      "sessionId",
      "sampleRate",
      "sampleCount",
      "encoding",
    ]) {
      assert.ok(audioStartBranch.then.properties.payload.required.includes(field));
    }
    assert.equal(
      audioStartBranch.then.properties.payload.properties.frameEncoding.const,
      "shcare_audio_v2",
    );
  });

  it("publishes a session-bound two-phase credential rotation contract", async () => {
    const acceptedSchema = await readJson("device/v1/auth-accepted.schema.json");
    const accepted = await readJson("device/v1/fixtures/auth-accepted.json");
    const commandSchema = await readJson("device/v1/command.schema.json");
    const command = await readJson(
      "device/v1/fixtures/device-rotate-secret-command.json",
    );

    for (const field of ["credentialSlot", "rotationId", "rotationState"]) {
      assert.ok(acceptedSchema.required.includes(field));
    }
    assert.equal(accepted.credentialSlot, "rotation_candidate");
    assert.equal(accepted.rotationState, "confirmed");
    assertRequiredStrings(accepted, ["rotationId"]);

    assert.ok(commandSchema.properties.type.enum.includes("device.rotate_secret"));
    assert.equal(command.type, "device.rotate_secret");
    assert.equal(command.payload.rotationId, command.correlationId);
    assert.equal(command.payload.expiresAt, command.expiresAt);
    assert.equal(command.payload.wrapAlgorithm, "A256GCM");
    assert.equal(
      command.payload.wrapKeyDerivation,
      "HMAC-SHA256/device-session-v1",
    );
    assert.equal("secret" in command.payload, false);
    assert.equal("secretHash" in command.payload, false);
    assert.equal("nextSecretHash" in command.payload, false);
  });

  it("publishes a closed OTA manifest and correlated boot-health receipt contract", async () => {
    const commandSchema = await readJson("device/v1/command.schema.json");
    const command = await readJson("device/v1/fixtures/ota-update-command.json");
    const eventSchema = await readJson("device/v1/operational-event.schema.json");
    const event = await readJson("device/v1/fixtures/ota-confirmed-event.json");
    const receiptSchema = await readJson("device/v1/event-receipt.schema.json");
    const receipt = await readJson("device/v1/fixtures/ota-confirmed-accepted.json");

    assert.equal(command.type, "ota.update");
    assert.equal(command.payload.hardwareTarget, "MSM261S4030H0");
    assert.equal(command.payload.partitionTarget, "app");
    assert.equal(command.payload.minimumProtocolVersion, 1);
    assert.match(command.payload.url, /^https:\/\//);
    assert.match(command.payload.downloadAuthorization, /^[A-Za-z0-9_-]{32,180}$/);
    assert.match(command.payload.checksum, /^[a-f0-9]{64}$/);
    const otaBranch = commandSchema.allOf.find(
      (branch) => branch.if?.properties?.type?.const === "ota.update",
    );
    assert.equal(otaBranch.then.properties.payload.additionalProperties, false);
    assert.ok(otaBranch.then.properties.payload.required.includes("signature"));

    assert.equal(event.type, "ota.confirmed");
    assert.equal(event.otaStatus, "confirmed");
    assert.equal(event.otaBootOutcome, "confirmed");
    assert.equal(receipt.type, "event.accepted");
    for (const field of ["deviceId", "commandId", "correlationId", "otaId"]) {
      assert.equal(receipt[field], event[field]);
    }
    assert.ok(
      eventSchema.allOf.some(
        (branch) =>
          branch.if?.properties?.type?.const === "ota.confirmed" &&
          branch.then?.properties?.otaStatus?.const === "confirmed",
      ),
    );
    assert.ok(receiptSchema.properties.type.enum.includes("event.rejected"));
  });

  it("keeps protocol v2 audio identity explicit", async () => {
    const schema = await readJson("device/v2/audio-frame-header.schema.json");
    const fixture = await readJson("device/v2/fixtures/audio-frame-header.json");

    assert.equal(schema.properties.protocolVersion.const, 2);
    assert.equal(schema.properties.frameEncoding.const, "shcare_audio_v2");
    assert.equal(
      schema.properties.timestampMs.maximum,
      Number.MAX_SAFE_INTEGER,
    );
    assertRequiredStrings(fixture, ["scanId", "sessionId"]);
    assert.equal(fixture.frameEncoding, "shcare_audio_v2");
    for (const sessionOnlyField of ["workspaceId", "patientId", "deviceId"]) {
      assert.equal(
        schema.required.includes(sessionOnlyField),
        false,
        `${sessionOnlyField} is authenticated session authority, not a wire-header field`,
      );
      assert.equal(sessionOnlyField in fixture, false);
    }
    assert.equal(fixture.sampleRate, 16000);
    assert.equal(fixture.sampleCount, 128);
    assert.equal(fixture.encoding, "pcm_s16le");
  });

  it("publishes a stable binary wire layout and cross-language golden frame", async () => {
    const wire = await readJson("device/v2/audio-frame-wire-format.json");
    const sessionSchema = await readJson("device/v2/audio-session.schema.json");
    const session = await readJson("device/v2/fixtures/audio-session.json");
    const header = await readJson("device/v2/fixtures/audio-frame-header.json");
    const encoded = Buffer.from(
      (await readText("device/v2/fixtures/audio-frame.bin.base64")).trim(),
      "base64",
    );

    assert.equal(wire.magicAscii, "SHC2");
    assert.equal(wire.frameEncoding, "shcare_audio_v2");
    assert.equal(wire.byteOrder, "big-endian");
    assert.equal(wire.fixedHeaderBytes, 30);
    assert.equal(wire.maximumFrameBytes, 30 + 160 + 120 + 1024 * 2);
    assert.equal(sessionSchema.properties.type.const, "audio.session");
    assert.equal(
      sessionSchema.properties.frameEncoding.const,
      "shcare_audio_v2",
    );
    for (const field of [
      "workspaceId",
      "patientId",
      "deviceId",
      "scanId",
      "sessionId",
    ]) {
      assert.ok(sessionSchema.required.includes(field));
      assert.equal(wire.identityBinding.sessionMetadataFields.includes(field), true);
    }
    assert.deepEqual(wire.identityBinding.wireFields, ["sessionId", "scanId"]);
    assert.equal(wire.identityBinding.authenticatedSocketField, "deviceId");
    assert.equal(wire.identityBinding.allBindingsRequired, true);
    assert.equal(header.sessionId, session.sessionId);
    assert.equal(header.scanId, session.scanId);
    assert.equal(header.headerLength, 30 + 25 + 16);
    assert.equal(header.payloadLength, header.sampleCount * 2);

    assert.equal(encoded.subarray(0, 4).toString("ascii"), "SHC2");
    assert.equal(encoded[4], 2);
    assert.equal(encoded[5], 1);
    assert.equal(encoded.readUInt16BE(6), 71);
    assert.equal(encoded.readUInt32BE(8), 256);
    assert.equal(encoded.readUInt32BE(12), 0);
    assert.equal(Number(encoded.readBigUInt64BE(16)), 1783987200123);
    assert.equal(encoded.readUInt16BE(24), 128);
    assert.equal(encoded.readUInt16BE(26), 25);
    assert.equal(encoded.readUInt16BE(28), 16);
    assert.equal(encoded.subarray(30, 55).toString("utf8"), "audio-session-fixture-001");
    assert.equal(encoded.subarray(55, 71).toString("utf8"), "scan-fixture-001");
    assert.equal(encoded.length, 71 + 256);
  });

  it("keeps raw PCM v1 as an explicit receiver-only migration profile", async () => {
    const legacy = await readJson("device/v1/audio-frame-wire-format.json");

    assert.equal(legacy.protocolVersion, 1);
    assert.equal(legacy.frameEncoding, "raw_pcm_s16le");
    assert.equal(legacy.payloadEncoding, "pcm_s16le");
    assert.equal(legacy.headerBytes, 0);
    assert.equal(legacy.byteOrder, "little-endian");
    assert.equal(legacy.compatibilityOnly, true);
    assert.equal(legacy.receiverFeatureFlagRequired, true);
    assert.equal(legacy.newFirmwareEmissionAllowed, false);
    assert.equal(
      legacy.identitySource,
      "authenticated_socket_and_server_session",
    );
  });
});
