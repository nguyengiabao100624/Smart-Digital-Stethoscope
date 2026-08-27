const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FIREBASE_PASSWORD_ENDPOINT,
  createFirebasePasswordProof,
} = require("../src/firebasePasswordVerifier");

const targetUser = {
  id: "user_backend",
  firebaseUid: "firebase_uid_password",
  email: "Patient@Example.test",
};

test("Firebase password proof binds exact secret, UID, email, and verified token", async () => {
  let requestUrl = "";
  let requestBody = null;
  let verifiedToken = "";
  const proof = await createFirebasePasswordProof({
    targetUser,
    authenticatedFirebaseUid: "firebase_uid_password",
    currentPassword: " ExactCurrent123 ",
    env: {
      FIREBASE_WEB_API_KEY: "firebase-web-api-key",
      FIREBASE_PASSWORD_PROOF_TTL_MS: "60000",
    },
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        async json() {
          return {
            localId: "firebase_uid_password",
            email: "patient@example.test",
            idToken: "fresh-firebase-id-token",
          };
        },
      };
    },
    verifyIdToken: async (token) => {
      verifiedToken = token;
      return {
        uid: "firebase_uid_password",
        email: "patient@example.test",
      };
    },
  });

  assert.equal(
    requestUrl,
    `${FIREBASE_PASSWORD_ENDPOINT}?key=firebase-web-api-key`,
  );
  assert.equal(requestUrl.includes("ExactCurrent123"), false);
  assert.deepEqual(requestBody, {
    email: "patient@example.test",
    password: " ExactCurrent123 ",
    returnSecureToken: true,
  });
  assert.equal(verifiedToken, "fresh-firebase-id-token");
  assert.equal(proof.consume(targetUser).uid, "firebase_uid_password");
  assert.throws(
    () => proof.consume(targetUser),
    (error) => error.code === "FIREBASE_PASSWORD_PROOF_ALREADY_USED",
  );
});

test("dummy current password fails before any mutation proof exists", async () => {
  await assert.rejects(
    createFirebasePasswordProof({
      targetUser,
      authenticatedFirebaseUid: "firebase_uid_password",
      currentPassword: "DefinitelyWrong123",
      env: { FIREBASE_WEB_API_KEY: "firebase-web-api-key" },
      fetchImpl: async () => ({
        ok: false,
        async json() {
          return { error: { message: "INVALID_LOGIN_CREDENTIALS" } };
        },
      }),
      verifyIdToken: async () => {
        throw new Error("must not verify a failed sign-in");
      },
    }),
    (error) =>
      error.code === "PASSWORD_CURRENT_INVALID" && error.statusCode === 400,
  );
});

test("Firebase password proof fails closed without verifier configuration", async () => {
  await assert.rejects(
    createFirebasePasswordProof({
      targetUser,
      authenticatedFirebaseUid: "firebase_uid_password",
      currentPassword: " ExactCurrent123 ",
      env: {},
      fetchImpl: async () => {
        throw new Error("must not be called");
      },
      verifyIdToken: async () => targetUser,
    }),
    (error) =>
      error.code === "FIREBASE_PASSWORD_VERIFIER_UNAVAILABLE" &&
      error.statusCode === 503,
  );
});

test("Firebase password proof rejects cross-account UID and token bindings", async () => {
  await assert.rejects(
    createFirebasePasswordProof({
      targetUser,
      authenticatedFirebaseUid: "firebase_uid_password",
      currentPassword: " ExactCurrent123 ",
      env: { FIREBASE_WEB_API_KEY: "firebase-web-api-key" },
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            localId: "another_firebase_uid",
            email: "patient@example.test",
            idToken: "other-account-token",
          };
        },
      }),
      verifyIdToken: async () => ({
        uid: "another_firebase_uid",
        email: "patient@example.test",
      }),
    }),
    (error) =>
      error.code === "FIREBASE_PASSWORD_PROOF_ACCOUNT_MISMATCH" &&
      error.statusCode === 403,
  );
});

test("Firebase password proof rejects a stale or cross-account bearer before provider sign-in", async () => {
  let providerCalls = 0;
  const attempt = (authenticatedFirebaseUid) =>
    createFirebasePasswordProof({
      targetUser,
      authenticatedFirebaseUid,
      currentPassword: " ExactCurrent123 ",
      env: { FIREBASE_WEB_API_KEY: "firebase-web-api-key" },
      fetchImpl: async () => {
        providerCalls += 1;
        throw new Error("provider must not receive a cross-account proof");
      },
      verifyIdToken: async () => targetUser,
    });

  await assert.rejects(
    attempt("another_firebase_uid"),
    (error) =>
      error.code === "FIREBASE_PASSWORD_PROOF_ACCOUNT_MISMATCH" &&
      error.statusCode === 403,
  );
  await assert.rejects(
    attempt(""),
    (error) =>
      error.code === "FIREBASE_PASSWORD_PROOF_ACCOUNT_MISMATCH" &&
      error.statusCode === 403,
  );
  assert.equal(providerCalls, 0);
});
