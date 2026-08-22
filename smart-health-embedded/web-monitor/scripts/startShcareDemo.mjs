import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(backendRoot, "..", "..");
const webRoot = path.join(workspaceRoot, "smart-health-web");
const adminRoot = path.join(workspaceRoot, "smart-health-admin", "thiết kế giao diện");
const backendEntry = path.join(backendRoot, "server.js");
const webViteEntry = path.join(webRoot, "node_modules", "vite", "bin", "vite.js");
const adminViteEntry = path.join(adminRoot, "node_modules", "vite", "bin", "vite.js");

const ports = {
  backend: Number(process.env.SHCARE_DEMO_BACKEND_PORT || 3765),
  audio: Number(process.env.SHCARE_DEMO_AUDIO_PORT || 3766),
  web: Number(process.env.SHCARE_DEMO_WEB_PORT || 8765),
  admin: Number(process.env.SHCARE_DEMO_ADMIN_PORT || 8766),
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

function startNode(label, args, cwd, env) {
  const child = spawn(process.execPath, args, {
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
  for (const [label, port] of Object.entries(ports)) assertPort(port, label);
  if (new Set(Object.values(ports)).size !== Object.values(ports).length) {
    throw new Error("Demo backend, audio, Web and Admin ports must be unique.");
  }
  await Promise.all(
    Object.entries(ports).map(([label, port]) => assertPortAvailable(port, label)),
  );

  const backend = startNode("backend", [backendEntry], backendRoot, {
    PORT: String(ports.backend),
    AUDIO_UDP_PORT: String(ports.audio),
    DATA_BACKEND: "json",
    DATA_DIR: dataDir,
    AUTH_MODE: "demo",
    ALLOW_DEMO_AUTH: "true",
    FIREBASE_AUTH_ENABLED: "false",
    OBJECT_STORAGE_PROVIDER: "local",
    LOCAL_OBJECT_STORAGE_DIR: path.join(dataDir, "objects"),
    NOTIFICATION_EMAIL_ENABLED: "false",
    PUSH_NOTIFICATIONS_ENABLED: "false",
    CORS_ORIGIN: `${origins.web},${origins.admin}`,
  });
  await waitForUrl(`${origins.backend}/api/v1/health`, "Backend", backend);
  await registerDemoAdmin();

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
  process.stdout.write(`This is local demo authentication only; provider/live, ADB and HIL remain unproven.\n`);

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
