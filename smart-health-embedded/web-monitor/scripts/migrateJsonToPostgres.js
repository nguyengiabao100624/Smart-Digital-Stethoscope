const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  canonicalDeviceSecretHash,
  sanitizeDeviceCredentialRotation,
  sanitizeDeviceTelemetry,
} = require("../src/deviceSessionSecurity");
const {
  normalizeDeviceOtaStatus,
  sanitizeDeviceOtaLifecycle,
} = require("../src/deviceOtaLifecycle");
const { inferDeviceOwnershipState } = require("../src/deviceOwnershipLifecycle");
const { SIGNAL_QUALITY_ANALYZER_VERSION } = require("../src/aiRuntime");
const {
  MAX_SCAN_AUDIO_CHUNK_BYTES,
  MAX_SCAN_AUDIO_CHUNK_COUNT,
  MAX_SCAN_AUDIO_TOTAL_BYTES,
} = require("../src/scanAudioUploadRepository");
const { normalizeStoredServicePackage } = require("../src/servicePackageContract");
const {
  normalizeStorageBucketCreate,
  normalizeStorageFileCreate,
} = require("../src/storageMetadataContract");
const {
  STAFF_INVITATION_STATUSES,
  assertStaffInvitationTokenHash,
  normalizeStaffInvitationCreate,
  normalizeStaffInvitationDelivery,
  resolveStaffInvitationStatus,
} = require("../src/staffInvitationContract");
const {
  normalizeSupportTicketRecord,
} = require("../src/supportTicketContract");
const { PATIENT_IMPORT_MAX_BYTES } = require("../src/patientImportContract");
const { sanitizeAuditMetadata } = require("../src/auditLogContract");
const { normalizePasswordHash } = require("../src/passwordHash");
const {
  EXPORT_ARTIFACT_RENDERER_VERSION,
  EXPORT_SCOPE_KINDS,
  buildExportArtifact,
  normalizeExportFormat,
} = require("../src/exportArtifact");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function valueOrNull(value) {
  return value === undefined || value === "" ? null : value;
}

function identityImportError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function canonicalId(value) {
  return String(value || "").trim();
}

function isRoleRequestDocumentObjectKeyScoped(
  objectKey,
  organizationId,
  userId,
) {
  const key = canonicalId(objectKey);
  const expectedPrefix = `org/${canonicalId(organizationId)}/doctor-documents/${canonicalId(userId)}/`;
  return (
    Boolean(key) &&
    Boolean(canonicalId(organizationId)) &&
    Boolean(canonicalId(userId)) &&
    key.startsWith(expectedPrefix) &&
    key.length > expectedPrefix.length &&
    !key.includes("..") &&
    !key.includes("\\")
  );
}

const ALLOWED_MEMBERSHIP_ROLES = new Set([
  "workspace_owner",
  "workspace_admin",
  "doctor",
  "patient",
  "nurse",
  "technician",
  "billing",
  "viewer",
]);
const ALLOWED_MEMBERSHIP_STATUSES = new Set(["active", "suspended"]);
const ALLOWED_ACCOUNT_ROLES = new Set([
  "admin",
  "workspace_owner",
  "workspace_admin",
  "doctor",
  "patient",
  "nurse",
  "technician",
  "billing",
  "viewer",
]);
const OWNER_CAPABLE_ACCOUNT_ROLES = new Set(["admin", "platform_admin", "workspace_owner"]);
const ALLOWED_WORKSPACE_TYPES = new Set(["hospital", "clinic", "solo_practice", "personal"]);
const ALLOWED_WORKSPACE_STATUSES = new Set(["active", "inactive", "pending", "needs_info", "rejected"]);
const ALLOWED_DEVICE_COMMAND_TYPES = new Set([
  "restart",
  "wifi.status",
  "device.lock",
  "device.revoke",
  "wifi.update",
  "ota.update",
  "audio.session.start",
  "audio.session.stop",
]);
const ALLOWED_DEVICE_COMMAND_STATES = new Set([
  "accepted",
  "queued",
  "delivered",
  "acknowledged",
  "applying",
  "applied",
  "failed",
  "expired",
]);
const ALLOWED_REVIEW_STATUSES = new Set(["pending", "reviewed"]);
const ALLOWED_REVIEW_DECISIONS = new Set(["accepted", "repeat_measurement", "follow_up_required"]);
const ALLOWED_ALERT_STATUSES = new Set(["open", "acknowledged", "resolved"]);
const ALLOWED_ALERT_SOURCE_TYPES = new Set(["device", "scan"]);
const ALLOWED_PATIENT_IMPORT_STATUSES = new Set(["validated", "invalid", "committed", "expired"]);
const ALLOWED_PATIENT_ACCESS_AUTHORITY_TYPES = new Set([
  "patient_consent",
  "clinician_access_grant",
  "administrative_assignment",
]);
const REVIEW_MANAGE_MEMBERSHIP_ROLES = new Set(["workspace_owner", "workspace_admin", "doctor"]);
const ALERT_MANAGE_MEMBERSHIP_ROLES = new Set([
  ...REVIEW_MANAGE_MEMBERSHIP_ROLES,
  "nurse",
  "technician",
]);

function canonicalMembershipRole(value) {
  const role = canonicalId(value).toLowerCase();
  if (role === "owner") return "workspace_owner";
  if (role === "admin") return "workspace_admin";
  return role;
}

function membershipRoleIsCompatible(user, membershipRole) {
  const accountRole = canonicalId(user?.role || "patient").toLowerCase();
  const role = canonicalMembershipRole(membershipRole);
  if (!ALLOWED_MEMBERSHIP_ROLES.has(role)) return false;
  if (["patient", "viewer"].includes(role)) return true;
  if (OWNER_CAPABLE_ACCOUNT_ROLES.has(accountRole)) return true;
  if (role === "workspace_admin") return accountRole === "workspace_admin";
  return accountRole === role;
}

function isOperationalMembershipRole(value) {
  return canonicalMembershipRole(value) !== "patient";
}

function isActiveSharedOrganization(organization) {
  if (!organization) return false;
  const status = canonicalId(organization.status || "active").toLowerCase();
  const workspaceType = canonicalId(organization.workspaceType || organization.workspace_type || organization.type || "clinic").toLowerCase();
  return status === "active" && workspaceType !== "personal";
}

function hasApprovedOperationalIdentity(user) {
  const accountRole = canonicalId(user?.role || "patient").toLowerCase();
  if (accountRole === "admin" || accountRole === "platform_admin") return true;
  return canonicalId(user?.roleRequestStatus || user?.role_request_status).toLowerCase() === "approved";
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJson(value[key])]),
  );
}

function jsonEquals(left, right) {
  return JSON.stringify(canonicalJson(left || {})) === JSON.stringify(canonicalJson(right || {}));
}

function createImportCounter() {
  return { inserted: 0, preserved: 0, updated: 0, written: 0 };
}

function recordImportOutcome(counter, outcome) {
  const state = outcome?.state || (outcome?.rowCount === 0 ? "preserved" : "written");
  if (!Object.prototype.hasOwnProperty.call(counter, state)) counter[state] = 0;
  counter[state] += 1;
}

