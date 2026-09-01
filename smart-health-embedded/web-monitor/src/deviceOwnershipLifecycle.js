const crypto = require("node:crypto");

const DEVICE_OWNERSHIP_STATES = Object.freeze([
  "provisioned",
  "claimed",
  "assigned",
  "unassigned",
  "revoked",
]);

const VALID_TRANSITIONS = Object.freeze({
  provisioned: new Set(["claimed", "revoked"]),
  claimed: new Set(["assigned", "unassigned", "revoked"]),
  assigned: new Set(["unassigned", "revoked"]),
  unassigned: new Set(["assigned", "revoked"]),
  revoked: new Set(),
});

class DeviceOwnershipError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "DeviceOwnershipError";
    this.code = code;
    this.status = status;
  }
}

function cleanId(value, maximum = 160) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function validOwnershipState(value) {
  return DEVICE_OWNERSHIP_STATES.includes(value);
}

function inferDeviceOwnershipState(device = {}) {
  if (device.revokedAt || device.status === "revoked") return "revoked";
  const explicit = cleanId(device.ownershipState, 40);
  if (validOwnershipState(explicit)) return explicit;
  if (cleanId(device.assignedPatientId)) return "assigned";
  if (cleanId(device.ownerUserId || device.pairedUserId)) return "claimed";
  return "provisioned";
}

function requireOwnerId(device, options) {
  const ownerUserId = cleanId(
    options.ownerUserId || device.ownerUserId || device.pairedUserId,
  );
  if (!ownerUserId) {
    throw new DeviceOwnershipError(
      "DEVICE_OWNER_REQUIRED",
      "A canonical owner is required for this device ownership state",
      400,
    );
  }
  return ownerUserId;
}

function applyDeviceOwnershipTransition(device, nextState, options = {}) {
  if (!device || typeof device !== "object" || !cleanId(device.id)) {
    throw new DeviceOwnershipError(
      "DEVICE_OWNERSHIP_DEVICE_REQUIRED",
      "A persisted device is required for an ownership transition",
      400,
    );
  }
  const targetState = cleanId(nextState, 40);
  if (!validOwnershipState(targetState)) {
    throw new DeviceOwnershipError(
      "DEVICE_OWNERSHIP_STATE_INVALID",
      "The requested device ownership state is invalid",
      400,
    );
  }

  const currentState = inferDeviceOwnershipState(device);
  if (targetState !== currentState && !VALID_TRANSITIONS[currentState].has(targetState)) {
    throw new DeviceOwnershipError(
      "DEVICE_OWNERSHIP_TRANSITION_INVALID",
      `Device ownership cannot transition from ${currentState} to ${targetState}`,
    );
  }

  if (targetState === "revoked" && currentState === "revoked") {
    return { ...device, ownershipState: "revoked" };
  }

  const at = cleanId(options.at, 40) || new Date().toISOString();
  const next = { ...device, ownershipState: targetState, updatedAt: at };

  const currentOwnerUserId = cleanId(device.ownerUserId || device.pairedUserId);
  const requestedOwnerUserId = cleanId(options.ownerUserId);
  if (
    currentState !== "provisioned" &&
    requestedOwnerUserId &&
    currentOwnerUserId &&
    requestedOwnerUserId !== currentOwnerUserId
  ) {
    throw new DeviceOwnershipError(
      "DEVICE_OWNER_CHANGE_REQUIRES_TRANSFER",
      "Changing the canonical device owner requires the audited transfer workflow",
      409,
    );
  }
  const requestedPatientId = cleanId(options.assignedPatientId);
  const currentPatientId = cleanId(device.assignedPatientId);
  if (
    targetState === currentState &&
    targetState === "assigned" &&
    requestedPatientId &&
    currentPatientId &&
    requestedPatientId !== currentPatientId
  ) {
    throw new DeviceOwnershipError(
      "DEVICE_ASSIGNMENT_TRANSITION_REQUIRED",
      "Changing the assigned patient requires unassigning the current patient first",
      409,
    );
  }

  if (["claimed", "assigned", "unassigned"].includes(targetState)) {
    const ownerUserId = requireOwnerId(next, options);
    next.ownerUserId = ownerUserId;
    // Compatibility alias during the API v1 migration window.
    next.pairedUserId = ownerUserId;
  }

  if (targetState === "assigned") {
    const assignedPatientId = cleanId(options.assignedPatientId || next.assignedPatientId);
    if (!assignedPatientId) {
      throw new DeviceOwnershipError(
        "DEVICE_ASSIGNMENT_PATIENT_REQUIRED",
        "A canonical patient is required when assigning a device",
        400,
      );
    }
    next.assignedPatientId = assignedPatientId;
  } else if (targetState === "unassigned") {
    next.assignedPatientId = null;
  }

  if (targetState === "revoked") {
    next.revokedAt = cleanId(options.revokedAt, 40) || at;
    next.revokedByUserId = cleanId(options.actorUserId || next.revokedByUserId);
    next.connected = false;
    next.status = "revoked";
  }

  return next;
}

