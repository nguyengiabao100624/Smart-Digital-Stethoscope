const AUDIT_LOG_SORTS = Object.freeze([
  "createdAt:desc",
  "createdAt:asc",
  "action:asc",
  "action:desc",
]);

const SENSITIVE_AUDIT_KEY =
  /password|passcode|one.?time.?code|otp|totp|recovery.?code|claim.?code|proof.?of.?possession|token|secret|api.?key|credential|private.?key|authorization|cookie|session|verification.?link|reset.?link/i;

function boundedText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeDate(value, field) {
  const text = boundedText(value, 10);
  if (!text) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const error = new Error(`${field} must use YYYY-MM-DD`);
    error.code = "AUDIT_DATE_INVALID";
    error.field = field;
    throw error;
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    const error = new Error(`${field} is not a valid calendar date`);
    error.code = "AUDIT_DATE_INVALID";
    error.field = field;
    throw error;
  }
  return text;
}

function normalizeAuditLogQuery(input = {}) {
  const page = Math.max(1, Number.parseInt(input.page, 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(input.limit, 10) || 25));
  const requestedSort = boundedText(input.sort, 40) || "createdAt:desc";
  const sort = AUDIT_LOG_SORTS.includes(requestedSort) ? requestedSort : "createdAt:desc";
  const startDate = normalizeDate(input.startDate, "startDate");
  const endDate = normalizeDate(input.endDate, "endDate");
  if (startDate && endDate && endDate < startDate) {
    const error = new Error("endDate must be the same as or later than startDate");
    error.code = "AUDIT_DATE_RANGE_INVALID";
    throw error;
  }
  return {
    q: boundedText(input.q, 160).toLowerCase(),
    action: boundedText(input.action, 120),
    resourceType: boundedText(input.resourceType, 120),
    actorUserId: boundedText(input.actorUserId, 120),
    organizationId: boundedText(input.organizationId, 120),
    startDate,
    endDate,
    page,
    limit,
    sort,
  };
}

function sanitizeAuditMetadata(value, depth = 0) {
  if (depth > 5) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.slice(0, 2000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeAuditMetadata(item, depth + 1));
  }
  if (typeof value !== "object") return String(value).slice(0, 2000);
  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    const safeKey = boundedText(key, 120);
    if (!safeKey) continue;
    output[safeKey] = SENSITIVE_AUDIT_KEY.test(safeKey)
      ? "[REDACTED]"
      : sanitizeAuditMetadata(item, depth + 1);
  }
  return output;
}

function timestampInRange(value, startDate, endDate) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return !startDate && !endDate;
  const start = startDate ? Date.parse(`${startDate}T00:00:00.000Z`) : Number.NEGATIVE_INFINITY;
  const endExclusive = endDate
    ? Date.parse(`${endDate}T00:00:00.000Z`) + 24 * 60 * 60 * 1000
    : Number.POSITIVE_INFINITY;
  return timestamp >= start && timestamp < endExclusive;
}

function auditSearchText(log) {
  return [
    log.id,
    log.actorUserId,
    log.organizationId,
    log.action,
    log.resourceType,
    log.resourceId,
    log.ip,
    log.userAgent,
  ]
    .join(" ")
    .toLowerCase();
}

function compareAuditLogs(left, right, sort) {
  const [field, direction] = sort.split(":");
  const multiplier = direction === "asc" ? 1 : -1;
  const leftValue = field === "action" ? String(left.action || "") : String(left.createdAt || "");
  const rightValue = field === "action" ? String(right.action || "") : String(right.createdAt || "");
  return (
    multiplier * leftValue.localeCompare(rightValue) ||
    multiplier * String(left.id || "").localeCompare(String(right.id || ""))
  );
}

function filterAndPageAuditLogs(logs, input = {}) {
  const query = normalizeAuditLogQuery(input);
  const filtered = (Array.isArray(logs) ? logs : [])
    .filter((log) => !query.organizationId || log.organizationId === query.organizationId)
    .filter((log) => !query.action || log.action === query.action)
    .filter((log) => !query.resourceType || log.resourceType === query.resourceType)
    .filter((log) => !query.actorUserId || log.actorUserId === query.actorUserId)
    .filter((log) => timestampInRange(log.createdAt, query.startDate, query.endDate))
    .filter((log) => !query.q || auditSearchText(log).includes(query.q))
    .sort((left, right) => compareAuditLogs(left, right, query.sort));
  const offset = (query.page - 1) * query.limit;
  return {
    items: filtered.slice(offset, offset + query.limit),
    total: filtered.length,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  };
}

module.exports = {
  AUDIT_LOG_SORTS,
  filterAndPageAuditLogs,
  normalizeAuditLogQuery,
  sanitizeAuditMetadata,
};
