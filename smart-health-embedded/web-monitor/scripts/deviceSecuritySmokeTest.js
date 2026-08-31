const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const dgram = require("node:dgram");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { after, before, test } = require("node:test");
const { createRepositories } = require("../src/repositories");
const { upsertDevice: migrateDeviceToPostgres } = require("./migrateJsonToPostgres");
const {
  assertDeviceAuthenticationFence,
  canonicalDeviceRotationAad,
  canonicalDeviceSecretHash,
  containsSensitiveDeviceCredential,
  createDeviceAuthenticator,
  deriveDeviceRotationWrapKey,
  sanitizeDeviceTelemetry,
  sanitizePublicDeviceEventPayload,
  wrapDeviceRotationSecret,
} = require("../src/deviceSessionSecurity");
const { decodeAudioFrameV2, encodeAudioFrameV2 } = require("../src/audioProtocolV2");
const {
  applyDeviceCommandDelivery,
  createDeviceCommandEnvelope,
  createDeviceCommandRecord,
  expireDeviceCommandIfOverdue,
} = require("../src/deviceCommandLifecycle");
const { buildProductionReadiness } = require("../src/productionReadiness");
const { createFactoryEnrolledDeviceFixture } = require("./factoryDeviceFixture");
const { createDeviceOtaOwnershipBinding } = require("../src/deviceOtaLifecycle");
const {
  assertOtaUpgradeVersion,
  hashOtaDownloadToken,
  verifyOtaDownloadToken,
} = require("../src/otaManifestSigning");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, ".test-data", "device-security");
const authFenceReadyPath = path.join(dataDir, "auth-fence.ready");
const authFenceReleasePath = path.join(dataDir, "auth-fence.release");
const scanStopFinalizeReadyPath = path.join(dataDir, "scan-stop-finalize.ready");
const scanStopFinalizeReleasePath = path.join(dataDir, "scan-stop-finalize.release");
const port = 3462;
const audioPort = 3463;
const UINT32_MAX = 0xFFFF_FFFF;
const secrets = {
  alpha: "alpha-device-secret",
  beta: "beta-device-secret",
  peer: "alpha-peer-device-secret",
  enrolled: "enrolled-device-secret-000000000001",
  rotated: "rotated-device-secret-000000000002",
  authFence: "auth-fence-device-secret-000000000003",
  otaPrivateValid: "private-ota-valid-device-secret-000000000004",
  otaPrivateMissing: "private-ota-missing-device-secret-00000000005",
  otaPrivateOversized: "private-ota-oversized-device-secret-000000006",
  otaPrivateTruncated: "private-ota-truncated-device-secret-000000007",
  otaPrivateTransfer: "private-ota-transfer-device-secret-0000000008",
};
const otaSigningKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const otaPrivateKeyPem = otaSigningKeys.privateKey.export({ type: "pkcs8", format: "pem" });
const otaPublicKeyPem = otaSigningKeys.publicKey.export({ type: "spki", format: "pem" });
const privateFirmwareBytes = Buffer.from("shcare-private-firmware-v1.2.0\n", "utf8");
const privateFirmwareChecksum = crypto.createHash("sha256").update(privateFirmwareBytes).digest("hex");
const oversizedFirmwareBytes = Buffer.alloc(1024 * 1024 + 1, 0x5a);
const oversizedFirmwareChecksum = crypto.createHash("sha256").update(oversizedFirmwareBytes).digest("hex");
const truncatedFirmwareBytes = privateFirmwareBytes.subarray(0, 8);
const privateFirmwareObjectKey = "org/org_alpha/storage/device-firmware/shcare-1.2.0.bin";
const missingFirmwareObjectKey = "org/org_alpha/storage/device-firmware/missing-1.2.0.bin";
const oversizedFirmwareObjectKey = "org/org_alpha/storage/device-firmware/oversized-1.2.0.bin";
const truncatedFirmwareObjectKey = "org/org_alpha/storage/device-firmware/truncated-1.2.0.bin";
const seededOtaTokens = Object.freeze({
  deliveryExpired: "delivery-expired-private-ota-token-0000000001",
  expired: "expired-private-ota-download-token-000000000001",
  terminal: "terminal-private-ota-download-token-00000000001",
  revoked: "revoked-private-ota-download-token-000000000001",
  replaced: "replaced-private-ota-download-token-0000000001",
  missingExpiry: "missing-expiry-private-ota-token-000000000001",
  malformedExpiry: "malformed-expiry-private-ota-token-000000001",
});

let child;
let stderr = "";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(filePath, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return;
    await delay(5);
  }
  assert.fail(`timed out waiting for file ${filePath}`);
}

