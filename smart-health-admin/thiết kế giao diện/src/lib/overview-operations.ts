import type {
  SmartHealthChartPoint,
  SmartHealthChartSlice,
  SmartHealthOverviewRange,
  SmartHealthOverviewRangeKey,
  SmartHealthOverviewResponse,
  SmartHealthOverviewStats,
} from "./smart-health-api";

export type OverviewStatsData = SmartHealthOverviewResponse;

export const OVERVIEW_RANGE_OPTIONS: ReadonlyArray<{
  value: SmartHealthOverviewRangeKey;
  label: string;
}> = [
  { value: "today", label: "Hôm nay" },
  { value: "7d", label: "7 ngày qua" },
  { value: "30d", label: "30 ngày qua" },
];

const RANGE_KEYS = new Set<SmartHealthOverviewRangeKey>(["today", "7d", "30d"]);
const DEVICE_KEYS = ["online", "offline"] as const;
const AI_JOB_KEYS = ["processing", "completed", "failed", "pending"] as const;

const DEVICE_PRESENTATION: Record<(typeof DEVICE_KEYS)[number], { name: string; color: string }> = {
  online: { name: "Đang hoạt động", color: "var(--success)" },
  offline: { name: "Mất kết nối", color: "var(--border)" },
};

const AI_PRESENTATION: Record<(typeof AI_JOB_KEYS)[number], { name: string; color: string }> = {
  processing: { name: "Đang xử lý", color: "var(--info)" },
  completed: { name: "Hoàn tất", color: "var(--success)" },
  failed: { name: "Thất bại", color: "var(--destructive)" },
  pending: { name: "Chờ xử lý", color: "var(--warning)" },
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} phải là object`);
  }
  return value as Record<string, unknown>;
}

function nonNegativeInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${label} phải là số nguyên không âm`);
  }
  return number;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} không được để trống`);
  }
  return value.trim();
}

function isoDate(value: unknown, label: string) {
  const text = requiredString(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error(`${label} không phải thời gian ISO hợp lệ`);
  }
  return text;
}

function formatStorageBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  const gigabytes = bytes / 1024 ** 3;
  return `${gigabytes >= 10 ? Math.round(gigabytes) : gigabytes.toFixed(1)} GB`;
}

function parseStats(value: unknown): SmartHealthOverviewStats {
  const source = record(value, "stats");
  const storageBytes = nonNegativeInteger(source.storageBytes, "stats.storageBytes");
  return {
    clinics: nonNegativeInteger(source.clinics, "stats.clinics"),
    workspaces: nonNegativeInteger(source.workspaces, "stats.workspaces"),
    patientsCount: nonNegativeInteger(source.patientsCount, "stats.patientsCount"),
    pendingDoctors: nonNegativeInteger(source.pendingDoctors, "stats.pendingDoctors"),
    devicesOnline: nonNegativeInteger(source.devicesOnline, "stats.devicesOnline"),
    scansCount: nonNegativeInteger(source.scansCount, "stats.scansCount"),
    aiJobsFailed: nonNegativeInteger(source.aiJobsFailed, "stats.aiJobsFailed"),
    storageBytes,
    storageUsed: formatStorageBytes(storageBytes),
  };
}

function parseRange(
  value: unknown,
  expectedRange: SmartHealthOverviewRangeKey,
): SmartHealthOverviewRange {
  const source = record(value, "range");
  const key = requiredString(source.key, "range.key") as SmartHealthOverviewRangeKey;
  if (!RANGE_KEYS.has(key) || key !== expectedRange) {
    throw new Error(`range.key không khớp yêu cầu ${expectedRange}`);
  }
  const bucket = requiredString(source.bucket, "range.bucket");
  if (bucket !== "4h" && bucket !== "day") {
    throw new Error("range.bucket phải là 4h hoặc day");
  }
  const timezoneOffsetMinutes = Number(source.timezoneOffsetMinutes);
  if (
    !Number.isInteger(timezoneOffsetMinutes) ||
    timezoneOffsetMinutes < -720 ||
    timezoneOffsetMinutes > 840
  ) {
    throw new Error("range.timezoneOffsetMinutes không hợp lệ");
  }
  const startAt = isoDate(source.startAt, "range.startAt");
  const endAt = isoDate(source.endAt, "range.endAt");
  if (Date.parse(startAt) > Date.parse(endAt)) {
    throw new Error("range.startAt phải trước range.endAt");
  }
  return {
    key,
    label: requiredString(source.label, "range.label"),
    startAt,
    endAt,
    timezoneOffsetMinutes,
    bucket,
  };
}

function parseMeasureData(value: unknown): SmartHealthChartPoint[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
    throw new Error("measureData phải có từ 1 đến 30 bucket");
  }
  return value.map((item, index) => {
    const source = record(item, `measureData[${index}]`);
    return {
      time: requiredString(source.time, `measureData[${index}].time`),
      ...(source.day ? { day: requiredString(source.day, `measureData[${index}].day`) } : {}),
      count: nonNegativeInteger(source.count, `measureData[${index}].count`),
    };
  });
}

function parseSlices<Key extends string>(
  value: unknown,
  expectedKeys: readonly Key[],
  presentation: Record<Key, { name: string; color: string }>,
  label: string,
): SmartHealthChartSlice[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} phải là array`);
  }
  const byKey = new Map<string, number>();
  value.forEach((item, index) => {
    const source = record(item, `${label}[${index}]`);
    const key = requiredString(source.key, `${label}[${index}].key`);
    if (!expectedKeys.includes(key as Key) || byKey.has(key)) {
      throw new Error(`${label}[${index}].key không hợp lệ hoặc bị trùng`);
    }
    byKey.set(key, nonNegativeInteger(source.value, `${label}[${index}].value`));
  });
  if (byKey.size !== expectedKeys.length) {
    throw new Error(`${label} thiếu trạng thái bắt buộc`);
  }
  return expectedKeys.map((key) => ({
    key,
    name: presentation[key].name,
    value: byKey.get(key) ?? 0,
    color: presentation[key].color,
  }));
}

