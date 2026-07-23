const REVIEW_STATUSES = new Set(["pending", "reviewed"]);
const REVIEW_DECISIONS = new Set(["accepted", "repeat_measurement", "follow_up_required"]);
const ALERT_STATUSES = new Set(["open", "acknowledged", "resolved"]);
const ALERT_ACTIONS = new Set(["acknowledge", "resolve"]);
const { sanitizeAuditMetadata } = require("./auditLogContract");

function repositoryError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function objectOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function toIso(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function boundedString(value, maxLength = 4000) {
  return String(value || "").trim().slice(0, maxLength);
}

function positiveVersion(value, code) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw repositoryError(400, code, "expectedVersion must be a positive integer");
  }
  return version;
}

function rowToReview(row) {
  if (!row) return null;
  const scanId = row.scan_id || row.id || "";
  return {
    id: row.review_id || row.id || `review_${scanId}`,
    scanId,
    organizationId: row.organization_id || "",
    patientId: row.patient_id || "",
    deviceId: row.device_id || "",
    status: row.review_status || row.status || "pending",
    decision: row.decision || "",
    note: row.note || "",
    reviewerUserId: row.reviewer_user_id || "",
    reviewedAt: toIso(row.reviewed_at),
    version: Number(row.version || 1),
    scanStatus: row.scan_status || "",
    scanCreatedAt: toIso(row.scan_created_at),
    createdAt: toIso(row.review_created_at || row.created_at),
    updatedAt: toIso(row.review_updated_at || row.updated_at),
  };
}

