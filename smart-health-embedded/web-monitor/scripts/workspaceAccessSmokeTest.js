const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, ".test-data", "workspace-access");
const port = "3432";
const seededClaimCode = "ALPHA12345678";

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPcmChunk({ sampleRate = 16000, seconds = 1 } = {}) {
  const sampleCount = sampleRate * seconds;
  const buffer = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 9000);
    buffer.writeInt16LE(value, index * 2);
  }
  return buffer;
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
    ["usr_platform", "admin", "platform@smarthealth.test", "Platform Admin", "org_alpha"],
    ["usr_workspace_admin", "workspace_admin", "workspace-admin@alpha.test", "Workspace Admin", "org_alpha"],
    ["usr_doctor", "doctor", "doctor@alpha.test", "Doctor", "org_alpha"],
    ["usr_beta_doctor", "doctor", "doctor@beta.test", "Beta Doctor", "org_beta"],
    ["usr_patient", "patient", "patient@alpha.test", "Patient Owner", "org_personal_patient"],
    ["usr_technician", "technician", "technician@alpha.test", "Technician", "org_alpha"],
    ["usr_billing", "billing", "billing@alpha.test", "Billing", "org_alpha"],
    ["usr_viewer", "viewer", "viewer@alpha.test", "Viewer", "org_alpha"],
  ].map(([id, role, email, name, organizationId]) => ({
    id,
    role,
    requestedRole: role === "doctor" ? "doctor" : role,
    roleRequestStatus: role === "doctor" ? "approved" : "approved",
    accountStatus: "active",
    name,
    email,
    password: "12345678",
    organizationId,
    createdAt,
    updatedAt: createdAt,
  }));

  const memberships = users.map((user) => ({
    id: `mem_${user.id}`,
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role === "admin" ? "platform_admin" : user.role,
    createdAt,
  }));
  memberships.push({
    id: "mem_usr_doctor_org_beta",
    userId: "usr_doctor",
    organizationId: "org_beta",
    role: "doctor",
    createdAt,
  });

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
      {
        id: "pat_patient_self",
        patientCode: "SELF-001",
        name: "Patient Owner",
        email: "patient@alpha.test",
        organizationId: "org_personal_patient",
        ownerUserId: "usr_patient",
        accountUserId: "usr_patient",
        profileType: "self",
        relationship: "self",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "pat_patient_child",
        patientCode: "FAMILY-001",
        name: "Patient Child",
        organizationId: "org_personal_patient",
        ownerUserId: "usr_patient",
        guardianUserId: "usr_patient",
        profileType: "dependent",
        relationship: "child",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    appointments: [
      {
        id: "appt_alpha",
        organizationId: "org_alpha",
        patientId: "pat_alpha",
        doctorUserId: "usr_doctor",
        createdByUserId: "usr_workspace_admin",
        type: "remote_consultation",
        status: "scheduled",
        startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
        reason: "Alpha follow-up",
        channel: "video",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "appt_beta",
        organizationId: "org_beta",
        patientId: "pat_beta",
        doctorUserId: "usr_beta_doctor",
        createdByUserId: "usr_beta_doctor",
        type: "clinic_visit",
        status: "scheduled",
        startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
        reason: "Beta private visit",
        channel: "clinic",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    devices: [
      { id: "dev_alpha", name: "Alpha Device", type: "stethoscope", status: "available", organizationId: "org_alpha", connected: false, createdAt, updatedAt: createdAt },
      { id: "dev_beta", name: "Beta Device", type: "stethoscope", status: "available", organizationId: "org_beta", connected: false, createdAt, updatedAt: createdAt },
      {
        id: "dev_claim_alpha",
        name: "Alpha Claim Device",
        type: "stethoscope",
        status: "unclaimed",
        organizationId: "org_alpha",
        connected: false,
        claimCodeHash: hashValue(`dev_claim_alpha:${seededClaimCode}`),
        claimCodeExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt,
        updatedAt: createdAt,
      },
    ],
    scans: [
      { id: "scan_alpha", patientId: "pat_alpha", patientName: "Alpha Patient", organizationId: "org_alpha", status: "completed", createdAt, updatedAt: createdAt },
      { id: "scan_alpha_extra", patientId: "pat_alpha", patientName: "Alpha Patient", organizationId: "org_alpha", status: "completed", createdAt, updatedAt: createdAt },
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
    doctorPatientAccess: [
      {
        id: "share_beta_selected_alpha",
        patientId: "pat_alpha",
        doctorUserId: "usr_beta_doctor",
        doctorId: "usr_beta_doctor",
        organizationId: "",
        scope: "selected_scans",
        scanIds: ["scan_alpha"],
        createdAt,
        updatedAt: createdAt,
      },
    ],
    notifications: [
      {
        id: "notif_alpha",
        type: "info",
        title: "Alpha notification",
        message: "Workspace scoped notification",
        organizationId: "org_alpha",
        read: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "notif_beta",
        type: "warning",
        title: "Beta notification",
        message: "Cross workspace notification",
        organizationId: "org_beta",
        read: false,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    sessions: [],
    authSessions: [],
    accessLogs: [],
    auditLogs: [],
    idempotencyKeys: [],
    storageBuckets: [],
    subscriptions: [],
    deviceClaims: [],
    deviceEvents: [
      {
        id: "evt_alpha",
        deviceId: "dev_alpha",
        eventType: "telemetry",
        payload: { online: true },
        createdAt,
      },
      {
        id: "evt_beta",
        deviceId: "dev_beta",
        eventType: "telemetry",
        payload: { online: true },
        createdAt,
      },
    ],
    notificationDevices: [],
    chatMessages: [
      {
        id: "msg_beta_seed",
        role: "user",
        content: "Beta private AI history",
        userId: "usr_beta_doctor",
        organizationId: "org_beta",
        createdAt,
      },
    ],
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

async function requestRaw(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { response, buffer, text: buffer.toString("utf8") };
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

async function expectLoginPassword(label, email, password, status) {
  const { response, body } = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: email, password }),
  });
  assert.equal(response.status, status, `${label} expected ${status}, got ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function expectStatus(label, session, pathname, status, options = {}) {
  const headers = { ...(options.headers || {}), ...session.headers };
  const result = await request(pathname, { ...options, headers });
  assert.equal(result.response.status, status, `${label} expected ${status}, got ${result.response.status}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function expectRawStatus(label, session, pathname, status, options = {}) {
  const headers = { ...(options.headers || {}), ...session.headers };
  const result = await requestRaw(pathname, { ...options, headers });
  assert.equal(result.response.status, status, `${label} expected ${status}, got ${result.response.status}: ${result.text}`);
  return result;
}

async function expectPublicStatus(label, pathname, status, options = {}) {
  const result = await request(pathname, options);
  assert.equal(result.response.status, status, `${label} expected ${status}, got ${result.response.status}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function runScenario() {
  const platform = await login("platform@smarthealth.test");
  const workspaceAdmin = await login("workspace-admin@alpha.test");
  const doctor = await login("doctor@alpha.test");
  const betaDoctor = await login("doctor@beta.test");
  const patient = await login("patient@alpha.test");
  const technician = await login("technician@alpha.test");
  const billing = await login("billing@alpha.test");
  const viewer = await login("viewer@alpha.test");
  const portalHeaders = { "X-Smart-Health-Surface": "portal" };
  const portalJsonHeaders = { ...portalHeaders, "Content-Type": "application/json" };

  assert.ok(platform.user.capabilities.includes("platform.workspaces.manage"));
  assert.ok(workspaceAdmin.user.capabilities.includes("workspace.storage.manage"));
  assert.ok(patient.user.capabilities.includes("personal.profiles.manage"));
  assert.ok(patient.user.capabilities.includes("personal.sharing.manage"));
  assert.deepEqual(patient.user.allowedSurfaces, ["android"]);
  assert.ok(technician.user.capabilities.includes("workspace.devices.manage"));
  assert.ok(!technician.user.capabilities.includes("billing.view"));
  assert.equal(workspaceAdmin.user.currentWorkspace.patientCount, 1);
  assert.equal(workspaceAdmin.user.currentWorkspace.deviceCount, 2);
  assert.equal(workspaceAdmin.user.currentWorkspace.deviceOnline, 0);
  assert.equal(workspaceAdmin.user.currentWorkspace.alertCount, 2);
  assert.equal(workspaceAdmin.user.currentWorkspace.scanCount, 2);
  const alphaMembership = workspaceAdmin.user.memberships.find((membership) => membership.workspaceId === "org_alpha");
  assert.ok(alphaMembership, "workspace admin /me should include org_alpha membership");
  assert.equal(alphaMembership.patientCount, 1);
  assert.equal(alphaMembership.deviceCount, 2);
  assert.equal(alphaMembership.deviceOnline, 0);
  assert.equal(alphaMembership.alertCount, 2);
  assert.equal(alphaMembership.scanCount, 2);
  const doctorBetaMembership = doctor.user.memberships.find((membership) => membership.workspaceId === "org_beta");
  assert.ok(doctorBetaMembership, "doctor /me should include joined beta membership for Android workspace switching");
  const doctorSwitchedToBeta = await expectStatus("doctor can switch to joined beta workspace through /me", doctor, "/api/v1/me", 200, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId: "org_beta" }),
  });
  assert.equal(doctorSwitchedToBeta.user.organizationId, "org_beta");
  assert.equal(doctorSwitchedToBeta.user.currentWorkspace.id, "org_beta");
  assert.equal(doctorSwitchedToBeta.user.currentWorkspace.patientCount, 1);
  assert.equal(doctorSwitchedToBeta.user.currentWorkspace.deviceCount, 1);
  assert.equal(doctorSwitchedToBeta.user.currentWorkspace.scanCount, 1);
  assert.equal(doctorSwitchedToBeta.user.currentMembership.workspaceId, "org_beta");
  const doctorSwitchedBackToAlpha = await expectStatus("doctor can switch back to alpha workspace through /me", doctor, "/api/v1/me", 200, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId: "org_alpha" }),
  });
  assert.equal(doctorSwitchedBackToAlpha.user.organizationId, "org_alpha");
  assert.equal(doctorSwitchedBackToAlpha.user.currentWorkspace.id, "org_alpha");

  const contactRequest = await expectPublicStatus("public web contact form creates request", "/api/contact", 201, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Smart-Health-Surface": "portal" },
    body: JSON.stringify({
      name: "Clinic Lead",
      email: "lead@example.com",
      phone: "0900000002",
      role: "clinic_manager",
      clinic: "Alpha Remote Clinic",
      scale: "10-20 clinicians",
      message: "Need Smart Health rollout consultation",
    }),
  });
  assert.ok(contactRequest.requestId);

  const platformWorkspaces = await expectStatus("platform sees all workspaces", platform, "/api/v1/admin/workspaces", 200);
  assert.equal(platformWorkspaces.workspaces.length, 2);
  const scopedWorkspaces = await expectStatus("workspace admin sees own workspace", workspaceAdmin, "/api/v1/admin/workspaces", 200);
  assert.deepEqual(scopedWorkspaces.workspaces.map((item) => item.id), ["org_alpha"]);

  const portalStatus = await expectStatus("workspace admin opens portal backend status", workspaceAdmin, "/api/portal/status", 200, {
    headers: portalHeaders,
  });
  assert.equal(portalStatus.ok, true);
  assert.equal(portalStatus.service, "smart-health-backend");
  assert.equal(portalStatus.workspace.id, "org_alpha");
  assert.equal(portalStatus.scoped.patientsCount, 1);
  assert.equal(portalStatus.scoped.devicesCount, 2);
  assert.equal(portalStatus.scoped.scansCount, 2);
  assert.equal(portalStatus.scoped.alertsCount, 2);
  assert.equal(portalStatus.mode.authMode, "demo");
  assert.equal(portalStatus.mode.dataBackend, "json");
  await expectStatus("platform admin is not a portal surface user", platform, "/api/portal/status", 403, {
    headers: portalHeaders,
  });

  const portalOverview = await expectStatus("portal overview resolves through admin stats", workspaceAdmin, "/api/portal/overview", 200, {
    headers: portalHeaders,
  });
  assert.ok(portalOverview.stats);
  const portalMonitoring = await expectStatus("portal monitoring resolves scoped devices and scans", workspaceAdmin, "/api/portal/monitoring", 200, {
    headers: portalHeaders,
  });
  assert.deepEqual(
    portalMonitoring.devices.map((device) => device.id),
    ["dev_alpha", "dev_claim_alpha"],
  );
  assert.deepEqual(portalMonitoring.scans.map((scan) => scan.id), ["scan_alpha", "scan_alpha_extra"]);
  const portalReports = await expectStatus("portal reports resolve workspace summary", workspaceAdmin, "/api/portal/reports", 200, {
    headers: portalHeaders,
  });
  assert.equal(portalReports.summary.patientsCount, 1);
  assert.equal(portalReports.summary.devicesCount, 2);
  const portalAuditLog = await expectStatus("portal audit log resolves", workspaceAdmin, "/api/portal/audit-log", 200, {
    headers: portalHeaders,
  });
  assert.ok(Array.isArray(portalAuditLog.logs));

  const portalPatients = await expectStatus("portal lists only scoped patients", workspaceAdmin, "/api/portal/patients", 200, {
    headers: portalHeaders,
  });
  assert.deepEqual(portalPatients.patients.map((patient) => patient.id), ["pat_alpha"]);
  await expectStatus("portal cannot read cross workspace patient", workspaceAdmin, "/api/portal/patients/pat_beta", 403, {
    headers: portalHeaders,
  });
  const createdPatient = await expectStatus("portal creates patient in current workspace", workspaceAdmin, "/api/portal/patients", 201, {
    method: "POST",
    headers: portalJsonHeaders,
    body: JSON.stringify({
      patientCode: "PORTAL-001",
      name: "Portal Created Patient",
      phone: "0900000001",
      organizationId: "org_beta",
    }),
  });
  assert.equal(createdPatient.patient.organizationId, "org_alpha");
  const updatedPatient = await expectStatus(
    "portal updates created patient",
    workspaceAdmin,
    `/api/portal/patients/${createdPatient.patient.id}`,
    200,
    {
      method: "PATCH",
      headers: portalJsonHeaders,
      body: JSON.stringify({ notes: "Updated through portal smoke" }),
    },
  );
  assert.equal(updatedPatient.patient.notes, "Updated through portal smoke");

  const initialAppointments = await expectStatus("portal lists scoped appointments", workspaceAdmin, "/api/portal/appointments", 200, {
    headers: portalHeaders,
  });
  assert.deepEqual(initialAppointments.appointments.map((appointment) => appointment.id), ["appt_alpha"]);
  await expectStatus("portal cannot read cross workspace appointment", workspaceAdmin, "/api/portal/appointments/appt_beta", 403, {
    headers: portalHeaders,
  });
  const createdAppointment = await expectStatus("portal creates appointment in current workspace", workspaceAdmin, "/api/portal/appointments", 201, {
    method: "POST",
    headers: portalJsonHeaders,
    body: JSON.stringify({
      patientId: "pat_alpha",
      doctorUserId: "usr_doctor",
      type: "remote_consultation",
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
      reason: "Follow-up review",
      organizationId: "org_beta",
    }),
  });
  assert.equal(createdAppointment.appointment.organizationId, "org_alpha");
  assert.equal(createdAppointment.appointment.patientId, "pat_alpha");
  assert.equal(createdAppointment.appointment.doctorUserId, "usr_doctor");
  const updatedAppointment = await expectStatus(
    "portal confirms appointment",
    workspaceAdmin,
    `/api/portal/appointments/${createdAppointment.appointment.id}`,
    200,
    {
      method: "PATCH",
      headers: portalJsonHeaders,
      body: JSON.stringify({ status: "confirmed", notes: "Confirmed through portal smoke" }),
    },
  );
  assert.equal(updatedAppointment.appointment.status, "confirmed");
  const appointmentNotifications = await expectStatus("appointment create emits scoped notification", workspaceAdmin, "/api/portal/notifications", 200, {
    headers: portalHeaders,
  });
  assert.equal(
    appointmentNotifications.notifications.some((notification) => notification.metadata?.appointmentId === createdAppointment.appointment.id),
    true,
  );
  await expectStatus("portal deletes appointment", workspaceAdmin, `/api/portal/appointments/${createdAppointment.appointment.id}`, 200, {
    method: "DELETE",
    headers: portalHeaders,
  });
  await expectStatus("deleted portal appointment is gone", workspaceAdmin, `/api/portal/appointments/${createdAppointment.appointment.id}`, 404, {
    headers: portalHeaders,
  });

  const shareTargets = await expectStatus("portal share targets stay workspace scoped", workspaceAdmin, "/api/share-targets", 200, {
    headers: portalHeaders,
  });
  assert.ok(shareTargets.doctors.some((target) => target.id === "usr_doctor"));
  assert.equal(shareTargets.doctors.some((target) => target.id === "usr_beta_doctor"), false);
  assert.deepEqual(shareTargets.workspaces.map((target) => target.id), ["org_alpha"]);
  const share = await expectStatus("portal creates patient share", workspaceAdmin, "/api/portal/patients/pat_alpha/shares", 201, {
    method: "POST",
    headers: portalJsonHeaders,
    body: JSON.stringify({ doctorUserId: "usr_doctor", scope: "patient_profile" }),
  });
  assert.equal(share.share.patientId, "pat_alpha");
  assert.equal(share.share.doctorUserId, "usr_doctor");
  const shares = await expectStatus("portal lists patient shares", workspaceAdmin, "/api/portal/patients/pat_alpha/shares", 200, {
    headers: portalHeaders,
  });
  assert.ok(shares.shares.some((item) => item.id === share.share.id && item.active === true));
  await expectStatus(
    "portal revokes patient share",
    workspaceAdmin,
    `/api/portal/patients/pat_alpha/shares/${share.share.id}`,
    200,
    {
      method: "DELETE",
      headers: portalHeaders,
    },
  );

  const patientProfiles = await expectStatus("patient lists own family profiles", patient, "/api/v1/patients", 200);
  assert.deepEqual(
    patientProfiles.patients.map((item) => item.id).sort(),
    ["pat_patient_child", "pat_patient_self"].sort(),
  );
  await expectStatus("patient cannot read workspace-owned patient profile", patient, "/api/v1/patients/pat_alpha", 403);
  const patientCreatedProfile = await expectStatus("patient creates dependent family profile", patient, "/api/v1/patients", 201, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patientCode: "FAMILY-NEW",
      name: "Patient Created Dependent",
      profileType: "dependent",
      relationship: "parent",
    }),
  });
  assert.equal(patientCreatedProfile.patient.ownerUserId, "usr_patient");
  assert.equal(patientCreatedProfile.patient.guardianUserId, "usr_patient");
  assert.equal(patientCreatedProfile.patient.profileType, "dependent");
  const patientUpdatedProfile = await expectStatus(
    "patient updates dependent family profile",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Dependent", relationship: "mother", age: 62 }),
    },
  );
  assert.equal(patientUpdatedProfile.patient.name, "Updated Dependent");
  assert.equal(patientUpdatedProfile.patient.relationship, "mother");
  await expectStatus("patient cannot update workspace-owned patient profile", patient, "/api/v1/patients/pat_alpha", 403, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Cross Workspace Edit" }),
  });
  const patientDeletedProfile = await expectStatus(
    "patient deletes dependent family profile",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    200,
    { method: "DELETE" },
  );
  assert.equal(patientDeletedProfile.deleted, true);
  await expectStatus(
    "patient deleted dependent profile is gone",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    404,
  );
  const patientShareTargets = await expectStatus("patient resolves doctor share targets", patient, "/api/v1/share-targets", 200);
  assert.ok(patientShareTargets.doctors.some((target) => target.id === "usr_doctor"));
  const patientShare = await expectStatus("patient shares dependent profile", patient, "/api/v1/patients/pat_patient_child/shares", 201, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doctorUserId: "usr_doctor", scope: "patient_profile" }),
  });
  assert.equal(patientShare.share.patientId, "pat_patient_child");
  assert.equal(patientShare.share.doctorUserId, "usr_doctor");
  const patientShares = await expectStatus("patient lists active consent history", patient, "/api/v1/patients/pat_patient_child/shares", 200);
  assert.ok(patientShares.shares.some((item) => item.id === patientShare.share.id && item.active === true));
  await expectStatus(
    "patient revokes dependent profile consent",
    patient,
    `/api/v1/patients/pat_patient_child/shares/${patientShare.share.id}`,
    200,
    { method: "DELETE" },
  );
  const patientSharesAfterRevoke = await expectStatus(
    "patient consent history includes revoked grant",
    patient,
    "/api/v1/patients/pat_patient_child/shares",
    200,
  );
  assert.ok(patientSharesAfterRevoke.shares.some((item) => item.id === patientShare.share.id && item.active === false));
  const enabledTwoFactor = await expectStatus("patient enables backend 2FA setup", patient, "/api/v1/me/2fa", 200, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "enable", method: "app" }),
  });
  assert.equal(enabledTwoFactor.twoFactor.enabled, true);
  assert.equal(enabledTwoFactor.twoFactor.method, "app");
  assert.equal(Array.isArray(enabledTwoFactor.twoFactor.recoveryCodes), true);
  assert.equal(enabledTwoFactor.twoFactor.recoveryCodes.length > 0, true);
  const disabledTwoFactor = await expectStatus("patient disables backend 2FA setup", patient, "/api/v1/me/2fa", 200, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "disable" }),
  });
  assert.equal(disabledTwoFactor.twoFactor.enabled, false);
  const patientSecondLogin = await expectLoginPassword(
    "patient opens a second backend auth session",
    "patient@alpha.test",
    "12345678",
    200,
  );
  const patientSecondSession = {
    user: patientSecondLogin.user,
    headers: { Authorization: `Bearer ${patientSecondLogin.token}` },
  };
  const patientSessions = await expectStatus("patient lists own auth sessions", patient, "/api/v1/auth/sessions", 200);
  const currentPatientSession = patientSessions.sessions.find((item) => item.current === true);
  const secondaryPatientSession = patientSessions.sessions.find((item) => item.current !== true && !item.revokedAt);
  assert.ok(currentPatientSession);
  assert.ok(secondaryPatientSession);
  const revokedPatientSession = await expectStatus(
    "patient revokes another auth session",
    patient,
    `/api/v1/auth/sessions/${encodeURIComponent(secondaryPatientSession.id)}/revoke`,
    200,
    { method: "POST" },
  );
  assert.equal(Boolean(revokedPatientSession.session.revokedAt), true);
  await expectStatus("revoked patient session cannot access account", patientSecondSession, "/api/v1/me", 401);
  await expectStatus("patient changes backend account password", patient, "/api/v1/me/password", 200, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword: "12345678", newPassword: "PatientPass123" }),
  });
  await expectLoginPassword("old patient password is rejected after password change", "patient@alpha.test", "12345678", 401);
  await expectLoginPassword("patient can sign in with changed backend password", "patient@alpha.test", "PatientPass123", 200);

  const portalScans = await expectStatus("portal lists only scoped scans", workspaceAdmin, "/api/portal/scans", 200, {
    headers: portalHeaders,
  });
  assert.deepEqual(portalScans.scans.map((scan) => scan.id), ["scan_alpha", "scan_alpha_extra"]);
  const selectedGrantScans = await expectStatus("selected-scan grant only lists granted scans", betaDoctor, "/api/v1/scans", 200);
  assert.deepEqual(selectedGrantScans.scans.map((scan) => scan.id), ["scan_alpha", "scan_beta"]);
  assert.equal(selectedGrantScans.scans.some((scan) => scan.id === "scan_alpha_extra"), false);
  await expectStatus("selected-scan grant cannot read sibling scan detail", betaDoctor, "/api/v1/scans/scan_alpha_extra", 403);
  await expectStatus("portal cannot read cross workspace scan", workspaceAdmin, "/api/portal/scans/scan_beta", 403, {
    headers: portalHeaders,
  });
  await expectStatus("selected-scan grant cannot create sibling scan for shared patient", betaDoctor, "/api/v1/scans", 403, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patientId: "pat_alpha",
      deviceId: "dev_beta",
      mode: "heart",
      bodySite: "apex",
      doctorNotes: "Selected scan grant must not create a sibling scan",
    }),
  });
  const controlledScan = await expectStatus("workspace admin creates controlled scan for AI lifecycle", workspaceAdmin, "/api/v1/scans", 201, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      patientId: "pat_alpha",
      deviceId: "dev_alpha",
      mode: "heart",
      bodySite: "apex",
      doctorNotes: "Workspace smoke controlled AI lifecycle",
    }),
  });
  assert.equal(controlledScan.scan.patientId, "pat_alpha");
  assert.equal(controlledScan.scan.organizationId, "org_alpha");
  const pcmChunk = buildPcmChunk();
  const uploadedScanChunk = await expectStatus(
    "workspace admin uploads controlled scan PCM chunk",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}/audio-chunks`,
    200,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: pcmChunk,
    },
  );
  assert.equal(uploadedScanChunk.uploadedBytes, pcmChunk.length);
  const completedScan = await expectStatus(
    "workspace admin completes controlled scan and inline AI",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}/complete`,
    200,
    { method: "POST" },
  );
  assert.equal(completedScan.scan.status, "completed");
  assert.ok(completedScan.scan.audioUrl);
  assert.ok(completedScan.scan.aiLabel);
  const reprocessedScan = await expectStatus(
    "workspace admin reprocesses controlled scan AI",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}/reprocess`,
    200,
    { method: "POST" },
  );
  assert.equal(reprocessedScan.scan.status, "completed");
  assert.ok(reprocessedScan.scan.aiResultId);
  await expectStatus(
    "beta doctor cannot reprocess unshared controlled scan",
    betaDoctor,
    `/api/v1/scans/${controlledScan.scan.id}/reprocess`,
    403,
    { method: "POST" },
  );
  await expectStatus(
    "viewer cannot delete controlled scan",
    viewer,
    `/api/v1/scans/${controlledScan.scan.id}`,
    403,
    { method: "DELETE" },
  );
  const deletedScan = await expectStatus(
    "workspace admin deletes controlled scan artifacts",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}`,
    200,
    { method: "DELETE" },
  );
  assert.equal(deletedScan.deleted, true);
  await expectStatus("deleted controlled scan is gone", workspaceAdmin, `/api/v1/scans/${controlledScan.scan.id}`, 404);
  const updatedScan = await expectStatus("portal updates scan note", workspaceAdmin, "/api/portal/scans/scan_alpha", 200, {
    method: "PATCH",
    headers: portalJsonHeaders,
    body: JSON.stringify({ doctorNotes: "Portal reviewed this scan" }),
  });
  assert.equal(updatedScan.scan.doctorNotes, "Portal reviewed this scan");

  const portalDevices = await expectStatus("portal lists only scoped devices", workspaceAdmin, "/api/portal/devices", 200, {
    headers: portalHeaders,
  });
  assert.deepEqual(
    portalDevices.devices.map((device) => device.id),
    ["dev_alpha", "dev_claim_alpha"],
  );
  await expectStatus("viewer cannot update portal device", viewer, "/api/portal/devices/dev_alpha", 403, {
    method: "PATCH",
    headers: portalJsonHeaders,
    body: JSON.stringify({ name: "Viewer Edit" }),
  });
  const updatedDevice = await expectStatus("portal assigns device to scoped patient", workspaceAdmin, "/api/portal/devices/dev_alpha", 200, {
    method: "PATCH",
    headers: portalJsonHeaders,
    body: JSON.stringify({ assignedPatientId: "pat_alpha", name: "Alpha Device Updated" }),
  });
  assert.equal(updatedDevice.device.assignedPatientId, "pat_alpha");
  const deviceCommand = await expectStatus("portal queues device command", workspaceAdmin, "/api/portal/devices/dev_alpha/commands", 202, {
    method: "POST",
    headers: portalJsonHeaders,
    body: JSON.stringify({ type: "identify", payload: { durationSeconds: 3 } }),
  });
  assert.equal(deviceCommand.command.type, "identify");

  const portalStaff = await expectStatus("portal lists only workspace staff", workspaceAdmin, "/api/portal/staff", 200, {
    headers: portalHeaders,
  });
  assert.ok(portalStaff.doctors.some((member) => member.id === "usr_doctor"));
  assert.equal(portalStaff.doctors.some((member) => member.id === "usr_beta_doctor"), false);
  const newStaff = await expectStatus("portal creates doctor staff account", workspaceAdmin, "/api/portal/staff", 201, {
    method: "POST",
    headers: portalJsonHeaders,
    body: JSON.stringify({
      email: "new-doctor@alpha.test",
      name: "New Alpha Doctor",
      licenseNumber: "LIC-PORTAL-001",
      specialty: "Cardiology",
      organizationId: "org_beta",
    }),
  });
  assert.equal(newStaff.doctor.organizationId, "org_alpha");

  const portalSettings = await expectStatus("portal reads workspace settings", workspaceAdmin, "/api/portal/settings", 200, {
    headers: portalHeaders,
  });
  assert.equal(portalSettings.settings.scope.organizationId, "org_alpha");
  const updatedSettings = await expectStatus("portal updates workspace settings", workspaceAdmin, "/api/portal/settings", 200, {
    method: "PATCH",
    headers: portalJsonHeaders,
    body: JSON.stringify({ notifications: { aiUpdates: true } }),
  });
  assert.equal(updatedSettings.settings.notifications.aiUpdates, true);
  const updatedWorkspace = await expectStatus("portal updates workspace profile", workspaceAdmin, "/api/portal/settings/workspace", 200, {
    method: "PATCH",
    headers: portalJsonHeaders,
    body: JSON.stringify({ phone: "0289999999", email: "ops@alpha.test" }),
  });
  assert.equal(updatedWorkspace.workspace.phone, "0289999999");
  assert.equal(updatedWorkspace.workspace.email, "ops@alpha.test");
  const updatedAccount = await expectStatus("portal updates account notification preferences", workspaceAdmin, "/api/v1/me", 200, {
    method: "PATCH",
    headers: portalJsonHeaders,
    body: JSON.stringify({ notificationPreferences: { aiUpdates: true, messages: false } }),
  });
  assert.equal(updatedAccount.user.notificationPreferences.aiUpdates, true);
  assert.equal(updatedAccount.user.notificationPreferences.messages, false);
  const accountAfterHospitalText = await expectStatus("profile hospital text does not switch workspace", workspaceAdmin, "/api/v1/me", 200, {
    method: "PATCH",
    headers: portalJsonHeaders,
    body: JSON.stringify({ hospital: "Beta Hospital" }),
  });
  assert.equal(accountAfterHospitalText.user.organizationId, "org_alpha");
  assert.equal(accountAfterHospitalText.user.hospital, "Beta Hospital");
  await expectStatus("portal cannot self-join another workspace via account profile", workspaceAdmin, "/api/v1/me", 403, {
    method: "PATCH",
    headers: portalJsonHeaders,
    body: JSON.stringify({ organizationId: "org_beta" }),
  });
  const accountAfterDeniedSwitch = await expectStatus("account workspace remains unchanged after denied profile switch", workspaceAdmin, "/api/v1/me", 200, {
    headers: portalHeaders,
  });
  assert.equal(accountAfterDeniedSwitch.user.organizationId, "org_alpha");

  const supportTicket = await expectStatus("portal creates support ticket", workspaceAdmin, "/api/portal/support", 201, {
    method: "POST",
    headers: portalJsonHeaders,
    body: JSON.stringify({ type: "operations", description: "Portal smoke support request" }),
  });
  assert.ok(supportTicket.ticket.id);

  await expectStatus("portal deletes created patient", workspaceAdmin, `/api/portal/patients/${createdPatient.patient.id}`, 200, {
    method: "DELETE",
    headers: portalHeaders,
  });

  const alphaDeviceEvents = await expectStatus("workspace admin reads own device events", workspaceAdmin, "/api/v1/devices/dev_alpha/events", 200);
  assert.equal(alphaDeviceEvents.events.some((event) => event.id === "evt_alpha"), true);
  await expectStatus("workspace admin cannot read cross workspace device events", workspaceAdmin, "/api/v1/devices/dev_beta/events", 403);
  await expectStatus("viewer cannot read device events without device capability", viewer, "/api/v1/devices/dev_alpha/events", 403);

  const readNotification = await expectStatus("portal marks scoped notification read", workspaceAdmin, "/api/portal/notifications/notif_alpha/read", 200, {
    method: "POST",
    headers: portalHeaders,
  });
  assert.equal(readNotification.notification.read, true);
  const readAllNotifications = await expectStatus("portal marks all scoped notifications read", workspaceAdmin, "/api/portal/notifications/read-all", 200, {
    method: "POST",
    headers: portalHeaders,
  });
  assert.equal(readAllNotifications.notifications.every((notification) => notification.read), true);
  const sameWorkspaceNotification = await expectStatus("workspace admin creates direct notification for same workspace user", workspaceAdmin, "/api/v1/notifications", 201, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Same workspace notice",
      message: "Notification smoke",
      userId: "usr_doctor",
    }),
  });
  assert.equal(sameWorkspaceNotification.notification.userId, "usr_doctor");
  assert.equal(sameWorkspaceNotification.notification.organizationId, "org_alpha");
  await expectStatus("workspace admin cannot target notification outside workspace", workspaceAdmin, "/api/v1/notifications", 403, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Cross workspace notice",
      message: "Notification smoke",
      userId: "usr_beta_doctor",
    }),
  });

  await expectStatus("portal user deletes scoped notification", workspaceAdmin, "/api/portal/notifications/notif_alpha", 200, {
    method: "DELETE",
    headers: portalHeaders,
  });
  const remainingNotifications = await expectStatus("deleted portal notification is gone", workspaceAdmin, "/api/v1/notifications", 200);
  assert.equal(remainingNotifications.notifications.some((notification) => notification.id === "notif_alpha"), false);

  const sharedStorage = await expectStatus("workspace admin shares own storage", workspaceAdmin, "/api/v1/admin/storage-files/file_alpha/share", 200, { method: "POST" });
  assert.equal(sharedStorage.expiresInSeconds, 900);
  assert.match(sharedStorage.shareUrl, /^\/api\/v1\/objects\/local\?key=/);
  const downloadedSeed = await expectRawStatus("workspace admin downloads own storage", workspaceAdmin, "/api/v1/admin/storage-files/file_alpha/download", 200);
  assert.equal(downloadedSeed.text, "alpha");
  const signedSeed = await expectRawStatus("workspace admin reads scoped local signed storage url", workspaceAdmin, sharedStorage.shareUrl, 200);
  assert.equal(signedSeed.text, "alpha");
  await expectStatus("workspace admin cannot share cross workspace storage", workspaceAdmin, "/api/v1/admin/storage-files/file_beta/share", 403, { method: "POST" });
  await expectStatus("workspace admin cannot download cross workspace storage", workspaceAdmin, "/api/v1/admin/storage-files/file_beta/download", 403);
  await expectStatus("cross workspace doctor cannot read alpha signed storage url", betaDoctor, sharedStorage.shareUrl, 403);
  await expectStatus("technician cannot create signed storage url", technician, "/api/v1/admin/storage-files/file_alpha/share", 403, { method: "POST" });
  await expectStatus("viewer cannot list storage", viewer, "/api/v1/admin/storage-files", 403);

  const uploadBody = "RIFF0000WAVEfmt ";
  const upload = await expectStatus("workspace admin uploads storage", workspaceAdmin, "/api/v1/admin/storage-files?bucket=heart-audio&filename=delete-me.wav", 201, {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: uploadBody,
  });
  assert.equal(upload.file.bucket, "heart-audio");
  assert.equal(upload.file.name, "delete-me.wav");
  assert.equal(upload.file.organizationId, "org_alpha");
  const listedAfterUpload = await expectStatus("workspace admin sees uploaded storage file", workspaceAdmin, "/api/v1/admin/storage-files", 200);
  assert.equal(listedAfterUpload.files.some((file) => file.id === upload.file.id), true);
  const downloadedUpload = await expectRawStatus("workspace admin downloads uploaded storage", workspaceAdmin, `/api/v1/admin/storage-files/${upload.file.id}/download`, 200);
  assert.equal(downloadedUpload.text, uploadBody);
  await expectStatus("billing cannot download storage", billing, "/api/v1/admin/storage-files/file_alpha/download", 403);
  await expectStatus("workspace admin deletes own uploaded storage", workspaceAdmin, `/api/v1/admin/storage-files/${upload.file.id}`, 200, { method: "DELETE" });
  await expectStatus("deleted uploaded storage is gone", workspaceAdmin, `/api/v1/admin/storage-files/${upload.file.id}/download`, 404);
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
  await expectStatus("workspace admin cannot transfer device between workspaces", workspaceAdmin, "/api/v1/devices/dev_pair_by_tech/transfer", 403, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId: "org_beta" }),
  });
  await expectStatus("platform cannot transfer device to missing workspace", platform, "/api/v1/devices/dev_pair_by_tech/transfer", 404, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId: "org_missing" }),
  });
  await expectStatus("platform cannot transfer device to owner outside target workspace", platform, "/api/v1/devices/dev_pair_by_tech/transfer", 403, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId: "org_beta", ownerUserId: "usr_workspace_admin" }),
  });
  const transferredDevice = await expectStatus("platform can transfer device to matching workspace owner", platform, "/api/v1/devices/dev_pair_by_tech/transfer", 200, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationId: "org_beta", ownerUserId: "usr_beta_doctor" }),
  });
  assert.equal(transferredDevice.device.organizationId, "org_beta");
  assert.equal(transferredDevice.device.pairedUserId, "usr_beta_doctor");
  const doctorClaim = await expectStatus("doctor can claim provisioned workspace device", doctor, "/api/v1/devices/pair", 200, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: "dev_claim_alpha",
      claimCode: seededClaimCode,
      connectionMethod: "QR",
    }),
  });
  assert.equal(doctorClaim.device.pairedUserId, "usr_doctor");
  await expectStatus("doctor cannot create unprovisioned device without claim", doctor, "/api/v1/devices/pair", 403, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: "dev_doctor_unprovisioned", name: "Doctor Unprovisioned Device" }),
  });
  await expectStatus("technician cannot edit package", technician, "/api/v1/admin/packages/pkg_test", 403, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: 3000 }),
  });

  await expectStatus("doctor can read assigned workspace patients", doctor, "/api/v1/patients/pat_alpha", 200);
  await expectStatus("doctor cannot read cross workspace patient", doctor, "/api/v1/patients/pat_beta", 403);
  const alphaAiHistory = await expectStatus("workspace admin does not see beta AI chat history", workspaceAdmin, "/api/v1/ai/chat", 200);
  assert.equal(alphaAiHistory.messages.some((message) => message.content === "Beta private AI history"), false);
  const alphaAiReply = await expectStatus("workspace admin creates scoped AI chat history", workspaceAdmin, "/api/v1/ai/chat", 200, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Summarize alpha workspace signals" }),
  });
  assert.equal(alphaAiReply.message.userId, "usr_workspace_admin");
  assert.equal(alphaAiReply.message.organizationId, "org_alpha");
  assert.equal(alphaAiReply.messages.every((message) => message.userId === "usr_workspace_admin" && message.organizationId === "org_alpha"), true);
  const betaAiHistory = await expectStatus("beta doctor sees only beta AI chat history", betaDoctor, "/api/v1/ai/chat", 200);
  assert.equal(betaAiHistory.messages.some((message) => message.content === "Beta private AI history"), true);
  assert.equal(betaAiHistory.messages.some((message) => message.organizationId === "org_alpha"), false);
  const updatedAiSettings = await expectStatus("workspace admin updates Android AI settings in workspace scope", workspaceAdmin, "/api/v1/ai/settings", 200, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offlineMode: true, confidenceThreshold: 0.82 }),
  });
  assert.equal(updatedAiSettings.settings.offlineMode, true);
  assert.equal(updatedAiSettings.settings.confidenceThreshold, 0.82);
  const aiApiUpdate = await expectStatus("workspace admin runs Android AI model update in workspace scope", workspaceAdmin, "/api/v1/ai/update", 200, {
    method: "POST",
  });
  assert.equal(aiApiUpdate.settings.lastUpdateStatus, "updated");
  const settingsAiUpdate = await expectStatus("workspace admin runs shared AI settings update in workspace scope", workspaceAdmin, "/api/v1/settings/ai/update", 200, {
    method: "POST",
  });
  assert.equal(settingsAiUpdate.ai.lastUpdateStatus, "updated");
  const alphaNotificationsAfterAiUpdate = await expectStatus("workspace admin sees AI update notifications scoped to own workspace", workspaceAdmin, "/api/v1/notifications", 200);
  const alphaAiNotifications = alphaNotificationsAfterAiUpdate.notifications.filter((notification) => notification.title === "Đã cập nhật mô hình AI");
  assert.equal(alphaAiNotifications.length >= 2, true);
  assert.equal(alphaAiNotifications.every((notification) => notification.organizationId === "org_alpha"), true);
  const betaNotificationsAfterAiUpdate = await expectStatus("beta doctor does not see alpha AI update notifications", betaDoctor, "/api/v1/notifications", 200);
  assert.equal(betaNotificationsAfterAiUpdate.notifications.some((notification) => notification.title === "Đã cập nhật mô hình AI"), false);
  const dataSummary = await expectStatus("workspace admin sees scoped Android data summary", workspaceAdmin, "/api/v1/data/summary", 200);
  assert.equal(dataSummary.storage.patientCount, 1);
  const clearedCache = await expectStatus("workspace admin clears Android data cache with scoped summary", workspaceAdmin, "/api/v1/data/cache", 200, {
    method: "DELETE",
  });
  assert.equal(clearedCache.storage.patientCount, 1);
  await expectStatus("workspace admin cannot delete all Android data", workspaceAdmin, "/api/v1/data/all", 403, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "XOA DU LIEU" }),
  });
  const workspaceExport = await expectStatus("workspace export ignores cross workspace payload", workspaceAdmin, "/api/v1/exports", 201, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "json", organizationId: "org_beta" }),
  });
  assert.equal(workspaceExport.export.organizationId, "org_alpha");
  await expectStatus("platform export rejects missing workspace", platform, "/api/v1/exports", 404, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "json", organizationId: "org_missing" }),
  });
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
