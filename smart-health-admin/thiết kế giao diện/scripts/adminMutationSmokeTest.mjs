/* global localStorage */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { getAdminSmokeContracts } from "../src/contracts/admin-route-contract.ts";

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
const factoryDeviceId = (process.env.SMOKE_FACTORY_DEVICE_ID || "").trim();
const apiPaceMs = Math.max(0, Number(process.env.SMOKE_API_PACE_MS || 0) || 0);
const apiWarmupMs = Math.max(0, Number(process.env.SMOKE_API_WARMUP_MS || 0) || 0);
const staleCleanupWarmupMs = Math.max(
  0,
  Number(process.env.SMOKE_STALE_CLEANUP_WARMUP_MS || 0) || 0,
);
const finalCleanupWarmupMs = Math.max(
  0,
  Number(process.env.SMOKE_FINAL_CLEANUP_WARMUP_MS || 0) || 0,
);
const skipRouteSweep = process.env.SMOKE_SKIP_ROUTE_SWEEP === "1";
const skipDeviceFlow = process.env.SMOKE_SKIP_DEVICE_FLOW === "1";
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
  "/api/admin/admin-users",
  "/api/admin/doctors",
  "/api/admin/doctor-requests",
  "/api/patients",
  "/api/scans",
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
  const token = await page.evaluate(
    () =>
      localStorage.getItem("smart_health_admin_token") ||
      localStorage.getItem("smart_health_token") ||
      "",
  );
  const url = new URL(route.replace(/^\/+/, ""), `${apiBase}/`);
  const headers = {
    "User-Agent": "Shcare-Production-Smoke/1.0",
    "X-Smart-Health-Surface": "admin",
    "X-Smart-Health-Client": "web-admin-smoke",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (options.bodyBase64 !== undefined) {
    headers["Content-Type"] = options.contentType || "application/octet-stream";
    init.body = Buffer.from(options.bodyBase64, "base64");
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  let result;
  const maxAttempts = options.retryTransient ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, init);
    const responseText = await response.text();
    let payload = null;
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        payload = responseText;
      }
    }
    result = { ok: response.ok, status: response.status, url: url.toString(), payload };
    if (![502, 503, 504].includes(response.status) || attempt === maxAttempts) break;
    await page.waitForTimeout(15_000);
  }

  if (!result.ok && !options.allowFailure) {
    throw new Error(`${method} ${route}: HTTP ${result.status} ${pickError(result.payload)}`);
  }
  if (apiPaceMs > 0) {
    await page.waitForTimeout(apiPaceMs);
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

async function getBodyExcerpt(page, limit = 1200) {
  const body = await page
    .locator("body")
    .innerText({ timeout: 5_000 })
    .catch(() => "");
  return body.replace(/\s+/g, " ").trim().slice(0, limit);
}

function summarizeDoctorPayload(payload, email) {
  const doctors = Array.isArray(payload?.doctors) ? payload.doctors : [];
  return {
    count: doctors.length,
    foundInApi: doctors.some((doctor) => String(doctor.email || "") === email),
    sample: doctors.slice(0, 8).map((doctor) => ({
      id: doctor.id || "",
      email: doctor.email || "",
      organizationId: doctor.organizationId || "",
      accountStatus: doctor.accountStatus || "",
      roleRequestStatus: doctor.roleRequestStatus || "",
    })),
  };
}

function summarizeDoctorRequestPayload(payload, email) {
  const requests = Array.isArray(payload?.requests) ? payload.requests : [];
  return {
    count: requests.length,
    foundInApi: requests.some((request) => String(request.email || "") === email),
    sample: requests.slice(0, 8).map((request) => ({
      id: request.id || "",
      email: request.email || "",
      organizationId: request.organizationId || "",
      accountStatus: request.accountStatus || "",
      roleRequestStatus: request.roleRequestStatus || request.status || "",
    })),
  };
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

async function assertAdminAccountsRoute(page, state) {
  await page
    .getByRole("heading", { name: /Quản lý tài khoản admin/i })
    .waitFor({ state: "visible", timeout: 15_000 });
  if (state.adminUserEmail) {
    await page.getByPlaceholder(/Tìm theo tên/i).fill(state.adminUserEmail);
    await page
      .getByText(state.adminUserEmail)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  }
}

async function assertDoctorsRoute(page, state) {
  await page
    .getByRole("heading", { name: /Quản lý bác sĩ/i })
    .waitFor({ state: "visible", timeout: 15_000 });
  if (state.doctorEmail) {
    const apiResponse = await apiFetch(page, "/admin/doctors");
    const apiSummary = summarizeDoctorPayload(apiResponse.payload, state.doctorEmail);
    if (!apiSummary.foundInApi) {
      throw new Error(
        `doctors route API did not return created doctor ${state.doctorEmail}: ${JSON.stringify(
          apiSummary,
          null,
          2,
        )}`,
      );
    }
    await page.getByPlaceholder(/Tìm tên bác sĩ/i).fill(state.doctorEmail);
    try {
      await page
        .getByText(state.doctorEmail)
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
    } catch (error) {
      const bodyExcerpt = await getBodyExcerpt(page);
      const searchValue = await page
        .getByPlaceholder(/Tìm tên bác sĩ/i)
        .inputValue()
        .catch(() => "");
      throw new Error(
        `doctors route UI did not render created doctor ${state.doctorEmail}: ${JSON.stringify(
          {
            apiSummary,
            searchValue,
            bodyExcerpt,
            originalError: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        )}`,
      );
    }
  }
}

async function assertDoctorApprovalRoute(page, state) {
  await page
    .getByRole("heading", { name: /Duyệt tài khoản bác sĩ/i })
    .waitFor({ state: "visible", timeout: 15_000 });
  if (state.doctorEmail) {
    const apiResponse = await apiFetch(page, "/admin/doctor-requests?status=approved");
    const apiSummary = summarizeDoctorRequestPayload(apiResponse.payload, state.doctorEmail);
    if (!apiSummary.foundInApi) {
      throw new Error(
        `doctor approval API did not return approved doctor ${state.doctorEmail}: ${JSON.stringify(
          apiSummary,
          null,
          2,
        )}`,
      );
    }
    await page.getByRole("tab", { name: /Đã duyệt/i }).click();
    await page.getByPlaceholder(/Tìm tên, email, UID/i).fill(state.doctorEmail);
    try {
      await page
        .getByText(state.doctorEmail)
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
    } catch (error) {
      const bodyExcerpt = await getBodyExcerpt(page);
      const searchValue = await page
        .getByPlaceholder(/Tìm tên, email, UID/i)
        .inputValue()
        .catch(() => "");
      throw new Error(
        `doctor approval UI did not render approved doctor ${state.doctorEmail}: ${JSON.stringify(
          {
            apiSummary,
            searchValue,
            bodyExcerpt,
            originalError: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        )}`,
      );
    }
  }
}

async function assertAiMeasurementsRoute(page, state) {
  await page
    .getByRole("heading", { name: /Lượt đo & AI Processing/i })
    .waitFor({ state: "visible", timeout: 15_000 });
  if (state.scanId) {
    await page.getByRole("button", { name: /Hoàn tất/i }).click();
    await page.getByPlaceholder(/Tìm Scan ID/i).fill(state.scanId);
    await page.getByText(state.scanId).first().waitFor({ state: "visible", timeout: 15_000 });
  }
}

function buildPcmChunkBase64({ sampleRate = 16_000, seconds = 1 } = {}) {
  const sampleCount = sampleRate * seconds;
  const buffer = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 9000);
    buffer.writeInt16LE(value, index * 2);
  }
  return buffer.toString("base64");
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
  const adminOrganizationId = String(user.currentWorkspaceId || user.organizationId || "");
  if (!adminOrganizationId) {
    throw new Error("platform smoke account has no active workspace for managed-admin mutations");
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
    headers: { "Idempotency-Key": `${runId}:workspace:create` },
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
  state.clinicVersion = Number(clinicResult.payload?.clinic?.version || 1);

  const clinicPatch = await apiFetch(page, `/admin/clinics/${encodeURIComponent(state.clinicId)}`, {
    method: "PATCH",
    headers: { "Idempotency-Key": `${runId}:workspace:update` },
    body: {
      name: `Admin smoke workspace ${runId} updated`,
      website: `https://${runKey}-updated.smarthealth.test`,
      subscriptionStatus: "active",
      expectedVersion: state.clinicVersion,
    },
  });
  state.clinicVersion = Number(clinicPatch.payload?.clinic?.version || state.clinicVersion + 1);

  const adminEmail = `${runKey}-workspace-admin@smarthealth.test`;
  const adminCreate = await apiFetch(page, "/admin/admin-users", {
    method: "POST",
    headers: { "Idempotency-Key": `${runId}:admin-account:create` },
    body: {
      role: "workspace_admin",
      email: adminEmail,
      password: `Smoke${runKey}!1`,
      name: `Smoke Workspace Admin ${runId}`,
      phone: "0900000090",
      title: "Smoke workspace admin",
      organizationId: adminOrganizationId,
    },
  });
  state.adminUserId = adminCreate.payload?.user?.id;
  state.adminUserEmail = adminEmail;
  if (!state.adminUserId) throw new Error("admin account create response did not include user.id");

  const adminPatch = await apiFetch(
    page,
    `/admin/admin-users/${encodeURIComponent(state.adminUserId)}`,
    {
      method: "PATCH",
      body: {
        name: `Smoke Workspace Admin ${runId} patched`,
        phone: "0900000091",
        title: "Smoke admin patched",
      },
    },
  );
  const adminReset = await apiFetch(
    page,
    `/admin/admin-users/${encodeURIComponent(state.adminUserId)}/reset-password`,
    {
      method: "POST",
      body: { password: `Smoke${runKey}!2` },
    },
  );
  const adminLock = await apiFetch(
    page,
    `/admin/admin-users/${encodeURIComponent(state.adminUserId)}`,
    { method: "PATCH", body: { accountStatus: "locked" }, retryTransient: true },
  );
  const adminUnlock = await apiFetch(
    page,
    `/admin/admin-users/${encodeURIComponent(state.adminUserId)}`,
    { method: "PATCH", body: { accountStatus: "active" }, retryTransient: true },
  );

  const packageId = `pkg_${runKey}`;
  const packageResult = await apiFetch(page, "/admin/packages", {
    method: "POST",
    headers: { "Idempotency-Key": `${runId}:package:create` },
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
      headers: { "Idempotency-Key": `${runId}:package:update` },
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

  let deviceEvidence = {
    skipped: true,
    reason: "No disposable factory-enrolled production fixture was supplied.",
  };
  if (!skipDeviceFlow) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(factoryDeviceId)) {
      throw new Error(
        "Device provisioning smoke requires SMOKE_FACTORY_DEVICE_ID for a dedicated factory-enrolled inventory record. The browser must never mint a device id or submit a raw credential.",
      );
    }
    const deviceId = factoryDeviceId;
    const deviceResult = await apiFetch(page, "/devices/provision-qr", {
      method: "POST",
      body: {
        deviceId,
        name: `Admin smoke device ${runId}`,
        organizationId: state.clinicId,
        type: "stethoscope",
        manufacturer: "Shcare test fixture",
        model: "MSM261S4030H0",
        serialNumber: `SMOKE-${runKey.slice(-24)}`,
      },
    });
    state.deviceId = deviceResult.payload?.device?.id || "";
    if (state.deviceId !== deviceId) {
      throw new Error(
        `device provision response did not confirm the exact factory device id ${deviceId}`,
      );
    }
    if (!deviceResult.payload?.claim?.claimCode) {
      throw new Error("device provision response did not include claim.claimCode");
    }

    const devicePatch = await apiFetch(page, `/devices/${encodeURIComponent(state.deviceId)}`, {
      method: "PATCH",
      body: { name: `Admin smoke device ${runId} updated`, assignedPatientId: state.patientId },
    });
    deviceEvidence = {
      skipped: false,
      id: state.deviceId,
      assignedPatientId: devicePatch.payload?.device?.assignedPatientId,
    };
  }

  const doctorEmail = `${runKey}-doctor@smarthealth.test`;
  const doctorCreate = await apiFetch(page, "/admin/doctors", {
    method: "POST",
    body: {
      name: `BS Smoke ${runId}`,
      email: doctorEmail,
      phone: "0900000022",
      license: `CCHN-${runKey.slice(-8)}`,
      department: "Tim mạch",
      organizationId: state.clinicId,
    },
  });
  state.doctorUserId = doctorCreate.payload?.doctor?.id;
  state.doctorEmail = doctorEmail;
  if (!state.doctorUserId) throw new Error("doctor create response did not include doctor.id");

  const doctorLock = await apiFetch(
    page,
    `/admin/doctors/${encodeURIComponent(state.doctorUserId)}/lock`,
    { method: "PATCH" },
  );
  const doctorUnlock = await apiFetch(
    page,
    `/admin/doctors/${encodeURIComponent(state.doctorUserId)}/unlock`,
    { method: "PATCH" },
  );
  const doctorRequests = await apiFetch(page, "/admin/doctor-requests?status=all");

  let scanEvidence = {
    skipped: true,
    reason: "Scan mutation requires the disposable factory-enrolled production fixture.",
  };
  if (!skipDeviceFlow) {
    const scanCreate = await apiFetch(page, "/scans", {
      method: "POST",
      body: {
        patientId: state.patientId,
        deviceId: state.deviceId,
        mode: "heart",
        bodySite: "apex",
        doctorNotes: `Created by ${runId}`,
      },
    });
    state.scanId = scanCreate.payload?.scan?.id;
    if (!state.scanId) throw new Error("scan create response did not include scan.id");

    const scanChunk = await apiFetch(
      page,
      `/scans/${encodeURIComponent(state.scanId)}/audio-chunks`,
      {
        method: "POST",
        bodyBase64: buildPcmChunkBase64(),
        contentType: "application/octet-stream",
      },
    );
    const scanComplete = await apiFetch(
      page,
      `/scans/${encodeURIComponent(state.scanId)}/complete`,
      { method: "POST" },
    );
    const scanReprocess = await apiFetch(
      page,
      `/scans/${encodeURIComponent(state.scanId)}/reprocess`,
      { method: "POST" },
    );
    scanEvidence = {
      skipped: false,
      id: state.scanId,
      uploadedBytes: scanChunk.payload?.uploadedBytes,
      completedStatus: scanComplete.payload?.scan?.status,
      reprocessedStatus: scanReprocess.payload?.scan?.status,
      aiLabel: scanReprocess.payload?.scan?.aiLabel,
    };
  }

  const notificationResult = await apiFetch(page, "/notifications", {
    method: "POST",
    headers: { "Idempotency-Key": `${runId}:notification-campaign:create` },
    body: {
      title: `Admin smoke notification ${runId}`,
      message: "Controlled Web Admin mutation smoke notification.",
      type: "info",
      audience: {
        type: "users",
        workspaceId: state.clinicId,
        userIds: [state.adminUserId],
      },
      channels: ["in_app"],
    },
  });
  state.notificationId = notificationResult.payload?.notification?.id;
  if (!state.notificationId) throw new Error("notification create response did not include id");
  if (notificationResult.payload?.campaign?.recipientCount !== 1) {
    throw new Error("notification campaign response did not confirm one recipient");
  }

  const notificationRead = await apiFetch(
    page,
    `/notifications/${encodeURIComponent(state.notificationId)}/read`,
    { method: "POST" },
  );

  const bucketId = `bucket_${runKey}`.slice(0, 63);
  const bucketResult = await apiFetch(page, "/admin/storage-buckets", {
    method: "POST",
    headers: { "Idempotency-Key": `${runId}:storage-bucket:create` },
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
    adminAccount: {
      id: state.adminUserId,
      email: state.adminUserEmail,
      patchedTitle: adminPatch.payload?.user?.title,
      resetOk: adminReset.payload?.ok === true,
      lockedStatus: adminLock.payload?.user?.accountStatus,
      unlockedStatus: adminUnlock.payload?.user?.accountStatus,
    },
    patient: {
      id: state.patientId,
      patchedNotes: patientPatch.payload?.patient?.notes,
    },
    device: deviceEvidence,
    doctor: {
      id: state.doctorUserId,
      email: state.doctorEmail,
      lockedStatus: doctorLock.payload?.request?.accountStatus,
      unlockedStatus: doctorUnlock.payload?.request?.accountStatus,
      requestCount: Array.isArray(doctorRequests.payload?.requests)
        ? doctorRequests.payload.requests.length
        : 0,
    },
    scan: scanEvidence,
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

async function cleanupStaleSmokeArtifacts(page) {
  const cleanupResults = [];
  const adminInventory = await apiFetch(page, "/admin/admin-users?limit=200", {
    allowFailure: true,
  });
  const admins = Array.isArray(adminInventory.payload?.users)
    ? adminInventory.payload.users
    : Array.isArray(adminInventory.payload?.adminUsers)
      ? adminInventory.payload.adminUsers
      : [];
  for (const admin of admins) {
    const email = String(admin?.email || "").toLowerCase();
    if (!/^(admin_mutation_|diag_admin_)[a-z0-9_-]*@smarthealth\.test$/.test(email)) continue;
    const result = await apiFetch(page, `/admin/admin-users/${encodeURIComponent(admin.id)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": `${runId}:stale-admin:${admin.id}` },
      allowFailure: true,
    });
    cleanupResults.push({ target: "stale admin account", id: admin.id, status: result.status });
  }

  const clinicInventory = await apiFetch(page, "/admin/clinics?limit=200", {
    allowFailure: true,
  });
  const clinics = Array.isArray(clinicInventory.payload?.clinics)
    ? clinicInventory.payload.clinics
    : [];
  for (const clinic of clinics) {
    const id = String(clinic?.id || "");
    const name = String(clinic?.name || "");
    if (!/^org_admin_mutation_[a-z0-9_]+$/.test(id) || !/^Admin smoke workspace /.test(name)) {
      continue;
    }
    let expectedVersion = Number(clinic?.version || 1);
    if (clinic?.status === "active") {
      const transition = await apiFetch(page, `/admin/clinics/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Idempotency-Key": `${runId}:stale-workspace-inactivate:${id}` },
        body: {
          status: "inactive",
          reason: "Automated production smoke cleanup",
          expectedVersion,
        },
        allowFailure: true,
      });
      if (!transition.ok) {
        cleanupResults.push({
          target: "stale workspace transition",
          id,
          status: transition.status,
        });
        continue;
      }
      expectedVersion = Number(
        transition.payload?.workspace?.version ||
          transition.payload?.clinic?.version ||
          expectedVersion + 1,
      );
    }
    const result = await apiFetch(page, `/admin/clinics/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": `${runId}:stale-workspace-archive:${id}` },
      body: { expectedVersion },
      allowFailure: true,
    });
    cleanupResults.push({ target: "stale workspace", id, status: result.status });
  }
  return cleanupResults;
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

  if (state.scanId) {
    await apiFetch(page, `/scans/${encodeURIComponent(state.scanId)}`, {
      method: "DELETE",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "scan",
          ok: result.ok || result.status === 404,
          status: result.status,
        });
        state.scanId = "";
      })
      .catch((error) => cleanupResults.push({ target: "scan", ok: false, error: error.message }));
  }

  if (state.storageBucketId) {
    await apiFetch(page, `/admin/storage-buckets/${encodeURIComponent(state.storageBucketId)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": `${runId}:storage-bucket:delete` },
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
    await apiFetch(page, `/devices/${encodeURIComponent(state.deviceId)}/revoke`, {
      method: "POST",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "device revoke",
          ok: result.ok || result.status === 404,
          status: result.status,
          retainedForAudit: result.ok,
        });
        state.deviceId = "";
      })
      .catch((error) =>
        cleanupResults.push({ target: "device revoke", ok: false, error: error.message }),
      );
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

  if (state.doctorUserId) {
    await apiFetch(page, `/admin/doctors/${encodeURIComponent(state.doctorUserId)}`, {
      method: "DELETE",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "doctor",
          ok: result.ok || result.status === 404,
          status: result.status,
        });
        state.doctorUserId = "";
      })
      .catch((error) => cleanupResults.push({ target: "doctor", ok: false, error: error.message }));
  }

  if (state.adminUserId) {
    await apiFetch(page, `/admin/admin-users/${encodeURIComponent(state.adminUserId)}`, {
      method: "DELETE",
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "admin account",
          ok: result.ok || result.status === 404,
          status: result.status,
        });
        state.adminUserId = "";
      })
      .catch((error) =>
        cleanupResults.push({ target: "admin account", ok: false, error: error.message }),
      );
  }

  if (state.clinicId) {
    await (async () => {
      const inventory = await apiFetch(page, "/admin/clinics?limit=100", {
        allowFailure: true,
      });
      const current = inventory.payload?.clinics?.find((item) => item.id === state.clinicId);
      let expectedVersion = Number(current?.version || state.clinicVersion || 1);
      if (current?.status === "active") {
        const transition = await apiFetch(
          page,
          `/admin/clinics/${encodeURIComponent(state.clinicId)}`,
          {
            method: "PATCH",
            headers: { "Idempotency-Key": `${runId}:workspace:inactivate` },
            body: {
              status: "inactive",
              reason: "Automated production smoke cleanup",
              expectedVersion,
            },
            allowFailure: true,
          },
        );
        if (!transition.ok) return transition;
        expectedVersion = Number(
          transition.payload?.workspace?.version ||
            transition.payload?.clinic?.version ||
            expectedVersion + 1,
        );
      }
      return apiFetch(page, `/admin/clinics/${encodeURIComponent(state.clinicId)}`, {
        method: "DELETE",
        headers: { "Idempotency-Key": `${runId}:workspace:archive` },
        body: { expectedVersion },
        allowFailure: true,
      });
    })()
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

  if (state.packageId) {
    await apiFetch(page, `/admin/packages/${encodeURIComponent(state.packageId)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": `${runId}:package:archive` },
      allowFailure: true,
    })
      .then((result) => {
        cleanupResults.push({
          target: "package archive",
          ok: result.ok || result.status === 404,
          status: result.status,
          retainedForAudit: result.ok,
        });
        state.packageId = "";
      })
      .catch((error) =>
        cleanupResults.push({ target: "package archive", ok: false, error: error.message }),
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
    if (apiWarmupMs > 0) {
      await page.waitForTimeout(apiWarmupMs);
    }
    const staleCleanup = await cleanupStaleSmokeArtifacts(page);
    if (staleCleanup.length) {
      console.log(JSON.stringify({ staleCleanup }, null, 2));
      if (staleCleanupWarmupMs > 0) {
        await page.waitForTimeout(staleCleanupWarmupMs);
      }
    }
    const mutations = await exerciseAdminMutations(page, state);

    const routeChecks = [];
    const routeContracts = skipRouteSweep ? [] : getAdminSmokeContracts("admin");
    for (const contract of routeContracts) {
      const href = contract.path;
      const label = contract.smokeId;
      const routeCheck = await visitRoute(page, href, label);
      try {
        if (href === "/account") {
          await assertAccountRoute(page);
        } else if (href === "/admin-accounts") {
          await assertAdminAccountsRoute(page, state);
        } else if (href === "/doctors") {
          await assertDoctorsRoute(page, state);
        } else if (href === "/doctor-approval") {
          await assertDoctorApprovalRoute(page, state);
        } else if (href === "/ai-measurements") {
          await assertAiMeasurementsRoute(page, state);
        }
      } catch (error) {
        throw new Error(
          `${label} route assertion failed: ${error instanceof Error ? error.message : String(error)}`,
        );
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
    if (finalCleanupWarmupMs > 0 && Object.keys(state).length > 0) {
      await page.waitForTimeout(finalCleanupWarmupMs);
    }
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
