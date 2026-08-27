"use strict";

function normalizedCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildPublicHealthStatus(updatedAt = new Date().toISOString()) {
  return {
    type: "health",
    ok: true,
    service: "smart-health-backend",
    updatedAt: normalizedText(updatedAt) || new Date().toISOString(),
  };
}

function selectWorkspaceRecording(recordings, workspaceId) {
  const normalizedWorkspaceId = normalizedText(workspaceId);
  if (!normalizedWorkspaceId || !Array.isArray(recordings)) return null;
  return recordings.find(
    (recording) =>
      recording?.confirmed === true &&
      normalizedText(recording.organizationId || recording.workspaceId) ===
        normalizedWorkspaceId,
  ) || null;
}

function buildClinicalDashboardStatus({
  workspaceId,
  devicesCount = 0,
  devicesOnline = 0,
  realtimeStatus = null,
  updatedAt = new Date().toISOString(),
}) {
  const normalizedWorkspaceId = normalizedText(workspaceId);
  if (!normalizedWorkspaceId) {
    throw new TypeError("Clinical dashboard status requires a workspace id");
  }

  const totalDevices = normalizedCount(devicesCount);
  const onlineDevices = Math.min(totalDevices, normalizedCount(devicesOnline));
  const realtimeWorkspaceId = normalizedText(realtimeStatus?.workspaceId);
  const realtimeActiveScanId = normalizedText(
    realtimeStatus?.activeScanId || realtimeStatus?.scanId,
  );
  const ownsRealtimeRecording =
    realtimeStatus?.recording === true &&
    realtimeWorkspaceId === normalizedWorkspaceId &&
    Boolean(realtimeActiveScanId);

  return {
    workspaceId: normalizedWorkspaceId,
    devicesCount: totalDevices,
    devicesOnline: onlineDevices,
    recording: ownsRealtimeRecording,
    activeScanId: ownsRealtimeRecording ? realtimeActiveScanId : null,
    updatedAt: normalizedText(updatedAt) || new Date().toISOString(),
  };
}

module.exports = {
  buildClinicalDashboardStatus,
  buildPublicHealthStatus,
  selectWorkspaceRecording,
};
