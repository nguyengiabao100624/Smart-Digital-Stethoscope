const fs = require("node:fs");
const path = require("node:path");
const { decryptJson, encryptJson } = require("./cryptoPhi");

const RUNTIME_STATE_ID = "default";

function createDataStore(options) {
  const backend = String(options.backend || "").toLowerCase();
  if (backend === "postgres" || backend === "postgresql") {
    return new PostgresDataStore(options);
  }
  return new JsonDataStore(options);
}

class JsonDataStore {
  constructor(options) {
    this.dbFile = options.dbFile;
    this.createEmptyDb = options.createEmptyDb;
    this.normalizeDb = options.normalizeDb;
    this.ensureDataDirs = options.ensureDataDirs;
    this.fileSystem = options.fileSystem || fs;
    this.env = options.env || process.env;
    this.saveQueue = Promise.resolve();
    this.saveSequence = 0;
  }

  async init() {
    this.ensureDataDirs();
  }

  async load() {
    this.ensureDataDirs();

    if (!this.fileSystem.existsSync(this.dbFile)) {
      const freshDb = this.createEmptyDb();
      this.fileSystem.writeFileSync(this.dbFile, JSON.stringify(freshDb, null, 2));
      return freshDb;
    }

    try {
      const stored = JSON.parse(this.fileSystem.readFileSync(this.dbFile, "utf8"));
      const loaded = decryptJson(stored, this.env, `runtime-state:${RUNTIME_STATE_ID}`);
      return this.normalizeDb(loaded);
    } catch (err) {
      if (["PHI_KEY_REQUIRED", "PHI_ENVELOPE_INVALID", "PHI_DECRYPTION_FAILED"].includes(err?.code)) {
        throw err;
      }
      const brokenFile = `${this.dbFile}.broken-${Date.now()}`;
      this.fileSystem.copyFileSync(this.dbFile, brokenFile);
      console.error(`Cannot read db.json, copied broken file to ${brokenFile}`);
      return this.createEmptyDb();
    }
  }

  async save(db) {
    const protectedState = encryptJson(db, this.env, `runtime-state:${RUNTIME_STATE_ID}`);
    const payload = JSON.stringify(protectedState.encrypted ? protectedState : db, null, 2);
    const operation = this.saveQueue
      .catch(() => {})
      .then(async () => {
        this.ensureDataDirs();
        this.saveSequence += 1;
        const tmpFile =
          `${this.dbFile}.${process.pid}.${Date.now()}.${this.saveSequence}.tmp`;
        await this.fileSystem.promises.writeFile(tmpFile, payload, "utf8");
        try {
          await this.replaceFile(tmpFile);
        } finally {
          await this.fileSystem.promises.unlink(tmpFile).catch(() => {});
        }
      });
    this.saveQueue = operation;
    return operation;
  }

  async replaceFile(tmpFile) {
    const retryableCodes = new Set(["EACCES", "EBUSY", "EEXIST", "EPERM"]);
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await this.fileSystem.promises.rename(tmpFile, this.dbFile);
        return;
      } catch (error) {
        lastError = error;
        if (!retryableCodes.has(error?.code)) throw error;
      }
      // Copying over the live JSON file exposes a truncated document to
      // concurrent readers on Windows. Swap the complete files instead so a
      // reader observes either the old snapshot or the new snapshot, never a
      // partially copied payload.
      const backupFile = `${this.dbFile}.${process.pid}.replace-backup`;
      let movedCurrent = false;
      try {
        await this.fileSystem.promises.unlink(backupFile).catch(() => {});
        if (this.fileSystem.existsSync(this.dbFile)) {
          await this.fileSystem.promises.rename(this.dbFile, backupFile);
          movedCurrent = true;
        }
        await this.fileSystem.promises.rename(tmpFile, this.dbFile);
        if (movedCurrent) {
          await this.fileSystem.promises.unlink(backupFile).catch(() => {});
        }
        return;
      } catch (error) {
        lastError = error;
        if (
          movedCurrent &&
          !this.fileSystem.existsSync(this.dbFile) &&
          this.fileSystem.existsSync(backupFile)
        ) {
          await this.fileSystem.promises.rename(backupFile, this.dbFile).catch(() => {});
        }
        if (!retryableCodes.has(error?.code)) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
    throw lastError || new Error("Unable to replace JSON data store");
  }

  async close() {
    await this.saveQueue.catch(() => {});
  }
}

class PostgresDataStore {
  constructor(options) {
    this.databaseUrl = options.databaseUrl;
    this.createEmptyDb = options.createEmptyDb;
    this.normalizeDb = options.normalizeDb;
    this.ensureDataDirs = options.ensureDataDirs;
    this.env = options.env || process.env;
    this.pool = null;
    this.saveQueue = Promise.resolve();
  }

  async init() {
    this.ensureDataDirs();
    if (!this.databaseUrl) {
      throw new Error("DATABASE_URL is required when DATA_BACKEND=postgres");
    }

    const { Pool } = require("pg");
    this.pool = new Pool({ connectionString: this.databaseUrl });
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_runtime_state (
        id text PRIMARY KEY,
        state jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async load() {
    const result = await this.pool.query("SELECT state FROM app_runtime_state WHERE id = $1", [RUNTIME_STATE_ID]);
    if (result.rowCount === 0) {
      return this.createEmptyDb();
    }
    const state = decryptJson(
      result.rows[0].state,
      this.env,
      `runtime-state:${RUNTIME_STATE_ID}`,
    );
    return this.normalizeDb(state);
  }

  async save(db) {
    const protectedState = encryptJson(db, this.env, `runtime-state:${RUNTIME_STATE_ID}`);
    const payload = JSON.stringify(protectedState.encrypted ? protectedState : db);
    this.saveQueue = this.saveQueue.then(() =>
      this.pool.query(
        `
          INSERT INTO app_runtime_state (id, state, updated_at)
          VALUES ($1, $2::jsonb, now())
          ON CONFLICT (id)
          DO UPDATE SET state = EXCLUDED.state, updated_at = now()
        `,
        [RUNTIME_STATE_ID, payload]
      )
    );
    return this.saveQueue;
  }

  async close() {
    await this.saveQueue.catch(() => {});
    if (this.pool) {
      await this.pool.end();
    }
  }
}

function resolveBackendFromEnv(env = process.env) {
  if (env.DATA_BACKEND) {
    return env.DATA_BACKEND;
  }
  return env.DATABASE_URL ? "postgres" : "json";
}

module.exports = {
  JsonDataStore,
  createDataStore,
  resolveBackendFromEnv,
};
