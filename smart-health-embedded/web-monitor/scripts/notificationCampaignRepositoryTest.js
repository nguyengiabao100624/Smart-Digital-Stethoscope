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
      if (/SELECT id, role, account_status, firebase_claims FROM users/i.test(normalized)) {
        const user = users.get(params[0]);
        return {
          rowCount: user ? 1 : 0,
          rows: user
            ? [{
                id: user.id,
                role: user.role,
                account_status: user.accountStatus,
                firebase_claims: {
                  profile: {
                    notificationPreferences: structuredClone(user.notificationPreferences || {}),
                  },
                },
              }]
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
      if (/SELECT \* FROM notifications WHERE id = \$1/i.test(normalized)) {
        const notification = state.notifications.get(params[0]);
        return {
          rowCount: notification ? 1 : 0,
          rows: notification ? [structuredClone(notification)] : [],
        };
      }
      if (/UPDATE notifications SET delivery_status/i.test(normalized)) {
        const notification = state.notifications.get(params[0]);
        if (!notification) return { rowCount: 0, rows: [] };
        Object.assign(notification, {
          delivery_status: params[1],
          sent_at: params[2],
          failed_at: params[3],
          retry_count: params[4],
          error_message: params[5],
          email_status: params[6],
          email_error_message: params[7],
          push_status: params[8],
          push_sent_at: params[9],
          push_failed_at: params[10],
          push_error_message: params[11],
          push_attempts: JSON.parse(params[12]),
          updated_at: "2026-07-23T08:02:00.000Z",
          emailStatus: params[6],
          pushStatus: params[8],
        });
        return { rowCount: 1, rows: [structuredClone(notification)] };
      }
      if (/INSERT INTO notifications/i.test(normalized)) {
        assert.equal(params.length, 26);
        state.notifications.set(params[0], {
          id: params[0],
          user_id: params[1],
          organization_id: params[2],
          type: params[3],
          title: params[4],
          message: params[5],
          channel: params[6],
          delivery_status: params[7],
          sent_at: params[8],
          failed_at: params[9],
          retry_count: params[10],
          error_message: params[11],
          push_status: params[12],
          push_sent_at: params[13],
          push_failed_at: params[14],
          push_error_message: params[15],
          push_attempts: JSON.parse(params[16]),
          metadata: JSON.parse(params[17]),
          read_at: params[18],
          campaign_id: params[19],
          audience_type: params[20],
          audience_role: params[21],
          requested_channels: JSON.parse(params[22]),
          in_app_status: params[23],
          email_status: params[24],
          email_error_message: params[25],
          created_at: "2026-07-23T08:00:00.000Z",
          updated_at: "2026-07-23T08:00:00.000Z",
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

test("campaign recomputes global and category opt-outs from canonical recipient accounts", async () => {
  const { db, repositories } = createFixture();
  db.users.find((user) => user.id === "usr_doctor").notificationPreferences = {
    enabled: false,
    appointments: true,
  };
  db.users.find((user) => user.id === "usr_nurse").notificationPreferences = {
    enabled: true,
    appointments: false,
  };

  const result = await repositories.notifications.createCampaignWithAudit(
    campaignInput({
      type: "appointment_scheduled",
      metadata: { preferenceKey: "appointments" },
      recipients: [
        {
          userId: "usr_doctor",
          inAppStatus: "ready",
          emailStatus: "ready",
          pushStatus: "ready",
        },
        {
          userId: "usr_nurse",
          inAppStatus: "ready",
          emailStatus: "ready",
          pushStatus: "ready",
        },
      ],
    }),
    {},
    { ...idempotency(), key: "canonical-preference-key", fingerprint: "canonical-preference" },
  );

  assert.equal(result.campaign.status, "unavailable");
  assert.deepEqual(result.campaign.channelSummary.in_app, { skipped: 2 });
  assert.deepEqual(result.campaign.channelSummary.email, { skipped: 2 });
  assert.deepEqual(result.campaign.channelSummary.push, { skipped: 2 });
  assert.ok(
    result.notifications.every(
      (notification) =>
        notification.inAppStatus === "skipped" &&
        notification.emailStatus === "skipped" &&
        notification.pushStatus === "skipped",
    ),
  );
  assert.equal(
    result.notifications.find((notification) => notification.userId === "usr_doctor").pushErrorMessage,
    "NOTIFICATION_PREFERENCES_DISABLED",
  );
  assert.equal(
    result.notifications.find((notification) => notification.userId === "usr_nurse").pushErrorMessage,
    "NOTIFICATION_PREFERENCE_DISABLED",
  );
  assert.equal(db.auditLogs[0].metadata.channelSummary.in_app.skipped, 2);
});

test("delivery status can record a fail-closed outcome after membership revoke without retargeting content", async () => {
  const { db, repositories } = createFixture();
  const campaign = await repositories.notifications.createCampaignWithAudit(
    campaignInput({ recipients: [{ userId: "usr_doctor", emailStatus: "ready", pushStatus: "ready" }] }),
    {},
    { ...idempotency(), key: "delivery-status-campaign", fingerprint: "delivery-status-campaign" },
  );
  const notification = campaign.notifications[0];
  const originalTitle = notification.title;
  db.memberships = db.memberships.filter(
    (membership) =>
      !(membership.userId === "usr_doctor" && membership.organizationId === "org_alpha"),
  );

  const updated = await repositories.notifications.updateDeliveryStatus({
    ...notification,
    title: "must-not-overwrite-content",
    emailStatus: "skipped",
    emailErrorMessage: "NOTIFICATION_EMAIL_WORKSPACE_ACCESS_REVOKED",
  });

  assert.equal(updated.title, originalTitle);
  assert.equal(updated.emailStatus, "skipped");
  assert.equal(updated.emailErrorMessage, "NOTIFICATION_EMAIL_WORKSPACE_ACCESS_REVOKED");
  await assert.rejects(
    repositories.notifications.updateDeliveryStatus({
      ...updated,
      userId: "usr_nurse",
      pushStatus: "sent",
    }),
    (error) => error.code === "NOTIFICATION_DELIVERY_BINDING_MISMATCH",
  );
  assert.equal(db.notifications[0].userId, "usr_doctor");
  assert.equal(db.notifications[0].pushStatus, "ready");
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

test("PostgreSQL delivery status update preserves immutable notification binding and content", async () => {
  const { state, repositories } = createSqlFixture();
  const campaign = await repositories.notifications.createCampaignWithAudit(
    campaignInput({ recipients: [{ userId: "usr_doctor", emailStatus: "ready", pushStatus: "ready" }] }),
    {},
    { ...idempotency(), key: "sql-delivery-campaign", fingerprint: "sql-delivery-campaign" },
  );
  const notification = campaign.notifications[0];
  const updated = await repositories.notifications.updateDeliveryStatus({
    ...notification,
    title: "must-not-overwrite-sql-content",
    pushStatus: "partial",
    pushErrorMessage: "one device remains unavailable",
    pushAttempts: [{ id: "attempt_sql", status: "sent" }],
  });

  assert.equal(updated.title, notification.title);
  assert.equal(updated.userId, "usr_doctor");
  assert.equal(updated.organizationId, "org_alpha");
  assert.equal(updated.pushStatus, "partial");
  assert.equal(updated.pushAttempts.length, 1);
  assert.equal(state.notifications.get(notification.id).title, notification.title);
  await assert.rejects(
    repositories.notifications.updateDeliveryStatus({
      ...updated,
      organizationId: "org_beta",
      pushStatus: "sent",
    }),
    (error) => error.code === "NOTIFICATION_DELIVERY_BINDING_MISMATCH",
  );
});
