const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createStorageAdapter } = require("../src/storageAdapter");

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "smart-health-storage-"));
  const sourceFile = path.join(tmpDir, "audio.wav");
  fs.writeFileSync(sourceFile, Buffer.from("RIFF0000WAVEfmt "));
  const storage = createStorageAdapter({
    dataDir: tmpDir,
    env: {
      ...process.env,
      OBJECT_STORAGE_PROVIDER: process.env.OBJECT_STORAGE_PROVIDER || "local",
      LOCAL_OBJECT_STORAGE_DIR: path.join(tmpDir, "objects"),
    },
  });
  const result = await storage.putFile("org/test/patients/test/scans/test/audio.wav", sourceFile, "audio/wav");
  const url = await storage.getSignedUrl(result.objectKey, 60);
  if (!result.objectKey || !url) {
    throw new Error("storage smoke test failed");
  }
  const waveformKey = "org/test/patients/test/scans/test/waveform.json";
  const waveformBuffer = Buffer.from(
    JSON.stringify({
      scanId: "test",
      sampleRate: 16000,
      points: [0.1, 0.4, 0.2],
      generatedAt: "2026-07-27T05:30:00.000Z",
    }),
  );
  await storage.putBuffer(waveformKey, waveformBuffer, "application/json");
  assert.deepEqual(await storage.getBuffer(waveformKey, waveformBuffer.length), waveformBuffer);
  await assert.rejects(
    storage.getBuffer(waveformKey, waveformBuffer.length - 1),
    (error) => error?.code === "STORAGE_OBJECT_TOO_LARGE",
  );
  console.log("storage smoke test passed");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
