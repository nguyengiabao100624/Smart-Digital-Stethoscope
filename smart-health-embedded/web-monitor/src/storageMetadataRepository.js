const {
  normalizeStorageBucketCreate,
  normalizeStorageFileCreate,
} = require("./storageMetadataContract");
const { sanitizeAuditMetadata } = require("./auditLogContract");

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

function toIso(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function objectOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function rowToStorageBucket(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || row.id,
    description: row.description || "",
    desc: row.description || "",
    iconKey: row.icon_key || "database",
    colorKey: row.color_key || "blue",
    category: row.category || "custom",
    allowedExtensions: arrayOf(row.allowed_extensions),
    allowedMimeTypes: arrayOf(row.allowed_mime_types),
    maxFileSizeMb: Number(row.max_file_size_mb || 500),
    createdByUserId: row.created_by_user_id || "",
    system: false,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToStorageFile(row) {
  if (!row) return null;
  return {
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
    firmwareVersion: row.firmware_version || "",
    tags: arrayOf(row.tags),
    uploader: row.uploader || "",
    createdByUserId: row.created_by_user_id || "",
    status: row.status || "active",
    deletedAt: toIso(row.deleted_at),
    deletedByUserId: row.deleted_by_user_id || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function createStorageMetadataRepository(options) {
  const getDb = options.getDb;
  const saveDb = options.saveDb;
  const createId = options.createId;
  const nowIso = options.nowIso;
  const getPool = options.getPool || (() => null);
  let runtimeMutationTail = Promise.resolve();

  function runtimeDb() {
    const db = getDb();
    db.storageBuckets = arrayOf(db.storageBuckets);
    db.storageFiles = arrayOf(db.storageFiles);
    db.auditLogs = arrayOf(db.auditLogs);
    db.idempotencyKeys = arrayOf(db.idempotencyKeys);
    return db;
  }

  function runRuntimeExclusive(operation) {
    const task = runtimeMutationTail.catch(() => {}).then(operation);
    runtimeMutationTail = task.catch(() => {});
    return task;
  }

  function assertIdempotency(input = {}) {
    if (!input.key) {
      throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    }
    if (!input.scope || !input.operation || !input.fingerprint) {
      throw repositoryError(
        400,
        "IDEMPOTENCY_CONTEXT_INVALID",
        "Idempotency scope, operation and fingerprint are required",
      );
    }
    return {
      scope: String(input.scope),
      operation: String(input.operation),
      key: String(input.key),
      fingerprint: String(input.fingerprint),
    };
  }

  function assertFingerprint(existing, idempotency) {
    const fingerprint = existing?.fingerprint || "";
    if (fingerprint && fingerprint !== idempotency.fingerprint) {
      throw repositoryError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency-Key was already used with a different request payload",
      );
    }
  }

  function runtimeReplay(db, idempotency) {
    const existing = db.idempotencyKeys.find(
      (entry) =>
        entry.scope === idempotency.scope &&
        entry.operation === idempotency.operation &&
        entry.key === idempotency.key,
    );
    assertFingerprint(existing, idempotency);
    if (!existing) return null;
    const responseBody = clone(existing.responseResource || {});
    if (!responseBody || typeof responseBody !== "object") {
      throw repositoryError(
        409,
        "IDEMPOTENCY_OUTCOME_UNAVAILABLE",
        "Stored storage mutation outcome cannot be replayed safely",
      );
    }
    existing.lastSeenAt = nowIso();
    return {
      responseBody,
      responseStatus: Number(existing.responseStatus || 200),
      replayed: true,
    };
  }

  function createAudit(input = {}) {
    return {
      id: createId("audit"),
      actorUserId: String(input.actorUserId || ""),
      organizationId: String(input.organizationId || ""),
      action: String(input.action || "storage.mutation"),
      resourceType: String(input.resourceType || "storage"),
      resourceId: String(input.resourceId || ""),
      ip: String(input.ip || ""),
      userAgent: String(input.userAgent || ""),
      metadata: sanitizeAuditMetadata(clone(objectOf(input.metadata))),
      createdAt: nowIso(),
    };
  }

  function commitRuntimeMutation(db, input) {
    const auditLog = createAudit(input.audit);
    db.auditLogs.unshift(auditLog);
    db.idempotencyKeys.unshift({
      id: createId("idem"),
      scope: input.idempotency.scope,
      operation: input.idempotency.operation,
      key: input.idempotency.key,
      fingerprint: input.idempotency.fingerprint,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      responseStatus: input.responseStatus,
      responseResource: clone(input.responseBody),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastSeenAt: nowIso(),
    });
    db.idempotencyKeys = db.idempotencyKeys.slice(0, 2000);
    return auditLog;
  }

  async function withSqlTransaction(operation) {
    const pool = getPool();
    if (!pool) return null;
    const client = typeof pool.connect === "function" ? await pool.connect() : pool;
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if (client !== pool && typeof client.release === "function") client.release();
    }
  }

  async function sqlReplay(client, idempotency) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${idempotency.scope}:${idempotency.operation}:${idempotency.key}`,
    ]);
    const result = await client.query(
      `
        SELECT fingerprint, response_status, response_json
        FROM mutation_idempotency
        WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
        LIMIT 1
      `,
      [idempotency.scope, idempotency.operation, idempotency.key],
    );
    const existing = result.rows[0] || null;
    assertFingerprint(existing, idempotency);
    if (!existing) return null;
    return {
      responseBody: clone(existing.response_json || {}),
      responseStatus: Number(existing.response_status || 200),
      replayed: true,
    };
  }

  async function insertSqlAudit(client, audit) {
    await client.query(
      `
        INSERT INTO audit_logs (
          id, actor_user_id, organization_id, action, resource_type,
          resource_id, ip, user_agent, metadata, created_at
        )
        VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, $5, $6, NULLIF($7, '')::inet, $8, $9::jsonb, $10::timestamptz)
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

  async function insertSqlIdempotency(client, input) {
    await client.query(
      `
        INSERT INTO mutation_idempotency (
          id, scope, operation, idempotency_key, fingerprint,
          resource_type, resource_id, response_status, response_json, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), now())
      `,
      [
        createId("idem"),
        input.idempotency.scope,
        input.idempotency.operation,
        input.idempotency.key,
        input.idempotency.fingerprint,
        input.resourceType,
        input.resourceId,
        input.responseStatus,
        JSON.stringify(input.responseBody || {}),
      ],
    );
  }

  async function syncSqlOutcomeToRuntime(result, input) {
    await hydrate();
    const db = runtimeDb();
    if (!result.replayed && result.auditLog) {
      db.auditLogs = db.auditLogs.filter((entry) => entry.id !== result.auditLog.id);
      db.auditLogs.unshift(clone(result.auditLog));
    }
    const existing = db.idempotencyKeys.find(
      (entry) =>
        entry.scope === input.idempotency.scope &&
        entry.operation === input.idempotency.operation &&
        entry.key === input.idempotency.key,
    );
    if (!existing) {
      db.idempotencyKeys.unshift({
        id: createId("idem_runtime"),
        scope: input.idempotency.scope,
        operation: input.idempotency.operation,
        key: input.idempotency.key,
        fingerprint: input.idempotency.fingerprint,
        resourceType: input.resourceType,
        resourceId: result.resourceId || "",
        responseStatus: result.responseStatus,
        responseResource: clone(result.responseBody),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastSeenAt: nowIso(),
      });
    }
    db.idempotencyKeys = db.idempotencyKeys.slice(0, 2000);
    await saveDb();
  }

  async function mutateRuntime(input, operation) {
    return runRuntimeExclusive(async () => {
      const db = runtimeDb();
      const snapshot = clone(db);
      try {
        const replay = runtimeReplay(db, input.idempotency);
        if (replay) return replay;
        const outcome = await operation(db);
        const auditLog = commitRuntimeMutation(db, {
          ...input,
          ...outcome,
          audit: {
            ...input.audit,
            resourceType: input.resourceType,
            resourceId: outcome.resourceId,
          },
        });
        await saveDb();
        return {
          responseBody: outcome.responseBody,
          responseStatus: input.responseStatus,
          replayed: false,
          auditLog,
        };
      } catch (error) {
        for (const key of Object.keys(db)) delete db[key];
        Object.assign(db, snapshot);
        throw error;
      }
    });
  }

  async function mutateSql(input, operation) {
    const result = await withSqlTransaction(async (client) => {
      const replay = await sqlReplay(client, input.idempotency);
      if (replay) return replay;
      const outcome = await operation(client);
      const auditLog = createAudit({
        ...input.audit,
        resourceType: input.resourceType,
        resourceId: outcome.resourceId,
      });
      await insertSqlAudit(client, auditLog);
      await insertSqlIdempotency(client, {
        ...input,
        resourceId: outcome.resourceId,
        responseBody: outcome.responseBody,
      });
      return {
        responseBody: outcome.responseBody,
        responseStatus: input.responseStatus,
        replayed: false,
        auditLog,
        resourceId: outcome.resourceId,
      };
    });
    try {
      await syncSqlOutcomeToRuntime(result, input);
    } catch (error) {
      error.storageMetadataCommitted = true;
      throw error;
    }
    return result;
  }

  async function mutate(input, runtimeOperation, sqlOperation) {
    const normalized = {
      ...input,
      idempotency: assertIdempotency(input.idempotency),
    };
    return getPool()
      ? mutateSql(normalized, sqlOperation)
      : mutateRuntime(normalized, runtimeOperation);
  }

  const buckets = {
    async list() {
      const db = runtimeDb();
      if (!getPool()) return clone(db.storageBuckets);
      const result = await getPool().query("SELECT * FROM storage_buckets ORDER BY created_at ASC, id ASC");
      const items = result.rows.map(rowToStorageBucket);
      db.storageBuckets = clone(items);
      return items;
    },

    async create(input = {}) {
      const bucket = normalizeStorageBucketCreate(input.payload, {
        actorUserId: input.audit?.actorUserId,
        now: nowIso(),
      });
      const result = await mutate(
        { ...input, resourceType: "storage_bucket", responseStatus: 201 },
        async (db) => {
          if (db.storageBuckets.some((item) => item.id === bucket.id)) {
            throw repositoryError(409, "STORAGE_BUCKET_EXISTS", "Storage bucket already exists");
          }
          db.storageBuckets.unshift(clone(bucket));
          return { resourceId: bucket.id, responseBody: { bucket: clone(bucket) } };
        },
        async (client) => {
          const existing = await client.query(
            "SELECT id FROM storage_buckets WHERE id = $1 LIMIT 1 FOR UPDATE",
            [bucket.id],
          );
          if (existing.rows[0]) {
            throw repositoryError(409, "STORAGE_BUCKET_EXISTS", "Storage bucket already exists");
          }
          const inserted = await client.query(
            `
              INSERT INTO storage_buckets (
                id, name, description, icon_key, color_key, category,
                allowed_extensions, allowed_mime_types, max_file_size_mb,
                created_by_user_id, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, NULLIF($10, ''), $11::timestamptz, $12::timestamptz)
              RETURNING *
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
              bucket.createdAt,
              bucket.updatedAt,
            ],
          );
          const canonical = rowToStorageBucket(inserted.rows[0]);
          return { resourceId: canonical.id, responseBody: { bucket: canonical } };
        },
      );
      return result;
    },

    async remove(input = {}) {
      const bucketId = String(input.bucketId || "");
      return mutate(
        { ...input, resourceType: "storage_bucket", responseStatus: 200 },
        async (db) => {
          const bucket = db.storageBuckets.find((item) => item.id === bucketId);
          if (!bucket) {
            throw repositoryError(404, "STORAGE_BUCKET_NOT_FOUND", "Storage bucket was not found");
          }
          const occupied = db.storageFiles.some(
            (file) => file.bucket === bucketId && (file.status || "active") === "active",
          );
          if (occupied) {
            throw repositoryError(409, "STORAGE_BUCKET_NOT_EMPTY", "Only an empty storage bucket can be deleted");
          }
          db.storageBuckets = db.storageBuckets.filter((item) => item.id !== bucketId);
          return {
            resourceId: bucketId,
            responseBody: { deleted: true, bucketId },
          };
        },
        async (client) => {
          const selected = await client.query(
            "SELECT * FROM storage_buckets WHERE id = $1 LIMIT 1 FOR UPDATE",
            [bucketId],
          );
          if (!selected.rows[0]) {
            throw repositoryError(404, "STORAGE_BUCKET_NOT_FOUND", "Storage bucket was not found");
          }
          const occupied = await client.query(
            "SELECT id FROM storage_files WHERE bucket_id = $1 AND status = 'active' LIMIT 1 FOR UPDATE",
            [bucketId],
          );
          if (occupied.rows[0]) {
            throw repositoryError(409, "STORAGE_BUCKET_NOT_EMPTY", "Only an empty storage bucket can be deleted");
          }
          await client.query("DELETE FROM storage_buckets WHERE id = $1", [bucketId]);
          return { resourceId: bucketId, responseBody: { deleted: true, bucketId } };
        },
      );
    },
  };

  const files = {
    async list() {
      const db = runtimeDb();
      if (!getPool()) {
        return clone(db.storageFiles.filter((file) => (file.status || "active") === "active"));
      }
      const result = await getPool().query(
        "SELECT * FROM storage_files WHERE status = 'active' ORDER BY created_at DESC, id ASC",
      );
      const items = result.rows.map(rowToStorageFile);
      const deletedRuntime = db.storageFiles.filter((file) => file.status === "deleted");
      db.storageFiles = [...clone(items), ...deletedRuntime];
      return items;
    },

    async findById(fileId, options = {}) {
      const includeDeleted = options.includeDeleted === true;
      const db = runtimeDb();
      if (!getPool()) {
        return (
          db.storageFiles.find(
            (file) => file.id === fileId && (includeDeleted || (file.status || "active") === "active"),
          ) || null
        );
      }
      const result = await getPool().query(
        `SELECT * FROM storage_files WHERE id = $1 ${includeDeleted ? "" : "AND status = 'active'"} LIMIT 1`,
        [fileId],
      );
      return result.rows[0] ? rowToStorageFile(result.rows[0]) : null;
    },

    async create(input = {}) {
      let preparedFile = null;
      const prepareFile = async () => {
        const source = input.prepareFile ? await input.prepareFile() : input.file;
        preparedFile = normalizeStorageFileCreate(source, {
          actorUserId: input.audit?.actorUserId,
          now: nowIso(),
        });
        return preparedFile;
      };
      try {
        return await mutate(
          { ...input, resourceType: "storage_file", responseStatus: 201 },
          async (db) => {
            const file = await prepareFile();
            if (db.storageFiles.some((item) => item.id === file.id || item.objectKey === file.objectKey)) {
              throw repositoryError(409, "STORAGE_FILE_EXISTS", "Storage file metadata already exists");
            }
            db.storageFiles.unshift(clone(file));
            return { resourceId: file.id, responseBody: { file: clone(file) } };
          },
          async (client) => {
            const file = await prepareFile();
            const inserted = await client.query(
            `
              INSERT INTO storage_files (
                id, organization_id, bucket_id, name, object_key, storage_provider,
                content_type, file_type, byte_size, checksum_sha256, firmware_version,
                tags, uploader, created_by_user_id, status, created_at, updated_at
              )
              VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12::jsonb, $13, NULLIF($14, ''), 'active', $15::timestamptz, $16::timestamptz
              )
              RETURNING *
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
              file.createdAt,
              file.updatedAt,
            ],
            );
            const canonical = rowToStorageFile(inserted.rows[0]);
            return { resourceId: canonical.id, responseBody: { file: canonical } };
          },
        );
      } catch (error) {
        if (preparedFile && input.cleanupFile && !error.storageMetadataCommitted) {
          await input.cleanupFile(preparedFile).catch(() => {});
        }
        throw error;
      }
    },

    async remove(input = {}) {
      const fileId = String(input.fileId || "");
      const deletedByUserId = String(input.audit?.actorUserId || "");
      return mutate(
        { ...input, resourceType: "storage_file", responseStatus: 200 },
        async (db) => {
          const file = db.storageFiles.find(
            (item) => item.id === fileId && (item.status || "active") === "active",
          );
          if (!file) {
            throw repositoryError(404, "STORAGE_FILE_NOT_FOUND", "Storage file was not found");
          }
          if (input.deleteObject) await input.deleteObject(clone(file));
          file.status = "deleted";
          file.deletedAt = nowIso();
          file.deletedByUserId = deletedByUserId;
          file.updatedAt = file.deletedAt;
          return { resourceId: fileId, responseBody: { deleted: true, fileId } };
        },
        async (client) => {
          const selected = await client.query(
            "SELECT * FROM storage_files WHERE id = $1 AND status = 'active' LIMIT 1 FOR UPDATE",
            [fileId],
          );
          if (!selected.rows[0]) {
            throw repositoryError(404, "STORAGE_FILE_NOT_FOUND", "Storage file was not found");
          }
          const selectedFile = rowToStorageFile(selected.rows[0]);
          if (input.deleteObject) await input.deleteObject(selectedFile);
          const deletedAt = nowIso();
          await client.query(
            `
              UPDATE storage_files
              SET status = 'deleted', deleted_at = $2::timestamptz,
                  deleted_by_user_id = NULLIF($3, ''), updated_at = $2::timestamptz
              WHERE id = $1
            `,
            [fileId, deletedAt, deletedByUserId],
          );
          return { resourceId: fileId, responseBody: { deleted: true, fileId } };
        },
      );
    },

    async recordShare(input = {}) {
      const fileId = String(input.fileId || "");
      return mutate(
        { ...input, resourceType: "storage_file", responseStatus: 200 },
        async () => ({
          resourceId: fileId,
          responseBody: clone(input.createResponse ? await input.createResponse() : input.responseBody || {}),
        }),
        async () => ({
          resourceId: fileId,
          responseBody: clone(input.createResponse ? await input.createResponse() : input.responseBody || {}),
        }),
      );
    },
  };

  async function hydrate() {
    if (!getPool()) {
      const db = runtimeDb();
      return {
        storageBuckets: db.storageBuckets.length,
        storageFiles: db.storageFiles.filter((file) => (file.status || "active") === "active").length,
      };
    }
    const [bucketResult, fileResult] = await Promise.all([
      getPool().query("SELECT * FROM storage_buckets ORDER BY created_at ASC, id ASC"),
      getPool().query("SELECT * FROM storage_files ORDER BY created_at DESC, id ASC"),
    ]);
    const db = runtimeDb();
    db.storageBuckets = bucketResult.rows.map(rowToStorageBucket);
    db.storageFiles = fileResult.rows.map(rowToStorageFile);
    return {
      storageBuckets: db.storageBuckets.length,
      storageFiles: db.storageFiles.filter((file) => file.status === "active").length,
    };
  }

  return { buckets, files, hydrate };
}

module.exports = {
  createStorageMetadataRepository,
  repositoryError,
  rowToStorageBucket,
  rowToStorageFile,
};
