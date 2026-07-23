import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 8080,
    fs: {
      strict: true,
      allow: [
        searchForWorkspaceRoot(process.cwd()),
        resolve(process.cwd(), "../packages"),
      ],
    },
  },
  plugins: [tsconfigPaths(), tanstackStart(), viteReact(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 900,
  },
});
