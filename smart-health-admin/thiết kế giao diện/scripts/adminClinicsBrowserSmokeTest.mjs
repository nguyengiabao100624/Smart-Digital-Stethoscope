/* global document, getComputedStyle, innerWidth, window */

import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(adminRoot, "..", "..");
const backendRoot = path.join(workspaceRoot, "smart-health-embedded", "web-monitor");
const backendEntry = path.join(backendRoot, "server.js");
const viteEntry = path.join(adminRoot, "node_modules", "vite", "bin", "vite.js");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-admin-operations-browser-"));
const children = [];
const failures = [];
let checks = 0;

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
];
const themes = [
  { preference: "light", colorScheme: "light", resolved: "light" },
  { preference: "dark", colorScheme: "dark", resolved: "dark" },
  { preference: "system", colorScheme: "dark", resolved: "dark" },
];

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
    if (output.length > 80) output.shift();
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.once("exit", (code) => {
    if (code && !child.killed) {
      failures.push(`${label} exited early with code ${code}: ${output.join("").slice(-2000)}`);
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
  return `${route} ${viewport.width}x${viewport.height} ${theme.preference}: ${message}`;
}

function validateOverviewPayload(payload, expectedRange) {
  if (!payload || typeof payload !== "object") return "response is not an object";
  if (payload.range?.key !== expectedRange) return `range=${payload.range?.key || "missing"}`;
  if (!Number.isFinite(Date.parse(payload.generatedAt || ""))) return "generatedAt is invalid";
  if (!Array.isArray(payload.measureData) || !payload.measureData.length) {
    return "measureData has no real time buckets";
  }
  const measured = payload.measureData.reduce((sum, point) => sum + Number(point?.count || 0), 0);
  if (measured !== payload.stats?.scansCount) {
    return `measureData total ${measured} != scansCount ${payload.stats?.scansCount}`;
  }
  const deviceKeys = (payload.deviceData || []).map((item) => item.key).join(",");
  if (deviceKeys !== "online,offline") return `device keys=${deviceKeys || "missing"}`;
  const aiKeys = (payload.aiJobData || []).map((item) => item.key).join(",");
  if (aiKeys !== "processing,completed,failed,pending") return `AI keys=${aiKeys || "missing"}`;
  return "";
}

function validateStoragePayload(statsPayload, filesPayload) {
  if (!statsPayload || typeof statsPayload !== "object") return "stats response is not an object";
  if (!filesPayload || typeof filesPayload !== "object") return "files response is not an object";
  if (!Array.isArray(statsPayload.buckets)) return "storage buckets are missing";
  if (!Array.isArray(statsPayload.growthData)) return "storage growthData is missing";
  if (!Array.isArray(statsPayload.typeData)) return "storage typeData is missing";
  if (!Array.isArray(statsPayload.topBuckets)) return "storage topBuckets is missing";
  if (!Array.isArray(statsPayload.recentActivity)) return "storage recentActivity is missing";
  if (!Array.isArray(statsPayload.topClinicUsage)) return "storage topClinicUsage is missing";
  if (!Array.isArray(filesPayload.files)) return "storage files are missing";
  if (!Number.isSafeInteger(statsPayload.totalFiles) || statsPayload.totalFiles < 0) {
    return `storage totalFiles=${statsPayload.totalFiles}`;
  }
  if (statsPayload.totalFiles !== filesPayload.files.length) {
    return `storage totalFiles ${statsPayload.totalFiles} != files ${filesPayload.files.length}`;
  }
  const bucketTotal = statsPayload.buckets.reduce(
    (sum, bucket) => sum + Number(bucket?.used || 0),
    0,
  );
  if (
    !Number.isFinite(statsPayload.totalUsed) ||
    Math.abs(bucketTotal - statsPayload.totalUsed) > 0.000001
  ) {
    return `storage bucket total ${bucketTotal} != totalUsed ${statsPayload.totalUsed}`;
  }
  if (filesPayload.files.some((file) => file?.visibility !== "private")) {
    return "storage returned a non-private file";
  }
  return "";
}

function validateAuditPayload(payload) {
  if (!payload || typeof payload !== "object") return "audit response is not an object";
  if (!Array.isArray(payload.logs)) return "audit logs are missing";
  if (!payload.pagination || typeof payload.pagination !== "object") {
    return "audit pagination is missing";
  }
  if (!Number.isSafeInteger(payload.pagination.total) || payload.pagination.total < 0) {
    return `audit total=${payload.pagination.total}`;
  }
  const requiredFields = [
    "id",
    "actorUserId",
    "actorName",
    "actorRole",
    "organizationId",
    "organizationName",
    "action",
    "resourceType",
    "resourceId",
    "outcome",
    "ip",
    "userAgent",
    "metadata",
    "createdAt",
  ];
  const invalid = payload.logs.find((log) =>
    requiredFields.some((field) => !Object.prototype.hasOwnProperty.call(log || {}, field)),
  );
  return invalid ? `audit row ${invalid?.id || "unknown"} is incomplete` : "";
}

async function inspectPage(page, route, viewport, theme, runtimeErrors, responseErrors) {
  await page.locator('[data-testid="admin-theme-toggle"]').waitFor({ state: "visible" });
  await page.waitForTimeout(350);
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const tinyTargets = Array.from(
      document.querySelectorAll(
        'button, input:not([type="hidden"]), select, textarea, [role="button"], a',
      ),
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (rect.width === 0 || rect.height === 0) return false;
        if (element.tagName === "A" && style.display === "inline") return false;
        return rect.width < 44 || rect.height < 44;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const name =
          element.getAttribute("aria-label") || element.textContent?.trim() || element.id;
        return `${element.tagName.toLowerCase()}[${Math.round(rect.width)}x${Math.round(rect.height)}] ${name}`;
      });
    const style = getComputedStyle(root);
    return {
      theme: root.dataset.theme,
      resolvedTheme: root.dataset.resolvedTheme,
      hasDarkClass: root.classList.contains("dark"),
      hasLightClass: root.classList.contains("light"),
      overflow: root.scrollWidth - innerWidth,
      background: style.getPropertyValue("--background").trim(),
      brandBackground: style.getPropertyValue("--shcare-background").trim(),
      tinyTargets,
    };
  });

  if (layout.theme !== theme.preference) {
    failures.push(describeFailure(route, viewport, theme, `theme=${layout.theme || "missing"}`));
  }
  if (layout.resolvedTheme !== theme.resolved) {
    failures.push(
      describeFailure(route, viewport, theme, `resolvedTheme=${layout.resolvedTheme || "missing"}`),
    );
  }
  if (layout.hasDarkClass !== (theme.resolved === "dark")) {
    failures.push(describeFailure(route, viewport, theme, "resolved class does not match"));
  }
  if (layout.hasLightClass !== (theme.resolved === "light")) {
    failures.push(describeFailure(route, viewport, theme, "light class does not match"));
  }
  if (!layout.background || layout.background !== layout.brandBackground) {
    failures.push(
      describeFailure(
        route,
        viewport,
        theme,
        `Admin background is not mapped to the brand token (${layout.background}/${layout.brandBackground})`,
      ),
    );
  }
  if (layout.overflow > 1) {
    failures.push(
      describeFailure(route, viewport, theme, `horizontal overflow ${layout.overflow}px`),
    );
  }
  if (layout.tinyTargets.length) {
    failures.push(
      describeFailure(
        route,
        viewport,
        theme,
        `targets below 44px: ${layout.tinyTargets.slice(0, 12).join(", ")}`,
      ),
    );
  }

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  for (const violation of axe.violations.filter((item) =>
    ["serious", "critical"].includes(item.impact || ""),
  )) {
    failures.push(
      describeFailure(
        route,
        viewport,
        theme,
        `axe ${violation.impact} ${violation.id}: ${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(" "))
          .join(", ")}`,
      ),
    );
  }
  for (const error of runtimeErrors.splice(0)) {
    failures.push(describeFailure(route, viewport, theme, `console: ${error}`));
  }
  for (const error of responseErrors.splice(0)) {
    failures.push(describeFailure(route, viewport, theme, `response: ${error}`));
  }
  checks += 1;
}

