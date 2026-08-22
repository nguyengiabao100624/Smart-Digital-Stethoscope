"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRepositories } = require("../src/repositories");

function isoFromNow(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function enrollment(overrides = {}) {
  return {
    id: "enroll_usr_alpha",
    userId: "usr_alpha",
    method: "app",
    secretCiphertext: "ciphertext-only",
    secretIv: "iv-only",
    secretTag: "tag-only",
    secretVersion: 1,
    attempts: 0,
    maxAttempts: 5,
    createdAt: isoFromNow(-60_000),
    expiresAt: isoFromNow(600_000),
    consumedAt: null,
    verifiedAt: null,
    pendingActivation: null,
    startIntent: {
      version: 1,
      idempotencyKeyHash: "A".repeat(43),
      primaryBindingHash: "B".repeat(43),
      method: "app",
      superseded: false,
    },
    ...overrides,
  };
}

function pendingActivation(overrides = {}) {
  const delivery = {
    id: "recovery_delivery_alpha",
    operationHash: "operation-hash-alpha",
    primaryBindingHash: "primary-binding-alpha",
    acknowledgementKeyHash: "ack-key-hash-alpha",
    recoveryAckTokenHash: "recovery-ack-token-hash-alpha",
    expiresAt: isoFromNow(300_000),
    acknowledgedAt: null,
    ...(overrides.delivery || {}),
  };
  return {
    userId: "usr_alpha",
    enrollmentId: "enroll_usr_alpha",
    credentialId: "credential_usr_alpha",
    recoverySalt: "recovery-salt-alpha",
    recoveryCodes: [
      { hash: "recovery-hash-one", usedAt: null, delivery },
      { hash: "recovery-hash-two", usedAt: null },
    ],
    recoveryAckTokenHash: delivery.recoveryAckTokenHash,
    lastUsedTimeStep: 18,
    verifiedAt: isoFromNow(-1_000),
    ...overrides,
    delivery,
  };
}

function completionInput(pending, overrides = {}) {
  return {
    userId: pending.userId,
    enrollmentId: pending.enrollmentId,
    deliveryId: pending.delivery.id,
    operationHash: pending.delivery.operationHash,
    primaryBindingHash: pending.delivery.primaryBindingHash,
    acknowledgementKeyHash: pending.delivery.acknowledgementKeyHash,
    recoveryAckTokenHash: pending.recoveryAckTokenHash,
    tokenRecord: {
      id: "two_factor_token_alpha",
      userId: pending.userId,
      tokenHash: "bounded-token-hash-alpha",
      primaryBindingHash: pending.delivery.primaryBindingHash,
      createdAt: isoFromNow(-500),
      expiresAt: isoFromNow(300_000),
      lastUsedAt: null,
      revokedAt: null,
    },
    auditInput: {
      organizationId: "org_alpha",
      ip: "127.0.0.1",
      userAgent: "repository-test",
    },
    ...overrides,
  };
}

function createRuntimeFixture(options = {}) {
  const db = {
    users: [
      {
        id: "usr_alpha",
        organizationId: "org_alpha",
        twoFactorEnabled: false,
        twoFactorMethod: "",
        firebaseClaims: { profile: { twoFactorEnabled: false, twoFactorMethod: "" } },
      },
    ],
    auditLogs: [],
    twoFactorCredentials: [],
    twoFactorEnrollments: [enrollment()],
    twoFactorChallenges: [],
    twoFactorTokens: [],
  };
  let saveCalls = 0;
  let idSequence = 0;
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      saveCalls += 1;
      if (saveCalls === options.failSaveAt) throw new Error("injected save failure");
    },
    createId: (prefix) => `${prefix}_runtime_${++idSequence}`,
    nowIso: () => new Date().toISOString(),
    getPool: () => null,
  });
  return { db, repositories, getSaveCalls: () => saveCalls };
}

function toSqlEnrollment(record) {
  return {
    id: record.id,
    user_id: record.userId,
    method: record.method,
    secret_ciphertext: record.secretCiphertext,
    secret_iv: record.secretIv,
    secret_tag: record.secretTag,
    secret_version: record.secretVersion,
    attempts: record.attempts,
    max_attempts: record.maxAttempts,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
    consumed_at: record.consumedAt,
    verified_at: record.verifiedAt,
    pending_activation: record.pendingActivation,
    start_intent: record.startIntent,
  };
}

