import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dataDialogPath = new URL(
  "../../src/components/admin/dialogs/ExportDataDialog.tsx",
  import.meta.url,
);
const reportDialogPath = new URL(
  "../../src/components/admin/dialogs/ExportReportDialog.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("admin exports are created and downloaded through the audited backend contract", async () => {
  const [dialog, api] = await Promise.all([
    readFile(dataDialogPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(dialog, /smartHealthApi\.createExport/);
  assert.match(dialog, /smartHealthApi\.downloadExport/);
  assert.match(dialog, /idempotency/i);
  assert.match(api, /createExport/);
  assert.match(api, /downloadExport/);
  assert.match(api, /Idempotency-Key/);
});

test("admin export UI exposes every backend-rendered artifact without rebuilding files locally", async () => {
  const [dataDialog, reportDialog] = await Promise.all([
    readFile(dataDialogPath, "utf8"),
    readFile(reportDialogPath, "utf8"),
  ]);
  const source = `${dataDialog}\n${reportDialog}`;

  for (const format of ["json", "csv", "xlsx", "pdf"]) {
    assert.match(source, new RegExp(`value:\\s*["']${format}["']`));
  }
  assert.match(dataDialog, /requestBlob|downloadExport/);
  assert.match(dataDialog, /Content-Disposition/);
  assert.match(dataDialog, /X-Shcare-Artifact-SHA256/);
  assert.match(dataDialog, /blob\.size === 0/);
  assert.doesNotMatch(source, /exportCSV|exportExcel|exportPDF|buildLiveExportSheets/);
  assert.doesNotMatch(source, /Tâm Anh|Hô hấp Việt|Minh Tâm/);
  assert.doesNotMatch(source, /mã hóa và nén/i);
});

test("audit report export preserves the current server-side filters and dataset", async () => {
  const [dataDialog, reportDialog] = await Promise.all([
    readFile(dataDialogPath, "utf8"),
    readFile(reportDialogPath, "utf8"),
  ]);

  assert.match(reportDialog, /SmartHealthAuditLogFilters/);
  assert.match(reportDialog, /dataset=\{dataset\}/);
  assert.match(reportDialog, /filters=\{filters\}/);
  assert.match(dataDialog, /dataset === "audit_logs"/);
  assert.match(dataDialog, /filters:\s*auditFilters/);
  assert.match(dataDialog, /status !== "ready"/);
  assert.match(dataDialog, /toast\.success/);
});
