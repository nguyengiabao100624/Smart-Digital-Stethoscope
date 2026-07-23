import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatSmartHealthAiConfidence,
  normalizeSmartHealthAiConfidence,
  normalizeSmartHealthScanLifecycleStatus,
} from "../../src/lib/scan-lifecycle.ts";

const aiMeasurementsPath = new URL(
  "../../src/components/admin/AIMeasurements.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);
const permissionsPath = new URL(
  "../../src/components/admin/action-permissions.ts",
  import.meta.url,
);

test("maps only the canonical scan lifecycle and never promotes unknown states", () => {
  for (const status of [
    "created",
    "uploading",
    "queued",
    "processing",
    "completed",
    "failed",
    "needs_review",
  ] as const) {
    assert.equal(normalizeSmartHealthScanLifecycleStatus(status), status);
  }

  for (const value of [undefined, null, "", "recording", "error", "done", "COMPLETED"]) {
    assert.equal(normalizeSmartHealthScanLifecycleStatus(value), "unknown");
  }
});

test("keeps zero confidence visible and rejects invalid confidence values", () => {
  assert.equal(normalizeSmartHealthAiConfidence(0), 0);
  assert.equal(formatSmartHealthAiConfidence(0), "0%");
  assert.equal(normalizeSmartHealthAiConfidence(0.825), 83);
  assert.equal(normalizeSmartHealthAiConfidence(82.5), 83);
  assert.equal(normalizeSmartHealthAiConfidence(null), null);
  assert.equal(normalizeSmartHealthAiConfidence("0"), null);
  assert.equal(normalizeSmartHealthAiConfidence(-1), null);
  assert.equal(normalizeSmartHealthAiConfidence(101), null);
});

test("renders only backend-confirmed AI, audio, and measurement fields", async () => {
  const source = await readFile(aiMeasurementsPath, "utf8");

  assert.doesNotMatch(source, /Signal Quality Demo|Backend Smart Health/);
  assert.doesNotMatch(source, /WaveformPreview|<Timeline|clipCount/);
  assert.doesNotMatch(source, /scan\.audioUrl\s*\|\|\s*`\/api\/scans/);
  assert.doesNotMatch(source, /audio\.wav/);
  assert.match(source, /scan\.audioUrl/);
  assert.match(source, /formatSmartHealthAiConfidence/);
});

test("keeps scan mutations hidden and guarded for view-only users", async () => {
  const [source, permissions] = await Promise.all([
    readFile(aiMeasurementsPath, "utf8"),
    readFile(permissionsPath, "utf8"),
  ]);

  assert.match(permissions, /SCAN_MANAGE_CAPABILITIES/);
  assert.match(permissions, /platform\.scans\.manage/);
  assert.match(permissions, /workspace\.scans\.manage/);
  assert.match(source, /const canManageScans\s*=\s*accessCheckComplete\s*&&\s*hasAnyCapability/);
  assert.match(source, /if\s*\(\s*!selectedScan\s*\|\|\s*!canManageScans/);
  assert.match(source, /\{canManageScans\s*&&/);
});

test("forwards one stable idempotency key for a retryable AI reprocess intent", async () => {
  const [source, apiSource] = await Promise.all([
    readFile(aiMeasurementsPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(source, /reprocessIdempotencyKeysRef/);
  assert.match(source, /smartHealthApi\.reprocessScanAi\(selectedScan\.id,\s*idempotencyKey\)/);
  assert.match(
    apiSource,
    /async\s+reprocessScanAi\(scanId:\s*string,\s*idempotencyKey:\s*string\)/,
  );
  assert.match(
    apiSource,
    /reprocessScanAi[\s\S]*?headers:\s*\{\s*["']Idempotency-Key["']:\s*idempotencyKey\s*\}/,
  );
});

test("uses accessible tabs, search, modal detail, and explicit failure states", async () => {
  const source = await readFile(aiMeasurementsPath, "utf8");

  assert.match(source, /<Tabs/);
  assert.match(source, /<TabsList/);
  assert.match(source, /<TabsTrigger/);
  assert.match(source, /<Dialog/);
  assert.match(source, /<DialogTitle/);
  assert.match(source, /htmlFor="scan-search"/);
  assert.match(source, /id="scan-search"/);
  assert.match(source, /min-h-11/);
  assert.match(source, /motion-reduce:/);
  assert.match(source, /offline|Ngoại tuyến|ngoại tuyến/);
  assert.match(source, /forbidden|403|không có quyền/i);
  assert.match(source, /Thử lại/);
});
