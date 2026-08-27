const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRepositories } = require("../src/repositories");

const rootDir = path.join(__dirname, "..");

function baseDb() {
  return {
    organizations: [{
      id: "org_managed_admin",
      name: "Managed Admin Clinic",
      status: "active",
      workspaceType: "clinic",
      type: "clinic",
    }],
    users: [],
    memberships: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
}

function candidate(overrides = {}) {
  return {
    id: "usr_managed_admin",
    firebaseUid: "firebase_managed_admin",
    email: "managed-admin@smarthealth.test",
    phone: "0900000000",
    role: "workspace_admin",
    requestedRole: "workspace_admin",
    roleRequestStatus: "approved",
    accountStatus: "active",
    name: "Managed Admin",
    title: "Workspace administrator",
    organizationId: "org_managed_admin",
    hospital: "Managed Admin Clinic",
    verifiedEmail: true,
    verifiedPhone: true,
    roleRequestedAt: "2026-07-16T00:00:00.000Z",
    roleApprovedAt: "2026-07-16T00:00:00.000Z",
    firebaseClaims: { role: "workspace_admin", organizationId: "org_managed_admin" },
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function idempotency(fingerprint = "managed-admin-fingerprint") {
  return {
    scope: "actor_admin:org_managed_admin",
    operation: "admin.user.create",
    key: "managed-admin-create-key",
    fingerprint,
  };
}

function auditInput() {
  return {
    actorUserId: "actor_admin",
    organizationId: "org_managed_admin",
    action: "admin.user.create",
    resourceType: "user",
    resourceId: "usr_managed_admin",
    metadata: { email: "managed-admin@smarthealth.test" },
  };
}

async function testJsonReservationAndAtomicCommit() {
  const db = baseDb();
  let failNextSave = false;
  let saveCount = 0;
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      saveCount += 1;
      if (failNextSave) {
        failNextSave = false;
        throw new Error("simulated JSON persistence failure");
      }
    },
    createId: (() => {
      let sequence = 0;
      return (prefix) => `${prefix}_${++sequence}`;
    })(),
    nowIso: () => "2026-07-16T00:00:00.000Z",
  });

  const pendingCandidate = candidate({ firebaseUid: "" });
  const first = await repositories.users.beginManagedAdminCreate({
    user: pendingCandidate,
    idempotency: idempotency(),
  });
  assert.equal(first.replayed, false);
  assert.equal(first.reservation.state, "provider_pending");
  assert.equal(db.users.length, 0, "reservation must not grant a backend account");
  assert.equal(db.memberships.length, 0, "reservation must not grant workspace capability");
  assert.equal(db.auditLogs.length, 0, "creation audit belongs to the atomic commit");
  assert.equal(db.idempotencyKeys[0].responseStatus, 202);

  const replay = await repositories.users.beginManagedAdminCreate({
    user: { ...pendingCandidate, id: "usr_retry_must_not_replace_reservation" },
    idempotency: idempotency(),
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.reservation.userId, first.reservation.userId);
  assert.equal(replay.reservation.operationId, first.reservation.operationId);

  const committed = await repositories.users.createManagedAdminWithAudit({
    user: candidate({ id: first.reservation.userId }),
    idempotency: idempotency(),
    auditInput: auditInput(),
  });
  assert.equal(committed.replayed, false);
  assert.equal(committed.reservation.state, "activation_pending");
  assert.equal(committed.reservation.providerActivationStatus, "pending");
  assert.equal(db.users.length, 1);
  assert.equal(db.users[0].accountStatus, "provisioning_pending");
  assert.equal(db.memberships.length, 1);
  assert.equal(db.memberships[0].role, "workspace_admin");
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.auditLogs[0].action, "admin.user.create");
  assert.equal(db.idempotencyKeys[0].responseStatus, 202);
  assert.equal(db.identityOperations.length, 1);
  assert.equal(db.identityOperations[0].operation, "managed_admin_activate");
  assert.equal(db.identityOperations[0].status, "pending_provider");
  await assert.rejects(
    repositories.identityOperations.begin({
      targetUserId: committed.user.id,
      actorUserId: "actor_admin",
      organizationId: "org_managed_admin",
      operation: "lock",
      idempotencyKey: "lock-during-managed-admin-activation",
      requestFingerprint: "lock-during-managed-admin-activation",
    }),
    (error) => error?.code === "IDENTITY_OPERATION_IN_PROGRESS",
  );
  assert.equal(db.users[0].accountStatus, "provisioning_pending");

  const committedReplay = await repositories.users.createManagedAdminWithAudit({
    user: candidate({ id: first.reservation.userId }),
    idempotency: idempotency(),
    auditInput: auditInput(),
  });
  assert.equal(committedReplay.replayed, true);
  assert.equal(db.users.length, 1);
  assert.equal(db.memberships.length, 1);
  assert.equal(db.auditLogs.length, 1, "idempotent replay must not duplicate audit");

  const activated = await repositories.users.confirmManagedAdminProviderActivation({
    idempotency: idempotency(),
    userId: committed.reservation.userId,
    firebaseUid: committed.reservation.firebaseUid,
    operationId: committed.reservation.activationOperationId,
  });
  assert.equal(activated.replayed, false);
  assert.equal(activated.reservation.state, "completed");
  assert.equal(activated.reservation.providerActivationStatus, "confirmed");
  assert.equal(activated.user.accountStatus, "active");
  assert.equal(db.identityOperations[0].status, "completed");
  assert.equal(db.idempotencyKeys[0].responseStatus, 201);
  assert.equal(db.auditLogs.length, 2);
  assert.ok(db.auditLogs.some((entry) => entry.action === "identity.managed_admin_activate.completed"));

  const activationReplay = await repositories.users.confirmManagedAdminProviderActivation({
    idempotency: idempotency(),
    userId: committed.reservation.userId,
    firebaseUid: committed.reservation.firebaseUid,
    operationId: committed.reservation.activationOperationId,
  });
  assert.equal(activationReplay.replayed, true);
  assert.equal(db.auditLogs.length, 2, "activation replay must not duplicate audit");

  await assert.rejects(
    repositories.users.beginManagedAdminCreate({
      user: pendingCandidate,
      idempotency: idempotency("different-payload"),
    }),
    (error) => error?.code === "IDEMPOTENCY_KEY_REUSED",
  );

  const rollbackDb = baseDb();
  let rollbackFailNextSave = false;
  const rollbackRepositories = createRepositories({
    getDb: () => rollbackDb,
    saveDb: async () => {
      if (rollbackFailNextSave) {
        rollbackFailNextSave = false;
        throw new Error("simulated JSON persistence failure");
      }
    },
    createId: (() => {
      let sequence = 0;
      return (prefix) => `${prefix}_rollback_${++sequence}`;
    })(),
    nowIso: () => "2026-07-16T00:00:00.000Z",
  });
  const rollbackBegin = await rollbackRepositories.users.beginManagedAdminCreate({
    user: pendingCandidate,
    idempotency: idempotency(),
  });
  rollbackFailNextSave = true;
  await assert.rejects(
    rollbackRepositories.users.createManagedAdminWithAudit({
      user: candidate({ id: rollbackBegin.reservation.userId }),
      idempotency: idempotency(),
      auditInput: auditInput(),
    }),
    /simulated JSON persistence failure/,
  );
  assert.equal(rollbackDb.users.length, 0);
  assert.equal(rollbackDb.memberships.length, 0);
  assert.equal(rollbackDb.auditLogs.length, 0);
  assert.equal(rollbackDb.idempotencyKeys[0].responseResource.state, "provider_pending");
  assert.ok(saveCount >= 2);
}

