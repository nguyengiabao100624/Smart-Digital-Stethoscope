const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");

test("production container uses the migration-aware canonical start command", () => {
  const dockerfile = fs.readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  const startScript = fs.readFileSync(path.join(__dirname, "start.js"), "utf8");

  assert.match(
    dockerfile,
    /^CMD\s+\["npm",\s*"start"\]\s*$/m,
    "Docker must enter through npm start so PostgreSQL migrations cannot be bypassed",
  );
  assert.doesNotMatch(
    dockerfile,
    /^CMD\s+\["node",\s*"server\.js"\]\s*$/m,
    "Docker must not launch server.js directly",
  );
  assert.equal(packageJson.scripts.start, "node scripts/start.js");

  const migrationCall = startScript.indexOf('path.join(__dirname, "migrate.js")');
  const serverStart = startScript.indexOf('require("../server")');
  assert.ok(migrationCall >= 0, "canonical start must invoke the migration runner");
  assert.ok(serverStart > migrationCall, "the server must start only after migrations finish");
  assert.match(
    startScript,
    /if \(migration\.status !== 0\)[\s\S]*process\.exit\(migration\.status \|\| 1\)/,
    "a failed migration must terminate startup",
  );
});