function writeSeedDb() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const createdAt = new Date().toISOString();
  const factoryDevice = (deviceId, organizationId, factoryCredential) =>
    createFactoryEnrolledDeviceFixture({
      deviceId,
      organizationId,
      factoryCredential,
      createdAt,
    });
  const privateOtaDevice = (id, secret, extra = {}) => ({
    id,
    name: id,
    type: "stethoscope",
    status: "available",
    organizationId: "org_alpha",
    connected: false,
    secret,
    firmwareVersion: "1.0.0",
    createdAt,
    updatedAt: createdAt,
    ...extra,
  });
  const seededOtaLifecycle = ({
    id,
    token,
    status = "delivered",
    expiresAt,
    objectKey = privateFirmwareObjectKey,
  }) => ({
    protocolVersion: 1,
    id,
    commandId: id,
    correlationId: `correlation_${id}`,
    firmwareVersion: "1.2.0",
    checksum: privateFirmwareChecksum,
    firmwareFileId: "firmware_private_valid",
    firmwareFileName: "shcare-1.2.0.bin",
    firmwareStorageBucket: "device-firmware",
    firmwareObjectKey: objectKey,
    firmwareByteSize: privateFirmwareBytes.length,
    hardwareTarget: "MSM261S4030H0",
    partitionTarget: "app",
    minimumProtocolVersion: 1,
    tokenHash: hashOtaDownloadToken(token),
    expiresAt,
    status,
    requestedByUserId: "usr_platform",
    requestedSessionId: "session_seeded_ota",
    createdAt,
    updatedAt: createdAt,
  });
  const seededProvisionedOtaLifecycle = (input) => {
    const grant = {
      ...seededOtaLifecycle(input),
      organizationId: "org_alpha",
      ownerUserId: "",
      ownershipState: "provisioned",
    };
    return {
      ...grant,
      ownershipBinding: createDeviceOtaOwnershipBinding(grant),
    };
  };
  fs.writeFileSync(
    path.join(dataDir, "db.json"),
    JSON.stringify(
      {
        version: 1,
        createdAt,
        updatedAt: createdAt,
        organizations: [
          { id: "org_alpha", name: "Alpha Clinic", type: "clinic", status: "active", createdAt, updatedAt: createdAt },
          { id: "org_beta", name: "Beta Clinic", type: "clinic", status: "active", createdAt, updatedAt: createdAt },
        ],
        users: [
          {
            id: "usr_platform",
            role: "admin",
            requestedRole: "admin",
            roleRequestStatus: "approved",
            accountStatus: "active",
            name: "Platform Admin",
            email: "platform@smarthealth.test",
            password: "12345678",
            organizationId: "org_alpha",
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "usr_doctor_alpha",
            role: "doctor",
            requestedRole: "doctor",
            roleRequestStatus: "approved",
            accountStatus: "active",
            name: "Alpha Doctor",
            email: "doctor@alpha.test",
            password: "12345678",
            organizationId: "org_alpha",
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "usr_admin_beta",
            role: "workspace_admin",
            requestedRole: "workspace_admin",
            roleRequestStatus: "approved",
            accountStatus: "active",
            name: "Beta Workspace Admin",
            email: "admin@beta.test",
            password: "12345678",
            organizationId: "org_beta",
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "usr_admin_multi",
            role: "workspace_admin",
            requestedRole: "workspace_admin",
            roleRequestStatus: "approved",
            accountStatus: "active",
            name: "Multi Workspace Admin",
            email: "admin@multi.test",
            password: "12345678",
            organizationId: "org_alpha",
            createdAt,
            updatedAt: createdAt,
          },
        ],
        memberships: [
          { id: "mem_platform", userId: "usr_platform", organizationId: "org_alpha", role: "platform_admin", createdAt },
          { id: "mem_doctor_alpha", userId: "usr_doctor_alpha", organizationId: "org_alpha", role: "doctor", createdAt },
          { id: "mem_admin_beta", userId: "usr_admin_beta", organizationId: "org_beta", role: "workspace_admin", createdAt },
          { id: "mem_admin_multi_alpha", userId: "usr_admin_multi", organizationId: "org_alpha", role: "workspace_admin", createdAt },
          { id: "mem_admin_multi_beta", userId: "usr_admin_multi", organizationId: "org_beta", role: "workspace_admin", createdAt },
        ],
        patients: [
          { id: "pat_alpha", patientCode: "ALPHA-001", name: "Alpha Patient", organizationId: "org_alpha", createdAt, updatedAt: createdAt },
          { id: "pat_beta", patientCode: "BETA-001", name: "Beta Patient", organizationId: "org_beta", createdAt, updatedAt: createdAt },
        ],
        devices: [
          {
            id: "dev_alpha",
            name: "Alpha Device",
            type: "stethoscope",
            status: "available",
            organizationId: "org_alpha",
            connected: false,
            secret: secrets.alpha,
            deviceSecret: "legacy-device-secret-that-must-never-be-public",
            factoryCredential: "factory-credential-that-must-never-be-public",
            setupAp: { proofOfPossession: "setup-pop-that-must-never-be-public" },
            unknownClinicalMetadata: { note: "unknown-device-metadata-must-not-be-public" },
            lastCommand: {
              protocolVersion: 1,
              id: "cmd_seed_private",
              deviceId: "dev_alpha",
              organizationId: "org_alpha",
              type: "restart",
              correlationId: "corr_seed_private",
              state: "accepted",
              idempotencyKey: "device-command-key-must-not-be-public",
              requestFingerprint: "device-command-fingerprint-must-not-be-public",
              payload: { password: "device-command-payload-must-not-be-public" },
              issuedAt: createdAt,
              expiresAt: new Date(Date.parse(createdAt) + 60_000).toISOString(),
              delivery: {
                websocket: false,
                mqtt: false,
                delivered: false,
                authorization: "delivery-authorization-must-not-be-public",
              },
            },
            ota: {
              id: "ota_seed_private",
              commandId: "cmd_seed_private",
              firmwareVersion: "1.1.0",
              status: "pending",
              checksum: "sha256:public-artifact-integrity",
              token: "ota-token-that-must-never-be-public",
              signature: "ota-signature-that-must-never-be-public",
              url: "https://signed-download.invalid/private",
            },
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "dev_beta",
            name: "Beta Device",
            type: "stethoscope",
            status: "available",
            organizationId: "org_beta",
            connected: false,
            secret: secrets.beta,
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "dev_release",
            name: "Release Contract Device",
            type: "stethoscope",
            status: "available",
            organizationId: "org_beta",
            ownershipState: "claimed",
            ownerUserId: "usr_admin_beta",
            pairedUserId: "usr_admin_beta",
            connected: false,
            secret: "release-contract-device-secret",
            historyMarker: "retained",
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "dev_alpha_peer",
            name: "Alpha Peer Device",
            type: "stethoscope",
            status: "available",
            organizationId: "org_alpha",
            ownershipState: "claimed",
            ownerUserId: "usr_platform",
            pairedUserId: "usr_platform",
            connected: false,
            secret: secrets.peer,
            firmwareVersion: "1.0.0",
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "dev_auth_fence",
            name: "Authentication Fence Device",
            type: "stethoscope",
            status: "available",
            organizationId: "org_alpha",
            ownershipState: "claimed",
            ownerUserId: "usr_platform",
            pairedUserId: "usr_platform",
            connected: false,
            secret: secrets.authFence,
            createdAt,
            updatedAt: createdAt,
          },
          privateOtaDevice("dev_ota_private_valid", secrets.otaPrivateValid),
          privateOtaDevice("dev_ota_private_missing", secrets.otaPrivateMissing),
          privateOtaDevice("dev_ota_private_oversized", secrets.otaPrivateOversized),
          privateOtaDevice("dev_ota_private_truncated", secrets.otaPrivateTruncated),
          privateOtaDevice("dev_ota_private_transfer", secrets.otaPrivateTransfer),
          privateOtaDevice("dev_ota_download_delivery_expired", "seeded-delivery-expired-secret", {
            ownershipState: "provisioned",
            ownerUserId: "",
            pairedUserId: "",
            ota: seededProvisionedOtaLifecycle({
              id: "ota_seeded_delivery_expired",
              token: seededOtaTokens.deliveryExpired,
              expiresAt: new Date(Date.parse(createdAt) + 60 * 60_000).toISOString(),
            }),
          }),
          privateOtaDevice("dev_ota_download_missing_expiry", "seeded-missing-expiry-secret", {
            ota: seededOtaLifecycle({
              id: "ota_seeded_missing_expiry",
              token: seededOtaTokens.missingExpiry,
            }),
          }),
          privateOtaDevice("dev_ota_download_malformed_expiry", "seeded-malformed-expiry-secret", {
            ota: seededOtaLifecycle({
              id: "ota_seeded_malformed_expiry",
              token: seededOtaTokens.malformedExpiry,
              expiresAt: "not-a-date",
            }),
          }),
          privateOtaDevice("dev_ota_download_expired", "seeded-expired-device-secret", {
            ota: seededOtaLifecycle({
              id: "ota_seeded_expired",
              token: seededOtaTokens.expired,
              expiresAt: new Date(Date.parse(createdAt) - 60_000).toISOString(),
            }),
          }),
          privateOtaDevice("dev_ota_download_terminal", "seeded-terminal-device-secret", {
            ota: seededOtaLifecycle({
              id: "ota_seeded_terminal",
              token: seededOtaTokens.terminal,
              status: "failed",
              expiresAt: new Date(Date.parse(createdAt) + 60 * 60_000).toISOString(),
            }),
          }),
          privateOtaDevice("dev_ota_download_revoked", "seeded-revoked-device-secret", {
            status: "revoked",
            revokedAt: createdAt,
            ota: seededOtaLifecycle({
              id: "ota_seeded_revoked",
              token: seededOtaTokens.revoked,
              expiresAt: new Date(Date.parse(createdAt) + 60 * 60_000).toISOString(),
            }),
          }),
          privateOtaDevice("dev_ota_download_replaced", "seeded-replaced-device-secret", {
            ota: seededOtaLifecycle({
              id: "ota_replacement_current",
              token: seededOtaTokens.replaced,
              expiresAt: new Date(Date.parse(createdAt) + 60 * 60_000).toISOString(),
            }),
          }),
          factoryDevice(
            "dev_inventory_metadata",
            "org_alpha",
            "factory-inventory-metadata-secret-000000000001",
          ),
          factoryDevice(
            "dev_provision_idempotent",
            "org_alpha",
            "factory-idempotent-provision-secret-000000000001",
          ),
          factoryDevice("dev_pair_scope_alpha", "org_alpha", "factory-pair-alpha-secret-000000000001"),
          factoryDevice("dev_pair_scope_beta", "org_beta", "factory-pair-beta-secret-000000000001"),
          factoryDevice("dev_pair_active_beta", "org_beta", "factory-pair-active-beta-secret-000000000001"),
          factoryDevice("dev_pair_concurrent", "org_alpha", "factory-pair-concurrent-secret-000000000001"),
          factoryDevice(
            "dev_pair_revoked_replay",
            "org_alpha",
            "factory-pair-revoked-replay-secret-000000000001",
          ),
          factoryDevice("dev_pair_qr", "org_alpha", "factory-pair-qr-secret-000000000001"),
          factoryDevice("dev_enrolled", "org_alpha", secrets.enrolled),
        ],
        deviceCommands: [
          ...[
            ["ota_seeded_missing_expiry", "dev_ota_download_missing_expiry"],
            ["ota_seeded_malformed_expiry", "dev_ota_download_malformed_expiry"],
          ].map(([id, deviceId]) => ({
            protocolVersion: 1,
            id,
            deviceId,
            organizationId: "org_alpha",
            type: "ota.update",
            correlationId: `correlation_${id}`,
            state: "accepted",
            code: "COMMAND_ACCEPTED",
            detail: "",
            requestedByUserId: "usr_platform",
            issuedAt: createdAt,
            expiresAt: new Date(Date.parse(createdAt) + 5 * 60_000).toISOString(),
            executionExpiresAt: new Date(Date.parse(createdAt) + 60 * 60_000).toISOString(),
            acceptedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
          })),
          {
            protocolVersion: 1,
            id: "ota_seeded_delivery_expired",
            deviceId: "dev_ota_download_delivery_expired",
            organizationId: "org_alpha",
            type: "ota.update",
            correlationId: "correlation_ota_seeded_delivery_expired",
            state: "delivered",
            code: "TRANSPORT_DELIVERED",
            detail: "Command delivered without an authenticated acknowledgement",
            requestedByUserId: "usr_platform",
            issuedAt: new Date(Date.parse(createdAt) - 2 * 60_000).toISOString(),
            expiresAt: new Date(Date.parse(createdAt) - 60_000).toISOString(),
            executionExpiresAt: new Date(Date.parse(createdAt) + 60 * 60_000).toISOString(),
            acceptedAt: new Date(Date.parse(createdAt) - 2 * 60_000).toISOString(),
            deliveredAt: new Date(Date.parse(createdAt) - 90_000).toISOString(),
            delivery: { websocket: true, mqtt: false, delivered: true },
            createdAt: new Date(Date.parse(createdAt) - 2 * 60_000).toISOString(),
            updatedAt: new Date(Date.parse(createdAt) - 90_000).toISOString(),
          },
        ],
        scans: [
          {
            id: "scan_restart_created",
            organizationId: "org_alpha",
            patientId: "pat_alpha",
            patient: { id: "pat_alpha", patientCode: "ALPHA-001", name: "Alpha Patient" },
            deviceId: "dev_alpha_peer",
            status: "created",
            processingStatus: "created",
            aiLabel: "created",
            startedAt: createdAt,
            endedAt: null,
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "scan_restart_recording",
            organizationId: "org_alpha",
            patientId: "pat_alpha",
            patient: { id: "pat_alpha", patientCode: "ALPHA-001", name: "Alpha Patient" },
            deviceId: "dev_alpha_peer",
            status: "recording",
            processingStatus: "recording",
            aiLabel: "recording",
            startedAt: createdAt,
            endedAt: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
        deviceEvents: [],
        sessions: [],
        notifications: [],
        accessLogs: [],
        auditLogs: [],
        audioFiles: [],
        aiResults: [],
        storageBuckets: [],
        storageFiles: [
          {
            id: "firmware_private_valid",
            organizationId: "org_alpha",
            bucket: "device-firmware",
            objectKey: privateFirmwareObjectKey,
            name: "shcare-1.2.0.bin",
            contentType: "application/octet-stream",
            byteSize: privateFirmwareBytes.length,
            checksum: privateFirmwareChecksum,
            sha256: privateFirmwareChecksum,
            firmwareVersion: "1.2.0",
            status: "active",
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "firmware_private_missing",
            organizationId: "org_alpha",
            bucket: "device-firmware",
            objectKey: missingFirmwareObjectKey,
            name: "missing-1.2.0.bin",
            contentType: "application/octet-stream",
            byteSize: privateFirmwareBytes.length,
            checksum: privateFirmwareChecksum,
            sha256: privateFirmwareChecksum,
            firmwareVersion: "1.2.0",
            status: "active",
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "firmware_private_oversized",
            organizationId: "org_alpha",
            bucket: "device-firmware",
            objectKey: oversizedFirmwareObjectKey,
            name: "oversized-1.2.0.bin",
            contentType: "application/octet-stream",
            // The registry metadata is deliberately stale so the download
            // boundary must validate the actual object length before state
            // advances to downloading.
            byteSize: privateFirmwareBytes.length,
            checksum: oversizedFirmwareChecksum,
            sha256: oversizedFirmwareChecksum,
            firmwareVersion: "1.2.0",
            status: "active",
            createdAt,
            updatedAt: createdAt,
          },
          {
            id: "firmware_private_truncated",
            organizationId: "org_alpha",
            bucket: "device-firmware",
            objectKey: truncatedFirmwareObjectKey,
            name: "truncated-1.2.0.bin",
            contentType: "application/octet-stream",
            byteSize: privateFirmwareBytes.length,
            checksum: privateFirmwareChecksum,
            sha256: privateFirmwareChecksum,
            firmwareVersion: "1.2.0",
            status: "active",
            createdAt,
            updatedAt: createdAt,
          },
        ],
        servicePackages: [],
        subscriptions: [],
        exports: [],
        settings: { storage: {}, privacy: {}, stethoscope: {}, ai: {} },
      },
      null,
      2,
    ),
  );
  for (const [objectKey, bytes] of [
    [privateFirmwareObjectKey, privateFirmwareBytes],
    [oversizedFirmwareObjectKey, oversizedFirmwareBytes],
    [truncatedFirmwareObjectKey, truncatedFirmwareBytes],
  ]) {
    const objectPath = path.join(
      dataDir,
      "objects",
      ...objectKey.split("/").map((part) => path.basename(part)),
    );
    fs.mkdirSync(path.dirname(objectPath), { recursive: true });
    fs.writeFileSync(objectPath, bytes);
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error("device security backend did not start");
}

function openSocket(pathname, protocols) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${pathname}`, protocols);
  socket.binaryType = "arraybuffer";
  const messages = [];
  const messageWaiters = [];
  let closeEvent = null;
  const closeWaiters = [];

  socket.addEventListener("message", (event) => {
    const value =
      typeof event.data === "string"
        ? { binary: false, value: event.data }
        : { binary: true, value: Buffer.from(event.data) };
    const waiter = messageWaiters.shift();
    if (waiter) waiter.resolve(value);
    else messages.push(value);
  });
  socket.addEventListener("close", (event) => {
    closeEvent = event;
    for (const waiter of closeWaiters.splice(0)) waiter.resolve(event);
  });

  const takeMessage = (timeoutMs, label = "WebSocket message") =>
    messages.length
      ? Promise.resolve(messages.shift())
      : new Promise((resolve, reject) => {
          const waiter = { resolve, reject };
          messageWaiters.push(waiter);
          const timer = setTimeout(() => {
            const index = messageWaiters.indexOf(waiter);
            if (index >= 0) messageWaiters.splice(index, 1);
            reject(new Error(`timed out waiting for ${label} on ${pathname}`));
          }, timeoutMs);
          waiter.resolve = (value) => {
            clearTimeout(timer);
            resolve(value);
          };
        });

  return {
    socket,
    opened: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
    async nextJson(timeoutMs = 1_500) {
      const raw = await takeMessage(timeoutMs);
      if (raw.binary) {
        throw new Error(`expected JSON but received binary WebSocket data on ${pathname}`);
      }
      return JSON.parse(raw.value);
    },
    async nextBinary(timeoutMs = 1_500) {
      const raw = await takeMessage(timeoutMs, "binary WebSocket data");
      if (!raw.binary) {
        throw new Error(`expected binary but received text WebSocket data on ${pathname}`);
      }
      return raw.value;
    },
    nextMessage(timeoutMs = 1_500) {
      return takeMessage(timeoutMs);
    },
    closed(timeoutMs = 1_500) {
      if (closeEvent) return Promise.resolve(closeEvent);
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject };
        closeWaiters.push(waiter);
        const timer = setTimeout(() => {
          const index = closeWaiters.indexOf(waiter);
          if (index >= 0) closeWaiters.splice(index, 1);
          reject(new Error(`timed out waiting for WebSocket close on ${pathname}`));
        }, timeoutMs);
        waiter.resolve = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
      });
    },
  };
}

function pcmPacket(sampleCount = 128, value = 900) {
  const packet = Buffer.alloc(sampleCount * 2);
  for (let offset = 0; offset < packet.length; offset += 2) packet.writeInt16LE(value, offset);
  return packet;
}

function createDeviceProof(challenge, deviceId, secret) {
  const key = crypto.createHash("sha256").update(secret, "utf8").digest();
  const canonical = `smart-health-device-auth-v1\n${challenge.challengeId}\n${challenge.nonce}\n${deviceId}`;
  return crypto.createHmac("sha256", key).update(canonical, "utf8").digest("base64url");
}

function unwrapRotationSecret(wrapped, wrapKey, context) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    wrapKey,
    Buffer.from(wrapped.iv, "base64url"),
  );
  decipher.setAAD(canonicalDeviceRotationAad(context));
  decipher.setAuthTag(Buffer.from(wrapped.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(wrapped.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function authenticateDevice(
  client,
  deviceId,
  secret,
  telemetry = { firmwareVersion: "security-smoke" },
) {
  const challenge = await client.nextJson();
  assert.equal(challenge.type, "auth.challenge");
  client.socket.send(
    JSON.stringify({
      type: "auth.response",
      protocolVersion: 1,
      deviceId,
      challengeId: challenge.challengeId,
      proof: createDeviceProof(challenge, deviceId, secret),
      telemetry,
    }),
  );
  const accepted = await client.nextJson();
  assert.equal(accepted.type, "auth.accepted");
  assert.equal(accepted.deviceId, deviceId);
  assert.equal(accepted.challengeId, challenge.challengeId);
  assert.ok(Number.isFinite(Date.parse(accepted.serverTime)), "accepted server time must follow the shared date-time contract");
  return { challenge, accepted };
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : {} };
}

async function waitForPersistedDevice(deviceId, predicate, timeoutMs = 2_000) {
  const dbPath = path.join(dataDir, "db.json");
  const deadline = Date.now() + timeoutMs;
  let latestDevice = null;
  while (Date.now() < deadline) {
    const persisted = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    latestDevice = persisted.devices.find((item) => item.id === deviceId) || null;
    if (latestDevice && predicate(latestDevice, persisted)) {
      return { device: latestDevice, persisted };
    }
    await delay(25);
  }
  assert.fail(`device ${deviceId} did not reach the expected persisted state: ${JSON.stringify(latestDevice)}`);
}

async function waitForCommandState(token, deviceId, commandId, expectedState, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await requestJson(
      `/api/v1/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(commandId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (latest.response.status === 200 && latest.body.command?.state === expectedState) {
      return latest.body.command;
    }
    await delay(25);
  }
  assert.fail(
    `command ${commandId} did not reach ${expectedState}: ${JSON.stringify(latest?.body || {})}`,
  );
}

async function waitForScanState(token, scanId, expectedState, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await requestJson(`/api/v1/scans/${encodeURIComponent(scanId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (latest.response.status === 200 && latest.body.scan?.status === expectedState) {
      return latest.body.scan;
    }
    await delay(25);
  }
  assert.fail(`scan ${scanId} did not reach ${expectedState}: ${JSON.stringify(latest?.body || {})}`);
}

function sendDeviceCommandStatus(client, command, state, code, detail = state) {
  client.socket.send(
    JSON.stringify({
      protocolVersion: 1,
      type: "command.status",
      commandId: command.id,
      correlationId: command.correlationId,
      state,
      code,
      detail,
    }),
  );
}

async function confirmDeviceCommandApplied(client, command) {
  sendDeviceCommandStatus(client, command, "acknowledged", "COMMAND_ACKNOWLEDGED");
  sendDeviceCommandStatus(client, command, "applying", "COMMAND_APPLYING");
  sendDeviceCommandStatus(client, command, "applied", "OK", "device applied audio session command");
}

async function login(email) {
  const result = await requestJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: email, password: "12345678" }),
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.token;
}

async function loginPlatformAdmin() {
  return login("platform@smarthealth.test");
}

async function sendUdpPacket(packet) {
  const client = dgram.createSocket("udp4");
  await new Promise((resolve, reject) => {
    client.send(packet, audioPort, "127.0.0.1", (error) => {
      client.close();
      if (error) reject(error);
      else resolve();
    });
  });
}

before(async () => {
  writeSeedDb();
  child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      AUDIO_UDP_PORT: String(audioPort),
      DATA_BACKEND: "json",
      DATA_DIR: dataDir,
      AUTH_MODE: "demo",
      FIREBASE_AUTH_ENABLED: "false",
      OBJECT_STORAGE_PROVIDER: "local",
      LOCAL_OBJECT_STORAGE_DIR: path.join(dataDir, "objects"),
      OTA_MAX_FIRMWARE_BYTES: String(1024 * 1024),
      OTA_SIGNING_PRIVATE_KEY_PEM: otaPrivateKeyPem,
      NODE_ENV: "test",
      DEVICE_AUTH_FENCE_TEST_DEVICE_ID: "dev_auth_fence",
      DEVICE_AUTH_FENCE_TEST_READY_FILE: authFenceReadyPath,
      DEVICE_AUTH_FENCE_TEST_RELEASE_FILE: authFenceReleasePath,
      SCAN_STOP_FINALIZE_TEST_READY_FILE: scanStopFinalizeReadyPath,
      SCAN_STOP_FINALIZE_TEST_RELEASE_FILE: scanStopFinalizeReleasePath,
      SCAN_STOP_FINALIZE_TEST_IDEMPOTENCY_KEY: "audio-stop-finalize-before-ack-stop",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  await waitForHealth();
});

test("device events for one device execute in receive order across async persistence", async () => {
  let createKeyedSerialExecutor;
  try {
    ({ createKeyedSerialExecutor } = require("../src/deviceEventQueue"));
  } catch {}
  assert.equal(
    typeof createKeyedSerialExecutor,
    "function",
    "the backend needs a per-device serial executor before accepting consecutive command states",
  );

  const executor = createKeyedSerialExecutor();
  const order = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const acknowledged = executor.enqueue("dev_rotation_serial", async () => {
    order.push("acknowledged:start");
    await firstGate;
    order.push("acknowledged:committed");
  });
  const applying = executor.enqueue("dev_rotation_serial", async () => {
    order.push("applying:start");
    order.push("applying:committed");
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["acknowledged:start"]);
  releaseFirst();
  await Promise.all([acknowledged, applying]);
  assert.deepEqual(order, [
    "acknowledged:start",
    "acknowledged:committed",
    "applying:start",
    "applying:committed",
  ]);
});

test("device credential overlap identifies the verified slot and derives a session-bound wrapping key", async () => {
  const oldSecret = "device-old-credential-for-overlap-test";
  const nextSecret = "device-next-credential-for-overlap-test";
  const device = {
    id: "dev_rotation_unit",
    organizationId: "org_rotation_unit",
    status: "available",
    secretHash: canonicalDeviceSecretHash(oldSecret),
    credentialRotation: {
      id: "rotation_unit",
      state: "pending_device_ack",
      nextSecretHash: canonicalDeviceSecretHash(nextSecret),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  };
  const authenticator = createDeviceAuthenticator({
    findDeviceById: async (id) => (id === device.id ? device : null),
  });

  for (const [secret, expectedSlot] of [[oldSecret, "current"], [nextSecret, "rotation_candidate"]]) {
    const socket = {};
    const challenge = authenticator.issueChallenge(socket);
    const response = {
      type: "auth.response",
      protocolVersion: 1,
      deviceId: device.id,
      challengeId: challenge.challengeId,
      proof: createDeviceProof(challenge, device.id, secret),
      telemetry: {},
    };
    const result = await authenticator.authenticate(socket, response);
    assert.equal(result.ok, true);
    assert.equal(result.credentialSlot, expectedSlot);
    assert.equal(result.rotationId, expectedSlot === "rotation_candidate" ? "rotation_unit" : "");
    assert.ok(result.credentialBinding);
    assert.doesNotThrow(() => assertDeviceAuthenticationFence(device, result));
    assert.equal(result.rotationWrapKey.length, 32);
    const expectedKey = deriveDeviceRotationWrapKey(
      crypto.createHash("sha256").update(secret, "utf8").digest(),
      {
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        deviceId: device.id,
        sessionId: result.sessionId,
      },
    );
    assert.equal(crypto.timingSafeEqual(result.rotationWrapKey, expectedKey), true);
  }

  device.credentialRotation.expiresAt = new Date(Date.now() - 1).toISOString();
  const expiredSocket = {};
  const expiredChallenge = authenticator.issueChallenge(expiredSocket);
  const expiredResult = await authenticator.authenticate(expiredSocket, {
    type: "auth.response",
    protocolVersion: 1,
    deviceId: device.id,
    challengeId: expiredChallenge.challengeId,
    proof: createDeviceProof(expiredChallenge, device.id, nextSecret),
    telemetry: {},
  });
  assert.deepEqual(expiredResult, { ok: false, code: "INVALID_CREDENTIALS" });
});

test("the final device authentication fence rejects changed workspace, revocation, and credentials", async () => {
  const secret = "device-authentication-fence-unit-secret";
  const device = {
    id: "dev_authentication_fence_unit",
    organizationId: "org_authentication_fence_unit",
    status: "available",
    secretHash: canonicalDeviceSecretHash(secret),
  };
  const authenticator = createDeviceAuthenticator({
    findDeviceById: async () => device,
  });
  const socket = {};
  const challenge = authenticator.issueChallenge(socket);
  const result = await authenticator.authenticate(socket, {
    type: "auth.response",
    protocolVersion: 1,
    deviceId: device.id,
    challengeId: challenge.challengeId,
    proof: createDeviceProof(challenge, device.id, secret),
    telemetry: {},
  });
  assert.equal(result.ok, true);
  assert.doesNotThrow(() => assertDeviceAuthenticationFence(device, result));
  assert.throws(
    () => assertDeviceAuthenticationFence({ ...device, organizationId: "org_other" }, result),
    (error) => error?.code === "DEVICE_AUTH_AUTHORITY_CHANGED",
  );
  assert.throws(
    () => assertDeviceAuthenticationFence({ ...device, status: "revoked" }, result),
    (error) => error?.code === "DEVICE_AUTH_AUTHORITY_CHANGED",
  );
  assert.throws(
    () => assertDeviceAuthenticationFence({
      ...device,
      secretHash: canonicalDeviceSecretHash("different-device-credential"),
    }, result),
    (error) => error?.code === "DEVICE_AUTH_CREDENTIAL_CHANGED",
  );
});

test("rotation credential wrapping is session-bound authenticated encryption", () => {
  const verificationKey = crypto.createHash("sha256").update("current-device-secret", "utf8").digest();
  const session = {
    challengeId: "challenge_rotation_test",
    nonce: "nonce_rotation_test_which_is_long_enough",
    deviceId: "dev_rotation_wrap",
    sessionId: "session_rotation_test",
  };
  const wrapKey = deriveDeviceRotationWrapKey(verificationKey, session);
  const context = {
    rotationId: "rotation_wrap_test",
    deviceId: session.deviceId,
    sessionId: session.sessionId,
  };
  const secret = Buffer.from("server-generated-next-device-credential", "utf8");
  const expectedSecret = secret.toString("utf8");
  const wrapped = wrapDeviceRotationSecret(secret, wrapKey, context);
  assert.equal(wrapped.algorithm, "A256GCM");
  assert.equal(JSON.stringify(wrapped).includes(expectedSecret), false);
  assert.equal(unwrapRotationSecret(wrapped, wrapKey, context), expectedSecret);
  assert.equal(canonicalDeviceSecretHash(secret), canonicalDeviceSecretHash(expectedSecret));
  secret.fill(0);
  assert.equal(secret.every((value) => value === 0), true);
  assert.throws(
    () => unwrapRotationSecret(wrapped, wrapKey, { ...context, sessionId: "another-session" }),
    /authenticate|Unsupported state/i,
  );
});

after(async () => {
  if (child) child.kill();
  await delay(250);
  if (stderr) process.stderr.write(stderr);
});

test("device query credentials cannot register or stream before challenge authentication", async () => {
  const esp = openSocket(`/esp?deviceId=dev_alpha&secret=${encodeURIComponent(secrets.alpha)}`);
  await esp.opened;

  const listener = openSocket("/app");
  await listener.opened;
  const status = await listener.nextJson();
  assert.equal(status.type, "status");
  assert.equal(status.wsEsp, 0, "pending device socket must not enter the authenticated ESP registry");

  const challenge = await esp.nextJson();
  assert.equal(challenge.type, "auth.challenge");
  assert.equal(challenge.protocolVersion, 1);
  assert.ok(challenge.challengeId);
  assert.ok(challenge.nonce);
  assert.ok(Number.isFinite(Date.parse(challenge.expiresAt)), "challenge expiry must follow the shared date-time contract");

  esp.socket.send(pcmPacket());
  const closed = await esp.closed();
  assert.equal(closed.code, 1008, "binary audio before authentication must close with policy violation");
  listener.socket.close();
});

test("public device projections use an allowlist and strip nested command or OTA credentials", async () => {
  const token = await loginPlatformAdmin();
  const result = await requestJson("/api/v1/devices", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  const device = result.body.devices.find((item) => item.id === "dev_alpha");
  assert.ok(device, "the seeded device must be visible to Platform Admin");
  assert.equal(device.factoryCredential, undefined);
  assert.equal(device.setupAp, undefined);
  assert.equal(device.unknownClinicalMetadata, undefined);
  assert.equal(device.lastCommand?.idempotencyKey, undefined);
  assert.equal(device.lastCommand?.requestFingerprint, undefined);
  assert.equal(device.lastCommand?.payload, undefined);
  assert.equal(device.lastCommand?.delivery?.authorization, undefined);
  assert.equal(device.ota, undefined, "an incomplete legacy OTA lifecycle must not be projected as canonical");
  assert.equal(device.otaStatus, undefined);
  assert.doesNotMatch(
    JSON.stringify(device),
    /must-not-be-public|signed-download\.invalid/,
  );
});

test("Wi-Fi setup sessions require an assigned manageable device and never disclose its verifier", async () => {
  const token = await loginPlatformAdmin();
  const unassigned = await requestJson("/api/v1/devices/dev_alpha/setup-session", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ supportedTransports: ["esptouch_v2"] }),
  });
  assert.equal(unassigned.response.status, 409, JSON.stringify(unassigned.body));
  assert.equal(unassigned.body.code, "device_wifi_setup_not_assigned");

  const opened = await requestJson("/api/v1/devices/dev_auth_fence/setup-session", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ supportedTransports: ["esptouch_v2"] }),
  });
  assert.equal(opened.response.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.response.headers.get("cache-control"), "no-store");
  assert.equal(opened.body.setup?.protocolVersion, 2);
  assert.equal(opened.body.setup?.transport, "esptouch_v2");
  assert.equal(opened.body.setup?.smartConfig?.security, "aes128");
  assert.match(opened.body.setup?.smartConfig?.provisioningKey || "", /^[A-Za-z0-9_-]{22}$/);
  const reservedData = Buffer.from(
    opened.body.setup?.smartConfig?.reservedData || "",
    "base64url",
  ).toString("ascii");
  assert.match(reservedData, /^v2:[a-f0-9]{32}$/);
  assert.equal(opened.body.setup?.setupAp, undefined);
  assert.ok(Number.isFinite(Date.parse(opened.body.setup?.expiresAt)));
  assert.doesNotMatch(JSON.stringify(opened.body), /auth-fence-device-secret|secretHash|"secret"/);

  const legacy = await requestJson("/api/v1/devices/dev_auth_fence/setup-session", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ supportedTransports: ["softap_v1"] }),
  });
  assert.equal(legacy.response.status, 426, JSON.stringify(legacy.body));
  assert.equal(legacy.body.code, "device_wifi_setup_transport_upgrade_required");
});

test("provisioning authorizes an existing device before any workspace mutation", async () => {
  const betaAdminToken = await login("admin@beta.test");
  const attemptedTakeover = await requestJson("/api/v1/devices/provision-qr", {
    method: "POST",
    headers: { Authorization: `Bearer ${betaAdminToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: "dev_alpha", organizationId: "org_beta", name: "Taken Device" }),
  });
  assert.equal(attemptedTakeover.response.status, 403);
  assert.equal(attemptedTakeover.body.code, "device_provision_platform_admin_required");

  const platformToken = await loginPlatformAdmin();
  const devices = await requestJson("/api/v1/devices", {
    headers: { Authorization: `Bearer ${platformToken}` },
  });
  const alphaDevice = devices.body.devices.find((device) => device.id === "dev_alpha");
  assert.equal(alphaDevice.organizationId, "org_alpha");
  assert.equal(alphaDevice.name, "Alpha Device");
  assert.notEqual(alphaDevice.status, "unclaimed");
  assert.equal(alphaDevice.deviceSecret, undefined, "legacy credential aliases must never be exposed");
});

