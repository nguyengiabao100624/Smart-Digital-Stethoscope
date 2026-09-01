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
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text.slice(0, 300) };
      }
      if (response.ok) return data;
      const error = new Error(
        `${response.status} ${url}: ${data.error?.message || data.message || text}`,
      );
      error.status = response.status;
      if (response.status < 500 || attempt === 4) throw error;
    } catch (error) {
      if ((error.status && error.status < 500) || attempt === 4) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
  }
  throw new Error(`Request retry budget exhausted for ${url}.`);
}

async function signInWithFirebase(apiKey, email, password) {
  return postJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    { email, password, returnSecureToken: true },
  );
}

async function signInWithFirebaseCustomToken(apiKey, token) {
  return postJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    { token, returnSecureToken: true },
  );
}

async function apiJson(backendUrl, pathName, { token, method = "GET", body, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const retryable = method === "GET" || Boolean(idempotencyKey);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${backendUrl}${pathName}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text.slice(0, 300) };
      }
      if (response.ok) return data;
      const error = new Error(
        `${response.status} ${pathName}: ${data.error?.message || data.message || text}`,
      );
      error.status = response.status;
      error.response = data;
      if (!retryable || response.status < 500 || attempt === 3) throw error;
    } catch (error) {
      if (!retryable || (error.status && error.status < 500) || attempt === 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
  }
  throw new Error(`Request retry budget exhausted for ${pathName}.`);
}

async function getBootstrapPlatformSession({ admin, apiKey, backendUrl, email }) {
  if (!email) {
    throw new Error(
      "Missing SMOKE_BOOTSTRAP_ADMIN_EMAIL. Set it to an existing canonical platform-admin account.",
    );
  }
  const firebaseUser = await admin.auth().getUserByEmail(email.toLowerCase());
  const customToken = await admin.auth().createCustomToken(firebaseUser.uid);
  const signIn = await signInWithFirebaseCustomToken(apiKey, customToken);
  const authenticated = await authenticateBackend(backendUrl, signIn.idToken);
  assertPlatformUser(authenticated.meUser);
  return { idToken: signIn.idToken, user: authenticated.meUser };
}

async function provisionManagedAdmin({ admin, apiKey, backendUrl, bootstrapToken, account }) {
  let firebaseUser = null;
  try {
    firebaseUser = await admin.auth().getUserByEmail(account.email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
  let created = null;
  if (!firebaseUser) {
    try {
      created = await apiJson(backendUrl, "/api/admin/admin-users", {
        token: bootstrapToken,
        method: "POST",
        idempotencyKey: `production-role-smoke:${account.key}:v2`,
        body: {
          role: account.claims.role,
          email: account.email,
          password: account.password,
          name: account.displayName,
          title:
            account.claims.role === "admin"
              ? "Platform smoke admin"
              : "Workspace smoke admin",
          organizationId: account.claims.organizationId,
        },
      });
    } catch (error) {
      if (Number(error.status) < 500) throw error;
    }
    firebaseUser = await admin.auth().getUserByEmail(account.email);
  }
  await admin.auth().updateUser(firebaseUser.uid, {
    password: account.password,
    displayName: account.displayName,
    emailVerified: true,
    disabled: false,
  });
  const firebaseUid = firebaseUser?.uid;
  if (!firebaseUid) {
    throw new Error(`Managed ${account.key} provisioning did not return canonical identities.`);
  }
  const signIn = await signInWithFirebase(apiKey, account.email, account.password);
  const authenticated = await authenticateBackend(backendUrl, signIn.idToken);
  account.assertUser(authenticated.meUser);
  account.uid = firebaseUid;
  account.created = created?.firebase?.created === true;
}

async function provisionDoctor({ admin, apiKey, backendUrl, bootstrapToken, account }) {
  const firebaseUser = await getOrCreateFirebaseUser(admin, account);
  account.uid = firebaseUser.uid;
  account.created = firebaseUser.created;

  let signIn = await signInWithFirebase(apiKey, account.email, account.password);
  let authenticated = await authenticateBackend(backendUrl, signIn.idToken);
  if (
    authenticated.meUser.role !== "doctor" ||
    authenticated.meUser.roleRequestStatus !== "approved"
  ) {
    const requested = await apiJson(backendUrl, "/api/v1/auth/role-request", {
      token: signIn.idToken,
      method: "POST",
      idempotencyKey: "production-role-smoke:doctor:v2:request",
      body: {
        requestedRole: "doctor",
        accountType: "doctor",
        workspaceType: "clinic",
        organizationId: account.claims.organizationId,
        name: account.displayName,
        license: "CCHN-SHCARE-SMOKE-V2",
        department: "Tim mạch",
        registrationReason: "Controlled production role smoke account",
      },
    });
    const doctorUserId = requested.user?.id;
    if (!doctorUserId) throw new Error("Doctor role request did not return user.id.");
    await apiJson(
      backendUrl,
      `/api/admin/doctor-requests/${encodeURIComponent(doctorUserId)}/approve`,
      {
        token: bootstrapToken,
        method: "POST",
        idempotencyKey: "production-role-smoke:doctor:v2:approve",
        body: { organizationId: account.claims.organizationId },
      },
    );
    signIn = await signInWithFirebase(apiKey, account.email, account.password);
    authenticated = await authenticateBackend(backendUrl, signIn.idToken);
  }
  assertDoctorPortalUser(authenticated.meUser);
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
  const bootstrapAdminEmail = String(
    process.env.SMOKE_BOOTSTRAP_ADMIN_EMAIL || "",
  )
    .trim()
    .toLowerCase();

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
      email: (process.env.SMOKE_PLATFORM_EMAIL || "platform.admin.smoke.v2@smarthealth.test").toLowerCase(),
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
      email: (process.env.SMOKE_WORKSPACE_EMAIL || "workspace.admin.smoke.v2@smarthealth.test").toLowerCase(),
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
      email: (process.env.SMOKE_DOCTOR_EMAIL || "doctor.portal.smoke.v2@smarthealth.test").toLowerCase(),
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

  const bootstrap = await getBootstrapPlatformSession({
    admin,
    apiKey,
    backendUrl,
    email: bootstrapAdminEmail,
  });
  for (const account of accounts.filter((item) => item.key !== "doctor")) {
    await provisionManagedAdmin({
      admin,
      apiKey,
      backendUrl,
      bootstrapToken: bootstrap.idToken,
      account,
    });
  }
  await provisionDoctor({
    admin,
    apiKey,
    backendUrl,
    bootstrapToken: bootstrap.idToken,
    account: accounts.find((item) => item.key === "doctor"),
  });

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
