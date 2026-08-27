import { chromium, firefox, webkit } from "playwright";

const browserTypes = Object.freeze({ chromium, firefox, webkit });

export function resolveBrowserSmokeRuntime(value = "chromium") {
  const name = String(value || "chromium").trim().toLowerCase();
  const browserType = browserTypes[name];

  if (!browserType) {
    throw new Error(
      `Unsupported UI smoke browser "${name}". Expected chromium, firefox, or webkit.`,
    );
  }

  return { name, browserType };
}
