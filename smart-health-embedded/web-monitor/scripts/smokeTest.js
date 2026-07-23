const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeTestWavFile(filePath, samples, sampleRate = 16000) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
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
  let callbackFailed = false;
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    await waitForHealth(env.PORT);
    return await fn();
  } catch (error) {
    callbackFailed = true;
    throw error;
  } finally {
    child.kill("SIGTERM");
    await delay(300);
    if (stderr && (callbackFailed || !child.killed)) {
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

async function deleteJsonBody(url, body, headers = {}) {
  return fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function expectWebSocketRejected(url, protocols = []) {
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url, protocols);
    let opened = false;
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`WebSocket rejection timed out for ${url}`));
    }, 3000);
    const finish = (error = null) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    socket.addEventListener("open", () => {
      opened = true;
      finish(new Error(`WebSocket unexpectedly opened for ${url}`));
    }, { once: true });
    socket.addEventListener("error", () => {
      if (!opened) finish();
    }, { once: true });
    socket.addEventListener("close", () => {
      if (!opened) finish();
    }, { once: true });
  });
}

async function testDemoAuth() {
  const port = "3410";
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-smoke-demo-auth-"));
  try {
    await withServer(
      {
        PORT: port,
        AUDIO_UDP_PORT: "3411",
        DATA_BACKEND: "json",
        DATA_DIR: dataDir,
        AUTH_MODE: "demo",
        FIREBASE_AUTH_ENABLED: "false",
      },
      async () => {
        const preflight = await fetch(`http://127.0.0.1:${port}/api/v1/auth/2fa/challenge`, {
          method: "OPTIONS",
          headers: {
            Origin: "https://portal.shcare.test",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-shcare-2fa-token,content-type",
          },
        });
        assert.equal(preflight.status, 204);
        assert.match(
          preflight.headers.get("access-control-allow-headers") || "",
          /(?:^|,\s*)X-Shcare-2FA-Token(?:,|$)/i,
        );
        const response = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
          login: "doctor@example.com",
          password: "12345678",
          role: "doctor",
        });
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.user.role, "doctor");
        assert.ok(payload.token);
      },
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function testFreshDemoPortalSeedAccess() {
  const port = "3490";
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-smoke-demo-portal-"));
  try {
    await withServer(
      {
        PORT: port,
        AUDIO_UDP_PORT: "3491",
        DATA_BACKEND: "json",
        DATA_DIR: dataDir,
        AUTH_MODE: "demo",
        FIREBASE_AUTH_ENABLED: "false",
      },
      async () => {
        const response = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
          login: "doctor@example.com",
          password: "12345678",
          role: "doctor",
        });
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(payload.user.defaultSurface, "portal");
        assert.deepEqual(payload.user.allowedSurfaces, ["portal", "android"]);
        assert.equal(payload.user.currentMembership?.operational, true);
        assert.equal(payload.user.capabilities.includes("workspace.dashboard.view"), true);
      },
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function testProductionLocksDemoAuth() {
  const port = "3412";
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-smoke-prod-"));
  const demoToken = "preexisting-production-demo-token";
  fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify({
    users: [{
      id: "usr_preexisting_demo",
      role: "doctor",
      name: "Pre-existing demo account",
      email: "preexisting-demo@smarthealth.test",
      accountStatus: "active",
    }],
    sessions: [{
      id: "session_preexisting_demo",
      userId: "usr_preexisting_demo",
      token: demoToken,
      createdAt: "2026-07-14T00:00:00.000Z",
      lastSeenAt: "2026-07-14T00:00:00.000Z",
      revokedAt: null,
    }],
  }, null, 2));
  try {
    await withServer(
      {
        PORT: port,
        AUDIO_UDP_PORT: "3413",
        DATA_BACKEND: "json",
        DATA_DIR: dataDir,
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
        const protectedResponse = await fetch(`http://127.0.0.1:${port}/api/me`, {
          headers: { Authorization: `Bearer ${demoToken}` },
        });
        assert.equal(protectedResponse.status, 401, "production must reject a pre-existing demo bearer");
        const protectedPayload = await protectedResponse.json();
        assert.equal(protectedPayload.error.code, "DEMO_SESSION_DISABLED");
        await expectWebSocketRejected(
          `ws://127.0.0.1:${port}/app`,
          ["shcare.realtime.v1", `shcare.bearer.${demoToken}`],
        );
        await expectWebSocketRejected(`ws://127.0.0.1:${port}/app`, ["shcare.realtime.v1"]);
      },
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
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
        { ...ownerHeaders, "Idempotency-Key": `workspace-request-first-${suffix}` },
      );
      assert.equal(firstRequestResponse.status, 201);
      const firstRequest = await firstRequestResponse.json();
      assert.equal(firstRequest.workspace.status, "pending");
      assert.equal(firstRequest.workspace.legalName, "MST-SMOKE-001");
      assert.equal(firstRequest.user.requestedRole, "workspace_owner");
      assert.equal(firstRequest.user.roleRequestStatus, "pending");
      assert.equal(firstRequest.user.role, "patient");
      assert.equal(firstRequest.user.allowedSurfaces.includes("portal"), false);

      const firstRequestReplayResponse = await postJson(
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
        { ...ownerHeaders, "Idempotency-Key": `workspace-request-first-${suffix}` },
      );
      assert.equal(firstRequestReplayResponse.status, 201);
      const firstRequestReplay = await firstRequestReplayResponse.json();
      assert.equal(firstRequestReplay.idempotent, true);
      assert.equal(firstRequestReplay.operationId, firstRequest.operationId);
      assert.equal(firstRequestReplay.workspace.version, firstRequest.workspace.version);
      assert.equal(firstRequestReplay.notificationDelivery, "skipped");

      const firstRequestConflictResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/auth/workspace-request`,
        {
          name: "Different request with reused key",
          workspaceType: "clinic",
        },
        { ...ownerHeaders, "Idempotency-Key": `workspace-request-first-${suffix}` },
      );
      assert.equal(firstRequestConflictResponse.status, 409);
      assert.equal((await firstRequestConflictResponse.json()).error.code, "IDEMPOTENCY_KEY_REUSED");

      const workspaceId = firstRequest.workspace.id;
      const infoResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        {
          status: "needs_info",
          expectedVersion: firstRequest.workspace.version,
          message: "Please add legal address and representative details.",
          requiredFields: ["workspaceName", "address", "representative", "phone"],
        },
        { ...adminHeaders, "Idempotency-Key": `workspace-info-${workspaceId}` },
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
        { ...ownerHeaders, "Idempotency-Key": `workspace-request-resubmit-${suffix}` },
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
        {
          status: "rejected",
          expectedVersion: resubmit.workspace.version,
          reason: "Legal entity could not be verified.",
        },
        { ...adminHeaders, "Idempotency-Key": `workspace-reject-${workspaceId}` },
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
        { ...ownerHeaders, "Idempotency-Key": `workspace-request-final-${suffix}` },
      );
      assert.equal(secondResubmitResponse.status, 201);
      const secondResubmit = await secondResubmitResponse.json();
      assert.equal(secondResubmit.workspace.id, workspaceId);
      assert.equal(secondResubmit.workspace.status, "pending");
      assert.equal(secondResubmit.user.roleRequestStatus, "pending");

      const approvalUrl = `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`;
      const ownerApprovalUrl = `${approvalUrl}/owner-approval`;
      const approvalWithoutIdempotency = await postJson(
        ownerApprovalUrl,
        { expectedVersion: secondResubmit.workspace.version },
        adminHeaders,
      );
      assert.equal(approvalWithoutIdempotency.status, 400);
      const approvalWithoutIdempotencyError = await approvalWithoutIdempotency.json();
      assert.equal(approvalWithoutIdempotencyError.error.code, "IDEMPOTENCY_KEY_REQUIRED");
      const ownerApprovalHeaders = {
        ...adminHeaders,
        "Idempotency-Key": `approve-workspace-owner-${workspaceId}`,
      };
      const ownerApprovalResponse = await postJson(
        ownerApprovalUrl,
        { expectedVersion: secondResubmit.workspace.version },
        ownerApprovalHeaders,
      );
      assert.equal(ownerApprovalResponse.status, 200, await ownerApprovalResponse.clone().text());
      const ownerApproval = await ownerApprovalResponse.json();
      assert.equal(ownerApproval.workspace.status, "pending");
      assert.equal(ownerApproval.workspace.version, secondResubmit.workspace.version);
      assert.equal(ownerApproval.ownerApproval.userId, owner.user.id);
      assert.equal(ownerApproval.ownerApproval.roleRequestStatus, "approved");
      assert.equal(ownerApproval.idempotent, false);

      const ownerApprovalReplayResponse = await postJson(
        ownerApprovalUrl,
        { expectedVersion: secondResubmit.workspace.version },
        ownerApprovalHeaders,
      );
      assert.equal(ownerApprovalReplayResponse.status, 200);
      assert.equal((await ownerApprovalReplayResponse.json()).idempotent, true);

      const approveResponse = await patchJsonBody(
        approvalUrl,
        { status: "active", expectedVersion: secondResubmit.workspace.version },
        { ...adminHeaders, "Idempotency-Key": `activate-workspace-${workspaceId}` },
      );
      assert.equal(approveResponse.status, 200);
      const approved = await approveResponse.json();
      assert.equal(approved.workspace.status, "active");
      const approvedWorkspaceVersion = approved.workspace.version;

      const revokedOwnerPoll = await getJson(`http://127.0.0.1:${port}/api/v1/auth/firebase`, ownerHeaders);
      assert.equal(revokedOwnerPoll.response.status, 401, "owner role approval must revoke the pre-transition session");
      const approvedOwnerLoginResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        login: `workspace-owner-${suffix}@smarthealth.test`,
        password: "12345678",
        role: "workspace_owner",
      });
      assert.equal(approvedOwnerLoginResponse.status, 200);
      const approvedOwnerLogin = await approvedOwnerLoginResponse.json();
      const approvedOwnerHeaders = { Authorization: `Bearer ${approvedOwnerLogin.token}` };
      const approvedPoll = await getJson(
        `http://127.0.0.1:${port}/api/v1/auth/firebase`,
        approvedOwnerHeaders,
      );
      assert.equal(approvedPoll.response.status, 200);
      assert.equal(approvedPoll.data.user.role, "workspace_owner");
      assert.equal(approvedPoll.data.user.requestedRole, "workspace_owner");
      assert.equal(approvedPoll.data.user.roleRequestStatus, "approved");
      assert.equal(approvedPoll.data.user.organizationId, workspaceId);
      assert.equal(approvedPoll.data.user.defaultSurface, "portal");
      assert.equal(approvedPoll.data.user.allowedSurfaces.includes("portal"), true);

      const lockOwnerResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/admin/admin-users/${encodeURIComponent(owner.user.id)}/lock`,
        {},
        adminHeaders,
      );
      assert.equal(lockOwnerResponse.status, 409);
      const lockOwnerError = await lockOwnerResponse.json();
      assert.equal(lockOwnerError.error.code, "WORKSPACE_OWNER_TRANSFER_REQUIRED");
      assert.deepEqual(lockOwnerError.error.details.workspaceIds, [workspaceId]);

      const demoteOwnerResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/admin-users/${encodeURIComponent(owner.user.id)}`,
        { role: "workspace_admin", organizationId: workspaceId },
        adminHeaders,
      );
      assert.equal(demoteOwnerResponse.status, 409);
      const demoteOwnerError = await demoteOwnerResponse.json();
      assert.equal(demoteOwnerError.error.code, "WORKSPACE_OWNER_TRANSFER_REQUIRED");

      const deleteOwnerResponse = await fetch(
        `http://127.0.0.1:${port}/api/v1/admin/admin-users/${encodeURIComponent(owner.user.id)}`,
        { method: "DELETE", headers: adminHeaders },
      );
      assert.equal(deleteOwnerResponse.status, 409);
      const deleteOwnerError = await deleteOwnerResponse.json();
      assert.equal(deleteOwnerError.error.code, "WORKSPACE_OWNER_TRANSFER_REQUIRED");

      const ownerAfterRejectedMutations = await getJson(
        `http://127.0.0.1:${port}/api/v1/auth/firebase`,
        approvedOwnerHeaders,
      );
      assert.equal(ownerAfterRejectedMutations.response.status, 200);
      assert.equal(ownerAfterRejectedMutations.data.user.role, "workspace_owner");
      assert.equal(ownerAfterRejectedMutations.data.user.accountStatus, "active");

      const replacementResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "patient",
        name: "Replacement Workspace Owner",
        email: `workspace-replacement-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(replacementResponse.status, 201);
      const replacement = await replacementResponse.json();
      const replacementHeaders = { Authorization: `Bearer ${replacement.token}` };

      const transferWithoutKey = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        { ownerUserId: replacement.user.id, expectedVersion: approvedWorkspaceVersion },
        adminHeaders,
      );
      assert.equal(transferWithoutKey.status, 400);
      assert.equal((await transferWithoutKey.json()).error.code, "IDEMPOTENCY_KEY_REQUIRED");

      const combinedTransfer = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        {
          ownerUserId: replacement.user.id,
          expectedVersion: approvedWorkspaceVersion,
          name: "Must not mutate",
        },
        { ...adminHeaders, "Idempotency-Key": "workspace-owner-transfer-combined" },
      );
      assert.equal(combinedTransfer.status, 400);
      assert.equal((await combinedTransfer.json()).error.code, "WORKSPACE_OWNER_TRANSFER_MUST_BE_SEPARATE");

      const ownerTransferHeaders = { ...adminHeaders, "Idempotency-Key": "workspace-owner-transfer" };
      const transferResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        { ownerUserId: replacement.user.id, expectedVersion: approvedWorkspaceVersion },
        ownerTransferHeaders,
      );
      assert.equal(transferResponse.status, 200, await transferResponse.clone().text());
      const transfer = await transferResponse.json();
      assert.equal(transfer.workspace.ownerUserId, replacement.user.id);
      assert.equal(transfer.workspace.version, approvedWorkspaceVersion + 1);
      assert.equal(transfer.ownerTransfer.previousOwnerUserId, owner.user.id);
      assert.equal(transfer.ownerTransfer.membership.role, "workspace_owner");
      assert.equal(transfer.replayed, false);
      assert.ok(transfer.operationId);

      const transferReplayResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        { ownerUserId: replacement.user.id, expectedVersion: approvedWorkspaceVersion },
        ownerTransferHeaders,
      );
      assert.equal(transferReplayResponse.status, 200);
      const transferReplay = await transferReplayResponse.json();
      assert.equal(transferReplay.replayed, true);
      assert.equal(transferReplay.ownerTransfer.previousOwnerUserId, owner.user.id);

      const conflictingReplacementResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "patient",
        name: "Conflicting Replacement Owner",
        email: `workspace-replacement-conflict-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(conflictingReplacementResponse.status, 201);
      const conflictingReplacement = await conflictingReplacementResponse.json();
      const transferConflictResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        { ownerUserId: conflictingReplacement.user.id, expectedVersion: approvedWorkspaceVersion },
        ownerTransferHeaders,
      );
      assert.equal(transferConflictResponse.status, 409);
      assert.equal((await transferConflictResponse.json()).error.code, "IDEMPOTENCY_KEY_REUSED");

      const staleTransferResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/clinics/${encodeURIComponent(workspaceId)}`,
        { ownerUserId: conflictingReplacement.user.id, expectedVersion: approvedWorkspaceVersion },
        { ...adminHeaders, "Idempotency-Key": "workspace-owner-transfer-stale" },
      );
      assert.equal(staleTransferResponse.status, 409);
      const staleTransferError = await staleTransferResponse.json();
      assert.equal(staleTransferError.error.code, "WORKSPACE_VERSION_CONFLICT");
      assert.equal(staleTransferError.error.details.currentVersion, approvedWorkspaceVersion + 1);
      const conflictingReplacementPoll = await getJson(
        `http://127.0.0.1:${port}/api/v1/auth/firebase`,
        { Authorization: `Bearer ${conflictingReplacement.token}` },
      );
      assert.equal(conflictingReplacementPoll.response.status, 200);
      assert.equal(conflictingReplacementPoll.data.user.role, "patient");

      const revokedReplacementSession = await getJson(
        `http://127.0.0.1:${port}/api/v1/auth/firebase`,
        replacementHeaders,
      );
      assert.equal(revokedReplacementSession.response.status, 401);
      const replacementLoginResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        login: `workspace-replacement-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(replacementLoginResponse.status, 200);
      const replacementLogin = await replacementLoginResponse.json();
      assert.equal(replacementLogin.user.role, "workspace_owner");
      assert.equal(replacementLogin.user.organizationId, workspaceId);
      assert.equal(replacementLogin.user.allowedSurfaces.includes("portal"), true);

      const lockFormerOwnerResponse = await postJson(
        `http://127.0.0.1:${port}/api/v1/admin/admin-users/${encodeURIComponent(owner.user.id)}/lock`,
        {},
        adminHeaders,
      );
      assert.equal(lockFormerOwnerResponse.status, 200, await lockFormerOwnerResponse.clone().text());
    },
  );
}

