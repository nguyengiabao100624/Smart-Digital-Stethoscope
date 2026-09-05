const crypto = require("node:crypto");
const net = require("node:net");

const DEVICE_AUTH_PROTOCOL_VERSION = 1;
const DEVICE_AUTH_CHALLENGE_TTL_MS = 10_000;
const DEVICE_AUTH_DOMAIN = "smart-health-device-auth-v1";
const DEVICE_ROTATION_WRAP_DOMAIN = "smart-health-device-rotation-wrap-v1";
const DEVICE_ROTATION_AAD_DOMAIN = "smart-health-device-rotation-aad-v1";
const DEVICE_ROTATION_PENDING_STATES = new Set([
  "initiated",
  "pending_device_ack",
  "confirming",
]);
const DEVICE_ROTATION_STATES = new Set([
  ...DEVICE_ROTATION_PENDING_STATES,
  "confirmed",
  "expired",
  "rolled_back",
  "failed",
]);
const DEVICE_AUTH_RESPONSE_FIELDS = new Set([
  "type",
  "protocolVersion",
  "deviceId",
  "challengeId",
  "proof",
  "telemetry",
]);
function isSensitiveDeviceField(key) {
  const normalized = String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return Boolean(
    normalized === "authorization" ||
    normalized === "proof" ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("credential") ||
    normalized.endsWith("token") ||
    /(?:api|private|signing)key$/.test(normalized)
  );
}

function containsSensitiveDeviceCredential(value, depth = 0) {
  if (!value || typeof value !== "object") return false;
  if (depth > 6) return true;
  if (Array.isArray(value)) return value.some((item) => containsSensitiveDeviceCredential(item, depth + 1));
  return Object.entries(value).some(
    ([key, nestedValue]) =>
      isSensitiveDeviceField(key) || containsSensitiveDeviceCredential(nestedValue, depth + 1),
  );
}

function sanitizePublicDeviceEventPayload(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 2000) : value;
  }
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizePublicDeviceEventPayload(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalized = String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (isSensitiveDeviceField(key) || normalized.includes("signature")) continue;
    if (normalized.endsWith("url") && typeof nestedValue === "string") {
      try {
        const url = new URL(nestedValue);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        sanitized[key] = url.toString();
      } catch {
        sanitized[key] = "";
      }
      continue;
    }
    sanitized[key] = sanitizePublicDeviceEventPayload(nestedValue, depth + 1);
  }
  return sanitized;
}

const DEVICE_TELEMETRY_INTEGER_FIELDS = new Set([
  "uptimeMs",
  "freeHeapBytes",
  "audioPacketsSent",
  "audioPacketsDropped",
  "audioSendFailures",
  "lastCommandUptimeMs",
]);

const UINT32_MAX = 0xFFFF_FFFF;
const DEVICE_TELEMETRY_UINT32_FIELDS = new Set([
  "audioCaptureQueueDepth",
  "audioCaptureQueueHighWater",
  "audioCaptureFramesEnqueued",
  "audioCaptureFramesDropped",
  "audioCaptureFramesStale",
  "audioCaptureSlot",
  "audioCaptureSlotSwitches",
  "i2sSlot0Rms",
  "i2sSlot0Peak",
  "i2sSlot0WindowCount",
  "i2sSlot0ActiveWindowCount",
  "i2sSlot0SampleCount",
  "i2sSlot0NonZeroSampleCount",
  "i2sSlot1Rms",
  "i2sSlot1Peak",
  "i2sSlot1WindowCount",
  "i2sSlot1ActiveWindowCount",
  "i2sSlot1SampleCount",
  "i2sSlot1NonZeroSampleCount",
]);

const DEVICE_TELEMETRY_STRING_FIELDS = new Set([
  "resetReason",
  "i2sStatus",
  "audioProfile",
  "lastCommandId",
  "lastCommandState",
  "lastCommandCode",
  "otaStatus",
  "otaBootOutcome",
]);

