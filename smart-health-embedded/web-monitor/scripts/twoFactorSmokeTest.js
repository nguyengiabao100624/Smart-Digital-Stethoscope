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

async function login() {
  const result = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alpha-2fa@test.local", password: "12345678" }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.token;
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

test("app enrollment returns the TOTP bootstrap secret once without enabling or persisting plaintext", async () => {
  const token = await login();
  primarySessionToken = token;
  const result = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  assert.deepEqual(result.body.twoFactor, { enabled: false, method: "" });
  assert.equal(result.body.enrollment.method, "app");
  assert.match(result.body.enrollment.id, /^2fa_enroll_/);
  assert.match(result.body.enrollment.manualKey, /^[A-Z2-7]+$/);
  assert.match(result.body.enrollment.otpauthUri, /^otpauth:\/\/totp\//);
  assert.equal(Date.parse(result.body.enrollment.expiresAt) > Date.now(), true);

  const persistedText = fs.readFileSync(path.join(dataDir, "db.json"), "utf8");
  assert.equal(persistedText.includes(result.body.enrollment.manualKey), false);
  assert.equal(persistedText.includes(result.body.enrollment.otpauthUri), false);
  const persisted = readPersistedDb();
  assert.equal(persisted.users.find((item) => item.id === "usr_alpha").twoFactorEnabled, false);
  assert.equal(persisted.twoFactorEnrollments.length, 1);
  assert.equal(Boolean(persisted.twoFactorEnrollments[0].secretCiphertext), true);

  const duplicate = await requestJson("/api/v1/me/2fa/enroll", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(duplicate.response.status, 409, JSON.stringify(duplicate.body));
  assert.equal(duplicate.body.error.code, "TWO_FACTOR_ENROLLMENT_PENDING");
  assert.equal(JSON.stringify(duplicate.body).includes(result.body.enrollment.manualKey), false);
  enrollmentBootstrap = result.body.enrollment;
});

test("valid TOTP verification atomically enables 2FA and returns recovery codes only once", async () => {
  const { generate } = await import("otplib");
  const otp = await generate({
    secret: enrollmentBootstrap.manualKey,
    epoch: Math.floor(Date.now() / 1000) - 30,
  });
  enrollmentOtp = otp;
  const invalid = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: { Authorization: `Bearer ${primarySessionToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ enrollmentId: enrollmentBootstrap.id, otp: "000000" }),
  });
  assert.equal(invalid.response.status, 401, JSON.stringify(invalid.body));
  assert.equal(invalid.body.error.code, "TWO_FACTOR_CODE_INVALID");
  assert.equal(readPersistedDb().users.find((item) => item.id === "usr_alpha").twoFactorEnabled, false);
  assert.equal(readPersistedDb().auditLogs.some((item) => item.action === "account.2fa.enable"), false);

  const verified = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: { Authorization: `Bearer ${primarySessionToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ enrollmentId: enrollmentBootstrap.id, otp }),
  });
  assert.equal(verified.response.status, 200, JSON.stringify(verified.body));
  assert.deepEqual(verified.body.twoFactor, { enabled: true, method: "app" });
  assert.equal(Array.isArray(verified.body.recoveryCodes), true);
  assert.equal(verified.body.recoveryCodes.length, 8);
  assert.equal(new Set(verified.body.recoveryCodes).size, 8);
  assert.match(verified.body.twoFactorToken, /^[A-Za-z0-9_-]+$/);
  assert.equal(Date.parse(verified.body.tokenExpiresAt) > Date.now(), true);
  secondFactorToken = verified.body.twoFactorToken;
  recoveryCodes = verified.body.recoveryCodes;

  const persistedText = fs.readFileSync(path.join(dataDir, "db.json"), "utf8");
  assert.equal(persistedText.includes(enrollmentBootstrap.manualKey), false);
  assert.equal(recoveryCodes.some((code) => persistedText.includes(code)), false);
  assert.equal(persistedText.includes(secondFactorToken), false);
  const persisted = readPersistedDb();
  assert.equal(persisted.users.find((item) => item.id === "usr_alpha").twoFactorEnabled, true);
  assert.equal(persisted.twoFactorCredentials.length, 1);
  assert.equal(persisted.twoFactorCredentials[0].recoveryCodes.every((item) => item.hash && !item.code), true);
  assert.equal(persisted.auditLogs.filter((item) => item.action === "account.2fa.enable").length, 1);

  const replay = await requestJson("/api/v1/me/2fa/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${primarySessionToken}`,
      "x-shcare-2fa-token": secondFactorToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enrollmentId: enrollmentBootstrap.id, otp }),
  });
  assert.equal(replay.response.status, 409, JSON.stringify(replay.body));
  assert.equal(replay.body.error.code, "TWO_FACTOR_ENROLLMENT_ALREADY_USED");
  assert.equal(JSON.stringify(replay.body).includes(recoveryCodes[0]), false);
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
  assert.deepEqual(disabled.body.twoFactor, { enabled: false, method: "" });
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
