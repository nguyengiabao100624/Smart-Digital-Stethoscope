const assert = require("node:assert/strict");
const test = require("node:test");

const { createScanAudioUploadRepository } = require("../src/scanAudioUploadRepository");
const { buildAudioQueueJobId } = require("../src/queue");

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function createHarness(overrides = {}) {
  let sequence = 0;
  let now = overrides.now || "2026-07-18T10:00:00.000Z";
  const db = overrides.runtimeDb || {
    scans: [{
      id: "scan_alpha",
      organizationId: "org_alpha",
      patientId: "patient_alpha",
      status: "created",
      processingStatus: "created",
      uploadedBytes: 0,
      audioChunkCount: 0,
    }],
    scanAudioChunks: [],
    scanAudioCompletions: [],
    ...overrides.db,
  };
  const repository = createScanAudioUploadRepository({
    getDb: () => db,
    saveDb: overrides.saveDb || (async () => {}),
    getPool: () => overrides.pool || null,
    createId: (prefix) => `${prefix}_${++sequence}`,
    nowIso: overrides.nowIso || (() => now),
    maxChunkBytes: overrides.maxChunkBytes,
    maxTotalBytes: overrides.maxTotalBytes,
    maxChunkCount: overrides.maxChunkCount,
  });
  return {
    db,
    repository,
    setNow(value) {
      now = value;
    },
  };
}

