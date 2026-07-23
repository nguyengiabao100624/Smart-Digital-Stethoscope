const { DeviceOwnershipError } = require("./deviceOwnershipLifecycle");

function requireQueryable(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("A SQL queryable is required");
  }
  return queryable;
}

function cleanId(value, maximum = 512) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function mapDeviceClaimRow(row) {
  if (!row) return null;
  return {
    id: cleanId(row.id, 160),
    deviceId: cleanId(row.device_id, 160),
    organizationId: cleanId(row.organization_id, 160),
    claimCodeHash: cleanId(row.claim_code_hash),
    createdByUserId: cleanId(row.created_by_user_id, 160),
    claimedByUserId: cleanId(row.claimed_by_user_id, 160),
    expiresAt: toIso(row.expires_at),
    claimedAt: toIso(row.claimed_at),
    revokedAt: toIso(row.revoked_at),
    revokedByUserId: cleanId(row.revoked_by_user_id, 160),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function loadDeviceClaimForUpdate(queryable, input = {}) {
  const client = requireQueryable(queryable);
  const deviceId = cleanId(input.deviceId, 160);
  const claimCodeHash = cleanId(input.claimCodeHash);
  const organizationId = cleanId(input.organizationId, 160);
  if (!deviceId || !claimCodeHash || !organizationId) return null;
  const result = await client.query(
    `
      SELECT *
      FROM device_claims
      WHERE device_id = $1
        AND claim_code_hash = $2
        AND organization_id = $3
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `,
    [deviceId, claimCodeHash, organizationId],
  );
  return mapDeviceClaimRow(result.rows?.[0]);
}

async function revokeOpenDeviceClaims(queryable, input = {}) {
  const client = requireQueryable(queryable);
  const deviceId = cleanId(input.deviceId, 160);
  if (!deviceId) {
    throw new TypeError("deviceId is required to revoke open device claims");
  }
  const actorUserId = cleanId(input.actorUserId, 160) || null;
  const organizationId = cleanId(input.organizationId, 160) || null;
  const at = cleanId(input.at, 40) || new Date().toISOString();
  const result = await client.query(
    `
      UPDATE device_claims
      SET revoked_at = $3::timestamptz,
          revoked_by_user_id = $2,
          updated_at = $3::timestamptz
      WHERE device_id = $1
        AND claimed_at IS NULL
        AND revoked_at IS NULL
        AND ($4::text IS NULL OR organization_id = $4)
      RETURNING id
    `,
    [deviceId, actorUserId, at, organizationId],
  );
  return (result.rows || []).map((row) => cleanId(row.id, 160)).filter(Boolean);
}

async function claimDeviceClaim(queryable, input = {}) {
  const client = requireQueryable(queryable);
  const claimId = cleanId(input.claimId, 160);
  const claimedByUserId = cleanId(input.claimedByUserId, 160);
  const organizationId = cleanId(input.organizationId, 160);
  const at = cleanId(input.at, 40) || new Date().toISOString();
  if (!claimId || !claimedByUserId || !organizationId) {
    throw new TypeError(
      "claimId, claimedByUserId and organizationId are required to consume a device claim",
    );
  }
  const result = await client.query(
    `
      UPDATE device_claims
      SET claimed_by_user_id = $2,
          claimed_at = $3::timestamptz,
          updated_at = $3::timestamptz
      WHERE id = $1
        AND organization_id = $4
        AND claimed_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > $3::timestamptz
      RETURNING *
    `,
    [claimId, claimedByUserId, at, organizationId],
  );
  const claimed = mapDeviceClaimRow(result.rows?.[0]);
  if (claimed) return claimed;

  const replayResult = await client.query(
    `
      SELECT *
      FROM device_claims
      WHERE id = $1
        AND organization_id = $2
      LIMIT 1
      FOR UPDATE
    `,
    [claimId, organizationId],
  );
  const replay = mapDeviceClaimRow(replayResult.rows?.[0]);
  if (
    replay &&
    replay.claimedAt &&
    !replay.revokedAt &&
    replay.claimedByUserId === claimedByUserId
  ) {
    return { ...replay, idempotent: true };
  }
  throw new DeviceOwnershipError(
    "DEVICE_CLAIM_CONFLICT",
    "The device claim changed before it could be consumed",
    409,
  );
}

module.exports = {
  claimDeviceClaim,
  loadDeviceClaimForUpdate,
  mapDeviceClaimRow,
  revokeOpenDeviceClaims,
};
