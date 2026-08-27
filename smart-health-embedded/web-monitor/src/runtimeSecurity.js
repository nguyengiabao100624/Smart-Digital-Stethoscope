"use strict";

const { isFirebaseAuthEnabled } = require("./firebaseAuth");
const { isPhiEncryptionConfigured } = require("./cryptoPhi");

function readString(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readBool(value) {
  return readString(value).toLowerCase() === "true";
}

function resolveAuthMode(env = process.env) {
  const configured = readString(env.AUTH_MODE).toLowerCase();
  if (configured) return configured;
  return readString(env.NODE_ENV).toLowerCase() === "production" ? "production" : "demo";
}

function hasFirebaseAdminCredential(env = process.env) {
  return Boolean(
    readString(env.FIREBASE_PROJECT_ID) &&
      (readString(env.FIREBASE_SERVICE_ACCOUNT_JSON) ||
        readString(env.GOOGLE_APPLICATION_CREDENTIALS)),
  );
}

function getRuntimeSecurityViolations(env = process.env) {
  const nodeEnv = readString(env.NODE_ENV).toLowerCase();
  const authMode = resolveAuthMode(env);
  const violations = [];

  if (!["demo", "production"].includes(authMode)) {
    violations.push("AUTH_MODE must be demo or production");
  }
  if (nodeEnv !== "production") return violations;

  if (authMode !== "production") {
    violations.push("production runtime requires AUTH_MODE=production");
  }
  if (readBool(env.ALLOW_DEMO_AUTH)) {
    violations.push("production runtime requires ALLOW_DEMO_AUTH=false");
  }
  if (!isFirebaseAuthEnabled(env) || !hasFirebaseAdminCredential(env)) {
    violations.push(
      "production runtime requires Firebase Admin project and service-account credentials",
    );
  }
  if (!isPhiEncryptionConfigured(env)) {
    violations.push("production runtime requires PHI_ENCRYPTION_KEY with at least 32 characters");
  }
  return violations;
}

function assertRuntimeSecurity(env = process.env) {
  const violations = getRuntimeSecurityViolations(env);
  if (violations.length === 0) return;
  const error = new Error(`Unsafe runtime configuration: ${violations.join("; ")}`);
  error.code = "PRODUCTION_AUTH_CONFIGURATION_INVALID";
  error.violations = violations;
  throw error;
}

module.exports = {
  assertRuntimeSecurity,
  getRuntimeSecurityViolations,
  hasFirebaseAdminCredential,
  resolveAuthMode,
};