function createSqlHarness(overrides = {}) {
  const state = {
    scan: {
      id: "scan_alpha",
      organization_id: "org_alpha",
      patient_id: "patient_alpha",
      status: "created",
      processing_status: "created",
      uploaded_bytes: 0,
      audio_chunk_count: 0,
    },
    chunks: [],
    completions: [],
    queries: [],
  };
  const client = {
    async query(source, params = []) {
      const sql = String(source).replace(/\s+/g, " ").trim();
      state.queries.push(sql);
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("pg_advisory_xact_lock")) {
        return { rows: [] };
      }
      if (sql.includes("FROM scan_sessions") && sql.includes("FOR UPDATE")) {
        return { rows: state.scan && state.scan.id === params[0] ? [{ ...state.scan }] : [] };
      }
      if (sql.includes("FROM scan_audio_completions") && sql.includes("scan_id = $1")) {
        return { rows: state.completions.filter((item) => item.scan_id === params[0]).map((item) => ({ ...item })) };
      }
      if (sql.includes("FROM scan_audio_completions") && sql.includes("organization_id = $1")) {
        return {
          rows: state.completions
            .filter((item) => item.organization_id === params[0] && item.actor_user_id === params[1] && item.idempotency_key === params[2])
            .map((item) => ({ ...item })),
        };
      }
      if (sql.includes("FROM scan_audio_chunks") && sql.includes("organization_id = $1")) {
        return {
          rows: state.chunks
            .filter((item) => item.organization_id === params[0] && item.actor_user_id === params[1] && item.idempotency_key === params[2])
            .map((item) => ({ ...item })),
        };
      }
      if (sql.includes("FROM scan_audio_chunks") && sql.includes("scan_id = $1")) {
        return {
          rows: state.chunks
            .filter((item) => item.scan_id === params[0])
            .sort((left, right) => left.chunk_sequence - right.chunk_sequence)
            .map((item) => ({ ...item })),
        };
      }
      if (sql.startsWith("INSERT INTO scan_audio_chunks")) {
        const row = {
          id: params[0],
          scan_id: params[1],
          organization_id: params[2],
          actor_user_id: params[3],
          idempotency_key: params[4],
          chunk_sequence: params[5],
          sha256: params[6],
          byte_size: params[7],
          file_path: params[8],
          created_at: params[9],
        };
        state.chunks.push(row);
        return { rows: [{ ...row }] };
      }
      if (sql.startsWith("UPDATE scan_sessions") && sql.includes("uploaded_bytes")) {
        state.scan = {
          ...state.scan,
          status: "uploading",
          processing_status: "uploading",
          uploaded_bytes: params[1],
          audio_chunk_count: params[2],
          updated_at: params[3],
        };
        return { rows: [{ ...state.scan }] };
      }
      if (sql.startsWith("INSERT INTO scan_audio_completions")) {
        const row = {
          id: params[0],
          scan_id: params[1],
          organization_id: params[2],
          actor_user_id: params[3],
          idempotency_key: params[4],
          status: "processing",
          manifest_sha256: params[5],
          chunk_count: params[6],
          total_bytes: params[7],
          response_json: {},
          error_code: "",
          error_message: "",
          lease_token: params[8],
          created_at: params[9],
          updated_at: params[9],
          completed_at: null,
        };
        state.completions.push(row);
        return { rows: [{ ...row }] };
      }
      if (sql.startsWith("UPDATE scan_audio_completions") && sql.includes("status = 'processing'")) {
        const row = state.completions.find((item) => item.scan_id === params[0]);
        Object.assign(row, {
          status: "processing",
          manifest_sha256: params[2],
          chunk_count: params[3],
          total_bytes: params[4],
          response_json: {},
          error_code: "",
          error_message: "",
          lease_token: params[5],
          updated_at: params[6],
          completed_at: null,
        });
        return { rows: [{ ...row }] };
      }
      if (sql.startsWith("UPDATE scan_audio_completions") && sql.includes("status = 'completed'")) {
        const row = state.completions.find((item) => item.scan_id === params[0]);
        Object.assign(row, {
          status: "completed",
          response_json: params[2],
          completed_at: params[3],
          updated_at: params[3],
          lease_token: null,
          error_code: "",
          error_message: "",
        });
        return { rows: [{ ...row }] };
      }
      if (sql.startsWith("UPDATE scan_sessions") && sql.includes("audio_upload_completed_at")) {
        state.scan = { ...state.scan, audio_upload_completed_at: params[1], updated_at: params[1] };
        return { rows: [{ ...state.scan }] };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    release() {},
  };
  const pool = { connect: async () => client };
  const harness = createHarness({
    ...overrides,
    pool,
  });
  return { ...harness, state };
}

function chunk(overrides = {}) {
  return {
    scanId: "scan_alpha",
    organizationId: "org_alpha",
    actorUserId: "user_alpha",
    idempotencyKey: "chunk-key-0",
    sequence: 0,
    sha256: SHA_A,
    byteSize: 4,
    filePath: "scan_alpha/00000000.pcm",
    ...overrides,
  };
}

test("exact chunk retry replays once while mismatches and sequence gaps fail closed", async () => {
  const { db, repository } = createHarness();

  const accepted = await repository.appendChunk(chunk());
  assert.equal(accepted.replayed, false);
  assert.equal(accepted.uploadedBytes, 4);
  assert.equal(accepted.nextSequence, 1);
  assert.equal(db.scanAudioChunks.length, 1);

  const replay = await repository.appendChunk(chunk());
  assert.equal(replay.replayed, true);
  assert.equal(replay.chunk.id, accepted.chunk.id);
  assert.equal(db.scanAudioChunks.length, 1);
  assert.equal(db.scans[0].uploadedBytes, 4);

  await assert.rejects(
    repository.appendChunk(chunk({ sha256: SHA_B })),
    (error) => error.statusCode === 409 && error.code === "SCAN_AUDIO_IDEMPOTENCY_MISMATCH",
  );
  await assert.rejects(
    repository.appendChunk(chunk({ idempotencyKey: "chunk-key-2", sequence: 2, sha256: SHA_B })),
    (error) =>
      error.statusCode === 409 &&
      error.code === "SCAN_AUDIO_SEQUENCE_GAP" &&
      error.details.expectedSequence === 1,
  );
});

test("concurrent exact retries serialize per scan and append bytes only once", async () => {
  let saves = 0;
  const { db, repository } = createHarness({
    saveDb: async () => {
      saves += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    },
  });

  const results = await Promise.all([
    repository.appendChunk(chunk()),
    repository.appendChunk(chunk()),
  ]);

  assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]);
  assert.equal(db.scanAudioChunks.length, 1);
  assert.equal(db.scans[0].uploadedBytes, 4);
  assert.equal(db.scans[0].audioChunkCount, 1);
  assert.ok(saves >= 1);
});

