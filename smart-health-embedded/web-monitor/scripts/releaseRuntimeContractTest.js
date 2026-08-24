const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");

test("production container uses the migration-aware canonical start command", () => {
  const dockerfile = fs.readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  const startScript = fs.readFileSync(path.join(__dirname, "start.js"), "utf8");

  assert.match(
    dockerfile,
    /^CMD\s+\["npm",\s*"start"\]\s*$/m,
    "Docker must enter through npm start so PostgreSQL migrations cannot be bypassed",
  );
  assert.doesNotMatch(
    dockerfile,
    /^CMD\s+\["node",\s*"server\.js"\]\s*$/m,
    "Docker must not launch server.js directly",
  );
  assert.equal(packageJson.scripts.start, "node scripts/start.js");

  const migrationCall = startScript.indexOf('path.join(__dirname, "migrate.js")');
  const serverStart = startScript.indexOf('require("../server")');
  assert.ok(migrationCall >= 0, "canonical start must invoke the migration runner");
  assert.ok(serverStart > migrationCall, "the server must start only after migrations finish");
  assert.match(
    startScript,
    /if \(migration\.status !== 0\)[\s\S]*process\.exit\(migration\.status \|\| 1\)/,
    "a failed migration must terminate startup",
  );
});

test("integrated demo keeps Firebase Auth and physical-device HIL local and explicit", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  const demoSource = fs.readFileSync(
    path.join(__dirname, "startShcareDemo.mjs"),
    "utf8",
  );
  const deviceHilSource = fs.readFileSync(
    path.join(__dirname, "startDeviceHil.mjs"),
    "utf8",
  );
  const serverSource = fs.readFileSync(path.join(projectRoot, "server.js"), "utf8");
  const emulatorConfig = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "firebase.demo.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["demo:integrated"],
    "node scripts/startShcareIntegratedDemo.mjs",
  );
  assert.equal(emulatorConfig.emulators.auth.host, "0.0.0.0");
  assert.equal(emulatorConfig.emulators.auth.port, 9099);
  assert.equal(emulatorConfig.emulators.ui.enabled, false);
  assert.match(demoSource, /createFactoryEnrolledDeviceFixture/);
  assert.match(demoSource, /FIREBASE_AUTH_EMULATOR_HOST/);
  assert.match(demoSource, /Authorization: "Bearer owner"/);
  assert.match(demoSource, /AbortSignal\.timeout\(5_000\)/);
  assert.match(demoSource, /claims\.email_verified !== true/);
  assert.match(demoSource, /proveFirebaseBackendExchange/);
  assert.match(demoSource, /body\?\.user\?\.firebaseUid !== "firebase_patient_demo"/);
  assert.match(demoSource, /spawnSync\("taskkill\.exe", \["\/PID"/);
  assert.match(demoSource, /SHCARE_HIL_EXTERNAL_BACKEND/);
  assert.match(deviceHilSource, /useExternalBackend/);
  assert.match(
    serverSource,
    /id: "usr_patient_default",[\s\S]*?role: "patient",[\s\S]*?accountStatus: "active",/,
    "the integrated patient identity must be active before Android accepts the backend session",
  );
  const publicUserSource = serverSource
    .split("function publicUser(user) {")[1]
    ?.split("function publicDoctorRoleRequest(user) {")[0];
  assert.ok(publicUserSource, "publicUser must remain the canonical user projector");
  assert.match(
    publicUserSource,
    /accountStatus: user\.accountStatus \|\| "active"/,
    "Firebase authentication receipts must include an explicit account lifecycle",
  );
  assert.match(
    publicUserSource,
    /deletedAt: user\.deletedAt \|\| null/,
    "Firebase authentication receipts must explicitly state that the account is not deleted",
  );
});
