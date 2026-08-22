const crypto = require("node:crypto");

const FIREBASE_PASSWORD_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
const DEFAULT_PROOF_TTL_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;

function verifierError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function boundedMilliseconds(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function readProviderErrorCode(payload) {
  return String(payload?.error?.message || "")
    .split(/\s*:\s*/, 1)[0]
    .trim()
    .slice(0, 120);
}

function isDefinitiveCredentialFailure(code) {
  return new Set([
    "EMAIL_NOT_FOUND",
    "INVALID_EMAIL",
    "INVALID_LOGIN_CREDENTIALS",
    "INVALID_PASSWORD",
    "USER_DISABLED",
  ]).has(code);
}

async function readJsonResponse(response) {
  let raw = "";
  try {
    if (response?.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        totalBytes += chunk.length;
        if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error("Firebase password verifier response is too large");
        }
        chunks.push(chunk);
      }
      raw = Buffer.concat(chunks, totalBytes).toString("utf8");
    } else if (typeof response?.text === "function") {
      raw = await response.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_PROVIDER_RESPONSE_BYTES) {
        throw new Error("Firebase password verifier response is too large");
      }
    } else if (typeof response?.json === "function") {
      return await response.json();
    }
    return raw ? JSON.parse(raw) : {};
  } catch {
    if (
      raw &&
      Buffer.byteLength(raw, "utf8") <= MAX_PROVIDER_RESPONSE_BYTES
    ) {
      return {};
    }
    throw new Error("Firebase password verifier response is invalid");
  }
}

async function createFirebasePasswordProof(input = {}) {
  const targetUser = input.targetUser || {};
  const uid = String(targetUser.firebaseUid || "");
  const authenticatedFirebaseUid = String(
    input.authenticatedFirebaseUid || "",
  );
  const email = normalizeEmail(targetUser.email);
  const currentPassword = input.currentPassword;
  const env = input.env || process.env;
  const apiKey = String(env.FIREBASE_WEB_API_KEY || "").trim();
  const fetchImpl = input.fetchImpl || global.fetch;
  const verifyIdToken = input.verifyIdToken;
  if (!uid || !email) {
    throw verifierError(
      409,
      "FIREBASE_PASSWORD_PROOF_IDENTITY_INCOMPLETE",
      "The Firebase account must have a canonical UID and email",
    );
  }
  if (!authenticatedFirebaseUid || authenticatedFirebaseUid !== uid) {
    throw verifierError(
      403,
      "FIREBASE_PASSWORD_PROOF_ACCOUNT_MISMATCH",
      "Firebase password proof belongs to another account",
    );
  }
  if (
    typeof currentPassword !== "string" ||
    currentPassword.length === 0 ||
    currentPassword.length > 200
  ) {
    throw verifierError(
      400,
      "PASSWORD_CURRENT_INVALID",
      "Current password is incorrect",
    );
  }
  if (!apiKey || typeof fetchImpl !== "function" || typeof verifyIdToken !== "function") {
    throw verifierError(
      503,
      "FIREBASE_PASSWORD_VERIFIER_UNAVAILABLE",
      "Firebase current-password verification is unavailable",
    );
  }

  const timeoutMs = boundedMilliseconds(
    env.FIREBASE_PASSWORD_VERIFY_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    1_000,
    15_000,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  let response;
  let payload;
  try {
    response = await fetchImpl(
      `${FIREBASE_PASSWORD_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: currentPassword,
          returnSecureToken: true,
        }),
        signal: controller.signal,
      },
    );
    payload = await readJsonResponse(response);
  } catch {
    throw verifierError(
      503,
      "FIREBASE_PASSWORD_VERIFIER_UNAVAILABLE",
      "Firebase current-password verification is unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const providerCode = readProviderErrorCode(payload);
    if (isDefinitiveCredentialFailure(providerCode)) {
      throw verifierError(
        400,
        "PASSWORD_CURRENT_INVALID",
        "Current password is incorrect",
      );
    }
    throw verifierError(
      503,
      "FIREBASE_PASSWORD_VERIFIER_UNAVAILABLE",
      "Firebase current-password verification is unavailable",
    );
  }

  const returnedUid = String(payload.localId || "");
  const returnedEmail = normalizeEmail(payload.email);
  const idToken = String(payload.idToken || "");
  if (!returnedUid || !returnedEmail || !idToken) {
    throw verifierError(
      503,
      "FIREBASE_PASSWORD_VERIFIER_INVALID_RESPONSE",
      "Firebase current-password verification returned an invalid response",
    );
  }
  if (returnedUid !== uid || returnedEmail !== email) {
    throw verifierError(
      403,
      "FIREBASE_PASSWORD_PROOF_ACCOUNT_MISMATCH",
      "Firebase password proof belongs to another account",
    );
  }

  let decodedToken;
  try {
    decodedToken = await verifyIdToken(idToken);
  } catch {
    throw verifierError(
      503,
      "FIREBASE_PASSWORD_VERIFIER_INVALID_TOKEN",
      "Firebase current-password verification could not be confirmed",
    );
  }
  const tokenUid = String(decodedToken?.uid || decodedToken?.sub || "");
  const tokenEmail = normalizeEmail(decodedToken?.email);
  if (tokenUid !== uid || (tokenEmail && tokenEmail !== email)) {
    throw verifierError(
      403,
      "FIREBASE_PASSWORD_PROOF_ACCOUNT_MISMATCH",
      "Firebase password proof belongs to another account",
    );
  }

  const verifiedAt = Date.now();
  const ttlMs = boundedMilliseconds(
    env.FIREBASE_PASSWORD_PROOF_TTL_MS,
    DEFAULT_PROOF_TTL_MS,
    5_000,
    120_000,
  );
  let consumed = false;
  const binding = crypto
    .createHash("sha256")
    .update(`${uid}\u0000${email}`, "utf8")
    .digest("base64url");

  return Object.freeze({
    consume(expectedUser = {}, now = Date.now()) {
      const expectedUid = String(expectedUser.firebaseUid || "");
      const expectedEmail = normalizeEmail(expectedUser.email);
      const expectedBinding = crypto
        .createHash("sha256")
        .update(`${expectedUid}\u0000${expectedEmail}`, "utf8")
        .digest("base64url");
      const left = Buffer.from(binding, "utf8");
      const right = Buffer.from(expectedBinding, "utf8");
      const bindingMatches =
        left.length === right.length && crypto.timingSafeEqual(left, right);
      left.fill(0);
      right.fill(0);
      if (!bindingMatches) {
        throw verifierError(
          403,
          "FIREBASE_PASSWORD_PROOF_ACCOUNT_MISMATCH",
          "Firebase password proof belongs to another account",
        );
      }
      if (consumed) {
        throw verifierError(
          409,
          "FIREBASE_PASSWORD_PROOF_ALREADY_USED",
          "Firebase password proof was already used",
        );
      }
      if (!Number.isFinite(now) || now < verifiedAt || now - verifiedAt > ttlMs) {
        throw verifierError(
          401,
          "FIREBASE_PASSWORD_PROOF_EXPIRED",
          "Firebase password proof has expired",
        );
      }
      consumed = true;
      return { uid, email, verifiedAt };
    },
  });
}

module.exports = {
  FIREBASE_PASSWORD_ENDPOINT,
  createFirebasePasswordProof,
};
