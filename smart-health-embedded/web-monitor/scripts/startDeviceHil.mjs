import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const backendEntry = path.join(backendRoot, "server.js");
const deviceId = String(process.env.SHCARE_HIL_DEVICE_ID || "").trim();
const lanIp = String(process.env.SHCARE_HIL_LAN_IP || "").trim();
const runtimeDir = path.resolve(
  process.env.SHCARE_HIL_RUNTIME_DIR || path.join(os.tmpdir(), "shcare-g3-hil-runtime"),
);
const materialPath = path.join(runtimeDir, "device.material");
const tlsKeyPath = path.resolve(
  process.env.SHCARE_HIL_TLS_KEY || path.join(runtimeDir, "server.key"),
);
const tlsCertificatePath = path.resolve(
  process.env.SHCARE_HIL_TLS_CERT || path.join(runtimeDir, "server.crt"),
);
const tlsCaPath = path.resolve(
  process.env.SHCARE_HIL_TLS_CA || path.join(runtimeDir, "server-ca.crt"),
);
const tlsCaKeyPath = path.join(runtimeDir, "server-ca.key");
const tlsCsrPath = path.join(runtimeDir, "server.csr");
const tlsExtensionsPath = path.join(runtimeDir, "server-ext.cnf");
const tlsSerialPath = path.join(runtimeDir, "server-ca.srl");
const tlsServerHostname = "shcare-hil.local";
const usesDefaultTlsPaths = !process.env.SHCARE_HIL_TLS_KEY &&
  !process.env.SHCARE_HIL_TLS_CERT && !process.env.SHCARE_HIL_TLS_CA;
const tlsTrustCertificatePath = process.env.SHCARE_HIL_TLS_CA
  ? tlsCaPath
  : usesDefaultTlsPaths ? tlsCaPath : tlsCertificatePath;
let deviceSecret = "";
const backendPort = Number(process.env.SHCARE_HIL_BACKEND_PORT || 3765);
const audioPort = Number(process.env.SHCARE_HIL_AUDIO_PORT || 3766);
const tlsPort = Number(process.env.SHCARE_HIL_TLS_PORT || 3767);
const useExternalBackend =
  String(process.env.SHCARE_HIL_EXTERNAL_BACKEND || "").toLowerCase() === "true";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-device-hil-"));
const children = new Set();
let tlsServer = null;
let stopping = false;

