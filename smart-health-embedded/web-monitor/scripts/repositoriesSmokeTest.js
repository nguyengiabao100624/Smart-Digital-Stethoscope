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
  patients: [],
  devices: [{ id: "device_portal", assignedPatientId: "patient_portal" }],
  scans: [],
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

const pool = {
  async query(sql) {
    const match = String(sql).match(/FROM\s+([a-z_]+)/i);
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
  assert.equal(db.devices[0].status, "active");
  assert.equal(db.devices[0].assignedPatientId, "patient_portal");
  console.log("Repository portal metadata smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
