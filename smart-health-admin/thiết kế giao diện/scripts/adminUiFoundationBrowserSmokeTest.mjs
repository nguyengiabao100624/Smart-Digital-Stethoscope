/* global document, getComputedStyle, innerWidth, localStorage, window */

import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";
import { getAdminSmokeContracts } from "../src/contracts/admin-route-contract.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(adminRoot, "..", "..");
const backendRoot = path.join(workspaceRoot, "smart-health-embedded", "web-monitor");
const backendEntry = path.join(backendRoot, "server.js");
const viteEntry = path.join(adminRoot, "node_modules", "vite", "bin", "vite.js");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-admin-ui-foundation-"));
const children = [];
const failures = [];
let routeChecks = 0;
let commandPaletteChecks = 0;
let offlineChecks = 0;
let accountContractChecks = 0;
let representativeStateChecks = 0;
let directPermissionChecks = 0;
let drawerInteractionChecks = 0;

const adminRoutes = getAdminSmokeContracts("admin");
const viewports = [
  { name: "phone-narrow", width: 360, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-wide", width: 1024, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
];
const themes = [
  { preference: "light", colorScheme: "light", resolved: "light" },
  { preference: "dark", colorScheme: "dark", resolved: "dark" },
  { preference: "system", colorScheme: "dark", resolved: "dark" },
];
const browserTypes = { chromium, firefox, webkit };

function readOption(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || "";
}

function selectMany(items, option, matches, label) {
  if (!option) return items;
  const requested = option
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const selected = items.filter((item) => requested.some((value) => matches(item, value)));
  const unknown = requested.filter((value) => !items.some((item) => matches(item, value)));
  if (!requested.length || unknown.length) {
    throw new Error(
      `Unknown --${label}=${unknown.join(",") || option}. Available: ${items.map((item) => item.name || item.preference || item.smokeId).join(", ")}`,
    );
  }
  return selected;
}

const routeOption = readOption("route");
const viewportOption = readOption("viewport");
const themeOption = readOption("theme");
const browserOption = readOption("browser") || "chromium";
const browserType = browserTypes[browserOption];
if (!browserType) {
  throw new Error(
    `Unknown --browser=${browserOption}. Available: ${Object.keys(browserTypes).join(", ")}`,
  );
}
const selectedRoutes = selectMany(
  adminRoutes,
  routeOption,
  (route, option) =>
    route.path === option ||
    route.id === option ||
    route.smokeId === option ||
    route.path.replace(/^\//, "") === option,
  "route",
);
const selectedViewports = selectMany(
  viewports,
  viewportOption,
  (viewport, option) => viewport.name === option || String(viewport.width) === option,
  "viewport",
);
const selectedThemes = selectMany(
  themes,
  themeOption,
  (theme, option) => theme.preference === option,
  "theme",
);
const shouldRunRepresentativeProofs = selectedRoutes.some((route) => route.path === "/clinics");

function getFreePort() {
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

function startNode(label, args, options) {
  const output = [];
  const child = spawn(process.execPath, args, {
    ...options,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk) => {
    output.push(String(chunk));
    if (output.length > 100) output.shift();
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.once("exit", (code) => {
    if (code && !child.killed) {
      failures.push(`${label} exited early with code ${code}: ${output.join("").slice(-2500)}`);
    }
  });
  children.push(child);
  return { child, output };
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function waitForUrl(url, label, timeoutMs = 30_000) {
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
  throw new Error(`${label} did not become ready: ${lastError}`);
}

function describeFailure(route, viewport, theme, message) {
  return `${route.smokeId} ${viewport.name} ${viewport.width}x${viewport.height} ${theme.preference}: ${message}`;
}

function routeUrl(siteOrigin, routePath) {
  const url = new URL(routePath, siteOrigin);
  url.searchParams.set("smoke", `admin-ui-${Date.now().toString(36)}`);
  return url.toString();
}

async function registerAdmin(apiOrigin) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const credentials = {
    email: `admin-ui-foundation-${suffix}@smarthealth.test`,
    password: "BrowserSmoke-12345678",
  };
  const response = await fetch(`${apiOrigin}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "admin",
      name: "Shcare Admin UI Browser Smoke",
      ...credentials,
    }),
  });
  if (response.status !== 201) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Unable to register browser smoke admin: HTTP ${response.status} ${body.slice(0, 500)}`,
    );
  }
  const payload = await response.json();
  if (!payload?.token || payload?.user?.role !== "admin") {
    throw new Error("Backend registration did not return an authenticated Platform Admin session.");
  }
  return { token: payload.token };
}

async function registerLimitedPrincipal(apiOrigin) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await fetch(`${apiOrigin}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "patient",
      name: "Shcare Limited Direct URL Smoke",
      email: `limited-direct-url-${suffix}@smarthealth.test`,
      password: "BrowserSmoke-12345678",
    }),
  });
  if (response.status !== 201) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Unable to register limited browser principal: HTTP ${response.status} ${body.slice(0, 500)}`,
    );
  }
  const payload = await response.json();
  if (
    !payload?.token ||
    payload?.user?.role !== "patient" ||
    payload?.user?.allowedSurfaces?.includes("admin")
  ) {
    throw new Error("Backend did not return a genuinely limited non-Admin principal.");
  }
  return { token: payload.token };
}

function attachDiagnostics(page) {
  const diagnostics = {
    runtimeErrors: [],
    responseErrors: [],
    expectedOfflineProbe: false,
  };
  page.on("console", (message) => {
    if (message.type() === "error" && !diagnostics.expectedOfflineProbe) {
      diagnostics.runtimeErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (!diagnostics.expectedOfflineProbe) diagnostics.runtimeErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    if (diagnostics.expectedOfflineProbe) return;
    const errorText = request.failure()?.errorText || "request failed";
    if (errorText === "net::ERR_ABORTED") return;
    diagnostics.responseErrors.push(`${request.method()} ${request.url()} ${errorText}`);
  });
  page.on("response", (response) => {
    if (diagnostics.expectedOfflineProbe || response.status() < 400) return;
    const resourceType = response.request().resourceType();
    if (
      ["document", "stylesheet", "script", "font", "image", "fetch", "xhr"].includes(resourceType)
    ) {
      diagnostics.responseErrors.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });
  return diagnostics;
}

function clearDiagnostics(diagnostics) {
  diagnostics.runtimeErrors.length = 0;
  diagnostics.responseErrors.length = 0;
}

function responseMatches(response, pathname, method) {
  const url = new URL(response.url());
  return (
    url.pathname === pathname &&
    response.request().method() === method &&
    response.status() >= 200 &&
    response.status() < 300
  );
}

function waitForAccountLoadContracts(page) {
  return Promise.all([
    page.waitForResponse((response) => responseMatches(response, "/api/me/2fa", "GET"), {
      timeout: 30_000,
    }),
    page.waitForResponse(
      (response) => responseMatches(response, "/api/me/notification-preferences", "GET"),
      { timeout: 30_000 },
    ),
  ]);
}

function assertOwnedPreferenceReceipt(payload, expectedUserId, expectedValue) {
  return Boolean(
    payload &&
    payload.userId === expectedUserId &&
    payload.ownership?.kind === "self" &&
    payload.ownership?.userId === expectedUserId &&
    payload.preferences?.doctorRequests === expectedValue &&
    typeof payload.updatedAt === "string" &&
    payload.updatedAt.length > 0,
  );
}

async function waitForEnabled(locator, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await locator.isEnabled().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Account notification preference control did not become enabled.");
}

async function proveAccountBackendContracts(page, loadResponses) {
  const [twoFactorResponse, preferencesResponse] = await loadResponses;
  const twoFactor = await twoFactorResponse.json();
  const initialPreferences = await preferencesResponse.json();
  if (
    typeof twoFactor?.availability?.available !== "boolean" ||
    typeof twoFactor?.availability?.status !== "string" ||
    !Array.isArray(twoFactor?.availability?.methods) ||
    typeof twoFactor?.twoFactor?.enabled !== "boolean" ||
    typeof twoFactor?.twoFactor?.enrollmentPending !== "boolean"
  ) {
    throw new Error("GET /api/me/2fa returned an invalid availability/status contract.");
  }
  const accountUserId = String(initialPreferences?.userId || "");
  const originalValue = initialPreferences?.preferences?.doctorRequests;
  if (
    !accountUserId ||
    typeof originalValue !== "boolean" ||
    !assertOwnedPreferenceReceipt(initialPreferences, accountUserId, originalValue)
  ) {
    throw new Error(
      "GET /api/me/notification-preferences did not return a self-owned canonical receipt.",
    );
  }

  await page.getByRole("tab", { name: "Thông báo cá nhân" }).click();
  const preferenceSwitch = page.getByRole("switch", { name: "Bác sĩ mới đăng ký" });
  await preferenceSwitch.waitFor({ state: "visible", timeout: 15_000 });
  await waitForEnabled(preferenceSwitch);
  if ((await preferenceSwitch.isChecked()) !== originalValue) {
    throw new Error("Account notification switch did not render the backend GET value.");
  }

  const changedValue = !originalValue;
  const patchResponsePromise = page.waitForResponse(
    (response) => responseMatches(response, "/api/me/notification-preferences", "PATCH"),
    { timeout: 30_000 },
  );
  await preferenceSwitch.click();
  const patchResponse = await patchResponsePromise;
  const patchRequest = patchResponse.request();
  const patchBody = patchRequest.postDataJSON();
  const patchKeys = Object.keys(patchBody || {})
    .sort()
    .join(",");
  if (
    patchKeys !== "enabled,key" ||
    patchBody?.key !== "doctorRequests" ||
    patchBody?.enabled !== changedValue ||
    !patchRequest.headers()["idempotency-key"]
  ) {
    throw new Error("PATCH notification preference was not field-level and idempotent.");
  }
  const changedReceipt = await patchResponse.json();
  if (!assertOwnedPreferenceReceipt(changedReceipt, accountUserId, changedValue)) {
    throw new Error("PATCH notification preference receipt has wrong ownership or value.");
  }
  await page.waitForFunction(
    ({ accessibleName, expected }) => {
      const controls = Array.from(document.querySelectorAll('[role="switch"]'));
      const control = controls.find(
        (element) => element.getAttribute("aria-label") === accessibleName,
      );
      return control?.getAttribute("data-state") === (expected ? "checked" : "unchecked");
    },
    { accessibleName: "Bác sĩ mới đăng ký", expected: changedValue },
  );

  const cleanupResponsePromise = page.waitForResponse(
    (response) => responseMatches(response, "/api/me/notification-preferences", "PATCH"),
    { timeout: 30_000 },
  );
  await preferenceSwitch.click();
  const cleanupResponse = await cleanupResponsePromise;
  const cleanupReceipt = await cleanupResponse.json();
  if (!assertOwnedPreferenceReceipt(cleanupReceipt, accountUserId, originalValue)) {
    throw new Error("Notification preference cleanup did not restore the original backend value.");
  }
  await page.waitForFunction(
    ({ accessibleName, expected }) => {
      const controls = Array.from(document.querySelectorAll('[role="switch"]'));
      const control = controls.find(
        (element) => element.getAttribute("aria-label") === accessibleName,
      );
      return control?.getAttribute("data-state") === (expected ? "checked" : "unchecked");
    },
    { accessibleName: "Bác sĩ mới đăng ký", expected: originalValue },
  );
  accountContractChecks += 1;
}

async function openAuthenticatedShell(page, siteOrigin) {
  await page.goto(routeUrl(siteOrigin, "/"), { waitUntil: "domcontentloaded" });
  await page
    .locator("#admin-global-search, #admin-mobile-search")
    .filter({ visible: true })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}

async function waitForRoute(page, route) {
  await page.locator("#admin-main-content").waitFor({ state: "visible", timeout: 20_000 });
  await page
    .locator("#admin-global-search, #admin-mobile-search")
    .filter({ visible: true })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  await page
    .locator("#admin-main-content h1:visible")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(route.path === "/" ? 700 : 450);
}

async function inspectRoute(page, route, viewport, theme, diagnostics) {
  const evidence = await page.evaluate(() => {
    const root = document.documentElement;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const mainHeadings = Array.from(document.querySelectorAll("#admin-main-content h1")).filter(
      visible,
    );
    const brandMarks = Array.from(
      document.querySelectorAll('[aria-label^="Shcare"], [aria-label^="Smart Health"]'),
    ).filter(visible);
    const tinyTargets = Array.from(
      document.querySelectorAll(
        'button, input:not([type="hidden"]), select, textarea, [role="button"], a[href]',
      ),
    )
      .filter(visible)
      .filter((element) => {
        const style = getComputedStyle(element);
        if (element.classList.contains("sr-only") && !element.matches(":focus")) return false;
        if (element.tagName === "A" && style.display === "inline") return false;
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      })
      .slice(0, 20)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const name =
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent?.trim() ||
          element.id ||
          "(unnamed)";
        return `${element.tagName.toLowerCase()}[${Math.round(rect.width)}x${Math.round(rect.height)}] ${name.slice(0, 80)}`;
      });
    const demoVisuals = Array.from(document.querySelectorAll("*"))
      .filter(visible)
      .flatMap((element) => {
        const style = getComputedStyle(element);
        const problems = [];
        if (/(?:linear|radial|conic)-gradient/i.test(style.backgroundImage)) {
          problems.push("gradient background");
        }
        const backdropFilter = style.backdropFilter;
        const webkitBackdropFilter = style.getPropertyValue("-webkit-backdrop-filter");
        if (
          (backdropFilter && backdropFilter !== "none") ||
          (webkitBackdropFilter && webkitBackdropFilter !== "none")
        ) {
          problems.push("backdrop blur/filter");
        }
        if (style.animationIterationCount.split(",").some((value) => value.trim() === "infinite")) {
          problems.push("infinite animation");
        }
        if (
          style.backgroundClip === "text" ||
          style.getPropertyValue("-webkit-background-clip") === "text"
        ) {
          problems.push("gradient/text clipping");
        }
        return problems.map((problem) => {
          const identity =
            element.id ||
            element.getAttribute("data-testid") ||
            element.getAttribute("aria-label") ||
            element.className?.toString().slice(0, 100) ||
            element.tagName.toLowerCase();
          return `${problem}: ${identity}`;
        });
      })
      .slice(0, 20);
    const rootStyle = getComputedStyle(root);
    const overflowingElements = Array.from(document.querySelectorAll("body *"))
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      })
      .slice(0, 12)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const identity =
          element.id ||
          element.getAttribute("data-testid") ||
          element.getAttribute("aria-label") ||
          element.className?.toString().slice(0, 110) ||
          element.tagName.toLowerCase();
        return `${identity} [left=${Math.round(rect.left)}, right=${Math.round(rect.right)}, width=${Math.round(rect.width)}]`;
      });

    return {
      title: document.title,
      mainHeadingCount: mainHeadings.length,
      mainHeading: mainHeadings[0]?.textContent?.trim() || "",
      brandMarkCount: brandMarks.length,
      theme: root.dataset.theme || "",
      resolvedTheme: root.dataset.resolvedTheme || "",
      colorScheme: rootStyle.colorScheme,
      hasDarkClass: root.classList.contains("dark"),
      hasLightClass: root.classList.contains("light"),
      background: rootStyle.getPropertyValue("--background").trim(),
      overflow: root.scrollWidth - innerWidth,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      overflowingElements,
      tinyTargets,
      demoVisuals,
    };
  });

  const record = (message) => failures.push(describeFailure(route, viewport, theme, message));
  if (!evidence.title.includes("Shcare")) record(`document title is "${evidence.title}"`);
  if (evidence.mainHeadingCount !== 1) {
    record(`expected one visible main h1, found ${evidence.mainHeadingCount}`);
  }
  if (!evidence.mainHeading) record("main h1 has no accessible text");
  if (viewport.width >= 1024 && !evidence.brandMarkCount) {
    record("visible desktop Admin brand mark is missing");
  }
  if (evidence.theme !== theme.preference) {
    record(`theme=${evidence.theme || "missing"}, expected ${theme.preference}`);
  }
  if (evidence.resolvedTheme !== theme.resolved) {
    record(`resolvedTheme=${evidence.resolvedTheme || "missing"}, expected ${theme.resolved}`);
  }
  if (evidence.hasDarkClass !== (theme.resolved === "dark")) {
    record("dark class does not match the resolved theme");
  }
  if (evidence.hasLightClass !== (theme.resolved === "light")) {
    record("light class does not match the resolved theme");
  }
  if (!evidence.colorScheme.includes(theme.resolved)) {
    record(`color-scheme=${evidence.colorScheme || "missing"}`);
  }
  const expectedBackground = theme.resolved === "light" ? "#f5f7fa" : "oklch(0.129 0.042 264.695)";
  if (evidence.background !== expectedBackground) {
    record(
      `live background token drift (${evidence.background || "missing"}/${expectedBackground})`,
    );
  }
  if (evidence.overflow > 1) {
    record(
      `horizontal root overflow ${evidence.overflow}px; offenders: ${
        evidence.overflowingElements.join(", ") || "not resolved"
      }`,
    );
  }
  if (!evidence.reducedMotion) record("prefers-reduced-motion: reduce is not active");
  if (evidence.tinyTargets.length) {
    record(`targets below 44px: ${evidence.tinyTargets.join(", ")}`);
  }
  if (evidence.demoVisuals.length) {
    record(`demo visual treatment: ${evidence.demoVisuals.join(", ")}`);
  }

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  for (const violation of axe.violations.filter((item) =>
    ["serious", "critical"].includes(item.impact || ""),
  )) {
    record(
      `axe ${violation.impact} ${violation.id}: ${violation.nodes
        .slice(0, 3)
        .map(
          (node) =>
            `${node.target.join(" ")} | ${node.html.slice(0, 240)} | ${node.failureSummary || ""}`,
        )
        .join(", ")}`,
    );
  }
  for (const error of diagnostics.runtimeErrors.splice(0)) record(`console/pageerror: ${error}`);
  for (const error of diagnostics.responseErrors.splice(0)) record(`request/response: ${error}`);
  routeChecks += 1;
}