function validateAndNormalizeImportGraph(db) {
  ensureDefaultOrganization(db);
  const issues = [];
  const addIssue = (code, entityType, entityId, field, referencedId, message) => {
    issues.push({
      code,
      entityType,
      entityId: canonicalId(entityId),
      field,
      referencedId: canonicalId(referencedId),
      message,
    });
  };
  const indexById = (items, entityType) => {
    const index = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const id = canonicalId(item?.id);
      if (!id) {
        addIssue("IMPORT_ID_REQUIRED", entityType, "", "id", "", `${entityType} is missing an id`);
        continue;
      }
      if (index.has(id)) {
        addIssue("IMPORT_ID_DUPLICATE", entityType, id, "id", id, `${entityType} id ${id} is duplicated`);
        continue;
      }
      index.set(id, item);
    }
    return index;
  };
  const requireReference = (index, entityType, entityId, field, referencedId, targetType, required = false) => {
    const reference = canonicalId(referencedId);
    if (!reference) {
      if (required) {
        addIssue(
          "IMPORT_REFERENCE_REQUIRED",
          entityType,
          entityId,
          field,
          "",
          `${entityType} ${canonicalId(entityId)} requires ${field}`,
        );
      }
      return null;
    }
    const target = index.get(reference) || null;
    if (!target) {
      addIssue(
        "IMPORT_REFERENCE_MISSING",
        entityType,
        entityId,
        field,
        reference,
        `${entityType} ${canonicalId(entityId)} references missing ${targetType} ${reference}`,
      );
    }
    return target;
  };

  const organizations = Array.isArray(db.organizations) ? db.organizations : [];
  const servicePackages = Array.isArray(db.servicePackages) ? db.servicePackages : [];
  const users = Array.isArray(db.users) ? db.users : [];
  const memberships = Array.isArray(db.memberships) ? db.memberships : [];
  const staffInvitations = Array.isArray(db.staffInvitations) ? db.staffInvitations : [];
  const supportTickets = Array.isArray(db.supportTickets) ? db.supportTickets : [];
  const roleRequestDocuments = collectRoleRequestDocuments(db);
  const patients = Array.isArray(db.patients) ? db.patients : [];
  const patientImportBatches = Array.isArray(db.patientImportBatches) ? db.patientImportBatches : [];
  const devices = Array.isArray(db.devices) ? db.devices : [];
  const deviceClaims = Array.isArray(db.deviceClaims) ? db.deviceClaims : [];
  const deviceCommands = Array.isArray(db.deviceCommands) ? db.deviceCommands : [];
  const scans = Array.isArray(db.scans) ? db.scans : [];
  const scanAudioChunks = Array.isArray(db.scanAudioChunks) ? db.scanAudioChunks : [];
  const scanAudioCompletions = Array.isArray(db.scanAudioCompletions) ? db.scanAudioCompletions : [];
  const scanReviews = Array.isArray(db.scanReviews) ? db.scanReviews : [];
  const clinicalAlerts = Array.isArray(db.clinicalAlerts) ? db.clinicalAlerts : [];
  const storageBuckets = Array.isArray(db.storageBuckets) ? db.storageBuckets : [];
  const storageFiles = Array.isArray(db.storageFiles) ? db.storageFiles : [];
  const organizationsById = indexById(organizations, "organization");
  const servicePackagesById = indexById(servicePackages, "service_package");
  const usersById = indexById(users, "user");
  const patientsById = indexById(patients, "patient");
  indexById(patientImportBatches, "patient_import_batch");
  const devicesById = indexById(devices, "device");
  indexById(deviceClaims, "device_claim");
  indexById(deviceCommands, "device_command");
  const scansById = indexById(scans, "scan");
  indexById(scanAudioChunks, "scan_audio_chunk");
  indexById(scanAudioCompletions, "scan_audio_completion");
  indexById(scanReviews, "scan_review");
  const clinicalAlertsById = indexById(clinicalAlerts, "clinical_alert");
  indexById(storageBuckets, "storage_bucket");
  indexById(storageFiles, "storage_file");
  indexById(memberships, "membership");
  indexById(staffInvitations, "staff_invitation");
  indexById(supportTickets, "support_ticket");
  indexById(roleRequestDocuments, "role_request_document");
  indexById(db.doctorPatientAccess, "patient_share");
  indexById(db.audioFiles, "audio_file");
  indexById(db.aiResults, "ai_result");

  const roleRequestDocumentCountByUser = new Map();
  for (const document of roleRequestDocuments) {
    const documentId = canonicalId(document.id);
    const userId = canonicalId(document.userId);
    const organizationId = canonicalId(document.organizationId);
    const documentCount =
      (roleRequestDocumentCountByUser.get(userId) || 0) + 1;
    roleRequestDocumentCountByUser.set(userId, documentCount);
    if (documentCount > 10) {
      addIssue(
        "IMPORT_ROLE_REQUEST_DOCUMENT_LIMIT_EXCEEDED",
        "role_request_document",
        documentId,
        "userId",
        userId,
        `Account ${userId} has more than 10 role request documents`,
      );
    }
    requireReference(
      usersById,
      "role_request_document",
      documentId,
      "userId",
      userId,
      "user",
      true,
    );
    requireReference(
      organizationsById,
      "role_request_document",
      documentId,
      "organizationId",
      organizationId,
      "organization",
      true,
    );
    const owner = usersById.get(userId) || null;
    if (
      owner &&
      canonicalId(owner.organizationId) !== organizationId
    ) {
      addIssue(
        "IMPORT_ROLE_REQUEST_DOCUMENT_WORKSPACE_MISMATCH",
        "role_request_document",
        documentId,
        "organizationId",
        organizationId,
        `Role request document ${documentId} does not match its owner's canonical workspace`,
      );
    }
    const objectKey = canonicalId(document.objectKey);
    if (
      objectKey &&
      userId &&
      organizationId &&
      !isRoleRequestDocumentObjectKeyScoped(
        objectKey,
        organizationId,
        userId,
      )
    ) {
      addIssue(
        "IMPORT_ROLE_REQUEST_DOCUMENT_OBJECT_SCOPE_MISMATCH",
        "role_request_document",
        documentId,
        "objectKey",
        objectKey,
        `Role request document ${documentId} points outside its account workspace object prefix`,
      );
    }
    if (
      !canonicalId(document.name) ||
      !["application/pdf", "image/jpeg", "image/png"].includes(
        canonicalId(document.contentType).toLowerCase(),
      ) ||
      !Number.isInteger(Number(document.byteSize)) ||
      Number(document.byteSize) < 1 ||
      Number(document.byteSize) > 10 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(canonicalId(document.sha256).toLowerCase()) ||
      !objectKey ||
      !canonicalId(document.storageProvider) ||
      !toIso(document.uploadedAt)
    ) {
      addIssue(
        "IMPORT_ROLE_REQUEST_DOCUMENT_INVALID",
        "role_request_document",
        documentId,
        "document",
        "",
        `Role request document ${documentId} is incomplete or predates the SHA-256 contract`,
      );
    }
  }

  const pendingInvitationPrincipals = new Set();
  const invitationTokenHashes = new Set();
  for (const invitation of staffInvitations) {
    try {
      if (Object.prototype.hasOwnProperty.call(invitation || {}, "token")) {
        throw identityImportError(
          "IMPORT_STAFF_INVITATION_PLAINTEXT_TOKEN_FORBIDDEN",
          `Staff invitation ${canonicalId(invitation?.id)} contains a plaintext acceptance secret`,
        );
      }
      const normalized = normalizeStaffInvitationCreate({
        organizationId: invitation.organizationId,
        email: invitation.email,
        role: invitation.role,
        name: invitation.name,
        phone: invitation.phone,
        specialty: invitation.specialty,
        license: invitation.license,
      });
      normalized.tokenHash = assertStaffInvitationTokenHash(invitation.tokenHash);
      const storedStatus = canonicalId(invitation.status || "pending").toLowerCase();
      if (!STAFF_INVITATION_STATUSES.includes(storedStatus)) {
        throw identityImportError(
          "IMPORT_STAFF_INVITATION_STATUS_INVALID",
          `Staff invitation ${canonicalId(invitation.id)} has unsupported status ${storedStatus}`,
        );
      }
      normalized.expiresAt = toIso(invitation.expiresAt);
      if (!normalized.expiresAt) {
        throw identityImportError(
          "IMPORT_STAFF_INVITATION_EXPIRY_INVALID",
          `Staff invitation ${canonicalId(invitation.id)} requires a valid expiresAt`,
        );
      }
      normalized.status = resolveStaffInvitationStatus(
        { status: storedStatus, expiresAt: normalized.expiresAt },
        new Date(),
      );
      normalized.delivery = normalizeStaffInvitationDelivery(invitation.delivery);
      if (normalized.delivery.lastAttemptAt) {
        const lastAttemptAt = toIso(normalized.delivery.lastAttemptAt);
        if (!lastAttemptAt) {
          throw identityImportError(
            "IMPORT_STAFF_INVITATION_DELIVERY_TIMESTAMP_INVALID",
            `Staff invitation ${canonicalId(invitation.id)} has an invalid delivery timestamp`,
          );
        }
        normalized.delivery.lastAttemptAt = lastAttemptAt;
      }
      Object.assign(invitation, normalized);
      for (const field of ["acceptedAt", "revokedAt", "lastSentAt"]) {
        const rawTimestamp = invitation[field];
        const timestamp = toIso(rawTimestamp);
        if (rawTimestamp && !timestamp) {
          throw identityImportError(
            "IMPORT_STAFF_INVITATION_TIMESTAMP_INVALID",
            `Staff invitation ${canonicalId(invitation.id)} has an invalid ${field}`,
          );
        }
        invitation[field] = timestamp || "";
      }
      const sendCount = Number(invitation.sendCount || 0);
      if (!Number.isInteger(sendCount) || sendCount < 0) {
        throw identityImportError(
          "IMPORT_STAFF_INVITATION_SEND_COUNT_INVALID",
          `Staff invitation ${canonicalId(invitation.id)} has an invalid send count`,
        );
      }
      invitation.sendCount = sendCount;
      const acceptedByUserId = canonicalId(invitation.acceptedByUserId);
      const revokedByUserId = canonicalId(invitation.revokedByUserId);
      const hasAcceptedState = Boolean(invitation.acceptedAt || acceptedByUserId);
      const hasRevokedState = Boolean(
        invitation.revokedAt || revokedByUserId || canonicalId(invitation.revokeReason),
      );
      if (
        (invitation.status === "accepted" && (!invitation.acceptedAt || !acceptedByUserId || hasRevokedState)) ||
        (invitation.status === "revoked" && (!invitation.revokedAt || hasAcceptedState)) ||
        (["pending", "expired"].includes(invitation.status) && (hasAcceptedState || hasRevokedState))
      ) {
        throw identityImportError(
          "IMPORT_STAFF_INVITATION_TERMINAL_STATE_INVALID",
          `Staff invitation ${canonicalId(invitation.id)} has inconsistent lifecycle timestamps`,
        );
      }
      requireReference(
        organizationsById,
        "staff_invitation",
        invitation.id,
        "organizationId",
        invitation.organizationId,
        "organization",
        true,
      );
      for (const field of ["createdByUserId", "acceptedByUserId", "revokedByUserId"]) {
        requireReference(
          usersById,
          "staff_invitation",
          invitation.id,
          field,
          invitation[field],
          "user",
        );
      }
      if (invitationTokenHashes.has(invitation.tokenHash)) {
        throw identityImportError(
          "IMPORT_STAFF_INVITATION_TOKEN_HASH_DUPLICATE",
          `Staff invitation ${canonicalId(invitation.id)} reuses an acceptance token hash`,
        );
      }
      invitationTokenHashes.add(invitation.tokenHash);
      if (invitation.status === "pending") {
        const principal = `${invitation.organizationId}:${invitation.email}`;
        if (pendingInvitationPrincipals.has(principal)) {
          throw identityImportError(
            "IMPORT_STAFF_INVITATION_PENDING_DUPLICATE",
            `Multiple pending staff invitations target ${principal}`,
          );
        }
        pendingInvitationPrincipals.add(principal);
      }
    } catch (error) {
      addIssue(
        error.code || "IMPORT_STAFF_INVITATION_INVALID",
        "staff_invitation",
        invitation?.id,
        "contract",
        "",
        error.message,
      );
    }
  }

  for (const ticket of supportTickets) {
    try {
      const normalized = normalizeSupportTicketRecord(ticket);
      const status = canonicalId(ticket.status || "open").toLowerCase();
      if (!["open", "acknowledged", "resolved"].includes(status)) {
        throw identityImportError(
          "IMPORT_SUPPORT_TICKET_STATUS_INVALID",
          `Support ticket ${canonicalId(ticket.id)} has unsupported status ${status}`,
        );
      }
      const createdAt = toIso(ticket.createdAt);
      const updatedAt = toIso(ticket.updatedAt || ticket.createdAt);
      const version = Number(ticket.version || 1);
      if (!createdAt || !updatedAt || !Number.isInteger(version) || version < 1) {
        throw identityImportError(
          "IMPORT_SUPPORT_TICKET_METADATA_INVALID",
          `Support ticket ${canonicalId(ticket.id)} has invalid timestamps or version`,
        );
      }
      Object.assign(ticket, normalized, {
        status,
        createdAt,
        updatedAt,
        version,
      });
      requireReference(
        organizationsById,
        "support_ticket",
        ticket.id,
        "workspaceId",
        ticket.workspaceId,
        "organization",
        true,
      );
      requireReference(
        usersById,
        "support_ticket",
        ticket.id,
        "requesterUserId",
        ticket.requesterUserId,
        "user",
        true,
      );
      for (const field of ["acknowledgedByUserId", "resolvedByUserId"]) {
        requireReference(
          usersById,
          "support_ticket",
          ticket.id,
          field,
          ticket[field],
          "user",
        );
      }
    } catch (error) {
      addIssue(
        error.code || "IMPORT_SUPPORT_TICKET_INVALID",
        "support_ticket",
        ticket?.id,
        "contract",
        "",
        error.message,
      );
    }
  }

  for (const batch of patientImportBatches) {
    try {
      const status = canonicalId(batch.status).toLowerCase();
      const rows = Array.isArray(batch.rows) ? batch.rows : [];
      const patientIds = Array.isArray(batch.patientIds)
        ? batch.patientIds.map(canonicalId).filter(Boolean)
        : [];
      const rowCount = Number(batch.rowCount);
      const validCount = Number(batch.validCount);
      const invalidCount = Number(batch.invalidCount);
      const duplicateCount = Number(batch.duplicateCount);
      const importedCount = Number(batch.importedCount || 0);
      const fileSizeBytes = Number(batch.fileSizeBytes);
      const version = Number(batch.version || 1);
      const expiresAt = toIso(batch.expiresAt);
      const committedAt = toIso(batch.committedAt);
      if (!ALLOWED_PATIENT_IMPORT_STATUSES.has(status)) {
        throw identityImportError(
          "IMPORT_PATIENT_BATCH_STATUS_INVALID",
          `Patient import batch ${canonicalId(batch.id)} has unsupported status ${status}`,
        );
      }
      if (
        !Number.isInteger(fileSizeBytes) ||
        fileSizeBytes <= 0 ||
        fileSizeBytes > PATIENT_IMPORT_MAX_BYTES ||
        !/^[0-9a-f]{64}$/i.test(canonicalId(batch.fileSha256))
      ) {
        throw identityImportError(
          "IMPORT_PATIENT_BATCH_FILE_INVALID",
          `Patient import batch ${canonicalId(batch.id)} has invalid file metadata`,
        );
      }
      if (
        ![rowCount, validCount, invalidCount, duplicateCount, importedCount, version].every(Number.isInteger) ||
        rowCount < 0 ||
        validCount < 0 ||
        invalidCount < 0 ||
        duplicateCount < 0 ||
        importedCount < 0 ||
        version < 1 ||
        rows.length !== rowCount ||
        validCount + invalidCount !== rowCount ||
        duplicateCount > invalidCount ||
        importedCount > rowCount
      ) {
        throw identityImportError(
          "IMPORT_PATIENT_BATCH_COUNTS_INVALID",
          `Patient import batch ${canonicalId(batch.id)} has inconsistent row counts`,
        );
      }
      if (!expiresAt || (batch.committedAt && !committedAt)) {
        throw identityImportError(
          "IMPORT_PATIENT_BATCH_TIMESTAMP_INVALID",
          `Patient import batch ${canonicalId(batch.id)} has invalid lifecycle timestamps`,
        );
      }
      if (
        (status === "committed" && (!committedAt || importedCount !== patientIds.length)) ||
        (status !== "committed" && (committedAt || importedCount !== 0 || patientIds.length > 0))
      ) {
        throw identityImportError(
          "IMPORT_PATIENT_BATCH_LIFECYCLE_INVALID",
          `Patient import batch ${canonicalId(batch.id)} has inconsistent commit state`,
        );
      }
      requireReference(
        organizationsById,
        "patient_import_batch",
        batch.id,
        "organizationId",
        batch.organizationId,
        "organization",
        true,
      );
      requireReference(
        usersById,
        "patient_import_batch",
        batch.id,
        "actorUserId",
        batch.actorUserId,
        "user",
      );
      for (const patientId of patientIds) {
        requireReference(
          patientsById,
          "patient_import_batch",
          batch.id,
          "patientIds",
          patientId,
          "patient",
          true,
        );
      }
      Object.assign(batch, {
        status,
        rows,
        patientIds,
        rowCount,
        validCount,
        invalidCount,
        duplicateCount,
        importedCount,
        fileSizeBytes,
        fileSha256: canonicalId(batch.fileSha256).toLowerCase(),
        version,
        expiresAt,
        committedAt: committedAt || "",
      });
    } catch (error) {
      addIssue(
        error.code || "IMPORT_PATIENT_BATCH_INVALID",
        "patient_import_batch",
        batch?.id,
        "contract",
        "",
        error.message,
      );
    }
  }

  const knownStorageBucketIds = new Set([
    "medical-images",
    "heart-audio",
    "patient-reports",
    "device-firmware",
    "avatars",
  ]);
  for (const bucket of storageBuckets) {
    if (bucket?.system) continue;
    try {
      const normalized = normalizeStorageBucketCreate(
        {
          id: bucket.id,
          name: bucket.name || bucket.id,
          description: bucket.description || bucket.desc,
          iconKey: bucket.iconKey,
          colorKey: bucket.colorKey,
          category: bucket.category,
          allowedExtensions: bucket.allowedExtensions,
          allowedMimeTypes: bucket.allowedMimeTypes,
          maxFileSizeMb: bucket.maxFileSizeMb,
        },
        {
          actorUserId: bucket.createdByUserId,
          now: bucket.createdAt || db.createdAt,
        },
      );
      Object.assign(bucket, normalized);
      knownStorageBucketIds.add(normalized.id);
      if (normalized.createdByUserId) {
        requireReference(
          usersById,
          "storage_bucket",
          normalized.id,
          "createdByUserId",
          normalized.createdByUserId,
          "user",
        );
      }
    } catch (error) {
      addIssue(
        error.code || "IMPORT_STORAGE_BUCKET_INVALID",
        "storage_bucket",
        bucket?.id,
        "contract",
        "",
        error.message,
      );
    }
  }

  for (const file of storageFiles) {
    try {
      const normalized = normalizeStorageFileCreate(file, {
        actorUserId: file.createdByUserId,
        now: file.createdAt || db.createdAt,
      });
      if (file.status === "deleted") {
        normalized.status = "deleted";
        normalized.deletedAt = toIso(file.deletedAt);
        normalized.deletedByUserId = canonicalId(file.deletedByUserId);
        if (!normalized.deletedAt) {
          throw identityImportError(
            "IMPORT_STORAGE_FILE_DELETED_AT_REQUIRED",
            `Deleted storage file ${normalized.id} requires deletedAt`,
          );
        }
      }
      Object.assign(file, normalized);
      requireReference(
        organizationsById,
        "storage_file",
        normalized.id,
        "organizationId",
        normalized.organizationId,
        "organization",
        true,
      );
      if (!knownStorageBucketIds.has(normalized.bucket)) {
        addIssue(
          "IMPORT_STORAGE_BUCKET_MISSING",
          "storage_file",
          normalized.id,
          "bucket",
          normalized.bucket,
          `Storage file ${normalized.id} references missing bucket ${normalized.bucket}`,
        );
      }
      if (normalized.createdByUserId) {
        requireReference(
          usersById,
          "storage_file",
          normalized.id,
          "createdByUserId",
          normalized.createdByUserId,
          "user",
        );
      }
      if (normalized.deletedByUserId) {
        requireReference(
          usersById,
          "storage_file",
          normalized.id,
          "deletedByUserId",
          normalized.deletedByUserId,
          "user",
        );
      }
    } catch (error) {
      addIssue(
        error.code || "IMPORT_STORAGE_FILE_INVALID",
        "storage_file",
        file?.id,
        "contract",
        "",
        error.message,
      );
    }
  }

  const servicePackageNames = new Map();
  for (const servicePackage of servicePackages) {
    try {
      const normalized = normalizeStoredServicePackage(servicePackage, { now: db.updatedAt || db.createdAt });
      Object.assign(servicePackage, normalized);
      const normalizedName = normalized.name.toLowerCase();
      const duplicateId = servicePackageNames.get(normalizedName);
      if (duplicateId && duplicateId !== normalized.id) {
        addIssue(
          "IMPORT_PACKAGE_NAME_DUPLICATE",
          "service_package",
          normalized.id,
          "name",
          normalized.name,
          `Service package name ${normalized.name} is duplicated`,
        );
      } else {
        servicePackageNames.set(normalizedName, normalized.id);
      }
    } catch (error) {
      addIssue(
        error.code || "IMPORT_PACKAGE_INVALID",
        "service_package",
        servicePackage.id,
        error.details?.field || "contract",
        "",
        error.message,
      );
    }
  }

  const firebaseAliases = new Map();
  for (const user of users) {
    const firebaseUid = canonicalId(user.firebaseUid);
    if (!firebaseUid) continue;
    const aliases = firebaseAliases.get(firebaseUid) || [];
    aliases.push(canonicalId(user.id));
    firebaseAliases.set(firebaseUid, aliases);
  }
  for (const [firebaseUid, userIds] of firebaseAliases.entries()) {
    if (new Set(userIds).size > 1) {
      addIssue(
        "IMPORT_FIREBASE_UID_DUPLICATE",
        "user",
        userIds.join(","),
        "firebaseUid",
        firebaseUid,
        `Firebase UID ${firebaseUid} belongs to multiple source users`,
      );
    }
  }
  const resolveUserAlias = (value, entityType, entityId, field) => {
    const alias = canonicalId(value);
    if (!alias) return "";
    if (usersById.has(alias)) return alias;
    const candidates = firebaseAliases.get(alias) || [];
    if (candidates.length === 1) return candidates[0];
    addIssue(
      candidates.length > 1 ? "IMPORT_USER_ALIAS_AMBIGUOUS" : "IMPORT_REFERENCE_MISSING",
      entityType,
      entityId,
      field,
      alias,
      candidates.length > 1
        ? `${entityType} ${canonicalId(entityId)} has ambiguous user alias ${alias}`
        : `${entityType} ${canonicalId(entityId)} references unresolved user alias ${alias}`,
    );
    return "";
  };

  for (const user of users) {
    const accountRole = canonicalId(user.role || "patient").toLowerCase();
    if (!ALLOWED_ACCOUNT_ROLES.has(accountRole)) {
      addIssue(
        "IMPORT_USER_ROLE_INVALID",
        "user",
        user.id,
        "role",
        accountRole,
        `User ${canonicalId(user.id)} has unsupported account role ${accountRole}`,
      );
    }
    if (canonicalId(user.password)) {
      addIssue(
        "IMPORT_PLAINTEXT_PASSWORD_FORBIDDEN",
        "user",
        user.id,
        "password",
        "",
        `User ${canonicalId(user.id)} contains a plaintext password field`,
      );
    }
    requireReference(
      organizationsById,
      "user",
      user.id,
      "organizationId",
      user.organizationId,
      "organization",
    );
  }

  const membershipsByPrincipal = new Map();
  for (const membership of memberships) {
    const organizationId = canonicalId(membership.organizationId);
    const userId = canonicalId(membership.userId);
    const membershipStatus = canonicalId(membership.status || "active").toLowerCase();
    membership.status = membershipStatus;
    const membershipOrganization = requireReference(
      organizationsById,
      "membership",
      membership.id,
      "organizationId",
      organizationId,
      "organization",
      true,
    );
    const member = requireReference(usersById, "membership", membership.id, "userId", userId, "user", true);
    const membershipRole = canonicalMembershipRole(membership.role);
    if (!ALLOWED_MEMBERSHIP_STATUSES.has(membershipStatus)) {
      addIssue(
        "IMPORT_MEMBERSHIP_STATUS_INVALID",
        "membership",
        membership.id,
        "status",
        membership.status,
        `Membership ${canonicalId(membership.id)} has unsupported status ${membershipStatus}`,
      );
    }
    if (!ALLOWED_MEMBERSHIP_ROLES.has(membershipRole)) {
      addIssue(
        "IMPORT_MEMBERSHIP_ROLE_INVALID",
        "membership",
        membership.id,
        "role",
        membership.role,
        `Membership ${canonicalId(membership.id)} has unsupported role ${canonicalId(membership.role)}`,
      );
    } else if (member && !membershipRoleIsCompatible(member, membershipRole)) {
      addIssue(
        "IMPORT_MEMBERSHIP_ROLE_INCONSISTENT",
        "membership",
        membership.id,
        "role",
        membershipRole,
        `Membership ${canonicalId(membership.id)} grants ${membershipRole} to incompatible account role ${canonicalId(member.role)}`,
      );
    }
    if (
      member &&
      isOperationalMembershipRole(membershipRole) &&
      canonicalId(member.accountStatus || "active") !== "active"
    ) {
      addIssue(
        "IMPORT_MEMBERSHIP_ACCOUNT_INACTIVE",
        "membership",
        membership.id,
        "userId",
        userId,
        `Membership ${canonicalId(membership.id)} grants an operational role to an inactive account`,
      );
    }
    if (member && isOperationalMembershipRole(membershipRole) && !hasApprovedOperationalIdentity(member)) {
      addIssue(
        "IMPORT_MEMBERSHIP_APPROVAL_REQUIRED",
        "membership",
        membership.id,
        "userId",
        userId,
        `Membership ${canonicalId(membership.id)} grants an operational role without approved identity state`,
      );
    }
    if (isOperationalMembershipRole(membershipRole) && membershipOrganization && !isActiveSharedOrganization(membershipOrganization)) {
      addIssue(
        "IMPORT_MEMBERSHIP_ACTIVE_WORKSPACE_REQUIRED",
        "membership",
        membership.id,
        "organizationId",
        organizationId,
        `Operational membership ${canonicalId(membership.id)} requires an active shared workspace`,
      );
    }
    if (organizationId && userId) {
      const key = `${organizationId}:${userId}`;
      if (membershipsByPrincipal.has(key)) {
        addIssue(
          "IMPORT_MEMBERSHIP_DUPLICATE",
          "membership",
          membership.id,
          "organizationId,userId",
          key,
          `Multiple memberships target ${key}`,
        );
      } else {
        membershipsByPrincipal.set(key, membership);
      }
    }
  }

  const ownerMembershipRoles = new Set(["owner", "workspace_owner"]);
  const hasClinicalActorAuthority = (user, organizationId, allowedMembershipRoles) => {
    if (!user || canonicalId(user.accountStatus || "active") !== "active") return false;
    const accountRole = canonicalId(user.role || "patient").toLowerCase();
    if (["admin", "platform_admin"].includes(accountRole)) return true;
    if (!hasApprovedOperationalIdentity(user)) return false;
    const membership = membershipsByPrincipal.get(`${canonicalId(organizationId)}:${canonicalId(user.id)}`);
    if (
      !membership ||
      canonicalId(membership.status || "active").toLowerCase() !== "active" ||
      !membershipRoleIsCompatible(user, membership.role)
    ) {
      return false;
    }
    return allowedMembershipRoles.has(canonicalMembershipRole(membership.role));
  };
  for (const organization of organizations) {
    const ownerUserId = canonicalId(organization.ownerUserId);
    const status = canonicalId(organization.status || "active").toLowerCase();
    const workspaceType = canonicalId(organization.workspaceType || organization.type || "clinic").toLowerCase();
    requireReference(
      servicePackagesById,
      "organization",
      organization.id,
      "packageId",
      organization.packageId,
      "service_package",
    );
    if (!ALLOWED_WORKSPACE_STATUSES.has(status)) {
      addIssue(
        "IMPORT_WORKSPACE_STATUS_INVALID",
        "organization",
        organization.id,
        "status",
        status,
        `Organization ${organization.id} has unsupported status ${status}`,
      );
    }
    if (!ALLOWED_WORKSPACE_TYPES.has(workspaceType)) {
      addIssue(
        "IMPORT_WORKSPACE_TYPE_INVALID",
        "organization",
        organization.id,
        "workspaceType",
        workspaceType,
        `Organization ${organization.id} has unsupported workspace type ${workspaceType}`,
      );
    }
    if (status === "active" && workspaceType !== "personal" && !ownerUserId) {
      addIssue(
        "IMPORT_ACTIVE_WORKSPACE_OWNER_REQUIRED",
        "organization",
        organization.id,
        "ownerUserId",
        "",
        `Active shared workspace ${organization.id} requires a canonical owner`,
      );
    }
    if (!ownerUserId) continue;
    const owner = requireReference(
      usersById,
      "organization",
      organization.id,
      "ownerUserId",
      ownerUserId,
      "user",
    );
    if (!owner) continue;
    if (status !== "active") {
      addIssue(
        "IMPORT_WORKSPACE_OWNER_STATUS_INVALID",
        "organization",
        organization.id,
        "status",
        organization.status,
        `Organization ${organization.id} cannot have a canonical owner while it is not active`,
      );
    }
    if (canonicalId(owner.organizationId) !== canonicalId(organization.id)) {
      addIssue(
        "IMPORT_WORKSPACE_OWNER_TENANT_MISMATCH",
        "organization",
        organization.id,
        "ownerUserId",
        ownerUserId,
        `Workspace owner ${ownerUserId} does not belong to organization ${organization.id}`,
      );
    }
    if (!OWNER_CAPABLE_ACCOUNT_ROLES.has(canonicalId(owner.role))) {
      addIssue(
        "IMPORT_WORKSPACE_OWNER_ROLE_INVALID",
        "organization",
        organization.id,
        "ownerUserId",
        ownerUserId,
        `Workspace owner ${ownerUserId} does not have an owner-capable account role`,
      );
    }
    if (canonicalId(owner.accountStatus || "active") !== "active") {
      addIssue(
        "IMPORT_WORKSPACE_OWNER_INACTIVE",
        "organization",
        organization.id,
        "ownerUserId",
        ownerUserId,
        `Workspace owner ${ownerUserId} is not active`,
      );
    }
    const membership = membershipsByPrincipal.get(`${canonicalId(organization.id)}:${ownerUserId}`);
    if (
      !membership ||
      canonicalId(membership.status || "active").toLowerCase() !== "active" ||
      !ownerMembershipRoles.has(canonicalId(membership.role))
    ) {
      addIssue(
        "IMPORT_WORKSPACE_OWNER_MEMBERSHIP_REQUIRED",
        "organization",
        organization.id,
        "ownerUserId",
        ownerUserId,
        `Workspace owner ${ownerUserId} is missing an owner membership in ${organization.id}`,
      );
    }
  }

  for (const patient of patients) {
    if (patient.updatedAt && !toIso(patient.updatedAt)) {
      addIssue(
        "PATIENT_IMPORT_UPDATED_AT_INVALID",
        "patient",
        patient.id,
        "updatedAt",
        patient.updatedAt,
        `Patient ${canonicalId(patient.id)} has an invalid updatedAt timestamp`,
      );
    }
    requireReference(organizationsById, "patient", patient.id, "organizationId", patient.organizationId, "organization");
    requireReference(usersById, "patient", patient.id, "ownerUserId", patient.ownerUserId, "user");
    requireReference(usersById, "patient", patient.id, "accountUserId", patient.accountUserId, "user");
    requireReference(usersById, "patient", patient.id, "guardianUserId", patient.guardianUserId, "user");
    requireReference(usersById, "patient", patient.id, "primaryDoctorId", patient.primaryDoctorId, "user");
  }

  for (const device of devices) {
    requireReference(organizationsById, "device", device.id, "organizationId", device.organizationId, "organization");
    const ownerUserId = canonicalId(device.ownerUserId || device.pairedUserId);
    const pairedUser = requireReference(usersById, "device", device.id, "ownerUserId", ownerUserId, "user");
    const assignedPatient = requireReference(
      patientsById,
      "device",
      device.id,
      "assignedPatientId",
      device.assignedPatientId,
      "patient",
    );
    requireReference(
      usersById,
      "device",
      device.id,
      "revokedByUserId",
      device.revokedByUserId,
      "user",
    );
    if (pairedUser && canonicalId(pairedUser.organizationId) !== canonicalId(device.organizationId)) {
      addIssue(
        "IMPORT_DEVICE_TENANT_MISMATCH",
        "device",
        device.id,
        "ownerUserId",
        ownerUserId,
        `Device ${canonicalId(device.id)} and paired user belong to different tenants`,
      );
    }
    if (
      assignedPatient &&
      canonicalId(assignedPatient.organizationId) !== canonicalId(device.organizationId)
    ) {
      addIssue(
        "IMPORT_DEVICE_PATIENT_TENANT_MISMATCH",
        "device",
        device.id,
        "assignedPatientId",
        device.assignedPatientId,
        `Device ${canonicalId(device.id)} and assigned patient belong to different tenants`,
      );
    }
  }

  for (const claim of deviceClaims) {
    const device = requireReference(
      devicesById,
      "device_claim",
      claim.id,
      "deviceId",
      claim.deviceId,
      "device",
      true,
    );
    requireReference(
      organizationsById,
      "device_claim",
      claim.id,
      "organizationId",
      claim.organizationId,
      "organization",
      true,
    );
    for (const [field, value] of [
      ["createdByUserId", claim.createdByUserId],
      ["claimedByUserId", claim.claimedByUserId],
      ["revokedByUserId", claim.revokedByUserId],
    ]) {
      requireReference(usersById, "device_claim", claim.id, field, value, "user");
    }
    if (
      device &&
      canonicalId(device.organizationId) !== canonicalId(claim.organizationId)
    ) {
      addIssue(
        "IMPORT_DEVICE_CLAIM_TENANT_MISMATCH",
        "device_claim",
        claim.id,
        "organizationId",
        claim.organizationId,
        `Device claim ${canonicalId(claim.id)} belongs to a different tenant than its device`,
      );
    }
    if (!canonicalId(claim.claimCodeHash)) {
      addIssue(
        "IMPORT_DEVICE_CLAIM_HASH_REQUIRED",
        "device_claim",
        claim.id,
        "claimCodeHash",
        "",
        `Device claim ${canonicalId(claim.id)} is missing its one-way claim hash`,
      );
    }
    if (canonicalId(claim.claimCode)) {
      addIssue(
        "IMPORT_DEVICE_CLAIM_PLAINTEXT_FORBIDDEN",
        "device_claim",
        claim.id,
        "claimCode",
        "",
        `Device claim ${canonicalId(claim.id)} contains a plaintext claim code`,
      );
    }
  }

  for (const command of deviceCommands) {
    const device = requireReference(
      devicesById,
      "device_command",
      command.id,
      "deviceId",
      command.deviceId,
      "device",
      true,
    );
    const organization = requireReference(
      organizationsById,
      "device_command",
      command.id,
      "organizationId",
      command.organizationId,
      "organization",
    );
    requireReference(
      usersById,
      "device_command",
      command.id,
      "requestedByUserId",
      command.requestedByUserId,
      "user",
    );
    if (device && organization && canonicalId(device.organizationId) !== canonicalId(command.organizationId)) {
      addIssue(
        "IMPORT_DEVICE_COMMAND_TENANT_MISMATCH",
        "device_command",
        command.id,
        "organizationId",
        command.organizationId,
        `Device command ${canonicalId(command.id)} and device belong to different tenants`,
      );
    }
    if (Number(command.protocolVersion || 1) !== 1) {
      addIssue(
        "IMPORT_DEVICE_COMMAND_PROTOCOL_INVALID",
        "device_command",
        command.id,
        "protocolVersion",
        command.protocolVersion,
        `Device command ${canonicalId(command.id)} has an unsupported protocol version`,
      );
    }
    if (!ALLOWED_DEVICE_COMMAND_TYPES.has(canonicalId(command.type))) {
      addIssue(
        "IMPORT_DEVICE_COMMAND_TYPE_INVALID",
        "device_command",
        command.id,
        "type",
        command.type,
        `Device command ${canonicalId(command.id)} has an unsupported type`,
      );
    }
    if (!ALLOWED_DEVICE_COMMAND_STATES.has(canonicalId(command.state))) {
      addIssue(
        "IMPORT_DEVICE_COMMAND_STATE_INVALID",
        "device_command",
        command.id,
        "state",
        command.state,
        `Device command ${canonicalId(command.id)} has an unsupported state`,
      );
    }
    if (!canonicalId(command.correlationId)) {
      addIssue(
        "IMPORT_DEVICE_COMMAND_CORRELATION_REQUIRED",
        "device_command",
        command.id,
        "correlationId",
        "",
        `Device command ${canonicalId(command.id)} is missing correlation identity`,
      );
    }
    if (!toIso(command.issuedAt) || !toIso(command.expiresAt) || Date.parse(command.expiresAt) <= Date.parse(command.issuedAt)) {
      addIssue(
        "IMPORT_DEVICE_COMMAND_TIME_INVALID",
        "device_command",
        command.id,
        "issuedAt,expiresAt",
        "",
        `Device command ${canonicalId(command.id)} has an invalid issue/expiry window`,
      );
    }
    for (const forbiddenField of ["payload", "token", "signature", "envelope"]) {
      if (Object.prototype.hasOwnProperty.call(command, forbiddenField)) {
        addIssue(
          "IMPORT_DEVICE_COMMAND_SECRET_MATERIAL_FORBIDDEN",
          "device_command",
          command.id,
          forbiddenField,
          "",
          `Device command ${canonicalId(command.id)} contains forbidden raw command material`,
        );
      }
    }
  }

  for (const scan of scans) {
    const patient = requireReference(patientsById, "scan", scan.id, "patientId", scan.patientId, "patient", true);
    requireReference(organizationsById, "scan", scan.id, "organizationId", scan.organizationId, "organization");
    const device = requireReference(devicesById, "scan", scan.id, "deviceId", scan.deviceId, "device");
    const creator = requireReference(usersById, "scan", scan.id, "createdByUserId", scan.createdByUserId, "user");
    const scanOrganizationId = canonicalId(scan.organizationId);
    if (patient && canonicalId(patient.organizationId) !== scanOrganizationId) {
      addIssue(
        "IMPORT_SCAN_PATIENT_TENANT_MISMATCH",
        "scan",
        scan.id,
        "organizationId",
        scan.organizationId,
        `Scan ${canonicalId(scan.id)} and patient belong to different tenants`,
      );
    }
    if (device && canonicalId(device.organizationId) !== scanOrganizationId) {
      addIssue(
        "IMPORT_SCAN_DEVICE_TENANT_MISMATCH",
        "scan",
        scan.id,
        "deviceId",
        scan.deviceId,
        `Scan ${canonicalId(scan.id)} and device belong to different tenants`,
      );
    }
    if (creator && canonicalId(creator.organizationId) !== scanOrganizationId) {
      addIssue(
        "IMPORT_SCAN_CREATOR_TENANT_MISMATCH",
        "scan",
        scan.id,
        "createdByUserId",
        scan.createdByUserId,
        `Scan ${canonicalId(scan.id)} and creator belong to different tenants`,
      );
    }
  }

  const scanAudioTotals = new Map();
  for (const chunk of scanAudioChunks) {
    const chunkId = canonicalId(chunk.id);
    const scan = requireReference(
      scansById,
      "scan_audio_chunk",
      chunkId,
      "scanId",
      chunk.scanId,
      "scan",
      true,
    );
    requireReference(
      organizationsById,
      "scan_audio_chunk",
      chunkId,
      "organizationId",
      chunk.organizationId,
      "organization",
      true,
    );
    if (scan && canonicalId(scan.organizationId) !== canonicalId(chunk.organizationId)) {
      addIssue(
        "IMPORT_SCAN_AUDIO_CHUNK_TENANT_MISMATCH",
        "scan_audio_chunk",
        chunkId,
        "organizationId",
        chunk.organizationId,
        `Audio chunk ${chunkId} does not belong to its scan workspace`,
      );
    }
    const byteSize = Number(chunk.byteSize || 0);
    const sequence = Number(chunk.sequence);
    if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_SCAN_AUDIO_CHUNK_BYTES) {
      addIssue(
        "IMPORT_SCAN_AUDIO_CHUNK_SIZE_INVALID",
        "scan_audio_chunk",
        chunkId,
        "byteSize",
        chunk.byteSize,
        `Audio chunk ${chunkId} exceeds the ${MAX_SCAN_AUDIO_CHUNK_BYTES}-byte limit`,
      );
    }
    if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= MAX_SCAN_AUDIO_CHUNK_COUNT) {
      addIssue(
        "IMPORT_SCAN_AUDIO_CHUNK_SEQUENCE_INVALID",
        "scan_audio_chunk",
        chunkId,
        "sequence",
        chunk.sequence,
        `Audio chunk ${chunkId} has an out-of-range sequence`,
      );
    }
    const scanId = canonicalId(chunk.scanId);
    const total = scanAudioTotals.get(scanId) || { chunkCount: 0, totalBytes: 0 };
    total.chunkCount += 1;
    total.totalBytes += Number.isSafeInteger(byteSize) && byteSize > 0 ? byteSize : 0;
    scanAudioTotals.set(scanId, total);
  }

  for (const [scanId, total] of scanAudioTotals.entries()) {
    if (total.chunkCount > MAX_SCAN_AUDIO_CHUNK_COUNT || total.totalBytes > MAX_SCAN_AUDIO_TOTAL_BYTES) {
      addIssue(
        "IMPORT_SCAN_AUDIO_UPLOAD_LIMIT_EXCEEDED",
        "scan",
        scanId,
        "scanAudioChunks",
        `${total.chunkCount}:${total.totalBytes}`,
        `Audio upload ${scanId} exceeds the configured chunk or byte limit`,
      );
    }
  }

  for (const completion of scanAudioCompletions) {
    const completionId = canonicalId(completion.id);
    const scan = requireReference(
      scansById,
      "scan_audio_completion",
      completionId,
      "scanId",
      completion.scanId,
      "scan",
      true,
    );
    requireReference(
      organizationsById,
      "scan_audio_completion",
      completionId,
      "organizationId",
      completion.organizationId,
      "organization",
      true,
    );
    if (scan && canonicalId(scan.organizationId) !== canonicalId(completion.organizationId)) {
      addIssue(
        "IMPORT_SCAN_AUDIO_COMPLETION_TENANT_MISMATCH",
        "scan_audio_completion",
        completionId,
        "organizationId",
        completion.organizationId,
        `Audio completion ${completionId} does not belong to its scan workspace`,
      );
    }
    const chunkCount = Number(completion.chunkCount || 0);
    const totalBytes = Number(completion.totalBytes || 0);
    if (
      !Number.isSafeInteger(chunkCount) ||
      chunkCount < 1 ||
      chunkCount > MAX_SCAN_AUDIO_CHUNK_COUNT ||
      !Number.isSafeInteger(totalBytes) ||
      totalBytes < 1 ||
      totalBytes > MAX_SCAN_AUDIO_TOTAL_BYTES
    ) {
      addIssue(
        "IMPORT_SCAN_AUDIO_COMPLETION_LIMIT_INVALID",
        "scan_audio_completion",
        completionId,
        "chunkCount,totalBytes",
        `${completion.chunkCount}:${completion.totalBytes}`,
        `Audio completion ${completionId} exceeds the configured chunk or byte limit`,
      );
    }
  }

  const reviewByScanId = new Map();
  for (const review of scanReviews) {
    const reviewId = canonicalId(review.id);
    const scanId = canonicalId(review.scanId);
    const scan = requireReference(scansById, "scan_review", reviewId, "scanId", scanId, "scan", true);
    requireReference(
      organizationsById,
      "scan_review",
      reviewId,
      "organizationId",
      review.organizationId,
      "organization",
      true,
    );
    const patient = requireReference(
      patientsById,
      "scan_review",
      reviewId,
      "patientId",
      review.patientId,
      "patient",
      true,
    );
    const reviewer = requireReference(
      usersById,
      "scan_review",
      reviewId,
      "reviewerUserId",
      review.reviewerUserId,
      "user",
    );
    if (scanId) {
      if (reviewByScanId.has(scanId)) {
        addIssue(
          "IMPORT_SCAN_REVIEW_DUPLICATE_SCAN",
          "scan_review",
          reviewId,
          "scanId",
          scanId,
          `Multiple review rows target scan ${scanId}`,
        );
      } else {
        reviewByScanId.set(scanId, reviewId);
      }
    }
    const organizationId = canonicalId(review.organizationId);
    const patientId = canonicalId(review.patientId);
    if (
      (scan && canonicalId(scan.organizationId) !== organizationId) ||
      (scan && canonicalId(scan.patientId) !== patientId) ||
      (patient && canonicalId(patient.organizationId) !== organizationId)
    ) {
      addIssue(
        "IMPORT_SCAN_REVIEW_TENANT_MISMATCH",
        "scan_review",
        reviewId,
        "organizationId,patientId,scanId",
        `${organizationId}:${patientId}:${scanId}`,
        `Scan review ${reviewId} does not match its canonical scan tenant and patient`,
      );
    }
    if (
      reviewer &&
      canonicalId(reviewer.organizationId) &&
      canonicalId(reviewer.organizationId) !== organizationId
    ) {
      addIssue(
        "IMPORT_SCAN_REVIEW_TENANT_MISMATCH",
        "scan_review",
        reviewId,
        "reviewerUserId",
        review.reviewerUserId,
        `Scan review ${reviewId} reviewer belongs to another tenant`,
      );
    }
    const status = canonicalId(review.status || "pending").toLowerCase();
    const decision = canonicalId(review.decision).toLowerCase();
    const version = Number(review.version === undefined || review.version === null || review.version === "" ? 1 : review.version);
    review.status = status;
    review.decision = decision;
    review.version = version;
    if (!ALLOWED_REVIEW_STATUSES.has(status)) {
      addIssue(
        "IMPORT_SCAN_REVIEW_STATUS_INVALID",
        "scan_review",
        reviewId,
        "status",
        status,
        `Scan review ${reviewId} has an unsupported status`,
      );
    }
    if (!Number.isSafeInteger(version) || version < 1) {
      addIssue(
        "IMPORT_SCAN_REVIEW_VERSION_INVALID",
        "scan_review",
        reviewId,
        "version",
        review.version,
        `Scan review ${reviewId} has an invalid version`,
      );
    }
    if (decision && !ALLOWED_REVIEW_DECISIONS.has(decision)) {
      addIssue(
        "IMPORT_SCAN_REVIEW_DECISION_INVALID",
        "scan_review",
        reviewId,
        "decision",
        decision,
        `Scan review ${reviewId} has an unsupported decision`,
      );
    }
    if (status === "reviewed") {
      if (!decision || !ALLOWED_REVIEW_DECISIONS.has(decision)) {
        addIssue(
          "IMPORT_SCAN_REVIEW_DECISION_INVALID",
          "scan_review",
          reviewId,
          "decision",
          decision,
          `Reviewed scan ${scanId} requires a canonical decision`,
        );
      }
      if (!canonicalId(review.reviewerUserId)) {
        addIssue(
          "IMPORT_SCAN_REVIEW_REVIEWER_REQUIRED",
          "scan_review",
          reviewId,
          "reviewerUserId",
          "",
          `Reviewed scan ${scanId} requires a reviewer`,
        );
      }
      if (!toIso(review.reviewedAt)) {
        addIssue(
          "IMPORT_SCAN_REVIEW_REVIEWED_AT_REQUIRED",
          "scan_review",
          reviewId,
          "reviewedAt",
          review.reviewedAt,
          `Reviewed scan ${scanId} requires a valid review timestamp`,
        );
      }
      if (!hasClinicalActorAuthority(reviewer, organizationId, REVIEW_MANAGE_MEMBERSHIP_ROLES)) {
        addIssue(
          "IMPORT_SCAN_REVIEW_ACTOR_UNAUTHORIZED",
          "scan_review",
          reviewId,
          "reviewerUserId",
          review.reviewerUserId,
          `Scan review ${reviewId} reviewer lacks an approved review-manage identity in ${organizationId}`,
        );
      }
    }
    for (const [field, value] of [["createdAt", review.createdAt], ["updatedAt", review.updatedAt]]) {
      if (value && !toIso(value)) {
        addIssue(
          "IMPORT_SCAN_REVIEW_TIMESTAMP_INVALID",
          "scan_review",
          reviewId,
          field,
          value,
          `Scan review ${reviewId} has an invalid ${field} timestamp`,
        );
      }
    }
  }

  const alertOccurrenceKeys = new Map();
  const activeAlertKeys = new Map();
  for (const alert of clinicalAlerts) {
    const alertId = canonicalId(alert.id);
    const organizationId = canonicalId(alert.organizationId);
    const sourceType = canonicalId(alert.sourceType).toLowerCase();
    const sourceId = canonicalId(alert.sourceId);
    const expectedDedupeKey = sourceType && sourceId ? `${sourceType}:${sourceId}` : "";
    const dedupeKey = canonicalId(alert.dedupeKey) || expectedDedupeKey;
    const status = canonicalId(alert.status || "open").toLowerCase();
    const version = Number(alert.version === undefined || alert.version === null || alert.version === "" ? 1 : alert.version);
    const occurrenceNumber = Number(
      alert.occurrenceNumber === undefined || alert.occurrenceNumber === null || alert.occurrenceNumber === ""
        ? 1
        : alert.occurrenceNumber,
    );
    const previousAlertId = canonicalId(alert.previousAlertId);
    alert.sourceType = sourceType;
    alert.sourceId = sourceId;
    alert.dedupeKey = dedupeKey;
    alert.status = status;
    alert.version = version;
    alert.occurrenceNumber = occurrenceNumber;
    alert.previousAlertId = previousAlertId;
    alert.occurredAt = alert.occurredAt || alert.createdAt || alert.updatedAt || "";
    if (sourceType === "device" && !canonicalId(alert.deviceId)) alert.deviceId = sourceId;
    if (sourceType === "scan" && !canonicalId(alert.scanId)) alert.scanId = sourceId;

    requireReference(
      organizationsById,
      "clinical_alert",
      alertId,
      "organizationId",
      organizationId,
      "organization",
      true,
    );
    const patient = requireReference(
      patientsById,
      "clinical_alert",
      alertId,
      "patientId",
      alert.patientId,
      "patient",
    );
    const device = requireReference(
      devicesById,
      "clinical_alert",
      alertId,
      "deviceId",
      alert.deviceId,
      "device",
      sourceType === "device",
    );
    const scan = requireReference(
      scansById,
      "clinical_alert",
      alertId,
      "scanId",
      alert.scanId,
      "scan",
      sourceType === "scan",
    );
    const acknowledgedBy = requireReference(
      usersById,
      "clinical_alert",
      alertId,
      "acknowledgedByUserId",
      alert.acknowledgedByUserId,
      "user",
    );
    const resolvedBy = requireReference(
      usersById,
      "clinical_alert",
      alertId,
      "resolvedByUserId",
      alert.resolvedByUserId,
      "user",
    );

    if (!ALLOWED_ALERT_SOURCE_TYPES.has(sourceType) || !sourceId) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_SOURCE_INVALID",
        "clinical_alert",
        alertId,
        "sourceType,sourceId",
        `${sourceType}:${sourceId}`,
        `Clinical alert ${alertId} requires a canonical device or scan source`,
      );
    }
    if (
      (sourceType === "device" && canonicalId(alert.deviceId) !== sourceId) ||
      (sourceType === "scan" && canonicalId(alert.scanId) !== sourceId)
    ) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_SOURCE_INVALID",
        "clinical_alert",
        alertId,
        sourceType === "device" ? "deviceId" : "scanId",
        sourceId,
        `Clinical alert ${alertId} source identity does not match its linked resource`,
      );
    }
    if (!canonicalId(alert.title) || !canonicalId(alert.message)) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_CONTENT_REQUIRED",
        "clinical_alert",
        alertId,
        "title,message",
        "",
        `Clinical alert ${alertId} requires a title and message`,
      );
    }
    if (dedupeKey !== expectedDedupeKey) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_DEDUPE_MISMATCH",
        "clinical_alert",
        alertId,
        "dedupeKey",
        dedupeKey,
        `Clinical alert ${alertId} dedupe identity does not match its source`,
      );
    }
    if (!ALLOWED_ALERT_STATUSES.has(status)) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_STATUS_INVALID",
        "clinical_alert",
        alertId,
        "status",
        status,
        `Clinical alert ${alertId} has an unsupported status`,
      );
    }
    if (!Number.isSafeInteger(version) || version < 1) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_VERSION_INVALID",
        "clinical_alert",
        alertId,
        "version",
        alert.version,
        `Clinical alert ${alertId} has an invalid version`,
      );
    }
    if (!Number.isSafeInteger(occurrenceNumber) || occurrenceNumber < 1) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_OCCURRENCE_INVALID",
        "clinical_alert",
        alertId,
        "occurrenceNumber",
        alert.occurrenceNumber,
        `Clinical alert ${alertId} has an invalid occurrence number`,
      );
    }

    const occurrenceKey = `${organizationId}:${dedupeKey}:${occurrenceNumber}`;
    if (alertOccurrenceKeys.has(occurrenceKey)) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_OCCURRENCE_DUPLICATE",
        "clinical_alert",
        alertId,
        "occurrenceNumber",
        occurrenceKey,
        `Clinical alert occurrence ${occurrenceKey} is duplicated`,
      );
    } else {
      alertOccurrenceKeys.set(occurrenceKey, alertId);
    }
    if (["open", "acknowledged"].includes(status)) {
      const activeKey = `${organizationId}:${dedupeKey}`;
      if (activeAlertKeys.has(activeKey)) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_ACTIVE_DUPLICATE",
          "clinical_alert",
          alertId,
          "status",
          activeKey,
          `Multiple active clinical alerts target source ${activeKey}`,
        );
      } else {
        activeAlertKeys.set(activeKey, alertId);
      }
    }

    if (
      (patient && canonicalId(patient.organizationId) !== organizationId) ||
      (device && canonicalId(device.organizationId) !== organizationId) ||
      (scan && canonicalId(scan.organizationId) !== organizationId) ||
      (scan && canonicalId(alert.patientId) && canonicalId(scan.patientId) !== canonicalId(alert.patientId))
    ) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_TENANT_MISMATCH",
        "clinical_alert",
        alertId,
        "organizationId,patientId,deviceId,scanId",
        organizationId,
        `Clinical alert ${alertId} references a resource outside its tenant`,
      );
    }
    if (
      (scan && canonicalId(alert.deviceId) && canonicalId(scan.deviceId) !== canonicalId(alert.deviceId)) ||
      (scan && device && canonicalId(scan.deviceId) !== canonicalId(device.id))
    ) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_PROVENANCE_MISMATCH",
        "clinical_alert",
        alertId,
        "patientId,deviceId,scanId",
        `${canonicalId(alert.patientId)}:${canonicalId(alert.deviceId)}:${canonicalId(alert.scanId)}`,
        `Clinical alert ${alertId} source does not match its canonical scan, device, and patient provenance`,
      );
    }
    for (const [field, actor] of [["acknowledgedByUserId", acknowledgedBy], ["resolvedByUserId", resolvedBy]]) {
      if (actor && canonicalId(actor.organizationId) && canonicalId(actor.organizationId) !== organizationId) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_TENANT_MISMATCH",
          "clinical_alert",
          alertId,
          field,
          actor.id,
          `Clinical alert ${alertId} lifecycle actor belongs to another tenant`,
        );
      }
    }
    if (status === "acknowledged") {
      if (!canonicalId(alert.acknowledgedByUserId)) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_ACTOR_REQUIRED",
          "clinical_alert",
          alertId,
          "acknowledgedByUserId",
          "",
          `Acknowledged alert ${alertId} requires an actor`,
        );
      }
      if (!toIso(alert.acknowledgedAt)) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_TIMESTAMP_REQUIRED",
          "clinical_alert",
          alertId,
          "acknowledgedAt",
          alert.acknowledgedAt,
          `Acknowledged alert ${alertId} requires a valid timestamp`,
        );
      }
    }
    if (status === "resolved") {
      if (!canonicalId(alert.resolvedByUserId)) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_ACTOR_REQUIRED",
          "clinical_alert",
          alertId,
          "resolvedByUserId",
          "",
          `Resolved alert ${alertId} requires an actor`,
        );
      }
      if (!toIso(alert.resolvedAt)) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_TIMESTAMP_REQUIRED",
          "clinical_alert",
          alertId,
          "resolvedAt",
          alert.resolvedAt,
          `Resolved alert ${alertId} requires a valid timestamp`,
        );
      }
      if (!canonicalId(alert.resolutionNote)) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_RESOLUTION_NOTE_REQUIRED",
          "clinical_alert",
          alertId,
          "resolutionNote",
          "",
          `Resolved alert ${alertId} requires a resolution note`,
        );
      }
    }
    for (const [field, actor] of [["acknowledgedByUserId", acknowledgedBy], ["resolvedByUserId", resolvedBy]]) {
      if (actor && !hasClinicalActorAuthority(actor, organizationId, ALERT_MANAGE_MEMBERSHIP_ROLES)) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_ACTOR_UNAUTHORIZED",
          "clinical_alert",
          alertId,
          field,
          actor.id,
          `Clinical alert ${alertId} lifecycle actor lacks alert-manage authority in ${organizationId}`,
        );
      }
    }
    if (!toIso(alert.occurredAt)) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_TIMESTAMP_REQUIRED",
        "clinical_alert",
        alertId,
        "occurredAt",
        alert.occurredAt,
        `Clinical alert ${alertId} requires a canonical occurrence timestamp`,
      );
    }
    for (const [field, value] of [
      ["occurredAt", alert.occurredAt],
      ["acknowledgedAt", alert.acknowledgedAt],
      ["resolvedAt", alert.resolvedAt],
      ["createdAt", alert.createdAt],
      ["updatedAt", alert.updatedAt],
    ]) {
      if (value && !toIso(value)) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_TIMESTAMP_INVALID",
          "clinical_alert",
          alertId,
          field,
          value,
          `Clinical alert ${alertId} has an invalid ${field} timestamp`,
        );
      }
    }
  }

  for (const alert of clinicalAlerts) {
    const previousAlertId = canonicalId(alert.previousAlertId);
    const occurrenceNumber = Number(
      alert.occurrenceNumber === undefined || alert.occurrenceNumber === null || alert.occurrenceNumber === ""
        ? 1
        : alert.occurrenceNumber,
    );
    if (!previousAlertId) {
      if (occurrenceNumber > 1) {
        addIssue(
          "IMPORT_CLINICAL_ALERT_PREVIOUS_INVALID",
          "clinical_alert",
          alert.id,
          "previousAlertId",
          "",
          `Clinical alert ${canonicalId(alert.id)} occurrence ${occurrenceNumber} requires its previous alert link`,
        );
      }
      continue;
    }
    const previous = requireReference(
      clinicalAlertsById,
      "clinical_alert",
      alert.id,
      "previousAlertId",
      previousAlertId,
      "clinical_alert",
      true,
    );
    if (
      previous &&
      (
        canonicalId(previous.organizationId) !== canonicalId(alert.organizationId) ||
        canonicalId(previous.dedupeKey) !== canonicalId(alert.dedupeKey) ||
        Number(previous.occurrenceNumber || 1) + 1 !== occurrenceNumber ||
        canonicalId(previous.status) !== "resolved"
      )
    ) {
      addIssue(
        "IMPORT_CLINICAL_ALERT_PREVIOUS_INVALID",
        "clinical_alert",
        alert.id,
        "previousAlertId",
        previousAlertId,
        `Clinical alert ${canonicalId(alert.id)} has an invalid previous occurrence link`,
      );
    }
  }

  for (const grant of Array.isArray(db.doctorPatientAccess) ? db.doctorPatientAccess : []) {
    const grantId = canonicalId(grant.id);
    const patient = requireReference(patientsById, "patient_share", grantId, "patientId", grant.patientId, "patient", true);
    const doctorAliases = [...new Set([canonicalId(grant.doctorUserId), canonicalId(grant.doctorId)].filter(Boolean))];
    const resolvedDoctors = doctorAliases
      .map((alias) => resolveUserAlias(alias, "patient_share", grantId, "doctorUserId"))
      .filter(Boolean);
    const canonicalDoctors = [...new Set(resolvedDoctors)];
    const organizationId = canonicalId(grant.organizationId);
    const grantedByUserId = resolveUserAlias(
      grant.grantedByUserId,
      "patient_share",
      grantId,
      "grantedByUserId",
    );
    if (grantedByUserId) grant.grantedByUserId = grantedByUserId;
    const grantedByUser = grantedByUserId ? usersById.get(grantedByUserId) || null : null;
    const patientPrincipalIds = new Set(
      [
        canonicalId(patient?.ownerUserId),
        canonicalId(patient?.accountUserId),
        canonicalId(patient?.guardianUserId),
      ].filter(Boolean),
    );
    const derivedAuthorityType =
      grantedByUserId &&
      canonicalId(grantedByUser?.role) === "patient" &&
      patientPrincipalIds.has(grantedByUserId)
        ? "patient_consent"
        : doctorAliases.length
          ? "clinician_access_grant"
          : "administrative_assignment";
    const sourceAuthorityType = canonicalId(grant.authorityType);
    if (
      sourceAuthorityType &&
      !ALLOWED_PATIENT_ACCESS_AUTHORITY_TYPES.has(sourceAuthorityType)
    ) {
      addIssue(
        "IMPORT_SHARE_AUTHORITY_TYPE_INVALID",
        "patient_share",
        grantId,
        "authorityType",
        sourceAuthorityType,
        `Patient share ${grantId} has unsupported authority type ${sourceAuthorityType}`,
      );
    } else if (sourceAuthorityType && sourceAuthorityType !== derivedAuthorityType) {
      addIssue(
        "IMPORT_SHARE_AUTHORITY_TYPE_MISMATCH",
        "patient_share",
        grantId,
        "authorityType",
        sourceAuthorityType,
        `Patient share ${grantId} authority type does not match its actor and recipient`,
      );
    }
    grant.authorityType = sourceAuthorityType || derivedAuthorityType;
    grant.purpose = String(grant.purpose || "").slice(0, 2000);
    if (grant.authorityType === "patient_consent") {
      grant.consentedAt = toIso(grant.consentedAt) || toIso(grant.createdAt) || "";
      if (!grant.consentedAt) {
        addIssue(
          "IMPORT_SHARE_CONSENT_TIMESTAMP_REQUIRED",
          "patient_share",
          grantId,
          "consentedAt",
          "",
          `Patient consent ${grantId} requires a durable consent timestamp`,
        );
      }
    } else {
      if (grant.consentedAt) {
        addIssue(
          "IMPORT_SHARE_CONSENT_TIMESTAMP_INVALID",
          "patient_share",
          grantId,
          "consentedAt",
          grant.consentedAt,
          `Non-consent patient access ${grantId} cannot carry a consent timestamp`,
        );
      }
      grant.consentedAt = "";
    }
    if (doctorAliases.length && organizationId) {
      addIssue(
        "IMPORT_SHARE_PRINCIPAL_EXCLUSIVE",
        "patient_share",
        grantId,
        "doctorUserId,organizationId",
        organizationId,
        `Patient share ${grantId} contains both doctor and workspace principals`,
      );
    } else if (!doctorAliases.length && !organizationId) {
      addIssue(
        "IMPORT_SHARE_PRINCIPAL_REQUIRED",
        "patient_share",
        grantId,
        "doctorUserId,organizationId",
        "",
        `Patient share ${grantId} has no principal`,
      );
    }
    if (canonicalDoctors.length > 1) {
      addIssue(
        "IMPORT_SHARE_DOCTOR_CONFLICT",
        "patient_share",
        grantId,
        "doctorUserId,doctorId",
        canonicalDoctors.join(","),
        `Patient share ${grantId} resolves to multiple doctors`,
      );
    }
    if (canonicalDoctors.length === 1) {
      const doctor = usersById.get(canonicalDoctors[0]);
      if (canonicalId(doctor?.role) !== "doctor") {
        addIssue(
          "IMPORT_SHARE_DOCTOR_ROLE_INVALID",
          "patient_share",
          grantId,
          "doctorUserId",
          canonicalDoctors[0],
          `Patient share ${grantId} principal is not a doctor`,
        );
      }
      const doctorMembership = memberships.find((membership) => (
        canonicalId(membership.userId) === canonicalDoctors[0] &&
        canonicalMembershipRole(membership.role) === "doctor" &&
        canonicalId(membership.status || "active").toLowerCase() === "active" &&
        isActiveSharedOrganization(organizationsById.get(canonicalId(membership.organizationId)))
      )) || null;
      if (
        canonicalId(doctor?.accountStatus || "active") !== "active" ||
        !hasApprovedOperationalIdentity(doctor) ||
        !doctorMembership ||
        canonicalMembershipRole(doctorMembership.role) !== "doctor"
      ) {
        addIssue(
          "IMPORT_SHARE_DOCTOR_AUTHORITY_INVALID",
          "patient_share",
          grantId,
          "doctorUserId",
          canonicalDoctors[0],
          `Patient share ${grantId} doctor is not an approved active member of an active clinical workspace`,
        );
      }
      grant.doctorUserId = canonicalDoctors[0];
      grant.doctorId = canonicalDoctors[0];
    }
    if (organizationId) {
      const shareOrganization = requireReference(
        organizationsById,
        "patient_share",
        grantId,
        "organizationId",
        organizationId,
        "organization",
      );
      if (!doctorAliases.length && shareOrganization && !isActiveSharedOrganization(shareOrganization)) {
        addIssue(
          "IMPORT_SHARE_ACTIVE_WORKSPACE_REQUIRED",
          "patient_share",
          grantId,
          "organizationId",
          organizationId,
          `Workspace patient share ${grantId} requires an active shared workspace`,
        );
      }
      if (
        grant.authorityType === "administrative_assignment" &&
        patient &&
        canonicalId(patient.organizationId) &&
        canonicalId(patient.organizationId) !== organizationId
      ) {
        addIssue(
          "IMPORT_SHARE_WORKSPACE_TENANT_MISMATCH",
          "patient_share",
          grantId,
          "organizationId",
          organizationId,
          `Patient share ${grantId} workspace does not own patient ${patient.id}`,
        );
      }
    }
    requireReference(usersById, "patient_share", grantId, "grantedByUserId", grant.grantedByUserId, "user");
    requireReference(usersById, "patient_share", grantId, "revokedByUserId", grant.revokedByUserId, "user");
    for (const scanId of Array.isArray(grant.scanIds) ? grant.scanIds : []) {
      const scan = requireReference(scansById, "patient_share", grantId, "scanIds", scanId, "scan");
      if (scan && canonicalId(scan.patientId) !== canonicalId(grant.patientId)) {
        addIssue(
          "IMPORT_SHARE_SCAN_PATIENT_MISMATCH",
          "patient_share",
          grantId,
          "scanIds",
          scanId,
          `Patient share ${grantId} includes a scan from another patient`,
        );
      }
    }
  }

  for (const audioFile of Array.isArray(db.audioFiles) ? db.audioFiles : []) {
    const scan = requireReference(scansById, "audio_file", audioFile.id, "scanId", audioFile.scanId, "scan", true);
    requireReference(patientsById, "audio_file", audioFile.id, "patientId", audioFile.patientId, "patient", true);
    if (scan && canonicalId(scan.patientId) !== canonicalId(audioFile.patientId)) {
      addIssue(
        "IMPORT_AUDIO_PATIENT_MISMATCH",
        "audio_file",
        audioFile.id,
        "patientId",
        audioFile.patientId,
        `Audio file ${canonicalId(audioFile.id)} does not belong to its scan patient`,
      );
    }
  }

  for (const aiResult of Array.isArray(db.aiResults) ? db.aiResults : []) {
    requireReference(scansById, "ai_result", aiResult.id, "scanId", aiResult.scanId, "scan", true);
  }
  for (const notification of Array.isArray(db.notifications) ? db.notifications : []) {
    const notificationUser = requireReference(
      usersById,
      "notification",
      notification.id,
      "userId",
      notification.userId,
      "user",
    );
    const notificationOrganization = requireReference(
      organizationsById,
      "notification",
      notification.id,
      "organizationId",
      notification.organizationId,
      "organization",
    );
    const notificationUserId = canonicalId(notification.userId);
    const notificationOrganizationId = canonicalId(notification.organizationId);
    if (notificationUser && notificationOrganization) {
      const membership = membershipsByPrincipal.get(`${notificationOrganizationId}:${notificationUserId}`) || null;
      const membershipIsValid = Boolean(
        membership &&
        canonicalId(membership.status || "active").toLowerCase() === "active" &&
        ALLOWED_MEMBERSHIP_ROLES.has(canonicalMembershipRole(membership.role)) &&
        membershipRoleIsCompatible(notificationUser, membership.role),
      );
      const ownsWorkspace = Boolean(
        canonicalId(notificationOrganization.ownerUserId) === notificationUserId &&
        membershipIsValid &&
        ownerMembershipRoles.has(canonicalId(membership.role)),
      );
      const platformAdmin = ["admin", "platform_admin"].includes(
        canonicalId(notificationUser.role).toLowerCase(),
      );
      if (
        canonicalId(notificationUser.accountStatus || "active") !== "active" ||
        (!ownsWorkspace && !membershipIsValid && !platformAdmin)
      ) {
        addIssue(
          "IMPORT_NOTIFICATION_AUDIENCE_TENANT_MISMATCH",
          "notification",
          notification.id,
          "userId,organizationId",
          `${notificationUserId}:${notificationOrganizationId}`,
          `Notification ${canonicalId(notification.id)} audience is not a valid member or owner of its workspace`,
        );
      }
    }
  }

  if (issues.length > 0) {
    throw identityImportError(
      "IMPORT_REFERENCE_VALIDATION_FAILED",
      `Import source graph has ${issues.length} unresolved or unsafe reference(s)`,
      { issueCount: issues.length, issues },
    );
  }
  return db;
}

