"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { after, before, test } = require("node:test");
const { buildProductionReadiness } = require("../src/productionReadiness");
const { getTwoFactorAvailability } = require("../src/twoFactorAuth");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, ".test-data", "two-factor");
const backendPort = 3468;
const encryptionKey = Buffer.alloc(32, 7).toString("hex");
let backend;
let enrollmentBootstrap;
let primarySessionToken;
let secondFactorToken;
let recoveryCodes;
let enrollmentOtp;
let enrollmentIdempotencyKey;
let recoveryDeliveryId;
let recoveryAckToken;
let challengedPrimaryToken;
let challengedSecondFactorToken;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seedDb() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const createdAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(dataDir, "db.json"),
    JSON.stringify(
      {
        version: 1,
        createdAt,
        updatedAt: createdAt,
        organizations: [
          { id: "org_alpha", name: "Alpha Clinic", status: "active", createdAt, updatedAt: createdAt },
          { id: "org_beta", name: "Beta Clinic", status: "active", createdAt, updatedAt: createdAt },
        ],
        users: [
          {
            id: "usr_alpha",
            role: "workspace_admin",
            requestedRole: "workspace_admin",
            roleRequestStatus: "approved",
            accountStatus: "active",
            email: "alpha-2fa@test.local",
            password: "12345678",
            organizationId: "org_alpha",
            twoFactorEnabled: true,
            twoFactorSecretPreview: "LEGA••••CRET",
            twoFactorRecoveryCodes: ["LEGACY-CODE-MUST-DISAPPEAR"],
            firebaseClaims: {
              profile: {
                twoFactorEnabled: true,
                twoFactorMethod: "app",
                twoFactorSecretPreview: "LEGA••••CRET",
                twoFactorRecoveryCodes: ["LEGACY-CODE-MUST-DISAPPEAR"],
              },
            },
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "usr_beta",
            role: "doctor",
            requestedRole: "doctor",
            roleRequestStatus: "approved",
            accountStatus: "active",
            email: "beta-2fa@test.local",
            password: "12345678",
            organizationId: "org_beta",
            twoFactorEnabled: false,
            createdAt,
            updatedAt: createdAt,
          },
        ],
        memberships: [
          { id: "mem_alpha", userId: "usr_alpha", organizationId: "org_alpha", role: "workspace_admin", createdAt },
          { id: "mem_beta", userId: "usr_beta", organizationId: "org_beta", role: "doctor", createdAt },
        ],
        sessions: [],
        authSessions: [],
        auditLogs: [],
        accessLogs: [],
        notifications: [],
      },
      null,
      2,
    ),
  );
}

async function waitForHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/v1/health`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("2FA smoke backend did not start");
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${backendPort}${pathname}`, options);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : {} };
}

async function loginAs(email = "alpha-2fa@test.local") {
  const result = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "12345678" }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.token;
}

async function login() {
  return loginAs();
}

function readPersistedDb() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
}

before(async () => {
  seedDb();
  backend = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(backendPort),
      AUDIO_UDP_PORT: String(backendPort + 20),
      DATA_DIR: dataDir,
      DATA_BACKEND: "json",
      AUTH_MODE: "demo",
      ALLOW_DEMO_AUTH: "true",
      NODE_ENV: "test",
      TWO_FACTOR_ENCRYPTION_KEY: encryptionKey,
      TWO_FACTOR_CHALLENGE_TTL_MS: "1500",
      TWO_FACTOR_DISABLE_LOCK_MS: "1500",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForHealth();
});

after(async () => {
  if (backend && !backend.killed) backend.kill();
});

test("2FA encryption configuration is strict and readiness never exposes the key", () => {
  assert.deepEqual(getTwoFactorAvailability({}), {
    available: false,
    status: "unavailable",
    methods: [],
    reason: "encryption_key_not_configured",
  });
  assert.equal(getTwoFactorAvailability({ TWO_FACTOR_ENCRYPTION_KEY: "too-short" }).reason, "invalid_encryption_key");
  const base64Key = Buffer.alloc(32, 9).toString("base64");
  assert.equal(getTwoFactorAvailability({ TWO_FACTOR_ENCRYPTION_KEY: base64Key }).available, true);
  assert.equal(
    getTwoFactorAvailability({ TWO_FACTOR_ENCRYPTION_KEY: `${base64Key}!!!!` }).reason,
    "invalid_encryption_key",
  );
  const readiness = buildProductionReadiness({
    NODE_ENV: "production",
    TWO_FACTOR_ENCRYPTION_KEY: encryptionKey,
  });
  const item = readiness.items.find((candidate) => candidate.id === "security.two_factor_encryption");
  assert.equal(item.status, "pass");
  assert.equal(JSON.stringify(readiness).includes(encryptionKey), false);
});

