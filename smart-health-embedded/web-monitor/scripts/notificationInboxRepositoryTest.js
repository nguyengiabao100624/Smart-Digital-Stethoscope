"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRepositories } = require("../src/repositories");

function notification(overrides = {}) {
  return {
    id: "notification-current",
    userId: "user-current",
    organizationId: "workspace-current",
    type: "info",
    title: "Shcare update",
    message: "A backend-confirmed inbox item.",
    requestedChannels: ["in_app"],
    inAppStatus: "ready",
    emailStatus: "skipped",
    pushStatus: "skipped",
    read: false,
    readAt: "",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    ...overrides,
  };
}

function createRuntimeFixture(options = {}) {
  let sequence = 0;
  let clock = 0;
  let saveCalls = 0;
  const db = {
    users: [
      {
        id: "user-current",
        role: "doctor",
        accountStatus: "active",
        organizationId: "workspace-current",
      },
      {
        id: "user-other",
        role: "doctor",
        accountStatus: "active",
        organizationId: "workspace-current",
      },
    ],
    notifications: [
      notification(),
      notification({
        id: "notification-account-wide",
        organizationId: "",
        title: "Account security update",
      }),
      notification({
        id: "notification-old-workspace",
        organizationId: "workspace-old",
      }),
      notification({
        id: "notification-other-user",
        userId: "user-other",
      }),
      notification({
        id: "notification-provider-skipped",
        inAppStatus: "skipped",
      }),
    ],
    auditLogs: [],
    idempotencyKeys: [],
  };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      saveCalls += 1;
      if (options.failSaveAt === saveCalls) {
        throw new Error("save failed");
      }
    },
    createId: (prefix) => `${prefix}_${++sequence}`,
    nowIso: () => `2026-07-29T08:00:0${clock++}.000Z`,
    getPool: () => null,
  });
  return { db, repositories };
}

