const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { getFirebaseAdmin } = require("../src/firebaseAuth");

const rootDir = path.join(__dirname, "..");

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

function randomPassword() {
  return `Shw@${crypto.randomBytes(10).toString("base64url")}1`;
}

async function getOrCreateFirebaseUser(admin, account) {
  try {
    const existing = await admin.auth().getUserByEmail(account.email);
    await admin.auth().updateUser(existing.uid, {
      password: account.password,
      displayName: account.displayName,
      emailVerified: true,
      disabled: false,
    });
    await admin.auth().setCustomUserClaims(existing.uid, account.claims);
    return { uid: existing.uid, created: false };
  } catch (err) {
    if (!err || err.code !== "auth/user-not-found") {
      throw err;
    }
    const created = await admin.auth().createUser({
      email: account.email,
      password: account.password,
      displayName: account.displayName,
      emailVerified: true,
      disabled: false,
    });
    await admin.auth().setCustomUserClaims(created.uid, account.claims);
    return { uid: created.uid, created: true };
  }
}

async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${response.status} ${url}: ${data.error?.message || data.message || text}`);
  }
  return data;
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${response.status} ${url}: ${data.error?.message || data.message || text}`);
  }
  return data;
}

async function signInWithFirebase(apiKey, email, password) {
  return postJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    { email, password, returnSecureToken: true },
  );
}

function assertPlatformUser(user) {
  const capabilities = user.capabilities || [];
  assert.equal(user.role, "admin");
  assert.ok(capabilities.some((capability) => capability.startsWith("platform.")));
}

function assertWorkspaceAdminUser(user) {
  const capabilities = user.capabilities || [];
  assert.equal(user.role, "workspace_admin");
  assert.ok(capabilities.includes("workspace.dashboard.view"));
  assert.ok(capabilities.includes("workspace.staff.manage"));
  assert.equal(capabilities.some((capability) => capability.startsWith("platform.")), false);
}

function assertDoctorPortalUser(user) {
  const capabilities = user.capabilities || [];
  const allowedSurfaces = user.allowedSurfaces || [];
  assert.equal(user.role, "doctor");
  assert.equal(user.requestedRole, "doctor");
  assert.equal(user.roleRequestStatus, "approved");
  assert.ok(allowedSurfaces.includes("portal"));
  assert.equal(user.defaultSurface, "portal");
  assert.ok(capabilities.includes("workspace.dashboard.view"));
  assert.ok(capabilities.includes("workspace.scans.manage"));
  assert.equal(capabilities.some((capability) => capability.startsWith("platform.")), false);
}

async function authenticateBackend(backendUrl, idToken) {
  const authHeader = { Authorization: `Bearer ${idToken}` };
  const login = await getJson(`${backendUrl}/api/auth/firebase`, authHeader);
  const me = await getJson(`${backendUrl}/api/me`, authHeader);
  return { loginUser: login.user, meUser: me.user };
}

async function runAccountSmoke({ apiKey, backendUrl, account, assertUser }) {
  const signIn = await signInWithFirebase(apiKey, account.email, account.password);
  const result = await authenticateBackend(backendUrl, signIn.idToken);
  assertUser(result.meUser);
  return {
    uid: account.uid,
    email: account.email,
    role: result.meUser.role,
    workspaceId: result.meUser.currentWorkspaceId || "",
    allowedSurfaces: result.meUser.allowedSurfaces || [],
    defaultSurface: result.meUser.defaultSurface || "",
    capabilityCount: (result.meUser.capabilities || []).length,
    hasPlatformCapabilities: (result.meUser.capabilities || []).some((capability) => capability.startsWith("platform.")),
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
  const backendUrl = (
    process.env.PUBLIC_BACKEND_URL ||
    process.env.SMART_HEALTH_PUBLIC_URL ||
    webEnv.VITE_SMART_HEALTH_BASE_URL ||
    "https://shcare-api-prod.onrender.com"
  ).replace(/\/+$/, "");
  const organizationId = process.env.SMOKE_ORGANIZATION_ID || "org_default_clinic";

  if (!apiKey) {
    throw new Error("Missing Firebase Web API key. Set FIREBASE_WEB_API_KEY or WEB_ADMIN_ENV_FILE.");
  }

  const admin = getFirebaseAdmin(process.env);
  if (!admin) {
    throw new Error("Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
  }

  const accounts = [
    {
      key: "platform",
      email: (process.env.SMOKE_PLATFORM_EMAIL || "platform.admin.smoke@smarthealth.test").toLowerCase(),
      password: process.env.SMOKE_PLATFORM_PASSWORD || randomPassword(),
      displayName: "Smart Health Platform Smoke",
      claims: {
        role: "admin",
        organizationId,
        smartHealth: { role: "admin", organizationId },
      },
      assertUser: assertPlatformUser,
    },
    {
      key: "workspace",
      email: (process.env.SMOKE_WORKSPACE_EMAIL || "workspace.admin.smoke@smarthealth.test").toLowerCase(),
      password: process.env.SMOKE_WORKSPACE_PASSWORD || randomPassword(),
      displayName: "Smart Health Workspace Smoke",
      claims: {
        role: "workspace_admin",
        organizationId,
        smartHealth: { role: "workspace_admin", organizationId },
      },
      assertUser: assertWorkspaceAdminUser,
    },
    {
      key: "doctor",
      email: (process.env.SMOKE_DOCTOR_EMAIL || "doctor.portal.smoke@smarthealth.test").toLowerCase(),
      password: process.env.SMOKE_DOCTOR_PASSWORD || randomPassword(),
      displayName: "Smart Health Doctor Portal Smoke",
      claims: {
        role: "doctor",
        organizationId: "vn_hospital_quan_y_175",
        smartHealth: { role: "doctor", organizationId: "vn_hospital_quan_y_175" },
      },
      assertUser: assertDoctorPortalUser,
    },
  ];

  for (const account of accounts) {
    const firebaseUser = await getOrCreateFirebaseUser(admin, account);
    account.uid = firebaseUser.uid;
    account.created = firebaseUser.created;
  }

  const results = [];
  for (const account of accounts) {
    results.push(await runAccountSmoke({ apiKey, backendUrl, account, assertUser: account.assertUser }));
  }

  const credentialsFile = path.join(rootDir, ".test-data", "production-role-smoke-credentials.json");
  fs.mkdirSync(path.dirname(credentialsFile), { recursive: true });
  fs.writeFileSync(
    credentialsFile,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        backendUrl,
        organizationId,
        accounts: accounts.map((account) => ({
          key: account.key,
          uid: account.uid,
          email: account.email,
          password: account.password,
          claims: account.claims,
          created: account.created,
        })),
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ ok: true, backendUrl, organizationId, credentialsFile, results }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