test("audio upload limits reject oversized chunks, totals, and chunk counts before mutation", async () => {
  const oversized = createHarness({ maxChunkBytes: 3 });
  await assert.rejects(
    oversized.repository.appendChunk(chunk({ byteSize: 4 })),
    (error) => error.statusCode === 413 && error.code === "SCAN_AUDIO_CHUNK_TOO_LARGE",
  );
  assert.equal(oversized.db.scanAudioChunks.length, 0);
  assert.equal(oversized.db.scans[0].uploadedBytes, 0);

  const totalLimited = createHarness({ maxTotalBytes: 7 });
  await totalLimited.repository.appendChunk(chunk());
  await assert.rejects(
    totalLimited.repository.appendChunk({
      ...chunk(),
      idempotencyKey: "chunk-key-1",
      sequence: 1,
      sha256: SHA_B,
      byteSize: 4,
      filePath: "scan_alpha/00000001.pcm",
    }),
    (error) => error.statusCode === 413 && error.code === "SCAN_AUDIO_UPLOAD_LIMIT_EXCEEDED",
  );
  assert.equal(totalLimited.db.scanAudioChunks.length, 1);
  assert.equal(totalLimited.db.scans[0].uploadedBytes, 4);

  const countLimited = createHarness({ maxChunkCount: 1 });
  await countLimited.repository.appendChunk(chunk());
  await assert.rejects(
    countLimited.repository.appendChunk({
      ...chunk(),
      idempotencyKey: "chunk-key-1",
      sequence: 1,
      sha256: SHA_B,
      filePath: "scan_alpha/00000001.pcm",
    }),
    (error) => error.statusCode === 413 && error.code === "SCAN_AUDIO_CHUNK_COUNT_EXCEEDED",
  );
  assert.equal(countLimited.db.scanAudioChunks.length, 1);
});

test("completion replays the original response and closes the upload ledger", async () => {
  const { db, repository } = createHarness();
  await repository.appendChunk(chunk());
  await repository.appendChunk(chunk({
    idempotencyKey: "chunk-key-1",
    sequence: 1,
    sha256: SHA_B,
    byteSize: 6,
    filePath: "scan_alpha/00000001.pcm",
  }));

  const started = await repository.beginCompletion({
    scanId: "scan_alpha",
    organizationId: "org_alpha",
    actorUserId: "user_alpha",
    idempotencyKey: "complete-key",
  });
  assert.equal(started.action, "start");
  assert.equal(started.chunks.length, 2);
  assert.equal(started.completion.totalBytes, 10);

  const response = { scan: { id: "scan_alpha", status: "completed" } };
  await repository.finishCompletion({
    scanId: "scan_alpha",
    organizationId: "org_alpha",
    actorUserId: "user_alpha",
    idempotencyKey: "complete-key",
    response,
  });

  const committedChunkReplay = await repository.appendChunk(chunk());
  assert.equal(committedChunkReplay.replayed, true);
  assert.equal(committedChunkReplay.chunk.id, db.scanAudioChunks[0].id);

  await assert.rejects(
    repository.appendChunk(chunk({ sha256: SHA_B })),
    (error) => error.statusCode === 409 && error.code === "SCAN_AUDIO_IDEMPOTENCY_MISMATCH",
  );

  const replay = await repository.beginCompletion({
    scanId: "scan_alpha",
    organizationId: "org_alpha",
    actorUserId: "user_alpha",
    idempotencyKey: "complete-key",
  });
  assert.equal(replay.action, "replay");
  assert.deepEqual(replay.response, response);
  assert.equal(db.scanAudioCompletions.length, 1);

  await assert.rejects(
    repository.beginCompletion({
      scanId: "scan_alpha",
      organizationId: "org_alpha",
      actorUserId: "user_alpha",
      idempotencyKey: "different-completion-key",
    }),
    (error) => error.statusCode === 409 && error.code === "SCAN_AUDIO_COMPLETION_CLOSED",
  );
  await assert.rejects(
    repository.appendChunk(chunk({ idempotencyKey: "late-key", sequence: 2 })),
    (error) => error.statusCode === 409 && error.code === "SCAN_AUDIO_UPLOAD_CLOSED",
  );
});

