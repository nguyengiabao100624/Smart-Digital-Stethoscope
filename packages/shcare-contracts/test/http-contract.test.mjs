import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

describe("Shcare HTTP v1 contracts", () => {
  it("publishes an explicit AI availability state instead of sample messages", async () => {
    const schema = await readJson("http/v1/ai-chat-session.schema.json");
    const fixture = await readJson("http/v1/fixtures/ai-chat-unavailable.json");

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["messages", "availability"]);
    assert.equal(fixture.availability.available, false);
    assert.equal(fixture.availability.status, "unavailable");
    assert.ok(fixture.availability.reason);
    assert.deepEqual(fixture.messages, []);
  });

  it("requires server identities for a provider-confirmed AI timeline", async () => {
    const fixture = await readJson("http/v1/fixtures/ai-chat-confirmed.json");

    assert.equal(fixture.availability.available, true);
    assert.equal(fixture.messages.length, 2);
    assert.deepEqual(fixture.messages.map((message) => message.role), ["user", "assistant"]);
    assert.equal(fixture.messages.every((message) => message.id.startsWith("msg_server_")), true);
    assert.equal(fixture.messages.some((message) => message.id.startsWith("local_")), false);
    assert.equal(fixture.message.id, fixture.messages.at(-1).id);
    assert.ok(fixture.message.provider);
    assert.ok(fixture.message.model);
  });

  it("keeps 2FA disabled until an authenticator code is verified", async () => {
    const schema = await readJson("http/v1/two-factor.schema.json");
    const unavailable = await readJson("http/v1/fixtures/two-factor-unavailable.json");
    const enrollment = await readJson("http/v1/fixtures/two-factor-enrollment.json");
    const verified = await readJson("http/v1/fixtures/two-factor-verified.json");

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(unavailable.availability.available, false);
    assert.deepEqual(unavailable.availability.methods, []);
    assert.equal(enrollment.twoFactor.enabled, false);
    assert.equal(enrollment.twoFactor.enrollmentPending, true);
    assert.match(enrollment.enrollment.otpauthUri, /^otpauth:\/\/totp\//);
    assert.equal(Object.hasOwn(enrollment, "recoveryCodes"), false);
    assert.equal(verified.twoFactor.enabled, true);
    assert.equal(verified.twoFactor.enrollmentPending, false);
    assert.equal(verified.recoveryCodes.length, 8);
    assert.ok(verified.twoFactorToken.length >= 32);
  });

  it("requires a bounded second-factor challenge before an authenticated session", async () => {
    const required = await readJson("http/v1/fixtures/two-factor-required.json");
    const verified = await readJson("http/v1/fixtures/two-factor-verified.json");

    assert.equal(required.code, "TWO_FACTOR_REQUIRED");
    assert.equal(required.details.method, "app");
    assert.ok(required.details.challengeId);
    assert.equal(Object.hasOwn(required, "token"), false);
    assert.equal(Object.hasOwn(required, "twoFactorToken"), false);
    assert.ok(Date.parse(required.details.expiresAt) < Date.parse(verified.tokenExpiresAt));
  });
});
