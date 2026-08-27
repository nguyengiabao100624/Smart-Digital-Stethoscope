const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const {
  DeviceOwnershipError,
  applyDeviceOwnershipRelease,
  applyDeviceOwnershipTransfer,
  applyDeviceOwnershipTransition,
  classifyDeviceClaim,
  inferDeviceOwnershipState,
  validateActiveDeviceClaim,
} = require("../src/deviceOwnershipLifecycle");

test("ownership state inference keeps legacy device rows compatible", () => {
  assert.equal(inferDeviceOwnershipState({ status: "unclaimed" }), "provisioned");
  assert.equal(inferDeviceOwnershipState({ pairedUserId: "user_1" }), "claimed");
  assert.equal(
    inferDeviceOwnershipState({ pairedUserId: "user_1", assignedPatientId: "patient_1" }),
    "assigned",
  );
  assert.equal(inferDeviceOwnershipState({ ownershipState: "unassigned" }), "unassigned");
  assert.equal(inferDeviceOwnershipState({ revokedAt: "2026-07-18T00:00:00.000Z" }), "revoked");
  assert.equal(
    inferDeviceOwnershipState({
      ownershipState: "provisioned",
      revokedAt: "2026-07-18T00:00:00.000Z",
    }),
    "revoked",
  );
});

test("migration 028 keeps ownership separate and enforces one active claim", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "028_device_ownership_claim_lifecycle.sql"),
    "utf8",
  );
  assert.match(migration, /ownership_state/);
  assert.match(migration, /owner_user_id/);
  assert.match(migration, /assigned_patient_id/);
  assert.match(migration, /claims\.organization_id IS NULL/);
  assert.match(migration, /devices\.organization_id IS NOT NULL/);
  assert.match(migration, /device_claims_one_active_per_device_idx/);
  assert.match(migration, /claimed_at IS NULL AND revoked_at IS NULL/);
  assert.match(migration, /expires_at <= now\(\)/);
  assert.match(migration, /expires_at > now\(\)/);
  assert.doesNotMatch(migration, /connected\s*=\s*true/i);
});

test("ownership state machine accepts only canonical lifecycle transitions", () => {
  const claimed = applyDeviceOwnershipTransition(
    { id: "dev_1", status: "unclaimed", connected: false },
    "claimed",
    { ownerUserId: "user_1", at: "2026-07-18T00:00:00.000Z" },
  );
  assert.equal(claimed.ownershipState, "claimed");
  assert.equal(claimed.ownerUserId, "user_1");
  assert.equal(claimed.pairedUserId, "user_1");

  const assigned = applyDeviceOwnershipTransition(claimed, "assigned", {
    assignedPatientId: "patient_1",
    at: "2026-07-18T00:01:00.000Z",
  });
  assert.equal(assigned.ownershipState, "assigned");
  assert.equal(assigned.assignedPatientId, "patient_1");

  const unassigned = applyDeviceOwnershipTransition(assigned, "unassigned", {
    at: "2026-07-18T00:02:00.000Z",
  });
  assert.equal(unassigned.ownershipState, "unassigned");
  assert.equal(unassigned.assignedPatientId, null);

  const revoked = applyDeviceOwnershipTransition(unassigned, "revoked", {
    actorUserId: "admin_1",
    at: "2026-07-18T00:03:00.000Z",
  });
  assert.equal(revoked.ownershipState, "revoked");
  assert.equal(revoked.revokedByUserId, "admin_1");
  assert.equal(revoked.connected, false);

  const replayedRevoke = applyDeviceOwnershipTransition(revoked, "revoked", {
    actorUserId: "admin_other",
    at: "2026-07-18T01:00:00.000Z",
  });
  assert.equal(replayedRevoke.revokedAt, revoked.revokedAt);
  assert.equal(replayedRevoke.revokedByUserId, revoked.revokedByUserId);

  assert.throws(
    () =>
      applyDeviceOwnershipTransition(
        { id: "dev_2", status: "unclaimed" },
        "assigned",
        { ownerUserId: "user_1", assignedPatientId: "patient_1" },
      ),
    (error) =>
      error instanceof DeviceOwnershipError &&
      error.code === "DEVICE_OWNERSHIP_TRANSITION_INVALID",
  );
  assert.throws(
    () => applyDeviceOwnershipTransition(revoked, "unassigned"),
    (error) =>
      error instanceof DeviceOwnershipError &&
      error.code === "DEVICE_OWNERSHIP_TRANSITION_INVALID",
  );
  assert.throws(
    () =>
      applyDeviceOwnershipTransition(claimed, "claimed", {
        ownerUserId: "user_other",
      }),
    (error) =>
      error instanceof DeviceOwnershipError &&
      error.code === "DEVICE_OWNER_CHANGE_REQUIRES_TRANSFER",
  );
  assert.throws(
    () =>
      applyDeviceOwnershipTransition(assigned, "assigned", {
        assignedPatientId: "patient_other",
      }),
    (error) =>
      error instanceof DeviceOwnershipError &&
      error.code === "DEVICE_ASSIGNMENT_TRANSITION_REQUIRED",
  );
});

