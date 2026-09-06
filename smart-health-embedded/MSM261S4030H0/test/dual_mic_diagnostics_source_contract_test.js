const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "src", "main.cpp"), "utf8");
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures", "dual_mic_diagnostics_v1.json"),
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

function saturatingAdd(current, increment) {
  return Math.min(0xffffffff, current + increment);
}

function summarizeWindow(samples, previous) {
  const sumSquares = samples.reduce((sum, sample) => sum + sample * sample, 0);
  const peak = samples.reduce(
    (maximum, sample) => Math.max(maximum, Math.abs(sample)),
    0,
  );
  const nonZero = samples.filter((sample) => sample !== 0).length;
  return {
    rms: Math.floor(Math.sqrt(sumSquares / samples.length)),
    peak,
    windowCount: saturatingAdd(previous.windowCount, 1),
    activeWindowCount: saturatingAdd(
      previous.activeWindowCount,
      Math.floor(Math.sqrt(sumSquares / samples.length)) >= 96 && peak >= 256
        ? 1
        : 0,
    ),
    sampleCount: saturatingAdd(previous.sampleCount, samples.length),
    nonZeroSampleCount: saturatingAdd(previous.nonZeroSampleCount, nonZero),
  };
}

assert.equal(fixture.version, 2);
let slot0 = {
  rms: 0,
  peak: 0,
  windowCount: 0,
  activeWindowCount: 0,
  sampleCount: 0,
  nonZeroSampleCount: 0,
};
let slot1 = { ...slot0 };
for (const window of fixture.windows) {
  slot0 = summarizeWindow(window.slot0, slot0);
  slot1 = summarizeWindow(window.slot1, slot1);
  assert.deepEqual(slot0, window.expected.slot0);
  assert.deepEqual(slot1, window.expected.slot1);
}

assert.match(source, /#define I2S_SCK 11/);
assert.match(source, /#define I2S_WS 12/);
assert.match(source, /#define I2S_SD 10/);
assert.match(source, /opposite L\/R select levels/);
assert.match(source, /#define I2S_CHANNEL_COUNT 2/);
assert.match(source, /I2S_CHANNEL_FMT_RIGHT_LEFT/);
assert.match(source, /I2S_LEFT_SLOT_INDEX = 0/);
assert.match(source, /I2S_RIGHT_SLOT_INDEX = 1/);
assert.match(source, /L\/R=GND emits the Left slot/);
assert.match(source, /L\/R=VDD \(3\.3 V\) emits the/);
assert.match(source, /interleaved \[Left, Right\]/);

const telemetry = section("String cloudTelemetryJson(const char *type) {", "void rejectCloudTransport(");
const diagnostics = section(
  "void updateI2sSlotDiagnostics(",
  "void captureI2sFrame()",
);
const capture = section("void captureI2sFrame() {", "void audioCaptureTask(");
const captureTask = section(
  "void audioCaptureTask(void *context) {",
  "bool startAudioCaptureTask() {",
);
const runtimeLoop = source.slice(source.indexOf("void loop() {"));

assert.match(source, /struct I2sSlotDiagnostics/);
for (const field of [
  "rms",
  "peak",
  "windowCount",
  "activeWindowCount",
  "sampleCount",
  "nonZeroSampleCount",
]) {
  assert.match(source, new RegExp(`std::uint32_t ${field} = 0`));
  assert.match(telemetry, new RegExp(`i2sSlot0${field[0].toUpperCase()}${field.slice(1)}`));
  assert.match(telemetry, new RegExp(`i2sSlot1${field[0].toUpperCase()}${field.slice(1)}`));
}

assert.match(diagnostics, /saturatingCounterAdd/);
assert.match(diagnostics, /sqrtf/);
assert.match(diagnostics, /sumSquares/);
assert.match(diagnostics, /nonZeroSampleCount/);
assert.match(diagnostics, /frameRms >= 96U && peak >= 256U/);
assert.match(capture, /updateI2sSlotDiagnostics\(micBuffer, samplesRead\)/);
assert.match(captureTask, /captureI2sFrame\(\)/);
assert.doesNotMatch(runtimeLoop, /captureI2sFrame\(\)/);
assert.match(
  capture,
  /selectAudioCaptureSlot/,
  "mono capture must choose a healthy physical slot instead of cancelling or attenuating two unequal channels",
);
assert.match(capture, /rawSelected/);
assert.doesNotMatch(capture, /rawMixed/);
assert.match(source, /Auscultation profile ready:/);
assert.match(source, /audioProfile/);
assert.match(source, /audioCaptureSlot/);
assert.match(source, /audioSignalQuality/);

for (const label of [
  ">i2sSlot0Rms:",
  ">i2sSlot0Peak:",
  ">i2sSlot0ActiveWindows:",
  ">i2sSlot1Rms:",
  ">i2sSlot1Peak:",
  ">i2sSlot1ActiveWindows:",
]) {
  assert.match(source, new RegExp(label));
}

assert.doesNotMatch(
  telemetry,
  /rawA|rawB|micBuffer|pcmBuffer|deviceSecret|wifiPass/,
  "telemetry diagnostics must contain aggregates only",
);
assert.doesNotMatch(
  diagnostics,
  /Serial\.(?:print|println|printf)/,
  "the metric calculator must never log individual samples",
);

console.log("dual-mic diagnostics source/golden contract: PASS");
