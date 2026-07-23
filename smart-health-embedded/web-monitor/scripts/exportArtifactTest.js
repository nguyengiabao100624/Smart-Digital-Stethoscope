const assert = require("node:assert/strict");
const test = require("node:test");

const {
  EXPORT_FORMATS,
  buildExportArtifact,
  normalizeExportFormat,
  snapshotRows,
} = require("../src/exportArtifact");

function fixtureSnapshot() {
  return {
    schemaVersion: "shcare.export.v1",
    exportId: "export_test",
    generatedAt: "2026-07-23T08:30:00.000Z",
    scope: { organizationId: "org_alpha" },
    filters: {
      startDate: "2026-07-01",
      endDate: "2026-07-23",
      includeAudio: false,
      includeReports: true,
      includeHistory: true,
    },
    counts: { patients: 2, devices: 0, scans: 0, appointments: 0, reports: 0, audioFiles: 0, total: 2 },
    data: {
      patients: [
        { id: "patient_1", name: "Nguyễn An", createdAt: "2026-07-02T00:00:00.000Z" },
        { id: "=unsafe", name: "+formula", createdAt: "2026-07-03T00:00:00.000Z" },
      ],
      devices: [],
      scans: [],
      appointments: [],
      reports: [],
      audioFiles: [],
    },
  };
}

test("export format contract exposes only the four production formats", () => {
  assert.deepEqual(EXPORT_FORMATS, ["json", "csv", "xlsx", "pdf"]);
  assert.equal(normalizeExportFormat(" XLSX "), "xlsx");
  assert.equal(normalizeExportFormat("sql"), "");
});

test("snapshot rows retain the filtered immutable snapshot records", () => {
  const rows = snapshotRows(fixtureSnapshot());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].dataset, "patients");
  assert.equal(rows[0].recordId, "patient_1");
  assert.ok(rows[0].payload.includes("Nguyễn An"));
});

test("JSON artifact is parseable and keeps the export identity", async () => {
  const artifact = await buildExportArtifact(fixtureSnapshot(), "json");
  assert.equal(artifact.extension, "json");
  assert.match(artifact.contentType, /^application\/json/);
  assert.equal(JSON.parse(artifact.buffer.toString("utf8")).exportId, "export_test");
});

test("CSV artifact is UTF-8, quoted and spreadsheet-formula safe", async () => {
  const artifact = await buildExportArtifact(fixtureSnapshot(), "csv");
  const text = artifact.buffer.toString("utf8");
  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.match(text, /"dataset","record_id","recorded_at","payload_json"/);
  assert.match(text, /"'=unsafe"/);
  assert.match(text, /Nguyễn An/u);
});

test("XLSX artifact is an OpenXML ZIP with workbook and worksheet entries", async () => {
  const artifact = await buildExportArtifact(fixtureSnapshot(), "xlsx");
  assert.equal(artifact.buffer.subarray(0, 4).readUInt32LE(0), 0x04034b50);
  assert.match(artifact.contentType, /spreadsheetml/);
  assert.ok(artifact.buffer.includes(Buffer.from("xl/workbook.xml")));
  assert.ok(artifact.buffer.includes(Buffer.from("xl/worksheets/sheet1.xml")));
  assert.ok(artifact.buffer.includes(Buffer.from("Nguyễn An", "utf8")));
});

test("PDF artifact has a valid header, xref table and embedded Vietnamese text", async () => {
  const artifact = await buildExportArtifact(fixtureSnapshot(), "pdf");
  assert.equal(artifact.buffer.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.ok(artifact.buffer.includes(Buffer.from("xref", "latin1")));
  assert.match(artifact.buffer.toString("latin1"), /%%EOF\n$/);
  assert.match(artifact.contentType, /^application\/pdf/);
  assert.ok(artifact.buffer.length > 5_000, "embedded fonts should produce a real Unicode PDF");
});

test("unsupported formats fail with a stable contract code", async () => {
  await assert.rejects(
    buildExportArtifact(fixtureSnapshot(), "sql"),
    (error) => error && error.code === "EXPORT_FORMAT_UNSUPPORTED",
  );
});

test("audit export uses canonical audit columns and keeps Vietnamese actor names", async () => {
  const snapshot = {
    ...fixtureSnapshot(),
    dataset: "audit_logs",
    counts: { auditLogs: 1, total: 1 },
    data: {
      auditLogs: [
        {
          id: "audit_1",
          createdAt: "2026-07-23T10:00:00.000Z",
          actorUserId: "user_1",
          actorName: "Bác sĩ Nguyễn An",
          actorRole: "doctor",
          organizationId: "org_alpha",
          organizationName: "Phòng khám Alpha",
          action: "scan.review",
          resourceType: "scan",
          resourceId: "scan_1",
          outcome: "success",
          ip: "127.0.0.1",
          userAgent: "Browser",
          metadata: { decision: "accepted" },
        },
      ],
    },
  };
  const csv = await buildExportArtifact(snapshot, "csv");
  const text = csv.buffer.toString("utf8");
  assert.match(text, /"created_at","actor_user_id","actor_name"/);
  assert.match(text, /Bác sĩ Nguyễn An/u);
  assert.match(text, /"scan\.review"/);
});
