const {
  assertWorkspaceTransition,
  normalizeExpectedVersion,
  normalizeWorkspaceCreate,
  normalizeWorkspacePatch,
  normalizeWorkspaceStatus,
  normalizeWorkspaceType,
  publicWorkspaceLifecycle,
} = require("./workspaceLifecycleContract");
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

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function objectOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toIso(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function rowToWorkspace(row) {
  if (!row) return null;
  return publicWorkspaceLifecycle({
    id: row.id,
    name: row.name || "",
    type: row.type || "clinic",
    workspaceType: row.workspace_type || row.workspaceType || row.type || "clinic",
    address: row.address || "",
    phone: row.phone || "",
    email: row.email || "",
    website: row.website || "",
    status: row.status || "active",
    legalName: row.legal_name || row.legalName || "",
    representative: row.representative || "",
    ownerUserId: row.owner_user_id || row.ownerUserId || "",
    packageId: row.package_id || row.packageId || "",
    subscriptionStatus: row.subscription_status || row.subscriptionStatus || "trial",
    billingCycle: row.billing_cycle || row.billingCycle || "monthly",
    requestMetadata: row.request_metadata || row.requestMetadata || {},
    version: Number(row.version || 1),
    deletedAt: toIso(row.deleted_at || row.deletedAt),
    createdAt: toIso(row.created_at || row.createdAt),
    updatedAt: toIso(row.updated_at || row.updatedAt),
  });
}

function createWorkspaceLifecycleRepository(options) {
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
    db.memberships = arrayOf(db.memberships);
    db.auditLogs = arrayOf(db.auditLogs);
    db.idempotencyKeys = arrayOf(db.idempotencyKeys);
    return db;
  }

  function runRuntimeExclusive(operation) {
    const task = runtimeMutationTail.catch(() => {}).then(operation);
    runtimeMutationTail = task.catch(() => {});
    return task;
  }

  function restoreRuntimeDb(db, snapshot) {
    for (const key of Object.keys(db)) delete db[key];
    Object.assign(db, snapshot);
  }

  function normalizeIdempotency(input = {}) {
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

  function idempotentBody(value) {
    return { ...clone(objectOf(value)), idempotent: true };
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
    const responseBody = objectOf(existing.responseResource);
    if (!Object.keys(responseBody).length) {
      throw repositoryError(
        409,
        "IDEMPOTENCY_OUTCOME_UNAVAILABLE",
        "Stored workspace mutation outcome cannot be replayed safely",
      );
    }
    return {
      responseBody: idempotentBody(responseBody),
      responseStatus: Number(existing.responseStatus || 200),
      replayed: true,
    };
  }

  function createAudit(input = {}, operationId) {
    return {
      id: createId("audit"),
      actorUserId: String(input.actorUserId || ""),
      organizationId: String(input.organizationId || ""),
      action: String(input.action || "workspace.lifecycle.mutation"),
      resourceType: String(input.resourceType || "organization"),
      resourceId: String(input.resourceId || input.organizationId || ""),
      ip: String(input.ip || ""),
      userAgent: String(input.userAgent || ""),
      metadata: sanitizeAuditMetadata({
        ...clone(objectOf(input.metadata)),
        operationId,
      }),
      createdAt: nowIso(),
    };
  }

  function commitRuntimeMutation(db, input) {
    const auditLog = createAudit(input.audit, input.operationId);
    db.auditLogs.unshift(auditLog);
    db.idempotencyKeys.unshift({
      id: createId("idem"),
      scope: input.idempotency.scope,
      operation: input.idempotency.operation,
      key: input.idempotency.key,
      fingerprint: input.idempotency.fingerprint,
      resourceType: "organization",
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
        FOR UPDATE
      `,
      [idempotency.scope, idempotency.operation, idempotency.key],
    );
    const existing = result.rows[0] || null;
    assertFingerprint(existing, idempotency);
    if (!existing) return null;
    return {
      responseBody: idempotentBody(existing.response_json),
      responseStatus: Number(existing.response_status || 200),
      replayed: true,
    };
  }

  async function insertSqlAudit(client, auditLog) {
    await client.query(
      `
        INSERT INTO audit_logs (
          id, actor_user_id, organization_id, action, resource_type,
          resource_id, ip, user_agent, metadata, created_at
        )
        VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), $4, $5, $6, NULLIF($7, '')::inet, $8, $9::jsonb, $10)
      `,
      [
        auditLog.id,
        auditLog.actorUserId,
        auditLog.organizationId,
        auditLog.action,
        auditLog.resourceType,
        auditLog.resourceId,
        auditLog.ip,
        auditLog.userAgent,
        JSON.stringify(auditLog.metadata),
        auditLog.createdAt,
      ],
    );
  }

  async function insertSqlIdempotency(client, input) {
    await client.query(
      `
        INSERT INTO mutation_idempotency (
          id, scope, operation, idempotency_key, fingerprint, resource_type,
          resource_id, response_status, response_json, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'organization', $6, $7, $8::jsonb, now(), now())
      `,
      [
        createId("idem"),
        input.idempotency.scope,
        input.idempotency.operation,
        input.idempotency.key,
        input.idempotency.fingerprint,
        input.resourceId,
        input.responseStatus,
        JSON.stringify(input.responseBody),
      ],
    );
  }

  function syncWorkspace(workspace) {
    const db = runtimeDb();
    const index = db.organizations.findIndex((item) => item.id === workspace.id);
    if (index >= 0) db.organizations[index] = { ...db.organizations[index], ...workspace };
    else db.organizations.unshift(workspace);
  }

  function syncAudit(auditLog) {
    if (!auditLog) return;
    const db = runtimeDb();
    if (!db.auditLogs.some((item) => item.id === auditLog.id)) db.auditLogs.unshift(auditLog);
  }

  function assertVersion(workspace, expectedVersion) {
    const expected = normalizeExpectedVersion(expectedVersion);
    const currentVersion = Number(workspace.version || 1);
    if (currentVersion !== expected) {
      throw repositoryError(409, "WORKSPACE_VERSION_CONFLICT", "Workspace was changed by another operation", {
        expectedVersion: expected,
        currentVersion,
      });
    }
    return expected;
  }

  function assertRuntimeActivationReady(db, workspace) {
    if (String(workspace.workspaceType || workspace.type || "clinic") === "personal") return;
    const ownerUserId = String(workspace.ownerUserId || "");
    if (!ownerUserId) {
      throw repositoryError(409, "WORKSPACE_OWNER_REQUIRED", "An active workspace requires an owner");
    }
    const owner = db.users.find((item) => item.id === ownerUserId);
    const membership = db.memberships.find(
      (item) => item.organizationId === workspace.id && item.userId === ownerUserId,
    );
    if (
      !owner ||
      owner.role !== "workspace_owner" ||
      owner.requestedRole !== "workspace_owner" ||
      owner.roleRequestStatus !== "approved" ||
      String(owner.accountStatus || "active") !== "active" ||
      owner.organizationId !== workspace.id ||
      !membership ||
      membership.role !== "workspace_owner" ||
      String(membership.status || "active") !== "active"
    ) {
      throw repositoryError(
        409,
        "WORKSPACE_OWNER_IDENTITY_NOT_CONFIRMED",
        "Workspace owner identity and membership must be active before activation",
      );
    }
  }

  async function assertSqlActivationReady(client, workspace) {
    if (String(workspace.workspaceType || workspace.type || "clinic") === "personal") return;
    const ownerUserId = String(workspace.ownerUserId || "");
    if (!ownerUserId) {
      throw repositoryError(409, "WORKSPACE_OWNER_REQUIRED", "An active workspace requires an owner");
    }
    const [ownerResult, membershipResult] = await Promise.all([
      client.query(
        `
          SELECT id, role, requested_role, role_request_status, account_status, organization_id
          FROM users
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [ownerUserId],
      ),
      client.query(
        `
          SELECT id, role, status
          FROM memberships
          WHERE organization_id = $1 AND user_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [workspace.id, ownerUserId],
      ),
    ]);
    const owner = ownerResult.rows[0];
    const membership = membershipResult.rows[0];
    if (
      !owner ||
      owner.role !== "workspace_owner" ||
      owner.requested_role !== "workspace_owner" ||
      owner.role_request_status !== "approved" ||
      String(owner.account_status || "active") !== "active" ||
      owner.organization_id !== workspace.id ||
      !membership ||
      membership.role !== "workspace_owner" ||
      String(membership.status || "active") !== "active"
    ) {
      throw repositoryError(
        409,
        "WORKSPACE_OWNER_IDENTITY_NOT_CONFIRMED",
        "Workspace owner identity and membership must be active before activation",
      );
    }
  }

  function applyRuntimeOwnerReviewState(db, workspace, nextStatus, metadata) {
    if (!["pending", "needs_info", "rejected"].includes(nextStatus) || !workspace.ownerUserId) return null;
    const owner = db.users.find((item) => item.id === workspace.ownerUserId);
    if (!owner || owner.requestedRole !== "workspace_owner") return null;
    if (owner.role === "workspace_owner" || owner.roleRequestStatus === "approved") {
      throw repositoryError(
        409,
        "WORKSPACE_OWNER_ROLE_TRANSITION_REQUIRED",
        "An approved workspace owner cannot be downgraded by the review lifecycle",
      );
    }
    owner.role = "patient";
    owner.requestedRole = "workspace_owner";
    owner.roleRequestStatus = nextStatus;
    owner.accountStatus = "active";
    owner.organizationId = workspace.id;
    owner.roleApprovedAt = "";
    owner.roleRejectedAt = nextStatus === "rejected" ? nowIso() : "";
    owner.roleRejectReason = nextStatus === "rejected" ? metadata.reason : "";
    owner.roleInfoRequestAt = nextStatus === "needs_info" ? nowIso() : "";
    owner.roleInfoRequestMessage = nextStatus === "needs_info" ? metadata.message : "";
    owner.roleInfoRequiredFields = nextStatus === "needs_info" ? metadata.requiredFields : [];
    owner.updatedAt = nowIso();
    return owner;
  }

  async function updateSqlOwnerReviewState(client, workspace, nextStatus, metadata) {
    if (!["pending", "needs_info", "rejected"].includes(nextStatus) || !workspace.ownerUserId) return;
    const selected = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1 FOR UPDATE", [workspace.ownerUserId]);
    const owner = selected.rows[0];
    if (!owner || owner.requested_role !== "workspace_owner") return;
    if (owner.role === "workspace_owner" || owner.role_request_status === "approved") {
      throw repositoryError(
        409,
        "WORKSPACE_OWNER_ROLE_TRANSITION_REQUIRED",
        "An approved workspace owner cannot be downgraded by the review lifecycle",
      );
    }
    await client.query(
      `
        UPDATE users
        SET role = 'patient', requested_role = 'workspace_owner', role_request_status = $2,
            account_status = 'active', organization_id = $3, role_approved_at = NULL,
            role_rejected_at = CASE WHEN $2 = 'rejected' THEN now() ELSE NULL END,
            role_reject_reason = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END,
            role_info_request_at = CASE WHEN $2 = 'needs_info' THEN now() ELSE NULL END,
            role_info_request_message = CASE WHEN $2 = 'needs_info' THEN $5 ELSE NULL END,
            firebase_claims = jsonb_set(
              COALESCE(firebase_claims, '{}'::jsonb),
              '{roleInfoRequiredFields}',
              CASE WHEN $2 = 'needs_info' THEN $6::jsonb ELSE '[]'::jsonb END,
              true
            ),
            updated_at = now()
        WHERE id = $1
      `,
      [workspace.ownerUserId, nextStatus, workspace.id, metadata.reason, metadata.message, JSON.stringify(metadata.requiredFields)],
    );
  }

  function normalizeListInput(input = {}) {
    const explicitPagination =
      (input.page !== undefined && input.page !== null && input.page !== "") ||
      (input.limit !== undefined && input.limit !== null && input.limit !== "");
    const page = Math.max(1, Number.parseInt(input.page, 10) || 1);
    const limit = explicitPagination
      ? Math.min(100, Math.max(1, Number.parseInt(input.limit, 10) || 25))
      : 1000;
    const q = String(input.q || "").trim().toLowerCase();
    const organizationId = String(input.organizationId || "").trim();
    const statusValue = String(input.status || "").trim().toLowerCase();
    const workspaceTypeValue = String(input.workspaceType || "").trim().toLowerCase();
    const status = statusValue && statusValue !== "all"
      ? normalizeWorkspaceStatus(statusValue)
      : "";
    const workspaceType = workspaceTypeValue && workspaceTypeValue !== "all"
      ? normalizeWorkspaceType(workspaceTypeValue)
      : "";
    const [sortFieldRaw, sortDirectionRaw] = String(input.sort || "updatedAt:desc").split(":");
    const sortField = ["name", "status", "createdAt", "updatedAt", "version"].includes(sortFieldRaw)
      ? sortFieldRaw
      : "updatedAt";
    const sortDirection = String(sortDirectionRaw || "desc").toLowerCase() === "asc" ? "asc" : "desc";
    return {
      page,
      limit,
      q,
      organizationId,
      status,
      workspaceType,
      sortField,
      sortDirection,
      explicitPagination,
    };
  }

  function paginateWorkspaces(items, input) {
    const filtered = items
      .filter((item) => !item.deletedAt)
      .filter((item) => !input.organizationId || item.id === input.organizationId)
      .filter((item) => !input.status || item.status === input.status)
      .filter((item) => !input.workspaceType || item.workspaceType === input.workspaceType)
      .filter((item) => {
        if (!input.q) return true;
        return [item.id, item.name, item.email, item.phone, item.address, item.legalName]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(input.q));
      })
      .sort((left, right) => {
        const leftValue = input.sortField === "version"
          ? Number(left.version || 1)
          : String(left[input.sortField] || "").toLowerCase();
        const rightValue = input.sortField === "version"
          ? Number(right.version || 1)
          : String(right[input.sortField] || "").toLowerCase();
        const compared = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
        if (compared !== 0) return input.sortDirection === "asc" ? compared : -compared;
        return String(left.id).localeCompare(String(right.id));
      });
    const start = (input.page - 1) * input.limit;
    return {
      items: filtered.slice(start, start + input.limit).map(publicWorkspaceLifecycle),
      total: filtered.length,
      page: input.page,
      limit: input.limit,
    };
  }

  async function list(input = {}) {
    const normalized = normalizeListInput(input);
    const pool = getPool();
    if (!pool) {
      return paginateWorkspaces(runtimeDb().organizations.map(rowToWorkspace), normalized);
    }
    const parameters = [];
    const predicates = ["deleted_at IS NULL"];
    if (normalized.organizationId) {
      parameters.push(normalized.organizationId);
      predicates.push(`id = $${parameters.length}`);
    }
    if (normalized.status) {
      parameters.push(normalized.status);
      predicates.push(`status = $${parameters.length}`);
    }
    if (normalized.workspaceType) {
      parameters.push(normalized.workspaceType);
      predicates.push(`workspace_type = $${parameters.length}`);
    }
    if (normalized.q) {
      parameters.push(`%${normalized.q}%`);
      predicates.push(`(
        LOWER(id) LIKE $${parameters.length}
        OR LOWER(name) LIKE $${parameters.length}
        OR LOWER(COALESCE(email, '')) LIKE $${parameters.length}
        OR LOWER(COALESCE(phone, '')) LIKE $${parameters.length}
        OR LOWER(COALESCE(address, '')) LIKE $${parameters.length}
        OR LOWER(COALESCE(legal_name, '')) LIKE $${parameters.length}
      )`);
    }
    const whereSql = predicates.join(" AND ");
    const sortColumns = {
      name: "name",
      status: "status",
      createdAt: "created_at",
      updatedAt: "updated_at",
      version: "version",
    };
    const sortColumn = sortColumns[normalized.sortField] || "updated_at";
    const sortDirection = normalized.sortDirection === "asc" ? "ASC" : "DESC";
    const countResult = await pool.query(
      `SELECT COUNT(*)::bigint AS total FROM organizations WHERE ${whereSql}`,
      parameters,
    );
    const listParameters = [...parameters, normalized.limit, (normalized.page - 1) * normalized.limit];
    const rowsResult = await pool.query(
      `
        SELECT *
        FROM organizations
        WHERE ${whereSql}
        ORDER BY ${sortColumn} ${sortDirection}, id ASC
        LIMIT $${listParameters.length - 1}
        OFFSET $${listParameters.length}
      `,
      listParameters,
    );
    return {
      items: rowsResult.rows.map(rowToWorkspace),
      total: Number(countResult.rows[0]?.total || 0),
      page: normalized.page,
      limit: normalized.limit,
    };
  }

  async function findById(workspaceId, input = {}) {
    const id = String(workspaceId || "");
    if (!id) return null;
    const pool = getPool();
    if (!pool) {
      const workspace = runtimeDb().organizations.find(
        (item) => item.id === id && (input.includeArchived || !item.deletedAt),
      );
      return workspace ? rowToWorkspace(workspace) : null;
    }
    const result = await pool.query(
      `SELECT * FROM organizations WHERE id = $1 ${input.includeArchived ? "" : "AND deleted_at IS NULL"} LIMIT 1`,
      [id],
    );
    return result.rows[0] ? rowToWorkspace(result.rows[0]) : null;
  }

  async function create(input = {}) {
    const idempotency = normalizeIdempotency(input.idempotency);
    const payload = normalizeWorkspaceCreate(input.payload);
    const workspaceId = String(input.workspaceId || "");
    if (!workspaceId) throw repositoryError(400, "WORKSPACE_ID_REQUIRED", "Workspace id is required");

    if (getPool()) {
      const result = await withSqlTransaction(async (client) => {
        const replay = await sqlReplay(client, idempotency);
        if (replay) return replay;
        const existing = await client.query("SELECT id FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE", [workspaceId]);
        if (existing.rows[0]) {
          throw repositoryError(409, "WORKSPACE_ALREADY_EXISTS", "Workspace id already exists");
        }
        if (payload.ownerUserId) {
          const owner = await client.query("SELECT id FROM users WHERE id = $1 LIMIT 1", [payload.ownerUserId]);
          if (!owner.rows[0]) throw repositoryError(404, "WORKSPACE_OWNER_NOT_FOUND", "Workspace owner was not found");
        }
        const operationId = createId("workspace_operation");
        const inserted = await client.query(
          `
            INSERT INTO organizations (
              id, name, type, workspace_type, address, phone, email, website, status,
              legal_name, representative, owner_user_id, package_id, subscription_status,
              billing_cycle, request_metadata, version, deleted_at, created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), $9,
              NULLIF($10, ''), NULLIF($11, ''), NULLIF($12, ''), NULLIF($13, ''), $14,
              $15, $16::jsonb, 1, NULL, now(), now()
            )
            RETURNING *
          `,
          [
            workspaceId,
            payload.name,
            payload.type,
            payload.workspaceType,
            payload.address,
            payload.phone,
            payload.email,
            payload.website,
            payload.status,
            payload.legalName,
            payload.representative,
            payload.ownerUserId,
            payload.packageId,
            payload.subscriptionStatus,
            payload.billingCycle,
            JSON.stringify(payload.requestMetadata),
          ],
        );
        const workspace = rowToWorkspace(inserted.rows[0]);
        const responseBody = { workspace, operationId, idempotent: false };
        const auditLog = createAudit(
          { ...input.audit, organizationId: workspace.id, resourceId: workspace.id },
          operationId,
        );
        await insertSqlAudit(client, auditLog);
        await insertSqlIdempotency(client, {
          idempotency,
          resourceId: workspace.id,
          responseStatus: 201,
          responseBody,
        });
        return { responseBody, responseStatus: 201, replayed: false, workspace, auditLog };
      });
      if (!result.replayed) {
        syncWorkspace(result.workspace);
        syncAudit(result.auditLog);
        await saveDb();
      }
      return result;
    }

    return runRuntimeExclusive(async () => {
      const db = runtimeDb();
      const replay = runtimeReplay(db, idempotency);
      if (replay) return replay;
      if (db.organizations.some((item) => item.id === workspaceId)) {
        throw repositoryError(409, "WORKSPACE_ALREADY_EXISTS", "Workspace id already exists");
      }
      if (payload.ownerUserId && !db.users.some((item) => item.id === payload.ownerUserId)) {
        throw repositoryError(404, "WORKSPACE_OWNER_NOT_FOUND", "Workspace owner was not found");
      }
      const snapshot = clone(db);
      try {
        const operationId = createId("workspace_operation");
        const workspace = publicWorkspaceLifecycle({
          id: workspaceId,
          ...payload,
          version: 1,
          deletedAt: "",
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        db.organizations.unshift(workspace);
        const responseBody = { workspace: publicWorkspaceLifecycle(workspace), operationId, idempotent: false };
        commitRuntimeMutation(db, {
          audit: { ...input.audit, organizationId: workspace.id, resourceId: workspace.id },
          idempotency,
          operationId,
          resourceId: workspace.id,
          responseStatus: 201,
          responseBody,
        });
        await saveDb();
        return { responseBody, responseStatus: 201, replayed: false, workspace };
      } catch (error) {
        restoreRuntimeDb(db, snapshot);
        throw error;
      }
    });
  }

  async function update(input = {}) {
    const idempotency = normalizeIdempotency(input.idempotency);
    const payload = normalizeWorkspacePatch(input.payload);
    const workspaceId = String(input.workspaceId || "");
    const expectedVersion = normalizeExpectedVersion(input.expectedVersion);

    if (getPool()) {
      const result = await withSqlTransaction(async (client) => {
        const replay = await sqlReplay(client, idempotency);
        if (replay) return replay;
        const selected = await client.query(
          "SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
          [workspaceId],
        );
        if (!selected.rows[0]) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
        const current = rowToWorkspace(selected.rows[0]);
        assertVersion(current, expectedVersion);
        const next = publicWorkspaceLifecycle({ ...current, ...payload });
        const operationId = createId("workspace_operation");
        const updated = await client.query(
          `
            UPDATE organizations
            SET name = $2, type = $3, workspace_type = $4, address = NULLIF($5, ''),
                phone = NULLIF($6, ''), email = NULLIF($7, ''), website = NULLIF($8, ''),
                legal_name = NULLIF($9, ''), representative = NULLIF($10, ''),
                package_id = NULLIF($11, ''), subscription_status = $12, billing_cycle = $13,
                request_metadata = $14::jsonb, version = version + 1, updated_at = now()
            WHERE id = $1 AND version = $15 AND deleted_at IS NULL
            RETURNING *
          `,
          [
            workspaceId,
            next.name,
            next.type,
            next.workspaceType,
            next.address,
            next.phone,
            next.email,
            next.website,
            next.legalName,
            next.representative,
            next.packageId,
            next.subscriptionStatus,
            next.billingCycle,
            JSON.stringify(next.requestMetadata),
            expectedVersion,
          ],
        );
        if (!updated.rows[0]) {
          throw repositoryError(409, "WORKSPACE_VERSION_CONFLICT", "Workspace was changed by another operation");
        }
        const workspace = rowToWorkspace(updated.rows[0]);
        const responseBody = { workspace, operationId, idempotent: false };
        const auditLog = createAudit(
          {
            ...input.audit,
            organizationId: workspace.id,
            resourceId: workspace.id,
            metadata: { ...objectOf(input.audit?.metadata), fields: Object.keys(payload).sort() },
          },
          operationId,
        );
        await insertSqlAudit(client, auditLog);
        await insertSqlIdempotency(client, {
          idempotency,
          resourceId: workspace.id,
          responseStatus: 200,
          responseBody,
        });
        return { responseBody, responseStatus: 200, replayed: false, workspace, auditLog };
      });
      if (!result.replayed) {
        syncWorkspace(result.workspace);
        syncAudit(result.auditLog);
        await saveDb();
      }
      return result;
    }

    return runRuntimeExclusive(async () => {
      const db = runtimeDb();
      const replay = runtimeReplay(db, idempotency);
      if (replay) return replay;
      const workspace = db.organizations.find((item) => item.id === workspaceId && !item.deletedAt);
      if (!workspace) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
      assertVersion(workspace, expectedVersion);
      const snapshot = clone(db);
      try {
        Object.assign(workspace, payload, { version: expectedVersion + 1, updatedAt: nowIso() });
        const operationId = createId("workspace_operation");
        const responseBody = { workspace: publicWorkspaceLifecycle(workspace), operationId, idempotent: false };
        commitRuntimeMutation(db, {
          audit: {
            ...input.audit,
            organizationId: workspace.id,
            resourceId: workspace.id,
            metadata: { ...objectOf(input.audit?.metadata), fields: Object.keys(payload).sort() },
          },
          idempotency,
          operationId,
          resourceId: workspace.id,
          responseStatus: 200,
          responseBody,
        });
        await saveDb();
        return { responseBody, responseStatus: 200, replayed: false, workspace };
      } catch (error) {
        restoreRuntimeDb(db, snapshot);
        throw error;
      }
    });
  }

  function validateTransitionMetadata(nextStatus, input) {
    const reason = String(input.reason || "").trim().slice(0, 1000);
    const message = String(input.message || input.reason || "").trim().slice(0, 1000);
    const requiredFields = arrayOf(input.requiredFields)
      .map((value) => String(value || "").trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 30);
    if (nextStatus === "rejected" && !reason) {
      throw repositoryError(400, "WORKSPACE_REJECT_REASON_REQUIRED", "A rejection reason is required");
    }
    if (nextStatus === "needs_info" && !message) {
      throw repositoryError(400, "WORKSPACE_INFO_MESSAGE_REQUIRED", "An information request message is required");
    }
    return { reason, message, requiredFields };
  }

  async function transition(input = {}) {
    const idempotency = normalizeIdempotency(input.idempotency);
    const workspaceId = String(input.workspaceId || "");
    const expectedVersion = normalizeExpectedVersion(input.expectedVersion);
    const nextStatus = String(input.nextStatus || "").trim().toLowerCase();
    const transitionMetadata = validateTransitionMetadata(nextStatus, input);

    if (getPool()) {
      const result = await withSqlTransaction(async (client) => {
        const replay = await sqlReplay(client, idempotency);
        if (replay) return replay;
        const selected = await client.query(
          "SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
          [workspaceId],
        );
        if (!selected.rows[0]) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
        const current = rowToWorkspace(selected.rows[0]);
        assertVersion(current, expectedVersion);
        const lifecycleTransition = assertWorkspaceTransition(current.status, nextStatus);
        if (nextStatus === "active") await assertSqlActivationReady(client, current);
        else await updateSqlOwnerReviewState(client, current, nextStatus, transitionMetadata);
        const operationId = createId("workspace_operation");
        const updated = await client.query(
          `
            UPDATE organizations
            SET status = $2, version = version + 1, updated_at = now()
            WHERE id = $1 AND version = $3 AND deleted_at IS NULL
            RETURNING *
          `,
          [workspaceId, nextStatus, expectedVersion],
        );
        if (!updated.rows[0]) {
          throw repositoryError(409, "WORKSPACE_VERSION_CONFLICT", "Workspace was changed by another operation");
        }
        const workspace = rowToWorkspace(updated.rows[0]);
        const responseBody = {
          workspace,
          transition: lifecycleTransition,
          operationId,
          idempotent: false,
        };
        const auditLog = createAudit(
          {
            ...input.audit,
            organizationId: workspace.id,
            resourceId: workspace.id,
            metadata: {
              ...objectOf(input.audit?.metadata),
              transition: lifecycleTransition,
              ...transitionMetadata,
            },
          },
          operationId,
        );
        await insertSqlAudit(client, auditLog);
        await insertSqlIdempotency(client, {
          idempotency,
          resourceId: workspace.id,
          responseStatus: 200,
          responseBody,
        });
        return { responseBody, responseStatus: 200, replayed: false, workspace, auditLog };
      });
      if (!result.replayed) {
        syncWorkspace(result.workspace);
        syncAudit(result.auditLog);
        await saveDb();
      }
      return result;
    }

    return runRuntimeExclusive(async () => {
      const db = runtimeDb();
      const replay = runtimeReplay(db, idempotency);
      if (replay) return replay;
      const workspace = db.organizations.find((item) => item.id === workspaceId && !item.deletedAt);
      if (!workspace) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
      assertVersion(workspace, expectedVersion);
      const lifecycleTransition = assertWorkspaceTransition(workspace.status, nextStatus);
      if (nextStatus === "active") assertRuntimeActivationReady(db, workspace);
      const snapshot = clone(db);
      try {
        if (nextStatus !== "active") {
          applyRuntimeOwnerReviewState(db, workspace, nextStatus, transitionMetadata);
        }
        workspace.status = nextStatus;
        workspace.version = expectedVersion + 1;
        workspace.updatedAt = nowIso();
        const operationId = createId("workspace_operation");
        const responseBody = {
          workspace: publicWorkspaceLifecycle(workspace),
          transition: lifecycleTransition,
          operationId,
          idempotent: false,
        };
        commitRuntimeMutation(db, {
          audit: {
            ...input.audit,
            organizationId: workspace.id,
            resourceId: workspace.id,
            metadata: {
              ...objectOf(input.audit?.metadata),
              transition: lifecycleTransition,
              ...transitionMetadata,
            },
          },
          idempotency,
          operationId,
          resourceId: workspace.id,
          responseStatus: 200,
          responseBody,
        });
        await saveDb();
        return { responseBody, responseStatus: 200, replayed: false, workspace };
      } catch (error) {
        restoreRuntimeDb(db, snapshot);
        throw error;
      }
    });
  }

  async function archive(input = {}) {
    const idempotency = normalizeIdempotency(input.idempotency);
    const workspaceId = String(input.workspaceId || "");
    const expectedVersion = normalizeExpectedVersion(input.expectedVersion);

    function assertArchivable(workspace) {
      if (String(workspace.workspaceType || workspace.type || "clinic") === "personal") {
        throw repositoryError(409, "PERSONAL_WORKSPACE_ARCHIVE_FORBIDDEN", "A personal workspace cannot be archived");
      }
      if (String(workspace.status || "active") === "active") {
        throw repositoryError(
          409,
          "WORKSPACE_ARCHIVE_REQUIRES_INACTIVE",
          "An active workspace must be deactivated before archival",
        );
      }
    }

    if (getPool()) {
      const result = await withSqlTransaction(async (client) => {
        const replay = await sqlReplay(client, idempotency);
        if (replay) return replay;
        const selected = await client.query(
          "SELECT * FROM organizations WHERE id = $1 AND deleted_at IS NULL LIMIT 1 FOR UPDATE",
          [workspaceId],
        );
        if (!selected.rows[0]) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
        const current = rowToWorkspace(selected.rows[0]);
        assertVersion(current, expectedVersion);
        assertArchivable(current);
        const operationId = createId("workspace_operation");
        const updated = await client.query(
          `
            UPDATE organizations
            SET deleted_at = now(), version = version + 1, updated_at = now()
            WHERE id = $1 AND version = $2 AND deleted_at IS NULL
            RETURNING *
          `,
          [workspaceId, expectedVersion],
        );
        if (!updated.rows[0]) {
          throw repositoryError(409, "WORKSPACE_VERSION_CONFLICT", "Workspace was changed by another operation");
        }
        const workspace = rowToWorkspace(updated.rows[0]);
        const responseBody = { deleted: true, workspaceId, operationId, idempotent: false };
        const auditLog = createAudit(
          {
            ...input.audit,
            organizationId: workspace.id,
            resourceId: workspace.id,
            metadata: { ...objectOf(input.audit?.metadata), archivedAt: workspace.deletedAt },
          },
          operationId,
        );
        await insertSqlAudit(client, auditLog);
        await insertSqlIdempotency(client, {
          idempotency,
          resourceId: workspace.id,
          responseStatus: 200,
          responseBody,
        });
        return { responseBody, responseStatus: 200, replayed: false, workspace, auditLog };
      });
      if (!result.replayed) {
        syncWorkspace(result.workspace);
        syncAudit(result.auditLog);
        await saveDb();
      }
      return result;
    }

    return runRuntimeExclusive(async () => {
      const db = runtimeDb();
      const replay = runtimeReplay(db, idempotency);
      if (replay) return replay;
      const workspace = db.organizations.find((item) => item.id === workspaceId && !item.deletedAt);
      if (!workspace) throw repositoryError(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
      assertVersion(workspace, expectedVersion);
      assertArchivable(workspace);
      const snapshot = clone(db);
      try {
        workspace.deletedAt = nowIso();
        workspace.version = expectedVersion + 1;
        workspace.updatedAt = nowIso();
        const operationId = createId("workspace_operation");
        const responseBody = { deleted: true, workspaceId, operationId, idempotent: false };
        commitRuntimeMutation(db, {
          audit: {
            ...input.audit,
            organizationId: workspace.id,
            resourceId: workspace.id,
            metadata: { ...objectOf(input.audit?.metadata), archivedAt: workspace.deletedAt },
          },
          idempotency,
          operationId,
          resourceId: workspace.id,
          responseStatus: 200,
          responseBody,
        });
        await saveDb();
        return { responseBody, responseStatus: 200, replayed: false, workspace };
      } catch (error) {
        restoreRuntimeDb(db, snapshot);
        throw error;
      }
    });
  }

  return {
    archive,
    create,
    findById,
    list,
    transition,
    update,
  };
}

module.exports = {
  createWorkspaceLifecycleRepository,
  rowToWorkspace,
};
