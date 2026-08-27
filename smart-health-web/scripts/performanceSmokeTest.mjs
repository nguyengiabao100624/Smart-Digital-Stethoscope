/* global document, requestAnimationFrame, window */

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import {
  assertWebVitals,
  DEFAULT_WEB_VITAL_BUDGETS,
  installPerformanceVitalsObserver,
} from "./performanceVitals.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const viteEntry = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");

const configuredSiteUrl = (
  process.env.SMART_HEALTH_WEB_URL || "https://shcare.web.app"
).replace(/\/+$/, "");
const credentialsPath =
  process.env.SMOKE_CREDENTIALS_FILE ||
  path.join(
    workspaceRoot,
    "smart-health-embedded",
    "web-monitor",
    ".test-data",
    "production-role-smoke-credentials.json",
  );
const accountKey = process.env.SMOKE_ACCOUNT_KEY || "workspace";
const performanceHeaded =
  process.env.SMART_HEALTH_PERFORMANCE_HEADED === "1";

function readBoundedNumber(name, fallback, minimum, maximum) {
  const rawValue = process.env[name];
  const value = rawValue === undefined ? fallback : Number(rawValue);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be a finite number between ${minimum} and ${maximum}; received ${rawValue}`,
    );
  }
  return value;
}

function resolveMode() {
  const argumentsSet = new Set(process.argv.slice(2));
  const configuredScope = (
    process.env.SMART_HEALTH_PERFORMANCE_SCOPE || "full"
  ).toLowerCase();
  if (!new Set(["full", "public"]).has(configuredScope)) {
    throw new Error(
      `SMART_HEALTH_PERFORMANCE_SCOPE must be full or public; received ${configuredScope}`,
    );
  }

  const localPublic =
    argumentsSet.has("--local-public") ||
    process.env.SMART_HEALTH_PERFORMANCE_LOCAL_PUBLIC === "1";
  const publicOnly =
    localPublic ||
    argumentsSet.has("--public-only") ||
    configuredScope === "public";

  return {
    environment: localPublic ? "local-production-preview" : "configured-url",
    localPublic,
    scope: publicOnly ? "public" : "full",
  };
}

const routeBudgets = {
  public: {
    loadMs: readBoundedNumber(
      "SMART_HEALTH_PUBLIC_LOAD_BUDGET_MS",
      7_000,
      1,
      120_000,
    ),
    transferBytes: readBoundedNumber(
      "SMART_HEALTH_PUBLIC_TRANSFER_BUDGET_BYTES",
      4_500_000,
      1,
      100_000_000,
    ),
    scriptBytes: readBoundedNumber(
      "SMART_HEALTH_PUBLIC_SCRIPT_BUDGET_BYTES",
      1_700_000,
      1,
      100_000_000,
    ),
  },
  portal: {
    loadMs: readBoundedNumber(
      "SMART_HEALTH_PORTAL_LOAD_BUDGET_MS",
      9_000,
      1,
      120_000,
    ),
    transferBytes: readBoundedNumber(
      "SMART_HEALTH_PORTAL_TRANSFER_BUDGET_BYTES",
      6_000_000,
      1,
      100_000_000,
    ),
    scriptBytes: readBoundedNumber(
      "SMART_HEALTH_PORTAL_SCRIPT_BUDGET_BYTES",
      2_400_000,
      1,
      100_000_000,
    ),
  },
};

const webVitalBudgets = {
  lcpMs: readBoundedNumber(
    "SMART_HEALTH_LCP_BUDGET_MS",
    DEFAULT_WEB_VITAL_BUDGETS.lcpMs,
    1,
    60_000,
  ),
  inpMs: readBoundedNumber(
    "SMART_HEALTH_INP_BUDGET_MS",
    DEFAULT_WEB_VITAL_BUDGETS.inpMs,
    1,
    10_000,
  ),
  cls: readBoundedNumber(
    "SMART_HEALTH_CLS_BUDGET",
    DEFAULT_WEB_VITAL_BUDGETS.cls,
    0,
    1,
  ),
};

function readSmokeAccount() {
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Missing smoke credentials file: ${credentialsPath}. Run backend smoke:production-roles first.`,
    );
  }
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const account = (credentials.accounts || []).find(
    (item) => item.key === accountKey,
  );
  if (!account?.email || !account?.password) {
    throw new Error(
      `Smoke credentials file is missing the ${accountKey} account.`,
    );
  }
  return account;
}

