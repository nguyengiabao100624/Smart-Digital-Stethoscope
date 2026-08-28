import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const notificationsPath = new URL("../../src/components/admin/Notifications.tsx", import.meta.url);
const composerPath = new URL(
  "../../src/components/admin/NotificationComposer.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("notification settings opens the canonical persisted settings section", async () => {
  const source = await readFile(notificationsPath, "utf8");

  assert.match(source, /useNavigate/);
  assert.match(source, /navigate\(["']\/settings\?section=notifications["']\)/);
});

test("notification composer uses backend audience and provider options without fake recipients", async () => {
  const [source, api] = await Promise.all([
    readFile(composerPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.doesNotMatch(source, /Phòng khám Đa khoa Tâm Anh/);
  assert.doesNotMatch(source, /Tất cả admin phòng khám/);
  assert.doesNotMatch(source, /Một bác sĩ cụ thể/);
  assert.match(source, /getNotificationOptions/);
  assert.match(source, /workspace/);
  assert.match(source, /role/);
  assert.match(source, /users/);
  assert.match(source, /in_app/);
  assert.match(source, /email/);
  assert.match(source, /push/);
  assert.match(source, /availability\.available/);
  assert.match(source, /emailEligible/);
  assert.match(source, /Người nhận của chiến dịch/);
  assert.match(source, /Provider:/);
  assert.match(api, /\/notifications\/options/);
  assert.match(api, /refreshNotificationCampaign/);
});

test("campaign mutation keeps a stable attempt and validates the exact receipt before success", async () => {
  const source = await readFile(composerPath, "utf8");

  assert.match(source, /resolveNotificationCampaignAttempt\(attempt, intent\)/);
  assert.match(source, /nextAttempt\.idempotencyKey/);
  assert.match(source, /submitLockRef\.current/);
  assert.match(source, /parseNotificationCampaignReceipt\(response, intent\)/);
  assert.match(source, /refreshNotificationCampaign/);
  assert.match(source, /Backend chỉ báo đã gửi sau khi provider xác nhận/);
  assert.doesNotMatch(source, /toast\.success\(["']Đã gửi/);
});

test("single read mutation rolls back and reports backend failure", async () => {
  const source = await readFile(notificationsPath, "utf8");

  assert.match(source, /Không thể đánh dấu thông báo là đã đọc/);
  assert.match(source, /setItems\(\(current\)\s*=>/);
  assert.doesNotMatch(source, /markNotificationRead\([\s\S]*?\.catch\(\(\)\s*=>\s*undefined\)/);
});
