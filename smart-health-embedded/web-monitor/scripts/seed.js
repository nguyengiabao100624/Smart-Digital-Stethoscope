const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run seed");
  }

  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const seedFile = path.join(__dirname, "..", "db", "seeds", "dev.sql");
    const sql = fs.readFileSync(seedFile, "utf8");
    await client.query(sql);
    console.log("seeded dev data");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
