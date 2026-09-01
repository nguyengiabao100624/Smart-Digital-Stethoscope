let firebaseApp = null;
let firebaseServices = null;

function resolveFirebaseAdminMutationTimeoutMs(env = process.env) {
  const value = Number(env.FIREBASE_ADMIN_MUTATION_TIMEOUT_MS || 8_000);
  return Number.isFinite(value) ? Math.max(100, Math.min(30_000, value)) : 8_000;
}

async function runFirebaseAdminMutation(operation, env = process.env, label = "Firebase Admin") {
  const timeoutMs = resolveFirebaseAdminMutationTimeoutMs(env);
  let timeout;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`${label} timed out after ${timeoutMs} ms`);
          error.code = "FIREBASE_ADMIN_TIMEOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isFirebaseAuthEnabled(env = process.env) {
  return (
    String(env.FIREBASE_AUTH_ENABLED || "").toLowerCase() === "true" ||
    Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON) ||
    Boolean(env.GOOGLE_APPLICATION_CREDENTIALS)
  );
}

function parseServiceAccount(value) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  const parsed = JSON.parse(trimmed);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function resolveServiceAccount(env = process.env) {
  const inline = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (inline) return inline;

  const credentialsPath = String(env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
  if (!credentialsPath) return null;

  const fs = require("node:fs");
  return parseServiceAccount(fs.readFileSync(credentialsPath, "utf8"));
}

function isFirebaseAuthEmulatorConfigured(env = process.env) {
  const value = String(env.FIREBASE_AUTH_EMULATOR_HOST || "").trim();
  return Boolean(value) && /^[A-Za-z0-9.-]+:\d{1,5}$/.test(value);
}

function getFirebaseAdmin(env = process.env) {
  if (!isFirebaseAuthEnabled(env)) {
    return null;
  }

  if (firebaseApp && firebaseServices) {
    return firebaseServices;
  }

  const {
    applicationDefault,
    cert,
    getApp,
    getApps,
    initializeApp,
  } = require("firebase-admin/app");
  const { getAuth } = require("firebase-admin/auth");
  const { getMessaging } = require("firebase-admin/messaging");

  const serviceAccount = resolveServiceAccount(env);
  const authEmulatorConfigured = isFirebaseAuthEmulatorConfigured(env);
  const options = {};
  if (env.FIREBASE_PROJECT_ID) {
    options.projectId = env.FIREBASE_PROJECT_ID;
  }
  if (serviceAccount) {
    options.credential = cert(serviceAccount);
  } else if (!authEmulatorConfigured) {
    options.credential = applicationDefault();
  }

  firebaseApp = getApps().length ? getApp() : initializeApp(options);
  firebaseServices = Object.freeze({
    app: firebaseApp,
    auth: () => getAuth(firebaseApp),
    messaging: () => getMessaging(firebaseApp),
  });
  return firebaseServices;
}

async function verifyFirebaseIdToken(idToken, env = process.env, options = {}) {
  const admin = options.admin || getFirebaseAdmin(env);
  if (!admin) {
    return null;
  }
  return admin.auth().verifyIdToken(idToken, true);
}

function getFirebaseIdTokenErrorCode(error = {}) {
  const providerCode = String(error.code || "");
  if (providerCode === "auth/id-token-revoked") {
    return "FIREBASE_ID_TOKEN_REVOKED";
  }
  if (providerCode === "auth/id-token-expired") {
    return "FIREBASE_ID_TOKEN_EXPIRED";
  }
  return "INVALID_FIREBASE_TOKEN";
}

function normalizeFirebaseAuthTime(decodedToken = {}) {
  const value = Number(decodedToken.auth_time);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return "";
  }
  return String(value);
}

function isFirebaseProviderMutationConfirmed(
  targetUser = {},
  result = {},
  operation = "",
) {
  if (result.providerSucceeded === false) {
    return false;
  }
  if (operation === "reset_password") {
    return result.updated === true;
  }
  if (!String(targetUser.firebaseUid || "")) {
    return true;
  }
  return (
    result.updated === true ||
    result.firebaseDeleted === true ||
    result.firebaseAlreadyMissing === true
  );
}

module.exports = {
  getFirebaseAdmin,
  getFirebaseIdTokenErrorCode,
  isFirebaseAuthEmulatorConfigured,
  isFirebaseAuthEnabled,
  isFirebaseProviderMutationConfirmed,
  normalizeFirebaseAuthTime,
  resolveServiceAccount,
  resolveFirebaseAdminMutationTimeoutMs,
  runFirebaseAdminMutation,
  verifyFirebaseIdToken,
};