async function registerAdmin(apiOrigin) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const credentials = {
    email: `admin-clinics-browser-${suffix}@smarthealth.test`,
    password: "BrowserSmoke-12345678",
  };
  const response = await fetch(`${apiOrigin}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "admin",
      name: "Admin Clinics Browser Smoke",
      ...credentials,
    }),
  });
  if (response.status !== 201) {
    throw new Error(`Unable to register browser smoke admin: HTTP ${response.status}`);
  }
  return credentials;
}

async function runBrowser(siteOrigin, credentials) {
  const browser = await chromium.launch({ headless: true });
  let campaignCreated = false;
  let patientMutationVerified = false;
  let auditWorkflowVerified = false;
  try {
    for (const viewport of viewports) {
      for (const theme of themes) {
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
        const responseErrors = [];

        page.on("console", (message) => {
          if (message.type() === "error") runtimeErrors.push(message.text());
        });
        page.on("pageerror", (error) => runtimeErrors.push(error.message));
        page.on("requestfailed", (request) => {
          if (request.failure()?.errorText !== "net::ERR_ABORTED") {
            responseErrors.push(
              `${request.method()} ${request.url()} ${request.failure()?.errorText}`,
            );
          }
        });
        page.on("response", (response) => {
          const resourceType = response.request().resourceType();
          if (
            response.status() >= 400 &&
            ["document", "stylesheet", "script", "font", "image", "fetch", "xhr"].includes(
              resourceType,
            )
          ) {
            responseErrors.push(
              `${response.status()} ${response.request().method()} ${response.url()}`,
            );
          }
        });

        await page.goto(`${siteOrigin}/login`, { waitUntil: "networkidle" });
        await inspectPage(page, "/login", viewport, theme, runtimeErrors, responseErrors);

        await page.goto(`${siteOrigin}/forgot-password`, { waitUntil: "networkidle" });
        await inspectPage(page, "/forgot-password", viewport, theme, runtimeErrors, responseErrors);

        await page.goto(`${siteOrigin}/login`, { waitUntil: "networkidle" });
        await page.locator("#admin-email").fill(credentials.email);
        await page.locator("#admin-password").fill(credentials.password);
        const overviewResponsePromise = page.waitForResponse(
          (response) => {
            const url = new URL(response.url());
            return (
              url.pathname === "/api/admin/overview-stats" &&
              url.searchParams.get("range") === "today" &&
              response.status() === 200
            );
          },
          { timeout: 30_000 },
        );
        await Promise.all([
          page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 }),
          page.locator('form button[type="submit"]').click(),
        ]);
        const overviewResponse = await overviewResponsePromise;
        const overviewPayload = await overviewResponse.json();
        const overviewPayloadError = validateOverviewPayload(overviewPayload, "today");
        if (overviewPayloadError) {
          failures.push(describeFailure("/", viewport, theme, overviewPayloadError));
        }
        await page.locator("#overview-time-range").waitFor({ state: "visible", timeout: 15_000 });
        await page
          .locator('[aria-label="Đang tải dữ liệu tổng quan"]')
          .waitFor({ state: "hidden", timeout: 15_000 })
          .catch(() => undefined);

        const sevenDayResponsePromise = page.waitForResponse(
          (response) => {
            const url = new URL(response.url());
            return (
              url.pathname === "/api/admin/overview-stats" &&
              url.searchParams.get("range") === "7d" &&
              response.status() === 200
            );
          },
          { timeout: 30_000 },
        );
        await page.locator("#overview-time-range").selectOption("7d");
        const sevenDayResponse = await sevenDayResponsePromise;
        const sevenDayPayload = await sevenDayResponse.json();
        const sevenDayPayloadError = validateOverviewPayload(sevenDayPayload, "7d");
        if (sevenDayPayloadError) {
          failures.push(describeFailure("/", viewport, theme, sevenDayPayloadError));
        }
        await page.getByText(/^7 ngày qua:/).waitFor({ state: "visible", timeout: 15_000 });
        await inspectPage(page, "/", viewport, theme, runtimeErrors, responseErrors);

        const clinicsResponse = page.waitForResponse(
          (response) => response.url().includes("/api/admin/clinics") && response.status() === 200,
          { timeout: 30_000 },
        );
        await page.goto(`${siteOrigin}/clinics`, { waitUntil: "domcontentloaded" });
        await clinicsResponse;
        await page.locator('input[aria-label="Tìm workspace"]').waitFor({ state: "visible" });
        await page
          .locator('[role="status"][aria-label="Đang tải workspace"]')
          .waitFor({ state: "hidden", timeout: 15_000 })
          .catch(() => undefined);
        await inspectPage(page, "/clinics", viewport, theme, runtimeErrors, responseErrors);

        const patientsResponsePromise = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/patients" &&
            response.request().method() === "GET" &&
            response.status() === 200,
          { timeout: 30_000 },
        );
        await page.goto(`${siteOrigin}/patients`, { waitUntil: "domcontentloaded" });
        await patientsResponsePromise;
        await page
          .getByRole("heading", { name: "Quản lý bệnh nhân", exact: true })
          .waitFor({ state: "visible", timeout: 15_000 });

        if (!patientMutationVerified) {
          const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
          const patientName = `Browser Patient ${suffix}`;
          const patientCode = `BROWSER-${suffix}`;
          await page.getByRole("button", { name: "Thêm hồ sơ" }).click();
          await page.locator("#patient-name").fill(patientName);
          await page.locator("#patient-code").fill(patientCode);
          await page.locator("#patient-dob").fill("1992-06-15");
          await page.locator("#patient-gender").selectOption("female");
          await page.locator("#patient-blood-type").selectOption("O+");
          await page.locator("#patient-phone").fill("0901234567");
          await page.locator("#patient-email").fill(`patient-${suffix}@smarthealth.test`);
          await page.locator("#patient-allergies").fill("penicillin, latex");
          await page.locator("#patient-emergency-name").fill("Người liên hệ smoke");
          await page.locator("#patient-emergency-phone").fill("0907654321");
          await page.locator("#patient-emergency-relationship").fill("Người thân");
          const createResponsePromise = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/api/patients" &&
              response.request().method() === "POST",
            { timeout: 30_000 },
          );
          await page.getByRole("button", { name: "Tạo hồ sơ" }).click();
          const createResponse = await createResponsePromise;
          const createPayload = await createResponse.json().catch(() => null);
          const canonicalPatientId = createPayload?.patient?.id || "";
          if (
            createResponse.status() !== 201 ||
            !canonicalPatientId ||
            canonicalPatientId === patientCode ||
            createPayload?.patient?.patientCode !== patientCode ||
            createPayload?.replayed !== false
          ) {
            throw new Error(
              `Patient create receipt is invalid: HTTP ${createResponse.status()} ${JSON.stringify(createPayload).slice(0, 1500)}`,
            );
          }
          await page.getByRole("button", { name: patientName, exact: true }).click();
          await page.getByText(canonicalPatientId, { exact: true }).waitFor({ state: "visible" });
          await page.getByRole("button", { name: "Chỉnh sửa" }).click();
          await page.locator("#patient-phone").fill("0912345678");
          const updateResponsePromise = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname ===
                `/api/patients/${encodeURIComponent(canonicalPatientId)}` &&
              response.request().method() === "PATCH",
            { timeout: 30_000 },
          );
          await page.getByRole("button", { name: "Lưu thay đổi" }).click();
          const updateResponse = await updateResponsePromise;
          const updatePayload = await updateResponse.json().catch(() => null);
          if (
            updateResponse.status() !== 200 ||
            updatePayload?.patient?.id !== canonicalPatientId ||
            updatePayload?.patient?.phone !== "0912345678" ||
            updatePayload?.replayed !== false
          ) {
            throw new Error(
              `Patient update receipt is invalid: HTTP ${updateResponse.status()} ${JSON.stringify(updatePayload).slice(0, 1500)}`,
            );
          }
          await page
            .getByRole("dialog", { name: patientName })
            .getByText("0912345678", { exact: true })
            .waitFor({ state: "visible" });
          await page.getByRole("button", { name: "Xóa hồ sơ" }).click();
          const deleteResponsePromise = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname ===
                `/api/patients/${encodeURIComponent(canonicalPatientId)}` &&
              response.request().method() === "DELETE",
            { timeout: 30_000 },
          );
          const deleteDialog = page.getByRole("alertdialog");
          await deleteDialog.getByRole("button", { name: "Xóa hồ sơ" }).click();
          const deleteResponse = await deleteResponsePromise;
          const deletePayload = await deleteResponse.json().catch(() => null);
          if (
            deleteResponse.status() !== 200 ||
            deletePayload?.deleted !== true ||
            deletePayload?.patientId !== canonicalPatientId ||
            deletePayload?.replayed !== false
          ) {
            throw new Error(
              `Patient delete receipt is invalid: HTTP ${deleteResponse.status()} ${JSON.stringify(deletePayload).slice(0, 1500)}`,
            );
          }
          await page.getByText(patientName, { exact: true }).waitFor({ state: "hidden" });
          patientMutationVerified = true;
        }

        await inspectPage(page, "/patients", viewport, theme, runtimeErrors, responseErrors);

        const notificationOptionsResponse = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/notifications/options" &&
            response.status() === 200,
          { timeout: 30_000 },
        );
        await page.goto(`${siteOrigin}/notifications`, { waitUntil: "domcontentloaded" });
        await notificationOptionsResponse;
        const composer = page.locator('[data-testid="notification-composer"]');
        await composer.waitFor({ state: "visible", timeout: 15_000 });

        const inAppChannel = page.locator('[data-testid="notification-channel-in_app"]');
        const emailChannel = page.locator('[data-testid="notification-channel-email"]');
        const pushChannel = page.locator('[data-testid="notification-channel-push"]');
        if (await inAppChannel.isDisabled()) {
          failures.push(
            describeFailure("/notifications", viewport, theme, "in-app channel is disabled"),
          );
        }
        if (!(await emailChannel.isDisabled()) || !(await pushChannel.isDisabled())) {
          failures.push(
            describeFailure(
              "/notifications",
              viewport,
              theme,
              "provider-disabled email/push channels remain actionable",
            ),
          );
        }

        if (!campaignCreated) {
          await composer.locator('input[maxlength="180"]').fill("Browser smoke notification");
          await composer
            .locator('textarea[maxlength="2000"]')
            .fill("Kiểm tra audience, idempotency và biên nhận backend thật.");
          const campaignResponse = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/api/notifications" &&
              response.request().method() === "POST",
            { timeout: 30_000 },
          );
          await page.locator('[data-testid="notification-campaign-submit"]').click();
          const response = await campaignResponse;
          const responsePayload = await response.json().catch(() => null);
          if (response.status() !== 201) {
            failures.push(
              describeFailure(
                "/notifications",
                viewport,
                theme,
                `campaign mutation returned HTTP ${response.status()}`,
              ),
            );
          } else {
            try {
              await page
                .locator('[data-testid="notification-campaign-receipt"]')
                .waitFor({ state: "visible", timeout: 15_000 });
            } catch (error) {
              const alertText = await page.locator('[role="alert"]').allTextContents();
              throw new Error(
                `Notification UI rejected the HTTP 201 receipt: ${alertText.join(" | ") || "no alert"}; payload=${JSON.stringify(responsePayload).slice(0, 3000)}; ${error instanceof Error ? error.message : error}`,
              );
            }
            campaignCreated = true;
          }
        }

        await inspectPage(page, "/notifications", viewport, theme, runtimeErrors, responseErrors);

        const storageStatsResponsePromise = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/admin/storage-stats" &&
            response.status() === 200,
          { timeout: 30_000 },
        );
        const storageFilesResponsePromise = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/admin/storage-files" &&
            response.status() === 200,
          { timeout: 30_000 },
        );
        await page.goto(`${siteOrigin}/storage`, { waitUntil: "domcontentloaded" });
        const [storageStatsResponse, storageFilesResponse] = await Promise.all([
          storageStatsResponsePromise,
          storageFilesResponsePromise,
        ]);
        const [storageStatsPayload, storageFilesPayload] = await Promise.all([
          storageStatsResponse.json(),
          storageFilesResponse.json(),
        ]);
        const storagePayloadError = validateStoragePayload(
          storageStatsPayload,
          storageFilesPayload,
        );
        if (storagePayloadError) {
          failures.push(describeFailure("/storage", viewport, theme, storagePayloadError));
        }
        await page
          .getByRole("heading", { name: "Quản lý Lưu trữ", exact: true })
          .waitFor({ state: "visible", timeout: 15_000 });
        await inspectPage(page, "/storage", viewport, theme, runtimeErrors, responseErrors);

        const auditResponsePromise = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/audit-logs" &&
            response.request().method() === "GET" &&
            response.status() === 200,
          { timeout: 30_000 },
        );
        await page.goto(`${siteOrigin}/audit-log`, { waitUntil: "domcontentloaded" });
        const auditResponse = await auditResponsePromise;
        const auditPayload = await auditResponse.json();
        const auditPayloadError = validateAuditPayload(auditPayload);
        if (auditPayloadError) {
          failures.push(describeFailure("/audit-log", viewport, theme, auditPayloadError));
        }
        await page
          .getByRole("heading", { name: "Nhật ký audit", exact: true })
          .waitFor({ state: "visible", timeout: 15_000 });
        await page
          .locator('[role="status"][aria-label="Đang tải nhật ký audit"]')
          .waitFor({ state: "hidden", timeout: 15_000 })
          .catch(() => undefined);

        if (!auditWorkflowVerified) {
          const firstLog = auditPayload.logs.find((log) => log?.id && log?.action);
          if (!firstLog) {
            failures.push(
              describeFailure(
                "/audit-log",
                viewport,
                theme,
                "no real audit row was available after register and login",
              ),
            );
          } else {
            await page
              .getByRole("button", { name: `Xem metadata của bản ghi ${firstLog.id}` })
              .click();
            const metadataDialog = page.getByRole("dialog", { name: "Chi tiết bản ghi audit" });
            await metadataDialog.waitFor({ state: "visible", timeout: 15_000 });
            await metadataDialog
              .getByText(firstLog.id, { exact: true })
              .waitFor({ state: "visible" });
            const closeMetadataButton = metadataDialog.getByRole("button", {
              name: "Đóng chi tiết bản ghi audit",
            });
            const [closeMetadataBox, activeViewport] = await Promise.all([
              closeMetadataButton.boundingBox(),
              Promise.resolve(page.viewportSize()),
            ]);
            const closeMetadataIsReachable = Boolean(
              closeMetadataBox &&
              activeViewport &&
              closeMetadataBox.x >= 0 &&
              closeMetadataBox.y >= 0 &&
              closeMetadataBox.x + closeMetadataBox.width <= activeViewport.width &&
              closeMetadataBox.y + closeMetadataBox.height <= activeViewport.height,
            );
            if (!closeMetadataIsReachable) {
              failures.push(
                describeFailure(
                  "/audit-log",
                  viewport,
                  theme,
                  `metadata close control is outside the viewport: ${JSON.stringify(closeMetadataBox)}`,
                ),
              );
              await page.keyboard.press("Escape");
            } else {
              await closeMetadataButton.click();
            }
            await metadataDialog.waitFor({ state: "hidden", timeout: 15_000 });

            await page.getByText("Bộ lọc chính xác", { exact: true }).click();
            await page.getByLabel("Hành động chính xác").fill(firstLog.action);
            const filteredAuditPromise = page.waitForResponse(
              (response) => {
                const url = new URL(response.url());
                return (
                  url.pathname === "/api/audit-logs" &&
                  url.searchParams.get("action") === firstLog.action &&
                  response.status() === 200
                );
              },
              { timeout: 30_000 },
            );
            await page.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
            const filteredAuditResponse = await filteredAuditPromise;
            const filteredAuditPayload = await filteredAuditResponse.json();
            if (
              filteredAuditPayload.logs.some((log) => log.action !== firstLog.action) ||
              filteredAuditPayload.pagination.total < filteredAuditPayload.logs.length
            ) {
              failures.push(
                describeFailure(
                  "/audit-log",
                  viewport,
                  theme,
                  "server-side exact action filter returned an invalid page",
                ),
              );
            }

            await page.getByRole("button", { name: "Xuất audit" }).click();
            const exportDialog = page.getByRole("dialog", { name: "Xuất nhật ký audit" });
            await exportDialog.waitFor({ state: "visible", timeout: 15_000 });
            await exportDialog.getByRole("radio", { name: /CSV/ }).check();
            const createExportPromise = page.waitForResponse(
              (response) =>
                new URL(response.url()).pathname === "/api/exports" &&
                response.request().method() === "POST",
              { timeout: 30_000 },
            );
            const artifactResponsePromise = page.waitForResponse(
              (response) =>
                new URL(response.url()).pathname.startsWith("/api/exports/download/") &&
                response.request().method() === "GET",
              { timeout: 30_000 },
            );
            const browserDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
            await exportDialog.getByRole("button", { name: "Tạo và tải CSV" }).click();
            const [createExportResponse, artifactResponse, browserDownload] = await Promise.all([
              createExportPromise,
              artifactResponsePromise,
              browserDownloadPromise,
            ]);
            const createExportPayload = await createExportResponse.json().catch(() => null);
            const submittedExport = createExportResponse.request().postDataJSON();
            const artifactBody = await artifactResponse.body();
            const artifactHash = artifactResponse.headers()["x-shcare-artifact-sha256"] || "";
            const disposition = artifactResponse.headers()["content-disposition"] || "";
            const exportJob = createExportPayload?.export;
            if (
              createExportResponse.status() !== 201 ||
              exportJob?.status !== "ready" ||
              exportJob?.format !== "csv" ||
              exportJob?.dataset !== "audit_logs" ||
              exportJob?.scopeKind !== "platform" ||
              submittedExport?.dataset !== "audit_logs" ||
              submittedExport?.format !== "csv" ||
              Object.prototype.hasOwnProperty.call(submittedExport || {}, "organizationId") ||
              submittedExport?.filters?.action !== firstLog.action ||
              artifactResponse.status() !== 200 ||
              !artifactResponse.headers()["content-type"]?.includes("text/csv") ||
              !/\.csv"?$/i.test(disposition) ||
              !/^[a-f0-9]{64}$/i.test(artifactHash) ||
              artifactBody.length < 3 ||
              artifactBody[0] !== 0xef ||
              artifactBody[1] !== 0xbb ||
              artifactBody[2] !== 0xbf ||
              !browserDownload.suggestedFilename().endsWith(".csv")
            ) {
              throw new Error(
                `Audit CSV receipt is invalid: create=${createExportResponse.status()} artifact=${artifactResponse.status()} job=${JSON.stringify(exportJob)} request=${JSON.stringify(submittedExport)} disposition=${disposition} hash=${artifactHash} bytes=${artifactBody.length}`,
              );
            }
            await page
              .getByText("Đã tải artifact do backend tạo.", { exact: true })
              .waitFor({ state: "visible", timeout: 15_000 });
            auditWorkflowVerified = true;
          }
        }

        await inspectPage(page, "/audit-log", viewport, theme, runtimeErrors, responseErrors);

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!fs.existsSync(backendEntry) || !fs.existsSync(viteEntry)) {
    throw new Error("Admin or backend canonical entrypoint is missing.");
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
  await waitForUrl(`${backendOrigin}/api/v1/health`, "backend");
  const credentials = await registerAdmin(backendOrigin);

  startNode(
    "Admin Vite",
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
  await runBrowser(siteOrigin, credentials);

  if (failures.length) {
    console.error(`Admin Clinics browser smoke failed with ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Admin operations browser smoke passed: ${checks} route/viewport/theme checks plus real patient create/update/delete, recipient-scoped notification mutations, server-filtered audit metadata and backend-rendered CSV download with temporary-data cleanup; zero serious/critical axe issues, console/request failures, root overflow, theme drift, provider-state drift, or targets below 44px.`,
  );
}

try {
  await main();
} catch (error) {
  console.error("Admin Clinics browser smoke failed:");
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
