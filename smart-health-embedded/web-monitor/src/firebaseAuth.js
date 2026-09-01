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

function resolveFirebaseProjectId(env = process.env) {
  const configured = String(env.FIREBASE_PROJECT_ID || "").trim();
  if (configured) return configured;
  return String(resolveServiceAccount(env)?.project_id || "").trim();
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

function firebaseIdentityToolkitError(status, payload = {}) {
  const providerMessage = String(payload?.error?.message || payload?.message || "").trim();
  const error = new Error(
    providerMessage
      ? `Firebase Identity Toolkit rejected the mutation (${status}): ${providerMessage}`
      : `Firebase Identity Toolkit rejected the mutation (${status})`,
  );
  const normalized = providerMessage.toUpperCase();
  error.code = normalized.includes("USER_NOT_FOUND")
    ? "auth/user-not-found"
    : "FIREBASE_IDENTITY_MUTATION_FAILED";
  error.statusCode = Number(status) || 502;
  return error;
}

async function updateFirebaseUserViaRest(
  firebaseUid,
  payload = {},
  env = process.env,
  options = {},
) {
  const uid = String(firebaseUid || "").trim();
  if (!uid) {
    const error = new Error("Firebase UID is required");
    error.code = "FIREBASE_UID_REQUIRED";
    throw error;
  }
  const projectId = resolveFirebaseProjectId(env);
  if (!projectId) {
    const error = new Error("Firebase project ID is not configured");
    error.code = "FIREBASE_PROJECT_ID_REQUIRED";
    throw error;
  }

  const requestBody = {
    localId: uid,
    returnSecureToken: false,
  };
  if (Object.prototype.hasOwnProperty.call(payload, "password")) {
    const password = typeof payload.password === "string" ? payload.password : "";
    if (password.length < 8 || password.length > 200) {
      const error = new Error("Firebase password length is invalid");
      error.code = password.length < 8 ? "PASSWORD_TOO_SHORT" : "PASSWORD_TOO_LONG";
      throw error;
    }
    requestBody.password = password;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "disabled")) {
    requestBody.disableUser = Boolean(payload.disabled);
  }
  if (Object.keys(requestBody).length === 2) {
    return { updated: false, skipped: true, firebaseUid: uid };
  }

  const accessTokenProvider = options.accessTokenProvider || (async () => {
    const admin = options.admin || getFirebaseAdmin(env);
    const credential = admin?.app?.options?.credential;
    if (!credential || typeof credential.getAccessToken !== "function") {
      const error = new Error("Firebase service credential cannot issue an OAuth access token");
      error.code = "FIREBASE_CREDENTIAL_UNAVAILABLE";
      throw error;
    }
    return runFirebaseAdminMutation(
      () => credential.getAccessToken(),
      env,
      "Firebase OAuth access token",
    );
  });
  const accessTokenResult = await accessTokenProvider();
  const accessToken = String(
    typeof accessTokenResult === "string"
      ? accessTokenResult
      : accessTokenResult?.access_token || accessTokenResult?.accessToken || "",
  ).trim();
  if (!accessToken) {
    const error = new Error("Firebase OAuth access token is unavailable");
    error.code = "FIREBASE_ACCESS_TOKEN_UNAVAILABLE";
    throw error;
  }

  const fetchFn = options.fetch || globalThis.fetch;
  if (typeof fetchFn !== "function") {
    const error = new Error("Fetch is unavailable for Firebase Identity Toolkit");
    error.code = "FIREBASE_FETCH_UNAVAILABLE";
    throw error;
  }
  const controller = new AbortController();
  const timeoutMs = resolveFirebaseAdminMutationTimeoutMs(env);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchFn(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:update`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      },
    );
  } catch (cause) {
    const error = new Error(
      controller.signal.aborted
        ? `Firebase Identity Toolkit timed out after ${timeoutMs} ms`
        : "Firebase Identity Toolkit request failed",
      { cause },
    );
    error.code = controller.signal.aborted
      ? "FIREBASE_ADMIN_TIMEOUT"
      : "FIREBASE_IDENTITY_NETWORK_ERROR";
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let responsePayload = {};
  try {
    responsePayload = responseText ? JSON.parse(responseText) : {};
  } catch {
    responsePayload = {};
  }
  if (!response.ok) {
    throw firebaseIdentityToolkitError(response.status, responsePayload);
  }
  if (String(responsePayload.localId || "") !== uid) {
    const error = new Error("Firebase Identity Toolkit returned a different user identity");
    error.code = "FIREBASE_IDENTITY_MISMATCH";
    throw error;
  }
  return {
    updated: true,
    firebaseUid: uid,
    firebaseDisabled: Object.prototype.hasOwnProperty.call(requestBody, "disableUser")
      ? requestBody.disableUser
      : undefined,
    firebaseTokensRevoked: Object.prototype.hasOwnProperty.call(requestBody, "password"),
  };
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
  if (
    ["lock", "unlock"].includes(operation) &&
    result.skipped === true &&
    result.backendAuthoritative === true
  ) {
    return true;
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
  resolveFirebaseProjectId,
  resolveServiceAccount,
  resolveFirebaseAdminMutationTimeoutMs,
  runFirebaseAdminMutation,
  updateFirebaseUserViaRest,
  verifyFirebaseIdToken,
};
