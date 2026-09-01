const assert = require("node:assert/strict");
const { createRepositories } = require("../src/repositories");

function createDb() {
  return {
    organizations: [
      { id: "org_a", name: "Clinic A", status: "active", workspaceType: "clinic", type: "clinic" },
      { id: "org_b", name: "Clinic B", status: "active", workspaceType: "clinic", type: "clinic" },
      { id: "org_personal", name: "Personal", status: "active", workspaceType: "personal", type: "personal" },
    ],
    users: [
      { id: "actor_admin", role: "admin", accountStatus: "active", organizationId: "org_a" },
      { id: "target_admin", role: "patient", requestedRole: "patient", accountStatus: "active", organizationId: "org_a" },
    ],
    memberships: [
      { id: "membership_old_admin", userId: "target_admin", organizationId: "org_a", role: "workspace_admin" },
    ],
    sessions: [],
    authSessions: [],
    identityOperations: [],
    doctorPatientAccess: [],
    auditLogs: [],
  };
}

function createHarness(db) {
  return createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (() => {
      let sequence = 0;
      return (prefix) => `${prefix}_role_${++sequence}`;
    })(),
    nowIso: () => "2026-07-16T00:00:00.000Z",
  });
}

function transitionInput(organizationId, suffix = "default") {
  return {
    targetUserId: "target_admin",
    actorUserId: "actor_admin",
    organizationId,
    operation: "change_role",
    idempotencyKey: `role-transition-${suffix}`,
    requestFingerprint: `fingerprint-${suffix}`,
    targetState: {
      role: "workspace_admin",
      requestedRole: "workspace_admin",
      roleRequestStatus: "approved",
      organizationId,
      accountStatus: "active",
      hospital: organizationId,
    },
  };
}

function doctorWorkspaceInput(organizationId, suffix = "default") {
  return {
    targetUserId: "target_admin",
    actorUserId: "actor_admin",
    organizationId,
    operation: "doctor_workspace_assign",
    idempotencyKey: `doctor-workspace-${suffix}`,
    requestFingerprint: `doctor-workspace-fingerprint-${suffix}`,
    preserveAccountStatus: true,
    targetState: {
      role: "doctor",
      requestedRole: "doctor",
      roleRequestStatus: "approved",
      organizationId,
      accountStatus: "active",
      hospital: organizationId,
      membershipRole: "doctor",
    },
  };
}

async function main() {
  const inactiveDb = createDb();
  inactiveDb.organizations.find((item) => item.id === "org_b").status = "pending";
  await assert.rejects(
    createHarness(inactiveDb).identityOperations.begin(transitionInput("org_b", "inactive")),
    (error) => error?.code === "WORKSPACE_NOT_ACTIVE",
  );
  assert.equal(inactiveDb.identityOperations.length, 0);
  assert.equal(inactiveDb.users.find((item) => item.id === "target_admin").accountStatus, "active");

  const personalDb = createDb();
  await assert.rejects(
    createHarness(personalDb).identityOperations.begin(transitionInput("org_personal", "personal")),
    (error) => error?.code === "WORKSPACE_NOT_SHARED",
  );
  assert.equal(personalDb.identityOperations.length, 0);

  const db = createDb();
  const repositories = createHarness(db);
  const begun = await repositories.identityOperations.begin(transitionInput("org_b"));
  assert.equal(begun.identityOperation.status, "pending_provider");
  const providerApplied = await repositories.identityOperations.markProviderApplied({
    operationId: begun.identityOperation.id,
    providerStatus: "applied",
    providerResult: { updated: true },
  });
  assert.equal(providerApplied.identityOperation.status, "provider_applied");

  db.organizations.find((item) => item.id === "org_b").status = "rejected";
  await assert.rejects(
    repositories.identityOperations.complete({
      operationId: begun.identityOperation.id,
      providerSucceeded: true,
    }),
    (error) => error?.code === "WORKSPACE_NOT_ACTIVE",
  );
  assert.equal(db.identityOperations[0].status, "provider_applied");
  assert.ok(db.memberships.some((item) => item.id === "membership_old_admin"));
  assert.equal(db.memberships.some((item) => item.organizationId === "org_b" && item.userId === "target_admin"), false);

  db.organizations.find((item) => item.id === "org_b").status = "active";
  const completed = await repositories.identityOperations.complete({
    operationId: begun.identityOperation.id,
    providerSucceeded: true,
  });
  assert.equal(completed.identityOperation.status, "completed");
  assert.equal(completed.user.role, "workspace_admin");
  assert.equal(completed.user.organizationId, "org_b");
  assert.equal(
    db.memberships.some((item) => item.organizationId === "org_a" && item.userId === "target_admin"),
    false,
    "old workspace capability must be revoked atomically",
  );
  assert.equal(
    db.memberships.some(
      (item) => item.organizationId === "org_b" && item.userId === "target_admin" && item.role === "workspace_admin",
    ),
    true,
  );
  assert.equal(
    db.auditLogs.some(
      (item) => item.action === "membership.role.revoke" && item.resourceId === "membership_old_admin",
    ),
    true,
  );

  const doctorDb = createDb();
  const doctorUser = doctorDb.users.find((item) => item.id === "target_admin");
  Object.assign(doctorUser, {
    role: "doctor",
    requestedRole: "doctor",
    roleRequestStatus: "approved",
    organizationId: "org_a",
  });
  doctorDb.organizations.find((item) => item.id === "org_a").ownerUserId = doctorUser.id;
  doctorDb.memberships[0].role = "workspace_owner";
  const doctorRepositories = createHarness(doctorDb);
  const doctorBegun = await doctorRepositories.identityOperations.begin(
    doctorWorkspaceInput("org_b"),
  );
  assert.equal(
    doctorUser.accountStatus,
    "active",
    "workspace reassignment must not put an approved doctor into a transient disabled status",
  );
  await doctorRepositories.identityOperations.markProviderApplied({
    operationId: doctorBegun.identityOperation.id,
    providerStatus: "applied",
    providerResult: { updated: true },
  });
  const doctorCompleted = await doctorRepositories.identityOperations.complete({
    operationId: doctorBegun.identityOperation.id,
    providerSucceeded: true,
  });
  assert.equal(doctorCompleted.user.role, "doctor");
  assert.equal(doctorCompleted.user.organizationId, "org_b");
  assert.equal(
    doctorDb.memberships.find((item) => item.id === "membership_old_admin").role,
    "workspace_owner",
    "the prior workspace owner membership must be preserved",
  );
  assert.equal(
    doctorDb.memberships.some(
      (item) =>
        item.organizationId === "org_b" &&
        item.userId === "target_admin" &&
        item.role === "doctor" &&
        item.status === "active",
    ),
    true,
    "the target workspace must receive an active doctor membership",
  );
  console.log("managed admin role transition smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
