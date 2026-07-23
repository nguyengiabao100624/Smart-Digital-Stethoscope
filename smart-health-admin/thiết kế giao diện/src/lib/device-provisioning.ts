export type ShcareDeviceSetupQrPayload = {
  type: "shcare.device.setup";
  protocolVersion: 1;
  deviceId: string;
  claimCode: string;
  claimExpiresAt: string;
  setupAp: {
    ssid: string;
    security: "WPA2_PSK";
    proofOfPossession: string;
  };
};

export type DeviceProvisionArtifact = {
  deviceId: string;
  claimCode: string;
  expiresAt: string;
  qrPayload: ShcareDeviceSetupQrPayload;
};

export type DeviceProvisionResponseLike = {
  device?: { id?: unknown };
  claim?: {
    deviceId?: unknown;
    claimCode?: unknown;
    expiresAt?: unknown;
    qrPayload?: unknown;
  };
};

export type DeviceProvisionArtifactStatus = "active" | "expiring" | "expired";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/;
const CLAIM_CODE_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;
const SETUP_SSID_PATTERN = /^Shcare-[A-F0-9]{12}$/;
const SETUP_PROOF_PATTERN = /^[A-Za-z0-9_-]{20}$/;

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Phản hồi provision thiếu ${label}.`);
  }
  return value;
}

export function parseProvisionArtifact(
  response: DeviceProvisionResponseLike,
): DeviceProvisionArtifact {
  const device = recordOf(response.device);
  const claim = recordOf(response.claim);
  const qr = recordOf(claim.qrPayload);
  const setupAp = recordOf(qr.setupAp);

  const deviceId = requiredString(claim.deviceId, "Device ID");
  const responseDeviceId = requiredString(device.id, "Device ID canonical");
  const qrDeviceId = requiredString(qr.deviceId, "Device ID trong QR");
  const claimCode = requiredString(claim.claimCode, "claim code");
  const qrClaimCode = requiredString(qr.claimCode, "claim code trong QR");
  const expiresAt = requiredString(claim.expiresAt, "thời hạn claim");
  const qrExpiresAt = requiredString(qr.claimExpiresAt, "thời hạn trong QR");
  const ssid = typeof setupAp.ssid === "string" ? setupAp.ssid : "";
  const security = typeof setupAp.security === "string" ? setupAp.security : "";
  const proofOfPossession =
    typeof setupAp.proofOfPossession === "string" ? setupAp.proofOfPossession : "";

  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new Error("Device ID trong phản hồi provision không hợp lệ.");
  }
  if (responseDeviceId !== deviceId || qrDeviceId !== deviceId) {
    throw new Error("Device ID giữa bản ghi, claim và QR không khớp.");
  }
  if (!CLAIM_CODE_PATTERN.test(claimCode) || qrClaimCode !== claimCode) {
    throw new Error("Claim code giữa phản hồi và QR không khớp.");
  }
  if (
    typeof qr.type !== "string" ||
    qr.type !== "shcare.device.setup" ||
    qr.protocolVersion !== 1
  ) {
    throw new Error("QR setup không dùng contract Shcare v1.");
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAt !== qrExpiresAt) {
    throw new Error("Thời hạn claim giữa phản hồi và QR không khớp.");
  }
  if (
    security !== "WPA2_PSK" ||
    !SETUP_SSID_PATTERN.test(ssid) ||
    !SETUP_PROOF_PATTERN.test(proofOfPossession)
  ) {
    throw new Error("QR setup phải có SSID Shcare, WPA2 và proof-of-possession hợp lệ.");
  }

  return {
    deviceId,
    claimCode,
    expiresAt,
    qrPayload: {
      type: "shcare.device.setup",
      protocolVersion: 1,
      deviceId,
      claimCode,
      claimExpiresAt: qrExpiresAt,
      setupAp: {
        ssid,
        security: "WPA2_PSK",
        proofOfPossession,
      },
    },
  };
}

export function serializeProvisionQrPayload(artifact: DeviceProvisionArtifact): string {
  return JSON.stringify(artifact.qrPayload);
}

export function createProvisionArtifactFilename(artifact: DeviceProvisionArtifact): string {
  return `shcare-${artifact.deviceId}-setup.svg`;
}

export function getProvisionArtifactStatus(
  artifact: DeviceProvisionArtifact,
  now = Date.now(),
): DeviceProvisionArtifactStatus {
  const expiresAt = Date.parse(artifact.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return "expired";
  return expiresAt - now <= 10 * 60 * 1000 ? "expiring" : "active";
}