async function testJsonWorkspaceLifecycleGuards() {
  const createHarness = (db) => createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (() => {
      let sequence = 0;
      return (prefix) => `${prefix}_workspace_${++sequence}`;
    })(),
    nowIso: () => "2026-07-16T00:00:00.000Z",
  });

  const pendingDb = baseDb();
  pendingDb.organizations[0].status = "pending";
  await assert.rejects(
    createHarness(pendingDb).users.beginManagedAdminCreate({
      user: candidate({ firebaseUid: "" }),
      idempotency: idempotency(),
    }),
    (error) => error?.code === "WORKSPACE_NOT_ACTIVE",
  );

  const personalDb = baseDb();
  personalDb.organizations[0].workspaceType = "personal";
  personalDb.organizations[0].type = "personal";
  await assert.rejects(
    createHarness(personalDb).users.beginManagedAdminCreate({
      user: candidate({ firebaseUid: "" }),
      idempotency: idempotency(),
    }),
    (error) => error?.code === "WORKSPACE_NOT_SHARED",
  );

  const deactivatedDb = baseDb();
  const deactivatedRepositories = createHarness(deactivatedDb);
  const begin = await deactivatedRepositories.users.beginManagedAdminCreate({
    user: candidate({ firebaseUid: "" }),
    idempotency: idempotency(),
  });
  deactivatedDb.organizations[0].status = "rejected";
  await assert.rejects(
    deactivatedRepositories.users.createManagedAdminWithAudit({
      user: candidate({ id: begin.reservation.userId }),
      idempotency: idempotency(),
      auditInput: auditInput(),
    }),
    (error) => error?.code === "WORKSPACE_NOT_ACTIVE",
  );
  assert.equal(deactivatedDb.users.length, 0);
  assert.equal(deactivatedDb.memberships.length, 0);
  assert.equal(deactivatedDb.auditLogs.length, 0);
  assert.equal(deactivatedDb.idempotencyKeys[0].responseResource.state, "provider_pending");

  const platformDb = baseDb();
  platformDb.organizations[0].status = "rejected";
  platformDb.organizations[0].workspaceType = "personal";
  const platformBegin = await createHarness(platformDb).users.beginManagedAdminCreate({
    user: candidate({ firebaseUid: "", role: "admin", requestedRole: "admin" }),
    idempotency: idempotency(),
  });
  assert.equal(platformBegin.reservation.state, "provider_pending");
}

