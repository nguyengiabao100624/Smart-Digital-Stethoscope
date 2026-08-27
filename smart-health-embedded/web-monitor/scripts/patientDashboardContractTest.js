"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  PATIENT_DASHBOARD_PROTOCOL_VERSION,
  assertPatientDashboardAccess,
  buildPatientDashboardLegacyStats,
  buildPatientDashboardSnapshot,
} = require("../src/patientDashboardContract");

test("legacy scan stats fail closed when scan capability is unavailable", () => {
  const scans = [
    { id: "scan-1", status: "completed" },
    { id: "scan-2", status: "recording" },
  ];

  assert.equal(buildPatientDashboardLegacyStats(scans, false), null);
  assert.deepEqual(buildPatientDashboardLegacyStats(scans, true), {
    scanCount: 2,
    completedCount: 1,
    recordingCount: 1,
  });
});

test("dashboard binds scans to the exact active profile", () => {
  const snapshot = buildPatientDashboardSnapshot({
    generatedAt: "2026-07-29T12:00:00.000Z",
    userId: "user-1",
    workspaceId: "workspace-1",
    activePatient: {
      id: "patient-active",
      phone: "0900000000",
      notes: "internal clinical note",
      ownerUserId: "user-1",
      organizationId: "workspace-1",
      name: "Hồ sơ đang chọn",
    },
    scans: [
      {
        id: "scan-active",
        patientId: "patient-active",
        organizationId: "workspace-1",
        status: "completed",
        aiLabel: "abnormal",
        aiSummary: "unreviewed provider text",
        doctorNotes: "private note",
        normal: true,
        wavFile: "private.wav",
      },
      { id: "scan-sibling", patientId: "patient-sibling", organizationId: "workspace-1", aiLabel: "captured" },
      {
        id: "scan-cross-workspace",
        patientId: "patient-active",
        organizationId: "workspace-2",
        aiLabel: "abnormal",
      },
    ],
    devices: [],
    canViewScans: true,
    canViewDevices: false,
  });

  assert.equal(snapshot.protocolVersion, PATIENT_DASHBOARD_PROTOCOL_VERSION);
  assert.equal(snapshot.userId, "user-1");
  assert.equal(snapshot.workspaceId, "workspace-1");
  assert.equal(snapshot.activePatientId, "patient-active");
  assert.deepEqual(snapshot.recentScans.map((scan) => scan.id), ["scan-active"]);
  assert.equal(Object.hasOwn(snapshot.recentScans[0], "aiLabel"), false);
  assert.equal(Object.hasOwn(snapshot.recentScans[0], "aiSummary"), false);
  assert.equal(Object.hasOwn(snapshot.recentScans[0], "doctorNotes"), false);
  assert.equal(Object.hasOwn(snapshot.recentScans[0], "normal"), false);
  assert.equal(Object.hasOwn(snapshot.recentScans[0], "wavFile"), false);
  assert.equal(Object.hasOwn(snapshot.patient, "phone"), false);
  assert.equal(Object.hasOwn(snapshot.patient, "notes"), false);
});

