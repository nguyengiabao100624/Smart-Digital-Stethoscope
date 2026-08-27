import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const backendBaseUrl = String(
  process.env.SHCARE_HIL_BACKEND_URL || "http://127.0.0.1:3765",
).replace(/\/+$/, "");
const deviceId = String(process.env.SHCARE_HIL_DEVICE_ID || "").trim();
const artifactPath = path.resolve(String(process.env.SHCARE_HIL_OTA_FIRMWARE_PATH || "").trim());
const firmwareVersion = String(process.env.SHCARE_HIL_OTA_FIRMWARE_VERSION || "").trim();
const timeoutMs = Number(process.env.SHCARE_HIL_OTA_TIMEOUT_MS || 300_000);
const authProfile = String(process.env.SHCARE_HIL_AUTH_PROFILE || "integrated-demo").trim();
const expectRollback = String(process.env.SHCARE_HIL_OTA_EXPECT_ROLLBACK || "").trim() === "true";
const expectedStableVersion = String(process.env.SHCARE_HIL_OTA_STABLE_FIRMWARE_VERSION || "").trim();

const authProfiles = {
  standalone: {
    login: "platform.hil@shcare.local",
    password: "12345678",
  },
  "integrated-demo": {
    login: "admin.demo@shcare.local",
    password: "Shcare-Demo-2026!",
  },
};
const credentials = authProfiles[authProfile];

if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(deviceId)) {
  throw new Error("SHCARE_HIL_DEVICE_ID must be a canonical device id");
}
if (!artifactPath || !fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
  throw new Error("SHCARE_HIL_OTA_FIRMWARE_PATH must identify a built firmware artifact");
}
if (!/^\d+\.\d+\.\d+$/.test(firmwareVersion)) {
  throw new Error("SHCARE_HIL_OTA_FIRMWARE_VERSION must use the production OTA major.minor.patch format");
}
if (!Number.isFinite(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 600_000) {
  throw new Error("SHCARE_HIL_OTA_TIMEOUT_MS must be between 30000 and 600000");
}
if (expectRollback && !/^\d+\.\d+\.\d+$/.test(expectedStableVersion)) {
  throw new Error("SHCARE_HIL_OTA_STABLE_FIRMWARE_VERSION must identify the known-good image for rollback proof");
}
if (!credentials) {
  throw new Error("SHCARE_HIL_AUTH_PROFILE must be standalone or integrated-demo");
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${backendBaseUrl}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof body?.code === "string" ? ` ${body.code}` : "";
    throw new Error(`${options.method || "GET"} ${pathname} returned HTTP ${response.status}${code}`);
  }
  return { response, body };
}

async function poll(label, operation, predicate) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    lastValue = await operation();
    if (predicate(lastValue)) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`${label} timed out`);
}

const login = await requestJson("/api/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: credentials.login, password: credentials.password }),
});
const token = String(login.body.token || "");
if (!token) throw new Error("HIL admin login returned no bearer token");
const authorization = { Authorization: `Bearer ${token}` };

const readDevice = async () => (await requestJson(
  `/api/v1/devices/${encodeURIComponent(deviceId)}`,
  { headers: authorization },
)).body.device;
const currentDevice = await poll(
  "authenticated device online before OTA",
  readDevice,
  (device) => device?.online === true &&
    String(device?.telemetry?.connectionMethod || device?.connectionMethod || "").toLowerCase() === "wss",
);
if (String(currentDevice?.firmwareVersion || "") === firmwareVersion) {
  throw new Error("OTA artifact version must be newer than the firmware presently running on the device");
}
if (expectRollback && String(currentDevice?.firmwareVersion || "") !== expectedStableVersion) {
  throw new Error("forced rollback proof must start from the specified known-good firmware version");
}

const artifact = fs.readFileSync(artifactPath);
if (!artifact.length || artifact.length > 32 * 1024 * 1024) {
  throw new Error("OTA artifact must be between 1 byte and 32 MiB");
}
const checksum = crypto.createHash("sha256").update(artifact).digest("hex");
const filename = `shcare-${firmwareVersion}.bin`;
const upload = await requestJson(
  `/api/v1/admin/storage-files?bucket=device-firmware&filename=${encodeURIComponent(filename)}&firmwareVersion=${encodeURIComponent(firmwareVersion)}`,
  {
    method: "POST",
    headers: {
      ...authorization,
      "Content-Type": "application/octet-stream",
      "Idempotency-Key": `hil-ota-upload-${firmwareVersion}-${checksum.slice(0, 16)}`,
    },
    body: artifact,
  },
);
const firmwareFileId = String(upload.body?.file?.id || "");
if (!firmwareFileId) throw new Error("firmware upload returned no file id");

const requested = await requestJson(`/api/v1/devices/${encodeURIComponent(deviceId)}/ota`, {
  method: "POST",
  headers: {
    ...authorization,
    "Content-Type": "application/json",
    "Idempotency-Key": `hil-ota-request-${firmwareVersion}-${checksum.slice(0, 16)}-${Date.now()}`,
  },
  body: JSON.stringify({
    firmwareFileId,
    hardwareTarget: "MSM261S4030H0",
    partitionTarget: "app",
    minimumProtocolVersion: 1,
  }),
});
const commandId = String(requested.body?.command?.id || "");
const otaId = String(requested.body?.ota?.id || "");
if (!commandId || !otaId) throw new Error("OTA request returned no durable command receipt");

const expectedDevice = await poll(
  expectRollback ? "forced OTA rollback to the known-good image" : "physical OTA boot-health confirmation",
  readDevice,
  (device) => device?.online === true &&
    String(device?.firmwareVersion || "") === (expectRollback ? expectedStableVersion : firmwareVersion) &&
    String(device?.ota?.status || "") === (expectRollback ? "rolled_back" : "confirmed") &&
    (!expectRollback || String(device?.telemetry?.otaBootOutcome || "") === "rolled_back") &&
    String(device?.telemetry?.connectionMethod || device?.connectionMethod || "").toLowerCase() === "wss",
);
const terminalCommand = await poll(
  expectRollback ? "rollback command receipt" : "OTA command applied after authenticated reboot",
  async () => (await requestJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(commandId)}`,
    { headers: authorization },
  )).body.command,
  (command) => expectRollback
    ? command?.state === "failed" && command?.code === "OTA_ROLLED_BACK"
    : command?.state === "applied" && command?.code === "OTA_BOOT_HEALTH_CONFIRMED",
);

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  deviceId,
  targetFirmwareVersion: firmwareVersion,
  expectedOutcome: expectRollback ? "rolled_back" : "confirmed",
  artifact: {
    byteSize: artifact.length,
    sha256: checksum,
  },
  upload: { firmwareFileId },
  ota: {
    id: otaId,
    status: expectedDevice.ota?.status || "",
  },
  command: {
    id: commandId,
    state: terminalCommand.state,
    code: terminalCommand.code,
  },
})}\n`);
