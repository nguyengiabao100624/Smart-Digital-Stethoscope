const SERVICE_PACKAGE_TYPES = new Set([
  "trial",
  "basic",
  "professional",
  "enterprise",
  "custom",
  "solo",
  "personal",
]);
const SERVICE_PACKAGE_SEGMENTS = new Set(["organization", "solo_practice", "personal"]);
const SERVICE_PACKAGE_DURATIONS = new Set(["monthly", "quarterly", "yearly"]);
const SERVICE_PACKAGE_STATUSES = new Set(["active", "archived"]);
const SERVICE_PACKAGE_NUMBER_FIELDS = [
  "price",
  "maxDevices",
  "maxDoctors",
  "maxPatients",
  "storageGb",
  "aiMonthly",
  "retentionDays",
];

function contractError(code, message, details = {}) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  error.details = details;
  return error;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function normalizePackageId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(id)) {
    throw contractError(
      "PACKAGE_ID_INVALID",
      "Package id must contain only letters, numbers, underscores, or hyphens",
    );
  }
  return id;
}

function normalizePackageName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 160) {
    throw contractError("PACKAGE_NAME_INVALID", "Package name is required and must not exceed 160 characters");
  }
  return name;
}

function normalizeAlias(payload, canonicalKey, aliasKey) {
  const canonicalPresent = hasOwn(payload, canonicalKey);
  const aliasPresent = hasOwn(payload, aliasKey);
  if (!canonicalPresent && !aliasPresent) return { present: false, value: undefined };
  if (canonicalPresent && aliasPresent) {
    const canonical = String(payload[canonicalKey] ?? "").trim();
    const alias = String(payload[aliasKey] ?? "").trim();
    if (canonical !== alias) {
      throw contractError(
        "PACKAGE_ALIAS_CONFLICT",
        `${canonicalKey} and ${aliasKey} must describe the same value`,
        { fields: [canonicalKey, aliasKey] },
      );
    }
  }
  return { present: true, value: canonicalPresent ? payload[canonicalKey] : payload[aliasKey] };
}

function normalizeEnum(value, allowed, field) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!allowed.has(normalized)) {
    throw contractError(
      "PACKAGE_ENUM_INVALID",
      `${field} is not a supported package value`,
      { field, allowed: [...allowed] },
    );
  }
  return normalized;
}

function normalizeNonNegativeFinite(value, field) {
  const normalized = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw contractError(
      "PACKAGE_LIMIT_INVALID",
      `${field} must be a non-negative finite number`,
      { field },
    );
  }
  return normalized;
}

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw contractError("PACKAGE_CURRENCY_INVALID", "Currency must be a three-letter ISO-style code");
  }
  return currency;
}

function normalizeFeatures(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw contractError("PACKAGE_FEATURES_INVALID", "Package features must be an object");
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw contractError("PACKAGE_FEATURES_INVALID", "Package features must be JSON serializable");
  }
}

function assertAllowedFields(payload, allowedFields) {
  const unknownFields = Object.keys(payload || {}).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw contractError(
      "PACKAGE_FIELDS_UNSUPPORTED",
      "Package request contains unsupported fields",
      { fields: unknownFields.sort() },
    );
  }
}

const CREATE_FIELDS = new Set([
  "id",
  "name",
  "packageName",
  "type",
  "packageType",
  "segment",
  "price",
  "currency",
  "duration",
  ...SERVICE_PACKAGE_NUMBER_FIELDS.filter((field) => field !== "price"),
  "features",
  "status",
]);
const PATCH_FIELDS = new Set([...CREATE_FIELDS].filter((field) => field !== "id"));

