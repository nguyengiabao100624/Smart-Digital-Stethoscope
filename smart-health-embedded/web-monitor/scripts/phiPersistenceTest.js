const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { decryptJson, encryptJson } = require("../src/cryptoPhi");
const { JsonDataStore } = require("../src/dataStore");
const { createRepositories } = require("../src/repositories");
const { migratePostgresPhi } = require("./migratePhiEncryption");

const ENV = {
  PHI_ENCRYPTION_KEY: "test-only-phi-encryption-key-material-32-bytes-minimum",
  PHI_ENCRYPTION_KEY_VERSION: "test-v1",
};

test("PHI envelopes are versioned, AAD-bound, and fail closed with the wrong context", () => {
  const value = { patientName: "SYNTHETIC-PHI-MARKER", allergies: ["test"] };
  const envelope = encryptJson(value, ENV, "workspace-a:patient:patient-a");

  assert.equal(envelope.encrypted, true);
  assert.equal(envelope.formatVersion, 1);
  assert.equal(envelope.keyVersion, "test-v1");
  assert.equal(JSON.stringify(envelope).includes("SYNTHETIC-PHI-MARKER"), false);
  assert.deepEqual(
    decryptJson(envelope, ENV, "workspace-a:patient:patient-a"),
    value,
  );
  assert.throws(
    () => decryptJson(envelope, ENV, "workspace-b:patient:patient-a"),
    (error) => error?.code === "PHI_DECRYPTION_FAILED",
  );
});

test("JSON runtime state persists ciphertext and restores the authorized domain object", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-phi-store-"));
  const dbFile = path.join(directory, "db.json");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new JsonDataStore({
    dbFile,
    createEmptyDb: () => ({}),
    normalizeDb: (value) => value,
    ensureDataDirs: () => fs.mkdirSync(directory, { recursive: true }),
    env: ENV,
  });
  const state = { patients: [{ id: "patient-a", name: "SYNTHETIC-PHI-MARKER" }] };

  await store.save(state);
  const raw = fs.readFileSync(dbFile, "utf8");
  assert.equal(raw.includes("SYNTHETIC-PHI-MARKER"), false);
  assert.deepEqual(await store.load(), state);
});

test("normalized patient, scan, and AI writes contain envelopes instead of PHI plaintext", async (t) => {
  const previousKey = process.env.PHI_ENCRYPTION_KEY;
  const previousVersion = process.env.PHI_ENCRYPTION_KEY_VERSION;
  process.env.PHI_ENCRYPTION_KEY = ENV.PHI_ENCRYPTION_KEY;
  process.env.PHI_ENCRYPTION_KEY_VERSION = ENV.PHI_ENCRYPTION_KEY_VERSION;
  t.after(() => {
    if (previousKey === undefined) delete process.env.PHI_ENCRYPTION_KEY;
    else process.env.PHI_ENCRYPTION_KEY = previousKey;
    if (previousVersion === undefined) delete process.env.PHI_ENCRYPTION_KEY_VERSION;
    else process.env.PHI_ENCRYPTION_KEY_VERSION = previousVersion;
  });
  const statements = [];
  const pool = {
    async query(sql, parameters = []) {
      statements.push({ sql: String(sql), parameters });
      return { rows: [], rowCount: 0 };
    },
  };
  const db = { patients: [], scans: [], aiResults: [] };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    getPool: () => pool,
    createId: (prefix) => `${prefix}-test`,
    nowIso: () => "2026-07-27T00:00:00.000Z",
    onSqlError: (error) => { throw error; },
  });

  await repositories.patients.save({
    id: "patient-a",
    organizationId: "workspace-a",
    patientCode: "SYNTHETIC-PHI-MARKER-CODE",
    name: "SYNTHETIC-PHI-MARKER-NAME",
    dateOfBirth: "1990-01-01",
    allergies: ["SYNTHETIC-PHI-MARKER-ALLERGY"],
  });
  await repositories.scans.save({
    id: "scan-a",
    organizationId: "workspace-a",
    patientId: "patient-a",
    aiSummary: "SYNTHETIC-PHI-MARKER-SCAN",
    doctorNotes: "SYNTHETIC-PHI-MARKER-NOTE",
  });
  await repositories.aiResults.save({
    id: "ai-a",
    scanId: "scan-a",
    summary: "SYNTHETIC-PHI-MARKER-AI",
    rawResult: { clinical: "SYNTHETIC-PHI-MARKER-RAW" },
  });

  const rawParameters = JSON.stringify(statements.map((statement) => statement.parameters));
  assert.equal(rawParameters.includes("SYNTHETIC-PHI-MARKER"), false);
  assert.equal(
    statements
      .flatMap((statement) => statement.parameters)
      .some((value) => typeof value === "string" && value.includes('"encrypted":true')),
    true,
  );
});

test("PostgreSQL PHI backfill is transactional, scrubs compatibility columns, and is verifiable", async (t) => {
  const previousKey = process.env.PHI_ENCRYPTION_KEY;
  process.env.PHI_ENCRYPTION_KEY = ENV.PHI_ENCRYPTION_KEY;
  t.after(() => {
    if (previousKey === undefined) delete process.env.PHI_ENCRYPTION_KEY;
    else process.env.PHI_ENCRYPTION_KEY = previousKey;
  });
  const updates = [];
  const statements = [];
  const client = {
    async query(sql, parameters = []) {
      const text = String(sql).trim();
      statements.push(text);
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text) || text.includes("pg_advisory_xact_lock")) {
        return { rows: [] };
      }
      if (text.startsWith("SELECT id, state FROM app_runtime_state")) {
        return { rows: [{ id: "default", state: { patient: "SYNTHETIC-PHI-MARKER-RUNTIME" } }] };
      }
      if (text.startsWith("SELECT * FROM patients")) {
        return { rows: [{
          id: "patient-a", organization_id: "workspace-a", patient_code: "code-a",
          name: "SYNTHETIC-PHI-MARKER-PATIENT", allergies: [], emergency_contact: {},
        }] };
      }
      if (text.startsWith("SELECT id, organization_id, ai_summary")) {
        return { rows: [{
          id: "scan-a", organization_id: "workspace-a",
          ai_summary: "SYNTHETIC-PHI-MARKER-SCAN", doctor_notes: "note",
        }] };
      }
      if (text.startsWith("SELECT id, scan_id, summary")) {
        return { rows: [{
          id: "ai-a", scan_id: "scan-a", summary: "SYNTHETIC-PHI-MARKER-AI",
          raw_result: { marker: "SYNTHETIC-PHI-MARKER-RAW" },
        }] };
      }
      if (text.startsWith("UPDATE")) {
        updates.push({ text, parameters });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    },
    release() {},
  };

  const counts = await migratePostgresPhi({ connect: async () => client });
  assert.deepEqual(counts, { runtimeState: 1, patients: 1, scans: 1, aiResults: 1 });
  assert.equal(statements.includes("COMMIT"), true);
  assert.equal(statements.includes("ROLLBACK"), false);
  assert.equal(JSON.stringify(updates).includes("SYNTHETIC-PHI-MARKER"), false);
  assert.equal(updates.some((update) => update.text.includes("name = 'Encrypted patient'")), true);
});
