"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRepositories } = require("../src/repositories");

function createRuntimeFixture(options = {}) {
  let sequence = 0;
  const db = {
    users: [
      {
        id: "usr_self",
        firebaseUid: "firebase-self",
        email: "self@example.test",
        role: "patient",
        accountStatus: "active",
        organizationId: "org_personal",
        notificationPreferences: {
          enabled: true,
          messages: true,
          appointments: true,
        },
      },
    ],
    auditLogs: [],
    idempotencyKeys: [],
  };
  let saveCalls = 0;
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      saveCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      if (options.failSaveAt === saveCalls) throw new Error("save failed");
    },
    createId: (prefix) => `${prefix}_${++sequence}`,
    nowIso: (() => {
      let tick = 0;
      return () => `2026-07-27T08:00:0${tick++}.000Z`;
    })(),
    getPool: () => null,
  });
  return { db, repositories, getSaveCalls: () => saveCalls };
}

function auditInput(overrides = {}) {
  return {
    actorUserId: "usr_self",
    action: "notification.preferences.patch",
    authorization: {
      kind: "self",
      actorUserId: "usr_self",
    },
    ...overrides,
  };
}

function idempotency(key, fingerprint = key) {
  return {
    scope: "usr_self",
    operation: "notification.preferences.patch",
    key,
    fingerprint,
  };
}

function toSqlUser(user) {
  return {
    id: user.id,
    firebase_uid: user.firebaseUid || "",
    email: user.email || "",
    phone: "",
    role: user.role || "patient",
    name: "",
    password_hash: "",
    license: "",
    hospital: "",
    department: "",
    address: "",
    organization_id: user.organizationId || "",
    patient_id: "",
    verified_email: false,
    verified_phone: false,
    account_status: user.accountStatus || "active",
    requested_role: "",
    role_request_status: "",
    firebase_claims: {
      profile: {
        notificationPreferences: structuredClone(user.notificationPreferences || {}),
      },
    },
    created_at: "2026-07-27T08:00:00.000Z",
    updated_at: user.updatedAt || "2026-07-27T08:00:00.000Z",
  };
}

function createSqlFixture(options = {}) {
  const runtime = createRuntimeFixture();
  const sqlUsers = new Map(
    options.withoutCanonicalUser
      ? []
      : runtime.db.users.map((user) => [user.id, toSqlUser(user)]),
  );
  const state = {
    users: sqlUsers,
    audits: [],
    idempotency: new Map(),
    transactions: [],
    updateSql: [],
  };
  let snapshot = null;
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized === "BEGIN") {
        snapshot = structuredClone({
          users: Array.from(state.users.entries()),
          audits: state.audits,
          idempotency: Array.from(state.idempotency.entries()),
        });
        state.transactions.push("BEGIN");
        return { rowCount: 0, rows: [] };
      }
      if (normalized === "COMMIT") {
        snapshot = null;
        state.transactions.push("COMMIT");
        return { rowCount: 0, rows: [] };
      }
      if (normalized === "ROLLBACK") {
        if (snapshot) {
          state.users = new Map(snapshot.users);
          state.audits = snapshot.audits;
          state.idempotency = new Map(snapshot.idempotency);
        }
        snapshot = null;
        state.transactions.push("ROLLBACK");
        return { rowCount: 0, rows: [] };
      }
      if (/SELECT pg_advisory_xact_lock/i.test(normalized)) {
        return { rowCount: 1, rows: [{}] };
      }
      if (/SELECT \* FROM users WHERE \(?id = \$1 OR firebase_uid = \$1 OR lower\(email\)/i.test(normalized)) {
        const identifier = String(params[0] || "").toLowerCase();
        const row = Array.from(state.users.values()).find(
          (candidate) =>
            candidate.id === params[0] ||
            candidate.firebase_uid === params[0] ||
            String(candidate.email || "").toLowerCase() === identifier,
        );
        return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
      }
      if (/SELECT \* FROM users WHERE id = \$1 LIMIT 1/i.test(normalized)) {
        const row = state.users.get(params[0]);
        return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
      }
      if (/SELECT id, role, account_status FROM users WHERE id = \$1/i.test(normalized)) {
        const row = state.users.get(params[0]);
        return {
          rowCount: row ? 1 : 0,
          rows: row
            ? [{ id: row.id, role: row.role, account_status: row.account_status }]
            : [],
        };
      }
      if (/FROM mutation_idempotency/i.test(normalized) && /SELECT fingerprint/i.test(normalized)) {
        const entry = state.idempotency.get(`${params[0]}:${params[1]}:${params[2]}`);
        return { rowCount: entry ? 1 : 0, rows: entry ? [structuredClone(entry)] : [] };
      }
      if (/UPDATE users SET firebase_claims/i.test(normalized)) {
        assert.match(normalized, /jsonb_build_object\(\$2::text, \$3::boolean\)/i);
        state.updateSql.push(normalized);
        const row = state.users.get(params[0]);
        if (!row) return { rowCount: 0, rows: [] };
        row.firebase_claims.profile.notificationPreferences = {
          ...row.firebase_claims.profile.notificationPreferences,
          [params[1]]: params[2],
        };
        row.updated_at = `2026-07-27T08:01:0${state.updateSql.length}.000Z`;
        return { rowCount: 1, rows: [structuredClone(row)] };
      }
      if (/INSERT INTO audit_logs/i.test(normalized)) {
        state.audits.push({ id: params[0], action: params[3], resourceId: params[5] });
        return { rowCount: 1, rows: [] };
      }
      if (/INSERT INTO mutation_idempotency/i.test(normalized)) {
        state.idempotency.set(`${params[1]}:${params[2]}:${params[3]}`, {
          fingerprint: params[4],
          resource_type: params[5],
          resource_id: params[6],
          response_status: params[7],
          response_json: JSON.parse(params[8]),
        });
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL in notification preference repository test: ${normalized}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
    query: (sql, params) => client.query(sql, params),
  };
  const repositories = createRepositories({
    getDb: () => runtime.db,
    saveDb: async () => {},
    createId: (() => {
      let sequence = 0;
      return (prefix) => `${prefix}_sql_${++sequence}`;
    })(),
    nowIso: () => "2026-07-27T08:00:00.000Z",
    getPool: () => pool,
  });
  return { db: runtime.db, repositories, state };
}

