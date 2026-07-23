const {
  STAFF_INVITATION_EMAIL_STATUSES,
  assertStaffInvitationTokenHash,
  normalizeIsoTimestamp,
  normalizeStaffInvitationCreate,
  normalizeStaffInvitationDelivery,
  normalizeStaffInvitationEmail,
  normalizeStaffInvitationRevoke,
  normalizeStaffInvitationRole,
  publicStaffInvitation,
  resolveStaffInvitationStatus,
} = require("./staffInvitationContract");
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

function rowToStaffInvitation(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    email: row.email || "",
    role: row.role || "viewer",
    name: row.name || "",
    phone: row.phone || "",
    specialty: row.specialty || "",
    license: row.license || "",
    status: row.status || "pending",
    tokenHash: row.token_hash || "",
    expiresAt: toIso(row.expires_at),
    acceptedAt: toIso(row.accepted_at),
    acceptedByUserId: row.accepted_by_user_id || "",
    revokedAt: toIso(row.revoked_at),
    revokedByUserId: row.revoked_by_user_id || "",
    revokeReason: row.revoke_reason || "",
    createdByUserId: row.created_by_user_id || "",
    lastSentAt: toIso(row.last_sent_at),
    sendCount: Number(row.send_count || 0),
    delivery: {
      email: row.email_delivery_status || "unavailable",
      provider: row.email_provider || "",
      messageId: row.email_message_id || "",
      lastAttemptAt: toIso(row.email_last_attempt_at),
      errorCode: row.email_error_code || "",
    },
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    userId: row.user_id || "",
    role: row.role || "viewer",
    status: row.status || "active",
    suspendedAt: toIso(row.suspended_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at) || toIso(row.created_at),
  };
}

