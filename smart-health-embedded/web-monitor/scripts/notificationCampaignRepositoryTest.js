"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRepositories } = require("../src/repositories");

function createFixture(options = {}) {
  let sequence = 0;
  let saveCount = 0;
  const db = {
    organizations: [
      { id: "org_alpha", name: "Alpha Clinic", status: "active", ownerUserId: "usr_owner" },
      { id: "org_beta", name: "Beta Clinic", status: "active", ownerUserId: "usr_beta" },
    ],
    users: [
      { id: "usr_actor", role: "admin", accountStatus: "active", email: "admin@example.test" },
      { id: "usr_doctor", role: "doctor", accountStatus: "active", email: "doctor@example.test" },
      { id: "usr_nurse", role: "nurse", accountStatus: "active", email: "nurse@example.test" },
      { id: "usr_beta", role: "doctor", accountStatus: "active", email: "beta@example.test" },
    ],
    memberships: [
      { id: "mem_doctor", organizationId: "org_alpha", userId: "usr_doctor", role: "doctor", status: "active" },
      { id: "mem_nurse", organizationId: "org_alpha", userId: "usr_nurse", role: "nurse", status: "active" },
      { id: "mem_beta", organizationId: "org_beta", userId: "usr_beta", role: "workspace_owner", status: "active" },
    ],
    notifications: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      saveCount += 1;
      if (options.failSave) throw new Error("save failed");
    },
    createId: (prefix) => `${prefix}_${++sequence}`,
    nowIso: () => "2026-07-23T08:00:00.000Z",
    getPool: () => null,
  });
  return { db, repositories, getSaveCount: () => saveCount };
}

function campaignInput(overrides = {}) {
  return {
    actorUserId: "usr_actor",
    organizationId: "org_alpha",
    audience: { type: "workspace", workspaceId: "org_alpha" },
    requestedChannels: ["in_app", "email", "push"],
    recipients: [
      { userId: "usr_doctor", emailStatus: "ready", pushStatus: "unavailable" },
      { userId: "usr_nurse", emailStatus: "no_recipient", pushStatus: "unavailable" },
    ],
    type: "warning",
    title: "Kiểm tra thiết bị",
    message: "Vui lòng kiểm tra trạng thái thiết bị.",
    ...overrides,
  };
}

function idempotency(fingerprint = "fingerprint-a") {
  return {
    scope: "usr_actor:org_alpha",
    operation: "notification.campaign.create",
    key: "notification-campaign-key",
    fingerprint,
  };
}

