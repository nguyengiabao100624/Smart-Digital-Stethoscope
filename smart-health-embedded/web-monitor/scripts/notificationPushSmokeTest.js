const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const port = 3466;

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
      DATA_DIR: `.test-data/notification-push-${Date.now()}`,
      AUTH_MODE: "demo",
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
      }),
    });
    assert.equal(registered.response.status, 200, JSON.stringify(registered.body));
    assert.equal(registered.body.device.enabled, true);

    const before = await request("/api/v1/notifications", { headers: authHeaders });
    assert.equal(before.response.status, 200, JSON.stringify(before.body));
    const existingNotificationIds = new Set(
      (before.body.notifications || []).map((notification) => notification.id),
    );

    const changedPassword = await request("/api/v1/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        currentPassword: "12345678",
        newPassword: "87654321",
      }),
    });
    assert.equal(changedPassword.response.status, 200, JSON.stringify(changedPassword.body));

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
  });
  console.log("notification push smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
