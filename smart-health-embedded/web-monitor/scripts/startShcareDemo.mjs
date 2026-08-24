import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(backendRoot, "..", "..");
const webRoot = path.join(workspaceRoot, "smart-health-web");
const adminRoot = path.join(workspaceRoot, "smart-health-admin", "thiết kế giao diện");
const backendEntry = path.join(backendRoot, "server.js");
const webViteEntry = path.join(webRoot, "node_modules", "vite", "bin", "vite.js");
const adminViteEntry = path.join(adminRoot, "node_modules", "vite", "bin", "vite.js");
const deviceHilEntry = path.join(__dirname, "startDeviceHil.mjs");
const firebaseDemoConfig = path.join(backendRoot, "firebase.demo.json");
const require = createRequire(import.meta.url);
const { createFactoryEnrolledDeviceFixture } = require("./factoryDeviceFixture");
const integratedDemo =
  String(process.env.SHCARE_DEMO_INTEGRATED || "").toLowerCase() === "true";
const exitAfterReady =
  String(process.env.SHCARE_DEMO_EXIT_AFTER_READY || "").toLowerCase() === "true";
const firebaseProjectId = "smart-health-stethoscope";
const deviceId = String(process.env.SHCARE_HIL_DEVICE_ID || "shcare-g3-hil").trim();
const hilRuntimeDir = path.resolve(
  process.env.SHCARE_HIL_RUNTIME_DIR || path.join(os.tmpdir(), "shcare-g3-hil-runtime"),
);
const deviceMaterialPath = path.join(hilRuntimeDir, "device.material");

const ports = {
  backend: Number(process.env.SHCARE_DEMO_BACKEND_PORT || 3765),
  audio: Number(process.env.SHCARE_DEMO_AUDIO_PORT || 3766),
  web: Number(process.env.SHCARE_DEMO_WEB_PORT || 8765),
  admin: Number(process.env.SHCARE_DEMO_ADMIN_PORT || 8766),
  auth: Number(process.env.SHCARE_DEMO_AUTH_PORT || 9099),
  tls: Number(process.env.SHCARE_HIL_TLS_PORT || 3767),
};
const origins = {
  backend: `http://127.0.0.1:${ports.backend}`,
  web: `http://127.0.0.1:${ports.web}`,
  admin: `http://127.0.0.1:${ports.admin}`,
};
const adminCredentials = {
  email: "admin.demo@shcare.local",
  password: "Shcare-Demo-2026!",
};
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-interactive-demo-"));
const children = new Map();
let stopping = false;
let deviceMaterial = "";

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

function assertPort(value, label) {
  if (!Number.isSafeInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${label} must be an integer from 1024 to 65535.`);
  }
}

function assertPortAvailable(port, label) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", () => reject(new Error(`${label} port ${port} is already in use.`)));
    probe.listen(port, "0.0.0.0", () => probe.close(resolve));
  });
}

function resolveLanIp() {
  const explicit = String(process.env.SHCARE_HIL_LAN_IP || "").trim();
  if (explicit && net.isIP(explicit) === 4) return explicit;
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const address of interfaces || []) {
      if (address.family === "IPv4" && !address.internal && net.isIP(address.address) === 4) {
        return address.address;
      }
    }
  }
  throw new Error("An IPv4 LAN address is required for the phone and physical ESP demo.");
}

function prepareIntegratedDeviceFixture() {
  if (!integratedDemo) return;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(deviceId)) {
    throw new Error("SHCARE_HIL_DEVICE_ID must be a canonical device id.");
  }
  fs.mkdirSync(hilRuntimeDir, { recursive: true });
  if (fs.existsSync(deviceMaterialPath)) {
    deviceMaterial = fs.readFileSync(deviceMaterialPath, "utf8").trim();
  } else {
    deviceMaterial = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(deviceMaterialPath, deviceMaterial, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }
  if (deviceMaterial.length < 16 || deviceMaterial.length > 95) {
    throw new Error("Physical demo device material is outside firmware bounds.");
  }
  const now = new Date().toISOString();
  const database = {
    version: 1,
    createdAt: now,
    updatedAt: now,
    devices: [
      createFactoryEnrolledDeviceFixture({
        deviceId,
        organizationId: "org_default_clinic",
        factoryCredential: deviceMaterial,
        name: "Shcare ESP32-S3 hai mic",
        createdAt: now,
      }),
    ],
  };
  fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify(database, null, 2));
}

function prefixOutput(label, stream) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) process.stdout.write(`[${label}] ${line}\n`);
    }
  });
}

function startProcess(label, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  prefixOutput(label, child.stdout);
  prefixOutput(label, child.stderr);
  children.set(label, child);
  child.once("exit", (code, signal) => {
    children.delete(label);
    if (!stopping) {
      process.stderr.write(
        `[demo] ${label} stopped unexpectedly (code=${code ?? "none"}, signal=${signal ?? "none"}).\n`,
      );
      void stopAll(1);
    }
  });
  return child;
}

function startNode(label, args, cwd, env) {
  return startProcess(label, process.execPath, args, cwd, env);
}

async function waitForPort(port, label, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not started";
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`${label} stopped before readiness.`);
    }
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect(port, "127.0.0.1");
        socket.setTimeout(1_000);
        socket.once("connect", () => {
          socket.destroy();
          resolve();
        });
        socket.once("timeout", () => {
          socket.destroy();
          reject(new Error("timeout"));
        });
        socket.once("error", reject);
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} readiness failed: ${lastError}`);
}