async function proveRepresentativeDrawer(page, viewport, theme) {
  const trigger = page.locator('button[aria-label^="Mở chi tiết thiết bị"]').first();
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.focus();
  if (!(await trigger.evaluate((element) => document.activeElement === element))) {
    throw new Error("Representative drawer trigger could not receive focus.");
  }
  await trigger.click();

  const drawer = page.getByRole("dialog", { name: /Chi tiết thiết bị/i });
  await drawer.waitFor({ state: "visible", timeout: 15_000 });
  const drawerSemantics = await drawer.evaluate((element) => ({
    role: element.getAttribute("role"),
    modal: element.getAttribute("aria-modal"),
    labelledBy: element.getAttribute("aria-labelledby"),
    containsFocus: element.contains(document.activeElement),
  }));
  if (
    drawerSemantics.role !== "dialog" ||
    drawerSemantics.modal !== "true" ||
    !drawerSemantics.labelledBy ||
    !drawerSemantics.containsFocus
  ) {
    throw new Error(
      `Representative drawer semantics/focus are invalid: ${JSON.stringify(drawerSemantics)}`,
    );
  }

  const focusables = drawer
    .locator(
      'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    .filter({ visible: true });
  const focusableCount = await focusables.count();
  if (focusableCount < 1) {
    throw new Error("Representative drawer has no keyboard-focusable control.");
  }

  await focusables.last().focus();
  await page.keyboard.press("Tab");
  if (!(await drawer.evaluate((element) => element.contains(document.activeElement)))) {
    throw new Error("Tab escaped the modal drawer after the last focusable control.");
  }
  await focusables.first().focus();
  await page.keyboard.press("Shift+Tab");
  if (!(await drawer.evaluate((element) => element.contains(document.activeElement)))) {
    throw new Error("Shift+Tab escaped the modal drawer before the first focusable control.");
  }

  const axe = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const severe = axe.violations.filter((item) =>
    ["serious", "critical"].includes(item.impact || ""),
  );
  if (severe.length) {
    throw new Error(
      `Representative drawer Axe failure: ${severe
        .map(
          (violation) =>
            `${violation.impact} ${violation.id}: ${violation.nodes
              .slice(0, 5)
              .map(
                (node) =>
                  `${node.target.join(" ")} | ${node.html.slice(0, 240)} | ${node.failureSummary || ""}`,
              )
              .join(" || ")}`,
        )
        .join(", ")}`,
    );
  }

  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden", timeout: 15_000 });
  await page.waitForFunction(
    (accessibleName) => {
      const element = document.querySelector(`button[aria-label="${accessibleName}"]`);
      return Boolean(element && document.activeElement === element);
    },
    await trigger.getAttribute("aria-label"),
  );
  drawerInteractionChecks += 1;

  const path = new URL(page.url()).pathname;
  if (path !== "/devices") {
    failures.push(
      describeFailure(
        { smokeId: "admin-drawer-interaction" },
        viewport,
        theme,
        `drawer interaction changed route to ${path}`,
      ),
    );
  }
}

async function proveCommandPalette(page, viewport, theme, diagnostics) {
  clearDiagnostics(diagnostics);
  const opener = page
    .locator("#admin-global-search, #admin-mobile-search")
    .filter({ visible: true })
    .first();
  await opener.click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  await dialog.locator("#admin-command-input").fill("thiet bi");
  const deviceCommand = dialog.locator("button").filter({ hasText: "/devices" }).first();
  await deviceCommand.waitFor({ state: "visible", timeout: 10_000 });
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/devices", { timeout: 20_000 }),
    deviceCommand.click(),
  ]);
  await waitForRoute(
    page,
    adminRoutes.find((route) => route.path === "/devices"),
  );
  if (await dialog.isVisible().catch(() => false)) {
    failures.push(
      describeFailure(
        { smokeId: "admin-command-palette" },
        viewport,
        theme,
        "dialog remains open after navigation",
      ),
    );
  }
  for (const error of diagnostics.runtimeErrors.splice(0)) {
    failures.push(
      describeFailure(
        { smokeId: "admin-command-palette" },
        viewport,
        theme,
        `console/pageerror: ${error}`,
      ),
    );
  }
  for (const error of diagnostics.responseErrors.splice(0)) {
    failures.push(
      describeFailure(
        { smokeId: "admin-command-palette" },
        viewport,
        theme,
        `request/response: ${error}`,
      ),
    );
  }
  commandPaletteChecks += 1;
}

