"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRepositories } = require("../src/repositories");
const {
  createEnrollmentStartBinding,
  createTotpEnrollment,
  materializeTotpEnrollment,
} = require("../src/twoFactorAuth");

const env = {
  TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(32, 23).toString("hex"),
};

function isoFromNow(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function startBinding(overrides = {}) {
  return createEnrollmentStartBinding(
    {
      userId: "usr_alpha",
      idempotencyKey: "two-factor-start-alpha-stable-key",
      primaryBinding: "demo-session:usr_alpha:session-alpha",
      method: "app",
      ...overrides,
    },
    env,
  );
}

function enrollment(overrides = {}) {
  return {
    id: "enroll_alpha_one",
    userId: "usr_alpha",
    method: "app",
    secretCiphertext: "ciphertext-alpha-one",
    secretIv: "iv-alpha-one",
    secretTag: "tag-alpha-one",
    secretVersion: 1,
    attempts: 0,
    maxAttempts: 5,
    createdAt: isoFromNow(-1_000),
    expiresAt: isoFromNow(600_000),
    consumedAt: null,
    verifiedAt: null,
    pendingActivation: null,
    startIntent: startBinding(),
    ...overrides,
  };
}

async function secureEnrollment({
  id,
  idempotencyKey,
  primaryBinding = "demo-session:usr_alpha:session-alpha",
}) {
  const created = await createTotpEnrollment(
    { id, userId: "usr_alpha", accountLabel: "usr_alpha" },
    env,
  );
  created.record.startIntent = startBinding({ idempotencyKey, primaryBinding });
  return created;
}

function createRuntimeFixture(options = {}) {
  const db = {
    users: [{ id: "usr_alpha", organizationId: "org_alpha" }],
    auditLogs: [],
    twoFactorCredentials: [],
    twoFactorEnrollments: [],
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
  return { db, repositories };
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

function createSqlFixture() {
  const runtimeDb = {
    users: [{ id: "usr_alpha", organizationId: "org_alpha" }],
    auditLogs: [],
    twoFactorCredentials: [],
    twoFactorEnrollments: [],
    twoFactorChallenges: [],
    twoFactorTokens: [],
  };
  const state = {
    enrollments: [],
    audits: [],
    transactions: [],
    failAuditAction: "",
  };
  let transactionSnapshot = null;
  let idSequence = 0;
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized === "BEGIN") {
        transactionSnapshot = structuredClone({
          enrollments: state.enrollments,
          audits: state.audits,
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
        state.enrollments = transactionSnapshot?.enrollments || [];
        state.audits = transactionSnapshot?.audits || [];
        transactionSnapshot = null;
        state.transactions.push("ROLLBACK");
        return { rowCount: 0, rows: [] };
      }
      if (/SELECT pg_advisory_xact_lock/i.test(normalized)) {
        return { rowCount: 1, rows: [{}] };
      }
      if (/UPDATE two_factor_enrollments SET consumed_at = now\(\), pending_activation = NULL WHERE user_id = \$1 AND consumed_at IS NULL AND expires_at <= now\(\)/i.test(normalized)) {
        for (const row of state.enrollments) {
          if (row.user_id === params[0] && !row.consumed_at && Date.parse(row.expires_at) <= Date.now()) {
            row.consumed_at = new Date().toISOString();
            row.pending_activation = null;
          }
        }
        return { rowCount: 0, rows: [] };
      }
      if (/SELECT 1 FROM two_factor_credentials/i.test(normalized)) {
        return { rowCount: 0, rows: [] };
      }
      if (/start_intent->>'idempotencyKeyHash' = \$2/i.test(normalized)) {
        const row = [...state.enrollments].reverse().find(
          (candidate) =>
            candidate.user_id === params[0] &&
            candidate.start_intent?.idempotencyKeyHash === params[1],
        );
        return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
      }
      if (/SELECT \* FROM two_factor_enrollments WHERE user_id = \$1 AND consumed_at IS NULL AND expires_at > now\(\) LIMIT 1 FOR UPDATE/i.test(normalized)) {
        const row = state.enrollments.find(
          (candidate) =>
            candidate.user_id === params[0] &&
            !candidate.consumed_at &&
            Date.parse(candidate.expires_at) > Date.now(),
        );
        return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
      }
      if (/UPDATE two_factor_enrollments SET consumed_at = now\(\), pending_activation = NULL,/i.test(normalized)) {
        const row = state.enrollments.find(
          (candidate) => candidate.id === params[0] && candidate.user_id === params[1] && !candidate.consumed_at,
        );
        if (row) {
          row.consumed_at = new Date().toISOString();
          row.pending_activation = null;
          row.start_intent = {
            ...(row.start_intent || {}),
            superseded: true,
            invalidatedByEnrollmentId: params[2],
          };
        }
        return { rowCount: row ? 1 : 0, rows: [] };
      }
      if (/INSERT INTO two_factor_enrollments/i.test(normalized)) {
        const row = {
          id: params[0],
          user_id: params[1],
          method: params[2],
          secret_ciphertext: params[3],
          secret_iv: params[4],
          secret_tag: params[5],
          secret_version: params[6],
          attempts: params[7],
          max_attempts: params[8],
          created_at: params[9],
          expires_at: params[10],
          consumed_at: null,
          verified_at: null,
          pending_activation: null,
          start_intent: JSON.parse(params[11]),
        };
        state.enrollments.push(row);
        return { rowCount: 1, rows: [structuredClone(row)] };
      }
      if (/INSERT INTO audit_logs/i.test(normalized)) {
        const action = String(params[3] || "");
        if (action === state.failAuditAction) throw new Error("injected audit failure");
        state.audits.push({ id: params[0], action, resourceId: params[5] });
        return { rowCount: 1, rows: [] };
      }
      if (/SELECT \* FROM two_factor_enrollments WHERE id = \$1 AND user_id = \$2 LIMIT 1/i.test(normalized)) {
        const row = state.enrollments.find(
          (candidate) => candidate.id === params[0] && candidate.user_id === params[1],
        );
        return { rowCount: row ? 1 : 0, rows: row ? [structuredClone(row)] : [] };
      }
      throw new Error(`Unexpected SQL in enrollment-start repository test: ${normalized}`);
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
  return { repositories, state };
}

function auditInput() {
  return {
    actorUserId: "usr_alpha",
    organizationId: "org_alpha",
    ip: "127.0.0.1",
    userAgent: "enrollment-start-test",
  };
}

for (const [label, createFixture] of [
  ["JSON", createRuntimeFixture],
  ["SQL", createSqlFixture],
]) {
  test(`${label} exact replay returns the same enrollment even after recovery delivery is pending`, async () => {
    const fixture = createFixture();
    const { repositories } = fixture;
    const first = await repositories.twoFactor.createEnrollment(enrollment(), {
      auditInput: auditInput(),
    });
    const stored = label === "JSON"
      ? fixture.db.twoFactorEnrollments[0]
      : fixture.state.enrollments[0];
    if (label === "JSON") {
      stored.pendingActivation = { delivery: { id: "delivery-alpha" } };
      stored.verifiedAt = isoFromNow(-500);
    } else {
      stored.pending_activation = { delivery: { id: "delivery-alpha" } };
      stored.verified_at = isoFromNow(-500);
    }

    const replay = await repositories.twoFactor.createEnrollment(
      enrollment({
        id: "enroll_alpha_unused_candidate",
        secretCiphertext: "different-candidate-ciphertext",
      }),
      { auditInput: auditInput() },
    );

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.enrollment.id, "enroll_alpha_one");
    assert.equal(replay.enrollment.secretCiphertext, "ciphertext-alpha-one");
    const persisted = JSON.stringify(label === "JSON" ? fixture.db : fixture.state.enrollments);
    assert.equal(persisted.includes("two-factor-start-alpha-stable-key"), false);
    assert.equal(persisted.includes("demo-session:usr_alpha:session-alpha"), false);
  });

  test(`${label} same key is session-bound while a different key atomically supersedes`, async () => {
    const fixture = createFixture();
    const { repositories } = fixture;
    await repositories.twoFactor.createEnrollment(enrollment(), { auditInput: auditInput() });
    const before = label === "JSON"
      ? structuredClone(fixture.db)
      : structuredClone(fixture.state.enrollments);

    await assert.rejects(
      repositories.twoFactor.createEnrollment(
        enrollment({
          id: "enroll_alpha_wrong_session_replay",
          startIntent: startBinding({
            primaryBinding: "demo-session:usr_alpha:session-beta",
          }),
        }),
        { auditInput: auditInput() },
      ),
      (error) => error?.code === "TWO_FACTOR_ENROLLMENT_SCOPE_MISMATCH" && error?.statusCode === 409,
    );
    assert.deepEqual(
      label === "JSON" ? fixture.db : fixture.state.enrollments,
      before,
    );

    const replacement = await repositories.twoFactor.createEnrollment(
      enrollment({
        id: "enroll_alpha_replacement",
        secretCiphertext: "ciphertext-alpha-replacement",
        startIntent: startBinding({
          idempotencyKey: "two-factor-start-alpha-new-session-new-key",
          primaryBinding: "demo-session:usr_alpha:session-beta",
        }),
      }),
      { auditInput: auditInput() },
    );

    assert.equal(replacement.replayed, false);
    assert.equal(replacement.superseded, true);
    assert.equal(replacement.enrollment.id, "enroll_alpha_replacement");
    const old = await repositories.twoFactor.getEnrollment("usr_alpha", "enroll_alpha_one");
    assert.ok(old.consumedAt);
    assert.equal(old.pendingActivation, null);

    const historicalReplay = await repositories.twoFactor.createEnrollment(
      enrollment({ id: "enroll_alpha_historical_replay_candidate" }),
      { auditInput: auditInput() },
    );
    assert.equal(historicalReplay.replayed, true);
    assert.equal(historicalReplay.superseded, true);
    assert.equal(historicalReplay.enrollment.id, "enroll_alpha_one");
    const liveReplacement = await repositories.twoFactor.getEnrollment(
      "usr_alpha",
      "enroll_alpha_replacement",
    );
    assert.equal(liveReplacement.consumedAt, null);

    await assert.rejects(
      repositories.twoFactor.createEnrollment(
        enrollment({
          id: "enroll_alpha_historical_cross_session_candidate",
          startIntent: startBinding({
            primaryBinding: "demo-session:usr_alpha:session-gamma",
          }),
        }),
        { auditInput: auditInput() },
      ),
      (error) => error?.code === "TWO_FACTOR_ENROLLMENT_SCOPE_MISMATCH" && error?.statusCode === 409,
    );
    const stillLiveReplacement = await repositories.twoFactor.getEnrollment(
      "usr_alpha",
      "enroll_alpha_replacement",
    );
    assert.equal(stillLiveReplacement.consumedAt, null);
  });

  test(`${label} only the enrollment invalidated by a newer start can rematerialize after consumption`, async () => {
    const fixture = createFixture();
    const { repositories } = fixture;
    const first = await secureEnrollment({
      id: "enroll_alpha_secure_first",
      idempotencyKey: "two-factor-start-alpha-secure-first-key",
    });
    await repositories.twoFactor.createEnrollment(first.record, { auditInput: auditInput() });
    const replacement = await secureEnrollment({
      id: "enroll_alpha_secure_replacement",
      idempotencyKey: "two-factor-start-alpha-secure-replacement-key",
    });
    const replacementStart = await repositories.twoFactor.createEnrollment(
      replacement.record,
      { auditInput: auditInput() },
    );
    assert.equal(replacementStart.superseded, true);

    const persistedFirst = await repositories.twoFactor.getEnrollment(
      "usr_alpha",
      first.record.id,
    );
    const persistedReplacement = await repositories.twoFactor.getEnrollment(
      "usr_alpha",
      replacement.record.id,
    );
    assert.equal(
      persistedFirst.startIntent.invalidatedByEnrollmentId,
      replacement.record.id,
    );
    assert.equal(
      Object.hasOwn(persistedReplacement.startIntent, "invalidatedByEnrollmentId"),
      false,
    );

    if (label === "JSON") {
      fixture.db.twoFactorEnrollments.find(
        (item) => item.id === replacement.record.id,
      ).consumedAt = new Date().toISOString();
    } else {
      fixture.state.enrollments.find(
        (item) => item.id === replacement.record.id,
      ).consumed_at = new Date().toISOString();
    }

    const replacementReplayCandidate = await secureEnrollment({
      id: "enroll_alpha_secure_replacement_replay_candidate",
      idempotencyKey: "two-factor-start-alpha-secure-replacement-key",
    });
    const replacementReplay = await repositories.twoFactor.createEnrollment(
      replacementReplayCandidate.record,
      { auditInput: auditInput() },
    );
    assert.equal(replacementReplay.replayed, true);
    await assert.rejects(
      materializeTotpEnrollment(
        replacementReplay.enrollment,
        { accountLabel: "usr_alpha" },
        env,
      ),
      (error) =>
        error?.statusCode === 410 &&
        error?.code === "TWO_FACTOR_ENROLLMENT_ALREADY_USED",
    );

    const firstReplayCandidate = await secureEnrollment({
      id: "enroll_alpha_secure_first_replay_candidate",
      idempotencyKey: "two-factor-start-alpha-secure-first-key",
    });
    const firstReplay = await repositories.twoFactor.createEnrollment(
      firstReplayCandidate.record,
      { auditInput: auditInput() },
    );
    assert.equal(firstReplay.replayed, true);
    assert.equal(firstReplay.superseded, true);
    const historicalBootstrap = await materializeTotpEnrollment(
      firstReplay.enrollment,
      { accountLabel: "usr_alpha" },
      env,
    );
    assert.equal(historicalBootstrap.manualKey, first.manualKey);
  });
}

test("JSON save failure rolls enrollment, supersession and both audits back together", async () => {
  const { db, repositories } = createRuntimeFixture({ failSaveAt: 2 });
  await repositories.twoFactor.createEnrollment(enrollment(), { auditInput: auditInput() });
  db.twoFactorEnrollments[0].pendingActivation = { delivery: { id: "delivery-alpha" } };
  const before = structuredClone(db);

  await assert.rejects(
    repositories.twoFactor.createEnrollment(
      enrollment({
        id: "enroll_alpha_rollback",
        startIntent: startBinding({ idempotencyKey: "two-factor-start-alpha-rollback-key" }),
      }),
      { auditInput: auditInput() },
    ),
    /injected save failure/,
  );
  assert.deepEqual(db, before);
});

test("SQL audit failure rolls enrollment and supersession back in one transaction", async () => {
  const { repositories, state } = createSqlFixture();
  await repositories.twoFactor.createEnrollment(enrollment(), { auditInput: auditInput() });
  state.enrollments[0].pending_activation = { delivery: { id: "delivery-alpha" } };
  const before = structuredClone(state.enrollments);
  const auditsBefore = structuredClone(state.audits);
  state.failAuditAction = "account.2fa.enrollment.started";

  await assert.rejects(
    repositories.twoFactor.createEnrollment(
      enrollment({
        id: "enroll_alpha_sql_rollback",
        startIntent: startBinding({ idempotencyKey: "two-factor-start-alpha-sql-rollback-key" }),
      }),
      { auditInput: auditInput() },
    ),
    /injected audit failure/,
  );
  assert.deepEqual(state.enrollments, before);
  assert.deepEqual(state.audits, auditsBefore);
  assert.equal(state.transactions.at(-1), "ROLLBACK");
});