function normalizeLegacyPatientIdentityGraph(db) {
  ensureDefaultOrganization(db);
  const organizations = Array.isArray(db.organizations) ? db.organizations : [];
  const users = Array.isArray(db.users) ? db.users : [];
  const patients = Array.isArray(db.patients) ? db.patients : [];
  const organizationIds = new Set(organizations.map((organization) => String(organization.id || "")));
  const usersById = new Map(users.map((user) => [String(user.id || ""), user]));
  const patientsById = new Map(patients.map((patient) => [String(patient.id || ""), patient]));
  const linksByPatientId = new Map();

  for (const user of users) {
    const patientId = String(user.patientId || "").trim();
    if (!patientId) continue;
    const patient = patientsById.get(patientId);
    if (!patient) {
      throw identityImportError(
        "LEGACY_PATIENT_LINK_MISSING",
        `Legacy patient account ${user.id} references missing patient ${patientId}`,
        { userId: user.id, patientId },
      );
    }
    if (linksByPatientId.has(patientId)) {
      throw identityImportError(
        "LEGACY_PATIENT_LINK_AMBIGUOUS",
        `Multiple patient accounts reference ${patientId}`,
        { patientId, userIds: [linksByPatientId.get(patientId).user.id, user.id] },
      );
    }

    const userOrganizationId = String(user.organizationId || "").trim();
    const patientOrganizationId = String(patient.organizationId || "").trim();
    const tenantMatches = userOrganizationId === patientOrganizationId;
    if (!tenantMatches) {
      throw identityImportError(
        "LEGACY_PATIENT_TENANT_MISMATCH",
        `Legacy patient account ${user.id} and patient ${patientId} have different tenant identities`,
        { userId: user.id, patientId, userOrganizationId, patientOrganizationId },
      );
    }
    const organizationId = userOrganizationId;
    if (organizationId && !organizationIds.has(organizationId)) {
      throw identityImportError(
        "LEGACY_PATIENT_TENANT_MISSING",
        `Legacy patient identity references missing organization ${organizationId}`,
        { userId: user.id, patientId, organizationId },
      );
    }
    if (patient.deletedAt) {
      throw identityImportError(
        "LEGACY_PATIENT_LINK_DELETED",
        `Legacy patient account ${user.id} references deleted patient ${patientId}`,
        { userId: user.id, patientId },
      );
    }
    if (
      (patient.accountUserId && patient.accountUserId !== user.id) ||
      (patient.ownerUserId && patient.ownerUserId !== user.id)
    ) {
      throw identityImportError(
        "LEGACY_PATIENT_OWNERSHIP_CONFLICT",
        `Legacy patient ${patientId} is already linked to another account`,
        {
          userId: user.id,
          patientId,
          accountUserId: patient.accountUserId || "",
          ownerUserId: patient.ownerUserId || "",
        },
      );
    }
    linksByPatientId.set(patientId, { user, patient, organizationId });
  }

  const accountPatientByUserId = new Map();
  for (const patient of patients) {
    const patientId = String(patient.id || "");
    const legacyLink = linksByPatientId.get(patientId) || null;
    const accountUserId = String(patient.accountUserId || legacyLink?.user.id || "").trim();
    const ownerUserId = String(patient.ownerUserId || accountUserId || "").trim();
    const patientOrganizationId = String(patient.organizationId || legacyLink?.organizationId || "").trim();

    if (accountUserId) {
      const account = usersById.get(accountUserId);
      if (!account) {
        throw identityImportError(
          "PATIENT_ACCOUNT_USER_MISSING",
          `Patient ${patientId} account identity references a missing user`,
          { patientId, accountUserId },
        );
      }
      if (String(account.organizationId || "").trim() !== patientOrganizationId) {
        throw identityImportError(
          "PATIENT_ACCOUNT_TENANT_MISMATCH",
          `Patient ${patientId} account identity belongs to another tenant`,
          { patientId, accountUserId, patientOrganizationId, accountOrganizationId: account.organizationId || "" },
        );
      }
      const priorPatientId = accountPatientByUserId.get(accountUserId);
      if (priorPatientId && priorPatientId !== patientId) {
        throw identityImportError(
          "PATIENT_ACCOUNT_DUPLICATE",
          `Patient account ${accountUserId} is linked to multiple self profiles`,
          { accountUserId, patientIds: [priorPatientId, patientId] },
        );
      }
      if (account.patientId && account.patientId !== patientId) {
        throw identityImportError(
          "PATIENT_ACCOUNT_INVERSE_CONFLICT",
          `Patient account ${accountUserId} points to a different patient profile`,
          { accountUserId, patientId, inversePatientId: account.patientId },
        );
      }
      if (ownerUserId && ownerUserId !== accountUserId) {
        throw identityImportError(
          "PATIENT_SELF_OWNER_CONFLICT",
          `Self patient ${patientId} has different account and owner identities`,
          { patientId, accountUserId, ownerUserId },
        );
      }
      if (patient.deletedAt) {
        throw identityImportError(
          "PATIENT_ACCOUNT_DELETED",
          `Patient account ${accountUserId} references deleted self profile ${patientId}`,
          { patientId, accountUserId },
        );
      }
      accountPatientByUserId.set(accountUserId, patientId);
      linksByPatientId.set(patientId, {
        user: account,
        patient,
        organizationId: patientOrganizationId,
      });
    }

    if (ownerUserId) {
      const owner = usersById.get(ownerUserId);
      if (!owner) {
        throw identityImportError(
          "PATIENT_OWNER_USER_MISSING",
          `Patient ${patientId} owner identity references a missing user`,
          { patientId, ownerUserId },
        );
      }
      if (String(owner.organizationId || "").trim() !== patientOrganizationId) {
        throw identityImportError(
          "PATIENT_OWNER_TENANT_MISMATCH",
          `Patient ${patientId} owner identity belongs to another tenant`,
          { patientId, ownerUserId, patientOrganizationId, ownerOrganizationId: owner.organizationId || "" },
        );
      }
      if (!accountUserId && (!patient.profileType || patient.profileType === "patient")) {
        patient.profileType = "dependent";
        patient.relationship = patient.relationship || "dependent";
      }
    }

    if (patient.profileType === "self" && !accountUserId) {
      throw identityImportError(
        "PATIENT_SELF_ACCOUNT_REQUIRED",
        `Self patient ${patientId} is missing account_user_id`,
        { patientId },
      );
    }
  }

  for (const { user, patient, organizationId } of linksByPatientId.values()) {
    user.organizationId = organizationId;
    user.patientId = patient.id;
    patient.organizationId = organizationId;
    patient.accountUserId = user.id;
    patient.ownerUserId = user.id;
    patient.profileType = "self";
    patient.relationship = patient.relationship || "self";
  }
  return db;
}

