const { Client } = require("pg");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  let userCount = 0;
  let deviceCount = 0;
  try {
    const userRes = await client.query("SELECT count(*)::int AS count FROM users");
    userCount = userRes.rows[0]?.count || 0;
    const devRes = await client.query("SELECT count(*)::int AS count FROM devices");
    deviceCount = devRes.rows[0]?.count || 0;
  } catch (err) {
    console.warn("[SEED] Table count query warning:", err.message);
  } finally {
    await client.end();
  }

  if (userCount === 0 || deviceCount === 0) {
    console.log(`[SEED] Database is empty (users: ${userCount}, devices: ${deviceCount}). Populating seed data...`);
    const seedFile = path.join(__dirname, "..", "db", "seeds", "seed-database.json");
    const seedProc = spawnSync(process.execPath, [path.join(__dirname, "migrateJsonToPostgres.js")], {
      stdio: "inherit",
      env: {
        ...process.env,
        DB_FILE: seedFile,
      },
    });
    if (seedProc.status !== 0) {
      console.warn("[SEED] migrateJsonToPostgres exited with code:", seedProc.status);
    } else {
      console.log("[SEED] Initial seed successfully synchronized into PostgreSQL!");
    }
  } else {
    console.log(`[SEED] Database already populated (users: ${userCount}, devices: ${deviceCount}). Skipping initial import.`);
  }
}

main().catch((err) => {
  console.warn("[SEED] Non-critical seed check error:", err.message);
});
