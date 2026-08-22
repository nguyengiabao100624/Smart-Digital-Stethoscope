const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  createPasswordIdempotencyFingerprint,
  serializePasswordFingerprintInput,
} = require("../src/passwordChangeSecurity");

const TEST_KEY = "test-only-password-idempotency-key-32-bytes";
const request = {
  operation: "reset_password",
  targetUserId: "user_password_contract",
  payload: {
    currentPassword: " ExactOld123 ",
    newPassword: " ExactNew456 ",
  },
};

test("password idempotency uses a keyed stable fingerprint", () => {
  const env = { PASSWORD_IDEMPOTENCY_HMAC_KEY: TEST_KEY };
  const first = createPasswordIdempotencyFingerprint(request, env);
  const replay = createPasswordIdempotencyFingerprint({
    ...request,
    payload: {
      newPassword: " ExactNew456 ",
      currentPassword: " ExactOld123 ",
    },
  }, env);
  const changed = createPasswordIdempotencyFingerprint({
    ...request,
    payload: {
      ...request.payload,
      newPassword: " DifferentPass789 ",
    },
  }, env);
  const unkeyedDigest = crypto
    .createHash("sha256")
    .update(serializePasswordFingerprintInput(request), "utf8")
    .digest("hex");

  assert.equal(first, replay);
  assert.notEqual(first, changed);
  assert.notEqual(first, unkeyedDigest);
  assert.equal(first.includes(request.payload.currentPassword), false);
  assert.equal(first.includes(request.payload.newPassword), false);
});

test("password idempotency fails closed without strong configured key material", () => {
  assert.throws(
    () => createPasswordIdempotencyFingerprint(request, {}),
    (error) =>
      error.code === "PASSWORD_IDEMPOTENCY_HMAC_KEY_UNAVAILABLE" &&
      error.statusCode === 503,
  );
  assert.throws(
    () => createPasswordIdempotencyFingerprint(request, {
      PASSWORD_IDEMPOTENCY_HMAC_KEY: "too-short",
    }),
    (error) =>
      error.code === "PASSWORD_IDEMPOTENCY_HMAC_KEY_UNAVAILABLE" &&
      error.statusCode === 503,
  );
});

test("PHI secret material is domain-separated when a dedicated key is absent", () => {
  const fromPhi = createPasswordIdempotencyFingerprint(request, {
    PHI_ENCRYPTION_KEY: "test-only-phi-key-material-at-least-32-bytes",
  });
  const dedicated = createPasswordIdempotencyFingerprint(request, {
    PASSWORD_IDEMPOTENCY_HMAC_KEY: "test-only-phi-key-material-at-least-32-bytes",
  });

  assert.equal(fromPhi, dedicated);
});
