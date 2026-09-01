const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  getFirebaseIdTokenErrorCode,
  getFirebaseAdmin,
  isFirebaseProviderMutationConfirmed,
  isFirebaseAuthEmulatorConfigured,
  normalizeFirebaseAuthTime,
  resolveFirebaseAdminMutationTimeoutMs,
  resolveServiceAccount,
  runFirebaseAdminMutation,
  verifyFirebaseIdToken,
} = require("../src/firebaseAuth");

test("Firebase Admin mutations are bounded so a provider stall cannot pin the API instance", async () => {
  assert.equal(resolveFirebaseAdminMutationTimeoutMs({ FIREBASE_ADMIN_MUTATION_TIMEOUT_MS: "1" }), 100);
  assert.equal(resolveFirebaseAdminMutationTimeoutMs({ FIREBASE_ADMIN_MUTATION_TIMEOUT_MS: "999999" }), 30_000);
  await assert.rejects(
    runFirebaseAdminMutation(
      () => new Promise(() => {}),
      { FIREBASE_ADMIN_MUTATION_TIMEOUT_MS: "100" },
      "test mutation",
    ),
    (error) => error?.code === "FIREBASE_ADMIN_TIMEOUT",
  );
  assert.equal(
    await runFirebaseAdminMutation(
      async () => "confirmed",
      { FIREBASE_ADMIN_MUTATION_TIMEOUT_MS: "100" },
    ),
    "confirmed",
  );
});

test("Firebase numeric auth_time becomes a stable canonical session binding", () => {
  assert.equal(normalizeFirebaseAuthTime({ auth_time: 1783987200 }), "1783987200");
  assert.equal(normalizeFirebaseAuthTime({ auth_time: "1783987200" }), "1783987200");
  assert.equal(normalizeFirebaseAuthTime({ auth_time: 0 }), "");
  assert.equal(normalizeFirebaseAuthTime({ iat: 1783987200 }), "");
});

test("Firebase Admin v14 modular adapter exposes the auth and messaging services used by Shcare", () => {
  const services = getFirebaseAdmin({
    FIREBASE_AUTH_ENABLED: "true",
    FIREBASE_PROJECT_ID: "shcare-local-contract",
  });

  assert.equal(typeof services.auth, "function");
  assert.equal(typeof services.auth().verifyIdToken, "function");
  assert.equal(typeof services.auth().listUsers, "function");
  assert.equal(typeof services.messaging, "function");
  assert.equal(typeof services.messaging().send, "function");
});

test("Firebase Auth emulator is explicit and never confused with a production credential", () => {
  assert.equal(
    isFirebaseAuthEmulatorConfigured({
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    }),
    true,
  );
  assert.equal(
    isFirebaseAuthEmulatorConfigured({
      FIREBASE_AUTH_EMULATOR_HOST: "http://127.0.0.1:9099",
    }),
    false,
  );
  assert.equal(isFirebaseAuthEmulatorConfigured({}), false);
});

