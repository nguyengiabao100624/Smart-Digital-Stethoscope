/* global localStorage */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..", "..");

const adminUrl = (process.env.SMOKE_ADMIN_URL || "https://shcare-admin.web.app").replace(
  /\/+$/,
  "",
);
const apiBase = (
  process.env.SMART_HEALTH_API_BASE_URL ||
  process.env.SMOKE_API_BASE_URL ||
  "https://smart-health-api-r5is.onrender.com/api"
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
const accountKey = process.env.SMOKE_ACCOUNT_KEY || "platform";
const runId = `admin-mutation-${Date.now().toString(36)}`;
const runKey = runId.replace(/[^a-z0-9]/gi, "_");

const sensitiveHeaderNames = new Set(["authorization", "cookie", "set-cookie"]);
const watchPatterns = [
  "/api/auth/firebase",
  "/api/auth/sessions",
  "/api/me",
  "/api/admin/overview-stats",
  "/api/admin/clinics",
  "/api/admin/packages",
  "/api/admin/storage-buckets",
  "/api/patients",
  "/api/devices",
  "/api/notifications",
  "/api/settings",
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
      const lower = key.toLowerCase();
      if (lower.includes("token") || lower.includes("key") || lower.includes("password")) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return String(value)
      .replace(/password=[^&]+/gi, "password=[redacted]")
      .replace(/key=[^&]+/gi, "key=[redacted]")
      .replace(/token=[^&]+/gi, "token=[redacted]");
  }
}

function redactedHeaders(headers) {
  const next = {};
  for (const [key, value] of Object.entries(headers || {})) {
    next[key] = sensitiveHeaderNames.has(key.toLowerCase()) ? "[redacted]" : value;
  }
  return next;
}

function pickError(payload) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error) return String(error.message);
  }
  if (payload && typeof payload === "object" && "message" in payload)
    return String(payload.message);
  return JSON.stringify(payload ?? {});
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function waitSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(700);
}

async function assertNoAdminError(page, label) {
  const body = await page.locator("body").innerText({ timeout: 10_000 });
  const badTexts = [
    "No QueryClient set",
    "Maximum update depth exceeded",
    "Cannot read properties",
    "Firebase: Error",
    "auth/",
    "Khong the ket noi backend",
  ];
  for (const text of badTexts) {
    if (body.includes(text)) {
      throw new Error(`${label}: visible admin error text: ${text}`);
    }
  }
}

async function waitForStoredAdminToken(page) {
  try {
    await page.waitForFunction(
      () =>
        Boolean(
          localStorage.getItem("smart_health_admin_token") ||
          localStorage.getItem("smart_health_token"),
        ),
      undefined,
      { timeout: 60_000 },
    );
  } catch (error) {
    const body = await page
      .locator("body")
      .innerText({ timeout: 5_000 })
      .catch(() => "");
    throw new Error(
      `admin login did not store an auth token: ${
        error instanceof Error ? error.message : String(error)
      }\nVisible page text: ${body.slice(0, 500)}`,
    );
  }
}