test("runtime notification preference mutations serialize per account without losing different fields", async () => {
  const { db, repositories } = createRuntimeFixture();

  const [messages, appointments] = await Promise.all([
    repositories.users.patchNotificationPreferenceWithAudit(
      "usr_self",
      "messages",
      false,
      auditInput(),
      idempotency("messages-off"),
    ),
    repositories.users.patchNotificationPreferenceWithAudit(
      "firebase-self",
      "appointments",
      false,
      auditInput(),
      idempotency("appointments-off"),
    ),
  ]);

  assert.equal(messages.replayed, false);
  assert.equal(appointments.replayed, false);
  assert.equal(db.users[0].notificationPreferences.messages, false);
  assert.equal(db.users[0].notificationPreferences.appointments, false);
  assert.equal(db.auditLogs.filter((entry) => entry.action === "notification.preferences.patch").length, 2);
  assert.equal(db.idempotencyKeys.length, 2);
});

test("runtime save failure restores user, audit and idempotency state exactly", async () => {
  const { db, repositories } = createRuntimeFixture({ failSaveAt: 1 });
  const before = structuredClone(db);

  await assert.rejects(
    repositories.users.patchNotificationPreferenceWithAudit(
      "usr_self",
      "messages",
      false,
      auditInput(),
      idempotency("messages-save-failure"),
    ),
    /save failed/,
  );

  assert.deepEqual(db, before);
});

test("delayed idempotency replay returns the original confirmed preference outcome", async () => {
  const { db, repositories } = createRuntimeFixture();
  const first = await repositories.users.patchNotificationPreferenceWithAudit(
    "usr_self",
    "messages",
    false,
    auditInput(),
    idempotency("messages-original", "messages:false"),
  );
  await repositories.users.patchNotificationPreferenceWithAudit(
    "usr_self",
    "messages",
    true,
    auditInput(),
    idempotency("messages-opposite", "messages:true"),
  );

  const replay = await repositories.users.patchNotificationPreferenceWithAudit(
    "usr_self",
    "messages",
    false,
    auditInput(),
    idempotency("messages-original", "messages:false"),
  );

  assert.equal(db.users[0].notificationPreferences.messages, true);
  assert.equal(first.preferences.messages, false);
  assert.equal(replay.preferences.messages, false);
  assert.equal(replay.updatedAt, first.updatedAt);
  assert.equal(replay.replayed, true);
  assert.equal(db.auditLogs.length, 2);
  assert.equal(db.idempotencyKeys.length, 2);
});

