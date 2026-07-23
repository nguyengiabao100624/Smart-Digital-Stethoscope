import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const actionsPath = new URL("../../src/components/admin/AdminActions.tsx", import.meta.url);
const settingsPath = new URL("../../src/components/admin/Settings.tsx", import.meta.url);
const localOnlyNotificationDialogPath = new URL(
  "../../src/components/admin/dialogs/NotificationSettingsDialog.tsx",
  import.meta.url,
);

test("routes notification settings to the canonical persisted settings surface", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /useNavigate/);
  assert.match(source, /action\.id\s*===\s*["']notification-settings["']/);
  assert.match(source, /navigate\(["']\/settings\?section=notifications["']\)/);
  assert.doesNotMatch(source, /NotificationSettingsDialog/);

  const settingsSource = await readFile(settingsPath, "utf8");
  assert.match(settingsSource, /useLocation/);
  assert.match(settingsSource, /location\.search/);
  assert.match(settingsSource, /defaultValue=\{initialTab\}/);
});

test("removes the local-only success dialog and unsupported blanket claims", async () => {
  await assert.rejects(access(localOnlyNotificationDialogPath));

  const source = await readFile(actionsPath, "utf8");
  assert.doesNotMatch(source, /Lưu cài đặt thành công/);
  assert.doesNotMatch(source, /Tất cả dữ liệu đều được mã hóa và bảo mật/);
  assert.doesNotMatch(source, /Bạn có thể xuất dữ liệu bất cứ lúc nào/);
  assert.match(source, /Khả năng xuất dữ liệu phụ thuộc vào quyền/);
});