function createSqlFixture(options = {}) {
  const runtimeDb = {
    users: [{ id: "usr_alpha", organizationId: "org_alpha" }],
    auditLogs: [],
    twoFactorCredentials: [],
    twoFactorEnrollments: [],
    twoFactorChallenges: [],
    twoFactorTokens: [],
  };
  const state = {
    enrollment: toSqlEnrollment(enrollment()),
    credential: null,
    token: null,
    audits: [],
    transactions: [],
    statements: [],
    userEnabled: false,
  };
  let transactionSnapshot = null;
  let idSequence = 0;
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      state.statements.push(normalized);
      if (normalized === "BEGIN") {
        transactionSnapshot = structuredClone({
          enrollment: state.enrollment,
          credential: state.credential,
          token: state.token,
          audits: state.audits,
          userEnabled: state.userEnabled,
        });
        state.transactions.push("BEGIN");
        return { rowCount: 0, rows: [] };
      }
      if (normalized === "COMMIT") {
        transactionSnapshot = null;
        state.transactions.push("COMMIT");
        return { rowCount: 0, rows: [] };
      }
      if (normalized === "ROLLBACK") {
        Object.assign(state, transactionSnapshot || {});
        transactionSnapshot = null;
        state.transactions.push("ROLLBACK");
        return { rowCount: 0, rows: [] };
      }
      if (/SELECT pg_advisory_xact_lock/i.test(normalized)) {
        return { rowCount: 1, rows: [{}] };
      }
      if (/SELECT \* FROM two_factor_enrollments WHERE id = \$1 AND user_id = \$2 FOR UPDATE/i.test(normalized)) {
        const matches = state.enrollment?.id === params[0] && state.enrollment?.user_id === params[1];
        return { rowCount: matches ? 1 : 0, rows: matches ? [structuredClone(state.enrollment)] : [] };
      }
      if (/UPDATE two_factor_enrollments SET pending_activation = \$3::jsonb/i.test(normalized)) {
        state.enrollment.pending_activation = JSON.parse(params[2]);
        state.enrollment.verified_at = params[3];
        state.enrollment.expires_at = params[4];
        return { rowCount: 1, rows: [structuredClone(state.enrollment)] };
      }
      if (/INSERT INTO two_factor_credentials/i.test(normalized)) {
        state.credential = {
          id: "credential_usr_alpha",
          user_id: params[0],
          method: "app",
          enrollment_id: params[1],
          secret_ciphertext: params[2],
          secret_iv: params[3],
          secret_tag: params[4],
          secret_version: params[5],
          recovery_salt: params[6],
          recovery_codes: JSON.parse(params[7]),
          last_used_time_step: params[8],
          disable_attempts: 0,
          disable_locked_until: null,
          enabled_at: params[9],
          updated_at: params[9],
          disabled_at: null,
          version: 1,
        };
        return { rowCount: 1, rows: [structuredClone(state.credential)] };
      }
      if (/INSERT INTO two_factor_tokens/i.test(normalized)) {
        state.token = {
          id: params[0],
          user_id: params[1],
          token_hash: params[2],
          primary_binding_hash: params[3],
          created_at: params[4],
          expires_at: params[5],
          last_used_at: null,
          revoked_at: null,
        };
        return { rowCount: 1, rows: [] };
      }
      if (/UPDATE two_factor_enrollments SET consumed_at = \$3, pending_activation = NULL/i.test(normalized)) {
        state.enrollment.consumed_at = params[2];
        state.enrollment.pending_activation = null;
        return { rowCount: 1, rows: [structuredClone(state.enrollment)] };
      }
      if (/UPDATE users SET firebase_claims = jsonb_set/i.test(normalized)) {
        state.userEnabled = true;
        return { rowCount: 1, rows: [] };
      }
      if (/INSERT INTO audit_logs/i.test(normalized)) {
        if (options.failEnableAudit && params[3] === "account.2fa.enable") {
          throw new Error("injected audit failure");
        }
        state.audits.push({ id: params[0], action: params[3], resourceId: params[5] });
        return { rowCount: 1, rows: [] };
      }
      if (/SELECT \* FROM two_factor_credentials WHERE user_id = \$1 AND disabled_at IS NULL FOR UPDATE/i.test(normalized)) {
        return { rowCount: state.credential ? 1 : 0, rows: state.credential ? [structuredClone(state.credential)] : [] };
      }
      if (/SELECT \* FROM two_factor_tokens WHERE id = \$1 AND user_id = \$2 LIMIT 1/i.test(normalized)) {
        const matches = state.token?.id === params[0] && state.token?.user_id === params[1];
        return { rowCount: matches ? 1 : 0, rows: matches ? [structuredClone(state.token)] : [] };
      }
      throw new Error(`Unexpected SQL in 2FA pending activation test: ${normalized}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
    query: (sql, params) => client.query(sql, params),
  };
  const repositories = createRepositories({
    getDb: () => runtimeDb,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_sql_${++idSequence}`,
    nowIso: () => new Date().toISOString(),
    getPool: () => pool,
  });
  return { repositories, runtimeDb, state };
}

