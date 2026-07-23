import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsPath = new URL("../../src/components/admin/Settings.tsx", import.meta.url);
const measurementsPath = new URL("../../src/components/admin/AIMeasurements.tsx", import.meta.url);
const routeContractPath = new URL("../../src/contracts/admin-route-contract.ts", import.meta.url);
const overviewPath = new URL("../../src/components/admin/Overview.tsx", import.meta.url);
const accountSettingsPath = new URL(
  "../../src/components/admin/AccountSettings.tsx",
  import.meta.url,
);

test("renders AI settings as read-only signal-quality runtime truth", async () => {
  const source = await readFile(settingsPath, "utf8");

  assert.match(source, /runtime\.ai\.scanAnalysis\.available/);
  assert.match(source, /runtime\.ai\.chatProvider\.available/);
  assert.match(source, /runtime\.ai\.scanAnalysis\.analyzerVersion/);
  assert.match(source, /Chỉ kiểm tra chất lượng tín hiệu/);
  assert.match(source, /Không phát hiện bệnh/);
  assert.match(source, /Cập nhật mô hình lâm sàng/);
  assert.match(source, /Không hỗ trợ/);

  assert.doesNotMatch(source, /AI Medical Analysis/);
  assert.doesNotMatch(source, /signal_quality_rules_v1/);
  assert.doesNotMatch(source, /options=\{\["fast",\s*"balanced",\s*"high_accuracy"\]\}/);
  assert.doesNotMatch(source, /Độ tin cậy tối thiểu/);
  assert.doesNotMatch(source, /Timeout AI job/);
  assert.doesNotMatch(source, /smartHealthApi\.checkAiModelUpdate/);
  assert.doesNotMatch(source, /smartHealthApi\.updateAiModel/);
});

test("excludes read-only AI status from the settings mutation payload", async () => {
  const source = await readFile(settingsPath, "utf8");
  const buildPayload = source.match(
    /function buildPayload\([\s\S]*?\n}\n\nexport function Settings/,
  )?.[0];

  assert.ok(buildPayload, "buildPayload helper must remain inspectable");
  assert.match(buildPayload, /system:/);
  assert.match(buildPayload, /branding:/);
  assert.doesNotMatch(buildPayload, /\bai:/);
  assert.doesNotMatch(buildPayload, /\.\.\.settings,/);
});

test("uses signal-quality copy instead of claiming clinical AI output", async () => {
  const source = await readFile(measurementsPath, "utf8");

  assert.match(source, /Lượt đo và chất lượng tín hiệu/);
  assert.match(source, /Kết quả phân tích chất lượng tín hiệu/);
  assert.match(source, /Phân tích lại tín hiệu/);
  assert.match(source, /không phải chẩn đoán/);

  assert.doesNotMatch(source, />\s*Lượt đo và AI\s*</);
  assert.doesNotMatch(source, />\s*Kết quả AI\s*</);
  assert.doesNotMatch(source, />\s*Chạy lại AI\s*</);
  assert.doesNotMatch(source, /Backend đã hoàn tất xử lý lại AI/);
});

test("keeps navigation, overview, and preferences on the same truthful terminology", async () => {
  const [routes, overview, account] = await Promise.all([
    readFile(routeContractPath, "utf8"),
    readFile(overviewPath, "utf8"),
    readFile(accountSettingsPath, "utf8"),
  ]);

  assert.match(routes, /Lượt đo và chất lượng tín hiệu/);
  assert.doesNotMatch(routes, /title:\s*["']Lượt đo và AI["']/);
  assert.doesNotMatch(routes, /label:\s*["']Lượt đo & AI["']/);
  assert.match(overview, /Phân tích tín hiệu thất bại/);
  assert.doesNotMatch(overview, /AI [Jj]ob thất bại|Trạng thái AI job/);
  assert.match(account, /Cảnh báo kết quả cần xem xét/);
  assert.doesNotMatch(account, /Cảnh báo AI bất thường/);
});
