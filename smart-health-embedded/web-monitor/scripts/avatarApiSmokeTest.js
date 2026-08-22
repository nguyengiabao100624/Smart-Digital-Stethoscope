const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, ".test-data", "avatar-api");
const port = "3441";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readAvatarOperation(operationId) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  return payload.avatarMutationOperations.find(
    (operation) => operation.id === operationId,
  );
}

async function waitForCleanup(operationId, expectedStatus) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const operation = readAvatarOperation(operationId);
      if (operation?.cleanupStatus === expectedStatus) return operation;
    } catch {}
    await delay(100);
  }
  throw new Error(
    `avatar cleanup ${operationId} did not reach ${expectedStatus}`,
  );
}

function pngBytes(marker) {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, marker, 2, 3, 4,
  ]);
}

function seedDb() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const createdAt = new Date().toISOString();
  const organizations = ["org-avatar-a", "org-avatar-b"].map((id, index) => ({
    id,
    name: `Avatar workspace ${index + 1}`,
    type: "personal",
    workspaceType: "personal",
    ownerUserId: `user-avatar-${index === 0 ? "a" : "b"}`,
    status: "active",
    createdAt,
    updatedAt: createdAt,
  }));
  organizations.push({
    id: "org-avatar-shared",
    name: "Avatar shared workspace",
    type: "clinic",
    workspaceType: "clinic",
    ownerUserId: "user-avatar-b",
    status: "active",
    createdAt,
    updatedAt: createdAt,
  });
  const users = ["a", "b"].map((suffix) => ({
    id: `user-avatar-${suffix}`,
    role: "patient",
    accountStatus: "active",
    name: `Avatar user ${suffix.toUpperCase()}`,
    email: `avatar-${suffix}@test.local`,
    password: "12345678",
    organizationId: `org-avatar-${suffix}`,
    avatarFileId: "",
    avatarUrl: "",
    avatarStorage: {},
    createdAt,
    updatedAt: createdAt,
  }));
  const memberships = users.map((user) => ({
    id: `membership-${user.id}`,
    userId: user.id,
    organizationId: user.organizationId,
    role: "patient",
    status: "active",
    createdAt,
    updatedAt: createdAt,
  }));
  memberships.push({
    id: "membership-user-avatar-a-shared",
    userId: "user-avatar-a",
    organizationId: "org-avatar-shared",
    role: "patient",
    status: "active",
    createdAt,
    updatedAt: createdAt,
  });
  fs.writeFileSync(
    path.join(dataDir, "db.json"),
    JSON.stringify(
      {
        version: 1,
        createdAt,
        updatedAt: createdAt,
        organizations,
        users,
        memberships,
        patients: [],
        storageFiles: [],
        auditLogs: [],
        idempotencyKeys: [],
        avatarMutationOperations: [],
      },
      null,
      2,
    ),
  );
}

async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { text };
    }
  }
  return { response, body };
}

async function waitForHealth() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("avatar API backend did not start");
}

async function login(suffix) {
  const { response, body } = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: `avatar-${suffix}@test.local`,
      password: "12345678",
    }),
  });
  assert.equal(response.status, 200, JSON.stringify(body));
  const authorization = { Authorization: `Bearer ${body.token}` };
  const sessions = await request("/api/v1/auth/sessions", {
    headers: authorization,
  });
  assert.equal(sessions.response.status, 200, JSON.stringify(sessions.body));
  const currentSession = sessions.body.sessions.find(
    (session) => session.current === true && !session.revokedAt,
  );
  assert.ok(currentSession?.id, "avatar mutations require a current auth session");
  return {
    ...authorization,
    "X-Shcare-Expected-User-Id": body.user.id,
    "X-Shcare-Expected-Workspace-Id": body.user.currentWorkspaceId,
    "X-Shcare-Expected-Auth-Session-Id": currentSession.id,
  };
}

function authorizationOnly(headers) {
  return { Authorization: headers.Authorization };
}

function uploadOptions(headers, key, bytes, fileName = "avatar.png") {
  return {
    method: "POST",
    headers: {
      ...headers,
      ...(key ? { "Idempotency-Key": key } : {}),
      "Content-Type": "image/png",
      "X-File-Name": fileName,
    },
    body: bytes,
  };
}

