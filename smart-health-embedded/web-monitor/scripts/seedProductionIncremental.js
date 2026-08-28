/**
 * Production-safe incremental seed script.
 * Only inserts entities missing from the database.
 * Skips users (handled by Firebase auth + managed admin).
 * Uses ON CONFLICT DO NOTHING to be idempotent.
 */
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const seedFile = process.env.DB_FILE || path.join(__dirname, "..", "db", "seeds", "seed-database.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function valueOrNull(value) {
  return value === undefined || value === "" ? null : value;
}

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[INCR-SEED] DATABASE_URL not set");
    process.exit(1);
  }

  const data = readJson(seedFile);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  let insertedDevices = 0;
  let insertedPatients = 0;
  let insertedScans = 0;
  let insertedOrgs = 0;
  let errors = [];

  try {
    // --- Organizations ---
    for (const org of (data.organizations || [])) {
      try {
        const res = await client.query(
          `INSERT INTO organizations (id, name, type, status, slug, contact_email, contact_phone, address, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()), COALESCE($10::timestamptz, now()))
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [
            org.id, org.name || org.id, org.type || "clinic", org.status || "active",
            valueOrNull(org.slug), valueOrNull(org.contactEmail), valueOrNull(org.contactPhone),
            valueOrNull(org.address), toIso(org.createdAt), toIso(org.updatedAt),
          ]
        );
        if (res.rowCount > 0) insertedOrgs++;
      } catch (err) {
        errors.push(`org ${org.id}: ${err.message}`);
      }
    }

    // --- Devices ---
    for (const dev of (data.devices || [])) {
      try {
        const res = await client.query(
          `INSERT INTO devices (
             id, organization_id, paired_user_id, name, type, status, signal, battery, connected,
             firmware_version, manufacturer, model, serial_number,
             last_seen_at, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9,
             $10, $11, $12, $13,
             $14, COALESCE($15::timestamptz, now()), COALESCE($16::timestamptz, now())
           ) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [
            dev.id, valueOrNull(dev.organizationId), valueOrNull(dev.pairedUserId),
            dev.name || dev.id, dev.type || "stethoscope", dev.status || "available",
            dev.signal === undefined ? null : dev.signal,
            dev.battery === undefined ? null : dev.battery,
            Boolean(dev.connected),
            valueOrNull(dev.firmwareVersion || dev.firmware),
            valueOrNull(dev.manufacturer), valueOrNull(dev.model), valueOrNull(dev.serialNumber),
            toIso(dev.lastSeenAt), toIso(dev.createdAt), toIso(dev.updatedAt),
          ]
        );
        if (res.rowCount > 0) insertedDevices++;
      } catch (err) {
        errors.push(`device ${dev.id}: ${err.message}`);
      }
    }

    // --- Patients ---
    for (const pat of (data.patients || [])) {
      try {
        const res = await client.query(
          `INSERT INTO patients (
             id, organization_id, name, date_of_birth, gender, phone, email, address,
             blood_type, medical_history, notes, status,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4::date, $5, $6, $7, $8,
             $9, $10, $11, $12,
             COALESCE($13::timestamptz, now()), COALESCE($14::timestamptz, now())
           ) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [
            pat.id, valueOrNull(pat.organizationId),
            pat.name || "Bệnh nhân",
            valueOrNull(pat.dateOfBirth || pat.dob), valueOrNull(pat.gender),
            valueOrNull(pat.phone), valueOrNull(pat.email), valueOrNull(pat.address),
            valueOrNull(pat.bloodType), valueOrNull(pat.medicalHistory), valueOrNull(pat.notes),
            pat.status || "active",
            toIso(pat.createdAt), toIso(pat.updatedAt),
          ]
        );
        if (res.rowCount > 0) insertedPatients++;
      } catch (err) {
        errors.push(`patient ${pat.id}: ${err.message}`);
      }
    }

    // --- Scans ---
    for (const scan of (data.scans || [])) {
      try {
        const res = await client.query(
          `INSERT INTO scan_sessions (
             id, patient_id, device_id, doctor_user_id, organization_id,
             body_position, status, duration_seconds, ai_label, ai_confidence,
             notes, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8, $9, $10,
             $11, COALESCE($12::timestamptz, now()), COALESCE($13::timestamptz, now())
           ) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [
            scan.id, valueOrNull(scan.patientId), valueOrNull(scan.deviceId),
            valueOrNull(scan.doctorUserId || scan.doctorId), valueOrNull(scan.organizationId),
            valueOrNull(scan.bodyPosition), scan.status || "completed",
            scan.durationSeconds || scan.duration || null,
            valueOrNull(scan.aiLabel), scan.aiConfidence || null,
            valueOrNull(scan.notes),
            toIso(scan.createdAt), toIso(scan.updatedAt),
          ]
        );
        if (res.rowCount > 0) insertedScans++;
      } catch (err) {
        errors.push(`scan ${scan.id}: ${err.message}`);
      }
    }

    console.log(`[INCR-SEED] Results: orgs=${insertedOrgs}, devices=${insertedDevices}, patients=${insertedPatients}, scans=${insertedScans}`);
    if (errors.length > 0) {
      console.warn(`[INCR-SEED] ${errors.length} non-fatal errors:`);
      errors.forEach(e => console.warn(`  - ${e}`));
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[INCR-SEED] Fatal:", err.message);
  process.exit(1);
});