function normalizeServicePackageCreate(payload = {}, context = {}) {
  assertAllowedFields(payload, CREATE_FIELDS);
  const nameAlias = normalizeAlias(payload, "name", "packageName");
  const typeAlias = normalizeAlias(payload, "type", "packageType");
  const now = String(context.now || new Date().toISOString());
  const servicePackage = {
    id: normalizePackageId(context.id || payload.id),
    name: normalizePackageName(nameAlias.value),
    type: normalizeEnum(typeAlias.present ? typeAlias.value : "basic", SERVICE_PACKAGE_TYPES, "type"),
    segment: normalizeEnum(payload.segment || "organization", SERVICE_PACKAGE_SEGMENTS, "segment"),
    price: normalizeNonNegativeFinite(hasOwn(payload, "price") ? payload.price : 0, "price"),
    currency: normalizeCurrency(payload.currency || "VND"),
    duration: normalizeEnum(payload.duration || "monthly", SERVICE_PACKAGE_DURATIONS, "duration"),
    maxDevices: normalizeNonNegativeFinite(hasOwn(payload, "maxDevices") ? payload.maxDevices : 0, "maxDevices"),
    maxDoctors: normalizeNonNegativeFinite(hasOwn(payload, "maxDoctors") ? payload.maxDoctors : 0, "maxDoctors"),
    maxPatients: normalizeNonNegativeFinite(hasOwn(payload, "maxPatients") ? payload.maxPatients : 0, "maxPatients"),
    storageGb: normalizeNonNegativeFinite(hasOwn(payload, "storageGb") ? payload.storageGb : 0, "storageGb"),
    aiMonthly: normalizeNonNegativeFinite(hasOwn(payload, "aiMonthly") ? payload.aiMonthly : 0, "aiMonthly"),
    retentionDays: normalizeNonNegativeFinite(
      hasOwn(payload, "retentionDays") ? payload.retentionDays : 0,
      "retentionDays",
    ),
    features: hasOwn(payload, "features") ? normalizeFeatures(payload.features) : {},
    status: normalizeEnum(payload.status || "active", SERVICE_PACKAGE_STATUSES, "status"),
    createdAt: now,
    updatedAt: now,
  };
  return servicePackage;
}

function normalizeServicePackagePatch(current, payload = {}, context = {}) {
  if (!current || !current.id) {
    throw contractError("PACKAGE_NOT_FOUND", "Package was not found");
  }
  assertAllowedFields(payload, PATCH_FIELDS);
  if (Object.keys(payload).length === 0) {
    throw contractError("PACKAGE_UPDATE_EMPTY", "Package update must include at least one mutable field");
  }
  const nameAlias = normalizeAlias(payload, "name", "packageName");
  const typeAlias = normalizeAlias(payload, "type", "packageType");
  const next = { ...current, features: normalizeFeatures(current.features || {}) };
  if (nameAlias.present) next.name = normalizePackageName(nameAlias.value);
  if (typeAlias.present) next.type = normalizeEnum(typeAlias.value, SERVICE_PACKAGE_TYPES, "type");
  if (hasOwn(payload, "segment")) {
    next.segment = normalizeEnum(payload.segment, SERVICE_PACKAGE_SEGMENTS, "segment");
  }
  if (hasOwn(payload, "currency")) next.currency = normalizeCurrency(payload.currency);
  if (hasOwn(payload, "duration")) {
    next.duration = normalizeEnum(payload.duration, SERVICE_PACKAGE_DURATIONS, "duration");
  }
  if (hasOwn(payload, "status")) {
    next.status = normalizeEnum(payload.status, SERVICE_PACKAGE_STATUSES, "status");
  }
  for (const field of SERVICE_PACKAGE_NUMBER_FIELDS) {
    if (hasOwn(payload, field)) next[field] = normalizeNonNegativeFinite(payload[field], field);
  }
  if (hasOwn(payload, "features")) next.features = normalizeFeatures(payload.features);
  next.updatedAt = String(context.now || new Date().toISOString());
  return next;
}

function normalizeStoredServicePackage(value = {}, context = {}) {
  const payload = Object.fromEntries(
    [...CREATE_FIELDS]
      .filter((field) => field !== "packageName" && field !== "packageType" && hasOwn(value, field))
      .map((field) => [field, value[field]]),
  );
  const normalized = normalizeServicePackageCreate(payload, {
    id: value.id,
    now: value.createdAt || context.now,
  });
  normalized.updatedAt = String(value.updatedAt || normalized.createdAt);
  return normalized;
}

module.exports = {
  SERVICE_PACKAGE_DURATIONS,
  SERVICE_PACKAGE_NUMBER_FIELDS,
  SERVICE_PACKAGE_SEGMENTS,
  SERVICE_PACKAGE_STATUSES,
  SERVICE_PACKAGE_TYPES,
  normalizePackageId,
  normalizeServicePackageCreate,
  normalizeServicePackagePatch,
  normalizeStoredServicePackage,
};
