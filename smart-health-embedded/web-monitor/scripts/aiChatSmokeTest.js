const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { after, before, test } = require("node:test");
const { getAiProviderAvailability } = require("../src/aiProvider");
const { buildProductionReadiness } = require("../src/productionReadiness");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, ".test-data", "ai-chat");
const backendPort = 3464;
const providerPort = 3465;
const providerRequests = [];
let backend;
let provider;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function seedDb() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const createdAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(dataDir, "db.json"),
    JSON.stringify(
      {
        version: 1,
        createdAt,
        updatedAt: createdAt,
        organizations: [
          { id: "org_alpha", name: "Alpha Clinic", status: "active", createdAt, updatedAt: createdAt },
          { id: "org_beta", name: "Beta Clinic", status: "active", createdAt, updatedAt: createdAt },
        ],
        users: [
          {
            id: "usr_alpha",
            role: "workspace_admin",
            requestedRole: "workspace_admin",
            roleRequestStatus: "approved",
            accountStatus: "active",
            email: "alpha-ai@test.local",
            password: "12345678",
            organizationId: "org_alpha",
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "usr_beta",
            role: "doctor",
            requestedRole: "doctor",
            roleRequestStatus: "approved",
            accountStatus: "active",
            email: "beta-ai@test.local",
            password: "12345678",
            organizationId: "org_beta",
            createdAt,
            updatedAt: createdAt,
          },
        ],
        memberships: [
          { id: "mem_alpha", userId: "usr_alpha", organizationId: "org_alpha", role: "workspace_admin", createdAt },
          { id: "mem_beta", userId: "usr_beta", organizationId: "org_beta", role: "doctor", createdAt },
        ],
        chatMessages: [
          {
            id: "msg_alpha_existing",
            role: "user",
            content: "Alpha existing context",
            userId: "usr_alpha",
            organizationId: "org_alpha",
            createdAt,
          },
          {
            id: "msg_beta_private",
            role: "user",
            content: "Beta private AI history",
            userId: "usr_beta",
            organizationId: "org_beta",
            createdAt,
          },
          {
            id: "msg_legacy_rule_seed",
            role: "assistant",
            content: "Tín hiệu phổi bất thường cần đối chiếu với triệu chứng",
            createdAt,
          },
        ],
        idempotencyKeys: [],
        accessLogs: [],
        auditLogs: [],
        notifications: [],
        devices: [],
        patients: [],
        appointments: [],
        scans: [],
      },
      null,
      2,
    ),
  );
}

function startMockProvider() {
  provider = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? JSON.parse(raw) : {};
    providerRequests.push({
      authorization: req.headers.authorization || "",
      body,
    });
    if (req.headers.authorization !== "Bearer test-provider-secret") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const latestUser = [...(Array.isArray(body.messages) ? body.messages : [])]
      .reverse()
      .find((message) => message.role === "user");
    if (latestUser?.content === "trigger timeout") {
      await delay(1000);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: `provider-confirmed:${latestUser?.content || "empty"}`,
            },
          },
        ],
      }),
    );
  });
  return new Promise((resolve) => provider.listen(providerPort, "127.0.0.1", resolve));
}

async function waitForHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/v1/health`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("AI chat backend did not start");
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${backendPort}${pathname}`, options);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : {} };
}

async function login(email) {
  const result = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "12345678" }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.token;
}

function readPersistedDb() {
  return JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
}

before(async () => {
  seedDb();
  await startMockProvider();
  backend = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(backendPort),
      AUDIO_UDP_PORT: String(backendPort + 20),
      DATA_DIR: dataDir,
      DATA_BACKEND: "json",
      AUTH_MODE: "demo",
      ALLOW_DEMO_AUTH: "true",
      NODE_ENV: "test",
      AI_PROVIDER_NAME: "mock-clinical",
      AI_PROVIDER_ENDPOINT: `http://127.0.0.1:${providerPort}/v1/chat/completions`,
      AI_PROVIDER_API_KEY: "test-provider-secret",
      AI_PROVIDER_MODEL: "mock-model-v1",
      AI_PROVIDER_TIMEOUT_MS: "250",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForHealth();
});

