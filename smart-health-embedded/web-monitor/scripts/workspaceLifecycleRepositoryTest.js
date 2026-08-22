const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assertWorkspaceTransition,
  normalizeWorkspaceCreate,
  normalizeWorkspacePatch,
} = require("../src/workspaceLifecycleContract");
const { createWorkspaceLifecycleRepository } = require("../src/workspaceLifecycleRepository");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createIdFactory() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}

function createRuntimeDb() {
  const createdAt = "2026-07-19T00:00:00.000Z";
  return {
    organizations: [
      {
        id: "org_alpha",
        name: "Alpha Clinic",
        type: "clinic",
        workspaceType: "clinic",
        status: "pending",
        ownerUserId: "owner_alpha",
        version: 1,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "org_beta",
        name: "Beta Hospital",
        type: "hospital",
        workspaceType: "hospital",
        status: "active",
        ownerUserId: "owner_beta",
        version: 4,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    users: [
      {
        id: "owner_alpha",
        role: "workspace_owner",
        requestedRole: "workspace_owner",
        roleRequestStatus: "approved",
        accountStatus: "active",
        organizationId: "org_alpha",
      },
      {
        id: "owner_beta",
        role: "workspace_owner",
        requestedRole: "workspace_owner",
        roleRequestStatus: "approved",
        accountStatus: "active",
        organizationId: "org_beta",
      },
    ],
    memberships: [
      { id: "mbr_alpha", organizationId: "org_alpha", userId: "owner_alpha", role: "workspace_owner", status: "active" },
      { id: "mbr_beta", organizationId: "org_beta", userId: "owner_beta", role: "workspace_owner", status: "active" },
    ],
    auditLogs: [],
    idempotencyKeys: [],
  };
}

function idempotency(operation, key, fingerprint) {
  return { scope: "platform:admin", operation, key, fingerprint };
}

function audit(action, organizationId = "") {
  return {
    action,
    actorUserId: "admin_platform",
    organizationId,
    ip: "127.0.0.1",
    userAgent: "workspace-lifecycle-test",
  };
}

test("workspace contract validates the state machine and blocks status in ordinary patches", () => {
  assert.equal(normalizeWorkspaceCreate({ name: "Gamma Clinic" }).status, "pending");
  assert.throws(
    () => normalizeWorkspaceCreate({ name: "Gamma Clinic", status: "active" }),
    (error) => error.code === "WORKSPACE_CREATE_STATUS_INVALID",
  );
  assert.throws(
    () => normalizeWorkspaceCreate({ name: "Unknown", workspaceType: "arbitrary_tenant" }),
    (error) => error.code === "WORKSPACE_TYPE_INVALID",
  );
  assert.deepEqual(assertWorkspaceTransition("pending", "needs_info"), {
    from: "pending",
    to: "needs_info",
  });
  assert.deepEqual(assertWorkspaceTransition("inactive", "active"), {
    from: "inactive",
    to: "active",
  });
  assert.throws(
    () => assertWorkspaceTransition("rejected", "active"),
    (error) => error.code === "WORKSPACE_TRANSITION_INVALID",
  );
  assert.throws(
    () => normalizeWorkspacePatch({ status: "inactive" }),
    (error) => error.code === "WORKSPACE_STATUS_REQUIRES_TRANSITION",
  );
});

test("JSON workspace lifecycle is versioned, idempotent, searchable and audit atomic", async () => {
  const db = createRuntimeDb();
  let saves = 0;
  const repository = createWorkspaceLifecycleRepository({
    getDb: () => db,
    saveDb: async () => {
      saves += 1;
    },
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
  });

  const createInput = {
    workspaceId: "org_gamma",
    payload: { name: "Gamma Clinic", email: "contact@gamma.test" },
    idempotency: idempotency("workspace.create", "create-gamma", "create-gamma-v1"),
    audit: audit("workspace.create", "org_gamma"),
  };
  const created = await repository.create(createInput);
  assert.equal(created.responseStatus, 201);
  assert.equal(created.responseBody.workspace.version, 1);
  assert.equal(created.responseBody.idempotent, false);
  assert.ok(created.responseBody.operationId);
  const createReplay = await repository.create(createInput);
  assert.equal(createReplay.replayed, true);
  assert.equal(createReplay.responseBody.operationId, created.responseBody.operationId);
  assert.equal(createReplay.responseBody.workspace.id, "org_gamma");
  assert.equal(db.organizations.filter((item) => item.id === "org_gamma").length, 1);
  await assert.rejects(
    repository.create({
      ...createInput,
      idempotency: { ...createInput.idempotency, fingerprint: "create-gamma-v2" },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );

  const page = await repository.list({ q: "clinic", page: 1, limit: 1, sort: "name:asc" });
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].name, "Alpha Clinic");

  const updateInput = {
    workspaceId: "org_gamma",
    expectedVersion: 1,
    payload: { name: "Gamma Health Clinic", phone: "0900000000" },
    idempotency: idempotency("workspace.update", "update-gamma", "update-gamma-v1"),
    audit: audit("workspace.update", "org_gamma"),
  };
  const updated = await repository.update(updateInput);
  assert.equal(updated.responseBody.workspace.version, 2);
  const updateReplay = await repository.update(updateInput);
  assert.equal(updateReplay.replayed, true);
  assert.equal(
    updateReplay.responseBody.operationId,
    updated.responseBody.operationId,
    "an ambiguous workspace settings retry must replay the original operation receipt",
  );
  assert.equal(
    db.auditLogs.filter(
      (entry) =>
        entry.action === "workspace.update" &&
        entry.resourceId === "org_gamma",
    ).length,
    1,
    "an exact retry must not append a second workspace audit row",
  );
  await assert.rejects(
    repository.update({
      ...updateInput,
      payload: { name: "Payload collision" },
      idempotency: {
        ...updateInput.idempotency,
        fingerprint: "update-gamma-collision-v2",
      },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  await assert.rejects(
    repository.update({
      ...updateInput,
      idempotency: idempotency("workspace.update", "update-gamma-stale", "update-gamma-stale-v1"),
    }),
    (error) => error.code === "WORKSPACE_VERSION_CONFLICT" && error.details.currentVersion === 2,
  );

  const activated = await repository.transition({
    workspaceId: "org_alpha",
    expectedVersion: 1,
    nextStatus: "active",
    idempotency: idempotency("workspace.transition", "activate-alpha", "activate-alpha-v1"),
    audit: audit("workspace.transition", "org_alpha"),
  });
  assert.deepEqual(activated.responseBody.transition, { from: "pending", to: "active" });
  assert.equal(activated.responseBody.workspace.version, 2);
  const deactivated = await repository.transition({
    workspaceId: "org_alpha",
    expectedVersion: 2,
    nextStatus: "inactive",
    idempotency: idempotency("workspace.transition", "deactivate-alpha", "deactivate-alpha-v1"),
    audit: audit("workspace.transition", "org_alpha"),
  });
  assert.equal(deactivated.responseBody.workspace.status, "inactive");

  const archived = await repository.archive({
    workspaceId: "org_alpha",
    expectedVersion: 3,
    idempotency: idempotency("workspace.archive", "archive-alpha", "archive-alpha-v1"),
    audit: audit("workspace.archive", "org_alpha"),
  });
  assert.deepEqual(
    {
      deleted: archived.responseBody.deleted,
      workspaceId: archived.responseBody.workspaceId,
      idempotent: archived.responseBody.idempotent,
    },
    { deleted: true, workspaceId: "org_alpha", idempotent: false },
  );
  assert.equal((await repository.findById("org_alpha")), null);
  assert.ok(await repository.findById("org_alpha", { includeArchived: true }));
  assert.equal((await repository.list({ page: 1, limit: 100 })).items.some((item) => item.id === "org_alpha"), false);
  assert.equal(db.auditLogs.length, 5, "one successful audit row per unique lifecycle mutation");
  assert.equal(db.idempotencyKeys.length, 5);
  assert.ok(saves >= 5);
});

test("JSON persistence failure rolls workspace, audit and idempotency state back", async () => {
  const db = createRuntimeDb();
  const before = clone(db);
  const repository = createWorkspaceLifecycleRepository({
    getDb: () => db,
    saveDb: async () => {
      throw new Error("disk unavailable");
    },
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
  });
  await assert.rejects(
    repository.update({
      workspaceId: "org_alpha",
      expectedVersion: 1,
      payload: { phone: "0911111111" },
      idempotency: idempotency("workspace.update", "update-fails", "update-fails-v1"),
      audit: audit("workspace.update", "org_alpha"),
    }),
    /disk unavailable/,
  );
  assert.deepEqual(db, before);
});

test("legacy unpaginated callers keep the full active catalog and filters stay truthful", async () => {
  const db = createRuntimeDb();
  for (let index = 0; index < 30; index += 1) {
    db.organizations.push({
      id: `org_bulk_${String(index).padStart(2, "0")}`,
      name: `Bulk Clinic ${index}`,
      type: "clinic",
      workspaceType: "clinic",
      status: index % 2 === 0 ? "pending" : "inactive",
      version: 1,
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    });
  }
  const repository = createWorkspaceLifecycleRepository({
    getDb: () => db,
    saveDb: async () => {},
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
  });

  const legacy = await repository.list();
  assert.equal(legacy.items.length, 32, "legacy catalog callers must not be silently truncated to 25");
  const filtered = await repository.list({
    q: "bulk clinic",
    status: "pending",
    workspaceType: "clinic",
    page: 1,
    limit: 100,
    sort: "name:asc",
  });
  assert.equal(filtered.total, 15);
  assert.ok(filtered.items.every((workspace) => workspace.status === "pending"));
});

test("activation fails closed until the canonical owner identity and membership are ready", async () => {
  const db = createRuntimeDb();
  const owner = db.users.find((item) => item.id === "owner_alpha");
  owner.role = "patient";
  owner.roleRequestStatus = "pending";
  const repository = createWorkspaceLifecycleRepository({
    getDb: () => db,
    saveDb: async () => {},
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
  });

  await assert.rejects(
    repository.transition({
      workspaceId: "org_alpha",
      expectedVersion: 1,
      nextStatus: "active",
      idempotency: idempotency("workspace.transition", "activation-not-ready", "activation-not-ready-v1"),
      audit: audit("workspace.transition", "org_alpha"),
    }),
    (error) => error.code === "WORKSPACE_OWNER_IDENTITY_NOT_CONFIRMED",
  );
  assert.equal(db.organizations.find((item) => item.id === "org_alpha").status, "pending");
  assert.equal(db.auditLogs.length, 0);
});

class FakeWorkspaceSql {
  constructor() {
    this.state = {
      organizations: [
        {
          id: "org_alpha",
          name: "Alpha Clinic",
          type: "clinic",
          workspace_type: "clinic",
          address: null,
          phone: null,
          email: null,
          website: null,
          status: "pending",
          legal_name: null,
          representative: null,
          owner_user_id: "owner_alpha",
          package_id: null,
          subscription_status: "trial",
          billing_cycle: "monthly",
          request_metadata: {},
          version: 1,
          deleted_at: null,
          created_at: "2026-07-19T00:00:00.000Z",
          updated_at: "2026-07-19T00:00:00.000Z",
        },
      ],
      users: [
        {
          id: "owner_alpha",
          role: "workspace_owner",
          requested_role: "workspace_owner",
          role_request_status: "approved",
          account_status: "active",
          organization_id: "org_alpha",
        },
      ],
      memberships: [
        { id: "mbr_alpha", organization_id: "org_alpha", user_id: "owner_alpha", role: "workspace_owner", status: "active" },
      ],
      auditLogs: [],
      idempotency: [],
    };
    this.snapshot = null;
    this.failNextAudit = false;
  }

  normalize(sql) {
    return sql.replace(/\s+/g, " ").trim().toLowerCase();
  }

  result(row) {
    return { rows: row ? [clone(row)] : [], rowCount: row ? 1 : 0 };
  }

  async query(sql, params = []) {
    const query = this.normalize(sql);
    if (query === "begin") {
      this.snapshot = clone(this.state);
      return { rows: [], rowCount: 0 };
    }
    if (query === "commit") {
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (query === "rollback") {
      if (this.snapshot) this.state = this.snapshot;
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (query.startsWith("select pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };
    if (query.includes("from mutation_idempotency") && query.includes("for update")) {
      const row = this.state.idempotency.find(
        (item) => item.scope === params[0] && item.operation === params[1] && item.idempotency_key === params[2],
      );
      return this.result(row);
    }
    if (query === "select * from organizations where deleted_at is null order by created_at asc") {
      return { rows: clone(this.state.organizations.filter((item) => !item.deleted_at)), rowCount: this.state.organizations.length };
    }
    if (query.startsWith("select * from organizations where id = $1")) {
      const includeArchived = !query.includes("deleted_at is null");
      const row = this.state.organizations.find((item) => item.id === params[0] && (includeArchived || !item.deleted_at));
      return this.result(row);
    }
    if (query.startsWith("select id from organizations where id = $1")) {
      const row = this.state.organizations.find((item) => item.id === params[0]);
      return this.result(row ? { id: row.id } : null);
    }
    if (query.startsWith("select id from users where id = $1")) {
      const row = this.state.users.find((item) => item.id === params[0]);
      return this.result(row ? { id: row.id } : null);
    }
    if (query.includes("select id, role, requested_role") && query.includes("from users")) {
      return this.result(this.state.users.find((item) => item.id === params[0]));
    }
    if (query.includes("select id, role, status") && query.includes("from memberships")) {
      return this.result(
        this.state.memberships.find((item) => item.organization_id === params[0] && item.user_id === params[1]),
      );
    }
    if (query.startsWith("insert into organizations")) {
      const row = {
        id: params[0],
        name: params[1],
        type: params[2],
        workspace_type: params[3],
        address: params[4] || null,
        phone: params[5] || null,
        email: params[6] || null,
        website: params[7] || null,
        status: params[8],
        legal_name: params[9] || null,
        representative: params[10] || null,
        owner_user_id: params[11] || null,
        package_id: params[12] || null,
        subscription_status: params[13],
        billing_cycle: params[14],
        request_metadata: JSON.parse(params[15]),
        version: 1,
        deleted_at: null,
        created_at: "2026-07-19T00:00:00.000Z",
        updated_at: "2026-07-19T00:00:00.000Z",
      };
      this.state.organizations.push(row);
      return this.result(row);
    }
    if (query.startsWith("update organizations set name = $2")) {
      const row = this.state.organizations.find(
        (item) => item.id === params[0] && !item.deleted_at && item.version === params[14],
      );
      if (!row) return this.result(null);
      Object.assign(row, {
        name: params[1],
        type: params[2],
        workspace_type: params[3],
        address: params[4] || null,
        phone: params[5] || null,
        email: params[6] || null,
        website: params[7] || null,
        legal_name: params[8] || null,
        representative: params[9] || null,
        package_id: params[10] || null,
        subscription_status: params[11],
        billing_cycle: params[12],
        request_metadata: JSON.parse(params[13]),
        version: row.version + 1,
        updated_at: "2026-07-19T00:00:00.000Z",
      });
      return this.result(row);
    }
    if (query.startsWith("update organizations set status = $2")) {
      const row = this.state.organizations.find(
        (item) => item.id === params[0] && !item.deleted_at && item.version === params[2],
      );
      if (!row) return this.result(null);
      row.status = params[1];
      row.version += 1;
      row.updated_at = "2026-07-19T00:00:00.000Z";
      return this.result(row);
    }
    if (query.startsWith("update organizations set deleted_at = now()")) {
      const row = this.state.organizations.find(
        (item) => item.id === params[0] && !item.deleted_at && item.version === params[1],
      );
      if (!row) return this.result(null);
      row.deleted_at = "2026-07-19T00:00:00.000Z";
      row.version += 1;
      row.updated_at = "2026-07-19T00:00:00.000Z";
      return this.result(row);
    }
    if (query.startsWith("insert into audit_logs")) {
      if (this.failNextAudit) {
        this.failNextAudit = false;
        throw new Error("audit insert failed");
      }
      this.state.auditLogs.push({
        id: params[0],
        actor_user_id: params[1],
        organization_id: params[2],
        action: params[3],
        resource_type: params[4],
        resource_id: params[5],
        metadata: JSON.parse(params[8]),
      });
      return { rows: [], rowCount: 1 };
    }
    if (query.startsWith("insert into mutation_idempotency")) {
      this.state.idempotency.push({
        id: params[0],
        scope: params[1],
        operation: params[2],
        idempotency_key: params[3],
        fingerprint: params[4],
        resource_id: params[5],
        response_status: params[6],
        response_json: JSON.parse(params[7]),
      });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unsupported fake SQL: ${query}`);
  }

  async connect() {
    return { query: this.query.bind(this), release() {} };
  }
}

test("PostgreSQL workspace lifecycle commits audit and replay outcome in one transaction", async () => {
  const sql = new FakeWorkspaceSql();
  const runtime = createRuntimeDb();
  const repository = createWorkspaceLifecycleRepository({
    getDb: () => runtime,
    saveDb: async () => {},
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
    getPool: () => sql,
  });

  const transitionInput = {
    workspaceId: "org_alpha",
    expectedVersion: 1,
    nextStatus: "active",
    idempotency: idempotency("workspace.transition", "sql-activate", "sql-activate-v1"),
    audit: audit("workspace.transition", "org_alpha"),
  };
  const first = await repository.transition(transitionInput);
  assert.equal(first.responseBody.workspace.status, "active");
  assert.equal(first.responseBody.workspace.version, 2);
  const replay = await repository.transition(transitionInput);
  assert.equal(replay.replayed, true);
  assert.equal(replay.responseBody.operationId, first.responseBody.operationId);
  assert.equal(replay.responseBody.idempotent, true);
  assert.equal(sql.state.auditLogs.length, 1);
  assert.equal(sql.state.idempotency.length, 1);

  await assert.rejects(
    repository.transition({
      ...transitionInput,
      idempotency: { ...transitionInput.idempotency, fingerprint: "sql-activate-v2" },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );

  const before = clone(sql.state);
  sql.failNextAudit = true;
  await assert.rejects(
    repository.update({
      workspaceId: "org_alpha",
      expectedVersion: 2,
      payload: { phone: "0999999999" },
      idempotency: idempotency("workspace.update", "sql-update-fail", "sql-update-fail-v1"),
      audit: audit("workspace.update", "org_alpha"),
    }),
    /audit insert failed/,
  );
  assert.deepEqual(sql.state, before, "failed audit must roll back workspace and idempotency changes");
  assert.equal(runtime.organizations.find((item) => item.id === "org_alpha").phone || "", "");
});

test("PostgreSQL commit followed by runtime mirror failure is recoverable by idempotent replay", async () => {
  const sql = new FakeWorkspaceSql();
  const runtime = createRuntimeDb();
  let failMirror = true;
  const repository = createWorkspaceLifecycleRepository({
    getDb: () => runtime,
    saveDb: async () => {
      if (failMirror) {
        failMirror = false;
        throw new Error("runtime mirror unavailable");
      }
    },
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
    getPool: () => sql,
  });
  const input = {
    workspaceId: "org_alpha",
    expectedVersion: 1,
    nextStatus: "active",
    idempotency: idempotency("workspace.transition", "sql-recover", "sql-recover-v1"),
    audit: audit("workspace.transition", "org_alpha"),
  };

  await assert.rejects(repository.transition(input), /runtime mirror unavailable/);
  assert.equal(sql.state.organizations[0].status, "active", "SQL transaction remains authoritative");
  const replay = await repository.transition(input);
  assert.equal(replay.replayed, true);
  assert.equal(replay.responseBody.idempotent, true);
  assert.equal(replay.responseBody.workspace.status, "active");
  assert.equal(sql.state.auditLogs.length, 1);
});
