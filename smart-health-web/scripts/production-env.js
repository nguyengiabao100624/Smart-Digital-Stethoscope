import fs from "node:fs";
import path from "node:path";

const DEFAULT_ENV = {
  VITE_AUTH_MODE: "production",
  VITE_SMART_HEALTH_API_BASE_URL: "https://shcare-api-prod.onrender.com/api",
  VITE_PUBLIC_SITE_URL: "https://shcare.web.app",
};
const RETIRED_API_BASE_URLS = new Set([
  "https://smart-health-api-xj0a.onrender.com/api",
  "https://smart-health-api-r5is.onrender.com/api",
]);
const RETIRED_BASE_URLS = new Set([
  "https://smart-health-api-xj0a.onrender.com",
  "https://smart-health-api-r5is.onrender.com",
]);

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
        const index = normalized.indexOf("=");
        return [
          normalized.slice(0, index).trim(),
          normalized
            .slice(index + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

function uniqueExistingFiles(files) {
  const seen = new Set();
  return files.filter((file) => {
    if (!file || seen.has(file) || !fs.existsSync(file)) {
      return false;
    }
    seen.add(file);
    return true;
  });
}

export function getProductionEnvFiles(cwd = process.cwd()) {
  return uniqueExistingFiles([
    process.env.SHCARE_WEB_ENV_FILE && path.resolve(process.env.SHCARE_WEB_ENV_FILE),
    path.resolve(cwd, ".env.production.local"),
    path.resolve(cwd, ".env.production"),
    path.resolve(cwd, "..", "smart-health-admin", "thiết kế giao diện", ".env.production"),
  ]);
}

export function loadProductionEnv({ cwd = process.cwd(), applyToProcess = true } = {}) {
  const files = getProductionEnvFiles(cwd);
  const fileEnv = files.reduce((env, file) => ({ ...env, ...parseEnvFile(file) }), {});
  const env = { ...DEFAULT_ENV, ...fileEnv, ...process.env };
  if (
    process.env.VITE_SMART_HEALTH_API_BASE_URL === undefined &&
    RETIRED_API_BASE_URLS.has(env.VITE_SMART_HEALTH_API_BASE_URL)
  ) {
    env.VITE_SMART_HEALTH_API_BASE_URL = DEFAULT_ENV.VITE_SMART_HEALTH_API_BASE_URL;
  }
  if (
    process.env.VITE_SMART_HEALTH_BASE_URL === undefined &&
    RETIRED_BASE_URLS.has(env.VITE_SMART_HEALTH_BASE_URL)
  ) {
    env.VITE_SMART_HEALTH_BASE_URL = DEFAULT_ENV.VITE_SMART_HEALTH_API_BASE_URL.replace(/\/api$/, "");
  }

  if (applyToProcess) {
    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] === undefined && value !== undefined) {
        process.env[key] = value;
      }
    }
  }

  return { env, files };
}
