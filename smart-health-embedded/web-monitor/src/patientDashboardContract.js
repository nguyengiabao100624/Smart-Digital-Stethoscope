"use strict";

const PATIENT_DASHBOARD_PROTOCOL_VERSION = 1;
const PATIENT_DASHBOARD_RECENT_SCAN_LIMIT = 5;

function cleanId(value) {
  return String(value || "").trim();
}

function patientDashboardContractError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function timestampOf(record) {
  const value =
    record?.startedAt ||
    record?.createdAt ||
    record?.updatedAt ||
    record?.lastSeenAt ||
    "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortNewestFirst(left, right) {
  const timestampDelta = timestampOf(right) - timestampOf(left);
  if (timestampDelta !== 0) return timestampDelta;
  return cleanId(right?.id).localeCompare(cleanId(left?.id));
}

function nullableInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function projectPatientSummary(patient, identity) {
  const ownerUserId = cleanId(patient?.ownerUserId);
  const accountUserId = cleanId(patient?.accountUserId);
  const guardianUserId = cleanId(patient?.guardianUserId);
  return {
    id: identity.activePatientId,
    patientCode: String(patient?.patientCode || ""),
    name: String(patient?.name || ""),
    profileType: String(patient?.profileType || ""),
    relationship: String(patient?.relationship || ""),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(accountUserId ? { accountUserId } : {}),
    ...(guardianUserId ? { guardianUserId } : {}),
    organizationId: identity.workspaceId,
  };
}