function rowToAlert(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    sourceType: row.source_type || "",
    sourceId: row.source_id || "",
    dedupeKey: row.dedupe_key || "",
    occurrenceNumber: Number(row.occurrence_number || 1),
    previousAlertId: row.previous_alert_id || "",
    occurredAt: toIso(row.occurred_at || row.created_at),
    status: row.status || "open",
    severity: row.severity || "warning",
    title: row.title || "",
    message: row.message || "",
    patientId: row.patient_id || "",
    deviceId: row.device_id || "",
    scanId: row.scan_id || "",
    acknowledgedByUserId: row.acknowledged_by_user_id || "",
    acknowledgedAt: toIso(row.acknowledged_at),
    acknowledgementNote: row.acknowledgement_note || "",
    resolvedByUserId: row.resolved_by_user_id || "",
    resolvedAt: toIso(row.resolved_at),
    resolutionNote: row.resolution_note || "",
    version: Number(row.version || 1),
    metadata: objectOf(row.metadata),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function createClinicalWorkflowRepository(options) {
  const getDb = options.getDb;
  const saveDb = options.saveDb;
  const getPool = options.getPool || (() => null);
  const createId = options.createId;
  const nowIso = options.nowIso;
  let jsonMutationTail = Promise.resolve();

  function runtimeDb() {
    const db = getDb();
    db.scans = Array.isArray(db.scans) ? db.scans : [];
    db.scanReviews = Array.isArray(db.scanReviews)
      ? db.scanReviews.map((review) => ({ ...review, version: Number(review.version || 1) }))
      : [];
    db.clinicalAlerts = Array.isArray(db.clinicalAlerts)
      ? db.clinicalAlerts.map((alert) => ({
          ...alert,
          occurrenceNumber: Number(alert.occurrenceNumber || 1),
          previousAlertId: alert.previousAlertId || "",
          occurredAt: alert.occurredAt || alert.createdAt || "",
          version: Number(alert.version || 1),
        }))
      : [];
    db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
    db.idempotencyKeys = Array.isArray(db.idempotencyKeys) ? db.idempotencyKeys : [];
    return db;
  }

  function replaceRuntimeItem(collectionName, item) {
    const db = runtimeDb();
    const items = db[collectionName];
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index === -1) items.unshift(clone(item));
    else items[index] = clone(item);
    return item;
  }

  function createAudit(input, action, resourceType, resourceId, organizationId, metadata = {}) {
    return {
      id: createId("audit"),
      actorUserId: input?.actorUserId || "",
      organizationId,
      action,
      resourceType,
      resourceId,
      ip: input?.ip || "",
      userAgent: input?.userAgent || "",
      metadata: sanitizeAuditMetadata(metadata),
      createdAt: nowIso(),
    };
  }

  function assertIdempotency(input) {
    if (!input?.scope || !input?.operation || !input?.key || !input?.fingerprint) {
      throw repositoryError(400, "IDEMPOTENCY_KEY_REQUIRED", "A complete Idempotency-Key contract is required");
    }
  }

  function findRuntimeReplay(input) {
    const entry = runtimeDb().idempotencyKeys.find(
      (item) => item.scope === input.scope && item.operation === input.operation && item.key === input.key,
    );
    if (entry && entry.fingerprint !== input.fingerprint) {
      throw repositoryError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with a different request payload");
    }
    return entry || null;
  }

  function storeRuntimeReplay(input, resourceType, resourceId, response) {
    const db = runtimeDb();
    const existing = findRuntimeReplay(input);
    if (existing) return existing;
    const timestamp = nowIso();
    const entry = {
      id: createId("idem"),
      scope: input.scope,
      operation: input.operation,
      key: input.key,
      fingerprint: input.fingerprint,
      resourceType,
      resourceId,
      responseStatus: 200,
      responseResource: clone(response),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSeenAt: timestamp,
    };
    db.idempotencyKeys.unshift(entry);
    db.idempotencyKeys = db.idempotencyKeys.slice(0, 1000);
    return entry;
  }

  async function runJsonMutation(operation) {
    const previous = jsonMutationTail.catch(() => {});
    let release;
    jsonMutationTail = new Promise((resolve) => { release = resolve; });
    await previous;
    const db = runtimeDb();
    const snapshot = {
      scanReviews: clone(db.scanReviews),
      clinicalAlerts: clone(db.clinicalAlerts),
      auditLogs: clone(db.auditLogs),
      idempotencyKeys: clone(db.idempotencyKeys),
    };
    try {
      const result = await operation(db);
      await saveDb();
      return result;
    } catch (error) {
      db.scanReviews = snapshot.scanReviews;
      db.clinicalAlerts = snapshot.clinicalAlerts;
      db.auditLogs = snapshot.auditLogs;
      db.idempotencyKeys = snapshot.idempotencyKeys;
      throw error;
    } finally {
      release();
    }
  }

  async function withSqlTransaction(operation) {
    const pool = getPool();
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

  async function findSqlReplay(client, input) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `${input.scope}:${input.operation}:${input.key}`,
    ]);
    const result = await client.query(
      `SELECT fingerprint, response_json
       FROM mutation_idempotency
       WHERE scope = $1 AND operation = $2 AND idempotency_key = $3
       LIMIT 1`,
      [input.scope, input.operation, input.key],
    );
    const replay = result.rows[0] || null;
    if (replay && replay.fingerprint !== input.fingerprint) {
      throw repositoryError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used with a different request payload");
    }
    if (replay && typeof replay.response_json === "string") {
      replay.response_json = JSON.parse(replay.response_json || "{}");
    }
    return replay;
  }

  async function insertSqlReplay(client, input, resourceType, resourceId, response) {
    await client.query(
      `INSERT INTO mutation_idempotency (
         id, scope, operation, idempotency_key, fingerprint,
         resource_type, resource_id, response_status, response_json, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 200, $8::jsonb, now(), now())`,
      [
        createId("idem"), input.scope, input.operation, input.key, input.fingerprint,
        resourceType, resourceId, JSON.stringify(response),
      ],
    );
  }

  async function insertSqlAudit(client, audit) {
    await client.query(
      `INSERT INTO audit_logs (
         id, actor_user_id, organization_id, action, resource_type, resource_id,
         ip, user_agent, metadata, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::inet, $8, $9::jsonb, $10)`,
      [
        audit.id, audit.actorUserId || null, audit.organizationId || null, audit.action,
        audit.resourceType || null, audit.resourceId || null, audit.ip || "",
        audit.userAgent || null, JSON.stringify(audit.metadata || {}), audit.createdAt,
      ],
    );
  }

  function derivedReview(scan, stored = null) {
    if (stored) {
      return {
        ...clone(stored),
        organizationId: stored.organizationId || scan.organizationId || "",
        patientId: stored.patientId || scan.patientId || "",
        deviceId: stored.deviceId || scan.deviceId || "",
        scanStatus: scan.status || "",
        scanCreatedAt: scan.createdAt || "",
      };
    }
    return {
      id: `review_${scan.id}`,
      scanId: scan.id,
      organizationId: scan.organizationId || "",
      patientId: scan.patientId || "",
      deviceId: scan.deviceId || "",
      status: "pending",
      decision: "",
      note: "",
      reviewerUserId: "",
      reviewedAt: "",
      version: 1,
      scanStatus: scan.status || "",
      scanCreatedAt: scan.createdAt || "",
      createdAt: scan.createdAt || "",
      updatedAt: scan.updatedAt || scan.createdAt || "",
    };
  }

  async function listReviews(filters = {}) {
    const organizationId = boundedString(filters.organizationId, 120);
    if (!organizationId) throw repositoryError(400, "REVIEW_WORKSPACE_REQUIRED", "organizationId is required");
    const status = boundedString(filters.status, 40) || "";
    if (status && !REVIEW_STATUSES.has(status)) {
      throw repositoryError(400, "REVIEW_STATUS_INVALID", "Review status is invalid");
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
    const pool = getPool();
    if (pool) {
      const result = await pool.query(
        `SELECT
           review.id AS review_id,
           scan.id AS scan_id,
           scan.organization_id,
           scan.patient_id,
           scan.device_id,
           scan.status AS scan_status,
           scan.created_at AS scan_created_at,
           COALESCE(review.status, 'pending') AS review_status,
           review.decision,
           review.note,
           review.reviewer_user_id,
           review.reviewed_at,
           COALESCE(review.version, 1) AS version,
           review.created_at AS review_created_at,
           review.updated_at AS review_updated_at
         FROM scan_sessions scan
         LEFT JOIN scan_reviews review ON review.scan_id = scan.id
         WHERE scan.organization_id = $1
           AND scan.status IN ('completed', 'needs_review')
           AND ($2 = '' OR COALESCE(review.status, 'pending') = $2)
         ORDER BY COALESCE(review.updated_at, scan.updated_at, scan.created_at) DESC
         LIMIT $3`,
        [organizationId, status, limit],
      );
      return result.rows.map(rowToReview);
    }
    const db = runtimeDb();
    return db.scans
      .filter((scan) => scan.organizationId === organizationId && ["completed", "needs_review"].includes(scan.status))
      .map((scan) => derivedReview(scan, db.scanReviews.find((item) => item.scanId === scan.id)))
      .filter((review) => !status || review.status === status)
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .slice(0, limit);
  }

  function validateReviewDecision(input) {
    const decision = boundedString(input.decision, 80);
    if (!REVIEW_DECISIONS.has(decision)) {
      throw repositoryError(400, "REVIEW_DECISION_INVALID", "Review decision is invalid");
    }
    const note = boundedString(input.note, 4000);
    if (decision !== "accepted" && !note) {
      throw repositoryError(400, "REVIEW_NOTE_REQUIRED", "A note is required for this review decision");
    }
    return { decision, note, expectedVersion: positiveVersion(input.expectedVersion, "REVIEW_VERSION_REQUIRED") };
  }

  async function decideReview(input) {
    assertIdempotency(input.idempotency);
    const organizationId = boundedString(input.organizationId, 120);
    const scanId = boundedString(input.scanId, 120);
    const reviewerUserId = boundedString(input.reviewerUserId, 120);
    const validated = validateReviewDecision(input);
    if (!organizationId || !scanId || !reviewerUserId) {
      throw repositoryError(400, "REVIEW_INPUT_INVALID", "Workspace, scan, and reviewer are required");
    }

    const pool = getPool();
    if (pool) {
      const outcome = await withSqlTransaction(async (client) => {
        const scanResult = await client.query(
          "SELECT * FROM scan_sessions WHERE id = $1 FOR UPDATE",
          [scanId],
        );
        const scan = scanResult.rows[0];
        if (!scan) throw repositoryError(404, "REVIEW_SCAN_NOT_FOUND", "Scan was not found");
        if (scan.organization_id !== organizationId) {
          throw repositoryError(403, "REVIEW_SCOPE_DENIED", "Scan review is outside the authorized workspace");
        }
        if (!["completed", "needs_review"].includes(scan.status)) {
          throw repositoryError(409, "REVIEW_SCAN_NOT_READY", "Scan is not ready for review");
        }
        const replay = await findSqlReplay(client, input.idempotency);
        if (replay) return { ...clone(replay.response_json), replayed: true, audit: null };

        const reviewResult = await client.query("SELECT * FROM scan_reviews WHERE scan_id = $1 FOR UPDATE", [scanId]);
        const current = reviewResult.rows[0] || null;
        const currentVersion = Number(current?.version || 1);
        if (currentVersion !== validated.expectedVersion) {
          throw repositoryError(409, "REVIEW_VERSION_CONFLICT", "Review changed before this decision was committed", { currentVersion });
        }
        if (current?.status === "reviewed") {
          throw repositoryError(409, "REVIEW_ALREADY_COMPLETED", "This scan has already been reviewed");
        }
        const reviewId = current?.id || createId("review");
        const reviewedAt = nowIso();
        const persisted = await client.query(
          `INSERT INTO scan_reviews (
             id, scan_id, organization_id, patient_id, status, decision, note,
             reviewer_user_id, reviewed_at, version, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, 'reviewed', $5, $6, $7, $8, $9, now(), now())
           ON CONFLICT (scan_id) DO UPDATE SET
             status = 'reviewed', decision = EXCLUDED.decision, note = EXCLUDED.note,
             reviewer_user_id = EXCLUDED.reviewer_user_id, reviewed_at = EXCLUDED.reviewed_at,
             version = scan_reviews.version + 1, updated_at = now()
           RETURNING *`,
          [reviewId, scanId, organizationId, scan.patient_id, validated.decision, validated.note, reviewerUserId, reviewedAt, currentVersion + 1],
        );
        const review = rowToReview({ ...persisted.rows[0], review_id: persisted.rows[0].id, scan_id: scanId, review_status: persisted.rows[0].status, device_id: scan.device_id, scan_status: scan.status, scan_created_at: scan.created_at });
        const response = { review };
        const audit = createAudit(
          input.audit,
          "scan.review.decision",
          "scan_review",
          review.id,
          organizationId,
          { scanId, decision: review.decision, version: review.version },
        );
        await insertSqlAudit(client, audit);
        await insertSqlReplay(client, input.idempotency, "scan_review", review.id, response);
        return { ...response, replayed: false, audit };
      });
      if (!outcome.replayed) {
        replaceRuntimeItem("scanReviews", outcome.review);
        runtimeDb().auditLogs.unshift(clone(outcome.audit));
        await saveDb().catch(() => {});
      }
      return { review: outcome.review, replayed: outcome.replayed };
    }

    return runJsonMutation(async (db) => {
      const scan = db.scans.find((item) => item.id === scanId);
      if (!scan) throw repositoryError(404, "REVIEW_SCAN_NOT_FOUND", "Scan was not found");
      if (scan.organizationId !== organizationId) {
        throw repositoryError(403, "REVIEW_SCOPE_DENIED", "Scan review is outside the authorized workspace");
      }
      if (!["completed", "needs_review"].includes(scan.status)) {
        throw repositoryError(409, "REVIEW_SCAN_NOT_READY", "Scan is not ready for review");
      }
      const replay = findRuntimeReplay(input.idempotency);
      if (replay) return { ...clone(replay.responseResource), replayed: true };
      const current = db.scanReviews.find((item) => item.scanId === scanId) || derivedReview(scan);
      if (current.version !== validated.expectedVersion) {
        throw repositoryError(409, "REVIEW_VERSION_CONFLICT", "Review changed before this decision was committed", { currentVersion: current.version });
      }
      if (current.status === "reviewed") {
        throw repositoryError(409, "REVIEW_ALREADY_COMPLETED", "This scan has already been reviewed");
      }
      const timestamp = nowIso();
      const review = {
        ...current,
        id: current.id.startsWith("review_") && current.id === `review_${scanId}` ? createId("review") : current.id,
        status: "reviewed",
        decision: validated.decision,
        note: validated.note,
        reviewerUserId,
        reviewedAt: timestamp,
        version: current.version + 1,
        createdAt: current.createdAt || timestamp,
        updatedAt: timestamp,
      };
      replaceRuntimeItem("scanReviews", review);
      const audit = createAudit(input.audit, "scan.review.decision", "scan_review", review.id, organizationId, { scanId, decision: review.decision, version: review.version });
      db.auditLogs.unshift(audit);
      storeRuntimeReplay(input.idempotency, "scan_review", review.id, { review });
      return { review: clone(review), replayed: false };
    });
  }

  function validateAlertSource(input) {
    const organizationId = boundedString(input.organizationId, 120);
    const sourceType = boundedString(input.sourceType, 60).toLowerCase();
    const sourceId = boundedString(input.sourceId, 160);
    if (!organizationId || !["device", "scan"].includes(sourceType) || !sourceId) {
      throw repositoryError(400, "ALERT_SOURCE_INVALID", "A workspace-scoped device or scan source is required");
    }
    const title = boundedString(input.title, 240);
    const message = boundedString(input.message, 2000);
    if (!title || !message) throw repositoryError(400, "ALERT_CONTENT_REQUIRED", "Alert title and message are required");
    return {
      organizationId,
      sourceType,
      sourceId,
      dedupeKey: `${sourceType}:${sourceId}`,
      severity: boundedString(input.severity, 40) || "warning",
      title,
      message,
      patientId: boundedString(input.patientId, 120),
      deviceId: boundedString(input.deviceId, 120),
      scanId: boundedString(input.scanId, 120),
      metadata: objectOf(input.metadata),
    };
  }

  async function upsertAlertSource(input) {
    assertIdempotency(input.idempotency);
    const source = validateAlertSource(input);
    const pool = getPool();
    if (pool) {
      const outcome = await withSqlTransaction(async (client) => {
        const replay = await findSqlReplay(client, input.idempotency);
        if (replay) return { ...clone(replay.response_json), replayed: true, audit: null };
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `clinical-alert:${source.organizationId}:${source.dedupeKey}`,
        ]);
        const existingResult = await client.query(
          `SELECT * FROM clinical_alerts
           WHERE organization_id = $1 AND dedupe_key = $2
           ORDER BY occurrence_number DESC, created_at DESC
           FOR UPDATE`,
          [source.organizationId, source.dedupeKey],
        );
        const occurrences = existingResult.rows.map(rowToAlert);
        const activeAlert = occurrences.find((item) => ["open", "acknowledged"].includes(item.status)) || null;
        const previousAlert = occurrences[0] || null;
        let alert;
        let deduplicated = false;
        let recurrence = false;
        let audit = null;
        if (activeAlert) {
          alert = activeAlert;
          deduplicated = true;
        } else {
          const alertId = createId("alert");
          const occurrenceNumber = Number(previousAlert?.occurrenceNumber || 0) + 1;
          const occurredAt = nowIso();
          recurrence = Boolean(previousAlert);
          const inserted = await client.query(
            `INSERT INTO clinical_alerts (
               id, organization_id, source_type, source_id, dedupe_key,
               occurrence_number, previous_alert_id, occurred_at, status, severity,
               title, message, patient_id, device_id, scan_id, metadata, version, created_at, updated_at
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8, 'open', $9,
               $10, $11, $12, $13, $14, $15::jsonb, 1, $8, $8
             )
             RETURNING *`,
            [
              alertId,
              source.organizationId,
              source.sourceType,
              source.sourceId,
              source.dedupeKey,
              occurrenceNumber,
              previousAlert?.id || null,
              occurredAt,
              source.severity,
              source.title,
              source.message,
              source.patientId || null,
              source.deviceId || null,
              source.scanId || null,
              JSON.stringify(source.metadata),
            ],
          );
          alert = rowToAlert(inserted.rows[0]);
          audit = createAudit(
            input.audit,
            recurrence ? "alert.reopen" : "alert.open",
            "clinical_alert",
            alert.id,
            source.organizationId,
            {
              sourceType: source.sourceType,
              sourceId: source.sourceId,
              severity: source.severity,
              occurrenceNumber,
              previousAlertId: previousAlert?.id || "",
            },
          );
          await insertSqlAudit(client, audit);
        }
        const response = { alert, deduplicated, recurrence };
        await insertSqlReplay(client, input.idempotency, "clinical_alert", alert.id, response);
        return { ...response, replayed: false, audit };
      });
      if (!outcome.replayed) {
        replaceRuntimeItem("clinicalAlerts", outcome.alert);
        if (outcome.audit) runtimeDb().auditLogs.unshift(clone(outcome.audit));
        await saveDb().catch(() => {});
      }
      return {
        alert: outcome.alert,
        deduplicated: outcome.deduplicated,
        recurrence: Boolean(outcome.recurrence),
        replayed: outcome.replayed,
      };
    }

    return runJsonMutation(async (db) => {
      const replay = findRuntimeReplay(input.idempotency);
      if (replay) return { ...clone(replay.responseResource), replayed: true };
      const occurrences = db.clinicalAlerts
        .filter((item) => item.organizationId === source.organizationId && item.dedupeKey === source.dedupeKey)
        .sort((left, right) =>
          Number(right.occurrenceNumber || 1) - Number(left.occurrenceNumber || 1) ||
          String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
      const activeAlert = occurrences.find((item) => ["open", "acknowledged"].includes(item.status)) || null;
      const previousAlert = occurrences[0] || null;
      if (activeAlert) {
        const response = { alert: clone(activeAlert), deduplicated: true, recurrence: false };
        storeRuntimeReplay(input.idempotency, "clinical_alert", activeAlert.id, response);
        return { ...response, replayed: false };
      }
      const timestamp = nowIso();
      const occurrenceNumber = Number(previousAlert?.occurrenceNumber || 0) + 1;
      const recurrence = Boolean(previousAlert);
      const alert = {
        id: createId("alert"),
        ...source,
        occurrenceNumber,
        previousAlertId: previousAlert?.id || "",
        occurredAt: timestamp,
        status: "open",
        acknowledgedByUserId: "",
        acknowledgedAt: "",
        acknowledgementNote: "",
        resolvedByUserId: "",
        resolvedAt: "",
        resolutionNote: "",
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.clinicalAlerts.unshift(alert);
      const audit = createAudit(
        input.audit,
        recurrence ? "alert.reopen" : "alert.open",
        "clinical_alert",
        alert.id,
        source.organizationId,
        {
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          severity: source.severity,
          occurrenceNumber,
          previousAlertId: previousAlert?.id || "",
        },
      );
      db.auditLogs.unshift(audit);
      storeRuntimeReplay(input.idempotency, "clinical_alert", alert.id, { alert, deduplicated: false, recurrence });
      return { alert: clone(alert), deduplicated: false, recurrence, replayed: false };
    });
  }

  async function listAlerts(filters = {}) {
    const organizationId = boundedString(filters.organizationId, 120);
    if (!organizationId) throw repositoryError(400, "ALERT_WORKSPACE_REQUIRED", "organizationId is required");
    const status = boundedString(filters.status, 40);
    if (status && !ALERT_STATUSES.has(status)) throw repositoryError(400, "ALERT_STATUS_INVALID", "Alert status is invalid");
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
    const pool = getPool();
    if (pool) {
      const result = await pool.query(
        `SELECT * FROM clinical_alerts
         WHERE organization_id = $1 AND ($2 = '' OR status = $2)
         ORDER BY updated_at DESC, created_at DESC LIMIT $3`,
        [organizationId, status, limit],
      );
      return result.rows.map(rowToAlert);
    }
    return runtimeDb().clinicalAlerts
      .filter((item) => item.organizationId === organizationId && (!status || item.status === status))
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .slice(0, limit)
      .map(clone);
  }

  async function findAlertById(alertId) {
    const id = boundedString(alertId, 160);
    const pool = getPool();
    if (pool) {
      const result = await pool.query("SELECT * FROM clinical_alerts WHERE id = $1 LIMIT 1", [id]);
      const alert = rowToAlert(result.rows[0]);
      if (alert) replaceRuntimeItem("clinicalAlerts", alert);
      return alert;
    }
    return clone(runtimeDb().clinicalAlerts.find((item) => item.id === id) || null);
  }

  function validateAlertTransition(input) {
    const action = boundedString(input.action, 40);
    if (!ALERT_ACTIONS.has(action)) throw repositoryError(400, "ALERT_ACTION_INVALID", "Alert action is invalid");
    const note = boundedString(input.note, 2000);
    if (action === "resolve" && !note) throw repositoryError(400, "ALERT_RESOLUTION_NOTE_REQUIRED", "A resolution note is required");
    return { action, note, expectedVersion: positiveVersion(input.expectedVersion, "ALERT_VERSION_REQUIRED") };
  }

  function nextAlertState(current, action, actorUserId, note) {
    const timestamp = nowIso();
    if (action === "acknowledge") {
      if (current.status !== "open") throw repositoryError(409, "ALERT_TRANSITION_INVALID", "Only an open alert can be acknowledged");
      return {
        ...current,
        status: "acknowledged",
        acknowledgedByUserId: actorUserId,
        acknowledgedAt: timestamp,
        acknowledgementNote: note,
        version: current.version + 1,
        updatedAt: timestamp,
      };
    }
    if (!["open", "acknowledged"].includes(current.status)) {
      throw repositoryError(409, "ALERT_TRANSITION_INVALID", "Only an open or acknowledged alert can be resolved");
    }
    return {
      ...current,
      status: "resolved",
      resolvedByUserId: actorUserId,
      resolvedAt: timestamp,
      resolutionNote: note,
      version: current.version + 1,
      updatedAt: timestamp,
    };
  }

  async function transitionAlert(input) {
    assertIdempotency(input.idempotency);
    const organizationId = boundedString(input.organizationId, 120);
    const alertId = boundedString(input.alertId, 160);
    const actorUserId = boundedString(input.actorUserId, 120);
    const validated = validateAlertTransition(input);
    if (!organizationId || !alertId || !actorUserId) throw repositoryError(400, "ALERT_INPUT_INVALID", "Workspace, alert, and actor are required");
    const pool = getPool();
    if (pool) {
      const outcome = await withSqlTransaction(async (client) => {
        const selected = await client.query("SELECT * FROM clinical_alerts WHERE id = $1 FOR UPDATE", [alertId]);
        const current = rowToAlert(selected.rows[0]);
        if (!current) throw repositoryError(404, "ALERT_NOT_FOUND", "Alert was not found");
        if (current.organizationId !== organizationId) throw repositoryError(403, "ALERT_SCOPE_DENIED", "Alert is outside the authorized workspace");
        const replay = await findSqlReplay(client, input.idempotency);
        if (replay) return { ...clone(replay.response_json), replayed: true, audit: null };
        if (current.version !== validated.expectedVersion) {
          throw repositoryError(409, "ALERT_VERSION_CONFLICT", "Alert changed before this action was committed", { currentVersion: current.version });
        }
        const next = nextAlertState(current, validated.action, actorUserId, validated.note);
        const updated = await client.query(
          `UPDATE clinical_alerts SET
             status = $2,
             acknowledged_by_user_id = $3,
             acknowledged_at = $4,
             acknowledgement_note = $5,
             resolved_by_user_id = $6,
             resolved_at = $7,
             resolution_note = $8,
             version = $9,
             updated_at = $10
           WHERE id = $1 AND version = $11
           RETURNING *`,
          [alertId, next.status, next.acknowledgedByUserId || null, next.acknowledgedAt || null, next.acknowledgementNote || null, next.resolvedByUserId || null, next.resolvedAt || null, next.resolutionNote || null, next.version, next.updatedAt, current.version],
        );
        if (!updated.rows[0]) throw repositoryError(409, "ALERT_VERSION_CONFLICT", "Alert changed before this action was committed");
        const alert = rowToAlert(updated.rows[0]);
        const response = { alert };
        const actionName = `alert.${validated.action}`;
        const audit = createAudit(input.audit, actionName, "clinical_alert", alert.id, organizationId, { previousStatus: current.status, status: alert.status, version: alert.version, note: validated.note });
        await insertSqlAudit(client, audit);
        await insertSqlReplay(client, input.idempotency, "clinical_alert", alert.id, response);
        return { ...response, replayed: false, audit };
      });
      if (!outcome.replayed) {
        replaceRuntimeItem("clinicalAlerts", outcome.alert);
        runtimeDb().auditLogs.unshift(clone(outcome.audit));
        await saveDb().catch(() => {});
      }
      return { alert: outcome.alert, replayed: outcome.replayed };
    }

    return runJsonMutation(async (db) => {
      const current = db.clinicalAlerts.find((item) => item.id === alertId);
      if (!current) throw repositoryError(404, "ALERT_NOT_FOUND", "Alert was not found");
      if (current.organizationId !== organizationId) throw repositoryError(403, "ALERT_SCOPE_DENIED", "Alert is outside the authorized workspace");
      const replay = findRuntimeReplay(input.idempotency);
      if (replay) return { ...clone(replay.responseResource), replayed: true };
      if (current.version !== validated.expectedVersion) {
        throw repositoryError(409, "ALERT_VERSION_CONFLICT", "Alert changed before this action was committed", { currentVersion: current.version });
      }
      const alert = nextAlertState(current, validated.action, actorUserId, validated.note);
      replaceRuntimeItem("clinicalAlerts", alert);
      const audit = createAudit(input.audit, `alert.${validated.action}`, "clinical_alert", alert.id, organizationId, { previousStatus: current.status, status: alert.status, version: alert.version, note: validated.note });
      db.auditLogs.unshift(audit);
      storeRuntimeReplay(input.idempotency, "clinical_alert", alert.id, { alert });
      return { alert: clone(alert), replayed: false };
    });
  }

  async function hydrate() {
    const pool = getPool();
    if (!pool) return { scanReviews: runtimeDb().scanReviews.length, clinicalAlerts: runtimeDb().clinicalAlerts.length };
    const [reviewResult, alertResult] = await Promise.all([
      pool.query("SELECT * FROM scan_reviews ORDER BY updated_at DESC LIMIT 1000"),
      pool.query("SELECT * FROM clinical_alerts ORDER BY updated_at DESC LIMIT 1000"),
    ]);
    const db = runtimeDb();
    db.scanReviews = reviewResult.rows.map((row) => rowToReview({ ...row, review_id: row.id, review_status: row.status }));
    db.clinicalAlerts = alertResult.rows.map(rowToAlert);
    return { scanReviews: db.scanReviews.length, clinicalAlerts: db.clinicalAlerts.length };
  }

  return {
    hydrate,
    reviews: { list: listReviews, decide: decideReview },
    alerts: { list: listAlerts, findById: findAlertById, upsertSource: upsertAlertSource, transition: transitionAlert },
  };
}

module.exports = {
  ALERT_STATUSES,
  REVIEW_DECISIONS,
  REVIEW_STATUSES,
  createClinicalWorkflowRepository,
};
