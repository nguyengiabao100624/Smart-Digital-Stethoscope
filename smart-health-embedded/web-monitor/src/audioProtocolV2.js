const AUDIO_V2_MAGIC = Buffer.from("SHC2", "ascii");
const AUDIO_V2_PROTOCOL_VERSION = 2;
const AUDIO_V2_FIXED_HEADER_BYTES = 30;
const AUDIO_V2_SAMPLE_RATE = 16_000;
const AUDIO_V2_BYTES_PER_SAMPLE = 2;
const AUDIO_V2_MAX_SAMPLES = 1_024;
const AUDIO_V2_MAX_SESSION_ID_BYTES = 160;
const AUDIO_V2_MAX_SCAN_ID_BYTES = 120;

const AUDIO_V2_FLAG = Object.freeze({
  start: 1 << 0,
  end: 1 << 1,
  discontinuity: 1 << 2,
  retransmit: 1 << 3,
});

const AUDIO_V2_KNOWN_FLAGS_MASK = Object.values(AUDIO_V2_FLAG).reduce(
  (mask, value) => mask | value,
  0,
);

function protocolError(message, code = "AUDIO_V2_INVALID_FRAME") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertUnsignedInteger(value, max, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw protocolError(`${label} is outside the supported unsigned integer range`);
  }
}

function encodeFlags(flags = []) {
  if (!Array.isArray(flags)) {
    throw protocolError("Audio v2 flags must be an array");
  }
  const uniqueFlags = new Set(flags);
  if (uniqueFlags.size !== flags.length) {
    throw protocolError("Audio v2 flags must be unique");
  }
  let mask = 0;
  for (const flag of uniqueFlags) {
    if (!Object.prototype.hasOwnProperty.call(AUDIO_V2_FLAG, flag)) {
      throw protocolError(`Unsupported audio v2 flag: ${String(flag)}`);
    }
    mask |= AUDIO_V2_FLAG[flag];
  }
  return mask;
}

function decodeFlags(mask) {
  if ((mask & ~AUDIO_V2_KNOWN_FLAGS_MASK) !== 0) {
    throw protocolError("Audio v2 frame contains unsupported flags");
  }
  return Object.entries(AUDIO_V2_FLAG)
    .filter(([, bit]) => (mask & bit) !== 0)
    .map(([name]) => name);
}

function validateSessionId(sessionId) {
  if (typeof sessionId !== "string" || !sessionId || /[\0-\x1f\x7f]/.test(sessionId)) {
    throw protocolError("Audio v2 session ID is required and may not contain control characters");
  }
  const bytes = Buffer.from(sessionId, "utf8");
  if (bytes.length === 0 || bytes.length > AUDIO_V2_MAX_SESSION_ID_BYTES) {
    throw protocolError(
      `Audio v2 session ID must be 1-${AUDIO_V2_MAX_SESSION_ID_BYTES} UTF-8 bytes`,
    );
  }
  return bytes;
}

function validateScanId(scanId) {
  if (typeof scanId !== "string" || !scanId || /[\0-\x1f\x7f]/.test(scanId)) {
    throw protocolError("Audio v2 scan ID is required and may not contain control characters");
  }
  const bytes = Buffer.from(scanId, "utf8");
  if (bytes.length === 0 || bytes.length > AUDIO_V2_MAX_SCAN_ID_BYTES) {
    throw protocolError(`Audio v2 scan ID must be 1-${AUDIO_V2_MAX_SCAN_ID_BYTES} UTF-8 bytes`);
  }
  return bytes;
}