async function login(page, account) {
  await page.goto(`${adminUrl}/login?smoke=${encodeURIComponent(runId)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#admin-email").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
  await page.locator("#admin-email").fill(account.email);
  await page.locator("#admin-password").fill(account.password);
  const tokenWait = waitForStoredAdminToken(page);
  await page.locator('form button[type="submit"]').click();
  await tokenWait;

  await page.goto(`${adminUrl}/?smoke=${encodeURIComponent(runId)}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("#admin-global-search", { timeout: 45_000 });
  await assertNoAdminError(page, "admin login");
}

async function apiFetch(page, route, options = {}) {
  const method = options.method || "GET";
  const result = await page.evaluate(
    async ({ apiBaseUrl, routePath, methodName, body }) => {
      const url = new URL(routePath.replace(/^\/+/, ""), `${apiBaseUrl}/`);
      const token =
        localStorage.getItem("smart_health_admin_token") ||
        localStorage.getItem("smart_health_token") ||
        "";
      const headers = {
        "X-Smart-Health-Surface": "admin",
        "X-Smart-Health-Client": "web-admin-smoke",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const init = { method: methodName, headers };
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      const response = await fetch(url.toString(), init);
      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }
      return { ok: response.ok, status: response.status, url: url.toString(), payload };
    },
    {
      apiBaseUrl: apiBase,
      routePath: route,
      methodName: method,
      body: options.body,
    },
  );

  if (!result.ok && !options.allowFailure) {
    throw new Error(`${method} ${route}: HTTP ${result.status} ${pickError(result.payload)}`);
  }
  return result;
}

async function visitRoute(page, href, label) {
  await page.goto(`${adminUrl}${href}?smoke=${encodeURIComponent(runId)}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("#admin-global-search", { timeout: 20_000 });
  await assertNoAdminError(page, label);
  return { label, path: new URL(page.url()).pathname };
}

async function assertAccountRoute(page) {
  await page
    .getByRole("heading", { name: /Cài đặt tài khoản/i })
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.getByText("Thông tin cá nhân").first().waitFor({ state: "visible" });
  await page.getByText("Ảnh đại diện").first().waitFor({ state: "visible" });
  await page.getByText("Thông tin cơ bản").first().waitFor({ state: "visible" });

  await page.getByRole("tab", { name: /Bảo mật tài khoản/i }).click();
  await page.getByText("Đổi mật khẩu").first().waitFor({ state: "visible" });
  await page.getByText("Xác thực hai yếu tố").first().waitFor({ state: "visible" });
  await page.getByText("Phiên đăng nhập hiện tại").first().waitFor({ state: "visible" });

  await page.getByRole("tab", { name: /Thông báo cá nhân/i }).click();
  await page.getByText("Thông báo cá nhân").first().waitFor({ state: "visible" });
}

async function exerciseAdminMutations(page, state) {
  const me = await apiFetch(page, "/me");
  const user = me.payload?.user;
  if (user?.role !== "admin") {
    throw new Error(
      `expected platform admin smoke account, received role=${user?.role || "empty"}`,
    );
  }
  if (
    !Array.isArray(user.capabilities) ||
    !user.capabilities.some((item) => item.startsWith("platform."))
  ) {
    throw new Error("platform smoke account is missing platform capabilities");
  }

  const originalSettingsResult = await apiFetch(page, "/settings");
  const originalSystem = originalSettingsResult.payload?.settings?.system || {};
  state.settings = {
    originalSystem,
    restored: false,
  };

  const clinicId = `org_${runKey}`;
  const clinicResult = await apiFetch(page, "/admin/clinics", {
    method: "POST",
    body: {
      id: clinicId,
      name: `Admin smoke workspace ${runId}`,
      type: "clinic",
      workspaceType: "clinic",
      address: "Smoke Street",
      phone: "0900000000",
      email: `${runKey}@smarthealth.test`,
      website: `https://${runKey}.smarthealth.test`,
    },
  });
  state.clinicId = clinicResult.payload?.clinic?.id || clinicId;

  const clinicPatch = await apiFetch(page, `/admin/clinics/${encodeURIComponent(state.clinicId)}`, {
    method: "PATCH",
    body: {
      name: `Admin smoke workspace ${runId} updated`,
      website: `https://${runKey}-updated.smarthealth.test`,
      subscriptionStatus: "active",
    },
  });

  const packageId = `pkg_${runKey}`;
  const packageResult = await apiFetch(page, "/admin/packages", {
    method: "POST",
    body: {
      id: packageId,
      name: `Admin Smoke Package ${runId}`,
      type: "trial",
      segment: "organization",
      price: 1000,
      duration: "monthly",
      maxDevices: 2,
      maxDoctors: 2,
      maxPatients: 20,
      storageGb: 5,
      aiMonthly: 50,
      retentionDays: 30,
      features: { smoke: true },
    },
  });
  state.packageId = packageResult.payload?.package?.id || packageId;

  const packagePatch = await apiFetch(
    page,
    `/admin/packages/${encodeURIComponent(state.packageId)}`,
    {
      method: "PATCH",
      body: {
        name: `Admin Smoke Package ${runId} updated`,
        price: 2000,
        features: { smoke: true, patched: true },
      },
    },
  );

  const packageAssign = await apiFetch(
    page,
    `/admin/workspaces/${encodeURIComponent(state.clinicId)}/package`,
    {
      method: "POST",
      body: { packageId: state.packageId, subscriptionStatus: "active", billingCycle: "monthly" },
    },
  );

  const patientResult = await apiFetch(page, "/patients", {
    method: "POST",
    body: {
      name: `Admin Smoke Patient ${runId}`,
      age: 44,
      gender: "male",
      phone: "0900000001",
      email: `${runKey}-patient@smarthealth.test`,
      address: "Smoke patient address",
      notes: "Created by Web Admin mutation smoke.",
      organizationId: state.clinicId,
    },
  });
  state.patientId = patientResult.payload?.patient?.id;
  if (!state.patientId) throw new Error("patient create response did not include patient.id");

  const patientPatch = await apiFetch(page, `/patients/${encodeURIComponent(state.patientId)}`, {
    method: "PATCH",
    body: { notes: `Updated by ${runId}` },
  });

  const deviceId = `dev_${runKey}`;
  const deviceResult = await apiFetch(page, "/devices/provision-qr", {
    method: "POST",
    body: {
      deviceId,
      name: `Admin smoke device ${runId}`,
      organizationId: state.clinicId,
    },
  });
  state.deviceId = deviceResult.payload?.device?.id || deviceId;
  if (!deviceResult.payload?.claim?.claimCode) {
    throw new Error("device provision response did not include claim.claimCode");
  }

  const devicePatch = await apiFetch(page, `/devices/${encodeURIComponent(state.deviceId)}`, {
    method: "PATCH",
    body: { name: `Admin smoke device ${runId} updated`, assignedPatientId: state.patientId },
  });

  const notificationResult = await apiFetch(page, "/notifications", {
    method: "POST",
    body: {
      title: `Admin smoke notification ${runId}`,
      message: "Controlled Web Admin mutation smoke notification.",
      type: "info",
      channel: "in_app",
      userId: user.id,
      organizationId: state.clinicId,
    },
  });
  state.notificationId = notificationResult.payload?.notification?.id;
  if (!state.notificationId) throw new Error("notification create response did not include id");

  const notificationRead = await apiFetch(
    page,
    `/notifications/${encodeURIComponent(state.notificationId)}/read`,
    { method: "POST" },
  );

  const bucketId = `bucket_${runKey}`.slice(0, 63);
  const bucketResult = await apiFetch(page, "/admin/storage-buckets", {
    method: "POST",
    body: {
      id: bucketId,
      name: `Admin smoke bucket ${runId}`,
      description: "Empty bucket created by Web Admin mutation smoke.",
      category: "smoke",
      quotaGb: 1,
      visibility: "private",
      allowedExtensions: ["txt"],
      allowedMimeTypes: ["text/plain"],
      maxFileSizeMb: 1,
      retentionDays: 1,
    },
  });
  state.storageBucketId = bucketResult.payload?.bucket?.id || bucketId;

  const settingsPatch = await apiFetch(page, "/settings", {
    method: "PATCH",
    body: {
      system: {
        ...originalSystem,
        supportHotline: "1900 0000",
        updatedAt: new Date().toISOString(),
      },
    },
  });

  return {
    me: {
      role: user.role,
      email: user.email,
      capabilityCount: user.capabilities.length,
    },
    clinic: {
      id: state.clinicId,
      patchedWebsite: clinicPatch.payload?.clinic?.website,
    },
    package: {
      id: state.packageId,
      patchedPrice: packagePatch.payload?.package?.price,
      assignedPackageId: packageAssign.payload?.clinic?.packageId,
    },
    patient: {
      id: state.patientId,
      patchedNotes: patientPatch.payload?.patient?.notes,
    },
    device: {
      id: state.deviceId,
      assignedPatientId: devicePatch.payload?.device?.assignedPatientId,
    },
    notification: {
      id: state.notificationId,
      read: notificationRead.payload?.notification?.read === true,
    },
    storageBucket: {
      id: state.storageBucketId,
    },
    settings: {
      supportHotline: settingsPatch.payload?.settings?.system?.supportHotline,
    },
  };
}