export function parseOverviewStatsResponse(
  value: unknown,
  expectedRange: SmartHealthOverviewRangeKey,
): OverviewStatsData {
  const source = record(value, "overview response");
  const generatedAt = isoDate(source.generatedAt, "generatedAt");
  const range = parseRange(source.range, expectedRange);
  const stats = parseStats(source.stats);
  const measureData = parseMeasureData(source.measureData);
  const deviceData = parseSlices(source.deviceData, DEVICE_KEYS, DEVICE_PRESENTATION, "deviceData");
  const aiJobData = parseSlices(source.aiJobData, AI_JOB_KEYS, AI_PRESENTATION, "aiJobData");

  const measureTotal = measureData.reduce((sum, point) => sum + Number(point.count || 0), 0);
  if (measureTotal !== stats.scansCount) {
    throw new Error("measureData không khớp stats.scansCount");
  }
  const online = deviceData.find((item) => item.key === "online")?.value ?? 0;
  if (online !== stats.devicesOnline) {
    throw new Error("deviceData.online không khớp stats.devicesOnline");
  }
  const aiTotal = aiJobData.reduce((sum, item) => sum + item.value, 0);
  if (aiTotal !== stats.scansCount) {
    throw new Error("aiJobData không khớp stats.scansCount");
  }
  const failed = aiJobData.find((item) => item.key === "failed")?.value ?? 0;
  if (failed !== stats.aiJobsFailed) {
    throw new Error("aiJobData.failed không khớp stats.aiJobsFailed");
  }
  if (Date.parse(generatedAt) < Date.parse(range.endAt)) {
    throw new Error("generatedAt phải bằng hoặc sau range.endAt");
  }

  return { generatedAt, range, stats, measureData, deviceData, aiJobData };
}

export function overviewTimezoneLabel(offsetMinutes: number) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}