test("Google application credentials use the local service-account key instead of remote IAM signing", () => {
  const tempDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "shcare-firebase-cert-"));
  const credentialPath = path.join(tempDir, "service-account.json");
  const serviceAccount = {
    type: "service_account",
    project_id: "shcare-local-contract",
    private_key: "line-one\\nline-two",
    client_email: "firebase-admin@shcare-local-contract.iam.gserviceaccount.com",
  };
  fs.writeFileSync(credentialPath, JSON.stringify(serviceAccount), "utf8");
  try {
    assert.deepEqual(
      resolveServiceAccount({ GOOGLE_APPLICATION_CREDENTIALS: credentialPath }),
      { ...serviceAccount, private_key: "line-one\nline-two" },
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("Firebase token verification always checks revocation", async () => {
  const checks = [];
  const admin = {
    auth: () => ({
      verifyIdToken: async (token, checkRevoked) => {
        checks.push({ token, checkRevoked });
        return { uid: "firebase-user", auth_time: 1783987200 };
      },
    }),
  };

  await verifyFirebaseIdToken("regular-token", {}, { admin });

  assert.deepEqual(checks, [
    { token: "regular-token", checkRevoked: true },
  ]);
});

test("Firebase token failures expose stable recovery codes without weakening verification", () => {
  assert.equal(
    getFirebaseIdTokenErrorCode({ code: "auth/id-token-revoked" }),
    "FIREBASE_ID_TOKEN_REVOKED",
  );
  assert.equal(
    getFirebaseIdTokenErrorCode({ code: "auth/id-token-expired" }),
    "FIREBASE_ID_TOKEN_EXPIRED",
  );
  assert.equal(
    getFirebaseIdTokenErrorCode({ code: "auth/argument-error" }),
    "INVALID_FIREBASE_TOKEN",
  );
  assert.equal(getFirebaseIdTokenErrorCode({}), "INVALID_FIREBASE_TOKEN");
});

test("locked Firebase accounts are denied before an auth session can be created or touched", () => {
  const serverSource = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8",
  );
  const firebaseAuthStart = serverSource.indexOf(
    'req.authSource = "firebase";',
  );
  const firebaseAuthEnd = serverSource.indexOf(
    "await prepareTwoFactorAccess(req, req.authUser);",
    firebaseAuthStart,
  );
  assert.ok(firebaseAuthStart >= 0 && firebaseAuthEnd > firebaseAuthStart);
  const firebaseAuthFlow = serverSource.slice(firebaseAuthStart, firebaseAuthEnd);
  const activeCheck = firebaseAuthFlow.indexOf(
    "assertUserAccountActive(req.authUser);",
  );
  const sessionWrite = firebaseAuthFlow.indexOf(
    "req.authSession = await rememberAuthSession",
  );
  assert.ok(activeCheck >= 0, "Firebase authentication must check canonical account state");
  assert.ok(sessionWrite > activeCheck, "the active-account check must precede every session write");
});

test("profile-only Admin edits persist to the Shcare authority without a Firebase displayName dependency", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const adminRouteStart = serverSource.indexOf(
    'segments[2] === "admin-users" && segments.length === 4 && method === "PATCH"',
  );
  const profileStart = serverSource.indexOf(
    'if (Object.prototype.hasOwnProperty.call(payload, "name"))',
    adminRouteStart,
  );
  const persistStart = serverSource.indexOf("await persistUserRecord(targetUser);", profileStart);
  assert.ok(adminRouteStart >= 0 && profileStart > adminRouteStart && persistStart > profileStart);
  const profileMutation = serverSource.slice(profileStart, persistStart);
  assert.doesNotMatch(profileMutation, /updateFirebase|firebaseAdminApp/);
});

test("account locks rely on canonical session revocation and Firebase disabled state without a second provider revoke", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  const adminRouteStart = serverSource.indexOf(
    'segments[2] === "admin-users" && segments.length === 4 && method === "PATCH"',
  );
  const adminRouteEnd = serverSource.indexOf(
    'segments[4] === "reset-password" && method === "POST"',
    adminRouteStart,
  );
  const adminRoute = serverSource.slice(adminRouteStart, adminRouteEnd);
  assert.match(adminRoute, /disabled:\s*nextStatus === "locked"/);
  assert.doesNotMatch(adminRoute, /revokeRefreshTokens/);

  const doctorLockStart = serverSource.indexOf(
    'segments[4] === "lock" && method === "PATCH"',
  );
  const doctorUnlockStart = serverSource.indexOf(
    'segments[4] === "unlock" && method === "PATCH"',
    doctorLockStart,
  );
  const doctorLockRoute = serverSource.slice(doctorLockStart, doctorUnlockStart);
  assert.match(doctorLockRoute, /disabled:\s*true/);
  assert.doesNotMatch(doctorLockRoute, /revokeRefreshTokens/);
});

