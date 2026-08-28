"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "src", "repositories.js"),
  "utf8",
);

test("SQL Firebase identity reconciliation does not rewrite the monolithic runtime snapshot", () => {
  const syncStart = source.indexOf("syncArrayItem(runtimeDb.users, result.user)");
  const nextFunction = source.indexOf("async function queryDeleteUserGraph", syncStart);
  assert.ok(syncStart >= 0 && nextFunction > syncStart);
  assert.doesNotMatch(source.slice(syncStart, nextFunction), /await saveDb\(\)/);
});

test("SQL auth session resolution keeps PostgreSQL canonical without a runtime blob write", () => {
  const methodStart = source.indexOf("async resolveFirebaseSession(session)");
  const methodEnd = source.indexOf("async isActiveForUser", methodStart);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const method = source.slice(methodStart, methodEnd);
  assert.match(method, /if \(!getPool\(\)\) await saveDb\(\)/);
  assert.doesNotMatch(method, /syncArrayItem\(getDb\(\)\.authSessions, resolved\);\s*await saveDb\(\)/);
});