async function runScenario() {
  let ownerA = await login("a");
  const ownerB = await login("b");
  const bytesA = pngBytes(1);
  const bytesB = pngBytes(9);
  const key = "avatar-server-smoke-upload-key";

  const missingAuthority = await request(
    "/api/v1/me/avatar",
    uploadOptions(
      authorizationOnly(ownerA),
      "avatar-server-smoke-missing-authority",
      bytesA,
      "../must-not-be-parsed.png",
    ),
  );
  assert.equal(missingAuthority.response.status, 400, JSON.stringify(missingAuthority.body));
  assert.equal(
    missingAuthority.body.error.code,
    "AVATAR_MUTATION_AUTHORITY_REQUIRED",
  );

  const malformedAuthority = await request(
    "/api/v1/me/avatar",
    uploadOptions(
      {
        ...ownerA,
        "X-Shcare-Expected-User-Id": "user-avatar-a,forged",
      },
      "avatar-server-smoke-malformed-authority",
      bytesA,
    ),
  );
  assert.equal(
    malformedAuthority.response.status,
    400,
    JSON.stringify(malformedAuthority.body),
  );
  assert.equal(
    malformedAuthority.body.error.code,
    "AVATAR_MUTATION_AUTHORITY_INVALID",
  );

  const mismatchedAuthority = await request(
    "/api/v1/me/avatar",
    uploadOptions(
      {
        ...ownerA,
        "X-Shcare-Expected-Auth-Session-Id": "auth-session-replaced",
      },
      "avatar-server-smoke-mismatched-authority",
      bytesA,
    ),
  );
  assert.equal(
    mismatchedAuthority.response.status,
    409,
    JSON.stringify(mismatchedAuthority.body),
  );
  assert.equal(mismatchedAuthority.body.error.code, "AUTH_SESSION_REPLACED");
  const rejectedAuthorityState = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  assert.equal(rejectedAuthorityState.avatarMutationOperations.length, 0);
  assert.equal(rejectedAuthorityState.storageFiles.length, 0);

  const missingKey = await request(
    "/api/v1/me/avatar",
    uploadOptions(ownerA, "", bytesA),
  );
  assert.equal(missingKey.response.status, 400);
  assert.equal(missingKey.body.error.code, "IDEMPOTENCY_KEY_REQUIRED");

  const created = await request(
    "/api/v1/me/avatar",
    uploadOptions(ownerA, key, bytesA),
  );
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.deepEqual(Object.keys(created.body), [
    "avatar",
    "cleanup",
    "operationId",
    "replayed",
  ]);
  assert.equal(created.body.avatar.ownerUserId, "user-avatar-a");
  assert.equal(
    created.body.avatar.sha256,
    crypto.createHash("sha256").update(bytesA).digest("hex"),
  );
  assert.equal(created.body.replayed, false);

  const replay = await request(
    "/api/v1/me/avatar",
    uploadOptions(ownerA, key, bytesA),
  );
  assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.avatar.fileId, created.body.avatar.fileId);

  const legacyReplay = await request(
    "/api/me/avatar",
    uploadOptions(authorizationOnly(ownerA), key, bytesA),
  );
  assert.equal(legacyReplay.response.status, 200, JSON.stringify(legacyReplay.body));
  assert.equal(legacyReplay.response.headers.get("Deprecation"), "true");
  assert.equal(
    legacyReplay.response.headers.get("X-Shcare-Compatibility-Alias"),
    "account-avatar",
  );
  assert.equal(legacyReplay.body.replayed, true);
  assert.equal(legacyReplay.body.avatar.fileId, created.body.avatar.fileId);

  const collision = await request(
    "/api/v1/me/avatar",
    uploadOptions(ownerA, key, bytesB),
  );
  assert.equal(collision.response.status, 409, JSON.stringify(collision.body));
  assert.equal(collision.body.error.code, "IDEMPOTENCY_KEY_REUSED");

  const ownerBCreated = await request(
    "/api/v1/me/avatar",
    uploadOptions(ownerB, key, bytesB),
  );
  assert.equal(ownerBCreated.response.status, 201, JSON.stringify(ownerBCreated.body));
  assert.equal(ownerBCreated.body.avatar.ownerUserId, "user-avatar-b");
  assert.notEqual(ownerBCreated.body.avatar.fileId, created.body.avatar.fileId);

  const ownerAFirstSession = ownerA;
  const ownerASecondSession = await login("a");
  assert.notEqual(
    ownerASecondSession["X-Shcare-Expected-Auth-Session-Id"],
    ownerA["X-Shcare-Expected-Auth-Session-Id"],
  );
  const crossSessionReplay = await request(
    "/api/v1/me/avatar",
    uploadOptions(ownerASecondSession, key, bytesA),
  );
  assert.equal(
    crossSessionReplay.response.status,
    409,
    JSON.stringify(crossSessionReplay.body),
  );
  assert.equal(crossSessionReplay.body.error.code, "AUTH_SESSION_REPLACED");

  const revokeFirstSession = await request(
    `/api/v1/auth/sessions/${encodeURIComponent(
      ownerAFirstSession["X-Shcare-Expected-Auth-Session-Id"],
    )}/revoke`,
    {
      method: "POST",
      headers: {
        ...authorizationOnly(ownerASecondSession),
        "Idempotency-Key": "avatar-server-smoke-revoke-e1",
      },
    },
  );
  assert.equal(
    revokeFirstSession.response.status,
    200,
    JSON.stringify(revokeFirstSession.body),
  );
  assert.equal(revokeFirstSession.body.revoked, true);
  const revokedFirstSession = await request(
    "/api/v1/me/avatar",
    uploadOptions(ownerAFirstSession, "avatar-server-smoke-stale-e1", bytesA),
  );
  assert.equal(revokedFirstSession.response.status, 401);
  const replayAfterSessionRevocation = await request(
    "/api/v1/me/avatar",
    uploadOptions(ownerASecondSession, key, bytesA),
  );
  assert.equal(
    replayAfterSessionRevocation.response.status,
    409,
    JSON.stringify(replayAfterSessionRevocation.body),
  );
  assert.equal(
    replayAfterSessionRevocation.body.error.code,
    "AUTH_SESSION_REPLACED",
  );
  ownerA = ownerASecondSession;

  const forgedDelete = await request("/api/v1/me/avatar", {
    method: "DELETE",
    headers: {
      ...ownerB,
      "Content-Type": "application/json",
      "Idempotency-Key": "avatar-forged-delete-key",
    },
    body: JSON.stringify({ expectedAvatarFileId: created.body.avatar.fileId }),
  });
  assert.equal(forgedDelete.response.status, 409, JSON.stringify(forgedDelete.body));
  assert.equal(forgedDelete.body.error.code, "AVATAR_PRECONDITION_FAILED");

  const missingDeleteAuthority = await request("/api/v1/me/avatar", {
    method: "DELETE",
    headers: {
      ...authorizationOnly(ownerA),
      "Content-Type": "application/json",
      "Idempotency-Key": "avatar-missing-delete-authority",
    },
    body: "{",
  });
  assert.equal(
    missingDeleteAuthority.response.status,
    400,
    JSON.stringify(missingDeleteAuthority.body),
  );
  assert.equal(
    missingDeleteAuthority.body.error.code,
    "AVATAR_MUTATION_AUTHORITY_REQUIRED",
  );

  const malformedDeleteAuthority = await request("/api/v1/me/avatar", {
    method: "DELETE",
    headers: {
      ...ownerA,
      "X-Shcare-Expected-Auth-Session-Id": `${
        ownerA["X-Shcare-Expected-Auth-Session-Id"]
      },forged`,
      "Content-Type": "application/json",
      "Idempotency-Key": "avatar-malformed-delete-authority",
    },
    body: JSON.stringify({ expectedAvatarFileId: created.body.avatar.fileId }),
  });
  assert.equal(
    malformedDeleteAuthority.response.status,
    400,
    JSON.stringify(malformedDeleteAuthority.body),
  );
  assert.equal(
    malformedDeleteAuthority.body.error.code,
    "AVATAR_MUTATION_AUTHORITY_INVALID",
  );

  const mismatchedDeleteAuthority = await request("/api/v1/me/avatar", {
    method: "DELETE",
    headers: {
      ...ownerA,
      "X-Shcare-Expected-Workspace-Id": "org-avatar-replaced",
      "Content-Type": "application/json",
      "Idempotency-Key": "avatar-mismatched-delete-authority",
    },
    body: JSON.stringify({ expectedAvatarFileId: created.body.avatar.fileId }),
  });
  assert.equal(
    mismatchedDeleteAuthority.response.status,
    409,
    JSON.stringify(mismatchedDeleteAuthority.body),
  );
  assert.equal(
    mismatchedDeleteAuthority.body.error.code,
    "AUTH_SESSION_REPLACED",
  );

  const missingDeleteKey = await request("/api/v1/me/avatar", {
    method: "DELETE",
    headers: { ...ownerA, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedAvatarFileId: created.body.avatar.fileId }),
  });
  assert.equal(missingDeleteKey.response.status, 400);
  assert.equal(missingDeleteKey.body.error.code, "IDEMPOTENCY_KEY_REQUIRED");

  const deleteKey = "avatar-server-smoke-delete-key";
  const deleted = await request("/api/v1/me/avatar", {
    method: "DELETE",
    headers: {
      ...ownerA,
      "Content-Type": "application/json",
      "Idempotency-Key": deleteKey,
    },
    body: JSON.stringify({ expectedAvatarFileId: created.body.avatar.fileId }),
  });
  assert.equal(deleted.response.status, 200, JSON.stringify(deleted.body));
  assert.equal(deleted.body.deleted, true);
  assert.equal(deleted.body.avatar.ownerUserId, "user-avatar-a");
  assert.equal(deleted.body.cleanup.status, "pending");

  const pendingStatus = await request("/api/v1/me/avatar/cleanup", {
    headers: ownerA,
  });
  assert.equal(pendingStatus.response.status, 200, JSON.stringify(pendingStatus.body));
  assert.equal(pendingStatus.body.userId, "user-avatar-a");
  assert.equal(pendingStatus.body.workspaceId, "org-avatar-a");
  assert.equal(pendingStatus.body.status, "pending");
  assert.equal(pendingStatus.body.operationId, deleted.body.operationId);
  assert.equal(pendingStatus.body.action, "delete");
  assert.equal(pendingStatus.body.manualSupportRequired, false);
  assert.equal(Object.hasOwn(pendingStatus.body, "cleanupObjectKey"), false);

  const switchedWorkspace = await request("/api/v1/me", {
    method: "PATCH",
    headers: {
      ...ownerA,
      "Content-Type": "application/json",
      "Idempotency-Key": "avatar-status-switch-shared",
    },
    body: JSON.stringify({ organizationId: "org-avatar-shared" }),
  });
  assert.equal(
    switchedWorkspace.response.status,
    200,
    JSON.stringify(switchedWorkspace.body),
  );
  assert.equal(switchedWorkspace.body.user.currentWorkspaceId, "org-avatar-shared");
  const sharedWorkspaceStatus = await request("/api/v1/me/avatar/cleanup", {
    headers: ownerA,
  });
  assert.equal(
    sharedWorkspaceStatus.response.status,
    200,
    JSON.stringify(sharedWorkspaceStatus.body),
  );
  assert.equal(sharedWorkspaceStatus.body.userId, "user-avatar-a");
  assert.equal(sharedWorkspaceStatus.body.workspaceId, "org-avatar-shared");
  assert.equal(sharedWorkspaceStatus.body.status, "not_required");
  assert.notEqual(sharedWorkspaceStatus.body.operationId, deleted.body.operationId);

  const switchedBack = await request("/api/v1/me", {
    method: "PATCH",
    headers: {
      ...ownerA,
      "Content-Type": "application/json",
      "Idempotency-Key": "avatar-status-switch-primary",
    },
    body: JSON.stringify({ organizationId: "org-avatar-a" }),
  });
  assert.equal(switchedBack.response.status, 200, JSON.stringify(switchedBack.body));
  assert.equal(switchedBack.body.user.currentWorkspaceId, "org-avatar-a");

  const otherOwnerStatus = await request("/api/v1/me/avatar/cleanup", {
    headers: ownerB,
  });
  assert.equal(otherOwnerStatus.response.status, 200, JSON.stringify(otherOwnerStatus.body));
  assert.equal(otherOwnerStatus.body.userId, "user-avatar-b");
  assert.equal(otherOwnerStatus.body.workspaceId, "org-avatar-b");
  assert.notEqual(otherOwnerStatus.body.operationId, deleted.body.operationId);
  assert.doesNotMatch(JSON.stringify(otherOwnerStatus.body), /user-avatar-a/);

  const completedCleanup = await waitForCleanup(
    deleted.body.operationId,
    "completed",
  );
  const deletedObjectPath = path.join(
    dataDir,
    "objects",
    ...completedCleanup.cleanupObjectKey
      .split("/")
      .filter(Boolean)
      .map((part) => path.basename(part)),
  );
  assert.equal(fs.existsSync(deletedObjectPath), false);
  const completedStatus = await request("/api/v1/me/avatar/cleanup", {
    headers: ownerA,
  });
  assert.equal(completedStatus.response.status, 200, JSON.stringify(completedStatus.body));
  assert.equal(completedStatus.body.userId, "user-avatar-a");
  assert.equal(completedStatus.body.workspaceId, "org-avatar-a");
  assert.equal(completedStatus.body.status, "completed");
  assert.equal(completedStatus.body.operationId, deleted.body.operationId);
  assert.equal(completedStatus.body.manualSupportRequired, false);

  const deleteReplay = await request("/api/v1/me/avatar", {
    method: "DELETE",
    headers: {
      ...ownerA,
      "Content-Type": "application/json",
      "Idempotency-Key": deleteKey,
    },
    body: JSON.stringify({ expectedAvatarFileId: created.body.avatar.fileId }),
  });
  assert.equal(deleteReplay.response.status, 200, JSON.stringify(deleteReplay.body));
  assert.equal(deleteReplay.body.replayed, true);
  assert.equal(deleteReplay.body.cleanup.status, "completed");

  const ownerAThirdSession = await login("a");
  const crossSessionDeleteReplay = await request("/api/v1/me/avatar", {
    method: "DELETE",
    headers: {
      ...ownerAThirdSession,
      "Content-Type": "application/json",
      "Idempotency-Key": deleteKey,
    },
    body: JSON.stringify({ expectedAvatarFileId: created.body.avatar.fileId }),
  });
  assert.equal(
    crossSessionDeleteReplay.response.status,
    409,
    JSON.stringify(crossSessionDeleteReplay.body),
  );
  assert.equal(
    crossSessionDeleteReplay.body.error.code,
    "AUTH_SESSION_REPLACED",
  );

  const noAvatar = await request("/api/v1/me/avatar", { headers: ownerA });
  assert.equal(noAvatar.response.status, 404);

  const persisted = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  assert.equal(
    persisted.auditLogs.filter((entry) => entry.action === "account.avatar.update").length,
    2,
  );
  assert.equal(
    persisted.auditLogs.filter((entry) => entry.action === "account.avatar.delete").length,
    1,
  );
  assert.equal(
    persisted.storageFiles.filter((file) => file.createdByUserId === "user-avatar-a").length,
    1,
  );
  const ownerAOperations = persisted.avatarMutationOperations.filter(
    (operation) => operation.userId === "user-avatar-a",
  );
  assert.equal(ownerAOperations.length, 3);
  assert.equal(
    ownerAOperations.filter(
      (operation) =>
        operation.cleanupKind === "staged_rollback" &&
        operation.cleanupStatus === "completed",
    ).length,
    1,
  );
}

async function main() {
  seedDb();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: port,
      AUDIO_UDP_PORT: "3442",
      DATA_BACKEND: "json",
      DATA_DIR: dataDir,
      AUTH_MODE: "demo",
      RATE_LIMIT_PER_MINUTE: "5000",
      FIREBASE_AUTH_ENABLED: "false",
      OBJECT_STORAGE_PROVIDER: "local",
      LOCAL_OBJECT_STORAGE_DIR: path.join(dataDir, "objects"),
      AVATAR_CLEANUP_INTERVAL_MS: "1000",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  try {
    await waitForHealth();
    await runScenario();
    console.log("avatar API smoke test passed");
  } finally {
    child.kill();
    await delay(250);
    if (stderr) process.stderr.write(stderr);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
