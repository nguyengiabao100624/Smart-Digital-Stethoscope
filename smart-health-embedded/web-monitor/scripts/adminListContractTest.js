"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { MAX_LIMIT, normalizeAdminListQuery, paginateAdminList } = require("../src/adminListContract");

const options = {
  searchFields: [(item) => item.name, (item) => item.code],
  sortFields: {
    name: (item) => item.name,
    createdAt: (item) => item.createdAt,
  },
  defaultSort: "createdAt:desc",
};

test("keeps legacy body compatibility when pagination parameters are absent", () => {
  const result = paginateAdminList(
    [
      { id: "3", name: "Bình", code: "BN-3", createdAt: "2026-01-03" },
      { id: "2", name: "An", code: "BN-2", createdAt: "2026-01-02" },
      { id: "1", name: "An Nhiên", code: "BN-1", createdAt: "2026-01-01" },
    ],
    new URLSearchParams("q=an&sort=name:asc"),
    options,
  );
  assert.deepEqual(result.items.map((item) => item.id), ["2", "1"]);
  assert.equal(result.total, 2);
  assert.equal(result.limit, 2);
  assert.equal(result.page, 1);
});

test("filters, sorts and pages with stable pagination metadata", () => {
  const result = paginateAdminList(
    [
      { id: "3", name: "C", code: "PX", createdAt: "2026-01-03" },
      { id: "2", name: "B", code: "PX", createdAt: "2026-01-02" },
      { id: "1", name: "A", code: "PX", createdAt: "2026-01-01" },
    ],
    new URLSearchParams("q=px&page=2&limit=1&sort=name:asc"),
    options,
  );
  assert.deepEqual(result.items.map((item) => item.id), ["2"]);
  assert.deepEqual(
    { total: result.total, page: result.page, limit: result.limit, pageCount: result.pageCount },
    { total: 3, page: 2, limit: 1, pageCount: 3 },
  );
});

test("rejects malformed pagination and unsupported sort fields", () => {
  assert.throws(
    () => normalizeAdminListQuery(new URLSearchParams("page=0"), options),
    (error) => error.code === "ADMIN_LIST_PAGE_INVALID" && error.field === "page",
  );
  assert.throws(
    () => normalizeAdminListQuery(new URLSearchParams(`limit=${MAX_LIMIT + 1}`), options),
    (error) => error.code === "ADMIN_LIST_LIMIT_INVALID" && error.field === "limit",
  );
  assert.throws(
    () => normalizeAdminListQuery(new URLSearchParams("sort=secret:asc"), options),
    (error) => error.code === "ADMIN_LIST_SORT_INVALID" && error.field === "sort",
  );
});
