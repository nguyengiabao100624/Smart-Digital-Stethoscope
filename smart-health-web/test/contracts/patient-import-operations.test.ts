import assert from "node:assert/strict";
import test from "node:test";

import {
  createPatientImportIdempotencyKey,
  parsePatientImportCommitOutcome,
  parsePatientImportValidationOutcome,
} from "../../src/lib/patient-import-operations.ts";

function batch(status: "validated" | "invalid" | "committed" = "validated") {
  const valid = status !== "invalid";
  const committed = status === "committed";
  return {
    id: "pimport_1",
    organizationId: "org_1",
    fileName: "patients.csv",
    fileSizeBytes: 120,
    status,
    rowCount: 1,
    validCount: valid ? 1 : 0,
    invalidCount: valid ? 0 : 1,
    duplicateCount: 0,
    importedCount: committed ? 1 : 0,
    patientIds: committed ? ["pat_1"] : [],
    rows: [
      {
        rowNumber: 2,
        status: valid ? "valid" : "invalid",
        issues: valid
          ? []
          : [
              {
                field: "email",
                code: "PATIENT_IMPORT_EMAIL_INVALID",
                message: "Email không hợp lệ",
                severity: "error",
              },
            ],
        patient: {
          id: valid ? "pat_1" : "",
          patientCode: "BN-001",
          name: "Nguyễn An",
          dateOfBirth: "1990-01-02",
          gender: "male",
          phone: "0901234567",
          email: "an@example.com",
          address: "",
          bloodType: "O+",
          allergies: [],
          emergencyContact: {},
          notes: "",
          profileType: "patient",
        },
      },
    ],
    version: committed ? 2 : 1,
    expiresAt: "2026-07-24T00:00:00.000Z",
    committedAt: committed ? "2026-07-23T01:00:00.000Z" : "",
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: committed
      ? "2026-07-23T01:00:00.000Z"
      : "2026-07-23T00:00:00.000Z",
  };
}

test("strictly parses validation and commit receipts", () => {
  const validation = parsePatientImportValidationOutcome({
    batch: batch("validated"),
    replayed: false,
  });
  assert.equal(validation.batch.rows[0].patient.id, "pat_1");
  const commit = parsePatientImportCommitOutcome(
    {
      batch: batch("committed"),
      importedCount: 1,
      patientIds: ["pat_1"],
      replayed: true,
    },
    "pimport_1",
  );
  assert.equal(commit.replayed, true);
});

test("rejects contradictory counts, row state and commit identity", () => {
  const wrongCounts = batch("validated");
  wrongCounts.validCount = 0;
  assert.throws(
    () => parsePatientImportValidationOutcome({ batch: wrongCounts, replayed: false }),
    /tổng số dòng mâu thuẫn/,
  );
  const wrongRow = batch("invalid");
  wrongRow.rows[0].issues = [];
  assert.throws(
    () => parsePatientImportValidationOutcome({ batch: wrongRow, replayed: false }),
    /Trạng thái dòng import mâu thuẫn/,
  );
  assert.throws(
    () =>
      parsePatientImportCommitOutcome(
        {
          batch: batch("committed"),
          importedCount: 1,
          patientIds: ["pat_1"],
          replayed: false,
        },
        "another_batch",
      ),
    /đúng batch/,
  );
});

test("creates operation-scoped idempotency keys", () => {
  const validationKey = createPatientImportIdempotencyKey("validate", "patients.csv");
  const commitKey = createPatientImportIdempotencyKey("commit", "pimport_1");
  assert.match(validationKey, /^portal-patient-import-validate-patients\.csv-/);
  assert.match(commitKey, /^portal-patient-import-commit-pimport_1-/);
  assert.notEqual(validationKey, commitKey);
});