function requireBoundedPort(value, label) {
  if (!Number.isSafeInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${label} must be an integer from 1024 through 65535`);
  }
}

function prepareRuntimeMaterial() {
  if (net.isIP(lanIp) !== 4) {
    throw new Error("SHCARE_HIL_LAN_IP must be the current IPv4 LAN address");
  }
  fs.mkdirSync(runtimeDir, { recursive: true });
  if (fs.existsSync(materialPath)) {
    deviceSecret = fs.readFileSync(materialPath, "utf8").trim();
  } else {
    deviceSecret = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(materialPath, deviceSecret, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
  const tlsRequiredPaths = [tlsKeyPath, tlsCertificatePath, tlsTrustCertificatePath];
  const tlsMaterialExists = tlsRequiredPaths.some((filePath) => fs.existsSync(filePath));
  const hasTlsMaterial = tlsRequiredPaths.every((filePath) => fs.existsSync(filePath));
  if (hasTlsMaterial && certificateMatchesCurrentHilLan()) return;
  if (tlsMaterialExists && !usesDefaultTlsPaths) {
    throw new Error(
      "configured HIL TLS certificate is expired or does not cover SHCARE_HIL_LAN_IP; rotate it explicitly",
    );
  }
  if (tlsMaterialExists) {
    // The default files are generated only inside the temporary HIL runtime
    // directory.  Rotate them atomically when a DHCP address changed or the
    // short-lived development certificate is close to expiry.
    for (const filePath of [
      tlsKeyPath,
      tlsCertificatePath,
      tlsCaPath,
      tlsCaKeyPath,
      tlsCsrPath,
      tlsExtensionsPath,
      tlsSerialPath,
    ]) {
      fs.rmSync(filePath, { force: true });
    }
  }
  const opensslCandidates = [
    process.env.SHCARE_HIL_OPENSSL,
    "C:\\Program Files\\Git\\usr\\bin\\openssl.exe",
    "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe",
  ].filter(Boolean);
  const openssl = opensslCandidates.find((candidate) => fs.existsSync(candidate));
  if (!openssl) throw new Error("OpenSSL is required to generate the local HIL certificate");
  const rootGenerated = spawnSync(openssl, [
    "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
    "-keyout", tlsCaKeyPath,
    "-out", tlsCaPath,
    "-days", "14",
    "-subj", "/CN=ShcareHIL Root CA/OU=ShcareHILv3",
    "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  if (rootGenerated.status !== 0) {
    throw new Error("OpenSSL could not generate the local HIL trust anchor");
  }
  const requestGenerated = spawnSync(openssl, [
    "req", "-newkey", "rsa:2048", "-sha256", "-nodes",
    "-keyout", tlsKeyPath,
    "-out", tlsCsrPath,
    "-subj", `/CN=${tlsServerHostname}/OU=ShcareHILv3`,
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  if (requestGenerated.status !== 0) {
    throw new Error("OpenSSL could not generate the local HIL server key");
  }
  fs.writeFileSync(tlsExtensionsPath, [
    "basicConstraints=critical,CA:FALSE",
    `subjectAltName=DNS:${tlsServerHostname},IP:${lanIp},DNS:localhost`,
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    "subjectKeyIdentifier=hash",
    "authorityKeyIdentifier=keyid,issuer",
    "",
  ].join("\n"), { encoding: "utf8", mode: 0o600 });
  const leafGenerated = spawnSync(openssl, [
    "x509", "-req", "-in", tlsCsrPath,
    "-CA", tlsCaPath,
    "-CAkey", tlsCaKeyPath,
    "-CAcreateserial",
    "-out", tlsCertificatePath,
    "-days", "14",
    "-sha256",
    "-extfile", tlsExtensionsPath,
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  for (const filePath of [tlsCsrPath, tlsExtensionsPath, tlsSerialPath]) {
    fs.rmSync(filePath, { force: true });
  }
  if (leafGenerated.status !== 0) {
    throw new Error("OpenSSL could not sign the local HIL server certificate");
  }
}

function certificateMatchesCurrentHilLan() {
  try {
    const certificate = new crypto.X509Certificate(fs.readFileSync(tlsCertificatePath));
    const trustAnchor = new crypto.X509Certificate(
      fs.readFileSync(tlsTrustCertificatePath),
    );
    const validUntil = Date.parse(certificate.validTo);
    const trustValidUntil = Date.parse(trustAnchor.validTo);
    return Number.isFinite(validUntil) &&
      Number.isFinite(trustValidUntil) &&
      validUntil > Date.now() + 5 * 60 * 1000 &&
      trustValidUntil > Date.now() + 5 * 60 * 1000 &&
      certificate.subject.includes(`CN=${tlsServerHostname}`) &&
      certificate.subject.includes("OU=ShcareHILv3") &&
      certificate.subjectAltName.includes(`IP Address:${lanIp}`) &&
      trustAnchor.subject.includes("CN=ShcareHIL Root CA") &&
      trustAnchor.subject.includes("OU=ShcareHILv3");
  } catch {
    return false;
  }
}

function validateInputs() {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(deviceId)) {
    throw new Error("SHCARE_HIL_DEVICE_ID must be a canonical 3-63 character id");
  }
  if (deviceSecret.length < 16 || deviceSecret.length > 95) {
    throw new Error("SHCARE_HIL_DEVICE_SECRET must contain 16-95 characters");
  }
  for (const [filePath, label] of [
    [tlsKeyPath, "HIL TLS private key"],
    [tlsCertificatePath, "HIL TLS certificate"],
    [tlsTrustCertificatePath, "HIL TLS trust anchor"],
  ]) {
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`${label} is missing`);
    }
  }
  if (!useExternalBackend && (!fs.existsSync(backendEntry) || !fs.statSync(backendEntry).isFile())) {
    throw new Error("backend entrypoint is missing");
  }
  for (const [value, label] of [
    [backendPort, "backend port"],
    [audioPort, "audio port"],
    [tlsPort, "TLS port"],
  ]) {
    requireBoundedPort(value, label);
  }
  if (new Set([backendPort, audioPort, tlsPort]).size !== 3) {
    throw new Error("Backend, audio and TLS ports must be distinct");
  }
}

function writeSeedDatabase() {
  const now = new Date().toISOString();
  const database = {
    version: 1,
    createdAt: now,
    updatedAt: now,
    organizations: [{
      id: "org_hil",
      name: "Shcare HIL Workspace",
      type: "clinic",
      workspaceType: "clinic",
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    }],
    users: [{
      id: "usr_platform_hil",
      role: "admin",
      requestedRole: "admin",
      roleRequestStatus: "approved",
      accountStatus: "active",
      name: "Shcare HIL Platform Admin",
      email: "platform.hil@shcare.local",
      password: "12345678",
      organizationId: "org_hil",
      verifiedEmail: true,
      createdAt: now,
      updatedAt: now,
    }],
    memberships: [{
      id: "mbr_platform_hil",
      userId: "usr_platform_hil",
      organizationId: "org_hil",
      role: "platform_admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
    }],
    patients: [{
      id: "pat_hil",
      organizationId: "org_hil",
      patientCode: "HIL-001",
      name: "Shcare HIL Patient",
      createdAt: now,
      updatedAt: now,
    }],
    devices: [{
      id: deviceId,
      organizationId: "org_hil",
      ownerUserId: "usr_platform_hil",
      pairedUserId: "usr_platform_hil",
      ownershipState: "claimed",
      name: "Shcare Physical HIL Device",
      type: "stethoscope",
      status: "available",
      connected: false,
      secret: deviceSecret,
      firmwareVersion: "1.0.1-hil",
      createdAt: now,
      updatedAt: now,
    }],
  };
  fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify(database, null, 2));
}

function sanitizeLine(line) {
  return /secret|password|credential|authorization|proof/i.test(line)
    ? "sensitive runtime line redacted"
    : line.slice(0, 500);
}

function forwardOutput(stream, label) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) process.stdout.write(`[${label}] ${sanitizeLine(line)}\n`);
    }
  });
}

function startBackend() {
  const child = spawn(process.execPath, [backendEntry], {
    cwd: backendRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(backendPort),
      AUDIO_UDP_PORT: String(audioPort),
      DATA_BACKEND: "json",
      DATA_DIR: dataDir,
      AUTH_MODE: "demo",
      ALLOW_DEMO_AUTH: "true",
      FIREBASE_AUTH_ENABLED: "false",
      OBJECT_STORAGE_PROVIDER: "local",
      LOCAL_OBJECT_STORAGE_DIR: path.join(dataDir, "objects"),
      NOTIFICATION_EMAIL_ENABLED: "false",
      PUSH_NOTIFICATIONS_ENABLED: "false",
      CORS_ORIGIN: `https://127.0.0.1:${tlsPort}`,
      NODE_ENV: "test",
    },
  });
  children.add(child);
  forwardOutput(child.stdout, "backend");
  forwardOutput(child.stderr, "backend:error");
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      process.stderr.write(`[device-hil] backend stopped unexpectedly (code=${code ?? "none"}, signal=${signal ?? "none"})\n`);
      void stopAll(1);
    }
  });
  return child;
}

