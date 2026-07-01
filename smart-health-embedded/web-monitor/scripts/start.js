const { spawnSync } = require("node:child_process");
const path = require("node:path");

if (process.env.DATABASE_URL) {
  const migration = spawnSync(process.execPath, [path.join(__dirname, "migrate.js")], {
    stdio: "inherit",
    env: process.env,
  });
  if (migration.status !== 0) {
    process.exit(migration.status || 1);
  }
}

require("../server");
