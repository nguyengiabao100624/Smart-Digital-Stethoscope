import path from "node:path";
import { loadProductionEnv } from "./production-env.js";

const { env, files } = loadProductionEnv();
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

if (String(env.VITE_SMART_HEALTH_API_BASE_URL || "").includes("smart-health-api-xj0a")) {
  throw new Error("VITE_SMART_HEALTH_API_BASE_URL points to retired backend smart-health-api-xj0a");
}

console.log("Production environment hợp lệ");
console.log(
  `- Env files: ${
    files.length
      ? files.map((file) => path.relative(process.cwd(), file) || ".").join(", ")
      : "process environment only"
  }`,
);
console.log(`- API: ${env.VITE_SMART_HEALTH_API_BASE_URL}`);
console.log(`- Site: ${env.VITE_PUBLIC_SITE_URL}`);
console.log(`- Firebase project: ${env.VITE_FIREBASE_PROJECT_ID}`);