test("GET /me/2fa exposes real app availability while the account remains disabled", async () => {
  const token = await login();
  const result = await requestJson("/api/v1/me/2fa", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body.availability, {
    available: true,
    status: "available",
    methods: ["app"],
    reason: "",
  });
  assert.deepEqual(result.body.twoFactor, {
    enabled: false,
    method: "",
    enrollmentPending: false,
  });
  const persistedText = fs.readFileSync(path.join(dataDir, "db.json"), "utf8");
  assert.equal(persistedText.includes("LEGACY-CODE-MUST-DISAPPEAR"), false);
  assert.equal(persistedText.includes("twoFactorSecretPreview"), false);
});

test("2FA account endpoints require a real primary bearer even in demo mode", async () => {
  const result = await requestJson("/api/v1/me/2fa");
  assert.equal(result.response.status, 401, JSON.stringify(result.body));
});

test("legacy fake enable endpoint fails explicitly and never enables the account", async () => {
  const token = await login();
  const result = await requestJson("/api/v1/me/2fa", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "enable", method: "app" }),
  });
  assert.equal(result.response.status, 410, JSON.stringify(result.body));
  assert.equal(result.body.error.code, "TWO_FACTOR_LEGACY_ENDPOINT_REMOVED");
  assert.equal(result.body.error.details.enrollPath, "/api/v1/me/2fa/enroll");
});

test("enrollment start requires a header key, binds exact replay to one primary session, and permits a new-session restart", async () => {
  const token = await login();
  const bodyOnly = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "app",
      idempotencyKey: "body-key-must-not-authorize-enrollment-start",
    }),
  });
  assert.equal(bodyOnly.response.status, 400, JSON.stringify(bodyOnly.body));
  assert.equal(bodyOnly.body.error.code, "IDEMPOTENCY_KEY_REQUIRED");

  const firstStartKey = "two-factor-start-alpha-first-stable-key";
  const result = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": firstStartKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.userId, "usr_alpha");
  assert.deepEqual(result.body.twoFactor, { enabled: false, method: "", enrollmentPending: true });
  assert.equal(result.body.enrollment.method, "app");
  assert.match(result.body.enrollment.id, /^2fa_enroll_/);
  assert.match(result.body.enrollment.manualKey, /^[A-Z2-7]+$/);
  assert.match(result.body.enrollment.otpauthUri, /^otpauth:\/\/totp\//);
  assert.equal(Date.parse(result.body.enrollment.expiresAt) > Date.now(), true);
  assert.equal(result.body.replayed, false);
  assert.equal(result.body.superseded, false);

  const persistedText = fs.readFileSync(path.join(dataDir, "db.json"), "utf8");
  assert.equal(persistedText.includes(result.body.enrollment.manualKey), false);
  assert.equal(persistedText.includes(result.body.enrollment.otpauthUri), false);
  assert.equal(persistedText.includes(firstStartKey), false);
  const persisted = readPersistedDb();
  const enrollmentPersistence = JSON.stringify({
    enrollments: persisted.twoFactorEnrollments,
    audits: persisted.auditLogs,
  });
  assert.equal(enrollmentPersistence.includes(token), false);
  assert.equal(persisted.users.find((item) => item.id === "usr_alpha").twoFactorEnabled, false);
  assert.equal(persisted.twoFactorEnrollments.length, 1);
  assert.equal(Boolean(persisted.twoFactorEnrollments[0].secretCiphertext), true);

  const duplicate = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": firstStartKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(duplicate.response.status, 201, JSON.stringify(duplicate.body));
  assert.equal(duplicate.body.replayed, true);
  assert.equal(duplicate.body.enrollment.id, result.body.enrollment.id);
  assert.equal(duplicate.body.enrollment.manualKey, result.body.enrollment.manualKey);

  const replacementSessionToken = await login();
  const crossSessionReplay = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${replacementSessionToken}`,
      "Idempotency-Key": firstStartKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(crossSessionReplay.response.status, 409, JSON.stringify(crossSessionReplay.body));
  assert.equal(crossSessionReplay.body.error.code, "TWO_FACTOR_ENROLLMENT_SCOPE_MISMATCH");

  const { generate } = await import("otplib");
  const crossSessionOtp = await generate({
    secret: result.body.enrollment.manualKey,
    epoch: Math.floor(Date.now() / 1000) - 30,
  });
  const crossSessionVerify = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${replacementSessionToken}`,
      "Idempotency-Key": "cross-session-old-enrollment-verify-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      enrollmentId: result.body.enrollment.id,
      otp: crossSessionOtp,
    }),
  });
  assert.equal(crossSessionVerify.response.status, 409, JSON.stringify(crossSessionVerify.body));
  assert.equal(crossSessionVerify.body.error.code, "TWO_FACTOR_ENROLLMENT_SCOPE_MISMATCH");

  const restartKey = "two-factor-start-alpha-new-session-restart-key";
  const restarted = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${replacementSessionToken}`,
      "Idempotency-Key": restartKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(restarted.response.status, 201, JSON.stringify(restarted.body));
  assert.equal(restarted.body.replayed, false);
  assert.equal(restarted.body.superseded, true);
  assert.notEqual(restarted.body.enrollment.id, result.body.enrollment.id);

  const historicalReplay = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": firstStartKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(historicalReplay.response.status, 201, JSON.stringify(historicalReplay.body));
  assert.equal(historicalReplay.body.replayed, true);
  assert.equal(historicalReplay.body.superseded, true);
  assert.equal(historicalReplay.body.enrollment.id, result.body.enrollment.id);
  assert.equal(historicalReplay.body.enrollment.manualKey, result.body.enrollment.manualKey);

  const historicalCrossSessionReplay = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${replacementSessionToken}`,
      "Idempotency-Key": firstStartKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(
    historicalCrossSessionReplay.response.status,
    409,
    JSON.stringify(historicalCrossSessionReplay.body),
  );
  assert.equal(
    historicalCrossSessionReplay.body.error.code,
    "TWO_FACTOR_ENROLLMENT_SCOPE_MISMATCH",
  );

  const oldVerify = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "old-superseded-enrollment-verify-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enrollmentId: result.body.enrollment.id, otp: "000000" }),
  });
  assert.equal(oldVerify.response.status, 410, JSON.stringify(oldVerify.body));
  assert.equal(oldVerify.body.error.code, "TWO_FACTOR_ENROLLMENT_ALREADY_USED");
  primarySessionToken = replacementSessionToken;
  enrollmentBootstrap = restarted.body.enrollment;
});