async function runMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = path.join(__dirname, "..", "db", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const existing = await client.query("SELECT 1 FROM schema_migrations WHERE id = $1", [id]);
    if (existing.rowCount > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
}

function sqlServicePackage(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    segment: row.segment,
    price: Number(row.price || 0),
    currency: row.currency,
    duration: row.duration,
    maxDevices: Number(row.max_devices || 0),
    maxDoctors: Number(row.max_doctors || 0),
    maxPatients: Number(row.max_patients || 0),
    storageGb: Number(row.storage_gb || 0),
    aiMonthly: Number(row.ai_monthly || 0),
    retentionDays: Number(row.retention_days || 0),
    features: row.features || {},
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function upsertServicePackage(client, sourcePackage) {
  const normalized = normalizeStoredServicePackage(sourcePackage);
  const existingResult = await client.query(
    "SELECT * FROM service_packages WHERE id = $1 LIMIT 1 FOR UPDATE",
    [normalized.id],
  );
  const existing = existingResult.rows[0] ? sqlServicePackage(existingResult.rows[0]) : null;
  const nameCollision = await client.query(
    `
      SELECT id
      FROM service_packages
      WHERE id <> $1 AND lower(btrim(name)) = lower(btrim($2))
      ORDER BY id
      LIMIT 1
      FOR UPDATE
    `,
    [normalized.id, normalized.name],
  );
  if (nameCollision.rows[0]) {
    throw identityImportError(
      "IMPORT_PACKAGE_NAME_CONFLICT",
      `Service package ${normalized.id} conflicts with canonical package name ${normalized.name}`,
      { packageId: normalized.id, conflictingPackageId: nameCollision.rows[0].id },
    );
  }

  if (!existing) {
    const inserted = await client.query(
      `
        INSERT INTO service_packages (
          id, name, type, segment, price, currency, duration,
          max_devices, max_doctors, max_patients, storage_gb, ai_monthly,
          retention_days, features, status, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14::jsonb, $15,
          COALESCE($16::timestamptz, now()), COALESCE($17::timestamptz, now())
        )
        RETURNING id
      `,
      [
        normalized.id,
        normalized.name,
        normalized.type,
        normalized.segment,
        normalized.price,
        normalized.currency,
        normalized.duration,
        normalized.maxDevices,
        normalized.maxDoctors,
        normalized.maxPatients,
        normalized.storageGb,
        normalized.aiMonthly,
        normalized.retentionDays,
        JSON.stringify(normalized.features || {}),
        normalized.status,
        toIso(normalized.createdAt),
        toIso(normalized.updatedAt),
      ],
    );
    return { state: "inserted", ...inserted };
  }

  // A stale JSON snapshot must never reactivate a package archived in the
  // canonical catalog. Import may narrow active -> archived, but not widen it.
  const desired = {
    ...normalized,
    status: existing.status === "archived" ? "archived" : normalized.status,
    createdAt: existing.createdAt || normalized.createdAt,
  };
  const comparableFields = [
    "name",
    "type",
    "segment",
    "price",
    "currency",
    "duration",
    "maxDevices",
    "maxDoctors",
    "maxPatients",
    "storageGb",
    "aiMonthly",
    "retentionDays",
    "status",
  ];
  const changed = comparableFields.some((field) => existing[field] !== desired[field]) ||
    !jsonEquals(existing.features, desired.features);
  if (!changed) return { state: "preserved", rowCount: 0, rows: [existingResult.rows[0]] };

  const updated = await client.query(
    `
      UPDATE service_packages
      SET name = $2,
          type = $3,
          segment = $4,
          price = $5,
          currency = $6,
          duration = $7,
          max_devices = $8,
          max_doctors = $9,
          max_patients = $10,
          storage_gb = $11,
          ai_monthly = $12,
          retention_days = $13,
          features = $14::jsonb,
          status = $15,
          updated_at = COALESCE($16::timestamptz, now())
      WHERE id = $1
      RETURNING id
    `,
    [
      desired.id,
      desired.name,
      desired.type,
      desired.segment,
      desired.price,
      desired.currency,
      desired.duration,
      desired.maxDevices,
      desired.maxDoctors,
      desired.maxPatients,
      desired.storageGb,
      desired.aiMonthly,
      desired.retentionDays,
      JSON.stringify(desired.features || {}),
      desired.status,
      toIso(desired.updatedAt),
    ],
  );
  return { state: "updated", ...updated };
}

async function upsertOrganization(client, organization) {
  const desiredStatus = canonicalId(organization.status || "active").toLowerCase();
  const desiredWorkspaceType = canonicalId(organization.workspaceType || organization.type || "clinic").toLowerCase();
  const desiredVersion = Number.isInteger(Number(organization.version)) && Number(organization.version) > 0
    ? Number(organization.version)
    : 1;
  const desiredDeletedAt = toIso(organization.deletedAt);
  if (!ALLOWED_WORKSPACE_STATUSES.has(desiredStatus) || !ALLOWED_WORKSPACE_TYPES.has(desiredWorkspaceType)) {
    throw identityImportError(
      "IMPORT_WORKSPACE_STATE_INVALID",
      `Organization ${organization.id} has invalid status or workspace type`,
      { organizationId: organization.id, status: desiredStatus, workspaceType: desiredWorkspaceType },
    );
  }
  const readExisting = () => client.query(
    `
      SELECT id, type, workspace_type, status, package_id, version, deleted_at
      FROM organizations
      WHERE id = $1
      FOR UPDATE
    `,
    [organization.id],
  );
  const reconcileExisting = async (existing) => {
    const existingStatus = canonicalId(existing.status || "active").toLowerCase();
    const existingWorkspaceType = canonicalId(existing.workspace_type || existing.type || "clinic").toLowerCase();
    const existingPackageId = canonicalId(existing.package_id);
    const desiredPackageId = canonicalId(organization.packageId);
    const mismatchFields = [];
    if (existingStatus !== desiredStatus) mismatchFields.push("status");
    if (existingWorkspaceType !== desiredWorkspaceType) mismatchFields.push("workspaceType");
    if (existingPackageId && desiredPackageId && existingPackageId !== desiredPackageId) mismatchFields.push("packageId");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_WORKSPACE_CANONICAL_CONFLICT",
        `Organization ${organization.id} conflicts with canonical workspace state`,
        { organizationId: organization.id, mismatchFields },
      );
    }
    if ((!existingPackageId && desiredPackageId) || (desiredDeletedAt && !existing.deleted_at) || Number(existing.version || 1) < desiredVersion) {
      const updated = await client.query(
        `
          UPDATE organizations
          SET package_id = COALESCE(package_id, NULLIF($2, '')),
              version = GREATEST(version, $3),
              deleted_at = COALESCE(deleted_at, $4::timestamptz),
              updated_at = now()
          WHERE id = $1
          RETURNING id, package_id, version, deleted_at
        `,
        [organization.id, desiredPackageId, desiredVersion, desiredDeletedAt || null],
      );
      return { state: "updated", ...updated };
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };

  const existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO organizations (
        id, name, type, workspace_type, status, package_id, version, deleted_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::timestamptz,
        COALESCE($9::timestamptz, now()), COALESCE($10::timestamptz, now())
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      organization.id,
      organization.name || organization.id,
      organization.type || "clinic",
      desiredWorkspaceType,
      desiredStatus,
      valueOrNull(organization.packageId),
      desiredVersion,
      desiredDeletedAt || null,
      toIso(organization.createdAt),
      toIso(organization.updatedAt),
    ]
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  const raced = await readExisting();
  if (!raced.rows[0]) {
    throw identityImportError(
      "IMPORT_WORKSPACE_RECONCILIATION_FAILED",
      `Organization ${organization.id} could not be reconciled after an insert collision`,
      { organizationId: organization.id },
    );
  }
  return reconcileExisting(raced.rows[0]);
}

async function applyOrganizationOwner(client, organization) {
  const ownerUserId = canonicalId(organization.ownerUserId);
  if (!ownerUserId) return { state: "preserved", rowCount: 0, rows: [] };
  const workspace = await client.query(
    `
      SELECT organization.id, organization.owner_user_id, organization.status,
        EXISTS (
          SELECT 1
          FROM users owner_account
          JOIN memberships owner_membership
            ON owner_membership.organization_id = organization.id
           AND owner_membership.user_id = owner_account.id
          WHERE owner_account.id = $2
            AND owner_account.organization_id = organization.id
            AND owner_account.role IN ('admin', 'platform_admin', 'workspace_owner')
            AND owner_account.account_status = 'active'
            AND owner_membership.role IN ('owner', 'workspace_owner')
            AND COALESCE(owner_membership.status, 'active') = 'active'
        ) AS owner_valid
      FROM organizations organization
      WHERE organization.id = $1
      FOR UPDATE
    `,
    [organization.id, ownerUserId],
  );
  const current = workspace.rows[0];
  if (!current) {
    throw identityImportError(
      "IMPORT_WORKSPACE_MISSING",
      `Organization ${organization.id} is missing during owner reconciliation`,
      { organizationId: organization.id, ownerUserId },
    );
  }
  if (canonicalId(current.status || "active").toLowerCase() !== "active") {
    throw identityImportError(
      "IMPORT_WORKSPACE_OWNER_STATUS_INVALID",
      `Organization ${organization.id} must be active before importing its owner`,
      { organizationId: organization.id, ownerUserId, status: current.status || "active" },
    );
  }
  if (!current.owner_valid) {
    throw identityImportError(
      "IMPORT_WORKSPACE_OWNER_CANONICAL_INVALID",
      `Organization ${organization.id} owner does not have canonical active account and membership state`,
      { organizationId: organization.id, ownerUserId },
    );
  }
  const currentOwnerUserId = canonicalId(current.owner_user_id);
  if (currentOwnerUserId && currentOwnerUserId !== ownerUserId) {
    throw identityImportError(
      "IMPORT_WORKSPACE_OWNER_CANONICAL_CONFLICT",
      `Organization ${organization.id} already has a different canonical owner`,
      { organizationId: organization.id, ownerUserId },
    );
  }
  if (currentOwnerUserId === ownerUserId) {
    return { state: "preserved", rowCount: 0, rows: [current] };
  }
  const result = await client.query(
    `
      UPDATE organizations
      SET owner_user_id = $2, updated_at = now()
      WHERE id = $1 AND owner_user_id IS NULL AND status = 'active'
      RETURNING id, owner_user_id
    `,
    [organization.id, ownerUserId],
  );
  if (result.rowCount === 0) {
    throw identityImportError(
      "IMPORT_WORKSPACE_OWNER_RECONCILIATION_FAILED",
      `Organization ${organization.id} owner changed during reconciliation`,
      { organizationId: organization.id, ownerUserId },
    );
  }
  return { state: "updated", ...result };
}

async function upsertUser(client, user) {
  const desiredIdentity = {
    firebaseUid: canonicalId(user.firebaseUid),
    email: canonicalId(user.email).toLowerCase(),
    phone: canonicalId(user.phone),
    role: canonicalId(user.role || "patient").toLowerCase(),
    organizationId: canonicalId(user.organizationId),
    patientId: canonicalId(user.patientId),
    accountStatus: canonicalId(user.accountStatus || "active").toLowerCase(),
    requestedRole: canonicalId(user.requestedRole).toLowerCase(),
    roleRequestStatus: canonicalId(user.roleRequestStatus).toLowerCase(),
    verifiedEmail: Boolean(user.verifiedEmail),
    verifiedPhone: Boolean(user.verifiedPhone),
    firebaseClaims: user.firebaseClaims || {},
  };
  const readExisting = () => client.query(
    `
      SELECT id, firebase_uid, email, phone, role, organization_id, patient_id,
        account_status, requested_role, role_request_status, verified_email,
        verified_phone, firebase_claims
      FROM users
      WHERE id = $1
      FOR UPDATE
    `,
    [user.id],
  );
  const reconcileExisting = (existing) => {
    const mismatchFields = [];
    if (canonicalId(existing.firebase_uid) !== desiredIdentity.firebaseUid) mismatchFields.push("firebaseUid");
    if (canonicalId(existing.email).toLowerCase() !== desiredIdentity.email) mismatchFields.push("email");
    if (canonicalId(existing.phone) !== desiredIdentity.phone) mismatchFields.push("phone");
    if (canonicalId(existing.role).toLowerCase() !== desiredIdentity.role) mismatchFields.push("role");
    if (canonicalId(existing.organization_id) !== desiredIdentity.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(existing.patient_id) !== desiredIdentity.patientId) mismatchFields.push("patientId");
    if (canonicalId(existing.account_status || "active").toLowerCase() !== desiredIdentity.accountStatus) mismatchFields.push("accountStatus");
    if (canonicalId(existing.requested_role).toLowerCase() !== desiredIdentity.requestedRole) mismatchFields.push("requestedRole");
    if (canonicalId(existing.role_request_status).toLowerCase() !== desiredIdentity.roleRequestStatus) mismatchFields.push("roleRequestStatus");
    if (Boolean(existing.verified_email) !== desiredIdentity.verifiedEmail) mismatchFields.push("verifiedEmail");
    if (Boolean(existing.verified_phone) !== desiredIdentity.verifiedPhone) mismatchFields.push("verifiedPhone");
    if (!jsonEquals(existing.firebase_claims, desiredIdentity.firebaseClaims)) mismatchFields.push("firebaseClaims");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_USER_CANONICAL_CONFLICT",
        `User ${user.id} conflicts with canonical identity state`,
        { userId: user.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };

  const existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO users (
        id, firebase_uid, email, phone, role, name, password_hash, license, hospital, department,
        address, organization_id, patient_id, verified_email, verified_phone, account_status,
        requested_role, role_request_status, role_requested_at, role_approved_at, role_rejected_at,
        role_reject_reason, role_info_request_at, role_info_request_message, firebase_claims,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23, $24, $25::jsonb,
        COALESCE($26::timestamptz, now()), COALESCE($27::timestamptz, now())
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      user.id,
      valueOrNull(desiredIdentity.firebaseUid),
      valueOrNull(desiredIdentity.email),
      valueOrNull(desiredIdentity.phone),
      desiredIdentity.role,
      user.name || user.email || user.id,
      valueOrNull(
        normalizePasswordHash(user.passwordHash || user.password || ""),
      ),
      valueOrNull(user.license),
      valueOrNull(user.hospital),
      valueOrNull(user.department),
      valueOrNull(user.address),
      valueOrNull(desiredIdentity.organizationId),
      valueOrNull(desiredIdentity.patientId),
      desiredIdentity.verifiedEmail,
      desiredIdentity.verifiedPhone,
      desiredIdentity.accountStatus,
      valueOrNull(desiredIdentity.requestedRole),
      valueOrNull(desiredIdentity.roleRequestStatus),
      toIso(user.roleRequestedAt),
      toIso(user.roleApprovedAt),
      toIso(user.roleRejectedAt),
      valueOrNull(user.roleRejectReason),
      toIso(user.roleInfoRequestAt),
      valueOrNull(user.roleInfoRequestMessage),
      JSON.stringify(desiredIdentity.firebaseClaims),
      toIso(user.createdAt),
      toIso(user.updatedAt),
    ]
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  const raced = await readExisting();
  if (!raced.rows[0]) {
    throw identityImportError(
      "IMPORT_USER_RECONCILIATION_FAILED",
      `User ${user.id} could not be reconciled after an insert collision`,
      { userId: user.id },
    );
  }
  return reconcileExisting(raced.rows[0]);
}

async function upsertMembership(client, membership) {
  const role = canonicalMembershipRole(membership.role || "patient");
  const desiredStatus = canonicalId(membership.status || "active").toLowerCase();
  if (!ALLOWED_MEMBERSHIP_STATUSES.has(desiredStatus)) {
    throw identityImportError(
      "IMPORT_MEMBERSHIP_STATUS_INVALID",
      `Membership ${membership.id} has unsupported status ${desiredStatus}`,
      { membershipId: membership.id, status: desiredStatus },
    );
  }
  const desiredSuspendedAt = desiredStatus === "suspended"
    ? toIso(membership.suspendedAt || membership.updatedAt || membership.createdAt)
    : null;
  const desiredUpdatedAt = toIso(membership.updatedAt || membership.suspendedAt || membership.createdAt);
  const targetUserResult = await client.query(
    `
      SELECT id, role, account_status, role_request_status
      FROM users
      WHERE id = $1
      FOR SHARE
    `,
    [membership.userId],
  );
  const targetUser = targetUserResult.rows[0];
  if (!targetUser) {
    throw identityImportError(
      "IMPORT_MEMBERSHIP_USER_MISSING",
      `Membership ${membership.id} target user is missing`,
      { membershipId: membership.id, userId: membership.userId },
    );
  }
  if (!membershipRoleIsCompatible({ role: targetUser.role }, role)) {
    throw identityImportError(
      "IMPORT_MEMBERSHIP_CANONICAL_ROLE_CONFLICT",
      `Membership ${membership.id} cannot grant ${role} to canonical account role ${targetUser.role}`,
      { membershipId: membership.id, userId: membership.userId, role },
    );
  }
  if (isOperationalMembershipRole(role) && canonicalId(targetUser.account_status || "active") !== "active") {
    throw identityImportError(
      "IMPORT_MEMBERSHIP_CANONICAL_ACCOUNT_INACTIVE",
      `Membership ${membership.id} cannot grant an operational role to an inactive account`,
      { membershipId: membership.id, userId: membership.userId, role },
    );
  }
  if (isOperationalMembershipRole(role) && !hasApprovedOperationalIdentity(targetUser)) {
    throw identityImportError(
      "IMPORT_MEMBERSHIP_CANONICAL_APPROVAL_REQUIRED",
      `Membership ${membership.id} cannot grant an operational role before identity approval`,
      { membershipId: membership.id, userId: membership.userId, role },
    );
  }
  if (isOperationalMembershipRole(role)) {
    const organizationResult = await client.query(
      `
        SELECT id, status, workspace_type, type
        FROM organizations
        WHERE id = $1
        FOR SHARE
      `,
      [membership.organizationId],
    );
    if (!isActiveSharedOrganization(organizationResult.rows[0])) {
      throw identityImportError(
        "IMPORT_MEMBERSHIP_CANONICAL_WORKSPACE_INVALID",
        `Membership ${membership.id} requires an active shared workspace`,
        { membershipId: membership.id, organizationId: membership.organizationId, role },
      );
    }
  }
  const readExisting = () => client.query(
    `
      SELECT id, organization_id, user_id, role, status, suspended_at, updated_at
      FROM memberships
      WHERE organization_id = $1 AND user_id = $2
      FOR UPDATE
    `,
    [membership.organizationId, membership.userId],
  );
  const reconcileExisting = async (existing) => {
    if (canonicalMembershipRole(existing.role) !== role) {
      throw identityImportError(
        "IMPORT_MEMBERSHIP_CANONICAL_CONFLICT",
        `Membership ${membership.id} conflicts with canonical membership role`,
        { membershipId: membership.id, existingMembershipId: existing.id, role },
      );
    }
    const existingStatus = canonicalId(existing.status || "active").toLowerCase();
    if (!ALLOWED_MEMBERSHIP_STATUSES.has(existingStatus)) {
      throw identityImportError(
        "IMPORT_MEMBERSHIP_CANONICAL_STATUS_INVALID",
        `Membership ${membership.id} has unsupported canonical status ${existingStatus}`,
        { membershipId: membership.id, existingMembershipId: existing.id, status: existingStatus },
      );
    }
    if (existingStatus === "active" && desiredStatus === "suspended") {
      const updated = await client.query(
        `
          UPDATE memberships
          SET
            status = 'suspended',
            suspended_at = COALESCE($2::timestamptz, suspended_at, now()),
            updated_at = COALESCE($3::timestamptz, now())
          WHERE id = $1
            AND COALESCE(status, 'active') = 'active'
          RETURNING id, organization_id, user_id, role, status, suspended_at, updated_at
        `,
        [existing.id, desiredSuspendedAt, desiredUpdatedAt],
      );
      if (updated.rows[0]) return { state: "updated", ...updated };
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };
  const existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO memberships (
        id, organization_id, user_id, role, status, suspended_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        CASE
          WHEN $5 = 'suspended' THEN COALESCE($6::timestamptz, $8::timestamptz, $7::timestamptz, now())
          ELSE NULL
        END,
        COALESCE($7::timestamptz, now()),
        COALESCE($8::timestamptz, $7::timestamptz, now())
      )
      ON CONFLICT (organization_id, user_id) DO NOTHING
      RETURNING id, organization_id, user_id, role, status, suspended_at, updated_at
    `,
    [
      membership.id,
      membership.organizationId,
      membership.userId,
      role,
      desiredStatus,
      desiredSuspendedAt,
      toIso(membership.createdAt),
      desiredUpdatedAt,
    ]
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  const raced = await readExisting();
  if (!raced.rows[0]) {
    throw identityImportError(
      "IMPORT_MEMBERSHIP_RECONCILIATION_FAILED",
      `Membership ${membership.id} could not be reconciled after an insert collision`,
      { membershipId: membership.id, userId: membership.userId },
    );
  }
  return reconcileExisting(raced.rows[0]);
}

async function upsertNotification(client, notification) {
  const desiredIdentity = {
    userId: canonicalId(notification.userId),
    organizationId: canonicalId(notification.organizationId),
  };
  if (desiredIdentity.userId && desiredIdentity.organizationId) {
    const audience = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM users audience_user
          JOIN organizations audience_organization ON audience_organization.id = $2
          LEFT JOIN memberships audience_membership
            ON audience_membership.organization_id = audience_organization.id
           AND audience_membership.user_id = audience_user.id
          WHERE audience_user.id = $1
            AND audience_user.account_status = 'active'
            AND (
              audience_user.role IN ('admin', 'platform_admin')
              OR
              (
                COALESCE(audience_membership.status, 'active') = 'active'
                AND (
                  (
                    audience_organization.owner_user_id = audience_user.id
                    AND audience_membership.role IN ('owner', 'workspace_owner')
                  )
                  OR audience_membership.role IN (
                    'owner', 'workspace_owner', 'admin', 'workspace_admin', 'doctor',
                    'patient', 'nurse', 'technician', 'billing', 'viewer'
                  )
                )
              )
            )
        ) AS audience_valid
      `,
      [desiredIdentity.userId, desiredIdentity.organizationId],
    );
    if (audience.rows[0]?.audience_valid !== true) {
      throw identityImportError(
        "IMPORT_NOTIFICATION_CANONICAL_AUDIENCE_INVALID",
        `Notification ${notification.id} audience is not a member or owner of its workspace`,
        { notificationId: notification.id, userId: desiredIdentity.userId, organizationId: desiredIdentity.organizationId },
      );
    }
  }
  const readExisting = () => client.query(
    `
      SELECT id, user_id, organization_id
      FROM notifications
      WHERE id = $1
      FOR UPDATE
    `,
    [notification.id],
  );
  const reconcileExisting = (existing) => {
    const mismatchFields = [];
    if (canonicalId(existing.user_id) !== desiredIdentity.userId) mismatchFields.push("userId");
    if (canonicalId(existing.organization_id) !== desiredIdentity.organizationId) mismatchFields.push("organizationId");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_NOTIFICATION_CANONICAL_CONFLICT",
        `Notification ${notification.id} conflicts with canonical audience`,
        { notificationId: notification.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };
  let existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO notifications (
        id, user_id, organization_id, type, title, message, channel, delivery_status,
        sent_at, failed_at, retry_count, error_message,
        push_status, push_sent_at, push_failed_at, push_error_message, push_attempts, metadata, read_at,
        campaign_id, audience_type, audience_role, requested_channels, in_app_status, email_status,
        email_error_message, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9::timestamptz, $10::timestamptz, $11, $12,
        $13, $14::timestamptz, $15::timestamptz, $16, $17::jsonb, $18::jsonb, $19::timestamptz,
        $20, $21, $22, $23::jsonb, $24, $25, $26,
        COALESCE($27::timestamptz, now()), COALESCE($28::timestamptz, now())
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      notification.id,
      valueOrNull(desiredIdentity.userId),
      valueOrNull(desiredIdentity.organizationId),
      notification.type || "info",
      notification.title || "",
      notification.message || "",
      notification.channel || "in_app",
      notification.deliveryStatus || "ready",
      valueOrNull(toIso(notification.sentAt)),
      valueOrNull(toIso(notification.failedAt)),
      Number(notification.retryCount || 0),
      valueOrNull(notification.errorMessage),
      notification.pushStatus || "ready",
      valueOrNull(toIso(notification.pushSentAt)),
      valueOrNull(toIso(notification.pushFailedAt)),
      valueOrNull(notification.pushErrorMessage),
      JSON.stringify(Array.isArray(notification.pushAttempts) ? notification.pushAttempts : []),
      JSON.stringify(notification.metadata && typeof notification.metadata === "object" ? notification.metadata : {}),
      notification.read || notification.readAt ? toIso(notification.readAt) || toIso(notification.updatedAt) || new Date().toISOString() : null,
      valueOrNull(notification.campaignId),
      notification.audienceType || "legacy",
      valueOrNull(notification.audienceRole),
      JSON.stringify(
        Array.isArray(notification.requestedChannels) && notification.requestedChannels.length > 0
          ? notification.requestedChannels
          : [notification.channel || "in_app"],
      ),
      notification.inAppStatus || "ready",
      notification.emailStatus || "skipped",
      valueOrNull(notification.emailErrorMessage),
      toIso(notification.createdAt),
      toIso(notification.updatedAt),
    ]
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows[0]) {
    throw identityImportError(
      "IMPORT_NOTIFICATION_RECONCILIATION_FAILED",
      `Notification ${notification.id} could not be reconciled after an insert collision`,
      { notificationId: notification.id },
    );
  }
  return reconcileExisting(existing.rows[0]);
}

async function upsertPatient(client, patient) {
  const params = [
    patient.id,
    valueOrNull(patient.organizationId),
    valueOrNull(patient.ownerUserId),
    valueOrNull(patient.accountUserId),
    valueOrNull(patient.guardianUserId),
    patient.patientCode || patient.id,
    patient.name || patient.patientCode || patient.id,
    patient.age === undefined || patient.age === "" ? null : patient.age,
    valueOrNull(patient.dateOfBirth || patient.dob),
    valueOrNull(patient.gender),
    valueOrNull(patient.bloodType),
    valueOrNull(patient.phone),
    valueOrNull(patient.email),
    valueOrNull(patient.address),
    Object.prototype.hasOwnProperty.call(patient, "allergies")
      ? JSON.stringify(Array.isArray(patient.allergies) ? patient.allergies : [])
      : null,
    Object.prototype.hasOwnProperty.call(patient, "emergencyContact")
      ? JSON.stringify(patient.emergencyContact && typeof patient.emergencyContact === "object" ? patient.emergencyContact : {})
      : null,
    Object.prototype.hasOwnProperty.call(patient, "profileType")
      ? (["self", "dependent", "patient"].includes(patient.profileType) ? patient.profileType : "patient")
      : null,
    valueOrNull(patient.relationship),
    valueOrNull(patient.familyGroupId),
    valueOrNull(patient.primaryDoctorId),
    valueOrNull(patient.doctorName),
    valueOrNull(patient.notes),
    toIso(patient.deletedAt),
    toIso(patient.createdAt),
    toIso(patient.updatedAt),
    Object.prototype.hasOwnProperty.call(patient, "allergies"),
    Object.prototype.hasOwnProperty.call(patient, "emergencyContact"),
    Object.prototype.hasOwnProperty.call(patient, "profileType"),
    Object.prototype.hasOwnProperty.call(patient, "patientCode"),
    Object.prototype.hasOwnProperty.call(patient, "name"),
    Object.prototype.hasOwnProperty.call(patient, "updatedAt"),
  ];
  if (patient.updatedAt && !params[24]) {
    throw identityImportError(
      "PATIENT_IMPORT_UPDATED_AT_INVALID",
      `Patient ${patient.id} has an invalid updatedAt timestamp`,
      { patientId: patient.id },
    );
  }
  const readExisting = () => client.query(
    `
      SELECT id, organization_id, owner_user_id, account_user_id, updated_at
      FROM patients
      WHERE id = $1
      FOR UPDATE
    `,
    [patient.id],
  );
  const assertCanonicalIdentity = (existing) => {
    const mismatchFields = [];
    if (params[1] && existing.organization_id && canonicalId(existing.organization_id) !== canonicalId(params[1])) {
      mismatchFields.push("organizationId");
    }
    if (params[2] && existing.owner_user_id && canonicalId(existing.owner_user_id) !== canonicalId(params[2])) {
      mismatchFields.push("ownerUserId");
    }
    if (params[3] && existing.account_user_id && canonicalId(existing.account_user_id) !== canonicalId(params[3])) {
      mismatchFields.push("accountUserId");
    }
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "PATIENT_IMPORT_CANONICAL_CONFLICT",
        `Patient ${patient.id} conflicts with the canonical tenant or account ownership graph`,
        { patientId: patient.id, mismatchFields },
      );
    }
  };
  const reconcileExisting = async (existing) => {
    assertCanonicalIdentity(existing);
    const sourceUpdatedAt = params[24];
    const targetUpdatedAt = toIso(existing.updated_at);
    if (
      !sourceUpdatedAt ||
      (targetUpdatedAt && new Date(sourceUpdatedAt).getTime() <= new Date(targetUpdatedAt).getTime())
    ) {
      return { state: "preserved", rowCount: 0, rows: [existing] };
    }
    const updated = await client.query(
      `
        UPDATE patients
        SET organization_id = COALESCE(organization_id, $2),
            owner_user_id = COALESCE(owner_user_id, $3),
            account_user_id = COALESCE(account_user_id, $4),
            guardian_user_id = COALESCE($5, guardian_user_id),
            patient_code = CASE WHEN $29::boolean THEN $6 ELSE patient_code END,
            name = CASE WHEN $30::boolean THEN $7 ELSE name END,
            age = COALESCE($8, age),
            date_of_birth = COALESCE($9::date, date_of_birth),
            gender = COALESCE($10, gender),
            blood_type = COALESCE($11, blood_type),
            phone = COALESCE($12, phone),
            email = COALESCE($13, email),
            address = COALESCE($14, address),
            allergies = CASE WHEN $26::boolean THEN $15::jsonb ELSE allergies END,
            emergency_contact = CASE WHEN $27::boolean THEN $16::jsonb ELSE emergency_contact END,
            profile_type = CASE WHEN $28::boolean THEN COALESCE($17, 'patient') ELSE profile_type END,
            relationship = COALESCE($18, relationship),
            family_group_id = COALESCE($19, family_group_id),
            primary_doctor_id = COALESCE($20, primary_doctor_id),
            doctor_name = COALESCE($21, doctor_name),
            notes = COALESCE($22, notes),
            deleted_at = COALESCE(deleted_at, $23::timestamptz),
            updated_at = $25::timestamptz
        WHERE id = $1
          AND COALESCE(updated_at, '-infinity'::timestamptz) < $25::timestamptz
          AND $31::boolean
          AND (organization_id IS NULL OR $2 IS NULL OR organization_id IS NOT DISTINCT FROM $2)
          AND (owner_user_id IS NULL OR $3 IS NULL OR owner_user_id = $3)
          AND (account_user_id IS NULL OR $4 IS NULL OR account_user_id = $4)
        RETURNING id, updated_at
      `,
      params,
    );
    if (updated.rowCount > 0) return { state: "updated", ...updated };
    const raced = await readExisting();
    if (raced.rows[0]) {
      assertCanonicalIdentity(raced.rows[0]);
      const racedUpdatedAt = toIso(raced.rows[0].updated_at);
      if (racedUpdatedAt && new Date(racedUpdatedAt).getTime() >= new Date(sourceUpdatedAt).getTime()) {
        return { state: "preserved", rowCount: 0, rows: raced.rows };
      }
    }
    throw identityImportError(
      "PATIENT_IMPORT_RECONCILIATION_FAILED",
      `Patient ${patient.id} changed during freshness reconciliation`,
      { patientId: patient.id, sourceUpdatedAt },
    );
  };

  let existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO patients (
        id, organization_id, owner_user_id, account_user_id, guardian_user_id,
        patient_code, name, age, date_of_birth, gender, blood_type, phone, email, address,
        allergies, emergency_contact, profile_type, relationship, family_group_id,
        primary_doctor_id, doctor_name, notes, deleted_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9::date, $10, $11, $12, $13, $14,
        COALESCE($15::jsonb, '[]'::jsonb), COALESCE($16::jsonb, '{}'::jsonb), COALESCE($17, 'patient'), $18, $19,
        $20, $21, $22, $23::timestamptz,
        COALESCE($24::timestamptz, now()), COALESCE($25::timestamptz, now())
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id, updated_at
    `,
    params.slice(0, 25),
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows[0]) {
    throw identityImportError(
      "PATIENT_IMPORT_RECONCILIATION_FAILED",
      `Patient ${patient.id} could not be reconciled after an insert collision`,
      { patientId: patient.id },
    );
  }
  return reconcileExisting(existing.rows[0]);
}

async function upsertDoctorPatientAccess(client, grant) {
  const scanIds = Array.isArray(grant.scanIds) ? grant.scanIds : [];
  const desired = {
    doctorUserId: canonicalId(grant.doctorUserId || grant.doctorId),
    patientId: canonicalId(grant.patientId),
    organizationId: canonicalId(grant.organizationId),
    accessLevel: canonicalId(grant.accessLevel || "read"),
    authorityType: canonicalId(grant.authorityType || "administrative_assignment"),
    purpose: String(grant.purpose || "").slice(0, 2000),
    consentedAt: toIso(grant.consentedAt) || "",
    scope: canonicalId(grant.scope || (scanIds.length ? "selected_scans" : "patient_profile")),
    scanIds: [...new Set(scanIds.map(canonicalId).filter(Boolean))].sort(),
    expiresAt: toIso(grant.expiresAt) || "",
    revokedAt: toIso(grant.revokedAt) || "",
    revokedByUserId: canonicalId(grant.revokedByUserId),
  };
  if (desired.doctorUserId) {
    const authority = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM users doctor_account
          JOIN memberships doctor_membership
            ON doctor_membership.user_id = doctor_account.id
           AND doctor_membership.role = 'doctor'
           AND COALESCE(doctor_membership.status, 'active') = 'active'
          JOIN organizations doctor_organization
            ON doctor_organization.id = doctor_membership.organization_id
          WHERE doctor_account.id = $1
            AND doctor_account.role = 'doctor'
            AND doctor_account.account_status = 'active'
            AND doctor_account.role_request_status = 'approved'
            AND doctor_organization.status = 'active'
            AND COALESCE(doctor_organization.workspace_type, doctor_organization.type, 'clinic') <> 'personal'
        ) AS authority_valid
      `,
      [desired.doctorUserId],
    );
    if (authority.rows[0]?.authority_valid !== true) {
      throw identityImportError(
        "IMPORT_SHARE_CANONICAL_DOCTOR_AUTHORITY_INVALID",
        `Patient share ${grant.id} doctor lacks approved active workspace authority`,
        { shareId: grant.id, doctorUserId: desired.doctorUserId },
      );
    }
  } else {
    const workspaceAuthority = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM organizations share_organization
          WHERE share_organization.id = $1
            AND share_organization.status = 'active'
            AND COALESCE(share_organization.workspace_type, share_organization.type, 'clinic') <> 'personal'
        ) AS authority_valid
      `,
      [desired.organizationId],
    );
    if (workspaceAuthority.rows[0]?.authority_valid !== true) {
      throw identityImportError(
        "IMPORT_SHARE_CANONICAL_WORKSPACE_AUTHORITY_INVALID",
        `Patient share ${grant.id} workspace principal is not active`,
        { shareId: grant.id, organizationId: desired.organizationId },
      );
    }
  }
  const readById = () => client.query(
    `
      SELECT id, doctor_user_id, doctor_id, patient_id, organization_id, access_level,
        authority_type, purpose, consented_at, scope, scan_ids, expires_at, revoked_at, revoked_by_user_id
      FROM doctor_patient_access
      WHERE id = $1
      FOR UPDATE
    `,
    [grant.id],
  );
  const readByPrincipal = () => client.query(
    `
      SELECT id, doctor_user_id, doctor_id, patient_id, organization_id, access_level,
        authority_type, purpose, consented_at, scope, scan_ids, expires_at, revoked_at, revoked_by_user_id
      FROM doctor_patient_access
      WHERE patient_id = $1
        AND doctor_user_id IS NOT DISTINCT FROM $2
        AND organization_id IS NOT DISTINCT FROM $3
        AND authority_type = $4
      FOR UPDATE
    `,
    [
      desired.patientId,
      valueOrNull(desired.doctorUserId),
      valueOrNull(desired.organizationId),
      desired.authorityType,
    ],
  );
  const reconcileExisting = async (existing) => {
    const mismatchFields = [];
    if (canonicalId(existing.patient_id) !== desired.patientId) mismatchFields.push("patientId");
    if (canonicalId(existing.doctor_user_id || existing.doctor_id) !== desired.doctorUserId) mismatchFields.push("doctorUserId");
    if (canonicalId(existing.organization_id) !== desired.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(existing.access_level || "read") !== desired.accessLevel) mismatchFields.push("accessLevel");
    if (canonicalId(existing.authority_type || "administrative_assignment") !== desired.authorityType) {
      mismatchFields.push("authorityType");
    }
    if (String(existing.purpose || "") !== desired.purpose) mismatchFields.push("purpose");
    if ((toIso(existing.consented_at) || "") !== desired.consentedAt) mismatchFields.push("consentedAt");
    if (canonicalId(existing.scope || "patient_profile") !== desired.scope) mismatchFields.push("scope");
    const existingScanIds = [...new Set((Array.isArray(existing.scan_ids) ? existing.scan_ids : []).map(canonicalId).filter(Boolean))].sort();
    if (!jsonEquals(existingScanIds, desired.scanIds)) mismatchFields.push("scanIds");
    if ((toIso(existing.expires_at) || "") !== desired.expiresAt) mismatchFields.push("expiresAt");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_SHARE_CANONICAL_CONFLICT",
        `Patient share ${grant.id} conflicts with canonical principal or scope`,
        { shareId: grant.id, existingShareId: existing.id, mismatchFields },
      );
    }
    if (desired.revokedAt && !existing.revoked_at) {
      const revoked = await client.query(
        `
          UPDATE doctor_patient_access
          SET revoked_at = COALESCE(revoked_at, $2::timestamptz),
              revoked_by_user_id = COALESCE(revoked_by_user_id, $3),
              updated_at = now()
          WHERE id = $1 AND revoked_at IS NULL
          RETURNING id, revoked_at
        `,
        [existing.id, desired.revokedAt, valueOrNull(desired.revokedByUserId)],
      );
      if (revoked.rowCount === 0) {
        throw identityImportError(
          "IMPORT_SHARE_REVOCATION_RECONCILIATION_FAILED",
          `Patient share ${grant.id} changed during revocation reconciliation`,
          { shareId: grant.id, existingShareId: existing.id },
        );
      }
      return { state: "updated", ...revoked };
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };

  const findExisting = async () => {
    const byId = await readById();
    const byPrincipal = await readByPrincipal();
    const candidates = new Map();
    for (const row of [...byId.rows, ...byPrincipal.rows]) candidates.set(row.id, row);
    if (candidates.size > 1) {
      throw identityImportError(
        "IMPORT_SHARE_CANONICAL_AMBIGUOUS",
        `Patient share ${grant.id} matches multiple canonical target rows`,
        { shareId: grant.id, existingShareIds: [...candidates.keys()].sort() },
      );
    }
    return [...candidates.values()][0] || null;
  };

  let existing = await findExisting();
  if (existing) return reconcileExisting(existing);
  const inserted = await client.query(
    `
      INSERT INTO doctor_patient_access (
        id, doctor_user_id, doctor_id, patient_id, organization_id, access_level, scope, scan_ids,
        granted_by_user_id, authority_type, purpose, consented_at,
        expires_at, revoked_at, revoked_by_user_id, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb,
        $9, $10, $11, $12::timestamptz,
        $13::timestamptz, $14::timestamptz, $15,
        COALESCE($16::timestamptz, now()), COALESCE($17::timestamptz, now())
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      grant.id,
      valueOrNull(desired.doctorUserId),
      valueOrNull(desired.doctorUserId),
      desired.patientId,
      valueOrNull(desired.organizationId),
      desired.accessLevel,
      desired.scope,
      JSON.stringify(desired.scanIds),
      valueOrNull(grant.grantedByUserId),
      desired.authorityType,
      desired.purpose,
      desired.consentedAt || null,
      desired.expiresAt || null,
      desired.revokedAt || null,
      valueOrNull(desired.revokedByUserId),
      toIso(grant.createdAt),
      toIso(grant.updatedAt),
    ]
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await findExisting();
  if (!existing) {
    throw identityImportError(
      "IMPORT_SHARE_RECONCILIATION_FAILED",
      `Patient share ${grant.id} could not be reconciled after an insert collision`,
      { shareId: grant.id },
    );
  }
  return reconcileExisting(existing);
}

