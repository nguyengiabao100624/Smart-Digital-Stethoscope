/* global localStorage */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");

const siteUrl = (
  process.env.SMART_HEALTH_WEB_URL || "https://shcare.web.app"
).replace(/\/+$/, "");
const apiBase = (
  process.env.SMART_HEALTH_API_BASE_URL ||
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
const accountKey = process.env.SMOKE_ACCOUNT_KEY || "workspace";
const runId = `portal-mutation-${Date.now().toString(36)}`;
const disableWebSecurity = process.env.SMOKE_DISABLE_WEB_SECURITY === "1";

const sensitiveHeaderNames = new Set(["authorization", "cookie", "set-cookie"]);
const watchPatterns = [
  "/api/auth/firebase",
  "/api/me",
  "/api/portal/status",
  "/api/portal/patients",
  "/api/portal/devices",
  "/api/portal/notifications",
  "/api/portal/settings",
  "/api/portal/reports",
  "/api/portal/support",
];

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

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (
        lower.includes("token") ||
        lower.includes("key") ||
        lower.includes("password")
      ) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return String(value)
      .replace(/key=[^&]+/g, "key=[redacted]")
      .replace(/token=[^&]+/g, "token=[redacted]");
  }
}

function redactedHeaders(headers) {
  const next = {};
  for (const [key, value] of Object.entries(headers || {})) {
    next[key] = sensitiveHeaderNames.has(key.toLowerCase())
      ? "[redacted]"
      : value;
  }
  return next;
}

function cssAttributeValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function pickError(payload) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && "message" in error)
      return String(error.message);
  }
  return JSON.stringify(payload ?? {});
}

async function waitSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(600);
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
      throw new Error(`${label}: visible portal error text: ${text}`);
    }
  }
}

async function readResponsePayload(response, label) {
  const status = response.status();
  const text = await response.text().catch(() => "");
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (status >= 400) {
    throw new Error(`${label}: HTTP ${status} ${pickError(payload)}`);
  }
  return payload;
}

function waitForApiResponse(page, pathFragment, method) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(pathFragment) &&
      response.request().method() === method,
    { timeout: 45_000 },
  );
}

