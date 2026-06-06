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

async function postJson(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

async function main() {
  await testDemoAuth();
  await testProductionLocksDemoAuth();
  console.log("backend smoke tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