async function testWorkspaceTombstoneSurvivesRestart() {
  const firstPort = "3420";
  const restartPort = "3422";
  const suffix = Date.now();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-workspace-tombstone-"));
  const workspaceId = "org_default_clinic";

  try {
    await withServer(
      {
        PORT: firstPort,
        AUDIO_UDP_PORT: "3421",
        DATA_BACKEND: "json",
        DATA_DIR: dataDir,
        AUTH_MODE: "demo",
        FIREBASE_AUTH_ENABLED: "false",
      },
      async () => {
        const adminResponse = await postJson(`http://127.0.0.1:${firstPort}/api/v1/auth/register`, {
          role: "admin",
          name: "Tombstone Admin",
          email: `tombstone-admin-${suffix}@smarthealth.test`,
          password: "12345678",
        });
        assert.equal(adminResponse.status, 201);
        const admin = await adminResponse.json();
        const adminHeaders = { Authorization: `Bearer ${admin.token}` };
        const list = await getJson(
          `http://127.0.0.1:${firstPort}/api/v1/admin/clinics?limit=100`,
          adminHeaders,
        );
        assert.equal(list.response.status, 200);
        const workspace = list.data.workspaces.find((item) => item.id === workspaceId);
        assert.ok(workspace, "the default catalog workspace must exist before archival");

        let archiveVersion = workspace.version;
        if (workspace.status === "active") {
          const deactivateResponse = await patchJsonBody(
            `http://127.0.0.1:${firstPort}/api/v1/admin/clinics/${workspaceId}`,
            { status: "inactive", expectedVersion: workspace.version },
            { ...adminHeaders, "Idempotency-Key": `deactivate-default-${suffix}` },
          );
          assert.equal(deactivateResponse.status, 200, await deactivateResponse.clone().text());
          const deactivated = await deactivateResponse.json();
          assert.equal(deactivated.workspace.status, "inactive");
          archiveVersion = deactivated.workspace.version;
        }

        const archiveResponse = await deleteJsonBody(
          `http://127.0.0.1:${firstPort}/api/v1/admin/clinics/${workspaceId}`,
          { expectedVersion: archiveVersion },
          { ...adminHeaders, "Idempotency-Key": `archive-default-${suffix}` },
        );
        assert.equal(archiveResponse.status, 200, await archiveResponse.clone().text());
        const archived = await archiveResponse.json();
        assert.equal(archived.deleted, true);
        assert.equal(archived.workspaceId, workspaceId);

        const catalog = await getJson(`http://127.0.0.1:${firstPort}/api/v1/catalog/clinics`);
        assert.equal(catalog.response.status, 200);
        assert.equal(catalog.data.clinics.some((item) => item.id === workspaceId), false);
      },
    );

    await withServer(
      {
        PORT: restartPort,
        AUDIO_UDP_PORT: "3423",
        DATA_BACKEND: "json",
        DATA_DIR: dataDir,
        AUTH_MODE: "demo",
        FIREBASE_AUTH_ENABLED: "false",
      },
      async () => {
        const catalog = await getJson(`http://127.0.0.1:${restartPort}/api/v1/catalog/clinics`);
        assert.equal(catalog.response.status, 200);
        assert.equal(
          catalog.data.clinics.some((item) => item.id === workspaceId),
          false,
          "an archived default catalog workspace must remain hidden after restart",
        );

        const doctorResponse = await postJson(`http://127.0.0.1:${restartPort}/api/v1/auth/register`, {
          role: "patient",
          name: "Tombstone Doctor Candidate",
          email: `tombstone-doctor-${suffix}@smarthealth.test`,
          password: "12345678",
        });
        assert.equal(doctorResponse.status, 201);
        const doctor = await doctorResponse.json();
        const roleRequest = await postJson(
          `http://127.0.0.1:${restartPort}/api/v1/auth/role-request`,
          {
            requestedRole: "doctor",
            workspaceType: "clinic",
            organizationId: workspaceId,
          },
          { Authorization: `Bearer ${doctor.token}` },
        );
        assert.equal(roleRequest.status, 400);
        assert.equal((await roleRequest.json()).message, "Clinic is not available");
      },
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
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
      const revokedPendingDoctorSession = await getJson(
        `http://127.0.0.1:${port}/api/v1/auth/firebase`,
        doctorHeaders,
      );
      assert.equal(revokedPendingDoctorSession.response.status, 401);
      const approvedDoctorLoginResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        login: `doctor-${suffix}@smarthealth.test`,
        password: "12345678",
        role: "doctor",
      });
      assert.equal(approvedDoctorLoginResponse.status, 200);
      const approvedDoctorLogin = await approvedDoctorLoginResponse.json();
      const approvedDoctorHeaders = { Authorization: `Bearer ${approvedDoctorLogin.token}` };

      const lockDoctorResponse = await patchJson(
        `http://127.0.0.1:${port}/api/v1/admin/doctors/${encodeURIComponent(doctor.user.id)}/lock`,
        adminHeaders,
      );
      assert.equal(lockDoctorResponse.status, 200, await lockDoctorResponse.clone().text());
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

      const lockedSessionPoll = await getJson(
        `http://127.0.0.1:${port}/api/v1/auth/firebase`,
        approvedDoctorHeaders,
      );
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

async function testManagedAdminRoleTransitionSaga() {
  const port = "3420";
  const suffix = Date.now();
  await withServer(
    {
      PORT: port,
      AUDIO_UDP_PORT: "3421",
      DATA_BACKEND: "json",
      DATA_DIR: `.test-data/smoke-admin-role-transition-${suffix}`,
      AUTH_MODE: "demo",
      FIREBASE_AUTH_ENABLED: "false",
    },
    async () => {
      const actorResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "admin",
        name: "Role Transition Actor",
        email: `role-actor-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(actorResponse.status, 201);
      const actor = await actorResponse.json();
      const actorHeaders = { Authorization: `Bearer ${actor.token}` };

      const targetResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "admin",
        name: "Role Transition Target",
        email: `role-target-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(targetResponse.status, 201);
      const target = await targetResponse.json();
      const targetHeaders = { Authorization: `Bearer ${target.token}` };

      const transitionResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/admin-users/${encodeURIComponent(target.user.id)}`,
        { role: "workspace_admin", organizationId: "org_default_clinic" },
        actorHeaders,
      );
      assert.equal(transitionResponse.status, 200, await transitionResponse.clone().text());
      const transition = await transitionResponse.json();
      assert.equal(transition.user.role, "workspace_admin");
      assert.equal(transition.user.requestedRole, "workspace_admin");
      assert.equal(transition.user.organizationId, "org_default_clinic");
      assert.equal(transition.user.accountStatus, "active");
      assert.ok(transition.operationId);

      const revokedTargetSession = await getJson(
        `http://127.0.0.1:${port}/api/v1/auth/firebase`,
        targetHeaders,
      );
      assert.equal(revokedTargetSession.response.status, 401);

      const reloginResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/login`, {
        login: `role-target-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(reloginResponse.status, 200);
      const relogin = await reloginResponse.json();
      assert.equal(relogin.user.role, "workspace_admin");

      const profileOnlyResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/admin-users/${encodeURIComponent(target.user.id)}`,
        { name: "Role Transition Target Updated" },
        actorHeaders,
      );
      assert.equal(profileOnlyResponse.status, 200, await profileOnlyResponse.clone().text());
      const profileOnly = await profileOnlyResponse.json();
      assert.equal(profileOnly.user.name, "Role Transition Target Updated");
      assert.equal(profileOnly.operationId, undefined);

      const combinedTargetResponse = await postJson(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        role: "admin",
        name: "Combined Mutation Target",
        email: `role-combined-${suffix}@smarthealth.test`,
        password: "12345678",
      });
      assert.equal(combinedTargetResponse.status, 201);
      const combinedTarget = await combinedTargetResponse.json();
      const combinedResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/admin-users/${encodeURIComponent(combinedTarget.user.id)}`,
        { role: "workspace_admin", organizationId: "org_default_clinic", accountStatus: "locked" },
        actorHeaders,
      );
      assert.equal(combinedResponse.status, 400);
      const combinedPayload = await combinedResponse.json();
      assert.equal(combinedPayload.error.code, "IDENTITY_MUTATIONS_MUST_BE_SEPARATE");

      const selfDemotionResponse = await patchJsonBody(
        `http://127.0.0.1:${port}/api/v1/admin/admin-users/${encodeURIComponent(actor.user.id)}`,
        { role: "workspace_admin", organizationId: "org_default_clinic" },
        actorHeaders,
      );
      assert.equal(selfDemotionResponse.status, 400);
    },
  );
}