test("Firebase password changes use one provider mutation and rely on automatic token revocation", () => {
  const serverSource = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8",
  );
  assert.match(
    serverSource,
    /verifyFirebaseIdToken\(token,\s*process\.env\)[\s\S]+?catch\s*\(err\)[\s\S]+?getFirebaseIdTokenErrorCode\(err\)/,
  );
  const selfServiceStart = serverSource.indexOf(
    'segments[2] === "password" && method === "POST"',
  );
  const selfServiceEnd = serverSource.indexOf(
    'segments[2] === "2fa" && method === "POST"',
    selfServiceStart,
  );
  const selfServiceRoute = serverSource.slice(
    selfServiceStart,
    selfServiceEnd,
  );
  assert.ok(selfServiceStart >= 0 && selfServiceEnd > selfServiceStart);
  assert.match(selfServiceRoute, /updateFirebaseLinkedAccount[\s\S]+password:\s*nextPassword/);
  assert.doesNotMatch(selfServiceRoute, /revokeRefreshTokens/);
  const sagaStart = selfServiceRoute.indexOf(
    "const saga = await runIdentityProviderSaga",
  );
  assert.ok(sagaStart > 0);
  assert.doesNotMatch(
    selfServiceRoute.slice(0, sagaStart),
    /FIREBASE_RECENT_LOGIN_REQUIRED|assertDemoAuthAllowed/,
    "completed receipts must be discovered before provider-specific mutation gates",
  );
  assert.match(
    selfServiceRoute.slice(sagaStart),
    /beforeBegin:[\s\S]+authenticatedFirebaseUid[\s\S]+createFirebasePasswordProof\(\{[\s\S]+authenticatedFirebaseUid[\s\S]+firebasePasswordProof\.consume\(canonicalUser\)/,
  );
  assert.match(
    serverSource,
    /isFirebaseProviderMutationConfirmed\(targetUser,\s*result,\s*operation\)/,
    "provider confirmation must receive the operation so password changes cannot reuse delete semantics",
  );

  const adminStart = serverSource.indexOf(
    'segments[4] === "reset-password" && method === "POST"',
  );
  const adminEnd = serverSource.indexOf(
    '["lock", "unlock"].includes(segments[4])',
    adminStart,
  );
  const adminRoute = serverSource.slice(adminStart, adminEnd);
  assert.ok(adminStart >= 0 && adminEnd > adminStart);
  assert.match(adminRoute, /\.auth\(\)\.updateUser\([^,]+,\s*\{\s*password:/);
  assert.doesNotMatch(adminRoute, /revokeRefreshTokens/);
});

test("linked Firebase identities never treat a skipped provider mutation as confirmed", () => {
  const linkedUser = { id: "usr_linked", firebaseUid: "firebase-linked" };

  assert.equal(
    isFirebaseProviderMutationConfirmed(linkedUser, { skipped: true, updated: false }),
    false,
  );
  assert.equal(
    isFirebaseProviderMutationConfirmed(linkedUser, { updated: true }),
    true,
  );
  assert.equal(
    isFirebaseProviderMutationConfirmed(linkedUser, { firebaseDeleted: true }),
    true,
  );
  assert.equal(
    isFirebaseProviderMutationConfirmed(linkedUser, { firebaseAlreadyMissing: true }),
    true,
  );
  assert.equal(
    isFirebaseProviderMutationConfirmed(linkedUser, { providerSucceeded: false, updated: true }),
    false,
  );
});

test("password changes require a confirmed provider update and never accept a concurrently missing Firebase user", () => {
  const linkedUser = { id: "usr_linked", firebaseUid: "firebase-linked" };

  assert.equal(
    isFirebaseProviderMutationConfirmed(
      linkedUser,
      { updated: false, firebaseAlreadyMissing: true },
      "reset_password",
    ),
    false,
  );
  assert.equal(
    isFirebaseProviderMutationConfirmed(
      linkedUser,
      { updated: true },
      "reset_password",
    ),
    true,
  );
});

test("backend-only identities can complete when no external provider owns the account", () => {
  assert.equal(
    isFirebaseProviderMutationConfirmed({ id: "usr_local", firebaseUid: "" }, { skipped: true }),
    true,
  );
});
