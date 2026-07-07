import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    prerender: {
      enabled: true,
      crawlLinks: true,
      routes: ["/", "/login", "/forgot-password"],
    },
  },
  vite: {
    build: {
      outDir: "dist-firebase",
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200,
    },
  },
});
