const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, ".test-data", "workspace-access");
const port = "3432";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeSeedDb() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "objects", "org", "org_alpha", "storage", "heart-audio"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "objects", "org", "org_beta", "storage", "heart-audio"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "objects", "org", "org_alpha", "storage", "heart-audio", "file_alpha-alpha.txt"), "alpha");
  fs.writeFileSync(path.join(dataDir, "objects", "org", "org_beta", "storage", "heart-audio", "file_beta-beta.txt"), "beta");

  const createdAt = new Date().toISOString();
  const users = [
    ["usr_platform", "admin", "platform@smarthealth.test", "Platform Admin"],
    ["usr_workspace_admin", "workspace_admin", "workspace-admin@alpha.test", "Workspace Admin"],
    ["usr_doctor", "doctor", "doctor@alpha.test", "Doctor"],
    ["usr_technician", "technician", "technician@alpha.test", "Technician"],
    ["usr_billing", "billing", "billing@alpha.test", "Billing"],
    ["usr_viewer", "viewer", "viewer@alpha.test", "Viewer"],
  ].map(([id, role, email, name]) => ({
    id,
    role,
    requestedRole: role === "doctor" ? "doctor" : role,
    roleRequestStatus: role === "doctor" ? "approved" : "approved",
    accountStatus: "active",
    name,
    email,
    password: "12345678",
    organizationId: "org_alpha",
    createdAt,
    updatedAt: createdAt,
  }));

  const memberships = users.map((user) => ({
    id: `mem_${user.id}`,
    userId: user.id,
    organizationId: "org_alpha",
    role: user.role === "admin" ? "platform_admin" : user.role,
    createdAt,
  }));

  const db = {
    version: 1,
    createdAt,
    updatedAt: createdAt,
    organizations: [
      {
        id: "org_alpha",
        name: "Alpha Remote Clinic",
        type: "clinic",
        workspaceType: "clinic",
        packageId: "pkg_test",
        subscriptionStatus: "active",
        billingCycle: "monthly",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "org_beta",
        name: "Beta Hospital",
        type: "hospital",
        workspaceType: "hospital",
        packageId: "pkg_test",
        subscriptionStatus: "active",
        billingCycle: "monthly",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    servicePackages: [
      {
        id: "pkg_test",
        name: "Workspace Test",
        type: "basic",
        segment: "organization",
        price: 1000,
        currency: "VND",
        duration: "monthly",
        maxDevices: 2,
        maxDoctors: 2,
        maxPatients: 10,
        storageGb: 1,
        aiMonthly: 100,
        retentionDays: 30,
        features: {},
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    users,
    memberships,
    patients: [
      { id: "pat_alpha", patientCode: "ALPHA-001", name: "Alpha Patient", organizationId: "org_alpha", createdAt, updatedAt: createdAt },
      { id: "pat_beta", patientCode: "BETA-001", name: "Beta Patient", organizationId: "org_beta", createdAt, updatedAt: createdAt },
    ],
    devices: [
      { id: "dev_alpha", name: "Alpha Device", type: "stethoscope", status: "available", organizationId: "org_alpha", connected: false, createdAt, updatedAt: createdAt },
      { id: "dev_beta", name: "Beta Device", type: "stethoscope", status: "available", organizationId: "org_beta", connected: false, createdAt, updatedAt: createdAt },
    ],
    scans: [
      { id: "scan_alpha", patientId: "pat_alpha", patientName: "Alpha Patient", organizationId: "org_alpha", status: "completed", createdAt, updatedAt: createdAt },
      { id: "scan_beta", patientId: "pat_beta", patientName: "Beta Patient", organizationId: "org_beta", status: "completed", createdAt, updatedAt: createdAt },
    ],
    storageFiles: [
      {
        id: "file_alpha",
        bucket: "heart-audio",
        name: "alpha.txt",
        objectKey: "org/org_alpha/storage/heart-audio/file_alpha-alpha.txt",
        storageProvider: "local",
        contentType: "text/plain",
        type: "txt",
        byteSize: 5,
        visibility: "private",
        uploader: "Workspace Admin",
        createdByUserId: "usr_workspace_admin",
        organizationId: "org_alpha",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "file_beta",
        bucket: "heart-audio",
        name: "beta.txt",
        objectKey: "org/org_beta/storage/heart-audio/file_beta-beta.txt",
        storageProvider: "local",
        contentType: "text/plain",
        type: "txt",
        byteSize: 4,
        visibility: "private",
        uploader: "Beta",
        organizationId: "org_beta",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    exports: [
      { id: "export_alpha", organizationId: "org_alpha", createdByUserId: "usr_workspace_admin", format: "json", status: "ready", downloadUrl: "/api/exports/download/export_alpha.json", createdAt },
      { id: "export_beta", organizationId: "org_beta", createdByUserId: "usr_platform", format: "json", status: "ready", downloadUrl: "/api/exports/download/export_beta.json", createdAt },
    ],
    audioFiles: [],
    aiResults: [],
    doctorPatientAccess: [],
    notifications: [],
    sessions: [],
    authSessions: [],
    accessLogs: [],
    auditLogs: [],
    idempotencyKeys: [],
    storageBuckets: [],
    subscriptions: [],
    deviceClaims: [],
    deviceEvents: [],
    notificationDevices: [],
    chatMessages: [],
    settings: {
      storage: { audioQuotaGb: 1, quotaGb: 1, cacheMb: 0 },
      privacy: {},
      stethoscope: {},
      ai: {},
    },
  };

  fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify(db, null, 2));
}

async function waitForHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error("workspace access backend did not start");
}

async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { text };
    }
  }
  return { response, body };
}

