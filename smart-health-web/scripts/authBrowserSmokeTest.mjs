/* global document, getComputedStyle, innerWidth, window */

import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { routeContracts } from "../src/app/contracts/route-contract.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const viteEntry = path.join(webRoot, "node_modules", "vite", "bin", "vite.js");
const children = [];
const failures = [];
let checks = 0;

const viewportMatrix = [
  { name: "phone-compact", width: 360, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
];

const themeMatrix = [
  {
    preference: "light",
    colorScheme: "light",
    resolved: "light",
  },
  { preference: "dark", colorScheme: "dark", resolved: "dark" },
  { preference: "system", colorScheme: "dark", resolved: "dark" },
];

function readFilter(name) {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length) ||
    process.env[`SMOKE_AUTH_${name.toUpperCase()}`] ||
    ""
  ).trim();
}

const routeFilter = readFilter("route");
const viewportFilter = readFilter("viewport");
const themeFilter = readFilter("theme");
const authRoutes = routeContracts.filter(
  (route) =>
    route.surface === "auth" &&
    (!routeFilter ||
      route.id.includes(routeFilter) ||
      route.smokeId.includes(routeFilter)),
);
const viewports = viewportMatrix.filter(
  (viewport) => !viewportFilter || viewport.name === viewportFilter,
);
const themes = themeMatrix.filter(
  (theme) => !themeFilter || theme.preference === themeFilter,
);

if (!authRoutes.length || !viewports.length || !themes.length) {
  throw new Error(
    `Auth UI filters selected no cases: route=${routeFilter || "*"}, viewport=${viewportFilter || "*"}, theme=${themeFilter || "*"}.`,
  );
}

