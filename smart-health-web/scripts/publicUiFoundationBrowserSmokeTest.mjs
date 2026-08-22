/* global document, getComputedStyle, innerWidth, window */

import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { routeContracts } from "../src/app/contracts/route-contract.ts";
import { resolveBrowserSmokeRuntime } from "./browserSmokeRuntime.mjs";

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
  { preference: "light", colorScheme: "light", resolved: "light" },
  { preference: "dark", colorScheme: "dark", resolved: "dark" },
  { preference: "system", colorScheme: "dark", resolved: "dark" },
];

function readFilter(name) {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length) ||
    process.env[`SHCARE_PUBLIC_UI_${name.toUpperCase()}`] ||
    ""
  ).trim();
}

const routeFilter = readFilter("route");
const viewportFilter = readFilter("viewport");
const themeFilter = readFilter("theme");
const browserRuntime = resolveBrowserSmokeRuntime(
  readFilter("browser") || "chromium",
);
const publicRoutes = routeContracts.filter(
  (route) =>
    route.surface === "public" &&
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

if (!publicRoutes.length || !viewports.length || !themes.length) {
  throw new Error(
    `Public UI filters selected no cases: route=${routeFilter || "*"}, viewport=${viewportFilter || "*"}, theme=${themeFilter || "*"}.`,
  );
}

function routePath(route) {
  return route.id === "public.not-found.catch-all"
    ? "/kiem-tra-trang-khong-ton-tai"
    : route.path;
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
      '.shc-public-layout[data-shcare-public-foundation="v1"]',
    );
    const main = document.querySelector("#shcare-public-main");
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
          ".shc-header",
          ".shc-dropdown",
          ".shc-mobile-menu",
          ".shc-preview",
          ".shc-public-card",
          ".shc-proof-card",
          ".shc-workflow-step",
          ".shc-operating-card",
          ".shc-handoff-panel",
          ".shc-role-row",
          ".shc-cta-card",
          ".shc-page-hero",
          ".shc-product-card",
          ".shc-flow-panel",
          ".shc-flow-list article",
          ".shc-plan",
          ".shc-faq-list article",
          ".shc-contact-form",
          ".shc-contact-aside",
          ".shc-success-card",
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
    window.localStorage.setItem("shc-public-motion", "reduced");
  }, theme.preference);
  const page = await context.newPage();
  const runtimeErrors = [];
  const staticAssetErrors = [];
  const unauthorizedApiRequests = [];

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
    unauthorizedApiRequests.push(
      `${route.request().method()} ${route.request().url()}`,
    );
    await route.fulfill({
      status: 503,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        code: "PUBLIC_UI_UNEXPECTED_API",
        message: "Public route browser proof does not authorize API requests.",
        requestId: "public-ui-foundation",
      }),
    });
  });

  try {
    for (const route of publicRoutes) {
      runtimeErrors.length = 0;
      staticAssetErrors.length = 0;
      unauthorizedApiRequests.length = 0;
      const pathName = routePath(route);
      await page.goto(`${siteUrl}${pathName}`, {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
      await page
        .locator(
          '.shc-public-layout[data-shcare-public-foundation="v1"] #shcare-public-main',
        )
        .waitFor({ state: "visible" });

      const layout = await inspectRoute(page);
      const check = (condition, message) => {
        checks += 1;
        if (!condition) {
          failures.push(describeFailure(route, viewport, theme, message));
        }
      };

      check(layout.shell, "canonical Public shell is missing");
      check(layout.mainVisible, "Public main is not visible");
      check(
        layout.h1Count === 1,
        `expected one visible h1, found ${layout.h1Count}`,
      );
      check(
        layout.theme === theme.preference,
        `theme=${layout.theme || "missing"}`,
      );
      check(
        layout.resolvedTheme === theme.resolved,
        `resolvedTheme=${layout.resolvedTheme || "missing"}`,
      );
      check(
        layout.colorScheme.includes(theme.resolved),
        `computed color-scheme=${layout.colorScheme}`,
      );
      check(layout.overflow <= 1, `horizontal overflow ${layout.overflow}px`);
      check(
        layout.tinyTargets.length === 0,
        `targets below 44px: ${layout.tinyTargets.slice(0, 8).join(", ")}`,
      );
      check(
        layout.visualSurfaces.every(
          (surface) =>
            (!surface.backdrop || surface.backdrop === "none") &&
            (!surface.filter || surface.filter === "none"),
        ),
        `glass/filter remained: ${layout.visualSurfaces
          .filter(
            (surface) =>
              (surface.backdrop && surface.backdrop !== "none") ||
              (surface.filter && surface.filter !== "none"),
          )
          .slice(0, 5)
          .map(
            (surface) =>
              `${surface.className}: ${surface.backdrop}/${surface.filter}`,
          )
          .join(", ")}`,
      );
      check(
        layout.decoratedHeadings.every(
          (heading) =>
            heading.backgroundClip !== "text" &&
            heading.webkitTextFillColor !== "transparent" &&
            heading.textShadow === "none" &&
            heading.filter === "none",
        ),
        `decorated heading remained: ${layout.decoratedHeadings
          .filter(
            (heading) =>
              heading.backgroundClip === "text" ||
              heading.webkitTextFillColor === "transparent" ||
              heading.textShadow !== "none" ||
              heading.filter !== "none",
          )
          .slice(0, 5)
          .map((heading) => heading.text)
          .join(", ")}`,
      );
      check(layout.autoplayVideos === 0, "autoplay hero media remained");
      check(
        layout.infiniteAnimations === 0,
        "infinite decorative animation remained",
      );

      if (
        route.id === "public.not-found.catch-all" ||
        route.id === "public.not-found"
      ) {
        check(
          (await page.locator('[data-state="not-found"]').count()) === 1,
          "404 state is not rendered inside the Public shell",
        );
      }
      if (route.id === "public.maintenance") {
        check(
          (await page.locator('[data-state="maintenance"]').count()) === 1,
          "maintenance state is not rendered inside the Public shell",
        );
      }

      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      const blockingViolations = axe.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact || ""),
      );
      check(
        blockingViolations.length === 0,
        `axe serious/critical ${blockingViolations
          .map(
            (violation) =>
              `${violation.id}(${violation.nodes
                .slice(0, 3)
                .map(
                  (node) =>
                    `${node.target.join(" ")}: ${node.failureSummary || node.html}`,
                )
                .join(" | ")})`,
          )
          .join(", ")}`,
      );
      check(
        runtimeErrors.length === 0,
        `console/page errors ${runtimeErrors.join(" | ")}`,
      );
      check(
        staticAssetErrors.length === 0,
        `static asset failures ${staticAssetErrors.join(" | ")}`,
      );
      check(
        unauthorizedApiRequests.length === 0,
        `unexpected API requests ${unauthorizedApiRequests.join(" | ")}`,
      );
    }
  } finally {
    await context.close();
  }
}

let browser;
let vite;
try {
  const externalUrl = (process.env.SMART_HEALTH_WEB_URL || "").replace(
    /\/+$/,
    "",
  );
  let siteUrl = externalUrl;
  if (!siteUrl) {
    const port = await freePort();
    vite = startVite(port);
    siteUrl = `http://127.0.0.1:${port}`;
    await waitForUrl(siteUrl);
  }
  browser = await browserRuntime.browserType.launch({ headless: true });
  for (const viewport of viewports) {
    for (const theme of themes) {
      await runCase(browser, siteUrl, viewport, theme);
    }
  }
} catch (error) {
  failures.push(
    error instanceof Error ? error.stack || error.message : String(error),
  );
} finally {
  if (browser) await browser.close();
  if (vite) await stopChild(vite);
  await Promise.all(children.map((child) => stopChild(child)));
}

if (failures.length) {
  console.error(
    `Public UI foundation browser smoke failed (${failures.length}/${checks} checks):`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Public UI foundation browser smoke passed on ${browserRuntime.name} (${checks} checks; ${publicRoutes.length} RouteContract routes x ${viewports.length} viewports x ${themes.length} themes).`,
  );
}