test("device provisioning persists the inventory fields shown by Platform Admin", async () => {
  const token = await loginPlatformAdmin();
  const credentialInjection = await requestJson("/api/v1/devices/provision-qr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "provision-credential-injection-rejected",
    },
    body: JSON.stringify({
      deviceId: "dev_inventory_metadata",
      organizationId: "org_alpha",
      deviceSecret: "browser-must-not-enroll-device-credentials",
    }),
  });
  assert.equal(credentialInjection.response.status, 400);
  assert.equal(credentialInjection.body.code, "device_provision_credential_field_forbidden");

  const provisioned = await requestJson("/api/v1/devices/provision-qr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "provision-inventory-metadata",
    },
    body: JSON.stringify({
      deviceId: "dev_inventory_metadata",
      name: "Inventory Metadata Device",
      type: "respiratory",
      organizationId: "org_alpha",
      manufacturer: "Shcare Labs",
      model: "SH-RPM-1",
      serialNumber: "SERIAL-INVENTORY-001",
      purchaseDate: "2026-07-17",
    }),
  });
  assert.equal(provisioned.response.status, 201, JSON.stringify(provisioned.body));
  assert.deepEqual(Object.keys(provisioned.body).sort(), ["claim", "device"]);
  assert.deepEqual(Object.keys(provisioned.body.device).sort(), [
    "connected",
    "createdAt",
    "id",
    "manufacturer",
    "model",
    "name",
    "online",
    "organizationId",
    "ownershipState",
    "purchaseDate",
    "serialNumber",
    "status",
    "type",
    "updatedAt",
  ]);
  assert.deepEqual(Object.keys(provisioned.body.claim).sort(), [
    "claimCode",
    "deviceId",
    "expiresAt",
    "qrPayload",
  ]);
  assert.equal(provisioned.body.claim.deviceId, provisioned.body.device.id);
  assert.equal(provisioned.body.claim.qrPayload.deviceId, provisioned.body.device.id);
  assert.equal(provisioned.body.claim.qrPayload.claimCode, provisioned.body.claim.claimCode);
  assert.equal(provisioned.body.claim.qrPayload.claimExpiresAt, provisioned.body.claim.expiresAt);
  assert.deepEqual(
    {
      type: provisioned.body.device.type,
      manufacturer: provisioned.body.device.manufacturer,
      model: provisioned.body.device.model,
      serialNumber: provisioned.body.device.serialNumber,
      purchaseDate: provisioned.body.device.purchaseDate,
    },
    {
      type: "respiratory",
      manufacturer: "Shcare Labs",
      model: "SH-RPM-1",
      serialNumber: "SERIAL-INVENTORY-001",
      purchaseDate: "2026-07-17",
    },
  );
  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const persistedDevice = persisted.devices.find((device) => device.id === "dev_inventory_metadata");
  assert.deepEqual(
    {
      type: persistedDevice?.type,
      manufacturer: persistedDevice?.manufacturer,
      model: persistedDevice?.model,
      serialNumber: persistedDevice?.serialNumber,
      purchaseDate: persistedDevice?.purchaseDate,
    },
    {
      type: "respiratory",
      manufacturer: "Shcare Labs",
      model: "SH-RPM-1",
      serialNumber: "SERIAL-INVENTORY-001",
      purchaseDate: "2026-07-17",
    },
  );
  assert.equal(
    persisted.auditLogs.filter(
      (entry) => entry.action === "device.provision" && entry.resourceId === "dev_inventory_metadata",
    ).length,
    1,
  );

  const migration = fs.readFileSync(
    path.join(rootDir, "db", "migrations", "025_device_inventory_metadata.sql"),
    "utf8",
  );
  for (const column of ["manufacturer", "model", "serial_number", "purchase_date"]) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, "i"));
  }
  assert.doesNotMatch(
    migration,
    /^\s*(?:BEGIN|COMMIT)\s*;/im,
    "migration files must not nest transactions already owned by the migration runner",
  );
  const repositorySource = fs.readFileSync(path.join(rootDir, "src", "repositories.js"), "utf8");
  assert.match(repositorySource, /manufacturer, model, serial_number, purchase_date/);
  const telemetryMigration = fs.readFileSync(
    path.join(rootDir, "db", "migrations", "026_device_telemetry.sql"),
    "utf8",
  );
  assert.match(telemetryMigration, /ADD COLUMN IF NOT EXISTS telemetry\s+jsonb/i);
});

test("device provisioning is idempotent without persisting the one-time claim code", async () => {
  const token = await loginPlatformAdmin();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "provision-device-once",
  };
  const payload = {
    deviceId: "dev_provision_idempotent",
    name: "Idempotent Provision",
    organizationId: "org_alpha",
  };

  const missingKey = await requestJson("/api/v1/devices/provision-qr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...payload, deviceId: "dev_provision_missing_key" }),
  });
  assert.equal(missingKey.response.status, 400);
  assert.equal(missingKey.body.code, "idempotency_key_required");

  const concurrent = await Promise.all([
    requestJson("/api/v1/devices/provision-qr", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }),
    requestJson("/api/v1/devices/provision-qr", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }),
  ]);
  assert.deepEqual(concurrent.map(({ response }) => response.status), [201, 201]);
  assert.equal(
    concurrent.filter(({ body }) => body.idempotent === true).length,
    1,
    "one concurrent request must replay the original provision outcome",
  );
  assert.equal(concurrent[0].body.device.id, concurrent[1].body.device.id);
  assert.equal(
    concurrent[0].body.claim.claimCode,
    concurrent[1].body.claim.claimCode,
    "a safe replay must reconstruct the same one-time code",
  );

  const mismatch = await requestJson("/api/v1/devices/provision-qr", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...payload, name: "Different provision request" }),
  });
  assert.equal(mismatch.response.status, 409);
  assert.equal(mismatch.body.code, "idempotency_key_reused");

  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  assert.equal(
    persisted.devices.filter((device) => device.id === payload.deviceId).length,
    1,
    "the provisioned device must not be duplicated",
  );
  assert.equal(
    persisted.deviceClaims.filter((claim) => claim.deviceId === payload.deviceId).length,
    1,
    "an idempotent replay must not create another claim ledger entry",
  );
  assert.equal(
    persisted.auditLogs.filter(
      (entry) => entry.action === "device.provision" && entry.resourceId === payload.deviceId,
    ).length,
    1,
    "device and audit must commit once",
  );
  const idempotencyRecord = persisted.idempotencyKeys.find(
    (entry) => entry.operation === "device.provision" && entry.key === headers["Idempotency-Key"],
  );
  assert.ok(idempotencyRecord);
  assert.doesNotMatch(
    JSON.stringify(idempotencyRecord.responseResource),
    new RegExp(concurrent[0].body.claim.claimCode, "i"),
    "the replay ledger must not persist the raw one-time code",
  );
});

test("device provisioning rolls back the SQL transaction when its audit cannot commit", async () => {
  const runtimeDb = { devices: [], deviceClaims: [], auditLogs: [], idempotencyKeys: [] };
  const statements = [];
  const pool = {
    async query(statement) {
      const sql = String(statement);
      statements.push(sql);
      if (/INSERT\s+INTO\s+audit_logs/i.test(sql)) {
        const error = new Error("audit write failed");
        error.code = "AUDIT_WRITE_FAILED";
        throw error;
      }
      if (/SELECT\s+fingerprint[\s\S]+FROM\s+mutation_idempotency/i.test(sql)) {
        return { rows: [] };
      }
      if (/SELECT\s+\*\s+FROM\s+devices\s+WHERE\s+id\s*=\s*\$1\s+FOR\s+UPDATE/i.test(sql)) {
        return {
          rows: [{
            id: "dev_atomic_provision",
            organization_id: "org_alpha",
            ownership_state: "provisioned",
            name: "Factory-enrolled device",
            type: "stethoscope",
            status: "unclaimed",
            connected: false,
            secret_hash: canonicalDeviceSecretHash("atomic-provision-secret-000000000001"),
            created_at: "2026-07-17T00:00:00.000Z",
            updated_at: "2026-07-17T00:00:00.000Z",
          }],
        };
      }
      return { rows: [] };
    },
  };
  const repository = createRepositories({
    getDb: () => runtimeDb,
    saveDb: async () => undefined,
    createId: (prefix) => `${prefix}_test`,
    nowIso: () => "2026-07-17T00:00:00.000Z",
    getPool: () => pool,
    onSqlError: () => undefined,
  });
  const device = {
    id: "dev_atomic_provision",
    organizationId: "org_alpha",
    name: "Atomic provision",
    secretHash: canonicalDeviceSecretHash("atomic-provision-secret-000000000001"),
  };
  const claim = {
    id: "claim_atomic_provision",
    deviceId: device.id,
    organizationId: device.organizationId,
    claimCodeHash: "claim-hash",
    expiresAt: "2026-07-18T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
  };

  await assert.rejects(
    repository.devices.saveProvisionWithAudit(
      device,
      claim,
      {
        action: "device.provision",
        actorUserId: "usr_platform",
        organizationId: device.organizationId,
      },
      {
        scope: "usr_platform:org_alpha",
        operation: "device.provision",
        key: "atomic-provision",
        fingerprint: "fingerprint",
      },
      {
        device: { id: device.id },
        claim: { deviceId: device.id, expiresAt: claim.expiresAt },
      },
      201,
    ),
    /audit write failed/i,
  );
  assert.equal(statements.includes("BEGIN"), true);
  assert.equal(statements.includes("ROLLBACK"), true);
  assert.equal(statements.includes("COMMIT"), false);
  const deviceWrite = statements.find((statement) => /INSERT\s+INTO\s+devices/i.test(statement));
  assert.match(
    deviceWrite,
    /secret_hash\s*=\s*devices\.secret_hash/i,
    "claim provisioning must retain the credential installed by factory enrollment",
  );
  assert.deepEqual(runtimeDb.devices, []);
  assert.deepEqual(runtimeDb.deviceClaims, []);
  assert.deepEqual(runtimeDb.auditLogs, []);
});

test("SQL device writes normalize an empty purchase date before the PostgreSQL date cast", async () => {
  const runtimeDb = { devices: [] };
  const statements = [];
  const pool = {
    async query(statement, values = []) {
      statements.push({ sql: String(statement), values });
      return { rows: [] };
    },
  };
  const repository = createRepositories({
    getDb: () => runtimeDb,
    saveDb: async () => undefined,
    createId: (prefix) => `${prefix}_test`,
    nowIso: () => "2026-07-17T00:00:00.000Z",
    getPool: () => pool,
  });

  await repository.devices.save({
    id: "dev_empty_purchase_date",
    name: "No purchase date",
    purchaseDate: "",
  });

  const write = statements.find(({ sql }) => /INSERT\s+INTO\s+devices/i.test(sql));
  assert.ok(write, "saving a device must execute the PostgreSQL upsert");
  assert.match(write.sql, /\$20::date/);
  assert.equal(write.values[19], null, "an empty form date must become SQL NULL, never an invalid empty date");
});

test("device telemetry is allowlisted and persisted as a safe JSON/SQL snapshot", async () => {
  const telemetry = sanitizeDeviceTelemetry({
    uptimeMs: 12_345,
    freeHeapBytes: 98_765,
    audioPacketsSent: 12,
    audioPacketsDropped: 2,
    audioSendFailures: 1,
    audioCaptureQueueDepth: 3,
    audioCaptureQueueHighWater: 8,
    audioCaptureFramesEnqueued: 1_250,
    audioCaptureFramesDropped: 17,
    audioCaptureFramesStale: 2,
    lastCommandUptimeMs: 11_000,
    resetReason: " brownout ",
    i2sStatus: "ready",
    lastCommandId: "cmd_123",
    lastCommandState: "applied",
    lastCommandCode: "OK",
    otaStatus: "confirmed",
    audioStatus: "ready",
    connectionMethod: "WSS",
    i2sSlot0Rms: 1_280,
    i2sSlot0Peak: 4_096,
    i2sSlot0WindowCount: 40,
    i2sSlot0ActiveWindowCount: 39,
    i2sSlot0SampleCount: 10_240,
    i2sSlot0NonZeroSampleCount: 9_800,
    i2sSlot1Rms: 1_144,
    i2sSlot1Peak: 3_840,
    i2sSlot1WindowCount: 40,
    i2sSlot1ActiveWindowCount: 38,
    i2sSlot1SampleCount: 10_240,
    i2sSlot1NonZeroSampleCount: 9_620,
    secret: "must-not-persist",
    rawAudio: "must-not-persist",
    pcmSamples: [1, 2, 3],
    unknownField: "must-not-persist",
    freeHeapBytesInvalid: -1,
  });
  assert.deepEqual(telemetry, {
    uptimeMs: 12_345,
    freeHeapBytes: 98_765,
    audioPacketsSent: 12,
    audioPacketsDropped: 2,
    audioSendFailures: 1,
    audioCaptureQueueDepth: 3,
    audioCaptureQueueHighWater: 8,
    audioCaptureFramesEnqueued: 1_250,
    audioCaptureFramesDropped: 17,
    audioCaptureFramesStale: 2,
    lastCommandUptimeMs: 11_000,
    resetReason: "brownout",
    i2sStatus: "ready",
    lastCommandId: "cmd_123",
    lastCommandState: "applied",
    lastCommandCode: "OK",
    otaStatus: "confirmed",
    audioStatus: "ready",
    connectionMethod: "WSS",
    i2sSlot0Rms: 1_280,
    i2sSlot0Peak: 4_096,
    i2sSlot0WindowCount: 40,
    i2sSlot0ActiveWindowCount: 39,
    i2sSlot0SampleCount: 10_240,
    i2sSlot0NonZeroSampleCount: 9_800,
    i2sSlot1Rms: 1_144,
    i2sSlot1Peak: 3_840,
    i2sSlot1WindowCount: 40,
    i2sSlot1ActiveWindowCount: 38,
    i2sSlot1SampleCount: 10_240,
    i2sSlot1NonZeroSampleCount: 9_620,
  });

  const aggregateFields = Object.keys(telemetry).filter(
    (field) => field.startsWith("i2sSlot") || field.startsWith("audioCapture"),
  );
  assert.equal(aggregateFields.length, 17);
  for (const field of aggregateFields) {
    assert.deepEqual(sanitizeDeviceTelemetry({ [field]: -1 }), {});
    assert.deepEqual(sanitizeDeviceTelemetry({ [field]: 0.5 }), {});
    assert.deepEqual(sanitizeDeviceTelemetry({ [field]: UINT32_MAX + 1 }), {});
    assert.deepEqual(sanitizeDeviceTelemetry({ [field]: "1" }), {});
    assert.deepEqual(sanitizeDeviceTelemetry({ [field]: UINT32_MAX }), { [field]: UINT32_MAX });
  }
  assert.deepEqual(sanitizeDeviceTelemetry({ deviceSecret: "forbidden", ...telemetry }), telemetry);
  assert.equal(Object.hasOwn(telemetry, "rawAudio"), false);
  assert.equal(Object.hasOwn(telemetry, "pcmSamples"), false);

  const runtimeDb = { devices: [] };
  const statements = [];
  const pool = {
    async query(statement, values = []) {
      statements.push({ sql: String(statement), values });
      return { rows: [] };
    },
  };
  const repository = createRepositories({
    getDb: () => runtimeDb,
    saveDb: async () => undefined,
    createId: (prefix) => `${prefix}_test`,
    nowIso: () => "2026-07-17T00:00:00.000Z",
    getPool: () => pool,
  });
  await repository.devices.save({
    id: "dev_telemetry",
    name: "Telemetry device",
    telemetry,
  });
  const write = statements.find(({ sql }) => /INSERT\s+INTO\s+devices/i.test(sql));
  assert.ok(write);
  assert.match(write.sql, /telemetry/);
  assert.deepEqual(JSON.parse(write.values[24]), telemetry);
});

test("authenticated device telemetry reaches the tenant-scoped device projection", async () => {
  const client = openSocket("/esp");
  await client.opened;
  await authenticateDevice(client, "dev_alpha", secrets.alpha, {
    firmwareVersion: "telemetry-smoke",
    uptimeMs: 321,
    resetReason: "power_on",
    freeHeapBytes: 65_536,
    i2sStatus: "ready",
    audioPacketsSent: 14,
    audioPacketsDropped: 1,
    audioSendFailures: 1,
    audioCaptureQueueDepth: 2,
    audioCaptureQueueHighWater: 8,
    audioCaptureFramesEnqueued: 512,
    audioCaptureFramesDropped: 4,
    audioCaptureFramesStale: 1,
    lastCommandId: "cmd_telemetry",
    lastCommandState: "applied",
    lastCommandCode: "OK",
    lastCommandUptimeMs: 300,
    otaStatus: "confirmed",
    audioStatus: "ready",
    connectionMethod: "WSS",
    i2sSlot0Rms: 1_280,
    i2sSlot0Peak: 4_096,
    i2sSlot0WindowCount: 40,
    i2sSlot0ActiveWindowCount: 39,
    i2sSlot0SampleCount: 10_240,
    i2sSlot0NonZeroSampleCount: 9_800,
    i2sSlot1Rms: 1_144,
    i2sSlot1Peak: 3_840,
    i2sSlot1WindowCount: 40,
    i2sSlot1ActiveWindowCount: 38,
    i2sSlot1SampleCount: 10_240,
    i2sSlot1NonZeroSampleCount: 9_620,
  });
  const token = await loginPlatformAdmin();
  const response = await requestJson("/api/v1/devices", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.response.status, 200);
  const device = response.body.devices.find((item) => item.id === "dev_alpha");
  assert.deepEqual(device?.telemetry, {
    uptimeMs: 321,
    resetReason: "power_on",
    freeHeapBytes: 65_536,
    i2sStatus: "ready",
    audioPacketsSent: 14,
    audioPacketsDropped: 1,
    audioSendFailures: 1,
    audioCaptureQueueDepth: 2,
    audioCaptureQueueHighWater: 8,
    audioCaptureFramesEnqueued: 512,
    audioCaptureFramesDropped: 4,
    audioCaptureFramesStale: 1,
    lastCommandId: "cmd_telemetry",
    lastCommandState: "applied",
    lastCommandCode: "OK",
    lastCommandUptimeMs: 300,
    otaStatus: "confirmed",
    audioStatus: "ready",
    connectionMethod: "WSS",
    i2sSlot0Rms: 1_280,
    i2sSlot0Peak: 4_096,
    i2sSlot0WindowCount: 40,
    i2sSlot0ActiveWindowCount: 39,
    i2sSlot0SampleCount: 10_240,
    i2sSlot0NonZeroSampleCount: 9_800,
    i2sSlot1Rms: 1_144,
    i2sSlot1Peak: 3_840,
    i2sSlot1WindowCount: 40,
    i2sSlot1ActiveWindowCount: 38,
    i2sSlot1SampleCount: 10_240,
    i2sSlot1NonZeroSampleCount: 9_620,
  });
  client.socket.close();
  await client.closed();
});

test("JSON to PostgreSQL device migration inserts and reconciles inventory metadata", async () => {
  const sourceDevice = {
    id: "dev_import_inventory",
    organizationId: "org_alpha",
    name: "Imported inventory device",
    type: "respiratory",
    manufacturer: "Shcare Labs",
    model: "SH-RPM-2",
    serialNumber: "SERIAL-IMPORT-002",
    purchaseDate: "2026-07-16",
    telemetry: {
      uptimeMs: 42,
      freeHeapBytes: 8_192,
      i2sStatus: "ready",
    },
  };

  const insertStatements = [];
  const insertClient = {
    async query(statement, values = []) {
      const sql = String(statement);
      insertStatements.push({ sql, values });
      if (/SELECT[\s\S]+FROM\s+devices/i.test(sql)) return { rowCount: 0, rows: [] };
      if (/INSERT\s+INTO\s+devices/i.test(sql)) return { rowCount: 1, rows: [{ id: sourceDevice.id }] };
      return { rowCount: 0, rows: [] };
    },
  };
  const inserted = await migrateDeviceToPostgres(insertClient, sourceDevice);
  assert.equal(inserted.state, "inserted");
  const insert = insertStatements.find(({ sql }) => /INSERT\s+INTO\s+devices/i.test(sql));
  assert.ok(insert);
  assert.match(insert.sql, /manufacturer,\s*model,\s*serial_number,\s*purchase_date/i);
  assert.deepEqual(insert.values.slice(16, 20), [
    sourceDevice.manufacturer,
    sourceDevice.model,
    sourceDevice.serialNumber,
    sourceDevice.purchaseDate,
  ]);
  assert.deepEqual(JSON.parse(insert.values[24]), sourceDevice.telemetry);

  const reconcileStatements = [];
  const reconcileClient = {
    async query(statement, values = []) {
      const sql = String(statement);
      reconcileStatements.push({ sql, values });
      if (/SELECT[\s\S]+FROM\s+devices/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            id: sourceDevice.id,
            organization_id: sourceDevice.organizationId,
            paired_user_id: null,
            secret_hash: null,
            revoked_at: null,
            manufacturer: null,
            model: null,
            serial_number: null,
            purchase_date: null,
            telemetry: {},
          }],
        };
      }
      if (/UPDATE\s+devices/i.test(sql)) return { rowCount: 1, rows: [{ id: sourceDevice.id }] };
      return { rowCount: 0, rows: [] };
    },
  };
  const reconciled = await migrateDeviceToPostgres(reconcileClient, sourceDevice);
  assert.equal(reconciled.state, "updated");
  const update = reconcileStatements.find(({ sql }) => /UPDATE\s+devices/i.test(sql));
  assert.ok(update, "an existing device must receive inventory metadata from the JSON source");
  assert.match(update.sql, /manufacturer\s*=\s*COALESCE/i);
  assert.match(update.sql, /purchase_date\s*=\s*COALESCE/i);
  assert.deepEqual(update.values.slice(1, 5), [
    sourceDevice.manufacturer,
    sourceDevice.model,
    sourceDevice.serialNumber,
    sourceDevice.purchaseDate,
  ]);
  assert.deepEqual(JSON.parse(update.values[6]), sourceDevice.telemetry);
});

test("SQL and JSON devices retain the same one-way verification material", async () => {
  const expectedHash = `sha256:${crypto.createHash("sha256").update(secrets.alpha, "utf8").digest("hex")}`;
  const repositoryDb = { devices: [] };
  let savedSqlHash = "";
  let repairedSqlHash = "";
  const pool = {
    async query(statement, values = []) {
      const sql = String(statement).trim();
      if (sql.startsWith("SELECT * FROM devices WHERE")) {
        return {
          rows: [
            {
              id: "dev_sql",
              name: "SQL device",
              type: "stethoscope",
              status: "available",
              secret_hash: secrets.alpha,
            },
          ],
        };
      }
      if (sql.startsWith("INSERT INTO devices")) savedSqlHash = values[14];
      if (sql.startsWith("UPDATE devices SET secret_hash")) repairedSqlHash = values[1];
      return { rows: [] };
    },
  };
  const repository = createRepositories({
    getDb: () => repositoryDb,
    saveDb: async () => undefined,
    createId: (prefix) => `${prefix}_test`,
    nowIso: () => new Date().toISOString(),
    getPool: () => pool,
  });

  const sqlDevice = await repository.devices.findById("dev_sql");
  assert.equal(sqlDevice.secretHash, expectedHash, "legacy SQL values must normalize to the canonical hash format");
  assert.equal(sqlDevice.secret, undefined);
  assert.equal(repairedSqlHash, expectedHash, "legacy SQL plaintext must be write-repaired in place");

  const jsonDevice = {
    id: "dev_json",
    name: "JSON device",
    secretHash: canonicalDeviceSecretHash(secrets.beta),
    secret: secrets.alpha,
  };
  await repository.devices.save(jsonDevice);
  assert.equal(jsonDevice.secretHash, expectedHash);
  assert.equal(jsonDevice.secret, undefined, "repository memory state must not retain the raw secret");
  assert.equal(savedSqlHash, expectedHash, "SQL and JSON must persist identical verification material");
});

