import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const runtimeDir = path.resolve(
  process.env.SHCARE_HIL_RUNTIME_DIR || path.join(os.tmpdir(), "shcare-g3-hil-runtime"),
);
const deviceId = String(process.env.SHCARE_HIL_DEVICE_ID || "").trim();
const lanIp = String(process.env.SHCARE_HIL_LAN_IP || "").trim();
const uploadPort = String(process.env.SHCARE_HIL_UPLOAD_PORT || "COM9").trim();
const tlsPort = Number(process.env.SHCARE_HIL_TLS_PORT || 3767);
const shouldUpload = String(process.env.SHCARE_HIL_UPLOAD || "true").toLowerCase() !== "false";
const shouldErase = String(process.env.SHCARE_HIL_ERASE || "false").toLowerCase() === "true";
const firmwareVersion = String(process.env.SHCARE_HIL_FIRMWARE_VERSION || "1.0.1-hil").trim();
const forcedOtaAuthFailure =
  String(process.env.SHCARE_HIL_OTA_FORCED_AUTH_FAILURE || "").toLowerCase() === "true";
const resetOtaState =
  String(process.env.SHCARE_HIL_RESET_OTA_STATE || "").toLowerCase() === "true";
const materialPath = path.join(runtimeDir, "device.material");
const certificatePath = path.resolve(
  process.env.SHCARE_HIL_TLS_CA || path.join(runtimeDir, "server-ca.crt"),
);
const generatedHeaderPath = path.join(runtimeDir, "hil-config.h");
const setupAccessPath = path.join(runtimeDir, "setup-access.json");
const otaPrivateKeyPath = path.join(runtimeDir, "ota-signing-private.pem");
const otaPublicKeyPath = path.join(runtimeDir, "ota-signing-public.pem");
const platformioPath = path.resolve(
  process.env.SHCARE_PLATFORMIO ||
    path.join(os.homedir(), ".platformio", "penv", "Scripts", "platformio.exe"),
);

function validate() {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(deviceId)) {
    throw new Error("SHCARE_HIL_DEVICE_ID must be a canonical device id");
  }
  if (net.isIP(lanIp) !== 4) {
    throw new Error("SHCARE_HIL_LAN_IP must be the current IPv4 LAN address");
  }
  if (!Number.isSafeInteger(tlsPort) || tlsPort < 1024 || tlsPort > 65535) {
    throw new Error("SHCARE_HIL_TLS_PORT must be a bounded TCP port");
  }
  if (shouldErase && !shouldUpload) {
    throw new Error("SHCARE_HIL_ERASE requires SHCARE_HIL_UPLOAD=true");
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(firmwareVersion)) {
    throw new Error("SHCARE_HIL_FIRMWARE_VERSION must be a strict HIL semver");
  }
  if (forcedOtaAuthFailure && shouldUpload) {
    throw new Error(
      "SHCARE_HIL_OTA_FORCED_AUTH_FAILURE may build an OTA artifact only; set SHCARE_HIL_UPLOAD=false",
    );
  }
  if (resetOtaState && !shouldUpload) {
    throw new Error("SHCARE_HIL_RESET_OTA_STATE is only allowed for a wired HIL bootstrap upload");
  }
  for (const [filePath, label] of [
    [materialPath, "HIL device material"],
    [certificatePath, "HIL CA certificate"],
    [platformioPath, "PlatformIO executable"],
  ]) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`${label} is missing`);
    }
  }
}

function cppString(value) {
  return JSON.stringify(String(value));
}

function getOrCreateHilOtaSigningKeyPair() {
  try {
    const privateKey = crypto.createPrivateKey(fs.readFileSync(otaPrivateKeyPath));
    const expectedPublic = crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" });
    const storedPublic = crypto.createPublicKey(fs.readFileSync(otaPublicKeyPath)).export({ type: "spki", format: "pem" });
    if (Buffer.compare(Buffer.from(expectedPublic), Buffer.from(storedPublic)) === 0) {
      return { publicKeyPem: String(storedPublic) };
    }
  } catch {
    // The pair is regenerated below inside the already private temporary HIL
    // directory. No key material is emitted to stdout or source control.
  }
  const keys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" });
  fs.writeFileSync(otaPrivateKeyPath, privateKeyPem, { encoding: "utf8", mode: 0o600 });
  fs.writeFileSync(otaPublicKeyPath, publicKeyPem, { encoding: "utf8", mode: 0o600 });
  return { publicKeyPem };
}

