const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { getFirebaseAdmin } = require("../src/firebaseAuth");

const backendUrl = (process.env.SMOKE_BACKEND_URL || "https://shcare-api-prod.onrender.com")
  .replace(/\/+$/, "");
const apiKey = String(
  process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || "",
).trim();
const platformEmail = String(process.env.SMOKE_PLATFORM_EMAIL || "").trim().toLowerCase();
const recipientEmail = String(process.env.SMOKE_RECIPIENT_EMAIL || "").trim().toLowerCase();
const deviceId = String(process.env.SMOKE_DEVICE_ID || "shcare-g3-prod-demo").trim();
const runId = `device-access-production-${Date.now().toString(36)}-${crypto
  .randomBytes(4)
  .toString("hex")}`;

function required(value, name) {
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function errorMessage(payload) {
  if (!payload) return "Unknown API error";
  if (typeof payload === "string") return payload.slice(0, 300);
  return String(payload.error?.message || payload.message || JSON.stringify(payload)).slice(0, 300);
}

async function requestJson(url, options = {}) {
  const method = options.method || "GET";
  const headers = {
    Accept: "application/json",
    "User-Agent": "Shcare-Device-Access-Production-Smoke/1.0",
    ...options.headers,
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const retrySafe = ["GET", "HEAD"].includes(method) || Boolean(options.idempotencyKey);
  const attempts = retrySafe ? 4 : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { message: text.slice(0, 300) };
      }
      if (options.allowedStatuses?.includes(response.status)) {
        return { status: response.status, payload };
      }
      if (response.ok) return { status: response.status, payload };
      const error = new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status} ${errorMessage(payload)}`);
      error.status = response.status;
      if (![429, 502, 503, 504].includes(response.status) || attempt === attempts) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt === attempts || (!retrySafe && !error.status)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(12_000, attempt * 2_000)));
  }
  throw lastError || new Error(`Request failed: ${method} ${new URL(url).pathname}`);
}

async function firebaseTokenForEmail(admin, email) {
  const user = await admin.auth().getUserByEmail(email);
  assert.equal(user.disabled, false, "Smoke identity must be enabled");
  const customToken = await admin.auth().createCustomToken(user.uid);
  const response = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      body: { token: customToken, returnSecureToken: true },
    },
  );
  assert.ok(response.payload.idToken, "Firebase token exchange must return idToken");
  return response.payload.idToken;
}

async function backendIdentity(token) {
  await requestJson(`${backendUrl}/api/auth/firebase`, { token });
  const response = await requestJson(`${backendUrl}/api/me`, { token });
  return response.payload.user || response.payload.me?.user || response.payload.me || response.payload;
}

async function createInvite(token, accessLevel, suffix) {
  const idempotencyKey = `${runId}:${suffix}`;
  const response = await requestJson(
    `${backendUrl}/api/v1/devices/${encodeURIComponent(deviceId)}/access-invites`,
    {
      method: "POST",
      token,
      idempotencyKey,
      body: { accessLevel, expiresInHours: 1, idempotencyKey },
    },
  );
  assert.match(response.payload.code || "", /^SHC-[A-Z0-9-]+$/);
  assert.equal(response.payload.invite?.deviceId, deviceId);
  assert.equal(response.payload.invite?.accessLevel, accessLevel);
  assert.ok(String(response.payload.qrPayload || "").includes(response.payload.code));
  return response.payload;
}

async function redeem(token, code, suffix) {
  const idempotencyKey = `${runId}:${suffix}`;
  return requestJson(`${backendUrl}/api/v1/devices/access/redeem`, {
    method: "POST",
    token,
    idempotencyKey,
    body: { code, idempotencyKey },
  });
}

async function revokeInvite(token, inviteId) {
  return requestJson(
    `${backendUrl}/api/v1/devices/${encodeURIComponent(deviceId)}/access-invites/${encodeURIComponent(inviteId)}`,
    { method: "DELETE", token, allowedStatuses: [200, 409] },
  );
}

async function revokeGrant(token, grantId) {
  return requestJson(
    `${backendUrl}/api/v1/devices/${encodeURIComponent(deviceId)}/access-grants/${encodeURIComponent(grantId)}`,
    { method: "DELETE", token, allowedStatuses: [200, 409] },
  );
}

async function main() {
  required(apiKey, "FIREBASE_WEB_API_KEY (or VITE_FIREBASE_API_KEY)");
  required(platformEmail, "SMOKE_PLATFORM_EMAIL");
  required(recipientEmail, "SMOKE_RECIPIENT_EMAIL");
  required(deviceId, "SMOKE_DEVICE_ID");
  assert.notEqual(platformEmail, recipientEmail, "Platform and recipient identities must be different");

  const admin = getFirebaseAdmin();
  assert.ok(admin, "Firebase Admin must be configured for production smoke");
  const platformToken = await firebaseTokenForEmail(admin, platformEmail);
  const recipientToken = await firebaseTokenForEmail(admin, recipientEmail);
  const platform = await backendIdentity(platformToken);
  const recipient = await backendIdentity(recipientToken);
  assert.equal(platform.role, "admin");
  assert.ok((platform.capabilities || []).some((item) => String(item).startsWith("platform.")));
  assert.ok(recipient.id, "Recipient backend identity must exist");
  assert.notEqual(platform.id, recipient.id);

  const cleanup = { inviteIds: new Set(), grantIds: new Set() };
  const evidence = [];
  try {
    const anonymous = await requestJson(`${backendUrl}/api/v1/devices/access/redeem`, {
      method: "POST",
      body: { code: "SHC-INVALID-0000" },
      allowedStatuses: [401],
    });
    assert.equal(anonymous.status, 401);
    evidence.push("anonymous-redeem:401");

    const invalid = await requestJson(`${backendUrl}/api/v1/devices/access/redeem`, {
      method: "POST",
      token: recipientToken,
      body: { code: "SHC-INVALID-0000" },
      allowedStatuses: [400, 403],
    });
    assert.ok([400, 403].includes(invalid.status));
    evidence.push(`invalid-code:${invalid.status}`);

    for (const accessLevel of ["viewer", "manager"]) {
      const created = await createInvite(platformToken, accessLevel, `create:${accessLevel}`);
      cleanup.inviteIds.add(created.invite.id);
      const redeemed = await redeem(recipientToken, created.code, `redeem:${accessLevel}`);
      assert.equal(redeemed.payload.device?.id, deviceId);
      assert.equal(redeemed.payload.grant?.deviceId, deviceId);
      assert.equal(redeemed.payload.grant?.accessLevel, accessLevel);
      assert.equal(redeemed.payload.grant?.status, "active");
      cleanup.grantIds.add(redeemed.payload.grant.id);

      const replay = await redeem(recipientToken, created.code, `replay:${accessLevel}`);
      assert.equal(replay.payload.idempotent, true);
      assert.equal(replay.payload.grant?.id, redeemed.payload.grant.id);
      evidence.push(`${accessLevel}:create-redeem-replay`);

      await revokeGrant(platformToken, redeemed.payload.grant.id);
      cleanup.grantIds.delete(redeemed.payload.grant.id);
    }

    const unused = await createInvite(platformToken, "viewer", "create:unused");
    cleanup.inviteIds.add(unused.invite.id);
    const revoked = await revokeInvite(platformToken, unused.invite.id);
    assert.ok(revoked.payload.invite?.revokedAt);
    cleanup.inviteIds.delete(unused.invite.id);
    evidence.push("unused-invite:revoked");

    const listed = await requestJson(
      `${backendUrl}/api/v1/devices/${encodeURIComponent(deviceId)}/access-invites`,
      { token: platformToken },
    );
    const smokeInviteIds = new Set([...cleanup.inviteIds]);
    const activeSmokeInvites = (listed.payload.invites || []).filter(
      (invite) => smokeInviteIds.has(invite.id) && invite.status === "active",
    );
    const activeSmokeGrants = (listed.payload.grants || []).filter(
      (grant) => cleanup.grantIds.has(grant.id) && grant.status === "active",
    );
    assert.equal(activeSmokeInvites.length, 0);
    assert.equal(activeSmokeGrants.length, 0);
    evidence.push("cleanup:verified");
  } finally {
    for (const grantId of cleanup.grantIds) {
      await revokeGrant(platformToken, grantId).catch(() => undefined);
    }
    for (const inviteId of cleanup.inviteIds) {
      await revokeInvite(platformToken, inviteId).catch(() => undefined);
    }
  }

  console.log(JSON.stringify({
    result: "PASS",
    backendUrl,
    deviceId,
    checks: evidence,
    secretsLogged: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Shcare device access production smoke: FAIL\n${error.message}`);
  process.exitCode = 1;
});
