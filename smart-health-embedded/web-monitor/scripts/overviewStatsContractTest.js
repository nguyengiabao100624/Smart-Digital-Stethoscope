const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildOverviewRangeSnapshot,
  normalizeOverviewRange,
  normalizeTimezoneOffsetMinutes,
} = require("../src/overviewStatsContract");

const now = new Date("2026-07-23T10:30:00.000Z");
const timezoneOffsetMinutes = 420;

test("today buckets are built from real scan timestamps in the requested timezone", () => {
  const snapshot = buildOverviewRangeSnapshot(
    [
      { id: "midnight", createdAt: "2026-07-22T17:15:00.000Z" },
      { id: "morning", startedAt: "2026-07-23T01:30:00.000Z" },
      { id: "afternoon", createdAt: "2026-07-23T09:00:00.000Z" },
      { id: "tomorrow", createdAt: "2026-07-23T18:00:00.000Z" },
      { id: "invalid", createdAt: "not-a-date" },
    ],
    { range: "today", timezoneOffsetMinutes, now },
  );

  assert.equal(snapshot.range.startAt, "2026-07-22T17:00:00.000Z");
  assert.equal(snapshot.range.endAt, now.toISOString());
  assert.equal(snapshot.range.bucket, "4h");
  assert.deepEqual(
    snapshot.measureData.map((point) => point.count),
    [1, 0, 1, 0, 1],
  );
  assert.equal(snapshot.measureData.reduce((sum, point) => sum + point.count, 0), 3);
  assert.deepEqual(snapshot.scans.map((scan) => scan.id), ["midnight", "morning", "afternoon"]);
});

test("seven-day buckets include the exact local boundary and exclude older scans", () => {
  const snapshot = buildOverviewRangeSnapshot(
    [
      { id: "boundary", createdAt: "2026-07-16T17:00:00.000Z" },
      { id: "too-old", createdAt: "2026-07-16T16:59:59.999Z" },
      { id: "today", createdAt: "2026-07-23T10:00:00.000Z" },
    ],
    { range: "7d", timezoneOffsetMinutes, now },
  );

  assert.equal(snapshot.measureData.length, 7);
  assert.equal(snapshot.measureData[0].day, "2026-07-17");
  assert.equal(snapshot.measureData[6].day, "2026-07-23");
  assert.deepEqual(snapshot.measureData.map((point) => point.count), [1, 0, 0, 0, 0, 0, 1]);
});

test("thirty-day output is zero-filled without inventing scans", () => {
  const snapshot = buildOverviewRangeSnapshot([], {
    range: "30d",
    timezoneOffsetMinutes,
    now,
  });
  assert.equal(snapshot.measureData.length, 30);
  assert.equal(snapshot.measureData.every((point) => point.count === 0), true);
  assert.equal(snapshot.scans.length, 0);
});

test("invalid range and timezone values fail closed", () => {
  assert.throws(() => normalizeOverviewRange("90d"), { code: "OVERVIEW_RANGE_INVALID" });
  assert.throws(() => normalizeTimezoneOffsetMinutes("7.5"), {
    code: "OVERVIEW_TIMEZONE_INVALID",
  });
  assert.throws(() => normalizeTimezoneOffsetMinutes(900), {
    code: "OVERVIEW_TIMEZONE_INVALID",
  });
});
