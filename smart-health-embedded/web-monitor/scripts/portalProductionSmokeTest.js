const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const defaultBackendUrl = "https://smart-health-api-xj0a.onrender.com";

function readEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function readSmokeCredentials(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing smoke credentials file: ${filePath}. Run npm.cmd run smoke:production-roles first.`,
    );
  }
  const credentials = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const accounts = new Map((credentials.accounts || []).map((account) => [account.key, account]));
  for (const key of ["platform", "workspace", "doctor"]) {
    const account = accounts.get(key);
    if (!account || !account.email || !account.password) {
      throw new Error(`Smoke credentials file is missing the ${key} account.`);
    }
  }
  return { credentials, accounts };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
  }
  return { response, data, text };
}

async function postJson(url, payload, headers = {}) {
  const result = await requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  if (!result.response.ok) {
    throw new Error(`${result.response.status} ${url}: ${result.data.error?.message || result.text}`);
  }
  return result.data;
}

async function signInWithFirebase(apiKey, account) {
  return postJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    { email: account.email, password: account.password, returnSecureToken: true },
  );
}

async function expectEndpoint({ backendUrl, idToken, name, pathname, statuses = [200], validate }) {
  const result = await requestJson(`${backendUrl}${pathname}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!statuses.includes(result.response.status)) {
    throw new Error(
      `${name} returned HTTP ${result.response.status}, expected ${statuses.join("/")}: ${result.text.slice(0, 240)}`,
    );
  }
  if (validate) {
    validate(result.data);
  }
  return { name, status: result.response.status };
}

function assertPortalUser(user, expectedRole) {
  assert.equal(user.role, expectedRole);
  assert.ok((user.allowedSurfaces || []).includes("portal"));
  assert.equal((user.capabilities || []).some((capability) => capability.startsWith("platform.")), false);
}

async function runAccount({ apiKey, backendUrl, account, scenarios }) {
  const signIn = await signInWithFirebase(apiKey, account);
  const results = [];
  for (const scenario of scenarios) {
    results.push(
      await expectEndpoint({
        backendUrl,
        idToken: signIn.idToken,
        ...scenario,
      }),
    );
  }
  return {
    key: account.key,
    email: account.email,
    checked: results.map((result) => `${result.name}:${result.status}`),
  };
}

async function main() {
  const defaultWebEnvPath = path.resolve(
    rootDir,
    "..",
    "..",
    "smart-health-admin",
    "thi\u1ebft k\u1ebf giao di\u1ec7n",
    ".env.production",
  );
  const webEnv = readEnvFile(process.env.WEB_ADMIN_ENV_FILE || defaultWebEnvPath);
  const apiKey = process.env.FIREBASE_WEB_API_KEY || webEnv.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Firebase Web API key. Set FIREBASE_WEB_API_KEY or WEB_ADMIN_ENV_FILE.");
  }

  const credentialsFile =
    process.env.SMOKE_CREDENTIALS_FILE ||
    path.join(rootDir, ".test-data", "production-role-smoke-credentials.json");
  const { credentials, accounts } = readSmokeCredentials(credentialsFile);
  const backendUrl = String(
    process.env.SMOKE_BACKEND_URL ||
      process.env.PUBLIC_BACKEND_URL ||
      credentials.backendUrl ||
      webEnv.VITE_SMART_HEALTH_BASE_URL ||
      defaultBackendUrl,
  ).replace(/\/+$/, "");

  const platform = accounts.get("platform");
  const workspace = accounts.get("workspace");
  const doctor = accounts.get("doctor");

  const commonPortalReadScenarios = [
    { name: "portal status", pathname: "/api/portal/status" },
    { name: "portal overview", pathname: "/api/portal/overview" },
    { name: "portal patients", pathname: "/api/portal/patients", validate: (data) => assert.ok(Array.isArray(data.patients)) },
    { name: "portal scans", pathname: "/api/portal/scans", validate: (data) => assert.ok(Array.isArray(data.scans)) },
    { name: "portal notifications", pathname: "/api/portal/notifications", validate: (data) => assert.ok(Array.isArray(data.notifications)) },
  ];

  const results = [];
  results.push(
    await runAccount({
      apiKey,
      backendUrl,
      account: platform,
      scenarios: [
        {
          name: "platform blocked from portal",
          pathname: "/api/portal/status",
          statuses: [403],
        },
      ],
    }),
  );
  results.push(
    await runAccount({
      apiKey,
      backendUrl,
      account: workspace,
      scenarios: [
        {
          name: "workspace /api/me",
          pathname: "/api/me",
          validate: (data) => assertPortalUser(data.user, "workspace_admin"),
        },
        ...commonPortalReadScenarios,
        { name: "portal devices", pathname: "/api/portal/devices", validate: (data) => assert.ok(Array.isArray(data.devices)) },
        { name: "portal monitoring", pathname: "/api/portal/monitoring" },
        { name: "portal reports", pathname: "/api/portal/reports" },
        { name: "portal audit log", pathname: "/api/portal/audit-log" },
        { name: "portal settings", pathname: "/api/portal/settings" },
      ],
    }),
  );
  results.push(
    await runAccount({
      apiKey,
      backendUrl,
      account: doctor,
      scenarios: [
        {
          name: "doctor /api/me",
          pathname: "/api/me",
          validate: (data) => assertPortalUser(data.user, "doctor"),
        },
        ...commonPortalReadScenarios,
      ],
    }),
  );

  console.log("Smart Health authenticated portal production smoke: PASS");
  console.log(JSON.stringify({ ok: true, backendUrl, credentialsCreatedAt: credentials.createdAt, results }, null, 2));
}

main().catch((error) => {
  console.error("Smart Health authenticated portal production smoke: FAIL");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
