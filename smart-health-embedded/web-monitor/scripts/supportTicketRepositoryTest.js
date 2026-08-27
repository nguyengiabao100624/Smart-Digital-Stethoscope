const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createSupportTicketRepository,
} = require("../src/supportTicketRepository");

function createRuntime() {
  let sequence = 0;
  const db = {
    organizations: [{ id: "workspace-a", status: "active" }],
    users: [{ id: "user-a", organizationId: "workspace-a" }],
    supportTickets: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  return {
    db,
    repository: createSupportTicketRepository({
      getDb: () => db,
      saveDb: async () => {},
      createId: (prefix) => `${prefix}-${++sequence}`,
      nowIso: () => "2026-07-29T04:00:00.000Z",
      getPool: () => null,
    }),
  };
}

function createSqlRuntime() {
  let sequence = 0;
  const queries = [];
  const db = {
    organizations: [{ id: "workspace-a", status: "active" }],
    users: [{ id: "user-a", organizationId: "workspace-a" }],
    supportTickets: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (normalized === "BEGIN" || normalized === "COMMIT") {
        return { rows: [] };
      }
      if (normalized.includes("SELECT pg_advisory_xact_lock")) {
        return { rows: [] };
      }
      if (normalized.includes("FROM mutation_idempotency")) {
        return { rows: [] };
      }
      if (normalized.startsWith("SELECT id, status FROM organizations")) {
        return { rows: [{ id: "workspace-a", status: "active" }] };
      }
      if (normalized.startsWith("SELECT id FROM users")) {
        return { rows: [{ id: "user-a" }] };
      }
      if (normalized.includes("INSERT INTO support_tickets")) {
        return {
          rows: [
            {
              id: params[0],
              organization_id: params[1],
              requester_user_id: params[2],
              type: params[3],
              description: params[4],
              status: "open",
              version: 1,
              created_at: params[5],
              updated_at: params[6],
            },
          ],
        };
      }
      if (
        normalized.includes("INSERT INTO audit_logs") ||
        normalized.includes("INSERT INTO mutation_idempotency")
      ) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in support ticket test: ${normalized}`);
    },
    release() {},
  };
  return {
    db,
    queries,
    repository: createSupportTicketRepository({
      getDb: () => db,
      saveDb: async () => {},
      createId: (prefix) => `${prefix}-${++sequence}`,
      nowIso: () => "2026-07-29T04:00:00.000Z",
      getPool: () => ({ connect: async () => client }),
    }),
  };
}

function createInput(overrides = {}) {
  return {
    payload: {
      workspaceId: "workspace-a",
      requesterUserId: "user-a",
      type: "device_connection",
      description: "Thiết bị không thể kết nối sau khi đã kiểm tra nguồn.",
    },
    idempotency: {
      scope: "user-a:workspace-a",
      operation: "support.ticket.create",
      key: "support-intent-1",
      fingerprint: "fingerprint-a",
    },
    audit: {
      actorUserId: "user-a",
      organizationId: "workspace-a",
      action: "support.ticket.create",
      ip: "127.0.0.1",
      userAgent: "support-test",
    },
  };
}

test("runtime support ticket create is tenant-bound, audited and idempotent", async () => {
  const { db, repository } = createRuntime();

  const created = await repository.create(createInput());
  assert.equal(created.replayed, false);
  assert.equal(created.ticket.workspaceId, "workspace-a");
  assert.equal(created.ticket.requesterUserId, "user-a");
  assert.equal(created.ticket.status, "open");
  assert.equal(db.supportTickets.length, 1);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.auditLogs[0].resourceType, "support_ticket");
  assert.equal(db.auditLogs[0].resourceId, created.ticket.id);
  assert.equal(db.idempotencyKeys.length, 1);

  const replay = await repository.create(createInput());
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.ticket, created.ticket);
  assert.equal(db.supportTickets.length, 1);
  assert.equal(db.auditLogs.length, 1);

  await assert.rejects(
    repository.create({
      ...createInput(),
      idempotency: {
        ...createInput().idempotency,
        fingerprint: "fingerprint-other",
      },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});

test("runtime support ticket rejects inactive or mismatched workspace ownership", async () => {
  const { db, repository } = createRuntime();
  db.organizations[0].status = "archived";

  await assert.rejects(
    repository.create(createInput()),
    (error) => error.code === "SUPPORT_TICKET_WORKSPACE_INACTIVE",
  );
  assert.equal(db.supportTickets.length, 0);
  assert.equal(db.auditLogs.length, 0);
});

test("Postgres support ticket create commits ticket, audit and idempotency atomically", async () => {
  const { db, queries, repository } = createSqlRuntime();

  const result = await repository.create(createInput());

  assert.equal(result.replayed, false);
  assert.equal(result.ticket.workspaceId, "workspace-a");
  assert.equal(result.ticket.requesterUserId, "user-a");
  assert.equal(result.ticket.status, "open");
  assert.equal(queries[0].sql, "BEGIN");
  assert.equal(queries.at(-1).sql, "COMMIT");
  assert.ok(
    queries.some(({ sql }) => sql.includes("INSERT INTO support_tickets")),
  );
  assert.ok(queries.some(({ sql }) => sql.includes("INSERT INTO audit_logs")));
  assert.ok(
    queries.some(({ sql }) => sql.includes("INSERT INTO mutation_idempotency")),
  );
  assert.equal(db.supportTickets.length, 1);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.idempotencyKeys.length, 1);
});

test("support ticket migration creates a private tenant ledger", () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "db",
      "migrations",
      "045_support_tickets.sql",
    ),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS support_tickets/);
  assert.match(migration, /organization_id text NOT NULL REFERENCES organizations/);
  assert.match(migration, /requester_user_id text NOT NULL REFERENCES users/);
  assert.match(migration, /CHECK \(status IN \('open', 'acknowledged', 'resolved'\)\)/);
  assert.match(migration, /ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE support_tickets FROM PUBLIC/);

  const importer = fs.readFileSync(
    path.join(__dirname, "migrateJsonToPostgres.js"),
    "utf8",
  );
  assert.match(importer, /INSERT INTO support_tickets/);
  assert.match(importer, /for \(const ticket of db\.supportTickets \|\| \[\]\)/);
});
