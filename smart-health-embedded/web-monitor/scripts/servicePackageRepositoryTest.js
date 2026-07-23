const assert = require("node:assert/strict");
const test = require("node:test");

const { createRepositories } = require("../src/repositories");
const {
  normalizeServicePackageCreate,
  normalizeServicePackagePatch,
} = require("../src/servicePackageContract");

function createClock() {
  let tick = 0;
  return () => `2026-07-19T00:00:${String(tick++).padStart(2, "0")}.000Z`;
}

function createIdFactory() {
  let tick = 0;
  return (prefix) => `${prefix}_${String(++tick).padStart(4, "0")}`;
}

function packagePayload(overrides = {}) {
  return {
    name: "Clinic Verified",
    type: "professional",
    segment: "organization",
    price: 500000,
    currency: "VND",
    duration: "monthly",
    maxDevices: 20,
    maxDoctors: 10,
    maxPatients: 1000,
    storageGb: 200,
    aiMonthly: 2000,
    retentionDays: 365,
    features: { analytics: true },
    status: "active",
    ...overrides,
  };
}

function mutationInput(operation, key, fingerprint) {
  return {
    scope: "platform:user_platform",
    operation,
    key,
    fingerprint,
  };
}

function runtimeHarness(seed = {}) {
  const db = {
    servicePackages: [],
    organizations: [],
    subscriptions: [],
    auditLogs: [],
    idempotencyKeys: [],
    ...seed,
  };
  let saves = 0;
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      saves += 1;
    },
    createId: createIdFactory(),
    nowIso: createClock(),
    getPool: () => null,
  });
  return { db, repositories, get saves() { return saves; } };
}

function toSqlRow(servicePackage) {
  return {
    id: servicePackage.id,
    name: servicePackage.name,
    type: servicePackage.type,
    segment: servicePackage.segment,
    price: servicePackage.price,
    currency: servicePackage.currency,
    duration: servicePackage.duration,
    max_devices: servicePackage.maxDevices,
    max_doctors: servicePackage.maxDoctors,
    max_patients: servicePackage.maxPatients,
    storage_gb: servicePackage.storageGb,
    ai_monthly: servicePackage.aiMonthly,
    retention_days: servicePackage.retentionDays,
    features: servicePackage.features,
    status: servicePackage.status,
    created_at: servicePackage.createdAt,
    updated_at: servicePackage.updatedAt,
  };
}

class FakePackageSql {
  constructor() {
    this.packages = new Map();
    this.organizations = [];
    this.idempotency = new Map();
    this.auditLogs = [];
    this.snapshot = null;
  }

  key(scope, operation, idempotencyKey) {
    return `${scope}\u0000${operation}\u0000${idempotencyKey}`;
  }

  async connect() {
    return {
      query: (sql, params = []) => this.query(sql, params),
      release() {},
    };
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized === "BEGIN") {
      this.snapshot = {
        packages: structuredClone([...this.packages.entries()]),
        organizations: structuredClone(this.organizations),
        idempotency: structuredClone([...this.idempotency.entries()]),
        auditLogs: structuredClone(this.auditLogs),
      };
      return { rows: [] };
    }
    if (normalized === "COMMIT") {
      this.snapshot = null;
      return { rows: [] };
    }
    if (normalized === "ROLLBACK") {
      if (this.snapshot) {
        this.packages = new Map(this.snapshot.packages);
        this.organizations = this.snapshot.organizations;
        this.idempotency = new Map(this.snapshot.idempotency);
        this.auditLogs = this.snapshot.auditLogs;
      }
      this.snapshot = null;
      return { rows: [] };
    }
    if (normalized.includes("pg_advisory_xact_lock")) return { rows: [{}] };

    if (normalized.includes("FROM mutation_idempotency") && normalized.startsWith("SELECT")) {
      const entry = this.idempotency.get(this.key(params[0], params[1], params[2]));
      return { rows: entry ? [structuredClone(entry)] : [] };
    }
    if (normalized.startsWith("INSERT INTO mutation_idempotency")) {
      const entry = {
        fingerprint: params[4],
        resource_type: params[5],
        resource_id: params[6],
        response_status: params[7],
        response_json: JSON.parse(params[8]),
      };
      this.idempotency.set(this.key(params[1], params[2], params[3]), entry);
      return { rows: [] };
    }
    if (normalized.startsWith("INSERT INTO audit_logs")) {
      this.auditLogs.push({
        id: params[0],
        actor_user_id: params[1],
        action: params[3],
        resource_type: params[4],
        resource_id: params[5],
      });
      return { rows: [] };
    }

