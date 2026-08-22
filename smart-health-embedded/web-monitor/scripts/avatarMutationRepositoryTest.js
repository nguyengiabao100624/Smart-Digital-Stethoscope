const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createAvatarMutationRepository,
  executeAvatarDeleteMutation,
  executeAvatarUploadMutation,
} = require("../src/avatarMutationRepository");
const { createAvatarCleanupWorker } = require("../src/avatarCleanupWorker");

const FIXED_TIME = "2026-08-09T06:30:00.000Z";

function createIdFactory() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}

function createDb() {
  return {
    organizations: [
      { id: "org-a", status: "active" },
      { id: "org-b", status: "active" },
    ],
    users: [
      {
        id: "user-a",
        organizationId: "org-a",
        accountStatus: "active",
        avatarFileId: "file-old",
        avatarUrl: "/api/v1/me/avatar",
        avatarStorage: {
          objectKey: "org/org-a/avatars/user-a/file-old-old.png",
          storageProvider: "local",
          contentType: "image/png",
          name: "old.png",
          byteSize: 16,
          checksum: "b".repeat(64),
          uploadedAt: "2026-08-08T06:30:00.000Z",
        },
      },
      {
        id: "user-b",
        organizationId: "org-b",
        accountStatus: "active",
        avatarFileId: "",
        avatarUrl: "",
        avatarStorage: {},
      },
    ],
    storageFiles: [
      {
        id: "file-old",
        organizationId: "org-a",
        bucket: "avatars",
        name: "old.png",
        objectKey: "org/org-a/avatars/user-a/file-old-old.png",
        storageProvider: "local",
        contentType: "image/png",
        type: "png",
        byteSize: 16,
        checksum: "b".repeat(64),
        sha256: "b".repeat(64),
        createdByUserId: "user-a",
        status: "active",
        createdAt: "2026-08-08T06:30:00.000Z",
        updatedAt: "2026-08-08T06:30:00.000Z",
      },
    ],
    auditLogs: [],
    idempotencyKeys: [],
    avatarMutationOperations: [],
    sessions: [
      {
        id: "auth-session-e1",
        userId: "user-a",
        revokedAt: null,
      },
      {
        id: "auth-session-e2",
        userId: "user-a",
        revokedAt: null,
      },
      {
        id: "auth-session-user-b",
        userId: "user-b",
        revokedAt: null,
      },
    ],
    authSessions: [],
  };
}

function avatar(overrides = {}) {
  return {
    id: "file-new",
    ownerUserId: "user-a",
    organizationId: "org-a",
    name: "new.png",
    objectKey: "org/org-a/avatars/user-a/file-new-new.png",
    storageProvider: "local",
    contentType: "image/png",
    type: "png",
    byteSize: 24,
    sha256: "a".repeat(64),
    uploadedAt: FIXED_TIME,
    ...overrides,
  };
}

function uploadInput(overrides = {}) {
  return {
    userId: "user-a",
    organizationId: "org-a",
    authSessionId: "auth-session-e1",
    operationId: "avatar_upload_exact",
    avatar: avatar(),
    idempotency: {
      scope: "user-a",
      operation: "account.avatar.upload",
      key: "avatar-upload-key",
      fingerprint: "upload-fingerprint-a",
    },
    audit: {
      actorUserId: "user-a",
      organizationId: "org-a",
      action: "account.avatar.update",
      ip: "127.0.0.1",
      userAgent: "avatar-test",
    },
    ...overrides,
  };
}

function deleteInput(overrides = {}) {
  return {
    userId: "user-a",
    organizationId: "org-a",
    authSessionId: "auth-session-e1",
    operationId: "avatar_delete_exact",
    expectedAvatarFileId: "file-new",
    idempotency: {
      scope: "user-a",
      operation: "account.avatar.delete",
      key: "avatar-delete-key",
      fingerprint: "delete-fingerprint-a",
    },
    audit: {
      actorUserId: "user-a",
      organizationId: "org-a",
      action: "account.avatar.delete",
      ip: "127.0.0.1",
      userAgent: "avatar-test",
    },
    ...overrides,
  };
}

function runtime(options = {}) {
  const db = options.db || createDb();
  let saves = 0;
  const repository = createAvatarMutationRepository({
    getDb: () => db,
    saveDb: async () => {
      saves += 1;
      if (options.failSave || options.failSaveAt === saves) {
        throw new Error("injected database failure");
      }
    },
    createId: createIdFactory(),
    nowIso: options.nowIso || (() => FIXED_TIME),
    getPool: () => null,
    beforeAuditCommit: options.beforeAuditCommit,
    uploadStagingLeaseMillis: options.uploadStagingLeaseMillis,
  });
  return { db, repository, get saves() { return saves; } };
}

