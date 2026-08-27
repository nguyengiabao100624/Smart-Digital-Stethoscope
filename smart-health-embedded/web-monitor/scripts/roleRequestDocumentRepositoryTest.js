const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createRoleRequestDocumentRepository,
  persistRoleRequestDocumentUpload,
} = require("../src/roleRequestDocumentRepository");
const {
  validateAndNormalizeImportGraph,
} = require("./migrateJsonToPostgres");

const FIXED_TIME = "2026-08-01T08:30:00.000Z";

function createDocument(overrides = {}) {
  return {
    id: "doctor_doc_exact",
    userId: "user-a",
    organizationId: "org-a",
    name: "license.pdf",
    contentType: "application/pdf",
    byteSize: 19,
    sha256: "a".repeat(64),
    objectKey: "org/org-a/doctor-documents/user-a/doctor_doc_exact-license.pdf",
    storageProvider: "local",
    uploadedAt: FIXED_TIME,
    ...overrides,
  };
}

function createInput(overrides = {}) {
  return {
    userId: "user-a",
    organizationId: "org-a",
    operationId: "role_request_document_exact",
    document: createDocument(),
    idempotency: {
      scope: "user-a",
      operation: "auth.role_request.document.upload",
      key: "role-document-key",
      fingerprint: "fingerprint-a",
    },
    audit: {
      actorUserId: "user-a",
      organizationId: "org-a",
      action: "doctor.role_request.document.upload",
      ip: "127.0.0.1",
      userAgent: "role-document-test",
    },
    ...overrides,
  };
}

function createObjectOwnership() {
  return {
    userId: "user-a",
    organizationId: "org-a",
    documentId: "doctor_doc_exact",
  };
}