async function upsertDevice(client, device) {
  const hasOrganizationId = Object.prototype.hasOwnProperty.call(device, "organizationId");
  const hasPairedUserId = Object.prototype.hasOwnProperty.call(device, "pairedUserId");
  const hasOwnerUserId = Object.prototype.hasOwnProperty.call(device, "ownerUserId");
  const hasAssignedPatientId = Object.prototype.hasOwnProperty.call(device, "assignedPatientId");
  const hasOwnershipState = Object.prototype.hasOwnProperty.call(device, "ownershipState");
  const desiredOwnerUserId = canonicalId(device.ownerUserId || device.pairedUserId);
  const desiredAssignedPatientId = canonicalId(device.assignedPatientId);
  const desiredOwnershipState = inferDeviceOwnershipState(device);
  const desiredRevokedByUserId = canonicalId(device.revokedByUserId);
  const desiredManufacturer = valueOrNull(device.manufacturer);
  const desiredModel = valueOrNull(device.model);
  const desiredSerialNumber = valueOrNull(device.serialNumber);
  const desiredPurchaseDate = valueOrNull(device.purchaseDate);
  const normalizedTelemetry = sanitizeDeviceTelemetry(device.telemetry);
  const desiredTelemetry = Object.keys(normalizedTelemetry).length > 0
    ? JSON.stringify(normalizedTelemetry)
    : null;
  const normalizedCredentialRotation = sanitizeDeviceCredentialRotation(device.credentialRotation);
  const desiredCredentialRotation = Object.keys(normalizedCredentialRotation).length > 0
    ? JSON.stringify(normalizedCredentialRotation)
    : null;
  const normalizedOta = sanitizeDeviceOtaLifecycle(device.ota);
  const desiredOtaStatus = normalizeDeviceOtaStatus(device.otaStatus || normalizedOta.status);
  if (desiredOtaStatus) normalizedOta.status = desiredOtaStatus;
  const desiredOta = Object.keys(normalizedOta).length > 0
    ? JSON.stringify(normalizedOta)
    : null;
  const secretMaterial = typeof device.secret === "string"
    ? device.secret
    : (typeof device.secretHash === "string" ? device.secretHash : "");
  const desiredSecretHash = canonicalDeviceSecretHash(secretMaterial);
  const desiredRevokedAt = toIso(device.revokedAt) || "";
  const readExisting = () => client.query(
    `
      SELECT id, organization_id, paired_user_id, ownership_state, owner_user_id,
             assigned_patient_id, revoked_by_user_id, secret_hash, revoked_at,
             manufacturer, model, serial_number, purchase_date, telemetry, credential_rotation,
             ota, ota_status
      FROM devices
      WHERE id = $1
      FOR UPDATE
    `,
    [device.id],
  );
  const reconcileExisting = async (existing) => {
    const mismatchFields = [];
    if (hasOrganizationId && canonicalId(existing.organization_id) !== canonicalId(device.organizationId)) {
      mismatchFields.push("organizationId");
    }
    if (hasPairedUserId && canonicalId(existing.paired_user_id) !== canonicalId(device.pairedUserId)) {
      mismatchFields.push("pairedUserId");
    }
    if (
      (hasOwnerUserId || hasPairedUserId) &&
      canonicalId(existing.owner_user_id) !== desiredOwnerUserId
    ) {
      mismatchFields.push("ownerUserId");
    }
    if (
      hasAssignedPatientId &&
      canonicalId(existing.assigned_patient_id) !== desiredAssignedPatientId
    ) {
      mismatchFields.push("assignedPatientId");
    }
    if (
      hasOwnershipState &&
      canonicalId(existing.ownership_state) !== desiredOwnershipState &&
      !(desiredOwnershipState === "revoked" && !existing.revoked_at)
    ) {
      mismatchFields.push("ownershipState");
    }
    if (desiredSecretHash && canonicalId(existing.secret_hash) !== desiredSecretHash) {
      mismatchFields.push("secretHash");
    }
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_DEVICE_CANONICAL_CONFLICT",
        `Device ${device.id} conflicts with canonical tenant, pairing, or credential state`,
        { deviceId: device.id, mismatchFields },
      );
    }
    const existingPurchaseDate = existing.purchase_date
      ? (toIso(existing.purchase_date) || String(existing.purchase_date)).slice(0, 10)
      : "";
    const metadataNeedsUpdate =
      (desiredManufacturer !== null && existing.manufacturer !== desiredManufacturer)
      || (desiredModel !== null && existing.model !== desiredModel)
      || (desiredSerialNumber !== null && existing.serial_number !== desiredSerialNumber)
      || (desiredPurchaseDate !== null && existingPurchaseDate !== desiredPurchaseDate);
    const telemetryNeedsUpdate = desiredTelemetry !== null;
    const credentialRotationNeedsUpdate = desiredCredentialRotation !== null;
    const otaLifecycleNeedsUpdate = desiredOta !== null;
    const shouldRevoke = Boolean(desiredRevokedAt && !existing.revoked_at);
    if (
      metadataNeedsUpdate || telemetryNeedsUpdate || credentialRotationNeedsUpdate ||
      otaLifecycleNeedsUpdate || shouldRevoke
    ) {
      const updated = await client.query(
        `
          UPDATE devices
          SET manufacturer = COALESCE($2, manufacturer),
              model = COALESCE($3, model),
              serial_number = COALESCE($4, serial_number),
              purchase_date = COALESCE($5::date, purchase_date),
              revoked_at = CASE WHEN $6::timestamptz IS NULL THEN revoked_at ELSE COALESCE(revoked_at, $6::timestamptz) END,
              revoked_by_user_id = CASE WHEN $6::timestamptz IS NULL THEN revoked_by_user_id ELSE COALESCE(revoked_by_user_id, $9) END,
              ownership_state = CASE WHEN $6::timestamptz IS NULL THEN ownership_state ELSE 'revoked' END,
              connected = CASE WHEN $6::timestamptz IS NULL THEN connected ELSE false END,
              status = CASE WHEN $6::timestamptz IS NULL THEN status ELSE 'revoked' END,
              telemetry = COALESCE($7::jsonb, telemetry),
              credential_rotation = COALESCE($8::jsonb, credential_rotation),
              ota = COALESCE($10::jsonb, ota),
              ota_status = CASE
                WHEN $10::jsonb IS NULL THEN ota_status
                ELSE COALESCE(NULLIF($11, ''), ota_status)
              END,
              updated_at = now()
          WHERE id = $1
          RETURNING id, revoked_at, manufacturer, model, serial_number, purchase_date,
                    telemetry, credential_rotation, ota, ota_status
        `,
        [
          device.id,
          desiredManufacturer,
          desiredModel,
          desiredSerialNumber,
          desiredPurchaseDate,
          shouldRevoke ? desiredRevokedAt : null,
          desiredTelemetry,
          desiredCredentialRotation,
          valueOrNull(desiredRevokedByUserId),
          desiredOta,
          desiredOtaStatus,
        ],
      );
      if (updated.rowCount === 0) {
        throw identityImportError(
          "IMPORT_DEVICE_RECONCILIATION_FAILED",
          `Device ${device.id} changed during inventory or revocation reconciliation`,
          { deviceId: device.id },
        );
      }
      return { state: "updated", ...updated };
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };

  let existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO devices (
        id, organization_id, paired_user_id, ownership_state, owner_user_id,
        assigned_patient_id, revoked_by_user_id, name, type, status, signal, battery, connected,
        connection_method, secret_hash, firmware_version, manufacturer, model, serial_number, purchase_date,
        last_seen_at, revoked_at, created_at, updated_at, telemetry, credential_rotation,
        ota, ota_status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20::date, $21, $22,
        COALESCE($23::timestamptz, now()), COALESCE($24::timestamptz, now()), $25::jsonb, $26::jsonb,
        $27::jsonb, $28
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      device.id,
      valueOrNull(canonicalId(device.organizationId)),
      valueOrNull(canonicalId(device.pairedUserId)),
      desiredOwnershipState,
      valueOrNull(desiredOwnerUserId),
      valueOrNull(desiredAssignedPatientId),
      valueOrNull(desiredRevokedByUserId),
      device.name || device.id,
      device.type || "stethoscope",
      desiredRevokedAt ? "revoked" : (device.status || "unclaimed"),
      device.signal === undefined || device.signal === "" ? null : device.signal,
      device.battery === undefined || device.battery === "" ? null : device.battery,
      desiredRevokedAt ? false : Boolean(device.connected),
      valueOrNull(device.connectionMethod),
      valueOrNull(desiredSecretHash),
      valueOrNull(device.firmwareVersion || device.firmware),
      desiredManufacturer,
      desiredModel,
      desiredSerialNumber,
      desiredPurchaseDate,
      toIso(device.lastSeenAt),
      desiredRevokedAt || null,
      toIso(device.createdAt),
      toIso(device.updatedAt),
      JSON.stringify(normalizedTelemetry),
      JSON.stringify(normalizedCredentialRotation),
      JSON.stringify(normalizedOta),
      desiredOtaStatus,
    ]
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows[0]) {
    throw identityImportError(
      "IMPORT_DEVICE_RECONCILIATION_FAILED",
      `Device ${device.id} could not be reconciled after an insert collision`,
      { deviceId: device.id },
    );
  }
  return reconcileExisting(existing.rows[0]);
}

