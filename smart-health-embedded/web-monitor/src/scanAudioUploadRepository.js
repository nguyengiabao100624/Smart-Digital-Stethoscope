const crypto = require("node:crypto");

const WRITABLE_SCAN_STATUSES = new Set(["created", "recording", "uploading", "interrupted"]);
const COMPLETION_STATUSES = new Set(["processing", "completed", "failed"]);
const PROCESSING_LEASE_MS = 15 * 60 * 1000;
const MAX_SCAN_AUDIO_CHUNK_BYTES = 1 * 1024 * 1024;
const MAX_SCAN_AUDIO_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_SCAN_AUDIO_CHUNK_COUNT = 32_768;

function repositoryError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stringValue(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function completionManifest(chunks) {
  return crypto
    .createHash("sha256")
    .update(chunks.map((chunk) => `${chunk.sequence}:${chunk.sha256}:${chunk.byteSize}`).join("\n"))
    .digest("hex");
}

function rowToChunk(row) {
  if (!row) return null;
  return {
    id: row.id,
    scanId: row.scan_id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    idempotencyKey: row.idempotency_key,
    sequence: Number(row.chunk_sequence),
    sha256: row.sha256,
    byteSize: Number(row.byte_size),
    filePath: row.file_path,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ""),
  };
}

function rowToCompletion(row) {
  if (!row) return null;
  const response = typeof row.response_json === "string"
    ? JSON.parse(row.response_json || "{}")
    : clone(row.response_json || {});
  return {
    id: row.id,
    scanId: row.scan_id,
    organizationId: row.organization_id,
    actorUserId: row.actor_user_id,
    idempotencyKey: row.idempotency_key,
    leaseToken: row.lease_token || "",
    status: row.status,
    manifestSha256: row.manifest_sha256 || "",
    chunkCount: Number(row.chunk_count || 0),
    totalBytes: Number(row.total_bytes || 0),
    response,
    errorCode: row.error_code || "",
    errorMessage: row.error_message || "",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ""),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ""),
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at || ""),
  };
}