async function testAudioWorkerPersistsProcessedResult() {
  const { processAudioJob } = require("../src/audioProcessingWorker");
  const {
    SIGNAL_QUALITY_ANALYZER_VERSION,
    normalizeAiSettings,
  } = require("../src/aiRuntime");
  const suffix = Date.now();
  const dataDir = path.join(rootDir, ".test-data", `smoke-audio-worker-${suffix}`);
  const wavFilePath = path.join(dataDir, "audio", "scan-worker.wav");
  writeTestWavFile(wavFilePath, [0, 600, -850, 1200, -1600, 900, -400, 0]);

  const db = {
    settings: { ai: { version: "worker-test-model" } },
    audioFiles: [],
    aiResults: [],
    scans: [
      {
        id: "scan_worker",
        organizationId: "org_worker",
        patientId: "pat_worker",
        sampleRate: 16000,
        status: "queued",
        processingStatus: "queued",
        wavFile: "scan-worker.wav",
      },
    ],
  };
  const saved = { scans: [], audioFiles: [], aiResults: [] };
  const storageWrites = [];
  const storageAdapter = {
    async putFile(objectKey, sourceFile, contentType) {
      const stat = fs.statSync(sourceFile);
      storageWrites.push({ type: "file", objectKey, contentType, byteSize: stat.size });
      return { provider: "local", objectKey, contentType, byteSize: stat.size };
    },
    async putBuffer(objectKey, buffer, contentType) {
      storageWrites.push({ type: "buffer", objectKey, contentType, byteSize: buffer.length });
      return { provider: "local", objectKey, contentType, byteSize: buffer.length };
    },
  };
  const repositories = {
    scans: { save: async (scan) => saved.scans.push({ ...scan }) },
    audioFiles: { save: async (audioFile) => saved.audioFiles.push({ ...audioFile }) },
    aiResults: { save: async (aiResult) => saved.aiResults.push({ ...aiResult }) },
  };

  const result = await processAudioJob(
    {
      scanId: "scan_worker",
      patientId: "pat_worker",
      organizationId: "org_worker",
      wavFilePath,
      sampleRate: 16000,
    },
    {
      db,
      repositories,
      storageAdapter,
      createId: (prefix) => `${prefix}_worker`,
      nowIso: () => "2026-07-10T00:00:00.000Z",
    },
  );

  assert.equal(result.scanId, "scan_worker");
  assert.equal(result.label, "captured");
  assert.equal(db.scans[0].status, "completed");
  assert.equal(db.scans[0].processingStatus, "completed");
  assert.match(db.scans[0].aiResultId, /^ai_[a-f0-9]{40}$/);
  assert.match(db.scans[0].audioFileId, /^audio_[a-f0-9]{40}$/);
  assert.equal(saved.scans.at(-1).aiResultId, db.scans[0].aiResultId);
  assert.equal(saved.audioFiles[0].scanId, "scan_worker");
  assert.equal(saved.aiResults[0].modelVersion, SIGNAL_QUALITY_ANALYZER_VERSION);
  assert.equal(saved.aiResults[0].rawResult.analysisKind, "signal_quality");
  assert.equal(saved.aiResults[0].rawResult.clinicalDecisionSupport, false);
  const truthfulSettings = normalizeAiSettings({
    selectedModel: "balanced",
    version: "AI Medical Analysis v3.2.1",
    heartAccuracy: 96.8,
    lastUpdateStatus: "updated",
  });
  assert.equal(truthfulSettings.version, SIGNAL_QUALITY_ANALYZER_VERSION);
  assert.equal(truthfulSettings.updateSupported, false);
  assert.equal(truthfulSettings.clinicalDecisionSupport, false);
  assert.equal(Object.hasOwn(truthfulSettings, "heartAccuracy"), false);
  assert.equal(storageWrites.some((write) => write.type === "file" && write.objectKey.includes("audio.wav")), true);
  assert.equal(storageWrites.some((write) => write.type === "buffer" && write.objectKey.includes("waveform.json")), true);
}

async function main() {
  await testDemoAuth();
  await testFreshDemoPortalSeedAccess();
  await testProductionLocksDemoAuth();
  await testWorkspaceOwnerApprovalLifecycle();
  await testWorkspaceTombstoneSurvivesRestart();
  await testDoctorRequestNeedsInfoResubmit();
  await testManagedAdminRoleTransitionSaga();
  await testAudioWorkerPersistsProcessedResult();
  console.log("backend smoke tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