function sqlAuthorityRuntime(options = {}) {
  const db = createDb();
  db.sessions = [];
  db.authSessions = [];
  const queries = [];
  const workspaceRow = {
    id: "org-a",
    status: "active",
    deleted_at: options.workspaceDeletedAt || null,
  };
  const client = {
    async query(statement, params = []) {
      const sql = String(statement).replace(/\s+/g, " ").trim();
      queries.push({ sql, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
      if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("FROM users")) {
        return {
          rows: [
            {
              id: "user-a",
              organization_id: "org-a",
              account_status: "active",
              firebase_claims: { profile: {} },
            },
          ],
        };
      }
      if (sql.includes("FROM organizations")) {
        return { rows: [{ ...workspaceRow }] };
      }
      if (sql.includes("FROM auth_sessions") && sql.includes("WHERE id = $1")) {
        return {
          rows: [
            {
              id: "auth-session-e1",
              user_id: "user-a",
              refresh_token_hash: "binding-e1",
              revoked_at: null,
            },
          ],
        };
      }
      if (
        sql.includes("FROM auth_sessions") &&
        sql.includes("refresh_token_hash = $2")
      ) {
        return {
          rows:
            options.bindingRows ||
            [{ id: "auth-session-e1", user_id: "user-a", revoked_at: null }],
        };
      }
      if (sql.includes("FROM mutation_idempotency")) return { rows: [] };
      if (sql.includes("FROM avatar_mutation_operations")) return { rows: [] };
      if (sql.startsWith("INSERT INTO avatar_mutation_operations")) {
        return { rows: [] };
      }
      throw new Error(`Unhandled avatar SQL test query: ${sql}`);
    },
    release() {},
  };
  const repository = createAvatarMutationRepository({
    getDb: () => db,
    saveDb: async () => {},
    createId: createIdFactory(),
    nowIso: () => FIXED_TIME,
    getPool: () => ({ connect: async () => client }),
  });
  return { queries, repository, workspaceRow };
}

function cleanupWorker(options = {}) {
  return createAvatarCleanupWorker({
    repository: options.repository,
    storageAdapter: options.storageAdapter,
    workerId: options.workerId || "avatar-cleanup-worker-test",
    intervalMillis: options.intervalMillis || 60_000,
    leaseMillis: options.leaseMillis || 5_000,
    operationTimeoutMillis: options.operationTimeoutMillis || 2_000,
    batchSize: options.batchSize || 10,
    maxAttempts: options.maxAttempts || 3,
    baseBackoffMillis: options.baseBackoffMillis || 1_000,
    maxBackoffMillis: options.maxBackoffMillis || 8_000,
    retentionMillis: options.retentionMillis || 30_000,
    onError: options.onError || (() => {}),
  });
}

test("avatar upload commits owner, storage metadata, audit, receipt and cleanup saga atomically", async () => {
  const { db, repository } = runtime();
  const result = await repository.saveUploadWithAudit(uploadInput());

  assert.equal(result.replayed, false);
  assert.deepEqual(Object.keys(result.receipt), [
    "avatar",
    "cleanup",
    "operationId",
    "replayed",
  ]);
  assert.deepEqual(Object.keys(result.receipt.avatar), [
    "fileId",
    "ownerUserId",
    "name",
    "contentType",
    "byteSize",
    "sha256",
    "downloadUrl",
    "uploadedAt",
  ]);
  assert.equal(result.receipt.avatar.ownerUserId, "user-a");
  assert.equal(result.receipt.avatar.sha256, "a".repeat(64));
  assert.equal(result.receipt.cleanup.status, "pending");
  assert.equal(db.users[0].avatarFileId, "file-new");
  assert.equal(db.storageFiles.find((file) => file.id === "file-old").status, "deleted");
  assert.equal(db.storageFiles.find((file) => file.id === "file-new").status, "active");
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.idempotencyKeys.length, 1);
  assert.equal(db.avatarMutationOperations.length, 1);

  const replay = await repository.saveUploadWithAudit(uploadInput());
  assert.equal(replay.replayed, true);
  assert.equal(replay.receipt.replayed, true);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.storageFiles.filter((file) => file.id === "file-new").length, 1);

  await assert.rejects(
    repository.saveUploadWithAudit(
      uploadInput({
        idempotency: {
          ...uploadInput().idempotency,
          fingerprint: "different-payload",
        },
      }),
    ),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});

test("avatar repository denies cross-account metadata, inactive users and stale delete preconditions", async () => {
  const { db, repository } = runtime();
  await assert.rejects(
    repository.saveUploadWithAudit(
      uploadInput({
        userId: "user-b",
        organizationId: "org-b",
        avatar: avatar(),
        idempotency: {
          scope: "user-b",
          operation: "account.avatar.upload",
          key: "user-b-key",
          fingerprint: "user-b-fingerprint",
        },
        audit: {
          actorUserId: "user-b",
          organizationId: "org-b",
          action: "account.avatar.update",
        },
      }),
    ),
    (error) => error.code === "AVATAR_OWNER_SCOPE_DENIED",
  );

  db.users[0].accountStatus = "locked";
  await assert.rejects(
    repository.findReplay(uploadInput()),
    (error) => error.code === "ACCOUNT_INACTIVE",
  );
  db.users[0].accountStatus = "active";

  await repository.saveUploadWithAudit(uploadInput());
  await assert.rejects(
    repository.deleteWithAudit(
      deleteInput({ expectedAvatarFileId: "file-stale" }),
    ),
    (error) => error.code === "AVATAR_PRECONDITION_FAILED",
  );
});

test("injected audit or persistence failure restores every JSON ledger", async () => {
  for (const options of [
    { beforeAuditCommit: () => { throw new Error("injected audit failure"); } },
    { failSave: true },
  ]) {
    const db = createDb();
    const before = JSON.stringify(db);
    const { repository } = runtime({ db, ...options });
    await assert.rejects(repository.saveUploadWithAudit(uploadInput()));
    assert.equal(JSON.stringify(db), before);
  }
});

