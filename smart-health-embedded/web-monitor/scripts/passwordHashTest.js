const assert = require("node:assert/strict");
const test = require("node:test");

const {
  hashPasswordSecret,
  isPasswordHash,
  normalizePasswordHash,
  verifyPasswordSecret,
} = require("../src/passwordHash");
const { createRepositories } = require("../src/repositories");

test("scrypt password hashes preserve exact secret semantics", () => {
  const secret = " ExactPassword123 ";
  const hash = hashPasswordSecret(secret);

  assert.equal(isPasswordHash(hash), true);
  assert.equal(hash.includes(secret), false);
  assert.equal(verifyPasswordSecret(secret, hash), true);
  assert.equal(verifyPasswordSecret(secret.trim(), hash), false);
  assert.equal(normalizePasswordHash(hash), hash);
});

test("legacy plaintext comparison is exact and timing-safe compatible", () => {
  assert.equal(
    verifyPasswordSecret(" LegacyPassword123 ", " LegacyPassword123 "),
    true,
  );
  assert.equal(
    verifyPasswordSecret("LegacyPassword123", " LegacyPassword123 "),
    false,
  );
});

test("JSON repository persistence never writes raw demo passwords", async () => {
  const db = { users: [], auditLogs: [] };
  const snapshots = [];
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => snapshots.push(JSON.stringify(db)),
    createId: (prefix) => `${prefix}_password_hash_test`,
    nowIso: () => "2026-07-29T00:00:00.000Z",
    getPool: () => null,
  });

  await repositories.users.save({
    id: "user_password_hash_test",
    role: "patient",
    password: " InitialPassword123 ",
  });
  assert.equal(isPasswordHash(db.users[0].password), true);
  assert.equal(
    snapshots.some((snapshot) => snapshot.includes(" InitialPassword123 ")),
    false,
  );

  await repositories.users.updatePasswordExact(
    "user_password_hash_test",
    " UpdatedPassword456 ",
  );
  assert.equal(isPasswordHash(db.users[0].password), true);
  assert.equal(
    verifyPasswordSecret(" UpdatedPassword456 ", db.users[0].password),
    true,
  );
  assert.equal(
    snapshots.some((snapshot) => snapshot.includes(" UpdatedPassword456 ")),
    false,
  );
});

test("SQL password update receives only a derived hash", async () => {
  const db = { users: [], auditLogs: [] };
  let passwordParameter = "";
  const pool = {
    async query(sql, params = []) {
      if (/UPDATE users SET password_hash/i.test(sql)) {
        passwordParameter = params[1];
        return {
          rows: [
            {
              id: params[0],
              role: "patient",
              account_status: "active",
              password_hash: params[1],
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_password_sql_test`,
    nowIso: () => "2026-07-29T00:00:00.000Z",
    getPool: () => pool,
  });

  await repositories.users.updatePasswordExact(
    "user_password_sql_test",
    " SqlPassword789 ",
  );
  assert.equal(isPasswordHash(passwordParameter), true);
  assert.equal(passwordParameter.includes(" SqlPassword789 "), false);
  assert.equal(verifyPasswordSecret(" SqlPassword789 ", passwordParameter), true);
});
