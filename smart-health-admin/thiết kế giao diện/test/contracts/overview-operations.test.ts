import assert from "node:assert/strict";
import test from "node:test";
import { parseOverviewStatsResponse } from "../../src/lib/overview-operations.ts";

const response = {
  generatedAt: "2026-07-23T10:30:00.000Z",
  range: {
    key: "today",
    label: "Hôm nay",
    startAt: "2026-07-22T17:00:00.000Z",
    endAt: "2026-07-23T10:30:00.000Z",
    timezoneOffsetMinutes: 420,
    bucket: "4h",
  },
  stats: {
    clinics: 2,
    workspaces: 2,
    patientsCount: 8,
    pendingDoctors: 1,
    devicesOnline: 3,
    scansCount: 3,
    aiJobsFailed: 1,
    storageBytes: 2048,
    storageUsed: "do-not-trust-presentation-copy",
  },
  measureData: [
    { time: "00:00", count: 1 },
    { time: "04:00", count: 0 },
    { time: "08:00", count: 2 },
  ],
  deviceData: [
    { key: "online", name: "server label", value: 3, color: "#fff" },
    { key: "offline", name: "server label", value: 2, color: "#fff" },
  ],
  aiJobData: [
    { key: "processing", name: "server label", value: 1, color: "#fff" },
    { key: "completed", name: "server label", value: 1, color: "#fff" },
    { key: "failed", name: "server label", value: 1, color: "#fff" },
    { key: "pending", name: "server label", value: 0, color: "#fff" },
  ],
};

test("parses a range-scoped overview and owns presentation tokens on the client", () => {
  const parsed = parseOverviewStatsResponse(response, "today");
  assert.equal(parsed.stats.storageUsed, "2 KB");
  assert.equal(parsed.deviceData[0].name, "Đang hoạt động");
  assert.equal(parsed.deviceData[0].color, "var(--success)");
  assert.equal(
    parsed.measureData.reduce((sum, point) => sum + Number(point.count), 0),
    3,
  );
});

test("rejects a response for a different range", () => {
  assert.throws(() => parseOverviewStatsResponse(response, "7d"), /range\.key/);
});

test("rejects synthetic chart totals that do not match the real KPI", () => {
  assert.throws(
    () =>
      parseOverviewStatsResponse(
        { ...response, measureData: [{ time: "00:00", count: 99 }] },
        "today",
      ),
    /measureData không khớp/,
  );
});

test("rejects missing device or AI lifecycle states", () => {
  assert.throws(
    () =>
      parseOverviewStatsResponse(
        { ...response, deviceData: response.deviceData.slice(0, 1) },
        "today",
      ),
    /thiếu trạng thái/,
  );
  assert.throws(
    () =>
      parseOverviewStatsResponse(
        { ...response, aiJobData: response.aiJobData.slice(0, 3) },
        "today",
      ),
    /thiếu trạng thái/,
  );
});