test("durable upload stage survives commit and rollback-delete failure then worker removes the orphan", async () => {
  let nowMs = Date.parse(FIXED_TIME);
  const { db, repository } = runtime({
    failSaveAt: 2,
    nowIso: () => new Date(nowMs).toISOString(),
    uploadStagingLeaseMillis: 1_000,
  });
  const objectKey = uploadInput().avatar.objectKey;
  const providerObjects = new Set();
  let rollbackFailuresRemaining = 1;
  let putCalls = 0;
  const storageAdapter = {
    async putBuffer(key) {
      putCalls += 1;
      providerObjects.add(key);
      return { provider: "local", objectKey: key };
    },
    async deleteObject(key) {
      if (rollbackFailuresRemaining > 0) {
        rollbackFailuresRemaining -= 1;
        throw Object.assign(new Error("rollback provider failure"), {
          code: "PROVIDER_UNAVAILABLE",
        });
      }
      providerObjects.delete(key);
      return { deleted: true, objectKey: key };
    },
  };

  await assert.rejects(
    executeAvatarUploadMutation({
      repository,
      storageAdapter,
      buffer: Buffer.alloc(24, 1),
      contentType: "image/png",
      input: uploadInput(),
    }),
    /injected database failure/,
  );

  assert.equal(db.users[0].avatarFileId, "file-old");
  assert.equal(db.idempotencyKeys.length, 0);
  assert.equal(db.auditLogs.length, 0);
  assert.equal(providerObjects.has(objectKey), true);
  assert.equal(db.avatarMutationOperations.length, 1);
  assert.equal(db.avatarMutationOperations[0].cleanupKind, "staged_rollback");
  assert.equal(db.avatarMutationOperations[0].cleanupStatus, "pending");

  nowMs += 1_001;
  const worker = cleanupWorker({ repository, storageAdapter });
  const swept = await worker.runOnce();
  assert.equal(swept.completed, 1);
  assert.equal(providerObjects.has(objectKey), false);
  assert.equal(db.avatarMutationOperations[0].cleanupStatus, "completed");

  const completed = await executeAvatarUploadMutation({
    repository,
    storageAdapter,
    buffer: Buffer.alloc(24, 1),
    contentType: "image/png",
    input: uploadInput(),
  });
  assert.equal(completed.replayed, false);
  assert.equal(db.users[0].avatarFileId, "file-new");
  assert.equal(db.idempotencyKeys.length, 1);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(putCalls, 2);

  const replay = await executeAvatarUploadMutation({
    repository,
    storageAdapter,
    buffer: Buffer.alloc(24, 1),
    contentType: "image/png",
    input: uploadInput(),
  });
  assert.equal(replay.replayed, true);
  assert.equal(putCalls, 2, "confirmed replay must not stage or upload again");
});

test("concurrent exact avatar intent is rejected before provider put and committed replay never re-puts", async () => {
  const { db, repository } = runtime();
  let releaseFirstPut;
  const firstPutGate = new Promise((resolve) => {
    releaseFirstPut = resolve;
  });
  let putCalls = 0;
  let rollbackDeleteCalls = 0;
  const storageAdapter = {
    async putBuffer() {
      putCalls += 1;
      if (putCalls > 1) {
        throw Object.assign(new Error("duplicate provider put"), {
          code: "UNEXPECTED_DUPLICATE_PROVIDER_PUT",
        });
      }
      await firstPutGate;
      return { provider: "local", objectKey: uploadInput().avatar.objectKey };
    },
    async deleteObject() {
      rollbackDeleteCalls += 1;
    },
  };
  const execute = () =>
    executeAvatarUploadMutation({
      repository,
      storageAdapter,
      buffer: Buffer.alloc(24, 1),
      contentType: "image/png",
      input: uploadInput(),
    });

  const first = execute();
  while (putCalls < 1) await new Promise((resolve) => setImmediate(resolve));
  const concurrentError = await execute().then(
    () => null,
    (error) => error,
  );
  releaseFirstPut();
  const created = await first;

  assert.equal(concurrentError?.statusCode, 409);
  assert.equal(concurrentError?.code, "AVATAR_UPLOAD_STAGE_IN_PROGRESS");
  assert.equal(putCalls, 1, "the concurrent replay must stop before provider put");
  assert.equal(
    rollbackDeleteCalls,
    0,
    "the rejected replay must never rollback-delete the winner's object",
  );
  assert.equal(created.replayed, false);
  assert.equal(db.idempotencyKeys.length, 1);

  const replay = await execute();
  assert.equal(replay.replayed, true);
  assert.equal(putCalls, 1, "the committed replay must not put bytes again");
  assert.equal(rollbackDeleteCalls, 0);
});

test("an abandoned avatar upload stage can be retried only after its lease expires", async () => {
  let nowMs = Date.parse(FIXED_TIME);
  const { repository } = runtime({
    nowIso: () => new Date(nowMs).toISOString(),
    uploadStagingLeaseMillis: 1_000,
  });
  await repository.stageUploadCleanup(uploadInput());
  let putCalls = 0;
  const storageAdapter = {
    async putBuffer() {
      putCalls += 1;
      return { provider: "local", objectKey: uploadInput().avatar.objectKey };
    },
    async deleteObject() {},
  };
  const execute = () =>
    executeAvatarUploadMutation({
      repository,
      storageAdapter,
      buffer: Buffer.alloc(24, 1),
      contentType: "image/png",
      input: uploadInput(),
    });

  await assert.rejects(
    execute(),
    (error) =>
      error.statusCode === 409 &&
      error.code === "AVATAR_UPLOAD_STAGE_IN_PROGRESS",
  );
  assert.equal(putCalls, 0);

  nowMs += 1_001;
  const retried = await execute();
  assert.equal(retried.replayed, false);
  assert.equal(putCalls, 1);

  const replay = await execute();
  assert.equal(replay.replayed, true);
  assert.equal(putCalls, 1);
});

