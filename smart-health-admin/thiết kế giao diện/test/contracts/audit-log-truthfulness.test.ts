import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auditLogPath = new URL("../../src/components/admin/AuditLog.tsx", import.meta.url);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);
const permissionsPath = new URL(
  "../../src/components/admin/action-permissions.ts",
  import.meta.url,
);

test("audit log uses the canonical server-filtered and paginated API", async () => {
  const [auditLog, api] = await Promise.all([
    readFile(auditLogPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(auditLog, /smartHealthApi\s*\.\s*listAuditLogs/);
  assert.match(auditLog, /page,\s*limit:\s*ADMIN_TABLE_PAGE_SIZE/);
  assert.match(auditLog, /response\.pagination/);
  assert.match(auditLog, /appliedFilters/);
  assert.match(api, /requestJson<SmartHealthAuditLogResponse>\("\/audit-logs"/);
  for (const filter of [
    "q",
    "action",
    "resourceType",
    "actorUserId",
    "startDate",
    "endDate",
    "sort",
  ]) {
    assert.match(auditLog, new RegExp(filter));
  }
  assert.doesNotMatch(auditLog, /paginateItems|visibleLogs|logs\.filter/);
});

test("audit rows render backend identity fields and no synthetic platform values", async () => {
  const auditLog = await readFile(auditLogPath, "utf8");

  for (const field of [
    "actorName",
    "actorRole",
    "organizationName",
    "resourceType",
    "resourceId",
    "userAgent",
    "outcome",
    "metadata",
  ]) {
    assert.match(auditLog, new RegExp(`log\\.${field}`));
  }
  assert.doesNotMatch(auditLog, /Chrome \/ Windows|admin_event|Backend event|role:\s*["']Backend/);
});

test("audit access and export controls use dedicated backend capabilities", async () => {
  const [auditLog, permissions] = await Promise.all([
    readFile(auditLogPath, "utf8"),
    readFile(permissionsPath, "utf8"),
  ]);

  assert.match(permissions, /platform\.audit\.view/);
  assert.match(permissions, /workspace\.audit\.view/);
  assert.match(permissions, /platform\.audit\.export/);
  assert.match(permissions, /workspace\.audit\.export/);
  assert.match(auditLog, /hasAnyCapability\(AUDIT_VIEW_CAPABILITIES\)/);
  assert.match(auditLog, /hasAnyCapability\(AUDIT_EXPORT_CAPABILITIES\)/);
  assert.match(auditLog, /dataset="audit_logs"/);
});

test("audit UI covers loading, empty, offline, forbidden, retry and metadata detail states", async () => {
  const auditLog = await readFile(auditLogPath, "utf8");

  for (const marker of [
    "AuditLoadingState",
    "AuditEmptyState",
    'failureKind === "forbidden"',
    "Đang ngoại tuyến",
    "Thử lại",
    "AuditMetadataDialog",
    'role="alert"',
  ]) {
    assert.match(auditLog, new RegExp(marker));
  }
});
