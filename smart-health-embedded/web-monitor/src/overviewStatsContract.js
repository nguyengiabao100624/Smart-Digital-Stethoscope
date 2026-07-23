const OVERVIEW_RANGE_KEYS = Object.freeze(["today", "7d", "30d"]);
const MIN_TIMEZONE_OFFSET_MINUTES = -12 * 60;
const MAX_TIMEZONE_OFFSET_MINUTES = 14 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const RANGE_CONFIG = Object.freeze({
  today: Object.freeze({ label: "Hôm nay", days: 1, bucket: "4h" }),
  "7d": Object.freeze({ label: "7 ngày qua", days: 7, bucket: "day" }),
  "30d": Object.freeze({ label: "30 ngày qua", days: 30, bucket: "day" }),
});

function contractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeOverviewRange(value) {
  const normalized = String(value || "today").trim().toLowerCase();
  if (!OVERVIEW_RANGE_KEYS.includes(normalized)) {
    throw contractError(
      "OVERVIEW_RANGE_INVALID",
      `Khoảng thời gian phải là một trong: ${OVERVIEW_RANGE_KEYS.join(", ")}`,
    );
  }
  return normalized;
}

function normalizeTimezoneOffsetMinutes(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const offset = Number(value);
  if (
    !Number.isInteger(offset) ||
    offset < MIN_TIMEZONE_OFFSET_MINUTES ||
    offset > MAX_TIMEZONE_OFFSET_MINUTES
  ) {
    throw contractError(
      "OVERVIEW_TIMEZONE_INVALID",
      "Múi giờ phải là số phút nguyên trong khoảng UTC-12:00 đến UTC+14:00",
    );
  }
  return offset;
}

function resolveNowMs(value) {
  const nowMs = value instanceof Date ? value.getTime() : Date.parse(String(value || ""));
  if (!Number.isFinite(nowMs)) {
    throw contractError("OVERVIEW_NOW_INVALID", "Thời điểm tạo thống kê không hợp lệ");
  }
  return nowMs;
}

function startOfLocalDayUtcMs(nowMs, timezoneOffsetMinutes) {
  const shifted = new Date(nowMs + timezoneOffsetMinutes * 60 * 1000);
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
    timezoneOffsetMinutes * 60 * 1000
  );
}

function scanTimestampMs(scan) {
  const raw = scan?.startedAt || scan?.createdAt || scan?.completedAt || scan?.updatedAt || "";
  const timestamp = Date.parse(String(raw));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function padTwo(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDay(timestampMs, timezoneOffsetMinutes) {
  const shifted = new Date(timestampMs + timezoneOffsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  return {
    key: `${year}-${padTwo(month)}-${padTwo(day)}`,
    label: `${padTwo(day)}/${padTwo(month)}`,
  };
}

function buildOverviewRangeSnapshot(
  scans,
  { range: rangeValue = "today", timezoneOffsetMinutes: offsetValue = 0, now = new Date() } = {},
) {
  const rangeKey = normalizeOverviewRange(rangeValue);
  const timezoneOffsetMinutes = normalizeTimezoneOffsetMinutes(offsetValue);
  const nowMs = resolveNowMs(now);
  const config = RANGE_CONFIG[rangeKey];
  const todayStartMs = startOfLocalDayUtcMs(nowMs, timezoneOffsetMinutes);
  const startMs = todayStartMs - (config.days - 1) * DAY_MS;
  const endMs = nowMs;
  const sourceScans = Array.isArray(scans) ? scans : [];
  const rangedScans = sourceScans.filter((scan) => {
    const timestamp = scanTimestampMs(scan);
    return timestamp !== null && timestamp >= startMs && timestamp <= endMs;
  });

  let measureData;
  if (rangeKey === "today") {
    const completedBucketCount = Math.min(
      6,
      Math.max(1, Math.floor((endMs - todayStartMs) / (4 * HOUR_MS)) + 1),
    );
    measureData = Array.from({ length: completedBucketCount }, (_, index) => ({
      time: `${padTwo(index * 4)}:00`,
      count: 0,
    }));
    for (const scan of rangedScans) {
      const timestamp = scanTimestampMs(scan);
      if (timestamp === null) continue;
      const index = Math.min(measureData.length - 1, Math.floor((timestamp - startMs) / (4 * HOUR_MS)));
      measureData[index].count += 1;
    }
  } else {
    measureData = Array.from({ length: config.days }, (_, index) => {
      const day = formatLocalDay(startMs + index * DAY_MS, timezoneOffsetMinutes);
      return { time: day.label, day: day.key, count: 0 };
    });
    for (const scan of rangedScans) {
      const timestamp = scanTimestampMs(scan);
      if (timestamp === null) continue;
      const index = Math.min(measureData.length - 1, Math.floor((timestamp - startMs) / DAY_MS));
      measureData[index].count += 1;
    }
  }

  return {
    generatedAt: new Date(nowMs).toISOString(),
    range: {
      key: rangeKey,
      label: config.label,
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      timezoneOffsetMinutes,
      bucket: config.bucket,
    },
    measureData,
    scans: rangedScans,
  };
}

module.exports = {
  OVERVIEW_RANGE_KEYS,
  buildOverviewRangeSnapshot,
  normalizeOverviewRange,
  normalizeTimezoneOffsetMinutes,
};
