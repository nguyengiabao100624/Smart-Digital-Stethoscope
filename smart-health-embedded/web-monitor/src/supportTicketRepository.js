const { sanitizeAuditMetadata } = require("./auditLogContract");
const {
  normalizeSupportTicketRecord,
  publicSupportTicket,
} = require("./supportTicketContract");

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

function rowToSupportTicket(row) {
  if (!row) return null;
  return {
    id: row.id || "",
    workspaceId: row.organization_id || "",
    requesterUserId: row.requester_user_id || "",
    type: row.type || "other",
    description: row.description || "",
    status: row.status || "open",
    acknowledgedAt: toIso(row.acknowledged_at),
    acknowledgedByUserId: row.acknowledged_by_user_id || "",
    resolvedAt: toIso(row.resolved_at),
    resolvedByUserId: row.resolved_by_user_id || "",
    resolutionNote: row.resolution_note || "",
    version: Number(row.version || 1),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function createSupportTicketRepository(options) {
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
    db.supportTickets = arrayOf(db.supportTickets);
    db.auditLogs = arrayOf(db.auditLogs);
    db.idempotencyKeys = arrayOf(db.idempotencyKeys);
    return db;
  }

  function runRuntimeExclusive(operation) {
    const task = runtimeMutationTail.catch(() => {}).then(operation);
    runtimeMutationTail = task.catch(() => {});
    return task;
  }

  function normalizeIdempotency(value = {}) {
    const normalized = {
      scope: String(value.scope || ""),
      operation: String(value.operation || ""),
      key: String(value.key || ""),
      fingerprint: String(value.fingerprint || ""),
    };
    if (!normalized.key) {
      throw repositoryError(
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required",
      );
    }
    if (
      !normalized.scope ||
      !normalized.operation ||
      !normalized.fingerprint
    ) {
      throw repositoryError(
        400,
        "IDEMPOTENCY_CONTEXT_INVALID",
        "Idempotency scope, operation and fingerprint are required",
      );
    }
    return normalized;
  }

  function assertFingerprint(existing, idempotency) {
    if (
      existing?.fingerprint &&
      existing.fingerprint !== idempotency.fingerprint
    ) {
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
    const response = clone(existing.responseResource || {});
    if (!response?.ticket?.id) {
      throw repositoryError(
        409,
        "IDEMPOTENCY_OUTCOME_UNAVAILABLE",
        "Stored support ticket outcome cannot be replayed safely",
      );
    }
    existing.lastSeenAt = nowIso();
    return {
      ticket: publicSupportTicket(response.ticket),
      replayed: true,
      responseStatus: Number(existing.responseStatus || 201),
    };
  }

  function createAudit(input = {}, ticket) {
    return {
      id: createId("audit"),
      actorUserId: String(input.actorUserId || ""),
      organizationId: ticket.workspaceId,
      action: String(input.action || "support.ticket.create"),
      resourceType: "support_ticket",
      resourceId: ticket.id,
      ip: String(input.ip || ""),
      userAgent: String(input.userAgent || ""),
      metadata: sanitizeAuditMetadata({
        ...(input.metadata || {}),
        type: ticket.type,
        requesterUserId: ticket.requesterUserId,
      }),
      createdAt: nowIso(),
    };
  }

  async function withSqlTransaction(operation) {
    const pool = getPool();
    if (!pool) return null;
    const client =
      typeof pool.connect === "function" ? await pool.connect() : pool;
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if (client !== pool && typeof client.release === "function") {
        client.release();
      }
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
    const response = clone(existing.response_json || {});
    if (!response?.ticket?.id) {
      throw repositoryError(
        409,
        "IDEMPOTENCY_OUTCOME_UNAVAILABLE",
        "Stored support ticket outcome cannot be replayed safely",
      );
    }
    return {
      ticket: publicSupportTicket(response.ticket),
      replayed: true,
      responseStatus: Number(existing.response_status || 201),
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

  async function insertSqlIdempotency(
    client,
    idempotency,
    ticket,
    responseBody,
  ) {
    await client.query(
      `
        INSERT INTO mutation_idempotency (
          id, scope, operation, idempotency_key, fingerprint,
          resource_type, resource_id, response_status, response_json,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          'support_ticket', $6, 201, $7::jsonb,
          now(), now()
        )
      `,
      [
        createId("idem"),
        idempotency.scope,
        idempotency.operation,
        idempotency.key,
        idempotency.fingerprint,
        ticket.id,
        JSON.stringify(responseBody),
      ],
    );
  }

  function assertRuntimeAuthority(db, payload) {
    const workspace = db.organizations.find(
      (item) => item.id === payload.workspaceId,
    );
    if (!workspace) {
      throw repositoryError(
        404,
        "SUPPORT_TICKET_WORKSPACE_NOT_FOUND",
        "Workspace was not found",
      );
    }
    if (String(workspace.status || "active").toLowerCase() !== "active") {
      throw repositoryError(
        409,
        "SUPPORT_TICKET_WORKSPACE_INACTIVE",
        "Support requests require an active workspace",
      );
    }
    if (!db.users.some((item) => item.id === payload.requesterUserId)) {
      throw repositoryError(
        404,
        "SUPPORT_TICKET_REQUESTER_NOT_FOUND",
        "Requester account was not found",
      );
    }
  }

  async function assertSqlAuthority(client, payload) {
    const workspaceResult = await client.query(
      "SELECT id, status FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
      [payload.workspaceId],
    );
    const workspace = workspaceResult.rows[0] || null;
    if (!workspace) {
      throw repositoryError(
        404,
        "SUPPORT_TICKET_WORKSPACE_NOT_FOUND",
        "Workspace was not found",
      );
    }
    if (String(workspace.status || "active").toLowerCase() !== "active") {
      throw repositoryError(
        409,
        "SUPPORT_TICKET_WORKSPACE_INACTIVE",
        "Support requests require an active workspace",
      );
    }
    const userResult = await client.query(
      "SELECT id FROM users WHERE id = $1 LIMIT 1 FOR UPDATE",
      [payload.requesterUserId],
    );
    if (!userResult.rows[0]) {
      throw repositoryError(
        404,
        "SUPPORT_TICKET_REQUESTER_NOT_FOUND",
        "Requester account was not found",
      );
    }
  }

  function buildTicket(payload) {
    const timestamp = nowIso();
    return {
      id: createId("support_ticket"),
      ...payload,
      status: "open",
      acknowledgedAt: "",
      acknowledgedByUserId: "",
      resolvedAt: "",
      resolvedByUserId: "",
      resolutionNote: "",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  async function create(input = {}) {
    const payload = normalizeSupportTicketRecord(input.payload);
    const idempotency = normalizeIdempotency(input.idempotency);
    const ticket = buildTicket(payload);

    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const replay = runtimeReplay(db, idempotency);
          if (replay) {
            await saveDb();
            return replay;
          }
          assertRuntimeAuthority(db, payload);
          db.supportTickets.unshift(clone(ticket));
          const publicTicket = publicSupportTicket(ticket);
          const responseBody = { ticket: publicTicket };
          const auditLog = createAudit(input.audit, ticket);
          db.auditLogs.unshift(auditLog);
          db.idempotencyKeys.unshift({
            id: createId("idem"),
            scope: idempotency.scope,
            operation: idempotency.operation,
            key: idempotency.key,
            fingerprint: idempotency.fingerprint,
            resourceType: "support_ticket",
            resourceId: ticket.id,
            responseStatus: 201,
            responseResource: clone(responseBody),
            createdAt: nowIso(),
            updatedAt: nowIso(),
            lastSeenAt: nowIso(),
          });
          db.idempotencyKeys = db.idempotencyKeys.slice(0, 2000);
          await saveDb();
          return {
            ticket: publicTicket,
            replayed: false,
            responseStatus: 201,
            auditLog,
          };
        } catch (error) {
          for (const key of Object.keys(db)) delete db[key];
          Object.assign(db, snapshot);
          throw error;
        }
      });
    }

    const result = await withSqlTransaction(async (client) => {
      const replay = await sqlReplay(client, idempotency);
      if (replay) return replay;
      await assertSqlAuthority(client, payload);
      const inserted = await client.query(
        `
          INSERT INTO support_tickets (
            id, organization_id, requester_user_id, type, description,
            status, version, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            'open', 1, $6::timestamptz, $7::timestamptz
          )
          RETURNING *
        `,
        [
          ticket.id,
          ticket.workspaceId,
          ticket.requesterUserId,
          ticket.type,
          ticket.description,
          ticket.createdAt,
          ticket.updatedAt,
        ],
      );
      const canonical = rowToSupportTicket(inserted.rows[0]);
      const publicTicket = publicSupportTicket(canonical);
      const responseBody = { ticket: publicTicket };
      const auditLog = createAudit(input.audit, canonical);
      await insertSqlAudit(client, auditLog);
      await insertSqlIdempotency(
        client,
        idempotency,
        canonical,
        responseBody,
      );
      return {
        ticket: publicTicket,
        internalTicket: canonical,
        replayed: false,
        responseStatus: 201,
        auditLog,
      };
    });

    const db = runtimeDb();
    if (result.internalTicket) {
      const index = db.supportTickets.findIndex(
        (item) => item.id === result.internalTicket.id,
      );
      if (index >= 0) {
        db.supportTickets[index] = clone(result.internalTicket);
      } else {
        db.supportTickets.unshift(clone(result.internalTicket));
      }
    }
    if (result.auditLog) db.auditLogs.unshift(clone(result.auditLog));
    if (
      !db.idempotencyKeys.some(
        (entry) =>
          entry.scope === idempotency.scope &&
          entry.operation === idempotency.operation &&
          entry.key === idempotency.key,
      )
    ) {
      db.idempotencyKeys.unshift({
        id: createId("idem_runtime"),
        scope: idempotency.scope,
        operation: idempotency.operation,
        key: idempotency.key,
        fingerprint: idempotency.fingerprint,
        resourceType: "support_ticket",
        resourceId: result.ticket.id,
        responseStatus: 201,
        responseResource: { ticket: clone(result.ticket) },
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastSeenAt: nowIso(),
      });
    }
    await saveDb();
    return result;
  }

  async function list(filters = {}) {
    const workspaceId = String(filters.workspaceId || "");
    const requesterUserId = String(filters.requesterUserId || "");
    if (!getPool()) {
      return clone(
        runtimeDb()
          .supportTickets.filter(
            (ticket) =>
              (!workspaceId || ticket.workspaceId === workspaceId) &&
              (!requesterUserId ||
                ticket.requesterUserId === requesterUserId),
          )
          .sort((left, right) =>
            String(right.createdAt || "").localeCompare(
              String(left.createdAt || ""),
            ),
          ),
      );
    }
    const result = await getPool().query(
      `
        SELECT *
        FROM support_tickets
        WHERE ($1 = '' OR organization_id = $1)
          AND ($2 = '' OR requester_user_id = $2)
        ORDER BY created_at DESC, id ASC
        LIMIT 500
      `,
      [workspaceId, requesterUserId],
    );
    return result.rows.map(rowToSupportTicket);
  }

  async function hydrate() {
    if (!getPool()) {
      return { supportTickets: runtimeDb().supportTickets.length };
    }
    const result = await getPool().query(
      "SELECT * FROM support_tickets ORDER BY created_at DESC, id ASC LIMIT 500",
    );
    const db = runtimeDb();
    db.supportTickets = result.rows.map(rowToSupportTicket);
    return { supportTickets: db.supportTickets.length };
  }

  return {
    create,
    hydrate,
    list,
  };
}

module.exports = {
  createSupportTicketRepository,
  repositoryError,
  rowToSupportTicket,
};
