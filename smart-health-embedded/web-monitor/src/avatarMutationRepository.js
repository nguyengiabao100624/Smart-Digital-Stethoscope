const { sanitizeAuditMetadata } = require("./auditLogContract");

const AVATAR_UPLOAD_OPERATION = "account.avatar.upload";
const AVATAR_DELETE_OPERATION = "account.avatar.delete";
const AVATAR_UPLOAD_ROLLBACK_OPERATION = "account.avatar.upload.rollback";
const AVATAR_UPLOAD_RETIRED_ROLLBACK_OPERATION_PREFIX =
  `${AVATAR_UPLOAD_ROLLBACK_OPERATION}.retired.`;
const AVATAR_UPLOAD_OBJECT_GENERATION_MARKER = "~avatar-generation-";
const AVATAR_UPLOAD_STAGING_LEASE_MILLIS = 15 * 60_000;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function validateAvatarUpload({ buffer, contentType, fileName }) {
  const normalizedContentType = String(contentType || "").toLowerCase();
  const normalizedName = String(fileName || "");
  if (!Buffer.isBuffer(buffer) || buffer.length < 1) {
    throw repositoryError(400, "AVATAR_FILE_EMPTY", "Avatar file is empty");
  }
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw repositoryError(
      413,
      "AVATAR_FILE_TOO_LARGE",
      `Avatar file exceeds the ${MAX_AVATAR_BYTES}-byte limit`,
    );
  }
  if (!AVATAR_CONTENT_TYPES.has(normalizedContentType)) {
    throw repositoryError(
      415,
      "AVATAR_CONTENT_TYPE_UNSUPPORTED",
      "Avatar content type must be JPEG, PNG or WebP",
    );
  }
  if (
    !normalizedName ||
    normalizedName.length > 240 ||
    normalizedName.includes("/") ||
    normalizedName.includes("\\") ||
    normalizedName === "." ||
    normalizedName === ".."
  ) {
    throw repositoryError(400, "AVATAR_FILE_NAME_INVALID", "Avatar file name is invalid");
  }
  const extension = normalizedName.includes(".")
    ? normalizedName.split(".").pop().toLowerCase()
    : "";
  const validExtension =
    (normalizedContentType === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) ||
    (normalizedContentType === "image/png" && extension === "png") ||
    (normalizedContentType === "image/webp" && extension === "webp");
  const magicMatches =
    (normalizedContentType === "image/jpeg" &&
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff) ||
    (normalizedContentType === "image/png" &&
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )) ||
    (normalizedContentType === "image/webp" &&
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP");
  if (!validExtension || !magicMatches) {
    throw repositoryError(
      415,
      "AVATAR_CONTENT_MISMATCH",
      "Avatar extension, declared content type and file signature do not match",
    );
  }
  return {
    name: normalizedName,
    contentType: normalizedContentType,
    type: extension === "jpeg" ? "jpg" : extension,
  };
}

