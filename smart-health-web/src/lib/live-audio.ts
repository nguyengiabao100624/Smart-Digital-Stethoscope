export interface AudioSessionMetadata {
  type: "audio.session";
  protocolVersion: 2;
  frameEncoding: "shcare_audio_v2";
  workspaceId: string;
  patientId: string;
  deviceId: string;
  scanId: string;
  sessionId: string;
  sampleRate: 16000;
  channels: 1;
  bitsPerSample: 16;
  encoding: "pcm_s16le";
  startedAt: string;
}

export type AudioFrameV2Flag =
  | "start"
  | "end"
  | "discontinuity"
  | "retransmit";

export interface AudioFrameV2 {
  protocolVersion: 2;
  sessionId: string;
  scanId: string;
  sequence: number;
  timestampMs: number;
  sampleCount: number;
  flags: AudioFrameV2Flag[];
  samples: number[];
}

export interface LiveAudioSourceIdentity {
  workspaceId: string;
  patientId: string;
  deviceId: string;
  scanId: string;
  sessionId: string;
}

export interface LiveStatusMessage {
  type: "status";
  recording: boolean;
  identity: LiveAudioSourceIdentity | null;
  updatedAt: string;
}

export interface LiveMetricsMessage extends LiveAudioSourceIdentity {
  type: "metrics";
  recording: true;
  sampleRate: 16000;
  peak: number;
  rms: number;
  levelPercent: number;
  bpm: number;
  updatedAt: string;
}

