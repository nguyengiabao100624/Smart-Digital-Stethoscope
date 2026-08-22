import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AuthSessionRevokeContractError,
  AuthSessionRevokeIntentRegistry,
  createAuthSessionRevokeIdempotencyKey,
  executeAuthSessionRevoke,
  parseAuthSessionRevokeReceipt,
  type AuthSessionRevokeIntent,
} from "../../src/lib/auth-session-revoke.ts";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testRoot, "..", "..");
const monorepoRoot = path.resolve(projectRoot, "..", "..");
const canonicalReceipt = JSON.parse(
  fs.readFileSync(
    path.join(
      monorepoRoot,
      "packages",
      "shcare-contracts",
      "http",
      "v1",
      "fixtures",
      "auth-session-revoke-response.json",
    ),
    "utf8",
  ),
) as Record<string, unknown>;

const fixtureSessionId = String((canonicalReceipt.session as Record<string, unknown>).id);
const canonicalIntent: AuthSessionRevokeIntent = {
  userId: "platform-admin-owner-1",
  sessionId: fixtureSessionId,
  idempotencyKey: "opaque-session-revoke-key-0001",
};

test("accepts the shared closed session-revocation receipt for its active owner", () => {
  assert.deepEqual(
    parseAuthSessionRevokeReceipt(canonicalReceipt, canonicalIntent, canonicalIntent.userId),
    canonicalReceipt,
  );
});

test("rejects unconfirmed, mismatched, and non-canonical receipts", () => {
  const candidates = [
    { ...canonicalReceipt, revoked: false },
    { ...canonicalReceipt, extra: true },
    {
      ...canonicalReceipt,
      session: {
        ...(canonicalReceipt.session as Record<string, unknown>),
        id: "another-session",
      },
    },
    {
      ...canonicalReceipt,
      session: {
        ...(canonicalReceipt.session as Record<string, unknown>),
        current: true,
      },
    },
    {
      ...canonicalReceipt,
      session: {
        ...(canonicalReceipt.session as Record<string, unknown>),
        createdAt: "2026-08-06",
      },
    },
    {
      ...canonicalReceipt,
      session: {
        ...(canonicalReceipt.session as Record<string, unknown>),
        createdAt: "2026-02-30T00:00:00Z",
      },
    },
    {
      ...canonicalReceipt,
      session: {
        ...(canonicalReceipt.session as Record<string, unknown>),
        provider: "p".repeat(81),
      },
    },
  ];

  for (const candidate of candidates) {
    assert.throws(
      () => parseAuthSessionRevokeReceipt(candidate, canonicalIntent, canonicalIntent.userId),
      AuthSessionRevokeContractError,
    );
  }
});

test("accepts a real leap-day RFC3339 timestamp", () => {
  const candidate = {
    ...canonicalReceipt,
    session: {
      ...(canonicalReceipt.session as Record<string, unknown>),
      createdAt: "2024-02-29T00:00:00+07:00",
    },
  };
  assert.deepEqual(
    parseAuthSessionRevokeReceipt(candidate, canonicalIntent, canonicalIntent.userId),
    candidate,
  );
});

test("rejects a closed receipt after the active account owner changes", () => {
  assert.throws(
    () =>
      parseAuthSessionRevokeReceipt(canonicalReceipt, canonicalIntent, "platform-admin-owner-2"),
    /không còn thuộc tài khoản hiện tại/i,
  );
});

test("creates a bounded opaque key without embedding account or session identity", () => {
  const key = createAuthSessionRevokeIdempotencyKey();

  assert.match(key, /^session-revoke-/);
  assert.ok(key.length <= 160);
  assert.doesNotMatch(key, /platform-admin-owner-1/);
  assert.doesNotMatch(key, new RegExp(fixtureSessionId));
});

