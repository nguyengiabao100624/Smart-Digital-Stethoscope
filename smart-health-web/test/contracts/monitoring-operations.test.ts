import assert from "node:assert/strict";
import test from "node:test";

import { parsePortalMonitoringResponse } from "../../src/lib/monitoring-operations.ts";

const inactiveStatus = {
  type: "status",
  recording: false,
  workspaceId: null,
  patientId: null,
  deviceId: null,
  scanId: null,
  sessionId: null,
  updatedAt: "2026-07-29T11:00:00.000Z",
};

const alert = {
  id: "alert-live-1",
  organizationId: "workspace-a",
  sourceType: "device",
  sourceId: "device-a",
  dedupeKey: "device:device-a",
  occurrenceNumber: 1,
  previousAlertId: "",
  occurredAt: "2026-07-29T10:55:00.000Z",
  status: "open",
  severity: "warning",
  title: "Thiết bị cần kiểm tra",
  message: "Thiết bị chưa gửi heartbeat mới.",
  patientId: "patient-a",
  deviceId: "device-a",
  scanId: "",
  acknowledgedByUserId: "",
  acknowledgedAt: "",
  acknowledgementNote: "",
  resolvedByUserId: "",
  resolvedAt: "",
  resolutionNote: "",
  version: 1,
  metadata: {},
  createdAt: "2026-07-29T10:55:00.000Z",
  updatedAt: "2026-07-29T10:55:00.000Z",
};

function canonicalSnapshot() {
  return {
    generatedAt: "2026-07-29T11:00:00.000Z",
    workspaceId: "workspace-a",
    status: inactiveStatus,
    devices: [
      {
        id: "device-a",
        name: "Shcare A",
        organizationId: "workspace-a",
        status: "available",
        connected: true,
        online: false,
        audioStatus: "idle",
        updatedAt: "2026-07-29T10:59:00.000Z",
      },
    ],
    scans: [
      {
        id: "scan-a",
        organizationId: "workspace-a",
        patientId: "patient-a",
        deviceId: "device-a",
        status: "completed",
        createdAt: "2026-07-29T10:30:00.000Z",
        updatedAt: "2026-07-29T10:35:00.000Z",
      },
    ],
    alerts: [alert],
  };
}

test("accepts one canonical workspace snapshot and never promotes legacy connected state", () => {
  const parsed = parsePortalMonitoringResponse(
    canonicalSnapshot(),
    "workspace-a",
  );

  assert.equal(parsed.workspaceId, "workspace-a");
  assert.equal(parsed.devices[0].online, false);
  assert.equal(parsed.devices[0].connected, true);
  assert.equal(parsed.status.recording, false);
  assert.equal(parsed.alerts[0].sourceId, "device-a");
});

test("rejects a mismatched top-level workspace and every foreign nested identity", () => {
  const topLevel = canonicalSnapshot();
  topLevel.workspaceId = "workspace-b";
  assert.throws(
    () => parsePortalMonitoringResponse(topLevel, "workspace-a"),
    /workspace/i,
  );

  const foreignDevice = canonicalSnapshot();
  foreignDevice.devices[0].organizationId = "workspace-b";
  assert.throws(
    () => parsePortalMonitoringResponse(foreignDevice, "workspace-a"),
    /thiết bị|workspace/i,
  );

  const foreignScan = canonicalSnapshot();
  foreignScan.scans[0].organizationId = "workspace-b";
  assert.throws(
    () => parsePortalMonitoringResponse(foreignScan, "workspace-a"),
    /lượt đo|workspace/i,
  );

  const foreignAlert = canonicalSnapshot();
  foreignAlert.alerts[0] = {
    ...foreignAlert.alerts[0],
    organizationId: "workspace-b",
  };
  assert.throws(
    () => parsePortalMonitoringResponse(foreignAlert, "workspace-a"),
    /cảnh báo|workspace/i,
  );
});

test("rejects duplicate identities, missing canonical presence and sensitive device material", () => {
  const duplicateDevice = canonicalSnapshot();
  duplicateDevice.devices.push({ ...duplicateDevice.devices[0] });
  assert.throws(
    () => parsePortalMonitoringResponse(duplicateDevice, "workspace-a"),
    /trùng/i,
  );

  const missingPresence = canonicalSnapshot() as ReturnType<
    typeof canonicalSnapshot
  > & { devices: Array<Record<string, unknown>> };
  delete missingPresence.devices[0].online;
  assert.throws(
    () => parsePortalMonitoringResponse(missingPresence, "workspace-a"),
    /online/i,
  );

  const secretLeak = canonicalSnapshot() as ReturnType<
    typeof canonicalSnapshot
  > & { devices: Array<Record<string, unknown>> };
  secretLeak.devices[0].secretHash = "verification-material";
  assert.throws(
    () => parsePortalMonitoringResponse(secretLeak, "workspace-a"),
    /nhạy cảm|sensitive/i,
  );
});

test("accepts active REST fallback status only for the exact workspace and source", () => {
  const snapshot = canonicalSnapshot();
  snapshot.status = {
    type: "status",
    recording: true,
    workspaceId: "workspace-a",
    patientId: "patient-a",
    deviceId: "device-a",
    scanId: "scan-live-a",
    sessionId: "session-live-a",
    updatedAt: "2026-07-29T11:00:00.000Z",
  };

  const parsed = parsePortalMonitoringResponse(snapshot, "workspace-a");
  assert.equal(parsed.status.recording, true);
  assert.equal(parsed.status.identity?.scanId, "scan-live-a");

  snapshot.status.workspaceId = "workspace-b";
  assert.throws(
    () => parsePortalMonitoringResponse(snapshot, "workspace-a"),
    /workspace/i,
  );
});