test("a different start key supersedes recovery-ACK-pending and denies every old verify or ACK", async () => {
  const { generate } = await import("otplib");
  const betaToken = await loginAs("beta-2fa@test.local");
  const startKey = "two-factor-start-beta-ack-pending-key";
  const started = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaToken}`,
      "Idempotency-Key": startKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(started.response.status, 201, JSON.stringify(started.body));
  const otp = await generate({
    secret: started.body.enrollment.manualKey,
    epoch: Math.floor(Date.now() / 1000) - 30,
  });
  const verifyKey = "two-factor-verify-beta-ack-pending-key";
  const verified = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaToken}`,
      "Idempotency-Key": verifyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enrollmentId: started.body.enrollment.id, otp }),
  });
  assert.equal(verified.response.status, 200, JSON.stringify(verified.body));

  const exactStartReplay = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaToken}`,
      "Idempotency-Key": startKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(exactStartReplay.response.status, 201, JSON.stringify(exactStartReplay.body));
  assert.equal(exactStartReplay.body.replayed, true);
  assert.equal(exactStartReplay.body.enrollment.id, started.body.enrollment.id);

  const restarted = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaToken}`,
      "Idempotency-Key": "two-factor-start-beta-superseding-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(restarted.response.status, 201, JSON.stringify(restarted.body));
  assert.equal(restarted.body.superseded, true);
  assert.notEqual(restarted.body.enrollment.id, started.body.enrollment.id);

  const oldVerify = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaToken}`,
      "Idempotency-Key": verifyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enrollmentId: started.body.enrollment.id, otp }),
  });
  assert.equal(oldVerify.response.status, 410, JSON.stringify(oldVerify.body));
  assert.equal(oldVerify.body.error.code, "TWO_FACTOR_ENROLLMENT_ALREADY_USED");

  const oldAck = await requestJson("/api/v1/me/2fa/recovery-codes/ack", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaToken}`,
      "Idempotency-Key": verifyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deliveryId: verified.body.recoveryDelivery.id,
      recoveryAckToken: verified.body.recoveryAckToken,
    }),
  });
  assert.equal(oldAck.response.status, 409, JSON.stringify(oldAck.body));
  assert.equal(oldAck.body.error.code, "TWO_FACTOR_DELIVERY_SCOPE_MISMATCH");
});