function sanitizeDeviceTelemetry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value;
  const sanitized = {};
  for (const field of DEVICE_TELEMETRY_INTEGER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const number = Number(source[field]);
    if (!Number.isSafeInteger(number) || number < 0) continue;
    sanitized[field] = number;
  }
  for (const field of DEVICE_TELEMETRY_UINT32_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const number = source[field];
    if (!Number.isSafeInteger(number) || number < 0 || number > UINT32_MAX) continue;
    sanitized[field] = number;
  }
  for (const field of DEVICE_TELEMETRY_STRING_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const stringValue = typeof source[field] === "string"
      ? source[field].trim().slice(0, 160)
      : "";
    if (!stringValue) continue;
    sanitized[field] = stringValue;
  }
  if (sanitized.audioProfile && !["heart", "lung"].includes(sanitized.audioProfile)) {
    delete sanitized.audioProfile;
  }
  if (sanitized.audioCaptureSlot !== undefined && ![0, 1].includes(sanitized.audioCaptureSlot)) {
    delete sanitized.audioCaptureSlot;
  }
  if (typeof source.audioStatus === "string") {
    const audioStatus = source.audioStatus.trim().slice(0, 40);
    if (audioStatus) sanitized.audioStatus = audioStatus;
  }
  if (typeof source.connectionMethod === "string") {
    const connectionMethod = source.connectionMethod.trim().slice(0, 40);
    if (connectionMethod) sanitized.connectionMethod = connectionMethod;
  }
  if (
    Number.isInteger(source.wifiRssi) &&
    source.wifiRssi >= -127 &&
    source.wifiRssi <= 0
  ) {
    sanitized.wifiRssi = source.wifiRssi;
  }
  if (typeof source.wifiSsid === "string") {
    const wifiSsid = source.wifiSsid.trim().slice(0, 120);
    if (wifiSsid && !/[\u0000-\u001f\u007f]/.test(wifiSsid)) {
      sanitized.wifiSsid = wifiSsid;
    }
  }
  if (typeof source.ipAddress === "string") {
    const ipAddress = source.ipAddress.trim().slice(0, 80);
    if (net.isIP(ipAddress) > 0 && ipAddress !== "0.0.0.0" && ipAddress !== "::") {
      sanitized.ipAddress = ipAddress;
    }
  }
  return sanitized;
}

function sanitizeDeviceCredentialRotation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const state = String(value.state || "");
  const nextSecretHash = String(value.nextSecretHash || "");
  if (!value.id || !DEVICE_ROTATION_STATES.has(state)) return {};
  const sanitized = {
    protocolVersion:
      Number.isInteger(Number(value.protocolVersion)) && Number(value.protocolVersion) > 0
        ? Number(value.protocolVersion)
        : 1,
    id: String(value.id).slice(0, 128),
    state,
    nextSecretHash: /^sha256:[a-f0-9]{64}$/i.test(nextSecretHash)
      ? nextSecretHash.toLowerCase()
      : "",
    requestedByUserId: String(value.requestedByUserId || "").slice(0, 120),
    requestedSessionId: String(value.requestedSessionId || "").slice(0, 128),
    confirmedSessionId: String(value.confirmedSessionId || "").slice(0, 128),
    commandId: String(value.commandId || "").slice(0, 128),
    correlationId: String(value.correlationId || "").slice(0, 128),
    idempotencyKey: String(value.idempotencyKey || "").slice(0, 160),
    requestFingerprint: String(value.requestFingerprint || "").slice(0, 128),
    requestedAt: String(value.requestedAt || "").slice(0, 40),
    expiresAt: String(value.expiresAt || "").slice(0, 40),
    acknowledgedAt: String(value.acknowledgedAt || "").slice(0, 40),
    confirmingAt: String(value.confirmingAt || "").slice(0, 40),
    confirmedAt: String(value.confirmedAt || "").slice(0, 40),
    expiredAt: String(value.expiredAt || "").slice(0, 40),
    rolledBackAt: String(value.rolledBackAt || "").slice(0, 40),
    failedAt: String(value.failedAt || "").slice(0, 40),
    failureCode: String(value.failureCode || "").slice(0, 80),
    updatedAt: String(value.updatedAt || "").slice(0, 40),
  };
  if (!sanitized.nextSecretHash && DEVICE_ROTATION_PENDING_STATES.has(state)) return {};
  return sanitized;
}