async function apiFetch(page, route, options = {}) {
  const method = options.method || "GET";
  const result = await page.evaluate(
    async ({ apiBaseUrl, routePath, methodName, body }) => {
      const url = new URL(routePath.replace(/^\/+/, ""), `${apiBaseUrl}/`);
      const token = localStorage.getItem("smart_health_token") || "";
      const headers = {
        "X-Smart-Health-Surface": "portal",
        "X-Smart-Health-Client": "web-smoke",
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
      return {
        ok: response.ok,
        status: response.status,
        url: url.toString(),
        payload,
      };
    },
    {
      apiBaseUrl: apiBase,
      routePath: route,
      methodName: method,
      body: options.body,
    },
  );

  if (!result.ok && !options.allowFailure) {
    throw new Error(
      `${method} ${route}: HTTP ${result.status} ${pickError(result.payload)}`,
    );
  }
  return result;
}

async function login(page, account, label = "login") {
  await page.goto(
    `${siteUrl}/login?smoke=${encodeURIComponent(runId)}-${label}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill(account.password);
  await Promise.all([
    page.waitForURL("**/portal**", { timeout: 45_000 }),
    page.locator('form button[type="submit"]').click(),
  ]);
  await waitSettled(page);
  await page.waitForSelector(".clinical-topbar", { timeout: 20_000 });
  await assertNoPortalError(page, label);
}

async function createPatientViaUi(page, state) {
  const patientName = `Smoke Portal Patient ${runId}`;
  await page.goto(
    `${siteUrl}/portal/patients?smoke=${encodeURIComponent(runId)}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await waitSettled(page);
  await page.waitForSelector("#portal-add-patient", { timeout: 20_000 });
  await page.locator("#portal-add-patient").click();
  await page.locator("#portal-patient-name").fill(patientName);
  await page.locator("#portal-patient-phone").fill("0900000000");
  await page.locator("#portal-patient-email").fill(`${runId}@smarthealth.test`);
  await page.locator("#portal-patient-age").fill("42");

  const createResponse = waitForApiResponse(
    page,
    "/api/portal/patients",
    "POST",
  );
  await page.locator("#portal-save-patient").click();
  const payload = await readResponsePayload(
    await createResponse,
    "create patient",
  );
  const patient = payload?.patient;
  if (!patient?.id) {
    throw new Error("create patient: response did not include patient.id");
  }
  state.patientId = patient.id;

  await page.locator("#portal-patient-search").fill(patientName);
  await waitSettled(page);
  await page
    .getByText(patientName, { exact: false })
    .first()
    .waitFor({ timeout: 15_000 });
  return { patient, patientName };
}

async function updatePatientNotesViaUi(page, patientId) {
  const note = `Mutation smoke note ${runId}`;
  await page.goto(
    `${siteUrl}/portal/patients/${encodeURIComponent(patientId)}?smoke=${runId}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await waitSettled(page);
  await page.waitForSelector("#patient-clinical-notes", { timeout: 20_000 });
  await page.locator("#patient-clinical-notes").fill(note);
  const updateResponse = waitForApiResponse(
    page,
    `/api/portal/patients/${encodeURIComponent(patientId)}`,
    "PATCH",
  );
  await page.locator("#patient-save-notes").click();
  const payload = await readResponsePayload(
    await updateResponse,
    "update patient notes",
  );
  if (payload?.patient?.notes !== note) {
    const verified = await apiFetch(
      page,
      `/portal/patients/${encodeURIComponent(patientId)}`,
    );
    if (verified.payload?.patient?.notes !== note) {
      throw new Error("update patient notes: backend did not persist the note");
    }
  }
  return { note };
}

async function exerciseDeviceAssignment(page, patientId, state) {
  const devicesResult = await apiFetch(page, "/portal/devices");
  const devices = Array.isArray(devicesResult.payload?.devices)
    ? devicesResult.payload.devices
    : [];
  const device = devices[0];
  if (!device?.id) {
    return { skipped: true, reason: "workspace has no devices" };
  }

  const originalAssignedPatientId = device.assignedPatientId || "";
  state.deviceAssignment = {
    deviceId: device.id,
    originalAssignedPatientId,
    restored: false,
  };
  await page.goto(`${siteUrl}/portal/devices/assign?smoke=${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("#assign-device-id", { timeout: 20_000 });
  await page.locator("#assign-device-id").selectOption(device.id);
  await page.locator("#assign-patient-id").selectOption(patientId);

  const assignResponse = waitForApiResponse(
    page,
    `/api/portal/devices/${encodeURIComponent(device.id)}`,
    "PATCH",
  );
  await page.locator("#assign-device-submit").click();
  const payload = await readResponsePayload(
    await assignResponse,
    "assign device",
  );
  const assignedPatientId = payload?.device?.assignedPatientId || "";
  if (assignedPatientId && assignedPatientId !== patientId) {
    throw new Error(
      `assign device: expected ${patientId}, received ${assignedPatientId}`,
    );
  }

  return {
    skipped: false,
    deviceId: device.id,
    originalAssignedPatientId,
    assignedPatientId: assignedPatientId || patientId,
  };
}

async function exerciseDeviceClaim(page, state) {
  const deviceId = `claim_${runId.replace(/[^a-z0-9]/gi, "_")}`;
  const provision = await apiFetch(page, "/portal/devices/provision-qr", {
    method: "POST",
    body: {
      deviceId,
      name: `Claim smoke ${runId}`,
    },
  });
  const claimCode = provision.payload?.claim?.claimCode;
  if (!claimCode) {
    throw new Error("claim device: backend did not return a claim code");
  }
  state.claimedDevice = { deviceId, deleted: false };

  await page.goto(`${siteUrl}/portal/devices/claim?smoke=${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("#claim-device-id", { timeout: 20_000 });
  await page.locator("#claim-device-id").fill(deviceId);
  await page.locator("#claim-device-code").fill(claimCode);
  await page.locator("#claim-device-name").fill(`Claim smoke ${runId}`);

  const claimResponse = waitForApiResponse(page, "/api/portal/devices/pair", "POST");
  await page.locator("#claim-device-submit").click();
  const payload = await readResponsePayload(await claimResponse, "claim device");
  if (payload?.device?.id !== deviceId) {
    throw new Error(`claim device: expected ${deviceId}, received ${payload?.device?.id || "empty"}`);
  }
  return {
    deviceId,
    pairedUserId: payload.device.pairedUserId || "",
    status: payload.device.status || "",
  };
}

async function createReadDeleteNotification(page, state) {
  const meResult = await apiFetch(page, "/me");
  const currentUserId = meResult.payload?.user?.id;
  if (!currentUserId) {
    throw new Error("create notification: /me did not include user.id");
  }
  const notificationResult = await apiFetch(page, "/portal/notifications", {
    method: "POST",
    body: {
      type: "info",
      title: `Smoke notification ${runId}`,
      message: "Controlled portal mutation smoke notification.",
      channel: "in_app",
      userId: currentUserId,
    },
  });
  const notification = notificationResult.payload?.notification;
  if (!notification?.id) {
    throw new Error(
      "create notification: response did not include notification.id",
    );
  }
  state.notificationId = notification.id;

  const idSelector = cssAttributeValue(notification.id);
  await page.goto(`${siteUrl}/portal/notifications?smoke=${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector(`[data-notification-read="${idSelector}"]`, {
    timeout: 20_000,
  });

  const readResponse = waitForApiResponse(
    page,
    `/api/portal/notifications/${encodeURIComponent(notification.id)}/read`,
    "POST",
  );
  await page.locator(`[data-notification-read="${idSelector}"]`).click();
  const readPayload = await readResponsePayload(
    await readResponse,
    "mark notification read",
  );
  if (!readPayload?.notification?.read) {
    throw new Error(
      "mark notification read: backend did not mark the notification read",
    );
  }

  await page.waitForSelector(`[data-notification-delete="${idSelector}"]`, {
    timeout: 20_000,
  });
  const deleteResponse = waitForApiResponse(
    page,
    `/api/portal/notifications/${encodeURIComponent(notification.id)}`,
    "DELETE",
  );
  await page.locator(`[data-notification-delete="${idSelector}"]`).click();
  await readResponsePayload(await deleteResponse, "delete notification");
  await page.waitForSelector(`[data-notification-delete="${idSelector}"]`, {
    state: "detached",
    timeout: 20_000,
  });
  state.notificationId = "";
  return { notificationId: notification.id, deleted: true };
}

async function exerciseSettings(page, state) {
  await page.goto(`${siteUrl}/portal/settings?smoke=${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("#account-save-profile", { timeout: 20_000 });

  const meBefore = await apiFetch(page, "/me");
  const originalUser = meBefore.payload?.user || {};
  const originalProfile = {
    name: originalUser.name || "",
    title: originalUser.title || "",
    phone: originalUser.phone || "",
    license: originalUser.license || "",
    hospital: originalUser.hospital || "",
    department: originalUser.department || "",
    specialty: originalUser.specialty || "",
    address: originalUser.address || "",
  };
  const originalPreferences =
    originalUser.notificationPreferences &&
    typeof originalUser.notificationPreferences === "object"
      ? { ...originalUser.notificationPreferences }
      : {};
  state.settings = {
    originalProfile,
    originalPreferences,
    originalWorkspace: {},
    profileSaved: false,
    workspaceSaved: false,
    preferencesSaved: false,
    restoredProfile: false,
    restoredWorkspace: false,
    restoredPreferences: false,
  };

  const nextTitle = `Smoke title ${runId}`;
  await page.locator("#account-title").fill(nextTitle);
  const profileResponse = waitForApiResponse(page, "/api/me", "PATCH");
  await page.locator("#account-save-profile").click();
  const profilePayload = await readResponsePayload(
    await profileResponse,
    "update account profile",
  );
  if (profilePayload?.user?.title !== nextTitle) {
    throw new Error("update account profile: title did not persist");
  }
  state.settings.profileSaved = true;

  await page.locator("#portal-settings-security-tab").click();
  await page.waitForSelector("#account-current-password", { timeout: 20_000 });
  await page.waitForSelector("#account-new-password", { timeout: 20_000 });
  await page.waitForSelector("#account-confirm-password", { timeout: 20_000 });
  await page.waitForSelector("#account-change-password", { timeout: 20_000 });
  await page.waitForSelector("#account-2fa-app", { timeout: 20_000 });
  await page.waitForSelector("#account-2fa-disable", { timeout: 20_000 });
  await page.waitForSelector("#account-revoke-other-sessions", {
    timeout: 20_000,
  });
  await page.locator("#account-current-password").fill("not-used-by-smoke");
  await page.locator("#account-new-password").fill("short");
  await page.locator("#account-confirm-password").fill("short");
  await page.locator("#account-change-password").click();
  await page.waitForTimeout(300);

  await page.locator("#portal-settings-notifications-tab").click();
  await page.waitForSelector("#notification-newLogin", { timeout: 20_000 });
  const newLoginCheckbox = page.locator("#notification-newLogin");
  let preferencesSaved = false;
  if ((await newLoginCheckbox.count()) > 0) {
    const previous = await newLoginCheckbox.isChecked();
    await newLoginCheckbox.setChecked(!previous);
    const prefResponse = waitForApiResponse(page, "/api/me", "PATCH");
    await page.locator("#workspace-save-notifications").click();
    await readResponsePayload(
      await prefResponse,
      "update notification preferences",
    );
    preferencesSaved = true;
    state.settings.preferencesSaved = true;
  }

  await page.locator("#portal-settings-workspace-tab").click();
  await page.waitForSelector("#workspace-website", { timeout: 20_000 });
  const workspaceSaveCount = await page.locator("#workspace-save").count();
  const originalWorkspace = {};
  for (const field of ["name", "address", "phone", "email", "website"]) {
    originalWorkspace[field] = await page
      .locator(`#workspace-${field}`)
      .inputValue();
  }
  state.settings.originalWorkspace = originalWorkspace;

  let workspaceSaved = false;
  if (workspaceSaveCount > 0) {
    const nextWebsite = `https://${runId}.smarthealth.test`;
    await page.locator("#workspace-website").fill(nextWebsite);
    const workspaceResponse = waitForApiResponse(
      page,
      "/api/portal/settings/workspace",
      "PATCH",
    );
    await page.locator("#workspace-save").click();
    const workspacePayload = await readResponsePayload(
      await workspaceResponse,
      "update workspace settings",
    );
    if (workspacePayload?.workspace?.website !== nextWebsite) {
      throw new Error("update workspace settings: website did not persist");
    }
    workspaceSaved = true;
    state.settings.workspaceSaved = true;
  }

  return {
    profileSaved: true,
    originalWorkspace,
    originalProfile,
    originalPreferences,
    workspaceSaved,
    preferencesSaved,
    securityControlsChecked: true,
  };
}

async function exerciseReportExport(page) {
  await page.goto(`${siteUrl}/portal/reports?smoke=${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("#portal-export-csv", { timeout: 20_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    page.locator("#portal-export-csv").click(),
  ]);
  const suggestedFilename = download.suggestedFilename();
  if (!suggestedFilename.endsWith(".csv")) {
    throw new Error(
      `report export: expected CSV download, received ${suggestedFilename}`,
    );
  }
  await download.delete().catch(() => undefined);
  return { suggestedFilename };
}

async function exerciseSupportTicket(page, state) {
  await page.goto(`${siteUrl}/portal/help?smoke=${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("[data-support-guide]", { timeout: 20_000 });
  await page.locator("[data-support-guide]").first().click();
  await page
    .locator("#support-ticket-description")
    .fill(`Controlled support ticket smoke ${runId}`);

  const supportResponse = waitForApiResponse(
    page,
    "/api/portal/support",
    "POST",
  );
  await page.locator("#support-ticket-submit").click();
  const payload = await readResponsePayload(
    await supportResponse,
    "create support ticket",
  );
  const ticketId = payload?.ticket?.id;
  if (!ticketId) {
    throw new Error(
      "create support ticket: response did not include ticket.id",
    );
  }
  state.supportNotificationId = ticketId;
  await page.waitForSelector("#support-ticket-success", { timeout: 20_000 });
  return { ticketId, status: payload.ticket.status || "open" };
}

async function deletePatientViaUi(page, patientId) {
  await page.goto(
    `${siteUrl}/portal/patients/${encodeURIComponent(patientId)}?smoke=${runId}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await waitSettled(page);
  await page.waitForSelector("#patient-delete", { timeout: 20_000 });
  const dialogPromise = page
    .waitForEvent("dialog", { timeout: 10_000 })
    .then((dialog) => dialog.accept());
  const deleteResponse = waitForApiResponse(
    page,
    `/api/portal/patients/${encodeURIComponent(patientId)}`,
    "DELETE",
  );
  await page.locator("#patient-delete").click();
  await dialogPromise;
  await readResponsePayload(await deleteResponse, "delete patient");
  await page.waitForURL("**/portal/patients", { timeout: 20_000 });
  const verify = await apiFetch(
    page,
    `/portal/patients/${encodeURIComponent(patientId)}`,
    {
      allowFailure: true,
    },
  );
  if (verify.status !== 404) {
    throw new Error(
      `delete patient: expected 404 after delete, received ${verify.status}`,
    );
  }
  return { deleted: true };
}

async function exerciseNegativeApiState(page) {
  const missingId = `${runId}-missing-patient`;
  const result = await apiFetch(
    page,
    `/portal/patients/${encodeURIComponent(missingId)}`,
    {
      allowFailure: true,
    },
  );
  if (result.status !== 404) {
    throw new Error(
      `negative API state: expected 404, received ${result.status}`,
    );
  }
  return { missingPatientStatus: result.status };
}

async function logoutAndRecover(page, account) {
  await page.goto(`${siteUrl}/portal/dashboard?smoke=${runId}-logout`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("#portal-user-menu-trigger", { timeout: 20_000 });
  await page.locator("#portal-user-menu-trigger").click();
  await page.waitForSelector("#portal-logout", { timeout: 10_000 });
  await Promise.all([
    page.waitForURL("**/login", { timeout: 30_000 }),
    page.locator("#portal-logout").click(),
  ]);
  const tokenAfterLogout = await page.evaluate(() =>
    localStorage.getItem("smart_health_token"),
  );
  if (tokenAfterLogout) {
    throw new Error("logout: portal token still exists in localStorage");
  }
  await login(page, account, "session-recovery");
  await page.goto(`${siteUrl}/portal/dashboard?smoke=${runId}-recovered`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector(".clinical-topbar", { timeout: 20_000 });
  await assertNoPortalError(page, "session recovery");
  return { loggedOut: true, recovered: true };
}

async function restoreIfNeeded(page, state, cleanupResults) {
  if (state.settings?.profileSaved && state.settings.restoredProfile !== true) {
    await apiFetch(page, "/me", {
      method: "PATCH",
      body: state.settings.originalProfile,
    })
      .then(() =>
        cleanupResults.push({ target: "account profile", ok: true }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "account profile",
          ok: false,
          error: error.message,
        }),
      );
    state.settings.restoredProfile = true;
  }

  if (
    state.deviceAssignment?.deviceId &&
    state.deviceAssignment.restored !== true
  ) {
    const deviceId = state.deviceAssignment.deviceId;
    await apiFetch(page, `/portal/devices/${encodeURIComponent(deviceId)}`, {
      method: "PATCH",
      body: {
        assignedPatientId:
          state.deviceAssignment.originalAssignedPatientId || "",
      },
    })
      .then(() =>
        cleanupResults.push({
          target: "device assignment",
          ok: true,
          deviceId,
        }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "device assignment",
          ok: false,
          error: error.message,
        }),
      );
    state.deviceAssignment.restored = true;
  }

  if (
    state.settings?.workspaceSaved &&
    state.settings.restoredWorkspace !== true
  ) {
    await apiFetch(page, "/portal/settings/workspace", {
      method: "PATCH",
      body: state.settings.originalWorkspace,
    })
      .then(() =>
        cleanupResults.push({ target: "workspace settings", ok: true }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "workspace settings",
          ok: false,
          error: error.message,
        }),
      );
    state.settings.restoredWorkspace = true;
  }

  if (
    state.settings?.preferencesSaved &&
    state.settings.restoredPreferences !== true
  ) {
    await apiFetch(page, "/me", {
      method: "PATCH",
      body: { notificationPreferences: state.settings.originalPreferences },
    })
      .then(() =>
        cleanupResults.push({ target: "notification preferences", ok: true }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "notification preferences",
          ok: false,
          error: error.message,
        }),
      );
    state.settings.restoredPreferences = true;
  }

  if (state.notificationId) {
    await apiFetch(
      page,
      `/portal/notifications/${encodeURIComponent(state.notificationId)}`,
      {
        method: "DELETE",
        allowFailure: true,
      },
    )
      .then((result) =>
        cleanupResults.push({
          target: "notification",
          ok: result.ok || result.status === 404,
          status: result.status,
        }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "notification",
          ok: false,
          error: error.message,
        }),
      );
    state.notificationId = "";
  }

  if (state.supportNotificationId) {
    await apiFetch(
      page,
      `/portal/notifications/${encodeURIComponent(state.supportNotificationId)}`,
      {
        method: "DELETE",
        allowFailure: true,
      },
    )
      .then((result) =>
        cleanupResults.push({
          target: "support notification",
          ok: result.ok || result.status === 404,
          status: result.status,
        }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "support notification",
          ok: false,
          error: error.message,
        }),
      );
    state.supportNotificationId = "";
  }

  if (state.claimedDevice?.deviceId && state.claimedDevice.deleted !== true) {
    await apiFetch(
      page,
      `/portal/devices/${encodeURIComponent(state.claimedDevice.deviceId)}`,
      {
        method: "DELETE",
        allowFailure: true,
      },
    )
      .then((result) =>
        cleanupResults.push({
          target: "claimed device",
          ok: result.ok || result.status === 404,
          status: result.status,
        }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "claimed device",
          ok: false,
          error: error.message,
        }),
      );
    state.claimedDevice.deleted = true;
  }

  if (state.patientId) {
    await apiFetch(
      page,
      `/portal/patients/${encodeURIComponent(state.patientId)}`,
      {
        method: "DELETE",
        allowFailure: true,
      },
    )
      .then((result) =>
        cleanupResults.push({
          target: "patient",
          ok: result.ok || result.status === 404,
          status: result.status,
        }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "patient",
          ok: false,
          error: error.message,
        }),
      );
    state.patientId = "";
  }
}

async function main() {
  const account = readSmokeAccount();
  const checkedResponses = [];
  const requestFailures = [];
  const consoleMessages = [];
  const cleanupResults = [];
  const expectedFailureFragments = [`${runId}-missing-patient`];
  const state = {};

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: disableWebSecurity
      ? ["--disable-web-security", "--disable-features=IsolateOrigins,site-per-process"]
      : [],
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 850 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({
        type: message.type(),
        text: message.text().slice(0, 300),
      });
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
    await login(page, account, "initial");

    const created = await createPatientViaUi(page, state);
    const patientUpdate = await updatePatientNotesViaUi(page, state.patientId);

    const deviceClaim = await exerciseDeviceClaim(page, state);

    const deviceAssignment = await exerciseDeviceAssignment(
      page,
      state.patientId,
      state,
    );

    const notification = await createReadDeleteNotification(page, state);

    const settings = await exerciseSettings(page, state);

    if (state.settings?.profileSaved) {
      await apiFetch(page, "/me", {
        method: "PATCH",
        body: state.settings.originalProfile,
      });
      state.settings.restoredProfile = true;
      cleanupResults.push({
        target: "account profile",
        ok: true,
        phase: "main",
      });
    }

    if (state.deviceAssignment) {
      await apiFetch(
        page,
        `/portal/devices/${encodeURIComponent(state.deviceAssignment.deviceId)}`,
        {
          method: "PATCH",
          body: {
            assignedPatientId:
              state.deviceAssignment.originalAssignedPatientId || "",
          },
        },
      );
      state.deviceAssignment.restored = true;
      cleanupResults.push({
        target: "device assignment",
        ok: true,
        deviceId: state.deviceAssignment.deviceId,
        phase: "main",
      });
    }

    if (state.claimedDevice?.deviceId && state.claimedDevice.deleted !== true) {
      const claimedCleanup = await apiFetch(
        page,
        `/portal/devices/${encodeURIComponent(state.claimedDevice.deviceId)}`,
        {
          method: "DELETE",
          allowFailure: true,
        },
      );
      cleanupResults.push({
        target: "claimed device",
        ok: claimedCleanup.ok || claimedCleanup.status === 404,
        status: claimedCleanup.status,
        phase: "main",
      });
      state.claimedDevice.deleted = true;
    }

    if (state.settings?.workspaceSaved) {
      await apiFetch(page, "/portal/settings/workspace", {
        method: "PATCH",
        body: state.settings.originalWorkspace,
      });
      state.settings.restoredWorkspace = true;
      cleanupResults.push({
        target: "workspace settings",
        ok: true,
        phase: "main",
      });
    }
    if (state.settings?.preferencesSaved) {
      await apiFetch(page, "/me", {
        method: "PATCH",
        body: { notificationPreferences: state.settings.originalPreferences },
      });
      state.settings.restoredPreferences = true;
      cleanupResults.push({
        target: "notification preferences",
        ok: true,
        phase: "main",
      });
    }

    const reportExport = await exerciseReportExport(page);
    const supportTicket = await exerciseSupportTicket(page, state);
    if (state.supportNotificationId) {
      const supportCleanupResult = await apiFetch(
        page,
        `/portal/notifications/${encodeURIComponent(state.supportNotificationId)}`,
        {
          method: "DELETE",
          allowFailure: true,
        },
      );
      cleanupResults.push({
        target: "support notification",
        ok: supportCleanupResult.ok || supportCleanupResult.status === 404,
        status: supportCleanupResult.status,
        phase: "main",
      });
      state.supportNotificationId = "";
    }
    const deletedPatientId = state.patientId;
    const patientDelete = await deletePatientViaUi(page, deletedPatientId);
    expectedFailureFragments.push(deletedPatientId);
    state.patientId = "";
    const negativeApi = await exerciseNegativeApiState(page);
    const session = await logoutAndRecover(page, account);

    const badResponses = checkedResponses.filter((item) => {
      if (item.status < 400) return false;
      return !expectedFailureFragments.some((fragment) =>
        item.url.includes(fragment),
      );
    });
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
        item.text.includes(
          "Failed to load resource: the server responded with a status of 404",
        )
      ) {
        return badResponses.length > 0;
      }
      return true;
    });
    if (
      badResponses.length ||
      actionableRequestFailures.length ||
      severeConsole.length
    ) {
      throw new Error(
        JSON.stringify(
          {
            badResponses,
            requestFailures: actionableRequestFailures,
            severeConsole,
          },
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
          site: siteUrl,
          apiBase,
          patient: {
            id: created.patient.id,
            name: created.patientName,
            updatedNote: patientUpdate.note,
            deleted: patientDelete.deleted,
          },
          deviceClaim,
          deviceAssignment,
          notification,
          settings: {
            profileSaved: settings.profileSaved,
            securityControlsChecked: settings.securityControlsChecked,
            workspaceSaved: settings.workspaceSaved,
            preferencesSaved: settings.preferencesSaved,
          },
          reportExport,
          supportTicket,
          negativeApi,
          session,
          cleanupResults,
          checkedResponses,
        },
        null,
        2,
      ),
    );
  } finally {
    await restoreIfNeeded(page, state, cleanupResults).catch((error) => {
      cleanupResults.push({
        target: "final cleanup",
        ok: false,
        error: error.message,
      });
    });
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Smart Health portal mutation smoke: FAIL");
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