function describeFailure(route, viewport, theme, message) {
  return `${route.smokeId} ${viewport.width}x${viewport.height} ${theme.preference}: ${message}`;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function startVite(port) {
  const output = [];
  const child = spawn(
    process.execPath,
    [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: webRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        VITE_SMART_HEALTH_API_BASE_URL: "http://127.0.0.1:9/api",
      },
    },
  );
  const capture = (chunk) => {
    output.push(String(chunk));
    if (output.length > 80) output.shift();
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.once("exit", (code) => {
    if (code && !child.killed) {
      failures.push(
        `Vite exited early with code ${code}: ${output.join("").slice(-2000)}`,
      );
    }
  });
  children.push(child);
  return child;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
  }
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready: ${lastError}`);
}

async function inspectRoute(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector(
      '.shc-auth-layout[data-shcare-auth-foundation="legacy-enhanced-v1"][data-shcare-auth-visual="live-legacy"]',
    );
    const main = document.querySelector("#shcare-auth-main");
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const tinyTargets = Array.from(
      document.querySelectorAll(
        'button, input:not([type="hidden"]), select, textarea, [role="button"], a',
      ),
    )
      .filter((element) => {
        if (!visible(element)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (element.tagName === "A" && style.display === "inline") return false;
        return rect.width < 44 || rect.height < 44;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const name =
          element.getAttribute("aria-label") ||
          element.textContent?.replace(/\s+/g, " ").trim() ||
          element.id;
        return `${element.tagName.toLowerCase()}[${Math.round(rect.width)}x${Math.round(rect.height)}] ${name}`;
      });
    const visualSurfaces = Array.from(
      document.querySelectorAll(
        [
          ".shc-auth-aside",
          ".shc-auth-card",
          ".shc-auth-mobile-top",
          ".shc-auth-preview-card",
          ".shc-auth-alert",
          ".shc-auth-choice",
          ".shc-auth-upload",
          ".shc-auth-review",
          ".shc-auth-status-summary",
          ".shc-auth-guard-dialog",
        ].join(","),
      ),
    )
      .filter(visible)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          className: element.className,
          backdrop:
            style.backdropFilter || style.webkitBackdropFilter || "none",
          filter: style.filter,
        };
      });
    const decoratedHeadings = Array.from(main?.querySelectorAll("h1, h2") || [])
      .filter(visible)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          text: element.textContent?.replace(/\s+/g, " ").trim(),
          backgroundClip: style.backgroundClip,
          webkitTextFillColor: style.webkitTextFillColor,
          textShadow: style.textShadow,
          filter: style.filter,
        };
      });
    const infiniteAnimations = document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState !== "finished" &&
          animation.effect?.getTiming().iterations === Infinity,
      ).length;
    return {
      shell: Boolean(shell),
      mainVisible: Boolean(main && visible(main)),
      h1Count: Array.from(main?.querySelectorAll("h1") || []).filter(visible)
        .length,
      theme: root.dataset.theme,
      resolvedTheme: root.dataset.resolvedTheme,
      colorScheme: getComputedStyle(root).colorScheme,
      overflow: Math.max(0, root.scrollWidth - innerWidth),
      tinyTargets,
      visualSurfaces,
      decoratedHeadings,
      autoplayVideos: document.querySelectorAll("video[autoplay]").length,
      infiniteAnimations,
    };
  });
}

async function runCase(browser, siteUrl, viewport, theme) {
  const context = await browser.newContext({
    viewport,
    colorScheme: theme.colorScheme,
    reducedMotion: "reduce",
    locale: "vi-VN",
  });
  await context.addInitScript((preference) => {
    window.localStorage.setItem("shcare-theme", preference);
  }, theme.preference);
  const page = await context.newPage();
  const runtimeErrors = [];
  const staticAssetErrors = [];
  const unexpectedApiRequests = [];

  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => {
    const resourceType = response.request().resourceType();
    if (
      response.status() >= 400 &&
      ["document", "stylesheet", "script", "font", "image"].includes(
        resourceType,
      )
    ) {
      staticAssetErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.route("**/api/**", async (route) => {
    unexpectedApiRequests.push(
      `${route.request().method()} ${route.request().url()}`,
    );
    await route.fulfill({
      status: 401,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        code: "AUTH_REQUIRED",
        message: "Authentication is required.",
        requestId: "auth-ui-foundation",
      }),
    });
  });

  try {
    for (const route of authRoutes) {
      runtimeErrors.length = 0;
      staticAssetErrors.length = 0;
      unexpectedApiRequests.length = 0;
      await page.goto(`${siteUrl}${route.path}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await page.locator("#shcare-auth-main").waitFor({ state: "visible" });
      const layout = await inspectRoute(page);
      const prefix = (message) =>
        describeFailure(route, viewport, theme, message);

      checks += 1;
      if (!layout.shell) {
        failures.push(prefix("legacy-enhanced Auth shell missing"));
      }
      checks += 1;
      if (!layout.mainVisible)
        failures.push(prefix("Auth main is not visible"));
      checks += 1;
      if (layout.h1Count !== 1) {
        failures.push(prefix(`expected one h1, found ${layout.h1Count}`));
      }
      checks += 1;
      if (layout.theme !== theme.preference) {
        failures.push(prefix(`theme=${layout.theme || "missing"}`));
      }
      checks += 1;
      if (layout.resolvedTheme !== theme.resolved) {
        failures.push(
          prefix(`resolvedTheme=${layout.resolvedTheme || "missing"}`),
        );
      }
      checks += 1;
      if (!layout.colorScheme.includes(theme.resolved)) {
        failures.push(prefix(`color-scheme=${layout.colorScheme}`));
      }
      checks += 1;
      if (layout.overflow > 1) {
        failures.push(prefix(`horizontal overflow ${layout.overflow}px`));
      }
      checks += 1;
      if (layout.tinyTargets.length) {
        failures.push(
          prefix(
            `targets below 44px: ${layout.tinyTargets.slice(0, 8).join(", ")}`,
          ),
        );
      }
      checks += 1;
      const filteredSurface = layout.visualSurfaces.find(
        (surface) =>
          !["none", ""].includes(surface.backdrop) ||
          !["none", ""].includes(surface.filter),
      );
      if (filteredSurface) {
        failures.push(
          prefix(
            `forbidden surface filter on ${filteredSurface.className}: backdrop=${filteredSurface.backdrop}, filter=${filteredSurface.filter}`,
          ),
        );
      }
      checks += 1;
      const decoratedHeading = layout.decoratedHeadings.find(
        (heading) =>
          heading.backgroundClip === "text" ||
          !["none", ""].includes(heading.textShadow) ||
          !["none", ""].includes(heading.filter) ||
          ["transparent", "rgba(0, 0, 0, 0)"].includes(
            heading.webkitTextFillColor,
          ),
      );
      if (decoratedHeading) {
        failures.push(
          prefix(
            `forbidden heading decoration on ${decoratedHeading.text || "heading"}`,
          ),
        );
      }
      checks += 1;
      if (layout.autoplayVideos) {
        failures.push(prefix(`${layout.autoplayVideos} autoplay video(s)`));
      }
      checks += 1;
      if (layout.infiniteAnimations) {
        failures.push(
          prefix(`${layout.infiniteAnimations} infinite animation(s)`),
        );
      }

      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      const blockingViolations = axe.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact || ""),
      );
      checks += 1;
      for (const violation of blockingViolations) {
        failures.push(
          prefix(
            `axe ${violation.impact} ${violation.id}: ${violation.nodes
              .slice(0, 3)
              .map(
                (node) =>
                  `${node.target.join(" ")} (${node.failureSummary || node.html})`,
              )
              .join(", ")}`,
          ),
        );
      }
      checks += 1;
      for (const error of runtimeErrors) {
        failures.push(prefix(`console: ${error}`));
      }
      checks += 1;
      for (const error of staticAssetErrors) {
        failures.push(prefix(`asset: ${error}`));
      }
      checks += 1;
      for (const request of unexpectedApiRequests) {
        failures.push(prefix(`unexpected API request: ${request}`));
      }
    }

    await context.setOffline(true);
    checks += 1;
    try {
      await page
        .locator(".shc-auth-offline-banner")
        .waitFor({ state: "visible", timeout: 3_000 });
    } catch {
      failures.push(
        `auth-offline-shell ${viewport.width}x${viewport.height} ${theme.preference}: offline status is not visible`,
      );
    }
  } finally {
    await context.close();
  }
}

let browser;

try {
  const externalUrl = (process.env.SMART_HEALTH_WEB_URL || "").replace(
    /\/+$/,
    "",
  );
  const port = externalUrl ? null : await freePort();
  const siteUrl = externalUrl || `http://127.0.0.1:${port}`;
  if (!externalUrl) {
    startVite(port);
    await waitForUrl(siteUrl);
  }

  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    for (const theme of themes) {
      await runCase(browser, siteUrl, viewport, theme);
    }
  }
} finally {
  if (browser) await browser.close();
  await Promise.all(children.map((child) => stopChild(child)));
}

if (failures.length) {
  console.error(`Auth browser smoke failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Auth browser smoke passed (${checks} checks; ${authRoutes.length} RouteContract routes x ${viewports.length} viewports x ${themes.length} themes).`,
  );
}
