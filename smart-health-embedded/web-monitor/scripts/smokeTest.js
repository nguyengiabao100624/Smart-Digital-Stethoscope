const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) {
        return response.json();
      }
    } catch {}
    await delay(250);
  }
  throw new Error(`Backend did not become healthy on port ${port}`);
}

async function withServer(env, fn) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(env.PORT);
    return await fn();
  } finally {
    child.kill("SIGTERM");
    await delay(300);
    if (!child.killed && stderr) {
      console.error(stderr);
    }
  }
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { response, data };
}

async function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function testDemoAuth() {
  const port = "3410";
  await withServer(
    {
      PORT: port,
      AUDIO_UDP_PORT: "3411",
      DATA_BACKEND: "json",
      DATA_DIR: ".test-data/smoke-demo",
      AUTH_MODE: "demo",
      FIREBASE_AUTH_ENABLED: "false",
    },
    async () => {
      const response = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        login: "bacsytuan@benhvien.com",
        password: "12345678",
        role: "doctor",
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.user.role, "doctor");
      assert.ok(payload.token);
    }
  );
}

async function testProductionLocksDemoAuth() {
  const port = "3412";
  await withServer(
    {
      PORT: port,
      AUDIO_UDP_PORT: "3413",
      DATA_BACKEND: "json",
      DATA_DIR: ".test-data/smoke-prod",
      AUTH_MODE: "production",
      ALLOW_DEMO_AUTH: "false",
      FIREBASE_AUTH_ENABLED: "false",
    },
    async () => {
      const response = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        login: "bacsytuan@benhvien.com",
        password: "12345678",
      });
      assert.equal(response.status, 403);
    }
  );
}

async function testDoctorRequestNeedsInfoResubmit() {
  const port = "3414";
  const suffix = Date.now();
  await withServer(
    {
      PORT: port,
      AUDIO_UDP_PORT: "3415",
      DATA_BACKEND: "json",
      DATA_DIR: `.test-data/smoke-doctor-request-${suffix}`,
      AUTH_MODE: "demo",
      FIREBASE_AUTH_ENABLED: "false",
    },
    async () => {
      const adminResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "admin",
        name: "Lifecycle Admin",
        email: `admin-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(adminResponse.status, 201);
      const admin = await adminResponse.json();
      const adminHeaders = { Authorization: `Bearer ${admin.token}` };

      const doctorResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "patient",
        name: "Lifecycle Doctor",
        email: `doctor-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(doctorResponse.status, 201);
      const doctor = await doctorResponse.json();
      const doctorHeaders = { Authorization: `Bearer ${doctor.token}` };

      const firstSubmitResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/auth/role-request`,
        {
          requestedRole: "doctor",
          name: "Lifecycle Doctor",
          phone: "0900000000",
          license: "CCHN-LIFE-001",
          organizationId: "org_default_clinic",
          hospital: "Smart Health Clinic",
          department: "Tim mach",
          reason: "Initial smoke request",
        },
        doctorHeaders,
      );
      assert.equal(firstSubmitResponse.status, 200);
      const firstSubmit = await firstSubmitResponse.json();
      assert.equal(firstSubmit.user.roleRequestStatus, "pending");
      assert.equal(firstSubmit.user.registrationReason, "Initial smoke request");

      const requestInfoResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctor-requests/${encodeURIComponent(doctor.user.id)}/request-info`,
        {
          message: "Vui long bo sung CCHN va chuyen khoa.",
          requiredFields: ["license", "specialty"],
        },
        adminHeaders,
      );
      assert.equal(requestInfoResponse.status, 200);
      const requestInfo = await requestInfoResponse.json();
      assert.equal(requestInfo.request.status, "needs_info");
      assert.equal(requestInfo.request.registrationReason, "Initial smoke request");

      const needsInfoBefore = await getJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctor-requests?status=needs_info`,
        adminHeaders,
      );
      assert.equal(needsInfoBefore.response.status, 200);
      assert.ok(needsInfoBefore.data.requests.some((request) => request.id === doctor.user.id));

      const resubmitResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/auth/role-request`,
        {
          requestedRole: "doctor",
          name: "Lifecycle Doctor Updated",
          phone: "0911111111",
          license: "CCHN-LIFE-UPDATED",
          organizationId: "org_default_clinic",
          hospital: "Smart Health Clinic",
          department: "Tim mach",
          reason: "Updated smoke request",
        },
        doctorHeaders,
      );
      assert.equal(resubmitResponse.status, 200);
      const resubmit = await resubmitResponse.json();
      assert.equal(resubmit.user.roleRequestStatus, "pending");
      assert.deepEqual(resubmit.user.roleInfoRequiredFields, []);
      assert.equal(resubmit.user.roleInfoRequestMessage, "");
      assert.equal(resubmit.user.registrationReason, "Updated smoke request");

      const polled = await getJson(`http://127.0.0.1:${port}/api/v1/auth/firebase`, doctorHeaders);
      assert.equal(polled.response.status, 200);
      assert.equal(polled.data.user.roleRequestStatus, "pending");
      assert.deepEqual(polled.data.user.roleInfoRequiredFields, []);
      assert.equal(polled.data.user.registrationReason, "Updated smoke request");

      const needsInfoAfter = await getJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctor-requests?status=needs_info`,
        adminHeaders,
      );
      assert.equal(needsInfoAfter.response.status, 200);
      assert.equal(needsInfoAfter.data.requests.some((request) => request.id === doctor.user.id), false);

      const pendingAfter = await getJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctor-requests?status=pending`,
        adminHeaders,
      );
      assert.equal(pendingAfter.response.status, 200);
      assert.ok(pendingAfter.data.requests.some((request) => request.id === doctor.user.id));
      assert.equal(
        pendingAfter.data.requests.find((request) => request.id === doctor.user.id).registrationReason,
        "Updated smoke request",
      );
    }
  );
}

async function main() {
  await testDemoAuth();
  await testProductionLocksDemoAuth();
  await testDoctorRequestNeedsInfoResubmit();
  console.log("backend smoke tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