function projectScanSummary(scan, identity) {
  const startedAt = String(scan?.startedAt || "");
  const createdAt = String(scan?.createdAt || "");
  const updatedAt = String(scan?.updatedAt || "");
  return {
    id: cleanId(scan?.id),
    patientId: identity.activePatientId,
    organizationId: identity.workspaceId,
    status: String(scan?.status || ""),
    mode: String(scan?.mode || ""),
    ...(startedAt ? { startedAt } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function projectDeviceSummary(device, identity) {
  const firmwareVersion = String(device?.firmwareVersion || "");
  const lastSeenAt = String(device?.lastSeenAt || "");
  return {
    id: cleanId(device?.id),
    name: String(device?.name || ""),
    organizationId: identity.workspaceId,
    ownerUserId: identity.userId,
    assignedPatientId: cleanId(device?.assignedPatientId),
    online: device?.online === true,
    battery: nullableInteger(device?.battery, 0, 100),
    signal: nullableInteger(device?.signal, -127, 0),
    ...(firmwareVersion ? { firmwareVersion } : {}),
    ...(lastSeenAt ? { lastSeenAt } : {}),
  };
}

function assertPatientDashboardIdentity({
  userId,
  workspaceId,
  activePatient,
}) {
  const canonicalUserId = cleanId(userId);
  const canonicalWorkspaceId = cleanId(workspaceId);
  const activePatientId = cleanId(activePatient?.id);
  if (!canonicalUserId) {
    throw new Error("Patient dashboard requires a user identity");
  }
  if (!canonicalWorkspaceId) {
    throw new Error("Patient dashboard requires an operational workspace");
  }
  if (!activePatientId) {
    throw new Error("Patient dashboard requires an active patient profile");
  }

  const ownerIds = new Set(
    [
      activePatient?.ownerUserId,
      activePatient?.accountUserId,
      activePatient?.guardianUserId,
    ]
      .map(cleanId)
      .filter(Boolean),
  );
  if (!ownerIds.has(canonicalUserId)) {
    throw new Error("Active patient profile owner does not match the dashboard user");
  }
  if (cleanId(activePatient?.organizationId) !== canonicalWorkspaceId) {
    throw new Error("Active patient profile workspace does not match the dashboard workspace");
  }

  return {
    userId: canonicalUserId,
    workspaceId: canonicalWorkspaceId,
    activePatientId,
  };
}

function assertPatientDashboardAccess({
  userId,
  role,
  workspaceContext,
}) {
  if (!cleanId(userId) || cleanId(role).toLowerCase() !== "patient") {
    throw patientDashboardContractError(
      "PATIENT_DASHBOARD_ROLE_REQUIRED",
      "Patient dashboard requires an active patient account",
    );
  }
  const workspaceId = cleanId(workspaceContext?.currentWorkspaceId);
  const membership = workspaceContext?.currentMembership;
  const membershipWorkspaceId = cleanId(
    membership?.workspaceId || membership?.organizationId,
  );
  const membershipRole = cleanId(membership?.role).toLowerCase();
  const membershipStatus = cleanId(membership?.status || "active").toLowerCase();
  if (
    !workspaceId ||
    membershipWorkspaceId !== workspaceId ||
    membershipRole !== "patient" ||
    membershipStatus !== "active" ||
    membership?.operational !== true
  ) {
    throw patientDashboardContractError(
      "PATIENT_DASHBOARD_WORKSPACE_REQUIRED",
      "Patient dashboard requires an operational current workspace membership",
    );
  }
  const capabilities = new Set(
    (Array.isArray(workspaceContext?.capabilities)
      ? workspaceContext.capabilities
      : []
    )
      .map(cleanId)
      .filter(Boolean),
  );
  if (!capabilities.has("personal.dashboard.view")) {
    throw patientDashboardContractError(
      "PATIENT_DASHBOARD_CAPABILITY_REQUIRED",
      "Patient dashboard capability is unavailable in the current workspace",
    );
  }
  return {
    workspaceId,
    canViewScans: capabilities.has("personal.scans.manage"),
    canViewDevices: capabilities.has("personal.devices.manage"),
  };
}

function selectPatientDashboardDevice({
  devices,
  userId,
  workspaceId,
  activePatientId,
}) {
  return (Array.isArray(devices) ? devices : [])
    .filter((device) => {
      const ownerUserId = cleanId(device?.ownerUserId || device?.pairedUserId);
      const assignedPatientId = cleanId(device?.assignedPatientId);
      const ownershipState = cleanId(device?.ownershipState).toLowerCase();
      const status = cleanId(device?.status).toLowerCase();
      const revoked = Boolean(device?.revokedAt) || ownershipState === "revoked" || status === "revoked";
      return (
        !revoked &&
        ownerUserId === userId &&
        cleanId(device?.organizationId) === workspaceId &&
        (!assignedPatientId || assignedPatientId === activePatientId)
      );
    })
    .sort((left, right) => {
      const onlineDelta = Number(Boolean(right?.online)) - Number(Boolean(left?.online));
      return onlineDelta || sortNewestFirst(left, right);
    })[0] || null;
}

function buildPatientDashboardLegacyStats(scans, canViewScans) {
  if (canViewScans !== true) return null;
  const visibleScans = Array.isArray(scans) ? scans : [];
  return {
    scanCount: visibleScans.length,
    completedCount: visibleScans.filter((scan) => scan?.status === "completed").length,
    recordingCount: visibleScans.filter((scan) => scan?.status === "recording").length,
  };
}

function buildPatientDashboardSnapshot({
  generatedAt = new Date().toISOString(),
  userId,
  workspaceId,
  activePatient,
  scans,
  devices,
  canViewScans,
  canViewDevices,
}) {
  const identity = assertPatientDashboardIdentity({
    userId,
    workspaceId,
    activePatient,
  });
  const scansAvailable = canViewScans === true;
  const devicesAvailable = canViewDevices === true;
  const recentScans = scansAvailable
    ? (Array.isArray(scans) ? scans : [])
        .filter(
          (scan) =>
            cleanId(scan?.patientId) === identity.activePatientId &&
            cleanId(scan?.organizationId) === identity.workspaceId,
        )
        .sort(sortNewestFirst)
        .slice(0, PATIENT_DASHBOARD_RECENT_SCAN_LIMIT)
        .map((scan) => projectScanSummary(scan, identity))
    : [];
  const selectedDevice = devicesAvailable
    ? selectPatientDashboardDevice({
        devices,
        ...identity,
      })
    : null;
  const device = selectedDevice
    ? projectDeviceSummary(selectedDevice, identity)
    : null;

  return {
    protocolVersion: PATIENT_DASHBOARD_PROTOCOL_VERSION,
    generatedAt: String(generatedAt || new Date().toISOString()),
    userId: identity.userId,
    workspaceId: identity.workspaceId,
    activePatientId: identity.activePatientId,
    patient: projectPatientSummary(activePatient, identity),
    sections: {
      scans: scansAvailable ? (recentScans.length ? "ready" : "empty") : "unavailable",
      device: devicesAvailable ? (device ? "ready" : "empty") : "unavailable",
    },
    recentScans,
    device,
  };
}

module.exports = {
  PATIENT_DASHBOARD_PROTOCOL_VERSION,
  PATIENT_DASHBOARD_RECENT_SCAN_LIMIT,
  assertPatientDashboardAccess,
  buildPatientDashboardLegacyStats,
  buildPatientDashboardSnapshot,
  selectPatientDashboardDevice,
};