function createScanAudioUploadRepository(options) {
  const getDb = options.getDb;
  const saveDb = options.saveDb;
  const getPool = options.getPool || (() => null);
  const createId = options.createId;
  const nowIso = options.nowIso;
  const mutationTails = new Map();
  const activeLeases = new Map();
  const processingLeaseMs = Number.isFinite(Number(options.processingLeaseMs))
    ? Math.max(1000, Number(options.processingLeaseMs))
    : PROCESSING_LEASE_MS;
  const normalizeLimit = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, fallback) : fallback;
  };
  const maxChunkBytes = normalizeLimit(options.maxChunkBytes, MAX_SCAN_AUDIO_CHUNK_BYTES);
  const maxTotalBytes = normalizeLimit(options.maxTotalBytes, MAX_SCAN_AUDIO_TOTAL_BYTES);
  const maxChunkCount = normalizeLimit(options.maxChunkCount, MAX_SCAN_AUDIO_CHUNK_COUNT);

  function completionIntentKey(input) {
    return [
      stringValue(input.scanId, 160),
      stringValue(input.organizationId, 160),
      stringValue(input.actorUserId, 160),
      stringValue(input.idempotencyKey, 160),
    ].join(":");
  }

  function createLeaseToken() {
    return crypto.randomBytes(24).toString("hex");
  }

  function isProcessingLeaseExpired(completion, timestamp = nowIso()) {
    const nowMs = Date.parse(String(timestamp || ""));
    const updatedMs = Date.parse(String(completion?.updatedAt || completion?.createdAt || ""));
    if (!Number.isFinite(nowMs)) return false;
    if (!Number.isFinite(updatedMs)) return true;
    return nowMs - updatedMs >= processingLeaseMs;
  }

  function rememberLease(input, leaseToken) {
    if (leaseToken) activeLeases.set(completionIntentKey(input), leaseToken);
  }

  function currentLease(input) {
    return activeLeases.get(completionIntentKey(input)) || "";
  }

  function clearLease(input) {
    activeLeases.delete(completionIntentKey(input));
  }

  function assertCompletionLease(input, completion) {
    const persistedToken = stringValue(completion?.leaseToken, 240);
    if (!persistedToken) return;
    const suppliedToken = stringValue(input.leaseToken, 240);
    const localToken = currentLease(input);
    const candidate = suppliedToken || localToken;
    if (candidate && candidate !== persistedToken) {
      throw repositoryError(
        409,
        "SCAN_AUDIO_COMPLETION_LEASE_LOST",
        "Audio completion lease was replaced by a recovery attempt",
      );
    }
    // A completion resumed by another process can finish without exposing the
    // internal token to the HTTP layer, but only while its persisted lease is
    // still fresh. Once stale, a caller without the current token fails closed.
    if (!candidate && isProcessingLeaseExpired(completion)) {
      throw repositoryError(
        409,
        "SCAN_AUDIO_COMPLETION_LEASE_LOST",
        "Audio completion lease has expired",
      );
    }
  }

  function runtimeDb() {
    const db = getDb();
    db.scans = Array.isArray(db.scans) ? db.scans : [];
    db.scanAudioChunks = Array.isArray(db.scanAudioChunks) ? db.scanAudioChunks : [];
    db.scanAudioCompletions = Array.isArray(db.scanAudioCompletions) ? db.scanAudioCompletions : [];
    return db;
  }

  function syncRuntimeItem(collection, value) {
    if (!value?.id) return value;
    const index = collection.findIndex((item) => item.id === value.id);
    if (index >= 0) collection[index] = { ...collection[index], ...clone(value) };
    else collection.push(clone(value));
    return value;
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
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      if (client !== pool && typeof client.release === "function") client.release();
    }
  }

  function runSerialized(scanId, operation) {
    const key = stringValue(scanId, 160);
    const previous = mutationTails.get(key) || Promise.resolve();
    let current;
    current = previous
      .catch(() => {})
      .then(operation)
      .finally(() => {
        if (mutationTails.get(key) === current) mutationTails.delete(key);
      });
    mutationTails.set(key, current);
    return current;
  }

  function findScopedScan(db, input) {
    const scan = db.scans.find((item) => item.id === input.scanId) || null;
    if (!scan) {
      throw repositoryError(404, "SCAN_AUDIO_SCAN_NOT_FOUND", "Scan was not found");
    }
    if (!input.organizationId || scan.organizationId !== input.organizationId) {
      throw repositoryError(403, "SCAN_AUDIO_SCOPE_DENIED", "Scan audio is outside the authorized workspace");
    }
    return scan;
  }

  function validateChunkInput(input) {
    const normalized = {
      scanId: stringValue(input.scanId, 160),
      organizationId: stringValue(input.organizationId, 160),
      actorUserId: stringValue(input.actorUserId, 160),
      idempotencyKey: stringValue(input.idempotencyKey, 160),
      sequence: Number(input.sequence),
      sha256: stringValue(input.sha256, 64).toLowerCase(),
      byteSize: Number(input.byteSize),
      filePath: stringValue(input.filePath, 1000),
    };
    if (!normalized.scanId || !normalized.organizationId || !normalized.actorUserId) {
      throw repositoryError(400, "SCAN_AUDIO_INPUT_INVALID", "Scan, workspace, and actor are required");
    }
    if (!normalized.idempotencyKey) {
      throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    }
    if (!Number.isSafeInteger(normalized.sequence) || normalized.sequence < 0) {
      throw repositoryError(400, "SCAN_AUDIO_SEQUENCE_INVALID", "Chunk sequence must be a nonnegative integer");
    }
    if (!/^[0-9a-f]{64}$/.test(normalized.sha256)) {
      throw repositoryError(400, "SCAN_AUDIO_SHA256_INVALID", "Chunk SHA-256 must contain 64 lowercase hexadecimal characters");
    }
    if (!Number.isSafeInteger(normalized.byteSize) || normalized.byteSize < 1 || !normalized.filePath) {
      throw repositoryError(400, "SCAN_AUDIO_CHUNK_INVALID", "Chunk byte size and durable file path are required");
    }
    if (normalized.byteSize > maxChunkBytes) {
      throw repositoryError(413, "SCAN_AUDIO_CHUNK_TOO_LARGE", "Audio chunk exceeds the allowed byte limit", {
        maxChunkBytes,
        actualBytes: normalized.byteSize,
      });
    }
    return normalized;
  }

  function orderedRuntimeChunks(db, scanId, organizationId) {
    const chunks = db.scanAudioChunks
      .filter((item) => item.scanId === scanId && item.organizationId === organizationId)
      .sort((left, right) => Number(left.sequence) - Number(right.sequence));
    for (let index = 0; index < chunks.length; index += 1) {
      if (Number(chunks[index].sequence) !== index) {
        throw repositoryError(409, "SCAN_AUDIO_LEDGER_INVALID", "Stored audio chunks are not contiguous", {
          expectedSequence: index,
          actualSequence: Number(chunks[index].sequence),
        });
      }
    }
    return chunks;
  }

  async function appendRuntimeChunk(input) {
    const db = runtimeDb();
    const snapshot = {
      scans: clone(db.scans),
      scanAudioChunks: clone(db.scanAudioChunks),
      scanAudioCompletions: clone(db.scanAudioCompletions),
    };
    try {
      const scan = findScopedScan(db, input);
      const scopedKeyMatch = db.scanAudioChunks.find(
        (item) =>
          item.organizationId === input.organizationId &&
          item.actorUserId === input.actorUserId &&
          item.idempotencyKey === input.idempotencyKey,
      );
      if (scopedKeyMatch) {
        const exact =
          scopedKeyMatch.scanId === input.scanId &&
          Number(scopedKeyMatch.sequence) === input.sequence &&
          scopedKeyMatch.sha256 === input.sha256 &&
          Number(scopedKeyMatch.byteSize) === input.byteSize;
        if (!exact) {
          throw repositoryError(
            409,
            "SCAN_AUDIO_IDEMPOTENCY_MISMATCH",
            "Idempotency-Key was already used for a different audio chunk",
          );
        }
        const chunks = orderedRuntimeChunks(db, input.scanId, input.organizationId);
        return {
          chunk: clone(scopedKeyMatch),
          uploadedBytes: chunks.reduce((sum, item) => sum + Number(item.byteSize || 0), 0),
          nextSequence: chunks.length,
          replayed: true,
        };
      }
      const completion = db.scanAudioCompletions.find((item) => item.scanId === input.scanId);
      if (completion || !WRITABLE_SCAN_STATUSES.has(String(scan.status || "created"))) {
        throw repositoryError(409, "SCAN_AUDIO_UPLOAD_CLOSED", "Audio upload no longer accepts chunks", {
          scanStatus: scan.status || "",
          completionStatus: completion?.status || "",
        });
      }
      const chunks = orderedRuntimeChunks(db, input.scanId, input.organizationId);
      const existingSequence = chunks.find((item) => Number(item.sequence) === input.sequence);
      if (existingSequence) {
        throw repositoryError(409, "SCAN_AUDIO_SEQUENCE_CONFLICT", "Chunk sequence is already committed", {
          sequence: input.sequence,
        });
      }
      if (input.sequence !== chunks.length) {
        throw repositoryError(409, "SCAN_AUDIO_SEQUENCE_GAP", "Chunk sequence must be contiguous", {
          expectedSequence: chunks.length,
          actualSequence: input.sequence,
        });
      }
      if (chunks.length >= maxChunkCount || input.sequence >= maxChunkCount) {
        throw repositoryError(413, "SCAN_AUDIO_CHUNK_COUNT_EXCEEDED", "Audio upload exceeds the allowed chunk count", {
          maxChunkCount,
        });
      }
      const uploadedBytes = chunks.reduce((sum, item) => sum + Number(item.byteSize || 0), 0);
      if (uploadedBytes + input.byteSize > maxTotalBytes) {
        throw repositoryError(413, "SCAN_AUDIO_UPLOAD_LIMIT_EXCEEDED", "Audio upload exceeds the allowed total byte limit", {
          maxTotalBytes,
          uploadedBytes,
          requestedBytes: input.byteSize,
        });
      }
      const timestamp = nowIso();
      const chunk = {
        id: createId("chunk"),
        ...input,
        createdAt: timestamp,
      };
      db.scanAudioChunks.push(chunk);
      const nextChunks = [...chunks, chunk];
      scan.status = "uploading";
      scan.processingStatus = "uploading";
      scan.uploadedBytes = uploadedBytes + input.byteSize;
      scan.audioChunkCount = nextChunks.length;
      scan.updatedAt = timestamp;
      await saveDb();
      return {
        chunk: clone(chunk),
        uploadedBytes: scan.uploadedBytes,
        nextSequence: nextChunks.length,
        replayed: false,
      };
    } catch (error) {
      db.scans = snapshot.scans;
      db.scanAudioChunks = snapshot.scanAudioChunks;
      db.scanAudioCompletions = snapshot.scanAudioCompletions;
      throw error;
    }
  }

  async function appendSqlChunk(input) {
    const result = await withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`scan-audio:${input.scanId}`]);
      const scanResult = await client.query(
        "SELECT * FROM scan_sessions WHERE id = $1 LIMIT 1 FOR UPDATE",
        [input.scanId],
      );
      const scan = scanResult.rows?.[0] || null;
      if (!scan) throw repositoryError(404, "SCAN_AUDIO_SCAN_NOT_FOUND", "Scan was not found");
      if (!input.organizationId || scan.organization_id !== input.organizationId) {
        throw repositoryError(403, "SCAN_AUDIO_SCOPE_DENIED", "Scan audio is outside the authorized workspace");
      }
      const keyResult = await client.query(
        `SELECT *
         FROM scan_audio_chunks
         WHERE organization_id = $1 AND actor_user_id = $2 AND idempotency_key = $3
         LIMIT 1`,
        [input.organizationId, input.actorUserId, input.idempotencyKey],
      );
      const keyMatch = rowToChunk(keyResult.rows?.[0]);
      if (keyMatch) {
        const exact =
          keyMatch.scanId === input.scanId &&
          keyMatch.sequence === input.sequence &&
          keyMatch.sha256 === input.sha256 &&
          keyMatch.byteSize === input.byteSize;
        if (!exact) {
          throw repositoryError(
            409,
            "SCAN_AUDIO_IDEMPOTENCY_MISMATCH",
            "Idempotency-Key was already used for a different audio chunk",
          );
        }
        return {
          chunk: keyMatch,
          uploadedBytes: Number(scan.uploaded_bytes || 0),
          nextSequence: Number(scan.audio_chunk_count || 0),
          replayed: true,
          scan,
        };
      }
      const completionResult = await client.query(
        "SELECT * FROM scan_audio_completions WHERE scan_id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE",
        [input.scanId, input.organizationId],
      );
      const completion = completionResult.rows?.[0] || null;
      if (completion || !WRITABLE_SCAN_STATUSES.has(String(scan.status || "created"))) {
        throw repositoryError(409, "SCAN_AUDIO_UPLOAD_CLOSED", "Audio upload no longer accepts chunks", {
          scanStatus: scan.status || "",
          completionStatus: completion?.status || "",
        });
      }
      const chunksResult = await client.query(
        "SELECT * FROM scan_audio_chunks WHERE scan_id = $1 AND organization_id = $2 ORDER BY chunk_sequence ASC",
        [input.scanId, input.organizationId],
      );
      const chunks = (chunksResult.rows || []).map(rowToChunk);
      for (let index = 0; index < chunks.length; index += 1) {
        if (chunks[index].sequence !== index) {
          throw repositoryError(409, "SCAN_AUDIO_LEDGER_INVALID", "Stored audio chunks are not contiguous", {
            expectedSequence: index,
            actualSequence: chunks[index].sequence,
          });
        }
      }
      if (input.sequence < chunks.length) {
        throw repositoryError(409, "SCAN_AUDIO_SEQUENCE_CONFLICT", "Chunk sequence is already committed", {
          sequence: input.sequence,
        });
      }
      if (input.sequence !== chunks.length) {
        throw repositoryError(409, "SCAN_AUDIO_SEQUENCE_GAP", "Chunk sequence must be contiguous", {
          expectedSequence: chunks.length,
          actualSequence: input.sequence,
        });
      }
      if (chunks.length >= maxChunkCount || input.sequence >= maxChunkCount) {
        throw repositoryError(413, "SCAN_AUDIO_CHUNK_COUNT_EXCEEDED", "Audio upload exceeds the allowed chunk count", {
          maxChunkCount,
        });
      }
      const currentUploadedBytes = chunks.reduce((sum, item) => sum + item.byteSize, 0);
      if (currentUploadedBytes + input.byteSize > maxTotalBytes) {
        throw repositoryError(413, "SCAN_AUDIO_UPLOAD_LIMIT_EXCEEDED", "Audio upload exceeds the allowed total byte limit", {
          maxTotalBytes,
          uploadedBytes: currentUploadedBytes,
          requestedBytes: input.byteSize,
        });
      }
      const timestamp = nowIso();
      const inserted = await client.query(
        `INSERT INTO scan_audio_chunks (
           id, scan_id, organization_id, actor_user_id, idempotency_key,
           chunk_sequence, sha256, byte_size, file_path, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)
         RETURNING *`,
        [
          createId("chunk"),
          input.scanId,
          input.organizationId,
          input.actorUserId,
          input.idempotencyKey,
          input.sequence,
          input.sha256,
          input.byteSize,
          input.filePath,
          timestamp,
        ],
      );
      const committedChunk = rowToChunk(inserted.rows?.[0]);
      const uploadedBytes = currentUploadedBytes + input.byteSize;
      const nextSequence = chunks.length + 1;
      const updatedScan = await client.query(
        `UPDATE scan_sessions
         SET status = 'uploading', processing_status = 'uploading', uploaded_bytes = $2,
             audio_chunk_count = $3, updated_at = $4::timestamptz
         WHERE id = $1
         RETURNING *`,
        [input.scanId, uploadedBytes, nextSequence, timestamp],
      );
      return {
        chunk: committedChunk,
        uploadedBytes,
        nextSequence,
        replayed: false,
        scan: updatedScan.rows?.[0] || scan,
      };
    });
    const db = runtimeDb();
    syncRuntimeItem(db.scanAudioChunks, result.chunk);
    const runtimeScan = db.scans.find((item) => item.id === input.scanId);
    if (runtimeScan) {
      runtimeScan.status = result.scan.status || "uploading";
      runtimeScan.processingStatus = result.scan.processing_status || "uploading";
      runtimeScan.uploadedBytes = result.uploadedBytes;
      runtimeScan.audioChunkCount = result.nextSequence;
      runtimeScan.updatedAt = result.scan.updated_at instanceof Date
        ? result.scan.updated_at.toISOString()
        : String(result.scan.updated_at || runtimeScan.updatedAt || "");
    }
    return {
      chunk: clone(result.chunk),
      uploadedBytes: result.uploadedBytes,
      nextSequence: result.nextSequence,
      replayed: result.replayed,
    };
  }

  function validateCompletionInput(input) {
    const normalized = {
      scanId: stringValue(input.scanId, 160),
      organizationId: stringValue(input.organizationId, 160),
      actorUserId: stringValue(input.actorUserId, 160),
      idempotencyKey: stringValue(input.idempotencyKey, 160),
      leaseToken: stringValue(input.leaseToken, 240),
    };
    if (!normalized.scanId || !normalized.organizationId || !normalized.actorUserId) {
      throw repositoryError(400, "SCAN_AUDIO_INPUT_INVALID", "Scan, workspace, and actor are required");
    }
    if (!normalized.idempotencyKey) {
      throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    }
    return normalized;
  }

  async function beginRuntimeCompletion(input) {
    const db = runtimeDb();
    const snapshot = {
      scans: clone(db.scans),
      scanAudioCompletions: clone(db.scanAudioCompletions),
    };
    try {
      const scan = findScopedScan(db, input);
      const existing = db.scanAudioCompletions.find((item) => item.scanId === input.scanId) || null;
      if (existing) {
        const sameIntent =
          existing.organizationId === input.organizationId &&
          existing.actorUserId === input.actorUserId &&
          existing.idempotencyKey === input.idempotencyKey;
        if (!sameIntent) {
          throw repositoryError(409, "SCAN_AUDIO_COMPLETION_CLOSED", "Audio completion already belongs to another intent");
        }
        if (existing.status === "completed") {
          return { action: "replay", completion: clone(existing), response: clone(existing.response), chunks: [] };
        }
        if (existing.status === "processing") {
          if (!isProcessingLeaseExpired(existing)) {
            return { action: "in_progress", completion: clone(existing), chunks: [] };
          }
        }
      }
      if (!existing && !WRITABLE_SCAN_STATUSES.has(String(scan.status || "created"))) {
        throw repositoryError(409, "SCAN_AUDIO_COMPLETION_CLOSED", "Scan cannot be completed from its current state", {
          scanStatus: scan.status || "",
        });
      }
      const chunks = orderedRuntimeChunks(db, input.scanId, input.organizationId);
      if (!chunks.length) {
        throw repositoryError(409, "SCAN_AUDIO_CHUNKS_REQUIRED", "At least one committed audio chunk is required");
      }
      const totalBytes = chunks.reduce((sum, item) => sum + Number(item.byteSize || 0), 0);
      if (chunks.length > maxChunkCount || totalBytes > maxTotalBytes) {
        throw repositoryError(413, "SCAN_AUDIO_UPLOAD_LIMIT_EXCEEDED", "Committed audio upload exceeds the allowed limits", {
          maxChunkCount,
          maxTotalBytes,
          chunkCount: chunks.length,
          totalBytes,
        });
      }
      const timestamp = nowIso();
      const manifestSha256 = completionManifest(chunks);
      const completion = existing || {
        id: createId("completion"),
        scanId: input.scanId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
        createdAt: timestamp,
      };
      Object.assign(completion, {
        status: "processing",
        leaseToken: createLeaseToken(),
        manifestSha256,
        chunkCount: chunks.length,
        totalBytes,
        response: null,
        errorCode: "",
        errorMessage: "",
        updatedAt: timestamp,
      });
      if (!existing) db.scanAudioCompletions.push(completion);
      rememberLease(input, completion.leaseToken);
      await saveDb();
      return { action: "start", completion: clone(completion), chunks: clone(chunks) };
    } catch (error) {
      db.scans = snapshot.scans;
      db.scanAudioCompletions = snapshot.scanAudioCompletions;
      throw error;
    }
  }

  async function finishRuntimeCompletion(input) {
    const db = runtimeDb();
    const snapshot = {
      scans: clone(db.scans),
      scanAudioCompletions: clone(db.scanAudioCompletions),
    };
    try {
      const scan = findScopedScan(db, input);
      const completion = db.scanAudioCompletions.find((item) => item.scanId === input.scanId) || null;
      if (
        !completion ||
        completion.organizationId !== input.organizationId ||
        completion.actorUserId !== input.actorUserId ||
        completion.idempotencyKey !== input.idempotencyKey
      ) {
        throw repositoryError(409, "SCAN_AUDIO_COMPLETION_NOT_STARTED", "Audio completion was not started by this intent");
      }
      if (completion.status === "completed") return clone(completion);
      assertCompletionLease(input, completion);
      const timestamp = nowIso();
      completion.status = "completed";
      completion.response = clone(input.response || {});
      completion.completedAt = timestamp;
      completion.updatedAt = timestamp;
      completion.leaseToken = "";
      completion.errorCode = "";
      completion.errorMessage = "";
      scan.audioUploadCompletedAt = timestamp;
      scan.updatedAt = timestamp;
      await saveDb();
      clearLease(input);
      return clone(completion);
    } catch (error) {
      db.scans = snapshot.scans;
      db.scanAudioCompletions = snapshot.scanAudioCompletions;
      throw error;
    }
  }

  async function failRuntimeCompletion(input) {
    const db = runtimeDb();
    findScopedScan(db, input);
    const completion = db.scanAudioCompletions.find((item) => item.scanId === input.scanId) || null;
    if (
      !completion ||
      completion.organizationId !== input.organizationId ||
      completion.actorUserId !== input.actorUserId ||
      completion.idempotencyKey !== input.idempotencyKey ||
      completion.status === "completed"
    ) return null;
    assertCompletionLease(input, completion);
    completion.status = "failed";
    completion.leaseToken = "";
    completion.errorCode = stringValue(input.errorCode, 120);
    completion.errorMessage = stringValue(input.errorMessage, 1000);
    completion.updatedAt = nowIso();
    await saveDb();
    clearLease(input);
    return clone(completion);
  }

  async function beginSqlCompletion(input) {
    const outcome = await withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`scan-audio:${input.scanId}`]);
      const scanResult = await client.query(
        "SELECT * FROM scan_sessions WHERE id = $1 LIMIT 1 FOR UPDATE",
        [input.scanId],
      );
      const scan = scanResult.rows?.[0] || null;
      if (!scan) throw repositoryError(404, "SCAN_AUDIO_SCAN_NOT_FOUND", "Scan was not found");
      if (!input.organizationId || scan.organization_id !== input.organizationId) {
        throw repositoryError(403, "SCAN_AUDIO_SCOPE_DENIED", "Scan audio is outside the authorized workspace");
      }
      const completionResult = await client.query(
        "SELECT * FROM scan_audio_completions WHERE scan_id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE",
        [input.scanId, input.organizationId],
      );
      const existing = rowToCompletion(completionResult.rows?.[0]);
      if (existing) {
        const sameIntent =
          existing.organizationId === input.organizationId &&
          existing.actorUserId === input.actorUserId &&
          existing.idempotencyKey === input.idempotencyKey;
        if (!sameIntent) {
          throw repositoryError(409, "SCAN_AUDIO_COMPLETION_CLOSED", "Audio completion already belongs to another intent");
        }
        if (existing.status === "completed") {
          return { action: "replay", completion: existing, response: clone(existing.response), chunks: [] };
        }
        if (existing.status === "processing") {
          if (!isProcessingLeaseExpired(existing)) {
            return { action: "in_progress", completion: existing, chunks: [] };
          }
        }
      }
      if (!existing && !WRITABLE_SCAN_STATUSES.has(String(scan.status || "created"))) {
        throw repositoryError(409, "SCAN_AUDIO_COMPLETION_CLOSED", "Scan cannot be completed from its current state", {
          scanStatus: scan.status || "",
        });
      }
      const keyResult = await client.query(
        `SELECT *
         FROM scan_audio_completions
         WHERE organization_id = $1 AND actor_user_id = $2 AND idempotency_key = $3
         LIMIT 1`,
        [input.organizationId, input.actorUserId, input.idempotencyKey],
      );
      const keyMatch = rowToCompletion(keyResult.rows?.[0]);
      if (keyMatch && keyMatch.scanId !== input.scanId) {
        throw repositoryError(
          409,
          "SCAN_AUDIO_COMPLETION_IDEMPOTENCY_MISMATCH",
          "Idempotency-Key was already used for another scan completion",
        );
      }
      const chunksResult = await client.query(
        "SELECT * FROM scan_audio_chunks WHERE scan_id = $1 AND organization_id = $2 ORDER BY chunk_sequence ASC",
        [input.scanId, input.organizationId],
      );
      const chunks = (chunksResult.rows || []).map(rowToChunk);
      if (!chunks.length) {
        throw repositoryError(409, "SCAN_AUDIO_CHUNKS_REQUIRED", "At least one committed audio chunk is required");
      }
      for (let index = 0; index < chunks.length; index += 1) {
        if (chunks[index].sequence !== index) {
          throw repositoryError(409, "SCAN_AUDIO_LEDGER_INVALID", "Stored audio chunks are not contiguous", {
            expectedSequence: index,
            actualSequence: chunks[index].sequence,
          });
        }
      }
      const timestamp = nowIso();
      const manifestSha256 = completionManifest(chunks);
      const totalBytes = chunks.reduce((sum, item) => sum + item.byteSize, 0);
      if (chunks.length > maxChunkCount || totalBytes > maxTotalBytes) {
        throw repositoryError(413, "SCAN_AUDIO_UPLOAD_LIMIT_EXCEEDED", "Committed audio upload exceeds the allowed limits", {
          maxChunkCount,
          maxTotalBytes,
          chunkCount: chunks.length,
          totalBytes,
        });
      }
      const leaseToken = createLeaseToken();
      const persisted = existing
        ? await client.query(
          `UPDATE scan_audio_completions
           SET status = 'processing', manifest_sha256 = $3, chunk_count = $4, total_bytes = $5,
               response_json = '{}'::jsonb, error_code = '', error_message = '', completed_at = NULL,
               lease_token = $6, updated_at = $7::timestamptz
           WHERE scan_id = $1 AND idempotency_key = $2
            RETURNING *`,
          [input.scanId, input.idempotencyKey, manifestSha256, chunks.length, totalBytes, leaseToken, timestamp],
        )
        : await client.query(
          `INSERT INTO scan_audio_completions (
             id, scan_id, organization_id, actor_user_id, idempotency_key, status,
             manifest_sha256, chunk_count, total_bytes, response_json,
             error_code, error_message, lease_token, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, 'processing', $6, $7, $8, '{}'::jsonb, '', '', $9, $10::timestamptz, $10::timestamptz)
            RETURNING *`,
          [
            createId("completion"),
            input.scanId,
            input.organizationId,
            input.actorUserId,
            input.idempotencyKey,
            manifestSha256,
            chunks.length,
            totalBytes,
            leaseToken,
            timestamp,
          ],
        );
      const completion = rowToCompletion(persisted.rows?.[0]);
      rememberLease(input, completion.leaseToken);
      return { action: "start", completion, chunks };
    });
    const db = runtimeDb();
    syncRuntimeItem(db.scanAudioCompletions, outcome.completion);
    return clone(outcome);
  }

  async function finishSqlCompletion(input) {
    const completion = await withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`scan-audio:${input.scanId}`]);
      const scanResult = await client.query(
        "SELECT * FROM scan_sessions WHERE id = $1 LIMIT 1 FOR UPDATE",
        [input.scanId],
      );
      const scan = scanResult.rows?.[0] || null;
      if (!scan) throw repositoryError(404, "SCAN_AUDIO_SCAN_NOT_FOUND", "Scan was not found");
      if (!input.organizationId || scan.organization_id !== input.organizationId) {
        throw repositoryError(403, "SCAN_AUDIO_SCOPE_DENIED", "Scan audio is outside the authorized workspace");
      }
      const selected = await client.query(
        "SELECT * FROM scan_audio_completions WHERE scan_id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE",
        [input.scanId, input.organizationId],
      );
      const current = rowToCompletion(selected.rows?.[0]);
      const sameIntent =
        current &&
        current.organizationId === input.organizationId &&
        current.actorUserId === input.actorUserId &&
        current.idempotencyKey === input.idempotencyKey;
      if (!sameIntent) {
        throw repositoryError(409, "SCAN_AUDIO_COMPLETION_NOT_STARTED", "Audio completion was not started by this intent");
      }
      if (current.status === "completed") return current;
      assertCompletionLease(input, current);
      const timestamp = nowIso();
      const updated = await client.query(
        `UPDATE scan_audio_completions
         SET status = 'completed', response_json = $3::jsonb, completed_at = $4::timestamptz,
             updated_at = $4::timestamptz, error_code = '', error_message = '', lease_token = NULL
          WHERE scan_id = $1 AND idempotency_key = $2
         RETURNING *`,
        [input.scanId, input.idempotencyKey, JSON.stringify(input.response || {}), timestamp],
      );
      await client.query(
        `UPDATE scan_sessions
         SET audio_upload_completed_at = $2::timestamptz, updated_at = $2::timestamptz
         WHERE id = $1
         RETURNING *`,
        [input.scanId, timestamp],
      );
      return rowToCompletion(updated.rows?.[0]);
    });
    const db = runtimeDb();
    syncRuntimeItem(db.scanAudioCompletions, completion);
    const scan = db.scans.find((item) => item.id === input.scanId);
    if (scan) {
      scan.audioUploadCompletedAt = completion.completedAt;
      scan.updatedAt = completion.updatedAt;
    }
    clearLease(input);
    return clone(completion);
  }

  async function failSqlCompletion(input) {
    const completion = await withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`scan-audio:${input.scanId}`]);
      const scanResult = await client.query(
        "SELECT * FROM scan_sessions WHERE id = $1 LIMIT 1 FOR UPDATE",
        [input.scanId],
      );
      const scan = scanResult.rows?.[0] || null;
      if (!scan) throw repositoryError(404, "SCAN_AUDIO_SCAN_NOT_FOUND", "Scan was not found");
      if (!input.organizationId || scan.organization_id !== input.organizationId) {
        throw repositoryError(403, "SCAN_AUDIO_SCOPE_DENIED", "Scan audio is outside the authorized workspace");
      }
      const selected = await client.query(
        "SELECT * FROM scan_audio_completions WHERE scan_id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE",
        [input.scanId, input.organizationId],
      );
      const current = rowToCompletion(selected.rows?.[0]);
      const sameIntent =
        current &&
        current.organizationId === input.organizationId &&
        current.actorUserId === input.actorUserId &&
        current.idempotencyKey === input.idempotencyKey;
      if (!sameIntent || current.status === "completed") return current || null;
      assertCompletionLease(input, current);
      const timestamp = nowIso();
      const updated = await client.query(
        `UPDATE scan_audio_completions
          SET status = 'failed', error_code = $3, error_message = $4, lease_token = NULL,
              updated_at = $5::timestamptz
         WHERE scan_id = $1 AND idempotency_key = $2
         RETURNING *`,
        [
          input.scanId,
          input.idempotencyKey,
          stringValue(input.errorCode, 120),
          stringValue(input.errorMessage, 1000),
          timestamp,
        ],
      );
      return rowToCompletion(updated.rows?.[0]);
    });
    if (completion) syncRuntimeItem(runtimeDb().scanAudioCompletions, completion);
    clearLease(input);
    return clone(completion);
  }

  async function appendChunk(rawInput) {
    const input = validateChunkInput(rawInput);
    return runSerialized(input.scanId, async () => {
      return getPool() ? appendSqlChunk(input) : appendRuntimeChunk(input);
    });
  }

  async function beginCompletion(rawInput) {
    const input = validateCompletionInput(rawInput);
    return runSerialized(input.scanId, async () => {
      return getPool() ? beginSqlCompletion(input) : beginRuntimeCompletion(input);
    });
  }

  async function finishCompletion(rawInput) {
    const input = validateCompletionInput(rawInput);
    return runSerialized(input.scanId, async () => {
      return getPool()
        ? finishSqlCompletion({ ...input, response: rawInput.response })
        : finishRuntimeCompletion({ ...input, response: rawInput.response });
    });
  }

  async function failCompletion(rawInput) {
    const input = validateCompletionInput(rawInput);
    return runSerialized(input.scanId, async () => {
      const completionInput = {
        ...input,
        errorCode: rawInput.errorCode,
        errorMessage: rawInput.errorMessage,
      };
      return getPool() ? failSqlCompletion(completionInput) : failRuntimeCompletion(completionInput);
    });
  }

  async function listChunks(input) {
    const normalized = {
      scanId: stringValue(input.scanId, 160),
      organizationId: stringValue(input.organizationId, 160),
    };
    if (!normalized.scanId || !normalized.organizationId) {
      throw repositoryError(400, "SCAN_AUDIO_INPUT_INVALID", "Scan and workspace are required");
    }
    const pool = getPool();
    if (pool) {
      const scanResult = await pool.query(
        "SELECT id, organization_id FROM scan_sessions WHERE id = $1 LIMIT 1",
        [normalized.scanId],
      );
      const scan = scanResult.rows?.[0] || null;
      if (!scan) throw repositoryError(404, "SCAN_AUDIO_SCAN_NOT_FOUND", "Scan was not found");
      if (scan.organization_id !== normalized.organizationId) {
        throw repositoryError(403, "SCAN_AUDIO_SCOPE_DENIED", "Scan audio is outside the authorized workspace");
      }
      const result = await pool.query(
        "SELECT * FROM scan_audio_chunks WHERE scan_id = $1 AND organization_id = $2 ORDER BY chunk_sequence ASC",
        [normalized.scanId, normalized.organizationId],
      );
      const chunks = (result.rows || []).map(rowToChunk);
      for (let index = 0; index < chunks.length; index += 1) {
        if (chunks[index].sequence !== index) {
          throw repositoryError(409, "SCAN_AUDIO_LEDGER_INVALID", "Stored audio chunks are not contiguous");
        }
      }
      const db = runtimeDb();
      for (const chunk of chunks) syncRuntimeItem(db.scanAudioChunks, chunk);
      return clone(chunks);
    }
    const db = runtimeDb();
    findScopedScan(db, normalized);
    return clone(orderedRuntimeChunks(db, normalized.scanId, normalized.organizationId));
  }

  async function hydrate() {
    const db = runtimeDb();
    const pool = getPool();
    if (pool) {
      const [chunkResult, completionResult] = await Promise.all([
        pool.query("SELECT * FROM scan_audio_chunks ORDER BY scan_id ASC, chunk_sequence ASC LIMIT 5000"),
        pool.query("SELECT * FROM scan_audio_completions ORDER BY updated_at DESC LIMIT 1000"),
      ]);
      const chunks = (chunkResult.rows || []).map(rowToChunk);
      const completions = (completionResult.rows || []).map(rowToCompletion);
      const runtimeChunks = new Map(db.scanAudioChunks.map((item) => [item.id, item]));
      const runtimeCompletions = new Map(db.scanAudioCompletions.map((item) => [item.id, item]));
      db.scanAudioChunks = chunks.map((item) => ({ ...runtimeChunks.get(item.id), ...item }));
      db.scanAudioCompletions = completions.map((item) => ({ ...runtimeCompletions.get(item.id), ...item }));
    }
    return {
      scanAudioChunks: db.scanAudioChunks.length,
      scanAudioCompletions: db.scanAudioCompletions.length,
    };
  }

  return {
    appendChunk,
    beginCompletion,
    finishCompletion,
    failCompletion,
    listChunks,
    hydrate,
  };
}

module.exports = {
  COMPLETION_STATUSES,
  MAX_SCAN_AUDIO_CHUNK_BYTES,
  MAX_SCAN_AUDIO_CHUNK_COUNT,
  MAX_SCAN_AUDIO_TOTAL_BYTES,
  PROCESSING_LEASE_MS,
  WRITABLE_SCAN_STATUSES,
  completionManifest,
  createScanAudioUploadRepository,
};
