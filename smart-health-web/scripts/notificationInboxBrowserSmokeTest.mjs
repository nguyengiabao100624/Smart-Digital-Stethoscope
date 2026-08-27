/* global document, window */

import AxeBuilder from "@axe-core/playwright";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const viteEntry = path.join(webRoot, "node_modules", "vite", "bin", "vite.js");
const children = [];
const failures = [];
let checks = 0;

const cases = [
  {
    name: "phone-light",
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    preference: "light",
  },
  {
    name: "tablet-system-dark",
    viewport: { width: 768, height: 1024 },
    colorScheme: "dark",
    preference: "system",
  },
  {
    name: "desktop-dark",
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    preference: "dark",
  },
];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

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

function startVite(port, apiPort) {
  const output = [];
  const child = spawn(
    process.execPath,
    [
      viteEntry,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: webRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        VITE_SMART_HEALTH_API_BASE_URL: `http://127.0.0.1:${apiPort}/api`,
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
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
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

function jsonResponse(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers":
        "Authorization, Content-Type, Idempotency-Key, X-Smart-Health-Client, X-Smart-Health-Surface",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    },
    body: JSON.stringify(payload),
  });
}

function fixtureUser() {
  return {
    id: "user-notification-browser",
    name: "Bác sĩ Nguyễn An",
    email: "doctor.notification@shcare.test",
    role: "doctor",
    accountStatus: "active",
    roleRequestStatus: "approved",
    verifiedEmail: true,
    organizationId: "workspace-notification-browser",
    currentWorkspaceId: "workspace-notification-browser",
    currentWorkspace: {
      id: "workspace-notification-browser",
      name: "Phòng khám Shcare",
      type: "clinic",
      workspaceType: "clinic",
      status: "active",
    },
    currentMembership: {
      id: "membership-notification-browser",
      userId: "user-notification-browser",
      organizationId: "workspace-notification-browser",
      workspaceId: "workspace-notification-browser",
      workspaceName: "Phòng khám Shcare",
      workspaceType: "clinic",
      role: "doctor",
      status: "active",
    },
    memberships: [
      {
        id: "membership-notification-browser",
        userId: "user-notification-browser",
        organizationId: "workspace-notification-browser",
        workspaceId: "workspace-notification-browser",
        workspaceName: "Phòng khám Shcare",
        workspaceType: "clinic",
        role: "doctor",
        status: "active",
      },
    ],
    capabilities: ["notifications.view"],
    allowedSurfaces: ["portal"],
    defaultSurface: "portal",
  };
}

function fixtureNotification(read = false) {
  return {
    id: "notification-browser-1",
    userId: "user-notification-browser",
    workspaceId: "workspace-notification-browser",
    organizationId: "workspace-notification-browser",
    type: "warning",
    title: "Kết quả đo cần xem lại",
    message: "Một kết quả đo mới đang chờ bác sĩ kiểm tra.",
    campaignId: "campaign-browser-1",
    audienceType: "users",
    audienceRole: "",
    requestedChannels: ["in_app"],
    inAppStatus: "ready",
    emailStatus: "skipped",
    pushStatus: "skipped",
    read,
    readAt: read ? "2026-07-29T09:05:00.000Z" : null,
    createdAt: "2026-07-29T09:00:00.000Z",
    updatedAt: read
      ? "2026-07-29T09:05:00.000Z"
      : "2026-07-29T09:00:00.000Z",
  };
}