test("dashboard selects only an owned device in the exact workspace and active assignment", () => {
  const snapshot = buildPatientDashboardSnapshot({
    generatedAt: "2026-07-29T12:00:00.000Z",
    userId: "user-1",
    workspaceId: "workspace-1",
    activePatient: {
      id: "patient-active",
      ownerUserId: "user-1",
      organizationId: "workspace-1",
      name: "Hồ sơ đang chọn",
    },
    scans: [],
    devices: [
      {
        id: "foreign-owner",
        ownerUserId: "user-other",
        pairedUserId: "user-other",
        organizationId: "workspace-1",
        assignedPatientId: "patient-active",
        online: true,
      },
      {
        id: "revoked-owned-active",
        ownerUserId: "user-1",
        pairedUserId: "user-1",
        organizationId: "workspace-1",
        assignedPatientId: "patient-active",
        ownershipState: "revoked",
        status: "revoked",
        revokedAt: "2026-07-29T12:06:00.000Z",
        online: true,
        updatedAt: "2026-07-29T12:06:00.000Z",
      },
      {
        id: "foreign-workspace",
        ownerUserId: "user-1",
        pairedUserId: "user-1",
        organizationId: "workspace-2",
        assignedPatientId: "patient-active",
        online: true,
      },
      {
        id: "sibling-assignment",
        ownerUserId: "user-1",
        pairedUserId: "user-1",
        organizationId: "workspace-1",
        assignedPatientId: "patient-sibling",
        online: true,
      },
      {
        id: "owned-active",
        ownerUserId: "user-1",
        pairedUserId: "user-1",
        organizationId: "workspace-1",
        assignedPatientId: "patient-active",
        online: false,
        battery: 42,
        wifiSsid: "private-network",
        ipAddress: "192.0.2.1",
        backendHost: "internal.example",
      },
    ],
    canViewScans: false,
    canViewDevices: true,
  });

  assert.equal(snapshot.device.id, "owned-active");
  assert.equal(snapshot.device.organizationId, "workspace-1");
  assert.equal(snapshot.device.ownerUserId, "user-1");
  assert.equal(snapshot.device.assignedPatientId, "patient-active");
  assert.equal(snapshot.device.battery, 42);
  assert.equal(Object.hasOwn(snapshot.device, "wifiSsid"), false);
  assert.equal(Object.hasOwn(snapshot.device, "ipAddress"), false);
  assert.equal(Object.hasOwn(snapshot.device, "backendHost"), false);
});

test("authenticated online presence wins over a legacy connected flag", () => {
  const snapshot = buildPatientDashboardSnapshot({
    generatedAt: "2026-07-29T12:00:00.000Z",
    userId: "user-1",
    workspaceId: "workspace-1",
    activePatient: {
      id: "patient-active",
      ownerUserId: "user-1",
      organizationId: "workspace-1",
    },
    scans: [],
    devices: [
      {
        id: "legacy-connected",
        ownerUserId: "user-1",
        organizationId: "workspace-1",
        assignedPatientId: "patient-active",
        connected: true,
        online: false,
        updatedAt: "2026-07-29T12:05:00.000Z",
      },
      {
        id: "authenticated-online",
        ownerUserId: "user-1",
        organizationId: "workspace-1",
        assignedPatientId: "patient-active",
        connected: false,
        online: true,
        updatedAt: "2026-07-29T12:00:00.000Z",
      },
    ],
    canViewScans: false,
    canViewDevices: true,
  });

  assert.equal(snapshot.device.id, "authenticated-online");
  assert.equal(snapshot.device.online, true);
});