test("an expired cleaner cannot delete the winner uploaded by a lost-stage retry", async () => {
  let nowMs = Date.parse(FIXED_TIME);
  const db = createDb();
  db.users[0].avatarFileId = "";
  db.users[0].avatarUrl = "";
  db.users[0].avatarStorage = {};
  db.storageFiles = [];
  const { repository } = runtime({
    db,
    nowIso: () => new Date(nowMs).toISOString(),
    uploadStagingLeaseMillis: 1_000,
  });
  const originalObjectKey = uploadInput().avatar.objectKey;
  await repository.stageUploadCleanup(uploadInput());

  nowMs += 1_001;
  let releaseStaleDelete;
  let staleDeleteStarted;
  const staleDeleteGate = new Promise((resolve) => {
    releaseStaleDelete = resolve;
  });
  const staleDeleteEntered = new Promise((resolve) => {
    staleDeleteStarted = resolve;
  });
  const providerObjects = new Set();
  const putKeys = [];
  const deletedKeys = [];
  const storageAdapter = {
    async putBuffer(objectKey) {
      putKeys.push(objectKey);
      providerObjects.add(objectKey);
      return { provider: "local", objectKey };
    },
    async deleteObject(objectKey) {
      deletedKeys.push(objectKey);
      staleDeleteStarted();
      await staleDeleteGate;
      providerObjects.delete(objectKey);
      return { deleted: true, objectKey };
    },
  };
  const worker = cleanupWorker({
    repository,
    storageAdapter,
    leaseMillis: 1_000,
    operationTimeoutMillis: 900,
  });
  const staleWorkerRun = worker.runOnce();
  await staleDeleteEntered;

  nowMs += 1_001;
  const created = await executeAvatarUploadMutation({
    repository,
    storageAdapter,
    buffer: Buffer.alloc(24, 1),
    contentType: "image/png",
    input: uploadInput(),
  });
  const winnerObjectKey = db.users[0].avatarStorage.objectKey;
  releaseStaleDelete();
  await staleWorkerRun;

  assert.equal(created.replayed, false);
  assert.equal(
    created.cleanup.status,
    "pending",
    "the retired provider generation must remain visible in the durable receipt",
  );
  assert.equal(putKeys.length, 1);
  assert.notEqual(
    winnerObjectKey,
    originalObjectKey,
    "an expired stage retry must use a fresh immutable provider key",
  );
  assert.deepEqual(deletedKeys, [originalObjectKey]);
  assert.equal(
    providerObjects.has(winnerObjectKey),
    true,
    "the stale cleaner must only delete its original provider generation",
  );
  assert.equal(db.users[0].avatarFileId, "file-new");

  const replay = await executeAvatarUploadMutation({
    repository,
    storageAdapter,
    buffer: Buffer.alloc(24, 1),
    contentType: "image/png",
    input: uploadInput(),
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.cleanup.status, "completed");
  assert.equal(putKeys.length, 1, "the committed replay must not put a new generation");
});

test("a stale original uploader cannot commit after a retry rearms a new generation", async () => {
  let nowMs = Date.parse(FIXED_TIME);
  const db = createDb();
  db.users[0].avatarFileId = "";
  db.users[0].avatarUrl = "";
  db.users[0].avatarStorage = {};
  db.storageFiles = [];
  const { repository } = runtime({
    db,
    nowIso: () => new Date(nowMs).toISOString(),
    uploadStagingLeaseMillis: 1_000,
  });
  let releaseOriginalPut;
  let releaseRetryPut;
  let originalPutStarted;
  let retryPutStarted;
  const originalPutGate = new Promise((resolve) => {
    releaseOriginalPut = resolve;
  });
  const retryPutGate = new Promise((resolve) => {
    releaseRetryPut = resolve;
  });
  const originalPutEntered = new Promise((resolve) => {
    originalPutStarted = resolve;
  });
  const retryPutEntered = new Promise((resolve) => {
    retryPutStarted = resolve;
  });
  const providerObjects = new Set();
  const putKeys = [];
  const deletedKeys = [];
  const storageAdapter = {
    async putBuffer(objectKey) {
      putKeys.push(objectKey);
      if (putKeys.length === 1) {
        originalPutStarted();
        await originalPutGate;
      } else {
        retryPutStarted();
        await retryPutGate;
      }
      providerObjects.add(objectKey);
      return { provider: "local", objectKey };
    },
    async deleteObject(objectKey) {
      deletedKeys.push(objectKey);
      providerObjects.delete(objectKey);
      return { deleted: true, objectKey };
    },
  };
  const execute = () =>
    executeAvatarUploadMutation({
      repository,
      storageAdapter,
      buffer: Buffer.alloc(24, 1),
      contentType: "image/png",
      input: uploadInput(),
    });

  const original = execute();
  await originalPutEntered;
  nowMs += 1_001;
  const retry = execute();
  await retryPutEntered;

  releaseOriginalPut();
  const originalError = await original.then(
    () => null,
    (error) => error,
  );
  releaseRetryPut();
  const created = await retry;

  assert.equal(originalError?.statusCode, 409);
  assert.equal(originalError?.code, "AVATAR_UPLOAD_STAGE_FENCE_LOST");
  assert.equal(created.replayed, false);
  assert.equal(putKeys.length, 2);
  assert.notEqual(putKeys[0], putKeys[1]);
  assert.deepEqual(deletedKeys, [putKeys[0]]);
  assert.deepEqual([...providerObjects], [putKeys[1]]);
  assert.equal(db.users[0].avatarStorage.objectKey, putKeys[1]);

  const replay = await execute();
  assert.equal(replay.replayed, true);
  assert.equal(putKeys.length, 2, "the committed generation replay must not put again");
  assert.deepEqual([...providerObjects], [putKeys[1]]);
});

test("a revoked same-account auth session cannot commit a late avatar upload or delete", async () => {
  const db = createDb();
  db.users[0].avatarFileId = "";
  db.users[0].avatarUrl = "";
  db.users[0].avatarStorage = {};
  db.storageFiles = [];
  const { repository } = runtime({ db });
  let releasePut;
  let putStarted;
  const putGate = new Promise((resolve) => {
    releasePut = resolve;
  });
  const putEntered = new Promise((resolve) => {
    putStarted = resolve;
  });
  const providerObjects = new Set();
  const deletedKeys = [];
  const storageAdapter = {
    async putBuffer(objectKey) {
      putStarted();
      await putGate;
      providerObjects.add(objectKey);
      return { provider: "local", objectKey };
    },
    async deleteObject(objectKey) {
      deletedKeys.push(objectKey);
      providerObjects.delete(objectKey);
      return { deleted: true, objectKey };
    },
  };

  const staleUpload = executeAvatarUploadMutation({
    repository,
    storageAdapter,
    buffer: Buffer.alloc(24, 1),
    contentType: "image/png",
    input: uploadInput(),
  });
  await putEntered;
  db.sessions.find((session) => session.id === "auth-session-e1").revokedAt =
    "2026-08-09T06:31:00.000Z";
  releasePut();
  const uploadError = await staleUpload.then(
    () => null,
    (error) => error,
  );

  assert.equal(uploadError?.statusCode, 409);
  assert.equal(uploadError?.code, "AUTH_SESSION_REPLACED");
  assert.deepEqual(deletedKeys, [uploadInput().avatar.objectKey]);
  assert.equal(providerObjects.size, 0);
  assert.equal(db.users[0].avatarFileId, "");
  assert.equal(db.idempotencyKeys.length, 0);
  assert.equal(db.auditLogs.length, 0);
  await assert.rejects(
    repository.deleteWithAudit(
      deleteInput({ expectedAvatarFileId: "file-any" }),
    ),
    (error) => error.code === "AUTH_SESSION_REPLACED",
  );
});

test("avatar upload and delete replays are owned by the exact auth session", async () => {
  const uploadRuntime = runtime();
  await uploadRuntime.repository.saveUploadWithAudit(uploadInput());
  await assert.rejects(
    uploadRuntime.repository.saveUploadWithAudit(
      uploadInput({
        authSessionId: "auth-session-e2",
        idempotency: {
          ...uploadInput().idempotency,
          fingerprint: "different-fingerprint-must-not-mask-session-owner",
        },
      }),
    ),
    (error) =>
      error.statusCode === 409 && error.code === "AUTH_SESSION_REPLACED",
  );

  const deleteRuntime = runtime();
  const firstDeleteInput = deleteInput({ expectedAvatarFileId: "file-old" });
  await deleteRuntime.repository.deleteWithAudit(firstDeleteInput);
  await assert.rejects(
    deleteRuntime.repository.deleteWithAudit(
      deleteInput({
        authSessionId: "auth-session-e2",
        expectedAvatarFileId: "file-old",
        idempotency: {
          ...deleteInput().idempotency,
          fingerprint: "different-delete-fingerprint",
        },
      }),
    ),
    (error) =>
      error.statusCode === 409 && error.code === "AUTH_SESSION_REPLACED",
  );
});

test("avatar JSON commit fence rejects session revocation during upload and delete", async () => {
  for (const operation of ["upload", "delete"]) {
    const db = createDb();
    let revoked = false;
    const { repository } = runtime({
      db,
      beforeAuditCommit() {
        if (revoked) return;
        revoked = true;
        db.sessions.find((session) => session.id === "auth-session-e1").revokedAt =
          "2026-08-09T06:31:00.000Z";
      },
    });
    const mutation =
      operation === "upload"
        ? repository.saveUploadWithAudit(uploadInput())
        : repository.deleteWithAudit(
            deleteInput({ expectedAvatarFileId: "file-old" }),
          );
    await assert.rejects(
      mutation,
      (error) =>
        error.statusCode === 409 && error.code === "AUTH_SESSION_REPLACED",
    );
    assert.equal(db.idempotencyKeys.length, 0);
    assert.equal(db.avatarMutationOperations.length, 0);
    assert.equal(db.auditLogs.length, 0);
    assert.equal(db.users[0].avatarFileId, "file-old");
  }
});

test("avatar JSON workspace authority rejects archived staging and final commits", async () => {
  const archivedDb = createDb();
  archivedDb.organizations[0].deletedAt = "2026-08-09T06:31:00.000Z";
  const archived = runtime({ db: archivedDb });
  await assert.rejects(
    archived.repository.stageUploadCleanup(uploadInput()),
    (error) =>
      error.statusCode === 403 &&
      error.code === "AVATAR_WORKSPACE_SCOPE_DENIED",
  );
  assert.equal(archivedDb.avatarMutationOperations.length, 0);

  for (const operation of ["upload", "delete"]) {
    const db = createDb();
    let archivedAtCommit = false;
    const { repository } = runtime({
      db,
      beforeAuditCommit() {
        if (archivedAtCommit) return;
        archivedAtCommit = true;
        db.organizations[0].deletedAt = "2026-08-09T06:31:00.000Z";
      },
    });
    if (operation === "upload") {
      await repository.stageUploadCleanup(uploadInput());
    }
    const mutation =
      operation === "upload"
        ? repository.saveUploadWithAudit(uploadInput())
        : repository.deleteWithAudit(
            deleteInput({ expectedAvatarFileId: "file-old" }),
          );
    await assert.rejects(
      mutation,
      (error) =>
        error.statusCode === 403 &&
        error.code === "AVATAR_WORKSPACE_SCOPE_DENIED",
    );
    assert.equal(db.idempotencyKeys.length, 0);
    assert.equal(db.auditLogs.length, 0);
    assert.equal(db.users[0].avatarFileId, "file-old");
    assert.equal(
      db.avatarMutationOperations.length,
      operation === "upload" ? 1 : 0,
    );
  }
});

test("Firebase avatar authority follows the complete session binding group", async () => {
  const db = createDb();
  db.sessions = [];
  db.authSessions = [
    {
      id: "auth-session-e1",
      userId: "user-a",
      sessionKey: "binding-e1",
      revokedAt: null,
    },
    {
      id: "auth-session-e1-alias",
      userId: "user-a",
      sessionKey: "binding-e1",
      revokedAt: null,
    },
  ];
  const { repository } = runtime({ db });
  assert.equal(await repository.findReplay(uploadInput()), null);

  db.authSessions[1].revokedAt = "2026-08-09T06:31:00.000Z";
  await assert.rejects(
    repository.findReplay(uploadInput()),
    (error) =>
      error.statusCode === 409 && error.code === "AUTH_SESSION_REPLACED",
  );
});

test("PostgreSQL avatar authority locks the exact session binding and rejects a revoked sibling", async () => {
  const active = sqlAuthorityRuntime();
  assert.equal(await active.repository.findReplay(uploadInput()), null);
  assert.ok(
    active.queries.some(
      ({ sql, params }) =>
        sql.includes("FROM auth_sessions") &&
        sql.includes("WHERE id = $1 AND user_id = $2") &&
        sql.includes("FOR UPDATE") &&
        params[0] === "auth-session-e1",
    ),
  );
  assert.ok(
    active.queries.some(
      ({ sql, params }) =>
        sql.includes("refresh_token_hash = $2") &&
        sql.includes("FOR UPDATE") &&
        params[1] === "binding-e1",
    ),
  );

  const revoked = sqlAuthorityRuntime({
    bindingRows: [
      { id: "auth-session-e1", user_id: "user-a", revoked_at: null },
      {
        id: "auth-session-e1-alias",
        user_id: "user-a",
        revoked_at: "2026-08-09T06:31:00.000Z",
      },
    ],
  });
  await assert.rejects(
    revoked.repository.findReplay(uploadInput()),
    (error) =>
      error.statusCode === 409 && error.code === "AUTH_SESSION_REPLACED",
  );
  assert.ok(revoked.queries.some(({ sql }) => sql === "ROLLBACK"));
});

test("PostgreSQL avatar workspace lock rejects archived staging and a late commit", async () => {
  const archived = sqlAuthorityRuntime({
    workspaceDeletedAt: "2026-08-09T06:31:00.000Z",
  });
  await assert.rejects(
    archived.repository.stageUploadCleanup(uploadInput()),
    (error) =>
      error.statusCode === 403 &&
      error.code === "AVATAR_WORKSPACE_SCOPE_DENIED",
  );
  assert.ok(archived.queries.some(({ sql }) => sql === "ROLLBACK"));

  const late = sqlAuthorityRuntime();
  await late.repository.stageUploadCleanup(uploadInput());
  late.workspaceRow.deleted_at = "2026-08-09T06:31:00.000Z";
  await assert.rejects(
    late.repository.saveUploadWithAudit(uploadInput()),
    (error) =>
      error.statusCode === 403 &&
      error.code === "AVATAR_WORKSPACE_SCOPE_DENIED",
  );
  assert.ok(
    late.queries.some(
      ({ sql, params }) =>
        sql.includes("SELECT id, status, deleted_at FROM organizations") &&
        sql.includes("FOR UPDATE") &&
        params[0] === "org-a",
    ),
  );
  assert.ok(late.queries.some(({ sql }) => sql === "ROLLBACK"));
});

test("mutations report pending cleanup and leave provider deletion to the autonomous worker", async () => {
  const { db, repository } = runtime();
  const puts = [];
  const deletes = [];
  const storageAdapter = {
    async putBuffer(objectKey, buffer, contentType) {
      puts.push({ objectKey, byteSize: buffer.length, contentType });
      return { provider: "local", objectKey, byteSize: buffer.length };
    },
    async deleteObject(objectKey) {
      deletes.push(objectKey);
      return { deleted: true, objectKey };
    },
  };

  const uploaded = await executeAvatarUploadMutation({
    repository,
    storageAdapter,
    buffer: Buffer.alloc(24, 1),
    contentType: "image/png",
    input: uploadInput(),
  });
  assert.equal(puts.length, 1);
  assert.equal(uploaded.cleanup.status, "pending");
  assert.equal(db.avatarMutationOperations[0].cleanupStatus, "pending");
  assert.equal(db.avatarMutationOperations[0].cleanupAttempts, 0);
  assert.equal(deletes.length, 0);

  const replay = await executeAvatarUploadMutation({
    repository,
    storageAdapter,
    buffer: Buffer.alloc(24, 1),
    contentType: "image/png",
    input: uploadInput(),
  });
  assert.equal(puts.length, 1, "an exact replay must not upload bytes again");
  assert.equal(replay.replayed, true);
  assert.equal(replay.cleanup.status, "pending");
  assert.equal(deletes.length, 0);

  const deleted = await executeAvatarDeleteMutation({
    repository,
    storageAdapter,
    input: deleteInput(),
  });
  assert.equal(deleted.deleted, true);
  assert.equal(deleted.cleanup.status, "pending");
  assert.equal(db.users[0].avatarFileId, "");

  const auditCount = db.auditLogs.length;
  const replayDelete = await executeAvatarDeleteMutation({
    repository,
    storageAdapter,
    input: deleteInput(),
  });
  assert.equal(replayDelete.replayed, true);
  assert.equal(db.auditLogs.length, auditCount);
  assert.equal(deletes.length, 0);
});

test("autonomous avatar cleanup retries a provider failure and completes without another user mutation", async () => {
  let nowMs = Date.parse(FIXED_TIME);
  const { db, repository } = runtime({
    nowIso: () => new Date(nowMs).toISOString(),
  });
  await repository.saveUploadWithAudit(uploadInput());
  const oldObjectKey = "org/org-a/avatars/user-a/file-old-old.png";
  const providerObjects = new Set([oldObjectKey]);
  let failuresRemaining = 1;
  const storageAdapter = {
    async deleteObject(objectKey) {
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw Object.assign(new Error("provider temporarily unavailable"), {
          code: "PROVIDER_UNAVAILABLE",
        });
      }
      providerObjects.delete(objectKey);
      return { deleted: true, objectKey };
    },
  };
  const worker = cleanupWorker({ repository, storageAdapter });

  const first = await worker.runOnce();
  assert.equal(first.failed, 1);
  assert.equal(db.avatarMutationOperations[0].cleanupStatus, "pending");
  assert.equal(db.avatarMutationOperations[0].cleanupAttempts, 1);
  assert.equal(providerObjects.has(oldObjectKey), true);

  nowMs += 1_001;
  const second = await worker.runOnce();
  assert.equal(second.completed, 1);
  assert.equal(providerObjects.has(oldObjectKey), false);
  assert.equal(db.avatarMutationOperations[0].cleanupStatus, "completed");
  assert.equal(db.avatarMutationOperations[0].cleanupAttempts, 2);
  assert.equal(db.idempotencyKeys[0].responseResource.cleanup.status, "completed");

  const metrics = await worker.metrics();
  assert.equal(metrics.pending, 0);
  assert.equal(metrics.completed, 1);
  assert.equal(metrics.deadLettered, 0);
  assert.equal(metrics.retention.overdue, 0);
});