function writeGeneratedConfig(deviceMaterial, certificate, otaPublicKeyPem) {
  // This short-lived timestamp is only emitted into the ignored, local HIL
  // header.  It lets an isolated fixture validate the local TLS certificate
  // before outbound NTP has responded; it never disables CA verification and
  // cannot be included by a production PlatformIO environment.
  const hilClockEpoch = Math.floor(Date.now() / 1000);
  const header = [
    "#pragma once",
    "#define SMART_HEALTH_HIL_RUNTIME_CONFIG 1",
    `#define SMART_HEALTH_HIL_CLOCK_EPOCH ${hilClockEpoch}`,
    `#define SMART_HEALTH_HIL_RESET_OTA_STATE ${resetOtaState ? 1 : 0}`,
    `#define SMART_HEALTH_BACKEND_HOST ${cppString("shcare-hil.local")}`,
    `#define SMART_HEALTH_HIL_BACKEND_CONNECT_IP ${cppString(lanIp)}`,
    `#define SMART_HEALTH_BACKEND_PORT ${tlsPort}`,
    "#define SMART_HEALTH_BACKEND_TLS 1",
    `#define SMART_HEALTH_DEVICE_ID ${cppString(deviceId)}`,
    `#define SMART_HEALTH_DEVICE_SECRET ${cppString(deviceMaterial)}`,
    `#define SMART_HEALTH_FIRMWARE_VERSION ${cppString(firmwareVersion)}`,
    `#define SMART_HEALTH_AUDIO_HOST ${cppString(lanIp)}`,
    "#define SMART_HEALTH_AUDIO_UDP_PORT 3766",
    `#define SMART_HEALTH_BACKEND_CA_CERT ${cppString(`${certificate.trim()}\n`)}`,
    `#define SMART_HEALTH_OTA_PUBLIC_KEY_PEM ${cppString(`${otaPublicKeyPem.trim()}\n`)}`,
    "",
  ].join("\n");
  fs.writeFileSync(generatedHeaderPath, header, { encoding: "utf8", mode: 0o600 });
}

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function writeSetupAccess(deviceMaterial) {
  const secretHash = crypto.createHash("sha256").update(deviceMaterial, "utf8").digest();
  const passwordDigest = crypto
    .createHmac("sha256", secretHash)
    .update(`shcare-device-setup-pop-v1\n${deviceId}`, "utf8")
    .digest();
  const ssidDigest = crypto
    .createHash("sha256")
    .update(`shcare-device-setup-ssid-v1\n${deviceId}`, "utf8")
    .digest();
  fs.writeFileSync(setupAccessPath, JSON.stringify({
    ssid: `Shcare-${ssidDigest.subarray(0, 6).toString("hex").toUpperCase()}`,
    password: base64Url(passwordDigest).slice(0, 20),
    portal: "http://192.168.4.1",
    expiresAfterMinutes: 10,
  }, null, 2), { encoding: "utf8", mode: 0o600 });
}

async function runPlatformio(args, deviceMaterial) {
  await new Promise((resolve, reject) => {
    const child = spawn(platformioPath, args, {
      cwd: projectRoot,
      windowsHide: true,
      env: {
        ...process.env,
        // PlatformIO applies this value through the development-only
        // extra_script. PLATFORMIO_BUILD_FLAGS does not reliably augment a
        // project environment on all PlatformIO Core paths, so do not use it
        // for a security-sensitive HIL configuration.
        SHCARE_HIL_CONFIG_HEADER: generatedHeaderPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const forward = (chunk, target) => {
      target.write(String(chunk).replaceAll(deviceMaterial, "[REDACTED-HIL-MATERIAL]"));
    };
    child.stdout.on("data", (chunk) => forward(chunk, process.stdout));
    child.stderr.on("data", (chunk) => forward(chunk, process.stderr));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PlatformIO exited with code ${code}`));
    });
  });
}

validate();
const deviceMaterial = fs.readFileSync(materialPath, "utf8").trim();
if (deviceMaterial.length < 16 || deviceMaterial.length > 95) {
  throw new Error("HIL device material is outside the firmware bounds");
}
const certificate = fs.readFileSync(certificatePath, "utf8");
const otaSigningKeys = getOrCreateHilOtaSigningKeyPair();
const configuredDeviceMaterial = forcedOtaAuthFailure
  ? crypto.createHash("sha256").update(`shcare-hil-forced-ota-auth-failure\n${deviceMaterial}`, "utf8").digest("base64url")
  : deviceMaterial;
writeGeneratedConfig(configuredDeviceMaterial, certificate, otaSigningKeys.publicKeyPem);
writeSetupAccess(deviceMaterial);
if (shouldErase) {
  await runPlatformio(
    ["run", "-e", "esp32-s3-development", "-t", "erase", "--upload-port", uploadPort],
    deviceMaterial,
  );
}
await runPlatformio(["run", "-e", "esp32-s3-development", "-t", "clean"], deviceMaterial);
const args = ["run", "-e", "esp32-s3-development"];
if (shouldUpload) args.push("-t", "upload", "--upload-port", uploadPort);
await runPlatformio(args, deviceMaterial);
process.stdout.write(`${JSON.stringify({
  status: "PASS",
  environment: "esp32-s3-development",
  uploaded: shouldUpload,
  erased: shouldErase,
  uploadPort: shouldUpload ? uploadPort : null,
  firmwareVersion,
  forcedOtaAuthFailure,
  resetOtaState,
  setupAccessPath,
})}\n`);