test("stale processing completion is reclaimed after its lease, while a fresh lease stays in progress", async () => {
  const { db, repository, setNow } = createHarness({
    db: {
      scans: [{
        id: "scan_alpha",
        organizationId: "org_alpha",
        status: "uploading",
        processingStatus: "uploading",
      }],
      scanAudioChunks: [{
        id: "chunk_0",
        scanId: "scan_alpha",
        organizationId: "org_alpha",
        actorUserId: "user_alpha",
        idempotencyKey: "chunk-key-0",
        sequence: 0,
        sha256: SHA_A,
        byteSize: 4,
        filePath: "scan_alpha/00000000.pcm",
        createdAt: "2026-07-18T09:00:00.000Z",
      }],
      scanAudioCompletions: [{
        id: "completion_0",
        scanId: "scan_alpha",
        organizationId: "org_alpha",
        actorUserId: "user_alpha",
        idempotencyKey: "complete-key",
        leaseToken: "old-lease",
        status: "processing",
        manifestSha256: "f".repeat(64),
        chunkCount: 1,
        totalBytes: 4,
        response: null,
        updatedAt: "2026-07-18T09:45:00.000Z",
        createdAt: "2026-07-18T09:45:00.000Z",
      }],
    },
  });
  const input = {
    scanId: "scan_alpha",
    organizationId: "org_alpha",
    actorUserId: "user_alpha",
    idempotencyKey: "complete-key",
  };

  setNow("2026-07-18T09:59:59.999Z");
  const fresh = await repository.beginCompletion(input);
  assert.equal(fresh.action, "in_progress");
  assert.equal(fresh.completion.leaseToken, "old-lease");

  setNow("2026-07-18T10:00:00.000Z");
  const reclaimed = await repository.beginCompletion(input);
  assert.equal(reclaimed.action, "start");
  assert.notEqual(reclaimed.completion.leaseToken, "old-lease");
  assert.equal(db.scanAudioCompletions[0].status, "processing");
  assert.equal(db.scanAudioCompletions[0].updatedAt, "2026-07-18T10:00:00.000Z");
});

test("a completion lease lost after recovery cannot finish the newer exact intent", async () => {
  let now = "2026-07-18T10:00:00.000Z";
  const { db, repository: oldRepository } = createHarness({
    nowIso: () => now,
  });
  await oldRepository.appendChunk(chunk());
  const input = {
    scanId: "scan_alpha",
    organizationId: "org_alpha",
    actorUserId: "user_alpha",
    idempotencyKey: "complete-key",
  };
  const first = await oldRepository.beginCompletion(input);
  assert.equal(first.action, "start");

  const recoveredHarness = createHarness({
    runtimeDb: db,
    nowIso: () => now,
  });
  now = "2026-07-18T10:15:00.000Z";
  const recovered = await recoveredHarness.repository.beginCompletion(input);
  assert.equal(recovered.action, "start");
  assert.notEqual(recovered.completion.leaseToken, first.completion.leaseToken);

  await assert.rejects(
    oldRepository.finishCompletion({
      ...input,
      response: { scan: { id: "scan_alpha", status: "completed" } },
    }),
    (error) => error.statusCode === 409 && error.code === "SCAN_AUDIO_COMPLETION_LEASE_LOST",
  );

  await recoveredHarness.repository.finishCompletion({
    ...input,
    response: { scan: { id: "scan_alpha", status: "completed" } },
  });
  assert.equal(db.scanAudioCompletions[0].status, "completed");
});