function repositoryError(statusCode, code, message, details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function objectOf(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function toIso(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function toTimeMillis(value, fallback = 0) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function addMillis(iso, millis) {
  return new Date(toTimeMillis(iso, Date.now()) + millis).toISOString();
}

function isAvatarUploadObjectGeneration(objectKey, canonicalObjectKey) {
  const actual = String(objectKey || "");
  const canonical = String(canonicalObjectKey || "");
  return (
    Boolean(canonical) &&
    (actual === canonical ||
      actual.startsWith(`${canonical}${AVATAR_UPLOAD_OBJECT_GENERATION_MARKER}`))
  );
}

function receiptOperationForCleanup(operation) {
  const idempotencyOperation = String(operation?.idempotencyOperation || "");
  if (
    idempotencyOperation === AVATAR_UPLOAD_ROLLBACK_OPERATION ||
    idempotencyOperation.startsWith(
      AVATAR_UPLOAD_RETIRED_ROLLBACK_OPERATION_PREFIX,
    )
  ) {
    return AVATAR_UPLOAD_OPERATION;
  }
  return idempotencyOperation;
}

function aggregateUploadCleanupStatus(operations, fallbackStatus) {
  const relevant = operations.filter((operation) => {
    const idempotencyOperation = String(operation?.idempotencyOperation || "");
    return (
      idempotencyOperation === AVATAR_UPLOAD_OPERATION ||
      idempotencyOperation.startsWith(
        AVATAR_UPLOAD_RETIRED_ROLLBACK_OPERATION_PREFIX,
      )
    );
  });
  if (relevant.some((operation) => operation.cleanupStatus === "dead_letter")) {
    return "dead_letter";
  }
  if (relevant.some((operation) => operation.cleanupStatus === "pending")) {
    return "pending";
  }
  if (relevant.some((operation) => Boolean(operation.cleanupObjectKey))) {
    return "completed";
  }
  return fallbackStatus;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function exactKeys(value, keys) {
  const actual = Object.keys(objectOf(value));
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function normalizeIdempotency(input = {}) {
  const normalized = {
    scope: String(input.scope || ""),
    operation: String(input.operation || ""),
    key: String(input.key || ""),
    fingerprint: String(input.fingerprint || ""),
  };
  if (!normalized.key || normalized.key.length > 160) {
    throw repositoryError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A stable Idempotency-Key is required for avatar mutations",
    );
  }
  if (!normalized.scope || !normalized.operation || !normalized.fingerprint) {
    throw repositoryError(
      400,
      "IDEMPOTENCY_CONTEXT_INVALID",
      "Avatar idempotency scope, operation and fingerprint are required",
    );
  }
  return normalized;
}

function normalizeBaseInput(rawInput = {}, expectedOperation) {
  const input = {
    userId: String(rawInput.userId || ""),
    organizationId: String(rawInput.organizationId || ""),
    authSessionId: String(rawInput.authSessionId || ""),
    operationId: String(rawInput.operationId || ""),
    expectedAvatarFileId: String(rawInput.expectedAvatarFileId || ""),
    idempotency: normalizeIdempotency(rawInput.idempotency),
    audit: clone(rawInput.audit || {}),
  };
  if (
    !input.userId ||
    !input.organizationId ||
    !input.authSessionId ||
    input.authSessionId.length > 160 ||
    input.authSessionId.includes(",") ||
    !input.operationId
  ) {
    throw repositoryError(
      400,
      "AVATAR_OWNER_BINDING_REQUIRED",
      "Avatar mutations require an exact account, workspace, auth session and operation identity",
    );
  }
  if (
    input.idempotency.scope !== input.userId ||
    input.idempotency.operation !== expectedOperation
  ) {
    throw repositoryError(
      403,
      "AVATAR_OWNER_SCOPE_DENIED",
      "Avatar mutation idempotency must be scoped to the authenticated account",
    );
  }
  if (
    String(input.audit.actorUserId || "") !== input.userId ||
    String(input.audit.organizationId || "") !== input.organizationId
  ) {
    throw repositoryError(
      403,
      "AVATAR_AUDIT_SCOPE_DENIED",
      "Avatar audit identity must match the authenticated account and workspace",
    );
  }
  return input;
}

function normalizeAvatar(rawAvatar = {}, input) {
  const avatar = {
    id: String(rawAvatar.id || ""),
    ownerUserId: String(rawAvatar.ownerUserId || ""),
    organizationId: String(rawAvatar.organizationId || ""),
    name: String(rawAvatar.name || ""),
    objectKey: String(rawAvatar.objectKey || ""),
    storageProvider: String(rawAvatar.storageProvider || ""),
    contentType: String(rawAvatar.contentType || "").toLowerCase(),
    type: String(rawAvatar.type || ""),
    byteSize: Number(rawAvatar.byteSize || 0),
    sha256: String(rawAvatar.sha256 || "").toLowerCase(),
    uploadedAt: toIso(rawAvatar.uploadedAt),
  };
  if (
    avatar.ownerUserId !== input.userId ||
    avatar.organizationId !== input.organizationId
  ) {
    throw repositoryError(
      403,
      "AVATAR_OWNER_SCOPE_DENIED",
      "Avatar metadata must remain bound to the authenticated account and workspace",
    );
  }
  const expectedPrefix = `org/${input.organizationId}/avatars/${input.userId}/`;
  if (
    !avatar.id ||
    !avatar.name ||
    !avatar.storageProvider ||
    !AVATAR_CONTENT_TYPES.has(avatar.contentType) ||
    !Number.isInteger(avatar.byteSize) ||
    avatar.byteSize < 1 ||
    avatar.byteSize > MAX_AVATAR_BYTES ||
    !/^[a-f0-9]{64}$/.test(avatar.sha256) ||
    !avatar.uploadedAt ||
    !avatar.objectKey.startsWith(expectedPrefix) ||
    avatar.objectKey.length <= expectedPrefix.length ||
    avatar.objectKey.includes("..") ||
    avatar.objectKey.includes("\\")
  ) {
    throw repositoryError(
      400,
      "AVATAR_METADATA_INVALID",
      "Avatar metadata, content type, size, hash or owner-bound object key is invalid",
    );
  }
  return avatar;
}

function assertFingerprint(existing, idempotency) {
  if (
    existing?.fingerprint &&
    String(existing.fingerprint) !== idempotency.fingerprint
  ) {
    throw repositoryError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency-Key was already used with a different avatar request",
    );
  }
}

function profileFromSqlUser(row = {}) {
  return objectOf(objectOf(row.firebase_claims).profile);
}

function canonicalUserAvatar(user = {}) {
  const profile = user.firebase_claims ? profileFromSqlUser(user) : {};
  return {
    id: String(user.id || ""),
    organizationId: String(user.organizationId || user.organization_id || ""),
    accountStatus: String(user.accountStatus || user.account_status || "active"),
    deletedAt: toIso(user.deletedAt || user.deleted_at),
    avatarFileId: String(user.avatarFileId || profile.avatarFileId || ""),
    avatarUrl: String(user.avatarUrl || profile.avatarUrl || ""),
    avatarStorage: clone(
      objectOf(user.avatarStorage || profile.avatarStorage),
    ),
  };
}

function assertActiveAccountAuthority(user, input) {
  const canonical = canonicalUserAvatar(user || {});
  if (!canonical.id || canonical.id !== input.userId) {
    throw repositoryError(
      404,
      "AVATAR_ACCOUNT_NOT_FOUND",
      "Authenticated account was not found",
    );
  }
  if (
    canonical.deletedAt ||
    canonical.accountStatus.toLowerCase() !== "active"
  ) {
    throw repositoryError(
      403,
      "ACCOUNT_INACTIVE",
      "Inactive accounts cannot mutate or replay avatar operations",
    );
  }
  return canonical;
}

function assertAccountAuthority(user, input) {
  const canonical = assertActiveAccountAuthority(user, input);
  if (canonical.organizationId !== input.organizationId) {
    throw repositoryError(
      403,
      "AVATAR_WORKSPACE_SCOPE_DENIED",
      "Avatar workspace must match the authenticated account",
    );
  }
  return canonical;
}

function assertWorkspaceAuthority(workspace, input) {
  if (
    !workspace ||
    String(workspace.id || "") !== input.organizationId ||
    String(workspace.status || "active").toLowerCase() !== "active" ||
    Boolean(toIso(workspace.deletedAt || workspace.deleted_at))
  ) {
    throw repositoryError(
      403,
      "AVATAR_WORKSPACE_SCOPE_DENIED",
      "Avatar mutation requires the account's active canonical workspace",
    );
  }
}

function assertAuthSessionAuthority(session, input) {
  if (
    !session ||
    String(session.id || "") !== input.authSessionId ||
    String(session.userId || session.user_id || "") !== input.userId ||
    session.revokedAt ||
    session.revoked_at
  ) {
    throw repositoryError(
      409,
      "AUTH_SESSION_REPLACED",
      "The avatar mutation authentication session is no longer current",
    );
  }
}

function publicAvatar(avatar) {
  return {
    fileId: avatar.id,
    ownerUserId: avatar.ownerUserId,
    name: avatar.name,
    contentType: avatar.contentType,
    byteSize: avatar.byteSize,
    sha256: avatar.sha256,
    downloadUrl: "/api/v1/me/avatar",
    uploadedAt: avatar.uploadedAt,
  };
}

function uploadReceipt(input, avatar, cleanupStatus, previousFileId) {
  return {
    avatar: publicAvatar(avatar),
    cleanup: {
      status: cleanupStatus,
      previousFileId: String(previousFileId || ""),
    },
    operationId: input.operationId,
    replayed: false,
  };
}

function deleteReceipt(input, deletedAt, cleanupStatus) {
  return {
    deleted: true,
    avatar: {
      fileId: input.expectedAvatarFileId,
      ownerUserId: input.userId,
      deletedAt,
    },
    cleanup: {
      status: cleanupStatus,
      previousFileId: input.expectedAvatarFileId,
    },
    operationId: input.operationId,
    replayed: false,
  };
}

function readReceipt(responseResource, input, user) {
  const receipt = clone(responseResource || {});
  const isUpload = input.idempotency.operation === AVATAR_UPLOAD_OPERATION;
  const rootKeys = isUpload
    ? ["avatar", "cleanup", "operationId", "replayed"]
    : ["deleted", "avatar", "cleanup", "operationId", "replayed"];
  const avatarKeys = isUpload
    ? [
        "fileId",
        "ownerUserId",
        "name",
        "contentType",
        "byteSize",
        "sha256",
        "downloadUrl",
        "uploadedAt",
      ]
    : ["fileId", "ownerUserId", "deletedAt"];
  if (
    !exactKeys(receipt, rootKeys) ||
    !exactKeys(receipt.avatar, avatarKeys) ||
    !exactKeys(receipt.cleanup, ["status", "previousFileId"]) ||
    String(receipt.operationId || "") !== input.operationId ||
    String(receipt.avatar?.ownerUserId || "") !== input.userId ||
    !["not_required", "pending", "completed", "dead_letter"].includes(
      String(receipt.cleanup?.status || ""),
    )
  ) {
    throw repositoryError(
      409,
      "IDEMPOTENT_AVATAR_RESULT_INVALID",
      "Stored avatar mutation receipt cannot be replayed safely",
    );
  }
  const canonical = canonicalUserAvatar(user);
  if (isUpload) {
    if (
      canonical.avatarFileId !== String(receipt.avatar.fileId || "") ||
      !AVATAR_CONTENT_TYPES.has(String(receipt.avatar.contentType || "")) ||
      !/^[a-f0-9]{64}$/.test(String(receipt.avatar.sha256 || ""))
    ) {
      throw repositoryError(
        409,
        "IDEMPOTENT_AVATAR_RESULT_STALE",
        "The original avatar is no longer the account's active avatar",
      );
    }
  } else if (
    receipt.deleted !== true ||
    canonical.avatarFileId ||
    String(receipt.avatar.fileId || "") !== input.expectedAvatarFileId
  ) {
    throw repositoryError(
      409,
      "IDEMPOTENT_AVATAR_RESULT_STALE",
      "The original avatar deletion is no longer the current account state",
    );
  }
  receipt.replayed = true;
  return receipt;
}

function createAvatarMutationRepository(options) {
  const getDb = options.getDb;
  const saveDb = options.saveDb;
  const createId = options.createId;
  const nowIso = options.nowIso;
  const getPool = options.getPool || (() => null);
  const beforeAuditCommit =
    typeof options.beforeAuditCommit === "function"
      ? options.beforeAuditCommit
      : () => {};
  const uploadStagingLeaseMillis = boundedInteger(
    options.uploadStagingLeaseMillis,
    AVATAR_UPLOAD_STAGING_LEASE_MILLIS,
    1_000,
    60 * 60_000,
  );
  let runtimeMutationTail = Promise.resolve();

  function runtimeDb() {
    const db = getDb();
    db.organizations = arrayOf(db.organizations);
    db.users = arrayOf(db.users);
    db.storageFiles = arrayOf(db.storageFiles);
    db.auditLogs = arrayOf(db.auditLogs);
    db.idempotencyKeys = arrayOf(db.idempotencyKeys);
    db.avatarMutationOperations = arrayOf(db.avatarMutationOperations);
    db.sessions = arrayOf(db.sessions);
    db.authSessions = arrayOf(db.authSessions);
    return db;
  }

  function runRuntimeExclusive(operation) {
    const task = runtimeMutationTail.catch(() => {}).then(operation);
    runtimeMutationTail = task.catch(() => {});
    return task;
  }

  async function withSqlTransaction(operation) {
    const pool = getPool();
    if (!pool) return null;
    const client =
      typeof pool.connect === "function" ? await pool.connect() : pool;
    let commitStarted = false;
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      commitStarted = true;
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (error?.backendCommitted !== true) {
        if (commitStarted) error.backendCommitUnknown = true;
        else error.backendCommitted = false;
      }
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if (client !== pool && typeof client.release === "function") {
        client.release();
      }
    }
  }

  function findRuntimeIdempotency(db, input) {
    const existing = db.idempotencyKeys.find(
      (entry) =>
        entry.scope === input.idempotency.scope &&
        entry.operation === input.idempotency.operation &&
        entry.key === input.idempotency.key,
    );
    if (
      existing &&
      String(existing.authSessionId || "") !== input.authSessionId
    ) {
      throw repositoryError(
        409,
        "AUTH_SESSION_REPLACED",
        "The avatar replay belongs to another authentication session",
      );
    }
    assertFingerprint(existing, input.idempotency);
    return existing || null;
  }

  function createAudit(input, resourceId, cleanupStatus) {
    beforeAuditCommit(input);
    return {
      id: createId("audit"),
      actorUserId: input.userId,
      organizationId: input.organizationId,
      action: String(input.audit.action || input.idempotency.operation),
      resourceType: "storage_file",
      resourceId,
      ip: String(input.audit.ip || ""),
      userAgent: String(input.audit.userAgent || ""),
      metadata: sanitizeAuditMetadata({
        ...(input.audit.metadata || {}),
        operationId: input.operationId,
        cleanupStatus,
      }),
      createdAt: nowIso(),
    };
  }

  function createCleanupOperation(input, values = {}) {
    const createdAt = nowIso();
    const cleanupObjectKey = String(values.cleanupObjectKey || "");
    return {
      id: input.operationId,
      userId: input.userId,
      organizationId: input.organizationId,
      authSessionId: input.authSessionId,
      mutationType:
        input.idempotency.operation === AVATAR_UPLOAD_OPERATION
          ? "upload"
          : "delete",
      cleanupKind: String(values.cleanupKind || "previous_avatar"),
      idempotencyOperation: input.idempotency.operation,
      idempotencyKey: input.idempotency.key,
      requestFingerprint: input.idempotency.fingerprint,
      activeFileId: String(values.activeFileId || ""),
      previousFileId: String(values.previousFileId || ""),
      cleanupObjectKey,
      cleanupStatus: cleanupObjectKey ? "pending" : "not_required",
      cleanupAttempts: 0,
      lastErrorCode: "",
      nextAttemptAt: cleanupObjectKey ? createdAt : "",
      leaseOwner: "",
      leaseExpiresAt: "",
      deadLetteredAt: "",
      createdAt,
      updatedAt: createdAt,
      completedAt: cleanupObjectKey ? "" : createdAt,
    };
  }

  function createUploadRollbackStage(input, avatar) {
    const stagedInput = {
      ...input,
      operationId: `${input.operationId}_rollback`,
      idempotency: {
        ...input.idempotency,
        operation: AVATAR_UPLOAD_ROLLBACK_OPERATION,
      },
    };
    const operation = createCleanupOperation(stagedInput, {
      cleanupKind: "staged_rollback",
      cleanupObjectKey: avatar.objectKey,
    });
    operation.mutationType = "rollback";
    operation.leaseOwner = `avatar-upload:${input.operationId}`;
    operation.leaseExpiresAt = addMillis(
      operation.createdAt,
      uploadStagingLeaseMillis,
    );
    return operation;
  }

  function assertUploadRollbackStage(existing, expected) {
    if (!existing) return;
    if (existing.authSessionId !== expected.authSessionId) {
      throw repositoryError(
        409,
        "AUTH_SESSION_REPLACED",
        "The staged avatar upload belongs to another authentication session",
      );
    }
    if (
      existing.id !== expected.id ||
      existing.userId !== expected.userId ||
      existing.organizationId !== expected.organizationId ||
      existing.mutationType !== "rollback" ||
      existing.cleanupKind !== "staged_rollback" ||
      existing.idempotencyOperation !== AVATAR_UPLOAD_ROLLBACK_OPERATION ||
      existing.idempotencyKey !== expected.idempotencyKey ||
      existing.requestFingerprint !== expected.requestFingerprint ||
      !isAvatarUploadObjectGeneration(
        existing.cleanupObjectKey,
        expected.cleanupObjectKey,
      )
    ) {
      throw repositoryError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency-Key is already bound to another avatar upload cleanup stage",
      );
    }
    if (existing.cleanupStatus === "dead_letter") {
      throw repositoryError(
        409,
        "AVATAR_UPLOAD_STAGE_MANUAL_SUPPORT_REQUIRED",
        "Avatar upload cleanup requires manual support before this intent can be retried",
      );
    }
  }

  function createUploadGeneration(existing, expected) {
    if (!existing || existing.cleanupStatus !== "pending") {
      return { expected, retired: null };
    }
    const token = String(createId("avatar_generation"))
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 80);
    if (!token) {
      throw repositoryError(
        500,
        "AVATAR_UPLOAD_GENERATION_INVALID",
        "Avatar upload storage generation could not be created",
      );
    }
    const updatedAt = nowIso();
    const retired = {
      ...clone(existing),
      id: `${existing.id}_retired_${token}`,
      idempotencyOperation:
        `${AVATAR_UPLOAD_RETIRED_ROLLBACK_OPERATION_PREFIX}${token}`,
      cleanupStatus: "pending",
      lastErrorCode: "",
      nextAttemptAt: updatedAt,
      deadLetteredAt: "",
      updatedAt,
      completedAt: "",
    };
    return {
      expected: {
        ...expected,
        cleanupObjectKey:
          `${expected.cleanupObjectKey}` +
          `${AVATAR_UPLOAD_OBJECT_GENERATION_MARKER}${token}`,
      },
      retired,
    };
  }

  function assertUploadRollbackStageRearmable(existing, expected) {
    assertUploadRollbackStage(existing, expected);
    if (
      !existing ||
      existing.cleanupStatus !== "pending" ||
      !existing.leaseOwner
    ) {
      return;
    }
    const leaseIsActive =
      toTimeMillis(existing.leaseExpiresAt, 0) >
      toTimeMillis(nowIso(), Date.now());
    if (!leaseIsActive) return;
    if (existing.leaseOwner.startsWith("avatar-upload:")) {
      throw repositoryError(
        409,
        "AVATAR_UPLOAD_STAGE_IN_PROGRESS",
        "The same avatar upload intent is already in progress",
      );
    }
    throw repositoryError(
      409,
      "AVATAR_UPLOAD_STAGE_CLEANUP_IN_PROGRESS",
      "The previous avatar upload attempt is currently being cleaned up",
    );
  }

  function assertUploadRollbackStageCommit(existing, expected) {
    assertUploadRollbackStage(existing, expected);
    if (!existing) return;
    const leaseIsActive =
      toTimeMillis(existing.leaseExpiresAt, 0) >
      toTimeMillis(nowIso(), Date.now());
    if (
      existing.cleanupObjectKey !== expected.cleanupObjectKey ||
      existing.cleanupStatus !== "pending" ||
      existing.leaseOwner !== expected.leaseOwner ||
      !leaseIsActive
    ) {
      throw repositoryError(
        409,
        "AVATAR_UPLOAD_STAGE_FENCE_LOST",
        "Avatar upload no longer owns the exact staged provider generation",
      );
    }
  }

  function rearmRuntimeUploadRollbackStage(operation, expected) {
    if (!operation || !["pending", "completed"].includes(operation.cleanupStatus)) {
      return;
    }
    operation.cleanupStatus = "pending";
    operation.cleanupAttempts = 0;
    operation.lastErrorCode = "";
    operation.cleanupObjectKey = expected.cleanupObjectKey;
    operation.nextAttemptAt = expected.nextAttemptAt;
    operation.leaseOwner = expected.leaseOwner;
    operation.leaseExpiresAt = expected.leaseExpiresAt;
    operation.deadLetteredAt = "";
    operation.completedAt = "";
    operation.updatedAt = nowIso();
  }

  function completeRuntimeUploadRollbackStage(operation) {
    if (!operation || operation.cleanupStatus !== "pending") return;
    const completedAt = nowIso();
    operation.cleanupStatus = "completed";
    operation.lastErrorCode = "";
    operation.nextAttemptAt = "";
    operation.leaseOwner = "";
    operation.leaseExpiresAt = "";
    operation.deadLetteredAt = "";
    operation.completedAt = completedAt;
    operation.updatedAt = completedAt;
  }

  function syncRuntimeIdempotency(db, input, resourceId, receipt, status) {
    db.idempotencyKeys.unshift({
      id: createId("idem"),
      scope: input.idempotency.scope,
      operation: input.idempotency.operation,
      key: input.idempotency.key,
      fingerprint: input.idempotency.fingerprint,
      authSessionId: input.authSessionId,
      resourceType: "account_avatar",
      resourceId,
      responseStatus: status,
      responseResource: clone(receipt),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastSeenAt: nowIso(),
    });
    db.idempotencyKeys = db.idempotencyKeys.slice(0, 2000);
  }

  function runtimeUploadCleanupStatus(
    db,
    userId,
    idempotencyKey,
    fallbackStatus,
    additionalOperations = [],
  ) {
    return aggregateUploadCleanupStatus(
      [...db.avatarMutationOperations, ...additionalOperations].filter(
        (candidate) =>
          candidate.userId === userId &&
          candidate.idempotencyKey === idempotencyKey,
      ),
      fallbackStatus,
    );
  }

  function updateRuntimeReceiptCleanupStatus(db, operation, status) {
    const receiptOperation = receiptOperationForCleanup(operation);
    const resolvedStatus = receiptOperation === AVATAR_UPLOAD_OPERATION
      ? runtimeUploadCleanupStatus(
          db,
          operation.userId,
          operation.idempotencyKey,
          status,
        )
      : status;
    const idempotency = db.idempotencyKeys.find(
      (entry) =>
        entry.scope === operation.userId &&
        entry.operation === receiptOperation &&
        entry.key === operation.idempotencyKey,
    );
    if (idempotency?.responseResource?.cleanup) {
      idempotency.responseResource.cleanup.status = resolvedStatus;
      idempotency.updatedAt = nowIso();
    }
  }

  function runtimeAuthority(db, input) {
    const user = db.users.find((item) => String(item.id || "") === input.userId);
    const canonical = assertAccountAuthority(user, input);
    assertWorkspaceAuthority(
      db.organizations.find(
        (item) => String(item.id || "") === input.organizationId,
      ),
      input,
    );
    const demoSession = db.sessions.find(
      (session) =>
        String(session.id || "") === input.authSessionId &&
        String(session.userId || "") === input.userId,
    );
    const firebaseSession = db.authSessions.find(
      (session) =>
        String(session.id || "") === input.authSessionId &&
        String(session.userId || "") === input.userId,
    );
    const session = demoSession || firebaseSession;
    assertAuthSessionAuthority(session, input);
    if (firebaseSession) {
      const binding = db.authSessions.filter(
        (candidate) =>
          String(candidate.userId || "") === input.userId &&
          String(candidate.sessionKey || "") === String(firebaseSession.sessionKey || ""),
      );
      if (
        binding.length < 1 ||
        binding.some((candidate) => Boolean(candidate.revokedAt))
      ) {
        throw repositoryError(
          409,
          "AUTH_SESSION_REPLACED",
          "The avatar mutation authentication binding has been revoked",
        );
      }
    }
    return { user, canonical };
  }

  function replayFromRuntime(db, input, user) {
    const existing = findRuntimeIdempotency(db, input);
    if (!existing) return null;
    existing.lastSeenAt = nowIso();
    const receipt = readReceipt(existing.responseResource, input, user);
    const cleanupOperation = db.avatarMutationOperations.find(
      (operation) => operation.id === input.operationId,
    );
    return {
      receipt,
      cleanupOperation: cleanupOperation ? clone(cleanupOperation) : null,
      replayed: true,
    };
  }

  async function assertSqlAuthority(client, input) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `account-avatar:${input.userId}`,
    ]);
    const selected = await client.query(
      `
        SELECT id, organization_id, account_status, firebase_claims
        FROM users
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [input.userId],
    );
    const user = selected.rows[0] || null;
    assertAccountAuthority(user, input);
    const workspace = await client.query(
      "SELECT id, status, deleted_at FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
      [input.organizationId],
    );
    assertWorkspaceAuthority(workspace.rows[0] || null, input);
    const runtimeDemoSession = runtimeDb().sessions.find(
      (session) =>
        String(session.id || "") === input.authSessionId &&
        String(session.userId || "") === input.userId,
    );
    if (runtimeDemoSession) {
      assertAuthSessionAuthority(runtimeDemoSession, input);
      return user;
    }
    const selectedSession = await client.query(
      `
        SELECT id, user_id, refresh_token_hash, revoked_at
        FROM auth_sessions
        WHERE id = $1 AND user_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [input.authSessionId, input.userId],
    );
    const authSession = selectedSession.rows[0] || null;
    assertAuthSessionAuthority(authSession, input);
    const bindingHash = String(authSession.refresh_token_hash || "");
    const binding = await client.query(
      `
        SELECT id, user_id, revoked_at
        FROM auth_sessions
        WHERE user_id = $1 AND refresh_token_hash = $2
        FOR UPDATE
      `,
      [input.userId, bindingHash],
    );
    if (
      binding.rows.length < 1 ||
      binding.rows.some((session) => Boolean(session.revoked_at))
    ) {
      throw repositoryError(
        409,
        "AUTH_SESSION_REPLACED",
        "The avatar mutation authentication binding has been revoked",
      );
    }
    return user;
  }

  async function findSqlIdempotency(client, input, user) {
    const result = await client.query(
      `
        SELECT fingerprint, auth_session_id, response_status, response_json
        FROM mutation_idempotency
        WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
        LIMIT 1
      `,
      [
        input.idempotency.scope,
        input.idempotency.operation,
        input.idempotency.key,
      ],
    );
    const existing = result.rows[0] || null;
    if (
      existing &&
      String(existing.auth_session_id || "") !== input.authSessionId
    ) {
      throw repositoryError(
        409,
        "AUTH_SESSION_REPLACED",
        "The avatar replay belongs to another authentication session",
      );
    }
    assertFingerprint(existing, input.idempotency);
    if (!existing) return null;
    const cleanupResult = await client.query(
      "SELECT * FROM avatar_mutation_operations WHERE id = $1 LIMIT 1",
      [input.operationId],
    );
    return {
      receipt: readReceipt(existing.response_json, input, user),
      cleanupOperation: rowToCleanupOperation(cleanupResult.rows[0]),
      replayed: true,
    };
  }

  function rowToCleanupOperation(row) {
    if (!row) return null;
    return {
      id: row.id || "",
      userId: row.user_id || "",
      organizationId: row.organization_id || "",
      authSessionId: row.auth_session_id || "",
      mutationType: row.mutation_type || "",
      cleanupKind: row.cleanup_kind || "previous_avatar",
      idempotencyOperation: row.idempotency_operation || "",
      idempotencyKey: row.idempotency_key || "",
      requestFingerprint: row.request_fingerprint || "",
      activeFileId: row.active_file_id || "",
      previousFileId: row.previous_file_id || "",
      cleanupObjectKey: row.cleanup_object_key || "",
      cleanupStatus: row.cleanup_status || "pending",
      cleanupAttempts: Number(row.cleanup_attempts || 0),
      lastErrorCode: row.last_error_code || "",
      nextAttemptAt: toIso(row.cleanup_next_attempt_at),
      leaseOwner: row.cleanup_lease_owner || "",
      leaseExpiresAt: toIso(row.cleanup_lease_expires_at),
      deadLetteredAt: toIso(row.dead_lettered_at),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
      completedAt: toIso(row.completed_at),
    };
  }

  async function insertSqlAudit(client, audit) {
    await client.query(
      `
        INSERT INTO audit_logs (
          id, actor_user_id, organization_id, action, resource_type,
          resource_id, ip, user_agent, metadata, created_at
        )
        VALUES (
          $1, NULLIF($2, ''), NULLIF($3, ''), $4, $5,
          $6, NULLIF($7, '')::inet, $8, $9::jsonb, $10::timestamptz
        )
      `,
      [
        audit.id,
        audit.actorUserId,
        audit.organizationId,
        audit.action,
        audit.resourceType,
        audit.resourceId,
        audit.ip,
        audit.userAgent,
        JSON.stringify(audit.metadata || {}),
        audit.createdAt,
      ],
    );
  }

  async function insertSqlIdempotency(client, input, resourceId, receipt, status) {
    await client.query(
      `
        INSERT INTO mutation_idempotency (
          id, scope, operation, idempotency_key, fingerprint,
          auth_session_id, resource_type, resource_id, response_status, response_json,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, 'account_avatar', $7, $8, $9::jsonb,
          now(), now()
        )
      `,
      [
        createId("idem"),
        input.idempotency.scope,
        input.idempotency.operation,
        input.idempotency.key,
        input.idempotency.fingerprint,
        input.authSessionId,
        resourceId,
        status,
        JSON.stringify(receipt),
      ],
    );
  }

  async function sqlUploadCleanupStatus(
    client,
    userId,
    idempotencyKey,
    fallbackStatus,
  ) {
    const selected = await client.query(
      `
        SELECT idempotency_operation, cleanup_status, cleanup_object_key
        FROM avatar_mutation_operations
        WHERE user_id = $1
          AND idempotency_key = $2
          AND (
            idempotency_operation = $3
            OR idempotency_operation LIKE $4
          )
        FOR UPDATE
      `,
      [
        userId,
        idempotencyKey,
        AVATAR_UPLOAD_OPERATION,
        `${AVATAR_UPLOAD_RETIRED_ROLLBACK_OPERATION_PREFIX}%`,
      ],
    );
    return aggregateUploadCleanupStatus(
      selected.rows.map((row) => ({
        idempotencyOperation: row.idempotency_operation,
        cleanupStatus: row.cleanup_status,
        cleanupObjectKey: row.cleanup_object_key || "",
      })),
      fallbackStatus,
    );
  }

  async function updateSqlReceiptCleanupStatus(
    client,
    operation,
    fallbackStatus,
  ) {
    const receiptOperation = receiptOperationForCleanup(operation);
    const status = receiptOperation === AVATAR_UPLOAD_OPERATION
      ? await sqlUploadCleanupStatus(
          client,
          operation.userId,
          operation.idempotencyKey,
          fallbackStatus,
        )
      : fallbackStatus;
    await client.query(
      `
        UPDATE mutation_idempotency
        SET response_json = jsonb_set(
              response_json,
              '{cleanup,status}',
              to_jsonb($4::text),
              true
            ),
            updated_at = now()
        WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
      `,
      [operation.userId, receiptOperation, operation.idempotencyKey, status],
    );
  }

  async function insertSqlCleanupOperation(client, operation) {
    await client.query(
      `
        INSERT INTO avatar_mutation_operations (
          id, user_id, organization_id, auth_session_id,
          mutation_type, cleanup_kind, idempotency_operation,
          idempotency_key, request_fingerprint, active_file_id,
          previous_file_id, cleanup_object_key, cleanup_status,
          cleanup_attempts, last_error_code, cleanup_next_attempt_at,
          cleanup_lease_owner, cleanup_lease_expires_at, dead_lettered_at,
          created_at, updated_at, completed_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, NULLIF($10, ''),
          NULLIF($11, ''), NULLIF($12, ''), $13,
          $14, NULLIF($15, ''), NULLIF($16, '')::timestamptz,
          NULLIF($17, ''), NULLIF($18, '')::timestamptz,
          NULLIF($19, '')::timestamptz,
          $20::timestamptz, $21::timestamptz, NULLIF($22, '')::timestamptz
        )
      `,
      [
        operation.id,
        operation.userId,
        operation.organizationId,
        operation.authSessionId,
        operation.mutationType,
        operation.cleanupKind,
        operation.idempotencyOperation,
        operation.idempotencyKey,
        operation.requestFingerprint,
        operation.activeFileId,
        operation.previousFileId,
        operation.cleanupObjectKey,
        operation.cleanupStatus,
        operation.cleanupAttempts,
        operation.lastErrorCode,
        operation.nextAttemptAt,
        operation.leaseOwner,
        operation.leaseExpiresAt,
        operation.deadLetteredAt,
        operation.createdAt,
        operation.updatedAt,
        operation.completedAt,
      ],
    );
  }

  async function findReplay(rawInput = {}) {
    const operation = String(rawInput.idempotency?.operation || "");
    if (![AVATAR_UPLOAD_OPERATION, AVATAR_DELETE_OPERATION].includes(operation)) {
      throw repositoryError(400, "AVATAR_OPERATION_INVALID", "Avatar operation is invalid");
    }
    const input = normalizeBaseInput(rawInput, operation);
    if (!getPool()) {
      const db = runtimeDb();
      const { user } = runtimeAuthority(db, input);
      return replayFromRuntime(db, input, user);
    }
    return withSqlTransaction(async (client) => {
      const user = await assertSqlAuthority(client, input);
      return findSqlIdempotency(client, input, user);
    });
  }

  async function stageUploadCleanup(rawInput = {}) {
    const input = normalizeBaseInput(rawInput, AVATAR_UPLOAD_OPERATION);
    const avatar = normalizeAvatar(rawInput.avatar, input);
    const expected = createUploadRollbackStage(input, avatar);
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const { user } = runtimeAuthority(db, input);
          const replay = replayFromRuntime(db, input, user);
          if (replay) return replay;
          const existing = db.avatarMutationOperations.find(
            (operation) =>
              operation.id === expected.id ||
              (operation.userId === expected.userId &&
                operation.idempotencyOperation === expected.idempotencyOperation &&
                operation.idempotencyKey === expected.idempotencyKey),
          );
          assertUploadRollbackStageRearmable(existing, expected);
          if (existing) {
            const generation = createUploadGeneration(existing, expected);
            if (generation.retired) {
              db.avatarMutationOperations.unshift(generation.retired);
            }
            rearmRuntimeUploadRollbackStage(existing, generation.expected);
            await saveDb();
            return { cleanupOperation: clone(existing), replayed: false };
          }
          db.avatarMutationOperations.unshift(expected);
          await saveDb();
          return { cleanupOperation: clone(expected), replayed: false };
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          throw error;
        }
      });
    }
    return withSqlTransaction(async (client) => {
      const user = await assertSqlAuthority(client, input);
      const replay = await findSqlIdempotency(client, input, user);
      if (replay) return replay;
      const selected = await client.query(
        `
          SELECT *
          FROM avatar_mutation_operations
          WHERE id = $1
             OR (
               user_id = $2
               AND idempotency_operation = $3
               AND idempotency_key = $4
             )
          LIMIT 1
          FOR UPDATE
        `,
        [
          expected.id,
          expected.userId,
          expected.idempotencyOperation,
          expected.idempotencyKey,
        ],
      );
      const existing = rowToCleanupOperation(selected.rows[0]);
      assertUploadRollbackStageRearmable(existing, expected);
      if (existing) {
        const generation = createUploadGeneration(existing, expected);
        if (generation.retired) {
          await insertSqlCleanupOperation(client, generation.retired);
        }
        const rearmed = await client.query(
          `
            UPDATE avatar_mutation_operations
            SET cleanup_status = 'pending',
                cleanup_attempts = 0,
                last_error_code = NULL,
                cleanup_object_key = $2,
                cleanup_next_attempt_at = $3::timestamptz,
                cleanup_lease_owner = $4,
                cleanup_lease_expires_at = $5::timestamptz,
                dead_lettered_at = NULL,
                completed_at = NULL,
                updated_at = now()
            WHERE id = $1 AND cleanup_status IN ('pending', 'completed')
            RETURNING *
          `,
            [
              existing.id,
              generation.expected.cleanupObjectKey,
              generation.expected.nextAttemptAt,
              generation.expected.leaseOwner,
              generation.expected.leaseExpiresAt,
            ],
        );
        return {
          cleanupOperation: rowToCleanupOperation(rearmed.rows[0]),
          replayed: false,
        };
      }
      await insertSqlCleanupOperation(client, expected);
      return { cleanupOperation: expected, replayed: false };
    });
  }

  async function saveUploadWithAudit(rawInput = {}) {
    const input = normalizeBaseInput(rawInput, AVATAR_UPLOAD_OPERATION);
    const avatar = normalizeAvatar(rawInput.avatar, input);
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const { user, canonical } = runtimeAuthority(db, input);
          const replay = replayFromRuntime(db, input, user);
          if (replay) return replay;
          const expectedStage = createUploadRollbackStage(input, avatar);
          const rollbackStage = db.avatarMutationOperations.find(
            (operation) => operation.id === expectedStage.id,
          );
          assertUploadRollbackStageCommit(rollbackStage, expectedStage);
          if (
            db.storageFiles.some(
              (file) =>
                (file.id === avatar.id || file.objectKey === avatar.objectKey) &&
                (file.status || "active") === "active",
            )
          ) {
            throw repositoryError(
              409,
              "AVATAR_STORAGE_COLLISION",
              "Avatar storage identity already belongs to another mutation",
            );
          }
          const previousFileId = canonical.avatarFileId;
          const previousObjectKey = String(canonical.avatarStorage.objectKey || "");
          const cleanupOperation = createCleanupOperation(input, {
            activeFileId: avatar.id,
            previousFileId,
            cleanupObjectKey:
              previousObjectKey && previousObjectKey !== avatar.objectKey
                ? previousObjectKey
                : "",
          });
          const receipt = uploadReceipt(
            input,
            avatar,
            runtimeUploadCleanupStatus(
              db,
              input.userId,
              input.idempotency.key,
              cleanupOperation.cleanupStatus,
              [cleanupOperation],
            ),
            previousFileId,
          );
          if (previousFileId) {
            const previous = db.storageFiles.find((file) => file.id === previousFileId);
            if (previous) {
              previous.status = "deleted";
              previous.deletedAt = nowIso();
              previous.deletedByUserId = input.userId;
              previous.updatedAt = previous.deletedAt;
            }
          }
          db.storageFiles.unshift({
            id: avatar.id,
            organizationId: avatar.organizationId,
            bucket: "avatars",
            name: avatar.name,
            objectKey: avatar.objectKey,
            storageProvider: avatar.storageProvider,
            contentType: avatar.contentType,
            type: avatar.type,
            byteSize: avatar.byteSize,
            checksum: avatar.sha256,
            sha256: avatar.sha256,
            firmwareVersion: "",
            tags: ["avatar", "account"],
            uploader: input.userId,
            createdByUserId: input.userId,
            status: "active",
            createdAt: avatar.uploadedAt,
            updatedAt: avatar.uploadedAt,
          });
          user.avatarFileId = avatar.id;
          user.avatarUrl = "/api/v1/me/avatar";
          user.avatarStorage = {
            objectKey: avatar.objectKey,
            storageProvider: avatar.storageProvider,
            contentType: avatar.contentType,
            name: avatar.name,
            byteSize: avatar.byteSize,
            checksum: avatar.sha256,
            uploadedAt: avatar.uploadedAt,
          };
          user.updatedAt = nowIso();
          const auditLog = createAudit(input, avatar.id, cleanupOperation.cleanupStatus);
          // The provider write happens before this JSON transaction. Re-read the
          // exact session at the final commit fence so a same-account re-login
          // cannot let a revoked request publish a late receipt.
          runtimeAuthority(db, input);
          db.auditLogs.unshift(auditLog);
          completeRuntimeUploadRollbackStage(rollbackStage);
          db.avatarMutationOperations.unshift(cleanupOperation);
          syncRuntimeIdempotency(db, input, avatar.id, receipt, 201);
          await saveDb();
          return {
            receipt: clone(receipt),
            cleanupOperation: clone(cleanupOperation),
            replayed: false,
            auditLog,
          };
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          if (error?.backendCommitted !== true) error.backendCommitted = false;
          throw error;
        }
      });
    }

    const result = await withSqlTransaction(async (client) => {
      const sqlUser = await assertSqlAuthority(client, input);
      const replay = await findSqlIdempotency(client, input, sqlUser);
      if (replay) return replay;
      const expectedStage = createUploadRollbackStage(input, avatar);
      const stagedResult = await client.query(
        "SELECT * FROM avatar_mutation_operations WHERE id = $1 LIMIT 1 FOR UPDATE",
        [expectedStage.id],
      );
      const rollbackStage = rowToCleanupOperation(stagedResult.rows[0]);
      assertUploadRollbackStageCommit(rollbackStage, expectedStage);
      const canonical = canonicalUserAvatar(sqlUser);
      const collision = await client.query(
        "SELECT id FROM storage_files WHERE (id = $1 OR object_key = $2) AND status = 'active' LIMIT 1 FOR UPDATE",
        [avatar.id, avatar.objectKey],
      );
      if (collision.rows[0]) {
        throw repositoryError(409, "AVATAR_STORAGE_COLLISION", "Avatar storage identity already exists");
      }
      const previousFileId = canonical.avatarFileId;
      const previousObjectKey = String(canonical.avatarStorage.objectKey || "");
      const cleanupOperation = createCleanupOperation(input, {
        activeFileId: avatar.id,
        previousFileId,
        cleanupObjectKey:
          previousObjectKey && previousObjectKey !== avatar.objectKey
            ? previousObjectKey
            : "",
      });
      const receipt = uploadReceipt(
        input,
        avatar,
        await sqlUploadCleanupStatus(
          client,
          input.userId,
          input.idempotency.key,
          cleanupOperation.cleanupStatus,
        ),
        previousFileId,
      );
      if (previousFileId) {
        await client.query(
          `UPDATE storage_files
           SET status = 'deleted', deleted_at = now(), deleted_by_user_id = $2, updated_at = now()
           WHERE id = $1 AND status = 'active'`,
          [previousFileId, input.userId],
        );
      }
      await client.query(
        `
          INSERT INTO storage_files (
            id, organization_id, bucket_id, name, object_key, storage_provider,
            content_type, file_type, byte_size, checksum_sha256, firmware_version,
            tags, uploader, created_by_user_id, status, created_at, updated_at
          )
          VALUES (
            $1, $2, 'avatars', $3, $4, $5,
            $6, $7, $8, $9, '',
            '["avatar","account"]'::jsonb, $10, $10, 'active', $11::timestamptz, $11::timestamptz
          )
        `,
        [
          avatar.id,
          avatar.organizationId,
          avatar.name,
          avatar.objectKey,
          avatar.storageProvider,
          avatar.contentType,
          avatar.type,
          avatar.byteSize,
          avatar.sha256,
          input.userId,
          avatar.uploadedAt,
        ],
      );
      const avatarStorage = {
        objectKey: avatar.objectKey,
        storageProvider: avatar.storageProvider,
        contentType: avatar.contentType,
        name: avatar.name,
        byteSize: avatar.byteSize,
        checksum: avatar.sha256,
        uploadedAt: avatar.uploadedAt,
      };
      await client.query(
        `
          UPDATE users
          SET firebase_claims = jsonb_set(
                COALESCE(firebase_claims, '{}'::jsonb),
                '{profile}',
                COALESCE(firebase_claims->'profile', '{}'::jsonb) || $2::jsonb,
                true
              ),
              updated_at = now()
          WHERE id = $1
        `,
        [
          input.userId,
          JSON.stringify({
            avatarFileId: avatar.id,
            avatarUrl: "/api/v1/me/avatar",
            avatarStorage,
          }),
        ],
      );
      const auditLog = createAudit(input, avatar.id, cleanupOperation.cleanupStatus);
      await insertSqlAudit(client, auditLog);
      if (rollbackStage) {
        await client.query(
          `
            UPDATE avatar_mutation_operations
            SET cleanup_status = 'completed',
                last_error_code = NULL,
                cleanup_next_attempt_at = NULL,
                cleanup_lease_owner = NULL,
                cleanup_lease_expires_at = NULL,
                dead_lettered_at = NULL,
                completed_at = now(),
                updated_at = now()
            WHERE id = $1
              AND user_id = $2
              AND cleanup_status = 'pending'
          `,
          [rollbackStage.id, rollbackStage.userId],
        );
      }
      await insertSqlCleanupOperation(client, cleanupOperation);
      await insertSqlIdempotency(client, input, avatar.id, receipt, 201);
      return {
        receipt,
        cleanupOperation,
        replayed: false,
        auditLog,
      };
    });
    if (!result.replayed) {
      try {
        await hydrate();
        await saveDb();
      } catch (error) {
        error.backendCommitted = true;
        throw error;
      }
    }
    return result;
  }

  async function deleteWithAudit(rawInput = {}) {
    const input = normalizeBaseInput(rawInput, AVATAR_DELETE_OPERATION);
    if (!input.expectedAvatarFileId) {
      throw repositoryError(
        400,
        "AVATAR_PRECONDITION_REQUIRED",
        "Avatar deletion requires the exact active avatar file identity",
      );
    }
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const { user, canonical } = runtimeAuthority(db, input);
          const replay = replayFromRuntime(db, input, user);
          if (replay) return replay;
          if (!canonical.avatarFileId) {
            throw repositoryError(404, "AVATAR_NOT_FOUND", "Account does not have an active avatar");
          }
          if (canonical.avatarFileId !== input.expectedAvatarFileId) {
            throw repositoryError(
              409,
              "AVATAR_PRECONDITION_FAILED",
              "The active avatar changed before deletion was committed",
            );
          }
          const cleanupObjectKey = String(canonical.avatarStorage.objectKey || "");
          const cleanupOperation = createCleanupOperation(input, {
            previousFileId: canonical.avatarFileId,
            cleanupObjectKey,
          });
          const deletedAt = nowIso();
          const receipt = deleteReceipt(input, deletedAt, cleanupOperation.cleanupStatus);
          const previous = db.storageFiles.find(
            (file) => file.id === canonical.avatarFileId,
          );
          if (previous) {
            previous.status = "deleted";
            previous.deletedAt = deletedAt;
            previous.deletedByUserId = input.userId;
            previous.updatedAt = deletedAt;
          }
          user.avatarFileId = "";
          user.avatarUrl = "";
          user.avatarStorage = {};
          user.updatedAt = deletedAt;
          const auditLog = createAudit(
            input,
            input.expectedAvatarFileId,
            cleanupOperation.cleanupStatus,
          );
          runtimeAuthority(db, input);
          db.auditLogs.unshift(auditLog);
          db.avatarMutationOperations.unshift(cleanupOperation);
          syncRuntimeIdempotency(
            db,
            input,
            input.expectedAvatarFileId,
            receipt,
            200,
          );
          await saveDb();
          return {
            receipt: clone(receipt),
            cleanupOperation: clone(cleanupOperation),
            replayed: false,
            auditLog,
          };
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          if (error?.backendCommitted !== true) error.backendCommitted = false;
          throw error;
        }
      });
    }

    const result = await withSqlTransaction(async (client) => {
      const sqlUser = await assertSqlAuthority(client, input);
      const replay = await findSqlIdempotency(client, input, sqlUser);
      if (replay) return replay;
      const canonical = canonicalUserAvatar(sqlUser);
      if (!canonical.avatarFileId) {
        throw repositoryError(404, "AVATAR_NOT_FOUND", "Account does not have an active avatar");
      }
      if (canonical.avatarFileId !== input.expectedAvatarFileId) {
        throw repositoryError(
          409,
          "AVATAR_PRECONDITION_FAILED",
          "The active avatar changed before deletion was committed",
        );
      }
      const cleanupOperation = createCleanupOperation(input, {
        previousFileId: canonical.avatarFileId,
        cleanupObjectKey: String(canonical.avatarStorage.objectKey || ""),
      });
      const deletedAt = nowIso();
      const receipt = deleteReceipt(input, deletedAt, cleanupOperation.cleanupStatus);
      await client.query(
        `UPDATE storage_files
         SET status = 'deleted', deleted_at = $2::timestamptz,
             deleted_by_user_id = $3, updated_at = $2::timestamptz
         WHERE id = $1 AND status = 'active'`,
        [canonical.avatarFileId, deletedAt, input.userId],
      );
      await client.query(
        `
          UPDATE users
          SET firebase_claims = jsonb_set(
                COALESCE(firebase_claims, '{}'::jsonb),
                '{profile}',
                COALESCE(firebase_claims->'profile', '{}'::jsonb) ||
                  '{"avatarFileId":"","avatarUrl":"","avatarStorage":{}}'::jsonb,
                true
              ),
              updated_at = now()
          WHERE id = $1
        `,
        [input.userId],
      );
      const auditLog = createAudit(
        input,
        canonical.avatarFileId,
        cleanupOperation.cleanupStatus,
      );
      await insertSqlAudit(client, auditLog);
      await insertSqlCleanupOperation(client, cleanupOperation);
      await insertSqlIdempotency(
        client,
        input,
        canonical.avatarFileId,
        receipt,
        200,
      );
      return { receipt, cleanupOperation, replayed: false, auditLog };
    });
    if (!result.replayed) {
      try {
        await hydrate();
        await saveDb();
      } catch (error) {
        error.backendCommitted = true;
        throw error;
      }
    }
    return result;
  }

  async function recordCleanupAttempt({ operationId, userId, completed, errorCode = "" }) {
    const normalizedOperationId = String(operationId || "");
    const normalizedUserId = String(userId || "");
    if (!normalizedOperationId || !normalizedUserId) {
      throw repositoryError(400, "AVATAR_CLEANUP_IDENTITY_REQUIRED", "Avatar cleanup identity is required");
    }
    const status = completed ? "completed" : "pending";
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const operation = db.avatarMutationOperations.find(
            (item) => item.id === normalizedOperationId && item.userId === normalizedUserId,
          );
          if (!operation) {
            throw repositoryError(404, "AVATAR_CLEANUP_NOT_FOUND", "Avatar cleanup operation was not found");
          }
          if (["not_required", "completed", "dead_letter"].includes(operation.cleanupStatus)) {
            return clone(operation);
          }
          operation.cleanupAttempts = Number(operation.cleanupAttempts || 0) + 1;
          operation.cleanupStatus = status;
          operation.lastErrorCode = completed ? "" : String(errorCode || "AVATAR_STORAGE_CLEANUP_FAILED").slice(0, 120);
          operation.updatedAt = nowIso();
          operation.completedAt = completed ? nowIso() : "";
          operation.nextAttemptAt = completed
            ? ""
            : addMillis(operation.updatedAt, 1_000);
          operation.leaseOwner = "";
          operation.leaseExpiresAt = "";
          operation.deadLetteredAt = "";
          updateRuntimeReceiptCleanupStatus(db, operation, status);
          await saveDb();
          return clone(operation);
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          throw error;
        }
      });
    }
    const result = await withSqlTransaction(async (client) => {
      const selected = await client.query(
        "SELECT * FROM avatar_mutation_operations WHERE id = $1 AND user_id = $2 LIMIT 1 FOR UPDATE",
        [normalizedOperationId, normalizedUserId],
      );
      const operation = rowToCleanupOperation(selected.rows[0]);
      if (!operation) {
        throw repositoryError(404, "AVATAR_CLEANUP_NOT_FOUND", "Avatar cleanup operation was not found");
      }
      if (["not_required", "completed", "dead_letter"].includes(operation.cleanupStatus)) return operation;
      const updated = await client.query(
        `
          UPDATE avatar_mutation_operations
          SET cleanup_status = $3,
              cleanup_attempts = cleanup_attempts + 1,
              last_error_code = NULLIF($4, ''),
              updated_at = now(),
              completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE NULL END,
              cleanup_next_attempt_at = CASE
                WHEN $3 = 'completed' THEN NULL
                ELSE now() + interval '1 second'
              END,
              cleanup_lease_owner = NULL,
              cleanup_lease_expires_at = NULL,
              dead_lettered_at = NULL
          WHERE id = $1 AND user_id = $2
          RETURNING *
        `,
        [
          normalizedOperationId,
          normalizedUserId,
          status,
          completed ? "" : String(errorCode || "AVATAR_STORAGE_CLEANUP_FAILED").slice(0, 120),
        ],
      );
      await updateSqlReceiptCleanupStatus(client, operation, status);
      return rowToCleanupOperation(updated.rows[0]);
    });
    await hydrate();
    await saveDb();
    return result;
  }

  async function listPendingCleanup(userId) {
    const normalizedUserId = String(userId || "");
    if (!normalizedUserId) return [];
    if (!getPool()) {
      return clone(
        runtimeDb().avatarMutationOperations.filter(
          (operation) =>
            operation.userId === normalizedUserId &&
            operation.cleanupStatus === "pending" &&
            operation.cleanupObjectKey,
        ),
      );
    }
    const result = await getPool().query(
      `SELECT * FROM avatar_mutation_operations
       WHERE user_id = $1 AND cleanup_status = 'pending'
       ORDER BY created_at ASC LIMIT 20`,
      [normalizedUserId],
    );
    return result.rows.map(rowToCleanupOperation);
  }

  function publicCleanupStatus(userId, workspaceId, operation = null) {
    if (!operation) {
      return {
        userId,
        workspaceId,
        status: "not_required",
        operationId: "",
        action: "none",
        previousFileId: "",
        attempts: 0,
        lastErrorCode: "",
        updatedAt: "",
        manualSupportRequired: false,
      };
    }
    const action =
      operation.cleanupKind === "staged_rollback"
        ? "orphan_upload"
        : operation.mutationType === "delete"
          ? "delete"
          : "upload";
    return {
      userId,
      workspaceId,
      status: operation.cleanupStatus,
      operationId: operation.id,
      action,
      previousFileId: operation.previousFileId,
      attempts: Number(operation.cleanupAttempts || 0),
      lastErrorCode: operation.lastErrorCode,
      updatedAt: operation.updatedAt,
      manualSupportRequired: operation.cleanupStatus === "dead_letter",
    };
  }

  function selectOwnerCleanupOperation(operations) {
    const sorted = [...operations].sort((left, right) => {
      const leftPriority = left.cleanupStatus === "dead_letter"
        ? 2
        : left.cleanupStatus === "pending"
          ? 1
          : 0;
      const rightPriority = right.cleanupStatus === "dead_letter"
        ? 2
        : right.cleanupStatus === "pending"
          ? 1
          : 0;
      if (leftPriority !== rightPriority) return rightPriority - leftPriority;
      return toTimeMillis(right.updatedAt, 0) - toTimeMillis(left.updatedAt, 0);
    });
    return sorted[0] || null;
  }

  async function getCleanupStatus(rawInput = {}) {
    const userId = String(rawInput.userId || "");
    const organizationId = String(rawInput.organizationId || "");
    if (!userId || !organizationId) {
      throw repositoryError(
        400,
        "AVATAR_CLEANUP_OWNER_REQUIRED",
        "Avatar cleanup status requires an exact account and workspace",
      );
    }
    const authorityInput = { userId, organizationId };
    if (!getPool()) {
      const db = runtimeDb();
      const user = db.users.find((item) => String(item.id || "") === userId);
      const canonical = assertActiveAccountAuthority(user, authorityInput);
      assertWorkspaceAuthority(
        db.organizations.find(
          (item) => String(item.id || "") === organizationId,
        ),
        authorityInput,
      );
      if (canonical.organizationId !== organizationId) {
        const membership = (db.memberships || []).find(
          (item) =>
            String(item.userId || "") === userId &&
            String(item.organizationId || item.workspaceId || "") === organizationId &&
            String(item.status || "active").toLowerCase() === "active",
        );
        if (!membership) {
          throw repositoryError(
            403,
            "AVATAR_WORKSPACE_SCOPE_DENIED",
            "Avatar cleanup status requires an active workspace membership",
          );
        }
      }
      const selected = selectOwnerCleanupOperation(
        db.avatarMutationOperations.filter(
          (operation) =>
            operation.userId === userId &&
            operation.organizationId === organizationId,
        ),
      );
      return publicCleanupStatus(userId, organizationId, selected);
    }
    return withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `account-avatar-status:${userId}`,
      ]);
      const selectedUser = await client.query(
        `SELECT id, organization_id, account_status, firebase_claims
         FROM users WHERE id = $1 LIMIT 1 FOR UPDATE`,
        [userId],
      );
      const canonical = assertActiveAccountAuthority(
        selectedUser.rows[0] || null,
        authorityInput,
      );
      const workspace = await client.query(
        "SELECT id, status, deleted_at FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
        [organizationId],
      );
      assertWorkspaceAuthority(workspace.rows[0] || null, authorityInput);
      if (canonical.organizationId !== organizationId) {
        const membership = await client.query(
          `SELECT id FROM memberships
           WHERE user_id = $1
             AND organization_id = $2
             AND LOWER(COALESCE(status, 'active')) = 'active'
           LIMIT 1`,
          [userId, organizationId],
        );
        if (!membership.rows[0]) {
          throw repositoryError(
            403,
            "AVATAR_WORKSPACE_SCOPE_DENIED",
            "Avatar cleanup status requires an active workspace membership",
          );
        }
      }
      const result = await client.query(
        `
          SELECT *
          FROM avatar_mutation_operations
          WHERE user_id = $1 AND organization_id = $2
          ORDER BY
            CASE cleanup_status
              WHEN 'dead_letter' THEN 2
              WHEN 'pending' THEN 1
              ELSE 0
            END DESC,
            updated_at DESC
          LIMIT 1
        `,
        [userId, organizationId],
      );
      return publicCleanupStatus(
        userId,
        organizationId,
        rowToCleanupOperation(result.rows[0]),
      );
    });
  }

  async function claimCleanupBatch(rawInput = {}) {
    const workerId = String(rawInput.workerId || "").trim();
    if (!workerId || workerId.length > 160) {
      throw repositoryError(
        400,
        "AVATAR_CLEANUP_WORKER_ID_REQUIRED",
        "Avatar cleanup claims require a bounded worker identity",
      );
    }
    const limit = boundedInteger(rawInput.limit, 20, 1, 100);
    const leaseMillis = boundedInteger(
      rawInput.leaseMillis,
      60_000,
      1_000,
      10 * 60_000,
    );
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        const claimedAt = nowIso();
        const nowMillis = toTimeMillis(claimedAt, Date.now());
        try {
          const due = db.avatarMutationOperations
            .filter((operation) => {
              const nextAttemptAt = toTimeMillis(operation.nextAttemptAt, 0);
              const leaseExpiresAt = toTimeMillis(operation.leaseExpiresAt, 0);
              return (
                operation.cleanupStatus === "pending" &&
                Boolean(operation.cleanupObjectKey) &&
                nextAttemptAt <= nowMillis &&
                (!operation.leaseOwner || leaseExpiresAt <= nowMillis)
              );
            })
            .sort((left, right) => {
              const dueOrder =
                toTimeMillis(left.nextAttemptAt, 0) -
                toTimeMillis(right.nextAttemptAt, 0);
              if (dueOrder !== 0) return dueOrder;
              return toTimeMillis(left.createdAt, 0) - toTimeMillis(right.createdAt, 0);
            })
            .slice(0, limit);
          for (const operation of due) {
            operation.leaseOwner = workerId;
            operation.leaseExpiresAt = addMillis(claimedAt, leaseMillis);
            operation.updatedAt = claimedAt;
          }
          if (due.length > 0) await saveDb();
          return clone(due);
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          throw error;
        }
      });
    }
    const claimed = await withSqlTransaction(async (client) => {
      const result = await client.query(
        `
          WITH due AS (
            SELECT id
            FROM avatar_mutation_operations
            WHERE cleanup_status = 'pending'
              AND cleanup_object_key IS NOT NULL
              AND COALESCE(cleanup_next_attempt_at, created_at) <= now()
              AND (
                cleanup_lease_owner IS NULL
                OR cleanup_lease_expires_at IS NULL
                OR cleanup_lease_expires_at <= now()
              )
            ORDER BY COALESCE(cleanup_next_attempt_at, created_at), created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $1
          )
          UPDATE avatar_mutation_operations AS operation
          SET cleanup_lease_owner = $2,
              cleanup_lease_expires_at = now() + ($3::bigint * interval '1 millisecond'),
              updated_at = now()
          FROM due
          WHERE operation.id = due.id
          RETURNING operation.*
        `,
        [limit, workerId, leaseMillis],
      );
      return result.rows.map(rowToCleanupOperation);
    });
    return claimed;
  }

  function findRuntimeCleanupClaim(
    db,
    operationId,
    userId,
    workerId,
    objectKey,
  ) {
    const selected = db.avatarMutationOperations.find(
      (operation) => operation.id === operationId && operation.userId === userId,
    );
    if (!selected || selected.cleanupObjectKey === objectKey) return selected;
    return db.avatarMutationOperations.find(
      (operation) =>
        operation.userId === userId &&
        operation.cleanupObjectKey === objectKey &&
        operation.leaseOwner === workerId &&
        operation.id.startsWith(`${operationId}_retired_`),
    ) || selected;
  }

  async function findSqlCleanupClaim(
    client,
    operationId,
    userId,
    workerId,
    objectKey,
  ) {
    const selected = await client.query(
      "SELECT * FROM avatar_mutation_operations WHERE id = $1 AND user_id = $2 LIMIT 1 FOR UPDATE",
      [operationId, userId],
    );
    const operation = rowToCleanupOperation(selected.rows[0]);
    if (!operation || operation.cleanupObjectKey === objectKey) return operation;
    const retired = await client.query(
      `
        SELECT *
        FROM avatar_mutation_operations
        WHERE user_id = $1
          AND cleanup_object_key = $2
          AND cleanup_lease_owner = $3
          AND left(id, length($4)) = $4
        LIMIT 1
        FOR UPDATE
      `,
      [userId, objectKey, workerId, `${operationId}_retired_`],
    );
    return rowToCleanupOperation(retired.rows[0]) || operation;
  }

  function assertCleanupLease(operation, userId, workerId, objectKey) {
    if (!operation || operation.userId !== userId) {
      throw repositoryError(
        404,
        "AVATAR_CLEANUP_NOT_FOUND",
        "Avatar cleanup operation was not found",
      );
    }
    if (operation.cleanupObjectKey !== objectKey) {
      throw repositoryError(
        409,
        "AVATAR_CLEANUP_LEASE_LOST",
        "Avatar cleanup object generation is no longer owned by this worker",
      );
    }
    if (operation.cleanupStatus === "completed") return;
    if (
      operation.cleanupStatus !== "pending" ||
      operation.leaseOwner !== workerId
    ) {
      throw repositoryError(
        409,
        "AVATAR_CLEANUP_LEASE_LOST",
        "Avatar cleanup lease is no longer owned by this worker",
      );
    }
  }

  async function completeCleanupClaim(rawInput = {}) {
    const operationId = String(rawInput.operationId || "");
    const userId = String(rawInput.userId || "");
    const workerId = String(rawInput.workerId || "");
    const objectKey = String(rawInput.objectKey || "");
    if (!operationId || !userId || !workerId || !objectKey) {
      throw repositoryError(
        400,
        "AVATAR_CLEANUP_IDENTITY_REQUIRED",
        "Avatar cleanup completion requires operation, account and worker identity",
      );
    }
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const operation = findRuntimeCleanupClaim(
            db,
            operationId,
            userId,
            workerId,
            objectKey,
          );
          assertCleanupLease(operation, userId, workerId, objectKey);
          if (operation.cleanupStatus === "completed") return clone(operation);
          const completedAt = nowIso();
          operation.cleanupAttempts = Number(operation.cleanupAttempts || 0) + 1;
          operation.cleanupStatus = "completed";
          operation.lastErrorCode = "";
          operation.nextAttemptAt = "";
          operation.leaseOwner = "";
          operation.leaseExpiresAt = "";
          operation.deadLetteredAt = "";
          operation.completedAt = completedAt;
          operation.updatedAt = completedAt;
          updateRuntimeReceiptCleanupStatus(db, operation, "completed");
          await saveDb();
          return clone(operation);
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          throw error;
        }
      });
    }
    const result = await withSqlTransaction(async (client) => {
      const operation = await findSqlCleanupClaim(
        client,
        operationId,
        userId,
        workerId,
        objectKey,
      );
      assertCleanupLease(operation, userId, workerId, objectKey);
      if (operation.cleanupStatus === "completed") return operation;
      const updated = await client.query(
        `
          UPDATE avatar_mutation_operations
          SET cleanup_status = 'completed',
              cleanup_attempts = cleanup_attempts + 1,
              last_error_code = NULL,
              cleanup_next_attempt_at = NULL,
              cleanup_lease_owner = NULL,
              cleanup_lease_expires_at = NULL,
              dead_lettered_at = NULL,
              completed_at = now(),
              updated_at = now()
          WHERE id = $1 AND user_id = $2 AND cleanup_lease_owner = $3
          RETURNING *
        `,
        [operation.id, userId, workerId],
      );
      if (!updated.rows[0]) {
        throw repositoryError(
          409,
          "AVATAR_CLEANUP_LEASE_LOST",
          "Avatar cleanup lease was replaced before completion",
        );
      }
      await updateSqlReceiptCleanupStatus(client, operation, "completed");
      return rowToCleanupOperation(updated.rows[0]);
    });
    await hydrate();
    await saveDb();
    return result;
  }

  async function failCleanupClaim(rawInput = {}) {
    const operationId = String(rawInput.operationId || "");
    const userId = String(rawInput.userId || "");
    const workerId = String(rawInput.workerId || "");
    const objectKey = String(rawInput.objectKey || "");
    const errorCode = String(
      rawInput.errorCode || "AVATAR_STORAGE_CLEANUP_FAILED",
    ).slice(0, 120);
    const maxAttempts = boundedInteger(rawInput.maxAttempts, 8, 1, 50);
    const baseBackoffMillis = boundedInteger(
      rawInput.baseBackoffMillis,
      30_000,
      100,
      24 * 60 * 60_000,
    );
    const maxBackoffMillis = boundedInteger(
      rawInput.maxBackoffMillis,
      30 * 60_000,
      baseBackoffMillis,
      7 * 24 * 60 * 60_000,
    );
    const terminal = rawInput.terminal === true;
    if (!operationId || !userId || !workerId || !objectKey) {
      throw repositoryError(
        400,
        "AVATAR_CLEANUP_IDENTITY_REQUIRED",
        "Avatar cleanup failure requires operation, account and worker identity",
      );
    }
    const applyFailure = (operation) => {
      assertCleanupLease(operation, userId, workerId, objectKey);
      const failedAt = nowIso();
      const attempts = Number(operation.cleanupAttempts || 0) + 1;
      const deadLettered = terminal || attempts >= maxAttempts;
      const backoffMillis = Math.min(
        maxBackoffMillis,
        baseBackoffMillis * 2 ** Math.max(0, attempts - 1),
      );
      operation.cleanupAttempts = attempts;
      operation.cleanupStatus = deadLettered ? "dead_letter" : "pending";
      operation.lastErrorCode = errorCode;
      operation.nextAttemptAt = deadLettered
        ? ""
        : addMillis(failedAt, backoffMillis);
      operation.leaseOwner = "";
      operation.leaseExpiresAt = "";
      operation.completedAt = "";
      operation.deadLetteredAt = deadLettered ? failedAt : "";
      operation.updatedAt = failedAt;
      return operation;
    };
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const operation = findRuntimeCleanupClaim(
            db,
            operationId,
            userId,
            workerId,
            objectKey,
          );
          applyFailure(operation);
          updateRuntimeReceiptCleanupStatus(
            db,
            operation,
            operation.cleanupStatus,
          );
          await saveDb();
          return clone(operation);
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          throw error;
        }
      });
    }
    const result = await withSqlTransaction(async (client) => {
      const operation = await findSqlCleanupClaim(
        client,
        operationId,
        userId,
        workerId,
        objectKey,
      );
      applyFailure(operation);
      const updated = await client.query(
        `
          UPDATE avatar_mutation_operations
          SET cleanup_status = $4,
              cleanup_attempts = $5,
              last_error_code = $6,
              cleanup_next_attempt_at = NULLIF($7, '')::timestamptz,
              cleanup_lease_owner = NULL,
              cleanup_lease_expires_at = NULL,
              completed_at = NULL,
              dead_lettered_at = NULLIF($8, '')::timestamptz,
              updated_at = $9::timestamptz
          WHERE id = $1 AND user_id = $2 AND cleanup_lease_owner = $3
          RETURNING *
        `,
        [
          operation.id,
          userId,
          workerId,
          operation.cleanupStatus,
          operation.cleanupAttempts,
          operation.lastErrorCode,
          operation.nextAttemptAt,
          operation.deadLetteredAt,
          operation.updatedAt,
        ],
      );
      if (!updated.rows[0]) {
        throw repositoryError(
          409,
          "AVATAR_CLEANUP_LEASE_LOST",
          "Avatar cleanup lease was replaced before failure was recorded",
        );
      }
      await updateSqlReceiptCleanupStatus(
        client,
        operation,
        operation.cleanupStatus,
      );
      return rowToCleanupOperation(updated.rows[0]);
    });
    await hydrate();
    await saveDb();
    return result;
  }

  async function cleanupMetrics(rawInput = {}) {
    const retentionMillis = boundedInteger(
      rawInput.retentionMillis,
      30 * 24 * 60 * 60_000,
      1_000,
      365 * 24 * 60 * 60_000,
    );
    const now = toTimeMillis(nowIso(), Date.now());
    const cutoff = new Date(now - retentionMillis).toISOString();
    if (!getPool()) {
      const operations = runtimeDb().avatarMutationOperations;
      const terminalOverdue = operations.filter((operation) => {
        if (!['completed', 'dead_letter'].includes(operation.cleanupStatus)) {
          return false;
        }
        const terminalAt =
          operation.completedAt || operation.deadLetteredAt || operation.updatedAt;
        return toTimeMillis(terminalAt, now) < now - retentionMillis;
      }).length;
      return {
        pending: operations.filter((item) => item.cleanupStatus === "pending").length,
        leased: operations.filter(
          (item) =>
            item.cleanupStatus === "pending" &&
            item.leaseOwner &&
            toTimeMillis(item.leaseExpiresAt, 0) > now,
        ).length,
        completed: operations.filter((item) => item.cleanupStatus === "completed").length,
        deadLettered: operations.filter((item) => item.cleanupStatus === "dead_letter").length,
        retention: {
          millis: retentionMillis,
          overdue: terminalOverdue,
          policy: "prune_completed_keep_dead_letter",
        },
      };
    }
    const result = await getPool().query(
      `
        SELECT
          count(*) FILTER (WHERE cleanup_status = 'pending')::int AS pending,
          count(*) FILTER (
            WHERE cleanup_status = 'pending'
              AND cleanup_lease_owner IS NOT NULL
              AND cleanup_lease_expires_at > now()
          )::int AS leased,
          count(*) FILTER (WHERE cleanup_status = 'completed')::int AS completed,
          count(*) FILTER (WHERE cleanup_status = 'dead_letter')::int AS dead_lettered,
          count(*) FILTER (
            WHERE cleanup_status IN ('completed', 'dead_letter')
              AND COALESCE(completed_at, dead_lettered_at, updated_at) < $1::timestamptz
          )::int AS retention_overdue
        FROM avatar_mutation_operations
      `,
      [cutoff],
    );
    const row = result.rows[0] || {};
    return {
      pending: Number(row.pending || 0),
      leased: Number(row.leased || 0),
      completed: Number(row.completed || 0),
      deadLettered: Number(row.dead_lettered || 0),
      retention: {
        millis: retentionMillis,
        overdue: Number(row.retention_overdue || 0),
        policy: "prune_completed_keep_dead_letter",
      },
    };
  }

  async function pruneCleanupHistory(rawInput = {}) {
    const retentionMillis = boundedInteger(
      rawInput.retentionMillis,
      30 * 24 * 60 * 60_000,
      1_000,
      365 * 24 * 60 * 60_000,
    );
    const limit = boundedInteger(rawInput.limit, 100, 1, 1_000);
    const now = toTimeMillis(nowIso(), Date.now());
    const cutoffMillis = now - retentionMillis;
    const cutoff = new Date(cutoffMillis).toISOString();
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const removable = db.avatarMutationOperations
            .filter(
              (operation) =>
                operation.cleanupStatus === "completed" &&
                toTimeMillis(operation.completedAt || operation.updatedAt, now) <
                  cutoffMillis,
            )
            .sort(
              (left, right) =>
                toTimeMillis(left.completedAt || left.updatedAt, 0) -
                toTimeMillis(right.completedAt || right.updatedAt, 0),
            )
            .slice(0, limit);
          const removableIds = new Set(removable.map((operation) => operation.id));
          if (removableIds.size > 0) {
            db.avatarMutationOperations = db.avatarMutationOperations.filter(
              (operation) => !removableIds.has(operation.id),
            );
            await saveDb();
          }
          return {
            pruned: removableIds.size,
            retainedDeadLetters: db.avatarMutationOperations.filter(
              (operation) => operation.cleanupStatus === "dead_letter",
            ).length,
          };
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          throw error;
        }
      });
    }
    const result = await withSqlTransaction(async (client) => {
      const removed = await client.query(
        `
          DELETE FROM avatar_mutation_operations
          WHERE id IN (
            SELECT id
            FROM avatar_mutation_operations
            WHERE cleanup_status = 'completed'
              AND COALESCE(completed_at, updated_at) < $1::timestamptz
            ORDER BY COALESCE(completed_at, updated_at)
            FOR UPDATE SKIP LOCKED
            LIMIT $2
          )
          RETURNING id
        `,
        [cutoff, limit],
      );
      const deadLetters = await client.query(
        "SELECT count(*)::int AS count FROM avatar_mutation_operations WHERE cleanup_status = 'dead_letter'",
      );
      return {
        pruned: removed.rows.length,
        retainedDeadLetters: Number(deadLetters.rows[0]?.count || 0),
      };
    });
    if (result.pruned > 0) {
      await hydrate();
      await saveDb();
    }
    return result;
  }

  async function isObjectActive({ userId, fileId, objectKey }) {
    const normalized = {
      userId: String(userId || ""),
      fileId: String(fileId || ""),
      objectKey: String(objectKey || ""),
    };
    if (!normalized.userId || !normalized.objectKey) return false;
    if (!getPool()) {
      const db = runtimeDb();
      const user = db.users.find((item) => item.id === normalized.userId);
      return Boolean(
        user &&
          String(objectOf(user.avatarStorage).objectKey || "") === normalized.objectKey &&
          (!normalized.fileId || user.avatarFileId === normalized.fileId),
      );
    }
    const result = await getPool().query(
      `
        SELECT 1
        FROM users u
        WHERE u.id = $1
          AND u.firebase_claims->'profile'->'avatarStorage'->>'objectKey' = $2
          AND ($3 = '' OR u.firebase_claims->'profile'->>'avatarFileId' = $3)
        LIMIT 1
      `,
      [normalized.userId, normalized.objectKey, normalized.fileId],
    );
    return result.rows.length > 0;
  }

  async function hydrate() {
    if (!getPool()) {
      return {
        avatarMutationOperations: runtimeDb().avatarMutationOperations.length,
      };
    }
    const [operations, files] = await Promise.all([
      getPool().query(
        "SELECT * FROM avatar_mutation_operations ORDER BY created_at DESC LIMIT 2000",
      ),
      getPool().query(
        "SELECT * FROM storage_files ORDER BY created_at DESC LIMIT 2000",
      ),
    ]);
    const db = runtimeDb();
    db.avatarMutationOperations = operations.rows.map(rowToCleanupOperation);
    const runtimeFiles = new Map(db.storageFiles.map((file) => [file.id, file]));
    db.storageFiles = files.rows.map((row) => ({
      ...runtimeFiles.get(row.id),
      id: row.id,
      organizationId: row.organization_id || "",
      bucket: row.bucket_id || "",
      name: row.name || "",
      objectKey: row.object_key || "",
      storageProvider: row.storage_provider || "",
      contentType: row.content_type || "application/octet-stream",
      type: row.file_type || "bin",
      byteSize: Number(row.byte_size || 0),
      checksum: row.checksum_sha256 || "",
      sha256: row.checksum_sha256 || "",
      createdByUserId: row.created_by_user_id || "",
      status: row.status || "active",
      deletedAt: toIso(row.deleted_at),
      deletedByUserId: row.deleted_by_user_id || "",
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    }));
    return { avatarMutationOperations: db.avatarMutationOperations.length };
  }

  return {
    findReplay,
    stageUploadCleanup,
    saveUploadWithAudit,
    deleteWithAudit,
    recordCleanupAttempt,
    listPendingCleanup,
    getCleanupStatus,
    claimCleanupBatch,
    completeCleanupClaim,
    failCleanupClaim,
    cleanupMetrics,
    pruneCleanupHistory,
    isObjectActive,
    hydrate,
  };
}