test("valid TOTP verification stays pending until exact recovery ACK atomically enables 2FA", async () => {
  const { generate } = await import("otplib");
  const otp = await generate({
    secret: enrollmentBootstrap.manualKey,
    epoch: Math.floor(Date.now() / 1000) - 30,
  });
  enrollmentOtp = otp;
  const missingIdempotencyKey = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: { Authorization: `Bearer ${primarySessionToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      enrollmentId: enrollmentBootstrap.id,
      otp,
      idempotencyKey: "body-idempotency-key-must-not-be-authoritative",
    }),
  });
  assert.equal(missingIdempotencyKey.response.status, 400, JSON.stringify(missingIdempotencyKey.body));
  assert.equal(missingIdempotencyKey.body.error.code, "IDEMPOTENCY_KEY_REQUIRED");

  const invalid = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${primarySessionToken}`,
      "Idempotency-Key": "two-factor-invalid-code-intent",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enrollmentId: enrollmentBootstrap.id, otp: "000000" }),
  });
  assert.equal(invalid.response.status, 401, JSON.stringify(invalid.body));
  assert.equal(invalid.body.error.code, "TWO_FACTOR_CODE_INVALID");
  assert.equal(readPersistedDb().users.find((item) => item.id === "usr_alpha").twoFactorEnabled, false);
  assert.equal(readPersistedDb().auditLogs.some((item) => item.action === "account.2fa.enable"), false);

  enrollmentIdempotencyKey = "two-factor-enrollment-stable-response-loss-intent";
  const verifyRequest = () => requestJson("/api/v1/me/2fa/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${primarySessionToken}`,
        "Idempotency-Key": enrollmentIdempotencyKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enrollmentId: enrollmentBootstrap.id, otp }),
    });
  const concurrentVerification = await Promise.all([verifyRequest(), verifyRequest()]);
  assert.deepEqual(
    concurrentVerification.map((result) => result.response.status),
    [200, 200],
    JSON.stringify(concurrentVerification.map((result) => result.body)),
  );
  assert.deepEqual(
    concurrentVerification.map((result) => result.body.replayed).sort(),
    [false, true],
  );
  const verified = concurrentVerification.find((result) => !result.body.replayed);
  assert.ok(verified);
  assert.equal(verified.response.status, 200, JSON.stringify(verified.body));
  assert.equal(verified.body.userId, "usr_alpha");
  assert.equal(verified.body.enrollmentId, enrollmentBootstrap.id);
  assert.deepEqual(verified.body.twoFactor, { enabled: false, method: "", enrollmentPending: true });
  assert.equal(Array.isArray(verified.body.recoveryCodes), true);
  assert.equal(verified.body.recoveryCodes.length, 8);
  assert.equal(new Set(verified.body.recoveryCodes).size, 8);
  assert.match(verified.body.recoveryAckToken, /^[A-Za-z0-9_-]+$/);
  assert.equal(Object.hasOwn(verified.body, "twoFactorToken"), false);
  assert.deepEqual(verified.body.recoveryDelivery, {
    id: verified.body.recoveryDelivery.id,
    expiresAt: verified.body.recoveryDelivery.expiresAt,
    acknowledged: false,
  });
  assert.match(verified.body.recoveryDelivery.id, /^2fa_delivery_[A-Za-z0-9_-]+$/);
  assert.equal(Date.parse(verified.body.recoveryDelivery.expiresAt) > Date.now(), true);
  assert.equal(verified.body.replayed, false);
  recoveryCodes = verified.body.recoveryCodes;
  recoveryDeliveryId = verified.body.recoveryDelivery.id;
  recoveryAckToken = verified.body.recoveryAckToken;

  const persistedText = fs.readFileSync(path.join(dataDir, "db.json"), "utf8");
  assert.equal(persistedText.includes(enrollmentBootstrap.manualKey), false);
  assert.equal(recoveryCodes.some((code) => persistedText.includes(code)), false);
  assert.equal(persistedText.includes(recoveryAckToken), false);
  assert.equal(persistedText.includes(enrollmentIdempotencyKey), false);
  const persisted = readPersistedDb();
  assert.equal(persisted.users.find((item) => item.id === "usr_alpha").twoFactorEnabled, false);
  assert.equal(persisted.twoFactorCredentials.length, 0);
  assert.equal(persisted.twoFactorTokens.length, 0);
  const activeEnrollment = persisted.twoFactorEnrollments.find(
    (item) => item.id === enrollmentBootstrap.id,
  );
  assert.equal(
    activeEnrollment.pendingActivation.recoveryCodes.every((item) => item.hash && !item.code),
    true,
  );
  assert.equal(persisted.auditLogs.filter((item) => item.action === "account.2fa.enable").length, 0);

  const pendingStatus = await requestJson("/api/v1/me/2fa", {
    headers: { Authorization: `Bearer ${primarySessionToken}` },
  });
  assert.deepEqual(pendingStatus.body.twoFactor, {
    enabled: false,
    method: "",
    enrollmentPending: true,
  });
  const pendingProtectedAccess = await requestJson("/api/v1/me", {
    headers: { Authorization: `Bearer ${primarySessionToken}` },
  });
  assert.equal(pendingProtectedAccess.response.status, 200, JSON.stringify(pendingProtectedAccess.body));
  assert.equal(pendingProtectedAccess.body.user.twoFactorEnabled, false);
  assert.equal(pendingProtectedAccess.body.user.firebaseClaims.profile.twoFactorEnabled, false);
  assert.equal(pendingProtectedAccess.body.user.firebaseClaims.profile.twoFactorMethod, "");

  const replay = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${primarySessionToken}`,
      "Idempotency-Key": enrollmentIdempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enrollmentId: enrollmentBootstrap.id, otp }),
  });
  assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.replayed, true);
  assert.deepEqual(replay.body.recoveryCodes, recoveryCodes);
  assert.equal(replay.body.recoveryAckToken, recoveryAckToken);
  assert.deepEqual(replay.body.recoveryDelivery, verified.body.recoveryDelivery);
  assert.equal(readPersistedDb().auditLogs.filter((item) => item.action === "account.2fa.enable").length, 0);

  const collision = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${primarySessionToken}`,
      "Idempotency-Key": "two-factor-enrollment-different-intent",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enrollmentId: enrollmentBootstrap.id, otp }),
  });
  assert.equal(collision.response.status, 409, JSON.stringify(collision.body));
  assert.equal(collision.body.error.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(JSON.stringify(collision.body).includes(recoveryCodes[0]), false);

  const wrongAcknowledgementKey = await requestJson("/api/v1/me/2fa/recovery-codes/ack", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${primarySessionToken}`,
      "Idempotency-Key": "two-factor-enrollment-wrong-ack-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ deliveryId: recoveryDeliveryId, recoveryAckToken }),
  });
  assert.equal(wrongAcknowledgementKey.response.status, 409, JSON.stringify(wrongAcknowledgementKey.body));
  assert.equal(wrongAcknowledgementKey.body.error.code, "TWO_FACTOR_DELIVERY_SCOPE_MISMATCH");

  const wrongAcknowledgementToken = await requestJson("/api/v1/me/2fa/recovery-codes/ack", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${primarySessionToken}`,
      "Idempotency-Key": enrollmentIdempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deliveryId: recoveryDeliveryId,
      recoveryAckToken: "wrong-recovery-ack-token-0123456789abcdef",
    }),
  });
  assert.equal(wrongAcknowledgementToken.response.status, 409, JSON.stringify(wrongAcknowledgementToken.body));
  assert.equal(wrongAcknowledgementToken.body.error.code, "TWO_FACTOR_DELIVERY_SCOPE_MISMATCH");

  const betaLogin = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "beta-2fa@test.local", password: "12345678" }),
  });
  assert.equal(betaLogin.response.status, 200, JSON.stringify(betaLogin.body));
  const crossAccountAcknowledgement = await requestJson("/api/v1/me/2fa/recovery-codes/ack", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaLogin.body.token}`,
      "Idempotency-Key": enrollmentIdempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ deliveryId: recoveryDeliveryId, recoveryAckToken }),
  });
  assert.equal(crossAccountAcknowledgement.response.status, 409, JSON.stringify(crossAccountAcknowledgement.body));
  assert.equal(crossAccountAcknowledgement.body.error.code, "TWO_FACTOR_DELIVERY_SCOPE_MISMATCH");
  assert.equal(JSON.stringify(crossAccountAcknowledgement.body).includes(recoveryCodes[0]), false);

  const acknowledgementRequest = () => requestJson("/api/v1/me/2fa/recovery-codes/ack", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${primarySessionToken}`,
        "Idempotency-Key": enrollmentIdempotencyKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deliveryId: recoveryDeliveryId, recoveryAckToken }),
    });
  const concurrentAcknowledgements = await Promise.all([
    acknowledgementRequest(),
    acknowledgementRequest(),
  ]);
  assert.deepEqual(
    concurrentAcknowledgements.map((result) => result.response.status),
    [200, 200],
    JSON.stringify(concurrentAcknowledgements.map((result) => result.body)),
  );
  assert.deepEqual(
    concurrentAcknowledgements.map((result) => result.body.replayed).sort(),
    [false, true],
  );
  const acknowledged = concurrentAcknowledgements.find((result) => !result.body.replayed);
  assert.ok(acknowledged);
  assert.equal(acknowledged.response.status, 200, JSON.stringify(acknowledged.body));
  assert.equal(acknowledged.body.userId, "usr_alpha");
  assert.equal(acknowledged.body.enrollmentId, enrollmentBootstrap.id);
  assert.equal(acknowledged.body.recoveryDelivery.id, recoveryDeliveryId);
  assert.equal(acknowledged.body.recoveryDelivery.acknowledged, true);
  assert.ok(Date.parse(acknowledged.body.recoveryDelivery.acknowledgedAt));
  assert.equal(acknowledged.body.replayed, false);
  assert.match(acknowledged.body.twoFactorToken, /^[A-Za-z0-9_-]+$/);
  assert.equal(Date.parse(acknowledged.body.tokenExpiresAt) > Date.now(), true);
  secondFactorToken = acknowledged.body.twoFactorToken;
  assert.equal(JSON.stringify(acknowledged.body).includes(recoveryCodes[0]), false);
  const activatedDb = readPersistedDb();
  assert.equal(activatedDb.users.find((item) => item.id === "usr_alpha").twoFactorEnabled, true);
  assert.equal(activatedDb.twoFactorCredentials.length, 1);
  assert.equal(activatedDb.twoFactorTokens.length, 1);
  assert.equal(
    activatedDb.twoFactorEnrollments.find((item) => item.id === enrollmentBootstrap.id).pendingActivation,
    null,
  );
  assert.equal(activatedDb.auditLogs.filter((item) => item.action === "account.2fa.enable").length, 1);

  const acknowledgementReplay = await requestJson("/api/v1/me/2fa/recovery-codes/ack", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${primarySessionToken}`,
      "Idempotency-Key": enrollmentIdempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ deliveryId: recoveryDeliveryId, recoveryAckToken }),
  });
  assert.equal(acknowledgementReplay.response.status, 200, JSON.stringify(acknowledgementReplay.body));
  assert.equal(acknowledgementReplay.body.replayed, true);
  assert.equal(acknowledgementReplay.body.twoFactorToken, secondFactorToken);
  assert.equal(
    readPersistedDb().auditLogs.filter(
      (item) => item.action === "account.2fa.enable",
    ).length,
    1,
  );

  const replayAfterAcknowledgement = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${primarySessionToken}`,
      "Idempotency-Key": enrollmentIdempotencyKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enrollmentId: enrollmentBootstrap.id, otp }),
  });
  assert.equal(replayAfterAcknowledgement.response.status, 410, JSON.stringify(replayAfterAcknowledgement.body));
  assert.equal(
    replayAfterAcknowledgement.body.error.code,
    "TWO_FACTOR_ENROLLMENT_ALREADY_USED",
  );
  assert.equal(JSON.stringify(replayAfterAcknowledgement.body).includes(recoveryCodes[0]), false);
});