const AUDIO_V2_FIXED_HEADER_BYTES = 30;
const AUDIO_V2_MAX_SAMPLES = 1_024;
const AUDIO_V2_MAX_SESSION_ID_BYTES = 160;
const AUDIO_V2_MAX_SCAN_ID_BYTES = 120;
const AUDIO_V2_KNOWN_FLAGS_MASK = 0x0f;
const AUDIO_V2_FLAG_BITS: ReadonlyArray<readonly [AudioFrameV2Flag, number]> = [
  ["start", 1 << 0],
  ["end", 1 << 1],
  ["discontinuity", 1 << 2],
  ["retransmit", 1 << 3],
];
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Audio session ${label} is required.`);
  }
  return value;
}

function validTimestamp(value: unknown, label: string) {
  const timestamp = requiredString(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`Realtime ${label} is invalid.`);
  }
  return timestamp;
}

function parseLiveSourceIdentity(
  payload: Record<string, unknown>,
  expectedWorkspaceId: string,
): LiveAudioSourceIdentity {
  const identity = {
    workspaceId: requiredString(payload.workspaceId, "workspace ID"),
    patientId: requiredString(payload.patientId, "patient ID"),
    deviceId: requiredString(payload.deviceId, "device ID"),
    scanId: requiredString(payload.scanId, "scan ID"),
    sessionId: requiredString(payload.sessionId, "session ID"),
  };
  if (identity.workspaceId !== expectedWorkspaceId) {
    throw new Error("Realtime source is outside the current workspace.");
  }
  return identity;
}

function boundedMetric(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`Realtime ${label} is outside the supported range.`);
  }
  return value;
}

export function parseLiveStatusMessage(
  value: unknown,
  expectedWorkspaceId: string,
): LiveStatusMessage {
  if (!value || typeof value !== "object") {
    throw new Error("Realtime status must be an object.");
  }
  const payload = value as Record<string, unknown>;
  if (payload.type !== "status" || typeof payload.recording !== "boolean") {
    throw new Error("Realtime status contract is invalid.");
  }
  const updatedAt = validTimestamp(payload.updatedAt, "status timestamp");
  if (!payload.recording) {
    const identityFields = [
      payload.workspaceId,
      payload.patientId,
      payload.deviceId,
      payload.scanId,
      payload.sessionId,
    ];
    if (identityFields.some((field) => field !== null && field !== undefined)) {
      throw new Error("Inactive realtime status must clear its source identity.");
    }
    return { type: "status", recording: false, identity: null, updatedAt };
  }
  return {
    type: "status",
    recording: true,
    identity: parseLiveSourceIdentity(payload, expectedWorkspaceId),
    updatedAt,
  };
}

export function parseLiveMetricsMessage(
  value: unknown,
  expectedWorkspaceId: string,
  session: AudioSessionMetadata,
): LiveMetricsMessage {
  if (!value || typeof value !== "object") {
    throw new Error("Realtime metrics must be an object.");
  }
  const payload = value as Record<string, unknown>;
  if (payload.type !== "metrics" || payload.recording !== true) {
    throw new Error("Realtime metrics require an active recording.");
  }
  const identity = parseLiveSourceIdentity(payload, expectedWorkspaceId);
  if (
    identity.workspaceId !== session.workspaceId ||
    identity.patientId !== session.patientId ||
    identity.deviceId !== session.deviceId ||
    identity.scanId !== session.scanId ||
    identity.sessionId !== session.sessionId
  ) {
    throw new Error("Realtime metrics identity does not match active session metadata.");
  }
  if (payload.sampleRate !== 16000) {
    throw new Error("Realtime metrics sample rate must be 16000 Hz.");
  }
  return {
    type: "metrics",
    recording: true,
    ...identity,
    sampleRate: 16000,
    peak: boundedMetric(payload.peak, "peak", 0, 32768),
    rms: boundedMetric(payload.rms, "RMS", 0, 32768),
    levelPercent: boundedMetric(payload.levelPercent, "level percent", 0, 100),
    bpm: boundedMetric(payload.bpm, "BPM", 0, 300),
    updatedAt: validTimestamp(payload.updatedAt, "metrics timestamp"),
  };
}

export function parseAudioSessionMetadata(
  value: unknown,
): AudioSessionMetadata {
  if (!value || typeof value !== "object") {
    throw new Error("Audio session metadata must be an object.");
  }
  const payload = value as Record<string, unknown>;
  if (payload.type !== "audio.session" || payload.protocolVersion !== 2) {
    throw new Error("Unsupported audio session protocol.");
  }
  if (payload.frameEncoding !== "shcare_audio_v2") {
    throw new Error("Unsupported listener frame encoding.");
  }
  if (payload.sampleRate !== 16000) {
    throw new Error("Audio session sample rate must be 16000 Hz.");
  }
  if (
    payload.channels !== 1 ||
    payload.bitsPerSample !== 16 ||
    payload.encoding !== "pcm_s16le"
  ) {
    throw new Error("Audio session must be mono PCM16 little-endian.");
  }
  const startedAt = requiredString(payload.startedAt, "start time");
  if (!Number.isFinite(Date.parse(startedAt))) {
    throw new Error("Audio session start time is invalid.");
  }

  return {
    type: "audio.session",
    protocolVersion: 2,
    frameEncoding: payload.frameEncoding,
    workspaceId: requiredString(payload.workspaceId, "workspace ID"),
    patientId: requiredString(payload.patientId, "patient ID"),
    deviceId: requiredString(payload.deviceId, "device ID"),
    scanId: requiredString(payload.scanId, "scan ID"),
    sessionId: requiredString(payload.sessionId, "session ID"),
    sampleRate: 16000,
    channels: 1,
    bitsPerSample: 16,
    encoding: "pcm_s16le",
    startedAt,
  };
}

function decodeIdentity(
  bytes: Uint8Array,
  label: "session" | "scan",
) {
  let value = "";
  try {
    value = utf8Decoder.decode(bytes);
  } catch {
    throw new Error(`Audio v2 ${label} ID is not valid UTF-8.`);
  }
  const containsControlCharacter = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!value || containsControlCharacter) {
    throw new Error(
      `Audio v2 ${label} ID is required and may not contain control characters.`,
    );
  }
  return value;
}

function decodeFrameFlags(mask: number): AudioFrameV2Flag[] {
  if ((mask & ~AUDIO_V2_KNOWN_FLAGS_MASK) !== 0) {
    throw new Error("Audio v2 frame contains unsupported flags.");
  }
  return AUDIO_V2_FLAG_BITS.filter(([, bit]) => (mask & bit) !== 0).map(
    ([flag]) => flag,
  );
}

export function decodeAudioFrameV2(buffer: ArrayBuffer): AudioFrameV2 {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < AUDIO_V2_FIXED_HEADER_BYTES) {
    throw new Error("Audio v2 frame is shorter than its fixed header.");
  }
  const bytes = new Uint8Array(buffer);
  if (
    bytes[0] !== 0x53 ||
    bytes[1] !== 0x48 ||
    bytes[2] !== 0x43 ||
    bytes[3] !== 0x32
  ) {
    throw new Error("Audio v2 magic is invalid.");
  }
  if (bytes[4] !== 2) {
    throw new Error(`Unsupported audio protocol version: ${bytes[4]}.`);
  }

  const view = new DataView(buffer);
  const flags = decodeFrameFlags(view.getUint8(5));
  const headerLength = view.getUint16(6, false);
  const payloadLength = view.getUint32(8, false);
  const sequence = view.getUint32(12, false);
  const timestamp = view.getBigUint64(16, false);
  const sampleCount = view.getUint16(24, false);
  const sessionIdLength = view.getUint16(26, false);
  const scanIdLength = view.getUint16(28, false);

  if (
    sessionIdLength < 1 ||
    sessionIdLength > AUDIO_V2_MAX_SESSION_ID_BYTES ||
    scanIdLength < 1 ||
    scanIdLength > AUDIO_V2_MAX_SCAN_ID_BYTES ||
    headerLength !== AUDIO_V2_FIXED_HEADER_BYTES + sessionIdLength + scanIdLength ||
    headerLength > buffer.byteLength
  ) {
    throw new Error("Audio v2 header/session length is invalid.");
  }
  if (payloadLength !== buffer.byteLength - headerLength) {
    throw new Error("Audio v2 payload length does not match the frame length.");
  }
  if (
    sampleCount < 1 ||
    sampleCount > AUDIO_V2_MAX_SAMPLES ||
    payloadLength !== sampleCount * 2
  ) {
    throw new Error("Audio v2 payload length does not match its sample count.");
  }
  if (timestamp > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Audio v2 timestamp exceeds the safe integer range.");
  }

  const sessionEnd = AUDIO_V2_FIXED_HEADER_BYTES + sessionIdLength;
  const sessionId = decodeIdentity(
    bytes.subarray(AUDIO_V2_FIXED_HEADER_BYTES, sessionEnd),
    "session",
  );
  const scanId = decodeIdentity(bytes.subarray(sessionEnd, headerLength), "scan");
  const samples = new Array<number>(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(headerLength + index * 2, true);
  }

  return {
    protocolVersion: 2,
    sessionId,
    scanId,
    sequence,
    timestampMs: Number(timestamp),
    sampleCount,
    flags,
    samples,
  };
}

export class LiveAudioFrameGuard {
  private sessionId = "";
  private scanId = "";
  private lastSequence: number | null = null;
  private lastTimestampMs: number | null = null;
  private ended = false;

  accept(frame: AudioFrameV2, session: AudioSessionMetadata) {
    if (
      frame.sessionId !== session.sessionId ||
      frame.scanId !== session.scanId
    ) {
      throw new Error("Realtime audio frame identity does not match its session metadata.");
    }

    if (!this.sessionId) {
      if (!frame.flags.includes("start")) {
        throw new Error("The first audio v2 frame requires the start flag.");
      }
      if (frame.sequence !== 0) {
        throw new Error("The first audio v2 frame must use sequence 0.");
      }
      this.sessionId = frame.sessionId;
      this.scanId = frame.scanId;
      this.lastSequence = frame.sequence;
      this.lastTimestampMs = frame.timestampMs;
      this.ended = frame.flags.includes("end");
      return { droppedPackets: 0, sequence: frame.sequence };
    }

    if (frame.sessionId !== this.sessionId || frame.scanId !== this.scanId) {
      throw new Error("Realtime audio frame identity changed without an explicit reset.");
    }
    if (this.ended) {
      throw new Error("Audio v2 session has already ended.");
    }
    if (this.lastSequence === null || frame.sequence <= this.lastSequence) {
      throw new Error("Audio v2 replay or out-of-order sequence rejected.");
    }
    if (this.lastTimestampMs !== null && frame.timestampMs < this.lastTimestampMs) {
      throw new Error("Audio v2 timestamp moved backwards.");
    }

    const droppedPackets = frame.sequence - this.lastSequence - 1;
    if (droppedPackets > 0 && !frame.flags.includes("discontinuity")) {
      throw new Error("Audio v2 sequence gap requires the discontinuity flag.");
    }

    this.lastSequence = frame.sequence;
    this.lastTimestampMs = frame.timestampMs;
    this.ended = frame.flags.includes("end");
    return { droppedPackets, sequence: frame.sequence };
  }

  reset() {
    this.sessionId = "";
    this.scanId = "";
    this.lastSequence = null;
    this.lastTimestampMs = null;
    this.ended = false;
  }
}

export class LiveAudioIdentityGuard {
  private session: AudioSessionMetadata | null = null;

  acceptSession(session: AudioSessionMetadata) {
    if (
      this.session &&
      (this.session.sessionId !== session.sessionId ||
        this.session.scanId !== session.scanId ||
        this.session.deviceId !== session.deviceId ||
        this.session.patientId !== session.patientId ||
        this.session.workspaceId !== session.workspaceId)
    ) {
      throw new Error(
        "Realtime audio active source changed without a session reset.",
      );
    }
    this.session = session;
  }

  requireSession() {
    if (!this.session) {
      throw new Error("Audio session metadata must arrive before PCM data.");
    }
    return this.session;
  }

  reset() {
    this.session = null;
  }
}

export function appendWaveformSamples(
  current: readonly number[],
  incoming: readonly number[],
  limit = 512,
) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Waveform history limit must be a positive integer.");
  }
  return [...current, ...incoming].slice(-limit);
}
