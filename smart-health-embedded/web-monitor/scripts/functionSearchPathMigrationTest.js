const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "..", "db", "migrations", "060_pin_trigger_function_search_paths.sql"),
  "utf8",
);
const executableSql = migration.replace(/--.*$/gm, "");

const triggerFunctions = [
  "prevent_audit_log_mutation",
  "validate_audit_actor_on_insert",
  "enforce_active_doctor_access_identity",
  "revoke_patient_access_on_doctor_demotion",
];

test("migration pins the exact four trigger functions to an empty search_path", () => {
  for (const functionName of triggerFunctions) {
    assert.match(
      executableSql,
      new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${functionName}\\s*\\(\\s*\\)`, "i"),
      `${functionName} must be replaced by its schema-qualified identity`,
    );
  }

  assert.equal(
    (executableSql.match(/SECURITY\s+INVOKER/gi) || []).length,
    triggerFunctions.length,
    "every hardened trigger must retain invoker privileges",
  );
  assert.equal(
    (executableSql.match(/SET\s+search_path\s*=\s*''/gi) || []).length,
    triggerFunctions.length,
    "every hardened trigger must use an empty search_path",
  );
  assert.doesNotMatch(executableSql, /SECURITY\s+DEFINER/i);
});

test("migration fully qualifies application relations and does not change trigger bindings or grants", () => {
  assert.match(executableSql, /FROM\s+public\.users\s+AS\s+candidate_user/i);
  assert.match(executableSql, /FROM\s+public\.users\s+AS\s+doctor/i);
  assert.match(executableSql, /UPDATE\s+public\.doctor_patient_access\s+AS\s+access/i);
  assert.match(executableSql, /INSERT\s+INTO\s+public\.audit_logs/i);

  assert.doesNotMatch(executableSql, /\bFROM\s+users\b/i);
  assert.doesNotMatch(executableSql, /\bUPDATE\s+doctor_patient_access\b/i);
  assert.doesNotMatch(executableSql, /\bINSERT\s+INTO\s+audit_logs\b/i);
  assert.doesNotMatch(executableSql, /\b(?:DROP|CREATE)\s+TRIGGER\b/i);
  assert.doesNotMatch(executableSql, /\b(?:GRANT|REVOKE)\b/i);
  assert.doesNotMatch(executableSql, /\bALTER\s+TABLE\b/i);
});