async function testPendingPlatformAdminCannotSatisfyLastAdminGuard() {
  const db = baseDb();
  db.users.push({
    id: "admin_existing",
    role: "admin",
    requestedRole: "admin",
    roleRequestStatus: "approved",
    accountStatus: "active",
    organizationId: "org_managed_admin",
    email: "existing-admin@smarthealth.test",
  });
  db.memberships.push({
    id: "membership_existing_admin",
    userId: "admin_existing",
    organizationId: "org_managed_admin",
    role: "admin",
  });
  db.sessions = [];
  db.authSessions = [];
  db.identityOperations = [];
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (() => {
      let sequence = 0;
      return (prefix) => `${prefix}_last_admin_${++sequence}`;
    })(),
    nowIso: () => "2026-07-16T00:00:00.000Z",
  });
  const platformCandidate = candidate({
    id: "admin_pending",
    firebaseUid: "firebase_admin_pending",
    email: "pending-admin@smarthealth.test",
    role: "admin",
    requestedRole: "admin",
  });
  const platformIdempotency = {
    ...idempotency("platform-admin-pending-fingerprint"),
    key: "platform-admin-pending-key",
  };
  const begin = await repositories.users.beginManagedAdminCreate({
    user: { ...platformCandidate, firebaseUid: "" },
    idempotency: platformIdempotency,
  });
  const pending = await repositories.users.createManagedAdminWithAudit({
    user: { ...platformCandidate, id: begin.reservation.userId },
    idempotency: platformIdempotency,
    auditInput: auditInput(),
  });
  assert.equal(pending.user.accountStatus, "provisioning_pending");
  assert.equal(
    db.memberships.some((membership) => membership.userId === pending.user.id),
    false,
    "platform admins must not receive a tenant membership as a side effect",
  );
  await assert.rejects(
    repositories.identityOperations.begin({
      targetUserId: "admin_existing",
      actorUserId: "admin_existing",
      organizationId: "org_managed_admin",
      operation: "lock",
      idempotencyKey: "lock-last-admin-while-new-admin-pending",
      requestFingerprint: "lock-last-admin-while-new-admin-pending",
      protectLastPlatformAdmin: true,
    }),
    (error) => error?.code === "LAST_PLATFORM_ADMIN_REQUIRED",
  );
  assert.equal(db.users.find((user) => user.id === "admin_existing").accountStatus, "active");
}

