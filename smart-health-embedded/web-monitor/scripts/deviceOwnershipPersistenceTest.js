const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  claimDeviceClaim,
  loadDeviceClaimForUpdate,
  revokeOpenDeviceClaims,
} = require("../src/deviceOwnershipPersistence");

function fakeQueryable(rowsByCall = []) {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql: String(sql), values });
      return { rows: rowsByCall[calls.length - 1] || [], rowCount: (rowsByCall[calls.length - 1] || []).length };
    },
  };
}

test("claim lookup locks the exact device/hash row and maps private lifecycle fields", async () => {
  const queryable = fakeQueryable([
    [
      {
        id: "claim_1",
        device_id: "dev_1",
        organization_id: "org_1",
        claim_code_hash: "hash_1",
        created_by_user_id: "admin_1",
        claimed_by_user_id: null,
        expires_at: "2026-07-18T01:00:00.000Z",
        claimed_at: null,
        revoked_at: null,
        revoked_by_user_id: null,
        created_at: "2026-07-18T00:00:00.000Z",
        updated_at: "2026-07-18T00:00:00.000Z",
      },
    ],
  ]);

  const claim = await loadDeviceClaimForUpdate(queryable, {
    deviceId: "dev_1",
    organizationId: "org_1",
    claimCodeHash: "hash_1",
  });
  assert.equal(claim.id, "claim_1");
  assert.equal(claim.deviceId, "dev_1");
  assert.equal(claim.organizationId, "org_1");
  assert.equal(claim.claimCodeHash, "hash_1");
  assert.match(queryable.calls[0].sql, /device_id\s*=\s*\$1/i);
  assert.match(queryable.calls[0].sql, /claim_code_hash\s*=\s*\$2/i);
  assert.match(queryable.calls[0].sql, /organization_id\s*=\s*\$3/i);
  assert.match(queryable.calls[0].sql, /FOR UPDATE/i);
  assert.deepEqual(queryable.calls[0].values, ["dev_1", "hash_1", "org_1"]);
});

test("provisioning revokes every older open claim before inserting a replacement", async () => {
  const queryable = fakeQueryable([[{ id: "claim_old" }]]);
  const revokedIds = await revokeOpenDeviceClaims(queryable, {
    deviceId: "dev_1",
    actorUserId: "admin_1",
    at: "2026-07-18T00:10:00.000Z",
  });
  assert.deepEqual(revokedIds, ["claim_old"]);
  assert.match(queryable.calls[0].sql, /claimed_at IS NULL/i);
  assert.match(queryable.calls[0].sql, /revoked_at IS NULL/i);
  assert.match(queryable.calls[0].sql, /organization_id = \$4/i);
  assert.match(queryable.calls[0].sql, /RETURNING id/i);
  assert.deepEqual(queryable.calls[0].values, [
    "dev_1",
    "admin_1",
    "2026-07-18T00:10:00.000Z",
    null,
  ]);
});

test("claim consumption is conditional and reports a concurrency conflict", async () => {
  const claimedRow = {
    id: "claim_1",
    device_id: "dev_1",
    organization_id: "org_1",
    claim_code_hash: "hash_1",
    claimed_by_user_id: "user_1",
    claimed_at: "2026-07-18T00:20:00.000Z",
    expires_at: "2026-07-18T01:00:00.000Z",
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:20:00.000Z",
  };
  const success = fakeQueryable([[claimedRow]]);
  const result = await claimDeviceClaim(success, {
    claimId: "claim_1",
    claimedByUserId: "user_1",
    organizationId: "org_1",
    at: "2026-07-18T00:20:00.000Z",
  });
  assert.equal(result.claimedByUserId, "user_1");
  assert.match(success.calls[0].sql, /claimed_at IS NULL/i);
  assert.match(success.calls[0].sql, /revoked_at IS NULL/i);
  assert.match(success.calls[0].sql, /expires_at\s*>\s*\$3::timestamptz/i);
  assert.match(success.calls[0].sql, /organization_id\s*=\s*\$4/i);

  const replay = fakeQueryable([[], [claimedRow]]);
  const replayed = await claimDeviceClaim(replay, {
    claimId: "claim_1",
    claimedByUserId: "user_1",
    organizationId: "org_1",
    at: "2026-07-18T00:21:00.000Z",
  });
  assert.equal(replayed.idempotent, true);
  assert.equal(replayed.claimedByUserId, "user_1");

  const conflict = fakeQueryable([[], []]);
  await assert.rejects(
    () =>
      claimDeviceClaim(conflict, {
        claimId: "claim_1",
        claimedByUserId: "user_1",
        organizationId: "org_1",
        at: "2026-07-18T00:20:00.000Z",
      }),
    (error) => error.code === "DEVICE_CLAIM_CONFLICT" && error.status === 409,
  );
});