test("enabled accounts cannot use a protected API without a bound second-factor token", async () => {
  const blocked = await requestJson("/api/v1/me", {
    headers: { Authorization: `Bearer ${primarySessionToken}` },
  });
  assert.equal(blocked.response.status, 403, JSON.stringify(blocked.body));
  assert.equal(blocked.body.error.code, "TWO_FACTOR_CHALLENGE_REQUIRED");
  assert.match(blocked.body.error.details.challengeId, /^2fa_challenge_[A-Za-z0-9_-]{32}$/);
  assert.equal(blocked.body.error.details.method, "app");
  assert.equal(Date.parse(blocked.body.error.details.expiresAt) > Date.now(), true);

  const allowed = await requestJson("/api/v1/me", {
    headers: {
      Authorization: `Bearer ${primarySessionToken}`,
      "x-shcare-2fa-token": secondFactorToken,
    },
  });
  assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
  assert.equal(allowed.body.user.id, "usr_alpha");
  assert.equal(Object.prototype.hasOwnProperty.call(allowed.body.user, "twoFactorRecoveryCodes"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(allowed.body.user, "twoFactorSecret"), false);
});

test("demo login creates only a bounded challenge and issues the primary session after TOTP", async () => {
  const sessionsBefore = readPersistedDb().sessions.length;
  const loginResult = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alpha-2fa@test.local", password: "12345678" }),
  });
  assert.equal(loginResult.response.status, 202, JSON.stringify(loginResult.body));
  assert.equal(Object.prototype.hasOwnProperty.call(loginResult.body, "token"), false);
  assert.equal(readPersistedDb().sessions.length, sessionsBefore);
  assert.equal(loginResult.body.error.code, "TWO_FACTOR_CHALLENGE_REQUIRED");
  assert.match(loginResult.body.error.requestId, /^req_/);
  const challenge = loginResult.body.error.details;

  const replay = await requestJson("/api/v1/auth/2fa/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: challenge.challengeId, otp: enrollmentOtp }),
  });
  assert.equal(replay.response.status, 401, JSON.stringify(replay.body));
  assert.equal(replay.body.error.code, "TWO_FACTOR_CODE_REPLAYED");
  assert.equal(readPersistedDb().sessions.length, sessionsBefore);

  const { generate } = await import("otplib");
  const currentOtp = await generate({ secret: enrollmentBootstrap.manualKey });
  const completed = await requestJson("/api/v1/auth/2fa/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: challenge.challengeId, otp: currentOtp }),
  });
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body));
  assert.match(completed.body.token, /^[a-f0-9]{64}$/);
  assert.match(completed.body.twoFactorToken, /^[A-Za-z0-9_-]+$/);
  assert.equal(completed.body.user.id, "usr_alpha");
  assert.equal(Date.parse(completed.body.expiresAt) > Date.now(), true);
  assert.equal(readPersistedDb().sessions.length, sessionsBefore + 1);
  challengedPrimaryToken = completed.body.token;
  challengedSecondFactorToken = completed.body.twoFactorToken;

  const protectedResult = await requestJson("/api/v1/me", {
    headers: {
      Authorization: `Bearer ${completed.body.token}`,
      "x-shcare-2fa-token": completed.body.twoFactorToken,
    },
  });
  assert.equal(protectedResult.response.status, 200, JSON.stringify(protectedResult.body));

  const wrongBinding = await requestJson("/api/v1/me", {
    headers: {
      Authorization: `Bearer ${completed.body.token}`,
      "x-shcare-2fa-token": secondFactorToken,
    },
  });
  assert.equal(wrongBinding.response.status, 403, JSON.stringify(wrongBinding.body));
  assert.equal(wrongBinding.body.error.code, "TWO_FACTOR_CHALLENGE_REQUIRED");
});

