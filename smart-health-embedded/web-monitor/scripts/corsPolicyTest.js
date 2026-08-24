const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  FIRST_PARTY_CORS_ORIGINS,
  getConfiguredCorsOrigins,
  resolveCorsOrigin,
} = require("../src/corsPolicy");

test("keeps live and current RC preview origins exact and first-party", () => {
  assert.deepEqual(FIRST_PARTY_CORS_ORIGINS, [
    "https://shcare.web.app",
    "https://shcare-admin.web.app",
    "https://shcare--rc2-web-6c6d79f6-fz0by6g2.web.app",
    "https://shcare-admin--rc2-admin-9a4855a4-8mb2r6z9.web.app",
  ]);
  const configured = getConfiguredCorsOrigins({
    CORS_ORIGIN: "https://tenant-console.example.test",
  });
  assert.deepEqual(configured, [
    "https://tenant-console.example.test",
    ...FIRST_PARTY_CORS_ORIGINS,
  ]);
});

test("returns only an exact allowed origin and denies unknown origins", () => {
  const env = { CORS_ORIGIN: "https://tenant-console.example.test" };
  assert.equal(
    resolveCorsOrigin(
      { origin: "https://shcare--rc2-web-6c6d79f6-fz0by6g2.web.app" },
      env,
    ),
    "https://shcare--rc2-web-6c6d79f6-fz0by6g2.web.app",
  );
  assert.equal(
    resolveCorsOrigin({ origin: "https://attacker.example.test" }, env),
    null,
  );
  assert.equal(resolveCorsOrigin({}, env), null);
});

test("preserves an explicit development wildcard", () => {
  assert.deepEqual(getConfiguredCorsOrigins({ CORS_ORIGIN: "*" }), ["*"]);
  assert.equal(resolveCorsOrigin({ origin: "https://any.example.test" }, { CORS_ORIGIN: "*" }), "*");
});

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function waitForHealth(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Ephemeral CORS backend did not become ready");
}

test("HTTP preflight echoes only the exact RC origin", async (context) => {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-cors-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_BACKEND: "json",
      DATA_DIR: dataDir,
      AUTH_MODE: "demo",
      ALLOW_DEMO_AUTH: "true",
      CORS_ORIGIN: "https://shcare-admin.web.app",
    },
    stdio: "ignore",
    windowsHide: true,
  });
  context.after(() => {
    child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await waitForHealth(`http://127.0.0.1:${port}/api/health`);

  const allowed = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://shcare--rc2-web-6c6d79f6-fz0by6g2.web.app",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(allowed.status, 204);
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "https://shcare--rc2-web-6c6d79f6-fz0by6g2.web.app",
  );

  const denied = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://attacker.example.test",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(denied.status, 204);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});
