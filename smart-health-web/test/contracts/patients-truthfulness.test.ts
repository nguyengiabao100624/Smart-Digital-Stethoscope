import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const listPath = new URL(
  "../../src/app/pages/portal/PatientsPage.tsx",
  import.meta.url,
);
const detailPath = new URL(
  "../../src/app/pages/portal/PatientDetail.tsx",
  import.meta.url,
);
const fieldsPath = new URL(
  "../../src/app/components/PatientEditorFields.tsx",
  import.meta.url,
);
const importPath = new URL(
  "../../src/app/pages/portal/PatientImportPage.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("patient routes use canonical primitives and responsive browser layouts", async () => {
  const [list, detail] = await Promise.all([
    readFile(listPath, "utf8"),
    readFile(detailPath, "utf8"),
  ]);
  for (const source of [list, detail]) {
    assert.match(source, /components\/ui\/card/);
    assert.doesNotMatch(
      source,
      /glass-panel|premium-button|hero-gradient-text/,
    );
  }
  assert.match(list, /hidden overflow-hidden[\s\S]*md:block/);
  assert.match(list, /md:hidden/);
  assert.match(detail, /xl:grid-cols/);
});

test("patient operations never treat patientCode as the backend resource id", async () => {
  const [list, detail] = await Promise.all([
    readFile(listPath, "utf8"),
    readFile(detailPath, "utf8"),
  ]);
  assert.match(list, /to=\{`\/portal\/patients\/\$\{patient\.id\}`\}/);
  assert.match(
    detail,
    /deletePatient\(\s*patient\.id,\s*attempt\.idempotencyKey,?\s*\)/,
  );
  assert.match(detail, /parsePatientDeleteOutcome\(response, patient\.id\)/);
  assert.doesNotMatch(list, /patient\.patientCode\s*\|\|\s*patient\.id/);
  assert.doesNotMatch(detail, /patientCode[^\n]+deletePatient/);
});

test("forms cover structured fields, idempotency, offline and unsaved states", async () => {
  const [list, detail, fields, api] = await Promise.all([
    readFile(listPath, "utf8"),
    readFile(detailPath, "utf8"),
    readFile(fieldsPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);
  for (const field of [
    "dateOfBirth",
    "patientCode",
    "bloodType",
    "allergies",
    "emergencyName",
    "emergencyPhone",
    "emergencyRelationship",
  ]) {
    assert.match(fields, new RegExp(field));
  }
  assert.match(list, /resolvePatientOperationAttempt/);
  assert.match(detail, /resolvePatientOperationAttempt/);
  assert.match(detail, /beforeunload/);
  assert.match(list, /Đang ngoại tuyến/);
  assert.match(detail, /Đang ngoại tuyến/);
  assert.match(api, /"Idempotency-Key"/);
  assert.doesNotMatch(detail, /window\.confirm/);
});

test("missing scan summary is not converted to a fabricated zero", async () => {
  const list = await readFile(listPath, "utf8");
  assert.match(list, /patient\.scanCount === undefined/);
  assert.match(list, /Chưa có số liệu/);
  assert.doesNotMatch(list, /patient\.scanCount\s*\|\|\s*0/);
});

test("patient CSV import is a server-validated atomic workflow, not sequential client creation", async () => {
  const source = await readFile(importPath, "utf8");
  assert.match(source, /validatePatientImport/);
  assert.match(source, /getPatientImportBatch/);
  assert.match(source, /commitPatientImport/);
  assert.match(source, /createPatientImportIdempotencyKey/);
  assert.match(source, /validationKeyRef\.current/);
  assert.match(source, /commitKeyRef\.current/);
  assert.match(source, /beforeunload/);
  assert.match(source, /PAGE_SIZE\s*=\s*50/);
  assert.match(source, /navigator\.onLine/);
  assert.doesNotMatch(source, /createPatient\s*\(/);
  assert.doesNotMatch(source, /glass-panel|premium-button|hero-gradient-text|parseLine/);
});
