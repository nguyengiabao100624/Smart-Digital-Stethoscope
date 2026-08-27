const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { markAudioJobFailed, processAudioJob } = require("../src/audioProcessingWorker");
const { createRepositories } = require("../src/repositories");

function writeTestWav(filePath, samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write("RIFF", 0, "ascii");
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write("WAVE", 8, "ascii");
  data.write("fmt ", 12, "ascii");
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24);
  data.writeUInt32LE(32000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36, "ascii");
  data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => data.writeInt16LE(sample, 44 + index * 2));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data);
}

function createHarness({ saveDb = async () => {} } = {}) {
  let idSequence = 0;
  const db = {
    scans: [
      {
        id: "scan_worker_retry",
        organizationId: "org_worker",
        patientId: "patient_worker",
        sampleRate: 16000,
        status: "queued",
        processingStatus: "queued",
      },
    ],
    audioFiles: [],
    aiResults: [],
  };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb,
    getPool: () => null,
    createId: (prefix) => `${prefix}_random_${++idSequence}`,
    nowIso: () => "2026-07-18T12:00:00.000Z",
  });
  const storageAdapter = {
    async putFile(objectKey, sourceFile, contentType) {
      const byteSize = fs.statSync(sourceFile).size;
      return { provider: "local", objectKey, contentType, byteSize };
    },
    async putBuffer(objectKey, buffer, contentType) {
      return { provider: "local", objectKey, contentType, byteSize: buffer.length };
    },
  };
  return { db, repositories, storageAdapter };
}

function createSqlPersistenceHarness({ failAi = false } = {}) {
  const statements = [];
  const db = {
    scans: [{
      id: "scan_sql_retry",
      organizationId: "org_sql",
      patientId: "patient_sql",
      status: "queued",
      processingStatus: "queued",
    }],
    audioFiles: [],
    aiResults: [],
  };
  const client = {
    async query(sql) {
      const text = String(sql).trim();
      statements.push(text);
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
      if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (text.includes("SELECT id, organization_id, patient_id, ai_summary, doctor_notes, phi_payload FROM scan_sessions")) {
        return {
          rows: [{
            id: "scan_sql_retry",
            organization_id: "org_sql",
            patient_id: "patient_sql",
            ai_summary: "",
            doctor_notes: "",
            phi_payload: {},
          }],
        };
      }
      if (text.includes("UPDATE scan_sessions")) {
        return {
          rows: [{
            id: "scan_sql_retry",
            organization_id: "org_sql",
            patient_id: "patient_sql",
            status: "completed",
            processing_status: "completed",
            sample_rate: 16000,
            sample_count: 8,
            duration_seconds: 0.01,
            peak: 0.1,
            rms: 0.05,
            level_percent: 10,
            ai_label: "captured",
            ai_confidence: 0.9,
            ai_summary: "Signal captured",
            audio_url: "/api/scans/scan_sql_retry/audio",
            created_at: "2026-07-18T12:00:00.000Z",
            updated_at: "2026-07-18T12:00:00.000Z",
          }],
        };
      }
      if (text.includes("INSERT INTO audio_files")) {
        return {
          rows: [{
            id: "audio_deterministic",
            scan_id: "scan_sql_retry",
            patient_id: "patient_sql",
            storage_provider: "local",
            object_key: "org_sql/patient_sql/scan_sql_retry/audio.wav",
            content_type: "audio/wav",
            byte_size: 60,
            sample_rate: 16000,
            created_at: "2026-07-18T12:00:00.000Z",
          }],
        };
      }
      if (text.includes("INSERT INTO ai_results")) {
        if (failAi) throw new Error("simulated AI upsert failure");
        return {
          rows: [{
            id: "ai_deterministic",
            scan_id: "scan_sql_retry",
            model_version: "signal_quality_rules_v1",
            label: "captured",
            confidence: 0.9,
            summary: "Signal captured",
            raw_result: { processingGeneration: "v1_deterministic" },
            status: "completed",
            created_at: "2026-07-18T12:00:00.000Z",
            updated_at: "2026-07-18T12:00:00.000Z",
          }],
        };
      }
      throw new Error(`Unexpected SQL in audio processing test: ${text}`);
    },
    release() {},
  };
  const pool = { connect: async () => client };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    getPool: () => pool,
    createId: (prefix) => `${prefix}_unused`,
    nowIso: () => "2026-07-18T12:00:00.000Z",
    onSqlError: () => {},
  });
  const input = {
    processingGeneration: "v1_deterministic",
    scan: {
      ...db.scans[0],
      status: "completed",
      processingStatus: "completed",
      sampleRate: 16000,
      sampleCount: 8,
      durationSeconds: 0.01,
      peak: 0.1,
      rms: 0.05,
      levelPercent: 10,
      aiLabel: "captured",
      aiConfidence: 0.9,
      aiSummary: "Signal captured",
      aiResultId: "ai_deterministic",
      audioFileId: "audio_deterministic",
      audioUrl: "/api/scans/scan_sql_retry/audio",
      updatedAt: "2026-07-18T12:00:00.000Z",
    },
    audioFile: {
      id: "audio_deterministic",
      scanId: "scan_sql_retry",
      patientId: "patient_sql",
      storageProvider: "local",
      objectKey: "org_sql/patient_sql/scan_sql_retry/audio.wav",
      contentType: "audio/wav",
      byteSize: 60,
      sampleRate: 16000,
      createdAt: "2026-07-18T12:00:00.000Z",
    },
    aiResult: {
      id: "ai_deterministic",
      scanId: "scan_sql_retry",
      modelVersion: "signal_quality_rules_v1",
      label: "captured",
      confidence: 0.9,
      summary: "Signal captured",
      rawResult: { processingGeneration: "v1_deterministic" },
      status: "completed",
      createdAt: "2026-07-18T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z",
    },
  };
  return { db, input, repositories, statements };
}