async function cleanup(page, state, cleanupResults) {
  if (state.settings && !state.settings.restored) {
    await apiFetch(page, "/settings", {
      method: "PATCH",
      body: { system: state.settings.originalSystem },
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({ target: "settings", ok: result.ok, status: result.status });
        state.settings.restored = true;
      })
      .catch((error) =>
        cleanupResults.push({ target: "settings", ok: false, error: error.message }),
      );
  }

  if (state.notificationId) {
    await apiFetch(page, `/notifications/${encodeURIComponent(state.notificationId)}`, {
      method: "DELETE",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "notification",
          ok: result.ok || result.status === 404,
          status: result.status,
        });
        state.notificationId = "";
      })
      .catch((error) =>
        cleanupResults.push({ target: "notification", ok: false, error: error.message }),
      );
  }

  if (state.storageBucketId) {
    await apiFetch(page, `/admin/storage-buckets/${encodeURIComponent(state.storageBucketId)}`, {
      method: "DELETE",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "storage bucket",
          ok: result.ok || result.status === 404,
          status: result.status,
        });
        state.storageBucketId = "";
      })
      .catch((error) =>
        cleanupResults.push({ target: "storage bucket", ok: false, error: error.message }),
      );
  }

  if (state.deviceId) {
    await apiFetch(page, `/devices/${encodeURIComponent(state.deviceId)}`, {
      method: "DELETE",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "device",
          ok: result.ok || result.status === 404,
          status: result.status,
        });
        state.deviceId = "";
      })
      .catch((error) => cleanupResults.push({ target: "device", ok: false, error: error.message }));
  }

  if (state.patientId) {
    await apiFetch(page, `/patients/${encodeURIComponent(state.patientId)}`, {
      method: "DELETE",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "patient",
          ok: result.ok || result.status === 404,
          status: result.status,
        });
        state.patientId = "";
      })
      .catch((error) =>
        cleanupResults.push({ target: "patient", ok: false, error: error.message }),
      );
  }

  if (state.packageId) {
    await apiFetch(page, `/admin/packages/${encodeURIComponent(state.packageId)}`, {
      method: "DELETE",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "package",
          ok: result.ok || result.status === 404,
          status: result.status,
        });
        state.packageId = "";
      })
      .catch((error) =>
        cleanupResults.push({ target: "package", ok: false, error: error.message }),
      );
  }

  if (state.clinicId) {
    await apiFetch(page, `/admin/clinics/${encodeURIComponent(state.clinicId)}`, {
      method: "DELETE",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "workspace",
          ok: result.ok || result.status === 404,
          status: result.status,
        });
        state.clinicId = "";
      })
      .catch((error) =>
        cleanupResults.push({ target: "workspace", ok: false, error: error.message }),
      );
  }
}

