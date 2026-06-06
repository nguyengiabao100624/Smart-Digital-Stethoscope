const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { getFirebaseAdmin } = require("../src/firebaseAuth");

const rootDir = path.join(__dirname, "..");

function nowIso() {
  return new Date().toISOString();
}

function readString(value, fallback = "") {
  return String(value || fallback).trim();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function loadDb() {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(rootDir, "data");
  const dbPath = path.join(dataDir, "db.json");
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Cannot find JSON DB at ${dbPath}`);
  }
  return { dbPath, db: JSON.parse(fs.readFileSync(dbPath, "utf8")) };
}

function ensureList(db, key) {
  if (!Array.isArray(db[key])) db[key] = [];
  return db[key];
}

function upsertById(items, id, values) {
  let item = items.find((entry) => entry.id === id);
  if (!item) {
    item = { id, createdAt: nowIso() };
    items.unshift(item);
  }
  Object.assign(item, values, { updatedAt: nowIso() });
  return item;
}

async function getOrCreateFirebaseUser(admin, email, password, displayName) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, {
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
    return { user: await admin.auth().getUser(user.uid), created: false };
  } catch (err) {
    if (!err || err.code !== "auth/user-not-found") {
      throw err;
    }
    const user = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
    return { user, created: true };
  }
}

async function main() {
  const email = readString(process.env.WORKSPACE_ADMIN_EMAIL, "workspace.admin.demo@smarthealth.test").toLowerCase();
  const password = readString(process.env.WORKSPACE_ADMIN_PASSWORD) || `Shw@${crypto.randomBytes(6).toString("base64url")}1`;
  const organizationId = readString(process.env.WORKSPACE_ADMIN_ORG_ID, "org_workspace_demo_hospital");
  const organizationName = readString(process.env.WORKSPACE_ADMIN_ORG_NAME, "Bệnh viện Demo Workspace");
  const displayName = readString(process.env.WORKSPACE_ADMIN_NAME, "Admin Bệnh viện Demo");

  const admin = getFirebaseAdmin(process.env);
  if (!admin) {
    throw new Error("Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
  }

  const { dbPath, db } = loadDb();
  const users = ensureList(db, "users");
  const organizations = ensureList(db, "organizations");
  const memberships = ensureList(db, "memberships");
  const patients = ensureList(db, "patients");
  const devices = ensureList(db, "devices");

  const { user: firebaseUser, created } = await getOrCreateFirebaseUser(admin, email, password, displayName);
  const claims = {
    role: "workspace_admin",
    organizationId,
    smartHealth: {
      role: "workspace_admin",
      organizationId,
    },
  };
  await admin.auth().setCustomUserClaims(firebaseUser.uid, claims);

  const packageId = db.servicePackages?.find((item) => item.id === "pkg_clinic_basic")?.id || db.servicePackages?.[0]?.id || "";
  upsertById(organizations, organizationId, {
    name: organizationName,
    type: "hospital",
    workspaceType: "hospital",
    status: "active",
    packageId,
    subscriptionStatus: "active",
    billingCycle: "monthly",
    email,
  });

  const existingUser =
    users.find((item) => item.firebaseUid === firebaseUser.uid) ||
    users.find((item) => String(item.email || "").toLowerCase() === email);
  const backendUser = existingUser || { id: createId("usr"), createdAt: nowIso() };
  Object.assign(backendUser, {
    role: "workspace_admin",
    accountStatus: "active",
    name: displayName,
    title: "Admin bệnh viện",
    email,
    firebaseUid: firebaseUser.uid,
    organizationId,
    hospital: organizationName,
    verifiedEmail: true,
    updatedAt: nowIso(),
  });
  if (!existingUser) {
    users.unshift(backendUser);
  }

  const membershipId = `mbr_${backendUser.id}_${organizationId}`.replace(/[^a-zA-Z0-9_]/g, "_");
  upsertById(memberships, membershipId, {
    userId: backendUser.id,
    organizationId,
    role: "workspace_admin",
  });

  if (process.env.SEED_WORKSPACE_DEMO !== "false") {
    upsertById(users, "usr_workspace_demo_doctor", {
      role: "doctor",
      requestedRole: "doctor",
      roleRequestStatus: "approved",
      accountStatus: "active",
      name: "Bác sĩ Demo Workspace",
      email: "doctor.demo.workspace@smarthealth.test",
      organizationId,
      hospital: organizationName,
    });
    upsertById(patients, "pat_workspace_demo_001", {
      patientCode: "WS-DEMO-001",
      name: "Bệnh nhân Demo Workspace",
      age: 45,
      gender: "Nam",
      phone: "0900000001",
      organizationId,
      ownerUserId: backendUser.id,
      primaryDoctorId: "usr_workspace_demo_doctor",
      doctorName: "Bác sĩ Demo Workspace",
    });
    upsertById(devices, "dev_workspace_demo_001", {
      name: "Ống nghe Demo Workspace",
      type: "stethoscope",
      status: "available",
      connected: false,
      battery: 82,
      signal: -58,
      organizationId,
    });
  }

  db.updatedAt = nowIso();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  console.log(JSON.stringify({
    ok: true,
    firebase: { uid: firebaseUser.uid, email, created, claims },
    backend: { userId: backendUser.id, organizationId, organizationName, role: backendUser.role },
    login: { email, password },
    dbPath,
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
