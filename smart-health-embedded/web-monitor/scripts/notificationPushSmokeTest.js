const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const port = 3466;
const dataDir = path.join(rootDir, ".test-data", `notification-push-${Date.now()}`);

function assertPushDispatchFailureIsolation() {
  const serverSource = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");
  const queueStart = serverSource.indexOf("function queueNotificationPush(notification)");
  const queueEnd = serverSource.indexOf("function buildOutboundWebhookPayload", queueStart);
  assert.ok(queueStart >= 0 && queueEnd > queueStart, "push dispatcher source must be present");
  const queueSource = serverSource.slice(queueStart, queueEnd);
  assert.match(
    queueSource,
    /saveNotificationPushStatus\([\s\S]+?\)\.catch\(/,
    "a failed delivery-status write must be contained instead of crashing the backend",
  );
  assert.equal(
    (serverSource.match(/createNotification\(/g) || []).length,
    2,
    "SQL-capable routes must persist notifications before queuing delivery",
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error("notification push smoke backend did not start");
}

async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { text };
    }
  }
  return { response, body };
}

async function withServer(fn) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      AUDIO_UDP_PORT: "3467",
      DATA_BACKEND: "json",
      DATA_DIR: dataDir,
      AUTH_MODE: "demo",
      PASSWORD_IDEMPOTENCY_HMAC_KEY:
        "notification-push-test-password-idempotency-key",
      FIREBASE_AUTH_ENABLED: "false",
      PUSH_NOTIFICATIONS_ENABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth();
    await fn();
  } finally {
    child.kill("SIGTERM");
    await delay(300);
    if (!child.killed && stderr) {
      console.error(stderr);
    }
  }
}

async function main() {
  assertPushDispatchFailureIsolation();
  await withServer(async () => {
    const login = await request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: "patient@example.com", password: "12345678" }),
    });
    assert.equal(login.response.status, 200, JSON.stringify(login.body));
    const token = login.body.token;
    const userId = login.body.user.id;
    const authHeaders = { Authorization: `Bearer ${token}` };

    const registered = await request("/api/v1/notifications/register-device", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        platform: "android",
        fcmToken: `fake-fcm-token-${Date.now()}`,
        notificationProtocolVersion: 2,
        appVersion: "1.0.0-rc.2",
      }),
    });
    assert.equal(registered.response.status, 200, JSON.stringify(registered.body));
    assert.equal(registered.body.device.enabled, true);
    assert.equal(registered.body.device.userId, userId);
    assert.equal(registered.body.device.workspaceId, login.body.user.currentWorkspaceId);
    assert.ok(registered.body.device.authSessionId);
    assert.equal(registered.body.device.notificationProtocolVersion, 2);
    assert.equal(registered.body.device.appVersion, "1.0.0-rc.2");

    const before = await request("/api/v1/notifications", { headers: authHeaders });
    assert.equal(before.response.status, 200, JSON.stringify(before.body));
    const existingNotificationIds = new Set(
      (before.body.notifications || []).map((notification) => notification.id),
    );

    const changedPassword = await request("/api/v1/me/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-push-password-one",
        ...authHeaders,
      },
      body: JSON.stringify({
        currentPassword: "12345678",
        newPassword: "PatientPush987",
      }),
    });
    assert.equal(changedPassword.response.status, 200, JSON.stringify(changedPassword.body));
    assert.equal(changedPassword.body.ok, true);
    assert.equal(changedPassword.body.user.id, userId);
    assert.equal(changedPassword.body.provider, "demo");
    assert.ok(changedPassword.body.operationId);
    assert.equal(changedPassword.body.replayed, false);

    let notification = null;
    const deadline = Date.now() + 4000;
    while (
      Date.now() < deadline &&
      (!notification || !notification.pushStatus || notification.pushStatus === "ready")
    ) {
      await delay(200);
      const listed = await request("/api/v1/notifications", { headers: authHeaders });
      assert.equal(listed.response.status, 200, JSON.stringify(listed.body));
      notification =
        listed.body.notifications.find(
          (item) => item.userId === userId && !existingNotificationIds.has(item.id),
        ) || notification;
    }

    assert.ok(notification, "password change should create a direct notification for the user");
    assert.equal(notification.pushStatus, "skipped");
    assert.match(notification.pushErrorMessage || "", /Firebase Admin messaging is not configured/);
    assert.ok(Array.isArray(notification.pushAttempts), "notification should include push attempt history");
    assert.equal(notification.pushAttempts.length, 1);
    assert.equal(notification.pushAttempts[0].status, "skipped");
    assert.equal(notification.pushAttempts[0].provider, "fcm");
    assert.equal(notification.pushAttempts[0].tokenHash, "");
    assert.equal(notification.pushAttempts[0].retryable, false);
    assert.match(notification.pushAttempts[0].errorMessage || "", /Firebase Admin messaging is not configured/);

    const disabledPreferences = await request("/api/v1/me/notification-preferences", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-push-smoke-disable",
        ...authHeaders,
      },
      body: JSON.stringify({ key: "enabled", enabled: false }),
    });
    assert.equal(disabledPreferences.response.status, 200, JSON.stringify(disabledPreferences.body));
    assert.equal(disabledPreferences.body.preferences.enabled, false);

    const secondPasswordChange = await request("/api/v1/me/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-push-password-two",
        ...authHeaders,
      },
      body: JSON.stringify({
        currentPassword: "PatientPush987",
        newPassword: "PatientOrigin123",
      }),
    });
    assert.equal(secondPasswordChange.response.status, 200, JSON.stringify(secondPasswordChange.body));
    await delay(300);

    const afterDisabled = await request("/api/v1/notifications", { headers: authHeaders });
    assert.equal(afterDisabled.response.status, 200, JSON.stringify(afterDisabled.body));
    assert.equal(
      afterDisabled.body.notifications.filter(
        (item) => item.userId === userId && item.id !== notification.id && !existingNotificationIds.has(item.id),
      ).length,
      0,
      "preference-suppressed in-app rows must not appear in the authenticated inbox",
    );

    const persistedDb = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
    const suppressed = persistedDb.notifications.find(
      (item) =>
        item.userId === userId &&
        item.id !== notification.id &&
        !existingNotificationIds.has(item.id),
    );
    assert.ok(suppressed, "suppressed delivery state must remain available for operational evidence");
    assert.equal(suppressed.inAppStatus, "skipped");
    assert.equal(suppressed.pushStatus, "skipped");
    assert.equal(suppressed.pushErrorMessage, "NOTIFICATION_PREFERENCES_DISABLED");
    assert.deepEqual(suppressed.pushAttempts || [], []);
  });
  console.log("notification push smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
