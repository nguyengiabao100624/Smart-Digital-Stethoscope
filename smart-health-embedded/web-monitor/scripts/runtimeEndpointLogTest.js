"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRuntimeEndpointLogLines,
  normalizePublicHttpBaseUrl,
  resolveUdpAudioEnabled,
  toWebSocketEndpoint,
} = require("../src/runtimeEndpointLog");

test("UDP audio defaults off in production and remains an explicit local fallback", () => {
  assert.equal(resolveUdpAudioEnabled({ NODE_ENV: "production" }, "production"), false);
  assert.equal(resolveUdpAudioEnabled({ NODE_ENV: "test" }, "demo"), true);
  assert.equal(resolveUdpAudioEnabled({ ENABLE_UDP_AUDIO: "false" }, "demo"), false);
  assert.equal(
    resolveUdpAudioEnabled({ NODE_ENV: "production", ENABLE_UDP_AUDIO: "true" }, "production"),
    true,
  );
});

test("production startup advertises only sanitized HTTPS and WSS endpoints", () => {
  const lines = buildRuntimeEndpointLogLines({
    production: true,
    publicBackendUrl: "https://shcare.example.com/?token=must-not-leak#fragment",
    port: 3000,
    audioUdpPort: 3001,
    udpAudioEnabled: false,
    localUrls: ["http://localhost:3000"],
  });
  const output = lines.join("\n");

  assert.match(output, /Public backend: https:\/\/shcare\.example\.com/);
  assert.match(output, /App WebSocket: wss:\/\/shcare\.example\.com\/app/);
  assert.match(output, /ESP WebSocket: wss:\/\/shcare\.example\.com\/esp/);
  assert.match(output, /UDP audio fallback: disabled/);
  assert.doesNotMatch(output, /token|fragment|localhost|<this-computer-ip>|send PCM16/);
});

test("unsafe public endpoint values are never echoed to production logs", () => {
  assert.equal(normalizePublicHttpBaseUrl("https://user:secret@example.com"), "");
  assert.equal(toWebSocketEndpoint("file:///tmp/backend", "/esp"), "");

  const output = buildRuntimeEndpointLogLines({
    production: true,
    publicBackendUrl: "https://user:secret@example.com",
    port: 3000,
    audioUdpPort: 3001,
    udpAudioEnabled: false,
  }).join("\n");

  assert.match(output, /managed by the hosting provider/);
  assert.match(output, /authenticated WSS/);
  assert.doesNotMatch(output, /user|secret|example\.com|ws:\/\//);
});

test("development startup retains explicit LAN and UDP HIL guidance", () => {
  const lines = buildRuntimeEndpointLogLines({
    production: false,
    port: 3100,
    audioUdpPort: 3101,
    udpAudioEnabled: true,
    localUrls: ["http://localhost:3100", "http://192.168.1.20:3100"],
  });
  const output = lines.join("\n");

  assert.match(output, /Open http:\/\/localhost:3100/);
  assert.match(output, /ws:\/\/<this-computer-ip>:3100\/esp/);
  assert.match(output, /UDP firmware should send PCM16 audio .*:3101/);
});
