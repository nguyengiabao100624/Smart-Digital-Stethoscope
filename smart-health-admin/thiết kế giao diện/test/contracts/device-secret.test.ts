import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeviceSecretPayload,
  getDeviceSecretValidationError,
} from "../../src/lib/device-secret.ts";

test("accepts only the backend credential byte window", () => {
  assert.match(getDeviceSecretValidationError("a".repeat(31)) || "", /32/);
  assert.equal(getDeviceSecretValidationError("a".repeat(32)), null);
  assert.equal(getDeviceSecretValidationError("a".repeat(95)), null);
  assert.match(getDeviceSecretValidationError("a".repeat(96)) || "", /95/);
});

test("counts UTF-8 bytes and rejects line breaks", () => {
  assert.equal(getDeviceSecretValidationError("ă".repeat(16)), null);
  assert.match(getDeviceSecretValidationError(`${"a".repeat(32)}\n`) || "", /xuống dòng/);
});

test("builds the exact fail-closed backend payload without rewriting the credential", () => {
  const deviceSecret = "device-secret-for-hardware-000001";
  assert.deepEqual(createDeviceSecretPayload(deviceSecret), { deviceSecret });
  assert.throws(() => createDeviceSecretPayload("short"), /32/);
});
