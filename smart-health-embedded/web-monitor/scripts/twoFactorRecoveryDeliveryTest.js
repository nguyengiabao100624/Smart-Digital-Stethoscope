"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  createCompletedEnrollmentSession,
  createEnrollmentRecoveryAcknowledgementBinding,
  createEnrollmentRecoveryDelivery,
  getEnrollmentRecoveryDelivery,
  isEnrollmentRecoveryDeliveryReplay,
  verifyRecoveryAckToken,
} = require("../src/twoFactorAuth");

const env = {
  TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(32, 19).toString("hex"),
};

function createInput(overrides = {}) {
  return {
    userId: "usr_alpha",
    credentialId: "2fa_credential_usr_alpha",
    enrollmentId: "2fa_enroll_alpha",
    idempotencyKey: "portal-2fa-enable-11111111-2222-4333-8444-555555555555",
    primaryBinding: "demo-session:usr_alpha:session_alpha",
    verificationCode: "123456",
    enabledAtMs: Date.parse("2026-08-09T04:00:00.000Z"),
    ...overrides,
  };
}

test("response-loss replay deterministically recreates recovery codes and a pending acknowledgement token", () => {
  const first = createEnrollmentRecoveryDelivery(createInput(), env);
  const replay = createEnrollmentRecoveryDelivery(createInput(), env);

  assert.deepEqual(replay, first);
  assert.equal(first.codes.length, 8);
  assert.equal(new Set(first.codes).size, 8);
  assert.match(first.delivery.id, /^2fa_delivery_[A-Za-z0-9_-]{22}$/);
  assert.equal(first.delivery.expiresAt, "2026-08-09T04:10:00.000Z");
  assert.match(first.recoveryAckToken, /^[A-Za-z0-9_-]+$/);
  assert.equal(verifyRecoveryAckToken(first, first.recoveryAckToken, env), true);
  assert.deepEqual(createEnrollmentRecoveryAcknowledgementBinding(createInput(), env), {
    primaryBindingHash: first.delivery.primaryBindingHash,
    acknowledgementKeyHash: first.delivery.acknowledgementKeyHash,
  });
});

test("persistable delivery material contains hashes and metadata but no plaintext recovery code, token, or key", () => {
  const result = createEnrollmentRecoveryDelivery(createInput(), env);
  const persisted = JSON.stringify({
    recoverySalt: result.recoverySalt,
    recoveryCodes: result.recoveryCodes,
    recoveryAckTokenHash: result.recoveryAckTokenHash,
  });

  assert.equal(result.codes.some((code) => persisted.includes(code)), false);
  assert.equal(persisted.includes(result.recoveryAckToken), false);
  assert.equal(persisted.includes(createInput().idempotencyKey), false);
  assert.equal(result.recoveryCodes.every((item) => item.hash && !Object.hasOwn(item, "code")), true);
});

test("operation is fail-closed across another idempotency key or primary session", () => {
  const first = createEnrollmentRecoveryDelivery(createInput(), env);
  const credential = {
    id: createInput().credentialId,
    credentialId: createInput().credentialId,
    userId: createInput().userId,
    enrollmentId: createInput().enrollmentId,
    recoverySalt: first.recoverySalt,
    recoveryCodes: first.recoveryCodes,
    recoveryAckTokenHash: first.recoveryAckTokenHash,
  };

  assert.equal(isEnrollmentRecoveryDeliveryReplay(credential, first), true);
  assert.equal(
    isEnrollmentRecoveryDeliveryReplay(
      credential,
      createEnrollmentRecoveryDelivery(createInput({ idempotencyKey: "portal-2fa-enable-other-safe-key" }), env),
    ),
    false,
  );
  assert.equal(
    isEnrollmentRecoveryDeliveryReplay(
      credential,
      createEnrollmentRecoveryDelivery(createInput({ primaryBinding: "demo-session:usr_alpha:other" }), env),
    ),
    false,
  );
  assert.equal(
    isEnrollmentRecoveryDeliveryReplay(
      credential,
      createEnrollmentRecoveryDelivery(createInput({ verificationCode: "654321" }), env),
    ),
    false,
  );
});

test("delivery metadata round-trips acknowledgement state without exposing recovery material", () => {
  const result = createEnrollmentRecoveryDelivery(createInput(), env);
  result.recoveryCodes[0].delivery.acknowledgedAt = "2026-08-09T04:02:00.000Z";
  assert.deepEqual(getEnrollmentRecoveryDelivery({ recoveryCodes: result.recoveryCodes }), {
    version: 1,
    id: result.delivery.id,
    operationHash: result.delivery.operationHash,
    primaryBindingHash: result.delivery.primaryBindingHash,
    acknowledgementKeyHash: result.delivery.acknowledgementKeyHash,
    recoveryAckTokenHash: result.delivery.recoveryAckTokenHash,
    expiresAt: result.delivery.expiresAt,
    acknowledgedAt: "2026-08-09T04:02:00.000Z",
  });
});

test("completed second-factor token is derived only from the exact pending token and remains replayable", () => {
  const pending = createEnrollmentRecoveryDelivery(createInput(), env);
  const input = {
    userId: pending.userId,
    credentialId: pending.credentialId,
    enrollmentId: pending.enrollmentId,
    recoveryAckToken: pending.recoveryAckToken,
    primaryBindingHash: pending.delivery.primaryBindingHash,
    verifiedAt: pending.verifiedAt,
    deliveryExpiresAt: pending.delivery.expiresAt,
  };
  const completed = createCompletedEnrollmentSession(input, env);
  assert.deepEqual(createCompletedEnrollmentSession(input, env), completed);
  assert.match(completed.token, /^[A-Za-z0-9_-]+$/);
  assert.equal(JSON.stringify(completed.record).includes(completed.token), false);
  assert.ok(Date.parse(completed.record.expiresAt) > Date.parse(pending.delivery.expiresAt));
});

test("delivery input cannot omit owner, enrollment, verification, primary binding, or idempotency key", () => {
  for (const field of [
    "userId",
    "credentialId",
    "enrollmentId",
    "idempotencyKey",
    "primaryBinding",
    "verificationCode",
  ]) {
    assert.throws(
      () => createEnrollmentRecoveryDelivery(createInput({ [field]: "" }), env),
      (error) => error && error.code === "TWO_FACTOR_DELIVERY_INPUT_INVALID",
    );
  }
});