test("account release clears authority without deleting device history identity", () => {
  const released = applyDeviceOwnershipRelease(
    {
      id: "dev_release",
      organizationId: "org_1",
      ownershipState: "assigned",
      ownerUserId: "user_1",
      pairedUserId: "user_1",
      assignedPatientId: "patient_1",
      connected: true,
      status: "connected",
      historyMarker: "retained",
    },
    { at: "2026-07-18T00:04:00.000Z" },
  );
  assert.equal(released.id, "dev_release");
  assert.equal(released.organizationId, "org_1");
  assert.equal(released.ownershipState, "provisioned");
  assert.equal(released.ownerUserId, null);
  assert.equal(released.pairedUserId, null);
  assert.equal(released.assignedPatientId, null);
  assert.equal(released.connected, false);
  assert.equal(released.status, "available");
  assert.equal(released.historyMarker, "retained");
  assert.throws(
    () => applyDeviceOwnershipRelease(released),
    (error) => error instanceof DeviceOwnershipError && error.code === "DEVICE_ALREADY_RELEASED",
  );
});

test("audited transfer preserves lifecycle invariants across workspaces and owners", () => {
  const transferred = applyDeviceOwnershipTransfer(
    {
      id: "dev_transfer",
      organizationId: "org_old",
      ownershipState: "unassigned",
      ownerUserId: "owner_old",
      pairedUserId: "owner_old",
    },
    {
      organizationId: "org_new",
      ownerUserId: "owner_new",
      at: "2026-07-18T02:00:00.000Z",
    },
  );
  assert.equal(transferred.organizationId, "org_new");
  assert.equal(transferred.ownerUserId, "owner_new");
  assert.equal(transferred.pairedUserId, "owner_new");
  assert.equal(transferred.ownershipState, "unassigned");

  const provisioned = applyDeviceOwnershipTransfer(
    {
      id: "dev_provisioned",
      organizationId: "org_old",
      ownershipState: "provisioned",
    },
    {
      organizationId: "org_new",
      ownerUserId: "owner_new",
    },
  );
  assert.equal(provisioned.ownershipState, "claimed");
  assert.equal(provisioned.ownerUserId, "owner_new");

  assert.throws(
    () =>
      applyDeviceOwnershipTransfer(
        {
          id: "dev_assigned",
          organizationId: "org_old",
          ownershipState: "assigned",
          ownerUserId: "owner_old",
          assignedPatientId: "patient_old",
        },
        { organizationId: "org_new", ownerUserId: "owner_new" },
      ),
    (error) =>
      error instanceof DeviceOwnershipError &&
      error.code === "DEVICE_UNASSIGN_BEFORE_TRANSFER",
  );
  assert.throws(
    () =>
      applyDeviceOwnershipTransfer(
        {
          id: "dev_claimed",
          organizationId: "org_old",
          ownershipState: "claimed",
          ownerUserId: "owner_old",
        },
        { organizationId: "org_new" },
      ),
    (error) =>
      error instanceof DeviceOwnershipError &&
      error.code === "DEVICE_TRANSFER_OWNER_REQUIRED",
  );
  assert.throws(
    () =>
      applyDeviceOwnershipTransfer(
        {
          id: "dev_revoked",
          organizationId: "org_old",
          ownershipState: "revoked",
          revokedAt: "2026-07-18T00:00:00.000Z",
        },
        { organizationId: "org_new", ownerUserId: "owner_new" },
      ),
    (error) =>
      error instanceof DeviceOwnershipError &&
      error.code === "DEVICE_REVOKED_TRANSFER_FORBIDDEN",
  );
});