test("recovery codes are one-use and a failed reuse never creates a demo session", async () => {
  const loginOne = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alpha-2fa@test.local", password: "12345678" }),
  });
  assert.equal(loginOne.response.status, 202, JSON.stringify(loginOne.body));
  const completed = await requestJson("/api/v1/auth/2fa/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: loginOne.body.error.details.challengeId, recoveryCode: recoveryCodes[0] }),
  });
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body));
  const sessionsAfterFirstUse = readPersistedDb().sessions.length;

  const loginTwo = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alpha-2fa@test.local", password: "12345678" }),
  });
  const reused = await requestJson("/api/v1/auth/2fa/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: loginTwo.body.error.details.challengeId, recoveryCode: recoveryCodes[0] }),
  });
  assert.equal(reused.response.status, 401, JSON.stringify(reused.body));
  assert.equal(reused.body.error.code, "TWO_FACTOR_RECOVERY_CODE_INVALID");
  assert.equal(readPersistedDb().sessions.length, sessionsAfterFirstUse);
});

test("a challenge created for one user/session cannot be completed by another tenant user", async () => {
  const alphaBlocked = await requestJson("/api/v1/me", {
    headers: { Authorization: `Bearer ${challengedPrimaryToken}` },
  });
  assert.equal(alphaBlocked.response.status, 403, JSON.stringify(alphaBlocked.body));
  const betaLogin = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "beta-2fa@test.local", password: "12345678" }),
  });
  assert.equal(betaLogin.response.status, 200, JSON.stringify(betaLogin.body));
  const sessionsBefore = readPersistedDb().sessions.length;
  const crossUser = await requestJson("/api/v1/auth/2fa/challenge", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaLogin.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      challengeId: alphaBlocked.body.error.details.challengeId,
      recoveryCode: recoveryCodes[1],
    }),
  });
  assert.equal(crossUser.response.status, 403, JSON.stringify(crossUser.body));
  assert.equal(crossUser.body.error.code, "TWO_FACTOR_CHALLENGE_SCOPE_MISMATCH");
  assert.equal(readPersistedDb().sessions.length, sessionsBefore);
  assert.equal(readPersistedDb().twoFactorCredentials[0].recoveryCodes[1].usedAt, null);
});

