"use strict";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function contractError(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  return error;
}

function boundedText(value, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function parsePositiveInteger(value, field, fallback, maximum) {
  if (value === null || value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(String(value))) {
    throw contractError(
      `ADMIN_LIST_${field.toUpperCase()}_INVALID`,
      `${field} must be a positive integer`,
      field,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw contractError(
      `ADMIN_LIST_${field.toUpperCase()}_INVALID`,
      `${field} must be between 1 and ${maximum}`,
      field,
    );
  }
  return parsed;
}

function normalizeAdminListQuery(searchParams, options = {}) {
  const get = (key) => searchParams?.get?.(key) ?? null;
  const paginationRequested = get("page") !== null || get("limit") !== null;
  const page = parsePositiveInteger(get("page"), "page", 1, 1_000_000);
  const limit = parsePositiveInteger(get("limit"), "limit", DEFAULT_LIMIT, MAX_LIMIT);
  const allowedSortFields = new Set(Object.keys(options.sortFields || {}));
  const defaultSort = boundedText(options.defaultSort || "createdAt:desc", 80);
  const requestedSort = boundedText(get("sort") || defaultSort, 80);
  const [sortField, sortDirection = "asc", ...extra] = requestedSort.split(":");
  if (
    extra.length > 0 ||
    !allowedSortFields.has(sortField) ||
    !["asc", "desc"].includes(sortDirection)
  ) {
    throw contractError(
      "ADMIN_LIST_SORT_INVALID",
      `Unsupported sort '${requestedSort}'`,
      "sort",
    );
  }
  return {
    q: boundedText(get("q"), 240).toLocaleLowerCase("vi-VN"),
    page,
    limit,
    paginationRequested,
    sort: `${sortField}:${sortDirection}`,
    sortField,
    sortDirection,
  };
}

function comparable(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return String(value).toLocaleLowerCase("vi-VN");
}

function compareValues(left, right) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), "vi-VN", {
    numeric: true,
    sensitivity: "base",
  });
}

function paginateAdminList(items, searchParams, options) {
  const query = normalizeAdminListQuery(searchParams, options);
  const searchFields = Array.isArray(options.searchFields) ? options.searchFields : [];
  const filtered = [...(Array.isArray(items) ? items : [])].filter((item) => {
    if (!query.q) return true;
    return searchFields.some((read) =>
      boundedText(read(item), 1000).toLocaleLowerCase("vi-VN").includes(query.q),
    );
  });
  const readSortValue = options.sortFields[query.sortField];
  const direction = query.sortDirection === "asc" ? 1 : -1;
  filtered.sort((left, right) => {
    const compared = compareValues(comparable(readSortValue(left)), comparable(readSortValue(right)));
    if (compared !== 0) return compared * direction;
    return String(left?.id || "").localeCompare(String(right?.id || ""), "en");
  });
  const total = filtered.length;
  const effectiveLimit = query.paginationRequested ? query.limit : Math.max(total, 1);
  const pageCount = total === 0 ? 0 : Math.ceil(total / effectiveLimit);
  const start = query.paginationRequested ? (query.page - 1) * effectiveLimit : 0;
  return {
    items: query.paginationRequested ? filtered.slice(start, start + effectiveLimit) : filtered,
    total,
    page: query.page,
    limit: effectiveLimit,
    pageCount,
    sort: query.sort,
  };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeAdminListQuery,
  paginateAdminList,
};
