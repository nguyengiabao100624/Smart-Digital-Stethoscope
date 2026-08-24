"use strict";

const { Pool } = require("pg");
const { decryptJson, encryptJson, isPhiEncryptionConfigured } = require("../src/cryptoPhi");
const { protectPhiRecord, unprotectPhiRecord } = require("../src/phiPersistence");

function jsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function dateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function assertRoundTrip(envelope, expected, context) {
  const actual = decryptJson(envelope, process.env, context);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const error = new Error("PHI encryption round-trip verification failed");
    error.code = "PHI_MIGRATION_VERIFICATION_FAILED";
    throw error;
  }
}

async function migratePostgresPhi(pool) {
  const client = await pool.connect();
  const counts = { runtimeState: 0, patients: 0, scans: 0, aiResults: 0 };
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["shcare-phi-backfill-v1"]);

    const runtimeStates = await client.query("SELECT id, state FROM app_runtime_state FOR UPDATE");
    for (const row of runtimeStates.rows) {
      const state = jsonObject(row.state);
      if (state.encrypted === true) continue;
      const context = `runtime-state:${row.id}`;
      const envelope = encryptJson(state, process.env, context);
      assertRoundTrip(envelope, state, context);
      await client.query(
        "UPDATE app_runtime_state SET state = $2::jsonb, updated_at = now() WHERE id = $1",
        [row.id, JSON.stringify(envelope)],
      );
      counts.runtimeState += 1;
    }

    const patients = await client.query(
      "SELECT * FROM patients WHERE phi_payload IS NULL OR COALESCE(phi_payload->>'encrypted', 'false') <> 'true' FOR UPDATE",
    );
    for (const row of patients.rows) {
      const phi = {
        patientCode: row.patient_code || row.id,
        name: row.name || row.patient_code || row.id,
        age: row.age === null || row.age === undefined ? null : Number(row.age),
        dateOfBirth: dateOnly(row.date_of_birth),
        bloodType: row.blood_type || "",
        allergies: Array.isArray(row.allergies) ? row.allergies : [],
        emergencyContact: jsonObject(row.emergency_contact),
        gender: row.gender || "",
        phone: row.phone || "",
        email: row.email || "",
        address: row.address || "",
        notes: row.notes || "",
        relationship: row.relationship || "",
        doctorName: row.doctor_name || "",
      };
      const envelope = protectPhiRecord("patient", row.id, row.organization_id, phi);
      const restored = unprotectPhiRecord("patient", row.id, row.organization_id, envelope);
      if (JSON.stringify(restored) !== JSON.stringify(phi)) {
        throw Object.assign(new Error("Patient PHI backfill verification failed"), {
          code: "PHI_MIGRATION_VERIFICATION_FAILED",
        });
      }
      await client.query(
        `UPDATE patients
         SET patient_code = id, name = 'Encrypted patient', age = NULL, date_of_birth = NULL,
             blood_type = '', allergies = '[]'::jsonb, emergency_contact = '{}'::jsonb,
             gender = '', phone = '', email = '', address = '', notes = '', relationship = '',
             doctor_name = '', phi_payload = $2::jsonb, updated_at = now()
         WHERE id = $1`,
        [row.id, JSON.stringify(envelope)],
      );
      counts.patients += 1;
    }

    const scans = await client.query(
      "SELECT id, organization_id, ai_summary, doctor_notes FROM scan_sessions WHERE phi_payload IS NULL OR COALESCE(phi_payload->>'encrypted', 'false') <> 'true' FOR UPDATE",
    );
    for (const row of scans.rows) {
      const phi = { aiSummary: row.ai_summary || "", doctorNotes: row.doctor_notes || "" };
      const envelope = protectPhiRecord("scan", row.id, row.organization_id, phi);
      if (JSON.stringify(unprotectPhiRecord("scan", row.id, row.organization_id, envelope)) !== JSON.stringify(phi)) {
        throw Object.assign(new Error("Scan PHI backfill verification failed"), {
          code: "PHI_MIGRATION_VERIFICATION_FAILED",
        });
      }
      await client.query(
        "UPDATE scan_sessions SET ai_summary = '', doctor_notes = '', phi_payload = $2::jsonb, updated_at = now() WHERE id = $1",
        [row.id, JSON.stringify(envelope)],
      );
      counts.scans += 1;
    }

    const aiResults = await client.query(
      "SELECT id, scan_id, summary, raw_result FROM ai_results WHERE phi_payload IS NULL OR COALESCE(phi_payload->>'encrypted', 'false') <> 'true' FOR UPDATE",
    );
    for (const row of aiResults.rows) {
      const phi = { summary: row.summary || "", rawResult: jsonObject(row.raw_result) };
      const envelope = protectPhiRecord("ai_result", row.id, row.scan_id, phi);
      if (JSON.stringify(unprotectPhiRecord("ai_result", row.id, row.scan_id, envelope)) !== JSON.stringify(phi)) {
        throw Object.assign(new Error("AI PHI backfill verification failed"), {
          code: "PHI_MIGRATION_VERIFICATION_FAILED",
        });
      }
      await client.query(
        "UPDATE ai_results SET summary = '', raw_result = '{}'::jsonb, phi_payload = $2::jsonb, updated_at = now() WHERE id = $1",
        [row.id, JSON.stringify(envelope)],
      );
      counts.aiResults += 1;
    }

    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  if (!isPhiEncryptionConfigured(process.env)) {
    throw Object.assign(new Error("PHI_ENCRYPTION_KEY must contain at least 32 characters"), {
      code: "PHI_KEY_REQUIRED",
    });
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for PostgreSQL PHI backfill");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const counts = await migratePostgresPhi(pool);
    console.log(`PHI backfill complete: ${JSON.stringify(counts)}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`PHI backfill failed: ${error.code || "ERROR"}: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { migratePostgresPhi };
