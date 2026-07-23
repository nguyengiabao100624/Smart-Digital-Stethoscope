import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveAudioFrameGuard,
  LiveAudioIdentityGuard,
  appendWaveformSamples,
  decodeAudioFrameV2,
  parseAudioSessionMetadata,
  parseLiveMetricsMessage,
  parseLiveStatusMessage,
} from "../../src/lib/live-audio.ts";

const sessionPayload = {
  type: "audio.session",
  protocolVersion: 2,
  frameEncoding: "shcare_audio_v2",
  workspaceId: "workspace-001",
  patientId: "patient-001",
  deviceId: "device-001",
  scanId: "scan-001",
  sessionId: "session-001",
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  encoding: "pcm_s16le",
  startedAt: "2026-07-14T00:00:00.000Z",
};

const encoder = new TextEncoder();

function encodeFrame({
  sessionId = "session-001",
  scanId = "scan-001",
  sequence = 0,
  timestampMs = 1_783_987_200_123,
  flags = ["start"],
  samples = [-32768, 0, 32767],
}: {
  sessionId?: string;
  scanId?: string;
  sequence?: number;
  timestampMs?: number;
  flags?: Array<"start" | "end" | "discontinuity" | "retransmit">;
  samples?: number[];
} = {}) {
  const flagBits = {
    start: 1 << 0,
    end: 1 << 1,
    discontinuity: 1 << 2,
    retransmit: 1 << 3,
  } as const;
  const sessionBytes = encoder.encode(sessionId);
  const scanBytes = encoder.encode(scanId);
  const headerLength = 30 + sessionBytes.length + scanBytes.length;
  const buffer = new ArrayBuffer(headerLength + samples.length * 2);
  const bytes = new Uint8Array(buffer);
  bytes.set(encoder.encode("SHC2"), 0);
  const view = new DataView(buffer);
  view.setUint8(4, 2);
  view.setUint8(
    5,
    flags.reduce((mask, flag) => mask | flagBits[flag], 0),
  );
  view.setUint16(6, headerLength, false);
  view.setUint32(8, samples.length * 2, false);
  view.setUint32(12, sequence, false);
  view.setBigUint64(16, BigInt(timestampMs), false);
  view.setUint16(24, samples.length, false);
  view.setUint16(26, sessionBytes.length, false);
  view.setUint16(28, scanBytes.length, false);
  bytes.set(sessionBytes, 30);
  bytes.set(scanBytes, 30 + sessionBytes.length);
  samples.forEach((sample, index) => {
    view.setInt16(headerLength + index * 2, sample, true);
  });
  return buffer;
}

test("accepts only explicit, complete audio session identity", () => {
  assert.deepEqual(parseAudioSessionMetadata(sessionPayload), sessionPayload);
  assert.throws(
    () => parseAudioSessionMetadata({ ...sessionPayload, deviceId: "" }),
    /device/i,
  );
  assert.throws(
    () => parseAudioSessionMetadata({ ...sessionPayload, sampleRate: 8000 }),
    /16000/i,
  );
  assert.throws(
    () =>
      parseAudioSessionMetadata({
        ...sessionPayload,
        frameEncoding: "raw_pcm_s16le",
      }),
    /frame encoding/i,
  );
});

test("requires metadata before PCM and prevents source mixing", () => {
  const guard = new LiveAudioIdentityGuard();
  assert.throws(() => guard.requireSession(), /metadata/i);
  guard.acceptSession(parseAudioSessionMetadata(sessionPayload));
  assert.equal(guard.requireSession().sessionId, "session-001");
  assert.throws(
    () =>
      guard.acceptSession(
        parseAudioSessionMetadata({
          ...sessionPayload,
          sessionId: "session-002",
        }),
      ),
    /active source/i,
  );
  assert.throws(
    () =>
      guard.acceptSession(
        parseAudioSessionMetadata({
          ...sessionPayload,
          patientId: "patient-other",
        }),
      ),
    /active source/i,
  );
  guard.reset();
  guard.acceptSession(
    parseAudioSessionMetadata({ ...sessionPayload, sessionId: "session-002" }),
  );
  assert.equal(guard.requireSession().sessionId, "session-002");
});

test("bounds waveform history", () => {
  assert.deepEqual(appendWaveformSamples([1, 2, 3], [4, 5], 4), [2, 3, 4, 5]);
});

test("decodes the listener SHC2 envelope with explicit identity and timing", () => {
  assert.deepEqual(decodeAudioFrameV2(encodeFrame()), {
    protocolVersion: 2,
    sessionId: "session-001",
    scanId: "scan-001",
    sequence: 0,
    timestampMs: 1_783_987_200_123,
    sampleCount: 3,
    flags: ["start"],
    samples: [-32768, 0, 32767],
  });

  const badMagic = encodeFrame();
  new Uint8Array(badMagic)[0] = 0;
  assert.throws(() => decodeAudioFrameV2(badMagic), /magic/i);

  const badLength = encodeFrame();
  new DataView(badLength).setUint32(8, 5, false);
  assert.throws(() => decodeAudioFrameV2(badLength), /payload length/i);

  const unknownFlag = encodeFrame();
  new DataView(unknownFlag).setUint8(5, 0x80);
  assert.throws(() => decodeAudioFrameV2(unknownFlag), /flag/i);
});

