import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auditPage = readFileSync(
  new URL("../../src/app/pages/portal/AuditLogPage.tsx", import.meta.url),
  "utf8",
);
const reportsPage = readFileSync(
  new URL("../../src/app/pages/portal/ReportsPage.tsx", import.meta.url),
  "utf8",
);
const exportDialog = readFileSync(
  new URL("../../src/app/components/PortalExportDialog.tsx", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(
  new URL("../../src/lib/smart-health-api.ts", import.meta.url),
  "utf8",
);

test("audit page sends filters and pagination to the canonical backend ledger", () => {
  assert.match(auditPage, /smartHealthApi\.listAuditLogs\(queryFilters\)/);
  assert.match(auditPage, /resourceType/);
  assert.match(auditPage, /actorUserId/);
  assert.match(auditPage, /startDate/);
  assert.match(auditPage, /endDate/);
  assert.match(auditPage, /pagination\?\.hasNextPage/);
  assert.match(auditPage, /DialogContent/);
  assert.doesNotMatch(auditPage, /query\.data\?\.logs \|\| \[\]\)\.filter/);
});

test("reports and audit exports use the backend artifact contract", () => {
  assert.match(reportsPage, /PortalExportDialog/);
  assert.match(exportDialog, /smartHealthApi\.createExport/);
  assert.match(exportDialog, /smartHealthApi\.downloadExport/);
  assert.match(exportDialog, /Idempotency/);
  assert.match(exportDialog, /downloaded\.rendererVersion/);
  assert.match(exportDialog, /created\.export\.rendererVersion/);
  assert.match(exportDialog, /expectedWorkspaceId/);
  assert.match(exportDialog, /created\.export\.workspaceId/);
  assert.match(apiSource, /EXPORT_CREATE_RESPONSE_INVALID/);
  assert.match(apiSource, /EXPORT_ARTIFACT_EMPTY/);
  assert.match(apiSource, /EXPORT_ARTIFACT_IDENTITY_INVALID/);
  assert.match(apiSource, /result\.blob\.size <= 0/);
  assert.match(apiSource, /assigned_patients/);
  assert.match(apiSource, /workspaceId !== organizationId/);
  assert.match(apiSource, /\^\[a-f0-9\]\{64\}\$/i);
  assert.match(apiSource, /X-Shcare-Artifact-SHA256/);
  assert.match(apiSource, /Content-Disposition/);
  assert.doesNotMatch(reportsPage, /new Blob/);
  assert.doesNotMatch(reportsPage, /csvCell/);
});

test("export actions are gated by explicit export capabilities", () => {
  assert.match(reportsPage, /workspace\.exports\.manage/);
  assert.match(reportsPage, /workspace\.assigned_data\.export/);
  assert.match(auditPage, /workspace\.audit\.export/);
  assert.doesNotMatch(auditPage, /platform\.audit\.export/);
  assert.doesNotMatch(reportsPage, /platform\.exports\.manage/);
});
