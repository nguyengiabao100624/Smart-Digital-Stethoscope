"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRepositories } = require("../src/repositories");

function createFixture() {
  let sequence = 0;
  let failSave = false;
  const db = {
    organizations: [{ id: "org_import", name: "Import Clinic", status: "active" }],
    users: [{ id: "usr_import", role: "doctor", accountStatus: "active" }],
    memberships: [{
      id: "mem_import",
      organizationId: "org_import",
      userId: "usr_import",
      role: "doctor",
      status: "active",
    }],
    patients: [],
    patientImportBatches: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      if (failSave) throw new Error("save failed");
    },
    createId: (prefix) => `${prefix}_${++sequence}`,
    nowIso: () => "2026-07-23T10:00:00.000Z",
    getPool: () => null,
  });
  return { db, repositories, setFailSave: (value) => { failSave = value; } };
}

function patient(id, patientCode, email) {
  return {
    id,
    organizationId: "org_import",
    patientCode,
    name: `Patient ${id}`,
    dateOfBirth: "1990-01-01",
    gender: "unknown",
    phone: "",
    email,
    address: "",
    bloodType: "unknown",
    allergies: [],
    emergencyContact: {},
    notes: "",
    profileType: "patient",
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
  };
}

function batch(overrides = {}) {
  const patients = [
    patient("patient_import_1", "IMP-001", "one@example.test"),
    patient("patient_import_2", "IMP-002", "two@example.test"),
  ];
  return {
    id: "batch_import_1",
    organizationId: "org_import",
    actorUserId: "usr_import",
    fileName: "patients.csv",
    fileSizeBytes: 256,
    fileSha256: "a".repeat(64),
    status: "validated",
    rowCount: patients.length,
    validCount: patients.length,
    invalidCount: 0,
    duplicateCount: 0,
    rows: patients.map((entry, index) => ({
      rowNumber: index + 2,
      status: "valid",
      issues: [],
      patient: entry,
    })),
    patientIds: [],
    importedCount: 0,
    version: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    committedAt: "",
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
    ...overrides,
  };
}

function authorization() {
  return {
    actorUserId: "usr_import",
    organizationId: "org_import",
    action: "patient.import",
    authorization: {
      kind: "workspace",
      actorUserId: "usr_import",
      organizationId: "org_import",
      operation: "create",
    },
  };
}

function idempotency(operation, key, fingerprint) {
  return { scope: "usr_import:org_import", operation, key, fingerprint };
}

async function validateFixture(fixture, value = batch()) {
  return fixture.repositories.patientImports.createWithAudit(
    value,
    authorization(),
    idempotency("patient.import.validate", "validate-key", "validate-fingerprint"),
  );
}

test("concurrent validation and commit retries persist one exact atomic outcome", async () => {
  const fixture = createFixture();
  const value = batch();
  const [validationLeft, validationRight] = await Promise.all([
    validateFixture(fixture, value),
    validateFixture(fixture, value),
  ]);
  assert.equal(validationLeft.batch.id, validationRight.batch.id);
  assert.equal(Number(validationLeft.replayed) + Number(validationRight.replayed), 1);
  assert.equal(fixture.db.patientImportBatches.length, 1);
  assert.equal(fixture.db.auditLogs.filter((entry) => entry.action === "patient.import.validate").length, 1);

  const commitKey = idempotency(
    `patient.import.commit:${value.id}`,
    "commit-key",
    "commit-fingerprint",
  );
  const [commitLeft, commitRight] = await Promise.all([
    fixture.repositories.patientImports.commitWithAudit(value.id, authorization(), commitKey),
    fixture.repositories.patientImports.commitWithAudit(value.id, authorization(), commitKey),
  ]);
  assert.equal(Number(commitLeft.replayed) + Number(commitRight.replayed), 1);
  assert.equal(commitLeft.importedCount, 2);
  assert.deepEqual(commitLeft.patientIds, commitRight.patientIds);
  assert.equal(fixture.db.patients.length, 2);
  assert.equal(new Set(fixture.db.patients.map((entry) => entry.id)).size, 2);
  assert.equal(fixture.db.auditLogs.filter((entry) => entry.action === "patient.import.commit").length, 1);
  assert.equal(fixture.db.patientImportBatches[0].status, "committed");
});

test("save failure rolls validation and commit back without partial patients or receipts", async () => {
  const validationFailure = createFixture();
  validationFailure.setFailSave(true);
  await assert.rejects(() => validateFixture(validationFailure), /save failed/);
  assert.equal(validationFailure.db.patientImportBatches.length, 0);
  assert.equal(validationFailure.db.auditLogs.length, 0);
  assert.equal(validationFailure.db.idempotencyKeys.length, 0);

  const commitFailure = createFixture();
  await validateFixture(commitFailure);
  commitFailure.setFailSave(true);
  await assert.rejects(
    () => commitFailure.repositories.patientImports.commitWithAudit(
      "batch_import_1",
      authorization(),
      idempotency("patient.import.commit:batch_import_1", "commit-fail-key", "commit-fail-fingerprint"),
    ),
    /save failed/,
  );
  assert.equal(commitFailure.db.patients.length, 0);
  assert.equal(commitFailure.db.patientImportBatches[0].status, "validated");
  assert.equal(commitFailure.db.patientImportBatches[0].importedCount, 0);
  assert.equal(commitFailure.db.auditLogs.filter((entry) => entry.action === "patient.import.commit").length, 0);
  assert.equal(commitFailure.db.idempotencyKeys.length, 1);
});

test("expiry and post-validation duplicates fail closed before any patient is inserted", async () => {
  const expired = createFixture();
  await validateFixture(expired, batch({ expiresAt: new Date(Date.now() - 1_000).toISOString() }));
  await assert.rejects(
    () => expired.repositories.patientImports.commitWithAudit(
      "batch_import_1",
      authorization(),
      idempotency("patient.import.commit:batch_import_1", "expired-key", "expired-fingerprint"),
    ),
    (error) => error?.code === "PATIENT_IMPORT_BATCH_EXPIRED",
  );
  assert.equal(expired.db.patients.length, 0);

  const duplicate = createFixture();
  await validateFixture(duplicate);
  duplicate.db.patients.push(patient("patient_existing", "IMP-002", "existing@example.test"));
  await assert.rejects(
    () => duplicate.repositories.patientImports.commitWithAudit(
      "batch_import_1",
      authorization(),
      idempotency("patient.import.commit:batch_import_1", "duplicate-key", "duplicate-fingerprint"),
    ),
    (error) => error?.code === "PATIENT_IMPORT_DUPLICATES_CHANGED",
  );
  assert.deepEqual(duplicate.db.patients.map((entry) => entry.id), ["patient_existing"]);
  assert.equal(duplicate.db.patientImportBatches[0].status, "validated");
  assert.equal(duplicate.db.auditLogs.filter((entry) => entry.action === "patient.import.commit").length, 0);
});
