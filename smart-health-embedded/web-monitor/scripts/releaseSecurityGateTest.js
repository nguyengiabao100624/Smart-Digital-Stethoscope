"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");

const {
  assertRuntimeSecurity,
  getRuntimeSecurityViolations,
  resolveAuthMode,
} = require("../src/runtimeSecurity");
const {
  postOutboundWebhook,
  validateOutboundWebhookTarget,
} = require("../src/outboundWebhookSecurity");
const { getClientIp } = require("../src/requestContext");

const rootDir = path.join(__dirname, "..");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function cleanChildEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const key of [
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "FIREBASE_PROJECT_ID",
  ]) {
    if (!(key in overrides)) delete env[key];
  }
  return env;
}

async function waitForHealth(port) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("test backend did not become healthy");
}

async function withDemoServer(overrides, callback) {
  const port = await reservePort();
  const audioPort = await reservePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-release-security-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: cleanChildEnv({
      NODE_ENV: "test",
      AUTH_MODE: "demo",
      ALLOW_DEMO_AUTH: "false",
      FIREBASE_AUTH_ENABLED: "false",
      DATA_BACKEND: "json",
      DATA_DIR: dataDir,
      PORT: String(port),
      AUDIO_UDP_PORT: String(audioPort),
      ...overrides,
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  try {
    await waitForHealth(port);
    return await callback({ port });
  } catch (error) {
    error.message += `\nbackend stderr: ${stderr}`;
    throw error;
  } finally {
    child.kill("SIGTERM");
    await delay(250);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

test("production auth configuration fails closed before network startup", async () => {
  assert.equal(resolveAuthMode({ NODE_ENV: "production" }), "production");
  assert.throws(
    () => assertRuntimeSecurity({ NODE_ENV: "production", AUTH_MODE: "demo" }),
    (error) => error.code === "PRODUCTION_AUTH_CONFIGURATION_INVALID",
  );
  assert.deepEqual(
    getRuntimeSecurityViolations({
      NODE_ENV: "production",
      AUTH_MODE: "production",
      ALLOW_DEMO_AUTH: "false",
      FIREBASE_AUTH_ENABLED: "false",
    }),
    [
      "production runtime requires Firebase Admin project and service-account credentials",
      "production runtime requires PHI_ENCRYPTION_KEY with at least 32 characters",
    ],
  );

  assert.deepEqual(
    getRuntimeSecurityViolations({
      NODE_ENV: "production",
      AUTH_MODE: "production",
      ALLOW_DEMO_AUTH: "false",
      FIREBASE_AUTH_ENABLED: "true",
      FIREBASE_PROJECT_ID: "shcare-test",
      FIREBASE_SERVICE_ACCOUNT_JSON: "{}",
      PHI_ENCRYPTION_KEY: "too-short",
    }),
    ["production runtime requires PHI_ENCRYPTION_KEY with at least 32 characters"],
  );

  const port = await reservePort();
  const audioPort = await reservePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: cleanChildEnv({
      NODE_ENV: "production",
      AUTH_MODE: "production",
      ALLOW_DEMO_AUTH: "false",
      FIREBASE_AUTH_ENABLED: "false",
      PORT: String(port),
      AUDIO_UDP_PORT: String(audioPort),
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  const exitCode = await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5000).then(() => "timeout"),
  ]);
  if (exitCode === "timeout") child.kill("SIGTERM");
  assert.notEqual(exitCode, "timeout", "unsafe production process must exit before binding");
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /Unsafe runtime configuration/);

  const dockerfile = fs.readFileSync(path.join(rootDir, "Dockerfile"), "utf8");
  assert.match(dockerfile, /^ENV AUTH_MODE=production$/m);
  assert.match(dockerfile, /^ENV ALLOW_DEMO_AUTH=false$/m);
});

test("public JSON routes reject oversized bodies while normal contact remains available", async () => {
  await withDemoServer({ MAX_JSON_BODY_BYTES: "4096" }, async ({ port }) => {
    const oversized = await fetch(`http://127.0.0.1:${port}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Mallory",
        email: "mallory@example.test",
        message: "x".repeat(6000),
      }),
    });
    assert.equal(oversized.status, 413);

    const normal = await fetch(`http://127.0.0.1:${port}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice",
        email: "alice@example.test",
        message: "Xin tư vấn giải pháp Shcare.",
      }),
    });
    assert.equal(normal.status, 201);
  });
});

test("rate-limit identity ignores spoofed forwarding headers unless proxy hops are explicit", () => {
  const request = {
    headers: { "x-forwarded-for": "198.51.100.10, 203.0.113.20" },
    socket: { remoteAddress: "10.0.0.5" },
  };
  assert.equal(getClientIp(request, {}), "10.0.0.5");
  assert.equal(getClientIp(request, { TRUST_PROXY_HOPS: "1" }), "203.0.113.20");
  assert.equal(getClientIp(request, { TRUST_PROXY_HOPS: "2" }), "198.51.100.10");
  assert.equal(getClientIp(request, { TRUST_PROXY_HOPS: "3" }), "10.0.0.5");
});

test("workspace webhook requires an approved exact origin and bounded no-redirect fetch", async () => {
  assert.throws(
    () => validateOutboundWebhookTarget("https://hooks.example.test/send", {
      env: { NODE_ENV: "production" },
      tenantManaged: true,
    }),
    (error) => error.code === "OUTBOUND_WEBHOOK_DESTINATION_NOT_ALLOWED",
  );
  assert.equal(
    validateOutboundWebhookTarget("https://hooks.example.test/send", {
      env: {
        NODE_ENV: "production",
        OUTBOUND_WEBHOOK_ALLOWED_ORIGINS: "https://hooks.example.test",
      },
      tenantManaged: true,
    }),
    "https://hooks.example.test/send",
  );
  assert.throws(
    () => validateOutboundWebhookTarget("http://127.0.0.1/internal", {
      env: { NODE_ENV: "production", OUTBOUND_WEBHOOK_ALLOWED_ORIGINS: "http://127.0.0.1" },
      tenantManaged: true,
    }),
    (error) => error.code === "OUTBOUND_WEBHOOK_DESTINATION_INVALID",
  );

  let capturedOptions;
  const result = await postOutboundWebhook({
    url: "https://hooks.example.test/send",
    bodyText: "{}",
    headers: { "Content-Type": "application/json" },
    tenantManaged: true,
    env: {
      NODE_ENV: "production",
      OUTBOUND_WEBHOOK_ALLOWED_ORIGINS: "https://hooks.example.test",
      OUTBOUND_WEBHOOK_MAX_RESPONSE_BYTES: "1024",
    },
    fetchImpl: async (_url, options) => {
      capturedOptions = options;
      return new Response("accepted", { status: 200 });
    },
  });
  assert.equal(result.responseText, "accepted");
  assert.equal(capturedOptions.redirect, "error");
  assert.equal(capturedOptions.method, "POST");
  assert.ok(capturedOptions.signal instanceof AbortSignal);

  await assert.rejects(
    postOutboundWebhook({
      url: "https://hooks.example.test/send",
      tenantManaged: true,
      env: {
        NODE_ENV: "production",
        OUTBOUND_WEBHOOK_ALLOWED_ORIGINS: "https://hooks.example.test",
        OUTBOUND_WEBHOOK_MAX_RESPONSE_BYTES: "1024",
      },
      fetchImpl: async () => new Response("x".repeat(2048), { status: 200 }),
    }),
    (error) => error.code === "OUTBOUND_WEBHOOK_RESPONSE_TOO_LARGE",
  );
});