function canonicalDeviceAuthBytes(challengeId, nonce, deviceId) {
  return Buffer.from(`${DEVICE_AUTH_DOMAIN}\n${challengeId}\n${nonce}\n${deviceId}`, "utf8");
}

function canonicalDeviceRotationAad(context = {}) {
  return Buffer.from(
    `${DEVICE_ROTATION_AAD_DOMAIN}\n${String(context.rotationId || "")}\n${String(context.deviceId || "")}\n${String(context.sessionId || "")}`,
    "utf8",
  );
}

function deriveDeviceRotationWrapKey(verificationKey, context = {}) {
  if (!Buffer.isBuffer(verificationKey) || verificationKey.length !== 32) {
    throw new TypeError("A 32-byte device verification key is required");
  }
  const binding = [
    DEVICE_ROTATION_WRAP_DOMAIN,
    String(context.challengeId || ""),
    String(context.nonce || ""),
    String(context.deviceId || ""),
    String(context.sessionId || ""),
  ].join("\n");
  if (!context.challengeId || !context.nonce || !context.deviceId || !context.sessionId) {
    throw new TypeError("A complete authenticated device session binding is required");
  }
  return crypto.createHmac("sha256", verificationKey).update(binding, "utf8").digest();
}

function wrapDeviceRotationSecret(secret, wrapKey, context = {}, randomBytes = crypto.randomBytes) {
  if ((!Buffer.isBuffer(secret) && typeof secret !== "string") || secret.length === 0) {
    throw new TypeError("A non-empty device credential is required");
  }
  if (!Buffer.isBuffer(wrapKey) || wrapKey.length !== 32) {
    throw new TypeError("A 32-byte device rotation wrapping key is required");
  }
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", wrapKey, iv);
  cipher.setAAD(canonicalDeviceRotationAad(context));
  const ciphertext = Buffer.concat([
    Buffer.isBuffer(secret) ? cipher.update(secret) : cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "A256GCM",
    keyDerivation: "HMAC-SHA256/device-session-v1",
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: tag.toString("base64url"),
  };
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

function getLegacyDeviceKey(device) {
  if (!device || typeof device.secret !== "string" || !device.secret) return null;
  return crypto.createHash("sha256").update(device.secret, "utf8").digest();
}

function canonicalDeviceSecretHash(secret) {
  if ((!Buffer.isBuffer(secret) && typeof secret !== "string") || secret.length === 0) return "";
  const canonical = typeof secret === "string"
    ? /^sha256:([a-f0-9]{64})$/i.exec(secret)
    : null;
  if (canonical) return `sha256:${canonical[1].toLowerCase()}`;
  const hash = crypto.createHash("sha256");
  if (Buffer.isBuffer(secret)) hash.update(secret);
  else hash.update(secret, "utf8");
  return `sha256:${hash.digest("hex")}`;
}

function normalizeDeviceSecretMaterial(device) {
  if (!device || typeof device !== "object") return device;
  const material = device.secret || device.secretHash || "";
  if (material) device.secretHash = canonicalDeviceSecretHash(material);
  delete device.secret;
  delete device.deviceSecret;
  return device;
}

function getDeviceVerificationKey(device) {
  const canonicalHash = typeof device?.secretHash === "string" ? device.secretHash : "";
  const match = /^sha256:([a-f0-9]{64})$/i.exec(canonicalHash);
  if (match) return Buffer.from(match[1], "hex");
  if (canonicalHash) return Buffer.from(canonicalDeviceSecretHash(canonicalHash).slice(7), "hex");
  return getLegacyDeviceKey(device);
}

function getPendingRotationVerificationKey(device, nowMs = Date.now()) {
  const rotation = device?.credentialRotation;
  if (!rotation || !DEVICE_ROTATION_PENDING_STATES.has(String(rotation.state || ""))) {
    return null;
  }
  const expiresAtMs = Date.parse(rotation.expiresAt || "");
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null;
  const match = /^sha256:([a-f0-9]{64})$/i.exec(String(rotation.nextSecretHash || ""));
  return match ? Buffer.from(match[1], "hex") : null;
}

function createDeviceCredentialBinding(verificationKey) {
  if (!Buffer.isBuffer(verificationKey) || verificationKey.length !== 32) return "";
  return crypto
    .createHash("sha256")
    .update(DEVICE_AUTH_DOMAIN, "utf8")
    .update(Buffer.from([0]))
    .update(verificationKey)
    .digest("base64url");
}

function deviceAuthenticationFenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertDeviceAuthenticationFence(currentDevice, authResult, nowMs = Date.now()) {
  if (
    !currentDevice ||
    currentDevice.revokedAt ||
    String(currentDevice.status || "").toLowerCase() === "revoked"
  ) {
    throw deviceAuthenticationFenceError(
      "DEVICE_AUTH_AUTHORITY_CHANGED",
      "Device authority changed before the authenticated session was registered",
    );
  }
  const authenticatedOrganizationId = String(authResult?.device?.organizationId || "");
  const currentOrganizationId = String(currentDevice.organizationId || "");
  if (!authenticatedOrganizationId || currentOrganizationId !== authenticatedOrganizationId) {
    throw deviceAuthenticationFenceError(
      "DEVICE_AUTH_AUTHORITY_CHANGED",
      "Device workspace changed before the authenticated session was registered",
    );
  }

  const suppliedBinding = String(authResult?.credentialBinding || "");
  const candidateBindings = [
    createDeviceCredentialBinding(getDeviceVerificationKey(currentDevice)),
    createDeviceCredentialBinding(getPendingRotationVerificationKey(currentDevice, nowMs)),
  ].filter(Boolean);
  const suppliedBuffer = Buffer.from(suppliedBinding, "utf8");
  const matchesCurrentCredential = candidateBindings.some((binding) => {
    const candidateBuffer = Buffer.from(binding, "utf8");
    return (
      suppliedBuffer.length === candidateBuffer.length &&
      suppliedBuffer.length > 0 &&
      crypto.timingSafeEqual(suppliedBuffer, candidateBuffer)
    );
  });
  if (!matchesCurrentCredential) {
    throw deviceAuthenticationFenceError(
      "DEVICE_AUTH_CREDENTIAL_CHANGED",
      "Device credential changed before the authenticated session was registered",
    );
  }
  return currentDevice;
}

function createDeviceAuthenticator(options = {}) {
  if (typeof options.findDeviceById !== "function") {
    throw new TypeError("findDeviceById is required");
  }

  const findDeviceById = options.findDeviceById;
  const now = options.now || Date.now;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const challenges = new WeakMap();

  function issueChallenge(socket) {
    const issuedAt = now();
    const challenge = {
      protocolVersion: DEVICE_AUTH_PROTOCOL_VERSION,
      challengeId: randomBytes(16).toString("base64url"),
      nonce: randomBytes(32).toString("base64url"),
      expiresAt: new Date(issuedAt + DEVICE_AUTH_CHALLENGE_TTL_MS).toISOString(),
    };
    challenges.set(socket, { ...challenge, expiresAtMs: issuedAt + DEVICE_AUTH_CHALLENGE_TTL_MS });
    return { type: "auth.challenge", ...challenge };
  }

  async function authenticate(socket, response = {}) {
    const challenge = challenges.get(socket);
    challenges.delete(socket);
    const telemetryIsValid =
      response.telemetry &&
      typeof response.telemetry === "object" &&
      !Array.isArray(response.telemetry) &&
      !containsSensitiveDeviceCredential(response.telemetry);
    const fieldsAreValid = Object.keys(response).every((field) => DEVICE_AUTH_RESPONSE_FIELDS.has(field));

    if (
      !challenge ||
      response.type !== "auth.response" ||
      response.protocolVersion !== DEVICE_AUTH_PROTOCOL_VERSION ||
      response.challengeId !== challenge.challengeId ||
      !telemetryIsValid ||
      !fieldsAreValid ||
      now() > challenge.expiresAtMs
    ) {
      return { ok: false, code: "INVALID_CREDENTIALS" };
    }

    const deviceId = typeof response.deviceId === "string" ? response.deviceId.trim().slice(0, 120) : "";
    const suppliedProof = decodeBase64Url(response.proof);
    if (!deviceId || !suppliedProof || suppliedProof.length !== 32) {
      return { ok: false, code: "INVALID_CREDENTIALS" };
    }

    const device = await findDeviceById(deviceId);
    const currentKey = getDeviceVerificationKey(device);
    const candidateKey = getPendingRotationVerificationKey(device, now());
    const expectedCurrentProof = crypto
      .createHmac("sha256", currentKey || Buffer.alloc(32))
      .update(canonicalDeviceAuthBytes(challenge.challengeId, challenge.nonce, deviceId))
      .digest();
    const expectedCandidateProof = crypto
      .createHmac("sha256", candidateKey || Buffer.alloc(32))
      .update(canonicalDeviceAuthBytes(challenge.challengeId, challenge.nonce, deviceId))
      .digest();
    const currentMatches = Boolean(currentKey) && crypto.timingSafeEqual(expectedCurrentProof, suppliedProof);
    const candidateMatches = Boolean(candidateKey) && crypto.timingSafeEqual(expectedCandidateProof, suppliedProof);
    if (!device || (!currentMatches && !candidateMatches)) {
      return { ok: false, code: "INVALID_CREDENTIALS" };
    }
    if (device.revokedAt || device.status === "revoked") {
      return { ok: false, code: "REVOKED" };
    }

    const sessionId = randomBytes(16).toString("base64url");
    const credentialSlot = candidateMatches ? "rotation_candidate" : "current";
    const matchedKey = candidateMatches ? candidateKey : currentKey;
    return {
      ok: true,
      challengeId: challenge.challengeId,
      device,
      deviceId,
      sessionId,
      credentialSlot,
      rotationId: candidateMatches ? String(device.credentialRotation?.id || "") : "",
      credentialBinding: createDeviceCredentialBinding(matchedKey),
      rotationWrapKey: deriveDeviceRotationWrapKey(matchedKey, {
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        deviceId,
        sessionId,
      }),
    };
  }

  function clear(socket) {
    challenges.delete(socket);
  }

  return { authenticate, clear, issueChallenge };
}

module.exports = {
  DEVICE_AUTH_CHALLENGE_TTL_MS,
  DEVICE_AUTH_PROTOCOL_VERSION,
  canonicalDeviceRotationAad,
  canonicalDeviceSecretHash,
  canonicalDeviceAuthBytes,
  containsSensitiveDeviceCredential,
  assertDeviceAuthenticationFence,
  createDeviceCredentialBinding,
  createDeviceAuthenticator,
  deriveDeviceRotationWrapKey,
  getDeviceVerificationKey,
  normalizeDeviceSecretMaterial,
  sanitizeDeviceCredentialRotation,
  sanitizeDeviceTelemetry,
  sanitizePublicDeviceEventPayload,
  wrapDeviceRotationSecret,
};