function createSqlHarness() {
  const state = {
    organizations: [{ id: "org_managed_admin", status: "active", workspace_type: "clinic", type: "clinic" }],
    users: [],
    memberships: [],
    auditLogs: [],
    identityOperations: [],
    idempotency: [],
  };
  let transactionSnapshot = null;
  let failAudit = false;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const restore = (snapshot) => {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, clone(snapshot));
  };
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (text === "BEGIN") {
        transactionSnapshot = clone(state);
        return { rows: [] };
      }
      if (text === "COMMIT") {
        transactionSnapshot = null;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        if (transactionSnapshot) restore(transactionSnapshot);
        transactionSnapshot = null;
        return { rows: [] };
      }
      if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.startsWith("SELECT id, operation FROM identity_operations")) {
        const row = state.identityOperations.find(
          (item) => item.target_user_id === params[0] &&
            ["pending_provider", "provider_applied", "provider_failed"].includes(item.status),
        );
        return { rows: row ? [{ id: row.id, operation: row.operation }] : [] };
      }
      if (text.includes("FROM mutation_idempotency") && text.includes("SELECT fingerprint")) {
        const row = state.idempotency.find(
          (item) => item.scope === params[0] && item.operation === params[1] && item.idempotency_key === params[2],
        );
        return { rows: row ? [clone(row)] : [] };
      }
      if (text.startsWith("SELECT id FROM users WHERE id = $1 OR lower(email)")) {
        const row = state.users.find(
          (user) =>
            user.id === params[0] ||
            String(user.email || "").toLowerCase() === String(params[1] || "").toLowerCase() ||
            (params[2] && user.firebase_uid === params[2]),
        );
        return { rows: row ? [{ id: row.id }] : [] };
      }
      if (text === "SELECT id, status, workspace_type, type FROM organizations WHERE id = $1 LIMIT 1 FOR UPDATE") {
        const row = state.organizations.find((organization) => organization.id === params[0]);
        return { rows: row ? [clone(row)] : [] };
      }
      if (text.startsWith("INSERT INTO mutation_idempotency")) {
        state.idempotency.push({
          id: params[0],
          scope: params[1],
          operation: params[2],
          idempotency_key: params[3],
          fingerprint: params[4],
          resource_type: params[5],
          resource_id: params[6],
          response_status: params[7],
          response_json: JSON.parse(params[8]),
        });
        return { rows: [] };
      }
      if (text === "SELECT * FROM users WHERE id = $1 LIMIT 1") {
        const row = state.users.find((user) => user.id === params[0]);
        return { rows: row ? [clone(row)] : [] };
      }
      if (text === "SELECT * FROM users WHERE id = $1 LIMIT 1 FOR UPDATE") {
        const row = state.users.find((user) => user.id === params[0]);
        return { rows: row ? [clone(row)] : [] };
      }
      if (text.startsWith("INSERT INTO users")) {
        const row = {
          id: params[0], firebase_uid: params[1], email: params[2], phone: params[3], role: params[4], name: params[5],
          password_hash: params[6], license: params[7], hospital: params[8], department: params[9], address: params[10],
          organization_id: params[11], patient_id: null, verified_email: params[12], verified_phone: params[13],
          account_status: params[14], requested_role: params[15], role_request_status: params[16],
          role_requested_at: params[17], role_approved_at: params[18], firebase_claims: JSON.parse(params[19]),
          created_at: params[20], updated_at: "2026-07-16T00:00:00.000Z",
        };
        state.users.push(row);
        return { rows: [clone(row)] };
      }
      if (text.startsWith("INSERT INTO memberships")) {
        const row = {
          id: params[0], organization_id: params[1], user_id: params[2], role: params[3], created_at: params[4],
        };
        state.memberships.push(row);
        return { rows: [clone(row)] };
      }
      if (text.startsWith("INSERT INTO audit_logs")) {
        if (failAudit) throw new Error("simulated SQL audit failure");
        state.auditLogs.push({ id: params[0], action: params[3], resource_id: params[5] });
        return { rows: [] };
      }
      if (text.startsWith("INSERT INTO identity_operations")) {
        const row = {
          id: params[0],
          target_user_id: params[1],
          actor_user_id: params[2],
          organization_id: params[3],
          operation: "managed_admin_activate",
          status: "pending_provider",
          idempotency_key: params[4],
          request_fingerprint: params[5],
          previous_account_status: "provisioning_pending",
          target_account_status: "active",
          target_state: JSON.parse(params[6]),
          provider_status: "pending",
          provider_result: {},
          created_at: "2026-07-16T00:00:00.000Z",
          updated_at: "2026-07-16T00:00:00.000Z",
        };
        state.identityOperations.push(row);
        return { rows: [clone(row)] };
      }
      if (text === "SELECT * FROM identity_operations WHERE id = $1 LIMIT 1 FOR UPDATE") {
        const row = state.identityOperations.find((item) => item.id === params[0]);
        return { rows: row ? [clone(row)] : [] };
      }
      if (text.startsWith("UPDATE users SET account_status = 'active'")) {
        const row = state.users.find((user) => user.id === params[0]);
        if (row) row.account_status = "active";
        return { rows: row ? [clone(row)] : [] };
      }
      if (text.startsWith("UPDATE identity_operations")) {
        const row = state.identityOperations.find((item) => item.id === params[0]);
        if (row) {
          row.status = "completed";
          row.provider_status = "enabled_verified";
          row.provider_result = JSON.parse(params[1]);
          row.completed_at = "2026-07-16T00:00:00.000Z";
          row.updated_at = "2026-07-16T00:00:00.000Z";
        }
        return { rows: row ? [clone(row)] : [] };
      }
      if (text.startsWith("UPDATE mutation_idempotency")) {
        const row = state.idempotency.find(
          (item) => item.scope === params[0] && item.operation === params[1] && item.idempotency_key === params[2],
        );
        row.resource_type = "managed_admin_create";
        row.resource_id = params[3];
        row.response_status = text.includes("response_status = 202") ? 202 : 201;
        row.response_json = JSON.parse(params[4]);
        return { rows: [] };
      }
      throw new Error(`Unhandled SQL in managed-admin smoke: ${text}`);
    },
    release() {},
  };
  return {
    state,
    pool: { connect: async () => client },
    setFailAudit(value) { failAudit = value; },
  };
}

