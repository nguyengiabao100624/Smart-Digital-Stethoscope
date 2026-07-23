const path = require("node:path");

const UNSUPPORTED_BUCKET_POLICY_FIELDS = [
  "quota",
  "quotaGb",
  "retentionDays",
  "encryptionRequired",
  "system",
];

function contractError(statusCode, code, message, details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function text(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizeStorageBucketId(value) {
  return text(value, 160)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeStringArray(value, options = {}) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const normalized = [];
  for (const raw of source) {
    let item = text(raw, options.maxLength || 160).toLowerCase();
    if (options.stripLeadingDot) item = item.replace(/^\.+/, "");
    if (!item) continue;
    if (options.pattern && !options.pattern.test(item)) {
      throw contractError(400, options.code, options.message, { value: item });
    }
    if (!normalized.includes(item)) normalized.push(item);
    if (normalized.length > (options.maxItems || 50)) {
      throw contractError(400, options.code, options.message, {
        maxItems: options.maxItems || 50,
      });
    }
  }
  return normalized;
}

function normalizeStorageTags(value) {
  return normalizeStringArray(value, {
    maxItems: 30,
    maxLength: 80,
    pattern: /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u,
    code: "STORAGE_TAGS_INVALID",
    message: "Storage tags contain an invalid value",
  });
}

function assertSupportedBucketPolicy(payload = {}) {
  const fields = UNSUPPORTED_BUCKET_POLICY_FIELDS.filter((field) => own(payload, field));
  if (fields.length > 0) {
    throw contractError(
      422,
      "STORAGE_POLICY_UNSUPPORTED",
      "Quota, retention, encryption and system-bucket policy are not configurable in this release",
      { fields },
    );
  }
  if (own(payload, "visibility") && text(payload.visibility, 40).toLowerCase() !== "private") {
    throw contractError(
      422,
      "STORAGE_VISIBILITY_UNSUPPORTED",
      "Custom storage buckets are private; public or encrypted visibility policy is unavailable",
      { visibility: text(payload.visibility, 40) },
    );
  }
}

function normalizeStorageBucketCreate(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw contractError(400, "STORAGE_BUCKET_PAYLOAD_INVALID", "Storage bucket payload must be an object");
  }
  assertSupportedBucketPolicy(payload);
  const name = text(payload.name, 120);
  if (!name) {
    throw contractError(400, "STORAGE_BUCKET_NAME_REQUIRED", "Storage bucket name is required", {
      fieldErrors: { name: "Tên bucket là bắt buộc." },
    });
  }
  const id = sanitizeStorageBucketId(payload.id || name || options.id);
  if (!id) {
    throw contractError(400, "STORAGE_BUCKET_ID_INVALID", "Storage bucket id is invalid", {
      fieldErrors: { name: "Tên bucket không tạo được mã hợp lệ." },
    });
  }
  const maxFileSizeMb = Number(payload.maxFileSizeMb ?? 500);
  if (!Number.isInteger(maxFileSizeMb) || maxFileSizeMb < 1 || maxFileSizeMb > 2048) {
    throw contractError(
      400,
      "STORAGE_BUCKET_MAX_FILE_SIZE_INVALID",
      "maxFileSizeMb must be an integer from 1 to 2048",
      { fieldErrors: { maxFileSizeMb: "Giới hạn phải từ 1 đến 2048 MB." } },
    );
  }
  const allowedExtensions = normalizeStringArray(payload.allowedExtensions, {
    stripLeadingDot: true,
    maxItems: 50,
    maxLength: 20,
    pattern: /^[a-z0-9][a-z0-9+_-]*$/,
    code: "STORAGE_BUCKET_EXTENSIONS_INVALID",
    message: "The allowed extension list contains an invalid value",
  });
  const allowedMimeTypes = normalizeStringArray(payload.allowedMimeTypes, {
    maxItems: 50,
    maxLength: 120,
    pattern: /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+*-]+$/,
    code: "STORAGE_BUCKET_MIME_TYPES_INVALID",
    message: "The allowed MIME type list contains an invalid value",
  });
  const now = text(options.now, 80) || new Date().toISOString();
  return {
    id,
    name,
    description: text(payload.description || payload.desc, 500),
    iconKey: text(payload.iconKey, 40) || "database",
    colorKey: text(payload.colorKey, 40) || "blue",
    category: text(payload.category, 80) || "custom",
    allowedExtensions,
    allowedMimeTypes,
    maxFileSizeMb,
    createdByUserId: text(options.actorUserId, 160),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeStorageFileCreate(payload = {}, options = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw contractError(400, "STORAGE_FILE_PAYLOAD_INVALID", "Storage file payload must be an object");
  }
  const required = {
    id: text(payload.id, 160),
    organizationId: text(payload.organizationId, 160),
    bucket: sanitizeStorageBucketId(payload.bucket),
    name: path.basename(text(payload.name, 240)),
    objectKey: text(payload.objectKey, 1000),
    storageProvider: text(payload.storageProvider, 40),
    checksum: text(payload.checksum || payload.sha256, 64).toLowerCase(),
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([field]) => field);
  if (missing.length > 0) {
    throw contractError(400, "STORAGE_FILE_FIELDS_REQUIRED", "Storage file metadata is incomplete", {
      fields: missing,
    });
  }
  if (!/^[0-9a-f]{64}$/.test(required.checksum)) {
    throw contractError(400, "STORAGE_FILE_CHECKSUM_INVALID", "Storage file checksum must be SHA-256");
  }
  const byteSize = Number(payload.byteSize);
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw contractError(400, "STORAGE_FILE_SIZE_INVALID", "Storage file byte size must be positive");
  }
  const now = text(options.now, 80) || new Date().toISOString();
  return {
    ...required,
    contentType: text(payload.contentType, 160) || "application/octet-stream",
    type: text(payload.type, 40).toLowerCase() || "bin",
    byteSize,
    sha256: required.checksum,
    firmwareVersion: text(payload.firmwareVersion, 80),
    tags: normalizeStorageTags(payload.tags),
    uploader: text(payload.uploader, 160),
    createdByUserId: text(payload.createdByUserId || options.actorUserId, 160),
    status: "active",
    deletedAt: "",
    deletedByUserId: "",
    createdAt: now,
    updatedAt: now,
  };
}

module.exports = {
  UNSUPPORTED_BUCKET_POLICY_FIELDS,
  assertSupportedBucketPolicy,
  contractError,
  normalizeStorageBucketCreate,
  normalizeStorageFileCreate,
  normalizeStorageTags,
  sanitizeStorageBucketId,
};
