const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "src", "main.cpp"), "utf8");
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "audio_capture_task_v1.json"),
    "utf8",
  ),
);

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

assert.equal(fixture.version, 1);
assert.match(source, new RegExp(`AUDIO_CAPTURE_QUEUE_CAPACITY = ${fixture.queueCapacity}`));
assert.match(source, /xQueueCreateStatic\(/);
assert.match(source, /AudioCaptureItem audioCaptureQueueStorage\[AUDIO_CAPTURE_QUEUE_CAPACITY\]/);
assert.match(source, /xTaskCreatePinnedToCore\(/);
assert.match(source, /class BoundedSecureCloudTcpClient/);
assert.match(source, /CLOUD_SOCKET_CONNECT_TIMEOUT_MS = 1000/);
assert.match(source, /CLOUD_SOCKET_IO_TIMEOUT_SECONDS = 1/);
assert.match(source, /CLOUD_SOCKET_HANDSHAKE_TIMEOUT_SECONDS = 1/);
assert.match(
  source,
  /client\.connect\(\s*host\.c_str\(\), port, CLOUD_SOCKET_CONNECT_TIMEOUT_MS\)/,
);
assert.match(
  source,
  /void send\(const uint8_t\s*\*data, const uint32_t len\) override/,
);
assert.match(source, /const size_t written = client\.write\(data, len\)/);
assert.match(source, /void beginObservedWrite\(\)/);
assert.match(source, /bool consumeObservedWriteComplete\(\)/);
assert.match(
  source,
  /observedWriteActualBytes == observedWriteExpectedBytes &&\s*client\.connected\(\)/,
);

const capture = section("void captureI2sFrame() {", "void audioCaptureTask(");
assert.match(capture, /i2s_read\(/);
assert.match(capture, /updateI2sSlotDiagnostics\(micBuffer, samplesRead\)/);
assert.match(
  capture,
  /const std::uint8_t nextCaptureSlot = shcare::selectAudioCaptureSlot\(/,
);
assert.match(capture, /micBuffer\[sampleOffset \+ selectedAudioCaptureSlot\]/);
assert.doesNotMatch(capture, /rawMixed|\(\(int64_t\)rawA \+ rawB\) \/ 2/);
assert.match(capture, /xQueueSend\(audioCaptureQueue, &item, 0\)/);
assert.doesNotMatch(
  capture,
  /cloudSocket|sendAudioCloud|sendAudioUdp|sendCloud|connectCloud|handleCloud|WiFi\.|new\s|malloc\s*\(/,
);

const captureTask = section(
  "void audioCaptureTask(void *context) {",
  "bool startAudioCaptureTask() {",
);
assert.match(captureTask, /captureI2sFrame\(\)/);
assert.doesNotMatch(
  captureTask,
  /cloudSocket|sendAudioCloud|sendAudioUdp|sendCloud|connectCloud|handleCloud|WiFi\./,
);

const sender = section(
  "void drainAudioCaptureQueue(std::size_t maxPackets) {",
  "void startMdns()",
);
assert.match(sender, /cloudSocket\.sendBinary\(/);
assert.match(sender, /boundedCloudTcpClient->beginObservedWrite\(\)/);
assert.match(
  sender,
  /boundedCloudTcpClient->consumeObservedWriteComplete\(\)/,
);
assert.match(
  sender,
  /websocketAccepted && transportWriteComplete/,
);
const verifiedWriteSuccess = sender.indexOf(
  "if (websocketAccepted && transportWriteComplete)",
);
const sentCounterIncrement = sender.indexOf("++wsPacketsSent", verifiedWriteSuccess);
assert.ok(verifiedWriteSuccess >= 0 && sentCounterIncrement > verifiedWriteSuccess);
assert.match(sender, /boundedCloudTcpClient->forceClose\(\)/);
assert.match(sender, /cloudSocket\.available\(\)/);
assert.match(sender, /item\.sessionGeneration == audioSessionGeneration/);
assert.match(sender, /sendAudioUdp\(item\.pcm, item\.sampleCount\)/);
assert.match(sender, /shcare::kAudioV2FlagStart/);
assert.match(sender, /shcare::kAudioV2FlagDiscontinuity/);
assert.match(
  source,
  new RegExp(`AUDIO_CAPTURE_MAX_FRAME_AGE_MS = ${fixture.maxFrameAgeMs}`),
);

const cloudConnect = section(
  "void connectCloudSocketIfNeeded()",
  "void handleCloudSocket()",
);
assert.match(
  cloudConnect,
  /cloudSocket\.connect\(String\(backendHost\), backendPort, String\("\/esp"\)\)/,
);

const pause = section(
  "bool pauseAudioCaptureTask() {",
  "void resumeAudioCaptureTask() {",
);
assert.match(
  source,
  new RegExp(`AUDIO_CAPTURE_PAUSE_TIMEOUT_MS = ${fixture.pauseTimeoutMs}`),
);
assert.match(pause, /xSemaphoreTake\(audioCapturePausedAck,/);
const release = section("bool releaseI2SDriver() {", "void scheduleI2sRetry(");
assert.match(release, /pauseAudioCaptureTask\(\)/);
assert.ok(release.indexOf("pauseAudioCaptureTask()") < release.indexOf("i2s_stop("));

const setup = section("void setup() {", "void loop() {");
assert.ok(
  setup.indexOf("startAudioCaptureTask()") < setup.indexOf("setupWiFi()"),
  "capture task must start before setup WiFi can enter a blocking recovery portal",
);
assert.match(
  setup,
  /if \(!startAudioCaptureTask\(\)\) \{\s*markI2sCaptureDegraded\("AUDIO_CAPTURE_TASK_START_FAILED"\)/,
);
const portal = section("void runSetupPortal(", "String jsonEscape(");
const runtimeLoop = source.slice(source.indexOf("void loop() {"));
assert.doesNotMatch(portal, /captureI2sFrame\(\)/);
assert.doesNotMatch(runtimeLoop, /captureI2sFrame\(\)/);
assert.match(
  runtimeLoop,
  new RegExp(`drainAudioCaptureQueue\\(${fixture.maxDrainPerLoop}\\)`),
);

console.log("Dedicated bounded audio capture task source contract: PASS");
