import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dialogPath = new URL(
  "../../src/components/admin/dialogs/NotificationDetailDialog.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);
const layoutPath = new URL("../../src/components/admin/Layout.tsx", import.meta.url);
const notificationsPath = new URL("../../src/components/admin/Notifications.tsx", import.meta.url);

test("never renders seeded notification, model, accuracy, or report details", async () => {
  const source = await readFile(dialogPath, "utf8");

  for (const fakeValue of [
    "Respiratory AI v1.8.0",
    "94%",
    "89/89",
    "Stetho-X1",
    "BS. Nguyễn Văn Tùng",
    "12,845",
    "1.24 tỷ",
  ]) {
    assert.doesNotMatch(source, new RegExp(fakeValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(source, /const\s+META\s*(?::|=)|exportPDF|buildFilename|toast\.success/);
  assert.doesNotMatch(source, /typeof notification\.id === "number"/);
});

test("renders only safe primitive fields from the real notification contract", async () => {
  const [dialog, api, layout, notifications] = await Promise.all([
    readFile(dialogPath, "utf8"),
    readFile(apiPath, "utf8"),
    readFile(layoutPath, "utf8"),
    readFile(notificationsPath, "utf8"),
  ]);

  assert.match(
    api,
    /export type SmartHealthNotification[\s\S]*?metadata\?:\s*Record<string, unknown>/,
  );
  assert.match(dialog, /metadata\?:\s*Record<string, unknown>/);
  assert.match(dialog, /buildNotificationDetailRows\(notification\)/);
  assert.match(dialog, /Object\.entries\(notification\.metadata/);
  assert.match(dialog, /isSafeMetadataKey/);
  assert.match(dialog, /typeof value === "string"/);
  assert.match(dialog, /typeof value === "number" \|\| typeof value === "boolean"/);
  assert.match(layout, /metadata:\s*notification\.metadata/);
  assert.match(notifications, /metadata:\s*notification\.metadata/);
});

test("enables only a backend-provided action path that resolves on the current surface", async () => {
  const source = await readFile(dialogPath, "utf8");

  assert.match(source, /safeNotificationActionPath/);
  assert.match(source, /notification\.metadata\?\.actionPath/);
  assert.match(source, /findAdminRouteContract\(WEB_SURFACE, actionPath\)/);
  assert.match(source, /disabled=\{true\}/);
  assert.match(source, /Backend không cung cấp thao tác/);
  assert.doesNotMatch(source, /normalizedTitle\.includes|isDoctorApprovalNotice/);
});
