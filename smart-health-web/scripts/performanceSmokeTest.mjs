/* global document */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");

const siteUrl = (process.env.SMART_HEALTH_WEB_URL || "https://shcare.web.app").replace(/\/+$/, "");
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

const routeBudgets = {
  public: {
    loadMs: Number(process.env.SMART_HEALTH_PUBLIC_LOAD_BUDGET_MS || 7000),
    transferBytes: Number(process.env.SMART_HEALTH_PUBLIC_TRANSFER_BUDGET_BYTES || 4_500_000),
    scriptBytes: Number(process.env.SMART_HEALTH_PUBLIC_SCRIPT_BUDGET_BYTES || 1_700_000),
  },
  portal: {
    loadMs: Number(process.env.SMART_HEALTH_PORTAL_LOAD_BUDGET_MS || 9000),
    transferBytes: Number(process.env.SMART_HEALTH_PORTAL_TRANSFER_BUDGET_BYTES || 6_000_000),
    scriptBytes: Number(process.env.SMART_HEALTH_PORTAL_SCRIPT_BUDGET_BYTES || 2_400_000),
  },
};

function readSmokeAccount() {
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(`Missing smoke credentials file: ${credentialsPath}. Run backend smoke:production-roles first.`);
  }
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  const account = (credentials.accounts || []).find((item) => item.key === accountKey);
  if (!account?.email || !account?.password) {
    throw new Error(`Smoke credentials file is missing the ${accountKey} account.`);
  }
  return account;
}

function sanitizeConsoleText(value) {
  return String(value || "")
    .replace(/password=[^&\s]+/gi, "password=[redacted]")
    .replace(/token=[^&\s]+/gi, "token=[redacted]")
    .replace(/key=[^&\s]+/gi, "key=[redacted]");
}

async function waitSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page
    .waitForFunction(() => (document.body?.innerText?.trim().length || 0) > 120, null, {
      timeout: 15_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(500);
}

async function collectMetrics(page, label, group) {
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const transferBytes = resources.reduce((sum, item) => sum + Number(item.transferSize || 0), 0);
    const encodedBytes = resources.reduce((sum, item) => sum + Number(item.encodedBodySize || 0), 0);
    const scriptBytes = resources
      .filter((item) => item.initiatorType === "script" || /\.mjs|\.js($|\?)/i.test(item.name))
      .reduce((sum, item) => sum + Number(item.transferSize || item.encodedBodySize || 0), 0);
    const cssBytes = resources
      .filter((item) => item.initiatorType === "link" || /\.css($|\?)/i.test(item.name))
      .reduce((sum, item) => sum + Number(item.transferSize || item.encodedBodySize || 0), 0);
    const imageBytes = resources
      .filter((item) => item.initiatorType === "img" || /\.(png|jpe?g|webp|gif|svg|mp4)($|\?)/i.test(item.name))
      .reduce((sum, item) => sum + Number(item.transferSize || item.encodedBodySize || 0), 0);
    const bodyTextLength = document.body?.innerText?.trim().length || 0;
    return {
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd || 0),
      loadMs: Math.round(nav?.loadEventEnd || nav?.duration || 0),
      resourceCount: resources.length,
      transferBytes,
      encodedBytes,
      scriptBytes,
      cssBytes,
      imageBytes,
      bodyTextLength,
    };
  });

  const budget = routeBudgets[group];
  if (metrics.bodyTextLength < 120) {
    throw new Error(`${label}: page rendered too little text (${metrics.bodyTextLength} chars)`);
  }
  if (metrics.loadMs > budget.loadMs) {
    throw new Error(`${label}: load ${metrics.loadMs}ms exceeds budget ${budget.loadMs}ms`);
  }
  if (metrics.transferBytes > budget.transferBytes) {
    throw new Error(`${label}: transfer ${metrics.transferBytes} bytes exceeds budget ${budget.transferBytes}`);
  }
  if (metrics.scriptBytes > budget.scriptBytes) {
    throw new Error(`${label}: script transfer ${metrics.scriptBytes} bytes exceeds budget ${budget.scriptBytes}`);
  }

  return { label, group, path: new URL(page.url()).pathname, ...metrics };
}

async function visitAndMeasure(page, pathname, label, group = "public") {
  await page.goto(`${siteUrl}${pathname}?perf=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await waitSettled(page);
  return collectMetrics(page, label, group);
}

async function main() {
  const account = readSmokeAccount();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

  try {
    const results = [];
    results.push(await visitAndMeasure(page, "/", "public home", "public"));
    results.push(await visitAndMeasure(page, "/login", "portal login", "public"));

    await page.locator("#login-email").fill(account.email);
    await page.locator("#login-password").fill(account.password);
    await Promise.all([
      page.waitForURL("**/portal**", { timeout: 30_000 }),
      page.locator('button[type="submit"]').click(),
    ]);
    await waitSettled(page);
    results.push(await collectMetrics(page, "portal landing after login", "portal"));

    for (const [pathname, label] of [
      ["/portal/patients", "portal patients"],
      ["/portal/appointments", "portal appointments"],
      ["/portal/records", "portal records"],
      ["/portal/devices", "portal devices"],
      ["/portal/settings", "portal settings"],
    ]) {
      results.push(await visitAndMeasure(page, pathname, label, "portal"));
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
          accountKey,
          budgets: routeBudgets,
          results,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