function applyDeviceOwnershipRelease(device, options = {}) {
  if (!device || typeof device !== "object" || !cleanId(device.id)) {
    throw new DeviceOwnershipError(
      "DEVICE_OWNERSHIP_DEVICE_REQUIRED",
      "A persisted device is required for an ownership release",
      400,
    );
  }
  const currentState = inferDeviceOwnershipState(device);
  if (currentState === "provisioned") {
    throw new DeviceOwnershipError(
      "DEVICE_ALREADY_RELEASED",
      "The device is already released from its previous account",
      409,
    );
  }
  if (currentState === "revoked") {
    throw new DeviceOwnershipError(
      "DEVICE_REVOKED_RELEASE_FORBIDDEN",
      "A revoked device cannot be released back into provisioning",
      409,
    );
  }
  const at = cleanId(options.at, 40) || new Date().toISOString();
  return {
    ...device,
    ownershipState: "provisioned",
    ownerUserId: null,
    pairedUserId: null,
    assignedPatientId: null,
    connected: false,
    status: "available",
    updatedAt: at,
  };
}

function applyDeviceOwnershipTransfer(device, options = {}) {
  if (!device || typeof device !== "object" || !cleanId(device.id)) {
    throw new DeviceOwnershipError(
      "DEVICE_OWNERSHIP_DEVICE_REQUIRED",
      "A persisted device is required for an ownership transfer",
      400,
    );
  }

  const currentState = inferDeviceOwnershipState(device);
  if (currentState === "revoked") {
    throw new DeviceOwnershipError(
      "DEVICE_REVOKED_TRANSFER_FORBIDDEN",
      "A revoked device cannot be transferred",
      409,
    );
  }

  const currentOrganizationId = cleanId(device.organizationId);
  const organizationId = cleanId(options.organizationId || currentOrganizationId);
  if (!organizationId) {
    throw new DeviceOwnershipError(
      "DEVICE_TRANSFER_WORKSPACE_REQUIRED",
      "A target workspace is required for a device transfer",
      400,
    );
  }

  const crossWorkspace = Boolean(
    currentOrganizationId && organizationId !== currentOrganizationId,
  );
  if (crossWorkspace && currentState === "assigned") {
    throw new DeviceOwnershipError(
      "DEVICE_UNASSIGN_BEFORE_TRANSFER",
      "Unassign the device from its patient before transferring it to another workspace",
      409,
    );
  }

  const ownerUserId = cleanId(options.ownerUserId);
  if (currentState !== "provisioned" && !ownerUserId) {
    throw new DeviceOwnershipError(
      "DEVICE_TRANSFER_OWNER_REQUIRED",
      "A target owner is required when transferring an owned device",
      400,
    );
  }

  const at = cleanId(options.at, 40) || new Date().toISOString();
  const next = {
    ...device,
    organizationId,
    updatedAt: at,
  };
  if (ownerUserId) {
    next.ownerUserId = ownerUserId;
    next.pairedUserId = ownerUserId;
    if (currentState === "provisioned") next.ownershipState = "claimed";
  }
  return next;
}

