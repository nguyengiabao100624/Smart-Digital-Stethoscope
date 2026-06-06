const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(port) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error("backend did not start");
}

async function main() {
  const port = "3426";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: port,
      AUDIO_UDP_PORT: "3427",
      DATA_BACKEND: "json",
      DATA_DIR: ".test-data/api-production",
      AUTH_MODE: "demo",
      FIREBASE_AUTH_ENABLED: "false",
      OBJECT_STORAGE_PROVIDER: "local",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  try {
    await waitForHealth(port);
    const loginResponse = await fetch(`http://127.0.0.1:${port}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: "bacsytuan@benhvien.com", password: "12345678", role: "doctor" }),
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();
    const auth = { Authorization: `Bearer ${login.token}` };

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ patientName: "Smoke Patient", mode: "heart" }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();

    const chunk = Buffer.alloc(1600);
    const chunkResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/audio-chunks`, {
      method: "POST",
      headers: auth,
      body: chunk,
    });
    assert.equal(chunkResponse.status, 200);

    const completeResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/complete`, {
      method: "POST",
      headers: auth,
    });
    assert.equal(completeResponse.status, 200);

    const urlResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/audio-url`, {
      headers: auth,
    });
    assert.equal(urlResponse.status, 200);
    console.log("api production smoke test passed");
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