test("JSON repository stages recovery delivery without enabling and exact concurrent ACK enables once", async () => {
  const { db, repositories } = createRuntimeFixture();
  const pending = pendingActivation();

  const staged = await repositories.twoFactor.stageEnrollmentVerification({
    userId: pending.userId,
    enrollmentId: pending.enrollmentId,
    pendingActivation: pending,
    auditInput: { organizationId: "org_alpha" },
  });
  const stagedReplay = await repositories.twoFactor.stageEnrollmentVerification({
    userId: pending.userId,
    enrollmentId: pending.enrollmentId,
    pendingActivation: pending,
    auditInput: { organizationId: "org_alpha" },
  });

  assert.equal(staged.replayed, false);
  assert.equal(stagedReplay.replayed, true);
  assert.equal(db.twoFactorCredentials.length, 0);
  assert.equal(db.twoFactorTokens.length, 0);
  assert.equal(db.users[0].twoFactorEnabled, false);
  assert.equal(db.auditLogs.filter((entry) => entry.action === "account.2fa.enrollment.verified").length, 1);
  assert.equal(db.auditLogs.filter((entry) => entry.action === "account.2fa.enable").length, 0);

  const input = completionInput(pending);
  const results = await Promise.all([
    repositories.twoFactor.activateEnrollmentFromRecoveryAck(input),
    repositories.twoFactor.activateEnrollmentFromRecoveryAck(input),
  ]);
  assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]);
  assert.equal(db.twoFactorCredentials.length, 1);
  assert.equal(db.twoFactorTokens.length, 1);
  assert.equal(db.users[0].twoFactorEnabled, true);
  assert.equal(db.twoFactorEnrollments[0].pendingActivation, null);
  assert.equal(db.auditLogs.filter((entry) => entry.action === "account.2fa.enable").length, 1);

  await assert.rejects(
    repositories.twoFactor.activateEnrollmentFromRecoveryAck({
      ...input,
      acknowledgementKeyHash: "different-ack-key-hash",
    }),
    (error) => error?.code === "TWO_FACTOR_DELIVERY_SCOPE_MISMATCH" && error?.statusCode === 409,
  );
});