async function main() {
  const account = readSmokeAccount();
  const checkedResponses = [];
  const requestFailures = [];
  const consoleMessages = [];
  const cleanupResults = [];
  const state = {};

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text().slice(0, 300) });
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({
      url: sanitizeUrl(request.url()),
      method: request.method(),
      headers: redactedHeaders(request.headers()),
      failure: request.failure()?.errorText || "",
    });
  });
  page.on("response", (response) => {
    const url = response.url();
    if (watchPatterns.some((pattern) => url.includes(pattern))) {
      checkedResponses.push({
        url: sanitizeUrl(url),
        method: response.request().method(),
        status: response.status(),
      });
    }
  });

  try {
    await login(page, account);
    const mutations = await exerciseAdminMutations(page, state);

    const routeChecks = [];
    for (const [href, label] of [
      ["/", "overview"],
      ["/account", "account settings"],
      ["/devices", "devices"],
      ["/patients", "patients"],
      ["/clinics", "clinics"],
      ["/packages", "packages"],
      ["/notifications", "notifications"],
      ["/storage", "storage"],
      ["/settings", "settings"],
      ["/admin-accounts", "admin accounts"],
      ["/audit-log", "audit log"],
    ]) {
      const routeCheck = await visitRoute(page, href, label);
      if (href === "/account") {
        await assertAccountRoute(page);
      }
      routeChecks.push(routeCheck);
    }

    const badResponses = checkedResponses.filter((item) => item.status >= 400);
    const actionableRequestFailures = requestFailures.filter((item) => {
      if (item.failure === "net::ERR_ABORTED") return false;
      if (item.url.includes("/favicon.")) return false;
      if (item.url.includes("fonts.gstatic.com")) return false;
      return true;
    });
    const severeConsole = consoleMessages.filter((item) => {
      if (item.type !== "error") return false;
      if (item.text.includes("favicon")) return false;
      if (
        item.text.includes("Failed to load resource: the server responded with a status of 404") &&
        badResponses.length === 0
      ) {
        return false;
      }
      return true;
    });

    if (badResponses.length || actionableRequestFailures.length || severeConsole.length) {
      throw new Error(
        JSON.stringify(
          { badResponses, requestFailures: actionableRequestFailures, severeConsole },
          null,
          2,
        ),
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          runId,
          adminUrl,
          apiBase,
          mutations,
          routeChecks,
          checkedResponses,
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanup(page, state, cleanupResults).catch((error) => {
      cleanupResults.push({ target: "final cleanup", ok: false, error: error.message });
    });
    if (cleanupResults.length) {
      console.log(JSON.stringify({ cleanupResults }, null, 2));
    }
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Smart Health Web Admin mutation smoke: FAIL");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
