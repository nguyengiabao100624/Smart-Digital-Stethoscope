import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 8080,
  },
  preview: {
    host: "127.0.0.1",
    port: 8080,
  },
  plugins: [tsconfigPaths(), viteReact(), tailwindcss()],
  build: {
    outDir: "dist-firebase",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: "index.html",
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/firebase")) return "firebase-auth";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-core";
          }
          if (id.includes("node_modules/@radix-ui")) return "radix-ui";
          if (id.includes("node_modules/recharts")) return "charts";
          if (id.includes("node_modules/motion")) return "motion";
        },
      },
    },
  },
});
