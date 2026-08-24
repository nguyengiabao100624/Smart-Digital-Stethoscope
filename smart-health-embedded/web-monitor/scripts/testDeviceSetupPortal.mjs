import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const runtimeDir = path.resolve(
  process.env.SHCARE_HIL_RUNTIME_DIR || path.join(os.tmpdir(), "shcare-g3-hil-runtime"),
);
const interfaceName = String(process.env.SHCARE_HIL_WIFI_INTERFACE || "Wi-Fi").trim();
const expectedDeviceId = String(process.env.SHCARE_HIL_DEVICE_ID || "").trim();
const accessPath = path.join(runtimeDir, "setup-access.json");
const temporaryProfilePath = path.join(runtimeDir, "setup-portal-wlan.xml");

function fail(message) {
  throw new Error(message);
}

function netsh(args, { allowFailure = false, capture = true } = {}) {
  const result = spawnSync("netsh", args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "ignore",
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    fail(`netsh ${args.slice(0, 3).join(" ")} failed with exit ${result.status}`);
  }
  return result;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function readConnectedProfile() {
  const result = netsh(["wlan", "show", "interfaces"], { allowFailure: true });
  if (result.status !== 0) return "";
  return /^\s*Profile\s*:\s*(.+?)\s*$/mi.exec(result.stdout)?.[1]?.trim() || "";
}

function readConnectedSsid() {
  const result = netsh(["wlan", "show", "interfaces"], { allowFailure: true });
  if (result.status !== 0) return "";
  return /^\s*SSID\s*:\s*(.+?)\s*$/mi.exec(result.stdout)?.[1]?.trim() || "";
}

async function waitForSsid(expectedSsid, timeoutMillis = 25_000) {
  const deadline = Date.now() + timeoutMillis;
  while (Date.now() < deadline) {
    if (readConnectedSsid() === expectedSsid) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail("Timed out while waiting for the requested Wi-Fi profile");
}

function writeTemporaryProfile(ssid, password) {
  const xml = `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${escapeXml(ssid)}</name>
  <SSIDConfig><SSID><name>${escapeXml(ssid)}</name></SSID><nonBroadcast>false</nonBroadcast></SSIDConfig>
  <connectionType>ESS</connectionType><connectionMode>manual</connectionMode>
  <MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
  <sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${escapeXml(password)}</keyMaterial></sharedKey></security></MSM>
</WLANProfile>`;
  fs.writeFileSync(temporaryProfilePath, xml, { encoding: "utf8", mode: 0o600 });
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(7_000),
    headers: { "cache-control": "no-store", ...(options.headers || {}) },
  });
  return { response, text: await response.text() };
}

if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(expectedDeviceId)) {
  fail("SHCARE_HIL_DEVICE_ID must be a canonical device id");
}
if (!fs.existsSync(accessPath) || !fs.statSync(accessPath).isFile()) {
  fail("HIL setup access material is missing");
}
const access = JSON.parse(fs.readFileSync(accessPath, "utf8"));
if (!/^Shcare-[A-F0-9]{12}$/.test(access.ssid) || !/^[A-Za-z0-9_-]{20}$/.test(access.password)) {
  fail("HIL setup AP material is invalid");
}

const originalProfile = readConnectedProfile();
if (!originalProfile) fail("No connected Wi-Fi profile is available for automatic restore");
const originalSsid = readConnectedSsid();
if (!originalSsid) fail("No connected Wi-Fi SSID is available for automatic restore");
const setupProfileAlreadyExisted =
  netsh(["wlan", "show", "profile", `name=${access.ssid}`, `interface=${interfaceName}`], {
    allowFailure: true,
  }).status === 0;

let setupProfileAdded = false;
let restored = false;
let proof = null;
try {
  if (!setupProfileAlreadyExisted) {
    writeTemporaryProfile(access.ssid, access.password);
    netsh(
      ["wlan", "add", "profile", `filename=${temporaryProfilePath}`, `interface=${interfaceName}`, "user=current"],
      { capture: false },
    );
    setupProfileAdded = true;
  }
  netsh(["wlan", "connect", `name=${access.ssid}`, `ssid=${access.ssid}`, `interface=${interfaceName}`], {
    capture: false,
  });
  await waitForSsid(access.ssid);

  const root = await request("http://192.168.4.1/");
  if (
    root.response.status !== 200 ||
    !root.text.includes("<title>Shcare - Kết nối Wi-Fi</title>") ||
    !root.text.includes('action="/save"')
  ) {
    fail("The captive portal HTML contract is invalid");
  }

  const sessionResult = await request("http://192.168.4.1/api/v1/setup/session");
  if (sessionResult.response.status !== 200) fail("The setup session endpoint is unavailable");
  const session = JSON.parse(sessionResult.text);
  if (
    session.protocolVersion !== 1 ||
    session.deviceId !== expectedDeviceId ||
    !/^[A-F0-9]{64}$/.test(session.csrfToken) ||
    !Number.isInteger(session.expiresInSeconds) ||
    session.expiresInSeconds < 1 ||
    session.expiresInSeconds > 900
  ) {
    fail("The setup session response is not bound to the expected device");
  }

  const rejected = await request("http://192.168.4.1/api/v1/setup/wifi", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      protocolVersion: 1,
      deviceId: expectedDeviceId,
      csrfToken: "0".repeat(64),
      ssid: "HIL-invalid-request",
      password: "invalid-only",
    }),
  });
  const rejectedBody = JSON.parse(rejected.text);
  if (rejected.response.status !== 403 || rejectedBody.code !== "SETUP_SESSION_INVALID") {
    fail("The setup endpoint did not reject an invalid session");
  }

  proof = {
    status: "PASS",
    html: true,
    sessionBound: true,
    invalidSessionRejected: true,
  };
} finally {
  if (setupProfileAdded) {
    netsh(["wlan", "delete", "profile", `name=${access.ssid}`, `interface=${interfaceName}`], {
      allowFailure: true,
      capture: false,
    });
  }
  netsh(
    [
      "wlan",
      "connect",
      `name=${originalProfile}`,
      `ssid=${originalSsid}`,
      `interface=${interfaceName}`,
    ],
    { allowFailure: true, capture: false },
  );
  try {
    await waitForSsid(originalSsid, 30_000);
    restored = true;
  } catch {
    restored = false;
  }
  fs.rmSync(temporaryProfilePath, { force: true });
  if (!restored) {
    process.stderr.write("Original Wi-Fi profile could not be confirmed after HIL cleanup.\n");
  }
}
if (!restored) fail("Original Wi-Fi profile restore was not confirmed");
process.stdout.write(`${JSON.stringify({ ...proof, wifiRestored: true })}\n`);
