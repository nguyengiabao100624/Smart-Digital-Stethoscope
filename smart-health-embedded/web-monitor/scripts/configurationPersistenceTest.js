"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRepositories } = require("../src/repositories");

function createRuntimeFixture() {
  let saveCalls = 0;
  const db = {
    settings: { theme: "light" },
    organizations: [
      {
        id: "workspace-current",
        name: "Current workspace",
        settings: { language: "vi" },
        createdAt: "2026-08-28T08:00:00.000Z",
        updatedAt: "2026-08-28T08:00:00.000Z",
      },
    ],
  };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      saveCalls += 1;
    },
    createId: (prefix) => `${prefix}_1`,
    nowIso: () => "2026-08-28T08:00:01.000Z",
    getPool: () => null,
  });
  return { db, repositories, getSaveCalls: () => saveCalls };
}

function organizationRow(settings = {}) {
  return {
    id: "workspace-current",
    name: "Current workspace",
    type: "clinic",
    workspace_type: "clinic",
    address: "",
    phone: "",
    email: "",
    website: "",
    status: "active",
    legal_name: "",
    representative: "",
    owner_user_id: null,
    package_id: "",
    subscription_status: "trial",
    billing_cycle: "monthly",
    request_metadata: {},
    settings,
    version: 1,
    deleted_at: null,
    created_at: "2026-08-28T08:00:00.000Z",
    updated_at: "2026-08-28T08:00:01.000Z",
  };
}

function createSqlFixture() {
  let saveCalls = 0;
  const db = {
    settings: { theme: "light" },
    organizations: [
      {
        id: "workspace-current",
        name: "Current workspace",
        settings: { language: "vi" },
      },
    ],
  };
  const state = {
    platformSettings: {},
    workspaceSettings: { language: "vi" },
    queries: [],
  };
  const pool = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      state.queries.push(normalized);
      if (/INSERT INTO platform_settings/i.test(normalized)) {
        state.platformSettings = JSON.parse(params[0]);
        return { rowCount: 1, rows: [] };
      }
      if (/UPDATE organizations SET settings/i.test(normalized)) {
        if (params[0] !== "workspace-current") return { rowCount: 0, rows: [] };
        state.workspaceSettings = JSON.parse(params[1]);
        return {
          rowCount: 1,
          rows: [organizationRow(state.workspaceSettings)],
        };
      }
      throw new Error(`Unexpected SQL in configuration persistence test: ${normalized}`);
    },
  };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      saveCalls += 1;
    },
    createId: (prefix) => `${prefix}_sql_1`,
    nowIso: () => "2026-08-28T08:00:01.000Z",
    getPool: () => pool,
  });
  return { db, repositories, state, getSaveCalls: () => saveCalls };
}

test("runtime configuration saves exactly one durable snapshot per mutation", async () => {
  const { db, repositories, getSaveCalls } = createRuntimeFixture();

  await repositories.configuration.savePlatform({ theme: "dark" });
  await repositories.configuration.saveWorkspace("workspace-current", {
    language: "en",
  });

  assert.deepEqual(db.settings, { theme: "dark" });
  assert.deepEqual(db.organizations[0].settings, { language: "en" });
  assert.equal(getSaveCalls(), 2);
});

test("SQL configuration persists canonical platform and workspace state without rewriting runtime JSON", async () => {
  const { db, repositories, state, getSaveCalls } = createSqlFixture();

  await repositories.configuration.savePlatform({ theme: "system" });
  await repositories.configuration.saveWorkspace("workspace-current", {
    language: "vi",
    notifications: { email: true },
  });

  assert.deepEqual(state.platformSettings, { theme: "system" });
  assert.deepEqual(state.workspaceSettings, {
    language: "vi",
    notifications: { email: true },
  });
  assert.deepEqual(db.settings, { theme: "system" });
  assert.deepEqual(db.organizations[0].settings, state.workspaceSettings);
  assert.equal(getSaveCalls(), 0);
  assert.equal(state.queries.length, 2);
});

test("workspace configuration rejects a deleted or unknown workspace", async () => {
  const { repositories } = createSqlFixture();

  await assert.rejects(
    repositories.configuration.saveWorkspace("workspace-missing", { language: "vi" }),
    (error) => error?.statusCode === 404 && error?.code === "WORKSPACE_NOT_FOUND",
  );
});
