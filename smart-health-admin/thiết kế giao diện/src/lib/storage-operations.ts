import type {
  SmartHealthChartPoint,
  SmartHealthChartSlice,
  SmartHealthClinicUsage,
  SmartHealthStorageActivity,
  SmartHealthStorageBucket,
  SmartHealthStorageFile,
  SmartHealthTopBucket,
} from "./smart-health-api";

export type StorageStatsData = {
  totalUsed: number;
  totalFiles: number;
  buckets: SmartHealthStorageBucket[];
  growthData: SmartHealthChartPoint[];
  typeData: SmartHealthChartSlice[];
  topBuckets: SmartHealthTopBucket[];
  recentActivity: SmartHealthStorageActivity[];
  topClinicUsage: SmartHealthClinicUsage[];
};

const STORAGE_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export type StorageMutationResponse = Record<string, unknown>;
export type StorageOperation =
  | "bucket-create"
  | "bucket-delete"
  | "file-upload"
  | "file-delete"
  | "file-share";

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi storage thiếu ${label}.`);
  }
  return value.trim();
}

function nonNegativeNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Phản hồi storage có ${label} không hợp lệ.`);
  }
  return number;
}

function strictNonNegativeNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Phản hồi storage có ${label} không hợp lệ.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string) {
  const number = strictNonNegativeNumber(value, label);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`Phản hồi storage có ${label} không phải số nguyên an toàn.`);
  }
  return number;
}