test("concurrent challenge double-submit creates one session and consumes one recovery code once", async () => {
  const loginResult = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alpha-2fa@test.local", password: "12345678" }),
  });
  assert.equal(loginResult.response.status, 202, JSON.stringify(loginResult.body));
  const challengeId = loginResult.body.error.details.challengeId;
  const before = readPersistedDb();
  const sessionsBefore = before.sessions.length;
  const auditsBefore = before.auditLogs.filter(
    (item) => item.action === "auth.2fa.challenge.complete" && item.metadata?.method === "recovery_code",
  ).length;
  const request = () =>
    requestJson("/api/v1/auth/2fa/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, recoveryCode: recoveryCodes[2] }),
    });
  const results = await Promise.all([request(), request()]);
  assert.deepEqual(results.map((item) => item.response.status).sort((a, b) => a - b), [200, 409]);
  assert.equal(results.find((item) => item.response.status === 409).body.error.code, "TWO_FACTOR_CHALLENGE_ALREADY_USED");
  const persisted = readPersistedDb();
  assert.equal(persisted.sessions.length, sessionsBefore + 1);
  assert.equal(Boolean(persisted.twoFactorCredentials[0].recoveryCodes[2].usedAt), true);
  assert.equal(
    persisted.auditLogs.filter(
      (item) => item.action === "auth.2fa.challenge.complete" && item.metadata?.method === "recovery_code",
    ).length,
    auditsBefore + 1,
  );
});

test("concurrent logins share one durable user challenge and cannot consume the same factor twice", async () => {
  const createLoginChallenge = () =>
    requestJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alpha-2fa@test.local", password: "12345678" }),
    });
  const [firstLogin, secondLogin] = await Promise.all([createLoginChallenge(), createLoginChallenge()]);
  assert.equal(firstLogin.response.status, 202, JSON.stringify(firstLogin.body));
  assert.equal(secondLogin.response.status, 202, JSON.stringify(secondLogin.body));
  assert.equal(firstLogin.body.error.details.challengeId, secondLogin.body.error.details.challengeId);
  const sessionsBefore = readPersistedDb().sessions.length;
  const complete = (challengeId) =>
    requestJson("/api/v1/auth/2fa/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, recoveryCode: recoveryCodes[4] }),
    });
  const results = await Promise.all([
    complete(firstLogin.body.error.details.challengeId),
    complete(secondLogin.body.error.details.challengeId),
  ]);
  assert.deepEqual(results.map((item) => item.response.status).sort((a, b) => a - b), [200, 409]);
  assert.equal(
    results.find((item) => item.response.status === 409).body.error.code,
    "TWO_FACTOR_CHALLENGE_ALREADY_USED",
  );
  assert.equal(readPersistedDb().sessions.length, sessionsBefore + 1);
});