test("chunk and completion mutations reject cross-tenant scope", async () => {
  const { repository } = createHarness();
  await assert.rejects(
    repository.appendChunk(chunk({ organizationId: "org_beta" })),
    (error) => error.statusCode === 403 && error.code === "SCAN_AUDIO_SCOPE_DENIED",
  );
  await assert.rejects(
    repository.beginCompletion({
      scanId: "scan_alpha",
      organizationId: "org_beta",
      actorUserId: "user_beta",
      idempotencyKey: "complete-beta",
    }),
    (error) => error.statusCode === 403 && error.code === "SCAN_AUDIO_SCOPE_DENIED",
  );
});

test("PostgreSQL chunk ledger locks the scan and preserves exact retry semantics", async () => {
  const { db, repository, state } = createSqlHarness();

  const accepted = await repository.appendChunk(chunk());
  const replay = await repository.appendChunk(chunk());

  assert.equal(accepted.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(state.chunks.length, 1);
  assert.equal(state.scan.uploaded_bytes, 4);
  assert.equal(state.scan.audio_chunk_count, 1);
  assert.equal(db.scanAudioChunks.length, 1);
  assert.ok(state.queries.some((sql) => sql.includes("pg_advisory_xact_lock")));
  assert.ok(state.queries.some((sql) => sql.includes("scan_id = $1 AND organization_id = $2")));
  assert.equal(state.queries.filter((sql) => sql === "BEGIN").length, 2);
  assert.equal(state.queries.filter((sql) => sql === "COMMIT").length, 2);

  await assert.rejects(
    repository.appendChunk(chunk({ sha256: SHA_B })),
    (error) => error.statusCode === 409 && error.code === "SCAN_AUDIO_IDEMPOTENCY_MISMATCH",
  );
  assert.ok(state.queries.includes("ROLLBACK"));
});

test("PostgreSQL completion ledger returns the committed response on exact retry", async () => {
  const { db, repository, state } = createSqlHarness();
  await repository.appendChunk(chunk());

  const input = {
    scanId: "scan_alpha",
    organizationId: "org_alpha",
    actorUserId: "user_alpha",
    idempotencyKey: "complete-key",
  };
  const started = await repository.beginCompletion(input);
  assert.equal(started.action, "start");

  const response = { scan: { id: "scan_alpha", status: "completed" } };
  await repository.finishCompletion({ ...input, response });
  const chunkReplay = await repository.appendChunk(chunk());
  assert.equal(chunkReplay.replayed, true);
  assert.equal(chunkReplay.chunk.sequence, 0);
  await assert.rejects(
    repository.appendChunk(chunk({ sha256: SHA_B })),
    (error) => error.statusCode === 409 && error.code === "SCAN_AUDIO_IDEMPOTENCY_MISMATCH",
  );
  const replay = await repository.beginCompletion(input);

  assert.equal(replay.action, "replay");
  assert.deepEqual(replay.response, response);
  assert.equal(state.completions.length, 1);
  assert.equal(state.completions[0].status, "completed");
  assert.equal(db.scanAudioCompletions.length, 1);

  await assert.rejects(
    repository.appendChunk(chunk({ idempotencyKey: "late-key", sequence: 1 })),
    (error) => error.statusCode === 409 && error.code === "SCAN_AUDIO_UPLOAD_CLOSED",
  );
});

test("PostgreSQL stale processing completion is reclaimed only after the lease expires", async () => {
  let now = "2026-07-18T09:59:59.999Z";
  const { repository, state } = createSqlHarness({
    nowIso: () => now,
  });
  state.scan.status = "uploading";
  state.scan.processing_status = "uploading";
  state.chunks.push({
    id: "chunk_0",
    scan_id: "scan_alpha",
    organization_id: "org_alpha",
    actor_user_id: "user_alpha",
    idempotency_key: "chunk-key-0",
    chunk_sequence: 0,
    sha256: SHA_A,
    byte_size: 4,
    file_path: "scan_alpha/00000000.pcm",
    created_at: "2026-07-18T09:00:00.000Z",
  });
  state.completions.push({
    id: "completion_0",
    scan_id: "scan_alpha",
    organization_id: "org_alpha",
    actor_user_id: "user_alpha",
    idempotency_key: "complete-key",
    lease_token: "old-lease",
    status: "processing",
    manifest_sha256: "f".repeat(64),
    chunk_count: 1,
    total_bytes: 4,
    response_json: {},
    error_code: "",
    error_message: "",
    created_at: "2026-07-18T09:45:00.000Z",
    updated_at: "2026-07-18T09:45:00.000Z",
    completed_at: null,
  });
  const input = {
    scanId: "scan_alpha",
    organizationId: "org_alpha",
    actorUserId: "user_alpha",
    idempotencyKey: "complete-key",
  };

  const fresh = await repository.beginCompletion(input);
  assert.equal(fresh.action, "in_progress");
  assert.equal(fresh.completion.leaseToken, "old-lease");

  now = "2026-07-18T10:00:00.000Z";
  const reclaimed = await repository.beginCompletion(input);
  assert.equal(reclaimed.action, "start");
  assert.notEqual(reclaimed.completion.leaseToken, "old-lease");
  assert.equal(state.completions[0].updated_at, "2026-07-18T10:00:00.000Z");
});

test("audio queue job identity is stable for an exact processing intent", () => {
  const payload = {
    scanId: "scan_alpha",
    processingIntent: "initial",
    processingGeneration: 1,
    artifactFingerprint: SHA_A,
  };
  const first = buildAudioQueueJobId(payload);
  const retry = buildAudioQueueJobId({ ...payload });

  assert.equal(first, retry);
  assert.match(first, /^scan-audio-v2-[a-f0-9]{64}$/);
  assert.equal(first.includes(payload.scanId), false);
  assert.equal(first.includes(SHA_A), false);
});

test("audio queue job identity changes for a new generation or artifact", () => {
  const initial = {
    scanId: "scan_alpha",
    processingIntent: "reprocess",
    processingGeneration: 1,
    artifactFingerprint: SHA_A,
  };

  const nextGeneration = buildAudioQueueJobId({
    ...initial,
    processingGeneration: 2,
  });
  const changedArtifact = buildAudioQueueJobId({
    ...initial,
    artifactFingerprint: SHA_B,
  });
  const changedIntent = buildAudioQueueJobId({
    ...initial,
    processingIntent: "initial",
  });

  assert.notEqual(nextGeneration, buildAudioQueueJobId(initial));
  assert.notEqual(changedArtifact, buildAudioQueueJobId(initial));
  assert.notEqual(changedIntent, buildAudioQueueJobId(initial));
});

test("audio queue identity does not collapse ids that sanitize to the same label", () => {
  const first = buildAudioQueueJobId({
    scanId: "patient/a",
    processingIntent: "initial",
    processingGeneration: 1,
    artifactFingerprint: SHA_A,
  });
  const second = buildAudioQueueJobId({
    scanId: "patient-a",
    processingIntent: "initial",
    processingGeneration: 1,
    artifactFingerprint: SHA_A,
  });

  assert.notEqual(first, second);
});

test("audio queue identity requires a scan id", () => {
  assert.throws(
    () => buildAudioQueueJobId({ processingIntent: "initial", processingGeneration: 1 }),
    /scanId is required/,
  );
});

test("audio queue identity rejects oversized canonical fields instead of truncating them", () => {
  assert.throws(
    () => buildAudioQueueJobId({ scanId: `scan_${"x".repeat(600)}` }),
    /identity field is too long/,
  );
});