async function executeAvatarUploadMutation(options = {}) {
  const { repository, storageAdapter, input, buffer, contentType } = options;
  if (
    !repository?.findReplay ||
    !repository?.stageUploadCleanup ||
    !repository?.saveUploadWithAudit ||
    !repository?.isObjectActive ||
    !storageAdapter?.putBuffer ||
    !storageAdapter?.deleteObject ||
    !Buffer.isBuffer(buffer)
  ) {
    throw new TypeError("Avatar upload mutation dependencies are incomplete");
  }
  const replay = await repository.findReplay(input);
  if (replay) return replay.receipt;
  const staged = await repository.stageUploadCleanup(input);
  if (staged?.replayed && staged.receipt) return staged.receipt;
  const uploadObjectKey = String(
    staged?.cleanupOperation?.cleanupObjectKey || input.avatar.objectKey,
  );
  if (!isAvatarUploadObjectGeneration(uploadObjectKey, input.avatar.objectKey)) {
    throw repositoryError(
      500,
      "AVATAR_UPLOAD_STAGE_INVALID",
      "Avatar upload stage returned an invalid provider object generation",
    );
  }
  const effectiveInput =
    uploadObjectKey === input.avatar.objectKey
      ? input
      : {
          ...input,
          avatar: { ...input.avatar, objectKey: uploadObjectKey },
        };
  let uploaded = false;
  try {
    await storageAdapter.putBuffer(uploadObjectKey, buffer, contentType);
    uploaded = true;
    const result = await repository.saveUploadWithAudit(effectiveInput);
    return result.receipt;
  } catch (error) {
    if (uploaded && error?.backendCommitted !== true && error?.backendCommitUnknown !== true) {
      let active = false;
      try {
        active = await repository.isObjectActive({
          userId: effectiveInput.userId,
          fileId: effectiveInput.avatar.id,
          objectKey: uploadObjectKey,
        });
      } catch {
        error.avatarOwnershipUnknown = true;
      }
      if (!active && !error.avatarOwnershipUnknown) {
        try {
          await storageAdapter.deleteObject(uploadObjectKey);
        } catch {
          error.avatarRollbackCleanupPending = true;
        }
      }
    }
    throw error;
  }
}

async function executeAvatarDeleteMutation(options = {}) {
  const { repository, storageAdapter, input } = options;
  if (
    !repository?.deleteWithAudit ||
    !storageAdapter?.deleteObject
  ) {
    throw new TypeError("Avatar delete mutation dependencies are incomplete");
  }
  const result = await repository.deleteWithAudit(input);
  return result.receipt;
}

module.exports = {
  AVATAR_CONTENT_TYPES,
  AVATAR_DELETE_OPERATION,
  AVATAR_UPLOAD_OPERATION,
  MAX_AVATAR_BYTES,
  createAvatarMutationRepository,
  executeAvatarDeleteMutation,
  executeAvatarUploadMutation,
  repositoryError,
  validateAvatarUpload,
};
