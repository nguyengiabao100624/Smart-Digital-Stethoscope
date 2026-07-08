/* global document, getComputedStyle, innerWidth, innerHeight, Element */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");

const siteUrl = (process.env.SMART_HEALTH_WEB_URL || "https://shcare.web.app").replace(
  /\/+$/,
  "",
);
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
const disableWebSecurity = process.env.SMOKE_DISABLE_WEB_SECURITY === "1";

const sensitiveHeaderNames = new Set(["authorization", "cookie", "set-cookie"]);
const watchPatterns = [
  "/api/auth/firebase",
  "/api/me",
  "/api/portal/status",
  "/api/portal/overview",
  "/api/portal/patients",
  "/api/portal/scans",
  "/api/portal/notifications",
  "/api/portal/devices",
  "/api/portal/monitoring",
  "/api/portal/staff",
  "/api/portal/settings",
  "/api/portal/reports",
  "/api/portal/audit-log",
  "/api/share-targets",
];

function readSmokeAccount() {
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      `Missing smoke credentials file: ${credentialsPath}. Run backend smoke:production-roles first.`,
    );
  }
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const account = (credentials.accounts || []).find((item) => item.key === accountKey);
  if (!account?.email || !account?.password) {
    throw new Error(`Smoke credentials file is missing the ${accountKey} account.`);
  }
  return account;
}

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().includes("token") || key.toLowerCase().includes("key")) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return String(value).replace(/key=[^&]+/g, "key=[redacted]");
  }
}

function redactedHeaders(headers) {
  const next = {};
  for (const [key, value] of Object.entries(headers || {})) {
    next[key] = sensitiveHeaderNames.has(key.toLowerCase()) ? "[redacted]" : value;
  }
  return next;
}

async function waitSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(700);
}

async function assertNoPortalError(page, label) {
  const body = await page.locator("body").innerText({ timeout: 10_000 });
  const badTexts = [
    "Không thể kết nối backend",
    "Yêu cầu backend thất bại",
    "Đã có lỗi xảy ra",
    "BE lỗi",
  ];
  for (const text of badTexts) {
    if (body.includes(text)) {
      throw new Error(`${label}: visible error text: ${text}`);
    }
  }
}

async function verifyPopoverLayer(page, triggerSelector, label) {
  await page.waitForSelector(".clinical-popover", { state: "hidden", timeout: 2_000 }).catch(() => undefined);
  await page.locator(triggerSelector).click();
  await page.waitForSelector(".clinical-popover", { state: "visible", timeout: 10_000 });
  const result = await page.evaluate(() => {
    const popovers = [...document.querySelectorAll(".clinical-popover")].filter((item) => {
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.opacity !== "0";
    });
    const popover = popovers.at(-1);
    const filterPanel = [...document.querySelectorAll(".glass-panel")].find(
      (item) => item.getBoundingClientRect().top > 50,
    );
    if (!popover) return { ok: false, reason: "missing popover" };
    const rect = popover.getBoundingClientRect();
    const popoverStyle = getComputedStyle(popover);
    const points = [
      { x: rect.left + 24, y: rect.top + 24 },
      {
        x: Math.min(rect.right - 24, rect.left + rect.width / 2),
        y: Math.min(rect.bottom - 24, rect.top + rect.height / 2),
      },
      { x: rect.right - 24, y: rect.bottom - 24 },
    ].filter((point) => point.x >= 0 && point.y >= 0 && point.x < innerWidth && point.y < innerHeight);
    const hits = points.map((point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        point,
        inside: Boolean(hit && popover.contains(hit)),
        tag: hit?.tagName || "",
        className: hit instanceof Element ? String(hit.getAttribute("class") || "") : "",
      };
    });
    return {
      ok: hits.length > 0 && hits.every((hit) => hit.inside),
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      zIndex: popoverStyle.zIndex,
      backdropFilter:
        popoverStyle.backdropFilter ||
        popoverStyle.webkitBackdropFilter ||
        "",
      background: popoverStyle.background,
      topbarZIndex: getComputedStyle(document.querySelector(".clinical-topbar")).zIndex,
      contentZIndex: getComputedStyle(document.querySelector(".clinical-content")).zIndex,
      filterTop: filterPanel ? filterPanel.getBoundingClientRect().top : null,
      hits,
    };
  });
  if (!result.ok) {
    throw new Error(`${label}: popover is occluded ${JSON.stringify(result)}`);
  }
  if (!/blur\(/i.test(result.backdropFilter || "")) {
    throw new Error(`${label}: popover is missing backdrop blur ${JSON.stringify(result)}`);
  }
  await page.locator(triggerSelector).click().catch(() => undefined);
  await page.waitForSelector(".clinical-popover", { state: "hidden", timeout: 2_000 }).catch(() => undefined);
  return result;
}

