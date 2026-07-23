const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { normalizeAiSettings } = require("../src/aiRuntime");
const { markAudioJobFailed, processAudioJob } = require("../src/audioProcessingWorker");
const { createDataStore, resolveBackendFromEnv } = require("../src/dataStore");
const { createRepositories } = require("../src/repositories");
const { createStorageAdapter } = require("../src/storageAdapter");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const AUDIO_DIR = path.join(DATA_DIR, "audio");
const TMP_DIR = path.join(DATA_DIR, "tmp");
const DB_FILE = path.join(DATA_DIR, "db.json");

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}_${stamp}_${crypto.randomBytes(4).toString("hex")}`;
}

function createEmptyWorkerDb() {
  return {
    version: 1,
    settings: { ai: normalizeAiSettings() },
    organizations: [],
    users: [],
    memberships: [],
    patients: [],
    doctorPatientAccess: [],
    devices: [],
    scans: [],
    audioFiles: [],
    aiResults: [],
    deviceEvents: [],
    notificationDevices: [],
    notifications: [],
    auditLogs: [],
  };
}

function normalizeWorkerDb(loaded) {
  const base = createEmptyWorkerDb();
  const db = loaded && typeof loaded === "object" ? { ...base, ...loaded } : base;
  db.settings = { ...base.settings, ...(db.settings || {}) };
  db.settings.ai = normalizeAiSettings(db.settings.ai);
  for (const key of [
    "organizations",
    "users",
    "memberships",
    "patients",
    "doctorPatientAccess",
    "devices",
    "scans",
    "audioFiles",
    "aiResults",
    "deviceEvents",
    "notificationDevices",
    "notifications",
    "auditLogs",
  ]) {
    db[key] = Array.isArray(db[key]) ? db[key] : [];
  }
  return db;
}

function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function createWorkerContext() {
  ensureDataDirs();
  const dataStore = createDataStore({
    backend: resolveBackendFromEnv(process.env),
    databaseUrl: process.env.DATABASE_URL,
    dbFile: DB_FILE,
    createEmptyDb: createEmptyWorkerDb,
    normalizeDb: normalizeWorkerDb,
    ensureDataDirs,
  });
  await dataStore.init();
  const db = await dataStore.load();
  let pool = null;
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  const saveDb = async () => dataStore.save(db);
  const repositories = createRepositories({
    getDb: () => db,
    saveDb,
    createId,
    nowIso,
    getPool: () => pool,
  });
  return {
    db,
    repositories,
    saveDb,
    storageAdapter: createStorageAdapter({ dataDir: DATA_DIR, env: process.env }),
    async close() {
      await dataStore.close();
      if (pool) {
        await pool.end();
      }
    },
  };
}

async function main() {
  if (!process.env.REDIS_URL) {
    console.log("REDIS_URL is not set; audio worker is disabled.");
    return;
  }

  const { Worker } = require("bullmq");
  const context = await createWorkerContext();
  const worker = new Worker(
    "audio-processing",
    async (job) => {
      const payload = job.data || {};
      const result = await processAudioJob(payload, context);
      console.log(
        JSON.stringify({
          event: "audio_processed",
          scanId: result.scanId,
          label: result.label,
          confidence: result.confidence,
          waveformPoints: result.waveformPoints,
        })
      );
      return result;
    },
    {
      connection: {
        url: process.env.REDIS_URL,
      },
    }
  );

  worker.on("failed", (job, err) => {
    console.error(JSON.stringify({ event: "audio_processing_failed", jobId: job && job.id, error: err.message }));
    const allowedAttempts = Number(job?.opts?.attempts || 1);
    if (!job || Number(job.attemptsMade || 0) < allowedAttempts) return;
    void markAudioJobFailed(job.data || {}, err, context).catch((persistenceError) => {
      console.error(JSON.stringify({
        event: "audio_processing_failure_state_persist_failed",
        jobId: job.id,
        error: persistenceError.message,
      }));
    });
  });
  const shutdown = async () => {
    await worker.close();
    await context.close();
  };
  process.on("SIGINT", () => shutdown().then(() => process.exit(0)));
  process.on("SIGTERM", () => shutdown().then(() => process.exit(0)));

  console.log("Audio worker listening on queue audio-processing");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
