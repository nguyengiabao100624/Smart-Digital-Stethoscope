const crypto = require("node:crypto");

const STAFF_INVITATION_ROLES = Object.freeze([
  "workspace_admin",
  "doctor",
  "nurse",
  "technician",
  "billing",
  "viewer",
]);
const STAFF_INVITATION_STATUSES = Object.freeze(["pending", "accepted", "revoked", "expired"]);
const STAFF_INVITATION_EMAIL_STATUSES = Object.freeze([
  "ready",
  "unavailable",
  "sent",
  "failed",
]);

function contractError(statusCode, code, message, details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function readText(value, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeStaffInvitationEmail(value) {
  const email = readText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw contractError(
      400,
      "STAFF_INVITATION_EMAIL_INVALID",
      "A valid staff invitation email is required",
    );
  }
  return email;
}

function normalizeStaffInvitationRole(value) {
  const raw = readText(value, 80).toLowerCase();
  const role = raw === "admin" || raw === "hospital_admin" ? "workspace_admin" : raw;
  if (!STAFF_INVITATION_ROLES.includes(role)) {
    throw contractError(
      400,
      "STAFF_INVITATION_ROLE_INVALID",
      "The selected staff invitation role is not supported",
      { allowedRoles: [...STAFF_INVITATION_ROLES] },
    );
  }
  return role;
}

function normalizeStaffInvitationCreate(value = {}) {
  const organizationId = readText(value.organizationId, 120);
  if (!organizationId) {
    throw contractError(
      400,
      "STAFF_INVITATION_WORKSPACE_REQUIRED",
      "A workspace is required for the staff invitation",
    );
  }
  if (Object.prototype.hasOwnProperty.call(value, "token")) {
    throw contractError(
      400,
      "STAFF_INVITATION_RAW_TOKEN_FORBIDDEN",
      "Raw invitation tokens cannot be supplied as invitation metadata",
    );
  }
  return {
    organizationId,
    email: normalizeStaffInvitationEmail(value.email),
    role: normalizeStaffInvitationRole(value.role),
    name: readText(value.name, 160),
    phone: readText(value.phone, 80),
    specialty: readText(value.specialty, 160),
    license: readText(value.license || value.licenseNumber, 160),
  };
}

function normalizeStaffInvitationRevoke(value = {}) {
  return { reason: readText(value.reason, 500) };
}

function generateStaffInvitationToken(randomBytes = crypto.randomBytes) {
  return randomBytes(32).toString("base64url");
}

function assertStaffInvitationToken(value) {
  const token = readText(value, 512);
  if (token.length < 32) {
    throw contractError(
      400,
      "STAFF_INVITATION_TOKEN_INVALID",
      "A valid staff invitation token is required",
    );
  }
  return token;
}

function hashStaffInvitationToken(value) {
  const token = readText(value, 512);
  if (!token) {
    throw contractError(
      400,
      "STAFF_INVITATION_TOKEN_INVALID",
      "A valid staff invitation token is required",
    );
  }
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function assertStaffInvitationTokenHash(value) {
  const tokenHash = readText(value, 128).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
    throw contractError(
      400,
      "STAFF_INVITATION_TOKEN_HASH_INVALID",
      "A canonical invitation token hash is required",
    );
  }
  return tokenHash;
}

function normalizeIsoTimestamp(value, code, message) {
  const raw = readText(value, 80);
  const timestamp = Date.parse(raw);
  if (!raw || Number.isNaN(timestamp)) {
    throw contractError(400, code, message);
  }
  return new Date(timestamp).toISOString();
}

function resolveStaffInvitationStatus(invitation = {}, now = new Date()) {
  const status = STAFF_INVITATION_STATUSES.includes(invitation.status)
    ? invitation.status
    : "pending";
  if (status !== "pending") return status;
  const expiresAt = Date.parse(invitation.expiresAt || "");
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(expiresAt) && Number.isFinite(nowMs) && expiresAt <= nowMs
    ? "expired"
    : "pending";
}

function normalizeStaffInvitationDelivery(value = {}) {
  const email = STAFF_INVITATION_EMAIL_STATUSES.includes(value.email)
    ? value.email
    : "unavailable";
  return {
    email,
    provider: readText(value.provider, 80),
    messageId: readText(value.messageId, 240),
    lastAttemptAt: readText(value.lastAttemptAt, 80),
    errorCode: readText(value.errorCode, 120),
  };
}

function publicStaffInvitation(invitation, options = {}) {
  if (!invitation) return null;
  const {
    token,
    tokenHash,
    acceptanceToken,
    rawToken,
    ...safe
  } = invitation;
  void token;
  void tokenHash;
  void acceptanceToken;
  void rawToken;
  return {
    ...safe,
    status: resolveStaffInvitationStatus(
      invitation,
      options.now || new Date(),
    ),
    delivery: normalizeStaffInvitationDelivery(invitation.delivery),
  };
}

module.exports = {
  STAFF_INVITATION_EMAIL_STATUSES,
  STAFF_INVITATION_ROLES,
  STAFF_INVITATION_STATUSES,
  assertStaffInvitationToken,
  assertStaffInvitationTokenHash,
  contractError,
  generateStaffInvitationToken,
  hashStaffInvitationToken,
  normalizeIsoTimestamp,
  normalizeStaffInvitationCreate,
  normalizeStaffInvitationDelivery,
  normalizeStaffInvitationEmail,
  normalizeStaffInvitationRevoke,
  normalizeStaffInvitationRole,
  publicStaffInvitation,
  resolveStaffInvitationStatus,
};
