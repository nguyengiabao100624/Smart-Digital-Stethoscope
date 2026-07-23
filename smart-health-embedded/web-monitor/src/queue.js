const crypto = require("node:crypto");

function isRedisEnabled(env = process.env) {
  return Boolean(env.REDIS_URL);
}

const AUDIO_QUEUE_ID_VERSION = "v2";
const DEFAULT_PROCESSING_INTENT = "initial";
const DEFAULT_PROCESSING_GENERATION = 1;
const DEFAULT_ARTIFACT_FINGERPRINT = "unspecified";

function normalizeIdentityText(value, fallback, maxLength = 512) {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFC");
  const result = normalized || fallback;
  if (result.length > maxLength) {
    throw new Error("audio queue identity field is too long");
  }
  return result;
}

function normalizeProcessingGeneration(value) {
  const candidate =
    value === undefined || value === null || value === ""
      ? DEFAULT_PROCESSING_GENERATION
      : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1) {
    throw new Error("processingGeneration must be a positive safe integer");
  }
  return candidate;
}

function canonicalizeAudioQueueIdentity(payload = {}) {
  const scanId = normalizeIdentityText(payload.scanId, "");
  if (!scanId) {
    throw new Error("scanId is required to build an audio queue job identity");
  }
  return {
    scanId,
    processingIntent: normalizeIdentityText(
      payload.processingIntent ?? payload.intent,
      DEFAULT_PROCESSING_INTENT,
      128,
    ).toLowerCase(),
    processingGeneration: normalizeProcessingGeneration(
      payload.processingGeneration ?? payload.generation,
    ),
    artifactFingerprint: normalizeIdentityText(
      payload.artifactFingerprint ?? payload.artifactSha256,
      DEFAULT_ARTIFACT_FINGERPRINT,
      512,
    ).toLowerCase(),
  };
}

function buildAudioQueueJobId(payload = {}) {
  const identity = canonicalizeAudioQueueIdentity(payload);
  const digest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        "audio-processing",
        AUDIO_QUEUE_ID_VERSION,
        identity.scanId,
        identity.processingIntent,
        identity.processingGeneration,
        identity.artifactFingerprint,
      ]),
      "utf8",
    )
    .digest("hex");
  return `scan-audio-${AUDIO_QUEUE_ID_VERSION}-${digest}`;
}

function createAudioQueue(env = process.env) {
  if (!isRedisEnabled(env)) {
    return {
      enabled: false,
      async enqueue() {
        return false;
      },
      async close() {},
    };
  }

  const { Queue } = require("bullmq");
  const connection = {
    url: env.REDIS_URL,
  };
  const queue = new Queue("audio-processing", { connection });
  return {
    enabled: true,
    async enqueue(payload) {
      await queue.add("process-scan-audio", payload, {
        jobId: buildAudioQueueJobId(payload),
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      return true;
    },
    async close() {
      await queue.close();
    },
  };
}

module.exports = {
  buildAudioQueueJobId,
  createAudioQueue,
};
