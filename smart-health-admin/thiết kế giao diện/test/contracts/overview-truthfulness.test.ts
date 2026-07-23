import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const overviewPath = new URL("../../src/components/admin/Overview.tsx", import.meta.url);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("overview does not turn load failures into fake zero data", async () => {
  const source = await readFile(overviewPath, "utf8");
  assert.doesNotMatch(source, /DEFAULT_OVERVIEW_DATA/);
  assert.doesNotMatch(source, /statsData\s*\|\|/);
  assert.match(source, /parseOverviewStatsResponse/);
  assert.match(source, /Không thể tải dữ liệu tổng quan/);
  assert.match(source, /Đang hiển thị dữ liệu đã tải trước đó/);
});

test("time range is sent to the backend instead of being a dead select", async () => {
  const [source, api] = await Promise.all([
    readFile(overviewPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);
  assert.match(source, /value=\{selectedRange\}/);
  assert.match(source, /setSelectedRange/);
  assert.match(source, /timezoneOffsetMinutes/);
  assert.match(api, /query:\s*\{\s*range,\s*timezoneOffsetMinutes\s*\}/);
});

test("overview removes fabricated trends and synthetic recent-alert timeline", async () => {
  const source = await readFile(overviewPath, "utf8");
  assert.doesNotMatch(source, /trend=["']\+1["']/);
  assert.doesNotMatch(source, /Cảnh báo gần đây/);
  assert.doesNotMatch(source, /Math\.max\(7,/);
  assert.match(source, /Tín hiệu vận hành/);
});