test("JSON expired ACK clears pending state, remains disabled, and permits a safe new enrollment", async () => {
  const { db, repositories } = createRuntimeFixture();
  const pending = pendingActivation({
    delivery: { expiresAt: isoFromNow(-1_000) },
    verifiedAt: isoFromNow(-5_000),
  });
  await repositories.twoFactor.stageEnrollmentVerification({
    userId: pending.userId,
    enrollmentId: pending.enrollmentId,
    pendingActivation: pending,
  });

  await assert.rejects(
    repositories.twoFactor.activateEnrollmentFromRecoveryAck(completionInput(pending)),
    (error) => error?.code === "TWO_FACTOR_DELIVERY_EXPIRED" && error?.statusCode === 410,
  );
  assert.equal(db.twoFactorEnrollments[0].pendingActivation, null);
  assert.ok(db.twoFactorEnrollments[0].consumedAt);
  assert.equal(db.twoFactorCredentials.length, 0);
  assert.equal(db.twoFactorTokens.length, 0);
  assert.equal(db.users[0].twoFactorEnabled, false);
  assert.equal(db.auditLogs.filter((entry) => entry.action === "account.2fa.enable").length, 0);

  const restarted = enrollment({
    id: "enroll_usr_alpha_restart",
    startIntent: {
      version: 1,
      idempotencyKeyHash: "C".repeat(43),
      primaryBindingHash: "B".repeat(43),
      method: "app",
      superseded: false,
    },
  });
  const created = await repositories.twoFactor.createEnrollment(restarted);
  assert.equal(created.enrollment.id, restarted.id);
  assert.equal(db.twoFactorEnrollments.filter((entry) => !entry.consumedAt).length, 1);
});

test("JSON save failure rolls back credential, token, enrollment, user and audit together", async () => {
  const { db, repositories } = createRuntimeFixture({ failSaveAt: 2 });
  const pending = pendingActivation();
  await repositories.twoFactor.stageEnrollmentVerification({
    userId: pending.userId,
    enrollmentId: pending.enrollmentId,
    pendingActivation: pending,
  });
  const beforeAck = structuredClone(db);

  await assert.rejects(
    repositories.twoFactor.activateEnrollmentFromRecoveryAck(completionInput(pending)),
    /injected save failure/,
  );
  assert.deepEqual(db, beforeAck);
});

test("SQL repository stages and atomically activates once; exact replay is read-only", async () => {
  const { repositories, state } = createSqlFixture();
  const pending = pendingActivation();
  const staged = await repositories.twoFactor.stageEnrollmentVerification({
    userId: pending.userId,
    enrollmentId: pending.enrollmentId,
    pendingActivation: pending,
  });
  assert.equal(staged.replayed, false);
  assert.equal(state.credential, null);
  assert.equal(state.token, null);
  assert.equal(state.userEnabled, false);

  const input = completionInput(pending);
  const activated = await repositories.twoFactor.activateEnrollmentFromRecoveryAck(input);
  assert.equal(state.credential.enrollment_id, pending.enrollmentId);
  assert.deepEqual(state.credential.recovery_codes[0].delivery, {
    ...pending.delivery,
    acknowledgedAt: activated.delivery.acknowledgedAt,
  });
  assert.equal(state.token.id, input.tokenRecord.id);
  assert.equal(state.token.token_hash, input.tokenRecord.tokenHash);
  assert.equal(state.token.primary_binding_hash, pending.delivery.primaryBindingHash);
  assert.equal(state.token.expires_at, input.tokenRecord.expiresAt);
  const replayed = await repositories.twoFactor.activateEnrollmentFromRecoveryAck(input);
  assert.equal(activated.replayed, false);
  assert.equal(replayed.replayed, true);
  assert.equal(state.userEnabled, true);
  assert.equal(state.audits.filter((entry) => entry.action === "account.2fa.enable").length, 1);
  assert.equal(state.transactions.filter((entry) => entry === "COMMIT").length, 3);
  assert.equal(state.transactions.includes("ROLLBACK"), false);
});

test("SQL audit failure rolls back activation state without a false success", async () => {
  const { repositories, state } = createSqlFixture({ failEnableAudit: true });
  const pending = pendingActivation();
  await repositories.twoFactor.stageEnrollmentVerification({
    userId: pending.userId,
    enrollmentId: pending.enrollmentId,
    pendingActivation: pending,
  });

  await assert.rejects(
    repositories.twoFactor.activateEnrollmentFromRecoveryAck(completionInput(pending)),
    /injected audit failure/,
  );
  assert.equal(state.enrollment.pending_activation.delivery.id, pending.delivery.id);
  assert.equal(state.enrollment.consumed_at, null);
  assert.equal(state.credential, null);
  assert.equal(state.token, null);
  assert.equal(state.userEnabled, false);
  assert.equal(state.audits.filter((entry) => entry.action === "account.2fa.enable").length, 0);
  assert.equal(state.transactions.at(-1), "ROLLBACK");
});