function createRuntime() {
  let sequence = 0;
  const db = {
    organizations: [
      { id: "org-a", status: "active" },
      { id: "org-b", status: "active" },
    ],
    users: [
      {
        id: "user-a",
        organizationId: "org-a",
        accountStatus: "active",
        roleRequestDocuments: [],
      },
      {
        id: "user-b",
        organizationId: "org-b",
        accountStatus: "active",
        roleRequestDocuments: [],
      },
    ],
    roleRequestDocuments: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  return {
    db,
    repository: createRoleRequestDocumentRepository({
      getDb: () => db,
      saveDb: async () => {},
      createId: (prefix) => `${prefix}-${++sequence}`,
      nowIso: () => FIXED_TIME,
      getPool: () => null,
    }),
  };
}

function createSqlRuntime(existingReplay = null) {
  let sequence = 0;
  const queries = [];
  const db = {
    organizations: [{ id: "org-a", status: "active" }],
    users: [
      {
        id: "user-a",
        organizationId: "org-a",
        accountStatus: "active",
        roleRequestDocuments: [],
      },
    ],
    roleRequestDocuments: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) {
        return { rows: [] };
      }
      if (normalized.includes("SELECT pg_advisory_xact_lock")) {
        return { rows: [] };
      }
      if (normalized.includes("FROM mutation_idempotency")) {
        return { rows: existingReplay ? [existingReplay] : [] };
      }
      if (normalized.startsWith("SELECT id, organization_id, account_status FROM users")) {
        return {
          rows: [
            {
              id: "user-a",
              organization_id: "org-a",
              account_status: "active",
            },
          ],
        };
      }
      if (normalized.startsWith("SELECT id, status FROM organizations")) {
        return { rows: [{ id: "org-a", status: "active" }] };
      }
      if (normalized.startsWith("SELECT COUNT(*)::integer AS document_count")) {
        return { rows: [{ document_count: 0 }] };
      }
      if (normalized.startsWith("SELECT 1 FROM role_request_documents")) {
        return {
          rows:
            params[0] === "doctor_doc_exact" &&
            params[1] === "user-a" &&
            params[2] === "org-a" &&
            params[3] === createDocument().objectKey
              ? [{ "?column?": 1 }]
              : [],
        };
      }
      if (normalized.includes("INSERT INTO role_request_documents")) {
        const document = createDocument();
        return {
          rows: [
            {
              id: document.id,
              user_id: document.userId,
              organization_id: document.organizationId,
              name: document.name,
              content_type: document.contentType,
              byte_size: document.byteSize,
              sha256: document.sha256,
              object_key: document.objectKey,
              storage_provider: document.storageProvider,
              uploaded_at: document.uploadedAt,
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
      throw new Error(`Unexpected SQL in role document test: ${normalized}`);
    },
    release() {},
  };
  return {
    db,
    queries,
    repository: createRoleRequestDocumentRepository({
      getDb: () => db,
      saveDb: async () => {},
      createId: (prefix) => `${prefix}-${++sequence}`,
      nowIso: () => FIXED_TIME,
      getPool: () => ({ connect: async () => client }),
    }),
  };
}

test("runtime role document upload is exact, account-bound, audited and idempotent", async () => {
  const { db, repository } = createRuntime();
  const input = createInput();

  assert.equal(await repository.findReplay(input), null);
  const created = await repository.saveWithAudit(input);
  assert.equal(created.replayed, false);
  assert.equal(created.operationId, input.operationId);
  assert.deepEqual(Object.keys(created.document), [
    "id",
    "userId",
    "organizationId",
    "name",
    "contentType",
    "byteSize",
    "sha256",
    "uploadedAt",
  ]);
  assert.equal(Object.hasOwn(created.document, "objectKey"), false);
  assert.equal(db.roleRequestDocuments.length, 1);
  assert.equal(db.users[0].roleRequestDocuments.length, 1);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.auditLogs[0].resourceId, input.document.id);
  assert.equal(db.auditLogs[0].metadata.sha256, input.document.sha256);
  assert.equal(db.idempotencyKeys.length, 1);
  assert.equal(
    await repository.isObjectCommitted({
      ...createObjectOwnership(),
      objectKey: input.document.objectKey,
    }),
    true,
  );
  assert.equal(
    await repository.isObjectCommitted({
      ...createObjectOwnership(),
      objectKey:
        "org/org-a/doctor-documents/user-a/uncommitted-license.pdf",
    }),
    false,
  );

  const replay = await repository.findReplay(input);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.document, created.document);
  assert.equal(replay.operationId, created.operationId);
  const replayFromCommit = await repository.saveWithAudit(input);
  assert.deepEqual(replayFromCommit, replay);
  assert.equal(db.roleRequestDocuments.length, 1);
  assert.equal(db.users[0].roleRequestDocuments.length, 1);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.idempotencyKeys.length, 1);

  await assert.rejects(
    repository.findReplay({
      ...input,
      idempotency: { ...input.idempotency, fingerprint: "fingerprint-b" },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );
  await assert.rejects(
    repository.findReplay({
      ...input,
      userId: "user-b",
    }),
    (error) => error.code === "ROLE_REQUEST_DOCUMENT_SCOPE_DENIED",
  );
  await assert.rejects(
    repository.findReplay({
      ...input,
      organizationId: "org-b",
      document: createDocument({ organizationId: "org-b" }),
    }),
    (error) => error.code === "ROLE_REQUEST_DOCUMENT_WORKSPACE_DENIED",
  );
  await assert.rejects(
    repository.saveWithAudit({
      ...createInput({
        idempotency: {
          ...input.idempotency,
          key: "cross-object-key",
          fingerprint: "cross-object-key-fingerprint",
        },
      }),
      document: createDocument({
        objectKey:
          "org/org-b/doctor-documents/user-b/doctor_doc_exact-license.pdf",
      }),
    }),
    (error) => error.code === "ROLE_REQUEST_DOCUMENT_OBJECT_SCOPE_DENIED",
  );
  for (let index = 1; index < 10; index += 1) {
    db.roleRequestDocuments.push(
      createDocument({
        id: `doctor_doc_filler_${index}`,
        objectKey: `org/org-a/doctor-documents/user-a/doctor_doc_filler_${index}.pdf`,
      }),
    );
  }
  assert.equal((await repository.findReplay(input)).replayed, true);
  await assert.rejects(
    repository.findReplay({
      ...input,
      idempotency: {
        ...input.idempotency,
        key: "role-document-eleven",
        fingerprint: "fingerprint-eleven",
      },
    }),
    (error) => error.code === "ROLE_REQUEST_DOCUMENT_LIMIT_REACHED",
  );
  db.users[0].accountStatus = "locked";
  await assert.rejects(
    repository.findReplay(input),
    (error) => error.code === "ACCOUNT_INACTIVE",
  );
  db.users[0].accountStatus = "active";
  db.organizations[0].status = "archived";
  await assert.rejects(
    repository.findReplay(input),
    (error) => error.code === "ROLE_REQUEST_DOCUMENT_WORKSPACE_INACTIVE",
  );
});

test("Postgres role document upload commits record, audit and receipt in one transaction", async () => {
  const { db, queries, repository } = createSqlRuntime();

  const created = await repository.saveWithAudit(createInput());

  assert.equal(created.replayed, false);
  assert.equal(created.document.userId, "user-a");
  assert.equal(created.document.organizationId, "org-a");
  assert.equal(queries[0].sql, "BEGIN");
  assert.equal(queries.at(-1).sql, "COMMIT");
  assert.ok(
    queries.some(({ sql }) => sql.includes("INSERT INTO role_request_documents")),
  );
  assert.ok(queries.some(({ sql }) => sql.includes("INSERT INTO audit_logs")));
  assert.ok(
    queries.some(({ sql }) => sql.includes("INSERT INTO mutation_idempotency")),
  );
  assert.equal(db.roleRequestDocuments.length, 1);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.idempotencyKeys.length, 1);
  assert.equal(
    await repository.isObjectCommitted({
      ...createObjectOwnership(),
      objectKey: createDocument().objectKey,
    }),
    true,
  );
});

test("Postgres exact replay returns the stored receipt without another write", async () => {
  const storedReceipt = {
    document: {
      id: "doctor_doc_exact",
      userId: "user-a",
      organizationId: "org-a",
      name: "license.pdf",
      contentType: "application/pdf",
      byteSize: 19,
      sha256: "a".repeat(64),
      uploadedAt: FIXED_TIME,
    },
    operationId: "role_request_document_exact",
  };
  const { queries, repository } = createSqlRuntime({
    fingerprint: "fingerprint-a",
    response_status: 201,
    response_json: storedReceipt,
  });

  const replay = await repository.saveWithAudit(createInput());

  assert.deepEqual(replay, { ...storedReceipt, replayed: true });
  assert.equal(
    queries.some(({ sql }) => sql.includes("INSERT INTO role_request_documents")),
    false,
  );
  assert.equal(
    queries.some(({ sql }) => sql.includes("INSERT INTO audit_logs")),
    false,
  );
  assert.equal(
    queries.some(({ sql }) => sql.includes("INSERT INTO mutation_idempotency")),
    false,
  );
  assert.equal(queries[0].sql, "BEGIN");
  assert.equal(queries.at(-1).sql, "COMMIT");
});

test("uploaded role documents clean every uncommitted object", async (t) => {
  for (const code of [
    "ACCOUNT_INACTIVE",
    "ROLE_REQUEST_DOCUMENT_WORKSPACE_INACTIVE",
    "ROLE_REQUEST_DOCUMENT_SCOPE_DENIED",
    "DB_WRITE_FAILED",
  ]) {
    await t.test(code, async () => {
      const deleted = [];
      const failure = Object.assign(new Error(code), { code });
      await assert.rejects(
        persistRoleRequestDocumentUpload({
          storageAdapter: {
            putBuffer: async () => ({ provider: "local", byteSize: 19 }),
            deleteObject: async (objectKey) => deleted.push(objectKey),
          },
          repository: {
            saveWithAudit: async () => {
              throw failure;
            },
            isObjectCommitted: async () => false,
          },
          objectKey: createDocument().objectKey,
          objectOwnership: createObjectOwnership(),
          buffer: Buffer.from("role-document-bytes"),
          contentType: "application/pdf",
          createSaveInput: () => createInput(),
        }),
        (error) => error === failure,
      );
      assert.deepEqual(deleted, [createDocument().objectKey]);
    });
  }
});

test("exact concurrent role document replay preserves the committed object", async () => {
  const { repository } = createRuntime();
  const deleted = [];
  const storageAdapter = {
    putBuffer: async () => ({ provider: "local", byteSize: 19 }),
    deleteObject: async (objectKey) => deleted.push(objectKey),
  };
  const upload = () =>
    persistRoleRequestDocumentUpload({
      storageAdapter,
      repository,
      objectKey: createDocument().objectKey,
      objectOwnership: createObjectOwnership(),
      buffer: Buffer.from("role-document-bytes"),
      contentType: "application/pdf",
      createSaveInput: () => createInput(),
    });

  const outcomes = await Promise.all([upload(), upload()]);

  assert.deepEqual(
    outcomes.map((outcome) => outcome.replayed).sort(),
    [false, true],
  );
  assert.deepEqual(deleted, []);
});

test("a concurrent precommit failure cannot delete an exact winner object", async () => {
  const objectKey = createDocument().objectKey;
  const storedObjects = new Set();
  let saveAttempt = 0;
  let winnerCommitted = false;
  const storageAdapter = {
    putBuffer: async (candidateKey) => {
      storedObjects.add(candidateKey);
      return { provider: "local", byteSize: 19 };
    },
    deleteObject: async (candidateKey) => {
      storedObjects.delete(candidateKey);
      return { deleted: true };
    },
  };
  const repository = {
    saveWithAudit: async () => {
      saveAttempt += 1;
      if (saveAttempt === 1) {
        winnerCommitted = true;
        return {
          document: createDocument(),
          operationId: "role_request_document_exact",
          replayed: false,
        };
      }
      throw Object.assign(new Error("account locked after exact winner"), {
        code: "ACCOUNT_INACTIVE",
        backendCommitted: false,
      });
    },
    isObjectCommitted: async ({ objectKey: candidateKey }) =>
      winnerCommitted && candidateKey === objectKey,
  };
  const upload = () =>
    persistRoleRequestDocumentUpload({
      storageAdapter,
      repository,
      objectKey,
      objectOwnership: createObjectOwnership(),
      buffer: Buffer.from("role-document-bytes"),
      contentType: "application/pdf",
      createSaveInput: () => createInput(),
    });

  const outcomes = await Promise.allSettled([upload(), upload()]);

  assert.equal(outcomes[0].status, "fulfilled");
  assert.equal(outcomes[1].status, "rejected");
  assert.equal(outcomes[1].reason.code, "ACCOUNT_INACTIVE");
  assert.equal(
    storedObjects.has(objectKey),
    true,
    "cleanup from the failed exact attempt must preserve the committed winner object",
  );
});

test("an acknowledged backend commit never deletes the uploaded object", async () => {
  const deleted = [];
  const committedFailure = Object.assign(new Error("runtime projection failed"), {
    backendCommitted: true,
  });

  await assert.rejects(
    persistRoleRequestDocumentUpload({
      storageAdapter: {
        putBuffer: async () => ({ provider: "local", byteSize: 19 }),
        deleteObject: async (objectKey) => deleted.push(objectKey),
      },
      repository: {
        saveWithAudit: async () => {
          throw committedFailure;
        },
        isObjectCommitted: async () => true,
      },
      objectKey: createDocument().objectKey,
      objectOwnership: createObjectOwnership(),
      buffer: Buffer.from("role-document-bytes"),
      contentType: "application/pdf",
      createSaveInput: () => createInput(),
    }),
    (error) => error === committedFailure,
  );
  assert.deepEqual(deleted, []);
});

test("role document migration rejects a cross-tenant storage pointer", () => {
  const document = createDocument({
    objectKey:
      "org/org-b/doctor-documents/user-b/doctor_doc_exact-license.pdf",
  });
  const db = {
    organizations: [
      {
        id: "org-a",
        name: "Organization A",
        type: "clinic",
        workspaceType: "clinic",
        status: "active",
      },
    ],
    users: [
      {
        id: "user-a",
        email: "user-a@example.test",
        role: "patient",
        organizationId: "org-a",
        accountStatus: "active",
      },
    ],
    memberships: [
      {
        id: "membership-a",
        userId: "user-a",
        organizationId: "org-a",
        role: "patient",
        status: "active",
      },
    ],
    roleRequestDocuments: [document],
  };

  assert.throws(
    () => validateAndNormalizeImportGraph(db),
    (error) =>
      error.code === "IMPORT_REFERENCE_VALIDATION_FAILED" &&
      error.details.issues.some(
        (issue) =>
          issue.code === "IMPORT_ROLE_REQUEST_DOCUMENT_OBJECT_SCOPE_MISMATCH" &&
          issue.entityId === document.id,
      ),
  );
});

test("role document migration creates a private account and tenant ledger", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "046_role_request_documents.sql"),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS role_request_documents/);
  assert.match(migration, /user_id text NOT NULL REFERENCES users/);
  assert.match(migration, /organization_id text NOT NULL REFERENCES organizations/);
  assert.match(migration, /sha256 text NOT NULL CHECK/);
  assert.match(migration, /ALTER TABLE role_request_documents ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE role_request_documents FROM PUBLIC/);

  const importer = fs.readFileSync(
    path.join(__dirname, "migrateJsonToPostgres.js"),
    "utf8",
  );
  assert.match(importer, /INSERT INTO role_request_documents/);
  assert.match(importer, /roleRequestDocuments/);
});
