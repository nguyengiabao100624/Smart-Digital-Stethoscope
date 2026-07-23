const WORKSPACE_STATUSES = Object.freeze([
  "pending",
  "active",
  "needs_info",
  "rejected",
  "inactive",
]);

const WORKSPACE_TRANSITIONS = Object.freeze({
  pending: Object.freeze(["active", "needs_info", "rejected"]),
  needs_info: Object.freeze(["pending"]),
  rejected: Object.freeze(["pending"]),
  active: Object.freeze(["inactive"]),
  inactive: Object.freeze(["active"]),
});

const WORKSPACE_PATCH_FIELDS = Object.freeze([
  "name",
  "type",
  "workspaceType",
  "address",
  "phone",
  "email",
  "website",
  "legalName",
  "representative",
  "packageId",
  "subscriptionStatus",
  "billingCycle",
  "requestMetadata",
]);

function contractError(statusCode, code, message, details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function objectOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readString(value, maxLength) {
  const normalized = String(value ?? "").trim();
  return Number.isFinite(maxLength) ? normalized.slice(0, maxLength) : normalized;
}

function normalizeWorkspaceStatus(value, fallback = "pending") {
  const status = readString(value || fallback, 40).toLowerCase();
  if (!WORKSPACE_STATUSES.includes(status)) {
    throw contractError(400, "WORKSPACE_STATUS_INVALID", "Workspace status is invalid", {
      allowedStatuses: WORKSPACE_STATUSES,
    });
  }
  return status;
}

function normalizeWorkspaceType(value, fallback = "clinic") {
  const raw = readString(value || fallback, 80).toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    solo: "solo_practice",
    solo_doctor: "solo_practice",
    private_practice: "solo_practice",
  };
  const normalized = aliases[raw] || raw || "clinic";
  if (!["personal", "clinic", "hospital", "solo_practice"].includes(normalized)) {
    throw contractError(400, "WORKSPACE_TYPE_INVALID", "Workspace type is invalid", {
      allowedTypes: ["personal", "clinic", "hospital", "solo_practice"],
    });
  }
  return normalized;
}

function normalizeWorkspaceCreate(payload = {}) {
  const source = objectOf(payload);
  const name = readString(source.name, 160);
  if (!name) {
    throw contractError(400, "WORKSPACE_NAME_REQUIRED", "Workspace name is required");
  }
  const workspaceType = normalizeWorkspaceType(source.workspaceType || source.type, "clinic");
  const requestedStatus = normalizeWorkspaceStatus(source.status || "pending");
  const status = workspaceType === "personal" && requestedStatus === "active" ? "active" : requestedStatus;
  if (workspaceType !== "personal" && status !== "pending") {
    throw contractError(
      409,
      "WORKSPACE_CREATE_STATUS_INVALID",
      "A managed workspace must be created in pending status",
      { status, requiredStatus: "pending" },
    );
  }
  return {
    name,
    type: readString(source.type, 80) || (workspaceType === "hospital" ? "hospital" : "clinic"),
    workspaceType,
    address: readString(source.address, 240),
    phone: readString(source.phone, 40),
    email: readString(source.email, 160).toLowerCase(),
    website: readString(source.website, 240),
    status,
    legalName: readString(source.legalName, 200),
    representative: readString(source.representative, 160),
    ownerUserId: readString(source.ownerUserId, 120),
    packageId: readString(source.packageId, 120),
    subscriptionStatus: readString(source.subscriptionStatus, 40) || "trial",
    billingCycle: readString(source.billingCycle, 40) || "monthly",
    requestMetadata: objectOf(source.requestMetadata),
  };
}

function normalizeWorkspacePatch(payload = {}) {
  const source = objectOf(payload);
  if (Object.prototype.hasOwnProperty.call(source, "status")) {
    throw contractError(
      400,
      "WORKSPACE_STATUS_REQUIRES_TRANSITION",
      "Workspace status must be changed through the lifecycle transition contract",
    );
  }
  if (Object.prototype.hasOwnProperty.call(source, "ownerUserId")) {
    throw contractError(
      400,
      "WORKSPACE_OWNER_REQUIRES_TRANSFER",
      "Workspace ownership must be changed through the owner transfer contract",
    );
  }
  const patch = {};
  for (const field of WORKSPACE_PATCH_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    if (field === "name") {
      const name = readString(source.name, 160);
      if (!name) throw contractError(400, "WORKSPACE_NAME_REQUIRED", "Workspace name is required");
      patch.name = name;
    } else if (field === "workspaceType") {
      patch.workspaceType = normalizeWorkspaceType(source.workspaceType);
    } else if (field === "requestMetadata") {
      patch.requestMetadata = objectOf(source.requestMetadata);
    } else if (field === "address" || field === "website") {
      patch[field] = readString(source[field], 240);
    } else if (field === "legalName") {
      patch.legalName = readString(source.legalName, 200);
    } else if (field === "phone" || field === "subscriptionStatus" || field === "billingCycle") {
      patch[field] = readString(source[field], 40);
    } else {
      patch[field] = readString(source[field], 160);
    }
  }
  if (Object.keys(patch).length === 0) {
    throw contractError(400, "WORKSPACE_PATCH_EMPTY", "At least one supported workspace field is required");
  }
  return patch;
}

function normalizeExpectedVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw contractError(
      400,
      "WORKSPACE_VERSION_REQUIRED",
      "A positive integer workspace version is required",
    );
  }
  return version;
}

function assertWorkspaceTransition(fromValue, toValue) {
  const from = normalizeWorkspaceStatus(fromValue);
  const to = normalizeWorkspaceStatus(toValue);
  if (!WORKSPACE_TRANSITIONS[from]?.includes(to)) {
    throw contractError(409, "WORKSPACE_TRANSITION_INVALID", "Workspace status transition is not allowed", {
      from,
      to,
      allowedNextStatuses: WORKSPACE_TRANSITIONS[from] || [],
    });
  }
  return { from, to };
}

function publicWorkspaceLifecycle(workspace) {
  if (!workspace) return null;
  return {
    id: workspace.id,
    name: workspace.name || "",
    type: workspace.type || "clinic",
    workspaceType: workspace.workspaceType || workspace.type || "clinic",
    address: workspace.address || "",
    phone: workspace.phone || "",
    email: workspace.email || "",
    website: workspace.website || "",
    status: normalizeWorkspaceStatus(workspace.status || "active", "active"),
    legalName: workspace.legalName || "",
    representative: workspace.representative || "",
    ownerUserId: workspace.ownerUserId || "",
    packageId: workspace.packageId || "",
    subscriptionStatus: workspace.subscriptionStatus || "trial",
    billingCycle: workspace.billingCycle || "monthly",
    requestMetadata: objectOf(workspace.requestMetadata),
    version: Number.isInteger(Number(workspace.version)) && Number(workspace.version) > 0
      ? Number(workspace.version)
      : 1,
    deletedAt: workspace.deletedAt || "",
    createdAt: workspace.createdAt || "",
    updatedAt: workspace.updatedAt || "",
  };
}

module.exports = {
  WORKSPACE_PATCH_FIELDS,
  WORKSPACE_STATUSES,
  WORKSPACE_TRANSITIONS,
  assertWorkspaceTransition,
  normalizeExpectedVersion,
  normalizeWorkspaceCreate,
  normalizeWorkspacePatch,
  normalizeWorkspaceStatus,
  normalizeWorkspaceType,
  publicWorkspaceLifecycle,
};