async function upsertDeviceClaim(client, claim) {
  const desiredIdentity = {
    deviceId: canonicalId(claim.deviceId),
    organizationId: canonicalId(claim.organizationId),
    claimCodeHash: canonicalId(claim.claimCodeHash),
  };
  const readExisting = () => client.query(
    `
      SELECT id, device_id, organization_id, claim_code_hash,
             claimed_by_user_id, claimed_at, revoked_at
      FROM device_claims
      WHERE id = $1
      FOR UPDATE
    `,
    [claim.id],
  );
  const reconcileExisting = (existing) => {
    const mismatchFields = [];
    if (canonicalId(existing.device_id) !== desiredIdentity.deviceId) {
      mismatchFields.push("deviceId");
    }
    if (canonicalId(existing.organization_id) !== desiredIdentity.organizationId) {
      mismatchFields.push("organizationId");
    }
    if (canonicalId(existing.claim_code_hash) !== desiredIdentity.claimCodeHash) {
      mismatchFields.push("claimCodeHash");
    }
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_DEVICE_CLAIM_CANONICAL_CONFLICT",
        `Device claim ${claim.id} conflicts with canonical identity`,
        { claimId: claim.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };

  let existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO device_claims (
        id, device_id, organization_id, claim_code_hash, created_by_user_id,
        claimed_by_user_id, expires_at, claimed_at, revoked_at,
        revoked_by_user_id, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::timestamptz, $8::timestamptz, $9::timestamptz,
        $10, COALESCE($11::timestamptz, now()), COALESCE($12::timestamptz, now())
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      claim.id,
      desiredIdentity.deviceId,
      desiredIdentity.organizationId,
      desiredIdentity.claimCodeHash,
      valueOrNull(canonicalId(claim.createdByUserId)),
      valueOrNull(canonicalId(claim.claimedByUserId)),
      toIso(claim.expiresAt),
      toIso(claim.claimedAt),
      toIso(claim.revokedAt),
      valueOrNull(canonicalId(claim.revokedByUserId)),
      toIso(claim.createdAt),
      toIso(claim.updatedAt || claim.createdAt),
    ],
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows[0]) {
    throw identityImportError(
      "IMPORT_DEVICE_CLAIM_RECONCILIATION_FAILED",
      `Device claim ${claim.id} could not be reconciled after an insert collision`,
      { claimId: claim.id },
    );
  }
  return reconcileExisting(existing.rows[0]);
}

async function upsertScan(client, scan) {
  const desiredIdentity = {
    organizationId: canonicalId(scan.organizationId),
    patientId: canonicalId(scan.patientId),
    deviceId: canonicalId(scan.deviceId),
    createdByUserId: canonicalId(scan.createdByUserId),
  };
  const readExisting = () => client.query(
    `
      SELECT id, organization_id, patient_id, device_id, created_by_user_id
      FROM scan_sessions
      WHERE id = $1
      FOR UPDATE
    `,
    [scan.id],
  );
  const reconcileExisting = (existing) => {
    const mismatchFields = [];
    if (canonicalId(existing.organization_id) !== desiredIdentity.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(existing.patient_id) !== desiredIdentity.patientId) mismatchFields.push("patientId");
    if (canonicalId(existing.device_id) !== desiredIdentity.deviceId) mismatchFields.push("deviceId");
    if (canonicalId(existing.created_by_user_id) !== desiredIdentity.createdByUserId) mismatchFields.push("createdByUserId");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_SCAN_CANONICAL_CONFLICT",
        `Scan ${scan.id} conflicts with canonical tenant or source identity`,
        { scanId: scan.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };
  let existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO scan_sessions (
        id, organization_id, patient_id, device_id, created_by_user_id, idempotency_key, status,
        processing_status, mode, body_site, started_at, ended_at, sample_rate, sample_count,
        duration_seconds, peak, rms, level_percent, bpm, ai_label, ai_confidence, ai_summary,
        doctor_notes, audio_url, wav_file, created_at, updated_at,
        uploaded_bytes, audio_chunk_count, audio_upload_completed_at,
        processing_generation, processing_intent, processing_artifact_fingerprint,
        processing_run_id, audio_file_id, ai_result_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, COALESCE($11::timestamptz, now()), $12::timestamptz, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, COALESCE($26::timestamptz, now()), COALESCE($27::timestamptz, now()),
        $28, $29, $30::timestamptz,
        $31, $32, $33, $34, $35, $36
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      scan.id,
      valueOrNull(desiredIdentity.organizationId),
      desiredIdentity.patientId,
      valueOrNull(desiredIdentity.deviceId),
      valueOrNull(desiredIdentity.createdByUserId),
      valueOrNull(scan.idempotencyKey),
      scan.status || "recording",
      scan.processingStatus || scan.status || "recording",
      scan.mode || "heart",
      valueOrNull(scan.bodySite),
      toIso(scan.startedAt || scan.createdAt),
      toIso(scan.endedAt),
      scan.sampleRate || 16000,
      scan.sampleCount || 0,
      scan.durationSeconds || 0,
      scan.peak || 0,
      scan.rms || 0,
      scan.levelPercent || 0,
      scan.bpm || 0,
      valueOrNull(scan.aiLabel),
      scan.aiConfidence === undefined || scan.aiConfidence === "" ? null : scan.aiConfidence,
      valueOrNull(scan.aiSummary),
      valueOrNull(scan.doctorNotes),
      valueOrNull(scan.audioUrl),
      valueOrNull(scan.wavFile),
      toIso(scan.createdAt || scan.startedAt),
      toIso(scan.updatedAt),
      Number(scan.uploadedBytes || 0),
      Number(scan.audioChunkCount || 0),
      toIso(scan.audioUploadCompletedAt),
      Number(scan.processingGeneration || 0),
      valueOrNull(scan.processingIntent) || "",
      valueOrNull(scan.processingArtifactFingerprint) || "",
      valueOrNull(scan.processingRunId) || "",
      valueOrNull(scan.audioFileId),
      valueOrNull(scan.aiResultId),
    ]
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows[0]) {
    throw identityImportError(
      "IMPORT_SCAN_RECONCILIATION_FAILED",
      `Scan ${scan.id} could not be reconciled after an insert collision`,
      { scanId: scan.id },
    );
  }
  return reconcileExisting(existing.rows[0]);
}

async function upsertScanAudioChunk(client, chunk) {
  const desired = {
    id: canonicalId(chunk.id),
    scanId: canonicalId(chunk.scanId),
    organizationId: canonicalId(chunk.organizationId),
    actorUserId: canonicalId(chunk.actorUserId),
    idempotencyKey: canonicalId(chunk.idempotencyKey),
    sequence: Number(chunk.sequence),
    sha256: String(chunk.sha256 || "").trim().toLowerCase(),
    byteSize: Number(chunk.byteSize),
    filePath: String(chunk.filePath || "").trim(),
    createdAt: toIso(chunk.createdAt),
  };
  const readExisting = () => client.query(
    `SELECT *
     FROM scan_audio_chunks
     WHERE id = $1
        OR (scan_id = $2 AND chunk_sequence = $3)
        OR (organization_id = $4 AND actor_user_id = $5 AND idempotency_key = $6)
     FOR UPDATE`,
    [desired.id, desired.scanId, desired.sequence, desired.organizationId, desired.actorUserId, desired.idempotencyKey],
  );
  const reconcileExisting = (rows) => {
    if (rows.length !== 1) {
      throw identityImportError(
        "IMPORT_SCAN_AUDIO_CHUNK_AMBIGUOUS",
        `Audio chunk ${desired.id} collides with multiple canonical ledger rows`,
        { chunkId: desired.id, scanId: desired.scanId },
      );
    }
    const existing = rows[0];
    const mismatchFields = [];
    if (canonicalId(existing.scan_id) !== desired.scanId) mismatchFields.push("scanId");
    if (canonicalId(existing.organization_id) !== desired.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(existing.actor_user_id) !== desired.actorUserId) mismatchFields.push("actorUserId");
    if (canonicalId(existing.idempotency_key) !== desired.idempotencyKey) mismatchFields.push("idempotencyKey");
    if (Number(existing.chunk_sequence) !== desired.sequence) mismatchFields.push("sequence");
    if (String(existing.sha256 || "").toLowerCase() !== desired.sha256) mismatchFields.push("sha256");
    if (Number(existing.byte_size) !== desired.byteSize) mismatchFields.push("byteSize");
    if (mismatchFields.length) {
      throw identityImportError(
        "IMPORT_SCAN_AUDIO_CHUNK_CANONICAL_CONFLICT",
        `Audio chunk ${desired.id} conflicts with canonical idempotency or payload identity`,
        { chunkId: desired.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };
  let existing = await readExisting();
  if (existing.rows.length) return reconcileExisting(existing.rows);
  const inserted = await client.query(
    `INSERT INTO scan_audio_chunks (
       id, scan_id, organization_id, actor_user_id, idempotency_key,
       chunk_sequence, sha256, byte_size, file_path, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, now()))
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      desired.id,
      desired.scanId,
      desired.organizationId,
      desired.actorUserId,
      desired.idempotencyKey,
      desired.sequence,
      desired.sha256,
      desired.byteSize,
      desired.filePath,
      desired.createdAt,
    ],
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows.length) {
    throw identityImportError(
      "IMPORT_SCAN_AUDIO_CHUNK_RECONCILIATION_FAILED",
      `Audio chunk ${desired.id} could not be reconciled after an insert collision`,
      { chunkId: desired.id },
    );
  }
  return reconcileExisting(existing.rows);
}

async function upsertScanAudioCompletion(client, completion) {
  const desired = {
    id: canonicalId(completion.id),
    scanId: canonicalId(completion.scanId),
    organizationId: canonicalId(completion.organizationId),
    actorUserId: canonicalId(completion.actorUserId),
    idempotencyKey: canonicalId(completion.idempotencyKey),
    status: canonicalId(completion.status || "processing").toLowerCase(),
    manifestSha256: String(completion.manifestSha256 || "").trim().toLowerCase(),
    chunkCount: Number(completion.chunkCount),
    totalBytes: Number(completion.totalBytes),
    response: completion.response && typeof completion.response === "object" ? completion.response : {},
    errorCode: String(completion.errorCode || ""),
    errorMessage: String(completion.errorMessage || ""),
    createdAt: toIso(completion.createdAt),
    updatedAt: toIso(completion.updatedAt || completion.createdAt),
    completedAt: toIso(completion.completedAt),
  };
  const readExisting = () => client.query(
    `SELECT *
     FROM scan_audio_completions
     WHERE id = $1 OR scan_id = $2
        OR (organization_id = $3 AND actor_user_id = $4 AND idempotency_key = $5)
     FOR UPDATE`,
    [desired.id, desired.scanId, desired.organizationId, desired.actorUserId, desired.idempotencyKey],
  );
  const reconcileExisting = (rows) => {
    if (rows.length !== 1) {
      throw identityImportError(
        "IMPORT_SCAN_AUDIO_COMPLETION_AMBIGUOUS",
        `Audio completion ${desired.id} collides with multiple canonical ledger rows`,
        { completionId: desired.id, scanId: desired.scanId },
      );
    }
    const existing = rows[0];
    const mismatchFields = [];
    if (canonicalId(existing.scan_id) !== desired.scanId) mismatchFields.push("scanId");
    if (canonicalId(existing.organization_id) !== desired.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(existing.actor_user_id) !== desired.actorUserId) mismatchFields.push("actorUserId");
    if (canonicalId(existing.idempotency_key) !== desired.idempotencyKey) mismatchFields.push("idempotencyKey");
    if (String(existing.manifest_sha256 || "").toLowerCase() !== desired.manifestSha256) mismatchFields.push("manifestSha256");
    if (Number(existing.chunk_count) !== desired.chunkCount) mismatchFields.push("chunkCount");
    if (Number(existing.total_bytes) !== desired.totalBytes) mismatchFields.push("totalBytes");
    if (mismatchFields.length) {
      throw identityImportError(
        "IMPORT_SCAN_AUDIO_COMPLETION_CANONICAL_CONFLICT",
        `Audio completion ${desired.id} conflicts with canonical upload identity`,
        { completionId: desired.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };
  let existing = await readExisting();
  if (existing.rows.length) return reconcileExisting(existing.rows);
  const inserted = await client.query(
    `INSERT INTO scan_audio_completions (
       id, scan_id, organization_id, actor_user_id, idempotency_key, status,
       manifest_sha256, chunk_count, total_bytes, response_json,
       error_code, error_message, created_at, updated_at, completed_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb,
       $11, $12, COALESCE($13::timestamptz, now()), COALESCE($14::timestamptz, now()), $15::timestamptz
     )
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      desired.id,
      desired.scanId,
      desired.organizationId,
      desired.actorUserId,
      desired.idempotencyKey,
      desired.status,
      desired.manifestSha256,
      desired.chunkCount,
      desired.totalBytes,
      JSON.stringify(desired.response),
      desired.errorCode,
      desired.errorMessage,
      desired.createdAt,
      desired.updatedAt,
      desired.completedAt,
    ],
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows.length) {
    throw identityImportError(
      "IMPORT_SCAN_AUDIO_COMPLETION_RECONCILIATION_FAILED",
      `Audio completion ${desired.id} could not be reconciled after an insert collision`,
      { completionId: desired.id },
    );
  }
  return reconcileExisting(existing.rows);
}

async function upsertScanReview(client, review) {
  const desired = {
    id: canonicalId(review.id),
    scanId: canonicalId(review.scanId),
    organizationId: canonicalId(review.organizationId),
    patientId: canonicalId(review.patientId),
    status: canonicalId(review.status || "pending").toLowerCase(),
    decision: canonicalId(review.decision).toLowerCase(),
    note: String(review.note || ""),
    reviewerUserId: canonicalId(review.reviewerUserId),
    reviewedAt: toIso(review.reviewedAt),
    version: Number(review.version === undefined || review.version === null || review.version === "" ? 1 : review.version),
    createdAt: toIso(review.createdAt),
    updatedAt: toIso(review.updatedAt || review.reviewedAt || review.createdAt),
  };
  const readExisting = () => client.query(
    `
      SELECT id, scan_id, organization_id, patient_id, status, decision, note,
        reviewer_user_id, reviewed_at, version, created_at, updated_at
      FROM scan_reviews
      WHERE id = $1 OR scan_id = $2
      FOR UPDATE
    `,
    [review.id, desired.scanId],
  );
  const assertCanonicalIdentity = (existing) => {
    const mismatchFields = [];
    const generatedBackfill =
      canonicalId(existing.id) === `review_${desired.scanId}` &&
      canonicalId(existing.status || "pending") === "pending";
    if (canonicalId(existing.id) !== desired.id && !generatedBackfill) mismatchFields.push("id");
    if (canonicalId(existing.scan_id) !== desired.scanId) mismatchFields.push("scanId");
    if (canonicalId(existing.organization_id) !== desired.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(existing.patient_id) !== desired.patientId) mismatchFields.push("patientId");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_SCAN_REVIEW_CANONICAL_CONFLICT",
        `Scan review ${review.id} conflicts with canonical scan identity`,
        { reviewId: review.id, scanId: desired.scanId, mismatchFields },
      );
    }
  };
  const stateMatches = (existing) =>
    canonicalId(existing.status || "pending") === desired.status &&
    canonicalId(existing.decision) === desired.decision &&
    String(existing.note || "") === desired.note &&
    canonicalId(existing.reviewer_user_id) === desired.reviewerUserId &&
    toIso(existing.reviewed_at) === desired.reviewedAt &&
    Number(existing.version || 1) === desired.version;
  const reconcileExisting = async (rows) => {
    if (rows.length > 1) {
      throw identityImportError(
        "IMPORT_SCAN_REVIEW_CANONICAL_AMBIGUOUS",
        `Scan review ${review.id} resolves to more than one canonical row`,
        { reviewId: review.id, scanId: desired.scanId, rowIds: rows.map((row) => row.id) },
      );
    }
    const existing = rows[0];
    assertCanonicalIdentity(existing);
    const existingVersion = Number(existing.version || 1);
    const generatedBackfillNeedsRekey =
      canonicalId(existing.id) !== desired.id &&
      canonicalId(existing.id) === `review_${desired.scanId}` &&
      canonicalId(existing.status || "pending") === "pending";
    if (canonicalId(existing.status) === "reviewed" && desired.status === "pending") {
      if (desired.version > existingVersion) {
        throw identityImportError(
          "IMPORT_SCAN_REVIEW_LIFECYCLE_CONFLICT",
          `Scan review ${review.id} cannot downgrade a reviewed decision to pending`,
          { reviewId: review.id, sourceVersion: desired.version, targetVersion: existingVersion },
        );
      }
      return { state: "preserved", rowCount: 0, rows: [existing] };
    }
    if (desired.version < existingVersion || (stateMatches(existing) && !generatedBackfillNeedsRekey)) {
      return { state: "preserved", rowCount: 0, rows: [existing] };
    }
    const targetUpdatedAt = toIso(existing.updated_at);
    const sourceIsNewer = Boolean(
      desired.updatedAt &&
      (!targetUpdatedAt || Date.parse(desired.updatedAt) > Date.parse(targetUpdatedAt)),
    );
    const generatedPendingNeedsReview = canonicalId(existing.status || "pending") === "pending" && desired.status === "reviewed";
    if (
      desired.version === existingVersion &&
      !sourceIsNewer &&
      !generatedPendingNeedsReview &&
      !generatedBackfillNeedsRekey
    ) {
      return { state: "preserved", rowCount: 0, rows: [existing] };
    }
    const updated = await client.query(
      `
        UPDATE scan_reviews
        SET id = $2,
            status = $3,
            decision = $4,
            note = $5,
            reviewer_user_id = $6,
            reviewed_at = $7::timestamptz,
            version = $8,
            updated_at = COALESCE($9::timestamptz, updated_at, now())
        WHERE id = $1
        RETURNING id, scan_id, organization_id, patient_id, status, decision, note,
          reviewer_user_id, reviewed_at, version, created_at, updated_at
      `,
      [
        existing.id,
        desired.id,
        desired.status,
        valueOrNull(desired.decision),
        valueOrNull(desired.note),
        valueOrNull(desired.reviewerUserId),
        desired.reviewedAt,
        desired.version,
        desired.updatedAt,
      ],
    );
    return { state: "updated", ...updated };
  };

  let existing = await readExisting();
  if (existing.rows.length > 0) return reconcileExisting(existing.rows);
  const inserted = await client.query(
    `
      INSERT INTO scan_reviews (
        id, scan_id, organization_id, patient_id, status, decision, note,
        reviewer_user_id, reviewed_at, version, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9::timestamptz, $10,
        COALESCE($11::timestamptz, now()), COALESCE($12::timestamptz, $11::timestamptz, now())
      )
      ON CONFLICT DO NOTHING
      RETURNING id, scan_id, organization_id, patient_id, status, decision, note,
        reviewer_user_id, reviewed_at, version, created_at, updated_at
    `,
    [
      review.id,
      desired.scanId,
      desired.organizationId,
      desired.patientId,
      desired.status,
      valueOrNull(desired.decision),
      valueOrNull(desired.note),
      valueOrNull(desired.reviewerUserId),
      desired.reviewedAt,
      desired.version,
      desired.createdAt,
      desired.updatedAt,
    ],
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows.length) {
    throw identityImportError(
      "IMPORT_SCAN_REVIEW_RECONCILIATION_FAILED",
      `Scan review ${review.id} could not be reconciled after an insert collision`,
      { reviewId: review.id, scanId: desired.scanId },
    );
  }
  return reconcileExisting(existing.rows);
}