function createSqlFixture() {
  const runtime = createFixture();
  const state = { notifications: new Map(), audits: new Map(), idempotency: new Map(), transactions: [] };
  let snapshot = null;
  const users = new Map(runtime.db.users.map((user) => [user.id, user]));
  const organizations = new Map(runtime.db.organizations.map((workspace) => [workspace.id, workspace]));
  const memberships = new Map(
    runtime.db.memberships.map((membership) => [
      `${membership.organizationId}:${membership.userId}`,
      membership,
    ]),
  );
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized === "BEGIN") {
        snapshot = {
          notifications: new Map(state.notifications),
          audits: new Map(state.audits),
          idempotency: new Map(state.idempotency),
        };
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
          state.notifications = snapshot.notifications;
          state.audits = snapshot.audits;
          state.idempotency = snapshot.idempotency;
        }
        snapshot = null;
        state.transactions.push("ROLLBACK");
        return { rowCount: 0, rows: [] };
      }
      if (/SELECT pg_advisory_xact_lock/i.test(normalized)) return { rowCount: 1, rows: [{}] };
      if (/FROM mutation_idempotency/i.test(normalized) && /SELECT fingerprint/i.test(normalized)) {
        const entry = state.idempotency.get(`${params[0]}:${params[1]}:${params[2]}`);
        return { rowCount: entry ? 1 : 0, rows: entry ? [entry] : [] };
      }
      if (/SELECT id, status, owner_user_id FROM organizations/i.test(normalized)) {
        const workspace = organizations.get(params[0]);
        return {
          rowCount: workspace ? 1 : 0,
          rows: workspace
            ? [{ id: workspace.id, status: workspace.status, owner_user_id: workspace.ownerUserId }]
            : [],
        };
      }
      if (/SELECT id, role, account_status FROM users/i.test(normalized)) {
        const user = users.get(params[0]);
        return {
          rowCount: user ? 1 : 0,
          rows: user
            ? [{ id: user.id, role: user.role, account_status: user.accountStatus }]
            : [],
        };
      }
      if (/FROM memberships/i.test(normalized) && /FOR SHARE/i.test(normalized)) {
        const membership = memberships.get(`${params[0]}:${params[1]}`);
        return {
          rowCount: membership ? 1 : 0,
          rows: membership
            ? [{ id: membership.id, role: membership.role, status: membership.status }]
            : [],
        };
      }
      if (/INSERT INTO notifications/i.test(normalized)) {
        assert.equal(params.length, 26);
        state.notifications.set(params[0], {
          id: params[0],
          campaignId: params[19],
          audienceType: params[20],
          requestedChannels: JSON.parse(params[22]),
          emailStatus: params[24],
          pushStatus: params[12],
        });
        return { rowCount: 1, rows: [] };
      }
      if (/INSERT INTO audit_logs/i.test(normalized)) {
        state.audits.set(params[0], { id: params[0], action: params[3], resourceId: params[5] });
        return { rowCount: 1, rows: [] };
      }
      if (/INSERT INTO mutation_idempotency/i.test(normalized)) {
        const entry = {
          fingerprint: params[4],
          resource_type: params[5],
          resource_id: params[6],
          response_status: params[7],
          response_json: JSON.parse(params[8]),
        };
        state.idempotency.set(`${params[1]}:${params[2]}:${params[3]}`, entry);
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL in notification campaign test: ${normalized}`);
    },
    release() {},
  };
  const pool = { connect: async () => client };
  const repositories = createRepositories({
    getDb: () => runtime.db,
    saveDb: async () => {},
    createId: (() => {
      let sequence = 0;
      return (prefix) => `${prefix}_sql_${++sequence}`;
    })(),
    nowIso: () => "2026-07-23T08:00:00.000Z",
    getPool: () => pool,
  });
  return { state, repositories };
}

test("JSON notification campaign is recipient-scoped, audited and replay-stable", async () => {
  const { db, repositories } = createFixture();
  const first = await repositories.notifications.createCampaignWithAudit(
    campaignInput(),
    { actorUserId: "usr_actor", action: "notification.campaign.create" },
    idempotency(),
  );

  assert.equal(first.replayed, false);
  assert.equal(first.campaign.recipientCount, 2);
  assert.equal(first.campaign.status, "partial");
  assert.deepEqual(first.campaign.requestedChannels, ["in_app", "email", "push"]);
  assert.equal(db.notifications.length, 2);
  assert.equal(new Set(db.notifications.map((item) => item.userId)).size, 2);
  assert.ok(db.notifications.every((item) => item.campaignId === first.campaign.id));
  assert.ok(db.notifications.every((item) => item.inAppStatus === "ready"));
  assert.equal(db.auditLogs.filter((log) => log.action === "notification.campaign.create").length, 1);
  assert.equal(db.idempotencyKeys.length, 1);

  const replay = await repositories.notifications.createCampaignWithAudit(
    campaignInput(),
    { actorUserId: "usr_actor", action: "notification.campaign.create" },
    idempotency(),
  );
  assert.equal(replay.replayed, true);
  assert.equal(replay.campaign.id, first.campaign.id);
  assert.deepEqual(replay.campaign.notificationIds, first.campaign.notificationIds);
  assert.equal(db.notifications.length, 2);
  assert.equal(db.auditLogs.filter((log) => log.action === "notification.campaign.create").length, 1);
});

test("concurrent exact retry creates one campaign and one audit outcome", async () => {
  const { db, repositories } = createFixture();
  const [left, right] = await Promise.all([
    repositories.notifications.createCampaignWithAudit(campaignInput(), {}, idempotency()),
    repositories.notifications.createCampaignWithAudit(campaignInput(), {}, idempotency()),
  ]);
  assert.equal(left.campaign.id, right.campaign.id);
  assert.equal(Number(left.replayed) + Number(right.replayed), 1);
  assert.equal(db.notifications.length, 2);
  assert.equal(db.auditLogs.length, 1);
});

test("idempotency reuse and cross-workspace recipients fail closed", async () => {
  const { db, repositories } = createFixture();
  await repositories.notifications.createCampaignWithAudit(campaignInput(), {}, idempotency());
  await assert.rejects(
    repositories.notifications.createCampaignWithAudit(campaignInput(), {}, idempotency("fingerprint-b")),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  await assert.rejects(
    repositories.notifications.createCampaignWithAudit(
      campaignInput({ recipients: [{ userId: "usr_beta", emailStatus: "ready", pushStatus: "ready" }] }),
      {},
      { ...idempotency(), key: "cross-workspace-key", fingerprint: "cross-workspace" },
    ),
    (error) => error.code === "NOTIFICATION_AUDIENCE_TENANT_MISMATCH",
  );
  assert.equal(db.notifications.length, 2);
  assert.equal(db.auditLogs.length, 1);
});

test("JSON save failure rolls campaign, audit and idempotency state back together", async () => {
  const { db, repositories } = createFixture({ failSave: true });
  await assert.rejects(
    repositories.notifications.createCampaignWithAudit(campaignInput(), {}, idempotency()),
    /save failed/,
  );
  assert.deepEqual(db.notifications, []);
  assert.deepEqual(db.auditLogs, []);
  assert.deepEqual(db.idempotencyKeys, []);
});

test("PostgreSQL campaign path commits notifications, audit and replay ledger in one transaction", async () => {
  const { state, repositories } = createSqlFixture();
  const first = await repositories.notifications.createCampaignWithAudit(
    campaignInput(),
    { actorUserId: "usr_actor", action: "notification.campaign.create" },
    idempotency(),
  );
  assert.equal(first.replayed, false);
  assert.equal(state.notifications.size, 2);
  assert.equal(state.audits.size, 1);
  assert.equal(state.idempotency.size, 1);
  assert.deepEqual(state.transactions.slice(0, 2), ["BEGIN", "COMMIT"]);
  assert.ok(
    Array.from(state.notifications.values()).every(
      (notification) =>
        notification.campaignId === first.campaign.id &&
        notification.requestedChannels.includes("email"),
    ),
  );

  const replay = await repositories.notifications.createCampaignWithAudit(
    campaignInput(),
    { actorUserId: "usr_actor", action: "notification.campaign.create" },
    idempotency(),
  );
  assert.equal(replay.replayed, true);
  assert.equal(replay.campaign.id, first.campaign.id);
  assert.equal(state.notifications.size, 2);
  assert.equal(state.audits.size, 1);
  assert.equal(state.idempotency.size, 1);
});
