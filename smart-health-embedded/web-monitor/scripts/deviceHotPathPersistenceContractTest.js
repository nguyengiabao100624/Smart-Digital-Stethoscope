"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "src", "repositories.js"),
  "utf8",
);

test("SQL device telemetry updates do not rewrite the monolithic runtime snapshot", () => {
  const devicesStart = source.indexOf("const devices = {");
  const saveStart = source.indexOf("async save(device)", devicesStart);
  const saveEnd = source.indexOf("async refreshOtaDownloadAuthority", saveStart);
  assert.ok(devicesStart >= 0 && saveStart > devicesStart && saveEnd > saveStart);

  const method = source.slice(saveStart, saveEnd);
  const sqlBranchStart = method.indexOf("if (getPool()) {");
  const sqlBranchEnd = method.indexOf("return cloneRuntimeValue(canonicalDevice);", sqlBranchStart);
  const jsonFallbackStart = method.indexOf("return runDeviceProvisionMutationExclusive", sqlBranchEnd);
  assert.ok(sqlBranchStart >= 0 && sqlBranchEnd > sqlBranchStart && jsonFallbackStart > sqlBranchEnd);
  assert.doesNotMatch(
    method.slice(sqlBranchStart, sqlBranchEnd),
    /await saveDb\(\)/,
  );
  assert.match(method.slice(jsonFallbackStart), /await saveDb\(\)/);
});