function encodeAudioFrameV2({
  sessionId,
  scanId,
  sequence,
  timestampMs,
  sampleCount,
  flags = [],
  payload,
}) {
  const sessionBytes = validateSessionId(sessionId);
  const scanBytes = validateScanId(scanId);
  assertUnsignedInteger(sequence, 0xffff_ffff, "Audio v2 sequence");
  assertUnsignedInteger(timestampMs, Number.MAX_SAFE_INTEGER, "Audio v2 timestamp");
  assertUnsignedInteger(sampleCount, AUDIO_V2_MAX_SAMPLES, "Audio v2 sample count");
  if (sampleCount < 1) {
    throw protocolError("Audio v2 sample count must be at least 1");
  }
  if (!Buffer.isBuffer(payload)) {
    throw protocolError("Audio v2 payload must be a Buffer");
  }
  const expectedPayloadLength = sampleCount * AUDIO_V2_BYTES_PER_SAMPLE;
  if (payload.length !== expectedPayloadLength) {
    throw protocolError(
      `Audio v2 payload length must equal sample count × ${AUDIO_V2_BYTES_PER_SAMPLE}`,
    );
  }

  const headerLength = AUDIO_V2_FIXED_HEADER_BYTES + sessionBytes.length + scanBytes.length;
  const frame = Buffer.allocUnsafe(headerLength + payload.length);
  AUDIO_V2_MAGIC.copy(frame, 0);
  frame[4] = AUDIO_V2_PROTOCOL_VERSION;
  frame[5] = encodeFlags(flags);
  frame.writeUInt16BE(headerLength, 6);
  frame.writeUInt32BE(payload.length, 8);
  frame.writeUInt32BE(sequence, 12);
  frame.writeBigUInt64BE(BigInt(timestampMs), 16);
  frame.writeUInt16BE(sampleCount, 24);
  frame.writeUInt16BE(sessionBytes.length, 26);
  frame.writeUInt16BE(scanBytes.length, 28);
  sessionBytes.copy(frame, AUDIO_V2_FIXED_HEADER_BYTES);
  scanBytes.copy(frame, AUDIO_V2_FIXED_HEADER_BYTES + sessionBytes.length);
  payload.copy(frame, headerLength);
  return frame;
}

function decodeAudioFrameV2(frame) {
  if (!Buffer.isBuffer(frame) || frame.length < AUDIO_V2_FIXED_HEADER_BYTES) {
    throw protocolError("Audio v2 frame is shorter than its fixed header");
  }
  if (!frame.subarray(0, AUDIO_V2_MAGIC.length).equals(AUDIO_V2_MAGIC)) {
    throw protocolError("Audio v2 magic is invalid");
  }
  if (frame[4] !== AUDIO_V2_PROTOCOL_VERSION) {
    throw protocolError(`Unsupported audio protocol version: ${frame[4]}`);
  }

  const flags = decodeFlags(frame[5]);
  const headerLength = frame.readUInt16BE(6);
  const payloadLength = frame.readUInt32BE(8);
  const sequence = frame.readUInt32BE(12);
  const timestampBigInt = frame.readBigUInt64BE(16);
  const sampleCount = frame.readUInt16BE(24);
  const sessionIdLength = frame.readUInt16BE(26);
  const scanIdLength = frame.readUInt16BE(28);

  if (
    sessionIdLength < 1 ||
    sessionIdLength > AUDIO_V2_MAX_SESSION_ID_BYTES ||
    scanIdLength < 1 ||
    scanIdLength > AUDIO_V2_MAX_SCAN_ID_BYTES ||
    headerLength !== AUDIO_V2_FIXED_HEADER_BYTES + sessionIdLength + scanIdLength ||
    headerLength > frame.length
  ) {
    throw protocolError("Audio v2 header/session length is invalid");
  }
  if (payloadLength !== frame.length - headerLength) {
    throw protocolError("Audio v2 payload length does not match the frame length");
  }
  if (
    sampleCount < 1 ||
    sampleCount > AUDIO_V2_MAX_SAMPLES ||
    payloadLength !== sampleCount * AUDIO_V2_BYTES_PER_SAMPLE
  ) {
    throw protocolError("Audio v2 payload length does not match its sample count");
  }
  if (timestampBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw protocolError("Audio v2 timestamp exceeds the safe integer range");
  }

  const sessionEnd = AUDIO_V2_FIXED_HEADER_BYTES + sessionIdLength;
  const sessionBytes = frame.subarray(AUDIO_V2_FIXED_HEADER_BYTES, sessionEnd);
  const scanBytes = frame.subarray(sessionEnd, headerLength);
  const sessionId = sessionBytes.toString("utf8");
  const scanId = scanBytes.toString("utf8");
  if (!Buffer.from(sessionId, "utf8").equals(sessionBytes)) {
    throw protocolError("Audio v2 session ID is not valid UTF-8");
  }
  validateSessionId(sessionId);
  if (!Buffer.from(scanId, "utf8").equals(scanBytes)) {
    throw protocolError("Audio v2 scan ID is not valid UTF-8");
  }
  validateScanId(scanId);

  return {
    protocolVersion: AUDIO_V2_PROTOCOL_VERSION,
    sessionId,
    scanId,
    sequence,
    timestampMs: Number(timestampBigInt),
    sampleRate: AUDIO_V2_SAMPLE_RATE,
    sampleCount,
    encoding: "pcm_s16le",
    flags,
    payload: Buffer.from(frame.subarray(headerLength)),
  };
}