test("worker start performs an immediate startup sweep and stop releases its schedule", async () => {
  const { db, repository } = runtime();
  await repository.saveUploadWithAudit(uploadInput());
  const deleted = [];
  const worker = cleanupWorker({
    repository,
    storageAdapter: {
      async deleteObject(objectKey) {
        deleted.push(objectKey);
        return { deleted: true, objectKey };
      },
    },
  });

  const startup = await worker.start();
  await worker.stop();

  assert.equal(startup.claimed, 1);
  assert.equal(startup.completed, 1);
  assert.deepEqual(deleted, ["org/org-a/avatars/user-a/file-old-old.png"]);
  assert.equal(db.avatarMutationOperations[0].cleanupStatus, "completed");
});

test("concurrent cleanup workers use a single-owner lease and never delete an active avatar object", async () => {
  let nowMs = Date.parse(FIXED_TIME);
  const { db, repository } = runtime({
    nowIso: () => new Date(nowMs).toISOString(),
  });
  await repository.saveUploadWithAudit(uploadInput());
  let deleteCalls = 0;
  let releaseDelete;
  const deleteBlocked = new Promise((resolve) => {
    releaseDelete = resolve;
  });
  let deleteStarted;
  const started = new Promise((resolve) => {
    deleteStarted = resolve;
  });
  const storageAdapter = {
    async deleteObject() {
      deleteCalls += 1;
      deleteStarted();
      await deleteBlocked;
      return { deleted: true };
    },
  };
  const workerA = cleanupWorker({
    repository,
    storageAdapter,
    workerId: "avatar-worker-a",
  });
  const workerB = cleanupWorker({
    repository,
    storageAdapter,
    workerId: "avatar-worker-b",
  });

  const runA = workerA.runOnce();
  await started;
  const runB = workerB.runOnce();
  const resultB = await runB;
  assert.equal(resultB.claimed, 0);
  releaseDelete();
  await runA;
  assert.equal(deleteCalls, 1);
  assert.equal(db.avatarMutationOperations[0].cleanupStatus, "completed");

  const activeObjectKey = "org/org-a/avatars/user-a/file-new-new.png";
  const activeOperation = {
    ...db.avatarMutationOperations[0],
    id: "avatar_cleanup_active_object",
    idempotencyKey: "active-object-key",
    cleanupObjectKey: activeObjectKey,
    cleanupStatus: "pending",
    cleanupAttempts: 0,
    nextAttemptAt: new Date(nowMs).toISOString(),
    leaseOwner: "",
    leaseExpiresAt: "",
    completedAt: "",
    deadLetteredAt: "",
  };
  db.avatarMutationOperations.unshift(activeOperation);
  let unsafeDeleteCalls = 0;
  const safetyWorker = cleanupWorker({
    repository,
    workerId: "avatar-worker-safety",
    storageAdapter: {
      async deleteObject() {
        unsafeDeleteCalls += 1;
      },
    },
  });
  const safetyResult = await safetyWorker.runOnce();
  assert.equal(safetyResult.deadLettered, 1);
  assert.equal(unsafeDeleteCalls, 0);
  assert.equal(activeOperation.cleanupStatus, "dead_letter");
  assert.equal(activeOperation.lastErrorCode, "AVATAR_CLEANUP_OBJECT_ACTIVE");
});