test("recent scans are sorted newest first and bounded to five active-profile records", () => {
  const scans = Array.from({ length: 7 }, (_, index) => ({
    id: `scan-${index + 1}`,
    patientId: "patient-active",
    organizationId: "workspace-1",
    startedAt: `2026-07-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
  }));
  scans.push({
    id: "foreign-newest",
    patientId: "patient-other",
    organizationId: "workspace-1",
    startedAt: "2026-07-29T08:00:00.000Z",
  });
  scans.push({
    id: "cross-workspace-newest",
    patientId: "patient-active",
    organizationId: "workspace-other",
    startedAt: "2026-07-30T08:00:00.000Z",
  });

  const snapshot = buildPatientDashboardSnapshot({
    generatedAt: "2026-07-29T12:00:00.000Z",
    userId: "user-1",
    workspaceId: "workspace-1",
    activePatient: {
      id: "patient-active",
      ownerUserId: "user-1",
      organizationId: "workspace-1",
    },
    scans,
    devices: [],
    canViewScans: true,
    canViewDevices: false,
  });

  assert.deepEqual(
    snapshot.recentScans.map((scan) => scan.id),
    ["scan-7", "scan-6", "scan-5", "scan-4", "scan-3"],
  );
});

test("unavailable capability sections return bounded empty values", () => {
  const snapshot = buildPatientDashboardSnapshot({
    generatedAt: "2026-07-29T12:00:00.000Z",
    userId: "user-1",
    workspaceId: "workspace-1",
    activePatient: {
      id: "patient-active",
      ownerUserId: "user-1",
      organizationId: "workspace-1",
    },
    scans: [{ id: "scan-active", patientId: "patient-active", organizationId: "workspace-1" }],
    devices: [
      {
        id: "device-1",
        ownerUserId: "user-1",
        organizationId: "workspace-1",
      },
    ],
    canViewScans: false,
    canViewDevices: false,
  });

  assert.deepEqual(snapshot.sections, {
    scans: "unavailable",
    device: "unavailable",
  });
  assert.deepEqual(snapshot.recentScans, []);
  assert.equal(snapshot.device, null);
});

test("dashboard rejects ownership or workspace ambiguity", () => {
  assert.throws(
    () =>
      buildPatientDashboardSnapshot({
        userId: "user-1",
        workspaceId: "workspace-1",
        activePatient: {
          id: "patient-active",
          ownerUserId: "user-other",
          organizationId: "workspace-1",
        },
        scans: [],
        devices: [],
        canViewScans: true,
        canViewDevices: true,
      }),
    /owner/i,
  );

  assert.throws(
    () =>
      buildPatientDashboardSnapshot({
        userId: "user-1",
        workspaceId: "workspace-1",
        activePatient: {
          id: "patient-active",
          ownerUserId: "user-1",
          organizationId: "workspace-other",
        },
        scans: [],
        devices: [],
        canViewScans: true,
        canViewDevices: true,
      }),
    /workspace/i,
  );
});

test("dashboard access requires an operational current patient membership and capability", () => {
  const allowed = assertPatientDashboardAccess({
    userId: "user-1",
    role: "patient",
    workspaceContext: {
      currentWorkspaceId: "workspace-1",
      currentMembership: {
        workspaceId: "workspace-1",
        role: "patient",
        status: "active",
        operational: true,
      },
      capabilities: [
        "personal.dashboard.view",
        "personal.scans.manage",
        "personal.devices.manage",
      ],
    },
  });

  assert.deepEqual(allowed, {
    workspaceId: "workspace-1",
    canViewScans: true,
    canViewDevices: true,
  });

  assert.throws(
    () =>
      assertPatientDashboardAccess({
        userId: "user-1",
        role: "patient",
        workspaceContext: {
          currentWorkspaceId: "workspace-1",
          currentMembership: {
            workspaceId: "workspace-1",
            role: "patient",
            status: "suspended",
            operational: false,
          },
          capabilities: ["personal.dashboard.view"],
        },
      }),
    (error) => error.code === "PATIENT_DASHBOARD_WORKSPACE_REQUIRED",
  );

  assert.throws(
    () =>
      assertPatientDashboardAccess({
        userId: "user-1",
        role: "patient",
        workspaceContext: {
          currentWorkspaceId: "workspace-1",
          currentMembership: {
            workspaceId: "workspace-1",
            role: "patient",
            status: "active",
            operational: true,
          },
          capabilities: [],
        },
      }),
    (error) => error.code === "PATIENT_DASHBOARD_CAPABILITY_REQUIRED",
  );
});

test("active-profile validation cannot invoke patient bootstrap before acceptance", () => {
  const serverSource = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8",
  );
  const handlerStart = serverSource.indexOf("async function handleMeApi(");
  const handlerEnd = serverSource.indexOf("\nasync function ", handlerStart + 1);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);

  const handlerSource = serverSource.slice(handlerStart, handlerEnd);
  const activeProfileStart = handlerSource.indexOf(
    'if (segments.length === 3 && segments[2] === "active-profile" && method === "PATCH")',
  );
  const followingProfilePatch = handlerSource.indexOf(
    'if (segments.length === 2 && method === "PATCH")',
    activeProfileStart,
  );
  assert.ok(activeProfileStart >= 0 && followingProfilePatch > activeProfileStart);

  const handlerPrelude = handlerSource.slice(0, activeProfileStart);
  assert.match(
    handlerPrelude,
    /if\s*\(isPatientUser\(user\)\s*&&\s*!isActiveProfileMutation\)\s*\{\s*ensurePatientProfileForUser\(user\);\s*\}/,
  );
  assert.doesNotMatch(
    handlerSource.slice(activeProfileStart, followingProfilePatch),
    /ensurePatientProfileForUser\(/,
  );
});