function applyDeviceAdministrativeAssignment(device, options = {}) {
  if (!device || typeof device !== "object" || !cleanId(device.id)) {
    throw new DeviceOwnershipError(
      "DEVICE_OWNERSHIP_DEVICE_REQUIRED",
      "A persisted device is required for an administrative assignment",
      400,
    );
  }

  if (inferDeviceOwnershipState(device) === "revoked") {
    throw new DeviceOwnershipError(
      "DEVICE_REVOKED_ASSIGNMENT_FORBIDDEN",
      "A revoked device cannot be administratively assigned",
      409,
    );
  }

  const organizationId = cleanId(options.organizationId || device.organizationId);
  if (!organizationId) {
    throw new DeviceOwnershipError(
      "DEVICE_ASSIGNMENT_WORKSPACE_REQUIRED",
      "A target workspace is required for an administrative assignment",
      400,
    );
  }

  const ownerUserId = cleanId(options.ownerUserId);
  const assignedPatientId = cleanId(options.assignedPatientId);
  if (assignedPatientId && !ownerUserId) {
    throw new DeviceOwnershipError(
      "DEVICE_ASSIGNMENT_OWNER_REQUIRED",
      "A responsible account is required when assigning a device to a patient",
      400,
    );
  }

  const at = cleanId(options.at, 40) || new Date().toISOString();
  const previousOrganizationId = cleanId(device.organizationId);
  const previousOwnerUserId = cleanId(device.ownerUserId || device.pairedUserId);
  const authorityChanged =
    previousOrganizationId !== organizationId || previousOwnerUserId !== ownerUserId;
  const ownershipState = assignedPatientId
    ? "assigned"
    : ownerUserId
      ? "unassigned"
      : "provisioned";
  const next = {
    ...device,
    organizationId,
    ownershipState,
    ownerUserId: ownerUserId || null,
    pairedUserId: ownerUserId || null,
    assignedPatientId: assignedPatientId || null,
    updatedAt: at,
  };
  if (authorityChanged) {
    next.connected = false;
    next.status = "available";
  }
  return next;
}

function classifyDeviceClaim(claim, now = Date.now()) {
  if (!claim || typeof claim !== "object") return "invalid";
  if (claim.revokedAt) return "revoked";
  if (claim.claimedAt) return "claimed";
  const expiresAt = Date.parse(claim.expiresAt || "");
  const nowMs = Number(now);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(nowMs)) return "invalid";
  return nowMs >= expiresAt ? "expired" : "active";
}

function constantTimeStringEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ""), "utf8");
  const right = Buffer.from(String(rightValue || ""), "utf8");
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function validateActiveDeviceClaim(claim, expected = {}) {
  const deviceId = cleanId(expected.deviceId);
  const organizationId = cleanId(expected.organizationId);
  const claimCodeHash = cleanId(expected.claimCodeHash, 512);
  if (
    !claim ||
    cleanId(claim.deviceId) !== deviceId ||
    !constantTimeStringEqual(cleanId(claim.claimCodeHash, 512), claimCodeHash)
  ) {
    throw new DeviceOwnershipError(
      "DEVICE_CLAIM_INVALID",
      "The device claim is invalid",
      403,
    );
  }

  const claimOrganizationId = cleanId(claim.organizationId);
  if (!claimOrganizationId) {
    throw new DeviceOwnershipError(
      "DEVICE_CLAIM_WORKSPACE_UNBOUND",
      "The legacy device claim is not bound to a workspace and cannot be adopted implicitly",
      403,
    );
  }
  if (!organizationId || claimOrganizationId !== organizationId) {
    throw new DeviceOwnershipError(
      "DEVICE_CLAIM_WORKSPACE_MISMATCH",
      "The device claim belongs to a different workspace",
      403,
    );
  }

  const classification = classifyDeviceClaim(claim, expected.now);
  if (classification === "claimed") {
    throw new DeviceOwnershipError(
      "DEVICE_CLAIM_ALREADY_USED",
      "The device claim has already been used",
      409,
    );
  }
  if (classification === "revoked") {
    throw new DeviceOwnershipError(
      "DEVICE_CLAIM_REVOKED",
      "The device claim has been revoked",
      410,
    );
  }
  if (classification === "expired") {
    throw new DeviceOwnershipError(
      "DEVICE_CLAIM_EXPIRED",
      "The device claim has expired",
      410,
    );
  }
  if (classification !== "active") {
    throw new DeviceOwnershipError(
      "DEVICE_CLAIM_INVALID",
      "The device claim is invalid",
      403,
    );
  }
  return { ...claim };
}

module.exports = {
  DEVICE_OWNERSHIP_STATES,
  DeviceOwnershipError,
  applyDeviceAdministrativeAssignment,
  applyDeviceOwnershipRelease,
  applyDeviceOwnershipTransfer,
  applyDeviceOwnershipTransition,
  classifyDeviceClaim,
  inferDeviceOwnershipState,
  validateActiveDeviceClaim,
};
