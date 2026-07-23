import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsPath = new URL("../../src/components/admin/Settings.tsx", import.meta.url);

test("fails closed instead of rendering seeded settings after a load error", async () => {
  const source = await readFile(settingsPath, "utf8");

  assert.match(source, /const \[loadError, setLoadError\]/);
  assert.match(source, /if \(loadError\)/);
  assert.match(source, /onClick=\{\(\) => void loadSettings\(\)\}/);
  assert.match(source, /Không thể tải cài đặt vận hành/);
});

test("only persists settings that have an implemented backend effect", async () => {
  const source = await readFile(settingsPath, "utf8");
  const buildPayload = source.match(
    /function buildPayload\([\s\S]*?\n}\n\nexport function Settings/,
  )?.[0];

  assert.ok(buildPayload, "buildPayload helper must remain inspectable");
  assert.match(buildPayload, /system:/);
  assert.match(buildPayload, /branding:/);
  assert.match(buildPayload, /outbound:[\s\S]*webhook:[\s\S]*url:/);
  assert.doesNotMatch(buildPayload, /notifications:/);
  assert.doesNotMatch(buildPayload, /storage:/);
  assert.doesNotMatch(buildPayload, /stethoscope:/);
  assert.doesNotMatch(buildPayload, /securityPolicy:/);
  assert.doesNotMatch(buildPayload, /privacy:/);
});

test("removes unsupported operational controls and fake success paths", async () => {
  const source = await readFile(settingsPath, "utf8");

  assert.doesNotMatch(
    source,
    /smartHealthApi\.(?:runBackupCheck|createApiKey|rotateApiKey|revokeApiKey)/,
  );
  assert.doesNotMatch(source, /Bật backup metadata và file quan trọng theo lịch backend/);
  assert.doesNotMatch(source, /Áp dụng noise cancellation khi thu âm/);
  assert.doesNotMatch(source, /Áp dụng cho luồng đổi mật khẩu backend/);
  assert.doesNotMatch(source, /Cho phép backend tạo notification in-app/);
  assert.match(source, /Chưa có hợp đồng thực thi/);
  assert.match(source, /không lưu/);
});

test("persists only the webhook URL before running a real outbound test", async () => {
  const source = await readFile(settingsPath, "utf8");

  assert.match(
    source,
    /smartHealthApi\.updateSettings\(\{\s*outbound:\s*\{\s*webhook:\s*\{\s*url:/,
  );
  assert.doesNotMatch(
    source,
    /smartHealthApi\.updateSettings\(\{\s*outbound:\s*settings\.outbound/,
  );
});
