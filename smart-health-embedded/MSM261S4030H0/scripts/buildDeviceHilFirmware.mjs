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
const materialPath = path.join(runtimeDir, "device.material");
const certificatePath = path.join(runtimeDir, "server.crt");
const generatedHeaderPath = path.join(runtimeDir, "hil-config.h");
const setupAccessPath = path.join(runtimeDir, "setup-access.json");
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

function writeGeneratedConfig(deviceMaterial, certificate) {
  const header = [
    "#pragma once",
    `#define SMART_HEALTH_BACKEND_HOST ${cppString(lanIp)}`,
    `#define SMART_HEALTH_BACKEND_PORT ${tlsPort}`,
    "#define SMART_HEALTH_BACKEND_TLS 1",
    `#define SMART_HEALTH_DEVICE_ID ${cppString(deviceId)}`,
    `#define SMART_HEALTH_DEVICE_SECRET ${cppString(deviceMaterial)}`,
    `#define SMART_HEALTH_FIRMWARE_VERSION ${cppString("1.0.1-hil")}`,
    `#define SMART_HEALTH_AUDIO_HOST ${cppString(lanIp)}`,
    "#define SMART_HEALTH_AUDIO_UDP_PORT 3766",
    `#define SMART_HEALTH_BACKEND_CA_CERT ${cppString(`${certificate.trim()}\n`)}`,
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
        PLATFORMIO_BUILD_FLAGS: [
          "-DSMART_HEALTH_PRODUCTION_PROFILE=0",
          "-DSMART_HEALTH_ENABLE_DEVELOPMENT_WS=1",
          "-DSMART_HEALTH_ENABLE_DEVELOPMENT_UDP=1",
          `-include ${generatedHeaderPath.replaceAll("\\", "/")}`,
        ].join(" "),
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
writeGeneratedConfig(deviceMaterial, certificate);
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
  setupAccessPath,
})}\n`);
