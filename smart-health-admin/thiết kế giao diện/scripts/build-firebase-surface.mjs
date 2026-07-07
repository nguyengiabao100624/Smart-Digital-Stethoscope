import { spawnSync } from "node:child_process";
import process from "node:process";

const surface = process.argv[2] === "portal" ? "portal" : "admin";
const outDir = surface === "portal" ? "dist-firebase-portal" : "dist-firebase";
const command = process.platform === "win32" ? "cmd.exe" : "npx";
const viteArgs = [
  "vite",
  "build",
  "--mode",
  "production",
  "--config",
  "vite.firebase.config.ts",
  "--outDir",
  outDir,
];
const args = process.platform === "win32" ? ["/c", "npx", ...viteArgs] : viteArgs;

const result = spawnSync(command, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_SMART_HEALTH_WEB_SURFACE: surface,
  },
});

process.exit(result.status ?? 1);
