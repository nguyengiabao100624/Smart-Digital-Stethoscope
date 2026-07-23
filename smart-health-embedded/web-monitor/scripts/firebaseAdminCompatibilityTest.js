const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getFirebaseAdmin,
  isFirebaseProviderMutationConfirmed,
  normalizeFirebaseAuthTime,
} = require("../src/firebaseAuth");

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

test("backend-only identities can complete when no external provider owns the account", () => {
  assert.equal(
    isFirebaseProviderMutationConfirmed({ id: "usr_local", firebaseUid: "" }, { skipped: true }),
    true,
  );
});
