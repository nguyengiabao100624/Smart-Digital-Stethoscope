let firebaseApp = null;
let firebaseAdmin = null;

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

function getFirebaseAdmin(env = process.env) {
  if (!isFirebaseAuthEnabled(env)) {
    return null;
  }

  if (firebaseApp && firebaseAdmin) {
    return firebaseAdmin;
  }

  firebaseAdmin = require("firebase-admin");

  const serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const options = {};
  if (env.FIREBASE_PROJECT_ID) {
    options.projectId = env.FIREBASE_PROJECT_ID;
  }
  if (serviceAccount) {
    options.credential = firebaseAdmin.credential.cert(serviceAccount);
  } else {
    options.credential = firebaseAdmin.credential.applicationDefault();
  }

  firebaseApp = firebaseAdmin.apps.length ? firebaseAdmin.app() : firebaseAdmin.initializeApp(options);
  return firebaseAdmin;
}

async function verifyFirebaseIdToken(idToken, env = process.env) {
  const admin = getFirebaseAdmin(env);
  if (!admin) {
    return null;
  }
  return admin.auth().verifyIdToken(idToken, true);
}

module.exports = {
  getFirebaseAdmin,
  isFirebaseAuthEnabled,
  verifyFirebaseIdToken,
};
