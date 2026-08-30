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
  "https://shcare-api-prod.onrender.com/api"
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
const allowDurableSupportTicket =
  process.env.SMOKE_ALLOW_DURABLE_SUPPORT_TICKET === "1";

const sensitiveHeaderNames = new Set(["authorization", "cookie", "set-cookie"]);
const watchPatterns = [
  "/api/auth/firebase",
  "/api/me",
  "/api/portal/status",
  "/api/portal/patients",
  "/api/portal/appointments",
  "/api/portal/devices",
  "/api/portal/notifications",
  "/api/portal/settings",
  "/api/portal/reports",
  "/api/v1/exports",
  "/api/v1/portal/support",
  "/api/share-targets",
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

function mutationIdempotencyKey(response, label) {
  const key = response.request().headers()["idempotency-key"] || "";
  if (!key.trim()) {
    throw new Error(`${label}: request did not include Idempotency-Key`);
  }
  return key;
}

function assertPatientReceipt(payload, expected, label, replayed) {
  const patient = payload?.patient;
  if (!patient?.id) {
    throw new Error(`${label}: response did not include patient.id`);
  }
  if (payload?.replayed !== replayed) {
    throw new Error(
      `${label}: expected replayed=${replayed}, got ${JSON.stringify(payload?.replayed)}`,
    );
  }
  if (expected.id && patient.id !== expected.id) {
    throw new Error(
      `${label}: backend returned a different canonical patient id`,
    );
  }
  for (const field of [
    "patientCode",
    "name",
    "dateOfBirth",
    "gender",
    "phone",
    "email",
    "address",
    "bloodType",
    "notes",
  ]) {
    if ((patient[field] || "") !== (expected[field] || "")) {
      throw new Error(
        `${label}: ${field} mismatch; expected ${JSON.stringify(expected[field] || "")}, got ${JSON.stringify(patient[field] || "")}`,
      );
    }
  }
  if (
    JSON.stringify(patient.allergies || []) !==
    JSON.stringify(expected.allergies || [])
  ) {
    throw new Error(
      `${label}: allergies did not match the submitted structured value`,
    );
  }
  if (
    JSON.stringify(patient.emergencyContact || {}) !==
    JSON.stringify(expected.emergencyContact || {})
  ) {
    throw new Error(
      `${label}: emergencyContact did not match the submitted structured value`,
    );
  }
  return patient;
}

async function apiFetch(page, route, options = {}) {
  const method = options.method || "GET";
  const result = await page.evaluate(
    async ({ apiBaseUrl, routePath, methodName, body, idempotencyKey }) => {
      const url = new URL(routePath.replace(/^\/+/, ""), `${apiBaseUrl}/`);
      const token = localStorage.getItem("smart_health_token") || "";
      const headers = {
        "X-Smart-Health-Surface": "portal",
        "X-Smart-Health-Client": "web-smoke",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
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
      idempotencyKey: options.idempotencyKey,
    },
  );

  if (!result.ok && !options.allowFailure) {
    throw new Error(
      `${method} ${route}: HTTP ${result.status} ${pickError(result.payload)}`,
    );
  }
  return result;
}

const profileFieldIds = {
  name: "#account-name",
  title: "#account-title",
  phone: "#account-phone",
  license: "#account-license",
  hospital: "#account-hospital",
  department: "#account-department",
  specialty: "#account-specialty",
  address: "#account-address",
};

function pickProfileFields(user = {}) {
  return Object.fromEntries(
    Object.keys(profileFieldIds).map((field) => [field, user[field] || ""]),
  );
}

function assertProfileFields(user, expected, label) {
  const actual = pickProfileFields(user || {});
  for (const [field, value] of Object.entries(expected || {})) {
    if (actual[field] !== value) {
      throw new Error(
        `${label}: ${field} did not persist; expected ${JSON.stringify(
          value,
        )}, got ${JSON.stringify(actual[field])}`,
      );
    }
  }
}

async function fillProfileFields(page, profile) {
  for (const [field, selector] of Object.entries(profileFieldIds)) {
    await page.locator(selector).fill(profile[field] || "");
  }
}

async function assertProfileInputs(page, expected, label) {
  for (const [field, selector] of Object.entries(profileFieldIds)) {
    const actual = await page.locator(selector).inputValue();
    if (actual !== (expected[field] || "")) {
      throw new Error(
        `${label}: input ${field} did not persist; expected ${JSON.stringify(
          expected[field] || "",
        )}, got ${JSON.stringify(actual)}`,
      );
    }
  }
}

async function assertProfilePersisted(page, expected, label) {
  await page.goto(
    `${siteUrl}/portal/settings?smoke=${encodeURIComponent(runId)}-${encodeURIComponent(label)}`,
    { waitUntil: "domcontentloaded" },
  );
  await waitSettled(page);
  await page.waitForSelector("#account-save-profile", { timeout: 20_000 });
  await assertProfileInputs(page, expected, label);
  const me = await apiFetch(page, "/me");
  assertProfileFields(me.payload?.user || {}, expected, label);
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
  const patientCode = `PORTAL-${runId}`;
  const expected = {
    patientCode,
    name: patientName,
    dateOfBirth: "1984-06-15",
    gender: "female",
    phone: "0900000000",
    email: `${runId}@smarthealth.test`,
    address: "12 Nguyen Trai, District 1",
    bloodType: "O+",
    allergies: ["penicillin", "latex"],
    emergencyContact: {
      name: "Portal Emergency Contact",
      phone: "0911111111",
      relationship: "family",
    },
    notes: `Structured portal smoke ${runId}`,
  };
  await page.goto(
    `${siteUrl}/portal/patients?smoke=${encodeURIComponent(runId)}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await waitSettled(page);
  await page.waitForSelector("#portal-add-patient", { timeout: 20_000 });
  await page.locator("#portal-add-patient").click();
  await page.locator("#patient-name").fill(expected.name);
  await page.locator("#patient-code").fill(expected.patientCode);
  await page.locator("#patient-dob").fill(expected.dateOfBirth);
  await page.locator("#patient-gender").selectOption(expected.gender);
  await page.locator("#patient-blood-type").selectOption(expected.bloodType);
  await page.locator("#patient-phone").fill(expected.phone);
  await page.locator("#patient-email").fill(expected.email);
  await page.locator("#patient-address").fill(expected.address);
  await page.locator("#patient-allergies").fill(expected.allergies.join(", "));
  await page
    .locator("#patient-emergency-name")
    .fill(expected.emergencyContact.name);
  await page
    .locator("#patient-emergency-phone")
    .fill(expected.emergencyContact.phone);
  await page
    .locator("#patient-emergency-relationship")
    .fill(expected.emergencyContact.relationship);
  await page.locator("#patient-notes").fill(expected.notes);

  const createResponse = waitForApiResponse(
    page,
    "/api/portal/patients",
    "POST",
  );
  await page.locator("#portal-save-patient").click();
  const response = await createResponse;
  const payload = await readResponsePayload(response, "create patient");
  if (response.status() !== 201) {
    throw new Error(
      `create patient: expected HTTP 201, got ${response.status()}`,
    );
  }
  const patient = assertPatientReceipt(
    payload,
    expected,
    "create patient",
    false,
  );
  if (patient.id === patientCode) {
    throw new Error(
      "create patient: canonical id was incorrectly replaced by patientCode",
    );
  }
  const idempotencyKey = mutationIdempotencyKey(response, "create patient");
  const replay = await apiFetch(page, "/portal/patients", {
    method: "POST",
    body: expected,
    idempotencyKey,
  });
  if (replay.status !== 201) {
    throw new Error(
      `create patient replay: expected HTTP 201, got ${replay.status}`,
    );
  }
  assertPatientReceipt(
    replay.payload,
    { ...expected, id: patient.id },
    "create patient replay",
    true,
  );
  state.patientId = patient.id;
  state.patientCreateIdempotencyKey = idempotencyKey;

  await page.locator("#portal-patient-search").fill(patientName);
  await waitSettled(page);
  await page
    .getByText(patientName, { exact: false })
    .first()
    .waitFor({ timeout: 15_000 });
  return { patient, patientName, expected, idempotencyKey };
}

async function updatePatientViaUi(page, patientId, created, state) {
  const expected = {
    ...created.expected,
    id: patientId,
    phone: "0922222222",
    address: "88 Le Loi, District 3",
    allergies: ["penicillin", "latex", "shellfish"],
    notes: `Updated structured portal smoke ${runId}`,
  };
  await page.goto(
    `${siteUrl}/portal/patients/${encodeURIComponent(patientId)}?smoke=${runId}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await waitSettled(page);
  await page.waitForSelector("#patient-phone", { timeout: 20_000 });
  await page.locator("#patient-phone").fill(expected.phone);
  await page.locator("#patient-address").fill(expected.address);
  await page.locator("#patient-allergies").fill(expected.allergies.join(", "));
  await page.locator("#patient-notes").fill(expected.notes);
  const updateResponse = waitForApiResponse(
    page,
    `/api/portal/patients/${encodeURIComponent(patientId)}`,
    "PATCH",
  );
  await page.locator("#patient-save-profile").click();
  const response = await updateResponse;
  const payload = await readResponsePayload(response, "update patient");
  if (response.status() !== 200) {
    throw new Error(
      `update patient: expected HTTP 200, got ${response.status()}`,
    );
  }
  assertPatientReceipt(payload, expected, "update patient", false);
  const idempotencyKey = mutationIdempotencyKey(response, "update patient");
  if (idempotencyKey === created.idempotencyKey) {
    throw new Error(
      "update patient: create and update reused one idempotency key",
    );
  }
  const updateBody = { ...expected };
  delete updateBody.id;
  const replay = await apiFetch(
    page,
    `/portal/patients/${encodeURIComponent(patientId)}`,
    {
      method: "PATCH",
      body: updateBody,
      idempotencyKey,
    },
  );
  if (replay.status !== 200) {
    throw new Error(
      `update patient replay: expected HTTP 200, got ${replay.status}`,
    );
  }
  assertPatientReceipt(replay.payload, expected, "update patient replay", true);
  await page
    .getByText(expected.phone, { exact: true })
    .waitFor({ timeout: 15_000 });
  state.patientUpdateIdempotencyKey = idempotencyKey;
  return { expected, idempotencyKey };
}

async function exerciseAppointmentMutation(page, patientId, state) {
  const startsAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 120 * 60 * 1000).toISOString();
  const reason = `Portal appointment smoke ${runId}`;
  const notes = "Controlled appointment mutation smoke.";
  const createdResult = await apiFetch(page, "/portal/appointments", {
    method: "POST",
    body: {
      patientId,
      type: "remote_consultation",
      startsAt,
      endsAt,
      reason,
      notes,
    },
  });
  const appointment = createdResult.payload?.appointment;
  if (!appointment?.id) {
    throw new Error(
      "create appointment: backend did not return appointment.id",
    );
  }
  state.appointmentId = appointment.id;

  const listedResult = await apiFetch(page, "/portal/appointments");
  const listed = Array.isArray(listedResult.payload?.appointments)
    ? listedResult.payload.appointments
    : [];
  if (!listed.some((item) => item.id === appointment.id)) {
    throw new Error("list appointment: created appointment was not returned");
  }

  const updatedResult = await apiFetch(
    page,
    `/portal/appointments/${encodeURIComponent(appointment.id)}`,
    {
      method: "PATCH",
      body: {
        status: "confirmed",
        notes: `${notes} Confirmed.`,
      },
    },
  );
  if (updatedResult.payload?.appointment?.status !== "confirmed") {
    throw new Error("update appointment: status was not persisted");
  }

  const deletedResult = await apiFetch(
    page,
    `/portal/appointments/${encodeURIComponent(appointment.id)}`,
    {
      method: "DELETE",
    },
  );
  if (deletedResult.payload?.deleted !== true) {
    throw new Error("delete appointment: backend did not confirm deletion");
  }
  state.appointmentId = "";

  const verifyDeletedResult = await apiFetch(page, "/portal/appointments");
  const remaining = Array.isArray(verifyDeletedResult.payload?.appointments)
    ? verifyDeletedResult.payload.appointments
    : [];
  if (remaining.some((item) => item.id === appointment.id)) {
    throw new Error("delete appointment: appointment is still listed");
  }

  return {
    id: appointment.id,
    patientId,
    status: updatedResult.payload.appointment.status,
    deleted: true,
  };
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

function exerciseDeviceClaim() {
  return {
    skipped: true,
    state: "BLOCKED",
    reason:
      "Device claim browser proof requires a dedicated factory-enrolled, pre-provisioned one-time artifact and Platform Admin cleanup. The generic Portal smoke must not mint credentials, provision inventory, or hard-delete ownership.",
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

async function exerciseConsentSharing(page, patientId, state) {
  const targetsResult = await apiFetch(page, "/share-targets");
  const doctors = Array.isArray(targetsResult.payload?.doctors)
    ? targetsResult.payload.doctors
    : [];
  const workspaces = Array.isArray(targetsResult.payload?.workspaces)
    ? targetsResult.payload.workspaces
    : [];
  const targetType = doctors[0]?.id ? "doctor" : "workspace";
  const target = targetType === "doctor" ? doctors[0] : workspaces[0];
  if (!target?.id) {
    return { skipped: true, reason: "workspace has no consent share targets" };
  }

  await page.goto(`${siteUrl}/portal/consent?smoke=${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("#share-patient-id", { timeout: 20_000 });
  await page.locator("#share-patient-id").selectOption(patientId);
  await page
    .locator(
      targetType === "doctor"
        ? "#share-target-doctor"
        : "#share-target-workspace",
    )
    .click();
  await page.locator("#share-target-id").selectOption(target.id);
  await page.locator("#share-scope").selectOption("patient_profile");

  const createResponse = waitForApiResponse(
    page,
    `/api/portal/patients/${encodeURIComponent(patientId)}/shares`,
    "POST",
  );
  await page.locator("#share-create-submit").click();
  const createPayload = await readResponsePayload(
    await createResponse,
    "create patient share",
  );
  const share = createPayload?.share;
  if (!share?.id || share.patientId !== patientId) {
    throw new Error(
      "create patient share: backend did not return the new share",
    );
  }

  state.patientShare = {
    patientId,
    shareId: share.id,
    revoked: false,
  };
  const shareIdSelector = cssAttributeValue(share.id);
  await page.waitForSelector(`[data-share-row="${shareIdSelector}"]`, {
    timeout: 20_000,
  });
  await page.waitForSelector(`[data-share-revoke="${shareIdSelector}"]`, {
    timeout: 20_000,
  });

  const revokeResponse = waitForApiResponse(
    page,
    `/api/portal/patients/${encodeURIComponent(patientId)}/shares/${encodeURIComponent(share.id)}`,
    "DELETE",
  );
  await page.locator(`[data-share-revoke="${shareIdSelector}"]`).click();
  const revokePayload = await readResponsePayload(
    await revokeResponse,
    "revoke patient share",
  );
  if (revokePayload?.revoked !== true) {
    throw new Error("revoke patient share: backend did not confirm revoke");
  }
  state.patientShare.revoked = true;

  return {
    shareId: share.id,
    targetType,
    targetId: target.id,
    scope: share.scope || "patient_profile",
    revoked: true,
  };
}

async function exerciseSettings(page, state) {
  await page.goto(`${siteUrl}/portal/settings?smoke=${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("#account-save-profile", { timeout: 20_000 });

  const meBefore = await apiFetch(page, "/me");
  const originalUser = meBefore.payload?.user || {};
  const originalProfile = pickProfileFields(originalUser);
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

  const nextProfile = {
    name: `Smoke User ${runId}`,
    title: `Smoke title ${runId}`,
    phone: `090${Date.now().toString().slice(-7)}`,
    license: `LIC-${runId}`,
    hospital: `Hospital ${runId}`,
    department: `Department ${runId}`,
    specialty: `Specialty ${runId}`,
    address: `Address ${runId}`,
  };
  await fillProfileFields(page, nextProfile);
  const profileResponse = waitForApiResponse(page, "/api/me", "PATCH");
  await page.locator("#account-save-profile").click();
  const profilePayload = await readResponsePayload(
    await profileResponse,
    "update account profile",
  );
  assertProfileFields(
    profilePayload?.user || {},
    nextProfile,
    "update account profile response",
  );
  const profileAfterSave = await apiFetch(page, "/me");
  assertProfileFields(
    profileAfterSave.payload?.user || {},
    nextProfile,
    "update account profile read-after-write",
  );
  state.settings.expectedProfile = nextProfile;
  state.settings.profileSaved = true;
  await assertProfilePersisted(
    page,
    nextProfile,
    "profile settings route reopen",
  );

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
  await page.waitForSelector("#portal-report-export", { timeout: 20_000 });
  await page.locator("#portal-report-export").click();
  await page.waitForSelector("#clinical_bundle-export-format", {
    timeout: 10_000,
  });
  await page.locator("#clinical_bundle-export-format").click();
  await page.getByRole("option", { name: /^CSV/ }).click();

  const createResponsePromise = waitForApiResponse(
    page,
    "/api/v1/exports",
    "POST",
  );
  const artifactResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes("/api/v1/exports/download/"),
    { timeout: 30_000 },
  );
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.locator("#portal-clinical_bundle-export-submit").click();

  const createResponse = await createResponsePromise;
  const createPayload = await readResponsePayload(
    createResponse,
    "create report export",
  );
  const exportJob = createPayload?.export;
  if (
    createResponse.status() !== 201 ||
    !exportJob?.id ||
    exportJob.format !== "csv" ||
    exportJob.dataset !== "clinical_bundle" ||
    exportJob.status !== "ready"
  ) {
    throw new Error(
      `report export: invalid create receipt ${JSON.stringify(createPayload)}`,
    );
  }
  const idempotencyKey = mutationIdempotencyKey(
    createResponse,
    "create report export",
  );
  const artifactResponse = await artifactResponsePromise;
  if (
    artifactResponse.status() !== 200 ||
    !artifactResponse
      .url()
      .endsWith(`/api/v1/exports/download/${encodeURIComponent(exportJob.id)}`)
  ) {
    throw new Error(
      `report export: invalid artifact response ${artifactResponse.status()} ${artifactResponse.url()}`,
    );
  }
  const artifactHeaders = await artifactResponse.allHeaders();
  if (
    !artifactHeaders["content-disposition"]?.includes(".csv") ||
    !artifactHeaders["x-shcare-artifact-sha256"] ||
    !artifactHeaders["x-shcare-renderer-version"]
  ) {
    throw new Error("report export: artifact identity headers are incomplete");
  }
  const download = await downloadPromise;
  const suggestedFilename = download.suggestedFilename();
  if (!suggestedFilename.endsWith(".csv")) {
    throw new Error(
      `report export: expected CSV download, received ${suggestedFilename}`,
    );
  }
  await download.delete().catch(() => undefined);
  return {
    exportId: exportJob.id,
    suggestedFilename,
    idempotencyKeyPresent: Boolean(idempotencyKey),
    artifactSha256: artifactHeaders["x-shcare-artifact-sha256"],
    rendererVersion: artifactHeaders["x-shcare-renderer-version"],
  };
}

async function exerciseSupportTicket(page) {
  await page.goto(`${siteUrl}/portal/help?smoke=${runId}`, {
    waitUntil: "domcontentloaded",
  });
  await waitSettled(page);
  await page.waitForSelector("[data-support-guide]", { timeout: 20_000 });
  await page.locator("[data-support-guide]").first().click();
  await page
    .locator("#support-ticket-description")
    .fill(`Controlled support ticket smoke ${runId}`);

  const supportResponsePromise = waitForApiResponse(
    page,
    "/api/v1/portal/support",
    "POST",
  );
  await page.locator("#support-ticket-submit").click();
  const supportResponse = await supportResponsePromise;
  if (supportResponse.status() !== 201) {
    throw new Error(
      `create support ticket: expected HTTP 201, got ${supportResponse.status()}`,
    );
  }
  const idempotencyKey = mutationIdempotencyKey(
    supportResponse,
    "create support ticket",
  );
  const requestBody = supportResponse.request().postDataJSON();
  if (
    Object.hasOwn(requestBody || {}, "workspaceId") ||
    Object.hasOwn(requestBody || {}, "requesterUserId")
  ) {
    throw new Error(
      "create support ticket: client leaked workspace or requester authority",
    );
  }
  const payload = await readResponsePayload(
    supportResponse,
    "create support ticket",
  );
  const ticket = payload?.ticket;
  if (
    !ticket?.id ||
    !ticket.workspaceId ||
    !ticket.requesterUserId ||
    ticket.status !== "open" ||
    payload.replayed !== false
  ) {
    throw new Error(
      `create support ticket: invalid canonical receipt ${JSON.stringify(payload)}`,
    );
  }
  await page.waitForSelector("#support-ticket-success", { timeout: 20_000 });
  return {
    ticketId: ticket.id,
    workspaceId: ticket.workspaceId,
    requesterUserId: ticket.requesterUserId,
    status: ticket.status,
    idempotencyKeyPresent: Boolean(idempotencyKey),
    cleanup: {
      state: "blocked",
      reason:
        "Support tickets are a durable ledger and no requester withdrawal contract exists yet.",
    },
  };
}

async function deletePatientViaUi(page, patientId, state) {
  await page.goto(
    `${siteUrl}/portal/patients/${encodeURIComponent(patientId)}?smoke=${runId}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await waitSettled(page);
  await page.waitForSelector("#patient-delete", { timeout: 20_000 });
  await page.locator("#patient-delete").click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.waitFor({ state: "visible", timeout: 10_000 });
  const deleteResponse = waitForApiResponse(
    page,
    `/api/portal/patients/${encodeURIComponent(patientId)}`,
    "DELETE",
  );
  await confirmation.getByRole("button", { name: "Xóa hồ sơ" }).click();
  const response = await deleteResponse;
  const payload = await readResponsePayload(response, "delete patient");
  if (
    response.status() !== 200 ||
    payload?.deleted !== true ||
    payload?.patientId !== patientId ||
    payload?.replayed !== false
  ) {
    throw new Error(
      `delete patient: invalid canonical receipt ${JSON.stringify(payload)}`,
    );
  }
  const idempotencyKey = mutationIdempotencyKey(response, "delete patient");
  if (
    idempotencyKey === state.patientCreateIdempotencyKey ||
    idempotencyKey === state.patientUpdateIdempotencyKey
  ) {
    throw new Error(
      "delete patient: mutation reused an earlier idempotency key",
    );
  }
  await page.waitForURL("**/portal/patients", { timeout: 20_000 });
  const replay = await apiFetch(
    page,
    `/portal/patients/${encodeURIComponent(patientId)}`,
    { method: "DELETE", idempotencyKey },
  );
  if (
    replay.status !== 200 ||
    replay.payload?.deleted !== true ||
    replay.payload?.patientId !== patientId ||
    replay.payload?.replayed !== true
  ) {
    throw new Error(
      `delete patient replay: invalid canonical receipt ${JSON.stringify(replay.payload)}`,
    );
  }
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
  return { deleted: true, idempotencyKey, replayed: replay.payload.replayed };
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
      .then(() => cleanupResults.push({ target: "account profile", ok: true }))
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

  if (state.appointmentId) {
    await apiFetch(
      page,
      `/portal/appointments/${encodeURIComponent(state.appointmentId)}`,
      {
        method: "DELETE",
        allowFailure: true,
      },
    )
      .then((result) =>
        cleanupResults.push({
          target: "appointment",
          ok: result.ok || result.status === 404,
          status: result.status,
        }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "appointment",
          ok: false,
          error: error.message,
        }),
      );
    state.appointmentId = "";
  }

  if (state.patientShare?.shareId && state.patientShare.revoked !== true) {
    await apiFetch(
      page,
      `/portal/patients/${encodeURIComponent(state.patientShare.patientId)}/shares/${encodeURIComponent(state.patientShare.shareId)}`,
      {
        method: "DELETE",
        allowFailure: true,
      },
    )
      .then((result) =>
        cleanupResults.push({
          target: "patient share",
          ok: result.ok || result.status === 404,
          status: result.status,
        }),
      )
      .catch((error) =>
        cleanupResults.push({
          target: "patient share",
          ok: false,
          error: error.message,
        }),
      );
    state.patientShare.revoked = true;
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
      ? [
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
        ]
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
    const patientUpdate = await updatePatientViaUi(
      page,
      state.patientId,
      created,
      state,
    );
    const appointment = await exerciseAppointmentMutation(
      page,
      state.patientId,
      state,
    );

    const deviceClaim = exerciseDeviceClaim();

    const deviceAssignment = await exerciseDeviceAssignment(
      page,
      state.patientId,
      state,
    );

    const notification = await createReadDeleteNotification(page, state);
    const consentShare = await exerciseConsentSharing(
      page,
      state.patientId,
      state,
    );

    const settings = await exerciseSettings(page, state);

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
    const supportTicket = allowDurableSupportTicket
      ? await exerciseSupportTicket(page)
      : {
          status: "BLOCKED",
          reason:
            "Set SMOKE_ALLOW_DURABLE_SUPPORT_TICKET=1 only when retaining a provider support ticket is explicitly acceptable; no cleanup contract exists yet.",
        };
    const deletedPatientId = state.patientId;
    const patientDelete = await deletePatientViaUi(
      page,
      deletedPatientId,
      state,
    );
    expectedFailureFragments.push(deletedPatientId);
    state.patientId = "";
    const negativeApi = await exerciseNegativeApiState(page);
    const session = await logoutAndRecover(page, account);
    if (state.settings?.expectedProfile) {
      await assertProfilePersisted(
        page,
        state.settings.expectedProfile,
        "profile after logout login recovery",
      );
    }

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
            patientCode: created.patient.patientCode,
            name: created.patientName,
            updatedPhone: patientUpdate.expected.phone,
            createReplayVerified: true,
            updateReplayVerified: true,
            deleted: patientDelete.deleted,
            deleteReplayVerified: patientDelete.replayed,
          },
          appointment,
          deviceClaim,
          deviceAssignment,
          notification,
          consentShare,
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