    if (normalized.startsWith("SELECT * FROM service_packages WHERE id = $1")) {
      const row = this.packages.get(params[0]);
      return { rows: row ? [structuredClone(row)] : [] };
    }
    if (normalized.includes("FROM service_packages") && normalized.includes("id = $1 OR")) {
      const name = String(params[1]).trim().toLowerCase();
      const rows = [...this.packages.values()].filter(
        (row) => row.id === params[0] || String(row.name).trim().toLowerCase() === name,
      );
      return { rows: structuredClone(rows.map(({ id, name: packageName }) => ({ id, name: packageName }))) };
    }
    if (
      normalized.includes("FROM service_packages") &&
      normalized.includes("id <> $1") &&
      normalized.includes("lower(btrim(name))")
    ) {
      const name = String(params[1]).trim().toLowerCase();
      const row = [...this.packages.values()].find(
        (item) => item.id !== params[0] && String(item.name).trim().toLowerCase() === name,
      );
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (normalized.startsWith("SELECT * FROM service_packages ORDER BY")) {
      return { rows: structuredClone([...this.packages.values()]) };
    }
    if (normalized.startsWith("INSERT INTO service_packages")) {
      const servicePackage = {
        id: params[0],
        name: params[1],
        type: params[2],
        segment: params[3],
        price: params[4],
        currency: params[5],
        duration: params[6],
        maxDevices: params[7],
        maxDoctors: params[8],
        maxPatients: params[9],
        storageGb: params[10],
        aiMonthly: params[11],
        retentionDays: params[12],
        features: JSON.parse(params[13]),
        status: params[14],
        createdAt: params[15],
        updatedAt: params[16],
      };
      const row = toSqlRow(servicePackage);
      this.packages.set(row.id, row);
      return { rows: [structuredClone(row)] };
    }
    if (normalized.startsWith("UPDATE service_packages SET")) {
      const current = this.packages.get(params[0]);
      if (!current) return { rows: [] };
      const row = toSqlRow({
        id: params[0],
        name: params[1],
        type: params[2],
        segment: params[3],
        price: params[4],
        currency: params[5],
        duration: params[6],
        maxDevices: params[7],
        maxDoctors: params[8],
        maxPatients: params[9],
        storageGb: params[10],
        aiMonthly: params[11],
        retentionDays: params[12],
        features: JSON.parse(params[13]),
        status: params[14],
        createdAt: current.created_at,
        updatedAt: params[15],
      });
      this.packages.set(row.id, row);
      return { rows: [structuredClone(row)] };
    }
    if (normalized.startsWith("SELECT id FROM organizations WHERE package_id = $1")) {
      const organization = this.organizations.find((item) => item.package_id === params[0]);
      return { rows: organization ? [{ id: organization.id }] : [] };
    }

    throw new Error(`Unhandled fake SQL query: ${normalized}`);
  }
}

test("service package contract rejects invalid aliases, enums and limits", () => {
  assert.throws(
    () =>
      normalizeServicePackageCreate(
        { ...packagePayload(), name: "One", packageName: "Two" },
        { id: "pkg_alias" },
      ),
    (error) => error.code === "PACKAGE_ALIAS_CONFLICT",
  );
  assert.throws(
    () => normalizeServicePackageCreate(packagePayload({ segment: "unknown" }), { id: "pkg_enum" }),
    (error) => error.code === "PACKAGE_ENUM_INVALID",
  );
  assert.throws(
    () => normalizeServicePackageCreate(packagePayload({ maxDevices: Number.POSITIVE_INFINITY }), { id: "pkg_limit" }),
    (error) => error.code === "PACKAGE_LIMIT_INVALID",
  );
  assert.throws(
    () => normalizeServicePackagePatch({ ...packagePayload(), id: "pkg_one" }, {}),
    (error) => error.code === "PACKAGE_UPDATE_EMPTY",
  );
});

