const assert = require("node:assert/strict");
const test = require("node:test");
const { createRepositories } = require("../src/repositories");

function createFixture() {
  const createdAt = "2026-08-27T00:00:00.000Z";
  const db = {
    organizations: [
      { id: "org_alpha", ownerUserId: "owner", status: "active", workspaceType: "clinic" },
      { id: "org_beta", ownerUserId: "other-owner", status: "active", workspaceType: "clinic" },
    ],
    users: [
      { id: "owner", role: "workspace_owner", accountStatus: "active" },
      { id: "staff", role: "patient", accountStatus: "active" },
      { id: "foreign", role: "patient", accountStatus: "active" },
    ],
    memberships: [
      { id: "m-owner", organizationId: "org_alpha", userId: "owner", role: "workspace_owner", status: "active", createdAt, updatedAt: createdAt },
      { id: "m-staff", organizationId: "org_alpha", userId: "staff", role: "doctor", status: "active", createdAt, updatedAt: createdAt },
      { id: "m-foreign", organizationId: "org_beta", userId: "foreign", role: "doctor", status: "active", createdAt, updatedAt: createdAt },
    ],
    auditLogs: [],
    idempotencyKeys: [],
    usersSessions: [],
  };
  let sequence = 0;
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_${++sequence}`,
    nowIso: () => createdAt,
    getPool: () => null,
  });
  return { db, repositories };
}

function intent(key, role) {
  return {
    scope: "workspace:org_alpha",
    operation: "workspace.membership.role_change:staff",
    key,
    fingerprint: JSON.stringify({ action: "change_role", organizationId: "org_alpha", targetUserId: "staff", role }),
  };
}

test("workspace membership role change is tenant-scoped, audited and replay-safe", async () => {
  const { db, repositories } = createFixture();
  const input = {
    organizationId: "org_alpha",
    targetUserId: "staff",
    role: "technician",
    idempotency: intent("role-1", "technician"),
    audit: { actorUserId: "owner", organizationId: "org_alpha", action: "workspace.membership.role_change" },
  };
  const first = await repositories.memberships.changeRole(input);
  assert.equal(first.replayed, false);
  assert.equal(first.membership.role, "technician");
  assert.equal(db.memberships.find((item) => item.id === "m-staff").role, "technician");
  assert.equal(db.auditLogs.at(-1).action, "workspace.membership.role_change");
  const replay = await repositories.memberships.changeRole(input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.membership.role, "technician");
  await assert.rejects(
    repositories.memberships.changeRole({ ...input, role: "admin", idempotency: intent("role-invalid", "admin") }),
    (error) => error.code === "MEMBERSHIP_ROLE_INVALID",
  );
  await assert.rejects(
    repositories.memberships.changeRole({ ...input, targetUserId: "foreign", idempotency: { ...input.idempotency, key: "role-foreign" } }),
    (error) => error.code === "WORKSPACE_MEMBERSHIP_NOT_FOUND",
  );
  await assert.rejects(
    repositories.memberships.changeRole({ ...input, targetUserId: "owner", idempotency: { ...input.idempotency, key: "role-owner" } }),
    (error) => error.code === "WORKSPACE_OWNER_TRANSFER_REQUIRED",
  );
});