async function upsertClinicalAlert(client, alert) {
  const desired = {
    organizationId: canonicalId(alert.organizationId),
    sourceType: canonicalId(alert.sourceType).toLowerCase(),
    sourceId: canonicalId(alert.sourceId),
    dedupeKey: canonicalId(alert.dedupeKey),
    occurrenceNumber: Number(
      alert.occurrenceNumber === undefined || alert.occurrenceNumber === null || alert.occurrenceNumber === ""
        ? 1
        : alert.occurrenceNumber,
    ),
    previousAlertId: canonicalId(alert.previousAlertId),
    occurredAt: toIso(alert.occurredAt || alert.createdAt || alert.updatedAt),
    status: canonicalId(alert.status || "open").toLowerCase(),
    severity: canonicalId(alert.severity || "warning"),
    title: String(alert.title || ""),
    message: String(alert.message || ""),
    patientId: canonicalId(alert.patientId),
    deviceId: canonicalId(alert.deviceId),
    scanId: canonicalId(alert.scanId),
    acknowledgedByUserId: canonicalId(alert.acknowledgedByUserId),
    acknowledgedAt: toIso(alert.acknowledgedAt),
    acknowledgementNote: String(alert.acknowledgementNote || ""),
    resolvedByUserId: canonicalId(alert.resolvedByUserId),
    resolvedAt: toIso(alert.resolvedAt),
    resolutionNote: String(alert.resolutionNote || ""),
    version: Number(alert.version === undefined || alert.version === null || alert.version === "" ? 1 : alert.version),
    metadata: alert.metadata && typeof alert.metadata === "object" && !Array.isArray(alert.metadata) ? alert.metadata : {},
    createdAt: toIso(alert.createdAt),
    updatedAt: toIso(alert.updatedAt || alert.resolvedAt || alert.acknowledgedAt || alert.createdAt),
  };
  const readExisting = () => client.query(
    `
      SELECT *
      FROM clinical_alerts
      WHERE id = $1
         OR (organization_id = $2 AND dedupe_key = $3 AND occurrence_number = $4)
      FOR UPDATE
    `,
    [alert.id, desired.organizationId, desired.dedupeKey, desired.occurrenceNumber],
  );
  const assertCanonicalIdentity = (existing) => {
    const mismatchFields = [];
    if (canonicalId(existing.id) !== canonicalId(alert.id)) mismatchFields.push("id");
    if (canonicalId(existing.organization_id) !== desired.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(existing.source_type) !== desired.sourceType) mismatchFields.push("sourceType");
    if (canonicalId(existing.source_id) !== desired.sourceId) mismatchFields.push("sourceId");
    if (canonicalId(existing.dedupe_key) !== desired.dedupeKey) mismatchFields.push("dedupeKey");
    if (Number(existing.occurrence_number || 1) !== desired.occurrenceNumber) mismatchFields.push("occurrenceNumber");
    if (canonicalId(existing.previous_alert_id) !== desired.previousAlertId) mismatchFields.push("previousAlertId");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_CLINICAL_ALERT_CANONICAL_CONFLICT",
        `Clinical alert ${alert.id} conflicts with canonical source occurrence identity`,
        { alertId: alert.id, mismatchFields },
      );
    }
  };
  const stateMatches = (existing) =>
    toIso(existing.occurred_at) === desired.occurredAt &&
    canonicalId(existing.status || "open") === desired.status &&
    canonicalId(existing.severity || "warning") === desired.severity &&
    String(existing.title || "") === desired.title &&
    String(existing.message || "") === desired.message &&
    canonicalId(existing.patient_id) === desired.patientId &&
    canonicalId(existing.device_id) === desired.deviceId &&
    canonicalId(existing.scan_id) === desired.scanId &&
    canonicalId(existing.acknowledged_by_user_id) === desired.acknowledgedByUserId &&
    toIso(existing.acknowledged_at) === desired.acknowledgedAt &&
    String(existing.acknowledgement_note || "") === desired.acknowledgementNote &&
    canonicalId(existing.resolved_by_user_id) === desired.resolvedByUserId &&
    toIso(existing.resolved_at) === desired.resolvedAt &&
    String(existing.resolution_note || "") === desired.resolutionNote &&
    Number(existing.version || 1) === desired.version &&
    jsonEquals(existing.metadata, desired.metadata);
  const lifecycleRank = (status) => ({ open: 0, acknowledged: 1, resolved: 2 }[status] ?? -1);
  const reconcileExisting = async (rows) => {
    if (rows.length > 1) {
      throw identityImportError(
        "IMPORT_CLINICAL_ALERT_CANONICAL_AMBIGUOUS",
        `Clinical alert ${alert.id} resolves to more than one canonical occurrence`,
        { alertId: alert.id, rowIds: rows.map((row) => row.id) },
      );
    }
    const existing = rows[0];
    assertCanonicalIdentity(existing);
    const existingVersion = Number(existing.version || 1);
    const occurredAtNeedsCorrection = toIso(existing.occurred_at) !== desired.occurredAt;
    if (lifecycleRank(desired.status) < lifecycleRank(canonicalId(existing.status || "open"))) {
      if (desired.version > existingVersion) {
        throw identityImportError(
          "IMPORT_CLINICAL_ALERT_LIFECYCLE_CONFLICT",
          `Clinical alert ${alert.id} cannot move backward from ${existing.status} to ${desired.status}`,
          { alertId: alert.id, sourceVersion: desired.version, targetVersion: existingVersion },
        );
      }
      return { state: "preserved", rowCount: 0, rows: [existing] };
    }
    if (desired.version < existingVersion || stateMatches(existing)) {
      return { state: "preserved", rowCount: 0, rows: [existing] };
    }
    const targetUpdatedAt = toIso(existing.updated_at);
    const sourceIsNewer = Boolean(
      desired.updatedAt &&
      (!targetUpdatedAt || Date.parse(desired.updatedAt) > Date.parse(targetUpdatedAt)),
    );
    if (desired.version === existingVersion && !sourceIsNewer && !occurredAtNeedsCorrection) {
      return { state: "preserved", rowCount: 0, rows: [existing] };
    }
    const updated = await client.query(
      `
        UPDATE clinical_alerts
        SET occurred_at = COALESCE($2::timestamptz, occurred_at),
            status = $3,
            severity = $4,
            title = $5,
            message = $6,
            patient_id = $7,
            device_id = $8,
            scan_id = $9,
            acknowledged_by_user_id = $10,
            acknowledged_at = $11::timestamptz,
            acknowledgement_note = $12,
            resolved_by_user_id = $13,
            resolved_at = $14::timestamptz,
            resolution_note = $15,
            version = $16,
            metadata = $17::jsonb,
            updated_at = COALESCE($18::timestamptz, updated_at, now())
        WHERE id = $1
        RETURNING *
      `,
      [
        existing.id,
        desired.occurredAt,
        desired.status,
        desired.severity,
        desired.title,
        desired.message,
        valueOrNull(desired.patientId),
        valueOrNull(desired.deviceId),
        valueOrNull(desired.scanId),
        valueOrNull(desired.acknowledgedByUserId),
        desired.acknowledgedAt,
        valueOrNull(desired.acknowledgementNote),
        valueOrNull(desired.resolvedByUserId),
        desired.resolvedAt,
        valueOrNull(desired.resolutionNote),
        desired.version,
        JSON.stringify(desired.metadata),
        desired.updatedAt,
      ],
    );
    return { state: "updated", ...updated };
  };

  let existing = await readExisting();
  if (existing.rows.length > 0) return reconcileExisting(existing.rows);
  const inserted = await client.query(
    `
      INSERT INTO clinical_alerts (
        id, organization_id, source_type, source_id, dedupe_key,
        occurrence_number, previous_alert_id, occurred_at, status, severity,
        title, message, patient_id, device_id, scan_id,
        acknowledged_by_user_id, acknowledged_at, acknowledgement_note,
        resolved_by_user_id, resolved_at, resolution_note,
        version, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, COALESCE($8::timestamptz, $24::timestamptz, now()), $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17::timestamptz, $18,
        $19, $20::timestamptz, $21,
        $22, $23::jsonb, COALESCE($24::timestamptz, now()), COALESCE($25::timestamptz, $24::timestamptz, now())
      )
      ON CONFLICT DO NOTHING
      RETURNING *
    `,
    [
      alert.id,
      desired.organizationId,
      desired.sourceType,
      desired.sourceId,
      desired.dedupeKey,
      desired.occurrenceNumber,
      valueOrNull(desired.previousAlertId),
      desired.occurredAt,
      desired.status,
      desired.severity,
      desired.title,
      desired.message,
      valueOrNull(desired.patientId),
      valueOrNull(desired.deviceId),
      valueOrNull(desired.scanId),
      valueOrNull(desired.acknowledgedByUserId),
      desired.acknowledgedAt,
      valueOrNull(desired.acknowledgementNote),
      valueOrNull(desired.resolvedByUserId),
      desired.resolvedAt,
      valueOrNull(desired.resolutionNote),
      desired.version,
      JSON.stringify(desired.metadata),
      desired.createdAt,
      desired.updatedAt,
    ],
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows.length) {
    throw identityImportError(
      "IMPORT_CLINICAL_ALERT_RECONCILIATION_FAILED",
      `Clinical alert ${alert.id} could not be reconciled after an insert collision`,
      { alertId: alert.id, dedupeKey: desired.dedupeKey, occurrenceNumber: desired.occurrenceNumber },
    );
  }
  return reconcileExisting(existing.rows);
}

async function upsertAudioFile(client, audioFile) {
  const desiredIdentity = {
    scanId: canonicalId(audioFile.scanId),
    patientId: canonicalId(audioFile.patientId),
  };
  const readExisting = () => client.query(
    `
      SELECT id, scan_id, patient_id
      FROM audio_files
      WHERE id = $1
      FOR UPDATE
    `,
    [audioFile.id],
  );
  const reconcileExisting = (existing) => {
    const mismatchFields = [];
    if (canonicalId(existing.scan_id) !== desiredIdentity.scanId) mismatchFields.push("scanId");
    if (canonicalId(existing.patient_id) !== desiredIdentity.patientId) mismatchFields.push("patientId");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_AUDIO_CANONICAL_CONFLICT",
        `Audio file ${audioFile.id} conflicts with canonical scan or patient`,
        { audioFileId: audioFile.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };
  let existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO audio_files (id, scan_id, patient_id, storage_provider, object_key, content_type, byte_size, sample_rate, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      audioFile.id,
      desiredIdentity.scanId,
      desiredIdentity.patientId,
      audioFile.storageProvider || "local",
      audioFile.objectKey,
      audioFile.contentType || "audio/wav",
      audioFile.byteSize || 0,
      audioFile.sampleRate || 16000,
      toIso(audioFile.createdAt),
    ]
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows[0]) {
    throw identityImportError(
      "IMPORT_AUDIO_RECONCILIATION_FAILED",
      `Audio file ${audioFile.id} could not be reconciled after an insert collision`,
      { audioFileId: audioFile.id },
    );
  }
  return reconcileExisting(existing.rows[0]);
}

async function upsertAiResult(client, aiResult) {
  const desiredScanId = canonicalId(aiResult.scanId);
  const readExisting = () => client.query(
    `
      SELECT id, scan_id
      FROM ai_results
      WHERE id = $1
      FOR UPDATE
    `,
    [aiResult.id],
  );
  const reconcileExisting = (existing) => {
    if (canonicalId(existing.scan_id) !== desiredScanId) {
      throw identityImportError(
        "IMPORT_AI_RESULT_CANONICAL_CONFLICT",
        `AI result ${aiResult.id} conflicts with canonical scan`,
        { aiResultId: aiResult.id, mismatchFields: ["scanId"] },
      );
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };
  let existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO ai_results (id, scan_id, model_version, label, confidence, summary, raw_result, status, error_code, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, COALESCE($10::timestamptz, now()), COALESCE($11::timestamptz, now()))
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      aiResult.id,
      desiredScanId,
      aiResult.modelVersion || SIGNAL_QUALITY_ANALYZER_VERSION,
      valueOrNull(aiResult.label),
      aiResult.confidence === undefined || aiResult.confidence === "" ? null : aiResult.confidence,
      valueOrNull(aiResult.summary),
      JSON.stringify(aiResult.rawResult || {}),
      aiResult.status || "completed",
      valueOrNull(aiResult.errorCode),
      toIso(aiResult.createdAt),
      toIso(aiResult.updatedAt),
    ]
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows[0]) {
    throw identityImportError(
      "IMPORT_AI_RESULT_RECONCILIATION_FAILED",
      `AI result ${aiResult.id} could not be reconciled after an insert collision`,
      { aiResultId: aiResult.id },
    );
  }
  return reconcileExisting(existing.rows[0]);
}

async function upsertDeviceCommand(client, command) {
  const desiredIdentity = {
    deviceId: canonicalId(command.deviceId),
    organizationId: canonicalId(command.organizationId),
    requestedByUserId: canonicalId(command.requestedByUserId),
    protocolVersion: Number(command.protocolVersion || 1),
    type: canonicalId(command.type),
    correlationId: canonicalId(command.correlationId),
  };
  const readExisting = () => client.query(
    `
      SELECT id, device_id, organization_id, requested_by_user_id,
             protocol_version, command_type, correlation_id
      FROM device_commands
      WHERE id = $1
      FOR UPDATE
    `,
    [command.id],
  );
  const reconcileExisting = (existing) => {
    const mismatchFields = [];
    if (canonicalId(existing.device_id) !== desiredIdentity.deviceId) mismatchFields.push("deviceId");
    if (canonicalId(existing.organization_id) !== desiredIdentity.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(existing.requested_by_user_id) !== desiredIdentity.requestedByUserId) mismatchFields.push("requestedByUserId");
    if (Number(existing.protocol_version || 1) !== desiredIdentity.protocolVersion) mismatchFields.push("protocolVersion");
    if (canonicalId(existing.command_type) !== desiredIdentity.type) mismatchFields.push("type");
    if (canonicalId(existing.correlation_id) !== desiredIdentity.correlationId) mismatchFields.push("correlationId");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_DEVICE_COMMAND_CANONICAL_CONFLICT",
        `Device command ${command.id} conflicts with canonical identity`,
        { commandId: command.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: [existing] };
  };

  let existing = await readExisting();
  if (existing.rows[0]) return reconcileExisting(existing.rows[0]);
  const inserted = await client.query(
    `
      INSERT INTO device_commands (
        id, device_id, organization_id, requested_by_user_id,
        protocol_version, command_type, correlation_id, state, code, detail,
        delivery, idempotency_key, request_fingerprint,
        issued_at, expires_at, execution_expires_at, accepted_at, queued_at, delivered_at,
        acknowledged_at, applying_at, applied_at, failed_at, expired_at,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11::jsonb, $12, $13,
        $14::timestamptz, $15::timestamptz, $16::timestamptz,
        $17::timestamptz, $18::timestamptz, $19::timestamptz,
        $20::timestamptz, $21::timestamptz, $22::timestamptz,
        $23::timestamptz, $24::timestamptz, $25::timestamptz,
        $26::timestamptz
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
    [
      command.id,
      desiredIdentity.deviceId,
      valueOrNull(desiredIdentity.organizationId),
      valueOrNull(desiredIdentity.requestedByUserId),
      desiredIdentity.protocolVersion,
      desiredIdentity.type,
      desiredIdentity.correlationId,
      command.state,
      valueOrNull(command.code),
      valueOrNull(command.detail),
      JSON.stringify(command.delivery || {}),
      valueOrNull(command.idempotencyKey),
      valueOrNull(command.requestFingerprint),
      toIso(command.issuedAt),
      toIso(command.expiresAt),
      toIso(command.executionExpiresAt),
      toIso(command.acceptedAt || command.issuedAt),
      toIso(command.queuedAt),
      toIso(command.deliveredAt),
      toIso(command.acknowledgedAt),
      toIso(command.applyingAt),
      toIso(command.appliedAt),
      toIso(command.failedAt),
      toIso(command.expiredAt),
      toIso(command.createdAt || command.issuedAt),
      toIso(command.updatedAt || command.issuedAt),
    ],
  );
  if (inserted.rowCount > 0) return { state: "inserted", ...inserted };
  existing = await readExisting();
  if (!existing.rows[0]) {
    throw identityImportError(
      "IMPORT_DEVICE_COMMAND_RECONCILIATION_FAILED",
      `Device command ${command.id} could not be reconciled after an insert collision`,
      { commandId: command.id },
    );
  }
  return reconcileExisting(existing.rows[0]);
}

async function insertAuditLog(client, log) {
  return client.query(
    `
      INSERT INTO audit_logs (
        id, actor_user_id, organization_id, action, resource_type, resource_id, ip, user_agent, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::inet, $8, $9::jsonb, COALESCE($10::timestamptz, now()))
      ON CONFLICT (id) DO NOTHING
    `,
    [
      log.id,
      valueOrNull(log.actorUserId || log.userId),
      valueOrNull(log.organizationId),
      log.action || "legacy.access_log",
      valueOrNull(log.resourceType),
      valueOrNull(log.resourceId),
      valueOrNull(log.ip),
      valueOrNull(log.userAgent || log.device),
      JSON.stringify(sanitizeAuditMetadata(log.metadata || log.detail || log)),
      toIso(log.createdAt),
    ]
  );
}

async function insertExportJob(client, sourceJob) {
  const id = canonicalId(sourceJob.id);
  const organizationId = canonicalId(sourceJob.organizationId);
  const createdByUserId = canonicalId(sourceJob.createdByUserId);
  const snapshot = sourceJob.snapshot && typeof sourceJob.snapshot === "object" ? sourceJob.snapshot : {};
  const requestedDataset = canonicalId(sourceJob.dataset || snapshot.dataset) || "clinical_bundle";
  const dataset = ["clinical_bundle", "audit_logs"].includes(requestedDataset)
    ? requestedDataset
    : "clinical_bundle";
  const requestedScopeKind = canonicalId(sourceJob.scopeKind || snapshot.scope?.kind) || "workspace";
  const scopeKind = EXPORT_SCOPE_KINDS.includes(requestedScopeKind) ? requestedScopeKind : "workspace";
  const allowsPlatformAuditScope = dataset === "audit_logs" && scopeKind === "platform";
  if (!id || (!organizationId && !allowsPlatformAuditScope)) {
    throw identityImportError(
      "IMPORT_EXPORT_SCOPE_REQUIRED",
      "Every export must retain its id and canonical scope",
      { exportId: id, organizationId, dataset, scopeKind },
    );
  }
  const snapshotValid = Boolean(
    id &&
    (organizationId || allowsPlatformAuditScope) &&
    snapshot.exportId === id &&
    snapshot.scope?.organizationId === organizationId &&
    String(snapshot.dataset || "clinical_bundle") === dataset &&
    String(snapshot.scope?.kind || "workspace") === scopeKind,
  );
  const format = normalizeExportFormat(sourceJob.format) || "json";
  const rendererVersion = canonicalId(sourceJob.rendererVersion) || EXPORT_ARTIFACT_RENDERER_VERSION;
  let artifactByteSize = Number(sourceJob.artifactByteSize || 0);
  let artifactSha256 = canonicalId(sourceJob.artifactSha256);
  if (snapshotValid && rendererVersion === EXPORT_ARTIFACT_RENDERER_VERSION) {
    const artifact = await buildExportArtifact(snapshot, format, rendererVersion);
    artifactByteSize = artifact.buffer.length;
    artifactSha256 = crypto.createHash("sha256").update(artifact.buffer).digest("hex");
  }
  const artifactRenderable = snapshotValid && rendererVersion === EXPORT_ARTIFACT_RENDERER_VERSION;
  const existing = await client.query(
    "SELECT id, organization_id, created_by_user_id, dataset, scope_kind, renderer_version, artifact_sha256 FROM exports WHERE id = $1 LIMIT 1 FOR UPDATE",
    [id],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    const mismatchFields = [];
    if (canonicalId(row.organization_id) !== organizationId) mismatchFields.push("organizationId");
    if (canonicalId(row.created_by_user_id) !== createdByUserId) mismatchFields.push("createdByUserId");
    if ((canonicalId(row.dataset) || "clinical_bundle") !== dataset) mismatchFields.push("dataset");
    if ((canonicalId(row.scope_kind) || "workspace") !== scopeKind) mismatchFields.push("scopeKind");
    if ((canonicalId(row.renderer_version) || EXPORT_ARTIFACT_RENDERER_VERSION) !== rendererVersion) {
      mismatchFields.push("rendererVersion");
    }
    if (artifactSha256 && canonicalId(row.artifact_sha256) && canonicalId(row.artifact_sha256) !== artifactSha256) {
      mismatchFields.push("artifactSha256");
    }
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_EXPORT_CANONICAL_CONFLICT",
        `Export ${id} conflicts with canonical scope or artifact metadata`,
        { exportId: id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0 };
  }
  const inserted = await client.query(
    `
      INSERT INTO exports (
        id, organization_id, created_by_user_id, format, dataset, scope_kind, filters_json,
        renderer_version, status, include_audio, include_reports, include_history,
        start_date, end_date, record_count, download_url, snapshot_json,
        artifact_byte_size, artifact_sha256, downloaded_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb,
        $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17::jsonb,
        $18, $19, $20, COALESCE($21::timestamptz, now()), COALESCE($22::timestamptz, now())
      )
      ON CONFLICT (id) DO NOTHING
    `,
    [
      id,
      valueOrNull(organizationId),
      valueOrNull(createdByUserId),
      format,
      dataset,
      scopeKind,
      JSON.stringify(sourceJob.filters || snapshot.filters || {}),
      rendererVersion,
      artifactRenderable ? canonicalId(sourceJob.status) || "ready" : "failed",
      sourceJob.includeAudio !== false,
      sourceJob.includeReports !== false,
      sourceJob.includeHistory !== false,
      valueOrNull(sourceJob.startDate),
      valueOrNull(sourceJob.endDate),
      Number(sourceJob.recordCount || snapshot.counts?.total || 0),
      valueOrNull(sourceJob.downloadUrl),
      JSON.stringify(artifactRenderable ? snapshot : {}),
      artifactRenderable ? artifactByteSize : 0,
      artifactRenderable ? artifactSha256 : "",
      toIso(sourceJob.downloadedAt),
      toIso(sourceJob.createdAt),
      toIso(sourceJob.updatedAt || sourceJob.createdAt),
    ],
  );
  return { state: inserted.rowCount > 0 ? "inserted" : "preserved", ...inserted };
}

async function insertPatientImportBatch(client, batch) {
  const existing = await client.query(
    `
      SELECT id, organization_id, file_sha256
      FROM patient_import_batches
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [batch.id],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    const mismatchFields = [];
    if (canonicalId(row.organization_id) !== canonicalId(batch.organizationId)) {
      mismatchFields.push("organizationId");
    }
    if (canonicalId(row.file_sha256) !== canonicalId(batch.fileSha256)) {
      mismatchFields.push("fileSha256");
    }
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_PATIENT_BATCH_CANONICAL_CONFLICT",
        `Patient import batch ${batch.id} conflicts with canonical metadata`,
        { batchId: batch.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: existing.rows };
  }
  const inserted = await client.query(
    `
      INSERT INTO patient_import_batches (
        id, organization_id, actor_user_id, file_name, file_size_bytes, file_sha256,
        status, row_count, valid_count, invalid_count, duplicate_count, rows_json,
        patient_ids, imported_count, version, expires_at, committed_at, created_at, updated_at
      )
      VALUES (
        $1, $2, NULLIF($3, ''), $4, $5, $6,
        $7, $8, $9, $10, $11, $12::jsonb,
        $13::jsonb, $14, $15, $16::timestamptz, $17::timestamptz,
        COALESCE($18::timestamptz, now()), COALESCE($19::timestamptz, now())
      )
      RETURNING id
    `,
    [
      batch.id,
      batch.organizationId,
      canonicalId(batch.actorUserId),
      canonicalId(batch.fileName) || "patients.csv",
      batch.fileSizeBytes,
      batch.fileSha256,
      batch.status,
      batch.rowCount,
      batch.validCount,
      batch.invalidCount,
      batch.duplicateCount,
      JSON.stringify(batch.rows),
      JSON.stringify(batch.patientIds),
      batch.importedCount,
      batch.version,
      batch.expiresAt,
      valueOrNull(batch.committedAt),
      toIso(batch.createdAt),
      toIso(batch.updatedAt),
    ],
  );
  return { state: "inserted", ...inserted };
}