function sanitizeConsoleText(value) {
  return String(value || "")
    .replace(/password=[^&\s]+/gi, "password=[redacted]")
    .replace(/token=[^&\s]+/gi, "token=[redacted]")
    .replace(/key=[^&\s]+/gi, "key=[redacted]");
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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function startLocalPublicServer() {
  const buildOutput = [];
  await new Promise((resolve, reject) => {
    const build = spawn(
      process.execPath,
      [viteEntry, "build", "--config", "vite.firebase.config.ts"],
      {
        cwd: repoRoot,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          VITE_AUTH_MODE: "production",
        },
      },
    );
    const capture = (chunk) => {
      buildOutput.push(String(chunk));
      if (buildOutput.length > 120) buildOutput.shift();
    };
    build.stdout.on("data", capture);
    build.stderr.on("data", capture);
    build.once("error", reject);
    const timeout = setTimeout(() => {
      build.kill();
      reject(new Error("Local production build exceeded 60000ms"));
    }, 60_000);
    build.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Local production build exited with code ${code}: ${buildOutput.join("").slice(-2_000)}`,
          ),
        );
      }
    });
  });

  const port = await freePort();
  const output = [];
  const child = spawn(
    process.execPath,
    [
      viteEntry,
      "preview",
      "--config",
      "vite.firebase.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        VITE_AUTH_MODE: "production",
      },
    },
  );
  const capture = (chunk) => {
    output.push(String(chunk));
    if (output.length > 80) output.shift();
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);

  const siteUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Local Vite exited with code ${child.exitCode}: ${output.join("").slice(-2_000)}`,
      );
    }
    try {
      const response = await fetch(siteUrl, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return { child, siteUrl };
    } catch {
      // The bounded readiness loop reports the captured Vite output on timeout.
    }
    await delay(100);
  }

  child.kill();
  throw new Error(
    `Local Vite did not become ready within 20000ms: ${output.join("").slice(-2_000)}`,
  );
}

async function waitSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => undefined);
  await page
    .waitForFunction(
      () => (document.body?.innerText?.trim().length || 0) > 120,
      null,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(500);
}

async function waitForPresentedFrame(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          // rAF runs before paint. Resolve in the next task so Chromium has
          // actually presented the state change before another interaction.
          setTimeout(resolve, 0);
        });
      }),
  );
}

async function toggleAndRestore(page, configuration, label) {
  const control = page.locator(configuration.controlSelector).first();
  if (!(await control.isVisible()) || !(await control.isEnabled())) {
    throw new Error(
      `${label}: meaningful interaction control is unavailable (${configuration.controlSelector})`,
    );
  }

  const state = page.locator(configuration.stateSelector).first();
  const before = await state.getAttribute(configuration.stateAttribute);
  if (before === null) {
    throw new Error(
      `${label}: interaction state ${configuration.stateAttribute} is missing on ${configuration.stateSelector}`,
    );
  }

  await control.click();
  await page.waitForFunction(
    ({ attribute, beforeValue, selector }) =>
      document.querySelector(selector)?.getAttribute(attribute) !== beforeValue,
    {
      attribute: configuration.stateAttribute,
      beforeValue: before,
      selector: configuration.stateSelector,
    },
    { timeout: 5_000 },
  );
  const toggled = await state.getAttribute(configuration.stateAttribute);

  // Treat toggle and restore as two real user interactions. Without a paint
  // boundary Chromium can coalesce both synthetic clicks into one interaction
  // and charge the deliberate restore delay to INP.
  await waitForPresentedFrame(page);

  await control.click();
  await page.waitForFunction(
    ({ attribute, beforeValue, selector }) =>
      document.querySelector(selector)?.getAttribute(attribute) === beforeValue,
    {
      attribute: configuration.stateAttribute,
      beforeValue: before,
      selector: configuration.stateSelector,
    },
    { timeout: 5_000 },
  );
  await waitForPresentedFrame(page);

  return {
    control: configuration.controlSelector,
    state: configuration.stateAttribute,
    before,
    toggled,
    restored: true,
  };
}