async function waitForUrl(url, label, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not started";
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`${label} stopped before readiness.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} readiness failed: ${lastError}`);
}

async function startFirebaseAuthEmulator() {
  const firebaseAuthEmulatorHost = `127.0.0.1:${ports.auth}`;
  const firebaseArgs = [
    "firebase-tools@latest",
    "emulators:start",
    "--only",
    "auth",
    "--project",
    firebaseProjectId,
    "--config",
    firebaseDemoConfig,
    "--non-interactive",
  ];
  const command = process.platform === "win32"
    ? process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe"
    : "npx";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx.cmd", ...firebaseArgs]
    : firebaseArgs;
  const child = startProcess(
    "firebase-auth",
    command,
    commandArgs,
    backendRoot,
    {
      FIREBASE_AUTH_EMULATOR_HOST: firebaseAuthEmulatorHost,
      GOOGLE_CLOUD_PROJECT: firebaseProjectId,
    },
  );
  await waitForPort(ports.auth, "Firebase Auth emulator", child, 120_000);
  process.env.FIREBASE_AUTH_EMULATOR_HOST = firebaseAuthEmulatorHost;
  process.env.GOOGLE_CLOUD_PROJECT = firebaseProjectId;
  process.env.FIREBASE_PROJECT_ID = firebaseProjectId;
  for (const account of [
    {
      uid: "firebase_patient_demo",
      email: "patient@example.com",
      displayName: "Shcare Demo Patient",
    },
    {
      uid: "firebase_doctor_demo",
      email: "doctor@example.com",
      displayName: "Shcare Demo Doctor",
    },
  ]) {
    const createResponse = await fetch(
      `http://${firebaseAuthEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signUp`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer owner",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          localId: account.uid,
          email: account.email,
          displayName: account.displayName,
          password: "12345678",
          emailVerified: true,
          disabled: false,
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!createResponse.ok) {
      throw new Error(
        `Firebase Auth emulator seed failed for ${account.email}: HTTP ${createResponse.status} ${await createResponse.text()}`,
      );
    }

    const signInResponse = await fetch(
      `http://${firebaseAuthEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: account.email,
          password: "12345678",
          returnSecureToken: true,
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!signInResponse.ok) {
      throw new Error(
        `Firebase Auth emulator sign-in proof failed for ${account.email}: HTTP ${signInResponse.status} ${await signInResponse.text()}`,
      );
    }
    const signIn = await signInResponse.json();
    const claims = JSON.parse(
      Buffer.from(String(signIn.idToken).split(".")[1], "base64url").toString("utf8"),
    );
    if (claims.user_id !== account.uid || claims.email_verified !== true) {
      throw new Error(`Firebase Auth emulator ownership proof failed for ${account.email}.`);
    }
  }
  return child;
}

async function startIntegratedDeviceHil(lanIp) {
  const child = startNode("device-hil", [deviceHilEntry], backendRoot, {
    SHCARE_HIL_EXTERNAL_BACKEND: "true",
    SHCARE_HIL_DEVICE_ID: deviceId,
    SHCARE_HIL_LAN_IP: lanIp,
    SHCARE_HIL_RUNTIME_DIR: hilRuntimeDir,
    SHCARE_HIL_BACKEND_PORT: String(ports.backend),
    SHCARE_HIL_AUDIO_PORT: String(ports.audio),
    SHCARE_HIL_TLS_PORT: String(ports.tls),
  });
  await waitForPort(ports.tls, "Physical-device TLS/WSS proxy", child, 60_000);
  return child;
}

async function proveFirebaseBackendExchange() {
  const signInResponse = await fetch(
    `http://127.0.0.1:${ports.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "patient@example.com",
        password: "12345678",
        returnSecureToken: true,
      }),
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (!signInResponse.ok) {
    throw new Error(`Integrated Firebase sign-in failed: HTTP ${signInResponse.status}.`);
  }
  const signIn = await signInResponse.json();
  const backendResponse = await fetch(`${origins.backend}/api/v1/auth/firebase`, {
    headers: { Authorization: `Bearer ${signIn.idToken}` },
    signal: AbortSignal.timeout(5_000),
  });
  const body = await backendResponse.json().catch(() => ({}));
  if (
    !backendResponse.ok ||
    body?.user?.email !== "patient@example.com" ||
    body?.user?.firebaseUid !== "firebase_patient_demo"
  ) {
    throw new Error(
      `Backend rejected Firebase emulator ownership proof: HTTP ${backendResponse.status}.`,
    );
  }
}

