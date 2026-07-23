const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  AUDIO_V2_FLAG,
  AUDIO_V2_FIXED_HEADER_BYTES,
  AudioSequenceGuard,
  decodeAudioFrameV2,
  encodeAudioFrameV2,
} = require("../src/audioProtocolV2");

const PCM_128 = Buffer.alloc(128 * 2);
for (let index = 0; index < 128; index += 1) {
  PCM_128.writeInt16LE(index - 64, index * 2);
}

function fixture(overrides = {}) {
  return {
    sessionId: "audio-session-fixture-001",
    scanId: "scan-fixture-001",
    sequence: 0,
    timestampMs: 1_783_987_200_123,
    sampleCount: 128,
    flags: ["start"],
    payload: PCM_128,
    ...overrides,
  };
}

describe("Shcare audio wire protocol v2", () => {
  it("round-trips a bounded PCM16 frame in network byte order", () => {
    const encoded = encodeAudioFrameV2(fixture());
    assert.equal(encoded.subarray(0, 4).toString("ascii"), "SHC2");
    assert.equal(encoded[4], 2);
    assert.equal(encoded[5], AUDIO_V2_FLAG.start);
    assert.equal(encoded.readUInt16BE(6), AUDIO_V2_FIXED_HEADER_BYTES + 25 + 16);
    assert.equal(encoded.readUInt32BE(8), PCM_128.length);

    const decoded = decodeAudioFrameV2(encoded);
    assert.equal(decoded.protocolVersion, 2);
    assert.equal(decoded.sessionId, "audio-session-fixture-001");
    assert.equal(decoded.scanId, "scan-fixture-001");
    assert.equal(decoded.sequence, 0);
    assert.equal(decoded.timestampMs, 1_783_987_200_123);
    assert.equal(decoded.sampleRate, 16_000);
    assert.equal(decoded.sampleCount, 128);
    assert.deepEqual(decoded.flags, ["start"]);
    assert.deepEqual(decoded.payload, PCM_128);
  });

  it("rejects malformed lengths, identity and unsupported flags", () => {
    const valid = encodeAudioFrameV2(fixture());
    const badMagic = Buffer.from(valid);
    badMagic[0] = 0;
    assert.throws(() => decodeAudioFrameV2(badMagic), /magic/i);

    const badPayloadLength = Buffer.from(valid);
    badPayloadLength.writeUInt32BE(255, 8);
    assert.throws(() => decodeAudioFrameV2(badPayloadLength), /payload length/i);

    const badFlags = Buffer.from(valid);
    badFlags[5] = 0x80;
    assert.throws(() => decodeAudioFrameV2(badFlags), /flags/i);

    assert.throws(
      () => encodeAudioFrameV2(fixture({ sessionId: "" })),
      /session/i,
    );
    assert.throws(
      () => encodeAudioFrameV2(fixture({ scanId: "" })),
      /scan/i,
    );
    assert.throws(
      () => encodeAudioFrameV2(fixture({ sampleCount: 127 })),
      /sample count/i,
    );
  });

  it("rejects replay/out-of-order frames and reports packet gaps", () => {
    const guard = new AudioSequenceGuard();
    assert.deepEqual(guard.accept(fixture()), { droppedPackets: 0, sequence: 0 });
    assert.deepEqual(guard.accept(fixture({ sequence: 1, flags: [] })), {
      droppedPackets: 0,
      sequence: 1,
    });
    assert.deepEqual(guard.accept(fixture({ sequence: 4, flags: ["discontinuity"] })), {
      droppedPackets: 2,
      sequence: 4,
    });
    assert.throws(() => guard.accept(fixture({ sequence: 4, flags: [] })), /replay|order/i);
    assert.throws(() => guard.accept(fixture({ sequence: 3, flags: [] })), /replay|order/i);
  });

  it("requires an explicit start frame when a session is first observed", () => {
    const guard = new AudioSequenceGuard();
    assert.throws(() => guard.accept(fixture({ flags: [] })), /start/i);
    assert.throws(() => guard.accept(fixture({ sequence: 1 })), /sequence 0/i);
  });
});