test("retries of one processing generation upsert one audio and AI result", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-audio-worker-test-"));
  const wavFilePath = path.join(root, "scan-worker-retry.wav");
  writeTestWav(wavFilePath, [0, 600, -850, 1200, -1600, 900, -400, 0]);
  const { db, repositories, storageAdapter } = createHarness();
  const payload = {
    scanId: "scan_worker_retry",
    patientId: "patient_worker",
    organizationId: "org_worker",
    wavFilePath,
    sampleRate: 16000,
    processingGeneration: 3,
    processingIntent: "initial",
    artifactFingerprint: crypto.createHash("sha256").update(fs.readFileSync(wavFilePath)).digest("hex"),
  };
  const deps = {
    db,
    repositories,
    storageAdapter,
    createId: (prefix) => `${prefix}_random_${Date.now()}`,
    nowIso: () => "2026-07-18T12:00:00.000Z",
  };

  try {
    const first = await processAudioJob(payload, deps);
    const second = await processAudioJob(payload, deps);

    assert.equal(first.scanId, second.scanId);
    assert.equal(first.processingGeneration, 3);
    assert.equal(db.audioFiles.length, 1);
    assert.equal(db.aiResults.length, 1);
    assert.equal(db.scans[0].aiResultId, db.aiResults[0].id);
    assert.equal(first.processingGeneration, second.processingGeneration);
    assert.equal(first.processingRunId, second.processingRunId);
    assert.equal(db.aiResults[0].rawResult.processingGeneration, first.processingGeneration);
    assert.equal(db.aiResults[0].rawResult.processingRunId, first.processingRunId);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("failed atomic persistence restores the runtime scan and artifacts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-audio-worker-rollback-"));
  const wavFilePath = path.join(root, "scan-worker-rollback.wav");
  writeTestWav(wavFilePath, [0, 300, -500, 700, -900, 500, -200, 0]);
  const { db, repositories, storageAdapter } = createHarness({
    saveDb: async () => {
      throw new Error("runtime commit failed");
    },
  });
  const before = JSON.parse(JSON.stringify(db));
  try {
    await assert.rejects(
      processAudioJob(
        {
          scanId: "scan_worker_retry",
          patientId: "patient_worker",
          organizationId: "org_worker",
          wavFilePath,
          sampleRate: 16000,
        },
        {
          db,
          repositories,
          storageAdapter,
          nowIso: () => "2026-07-18T12:00:00.000Z",
        },
      ),
      /runtime commit failed/,
    );
    assert.deepEqual(db, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("worker rejects a queued patient scope that differs from the scan", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-audio-worker-scope-"));
  const wavFilePath = path.join(root, "scan-worker-scope.wav");
  writeTestWav(wavFilePath, [0, 200, -300, 500, -700, 400, -100, 0]);
  const { db, repositories, storageAdapter } = createHarness();
  const before = JSON.parse(JSON.stringify(db));
  try {
    await assert.rejects(
      processAudioJob(
        {
          scanId: "scan_worker_retry",
          patientId: "patient_other",
          organizationId: "org_worker",
          wavFilePath,
          sampleRate: 16000,
        },
        { db, repositories, storageAdapter },
      ),
      /patientId does not match/,
    );
    assert.deepEqual(db, before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PostgreSQL persistence commits scan, audio and AI in one transaction", async () => {
  const { db, input, repositories, statements } = createSqlPersistenceHarness();

  await repositories.audioProcessing.save(input);
  await repositories.audioProcessing.save(input);

  assert.equal(statements.filter((statement) => statement === "BEGIN").length, 2);
  assert.equal(statements.filter((statement) => statement === "COMMIT").length, 2);
  assert.equal(statements.some((statement) => statement === "ROLLBACK"), false);
  assert.equal(statements.filter((statement) => statement.includes("pg_advisory_xact_lock")).length, 2);
  assert.equal(statements.some((statement) => statement.includes("processing_generation = $16")), true);
  assert.equal(statements.some((statement) => statement.includes("processing_artifact_fingerprint = $18")), true);
  assert.equal(statements.some((statement) => statement.includes("processing_run_id = $19")), true);
  assert.equal(db.audioFiles.length, 1);
  assert.equal(db.aiResults.length, 1);
  assert.equal(db.scans[0].audioFileId, "audio_deterministic");
  assert.equal(db.scans[0].aiResultId, "ai_deterministic");
});

test("PostgreSQL persistence rolls back before touching runtime state", async () => {
  const { db, input, repositories, statements } = createSqlPersistenceHarness({ failAi: true });
  const before = JSON.parse(JSON.stringify(db));

  await assert.rejects(
    repositories.audioProcessing.save(input),
    /simulated AI upsert failure/,
  );

  assert.equal(statements.filter((statement) => statement === "BEGIN").length, 1);
  assert.equal(statements.filter((statement) => statement === "ROLLBACK").length, 1);
  assert.equal(statements.some((statement) => statement === "COMMIT"), false);
  assert.deepEqual(db, before);
});

test("terminal worker failure updates only the matching processing generation", async () => {
  const { db, repositories } = createHarness();
  Object.assign(db.scans[0], {
    processingGeneration: 4,
    processingIntent: "reprocess",
    processingArtifactFingerprint: "a".repeat(64),
  });

  const stale = await markAudioJobFailed(
    {
      scanId: db.scans[0].id,
      processingGeneration: 3,
      processingIntent: "reprocess",
      artifactFingerprint: "a".repeat(64),
    },
    new Error("stale failure"),
    { db, repositories, nowIso: () => "2026-07-18T12:05:00.000Z" },
  );
  assert.equal(stale.updated, false);
  assert.equal(stale.reason, "stale_generation");
  assert.equal(db.scans[0].status, "queued");

  const current = await markAudioJobFailed(
    {
      scanId: db.scans[0].id,
      processingGeneration: 4,
      processingIntent: "reprocess",
      artifactFingerprint: "a".repeat(64),
    },
    new Error("provider exhausted retries"),
    { db, repositories, nowIso: () => "2026-07-18T12:06:00.000Z" },
  );
  assert.equal(current.updated, true);
  assert.equal(db.scans[0].status, "failed");
  assert.equal(db.scans[0].processingStatus, "failed");
  assert.equal(db.scans[0].aiLabel, "processing_failed");
  assert.match(db.scans[0].aiSummary, /provider exhausted retries/);
});