test("claim classification and validation are tenant scoped and fail closed", () => {
  const activeClaim = {
    id: "claim_1",
    deviceId: "dev_1",
    organizationId: "org_1",
    claimCodeHash: "hash_1",
    expiresAt: "2026-07-18T01:00:00.000Z",
    claimedAt: null,
    revokedAt: null,
  };
  const now = Date.parse("2026-07-18T00:30:00.000Z");
  assert.equal(classifyDeviceClaim(activeClaim, now), "active");
  assert.equal(
    validateActiveDeviceClaim(activeClaim, {
      deviceId: "dev_1",
      organizationId: "org_1",
      claimCodeHash: "hash_1",
      now,
    }).id,
    "claim_1",
  );

  for (const [claim, expectedCode] of [
    [{ ...activeClaim, claimedAt: "2026-07-18T00:20:00.000Z" }, "DEVICE_CLAIM_ALREADY_USED"],
    [{ ...activeClaim, revokedAt: "2026-07-18T00:20:00.000Z" }, "DEVICE_CLAIM_REVOKED"],
    [{ ...activeClaim, expiresAt: "2026-07-18T00:29:59.000Z" }, "DEVICE_CLAIM_EXPIRED"],
  ]) {
    assert.throws(
      () =>
        validateActiveDeviceClaim(claim, {
          deviceId: "dev_1",
          organizationId: "org_1",
          claimCodeHash: "hash_1",
          now,
        }),
      (error) => error instanceof DeviceOwnershipError && error.code === expectedCode,
    );
  }

  assert.throws(
    () =>
      validateActiveDeviceClaim(activeClaim, {
        deviceId: "dev_1",
        organizationId: "org_other",
        claimCodeHash: "hash_1",
        now,
      }),
    (error) =>
      error instanceof DeviceOwnershipError &&
      error.code === "DEVICE_CLAIM_WORKSPACE_MISMATCH",
  );
  assert.throws(
    () =>
      validateActiveDeviceClaim(
        { ...activeClaim, organizationId: "" },
        {
          deviceId: "dev_1",
          organizationId: "org_1",
          claimCodeHash: "hash_1",
          now,
        },
      ),
    (error) =>
      error instanceof DeviceOwnershipError &&
      error.code === "DEVICE_CLAIM_WORKSPACE_UNBOUND",
  );
  assert.throws(
    () =>
      validateActiveDeviceClaim(activeClaim, {
        deviceId: "dev_1",
        organizationId: "org_1",
        claimCodeHash: "wrong_hash",
        now,
      }),
    (error) =>
      error instanceof DeviceOwnershipError && error.code === "DEVICE_CLAIM_INVALID",
  );
  assert.throws(
    () =>
      validateActiveDeviceClaim(activeClaim, {
        deviceId: "dev_1",
        organizationId: "org_1",
        claimCodeHash: "hash_1",
        now: Number.NaN,
      }),
    (error) =>
      error instanceof DeviceOwnershipError && error.code === "DEVICE_CLAIM_INVALID",
  );
});
