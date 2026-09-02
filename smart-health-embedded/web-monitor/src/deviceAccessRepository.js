const { sanitizeAuditMetadata } = require("./auditLogContract");
const {
  classifyDeviceAccessInvite,
  normalizeDeviceAccessLevel,
  publicDeviceAccessInvite,
} = require("./deviceAccessContract");

function repositoryError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function toIso(value) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

function rowToInvite(row) {
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.device_id,
    organizationId: row.organization_id,
    accessLevel: row.access_level,
    codeHash: row.code_hash,
    createdByUserId: row.created_by_user_id || "",
    idempotencyKey: row.idempotency_key || "",
    requestFingerprint: row.request_fingerprint || "",
    expiresAt: toIso(row.expires_at),
    redeemedAt: toIso(row.redeemed_at),
    redeemedByUserId: row.redeemed_by_user_id || "",
    revokedAt: toIso(row.revoked_at),
    revokedByUserId: row.revoked_by_user_id || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToGrant(row) {
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.device_id,
    organizationId: row.organization_id,
    userId: row.user_id,
    accessLevel: row.access_level,
    sourceInviteId: row.source_invite_id || "",
    status: row.status || "active",
    grantedAt: toIso(row.granted_at),
    revokedAt: toIso(row.revoked_at),
    revokedByUserId: row.revoked_by_user_id || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function publicGrant(grant = {}) {
  return {
    id: String(grant.id || ""),
    deviceId: String(grant.deviceId || ""),
    organizationId: String(grant.organizationId || ""),
    userId: String(grant.userId || ""),
    accessLevel: normalizeDeviceAccessLevel(grant.accessLevel),
    status: grant.status === "revoked" ? "revoked" : "active",
    grantedAt: String(grant.grantedAt || ""),
    revokedAt: grant.revokedAt || null,
  };
}

function createDeviceAccessRepository(options) {
  const getDb = options.getDb;
  const saveDb = options.saveDb;
  const createId = options.createId;
  const nowIso = options.nowIso;
  const getPool = options.getPool || (() => null);
  let runtimeMutationTail = Promise.resolve();

  function runtimeDb() {
    const db = getDb();
    db.deviceAccessInvites = arrayOf(db.deviceAccessInvites);
    db.deviceAccessGrants = arrayOf(db.deviceAccessGrants);
    db.auditLogs = arrayOf(db.auditLogs);
    return db;
  }

  function runRuntimeExclusive(operation) {
    const task = runtimeMutationTail.catch(() => {}).then(operation);
    runtimeMutationTail = task.catch(() => {});
    return task;
  }

  function createAudit(input = {}) {
    return {
      id: createId("audit"),
      actorUserId: String(input.actorUserId || ""),
      organizationId: String(input.organizationId || ""),
      action: String(input.action || "device.access.mutation"),
      resourceType: String(input.resourceType || "device_access"),
      resourceId: String(input.resourceId || ""),
      ip: String(input.ip || ""),
      userAgent: String(input.userAgent || ""),
      metadata: sanitizeAuditMetadata(clone(input.metadata || {})),
      createdAt: nowIso(),
    };
  }

  async function insertSqlAudit(client, audit) {
    await client.query(
      `INSERT INTO audit_logs (
        id, actor_user_id, organization_id, action, resource_type,
        resource_id, ip, user_agent, metadata, created_at
      ) VALUES (
        $1, NULLIF($2, ''), NULLIF($3, ''), $4, $5,
        $6, NULLIF($7, '')::inet, $8, $9::jsonb, $10::timestamptz
      )`,
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

  function syncItem(items, item) {
    if (!item?.id) return;
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) items[index] = { ...items[index], ...clone(item) };
    else items.unshift(clone(item));
  }

  function assertInviteUsable(invite, now = Date.now()) {
    const status = classifyDeviceAccessInvite(invite, now);
    if (status === "active") return;
    const codes = {
      redeemed: [409, "DEVICE_ACCESS_CODE_ALREADY_USED", "Mã truy cập đã được sử dụng"],
      revoked: [410, "DEVICE_ACCESS_CODE_REVOKED", "Mã truy cập đã bị thu hồi"],
      expired: [410, "DEVICE_ACCESS_CODE_EXPIRED", "Mã truy cập đã hết hạn"],
      invalid: [403, "DEVICE_ACCESS_CODE_INVALID", "Mã truy cập không hợp lệ"],
    };
    const [statusCode, code, message] = codes[status] || codes.invalid;
    throw repositoryError(statusCode, code, message);
  }

  function assertDeviceAvailable(device, invite) {
    if (
      !device ||
      String(device.id || "") !== invite.deviceId ||
      String(device.organizationId || device.organization_id || "") !== invite.organizationId ||
      String(device.status || "").toLowerCase() === "revoked" ||
      Boolean(device.revokedAt || device.revoked_at)
    ) {
      throw repositoryError(
        410,
        "DEVICE_ACCESS_DEVICE_UNAVAILABLE",
        "Thiết bị không còn khả dụng",
      );
    }
  }

  async function createInvite(input) {
    const invite = clone(input.invite);
    invite.accessLevel = normalizeDeviceAccessLevel(invite.accessLevel);
    const audit = createAudit(input.audit);
    const sqlResult = await withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `device-access-invite:${invite.codeHash}`,
      ]);
      const existingResult = await client.query(
        `SELECT * FROM device_access_invites
         WHERE code_hash = $1 OR (created_by_user_id = NULLIF($2, '') AND idempotency_key = $3)
         ORDER BY created_at DESC LIMIT 1`,
        [invite.codeHash, invite.createdByUserId, invite.idempotencyKey],
      );
      const existing = rowToInvite(existingResult.rows?.[0]);
      if (existing) {
        const sameIntent =
          existing.deviceId === invite.deviceId &&
          existing.organizationId === invite.organizationId &&
          existing.accessLevel === invite.accessLevel &&
          existing.requestFingerprint === invite.requestFingerprint;
        if (!sameIntent) {
          throw repositoryError(409, "DEVICE_ACCESS_CODE_CONFLICT", "Mã truy cập đã được dùng cho yêu cầu khác");
        }
        return { invite: existing, replayed: true };
      }
      const inserted = await client.query(
        `INSERT INTO device_access_invites (
          id, device_id, organization_id, access_level, code_hash,
          created_by_user_id, idempotency_key, request_fingerprint,
          expires_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7, $8, $9::timestamptz, $10::timestamptz, $10::timestamptz)
        RETURNING *`,
        [
          invite.id,
          invite.deviceId,
          invite.organizationId,
          invite.accessLevel,
          invite.codeHash,
          invite.createdByUserId,
          invite.idempotencyKey,
          invite.requestFingerprint,
          invite.expiresAt,
          invite.createdAt,
        ],
      );
      await insertSqlAudit(client, audit);
      return { invite: rowToInvite(inserted.rows[0]), audit, replayed: false };
    });
    if (sqlResult) {
      const db = runtimeDb();
      syncItem(db.deviceAccessInvites, sqlResult.invite);
      if (sqlResult.audit) syncItem(db.auditLogs, sqlResult.audit);
      return { ...sqlResult, invite: publicDeviceAccessInvite(sqlResult.invite) };
    }
    return runRuntimeExclusive(async () => {
      const db = runtimeDb();
      const existing = db.deviceAccessInvites.find(
        (candidate) =>
          candidate.codeHash === invite.codeHash ||
          (candidate.createdByUserId === invite.createdByUserId &&
            candidate.idempotencyKey === invite.idempotencyKey),
      );
      if (existing) {
        if (
          existing.deviceId !== invite.deviceId ||
          existing.organizationId !== invite.organizationId ||
          existing.accessLevel !== invite.accessLevel ||
          existing.requestFingerprint !== invite.requestFingerprint
        ) {
          throw repositoryError(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key đã được dùng cho yêu cầu khác");
        }
        return { invite: publicDeviceAccessInvite(existing), replayed: true };
      }
      db.deviceAccessInvites.unshift(invite);
      db.auditLogs.unshift(audit);
      await saveDb();
      return { invite: publicDeviceAccessInvite(invite), audit, replayed: false };
    });
  }

  async function listInvites(deviceId) {
    const pool = getPool();
    if (pool) {
      const result = await pool.query(
        "SELECT * FROM device_access_invites WHERE device_id = $1 ORDER BY created_at DESC LIMIT 100",
        [deviceId],
      );
      const mapped = result.rows.map(rowToInvite);
      const db = runtimeDb();
      for (const item of mapped) syncItem(db.deviceAccessInvites, item);
      return mapped.map(publicDeviceAccessInvite);
    }
    return runtimeDb().deviceAccessInvites
      .filter((invite) => invite.deviceId === deviceId)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
      .slice(0, 100)
      .map(publicDeviceAccessInvite);
  }

  async function findInviteByIntent(createdByUserId, idempotencyKey) {
    if (!createdByUserId || !idempotencyKey) return null;
    const pool = getPool();
    if (pool) {
      const result = await pool.query(
        `SELECT * FROM device_access_invites
         WHERE created_by_user_id = $1 AND idempotency_key = $2
         ORDER BY created_at DESC LIMIT 1`,
        [createdByUserId, idempotencyKey],
      );
      const invite = rowToInvite(result.rows?.[0]);
      if (invite) syncItem(runtimeDb().deviceAccessInvites, invite);
      return invite;
    }
    return runtimeDb().deviceAccessInvites.find(
      (invite) => invite.createdByUserId === createdByUserId && invite.idempotencyKey === idempotencyKey,
    ) || null;
  }

  async function listGrants(deviceId) {
    const pool = getPool();
    if (pool) {
      const result = await pool.query(
        "SELECT * FROM device_access_grants WHERE device_id = $1 ORDER BY updated_at DESC LIMIT 100",
        [deviceId],
      );
      const mapped = result.rows.map(rowToGrant);
      const db = runtimeDb();
      for (const item of mapped) syncItem(db.deviceAccessGrants, item);
      return mapped.map(publicGrant);
    }
    return runtimeDb().deviceAccessGrants
      .filter((grant) => grant.deviceId === deviceId)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .slice(0, 100)
      .map(publicGrant);
  }

  async function redeem(input) {
    const now = input.at || nowIso();
    const auditFactory = (grant, invite) => createAudit({
      ...input.audit,
      resourceId: grant.id,
      organizationId: invite.organizationId,
      metadata: {
        ...(input.audit?.metadata || {}),
        deviceId: invite.deviceId,
        accessLevel: grant.accessLevel,
        inviteId: invite.id,
      },
    });
    const allowedOrganizations = new Set(arrayOf(input.allowedOrganizationIds).filter(Boolean));
    const sqlResult = await withSqlTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `device-access-redeem:${input.codeHash}`,
      ]);
      const inviteResult = await client.query(
        "SELECT * FROM device_access_invites WHERE code_hash = $1 LIMIT 1 FOR UPDATE",
        [input.codeHash],
      );
      const invite = rowToInvite(inviteResult.rows?.[0]);
      if (!invite) throw repositoryError(403, "DEVICE_ACCESS_CODE_INVALID", "Mã truy cập không hợp lệ");
      if (!allowedOrganizations.has(invite.organizationId)) {
        throw repositoryError(403, "DEVICE_ACCESS_WORKSPACE_FORBIDDEN", "Tài khoản không thuộc workspace của thiết bị");
      }
      const deviceResult = await client.query(
        "SELECT id, organization_id, status, revoked_at FROM devices WHERE id = $1 LIMIT 1 FOR SHARE",
        [invite.deviceId],
      );
      assertDeviceAvailable(deviceResult.rows?.[0], invite);
      if (invite.redeemedAt && invite.redeemedByUserId === input.userId) {
        const replayGrant = await client.query(
          "SELECT * FROM device_access_grants WHERE device_id = $1 AND user_id = $2 LIMIT 1",
          [invite.deviceId, input.userId],
        );
        const grant = rowToGrant(replayGrant.rows?.[0]);
        if (grant?.status === "active") return { invite, grant, replayed: true };
      }
      assertInviteUsable(invite, Date.parse(now));
      const existingGrantResult = await client.query(
        "SELECT * FROM device_access_grants WHERE device_id = $1 AND user_id = $2 LIMIT 1 FOR UPDATE",
        [invite.deviceId, input.userId],
      );
      const existingGrant = rowToGrant(existingGrantResult.rows?.[0]);
      const nextAccessLevel =
        existingGrant?.status === "active" && existingGrant.accessLevel === "manager"
          ? "manager"
          : invite.accessLevel;
      const grantId = existingGrant?.id || createId("dag");
      const grantResult = await client.query(
        `INSERT INTO device_access_grants (
          id, device_id, organization_id, user_id, access_level, source_invite_id,
          status, granted_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::timestamptz, $7::timestamptz, $7::timestamptz)
        ON CONFLICT (device_id, user_id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          access_level = EXCLUDED.access_level,
          source_invite_id = EXCLUDED.source_invite_id,
          status = 'active', revoked_at = NULL, revoked_by_user_id = NULL,
          granted_at = EXCLUDED.granted_at, updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [grantId, invite.deviceId, invite.organizationId, input.userId, nextAccessLevel, invite.id, now],
      );
      const grant = rowToGrant(grantResult.rows[0]);
      const consumedResult = await client.query(
        `UPDATE device_access_invites SET
          redeemed_at = $2::timestamptz, redeemed_by_user_id = $3, updated_at = $2::timestamptz
        WHERE id = $1 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > $2::timestamptz
        RETURNING *`,
        [invite.id, now, input.userId],
      );
      const consumed = rowToInvite(consumedResult.rows?.[0]);
      if (!consumed) throw repositoryError(409, "DEVICE_ACCESS_CODE_CONFLICT", "Mã truy cập đã thay đổi trước khi xác nhận");
      const audit = auditFactory(grant, consumed);
      await insertSqlAudit(client, audit);
      return { invite: consumed, grant, audit, replayed: false };
    });
    if (sqlResult) {
      const db = runtimeDb();
      syncItem(db.deviceAccessInvites, sqlResult.invite);
      syncItem(db.deviceAccessGrants, sqlResult.grant);
      if (sqlResult.audit) syncItem(db.auditLogs, sqlResult.audit);
      return {
        invite: publicDeviceAccessInvite(sqlResult.invite),
        grant: publicGrant(sqlResult.grant),
        replayed: sqlResult.replayed,
      };
    }
    return runRuntimeExclusive(async () => {
      const db = runtimeDb();
      const invite = db.deviceAccessInvites.find((candidate) => candidate.codeHash === input.codeHash);
      if (!invite) throw repositoryError(403, "DEVICE_ACCESS_CODE_INVALID", "Mã truy cập không hợp lệ");
      if (!allowedOrganizations.has(invite.organizationId)) {
        throw repositoryError(403, "DEVICE_ACCESS_WORKSPACE_FORBIDDEN", "Tài khoản không thuộc workspace của thiết bị");
      }
      assertDeviceAvailable(
        arrayOf(db.devices).find((device) => device.id === invite.deviceId),
        invite,
      );
      let grant = db.deviceAccessGrants.find(
        (candidate) => candidate.deviceId === invite.deviceId && candidate.userId === input.userId,
      );
      if (invite.redeemedAt && invite.redeemedByUserId === input.userId && grant?.status === "active") {
        return { invite: publicDeviceAccessInvite(invite), grant: publicGrant(grant), replayed: true };
      }
      assertInviteUsable(invite, Date.parse(now));
      const accessLevel =
        grant?.status === "active" && grant.accessLevel === "manager"
          ? "manager"
          : invite.accessLevel;
      grant = {
        ...(grant || {}),
        id: grant?.id || createId("dag"),
        deviceId: invite.deviceId,
        organizationId: invite.organizationId,
        userId: input.userId,
        accessLevel,
        sourceInviteId: invite.id,
        status: "active",
        grantedAt: now,
        revokedAt: "",
        revokedByUserId: "",
        createdAt: grant?.createdAt || now,
        updatedAt: now,
      };
      invite.redeemedAt = now;
      invite.redeemedByUserId = input.userId;
      invite.updatedAt = now;
      syncItem(db.deviceAccessGrants, grant);
      const audit = auditFactory(grant, invite);
      db.auditLogs.unshift(audit);
      await saveDb();
      return { invite: publicDeviceAccessInvite(invite), grant: publicGrant(grant), replayed: false };
    });
  }

  async function revokeInvite(input) {
    const now = input.at || nowIso();
    const pool = getPool();
    if (pool) {
      const result = await withSqlTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE device_access_invites SET revoked_at = $3::timestamptz,
            revoked_by_user_id = NULLIF($4, ''), updated_at = $3::timestamptz
          WHERE id = $1 AND device_id = $2 AND redeemed_at IS NULL AND revoked_at IS NULL
          RETURNING *`,
          [input.inviteId, input.deviceId, now, input.actorUserId],
        );
        const invite = rowToInvite(updated.rows?.[0]);
        if (!invite) throw repositoryError(409, "DEVICE_ACCESS_INVITE_NOT_ACTIVE", "Mã không còn ở trạng thái có thể thu hồi");
        const audit = createAudit(input.audit);
        await insertSqlAudit(client, audit);
        return { invite, audit };
      });
      const db = runtimeDb();
      syncItem(db.deviceAccessInvites, result.invite);
      syncItem(db.auditLogs, result.audit);
      return publicDeviceAccessInvite(result.invite);
    }
    return runRuntimeExclusive(async () => {
      const db = runtimeDb();
      const invite = db.deviceAccessInvites.find(
        (candidate) => candidate.id === input.inviteId && candidate.deviceId === input.deviceId,
      );
      if (!invite || classifyDeviceAccessInvite(invite) !== "active") {
        throw repositoryError(409, "DEVICE_ACCESS_INVITE_NOT_ACTIVE", "Mã không còn ở trạng thái có thể thu hồi");
      }
      invite.revokedAt = now;
      invite.revokedByUserId = input.actorUserId;
      invite.updatedAt = now;
      db.auditLogs.unshift(createAudit(input.audit));
      await saveDb();
      return publicDeviceAccessInvite(invite);
    });
  }

  async function revokeGrant(input) {
    const now = input.at || nowIso();
    const pool = getPool();
    if (pool) {
      const result = await withSqlTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE device_access_grants SET status = 'revoked', revoked_at = $3::timestamptz,
            revoked_by_user_id = NULLIF($4, ''), updated_at = $3::timestamptz
          WHERE id = $1 AND device_id = $2 AND status = 'active'
          RETURNING *`,
          [input.grantId, input.deviceId, now, input.actorUserId],
        );
        const grant = rowToGrant(updated.rows?.[0]);
        if (!grant) {
          throw repositoryError(
            409,
            "DEVICE_ACCESS_GRANT_NOT_ACTIVE",
            "Quyền truy cập không còn ở trạng thái có thể thu hồi",
          );
        }
        const audit = createAudit(input.audit);
        await insertSqlAudit(client, audit);
        return { grant, audit };
      });
      const db = runtimeDb();
      syncItem(db.deviceAccessGrants, result.grant);
      syncItem(db.auditLogs, result.audit);
      return publicGrant(result.grant);
    }
    return runRuntimeExclusive(async () => {
      const db = runtimeDb();
      const grant = db.deviceAccessGrants.find(
        (candidate) => candidate.id === input.grantId && candidate.deviceId === input.deviceId,
      );
      if (!grant || grant.status !== "active") {
        throw repositoryError(
          409,
          "DEVICE_ACCESS_GRANT_NOT_ACTIVE",
          "Quyền truy cập không còn ở trạng thái có thể thu hồi",
        );
      }
      grant.status = "revoked";
      grant.revokedAt = now;
      grant.revokedByUserId = input.actorUserId;
      grant.updatedAt = now;
      db.auditLogs.unshift(createAudit(input.audit));
      await saveDb();
      return publicGrant(grant);
    });
  }

  function findActiveGrant(userId, deviceId) {
    return runtimeDb().deviceAccessGrants.find(
      (grant) => grant.userId === userId && grant.deviceId === deviceId && grant.status === "active",
    ) || null;
  }

  async function hydrate() {
    const pool = getPool();
    if (!pool) return { deviceAccessInvites: runtimeDb().deviceAccessInvites.length, deviceAccessGrants: runtimeDb().deviceAccessGrants.length };
    const [invitesResult, grantsResult] = await Promise.all([
      pool.query("SELECT * FROM device_access_invites ORDER BY created_at DESC LIMIT 1000"),
      pool.query("SELECT * FROM device_access_grants ORDER BY updated_at DESC LIMIT 2000"),
    ]);
    const db = runtimeDb();
    db.deviceAccessInvites = invitesResult.rows.map(rowToInvite);
    db.deviceAccessGrants = grantsResult.rows.map(rowToGrant);
    return { deviceAccessInvites: db.deviceAccessInvites.length, deviceAccessGrants: db.deviceAccessGrants.length };
  }

  return {
    createInvite,
    findInviteByIntent,
    findActiveGrant,
    hydrate,
    listGrants,
    listInvites,
    redeem,
    revokeGrant,
    revokeInvite,
  };
}

module.exports = {
  createDeviceAccessRepository,
  publicGrant,
  rowToGrant,
  rowToInvite,
};