after(async () => {
  if (backend && !backend.killed) backend.kill();
  if (provider) await new Promise((resolve) => provider.close(resolve));
});

test("AI provider configuration fails closed and readiness never exposes its credential", () => {
  const credential = "must-never-appear-in-readiness";
  const invalidAvailability = getAiProviderAvailability({
    NODE_ENV: "production",
    AI_PROVIDER_ENDPOINT: "http://127.0.0.1:9999/v1/chat/completions",
    AI_PROVIDER_API_KEY: credential,
    AI_PROVIDER_MODEL: "unsafe-local-model",
  });
  assert.equal(invalidAvailability.available, false);
  assert.equal(invalidAvailability.reason, "invalid_configuration");
  assert.equal(
    getAiProviderAvailability({
      NODE_ENV: "production",
      AI_PROVIDER_ENDPOINT: "https://provider.example/v1/chat/completions?api_key=must-not-be-in-url",
      AI_PROVIDER_API_KEY: credential,
      AI_PROVIDER_MODEL: "clinical-model",
    }).available,
    false,
    "provider credentials must come from the dedicated secret env, never the endpoint URL",
  );
  const readiness = buildProductionReadiness({
    NODE_ENV: "production",
    AI_PROVIDER_ENDPOINT: "https://provider.example/v1/chat/completions",
    AI_PROVIDER_API_KEY: credential,
    AI_PROVIDER_MODEL: "clinical-model",
  });
  const aiItem = readiness.items.find((item) => item.id === "ai.provider");
  assert.equal(aiItem.status, "pass");
  assert.equal(JSON.stringify(readiness).includes(credential), false);
});

test("configured AI chat persists only provider-confirmed tenant-scoped messages with safe replay", async () => {
  const alphaToken = await login("alpha-ai@test.local");
  const alphaHeaders = {
    Authorization: `Bearer ${alphaToken}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "ai-shared-key",
  };
  const initial = await requestJson("/api/v1/ai/chat", { headers: { Authorization: `Bearer ${alphaToken}` } });
  assert.equal(initial.response.status, 200, JSON.stringify(initial.body));
  assert.deepEqual(initial.body.availability, {
    available: true,
    status: "available",
    provider: "mock-clinical",
    model: "mock-model-v1",
    reason: "",
  });
  assert.deepEqual(initial.body.messages.map((message) => message.content), ["Alpha existing context"]);

  const message = "Tín hiệu phổi bị ran nổ thì xử lý sao?";
  const created = await requestJson("/api/v1/ai/chat", {
    method: "POST",
    headers: alphaHeaders,
    body: JSON.stringify({ message }),
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.message.content, `provider-confirmed:${message}`);
  assert.equal(created.body.message.provider, "mock-clinical");
  assert.equal(created.body.message.model, "mock-model-v1");
  assert.equal(created.body.messages.at(-2).content, message);
  assert.equal(created.body.messages.at(-1).content, `provider-confirmed:${message}`);
  assert.equal(created.body.messages.every((item) => item.userId === "usr_alpha" && item.organizationId === "org_alpha"), true);
  assert.equal(providerRequests.length, 1);
  assert.equal(providerRequests[0].authorization, "Bearer test-provider-secret");
  assert.equal(providerRequests[0].body.model, "mock-model-v1");
  assert.equal(
    providerRequests[0].body.messages.some((item) => item.content === "Beta private AI history"),
    false,
    "cross-tenant history must never be sent to the provider",
  );
  assert.equal(
    providerRequests[0].body.messages.some((item) => item.content.includes("Tín hiệu phổi bất thường cần đối chiếu")),
    false,
    "legacy rule diagnostics must not enter the provider context",
  );

  const replayed = await requestJson("/api/v1/ai/chat", {
    method: "POST",
    headers: alphaHeaders,
    body: JSON.stringify({ message }),
  });
  assert.equal(replayed.response.status, 200, JSON.stringify(replayed.body));
  assert.equal(replayed.body.idempotent, true);
  assert.deepEqual(replayed.body.messages, created.body.messages);
  assert.equal(providerRequests.length, 1, "safe replay must not call the provider twice");

  const mismatch = await requestJson("/api/v1/ai/chat", {
    method: "POST",
    headers: alphaHeaders,
    body: JSON.stringify({ message: "different request" }),
  });
  assert.equal(mismatch.response.status, 409, JSON.stringify(mismatch.body));
  assert.equal(mismatch.body.error.code, "IDEMPOTENCY_KEY_REUSED");
  assert.equal(providerRequests.length, 1);

  const persisted = readPersistedDb();
  assert.equal(persisted.chatMessages.filter((item) => item.userId === "usr_alpha" && item.content === message).length, 1);
  assert.equal(persisted.chatMessages.filter((item) => item.userId === "usr_alpha" && item.content === `provider-confirmed:${message}`).length, 1);
  assert.equal(persisted.auditLogs.filter((item) => item.action === "ai.chat" && item.resourceId === created.body.message.id).length, 1);
  assert.equal(persisted.accessLogs.filter((item) => item.action === "Sử dụng trợ lý AI" && item.userId === "usr_alpha").length, 1);
});

test("concurrent AI retries execute one provider request and one audited exchange", async () => {
  const alphaToken = await login("alpha-ai@test.local");
  const headers = {
    Authorization: `Bearer ${alphaToken}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "ai-concurrent-once",
  };
  const message = "Concurrent provider request";
  const providerCallsBefore = providerRequests.length;
  const responses = await Promise.all([
    requestJson("/api/v1/ai/chat", { method: "POST", headers, body: JSON.stringify({ message }) }),
    requestJson("/api/v1/ai/chat", { method: "POST", headers, body: JSON.stringify({ message }) }),
  ]);
  assert.deepEqual(responses.map(({ response }) => response.status), [200, 200]);
  assert.equal(responses.filter(({ body }) => body.idempotent === true).length, 1);
  assert.equal(providerRequests.length - providerCallsBefore, 1, "concurrent retries must not call the paid provider twice");
  const persisted = readPersistedDb();
  assert.equal(persisted.chatMessages.filter((item) => item.userId === "usr_alpha" && item.content === message).length, 1);
  assert.equal(
    persisted.auditLogs.filter((item) => item.action === "ai.chat" && item.metadata?.idempotencyKey === "ai-concurrent-once").length,
    1,
  );
});