function rowToAcceptedUser(row) {
  if (!row) return null;
  const firebaseClaims = objectOf(row.firebase_claims);
  const profile = objectOf(firebaseClaims.profile);
  return {
    id: row.id,
    firebaseUid: row.firebase_uid || "",
    email: row.email || "",
    phone: row.phone || "",
    role: row.role || "patient",
    name: row.name || "",
    license: row.license || "",
    hospital: row.hospital || "",
    department: row.department || "",
    specialty: profile.specialty || row.department || "",
    organizationId: row.organization_id || "",
    patientId: row.patient_id || "",
    verifiedEmail: Boolean(row.verified_email),
    verifiedPhone: Boolean(row.verified_phone),
    accountStatus: row.account_status || "active",
    requestedRole: row.requested_role || "",
    roleRequestStatus: row.role_request_status || "",
    roleRequestedAt: toIso(row.role_requested_at),
    roleApprovedAt: toIso(row.role_approved_at),
    roleRejectedAt: toIso(row.role_rejected_at),
    roleRejectReason: row.role_reject_reason || "",
    firebaseClaims,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function createStaffInvitationRepository(options) {
  const getDb = options.getDb;
  const saveDb = options.saveDb;
  const createId = options.createId;
  const nowIso = options.nowIso;
  const getPool = options.getPool || (() => null);
  let runtimeMutationTail = Promise.resolve();

  function runtimeDb() {
    const db = getDb();
    db.staffInvitations = arrayOf(db.staffInvitations);
    db.memberships = arrayOf(db.memberships);
    db.users = arrayOf(db.users);
    db.organizations = arrayOf(db.organizations);
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
        "Stored staff invitation mutation outcome cannot be replayed safely",
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
      action: String(input.action || "staff.invitation.mutation"),
      resourceType: String(input.resourceType || "staff_invitation"),
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

  function syncRuntimeItem(items, item) {
    if (!item?.id) return;
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) items[index] = { ...items[index], ...clone(item) };
    else items.unshift(clone(item));
  }

  async function syncSqlOutcomeToRuntime(result, input) {
    const db = runtimeDb();
    if (result.invitationInternal) syncRuntimeItem(db.staffInvitations, result.invitationInternal);
    if (result.membership) syncRuntimeItem(db.memberships, result.membership);
    if (result.user) syncRuntimeItem(db.users, result.user);
    if (!result.replayed && result.auditLog) syncRuntimeItem(db.auditLogs, result.auditLog);
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
        const audit = {
          ...input.audit,
          ...outcome.audit,
          resourceType: input.resourceType,
          resourceId: outcome.resourceId,
        };
        const auditLog = commitRuntimeMutation(db, {
          ...input,
          ...outcome,
          audit,
        });
        await saveDb();
        return {
          ...outcome,
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
        ...outcome.audit,
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
        ...outcome,
        responseBody: outcome.responseBody,
        responseStatus: input.responseStatus,
        replayed: false,
        auditLog,
      };
    });
    await syncSqlOutcomeToRuntime(result, input);
    return result;
  }

  async function mutate(input, runtimeOperation, sqlOperation) {
    const normalized = { ...input, idempotency: assertIdempotency(input.idempotency) };
    return getPool()
      ? mutateSql(normalized, sqlOperation)
      : mutateRuntime(normalized, runtimeOperation);
  }

  function assertActiveWorkspace(db, organizationId) {
    const workspace = db.organizations.find((item) => item.id === organizationId);
    if (!workspace) {
      throw repositoryError(404, "STAFF_INVITATION_WORKSPACE_NOT_FOUND", "Workspace was not found");
    }
    if (String(workspace.status || "active").toLowerCase() !== "active") {
      throw repositoryError(
        409,
        "STAFF_INVITATION_WORKSPACE_INACTIVE",
        "Staff can only be invited to an active workspace",
      );
    }
    return workspace;
  }

  function assertFutureExpiry(expiresAt) {
    const canonical = normalizeIsoTimestamp(
      expiresAt,
      "STAFF_INVITATION_EXPIRY_INVALID",
      "A valid staff invitation expiry is required",
    );
    if (Date.parse(canonical) <= Date.parse(nowIso())) {
      throw repositoryError(
        400,
        "STAFF_INVITATION_EXPIRY_INVALID",
        "Staff invitation expiry must be in the future",
      );
    }
    return canonical;
  }

  function buildInvitation(input) {
    const payload = normalizeStaffInvitationCreate(input.payload);
    const createdAt = nowIso();
    return {
      id: createId("staff_invitation"),
      ...payload,
      status: "pending",
      tokenHash: assertStaffInvitationTokenHash(input.tokenHash),
      expiresAt: assertFutureExpiry(input.expiresAt),
      acceptedAt: "",
      acceptedByUserId: "",
      revokedAt: "",
      revokedByUserId: "",
      revokeReason: "",
      createdByUserId: String(input.audit?.actorUserId || ""),
      lastSentAt: "",
      sendCount: 0,
      delivery: normalizeStaffInvitationDelivery({
        email: input.deliveryEmail,
        provider: input.deliveryProvider,
      }),
      createdAt,
      updatedAt: createdAt,
    };
  }

  async function list(filters = {}) {
    const organizationId = String(filters.organizationId || "");
    const role = filters.role ? normalizeStaffInvitationRole(filters.role) : "";
    const status = String(filters.status || "").toLowerCase();
    const applyFilters = (items) =>
      items
        .map((item) => publicStaffInvitation(item, { now: nowIso() }))
        .filter((item) => !organizationId || item.organizationId === organizationId)
        .filter((item) => !role || item.role === role)
        .filter((item) => !status || item.status === status)
        .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    if (!getPool()) return clone(applyFilters(runtimeDb().staffInvitations));
    const result = await getPool().query(
      `
        SELECT *
        FROM staff_invitations
        WHERE ($1 = '' OR organization_id = $1)
          AND ($2 = '' OR role = $2)
        ORDER BY created_at DESC, id ASC
        LIMIT 500
      `,
      [organizationId, role],
    );
    const canonical = result.rows.map(rowToStaffInvitation);
    const db = runtimeDb();
    if (organizationId) {
      db.staffInvitations = db.staffInvitations.filter((item) => item.organizationId !== organizationId);
      db.staffInvitations.push(...clone(canonical));
    } else {
      db.staffInvitations = clone(canonical);
    }
    return clone(applyFilters(canonical));
  }

  async function findById(invitationId) {
    const id = String(invitationId || "");
    if (!getPool()) {
      return publicStaffInvitation(
        runtimeDb().staffInvitations.find((item) => item.id === id) || null,
        { now: nowIso() },
      );
    }
    const result = await getPool().query(
      "SELECT * FROM staff_invitations WHERE id = $1 LIMIT 1",
      [id],
    );
    return publicStaffInvitation(rowToStaffInvitation(result.rows[0]), { now: nowIso() });
  }

  async function create(input = {}) {
    const invitation = buildInvitation(input);
    return mutate(
      { ...input, resourceType: "staff_invitation", responseStatus: 201 },
      async (db) => {
        assertActiveWorkspace(db, invitation.organizationId);
        for (const current of db.staffInvitations) {
          if (
            current.organizationId === invitation.organizationId &&
            current.email === invitation.email &&
            resolveStaffInvitationStatus(current, nowIso()) === "expired" &&
            current.status === "pending"
          ) {
            current.status = "expired";
            current.updatedAt = nowIso();
          }
        }
        const account = db.users.find(
          (user) => String(user.email || "").toLowerCase() === invitation.email,
        );
        if (
          account &&
          db.memberships.some(
            (membership) =>
              membership.organizationId === invitation.organizationId &&
              membership.userId === account.id &&
              String(membership.status || "active") !== "revoked",
          )
        ) {
          throw repositoryError(
            409,
            "STAFF_MEMBERSHIP_EXISTS",
            "This account already belongs to the selected workspace",
          );
        }
        const duplicate = db.staffInvitations.find(
          (current) =>
            current.organizationId === invitation.organizationId &&
            current.email === invitation.email &&
            current.status === "pending",
        );
        if (duplicate) {
          throw repositoryError(
            409,
            "STAFF_INVITATION_PENDING",
            "A pending invitation already exists for this email and workspace",
            { invitationId: duplicate.id },
          );
        }
        db.staffInvitations.unshift(clone(invitation));
        return {
          resourceId: invitation.id,
          invitationInternal: clone(invitation),
          responseBody: {
            invitation: publicStaffInvitation(invitation, { now: nowIso() }),
          },
        };
      },
      async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `staff-invitation:${invitation.organizationId}:${invitation.email}`,
        ]);
        const workspace = await client.query(
          "SELECT id, status FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
          [invitation.organizationId],
        );
        if (!workspace.rows[0]) {
          throw repositoryError(404, "STAFF_INVITATION_WORKSPACE_NOT_FOUND", "Workspace was not found");
        }
        if (String(workspace.rows[0].status || "active").toLowerCase() !== "active") {
          throw repositoryError(
            409,
            "STAFF_INVITATION_WORKSPACE_INACTIVE",
            "Staff can only be invited to an active workspace",
          );
        }
        await client.query(
          `
            UPDATE staff_invitations
            SET status = 'expired', updated_at = $3::timestamptz
            WHERE organization_id = $1 AND lower(email) = lower($2)
              AND status = 'pending' AND expires_at <= $3::timestamptz
          `,
          [invitation.organizationId, invitation.email, nowIso()],
        );
        const membership = await client.query(
          `
            SELECT membership.id
            FROM memberships membership
            JOIN users account ON account.id = membership.user_id
            WHERE membership.organization_id = $1 AND lower(account.email) = lower($2)
            LIMIT 1
            FOR UPDATE OF membership, account
          `,
          [invitation.organizationId, invitation.email],
        );
        if (membership.rows[0]) {
          throw repositoryError(
            409,
            "STAFF_MEMBERSHIP_EXISTS",
            "This account already belongs to the selected workspace",
          );
        }
        const duplicate = await client.query(
          `
            SELECT id
            FROM staff_invitations
            WHERE organization_id = $1 AND lower(email) = lower($2) AND status = 'pending'
            LIMIT 1 FOR UPDATE
          `,
          [invitation.organizationId, invitation.email],
        );
        if (duplicate.rows[0]) {
          throw repositoryError(
            409,
            "STAFF_INVITATION_PENDING",
            "A pending invitation already exists for this email and workspace",
            { invitationId: duplicate.rows[0].id },
          );
        }
        const inserted = await client.query(
          `
            INSERT INTO staff_invitations (
              id, organization_id, email, role, name, phone, specialty, license,
              status, token_hash, expires_at, created_by_user_id,
              email_delivery_status, email_provider, created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              'pending', $9, $10::timestamptz, NULLIF($11, ''),
              $12, $13, $14::timestamptz, $15::timestamptz
            )
            RETURNING *
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
            invitation.tokenHash,
            invitation.expiresAt,
            invitation.createdByUserId,
            invitation.delivery.email,
            invitation.delivery.provider,
            invitation.createdAt,
            invitation.updatedAt,
          ],
        );
        const canonical = rowToStaffInvitation(inserted.rows[0]);
        return {
          resourceId: canonical.id,
          invitationInternal: canonical,
          responseBody: {
            invitation: publicStaffInvitation(canonical, { now: nowIso() }),
          },
        };
      },
    );
  }

  async function resend(input = {}) {
    const invitationId = String(input.invitationId || "");
    const organizationId = String(input.organizationId || "");
    const tokenHash = assertStaffInvitationTokenHash(input.tokenHash);
    const expiresAt = assertFutureExpiry(input.expiresAt);
    const delivery = normalizeStaffInvitationDelivery({
      email: input.deliveryEmail,
      provider: input.deliveryProvider,
    });
    const assertResendable = (invitation) => {
      if (!invitation || invitation.organizationId !== organizationId) {
        throw repositoryError(404, "STAFF_INVITATION_NOT_FOUND", "Staff invitation was not found");
      }
      if (!["pending", "expired"].includes(resolveStaffInvitationStatus(invitation, nowIso()))) {
        throw repositoryError(
          409,
          "STAFF_INVITATION_NOT_PENDING",
          "Only a pending or expired staff invitation can be resent",
        );
      }
    };
    return mutate(
      { ...input, resourceType: "staff_invitation", responseStatus: 200 },
      async (db) => {
        const invitation = db.staffInvitations.find((item) => item.id === invitationId);
        assertResendable(invitation);
        invitation.status = "pending";
        invitation.tokenHash = tokenHash;
        invitation.expiresAt = expiresAt;
        invitation.delivery = delivery;
        invitation.updatedAt = nowIso();
        return {
          resourceId: invitation.id,
          invitationInternal: clone(invitation),
          responseBody: {
            invitation: publicStaffInvitation(invitation, { now: nowIso() }),
          },
        };
      },
      async (client) => {
        const selected = await client.query(
          "SELECT * FROM staff_invitations WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE",
          [invitationId, organizationId],
        );
        const invitation = rowToStaffInvitation(selected.rows[0]);
        assertResendable(invitation);
        const updated = await client.query(
          `
            UPDATE staff_invitations
            SET status = 'pending', token_hash = $3, expires_at = $4::timestamptz,
                email_delivery_status = $5, email_provider = $6, email_message_id = '',
                email_last_attempt_at = NULL, email_error_code = '', updated_at = $7::timestamptz
            WHERE id = $1 AND organization_id = $2
            RETURNING *
          `,
          [
            invitationId,
            organizationId,
            tokenHash,
            expiresAt,
            delivery.email,
            delivery.provider,
            nowIso(),
          ],
        );
        const canonical = rowToStaffInvitation(updated.rows[0]);
        return {
          resourceId: canonical.id,
          invitationInternal: canonical,
          responseBody: {
            invitation: publicStaffInvitation(canonical, { now: nowIso() }),
          },
        };
      },
    );
  }

  async function revoke(input = {}) {
    const invitationId = String(input.invitationId || "");
    const organizationId = String(input.organizationId || "");
    const { reason } = normalizeStaffInvitationRevoke(input);
    const revokedAt = nowIso();
    const revokedByUserId = String(input.audit?.actorUserId || "");
    const assertRevocable = (invitation) => {
      if (!invitation || invitation.organizationId !== organizationId) {
        throw repositoryError(404, "STAFF_INVITATION_NOT_FOUND", "Staff invitation was not found");
      }
      if (!["pending", "expired"].includes(resolveStaffInvitationStatus(invitation, nowIso()))) {
        throw repositoryError(
          409,
          "STAFF_INVITATION_NOT_PENDING",
          "Only a pending or expired staff invitation can be revoked",
        );
      }
    };
    return mutate(
      { ...input, resourceType: "staff_invitation", responseStatus: 200 },
      async (db) => {
        const invitation = db.staffInvitations.find((item) => item.id === invitationId);
        assertRevocable(invitation);
        invitation.status = "revoked";
        invitation.revokedAt = revokedAt;
        invitation.revokedByUserId = revokedByUserId;
        invitation.revokeReason = reason;
        invitation.updatedAt = revokedAt;
        return {
          resourceId: invitation.id,
          invitationInternal: clone(invitation),
          responseBody: {
            invitation: publicStaffInvitation(invitation, { now: nowIso() }),
          },
        };
      },
      async (client) => {
        const selected = await client.query(
          "SELECT * FROM staff_invitations WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE",
          [invitationId, organizationId],
        );
        const invitation = rowToStaffInvitation(selected.rows[0]);
        assertRevocable(invitation);
        const updated = await client.query(
          `
            UPDATE staff_invitations
            SET status = 'revoked', revoked_at = $3::timestamptz,
                revoked_by_user_id = NULLIF($4, ''), revoke_reason = $5,
                updated_at = $3::timestamptz
            WHERE id = $1 AND organization_id = $2
            RETURNING *
          `,
          [invitationId, organizationId, revokedAt, revokedByUserId, reason],
        );
        const canonical = rowToStaffInvitation(updated.rows[0]);
        return {
          resourceId: canonical.id,
          invitationInternal: canonical,
          responseBody: {
            invitation: publicStaffInvitation(canonical, { now: nowIso() }),
          },
        };
      },
    );
  }

  function applyAcceptedIdentity(user, invitation, workspaceName, acceptedAt) {
    if (["admin", "platform_admin"].includes(String(user.role || "").toLowerCase())) {
      throw repositoryError(
        409,
        "STAFF_INVITATION_PLATFORM_IDENTITY_FORBIDDEN",
        "Platform administrator identities cannot accept workspace staff invitations",
      );
    }
    user.role = invitation.role;
    user.requestedRole = invitation.role;
    user.roleRequestStatus = "approved";
    user.accountStatus = "active";
    user.organizationId = invitation.organizationId;
    user.name = invitation.name || user.name || invitation.email;
    user.phone = invitation.phone || user.phone || "";
    user.department = invitation.specialty || user.department || "";
    user.specialty = invitation.specialty || user.specialty || "";
    user.license = invitation.license || user.license || "";
    user.hospital = workspaceName || user.hospital || "";
    user.roleApprovedAt = acceptedAt;
    user.updatedAt = acceptedAt;
    return user;
  }

  async function accept(input = {}) {
    const tokenHash = assertStaffInvitationTokenHash(input.tokenHash);
    const actorUserId = String(input.actorUserId || "");
    const actorEmail = normalizeStaffInvitationEmail(input.actorEmail);
    const requestedOrganizationId = String(input.organizationId || "");
    const acceptedAt = nowIso();
    const assertAcceptable = (invitation) => {
      if (!invitation || (requestedOrganizationId && invitation.organizationId !== requestedOrganizationId)) {
        throw repositoryError(404, "STAFF_INVITATION_NOT_FOUND", "Staff invitation was not found");
      }
      const status = resolveStaffInvitationStatus(invitation, nowIso());
      if (status === "expired") {
        throw repositoryError(410, "STAFF_INVITATION_EXPIRED", "Staff invitation has expired");
      }
      if (status !== "pending") {
        throw repositoryError(
          409,
          "STAFF_INVITATION_NOT_PENDING",
          "Staff invitation is no longer pending",
        );
      }
      if (invitation.email !== actorEmail) {
        throw repositoryError(
          403,
          "STAFF_INVITATION_EMAIL_MISMATCH",
          "The authenticated account email does not match this invitation",
        );
      }
    };
    return mutate(
      { ...input, resourceType: "staff_invitation", responseStatus: 200 },
      async (db) => {
        const invitation = db.staffInvitations.find((item) => item.tokenHash === tokenHash);
        assertAcceptable(invitation);
        const user = db.users.find((item) => item.id === actorUserId);
        if (!user || String(user.email || "").toLowerCase() !== actorEmail) {
          throw repositoryError(
            403,
            "STAFF_INVITATION_IDENTITY_MISMATCH",
            "Invitation acceptance requires the authenticated account identity",
          );
        }
        const workspace = assertActiveWorkspace(db, invitation.organizationId);
        if (
          db.memberships.some(
            (membership) =>
              membership.organizationId === invitation.organizationId &&
              membership.userId === actorUserId,
          )
        ) {
          throw repositoryError(
            409,
            "STAFF_MEMBERSHIP_EXISTS",
            "This account already belongs to the selected workspace",
          );
        }
        applyAcceptedIdentity(user, invitation, workspace.name, acceptedAt);
        const membership = {
          id: createId("membership"),
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
          status: "active",
          suspendedAt: "",
          createdAt: acceptedAt,
          updatedAt: acceptedAt,
        };
        db.memberships.push(membership);
        invitation.status = "accepted";
        invitation.acceptedAt = acceptedAt;
        invitation.acceptedByUserId = user.id;
        invitation.updatedAt = acceptedAt;
        return {
          resourceId: invitation.id,
          invitationInternal: clone(invitation),
          membership: clone(membership),
          user: clone(user),
          audit: {
            organizationId: invitation.organizationId,
            metadata: {
              ...(input.audit?.metadata || {}),
              acceptedRole: invitation.role,
              acceptedByUserId: user.id,
            },
          },
          responseBody: {
            invitation: publicStaffInvitation(invitation, { now: nowIso() }),
            membership: clone(membership),
            userId: user.id,
          },
        };
      },
      async (client) => {
        const selected = await client.query(
          "SELECT * FROM staff_invitations WHERE token_hash = $1 LIMIT 1 FOR UPDATE",
          [tokenHash],
        );
        const invitation = rowToStaffInvitation(selected.rows[0]);
        assertAcceptable(invitation);
        const userResult = await client.query(
          "SELECT * FROM users WHERE id = $1 LIMIT 1 FOR UPDATE",
          [actorUserId],
        );
        let user = rowToAcceptedUser(userResult.rows[0]);
        if (!user || String(user.email || "").toLowerCase() !== actorEmail) {
          throw repositoryError(
            403,
            "STAFF_INVITATION_IDENTITY_MISMATCH",
            "Invitation acceptance requires the authenticated account identity",
          );
        }
        const workspaceResult = await client.query(
          "SELECT id, name, status FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE",
          [invitation.organizationId],
        );
        const workspace = workspaceResult.rows[0];
        if (!workspace) {
          throw repositoryError(404, "STAFF_INVITATION_WORKSPACE_NOT_FOUND", "Workspace was not found");
        }
        if (String(workspace.status || "active").toLowerCase() !== "active") {
          throw repositoryError(
            409,
            "STAFF_INVITATION_WORKSPACE_INACTIVE",
            "Staff can only join an active workspace",
          );
        }
        if (["admin", "platform_admin"].includes(String(user.role || "").toLowerCase())) {
          throw repositoryError(
            409,
            "STAFF_INVITATION_PLATFORM_IDENTITY_FORBIDDEN",
            "Platform administrator identities cannot accept workspace staff invitations",
          );
        }
        const membershipResult = await client.query(
          "SELECT * FROM memberships WHERE organization_id = $1 AND user_id = $2 LIMIT 1 FOR UPDATE",
          [invitation.organizationId, user.id],
        );
        if (membershipResult.rows[0]) {
          throw repositoryError(
            409,
            "STAFF_MEMBERSHIP_EXISTS",
            "This account already belongs to the selected workspace",
          );
        }
        const updatedUser = await client.query(
          `
            UPDATE users
            SET role = $2, requested_role = $2, role_request_status = 'approved',
                account_status = 'active', organization_id = $3,
                name = COALESCE(NULLIF($4, ''), name),
                phone = COALESCE(NULLIF($5, ''), phone),
                department = COALESCE(NULLIF($6, ''), department),
                license = COALESCE(NULLIF($7, ''), license),
                hospital = COALESCE(NULLIF($8, ''), hospital),
                role_approved_at = $9::timestamptz, updated_at = $9::timestamptz
            WHERE id = $1
            RETURNING *
          `,
          [
            user.id,
            invitation.role,
            invitation.organizationId,
            invitation.name,
            invitation.phone,
            invitation.specialty,
            invitation.license,
            workspace.name || "",
            acceptedAt,
          ],
        );
        user = rowToAcceptedUser(updatedUser.rows[0]);
        const membershipId = createId("membership");
        const insertedMembership = await client.query(
          `
            INSERT INTO memberships (
              id, organization_id, user_id, role, status, suspended_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, 'active', NULL, $5::timestamptz, $5::timestamptz)
            RETURNING *
          `,
          [membershipId, invitation.organizationId, user.id, invitation.role, acceptedAt],
        );
        const membership = rowToMembership(insertedMembership.rows[0]);
        const updatedInvitation = await client.query(
          `
            UPDATE staff_invitations
            SET status = 'accepted', accepted_at = $2::timestamptz,
                accepted_by_user_id = $3, updated_at = $2::timestamptz
            WHERE id = $1
            RETURNING *
          `,
          [invitation.id, acceptedAt, user.id],
        );
        const canonical = rowToStaffInvitation(updatedInvitation.rows[0]);
        return {
          resourceId: canonical.id,
          invitationInternal: canonical,
          membership,
          user,
          audit: {
            organizationId: canonical.organizationId,
            metadata: {
              ...(input.audit?.metadata || {}),
              acceptedRole: canonical.role,
              acceptedByUserId: user.id,
            },
          },
          responseBody: {
            invitation: publicStaffInvitation(canonical, { now: nowIso() }),
            membership,
            userId: user.id,
          },
        };
      },
    );
  }

  async function recordDelivery(input = {}) {
    const invitationId = String(input.invitationId || "");
    const organizationId = String(input.organizationId || "");
    const emailStatus = String(input.email || "").toLowerCase();
    if (!STAFF_INVITATION_EMAIL_STATUSES.includes(emailStatus)) {
      throw repositoryError(
        400,
        "STAFF_INVITATION_DELIVERY_STATUS_INVALID",
        "A canonical invitation email delivery status is required",
      );
    }
    const attemptedAt = nowIso();
    const applyDelivery = (invitation) => {
      if (!invitation || invitation.organizationId !== organizationId) {
        throw repositoryError(404, "STAFF_INVITATION_NOT_FOUND", "Staff invitation was not found");
      }
      invitation.delivery = normalizeStaffInvitationDelivery({
        email: emailStatus,
        provider: input.provider,
        messageId: input.messageId,
        lastAttemptAt: attemptedAt,
        errorCode: input.errorCode,
      });
      if (["sent", "failed"].includes(emailStatus)) {
        invitation.sendCount = Number(invitation.sendCount || 0) + 1;
      }
      if (emailStatus === "sent") invitation.lastSentAt = attemptedAt;
      invitation.updatedAt = attemptedAt;
      return invitation;
    };
    if (!getPool()) {
      return runRuntimeExclusive(async () => {
        const db = runtimeDb();
        const snapshot = clone(db);
        try {
          const invitation = applyDelivery(
            db.staffInvitations.find((item) => item.id === invitationId),
          );
          const auditLog = createAudit({
            ...(input.audit || {}),
            organizationId,
            action: input.audit?.action || "staff.invitation.delivery",
            resourceType: "staff_invitation",
            resourceId: invitation.id,
            metadata: {
              ...(input.audit?.metadata || {}),
              deliveryEmail: emailStatus,
              provider: invitation.delivery.provider,
              errorCode: invitation.delivery.errorCode,
            },
          });
          db.auditLogs.unshift(auditLog);
          await saveDb();
          return {
            invitation: publicStaffInvitation(invitation, { now: nowIso() }),
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
      const selected = await client.query(
        "SELECT * FROM staff_invitations WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE",
        [invitationId, organizationId],
      );
      const invitation = rowToStaffInvitation(selected.rows[0]);
      if (!invitation) {
        throw repositoryError(404, "STAFF_INVITATION_NOT_FOUND", "Staff invitation was not found");
      }
      const updated = await client.query(
        `
          UPDATE staff_invitations
          SET email_delivery_status = $3, email_provider = $4, email_message_id = $5,
              email_last_attempt_at = $6::timestamptz, email_error_code = $7,
              send_count = send_count + CASE WHEN $3 IN ('sent', 'failed') THEN 1 ELSE 0 END,
              last_sent_at = CASE WHEN $3 = 'sent' THEN $6::timestamptz ELSE last_sent_at END,
              updated_at = $6::timestamptz
          WHERE id = $1 AND organization_id = $2
          RETURNING *
        `,
        [
          invitationId,
          organizationId,
          emailStatus,
          String(input.provider || ""),
          String(input.messageId || ""),
          attemptedAt,
          String(input.errorCode || ""),
        ],
      );
      const canonical = rowToStaffInvitation(updated.rows[0]);
      const auditLog = createAudit({
        ...(input.audit || {}),
        organizationId,
        action: input.audit?.action || "staff.invitation.delivery",
        resourceType: "staff_invitation",
        resourceId: canonical.id,
        metadata: {
          ...(input.audit?.metadata || {}),
          deliveryEmail: emailStatus,
          provider: canonical.delivery.provider,
          errorCode: canonical.delivery.errorCode,
        },
      });
      await insertSqlAudit(client, auditLog);
      return { invitationInternal: canonical, auditLog };
    });
    const db = runtimeDb();
    syncRuntimeItem(db.staffInvitations, result.invitationInternal);
    syncRuntimeItem(db.auditLogs, result.auditLog);
    await saveDb();
    return {
      invitation: publicStaffInvitation(result.invitationInternal, { now: nowIso() }),
      auditLog: result.auditLog,
    };
  }

  async function hydrate() {
    if (!getPool()) {
      return { staffInvitations: runtimeDb().staffInvitations.length };
    }
    const result = await getPool().query(
      "SELECT * FROM staff_invitations ORDER BY created_at DESC, id ASC LIMIT 500",
    );
    const db = runtimeDb();
    db.staffInvitations = result.rows.map(rowToStaffInvitation);
    return { staffInvitations: db.staffInvitations.length };
  }

  return {
    accept,
    create,
    findById,
    hydrate,
    list,
    recordDelivery,
    resend,
    revoke,
  };
}

module.exports = {
  createStaffInvitationRepository,
  repositoryError,
  rowToStaffInvitation,
};
