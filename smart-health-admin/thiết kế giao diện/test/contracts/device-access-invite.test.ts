import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dialogPath = new URL(
  "../../src/components/admin/dialogs/DeviceAccessInviteDialog.tsx",
  import.meta.url,
);
const devicesPath = new URL("../../src/components/admin/Devices.tsx", import.meta.url);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("Platform Admin creates one-time viewer or manager access without widening platform authority", async () => {
  const [dialog, devices] = await Promise.all([
    readFile(dialogPath, "utf8"),
    readFile(devicesPath, "utf8"),
  ]);

  assert.match(dialog, /value:\s*"viewer"/);
  assert.match(dialog, /value:\s*"manager"/);
  assert.match(dialog, /Xem & kết nối Wi-Fi/);
  assert.match(dialog, /không[\s\S]{0,40}cấp quyền quản trị toàn hệ thống/);
  assert.match(devices, /isPlatformAdmin\s*\?\s*\(/);
  assert.match(devices, /Tạo mã\/QR truy cập/);
  assert.match(devices, /open=\{isPlatformAdmin && Boolean\(accessInviteDevice\)\}/);
});

test("access QR uses only the opaque backend payload and raw code is not persisted", async () => {
  const dialog = await readFile(dialogPath, "utf8");

  assert.match(dialog, /<QRCodeSVG[\s\S]*?value=\{created\.qrPayload\}/);
  assert.match(dialog, /data-testid="device-access-code"[\s\S]*?\{created\.code\}/);
  assert.match(dialog, /navigator\.clipboard\.writeText\(created\.code\)/);
  assert.match(dialog, /downloadQr/);
  assert.doesNotMatch(dialog, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(dialog, /value=\{(?:device\?\.)?id\}/);
});

test("creation is retry-safe and revoke controls cover both unused codes and active grants", async () => {
  const [dialog, api] = await Promise.all([
    readFile(dialogPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(dialog, /const stableKey = idempotencyKey \|\| crypto\.randomUUID\(\)/);
  assert.match(dialog, /createDeviceAccessInvite\([\s\S]*?stableKey/);
  assert.match(api, /createDeviceAccessInvite[\s\S]*?"Idempotency-Key": idempotencyKey/);
  assert.match(api, /\/access-invites\/\$\{encodeURIComponent\(inviteId\)\}/);
  assert.match(api, /\/access-grants\/\$\{encodeURIComponent\(grantId\)\}/);
  assert.match(dialog, /revokeDeviceAccessInvite/);
  assert.match(dialog, /revokeDeviceAccessGrant/);
});

test("access-code dialog preserves keyboard, reduced-motion and minimum target contracts", async () => {
  const dialog = await readFile(dialogPath, "utf8");

  assert.match(dialog, /<Dialog\.Title/);
  assert.match(dialog, /<Dialog\.Description/);
  assert.match(dialog, /aria-live="polite"/);
  assert.match(dialog, /role="alert"/);
  assert.match(dialog, /min-h-11|min-h-12/);
  assert.match(dialog, /motion-reduce:/);
  assert.match(dialog, /focus-visible:ring-2/);
});