async function clickRoute(page, href, label) {
  await page.locator(`a[href="${href}"]`).first().click();
  await page.waitForURL(`**${href}`, { timeout: 15_000 });
  await waitSettled(page);
  await assertNoPortalError(page, label);
  return { label, path: new URL(page.url()).pathname };
}

async function visitRoute(page, href, label) {
  await page.goto(`${siteUrl}${href}?smoke=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await assertNoPortalError(page, label);
  return { label, path: new URL(page.url()).pathname };
}

async function verifySettingsSurface(page) {
  const checks = [];
  await page.waitForSelector("#portal-settings-profile-tab", {
    timeout: 20_000,
  });
  await page.waitForSelector("#account-save-profile", { timeout: 20_000 });
  checks.push("profile");

  await page.locator("#portal-settings-security-tab").click();
  await page.waitForSelector("#account-current-password", { timeout: 20_000 });
  await page.waitForSelector("#account-new-password", { timeout: 20_000 });
  await page.waitForSelector("#account-change-password", { timeout: 20_000 });
  await page.waitForSelector("#account-2fa-app", { timeout: 20_000 });
  await page.waitForSelector("#account-revoke-other-sessions", {
    timeout: 20_000,
  });
  checks.push("security");

  await page.locator("#portal-settings-notifications-tab").click();
  await page.waitForSelector("#notification-newLogin", { timeout: 20_000 });
  await page.waitForSelector("#workspace-save-notifications", {
    timeout: 20_000,
  });
  checks.push("notifications");

  await page.locator("#portal-settings-workspace-tab").click();
  await page.waitForSelector("#workspace-website", { timeout: 20_000 });
  checks.push("workspace");

  return {
    label: "settings account/security controls",
    path: new URL(page.url()).pathname,
    checks,
  };
}

async function verifyConsentSurface(page) {
  const checks = [];
  await page.waitForSelector("#share-patient-id", { timeout: 20_000 });
  await page.waitForSelector("#share-target-type", { timeout: 20_000 });
  await page.waitForSelector("#share-target-id", { timeout: 20_000 });
  await page.waitForSelector("#share-scope", { timeout: 20_000 });
  await page.waitForSelector("#share-expires-at", { timeout: 20_000 });
  await page.waitForSelector("#share-create-submit", { timeout: 20_000 });
  checks.push("share form");

  await page.locator("#share-scope").selectOption("selected_scans");
  await page.waitForSelector("[data-share-scan-scope]", { timeout: 20_000 });
  checks.push("selected scan scope");

  await page.locator("#share-scope").selectOption("patient_profile");
  return {
    label: "consent share controls",
    path: new URL(page.url()).pathname,
    checks,
  };
}

async function main() {
  const account = readSmokeAccount();
  const checkedResponses = [];
  const requestFailures = [];
  const consoleMessages = [];
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: disableWebSecurity
      ? ["--disable-web-security", "--disable-features=IsolateOrigins,site-per-process"]
      : [],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text().slice(0, 300) });
    }
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    requestFailures.push({
      url: sanitizeUrl(url),
      method: request.method(),
      headers: redactedHeaders(request.headers()),
      failure: request.failure()?.errorText || "",
    });
  });
  page.on("response", (response) => {
    const url = response.url();
    if (watchPatterns.some((pattern) => url.includes(pattern))) {
      checkedResponses.push({ url: sanitizeUrl(url), status: response.status() });
    }
  });

  await page.goto(`${siteUrl}/portal/records?smoke=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL("**/login", { timeout: 20_000 });
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill(account.password);
  await Promise.all([
    page.waitForURL("**/portal**", { timeout: 45_000 }),
    page.locator('form button[type="submit"]').click(),
  ]);

  await page.goto(`${siteUrl}/portal/records?smoke=${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector(".clinical-topbar", { timeout: 20_000 });
  await page.waitForSelector("#portal-record-search", { timeout: 20_000 });
  await assertNoPortalError(page, "records");

  const avatarLayer = await verifyPopoverLayer(
    page,
    "#portal-user-menu-trigger",
    "avatar menu",
  );
  const notificationLayer = await verifyPopoverLayer(
    page,
    "#portal-notifications-trigger",
    "notification menu",
  );

  await page.locator("#portal-record-search").fill("smoke-no-match");
  await page.locator("#portal-record-status").selectOption("completed");
  await waitSettled(page);
  await page.locator("#portal-record-search").fill("");
  await page.locator("#portal-record-status").selectOption("");

  const routeChecks = [];
  for (const [href, label] of [
    ["/portal/dashboard", "dashboard"],
    ["/portal/patients", "patients"],
    ["/portal/live", "live monitoring"],
    ["/portal/devices", "devices"],
    ["/portal/consent", "consent"],
    ["/portal/records", "records nav"],
    ["/portal/staff", "staff"],
    ["/portal/reports", "reports"],
    ["/portal/alerts", "alerts"],
    ["/portal/settings", "settings"],
    ["/portal/notifications", "notifications"],
    ["/portal/onboarding", "onboarding"],
    ["/portal/help", "help"],
  ]) {
    const routeCheck = await clickRoute(page, href, label);
    routeChecks.push(routeCheck);
    if (href === "/portal/consent") {
      routeChecks.push(await verifyConsentSurface(page));
    }
    if (href === "/portal/settings") {
      routeChecks.push(await verifySettingsSurface(page));
    }
  }

  for (const [href, label] of [
    ["/portal/workspace", "workspace switcher"],
    ["/portal/billing", "billing"],
    ["/portal/records/review", "review queue"],
    ["/portal/devices/claim", "claim device"],
    ["/portal/devices/assign", "assign device"],
  ]) {
    routeChecks.push(await visitRoute(page, href, label));
  }

  await page.locator("#portal-user-menu-trigger").click();
  await page.locator('.clinical-popover a[href="/portal/audit"]').click();
  await page.waitForURL("**/portal/audit", { timeout: 15_000 });
  await waitSettled(page);
  await assertNoPortalError(page, "audit");
  routeChecks.push({ label: "audit via avatar menu", path: new URL(page.url()).pathname });

  const badResponses = checkedResponses.filter((item) => item.status >= 400);
  const actionableRequestFailures = requestFailures.filter((item) => {
    if (item.failure === "net::ERR_ABORTED") return false;
    if (item.url.includes("/favicon.")) return false;
    if (item.url.includes("fonts.gstatic.com")) return false;
    return true;
  });
  const severeConsole = consoleMessages.filter(
    (item) => item.type === "error" && !item.text.includes("favicon"),
  );
  if (badResponses.length || actionableRequestFailures.length || severeConsole.length) {
    throw new Error(
      JSON.stringify({ badResponses, requestFailures: actionableRequestFailures, severeConsole }, null, 2),
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        site: siteUrl,
        checkedResponses,
        avatarLayer: {
          ok: avatarLayer.ok,
          zIndex: avatarLayer.zIndex,
          topbarZIndex: avatarLayer.topbarZIndex,
          contentZIndex: avatarLayer.contentZIndex,
          rect: avatarLayer.rect,
          filterTop: avatarLayer.filterTop,
        },
        notificationLayer: {
          ok: notificationLayer.ok,
          zIndex: notificationLayer.zIndex,
          topbarZIndex: notificationLayer.topbarZIndex,
          contentZIndex: notificationLayer.contentZIndex,
        },
        routeChecks,
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main().catch((error) => {
  console.error("Smart Health web browser smoke: FAIL");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
