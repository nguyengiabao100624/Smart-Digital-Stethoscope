const assert = require("node:assert/strict");
const { getFirebaseAdmin, isFirebaseAuthEnabled } = require("../src/firebaseAuth");

function readString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

async function main() {
  if (!isFirebaseAuthEnabled(process.env)) {
    throw new Error("FIREBASE_AUTH_ENABLED/Firebase Admin env is not configured");
  }

  const admin = getFirebaseAdmin(process.env);
  if (!admin) {
    throw new Error("Firebase Admin could not be initialized");
  }

  const suffix = Date.now();
  const email = `firebase-email-link-smoke-${suffix}@smarthealth.test`;
  const password = `Smoke-${suffix}!`;
  const continueUrl = readString(
    process.env.SMOKE_EMAIL_VERIFICATION_CONTINUE_URL || "https://shcare.web.app/xac-nhan-email",
  );
  const actionCodeSettings = { url: continueUrl };
  const linkDomain = readString(process.env.FIREBASE_AUTH_LINK_DOMAIN || process.env.FIREBASE_LINK_DOMAIN, 240);
  if (linkDomain) {
    actionCodeSettings.linkDomain = linkDomain;
  }

  let user;
  try {
    user = await admin.auth().createUser({
      email,
      password,
      displayName: "Firebase Email Link Smoke",
      emailVerified: false,
      disabled: false,
    });

    const link = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
    const parsed = new URL(link);
    assert.match(parsed.href, /mode=verifyEmail|oobCode=/);
    assert.ok(parsed.href.includes("oobCode="), "verification link should include an OOB code");
    console.log(
      `firebase email verification link smoke passed for ${continueUrl} (${parsed.hostname})`,
    );
  } finally {
    if (user && user.uid) {
      await admin.auth().deleteUser(user.uid).catch(() => undefined);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
