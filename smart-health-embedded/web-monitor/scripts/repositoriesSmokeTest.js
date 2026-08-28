const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createRepositories } = require("../src/repositories");
const {
  createPasswordIdempotencyFingerprint,
  serializePasswordFingerprintInput,
} = require("../src/passwordChangeSecurity");
const {
  isPasswordHash,
  verifyPasswordSecret,
} = require("../src/passwordHash");
const {
  EXPORT_ARTIFACT_RENDERER_VERSION,
  buildExportArtifact,
} = require("../src/exportArtifact");

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
  doctorPatientAccess: [{ id: "share_stale", patientId: "patient_stale", doctorUserId: "user_stale" }],
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
  organizations: [
    {
      id: "org_portal",
      name: "SQL name",
      type: "clinic",
      workspace_type: "clinic",
      address: "99 SQL Billing Road",
      phone: "0281111222",
      email: "billing@sql.test",
      website: "https://billing.sql.test",
      status: "active",
      legal_name: "SQL Legal Clinic",
      representative: "SQL Representative",
      owner_user_id: "user_portal",
      package_id: "pkg_sql_growth",
      subscription_status: "active",
      billing_cycle: "annual",
      request_metadata: { seats: 12 },
    },
  ],
  users: [
    {
      id: "user_portal",
      email: "doctor@example.com",
      role: "doctor",
      name: "Doctor",
      organization_id: "org_portal",
      account_status: "active",
      requested_role: "doctor",
      role_request_status: "approved",
      role_approved_at: "2026-06-21T00:00:00.000Z",
    },
  ],
  memberships: [],
  patients: [],
  doctor_patient_access: [
    {
      id: "share_sql",
      doctor_user_id: "user_portal",
      doctor_id: "user_portal",
      patient_id: "patient_sql",
      organization_id: "org_portal",
      access_level: "read",
      scope: "selected_scans",
      scan_ids: ["scan_sql"],
      granted_by_user_id: "user_portal",
      expires_at: null,
      revoked_at: null,
      revoked_by_user_id: null,
      created_at: "2026-06-21T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
    },
  ],
  devices: [{
    id: "device_portal",
    name: "SH-01",
    type: "stethoscope",
    status: "active",
    assigned_patient_id: "patient_portal",
  }],
  scan_sessions: [],
  audio_files: [],
  ai_results: [],
  device_events: [],
  notification_devices: [],
  notifications: [],
  audit_logs: [],
};

const guardChecks = {
  organizationBillingFields: false,
  organizationOwnerFk: false,
  userPatientFk: false,
  patientOwnerFk: false,
  patientEmptyBloodTypeNull: false,
  deviceOwnershipColumns: false,
  patientShareScanIds: false,
  scanPageTenantScope: false,
  scanPageLiteralSearch: false,
  notificationTokenGlobalConflict: false,
  aiResultLatestQuery: false,
  accountProfilePartialUpdate: false,
};

