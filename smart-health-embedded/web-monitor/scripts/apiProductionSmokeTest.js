const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listFilesRecursively(rootPath) {
  if (!fs.existsSync(rootPath)) return [];
  return fs.readdirSync(rootPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootPath, entry.name);
    return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
  });
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
  const testDataDir = `.test-data/api-production-${process.pid}-${Date.now()}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: port,
      AUDIO_UDP_PORT: "3427",
      DATA_BACKEND: "json",
      DATA_DIR: testDataDir,
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
      body: JSON.stringify({ login: "doctor@example.com", password: "12345678", role: "doctor" }),
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();
    const auth = { Authorization: `Bearer ${login.token}` };

    // Resolve a device from the authenticated tenant instead of relying on a
    // retired fixture id.  The seed set intentionally evolves (for example
    // `shcare-g3-hil` replaced `esp32-stethoscope`), while the scan contract
    // must exercise the same authorization path as production clients.
    const devicesResponse = await fetch(`http://127.0.0.1:${port}/api/v1/devices`, { headers: auth });
    assert.equal(devicesResponse.status, 200);
    const devicesPayload = await devicesResponse.json();
    const smokeDevice = (devicesPayload.devices || []).find((item) => item?.id);
    assert.ok(smokeDevice?.id, "the authenticated seed must expose a usable device");

    const createResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        patientName: "Smoke Patient",
        mode: "heart",
        deviceId: smokeDevice.id,
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();

    const chunk = Buffer.alloc(1600);
    const chunkHash = crypto.createHash("sha256").update(chunk).digest("hex");
    const chunkHeaders = {
      ...auth,
      "Idempotency-Key": "api-smoke-chunk-0",
      "X-Chunk-Sequence": "0",
      "X-Chunk-SHA256": chunkHash,
    };
    const oversizedChunk = Buffer.alloc(1024 * 1024 + 1);
    const oversizedResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/audio-chunks`, {
      method: "POST",
      headers: {
        ...auth,
        "Idempotency-Key": "api-smoke-chunk-oversized",
        "X-Chunk-Sequence": "0",
        "X-Chunk-SHA256": crypto.createHash("sha256").update(oversizedChunk).digest("hex"),
      },
      body: oversizedChunk,
    });
    assert.equal(oversizedResponse.status, 413);
    const oversizedError = await oversizedResponse.json();
    assert.equal(oversizedError.error.code, "REQUEST_BODY_TOO_LARGE");

    const chunkResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/audio-chunks`, {
      method: "POST",
      headers: chunkHeaders,
      body: chunk,
    });
    assert.equal(chunkResponse.status, 200);
    const acceptedChunk = await chunkResponse.json();
    assert.equal(acceptedChunk.replayed, false);

    const duplicateChunkResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/audio-chunks`, {
      method: "POST",
      headers: chunkHeaders,
      body: chunk,
    });
    assert.equal(duplicateChunkResponse.status, 200);
    const duplicateChunk = await duplicateChunkResponse.json();
    assert.equal(duplicateChunk.replayed, true);
    assert.equal(duplicateChunk.uploadedBytes, acceptedChunk.uploadedBytes);

    const mismatchedChunk = Buffer.from("different-payload");
    const mismatchResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/audio-chunks`, {
      method: "POST",
      headers: {
        ...chunkHeaders,
        "X-Chunk-SHA256": crypto.createHash("sha256").update(mismatchedChunk).digest("hex"),
      },
      body: mismatchedChunk,
    });
    assert.equal(mismatchResponse.status, 409);

    const gapResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/audio-chunks`, {
      method: "POST",
      headers: {
        ...auth,
        "Idempotency-Key": "api-smoke-chunk-2",
        "X-Chunk-Sequence": "2",
        "X-Chunk-SHA256": chunkHash,
      },
      body: chunk,
    });
    assert.equal(gapResponse.status, 409);

    const chunkStorageRoot = path.join(rootDir, testDataDir, "tmp", "scan-audio-chunks");
    assert.equal(
      listFilesRecursively(chunkStorageRoot).length,
      1,
      "rejected chunk writes must not leave uncommitted PCM files",
    );

    const completeResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/complete`, {
      method: "POST",
      headers: { ...auth, "Idempotency-Key": "api-smoke-complete" },
    });
    assert.equal(completeResponse.status, 200);
    const completed = await completeResponse.json();

    const replayCompleteResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/complete`, {
      method: "POST",
      headers: { ...auth, "Idempotency-Key": "api-smoke-complete" },
    });
    assert.equal(replayCompleteResponse.status, 200);
    assert.deepEqual(await replayCompleteResponse.json(), completed);
    assert.equal(
      listFilesRecursively(chunkStorageRoot).length,
      0,
      "completed uploads must purge transient PCM chunk files",
    );

    const urlResponse = await fetch(`http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/audio-url`, {
      headers: auth,
    });
    assert.equal(urlResponse.status, 200);
    const audioAccess = await urlResponse.json();
    assert.equal(audioAccess.contentType, "audio/wav");
    assert.equal(audioAccess.fileName, `${created.scan.id}.wav`);
    assert.equal(typeof audioAccess.url, "string");
    assert.ok(audioAccess.url);

    const waveformResponse = await fetch(
      `http://127.0.0.1:${port}/api/v1/scans/${created.scan.id}/waveform`,
      { headers: auth },
    );
    assert.equal(waveformResponse.status, 200);
    const waveformPayload = await waveformResponse.json();
    assert.equal(waveformPayload.waveform.scanId, created.scan.id);
    assert.equal(waveformPayload.waveform.sampleRate, 16000);
    assert.ok(Array.isArray(waveformPayload.waveform.points));
    assert.ok(waveformPayload.waveform.points.length > 0);
    assert.ok(waveformPayload.waveform.points.length <= 256);
    assert.equal(
      waveformPayload.waveform.points.every(
        (point) => Number.isFinite(point) && point >= 0 && point <= 1,
      ),
      true,
    );
    console.log("api production smoke test passed");
  } finally {
    child.kill();
    fs.rmSync(path.join(rootDir, testDataDir), { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