class AudioSequenceGuard {
  constructor() {
    this.sessionId = "";
    this.scanId = "";
    this.lastSequence = null;
    this.ended = false;
    this.droppedPackets = 0;
  }

  reset() {
    this.sessionId = "";
    this.scanId = "";
    this.lastSequence = null;
    this.ended = false;
    this.droppedPackets = 0;
  }

  accept(frame) {
    const flags = Array.isArray(frame?.flags) ? frame.flags : [];
    const isNewSession = !this.sessionId || frame.sessionId !== this.sessionId;
    if (isNewSession) {
      if (!flags.includes("start")) {
        throw protocolError("The first audio v2 frame for a session requires the start flag");
      }
      if (frame.sequence !== 0) {
        throw protocolError("The first audio v2 frame must use sequence 0");
      }
      this.sessionId = frame.sessionId;
      this.scanId = frame.scanId;
      this.lastSequence = 0;
      this.ended = flags.includes("end");
      this.droppedPackets = 0;
      return { droppedPackets: 0, sequence: frame.sequence };
    }

    if (frame.scanId !== this.scanId) {
      throw protocolError("Audio v2 scan identity changed within a session", "AUDIO_V2_SCAN_MISMATCH");
    }

    if (this.ended) {
      throw protocolError("Audio v2 session has already ended", "AUDIO_V2_SESSION_ENDED");
    }
    if (!Number.isInteger(frame.sequence) || frame.sequence <= this.lastSequence) {
      throw protocolError(
        "Audio v2 replay or out-of-order sequence rejected",
        "AUDIO_V2_SEQUENCE_REJECTED",
      );
    }

    const droppedPackets = frame.sequence - this.lastSequence - 1;
    if (droppedPackets > 0 && !flags.includes("discontinuity")) {
      throw protocolError(
        "Audio v2 sequence gap requires the discontinuity flag",
        "AUDIO_V2_UNDECLARED_GAP",
      );
    }
    this.lastSequence = frame.sequence;
    this.ended = flags.includes("end");
    this.droppedPackets += droppedPackets;
    return { droppedPackets, sequence: frame.sequence };
  }
}

module.exports = {
  AUDIO_V2_BYTES_PER_SAMPLE,
  AUDIO_V2_FIXED_HEADER_BYTES,
  AUDIO_V2_FLAG,
  AUDIO_V2_MAGIC,
  AUDIO_V2_MAX_SAMPLES,
  AUDIO_V2_MAX_SCAN_ID_BYTES,
  AUDIO_V2_MAX_SESSION_ID_BYTES,
  AUDIO_V2_PROTOCOL_VERSION,
  AUDIO_V2_SAMPLE_RATE,
  AudioSequenceGuard,
  decodeAudioFrameV2,
  encodeAudioFrameV2,
};