test("challenge attempts and expiry are bounded without issuing a session", async () => {
  const attemptsLogin = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alpha-2fa@test.local", password: "12345678" }),
  });
  const challengeId = attemptsLogin.body.error.details.challengeId;
  const sessionsBefore = readPersistedDb().sessions.length;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await requestJson("/api/v1/auth/2fa/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, recoveryCode: "NOT-A-RECOVERY-CODE" }),
    });
    assert.equal(result.response.status, attempt < 5 ? 401 : 429, JSON.stringify(result.body));
    assert.equal(
      result.body.error.code,
      attempt < 5 ? "TWO_FACTOR_RECOVERY_CODE_INVALID" : "TWO_FACTOR_ATTEMPTS_EXCEEDED",
    );
  }
  const exhausted = await requestJson("/api/v1/auth/2fa/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, recoveryCode: recoveryCodes[3] }),
  });
  assert.equal(exhausted.response.status, 429, JSON.stringify(exhausted.body));
  assert.equal(exhausted.body.error.code, "TWO_FACTOR_ATTEMPTS_EXCEEDED");
  assert.equal(readPersistedDb().sessions.length, sessionsBefore);

  const expiryLogin = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alpha-2fa@test.local", password: "12345678" }),
  });
  assert.equal(
    expiryLogin.body.error.details.challengeId,
    challengeId,
    "an exhausted challenge must remain the durable per-user lockout until expiry",
  );
  await delay(1700);
  const expired = await requestJson("/api/v1/auth/2fa/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: expiryLogin.body.error.details.challengeId, recoveryCode: recoveryCodes[3] }),
  });
  assert.equal(expired.response.status, 410, JSON.stringify(expired.body));
  assert.equal(expired.body.error.code, "TWO_FACTOR_CHALLENGE_EXPIRED");
  assert.equal(readPersistedDb().sessions.length, sessionsBefore);
});

test("SMS enrollment is explicitly unavailable and never falls back to a fake success", async () => {
  const result = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${challengedPrimaryToken}`,
      "x-shcare-2fa-token": challengedSecondFactorToken,
      "Idempotency-Key": "two-factor-sms-unavailable-intent",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: "sms" }),
  });
  assert.equal(result.response.status, 503, JSON.stringify(result.body));
  assert.equal(result.body.error.code, "TWO_FACTOR_METHOD_UNAVAILABLE");
  assert.equal(result.body.error.details.availability.methods.includes("sms"), false);
});

test("disable requires a current factor, revokes 2FA tokens, and audits only the confirmed outcome", async () => {
  const before = readPersistedDb();
  const missingBoundToken = await requestJson("/api/v1/me/2fa/disable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${challengedPrimaryToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recoveryCode: recoveryCodes[3] }),
  });
  assert.equal(missingBoundToken.response.status, 403, JSON.stringify(missingBoundToken.body));
  assert.equal(missingBoundToken.body.error.code, "TWO_FACTOR_CHALLENGE_REQUIRED");

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const invalid = await requestJson("/api/v1/me/2fa/disable", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${challengedPrimaryToken}`,
        "x-shcare-2fa-token": challengedSecondFactorToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recoveryCode: "INVALID-RECOVERY" }),
    });
    assert.equal(invalid.response.status, attempt < 5 ? 401 : 429, JSON.stringify(invalid.body));
    assert.equal(
      invalid.body.error.code,
      attempt < 5 ? "TWO_FACTOR_RECOVERY_CODE_INVALID" : "TWO_FACTOR_ATTEMPTS_EXCEEDED",
    );
  }
  const locked = await requestJson("/api/v1/me/2fa/disable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${challengedPrimaryToken}`,
      "x-shcare-2fa-token": challengedSecondFactorToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recoveryCode: recoveryCodes[3] }),
  });
  assert.equal(locked.response.status, 429, JSON.stringify(locked.body));
  assert.equal(locked.body.error.code, "TWO_FACTOR_ATTEMPTS_EXCEEDED");
  assert.equal(
    readPersistedDb().auditLogs.filter((item) => item.action === "account.2fa.disable").length,
    before.auditLogs.filter((item) => item.action === "account.2fa.disable").length,
  );

  await delay(1700);

  const disabled = await requestJson("/api/v1/me/2fa/disable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${challengedPrimaryToken}`,
      "x-shcare-2fa-token": challengedSecondFactorToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recoveryCode: recoveryCodes[3] }),
  });
  assert.equal(disabled.response.status, 200, JSON.stringify(disabled.body));
  assert.deepEqual(disabled.body.twoFactor, { enabled: false, method: "", enrollmentPending: false });
  const persisted = readPersistedDb();
  assert.equal(persisted.users.find((item) => item.id === "usr_alpha").twoFactorEnabled, false);
  assert.equal(persisted.twoFactorCredentials.every((item) => item.userId !== "usr_alpha" || item.disabledAt), true);
  assert.equal(persisted.twoFactorTokens.filter((item) => item.userId === "usr_alpha").every((item) => item.revokedAt), true);
  assert.equal(
    persisted.auditLogs.filter((item) => item.action === "account.2fa.disable").length,
    before.auditLogs.filter((item) => item.action === "account.2fa.disable").length + 1,
  );
  assert.equal(recoveryCodes.some((code) => JSON.stringify(persisted).includes(code)), false);

  const noLongerGated = await requestJson("/api/v1/me", {
    headers: { Authorization: `Bearer ${challengedPrimaryToken}` },
  });
  assert.equal(noLongerGated.response.status, 200, JSON.stringify(noLongerGated.body));
  const loginResult = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alpha-2fa@test.local", password: "12345678" }),
  });
  assert.equal(loginResult.response.status, 200, JSON.stringify(loginResult.body));
  assert.match(loginResult.body.token, /^[a-f0-9]{64}$/);
});