async function navigateAndReturn(page, label) {
  const control = page
    .locator('.shc-hero-actions a[href="/san-pham"]')
    .first();
  if (!(await control.isVisible())) {
    throw new Error(`${label}: public navigation interaction is unavailable`);
  }

  const originalUrl = new URL(page.url());
  const destination = await control.getAttribute("href");
  if (!destination) {
    throw new Error(`${label}: public navigation interaction has no href`);
  }

  await control.click();
  await page.waitForURL((url) => url.pathname !== originalUrl.pathname, {
    timeout: 5_000,
  });
  await waitForPresentedFrame(page);
  const navigatedPath = new URL(page.url()).pathname;

  await page.goBack();
  await page.waitForURL((url) => url.pathname === originalUrl.pathname, {
    timeout: 5_000,
  });
  await waitForPresentedFrame(page);

  return {
    control: '.shc-hero-actions a[href="/san-pham"]',
    destination,
    navigatedPath,
    restored: true,
  };
}

async function exerciseMeaningfulInteraction(page, label, group) {
  const pathname = new URL(page.url()).pathname;
  if (group === "portal") {
    return toggleAndRestore(
      page,
      {
        controlSelector: "#portal-user-menu-trigger",
        stateSelector: "#portal-user-menu-trigger",
        stateAttribute: "aria-expanded",
      },
      label,
    );
  }
  if (pathname === "/login" || pathname === "/dang-nhap") {
    return toggleAndRestore(
      page,
      {
        controlSelector: ".shc-auth-inline-action",
        stateSelector: "#login-password",
        stateAttribute: "type",
      },
      label,
    );
  }
  return navigateAndReturn(page, label);
}

async function collectMetrics(page, label, group, options = {}) {
  const resourceBudgetEnforced = options.resourceBudgetEnforced !== false;
  const interaction = await exerciseMeaningfulInteraction(page, label, group);
  const measured = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const transferBytes = resources.reduce(
      (sum, item) => sum + Number(item.transferSize || 0),
      0,
    );
    const encodedBytes = resources.reduce(
      (sum, item) => sum + Number(item.encodedBodySize || 0),
      0,
    );
    const scriptBytes = resources
      .filter(
        (item) =>
          item.initiatorType === "script" ||
          /\.mjs|\.js($|\?)/i.test(item.name),
      )
      .reduce(
        (sum, item) =>
          sum + Number(item.transferSize || item.encodedBodySize || 0),
        0,
      );
    const cssBytes = resources
      .filter(
        (item) =>
          item.initiatorType === "link" || /\.css($|\?)/i.test(item.name),
      )
      .reduce(
        (sum, item) =>
          sum + Number(item.transferSize || item.encodedBodySize || 0),
        0,
      );
    const imageBytes = resources
      .filter(
        (item) =>
          item.initiatorType === "img" ||
          /\.(png|jpe?g|webp|gif|svg|mp4)($|\?)/i.test(item.name),
      )
      .reduce(
        (sum, item) =>
          sum + Number(item.transferSize || item.encodedBodySize || 0),
        0,
      );
    const largestResources = resources
      .map((item) => ({
        name: new URL(item.name, window.location.href).pathname,
        transferBytes: Number(item.transferSize || 0),
        encodedBytes: Number(item.encodedBodySize || 0),
      }))
      .sort(
        (left, right) =>
          Math.max(right.transferBytes, right.encodedBytes) -
          Math.max(left.transferBytes, left.encodedBytes),
      )
      .slice(0, 6);

    return {
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd || 0),
      loadMs: Math.round(nav?.loadEventEnd || nav?.duration || 0),
      resourceCount: resources.length,
      transferBytes,
      encodedBytes,
      scriptBytes,
      cssBytes,
      imageBytes,
      largestResources,
      bodyTextLength: document.body?.innerText?.trim().length || 0,
      webVitals: globalThis.__shcarePerformanceVitals?.snapshot() || null,
    };
  });

  const budget = routeBudgets[group];
  if (measured.bodyTextLength < 120) {
    throw new Error(
      `${label}: page rendered too little text (${measured.bodyTextLength} chars)`,
    );
  }
  if (resourceBudgetEnforced && measured.loadMs > budget.loadMs) {
    throw new Error(
      `${label}: load ${measured.loadMs}ms exceeds budget ${budget.loadMs}ms`,
    );
  }
  if (resourceBudgetEnforced && measured.transferBytes > budget.transferBytes) {
    throw new Error(
      `${label}: transfer ${measured.transferBytes} bytes exceeds budget ${budget.transferBytes}; ` +
        `largest=${JSON.stringify(measured.largestResources)}`,
    );
  }
  if (resourceBudgetEnforced && measured.scriptBytes > budget.scriptBytes) {
    throw new Error(
      `${label}: script transfer ${measured.scriptBytes} bytes exceeds budget ${budget.scriptBytes}`,
    );
  }
  assertWebVitals(label, measured.webVitals, webVitalBudgets);

  return {
    label,
    group,
    path: new URL(page.url()).pathname,
    interaction,
    resourceBudgetEnforced,
    ...measured,
  };
}