async function testSqlTransactionAndRollback() {
  const runtimeDb = baseDb();
  const sql = createSqlHarness();
  const repositories = createRepositories({
    getDb: () => runtimeDb,
    saveDb: async () => {},
    createId: (() => {
      let sequence = 0;
      return (prefix) => `${prefix}_sql_${++sequence}`;
    })(),
    nowIso: () => "2026-07-16T00:00:00.000Z",
    getPool: () => sql.pool,
    onSqlError: () => {},
  });
  const pendingCandidate = candidate({ firebaseUid: "" });
  const begin = await repositories.users.beginManagedAdminCreate({
    user: pendingCandidate,
    idempotency: idempotency(),
  });
  assert.equal(sql.state.users.length, 0);
  assert.equal(sql.state.idempotency[0].response_json.state, "provider_pending");

  sql.state.organizations[0].status = "rejected";
  await assert.rejects(
    repositories.users.createManagedAdminWithAudit({
      user: candidate({ id: begin.reservation.userId }),
      idempotency: idempotency(),
      auditInput: auditInput(),
    }),
    (error) => error?.code === "WORKSPACE_NOT_ACTIVE",
  );
  assert.equal(sql.state.users.length, 0);
  assert.equal(sql.state.idempotency[0].response_json.state, "provider_pending");
  sql.state.organizations[0].status = "active";

  sql.setFailAudit(true);
  await assert.rejects(
    repositories.users.createManagedAdminWithAudit({
      user: candidate({ id: begin.reservation.userId }),
      idempotency: idempotency(),
      auditInput: auditInput(),
    }),
    /simulated SQL audit failure/,
  );
  assert.equal(sql.state.users.length, 0, "SQL rollback must remove the user insert");
  assert.equal(sql.state.memberships.length, 0, "SQL rollback must remove the membership insert");
  assert.equal(sql.state.auditLogs.length, 0);
  assert.equal(sql.state.idempotency[0].response_json.state, "provider_pending");

  sql.setFailAudit(false);
  const committed = await repositories.users.createManagedAdminWithAudit({
    user: candidate({ id: begin.reservation.userId }),
    idempotency: idempotency(),
    auditInput: auditInput(),
  });
  assert.equal(committed.replayed, false);
  assert.equal(sql.state.users.length, 1);
  assert.equal(sql.state.memberships.length, 1);
  assert.equal(sql.state.auditLogs.length, 1);
  assert.equal(sql.state.users[0].account_status, "provisioning_pending");
  assert.equal(sql.state.idempotency[0].response_json.state, "activation_pending");
  assert.equal(sql.state.idempotency[0].response_status, 202);
  assert.equal(sql.state.identityOperations.length, 1);
  assert.equal(sql.state.identityOperations[0].status, "pending_provider");

  const replay = await repositories.users.createManagedAdminWithAudit({
    user: candidate({ id: begin.reservation.userId }),
    idempotency: idempotency(),
    auditInput: auditInput(),
  });
  assert.equal(replay.replayed, true);
  assert.equal(sql.state.auditLogs.length, 1);

  const activated = await repositories.users.confirmManagedAdminProviderActivation({
    idempotency: idempotency(),
    userId: committed.reservation.userId,
    firebaseUid: committed.reservation.firebaseUid,
    operationId: committed.reservation.activationOperationId,
  });
  assert.equal(activated.replayed, false);
  assert.equal(sql.state.users[0].account_status, "active");
  assert.equal(sql.state.identityOperations[0].status, "completed");
  assert.equal(sql.state.idempotency[0].response_json.state, "completed");
  assert.equal(sql.state.idempotency[0].response_status, 201);
  assert.equal(sql.state.auditLogs.length, 2);
}