test("device command repository keeps JSON and SQL lifecycle state in parity", async () => {
  const runtimeDb = { deviceCommands: [] };
  const statements = [];
  const pool = {
    async query(statement, values = []) {
      statements.push({ sql: String(statement), values });
      return { rows: [] };
    },
  };
  const repository = createRepositories({
    getDb: () => runtimeDb,
    saveDb: async () => undefined,
    createId: (prefix) => `${prefix}_test`,
    nowIso: () => "2026-07-17T00:00:00.000Z",
    getPool: () => pool,
  });
  assert.equal(
    typeof repository.deviceCommands?.save,
    "function",
    "repositories must expose a durable device command ledger",
  );

  const command = {
    protocolVersion: 1,
    id: "cmd_sql_parity",
    deviceId: "dev_sql",
    organizationId: "org_sql",
    type: "wifi.status",
    correlationId: "corr_sql_parity",
    state: "delivered",
    code: "TRANSPORT_DELIVERED",
    detail: "delivered",
    requestedByUserId: "usr_sql",
    issuedAt: "2026-07-17T00:00:00.000Z",
    expiresAt: "2026-07-17T00:01:00.000Z",
    acceptedAt: "2026-07-17T00:00:00.000Z",
    deliveredAt: "2026-07-17T00:00:01.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:01.000Z",
    delivery: { websocket: true, mqtt: false, delivered: true },
  };
  await repository.deviceCommands.save(command);
  assert.equal(runtimeDb.deviceCommands.length, 1);
  assert.equal(runtimeDb.deviceCommands[0].state, "delivered");
  const firstWrite = statements.find(({ sql }) => /INSERT\s+INTO\s+device_commands/i.test(sql));
  assert.ok(firstWrite, "device command save must write the normalized SQL ledger");
  assert.equal(firstWrite.values.includes("delivered"), true);

  command.state = "applied";
  command.code = "OK";
  command.appliedAt = "2026-07-17T00:00:02.000Z";
  command.updatedAt = command.appliedAt;
  await repository.deviceCommands.save(command);
  assert.equal(runtimeDb.deviceCommands.length, 1, "a status transition must update instead of duplicating a command");
  assert.equal(runtimeDb.deviceCommands[0].state, "applied");
  assert.equal(
    statements.filter(({ sql }) => /INSERT\s+INTO\s+device_commands/i.test(sql)).length,
    2,
    "each lifecycle transition must be durably upserted",
  );
});

test("device command migration is additive, scoped, and never persists command payload secrets", () => {
  const migrationPath = path.join(rootDir, "db", "migrations", "024_device_command_lifecycle.sql");
  assert.equal(fs.existsSync(migrationPath), true, "the normalized command ledger requires migration 024");
  const migration = fs.readFileSync(migrationPath, "utf8");
  assert.match(migration, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+device_commands/i);
  assert.match(migration, /device_id\s+text\s+NOT\s+NULL\s+REFERENCES\s+devices\s*\(id\)/i);
  assert.match(migration, /organization_id\s+text\s+REFERENCES\s+organizations\s*\(id\)/i);
  assert.match(migration, /requested_by_user_id\s+text\s+REFERENCES\s+users\s*\(id\)/i);
  assert.match(migration, /CHECK\s*\(state\s+IN\s*\([^)]*'accepted'[^)]*'applied'[^)]*'expired'/is);
  assert.match(migration, /ALTER\s+TABLE\s+device_commands\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  assert.match(migration, /REVOKE\s+ALL\s+ON\s+TABLE\s+device_commands\s+FROM\s+PUBLIC/i);
  assert.doesNotMatch(migration, /\bpayload\b/i, "command payloads can contain Wi-Fi or OTA secrets and must not be persisted");

  const importer = fs.readFileSync(path.join(rootDir, "scripts", "migrateJsonToPostgres.js"), "utf8");
  assert.match(importer, /db\.deviceCommands/);
  assert.match(importer, /INSERT\s+INTO\s+device_commands/i);
  assert.doesNotMatch(
    importer.match(/INSERT\s+INTO\s+device_commands[\s\S]*?ON\s+CONFLICT/i)?.[0] || "",
    /\bpayload\b/i,
    "the importer must never copy raw command data into the normalized ledger",
  );

  const executionMigration = fs.readFileSync(
    path.join(rootDir, "db", "migrations", "053_device_command_execution_deadline.sql"),
    "utf8",
  );
  assert.match(executionMigration, /ADD COLUMN IF NOT EXISTS execution_expires_at timestamptz/i);
  assert.match(
    executionMigration,
    /UPDATE device_commands[\s\S]*command_type = 'ota\.update'[\s\S]*state IN \('acknowledged', 'applying'\)/i,
    "existing acknowledged/applying OTA rows need a bounded compatibility backfill",
  );
  assert.match(executionMigration, /execution_expires_at > expires_at/i);
  assert.match(importer, /execution_expires_at/i);

});

test("credential rotation migration stores only a private verification document", () => {
  const migration = fs.readFileSync(
    path.join(rootDir, "db", "migrations", "027_device_credential_rotation.sql"),
    "utf8",
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS credential_rotation jsonb/i);
  assert.match(migration, /jsonb_typeof\(credential_rotation\) = 'object'/i);
  assert.match(migration, /pending_credential_rotation/i);
  assert.match(migration, /pending_device_ack/);
  assert.doesNotMatch(migration, /ADD COLUMN[^;]*(?:device_secret|next_secret|plaintext)/i);
});

test("the shared auth-accepted contract binds the authenticated session to its challenge", () => {
  const contractDir = path.resolve(rootDir, "..", "..", "packages", "shcare-contracts", "device", "v1");
  const schema = JSON.parse(fs.readFileSync(path.join(contractDir, "auth-accepted.schema.json"), "utf8"));
  const fixture = JSON.parse(
    fs.readFileSync(path.join(contractDir, "fixtures", "auth-accepted.json"), "utf8"),
  );
  assert.ok(schema.required.includes("challengeId"));
  assert.ok(schema.required.includes("credentialSlot"));
  assert.ok(schema.required.includes("rotationId"));
  assert.ok(schema.required.includes("rotationState"));
  assert.equal(schema.properties.challengeId.type, "string");
  assert.equal(fixture.type, "auth.accepted");
  assert.equal(fixture.challengeId, "challenge_fixture_0001");
  assert.ok(fixture.sessionId);
  assert.equal(fixture.credentialSlot, "rotation_candidate");
  assert.equal(fixture.rotationState, "confirmed");
  const commandSchema = JSON.parse(
    fs.readFileSync(path.join(contractDir, "command.schema.json"), "utf8"),
  );
  assert.ok(commandSchema.properties.type.enum.includes("device.rotate_secret"));
});

test("device command reads use the durable repository instead of process-local memory only", () => {
  const serverSource = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");
  assert.match(serverSource, /async function findDeviceCommand\([\s\S]*repositories\?\.deviceCommands\?\.findById/);
  assert.match(serverSource, /async function listDeviceCommands\([\s\S]*repositories\?\.deviceCommands\?\.listForDevice/);
  assert.match(serverSource, /const command = await findDeviceCommand\(deviceId, commandId\)/);
});

test("production readiness fails closed until the backend OTA signer is configured", () => {
  const missingSigner = buildProductionReadiness({
    NODE_ENV: "production",
    PUBLIC_BACKEND_URL: "https://api.shcare.vn",
  });
  const missingSignerItem = missingSigner.items.find((item) => item.id === "firmware.signing");
  assert.equal(missingSignerItem?.required, true);
  assert.equal(missingSignerItem?.status, "fail");
  assert.ok(missingSigner.requiredFailures.includes("firmware.signing"));

  const configuredSigner = buildProductionReadiness({
    NODE_ENV: "production",
    PUBLIC_BACKEND_URL: "https://api.shcare.vn",
    OTA_SIGNING_PRIVATE_KEY_PEM: otaPrivateKeyPem,
  });
  const configuredSignerItem = configuredSigner.items.find((item) => item.id === "firmware.signing");
  assert.equal(configuredSignerItem?.required, true);
  assert.equal(configuredSignerItem?.status, "pass");
});

test("OTA version policy rejects a same-version replay or downgrade before delivery", () => {
  assert.doesNotThrow(() => assertOtaUpgradeVersion("1.0.0", "1.0.1"));
  assert.throws(
    () => assertOtaUpgradeVersion("1.0.0", "1.0.0"),
    (error) => error?.code === "OTA_DOWNGRADE_FORBIDDEN",
  );
  assert.throws(
    () => assertOtaUpgradeVersion("2.0.0", "1.9.9"),
    (error) => error?.code === "OTA_DOWNGRADE_FORBIDDEN",
  );
});

test("OTA download bearer tokens use one-way verification material", () => {
  const token = "ota-download-token-that-must-not-be-persisted";
  const tokenHash = hashOtaDownloadToken(token);
  assert.notEqual(tokenHash, token);
  assert.equal(tokenHash.includes(token), false);
  assert.equal(verifyOtaDownloadToken(token, tokenHash), true);
  assert.equal(verifyOtaDownloadToken(`${token}-wrong`, tokenHash), false);
});

test("public device event payloads redact legacy credentials and signed OTA material", () => {
  const sanitized = sanitizePublicDeviceEventPayload({
    token: "legacy-token",
    signature: "legacy-signature",
    url: "https://firmware.shcare.example/image.bin?token=legacy-token&expires=123",
    nested: { wifiPassword: "legacy-password", status: "downloading" },
  });
  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes("legacy-token"), false);
  assert.equal(serialized.includes("legacy-signature"), false);
  assert.equal(serialized.includes("legacy-password"), false);
  assert.equal(sanitized.url, "https://firmware.shcare.example/image.bin");
  assert.equal(sanitized.nested.status, "downloading");
});

test("a transport race fails the command instead of fabricating an offline queue", () => {
  const envelope = createDeviceCommandEnvelope({
    id: "cmd_transport_race",
    type: "wifi.status",
    correlationId: "correlation_transport_race",
    issuedAt: "2026-07-17T00:00:00.000Z",
    expiresAt: "2026-07-17T00:01:00.000Z",
  });
  const command = createDeviceCommandRecord({ envelope, deviceId: "dev_alpha" });

  applyDeviceCommandDelivery(command, { websocket: false, mqtt: false, delivered: false });

  assert.equal(command.state, "failed");
  assert.equal(command.code, "TRANSPORT_LOST");
  assert.equal(command.delivery.delivered, false);
});

test("a command with no device result expires deterministically", () => {
  const envelope = createDeviceCommandEnvelope({
    id: "cmd_expiry",
    type: "wifi.status",
    correlationId: "correlation_expiry",
    issuedAt: "2026-07-17T00:00:00.000Z",
    expiresAt: "2026-07-17T00:01:00.000Z",
  });
  const command = createDeviceCommandRecord({ envelope, deviceId: "dev_alpha" });
  applyDeviceCommandDelivery(command, { websocket: true, mqtt: false, delivered: true }, new Date("2026-07-17T00:00:01.000Z"));

  const result = expireDeviceCommandIfOverdue(command, new Date("2026-07-17T00:01:01.000Z"));

  assert.equal(result.changed, true);
  assert.equal(command.state, "expired");
  assert.equal(command.code, "COMMAND_EXPIRED");
});

test("operator endpoints cannot fabricate device presence or calibration success", async () => {
  const token = await loginPlatformAdmin();
  const headers = { Authorization: `Bearer ${token}` };
  const before = await requestJson("/api/v1/devices", { headers });
  const original = before.body.devices.find((device) => device.id === "dev_beta");
  assert.ok(original);

  for (const action of ["connect", "disconnect"]) {
    const response = await requestJson(`/api/v1/devices/dev_beta/${action}`, {
      method: "POST",
      headers,
    });
    assert.equal(response.response.status, 409, JSON.stringify(response.body));
    assert.equal(response.body.code, "device_presence_device_reported_only");
  }

  const calibration = await requestJson("/api/v1/devices/dev_beta/calibrate", {
    method: "POST",
    headers,
  });
  assert.equal(calibration.response.status, 409, JSON.stringify(calibration.body));
  assert.equal(calibration.body.code, "device_calibration_unavailable");

  const after = await requestJson("/api/v1/devices", { headers });
  const unchanged = after.body.devices.find((device) => device.id === "dev_beta");
  assert.equal(unchanged.connected, original.connected);
  assert.equal(unchanged.status, original.status);
  assert.equal(unchanged.lastSeenAt || "", original.lastSeenAt || "");
});

test("offline device commands fail closed instead of creating a fake queue", async () => {
  const token = await loginPlatformAdmin();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "offline-command-must-not-queue",
  };
  const before = await requestJson("/api/v1/devices/dev_beta/commands", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(before.response.status, 200, JSON.stringify(before.body));

  const rejected = await requestJson("/api/v1/devices/dev_beta/commands", {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "wifi.status", payload: {} }),
  });
  assert.equal(rejected.response.status, 409, JSON.stringify(rejected.body));
  assert.equal(rejected.body.code, "device_command_device_offline");

  const after = await requestJson("/api/v1/devices/dev_beta/commands", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(after.response.status, 200, JSON.stringify(after.body));
  assert.equal(after.body.commands.length, before.body.commands.length);
});

test("human device mutations cannot spoof telemetry or hard-delete the audit graph", async () => {
  const betaAdminToken = await login("admin@beta.test");
  const platformToken = await loginPlatformAdmin();
  const betaHeaders = { Authorization: `Bearer ${betaAdminToken}`, "Content-Type": "application/json" };

  const before = await requestJson("/api/v1/devices", {
    headers: { Authorization: `Bearer ${platformToken}` },
  });
  const original = before.body.devices.find((device) => device.id === "dev_beta");
  assert.ok(original);

  const spoofed = await requestJson("/api/v1/devices/dev_beta", {
    method: "PATCH",
    headers: {
      ...betaHeaders,
      "Idempotency-Key": "device-security-spoof-telemetry",
    },
    body: JSON.stringify({ name: "Spoof attempt", status: "connected", signal: 100, battery: 100 }),
  });
  assert.equal(spoofed.response.status, 400, JSON.stringify(spoofed.body));
  assert.equal(spoofed.body.code, "device_reported_field_forbidden");

  for (const [index, token] of [betaAdminToken, platformToken].entries()) {
    const removed = await requestJson("/api/v1/devices/dev_beta", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `device-security-hard-delete-${index}`,
      },
    });
    assert.equal(removed.response.status, 409, JSON.stringify(removed.body));
    assert.equal(removed.body.code, "device_revoke_required");
  }

  const renamed = await requestJson("/api/v1/devices/dev_beta", {
    method: "PATCH",
    headers: {
      ...betaHeaders,
      "Idempotency-Key": "device-security-rename-metadata",
    },
    body: JSON.stringify({
      name: "Beta Device Renamed",
      type: "stethoscope",
      manufacturer: "Shcare",
      model: "S3-Pro",
      serialNumber: "SHC-BETA-2026",
      purchaseDate: "2026-08-31",
    }),
  });
  assert.equal(renamed.response.status, 200, JSON.stringify(renamed.body));
  assert.equal(renamed.body.device.name, "Beta Device Renamed");
  assert.equal(renamed.body.device.type, "stethoscope");
  assert.equal(renamed.body.device.manufacturer, "Shcare");
  assert.equal(renamed.body.device.model, "S3-Pro");
  assert.equal(renamed.body.device.serialNumber, "SHC-BETA-2026");
  assert.equal(renamed.body.device.purchaseDate, "2026-08-31");
  assert.equal(renamed.body.device.connected, original.connected);
  assert.equal(renamed.body.device.status, original.status);
  assert.equal(renamed.body.device.signal ?? null, original.signal ?? null);
  assert.equal(renamed.body.device.battery ?? null, original.battery ?? null);
  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  assert.equal(
    persisted.auditLogs.filter((entry) => entry.action === "device.update" && entry.resourceId === "dev_beta").length,
    1,
    "an operator metadata update must be audited",
  );

  const replayed = await requestJson("/api/v1/devices/dev_beta", {
    method: "PATCH",
    headers: {
      ...betaHeaders,
      "Idempotency-Key": "device-security-rename-metadata",
    },
    body: JSON.stringify({
      name: "Beta Device Renamed",
      type: "stethoscope",
      manufacturer: "Shcare",
      model: "S3-Pro",
      serialNumber: "SHC-BETA-2026",
      purchaseDate: "2026-08-31",
    }),
  });
  assert.equal(replayed.response.status, 200, JSON.stringify(replayed.body));
  assert.equal(replayed.body.replayed, true);
  const afterReplay = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  assert.equal(
    afterReplay.auditLogs.filter((entry) => entry.action === "device.update" && entry.resourceId === "dev_beta").length,
    1,
    "metadata replay must not duplicate the audit event",
  );
});

test("patient selection for device assignment is workspace-exact", async () => {
  const betaAdminToken = await login("admin@beta.test");
  const platformToken = await loginPlatformAdmin();

  const crossTenant = await requestJson("/api/v1/patients?organizationId=org_alpha", {
    headers: { Authorization: `Bearer ${betaAdminToken}` },
  });
  assert.equal(crossTenant.response.status, 403, JSON.stringify(crossTenant.body));
  assert.equal(crossTenant.body.code, "patient_list_workspace_scope_denied");

  const scoped = await requestJson("/api/v1/patients?organizationId=org_alpha", {
    headers: { Authorization: `Bearer ${platformToken}` },
  });
  assert.equal(scoped.response.status, 200, JSON.stringify(scoped.body));
  assert.ok(scoped.body.patients.length > 0);
  assert.ok(
    scoped.body.patients.every((patient) => patient.organizationId === "org_alpha"),
    "Platform Admin may search globally, but device assignment choices must remain exact to the device workspace",
  );
});