test("the same Idempotency-Key is isolated across AI chat tenants", async () => {
  const betaToken = await login("beta-ai@test.local");
  const providerCallsBefore = providerRequests.length;
  const beta = await requestJson("/api/v1/ai/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "ai-shared-key",
    },
    body: JSON.stringify({ message: "Beta provider request" }),
  });
  assert.equal(beta.response.status, 200, JSON.stringify(beta.body));
  assert.equal(beta.body.message.content, "provider-confirmed:Beta provider request");
  assert.equal(beta.body.messages.every((item) => item.userId === "usr_beta" && item.organizationId === "org_beta"), true);
  assert.equal(providerRequests.length - providerCallsBefore, 1);
  const persisted = readPersistedDb();
  const aiEntries = persisted.idempotencyKeys.filter((item) => item.operation === "ai.chat");
  assert.equal(aiEntries.some((item) => item.scope === "usr_alpha:org_alpha" && item.key === "ai-shared-key"), true);
  assert.equal(aiEntries.some((item) => item.scope === "usr_beta:org_beta" && item.key === "ai-shared-key"), true);
});

test("provider timeout does not create local chat history or a success audit", async () => {
  const alphaToken = await login("alpha-ai@test.local");
  const before = readPersistedDb();
  const result = await requestJson("/api/v1/ai/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${alphaToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "ai-timeout",
    },
    body: JSON.stringify({ message: "trigger timeout" }),
  });
  assert.equal(result.response.status, 504, JSON.stringify(result.body));
  assert.equal(result.body.error.code, "AI_PROVIDER_TIMEOUT");
  const afterTimeout = readPersistedDb();
  assert.equal(afterTimeout.chatMessages.some((item) => item.content === "trigger timeout"), false);
  assert.equal(afterTimeout.auditLogs.filter((item) => item.action === "ai.chat").length, before.auditLogs.filter((item) => item.action === "ai.chat").length);
});