test("retains one key across ambiguous or unconfirmed retries", () => {
  const keys = ["opaque-key-a", "opaque-key-b"];
  const registry = new AuthSessionRevokeIntentRegistry(() => keys.shift() || "unexpected-key");
  const first = registry.getOrCreate(canonicalIntent.userId, fixtureSessionId);

  registry.fail(first, new Error("response lost"));
  assert.equal(
    registry.getOrCreate(canonicalIntent.userId, fixtureSessionId).idempotencyKey,
    first.idempotencyKey,
  );

  registry.fail(first, new AuthSessionRevokeContractError("missing confirmation"));
  assert.equal(
    registry.getOrCreate(canonicalIntent.userId, fixtureSessionId).idempotencyKey,
    first.idempotencyKey,
  );
});

test("scopes stable intents independently by owner and session", () => {
  const keys = ["opaque-key-a", "opaque-key-b", "opaque-key-c"];
  const registry = new AuthSessionRevokeIntentRegistry(() => keys.shift() || "unexpected-key");
  const original = registry.getOrCreate(canonicalIntent.userId, fixtureSessionId);
  const anotherSession = registry.getOrCreate(canonicalIntent.userId, "session-other");
  const anotherOwner = registry.getOrCreate("platform-admin-owner-2", fixtureSessionId);

  assert.notEqual(anotherSession.idempotencyKey, original.idempotencyKey);
  assert.notEqual(anotherOwner.idempotencyKey, original.idempotencyKey);
  assert.equal(
    registry.getOrCreate(canonicalIntent.userId, fixtureSessionId).idempotencyKey,
    original.idempotencyKey,
  );
});

test("retires a key only after a closed receipt or deterministic collision", () => {
  const keys = ["opaque-key-a", "opaque-key-b", "opaque-key-c"];
  const registry = new AuthSessionRevokeIntentRegistry(() => keys.shift() || "unexpected-key");
  const first = registry.getOrCreate(canonicalIntent.userId, fixtureSessionId);

  registry.fail(first, { code: "IDEMPOTENCY_KEY_REUSED" });
  const second = registry.getOrCreate(canonicalIntent.userId, fixtureSessionId);
  assert.notEqual(second.idempotencyKey, first.idempotencyKey);

  registry.confirm(second);
  const third = registry.getOrCreate(canonicalIntent.userId, fixtureSessionId);
  assert.notEqual(third.idempotencyKey, second.idempotencyKey);
});

test("checks the active owner again after the backend settles", async () => {
  let activeOwner = canonicalIntent.userId;
  let settle: ((value: unknown) => void) | undefined;
  const backend = new Promise<unknown>((resolve) => {
    settle = resolve;
  });

  const operation = executeAuthSessionRevoke(
    canonicalIntent,
    () => activeOwner,
    () => backend,
  );
  activeOwner = "platform-admin-owner-2";
  settle?.(canonicalReceipt);

  await assert.rejects(operation, /không còn thuộc tài khoản hiện tại/i);
});

test("wires Platform Admin API and both AccountSettings flows to the canonical receipt", () => {
  const api = fs.readFileSync(path.join(projectRoot, "src", "lib", "smart-health-api.ts"), "utf8");
  const account = fs.readFileSync(
    path.join(projectRoot, "src", "components", "admin", "AccountSettings.tsx"),
    "utf8",
  );

  assert.match(api, /async revokeSession\(intent: AuthSessionRevokeIntent\)/);
  assert.match(api, /\/v1\/auth\/sessions\/\$\{encodeURIComponent\(intent\.sessionId\)\}\/revoke/);
  assert.match(api, /"Idempotency-Key": intent\.idempotencyKey/);
  assert.match(api, /parseAuthSessionRevokeReceipt/);

  assert.match(account, /new AuthSessionRevokeIntentRegistry\(\)/);
  assert.match(account, /executeAuthSessionRevoke\(/);
  assert.match(account, /Promise\.allSettled\(/);
  assert.match(account, /registry\.confirm\(intent\)/);
  assert.match(account, /registry\.fail\(intent, error\)/);
  assert.match(account, /confirmed !== targets\.length/);
});
