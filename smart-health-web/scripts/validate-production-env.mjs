import fs from "node:fs";
import path from "node:path";

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [
          line.slice(0, index).trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

const fileEnv = readEnvFile(path.resolve(".env.production"));
const env = { ...fileEnv, ...process.env };
const required = [
  "VITE_SMART_HEALTH_API_BASE_URL",
  "VITE_PUBLIC_SITE_URL",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];
const missing = required.filter((key) => !String(env[key] || "").trim());

if (env.VITE_AUTH_MODE !== "production") {
  throw new Error("VITE_AUTH_MODE phải là production khi build Firebase Hosting");
}
if (missing.length) {
  throw new Error(`Thiếu biến môi trường production: ${missing.join(", ")}`);
}

for (const key of ["VITE_SMART_HEALTH_API_BASE_URL", "VITE_PUBLIC_SITE_URL"]) {
  const url = new URL(env[key]);
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(`${key} phải là HTTPS production, không được trỏ về localhost`);
  }
}

console.log("Production environment hợp lệ");
console.log(`- API: ${env.VITE_SMART_HEALTH_API_BASE_URL}`);
console.log(`- Site: ${env.VITE_PUBLIC_SITE_URL}`);
console.log(`- Firebase project: ${env.VITE_FIREBASE_PROJECT_ID}`);