function ensureDefaultOrganization(db) {
  db.organizations = Array.isArray(db.organizations) ? db.organizations : [];
  if (db.organizations.some((organization) => organization.id === "org_default_clinic")) return;
  db.organizations.push({
    id: "org_default_clinic",
    name: "Smart Health Clinic",
    type: "clinic",
    workspaceType: "clinic",
    status: "pending",
    createdAt: db.createdAt,
    updatedAt: db.updatedAt,
  });
}

async function insertStorageBucket(client, sourceBucket) {
  if (sourceBucket?.system) return { state: "preserved", rowCount: 0, rows: [] };
  const bucket = normalizeStorageBucketCreate(
    {
      id: sourceBucket.id,
      name: sourceBucket.name || sourceBucket.id,
      description: sourceBucket.description || sourceBucket.desc,
      iconKey: sourceBucket.iconKey,
      colorKey: sourceBucket.colorKey,
      category: sourceBucket.category,
      allowedExtensions: sourceBucket.allowedExtensions,
      allowedMimeTypes: sourceBucket.allowedMimeTypes,
      maxFileSizeMb: sourceBucket.maxFileSizeMb,
    },
    {
      actorUserId: sourceBucket.createdByUserId,
      now: sourceBucket.createdAt,
    },
  );
  const existing = await client.query(
    "SELECT id FROM storage_buckets WHERE id = $1 LIMIT 1 FOR UPDATE",
    [bucket.id],
  );
  if (existing.rows[0]) return { state: "preserved", rowCount: 0, rows: existing.rows };
  const inserted = await client.query(
    `
      INSERT INTO storage_buckets (
        id, name, description, icon_key, color_key, category,
        allowed_extensions, allowed_mime_types, max_file_size_mb,
        created_by_user_id, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8::jsonb, $9,
        NULLIF($10, ''), COALESCE($11::timestamptz, now()), COALESCE($12::timestamptz, now())
      )
      RETURNING id
    `,
    [
      bucket.id,
      bucket.name,
      bucket.description,
      bucket.iconKey,
      bucket.colorKey,
      bucket.category,
      JSON.stringify(bucket.allowedExtensions),
      JSON.stringify(bucket.allowedMimeTypes),
      bucket.maxFileSizeMb,
      bucket.createdByUserId,
      toIso(sourceBucket.createdAt || bucket.createdAt),
      toIso(sourceBucket.updatedAt || bucket.updatedAt),
    ],
  );
  return { state: "inserted", ...inserted };
}

async function insertStorageFile(client, sourceFile) {
  const file = normalizeStorageFileCreate(sourceFile, {
    actorUserId: sourceFile.createdByUserId,
    now: sourceFile.createdAt,
  });
  if (sourceFile.status === "deleted") {
    file.status = "deleted";
    file.deletedAt = toIso(sourceFile.deletedAt);
    file.deletedByUserId = canonicalId(sourceFile.deletedByUserId);
  }
  const existing = await client.query(
    `
      SELECT id, organization_id, object_key, checksum_sha256, status
      FROM storage_files
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [file.id],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    const mismatchFields = [];
    if (canonicalId(row.organization_id) !== file.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(row.object_key) !== file.objectKey) mismatchFields.push("objectKey");
    if (canonicalId(row.checksum_sha256) !== file.checksum) mismatchFields.push("checksum");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_STORAGE_FILE_CANONICAL_CONFLICT",
        `Storage file ${file.id} conflicts with canonical metadata`,
        { fileId: file.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: existing.rows };
  }
  const inserted = await client.query(
    `
      INSERT INTO storage_files (
        id, organization_id, bucket_id, name, object_key, storage_provider,
        content_type, file_type, byte_size, checksum_sha256, firmware_version,
        tags, uploader, created_by_user_id, status, deleted_at, deleted_by_user_id,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12::jsonb, $13, NULLIF($14, ''), $15, $16::timestamptz, NULLIF($17, ''),
        COALESCE($18::timestamptz, now()), COALESCE($19::timestamptz, now())
      )
      RETURNING id
    `,
    [
      file.id,
      file.organizationId,
      file.bucket,
      file.name,
      file.objectKey,
      file.storageProvider,
      file.contentType,
      file.type,
      file.byteSize,
      file.checksum,
      file.firmwareVersion,
      JSON.stringify(file.tags),
      file.uploader,
      file.createdByUserId,
      file.status,
      toIso(file.deletedAt),
      file.deletedByUserId,
      toIso(sourceFile.createdAt || file.createdAt),
      toIso(sourceFile.updatedAt || file.updatedAt),
    ],
  );
  return { state: "inserted", ...inserted };
}

async function insertStaffInvitation(client, sourceInvitation) {
  const invitation = {
    ...normalizeStaffInvitationCreate({
      organizationId: sourceInvitation.organizationId,
      email: sourceInvitation.email,
      role: sourceInvitation.role,
      name: sourceInvitation.name,
      phone: sourceInvitation.phone,
      specialty: sourceInvitation.specialty,
      license: sourceInvitation.license,
    }),
    id: canonicalId(sourceInvitation.id),
    status: canonicalId(sourceInvitation.status || "pending").toLowerCase(),
    tokenHash: assertStaffInvitationTokenHash(sourceInvitation.tokenHash),
    expiresAt: toIso(sourceInvitation.expiresAt),
    delivery: normalizeStaffInvitationDelivery(sourceInvitation.delivery),
  };
  const existing = await client.query(
    `
      SELECT id, organization_id, email, role, token_hash, status
      FROM staff_invitations
      WHERE id = $1
         OR token_hash = $2
         OR (
           $3 = 'pending'
           AND status = 'pending'
           AND organization_id = $4
           AND lower(email) = lower($5)
         )
      FOR UPDATE
    `,
    [
      invitation.id,
      invitation.tokenHash,
      invitation.status,
      invitation.organizationId,
      invitation.email,
    ],
  );
  if (existing.rows.length > 0) {
    const canonical = existing.rows.find((row) => row.id === invitation.id) || existing.rows[0];
    const mismatchFields = [];
    if (canonical.id !== invitation.id) mismatchFields.push("id");
    if (canonicalId(canonical.organization_id) !== invitation.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(canonical.email).toLowerCase() !== invitation.email) mismatchFields.push("email");
    if (canonicalId(canonical.role) !== invitation.role) mismatchFields.push("role");
    if (canonicalId(canonical.token_hash) !== invitation.tokenHash) mismatchFields.push("tokenHash");
    if (mismatchFields.length > 0 || existing.rows.some((row) => row.id !== invitation.id)) {
      throw identityImportError(
        "IMPORT_STAFF_INVITATION_CANONICAL_CONFLICT",
        `Staff invitation ${invitation.id} conflicts with canonical invitation identity`,
        { invitationId: invitation.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: existing.rows };
  }

  const inserted = await client.query(
    `
      INSERT INTO staff_invitations (
        id, organization_id, email, role, name, phone, specialty, license,
        status, token_hash, expires_at, accepted_at, accepted_by_user_id,
        revoked_at, revoked_by_user_id, revoke_reason, created_by_user_id,
        last_sent_at, send_count, email_delivery_status, email_provider,
        email_message_id, email_last_attempt_at, email_error_code,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11::timestamptz, $12::timestamptz, NULLIF($13, ''),
        $14::timestamptz, NULLIF($15, ''), $16, NULLIF($17, ''),
        $18::timestamptz, $19, $20, $21,
        $22, $23::timestamptz, $24,
        COALESCE($25::timestamptz, now()), COALESCE($26::timestamptz, now())
      )
      RETURNING id
    `,
    [
      invitation.id,
      invitation.organizationId,
      invitation.email,
      invitation.role,
      invitation.name,
      invitation.phone,
      invitation.specialty,
      invitation.license,
      invitation.status,
      invitation.tokenHash,
      invitation.expiresAt,
      toIso(sourceInvitation.acceptedAt),
      canonicalId(sourceInvitation.acceptedByUserId),
      toIso(sourceInvitation.revokedAt),
      canonicalId(sourceInvitation.revokedByUserId),
      canonicalId(sourceInvitation.revokeReason),
      canonicalId(sourceInvitation.createdByUserId),
      toIso(sourceInvitation.lastSentAt),
      Number(sourceInvitation.sendCount || 0),
      invitation.delivery.email,
      invitation.delivery.provider,
      invitation.delivery.messageId,
      toIso(invitation.delivery.lastAttemptAt),
      invitation.delivery.errorCode,
      toIso(sourceInvitation.createdAt),
      toIso(sourceInvitation.updatedAt || sourceInvitation.createdAt),
    ],
  );
  return { state: "inserted", ...inserted };
}

async function insertSupportTicket(client, sourceTicket) {
  const normalized = normalizeSupportTicketRecord(sourceTicket);
  const ticket = {
    id: canonicalId(sourceTicket.id),
    ...normalized,
    status: canonicalId(sourceTicket.status || "open").toLowerCase(),
    acknowledgedAt: toIso(sourceTicket.acknowledgedAt),
    acknowledgedByUserId: canonicalId(sourceTicket.acknowledgedByUserId),
    resolvedAt: toIso(sourceTicket.resolvedAt),
    resolvedByUserId: canonicalId(sourceTicket.resolvedByUserId),
    resolutionNote: canonicalId(sourceTicket.resolutionNote),
    version: Number(sourceTicket.version || 1),
    createdAt: toIso(sourceTicket.createdAt),
    updatedAt: toIso(sourceTicket.updatedAt || sourceTicket.createdAt),
  };
  const existing = await client.query(
    `
      SELECT id, organization_id, requester_user_id, type
      FROM support_tickets
      WHERE id = $1
      FOR UPDATE
    `,
    [ticket.id],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    const mismatchFields = [];
    if (canonicalId(row.organization_id) !== ticket.workspaceId) mismatchFields.push("workspaceId");
    if (canonicalId(row.requester_user_id) !== ticket.requesterUserId) mismatchFields.push("requesterUserId");
    if (canonicalId(row.type) !== ticket.type) mismatchFields.push("type");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_SUPPORT_TICKET_CANONICAL_CONFLICT",
        `Support ticket ${ticket.id} conflicts with canonical ticket identity`,
        { ticketId: ticket.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: existing.rows };
  }
  const inserted = await client.query(
    `
      INSERT INTO support_tickets (
        id, organization_id, requester_user_id, type, description, status,
        acknowledged_at, acknowledged_by_user_id, resolved_at,
        resolved_by_user_id, resolution_note, version, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::timestamptz, NULLIF($8, ''), $9::timestamptz,
        NULLIF($10, ''), $11, $12,
        COALESCE($13::timestamptz, now()), COALESCE($14::timestamptz, now())
      )
      RETURNING id
    `,
    [
      ticket.id,
      ticket.workspaceId,
      ticket.requesterUserId,
      ticket.type,
      ticket.description,
      ticket.status,
      ticket.acknowledgedAt,
      ticket.acknowledgedByUserId,
      ticket.resolvedAt,
      ticket.resolvedByUserId,
      ticket.resolutionNote,
      ticket.version,
      ticket.createdAt,
      ticket.updatedAt,
    ],
  );
  return { state: "inserted", ...inserted };
}

function collectRoleRequestDocuments(db) {
  const documents = new Map();
  for (const source of db.roleRequestDocuments || []) {
    if (canonicalId(source?.id)) documents.set(canonicalId(source.id), source);
  }
  for (const user of db.users || []) {
    for (const source of user.roleRequestDocuments || []) {
      const id = canonicalId(source?.id);
      if (!id) continue;
      documents.set(id, {
        ...source,
        userId: canonicalId(source.userId || user.id),
        organizationId: canonicalId(
          source.organizationId || user.organizationId,
        ),
      });
    }
  }
  return [...documents.values()];
}

async function insertRoleRequestDocument(client, sourceDocument) {
  const document = {
    id: canonicalId(sourceDocument.id),
    userId: canonicalId(sourceDocument.userId),
    organizationId: canonicalId(sourceDocument.organizationId),
    name: canonicalId(sourceDocument.name),
    contentType: canonicalId(sourceDocument.contentType).toLowerCase(),
    byteSize: Number(sourceDocument.byteSize || 0),
    sha256: canonicalId(sourceDocument.sha256).toLowerCase(),
    objectKey: canonicalId(sourceDocument.objectKey),
    storageProvider: canonicalId(sourceDocument.storageProvider),
    uploadedAt: toIso(sourceDocument.uploadedAt),
  };
  if (
    document.objectKey &&
    document.organizationId &&
    document.userId &&
    !isRoleRequestDocumentObjectKeyScoped(
      document.objectKey,
      document.organizationId,
      document.userId,
    )
  ) {
    throw identityImportError(
      "IMPORT_ROLE_REQUEST_DOCUMENT_OBJECT_SCOPE_MISMATCH",
      `Role request document ${document.id || "<missing>"} points outside its account workspace object prefix`,
      {
        documentId: document.id || "",
        organizationId: document.organizationId,
        userId: document.userId,
      },
    );
  }
  if (
    !document.id ||
    !document.userId ||
    !document.organizationId ||
    !document.name ||
    !["application/pdf", "image/jpeg", "image/png"].includes(
      document.contentType,
    ) ||
    !Number.isInteger(document.byteSize) ||
    document.byteSize < 1 ||
    document.byteSize > 10 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(document.sha256) ||
    !document.objectKey ||
    !document.storageProvider ||
    !document.uploadedAt
  ) {
    throw identityImportError(
      "IMPORT_ROLE_REQUEST_DOCUMENT_INVALID",
      `Role request document ${document.id || "<missing>"} is incomplete or predates the SHA-256 contract`,
      { documentId: document.id || "" },
    );
  }
  const existing = await client.query(
    `
      SELECT id, user_id, organization_id, sha256, object_key
      FROM role_request_documents
      WHERE id = $1
      FOR UPDATE
    `,
    [document.id],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    const mismatchFields = [];
    if (canonicalId(row.user_id) !== document.userId) mismatchFields.push("userId");
    if (canonicalId(row.organization_id) !== document.organizationId) mismatchFields.push("organizationId");
    if (canonicalId(row.sha256) !== document.sha256) mismatchFields.push("sha256");
    if (canonicalId(row.object_key) !== document.objectKey) mismatchFields.push("objectKey");
    if (mismatchFields.length > 0) {
      throw identityImportError(
        "IMPORT_ROLE_REQUEST_DOCUMENT_CANONICAL_CONFLICT",
        `Role request document ${document.id} conflicts with canonical identity`,
        { documentId: document.id, mismatchFields },
      );
    }
    return { state: "preserved", rowCount: 0, rows: existing.rows };
  }
  const inserted = await client.query(
    `
      INSERT INTO role_request_documents (
        id, user_id, organization_id, name, content_type, byte_size,
        sha256, object_key, storage_provider, uploaded_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10::timestamptz
      )
      RETURNING id
    `,
    [
      document.id,
      document.userId,
      document.organizationId,
      document.name,
      document.contentType,
      document.byteSize,
      document.sha256,
      document.objectKey,
      document.storageProvider,
      document.uploadedAt,
    ],
  );
  return { state: "inserted", ...inserted };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const dbFile = path.resolve(process.env.DB_FILE || path.join(__dirname, "..", "data", "db.json"));
  if (!fs.existsSync(dbFile)) {
    throw new Error(`Không tìm thấy file dữ liệu JSON: ${dbFile}`);
  }

  // Validate the complete source graph before connecting or applying schema
  // migrations. An invalid import must not leave schema_migrations advanced.
  const db = readJson(dbFile);
  ensureDefaultOrganization(db);
  normalizeLegacyPatientIdentityGraph(db);
  validateAndNormalizeImportGraph(db);

  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await runMigrations(client);

    const counters = {
      servicePackages: createImportCounter(),
      organizations: createImportCounter(),
      workspaceOwners: createImportCounter(),
      users: createImportCounter(),
      memberships: createImportCounter(),
      staffInvitations: createImportCounter(),
      supportTickets: createImportCounter(),
      roleRequestDocuments: createImportCounter(),
      patients: createImportCounter(),
      patientImportBatches: createImportCounter(),
      patientShares: createImportCounter(),
      devices: createImportCounter(),
      deviceClaims: createImportCounter(),
      deviceCommands: createImportCounter(),
      scans: createImportCounter(),
      scanAudioChunks: createImportCounter(),
      scanAudioCompletions: createImportCounter(),
      scanReviews: createImportCounter(),
      clinicalAlerts: createImportCounter(),
      audioFiles: createImportCounter(),
      aiResults: createImportCounter(),
      notifications: createImportCounter(),
      exports: createImportCounter(),
      auditLogs: createImportCounter(),
      storageBuckets: createImportCounter(),
      storageFiles: createImportCounter(),
    };

    await client.query("BEGIN");
    try {
      for (const servicePackage of db.servicePackages || []) {
        recordImportOutcome(counters.servicePackages, await upsertServicePackage(client, servicePackage));
      }

      for (const organization of db.organizations || []) {
        recordImportOutcome(counters.organizations, await upsertOrganization(client, organization));
      }

      for (const user of db.users || []) {
        recordImportOutcome(counters.users, await upsertUser(client, user));
      }

      for (const membership of db.memberships || []) {
        recordImportOutcome(counters.memberships, await upsertMembership(client, membership));
      }

      for (const invitation of db.staffInvitations || []) {
        recordImportOutcome(
          counters.staffInvitations,
          await insertStaffInvitation(client, invitation),
        );
      }

      for (const ticket of db.supportTickets || []) {
        recordImportOutcome(
          counters.supportTickets,
          await insertSupportTicket(client, ticket),
        );
      }

      for (const document of collectRoleRequestDocuments(db)) {
        recordImportOutcome(
          counters.roleRequestDocuments,
          await insertRoleRequestDocument(client, document),
        );
      }

      for (const bucket of db.storageBuckets || []) {
        recordImportOutcome(counters.storageBuckets, await insertStorageBucket(client, bucket));
      }

      for (const file of db.storageFiles || []) {
        recordImportOutcome(counters.storageFiles, await insertStorageFile(client, file));
      }

      for (const organization of db.organizations || []) {
        if (canonicalId(organization.ownerUserId)) {
          recordImportOutcome(counters.workspaceOwners, await applyOrganizationOwner(client, organization));
        }
      }

      for (const patient of db.patients || []) {
        recordImportOutcome(counters.patients, await upsertPatient(client, patient));
      }

      for (const batch of db.patientImportBatches || []) {
        recordImportOutcome(
          counters.patientImportBatches,
          await insertPatientImportBatch(client, batch),
        );
      }

      for (const device of db.devices || []) {
        recordImportOutcome(counters.devices, await upsertDevice(client, device));
      }

      for (const claim of db.deviceClaims || []) {
        recordImportOutcome(counters.deviceClaims, await upsertDeviceClaim(client, claim));
      }

      for (const command of db.deviceCommands || []) {
        recordImportOutcome(counters.deviceCommands, await upsertDeviceCommand(client, command));
      }

      for (const grant of db.doctorPatientAccess || []) {
        recordImportOutcome(counters.patientShares, await upsertDoctorPatientAccess(client, grant));
      }

      for (const scan of db.scans || []) {
        recordImportOutcome(counters.scans, await upsertScan(client, scan));
      }

      const orderedScanAudioChunks = [...(db.scanAudioChunks || [])].sort((left, right) =>
        String(left.scanId || "").localeCompare(String(right.scanId || "")) ||
        Number(left.sequence || 0) - Number(right.sequence || 0));
      for (const chunk of orderedScanAudioChunks) {
        recordImportOutcome(counters.scanAudioChunks, await upsertScanAudioChunk(client, chunk));
      }

      for (const completion of db.scanAudioCompletions || []) {
        recordImportOutcome(
          counters.scanAudioCompletions,
          await upsertScanAudioCompletion(client, completion),
        );
      }

      for (const review of db.scanReviews || []) {
        recordImportOutcome(counters.scanReviews, await upsertScanReview(client, review));
      }

      const orderedClinicalAlerts = [...(db.clinicalAlerts || [])].sort((left, right) =>
        Number(left.occurrenceNumber || 1) - Number(right.occurrenceNumber || 1) ||
        String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
      for (const alert of orderedClinicalAlerts) {
        recordImportOutcome(counters.clinicalAlerts, await upsertClinicalAlert(client, alert));
      }

      for (const audioFile of db.audioFiles || []) {
        recordImportOutcome(counters.audioFiles, await upsertAudioFile(client, audioFile));
      }

      for (const aiResult of db.aiResults || []) {
        recordImportOutcome(counters.aiResults, await upsertAiResult(client, aiResult));
      }

      for (const notification of db.notifications || []) {
        recordImportOutcome(counters.notifications, await upsertNotification(client, notification));
      }

      for (const exportJob of db.exports || []) {
        recordImportOutcome(counters.exports, await insertExportJob(client, exportJob));
      }

      for (const log of db.auditLogs || []) {
        recordImportOutcome(counters.auditLogs, await insertAuditLog(client, log));
      }

      for (const log of db.accessLogs || []) {
        recordImportOutcome(counters.auditLogs, await insertAuditLog(client, {
          id: `legacy_${log.id}`,
          action: log.action || "legacy.access_log",
          ip: log.ip || "",
          userAgent: log.device || "",
          metadata: log,
          createdAt: log.createdAt,
        }));
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    console.log("Migration JSON -> PostgreSQL đã đối soát:");
    for (const [name, outcomeCounts] of Object.entries(counters)) {
      const summary = Object.entries(outcomeCounts)
        .filter(([, count]) => count > 0)
        .map(([state, count]) => `${state}=${count}`)
        .join(", ") || "no_source_rows";
      console.log(`- ${name}: ${summary}`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    if (err.code || err.details) {
      console.error(JSON.stringify({ code: err.code || "IMPORT_FAILED", details: err.details || {} }, null, 2));
    }
    process.exit(1);
  });
}

module.exports = {
  applyOrganizationOwner,
  createImportCounter,
  ensureDefaultOrganization,
  insertExportJob,
  insertPatientImportBatch,
  insertStaffInvitation,
  isRoleRequestDocumentObjectKeyScoped,
  normalizeLegacyPatientIdentityGraph,
  recordImportOutcome,
  runMigrations,
  upsertAiResult,
  upsertAudioFile,
  upsertDevice,
  upsertDeviceClaim,
  upsertDeviceCommand,
  upsertDoctorPatientAccess,
  upsertMembership,
  upsertNotification,
  upsertOrganization,
  upsertPatient,
  upsertScan,
  upsertScanAudioChunk,
  upsertScanAudioCompletion,
  upsertScanReview,
  upsertServicePackage,
  upsertClinicalAlert,
  upsertUser,
  validateAndNormalizeImportGraph,
};
