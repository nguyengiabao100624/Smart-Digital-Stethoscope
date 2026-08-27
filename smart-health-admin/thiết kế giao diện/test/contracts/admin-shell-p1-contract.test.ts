import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(testRoot, "..", "..");
const repositoryRoot = path.resolve(adminRoot, "..", "..");

function readAdmin(relativePath: string) {
  return fs.readFileSync(path.join(adminRoot, relativePath), "utf8");
}

function readRepository(relativePath: string) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("serializes top-bar notification acknowledgements per notification", () => {
  const layout = readAdmin("src/components/admin/Layout.tsx");

  assert.match(layout, /pendingNotificationIds/);
  assert.match(layout, /pendingNotificationIdsRef/);
  assert.match(layout, /pendingNotificationIdsRef\.current\.has\(notificationId\)/);
  assert.match(layout, /confirmedReadNotificationIdsRef/);
  assert.match(layout, /disabled=\{isNotificationPending\}/);
  assert.match(layout, /aria-busy=\{isNotificationPending/);

  const acknowledgement =
    layout.match(
      /const openTopNotification = async \(item: NotificationItem\) => \{[\s\S]*?\n[ ]{2}\};/,
    )?.[0] || "";
  assert.match(acknowledgement, /await smartHealthApi\.markNotificationRead/);
  assert.ok(
    acknowledgement.indexOf("await smartHealthApi.markNotificationRead") <
      acknowledgement.indexOf("setUnreadNotificationCount"),
    "the unread count must only change after the backend acknowledgement",
  );
  assert.match(acknowledgement, /confirmedReadNotificationIdsRef\.current\.has/);
  assert.match(acknowledgement, /finally/);
});

test("announces authentication server errors and associates them with retry fields", () => {
  const login = readAdmin("src/components/admin/Login.tsx");
  const forgotPassword = readAdmin("src/components/admin/ForgotPassword.tsx");

  for (const source of [login, forgotPassword]) {
    assert.match(source, /role="alert"/);
    assert.match(source, /aria-live="assertive"/);
    assert.match(source, /aria-invalid=\{Boolean\(error\)\}/);
    assert.match(source, /aria-describedby=\{error \?/);
    assert.match(source, /\.current\?\.focus\(\)/);
  }
});

test("uses Shcare defaults and only migrates exact legacy default branding", () => {
  const server = readRepository("smart-health-embedded/web-monitor/server.js");

  assert.match(server, /const LEGACY_DEFAULT_PLATFORM_NAME = "Smart Health B2B Platform";/);
  assert.match(server, /const DEFAULT_PLATFORM_NAME = "Shcare";/);
  assert.match(server, /const LEGACY_DEFAULT_DOCTOR_NAME = "Bác sĩ Smart Health";/);
  assert.match(server, /const DEFAULT_DOCTOR_NAME = "Bác sĩ Shcare";/);
  assert.match(server, /name:\s*DEFAULT_PLATFORM_NAME/);
  assert.match(server, /name:\s*DEFAULT_DOCTOR_NAME/);
  assert.match(
    server,
    /db\.settings\?\.system\?\.name === LEGACY_DEFAULT_PLATFORM_NAME[\s\S]*DEFAULT_PLATFORM_NAME/,
  );
  assert.match(server, /user\?\.name === LEGACY_DEFAULT_DOCTOR_NAME[\s\S]*DEFAULT_DOCTOR_NAME/);
});

test("keeps the keyboard skip link at the Admin minimum interaction target", () => {
  const layout = readAdmin("src/components/admin/Layout.tsx");
  const skipLink = layout.match(/<a[\s\S]*?href="#admin-main-content"[\s\S]*?<\/a>/)?.[0] || "";

  assert.match(skipLink, /Bỏ qua điều hướng/);
  assert.match(skipLink, /min-h-11/);
  assert.match(skipLink, /min-w-11/);
  assert.match(skipLink, /focus:not-sr-only/);
});