test("cleanup retry is bounded, dead-letters after max attempts and exposes retention metrics", async () => {
  let nowMs = Date.parse(FIXED_TIME);
  const { db, repository } = runtime({
    nowIso: () => new Date(nowMs).toISOString(),
  });
  await repository.saveUploadWithAudit(uploadInput());
  let providerDeleteCalls = 0;
  const worker = cleanupWorker({
    repository,
    maxAttempts: 2,
    retentionMillis: 500,
    storageAdapter: {
      async deleteObject() {
        providerDeleteCalls += 1;
        throw Object.assign(new Error("provider down"), { code: "PROVIDER_DOWN" });
      },
    },
  });

  await worker.runOnce();
  nowMs += 1_001;
  const exhausted = await worker.runOnce();
  assert.equal(exhausted.deadLettered, 1);
  assert.equal(db.avatarMutationOperations[0].cleanupStatus, "dead_letter");
  assert.equal(db.avatarMutationOperations[0].cleanupAttempts, 2);
  assert.ok(db.avatarMutationOperations[0].deadLetteredAt);
  assert.equal(providerDeleteCalls, 2);
  assert.equal(
    db.idempotencyKeys[0].responseResource.cleanup.status,
    "dead_letter",
  );

  const ownerStatus = await repository.getCleanupStatus({
    userId: "user-a",
    organizationId: "org-a",
  });
  assert.deepEqual(Object.keys(ownerStatus), [
    "userId",
    "workspaceId",
    "status",
    "operationId",
    "action",
    "previousFileId",
    "attempts",
    "lastErrorCode",
    "updatedAt",
    "manualSupportRequired",
  ]);
  assert.equal(ownerStatus.userId, "user-a");
  assert.equal(ownerStatus.workspaceId, "org-a");
  assert.equal(ownerStatus.status, "dead_letter");
  assert.equal(ownerStatus.manualSupportRequired, true);
  assert.equal(ownerStatus.lastErrorCode, "PROVIDER_DOWN");
  const otherOwnerStatus = await repository.getCleanupStatus({
    userId: "user-b",
    organizationId: "org-b",
  });
  assert.equal(otherOwnerStatus.userId, "user-b");
  assert.equal(otherOwnerStatus.workspaceId, "org-b");
  assert.equal(otherOwnerStatus.status, "not_required");
  assert.equal(otherOwnerStatus.operationId, "");
  db.memberships = [
    {
      id: "membership-user-a-org-b",
      userId: "user-a",
      organizationId: "org-b",
      status: "active",
    },
  ];
  const sameOwnerOtherWorkspaceStatus = await repository.getCleanupStatus({
    userId: "user-a",
    organizationId: "org-b",
  });
  assert.equal(sameOwnerOtherWorkspaceStatus.userId, "user-a");
  assert.equal(sameOwnerOtherWorkspaceStatus.workspaceId, "org-b");
  assert.equal(sameOwnerOtherWorkspaceStatus.status, "not_required");
  assert.equal(sameOwnerOtherWorkspaceStatus.operationId, "");
  assert.doesNotMatch(
    JSON.stringify(sameOwnerOtherWorkspaceStatus),
    /avatar_upload_exact|org-a/,
  );
  db.memberships[0].status = "suspended";
  await assert.rejects(
    repository.getCleanupStatus({
      userId: "user-a",
      organizationId: "org-b",
    }),
    (error) => error.code === "AVATAR_WORKSPACE_SCOPE_DENIED",
  );

  const replay = await executeAvatarUploadMutation({
    repository,
    storageAdapter: {
      async putBuffer() {
        throw new Error("an exact replay must not upload bytes again");
      },
      async deleteObject() {
        providerDeleteCalls += 1;
      },
    },
    buffer: Buffer.alloc(24, 1),
    contentType: "image/png",
    input: uploadInput(),
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.cleanup.status, "dead_letter");
  assert.equal(providerDeleteCalls, 2);
  assert.equal(db.avatarMutationOperations[0].cleanupStatus, "dead_letter");

  nowMs += 10_000;
  const noReplay = await worker.runOnce();
  assert.equal(noReplay.claimed, 0);
  const metrics = await worker.metrics();
  assert.equal(metrics.deadLettered, 1);
  assert.equal(metrics.retention.overdue, 1);
  assert.equal(metrics.retention.policy, "prune_completed_keep_dead_letter");
});

test("retention prunes only completed cleanup history and preserves replay receipts", async () => {
  let nowMs = Date.parse(FIXED_TIME);
  const { db, repository } = runtime({
    nowIso: () => new Date(nowMs).toISOString(),
  });
  await repository.saveUploadWithAudit(uploadInput());
  const worker = cleanupWorker({
    repository,
    retentionMillis: 1_000,
    storageAdapter: {
      async deleteObject(objectKey) {
        return { deleted: true, objectKey };
      },
    },
  });

  await worker.runOnce();
  assert.equal(db.avatarMutationOperations.length, 1);
  assert.equal(db.idempotencyKeys[0].responseResource.cleanup.status, "completed");

  nowMs += 1_001;
  const retained = await worker.runOnce();
  assert.equal(retained.pruned, 1);
  assert.equal(db.avatarMutationOperations.length, 0);
  assert.equal(db.idempotencyKeys[0].responseResource.cleanup.status, "completed");

  const replay = await repository.saveUploadWithAudit(uploadInput());
  assert.equal(replay.replayed, true);
  assert.equal(replay.receipt.cleanup.status, "completed");
});

test("avatar SQL migration and source keep PostgreSQL parity and durable reconciliation", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "047_avatar_mutation_saga.sql"),
    "utf8",
  );
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "avatarMutationRepository.js"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS avatar_mutation_operations/);
  assert.match(migration, /cleanup_status/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(source, /SELECT pg_advisory_xact_lock/);
  assert.match(source, /INSERT INTO storage_files/);
  assert.match(source, /UPDATE users/);
  assert.match(source, /INSERT INTO audit_logs/);
  assert.match(source, /INSERT INTO mutation_idempotency/);
  assert.match(source, /avatar_mutation_operations/);
  assert.match(source, /BEGIN/);
  assert.match(source, /ROLLBACK/);
  const workerMigration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "048_avatar_cleanup_worker.sql"),
    "utf8",
  );
  assert.match(workerMigration, /cleanup_next_attempt_at/);
  assert.match(workerMigration, /cleanup_lease_owner/);
  assert.match(workerMigration, /dead_letter/);
  assert.match(workerMigration, /SKIP LOCKED/);
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /pruneCleanupHistory/);
  const authorityMigration = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "db",
      "migrations",
      "051_avatar_auth_session_authority.sql",
    ),
    "utf8",
  );
  assert.match(authorityMigration, /avatar_mutation_operations[\s\S]*auth_session_id/);
  assert.match(authorityMigration, /mutation_idempotency[\s\S]*auth_session_id/);
  assert.match(source, /FROM auth_sessions[\s\S]*refresh_token_hash[\s\S]*FOR UPDATE/);
  assert.match(source, /AUTH_SESSION_REPLACED/);
  assert.match(
    source,
    /SELECT id, status, deleted_at FROM organizations[\s\S]*FOR UPDATE/,
  );
  const server = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8",
  );
  assert.match(server, /createAvatarCleanupWorker/);
  assert.match(server, /avatarCleanupWorker\.start\(\)/);
  assert.match(server, /process\.on\("SIGTERM"/);
  assert.match(server, /avatarCleanupWorker\.stop\(\)/);
});