test("unpair is rejected without erasing ownership or fabricating an offline device", async () => {
  const esp = openSocket("/esp");
  await esp.opened;
  await authenticateDevice(esp, "dev_alpha_peer", secrets.peer);
  const token = await loginPlatformAdmin();

  const unpaired = await requestJson("/api/v1/devices/dev_alpha_peer/unpair", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(unpaired.response.status, 409, JSON.stringify(unpaired.body));
  assert.equal(unpaired.body.code, "device_unpair_requires_transfer_or_revoke");
  const retained = await requestJson("/api/v1/devices/dev_alpha_peer", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(retained.response.status, 200, JSON.stringify(retained.body));
  assert.equal(retained.body.device.online, true);
  esp.socket.close();
  await esp.closed();
});

test("account release is tenant-scoped, idempotent, audited, and retains the device row", async () => {
  const betaToken = await login("admin@beta.test");
  const alphaToken = await login("doctor@alpha.test");
  const idempotencyKey = "device-release-contract";
  const denied = await requestJson("/api/v1/devices/dev_release/release", {
    method: "POST",
    headers: { Authorization: `Bearer ${alphaToken}`, "Idempotency-Key": idempotencyKey },
  });
  assert.equal(denied.response.status, 403, JSON.stringify(denied.body));

  const released = await requestJson("/api/v1/devices/dev_release/release", {
    method: "POST",
    headers: { Authorization: `Bearer ${betaToken}`, "Idempotency-Key": idempotencyKey },
  });
  assert.equal(released.response.status, 200, JSON.stringify(released.body));
  assert.deepEqual(released.body.release, {
    deviceId: "dev_release",
    released: true,
    historyRetained: true,
  });
  assert.equal(released.body.replayed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(released.body, "device"), false);

  const replay = await requestJson("/api/v1/devices/dev_release/release", {
    method: "POST",
    headers: { Authorization: `Bearer ${betaToken}`, "Idempotency-Key": idempotencyKey },
  });
  assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.replayed, true);

  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const device = persisted.devices.find((candidate) => candidate.id === "dev_release");
  assert.ok(device, "release must retain the canonical device row");
  assert.equal(device.ownershipState, "provisioned");
  assert.equal(device.ownerUserId, null);
  assert.equal(device.pairedUserId, null);
  assert.equal(device.historyMarker, "retained");
  assert.equal(
    persisted.auditLogs.filter(
      (entry) => entry.action === "device.release" && entry.resourceId === "dev_release",
    ).length,
    1,
  );
});

test("OTA is platform-only, signed, canonical, and confirmed only after authenticated reconnect telemetry", async () => {
  const checksum = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const betaAdminToken = await login("admin@beta.test");
  const denied = await requestJson("/api/v1/devices/dev_beta/ota", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${betaAdminToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "workspace-ota-must-be-denied",
    },
    body: JSON.stringify({
      url: "https://firmware.shcare.example/MSM261S4030H0/1.1.0.bin",
      firmwareVersion: "1.1.0",
      checksum,
    }),
  });
  assert.equal(denied.response.status, 403, JSON.stringify(denied.body));

  const esp = openSocket("/esp");
  await esp.opened;
  await authenticateDevice(esp, "dev_alpha_peer", secrets.peer);
  const token = await loginPlatformAdmin();
  const otaHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "ota-canonical-signed-001",
  };
  const otaPayload = {
    url: "https://firmware.shcare.example/MSM261S4030H0/1.1.0.bin",
    firmwareVersion: "1.1.0",
    checksum,
  };
  const created = await requestJson("/api/v1/devices/dev_alpha_peer/ota", {
    method: "POST",
    headers: otaHeaders,
    body: JSON.stringify(otaPayload),
  });
  assert.equal(created.response.status, 202, JSON.stringify(created.body));
  assert.equal(created.body.command.protocolVersion, 1);
  assert.equal(created.body.command.type, "ota.update");
  assert.equal(created.body.command.state, "delivered");
  assert.equal(created.body.ota.status, "delivered");
  assert.notEqual(created.body.ota.status, "confirmed");

  const otaReplay = await requestJson("/api/v1/devices/dev_alpha_peer/ota", {
    method: "POST",
    headers: otaHeaders,
    body: JSON.stringify(otaPayload),
  });
  assert.equal(otaReplay.response.status, 202, JSON.stringify(otaReplay.body));
  assert.equal(otaReplay.body.idempotent, true);
  assert.equal(otaReplay.body.command.id, created.body.command.id);

  const otaMismatch = await requestJson("/api/v1/devices/dev_alpha_peer/ota", {
    method: "POST",
    headers: otaHeaders,
    body: JSON.stringify({ ...otaPayload, firmwareVersion: "1.2.0" }),
  });
  assert.equal(otaMismatch.response.status, 409, JSON.stringify(otaMismatch.body));
  assert.equal(otaMismatch.body.code, "idempotency_key_reused");

  const wireCommand = await esp.nextJson();
  assert.equal(wireCommand.id, created.body.command.id);
  assert.equal(wireCommand.correlationId, created.body.command.correlationId);
  assert.equal(wireCommand.protocolVersion, 1);
  assert.equal(wireCommand.type, "ota.update");
  assert.deepEqual(
    {
      firmwareVersion: wireCommand.payload.firmwareVersion,
      checksum: wireCommand.payload.checksum,
      hardwareTarget: wireCommand.payload.hardwareTarget,
      partitionTarget: wireCommand.payload.partitionTarget,
      minimumProtocolVersion: wireCommand.payload.minimumProtocolVersion,
    },
    {
      firmwareVersion: "1.1.0",
      checksum,
      hardwareTarget: "MSM261S4030H0",
      partitionTarget: "app",
      minimumProtocolVersion: 1,
    },
  );
  assert.ok(wireCommand.payload.signature);
  const signatureMessage = Buffer.from(
    [
      "SHCARE-OTA-MANIFEST-V1",
      `sha256=${checksum}`,
      "firmwareVersion=1.1.0",
      "hardwareTarget=MSM261S4030H0",
      "partitionTarget=app",
      "minimumProtocolVersion=1",
      "",
    ].join("\n"),
    "utf8",
  );
  assert.equal(
    crypto.verify(
      "sha256",
      signatureMessage,
      otaPublicKeyPem,
      Buffer.from(wireCommand.payload.signature, "base64url"),
    ),
    true,
    "backend signature must match the exact firmware canonical bytes",
  );
  esp.socket.send(JSON.stringify({
    protocolVersion: 1,
    type: "ota.confirmed",
    deviceId: "dev_alpha_peer",
    commandId: wireCommand.id,
    correlationId: wireCommand.correlationId,
    otaId: wireCommand.id,
    otaStatus: "failed",
    firmwareVersion: "1.1.0",
    otaBootOutcome: "confirmed",
  }));
  const mismatchedEventReceipt = await esp.nextJson();
  assert.equal(mismatchedEventReceipt.type, "event.rejected");
  assert.equal(mismatchedEventReceipt.code, "DEVICE_OTA_EVENT_STATUS_MISMATCH");
  await assert.rejects(
    () => esp.nextJson(150),
    /timed out waiting for WebSocket message/,
    "an OTA idempotency replay must not deliver a second command",
  );

  const beforeReconnect = await requestJson("/api/v1/devices", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pendingDevice = beforeReconnect.body.devices.find((device) => device.id === "dev_alpha_peer");
  assert.notEqual(pendingDevice.otaStatus, "confirmed");
  assert.equal(
    pendingDevice.lastCommand?.state,
    "delivered",
    "the test deliberately drops every command ACK/progress frame before reboot",
  );

  esp.socket.send(JSON.stringify({
    type: "telemetry",
    telemetry: { firmwareVersion: "1.1.0", audioStatus: "ready" },
  }));
  await delay(75);
  const sameSessionTelemetry = await requestJson("/api/v1/devices", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.notEqual(
    sameSessionTelemetry.body.devices.find((device) => device.id === "dev_alpha_peer")?.otaStatus,
    "confirmed",
    "periodic telemetry from the delivery session must not confirm an OTA reboot",
  );

  esp.socket.close();
  await esp.closed();
  const reconnectedEsp = openSocket("/esp");
  await reconnectedEsp.opened;
  await authenticateDevice(reconnectedEsp, "dev_alpha_peer", secrets.peer);
  reconnectedEsp.socket.send(JSON.stringify({
    type: "telemetry",
    telemetry: {
      firmwareVersion: "1.1.0",
      otaBootOutcome: "confirmed",
      audioStatus: "ready",
    },
  }));
  const deadline = Date.now() + 2_000;
  let confirmedDevice = null;
  while (Date.now() < deadline) {
    const devices = await requestJson("/api/v1/devices", {
      headers: { Authorization: `Bearer ${token}` },
    });
    confirmedDevice = devices.body.devices.find((device) => device.id === "dev_alpha_peer");
    if (confirmedDevice?.otaStatus === "confirmed") break;
    await delay(25);
  }
  assert.equal(confirmedDevice?.otaStatus, "confirmed");
  assert.equal(confirmedDevice?.lastCommand?.state, "applied");
  assert.equal(confirmedDevice?.lastCommand?.code, "OTA_BOOT_HEALTH_CONFIRMED");

  const events = await requestJson("/api/v1/devices/dev_alpha_peer/events", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const serializedEvents = JSON.stringify(events.body);
  assert.equal(serializedEvents.includes("token="), false);
  assert.equal(serializedEvents.includes('"token"'), false);
  assert.equal(serializedEvents.includes(wireCommand.payload.signature), false, "events need metadata, not the signed envelope");
  const otaEvents = events.body.events.filter(
    (event) => event.payload?.commandId === created.body.command.id,
  );
  assert.ok(otaEvents.length >= 2);
  assert.ok(
    otaEvents.every((event) => event.payload.protocolVersion === 1),
    "OTA receipts must retain their protocol version",
  );
  reconnectedEsp.socket.close();
});

async function startPrivateFirmwareOta({ deviceId, secret, firmwareFileId, idempotencyKey }) {
  const esp = openSocket("/esp");
  await esp.opened;
  await authenticateDevice(esp, deviceId, secret);
  const platformToken = await loginPlatformAdmin();
  const created = await requestJson(`/api/v1/devices/${encodeURIComponent(deviceId)}/ota`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${platformToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "X-Forwarded-Proto": "https",
      "X-Forwarded-Host": `127.0.0.1:${port}`,
    },
    body: JSON.stringify({ firmwareFileId }),
  });
  assert.equal(created.response.status, 202, JSON.stringify(created.body));
  const wireCommand = await esp.nextJson();
  assert.equal(wireCommand.type, "ota.update");
  assert.equal(typeof wireCommand.payload.downloadAuthorization, "string");
  assert.ok(wireCommand.payload.downloadAuthorization.length >= 32);
  assert.equal(new URL(wireCommand.payload.url).search, "", "private bearer must never enter the URL");
  const localDownloadUrl = wireCommand.payload.url.replace(/^https:/, "http:");
  return { esp, platformToken, created, wireCommand, localDownloadUrl };
}

test("private OTA download pins the exact storage artifact and accepts only an Authorization bearer", async () => {
  const { esp, platformToken, created, wireCommand, localDownloadUrl } = await startPrivateFirmwareOta({
    deviceId: "dev_ota_private_valid",
    secret: secrets.otaPrivateValid,
    firmwareFileId: "firmware_private_valid",
    idempotencyKey: "ota-private-valid-001",
  });
  const bearer = wireCommand.payload.downloadAuthorization;

  const queryOnly = await fetch(`${localDownloadUrl}?token=${encodeURIComponent(bearer)}`, {
    redirect: "manual",
  });
  assert.equal(queryOnly.status, 404, "query-string credentials must never authorize firmware bytes");

  const downloaded = await fetch(localDownloadUrl, {
    headers: { Authorization: `Bearer ${bearer}` },
    redirect: "manual",
  });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get("location"), null, "the backend must proxy bytes instead of redirecting a bearer");
  assert.equal(downloaded.headers.get("cache-control"), "no-store");
  assert.equal(downloaded.headers.get("x-smart-health-sha256"), privateFirmwareChecksum);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), privateFirmwareBytes);

  const detail = await requestJson("/api/v1/devices/dev_ota_private_valid", {
    headers: { Authorization: `Bearer ${platformToken}` },
  });
  assert.equal(detail.response.status, 200, JSON.stringify(detail.body));
  assert.equal(detail.body.device.ota.status, "downloading");

  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const persistedDevice = persisted.devices.find((item) => item.id === "dev_ota_private_valid");
  assert.equal(persistedDevice.ota.firmwareFileId, "firmware_private_valid");
  assert.equal(persistedDevice.ota.firmwareStorageBucket, "device-firmware");
  assert.equal(persistedDevice.ota.firmwareObjectKey, privateFirmwareObjectKey);
  assert.equal(persistedDevice.ota.firmwareByteSize, privateFirmwareBytes.length);
  assert.equal(persistedDevice.ota.status, "downloading");
  assert.ok(persistedDevice.ota.tokenHash);
  assert.equal(JSON.stringify(created.body).includes(bearer), false);
  esp.socket.close();
  await esp.closed();
});

for (const artifactCase of [
  {
    label: "unavailable",
    deviceId: "dev_ota_private_missing",
    secret: secrets.otaPrivateMissing,
    firmwareFileId: "firmware_private_missing",
    idempotencyKey: "ota-private-missing-001",
    expectedStatus: 404,
    expectedCode: "OTA_FIRMWARE_OBJECT_UNAVAILABLE",
  },
  {
    label: "oversized",
    deviceId: "dev_ota_private_oversized",
    secret: secrets.otaPrivateOversized,
    firmwareFileId: "firmware_private_oversized",
    idempotencyKey: "ota-private-oversized-001",
    expectedStatus: 413,
    expectedCode: "OTA_FIRMWARE_SIZE_INVALID",
  },
  {
    label: "truncated after metadata authorization",
    deviceId: "dev_ota_private_truncated",
    secret: secrets.otaPrivateTruncated,
    firmwareFileId: "firmware_private_truncated",
    idempotencyKey: "ota-private-truncated-001",
    expectedStatus: 409,
    expectedCode: "OTA_FIRMWARE_SIZE_MISMATCH",
  },
]) {
  test(`private OTA ${artifactCase.label} artifact fails atomically and revokes its bearer`, async () => {
    const { esp, wireCommand, localDownloadUrl } = await startPrivateFirmwareOta(artifactCase);
    const bearer = wireCommand.payload.downloadAuthorization;
    const failedDownload = await fetch(localDownloadUrl, {
      headers: { Authorization: `Bearer ${bearer}` },
      redirect: "manual",
    });
    assert.equal(failedDownload.status, artifactCase.expectedStatus);

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
    const persistedDevice = persisted.devices.find((item) => item.id === artifactCase.deviceId);
    const persistedCommand = persisted.deviceCommands.find((item) => item.id === wireCommand.id);
    assert.equal(persistedDevice.ota.status, "failed");
    assert.equal(persistedDevice.ota.failureCode, artifactCase.expectedCode);
    assert.equal(Object.hasOwn(persistedDevice.ota, "tokenHash"), false);
    assert.equal(persistedCommand.state, "failed");
    assert.equal(persistedCommand.code, artifactCase.expectedCode);

    const retriedBearer = await fetch(localDownloadUrl, {
      headers: { Authorization: `Bearer ${bearer}` },
      redirect: "manual",
    });
    assert.equal(retriedBearer.status, 404, "a terminal OTA bearer must be unusable immediately");
    esp.socket.close();
    await esp.closed();
  });
}

test("private OTA rejects expired, terminal, revoked, and replaced lifecycle bindings", async () => {
  const attempts = [
    {
      deviceId: "dev_ota_download_expired",
      otaId: "ota_seeded_expired",
      token: seededOtaTokens.expired,
      status: 410,
    },
    {
      deviceId: "dev_ota_download_terminal",
      otaId: "ota_seeded_terminal",
      token: seededOtaTokens.terminal,
      status: 404,
    },
    {
      deviceId: "dev_ota_download_revoked",
      otaId: "ota_seeded_revoked",
      token: seededOtaTokens.revoked,
      status: 404,
    },
    {
      deviceId: "dev_ota_download_replaced",
      otaId: "ota_replaced_old",
      token: seededOtaTokens.replaced,
      status: 404,
    },
  ];
  for (const attempt of attempts) {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/devices/${attempt.deviceId}/ota/${attempt.otaId}/firmware`,
      {
        headers: { Authorization: `Bearer ${attempt.token}` },
        redirect: "manual",
      },
    );
    assert.equal(response.status, attempt.status, `${attempt.deviceId} must deny stale firmware authority`);
    assert.equal(response.headers.get("location"), null);
  }
  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const expired = persisted.devices.find((item) => item.id === "dev_ota_download_expired");
  assert.equal(expired.ota.status, "expired");
  assert.equal(Object.hasOwn(expired.ota, "tokenHash"), false);
});

test("JSON private firmware GET expires an unacknowledged delivery before the longer OTA deadline", async () => {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/v1/devices/dev_ota_download_delivery_expired/ota/ota_seeded_delivery_expired/firmware`,
    {
      headers: { Authorization: `Bearer ${seededOtaTokens.deliveryExpired}` },
      redirect: "manual",
    },
  );

  assert.equal(response.status, 410);
  assert.equal(response.headers.get("location"), null);
  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const device = persisted.devices.find(
    (item) => item.id === "dev_ota_download_delivery_expired",
  );
  const command = persisted.deviceCommands.find(
    (item) => item.id === "ota_seeded_delivery_expired",
  );
  assert.equal(device.ota.status, "expired");
  assert.equal(Object.hasOwn(device.ota, "tokenHash"), false);
  assert.equal(command.state, "expired");
  assert.equal(command.code, "COMMAND_EXPIRED");
  assert.ok(
    Date.parse(command.executionExpiresAt) > Date.now(),
    "the execution deadline is still future but must not authorize a command that never ACKed",
  );

  const retry = await fetch(
    `http://127.0.0.1:${port}/api/v1/devices/dev_ota_download_delivery_expired/ota/ota_seeded_delivery_expired/firmware`,
    {
      headers: { Authorization: `Bearer ${seededOtaTokens.deliveryExpired}` },
      redirect: "manual",
    },
  );
  assert.equal(retry.status, 404, "the revoked bearer verifier must fail every retry");
});