test("guards listener identity, ordering, gaps, timestamps and end-of-session", () => {
  const session = parseAudioSessionMetadata(sessionPayload);
  const guard = new LiveAudioFrameGuard();

  assert.deepEqual(guard.accept(decodeAudioFrameV2(encodeFrame()), session), {
    droppedPackets: 0,
    sequence: 0,
  });
  assert.deepEqual(
    guard.accept(
      decodeAudioFrameV2(
        encodeFrame({ sequence: 1, timestampMs: 1_783_987_200_131, flags: [] }),
      ),
      session,
    ),
    { droppedPackets: 0, sequence: 1 },
  );

  assert.throws(
    () =>
      guard.accept(
        decodeAudioFrameV2(
          encodeFrame({ sequence: 3, timestampMs: 1_783_987_200_139, flags: [] }),
        ),
        session,
      ),
    /gap|discontinuity/i,
  );
  assert.throws(
    () =>
      guard.accept(
        decodeAudioFrameV2(
          encodeFrame({ sequence: 2, timestampMs: 1_783_987_200_120, flags: [] }),
        ),
        session,
      ),
    /timestamp/i,
  );
  assert.throws(
    () =>
      guard.accept(
        decodeAudioFrameV2(
          encodeFrame({
            sessionId: "session-other",
            sequence: 2,
            timestampMs: 1_783_987_200_139,
            flags: [],
          }),
        ),
        session,
      ),
    /identity/i,
  );

  assert.deepEqual(
    guard.accept(
      decodeAudioFrameV2(
        encodeFrame({
          sequence: 4,
          timestampMs: 1_783_987_200_147,
          flags: ["discontinuity", "end"],
        }),
      ),
      session,
    ),
    { droppedPackets: 2, sequence: 4 },
  );
  assert.throws(
    () =>
      guard.accept(
        decodeAudioFrameV2(
          encodeFrame({ sequence: 5, timestampMs: 1_783_987_200_155, flags: [] }),
        ),
        session,
      ),
    /ended/i,
  );
});

test("requires start sequence zero after every explicit reset", () => {
  const session = parseAudioSessionMetadata(sessionPayload);
  const guard = new LiveAudioFrameGuard();
  assert.throws(
    () =>
      guard.accept(
        decodeAudioFrameV2(encodeFrame({ sequence: 1, flags: [] })),
        session,
      ),
    /start/i,
  );
  assert.throws(
    () =>
      guard.accept(
        decodeAudioFrameV2(encodeFrame({ sequence: 1, flags: ["start"] })),
        session,
      ),
    /sequence 0/i,
  );
});

test("accepts status only for the current workspace and clears inactive identity", () => {
  assert.deepEqual(
    parseLiveStatusMessage(
      {
        type: "status",
        recording: true,
        workspaceId: "workspace-001",
        patientId: "patient-001",
        deviceId: "device-001",
        scanId: "scan-001",
        sessionId: "session-001",
        updatedAt: "2026-07-14T00:00:01.000Z",
      },
      "workspace-001",
    ).identity,
    {
      workspaceId: "workspace-001",
      patientId: "patient-001",
      deviceId: "device-001",
      scanId: "scan-001",
      sessionId: "session-001",
    },
  );
  assert.equal(
    parseLiveStatusMessage(
      {
        type: "status",
        recording: false,
        workspaceId: null,
        patientId: null,
        deviceId: null,
        scanId: null,
        sessionId: null,
        updatedAt: "2026-07-14T00:00:02.000Z",
      },
      "workspace-001",
    ).identity,
    null,
  );
  assert.throws(
    () =>
      parseLiveStatusMessage(
        {
          type: "status",
          recording: true,
          workspaceId: "workspace-other",
          patientId: "patient-001",
          deviceId: "device-001",
          scanId: "scan-001",
          sessionId: "session-001",
          updatedAt: "2026-07-14T00:00:03.000Z",
        },
        "workspace-001",
      ),
    /workspace/i,
  );
  assert.throws(
    () =>
      parseLiveStatusMessage(
        {
          type: "status",
          recording: false,
          workspaceId: "workspace-001",
          patientId: "patient-001",
          deviceId: "device-001",
          scanId: "scan-stale",
          sessionId: "session-stale",
          updatedAt: "2026-07-14T00:00:04.000Z",
        },
        "workspace-001",
      ),
    /inactive|identity/i,
  );
});

test("accepts metrics only when every source field matches active metadata", () => {
  const session = parseAudioSessionMetadata(sessionPayload);
  const validMetrics = {
    type: "metrics",
    recording: true,
    workspaceId: "workspace-001",
    patientId: "patient-001",
    deviceId: "device-001",
    scanId: "scan-001",
    sessionId: "session-001",
    sampleRate: 16000,
    peak: 32767,
    rms: 8123,
    levelPercent: 45,
    bpm: 72,
    updatedAt: "2026-07-14T00:00:01.000Z",
  };
  assert.deepEqual(
    parseLiveMetricsMessage(validMetrics, "workspace-001", session),
    validMetrics,
  );
  assert.throws(
    () =>
      parseLiveMetricsMessage(
        { ...validMetrics, sessionId: "session-stale" },
        "workspace-001",
        session,
      ),
    /identity/i,
  );
  assert.throws(
    () =>
      parseLiveMetricsMessage(
        { ...validMetrics, levelPercent: 101 },
        "workspace-001",
        session,
      ),
    /level/i,
  );
});