async function registerDemoAdmin() {
  const response = await fetch(`${origins.backend}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "admin",
      name: "Shcare Demo Platform Admin",
      ...adminCredentials,
    }),
  });
  if (response.status !== 201) {
    const body = await response.text();
    throw new Error(`Unable to create the isolated demo admin: HTTP ${response.status} ${body}`);
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
      timeout: 5_000,
    });
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]);
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.stdout.write("\n[demo] Stopping the isolated Shcare demo stack...\n");
  await Promise.all([...children.values()].map((child) => stopChild(child)));
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedDataDir = path.resolve(dataDir);
  if (resolvedDataDir.startsWith(`${tempRoot}${path.sep}`)) {
    fs.rmSync(resolvedDataDir, { recursive: true, force: true });
  }
  process.exitCode = exitCode;
}

async function main() {
  requireFile(backendEntry, "Backend entrypoint");
  requireFile(webViteEntry, "Web Vite runtime (run npm install in smart-health-web)");
  requireFile(adminViteEntry, "Admin Vite runtime (run npm install in the Admin module)");
  if (integratedDemo) {
    requireFile(deviceHilEntry, "Physical-device HIL proxy");
    requireFile(firebaseDemoConfig, "Firebase Auth emulator config");
  }
  const activePorts = integratedDemo
    ? ports
    : Object.fromEntries(
        Object.entries(ports).filter(([label]) => !["auth", "tls"].includes(label)),
      );
  for (const [label, port] of Object.entries(activePorts)) assertPort(port, label);
  if (new Set(Object.values(activePorts)).size !== Object.values(activePorts).length) {
    throw new Error("Demo backend, audio, Web and Admin ports must be unique.");
  }
  await Promise.all(
    Object.entries(activePorts).map(([label, port]) => assertPortAvailable(port, label)),
  );

  const lanIp = integratedDemo ? resolveLanIp() : "";
  prepareIntegratedDeviceFixture();
  if (integratedDemo) await startFirebaseAuthEmulator();

  const backend = startNode("backend", [backendEntry], backendRoot, {
    PORT: String(ports.backend),
    AUDIO_UDP_PORT: String(ports.audio),
    DATA_BACKEND: "json",
    DATA_DIR: dataDir,
    AUTH_MODE: "demo",
    ALLOW_DEMO_AUTH: "true",
    FIREBASE_AUTH_ENABLED: integratedDemo ? "true" : "false",
    FIREBASE_AUTH_EMULATOR_HOST: integratedDemo ? `127.0.0.1:${ports.auth}` : "",
    FIREBASE_PROJECT_ID: integratedDemo ? firebaseProjectId : "",
    GOOGLE_CLOUD_PROJECT: integratedDemo ? firebaseProjectId : "",
    OBJECT_STORAGE_PROVIDER: "local",
    LOCAL_OBJECT_STORAGE_DIR: path.join(dataDir, "objects"),
    NOTIFICATION_EMAIL_ENABLED: "false",
    PUSH_NOTIFICATIONS_ENABLED: "false",
    CORS_ORIGIN: `${origins.web},${origins.admin}`,
  });
  await waitForUrl(`${origins.backend}/api/v1/health`, "Backend", backend);
  await registerDemoAdmin();
  if (integratedDemo) await proveFirebaseBackendExchange();
  if (integratedDemo) await startIntegratedDeviceHil(lanIp);

  const commonClientEnv = {
    VITE_AUTH_MODE: "demo",
    VITE_SMART_HEALTH_BASE_URL: origins.backend,
    VITE_SMART_HEALTH_API_BASE_URL: `${origins.backend}/api`,
    VITE_FIREBASE_API_KEY: "",
    VITE_FIREBASE_AUTH_DOMAIN: "",
    VITE_FIREBASE_PROJECT_ID: "",
    VITE_FIREBASE_STORAGE_BUCKET: "",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "",
    VITE_FIREBASE_APP_ID: "",
    VITE_FIREBASE_MEASUREMENT_ID: "",
  };
  const web = startNode(
    "web",
    [webViteEntry, "dev", "--host", "127.0.0.1", "--port", String(ports.web), "--strictPort"],
    webRoot,
    { ...commonClientEnv, VITE_PUBLIC_SITE_URL: origins.web },
  );
  const admin = startNode(
    "admin",
    [
      adminViteEntry,
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(ports.admin),
      "--strictPort",
    ],
    adminRoot,
    {
      ...commonClientEnv,
      VITE_SMART_HEALTH_WEB_SURFACE: "admin",
      VITE_SMART_HEALTH_ADMIN_WEB_URL: origins.admin,
      VITE_SMART_HEALTH_PORTAL_WEB_URL: origins.web,
    },
  );
  await Promise.all([
    waitForUrl(origins.web, "Web/Portal", web),
    waitForUrl(`${origins.admin}/login`, "Platform Admin", admin),
  ]);

  process.stdout.write(`\nShcare local demo is ready (isolated data; Ctrl+C cleans it up).\n\n`);
  process.stdout.write(`Public Web / Portal: ${origins.web}\n`);
  process.stdout.write(`Platform Admin:      ${origins.admin}/login\n`);
  process.stdout.write(`Backend health:      ${origins.backend}/api/v1/health\n\n`);
  process.stdout.write(`Patient:  patient@example.com / 12345678\n`);
  process.stdout.write(`Doctor:   doctor@example.com / 12345678\n`);
  process.stdout.write(`Admin:    ${adminCredentials.email} / ${adminCredentials.password}\n\n`);
  if (integratedDemo) {
    process.stdout.write(`Android backend:      http://${lanIp}:${ports.backend}\n`);
    process.stdout.write(`Firebase Auth local:  ${lanIp}:${ports.auth}\n`);
    process.stdout.write(`ESP factory device:   ${deviceId}\n`);
    process.stdout.write(`ESP secure WSS proxy: ${lanIp}:${ports.tls}\n\n`);
    process.stdout.write(
      "Provision the factory device in Platform Admin, scan its real QR in Android, " +
        "then enter the target Wi-Fi password only inside the App.\n",
    );
  } else {
    process.stdout.write(
      "This is local demo authentication only; provider/live, ADB and HIL remain unproven.\n",
    );
  }

  if (exitAfterReady) {
    await stopAll(0);
    return;
  }

  await new Promise(() => {});
}

process.once("SIGINT", () => void stopAll(0));
process.once("SIGTERM", () => void stopAll(0));

try {
  await main();
} catch (error) {
  process.stderr.write(`[demo] ${error instanceof Error ? error.stack || error.message : error}\n`);
  await stopAll(1);
}