function proxyHttpRequest(req, res) {
  const proxy = http.request({
    host: "127.0.0.1",
    port: backendPort,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `127.0.0.1:${backendPort}` },
  }, (upstream) => {
    if (String(req.url || "").includes("/ota/") && String(req.url || "").endsWith("/firmware")) {
      // HIL-only diagnostic: expose the status code and route shape, never
      // headers (which may contain the one-time OTA bearer).
      process.stdout.write(`[device-hil] OTA firmware proxy ${req.method} ${new URL(req.url, "https://shcare-hil.local").pathname} -> HTTP ${upstream.statusCode || 502}\n`);
    }
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  proxy.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(proxy);
}

function proxyUpgrade(req, clientSocket, head) {
  const upstream = net.connect(backendPort, "127.0.0.1");
  const closeBoth = () => {
    clientSocket.destroy();
    upstream.destroy();
  };
  upstream.once("error", closeBoth);
  clientSocket.once("error", closeBoth);
  upstream.once("connect", () => {
    const headers = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let index = 0; index < req.rawHeaders.length; index += 2) {
      const name = req.rawHeaders[index];
      const value = req.rawHeaders[index + 1];
      headers.push(name.toLowerCase() === "host"
        ? `Host: 127.0.0.1:${backendPort}`
        : `${name}: ${value}`);
    }
    headers.push("", "");
    upstream.write(headers.join("\r\n"));
    if (head.length) upstream.write(head);
    clientSocket.pipe(upstream).pipe(clientSocket);
  });
}

