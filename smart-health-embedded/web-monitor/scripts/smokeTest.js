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

async function patchJson(url, headers = {}) {
  return fetch(url, {
    method: "PATCH",
    headers,
  });
}

async function patchJsonBody(url, body, headers = {}) {
  return fetch(url, {
    method: "PATCH",
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

async function testWorkspaceOwnerApprovalLifecycle() {
  const port = "3416";
  const suffix = Date.now();
  await withServer(
    {
      PORT: port,
      AUDIO_UDP_PORT: "3417",
      DATA_BACKEND: "json",
      DATA_DIR: `.test-data/smoke-workspace-owner-${suffix}`,
      AUTH_MODE: "demo",
      FIREBASE_AUTH_ENABLED: "false",
    },
    async () => {
      const adminResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "admin",
        name: "Workspace Lifecycle Admin",
        email: `workspace-admin-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(adminResponse.status, 201);
      const admin = await adminResponse.json();
      const adminHeaders = { Authorization: `Bearer ${admin.token}` };

      const ownerResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "patient",
        name: "Workspace Owner",
        email: `workspace-owner-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(ownerResponse.status, 201);
      const owner = await ownerResponse.json();
      const ownerHeaders = { Authorization: `Bearer ${owner.token}` };

      const firstRequestResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/auth/workspace-request`,
        {
          name: "Smoke Heart Clinic",
          workspaceType: "clinic",
          address: "1 Smoke Street",
          phone: "0909000000",
          email: `clinic-${suffix}@smarthealth.test`,
          representative: "Workspace Owner",
          legalName: "MST-SMOKE-001",
        },
        ownerHeaders,
      );
      assert.equal(firstRequestResponse.status, 201);
      const firstRequest = await firstRequestResponse.json();
      assert.equal(firstRequest.workspace.status, "pending");
      assert.equal(firstRequest.workspace.legalName, "MST-SMOKE-001");
      assert.equal(firstRequest.user.requestedRole, "workspace_owner");
      assert.equal(firstRequest.user.roleRequestStatus, "pending");
      assert.equal(firstRequest.user.role, "patient");
      assert.equal(firstRequest.user.allowedSurfaces.includes("portal"), false);

      const workspaceId = firstRequest.workspace.id;
      const infoResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        {
          status: "needs_info",
          message: "Please add legal address and representative details.",
          requiredFields: ["workspaceName", "address", "representative", "phone"],
        },
        adminHeaders,
      );
      assert.equal(infoResponse.status, 200);
      const info = await infoResponse.json();
      assert.equal(info.workspace.status, "needs_info");

      const infoPoll = await getJson(`http://127.0.0.1:${port}/api/v1/auth/firebase`, ownerHeaders);
      assert.equal(infoPoll.response.status, 200);
      assert.equal(infoPoll.data.user.roleRequestStatus, "needs_info");
      assert.deepEqual(infoPoll.data.user.roleInfoRequiredFields, [
        "workspaceName",
        "address",
        "representative",
        "phone",
      ]);
      assert.equal(infoPoll.data.user.allowedSurfaces.includes("portal"), false);

      const resubmitResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/auth/workspace-request`,
        {
          name: "Smoke Heart Clinic Updated",
          workspaceType: "clinic",
          address: "2 Smoke Street",
          phone: "0911000000",
          email: `clinic-updated-${suffix}@smarthealth.test`,
          representative: "Workspace Owner Updated",
          legalName: "MST-SMOKE-UPDATED",
          metadata: { resubmissionReason: "Updated workspace proof" },
        },
        ownerHeaders,
      );
      assert.equal(resubmitResponse.status, 201);
      const resubmit = await resubmitResponse.json();
      assert.equal(resubmit.workspace.id, workspaceId);
      assert.equal(resubmit.workspace.status, "pending");
      assert.equal(resubmit.workspace.legalName, "MST-SMOKE-UPDATED");
      assert.equal(resubmit.user.roleRequestStatus, "pending");
      assert.deepEqual(resubmit.user.roleInfoRequiredFields, []);

      const rejectResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        { status: "rejected", reason: "Legal entity could not be verified." },
        adminHeaders,
      );
      assert.equal(rejectResponse.status, 200);
      const rejectPoll = await getJson(`http://127.0.0.1:${port}/api/v1/auth/firebase`, ownerHeaders);
      assert.equal(rejectPoll.response.status, 200);
      assert.equal(rejectPoll.data.user.role, "patient");
      assert.equal(rejectPoll.data.user.roleRequestStatus, "rejected");
      assert.equal(rejectPoll.data.user.roleRejectReason, "Legal entity could not be verified.");
      assert.equal(rejectPoll.data.user.allowedSurfaces.includes("portal"), false);

      const secondResubmitResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/auth/workspace-request`,
        {
          name: "Smoke Heart Clinic Final",
          workspaceType: "clinic",
          address: "3 Smoke Street",
          phone: "0922000000",
          email: `clinic-final-${suffix}@smarthealth.test`,
          representative: "Workspace Owner Final",
          legalName: "MST-SMOKE-FINAL",
        },
        ownerHeaders,
      );
      assert.equal(secondResubmitResponse.status, 201);
      const secondResubmit = await secondResubmitResponse.json();
      assert.equal(secondResubmit.workspace.id, workspaceId);
      assert.equal(secondResubmit.workspace.status, "pending");
      assert.equal(secondResubmit.user.roleRequestStatus, "pending");

      const approveResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        { status: "active" },
        adminHeaders,
      );
      assert.equal(approveResponse.status, 200);
      const approved = await approveResponse.json();
      assert.equal(approved.workspace.status, "active");

      const approvedPoll = await getJson(`http://127.0.0.1:${port}/api/v1/auth/firebase`, ownerHeaders);
      assert.equal(approvedPoll.response.status, 200);
      assert.equal(approvedPoll.data.user.role, "workspace_owner");
      assert.equal(approvedPoll.data.user.requestedRole, "workspace_owner");
      assert.equal(approvedPoll.data.user.roleRequestStatus, "approved");
      assert.equal(approvedPoll.data.user.organizationId, workspaceId);
      assert.equal(approvedPoll.data.user.defaultSurface, "portal");
      assert.equal(approvedPoll.data.user.allowedSurfaces.includes("portal"), true);
    },
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
      assert.equal(firstSubmit.user.name, "Lifecycle Doctor");
      assert.equal(firstSubmit.user.phone, "0900000000");
      assert.equal(firstSubmit.user.license, "CCHN-LIFE-001");
      assert.equal(firstSubmit.user.hospital, "Smart Health Clinic");
      assert.equal(firstSubmit.user.department, "Tim mach");
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
      assert.equal(resubmit.user.name, "Lifecycle Doctor Updated");
      assert.equal(resubmit.user.phone, "0911111111");
      assert.equal(resubmit.user.license, "CCHN-LIFE-UPDATED");
      assert.equal(resubmit.user.hospital, "Smart Health Clinic");
      assert.equal(resubmit.user.department, "Tim mach");
      assert.equal(resubmit.user.registrationReason, "Updated smoke request");

      const polled = await getJson(`http://127.0.0.1:${port}/api/v1/auth/firebase`, doctorHeaders);
      assert.equal(polled.response.status, 200);
      assert.equal(polled.data.user.roleRequestStatus, "pending");
      assert.deepEqual(polled.data.user.roleInfoRequiredFields, []);
      assert.equal(polled.data.user.phone, "0911111111");
      assert.equal(polled.data.user.license, "CCHN-LIFE-UPDATED");
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
      const pendingDoctor = pendingAfter.data.requests.find((request) => request.id === doctor.user.id);
      assert.equal(pendingDoctor.registrationReason, "Updated smoke request");
      assert.equal(pendingDoctor.phone, "0911111111");
      assert.equal(pendingDoctor.license, "CCHN-LIFE-UPDATED");

      const approveDoctorResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctor-requests/${encodeURIComponent(doctor.user.id)}/approve`,
        { organizationId: "org_default_clinic" },
        adminHeaders,
      );
      assert.equal(approveDoctorResponse.status, 200);
      const approvedDoctor = await approveDoctorResponse.json();
      assert.equal(approvedDoctor.request.status, "approved");
      assert.equal(approvedDoctor.request.role, "doctor");
      assert.equal(approvedDoctor.request.accountStatus, "active");

      const lockDoctorResponse = await patchJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctors/${encodeURIComponent(doctor.user.id)}/lock`,
        adminHeaders,
      );
      assert.equal(lockDoctorResponse.status, 200);
      const lockedDoctor = await lockDoctorResponse.json();
      assert.equal(lockedDoctor.request.role, "doctor");
      assert.equal(lockedDoctor.request.roleRequestStatus, "approved");
      assert.equal(lockedDoctor.request.accountStatus, "locked");
      assert.ok(lockedDoctor.demoSessionsRevoked >= 1);

      const doctorsAfterLock = await getJson(`http://127.0.0.1:${port}/api/v1/admin/doctors`, adminHeaders);
      assert.equal(doctorsAfterLock.response.status, 200);
      const listedLockedDoctor = doctorsAfterLock.data.doctors.find((item) => item.id === doctor.user.id);
      assert.ok(listedLockedDoctor);
      assert.equal(listedLockedDoctor.role, "doctor");
      assert.equal(listedLockedDoctor.accountStatus, "locked");

      const lockedSessionPoll = await getJson(`http://127.0.0.1:${port}/api/v1/auth/firebase`, doctorHeaders);
      assert.equal(lockedSessionPoll.response.status, 401);
      const lockedLoginResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        login: `doctor-${suffix}@smarthealth.test`,
        password: "12345678",
        role: "doctor",
      });
      assert.equal(lockedLoginResponse.status, 403);

      const unlockDoctorResponse = await patchJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctors/${encodeURIComponent(doctor.user.id)}/unlock`,
        adminHeaders,
      );
      assert.equal(unlockDoctorResponse.status, 200);
      const unlockedDoctor = await unlockDoctorResponse.json();
      assert.equal(unlockedDoctor.request.role, "doctor");
      assert.equal(unlockedDoctor.request.roleRequestStatus, "approved");
      assert.equal(unlockedDoctor.request.accountStatus, "active");

      const unlockedLoginResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        login: `doctor-${suffix}@smarthealth.test`,
        password: "12345678",
        role: "doctor",
      });
      assert.equal(unlockedLoginResponse.status, 200);
      const unlockedLogin = await unlockedLoginResponse.json();
      assert.equal(unlockedLogin.user.role, "doctor");
      assert.equal(unlockedLogin.user.accountStatus, "active");

      const soloDoctorResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "patient",
        name: "Solo Lifecycle Doctor",
        email: `solo-doctor-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(soloDoctorResponse.status, 201);
      const soloDoctor = await soloDoctorResponse.json();
      const soloHeaders = { Authorization: `Bearer ${soloDoctor.token}` };
      const soloFirstResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/auth/role-request`,
        {
          requestedRole: "doctor",
          name: "Solo Lifecycle Doctor",
          phone: "0922222222",
          license: "CCHN-SOLO-001",
          hospital: "Phong kham tu nhan Alpha",
          department: "Ho hap",
          reason: "Solo first request",
          accountType: "solo_doctor",
          workspaceType: "solo_practice",
        },
        soloHeaders,
      );
      assert.equal(soloFirstResponse.status, 200);
      const soloFirst = await soloFirstResponse.json();
      assert.equal(soloFirst.user.workspaceType, "solo_practice");
      assert.equal(soloFirst.user.accountType, "solo_doctor");
      assert.equal(soloFirst.user.hospital, "Phong kham tu nhan Alpha");

      const soloRequestInfoResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctor-requests/${encodeURIComponent(soloDoctor.user.id)}/request-info`,
        { message: "Cap nhat so dien thoai va ten phong kham.", requiredFields: ["phone", "clinic"] },
        adminHeaders,
      );
      assert.equal(soloRequestInfoResponse.status, 200);

      const soloResubmitResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/auth/role-request`,
        {
          requestedRole: "doctor",
          name: "Solo Lifecycle Doctor Updated",
          phone: "0933333333",
          license: "CCHN-SOLO-UPDATED",
          hospital: "Phong kham tu nhan Beta",
          department: "Ho hap",
          reason: "Solo updated request",
          accountType: "solo_doctor",
          workspaceType: "solo_practice",
        },
        soloHeaders,
      );
      assert.equal(soloResubmitResponse.status, 200);
      const soloResubmit = await soloResubmitResponse.json();
      assert.equal(soloResubmit.user.roleRequestStatus, "pending");
      assert.equal(soloResubmit.user.workspaceType, "solo_practice");
      assert.equal(soloResubmit.user.accountType, "solo_doctor");
      assert.equal(soloResubmit.user.phone, "0933333333");
      assert.equal(soloResubmit.user.hospital, "Phong kham tu nhan Beta");
      assert.equal(soloResubmit.user.registrationReason, "Solo updated request");

      const soloPendingAfter = await getJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctor-requests?status=pending`,
        adminHeaders,
      );
      assert.equal(soloPendingAfter.response.status, 200);
      const soloPendingDoctor = soloPendingAfter.data.requests.find((request) => request.id === soloDoctor.user.id);
      assert.ok(soloPendingDoctor);
      assert.equal(soloPendingDoctor.phone, "0933333333");
      assert.equal(soloPendingDoctor.hospital, "Phong kham tu nhan Beta");
      assert.equal(soloPendingDoctor.workspaceType, "solo_practice");
      assert.equal(soloPendingDoctor.accountType, "solo_doctor");
      assert.equal(soloPendingDoctor.registrationReason, "Solo updated request");
    }
  );
}

async function main() {
  await testDemoAuth();
  await testProductionLocksDemoAuth();
  await testWorkspaceOwnerApprovalLifecycle();
  await testDoctorRequestNeedsInfoResubmit();
  console.log("backend smoke tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
