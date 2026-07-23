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
    assert.equal(command.payload.encoding, "pcm_s16le");
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

  it("keeps protocol v2 audio identity explicit", async () => {
    const schema = await readJson("device/v2/audio-frame-header.schema.json");
    const fixture = await readJson("device/v2/fixtures/audio-frame-header.json");

    assert.equal(schema.properties.protocolVersion.const, 2);
    assertRequiredStrings(fixture, [
      "workspaceId",
      "patientId",
      "deviceId",
      "scanId",
      "sessionId",
    ]);
    assert.equal(fixture.sampleRate, 16000);
    assert.equal(fixture.sampleCount, 128);
    assert.equal(fixture.encoding, "pcm_s16le");
  });

  it("publishes a stable binary wire layout and cross-language golden frame", async () => {
    const wire = await readJson("device/v2/audio-frame-wire-format.json");
    const sessionSchema = await readJson("device/v2/audio-session.schema.json");
    const encoded = Buffer.from(
      (await readText("device/v2/fixtures/audio-frame.bin.base64")).trim(),
      "base64",
    );

    assert.equal(wire.magicAscii, "SHC2");
    assert.equal(wire.byteOrder, "big-endian");
    assert.equal(wire.fixedHeaderBytes, 30);
    assert.equal(wire.maximumFrameBytes, 30 + 160 + 120 + 1024 * 2);
    assert.equal(sessionSchema.properties.type.const, "audio.session");

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
});