async function listenTlsProxy() {
  const leafCertificate = fs.readFileSync(tlsCertificatePath);
  // The ESP32 fixture pins the local root.  Supplying the complete local
  // chain makes the HIL proxy interoperable with mbedTLS builds that require
  // every issuer to be present in the peer chain.  Custom certificates retain
  // their owner-provided chain verbatim.
  const certificateChain = usesDefaultTlsPaths
    ? Buffer.concat([leafCertificate, Buffer.from("\n"), fs.readFileSync(tlsCaPath)])
    : leafCertificate;
  tlsServer = https.createServer({
    key: fs.readFileSync(tlsKeyPath),
    cert: certificateChain,
    minVersion: "TLSv1.2",
  }, proxyHttpRequest);
  tlsServer.on("upgrade", proxyUpgrade);
  await new Promise((resolve, reject) => {
    tlsServer.once("error", reject);
    tlsServer.listen(tlsPort, "0.0.0.0", resolve);
  });
}

async function waitForBackend(child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not ready";
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error("backend exited before readiness");
    }
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/v1/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`backend readiness timed out: ${lastError}`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (tlsServer) await new Promise((resolve) => tlsServer.close(resolve));
  await Promise.all([...children].map(stopChild));
  const resolvedTemp = path.resolve(os.tmpdir());
  const resolvedData = path.resolve(dataDir);
  if (resolvedData.startsWith(`${resolvedTemp}${path.sep}`)) {
    fs.rmSync(resolvedData, { recursive: true, force: true });
  }
  process.exitCode = exitCode;
}

async function main() {
  prepareRuntimeMaterial();
  validateInputs();
  let backend = null;
  if (!useExternalBackend) {
    writeSeedDatabase();
    backend = startBackend();
  }
  await waitForBackend(backend);
  await listenTlsProxy();
  process.stdout.write(`${JSON.stringify({
    type: "device-hil.ready",
    deviceId,
    backendPort,
    audioPort,
    tlsPort,
    runtimeDir,
    externalBackend: useExternalBackend,
  })}\n`);
  await new Promise(() => {});
}

process.once("SIGINT", () => void stopAll(0));
process.once("SIGTERM", () => void stopAll(0));

try {
  await main();
} catch (error) {
  process.stderr.write(`[device-hil] ${error instanceof Error ? error.stack || error.message : error}\n`);
  await stopAll(1);
}