function arrayOf(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Phản hồi storage thiếu danh sách ${label}.`);
  }
  return value;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown, label: string) {
  if (value === undefined) return [];
  return arrayOf(value, label).map((item, index) => requiredString(item, `${label}[${index}]`));
}

function parseStorageBucket(value: unknown, index: number): SmartHealthStorageBucket {
  const source = recordOf(value);
  const description = optionalString(source.description);
  const desc = optionalString(source.desc) || description;
  return {
    id: requiredString(source.id, `buckets[${index}].id`),
    name: requiredString(source.name, `buckets[${index}].name`),
    description,
    desc,
    iconKey: optionalString(source.iconKey) || "database",
    colorKey: optionalString(source.colorKey) || "blue",
    category: optionalString(source.category) || "custom",
    used: strictNonNegativeNumber(source.used, `buckets[${index}].used`),
    files: nonNegativeInteger(source.files, `buckets[${index}].files`),
    createdAt: optionalString(source.createdAt),
    allowedExtensions: stringArray(source.allowedExtensions, `buckets[${index}].allowedExtensions`),
    allowedMimeTypes: stringArray(source.allowedMimeTypes, `buckets[${index}].allowedMimeTypes`),
    maxFileSizeMb: strictNonNegativeNumber(source.maxFileSizeMb, `buckets[${index}].maxFileSizeMb`),
    system: source.system === true,
  };
}

function parseStorageFile(value: unknown, index: number): SmartHealthStorageFile {
  const source = recordOf(value);
  if (source.visibility !== "private") {
    throw new Error(`Phản hồi storage có files[${index}].visibility không an toàn.`);
  }
  const byteSize =
    source.byteSize === undefined
      ? undefined
      : strictNonNegativeNumber(source.byteSize, `files[${index}].byteSize`);
  return {
    id: requiredString(source.id, `files[${index}].id`),
    name: requiredString(source.name, `files[${index}].name`),
    bucket: requiredString(source.bucket, `files[${index}].bucket`),
    type: requiredString(source.type, `files[${index}].type`),
    size: requiredString(source.size, `files[${index}].size`),
    uploader: requiredString(source.uploader, `files[${index}].uploader`),
    uploadedAt: requiredString(source.uploadedAt, `files[${index}].uploadedAt`),
    visibility: "private",
    createdAt: optionalString(source.createdAt),
    ...(byteSize === undefined ? {} : { byteSize }),
    checksum: optionalString(source.checksum),
    sha256: optionalString(source.sha256),
    firmwareVersion: optionalString(source.firmwareVersion),
    organizationId: optionalString(source.organizationId),
    tags: stringArray(source.tags, `files[${index}].tags`),
    downloadUrl: optionalString(source.downloadUrl) || undefined,
    previewUrl: optionalString(source.previewUrl) || undefined,
  };
}

export function parseStorageStatsResponse(value: unknown): StorageStatsData {
  const source = recordOf(value);
  const totalUsed = strictNonNegativeNumber(source.totalUsed, "totalUsed");
  const totalFiles = nonNegativeInteger(source.totalFiles, "totalFiles");
  const buckets = arrayOf(source.buckets, "buckets").map(parseStorageBucket);
  const bucketIds = new Set(buckets.map((bucket) => bucket.id));
  if (bucketIds.size !== buckets.length) {
    throw new Error("Phản hồi storage có bucket bị trùng ID.");
  }
  const bucketTotal = buckets.reduce((sum, bucket) => sum + bucket.used, 0);
  if (Math.abs(bucketTotal - totalUsed) > 0.000001) {
    throw new Error("Tổng dung lượng storage không khớp với các bucket.");
  }

  const growthData = arrayOf(source.growthData, "growthData").map((value, index) => {
    const point = recordOf(value);
    const day = requiredString(point.day, `growthData[${index}].day`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error(`Phản hồi storage có growthData[${index}].day không hợp lệ.`);
    }
    return {
      day,
      gb: strictNonNegativeNumber(point.gb, `growthData[${index}].gb`),
    };
  });

  const typeData = arrayOf(source.typeData, "typeData").map((value, index) => {
    const slice = recordOf(value);
    return {
      name: requiredString(slice.name, `typeData[${index}].name`),
      value: strictNonNegativeNumber(slice.value, `typeData[${index}].value`),
      color: STORAGE_CHART_COLORS[index % STORAGE_CHART_COLORS.length],
    };
  });

  const topBuckets = arrayOf(source.topBuckets, "topBuckets").map((value, index) => {
    const bucket = recordOf(value);
    return {
      name: requiredString(bucket.name, `topBuckets[${index}].name`),
      gb: strictNonNegativeNumber(bucket.gb, `topBuckets[${index}].gb`),
    };
  });

  const recentActivity = arrayOf(source.recentActivity, "recentActivity").map((value, index) => {
    const activity = recordOf(value);
    return {
      action: requiredString(activity.action, `recentActivity[${index}].action`),
      who: requiredString(activity.who, `recentActivity[${index}].who`),
      what: requiredString(activity.what, `recentActivity[${index}].what`),
      target: requiredString(activity.target, `recentActivity[${index}].target`),
      when: requiredString(activity.when, `recentActivity[${index}].when`),
    };
  });

  const topClinicUsage = arrayOf(source.topClinicUsage, "topClinicUsage").map((value, index) => {
    const clinic = recordOf(value);
    const percent = strictNonNegativeNumber(clinic.percent, `topClinicUsage[${index}].percent`);
    if (percent > 100) {
      throw new Error(`Phản hồi storage có topClinicUsage[${index}].percent vượt 100.`);
    }
    return {
      name: requiredString(clinic.name, `topClinicUsage[${index}].name`),
      gb: strictNonNegativeNumber(clinic.gb, `topClinicUsage[${index}].gb`),
      percent,
    };
  });

  return {
    totalUsed,
    totalFiles,
    buckets,
    growthData,
    typeData,
    topBuckets,
    recentActivity,
    topClinicUsage,
  };
}

export function parseStorageFilesResponse(value: unknown) {
  const source = recordOf(value);
  const files = arrayOf(source.files, "files").map(parseStorageFile);
  const fileIds = new Set(files.map((file) => file.id));
  if (fileIds.size !== files.length) {
    throw new Error("Phản hồi storage có tệp bị trùng ID.");
  }
  return { files };
}

export function createStorageOperationIdempotencyKey(operation: StorageOperation, target = "new") {
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `admin-storage-${operation}-${target}-${nonce}`;
}

export function parseStorageBucketOutcome(
  response: unknown,
  expectedName: string,
): SmartHealthStorageBucket {
  const bucket = recordOf(recordOf(response).bucket);
  const canonical: SmartHealthStorageBucket = {
    id: requiredString(bucket.id, "ID bucket canonical"),
    name: requiredString(bucket.name, "tên bucket canonical"),
    description: typeof bucket.description === "string" ? bucket.description : "",
    desc:
      typeof bucket.desc === "string"
        ? bucket.desc
        : typeof bucket.description === "string"
          ? bucket.description
          : "",
    iconKey: typeof bucket.iconKey === "string" ? bucket.iconKey : "database",
    colorKey: typeof bucket.colorKey === "string" ? bucket.colorKey : "blue",
    category: typeof bucket.category === "string" ? bucket.category : "custom",
    used: nonNegativeNumber(bucket.used ?? 0, "dung lượng đã dùng"),
    files: nonNegativeNumber(bucket.files ?? 0, "số tệp"),
    createdAt: typeof bucket.createdAt === "string" ? bucket.createdAt : "",
    allowedExtensions: Array.isArray(bucket.allowedExtensions)
      ? bucket.allowedExtensions.filter((item): item is string => typeof item === "string")
      : [],
    allowedMimeTypes: Array.isArray(bucket.allowedMimeTypes)
      ? bucket.allowedMimeTypes.filter((item): item is string => typeof item === "string")
      : [],
    maxFileSizeMb: nonNegativeNumber(bucket.maxFileSizeMb ?? 500, "giới hạn tệp"),
    system: bucket.system === true,
  };
  if (canonical.name !== expectedName.trim()) {
    throw new Error("Backend chưa xác nhận đúng bucket vừa tạo.");
  }
  if (canonical.system) {
    throw new Error("Backend trả về bucket hệ thống cho thao tác tạo bucket tùy chỉnh.");
  }
  return canonical;
}

export function parseStorageFileOutcome(
  response: unknown,
  expected: { name: string; bucket: string },
): SmartHealthStorageFile {
  const file = recordOf(recordOf(response).file);
  const canonical: SmartHealthStorageFile = {
    id: requiredString(file.id, "ID tệp canonical"),
    name: requiredString(file.name, "tên tệp canonical"),
    bucket: requiredString(file.bucket, "bucket canonical"),
    type: requiredString(file.type, "loại tệp canonical"),
    size: requiredString(file.size, "kích thước hiển thị"),
    uploader: requiredString(file.uploader, "người tải"),
    uploadedAt: requiredString(file.uploadedAt, "thời điểm tải"),
    visibility: "private",
    createdAt: typeof file.createdAt === "string" ? file.createdAt : "",
    byteSize: nonNegativeNumber(file.byteSize, "kích thước byte"),
    tags: Array.isArray(file.tags)
      ? file.tags.filter((item): item is string => typeof item === "string")
      : [],
    downloadUrl: typeof file.downloadUrl === "string" ? file.downloadUrl : undefined,
    previewUrl: typeof file.previewUrl === "string" ? file.previewUrl : undefined,
  };
  if (canonical.name !== expected.name || canonical.bucket !== expected.bucket) {
    throw new Error("Backend chưa xác nhận đúng tệp và bucket vừa tải lên.");
  }
  return canonical;
}

export function assertStorageDeleteOutcome(
  response: unknown,
  field: "bucketId" | "fileId",
  expectedId: string,
) {
  const record = recordOf(response);
  if (record.deleted !== true || record[field] !== expectedId) {
    throw new Error("Backend chưa xác nhận tài nguyên storage đã được xóa.");
  }
}

export function parseStorageShareOutcome(response: unknown) {
  const record = recordOf(response);
  const shareUrl = requiredString(record.shareUrl || record.url, "liên kết chia sẻ");
  if (!/^https:\/\//i.test(shareUrl)) {
    throw new Error("Backend chưa trả về liên kết chia sẻ HTTPS hợp lệ.");
  }
  const expiresInSeconds = nonNegativeNumber(record.expiresInSeconds, "thời hạn liên kết");
  if (expiresInSeconds < 1 || expiresInSeconds > 3600) {
    throw new Error("Backend trả về thời hạn liên kết chia sẻ không an toàn.");
  }
  return { shareUrl, expiresInSeconds };
}
