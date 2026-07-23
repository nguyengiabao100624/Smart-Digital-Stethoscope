export const SMART_HEALTH_SCAN_LIFECYCLE_STATUSES = [
  "created",
  "uploading",
  "queued",
  "processing",
  "completed",
  "failed",
  "needs_review",
] as const;

export type SmartHealthScanLifecycleStatus =
  | (typeof SMART_HEALTH_SCAN_LIFECYCLE_STATUSES)[number]
  | "unknown";

const SMART_HEALTH_SCAN_LIFECYCLE_STATUS_SET = new Set<string>(
  SMART_HEALTH_SCAN_LIFECYCLE_STATUSES,
);

export function normalizeSmartHealthScanLifecycleStatus(
  value: unknown,
): SmartHealthScanLifecycleStatus {
  if (typeof value !== "string" || !SMART_HEALTH_SCAN_LIFECYCLE_STATUS_SET.has(value)) {
    return "unknown";
  }

  return value as SmartHealthScanLifecycleStatus;
}

export function normalizeSmartHealthAiConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const percentage = value <= 1 ? value * 100 : value;
  if (percentage < 0 || percentage > 100) {
    return null;
  }

  return Math.round(percentage);
}

export function formatSmartHealthAiConfidence(value: number | null): string {
  return value === null ? "Chưa có kết quả" : `${value}%`;
}

export function createScanReprocessIdempotencyKey(
  scanId: string,
  createUuid: () => string = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
) {
  return `shcare-admin:scan-reprocess:${scanId}:${createUuid()}`;
}