async function login(email) {
  const { response, body } = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: email, password: "12345678" }),
  });
  assert.equal(response.status, 200, `login failed for ${email}: ${JSON.stringify(body)}`);
  return {
    user: body.user,
    headers: { Authorization: `Bearer ${body.token}` },
  };
}

async function expectStatus(label, session, pathname, status, options = {}) {
  const headers = { ...(options.headers || {}), ...session.headers };
  const result = await request(pathname, { ...options, headers });
  assert.equal(result.response.status, status, `${label} expected ${status}, got ${result.response.status}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function runScenario() {
  const platform = await login("platform@smarthealth.test");
  const workspaceAdmin = await login("workspace-admin@alpha.test");
  const doctor = await login("doctor@alpha.test");
  const technician = await login("technician@alpha.test");
  const billing = await login("billing@alpha.test");
  const viewer = await login("viewer@alpha.test");

  assert.ok(platform.user.capabilities.includes("platform.workspaces.manage"));
  assert.ok(workspaceAdmin.user.capabilities.includes("workspace.storage.manage"));
  assert.ok(technician.user.capabilities.includes("workspace.devices.manage"));
  assert.ok(!technician.user.capabilities.includes("billing.view"));

  const platformWorkspaces = await expectStatus("platform sees all workspaces", platform, "/api/v1/admin/workspaces", 200);
  assert.equal(platformWorkspaces.workspaces.length, 2);
  const scopedWorkspaces = await expectStatus("workspace admin sees own workspace", workspaceAdmin, "/api/v1/admin/workspaces", 200);
  assert.deepEqual(scopedWorkspaces.workspaces.map((item) => item.id), ["org_alpha"]);

  await expectStatus("workspace admin shares own storage", workspaceAdmin, "/api/v1/admin/storage-files/file_alpha/share", 200, { method: "POST" });
  await expectStatus("workspace admin cannot share cross workspace storage", workspaceAdmin, "/api/v1/admin/storage-files/file_beta/share", 403, { method: "POST" });
  await expectStatus("technician cannot create signed storage url", technician, "/api/v1/admin/storage-files/file_alpha/share", 403, { method: "POST" });
  await expectStatus("viewer cannot list storage", viewer, "/api/v1/admin/storage-files", 403);

  const upload = await expectStatus("workspace admin uploads storage", workspaceAdmin, "/api/v1/admin/storage-files?bucket=heart-audio&filename=delete-me.wav", 201, {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: "RIFF0000WAVEfmt ",
  });
  await expectStatus("workspace admin deletes own uploaded storage", workspaceAdmin, `/api/v1/admin/storage-files/${upload.file.id}`, 200, { method: "DELETE" });
  await expectStatus("billing cannot delete storage", billing, "/api/v1/admin/storage-files/file_alpha", 403, { method: "DELETE" });

  await expectStatus("billing cannot view platform packages", billing, "/api/v1/admin/packages", 403);
  await expectStatus("billing cannot edit package", billing, "/api/v1/admin/packages/pkg_test", 403, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: 2000 }),
  });
  await expectStatus("technician can pair device", technician, "/api/v1/devices/pair", 200, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: "dev_pair_by_tech", name: "Tech Pair Device" }),
  });
  await expectStatus("technician cannot edit package", technician, "/api/v1/admin/packages/pkg_test", 403, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: 3000 }),
  });

  await expectStatus("doctor can read assigned workspace patients", doctor, "/api/v1/patients/pat_alpha", 200);
  await expectStatus("doctor cannot read cross workspace patient", doctor, "/api/v1/patients/pat_beta", 403);
  await expectStatus("workspace admin downloads own export", workspaceAdmin, "/api/v1/exports/download/export_alpha", 200);
  await expectStatus("workspace admin cannot download cross workspace export", workspaceAdmin, "/api/v1/exports/download/export_beta", 403);
  await expectStatus("viewer can open overview", viewer, "/api/v1/admin/overview-stats", 200);
  await expectStatus("viewer cannot edit workspace billing fields", viewer, "/api/v1/admin/workspaces/org_alpha", 403, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: "pkg_test" }),
  });
}

async function main() {
  writeSeedDb();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: port,
      AUDIO_UDP_PORT: "3433",
      DATA_BACKEND: "json",
      DATA_DIR: dataDir,
      AUTH_MODE: "demo",
      FIREBASE_AUTH_ENABLED: "false",
      OBJECT_STORAGE_PROVIDER: "local",
      LOCAL_OBJECT_STORAGE_DIR: path.join(dataDir, "objects"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth();
    await runScenario();
    console.log("workspace access smoke test passed");
  } finally {
    child.kill();
    await delay(300);
    if (stderr) {
      process.stderr.write(stderr);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
