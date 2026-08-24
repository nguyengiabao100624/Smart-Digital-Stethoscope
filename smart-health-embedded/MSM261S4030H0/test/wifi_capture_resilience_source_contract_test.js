const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "src", "main.cpp"), "utf8");
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "wifi_capture_resilience_v1.json"),
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

function reconnectDelay(attemptCount, baseDelayMs, maxDelayMs) {
  let delayMs = Math.min(baseDelayMs, maxDelayMs);
  let remainingDoublings = attemptCount > 0 ? attemptCount - 1 : 0;
  while (remainingDoublings > 0 && delayMs < maxDelayMs) {
    delayMs = Math.min(delayMs * 2, maxDelayMs);
    remainingDoublings -= 1;
  }
  return delayMs;
}

assert.equal(fixture.version, 1);
for (const attempt of fixture.reconnect.attempts) {
  assert.equal(
    reconnectDelay(
      attempt.count,
      fixture.reconnect.baseDelayMs,
      fixture.reconnect.maxDelayMs,
    ),
    attempt.expectedDelayMs,
  );
}

const setupPortal = section(
  "void runSetupPortal(const char *reason) {",
  "String jsonEscape(",
);
const setupWifi = section("void setupWiFi()", "void setupAudioUdp()");
const reconnect = section("void handleWiFiReconnect()", "void setupWiFi()");
const capture = section("void captureI2sFrame() {", "void audioCaptureTask(");
const captureTask = section(
  "void audioCaptureTask(void *context) {",
  "bool startAudioCaptureTask() {",
);
const runtimeSetup = section("void setup() {", "void loop() {");
const runtimeLoop = source.slice(source.indexOf("void loop() {"));

assert.match(
  source,
  new RegExp(
    `WIFI_RECONNECT_BASE_MS = ${fixture.reconnect.baseDelayMs}`,
  ),
);
assert.match(
  source,
  new RegExp(`WIFI_RECONNECT_MAX_MS = ${fixture.reconnect.maxDelayMs}`),
);
assert.match(reconnect, /shcare::reconnectBackoffDelayMs\(/);
assert.match(reconnect, /WiFi\.begin\(wifiSsid, wifiPass\)/);
assert.doesNotMatch(reconnect, /while\s*\(/);
assert.doesNotMatch(reconnect, /delay\s*\(/);
assert.doesNotMatch(reconnect, /runSetupPortal\s*\(/);
assert.doesNotMatch(reconnect, /wifiPass[^;\n]*Serial|Serial[^;\n]*wifiPass/);

assert.match(setupWifi, /runSetupPortal\("WiFi SSID is missing\."\)/);
assert.match(
  setupWifi,
  /runSetupPortal\("Physical setup gesture requested WiFi recovery\."\)/,
);
assert.doesNotMatch(setupWifi, /WIFI_CONNECT_TIMEOUT_MS/);
assert.doesNotMatch(setupWifi, /while\s*\(/);
assert.doesNotMatch(
  setupWifi,
  /runSetupPortal\("Cannot connect to the configured WiFi network\."\)/,
);

const portalCaptureCalls = setupPortal.match(/captureI2sFrame\(\);/g) || [];
assert.equal(
  portalCaptureCalls.length,
  fixture.setupPortal.directCaptureCalls,
  "the setup portal must rely on the independent capture task",
);
assert.ok(
  runtimeSetup.indexOf("startAudioCaptureTask()") <
    runtimeSetup.indexOf("setupWiFi()"),
  "capture task must start before setup WiFi may block in the recovery portal",
);

assert.match(capture, /i2s_read\(/);
assert.match(capture, /updateI2sSlotDiagnostics\(micBuffer, samplesRead\)/);
assert.match(
  capture,
  /const int32_t rawMixed = \(int32_t\)\(\(\(int64_t\)rawA \+ rawB\) \/ 2\)/,
  "the canonical averaged mono PCM source must remain unchanged",
);
assert.match(capture, /xQueueSend\(audioCaptureQueue, &item, 0\)/);
assert.doesNotMatch(capture, /sendAudioCloud|cloudSocket|sendAudioUdp/);
assert.match(captureTask, /captureI2sFrame\(\)/);

assert.doesNotMatch(runtimeLoop, /setupWiFi\(\)/);
assert.doesNotMatch(runtimeLoop, /captureI2sFrame\(\)/);
assert.match(runtimeLoop, /drainAudioCaptureQueue\(2\)/);
assert.match(runtimeLoop, /handleWiFiReconnect\(\)/);
assert.ok(
  runtimeLoop.lastIndexOf("drainAudioCaptureQueue(2)") <
    runtimeLoop.lastIndexOf("handleWiFiReconnect()"),
  "network-owned queue draining must run before a scheduled reconnect attempt",
);

console.log("WiFi/capture resilience source/golden contract: PASS");
