const { sanitizeAuditMetadata } = require("./auditLogContract");

const OPERATION = "auth.role_request.document.upload";
const CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_DOCUMENTS_PER_ACCOUNT = 10;
const MAX_ROLE_REQUEST_DOCUMENT_BYTES = 10 * 1024 * 1024;

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

function toIso(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function publicDocument(document = {}) {
  return {
    id: String(document.id || ""),
    userId: String(document.userId || ""),
    organizationId: String(document.organizationId || ""),
    name: String(document.name || ""),
    contentType: String(document.contentType || ""),
    byteSize: Number(document.byteSize || 0),
    sha256: String(document.sha256 || "").toLowerCase(),
    uploadedAt: toIso(document.uploadedAt),
  };
}

function rowToDocument(row) {
  if (!row) return null;
  return {
    id: row.id || "",
    userId: row.user_id || "",
    organizationId: row.organization_id || "",
    name: row.name || "",
    contentType: row.content_type || "",
    byteSize: Number(row.byte_size || 0),
    sha256: String(row.sha256 || "").toLowerCase(),
    objectKey: row.object_key || "",
    storageProvider: row.storage_provider || "",
    uploadedAt: toIso(row.uploaded_at),
  };
}

async function persistRoleRequestDocumentUpload(options = {}) {
  const storageAdapter = options.storageAdapter;
  const repository = options.repository;
  const objectKey = String(options.objectKey || "");
  const objectOwnership = {
    userId: String(options.objectOwnership?.userId || ""),
    organizationId: String(options.objectOwnership?.organizationId || ""),
    documentId: String(options.objectOwnership?.documentId || ""),
  };
  if (
    !storageAdapter?.putBuffer ||
    !storageAdapter?.deleteObject ||
    !repository?.saveWithAudit ||
    !repository?.isObjectCommitted ||
    typeof options.createSaveInput !== "function" ||
    !objectKey ||
    !objectOwnership.userId ||
    !objectOwnership.organizationId ||
    !objectOwnership.documentId
  ) {
    throw new TypeError("Role request document upload dependencies are incomplete");
  }

  const notifyCleanupError = async (cleanupError) => {
    if (typeof options.onCleanupError !== "function") return;
    try {
      await options.onCleanupError(cleanupError, objectKey);
    } catch {
      // Cleanup reporting must never replace the original mutation outcome.
    }
  };
  const cleanupUncommittedCandidate = async (mutationError = null) => {
    let committed;
    try {
      committed = await repository.isObjectCommitted({
        ...objectOwnership,
        objectKey,
      });
    } catch (ownershipError) {
      if (mutationError) mutationError.roleRequestDocumentOwnershipUnknown = true;
      await notifyCleanupError(ownershipError);
      return false;
    }
    if (committed) return false;
    try {
      await storageAdapter.deleteObject(objectKey);
      return true;
    } catch (cleanupError) {
      if (mutationError) mutationError.roleRequestDocumentCleanupFailed = true;
      await notifyCleanupError(cleanupError);
      return false;
    }
  };

  let result;
  try {
    const upload = await storageAdapter.putBuffer(
      objectKey,
      options.buffer,
      options.contentType,
    );
    result = await repository.saveWithAudit(options.createSaveInput(upload));
  } catch (error) {
    // A confirmed or outcome-unknown database commit may own this exact object.
    // Deleting it here could destroy the winning receipt during a concurrent
    // retry. Every failure confirmed to be pre-commit is cleaned below.
    if (error?.backendCommitted === true || error?.backendCommitUnknown === true) {
      throw error;
    }
    await cleanupUncommittedCandidate(error);
    throw error;
  }
  if (result?.replayed === true) {
    // The bytes written by this request are only a candidate. Exact replay
    // returns the already-committed receipt, so remove this candidate unless
    // the canonical ledger confirms that it is itself the winning object.
    await cleanupUncommittedCandidate();
  }
  return result;
}

function createRoleRequestDocumentRepository(options) {
  const getDb = options.getDb;
  const saveDb = options.saveDb;
  const createId = options.createId;
  const nowIso = options.nowIso;
  const getPool = options.getPool || (() => null);
  let runtimeMutationTail = Promise.resolve();

  function runtimeDb() {
    const db = getDb();
    db.organizations = arrayOf(db.organizations);
    db.users = arrayOf(db.users);
    db.roleRequestDocuments = arrayOf(db.roleRequestDocuments);
    db.auditLogs = arrayOf(db.auditLogs);
    db.idempotencyKeys = arrayOf(db.idempotencyKeys);
    return db;
  }

  function runRuntimeExclusive(operation) {
    const task = runtimeMutationTail.catch(() => {}).then(operation);
    runtimeMutationTail = task.catch(() => {});
    return task;
  }

  function normalizeIdempotency(input = {}) {
    const idempotency = {
      scope: String(input.scope || ""),
      operation: String(input.operation || ""),
      key: String(input.key || ""),
      fingerprint: String(input.fingerprint || ""),
    };
    if (!idempotency.key) {
      throw repositoryError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required",
      );
    }
    if (
      !idempotency.scope ||
      !idempotency.operation ||
      !idempotency.fingerprint
    ) {
      throw repositoryError(
        400,
        "IDEMPOTENCY_CONTEXT_INVALID",
        "Idempotency scope, operation and fingerprint are required",
      );
    }
    return idempotency;
  }

  function normalizeInput(input = {}, requireDocument = false) {
    const normalized = {
      userId: String(input.userId || ""),
      organizationId: String(input.organizationId || ""),
      operationId: String(input.operationId || ""),
      document: input.document ? clone(input.document) : null,
      idempotency: normalizeIdempotency(input.idempotency),
      audit: clone(input.audit || {}),
    };
    if (!normalized.userId || !normalized.organizationId) {
      throw repositoryError(
        400,
        "ROLE_REQUEST_DOCUMENT_BINDING_REQUIRED",
        "Document uploads require an account and workspace binding",
      );
    }
    if (
      normalized.idempotency.scope !== normalized.userId ||
      normalized.idempotency.operation !== OPERATION
    ) {
      throw repositoryError(
        403,
        "ROLE_REQUEST_DOCUMENT_SCOPE_DENIED",
        "Document upload idempotency must be scoped to the authenticated account",
      );
    }
    if (requireDocument) {
      if (!normalized.operationId || !normalized.document) {
        throw repositoryError(
          400,
          "ROLE_REQUEST_DOCUMENT_RECEIPT_REQUIRED",
          "Document and operation identity are required",
        );
      }
      normalized.document = normalizeDocument(
        normalized.document,
        normalized.userId,
        normalized.organizationId,
      );
      if (
        String(normalized.audit.actorUserId || "") !== normalized.userId ||
        String(normalized.audit.organizationId || "") !==
          normalized.organizationId
      ) {
        throw repositoryError(
          403,
          "ROLE_REQUEST_DOCUMENT_AUDIT_SCOPE_DENIED",
          "Document audit identity must match the authenticated account and workspace",
        );
      }
    }
    return normalized;
  }

  function normalizeDocument(document, userId, organizationId) {
    const normalized = {
      id: String(document.id || ""),
      userId: String(document.userId || ""),
      organizationId: String(document.organizationId || ""),
      name: String(document.name || ""),
      contentType: String(document.contentType || "").toLowerCase(),
      byteSize: Number(document.byteSize || 0),
      sha256: String(document.sha256 || "").toLowerCase(),
      objectKey: String(document.objectKey || ""),
      storageProvider: String(document.storageProvider || ""),
      uploadedAt: toIso(document.uploadedAt),
    };
    if (
      normalized.userId !== userId ||
      normalized.organizationId !== organizationId
    ) {
      throw repositoryError(
        403,
        "ROLE_REQUEST_DOCUMENT_BINDING_DENIED",
        "Document owner and workspace must match the authenticated account",
      );
    }
    if (
      !normalized.id ||
      !normalized.name ||
      !CONTENT_TYPES.has(normalized.contentType) ||
      !Number.isInteger(normalized.byteSize) ||
      normalized.byteSize < 1 ||
      normalized.byteSize > MAX_ROLE_REQUEST_DOCUMENT_BYTES ||
      !/^[a-f0-9]{64}$/.test(normalized.sha256) ||
      !normalized.objectKey ||
      !normalized.storageProvider ||
      !normalized.uploadedAt
    ) {
      throw repositoryError(
        400,
        "ROLE_REQUEST_DOCUMENT_INVALID",
        "Document metadata is incomplete or invalid",
      );
    }
    const expectedObjectPrefix = `org/${organizationId}/doctor-documents/${userId}/`;
    if (
      !normalized.objectKey.startsWith(expectedObjectPrefix) ||
      normalized.objectKey.length <= expectedObjectPrefix.length ||
      normalized.objectKey.includes("..") ||
      normalized.objectKey.includes("\\")
    ) {
      throw repositoryError(
        403,
        "ROLE_REQUEST_DOCUMENT_OBJECT_SCOPE_DENIED",
        "Document object identity must remain inside the authenticated account workspace",
      );
    }
    return normalized;
  }

  function normalizeObjectOwnershipInput(rawInput = {}) {
    const input = {
      userId: String(rawInput.userId || ""),
      organizationId: String(rawInput.organizationId || ""),
      documentId: String(rawInput.documentId || ""),
      objectKey: String(rawInput.objectKey || ""),
    };
    if (
      !input.userId ||
      !input.organizationId ||
      !input.documentId ||
      !input.objectKey
    ) {
      throw repositoryError(
        400,
        "ROLE_REQUEST_DOCUMENT_OWNERSHIP_CONTEXT_INVALID",
        "Document object ownership requires an exact account, workspace and document binding",
      );
    }
    const expectedObjectPrefix = `org/${input.organizationId}/doctor-documents/${input.userId}/`;
    if (
      !input.objectKey.startsWith(expectedObjectPrefix) ||
      input.objectKey.length <= expectedObjectPrefix.length ||
      input.objectKey.includes("..") ||
      input.objectKey.includes("\\")
    ) {
      throw repositoryError(
        403,
        "ROLE_REQUEST_DOCUMENT_OBJECT_SCOPE_DENIED",
        "Document ownership lookup must remain inside the account workspace",
      );
    }
    return input;
  }

  function assertFingerprint(existing, idempotency) {
    if (
      existing?.fingerprint &&
      String(existing.fingerprint) !== idempotency.fingerprint
    ) {
      throw repositoryError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency-Key was already used with a different request payload",
      );
    }
  }

  function assertAccountAuthority(user, input) {
    if (!user || String(user.id || "") !== input.userId) {
      throw repositoryError(
        404,
        "ROLE_REQUEST_DOCUMENT_ACCOUNT_NOT_FOUND",
        "Authenticated account was not found",
      );
    }
    const accountStatus = String(user.accountStatus || user.account_status || "active").toLowerCase();
    if (
      user.deletedAt ||
      user.deleted_at ||
      ["locked", "deleted", "suspended", "disabled"].includes(accountStatus)
    ) {
      throw repositoryError(
        403,
        "ACCOUNT_INACTIVE",
        "Inactive accounts cannot upload or replay verification documents",
      );
    }
    const canonicalOrganizationId = String(
      user.organizationId || user.organization_id || "",
    );
    if (
      !canonicalOrganizationId ||
      canonicalOrganizationId !== input.organizationId
    ) {
      throw repositoryError(
        403,
        "ROLE_REQUEST_DOCUMENT_WORKSPACE_DENIED",
        "Document workspace must match the authenticated account",
      );
    }
  }

  function assertWorkspaceAuthority(workspace, input) {
    if (!workspace || String(workspace.id || "") !== input.organizationId) {
      throw repositoryError(
        403,
        "ROLE_REQUEST_DOCUMENT_WORKSPACE_DENIED",
        "Document workspace must match an existing canonical workspace",
      );
    }
    if (String(workspace.status || "active").toLowerCase() !== "active") {
      throw repositoryError(
        409,
        "ROLE_REQUEST_DOCUMENT_WORKSPACE_INACTIVE",
        "Verification documents require an active workspace",
      );
    }
  }

  function readReceipt(responseResource, input) {
    const response = clone(responseResource || {});
    const document = publicDocument(response.document || {});
    const operationId = String(response.operationId || "");
    if (
      !document.id ||
      document.userId !== input.userId ||
      document.organizationId !== input.organizationId ||
      !document.name ||
      !CONTENT_TYPES.has(document.contentType) ||
      !Number.isInteger(document.byteSize) ||
      document.byteSize < 1 ||
      !/^[a-f0-9]{64}$/.test(document.sha256) ||
      !document.uploadedAt ||
      !operationId
    ) {
      throw repositoryError(
        409,
        "IDEMPOTENT_ROLE_REQUEST_DOCUMENT_RESULT_INVALID",
        "Stored document upload receipt cannot be replayed safely",
      );
    }
    return { document, operationId, replayed: true };
  }

  function findRuntimeReceipt(db, input) {
    const existing = db.idempotencyKeys.find(
      (entry) =>
        entry.scope === input.idempotency.scope &&
        entry.operation === input.idempotency.operation &&
        entry.key === input.idempotency.key,
    );
    assertFingerprint(existing, input.idempotency);
    return existing ? readReceipt(existing.responseResource, input) : null;
  }

  function assertRuntimeDocumentLimit(db, input) {
    const canonicalCount = db.roleRequestDocuments.filter(
      (document) => document.userId === input.userId,
    ).length;
    const legacyCount = arrayOf(
      db.users.find((user) => user.id === input.userId)?.roleRequestDocuments,
    ).length;
    const documentCount = Math.max(canonicalCount, legacyCount);
    if (documentCount >= MAX_DOCUMENTS_PER_ACCOUNT) {
      throw repositoryError(
        409,
        "ROLE_REQUEST_DOCUMENT_LIMIT_REACHED",
        `An account can retain at most ${MAX_DOCUMENTS_PER_ACCOUNT} role request documents`,
      );
    }
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

  async function assertSqlAuthority(client, input) {
    const selected = await client.query(
      `
        SELECT id, organization_id, account_status
        FROM users
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [input.userId],
    );
    const user = selected.rows[0] || null;
    assertAccountAuthority(user, input);
    const workspaceResult = await client.query(
      `
        SELECT id, status
        FROM organizations
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [input.organizationId],
    );
    assertWorkspaceAuthority(workspaceResult.rows[0] || null, input);
    return user;
  }

  async function findSqlReceipt(client, input) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${input.idempotency.scope}:${input.idempotency.operation}:${input.idempotency.key}`,
    ]);
    const result = await client.query(
      `
        SELECT fingerprint, response_status, response_json
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
    assertFingerprint(existing, input.idempotency);
    return existing ? readReceipt(existing.response_json, input) : null;
  }

  async function assertSqlDocumentLimit(client, input) {
    const result = await client.query(
      `
        SELECT COUNT(*)::integer AS document_count
        FROM role_request_documents
        WHERE user_id = $1
      `,
      [input.userId],
    );
    const documentCount = Number(result.rows[0]?.document_count || 0);
    if (documentCount >= MAX_DOCUMENTS_PER_ACCOUNT) {
      throw repositoryError(
        409,
        "ROLE_REQUEST_DOCUMENT_LIMIT_REACHED",
        `An account can retain at most ${MAX_DOCUMENTS_PER_ACCOUNT} role request documents`,
      );
    }
  }

  function createAudit(input, document) {
    return {
      id: createId("audit"),
      actorUserId: input.userId,
      organizationId: input.organizationId,
      action:
        String(input.audit.action || "") ||
        "doctor.role_request.document.upload",
      resourceType: "doctor_document",
      resourceId: document.id,
      ip: String(input.audit.ip || ""),
      userAgent: String(input.audit.userAgent || ""),
      metadata: sanitizeAuditMetadata({
        ...(input.audit.metadata || {}),
        operationId: input.operationId,
        name: document.name,
        contentType: document.contentType,
        byteSize: document.byteSize,
        sha256: document.sha256,
      }),
      createdAt: nowIso(),
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

  async function insertSqlIdempotency(client, input, responseBody) {
    await client.query(
      `
        INSERT INTO mutation_idempotency (
          id, scope, operation, idempotency_key, fingerprint,
          resource_type, resource_id, response_status, response_json,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          'role_request_document', $6, 201, $7::jsonb,
          now(), now()
        )
      `,
      [
        createId("idem"),
        input.idempotency.scope,
        input.idempotency.operation,
        input.idempotency.key,
        input.idempotency.fingerprint,
        responseBody.document.id,
        JSON.stringify(responseBody),
      ],
    );
  }

  function syncRuntimeResult(input, internalDocument, responseBody, auditLog) {
    const db = runtimeDb();
    if (!db.roleRequestDocuments.some((item) => item.id === internalDocument.id)) {
      db.roleRequestDocuments.unshift(clone(internalDocument));
    }
    const user = db.users.find((item) => item.id === input.userId);
    if (user) {
      user.roleRequestDocuments = arrayOf(user.roleRequestDocuments);
      if (!user.roleRequestDocuments.some((item) => item.id === internalDocument.id)) {
        user.roleRequestDocuments = [
          ...user.roleRequestDocuments,
          clone(internalDocument),
        ].slice(-10);
      }
    }
    if (!db.auditLogs.some((item) => item.id === auditLog.id)) {
      db.auditLogs.unshift(clone(auditLog));
    }
    if (
      !db.idempotencyKeys.some(
        (entry) =>
          entry.scope === input.idempotency.scope &&
          entry.operation === input.idempotency.operation &&
          entry.key === input.idempotency.key,
      )
    ) {
      db.idempotencyKeys.unshift({
        id: createId("idem_runtime"),
        scope: input.idempotency.scope,
        operation: input.idempotency.operation,
        key: input.idempotency.key,
        fingerprint: input.idempotency.fingerprint,
        resourceType: "role_request_document",
        resourceId: internalDocument.id,
        responseStatus: 201,
        responseResource: clone(responseBody),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastSeenAt: nowIso(),
      });
    }
  }

  async function findReplay(rawInput = {}) {
    const input = normalizeInput(rawInput, false);
    if (!getPool()) {
      const db = runtimeDb();
      const user = db.users.find((item) => item.id === input.userId) || null;
      assertAccountAuthority(user, input);
      assertWorkspaceAuthority(
        db.organizations.find((item) => item.id === input.organizationId) || null,
        input,
      );
      const replay = findRuntimeReceipt(db, input);
      if (replay) return replay;
      assertRuntimeDocumentLimit(db, input);
      return null;
    }
    return withSqlTransaction(async (client) => {
      await assertSqlAuthority(client, input);
      const replay = await findSqlReceipt(client, input);
      if (replay) return replay;
      await assertSqlDocumentLimit(client, input);
      return null;
    });
  }

  async function isObjectCommitted(rawInput = {}) {
    const input = normalizeObjectOwnershipInput(rawInput);
    if (!getPool()) {
      return runtimeDb().roleRequestDocuments.some(
        (document) =>
          String(document.id || "") === input.documentId &&
          String(document.userId || "") === input.userId &&
          String(document.organizationId || "") === input.organizationId &&
          String(document.objectKey || "") === input.objectKey,
      );
    }

    const pool = getPool();
    const queryable =
      typeof pool.query === "function" ? pool : await pool.connect();
    try {
      const result = await queryable.query(
        `
          SELECT 1
          FROM role_request_documents
          WHERE id = $1
            AND user_id = $2
            AND organization_id = $3
            AND object_key = $4
          LIMIT 1
        `,
        [
          input.documentId,
          input.userId,
          input.organizationId,
          input.objectKey,
        ],
      );
      return result.rows.length > 0;
    } finally {
      if (queryable !== pool && typeof queryable.release === "function") {
        queryable.release();
      }
    }
  }

  async function saveWithAudit(rawInput = {}) {
    const input = normalizeInput(rawInput, true);
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const user = db.users.find((item) => item.id === input.userId) || null;
          assertAccountAuthority(user, input);
          assertWorkspaceAuthority(
            db.organizations.find((item) => item.id === input.organizationId) || null,
            input,
          );
          const replay = findRuntimeReceipt(db, input);
          if (replay) return replay;
          assertRuntimeDocumentLimit(db, input);

          const document = clone(input.document);
          const responseBody = {
            document: publicDocument(document),
            operationId: input.operationId,
          };
          const auditLog = createAudit(input, document);
          syncRuntimeResult(input, document, responseBody, auditLog);
          await saveDb();
          return { ...clone(responseBody), replayed: false, auditLog };
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          if (error?.backendCommitted !== true) error.backendCommitted = false;
          throw error;
        }
      });
    }

    const result = await withSqlTransaction(async (client) => {
      await assertSqlAuthority(client, input);
      const replay = await findSqlReceipt(client, input);
      if (replay) return replay;
      await assertSqlDocumentLimit(client, input);

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
          RETURNING *
        `,
        [
          input.document.id,
          input.document.userId,
          input.document.organizationId,
          input.document.name,
          input.document.contentType,
          input.document.byteSize,
          input.document.sha256,
          input.document.objectKey,
          input.document.storageProvider,
          input.document.uploadedAt,
        ],
      );
      const internalDocument = rowToDocument(inserted.rows[0]);
      const responseBody = {
        document: publicDocument(internalDocument),
        operationId: input.operationId,
      };
      const auditLog = createAudit(input, internalDocument);
      await insertSqlAudit(client, auditLog);
      await insertSqlIdempotency(client, input, responseBody);
      return {
        ...responseBody,
        internalDocument,
        replayed: false,
        auditLog,
      };
    });

    if (result.internalDocument && result.auditLog) {
      try {
        syncRuntimeResult(
          input,
          result.internalDocument,
          { document: result.document, operationId: result.operationId },
          result.auditLog,
        );
        await saveDb();
      } catch (error) {
        error.backendCommitted = true;
        throw error;
      }
    }
    return result;
  }

  async function hydrate() {
    if (!getPool()) {
      return { roleRequestDocuments: runtimeDb().roleRequestDocuments.length };
    }
    const result = await getPool().query(
      `
        SELECT *
        FROM role_request_documents
        ORDER BY uploaded_at DESC, id ASC
        LIMIT 2000
      `,
    );
    const db = runtimeDb();
    db.roleRequestDocuments = result.rows.map(rowToDocument);
    const byUser = new Map();
    for (const document of db.roleRequestDocuments) {
      const documents = byUser.get(document.userId) || [];
      documents.push(document);
      byUser.set(document.userId, documents);
    }
    for (const user of db.users) {
      const canonicalDocuments = byUser.get(user.id) || [];
      if (canonicalDocuments.length > 0) {
        user.roleRequestDocuments = clone(
          canonicalDocuments.slice(0, 10).reverse(),
        );
      } else {
        // Preserve compatibility-only JSON documents until migration imports
        // them into the normalized ledger. An empty SQL table must not erase
        // the only durable reference to an already-uploaded verification file.
        user.roleRequestDocuments = clone(
          arrayOf(user.roleRequestDocuments).slice(-10),
        );
      }
    }
    return { roleRequestDocuments: db.roleRequestDocuments.length };
  }

  return {
    findReplay,
    hydrate,
    isObjectCommitted,
    saveWithAudit,
  };
}

module.exports = {
  MAX_ROLE_REQUEST_DOCUMENT_BYTES,
  OPERATION,
  createRoleRequestDocumentRepository,
  persistRoleRequestDocumentUpload,
  publicDocument,
  repositoryError,
  rowToDocument,
};
