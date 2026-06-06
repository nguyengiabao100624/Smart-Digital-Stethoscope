const fs = require("node:fs");
const path = require("node:path");

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
  }

  async init() {
    this.ensureDataDirs();
  }

  async load() {
    this.ensureDataDirs();

    if (!fs.existsSync(this.dbFile)) {
      const freshDb = this.createEmptyDb();
      fs.writeFileSync(this.dbFile, JSON.stringify(freshDb, null, 2));
      return freshDb;
    }

    try {
      const loaded = JSON.parse(fs.readFileSync(this.dbFile, "utf8"));
      return this.normalizeDb(loaded);
    } catch (err) {
      const brokenFile = `${this.dbFile}.broken-${Date.now()}`;
      fs.copyFileSync(this.dbFile, brokenFile);
      console.error(`Cannot read db.json, copied broken file to ${brokenFile}`);
      return this.createEmptyDb();
    }
  }

  async save(db) {
    this.ensureDataDirs();
    const tmpFile = `${this.dbFile}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2));
    fs.renameSync(tmpFile, this.dbFile);
  }

  async close() {}
}

class PostgresDataStore {
  constructor(options) {
    this.databaseUrl = options.databaseUrl;
    this.createEmptyDb = options.createEmptyDb;
    this.normalizeDb = options.normalizeDb;
    this.ensureDataDirs = options.ensureDataDirs;
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
    return this.normalizeDb(result.rows[0].state);
  }

  async save(db) {
    const payload = JSON.stringify(db);
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
  createDataStore,
  resolveBackendFromEnv,
};
