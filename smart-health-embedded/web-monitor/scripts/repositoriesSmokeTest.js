const assert = require("node:assert/strict");
const { createRepositories } = require("../src/repositories");

const db = {
  organizations: [
    {
      id: "org_portal",
      name: "Runtime name",
      address: "12 Đường Sức Khỏe",
      ownerUserId: "user_portal",
      requestMetadata: { doctorCount: 4 },
    },
  ],
  users: [
    {
      id: "user_portal",
      roleRequestDocuments: [{ id: "doctor_doc_1", name: "license.pdf" }],
    },
  ],
  memberships: [],
  patients: [{ id: "patient_stale", name: "Stale Patient", organizationId: "org_stale" }],
  devices: [{ id: "device_portal", assignedPatientId: "patient_portal" }],
  scans: [{ id: "scan_stale", patientId: "patient_stale", organizationId: "org_stale" }],
  audioFiles: [],
  aiResults: [],
  deviceEvents: [],
  notificationDevices: [],
  notifications: [],
  auditLogs: [],
};

const rows = {
  organizations: [{ id: "org_portal", name: "SQL name", type: "clinic" }],
  users: [{ id: "user_portal", email: "doctor@example.com", role: "doctor", name: "Doctor" }],
  memberships: [],
  patients: [],
  devices: [{ id: "device_portal", name: "SH-01", type: "stethoscope", status: "active" }],
  scan_sessions: [],
  audio_files: [],
  ai_results: [],
  device_events: [],
  notification_devices: [],
  notifications: [],
  audit_logs: [],
};

const guardChecks = {
  userPatientFk: false,
  patientOwnerFk: false,
  devicePairedUserFk: false,
};

const pool = {
  async query(sql) {
    const text = String(sql);
    if (text.includes("INSERT INTO users")) {
      guardChecks.userPatientFk = text.includes("EXISTS (SELECT 1 FROM patients WHERE id = $13)");
    }
    if (text.includes("INSERT INTO patients")) {
      guardChecks.patientOwnerFk = text.includes("EXISTS (SELECT 1 FROM users WHERE id = $3)");
    }
    if (text.includes("INSERT INTO devices")) {
      guardChecks.devicePairedUserFk = text.includes("EXISTS (SELECT 1 FROM users WHERE id = $3)");
    }
    const match = text.match(/FROM\s+([a-z_]+)/i);
    return { rows: match ? rows[match[1]] || [] : [] };
  },
};

async function main() {
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_1`,
    nowIso: () => "2026-06-21T00:00:00.000Z",
    getPool: () => pool,
  });

  await repositories.hydrateCoreState();

  assert.equal(db.organizations[0].name, "SQL name");
  assert.equal(db.organizations[0].address, "12 Đường Sức Khỏe");
  assert.equal(db.organizations[0].ownerUserId, "user_portal");
  assert.deepEqual(db.organizations[0].requestMetadata, { doctorCount: 4 });
  assert.equal(db.users[0].email, "doctor@example.com");
  assert.equal(db.users[0].roleRequestDocuments[0].id, "doctor_doc_1");
  assert.deepEqual(db.patients, []);
  assert.deepEqual(db.scans, []);
  assert.equal(db.devices[0].status, "active");
  assert.equal(db.devices[0].assignedPatientId, "patient_portal");

  await repositories.users.save({
    id: "user_stale_patient",
    email: "stale-patient@example.com",
    role: "patient",
    name: "Stale Patient User",
    patientId: "missing_patient",
  });
  await repositories.patients.save({
    id: "patient_stale_owner",
    patientCode: "STALE-OWNER",
    name: "Patient With Missing Owner",
    ownerUserId: "missing_user",
  });
  await repositories.devices.save({
    id: "device_stale_user",
    name: "Device With Missing User",
    pairedUserId: "missing_user",
  });
  rows.patients = [{ id: "patient_sql", patient_code: "SQL-1", name: "SQL Patient" }];
  const listedPatients = await repositories.patients.list();
  assert.equal(listedPatients.some((patient) => patient.id === "patient_sql"), true);
  assert.equal(listedPatients.some((patient) => patient.id === "patient_stale_owner"), true);
  const listedDevices = await repositories.devices.list();
  assert.equal(listedDevices.some((device) => device.id === "device_portal"), true);
  assert.equal(listedDevices.some((device) => device.id === "device_stale_user"), true);
  assert.equal(guardChecks.userPatientFk, true);
  assert.equal(guardChecks.patientOwnerFk, true);
  assert.equal(guardChecks.devicePairedUserFk, true);
  console.log("Repository portal metadata smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
