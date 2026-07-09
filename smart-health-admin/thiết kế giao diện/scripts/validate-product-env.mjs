import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const envFiles = [".env", ".env.local", ".env.production", ".env.production.local"];
const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "10.0.2.2"]);
const retiredBaseUrls = new Set(["https://smart-health-api-xj0a.onrender.com"]);
const retiredApiBaseUrls = new Set(["https://smart-health-api-xj0a.onrender.com/api"]);

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values = {};
  const raw = fs.readFileSync(filePath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[match[1]] = value;
  }

  return values;
}

function getEffectiveEnv() {
  const effective = {};
  for (const fileName of envFiles) {
    Object.assign(effective, parseEnvFile(path.join(rootDir, fileName)));
  }

  return { ...effective, ...process.env };
}

function requireHttpsNonLocalUrl(env, key) {
  const value = (env[key] || "").trim().replace(/\/+$/, "");
  if (!value) {
    throw new Error(`${key} is required for product web builds.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} is not a valid URL: ${value}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${key} must use HTTPS for product builds: ${value}`);
  }

  if (localHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error(`${key} must not point to a local backend for product builds: ${value}`);
  }

  return value;
}

function rejectRetiredBackendUrl(key, value) {
  const retiredUrls = key.endsWith("_API_BASE_URL") ? retiredApiBaseUrls : retiredBaseUrls;
  if (retiredUrls.has(value)) {
    throw new Error(
      `${key} points to a retired Smart Health backend. Use https://smart-health-api-r5is.onrender.com instead.`,
    );
  }
}

const env = getEffectiveEnv();
if (env.VITE_AUTH_MODE !== "production") {
  throw new Error("VITE_AUTH_MODE must be production for product web builds.");
}

const httpBaseUrl = requireHttpsNonLocalUrl(env, "VITE_SMART_HEALTH_BASE_URL");
const apiBaseUrl = requireHttpsNonLocalUrl(env, "VITE_SMART_HEALTH_API_BASE_URL");
rejectRetiredBackendUrl("VITE_SMART_HEALTH_BASE_URL", httpBaseUrl);
rejectRetiredBackendUrl("VITE_SMART_HEALTH_API_BASE_URL", apiBaseUrl);

if (apiBaseUrl !== `${httpBaseUrl}/api`) {
  throw new Error(
    `VITE_SMART_HEALTH_API_BASE_URL must match VITE_SMART_HEALTH_BASE_URL + /api. Got ${apiBaseUrl}.`,
  );
}

console.log("Product web env OK");
console.log(`- VITE_SMART_HEALTH_BASE_URL=${httpBaseUrl}`);
console.log(`- VITE_SMART_HEALTH_API_BASE_URL=${apiBaseUrl}`);