test("legacy private OTA grants with missing or malformed expiry fail closed atomically", async () => {
  for (const attempt of [
    {
      deviceId: "dev_ota_download_missing_expiry",
      otaId: "ota_seeded_missing_expiry",
      token: seededOtaTokens.missingExpiry,
    },
    {
      deviceId: "dev_ota_download_malformed_expiry",
      otaId: "ota_seeded_malformed_expiry",
      token: seededOtaTokens.malformedExpiry,
    },
  ]) {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/v1/devices/${attempt.deviceId}/ota/${attempt.otaId}/firmware`,
      {
        headers: { Authorization: `Bearer ${attempt.token}` },
        redirect: "manual",
      },
    );
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("location"), null);
  }

  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  for (const [deviceId, commandId] of [
    ["dev_ota_download_missing_expiry", "ota_seeded_missing_expiry"],
    ["dev_ota_download_malformed_expiry", "ota_seeded_malformed_expiry"],
  ]) {
    const device = persisted.devices.find((item) => item.id === deviceId);
    const command = persisted.deviceCommands.find((item) => item.id === commandId);
    assert.equal(device.ota.status, "expired");
    assert.equal(Object.hasOwn(device.ota, "tokenHash"), false);
    assert.equal(command.state, "expired");
    assert.equal(command.code, "OTA_DOWNLOAD_TOKEN_EXPIRED");
  }
});

test("an ownership transfer revokes the old private OTA bearer and command", async () => {
  const { esp, platformToken, wireCommand, localDownloadUrl } = await startPrivateFirmwareOta({
    deviceId: "dev_ota_private_transfer",
    secret: secrets.otaPrivateTransfer,
    firmwareFileId: "firmware_private_valid",
    idempotencyKey: "ota-private-transfer-001",
  });
  const bearer = wireCommand.payload.downloadAuthorization;
  const transferred = await requestJson("/api/v1/devices/dev_ota_private_transfer/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${platformToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "transfer-private-ota-to-beta-001",
    },
    body: JSON.stringify({ organizationId: "org_beta", ownerUserId: "usr_admin_beta" }),
  });
  assert.equal(transferred.response.status, 200, JSON.stringify(transferred.body));
  await esp.closed();

  const staleDownload = await fetch(localDownloadUrl, {
    headers: { Authorization: `Bearer ${bearer}` },
    redirect: "manual",
  });
  assert.equal(staleDownload.status, 404);
  assert.equal(staleDownload.headers.get("location"), null);

  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const device = persisted.devices.find((item) => item.id === "dev_ota_private_transfer");
  const command = persisted.deviceCommands.find((item) => item.id === wireCommand.id);
  assert.equal(device.organizationId, "org_beta");
  assert.equal(device.ota.status, "failed");
  assert.equal(Object.hasOwn(device.ota, "tokenHash"), false);
  assert.equal(command.state, "failed");
  assert.equal(command.code, "OTA_OWNERSHIP_CHANGED");
});

test("concurrent auth responses cannot register a socket after it has been closed", async () => {
  const esp = openSocket("/esp");
  await esp.opened;
  const challenge = await esp.nextJson();
  const response = JSON.stringify({
    type: "auth.response",
    protocolVersion: 1,
    deviceId: "dev_beta",
    challengeId: challenge.challengeId,
    proof: createDeviceProof(challenge, "dev_beta", secrets.beta),
    telemetry: {},
  });
  esp.socket.send(response);
  esp.socket.send(response);
  assert.equal((await esp.closed()).code, 1008);
  await delay(50);

  const listener = openSocket("/app");
  await listener.opened;
  const status = await listener.nextJson();
  assert.equal(status.type, "status");
  assert.equal(status.wsEsp, 0, "a closed auth race must never leave a ghost device session");
  listener.socket.close();
});

test("a revoke committed between proof verification and registration fails the final authentication fence", async () => {
  const token = await loginPlatformAdmin();
  const esp = openSocket("/esp");
  await esp.opened;
  const challenge = await esp.nextJson();
  esp.socket.send(JSON.stringify({
    type: "auth.response",
    protocolVersion: 1,
    deviceId: "dev_auth_fence",
    challengeId: challenge.challengeId,
    proof: createDeviceProof(challenge, "dev_auth_fence", secrets.authFence),
    telemetry: {},
  }));

  await waitForFile(authFenceReadyPath);
  const revoked = await requestJson("/api/v1/devices/dev_auth_fence/revoke", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "revoke-during-device-auth-fence",
    },
    body: JSON.stringify({}),
  });
  assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));
  fs.writeFileSync(authFenceReleasePath, "release", "utf8");

  assert.deepEqual(await esp.nextJson(), {
    type: "auth.rejected",
    code: "DEVICE_AUTH_AUTHORITY_CHANGED",
  });
  const closed = await esp.closed();
  assert.equal(closed.code, 1008);
  assert.equal(closed.reason, "DEVICE_AUTH_AUTHORITY_CHANGED");
  const current = await requestJson("/api/v1/devices/dev_auth_fence", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(current.response.status, 200, JSON.stringify(current.body));
  assert.equal(current.body.device.online, false);
  assert.equal(current.body.device.status, "revoked");
});

test("device challenges are socket-bound, expiring, and one-use", async () => {
  assert.equal(containsSensitiveDeviceCredential({ secretHash: "credential-equivalent" }), true);
  assert.equal(containsSensitiveDeviceCredential({ nested: { accessToken: "must-not-persist" } }), true);
  assert.equal(containsSensitiveDeviceCredential({ secret_hash: "must-not-persist" }), true);
  let clock = Date.parse("2026-07-14T00:00:00.000Z");
  const authenticator = createDeviceAuthenticator({
    now: () => clock,
    findDeviceById: async (deviceId) =>
      deviceId === "dev_beta"
        ? { id: deviceId, secretHash: canonicalDeviceSecretHash(secrets.beta), status: "available" }
        : null,
  });
  const firstSocket = {};
  const firstChallenge = authenticator.issueChallenge(firstSocket);
  const firstResponse = {
    type: "auth.response",
    protocolVersion: 1,
    deviceId: "dev_beta",
    challengeId: firstChallenge.challengeId,
    proof: createDeviceProof(firstChallenge, "dev_beta", secrets.beta),
    telemetry: {},
  };
  assert.equal((await authenticator.authenticate(firstSocket, firstResponse)).ok, true);
  assert.deepEqual(await authenticator.authenticate(firstSocket, firstResponse), {
    ok: false,
    code: "INVALID_CREDENTIALS",
  });

  const secondSocket = {};
  authenticator.issueChallenge(secondSocket);
  assert.deepEqual(await authenticator.authenticate(secondSocket, firstResponse), {
    ok: false,
    code: "INVALID_CREDENTIALS",
  });

  const expiredSocket = {};
  const expiredChallenge = authenticator.issueChallenge(expiredSocket);
  clock += 10_001;
  assert.deepEqual(
    await authenticator.authenticate(expiredSocket, {
      ...firstResponse,
      challengeId: expiredChallenge.challengeId,
      proof: createDeviceProof(expiredChallenge, "dev_beta", secrets.beta),
    }),
    { ok: false, code: "INVALID_CREDENTIALS" },
  );

  const sensitiveSocket = {};
  const sensitiveChallenge = authenticator.issueChallenge(sensitiveSocket);
  assert.deepEqual(
    await authenticator.authenticate(sensitiveSocket, {
      ...firstResponse,
      challengeId: sensitiveChallenge.challengeId,
      proof: createDeviceProof(sensitiveChallenge, "dev_beta", secrets.beta),
      telemetry: { network: { wifiPassword: "must-not-leak" } },
    }),
    { ok: false, code: "INVALID_CREDENTIALS" },
  );
});

test("authenticated device audio frames are bounded", async () => {
  const esp = openSocket("/esp");
  await esp.opened;
  await authenticateDevice(esp, "dev_alpha_peer", secrets.peer);
  esp.socket.send(Buffer.alloc(64 * 1024 + 2));
  const closed = await esp.closed();
  assert.equal(closed.code, 1009);
  assert.equal(closed.reason, "AUDIO_FRAME_TOO_LARGE");
  await delay(100);
  const persistedDb = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const disconnectedDevice = persistedDb.devices.find((device) => device.id === "dev_alpha_peer");
  assert.equal(disconnectedDevice.connected, false);
  assert.equal(disconnectedDevice.status, "available");
  const token = await loginPlatformAdmin();
  const devices = await requestJson("/api/v1/devices", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(
    devices.body.devices.find((device) => device.id === "dev_alpha_peer")?.online,
    false,
    "fresh lastSeenAt must not fabricate online presence after the authenticated socket closes",
  );
});

test("pairing HTTP replay cannot bypass the transactional ownership fence", () => {
  const source = fs.readFileSync(path.join(rootDir, "server.js"), "utf8");
  const routeStart = source.indexOf(
    'if (segments.length === 3 && segments[2] === "pair" && method === "POST")',
  );
  const routeEnd = source.indexOf("\n  const device = segments[2]", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, "pairing route source must be discoverable");
  const routeSource = source.slice(routeStart, routeEnd);
  assert.equal(
    routeSource.includes("findIdempotentResource("),
    false,
    "HTTP pairing must not return an in-memory receipt before the canonical ownership lock",
  );
  assert.match(routeSource, /repositories\.devices\.savePairingWithAudit\(/);
  assert.match(routeSource, /DEVICE_PAIRING_REPOSITORY_UNAVAILABLE/);
});

test("pairing idempotency is tenant scoped, concurrency safe, and defaults QR claims correctly", async () => {
  const token = await loginPlatformAdmin();
  const sharedKey = "pair-shared-across-tenants";
  const provisionClaim = async (organizationId, deviceId, idempotencyKey) => {
    const provisioned = await requestJson("/api/v1/devices/provision-qr", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        organizationId,
        deviceId,
      }),
    });
    assert.equal(provisioned.response.status, 201, JSON.stringify(provisioned.body));
    return provisioned.body.claim.claimCode;
  };
  const alphaClaimCode = await provisionClaim("org_alpha", "dev_pair_scope_alpha", "provision-pair-alpha");
  const betaClaimCode = await provisionClaim("org_beta", "dev_pair_scope_beta", "provision-pair-beta");
  const activeBetaClaimCode = await provisionClaim(
    "org_beta",
    "dev_pair_active_beta",
    "provision-pair-active-beta",
  );
  const multiWorkspaceToken = await login("admin@multi.test");
  const omittedWorkspace = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${multiWorkspaceToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "pair-active-workspace-omitted",
    },
    body: JSON.stringify({
      deviceId: "dev_pair_scope_alpha",
      claimCode: alphaClaimCode,
      connectionMethod: "QR",
    }),
  });
  assert.equal(omittedWorkspace.response.status, 400, JSON.stringify(omittedWorkspace.body));
  assert.equal(omittedWorkspace.body.code, "device_claim_workspace_required");

  const mismatchedDeviceWorkspace = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${multiWorkspaceToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "pair-device-workspace-mismatch",
    },
    body: JSON.stringify({
      deviceId: "dev_pair_active_beta",
      organizationId: "org_alpha",
      claimCode: activeBetaClaimCode,
      connectionMethod: "QR",
    }),
  });
  assert.equal(mismatchedDeviceWorkspace.response.status, 403, JSON.stringify(mismatchedDeviceWorkspace.body));
  assert.equal(mismatchedDeviceWorkspace.body.code, "device_claim_workspace_mismatch");

  const inactiveSelectedWorkspace = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${multiWorkspaceToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "pair-background-membership-denied",
    },
    body: JSON.stringify({
      deviceId: "dev_pair_active_beta",
      organizationId: "org_beta",
      claimCode: activeBetaClaimCode,
      connectionMethod: "QR",
    }),
  });
  assert.equal(inactiveSelectedWorkspace.response.status, 403, JSON.stringify(inactiveSelectedWorkspace.body));
  assert.equal(inactiveSelectedWorkspace.body.code, "device_claim_active_workspace_mismatch");

  const pairForTenant = (organizationId, deviceId, claimCode) =>
    requestJson("/api/v1/devices/pair", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": sharedKey,
      },
      body: JSON.stringify({ organizationId, deviceId, claimCode }),
    });
  const alphaPair = await pairForTenant("org_alpha", "dev_pair_scope_alpha", alphaClaimCode);
  const betaPair = await pairForTenant("org_beta", "dev_pair_scope_beta", betaClaimCode);
  assert.equal(alphaPair.response.status, 200, JSON.stringify(alphaPair.body));
  assert.equal(betaPair.response.status, 200, JSON.stringify(betaPair.body));
  assert.equal(alphaPair.body.device.organizationId, "org_alpha");
  assert.equal(betaPair.body.device.organizationId, "org_beta");

  const alphaDoctorToken = await login("doctor@alpha.test");
  const crossWorkspaceReplay = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${alphaDoctorToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": sharedKey,
    },
    body: JSON.stringify({
      deviceId: "dev_pair_scope_beta",
      organizationId: "org_beta",
      claimCode: betaClaimCode,
    }),
  });
  assert.equal(crossWorkspaceReplay.response.status, 403, "an idempotency key must never bypass workspace isolation");
  assert.equal(crossWorkspaceReplay.body.code, "device_claim_active_workspace_mismatch");

  const concurrentClaimCode = await provisionClaim(
    "org_alpha",
    "dev_pair_concurrent",
    "provision-pair-concurrent",
  );
  const concurrentPayload = {
    organizationId: "org_alpha",
    deviceId: "dev_pair_concurrent",
    claimCode: concurrentClaimCode,
  };
  const concurrentHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "pair-concurrent-once",
  };
  const concurrentResponses = await Promise.all([
    requestJson("/api/v1/devices/pair", {
      method: "POST",
      headers: concurrentHeaders,
      body: JSON.stringify(concurrentPayload),
    }),
    requestJson("/api/v1/devices/pair", {
      method: "POST",
      headers: concurrentHeaders,
      body: JSON.stringify(concurrentPayload),
    }),
  ]);
  assert.deepEqual(concurrentResponses.map(({ response }) => response.status), [200, 200]);
  assert.equal(
    concurrentResponses.filter(({ body }) => body.idempotent === true).length,
    1,
    "one concurrent request must replay the committed pairing result",
  );
  const afterConcurrentPair = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  assert.equal(
    afterConcurrentPair.auditLogs.filter((entry) => entry.action === "device.pair" && entry.resourceId === "dev_pair_concurrent").length,
    1,
  );
  assert.equal(
    afterConcurrentPair.notifications.filter((notification) => notification.metadata?.deviceId === "dev_pair_concurrent").length,
    1,
  );

  const revokedReplayClaimCode = await provisionClaim(
    "org_alpha",
    "dev_pair_revoked_replay",
    "provision-pair-revoked-replay",
  );
  const revokedReplayPayload = {
    organizationId: "org_alpha",
    deviceId: "dev_pair_revoked_replay",
    claimCode: revokedReplayClaimCode,
  };
  const revokedReplayHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "pair-before-revoke",
  };
  const pairedBeforeRevoke = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: revokedReplayHeaders,
    body: JSON.stringify(revokedReplayPayload),
  });
  assert.equal(pairedBeforeRevoke.response.status, 200, JSON.stringify(pairedBeforeRevoke.body));
  const revoked = await requestJson("/api/v1/devices/dev_pair_revoked_replay/revoke", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "revoke-paired-replay-device",
    },
  });
  assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));
  const beforeStaleReplay = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const staleReplay = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: revokedReplayHeaders,
    body: JSON.stringify(revokedReplayPayload),
  });
  assert.notEqual(staleReplay.response.status, 200, "a revoked authority must invalidate the old pairing receipt");
  assert.equal(staleReplay.body.code, "device_claim_revoked");
  const afterStaleReplay = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  assert.equal(
    afterStaleReplay.auditLogs.filter(
      (entry) => entry.action === "device.pair" && entry.resourceId === "dev_pair_revoked_replay",
    ).length,
    beforeStaleReplay.auditLogs.filter(
      (entry) => entry.action === "device.pair" && entry.resourceId === "dev_pair_revoked_replay",
    ).length,
    "a stale replay must not append another pairing audit",
  );
  assert.equal(
    afterStaleReplay.notifications.filter(
      (notification) => notification.metadata?.deviceId === "dev_pair_revoked_replay",
    ).length,
    beforeStaleReplay.notifications.filter(
      (notification) => notification.metadata?.deviceId === "dev_pair_revoked_replay",
    ).length,
    "a stale replay must not enqueue another pairing notification",
  );

  const provisioned = await requestJson("/api/v1/devices/provision-qr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "provision-qr-default",
    },
    body: JSON.stringify({
      organizationId: "org_alpha",
      deviceId: "dev_pair_qr",
      name: "QR Pair",
    }),
  });
  assert.equal(provisioned.response.status, 201, JSON.stringify(provisioned.body));
  const qrPair = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "pair-qr-default",
    },
    body: JSON.stringify({
      deviceId: "dev_pair_qr",
      organizationId: "org_alpha",
      claimCode: provisioned.body.claim.claimCode,
    }),
  });
  assert.equal(qrPair.response.status, 200, JSON.stringify(qrPair.body));
  assert.equal(qrPair.body.device.connectionMethod, "QR");
  assert.equal(qrPair.body.pairing.outcome, "accepted");
  assert.equal(qrPair.body.pairing.presence, "awaiting_online");
});

test("device enrollment and two-phase server-generated credential rotation never expose secrets", async () => {
  const token = await loginPlatformAdmin();
  const oversized = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      deviceId: "dev_oversized_secret",
      organizationId: "org_alpha",
      deviceSecret: "x".repeat(96),
    }),
  });
  assert.equal(oversized.response.status, 400, "claim must reject every client-supplied credential");
  assert.equal(oversized.body.code, "device_pairing_field_forbidden");

  const bluetooth = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "pair-bluetooth-must-be-rejected",
    },
    body: JSON.stringify({
      deviceId: "dev_bluetooth_forbidden",
      organizationId: "org_alpha",
      claimCode: "unused-claim-code",
      connectionMethod: "Bluetooth",
    }),
  });
  assert.equal(bluetooth.response.status, 400, "pairing must reject Bluetooth until a real BLE contract exists");
  assert.equal(bluetooth.body.code, "device_pairing_method_unsupported");

  const provisioned = await requestJson("/api/v1/devices/provision-qr", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "provision-enrolled-device",
    },
    body: JSON.stringify({
      deviceId: "dev_enrolled",
      organizationId: "org_alpha",
      name: "Enrolled Device",
    }),
  });
  assert.equal(provisioned.response.status, 201, JSON.stringify(provisioned.body));

  const pairHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "pair-enrolled-offline",
  };
  const pairPayload = {
    deviceId: "dev_enrolled",
    organizationId: "org_alpha",
    claimCode: provisioned.body.claim.claimCode,
    connectionMethod: "Manual",
  };
  const enrolled = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: pairHeaders,
    body: JSON.stringify(pairPayload),
  });
  assert.equal(enrolled.response.status, 200, JSON.stringify(enrolled.body));
  assert.deepEqual(Object.keys(enrolled.body).sort(), ["device", "pairing"]);
  assert.deepEqual(Object.keys(enrolled.body.device).sort(), [
    "connected",
    "id",
    "name",
    "online",
    "organizationId",
    "ownerUserId",
    "ownershipState",
    "pairedUserId",
    "status",
    "type",
    "updatedAt",
    "connectionMethod",
  ].sort());
  assert.equal(enrolled.body.device.secret, undefined);
  assert.equal(enrolled.body.device.secretHash, undefined);
  assert.equal(enrolled.body.device.deviceSecret, undefined);
  assert.equal(enrolled.body.device.connectionMethod, "Manual", "manual entry is the safe non-QR default");
  assert.deepEqual(enrolled.body.pairing, {
    outcome: "accepted",
    presence: "awaiting_online",
    onlineConfirmed: false,
    authenticatedTransport: null,
  });

  const replayed = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: pairHeaders,
    body: JSON.stringify(pairPayload),
  });
  assert.equal(replayed.response.status, 200, JSON.stringify(replayed.body));
  assert.equal(replayed.body.idempotent, true);
  assert.deepEqual(replayed.body.device, enrolled.body.device, "safe replay must return the original response snapshot");
  assert.deepEqual(replayed.body.pairing, enrolled.body.pairing);

  const mismatchedReplay = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: pairHeaders,
    body: JSON.stringify({ ...pairPayload, connectionMethod: "QR" }),
  });
  assert.equal(mismatchedReplay.response.status, 409, "one key cannot be reused for a different pairing payload");
  assert.equal(mismatchedReplay.body.code, "idempotency_key_reused");

  const afterOfflinePair = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  assert.equal(
    afterOfflinePair.devices.some((device) => device.id === "dev_bluetooth_forbidden"),
    false,
    "a rejected Bluetooth request must not create a device",
  );
  assert.equal(
    afterOfflinePair.auditLogs.filter((entry) => entry.action === "device.pair" && entry.resourceId === "dev_enrolled").length,
    1,
    "an idempotent replay must not duplicate the pairing audit",
  );
  const offlinePairNotifications = afterOfflinePair.notifications.filter(
    (notification) => notification.metadata?.deviceId === "dev_enrolled" && notification.metadata?.pairingOutcome === "accepted",
  );
  assert.equal(offlinePairNotifications.length, 1, "an idempotent replay must not duplicate its notification");
  assert.equal(offlinePairNotifications[0].type, "info", "an offline device must not produce a success notification");
  assert.equal(offlinePairNotifications[0].metadata.presence, "awaiting_online");

  const esp = openSocket("/esp");
  await esp.opened;
  const initialAuth = await authenticateDevice(esp, "dev_enrolled", secrets.enrolled);

  const onlineDevice = await requestJson("/api/v1/devices/dev_enrolled", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(onlineDevice.response.status, 200, JSON.stringify(onlineDevice.body));
  assert.equal(onlineDevice.body.device.online, true, "online state requires authenticated WSS presence");

  const consumedClaim = await requestJson("/api/v1/devices/pair", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "pair-enrolled-consumed-claim",
    },
    body: JSON.stringify(pairPayload),
  });
  assert.equal(consumedClaim.response.status, 409, "a one-time claim cannot create a second pairing mutation");
  assert.equal(consumedClaim.body.code, "device_claim_state_invalid");

  const operatorSecret = await requestJson("/api/v1/devices/dev_enrolled/rotate-secret", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "rotate-operator-secret-forbidden",
    },
    body: JSON.stringify({ deviceSecret: secrets.rotated }),
  });
  assert.equal(operatorSecret.response.status, 400);
  assert.equal(operatorSecret.body.code, "device_secret_server_generated_only");

  const missingIdempotency = await requestJson("/api/v1/devices/dev_enrolled/rotate-secret", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missingIdempotency.response.status, 400);
  assert.equal(missingIdempotency.body.code, "idempotency_key_required");

  const rotationHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "rotate-enrolled-two-phase",
  };
  const initiated = await requestJson("/api/v1/devices/dev_enrolled/rotate-secret", {
    method: "POST",
    headers: rotationHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(initiated.response.status, 202, JSON.stringify(initiated.body));
  assert.equal(initiated.body.confirmed, false);
  assert.equal(initiated.body.rotation.state, "pending_device_ack");
  assert.equal(initiated.body.rotation.secretHash, undefined);
  assert.equal(initiated.body.rotation.nextSecretHash, undefined);
  assert.equal(JSON.stringify(initiated.body).includes(secrets.enrolled), false);
  assert.equal(JSON.stringify(initiated.body).includes(secrets.rotated), false);

  const rotationCommand = await esp.nextJson();
  assert.equal(rotationCommand.type, "device.rotate_secret");
  assert.equal(rotationCommand.payload.rotationId, initiated.body.rotation.id);
  assert.equal(rotationCommand.payload.wrapAlgorithm, "A256GCM");
  assert.equal(JSON.stringify(rotationCommand).includes(secrets.enrolled), false);
  assert.equal(JSON.stringify(rotationCommand).includes(secrets.rotated), false);
  const sessionWrapKey = deriveDeviceRotationWrapKey(
    crypto.createHash("sha256").update(secrets.enrolled, "utf8").digest(),
    {
      challengeId: initialAuth.challenge.challengeId,
      nonce: initialAuth.challenge.nonce,
      deviceId: "dev_enrolled",
      sessionId: initialAuth.accepted.sessionId,
    },
  );
  const generatedSecret = unwrapRotationSecret({
    algorithm: rotationCommand.payload.wrapAlgorithm,
    keyDerivation: rotationCommand.payload.wrapKeyDerivation,
    iv: rotationCommand.payload.wrapIv,
    ciphertext: rotationCommand.payload.wrapCiphertext,
    tag: rotationCommand.payload.wrapTag,
  }, sessionWrapKey, {
    rotationId: initiated.body.rotation.id,
    deviceId: "dev_enrolled",
    sessionId: initialAuth.accepted.sessionId,
  });
  assert.match(generatedSecret, /^[A-Za-z0-9_-]{43,95}$/);
  assert.notEqual(generatedSecret, secrets.enrolled);

  const replayedRotation = await requestJson("/api/v1/devices/dev_enrolled/rotate-secret", {
    method: "POST",
    headers: rotationHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(replayedRotation.response.status, 202, JSON.stringify(replayedRotation.body));
  assert.equal(replayedRotation.body.idempotent, true);
  assert.equal(replayedRotation.body.rotation.id, initiated.body.rotation.id);

  esp.socket.send(JSON.stringify({
    protocolVersion: 1,
    type: "command.status",
    commandId: rotationCommand.id,
    correlationId: rotationCommand.correlationId,
    state: "acknowledged",
    code: "ROTATION_CANDIDATE_PERSISTED",
    detail: "candidate persisted",
  }));
  esp.socket.send(JSON.stringify({
    protocolVersion: 1,
    type: "command.status",
    commandId: rotationCommand.id,
    correlationId: rotationCommand.correlationId,
    state: "applying",
    code: "ROTATION_RECONNECTING",
    detail: "reconnecting with candidate credential",
  }));
  const confirming = await waitForCommandState(token, "dev_enrolled", rotationCommand.id, "applying");
  assert.equal(confirming.code, "ROTATION_RECONNECTING");

  const candidate = openSocket("/esp");
  await candidate.opened;
  const candidateAuth = await authenticateDevice(candidate, "dev_enrolled", generatedSecret);
  assert.equal(candidateAuth.accepted.credentialSlot, "rotation_candidate");
  assert.equal(candidateAuth.accepted.rotationId, initiated.body.rotation.id);
  assert.equal(candidateAuth.accepted.rotationState, "confirmed");
  assert.equal((await esp.closed()).reason, "CREDENTIAL_ROTATED");
  const confirmedCommand = await waitForCommandState(token, "dev_enrolled", rotationCommand.id, "applied");
  assert.equal(confirmedCommand.code, "ROTATION_RECONNECT_CONFIRMED");

  const confirmedDevice = await requestJson("/api/v1/devices/dev_enrolled", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(confirmedDevice.response.status, 200, JSON.stringify(confirmedDevice.body));
  assert.equal(confirmedDevice.body.device.credentialRotation.state, "confirmed");
  assert.equal(confirmedDevice.body.device.credentialRotation.confirmed, true);
  assert.equal(confirmedDevice.body.device.credentialRotation.nextSecretHash, undefined);
  assert.equal(confirmedDevice.body.device.secretHash, undefined);

  const persistedAfterRotation = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  const enrolledAfterRotation = persistedAfterRotation.devices.find(
    (item) => item.id === "dev_enrolled",
  );
  assert.equal(
    enrolledAfterRotation.secretHash,
    canonicalDeviceSecretHash(generatedSecret),
    "confirmation must promote only the candidate verification material",
  );
  assert.equal(JSON.stringify(persistedAfterRotation).includes(generatedSecret), false);
  assert.equal(
    persistedAfterRotation.auditLogs.filter(
      (entry) => entry.action === "device.secret_rotation.initiated" && entry.resourceId === "dev_enrolled",
    ).length,
    1,
  );
  assert.equal(
    persistedAfterRotation.auditLogs.filter(
      (entry) => entry.action === "device.secret_rotation.confirmed" && entry.resourceId === "dev_enrolled",
    ).length,
    1,
  );
  candidate.socket.close();
  await candidate.closed();

  const retiredCredential = openSocket("/esp");
  await retiredCredential.opened;
  const retiredChallenge = await retiredCredential.nextJson();
  retiredCredential.socket.send(JSON.stringify({
    type: "auth.response",
    protocolVersion: 1,
    deviceId: "dev_enrolled",
    challengeId: retiredChallenge.challengeId,
    proof: createDeviceProof(retiredChallenge, "dev_enrolled", secrets.enrolled),
    telemetry: {},
  }));
  const retiredRejected = await retiredCredential.nextJson();
  assert.equal(retiredRejected.type, "auth.rejected");
  assert.equal(retiredRejected.code, "INVALID_CREDENTIALS");
  await retiredCredential.closed();

  const reconnected = openSocket("/esp");
  await reconnected.opened;
  const recoveredAuth = await authenticateDevice(reconnected, "dev_enrolled", generatedSecret);
  assert.equal(recoveredAuth.accepted.credentialSlot, "current");
  assert.equal(recoveredAuth.accepted.rotationId, "");
  assert.equal(recoveredAuth.accepted.rotationState, "");
  const activeScan = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "rotation-reconnect-active-scan",
    },
    body: JSON.stringify({ patientId: "pat_alpha", deviceId: "dev_enrolled", mode: "heart" }),
  });
  assert.equal(activeScan.response.status, 201, JSON.stringify(activeScan.body));
  const transferred = await requestJson("/api/v1/devices/dev_enrolled/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "transfer-enrolled-to-beta",
    },
    body: JSON.stringify({ organizationId: "org_beta", ownerUserId: "usr_admin_beta" }),
  });
  assert.equal(transferred.response.status, 200, JSON.stringify(transferred.body));
  assert.equal(transferred.body.device.organizationId, "org_beta");
  assert.equal(transferred.body.device.connected, false);
  assert.equal((await reconnected.closed()).reason, "WORKSPACE_TRANSFERRED");
  const interrupted = await requestJson(`/api/v1/scans/${encodeURIComponent(activeScan.body.scan.id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(interrupted.body.scan.status, "interrupted");
});

test("failed candidate persistence rolls rotation back to the old-only credential state", async () => {
  const token = await loginPlatformAdmin();
  const esp = openSocket("/esp");
  await esp.opened;
  await authenticateDevice(esp, "dev_alpha", secrets.alpha);

  const initiated = await requestJson("/api/v1/devices/dev_alpha/rotate-secret", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "rotate-alpha-device-persist-failure",
    },
    body: JSON.stringify({}),
  });
  assert.equal(initiated.response.status, 202, JSON.stringify(initiated.body));
  const command = await esp.nextJson();
  assert.equal(command.type, "device.rotate_secret");
  esp.socket.send(JSON.stringify({
    protocolVersion: 1,
    type: "command.status",
    commandId: command.id,
    correlationId: command.correlationId,
    state: "failed",
    code: "ROTATION_CANDIDATE_PERSIST_FAILED",
    detail: "candidate store rejected",
  }));
  await waitForCommandState(token, "dev_alpha", command.id, "failed");
  const rolledBack = await requestJson("/api/v1/devices/dev_alpha", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(rolledBack.response.status, 200, JSON.stringify(rolledBack.body));
  assert.equal(rolledBack.body.device.credentialRotation.state, "rolled_back");
  assert.equal(rolledBack.body.device.credentialRotation.confirmed, false);
  assert.equal(esp.socket.readyState, WebSocket.OPEN, "rollback must keep the old authenticated session alive");
  const { device, persisted } = await waitForPersistedDevice(
    "dev_alpha",
    (candidate) =>
      candidate.credentialRotation?.state === "rolled_back" &&
      candidate.credentialRotation?.nextSecretHash === "",
  );
  assert.equal(device.secretHash, canonicalDeviceSecretHash(secrets.alpha));
  assert.equal(device.credentialRotation.nextSecretHash, "");
  assert.equal(
    persisted.auditLogs.filter(
      (entry) => entry.action === "device.secret_rotation.rolled_back" && entry.resourceId === "dev_alpha",
    ).length,
    1,
  );
  esp.socket.close();
  await esp.closed();
  const oldCredentialReconnect = openSocket("/esp");
  await oldCredentialReconnect.opened;
  await authenticateDevice(oldCredentialReconnect, "dev_alpha", secrets.alpha);
  oldCredentialReconnect.socket.close();
  await oldCredentialReconnect.closed();
});

test("device command lifecycle requires canonical delivery and correlated device confirmation", async () => {
  const esp = openSocket("/esp");
  await esp.opened;
  await authenticateDevice(esp, "dev_alpha_peer", secrets.peer);

  const token = await loginPlatformAdmin();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "device-command-wifi-status-001",
  };
  const openedSetup = await requestJson(
    "/api/v1/devices/dev_alpha_peer/setup-session",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ supportedTransports: ["esptouch_v2"] }),
    },
  );
  assert.equal(openedSetup.response.status, 200, JSON.stringify(openedSetup.body));
  assert.equal(openedSetup.body.setup?.protocolVersion, 2);
  const openSetupCommand = await esp.nextJson();
  assert.equal(openSetupCommand.type, "wifi.setup.open");
  assert.deepEqual(openSetupCommand.payload, {});
  assert.equal(openSetupCommand.deviceId, undefined);
  assert.doesNotMatch(
    JSON.stringify(openSetupCommand),
    /password|secret|proofOfPossession|ssid/i,
    "the remote setup-open command must never carry Wi-Fi or device credentials",
  );
  const wifiCredential = "clinic-low-entropy-password";
  const beforeRemoteWifiUpdate = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  const rejectedRemoteWifiUpdate = await requestJson(
    "/api/v1/devices/dev_alpha_peer/commands",
    {
      method: "POST",
      headers: {
        ...headers,
        "Idempotency-Key": "remote-wifi-update-must-not-persist",
      },
      body: JSON.stringify({
        type: "wifi.update",
        payload: { ssid: "Clinic WiFi", password: wifiCredential },
      }),
    },
  );
  assert.equal(rejectedRemoteWifiUpdate.response.status, 409, JSON.stringify(rejectedRemoteWifiUpdate.body));
  assert.equal(rejectedRemoteWifiUpdate.body.code, "device_wifi_update_local_setup_required");
  assert.equal(rejectedRemoteWifiUpdate.body.details?.setupFlow, "secure_setup_ap");
  await assert.rejects(
    () => esp.nextJson(150),
    /timed out waiting for WebSocket message/,
    "a remote Wi-Fi credential must never reach the device transport",
  );
  const afterRemoteWifiUpdate = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  assert.equal(afterRemoteWifiUpdate.deviceCommands.length, beforeRemoteWifiUpdate.deviceCommands.length);
  assert.equal(afterRemoteWifiUpdate.idempotencyKeys.length, beforeRemoteWifiUpdate.idempotencyKeys.length);
  assert.equal(afterRemoteWifiUpdate.auditLogs.length, beforeRemoteWifiUpdate.auditLogs.length);
  assert.doesNotMatch(
    JSON.stringify(afterRemoteWifiUpdate),
    new RegExp(wifiCredential, "i"),
    "a rejected Wi-Fi credential must not enter the durable database",
  );
  const specializedCommands = new Map([
    ["device.revoke", "/v1/devices/{deviceId}/revoke"],
    ["device.rotate_secret", "/v1/devices/{deviceId}/rotate-secret"],
    ["ota.update", "/v1/devices/{deviceId}/ota"],
    ["audio.session.start", "/v1/scans/start"],
    ["audio.session.stop", "/v1/scans/{scanId}/stop"],
  ]);
  const beforeSpecializedRejections = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  for (const [type, specializedRoute] of specializedCommands) {
    const rejected = await requestJson("/api/v1/devices/dev_alpha_peer/commands", {
      method: "POST",
      headers: {
        ...headers,
        "Idempotency-Key": `generic-bypass-${type.replace(/[^a-z0-9]+/gi, "-")}`,
      },
      body: JSON.stringify({ type, payload: {} }),
    });
    assert.equal(rejected.response.status, 409, JSON.stringify(rejected.body));
    assert.equal(rejected.body.code, "device_command_specialized_route_required");
    assert.equal(rejected.body.details?.commandType, type);
    assert.equal(rejected.body.details?.specializedRoute, specializedRoute);
  }
  await assert.rejects(
    () => esp.nextJson(150),
    /timed out waiting for WebSocket message/,
    "a rejected specialized command must never reach the device transport",
  );
  const afterSpecializedRejections = JSON.parse(
    fs.readFileSync(path.join(dataDir, "db.json"), "utf8"),
  );
  for (const type of specializedCommands.keys()) {
    assert.equal(
      afterSpecializedRejections.deviceCommands.filter((command) => command.type === type).length,
      beforeSpecializedRejections.deviceCommands.filter((command) => command.type === type).length,
      `the generic endpoint must not reserve a ${type} lifecycle command`,
    );
  }
  const created = await requestJson("/api/v1/devices/dev_alpha_peer/commands", {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "wifi.status", payload: {} }),
  });
  assert.equal(created.response.status, 202, JSON.stringify(created.body));
  assert.equal(created.body.command.protocolVersion, 1);
  assert.equal(created.body.command.type, "wifi.status");
  assert.equal(created.body.command.state, "delivered");
  assert.ok(created.body.command.id);
  assert.ok(created.body.command.correlationId);
  assert.ok(Number.isFinite(Date.parse(created.body.command.issuedAt)));
  assert.ok(Number.isFinite(Date.parse(created.body.command.expiresAt)));
  assert.ok(Date.parse(created.body.command.expiresAt) > Date.parse(created.body.command.issuedAt));

  const wireCommand = await esp.nextJson();
  assert.deepEqual(wireCommand, {
    protocolVersion: 1,
    id: created.body.command.id,
    type: "wifi.status",
    issuedAt: created.body.command.issuedAt,
    expiresAt: created.body.command.expiresAt,
    payload: {},
    correlationId: created.body.command.correlationId,
  });

  const replayed = await requestJson("/api/v1/devices/dev_alpha_peer/commands", {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "wifi.status", payload: {} }),
  });
  assert.equal(replayed.response.status, 202, JSON.stringify(replayed.body));
  assert.equal(replayed.body.idempotent, true);
  assert.equal(replayed.body.command.id, created.body.command.id);
  await assert.rejects(() => esp.nextJson(150), /timed out waiting for WebSocket message/);

  for (const [state, code] of [
    ["acknowledged", "COMMAND_ACKNOWLEDGED"],
    ["applying", "COMMAND_APPLYING"],
    ["applied", "OK"],
  ]) {
    esp.socket.send(
      JSON.stringify({
        protocolVersion: 1,
        type: "command.status",
        commandId: created.body.command.id,
        correlationId: created.body.command.correlationId,
        state,
        code,
        detail: state === "applied" ? "device confirmed current Wi-Fi status" : state,
      }),
    );
    const command = await waitForCommandState(
      token,
      "dev_alpha_peer",
      created.body.command.id,
      state,
    );
    assert.equal(command.deviceId, "dev_alpha_peer");
    assert.equal(command.correlationId, created.body.command.correlationId);
  }

  esp.socket.send(
    JSON.stringify({
      protocolVersion: 1,
      type: "command.status",
      commandId: created.body.command.id,
      correlationId: created.body.command.correlationId,
      state: "acknowledged",
      code: "LATE_ACK",
    }),
  );
  await delay(75);
  const terminal = await waitForCommandState(
    token,
    "dev_alpha_peer",
    created.body.command.id,
    "applied",
  );
  assert.equal(terminal.code, "OK", "a terminal command must not regress on a late status replay");

  const concurrentHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "device-command-concurrent-reservation-001",
  };
  const concurrentPayload = { type: "wifi.status", payload: { probe: "concurrent" } };
  const concurrentResponses = await Promise.all([
    requestJson("/api/v1/devices/dev_alpha_peer/commands", {
      method: "POST",
      headers: concurrentHeaders,
      body: JSON.stringify(concurrentPayload),
    }),
    requestJson("/api/v1/devices/dev_alpha_peer/commands", {
      method: "POST",
      headers: concurrentHeaders,
      body: JSON.stringify(concurrentPayload),
    }),
  ]);
  assert.deepEqual(concurrentResponses.map(({ response }) => response.status), [202, 202]);
  assert.equal(
    concurrentResponses[0].body.command.id,
    concurrentResponses[1].body.command.id,
    "concurrent retries must resolve to one durable command reservation",
  );
  assert.equal(
    concurrentResponses.filter(({ body }) => body.idempotent === true).length,
    1,
  );
  const concurrentWireCommand = await esp.nextJson();
  assert.equal(concurrentWireCommand.id, concurrentResponses[0].body.command.id);
  assert.equal(concurrentWireCommand.protocolVersion, 1);
  await assert.rejects(
    () => esp.nextJson(150),
    /timed out waiting for WebSocket message/,
    "the atomic reservation must prevent duplicate transport delivery",
  );
  const commandMismatch = await requestJson("/api/v1/devices/dev_alpha_peer/commands", {
    method: "POST",
    headers: concurrentHeaders,
    body: JSON.stringify({ type: "wifi.status", payload: { probe: "different" } }),
  });
  assert.equal(commandMismatch.response.status, 409, JSON.stringify(commandMismatch.body));
  assert.equal(commandMismatch.body.code, "idempotency_key_reused");
  await confirmDeviceCommandApplied(esp, concurrentWireCommand);
  await waitForCommandState(
    token,
    "dev_alpha_peer",
    concurrentWireCommand.id,
    "applied",
  );
  const commandReservationDb = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
  assert.equal(
    commandReservationDb.auditLogs.filter(
      (entry) => entry.action === "device.command" && entry.metadata?.commandId === concurrentWireCommand.id,
    ).length,
    1,
  );
  assert.equal(
    commandReservationDb.deviceEvents.filter(
      (event) => event.eventType === "command.accepted" && event.payload?.commandId === concurrentWireCommand.id,
    ).length,
    1,
  );
  assert.ok(
    commandReservationDb.deviceEvents
      .filter((event) => event.payload?.commandId === concurrentWireCommand.id)
      .every((event) => event.payload.protocolVersion === 1),
    "command event receipts must retain the protocol version",
  );
  const commandReservationReceipt = commandReservationDb.idempotencyKeys.find(
    (entry) =>
      entry.operation === "device.command:dev_alpha_peer" &&
      entry.key === concurrentHeaders["Idempotency-Key"],
  );
  assert.equal(commandReservationReceipt?.resourceType, "device_command_reservation");
  assert.equal(commandReservationReceipt?.responseResource?.command?.protocolVersion, 1);

  const expiring = await requestJson("/api/v1/devices/dev_alpha_peer/commands", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "device-command-expiry-001",
    },
    body: JSON.stringify({ type: "wifi.status", payload: {}, ttlMs: 50 }),
  });
  assert.equal(expiring.response.status, 202, JSON.stringify(expiring.body));
  await esp.nextJson();
  await delay(75);
  const expired = await requestJson(
    `/api/v1/devices/dev_alpha_peer/commands/${encodeURIComponent(expiring.body.command.id)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(expired.response.status, 200, JSON.stringify(expired.body));
  assert.equal(expired.body.command.state, "expired");
  assert.equal(expired.body.command.code, "COMMAND_EXPIRED");
  esp.socket.close();
});

test("startup recovery terminalizes a stranded created scan", async () => {
  const token = await loginPlatformAdmin();
  const recovered = await requestJson("/api/v1/scans/scan_restart_created", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(recovered.response.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.scan.status, "interrupted");
  assert.equal(recovered.body.scan.processingStatus, "interrupted");
  assert.equal(recovered.body.scan.aiLabel, "interrupted");
  assert.ok(recovered.body.scan.endedAt, "restart recovery must record a terminal timestamp");
});

test("scan stop requires idempotency and rejects exact-key reuse for another scan", async () => {
  const token = await loginPlatformAdmin();
  const missingKey = await requestJson("/api/v1/scans/scan_restart_created/stop", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(missingKey.response.status, 400, JSON.stringify(missingKey.body));
  assert.equal(missingKey.body.code, "idempotency_key_required");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Idempotency-Key": "scan-stop-exact-fingerprint",
  };
  const first = await requestJson("/api/v1/scans/scan_restart_created/stop", {
    method: "POST",
    headers,
  });
  assert.equal(first.response.status, 200, JSON.stringify(first.body));
  const replay = await requestJson("/api/v1/scans/scan_restart_created/stop", {
    method: "POST",
    headers,
  });
  assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.idempotent, true);

  const mismatch = await requestJson("/api/v1/scans/scan_restart_recording/stop", {
    method: "POST",
    headers,
  });
  assert.equal(mismatch.response.status, 409, JSON.stringify(mismatch.body));
  assert.equal(mismatch.body.code, "idempotency_key_reused");
});

test("scan start requires idempotency and rejects an exact-key payload mismatch", async () => {
  const peer = openSocket("/esp");
  await peer.opened;
  await authenticateDevice(peer, "dev_alpha_peer", secrets.peer);
  const token = await loginPlatformAdmin();
  const requestBody = { patientId: "pat_alpha", deviceId: "dev_alpha_peer", mode: "heart" };
  const missingKey = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  assert.equal(missingKey.response.status, 400, JSON.stringify(missingKey.body));
  assert.equal(missingKey.body.code, "idempotency_key_required");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "scan-start-exact-fingerprint",
  };
  const started = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
  assert.equal(started.response.status, 201, JSON.stringify(started.body));
  const command = await peer.nextJson();
  const replay = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
  assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.idempotent, true);
  assert.equal(replay.body.scan.id, started.body.scan.id);

  const mismatch = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...requestBody, mode: "lung" }),
  });
  assert.equal(mismatch.response.status, 409, JSON.stringify(mismatch.body));
  assert.equal(mismatch.body.code, "idempotency_key_reused");
  sendDeviceCommandStatus(peer, command, "failed", "TEST_CLEANUP", "test cleanup");
  await waitForScanState(token, started.body.scan.id, "interrupted");
  peer.socket.close();
});

test("audio sessions are concurrent per device and start ACKs are durable and idempotent", async () => {
  const alpha = openSocket("/esp");
  const beta = openSocket("/esp");
  await Promise.all([alpha.opened, beta.opened]);
  await authenticateDevice(alpha, "dev_alpha_peer", secrets.peer);
  await authenticateDevice(beta, "dev_beta", secrets.beta);

  const token = await loginPlatformAdmin();
  const startScan = (patientId, deviceId, idempotencyKey) =>
    requestJson("/api/v1/scans/start", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ patientId, deviceId, mode: "heart" }),
    });

  const [alphaStarted, betaStarted] = await Promise.all([
    startScan("pat_alpha", "dev_alpha_peer", "audio-start-alpha-concurrent"),
    startScan("pat_beta", "dev_beta", "audio-start-beta-concurrent"),
  ]);
  assert.equal(alphaStarted.response.status, 201, JSON.stringify(alphaStarted.body));
  assert.equal(betaStarted.response.status, 201, JSON.stringify(betaStarted.body));
  assert.notEqual(alphaStarted.body.scan.id, betaStarted.body.scan.id);
  assert.notEqual(alphaStarted.body.scan.status, "recording", "transport delivery alone is not device confirmation");
  assert.notEqual(betaStarted.body.scan.status, "recording", "transport delivery alone is not device confirmation");

  const [alphaCommand, betaCommand] = await Promise.all([alpha.nextJson(), beta.nextJson()]);
  assert.equal(alphaCommand.type, "audio.session.start");
  assert.equal(betaCommand.type, "audio.session.start");
  assert.equal(alphaCommand.payload.scanId, alphaStarted.body.scan.id);
  assert.equal(betaCommand.payload.scanId, betaStarted.body.scan.id);

  const replayed = await startScan("pat_alpha", "dev_alpha_peer", "audio-start-alpha-concurrent");
  assert.equal(replayed.response.status, 200, JSON.stringify(replayed.body));
  assert.equal(replayed.body.idempotent, true);
  assert.equal(replayed.body.scan.id, alphaStarted.body.scan.id);
  await assert.rejects(() => alpha.nextJson(150), /timed out waiting for WebSocket message/);

  const alphaLedgerBeforeAck = await waitForCommandState(
    token,
    "dev_alpha_peer",
    alphaCommand.id,
    "delivered",
  );
  const betaLedgerBeforeAck = await waitForCommandState(token, "dev_beta", betaCommand.id, "delivered");
  assert.equal(alphaLedgerBeforeAck.correlationId, alphaStarted.body.scan.id);
  assert.equal(betaLedgerBeforeAck.correlationId, betaStarted.body.scan.id);

  await Promise.all([
    confirmDeviceCommandApplied(alpha, alphaCommand),
    confirmDeviceCommandApplied(beta, betaCommand),
  ]);
  await Promise.all([
    waitForCommandState(token, "dev_alpha_peer", alphaCommand.id, "applied"),
    waitForCommandState(token, "dev_beta", betaCommand.id, "applied"),
  ]);

  for (const scanId of [alphaStarted.body.scan.id, betaStarted.body.scan.id]) {
    const scan = await requestJson(`/api/v1/scans/${encodeURIComponent(scanId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(scan.response.status, 200, JSON.stringify(scan.body));
    assert.equal(scan.body.scan.status, "recording");
  }

  const listener = openSocket("/app", [
    "shcare.realtime.v1",
    `shcare.bearer.${token}`,
    `shcare.scan.${Buffer.from(betaStarted.body.scan.id, "utf8").toString("base64url")}`,
  ]);
  await listener.opened;
  const boundStatus = await listener.nextJson();
  assert.equal(boundStatus.type, "status");
  assert.equal(boundStatus.recording, true);
  assert.equal(boundStatus.scanId, betaStarted.body.scan.id);
  assert.ok(boundStatus.workspaceId);
  assert.ok(boundStatus.patientId);
  assert.ok(boundStatus.deviceId);
  assert.ok(boundStatus.sessionId);
  for (const privateField of [
    "esp",
    "wsEsp",
    "udpEsp",
    "listeners",
    "udpPort",
    "httpPort",
  ]) {
    assert.equal(
      Object.hasOwn(boundStatus, privateField),
      false,
      `authenticated listeners must not receive infrastructure field ${privateField}`,
    );
  }
  const boundMetadata = await listener.nextJson();
  assert.equal(boundMetadata.type, "audio.session");
  assert.equal(boundMetadata.scanId, boundStatus.scanId);
  const boundMetrics = await listener.nextJson();
  assert.equal(boundMetrics.type, "metrics");
  assert.equal(boundMetrics.scanId, boundStatus.scanId);
  assert.equal(boundMetrics.sessionId, boundStatus.sessionId);

  for (const [client, command] of [
    [alpha, alphaCommand],
    [beta, betaCommand],
  ]) {
    client.socket.send(
      encodeAudioFrameV2({
        sessionId: command.payload.sessionId,
        scanId: command.payload.scanId,
        sequence: 0,
        timestampMs: Date.now(),
        sampleCount: 128,
        flags: ["start"],
        payload: pcmPacket(),
      }),
    );
  }
  let nextListenerMessage = await listener.nextMessage();
  while (!nextListenerMessage.binary) {
    const textMessage = JSON.parse(nextListenerMessage.value);
    assert.ok(["status", "metrics"].includes(textMessage.type));
    if (textMessage.recording) {
      assert.equal(textMessage.scanId, boundStatus.scanId);
      assert.equal(textMessage.sessionId, boundStatus.sessionId);
    }
    nextListenerMessage = await listener.nextMessage();
  }
  const boundFrame = decodeAudioFrameV2(nextListenerMessage.value);
  assert.equal(boundFrame.scanId, boundStatus.scanId);
  assert.equal(boundFrame.sessionId, boundStatus.sessionId);
  assert.equal(boundFrame.sequence, 0);
  assert.ok(boundFrame.flags.includes("start"));
  let receivedSecondSource = false;
  const noMixDeadline = Date.now() + 150;
  while (Date.now() < noMixDeadline) {
    try {
      const remainingMs = Math.max(1, noMixDeadline - Date.now());
      const followUp = await listener.nextMessage(remainingMs);
      if (followUp.binary) {
        receivedSecondSource = true;
        break;
      }
      const textMessage = JSON.parse(followUp.value);
      assert.ok(["status", "metrics"].includes(textMessage.type));
      if (textMessage.recording) assert.equal(textMessage.scanId, boundStatus.scanId);
    } catch (error) {
      assert.match(error.message, /timed out waiting for WebSocket message/);
      break;
    }
  }
  assert.equal(receivedSecondSource, false, "one listener must never receive PCM from two concurrent devices");
  await delay(50);

  for (const scanId of [alphaStarted.body.scan.id, betaStarted.body.scan.id]) {
    const stopped = await requestJson(`/api/v1/scans/${encodeURIComponent(scanId)}/stop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": `audio-stop-concurrent-${scanId}`,
      },
    });
    assert.equal(stopped.response.status, 200, JSON.stringify(stopped.body));
    assert.equal(stopped.body.scan.status, "completed");
  }

  alpha.socket.close();
  beta.socket.close();
  listener.socket.close();
});

test("a failed start ACK interrupts only its matching scan and releases the device registry", async () => {
  const peer = openSocket("/esp");
  await peer.opened;
  await authenticateDevice(peer, "dev_alpha_peer", secrets.peer);
  const token = await loginPlatformAdmin();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const failedStart = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "audio-start-device-rejected" },
    body: JSON.stringify({ patientId: "pat_alpha", deviceId: "dev_alpha_peer", mode: "heart" }),
  });
  assert.equal(failedStart.response.status, 201, JSON.stringify(failedStart.body));
  const failedCommand = await peer.nextJson();
  assert.equal(failedCommand.type, "audio.session.start");
  sendDeviceCommandStatus(peer, failedCommand, "failed", "SENSOR_NOT_READY", "sensor was not ready");
  await waitForCommandState(token, "dev_alpha_peer", failedCommand.id, "failed");
  const interrupted = await waitForScanState(token, failedStart.body.scan.id, "interrupted");
  assert.match(interrupted.aiSummary, /device reported failed/i);

  const replacement = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "audio-start-after-device-rejected" },
    body: JSON.stringify({ patientId: "pat_alpha", deviceId: "dev_alpha_peer", mode: "heart" }),
  });
  assert.equal(replacement.response.status, 201, JSON.stringify(replacement.body));
  assert.notEqual(replacement.body.scan.id, failedStart.body.scan.id);
  const replacementCommand = await peer.nextJson();
  sendDeviceCommandStatus(peer, replacementCommand, "failed", "TEST_CLEANUP", "test cleanup");
  await waitForScanState(token, replacement.body.scan.id, "interrupted");
  peer.socket.close();
});

test("an authenticated audio.failed event terminalizes only its bound active scan", async () => {
  const peer = openSocket("/esp");
  await peer.opened;
  await authenticateDevice(peer, "dev_alpha_peer", secrets.peer);
  const token = await loginPlatformAdmin();
  const started = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "audio-runtime-failure-terminalizes-scan",
    },
    body: JSON.stringify({ patientId: "pat_alpha", deviceId: "dev_alpha_peer", mode: "heart" }),
  });
  assert.equal(started.response.status, 201, JSON.stringify(started.body));
  const command = await peer.nextJson();
  await confirmDeviceCommandApplied(peer, command);
  await waitForCommandState(token, "dev_alpha_peer", command.id, "applied");
  peer.socket.send(encodeAudioFrameV2({
    sessionId: command.payload.sessionId,
    scanId: command.payload.scanId,
    sequence: 0,
    timestampMs: Date.now(),
    sampleCount: 128,
    flags: ["start"],
    payload: pcmPacket(),
  }));
  await waitForScanState(token, started.body.scan.id, "recording");

  peer.socket.send(JSON.stringify({
    protocolVersion: 1,
    type: "audio.failed",
    deviceId: "dev_alpha_peer",
    scanId: started.body.scan.id,
    sessionId: command.payload.sessionId,
    audioStatus: "failed",
    code: "I2S_CAPTURE_FAILED",
    detail: "i2s capture interrupted; session was closed",
  }));

  const interrupted = await waitForScanState(token, started.body.scan.id, "interrupted");
  assert.equal(interrupted.processingStatus, "interrupted");
  assert.match(interrupted.aiSummary, /I2S_CAPTURE_FAILED|i2s capture interrupted/i);
  peer.socket.close();
});

test("a stop applied ACK remains nonterminal until scan finalization is durable", async () => {
  fs.rmSync(scanStopFinalizeReadyPath, { force: true });
  fs.rmSync(scanStopFinalizeReleasePath, { force: true });
  const peer = openSocket("/esp");
  await peer.opened;
  await authenticateDevice(peer, "dev_alpha_peer", secrets.peer);
  const token = await loginPlatformAdmin();
  const started = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "audio-stop-finalize-before-ack-start",
    },
    body: JSON.stringify({ patientId: "pat_alpha", deviceId: "dev_alpha_peer", mode: "heart" }),
  });
  assert.equal(started.response.status, 201, JSON.stringify(started.body));
  const startCommand = await peer.nextJson();
  await confirmDeviceCommandApplied(peer, startCommand);
  await waitForCommandState(token, "dev_alpha_peer", startCommand.id, "applied");
  peer.socket.send(encodeAudioFrameV2({
    sessionId: startCommand.payload.sessionId,
    scanId: startCommand.payload.scanId,
    sequence: 0,
    timestampMs: Date.now(),
    sampleCount: 128,
    flags: ["start"],
    payload: pcmPacket(),
  }));
  await waitForScanState(token, started.body.scan.id, "recording");

  const stopRequest = requestJson(`/api/v1/scans/${encodeURIComponent(started.body.scan.id)}/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "audio-stop-finalize-before-ack-stop",
    },
  });
  const stopCommand = await peer.nextJson();
  assert.equal(stopCommand.type, "audio.session.stop");
  sendDeviceCommandStatus(peer, stopCommand, "acknowledged", "COMMAND_ACKNOWLEDGED");
  sendDeviceCommandStatus(peer, stopCommand, "applying", "COMMAND_APPLYING");
  sendDeviceCommandStatus(peer, stopCommand, "applied", "OK", "device stopped capture");
  try {
    await waitForFile(scanStopFinalizeReadyPath);
    await delay(50);
    const beforeRelease = await requestJson(
      `/api/v1/devices/dev_alpha_peer/commands/${encodeURIComponent(stopCommand.id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(beforeRelease.response.status, 200, JSON.stringify(beforeRelease.body));
    assert.notEqual(
      beforeRelease.body.command.state,
      "applied",
      "the stop command must not become terminal before durable scan finalization",
    );
  } finally {
    fs.writeFileSync(scanStopFinalizeReleasePath, "release", "utf8");
  }

  const stopped = await stopRequest;
  assert.equal(stopped.response.status, 200, JSON.stringify(stopped.body));
  assert.equal(stopped.body.scan.status, "completed");
  await waitForCommandState(token, "dev_alpha_peer", stopCommand.id, "applied");
  const durableScan = await requestJson(`/api/v1/scans/${encodeURIComponent(started.body.scan.id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(durableScan.body.scan.status, "completed");
  peer.socket.close();
});

test("authenticated device disconnect interrupts its scan and reconnect can start a new session", async () => {
  const beta = openSocket("/esp");
  await beta.opened;
  await authenticateDevice(beta, "dev_beta", secrets.beta);
  const token = await loginPlatformAdmin();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const started = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "audio-disconnect-active" },
    body: JSON.stringify({ patientId: "pat_beta", deviceId: "dev_beta", mode: "heart" }),
  });
  assert.equal(started.response.status, 201, JSON.stringify(started.body));
  const command = await beta.nextJson();
  await confirmDeviceCommandApplied(beta, command);
  await waitForCommandState(token, "dev_beta", command.id, "applied");
  await waitForScanState(token, started.body.scan.id, "recording");
  beta.socket.close();
  await beta.closed();
  const interrupted = await waitForScanState(token, started.body.scan.id, "interrupted");
  assert.match(interrupted.aiSummary, /kết nối bảo mật/i);

  const reconnected = openSocket("/esp");
  await reconnected.opened;
  await authenticateDevice(reconnected, "dev_beta", secrets.beta);
  const replacement = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "audio-after-disconnect" },
    body: JSON.stringify({ patientId: "pat_beta", deviceId: "dev_beta", mode: "heart" }),
  });
  assert.equal(replacement.response.status, 201, JSON.stringify(replacement.body));
  const replacementCommand = await reconnected.nextJson();
  sendDeviceCommandStatus(reconnected, replacementCommand, "failed", "TEST_CLEANUP", "test cleanup");
  await waitForScanState(token, replacement.body.scan.id, "interrupted");
  reconnected.socket.close();
});