const pool = {
  async query(sql, params = []) {
    const text = String(sql);
    if (text.includes("FROM ai_results") && text.includes("WHERE scan_id = $1")) {
      guardChecks.aiResultLatestQuery =
        text.includes("ORDER BY updated_at DESC, created_at DESC, id DESC") &&
        text.includes("LIMIT 1");
      return {
        rows: rows.ai_results
          .filter((item) => item.scan_id === params[0])
          .sort((left, right) =>
            String(right.updated_at || right.created_at || "").localeCompare(
              String(left.updated_at || left.created_at || ""),
            ) || String(right.id || "").localeCompare(String(left.id || "")))
          .slice(0, 1),
      };
    }
    if (text.includes("INSERT INTO notification_devices")) {
      guardChecks.notificationTokenGlobalConflict =
        text.includes("ON CONFLICT (fcm_token)") &&
        text.includes("user_id = EXCLUDED.user_id") &&
        text.includes("workspace_id = EXCLUDED.workspace_id") &&
        text.includes("auth_session_id = EXCLUDED.auth_session_id") &&
        text.includes("notification_protocol_version = EXCLUDED.notification_protocol_version") &&
        text.includes("RETURNING *");
      const existing = rows.notification_devices.find((item) => item.fcm_token === params[4]);
      const row = existing || {
        id: params[0],
        created_at: params[9] || "2026-06-21T00:00:00.000Z",
      };
      row.user_id = params[1];
      row.workspace_id = params[2];
      row.platform = params[3];
      row.fcm_token = params[4];
      row.auth_session_id = params[5];
      row.notification_protocol_version = params[6];
      row.app_version = params[7];
      row.enabled = params[8];
      row.updated_at = params[10] || "2026-06-21T00:00:00.000Z";
      if (!existing) rows.notification_devices.push(row);
      return { rowCount: 1, rows: [row] };
    }
    if (text.includes("SELECT * FROM notification_devices")) {
      return {
        rows: rows.notification_devices.filter(
          (item) =>
            item.user_id === params[0] &&
            item.workspace_id === params[1] &&
            Number(item.notification_protocol_version || 0) >= Number(params[2] || 2) &&
            item.enabled !== false,
        ),
      };
    }
    if (text.includes("UPDATE notification_devices") && text.includes("WHERE user_id = $1")) {
      const row = rows.notification_devices.find(
        (item) =>
          item.user_id === params[0] &&
          item.fcm_token === params[1] &&
          (!params[2] || item.workspace_id === params[2]) &&
          (!params[3] || item.auth_session_id === params[3]) &&
          item.enabled !== false,
      );
      if (!row) return { rowCount: 0, rows: [] };
      row.enabled = false;
      row.updated_at = "2026-06-21T00:00:00.000Z";
      return { rowCount: 1, rows: [row] };
    }
    if (text.includes("WITH filtered AS") && text.includes("FROM scan_sessions scan")) {
      guardChecks.scanPageTenantScope =
        text.includes("scan.organization_id = $1") &&
        text.includes("scan.patient_id = ANY($2::text[])") &&
        text.includes("scan.id = ANY($3::text[])");
      guardChecks.scanPageLiteralSearch =
        text.includes("strpos(lower(concat_ws") &&
        !text.includes(" ILIKE ");
      assert.deepEqual(params.slice(0, 4), [
        "org_portal",
        ["patient_sql"],
        ["scan_shared"],
        "patient sql",
      ]);
      return {
        rows: [{
          total: 1,
          items: [{
            id: "scan_sql_page",
            organization_id: "org_portal",
            patient_id: "patient_sql",
            patient_name: "Patient SQL",
            device_id: "device_portal",
            status: "completed",
            processing_status: "completed",
            mode: "heart",
            created_at: "2026-06-21T00:00:00.000Z",
            updated_at: "2026-06-21T00:00:00.000Z",
          }],
        }],
      };
    }
    if (
      text.includes("UPDATE users") &&
      text.includes("jsonb_set") &&
      text.includes("WHERE id = $1 OR firebase_uid = $1")
    ) {
      const target = rows.users.find(
        (item) =>
          item.id === params[0] ||
          item.firebase_uid === params[0] ||
          String(item.email || "").toLowerCase() === String(params[0] || "").toLowerCase(),
      );
      if (!target) return { rows: [] };
      guardChecks.accountProfilePartialUpdate =
        text.includes("name = CASE WHEN $2::boolean THEN $3 ELSE users.name END") &&
        text.includes("phone = CASE WHEN $4::boolean THEN $5 ELSE users.phone END") &&
        text.includes("license = CASE WHEN $6::boolean THEN $7 ELSE users.license END") &&
        text.includes("hospital = CASE WHEN $8::boolean THEN $9 ELSE users.hospital END") &&
        text.includes("department = CASE WHEN $10::boolean THEN $11 ELSE users.department END") &&
        text.includes("address = CASE WHEN $12::boolean THEN $13 ELSE users.address END") &&
        text.includes("organization_id = CASE WHEN $14::boolean THEN $15 ELSE users.organization_id END");
      const profilePatch = JSON.parse(params[15] || "{}");
      if (params[1]) target.name = params[2];
      if (params[3]) target.phone = params[4];
      if (params[5]) target.license = params[6];
      if (params[7]) target.hospital = params[8];
      if (params[9]) target.department = params[10];
      if (params[11]) target.address = params[12];
      if (params[13]) target.organization_id = params[14];
      target.firebase_claims = {
        ...(target.firebase_claims || {}),
        profile: {
          ...((target.firebase_claims || {}).profile || {}),
          ...profilePatch,
        },
      };
      return { rows: [target] };
    }
    if (text.includes("INSERT INTO users")) {
      guardChecks.userPatientFk =
        text.includes("EXISTS (SELECT 1 FROM patients WHERE id = $13)") ||
        text.includes("EXISTS (SELECT 1 FROM patients WHERE id = $13::text)");
    }
    if (text.includes("INSERT INTO organizations")) {
      guardChecks.organizationBillingFields =
        text.includes("workspace_type") &&
        text.includes("package_id") &&
        text.includes("subscription_status") &&
        text.includes("billing_cycle") &&
        text.includes("request_metadata");
      guardChecks.organizationOwnerFk =
        text.includes("EXISTS (SELECT 1 FROM users WHERE id = $12)") ||
        text.includes("EXISTS (SELECT 1 FROM users WHERE id = $12::text)");
    }
    if (text.includes("INSERT INTO patients")) {
      guardChecks.patientOwnerFk =
        text.includes("EXISTS (SELECT 1 FROM users WHERE id = $3)") ||
        text.includes("EXISTS (SELECT 1 FROM users WHERE id = $3::text)");
      guardChecks.patientEmptyBloodTypeNull = params[7] === null;
    }
    if (text.includes("INSERT INTO devices")) {
      guardChecks.deviceOwnershipColumns =
        text.includes("paired_user_id") &&
        text.includes("ownership_state") &&
        text.includes("owner_user_id") &&
        text.includes("assigned_patient_id") &&
        text.includes("devices.paired_user_id") &&
        text.includes("devices.ownership_state");
    }
    if (text.includes("INSERT INTO doctor_patient_access")) {
      guardChecks.patientShareScanIds =
        text.includes("scan_ids") &&
        text.includes("$1, $2, $2, $3");
      return {
        rows: [{
          id: params[0],
          doctor_user_id: params[1],
          doctor_id: params[1],
          patient_id: params[2],
          organization_id: params[3],
          access_level: params[4],
          scope: params[5],
          scan_ids: JSON.parse(params[6] || "[]"),
          granted_by_user_id: params[7],
          authority_type: params[8],
          purpose: params[9],
          consented_at: params[10],
          expires_at: params[11],
          revoked_at: params[12],
          revoked_by_user_id: params[13],
          created_at: params[14],
          updated_at: params[15],
        }],
      };
    }
    if (
      text.includes("FROM doctor_patient_access") &&
      text.includes("doctor_user_id IS NOT DISTINCT FROM")
    ) {
      return { rows: [] };
    }
    const match = text.match(/FROM\s+([a-z_]+)/i);
    if (match && match[1] === "doctor_patient_access" && text.includes("WHERE id = $1")) {
      return {
        rows: rows.doctor_patient_access.filter(
          (item) => item.id === params[0] && item.patient_id === params[1],
        ),
      };
    }
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

  const scanPage = await repositories.scans.listPage({
    organizationId: "org_portal",
    authorizedPatientIds: ["patient_sql"],
    authorizedScanIds: ["scan_shared"],
    q: "Patient SQL",
    page: 2,
    limit: 25,
    sort: "createdAt:desc",
  });
  assert.equal(scanPage.total, 1);
  assert.equal(scanPage.page, 2);
  assert.equal(scanPage.items[0].id, "scan_sql_page");
  assert.equal(scanPage.items[0].patientName, "Patient SQL");
  assert.equal(guardChecks.scanPageTenantScope, true);
  assert.equal(guardChecks.scanPageLiteralSearch, true);

  await repositories.hydrateCoreState();

  assert.equal(db.organizations[0].name, "SQL name");
  assert.equal(db.organizations[0].address, "99 SQL Billing Road");
  assert.equal(db.organizations[0].ownerUserId, "user_portal");
  assert.equal(db.organizations[0].workspaceType, "clinic");
  assert.equal(db.organizations[0].phone, "0281111222");
  assert.equal(db.organizations[0].email, "billing@sql.test");
  assert.equal(db.organizations[0].website, "https://billing.sql.test");
  assert.equal(db.organizations[0].legalName, "SQL Legal Clinic");
  assert.equal(db.organizations[0].representative, "SQL Representative");
  assert.equal(db.organizations[0].packageId, "pkg_sql_growth");
  assert.equal(db.organizations[0].subscriptionStatus, "active");
  assert.equal(db.organizations[0].billingCycle, "annual");
  assert.deepEqual(db.organizations[0].requestMetadata, { seats: 12 });
  assert.equal(db.users[0].email, "doctor@example.com");
  assert.equal(db.users[0].roleRequestDocuments[0].id, "doctor_doc_1");
  assert.equal(
    await repositories.users.findByFirebaseUid("doctor@example.com"),
    null,
    "Firebase UID lookup must never fall through to a matching email",
  );
  assert.equal(
    await repositories.users.findByIdOrFirebaseUid("doctor@example.com"),
    null,
    "ID or Firebase UID lookup must never fall through to a matching email",
  );
  assert.equal((await repositories.users.findByFirebaseUid("user_portal")).id, "user_portal");
  assert.equal((await repositories.users.findByIdOrFirebaseUid("user_portal")).id, "user_portal");
  assert.equal((await repositories.users.findByEmail("doctor@example.com")).id, "user_portal");
  db.memberships.push({
    id: "membership_stale_admin",
    userId: "user_portal",
    organizationId: "org_portal",
    role: "workspace_admin",
  });
  rows.memberships = [{
    id: "membership_canonical_viewer",
    user_id: "user_portal",
    organization_id: "org_portal",
    role: "viewer",
    created_at: "2026-06-21T00:00:00.000Z",
  }];
  const canonicalMemberships = await repositories.memberships.listForUser("user_portal");
  assert.deepEqual(canonicalMemberships.map((membership) => membership.role), ["viewer"]);
  assert.equal(
    db.memberships.some((membership) => membership.id === "membership_stale_admin"),
    false,
    "canonical SQL membership reads must replace stale elevated runtime roles",
  );
  const secondInstanceDb = {
    memberships: [
      {
        id: "membership_second_instance_stale",
        userId: "user_portal",
        organizationId: "org_portal",
        role: "billing",
      },
    ],
  };
  const secondInstanceRepositories = createRepositories({
    getDb: () => secondInstanceDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_second_instance`,
    nowIso: () => "2026-06-21T00:00:00.000Z",
    getPool: () => pool,
  });
  assert.deepEqual(
    (await secondInstanceRepositories.memberships.listForUser("user_portal")).map((membership) => membership.role),
    ["viewer"],
    "a second backend instance must read the shared SQL role instead of its local stale grant",
  );
  rows.memberships = [];
  assert.deepEqual(await repositories.memberships.listForUser("user_portal"), []);
  assert.deepEqual(await secondInstanceRepositories.memberships.listForUser("user_portal"), []);
  assert.equal(
    db.memberships.some((membership) => membership.userId === "user_portal"),
    false,
    "a cross-instance membership revoke must remove the stale runtime grant on the next read",
  );
  assert.equal(secondInstanceDb.memberships.length, 0);
  assert.deepEqual(db.patients, []);
  assert.deepEqual(db.scans, []);
  rows.ai_results = [
    {
      id: "ai_waveform_old",
      scan_id: "scan_waveform_contract",
      model_version: "signal-quality-v1",
      label: "old",
      raw_result: { waveformObjectKey: "old-waveform.json" },
      status: "completed",
      created_at: "2026-07-27T04:00:00.000Z",
      updated_at: "2026-07-27T04:00:00.000Z",
    },
    {
      id: "ai_waveform_latest",
      scan_id: "scan_waveform_contract",
      model_version: "signal-quality-v1",
      label: "latest",
      raw_result: { waveformObjectKey: "waveform.json" },
      status: "completed",
      created_at: "2026-07-27T05:00:00.000Z",
      updated_at: "2026-07-27T05:30:00.000Z",
    },
  ];
  const latestAiResult = await repositories.aiResults.findByScanId(
    "scan_waveform_contract",
  );
  assert.equal(latestAiResult.id, "ai_waveform_latest");
  assert.equal(latestAiResult.rawResult.waveformObjectKey, "waveform.json");
  assert.equal(guardChecks.aiResultLatestQuery, true);
  rows.ai_results = [];
  assert.equal(db.doctorPatientAccess.length, 1);
  assert.equal(db.doctorPatientAccess[0].id, "share_sql");
  assert.deepEqual(db.doctorPatientAccess[0].scanIds, ["scan_sql"]);
  await repositories.notificationDevices.register({
    userId: "user_portal",
    workspaceId: "org_portal",
    platform: "android",
    fcmToken: "shared-fcm-token",
    authSessionId: "auth_session_portal",
    notificationProtocolVersion: 2,
    appVersion: "1.0.0-rc.2",
  });
  const reboundNotificationDevice = await repositories.notificationDevices.register({
    userId: "user_second",
    workspaceId: "org_second",
    platform: "android",
    fcmToken: "shared-fcm-token",
    authSessionId: "auth_session_second",
    notificationProtocolVersion: 3,
    appVersion: "1.1.0",
  });
  assert.equal(guardChecks.notificationTokenGlobalConflict, true);
  assert.equal(reboundNotificationDevice.userId, "user_second");
  assert.equal(reboundNotificationDevice.workspaceId, "org_second");
  assert.equal(reboundNotificationDevice.authSessionId, "auth_session_second");
  assert.equal(reboundNotificationDevice.notificationProtocolVersion, 3);
  assert.equal(reboundNotificationDevice.appVersion, "1.1.0");
  assert.equal(rows.notification_devices.length, 1);
  assert.equal(rows.notification_devices[0].user_id, "user_second");
  assert.equal(rows.notification_devices[0].workspace_id, "org_second");
  assert.equal(rows.notification_devices[0].auth_session_id, "auth_session_second");
  assert.equal(db.notificationDevices.length, 1);
  assert.equal(db.notificationDevices[0].userId, "user_second");
  assert.deepEqual(
    await repositories.notificationDevices.listForUser("user_portal", "org_portal"),
    [],
    "the former user and workspace binding must become ineligible after token reassignment",
  );
  assert.deepEqual(
    (await repositories.notificationDevices.listForUser("user_second", "org_second")).map(
      (device) => device.id,
    ),
    [reboundNotificationDevice.id],
  );
  assert.equal(
    await repositories.notificationDevices.disableToken("user_portal", "shared-fcm-token"),
    null,
    "the previous token owner must not disable a rebound device",
  );
  assert.equal(
    await repositories.notificationDevices.disableToken(
      "user_second",
      "shared-fcm-token",
      { workspaceId: "org_portal", authSessionId: "auth_session_second" },
    ),
    null,
    "a stale workspace binding must not disable the current token",
  );
  assert.equal(
    await repositories.notificationDevices.disableToken(
      "user_second",
      "shared-fcm-token",
      { workspaceId: "org_second", authSessionId: "auth_session_portal" },
    ),
    null,
    "a stale auth session must not disable the current token",
  );
  const disabledNotificationDevice = await repositories.notificationDevices.disableToken(
    "user_second",
    "shared-fcm-token",
    { workspaceId: "org_second", authSessionId: "auth_session_second" },
  );
  assert.equal(disabledNotificationDevice.enabled, false);
  assert.equal(db.devices[0].status, "active");
  assert.equal(db.devices[0].assignedPatientId, "patient_portal");

  await repositories.users.save({
    id: "user_stale_patient",
    email: "stale-patient@example.com",
    role: "patient",
    name: "Stale Patient User",
    patientId: "missing_patient",
  });
  await repositories.users.save({
    id: "user_runtime_doctor",
    email: "runtime-doctor@example.com",
    role: "doctor",
    requestedRole: "doctor",
    roleRequestStatus: "approved",
    roleApprovedAt: "2026-06-21T00:00:01.000Z",
    accountStatus: "active",
    name: "Runtime Doctor",
  });
  const approvedDoctors = await repositories.users.listApprovedDoctors();
  assert.equal(approvedDoctors.some((doctor) => doctor.id === "user_portal"), true);
  assert.equal(approvedDoctors.some((doctor) => doctor.id === "user_runtime_doctor"), true);
  const approvedDoctorRequests = await repositories.users.listDoctorRequests("approved");
  assert.equal(approvedDoctorRequests.some((doctor) => doctor.id === "user_portal"), true);
  assert.equal(approvedDoctorRequests.some((doctor) => doctor.id === "user_runtime_doctor"), true);
  const accountProfile = await repositories.users.updateAccountProfile("user_portal", {
    name: "Updated Portal User",
    title: "Operations Director",
    phone: "0901111222",
    license: "LIC-PORTAL",
    hospital: "SQL Hospital",
    department: "Remote Care",
    specialty: "Cardiology",
    address: "1 SQL Street",
    notificationPreferences: { messages: false, aiUpdates: true },
  });
  assert.equal(accountProfile.name, "Updated Portal User");
  assert.equal(accountProfile.title, "Operations Director");
  assert.equal(accountProfile.department, "Remote Care");
  assert.equal(accountProfile.specialty, "Cardiology");
  assert.equal(accountProfile.notificationPreferences.messages, false);
  assert.equal(accountProfile.notificationPreferences.aiUpdates, true);
  const partialAccountProfile = await repositories.users.updateAccountProfile(
    "user_portal",
    { phone: "0909999888" },
  );
  assert.equal(partialAccountProfile.phone, "0909999888");
  assert.equal(
    partialAccountProfile.name,
    "Updated Portal User",
    "PostgreSQL partial account profile updates must preserve an omitted name",
  );
  assert.equal(
    partialAccountProfile.license,
    "LIC-PORTAL",
    "PostgreSQL partial account profile updates must preserve an omitted license",
  );
  assert.equal(
    partialAccountProfile.hospital,
    "SQL Hospital",
    "PostgreSQL partial account profile updates must preserve an omitted hospital",
  );
  assert.equal(
    partialAccountProfile.department,
    "Remote Care",
    "PostgreSQL partial account profile updates must preserve an omitted department",
  );
  assert.equal(
    partialAccountProfile.address,
    "1 SQL Street",
    "PostgreSQL partial account profile updates must preserve an omitted address",
  );
  assert.equal(partialAccountProfile.title, "Operations Director");
  assert.equal(partialAccountProfile.specialty, "Cardiology");
  assert.equal(partialAccountProfile.notificationPreferences.messages, false);
  assert.equal(
    guardChecks.accountProfilePartialUpdate,
    true,
    "PostgreSQL account profile query must gate every mutable column by field presence",
  );
  await repositories.organizations.upsert({
    id: "org_repo_upsert",
    name: "Repository Upsert Clinic",
    type: "clinic",
    workspaceType: "clinic",
    address: "2 Repository Street",
    phone: "0282222333",
    email: "repo-billing@sql.test",
    website: "https://repo-billing.sql.test",
    status: "active",
    legalName: "Repository Legal Clinic",
    representative: "Repository Representative",
    ownerUserId: "missing_owner",
    packageId: "pkg_repo",
    subscriptionStatus: "trial",
    billingCycle: "monthly",
    requestMetadata: { source: "smoke" },
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
  db.memberships.push({
    id: "membership_share_doctor",
    userId: "user_portal",
    organizationId: "org_portal",
    role: "doctor",
  });
  const share = await repositories.patientShares.save({
    id: "share_repo",
    patientId: "patient_sql",
    doctorUserId: "user_portal",
    doctorId: "user_portal",
    scope: "selected_scans",
    scanIds: ["scan_sql"],
    grantedByUserId: "user_portal",
  });
  const runtimeFallbackShares = await repositories.patientShares.listForPatient("patient_sql");
  assert.equal(
    runtimeFallbackShares.some((item) => item.id === "share_repo"),
    false,
    "canonical SQL patient-share reads must not resurrect a runtime-only grant",
  );
  rows.doctor_patient_access.unshift({
    id: share.id,
    doctor_user_id: share.doctorUserId,
    doctor_id: share.doctorId,
    patient_id: share.patientId,
    organization_id: "",
    access_level: "read",
    scope: share.scope,
    scan_ids: share.scanIds,
    granted_by_user_id: share.grantedByUserId,
    authority_type: share.authorityType,
    purpose: share.purpose,
    consented_at: share.consentedAt || null,
    expires_at: null,
    revoked_at: null,
    revoked_by_user_id: null,
    created_at: share.createdAt,
    updated_at: share.updatedAt,
  });
  assert.deepEqual(share.scanIds, ["scan_sql"]);
  const revoked = await repositories.patientShares.revoke("patient_sql", "share_repo", "user_portal");
  assert.equal(Boolean(revoked.revokedAt), true);
  assert.equal(revoked.revokedByUserId, "user_portal");
  rows.patients = [{ id: "patient_sql", patient_code: "SQL-1", name: "SQL Patient" }];
  const listedPatients = await repositories.patients.list();
  assert.equal(listedPatients.some((patient) => patient.id === "patient_sql"), true);
  assert.equal(
    listedPatients.some((patient) => patient.id === "patient_stale_owner"),
    false,
    "SQL patient reads must not resurrect stale runtime PHI",
  );
  const listedDevices = await repositories.devices.list();
  assert.equal(listedDevices.some((device) => device.id === "device_portal"), true);
  assert.equal(listedDevices.some((device) => device.id === "device_stale_user"), true);
  assert.equal(guardChecks.organizationBillingFields, true);
  assert.equal(guardChecks.organizationOwnerFk, true);
  assert.equal(guardChecks.userPatientFk, true);
  assert.equal(guardChecks.patientOwnerFk, true);
  assert.equal(
    guardChecks.patientEmptyBloodTypeNull,
    true,
    "PostgreSQL patient writes must persist an unspecified blood type as NULL",
  );
  assert.equal(guardChecks.deviceOwnershipColumns, true);
  assert.equal(guardChecks.patientShareScanIds, true);

  const duplicateSessionDb = {
    sessions: [],
    authSessions: [
      {
        id: "auth_session_a",
        userId: "user_session_owner",
        provider: "firebase",
        sessionKey: "stable_firebase_binding",
        createdAt: "2026-06-21T00:00:00.000Z",
        lastSeenAt: "2026-06-21T00:00:00.000Z",
        revokedAt: null,
      },
      {
        id: "auth_session_b",
        userId: "user_session_owner",
        provider: "firebase",
        sessionKey: "stable_firebase_binding",
        createdAt: "2026-06-21T00:00:01.000Z",
        lastSeenAt: "2026-06-21T00:00:01.000Z",
        revokedAt: null,
      },
    ],
    auditLogs: [],
  };
  let duplicateSessionId = 0;
  const duplicateSessionRepositories = createRepositories({
    getDb: () => duplicateSessionDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_${++duplicateSessionId}`,
    nowIso: () => "2026-06-21T00:10:00.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    () => duplicateSessionRepositories.authSessions.revokeForUser(
      "user_session_owner",
      "auth_session_b",
      { action: "auth.session.revoke" },
      {
        scope: "user_session_owner",
        operation: "auth.session.revoke",
        key: "x".repeat(161),
        fingerprint: "auth_session_b",
      },
    ),
    (error) => error && error.code === "IDEMPOTENCY_KEY_TOO_LONG" && error.statusCode === 400,
  );
  assert.equal(
    duplicateSessionDb.authSessions.every((session) => !session.revokedAt),
    true,
    "an overlong idempotency key must be rejected before the session binding is mutated",
  );
  assert.equal(duplicateSessionDb.auditLogs.length, 0);
  assert.equal(
    await duplicateSessionRepositories.authSessions.isActiveForUser("user_session_owner", "auth_session_a"),
    true,
  );
  assert.equal((await duplicateSessionRepositories.authSessions.listForUser("user_session_owner")).length, 1);
  await assert.rejects(
    () => duplicateSessionRepositories.authSessions.revokeForUser(
      "user_session_owner",
      "auth_session_b",
      { action: "auth.session.revoke" },
      {
        scope: "user_session_owner",
        operation: "auth.session.revoke",
        key: "auth-session-current-alias-denial",
        fingerprint: "auth_session_b",
      },
      {
        id: "auth_session_a",
        sessionKey: "stable_firebase_binding",
      },
    ),
    (error) => error && error.code === "AUTH_SESSION_CURRENT" && error.statusCode === 409,
  );
  assert.equal(
    duplicateSessionDb.authSessions.every((session) => !session.revokedAt),
    true,
    "a duplicate Firebase row for the current binding must not be revoked",
  );
  assert.equal(duplicateSessionDb.auditLogs.length, 0);
  assert.equal((duplicateSessionDb.idempotencyKeys || []).length, 0);
  const duplicateRevocation = await duplicateSessionRepositories.authSessions.revokeForUser(
    "user_session_owner",
    "auth_session_b",
    {
      action: "auth.session.revoke",
      metadata: { operationId: "auth_session_revoke_operation_001" },
    },
    {
      scope: "user_session_owner",
      operation: "auth.session.revoke",
      key: "auth-session-revoke-key-001",
      fingerprint: "auth_session_b",
    },
  );
  assert.equal(Boolean(duplicateRevocation.session.revokedAt), true);
  assert.equal(duplicateRevocation.replayed, false);
  assert.equal(duplicateSessionDb.authSessions.every((session) => Boolean(session.revokedAt)), true);
  assert.equal(duplicateSessionDb.auditLogs.length, 1);
  assert.equal(duplicateSessionDb.auditLogs[0].action, "auth.session.revoke");
  assert.equal(
    duplicateSessionDb.auditLogs[0].metadata.operationId,
    "auth_session_revoke_operation_001",
  );
  assert.equal(
    await duplicateSessionRepositories.authSessions.isActiveForUser("user_session_owner", "auth_session_a"),
    false,
  );
  assert.equal((await duplicateSessionRepositories.authSessions.listForUser("user_session_owner")).length, 0);
  const duplicateTombstone = await duplicateSessionRepositories.authSessions.resolveFirebaseSession({
    id: "auth_session_c",
    userId: "user_session_owner",
    provider: "firebase",
    sessionKey: "stable_firebase_binding",
    createdAt: "2026-06-21T00:11:00.000Z",
    lastSeenAt: "2026-06-21T00:11:00.000Z",
    revokedAt: null,
  });
  assert.equal(Boolean(duplicateTombstone.revokedAt), true, "a revoked duplicate binding must fail closed");
  const duplicateReplay = await duplicateSessionRepositories.authSessions.revokeForUser(
    "user_session_owner",
    "auth_session_b",
    {
      action: "auth.session.revoke",
      metadata: { operationId: "auth_session_revoke_operation_001" },
    },
    {
      scope: "user_session_owner",
      operation: "auth.session.revoke",
      key: "auth-session-revoke-key-001",
      fingerprint: "auth_session_b",
    },
  );
  assert.equal(duplicateReplay.replayed, true);
  assert.equal(duplicateReplay.session.revokedAt, duplicateRevocation.session.revokedAt);
  assert.equal(duplicateSessionDb.auditLogs.length, 1, "an exact replay must not append another audit row");
  const duplicateFreshKeyAfterRevocation = await duplicateSessionRepositories.authSessions.revokeForUser(
    "user_session_owner",
    "auth_session_b",
    {
      action: "auth.session.revoke",
      metadata: { operationId: "auth_session_revoke_operation_003" },
    },
    {
      scope: "user_session_owner",
      operation: "auth.session.revoke",
      key: "auth-session-revoke-key-002",
      fingerprint: "auth_session_b",
    },
  );
  assert.equal(
    duplicateFreshKeyAfterRevocation.replayed,
    false,
    "a fresh key against an already-revoked session is an idempotent no-op, not a replay",
  );
  assert.equal(duplicateFreshKeyAfterRevocation.session.revokedAt, duplicateRevocation.session.revokedAt);
  assert.equal(duplicateSessionDb.auditLogs.length, 1, "a fresh-key no-op must not append another audit row");

  duplicateSessionDb.authSessions.push({
    id: "auth_session_other_target",
    userId: "user_session_owner",
    provider: "firebase",
    sessionKey: "other_stable_firebase_binding",
    createdAt: "2026-06-21T00:12:00.000Z",
    lastSeenAt: "2026-06-21T00:12:00.000Z",
    revokedAt: null,
  });
  await assert.rejects(
    () => duplicateSessionRepositories.authSessions.revokeForUser(
      "user_session_owner",
      "auth_session_other_target",
      {
        action: "auth.session.revoke",
        metadata: { operationId: "auth_session_revoke_operation_002" },
      },
      {
        scope: "user_session_owner",
        operation: "auth.session.revoke",
        key: "auth-session-revoke-key-001",
        fingerprint: "auth_session_other_target",
      },
    ),
    (error) => error && error.code === "IDEMPOTENCY_KEY_REUSED" && error.statusCode === 409,
  );
  assert.equal(
    duplicateSessionDb.authSessions.find((session) => session.id === "auth_session_other_target").revokedAt,
    null,
    "key reuse with a different target must not mutate that session",
  );
  assert.equal(
    await duplicateSessionRepositories.authSessions.revokeForUser(
      "foreign_user",
      "auth_session_other_target",
      { action: "auth.session.revoke" },
      {
        scope: "foreign_user",
        operation: "auth.session.revoke",
        key: "auth-session-revoke-key-001",
        fingerprint: "auth_session_other_target",
      },
    ),
    null,
    "cross-account lookup must remain indistinguishable from a missing session",
  );

  const failingSessionDb = {
    sessions: [],
    authSessions: [
      {
        id: "auth_session_save_failure",
        userId: "user_session_save_failure",
        provider: "firebase",
        sessionKey: "binding_save_failure",
        createdAt: "2026-06-21T00:30:00.000Z",
        lastSeenAt: "2026-06-21T00:30:00.000Z",
        revokedAt: null,
      },
    ],
    auditLogs: [],
    idempotencyKeys: [],
  };
  let failSessionSave = true;
  let failingSessionId = 0;
  const failingSessionRepositories = createRepositories({
    getDb: () => failingSessionDb,
    saveDb: async () => {
      if (failSessionSave) throw new Error("simulated auth-session save failure");
    },
    createId: (prefix) => `${prefix}_save_failure_${++failingSessionId}`,
    nowIso: () => "2026-06-21T00:31:00.000Z",
    getPool: () => null,
  });
  const failingSessionIdempotency = {
    scope: "user_session_save_failure",
    operation: "auth.session.revoke",
    key: "auth-session-save-failure-key",
    fingerprint: "auth_session_save_failure",
  };
  await assert.rejects(
    () => failingSessionRepositories.authSessions.revokeForUser(
      "user_session_save_failure",
      "auth_session_save_failure",
      { action: "auth.session.revoke" },
      failingSessionIdempotency,
    ),
    /simulated auth-session save failure/,
  );
  assert.equal(failingSessionDb.authSessions[0].revokedAt, null);
  assert.equal(failingSessionDb.auditLogs.length, 0);
  assert.equal(failingSessionDb.idempotencyKeys.length, 0);

  failSessionSave = false;
  const recoveredSessionRevocation = await failingSessionRepositories.authSessions.revokeForUser(
    "user_session_save_failure",
    "auth_session_save_failure",
    { action: "auth.session.revoke" },
    failingSessionIdempotency,
  );
  assert.equal(recoveredSessionRevocation.replayed, false);
  assert.equal(Boolean(recoveredSessionRevocation.session.revokedAt), true);
  assert.equal(failingSessionDb.auditLogs.length, 1);
  assert.equal(failingSessionDb.idempotencyKeys.length, 1);
  const recoveredSessionReplay = await failingSessionRepositories.authSessions.revokeForUser(
    "user_session_save_failure",
    "auth_session_save_failure",
    { action: "auth.session.revoke" },
    failingSessionIdempotency,
  );
  assert.equal(recoveredSessionReplay.replayed, true);
  assert.equal(failingSessionDb.auditLogs.length, 1);
  assert.equal(failingSessionDb.idempotencyKeys.length, 1);

  const sharedSqlSessions = [
    {
      id: "auth_session_cross_instance",
      user_id: "user_session_cross_instance",
      provider: "firebase",
      refresh_token_hash: "binding_cross_instance",
      created_at: "2026-06-21T00:15:00.000Z",
      last_seen_at: "2026-06-21T00:15:00.000Z",
      revoked_at: null,
    },
  ];
  const crossInstanceSessionPool = {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("SELECT user_id, refresh_token_hash FROM auth_sessions")) {
        return {
          rows: sharedSqlSessions
            .filter((item) => item.id === params[0] && item.user_id === params[1])
            .map((item) => ({ user_id: item.user_id, refresh_token_hash: item.refresh_token_hash })),
        };
      }
      if (text.includes("COUNT(*)::int AS binding_count")) {
        const binding = sharedSqlSessions.filter(
          (item) => item.user_id === params[0] && item.refresh_token_hash === params[1],
        );
        return {
          rows: [{
            binding_count: binding.length,
            revoked_count: binding.filter((item) => item.revoked_at).length,
          }],
        };
      }
      throw new Error(`Unexpected cross-instance session query: ${text}`);
    },
  };
  const crossInstanceSessionDbs = [0, 1].map(() => ({
    sessions: [],
    authSessions: [{
      id: "auth_session_cross_instance",
      userId: "user_session_cross_instance",
      sessionKey: "binding_cross_instance",
      revokedAt: "",
    }],
  }));
  const crossInstanceSessionRepositories = crossInstanceSessionDbs.map((instanceDb, index) => createRepositories({
    getDb: () => instanceDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_cross_instance_${index}`,
    nowIso: () => "2026-06-21T00:16:00.000Z",
    getPool: () => crossInstanceSessionPool,
  }));
  assert.equal(
    await crossInstanceSessionRepositories[0].authSessions.isActiveForUser(
      "user_session_cross_instance",
      "auth_session_cross_instance",
    ),
    true,
  );
  assert.equal(
    await crossInstanceSessionRepositories[1].authSessions.isActiveForUser(
      "user_session_cross_instance",
      "auth_session_cross_instance",
    ),
    true,
  );
  sharedSqlSessions[0].revoked_at = "2026-06-21T00:17:00.000Z";
  assert.equal(
    await crossInstanceSessionRepositories[0].authSessions.isActiveForUser(
      "user_session_cross_instance",
      "auth_session_cross_instance",
    ),
    false,
  );
  assert.equal(
    await crossInstanceSessionRepositories[1].authSessions.isActiveForUser(
      "user_session_cross_instance",
      "auth_session_cross_instance",
    ),
    false,
    "a second backend instance must reject the shared SQL tombstone despite stale local session state",
  );

  const authorizationDb = {
    users: [
      { id: "user_alpha_doctor", role: "doctor", organizationId: "org_alpha", accountStatus: "active" },
      { id: "user_family_owner", role: "patient", organizationId: "org_personal", accountStatus: "active" },
    ],
    memberships: [
      { id: "membership_alpha", userId: "user_alpha_doctor", organizationId: "org_alpha", role: "doctor" },
      { id: "membership_personal", userId: "user_family_owner", organizationId: "org_personal", role: "patient" },
    ],
    patients: [
      { id: "patient_alpha", organizationId: "org_alpha", ownerUserId: "user_alpha_owner", name: "Alpha" },
      { id: "patient_beta", organizationId: "org_beta", ownerUserId: "user_beta_owner", name: "Beta" },
      { id: "patient_other_family", organizationId: "org_personal", ownerUserId: "user_other_owner", name: "Other" },
    ],
    auditLogs: [],
    idempotencyKeys: [],
    sessions: [
      {
        id: "session_family_authority",
        userId: "user_family_owner",
        revokedAt: null,
      },
    ],
    authSessions: [],
  };
  const authorizationRepositories = createRepositories({
    getDb: () => authorizationDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_authorization`,
    nowIso: () => "2026-06-21T00:20:00.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    authorizationRepositories.users.updateAccountProfileWithAudit(
      "user_alpha_doctor",
      { organizationId: "org_beta" },
      {
        action: "workspace.switch",
        actorUserId: "user_alpha_doctor",
        authorization: {
          kind: "workspace_switch",
          actorUserId: "user_alpha_doctor",
          organizationId: "org_beta",
        },
      },
    ),
    (error) => error.code === "WORKSPACE_MEMBERSHIP_REQUIRED",
  );
  await assert.rejects(
    authorizationRepositories.patients.saveWithAudit(
      { ...authorizationDb.patients[1], name: "Cross workspace overwrite" },
      {
        action: "patient.update",
        actorUserId: "user_alpha_doctor",
        authorization: {
          kind: "workspace",
          actorUserId: "user_alpha_doctor",
          organizationId: "org_beta",
          operation: "update",
        },
      },
    ),
    (error) => error.code === "WORKSPACE_MEMBERSHIP_REQUIRED",
  );
  await assert.rejects(
    authorizationRepositories.patients.saveWithAudit(
      { ...authorizationDb.patients[2], name: "Cross family overwrite" },
      {
        action: "patient.update",
        actorUserId: "user_family_owner",
        authorization: {
          kind: "personal",
          actorUserId: "user_family_owner",
          organizationId: "org_personal",
          operation: "update",
          expectedUserId: "user_family_owner",
          expectedWorkspaceId: "org_personal",
          expectedAuthSessionId: "session_family_authority",
        },
      },
    ),
    (error) => error.code === "PATIENT_SCOPE_DENIED",
  );
  authorizationDb.memberships[0].status = "suspended";
  await assert.rejects(
    authorizationRepositories.users.updateAccountProfileWithAudit(
      "user_alpha_doctor",
      { organizationId: "org_alpha" },
      {
        action: "workspace.switch",
        actorUserId: "user_alpha_doctor",
        authorization: {
          kind: "workspace_switch",
          actorUserId: "user_alpha_doctor",
          organizationId: "org_alpha",
        },
      },
    ),
    (error) => error.code === "WORKSPACE_MEMBERSHIP_REQUIRED",
  );
  await assert.rejects(
    authorizationRepositories.patients.saveWithAudit(
      { ...authorizationDb.patients[0], name: "Suspended membership overwrite" },
      {
        action: "patient.update",
        actorUserId: "user_alpha_doctor",
        authorization: {
          kind: "workspace",
          actorUserId: "user_alpha_doctor",
          organizationId: "org_alpha",
          operation: "update",
        },
      },
    ),
    (error) => error.code === "WORKSPACE_MEMBERSHIP_REQUIRED",
  );
  authorizationDb.memberships[0].status = "active";
  assert.equal(authorizationDb.auditLogs.length, 0, "denied mutations must not create audit success records");

  const canonicalFamilyAuthority = {
    kind: "personal",
    actorUserId: "user_family_owner",
    organizationId: "org_personal",
    expectedUserId: "user_family_owner",
    expectedWorkspaceId: "org_personal",
    expectedAuthSessionId: "session_family_authority",
  };
  const familyMutationBaseline = () => ({
    patients: structuredClone(authorizationDb.patients),
    audits: structuredClone(authorizationDb.auditLogs),
    idempotency: structuredClone(authorizationDb.idempotencyKeys),
  });
  const assertFamilyMutationUnchanged = (baseline, label) => {
    assert.deepEqual(authorizationDb.patients, baseline.patients, `${label} must not write a patient`);
    assert.deepEqual(authorizationDb.auditLogs, baseline.audits, `${label} must not write an audit row`);
    assert.deepEqual(
      authorizationDb.idempotencyKeys,
      baseline.idempotency,
      `${label} must not write an idempotency receipt`,
    );
  };
  const runDeniedFamilyMutation = async ({ intent, authority, suffix }) => {
    const baseline = familyMutationBaseline();
    const idempotency = {
      scope: "user_family_owner:org_personal",
      operation: intent === "create" ? "patient.create" : `patient.${intent}:patient_other_family`,
      key: `family-authority-${intent}-${suffix}`,
      fingerprint: `family-authority-${intent}-${suffix}-fingerprint`,
    };
    const auditInput = {
      action: `patient.${intent}`,
      actorUserId: "user_family_owner",
      organizationId: "org_personal",
      authorization: { ...authority, operation: intent },
    };
    const mutation = intent === "delete"
      ? authorizationRepositories.patients.deleteWithAudit(
          "patient_other_family",
          auditInput,
          { idempotency, responseResource: { patientId: "patient_other_family", deleted: true } },
        )
      : authorizationRepositories.patients.saveWithAudit(
          intent === "create"
            ? {
                id: `patient_denied_${suffix}`,
                organizationId: "org_personal",
                ownerUserId: "user_family_owner",
                name: "Denied dependent",
              }
            : { ...authorizationDb.patients[2], name: "Denied stale update" },
          auditInput,
          idempotency,
          intent === "create" ? 201 : 200,
        );
    await assert.rejects(mutation, (error) => error.code === "PATIENT_MUTATION_AUTHORITY_MISMATCH");
    assertFamilyMutationUnchanged(baseline, `${intent}/${suffix}`);
  };

  for (const intent of ["create", "update", "delete"]) {
    await runDeniedFamilyMutation({
      intent,
      authority: { ...canonicalFamilyAuthority, expectedWorkspaceId: "org_previous" },
      suffix: "workspace-switch",
    });
    await runDeniedFamilyMutation({
      intent,
      authority: { ...canonicalFamilyAuthority, expectedUserId: "user_previous" },
      suffix: "account-switch",
    });
    await runDeniedFamilyMutation({
      intent,
      authority: { ...canonicalFamilyAuthority, expectedAuthSessionId: "session_previous" },
      suffix: "session-switch",
    });
  }

  const roleRequestDb = {
    users: [
      {
        id: "user_role_request",
        firebaseUid: "firebase_role_request",
        email: "role-request@example.com",
        role: "patient",
        requestedRole: "patient",
        roleRequestStatus: "approved",
        accountStatus: "active",
        organizationId: "org_personal_role_request",
        name: "Role Request Owner",
        createdAt: "2026-06-21T00:21:00.000Z",
        updatedAt: "2026-06-21T00:21:00.000Z",
      },
    ],
    organizations: [
      {
        id: "org_alpha",
        name: "Alpha Clinic",
        type: "clinic",
        workspaceType: "clinic",
        status: "active",
      },
      {
        id: "org_personal_role_request",
        name: "Role Request Personal",
        type: "personal",
        workspaceType: "personal",
        status: "active",
      },
    ],
    memberships: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  let roleRequestId = 0;
  const roleRequestRepositories = createRepositories({
    getDb: () => roleRequestDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_role_request_${++roleRequestId}`,
    nowIso: () => "2026-06-21T00:21:30.000Z",
    getPool: () => null,
  });
  const roleRequestPatch = {
    requestedRole: "doctor",
    role: "patient",
    roleRequestStatus: "pending",
    accountStatus: "active",
    roleRequestedAt: "2026-06-21T00:21:30.000Z",
    roleApprovedAt: "",
    roleRejectedAt: "",
    roleRejectReason: "",
    roleInfoRequestAt: "",
    roleInfoRequestMessage: "",
    roleInfoRequiredFields: [],
    organizationId: "org_personal_role_request",
    roleRequestOrganizationId: "org_alpha",
    name: "Role Request Doctor",
    phone: "0901234567",
    license: "ROLE-LIC-001",
    hospital: "Alpha Clinic",
    department: "Cardiology",
    registrationReason: "Remote patient monitoring",
    workspaceType: "clinic",
    accountType: "doctor",
    clinicSuggestion: "",
  };
  const roleRequestIdempotency = {
    scope: "user_role_request",
    operation: "auth.role.request",
    key: "role-request-owner-key",
    fingerprint: "role-request-owner-fingerprint",
  };
  const roleRequestAudit = {
    action: "auth.role.request",
    actorUserId: "user_role_request",
    organizationId: "org_alpha",
    authorization: {
      kind: "self",
      actorUserId: "user_role_request",
      organizationId: "org_alpha",
    },
  };
  const firstRoleRequest = await roleRequestRepositories.users.submitRoleRequestWithAudit(
    "user_role_request",
    roleRequestPatch,
    roleRequestAudit,
    roleRequestIdempotency,
  );
  assert.equal(firstRoleRequest.replayed, false);
  assert.equal(firstRoleRequest.user.id, "user_role_request");
  assert.equal(firstRoleRequest.user.requestedRole, "doctor");
  assert.equal(firstRoleRequest.user.organizationId, "org_personal_role_request");
  assert.equal(firstRoleRequest.user.roleRequestOrganizationId, "org_alpha");
  assert.equal(firstRoleRequest.roleRequest.status, "pending");
  assert.ok(firstRoleRequest.operationId);
  const replayedRoleRequest = await roleRequestRepositories.users.submitRoleRequestWithAudit(
    "user_role_request",
    roleRequestPatch,
    roleRequestAudit,
    roleRequestIdempotency,
  );
  assert.equal(replayedRoleRequest.replayed, true);
  assert.equal(replayedRoleRequest.operationId, firstRoleRequest.operationId);
  assert.deepEqual(replayedRoleRequest.user, firstRoleRequest.user);
  assert.deepEqual(replayedRoleRequest.roleRequest, firstRoleRequest.roleRequest);
  assert.equal(
    roleRequestDb.auditLogs.filter(
      (entry) =>
        entry.action === "auth.role.request" &&
        entry.resourceId === "user_role_request",
    ).length,
    1,
    "exact role request replay must not append another audit row",
  );
  assert.equal(roleRequestDb.idempotencyKeys.length, 1);
  roleRequestDb.users[0].role = "doctor";
  const replayAfterApproval =
    await roleRequestRepositories.users.submitRoleRequestWithAudit(
      "user_role_request",
      roleRequestPatch,
      roleRequestAudit,
      roleRequestIdempotency,
    );
  assert.equal(replayAfterApproval.replayed, true);
  assert.equal(replayAfterApproval.user.role, "patient");
  assert.equal(
    replayAfterApproval.operationId,
    firstRoleRequest.operationId,
  );
  roleRequestDb.users[0].role = "patient";
  roleRequestDb.users[0].accountStatus = "locked";
  await assert.rejects(
    roleRequestRepositories.users.submitRoleRequestWithAudit(
      "user_role_request",
      roleRequestPatch,
      roleRequestAudit,
      roleRequestIdempotency,
    ),
    (error) => error.code === "ACCOUNT_INACTIVE",
  );
  roleRequestDb.users[0].accountStatus = "active";
  await assert.rejects(
    roleRequestRepositories.users.submitRoleRequestWithAudit(
      "user_role_request",
      roleRequestPatch,
      {
        ...roleRequestAudit,
        actorUserId: "user_other",
        authorization: { kind: "self", actorUserId: "user_other" },
      },
      {
        ...roleRequestIdempotency,
        key: "role-request-wrong-owner",
      },
    ),
    (error) => error.code === "ROLE_REQUEST_SCOPE_DENIED",
  );
  const roleRequestUserBeforeDeniedMutations = structuredClone(
    roleRequestDb.users[0],
  );
  await assert.rejects(
    roleRequestRepositories.users.submitRoleRequestWithAudit(
      "user_role_request",
      { ...roleRequestPatch, department: "Neurology" },
      roleRequestAudit,
      {
        ...roleRequestIdempotency,
        fingerprint: "role-request-different-fingerprint",
      },
    ),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.deepEqual(
    roleRequestDb.users[0],
    roleRequestUserBeforeDeniedMutations,
    "JSON role request conflict must not mutate the canonical account",
  );
  await assert.rejects(
    roleRequestRepositories.users.submitRoleRequestWithAudit(
      "user_role_request",
      { ...roleRequestPatch, roleRequestOrganizationId: "org_beta" },
      roleRequestAudit,
      {
        ...roleRequestIdempotency,
        key: "role-request-cross-target",
        fingerprint: "role-request-cross-target-fingerprint",
      },
    ),
    (error) => error.code === "ROLE_REQUEST_WORKSPACE_SCOPE_DENIED",
  );
  assert.deepEqual(
    roleRequestDb.users[0],
    roleRequestUserBeforeDeniedMutations,
    "JSON cross-target denial must not mutate the canonical account",
  );

  const sqlRoleRequestQueries = [];
  const sqlRoleRequestState = {
    user: {
      id: "user_sql_role_request",
      firebase_uid: "firebase_sql_role_request",
      email: "sql-role-request@example.com",
      role: "patient",
      requested_role: "patient",
      role_request_status: "approved",
      account_status: "active",
      organization_id: "org_personal_sql_role_request",
      name: "SQL Role Request Owner",
      firebase_claims: {},
      created_at: "2026-06-21T00:22:00.000Z",
      updated_at: "2026-06-21T00:22:00.000Z",
    },
    idempotency: null,
    auditCount: 0,
    updateCount: 0,
    workspaceInsertCount: 0,
  };
  const sqlRoleRequestClient = {
    async query(sql, params = []) {
      const text = String(sql);
      sqlRoleRequestQueries.push({ text, params });
      if (
        ["BEGIN", "COMMIT", "ROLLBACK"].includes(text) ||
        text.includes("pg_advisory_xact_lock")
      ) {
        return { rows: [] };
      }
      if (
        text.includes("SELECT id, role FROM users") &&
        text.includes("FOR UPDATE")
      ) {
        return {
          rows: [
            {
              id: sqlRoleRequestState.user.id,
              role: sqlRoleRequestState.user.role,
            },
          ],
        };
      }
      if (
        text.includes("FROM mutation_idempotency") &&
        text.includes("idempotency_key = $3")
      ) {
        const receipt = sqlRoleRequestState.idempotency;
        return {
          rows:
            receipt &&
            receipt.scope === params[0] &&
            receipt.operation === params[1] &&
            receipt.idempotency_key === params[2]
              ? [receipt]
              : [],
        };
      }
      if (
        text.includes("SELECT * FROM users") &&
        text.includes("FOR UPDATE")
      ) {
        return { rows: [{ ...sqlRoleRequestState.user }] };
      }
      if (text.includes("SELECT id FROM organizations")) {
        return {
          rows:
            params[0] === "org_alpha"
              ? [{ id: "org_alpha" }]
              : [],
        };
      }
      if (text.includes("INSERT INTO organizations")) {
        sqlRoleRequestState.workspaceInsertCount += 1;
        return { rows: [] };
      }
      if (
        text.includes("UPDATE users") &&
        text.includes("requested_role = $2")
      ) {
        sqlRoleRequestState.updateCount += 1;
        sqlRoleRequestState.user = {
          ...sqlRoleRequestState.user,
          requested_role: params[1],
          role: params[2],
          role_request_status: params[3],
          account_status: params[4],
          role_requested_at: params[5],
          role_approved_at: params[6],
          role_rejected_at: params[7],
          role_reject_reason: params[8],
          role_info_request_at: params[9],
          role_info_request_message: params[10],
          name: params[11],
          phone: params[12],
          license: params[13],
          hospital: params[14],
          department: params[15],
          organization_id: params[16],
          firebase_claims: JSON.parse(params[17]),
          updated_at: "2026-06-21T00:22:30.000Z",
        };
        return { rows: [{ ...sqlRoleRequestState.user }] };
      }
      if (text.includes("INSERT INTO audit_logs")) {
        sqlRoleRequestState.auditCount += 1;
        return { rows: [] };
      }
      if (text.includes("INSERT INTO mutation_idempotency")) {
        sqlRoleRequestState.idempotency = {
          scope: params[1],
          operation: params[2],
          idempotency_key: params[3],
          fingerprint: params[4],
          resource_type: params[5],
          resource_id: params[6],
          response_status: params[7],
          response_json: JSON.parse(params[8]),
        };
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL role request query: ${text}`);
    },
    release() {},
  };
  const sqlRoleRequestRuntimeDb = {
    users: [
      {
        id: "user_sql_role_request",
        firebaseUid: "firebase_sql_role_request",
        email: "sql-role-request@example.com",
        role: "patient",
        requestedRole: "patient",
        roleRequestStatus: "approved",
        accountStatus: "active",
        organizationId: "org_personal_sql_role_request",
      },
    ],
    organizations: [
      {
        id: "org_alpha",
        name: "Alpha Clinic",
        type: "clinic",
        workspaceType: "clinic",
        status: "active",
      },
    ],
    memberships: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  let sqlRoleRequestId = 0;
  const sqlRoleRequestRepositories = createRepositories({
    getDb: () => sqlRoleRequestRuntimeDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_sql_role_request_${++sqlRoleRequestId}`,
    nowIso: () => "2026-06-21T00:22:30.000Z",
    getPool: () => ({ connect: async () => sqlRoleRequestClient }),
  });
  const sqlRoleRequestPatch = {
    ...roleRequestPatch,
    organizationId: "org_personal_sql_role_request",
    roleRequestedAt: "2026-06-21T00:22:30.000Z",
  };
  const sqlRoleRequestIdempotency = {
    scope: "user_sql_role_request",
    operation: "auth.role.request",
    key: "sql-role-request-owner-key",
    fingerprint: "sql-role-request-owner-fingerprint",
  };
  const sqlRoleRequestAudit = {
    action: "auth.role.request",
    actorUserId: "user_sql_role_request",
    organizationId: "org_alpha",
    authorization: {
      kind: "self",
      actorUserId: "user_sql_role_request",
      organizationId: "org_alpha",
    },
  };
  const firstSqlRoleRequest =
    await sqlRoleRequestRepositories.users.submitRoleRequestWithAudit(
      "user_sql_role_request",
      sqlRoleRequestPatch,
      sqlRoleRequestAudit,
      sqlRoleRequestIdempotency,
      sqlRoleRequestRuntimeDb.organizations[0],
    );
  assert.equal(firstSqlRoleRequest.replayed, false);
  assert.equal(firstSqlRoleRequest.user.requestedRole, "doctor");
  assert.equal(
    firstSqlRoleRequest.user.organizationId,
    "org_personal_sql_role_request",
  );
  assert.equal(firstSqlRoleRequest.user.roleRequestOrganizationId, "org_alpha");
  assert.equal(sqlRoleRequestState.user.organization_id, "org_personal_sql_role_request");
  assert.equal(
    sqlRoleRequestState.user.firebase_claims.roleRequestOrganizationId,
    "org_alpha",
  );
  assert.equal(firstSqlRoleRequest.roleRequest.status, "pending");
  const replayedSqlRoleRequest =
    await sqlRoleRequestRepositories.users.submitRoleRequestWithAudit(
      "user_sql_role_request",
      sqlRoleRequestPatch,
      sqlRoleRequestAudit,
      sqlRoleRequestIdempotency,
      sqlRoleRequestRuntimeDb.organizations[0],
    );
  assert.equal(replayedSqlRoleRequest.replayed, true);
  assert.equal(
    replayedSqlRoleRequest.operationId,
    firstSqlRoleRequest.operationId,
  );
  assert.deepEqual(
    replayedSqlRoleRequest.user,
    firstSqlRoleRequest.user,
  );
  assert.equal(sqlRoleRequestState.updateCount, 1);
  assert.equal(sqlRoleRequestState.auditCount, 1);
  assert.equal(
    sqlRoleRequestState.workspaceInsertCount,
    1,
    "PostgreSQL must ensure the workspace once inside the successful role request transaction",
  );
  assert.ok(
    sqlRoleRequestQueries.findIndex((query) =>
      query.text.includes("INSERT INTO organizations"),
    ) <
      sqlRoleRequestQueries.findIndex((query) =>
        query.text.includes("UPDATE users") &&
        query.text.includes("requested_role = $2"),
      ),
    "PostgreSQL must satisfy the workspace foreign key before updating the account",
  );
  await assert.rejects(
    sqlRoleRequestRepositories.users.submitRoleRequestWithAudit(
      "user_sql_role_request",
      { ...sqlRoleRequestPatch, department: "Neurology" },
      sqlRoleRequestAudit,
      {
        ...sqlRoleRequestIdempotency,
        fingerprint: "sql-role-request-conflicting-fingerprint",
      },
    ),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.equal(
    sqlRoleRequestState.updateCount,
    1,
    "PostgreSQL role request conflict must be rejected before user mutation",
  );
  await assert.rejects(
    sqlRoleRequestRepositories.users.submitRoleRequestWithAudit(
      "user_sql_role_request",
      { ...sqlRoleRequestPatch, roleRequestOrganizationId: "org_beta" },
      sqlRoleRequestAudit,
      {
        ...sqlRoleRequestIdempotency,
        key: "sql-role-request-cross-target",
        fingerprint: "sql-role-request-cross-target-fingerprint",
      },
    ),
    (error) => error.code === "ROLE_REQUEST_WORKSPACE_SCOPE_DENIED",
  );
  assert.equal(
    sqlRoleRequestState.updateCount,
    1,
    "PostgreSQL cross-target denial must be rejected before user mutation",
  );
  assert.equal(
    sqlRoleRequestQueries.filter((query) => query.text === "COMMIT").length,
    2,
  );
  assert.equal(
    sqlRoleRequestQueries.some(
      (query) =>
        query.text.includes("INSERT INTO audit_logs") &&
        query.text.includes("ON CONFLICT (id) DO NOTHING"),
    ),
    true,
  );

  const shareIdentityDb = {
    users: [
      {
        id: "user_share_doctor",
        firebaseUid: "firebase-share-doctor",
        role: "doctor",
        accountStatus: "active",
        roleRequestStatus: "approved",
        organizationId: "org_share_doctor",
      },
    ],
    organizations: [{
      id: "org_share_doctor",
      status: "active",
      workspaceType: "clinic",
      type: "clinic",
    }],
    memberships: [{
      id: "membership_share_doctor",
      userId: "user_share_doctor",
      organizationId: "org_share_doctor",
      role: "doctor",
    }],
    doctorPatientAccess: [],
  };
  const shareIdentityRepositories = createRepositories({
    getDb: () => shareIdentityDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_share_identity`,
    nowIso: () => "2026-06-21T00:25:00.000Z",
    getPool: () => null,
  });
  const canonicalShare = await shareIdentityRepositories.patientShares.save({
    id: "share_firebase_alias",
    patientId: "patient_share_identity",
    doctorUserId: "firebase-share-doctor",
  });
  assert.equal(canonicalShare.doctorUserId, "user_share_doctor");
  assert.equal(canonicalShare.doctorId, "user_share_doctor");
  assert.equal(shareIdentityDb.doctorPatientAccess[0].doctorUserId, "user_share_doctor");
  await assert.rejects(
    shareIdentityRepositories.patientShares.save({
      id: "share_unknown_doctor",
      patientId: "patient_share_identity",
      doctorUserId: "firebase-unknown-doctor",
    }),
    (error) => error.code === "SHARE_DOCTOR_NOT_FOUND",
  );

  const notificationAudienceDb = {
    organizations: [
      { id: "org_notification_a", status: "active" },
      { id: "org_notification_b", status: "active" },
    ],
    users: [
      { id: "user_notification_b", role: "patient", accountStatus: "active" },
      { id: "user_notification_platform", role: "admin", accountStatus: "active" },
    ],
    memberships: [{
      id: "membership_notification_b",
      userId: "user_notification_b",
      organizationId: "org_notification_b",
      role: "patient",
    }],
    notifications: [],
  };
  const notificationAudienceRepositories = createRepositories({
    getDb: () => notificationAudienceDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_notification_audience`,
    nowIso: () => "2026-06-21T00:25:30.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    notificationAudienceRepositories.notifications.create({
      id: "notification_cross_tenant",
      userId: "user_notification_b",
      organizationId: "org_notification_a",
      title: "Private clinical update",
      message: "Must not cross tenants",
    }),
    (error) => error.code === "NOTIFICATION_AUDIENCE_TENANT_MISMATCH",
  );
  assert.equal(notificationAudienceDb.notifications.length, 0);
  const validNotification = await notificationAudienceRepositories.notifications.create({
    id: "notification_same_tenant",
    userId: "user_notification_b",
    organizationId: "org_notification_b",
    title: "Same workspace update",
    message: "Allowed",
  });
  assert.equal(validNotification.userId, "user_notification_b");
  notificationAudienceDb.memberships[0].status = "suspended";
  await assert.rejects(
    notificationAudienceRepositories.notifications.create({
      id: "notification_suspended_member",
      userId: "user_notification_b",
      organizationId: "org_notification_b",
      title: "Suspended workspace update",
      message: "Must be rejected",
    }),
    (error) => error.code === "NOTIFICATION_AUDIENCE_TENANT_MISMATCH",
  );
  notificationAudienceDb.memberships[0].status = "active";
  const platformNotification = await notificationAudienceRepositories.notifications.create({
    id: "notification_platform_privileged",
    userId: "user_notification_platform",
    organizationId: "org_notification_a",
    title: "Platform operation update",
    message: "Allowed for a global administrator",
  });
  assert.equal(platformNotification.userId, "user_notification_platform");

  let platformNotificationInsertParams = null;
  const platformNotificationSqlClient = {
    async query(sql, params = []) {
      const text = String(sql);
      if (
        ["BEGIN", "COMMIT", "ROLLBACK"].includes(text) ||
        text.includes("pg_advisory_xact_lock")
      ) {
        return { rows: [] };
      }
      if (text.includes("SELECT * FROM notifications")) return { rows: [] };
      if (text.includes("INSERT INTO notifications")) {
        platformNotificationInsertParams = params;
        return { rows: [] };
      }
      throw new Error(`Unexpected platform notification SQL: ${text}`);
    },
    release() {},
  };
  const platformNotificationSqlDb = { notifications: [] };
  const platformNotificationSqlRepositories = createRepositories({
    getDb: () => platformNotificationSqlDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_platform_sql`,
    nowIso: () => "2026-06-21T00:25:31.000Z",
    getPool: () => ({ connect: async () => platformNotificationSqlClient }),
  });
  await platformNotificationSqlRepositories.notifications.createOnce({
    id: "notification_platform_without_workspace",
    userId: "user_notification_platform",
    organizationId: "",
    title: "Platform review request",
    message: "Targeted platform notification",
  });
  assert.equal(platformNotificationInsertParams?.[1], "user_notification_platform");
  assert.equal(
    platformNotificationInsertParams?.[2],
    null,
    "workspace-free platform notifications must persist SQL NULL, never an empty foreign key",
  );

  const failedSqlShareDb = {
    users: [],
    organizations: [{ id: "org_share_doctor_sql", status: "active", workspaceType: "clinic" }],
    memberships: [{
      id: "membership_share_doctor_sql",
      userId: "user_share_doctor_sql",
      organizationId: "org_share_doctor_sql",
      role: "doctor",
    }],
    doctorPatientAccess: [],
  };
  const failedSqlShareRepositories = createRepositories({
    getDb: () => failedSqlShareDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_failed_sql_share`,
    nowIso: () => "2026-06-21T00:26:00.000Z",
    getPool: () => ({
      async query(sql) {
        const text = String(sql);
        if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text.trim())) return { rows: [] };
        if (text.includes("SELECT * FROM users WHERE id = $1 OR firebase_uid = $1")) {
          return {
            rows: [{
              id: "user_share_doctor_sql",
              firebase_uid: "firebase-share-doctor-sql",
              role: "doctor",
              name: "SQL Doctor",
              account_status: "active",
              role_request_status: "approved",
              organization_id: "org_share_doctor_sql",
            }],
          };
        }
        if (text.includes("FROM users doctor_account") && text.includes("FOR KEY SHARE")) {
          return { rows: [{ id: "user_share_doctor_sql" }] };
        }
        if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (text.includes("doctor_user_id IS NOT DISTINCT FROM")) return { rows: [] };
        if (text.includes("INSERT INTO doctor_patient_access")) {
          throw new Error("simulated canonical share SQL failure");
        }
        throw new Error(`Unexpected failed-share SQL: ${text}`);
      },
    }),
  });
  await assert.rejects(
    failedSqlShareRepositories.patientShares.save({
      id: "share_sql_failure",
      patientId: "patient_share_identity",
      doctorUserId: "firebase-share-doctor-sql",
    }),
    (error) => (
      error.statusCode === 503 && error.code === "PATIENT_ACCESS_STORAGE_UNAVAILABLE"
    ),
  );
  assert.equal(
    failedSqlShareDb.doctorPatientAccess.length,
    0,
    "a failed canonical SQL grant must not create a runtime-only success state",
  );

  const workspaceShareDb = {
    users: [],
    organizations: [
      { id: "org_share_active", status: "active" },
      { id: "org_share_inactive", status: "inactive" },
    ],
    doctorPatientAccess: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  const workspaceShareRepositories = createRepositories({
    getDb: () => workspaceShareDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_workspace_share`,
    nowIso: () => "2026-06-21T00:26:30.000Z",
    getPool: () => null,
  });
  for (const organizationId of ["org_share_missing", "org_share_inactive"]) {
    await assert.rejects(
      workspaceShareRepositories.patientShares.save({
        id: `share_${organizationId}`,
        patientId: "patient_workspace_share",
        organizationId,
      }),
      (error) => error.statusCode === 404 && error.code === "SHARE_WORKSPACE_NOT_FOUND",
    );
  }
  const activeWorkspaceGrant = await workspaceShareRepositories.patientShares.save({
    id: "share_workspace_active",
    patientId: "patient_workspace_share",
    organizationId: "org_share_active",
  });
  assert.equal(activeWorkspaceGrant.organizationId, "org_share_active");
  assert.equal(workspaceShareDb.doctorPatientAccess.length, 1);

  const sharedAccessState = {
    users: [{
      id: "user_shared_access_doctor",
      firebase_uid: "firebase-shared-access-doctor",
      role: "doctor",
      name: "Shared Access Doctor",
      account_status: "active",
      role_request_status: "approved",
      organization_id: "org_sql_share_active",
    }],
    organizations: [
      { id: "org_sql_share_active", status: "active" },
      { id: "org_sql_share_inactive", status: "inactive" },
    ],
    shares: [{
      id: "share_cross_instance",
      doctor_user_id: "user_shared_access_doctor",
      doctor_id: "user_shared_access_doctor",
      patient_id: "patient_cross_instance",
      organization_id: "",
      access_level: "read",
      scope: "patient_profile",
      scan_ids: [],
      granted_by_user_id: "user_family_owner",
      authority_type: "clinician_access_grant",
      purpose: "",
      consented_at: null,
      expires_at: null,
      revoked_at: null,
      revoked_by_user_id: null,
      created_at: "2026-06-21T00:27:00.000Z",
      updated_at: "2026-06-21T00:27:00.000Z",
    }],
    audits: [],
    failAccessReads: false,
    failAuditInsert: false,
    transactionSnapshot: null,
  };
  const sharedAccessPool = {
    async query(sql, params = []) {
      const text = String(sql).trim();
      if (text === "BEGIN") {
        sharedAccessState.transactionSnapshot = {
          shares: JSON.parse(JSON.stringify(sharedAccessState.shares)),
          audits: JSON.parse(JSON.stringify(sharedAccessState.audits)),
        };
        return { rows: [] };
      }
      if (text === "COMMIT") {
        sharedAccessState.transactionSnapshot = null;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        if (sharedAccessState.transactionSnapshot) {
          sharedAccessState.shares = sharedAccessState.transactionSnapshot.shares;
          sharedAccessState.audits = sharedAccessState.transactionSnapshot.audits;
        }
        sharedAccessState.transactionSnapshot = null;
        return { rows: [] };
      }
      if (sharedAccessState.failAccessReads && text.includes("doctor_patient_access")) {
        throw new Error("simulated patient access SQL read failure");
      }
      if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("SELECT * FROM users WHERE id = $1 OR firebase_uid = $1")) {
        return {
          rows: sharedAccessState.users.filter(
            (user) => user.id === params[0] || user.firebase_uid === params[0],
          ),
        };
      }
      if (text.includes("FROM users doctor_account") && text.includes("FOR KEY SHARE")) {
        return {
          rows: sharedAccessState.users
            .filter((user) => user.id === params[0] && user.role === "doctor")
            .map((user) => ({ id: user.id })),
        };
      }
      if (text.includes("FROM organizations") && text.includes("FOR KEY SHARE")) {
        return {
          rows: sharedAccessState.organizations
            .filter((organization) => organization.id === params[0] && organization.status === "active")
            .map((organization) => ({ id: organization.id })),
        };
      }
      if (text.includes("FROM doctor_patient_access access") && text.includes("LEFT JOIN users doctor")) {
        const workspaceIds = Array.isArray(params[1]) ? params[1] : [];
        return {
          rows: sharedAccessState.shares.filter((share) => {
            const expiresAt = share.expires_at ? Date.parse(share.expires_at) : null;
            const active = !share.revoked_at && (!expiresAt || expiresAt > Date.now());
            const doctor = sharedAccessState.users.find(
              (user) => user.id === share.doctor_user_id && user.role === "doctor",
            );
            return active && (
              (
                share.doctor_user_id === params[0] &&
                share.doctor_id === share.doctor_user_id &&
                Boolean(doctor)
              ) || workspaceIds.includes(share.organization_id)
            );
          }),
        };
      }
      if (
        text.includes("FROM doctor_patient_access") &&
        text.includes("doctor_user_id IS NOT DISTINCT FROM")
      ) {
        return {
          rows: sharedAccessState.shares.filter((share) => (
            share.patient_id === params[0] &&
            (share.doctor_user_id || "") === (params[1] || "") &&
            (share.organization_id || "") === (params[2] || "") &&
            share.access_level === params[3] &&
            (share.authority_type || "administrative_assignment") === params[4] &&
            (share.purpose || "") === (params[5] || "") &&
            share.scope === params[6] &&
            JSON.stringify(share.scan_ids || []) === params[7] &&
            (share.expires_at || "") === (params[8] || "") &&
            !share.revoked_at
          )),
        };
      }
      if (text.includes("SELECT * FROM doctor_patient_access") && text.includes("WHERE id = $1")) {
        return {
          rows: sharedAccessState.shares.filter(
            (share) => share.id === params[0] && share.patient_id === params[1],
          ),
        };
      }
      if (text.includes("SELECT * FROM doctor_patient_access") && text.includes("WHERE patient_id = $1")) {
        return {
          rows: sharedAccessState.shares.filter(
            (share) => share.patient_id === params[0] && (params[1] || !share.revoked_at),
          ),
        };
      }
      if (text.includes("INSERT INTO doctor_patient_access")) {
        const next = {
          id: params[0],
          doctor_user_id: params[1],
          doctor_id: params[1],
          patient_id: params[2],
          organization_id: params[3],
          access_level: params[4],
          scope: params[5],
          scan_ids: JSON.parse(params[6] || "[]"),
          granted_by_user_id: params[7],
          authority_type: params[8],
          purpose: params[9],
          consented_at: params[10],
          expires_at: params[11],
          revoked_at: params[12],
          revoked_by_user_id: params[13],
          created_at: params[14],
          updated_at: params[15],
        };
        const index = sharedAccessState.shares.findIndex((share) => share.id === next.id);
        if (index >= 0) sharedAccessState.shares[index] = next;
        else sharedAccessState.shares.unshift(next);
        return { rows: [next] };
      }
      if (text.includes("INSERT INTO audit_logs")) {
        if (sharedAccessState.failAuditInsert) throw new Error("simulated patient share audit failure");
        sharedAccessState.audits.unshift({ id: params[0], action: params[3], resource_id: params[5] });
        return { rows: [] };
      }
      throw new Error(`Unexpected shared patient-access SQL: ${text}`);
    },
  };
  const sharedAccessDbs = [0, 1].map((index) => ({
    users: [{
      id: "user_shared_access_doctor",
      role: "doctor",
      firebaseUid: "firebase-shared-access-doctor",
      accountStatus: "active",
      roleRequestStatus: "approved",
      organizationId: "org_sql_share_active",
    }],
    organizations: [{ id: "org_sql_share_active", status: "active", workspaceType: "clinic" }],
    memberships: [{
      id: `membership_shared_access_${index}`,
      userId: "user_shared_access_doctor",
      organizationId: "org_sql_share_active",
      role: "doctor",
    }],
    doctorPatientAccess: [{
      id: `stale_share_${index}`,
      doctorUserId: "user_shared_access_doctor",
      doctorId: "user_shared_access_doctor",
      patientId: `stale_patient_${index}`,
    }],
    auditLogs: [],
  }));
  const sharedAccessRepositories = sharedAccessDbs.map((instanceDb, index) => createRepositories({
    getDb: () => instanceDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_shared_access_${index}`,
    nowIso: () => "2026-06-21T00:28:00.000Z",
    getPool: () => sharedAccessPool,
  }));
  for (const repository of sharedAccessRepositories) {
    const active = await repository.patientShares.listActiveForPrincipal(
      "user_shared_access_doctor",
      [],
      { identityAliases: ["firebase-shared-access-doctor"] },
    );
    assert.deepEqual(active.map((grant) => grant.id), ["share_cross_instance"]);
  }
  for (const organizationId of ["org_sql_share_missing", "org_sql_share_inactive"]) {
    await assert.rejects(
      sharedAccessRepositories[0].patientShares.saveWithAudit(
        {
          id: `share_${organizationId}`,
          patientId: "patient_sql_workspace_share",
          organizationId,
        },
        {
          action: "patient.share",
          actorUserId: "user_family_owner",
          resourceType: "patient",
          resourceId: "patient_sql_workspace_share",
        },
      ),
      (error) => error.statusCode === 404 && error.code === "SHARE_WORKSPACE_NOT_FOUND",
    );
  }
  assert.equal(
    sharedAccessState.shares.some((share) => share.patient_id === "patient_sql_workspace_share"),
    false,
    "an unknown or inactive SQL workspace must not be normalized to a global grant",
  );
  const crossInstanceRevocation = await sharedAccessRepositories[0].patientShares.revokeWithAudit(
    "patient_cross_instance",
    "share_cross_instance",
    "user_family_owner",
    {
      action: "patient.share.revoke",
      actorUserId: "user_family_owner",
      resourceType: "patient_share",
      resourceId: "share_cross_instance",
    },
  );
  assert.equal(Boolean(crossInstanceRevocation.grant.revokedAt), true);
  assert.equal(sharedAccessState.audits.length, 1);
  const secondInstanceAuthorization = await sharedAccessRepositories[1].patientShares.listActiveForPrincipal(
    "user_shared_access_doctor",
  );
  assert.deepEqual(secondInstanceAuthorization, []);
  assert.equal(
    sharedAccessDbs[1].doctorPatientAccess.some(
      (grant) => grant.doctorUserId === "user_shared_access_doctor" && !grant.revokedAt,
    ),
    false,
    "a second backend instance must deny a SQL-revoked patient grant despite stale local state",
  );

  sharedAccessDbs[1].doctorPatientAccess.push({
    id: "share_runtime_only_missing_sql",
    patientId: "patient_missing_sql",
    doctorUserId: "user_shared_access_doctor",
    doctorId: "user_shared_access_doctor",
  });
  assert.deepEqual(
    await sharedAccessRepositories[1].patientShares.listForPatient("patient_missing_sql"),
    [],
  );
  assert.equal(
    sharedAccessDbs[1].doctorPatientAccess.some((grant) => grant.patientId === "patient_missing_sql"),
    false,
    "an empty canonical SQL scope must clear stale runtime patient access rows",
  );

  sharedAccessState.failAccessReads = true;
  for (const read of [
    () => sharedAccessRepositories[1].patientShares.listActiveForPrincipal("user_shared_access_doctor"),
    () => sharedAccessRepositories[1].patientShares.listForPatient("patient_cross_instance"),
    () => sharedAccessRepositories[1].patientShares.findForPatient("patient_cross_instance", "share_cross_instance"),
  ]) {
    await assert.rejects(read(), (error) => (
      error.statusCode === 503 && error.code === "PATIENT_ACCESS_STORAGE_UNAVAILABLE"
    ));
  }
  sharedAccessState.failAccessReads = false;

  sharedAccessState.shares = [];
  sharedAccessState.audits = [];
  sharedAccessState.failAuditInsert = true;
  await assert.rejects(
    sharedAccessRepositories[0].patientShares.saveWithAudit(
      {
        id: "share_audit_atomic",
        patientId: "patient_audit_atomic",
        doctorUserId: "firebase-shared-access-doctor",
      },
      {
        action: "patient.share",
        actorUserId: "user_family_owner",
        resourceType: "patient",
        resourceId: "patient_audit_atomic",
      },
    ),
    (error) => (
      error.statusCode === 503 && error.code === "PATIENT_ACCESS_STORAGE_UNAVAILABLE"
    ),
  );
  assert.deepEqual(sharedAccessState.shares, []);
  assert.deepEqual(sharedAccessState.audits, []);
  assert.equal(
    sharedAccessDbs[0].doctorPatientAccess.some((grant) => grant.id === "share_audit_atomic"),
    false,
    "a failed SQL audit insert must roll back the grant and avoid runtime success state",
  );

  sharedAccessState.failAuditInsert = false;
  const atomicGrant = await sharedAccessRepositories[0].patientShares.saveWithAudit(
    {
      id: "share_audit_atomic",
      patientId: "patient_audit_atomic",
      doctorUserId: "firebase-shared-access-doctor",
    },
    {
      action: "patient.share",
      actorUserId: "user_family_owner",
      resourceType: "patient",
      resourceId: "patient_audit_atomic",
    },
  );
  assert.equal(atomicGrant.grant.doctorUserId, "user_shared_access_doctor");
  assert.equal(sharedAccessState.shares.length, 1);
  assert.equal(sharedAccessState.audits.length, 1);
  sharedAccessState.failAuditInsert = true;
  await assert.rejects(
    sharedAccessRepositories[0].patientShares.revokeWithAudit(
      "patient_audit_atomic",
      "share_audit_atomic",
      "user_family_owner",
      {
        action: "patient.share.revoke",
        actorUserId: "user_family_owner",
        resourceType: "patient_share",
        resourceId: "share_audit_atomic",
      },
    ),
    (error) => (
      error.statusCode === 503 && error.code === "PATIENT_ACCESS_STORAGE_UNAVAILABLE"
    ),
  );
  assert.equal(sharedAccessState.shares[0].revoked_at, null);
  assert.equal(sharedAccessState.audits.length, 1);

  const jsonRollbackDb = {
    users: [{
      id: "user_json_share_doctor", role: "doctor", accountStatus: "active",
      roleRequestStatus: "approved", organizationId: "org_json_share_doctor",
    }],
    organizations: [{ id: "org_json_share_doctor", status: "active", workspaceType: "clinic" }],
    memberships: [{
      id: "membership_json_share_doctor", userId: "user_json_share_doctor",
      organizationId: "org_json_share_doctor", role: "doctor",
    }],
    doctorPatientAccess: [],
    auditLogs: [],
  };
  const jsonRollbackRepositories = createRepositories({
    getDb: () => jsonRollbackDb,
    saveDb: async () => { throw new Error("simulated patient share JSON persistence failure"); },
    createId: (prefix) => `${prefix}_json_share_rollback`,
    nowIso: () => "2026-06-21T00:29:00.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    jsonRollbackRepositories.patientShares.saveWithAudit(
      {
        id: "share_json_rollback",
        patientId: "patient_json_rollback",
        doctorUserId: "user_json_share_doctor",
      },
      {
        action: "patient.share",
        actorUserId: "user_json_owner",
        resourceType: "patient",
        resourceId: "patient_json_rollback",
      },
    ),
    (error) => (
      error.statusCode === 503 && error.code === "PATIENT_ACCESS_STORAGE_UNAVAILABLE"
    ),
  );
  assert.deepEqual(jsonRollbackDb.doctorPatientAccess, []);
  assert.deepEqual(jsonRollbackDb.auditLogs, []);

  const concurrentShareDb = {
    users: [{
      id: "user_concurrent_share_doctor", role: "doctor", accountStatus: "active",
      roleRequestStatus: "approved", organizationId: "org_concurrent_share_doctor",
    }],
    organizations: [{ id: "org_concurrent_share_doctor", status: "active", workspaceType: "clinic" }],
    memberships: [{
      id: "membership_concurrent_share_doctor", userId: "user_concurrent_share_doctor",
      organizationId: "org_concurrent_share_doctor", role: "doctor",
    }],
    doctorPatientAccess: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  let concurrentSaveCount = 0;
  let signalFirstSaveStarted;
  let releaseFirstSave;
  const firstSaveStarted = new Promise((resolve) => { signalFirstSaveStarted = resolve; });
  const firstSaveGate = new Promise((resolve) => { releaseFirstSave = resolve; });
  const concurrentShareRepositories = createRepositories({
    getDb: () => concurrentShareDb,
    saveDb: async () => {
      concurrentSaveCount += 1;
      if (concurrentSaveCount === 1) {
        signalFirstSaveStarted();
        await firstSaveGate;
        throw new Error("simulated first concurrent share persistence failure");
      }
    },
    createId: (prefix) => `${prefix}_concurrent_share_${concurrentSaveCount}`,
    nowIso: () => "2026-06-21T00:29:15.000Z",
    getPool: () => null,
  });
  const concurrentShareIdempotency = {
    scope: "user_concurrent_owner:org_personal",
    operation: "patient.share",
    key: "concurrent-double-submit",
    fingerprint: "concurrent-double-submit-fingerprint",
  };
  const firstConcurrentShare = concurrentShareRepositories.patientShares.saveWithAudit(
    {
      id: "share_concurrent_first",
      patientId: "patient_concurrent",
      doctorUserId: "user_concurrent_share_doctor",
    },
    { action: "patient.share", actorUserId: "user_concurrent_owner" },
    concurrentShareIdempotency,
  ).then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason }),
  );
  await firstSaveStarted;
  const secondConcurrentShare = concurrentShareRepositories.patientShares.saveWithAudit(
    {
      id: "share_concurrent_second",
      patientId: "patient_concurrent",
      doctorUserId: "user_concurrent_share_doctor",
    },
    { action: "patient.share", actorUserId: "user_concurrent_owner" },
    concurrentShareIdempotency,
  );
  releaseFirstSave();
  const firstConcurrentOutcome = await firstConcurrentShare;
  const secondConcurrentOutcome = await secondConcurrentShare;
  assert.equal(firstConcurrentOutcome.status, "rejected");
  assert.equal(firstConcurrentOutcome.reason.code, "PATIENT_ACCESS_STORAGE_UNAVAILABLE");
  assert.equal(secondConcurrentOutcome.replayed, false, "the retry must execute after the failed write rolls back");
  assert.equal(concurrentShareDb.doctorPatientAccess.length, 1);
  assert.equal(concurrentShareDb.doctorPatientAccess[0].id, "share_concurrent_second");
  assert.equal(concurrentShareDb.auditLogs.filter((log) => log.action === "patient.share").length, 1);
  assert.equal(concurrentShareDb.idempotencyKeys.length, 1);

  const crossPatientIdempotencyDb = {
    users: [{
      id: "user_cross_patient_share_doctor", role: "doctor", accountStatus: "active",
      roleRequestStatus: "approved", organizationId: "org_cross_patient_share_doctor",
    }],
    organizations: [{ id: "org_cross_patient_share_doctor", status: "active", workspaceType: "clinic" }],
    memberships: [{
      id: "membership_cross_patient_share_doctor", userId: "user_cross_patient_share_doctor",
      organizationId: "org_cross_patient_share_doctor", role: "doctor",
    }],
    doctorPatientAccess: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  let signalCrossPatientSaveStarted;
  let releaseCrossPatientSave;
  let crossPatientSaveCount = 0;
  const crossPatientSaveStarted = new Promise((resolve) => { signalCrossPatientSaveStarted = resolve; });
  const crossPatientSaveGate = new Promise((resolve) => { releaseCrossPatientSave = resolve; });
  const crossPatientIdempotencyRepositories = createRepositories({
    getDb: () => crossPatientIdempotencyDb,
    saveDb: async () => {
      crossPatientSaveCount += 1;
      if (crossPatientSaveCount === 1) {
        signalCrossPatientSaveStarted();
        await crossPatientSaveGate;
      }
    },
    createId: (prefix) => `${prefix}_cross_patient_${crossPatientSaveCount}`,
    nowIso: () => "2026-06-21T00:29:20.000Z",
    getPool: () => null,
  });
  const crossPatientIdempotency = {
    scope: "user_cross_patient_owner:org_personal",
    operation: "patient.share",
    key: "same-key-different-patient",
    fingerprint: "patient-a-fingerprint",
  };
  const firstCrossPatientShare = crossPatientIdempotencyRepositories.patientShares.saveWithAudit(
    {
      id: "share_cross_patient_a",
      patientId: "patient_cross_a",
      doctorUserId: "user_cross_patient_share_doctor",
    },
    { action: "patient.share", actorUserId: "user_cross_patient_owner" },
    crossPatientIdempotency,
  );
  await crossPatientSaveStarted;
  const conflictingCrossPatientShare = crossPatientIdempotencyRepositories.patientShares.saveWithAudit(
    {
      id: "share_cross_patient_b",
      patientId: "patient_cross_b",
      doctorUserId: "user_cross_patient_share_doctor",
    },
    { action: "patient.share", actorUserId: "user_cross_patient_owner" },
    { ...crossPatientIdempotency, fingerprint: "patient-b-fingerprint" },
  );
  const conflictingCrossPatientAssertion = assert.rejects(
    conflictingCrossPatientShare,
    (error) => error.statusCode === 409 && error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  releaseCrossPatientSave();
  await firstCrossPatientShare;
  await conflictingCrossPatientAssertion;
  assert.deepEqual(
    crossPatientIdempotencyDb.doctorPatientAccess.map((grant) => grant.id),
    ["share_cross_patient_a"],
  );
  assert.equal(crossPatientIdempotencyDb.auditLogs.length, 1);
  assert.equal(crossPatientIdempotencyDb.idempotencyKeys.length, 1);

  const idempotentShareDb = {
    users: [{
      id: "user_idempotent_share_doctor", role: "doctor", accountStatus: "active",
      roleRequestStatus: "approved", organizationId: "org_idempotent_share_doctor",
    }],
    organizations: [{ id: "org_idempotent_share_doctor", status: "active", workspaceType: "clinic" }],
    memberships: [{
      id: "membership_idempotent_share_doctor", userId: "user_idempotent_share_doctor",
      organizationId: "org_idempotent_share_doctor", role: "doctor",
    }],
    doctorPatientAccess: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  const idempotentShareRepositories = createRepositories({
    getDb: () => idempotentShareDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_idempotent_share_${idempotentShareDb.auditLogs.length + idempotentShareDb.idempotencyKeys.length}`,
    nowIso: () => "2026-06-21T00:29:30.000Z",
    getPool: () => null,
  });
  const shareIdempotency = {
    scope: "user_json_owner:org_personal",
    operation: "patient.share",
    key: "share-double-submit",
    fingerprint: "share-fingerprint",
  };
  const firstIdempotentShare = await idempotentShareRepositories.patientShares.saveWithAudit(
    {
      id: "share_idempotent_first",
      patientId: "patient_idempotent",
      doctorUserId: "user_idempotent_share_doctor",
      scope: "patient_profile",
    },
    {
      action: "patient.share",
      actorUserId: "user_json_owner",
      resourceType: "patient",
      resourceId: "patient_idempotent",
    },
    shareIdempotency,
  );
  const replayedIdempotentShare = await idempotentShareRepositories.patientShares.saveWithAudit(
    {
      id: "share_idempotent_retry",
      patientId: "patient_idempotent",
      doctorUserId: "user_idempotent_share_doctor",
      scope: "patient_profile",
    },
    {
      action: "patient.share",
      actorUserId: "user_json_owner",
      resourceType: "patient",
      resourceId: "patient_idempotent",
    },
    shareIdempotency,
  );
  assert.equal(firstIdempotentShare.replayed, false);
  assert.equal(replayedIdempotentShare.replayed, true);
  assert.equal(replayedIdempotentShare.grant.id, firstIdempotentShare.grant.id);
  assert.equal(idempotentShareDb.doctorPatientAccess.length, 1);
  assert.equal(idempotentShareDb.auditLogs.filter((log) => log.action === "patient.share").length, 1);
  const naturallyDeduplicatedShare = await idempotentShareRepositories.patientShares.saveWithAudit(
    {
      id: "share_idempotent_natural_retry",
      patientId: "patient_idempotent",
      doctorUserId: "user_idempotent_share_doctor",
      scope: "patient_profile",
    },
    {
      action: "patient.share",
      actorUserId: "user_json_owner",
      resourceType: "patient",
      resourceId: "patient_idempotent",
    },
  );
  assert.equal(naturallyDeduplicatedShare.replayed, true);
  assert.equal(naturallyDeduplicatedShare.grant.id, firstIdempotentShare.grant.id);
  assert.equal(idempotentShareDb.auditLogs.filter((log) => log.action === "patient.share").length, 1);
  const purposeSpecificShare = await idempotentShareRepositories.patientShares.saveWithAudit(
    {
      id: "share_idempotent_distinct_purpose",
      patientId: "patient_idempotent",
      doctorUserId: "user_idempotent_share_doctor",
      purpose: "Theo dõi sau điều trị",
      scope: "patient_profile",
    },
    {
      action: "patient.share",
      actorUserId: "user_json_owner",
      resourceType: "patient",
      resourceId: "patient_idempotent",
    },
  );
  assert.equal(purposeSpecificShare.replayed, false);
  assert.notEqual(purposeSpecificShare.grant.id, firstIdempotentShare.grant.id);
  assert.equal(purposeSpecificShare.grant.purpose, "Theo dõi sau điều trị");
  assert.equal(idempotentShareDb.doctorPatientAccess.length, 2);
  assert.equal(idempotentShareDb.auditLogs.filter((log) => log.action === "patient.share").length, 2);
  await assert.rejects(
    idempotentShareRepositories.patientShares.saveWithAudit(
      {
        id: "share_idempotent_conflict",
        patientId: "patient_idempotent",
        doctorUserId: "user_idempotent_share_doctor",
        scope: "selected_scans",
        scanIds: ["scan_idempotent"],
      },
      { action: "patient.share", actorUserId: "user_json_owner" },
      { ...shareIdempotency, fingerprint: "different-share-fingerprint" },
    ),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  await assert.rejects(
    idempotentShareRepositories.patientShares.saveWithAudit(
      {
        id: "share_empty_selected_scope",
        patientId: "patient_idempotent",
        doctorUserId: "user_idempotent_share_doctor",
        scope: "selected_scans",
        scanIds: [],
      },
      { action: "patient.share", actorUserId: "user_json_owner" },
    ),
    (error) => error.code === "SHARE_SCAN_SCOPE_EMPTY",
  );
  await assert.rejects(
    idempotentShareRepositories.patientShares.saveWithAudit(
      {
        id: "share_missing_principal",
        patientId: "patient_idempotent",
      },
      { action: "patient.share", actorUserId: "user_json_owner" },
    ),
    (error) => error.code === "SHARE_PRINCIPAL_REQUIRED",
  );
  await assert.rejects(
    idempotentShareRepositories.patientShares.saveWithAudit(
      {
        id: "share_expired_on_create",
        patientId: "patient_idempotent",
        doctorUserId: "user_idempotent_share_doctor",
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
      { action: "patient.share", actorUserId: "user_json_owner" },
    ),
    (error) => error.code === "SHARE_EXPIRY_INVALID",
  );
  const secondGrantForRevokeConflict = await idempotentShareRepositories.patientShares.saveWithAudit(
    {
      id: "share_idempotent_second_revoke_target",
      patientId: "patient_idempotent",
      doctorUserId: "user_idempotent_share_doctor",
      scope: "selected_scans",
      scanIds: ["scan_second_revoke_target"],
    },
    {
      action: "patient.share",
      actorUserId: "user_json_owner",
      resourceType: "patient",
      resourceId: "patient_idempotent",
    },
  );
  const revokeIdempotency = {
    scope: "user_json_owner:org_personal",
    operation: "patient.share.revoke",
    key: "share-revoke-double-submit",
    fingerprint: "share-revoke-fingerprint",
  };
  const firstIdempotentRevoke = await idempotentShareRepositories.patientShares.revokeWithAudit(
    "patient_idempotent",
    firstIdempotentShare.grant.id,
    "user_json_owner",
    {
      action: "patient.share.revoke",
      actorUserId: "user_json_owner",
      resourceType: "patient_share",
      resourceId: firstIdempotentShare.grant.id,
    },
    revokeIdempotency,
  );
  const replayedIdempotentRevoke = await idempotentShareRepositories.patientShares.revokeWithAudit(
    "patient_idempotent",
    firstIdempotentShare.grant.id,
    "user_json_owner",
    {
      action: "patient.share.revoke",
      actorUserId: "user_json_owner",
      resourceType: "patient_share",
      resourceId: firstIdempotentShare.grant.id,
    },
    revokeIdempotency,
  );
  assert.equal(firstIdempotentRevoke.replayed, false);
  assert.equal(replayedIdempotentRevoke.replayed, true);
  assert.equal(
    idempotentShareDb.auditLogs.filter((log) => log.action === "patient.share.revoke").length,
    1,
  );
  await assert.rejects(
    idempotentShareRepositories.patientShares.revokeWithAudit(
      "patient_idempotent",
      secondGrantForRevokeConflict.grant.id,
      "user_json_owner",
      {
        action: "patient.share.revoke",
        actorUserId: "user_json_owner",
        resourceType: "patient_share",
        resourceId: secondGrantForRevokeConflict.grant.id,
      },
      { ...revokeIdempotency, fingerprint: "share-revoke-second-resource-fingerprint" },
    ),
    (error) => error.statusCode === 409 && error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.equal(secondGrantForRevokeConflict.grant.revokedAt || "", "");
  const naturallyReplayedRevoke = await idempotentShareRepositories.patientShares.revokeWithAudit(
    "patient_idempotent",
    firstIdempotentShare.grant.id,
    "user_json_owner",
    {
      action: "patient.share.revoke",
      actorUserId: "user_json_owner",
      resourceType: "patient_share",
      resourceId: firstIdempotentShare.grant.id,
    },
  );
  assert.equal(naturallyReplayedRevoke.replayed, true);
  assert.equal(
    idempotentShareDb.auditLogs.filter((log) => log.action === "patient.share.revoke").length,
    1,
  );
  idempotentShareDb.memberships[0].status = "suspended";
  await assert.rejects(
    idempotentShareRepositories.patientShares.saveWithAudit(
      {
        id: "share_suspended_doctor_rejected",
        patientId: "patient_idempotent",
        doctorUserId: "user_idempotent_share_doctor",
        purpose: "Must not bypass suspended membership",
        scope: "patient_profile",
      },
      {
        action: "patient.share",
        actorUserId: "user_json_owner",
        resourceType: "patient",
        resourceId: "patient_idempotent",
      },
    ),
    (error) => error.statusCode === 404 && error.code === "SHARE_DOCTOR_NOT_FOUND",
  );
  idempotentShareDb.memberships[0].status = "active";

  const identityDb = {
    users: [
      {
        id: "user_unverified_email_owner",
        email: "unverified-owner@example.com",
        firebaseUid: "",
        role: "patient",
        name: "Existing unverified owner",
        accountStatus: "active",
      },
      {
        id: "user_conflicting_identity",
        email: "conflict@example.com",
        firebaseUid: "firebase-existing-owner",
        role: "patient",
        name: "Existing Firebase owner",
        accountStatus: "active",
      },
    ],
    organizations: [],
    memberships: [],
    patients: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  let identityId = 0;
  let failNextIdentitySave = true;
  const identityRepositories = createRepositories({
    getDb: () => identityDb,
    saveDb: async () => {
      if (failNextIdentitySave) {
        failNextIdentitySave = false;
        throw new Error("simulated durable JSON write failure");
      }
    },
    createId: (prefix) => `${prefix}_identity_${++identityId}`,
    nowIso: () => "2026-06-21T00:30:00.000Z",
    getPool: () => null,
  });

  await assert.rejects(
    identityRepositories.users.resolveFirebaseIdentityGraph({
      firebaseUid: "firebase-first-login",
      email: "first-login@example.com",
      emailVerified: true,
      name: "First Login",
    }),
    /simulated durable JSON write failure/,
  );
  const reconciledIdentity = await identityRepositories.users.resolveFirebaseIdentityGraph({
    firebaseUid: "firebase-first-login",
    email: "first-login@example.com",
    emailVerified: true,
    name: "First Login",
  });
  assert.equal(reconciledIdentity.user.firebaseUid, "firebase-first-login");
  assert.equal(reconciledIdentity.patient.accountUserId, reconciledIdentity.user.id);
  assert.equal(reconciledIdentity.patient.ownerUserId, reconciledIdentity.user.id);
  assert.equal(reconciledIdentity.membership.userId, reconciledIdentity.user.id);
  assert.equal(reconciledIdentity.membership.organizationId, reconciledIdentity.user.organizationId);
  assert.equal(
    identityDb.users.filter((user) => user.firebaseUid === "firebase-first-login").length,
    1,
    "a retry after persistence failure must not duplicate the user",
  );
  assert.equal(
    identityDb.patients.filter((patient) => patient.accountUserId === reconciledIdentity.user.id).length,
    1,
    "a retry after persistence failure must not duplicate the self profile",
  );
  assert.equal(
    identityDb.memberships.filter((membership) => membership.userId === reconciledIdentity.user.id).length,
    1,
    "a retry after persistence failure must not duplicate the membership",
  );

  const concurrentIdentities = await Promise.all([
    identityRepositories.users.resolveFirebaseIdentityGraph({
      firebaseUid: "firebase-concurrent-login",
      email: "concurrent-login@example.com",
      emailVerified: true,
      name: "Concurrent Login",
    }),
    identityRepositories.users.resolveFirebaseIdentityGraph({
      firebaseUid: "firebase-concurrent-login",
      email: "concurrent-login@example.com",
      emailVerified: true,
      name: "Concurrent Login",
    }),
  ]);
  assert.equal(concurrentIdentities[0].user.id, concurrentIdentities[1].user.id);
  assert.equal(
    identityDb.users.filter((user) => user.firebaseUid === "firebase-concurrent-login").length,
    1,
  );
  const unverifiedIdentity = await identityRepositories.users.resolveFirebaseIdentityGraph({
    firebaseUid: "firebase-unverified-attacker",
    email: "unverified-owner@example.com",
    emailVerified: false,
    name: "Unverified Attacker",
  });
  assert.notEqual(unverifiedIdentity.user.id, "user_unverified_email_owner");
  assert.equal(
    identityDb.users.find((user) => user.id === "user_unverified_email_owner").firebaseUid,
    "",
    "an unverified Firebase email must not claim an existing backend identity",
  );
  await assert.rejects(
    identityRepositories.users.resolveFirebaseIdentityGraph({
      firebaseUid: "firebase-conflicting-attacker",
      email: "conflict@example.com",
      emailVerified: true,
      name: "Conflicting Attacker",
    }),
    (error) => error.code === "FIREBASE_IDENTITY_CONFLICT",
  );

  const identityOperationDb = {
    users: [
      {
        id: "user_identity_admin",
        role: "platform_admin",
        accountStatus: "active",
      },
      {
        id: "user_identity_delete",
        role: "patient",
        firebaseUid: "firebase-delete-target",
        patientId: "patient_identity_legacy",
        accountStatus: "active",
      },
    ],
    organizations: [
      {
        id: "org_identity_personal",
        ownerUserId: "user_identity_delete",
        workspaceType: "personal",
        status: "active",
      },
    ],
    memberships: [
      {
        id: "membership_identity_delete",
        userId: "user_identity_delete",
        organizationId: "org_identity_personal",
        role: "patient",
      },
    ],
    sessions: [
      { id: "demo_identity_active", userId: "user_identity_delete", revokedAt: null },
      { id: "demo_identity_other", userId: "user_identity_admin", revokedAt: null },
    ],
    authSessions: [
      { id: "firebase_identity_active", userId: "user_identity_delete", revokedAt: null },
      { id: "firebase_identity_revoked", userId: "user_identity_delete", revokedAt: "2026-06-20T00:00:00.000Z" },
    ],
    twoFactorCredentials: [{ id: "two_factor_identity", userId: "user_identity_delete" }],
    twoFactorEnrollments: [],
    twoFactorChallenges: [],
    twoFactorTokens: [],
    notificationDevices: [{ id: "notification_device_identity", userId: "user_identity_delete" }],
    doctorPatientAccess: [
      {
        id: "access_identity_delete",
        doctorUserId: "user_identity_delete",
        doctorId: "user_identity_delete",
        grantedByUserId: "user_identity_delete",
      },
      {
        id: "access_identity_survivor",
        doctorUserId: "user_identity_admin",
        doctorId: "user_identity_admin",
        grantedByUserId: "user_identity_delete",
        revokedByUserId: "user_identity_delete",
      },
    ],
    deviceClaims: [
      {
        id: "claim_identity_delete",
        createdByUserId: "user_identity_delete",
        claimedByUserId: "user_identity_delete",
      },
    ],
    devices: [{ id: "device_identity_delete", pairedUserId: "user_identity_delete" }],
    patients: [
      {
        id: "patient_identity_self",
        profileType: "self",
        accountUserId: "user_identity_delete",
        ownerUserId: "user_identity_delete",
        primaryDoctorId: "user_identity_delete",
        deletedAt: "",
      },
      {
        id: "patient_identity_legacy",
        ownerUserId: "user_identity_delete",
        deletedAt: "",
      },
    ],
    scans: [{ id: "scan_identity_delete", createdByUserId: "user_identity_delete" }],
    appointments: [
      {
        id: "appointment_identity_delete",
        doctorUserId: "user_identity_delete",
        createdByUserId: "user_identity_delete",
        rescheduledByUserId: "user_identity_delete",
      },
    ],
    notifications: [{ id: "notification_identity_delete", userId: "user_identity_delete" }],
    chatMessages: [
      { id: "chat_identity_delete", userId: "user_identity_delete" },
      { id: "chat_identity_other", userId: "user_identity_admin" },
    ],
    identityOperations: [
      {
        id: "identity_operation_prior",
        targetUserId: "user_identity_admin",
        actorUserId: "user_identity_delete",
        operation: "lock",
        idempotencyKey: "prior-operation",
        requestFingerprint: "prior-fingerprint",
        status: "completed",
      },
    ],
    auditLogs: [
      {
        id: "audit_identity_history",
        actorUserId: "user_identity_delete",
        action: "identity.historical_action",
      },
    ],
    idempotencyKeys: [],
  };
  let identityOperationId = 0;
  let failNextIdentityOperationSave = false;
  const identityOperationRepositories = createRepositories({
    getDb: () => identityOperationDb,
    saveDb: async () => {
      if (failNextIdentityOperationSave) {
        failNextIdentityOperationSave = false;
        throw new Error("simulated identity backend completion failure");
      }
    },
    createId: (prefix) => `${prefix}_saga_${++identityOperationId}`,
    nowIso: () => "2026-06-21T00:40:00.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    identityOperationRepositories.identityOperations.begin({
      targetUserId: "user_identity_delete",
      actorUserId: "user_identity_admin",
      organizationId: "",
      operation: "delete",
      idempotencyKey: "identity-delete-before-retention",
      requestFingerprint: "delete-before-retention-fingerprint",
    }),
    (error) => error.code === "PERSONAL_WORKSPACE_RETENTION_REQUIRED",
  );
  assert.equal(identityOperationDb.users.find((user) => user.id === "user_identity_delete").accountStatus, "active");
  identityOperationDb.organizations[0].status = "inactive";
  const deleteIntent = await identityOperationRepositories.identityOperations.begin({
    targetUserId: "user_identity_delete",
    actorUserId: "user_identity_admin",
    organizationId: "",
    operation: "delete",
    idempotencyKey: "identity-delete-once",
    requestFingerprint: "delete-fingerprint-v1",
  });
  assert.equal(deleteIntent.identityOperation.status, "pending_provider");
  assert.equal(deleteIntent.user.accountStatus, "deletion_pending");
  assert.equal(deleteIntent.firebaseSessionsRevoked, 1);
  assert.equal(deleteIntent.demoSessionsRevoked, 1);
  assert.equal(identityOperationDb.authSessions[0].revokedAt, "2026-06-21T00:40:00.000Z");
  assert.equal(identityOperationDb.sessions[0].revokedAt, "2026-06-21T00:40:00.000Z");
  assert.equal(identityOperationDb.sessions[1].revokedAt, null, "another user's session must remain active");
  const deleteIntentReplay = await identityOperationRepositories.identityOperations.begin({
    targetUserId: "user_identity_delete",
    actorUserId: "user_identity_admin",
    organizationId: "",
    operation: "delete",
    idempotencyKey: "identity-delete-once",
    requestFingerprint: "delete-fingerprint-v1",
  });
  assert.equal(deleteIntentReplay.replayed, true);
  assert.equal(deleteIntentReplay.identityOperation.id, deleteIntent.identityOperation.id);
  await assert.rejects(
    identityOperationRepositories.identityOperations.begin({
      targetUserId: "user_identity_delete",
      actorUserId: "user_identity_admin",
      organizationId: "",
      operation: "delete",
      idempotencyKey: "identity-delete-once",
      requestFingerprint: "delete-fingerprint-different",
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  const providerFailure = await identityOperationRepositories.identityOperations.complete({
    operationId: deleteIntent.identityOperation.id,
    providerSucceeded: false,
    providerStatus: "unavailable",
    providerResult: { providerUnavailable: true },
    errorCode: "IDENTITY_PROVIDER_UNAVAILABLE",
  });
  assert.equal(providerFailure.identityOperation.status, "provider_failed");
  assert.equal(providerFailure.deleted, false);
  assert.equal(identityOperationDb.users.some((user) => user.id === "user_identity_delete"), true);
  assert.equal(identityOperationDb.patients[0].deletedAt, "", "provider failure must preserve the backend graph for retry");
  await assert.rejects(
    identityOperationRepositories.identityOperations.begin({
      targetUserId: "user_identity_delete",
      actorUserId: "user_identity_admin",
      organizationId: "",
      operation: "unlock",
      idempotencyKey: "identity-unlock-while-delete-pending",
      requestFingerprint: "unlock-conflict-fingerprint",
    }),
    (error) => error.code === "IDENTITY_OPERATION_IN_PROGRESS",
  );
  await assert.rejects(
    identityOperationRepositories.identityOperations.complete({
      operationId: deleteIntent.identityOperation.id,
      providerSucceeded: true,
      providerStatus: "deleted",
      providerResult: { firebaseDeleted: true },
    }),
    (error) => error.code === "IDENTITY_PROVIDER_CONFIRMATION_REQUIRED",
  );
  const providerApplied = await identityOperationRepositories.identityOperations.markProviderApplied({
    operationId: deleteIntent.identityOperation.id,
    providerStatus: "deleted",
    providerResult: { firebaseDeleted: true },
  });
  assert.equal(providerApplied.identityOperation.status, "provider_applied");
  assert.equal(identityOperationDb.users.some((user) => user.id === "user_identity_delete"), true);
  const providerAppliedReplay = await identityOperationRepositories.identityOperations.markProviderApplied({
    operationId: deleteIntent.identityOperation.id,
    providerStatus: "deleted",
    providerResult: { firebaseAlreadyMissing: true },
  });
  assert.equal(providerAppliedReplay.replayed, true);
  assert.equal(providerAppliedReplay.identityOperation.providerResult.firebaseDeleted, true);
  failNextIdentityOperationSave = true;
  await assert.rejects(
    identityOperationRepositories.identityOperations.complete({
      operationId: deleteIntent.identityOperation.id,
      providerSucceeded: true,
      providerStatus: "deleted",
      providerResult: { firebaseDeleted: true },
    }),
    /simulated identity backend completion failure/,
  );
  assert.equal(
    identityOperationDb.users.some((user) => user.id === "user_identity_delete"),
    true,
    "a failed durable backend completion must restore the in-memory identity graph for retry",
  );
  assert.equal(identityOperationDb.patients[0].deletedAt, "");
  assert.equal(
    identityOperationDb.identityOperations.find((item) => item.id === deleteIntent.identityOperation.id).status,
    "provider_applied",
  );
  const providerRetry = await identityOperationRepositories.identityOperations.complete({
    operationId: deleteIntent.identityOperation.id,
    providerSucceeded: true,
    providerStatus: "deleted",
    providerResult: { firebaseDeleted: true },
  });
  assert.equal(providerRetry.identityOperation.status, "completed");
  assert.equal(providerRetry.deleted, true);
  assert.equal(identityOperationDb.users.some((user) => user.id === "user_identity_delete"), false);
  assert.equal(identityOperationDb.memberships.some((item) => item.userId === "user_identity_delete"), false);
  assert.equal(identityOperationDb.authSessions.some((item) => item.userId === "user_identity_delete"), false);
  assert.equal(identityOperationDb.sessions.some((item) => item.userId === "user_identity_delete"), false);
  assert.equal(identityOperationDb.patients[0].deletedAt, "2026-06-21T00:40:00.000Z");
  assert.equal(identityOperationDb.patients[1].deletedAt, "2026-06-21T00:40:00.000Z");
  assert.equal(identityOperationDb.patients[0].accountUserId, "");
  assert.equal(identityOperationDb.patients[0].ownerUserId, "");
  assert.equal(identityOperationDb.organizations[0].ownerUserId, "");
  assert.equal(identityOperationDb.doctorPatientAccess[0].grantedByUserId, "");
  assert.equal(identityOperationDb.doctorPatientAccess[0].revokedByUserId, "");
  assert.equal(identityOperationDb.deviceClaims[0].createdByUserId, "");
  assert.equal(identityOperationDb.deviceClaims[0].claimedByUserId, "");
  assert.equal(identityOperationDb.appointments[0].doctorUserId, "");
  assert.equal(identityOperationDb.appointments[0].createdByUserId, "");
  assert.equal(identityOperationDb.appointments[0].rescheduledByUserId, "");
  assert.deepEqual(identityOperationDb.chatMessages.map((item) => item.id), ["chat_identity_other"]);
  assert.equal(
    identityOperationDb.identityOperations.find((item) => item.id === "identity_operation_prior").actorUserId,
    "",
  );
  assert.equal(
    identityOperationDb.auditLogs.find((item) => item.id === "audit_identity_history").actorUserId,
    "user_identity_delete",
    "append-only audit history must preserve the immutable actor identifier",
  );
  const providerRetryReplay = await identityOperationRepositories.identityOperations.complete({
    operationId: deleteIntent.identityOperation.id,
    providerSucceeded: true,
    providerStatus: "deleted",
    providerResult: { firebaseAlreadyMissing: true },
  });
  assert.equal(providerRetryReplay.replayed, true);
  assert.equal(providerRetryReplay.deleted, true);

  const passwordSagaDb = {
    users: [
      {
        id: "user_password_saga",
        role: "patient",
        accountStatus: "active",
        password: " ExactOld123 ",
      },
      {
        id: "user_password_other",
        role: "patient",
        accountStatus: "active",
        password: " ExactOld123 ",
      },
    ],
    identityOperations: [],
    authSessions: [
      {
        id: "password_auth_current",
        userId: "user_password_saga",
        revokedAt: null,
      },
      {
        id: "password_auth_other",
        userId: "user_password_saga",
        revokedAt: null,
      },
    ],
    sessions: [
      {
        id: "password_demo_current",
        userId: "user_password_saga",
        revokedAt: null,
      },
      {
        id: "password_demo_other",
        userId: "user_password_saga",
        revokedAt: null,
      },
    ],
    notifications: [],
    auditLogs: [],
  };
  let passwordSagaId = 0;
  const passwordSagaRepositories = createRepositories({
    getDb: () => passwordSagaDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_password_${++passwordSagaId}`,
    nowIso: () => "2026-07-29T08:00:00.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    passwordSagaRepositories.identityOperations.begin({
      targetUserId: "user_password_saga",
      actorUserId: "user_password_saga",
      operation: "reset_password",
      idempotencyKey: "password-wrong-current",
      requestFingerprint: "password-wrong-current-fingerprint",
      targetState: { provider: "demo" },
      expectedCurrentPassword: "ExactOld123",
      requireActiveTarget: true,
      preserveAccountStatus: true,
      preserveSessionId: "password_demo_current",
    }),
    (error) => error.code === "PASSWORD_CURRENT_INVALID",
  );
  assert.equal(passwordSagaDb.identityOperations.length, 0);
  assert.equal(passwordSagaDb.users[0].accountStatus, "active");
  assert.equal(passwordSagaDb.sessions[0].revokedAt, null);
  const passwordFingerprintInput = {
    operation: "reset_password",
    targetUserId: "user_password_saga",
    payload: {
      currentPassword: " ExactOld123 ",
      newPassword: " ExactNew456 ",
    },
  };
  const passwordRequestFingerprint = createPasswordIdempotencyFingerprint(
    passwordFingerprintInput,
    {
      PASSWORD_IDEMPOTENCY_HMAC_KEY:
        "repository-test-password-idempotency-key",
    },
  );
  const passwordIntent = await passwordSagaRepositories.identityOperations.begin({
    targetUserId: "user_password_saga",
    actorUserId: "user_password_saga",
    operation: "reset_password",
    idempotencyKey: "password-exact-once",
    requestFingerprint: passwordRequestFingerprint,
    targetState: { provider: "demo" },
    expectedCurrentPassword: " ExactOld123 ",
    requireActiveTarget: true,
    preserveAccountStatus: true,
    preserveSessionId: "password_demo_current",
  });
  const serializedPasswordIntent = JSON.stringify(
    passwordIntent.identityOperation,
  );
  const unkeyedPasswordDigest = crypto
    .createHash("sha256")
    .update(
      serializePasswordFingerprintInput(passwordFingerprintInput),
      "utf8",
    )
    .digest("hex");
  assert.equal(serializedPasswordIntent.includes(" ExactOld123 "), false);
  assert.equal(serializedPasswordIntent.includes(" ExactNew456 "), false);
  assert.equal(passwordIntent.identityOperation.requestFingerprint, passwordRequestFingerprint);
  assert.notEqual(
    passwordIntent.identityOperation.requestFingerprint,
    unkeyedPasswordDigest,
  );
  assert.deepEqual(passwordIntent.identityOperation.targetState, {
    provider: "demo",
  });
  assert.equal(passwordIntent.user.accountStatus, "active");
  assert.equal(passwordSagaDb.sessions[0].revokedAt, null);
  assert.equal(
    passwordSagaDb.sessions[1].revokedAt,
    "2026-07-29T08:00:00.000Z",
  );
  assert.equal(
    passwordSagaDb.authSessions.every((session) => Boolean(session.revokedAt)),
    true,
    "a demo session id cannot preserve an unrelated Firebase auth session",
  );
  const passwordIntentReplay =
    await passwordSagaRepositories.identityOperations.begin({
      targetUserId: "user_password_saga",
      actorUserId: "user_password_saga",
      operation: "reset_password",
      idempotencyKey: "password-exact-once",
      requestFingerprint: passwordRequestFingerprint,
      targetState: { provider: "demo" },
      expectedCurrentPassword: "wrong-after-reservation",
      requireActiveTarget: true,
      preserveAccountStatus: true,
      preserveSessionId: "password_demo_current",
    });
  assert.equal(passwordIntentReplay.replayed, true);
  assert.equal(
    passwordIntentReplay.identityOperation.id,
    passwordIntent.identityOperation.id,
  );
  await assert.rejects(
    passwordSagaRepositories.identityOperations.begin({
      targetUserId: "user_password_saga",
      actorUserId: "user_password_saga",
      operation: "reset_password",
      idempotencyKey: "password-exact-once",
      requestFingerprint: "password-different-fingerprint",
      targetState: { provider: "demo" },
      expectedCurrentPassword: " ExactOld123 ",
      requireActiveTarget: true,
      preserveAccountStatus: true,
      preserveSessionId: "password_demo_current",
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  await passwordSagaRepositories.identityOperations.markProviderApplying({
    operationId: passwordIntent.identityOperation.id,
  });
  await passwordSagaRepositories.users.updatePasswordExact(
    "user_password_saga",
    " ExactNew456 ",
  );
  assert.equal(isPasswordHash(passwordSagaDb.users[0].password), true);
  assert.equal(
    verifyPasswordSecret(
      " ExactNew456 ",
      passwordSagaDb.users[0].password,
    ),
    true,
  );
  await passwordSagaRepositories.identityOperations.markProviderApplied({
    operationId: passwordIntent.identityOperation.id,
    providerStatus: "skipped",
    providerResult: { updated: true, skipped: true },
  });
  const completedPasswordIntent =
    await passwordSagaRepositories.identityOperations.complete({
      operationId: passwordIntent.identityOperation.id,
      providerSucceeded: true,
    });
  assert.equal(completedPasswordIntent.identityOperation.status, "completed");
  assert.equal(completedPasswordIntent.user.accountStatus, "active");
  assert.equal(isPasswordHash(completedPasswordIntent.user.password), true);
  assert.equal(
    verifyPasswordSecret(
      " ExactNew456 ",
      completedPasswordIntent.user.password,
    ),
    true,
  );
  const completedPasswordReplay =
    await passwordSagaRepositories.identityOperations.begin({
      targetUserId: "user_password_saga",
      actorUserId: "user_password_saga",
      operation: "reset_password",
      idempotencyKey: "password-exact-once",
      requestFingerprint: passwordRequestFingerprint,
      targetState: { provider: "firebase" },
      expectedCurrentPassword: "wrong-after-completion",
      requireActiveTarget: true,
      preserveAccountStatus: true,
      preserveSessionId: "password_demo_current",
    });
  assert.equal(completedPasswordReplay.replayed, true);
  assert.equal(
    completedPasswordReplay.identityOperation.id,
    passwordIntent.identityOperation.id,
  );
  assert.deepEqual(completedPasswordReplay.identityOperation.targetState, {
    provider: "demo",
  });

  const otherPasswordRequestFingerprint =
    createPasswordIdempotencyFingerprint(
      {
        ...passwordFingerprintInput,
        targetUserId: "user_password_other",
      },
      {
        PASSWORD_IDEMPOTENCY_HMAC_KEY:
          "repository-test-password-idempotency-key",
      },
    );
  const otherOwnerIntent =
    await passwordSagaRepositories.identityOperations.begin({
      targetUserId: "user_password_other",
      actorUserId: "user_password_other",
      operation: "reset_password",
      idempotencyKey: "password-exact-once",
      requestFingerprint: otherPasswordRequestFingerprint,
      targetState: { provider: "demo" },
      expectedCurrentPassword: " ExactOld123 ",
      requireActiveTarget: true,
      preserveAccountStatus: true,
    });
  assert.notEqual(
    otherOwnerIntent.identityOperation.id,
    passwordIntent.identityOperation.id,
  );
  assert.equal(
    otherOwnerIntent.identityOperation.targetUserId,
    "user_password_other",
  );
  const passwordAuditInput = {
    id: `audit_password_change_${passwordIntent.identityOperation.id}`,
    action: "account.password.change",
    actorUserId: "user_password_saga",
    resourceType: "user",
    resourceId: "user_password_saga",
    metadata: { operationId: passwordIntent.identityOperation.id },
  };
  await passwordSagaRepositories.auditLogs.append(passwordAuditInput);
  await passwordSagaRepositories.auditLogs.append(passwordAuditInput);
  assert.equal(
    passwordSagaDb.auditLogs.filter((item) => item.id === passwordAuditInput.id)
      .length,
    1,
  );
  const passwordNotificationInput = {
    id: `noti_password_change_${passwordIntent.identityOperation.id}`,
    userId: "user_password_saga",
    type: "success",
    title: "Password changed",
    message: "Your password was changed.",
    metadata: { operationId: passwordIntent.identityOperation.id },
  };
  const firstPasswordNotification =
    await passwordSagaRepositories.notifications.createOnce(
      passwordNotificationInput,
    );
  const replayedPasswordNotification =
    await passwordSagaRepositories.notifications.createOnce({
      ...passwordNotificationInput,
      title: "Must not replace the durable notification",
    });
  assert.equal(firstPasswordNotification.created, true);
  assert.equal(replayedPasswordNotification.created, false);
  assert.equal(
    replayedPasswordNotification.notification.title,
    "Password changed",
  );
  assert.equal(
    passwordSagaDb.notifications.filter(
      (item) => item.id === passwordNotificationInput.id,
    ).length,
    1,
  );

  const passwordProviderFailure = await passwordSagaRepositories.identityOperations.begin({
    targetUserId: "user_password_saga",
    actorUserId: "user_password_saga",
    operation: "reset_password",
    idempotencyKey: "password-provider-failure",
    requestFingerprint: createPasswordIdempotencyFingerprint({
      operation: "reset_password",
      targetUserId: "user_password_saga",
      payload: {
        currentPassword: " ExactNew456 ",
        newPassword: " FailurePass789 ",
      },
    }, {
      PASSWORD_IDEMPOTENCY_HMAC_KEY:
        "repository-test-password-idempotency-key",
    }),
    targetState: { provider: "demo" },
    expectedCurrentPassword: " ExactNew456 ",
    requireActiveTarget: true,
    preserveAccountStatus: true,
    preserveSessionId: "password_demo_current",
  });
  const failedPasswordProvider =
    await passwordSagaRepositories.identityOperations.complete({
      operationId: passwordProviderFailure.identityOperation.id,
      providerSucceeded: false,
      providerStatus: "failed",
      errorCode: "TEST_PROVIDER_FAILURE",
    });
  assert.equal(failedPasswordProvider.identityOperation.status, "provider_failed");
  assert.equal(
    verifyPasswordSecret(
      " ExactNew456 ",
      passwordSagaDb.users[0].password,
    ),
    true,
  );
  assert.equal(
    passwordSagaDb.auditLogs.filter(
      (item) =>
        item.action === "account.password.change" &&
        item.metadata?.operationId ===
          passwordProviderFailure.identityOperation.id,
    ).length,
    0,
  );
  assert.equal(
    passwordSagaDb.notifications.filter(
      (item) =>
        item.metadata?.operationId ===
        passwordProviderFailure.identityOperation.id,
    ).length,
    0,
  );

  const identityRaceDb = {
    users: [
      { id: "user_identity_race", role: "doctor", accountStatus: "active" },
      { id: "user_identity_race_actor", role: "workspace_admin", accountStatus: "active" },
    ],
    identityOperations: [],
    authSessions: [],
    sessions: [],
    auditLogs: [],
  };
  let identityRaceId = 0;
  const identityRaceRepositories = createRepositories({
    getDb: () => identityRaceDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_race_${++identityRaceId}`,
    nowIso: () => "2026-06-21T00:50:00.000Z",
    getPool: () => null,
  });
  const racedIdentityStarts = await Promise.allSettled([
    identityRaceRepositories.identityOperations.begin({
      targetUserId: "user_identity_race",
      actorUserId: "user_identity_race_actor",
      operation: "lock",
      idempotencyKey: "race-lock",
      requestFingerprint: "race-lock-fingerprint",
    }),
    identityRaceRepositories.identityOperations.begin({
      targetUserId: "user_identity_race",
      actorUserId: "user_identity_race_actor",
      organizationId: "org_identity_race_next",
      operation: "change_role",
      idempotencyKey: "race-change-role",
      requestFingerprint: "race-change-role-fingerprint",
      targetState: {
        role: "workspace_admin",
        requestedRole: "workspace_admin",
        roleRequestStatus: "approved",
        organizationId: "org_identity_race_next",
        accountStatus: "active",
        hospital: "Race Clinic",
      },
    }),
  ]);
  assert.equal(racedIdentityStarts.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(racedIdentityStarts.filter((result) => result.status === "rejected").length, 1);
  assert.equal(racedIdentityStarts.find((result) => result.status === "rejected").reason.code, "IDENTITY_OPERATION_IN_PROGRESS");
  const acceptedRaceOperation = racedIdentityStarts.find((result) => result.status === "fulfilled").value;
  assert.equal(acceptedRaceOperation.identityOperation.operation, "lock");
  await identityRaceRepositories.identityOperations.markProviderApplied({
    operationId: acceptedRaceOperation.identityOperation.id,
    providerStatus: "applied",
    providerResult: { updated: true },
  });
  await identityRaceRepositories.identityOperations.complete({
    operationId: acceptedRaceOperation.identityOperation.id,
    providerSucceeded: true,
    providerStatus: "applied",
    providerResult: { updated: true },
  });
  const unlockAfterLock = await identityRaceRepositories.identityOperations.begin({
    targetUserId: "user_identity_race",
    actorUserId: "user_identity_race_actor",
    operation: "unlock",
    idempotencyKey: "race-unlock-after-complete",
    requestFingerprint: "race-unlock-after-complete-fingerprint",
  });
  assert.equal(unlockAfterLock.identityOperation.status, "pending_provider");
  await identityRaceRepositories.identityOperations.markProviderApplied({
    operationId: unlockAfterLock.identityOperation.id,
    providerStatus: "applied",
    providerResult: { updated: true, firebaseDisabled: false },
  });
  const reconciliationOutcomes = await identityRaceRepositories.identityOperations.reconcileProviderApplied();
  assert.deepEqual(reconciliationOutcomes, [
    { operationId: unlockAfterLock.identityOperation.id, completed: true, errorCode: "" },
  ]);
  assert.equal(unlockAfterLock.identityOperation.status, "completed");
  assert.equal(unlockAfterLock.identityOperation.providerResult.firebaseDisabled, false);
  assert.equal(identityRaceDb.users.find((item) => item.id === "user_identity_race").accountStatus, "active");

  const roleTransitionDb = {
    organizations: [
      { id: "org_clinic_next", status: "active", workspaceType: "clinic", type: "clinic" },
    ],
    users: [
      {
        id: "user_role_transition",
        role: "admin",
        requestedRole: "admin",
        roleRequestStatus: "approved",
        organizationId: "org_platform",
        accountStatus: "active",
        hospital: "Shcare Platform",
      },
      { id: "user_role_transition_actor", role: "admin", accountStatus: "active" },
    ],
    memberships: [
      {
        id: "membership_role_transition_existing",
        organizationId: "org_clinic_next",
        userId: "user_role_transition",
        role: "viewer",
      },
    ],
    identityOperations: [],
    authSessions: [{ id: "role_transition_auth", userId: "user_role_transition", revokedAt: null }],
    sessions: [{ id: "role_transition_demo", userId: "user_role_transition", revokedAt: null }],
    auditLogs: [],
  };
  let roleTransitionId = 0;
  let failNextRoleTransitionSave = false;
  const roleTransitionRepositories = createRepositories({
    getDb: () => roleTransitionDb,
    saveDb: async () => {
      if (failNextRoleTransitionSave) {
        failNextRoleTransitionSave = false;
        throw new Error("simulated role transition backend completion failure");
      }
    },
    createId: (prefix) => `${prefix}_role_transition_${++roleTransitionId}`,
    nowIso: () => "2026-06-21T00:55:00.000Z",
    getPool: () => null,
  });
  const roleTransitionIntent = await roleTransitionRepositories.identityOperations.begin({
    targetUserId: "user_role_transition",
    actorUserId: "user_role_transition_actor",
    organizationId: "org_clinic_next",
    operation: "change_role",
    idempotencyKey: "role-transition-demote",
    requestFingerprint: "role-transition-demote-fingerprint",
    protectLastPlatformAdmin: true,
    targetState: {
      role: "workspace_admin",
      requestedRole: "workspace_admin",
      roleRequestStatus: "approved",
      organizationId: "org_clinic_next",
      accountStatus: "active",
      hospital: "Next Clinic",
    },
  });
  assert.equal(roleTransitionIntent.user.role, "admin", "the backend role must not change before provider confirmation");
  assert.equal(roleTransitionIntent.user.accountStatus, "role_change_pending");
  assert.equal(roleTransitionIntent.identityOperation.targetState.role, "workspace_admin");
  assert.equal(roleTransitionDb.authSessions[0].revokedAt, "2026-06-21T00:55:00.000Z");
  assert.equal(roleTransitionDb.sessions[0].revokedAt, "2026-06-21T00:55:00.000Z");
  assert.equal(roleTransitionDb.memberships[0].role, "viewer", "membership must remain unchanged until backend finalization");
  await roleTransitionRepositories.identityOperations.markProviderApplied({
    operationId: roleTransitionIntent.identityOperation.id,
    providerStatus: "claims_updated",
    providerResult: { updated: true },
  });
  failNextRoleTransitionSave = true;
  await assert.rejects(
    roleTransitionRepositories.identityOperations.complete({
      operationId: roleTransitionIntent.identityOperation.id,
      providerSucceeded: true,
    }),
    /simulated role transition backend completion failure/,
  );
  assert.equal(roleTransitionDb.users[0].role, "admin");
  assert.equal(roleTransitionDb.users[0].accountStatus, "role_change_pending");
  assert.equal(roleTransitionDb.memberships[0].role, "viewer");
  assert.equal(roleTransitionDb.identityOperations[0].status, "provider_applied");
  const completedRoleTransition = await roleTransitionRepositories.identityOperations.complete({
    operationId: roleTransitionIntent.identityOperation.id,
    providerSucceeded: true,
  });
  assert.equal(completedRoleTransition.identityOperation.status, "completed");
  assert.equal(roleTransitionDb.users[0].role, "workspace_admin");
  assert.equal(roleTransitionDb.users[0].requestedRole, "workspace_admin");
  assert.equal(roleTransitionDb.users[0].roleRequestStatus, "approved");
  assert.equal(roleTransitionDb.users[0].organizationId, "org_clinic_next");
  assert.equal(roleTransitionDb.users[0].accountStatus, "active");
  assert.equal(roleTransitionDb.users[0].hospital, "Next Clinic");
  assert.equal(roleTransitionDb.memberships[0].role, "workspace_admin");

  const roleUpgradeIntent = await roleTransitionRepositories.identityOperations.begin({
    targetUserId: "user_role_transition",
    actorUserId: "user_role_transition_actor",
    organizationId: "org_platform",
    operation: "change_role",
    idempotencyKey: "role-transition-upgrade",
    requestFingerprint: "role-transition-upgrade-fingerprint",
    targetState: {
      role: "admin",
      requestedRole: "admin",
      roleRequestStatus: "approved",
      organizationId: "org_platform",
      accountStatus: "active",
      hospital: "Shcare Platform",
    },
  });
  await roleTransitionRepositories.identityOperations.markProviderApplied({
    operationId: roleUpgradeIntent.identityOperation.id,
    providerStatus: "claims_updated",
    providerResult: { updated: true },
  });
  const roleReconciliationOutcomes = await roleTransitionRepositories.identityOperations.reconcileProviderApplied();
  assert.deepEqual(roleReconciliationOutcomes, [
    { operationId: roleUpgradeIntent.identityOperation.id, completed: true, errorCode: "" },
  ]);
  assert.equal(roleTransitionDb.users[0].role, "admin");
  assert.equal(
    roleTransitionDb.memberships.find(
      (item) => item.userId === "user_role_transition" && item.organizationId === "org_platform",
    ).role,
    "admin",
  );

  const doctorDemotionDb = {
    organizations: [
      { id: "org_doctor_demotion", status: "active", workspaceType: "clinic", type: "clinic" },
    ],
    users: [
      {
        id: "user_doctor_demotion",
        role: "doctor",
        requestedRole: "doctor",
        roleRequestStatus: "approved",
        organizationId: "org_doctor_demotion",
        accountStatus: "active",
        hospital: "Demotion Clinic",
      },
      { id: "user_doctor_demotion_actor", role: "admin", accountStatus: "active" },
    ],
    memberships: [
      {
        id: "membership_doctor_demotion",
        organizationId: "org_doctor_demotion",
        userId: "user_doctor_demotion",
        role: "doctor",
      },
    ],
    doctorPatientAccess: [
      {
        id: "patient_share_doctor_demotion",
        patientId: "patient_doctor_demotion",
        doctorUserId: "user_doctor_demotion",
        doctorId: "user_doctor_demotion",
        organizationId: "org_doctor_demotion",
        accessLevel: "full",
        scope: "patient_profile",
        allowedScanIds: [],
        expiresAt: null,
        revokedAt: null,
        revokedByUserId: "",
      },
    ],
    identityOperations: [],
    authSessions: [],
    sessions: [],
    auditLogs: [],
  };
  let doctorDemotionSaveShouldFail = false;
  let doctorDemotionId = 0;
  const doctorDemotionRepositories = createRepositories({
    getDb: () => doctorDemotionDb,
    saveDb: async () => {
      if (doctorDemotionSaveShouldFail) {
        doctorDemotionSaveShouldFail = false;
        throw new Error("simulated doctor demotion persistence failure");
      }
    },
    createId: (prefix) => `${prefix}_doctor_demotion_${++doctorDemotionId}`,
    nowIso: () => "2026-06-21T01:05:00.000Z",
    getPool: () => null,
  });
  const doctorDemotionIntent = await doctorDemotionRepositories.identityOperations.begin({
    targetUserId: "user_doctor_demotion",
    actorUserId: "user_doctor_demotion_actor",
    organizationId: "org_doctor_demotion",
    operation: "change_role",
    idempotencyKey: "doctor-role-demotion",
    requestFingerprint: "doctor-role-demotion-fingerprint",
    targetState: {
      role: "viewer",
      requestedRole: "viewer",
      roleRequestStatus: "approved",
      organizationId: "org_doctor_demotion",
      accountStatus: "active",
      hospital: "Demotion Clinic",
    },
  });
  await doctorDemotionRepositories.identityOperations.markProviderApplied({
    operationId: doctorDemotionIntent.identityOperation.id,
    providerStatus: "claims_updated",
    providerResult: { updated: true },
  });
  const doctorDemotionAuditCountBeforeComplete = doctorDemotionDb.auditLogs.length;
  doctorDemotionSaveShouldFail = true;
  await assert.rejects(
    doctorDemotionRepositories.identityOperations.complete({
      operationId: doctorDemotionIntent.identityOperation.id,
      providerSucceeded: true,
    }),
    /simulated doctor demotion persistence failure/,
  );
  assert.equal(doctorDemotionDb.users[0].role, "doctor", "failed persistence must restore the doctor role");
  assert.equal(
    doctorDemotionDb.doctorPatientAccess[0].revokedAt,
    null,
    "failed persistence must restore the active patient grant",
  );
  assert.equal(
    doctorDemotionDb.auditLogs.filter((item) => item.action === "patient.share.auto_revoke").length,
    0,
    "failed persistence must not leave a patient-share audit entry",
  );
  assert.equal(doctorDemotionDb.auditLogs.length, doctorDemotionAuditCountBeforeComplete);
  const completedDoctorDemotion = await doctorDemotionRepositories.identityOperations.complete({
    operationId: doctorDemotionIntent.identityOperation.id,
    providerSucceeded: true,
  });
  assert.equal(completedDoctorDemotion.identityOperation.status, "completed");
  assert.equal(doctorDemotionDb.users[0].role, "viewer");
  assert.equal(doctorDemotionDb.doctorPatientAccess[0].revokedAt, "2026-06-21T01:05:00.000Z");
  assert.equal(doctorDemotionDb.doctorPatientAccess[0].revokedByUserId, "user_doctor_demotion_actor");
  assert.equal(
    doctorDemotionDb.auditLogs.filter((item) => item.action === "patient.share.auto_revoke").length,
    1,
  );
  const replayedDoctorDemotion = await doctorDemotionRepositories.identityOperations.complete({
    operationId: doctorDemotionIntent.identityOperation.id,
    providerSucceeded: true,
  });
  assert.equal(replayedDoctorDemotion.replayed, true);
  assert.equal(
    doctorDemotionDb.auditLogs.filter((item) => item.action === "patient.share.auto_revoke").length,
    1,
    "replaying a completed role transition must not duplicate auto-revoke audit",
  );

  const sqlRoleTransitionQueries = [];
  const sqlRoleTransitionState = {
    user: {
      id: "user_sql_role_transition",
      role: "admin",
      requested_role: "admin",
      role_request_status: "approved",
      organization_id: "org_platform",
      account_status: "role_change_pending",
      hospital: "Shcare Platform",
      firebase_claims: {},
    },
    operation: {
      id: "identityop_sql_role_transition",
      target_user_id: "user_sql_role_transition",
      actor_user_id: "user_sql_role_actor",
      organization_id: "org_sql_clinic",
      operation: "change_role",
      status: "provider_applied",
      idempotency_key: "sql-role-transition",
      request_fingerprint: "sql-role-transition-fingerprint",
      previous_account_status: "active",
      target_account_status: "role_change_pending",
      target_state: {
        role: "workspace_admin",
        requestedRole: "workspace_admin",
        roleRequestStatus: "approved",
        organizationId: "org_sql_clinic",
        accountStatus: "active",
        hospital: "SQL Clinic",
      },
      provider_status: "claims_updated",
      provider_result: { updated: true },
    },
    membership: null,
  };
  const sqlRoleTransitionClient = {
    async query(sql, params = []) {
      const text = String(sql);
      sqlRoleTransitionQueries.push({ text, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text) || text.includes("pg_advisory_xact_lock")) {
        return { rows: [] };
      }
      if (text.startsWith("LOCK TABLE organizations, memberships")) return { rows: [] };
      if (text.includes("WITH related_workspaces AS") && text.includes("owner_candidates")) return { rows: [] };
      if (text.includes("FROM organizations") && text.includes("owner_user_id = $1") && text.includes("FOR UPDATE")) {
        return { rows: [] };
      }
      if (text.includes("FROM memberships target_membership") && text.includes("LAST_WORKSPACE_OWNER_REQUIRED") === false) {
        return { rows: [] };
      }
      if (text.includes("SELECT target_user_id, operation, target_state FROM identity_operations")) {
        return {
          rows: [{
            target_user_id: sqlRoleTransitionState.operation.target_user_id,
            operation: sqlRoleTransitionState.operation.operation,
            target_state: sqlRoleTransitionState.operation.target_state,
          }],
        };
      }
      if (text.includes("SELECT * FROM identity_operations") && text.includes("WHERE id = $1") && text.includes("FOR UPDATE")) {
        return { rows: [sqlRoleTransitionState.operation] };
      }
      if (text.includes("FROM identity_operations") && text.includes("id <> $2") && text.includes("status IN")) {
        return { rows: [] };
      }
      if (text.includes("SELECT id, status, workspace_type, type FROM organizations")) {
        return { rows: [{ id: "org_sql_clinic", status: "active", workspace_type: "clinic", type: "clinic" }] };
      }
      if (text.includes("DELETE FROM memberships") && text.includes("managed_admin_workspace_transition") === false) {
        return { rows: [] };
      }
      if (text.includes("UPDATE doctor_patient_access") && text.includes("RETURNING id, patient_id, organization_id")) {
        return { rows: [] };
      }
      if (text.includes("UPDATE users") && text.includes("SET role = $2")) {
        Object.assign(sqlRoleTransitionState.user, {
          role: params[1],
          requested_role: params[2],
          role_request_status: params[3],
          organization_id: params[4],
          account_status: params[5],
          hospital: params[6],
        });
        return { rows: [sqlRoleTransitionState.user] };
      }
      if (text.includes("INSERT INTO memberships")) {
        sqlRoleTransitionState.membership = {
          id: params[0],
          organizationId: params[1],
          userId: params[2],
          role: params[3],
        };
        return { rows: [] };
      }
      if (text.includes("INSERT INTO audit_logs")) return { rows: [] };
      if (text.includes("UPDATE identity_operations") && text.includes("status = 'completed'")) {
        Object.assign(sqlRoleTransitionState.operation, {
          status: "completed",
          provider_status: params[1],
          provider_result: JSON.parse(params[2]),
          completed_at: "2026-06-21T00:57:00.000Z",
        });
        return { rows: [sqlRoleTransitionState.operation] };
      }
      throw new Error(`Unexpected SQL role transition query: ${text}`);
    },
    release() {},
  };
  const sqlRoleTransitionRuntimeDb = {
    users: [], memberships: [], identityOperations: [], auditLogs: [],
  };
  const sqlRoleTransitionRepositories = createRepositories({
    getDb: () => sqlRoleTransitionRuntimeDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_sql_role_transition`,
    nowIso: () => "2026-06-21T00:57:00.000Z",
    getPool: () => ({ connect: async () => sqlRoleTransitionClient }),
  });
  const sqlCompletedRoleTransition = await sqlRoleTransitionRepositories.identityOperations.complete({
    operationId: "identityop_sql_role_transition",
    providerSucceeded: true,
  });
  assert.equal(sqlCompletedRoleTransition.identityOperation.status, "completed");
  assert.equal(sqlCompletedRoleTransition.user.role, "workspace_admin");
  assert.equal(sqlCompletedRoleTransition.user.organizationId, "org_sql_clinic");
  assert.equal(sqlRoleTransitionState.membership.role, "workspace_admin");
  assert.equal(sqlRoleTransitionQueries[0].text, "BEGIN");
  assert.equal(sqlRoleTransitionQueries.at(-1).text, "COMMIT");
  const sqlRoleUserUpdateIndex = sqlRoleTransitionQueries.findIndex((query) => query.text.includes("SET role = $2"));
  const sqlRoleMembershipIndex = sqlRoleTransitionQueries.findIndex((query) => query.text.includes("INSERT INTO memberships"));
  const sqlRoleCommitIndex = sqlRoleTransitionQueries.findIndex((query) => query.text === "COMMIT");
  assert.equal(sqlRoleUserUpdateIndex > 0 && sqlRoleUserUpdateIndex < sqlRoleCommitIndex, true);
  assert.equal(sqlRoleMembershipIndex > sqlRoleUserUpdateIndex && sqlRoleMembershipIndex < sqlRoleCommitIndex, true);
  const sqlRoleOwnerGuardIndex = sqlRoleTransitionQueries.findIndex(
    (query) => query.text.startsWith("LOCK TABLE organizations, memberships"),
  );
  assert.equal(
    sqlRoleOwnerGuardIndex > 0 && sqlRoleOwnerGuardIndex < sqlRoleUserUpdateIndex,
    true,
    "role demotion must recheck canonical workspace ownership before the backend role is finalized",
  );

  const lastAdminDb = {
    users: [
      { id: "user_last_platform_admin", role: "platform_admin", accountStatus: "active" },
      { id: "user_workspace_actor", role: "workspace_admin", accountStatus: "active" },
    ],
    identityOperations: [],
  };
  const lastAdminRepositories = createRepositories({
    getDb: () => lastAdminDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_last_admin`,
    nowIso: () => "2026-06-21T01:00:00.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    lastAdminRepositories.identityOperations.begin({
      targetUserId: "user_last_platform_admin",
      actorUserId: "user_workspace_actor",
      organizationId: "org_last_admin_next",
      operation: "change_role",
      idempotencyKey: "last-admin-demote",
      requestFingerprint: "last-admin-demote-fingerprint",
      protectLastPlatformAdmin: true,
      targetState: {
        role: "workspace_admin",
        requestedRole: "workspace_admin",
        roleRequestStatus: "approved",
        organizationId: "org_last_admin_next",
        accountStatus: "active",
        hospital: "Last Admin Clinic",
      },
    }),
    (error) => error.code === "LAST_PLATFORM_ADMIN_REQUIRED",
  );

  const sqlGuardQueries = [];
  const sqlGuardClient = {
    async query(sql, params = []) {
      const text = String(sql);
      sqlGuardQueries.push({ text, params });
      if (
        text === "BEGIN" ||
        text === "ROLLBACK" ||
        text.includes("pg_advisory_xact_lock") ||
        text.startsWith("LOCK TABLE organizations, memberships")
      ) return { rows: [] };
      if (text.includes("FROM identity_operations") && text.includes("operation = $2")) return { rows: [] };
      if (text.includes("FROM identity_operations") && text.includes("status IN")) return { rows: [] };
      if (text.includes("FROM users") && text.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: "user_sql_last_platform_admin",
            role: "platform_admin",
            account_status: "active",
          }],
        };
      }
      if (text.includes("COUNT(*)::integer AS count") && text.includes("role IN ('admin', 'platform_admin')")) {
        return { rows: [{ count: 0 }] };
      }
      throw new Error(`Unexpected SQL guard query: ${text}`);
    },
    release() {},
  };
  const sqlGuardPool = { connect: async () => sqlGuardClient };
  const staleAdminCacheDb = {
    users: [
      { id: "user_sql_last_platform_admin", role: "platform_admin", accountStatus: "active" },
      { id: "user_stale_extra_admin", role: "platform_admin", accountStatus: "active" },
    ],
    identityOperations: [],
  };
  const sqlGuardRepositories = createRepositories({
    getDb: () => staleAdminCacheDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_sql_guard`,
    nowIso: () => "2026-06-21T01:10:00.000Z",
    getPool: () => sqlGuardPool,
  });
  await assert.rejects(
    sqlGuardRepositories.identityOperations.begin({
      targetUserId: "user_sql_last_platform_admin",
      actorUserId: "user_workspace_actor",
      organizationId: "org_sql_last_admin_next",
      operation: "change_role",
      idempotencyKey: "sql-last-admin-demote",
      requestFingerprint: "sql-last-admin-demote-fingerprint",
      protectLastPlatformAdmin: true,
      targetState: {
        role: "workspace_admin",
        requestedRole: "workspace_admin",
        roleRequestStatus: "approved",
        organizationId: "org_sql_last_admin_next",
        accountStatus: "active",
        hospital: "SQL Last Admin Clinic",
      },
    }),
    (error) => error.code === "LAST_PLATFORM_ADMIN_REQUIRED",
  );
  assert.equal(
    sqlGuardQueries.some((query) => query.params[0] === "identity-operation:platform-admin-guard"),
    true,
  );
  assert.equal(sqlGuardQueries.filter((query) => query.text.includes("pg_advisory_xact_lock")).length, 3);

  const workspaceOwnerDb = {
    users: [
      { id: "user_workspace_owner", role: "workspace_owner", accountStatus: "active" },
      {
        id: "user_workspace_replacement",
        role: "workspace_owner",
        requestedRole: "workspace_owner",
        roleRequestStatus: "approved",
        organizationId: "org_workspace_guard",
        accountStatus: "active",
      },
      { id: "user_workspace_actor", role: "platform_admin", accountStatus: "active" },
    ],
    organizations: [
      {
        id: "org_workspace_guard",
        ownerUserId: "user_workspace_owner",
        workspaceType: "clinic",
        status: "active",
        version: 1,
      },
    ],
    memberships: [
      {
        id: "membership_workspace_owner",
        organizationId: "org_workspace_guard",
        userId: "user_workspace_owner",
        role: "workspace_owner",
      },
    ],
    identityOperations: [], authSessions: [], sessions: [], auditLogs: [],
  };
  let workspaceOwnerId = 0;
  const workspaceOwnerRepositories = createRepositories({
    getDb: () => workspaceOwnerDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_workspace_owner_${++workspaceOwnerId}`,
    nowIso: () => "2026-06-21T01:20:00.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    workspaceOwnerRepositories.identityOperations.begin({
      targetUserId: "user_workspace_owner",
      actorUserId: "user_workspace_actor",
      organizationId: "org_workspace_guard",
      operation: "lock",
      idempotencyKey: "workspace-owner-lock-before-transfer",
      requestFingerprint: "workspace-owner-lock-before-transfer-fingerprint",
    }),
    (error) =>
      error.code === "WORKSPACE_OWNER_TRANSFER_REQUIRED" &&
      error.details?.workspaceIds?.[0] === "org_workspace_guard",
  );
  await assert.rejects(
    workspaceOwnerRepositories.users.deleteById("user_workspace_owner"),
    (error) => error.code === "WORKSPACE_OWNER_TRANSFER_REQUIRED",
    "direct repository deletion must not bypass workspace owner transfer",
  );
  assert.equal(workspaceOwnerDb.identityOperations.length, 0);
  assert.equal(workspaceOwnerDb.users[0].accountStatus, "active");

  workspaceOwnerDb.organizations[0].ownerUserId = "user_workspace_replacement";
  await assert.rejects(
    workspaceOwnerRepositories.identityOperations.begin({
      targetUserId: "user_workspace_owner",
      actorUserId: "user_workspace_actor",
      organizationId: "org_workspace_guard",
      operation: "lock",
      idempotencyKey: "workspace-owner-lock-pointer-only",
      requestFingerprint: "workspace-owner-lock-pointer-only-fingerprint",
    }),
    (error) => error.code === "LAST_WORKSPACE_OWNER_REQUIRED",
    "changing only owner_user_id is not a complete transfer without an active owner membership",
  );
  workspaceOwnerDb.organizations[0].ownerUserId = "user_workspace_owner";
  workspaceOwnerDb.memberships.push({
    id: "membership_workspace_replacement",
    organizationId: "org_workspace_guard",
    userId: "user_workspace_replacement",
    role: "workspace_owner",
    status: "suspended",
    suspendedAt: "2026-06-20T12:00:00.000Z",
  });
  const ownerTransferIdempotency = {
    scope: "user_workspace_actor:org_workspace_guard",
    operation: "workspace.owner.transfer",
    key: "workspace-owner-transfer",
    fingerprint: "workspace-owner-transfer-fingerprint",
  };
  const ownerTransferReservation = await workspaceOwnerRepositories.organizations.beginOwnerTransfer({
    organizationId: "org_workspace_guard",
    newOwnerUserId: "user_workspace_replacement",
    actorUserId: "user_workspace_actor",
    expectedVersion: 1,
    idempotency: ownerTransferIdempotency,
  });
  assert.equal(ownerTransferReservation.state, "pending_provider");
  assert.ok(ownerTransferReservation.operationId);
  assert.equal(ownerTransferReservation.requiresIdentityTransition, true);
  assert.equal(workspaceOwnerDb.organizations[0].ownerUserId, "user_workspace_owner");
  assert.equal(
    workspaceOwnerDb.auditLogs.filter((item) => item.action === "workspace.owner.transfer.intent").length,
    1,
  );
  const ownerTransfer = await workspaceOwnerRepositories.organizations.completeOwnerTransfer({
    organizationId: "org_workspace_guard",
    newOwnerUserId: "user_workspace_replacement",
    actorUserId: "user_workspace_actor",
    expectedVersion: 1,
    idempotency: ownerTransferIdempotency,
  });
  assert.equal(ownerTransfer.replayed, false);
  assert.equal(ownerTransfer.previousOwnerUserId, "user_workspace_owner");
  assert.equal(workspaceOwnerDb.organizations[0].ownerUserId, "user_workspace_replacement");
  assert.equal(workspaceOwnerDb.organizations[0].version, 2);
  assert.equal(
    workspaceOwnerDb.memberships.find((item) => item.userId === "user_workspace_replacement").role,
    "workspace_owner",
  );
  assert.equal(
    workspaceOwnerDb.memberships.find((item) => item.userId === "user_workspace_replacement").status,
    "active",
    "owner transfer completion must reactivate the canonical owner membership",
  );
  assert.equal(
    workspaceOwnerDb.auditLogs.filter((item) => item.action === "workspace.owner.transfer.completed").length,
    1,
  );
  const ownerTransferReplay = await workspaceOwnerRepositories.organizations.beginOwnerTransfer({
    organizationId: "org_workspace_guard",
    newOwnerUserId: "user_workspace_replacement",
    actorUserId: "user_workspace_actor",
    expectedVersion: 1,
    idempotency: ownerTransferIdempotency,
  });
  assert.equal(ownerTransferReplay.replayed, true);
  assert.equal(ownerTransferReplay.operationId, ownerTransferReservation.operationId);
  assert.equal(
    workspaceOwnerDb.auditLogs.filter((item) => item.action === "workspace.owner.transfer.completed").length,
    1,
    "owner transfer replay must not append a second audit record",
  );
  await assert.rejects(
    workspaceOwnerRepositories.organizations.beginOwnerTransfer({
      organizationId: "org_workspace_guard",
      newOwnerUserId: "user_workspace_actor",
      actorUserId: "user_workspace_actor",
      expectedVersion: 1,
      idempotency: { ...ownerTransferIdempotency, fingerprint: "workspace-owner-transfer-conflict" },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.equal(workspaceOwnerDb.organizations[0].ownerUserId, "user_workspace_replacement");
  const ownerLockAfterTransfer = await workspaceOwnerRepositories.identityOperations.begin({
    targetUserId: "user_workspace_owner",
    actorUserId: "user_workspace_actor",
    organizationId: "org_workspace_guard",
    operation: "lock",
    idempotencyKey: "workspace-owner-lock-after-transfer",
    requestFingerprint: "workspace-owner-lock-after-transfer-fingerprint",
  });
  assert.equal(ownerLockAfterTransfer.identityOperation.status, "pending_provider");

  const lastWorkspaceOwnerDb = {
    users: [
      { id: "user_last_workspace_owner", role: "workspace_owner", accountStatus: "active" },
      { id: "user_pending_workspace_owner", role: "patient", accountStatus: "active" },
      { id: "user_last_workspace_actor", role: "platform_admin", accountStatus: "active" },
    ],
    organizations: [
      { id: "org_last_workspace_owner", ownerUserId: "", workspaceType: "clinic", status: "active" },
    ],
    memberships: [
      {
        id: "membership_last_workspace_owner",
        organizationId: "org_last_workspace_owner",
        userId: "user_last_workspace_owner",
        role: "workspace_owner",
      },
      {
        id: "membership_pending_workspace_owner",
        organizationId: "org_last_workspace_owner",
        userId: "user_pending_workspace_owner",
        role: "workspace_owner",
      },
    ],
    identityOperations: [], authSessions: [], sessions: [], auditLogs: [],
  };
  const lastWorkspaceOwnerRepositories = createRepositories({
    getDb: () => lastWorkspaceOwnerDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_last_workspace_owner`,
    nowIso: () => "2026-06-21T01:21:00.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    lastWorkspaceOwnerRepositories.identityOperations.begin({
      targetUserId: "user_last_workspace_owner",
      actorUserId: "user_last_workspace_actor",
      organizationId: "org_last_workspace_owner",
      operation: "change_role",
      idempotencyKey: "last-workspace-owner-demotion",
      requestFingerprint: "last-workspace-owner-demotion-fingerprint",
      targetState: {
        role: "viewer",
        requestedRole: "viewer",
        roleRequestStatus: "approved",
        organizationId: "org_last_workspace_owner",
        accountStatus: "active",
      },
    }),
    (error) => error.code === "LAST_WORKSPACE_OWNER_REQUIRED",
  );

  const providerAppliedOwnerDb = {
    users: [
      { id: "user_late_workspace_owner", role: "doctor", accountStatus: "active" },
      { id: "user_late_workspace_replacement", role: "workspace_owner", accountStatus: "active" },
      { id: "user_late_workspace_actor", role: "platform_admin", accountStatus: "active" },
    ],
    organizations: [
      {
        id: "org_late_workspace_owner",
        ownerUserId: "user_late_workspace_replacement",
        workspaceType: "clinic",
        status: "active",
      },
    ],
    memberships: [], identityOperations: [], authSessions: [], sessions: [], auditLogs: [],
    patients: [], doctorPatientAccess: [], notificationDevices: [], twoFactorCredentials: [],
    twoFactorEnrollments: [], twoFactorChallenges: [], twoFactorTokens: [], deviceClaims: [],
    devices: [], scans: [], appointments: [], notifications: [], chatMessages: [],
  };
  let providerAppliedOwnerId = 0;
  const providerAppliedOwnerRepositories = createRepositories({
    getDb: () => providerAppliedOwnerDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_late_workspace_owner_${++providerAppliedOwnerId}`,
    nowIso: () => "2026-06-21T01:22:00.000Z",
    getPool: () => null,
  });
  const lateOwnerDelete = await providerAppliedOwnerRepositories.identityOperations.begin({
    targetUserId: "user_late_workspace_owner",
    actorUserId: "user_late_workspace_actor",
    organizationId: "org_late_workspace_owner",
    operation: "delete",
    idempotencyKey: "late-workspace-owner-delete",
    requestFingerprint: "late-workspace-owner-delete-fingerprint",
  });
  await providerAppliedOwnerRepositories.identityOperations.markProviderApplied({
    operationId: lateOwnerDelete.identityOperation.id,
    providerStatus: "deleted",
    providerResult: { firebaseDeleted: true },
  });
  providerAppliedOwnerDb.organizations[0].ownerUserId = "user_late_workspace_owner";
  await assert.rejects(
    providerAppliedOwnerRepositories.identityOperations.complete({
      operationId: lateOwnerDelete.identityOperation.id,
      providerSucceeded: true,
    }),
    (error) => error.code === "WORKSPACE_OWNER_TRANSFER_REQUIRED",
  );
  assert.equal(
    providerAppliedOwnerDb.identityOperations[0].status,
    "provider_applied",
    "a late owner assignment must leave the provider-applied saga retryable without deleting the graph",
  );
  assert.equal(providerAppliedOwnerDb.users.some((user) => user.id === "user_late_workspace_owner"), true);
  providerAppliedOwnerDb.organizations[0].ownerUserId = "user_late_workspace_replacement";
  const completedLateOwnerDelete = await providerAppliedOwnerRepositories.identityOperations.complete({
    operationId: lateOwnerDelete.identityOperation.id,
    providerSucceeded: true,
  });
  assert.equal(completedLateOwnerDelete.deleted, true);

  const sqlWorkspaceOwnerQueries = [];
  const sqlWorkspaceOwnerClient = {
    async query(sql, params = []) {
      const text = String(sql);
      sqlWorkspaceOwnerQueries.push({ text, params });
      if (["BEGIN", "ROLLBACK"].includes(text) || text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("FROM identity_operations") && text.includes("operation = $2")) return { rows: [] };
      if (text.includes("FROM identity_operations") && text.includes("status IN")) return { rows: [] };
      if (text.includes("SELECT * FROM users") && text.includes("FOR UPDATE")) {
        return { rows: [{ id: "user_sql_workspace_owner", role: "workspace_owner", account_status: "active" }] };
      }
      if (text.startsWith("LOCK TABLE organizations, memberships")) return { rows: [] };
      if (text.includes("WITH related_workspaces AS") && text.includes("owner_candidates")) {
        return { rows: [{ id: "user_sql_workspace_owner" }] };
      }
      if (text.includes("FROM organizations") && text.includes("owner_user_id = $1") && text.includes("FOR UPDATE")) {
        return { rows: [{ id: "org_sql_workspace_owner" }] };
      }
      throw new Error(`Unexpected SQL workspace owner query: ${text}`);
    },
    release() {},
  };
  const sqlWorkspaceOwnerRepositories = createRepositories({
    getDb: () => ({
      users: [{ id: "user_sql_workspace_owner", role: "workspace_owner", accountStatus: "active" }],
      organizations: [], memberships: [], identityOperations: [], auditLogs: [],
    }),
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_sql_workspace_owner`,
    nowIso: () => "2026-06-21T01:23:00.000Z",
    getPool: () => ({ connect: async () => sqlWorkspaceOwnerClient }),
  });
  await assert.rejects(
    sqlWorkspaceOwnerRepositories.identityOperations.begin({
      targetUserId: "user_sql_workspace_owner",
      actorUserId: "user_workspace_actor",
      organizationId: "org_sql_workspace_owner",
      operation: "lock",
      idempotencyKey: "sql-workspace-owner-lock",
      requestFingerprint: "sql-workspace-owner-lock-fingerprint",
    }),
    (error) => error.code === "WORKSPACE_OWNER_TRANSFER_REQUIRED",
  );
  assert.equal(sqlWorkspaceOwnerQueries.at(-1).text, "ROLLBACK");
  assert.equal(
    sqlWorkspaceOwnerQueries.some((query) => query.text.startsWith("LOCK TABLE organizations, memberships")),
    true,
  );
  assert.equal(
    sqlWorkspaceOwnerQueries.some((query) => query.text.includes("UPDATE users SET account_status")),
    false,
    "canonical workspace ownership must be checked before any account status mutation",
  );

  const sqlOwnerTransferQueries = [];
  const sqlOwnerTransferState = {
    organization: {
      id: "org_sql_owner_transfer",
      name: "SQL Owner Transfer Clinic",
      type: "clinic",
      workspace_type: "clinic",
      status: "active",
      owner_user_id: "user_sql_owner_before",
      version: 1,
    },
    replacement: {
      id: "user_sql_owner_after",
      role: "workspace_owner",
      requested_role: "workspace_owner",
      role_request_status: "approved",
      organization_id: "org_sql_owner_transfer",
      account_status: "active",
      name: "SQL Replacement Owner",
    },
    membership: {
      id: "membership_sql_owner_after",
      organization_id: "org_sql_owner_transfer",
      user_id: "user_sql_owner_after",
      role: "workspace_owner",
      status: "suspended",
      suspended_at: "2026-06-20T12:00:00.000Z",
      created_at: "2026-06-21T01:24:00.000Z",
    },
    idempotency: null,
    auditCount: 0,
    auditActions: [],
  };
  const sqlOwnerTransferClient = {
    async query(sql, params = []) {
      const text = String(sql);
      sqlOwnerTransferQueries.push({ text, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text) || text.includes("pg_advisory_xact_lock")) {
        return { rows: [] };
      }
      if (text.startsWith("LOCK TABLE organizations, memberships")) return { rows: [] };
      if (text.includes("FROM mutation_idempotency") && text.includes("idempotency_key = $3")) {
        const replay = sqlOwnerTransferState.idempotency;
        return {
          rows:
            replay &&
            replay.scope === params[0] &&
            replay.operation === params[1] &&
            replay.idempotency_key === params[2]
              ? [replay]
              : [],
        };
      }
      if (text.includes("FROM mutation_idempotency") && text.includes("response_status = 202")) {
        return { rows: [] };
      }
      if (text.includes("SELECT * FROM organizations") && text.includes("FOR UPDATE")) {
        return { rows: [{ ...sqlOwnerTransferState.organization }] };
      }
      if (text.includes("SELECT * FROM users") && text.includes("FOR UPDATE")) {
        return { rows: [{ ...sqlOwnerTransferState.replacement }] };
      }
      if (text.includes("SELECT *") && text.includes("FROM memberships") && text.includes("FOR UPDATE")) {
        return { rows: sqlOwnerTransferState.membership ? [{ ...sqlOwnerTransferState.membership }] : [] };
      }
      if (text.includes("UPDATE organizations") && text.includes("SET owner_user_id")) {
        if (text.includes("version = version + 1")) {
          if (Number(sqlOwnerTransferState.organization.version) !== Number(params[3])) {
            return { rows: [] };
          }
          sqlOwnerTransferState.organization.version += 1;
        }
        sqlOwnerTransferState.organization.owner_user_id = params[1];
        return { rows: [{ ...sqlOwnerTransferState.organization }] };
      }
      if (text.includes("INSERT INTO memberships") && text.includes("RETURNING *")) {
        sqlOwnerTransferState.membership = {
          id: params[0], organization_id: params[1], user_id: params[2],
          role: "workspace_owner", status: "active", suspended_at: null,
          created_at: "2026-06-21T01:24:00.000Z",
        };
        return { rows: [{ ...sqlOwnerTransferState.membership }] };
      }
      if (text.includes("INSERT INTO audit_logs")) {
        sqlOwnerTransferState.auditCount += 1;
        sqlOwnerTransferState.auditActions.push(params[3]);
        return { rows: [] };
      }
      if (text.includes("INSERT INTO mutation_idempotency")) {
        sqlOwnerTransferState.idempotency = {
          scope: params[1],
          operation: params[2],
          idempotency_key: params[3],
          fingerprint: params[4],
          response_status: params[7],
          response_json: JSON.parse(params[8]),
          resource_type: params[5],
          resource_id: params[6],
        };
        return { rows: [] };
      }
      if (text.includes("UPDATE mutation_idempotency")) {
        sqlOwnerTransferState.idempotency = {
          ...sqlOwnerTransferState.idempotency,
          response_status: 200,
          response_json: JSON.parse(params[3]),
        };
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL owner transfer query: ${text}`);
    },
    release() {},
  };
  const sqlOwnerTransferRuntimeDb = {
    users: [],
    organizations: [],
    memberships: [],
    identityOperations: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  let sqlOwnerTransferId = 0;
  const sqlOwnerTransferRepositories = createRepositories({
    getDb: () => sqlOwnerTransferRuntimeDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_sql_owner_transfer_${++sqlOwnerTransferId}`,
    nowIso: () => "2026-06-21T01:24:00.000Z",
    getPool: () => ({ connect: async () => sqlOwnerTransferClient }),
  });
  const sqlOwnerTransferIdempotency = {
    scope: "user_sql_owner_actor:org_sql_owner_transfer",
    operation: "workspace.owner.transfer",
    key: "sql-owner-transfer",
    fingerprint: "sql-owner-transfer-fingerprint",
  };
  const sqlOwnerTransferReservation = await sqlOwnerTransferRepositories.organizations.beginOwnerTransfer({
    organizationId: "org_sql_owner_transfer",
    newOwnerUserId: "user_sql_owner_after",
    actorUserId: "user_sql_owner_actor",
    expectedVersion: 1,
    idempotency: sqlOwnerTransferIdempotency,
  });
  assert.equal(sqlOwnerTransferReservation.state, "pending_provider");
  assert.ok(sqlOwnerTransferReservation.operationId);
  assert.equal(sqlOwnerTransferReservation.requiresIdentityTransition, true);
  assert.equal(sqlOwnerTransferState.organization.owner_user_id, "user_sql_owner_before");
  assert.deepEqual(sqlOwnerTransferState.auditActions, ["workspace.owner.transfer.intent"]);
  const sqlOwnerTransfer = await sqlOwnerTransferRepositories.organizations.completeOwnerTransfer({
    organizationId: "org_sql_owner_transfer",
    newOwnerUserId: "user_sql_owner_after",
    actorUserId: "user_sql_owner_actor",
    expectedVersion: 1,
    idempotency: sqlOwnerTransferIdempotency,
  });
  assert.equal(sqlOwnerTransfer.replayed, false);
  assert.equal(sqlOwnerTransfer.previousOwnerUserId, "user_sql_owner_before");
  assert.equal(sqlOwnerTransfer.organization.ownerUserId, "user_sql_owner_after");
  assert.equal(sqlOwnerTransfer.organization.version, 2);
  assert.equal(sqlOwnerTransferState.organization.version, 2);
  assert.equal(sqlOwnerTransfer.membership.role, "workspace_owner");
  assert.equal(sqlOwnerTransfer.membership.status, "active");
  assert.equal(
    sqlOwnerTransferQueries.some((query) =>
      query.text.includes("INSERT INTO memberships") &&
      query.text.includes("status = 'active'") &&
      query.text.includes("suspended_at = NULL")),
    true,
    "SQL owner transfer must clear suspension while promoting the replacement owner",
  );
  assert.equal(sqlOwnerTransferState.auditCount, 2);
  assert.deepEqual(sqlOwnerTransferState.auditActions, [
    "workspace.owner.transfer.intent",
    "workspace.owner.transfer.completed",
  ]);
  assert.equal(sqlOwnerTransferQueries[0].text, "BEGIN");
  assert.equal(sqlOwnerTransferQueries.at(-1).text, "COMMIT");
  const sqlOwnerTransferAuditIndex = sqlOwnerTransferQueries.findIndex((query) => query.text.includes("INSERT INTO audit_logs"));
  const sqlOwnerTransferIdemIndex = sqlOwnerTransferQueries.findIndex(
    (query) => query.text.includes("INSERT INTO mutation_idempotency"),
  );
  assert.equal(sqlOwnerTransferAuditIndex > 0 && sqlOwnerTransferAuditIndex < sqlOwnerTransferIdemIndex, true);
  const sqlOwnerTransferReplay = await sqlOwnerTransferRepositories.organizations.beginOwnerTransfer({
    organizationId: "org_sql_owner_transfer",
    newOwnerUserId: "user_sql_owner_after",
    actorUserId: "user_sql_owner_actor",
    expectedVersion: 1,
    idempotency: sqlOwnerTransferIdempotency,
  });
  assert.equal(sqlOwnerTransferReplay.replayed, true);
  assert.equal(sqlOwnerTransferReplay.state, "completed");
  assert.equal(sqlOwnerTransferReplay.operationId, sqlOwnerTransferReservation.operationId);
  assert.equal(sqlOwnerTransferState.auditCount, 2);
  await assert.rejects(
    sqlOwnerTransferRepositories.organizations.beginOwnerTransfer({
      organizationId: "org_sql_owner_transfer",
      newOwnerUserId: "user_sql_owner_after",
      actorUserId: "user_sql_owner_actor",
      expectedVersion: 1,
      idempotency: {
        ...sqlOwnerTransferIdempotency,
        key: "sql-owner-transfer-stale",
        fingerprint: "sql-owner-transfer-stale-fingerprint",
      },
    }),
    (error) =>
      error.code === "WORKSPACE_VERSION_CONFLICT" &&
      error.details?.currentVersion === 2,
  );
  assert.equal(sqlOwnerTransferQueries.at(-1).text, "ROLLBACK");
  assert.equal(sqlOwnerTransferState.auditCount, 2);
  await assert.rejects(
    sqlOwnerTransferRepositories.organizations.beginOwnerTransfer({
      organizationId: "org_sql_owner_transfer",
      newOwnerUserId: "user_sql_owner_conflict",
      actorUserId: "user_sql_owner_actor",
      expectedVersion: 1,
      idempotency: { ...sqlOwnerTransferIdempotency, fingerprint: "sql-owner-transfer-conflict" },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  assert.equal(sqlOwnerTransferQueries.at(-1).text, "ROLLBACK");
  assert.equal(sqlOwnerTransferState.auditCount, 2);

  const identityMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "014_identity_profile_contracts.sql"),
    "utf8",
  );
  assert.match(identityMigration, /WITH\s+unique_patient_accounts\s+AS/i);
  assert.match(identityMigration, /HAVING\s+COUNT\(\*\)\s*=\s*1/i);
  assert.match(identityMigration, /account_user_id\s*=\s*COALESCE\(patients\.account_user_id,\s*unique_patient_accounts\.user_id\)/i);
  assert.match(identityMigration, /owner_user_id\s*=\s*COALESCE\(patients\.owner_user_id,\s*unique_patient_accounts\.user_id\)/i);
  assert.match(identityMigration, /patients\.deleted_at\s+IS\s+NULL/i);
  assert.match(identityMigration, /account\.organization_id\s+IS\s+NOT\s+DISTINCT\s+FROM\s+legacy_patient\.organization_id/i);
  assert.doesNotMatch(
    identityMigration,
    /WHEN\s+account_user_id\s*=\s*owner_user_id\s+OR\s+EXISTS/i,
    "ambiguous users.patient_id aliases must not classify a profile as self",
  );
  assert.match(identityMigration, /account_user_id\s+text\s+REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i);
  const securityMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "015_identity_security_hardening.sql"),
    "utf8",
  );
  assert.match(securityMigration, /ALTER\s+TABLE\s+public\.%I\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(securityMigration, /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.%I\s+FROM\s+PUBLIC/i);
  assert.match(securityMigration, /FROM\s+anon/i);
  assert.match(securityMigration, /FROM\s+authenticated/i);
  assert.match(securityMigration, /operation\s+IN\s*\([^)]*'change_role'/i);
  assert.match(securityMigration, /target_state\s+jsonb\s+NOT\s+NULL\s+DEFAULT\s+'\{\}'::jsonb/i);
  const exportRepositoryDb = {
    exports: [],
    organizations: [
      { id: "org_export_alpha", name: "Phòng khám Xuất Alpha" },
      { id: "org_export_beta", name: "Beta Private Workspace" },
    ],
    users: [
      { id: "user_export_actor", name: "Nguyễn Kiểm Toán", role: "workspace_admin" },
      { id: "user_export_other", name: "Other Exporter", role: "workspace_admin" },
      { id: "user_export_beta", name: "Beta Exporter", role: "workspace_admin" },
    ],
    patients: [
      {
        id: "patient_export_alpha",
        organizationId: "org_export_alpha",
        patientCode: "EXPORT-A-001",
        name: "Alpha Export Patient",
        createdAt: "2026-06-21T08:00:00.000Z",
        updatedAt: "2026-06-21T08:00:00.000Z",
      },
      {
        id: "patient_export_alpha_old",
        organizationId: "org_export_alpha",
        patientCode: "EXPORT-A-OLD",
        name: "Historical Alpha Patient",
        createdAt: "2020-01-01T08:00:00.000Z",
        updatedAt: "2020-01-01T08:00:00.000Z",
      },
      {
        id: "patient_export_beta",
        organizationId: "org_export_beta",
        patientCode: "EXPORT-B-001",
        name: "Beta Private Patient",
        createdAt: "2026-06-21T08:00:00.000Z",
        updatedAt: "2026-06-21T08:00:00.000Z",
      },
    ],
    devices: [
      {
        id: "device_export_alpha",
        organizationId: "org_export_alpha",
        assignedPatientId: "patient_export_alpha",
        name: "Alpha Export Device",
        deviceSecret: "must-not-leave-the-repository",
        credentialHash: "must-not-leave-the-repository-either",
        createdAt: "2026-06-21T08:10:00.000Z",
        updatedAt: "2026-06-21T08:10:00.000Z",
      },
      {
        id: "device_export_beta",
        organizationId: "org_export_beta",
        assignedPatientId: "patient_export_beta",
        name: "Beta Private Device",
        createdAt: "2026-06-21T08:10:00.000Z",
        updatedAt: "2026-06-21T08:10:00.000Z",
      },
    ],
    scans: [
      {
        id: "scan_export_alpha",
        organizationId: "org_export_alpha",
        patientId: "patient_export_alpha",
        deviceId: "device_export_alpha",
        status: "completed",
        createdAt: "2026-06-21T08:20:00.000Z",
        updatedAt: "2026-06-21T08:20:00.000Z",
      },
      {
        id: "scan_export_alpha_old",
        organizationId: "org_export_alpha",
        patientId: "patient_export_alpha_old",
        status: "completed",
        createdAt: "2020-01-01T08:20:00.000Z",
        updatedAt: "2020-01-01T08:20:00.000Z",
      },
      {
        id: "scan_export_beta",
        organizationId: "org_export_beta",
        patientId: "patient_export_beta",
        status: "completed",
        createdAt: "2026-06-21T08:20:00.000Z",
        updatedAt: "2026-06-21T08:20:00.000Z",
      },
    ],
    appointments: [
      {
        id: "appointment_export_alpha",
        organizationId: "org_export_alpha",
        patientId: "patient_export_alpha",
        doctorUserId: "doctor_export_alpha",
        status: "scheduled",
        startsAt: "2026-06-22T09:00:00.000Z",
        endsAt: "2026-06-22T09:30:00.000Z",
        createdAt: "2026-06-21T08:30:00.000Z",
        updatedAt: "2026-06-21T08:30:00.000Z",
      },
      {
        id: "appointment_export_beta",
        organizationId: "org_export_beta",
        patientId: "patient_export_beta",
        status: "scheduled",
        startsAt: "2026-06-22T10:00:00.000Z",
        endsAt: "2026-06-22T10:30:00.000Z",
        createdAt: "2026-06-21T08:30:00.000Z",
        updatedAt: "2026-06-21T08:30:00.000Z",
      },
    ],
    audioFiles: [
      {
        id: "audio_export_alpha",
        scanId: "scan_export_alpha",
        patientId: "patient_export_alpha",
        objectKey: "private/org_export_alpha/raw-audio.pcm",
        filePath: "D:/private/raw-audio.pcm",
        signedUrl: "https://private.example/raw-audio.pcm",
        contentType: "audio/L16",
        byteSize: 2048,
        sampleRate: 16000,
        createdAt: "2026-06-21T08:40:00.000Z",
      },
      {
        id: "audio_export_beta",
        scanId: "scan_export_beta",
        patientId: "patient_export_beta",
        objectKey: "private/org_export_beta/raw-audio.pcm",
        createdAt: "2026-06-21T08:40:00.000Z",
      },
    ],
    aiResults: [
      {
        id: "report_export_alpha",
        scanId: "scan_export_alpha",
        status: "completed",
        label: "normal",
        rawResult: { providerTrace: "must-not-leave-the-repository" },
        createdAt: "2026-06-21T08:50:00.000Z",
        updatedAt: "2026-06-21T08:50:00.000Z",
      },
      {
        id: "report_export_beta",
        scanId: "scan_export_beta",
        status: "completed",
        label: "private-beta-result",
        createdAt: "2026-06-21T08:50:00.000Z",
        updatedAt: "2026-06-21T08:50:00.000Z",
      },
    ],
    auditLogs: [
      {
        id: "audit_export_alpha_download",
        actorUserId: "user_export_actor",
        organizationId: "org_export_alpha",
        action: "export.download",
        resourceType: "export",
        resourceId: "export_previous_alpha",
        ip: "127.0.0.1",
        userAgent: "Shcare smoke",
        metadata: {
          format: "json",
          nested: {
            accessToken: "must-be-redacted",
            oneTimeCode: "123456",
            totpSeed: "totp-secret-seed",
            recoveryCode: "recovery-code",
            claimCode: "claim-code",
            proofOfPossession: "device-pop",
            verificationLink: "https://private.example/verify",
            resetLink: "https://private.example/reset",
            note: "giữ lại",
          },
        },
        createdAt: "2026-06-21T09:00:00.000Z",
      },
      {
        id: "audit_export_alpha_create",
        actorUserId: "user_export_other",
        organizationId: "org_export_alpha",
        action: "patient.update",
        resourceType: "patient",
        resourceId: "patient_export_alpha",
        metadata: { format: "csv" },
        createdAt: "2026-06-20T09:00:00.000Z",
      },
      {
        id: "audit_export_beta_download",
        actorUserId: "user_export_beta",
        organizationId: "org_export_beta",
        action: "export.download",
        resourceType: "export",
        resourceId: "export_private_beta",
        metadata: { private: true },
        createdAt: "2026-06-21T09:00:00.000Z",
      },
    ],
    idempotencyKeys: [],
  };
  let exportRepositoryId = 0;
  const exportRepositories = createRepositories({
    getDb: () => exportRepositoryDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_export_repository_${++exportRepositoryId}`,
    nowIso: () => "2026-06-21T12:00:00.000Z",
    getPool: () => null,
  });
  const exportSnapshot = await exportRepositories.exports.buildSnapshot({
    exportId: "export_repository_alpha",
    organizationId: "org_export_alpha",
    generatedAt: "2026-06-21T12:00:00.000Z",
    startDate: "2026-06-21",
    endDate: "2026-06-21",
    includeAudio: true,
    includeReports: true,
    includeHistory: true,
  });
  assert.equal(exportSnapshot.schemaVersion, "shcare.export.v1");
  assert.equal(exportSnapshot.scope.organizationId, "org_export_alpha");
  assert.deepEqual(exportSnapshot.data.patients.map((item) => item.id), ["patient_export_alpha"]);
  assert.deepEqual(exportSnapshot.data.devices.map((item) => item.id), ["device_export_alpha"]);
  assert.deepEqual(exportSnapshot.data.scans.map((item) => item.id), ["scan_export_alpha"]);
  assert.deepEqual(exportSnapshot.data.appointments.map((item) => item.id), ["appointment_export_alpha"]);
  assert.deepEqual(exportSnapshot.data.audioFiles.map((item) => item.id), ["audio_export_alpha"]);
  assert.deepEqual(exportSnapshot.data.reports.map((item) => item.id), ["report_export_alpha"]);
  assert.equal(exportSnapshot.counts.total, 6);
  assert.equal(Object.hasOwn(exportSnapshot.data.devices[0], "deviceSecret"), false);
  assert.equal(Object.hasOwn(exportSnapshot.data.devices[0], "credentialHash"), false);
  assert.equal(Object.hasOwn(exportSnapshot.data.audioFiles[0], "objectKey"), false);
  assert.equal(Object.hasOwn(exportSnapshot.data.audioFiles[0], "filePath"), false);
  assert.equal(Object.hasOwn(exportSnapshot.data.audioFiles[0], "signedUrl"), false);
  assert.equal(Object.hasOwn(exportSnapshot.data.reports[0], "rawResult"), false);
  assert.equal(JSON.stringify(exportSnapshot).includes("org_export_beta"), false);

  const assignedPatientSnapshot = await exportRepositories.exports.buildSnapshot({
    exportId: "export_repository_assigned_patient",
    organizationId: "org_export_alpha",
    generatedAt: "2026-06-21T12:00:00.000Z",
    scopeKind: "assigned_patients",
    actorUserId: "user_export_actor",
    restrictToPatientIds: true,
    patientIds: ["patient_export_alpha"],
    includeAudio: true,
    includeReports: true,
    includeHistory: true,
  });
  assert.equal(assignedPatientSnapshot.scope.kind, "assigned_patients");
  assert.deepEqual(assignedPatientSnapshot.scope.patientIds, ["patient_export_alpha"]);
  assert.deepEqual(assignedPatientSnapshot.data.patients.map((item) => item.id), ["patient_export_alpha"]);
  assert.deepEqual(assignedPatientSnapshot.data.devices.map((item) => item.id), ["device_export_alpha"]);
  assert.equal(JSON.stringify(assignedPatientSnapshot).includes("patient_export_alpha_old"), false);
  assert.equal(JSON.stringify(assignedPatientSnapshot).includes("org_export_beta"), false);

  const emptyAssignedPatientSnapshot = await exportRepositories.exports.buildSnapshot({
    exportId: "export_repository_no_assigned_patient",
    organizationId: "org_export_alpha",
    generatedAt: "2026-06-21T12:00:00.000Z",
    scopeKind: "assigned_patients",
    actorUserId: "user_export_actor",
    restrictToPatientIds: true,
    patientIds: [],
    includeAudio: true,
    includeReports: true,
    includeHistory: true,
  });
  assert.equal(emptyAssignedPatientSnapshot.counts.total, 0, "an actor without grants must receive an empty export");

  const auditSnapshot = await exportRepositories.exports.buildSnapshot({
    exportId: "export_repository_audit",
    organizationId: "org_export_alpha",
    generatedAt: "2026-06-21T12:00:00.000Z",
    dataset: "audit_logs",
    scopeKind: "workspace",
    actorUserId: "user_export_actor",
    auditFilters: {
      action: "export.download",
      resourceType: "export",
      startDate: "2026-06-21",
      endDate: "2026-06-21",
      sort: "createdAt:desc",
    },
  });
  assert.equal(auditSnapshot.dataset, "audit_logs");
  assert.equal(auditSnapshot.counts.total, 1);
  assert.deepEqual(auditSnapshot.data.auditLogs.map((item) => item.id), ["audit_export_alpha_download"]);
  assert.equal(auditSnapshot.data.auditLogs[0].actorName, "Nguyễn Kiểm Toán");
  assert.equal(auditSnapshot.data.auditLogs[0].organizationName, "Phòng khám Xuất Alpha");
  assert.equal(auditSnapshot.data.auditLogs[0].metadata.nested.accessToken, "[REDACTED]");
  for (const sensitiveKey of [
    "oneTimeCode",
    "totpSeed",
    "recoveryCode",
    "claimCode",
    "proofOfPossession",
    "verificationLink",
    "resetLink",
  ]) {
    assert.equal(auditSnapshot.data.auditLogs[0].metadata.nested[sensitiveKey], "[REDACTED]");
  }
  assert.equal(auditSnapshot.data.auditLogs[0].metadata.nested.note, "giữ lại");
  assert.equal(JSON.stringify(auditSnapshot).includes("export_private_beta"), false);
  const auditFirstPage = await exportRepositories.auditLogs.list({
    organizationId: "org_export_alpha",
    page: 1,
    limit: 1,
    sort: "createdAt:desc",
  });
  assert.equal(auditFirstPage.total, 2);
  assert.deepEqual(auditFirstPage.items.map((item) => item.id), ["audit_export_alpha_download"]);
  const auditSecondPage = await exportRepositories.auditLogs.list({
    organizationId: "org_export_alpha",
    page: 2,
    limit: 1,
    sort: "createdAt:desc",
  });
  assert.deepEqual(auditSecondPage.items.map((item) => item.id), ["audit_export_alpha_create"]);
  const auditSearch = await exportRepositories.auditLogs.list({
    organizationId: "org_export_alpha",
    q: "download",
    action: "export.download",
    resourceType: "export",
    startDate: "2026-06-21",
    endDate: "2026-06-21",
  });
  assert.deepEqual(auditSearch.items.map((item) => item.id), ["audit_export_alpha_download"]);
  const auditMetadataOracleProbe = await exportRepositories.auditLogs.list({
    organizationId: "org_export_alpha",
    q: "must-be-redacted",
  });
  assert.equal(
    auditMetadataOracleProbe.total,
    0,
    "audit free-text search must not reveal whether a secret exists inside metadata",
  );

  const exportJob = {
    id: "export_repository_alpha",
    organizationId: "org_export_alpha",
    createdByUserId: "user_export_actor",
    format: "json",
    dataset: "clinical_bundle",
    scopeKind: "workspace",
    filters: exportSnapshot.filters,
    rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
    status: "ready",
    includeAudio: true,
    includeReports: true,
    includeHistory: true,
    startDate: "2026-06-21",
    endDate: "2026-06-21",
    snapshot: exportSnapshot,
    createdAt: "2026-06-21T12:00:00.000Z",
    updatedAt: "2026-06-21T12:00:00.000Z",
  };
  const exportIdempotency = {
    scope: "user_export_actor:org_export_alpha",
    operation: "export.create",
    key: "export-repository-alpha",
    fingerprint: "export-repository-alpha-fingerprint",
  };
  await assert.rejects(
    exportRepositories.exports.createWithAudit(
      { ...exportJob, dataset: "audit_logs" },
      { action: "export.create", actorUserId: "user_export_actor" },
      { ...exportIdempotency, key: "export-dataset-mismatch" },
    ),
    (error) => error.statusCode === 400 && error.code === "EXPORT_SNAPSHOT_INVALID",
  );
  await assert.rejects(
    exportRepositories.exports.createWithAudit(
      { ...exportJob, scopeKind: "personal" },
      { action: "export.create", actorUserId: "user_export_actor" },
      { ...exportIdempotency, key: "export-scope-mismatch" },
    ),
    (error) => error.statusCode === 400 && error.code === "EXPORT_SNAPSHOT_INVALID",
  );
  await assert.rejects(
    exportRepositories.exports.createWithAudit(
      {
        ...exportJob,
        scopeKind: "cross_tenant_dump",
        snapshot: {
          ...structuredClone(exportJob.snapshot),
          scope: { ...exportJob.snapshot.scope, kind: "cross_tenant_dump" },
        },
      },
      { action: "export.create", actorUserId: "user_export_actor" },
      { ...exportIdempotency, key: "export-unsupported-scope" },
    ),
    (error) => error.statusCode === 422 && error.code === "EXPORT_SCOPE_KIND_UNSUPPORTED",
  );
  const createdExport = await exportRepositories.exports.createWithAudit(
    exportJob,
    { action: "export.create", actorUserId: "user_export_actor" },
    exportIdempotency,
  );
  assert.equal(createdExport.replayed, false);
  assert.equal(createdExport.exportJob.id, "export_repository_alpha");
  assert.equal(createdExport.exportJob.recordCount, 6);
  const expectedJsonArtifact = await buildExportArtifact(
    exportSnapshot,
    "json",
    EXPORT_ARTIFACT_RENDERER_VERSION,
  );
  assert.equal(createdExport.exportJob.artifactByteSize, expectedJsonArtifact.buffer.length);
  assert.equal(
    createdExport.exportJob.artifactSha256,
    crypto.createHash("sha256").update(expectedJsonArtifact.buffer).digest("hex"),
  );
  assert.equal(createdExport.exportJob.rendererVersion, EXPORT_ARTIFACT_RENDERER_VERSION);
  assert.equal(exportRepositoryDb.exports.length, 1);
  assert.equal(exportRepositoryDb.auditLogs.filter((item) => item.action === "export.create").length, 1);
  assert.equal(exportRepositoryDb.idempotencyKeys.length, 1);

  exportSnapshot.data.patients[0].name = "Mutated caller snapshot";
  exportRepositoryDb.patients[0].name = "Mutated current patient";
  const immutableStoredExport = await exportRepositories.exports.findById("export_repository_alpha");
  assert.equal(
    immutableStoredExport.snapshot.data.patients[0].name,
    "Alpha Export Patient",
    "the artifact must remain bound to the creation-time snapshot",
  );
  assert.equal(await exportRepositories.exports.findById("export_repository_unknown"), null);

  const replayedExport = await exportRepositories.exports.createWithAudit(
    exportJob,
    { action: "export.create", actorUserId: "user_export_actor" },
    exportIdempotency,
  );
  assert.equal(replayedExport.replayed, true);
  assert.equal(replayedExport.exportJob.id, createdExport.exportJob.id);
  assert.equal(exportRepositoryDb.exports.length, 1);
  assert.equal(exportRepositoryDb.auditLogs.filter((item) => item.action === "export.create").length, 1);
  await assert.rejects(
    exportRepositories.exports.createWithAudit(
      exportJob,
      { action: "export.create", actorUserId: "user_export_actor" },
      { ...exportIdempotency, fingerprint: "export-repository-conflicting-fingerprint" },
    ),
    (error) => error.statusCode === 409 && error.code === "IDEMPOTENCY_KEY_REUSED",
  );

  const additionalExportCases = [
    {
      id: "export_repository_csv",
      format: "csv",
      dataset: "clinical_bundle",
      scopeKind: "workspace",
      createdByUserId: "user_export_actor",
      snapshot: { ...structuredClone(exportJob.snapshot), exportId: "export_repository_csv" },
    },
    {
      id: "export_repository_xlsx",
      format: "xlsx",
      dataset: "clinical_bundle",
      scopeKind: "assigned_patients",
      createdByUserId: "user_export_actor",
      snapshot: { ...structuredClone(assignedPatientSnapshot), exportId: "export_repository_xlsx" },
    },
    {
      id: "export_repository_audit",
      format: "pdf",
      dataset: "audit_logs",
      scopeKind: "workspace",
      createdByUserId: "user_export_other",
      snapshot: structuredClone(auditSnapshot),
    },
  ];
  for (const additional of additionalExportCases) {
    const created = await exportRepositories.exports.createWithAudit(
      {
        ...exportJob,
        ...additional,
        filters: additional.snapshot.filters,
        rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
      },
      { action: "export.create", actorUserId: additional.createdByUserId },
      {
        ...exportIdempotency,
        key: `export-repository-${additional.format}`,
        fingerprint: `export-repository-${additional.format}-fingerprint`,
      },
    );
    const artifact = await buildExportArtifact(
      additional.snapshot,
      additional.format,
      EXPORT_ARTIFACT_RENDERER_VERSION,
    );
    assert.equal(created.exportJob.artifactByteSize, artifact.buffer.length);
    assert.equal(
      created.exportJob.artifactSha256,
      crypto.createHash("sha256").update(artifact.buffer).digest("hex"),
    );
  }

  const creatorFirstPage = await exportRepositories.exports.listPage({
    organizationId: "org_export_alpha",
    createdByUserId: "user_export_actor",
    page: 1,
    limit: 2,
    sort: "createdAt:desc",
  });
  assert.equal(creatorFirstPage.total, 3);
  assert.equal(creatorFirstPage.items.length, 2);
  assert.equal(creatorFirstPage.items.every((item) => item.createdByUserId === "user_export_actor"), true);
  const creatorSecondPage = await exportRepositories.exports.listPage({
    organizationId: "org_export_alpha",
    createdByUserId: "user_export_actor",
    page: 2,
    limit: 2,
    sort: "createdAt:desc",
  });
  assert.equal(creatorSecondPage.items.length, 1);
  const xlsxPage = await exportRepositories.exports.listPage({
    organizationId: "org_export_alpha",
    format: "xlsx",
    dataset: "clinical_bundle",
  });
  assert.deepEqual(xlsxPage.items.map((item) => item.id), ["export_repository_xlsx"]);
  const auditPage = await exportRepositories.exports.listPage({
    organizationId: "org_export_alpha",
    dataset: "audit_logs",
  });
  assert.deepEqual(auditPage.items.map((item) => item.id), ["export_repository_audit"]);

  assert.equal(await exportRepositories.exports.markDownloadedWithAudit("export_repository_unknown"), null);
  const exportDownloadAuditCountBefore = exportRepositoryDb.auditLogs.filter(
    (item) => item.action === "export.download",
  ).length;
  const downloadedExport = await exportRepositories.exports.markDownloadedWithAudit(
    "export_repository_alpha",
    { action: "export.download", actorUserId: "user_export_actor" },
  );
  assert.equal(downloadedExport.exportJob.downloadedAt, "2026-06-21T12:00:00.000Z");
  assert.equal(
    exportRepositoryDb.auditLogs.filter((item) => item.action === "export.download").length,
    exportDownloadAuditCountBefore + 1,
  );
  assert.deepEqual(
    new Set((await exportRepositories.exports.list()).map((item) => item.id)),
    new Set([
      "export_repository_alpha",
      "export_repository_csv",
      "export_repository_xlsx",
      "export_repository_audit",
    ]),
  );

  const largeAuditDb = {
    organizations: [{ id: "org_large_audit", name: "Large Audit Workspace" }],
    users: [{ id: "user_large_audit", name: "Large Audit Actor", role: "workspace_admin" }],
    auditLogs: Array.from({ length: 2505 }, (_, index) => ({
      id: `audit_large_${String(index).padStart(4, "0")}`,
      actorUserId: "user_large_audit",
      organizationId: "org_large_audit",
      action: "patient.read",
      resourceType: "patient",
      resourceId: `patient_large_${String(index).padStart(4, "0")}`,
      metadata: { sequence: index },
      createdAt: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
    })),
    exports: [],
    idempotencyKeys: [],
  };
  const largeAuditRepositories = createRepositories({
    getDb: () => largeAuditDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_large_audit`,
    nowIso: () => "2026-06-21T12:00:00.000Z",
    getPool: () => null,
  });
  const lateAuditPage = await largeAuditRepositories.auditLogs.list({
    organizationId: "org_large_audit",
    page: 26,
    limit: 100,
    sort: "createdAt:desc",
  });
  assert.equal(lateAuditPage.total, 2505, "the canonical JSON audit ledger must not truncate at 1,000 or 2,000 rows");
  assert.equal(lateAuditPage.items.length, 5);
  const largeAuditSnapshot = await largeAuditRepositories.exports.buildSnapshot({
    exportId: "export_large_audit",
    organizationId: "org_large_audit",
    generatedAt: "2026-06-21T12:00:00.000Z",
    dataset: "audit_logs",
    scopeKind: "workspace",
    actorUserId: "user_large_audit",
    auditFilters: { action: "patient.read", sort: "createdAt:desc" },
  });
  assert.equal(largeAuditSnapshot.counts.total, 2505);
  assert.equal(largeAuditSnapshot.data.auditLogs.length, 2505);
  assert.equal(new Set(largeAuditSnapshot.data.auditLogs.map((log) => log.id)).size, 2505);

  const failingExportDb = {
    ...exportRepositoryDb,
    exports: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  const failingExportRepositories = createRepositories({
    getDb: () => failingExportDb,
    saveDb: async () => {
      throw new Error("simulated export persistence failure");
    },
    createId: (prefix) => `${prefix}_failing_export`,
    nowIso: () => "2026-06-21T12:05:00.000Z",
    getPool: () => null,
  });
  await assert.rejects(
    failingExportRepositories.exports.createWithAudit(
      exportJob,
      { action: "export.create", actorUserId: "user_export_actor" },
      { ...exportIdempotency, key: "failing-export-repository" },
    ),
    /simulated export persistence failure/,
  );
  assert.equal(failingExportDb.exports.length, 0);
  assert.equal(failingExportDb.auditLogs.length, 0);
  assert.equal(failingExportDb.idempotencyKeys.length, 0);

  const repositorySource = fs.readFileSync(path.join(__dirname, "..", "src", "repositories.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.doesNotMatch(
    repositorySource,
    /auditLogs\s*=\s*[^;]*\.slice\(0,\s*(?:1000|2000)\)/i,
    "the append-only runtime audit ledger must not be silently truncated",
  );
  assert.match(
    repositorySource,
    /async\s+listForExport[\s\S]*?const\s+frozenLogs\s*=\s*\[\.\.\.\(getDb\(\)\.auditLogs\s*\|\|\s*\[\]\)\]/i,
    "JSON audit export must page over one frozen ledger snapshot",
  );
  assert.match(
    repositorySource,
    /async\s+listForExport[\s\S]*?SELECT\s+\*\s+FROM\s+audit_logs[\s\S]*?LIMIT\s+50001[\s\S]*?exportedLogs\.length\s*>\s*50_000/i,
    "PostgreSQL audit export must use one bounded query and fail above 50,000 rows",
  );
  assert.match(serverSource, /function\s+saveDbStrict\s*\(\)/i);
  assert.match(
    serverSource,
    /saveDb:\s*DATA_BACKEND\s*===\s*"postgres"[\s\S]+?\?\s*saveDb\s*:\s*saveDbStrict/i,
    "the JSON repository must receive the rejecting persistence function so failed share writes can roll back",
  );
  assert.doesNotMatch(
    repositorySource,
    /UPDATE\s+audit_logs\s+SET\s+actor_user_id/i,
    "append-only audit rows cannot be mutated during SQL account deletion",
  );
  assert.match(
    repositorySource,
    /DELETE\s+FROM\s+doctor_patient_access\s+WHERE\s+doctor_user_id\s*=\s*ANY\(\$1::text\[\]\)\s+OR\s+doctor_id\s*=\s*ANY\(\$1::text\[\]\)/i,
  );
  assert.doesNotMatch(repositorySource, /Boolean\(await\s+queryDeleteUserGraph/i);
  assert.match(repositorySource, /const\s+user\s*=\s*sqlDeletedUser\s*\|\|\s*cachedUser/i);
  const auditRetentionMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "016_audit_actor_retention.sql"),
    "utf8",
  );
  assert.match(
    auditRetentionMigration,
    /pg_constraint[\s\S]+actor_column\.attname\s*=\s*'actor_user_id'[\s\S]+constraint_row\.confrelid\s*=\s*'public\.users'::regclass/i,
  );
  assert.match(auditRetentionMigration, /DROP\s+CONSTRAINT\s+%I/i);
  assert.match(auditRetentionMigration, /validate_audit_actor_on_insert/i);
  assert.match(auditRetentionMigration, /FROM\s+users\s+WHERE\s+id\s*=\s*NEW\.actor_user_id\s+FOR\s+KEY\s+SHARE/i);
  assert.match(auditRetentionMigration, /USING\s+ERRCODE\s*=\s*'23503'/i);
  assert.match(auditRetentionMigration, /Immutable historical user identifier/i);
  const operationSerializationMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "017_identity_operation_serialization.sql"),
    "utf8",
  );
  assert.match(operationSerializationMigration, /HAVING\s+COUNT\(\*\)\s*>\s*1/i);
  assert.match(
    operationSerializationMigration,
    /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+identity_operations_one_unresolved_per_target_idx/i,
  );
  assert.match(
    operationSerializationMigration,
    /WHERE\s+status\s+IN\s*\('pending_provider',\s*'provider_applied',\s*'provider_failed'\)/i,
  );
  const doctorIdentityMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "018_doctor_access_identity_canonicalization.sql"),
    "utf8",
  );
  assert.match(doctorIdentityMigration, /LOCK\s+TABLE\s+users\s+IN\s+SHARE\s+MODE/i);
  assert.match(
    doctorIdentityMigration,
    /LOCK\s+TABLE\s+doctor_patient_access\s+IN\s+SHARE\s+ROW\s+EXCLUSIVE\s+MODE/i,
  );
  assert.match(doctorIdentityMigration, /doctor\.firebase_uid/i);
  assert.match(doctorIdentityMigration, /HAVING\s+COUNT\(DISTINCT\s+doctor\.id\)\s*=\s*1/i);
  assert.match(doctorIdentityMigration, /SET\s+doctor_user_id\s*=\s*canonical_doctor_access\.doctor_user_id/i);
  assert.match(doctorIdentityMigration, /candidate_count\s*<>\s*1/i);
  assert.match(doctorIdentityMigration, /RAISE\s+EXCEPTION[\s\S]+conflicting\s+or\s+unresolved/i);
  assert.match(doctorIdentityMigration, /access\.doctor_user_id\s+IS\s+DISTINCT\s+FROM\s+access\.doctor_id/i);
  assert.match(
    doctorIdentityMigration,
    /access\.revoked_at\s+IS\s+NOT\s+NULL[\s\S]+access\.expires_at[\s\S]+doctor\.role\s*=\s*'doctor'/i,
  );
  assert.doesNotMatch(
    doctorIdentityMigration,
    /COALESCE\(access\.doctor_user_id,\s*access\.doctor_id\)/i,
    "doctor access postflight must validate both canonical identity columns",
  );
  const roleTransitionMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "019_identity_role_transition.sql"),
    "utf8",
  );
  assert.match(roleTransitionMigration, /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+target_state\s+jsonb\s+NOT\s+NULL\s+DEFAULT\s+'\{\}'::jsonb/i);
  assert.match(roleTransitionMigration, /pg_constraint[\s\S]+pg_get_constraintdef[\s\S]+\\moperation\\M/i);
  assert.match(roleTransitionMigration, /DROP\s+CONSTRAINT\s+%I/i);
  assert.match(roleTransitionMigration, /CHECK\s*\(operation\s+IN\s*\([^)]*'change_role'/i);
  assert.match(roleTransitionMigration, /VALIDATE\s+CONSTRAINT\s+identity_operations_operation_check/i);
  const patientAccessAuthorityMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "020_patient_access_authority.sql"),
    "utf8",
  );
  assert.match(patientAccessAuthorityMigration, /LOCK\s+TABLE\s+users\s+IN\s+SHARE\s+MODE/i);
  assert.match(
    patientAccessAuthorityMigration,
    /LOCK\s+TABLE\s+doctor_patient_access\s+IN\s+SHARE\s+ROW\s+EXCLUSIVE\s+MODE/i,
  );
  assert.match(patientAccessAuthorityMigration, /candidate_count\s*<>\s*1/i);
  assert.match(patientAccessAuthorityMigration, /doctor_patient_access_canonical_doctor_check/i);
  assert.match(patientAccessAuthorityMigration, /doctor_patient_access_principal_required_check/i);
  assert.match(patientAccessAuthorityMigration, /doctor_patient_access_scope_check/i);
  assert.match(
    patientAccessAuthorityMigration,
    /scope\s*=\s*'selected_scans'[\s\S]+jsonb_typeof\(scan_ids\)\s*=\s*'array'[\s\S]+jsonb_array_length\(scan_ids\)\s*>\s*0/i,
  );
  assert.match(patientAccessAuthorityMigration, /revoked_at\s+IS\s+NOT\s+NULL[\s\S]+organization_id\s+IS\s+NOT\s+NULL[\s\S]+doctor_user_id\s+IS\s+NOT\s+NULL/i);
  assert.match(patientAccessAuthorityMigration, /doctor_user_id\s+IS\s+NOT\s+NULL[\s\S]+doctor_id\s+IS\s+NOT\s+NULL[\s\S]+doctor_user_id\s*=\s*doctor_id/i);
  assert.match(patientAccessAuthorityMigration, /enforce_active_doctor_access_identity/i);
  assert.match(
    patientAccessAuthorityMigration,
    /SELECT\s+doctor\.role[\s\S]+FROM\s+users\s+doctor[\s\S]+FOR\s+SHARE/i,
    "active direct grants must serialize with concurrent doctor-role updates",
  );
  assert.match(patientAccessAuthorityMigration, /revoke_patient_access_on_doctor_demotion/i);
  assert.match(patientAccessAuthorityMigration, /patient\.share\.auto_revoke/i);
  assert.match(patientAccessAuthorityMigration, /WITH\s+revoked\s+AS\s*\([\s\S]+UPDATE\s+doctor_patient_access[\s\S]+INSERT\s+INTO\s+audit_logs/i);
  assert.match(patientAccessAuthorityMigration, /access\.doctor_user_id\s+IS\s+DISTINCT\s+FROM\s+access\.doctor_id/i);
  assert.match(
    patientAccessAuthorityMigration,
    /access\.revoked_at\s+IS\s+NOT\s+NULL[\s\S]+access\.expires_at[\s\S]+doctor\.role\s*=\s*'doctor'/i,
  );
  assert.doesNotMatch(
    patientAccessAuthorityMigration,
    /COALESCE\(access\.doctor_user_id,\s*access\.doctor_id\)/i,
  );
  console.log("Repository portal metadata smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