function toSqlNotificationRow(item) {
  return {
    id: item.id,
    user_id: item.userId,
    organization_id: item.organizationId || null,
    type: item.type,
    title: item.title,
    message: item.message,
    channel: "in_app",
    delivery_status: "ready",
    sent_at: null,
    failed_at: null,
    retry_count: 0,
    error_message: "",
    campaign_id: item.campaignId || "",
    audience_type: item.audienceType || "direct",
    audience_role: item.audienceRole || "doctor",
    requested_channels: item.requestedChannels,
    in_app_status: item.inAppStatus,
    email_status: item.emailStatus,
    email_error_message: "",
    push_status: item.pushStatus,
    push_sent_at: null,
    push_failed_at: null,
    push_error_message: "",
    push_attempts: [],
    metadata: {},
    read_at: item.readAt || null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function createSqlFixture(options = {}) {
  let sequence = 0;
  let clock = 0;
  let database = {
    users: [
      {
        id: "user-current",
        account_status: "active",
      },
    ],
    notifications: [
      toSqlNotificationRow(notification()),
      toSqlNotificationRow(
        notification({
          id: "notification-account-wide",
          organizationId: "",
          title: "Account security update",
        }),
      ),
      toSqlNotificationRow(
        notification({
          id: "notification-other-user",
          userId: "user-other",
        }),
      ),
    ],
    auditLogs: [],
    idempotencyKeys: [],
  };
  let transaction = null;
  const calls = [];
  const runtimeDb = {
    users: [],
    notifications: [],
    auditLogs: [],
    idempotencyKeys: [],
  };

  function activeDatabase() {
    return transaction || database;
  }

  const client = {
    async query(sql, parameters = []) {
      const statement = String(sql).replace(/\s+/g, " ").trim();
      calls.push(statement);

      if (statement === "BEGIN") {
        assert.equal(transaction, null);
        transaction = structuredClone(database);
        return { rows: [] };
      }
      if (statement === "COMMIT") {
        assert.ok(transaction);
        database = transaction;
        transaction = null;
        return { rows: [] };
      }
      if (statement === "ROLLBACK") {
        transaction = null;
        return { rows: [] };
      }
      if (statement.includes("pg_advisory_xact_lock")) {
        return { rows: [] };
      }
      if (
        statement.includes("FROM mutation_idempotency") &&
        statement.includes("idempotency_key = $3")
      ) {
        const [scope, operation, key] = parameters;
        const row = activeDatabase().idempotencyKeys.find(
          (entry) =>
            entry.scope === scope &&
            entry.operation === operation &&
            entry.idempotency_key === key,
        );
        return { rows: row ? [structuredClone(row)] : [] };
      }
      if (
        statement.includes("SELECT id, account_status") &&
        statement.includes("FROM users")
      ) {
        const row = activeDatabase().users.find(
          (user) => user.id === parameters[0],
        );
        return { rows: row ? [structuredClone(row)] : [] };
      }
      if (
        statement.includes("SELECT *") &&
        statement.includes("FROM notifications") &&
        statement.includes("WHERE user_id = $1")
      ) {
        const [userId, workspaceId] = parameters;
        const rows = activeDatabase().notifications
          .filter(
            (row) =>
              row.user_id === userId &&
              (
                row.organization_id === workspaceId ||
                row.organization_id === null ||
                row.organization_id === ""
              ) &&
              !["skipped", "skipped_preference", "disabled"].includes(
                row.in_app_status || "ready",
              ),
          )
          .sort((left, right) =>
            String(right.created_at).localeCompare(String(left.created_at)),
          )
          .slice(0, 200);
        return { rows: structuredClone(rows) };
      }
      if (
        statement.startsWith("UPDATE notifications") &&
        statement.includes("WHERE id = $1") &&
        statement.includes("RETURNING *")
      ) {
        const [id, updatedAt] = parameters;
        const row = activeDatabase().notifications.find(
          (candidate) => candidate.id === id,
        );
        assert.ok(row);
        row.read_at = row.read_at || updatedAt;
        row.updated_at = updatedAt;
        return { rows: [structuredClone(row)] };
      }
      if (
        statement.startsWith("UPDATE notifications") &&
        statement.includes("WHERE id = ANY")
      ) {
        const [ids, updatedAt] = parameters;
        for (const row of activeDatabase().notifications) {
          if (!ids.includes(row.id)) continue;
          row.read_at = row.read_at || updatedAt;
          row.updated_at = updatedAt;
        }
        return { rows: [] };
      }
      if (
        statement.startsWith("DELETE FROM notifications") &&
        statement.includes("RETURNING *")
      ) {
        const index = activeDatabase().notifications.findIndex(
          (row) => row.id === parameters[0],
        );
        assert.notEqual(index, -1);
        const [row] = activeDatabase().notifications.splice(index, 1);
        return { rows: [structuredClone(row)] };
      }
      if (statement.startsWith("INSERT INTO audit_logs")) {
        if (options.failAuditInsert) {
          throw new Error("forced PostgreSQL audit failure");
        }
        activeDatabase().auditLogs.push({
          id: parameters[0],
          actor_user_id: parameters[1],
          organization_id: parameters[2],
          action: parameters[3],
          resource_type: parameters[4],
          resource_id: parameters[5],
          metadata: JSON.parse(parameters[8]),
        });
        return { rows: [] };
      }
      if (statement.startsWith("INSERT INTO mutation_idempotency")) {
        activeDatabase().idempotencyKeys.push({
          id: parameters[0],
          scope: parameters[1],
          operation: parameters[2],
          idempotency_key: parameters[3],
          fingerprint: parameters[4],
          resource_type: parameters[5],
          resource_id: parameters[6],
          response_status: parameters[7],
          response_json: JSON.parse(parameters[8]),
        });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in notification inbox test: ${statement}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
  };
  const repositories = createRepositories({
    getDb: () => runtimeDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_sql_${++sequence}`,
    nowIso: () => `2026-07-29T09:00:0${clock++}.000Z`,
    getPool: () => pool,
  });
  return {
    calls,
    repositories,
    state: () => database,
  };
}

function auditInput(overrides = {}) {
  return {
    actorUserId: "user-current",
    organizationId: "workspace-current",
    authorization: {
      kind: "self",
      actorUserId: "user-current",
    },
    ip: "127.0.0.1",
    userAgent: "notification-inbox-test",
    ...overrides,
  };
}

function idempotency(action, key, notificationId = "") {
  return {
    scope: "user-current:workspace-current",
    operation: `notification.inbox.${action}`,
    key,
    fingerprint: JSON.stringify({
      action,
      notificationId,
      userId: "user-current",
      workspaceId: "workspace-current",
    }),
  };
}

function mutation(action, notificationId = "") {
  return {
    action,
    notificationId,
    userId: "user-current",
    workspaceId: "workspace-current",
  };
}

test("PostgreSQL empty notification result never falls back to stale JSON rows", async () => {
  const stale = notification({ id: "stale-runtime-row" });
  const db = { notifications: [stale], auditLogs: [], idempotencyKeys: [] };
  const pool = {
    query: async (sql) => {
      assert.match(String(sql), /SELECT \* FROM notifications/i);
      return { rows: [] };
    },
  };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_1`,
    nowIso: () => "2026-07-29T08:00:00.000Z",
    getPool: () => pool,
  });

  const result = await repositories.notifications.list();

  assert.deepEqual(result, []);
  assert.deepEqual(db.notifications, []);
});

test("personal inbox list binds every item to the exact account and active workspace", async () => {
  const { repositories } = createRuntimeFixture();

  const result = await repositories.notifications.listInbox({
    userId: "user-current",
    workspaceId: "workspace-current",
  });

  assert.deepEqual(
    result.map((item) => item.id),
    ["notification-current", "notification-account-wide"],
  );
  assert.ok(result.every((item) => item.userId === "user-current"));
  assert.ok(result.every((item) => item.workspaceId === "workspace-current"));
  assert.ok(
    result.every(
      (item) =>
        item.organizationId === "" ||
        item.organizationId === "workspace-current",
    ),
  );
});

test("read mutation is atomic, owner-bound and replay-stable", async () => {
  const { db, repositories } = createRuntimeFixture();
  const input = mutation("read", "notification-current");
  const receipt = idempotency("read", "read-current", input.notificationId);

  const first = await repositories.notifications.mutateInboxWithAudit(
    input,
    auditInput(),
    receipt,
  );
  const replay = await repositories.notifications.mutateInboxWithAudit(
    input,
    auditInput(),
    receipt,
  );

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.notification.id, "notification-current");
  assert.equal(first.notification.read, true);
  assert.equal(replay.notification.readAt, first.notification.readAt);
  assert.deepEqual(first.affectedIds, ["notification-current"]);
  assert.equal(first.notifications.some((item) => item.id === "notification-old-workspace"), false);
  assert.equal(first.notifications.some((item) => item.id === "notification-other-user"), false);
  assert.equal(db.auditLogs.filter((entry) => entry.action === "notification.read").length, 1);
  assert.equal(db.idempotencyKeys.length, 1);
});

test("cross-account and stale-workspace notification mutations fail closed", async () => {
  const { db, repositories } = createRuntimeFixture();

  await assert.rejects(
    repositories.notifications.mutateInboxWithAudit(
      mutation("read", "notification-old-workspace"),
      auditInput(),
      idempotency("read", "read-old-workspace", "notification-old-workspace"),
    ),
    (error) => error.code === "NOTIFICATION_INBOX_ITEM_NOT_FOUND",
  );
  await assert.rejects(
    repositories.notifications.mutateInboxWithAudit(
      mutation("delete", "notification-other-user"),
      auditInput(),
      idempotency("delete", "delete-other-user", "notification-other-user"),
    ),
    (error) => error.code === "NOTIFICATION_INBOX_ITEM_NOT_FOUND",
  );
  await assert.rejects(
    repositories.notifications.mutateInboxWithAudit(
      mutation("read", "notification-current"),
      auditInput({
        actorUserId: "user-other",
        authorization: { kind: "self", actorUserId: "user-other" },
      }),
      idempotency("read", "cross-account-actor", "notification-current"),
    ),
    (error) => error.code === "NOTIFICATION_INBOX_SCOPE_DENIED",
  );

  assert.equal(db.notifications.find((item) => item.id === "notification-current").read, false);
  assert.equal(db.auditLogs.length, 0);
  assert.equal(db.idempotencyKeys.length, 0);
});

test("read-all and delete return a canonical snapshot instead of a local success guess", async () => {
  const { db, repositories } = createRuntimeFixture();
  const readAll = await repositories.notifications.mutateInboxWithAudit(
    mutation("read_all"),
    auditInput(),
    idempotency("read_all", "read-all-current"),
  );

  assert.deepEqual(
    readAll.affectedIds.sort(),
    ["notification-account-wide", "notification-current"],
  );
  assert.ok(readAll.notifications.every((item) => item.read));
  assert.equal(
    db.notifications.find((item) => item.id === "notification-old-workspace").read,
    false,
  );

  const deleted = await repositories.notifications.mutateInboxWithAudit(
    mutation("delete", "notification-current"),
    auditInput(),
    idempotency("delete", "delete-current", "notification-current"),
  );

  assert.equal(deleted.deletedId, "notification-current");
  assert.equal(deleted.notification.userId, "user-current");
  assert.equal(deleted.notification.workspaceId, "workspace-current");
  assert.equal(deleted.notifications.some((item) => item.id === "notification-current"), false);
  assert.equal(db.notifications.some((item) => item.id === "notification-current"), false);
});

test("runtime save failure restores notification, audit and replay ledgers together", async () => {
  const { db, repositories } = createRuntimeFixture({ failSaveAt: 1 });
  const before = structuredClone(db);

  await assert.rejects(
    repositories.notifications.mutateInboxWithAudit(
      mutation("delete", "notification-current"),
      auditInput(),
      idempotency("delete", "delete-save-failure", "notification-current"),
    ),
    /save failed/,
  );

  assert.deepEqual(db, before);
});

test("PostgreSQL read commits notification, audit and replay receipt in one transaction", async () => {
  const { calls, repositories, state } = createSqlFixture();
  const input = mutation("read", "notification-current");
  const receipt = idempotency("read", "sql-read-current", input.notificationId);

  const first = await repositories.notifications.mutateInboxWithAudit(
    input,
    auditInput(),
    receipt,
  );
  const replay = await repositories.notifications.mutateInboxWithAudit(
    input,
    auditInput(),
    receipt,
  );

  assert.equal(first.replayed, false);
  assert.equal(first.notification.read, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.notification.readAt, first.notification.readAt);
  assert.equal(
    state().notifications.find((row) => row.id === "notification-current")
      .read_at,
    first.notification.readAt,
  );
  assert.equal(state().auditLogs.length, 1);
  assert.equal(state().idempotencyKeys.length, 1);
  assert.equal(calls.filter((statement) => statement === "BEGIN").length, 2);
  assert.equal(calls.filter((statement) => statement === "COMMIT").length, 2);
  assert.equal(calls.filter((statement) => statement === "ROLLBACK").length, 0);
});

test("PostgreSQL audit failure rolls notification and replay state back together", async () => {
  const { calls, repositories, state } = createSqlFixture({
    failAuditInsert: true,
  });
  const before = structuredClone(state());

  await assert.rejects(
    repositories.notifications.mutateInboxWithAudit(
      mutation("delete", "notification-current"),
      auditInput(),
      idempotency(
        "delete",
        "sql-delete-audit-failure",
        "notification-current",
      ),
    ),
    /forced PostgreSQL audit failure/,
  );

  assert.deepEqual(state(), before);
  assert.equal(calls.filter((statement) => statement === "COMMIT").length, 0);
  assert.equal(calls.filter((statement) => statement === "ROLLBACK").length, 1);
});
