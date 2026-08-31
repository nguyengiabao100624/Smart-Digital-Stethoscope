const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  isPasswordHash,
  verifyPasswordSecret,
} = require("../src/passwordHash");
const {
  createPasswordIdempotencyFingerprint,
} = require("../src/passwordChangeSecurity");
const { createFactoryEnrolledDeviceFixture } = require("./factoryDeviceFixture");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, ".test-data", "workspace-access");
const port = "3432";
const seededClaimCode = "ALPHA12345678";
const passwordIdempotencyTestKey =
  "workspace-access-test-password-idempotency-key";
const ancillaryRepairPasswordPayload = {
  currentPassword: " RepairOld123 ",
  newPassword: " RepairNew456 ",
};
const ancillaryRepairOperationId =
  "identityop_password_ancillary_repair";

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
  fs.mkdirSync(path.join(dataDir, "audio"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "objects", "org", "org_alpha", "storage", "heart-audio"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "objects", "org", "org_beta", "storage", "heart-audio"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "objects", "org", "org_alpha", "storage", "heart-audio", "file_alpha-alpha.txt"), "alpha");
  fs.writeFileSync(path.join(dataDir, "objects", "org", "org_beta", "storage", "heart-audio", "file_beta-beta.txt"), "beta");
  fs.writeFileSync(path.join(dataDir, "audio", "scan_alpha.wav"), Buffer.from("RIFFscan-alpha-audio", "utf8"));

  const createdAt = new Date().toISOString();
  const users = [
    ["usr_platform", "admin", "platform@smarthealth.test", "Platform Admin", "org_alpha"],
    ["usr_workspace_owner", "workspace_owner", "workspace-owner@alpha.test", "Workspace Owner", "org_alpha"],
    ["usr_workspace_admin", "workspace_admin", "workspace-admin@alpha.test", "Workspace Admin", "org_alpha"],
    ["usr_doctor", "doctor", "doctor@alpha.test", "Doctor", "org_alpha"],
    ["usr_beta_doctor", "doctor", "doctor@beta.test", "Beta Doctor", "org_beta"],
    ["usr_suspended_grant_doctor", "doctor", "suspended-grant-doctor@alpha.test", "Suspended Grant Doctor", "org_alpha"],
    ["usr_patient", "patient", "patient@alpha.test", "Patient Owner", "org_personal_patient"],
    ["usr_guardian", "patient", "guardian@alpha.test", "Assigned Guardian", "org_personal_patient"],
    ["usr_password_repair", "patient", "password-repair@alpha.test", "Password Repair", "org_personal_patient"],
    ["usr_role_request", "patient", "role-request@alpha.test", "Role Request", "org_personal_patient"],
    ["usr_solo_role_request", "patient", "solo-role-request@alpha.test", "Solo Role Request", "org_personal_patient"],
    ["usr_technician", "technician", "technician@alpha.test", "Technician", "org_alpha"],
    ["usr_billing", "billing", "billing@alpha.test", "Billing", "org_alpha"],
    ["usr_viewer", "viewer", "viewer@alpha.test", "Viewer", "org_alpha"],
    ["usr_orphan_doctor", "doctor", "orphan-doctor@alpha.test", "Revoked Membership Doctor", "org_alpha"],
    ["usr_invited_staff", "patient", "invited-staff@alpha.test", "Invited Staff", "org_personal_patient"],
    ["usr_pending_doctor", "doctor", "pending-doctor@test.local", "Pending Doctor", "org_pending"],
    ["usr_inactive_workspace_admin", "workspace_admin", "inactive-admin@test.local", "Inactive Workspace Admin", "org_inactive"],
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
  users.find((user) => user.id === "usr_pending_doctor").roleRequestStatus = "pending";
  users.find((user) => user.id === "usr_password_repair").password =
    ancillaryRepairPasswordPayload.newPassword;
  Object.assign(users.find((user) => user.id === "usr_solo_role_request"), {
    patientId: "pat_solo_role_request_self",
    activePatientId: "pat_solo_role_request_self",
  });
  users.find((user) => user.id === "usr_patient").notificationPreferences = {
    enabled: true,
    sound: true,
    vibration: true,
    doctorRequests: true,
    abnormalResults: true,
    deviceOffline: true,
    appointments: true,
    messages: true,
    aiUpdates: false,
    newLogin: true,
  };

  const memberships = users
    .filter((user) => !["usr_orphan_doctor", "usr_invited_staff"].includes(user.id))
    .map((user) => ({
      id: `mem_${user.id}`,
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role === "admin" ? "platform_admin" : user.role,
      createdAt,
    }));
  Object.assign(
    memberships.find((membership) => membership.userId === "usr_suspended_grant_doctor"),
    { status: "suspended", suspendedAt: createdAt, updatedAt: createdAt },
  );
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
        ownerUserId: "usr_workspace_owner",
        address: "1 Alpha Billing Street",
        phone: "0281111222",
        email: "billing@alpha.test",
        legalName: "Alpha Remote Clinic Legal",
        representative: "Alpha Billing Lead",
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
        address: "2 Beta Billing Street",
        phone: "0283333444",
        email: "billing@beta.test",
        legalName: "Beta Hospital Legal",
        representative: "Beta Billing Lead",
        packageId: "pkg_test",
        subscriptionStatus: "active",
        billingCycle: "monthly",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "org_personal_patient",
        name: "Patient family workspace",
        type: "personal",
        workspaceType: "personal",
        ownerUserId: "usr_patient",
        packageId: "pkg_test",
        subscriptionStatus: "active",
        billingCycle: "monthly",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "org_pending",
        name: "Pending Clinical Workspace",
        type: "clinic",
        workspaceType: "clinic",
        status: "pending",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "org_inactive",
        name: "Inactive Clinical Workspace",
        type: "clinic",
        workspaceType: "clinic",
        status: "inactive",
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
        id: "pat_solo_role_request_self",
        patientCode: "SOLO-SELF-001",
        name: "Solo Role Request",
        organizationId: "org_personal_patient",
        accountUserId: "usr_solo_role_request",
        ownerUserId: "usr_solo_role_request",
        profileType: "account_holder",
        relationship: "self",
        createdAt,
        updatedAt: createdAt,
      },
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
      {
        id: "pat_guardian_dependent",
        patientCode: "FAMILY-GUARDIAN-001",
        name: "Guardian Dependent",
        organizationId: "org_personal_patient",
        ownerUserId: "usr_patient",
        guardianUserId: "usr_guardian",
        profileType: "dependent",
        relationship: "child",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "pat_guardian_deleted",
        patientCode: "FAMILY-GUARDIAN-DELETED",
        name: "Deleted Guardian Dependent",
        organizationId: "org_personal_patient",
        ownerUserId: "usr_patient",
        guardianUserId: "usr_guardian",
        profileType: "dependent",
        relationship: "child",
        deletedAt: createdAt,
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
      {
        id: "appt_revoked_doctor",
        organizationId: "org_alpha",
        patientId: "pat_alpha",
        doctorUserId: "usr_orphan_doctor",
        createdByUserId: "usr_workspace_admin",
        type: "follow_up",
        status: "scheduled",
        startsAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
        reason: "Membership revocation boundary regression",
        channel: "video",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    devices: [
      {
        id: "dev_alpha",
        name: "Alpha Device",
        type: "stethoscope",
        status: "available",
        organizationId: "org_alpha",
        ownershipState: "claimed",
        ownerUserId: "usr_workspace_admin",
        pairedUserId: "usr_doctor",
        connected: false,
        secretHash: "workspace-smoke-device-verification-material",
        createdAt,
        updatedAt: createdAt,
      },
      { id: "dev_beta", name: "Beta Device", type: "stethoscope", status: "available", organizationId: "org_beta", connected: false, createdAt, updatedAt: createdAt },
      {
        id: "dev_patient_personal",
        name: "Patient Personal Device",
        type: "stethoscope",
        status: "available",
        organizationId: "org_personal_patient",
        ownershipState: "claimed",
        ownerUserId: "usr_patient",
        pairedUserId: "usr_patient",
        assignedPatientId: "pat_patient_child",
        battery: 0,
        connected: false,
        createdAt,
        updatedAt: createdAt,
      },
      createFactoryEnrolledDeviceFixture({
        deviceId: "dev_claim_alpha",
        organizationId: "org_alpha",
        factoryCredential: "workspace-claim-device-secret-000001",
        name: "Alpha Claim Device",
        createdAt,
      }),
    ],
    scans: [
      { id: "scan_alpha", patientId: "pat_alpha", patientName: "Alpha Patient", organizationId: "org_alpha", status: "completed", wavFile: "scan_alpha.wav", createdAt, updatedAt: createdAt },
      {
        id: "scan_alpha_extra",
        patientId: "pat_alpha",
        patientName: "Alpha Patient",
        organizationId: "org_alpha",
        status: "completed",
        createdAt: "2020-01-15T08:00:00.000Z",
        updatedAt: "2020-01-15T08:00:00.000Z",
      },
      { id: "scan_beta", patientId: "pat_beta", patientName: "Beta Patient", organizationId: "org_beta", status: "completed", createdAt, updatedAt: createdAt },
      {
        id: "scan_patient_self",
        patientId: "pat_patient_self",
        patientName: "Patient Owner",
        organizationId: "org_personal_patient",
        status: "completed",
        aiLabel: "captured",
        createdAt: "2026-07-27T08:00:00.000Z",
        updatedAt: "2026-07-27T08:00:00.000Z",
      },
      {
        id: "scan_patient_child",
        patientId: "pat_patient_child",
        patientName: "Patient Child",
        organizationId: "org_personal_patient",
        status: "completed",
        aiLabel: "",
        createdAt: "2026-07-28T08:00:00.000Z",
        updatedAt: "2026-07-28T08:00:00.000Z",
      },
      {
        id: "scan_patient_child_processing",
        patientId: "pat_patient_child",
        patientName: "Patient Child",
        organizationId: "org_personal_patient",
        status: "processing",
        aiLabel: "processing",
        createdAt: "2026-07-27T07:00:00.000Z",
        updatedAt: "2026-07-27T07:00:00.000Z",
      },
      {
        id: "scan_patient_child_legacy",
        patientId: "pat_patient_child",
        patientName: "Patient Child",
        status: "completed",
        createdAt: "2026-07-26T07:00:00.000Z",
        updatedAt: "2026-07-26T07:00:00.000Z",
      },
      {
        id: "scan_patient_child_cross_workspace",
        patientId: "pat_patient_child",
        patientName: "Patient Child collision",
        organizationId: "org_beta",
        status: "completed",
        aiLabel: "abnormal",
        createdAt: "2026-07-29T08:00:00.000Z",
        updatedAt: "2026-07-29T08:00:00.000Z",
      },
    ],
    scanReviews: [],
    clinicalAlerts: [
      {
        id: "alert_alpha_seed",
        organizationId: "org_alpha",
        sourceType: "device",
        sourceId: "dev_alpha",
        dedupeKey: "device:dev_alpha",
        status: "open",
        severity: "warning",
        title: "Alpha device offline",
        message: "Alpha-only alert ledger entry",
        deviceId: "dev_alpha",
        version: 1,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "alert_beta_seed",
        organizationId: "org_beta",
        sourceType: "device",
        sourceId: "dev_beta",
        dedupeKey: "device:dev_beta",
        status: "open",
        severity: "warning",
        title: "Beta device offline",
        message: "Beta-only alert ledger entry",
        deviceId: "dev_beta",
        version: 1,
        createdAt,
        updatedAt: createdAt,
      },
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
    exports: [],
    audioFiles: [],
    aiResults: [
      { id: "ai_alpha", scanId: "scan_alpha", status: "completed", label: "normal", createdAt, updatedAt: createdAt },
      { id: "ai_beta", scanId: "scan_beta", status: "completed", label: "normal", createdAt, updatedAt: createdAt },
    ],
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
      {
        id: "share_suspended_doctor_selected_alpha",
        patientId: "pat_alpha",
        doctorUserId: "usr_suspended_grant_doctor",
        doctorId: "usr_suspended_grant_doctor",
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
      {
        id: "notif_cross_tenant_direct",
        type: "warning",
        title: "Alpha private direct notification",
        message: "Must never be visible to a Beta user merely because userId matches",
        organizationId: "org_alpha",
        userId: "usr_beta_doctor",
        read: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "notif_viewer_direct",
        type: "info",
        title: "Viewer private notification",
        message: "Only the direct recipient may dismiss this row",
        organizationId: "org_alpha",
        userId: "usr_viewer",
        read: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "notif_inbox_current",
        type: "appointment_scheduled",
        title: "Current workspace inbox item",
        message: "This item belongs to the active account and workspace.",
        organizationId: "org_alpha",
        userId: "usr_workspace_admin",
        read: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "notif_inbox_account_wide",
        type: "new_login",
        title: "Account-wide inbox item",
        message: "This item follows the account into its active workspace.",
        organizationId: "",
        userId: "usr_workspace_admin",
        read: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "notif_inbox_old_workspace",
        type: "warning",
        title: "Stale workspace inbox item",
        message: "This item must not cross the active workspace epoch.",
        organizationId: "org_beta",
        userId: "usr_workspace_admin",
        read: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "notif_implicit_global",
        type: "warning",
        title: "Sensitive platform operation",
        message: "A notification without an owner must never become a public broadcast.",
        read: false,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    identityOperations: [
      {
        id: ancillaryRepairOperationId,
        targetUserId: "usr_password_repair",
        actorUserId: "usr_password_repair",
        organizationId: "org_personal_patient",
        operation: "reset_password",
        status: "completed",
        idempotencyKey: "password-ancillary-repair",
        requestFingerprint: createPasswordIdempotencyFingerprint(
          {
            operation: "reset_password",
            targetUserId: "usr_password_repair",
            payload: ancillaryRepairPasswordPayload,
          },
          {
            PASSWORD_IDEMPOTENCY_HMAC_KEY: passwordIdempotencyTestKey,
          },
        ),
        previousAccountStatus: "active",
        targetAccountStatus: "password_reset_pending",
        targetState: { provider: "demo" },
        providerStatus: "skipped",
        providerResult: { updated: true, skipped: true },
        errorCode: "",
        createdAt,
        updatedAt: createdAt,
        completedAt: createdAt,
      },
    ],
    sessions: [],
    authSessions: [],
    accessLogs: [],
    auditLogs: [],
    idempotencyKeys: [
      {
        id: "idem_legacy_account_profile_safe",
        scope: "usr_patient",
        operation: "account.profile.update",
        key: "legacy-patient-account-profile-safe",
        fingerprint: hashValue("{}"),
        resourceType: "user",
        resourceId: "usr_patient",
        responseStatus: 200,
        responseResource: { id: "usr_patient" },
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "idem_legacy_account_profile_stale",
        scope: "usr_patient",
        operation: "account.profile.update",
        key: "legacy-patient-account-profile-stale",
        fingerprint: hashValue(JSON.stringify({ phone: "0999000000" })),
        resourceType: "user",
        resourceId: "usr_patient",
        responseStatus: 200,
        responseResource: { id: "usr_patient" },
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "idem_account_profile_wrong_owner",
        scope: "usr_patient",
        operation: "account.profile.update",
        key: "patient-account-profile-wrong-owner",
        fingerprint: hashValue(JSON.stringify({ name: "Wrong owner replay probe" })),
        resourceType: "user",
        resourceId: "usr_doctor",
        responseStatus: 200,
        responseResource: {
          userId: "usr_doctor",
          intent: "profile_update",
          changedFields: ["name"],
          user: {
            id: "usr_doctor",
            name: "Wrong owner replay probe",
            title: "",
            phone: "",
            license: "",
            hospital: "",
            department: "",
            specialty: "",
            address: "",
            organizationId: "org_alpha",
            updatedAt: createdAt,
          },
          replayed: false,
        },
        createdAt,
        updatedAt: createdAt,
      },
    ],
    storageBuckets: [],
    subscriptions: [],
    deviceClaims: [
      {
        id: "claim_alpha",
        deviceId: "dev_claim_alpha",
        organizationId: "org_alpha",
        claimCodeHash: hashValue(`dev_claim_alpha:${seededClaimCode}`),
        createdByUserId: "usr_platform",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        createdAt,
        updatedAt: createdAt,
      },
    ],
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

async function openRealtimeSocket(session) {
  const token = String(session.headers.Authorization || "").replace(/^Bearer\s+/i, "");
  assert.ok(token, "realtime smoke requires a bearer token");
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/app`,
      ["shcare.realtime.v1", `shcare.bearer.${token}`],
    );
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("realtime socket did not open"));
    }, 3000);
    timeout.unref?.();
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("realtime socket authentication failed"));
    }, { once: true });
  });
}

function waitForRealtimeClose(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("revoked realtime socket stayed open")), 3000);
    timeout.unref?.();
    socket.addEventListener("close", (event) => {
      clearTimeout(timeout);
      resolve(event);
    }, { once: true });
  });
}

async function login(email, password = "12345678") {
  const { response, body } = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: email, password }),
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

async function readPersistedDbJson(dbPath, retries = 10) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return JSON.parse(fs.readFileSync(dbPath, "utf8"));
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

function assertPatientMutationReceipt(
  receipt,
  { userId, workspaceId, patientId, intent, replayed },
) {
  const expectedKeys = intent === "delete"
    ? ["deleted", "intent", "patientId", "replayed", "userId", "workspaceId"]
    : ["intent", "patient", "patientId", "replayed", "userId", "workspaceId"];
  assert.deepEqual(
    Object.keys(receipt).sort(),
    expectedKeys,
    `${intent} must return the exact canonical patient mutation envelope`,
  );
  assert.equal(receipt.userId, userId);
  assert.equal(receipt.workspaceId, workspaceId);
  assert.equal(receipt.patientId, patientId);
  assert.equal(receipt.intent, intent);
  assert.equal(receipt.replayed, replayed);
  if (intent === "delete") {
    assert.equal(receipt.deleted, true);
    assert.equal(Object.hasOwn(receipt, "patient"), false);
    return;
  }
  assert.equal(Object.hasOwn(receipt, "deleted"), false);
  assert.equal(receipt.patient?.id, patientId);
  assert.equal(receipt.patient?.organizationId, workspaceId);
}

function assertAccountProfileMutationReceipt(
  receipt,
  { userId, changedFields, replayed },
) {
  assert.deepEqual(
    Object.keys(receipt).sort(),
    ["changedFields", "intent", "replayed", "user", "userId"],
    "account profile update must return the exact canonical receipt envelope",
  );
  assert.equal(receipt.userId, userId);
  assert.equal(receipt.intent, "profile_update");
  assert.deepEqual(receipt.changedFields, [...changedFields].sort());
  assert.equal(receipt.replayed, replayed);
  assert.deepEqual(
    Object.keys(receipt.user).sort(),
    [
      "address",
      "department",
      "hospital",
      "id",
      "license",
      "name",
      "organizationId",
      "phone",
      "specialty",
      "title",
      "updatedAt",
    ],
    "account profile receipt must expose only the bounded profile projection",
  );
  assert.equal(receipt.user.id, userId);
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
  const suspendedGrantDoctor = await login("suspended-grant-doctor@alpha.test");
  const patient = await login("patient@alpha.test");
  const passwordRepairUser = await login(
    "password-repair@alpha.test",
    ancillaryRepairPasswordPayload.newPassword,
  );
  const roleRequestUser = await login("role-request@alpha.test");
  const soloRoleRequestUser = await login("solo-role-request@alpha.test");
  const guardian = await login("guardian@alpha.test");
  const technician = await login("technician@alpha.test");
  const billing = await login("billing@alpha.test");
  const viewer = await login("viewer@alpha.test");
  const orphanDoctor = await login("orphan-doctor@alpha.test");
  const invitedStaff = await login("invited-staff@alpha.test");
  const pendingDoctor = await login("pending-doctor@test.local");
  const inactiveWorkspaceAdmin = await login("inactive-admin@test.local");
  const portalHeaders = { "X-Smart-Health-Surface": "portal" };
  const portalJsonHeaders = { ...portalHeaders, "Content-Type": "application/json" };

  assert.ok(platform.user.capabilities.includes("platform.workspaces.manage"));
  assert.ok(workspaceAdmin.user.capabilities.includes("workspace.storage.manage"));
  assert.ok(workspaceAdmin.user.capabilities.includes("workspace.review.manage"));
  assert.ok(workspaceAdmin.user.capabilities.includes("workspace.alerts.manage"));
  assert.ok(doctor.user.capabilities.includes("workspace.review.manage"));
  const deniedApprovedDoctorCrossTarget = await expectStatus(
    "an approved doctor cannot use role request to grant a new workspace membership",
    betaDoctor,
    "/api/v1/auth/role-request",
    409,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-approved-doctor-cross-target",
      },
      body: JSON.stringify({
        requestedRole: "doctor",
        expectedUserId: betaDoctor.user.id,
        expectedWorkspaceId: betaDoctor.user.currentWorkspaceId,
        accountType: "doctor",
        workspaceType: "clinic",
        organizationId: "org_alpha",
        name: betaDoctor.user.name,
        license: "BETA-LIC-001",
        department: "Cardiology",
      }),
    },
  );
  assert.equal(
    deniedApprovedDoctorCrossTarget.error.code,
    "ROLE_REQUEST_APPROVED_TARGET_DENIED",
  );
  const approvedDoctorAfterDeniedCrossTarget = await expectStatus(
    "a denied approved-doctor role request preserves existing workspace authority",
    betaDoctor,
    "/api/v1/me",
    200,
  );
  assert.equal(approvedDoctorAfterDeniedCrossTarget.user.organizationId, "org_beta");
  assert.equal(
    approvedDoctorAfterDeniedCrossTarget.user.memberships.some(
      (membership) => membership.organizationId === "org_alpha",
    ),
    false,
  );
  const deniedPatientClinicEnrollment = await expectStatus(
    "a patient role request cannot self-enroll into an arbitrary clinic",
    patient,
    "/api/v1/auth/role-request",
    403,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-patient-cross-clinic-enrollment",
      },
      body: JSON.stringify({
        requestedRole: "patient",
        accountType: "personal",
        workspaceType: "clinic",
        organizationId: "org_beta",
      }),
    },
  );
  assert.equal(
    deniedPatientClinicEnrollment.error.code,
    "ROLE_REQUEST_PATIENT_WORKSPACE_DENIED",
  );
  const patientAfterDeniedClinicEnrollment = await expectStatus(
    "a denied patient role request preserves the personal workspace",
    patient,
    "/api/v1/me",
    200,
    { headers: portalHeaders },
  );
  assert.equal(
    patientAfterDeniedClinicEnrollment.user.organizationId,
    "org_personal_patient",
  );
  assert.equal(
    patientAfterDeniedClinicEnrollment.user.memberships.some(
      (membership) => membership.organizationId === "org_beta",
    ),
    false,
  );
  const roleRequestPayload = {
    requestedRole: "doctor",
    expectedUserId: roleRequestUser.user.id,
    expectedWorkspaceId: roleRequestUser.user.organizationId,
    accountType: "doctor",
    workspaceType: "clinic",
    organizationId: "org_alpha",
    name: "Role Request Doctor",
    phone: "0901234567",
    license: "ROLE-LIC-001",
    hospital: "Alpha Remote Clinic",
    department: "Cardiology",
    registrationReason: "Remote patient monitoring",
  };
  const forgedRoleRequestOwner = await expectStatus(
    "role request rejects client-supplied account authority",
    roleRequestUser,
    "/api/v1/auth/role-request",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-role-request-forged-owner",
      },
      body: JSON.stringify({
        ...roleRequestPayload,
        userId: "usr_guardian",
      }),
    },
  );
  assert.equal(
    forgedRoleRequestOwner.error.code,
    "ROLE_REQUEST_AUTHORITY_FIELDS_FORBIDDEN",
  );
  const unknownRoleRequestField = await expectStatus(
    "role request rejects fields outside the versioned request schema",
    roleRequestUser,
    "/api/v1/auth/role-request",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-role-request-unknown-field",
      },
      body: JSON.stringify({
        ...roleRequestPayload,
        provider: "firebase",
      }),
    },
  );
  assert.equal(
    unknownRoleRequestField.error.code,
    "ROLE_REQUEST_FIELDS_UNSUPPORTED",
  );
  const staleRoleRequestAccount = await expectStatus(
    "role request rejects a stale screen owner before mutation",
    roleRequestUser,
    "/api/v1/auth/role-request",
    409,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-role-request-stale-account",
      },
      body: JSON.stringify({
        ...roleRequestPayload,
        expectedUserId: "usr_guardian",
      }),
    },
  );
  assert.equal(
    staleRoleRequestAccount.error.code,
    "ROLE_REQUEST_EXPECTED_USER_MISMATCH",
  );
  const staleRoleRequestWorkspace = await expectStatus(
    "role request rejects a stale workspace before mutation",
    roleRequestUser,
    "/api/v1/auth/role-request",
    409,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-role-request-stale-workspace",
      },
      body: JSON.stringify({
        ...roleRequestPayload,
        expectedWorkspaceId: "org_beta",
      }),
    },
  );
  assert.equal(
    staleRoleRequestWorkspace.error.code,
    "ROLE_REQUEST_EXPECTED_WORKSPACE_MISMATCH",
  );
  const roleRequestAfterStaleDenials = await expectStatus(
    "stale role request preconditions leave the account unchanged",
    roleRequestUser,
    "/api/v1/me",
    200,
    { headers: portalHeaders },
  );
  assert.notEqual(roleRequestAfterStaleDenials.user.roleRequestStatus, "pending");
  assert.equal(
    roleRequestAfterStaleDenials.user.organizationId,
    roleRequestUser.user.organizationId,
  );
  const mismatchedRoleAliases = await expectStatus(
    "role request rejects contradictory canonical and compatibility roles",
    roleRequestUser,
    "/api/v1/auth/role-request",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-role-request-role-mismatch",
      },
      body: JSON.stringify({
        ...roleRequestPayload,
        role: "patient",
      }),
    },
  );
  assert.equal(
    mismatchedRoleAliases.error.code,
    "ROLE_REQUEST_ROLE_MISMATCH",
  );
  const roleRequestWithoutKey = await expectStatus(
    "role request requires an Idempotency-Key",
    roleRequestUser,
    "/api/v1/auth/role-request",
    400,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...roleRequestPayload,
        idempotencyKey: "body-only-role-request-key",
      }),
    },
  );
  assert.equal(roleRequestWithoutKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const invalidExplicitWorkspace = await expectStatus(
    "an explicit unavailable organizationId cannot fall back to the clinic name",
    roleRequestUser,
    "/api/v1/auth/role-request",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-role-request-invalid-explicit-workspace",
      },
      body: JSON.stringify({
        ...roleRequestPayload,
        organizationId: "org_missing_explicit",
        hospital: "Alpha Remote Clinic",
      }),
    },
  );
  assert.equal(
    invalidExplicitWorkspace.error.code,
    "ROLE_REQUEST_WORKSPACE_NOT_FOUND",
  );
  const roleRequestHeaders = {
    "Content-Type": "application/json",
    "Idempotency-Key": "workspace-role-request-owner",
  };
  const roleRequestReceipt = await expectStatus(
    "account owner submits a canonical doctor role request",
    roleRequestUser,
    "/api/v1/auth/role-request",
    200,
    {
      method: "POST",
      headers: roleRequestHeaders,
      body: JSON.stringify(roleRequestPayload),
    },
  );
  assert.deepEqual(Object.keys(roleRequestReceipt), [
    "user",
    "roleRequest",
    "operationId",
    "replayed",
  ]);
  assert.equal(roleRequestReceipt.user.id, "usr_role_request");
  assert.equal(roleRequestReceipt.user.role, "patient");
  assert.equal(roleRequestReceipt.user.requestedRole, "doctor");
  assert.equal(roleRequestReceipt.user.roleRequestStatus, "pending");
  assert.equal(roleRequestReceipt.user.organizationId, "org_personal_patient");
  assert.equal(roleRequestReceipt.user.roleRequestOrganizationId, "org_alpha");
  assert.equal(
    roleRequestReceipt.user.memberships.some(
      (membership) => membership.organizationId === "org_alpha",
    ),
    false,
    "a pending doctor request must not grant a target-workspace membership",
  );
  assert.equal(
    roleRequestReceipt.user.capabilities.some((capability) =>
      capability.startsWith("workspace."),
    ),
    false,
    "a pending doctor request must not grant workspace capabilities",
  );
  assert.equal(
    roleRequestReceipt.user.currentWorkspaceId,
    "org_personal_patient",
    "the existing personal membership remains the only operational workspace",
  );
  assert.equal(
    roleRequestReceipt.user.currentWorkspace.status,
    "active",
    "the public workspace projection must expose its canonical lifecycle",
  );
  assert.equal(roleRequestReceipt.roleRequest.requestedRole, "doctor");
  assert.equal(roleRequestReceipt.roleRequest.status, "pending");
  assert.ok(roleRequestReceipt.roleRequest.requestedAt);
  assert.ok(roleRequestReceipt.operationId);
  assert.equal(roleRequestReceipt.replayed, false);
  const legacyRoleRequestPayload = {
    ...roleRequestPayload,
    role: roleRequestPayload.requestedRole,
  };
  delete legacyRoleRequestPayload.requestedRole;
  const replayedRoleRequestReceipt = await expectStatus(
    "legacy path and role alias replay the original account receipt",
    roleRequestUser,
    "/api/auth/role-request",
    200,
    {
      method: "POST",
      headers: roleRequestHeaders,
      body: JSON.stringify(legacyRoleRequestPayload),
    },
  );
  assert.equal(replayedRoleRequestReceipt.replayed, true);
  assert.equal(
    replayedRoleRequestReceipt.operationId,
    roleRequestReceipt.operationId,
  );
  assert.deepEqual(replayedRoleRequestReceipt.user, roleRequestReceipt.user);
  assert.deepEqual(
    replayedRoleRequestReceipt.roleRequest,
    roleRequestReceipt.roleRequest,
  );
  const conflictingRoleRequest = await expectStatus(
    "role request rejects reuse of the key with a different owner intent",
    roleRequestUser,
    "/api/v1/auth/role-request",
    409,
    {
      method: "POST",
      headers: roleRequestHeaders,
      body: JSON.stringify({
        ...roleRequestPayload,
        department: "Neurology",
      }),
    },
  );
  assert.equal(conflictingRoleRequest.error.code, "IDEMPOTENCY_KEY_REUSED");
  const pendingRoleRequestWorkspaceSwitch = await expectStatus(
    "a pending doctor request cannot drift its persisted target through workspace switch",
    roleRequestUser,
    "/api/v1/me",
    409,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-pending-role-request-target-drift",
      },
      body: JSON.stringify({ organizationId: "org_personal_patient" }),
    },
  );
  assert.equal(
    pendingRoleRequestWorkspaceSwitch.error.code,
    "ROLE_REQUEST_TARGET_LOCKED",
  );
  const pendingRoleRequestActiveProfile = await expectStatus(
    "active-profile selection preserves a pending doctor-request target",
    roleRequestUser,
    "/api/v1/me/active-profile",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-pending-role-request-active-profile",
      },
      body: JSON.stringify({ patientId: roleRequestReceipt.user.patientId }),
    },
  );
  assert.equal(
    pendingRoleRequestActiveProfile.user.organizationId,
    "org_personal_patient",
  );
  assert.equal(
    pendingRoleRequestActiveProfile.user.roleRequestOrganizationId,
    roleRequestPayload.organizationId,
  );
  assert.equal(
    pendingRoleRequestActiveProfile.user.currentWorkspaceId,
    "org_personal_patient",
  );
  assert.equal(
    pendingRoleRequestActiveProfile.user.activePatientId,
    roleRequestReceipt.user.patientId,
  );
  const mismatchedRoleApprovalTarget = await expectStatus(
    "platform approval cannot override the persisted doctor-request target",
    platform,
    `/api/v1/admin/doctor-requests/${roleRequestReceipt.user.id}/approve`,
    409,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-role-approval-wrong-target",
      },
      body: JSON.stringify({ organizationId: "org_beta" }),
    },
  );
  assert.equal(
    mismatchedRoleApprovalTarget.error.code,
    "DOCTOR_REQUEST_TARGET_MISMATCH",
  );
  const roleRequestsAfterMismatchedApproval = await expectStatus(
    "platform can read the request ledger after a mismatched approval target",
    platform,
    "/api/v1/admin/doctor-requests?status=pending",
    200,
  );
  const roleRequestAfterMismatchedApproval =
    roleRequestsAfterMismatchedApproval.requests.find(
      (request) => request.id === roleRequestReceipt.user.id,
    );
  assert.ok(roleRequestAfterMismatchedApproval);
  assert.equal(roleRequestAfterMismatchedApproval.role, "patient");
  assert.equal(roleRequestAfterMismatchedApproval.roleRequestStatus, "pending");
  assert.equal(
    roleRequestAfterMismatchedApproval.organizationId,
    "org_personal_patient",
  );
  assert.equal(
    roleRequestAfterMismatchedApproval.roleRequestOrganizationId,
    roleRequestPayload.organizationId,
  );
  assert.equal(
    roleRequestAfterMismatchedApproval.memberships.some(
      (membership) => membership.organizationId === roleRequestPayload.organizationId,
    ),
    false,
  );
  assert.equal(suspendedGrantDoctor.user.memberships.length, 1);
  assert.equal(suspendedGrantDoctor.user.memberships[0].operational, false);
  assert.equal(suspendedGrantDoctor.user.capabilities.some((capability) => capability.startsWith("workspace.")), false);
  await expectStatus(
    "a direct selected-scan grant is denied while every doctor membership is suspended",
    suspendedGrantDoctor,
    "/api/v1/scans/scan_alpha",
    403,
  );
  await expectRawStatus(
    "audio is denied while every direct-grant doctor membership is suspended",
    suspendedGrantDoctor,
    "/api/v1/scans/scan_alpha/audio",
    403,
  );
  const restoredGrantDoctorMembership = await expectStatus(
    "workspace admin reactivates the suspended direct-grant doctor membership",
    workspaceAdmin,
    "/api/portal/staff/usr_suspended_grant_doctor/unlock",
    200,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-suspended-grant-doctor-reactivate",
      },
    },
  );
  assert.equal(restoredGrantDoctorMembership.action, "reactivate");
  assert.equal(restoredGrantDoctorMembership.membership.status, "active");
  const restoredGrantDoctor = await login("suspended-grant-doctor@alpha.test");
  await expectStatus(
    "reactivating one operational doctor membership restores the direct selected-scan grant",
    restoredGrantDoctor,
    "/api/v1/scans/scan_alpha",
    200,
  );
  const restoredGrantAudio = await expectRawStatus(
    "reactivating one operational doctor membership restores direct-grant audio access",
    restoredGrantDoctor,
    "/api/v1/scans/scan_alpha/audio",
    200,
  );
  assert.equal(restoredGrantAudio.text, "RIFFscan-alpha-audio");
  const patientPersonalDevices = await expectStatus(
    "an active patient keeps access to their personally owned device",
    patient,
    "/api/v1/devices",
    200,
  );
  assert.deepEqual(patientPersonalDevices.devices.map((device) => device.id), ["dev_patient_personal"]);
  await expectStatus(
    "an active patient can read their personally owned device detail",
    patient,
    "/api/v1/devices/dev_patient_personal",
    200,
  );
  await expectStatus(
    "platform admin device access remains global",
    platform,
    "/api/v1/devices/dev_beta",
    200,
  );
  assert.equal(technician.user.capabilities.includes("workspace.review.manage"), false);
  assert.ok(technician.user.capabilities.includes("workspace.alerts.manage"));
  assert.equal(orphanDoctor.user.memberships.length, 0);
  assert.equal(orphanDoctor.user.capabilities.some((capability) => capability.startsWith("workspace.")), false);
  assert.deepEqual(orphanDoctor.user.allowedSurfaces, []);
  const unassignedPatientDashboard = await expectStatus(
    "a patient-role account without an operational membership cannot open the patient dashboard",
    invitedStaff,
    "/api/v1/patient/dashboard",
    403,
  );
  assert.equal(
    unassignedPatientDashboard.error.code,
    "PATIENT_DASHBOARD_WORKSPACE_REQUIRED",
  );
  assert.equal(
    pendingDoctor.user.capabilities.some((capability) => capability.startsWith("workspace.")),
    false,
    "a pending doctor membership must not grant workspace capabilities",
  );
  assert.equal(
    inactiveWorkspaceAdmin.user.capabilities.some((capability) => capability.startsWith("workspace.")),
    false,
    "an inactive workspace must not grant operational capabilities",
  );
  assert.deepEqual(pendingDoctor.user.allowedSurfaces, []);
  assert.deepEqual(inactiveWorkspaceAdmin.user.allowedSurfaces, []);
  await expectStatus(
    "identity without backend membership cannot enter portal from a role claim alone",
    orphanDoctor,
    "/api/portal/dashboard",
    403,
    { headers: portalHeaders },
  );
  await expectStatus(
    "revoked assigned doctor cannot read appointment PHI through the direct API",
    orphanDoctor,
    "/api/v1/appointments/appt_revoked_doctor",
    403,
  );
  await expectStatus(
    "pending doctor cannot enter portal before approval",
    pendingDoctor,
    "/api/portal/dashboard",
    403,
    { headers: portalHeaders },
  );
  await expectStatus(
    "inactive workspace admin cannot enter operational portal",
    inactiveWorkspaceAdmin,
    "/api/portal/dashboard",
    403,
    { headers: portalHeaders },
  );

  const missingWorkspaceSwitch = await expectStatus(
    "explicit missing workspace switch fails instead of reporting local success",
    doctor,
    "/api/v1/me",
    404,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "org_missing" }),
    },
  );
  assert.equal(missingWorkspaceSwitch.error.code, "WORKSPACE_NOT_FOUND");
  const deniedWorkspaceSwitch = await expectStatus(
    "patient cannot switch into an unrelated workspace",
    patient,
    "/api/v1/me",
    403,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "org_alpha" }),
    },
  );
  assert.equal(deniedWorkspaceSwitch.error.code, "WORKSPACE_MEMBERSHIP_REQUIRED");
  const upgradedLegacyAccountReplay = await expectStatus(
    "a matching legacy account receipt is replayed and upgraded during the compatibility window",
    patient,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "legacy-patient-account-profile-safe",
      },
      body: JSON.stringify({}),
    },
  );
  assertAccountProfileMutationReceipt(upgradedLegacyAccountReplay, {
    userId: "usr_patient",
    changedFields: [],
    replayed: true,
  });
  const staleLegacyAccountReplay = await expectStatus(
    "a stale legacy account receipt fails closed instead of returning mixed state",
    patient,
    "/api/v1/me",
    409,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "legacy-patient-account-profile-stale",
      },
      body: JSON.stringify({ phone: "0999000000" }),
    },
  );
  assert.equal(
    staleLegacyAccountReplay.error.code,
    "IDEMPOTENT_ACCOUNT_RESULT_STALE_LEGACY",
  );
  const missingAccountProfileKey = await expectStatus(
    "canonical account profile update requires an Idempotency-Key header",
    patient,
    "/api/v1/me",
    400,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Missing key" }),
    },
  );
  assert.equal(missingAccountProfileKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const bodyOnlyAccountProfileKey = await expectStatus(
    "canonical account profile update does not accept a body idempotency key",
    patient,
    "/api/v1/me",
    400,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Body key", idempotencyKey: "body-only-profile-key" }),
    },
  );
  assert.equal(bodyOnlyAccountProfileKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const unsupportedAccountProfileField = await expectStatus(
    "canonical account profile update rejects fields owned by dedicated routes",
    patient,
    "/api/v1/me",
    400,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-account-profile-unsupported-field",
      },
      body: JSON.stringify({ avatarUrl: "https://example.invalid/avatar.png" }),
    },
  );
  assert.equal(
    unsupportedAccountProfileField.error.code,
    "ACCOUNT_PROFILE_FIELD_UNSUPPORTED",
  );
  const wrongOwnerAccountProfileReplay = await expectStatus(
    "account profile replay cannot return another account receipt",
    patient,
    "/api/v1/me",
    409,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-account-profile-wrong-owner",
      },
      body: JSON.stringify({ name: "Wrong owner replay probe" }),
    },
  );
  assert.equal(
    wrongOwnerAccountProfileReplay.error.code,
    "IDEMPOTENT_ACCOUNT_RESULT_MISMATCH",
  );
  const patientProfilePayload = {
    phone: "0909000111",
    address: "Updated patient address",
  };
  const updatedPatientAccount = await expectStatus(
    "account profile update returns only after backend persistence",
    patient,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "patient-account-profile" },
      body: JSON.stringify(patientProfilePayload),
    },
  );
  assertAccountProfileMutationReceipt(updatedPatientAccount, {
    userId: "usr_patient",
    changedFields: Object.keys(patientProfilePayload),
    replayed: false,
  });
  assert.equal(updatedPatientAccount.user.phone, "0909000111");
  const replayedPatientAccount = await expectStatus(
    "account profile exact retry returns the original owner-bound receipt",
    patient,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-account-profile",
      },
      body: JSON.stringify(patientProfilePayload),
    },
  );
  assertAccountProfileMutationReceipt(replayedPatientAccount, {
    userId: "usr_patient",
    changedFields: Object.keys(patientProfilePayload),
    replayed: true,
  });
  assert.deepEqual(
    replayedPatientAccount.user,
    updatedPatientAccount.user,
    "profile replay must return the original stable user projection",
  );
  const reusedPatientAccountKey = await expectStatus(
    "account profile key cannot be reused for a different payload",
    patient,
    "/api/v1/me",
    409,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-account-profile",
      },
      body: JSON.stringify({ phone: "0909000222" }),
    },
  );
  assert.equal(reusedPatientAccountKey.error.code, "IDEMPOTENCY_KEY_REUSED");
  const persistedPatientAccount = await expectStatus("account profile update survives a fresh read", patient, "/api/v1/me", 200);
  assert.equal(persistedPatientAccount.user.phone, "0909000111");
  const switchedDoctorWorkspace = await expectStatus(
    "doctor switches workspace only after backend membership confirmation",
    doctor,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "doctor-workspace-beta" },
      body: JSON.stringify({ organizationId: "org_beta" }),
    },
  );
  assert.equal(switchedDoctorWorkspace.user.currentWorkspaceId, "org_beta");
  await expectStatus(
    "assigned doctor cannot read an appointment from another selected workspace",
    doctor,
    "/api/v1/appointments/appt_alpha",
    403,
  );
  await expectStatus(
    "appointment mutation cannot borrow capability from another selected workspace",
    doctor,
    "/api/v1/appointments/appt_alpha",
    403,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "doctor-beta-cannot-update-alpha-appointment",
      },
      body: JSON.stringify({ notes: "Must remain forbidden outside the selected workspace" }),
    },
  );
  const replayedDoctorWorkspace = await expectStatus(
    "workspace switch idempotency survives the changed current-workspace scope",
    doctor,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "doctor-workspace-beta" },
      body: JSON.stringify({ organizationId: "org_beta" }),
    },
  );
  assert.equal(replayedDoctorWorkspace.user.currentWorkspaceId, "org_beta");
  assert.equal(replayedDoctorWorkspace.replayed, true);
  const reusedWorkspaceSwitchKey = await expectStatus(
    "workspace switch rejects an idempotency key reused for another target",
    doctor,
    "/api/v1/me",
    409,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "doctor-workspace-beta" },
      body: JSON.stringify({ organizationId: "org_alpha" }),
    },
  );
  assert.equal(reusedWorkspaceSwitchKey.error.code, "IDEMPOTENCY_KEY_REUSED");
  const restoredDoctorWorkspace = await expectStatus(
    "doctor restores primary workspace",
    doctor,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "doctor-workspace-alpha" },
      body: JSON.stringify({ organizationId: "org_alpha" }),
    },
  );
  assert.equal(restoredDoctorWorkspace.user.currentWorkspaceId, "org_alpha");
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
  assert.equal(doctorSwitchedToBeta.user.currentWorkspace.scanCount, 2);
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
  assert.equal(platformWorkspaces.workspaces.length, 5);
  assert.equal(
    platformWorkspaces.workspaces.find((workspace) => workspace.id === "org_alpha")?.userCount,
    8,
    "the pending doctor request must not inflate operational workspace counts",
  );
  const soloRoleRequestPayload = {
    requestedRole: "doctor",
    accountType: "solo_doctor",
    workspaceType: "solo_practice",
    workspaceName: "Stable Solo Practice",
    name: "Solo Role Request Doctor",
    phone: "0907654321",
    license: "SOLO-LIC-001",
    department: "Cardiology",
    registrationReason: "Independent remote care",
  };
  const rejectedSoloCrossTarget = await expectStatus(
    "a solo role request cannot bind an unrelated explicit workspace",
    soloRoleRequestUser,
    "/api/v1/auth/role-request",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-solo-role-request-cross-target",
      },
      body: JSON.stringify({
        ...soloRoleRequestPayload,
        organizationId: "org_beta",
      }),
    },
  );
  assert.equal(
    rejectedSoloCrossTarget.error.code,
    "ROLE_REQUEST_WORKSPACE_MISMATCH",
  );
  const soloRoleRequestHeaders = {
    "Content-Type": "application/json",
    "Idempotency-Key": "workspace-solo-role-request-owner",
  };
  const soloRoleRequestReceipt = await expectStatus(
    "a solo doctor submits an account-owned pending request",
    soloRoleRequestUser,
    "/api/v1/auth/role-request",
    200,
    {
      method: "POST",
      headers: soloRoleRequestHeaders,
      body: JSON.stringify(soloRoleRequestPayload),
    },
  );
  const soloWorkspaceId = "org_solo_usr_solo_role_request";
  assert.equal(soloRoleRequestReceipt.roleRequest.status, "pending");
  assert.equal(soloRoleRequestReceipt.user.organizationId, "org_personal_patient");
  assert.equal(soloRoleRequestReceipt.user.roleRequestOrganizationId, soloWorkspaceId);
  assert.equal(
    soloRoleRequestReceipt.user.memberships.some(
      (membership) => membership.organizationId === soloWorkspaceId,
    ),
    false,
  );
  const workspacesAfterSoloRequest = await expectStatus(
    "platform sees the materialized solo request workspace",
    platform,
    "/api/v1/admin/workspaces",
    200,
  );
  const stableSoloWorkspace = workspacesAfterSoloRequest.workspaces.find(
    (workspace) => workspace.id === soloWorkspaceId,
  );
  assert.equal(stableSoloWorkspace?.name, "Stable Solo Practice");
  assert.equal(stableSoloWorkspace?.type, "clinic");
  assert.equal(stableSoloWorkspace?.workspaceType, "solo_practice");
  const conflictingSoloRoleRequest = await expectStatus(
    "a conflicting solo retry is rejected before workspace mutation",
    soloRoleRequestUser,
    "/api/v1/auth/role-request",
    409,
    {
      method: "POST",
      headers: soloRoleRequestHeaders,
      body: JSON.stringify({
        ...soloRoleRequestPayload,
        workspaceName: "Mutated Solo Practice",
      }),
    },
  );
  assert.equal(conflictingSoloRoleRequest.error.code, "IDEMPOTENCY_KEY_REUSED");
  const workspacesAfterSoloConflict = await expectStatus(
    "solo workspace remains unchanged after a conflicting retry",
    platform,
    "/api/v1/admin/workspaces",
    200,
  );
  const unchangedSoloWorkspace = workspacesAfterSoloConflict.workspaces.find(
    (workspace) => workspace.id === soloWorkspaceId,
  );
  assert.equal(unchangedSoloWorkspace?.name, stableSoloWorkspace.name);
  assert.equal(unchangedSoloWorkspace?.updatedAt, stableSoloWorkspace.updatedAt);
  const soloApproval = await expectStatus(
    "platform can approve the owner of a materialized solo-doctor workspace",
    platform,
    `/api/v1/admin/doctor-requests/${soloRoleRequestReceipt.user.id}/approve`,
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-solo-role-approval-owner",
      },
      body: JSON.stringify({}),
    },
  );
  assert.equal(soloApproval.request.role, "doctor");
  assert.equal(soloApproval.request.roleRequestStatus, "approved");
  assert.equal(soloApproval.request.organizationId, soloWorkspaceId);
  assert.equal(
    soloApproval.request.patientId || "",
    "",
    "doctor approval detaches the personal self-patient inverse before changing tenant",
  );
  assert.equal(
    soloApproval.request.currentMembership?.role,
    "doctor",
    "solo-doctor approval keeps a doctor operational membership while ownership remains on the workspace",
  );
  assert.equal(
    (await expectStatus(
      "approved solo doctor workspace remains owner-bound",
      platform,
      "/api/v1/admin/workspaces",
      200,
    )).workspaces.find((workspace) => workspace.id === soloWorkspaceId)?.ownerUserId,
    soloRoleRequestReceipt.user.id,
  );
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
  assert.deepEqual(Object.keys(portalStatus.status).sort(), [
    "activeScanId",
    "devicesCount",
    "devicesOnline",
    "recording",
    "updatedAt",
    "workspaceId",
  ]);
  assert.equal(portalStatus.status.workspaceId, "org_alpha");
  assert.equal(portalStatus.status.devicesCount, 2);
  assert.equal(portalStatus.status.devicesOnline, 0);
  await expectStatus("platform admin is not a portal surface user", platform, "/api/portal/status", 403, {
    headers: portalHeaders,
  });

  const publicStatus = await expectPublicStatus(
    "public backend status exposes health only",
    "/api/v1/status",
    200,
  );
  assert.deepEqual(Object.keys(publicStatus).sort(), [
    "ok",
    "service",
    "type",
    "updatedAt",
  ]);
  assert.equal(publicStatus.type, "health");
  for (const forbiddenField of [
    "activeScanId",
    "deviceId",
    "esp",
    "httpPort",
    "listeners",
    "patientId",
    "sampleRate",
    "scanId",
    "sessionId",
    "udpEsp",
    "udpPort",
    "workspaceId",
    "wsEsp",
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(publicStatus, forbiddenField),
      false,
      `public status must not expose ${forbiddenField}`,
    );
  }
  await expectPublicStatus(
    "unauthenticated caller cannot read clinical dashboard status",
    "/api/v1/doctor/status",
    401,
  );
  await expectStatus(
    "patient role cannot read clinical dashboard status",
    patient,
    "/api/v1/doctor/status",
    403,
  );
  const alphaDoctorStatus = await expectStatus(
    "doctor reads only current alpha workspace dashboard status",
    doctor,
    "/api/v1/doctor/status",
    200,
  );
  assert.equal(alphaDoctorStatus.workspaceId, "org_alpha");
  assert.equal(alphaDoctorStatus.devicesCount, 2);
  const betaDoctorStatus = await expectStatus(
    "doctor in beta workspace cannot receive alpha dashboard aggregates",
    betaDoctor,
    "/api/v1/doctor/status",
    200,
  );
  assert.equal(betaDoctorStatus.workspaceId, "org_beta");
  assert.equal(betaDoctorStatus.devicesCount, 1);
  assert.deepEqual(Object.keys(betaDoctorStatus).sort(), [
    "activeScanId",
    "devicesCount",
    "devicesOnline",
    "recording",
    "updatedAt",
    "workspaceId",
  ]);

  const portalOverview = await expectStatus("canonical portal overview resolves through workspace stats", workspaceAdmin, "/api/v1/portal/overview?range=today&timezoneOffsetMinutes=420", 200, {
    headers: portalHeaders,
  });
  assert.ok(portalOverview.stats);
  assert.equal(portalOverview.workspaceId, "org_alpha");
  assert.equal(portalOverview.range.key, "today");
  assert.equal(portalOverview.range.timezoneOffsetMinutes, 420);
  assert.equal(portalOverview.stats.devicesCount, 2);
  assert.equal(portalOverview.stats.devicesOnline <= portalOverview.stats.devicesCount, true);
  assert.equal(Date.parse(portalOverview.generatedAt) > 0, true);
  assert.equal(
    portalOverview.measureData.reduce((sum, point) => sum + Number(point.count || 0), 0),
    portalOverview.stats.scansCount,
    "overview series must sum to real range-scoped scans",
  );
  assert.deepEqual(portalOverview.deviceData.map((item) => item.key), ["online", "offline"]);
  assert.deepEqual(portalOverview.aiJobData.map((item) => item.key), [
    "processing",
    "completed",
    "failed",
    "pending",
  ]);
  const legacyPortalOverview = await expectStatus(
    "legacy portal overview alias remains compatible",
    workspaceAdmin,
    "/api/portal/overview?range=today&timezoneOffsetMinutes=420",
    200,
    { headers: portalHeaders },
  );
  assert.equal(legacyPortalOverview.workspaceId, portalOverview.workspaceId);
  assert.deepEqual(legacyPortalOverview.stats, portalOverview.stats);
  await expectStatus(
    "portal overview rejects unsupported synthetic ranges",
    workspaceAdmin,
    "/api/v1/portal/overview?range=90d&timezoneOffsetMinutes=420",
    400,
    { headers: portalHeaders },
  );
  const portalMonitoring = await expectStatus("portal monitoring resolves scoped devices and scans", workspaceAdmin, "/api/v1/portal/monitoring", 200, {
    headers: portalHeaders,
  });
  assert.equal(portalMonitoring.workspaceId, "org_alpha");
  assert.equal(Number.isFinite(Date.parse(portalMonitoring.generatedAt)), true);
  assert.deepEqual(
    portalMonitoring.devices.map((device) => device.id),
    ["dev_alpha", "dev_claim_alpha"],
  );
  assert.equal(
    portalMonitoring.devices.every(
      (device) =>
        device.organizationId === portalMonitoring.workspaceId &&
        typeof device.online === "boolean" &&
        !Object.hasOwn(device, "secret") &&
        !Object.hasOwn(device, "deviceSecret") &&
        !Object.hasOwn(device, "secretHash") &&
        !Object.hasOwn(device, "claimCodeHash"),
    ),
    true,
  );
  assert.equal(
    portalMonitoring.devices.find((device) => device.id === "dev_alpha").online,
    false,
    "a legacy connected flag must not replace authenticated WSS presence",
  );
  assert.deepEqual(portalMonitoring.scans.map((scan) => scan.id), ["scan_alpha", "scan_alpha_extra"]);
  assert.equal(
    portalMonitoring.scans.every(
      (scan) => scan.organizationId === portalMonitoring.workspaceId,
    ),
    true,
  );
  assert.deepEqual(portalMonitoring.alerts.map((alert) => alert.id), ["alert_alpha_seed"]);
  assert.equal(portalMonitoring.status.recording, false);
  assert.equal(portalMonitoring.status.workspaceId, null);
  const legacyPortalMonitoring = await expectStatus(
    "legacy portal monitoring alias remains compatible",
    workspaceAdmin,
    "/api/portal/monitoring",
    200,
    { headers: portalHeaders },
  );
  assert.equal(legacyPortalMonitoring.workspaceId, portalMonitoring.workspaceId);

  const pendingReviewQueue = await expectStatus(
    "portal review queue derives only current-workspace completed scans",
    workspaceAdmin,
    "/api/portal/review-queue?status=pending",
    200,
    { headers: portalHeaders },
  );
  assert.deepEqual(
    pendingReviewQueue.reviews.map((review) => review.scanId).sort(),
    ["scan_alpha", "scan_alpha_extra"],
  );
  assert.equal(pendingReviewQueue.workspaceId, "org_alpha");
  assert.equal(
    pendingReviewQueue.reviews.every(
      (review) => review.organizationId === pendingReviewQueue.workspaceId,
    ),
    true,
  );
  assert.equal(pendingReviewQueue.reviews.every((review) => review.status === "pending" && review.version === 1), true);
  await expectStatus("technician cannot make or inspect clinical review decisions", technician, "/api/portal/review-queue", 403, {
    headers: portalHeaders,
  });
  await expectStatus(
    "review decision requires Idempotency-Key",
    workspaceAdmin,
    "/api/portal/review-queue/scan_alpha/decision",
    400,
    {
      method: "POST",
      headers: portalJsonHeaders,
      body: JSON.stringify({ decision: "accepted", note: "Reviewed", expectedVersion: 1 }),
    },
  );
  await expectStatus(
    "review decision denies a cross-workspace scan",
    workspaceAdmin,
    "/api/portal/review-queue/scan_beta/decision",
    403,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "review-cross-workspace" },
      body: JSON.stringify({ decision: "accepted", note: "Must be denied", expectedVersion: 1 }),
    },
  );
  const reviewDecisionOptions = {
    method: "POST",
    headers: { ...portalJsonHeaders, "Idempotency-Key": "review-alpha-decision" },
    body: JSON.stringify({
      decision: "follow_up_required",
      note: "Schedule clinician follow-up",
      expectedVersion: 1,
    }),
  };
  const reviewedScan = await expectStatus(
    "review decision records reviewer, timestamp, decision, and optimistic version",
    workspaceAdmin,
    "/api/portal/review-queue/scan_alpha/decision",
    200,
    reviewDecisionOptions,
  );
  assert.equal(reviewedScan.review.status, "reviewed");
  assert.equal(reviewedScan.workspaceId, "org_alpha");
  assert.equal(reviewedScan.review.organizationId, reviewedScan.workspaceId);
  assert.equal(reviewedScan.review.decision, "follow_up_required");
  assert.equal(reviewedScan.review.reviewerUserId, "usr_workspace_admin");
  assert.equal(reviewedScan.review.version, 2);
  assert.ok(reviewedScan.review.reviewedAt);
  const replayedReview = await expectStatus(
    "review decision replay returns the original committed outcome",
    workspaceAdmin,
    "/api/portal/review-queue/scan_alpha/decision",
    200,
    reviewDecisionOptions,
  );
  assert.deepEqual(replayedReview.review, reviewedScan.review);
  await expectStatus(
    "review optimistic version rejects a stale second decision",
    workspaceAdmin,
    "/api/portal/review-queue/scan_alpha/decision",
    409,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "review-alpha-stale" },
      body: JSON.stringify({ decision: "accepted", note: "Stale overwrite", expectedVersion: 1 }),
    },
  );

  const initialAlertLedger = await expectStatus("portal alert ledger is workspace scoped", workspaceAdmin, "/api/portal/alerts", 200, {
    headers: portalHeaders,
  });
  assert.equal(initialAlertLedger.workspaceId, "org_alpha");
  assert.deepEqual(initialAlertLedger.alerts.map((alert) => alert.id), ["alert_alpha_seed"]);
  await expectStatus("viewer without alert capability cannot read the ledger", viewer, "/api/portal/alerts", 403, {
    headers: portalHeaders,
  });
  await expectStatus(
    "alert source creation requires Idempotency-Key",
    workspaceAdmin,
    "/api/portal/alerts",
    400,
    {
      method: "POST",
      headers: portalJsonHeaders,
      body: JSON.stringify({ sourceType: "scan", sourceId: "scan_alpha_extra", title: "Review signal", message: "Signal requires attention" }),
    },
  );
  await expectStatus(
    "alert source cannot cross workspace",
    workspaceAdmin,
    "/api/portal/alerts",
    403,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "alert-cross-workspace" },
      body: JSON.stringify({ sourceType: "device", sourceId: "dev_beta", title: "Private", message: "Must be denied" }),
    },
  );
  const alertPayload = {
    sourceType: "scan",
    sourceId: "scan_alpha_extra",
    severity: "warning",
    title: "Repeat measurement requested",
    message: "Signal quality requires another measurement",
  };
  const openedAlert = await expectStatus("portal opens one source-deduplicated alert ledger entry", workspaceAdmin, "/api/portal/alerts", 201, {
    method: "POST",
    headers: { ...portalJsonHeaders, "Idempotency-Key": "alert-open-alpha" },
    body: JSON.stringify(alertPayload),
  });
  assert.equal(openedAlert.workspaceId, "org_alpha");
  assert.equal(openedAlert.alert.status, "open");
  assert.equal(openedAlert.alert.version, 1);
  const duplicateAlert = await expectStatus("a repeated source is deduplicated without another ledger row", workspaceAdmin, "/api/portal/alerts", 200, {
    method: "POST",
    headers: { ...portalJsonHeaders, "Idempotency-Key": "alert-open-alpha-duplicate" },
    body: JSON.stringify(alertPayload),
  });
  assert.equal(duplicateAlert.deduplicated, true);
  assert.equal(duplicateAlert.alert.id, openedAlert.alert.id);

  const acknowledgeOptions = {
    method: "POST",
    headers: { ...portalJsonHeaders, "Idempotency-Key": "alert-ack-alpha" },
    body: JSON.stringify({ expectedVersion: 1, note: "Clinician is investigating" }),
  };
  const acknowledgedAlert = await expectStatus(
    "alert acknowledge records actor, timestamp, and optimistic version",
    workspaceAdmin,
    `/api/portal/alerts/${openedAlert.alert.id}/acknowledge`,
    200,
    acknowledgeOptions,
  );
  assert.equal(acknowledgedAlert.workspaceId, "org_alpha");
  assert.equal(acknowledgedAlert.alert.status, "acknowledged");
  assert.equal(acknowledgedAlert.alert.version, 2);
  assert.equal(acknowledgedAlert.alert.acknowledgedByUserId, "usr_workspace_admin");
  assert.ok(acknowledgedAlert.alert.acknowledgedAt);
  const replayedAcknowledge = await expectStatus(
    "alert acknowledge replay returns the original committed outcome",
    workspaceAdmin,
    `/api/portal/alerts/${openedAlert.alert.id}/acknowledge`,
    200,
    acknowledgeOptions,
  );
  assert.deepEqual(replayedAcknowledge.alert, acknowledgedAlert.alert);
  await expectStatus(
    "alert optimistic version rejects a stale acknowledgement",
    workspaceAdmin,
    `/api/portal/alerts/${openedAlert.alert.id}/acknowledge`,
    409,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "alert-ack-alpha-stale" },
      body: JSON.stringify({ expectedVersion: 1, note: "Stale action" }),
    },
  );
  const resolvedAlert = await expectStatus(
    "alert resolve records the final ledger outcome",
    workspaceAdmin,
    `/api/portal/alerts/${openedAlert.alert.id}/resolve`,
    200,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "alert-resolve-alpha" },
      body: JSON.stringify({ expectedVersion: 2, note: "Repeat measurement was completed" }),
    },
  );
  assert.equal(resolvedAlert.workspaceId, "org_alpha");
  assert.equal(resolvedAlert.alert.status, "resolved");
  assert.equal(resolvedAlert.alert.version, 3);
  assert.equal(resolvedAlert.alert.resolvedByUserId, "usr_workspace_admin");
  await expectStatus(
    "alert transition denies a cross-workspace ledger entry",
    workspaceAdmin,
    "/api/portal/alerts/alert_beta_seed/acknowledge",
    403,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "alert-beta-denied" },
      body: JSON.stringify({ expectedVersion: 1, note: "Must be denied" }),
    },
  );
  const portalReports = await expectStatus("portal reports resolve workspace summary", workspaceAdmin, "/api/portal/reports", 200, {
    headers: portalHeaders,
  });
  assert.equal(portalReports.summary.patientsCount, 1);
  assert.equal(portalReports.summary.devicesCount, 2);
  const portalBilling = await expectStatus("canonical portal billing resolves workspace package and usage", workspaceAdmin, "/api/v1/portal/billing", 200, {
    headers: portalHeaders,
  });
  assert.equal(portalBilling.workspace.id, "org_alpha");
  assert.equal(portalBilling.package.id, "pkg_test");
  assert.equal(portalBilling.subscription.status, "active");
  assert.equal(portalBilling.subscription.billingCycle, "monthly");
  assert.equal(portalBilling.subscription.organizationId, "org_alpha");
  assert.equal(portalBilling.billingContact.email, "billing@alpha.test");
  assert.equal(portalBilling.invoicePolicy.mode, "manual");
  assert.equal(portalBilling.invoicePolicy.providerConfigured, false);
  assert.ok(Number.isFinite(Date.parse(portalBilling.generatedAt)));
  assert.equal(portalBilling.usageRows.some((row) => row.key === "patients" && row.used === 1 && row.limit === 10), true);
  assert.equal(portalBilling.usageRows.some((row) => row.key === "devices" && row.used === 2 && row.limit === 2), true);
  assert.equal(portalBilling.usageRows.some((row) => row.key === "aiMonthly" && row.used === 1 && row.limit === 100), true);
  const legacyPortalBilling = await expectStatus("legacy portal billing alias remains compatible", workspaceAdmin, "/api/portal/billing", 200, {
    headers: portalHeaders,
  });
  assert.equal(legacyPortalBilling.workspace.id, portalBilling.workspace.id);
  assert.deepEqual(legacyPortalBilling.usageRows, portalBilling.usageRows);
  const billingPortalBilling = await expectStatus("billing role can read canonical portal billing", billing, "/api/v1/portal/billing", 200, {
    headers: portalHeaders,
  });
  assert.equal(billingPortalBilling.workspace.id, "org_alpha");
  assert.equal(billingPortalBilling.package.id, "pkg_test");
  await expectStatus("viewer cannot read canonical portal billing", viewer, "/api/v1/portal/billing", 403, {
    headers: portalHeaders,
  });
  const portalAuditLog = await expectStatus("portal audit log resolves", workspaceAdmin, "/api/portal/audit-log", 200, {
    headers: portalHeaders,
  });
  assert.ok(Array.isArray(portalAuditLog.logs));
  assert.equal(portalAuditLog.pagination.page, 1);
  assert.equal(portalAuditLog.pagination.limit, 25);
  assert.equal(portalAuditLog.logs.filter((log) => log.action === "scan.review.decision").length, 1);
  assert.equal(portalAuditLog.logs.filter((log) => log.action === "alert.open").length, 1);
  assert.equal(portalAuditLog.logs.filter((log) => log.action === "alert.acknowledge").length, 1);
  assert.equal(portalAuditLog.logs.filter((log) => log.action === "alert.resolve").length, 1);
  await expectStatus("doctor cannot inspect the workspace audit ledger", doctor, "/api/v1/audit-logs", 403);
  await expectStatus("billing cannot inspect the workspace audit ledger", billing, "/api/v1/audit-logs", 403);
  await expectStatus("viewer cannot inspect the workspace audit ledger", viewer, "/api/v1/audit-logs", 403);
  const crossWorkspaceAudit = await expectStatus(
    "workspace admin cannot query another workspace audit ledger",
    workspaceAdmin,
    "/api/v1/audit-logs?organizationId=org_beta",
    403,
  );
  assert.equal(crossWorkspaceAudit.error.code, "AUDIT_SCOPE_DENIED");
  const invalidAuditDate = await expectStatus(
    "audit ledger rejects an invalid calendar date",
    workspaceAdmin,
    "/api/v1/audit-logs?startDate=2026-02-30",
    400,
  );
  assert.equal(invalidAuditDate.error.code, "AUDIT_DATE_INVALID");
  const pagedAuditRequest = await request(
    "/api/v1/audit-logs?action=alert.open&resourceType=clinical_alert&page=1&limit=1&sort=createdAt%3Adesc",
    { headers: workspaceAdmin.headers },
  );
  assert.equal(pagedAuditRequest.response.status, 200);
  assert.equal(pagedAuditRequest.body.logs.length, 1);
  assert.equal(pagedAuditRequest.body.logs[0].action, "alert.open");
  assert.equal(pagedAuditRequest.body.logs[0].organizationId, "org_alpha");
  assert.equal(pagedAuditRequest.response.headers.get("x-page"), "1");
  assert.equal(pagedAuditRequest.response.headers.get("x-page-limit"), "1");
  const accessLogAlias = await expectStatus(
    "legacy access-log alias resolves to the same canonical audit ledger",
    workspaceAdmin,
    "/api/v1/access-logs?action=alert.open&limit=1",
    200,
  );
  assert.deepEqual(accessLogAlias.logs.map((log) => log.id), pagedAuditRequest.body.logs.map((log) => log.id));

  const portalPatients = await expectStatus("portal lists only scoped patients", workspaceAdmin, "/api/portal/patients", 200, {
    headers: portalHeaders,
  });
  assert.deepEqual(portalPatients.patients.map((patient) => patient.id), ["pat_alpha"]);
  const mobileClinicalPatients = await expectStatus(
    "mobile clinical patient list is bound to the current workspace",
    workspaceAdmin,
    "/api/v1/patients",
    200,
  );
  assert.equal(mobileClinicalPatients.workspaceId, "org_alpha");
  assert.deepEqual(mobileClinicalPatients.patients.map((patient) => patient.id), ["pat_alpha"]);
  await expectStatus("portal cannot read cross workspace patient", workspaceAdmin, "/api/portal/patients/pat_beta", 403, {
    headers: portalHeaders,
  });
  const csvHeaders = (key, fileName) => ({
    ...portalHeaders,
    "Content-Type": "text/csv; charset=utf-8",
    "Idempotency-Key": key,
    "X-File-Name": encodeURIComponent(fileName),
  });
  await expectStatus(
    "viewer cannot validate a patient import",
    viewer,
    "/api/portal/patients/import/validate",
    403,
    {
      method: "POST",
      headers: csvHeaders("viewer-import-denied", "viewer.csv"),
      body: "name,patientCode\nViewer,VIEWER-001",
    },
  );
  await expectStatus(
    "personal patient cannot use workspace batch import",
    patient,
    "/api/v1/patients/import/validate",
    403,
    {
      method: "POST",
      headers: csvHeaders("patient-import-denied", "patient.csv"),
      body: "name,patientCode\nPatient,PATIENT-IMPORT-001",
    },
  );
  const invalidImportCsv = [
    "name,patientCode,dateOfBirth,email",
    "Existing code,ALPHA-001,1990-01-01,new@example.com",
    "Bad email,IMPORT-BAD-002,1991-02-03,not-an-email",
  ].join("\n");
  const invalidImport = await expectStatus(
    "workspace validates patient import without creating partial patients",
    workspaceAdmin,
    "/api/portal/patients/import/validate",
    201,
    {
      method: "POST",
      headers: csvHeaders("workspace-import-invalid", "benh-nhan-loi.csv"),
      body: invalidImportCsv,
    },
  );
  assert.equal(invalidImport.batch.status, "invalid");
  assert.equal(invalidImport.batch.rowCount, 2);
  assert.equal(invalidImport.batch.validCount, 0);
  assert.equal(invalidImport.batch.invalidCount, 2);
  assert.ok(invalidImport.batch.rows[0].issues.some((item) => item.code === "PATIENT_IMPORT_DUPLICATE_EXISTING"));
  const invalidImportReplay = await expectStatus(
    "patient import validation replays the exact batch",
    workspaceAdmin,
    "/api/portal/patients/import/validate",
    201,
    {
      method: "POST",
      headers: csvHeaders("workspace-import-invalid", "benh-nhan-loi.csv"),
      body: invalidImportCsv,
    },
  );
  assert.equal(invalidImportReplay.batch.id, invalidImport.batch.id);
  assert.equal(invalidImportReplay.replayed, true);
  const reusedImportValidationKey = await expectStatus(
    "patient import validation rejects the same key with another file",
    workspaceAdmin,
    "/api/portal/patients/import/validate",
    409,
    {
      method: "POST",
      headers: csvHeaders("workspace-import-invalid", "benh-nhan-khac.csv"),
      body: "name,patientCode,dateOfBirth\nOther,IMPORT-OTHER,1990-01-01",
    },
  );
  assert.equal(reusedImportValidationKey.error.code, "IDEMPOTENCY_KEY_REUSED");
  await expectStatus(
    "another workspace cannot read a patient import batch",
    betaDoctor,
    `/api/v1/patients/import/${invalidImport.batch.id}`,
    403,
  );
  const invalidCommit = await expectStatus(
    "invalid patient import cannot commit",
    workspaceAdmin,
    `/api/portal/patients/import/${invalidImport.batch.id}/commit`,
    409,
    {
      method: "POST",
      headers: { ...portalHeaders, "Idempotency-Key": "workspace-import-invalid-commit" },
    },
  );
  assert.equal(invalidCommit.error.code, "PATIENT_IMPORT_BATCH_INVALID");

  const validImportCsv = [
    "name,patientCode,dateOfBirth,gender,phone,email,bloodType,allergies",
    "Import One,IMPORT-001,1990-01-02,Nam,0901111222,import.one@example.com,O+,bụi",
    "Import Two,IMPORT-002,1991-02-03,Nữ,0901111333,import.two@example.com,A+,",
  ].join("\n");
  const validImport = await expectStatus(
    "workspace validates a complete patient batch",
    workspaceAdmin,
    "/api/portal/patients/import/validate",
    201,
    {
      method: "POST",
      headers: csvHeaders("workspace-import-valid", "benh-nhan-hop-le.csv"),
      body: validImportCsv,
    },
  );
  assert.equal(validImport.batch.status, "validated");
  assert.equal(validImport.batch.validCount, 2);
  assert.equal(validImport.batch.invalidCount, 0);
  assert.notEqual(validImport.batch.rows[0].patient.id, validImport.batch.rows[0].patient.patientCode);
  const importDetail = await expectStatus(
    "workspace reads the validated patient batch",
    workspaceAdmin,
    `/api/portal/patients/import/${validImport.batch.id}`,
    200,
    { headers: portalHeaders },
  );
  assert.equal(importDetail.batch.id, validImport.batch.id);
  const committedImport = await expectStatus(
    "workspace commits every validated patient atomically",
    workspaceAdmin,
    `/api/portal/patients/import/${validImport.batch.id}/commit`,
    201,
    {
      method: "POST",
      headers: { ...portalHeaders, "Idempotency-Key": "workspace-import-valid-commit" },
    },
  );
  assert.equal(committedImport.batch.status, "committed");
  assert.equal(committedImport.importedCount, 2);
  assert.equal(committedImport.patientIds.length, 2);
  assert.equal(new Set(committedImport.patientIds).size, 2);
  const committedImportReplay = await expectStatus(
    "patient import commit double-submit replays one outcome",
    workspaceAdmin,
    `/api/portal/patients/import/${validImport.batch.id}/commit`,
    201,
    {
      method: "POST",
      headers: { ...portalHeaders, "Idempotency-Key": "workspace-import-valid-commit" },
    },
  );
  assert.equal(committedImportReplay.replayed, true);
  assert.deepEqual(committedImportReplay.patientIds, committedImport.patientIds);
  const secondImportCommit = await expectStatus(
    "committed batch rejects a different commit intent",
    workspaceAdmin,
    `/api/portal/patients/import/${validImport.batch.id}/commit`,
    409,
    {
      method: "POST",
      headers: { ...portalHeaders, "Idempotency-Key": "workspace-import-valid-commit-other" },
    },
  );
  assert.equal(secondImportCommit.error.code, "PATIENT_IMPORT_ALREADY_COMMITTED");
  const patientsAfterImport = await expectStatus(
    "committed patients are visible only after the batch outcome",
    workspaceAdmin,
    "/api/portal/patients",
    200,
    { headers: portalHeaders },
  );
  assert.ok(committedImport.patientIds.every((id) => patientsAfterImport.patients.some((item) => item.id === id)));
  for (const patientId of committedImport.patientIds) {
    await expectStatus(
      "workspace cleans imported patient",
      workspaceAdmin,
      `/api/portal/patients/${patientId}`,
      200,
      {
        method: "DELETE",
        headers: { ...portalHeaders, "Idempotency-Key": `cleanup-import-${patientId}` },
      },
    );
  }
  const createdPatient = await expectStatus("portal creates patient in current workspace", workspaceAdmin, "/api/portal/patients", 201, {
    method: "POST",
    headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-portal-patient-create" },
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
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-portal-patient-update" },
      body: JSON.stringify({ notes: "Updated through portal smoke" }),
    },
  );
  assert.equal(updatedPatient.patient.notes, "Updated through portal smoke");

  const initialAppointments = await expectStatus("portal lists scoped appointments", workspaceAdmin, "/api/portal/appointments", 200, {
    headers: portalHeaders,
  });
  assert.deepEqual(initialAppointments.appointments.map((appointment) => appointment.id), [
    "appt_alpha",
    "appt_revoked_doctor",
  ]);
  await expectStatus("portal cannot read cross workspace appointment", workspaceAdmin, "/api/portal/appointments/appt_beta", 403, {
    headers: portalHeaders,
  });
  const appointmentStartsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const appointmentEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
  const appointmentCreateHeaders = { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-create" };
  const appointmentCreatePayload = {
    patientId: "pat_alpha",
    doctorUserId: "usr_doctor",
    type: "remote_consultation",
    startsAt: appointmentStartsAt,
    endsAt: appointmentEndsAt,
    reason: "Follow-up review",
    organizationId: "org_beta",
  };
  const createdAppointment = await expectStatus("portal creates appointment in current workspace", workspaceAdmin, "/api/portal/appointments", 201, {
    method: "POST",
    headers: appointmentCreateHeaders,
    body: JSON.stringify(appointmentCreatePayload),
  });
  assert.equal(createdAppointment.appointment.organizationId, "org_alpha");
  assert.equal(createdAppointment.appointment.patientId, "pat_alpha");
  assert.equal(createdAppointment.appointment.doctorUserId, "usr_doctor");
  const replayedAppointment = await expectStatus("appointment create is idempotent", workspaceAdmin, "/api/portal/appointments", 201, {
    method: "POST",
    headers: appointmentCreateHeaders,
    body: JSON.stringify(appointmentCreatePayload),
  });
  assert.equal(replayedAppointment.appointment.id, createdAppointment.appointment.id);
  await expectStatus("idempotency key cannot be reused with a different appointment payload", workspaceAdmin, "/api/portal/appointments", 409, {
    method: "POST",
    headers: appointmentCreateHeaders,
    body: JSON.stringify({ ...appointmentCreatePayload, reason: "Different payload" }),
  });
  const parallelCreatePayload = {
    ...appointmentCreatePayload,
    startsAt: new Date(Date.parse(appointmentStartsAt) + 6 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(Date.parse(appointmentEndsAt) + 6 * 60 * 60 * 1000).toISOString(),
    reason: "Parallel idempotency proof",
  };
  const parallelCreateOptions = {
    method: "POST",
    headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-parallel" },
    body: JSON.stringify(parallelCreatePayload),
  };
  const [parallelCreateLeft, parallelCreateRight] = await Promise.all([
    expectStatus("first concurrent appointment submit succeeds", workspaceAdmin, "/api/portal/appointments", 201, parallelCreateOptions),
    expectStatus("second concurrent appointment submit replays", workspaceAdmin, "/api/portal/appointments", 201, parallelCreateOptions),
  ]);
  assert.equal(parallelCreateLeft.appointment.id, parallelCreateRight.appointment.id);
  await expectStatus("appointment detects patient or doctor time conflict", workspaceAdmin, "/api/portal/appointments", 409, {
    method: "POST",
    headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-conflict" },
    body: JSON.stringify({
      ...appointmentCreatePayload,
      startsAt: new Date(Date.parse(appointmentStartsAt) + 5 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.parse(appointmentEndsAt) + 5 * 60 * 1000).toISOString(),
    }),
  });
  await expectStatus(
    "scheduled appointment cannot skip confirmation and complete",
    workspaceAdmin,
    `/api/portal/appointments/${createdAppointment.appointment.id}`,
    409,
    {
      method: "PATCH",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-invalid-transition" },
      body: JSON.stringify({ status: "completed" }),
    },
  );
  const rescheduledStartsAt = new Date(Date.parse(appointmentStartsAt) + 60 * 60 * 1000).toISOString();
  const rescheduledEndsAt = new Date(Date.parse(appointmentEndsAt) + 60 * 60 * 1000).toISOString();
  const rescheduledAppointment = await expectStatus(
    "portal reschedules appointment through explicit action",
    workspaceAdmin,
    `/api/portal/appointments/${createdAppointment.appointment.id}/reschedule`,
    200,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-reschedule" },
      body: JSON.stringify({ startsAt: rescheduledStartsAt, endsAt: rescheduledEndsAt, reason: "Patient requested a later time" }),
    },
  );
  assert.equal(rescheduledAppointment.appointment.startsAt, rescheduledStartsAt);
  const replayedReschedule = await expectStatus(
    "appointment reschedule is idempotent",
    workspaceAdmin,
    `/api/portal/appointments/${createdAppointment.appointment.id}/reschedule`,
    200,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-reschedule" },
      body: JSON.stringify({ startsAt: rescheduledStartsAt, endsAt: rescheduledEndsAt, reason: "Patient requested a later time" }),
    },
  );
  assert.equal(replayedReschedule.appointment.id, createdAppointment.appointment.id);
  await expectStatus(
    "portal cannot reschedule cross workspace appointment",
    workspaceAdmin,
    "/api/portal/appointments/appt_beta/reschedule",
    403,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-cross-workspace" },
      body: JSON.stringify({ startsAt: rescheduledStartsAt, endsAt: rescheduledEndsAt, reason: "Cross workspace attempt" }),
    },
  );
  const updatedAppointment = await expectStatus(
    "portal confirms appointment",
    workspaceAdmin,
    `/api/portal/appointments/${createdAppointment.appointment.id}`,
    200,
    {
      method: "PATCH",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-confirm" },
      body: JSON.stringify({ status: "confirmed", notes: "Confirmed through portal smoke" }),
    },
  );
  assert.equal(updatedAppointment.appointment.status, "confirmed");
  await expectStatus(
    "appointment cancellation requires a reason",
    workspaceAdmin,
    `/api/portal/appointments/${createdAppointment.appointment.id}/cancel`,
    400,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-cancel-missing-reason" },
      body: JSON.stringify({}),
    },
  );
  const cancelledAppointment = await expectStatus(
    "portal cancels confirmed appointment with a reason",
    workspaceAdmin,
    `/api/portal/appointments/${createdAppointment.appointment.id}/cancel`,
    200,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-cancel" },
      body: JSON.stringify({ reason: "Patient is unavailable" }),
    },
  );
  assert.equal(cancelledAppointment.appointment.status, "cancelled");
  assert.equal(cancelledAppointment.appointment.cancellationReason, "Patient is unavailable");
  const replayedConfirmation = await expectStatus(
    "appointment update replay preserves its original mutation outcome",
    workspaceAdmin,
    `/api/portal/appointments/${createdAppointment.appointment.id}`,
    200,
    {
      method: "PATCH",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-confirm" },
      body: JSON.stringify({ status: "confirmed", notes: "Confirmed through portal smoke" }),
    },
  );
  assert.equal(replayedConfirmation.appointment.status, "confirmed");
  await expectStatus(
    "cancelled appointment is terminal",
    workspaceAdmin,
    `/api/portal/appointments/${createdAppointment.appointment.id}`,
    409,
    {
      method: "PATCH",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "workspace-smoke-appointment-terminal-transition" },
      body: JSON.stringify({ status: "completed" }),
    },
  );
  const appointmentNotifications = await expectStatus("appointment create emits scoped notification", workspaceAdmin, "/api/portal/notifications", 200, {
    headers: portalHeaders,
  });
  assert.equal(
    appointmentNotifications.notifications.some((notification) => notification.metadata?.appointmentId === createdAppointment.appointment.id),
    true,
  );
  const appointmentNotification = appointmentNotifications.notifications.find(
    (notification) => notification.metadata?.appointmentId === createdAppointment.appointment.id,
  );
  assert.equal(appointmentNotification.metadata.destination, "appointment_detail");
  assert.equal(appointmentNotification.metadata.actionPath, `/appointments/${createdAppointment.appointment.id}`);
  assert.equal(
    appointmentNotifications.notifications.filter(
      (notification) => notification.metadata?.appointmentId === parallelCreateLeft.appointment.id,
    ).length,
    1,
  );
  const appointmentAudit = await expectStatus("appointment mutations are audit-backed", workspaceAdmin, "/api/portal/audit-log", 200, {
    headers: portalHeaders,
  });
  assert.equal(
    appointmentAudit.logs.filter(
      (log) => log.action === "appointment.create" && log.resourceId === parallelCreateLeft.appointment.id,
    ).length,
    1,
  );
  const appointmentDeleteHeaders = {
    ...portalHeaders,
    "Idempotency-Key": "workspace-smoke-appointment-delete",
  };
  const missingAppointmentDeleteKey = await expectStatus("appointment deletion requires Idempotency-Key", workspaceAdmin, `/api/portal/appointments/${createdAppointment.appointment.id}`, 400, {
    method: "DELETE",
    headers: portalHeaders,
  });
  assert.equal(missingAppointmentDeleteKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  await expectStatus("portal cannot soft-delete a cross-workspace appointment", workspaceAdmin, "/api/portal/appointments/appt_beta", 403, {
    method: "DELETE",
    headers: {
      ...portalHeaders,
      "Idempotency-Key": "workspace-smoke-cross-workspace-appointment-delete",
    },
  });
  const deletedAppointment = await expectStatus("portal soft-deletes appointment", workspaceAdmin, `/api/portal/appointments/${createdAppointment.appointment.id}`, 200, {
    method: "DELETE",
    headers: appointmentDeleteHeaders,
  });
  assert.equal(deletedAppointment.deleted, true);
  assert.equal(deletedAppointment.appointmentId, createdAppointment.appointment.id);
  assert.equal(deletedAppointment.workspaceId, "org_alpha");
  assert.equal(deletedAppointment.replayed, false);
  assert.ok(Number.isFinite(Date.parse(deletedAppointment.deletedAt)));
  const replayedAppointmentDelete = await expectStatus("appointment soft-delete is idempotent", workspaceAdmin, `/api/portal/appointments/${createdAppointment.appointment.id}`, 200, {
    method: "DELETE",
    headers: appointmentDeleteHeaders,
  });
  assert.equal(replayedAppointmentDelete.replayed, true);
  assert.equal(replayedAppointmentDelete.deletedAt, deletedAppointment.deletedAt);
  await expectStatus("deleted portal appointment is gone", workspaceAdmin, `/api/portal/appointments/${createdAppointment.appointment.id}`, 404, {
    headers: portalHeaders,
  });
  const appointmentsAfterDelete = await expectStatus("soft-deleted appointment is absent from the active ledger", workspaceAdmin, "/api/portal/appointments", 200, {
    headers: portalHeaders,
  });
  assert.equal(
    appointmentsAfterDelete.appointments.some((item) => item.id === createdAppointment.appointment.id),
    false,
  );
  const auditAfterAppointmentDelete = await expectStatus("appointment soft-delete commits one audit row", workspaceAdmin, "/api/portal/audit-log", 200, {
    headers: portalHeaders,
  });
  assert.equal(
    auditAfterAppointmentDelete.logs.filter(
      (log) => log.action === "appointment.delete" && log.resourceId === createdAppointment.appointment.id,
    ).length,
    1,
  );
  await expectStatus(
    "portal deletes parallel idempotency appointment",
    workspaceAdmin,
    `/api/portal/appointments/${parallelCreateLeft.appointment.id}`,
    200,
    {
      method: "DELETE",
      headers: {
        ...portalHeaders,
        "Idempotency-Key": "workspace-smoke-parallel-appointment-delete",
      },
    },
  );

  const shareTargets = await expectStatus("portal share targets stay workspace scoped", workspaceAdmin, "/api/share-targets", 200, {
    headers: portalHeaders,
  });
  assert.equal(shareTargets.workspaceId, "org_alpha");
  assert.ok(Number.isFinite(Date.parse(shareTargets.generatedAt)));
  assert.ok(shareTargets.doctors.some((target) => target.id === "usr_doctor"));
  assert.equal(shareTargets.doctors.some((target) => target.id === "usr_beta_doctor"), false);
  assert.deepEqual(shareTargets.workspaces.map((target) => target.id), ["org_alpha"]);
  const shareWithoutIdempotency = await expectStatus(
    "patient access grant requires Idempotency-Key",
    workspaceAdmin,
    "/api/portal/patients/pat_alpha/shares",
    400,
    {
      method: "POST",
      headers: portalJsonHeaders,
      body: JSON.stringify({ doctorUserId: "usr_doctor", scope: "patient_profile" }),
    },
  );
  assert.equal(shareWithoutIdempotency.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const share = await expectStatus("portal creates patient share", workspaceAdmin, "/api/portal/patients/pat_alpha/shares", 201, {
    method: "POST",
    headers: { ...portalJsonHeaders, "Idempotency-Key": "portal-patient-share" },
    body: JSON.stringify({ doctorUserId: "usr_doctor", scope: "patient_profile" }),
  });
  assert.equal(share.share.patientId, "pat_alpha");
  assert.equal(share.workspaceId, "org_alpha");
  assert.equal(share.patientId, "pat_alpha");
  assert.ok(Number.isFinite(Date.parse(share.generatedAt)));
  assert.equal(share.share.doctorUserId, "usr_doctor");
  assert.equal(share.share.authorityType, "clinician_access_grant");
  assert.equal(share.share.status, "active");
  assert.deepEqual(share.share.recipient, {
    type: "doctor",
    id: "usr_doctor",
    name: "Doctor",
    workspaceId: "org_alpha",
  });
  const shares = await expectStatus("portal lists patient shares", workspaceAdmin, "/api/portal/patients/pat_alpha/shares", 200, {
    headers: portalHeaders,
  });
  assert.equal(shares.workspaceId, "org_alpha");
  assert.equal(shares.patientId, "pat_alpha");
  assert.ok(Number.isFinite(Date.parse(shares.generatedAt)));
  assert.ok(shares.shares.some((item) => item.id === share.share.id && item.active === true));
  await expectStatus(
    "portal revokes patient share",
    workspaceAdmin,
    `/api/portal/patients/pat_alpha/shares/${share.share.id}`,
    200,
    {
      method: "DELETE",
      headers: { ...portalHeaders, "Idempotency-Key": "portal-patient-share-revoke" },
    },
  );

  const patientProfiles = await expectStatus("patient lists own family profiles", patient, "/api/v1/patients", 200);
  assert.deepEqual(
    patientProfiles.patients.map((item) => item.id).sort(),
    ["pat_guardian_dependent", "pat_patient_child", "pat_patient_self"].sort(),
  );
  const activeChildProfile = await expectStatus(
    "patient switches active profile through a backend-confirmed contract",
    patient,
    "/api/v1/me/active-profile",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "activate-seeded-child" },
      body: JSON.stringify({ patientId: "pat_patient_child" }),
    },
  );
  assert.equal(activeChildProfile.user.activePatientId, "pat_patient_child");
  assert.equal(activeChildProfile.activePatient.id, "pat_patient_child");
  const activeProfileFromMe = await expectStatus("active profile survives a fresh account read", patient, "/api/v1/me", 200);
  assert.equal(activeProfileFromMe.user.activePatientId, "pat_patient_child");
  const dashboardPatientsBefore = JSON.stringify(
    JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8")).patients,
  );
  const patientDashboard = await expectStatus(
    "patient dashboard binds the active profile scans and personal device to exact authority",
    patient,
    "/api/v1/patient/dashboard",
    200,
  );
  const dashboardPatientsAfter = JSON.stringify(
    JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8")).patients,
  );
  assert.equal(
    dashboardPatientsAfter,
    dashboardPatientsBefore,
    "GET patient dashboard must not create, rewrite, or backfill patient rows",
  );
  assert.equal(patientDashboard.dashboard.protocolVersion, 1);
  assert.equal(patientDashboard.dashboard.userId, "usr_patient");
  assert.equal(patientDashboard.dashboard.workspaceId, "org_personal_patient");
  assert.equal(patientDashboard.dashboard.activePatientId, "pat_patient_child");
  assert.equal(patientDashboard.dashboard.patient.id, "pat_patient_child");
  assert.deepEqual(
    patientDashboard.dashboard.recentScans.map((scan) => scan.id),
    [
      "scan_patient_child",
      "scan_patient_child_processing",
      "scan_patient_child_legacy",
    ],
  );
  assert.equal(
    patientDashboard.dashboard.recentScans[2].organizationId,
    "org_personal_patient",
    "legacy scans must be backfilled into the explicit response workspace during the compatibility window",
  );
  assert.equal(
    Object.hasOwn(patientDashboard.dashboard.recentScans[0], "aiLabel"),
    false,
  );
  assert.equal(
    Object.hasOwn(patientDashboard.dashboard.recentScans[0], "normal"),
    false,
  );
  assert.equal(patientDashboard.dashboard.device.id, "dev_patient_personal");
  assert.equal(patientDashboard.dashboard.device.ownerUserId, "usr_patient");
  assert.equal(
    patientDashboard.dashboard.device.organizationId,
    "org_personal_patient",
  );
  assert.equal(
    patientDashboard.dashboard.device.assignedPatientId,
    "pat_patient_child",
  );
  assert.equal(patientDashboard.dashboard.device.battery, 0);
  assert.equal(patientDashboard.dashboard.device.online, false);
  assert.equal(patientDashboard.dashboard.sections.scans, "ready");
  assert.equal(patientDashboard.dashboard.sections.device, "ready");
  assert.equal(
    Object.hasOwn(patientDashboard.stats, "abnormalCount"),
    false,
    "unreviewed AI labels must not be promoted into a clinical abnormal KPI",
  );
  assert.equal(
    Object.hasOwn(patientDashboard.dashboard.patient, "scanCount"),
    false,
    "dashboard patient summary must not expose derived cross-workspace scan metadata",
  );
  const guardianStateBeforeRejectedSwitch = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  const guardianDeletedProfile = await expectStatus(
    "assigned guardian cannot activate a soft-deleted dependent profile",
    guardian,
    "/api/v1/me/active-profile",
    404,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "activate-guardian-deleted",
      },
      body: JSON.stringify({ patientId: "pat_guardian_deleted" }),
    },
  );
  assert.equal(guardianDeletedProfile.error.code, "PROFILE_NOT_FOUND");
  const guardianStateAfterRejectedSwitch = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  assert.deepEqual(
    guardianStateAfterRejectedSwitch.users.find((item) => item.id === "usr_guardian"),
    guardianStateBeforeRejectedSwitch.users.find((item) => item.id === "usr_guardian"),
    "rejected active-profile mutation must not persist account changes",
  );
  assert.deepEqual(
    guardianStateAfterRejectedSwitch.patients,
    guardianStateBeforeRejectedSwitch.patients,
    "rejected active-profile mutation must not persist patient changes",
  );
  const guardianActiveProfileWithoutKey = await expectStatus(
    "assigned guardian active profile switch requires an idempotency key",
    guardian,
    "/api/v1/me/active-profile",
    400,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: "pat_guardian_dependent" }),
    },
  );
  assert.equal(
    guardianActiveProfileWithoutKey.error.code,
    "IDEMPOTENCY_KEY_REQUIRED",
  );
  const guardianActiveProfile = await expectStatus(
    "assigned guardian switches to the exact dependent profile",
    guardian,
    "/api/v1/me/active-profile",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "activate-guardian-dependent",
      },
      body: JSON.stringify({ patientId: "pat_guardian_dependent" }),
    },
  );
  assert.equal(
    guardianActiveProfile.activePatient.id,
    "pat_guardian_dependent",
  );
  const guardianProfiles = await expectStatus(
    "assigned guardian lists only legally accessible profiles",
    guardian,
    "/api/v1/patients",
    200,
  );
  const guardianSelfProfile = guardianProfiles.patients.find(
    (profile) =>
      profile.ownerUserId === "usr_guardian" ||
      profile.accountUserId === "usr_guardian" ||
      profile.id === guardian.user.patientId,
  );
  assert.ok(
    guardianSelfProfile?.id,
    "guardian login must expose a canonical self profile for replay ordering proof",
  );
  const guardianSelfSwitch = await expectStatus(
    "a later active-profile mutation advances current state",
    guardian,
    "/api/v1/me/active-profile",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "activate-guardian-self-after-dependent",
      },
      body: JSON.stringify({ patientId: guardianSelfProfile.id }),
    },
  );
  assert.equal(guardianSelfSwitch.user.activePatientId, guardianSelfProfile.id);
  const guardianDependentReplay = await expectStatus(
    "an older idempotency replay returns its exact receipt without reverting current state",
    guardian,
    "/api/v1/me/active-profile",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "activate-guardian-dependent",
      },
      body: JSON.stringify({ patientId: "pat_guardian_dependent" }),
    },
  );
  assert.equal(guardianDependentReplay.replayed, true);
  assert.equal(
    guardianDependentReplay.user.activePatientId,
    "pat_guardian_dependent",
    "the replay receipt must describe the original mutation, not the newer account row",
  );
  assert.equal(
    guardianDependentReplay.activePatient.id,
    "pat_guardian_dependent",
  );
  const guardianAfterReplay = await expectStatus(
    "an older replay leaves the newer active profile authoritative",
    guardian,
    "/api/v1/me",
    200,
  );
  assert.equal(guardianAfterReplay.user.activePatientId, guardianSelfProfile.id);
  await expectStatus(
    "guardian restores dependent profile for the dashboard scenario",
    guardian,
    "/api/v1/me/active-profile",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "activate-guardian-dependent-after-replay",
      },
      body: JSON.stringify({ patientId: "pat_guardian_dependent" }),
    },
  );
  const guardianDashboard = await expectStatus(
    "assigned guardian dashboard preserves legal actor identity without mixing owner data",
    guardian,
    "/api/v1/patient/dashboard",
    200,
  );
  assert.equal(guardianDashboard.dashboard.userId, "usr_guardian");
  assert.equal(
    guardianDashboard.dashboard.activePatientId,
    "pat_guardian_dependent",
  );
  assert.equal(
    guardianDashboard.dashboard.patient.guardianUserId,
    "usr_guardian",
  );
  assert.equal(
    guardianDashboard.dashboard.patient.ownerUserId,
    "usr_patient",
  );
  assert.equal(guardianDashboard.dashboard.recentScans.length, 0);
  assert.equal(guardianDashboard.dashboard.device, null);
  assert.equal(guardianDashboard.dashboard.sections.scans, "empty");
  assert.equal(guardianDashboard.dashboard.sections.device, "empty");
  const crossUserProfileSwitch = await expectStatus(
    "patient cannot activate a profile outside own family",
    patient,
    "/api/v1/me/active-profile",
    403,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "activate-cross-user" },
      body: JSON.stringify({ patientId: "pat_alpha" }),
    },
  );
  assert.equal(crossUserProfileSwitch.error.code, "PROFILE_SCOPE_DENIED");
  const patientFamilySessions = await expectStatus(
    "patient resolves the current auth-session authority for family mutations",
    patient,
    "/api/v1/auth/sessions",
    200,
  );
  const currentFamilyAuthSession = patientFamilySessions.sessions.find(
    (item) => item.current === true,
  );
  assert.ok(currentFamilyAuthSession?.id, "family mutations require a current server auth session");
  const patientFamilyAuthorityHeaders = {
    "X-Shcare-Expected-User-Id": "usr_patient",
    "X-Shcare-Expected-Workspace-Id": "org_personal_patient",
    "X-Shcare-Expected-Auth-Session-Id": currentFamilyAuthSession.id,
  };
  const patientFamilyJsonHeaders = {
    "Content-Type": "application/json",
    ...patientFamilyAuthorityHeaders,
  };
  const selfDeleteDenied = await expectStatus(
    "patient cannot delete canonical self profile at the backend boundary",
    patient,
    "/api/v1/patients/pat_patient_self",
    409,
    {
      method: "DELETE",
      headers: { ...patientFamilyAuthorityHeaders, "Idempotency-Key": "family-self-delete-denied" },
    },
  );
  assert.equal(selfDeleteDenied.error.code, "SELF_PROFILE_DELETE_FORBIDDEN");
  await expectStatus("patient cannot read workspace-owned patient profile", patient, "/api/v1/patients/pat_alpha", 403);
  const missingFamilyCreateKey = await expectStatus(
    "canonical family create requires an Idempotency-Key header",
    patient,
    "/api/v1/patients",
    400,
    {
      method: "POST",
      headers: patientFamilyJsonHeaders,
      body: JSON.stringify({ name: "Missing Header Dependent", relationship: "other" }),
    },
  );
  assert.equal(missingFamilyCreateKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const bodyOnlyFamilyCreateKey = await expectStatus(
    "canonical family create rejects a body-only idempotency key",
    patient,
    "/api/v1/patients",
    400,
    {
      method: "POST",
      headers: patientFamilyJsonHeaders,
      body: JSON.stringify({
        name: "Body Key Dependent",
        relationship: "other",
        idempotencyKey: "family-create-body-only",
      }),
    },
  );
  assert.equal(bodyOnlyFamilyCreateKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const invalidDependentDob = await expectStatus(
    "dependent create rejects an invalid canonical date of birth",
    patient,
    "/api/v1/patients",
    400,
    {
      method: "POST",
      headers: { ...patientFamilyJsonHeaders, "Idempotency-Key": "family-invalid-dob" },
      body: JSON.stringify({ name: "Invalid DOB", dateOfBirth: "2035-02-30" }),
    },
  );
  assert.equal(invalidDependentDob.error.code, "PATIENT_DATE_OF_BIRTH_INVALID");
  const familyAuthorityBaselineProfile = await expectStatus(
    "patient captures the dependent snapshot before authority-race negatives",
    patient,
    "/api/v1/patients/pat_patient_child",
    200,
  );
  const missingFamilyAuthority = await expectStatus(
    "family create fails closed when the pinned authority headers are absent",
    patient,
    "/api/v1/patients",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "family-authority-denied-missing",
      },
      body: JSON.stringify({ name: "Authority Race Denied", relationship: "other" }),
    },
  );
  assert.equal(missingFamilyAuthority.error.code, "PATIENT_MUTATION_AUTHORITY_REQUIRED");
  const familyCreateWorkspaceSwitch = await expectStatus(
    "family create rejects a workspace authority captured before a switch",
    patient,
    "/api/v1/patients",
    409,
    {
      method: "POST",
      headers: {
        ...patientFamilyJsonHeaders,
        "X-Shcare-Expected-Workspace-Id": "org_previous",
        "Idempotency-Key": "family-authority-denied-create",
      },
      body: JSON.stringify({ name: "Authority Race Denied", relationship: "other" }),
    },
  );
  assert.equal(familyCreateWorkspaceSwitch.error.code, "PATIENT_MUTATION_AUTHORITY_MISMATCH");
  const familyUpdateAccountSwitch = await expectStatus(
    "family update rejects an account authority captured before a switch",
    patient,
    "/api/v1/patients/pat_patient_child",
    409,
    {
      method: "PATCH",
      headers: {
        ...patientFamilyJsonHeaders,
        "X-Shcare-Expected-User-Id": "usr_previous",
        "Idempotency-Key": "family-authority-denied-update",
      },
      body: JSON.stringify({ name: "Authority Race Denied" }),
    },
  );
  assert.equal(familyUpdateAccountSwitch.error.code, "PATIENT_MUTATION_AUTHORITY_MISMATCH");
  const familyDeleteSessionSwitch = await expectStatus(
    "family delete rejects an auth-session authority captured before a switch",
    patient,
    "/api/v1/patients/pat_patient_child",
    409,
    {
      method: "DELETE",
      headers: {
        ...patientFamilyAuthorityHeaders,
        "X-Shcare-Expected-Auth-Session-Id": "session_previous",
        "Idempotency-Key": "family-authority-denied-delete",
      },
    },
  );
  assert.equal(familyDeleteSessionSwitch.error.code, "PATIENT_MUTATION_AUTHORITY_MISMATCH");
  const familyAuthorityProfileAfterDenials = await expectStatus(
    "authority-race denials preserve the dependent snapshot",
    patient,
    "/api/v1/patients/pat_patient_child",
    200,
  );
  assert.deepEqual(familyAuthorityProfileAfterDenials.patient, familyAuthorityBaselineProfile.patient);
  const familyAuthorityListAfterDenials = await expectStatus(
    "authority-race denials do not create a dependent",
    patient,
    "/api/v1/patients",
    200,
  );
  assert.equal(
    familyAuthorityListAfterDenials.patients.some((item) => item.name === "Authority Race Denied"),
    false,
  );
  const patientCreatedProfile = await expectStatus("patient creates dependent family profile", patient, "/api/v1/patients", 201, {
    method: "POST",
    headers: { ...patientFamilyJsonHeaders, "Idempotency-Key": "family-dependent-create" },
    body: JSON.stringify({
      patientCode: "FAMILY-NEW",
      name: "Patient Created Dependent",
      profileType: "dependent",
      relationship: "parent",
      dateOfBirth: "1964-04-15",
      bloodType: "O+",
      allergies: ["penicillin", "shellfish"],
      emergencyContact: {
        name: "Family Contact",
        phone: "0901000000",
        relationship: "child",
      },
    }),
  });
  assertPatientMutationReceipt(patientCreatedProfile, {
    userId: "usr_patient",
    workspaceId: "org_personal_patient",
    patientId: patientCreatedProfile.patient.id,
    intent: "create",
    replayed: false,
  });
  assert.equal(patientCreatedProfile.patient.ownerUserId, "usr_patient");
  assert.equal(patientCreatedProfile.patient.guardianUserId, "usr_patient");
  assert.equal(patientCreatedProfile.patient.profileType, "dependent");
  assert.equal(patientCreatedProfile.patient.dateOfBirth, "1964-04-15");
  assert.equal(patientCreatedProfile.patient.bloodType, "O+");
  assert.deepEqual(patientCreatedProfile.patient.allergies, ["penicillin", "shellfish"]);
  assert.deepEqual(patientCreatedProfile.patient.emergencyContact, {
    name: "Family Contact",
    phone: "0901000000",
    relationship: "child",
  });
  assert.notEqual(
    patientCreatedProfile.patient.id,
    patientCreatedProfile.patient.patientCode,
    "canonical patient id must remain distinct from the display patient code",
  );
  const patientCreatedProfileReplay = await expectStatus(
    "dependent creation idempotency key replays the same backend resource",
    patient,
    "/api/v1/patients",
    201,
    {
      method: "POST",
      headers: { ...patientFamilyJsonHeaders, "Idempotency-Key": "family-dependent-create" },
      body: JSON.stringify({
        patientCode: "FAMILY-NEW",
        name: "Patient Created Dependent",
        profileType: "dependent",
        relationship: "parent",
        dateOfBirth: "1964-04-15",
        bloodType: "O+",
        allergies: ["penicillin", "shellfish"],
        emergencyContact: { name: "Family Contact", phone: "0901000000", relationship: "child" },
      }),
    },
  );
  assertPatientMutationReceipt(patientCreatedProfileReplay, {
    userId: "usr_patient",
    workspaceId: "org_personal_patient",
    patientId: patientCreatedProfile.patient.id,
    intent: "create",
    replayed: true,
  });
  assert.deepEqual(
    patientCreatedProfileReplay.patient,
    patientCreatedProfile.patient,
    "create replay must preserve the original canonical patient snapshot",
  );
  const reusedDependentKey = await expectStatus(
    "dependent creation rejects an idempotency key reused with another payload",
    patient,
    "/api/v1/patients",
    409,
    {
      method: "POST",
      headers: { ...patientFamilyJsonHeaders, "Idempotency-Key": "family-dependent-create" },
      body: JSON.stringify({ name: "Different Dependent", relationship: "other" }),
    },
  );
  assert.equal(reusedDependentKey.error.code, "IDEMPOTENCY_KEY_REUSED");
  const missingFamilyUpdateKey = await expectStatus(
    "canonical family update requires an Idempotency-Key header",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    400,
    {
      method: "PATCH",
      headers: patientFamilyJsonHeaders,
      body: JSON.stringify({ name: "Missing Header Update" }),
    },
  );
  assert.equal(missingFamilyUpdateKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const bodyOnlyFamilyUpdateKey = await expectStatus(
    "canonical family update rejects a body-only idempotency key",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    400,
    {
      method: "PATCH",
      headers: patientFamilyJsonHeaders,
      body: JSON.stringify({
        name: "Body Key Update",
        idempotencyKey: "family-update-body-only",
      }),
    },
  );
  assert.equal(bodyOnlyFamilyUpdateKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const patientUpdatedProfile = await expectStatus(
    "patient updates dependent family profile",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    200,
    {
      method: "PATCH",
      headers: { ...patientFamilyJsonHeaders, "Idempotency-Key": "family-dependent-update" },
      body: JSON.stringify({
        name: "Updated Dependent",
        relationship: "mother",
        age: 62,
        ownerUserId: "usr_beta_doctor",
        organizationId: "org_beta",
        guardianUserId: "usr_beta_doctor",
        accountUserId: "usr_beta_doctor",
        profileType: "self",
      }),
    },
  );
  assertPatientMutationReceipt(patientUpdatedProfile, {
    userId: "usr_patient",
    workspaceId: "org_personal_patient",
    patientId: patientCreatedProfile.patient.id,
    intent: "update",
    replayed: false,
  });
  assert.equal(patientUpdatedProfile.patient.name, "Updated Dependent");
  assert.equal(patientUpdatedProfile.patient.relationship, "mother");
  assert.equal(patientUpdatedProfile.patient.ownerUserId, "usr_patient");
  assert.equal(patientUpdatedProfile.patient.organizationId, "org_personal_patient");
  assert.equal(patientUpdatedProfile.patient.guardianUserId, "usr_patient");
  assert.notEqual(patientUpdatedProfile.patient.accountUserId, "usr_beta_doctor");
  assert.equal(patientUpdatedProfile.patient.profileType, "dependent");
  assert.equal(patientUpdatedProfile.replayed, false);
  const patientUpdatedProfileReplay = await expectStatus(
    "patient update replays the same canonical patient outcome",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    200,
    {
      method: "PATCH",
      headers: { ...patientFamilyJsonHeaders, "Idempotency-Key": "family-dependent-update" },
      body: JSON.stringify({
        name: "Updated Dependent",
        relationship: "mother",
        age: 62,
        ownerUserId: "usr_beta_doctor",
        organizationId: "org_beta",
        guardianUserId: "usr_beta_doctor",
        accountUserId: "usr_beta_doctor",
        profileType: "self",
      }),
    },
  );
  assertPatientMutationReceipt(patientUpdatedProfileReplay, {
    userId: "usr_patient",
    workspaceId: "org_personal_patient",
    patientId: patientCreatedProfile.patient.id,
    intent: "update",
    replayed: true,
  });
  assert.deepEqual(
    patientUpdatedProfileReplay.patient,
    patientUpdatedProfile.patient,
    "update replay must preserve the original canonical patient snapshot",
  );
  await expectStatus("patient cannot update workspace-owned patient profile", patient, "/api/v1/patients/pat_alpha", 403, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Cross Workspace Edit" }),
  });
  await expectStatus(
    "patient activates newly created dependent before deletion",
    patient,
    "/api/v1/me/active-profile",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "activate-created-dependent" },
      body: JSON.stringify({ patientId: patientCreatedProfile.patient.id }),
    },
  );
  const missingFamilyDeleteKey = await expectStatus(
    "canonical family delete requires an Idempotency-Key header",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    400,
    { method: "DELETE", headers: patientFamilyAuthorityHeaders },
  );
  assert.equal(missingFamilyDeleteKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const bodyOnlyFamilyDeleteKey = await expectStatus(
    "canonical family delete rejects a body-only idempotency key",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    400,
    {
      method: "DELETE",
      headers: patientFamilyJsonHeaders,
      body: JSON.stringify({ idempotencyKey: "family-delete-body-only" }),
    },
  );
  assert.equal(bodyOnlyFamilyDeleteKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const patientDeletedProfile = await expectStatus(
    "patient deletes dependent family profile",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    200,
    {
      method: "DELETE",
      headers: { ...patientFamilyAuthorityHeaders, "Idempotency-Key": "family-dependent-delete" },
    },
  );
  assertPatientMutationReceipt(patientDeletedProfile, {
    userId: "usr_patient",
    workspaceId: "org_personal_patient",
    patientId: patientCreatedProfile.patient.id,
    intent: "delete",
    replayed: false,
  });
  const patientDeletedProfileReplay = await expectStatus(
    "patient delete replays after the canonical patient is no longer readable",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    200,
    {
      method: "DELETE",
      headers: { ...patientFamilyAuthorityHeaders, "Idempotency-Key": "family-dependent-delete" },
    },
  );
  assertPatientMutationReceipt(patientDeletedProfileReplay, {
    userId: "usr_patient",
    workspaceId: "org_personal_patient",
    patientId: patientCreatedProfile.patient.id,
    intent: "delete",
    replayed: true,
  });
  const activeProfileAfterDelete = await expectStatus(
    "deleting an active dependent falls back to canonical self profile",
    patient,
    "/api/v1/me",
    200,
  );
  assert.equal(activeProfileAfterDelete.user.activePatientId, "pat_patient_self");
  await expectStatus(
    "patient deleted dependent profile is gone",
    patient,
    `/api/v1/patients/${patientCreatedProfile.patient.id}`,
    404,
  );
  const doctorCreatedReplayProbe = await expectStatus(
    "doctor creates a workspace-bound patient replay probe",
    doctor,
    "/api/v1/patients",
    201,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "doctor-patient-delete-replay-probe-create",
      },
      body: JSON.stringify({
        patientCode: "REPLAY-PROBE",
        name: "Delete Replay Probe",
        dateOfBirth: "1990-01-02",
      }),
    },
  );
  assertPatientMutationReceipt(doctorCreatedReplayProbe, {
    userId: "usr_doctor",
    workspaceId: "org_alpha",
    patientId: doctorCreatedReplayProbe.patient.id,
    intent: "create",
    replayed: false,
  });
  const doctorDeletedReplayProbe = await expectStatus(
    "doctor deletes the workspace-bound patient replay probe",
    doctor,
    `/api/v1/patients/${doctorCreatedReplayProbe.patient.id}`,
    200,
    {
      method: "DELETE",
      headers: { "Idempotency-Key": "doctor-patient-delete-replay-probe-delete" },
    },
  );
  assertPatientMutationReceipt(doctorDeletedReplayProbe, {
    userId: "usr_doctor",
    workspaceId: "org_alpha",
    patientId: doctorCreatedReplayProbe.patient.id,
    intent: "delete",
    replayed: false,
  });
  await expectStatus(
    "doctor switches to beta before replaying an alpha patient deletion",
    doctor,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "doctor-patient-delete-replay-probe-switch-beta",
      },
      body: JSON.stringify({ organizationId: "org_beta" }),
    },
  );
  const foreignWorkspaceDeleteReplay = await expectStatus(
    "patient delete replay fails closed after the actor changes workspace",
    doctor,
    `/api/v1/patients/${doctorCreatedReplayProbe.patient.id}`,
    409,
    {
      method: "DELETE",
      headers: { "Idempotency-Key": "doctor-patient-delete-replay-probe-delete" },
    },
  );
  assert.equal(
    foreignWorkspaceDeleteReplay.error.code,
    "IDEMPOTENT_PATIENT_DELETE_MISMATCH",
  );
  await expectStatus(
    "doctor restores alpha before replaying its canonical deletion",
    doctor,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "doctor-patient-delete-replay-probe-switch-alpha",
      },
      body: JSON.stringify({ organizationId: "org_alpha" }),
    },
  );
  const canonicalWorkspaceDeleteReplay = await expectStatus(
    "patient delete replay succeeds again in its canonical workspace",
    doctor,
    `/api/v1/patients/${doctorCreatedReplayProbe.patient.id}`,
    200,
    {
      method: "DELETE",
      headers: { "Idempotency-Key": "doctor-patient-delete-replay-probe-delete" },
    },
  );
  assertPatientMutationReceipt(canonicalWorkspaceDeleteReplay, {
    userId: "usr_doctor",
    workspaceId: "org_alpha",
    patientId: doctorCreatedReplayProbe.patient.id,
    intent: "delete",
    replayed: true,
  });
  const patientShareTargets = await expectStatus("patient resolves doctor share targets", patient, "/api/v1/share-targets", 200);
  assert.ok(patientShareTargets.workspaceId);
  assert.ok(Number.isFinite(Date.parse(patientShareTargets.generatedAt)));
  assert.ok(patientShareTargets.doctors.some((target) => target.id === "usr_doctor"));
  assert.equal(
    patientShareTargets.doctors.some((target) => target.id === "usr_pending_doctor"),
    false,
    "pending doctors must not appear as consent/share targets",
  );
  await expectStatus(
    "patient cannot share PHI with an unapproved doctor",
    patient,
    "/api/v1/patients/pat_patient_child/shares",
    404,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "patient-pending-doctor-share" },
      body: JSON.stringify({ doctorUserId: "usr_pending_doctor", scope: "patient_profile" }),
    },
  );
  const patientShare = await expectStatus("patient shares dependent profile", patient, "/api/v1/patients/pat_patient_child/shares", 201, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "patient-dependent-share" },
    body: JSON.stringify({ doctorUserId: "usr_doctor", scope: "patient_profile" }),
  });
  assert.equal(patientShare.share.patientId, "pat_patient_child");
  assert.equal(patientShare.patientId, "pat_patient_child");
  assert.ok(patientShare.workspaceId);
  assert.ok(Number.isFinite(Date.parse(patientShare.generatedAt)));
  assert.equal(patientShare.share.doctorUserId, "usr_doctor");
  assert.equal(patientShare.share.authorityType, "patient_consent");
  assert.equal(patientShare.share.status, "active");
  assert.equal(patientShare.share.consentedAt, patientShare.share.createdAt);
  assert.equal(patientShare.share.recipient.type, "doctor");
  assert.equal(patientShare.share.recipient.id, "usr_doctor");
  assert.equal(patientShare.share.grantedByActor.id, "usr_patient");
  assert.equal(patientShare.replayed, false);
  const patientShareReplay = await expectStatus("patient share double-submit replays one grant", patient, "/api/v1/patients/pat_patient_child/shares", 201, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "patient-dependent-share" },
    body: JSON.stringify({ doctorUserId: "usr_doctor", scope: "patient_profile" }),
  });
  assert.equal(patientShareReplay.replayed, true);
  assert.equal(patientShareReplay.share.id, patientShare.share.id);
  const patientShareFingerprintConflict = await expectStatus(
    "patient share rejects one Idempotency-Key reused for another payload",
    patient,
    "/api/v1/patients/pat_patient_child/shares",
    409,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "patient-dependent-share" },
      body: JSON.stringify({
        doctorUserId: "usr_doctor",
        scope: "patient_profile",
        expiresAt: "2099-01-01T00:00:00.000Z",
      }),
    },
  );
  assert.equal(patientShareFingerprintConflict.error.code, "IDEMPOTENCY_KEY_REUSED");
  const missingWorkspaceShare = await expectStatus(
    "patient share rejects an unknown workspace instead of widening the grant",
    patient,
    "/api/v1/patients/pat_patient_child/shares",
    404,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-missing-workspace-share",
      },
      body: JSON.stringify({ organizationId: "org_missing_share_target", scope: "patient_profile" }),
    },
  );
  assert.equal(missingWorkspaceShare.error.code, "SHARE_WORKSPACE_NOT_FOUND");
  const emptySelectedShare = await expectStatus(
    "selected-scan share requires at least one explicit scan",
    patient,
    "/api/v1/patients/pat_patient_child/shares",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-empty-selected-share",
      },
      body: JSON.stringify({ doctorUserId: "usr_doctor", scope: "selected_scans", scanIds: [] }),
    },
  );
  assert.equal(emptySelectedShare.error.code, "SHARE_SCAN_SCOPE_EMPTY");
  const patientShares = await expectStatus("patient lists active consent history", patient, "/api/v1/patients/pat_patient_child/shares", 200);
  assert.ok(
    patientShares.shares.some(
      (item) =>
        item.id === patientShare.share.id &&
        item.active === true &&
        item.status === "active" &&
        item.authorityType === "patient_consent",
    ),
  );
  await expectStatus(
    "patient revokes dependent profile consent",
    patient,
    `/api/v1/patients/pat_patient_child/shares/${patientShare.share.id}`,
    200,
    { method: "DELETE", headers: { "Idempotency-Key": "patient-dependent-share-revoke" } },
  );
  const patientShareRevokeReplay = await expectStatus(
    "patient share revoke retry does not append a second audit",
    patient,
    `/api/v1/patients/pat_patient_child/shares/${patientShare.share.id}`,
    200,
    { method: "DELETE", headers: { "Idempotency-Key": "patient-dependent-share-revoke" } },
  );
  assert.equal(patientShareRevokeReplay.replayed, true);
  const patientSharesAfterRevoke = await expectStatus(
    "patient consent history includes revoked grant",
    patient,
    "/api/v1/patients/pat_patient_child/shares",
    200,
  );
  assert.ok(
    patientSharesAfterRevoke.shares.some(
      (item) =>
        item.id === patientShare.share.id &&
        item.active === false &&
        item.status === "revoked" &&
        item.authorityType === "patient_consent",
    ),
  );
  const guardianShare = await expectStatus(
    "assigned guardian grants dependent consent",
    guardian,
    "/api/v1/patients/pat_guardian_dependent/shares",
    201,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "guardian-dependent-consent",
      },
      body: JSON.stringify({
        doctorUserId: "usr_doctor",
        scope: "patient_profile",
        purpose: "Theo dõi hồ sơ phụ thuộc",
      }),
    },
  );
  assert.equal(guardianShare.share.authorityType, "patient_consent");
  assert.equal(guardianShare.share.grantedByActor.id, "usr_guardian");
  assert.equal(guardianShare.share.patientId, "pat_guardian_dependent");
  const guardianRevoke = await expectStatus(
    "assigned guardian revokes dependent consent",
    guardian,
    `/api/v1/patients/pat_guardian_dependent/shares/${guardianShare.share.id}`,
    200,
    {
      method: "DELETE",
      headers: { "Idempotency-Key": "guardian-dependent-consent-revoke" },
    },
  );
  assert.equal(guardianRevoke.share.status, "revoked");
  assert.equal(guardianRevoke.share.revokedByActor.id, "usr_guardian");
  const twoFactorStatus = await expectStatus("patient reads fail-closed 2FA availability", patient, "/api/v1/me/2fa", 200);
  assert.equal(twoFactorStatus.availability.available, false);
  assert.equal(twoFactorStatus.availability.status, "unavailable");
  assert.deepEqual(twoFactorStatus.availability.methods, []);
  assert.equal(twoFactorStatus.twoFactor.enabled, false);
  assert.equal(twoFactorStatus.twoFactor.enrollmentPending, false);
  const legacyTwoFactor = await expectStatus("legacy fake 2FA enable is rejected", patient, "/api/v1/me/2fa", 410, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "enable", method: "app" }),
  });
  assert.equal(legacyTwoFactor.error.code, "TWO_FACTOR_LEGACY_ENDPOINT_REMOVED");
  const unavailableEnrollment = await expectStatus("2FA enrollment fails closed without encryption key", patient, "/api/v1/me/2fa/enroll", 503, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "workspace-smoke-2fa-unavailable-enroll",
    },
    body: JSON.stringify({ method: "app" }),
  });
  assert.equal(unavailableEnrollment.error.code, "TWO_FACTOR_UNAVAILABLE");
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
  const patientSecondRealtimeSocket = await openRealtimeSocket(patientSecondSession);
  const patientSecondRealtimeClosed = waitForRealtimeClose(patientSecondRealtimeSocket);
  const patientSessions = await expectStatus("patient lists own auth sessions", patient, "/api/v1/auth/sessions", 200);
  const currentPatientSession = patientSessions.sessions.find((item) => item.current === true);
  const secondaryPatientSession = patientSessions.sessions.find((item) => item.current !== true && !item.revokedAt);
  assert.ok(currentPatientSession);
  assert.ok(secondaryPatientSession);
  const currentSessionRevoke = await expectStatus(
    "patient cannot revoke the auth session backing the current request",
    patient,
    `/api/v1/auth/sessions/${encodeURIComponent(currentPatientSession.id)}/revoke`,
    409,
    {
      method: "POST",
      headers: { "Idempotency-Key": "patient-current-auth-session-revoke" },
    },
  );
  assert.equal(currentSessionRevoke.error.code, "AUTH_SESSION_CURRENT");
  await expectStatus(
    "current auth session remains active after direct revoke denial",
    patient,
    "/api/v1/me",
    200,
  );
  for (const [label, encodedSessionId] of [
    ["whitespace auth session id", encodeURIComponent(` ${secondaryPatientSession.id}`)],
    ["overlong auth session id", "x".repeat(161)],
    ["malformed encoded auth session id", "%E0%A4%A"],
  ]) {
    const invalidSessionId = await expectStatus(
      `auth session revocation rejects ${label}`,
      patient,
      `/api/v1/auth/sessions/${encodedSessionId}/revoke`,
      400,
      {
        method: "POST",
        headers: { "Idempotency-Key": `invalid-session-id-${label.replace(/\s+/g, "-")}` },
      },
    );
    assert.equal(invalidSessionId.error.code, "AUTH_SESSION_ID_INVALID");
  }
  const missingSessionRevokeKey = await expectStatus(
    "auth session revocation requires a stable caller idempotency key",
    patient,
    `/api/v1/auth/sessions/${encodeURIComponent(secondaryPatientSession.id)}/revoke`,
    400,
    { method: "POST" },
  );
  assert.equal(missingSessionRevokeKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const blankSessionRevokeKey = await expectStatus(
    "auth session revocation rejects a blank caller idempotency key",
    patient,
    `/api/v1/auth/sessions/${encodeURIComponent(secondaryPatientSession.id)}/revoke`,
    400,
    {
      method: "POST",
      headers: { "Idempotency-Key": "   " },
    },
  );
  assert.equal(blankSessionRevokeKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const overlongSessionRevokeKey = await expectStatus(
    "auth session revocation rejects rather than truncates an overlong idempotency key",
    patient,
    `/api/v1/auth/sessions/${encodeURIComponent(secondaryPatientSession.id)}/revoke`,
    400,
    {
      method: "POST",
      headers: { "Idempotency-Key": "x".repeat(161) },
    },
  );
  assert.equal(overlongSessionRevokeKey.error.code, "IDEMPOTENCY_KEY_TOO_LONG");
  const revokedPatientSession = await expectStatus(
    "patient revokes another auth session",
    patient,
    `/api/v1/auth/sessions/${encodeURIComponent(secondaryPatientSession.id)}/revoke`,
    200,
    {
      method: "POST",
      headers: { "Idempotency-Key": "patient-auth-session-revoke-001" },
    },
  );
  assert.deepEqual(Object.keys(revokedPatientSession), ["session", "revoked", "replayed"]);
  assert.equal(Boolean(revokedPatientSession.session.revokedAt), true);
  assert.equal(revokedPatientSession.revoked, true);
  assert.equal(revokedPatientSession.replayed, false);
  const realtimeCloseEvent = await patientSecondRealtimeClosed;
  assert.equal(realtimeCloseEvent.code, 1008, "revoking a backend session must close its realtime socket");
  const revokedPatientSessionReplay = await expectStatus(
    "session revoke replays the caller-owned receipt without another mutation",
    patient,
    `/api/v1/auth/sessions/${encodeURIComponent(secondaryPatientSession.id)}/revoke`,
    200,
    {
      method: "POST",
      headers: { "Idempotency-Key": "patient-auth-session-revoke-001" },
    },
  );
  assert.equal(revokedPatientSessionReplay.revoked, true);
  assert.equal(revokedPatientSessionReplay.replayed, true);
  assert.equal(revokedPatientSessionReplay.session.revokedAt, revokedPatientSession.session.revokedAt);
  const revokedPatientSessionFreshKey = await expectStatus(
    "a fresh key against an already-revoked session is not reported as a replay",
    patient,
    `/api/v1/auth/sessions/${encodeURIComponent(secondaryPatientSession.id)}/revoke`,
    200,
    {
      method: "POST",
      headers: { "Idempotency-Key": "patient-auth-session-revoke-002" },
    },
  );
  assert.equal(revokedPatientSessionFreshKey.revoked, true);
  assert.equal(revokedPatientSessionFreshKey.replayed, false);
  assert.equal(revokedPatientSessionFreshKey.session.revokedAt, revokedPatientSession.session.revokedAt);
  const patientThirdLogin = await expectLoginPassword(
    "patient opens a third backend auth session for key-reuse isolation",
    "patient@alpha.test",
    "12345678",
    200,
  );
  const patientThirdSession = {
    user: patientThirdLogin.user,
    headers: { Authorization: `Bearer ${patientThirdLogin.token}` },
  };
  const patientSessionsBeforeKeyReuse = await expectStatus(
    "patient refreshes own auth sessions before key-reuse test",
    patient,
    "/api/v1/auth/sessions",
    200,
  );
  const thirdPatientSession = patientSessionsBeforeKeyReuse.sessions.find(
    (item) => item.id !== currentPatientSession.id && item.id !== secondaryPatientSession.id,
  );
  assert.ok(thirdPatientSession);
  const keyReuse = await expectStatus(
    "one caller cannot reuse a session revoke key for another target",
    patient,
    `/api/v1/auth/sessions/${encodeURIComponent(thirdPatientSession.id)}/revoke`,
    409,
    {
      method: "POST",
      headers: { "Idempotency-Key": "patient-auth-session-revoke-001" },
    },
  );
  assert.equal(keyReuse.error.code, "IDEMPOTENCY_KEY_REUSED");
  await expectStatus(
    "key reuse does not revoke the different target session",
    patientThirdSession,
    "/api/v1/me",
    200,
  );
  const legacySessionRevokePath = `/api/auth/sessions/${encodeURIComponent(thirdPatientSession.id)}/revoke`;
  const legacySessionRevoke = await request(legacySessionRevokePath, {
    method: "POST",
    headers: patient.headers,
  });
  assert.equal(
    legacySessionRevoke.response.status,
    200,
    `legacy auth session revoke expected 200, got ${legacySessionRevoke.response.status}: ${JSON.stringify(legacySessionRevoke.body)}`,
  );
  assert.equal(legacySessionRevoke.body.revoked, true);
  assert.equal(legacySessionRevoke.body.replayed, false);
  assert.equal(legacySessionRevoke.response.headers.get("deprecation"), "true");
  assert.equal(
    legacySessionRevoke.response.headers.get("x-shcare-compatibility-alias"),
    "auth-session-revoke",
  );
  const legacySessionRevokeReplay = await request(legacySessionRevokePath, {
    method: "POST",
    headers: patient.headers,
  });
  assert.equal(
    legacySessionRevokeReplay.response.status,
    200,
    `legacy auth session revoke replay expected 200, got ${legacySessionRevokeReplay.response.status}: ${JSON.stringify(legacySessionRevokeReplay.body)}`,
  );
  assert.equal(legacySessionRevokeReplay.body.revoked, true);
  assert.equal(legacySessionRevokeReplay.body.replayed, true);
  assert.equal(
    legacySessionRevokeReplay.body.session.revokedAt,
    legacySessionRevoke.body.session.revokedAt,
  );
  assert.equal(legacySessionRevokeReplay.response.headers.get("deprecation"), "true");
  assert.equal(
    legacySessionRevokeReplay.response.headers.get("x-shcare-compatibility-alias"),
    "auth-session-revoke",
  );
  await expectStatus(
    "legacy-revoked patient session cannot access account",
    patientThirdSession,
    "/api/v1/me",
    401,
  );
  const legacyMetrics = await requestRaw("/metrics");
  assert.equal(legacyMetrics.response.status, 200);
  assert.match(legacyMetrics.text, /smart_health_legacy_auth_session_revoke_total 2(?:\r?\n|$)/);
  const sessionsAfterRevoke = await expectStatus("revoked sessions are excluded from active session list", patient, "/api/v1/auth/sessions", 200);
  assert.equal(sessionsAfterRevoke.sessions.some((item) => item.id === secondaryPatientSession.id), false);
  const crossUserSessionRevoke = await expectStatus(
    "another user cannot revoke a session outside their account",
    doctor,
    `/api/v1/auth/sessions/${encodeURIComponent(currentPatientSession.id)}/revoke`,
    404,
    {
      method: "POST",
      headers: { "Idempotency-Key": "patient-auth-session-revoke-001" },
    },
  );
  assert.equal(crossUserSessionRevoke.error.code, "AUTH_SESSION_NOT_FOUND");
  await expectStatus("revoked patient session cannot access account", patientSecondSession, "/api/v1/me", 401);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repairedReceipt = await expectStatus(
      "completed password receipt repairs missing ancillary evidence",
      passwordRepairUser,
      "/api/v1/me/password",
      200,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "password-ancillary-repair",
        },
        body: JSON.stringify(ancillaryRepairPasswordPayload),
      },
    );
    assert.deepEqual(repairedReceipt, {
      ok: true,
      user: { id: "usr_password_repair" },
      provider: "demo",
      operationId: ancillaryRepairOperationId,
      replayed: true,
    });
  }
  const repairedAncillaryDb = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  assert.equal(
    repairedAncillaryDb.auditLogs.filter(
      (entry) =>
        entry.id ===
        `audit_password_change_${ancillaryRepairOperationId}`,
    ).length,
    1,
  );
  assert.equal(
    repairedAncillaryDb.notifications.filter(
      (entry) =>
        entry.id ===
        `noti_password_change_${ancillaryRepairOperationId}`,
    ).length,
    1,
  );
  assert.equal(
    repairedAncillaryDb.accessLogs.filter(
      (entry) =>
        entry.id ===
        `log_password_change_${ancillaryRepairOperationId}`,
    ).length,
    1,
  );
  assert.equal(
    repairedAncillaryDb.settings.privacy.passwordUpdatedAt,
    repairedAncillaryDb.identityOperations.find(
      (entry) => entry.id === ancillaryRepairOperationId,
    ).completedAt,
  );
  const missingPasswordIdempotencyKey = await expectStatus(
    "password change requires an explicit idempotency key",
    patient,
    "/api/v1/me/password",
    400,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "12345678",
        newPassword: " PatientPass123 ",
      }),
    },
  );
  assert.equal(
    missingPasswordIdempotencyKey.code,
    "IDEMPOTENCY_KEY_REQUIRED",
  );
  const legacyPasswordBody = await expectStatus(
    "canonical password change rejects legacy or additional body fields",
    patient,
    "/api/v1/me/password",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-password-legacy-body",
      },
      body: JSON.stringify({
        currentPassword: "12345678",
        password: "PatientPass456",
      }),
    },
  );
  assert.deepEqual(Object.keys(legacyPasswordBody).sort(), [
    "code",
    "fieldErrors",
    "message",
    "requestId",
  ]);
  assert.equal(
    legacyPasswordBody.code,
    "PASSWORD_CHANGE_REQUEST_INVALID",
  );
  assert.deepEqual(legacyPasswordBody.fieldErrors, {
    request: "Only currentPassword and newPassword are accepted",
  });
  const normalizedCurrentPasswordAttempt = await expectStatus(
    "password change does not trim the current secret",
    patient,
    "/api/v1/me/password",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-password-exact-current",
      },
      body: JSON.stringify({
        currentPassword: " 12345678 ",
        newPassword: "PatientPass456",
      }),
    },
  );
  assert.equal(
    normalizedCurrentPasswordAttempt.code,
    "PASSWORD_CURRENT_INVALID",
  );
  const weakPasswordAttempt = await expectStatus(
    "password change rejects a weak new secret before mutation",
    patient,
    "/api/v1/me/password",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-password-weak",
      },
      body: JSON.stringify({
        currentPassword: "12345678",
        newPassword: "87654321",
      }),
    },
  );
  assert.equal(weakPasswordAttempt.code, "PASSWORD_TOO_WEAK");
  const passwordPayload = {
    currentPassword: "12345678",
    newPassword: " PatientPass123 ",
  };
  const changedPassword = await expectStatus("patient changes backend account password", patient, "/api/v1/me/password", 200, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "patient-password-change",
    },
    body: JSON.stringify(passwordPayload),
  });
  assert.deepEqual(Object.keys(changedPassword).sort(), [
    "ok",
    "operationId",
    "provider",
    "replayed",
    "user",
  ]);
  assert.equal(changedPassword.ok, true);
  assert.deepEqual(Object.keys(changedPassword.user), ["id"]);
  assert.equal(changedPassword.user.id, "usr_patient");
  assert.equal(changedPassword.provider, "demo");
  assert.ok(changedPassword.operationId);
  assert.equal(changedPassword.replayed, false);
  await expectLoginPassword("old patient password is rejected after password change", "patient@alpha.test", "12345678", 401);
  await expectLoginPassword(
    "trimmed password is rejected after exact password change",
    "patient@alpha.test",
    "PatientPass123",
    401,
  );
  const changedPasswordLogin = await expectLoginPassword(
    "patient can sign in with the exact changed backend password",
    "patient@alpha.test",
    " PatientPass123 ",
    200,
  );
  const changedPasswordSession = {
    user: changedPasswordLogin.user,
    headers: { Authorization: `Bearer ${changedPasswordLogin.token}` },
  };
  const replayedPasswordChange = await expectStatus(
    "password change replays the exact account-bound receipt",
    changedPasswordSession,
    "/api/v1/me/password",
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-password-change",
      },
      body: JSON.stringify(passwordPayload),
    },
  );
  assert.equal(replayedPasswordChange.ok, true);
  assert.deepEqual(Object.keys(replayedPasswordChange.user), ["id"]);
  assert.equal(replayedPasswordChange.user.id, "usr_patient");
  assert.equal(replayedPasswordChange.provider, "demo");
  assert.equal(replayedPasswordChange.operationId, changedPassword.operationId);
  assert.equal(replayedPasswordChange.replayed, true);
  const conflictingPasswordReplay = await expectStatus(
    "password change rejects reuse of a key with a different payload",
    changedPasswordSession,
    "/api/v1/me/password",
    409,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "patient-password-change",
      },
      body: JSON.stringify({
        ...passwordPayload,
        newPassword: "DifferentPass456",
      }),
    },
  );
  assert.equal(conflictingPasswordReplay.code, "IDEMPOTENCY_KEY_REUSED");
  const passwordEvidenceDb = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  const persistedPasswordOperation = passwordEvidenceDb.identityOperations.find(
    (entry) => entry.id === changedPassword.operationId,
  );
  assert.ok(persistedPasswordOperation);
  assert.equal(
    JSON.stringify(persistedPasswordOperation).includes(
      passwordPayload.currentPassword,
    ),
    false,
  );
  assert.equal(
    JSON.stringify(persistedPasswordOperation).includes(
      passwordPayload.newPassword,
    ),
    false,
  );
  const persistedPasswordUser = passwordEvidenceDb.users.find(
    (entry) => entry.id === "usr_patient",
  );
  assert.ok(persistedPasswordUser);
  assert.equal(isPasswordHash(persistedPasswordUser.password), true);
  assert.equal(
    verifyPasswordSecret(
      passwordPayload.newPassword,
      persistedPasswordUser.password,
    ),
    true,
  );
  assert.equal(
    JSON.stringify(persistedPasswordUser).includes(
      passwordPayload.newPassword,
    ),
    false,
  );
  assert.equal(
    passwordEvidenceDb.auditLogs.filter(
      (entry) =>
        entry.action === "account.password.change" &&
        entry.metadata?.operationId === changedPassword.operationId,
    ).length,
    1,
    "password replay must not duplicate the account audit",
  );
  assert.equal(
    passwordEvidenceDb.auditLogs.some(
      (entry) =>
        entry.id ===
        `audit_password_change_${changedPassword.operationId}`,
    ),
    true,
  );
  assert.equal(
    passwordEvidenceDb.notifications.filter(
      (entry) =>
        entry.userId === "usr_patient" &&
        entry.metadata?.operationId === changedPassword.operationId,
    ).length,
    1,
    "password replay must not duplicate the account notification",
  );
  assert.equal(
    passwordEvidenceDb.notifications.some(
      (entry) =>
        entry.id ===
        `noti_password_change_${changedPassword.operationId}`,
    ),
    true,
  );
  assert.equal(
    passwordEvidenceDb.accessLogs.filter(
      (entry) =>
        entry.id ===
        `log_password_change_${changedPassword.operationId}`,
    ).length,
    1,
    "password replay must repair without duplicating the access ledger",
  );
  assert.equal(
    passwordEvidenceDb.settings.privacy.passwordUpdatedAt,
    persistedPasswordOperation.completedAt,
  );

  const portalScans = await expectStatus("portal lists only scoped scans", workspaceAdmin, "/api/portal/scans", 200, {
    headers: portalHeaders,
  });
  assert.deepEqual(portalScans.scans.map((scan) => scan.id), ["scan_alpha", "scan_alpha_extra"]);
  const firstScanPage = await request(
    "/api/portal/scans?page=1&limit=1&sort=createdAt:desc",
    { headers: { ...portalHeaders, ...workspaceAdmin.headers } },
  );
  assert.equal(firstScanPage.response.status, 200, JSON.stringify(firstScanPage.body));
  assert.equal(firstScanPage.response.headers.get("x-total-count"), "2");
  assert.equal(firstScanPage.response.headers.get("x-page"), "1");
  assert.equal(firstScanPage.response.headers.get("x-page-limit"), "1");
  assert.deepEqual(firstScanPage.body.pagination, {
    page: 1,
    limit: 1,
    total: 2,
    pageCount: 2,
    hasNextPage: true,
    sort: "createdAt:desc",
  });
  assert.equal(firstScanPage.body.scans.length, 1);
  const secondScanPage = await request(
    "/api/portal/scans?page=2&limit=1&sort=createdAt:desc",
    { headers: { ...portalHeaders, ...workspaceAdmin.headers } },
  );
  assert.equal(secondScanPage.response.status, 200, JSON.stringify(secondScanPage.body));
  assert.equal(secondScanPage.response.headers.get("x-total-count"), "2");
  assert.equal(secondScanPage.body.pagination.page, 2);
  assert.equal(secondScanPage.body.pagination.hasNextPage, false);
  assert.deepEqual(
    new Set([...firstScanPage.body.scans, ...secondScanPage.body.scans].map((scan) => scan.id)),
    new Set(["scan_alpha", "scan_alpha_extra"]),
  );
  const searchedScanPage = await request(
    "/api/portal/scans?q=extra&page=1&limit=25&sort=status:asc",
    { headers: { ...portalHeaders, ...workspaceAdmin.headers } },
  );
  assert.equal(searchedScanPage.response.status, 200, JSON.stringify(searchedScanPage.body));
  assert.deepEqual(searchedScanPage.body.scans.map((scan) => scan.id), ["scan_alpha_extra"]);
  assert.equal(searchedScanPage.body.pagination.total, 1);
  await expectStatus(
    "portal rejects a cross-workspace scan list scope",
    workspaceAdmin,
    "/api/portal/scans?organizationId=org_beta",
    403,
    { headers: portalHeaders },
  );
  const invalidScanSort = await expectStatus(
    "portal rejects an unsupported scan sort",
    workspaceAdmin,
    "/api/portal/scans?sort=doctorNotes:desc",
    400,
    { headers: portalHeaders },
  );
  assert.equal(invalidScanSort.error.code, "SCAN_SORT_INVALID");
  const selectedGrantScans = await expectStatus("selected-scan grant only lists granted scans", betaDoctor, "/api/v1/scans", 200);
  assert.deepEqual(selectedGrantScans.scans.map((scan) => scan.id), ["scan_alpha", "scan_beta"]);
  assert.equal(selectedGrantScans.scans.some((scan) => scan.id === "scan_alpha_extra"), false);
  await expectStatus(
    "selected-scan grant cannot read the full patient profile",
    betaDoctor,
    "/api/v1/patients/pat_alpha",
    403,
  );
  await expectStatus(
    "selected-scan grant cannot delegate or re-share the patient",
    betaDoctor,
    "/api/v1/patients/pat_alpha/shares",
    403,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorUserId: "usr_beta_doctor", scope: "patient_profile" }),
    },
  );
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
  const pcmChunkSha256 = crypto.createHash("sha256").update(pcmChunk).digest("hex");
  const uploadedScanChunk = await expectStatus(
    "workspace admin uploads controlled scan PCM chunk",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}/audio-chunks`,
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Idempotency-Key": "workspace-controlled-chunk-0",
        "X-Chunk-Sequence": "0",
        "X-Chunk-SHA256": pcmChunkSha256,
      },
      body: pcmChunk,
    },
  );
  assert.equal(uploadedScanChunk.uploadedBytes, pcmChunk.length);
  const completedScan = await expectStatus(
    "workspace admin completes controlled scan and inline AI",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}/complete`,
    200,
    {
      method: "POST",
      headers: { "Idempotency-Key": "workspace-controlled-complete" },
    },
  );
  assert.equal(completedScan.scan.status, "completed");
  assert.ok(completedScan.scan.audioUrl);
  assert.ok(completedScan.scan.aiLabel);
  await expectStatus(
    "workspace admin reprocess requires an idempotency key",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}/reprocess`,
    400,
    { method: "POST" },
  );
  const reprocessedScan = await expectStatus(
    "workspace admin reprocesses controlled scan AI",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}/reprocess`,
    200,
    { method: "POST", headers: { "Idempotency-Key": "workspace-controlled-reprocess" } },
  );
  assert.equal(reprocessedScan.scan.status, "completed");
  assert.ok(reprocessedScan.scan.aiResultId);
  const replayedReprocess = await expectStatus(
    "workspace admin exact reprocess retry replays the committed generation",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}/reprocess`,
    200,
    { method: "POST", headers: { "Idempotency-Key": "workspace-controlled-reprocess" } },
  );
  assert.equal(replayedReprocess.idempotent, true);
  assert.equal(replayedReprocess.scan.aiResultId, reprocessedScan.scan.aiResultId);
  assert.equal(replayedReprocess.scan.processingGeneration, reprocessedScan.scan.processingGeneration);
  const controlledWaveform = await expectStatus(
    "workspace admin reads the real tenant-scoped waveform artifact",
    workspaceAdmin,
    `/api/v1/scans/${controlledScan.scan.id}/waveform`,
    200,
  );
  assert.equal(controlledWaveform.waveform.scanId, controlledScan.scan.id);
  assert.equal(controlledWaveform.waveform.sampleRate, 16000);
  assert.ok(controlledWaveform.waveform.points.length > 0);
  await expectStatus(
    "cross-workspace doctor cannot read the waveform artifact",
    betaDoctor,
    `/api/v1/scans/${controlledScan.scan.id}/waveform`,
    403,
  );
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
  const spoofedScanAnalysis = await expectStatus(
    "portal cannot write backend-owned analysis fields",
    workspaceAdmin,
    "/api/portal/scans/scan_alpha",
    403,
    {
      method: "PATCH",
      headers: portalJsonHeaders,
      body: JSON.stringify({ aiLabel: "diagnosed", aiConfidence: 1, aiSummary: "client supplied" }),
    },
  );
  assert.equal(spoofedScanAnalysis.error.code, "SCAN_ANALYSIS_FIELDS_READ_ONLY");
  const scanAfterSpoofAttempt = await expectStatus(
    "rejected analysis spoof leaves the scan unchanged",
    workspaceAdmin,
    "/api/portal/scans/scan_alpha",
    200,
    { headers: portalHeaders },
  );
  assert.notEqual(scanAfterSpoofAttempt.scan.aiLabel, "diagnosed");

  const portalDevices = await expectStatus("portal lists only scoped devices", workspaceAdmin, "/api/v1/portal/devices", 200, {
    headers: portalHeaders,
  });
  assert.equal(portalDevices.workspaceId, "org_alpha");
  assert.ok(Number.isFinite(Date.parse(portalDevices.generatedAt)));
  assert.deepEqual(
    portalDevices.devices.map((device) => device.id),
    ["dev_alpha", "dev_claim_alpha"],
  );
  assert.equal(
    /"deviceSecret"|"secretHash"|"claimCode"|"claimCodeHash"|"tokenHash"|"signature"/.test(
      JSON.stringify(portalDevices),
    ),
    false,
  );
  assert.equal(
    portalDevices.devices.some(
      (device) => device.connected === true && device.online === true,
    ),
    false,
    "legacy connected must not promote a device to canonical online",
  );
  const legacyPortalDevices = await expectStatus(
    "legacy portal device list alias remains additive",
    workspaceAdmin,
    "/api/portal/devices",
    200,
    { headers: portalHeaders },
  );
  assert.equal(legacyPortalDevices.workspaceId, "org_alpha");
  assert.deepEqual(
    legacyPortalDevices.devices.map((device) => device.id),
    portalDevices.devices.map((device) => device.id),
  );
  const missingAssignmentKey = await expectStatus(
    "portal device assignment requires an idempotency key",
    workspaceAdmin,
    "/api/v1/portal/devices/dev_alpha",
    400,
    {
      method: "PATCH",
      headers: portalJsonHeaders,
      body: JSON.stringify({ assignedPatientId: "pat_alpha" }),
    },
  );
  assert.equal(missingAssignmentKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const legacyAliasUpdate = await expectStatus(
    "legacy portal device alias remains additive during the compatibility window",
    workspaceAdmin,
    "/api/portal/devices/dev_claim_alpha",
    200,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "legacy-alias-device-update",
      },
      body: JSON.stringify({ name: "Legacy Alias Device" }),
    },
  );
  assert.equal(legacyAliasUpdate.device.name, "Legacy Alias Device");
  assert.equal(legacyAliasUpdate.replayed, false);
  await expectStatus("viewer cannot update portal device", viewer, "/api/portal/devices/dev_alpha", 403, {
    method: "PATCH",
    headers: portalJsonHeaders,
    body: JSON.stringify({ name: "Viewer Edit" }),
  });
  const invalidProvisionedAssignment = await expectStatus(
    "portal cannot assign a provisioned device before claim",
    workspaceAdmin,
    "/api/v1/portal/devices/dev_claim_alpha",
    409,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-device-invalid-provisioned",
      },
      body: JSON.stringify({ assignedPatientId: "pat_alpha" }),
    },
  );
  assert.equal(invalidProvisionedAssignment.error.code, "DEVICE_OWNERSHIP_TRANSITION_INVALID");
  const assignmentHeaders = {
    ...portalJsonHeaders,
    "Idempotency-Key": "workspace-device-assign-alpha",
  };
  const assignmentBody = JSON.stringify({
    assignedPatientId: "pat_alpha",
    name: "Alpha Device Updated",
  });
  const updatedDevice = await expectStatus("portal assigns device to scoped patient", workspaceAdmin, "/api/v1/portal/devices/dev_alpha", 200, {
    method: "PATCH",
    headers: assignmentHeaders,
    body: assignmentBody,
  });
  assert.equal(updatedDevice.device.assignedPatientId, "pat_alpha");
  assert.equal(updatedDevice.replayed, false);
  const replayedAssignment = await expectStatus(
    "portal replays an exact device assignment",
    workspaceAdmin,
    "/api/v1/portal/devices/dev_alpha",
    200,
    {
      method: "PATCH",
      headers: assignmentHeaders,
      body: assignmentBody,
    },
  );
  assert.equal(replayedAssignment.replayed, true);
  assert.equal(replayedAssignment.device.id, updatedDevice.device.id);
  assert.equal(
    replayedAssignment.device.assignedPatientId,
    updatedDevice.device.assignedPatientId,
  );
  const deviceCommand = await expectStatus("portal cannot issue platform fleet commands", workspaceAdmin, "/api/portal/devices/dev_alpha/commands", 403, {
    method: "POST",
    headers: {
      ...portalJsonHeaders,
      "Idempotency-Key": "workspace-smoke-device-command-offline",
    },
    body: JSON.stringify({ type: "wifi.status", payload: {} }),
  });
  assert.equal(deviceCommand.error.code, "DEVICE_COMMAND_PLATFORM_ADMIN_REQUIRED");

  const portalStaff = await expectStatus("portal lists only workspace staff", workspaceAdmin, "/api/portal/staff", 200, {
    headers: portalHeaders,
  });
  assert.equal(portalStaff.workspaceId, "org_alpha");
  assert.ok(Number.isFinite(Date.parse(portalStaff.generatedAt)));
  assert.ok(
    portalStaff.staff.every(
      (member) =>
        member.workspaceMembership?.organizationId === "org_alpha" &&
        member.workspaceMembership?.workspaceId === "org_alpha" &&
        member.workspaceMembership?.userId === member.id,
    ),
  );
  assert.ok(
    portalStaff.staff.every(
      (member) =>
        JSON.stringify(Object.keys(member).sort()) ===
        JSON.stringify(
          [
            "accountStatus",
            "avatarUrl",
            "department",
            "email",
            "hospital",
            "id",
            "license",
            "name",
            "phone",
            "role",
            "roleRequestStatus",
            "specialty",
            "title",
            "verifiedEmail",
            "workspaceMembership",
          ].sort(),
        ),
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(portalStaff),
    /(?:password|firebaseClaims|twoFactor|session|token|secret)/i,
  );
  assert.ok(portalStaff.doctors.some((member) => member.id === "usr_doctor"));
  assert.equal(portalStaff.doctors.some((member) => member.id === "usr_beta_doctor"), false);
  const newStaff = await expectStatus("portal blocks doctor creation until invitation identity flow exists", workspaceAdmin, "/api/portal/staff", 501, {
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
  assert.equal(newStaff.error.code, "DOCTOR_INVITATION_REQUIRED");
  const portalStaffAfterDeniedCreate = await expectStatus(
    "failed direct doctor creation leaves workspace staff unchanged",
    workspaceAdmin,
    "/api/portal/staff",
    200,
    { headers: portalHeaders },
  );
  assert.equal(portalStaffAfterDeniedCreate.doctors.some((member) => member.email === "new-doctor@alpha.test"), false);

  await expectStatus(
    "viewer cannot read the staff invitation ledger",
    viewer,
    "/api/v1/admin/staff-invitations",
    403,
  );
  const crossWorkspaceInvitation = await expectStatus(
    "workspace manager cannot invite staff into another tenant",
    workspaceAdmin,
    "/api/v1/admin/staff-invitations",
    403,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-cross-workspace-denied",
      },
      body: JSON.stringify({
        organizationId: "org_beta",
        email: "cross-tenant-invite@beta.test",
        role: "doctor",
      }),
    },
  );
  assert.equal(
    crossWorkspaceInvitation.error.code,
    "STAFF_INVITATION_WORKSPACE_SCOPE_MISMATCH",
  );
  const invitationWithoutIdempotency = await expectStatus(
    "staff invitation creation requires Idempotency-Key",
    workspaceAdmin,
    "/api/v1/admin/staff-invitations",
    400,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org_alpha",
        email: "invited-staff@alpha.test",
        role: "doctor",
      }),
    },
  );
  assert.equal(invitationWithoutIdempotency.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const invitationPayload = {
    organizationId: "org_alpha",
    email: "invited-staff@alpha.test",
    role: "doctor",
    name: "Invited Alpha Doctor",
    specialty: "Cardiology",
    license: "INVITE-LIC-001",
  };
  const createdInvitation = await expectStatus(
    "workspace manager creates a tenant-scoped staff invitation",
    workspaceAdmin,
    "/api/v1/admin/staff-invitations",
    201,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-alpha-create",
        Origin: "http://localhost:5174",
      },
      body: JSON.stringify(invitationPayload),
    },
  );
  assert.equal(createdInvitation.invitation.organizationId, "org_alpha");
  assert.equal(createdInvitation.invitation.delivery.email, "unavailable");
  assert.equal(Object.hasOwn(createdInvitation.invitation, "tokenHash"), false);
  assert.ok(createdInvitation.oneTimeAcceptanceToken.length >= 32);
  const acceptanceUrl = new URL(createdInvitation.oneTimeAcceptanceUrl);
  assert.equal(acceptanceUrl.origin, "https://shcare.web.app");
  assert.equal(acceptanceUrl.pathname, "/staff-invitations/accept");
  assert.equal(acceptanceUrl.searchParams.get("token"), createdInvitation.oneTimeAcceptanceToken);
  const replayedInvitation = await expectStatus(
    "exact staff invitation replay omits one-time acceptance material",
    workspaceAdmin,
    "/api/v1/admin/staff-invitations",
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-alpha-create",
      },
      body: JSON.stringify(invitationPayload),
    },
  );
  assert.equal(replayedInvitation.invitation.id, createdInvitation.invitation.id);
  assert.equal(replayedInvitation.idempotent, true);
  assert.equal(Object.hasOwn(replayedInvitation, "oneTimeAcceptanceToken"), false);
  assert.equal(Object.hasOwn(replayedInvitation, "oneTimeAcceptanceUrl"), false);
  const reusedInvitationKey = await expectStatus(
    "staff invitation idempotency key rejects a different payload",
    workspaceAdmin,
    "/api/v1/admin/staff-invitations",
    409,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-alpha-create",
      },
      body: JSON.stringify({ ...invitationPayload, role: "nurse" }),
    },
  );
  assert.equal(reusedInvitationKey.error.code, "IDEMPOTENCY_KEY_REUSED");
  const invitationLedger = await expectStatus(
    "workspace manager lists only current-workspace invitations",
    workspaceAdmin,
    "/api/v1/admin/staff-invitations",
    200,
  );
  assert.deepEqual(
    invitationLedger.invitations.map((invitation) => invitation.organizationId),
    ["org_alpha"],
  );
  await expectStatus(
    "workspace manager cannot query another tenant invitation ledger",
    workspaceAdmin,
    "/api/v1/admin/staff-invitations?organizationId=org_beta",
    403,
  );
  const mismatchedAcceptance = await expectStatus(
    "authenticated email must match the staff invitation",
    patient,
    "/api/v1/staff-invitations/accept",
    403,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-wrong-email-accept",
      },
      body: JSON.stringify({ token: createdInvitation.oneTimeAcceptanceToken }),
    },
  );
  assert.equal(mismatchedAcceptance.error.code, "STAFF_INVITATION_EMAIL_MISMATCH");
  const acceptedInvitation = await expectStatus(
    "matching authenticated account accepts the staff invitation",
    invitedStaff,
    "/api/v1/staff-invitations/accept",
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-alpha-accept",
      },
      body: JSON.stringify({ token: createdInvitation.oneTimeAcceptanceToken }),
    },
  );
  assert.equal(acceptedInvitation.invitation.status, "accepted");
  assert.equal(acceptedInvitation.membership.organizationId, "org_alpha");
  assert.equal(acceptedInvitation.membership.role, "doctor");
  assert.equal(acceptedInvitation.user.id, "usr_invited_staff");
  assert.equal(acceptedInvitation.user.role, "doctor");
  assert.equal(Object.hasOwn(acceptedInvitation, "oneTimeAcceptanceToken"), false);
  const replayedAcceptance = await expectStatus(
    "staff invitation acceptance is idempotent",
    invitedStaff,
    "/api/v1/staff-invitations/accept",
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-alpha-accept",
      },
      body: JSON.stringify({ token: createdInvitation.oneTimeAcceptanceToken }),
    },
  );
  assert.equal(replayedAcceptance.idempotent, true);
  assert.equal(replayedAcceptance.membership.role, "doctor");

  const revokePayload = {
    organizationId: "org_alpha",
    email: "revoked-invite@alpha.test",
    role: "nurse",
    name: "Revoked Invite",
  };
  const pendingRevokeInvitation = await expectStatus(
    "workspace manager creates a second invitation for resend and revoke",
    workspaceAdmin,
    "/api/v1/admin/staff-invitations",
    201,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-revoke-create",
      },
      body: JSON.stringify(revokePayload),
    },
  );
  const resentInvitation = await expectStatus(
    "workspace manager rotates and resends a pending invitation",
    workspaceAdmin,
    `/api/v1/admin/staff-invitations/${pendingRevokeInvitation.invitation.id}/resend`,
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-revoke-resend",
      },
      body: JSON.stringify({}),
    },
  );
  assert.notEqual(
    resentInvitation.oneTimeAcceptanceToken,
    pendingRevokeInvitation.oneTimeAcceptanceToken,
  );
  const replayedResend = await expectStatus(
    "exact resend replay omits the rotated acceptance material",
    workspaceAdmin,
    `/api/v1/admin/staff-invitations/${pendingRevokeInvitation.invitation.id}/resend`,
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-revoke-resend",
      },
      body: JSON.stringify({}),
    },
  );
  assert.equal(replayedResend.idempotent, true);
  assert.equal(Object.hasOwn(replayedResend, "oneTimeAcceptanceToken"), false);
  const revokedInvitation = await expectStatus(
    "workspace manager revokes a pending invitation",
    workspaceAdmin,
    `/api/v1/admin/staff-invitations/${pendingRevokeInvitation.invitation.id}/revoke`,
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "staff-invitation-revoke",
      },
      body: JSON.stringify({ reason: "Role no longer required" }),
    },
  );
  assert.equal(revokedInvitation.invitation.status, "revoked");
  assert.equal(revokedInvitation.invitation.revokeReason, "Role no longer required");

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
  const workspaceSettingsPayload = {
    name: portalSettings.workspace.name,
    address: portalSettings.workspace.address,
    phone: "0289999999",
    email: "ops@alpha.test",
    website: portalSettings.workspace.website || "",
    expectedVersion: portalSettings.workspace.version,
  };
  const workspaceSettingsKey = "workspace-settings-alpha-v1";
  const missingWorkspaceSettingsKey = await expectStatus(
    "canonical workspace settings requires an Idempotency-Key",
    workspaceAdmin,
    "/api/v1/portal/settings/workspace",
    400,
    {
      method: "PATCH",
      headers: portalJsonHeaders,
      body: JSON.stringify(workspaceSettingsPayload),
    },
  );
  assert.equal(missingWorkspaceSettingsKey.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  const forgedWorkspaceSettingsTarget = await expectStatus(
    "workspace settings rejects a client-supplied cross-workspace target",
    workspaceAdmin,
    "/api/v1/portal/settings/workspace",
    400,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-settings-forged-target",
      },
      body: JSON.stringify({ ...workspaceSettingsPayload, workspaceId: "org_beta" }),
    },
  );
  assert.equal(
    forgedWorkspaceSettingsTarget.error.code,
    "WORKSPACE_SETTINGS_FIELDS_UNSUPPORTED",
  );
  await expectStatus(
    "viewer cannot mutate workspace settings",
    viewer,
    "/api/v1/portal/settings/workspace",
    403,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-settings-viewer-denied",
      },
      body: JSON.stringify(workspaceSettingsPayload),
    },
  );
  const updatedWorkspace = await expectStatus("portal updates workspace profile", workspaceAdmin, "/api/v1/portal/settings/workspace", 200, {
    method: "PATCH",
    headers: { ...portalJsonHeaders, "Idempotency-Key": workspaceSettingsKey },
    body: JSON.stringify(workspaceSettingsPayload),
  });
  assert.deepEqual(Object.keys(updatedWorkspace).sort(), [
    "operationId",
    "ownership",
    "replayed",
    "workspace",
  ]);
  assert.deepEqual(updatedWorkspace.ownership, {
    userId: "usr_workspace_admin",
    workspaceId: "org_alpha",
  });
  assert.equal(updatedWorkspace.workspace.phone, "0289999999");
  assert.equal(updatedWorkspace.workspace.email, "ops@alpha.test");
  assert.equal(updatedWorkspace.workspace.version, portalSettings.workspace.version + 1);
  assert.equal(updatedWorkspace.replayed, false);
  const replayedWorkspace = await expectStatus(
    "workspace settings replays an ambiguous retry",
    workspaceAdmin,
    "/api/v1/portal/settings/workspace",
    200,
    {
      method: "PATCH",
      headers: { ...portalJsonHeaders, "Idempotency-Key": workspaceSettingsKey },
      body: JSON.stringify(workspaceSettingsPayload),
    },
  );
  assert.equal(replayedWorkspace.replayed, true);
  assert.equal(replayedWorkspace.operationId, updatedWorkspace.operationId);
  assert.equal(replayedWorkspace.workspace.version, updatedWorkspace.workspace.version);
  const workspaceSettingsCollision = await expectStatus(
    "workspace settings rejects a reused key with another payload",
    workspaceAdmin,
    "/api/v1/portal/settings/workspace",
    409,
    {
      method: "PATCH",
      headers: { ...portalJsonHeaders, "Idempotency-Key": workspaceSettingsKey },
      body: JSON.stringify({
        ...workspaceSettingsPayload,
        email: "collision@alpha.test",
      }),
    },
  );
  assert.equal(workspaceSettingsCollision.error.code, "IDEMPOTENCY_KEY_REUSED");
  const legacyWorkspaceReplay = await request(
    "/api/portal/settings/workspace",
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        ...workspaceAdmin.headers,
        "Idempotency-Key": workspaceSettingsKey,
      },
      body: JSON.stringify(workspaceSettingsPayload),
    },
  );
  assert.equal(legacyWorkspaceReplay.response.status, 200);
  assert.equal(legacyWorkspaceReplay.response.headers.get("deprecation"), "true");
  assert.equal(
    legacyWorkspaceReplay.response.headers.get("x-shcare-compatibility-alias"),
    "workspace-settings-update",
  );
  assert.equal(legacyWorkspaceReplay.body.replayed, true);
  const updatedAiPreferences = await expectStatus(
    "portal updates the account AI notification preference through its dedicated contract",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "notification-preference-ai-updates-enable",
      },
      body: JSON.stringify({ key: "aiUpdates", enabled: true }),
    },
  );
  assert.equal(updatedAiPreferences.preferences.aiUpdates, true);
  const updatedAccountPreferences = await expectStatus(
    "portal updates the account message preference through its dedicated contract",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "notification-preference-messages-disable-baseline",
      },
      body: JSON.stringify({ key: "messages", enabled: false }),
    },
  );
  assert.equal(updatedAccountPreferences.preferences.aiUpdates, true);
  assert.equal(updatedAccountPreferences.preferences.messages, false);
  assert.equal(updatedAccountPreferences.preferences.appointments, true);
  const notificationPreferencesBefore = await expectStatus(
    "account reads canonical notification preferences and provider-safe availability",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
  );
  assert.equal(notificationPreferencesBefore.userId, "usr_workspace_admin");
  assert.equal(notificationPreferencesBefore.workspaceId, "org_alpha");
  assert.deepEqual(notificationPreferencesBefore.ownership, {
    kind: "self",
    userId: "usr_workspace_admin",
  });
  assert.deepEqual(Object.keys(notificationPreferencesBefore.preferences).sort(), [
    "abnormalResults",
    "aiUpdates",
    "appointments",
    "deviceOffline",
    "doctorRequests",
    "enabled",
    "messages",
    "newLogin",
  ]);
  assert.equal(notificationPreferencesBefore.preferences.aiUpdates, true);
  assert.equal(notificationPreferencesBefore.preferences.messages, false);
  assert.deepEqual(Object.keys(notificationPreferencesBefore.channels).sort(), [
    "email",
    "inApp",
    "push",
  ]);
  assert.equal(notificationPreferencesBefore.channels.inApp.available, true);
  assert.equal(notificationPreferencesBefore.replayed, false);
  const serializedNotificationPreferences = JSON.stringify(notificationPreferencesBefore);
  for (const forbidden of [
    "provider",
    "authSessionId",
    "fcmToken",
    "credential",
    "privateKey",
    "sound",
    "vibration",
  ]) {
    assert.equal(
      serializedNotificationPreferences.includes(forbidden),
      false,
      `notification preference response must not expose ${forbidden}`,
    );
  }
  await expectStatus(
    "field-level notification preference patch requires Idempotency-Key",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    400,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "messages", enabled: true }),
    },
  );
  for (const [label, body] of [
    ["client-only sound preference is rejected by the cloud endpoint", { key: "sound", enabled: false }],
    ["client-only vibration preference is rejected by the cloud endpoint", { key: "vibration", enabled: false }],
    ["notification preference patch rejects workspace targeting", { key: "messages", enabled: true, workspaceId: "org_beta" }],
    ["notification preference patch rejects merged maps", { preferences: { messages: true } }],
    ["notification preference patch requires a boolean", { key: "messages", enabled: "true" }],
  ]) {
    await expectStatus(
      label,
      workspaceAdmin,
      "/api/v1/me/notification-preferences",
      400,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `notification-preference-invalid-${label.length}`,
        },
        body: JSON.stringify(body),
      },
    );
  }
  const notificationPreferencePatchOptions = {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "notification-preference-messages-enable",
    },
    body: JSON.stringify({ key: "messages", enabled: true }),
  };
  const notificationPreferencesPatched = await expectStatus(
    "account updates exactly one notification preference",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
    notificationPreferencePatchOptions,
  );
  assert.equal(notificationPreferencesPatched.preferences.messages, true);
  for (const [key, value] of Object.entries(notificationPreferencesBefore.preferences)) {
    if (key !== "messages") {
      assert.equal(
        notificationPreferencesPatched.preferences[key],
        value,
        `field-level patch must preserve ${key}`,
      );
    }
  }
  const notificationPreferencesReplay = await expectStatus(
    "exact notification preference replay returns a replay marker",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
    notificationPreferencePatchOptions,
  );
  assert.equal(notificationPreferencesReplay.replayed, true);
  const notificationPreferencesChangedAfterReceipt = await expectStatus(
    "a later notification preference mutation can change the same field",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-preference-messages-disable-after-receipt",
      },
      body: JSON.stringify({ key: "messages", enabled: false }),
    },
  );
  assert.equal(notificationPreferencesChangedAfterReceipt.preferences.messages, false);
  const delayedNotificationPreferenceReplay = await expectStatus(
    "delayed idempotent replay returns the original confirmed receipt",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
    notificationPreferencePatchOptions,
  );
  assert.equal(delayedNotificationPreferenceReplay.replayed, true);
  assert.equal(
    delayedNotificationPreferenceReplay.preferences.messages,
    true,
    "a replay receipt must not be rewritten from newer account state",
  );
  const notificationPreferencesCurrentAfterReplay = await expectStatus(
    "delayed replay does not roll current notification preferences backward",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
  );
  assert.equal(notificationPreferencesCurrentAfterReplay.preferences.messages, false);
  const notificationPreferencesRestoredAfterReplay = await expectStatus(
    "account restores the message preference after delayed replay verification",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-preference-messages-restore-after-receipt",
      },
      body: JSON.stringify({ key: "messages", enabled: true }),
    },
  );
  assert.equal(notificationPreferencesRestoredAfterReplay.preferences.messages, true);
  await expectStatus(
    "notification preference idempotency key cannot be reused for a different value",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    409,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-preference-messages-enable",
      },
      body: JSON.stringify({ key: "messages", enabled: false }),
    },
  );
  const notificationsGloballyDisabled = await expectStatus(
    "account can disable all account-wide notification categories",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-preference-global-disable",
      },
      body: JSON.stringify({ key: "enabled", enabled: false }),
    },
  );
  assert.equal(notificationsGloballyDisabled.preferences.enabled, false);
  const notificationsGloballyRestored = await expectStatus(
    "account can restore account-wide notification delivery",
    workspaceAdmin,
    "/api/v1/me/notification-preferences",
    200,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-preference-global-restore",
      },
      body: JSON.stringify({ key: "enabled", enabled: true }),
    },
  );
  assert.equal(notificationsGloballyRestored.preferences.enabled, true);
  const profileUpdate = {
    name: "Workspace Smoke Profile",
    title: "Operations Lead",
    phone: "0901111222",
    license: "SH-LIC-ALPHA",
    hospital: "Alpha Hospital",
    department: "Remote Care",
    specialty: "Cardiology",
    address: "1 Alpha Health Street",
  };
  const updatedAccountProfile = await expectStatus("portal updates account profile fields", workspaceAdmin, "/api/v1/me", 200, {
    method: "PATCH",
    headers: {
      ...portalJsonHeaders,
      "Idempotency-Key": "workspace-account-profile-fields",
    },
    body: JSON.stringify(profileUpdate),
  });
  assertAccountProfileMutationReceipt(updatedAccountProfile, {
    userId: "usr_workspace_admin",
    changedFields: Object.keys(profileUpdate),
    replayed: false,
  });
  for (const [field, expected] of Object.entries(profileUpdate)) {
    assert.equal(updatedAccountProfile.user[field], expected);
  }
  const accountProfileAfterRead = await expectStatus("portal reads updated account profile fields", workspaceAdmin, "/api/v1/me", 200, {
    headers: portalHeaders,
  });
  for (const [field, expected] of Object.entries(profileUpdate)) {
    assert.equal(accountProfileAfterRead.user[field], expected);
  }
  const accountAfterHospitalText = await expectStatus("profile hospital text does not switch workspace", workspaceAdmin, "/api/v1/me", 200, {
    method: "PATCH",
    headers: {
      ...portalJsonHeaders,
      "Idempotency-Key": "workspace-account-profile-hospital-text",
    },
    body: JSON.stringify({ hospital: "Beta Hospital" }),
  });
  assertAccountProfileMutationReceipt(accountAfterHospitalText, {
    userId: "usr_workspace_admin",
    changedFields: ["hospital"],
    replayed: false,
  });
  assert.equal(accountAfterHospitalText.user.organizationId, "org_alpha");
  assert.equal(accountAfterHospitalText.user.hospital, "Beta Hospital");
  const conflictingWorkspaceAliases = await expectStatus(
    "workspace selection aliases fail closed when they disagree",
    workspaceAdmin,
    "/api/v1/me",
    400,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-account-profile-conflicting-alias",
      },
      body: JSON.stringify({ organizationId: "org_alpha", clinicId: "org_beta" }),
    },
  );
  assert.equal(
    conflictingWorkspaceAliases.error.code,
    "WORKSPACE_SELECTION_CONFLICT",
  );
  const mixedProfileWorkspaceCompatibility = await request("/api/v1/me", {
    method: "PATCH",
    headers: {
      ...workspaceAdmin.headers,
      ...portalJsonHeaders,
      "Idempotency-Key": "workspace-account-profile-mixed-compatibility",
    },
    body: JSON.stringify({ organizationId: "org_alpha", title: "Compatibility mix" }),
  });
  assert.equal(
    mixedProfileWorkspaceCompatibility.response.status,
    200,
    JSON.stringify(mixedProfileWorkspaceCompatibility.body),
  );
  assert.equal(mixedProfileWorkspaceCompatibility.body.user.id, "usr_workspace_admin");
  assert.equal(mixedProfileWorkspaceCompatibility.body.user.title, "Compatibility mix");
  assert.equal(mixedProfileWorkspaceCompatibility.response.headers.get("deprecation"), "true");
  assert.equal(
    mixedProfileWorkspaceCompatibility.response.headers.get("x-shcare-compatibility-alias"),
    "account-profile-workspace-mix",
  );
  const legacyWorkspaceFieldCompatibility = await request("/api/v1/me", {
    method: "PATCH",
    headers: {
      ...workspaceAdmin.headers,
      ...portalJsonHeaders,
      "Idempotency-Key": "workspace-switch-clinic-id-compatibility",
    },
    body: JSON.stringify({ clinicId: "org_alpha" }),
  });
  assert.equal(
    legacyWorkspaceFieldCompatibility.response.status,
    200,
    JSON.stringify(legacyWorkspaceFieldCompatibility.body),
  );
  assert.equal(legacyWorkspaceFieldCompatibility.body.user.currentWorkspaceId, "org_alpha");
  assert.equal(legacyWorkspaceFieldCompatibility.response.headers.get("deprecation"), "true");
  assert.equal(
    legacyWorkspaceFieldCompatibility.response.headers.get("x-shcare-compatibility-alias"),
    "workspace-switch-alias",
  );
  const legacyAccountProfileCompatibility = await request("/api/me", {
    method: "PATCH",
    headers: {
      ...workspaceAdmin.headers,
      ...portalJsonHeaders,
    },
    body: JSON.stringify({ title: "Legacy profile alias" }),
  });
  assert.equal(
    legacyAccountProfileCompatibility.response.status,
    200,
    JSON.stringify(legacyAccountProfileCompatibility.body),
  );
  assert.equal(legacyAccountProfileCompatibility.body.user.title, "Legacy profile alias");
  assert.equal(legacyAccountProfileCompatibility.response.headers.get("deprecation"), "true");
  assert.equal(
    legacyAccountProfileCompatibility.response.headers.get("x-shcare-compatibility-alias"),
    "account-profile-update",
  );
  const accountProfileCompatibilityMetrics = await requestRaw("/metrics");
  assert.equal(accountProfileCompatibilityMetrics.response.status, 200);
  assert.match(
    accountProfileCompatibilityMetrics.text,
    /smart_health_legacy_account_profile_update_total 1(?:\r?\n|$)/,
  );
  assert.match(
    accountProfileCompatibilityMetrics.text,
    /smart_health_legacy_account_profile_workspace_mix_total 1(?:\r?\n|$)/,
  );
  assert.match(
    accountProfileCompatibilityMetrics.text,
    /smart_health_legacy_workspace_switch_alias_total 1(?:\r?\n|$)/,
  );
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
    headers: {
      ...portalJsonHeaders,
      "Idempotency-Key": "workspace-support-ticket-1",
    },
    body: JSON.stringify({
      type: "other",
      description: "Portal smoke support request with enough context",
    }),
  });
  assert.ok(supportTicket.ticket.id);
  assert.equal(supportTicket.ticket.workspaceId, "org_alpha");
  assert.equal(supportTicket.ticket.requesterUserId, "usr_workspace_admin");
  assert.equal(supportTicket.ticket.status, "open");
  assert.equal(supportTicket.replayed, false);
  const replayedSupportTicket = await expectStatus(
    "portal safely replays support ticket",
    workspaceAdmin,
    "/api/portal/support",
    200,
    {
      method: "POST",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-support-ticket-1",
      },
      body: JSON.stringify({
        type: "other",
        description: "Portal smoke support request with enough context",
      }),
    },
  );
  assert.equal(replayedSupportTicket.ticket.id, supportTicket.ticket.id);
  assert.equal(replayedSupportTicket.replayed, true);
  await expectStatus(
    "portal rejects support idempotency key reuse",
    workspaceAdmin,
    "/api/portal/support",
    409,
    {
      method: "POST",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-support-ticket-1",
      },
      body: JSON.stringify({
        type: "interface_issue",
        description: "A different support request must not reuse the receipt",
      }),
    },
  );
  await expectStatus(
    "portal cannot inject support ticket workspace authority",
    workspaceAdmin,
    "/api/portal/support",
    400,
    {
      method: "POST",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-support-ticket-cross-tenant",
      },
      body: JSON.stringify({
        type: "other",
        description: "Cross workspace support authority injection attempt",
        workspaceId: "org_beta",
      }),
    },
  );

  await expectStatus("portal deletes created patient", workspaceAdmin, `/api/portal/patients/${createdPatient.patient.id}`, 200, {
    method: "DELETE",
    headers: { ...portalHeaders, "Idempotency-Key": "workspace-portal-patient-delete" },
  });

  const alphaDeviceEvents = await expectStatus("workspace admin reads own device events", workspaceAdmin, "/api/v1/devices/dev_alpha/events", 200);
  assert.equal(alphaDeviceEvents.events.some((event) => event.id === "evt_alpha"), true);
  await expectStatus("workspace admin cannot read cross workspace device events", workspaceAdmin, "/api/v1/devices/dev_beta/events", 403);
  await expectStatus("viewer cannot read device events without device capability", viewer, "/api/v1/devices/dev_alpha/events", 403);

  const betaDirectNotifications = await expectStatus(
    "direct userId cannot bypass notification tenant scope",
    betaDoctor,
    "/api/v1/notifications",
    200,
  );
  assert.equal(
    betaDirectNotifications.notifications.some((notification) => notification.id === "notif_cross_tenant_direct"),
    false,
  );
  assert.equal(
    betaDirectNotifications.notifications.some((notification) => notification.id === "notif_implicit_global"),
    false,
    "an implicit-global row must fail closed for non-platform accounts",
  );
  const platformNotifications = await expectStatus(
    "platform admin retains explicitly privileged notification visibility",
    platform,
    "/api/v1/notifications",
    200,
  );
  assert.equal(
    platformNotifications.notifications.some((notification) => notification.id === "notif_cross_tenant_direct"),
    true,
  );
  assert.equal(
    platformNotifications.notifications.some((notification) => notification.id === "notif_implicit_global"),
    true,
    "platform administrators retain explicit platform-level operational visibility",
  );
  const personalInbox = await expectStatus(
    "personal notification inbox is bound to the authenticated account and active workspace",
    workspaceAdmin,
    "/api/v1/notifications/inbox",
    200,
  );
  assert.equal(personalInbox.userId, "usr_workspace_admin");
  assert.equal(personalInbox.workspaceId, "org_alpha");
  assert.equal(
    personalInbox.notifications.some(
      (notification) => notification.id === "notif_inbox_current",
    ),
    true,
  );
  assert.equal(
    personalInbox.notifications.some(
      (notification) => notification.id === "notif_inbox_account_wide",
    ),
    true,
  );
  assert.equal(
    personalInbox.notifications.some(
      (notification) => notification.id === "notif_inbox_old_workspace",
    ),
    false,
  );
  assert.ok(
    personalInbox.notifications.every(
      (notification) =>
        notification.userId === personalInbox.userId &&
        notification.workspaceId === personalInbox.workspaceId &&
        (
          notification.organizationId === "" ||
          notification.organizationId === personalInbox.workspaceId
        ),
    ),
  );
  await expectStatus(
    "notification inbox read requires an Idempotency-Key",
    workspaceAdmin,
    "/api/v1/notifications/inbox/notif_inbox_current/read",
    400,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const readInboxItem = await expectStatus(
    "notification inbox returns an owner-bound read receipt",
    workspaceAdmin,
    "/api/v1/notifications/inbox/notif_inbox_current/read",
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-inbox-read-current",
      },
      body: "{}",
    },
  );
  assert.equal(readInboxItem.action, "read");
  assert.equal(readInboxItem.notification.id, "notif_inbox_current");
  assert.equal(readInboxItem.notification.userId, "usr_workspace_admin");
  assert.equal(readInboxItem.notification.workspaceId, "org_alpha");
  assert.equal(readInboxItem.notification.read, true);
  assert.equal(readInboxItem.replayed, false);
  const replayedInboxRead = await expectStatus(
    "notification inbox exact retry replays the original confirmed outcome",
    workspaceAdmin,
    "/api/v1/notifications/inbox/notif_inbox_current/read",
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-inbox-read-current",
      },
      body: "{}",
    },
  );
  assert.equal(replayedInboxRead.replayed, true);
  assert.equal(
    replayedInboxRead.notification.readAt,
    readInboxItem.notification.readAt,
  );
  await expectStatus(
    "notification inbox cannot mutate a stale-workspace item",
    workspaceAdmin,
    "/api/v1/notifications/inbox/notif_inbox_old_workspace/read",
    404,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-inbox-read-old-workspace",
      },
      body: "{}",
    },
  );
  await expectStatus(
    "notification inbox cannot mutate another account item",
    betaDoctor,
    "/api/v1/notifications/inbox/notif_inbox_current/read",
    404,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-inbox-cross-account",
      },
      body: "{}",
    },
  );
  const readAllInbox = await expectStatus(
    "notification inbox read-all returns the complete canonical snapshot",
    workspaceAdmin,
    "/api/v1/notifications/inbox/read-all",
    200,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "notification-inbox-read-all",
      },
      body: "{}",
    },
  );
  assert.equal(readAllInbox.action, "read_all");
  assert.ok(readAllInbox.notifications.every((notification) => notification.read));
  const deletedInboxItem = await expectStatus(
    "notification inbox delete confirms exact owner, workspace and post-delete snapshot",
    workspaceAdmin,
    "/api/v1/notifications/inbox/notif_inbox_account_wide",
    200,
    {
      method: "DELETE",
      headers: {
        "Idempotency-Key": "notification-inbox-delete-account-wide",
      },
    },
  );
  assert.equal(deletedInboxItem.action, "delete");
  assert.equal(deletedInboxItem.deletedId, "notif_inbox_account_wide");
  assert.equal(deletedInboxItem.notification.userId, "usr_workspace_admin");
  assert.equal(deletedInboxItem.notification.workspaceId, "org_alpha");
  assert.equal(
    deletedInboxItem.notifications.some(
      (notification) => notification.id === "notif_inbox_account_wide",
    ),
    false,
  );
  await expectStatus(
    "notification inbox delete-all requires an Idempotency-Key",
    workspaceAdmin,
    "/api/v1/notifications/inbox",
    400,
    { method: "DELETE" },
  );
  const deletedAllInboxItems = await expectStatus(
    "notification inbox delete-all removes only the current owner and workspace snapshot",
    workspaceAdmin,
    "/api/v1/notifications/inbox",
    200,
    {
      method: "DELETE",
      headers: {
        "Idempotency-Key": "notification-inbox-delete-all",
      },
    },
  );
  assert.equal(deletedAllInboxItems.action, "delete_all");
  assert.deepEqual(deletedAllInboxItems.notifications, []);
  assert.ok(deletedAllInboxItems.affectedIds.includes("notif_inbox_current"));
  const replayedDeleteAllInboxItems = await expectStatus(
    "notification inbox delete-all exact retry replays the original receipt",
    workspaceAdmin,
    "/api/v1/notifications/inbox",
    200,
    {
      method: "DELETE",
      headers: {
        "Idempotency-Key": "notification-inbox-delete-all",
      },
    },
  );
  assert.equal(replayedDeleteAllInboxItems.replayed, true);
  assert.deepEqual(
    replayedDeleteAllInboxItems.affectedIds,
    deletedAllInboxItems.affectedIds,
  );
  const notificationOptions = await expectStatus(
    "workspace admin reads scoped notification audience and provider options",
    workspaceAdmin,
    "/api/v1/notifications/options",
    200,
  );
  assert.deepEqual(notificationOptions.audiences.workspaces.map((workspace) => workspace.id), ["org_alpha"]);
  assert.ok(notificationOptions.audiences.roles.includes("doctor"));
  assert.ok(notificationOptions.audiences.users.some((target) => target.id === "usr_doctor"));
  assert.equal(notificationOptions.channels.in_app.available, true);
  assert.ok(["ready", "disabled", "unavailable"].includes(notificationOptions.channels.email.status));
  assert.ok(["ready", "disabled", "unavailable"].includes(notificationOptions.channels.push.status));

  await expectStatus(
    "viewer cannot create a workspace notification with view-only capability",
    viewer,
    "/api/v1/notifications",
    403,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Forbidden broadcast", message: "Must not be created" }),
    },
  );
  await expectStatus(
    "notification campaign rejects a type outside the published API allowlist",
    workspaceAdmin,
    "/api/v1/notifications",
    400,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-notification-invalid-type",
      },
      body: JSON.stringify({
        type: "critical",
        title: "Unsupported campaign type",
        message: "The runtime and OpenAPI contract must agree.",
        audience: {
          type: "users",
          workspaceId: "org_alpha",
          userIds: ["usr_doctor"],
        },
        channels: ["in_app"],
      }),
    },
  );
  await expectStatus(
    "viewer cannot delete a shared workspace notification",
    viewer,
    "/api/v1/notifications/notif_alpha",
    403,
    { method: "DELETE" },
  );
  await expectStatus(
    "viewer cannot bulk-delete shared workspace notifications",
    viewer,
    "/api/v1/notifications",
    403,
    { method: "DELETE" },
  );
  await expectStatus(
    "direct recipient can dismiss their own personal notification",
    viewer,
    "/api/v1/notifications/notif_viewer_direct",
    200,
    { method: "DELETE" },
  );

  const sharedFcmToken = "workspace-smoke-shared-fcm-token";
  await expectStatus(
    "legacy notification protocol registration is rejected",
    viewer,
    "/api/v1/notifications/register-device",
    400,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fcmToken: `${sharedFcmToken}-legacy`,
        platform: "android",
        notificationProtocolVersion: 1,
        appVersion: "0.9.0",
      }),
    },
  );
  const viewerNotificationBinding = await expectStatus(
    "viewer registers the current Android notification token",
    viewer,
    "/api/v1/notifications/register-device",
    200,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fcmToken: sharedFcmToken,
        platform: "android",
        notificationProtocolVersion: 2,
        appVersion: "1.0.0-rc.2",
      }),
    },
  );
  assert.equal(viewerNotificationBinding.device.userId, "usr_viewer");
  assert.equal(viewerNotificationBinding.device.workspaceId, "org_alpha");
  assert.ok(viewerNotificationBinding.device.authSessionId);
  assert.equal(viewerNotificationBinding.device.notificationProtocolVersion, 2);
  assert.equal(viewerNotificationBinding.device.appVersion, "1.0.0-rc.2");
  const doctorNotificationBinding = await expectStatus(
    "same physical token is atomically rebound to the newly authenticated user",
    doctor,
    "/api/v1/notifications/register-device",
    200,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fcmToken: sharedFcmToken,
        platform: "android",
        notificationProtocolVersion: 2,
        appVersion: "1.0.0-rc.2",
      }),
    },
  );
  assert.equal(doctorNotificationBinding.device.userId, "usr_doctor");
  assert.equal(doctorNotificationBinding.device.workspaceId, "org_alpha");
  assert.ok(doctorNotificationBinding.device.authSessionId);
  const reboundTokenRows = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"))
    .notificationDevices
    .filter((device) => device.fcmToken === sharedFcmToken);
  assert.equal(reboundTokenRows.length, 1, "one FCM token must have only one active account binding");
  assert.equal(reboundTokenRows[0].userId, "usr_doctor");
  const staleOwnerUnregister = await expectStatus(
    "previous user cannot unregister a token after it has been rebound",
    viewer,
    "/api/v1/notifications/unregister-device",
    200,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: sharedFcmToken }),
    },
  );
  assert.equal(staleOwnerUnregister.unregistered, false);
  const currentOwnerUnregister = await expectStatus(
    "current user unregisters the token before logout",
    doctor,
    "/api/v1/notifications/unregister-device",
    200,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: sharedFcmToken }),
    },
  );
  assert.equal(currentOwnerUnregister.unregistered, true);
  const unregisteredTokenRows = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"))
    .notificationDevices
    .filter((device) => device.fcmToken === sharedFcmToken);
  assert.equal(unregisteredTokenRows.length, 1);
  assert.equal(unregisteredTokenRows[0].userId, "usr_doctor");
  assert.equal(unregisteredTokenRows[0].enabled, false);

  const workspaceBoundToken = "workspace-smoke-doctor-workspace-token";
  await expectStatus(
    "doctor registers a token in the current alpha workspace",
    doctor,
    "/api/v1/notifications/register-device",
    200,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fcmToken: workspaceBoundToken,
        platform: "android",
        notificationProtocolVersion: 2,
        appVersion: "1.0.0-rc.2",
      }),
    },
  );
  await expectStatus(
    "doctor switches to beta before rebinding the same notification token",
    doctor,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "org_beta" }),
    },
  );
  const betaNotificationBinding = await expectStatus(
    "same-account notification token is rebound to the current beta workspace",
    doctor,
    "/api/v1/notifications/register-device",
    200,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fcmToken: workspaceBoundToken,
        platform: "android",
        notificationProtocolVersion: 2,
        appVersion: "1.0.0-rc.2",
      }),
    },
  );
  assert.equal(betaNotificationBinding.device.workspaceId, "org_beta");
  const workspaceBoundRows = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"))
    .notificationDevices
    .filter((device) => device.fcmToken === workspaceBoundToken);
  assert.equal(workspaceBoundRows.length, 1);
  assert.equal(workspaceBoundRows[0].workspaceId, "org_beta");
  await expectStatus(
    "doctor restores alpha after beta notification binding verification",
    doctor,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "org_alpha" }),
    },
  );
  const staleWorkspaceUnregister = await expectStatus(
    "same user cannot unregister a token from a stale workspace context",
    doctor,
    "/api/v1/notifications/unregister-device",
    200,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: workspaceBoundToken }),
    },
  );
  assert.equal(staleWorkspaceUnregister.unregistered, false);
  await expectStatus(
    "doctor returns to beta to unregister the beta-bound token",
    doctor,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "org_beta" }),
    },
  );
  const betaWorkspaceUnregister = await expectStatus(
    "current beta workspace session unregisters its own notification token",
    doctor,
    "/api/v1/notifications/unregister-device",
    200,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: workspaceBoundToken }),
    },
  );
  assert.equal(betaWorkspaceUnregister.unregistered, true);
  await expectStatus(
    "doctor restores alpha after notification workspace binding smoke",
    doctor,
    "/api/v1/me",
    200,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "org_alpha" }),
    },
  );

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
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "workspace-notification-campaign",
    },
    body: JSON.stringify({
      title: "Same workspace notice",
      message: "Notification smoke",
      audience: { type: "users", workspaceId: "org_alpha", userIds: ["usr_doctor"] },
      channels: ["in_app", "email", "push"],
    }),
  });
  assert.equal(sameWorkspaceNotification.notification.userId, "usr_doctor");
  assert.equal(sameWorkspaceNotification.notification.organizationId, "org_alpha");
  assert.equal(sameWorkspaceNotification.campaign.recipientCount, 1);
  assert.deepEqual(sameWorkspaceNotification.campaign.requestedChannels, ["in_app", "email", "push"]);
  assert.equal(
    Object.prototype.hasOwnProperty.call(sameWorkspaceNotification.campaign.audience, "role"),
    false,
    "non-role notification audiences must not inherit a default viewer role",
  );
  assert.equal(sameWorkspaceNotification.notification.inAppStatus, "ready");
  assert.equal(sameWorkspaceNotification.notification.campaignId, sameWorkspaceNotification.campaign.id);
  const replayedWorkspaceNotification = await expectStatus(
    "exact notification campaign retry replays one canonical outcome",
    workspaceAdmin,
    "/api/v1/notifications",
    201,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-notification-campaign",
      },
      body: JSON.stringify({
        title: "Same workspace notice",
        message: "Notification smoke",
        audience: { type: "users", workspaceId: "org_alpha", userIds: ["usr_doctor"] },
        channels: ["in_app", "email", "push"],
      }),
    },
  );
  assert.equal(replayedWorkspaceNotification.idempotent, true);
  assert.equal(replayedWorkspaceNotification.campaign.id, sameWorkspaceNotification.campaign.id);
  await expectStatus(
    "notification campaign key cannot be reused with different content",
    workspaceAdmin,
    "/api/v1/notifications",
    409,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-notification-campaign",
      },
      body: JSON.stringify({
        title: "Changed notice",
        message: "Notification smoke",
        audience: { type: "users", workspaceId: "org_alpha", userIds: ["usr_doctor"] },
        channels: ["in_app"],
      }),
    },
  );
  await expectStatus("workspace admin cannot target notification outside workspace", workspaceAdmin, "/api/v1/notifications", 403, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "workspace-notification-cross-tenant",
    },
    body: JSON.stringify({
      title: "Cross workspace notice",
      message: "Notification smoke",
      audience: { type: "users", workspaceId: "org_alpha", userIds: ["usr_beta_doctor"] },
      channels: ["in_app"],
    }),
  });

  await expectStatus("portal user deletes scoped notification", workspaceAdmin, "/api/portal/notifications/notif_alpha", 200, {
    method: "DELETE",
    headers: portalHeaders,
  });
  const remainingNotifications = await expectStatus("deleted portal notification is gone", workspaceAdmin, "/api/v1/notifications", 200);
  assert.equal(remainingNotifications.notifications.some((notification) => notification.id === "notif_alpha"), false);

  await expectStatus(
    "storage share requires an Idempotency-Key",
    workspaceAdmin,
    "/api/v1/admin/storage-files/file_alpha/share",
    400,
    { method: "POST" },
  );
  const unavailableStorageShare = await expectStatus(
    "local storage reports signed sharing unavailable instead of inventing an expiring URL",
    workspaceAdmin,
    "/api/v1/admin/storage-files/file_alpha/share",
    503,
    {
      method: "POST",
      headers: { "Idempotency-Key": "storage-share-alpha" },
    },
  );
  assert.equal(unavailableStorageShare.error.code, "STORAGE_SHARE_PROVIDER_UNAVAILABLE");
  const downloadedSeed = await expectRawStatus("workspace admin downloads own storage", workspaceAdmin, "/api/v1/admin/storage-files/file_alpha/download", 200);
  assert.equal(downloadedSeed.text, "alpha");
  await expectStatus("workspace admin cannot share cross workspace storage", workspaceAdmin, "/api/v1/admin/storage-files/file_beta/share", 403, {
    method: "POST",
    headers: { "Idempotency-Key": "storage-share-beta-denied" },
  });
  await expectStatus("workspace admin cannot download cross workspace storage", workspaceAdmin, "/api/v1/admin/storage-files/file_beta/download", 403);
  await expectStatus("technician cannot create signed storage url", technician, "/api/v1/admin/storage-files/file_alpha/share", 403, {
    method: "POST",
    headers: { "Idempotency-Key": "storage-share-technician-denied" },
  });
  await expectStatus("viewer cannot list storage", viewer, "/api/v1/admin/storage-files", 403);

  const storageBucketPayload = {
    name: "workspace-smoke-docs",
    description: "Workspace storage smoke bucket",
    allowedExtensions: ["pdf"],
    maxFileSizeMb: 25,
  };
  await expectStatus(
    "storage bucket creation requires an Idempotency-Key",
    platform,
    "/api/v1/admin/storage-buckets",
    400,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(storageBucketPayload),
    },
  );
  const createBucketOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "storage-bucket-create-smoke",
    },
    body: JSON.stringify(storageBucketPayload),
  };
  const createdStorageBucket = await expectStatus(
    "platform admin creates a canonical private storage bucket",
    platform,
    "/api/v1/admin/storage-buckets",
    201,
    createBucketOptions,
  );
  const replayedStorageBucket = await expectStatus(
    "storage bucket creation replays the exact canonical outcome",
    platform,
    "/api/v1/admin/storage-buckets",
    201,
    createBucketOptions,
  );
  assert.equal(replayedStorageBucket.bucket.id, createdStorageBucket.bucket.id);
  assert.equal(replayedStorageBucket.idempotent, true);
  await expectStatus(
    "workspace admin cannot create platform storage buckets",
    workspaceAdmin,
    "/api/v1/admin/storage-buckets",
    403,
    {
      ...createBucketOptions,
      headers: {
        ...createBucketOptions.headers,
        "Idempotency-Key": "storage-bucket-workspace-denied",
      },
    },
  );
  const deleteBucketOptions = {
    method: "DELETE",
    headers: { "Idempotency-Key": "storage-bucket-delete-smoke" },
  };
  await expectStatus(
    "platform admin deletes an empty custom storage bucket",
    platform,
    `/api/v1/admin/storage-buckets/${createdStorageBucket.bucket.id}`,
    200,
    deleteBucketOptions,
  );
  const replayedBucketDelete = await expectStatus(
    "storage bucket deletion replays without a second lifecycle mutation",
    platform,
    `/api/v1/admin/storage-buckets/${createdStorageBucket.bucket.id}`,
    200,
    deleteBucketOptions,
  );
  assert.equal(replayedBucketDelete.idempotent, true);

  const uploadBody = "RIFF0000WAVEfmt ";
  await expectStatus(
    "storage upload requires an Idempotency-Key",
    workspaceAdmin,
    "/api/v1/admin/storage-files?bucket=heart-audio&filename=delete-me.wav",
    400,
    {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: uploadBody,
    },
  );
  const uploadOptions = {
    method: "POST",
    headers: {
      "Content-Type": "audio/wav",
      "Idempotency-Key": "storage-upload-delete-me",
    },
    body: uploadBody,
  };
  const upload = await expectStatus("workspace admin uploads storage", workspaceAdmin, "/api/v1/admin/storage-files?bucket=heart-audio&filename=delete-me.wav", 201, uploadOptions);
  const replayedUpload = await expectStatus(
    "storage upload retry returns the original file without a second object",
    workspaceAdmin,
    "/api/v1/admin/storage-files?bucket=heart-audio&filename=delete-me.wav",
    201,
    uploadOptions,
  );
  assert.equal(replayedUpload.file.id, upload.file.id);
  assert.equal(replayedUpload.idempotent, true);
  assert.equal(upload.file.bucket, "heart-audio");
  assert.equal(upload.file.name, "delete-me.wav");
  assert.equal(upload.file.organizationId, "org_alpha");
  const listedAfterUpload = await expectStatus("workspace admin sees uploaded storage file", workspaceAdmin, "/api/v1/admin/storage-files", 200);
  assert.equal(listedAfterUpload.files.some((file) => file.id === upload.file.id), true);
  const downloadedUpload = await expectRawStatus("workspace admin downloads uploaded storage", workspaceAdmin, `/api/v1/admin/storage-files/${upload.file.id}/download`, 200);
  assert.equal(downloadedUpload.text, uploadBody);
  await expectStatus("billing cannot download storage", billing, "/api/v1/admin/storage-files/file_alpha/download", 403);
  await expectStatus(
    "storage deletion requires an Idempotency-Key",
    workspaceAdmin,
    `/api/v1/admin/storage-files/${upload.file.id}`,
    400,
    { method: "DELETE" },
  );
  const deleteStorageFileOptions = {
    method: "DELETE",
    headers: { "Idempotency-Key": "storage-delete-delete-me" },
  };
  await expectStatus("workspace admin deletes own uploaded storage", workspaceAdmin, `/api/v1/admin/storage-files/${upload.file.id}`, 200, deleteStorageFileOptions);
  const replayedStorageDelete = await expectStatus(
    "storage delete retry does not delete the provider object twice",
    workspaceAdmin,
    `/api/v1/admin/storage-files/${upload.file.id}`,
    200,
    deleteStorageFileOptions,
  );
  assert.equal(replayedStorageDelete.idempotent, true);
  await expectStatus("deleted uploaded storage is gone", workspaceAdmin, `/api/v1/admin/storage-files/${upload.file.id}/download`, 404);
  await expectStatus("billing cannot delete storage", billing, "/api/v1/admin/storage-files/file_alpha", 403, { method: "DELETE" });

  await expectStatus("billing cannot view platform packages", billing, "/api/v1/admin/packages", 403);
  await expectStatus("billing cannot edit package", billing, "/api/v1/admin/packages/pkg_test", 403, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: 2000 }),
  });
  const technicianClaim = await expectStatus(
    "platform provisions claim material for an existing factory device",
    platform,
    "/api/v1/devices/provision-qr",
    201,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-smoke-platform-provision-tech-device",
      },
      body: JSON.stringify({
        deviceId: "dev_claim_alpha",
        organizationId: "org_alpha",
        name: "Tech Pair Device",
      }),
    },
  );
  await expectStatus("technician can claim a provisioned device", technician, "/api/v1/devices/pair", 200, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "workspace-smoke-technician-pair",
    },
    body: JSON.stringify({
      deviceId: "dev_claim_alpha",
      organizationId: "org_alpha",
      claimCode: technicianClaim.claim.claimCode,
      connectionMethod: "QR",
    }),
  });
  await expectStatus("workspace admin cannot transfer device between workspaces", workspaceAdmin, "/api/v1/devices/dev_claim_alpha/transfer", 403, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "workspace-admin-transfer-forbidden",
    },
    body: JSON.stringify({ organizationId: "org_beta" }),
  });
  await expectStatus("platform cannot transfer device to missing workspace", platform, "/api/v1/devices/dev_claim_alpha/transfer", 404, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "platform-transfer-missing-workspace",
    },
    body: JSON.stringify({ organizationId: "org_missing" }),
  });
  await expectStatus("platform cannot transfer device to owner outside target workspace", platform, "/api/v1/devices/dev_claim_alpha/transfer", 403, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "platform-transfer-owner-mismatch",
    },
    body: JSON.stringify({ organizationId: "org_beta", ownerUserId: "usr_workspace_admin" }),
  });
  const transferredDevice = await expectStatus("platform can transfer device to matching workspace owner", platform, "/api/v1/devices/dev_claim_alpha/transfer", 200, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "platform-transfer-tech-device-to-beta",
    },
    body: JSON.stringify({ organizationId: "org_beta", ownerUserId: "usr_beta_doctor" }),
  });
  assert.equal(transferredDevice.device.organizationId, "org_beta");
  assert.equal(transferredDevice.device.pairedUserId, "usr_beta_doctor");
  const doctorClaim = await expectStatus("doctor cannot claim provisioned workspace device with view-only capability", doctor, "/api/v1/devices/pair", 403, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "workspace-smoke-doctor-claim",
    },
    body: JSON.stringify({
      deviceId: "dev_claim_alpha",
      organizationId: "org_alpha",
      claimCode: seededClaimCode,
      connectionMethod: "QR",
    }),
  });
  assert.equal(doctorClaim.error.code, "DEVICE_CLAIM_WORKSPACE_MISMATCH");
  const missingFactoryDevice = await expectStatus("pair cannot mint an unprovisioned device id", platform, "/api/v1/devices/pair", 404, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "platform-pair-missing-factory-device",
    },
    body: JSON.stringify({
      deviceId: "dev_platform_unprovisioned",
      organizationId: "org_alpha",
      claimCode: "missing-factory-claim",
    }),
  });
  assert.equal(missingFactoryDevice.error.code, "DEVICE_NOT_PROVISIONED");
  await expectStatus("technician cannot edit package", technician, "/api/v1/admin/packages/pkg_test", 403, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: 3000 }),
  });

  await expectStatus("doctor can read assigned workspace patients", doctor, "/api/v1/patients/pat_alpha", 200);
  await expectStatus("doctor cannot read cross workspace patient", doctor, "/api/v1/patients/pat_beta", 403);
  const alphaAiHistory = await expectStatus("workspace admin does not see beta AI chat history", workspaceAdmin, "/api/v1/ai/chat", 200);
  assert.equal(alphaAiHistory.messages.some((message) => message.content === "Beta private AI history"), false);
  assert.deepEqual(alphaAiHistory.availability, {
    available: false,
    status: "unavailable",
    provider: "openai_compatible",
    model: "",
    reason: "not_configured",
  });
  const beforeUnavailableAi = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const alphaAiReply = await expectStatus("AI chat fails closed when no provider is configured", workspaceAdmin, "/api/v1/ai/chat", 503, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "ai-unavailable-must-not-persist" },
    body: JSON.stringify({ message: "Summarize alpha workspace signals" }),
  });
  assert.equal(alphaAiReply.error.code, "AI_PROVIDER_UNAVAILABLE");
  assert.equal(alphaAiReply.code, "ai_provider_unavailable");
  assert.equal(alphaAiReply.details.availability.available, false);
  const afterUnavailableAi = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  assert.deepEqual(afterUnavailableAi.chatMessages, beforeUnavailableAi.chatMessages, "unavailable AI must not write user or rule-based messages");
  assert.equal(
    afterUnavailableAi.accessLogs.filter((entry) => entry.action === "Sử dụng trợ lý AI").length,
    beforeUnavailableAi.accessLogs.filter((entry) => entry.action === "Sử dụng trợ lý AI").length,
    "unavailable AI must not record fake success access",
  );
  assert.equal(
    afterUnavailableAi.auditLogs.filter((entry) => entry.action === "ai.chat").length,
    beforeUnavailableAi.auditLogs.filter((entry) => entry.action === "ai.chat").length,
    "unavailable AI must not record a success audit",
  );
  const betaAiHistory = await expectStatus("beta doctor sees only beta AI chat history", betaDoctor, "/api/v1/ai/chat", 200);
  assert.equal(betaAiHistory.availability.available, false);
  assert.equal(betaAiHistory.messages.some((message) => message.content === "Beta private AI history"), true);
  assert.equal(betaAiHistory.messages.some((message) => message.organizationId === "org_alpha"), false);
  const currentAiSettings = await expectStatus("workspace admin reads truthful AI runtime status", workspaceAdmin, "/api/v1/ai/settings", 200);
  assert.equal(currentAiSettings.settings.analysisKind, "signal_quality");
  assert.equal(currentAiSettings.settings.version, "signal_quality_rules_v1");
  assert.equal(currentAiSettings.settings.clinicalDecisionSupport, false);
  assert.equal(currentAiSettings.settings.updateSupported, false);
  assert.equal(currentAiSettings.runtime.modelUpdate.available, false);
  assert.equal(Object.hasOwn(currentAiSettings.settings, "heartAccuracy"), false);
  const rejectedAiSettings = await expectStatus("workspace admin cannot persist unsupported AI settings", workspaceAdmin, "/api/v1/ai/settings", 422, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offlineMode: true, confidenceThreshold: 0.82 }),
  });
  assert.equal(rejectedAiSettings.error.code, "AI_SETTINGS_READ_ONLY");
  const alphaNotificationsBeforeAiUpdate = await expectStatus("workspace admin snapshots notifications before unavailable AI update", workspaceAdmin, "/api/v1/notifications", 200);
  const aiApiUpdate = await expectStatus("Android AI model update fails closed without a real provider", workspaceAdmin, "/api/v1/ai/update", 503, {
    method: "POST",
  });
  assert.equal(aiApiUpdate.error.code, "AI_MODEL_UPDATE_UNAVAILABLE");
  const aiUpdateCheck = await expectStatus("shared AI update check reports unsupported instead of a fake release", workspaceAdmin, "/api/v1/settings/ai/check-update", 200, {
    method: "POST",
  });
  assert.equal(aiUpdateCheck.update.available, false);
  assert.equal(aiUpdateCheck.update.currentVersion, "signal_quality_rules_v1");
  assert.equal(aiUpdateCheck.update.latestVersion, null);
  const settingsAiUpdate = await expectStatus("shared AI model update fails closed without a real provider", workspaceAdmin, "/api/v1/settings/ai/update", 503, {
    method: "POST",
  });
  assert.equal(settingsAiUpdate.error.code, "AI_MODEL_UPDATE_UNAVAILABLE");
  const alphaNotificationsAfterAiUpdate = await expectStatus("workspace admin sees AI update notifications scoped to own workspace", workspaceAdmin, "/api/v1/notifications", 200);
  assert.equal(alphaNotificationsAfterAiUpdate.notifications.length, alphaNotificationsBeforeAiUpdate.notifications.length);
  const betaNotificationsAfterAiUpdate = await expectStatus("beta doctor does not see alpha AI update notifications", betaDoctor, "/api/v1/notifications", 200);
  assert.equal(betaNotificationsAfterAiUpdate.notifications.some((notification) => notification.title === "Đã cập nhật mô hình AI"), false);
  const dataSummary = await expectStatus("workspace admin sees scoped Android data summary", workspaceAdmin, "/api/v1/data/summary", 200);
  assert.equal(dataSummary.storage.patientCount, 1);
  const expectedAlphaAudioBytes = Buffer.byteLength("RIFFscan-alpha-audio", "utf8");
  assert.equal(dataSummary.storage.cloudUsedBytes, 5 + expectedAlphaAudioBytes);
  assert.equal(dataSummary.storage.audioUsedBytes, expectedAlphaAudioBytes);
  assert.equal(dataSummary.storage.storageFileCount, 2);
  assert.equal(dataSummary.storage.autoSync, false);
  assert.equal(dataSummary.storage.cloudBackup, false);
  assert.equal(dataSummary.storage.localUsedMb, 0);
  assert.equal(dataSummary.storage.localTotalMb, 0);
  assert.equal(dataSummary.storage.cacheMb, 0);
  assert.equal(dataSummary.storage.audioFileCount, 1);
  const clearedCache = await expectStatus("workspace admin clears Android data cache with scoped summary", workspaceAdmin, "/api/v1/data/cache", 200, {
    method: "DELETE",
  });
  assert.equal(clearedCache.storage.patientCount, 1);
  await expectStatus("workspace admin cannot delete all Android data", workspaceAdmin, "/api/v1/data/all", 403, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "XOA DU LIEU" }),
  });
  await expectStatus(
    "an unknown export is 404 even when the export ledger is empty",
    workspaceAdmin,
    "/api/v1/exports/download/export_unknown_before_create",
    404,
  );
  await expectStatus("export creation requires an Idempotency-Key", workspaceAdmin, "/api/v1/exports", 400, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "json" }),
  });
  await expectStatus(
    "workspace export rejects a cross-workspace target instead of silently ignoring it",
    workspaceAdmin,
    "/api/v1/exports",
    403,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-export-cross-workspace",
      },
      body: JSON.stringify({ format: "json", organizationId: "org_beta" }),
    },
  );
  const unsupportedExport = await expectStatus(
    "export creation rejects formats without a real backend artifact",
    workspaceAdmin,
    "/api/v1/exports",
    422,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-export-unsupported-format",
      },
      body: JSON.stringify({ format: "zip" }),
    },
  );
  assert.equal(unsupportedExport.error.code, "EXPORT_FORMAT_UNSUPPORTED");
  assert.deepEqual(unsupportedExport.error.details.supportedFormats, ["json", "csv", "xlsx", "pdf"]);

  assert.ok(workspaceAdmin.user.capabilities.includes("workspace.exports.manage"));
  assert.ok(workspaceAdmin.user.capabilities.includes("workspace.audit.export"));
  assert.ok(doctor.user.capabilities.includes("workspace.assigned_data.export"));
  assert.ok(patient.user.capabilities.includes("personal.data.export"));
  assert.equal(billing.user.capabilities.includes("workspace.exports.manage"), false);
  assert.equal(viewer.user.capabilities.includes("workspace.exports.manage"), false);

  const exportDate = new Date().toISOString().slice(0, 10);
  const workspaceExportPayload = {
    format: "json",
    dataset: "clinical_bundle",
    filters: { startDate: exportDate, endDate: exportDate },
    includeAudio: false,
    includeReports: true,
    includeHistory: true,
  };
  const workspaceExportHeaders = {
    "Content-Type": "application/json",
    "Idempotency-Key": "workspace-export-json-snapshot",
  };
  const workspaceExport = await expectStatus(
    "workspace creates a tenant-scoped JSON export snapshot",
    workspaceAdmin,
    "/api/v1/exports",
    201,
    {
      method: "POST",
      headers: workspaceExportHeaders,
      body: JSON.stringify(workspaceExportPayload),
    },
  );
  assert.equal(workspaceExport.export.organizationId, "org_alpha");
  assert.equal(workspaceExport.export.format, "json");
  assert.equal(workspaceExport.export.dataset, "clinical_bundle");
  assert.equal(workspaceExport.export.scopeKind, "workspace");
  assert.equal(workspaceExport.export.status, "ready");
  assert.match(workspaceExport.export.artifactSha256, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(workspaceExport.export, "snapshot"), false, "list/create responses must not inline the artifact");

  const replayedWorkspaceExport = await expectStatus(
    "workspace export double-submit replays the same artifact",
    workspaceAdmin,
    "/api/v1/exports",
    201,
    {
      method: "POST",
      headers: workspaceExportHeaders,
      body: JSON.stringify(workspaceExportPayload),
    },
  );
  assert.equal(replayedWorkspaceExport.replayed, true);
  assert.equal(replayedWorkspaceExport.export.id, workspaceExport.export.id);
  const conflictingWorkspaceExport = await expectStatus(
    "one export Idempotency-Key cannot be reused for another payload",
    workspaceAdmin,
    "/api/v1/exports",
    409,
    {
      method: "POST",
      headers: workspaceExportHeaders,
      body: JSON.stringify({ ...workspaceExportPayload, includeHistory: false }),
    },
  );
  assert.equal(conflictingWorkspaceExport.error.code, "IDEMPOTENCY_KEY_REUSED");

  const workspaceArtifactJobs = [{ format: "json", job: workspaceExport }];
  for (const format of ["csv", "xlsx", "pdf"]) {
    const job = await expectStatus(
      `workspace creates a real ${format.toUpperCase()} export artifact`,
      workspaceAdmin,
      "/api/v1/exports",
      201,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `workspace-export-${format}-artifact`,
        },
        body: JSON.stringify({ ...workspaceExportPayload, format }),
      },
    );
    assert.equal(job.export.format, format);
    assert.match(job.export.artifactSha256, /^[0-9a-f]{64}$/);
    workspaceArtifactJobs.push({ format, job });
  }

  let downloadedWorkspaceExport = null;
  for (const { format, job } of workspaceArtifactJobs) {
    const artifact = await expectRawStatus(
      `workspace downloads the stored ${format.toUpperCase()} artifact for its own tenant`,
      workspaceAdmin,
      `/api/v1/exports/download/${job.export.id}`,
      200,
    );
    assert.equal(
      artifact.response.headers.get("x-shcare-artifact-sha256"),
      crypto.createHash("sha256").update(artifact.buffer).digest("hex"),
    );
    assert.equal(artifact.response.headers.get("x-shcare-renderer-version"), "shcare.export-artifact.v1");
    assert.match(artifact.response.headers.get("content-disposition") || "", new RegExp(`\\.${format}\\"$`));
    if (format === "json") {
      assert.match(artifact.response.headers.get("content-type") || "", /^application\/json/);
      downloadedWorkspaceExport = JSON.parse(artifact.text);
    } else if (format === "csv") {
      assert.match(artifact.response.headers.get("content-type") || "", /^text\/csv/);
      assert.deepEqual([...artifact.buffer.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      assert.match(artifact.text, /dataset/);
    } else if (format === "xlsx") {
      assert.equal(
        artifact.response.headers.get("content-type"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      assert.deepEqual([...artifact.buffer.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
      assert.equal(artifact.buffer.includes(Buffer.from("[Content_Types].xml")), true);
    } else {
      assert.equal(artifact.response.headers.get("content-type"), "application/pdf");
      assert.equal(artifact.buffer.subarray(0, 8).toString("ascii"), "%PDF-1.4");
      assert.equal(artifact.buffer.subarray(-6).toString("ascii").includes("%%EOF"), true);
    }
  }
  assert.equal(downloadedWorkspaceExport.schemaVersion, "shcare.export.v1");
  assert.equal(downloadedWorkspaceExport.exportId, workspaceExport.export.id);
  assert.equal(downloadedWorkspaceExport.scope.organizationId, "org_alpha");
  assert.equal(downloadedWorkspaceExport.scope.kind, "workspace");
  assert.deepEqual(downloadedWorkspaceExport.filters, {
    startDate: exportDate,
    endDate: exportDate,
    includeAudio: false,
    includeReports: true,
    includeHistory: true,
  });
  assert.equal(downloadedWorkspaceExport.data.patients.some((item) => item.id === "pat_alpha"), true);
  assert.equal(downloadedWorkspaceExport.data.patients.some((item) => item.id === "pat_beta"), false);
  assert.equal(downloadedWorkspaceExport.data.devices.some((item) => item.id === "dev_beta"), false);
  assert.equal(downloadedWorkspaceExport.data.scans.some((item) => item.id === "scan_beta"), false);
  assert.equal(
    downloadedWorkspaceExport.data.scans.some((item) => item.id === "scan_alpha_extra"),
    false,
    "the inclusive date filter must exclude historical records outside the requested day",
  );
  assert.equal(downloadedWorkspaceExport.data.reports.some((item) => item.scanId === "scan_beta"), false);
  assert.deepEqual(downloadedWorkspaceExport.data.audioFiles, []);
  assert.equal(JSON.stringify(downloadedWorkspaceExport).includes("protectedMetadata"), false);

  await expectStatus("platform export rejects missing workspace", platform, "/api/v1/exports", 404, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "platform-export-missing-workspace",
    },
    body: JSON.stringify({ format: "json", organizationId: "org_missing" }),
  });
  const betaExport = await expectStatus(
    "platform creates a JSON export for the explicitly selected workspace",
    platform,
    "/api/v1/exports",
    201,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "platform-export-beta-json",
      },
      body: JSON.stringify({ format: "json", organizationId: "org_beta" }),
    },
  );
  assert.equal(betaExport.export.organizationId, "org_beta");
  assert.equal(betaExport.export.scopeKind, "platform");

  const platformGlobalAuditExport = await expectStatus(
    "platform admin creates a global audit export without selecting one workspace",
    platform,
    "/api/v1/exports",
    201,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "platform-global-audit-export-json",
      },
      body: JSON.stringify({
        format: "json",
        dataset: "audit_logs",
        filters: { action: "export.create", resourceType: "export", sort: "createdAt:desc" },
      }),
    },
  );
  assert.equal(platformGlobalAuditExport.export.organizationId, "");
  assert.equal(platformGlobalAuditExport.export.dataset, "audit_logs");
  assert.equal(platformGlobalAuditExport.export.scopeKind, "platform");
  const platformGlobalAuditArtifact = await expectRawStatus(
    "platform admin downloads the frozen global audit snapshot",
    platform,
    `/api/v1/exports/download/${platformGlobalAuditExport.export.id}`,
    200,
  );
  const platformGlobalAuditSnapshot = JSON.parse(platformGlobalAuditArtifact.text);
  assert.equal(platformGlobalAuditSnapshot.scope.organizationId, "");
  assert.equal(platformGlobalAuditSnapshot.scope.kind, "platform");
  assert.equal(
    platformGlobalAuditSnapshot.data.auditLogs.some((entry) => entry.resourceId === workspaceExport.export.id),
    true,
  );
  assert.equal(
    platformGlobalAuditSnapshot.data.auditLogs.some((entry) => entry.resourceId === betaExport.export.id),
    true,
    "global platform audit export must retain authorized events across workspaces",
  );
  const platformAuditJobs = await expectStatus(
    "platform audit export ledger can list the global job",
    platform,
    "/api/v1/exports?dataset=audit_logs",
    200,
  );
  assert.deepEqual(platformAuditJobs.exports.map((job) => job.id), [platformGlobalAuditExport.export.id]);
  const platformGlobalAuditQuery = await expectStatus(
    "platform audit query can find a canonical event across workspaces",
    platform,
    `/api/v1/audit-logs?action=export.create&q=${encodeURIComponent(betaExport.export.id)}&limit=1`,
    200,
  );
  assert.deepEqual(platformGlobalAuditQuery.logs.map((entry) => entry.resourceId), [betaExport.export.id]);
  await expectStatus(
    "workspace admin cannot download a platform-global audit artifact",
    workspaceAdmin,
    `/api/v1/exports/download/${platformGlobalAuditExport.export.id}`,
    403,
  );

  const auditExport = await expectStatus(
    "workspace admin exports a server-filtered audit ledger",
    workspaceAdmin,
    "/api/v1/exports",
    201,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-audit-export-csv",
      },
      body: JSON.stringify({
        format: "csv",
        dataset: "audit_logs",
        filters: {
          action: "export.create",
          resourceType: "export",
          startDate: exportDate,
          endDate: exportDate,
          sort: "createdAt:desc",
        },
      }),
    },
  );
  assert.equal(auditExport.export.dataset, "audit_logs");
  assert.equal(auditExport.export.scopeKind, "workspace");
  const auditArtifact = await expectRawStatus(
    "workspace downloads the filtered audit CSV artifact",
    workspaceAdmin,
    `/api/v1/exports/download/${auditExport.export.id}.csv`,
    200,
  );
  assert.match(auditArtifact.response.headers.get("content-type") || "", /^text\/csv/);
  assert.match(auditArtifact.text, /created_at/);
  assert.match(auditArtifact.text, /export\.create/);
  assert.equal(auditArtifact.text.includes(workspaceExport.export.id), true);
  assert.equal(auditArtifact.text.includes(betaExport.export.id), false, "audit export must not cross tenant scope");
  const filteredAuditLog = await expectStatus(
    "audit query filters by canonical action, resource and free text before pagination",
    workspaceAdmin,
    `/api/v1/audit-logs?action=export.create&resourceType=export&q=${encodeURIComponent(workspaceExport.export.id)}&page=1&limit=1`,
    200,
  );
  assert.deepEqual(filteredAuditLog.logs.map((entry) => entry.resourceId), [workspaceExport.export.id]);
  assert.equal(filteredAuditLog.pagination.total, 1);

  const workspaceExportsRequest = await request(
    "/api/v1/exports?page=1&limit=2&sort=createdAt%3Adesc",
    { headers: workspaceAdmin.headers },
  );
  assert.equal(workspaceExportsRequest.response.status, 200);
  assert.equal(workspaceExportsRequest.body.exports.length, 2);
  assert.equal(workspaceExportsRequest.body.exports.every((item) => item.organizationId === "org_alpha"), true);
  assert.equal(workspaceExportsRequest.body.exports.every((item) => !Object.hasOwn(item, "snapshot")), true);
  assert.equal(workspaceExportsRequest.response.headers.get("x-page"), "1");
  assert.equal(workspaceExportsRequest.response.headers.get("x-page-limit"), "2");

  const doctorExportsBeforeGrant = await expectStatus(
    "doctor export ledger hides jobs created by other workspace actors",
    doctor,
    "/api/v1/exports",
    200,
  );
  assert.deepEqual(doctorExportsBeforeGrant.exports, []);
  const doctorExportGrant = await expectStatus(
    "workspace grants one patient for scoped doctor export",
    workspaceAdmin,
    "/api/portal/patients/pat_alpha/shares",
    201,
    {
      method: "POST",
      headers: { ...portalJsonHeaders, "Idempotency-Key": "doctor-export-patient-grant" },
      body: JSON.stringify({ doctorUserId: "usr_doctor", scope: "patient_profile" }),
    },
  );
  const doctorExport = await expectStatus(
    "doctor creates an export restricted to active patient grants",
    doctor,
    "/api/v1/exports",
    201,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "doctor-assigned-export" },
      body: JSON.stringify({ format: "json", dataset: "clinical_bundle" }),
    },
  );
  assert.equal(doctorExport.export.scopeKind, "assigned_patients");
  const doctorArtifact = await expectRawStatus(
    "doctor downloads only the granted patient snapshot",
    doctor,
    `/api/v1/exports/download/${doctorExport.export.id}`,
    200,
  );
  const doctorSnapshot = JSON.parse(doctorArtifact.text);
  assert.deepEqual(doctorSnapshot.scope.patientIds, ["pat_alpha"]);
  assert.deepEqual(doctorSnapshot.data.patients.map((item) => item.id), ["pat_alpha"]);
  assert.equal(JSON.stringify(doctorSnapshot).includes("pat_beta"), false);
  assert.equal(JSON.stringify(doctorSnapshot).includes("org_beta"), false);
  await expectStatus(
    "doctor cannot download an export created by the workspace administrator",
    doctor,
    `/api/v1/exports/download/${workspaceExport.export.id}`,
    403,
  );
  const doctorExports = await expectStatus(
    "doctor export ledger contains only doctor-created jobs",
    doctor,
    "/api/v1/exports",
    200,
  );
  assert.deepEqual(doctorExports.exports.map((item) => item.id), [doctorExport.export.id]);
  await expectStatus(
    "doctor cannot export the workspace audit ledger",
    doctor,
    "/api/v1/exports",
    403,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "doctor-audit-export-denied" },
      body: JSON.stringify({ format: "json", dataset: "audit_logs" }),
    },
  );
  await expectStatus(
    "workspace revokes the temporary doctor export grant",
    workspaceAdmin,
    `/api/portal/patients/pat_alpha/shares/${doctorExportGrant.share.id}`,
    200,
    {
      method: "DELETE",
      headers: { ...portalHeaders, "Idempotency-Key": "doctor-export-patient-grant-revoke" },
    },
  );
  const doctorAfterRevokeExport = await expectStatus(
    "doctor export after grant revocation is an empty patient-scoped snapshot",
    doctor,
    "/api/v1/exports",
    201,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "doctor-after-revoke-export" },
      body: JSON.stringify({ format: "json" }),
    },
  );
  const doctorAfterRevokeArtifact = await expectRawStatus(
    "revoked doctor grant cannot leak data into a newly created export",
    doctor,
    `/api/v1/exports/download/${doctorAfterRevokeExport.export.id}`,
    200,
  );
  assert.equal(JSON.parse(doctorAfterRevokeArtifact.text).counts.total, 0);

  const patientExport = await expectStatus(
    "patient creates a personal export limited to owned and dependent profiles",
    patient,
    "/api/v1/exports",
    201,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "patient-personal-export" },
      body: JSON.stringify({ format: "json", dataset: "clinical_bundle" }),
    },
  );
  assert.equal(patientExport.export.scopeKind, "personal");
  const patientArtifact = await expectRawStatus(
    "patient downloads only personal profile data",
    patient,
    `/api/v1/exports/download/${patientExport.export.id}`,
    200,
  );
  const patientSnapshot = JSON.parse(patientArtifact.text);
  assert.deepEqual(
    patientSnapshot.data.patients.map((item) => item.id).sort(),
    ["pat_guardian_dependent", "pat_patient_child", "pat_patient_self"].sort(),
  );
  assert.equal(JSON.stringify(patientSnapshot).includes("pat_alpha"), false);
  assert.equal(JSON.stringify(patientSnapshot).includes("pat_beta"), false);

  await expectStatus("billing role cannot list clinical export jobs", billing, "/api/v1/exports", 403);
  await expectStatus("viewer cannot list clinical export jobs", viewer, "/api/v1/exports", 403);
  await expectStatus("billing role cannot create a clinical export", billing, "/api/v1/exports", 403, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "billing-export-denied" },
    body: JSON.stringify({ format: "json" }),
  });
  await expectStatus("viewer cannot create a clinical export", viewer, "/api/v1/exports", 403, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "viewer-export-denied" },
    body: JSON.stringify({ format: "json" }),
  });
  await expectStatus(
    "billing role cannot download a known workspace export",
    billing,
    `/api/v1/exports/download/${workspaceExport.export.id}`,
    403,
  );
  await expectStatus(
    "viewer cannot download a known workspace export",
    viewer,
    `/api/v1/exports/download/${workspaceExport.export.id}`,
    403,
  );
  await expectStatus(
    "workspace admin cannot download a known export from another workspace",
    workspaceAdmin,
    `/api/v1/exports/download/${betaExport.export.id}`,
    403,
  );
  await expectStatus(
    "unknown export remains 404 after other tenants have created artifacts",
    workspaceAdmin,
    "/api/v1/exports/download/export_unknown_after_create",
    404,
  );
  const persistedExports = await readPersistedDbJson(path.join(dataDir, "db.json"));
  assert.equal(
    persistedExports.auditLogs.filter(
      (entry) => entry.action === "export.create" && entry.resourceId === workspaceExport.export.id,
    ).length,
    1,
    "idempotent replay must not append a second export.create audit row",
  );
  assert.equal(
    persistedExports.auditLogs.filter(
      (entry) => entry.action === "export.download" && entry.resourceId === workspaceExport.export.id,
    ).length,
    1,
    "a successful artifact download must be audited once",
  );
  assert.equal(
    persistedExports.doctorPatientAccess.find((grant) => grant.id === doctorExportGrant.share.id)?.revokedAt?.length > 0,
    true,
    "temporary doctor export grant must be cleaned up through the audited revoke workflow",
  );
  await expectStatus("viewer can open overview", viewer, "/api/v1/admin/overview-stats", 200);
  await expectStatus("viewer cannot edit workspace billing fields", viewer, "/api/v1/admin/workspaces/org_alpha", 403, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageId: "pkg_test" }),
  });

  await expectStatus(
    "workspace admin cannot lock a global doctor identity through the admin route",
    workspaceAdmin,
    "/api/admin/doctors/usr_doctor/lock",
    403,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-admin-global-doctor-lock-denied",
      },
    },
  );
  await expectStatus(
    "workspace admin cannot unlock a global doctor identity through the admin route",
    workspaceAdmin,
    "/api/admin/doctors/usr_doctor/unlock",
    403,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-admin-global-doctor-unlock-denied",
      },
    },
  );
  await expectStatus(
    "workspace admin cannot delete a global doctor identity through the admin route",
    workspaceAdmin,
    "/api/admin/doctors/usr_doctor",
    403,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "workspace-admin-global-doctor-delete-denied",
      },
    },
  );
  const lastOwnerRemoval = await expectStatus(
    "workspace cannot revoke its last active owner",
    workspaceAdmin,
    "/api/portal/staff/usr_workspace_owner",
    409,
    {
      method: "DELETE",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-last-owner-revoke-denied",
      },
    },
  );
  assert.equal(lastOwnerRemoval.error.code, "LAST_WORKSPACE_OWNER");
  const crossWorkspaceStaffSuspend = await expectStatus(
    "workspace admin cannot suspend a staff membership that exists only in another workspace",
    workspaceAdmin,
    "/api/portal/staff/usr_beta_doctor/suspend",
    404,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-alpha-cannot-suspend-beta-doctor",
      },
    },
  );
  assert.equal(crossWorkspaceStaffSuspend.error.code, "WORKSPACE_MEMBERSHIP_NOT_FOUND");

  const suspendedDoctorMembership = await expectStatus(
    "workspace admin suspends only the selected workspace membership",
    workspaceAdmin,
    "/api/portal/staff/usr_doctor/suspend",
    200,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-alpha-doctor-suspend",
      },
    },
  );
  assert.equal(suspendedDoctorMembership.action, "suspend");
  assert.equal(suspendedDoctorMembership.membership.status, "suspended");
  assert.equal(suspendedDoctorMembership.user.accountStatus, "active");
  const replayedDoctorMembershipSuspend = await expectStatus(
    "workspace membership suspend is idempotent",
    workspaceAdmin,
    "/api/portal/staff/usr_doctor/suspend",
    200,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-alpha-doctor-suspend",
      },
    },
  );
  assert.equal(replayedDoctorMembershipSuspend.replayed, true);
  assert.equal(replayedDoctorMembershipSuspend.membership.status, "suspended");
  const staffAfterSuspend = await expectStatus(
    "suspended member remains visible in the selected workspace staff ledger",
    workspaceAdmin,
    "/api/portal/staff",
    200,
    { headers: portalHeaders },
  );
  assert.equal(
    staffAfterSuspend.staff.find((member) => member.id === "usr_doctor")?.workspaceMembership.status,
    "suspended",
  );
  assert.equal(staffAfterSuspend.workspaceId, "org_alpha");
  assert.equal(
    staffAfterSuspend.doctors.some((member) => member.id === "usr_doctor"),
    false,
    "a suspended membership must remain in the staff ledger but leave the assignable-doctor catalog",
  );

  const doctorAfterWorkspaceSuspend = await login("doctor@alpha.test");
  assert.equal(doctorAfterWorkspaceSuspend.user.accountStatus, "active");
  assert.equal(doctorAfterWorkspaceSuspend.user.currentWorkspaceId, "org_beta");
  assert.equal(
    doctorAfterWorkspaceSuspend.user.memberships.find((item) => item.workspaceId === "org_alpha")?.operational,
    false,
  );
  assert.equal(
    doctorAfterWorkspaceSuspend.user.memberships.find((item) => item.workspaceId === "org_beta")?.operational,
    true,
  );
  await expectStatus(
    "suspended Alpha membership does not break the doctor's Beta access",
    doctorAfterWorkspaceSuspend,
    "/api/v1/patients/pat_beta",
    200,
  );
  await expectStatus(
    "suspended Alpha membership removes Alpha access",
    doctorAfterWorkspaceSuspend,
    "/api/v1/patients/pat_alpha",
    403,
  );
  const devicesAfterWorkspaceSuspend = await expectStatus(
    "an active Beta membership cannot leak device capability into suspended Alpha",
    doctorAfterWorkspaceSuspend,
    "/api/v1/devices",
    200,
  );
  assert.equal(devicesAfterWorkspaceSuspend.devices.some((device) => device.id === "dev_alpha"), false);
  assert.equal(devicesAfterWorkspaceSuspend.devices.some((device) => device.id === "dev_beta"), true);
  await expectStatus(
    "a paired staff member cannot read the device after its workspace membership is suspended",
    doctorAfterWorkspaceSuspend,
    "/api/v1/devices/dev_alpha",
    403,
  );

  const reactivatedDoctorMembership = await expectStatus(
    "legacy portal unlock reactivates only the selected workspace membership",
    workspaceAdmin,
    "/api/portal/staff/usr_doctor/unlock",
    200,
    {
      method: "PATCH",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-alpha-doctor-reactivate",
      },
    },
  );
  assert.equal(reactivatedDoctorMembership.action, "reactivate");
  assert.equal(reactivatedDoctorMembership.membership.status, "active");
  assert.equal(reactivatedDoctorMembership.user.accountStatus, "active");
  const staffAfterReactivate = await expectStatus(
    "reactivated operational doctor returns to the assignable-doctor catalog",
    workspaceAdmin,
    "/api/portal/staff",
    200,
    { headers: portalHeaders },
  );
  assert.equal(
    staffAfterReactivate.doctors.some((member) => member.id === "usr_doctor"),
    true,
  );
  assert.equal(staffAfterReactivate.workspaceId, "org_alpha");
  const doctorAfterWorkspaceReactivate = await login("doctor@alpha.test");
  await expectStatus(
    "reactivating the matching workspace membership restores paired device detail",
    doctorAfterWorkspaceReactivate,
    "/api/v1/devices/dev_alpha",
    200,
  );
  const devicesAfterWorkspaceReactivate = await expectStatus(
    "reactivating the matching workspace membership restores paired device listing",
    doctorAfterWorkspaceReactivate,
    "/api/v1/devices",
    200,
  );
  assert.equal(devicesAfterWorkspaceReactivate.devices.some((device) => device.id === "dev_alpha"), true);

  const revokedDoctorMembership = await expectStatus(
    "workspace admin revokes only the selected workspace membership",
    workspaceAdmin,
    "/api/portal/staff/usr_doctor",
    200,
    {
      method: "DELETE",
      headers: {
        ...portalJsonHeaders,
        "Idempotency-Key": "workspace-alpha-doctor-revoke",
      },
    },
  );
  assert.equal(revokedDoctorMembership.action, "revoke");
  assert.equal(revokedDoctorMembership.revoked, true);
  assert.equal(revokedDoctorMembership.user.accountStatus, "active");
  const staffAfterRevoke = await expectStatus(
    "revoked membership disappears from the selected workspace staff ledger",
    workspaceAdmin,
    "/api/portal/staff",
    200,
    { headers: portalHeaders },
  );
  assert.equal(staffAfterRevoke.staff.some((member) => member.id === "usr_doctor"), false);
  assert.equal(staffAfterRevoke.workspaceId, "org_alpha");

  const doctorAfterWorkspaceRevoke = await login("doctor@alpha.test");
  assert.equal(doctorAfterWorkspaceRevoke.user.accountStatus, "active");
  assert.equal(doctorAfterWorkspaceRevoke.user.memberships.some((item) => item.workspaceId === "org_alpha"), false);
  assert.equal(
    doctorAfterWorkspaceRevoke.user.memberships.find((item) => item.workspaceId === "org_beta")?.operational,
    true,
  );
  const preferencesAfterWorkspaceRevoke = await expectStatus(
    "notification preference ownership binds to the remaining operational workspace",
    doctorAfterWorkspaceRevoke,
    "/api/v1/me/notification-preferences",
    200,
  );
  assert.equal(
    preferencesAfterWorkspaceRevoke.workspaceId,
    "org_beta",
    "the response must not fall back to a revoked legacy organization alias",
  );
  await expectStatus(
    "revoking Alpha membership leaves Beta membership usable",
    doctorAfterWorkspaceRevoke,
    "/api/v1/patients/pat_beta",
    200,
  );
  await expectStatus(
    "revoking Alpha membership removes Alpha access without deleting the account",
    doctorAfterWorkspaceRevoke,
    "/api/v1/patients/pat_alpha",
    403,
  );

  const roleApprovalPath =
    `/api/v1/admin/doctor-requests/${roleRequestReceipt.user.id}/approve`;
  const roleApprovalOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "workspace-role-approval-canonical-target",
    },
    body: JSON.stringify({}),
  };
  const approvedRoleRequest = await expectStatus(
    "platform approves the exact persisted doctor-request target",
    platform,
    roleApprovalPath,
    200,
    roleApprovalOptions,
  );
  assert.equal(approvedRoleRequest.request.role, "doctor");
  assert.equal(approvedRoleRequest.request.roleRequestStatus, "approved");
  assert.equal(
    approvedRoleRequest.request.organizationId,
    roleRequestPayload.organizationId,
  );
  assert.equal(
    approvedRoleRequest.request.currentWorkspaceId,
    roleRequestPayload.organizationId,
  );
  assert.equal(
    approvedRoleRequest.request.currentMembership?.organizationId,
    roleRequestPayload.organizationId,
  );
  assert.equal(approvedRoleRequest.request.currentMembership?.role, "doctor");
  assert.equal(
    approvedRoleRequest.request.memberships.some(
      (membership) =>
        membership.organizationId === roleRequestPayload.organizationId &&
        membership.role === "doctor" &&
        membership.operational === true,
    ),
    true,
    "the approval response must project the membership created by the mutation",
  );
  const replayedApprovedRoleRequest = await expectStatus(
    "the exact doctor approval intent replays without a second mutation",
    platform,
    roleApprovalPath,
    200,
    roleApprovalOptions,
  );
  assert.equal(replayedApprovedRoleRequest.replayed, true);
  assert.equal(
    replayedApprovedRoleRequest.operationId,
    approvedRoleRequest.operationId,
  );
  assert.equal(
    replayedApprovedRoleRequest.request.currentMembership?.organizationId,
    roleRequestPayload.organizationId,
  );

  const persistedDb = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const persistedFamilyMutationReceipts = [
    ["family-dependent-create", "create", false],
    ["family-dependent-update", "update", false],
    ["family-dependent-delete", "delete", true],
  ].map(([key, intent, deleted]) => {
    const entry = persistedDb.idempotencyKeys.find((candidate) => candidate.key === key);
    assert.ok(entry, `${intent} must persist one idempotency receipt`);
    assert.equal(entry.responseResource.userId, "usr_patient");
    assert.equal(entry.responseResource.workspaceId, "org_personal_patient");
    assert.equal(entry.responseResource.patientId, patientCreatedProfile.patient.id);
    assert.equal(entry.responseResource.intent, intent);
    assert.equal(entry.responseResource.replayed, false);
    if (deleted) {
      assert.equal(entry.responseResource.deleted, true);
      assert.equal(Object.hasOwn(entry.responseResource, "patient"), false);
    } else {
      assert.equal(entry.responseResource.patient.id, patientCreatedProfile.patient.id);
      assert.equal(
        entry.responseResource.patient.organizationId,
        "org_personal_patient",
      );
    }
    return entry;
  });
  assert.equal(persistedFamilyMutationReceipts.length, 3);
  assert.equal(
    persistedDb.idempotencyKeys.some((entry) =>
      String(entry.key || "").startsWith("family-authority-denied-"),
    ),
    false,
    "denied family authority mutations must not persist idempotency receipts",
  );
  assert.equal(
    persistedDb.patients.some((item) => item.name === "Authority Race Denied"),
    false,
    "denied family authority mutations must not persist patient writes",
  );
  const persistedWorkspaceDeleteReceipt = persistedDb.idempotencyKeys.find(
    (entry) => entry.key === "doctor-patient-delete-replay-probe-delete",
  );
  assert.ok(persistedWorkspaceDeleteReceipt);
  assert.equal(persistedWorkspaceDeleteReceipt.responseResource.userId, "usr_doctor");
  assert.equal(persistedWorkspaceDeleteReceipt.responseResource.workspaceId, "org_alpha");
  assert.equal(persistedWorkspaceDeleteReceipt.responseResource.intent, "delete");
  assert.equal(persistedWorkspaceDeleteReceipt.responseResource.deleted, true);
  assert.equal(
    persistedDb.idempotencyKeys.some(
      (entry) => entry.key === "workspace-approved-doctor-cross-target",
    ),
    false,
    "a denied approved-doctor target must not create an idempotency receipt",
  );
  assert.equal(
    persistedDb.idempotencyKeys.some(
      (entry) => entry.key === "workspace-pending-role-request-target-drift",
    ),
    false,
    "a denied pending-request workspace switch must not create a receipt",
  );
  assert.equal(
    persistedDb.patients.some(
      (patientRecord) =>
        patientRecord.ownerUserId === roleRequestReceipt.user.id &&
        patientRecord.organizationId === roleRequestPayload.organizationId,
    ),
    false,
    "a pending doctor request must not create a patient profile inside its target clinic",
  );
  assert.equal(
    persistedDb.identityOperations.some(
      (entry) => entry.idempotencyKey === "workspace-role-approval-wrong-target",
    ),
    false,
    "a mismatched approval target must not begin an identity-provider saga",
  );
  assert.equal(
    persistedDb.auditLogs.filter(
      (entry) =>
        entry.action === "doctor.approve" &&
        entry.resourceId === roleRequestReceipt.user.id,
    ).length,
    1,
    "an exact approval replay must not duplicate its audit row",
  );
  const persistedRoleRequestReceipts = persistedDb.idempotencyKeys.filter(
    (entry) =>
      entry.scope === "usr_role_request" &&
      entry.operation === "auth.role.request" &&
      entry.key === "workspace-role-request-owner",
  );
  assert.equal(
    persistedRoleRequestReceipts.length,
    1,
    "role request retry must keep one account-owned receipt",
  );
  assert.equal(
    persistedRoleRequestReceipts[0].responseResource.operationId,
    roleRequestReceipt.operationId,
  );
  assert.deepEqual(
    persistedRoleRequestReceipts[0].responseResource.roleRequest,
    roleRequestReceipt.roleRequest,
  );
  assert.equal(
    persistedDb.auditLogs.filter(
      (entry) =>
        entry.action === "auth.role.request" &&
        entry.resourceId === "usr_role_request",
    ).length,
    1,
    "role request retry must not duplicate its transactional audit row",
  );
  const persistedRoleRequestNotifications = persistedDb.notifications.filter(
    (entry) => entry.id === `noti_${roleRequestReceipt.operationId}`,
  );
  assert.equal(
    persistedRoleRequestNotifications.length,
    1,
    "role request retry must not duplicate its approval notification",
  );
  assert.equal(
    persistedRoleRequestNotifications[0].userId,
    "usr_platform",
    "a pending clinical role request must target an active platform reviewer",
  );
  assert.equal(
    persistedRoleRequestNotifications[0].organizationId || "",
    "",
    "a pending clinical role request must not become a requested-workspace broadcast",
  );
  assert.equal(
    persistedDb.accessLogs.filter(
      (entry) => entry.operationId === roleRequestReceipt.operationId,
    ).length,
    1,
    "role request retry must not duplicate its access ledger event",
  );
  const upgradedAccountReceipt = persistedDb.idempotencyKeys.find(
    (entry) => entry.id === "idem_legacy_account_profile_safe",
  )?.responseResource;
  assertAccountProfileMutationReceipt(upgradedAccountReceipt, {
    userId: "usr_patient",
    changedFields: [],
    replayed: false,
  });
  for (const forbiddenField of [
    "password",
    "firebaseClaims",
    "avatarStorage",
    "twoFactorSecret",
    "twoFactorRecoveryCodes",
  ]) {
    assert.equal(
      Object.hasOwn(upgradedAccountReceipt.user, forbiddenField),
      false,
      `account replay receipt must not persist ${forbiddenField}`,
    );
  }
  const persistedPatientProfileReceipts = persistedDb.idempotencyKeys.filter(
    (entry) =>
      entry.scope === "usr_patient" &&
      entry.operation === "account.profile.update" &&
      entry.key === "patient-account-profile",
  );
  assert.equal(
    persistedPatientProfileReceipts.length,
    1,
    "an exact profile retry must persist one owner-scoped idempotency receipt",
  );
  assertAccountProfileMutationReceipt(
    persistedPatientProfileReceipts[0].responseResource,
    {
      userId: "usr_patient",
      changedFields: Object.keys(patientProfilePayload),
      replayed: false,
    },
  );
  assert.equal(
    persistedDb.auditLogs.filter(
      (entry) =>
        entry.action === "account.profile.update" &&
        entry.actorUserId === "usr_patient" &&
        entry.resourceId === "usr_patient",
    ).length,
    1,
    "an exact profile retry must commit one account audit row",
  );
  const persistedDoctor = persistedDb.users.find((item) => item.id === "usr_doctor");
  assert.ok(persistedDoctor, "workspace membership revoke must not delete the global account");
  assert.equal(persistedDoctor.accountStatus, "active");
  assert.equal(
    persistedDb.memberships.some((item) => item.userId === "usr_doctor" && item.organizationId === "org_alpha"),
    false,
  );
  assert.equal(
    persistedDb.memberships.some((item) => item.userId === "usr_doctor" && item.organizationId === "org_beta"),
    true,
  );
  assert.equal(
    (persistedDb.identityOperations || []).some(
      (operation) =>
        operation.targetUserId === "usr_doctor" &&
        ["lock", "unlock", "delete"].includes(operation.operation),
    ),
    false,
    "workspace membership actions must not start a global identity-provider saga",
  );
  assert.equal(
    persistedDb.memberships.find(
      (item) => item.userId === "usr_workspace_owner" && item.organizationId === "org_alpha",
    )?.status || "active",
    "active",
    "last-owner guard must leave the owner membership active",
  );
  for (const action of [
    "workspace.membership.suspend",
    "workspace.membership.reactivate",
    "workspace.membership.revoke",
  ]) {
    assert.equal(
      persistedDb.auditLogs.filter((entry) => entry.action === action && entry.resourceId === "mem_usr_doctor").length,
      1,
      `${action} must commit exactly one audit record`,
    );
  }
  assert.equal(
    persistedDb.auditLogs.filter(
      (entry) => entry.action === "patient.consent.grant" && entry.resourceId === "pat_patient_child",
    ).length,
    1,
    "patient share mutation and audit must commit once through the repository transaction",
  );
  assert.equal(
    persistedDb.auditLogs.filter(
      (entry) => entry.action === "patient.consent.revoke" && entry.resourceId === patientShare.share.id,
    ).length,
    1,
    "patient share revoke must not append a second server-side audit record",
  );
  assert.equal(
    persistedDb.auditLogs.filter(
      (entry) =>
        entry.action === "workspace.settings.update" &&
        entry.actorUserId === "usr_workspace_admin" &&
        entry.organizationId === "org_alpha" &&
        entry.resourceId === "org_alpha",
    ).length,
    1,
    "workspace settings mutation, exact retry and legacy alias replay must commit one audit row",
  );
  assert.equal(
    persistedDb.idempotencyKeys.filter(
      (entry) =>
        entry.scope === "usr_workspace_admin:org_alpha" &&
        entry.operation === "workspace.settings.update" &&
        entry.key === "workspace-settings-alpha-v1",
    ).length,
    1,
    "workspace settings must persist one owner/workspace-scoped replay receipt",
  );
  const expectedIdentityAuditActions = [
    "account.profile.update",
    "notification.preferences.patch",
    "workspace.switch",
    "profile.active.switch",
    "patient.update",
    "patient.delete",
    "auth.session.revoke",
  ];
  for (const action of expectedIdentityAuditActions) {
    assert.ok(
      persistedDb.auditLogs.some((log) => log.action === action),
      `expected persisted audit action ${action}`,
    );
  }
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
      PASSWORD_IDEMPOTENCY_HMAC_KEY: passwordIdempotencyTestKey,
      RATE_LIMIT_PER_MINUTE: "5000",
      FIREBASE_AUTH_ENABLED: "false",
      BREVO_API_KEY: "",
      BREVO_FROM_EMAIL: "",
      SMTP_HOST: "",
      SMTP_PORT: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      SMTP_FROM: "",
      WEB_PORTAL_URL: "",
      SHCARE_WEB_URL: "",
      SMART_HEALTH_WEB_URL: "",
      PUBLIC_SITE_URL: "",
      VITE_PUBLIC_SITE_URL: "",
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
