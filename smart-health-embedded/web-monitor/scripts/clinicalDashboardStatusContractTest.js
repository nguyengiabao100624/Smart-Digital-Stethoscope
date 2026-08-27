const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildClinicalDashboardStatus,
  buildPublicHealthStatus,
  selectWorkspaceRecording,
} = require("../src/clinicalDashboardStatus");

const FORBIDDEN_STATUS_FIELDS = new Set([
  "authMode",
  "dataBackend",
  "deviceId",
  "esp",
  "firebaseAuth",
  "httpPort",
  "listeners",
  "patientId",
  "sampleRate",
  "scanId",
  "secret",
  "sessionId",
  "token",
  "udpEsp",
  "udpPort",
  "wsEsp",
]);

function assertNoForbiddenStatusFields(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(
      FORBIDDEN_STATUS_FIELDS.has(key),
      false,
      `status projection must not expose ${key}`,
    );
    assertNoForbiddenStatusFields(nested);
  }
}

test("public health status contains no realtime identity or infrastructure", () => {
  const status = buildPublicHealthStatus("2026-07-29T08:00:00.000Z");

  assert.deepEqual(status, {
    type: "health",
    ok: true,
    service: "smart-health-backend",
    updatedAt: "2026-07-29T08:00:00.000Z",
  });
  assertNoForbiddenStatusFields(status);
});

test("clinical dashboard status exposes only current-workspace aggregate and active scan identity", () => {
  const status = buildClinicalDashboardStatus({
    workspaceId: "workspace-alpha",
    devicesCount: 5,
    devicesOnline: 3,
    realtimeStatus: {
      recording: true,
      workspaceId: "workspace-alpha",
      patientId: "patient-private",
      deviceId: "device-private",
      scanId: "scan-alpha",
      activeScanId: "scan-alpha",
      sessionId: "session-private",
      sampleRate: 16_000,
      udpPort: 3_001,
      httpPort: 3_000,
    },
    updatedAt: "2026-07-29T08:01:00.000Z",
  });

  assert.deepEqual(status, {
    workspaceId: "workspace-alpha",
    devicesCount: 5,
    devicesOnline: 3,
    recording: true,
    activeScanId: "scan-alpha",
    updatedAt: "2026-07-29T08:01:00.000Z",
  });
  assertNoForbiddenStatusFields(status);
});

test("clinical dashboard status suppresses stale active scan from another workspace", () => {
  const status = buildClinicalDashboardStatus({
    workspaceId: "workspace-beta",
    devicesCount: 1,
    devicesOnline: 1,
    realtimeStatus: {
      recording: true,
      workspaceId: "workspace-alpha",
      patientId: "patient-alpha",
      deviceId: "device-alpha",
      activeScanId: "scan-alpha",
    },
    updatedAt: "2026-07-29T08:02:00.000Z",
  });

  assert.equal(status.recording, false);
  assert.equal(status.activeScanId, null);
  assertNoForbiddenStatusFields(status);
});

test("workspace recording selection skips an earlier accessible foreign recording", () => {
  const selected = selectWorkspaceRecording(
    [
      {
        confirmed: true,
        organizationId: "workspace-alpha",
        scanId: "scan-alpha",
      },
      {
        confirmed: true,
        organizationId: "workspace-beta",
        scanId: "scan-beta",
      },
    ],
    "workspace-beta",
  );

  assert.equal(selected?.scanId, "scan-beta");
});
