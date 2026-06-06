const { getFirebaseAdmin } = require("../src/firebaseAuth");

async function main() {
  const [uid, role = "patient", organizationId = "org_default_clinic"] = process.argv.slice(2);
  if (!uid) {
    throw new Error("Usage: node scripts/setFirebaseClaims.js <firebaseUid> [admin|platform_admin|workspace_admin|doctor|patient] [organizationId]");
  }
  if (!["admin", "platform_admin", "workspace_admin", "workspace_owner", "doctor", "patient", "nurse", "technician", "billing", "viewer"].includes(role)) {
    throw new Error("Role must be one of: admin, platform_admin, workspace_admin, workspace_owner, doctor, patient, nurse, technician, billing, viewer");
  }

  const admin = getFirebaseAdmin(process.env);
  if (!admin) {
    throw new Error("Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
  }

  const claims = {
    role: role === "platform_admin" ? "admin" : role,
    organizationId,
    smartHealth: {
      role: role === "platform_admin" ? "admin" : role,
      organizationId,
    },
  };

  await admin.auth().setCustomUserClaims(uid, claims);
  console.log(`Set Firebase custom claims for ${uid}: ${JSON.stringify(claims)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