test("JSON repository persists audit, exact replay and lifecycle-safe archive", async () => {
  const harness = runtimeHarness();
  const createInput = {
    packageId: "pkg_verified",
    payload: packagePayload(),
    idempotency: mutationInput("package.create", "create-key", "create-fingerprint"),
    audit: { actorUserId: "user_platform", action: "package.create" },
  };
  const created = await harness.repositories.servicePackages.create(createInput);
  assert.equal(created.responseBody.package.id, "pkg_verified");
  assert.equal(harness.db.auditLogs.length, 1);
  assert.equal(harness.db.idempotencyKeys.length, 1);

  const replay = await harness.repositories.servicePackages.create(createInput);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.responseBody, created.responseBody);
  assert.equal(harness.db.auditLogs.length, 1);

  await assert.rejects(
    harness.repositories.servicePackages.create({
      ...createInput,
      idempotency: { ...createInput.idempotency, fingerprint: "different" },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );

  harness.db.organizations.push({ id: "org_assigned", packageId: "pkg_verified" });
  await assert.rejects(
    harness.repositories.servicePackages.archive({
      packageId: "pkg_verified",
      idempotency: mutationInput("package.archive", "archive-key", "archive-fingerprint"),
      audit: { actorUserId: "user_platform", action: "package.archive" },
    }),
    (error) => error.code === "PACKAGE_ASSIGNED",
  );
  assert.equal(harness.db.servicePackages[0].status, "active");
  harness.db.organizations = [];

  const archived = await harness.repositories.servicePackages.archive({
    packageId: "pkg_verified",
    idempotency: mutationInput("package.archive", "archive-key", "archive-fingerprint"),
    audit: { actorUserId: "user_platform", action: "package.archive" },
  });
  assert.equal(archived.responseBody.archived, true);
  assert.equal(archived.responseBody.package.status, "archived");
  assert.equal(harness.db.auditLogs.length, 2);
});

test("PostgreSQL repository keeps package, audit and idempotency outcome atomic", async () => {
  const sql = new FakePackageSql();
  const db = { servicePackages: [], auditLogs: [], idempotencyKeys: [] };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: createIdFactory(),
    nowIso: createClock(),
    getPool: () => sql,
    onSqlError: () => {},
  });

  const createInput = {
    packageId: "pkg_sql_verified",
    payload: packagePayload({ name: "SQL Verified" }),
    idempotency: mutationInput("package.create", "sql-create", "sql-create-fingerprint"),
    audit: { actorUserId: "user_platform", action: "package.create" },
  };
  const created = await repositories.servicePackages.create(createInput);
  assert.equal(created.responseBody.package.id, "pkg_sql_verified");
  assert.equal(sql.auditLogs.length, 1);
  assert.equal(sql.idempotency.size, 1);

  const replay = await repositories.servicePackages.create(createInput);
  assert.equal(replay.replayed, true);
  assert.equal(sql.auditLogs.length, 1);

  const updated = await repositories.servicePackages.update({
    packageId: "pkg_sql_verified",
    payload: { price: 750000, status: "active" },
    idempotency: mutationInput("package.update", "sql-update", "sql-update-fingerprint"),
    audit: { actorUserId: "user_platform", action: "package.update" },
  });
  assert.equal(updated.responseBody.package.price, 750000);

  sql.organizations.push({ id: "org_sql_assigned", package_id: "pkg_sql_verified" });
  await assert.rejects(
    repositories.servicePackages.archive({
      packageId: "pkg_sql_verified",
      idempotency: mutationInput("package.archive", "sql-archive", "sql-archive-fingerprint"),
      audit: { actorUserId: "user_platform", action: "package.archive" },
    }),
    (error) => error.code === "PACKAGE_ASSIGNED",
  );
  assert.equal(sql.packages.get("pkg_sql_verified").status, "active");

  sql.organizations = [];
  const archived = await repositories.servicePackages.archive({
    packageId: "pkg_sql_verified",
    idempotency: mutationInput("package.archive", "sql-archive", "sql-archive-fingerprint"),
    audit: { actorUserId: "user_platform", action: "package.archive" },
  });
  assert.equal(archived.responseBody.package.status, "archived");
  assert.equal(sql.auditLogs.length, 3);
});
