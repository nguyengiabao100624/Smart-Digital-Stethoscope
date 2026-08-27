const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..", "..", "..");

const files = {
  backend: path.join(workspaceRoot, "smart-health-embedded", "web-monitor", "server.js"),
  backendAudioProtocol: path.join(
    workspaceRoot,
    "smart-health-embedded",
    "web-monitor",
    "src",
    "audioProtocolV2.js"
  ),
  firmware: path.join(workspaceRoot, "smart-health-embedded", "MSM261S4030H0", "src", "main.cpp"),
  androidLiveAudio: path.join(
    workspaceRoot,
    "smart-health-android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "example",
    "smart_health_android",
    "data",
    "LiveAudioClient.kt"
  ),
  androidLiveAudioContract: path.join(
    workspaceRoot,
    "smart-health-android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "example",
    "smart_health_android",
    "scan",
    "LiveAudioContract.kt"
  ),
  androidModels: path.join(
    workspaceRoot,
    "smart-health-android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "example",
    "smart_health_android",
    "data",
    "SmartHealthModels.kt"
  ),
};

const docs = [
  path.join(workspaceRoot, "docs", "khoaluan", "README.md"),
  path.join(workspaceRoot, "docs", "khoaluan", "01-system-contract.md"),
  path.join(workspaceRoot, "docs", "khoaluan", "02-audio-packet-and-realtime-contract.md"),
  path.join(workspaceRoot, "docs", "khoaluan", "03-demo-and-evidence-checklist.md"),
  path.join(workspaceRoot, "docs", "khoaluan", "04-test-matrix-and-gap-log.md"),
];

function readText(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${path.relative(workspaceRoot, file)}`);
  }
  return fs.readFileSync(file, "utf8");
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`Contract check failed: ${label}`);
  }
}

function assertMatches(text, pattern, label) {
  if (!pattern.test(text)) {
    throw new Error(`Contract check failed: ${label}`);
  }
}

function run() {
  const backend = readText(files.backend);
  const backendAudioProtocol = readText(files.backendAudioProtocol);
  const firmware = readText(files.firmware);
  const androidLiveAudio = readText(files.androidLiveAudio);
  const androidLiveAudioContract = readText(files.androidLiveAudioContract);
  const androidModels = readText(files.androidModels);

  for (const doc of docs) {
    readText(doc);
  }

  assertMatches(backend, /const SAMPLE_RATE = Number\(process\.env\.SAMPLE_RATE \|\| 16000\)/, "backend keeps 16 kHz sample-rate contract");
  assertMatches(backend, /const CHANNELS = 1/, "backend keeps mono channel contract");
  assertMatches(backend, /const BITS_PER_SAMPLE = 16/, "backend keeps PCM16 contract");
  assertMatches(backend, /const AUDIO_UDP_PORT = Number\(process\.env\.AUDIO_UDP_PORT \|\| 3001\)/, "backend keeps UDP 3001 fallback default");
  assertIncludes(backend, 'url.pathname === "/esp"', "backend exposes ESP WebSocket route");
  assertIncludes(backend, 'url.pathname === "/device"', "backend exposes device WebSocket route");
  assertIncludes(backend, 'url.pathname === "/listen"', "backend exposes listener WebSocket route");
  assertIncludes(backend, 'url.pathname === "/app"', "backend exposes app WebSocket route");
  assertIncludes(backend, 'type: "status"', "backend emits status event");
  assertIncludes(backend, 'type: "metrics"', "backend emits metrics event");
  assertIncludes(backend, 'frameEncoding: "shcare_audio_v2"', "backend advertises the canonical SHC2 listener encoding");
  assertIncludes(backend, "decodeAudioFrameV2(payload)", "backend validates authenticated SHC2 device frames");
  assertIncludes(backend, "sendBinary(listener, listenerFrame)", "backend fans out a source-bound SHC2 listener frame");
  assertIncludes(backend, "payload.length === 0 || payload.length % 2 !== 0", "backend rejects empty/odd PCM payloads");
  assertIncludes(backend, "writeWavFile(recording.rawFilePath, recording.wavFilePath, recording.bytes)", "backend writes WAV on scan stop");
  assertIncludes(backendAudioProtocol, 'Buffer.from("SHC2", "ascii")', "backend SHC2 codec keeps the protocol magic");
  assertIncludes(backendAudioProtocol, "function decodeAudioFrameV2(frame)", "backend has a strict SHC2 decoder");
  assertIncludes(backendAudioProtocol, "function encodeAudioFrameV2({", "backend has a canonical SHC2 encoder");

  assertIncludes(firmware, "#define SAMPLE_RATE 16000", "firmware keeps 16 kHz sample-rate contract");
  assertIncludes(firmware, "#define BUFFER_LEN 128", "firmware keeps 128-sample packet size");
  assertIncludes(firmware, "#define I2S_WS 12", "firmware keeps MSM261 WS pin");
  assertIncludes(firmware, "#define I2S_SCK 11", "firmware keeps MSM261 SCK pin");
  assertIncludes(firmware, "#define I2S_SD 10", "firmware keeps MSM261 SD pin");
  assertIncludes(firmware, "int16_t pcm[BUFFER_LEN] = {}", "firmware queues bounded PCM16 capture frames");
  assertIncludes(firmware, "void drainAudioCaptureQueue(std::size_t maxPackets)", "firmware drains capture frames on the network loop");
  assertIncludes(firmware, "shcare::buildAudioFrameV2(", "firmware sends source-bound SHC2 frames");
  assertIncludes(firmware, "sendAudioUdp(item.pcm, item.sampleCount)", "firmware falls back to UDP audio");

  assertIncludes(androidLiveAudio, "class LiveAudioClient", "Android has live audio client");
  assertIncludes(androidLiveAudio, "override fun onMessage(webSocket: WebSocket, bytes: ByteString)", "Android handles binary SHC2 frames");
  assertIncludes(androidLiveAudio, "LiveAudioTextEventParser.parse(text, expected, currentIdentity)", "Android binds listener metadata to the expected source");
  assertIncludes(androidLiveAudio, "LiveAudioFrameDecoder.decode(bytes, identity)", "Android decodes SHC2 before PCM playback");
  assertIncludes(androidLiveAudio, 'AudioFormat.ENCODING_PCM_16BIT', "Android plays PCM16 audio");
  assertIncludes(androidLiveAudioContract, "object LiveAudioTextEventParser", "Android parses canonical listener events");
  assertIncludes(androidLiveAudioContract, "object LiveAudioFrameDecoder", "Android has a strict SHC2 frame decoder");
  assertIncludes(androidLiveAudioContract, "class LiveAudioSequenceGuard", "Android rejects replay, reordering, and unmarked gaps");
  assertIncludes(androidModels, "data class BackendStatus", "Android models backend status");
  assertIncludes(androidModels, "data class LiveMetrics", "Android models live metrics");

  const summary = {
    ok: true,
    checked: {
      docs: docs.map((file) => path.relative(workspaceRoot, file)),
      backend: path.relative(workspaceRoot, files.backend),
      backendAudioProtocol: path.relative(workspaceRoot, files.backendAudioProtocol),
      firmware: path.relative(workspaceRoot, files.firmware),
      android: [
        path.relative(workspaceRoot, files.androidLiveAudio),
        path.relative(workspaceRoot, files.androidLiveAudioContract),
        path.relative(workspaceRoot, files.androidModels),
      ],
    },
  };
  console.log(JSON.stringify(summary, null, 2));
}

run();
