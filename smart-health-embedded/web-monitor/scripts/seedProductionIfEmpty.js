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
  let hasHilDevice = false;
  try {
    const userRes = await client.query("SELECT count(*)::int AS count FROM users");
    userCount = userRes.rows[0]?.count || 0;
    const devRes = await client.query("SELECT count(*)::int AS count FROM devices");
    deviceCount = devRes.rows[0]?.count || 0;
    const hilRes = await client.query("SELECT count(*)::int AS count FROM devices WHERE id = 'shcare-g3-hil'");
    hasHilDevice = (hilRes.rows[0]?.count || 0) > 0;
    // Clean up obsolete dummy placeholder device if present
    await client.query("DELETE FROM devices WHERE id = 'lite-steth-a92'").catch(() => {});
  } catch (err) {
    console.warn("[SEED] Table count query warning:", err.message);
  } finally {
    await client.end();
  }

  if (userCount <= 1 || deviceCount <= 1 || !hasHilDevice || process.env.FORCE_SEED === "true") {
    console.log(`[SEED] Database needs full seed synchronization (users: ${userCount}, devices: ${deviceCount}, hasHil: ${hasHilDevice}). Populating seed data...`);
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
      console.log("[SEED] Full seed dataset successfully synchronized into PostgreSQL!");
    }
  } else {
    console.log(`[SEED] Database already populated (users: ${userCount}, devices: ${deviceCount}). Skipping initial import.`);
  }
}

main().catch((err) => {
  console.warn("[SEED] Non-critical seed check error:", err.message);
});
