import type { SmartHealthServicePackage } from "./smart-health-api";

export type PackageMutationAction = "create" | "update" | "archive";

export type PackageMutationIntent = {
  id?: string;
  name?: string;
  type?: string;
  segment?: string;
  duration?: string;
  status?: string;
  price?: string | number;
  maxDevices?: string | number;
  maxDoctors?: string | number;
  maxPatients?: string | number;
  storageGb?: string | number;
  aiMonthly?: string | number;
  retentionDays?: string | number;
  features?: Record<string, unknown>;
};

export type PackageMutationResponse = {
  package?: unknown;
  packageId?: unknown;
  archived?: unknown;
  idempotent?: unknown;
};

const PACKAGE_TYPES = new Set([
  "trial",
  "basic",
  "professional",
  "enterprise",
  "custom",
  "solo",
  "personal",
]);
const PACKAGE_SEGMENTS = new Set(["organization", "solo_practice", "personal"]);
const PACKAGE_DURATIONS = new Set(["monthly", "quarterly", "yearly"]);
const PACKAGE_STATUSES = new Set(["active", "archived"]);
const NUMBER_FIELDS = [
  "price",
  "maxDevices",
  "maxDoctors",
  "maxPatients",
  "storageGb",
  "aiMonthly",
  "retentionDays",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi gói dịch vụ thiếu ${label}.`);
  }
  return value.trim();
}

function requireEnum(value: unknown, allowed: Set<string>, label: string) {
  const normalized = requireString(value, label).toLowerCase();
  if (!allowed.has(normalized)) {
    throw new Error(`Phản hồi gói dịch vụ có ${label} không hợp lệ.`);
  }
  return normalized;
}

function requireNonNegativeNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Phản hồi gói dịch vụ có ${label} không hợp lệ.`);
  }
  return number;
}

function normalizedIntentNumber(value: string | number | undefined) {
  if (value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stableRecord(value: Record<string, unknown>) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
  );
}

export function createPackageOperationIdempotencyKey(
  action: PackageMutationAction,
  packageId = "new",
) {
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `admin-package-${action}-${packageId}-${nonce}`;
}

export function packageIntentFingerprint(intent: PackageMutationIntent) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(intent)
        .filter(([, value]) => value !== undefined)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

export function parsePackageMutationOutcome(
  response: PackageMutationResponse,
  action: PackageMutationAction,
  intent: PackageMutationIntent,
): SmartHealthServicePackage {
  const record = asRecord(response);
  const packageRecord = asRecord(record.package);
  const servicePackage: SmartHealthServicePackage = {
    id: requireString(packageRecord.id, "ID canonical"),
    name: requireString(packageRecord.name, "tên canonical"),
    type: requireEnum(packageRecord.type, PACKAGE_TYPES, "loại"),
    segment: requireEnum(packageRecord.segment, PACKAGE_SEGMENTS, "phân khúc"),
    duration: requireEnum(packageRecord.duration, PACKAGE_DURATIONS, "chu kỳ"),
    status: requireEnum(packageRecord.status, PACKAGE_STATUSES, "trạng thái"),
    currency: requireString(packageRecord.currency, "tiền tệ").toUpperCase(),
    features: asRecord(packageRecord.features),
    createdAt: typeof packageRecord.createdAt === "string" ? packageRecord.createdAt : "",
    updatedAt: typeof packageRecord.updatedAt === "string" ? packageRecord.updatedAt : "",
  };

  if (!/^[A-Z]{3}$/.test(servicePackage.currency || "")) {
    throw new Error("Phản hồi gói dịch vụ có tiền tệ không hợp lệ.");
  }

  for (const field of NUMBER_FIELDS) {
    servicePackage[field] = requireNonNegativeNumber(packageRecord[field], field);
  }

  if (intent.id && servicePackage.id !== intent.id) {
    throw new Error("Backend trả về gói dịch vụ khác thao tác đang thực hiện.");
  }
  if (intent.name && servicePackage.name !== intent.name.trim()) {
    throw new Error("Backend chưa xác nhận đúng tên gói dịch vụ đã gửi.");
  }

  const enumExpectations: Array<[keyof PackageMutationIntent, keyof SmartHealthServicePackage]> = [
    ["type", "type"],
    ["segment", "segment"],
    ["duration", "duration"],
    ["status", "status"],
  ];
  for (const [intentField, packageField] of enumExpectations) {
    const expected = intent[intentField];
    if (expected !== undefined && servicePackage[packageField] !== expected) {
      throw new Error(`Backend chưa xác nhận đúng trường ${intentField}.`);
    }
  }

  for (const field of NUMBER_FIELDS) {
    const expected = normalizedIntentNumber(intent[field]);
    if (expected !== undefined && servicePackage[field] !== expected) {
      throw new Error(`Backend chưa xác nhận đúng trường ${field}.`);
    }
  }

  if (
    intent.features &&
    stableRecord(servicePackage.features || {}) !== stableRecord(intent.features)
  ) {
    throw new Error("Backend chưa xác nhận đúng các nhãn tính năng.");
  }

  if (action === "archive") {
    if (
      record.archived !== true ||
      record.packageId !== servicePackage.id ||
      servicePackage.status !== "archived"
    ) {
      throw new Error("Backend chưa xác nhận gói dịch vụ đã được lưu trữ an toàn.");
    }
  }

  return servicePackage;
}