async function proveOfflineState(context, page, viewport, theme, diagnostics) {
  clearDiagnostics(diagnostics);
  diagnostics.expectedOfflineProbe = true;
  try {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    const banner = page.locator('[data-testid="admin-offline-banner"]');
    await banner.waitFor({ state: "visible", timeout: 10_000 });
    const bannerText = (await banner.innerText()).trim();
    if (!bannerText || !/ngoại tuyến/i.test(bannerText)) {
      failures.push(
        describeFailure(
          { smokeId: "admin-offline-state" },
          viewport,
          theme,
          `offline banner copy is missing: ${bannerText}`,
        ),
      );
    }
    offlineChecks += 1;
  } finally {
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    diagnostics.expectedOfflineProbe = false;
    clearDiagnostics(diagnostics);
  }
  await page
    .locator('[data-testid="admin-offline-banner"]')
    .waitFor({ state: "hidden", timeout: 10_000 });
}

async function inspectRepresentativeState(page, label) {
  const evidence = await page.evaluate(() => {
    const root = document.documentElement;
    const tinyTargets = Array.from(
      document.querySelectorAll(
        'button, input:not([type="hidden"]), select, textarea, [role="button"], a[href]',
      ),
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          return false;
        }
        if (element.classList.contains("sr-only") && !element.matches(":focus")) return false;
        if (element.tagName === "A" && style.display === "inline") return false;
        return rect.width < 44 || rect.height < 44;
      })
      .slice(0, 12)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()}[${Math.round(rect.width)}x${Math.round(rect.height)}] ${
          element.getAttribute("aria-label") || element.textContent?.trim() || element.id
        }`;
      });
    return {
      overflow: root.scrollWidth - innerWidth,
      tinyTargets,
    };
  });
  if (evidence.overflow > 1) {
    throw new Error(`${label} state has ${evidence.overflow}px horizontal overflow.`);
  }
  if (evidence.tinyTargets.length) {
    throw new Error(`${label} state has targets below 44px: ${evidence.tinyTargets.join(", ")}`);
  }
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const severe = axe.violations.filter((item) =>
    ["serious", "critical"].includes(item.impact || ""),
  );
  if (severe.length) {
    throw new Error(
      `${label} state has Axe violations: ${severe
        .map((violation) => `${violation.impact} ${violation.id}`)
        .join(", ")}`,
    );
  }
}

async function proveRepresentativeRouteStates(browser, siteOrigin, session) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "vi-VN",
  });
  await context.addInitScript((token) => {
    localStorage.setItem("shcare-theme", "light");
    localStorage.setItem("smart_health_admin_token", token);
    localStorage.setItem("smart_health_token", token);
  }, session.token);
  const page = await context.newPage();
  let state = "loading";
  let releaseLoading;
  const loadingGate = new Promise((resolve) => {
    releaseLoading = resolve;
  });
  const observedStates = [];

  await page.route("**/api/admin/clinics**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/admin/clinics") {
      await route.continue();
      return;
    }
    observedStates.push(state);
    if (state === "loading") {
      await loadingGate;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "STATE_PROOF_UNAVAILABLE", message: "Deterministic state proof" },
        }),
      });
      return;
    }
    if (state === "empty") {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": siteOrigin,
          "access-control-expose-headers": "X-Total-Count, X-Page, X-Page-Limit, X-Page-Count",
          "x-total-count": "0",
          "x-page": "1",
          "x-page-limit": "20",
          "x-page-count": "0",
        },
        body: JSON.stringify({ clinics: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "CAPABILITY_DENIED", message: "Deterministic capability denial" },
      }),
    });
  });

  try {
    await page.goto(routeUrl(siteOrigin, "/clinics"), { waitUntil: "domcontentloaded" });
    await page
      .locator('[role="status"][aria-label="Đang tải workspace"]')
      .waitFor({ state: "visible", timeout: 20_000 });
    await inspectRepresentativeState(page, "loading");
    representativeStateChecks += 1;

    releaseLoading();
    await page
      .getByRole("heading", { name: "Không thể tải danh sách workspace", exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    const retry = page.getByRole("button", { name: "Thử lại", exact: true });
    await retry.waitFor({ state: "visible", timeout: 10_000 });
    await inspectRepresentativeState(page, "error/retry");
    representativeStateChecks += 2;

    state = "empty";
    const emptyResponsePromise = page.waitForResponse(
      (response) => responseMatches(response, "/api/admin/clinics", "GET"),
      { timeout: 20_000 },
    );
    await retry.click();
    const emptyResponse = await emptyResponsePromise;
    try {
      await page
        .getByRole("heading", { name: "Chưa có workspace phù hợp", exact: true })
        .waitFor({ state: "visible", timeout: 20_000 });
    } catch (error) {
      const body = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      throw new Error(
        `Empty state did not render after HTTP ${emptyResponse.status()}; observed=${observedStates.join(",")}; body=${body.replace(/\s+/g, " ").slice(0, 1200)}; ${error instanceof Error ? error.message : error}`,
      );
    }
    await inspectRepresentativeState(page, "empty");
    representativeStateChecks += 1;

    state = "forbidden";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", {
        name: "Bạn không có quyền xem danh sách workspace",
        exact: true,
      })
      .waitFor({ state: "visible", timeout: 20_000 });
    await inspectRepresentativeState(page, "backend permission denied");
    representativeStateChecks += 1;

    if (!["loading", "empty", "forbidden"].every((item) => observedStates.includes(item))) {
      throw new Error(
        `Representative route did not issue all deterministic requests: ${observedStates.join(",")}`,
      );
    }
  } finally {
    releaseLoading?.();
    await page.unrouteAll({ behavior: "wait" }).catch(() => undefined);
    await context.close();
  }
}

async function proveLimitedDirectUrlDenial(browser, siteOrigin, limitedSession) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "vi-VN",
  });
  await context.addInitScript((token) => {
    localStorage.setItem("shcare-theme", "light");
    localStorage.setItem("smart_health_admin_token", token);
    localStorage.setItem("smart_health_token", token);
  }, limitedSession.token);
  const page = await context.newPage();
  const protectedDataRequests = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/admin/clinics") protectedDataRequests.push(request.url());
  });
  try {
    await page.goto(routeUrl(siteOrigin, "/clinics"), { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Tài khoản không thuộc cổng này", exact: true })
      .waitFor({ state: "visible", timeout: 20_000 });
    if (new URL(page.url()).pathname !== "/clinics") {
      throw new Error(`Limited direct URL was rewritten to ${new URL(page.url()).pathname}.`);
    }
    if (protectedDataRequests.length) {
      throw new Error("Limited principal reached the protected workspace data request.");
    }
    if (
      await page
        .locator("#admin-main-content")
        .isVisible()
        .catch(() => false)
    ) {
      throw new Error("Limited principal reached the protected Admin route content.");
    }
    await inspectRepresentativeState(page, "limited direct URL denial");
    directPermissionChecks += 1;
  } finally {
    await context.close();
  }
}

async function runBrowser(siteOrigin, session, limitedSession) {
  const browser = await browserType.launch({ headless: true });
  try {
    for (const viewport of selectedViewports) {
      for (const theme of selectedThemes) {
        const context = await browser.newContext({
          viewport,
          colorScheme: theme.colorScheme,
          reducedMotion: "reduce",
          locale: "vi-VN",
        });
        await context.addInitScript(
          ({ preference, token }) => {
            localStorage.setItem("shcare-theme", preference);
            localStorage.setItem("smart_health_admin_token", token);
            localStorage.setItem("smart_health_token", token);
          },
          { preference: theme.preference, token: session.token },
        );
        const page = await context.newPage();
        const diagnostics = attachDiagnostics(page);
        try {
          await openAuthenticatedShell(page, siteOrigin);
          clearDiagnostics(diagnostics);

          for (const route of selectedRoutes) {
            clearDiagnostics(diagnostics);
            const accountLoadResponses =
              route.path === "/account" ? waitForAccountLoadContracts(page) : null;
            await page.goto(routeUrl(siteOrigin, route.path), {
              waitUntil: "domcontentloaded",
            });
            await waitForRoute(page, route);
            if (accountLoadResponses) {
              await proveAccountBackendContracts(page, accountLoadResponses);
            }
            if (route.path === "/devices") {
              await proveRepresentativeDrawer(page, viewport, theme);
            }
            await inspectRoute(page, route, viewport, theme, diagnostics);
          }

          await proveCommandPalette(page, viewport, theme, diagnostics);
          await proveOfflineState(context, page, viewport, theme, diagnostics);
        } catch (error) {
          failures.push(
            `${viewport.name} ${viewport.width}x${viewport.height} ${theme.preference}: ${
              error instanceof Error ? error.stack || error.message : String(error)
            }`,
          );
        } finally {
          await context.close();
        }
      }
    }
    if (shouldRunRepresentativeProofs) {
      await proveRepresentativeRouteStates(browser, siteOrigin, session);
      await proveLimitedDirectUrlDenial(browser, siteOrigin, limitedSession);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!fs.existsSync(backendEntry) || !fs.existsSync(viteEntry)) {
    throw new Error(
      `Canonical entrypoint missing: backend=${fs.existsSync(backendEntry)} vite=${fs.existsSync(viteEntry)}`,
    );
  }
  if (adminRoutes.length !== 15) {
    throw new Error(`Expected 15 Admin RouteContracts, found ${adminRoutes.length}.`);
  }

  const [backendPort, sitePort, audioPort] = await Promise.all([
    getFreePort(),
    getFreePort(),
    getFreePort(),
  ]);
  const backendOrigin = `http://127.0.0.1:${backendPort}`;
  const siteOrigin = `http://127.0.0.1:${sitePort}`;

  startNode("backend", [backendEntry], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(backendPort),
      AUDIO_UDP_PORT: String(audioPort),
      DATA_BACKEND: "json",
      DATA_DIR: dataDir,
      AUTH_MODE: "demo",
      ALLOW_DEMO_AUTH: "true",
      FIREBASE_AUTH_ENABLED: "false",
      NOTIFICATION_EMAIL_ENABLED: "false",
      PUSH_NOTIFICATIONS_ENABLED: "false",
      CORS_ORIGIN: siteOrigin,
    },
  });
  await waitForUrl(`${backendOrigin}/api/v1/health`, "backend", 45_000);
  const session = await registerAdmin(backendOrigin);
  const limitedSession = shouldRunRepresentativeProofs
    ? await registerLimitedPrincipal(backendOrigin)
    : null;

  // Keep the label adjacent so the contract test can prove both services self-start.
  // prettier-ignore
  startNode("Admin Vite",
    [viteEntry, "dev", "--host", "127.0.0.1", "--port", String(sitePort), "--strictPort"],
    {
      cwd: adminRoot,
      env: {
        ...process.env,
        VITE_AUTH_MODE: "demo",
        VITE_SMART_HEALTH_BASE_URL: backendOrigin,
        VITE_SMART_HEALTH_API_BASE_URL: `${backendOrigin}/api`,
        VITE_FIREBASE_API_KEY: "",
        VITE_FIREBASE_AUTH_DOMAIN: "",
        VITE_FIREBASE_PROJECT_ID: "",
        VITE_FIREBASE_STORAGE_BUCKET: "",
        VITE_FIREBASE_MESSAGING_SENDER_ID: "",
        VITE_FIREBASE_APP_ID: "",
        VITE_FIREBASE_MEASUREMENT_ID: "",
      },
    },
  );
  await waitForUrl(`${siteOrigin}/login`, "Admin Vite", 60_000);
  await runBrowser(siteOrigin, session, limitedSession);

  if (failures.length) {
    console.error(`Admin UI foundation browser smoke failed with ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Admin UI foundation browser smoke passed on ${browserOption}: ${routeChecks} RouteContract checks (${selectedRoutes.length} route(s) x ${selectedViewports.length} viewport(s) x ${selectedThemes.length} theme(s)), ${commandPaletteChecks} command-palette checks, ${offlineChecks} offline-state checks, ${accountContractChecks} self-owned Account 2FA/preference contract checks, ${drawerInteractionChecks} modal drawer focus-trap/Escape/restore checks, ${representativeStateChecks} representative loading/error/retry/empty/403 state checks and ${directPermissionChecks} real limited-principal direct-URL denial checks; reduced motion, live Admin brand/title, one main h1, theme tokens, 44px targets, overflow, demo-visual exclusions, Axe serious/critical, console and requests are clean.`,
  );
}

try {
  await main();
} catch (error) {
  console.error("Admin UI foundation browser smoke failed:");
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
} finally {
  await Promise.all(children.map((child) => stopChild(child)));
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedDataDir = path.resolve(dataDir);
  if (resolvedDataDir.startsWith(`${tempRoot}${path.sep}`)) {
    fs.rmSync(resolvedDataDir, { recursive: true, force: true });
  }
}
