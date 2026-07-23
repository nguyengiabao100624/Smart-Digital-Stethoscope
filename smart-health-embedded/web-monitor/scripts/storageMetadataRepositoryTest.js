const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  normalizeStorageBucketCreate,
  normalizeStorageFileCreate,
} = require("../src/storageMetadataContract");
const { createStorageMetadataRepository } = require("../src/storageMetadataRepository");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createRuntimeDb() {
  return {
    storageBuckets: [],
    storageFiles: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
}

function createIdFactory() {
  let sequence = 0;
  return (prefix) => `${prefix}_${++sequence}`;
}

function idempotency(operation, key, fingerprint) {
  return { scope: "workspace:org_test", operation, key, fingerprint };
}

function audit(action) {
  return {
    action,
    actorUserId: "user_admin",
    organizationId: "org_test",
    ip: "127.0.0.1",
    userAgent: "storage-test",
  };
}

function fileInput(overrides = {}) {
  return {
    id: "file_1",
    organizationId: "org_test",
    bucket: "clinical-docs",
    name: "report.pdf",
    objectKey: "org/org_test/storage/clinical-docs/file_1-report.pdf",
    storageProvider: "local",
    contentType: "application/pdf",
    type: "pdf",
    byteSize: 128,
    checksum: "a".repeat(64),
    tags: ["report"],
    uploader: "Admin",
    createdByUserId: "user_admin",
    ...overrides,
  };
}

test("storage contract rejects unsupported policy claims and normalizes canonical metadata", () => {
  assert.throws(
    () => normalizeStorageBucketCreate({ name: "Public", visibility: "public" }),
    (error) => error.code === "STORAGE_VISIBILITY_UNSUPPORTED",
  );
  assert.throws(
    () => normalizeStorageBucketCreate({ name: "Quota", quotaGb: 100 }),
    (error) => error.code === "STORAGE_POLICY_UNSUPPORTED",
  );
  const bucket = normalizeStorageBucketCreate({
    name: "Hồ sơ lâm sàng",
    allowedExtensions: [".PDF", "pdf"],
    allowedMimeTypes: ["application/pdf"],
    maxFileSizeMb: 25,
  });
  assert.equal(bucket.id, "ho-so-lam-sang");
  assert.deepEqual(bucket.allowedExtensions, ["pdf"]);
  assert.equal(bucket.maxFileSizeMb, 25);

  const file = normalizeStorageFileCreate(fileInput());
  assert.equal(file.status, "active");
  assert.equal(file.checksum, "a".repeat(64));
  assert.throws(
    () => normalizeStorageFileCreate(fileInput({ checksum: "bad" })),
    (error) => error.code === "STORAGE_FILE_CHECKSUM_INVALID",
  );
});

test("storage migration, importer, HTTP route and OpenAPI stay wired to the canonical contract", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "038_storage_metadata.sql"),
    "utf8",
  );
  const importer = fs.readFileSync(path.join(__dirname, "migrateJsonToPostgres.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const openapi = fs.readFileSync(
    path.join(__dirname, "..", "public", "openapi.yaml"),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS storage_buckets/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS storage_files/);
  assert.match(migration, /organization_id text NOT NULL REFERENCES organizations\(id\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE storage_buckets, storage_files FROM PUBLIC/);
  assert.doesNotMatch(migration, /quota|retention|encryption|required_visibility/i);

  assert.match(importer, /INSERT INTO storage_buckets/);
  assert.match(importer, /INSERT INTO storage_files/);
  assert.match(importer, /checksum_sha256/);
  assert.match(server, /STORAGE_SHARE_PROVIDER_UNAVAILABLE/);
  assert.match(server, /storageAdapter\.provider !== "s3"/);
  assert.doesNotMatch(server, /:\s*record\.downloadUrl;\s*return \{ url: shareUrl/);

  for (const route of [
    "/admin/storage-buckets:",
    "/admin/storage-files:",
    "/admin/storage-files/{fileId}/share:",
  ]) {
    assert.ok(openapi.includes(route), `OpenAPI is missing ${route}`);
  }
  assert.match(openapi, /StorageBucketCreateInput:[\s\S]*additionalProperties: false/);
  assert.match(openapi, /summary: Create an audited 15-minute HTTPS signed URL/);
});

test("JSON storage repository keeps mutation outcome, audit and cleanup lifecycle atomic", async () => {
  const db = createRuntimeDb();
  let saves = 0;
  const repository = createStorageMetadataRepository({
    getDb: () => db,
    saveDb: async () => {
      saves += 1;
    },
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
  });

  const bucketIntent = {
    payload: { id: "clinical-docs", name: "Clinical docs", maxFileSizeMb: 25 },
    idempotency: idempotency("storage.bucket.create", "bucket-create", "bucket-v1"),
    audit: audit("storage.bucket.create"),
  };
  const createdBucket = await repository.buckets.create(bucketIntent);
  assert.equal(createdBucket.responseStatus, 201);
  assert.equal(db.storageBuckets.length, 1);
  const replayedBucket = await repository.buckets.create(bucketIntent);
  assert.equal(replayedBucket.replayed, true);
  assert.equal(db.storageBuckets.length, 1);
  await assert.rejects(
    repository.buckets.create({
      ...bucketIntent,
      idempotency: { ...bucketIntent.idempotency, fingerprint: "bucket-v2" },
    }),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED",
  );

  let prepares = 0;
  const fileIntent = {
    prepareFile: async () => {
      prepares += 1;
      return fileInput();
    },
    idempotency: idempotency("storage.file.upload", "file-upload", "file-v1"),
    audit: audit("storage.upload"),
  };
  const createdFile = await repository.files.create(fileIntent);
  assert.equal(createdFile.responseBody.file.id, "file_1");
  assert.equal(prepares, 1);
  const replayedFile = await repository.files.create(fileIntent);
  assert.equal(replayedFile.replayed, true);
  assert.equal(prepares, 1, "an exact replay must not upload the object again");

  await assert.rejects(
    repository.buckets.remove({
      bucketId: "clinical-docs",
      idempotency: idempotency("storage.bucket.delete", "bucket-delete", "bucket-delete-v1"),
      audit: audit("storage.bucket.delete"),
    }),
    (error) => error.code === "STORAGE_BUCKET_NOT_EMPTY",
  );

  let shareCreates = 0;
  const shareIntent = {
    fileId: "file_1",
    createResponse: async () => {
      shareCreates += 1;
      return { shareUrl: "/signed/file_1", url: "/signed/file_1", expiresInSeconds: 900 };
    },
    idempotency: idempotency("storage.file.share", "file-share", "share-v1"),
    audit: audit("storage.share"),
  };
  await repository.files.recordShare(shareIntent);
  const shareReplay = await repository.files.recordShare(shareIntent);
  assert.equal(shareReplay.replayed, true);
  assert.equal(shareCreates, 1, "an exact replay must not create a second signed URL");

  let objectDeletes = 0;
  const deleteIntent = {
    fileId: "file_1",
    deleteObject: async () => {
      objectDeletes += 1;
    },
    idempotency: idempotency("storage.file.delete", "file-delete", "delete-v1"),
    audit: audit("storage.delete"),
  };
  await repository.files.remove(deleteIntent);
  assert.equal(db.storageFiles[0].status, "deleted");
  const deleteReplay = await repository.files.remove(deleteIntent);
  assert.equal(deleteReplay.replayed, true);
  assert.equal(objectDeletes, 1, "an exact replay must not delete the object twice");

  const removedBucket = await repository.buckets.remove({
    bucketId: "clinical-docs",
    idempotency: idempotency("storage.bucket.delete", "bucket-delete", "bucket-delete-v1"),
    audit: audit("storage.bucket.delete"),
  });
  assert.deepEqual(removedBucket.responseBody, { deleted: true, bucketId: "clinical-docs" });
  assert.equal(db.storageBuckets.length, 0);
  assert.equal(db.auditLogs.length, 5);
  assert.equal(db.idempotencyKeys.length, 5);
  assert.ok(saves >= 5);
});

test("JSON storage upload cleans the object and restores metadata when persistence fails", async () => {
  const db = createRuntimeDb();
  let cleaned = 0;
  const repository = createStorageMetadataRepository({
    getDb: () => db,
    saveDb: async () => {
      throw new Error("simulated disk failure");
    },
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
  });
  await assert.rejects(
    repository.files.create({
      prepareFile: async () => fileInput(),
      cleanupFile: async () => {
        cleaned += 1;
      },
      idempotency: idempotency("storage.file.upload", "upload-fails", "upload-fails-v1"),
      audit: audit("storage.upload"),
    }),
    /simulated disk failure/,
  );
  assert.equal(cleaned, 1);
  assert.equal(db.storageFiles.length, 0);
  assert.equal(db.auditLogs.length, 0);
  assert.equal(db.idempotencyKeys.length, 0);
});

class FakeSql {
  constructor() {
    this.state = {
      storageBuckets: [],
      storageFiles: [],
      auditLogs: [],
      idempotency: [],
    };
    this.snapshot = null;
    this.failNextAudit = false;
  }

  normalize(sql) {
    return sql.replace(/\s+/g, " ").trim().toLowerCase();
  }

  async query(sql, params = []) {
    const query = this.normalize(sql);
    if (query === "begin") {
      this.snapshot = clone(this.state);
      return { rows: [], rowCount: 0 };
    }
    if (query === "commit") {
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (query === "rollback") {
      if (this.snapshot) this.state = this.snapshot;
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (query.includes("pg_advisory_xact_lock")) return { rows: [{}], rowCount: 1 };

    if (query.includes("from mutation_idempotency")) {
      const row = this.state.idempotency.find(
        (item) =>
          item.scope === params[0] &&
          item.operation === params[1] &&
          item.idempotency_key === params[2],
      );
      return { rows: row ? [clone(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (query.startsWith("insert into mutation_idempotency")) {
      const row = {
        id: params[0],
        scope: params[1],
        operation: params[2],
        idempotency_key: params[3],
        fingerprint: params[4],
        resource_type: params[5],
        resource_id: params[6],
        response_status: params[7],
        response_json: JSON.parse(params[8]),
      };
      this.state.idempotency.push(row);
      return { rows: [clone(row)], rowCount: 1 };
    }
    if (query.startsWith("insert into audit_logs")) {
      if (this.failNextAudit) {
        this.failNextAudit = false;
        throw new Error("simulated audit failure");
      }
      const row = {
        id: params[0],
        actor_user_id: params[1],
        organization_id: params[2],
        action: params[3],
        resource_type: params[4],
        resource_id: params[5],
        metadata: JSON.parse(params[8]),
      };
      this.state.auditLogs.push(row);
      return { rows: [clone(row)], rowCount: 1 };
    }

    if (query === "select * from storage_buckets order by created_at asc, id asc") {
      return { rows: clone(this.state.storageBuckets), rowCount: this.state.storageBuckets.length };
    }
    if (query.startsWith("delete from storage_buckets")) {
      const before = this.state.storageBuckets.length;
      this.state.storageBuckets = this.state.storageBuckets.filter((item) => item.id !== params[0]);
      return { rows: [], rowCount: before - this.state.storageBuckets.length };
    }
    if (query.includes("from storage_buckets where id = $1")) {
      const row = this.state.storageBuckets.find((item) => item.id === params[0]);
      return { rows: row ? [clone(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (query.startsWith("insert into storage_buckets")) {
      const row = {
        id: params[0],
        name: params[1],
        description: params[2],
        icon_key: params[3],
        color_key: params[4],
        category: params[5],
        allowed_extensions: JSON.parse(params[6]),
        allowed_mime_types: JSON.parse(params[7]),
        max_file_size_mb: params[8],
        created_by_user_id: params[9],
        created_at: params[10],
        updated_at: params[11],
      };
      this.state.storageBuckets.push(row);
      return { rows: [clone(row)], rowCount: 1 };
    }
    if (query === "select * from storage_files order by created_at desc, id asc") {
      return { rows: clone(this.state.storageFiles), rowCount: this.state.storageFiles.length };
    }
    if (query === "select * from storage_files where status = 'active' order by created_at desc, id asc") {
      const rows = this.state.storageFiles.filter((item) => item.status === "active");
      return { rows: clone(rows), rowCount: rows.length };
    }
    if (query.includes("from storage_files where bucket_id = $1")) {
      const row = this.state.storageFiles.find(
        (item) => item.bucket_id === params[0] && item.status === "active",
      );
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }
    if (query.includes("from storage_files where id = $1")) {
      const activeOnly = query.includes("status = 'active'");
      const row = this.state.storageFiles.find(
        (item) => item.id === params[0] && (!activeOnly || item.status === "active"),
      );
      return { rows: row ? [clone(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (query.startsWith("insert into storage_files")) {
      const row = {
        id: params[0],
        organization_id: params[1],
        bucket_id: params[2],
        name: params[3],
        object_key: params[4],
        storage_provider: params[5],
        content_type: params[6],
        file_type: params[7],
        byte_size: params[8],
        checksum_sha256: params[9],
        firmware_version: params[10],
        tags: JSON.parse(params[11]),
        uploader: params[12],
        created_by_user_id: params[13],
        status: "active",
        deleted_at: null,
        deleted_by_user_id: null,
        created_at: params[14],
        updated_at: params[15],
      };
      this.state.storageFiles.push(row);
      return { rows: [clone(row)], rowCount: 1 };
    }
    if (query.startsWith("update storage_files set status = 'deleted'")) {
      const row = this.state.storageFiles.find((item) => item.id === params[0]);
      row.status = "deleted";
      row.deleted_at = params[1];
      row.deleted_by_user_id = params[2];
      row.updated_at = params[1];
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unhandled fake SQL: ${query}`);
  }
}

test("PostgreSQL storage repository commits metadata, audit and idempotency together", async () => {
  const sql = new FakeSql();
  const db = createRuntimeDb();
  const repository = createStorageMetadataRepository({
    getDb: () => db,
    saveDb: async () => {},
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
    getPool: () => sql,
  });

  const bucketIntent = {
    payload: { id: "clinical-docs", name: "Clinical docs" },
    idempotency: idempotency("storage.bucket.create", "sql-bucket", "sql-bucket-v1"),
    audit: audit("storage.bucket.create"),
  };
  await repository.buckets.create(bucketIntent);
  const bucketReplay = await repository.buckets.create(bucketIntent);
  assert.equal(bucketReplay.replayed, true);
  assert.equal(sql.state.storageBuckets.length, 1);

  const fileIntent = {
    prepareFile: async () => fileInput(),
    idempotency: idempotency("storage.file.upload", "sql-file", "sql-file-v1"),
    audit: audit("storage.upload"),
  };
  await repository.files.create(fileIntent);
  assert.equal(sql.state.storageFiles.length, 1);
  assert.equal(sql.state.auditLogs.length, 2);
  assert.equal(sql.state.idempotency.length, 2);

  let deletedObjects = 0;
  const deleteIntent = {
    fileId: "file_1",
    deleteObject: async () => {
      deletedObjects += 1;
    },
    idempotency: idempotency("storage.file.delete", "sql-delete", "sql-delete-v1"),
    audit: audit("storage.delete"),
  };
  await repository.files.remove(deleteIntent);
  await repository.files.remove(deleteIntent);
  assert.equal(deletedObjects, 1);
  assert.equal(sql.state.storageFiles[0].status, "deleted");

  await repository.buckets.remove({
    bucketId: "clinical-docs",
    idempotency: idempotency("storage.bucket.delete", "sql-bucket-delete", "sql-bucket-delete-v1"),
    audit: audit("storage.bucket.delete"),
  });
  assert.equal(sql.state.storageBuckets.length, 0);
});

test("PostgreSQL storage upload rolls back metadata and cleans its object when audit fails", async () => {
  const sql = new FakeSql();
  const db = createRuntimeDb();
  let cleaned = 0;
  const repository = createStorageMetadataRepository({
    getDb: () => db,
    saveDb: async () => {},
    createId: createIdFactory(),
    nowIso: () => "2026-07-19T00:00:00.000Z",
    getPool: () => sql,
  });
  sql.failNextAudit = true;
  await assert.rejects(
    repository.files.create({
      prepareFile: async () => fileInput(),
      cleanupFile: async () => {
        cleaned += 1;
      },
      idempotency: idempotency("storage.file.upload", "sql-fail", "sql-fail-v1"),
      audit: audit("storage.upload"),
    }),
    /simulated audit failure/,
  );
  assert.equal(cleaned, 1);
  assert.equal(sql.state.storageFiles.length, 0);
  assert.equal(sql.state.auditLogs.length, 0);
  assert.equal(sql.state.idempotency.length, 0);
});