async function visitAndMeasure(
  page,
  siteUrl,
  pathname,
  label,
  group = "public",
  options = {},
) {
  await page.goto(`${siteUrl}${pathname}?perf=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  return collectMetrics(page, label, group, options);
}

async function main() {
  const mode = resolveMode();
  let localServer = null;
  let browser = null;
  let context = null;
  let screencastSession = null;

  try {
    localServer = mode.localPublic ? await startLocalPublicServer() : null;
    const siteUrl = localServer?.siteUrl || configuredSiteUrl;
    const account = mode.scope === "full" ? readSmokeAccount() : null;
    browser = await chromium.launch({
      headless: !performanceHeaded,
      args: [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    screencastSession = await context.newCDPSession(page);
    screencastSession.on("Page.screencastFrame", ({ sessionId }) => {
      void screencastSession
        ?.send("Page.screencastFrameAck", { sessionId })
        .catch(() => undefined);
    });
    await screencastSession.send("Page.startScreencast", {
      format: "jpeg",
      quality: 10,
      maxWidth: 1440,
      maxHeight: 900,
      everyNthFrame: 1,
    });
    await page.addInitScript(installPerformanceVitalsObserver);
    const consoleErrors = [];
    const pageErrors = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(sanitizeConsoleText(message.text()));
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(sanitizeConsoleText(error.message));
    });

    const results = [];
    results.push(
      await visitAndMeasure(page, siteUrl, "/", "public home", "public", {
        resourceBudgetEnforced: true,
      }),
    );

    if (mode.scope === "full") {
      results.push(
        await visitAndMeasure(
          page,
          siteUrl,
          "/login",
          "portal login",
          "public",
        ),
      );

      await page.locator("#login-email").fill(account.email);
      await page.locator("#login-password").fill(account.password);
      await Promise.all([
        page.waitForURL("**/portal**", { timeout: 30_000 }),
        page.locator('button[type="submit"]').click(),
      ]);
      await waitSettled(page);
      results.push(
        await collectMetrics(page, "portal landing after login", "portal"),
      );

      for (const [pathname, label] of [
        ["/portal/patients", "portal patients"],
        ["/portal/appointments", "portal appointments"],
        ["/portal/records", "portal records"],
        ["/portal/devices", "portal devices"],
        ["/portal/settings", "portal settings"],
      ]) {
        results.push(
          await visitAndMeasure(page, siteUrl, pathname, label, "portal"),
        );
      }
    }

    if (consoleErrors.length || pageErrors.length) {
      throw new Error(
        `Performance smoke found browser errors: ${JSON.stringify({
          consoleErrors: consoleErrors.slice(0, 5),
          pageErrors: pageErrors.slice(0, 5),
        })}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          siteUrl,
          scope: mode.scope,
          environment: mode.environment,
          browserSurface: performanceHeaded ? "headed" : "headless",
          accountKey: mode.scope === "full" ? accountKey : null,
          budgets: routeBudgets,
          webVitalBudgets,
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await screencastSession
      ?.send("Page.stopScreencast")
      .catch(() => undefined);
    await screencastSession?.detach().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    localServer?.child.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