async function runCase(browser, origin, apiPort, testCase) {
  const context = await browser.newContext({
    viewport: testCase.viewport,
    colorScheme: testCase.colorScheme,
    reducedMotion: "reduce",
    locale: "vi-VN",
  });
  const page = await context.newPage();
  const browserErrors = [];
  const failedRequests = [];
  const unknownApiRequests = [];
  const mutationKeys = [];
  let isRead = false;

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`,
    );
  });

  await page.addInitScript(
    ({ preference }) => {
      window.localStorage.setItem("smart_health_token", "browser-smoke-token");
      window.localStorage.setItem("shcare-theme", preference);
    },
    { preference: testCase.preference },
  );

  await page.route(`http://127.0.0.1:${apiPort}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    if (request.method() === "OPTIONS") {
      await jsonResponse(route, null, 204);
      return;
    }
    check(
      request.headers().authorization === "Bearer browser-smoke-token",
      `${testCase.name}: API request was missing the expected bearer token`,
    );
    check(
      request.headers()["x-smart-health-surface"] === "portal",
      `${testCase.name}: API request was missing the portal surface`,
    );
    if (request.method() === "GET" && apiPath === "/api/me") {
      await jsonResponse(route, { user: fixtureUser() });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/portal/notifications"
    ) {
      await jsonResponse(route, { notifications: [] });
      return;
    }
    if (request.method() === "GET" && apiPath === "/api/portal/status") {
      await jsonResponse(route, {
        ok: true,
        service: "Shcare browser fixture",
        now: "2026-07-29T09:00:00.000Z",
        workspace: {
          id: "workspace-notification-browser",
          name: "Phòng khám Shcare",
          type: "clinic",
        },
        scoped: {
          patientsCount: 0,
          devicesCount: 0,
          devicesOnline: 0,
          scansCount: 0,
          alertsCount: 0,
        },
        status: {
          workspaceId: "workspace-notification-browser",
          devicesCount: 0,
          devicesOnline: 0,
          recording: false,
          activeScanId: null,
          updatedAt: "2026-07-29T09:00:00.000Z",
        },
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/portal/notifications/inbox"
    ) {
      await jsonResponse(route, {
        userId: "user-notification-browser",
        workspaceId: "workspace-notification-browser",
        notifications: [fixtureNotification(isRead)],
        updatedAt: isRead
          ? "2026-07-29T09:05:00.000Z"
          : "2026-07-29T09:00:00.000Z",
      });
      return;
    }
    if (
      request.method() === "POST" &&
      apiPath ===
        "/api/portal/notifications/inbox/notification-browser-1/read"
    ) {
      const key = request.headers()["idempotency-key"] || "";
      mutationKeys.push(key);
      check(
        key.length >= 16,
        `${testCase.name}: read mutation used a missing or weak idempotency key`,
      );
      isRead = true;
      const notification = fixtureNotification(true);
      await jsonResponse(route, {
        userId: "user-notification-browser",
        workspaceId: "workspace-notification-browser",
        action: "read",
        notification,
        notifications: [notification],
        affectedIds: ["notification-browser-1"],
        deletedId: null,
        updatedAt: "2026-07-29T09:05:00.000Z",
        replayed: false,
      });
      return;
    }
    unknownApiRequests.push(`${request.method()} ${apiPath}`);
    await jsonResponse(
      route,
      {
        code: "UNEXPECTED_BROWSER_SMOKE_REQUEST",
        message: "Unexpected API request in Notification Inbox browser smoke.",
        requestId: "browser-smoke-unexpected",
      },
      404,
    );
  });

  try {
    await page.goto(`${origin}/portal/notifications`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .locator("main.clinical-content")
      .getByRole("heading", { name: "Thông báo", exact: true })
      .waitFor();
    const article = page.locator(
      '[data-notification-id="notification-browser-1"]',
    );
    await article.waitFor();

    const theme = await page.evaluate(() => ({
      preference: document.documentElement.dataset.theme,
      resolved: document.documentElement.dataset.resolvedTheme,
    }));
    check(
      theme.preference === testCase.preference,
      `${testCase.name}: expected theme preference ${testCase.preference}, received ${theme.preference}`,
    );
    check(
      theme.resolved === testCase.colorScheme,
      `${testCase.name}: expected resolved theme ${testCase.colorScheme}, received ${theme.resolved}`,
    );

    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    check(
      layout.documentWidth <= layout.viewport,
      `${testCase.name}: horizontal overflow ${layout.documentWidth}px > ${layout.viewport}px`,
    );

    const actionTargets = await article.locator("button").evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          label: button.getAttribute("aria-label") || button.textContent || "",
          width: rect.width,
          height: rect.height,
        };
      }),
    );
    check(
      actionTargets.every(
        (target) => target.width >= 44 && target.height >= 44,
      ),
      `${testCase.name}: notification actions did not all meet 44x44 CSS pixel targets: ${JSON.stringify(actionTargets)}`,
    );

    const axe = await new AxeBuilder({ page }).include("main").analyze();
    const serious = axe.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact || ""),
    );
    check(
      serious.length === 0,
      `${testCase.name}: axe serious/critical violations: ${serious
        .map((violation) => violation.id)
        .join(", ")}`,
    );

    await page
      .locator('[data-notification-read="notification-browser-1"]')
      .click();
    await page
      .getByRole("article", {
        name: "Kết quả đo cần xem lại. Đã đọc",
      })
      .waitFor();
    check(
      mutationKeys.length === 1,
      `${testCase.name}: expected exactly one canonical read mutation, received ${mutationKeys.length}`,
    );
    check(
      unknownApiRequests.length === 0,
      `${testCase.name}: unexpected API requests: ${unknownApiRequests.join(", ")}`,
    );
    check(
      browserErrors.length === 0,
      `${testCase.name}: browser console/page errors: ${browserErrors.join(" | ")}`,
    );
    check(
      failedRequests.length === 0,
      `${testCase.name}: failed browser requests: ${failedRequests.join(" | ")}`,
    );
  } finally {
    await context.close();
  }
}

let browser;
try {
  const [webPort, apiPort] = await Promise.all([getFreePort(), getFreePort()]);
  const vite = startVite(webPort, apiPort);
  await waitForUrl(`http://127.0.0.1:${webPort}`);
  browser = await chromium.launch({ headless: true });
  for (const testCase of cases) {
    await runCase(
      browser,
      `http://127.0.0.1:${webPort}`,
      apiPort,
      testCase,
    );
  }
  await stopChild(vite);
} catch (error) {
  failures.push(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  await Promise.all(children.map((child) => stopChild(child)));
}

if (failures.length) {
  console.error(
    `Notification Inbox browser smoke failed (${failures.length}/${checks} checks):`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Notification Inbox browser smoke passed (${checks} checks; ${cases.length} viewport/theme cases).`,
  );
}