function testServerProviderSafetyContract() {
  const source = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");
  const start = source.indexOf("async function createManagedAdminAccount(");
  const end = source.indexOf("function getStorageSummary", start);
  const functionSource = source.slice(start, end);
  assert.equal((source.match(/async function createManagedAdminAccount\(/g) || []).length, 1);
  assert.match(source, /const idempotencyKey = readString\(req\.headers\["idempotency-key"\], 160\)/);
  assert.match(functionSource, /createUser\(\{[\s\S]*uid: reservation\.providerUid[\s\S]*disabled: true/);
  assert.match(
    functionSource,
    /createManagedAdminWithAudit\([\s\S]*backendCommitted = true;[\s\S]*activateCommittedManagedAdmin/,
  );
  assert.match(functionSource, /confirmManagedAdminProviderActivation/);
  assert.match(functionSource, /readActivationState/);
  const completedReplayStart = functionSource.indexOf('if (reservation.state === "completed")');
  const activationPendingStart = functionSource.indexOf('if (reservation.state === "activation_pending")');
  assert.ok(completedReplayStart >= 0 && activationPendingStart > completedReplayStart);
  assert.doesNotMatch(
    functionSource.slice(completedReplayStart, activationPendingStart),
    /disabled: false/,
    "completed replay must never heal a provider disabled by a later lifecycle action",
  );
  assert.match(
    functionSource,
    /providerCreatedByCurrentAttempt[\s\S]*updateUser\(firebaseUser\.uid, \{ disabled: true \}\)[\s\S]*deleteUser\(firebaseUser\.uid\)/,
  );
  assert.match(functionSource, /assertPendingManagedAdminProvider/);
  assert.doesNotMatch(functionSource, /getRequestIp\(req\)/);
  assert.match(
    functionSource,
    /\(getRequestContext\(req\) \|\| createRequestContext\(req\)\)\.ip/,
  );
  assert.doesNotMatch(functionSource, /createIdempotencyFingerprint\(payload\)/);
  const providerProfileStart = functionSource.indexOf("setCustomUserClaims(firebaseUser.uid, provisioningClaims)");
  const backendCommitStart = functionSource.indexOf("createManagedAdminWithAudit", providerProfileStart);
  assert.doesNotMatch(functionSource.slice(providerProfileStart, backendCommitStart), /password/);

  const activationMigration = fs.readFileSync(
    path.join(rootDir, "db", "migrations", "023_managed_admin_activation_saga.sql"),
    "utf8",
  );
  assert.match(activationMigration, /managed_admin_activate/);
  assert.match(activationMigration, /identity_operations_operation_check/);
  assert.match(activationMigration, /VALIDATE CONSTRAINT identity_operations_operation_check/);
}

async function main() {
  await testJsonReservationAndAtomicCommit();
  await testJsonWorkspaceLifecycleGuards();
  await testPendingPlatformAdminCannotSatisfyLastAdminGuard();
  await testSqlTransactionAndRollback();
  testServerProviderSafetyContract();
  console.log("managed admin create smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