test("revoking a device immediately closes its authenticated socket", async () => {
  const esp = openSocket("/esp");
  await esp.opened;
  await authenticateDevice(esp, "dev_alpha", secrets.alpha);

  const token = await loginPlatformAdmin();
  const recording = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "revoke-active-audio-scan",
    },
    body: JSON.stringify({ patientId: "pat_alpha", deviceId: "dev_alpha", mode: "heart" }),
  });
  assert.equal(recording.response.status, 201, JSON.stringify(recording.body));
  esp.socket.send(pcmPacket());
  await delay(50);

  const revoked = await requestJson("/api/v1/devices/dev_alpha/revoke", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": "revoke-dev-alpha-once",
    },
  });
  assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));
  assert.equal(revoked.body.device.secretHash, undefined, "credential-equivalent verification material must stay private");
  const closed = await esp.closed();
  assert.equal(closed.code, 1008);
  assert.equal(closed.reason, "REVOKED");
  const interrupted = await requestJson(`/api/v1/scans/${encodeURIComponent(recording.body.scan.id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(interrupted.response.status, 200, JSON.stringify(interrupted.body));
  assert.equal(interrupted.body.scan.status, "interrupted");
  assert.equal(interrupted.body.scan.processingStatus, "interrupted");

  const badProof = openSocket("/esp");
  await badProof.opened;
  const badChallenge = await badProof.nextJson();
  badProof.socket.send(
    JSON.stringify({
      type: "auth.response",
      protocolVersion: 1,
      deviceId: "dev_alpha",
      challengeId: badChallenge.challengeId,
      proof: Buffer.alloc(32).toString("base64url"),
      telemetry: {},
    }),
  );
  assert.deepEqual(await badProof.nextJson(), { type: "auth.rejected", code: "INVALID_CREDENTIALS" });
  assert.equal((await badProof.closed()).code, 1008);

  const revokedLogin = openSocket("/esp");
  await revokedLogin.opened;
  const revokedChallenge = await revokedLogin.nextJson();
  revokedLogin.socket.send(
    JSON.stringify({
      type: "auth.response",
      protocolVersion: 1,
      deviceId: "dev_alpha",
      challengeId: revokedChallenge.challengeId,
      proof: createDeviceProof(revokedChallenge, "dev_alpha", secrets.alpha),
      telemetry: {},
    }),
  );
  assert.deepEqual(await revokedLogin.nextJson(), { type: "auth.rejected", code: "REVOKED" });
  assert.equal((await revokedLogin.closed()).code, 1008);
});

test("recording binds protocol v2 identity, rejects replay, and ignores unbound audio sources", async () => {
  const token = await loginPlatformAdmin();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const crossWorkspace = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "audio-cross-workspace-denied" },
    body: JSON.stringify({ patientId: "pat_alpha", deviceId: "dev_beta", mode: "heart" }),
  });
  assert.equal(crossWorkspace.response.status, 403, "scan device and patient must belong to the same workspace");

  const beta = openSocket("/esp");
  const peer = openSocket("/esp");
  await Promise.all([beta.opened, peer.opened]);
  await authenticateDevice(beta, "dev_beta", secrets.beta);
  await authenticateDevice(peer, "dev_alpha_peer", secrets.peer);

  const started = await requestJson("/api/v1/scans/start", {
    method: "POST",
    headers: { ...headers, "Idempotency-Key": "audio-v2-binding-active" },
    body: JSON.stringify({ patientId: "pat_beta", deviceId: "dev_beta", mode: "heart" }),
  });
  assert.equal(started.response.status, 201, JSON.stringify(started.body));

  const alphaDoctorToken = await login("doctor@alpha.test");
  const queryTokenListener = openSocket(`/app?token=${encodeURIComponent(alphaDoctorToken)}`);
  await queryTokenListener.opened;
  assert.equal((await queryTokenListener.closed()).code, 1008, "WebSocket bearer tokens in URLs must be rejected");
  const forbiddenSelector = openSocket("/app", [
    "shcare.realtime.v1",
    `shcare.bearer.${alphaDoctorToken}`,
    `shcare.scan.${Buffer.from(started.body.scan.id, "utf8").toString("base64url")}`,
  ]);
  await forbiddenSelector.opened;
  assert.equal(
    (await forbiddenSelector.closed()).code,
    1008,
    "a listener must not select an active scan outside its workspace",
  );
  const unauthorizedListener = openSocket("/app", [
    "shcare.realtime.v1",
    `shcare.bearer.${alphaDoctorToken}`,
  ]);
  await unauthorizedListener.opened;
  assert.equal((await unauthorizedListener.nextJson()).type, "status");
  unauthorizedListener.socket.send(JSON.stringify({ type: "stop_scan" }));
  let deniedStop = await unauthorizedListener.nextJson();
  while (deniedStop.type === "status" || deniedStop.type === "metrics") {
    deniedStop = await unauthorizedListener.nextJson();
  }
  assert.equal(deniedStop.type, "error", "cross-workspace listener must not stop or receive another workspace scan");

  const authorizedListener = openSocket("/app", [
    "shcare.realtime.v1",
    `shcare.bearer.${token}`,
  ]);
  await authorizedListener.opened;
  assert.equal(authorizedListener.socket.protocol, "shcare.realtime.v1");
  const pendingStatus = await authorizedListener.nextJson();
  assert.equal(pendingStatus.type, "status");
  assert.equal(pendingStatus.recording, false, "transport delivery must not claim an active recording");
  assert.equal(pendingStatus.workspaceId, null);
  assert.equal(pendingStatus.deviceId, null);
  assert.equal(pendingStatus.scanId, null);
  assert.equal(pendingStatus.sessionId, null);

  const sessionCommand = await beta.nextJson();
  assert.equal(sessionCommand.type, "audio.session.start");
  assert.equal(sessionCommand.payload.protocolVersion, 2);
  assert.equal(sessionCommand.payload.frameEncoding, "shcare_audio_v2");
  assert.equal(sessionCommand.payload.scanId, started.body.scan.id);
  assert.equal(sessionCommand.payload.workspaceId, "org_beta");
  assert.equal(sessionCommand.payload.patientId, "pat_beta");

  peer.socket.send(pcmPacket());
  await sendUdpPacket(pcmPacket());
  const audioFrame = encodeAudioFrameV2({
    sessionId: sessionCommand.payload.sessionId,
    scanId: sessionCommand.payload.scanId,
    sequence: 0,
    timestampMs: Date.now(),
    sampleCount: 128,
    flags: ["start"],
    payload: pcmPacket(),
  });
  beta.socket.send(audioFrame);
  const firstAudioOutcome = await Promise.race([
    authorizedListener.nextJson().then((message) => ({ kind: "message", message })),
    beta.closed().then((event) => ({ kind: "close", event })),
  ]);
  assert.equal(
    firstAudioOutcome.kind,
    "message",
    `device closed before metadata: ${firstAudioOutcome.event?.reason || "unknown"}`,
  );
  let sessionMetadata = firstAudioOutcome.message;
  while (sessionMetadata.type === "metrics" || sessionMetadata.type === "status") {
    sessionMetadata = await authorizedListener.nextJson();
  }
  assert.equal(sessionMetadata.type, "audio.session");
  assert.equal(sessionMetadata.protocolVersion, 2);
  assert.equal(sessionMetadata.frameEncoding, "shcare_audio_v2");
  assert.equal(sessionMetadata.workspaceId, "org_beta");
  assert.equal(sessionMetadata.patientId, "pat_beta");
  assert.equal(sessionMetadata.deviceId, "dev_beta");
  assert.equal(sessionMetadata.scanId, started.body.scan.id);
  assert.equal(sessionMetadata.sessionId, sessionCommand.payload.sessionId);
  const listenerFrame = decodeAudioFrameV2(await authorizedListener.nextBinary());
  assert.equal(listenerFrame.sessionId, sessionCommand.payload.sessionId);
  assert.equal(listenerFrame.scanId, started.body.scan.id);
  assert.equal(listenerFrame.sequence, 0);
  assert.ok(listenerFrame.flags.includes("start"));
  assert.deepEqual(listenerFrame.payload, pcmPacket());

  beta.socket.send(audioFrame);
  assert.equal((await beta.closed()).reason, "AUDIO_V2_SEQUENCE_REJECTED");
  await delay(150);

  const interrupted = await requestJson(`/api/v1/scans/${encodeURIComponent(started.body.scan.id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(interrupted.response.status, 200, JSON.stringify(interrupted.body));
  assert.equal(interrupted.body.scan.status, "interrupted", "a rejected/replayed source must release its scan");
  assert.equal(interrupted.body.scan.deviceId, "dev_beta");
  assert.equal(interrupted.body.scan.organizationId, "org_beta");
  assert.equal(interrupted.body.scan.patientId, "pat_beta");
  assert.equal(interrupted.body.scan.sampleCount, 128, "only audio from the scan-bound authenticated device may persist");

  beta.socket.close();
  peer.socket.close();
  unauthorizedListener.socket.close();
  authorizedListener.socket.close();
});