test("notification preference receipt rejects fingerprint reuse", async () => {
  const { repositories } = createRuntimeFixture();
  await repositories.users.patchNotificationPreferenceWithAudit(
    "usr_self",
    "messages",
    false,
    auditInput(),
    idempotency("messages-conflict", "messages:false"),
  );

  await assert.rejects(
    repositories.users.patchNotificationPreferenceWithAudit(
      "usr_self",
      "messages",
      false,
      auditInput(),
      idempotency("messages-conflict", "messages:true"),
    ),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});

test("notification preference mutation requires self authorization and an active account", async () => {
  const { db, repositories } = createRuntimeFixture();
  await assert.rejects(
    repositories.users.patchNotificationPreferenceWithAudit(
      "usr_self",
      "messages",
      false,
      auditInput({
        authorization: { kind: "self", actorUserId: "usr_other" },
      }),
      idempotency("messages-cross-account"),
    ),
    (error) => error.code === "ACCOUNT_SCOPE_DENIED",
  );
  await assert.rejects(
    repositories.users.patchNotificationPreferenceWithAudit(
      "usr_self",
      "messages",
      false,
      { actorUserId: "usr_self" },
      idempotency("messages-no-authorization"),
    ),
    (error) => error.code === "ACCOUNT_SCOPE_DENIED",
  );

  db.users[0].accountStatus = "locked";
  await assert.rejects(
    repositories.users.patchNotificationPreferenceWithAudit(
      "usr_self",
      "messages",
      false,
      auditInput(),
      idempotency("messages-locked"),
    ),
    (error) => error.code === "ACCOUNT_INACTIVE",
  );
  assert.deepEqual(db.auditLogs, []);
  assert.deepEqual(db.idempotencyKeys, []);
});

test("PostgreSQL updates one JSONB preference key atomically and replays the original outcome", async () => {
  const { repositories, state } = createSqlFixture();
  const first = await repositories.users.patchNotificationPreferenceWithAudit(
    "self@example.test",
    "messages",
    false,
    auditInput(),
    idempotency("sql-messages-original", "messages:false"),
  );
  await repositories.users.patchNotificationPreferenceWithAudit(
    "usr_self",
    "messages",
    true,
    auditInput(),
    idempotency("sql-messages-opposite", "messages:true"),
  );
  const replay = await repositories.users.patchNotificationPreferenceWithAudit(
    "usr_self",
    "messages",
    false,
    auditInput(),
    idempotency("sql-messages-original", "messages:false"),
  );

  assert.equal(state.users.get("usr_self").firebase_claims.profile.notificationPreferences.messages, true);
  assert.equal(first.preferences.messages, false);
  assert.equal(replay.preferences.messages, false);
  assert.equal(replay.updatedAt, first.updatedAt);
  assert.equal(replay.replayed, true);
  assert.equal(state.updateSql.length, 2);
  assert.equal(state.audits.length, 2);
  assert.equal(state.idempotency.size, 2);
  assert.deepEqual(state.transactions, ["BEGIN", "COMMIT", "BEGIN", "COMMIT", "BEGIN", "COMMIT"]);
});

test("PostgreSQL missing canonical user removes the stale runtime identity", async () => {
  const { db, repositories } = createSqlFixture({ withoutCanonicalUser: true });
  const result = await repositories.users.patchNotificationPreferenceWithAudit(
    "usr_self",
    "messages",
    false,
    auditInput(),
    idempotency("sql-stale-user"),
  );

  assert.equal(result, null);
  assert.equal(db.users.some((user) => user.id === "usr_self"), false);
});

test("canonical account lookup evicts a stale runtime user when PostgreSQL no longer has it", async () => {
  const { db, repositories } = createSqlFixture({ withoutCanonicalUser: true });
  const result = await repositories.users.findById("usr_self");

  assert.equal(result, null);
  assert.equal(db.users.some((user) => user.id === "usr_self"), false);
});
