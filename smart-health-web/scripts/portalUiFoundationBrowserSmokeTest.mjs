/* global document, window */

import AxeBuilder from "@axe-core/playwright";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveBrowserSmokeRuntime } from "./browserSmokeRuntime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const viteEntry = path.join(webRoot, "node_modules", "vite", "bin", "vite.js");
const children = [];
const failures = [];
let checks = 0;

const browserArgument = process.argv
  .find((argument) => argument.startsWith("--browser="))
  ?.slice("--browser=".length);
const browserRuntime = resolveBrowserSmokeRuntime(
  browserArgument || process.env.SHCARE_UI_SMOKE_BROWSER || "chromium",
);

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
const selectedCases = process.env.SHCARE_UI_SMOKE_CASE
  ? cases.filter((testCase) => testCase.name === process.env.SHCARE_UI_SMOKE_CASE)
  : cases;

if (!selectedCases.length) {
  throw new Error(
    `Unknown SHCARE_UI_SMOKE_CASE=${process.env.SHCARE_UI_SMOKE_CASE || ""}.`,
  );
}

const routeCases = [
  {
    path: "/portal/reports",
    testId: "portal-reports-page",
    heading: "Báo cáo vận hành",
  },
  {
    path: "/portal/audit",
    testId: "portal-audit-page",
    heading: "Nhật ký audit",
  },
  {
    path: "/portal/permission-denied",
    testId: "portal-permission-denied",
    heading: "Không có quyền truy cập",
  },
  {
    path: "/portal/billing",
    testId: "portal-billing-page",
    heading: "Gói dịch vụ",
  },
  {
    path: "/portal/dashboard",
    testId: "portal-dashboard-page",
    heading: "Tổng quan",
  },
  {
    path: "/portal/onboarding",
    testId: "portal-onboarding-page",
    heading: "Bắt đầu với Shcare",
  },
  {
    path: "/portal/help",
    testId: "portal-help-page",
    heading: "Hỗ trợ Shcare",
  },
  {
    path: "/portal/workspace",
    testId: "portal-workspace-switcher-page",
    heading: "Chọn workspace",
  },
  {
    path: "/portal/settings",
    testId: "portal-workspace-settings-page",
    heading: "Tài khoản & workspace",
  },
  {
    path: "/portal/patients",
    testId: "portal-patients-page",
    heading: "Bệnh nhân",
  },
  {
    path: "/portal/patients/Patient_Ui-01",
    testId: "portal-patient-detail-page",
    heading: "Nguyễn An",
  },
  {
    path: "/portal/records/review",
    testId: "portal-review-queue-page",
    heading: "Hàng đợi cần xem lại",
  },
  {
    path: "/portal/alerts",
    testId: "portal-alert-center-page",
    heading: "Trung tâm cảnh báo",
  },
  {
    path: "/portal/live",
    testId: "portal-live-monitoring-page",
    heading: "Theo dõi trực tiếp",
  },
  {
    path: "/portal/devices",
    testId: "portal-devices",
    heading: "Quản lý thiết bị",
  },
  {
    path: "/portal/devices/assign",
    testId: "portal-assign-device-page",
    heading: "Gán thiết bị",
  },
  {
    path: "/portal/consent",
    testId: "portal-consent",
    heading: "Quyền truy cập dữ liệu",
    patientImportManager: true,
  },
  {
    path: "/portal/patients/import",
    testId: "patient-import-page",
    heading: "Import bệnh nhân",
    patientImportManager: true,
  },
  {
    path: "/portal/appointments",
    testId: "portal-appointments-page",
    heading: "Lịch hẹn",
    appointmentManager: true,
  },
  {
    path: "/portal/staff",
    testId: "portal-staff",
    heading: "Bác sĩ và nhân sự",
    staffManager: true,
  },
  {
    path: "/portal/notifications",
    testId: "portal-notifications",
    heading: "Thông báo",
  },
];

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
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
      "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    },
    body: status === 204 ? "" : JSON.stringify(payload),
  });
}

function fixtureUser({
  patientImportManager = false,
  appointmentManager = false,
  staffManager = false,
} = {}) {
  const workspaceId = "workspace-ui-foundation";
  const membership = {
    id: "membership-ui-foundation",
    userId: "user-ui-foundation",
    organizationId: workspaceId,
    workspaceId,
    workspaceName: "Phòng khám Shcare",
    workspaceType: "clinic",
    role: "workspace_admin",
    status: "active",
  };
  return {
    id: "user-ui-foundation",
    name: "Quản trị viên Nguyễn An",
    email: "ui.foundation@shcare.test",
    role: "workspace_admin",
    accountStatus: "active",
    roleRequestStatus: "approved",
    verifiedEmail: true,
    organizationId: workspaceId,
    currentWorkspaceId: workspaceId,
    currentWorkspace: {
      id: workspaceId,
      name: "Phòng khám Shcare",
      type: "clinic",
      workspaceType: "clinic",
      status: "active",
    },
    currentMembership: membership,
    memberships: [membership],
    capabilities: [
      "account.manage",
      "workspace.dashboard.view",
      "workspace.reports.view",
      "workspace.audit.view",
      "workspace.audit.export",
      "workspace.exports.manage",
      "workspace.scans.view",
      "workspace.scans.live",
      "workspace.review.view",
      "workspace.review.manage",
      "workspace.alerts.view",
      "workspace.alerts.manage",
      "workspace.devices.view",
      "workspace.devices.manage",
      "workspace.settings.manage",
      "workspace.patients.view",
      "notifications.view",
      ...(patientImportManager ? ["workspace.patients.manage"] : []),
      ...(appointmentManager
        ? [
            "workspace.appointments.view",
            "workspace.appointments.manage",
            "workspace.staff.manage",
          ]
        : []),
      ...(staffManager ? ["workspace.staff.manage"] : []),
      "billing.view",
    ],
    allowedSurfaces: ["portal"],
    defaultSurface: "portal",
  };
}

function statusFixture() {
  return {
    ok: true,
    service: "Shcare UI fixture",
    now: "2026-07-29T10:00:00.000Z",
    workspace: {
      id: "workspace-ui-foundation",
      name: "Phòng khám Shcare",
      type: "clinic",
    },
    scoped: {
      patientsCount: 2,
      devicesCount: 1,
      devicesOnline: 1,
      scansCount: 3,
      alertsCount: 0,
    },
    status: {
      workspaceId: "workspace-ui-foundation",
      devicesCount: 1,
      devicesOnline: 1,
      recording: false,
      activeScanId: null,
      updatedAt: "2026-07-29T10:00:00.000Z",
    },
  };
}

function monitoringFixture() {
  return {
    generatedAt: "2026-07-29T10:00:00.000Z",
    workspaceId: "workspace-ui-foundation",
    status: {
      type: "status",
      recording: false,
      workspaceId: null,
      patientId: null,
      deviceId: null,
      scanId: null,
      sessionId: null,
      updatedAt: "2026-07-29T10:00:00.000Z",
    },
    devices: [
      {
        id: "Device_Ui-01",
        organizationId: "workspace-ui-foundation",
        name: "Ống nghe Shcare UI",
        status: "available",
        connected: true,
        online: false,
        audioStatus: "idle",
        battery: 84,
        ipAddress: "192.0.2.10",
        updatedAt: "2026-07-29T09:59:00.000Z",
      },
    ],
    scans: [
      {
        id: "Scan_Ui-Live-Previous",
        organizationId: "workspace-ui-foundation",
        patientId: "Patient_Ui-01",
        deviceId: "Device_Ui-01",
        status: "completed",
        createdAt: "2026-07-29T09:30:00.000Z",
        updatedAt: "2026-07-29T09:35:00.000Z",
      },
    ],
    alerts: [clinicalAlertFixture()],
  };
}

function overviewFixture(timezoneOffsetMinutes) {
  return {
    generatedAt: "2026-07-29T10:00:00.000Z",
    workspaceId: "workspace-ui-foundation",
    range: {
      key: "today",
      label: "Hôm nay",
      startAt: "2026-07-28T17:00:00.000Z",
      endAt: "2026-07-29T16:59:59.999Z",
      timezoneOffsetMinutes,
      bucket: "4h",
    },
    stats: {
      clinics: 1,
      workspaces: 1,
      patientsCount: 2,
      pendingDoctors: 0,
      devicesCount: 1,
      devicesOnline: 1,
      scansCount: 3,
      aiJobsFailed: 1,
      storageBytes: 268435456,
      storageUsed: "256 MB",
    },
    measureData: [
      { time: "00:00", count: 1 },
      { time: "04:00", count: 0 },
      { time: "08:00", count: 2 },
      { time: "12:00", count: 0 },
      { time: "16:00", count: 0 },
      { time: "20:00", count: 0 },
    ],
    deviceData: [
      { key: "online", name: "Online", value: 1, color: "#18794e" },
      { key: "offline", name: "Offline", value: 0, color: "#52677a" },
    ],
    aiJobData: [
      { key: "processing", name: "Đang xử lý", value: 0, color: "#2563a6" },
      { key: "completed", name: "Hoàn tất", value: 2, color: "#18794e" },
      { key: "failed", name: "Thất bại", value: 1, color: "#b4233a" },
      { key: "pending", name: "Đang chờ", value: 0, color: "#a15c00" },
    ],
  };
}

function billingFixture() {
  const workspaceId = "workspace-ui-foundation";
  return {
    generatedAt: "2026-07-29T10:00:00.000Z",
    workspace: {
      id: workspaceId,
      name: "Phòng khám Shcare",
      type: "clinic",
      workspaceType: "clinic",
      status: "active",
      packageId: "pkg-ui-foundation",
      subscriptionStatus: "active",
      billingCycle: "monthly",
    },
    package: {
      id: "pkg-ui-foundation",
      name: "Gói phòng khám",
      price: 1200000,
      currency: "VND",
      duration: "monthly",
      features: {
        cloudStorage: true,
        analytics: true,
      },
    },
    subscription: {
      id: "",
      organizationId: workspaceId,
      packageId: "pkg-ui-foundation",
      status: "active",
      billingCycle: "monthly",
      source: "workspace",
      startedAt: "2026-07-01T00:00:00.000Z",
      renewsAt: "",
      canceledAt: "",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
    },
    usage: {
      doctors: 2,
      patients: 3,
      devices: 1,
      aiMonthly: 4,
      storageGb: 0.25,
      storageMetric: "total_storage",
    },
    quota: {
      maxDoctors: 5,
      maxPatients: 100,
      maxDevices: 10,
      storageGb: 10,
      aiMonthly: 100,
      retentionDays: 30,
    },
    usageRows: [
      {
        key: "patients",
        label: "Bệnh nhân",
        used: 3,
        limit: 100,
        unit: "hồ sơ",
        percent: 3,
        status: "ok",
      },
      {
        key: "devices",
        label: "Thiết bị",
        used: 1,
        limit: 10,
        unit: "thiết bị",
        percent: 10,
        status: "ok",
      },
    ],
    currentCharge: {
      packageId: "pkg-ui-foundation",
      amount: 1200000,
      currency: "VND",
      cycle: "monthly",
      source: "service_package",
    },
    billingContact: {
      name: "Phòng khám Shcare",
      email: "billing@shcare.test",
      phone: "0281234567",
      address: "Hồ Chí Minh",
    },
    invoicePolicy: {
      mode: "manual",
      providerConfigured: false,
      message: "Shcare xác nhận thay đổi gói qua quy trình hỗ trợ thủ công.",
    },
  };
}

function appointmentDoctorFixture() {
  return {
    id: "Doctor_Ui-01",
    role: "doctor",
    requestedRole: "doctor",
    name: "BS. Trần Bình",
    email: "doctor.ui@shcare.test",
    specialty: "Nội tổng quát",
    accountStatus: "active",
    roleRequestStatus: "approved",
    workspaceMembership: {
      id: "Membership_Doctor_Ui-01",
      userId: "Doctor_Ui-01",
      organizationId: "workspace-ui-foundation",
      workspaceId: "workspace-ui-foundation",
      role: "doctor",
      status: "active",
      operational: true,
    },
  };
}

function staffInvitationFixture(overrides = {}) {
  return {
    id: "Invitation_Ui-01",
    organizationId: "workspace-ui-foundation",
    email: "nurse.ui@shcare.test",
    role: "nurse",
    name: "Điều dưỡng Lê An",
    phone: "0901234568",
    specialty: "",
    license: "",
    status: "pending",
    expiresAt: "2026-08-05T10:00:00.000Z",
    acceptedAt: "",
    revokedAt: "",
    revokeReason: "",
    sendCount: 1,
    delivery: {
      email: "ready",
      provider: "",
      messageId: "",
      lastAttemptAt: "2026-07-29T10:00:00.000Z",
      errorCode: "",
    },
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}

function notificationInboxFixture(overrides = {}) {
  return {
    id: "Notification_Ui-01",
    userId: "user-ui-foundation",
    workspaceId: "workspace-ui-foundation",
    organizationId: "workspace-ui-foundation",
    type: "appointment_scheduled",
    title: "Lịch hẹn mới đã xác nhận",
    message: "Lịch hẹn của bệnh nhân Nguyễn An đã được backend xác nhận.",
    campaignId: "",
    audienceType: "direct",
    audienceRole: "workspace_admin",
    requestedChannels: ["in_app", "push"],
    inAppStatus: "ready",
    emailStatus: "skipped",
    pushStatus: "sent",
    read: false,
    readAt: null,
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    ...overrides,
  };
}

function appointmentFixture(overrides = {}) {
  const doctorUserId =
    Object.prototype.hasOwnProperty.call(overrides, "doctorUserId")
      ? overrides.doctorUserId
      : "Doctor_Ui-01";
  return {
    id: "Appointment_Ui-01",
    organizationId: "workspace-ui-foundation",
    patientId: "Patient_Ui-01",
    doctorUserId,
    type: "remote_consultation",
    status: "scheduled",
    startsAt: "2027-01-15T08:00:00.000Z",
    endsAt: "2027-01-15T08:30:00.000Z",
    location: "Phòng tư vấn 1",
    channel: "video",
    reason: "Tái khám tim phổi",
    notes: "Mang theo kết quả đo gần nhất",
    cancellationReason: "",
    cancelledAt: "",
    completedAt: "",
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    patient: {
      id: "Patient_Ui-01",
      patientCode: "BN-UI-001",
      name: "Nguyễn An",
      organizationId: "workspace-ui-foundation",
    },
    doctor: doctorUserId
      ? {
          id: "Doctor_Ui-01",
          name: "BS. Trần Bình",
          email: "doctor.ui@shcare.test",
          specialty: "Nội tổng quát",
        }
      : null,
    ...overrides,
  };
}

function clinicalReviewFixture(overrides = {}) {
  return {
    id: "Review_Ui-01",
    scanId: "Scan_Ui-Review-01",
    organizationId: "workspace-ui-foundation",
    patientId: "Patient_Ui-01",
    deviceId: "Device_Ui-01",
    status: "pending",
    decision: "",
    note: "",
    reviewerUserId: "",
    reviewedAt: "",
    version: 1,
    scanStatus: "needs_review",
    scanCreatedAt: "2026-07-29T09:30:00.000Z",
    createdAt: "",
    updatedAt: "2026-07-29T09:30:00.000Z",
    ...overrides,
  };
}

function clinicalAlertFixture(overrides = {}) {
  return {
    id: "Alert_Ui-01",
    organizationId: "workspace-ui-foundation",
    sourceType: "scan",
    sourceId: "Scan_Ui-Review-01",
    dedupeKey: "scan:Scan_Ui-Review-01",
    occurrenceNumber: 1,
    previousAlertId: "",
    occurredAt: "2026-07-29T09:35:00.000Z",
    status: "open",
    severity: "warning",
    title: "Tín hiệu cần kiểm tra",
    message: "Lượt đo có nhiễu và cần được tiếp nhận.",
    patientId: "Patient_Ui-01",
    deviceId: "Device_Ui-01",
    scanId: "Scan_Ui-Review-01",
    acknowledgedByUserId: "",
    acknowledgedAt: "",
    acknowledgementNote: "",
    resolvedByUserId: "",
    resolvedAt: "",
    resolutionNote: "",
    version: 1,
    metadata: {},
    createdAt: "2026-07-29T09:35:00.000Z",
    updatedAt: "2026-07-29T09:35:00.000Z",
    ...overrides,
  };
}

const patientImportCsv =
  "name,patientCode,dateOfBirth,gender,phone\nNguyen An,BN-UI-IMPORT,1990-01-02,male,0901234567\n";

function patientImportBatchFixture(status = "validated") {
  const committed = status === "committed";
  return {
    id: "pimport-ui-foundation",
    organizationId: "workspace-ui-foundation",
    fileName: "patients-ui.csv",
    fileSizeBytes: Buffer.byteLength(patientImportCsv, "utf8"),
    status,
    rowCount: 1,
    validCount: 1,
    invalidCount: 0,
    duplicateCount: 0,
    importedCount: committed ? 1 : 0,
    patientIds: committed ? ["Patient_Import_Ui-01"] : [],
    rows: [
      {
        rowNumber: 2,
        status: "valid",
        issues: [],
        patient: {
          id: "Patient_Import_Ui-01",
          patientCode: "BN-UI-IMPORT",
          name: "Nguyen An",
          dateOfBirth: "1990-01-02",
          gender: "male",
          phone: "0901234567",
          email: "",
          address: "",
          bloodType: "",
          allergies: [],
          emergencyContact: {},
          notes: "",
          profileType: "patient",
        },
      },
    ],
    version: committed ? 2 : 1,
    expiresAt: "2026-07-30T10:00:00.000Z",
    committedAt: committed ? "2026-07-29T10:05:00.000Z" : "",
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: committed
      ? "2026-07-29T10:05:00.000Z"
      : "2026-07-29T10:00:00.000Z",
  };
}

function patientShareFixture(overrides = {}) {
  return {
    id: "Share_Ui-01",
    patientId: "Patient_Ui-01",
    doctorUserId: "Doctor_Ui-01",
    scope: "patient_profile",
    scanIds: [],
    accessLevel: "read",
    purpose: "",
    consentedAt: "",
    active: true,
    authorityType: "clinician_access_grant",
    status: "active",
    recipient: {
      id: "Doctor_Ui-01",
      type: "doctor",
      name: "BS Trần Minh",
      workspaceId: "workspace-ui-foundation",
    },
    grantedByActor: {
      id: "user-ui-foundation",
      name: "Quản trị viên Nguyễn An",
      role: "workspace_admin",
    },
    revokedByActor: null,
    audit: {
      grantedByUserId: "user-ui-foundation",
      grantedAt: "2026-07-29T10:20:00.000Z",
      revokedByUserId: "",
      revokedAt: "",
    },
    createdAt: "2026-07-29T10:20:00.000Z",
    updatedAt: "2026-07-29T10:20:00.000Z",
    ...overrides,
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
  const consoleErrors = [];
  const requestFailures = [];
  const unknownRequests = [];
  const requestedFeatures = new Set();
  const assignmentMutations = [];
  const supportMutations = [];
  const patientImportValidations = [];
  const patientImportCommits = [];
  const appointmentMutations = [];
  const appointmentDetailRequests = [];
  const appointmentRecords = [appointmentFixture()];
  const clinicalReviewMutations = [];
  const clinicalReviewRecords = [clinicalReviewFixture()];
  const clinicalAlertMutations = [];
  const clinicalAlertRecords = [clinicalAlertFixture()];
  const patientShareMutations = [];
  const patientShareRecords = [];
  const notificationInboxMutations = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => {
    requestFailures.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`,
    );
  });

  await page.addInitScript(
    ({ preference }) => {
      if (!window.localStorage.getItem("smart_health_token")) {
        window.localStorage.setItem(
          "smart_health_token",
          "ui-foundation-token",
        );
      }
      window.localStorage.setItem("shcare-theme", preference);

      window.WebSocket = class FixtureWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        constructor(url, protocols = []) {
          this.url = String(url);
          this.protocols =
            typeof protocols === "string" ? [protocols] : protocols;
          this.readyState = FixtureWebSocket.CONNECTING;
          this.binaryType = "blob";
          this.onopen = null;
          this.onmessage = null;
          this.onerror = null;
          this.onclose = null;
          window.setTimeout(() => {
            if (this.readyState !== FixtureWebSocket.CONNECTING) return;
            this.readyState = FixtureWebSocket.OPEN;
            this.onopen?.(new Event("open"));
            const identity = {
              workspaceId: "workspace-ui-foundation",
              patientId: "Patient_Ui-01",
              deviceId: "Device_Ui-01",
              scanId: "Scan_Ui-Live-01",
              sessionId: "Session_Ui-Live-01",
            };
            this.emit({
              type: "status",
              recording: true,
              ...identity,
              updatedAt: "2026-07-29T10:01:00.000Z",
            });
            this.emit({
              type: "audio.session",
              protocolVersion: 2,
              frameEncoding: "shcare_audio_v2",
              ...identity,
              sampleRate: 16000,
              channels: 1,
              bitsPerSample: 16,
              encoding: "pcm_s16le",
              startedAt: "2026-07-29T10:01:00.000Z",
            });
            this.emit({
              type: "metrics",
              recording: true,
              ...identity,
              sampleRate: 16000,
              peak: 1200,
              rms: 480,
              levelPercent: 72,
              bpm: 68,
              updatedAt: "2026-07-29T10:01:01.000Z",
            });
          }, 0);
        }

        emit(payload) {
          if (this.readyState !== FixtureWebSocket.OPEN) return;
          this.onmessage?.(
            new MessageEvent("message", {
              data: JSON.stringify(payload),
            }),
          );
        }

        close(code = 1000, reason = "") {
          if (this.readyState === FixtureWebSocket.CLOSED) return;
          this.readyState = FixtureWebSocket.CLOSED;
          this.onclose?.(
            new CloseEvent("close", {
              code,
              reason,
              wasClean: true,
            }),
          );
        }
      };
    },
    { preference: testCase.preference },
  );

  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__shcareSmokePatientImportBodies = [];
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/portal/patients/import/validate")) {
        const body = init?.body;
        const bodyText =
          typeof body === "string"
            ? body
            : body instanceof Blob
              ? await body.text()
              : null;
        window.__shcareSmokePatientImportBodies.push({ url, bodyText });
      }
      return nativeFetch(input, init);
    };
  });

  await page.route(`http://127.0.0.1:${apiPort}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    if (request.method() === "OPTIONS") {
      await jsonResponse(route, null, 204);
      return;
    }
    const authorization = request.headers().authorization || "";
    const patientImportManager =
      authorization === "Bearer ui-foundation-import-token";
    const appointmentManager =
      authorization === "Bearer ui-foundation-appointment-token";
    const staffManager =
      authorization === "Bearer ui-foundation-staff-token";
    check(
      authorization === "Bearer ui-foundation-token" ||
        patientImportManager ||
        appointmentManager ||
        staffManager,
      `${testCase.name}: API request was missing the expected bearer token`,
    );
    check(
      request.headers()["x-smart-health-surface"] === "portal",
      `${testCase.name}: API request was missing the portal surface`,
    );
    if (request.method() === "GET" && apiPath === "/api/me") {
      await jsonResponse(route, {
        user: fixtureUser({
          patientImportManager,
          appointmentManager,
          staffManager,
        }),
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/v1/me/avatar/cleanup"
    ) {
      requestedFeatures.add("settings-avatar-cleanup");
      await jsonResponse(route, {
        userId: "user-ui-foundation",
        workspaceId: "workspace-ui-foundation",
        status: "not_required",
        operationId: "",
        action: "none",
        previousFileId: "",
        attempts: 0,
        lastErrorCode: "",
        updatedAt: "",
        manualSupportRequired: false,
      });
      return;
    }
    if (
      request.method() === "GET" &&
      ["/api/auth/sessions", "/api/v1/auth/sessions"].includes(apiPath)
    ) {
      requestedFeatures.add("settings-sessions");
      await jsonResponse(route, {
        sessions: [
          {
            id: "session-ui-foundation",
            provider: "fixture",
            current: true,
            revokedAt: null,
            createdAt: "2026-07-29T08:00:00.000Z",
            lastSeenAt: "2026-07-29T10:00:00.000Z",
            ip: "127.0.0.1",
            userAgent: "Chromium browser fixture",
            deviceLabel: "Trình duyệt Chromium",
          },
        ],
      });
      return;
    }
    if (request.method() === "GET" && apiPath === "/api/me/2fa") {
      requestedFeatures.add("settings-2fa");
      await jsonResponse(route, {
        availability: {
          available: true,
          status: "available",
          methods: ["app"],
          reason: "",
        },
        twoFactor: {
          enabled: false,
          method: "",
          verifiedAt: null,
          updatedAt: "2026-07-29T10:00:00.000Z",
        },
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/v1/me/notification-preferences"
    ) {
      requestedFeatures.add("settings-notifications");
      await jsonResponse(route, {
        userId: "user-ui-foundation",
        workspaceId: "workspace-ui-foundation",
        ownership: { kind: "self", userId: "user-ui-foundation" },
        preferences: {
          enabled: true,
          doctorRequests: true,
          abnormalResults: true,
          deviceOffline: true,
          appointments: true,
          messages: true,
          aiUpdates: false,
          newLogin: true,
        },
        channels: {
          inApp: { available: true, status: "ready", reasonCode: "" },
          email: {
            available: false,
            status: "unavailable",
            reasonCode: "PROVIDER_UNAVAILABLE",
          },
          push: {
            available: false,
            status: "unavailable",
            reasonCode: "PROVIDER_UNAVAILABLE",
          },
        },
        updatedAt: "2026-07-29T10:00:00.000Z",
        replayed: false,
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/portal/settings"
    ) {
      requestedFeatures.add("settings-workspace");
      await jsonResponse(route, {
        settings: {},
        workspace: {
          id: "workspace-ui-foundation",
          name: "Phòng khám Shcare",
          type: "clinic",
          address: "Thành phố Hồ Chí Minh",
          phone: "0280000000",
          email: "clinic@shcare.test",
          website: "https://shcare.test",
        },
      });
      return;
    }
    if (request.method() === "GET" && apiPath === "/api/portal/status") {
      await jsonResponse(route, statusFixture());
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/v1/portal/monitoring"
    ) {
      requestedFeatures.add("portal-live-monitoring");
      await jsonResponse(route, monitoringFixture());
      return;
    }
    if (request.method() === "GET" && apiPath === "/api/portal/reports") {
      requestedFeatures.add("reports");
      await jsonResponse(route, {
        summary: {
          patientsCount: 2,
          devicesCount: 1,
          scansCount: 3,
          abnormalScansCount: 1,
        },
        latestScans: [
          {
            id: "scan-ui-foundation",
            patientId: "patient-ui-foundation",
            deviceId: "device-ui-foundation",
            status: "completed",
            aiLabel: "Cần xem lại",
            createdAt: "2026-07-29T09:30:00.000Z",
          },
        ],
      });
      return;
    }
    if (request.method() === "GET" && apiPath === "/api/portal/audit-log") {
      requestedFeatures.add("audit");
      await jsonResponse(route, {
        logs: [
          {
            id: "audit-ui-foundation",
            actorUserId: "user-ui-foundation",
            actorName: "Quản trị viên Nguyễn An",
            actorRole: "workspace_admin",
            workspaceId: "workspace-ui-foundation",
            organizationId: "workspace-ui-foundation",
            organizationName: "Phòng khám Shcare",
            action: "notification.read",
            resourceType: "notification",
            resourceId: "notification-ui-foundation",
            outcome: "success",
            ip: "127.0.0.1",
            userAgent: "Shcare browser fixture",
            metadata: { source: "fixture" },
            createdAt: "2026-07-29T09:45:00.000Z",
          },
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          pageCount: 1,
          sort: "createdAt:desc",
        },
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/v1/portal/devices"
    ) {
      requestedFeatures.add("portal-devices-v1");
      await jsonResponse(route, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        workspaceId: "workspace-ui-foundation",
        devices: [
          {
            id: "Device_Ui-01",
            name: "Ống nghe Shcare UI",
            organizationId: "workspace-ui-foundation",
            assignedPatientId: "",
            status: "available",
            connected: true,
            online: false,
            battery: 84,
            updatedAt: "2026-07-29T09:59:00.000Z",
          },
        ],
      });
      return;
    }
    if (request.method() === "GET" && apiPath === "/api/portal/patients") {
      requestedFeatures.add("patients");
      await jsonResponse(route, {
        patients: [
          {
            id: "Patient_Ui-01",
            name: "Nguyễn An",
            patientCode: "BN-UI-001",
            organizationId: "workspace-ui-foundation",
          },
        ],
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/portal/patients/Patient_Ui-01"
    ) {
      requestedFeatures.add("patient-detail");
      await jsonResponse(route, {
        patient: {
          id: "Patient_Ui-01",
          name: "Nguyễn An",
          patientCode: "BN-UI-001",
          organizationId: "workspace-ui-foundation",
          dateOfBirth: "1990-06-15",
          age: 36,
          gender: "male",
          phone: "0901234567",
          email: "nguyen.an@shcare.test",
          address: "Thành phố Hồ Chí Minh",
          bloodType: "O+",
          allergies: [],
          emergencyContact: {
            name: "Nguyễn Bình",
            phone: "0907654321",
            relationship: "Người thân",
          },
          notes: "",
          scanCount: 0,
          createdAt: "2026-07-28T08:00:00.000Z",
          updatedAt: "2026-07-29T08:00:00.000Z",
        },
      });
      return;
    }
    if (request.method() === "GET" && apiPath === "/api/portal/staff") {
      requestedFeatures.add("appointment-staff");
      requestedFeatures.add("staff-ledger");
      const doctor = appointmentDoctorFixture();
      await jsonResponse(route, {
        workspaceId: "workspace-ui-foundation",
        generatedAt: "2026-07-29T10:00:00.000Z",
        staff: [doctor],
        doctors: [doctor],
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/admin/staff-invitations"
    ) {
      requestedFeatures.add("staff-invitations");
      check(
        url.searchParams.get("organizationId") ===
          "workspace-ui-foundation",
        `${testCase.name}: staff invitation list was not workspace-scoped`,
      );
      await jsonResponse(route, {
        invitations: [staffInvitationFixture()],
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/portal/notifications/inbox"
    ) {
      requestedFeatures.add("notification-inbox");
      await jsonResponse(route, {
        userId: "user-ui-foundation",
        workspaceId: "workspace-ui-foundation",
        notifications: [notificationInboxFixture()],
        updatedAt: "2026-07-29T10:00:01.000Z",
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/portal/notifications"
    ) {
      requestedFeatures.add("portal-shell-notifications");
      await jsonResponse(route, { notifications: [] });
      return;
    }
    if (
      request.method() === "POST" &&
      apiPath ===
        "/api/portal/notifications/inbox/Notification_Ui-01/read"
    ) {
      requestedFeatures.add("notification-inbox-mutation");
      const idempotencyKey =
        request.headers()["idempotency-key"] || "";
      check(
        idempotencyKey.startsWith("portal-notification-inbox-"),
        `${testCase.name}: notification read mutation lacked a bounded idempotency key`,
      );
      notificationInboxMutations.push({
        idempotencyKey,
        notificationId: "Notification_Ui-01",
      });
      const notification = notificationInboxFixture({
        read: true,
        readAt: "2026-07-29T10:02:00.000Z",
        updatedAt: "2026-07-29T10:02:00.000Z",
      });
      await jsonResponse(route, {
        userId: "user-ui-foundation",
        workspaceId: "workspace-ui-foundation",
        action: "read",
        notification,
        notifications: [notification],
        affectedIds: ["Notification_Ui-01"],
        deletedId: null,
        updatedAt: "2026-07-29T10:02:00.000Z",
        replayed: false,
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/v1/share-targets"
    ) {
      requestedFeatures.add("consent-targets");
      await jsonResponse(route, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        workspaceId: "workspace-ui-foundation",
        doctors: [
          {
            id: "Doctor_Ui-01",
            name: "BS Trần Minh",
            organizationId: "workspace-ui-foundation",
            specialty: "Tim mạch",
          },
        ],
        workspaces: [
          {
            id: "workspace-referral-ui",
            name: "Phòng khám liên kết",
            type: "clinic",
          },
        ],
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath ===
        "/api/v1/portal/patients/Patient_Ui-01/shares"
    ) {
      requestedFeatures.add("consent-ledger");
      await jsonResponse(route, {
        generatedAt: "2026-07-29T10:21:00.000Z",
        workspaceId: "workspace-ui-foundation",
        patientId: "Patient_Ui-01",
        shares: patientShareRecords,
      });
      return;
    }
    if (
      request.method() === "POST" &&
      apiPath ===
        "/api/v1/portal/patients/Patient_Ui-01/shares"
    ) {
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      const payload = JSON.parse(request.postData() || "{}");
      check(
        idempotencyKey.startsWith("portal-patient-share-create-"),
        `${testCase.name}: consent create is missing its caller-owned idempotency key`,
      );
      check(
        JSON.stringify(payload) ===
          JSON.stringify({
            doctorUserId: "Doctor_Ui-01",
            scope: "patient_profile",
          }),
        `${testCase.name}: consent create payload drift ${JSON.stringify(payload)}`,
      );
      const share = patientShareFixture();
      patientShareRecords.splice(0, patientShareRecords.length, share);
      patientShareMutations.push({
        operation: "create",
        idempotencyKey,
        shareId: share.id,
      });
      await jsonResponse(
        route,
        {
          generatedAt: "2026-07-29T10:20:01.000Z",
          workspaceId: "workspace-ui-foundation",
          patientId: "Patient_Ui-01",
          share,
          replayed: false,
        },
        201,
      );
      return;
    }
    if (
      request.method() === "DELETE" &&
      apiPath ===
        "/api/v1/portal/patients/Patient_Ui-01/shares/Share_Ui-01"
    ) {
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      check(
        idempotencyKey.startsWith(
          "portal-patient-share-revoke-Share_Ui-01-",
        ),
        `${testCase.name}: consent revoke is missing its share-bound idempotency key`,
      );
      const share = patientShareFixture({
        active: false,
        status: "revoked",
        revokedByActor: {
          id: "user-ui-foundation",
          name: "Quản trị viên Nguyễn An",
          role: "workspace_admin",
        },
        audit: {
          grantedByUserId: "user-ui-foundation",
          grantedAt: "2026-07-29T10:20:00.000Z",
          revokedByUserId: "user-ui-foundation",
          revokedAt: "2026-07-29T10:22:00.000Z",
        },
        updatedAt: "2026-07-29T10:22:00.000Z",
      });
      patientShareRecords.splice(0, patientShareRecords.length, share);
      patientShareMutations.push({
        operation: "revoke",
        idempotencyKey,
        shareId: share.id,
      });
      await jsonResponse(route, {
        generatedAt: "2026-07-29T10:22:01.000Z",
        workspaceId: "workspace-ui-foundation",
        patientId: "Patient_Ui-01",
        share,
        revoked: true,
        replayed: false,
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/portal/review-queue"
    ) {
      requestedFeatures.add("clinical-review-list");
      const status = url.searchParams.get("status") || "";
      const reviews = clinicalReviewRecords.filter(
        (review) => !status || review.status === status,
      );
      await jsonResponse(route, {
        workspaceId: "workspace-ui-foundation",
        reviews,
        reviewQueue: reviews,
      });
      return;
    }
    const clinicalReviewDecisionMatch = apiPath.match(
      /^\/api\/portal\/review-queue\/([^/]+)\/decision$/,
    );
    if (request.method() === "POST" && clinicalReviewDecisionMatch) {
      const scanId = decodeURIComponent(clinicalReviewDecisionMatch[1]);
      const payload = JSON.parse(request.postData() || "{}");
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      check(
        scanId === "Scan_Ui-Review-01" &&
          payload.decision === "accepted" &&
          payload.note === "" &&
          payload.expectedVersion === 1,
        `${testCase.name}: review decision was not bound to the expected scan and version`,
      );
      check(
        idempotencyKey.startsWith(
          "portal-review-workspace-ui-foundation-Scan_Ui-Review-01-",
        ),
        `${testCase.name}: review decision is missing its workspace-bound idempotency key`,
      );
      const index = clinicalReviewRecords.findIndex(
        (review) => review.scanId === scanId,
      );
      const updated = clinicalReviewFixture({
        ...clinicalReviewRecords[index],
        status: "reviewed",
        decision: payload.decision,
        note: payload.note,
        reviewerUserId: "user-ui-foundation",
        reviewedAt: "2026-07-29T10:15:00.000Z",
        version: 2,
        createdAt: "2026-07-29T10:15:00.000Z",
        updatedAt: "2026-07-29T10:15:00.000Z",
      });
      clinicalReviewRecords.splice(index, 1, updated);
      clinicalReviewMutations.push({ scanId, idempotencyKey });
      await jsonResponse(route, {
        workspaceId: "workspace-ui-foundation",
        review: updated,
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/portal/alerts"
    ) {
      requestedFeatures.add("clinical-alert-list");
      const status = url.searchParams.get("status") || "";
      await jsonResponse(route, {
        workspaceId: "workspace-ui-foundation",
        alerts: clinicalAlertRecords.filter(
          (alert) => !status || alert.status === status,
        ),
      });
      return;
    }
    const clinicalAlertActionMatch = apiPath.match(
      /^\/api\/portal\/alerts\/([^/]+)\/(acknowledge|resolve)$/,
    );
    if (request.method() === "POST" && clinicalAlertActionMatch) {
      const alertId = decodeURIComponent(clinicalAlertActionMatch[1]);
      const action = clinicalAlertActionMatch[2];
      const payload = JSON.parse(request.postData() || "{}");
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      check(
        alertId === "Alert_Ui-01" &&
          action === "acknowledge" &&
          payload.note === "" &&
          payload.expectedVersion === 1,
        `${testCase.name}: alert acknowledgement was not bound to the expected ledger version`,
      );
      check(
        idempotencyKey.startsWith(
          "portal-alert-workspace-ui-foundation-acknowledge-Alert_Ui-01-",
        ),
        `${testCase.name}: alert acknowledgement is missing its workspace-bound idempotency key`,
      );
      const index = clinicalAlertRecords.findIndex(
        (alert) => alert.id === alertId,
      );
      const updated = clinicalAlertFixture({
        ...clinicalAlertRecords[index],
        status: "acknowledged",
        acknowledgedByUserId: "user-ui-foundation",
        acknowledgedAt: "2026-07-29T10:16:00.000Z",
        acknowledgementNote: payload.note,
        version: 2,
        updatedAt: "2026-07-29T10:16:00.000Z",
      });
      clinicalAlertRecords.splice(index, 1, updated);
      clinicalAlertMutations.push({ alertId, action, idempotencyKey });
      await jsonResponse(route, {
        workspaceId: "workspace-ui-foundation",
        alert: updated,
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/portal/appointments"
    ) {
      requestedFeatures.add("appointment-list");
      const status = url.searchParams.get("status") || "";
      await jsonResponse(route, {
        appointments: appointmentRecords.filter(
          (appointment) => !status || appointment.status === status,
        ),
      });
      return;
    }
    const appointmentDetailMatch = apiPath.match(
      /^\/api\/portal\/appointments\/([^/]+)$/,
    );
    if (request.method() === "GET" && appointmentDetailMatch) {
      const appointmentId = decodeURIComponent(appointmentDetailMatch[1]);
      requestedFeatures.add("appointment-detail");
      appointmentDetailRequests.push(appointmentId);
      const appointment = appointmentRecords.find(
        (candidate) => candidate.id === appointmentId,
      );
      if (!appointment) {
        await jsonResponse(
          route,
          {
            code: "APPOINTMENT_NOT_FOUND",
            message: "Appointment fixture was not found.",
            requestId: `appointment-detail-${testCase.name}`,
          },
          404,
        );
        return;
      }
      await jsonResponse(route, { appointment });
      return;
    }
    if (
      request.method() === "POST" &&
      apiPath === "/api/portal/appointments"
    ) {
      const payload = JSON.parse(request.postData() || "{}");
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      check(
        idempotencyKey.startsWith("portal-appointment-create-new-"),
        `${testCase.name}: appointment create is missing its caller-owned idempotency key`,
      );
      check(
        payload.patientId === "Patient_Ui-01" &&
          payload.doctorUserId === "Doctor_Ui-01" &&
          payload.reason === "Đánh giá lại sau đo tại nhà" &&
          Date.parse(payload.endsAt) > Date.parse(payload.startsAt),
        `${testCase.name}: appointment create payload is not bound to the selected patient, doctor and time window`,
      );
      const created = appointmentFixture({
        ...payload,
        id: "Appointment_Ui-Created",
        createdAt: "2026-07-29T10:10:00.000Z",
        updatedAt: "2026-07-29T10:10:00.000Z",
      });
      appointmentRecords.push(created);
      appointmentMutations.push({
        operation: "create",
        idempotencyKey,
        appointmentId: created.id,
      });
      await jsonResponse(route, { appointment: created }, 201);
      return;
    }
    if (request.method() === "PATCH" && appointmentDetailMatch) {
      const appointmentId = decodeURIComponent(appointmentDetailMatch[1]);
      const payload = JSON.parse(request.postData() || "{}");
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      check(
        appointmentId === "Appointment_Ui-01" &&
          payload.status === "confirmed",
        `${testCase.name}: appointment confirmation did not target the expected scheduled appointment`,
      );
      check(
        idempotencyKey.startsWith(
          "portal-appointment-confirm-Appointment_Ui-01-",
        ),
        `${testCase.name}: appointment confirmation is missing its caller-owned idempotency key`,
      );
      const appointmentIndex = appointmentRecords.findIndex(
        (candidate) => candidate.id === appointmentId,
      );
      const updated = appointmentFixture({
        ...appointmentRecords[appointmentIndex],
        ...payload,
        updatedAt: "2026-07-29T10:08:00.000Z",
      });
      appointmentRecords.splice(appointmentIndex, 1, updated);
      appointmentMutations.push({
        operation: "confirm",
        idempotencyKey,
        appointmentId,
      });
      await jsonResponse(route, { appointment: updated });
      return;
    }
    if (
      request.method() === "POST" &&
      apiPath === "/api/portal/patients/import/validate"
    ) {
      requestedFeatures.add("patient-import-validate");
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      const contentType = request.headers()["content-type"] || "";
      const fileName = request.headers()["x-file-name"] || "";
      const body = request.postDataBuffer()?.toString("utf8") || "";
      patientImportValidations.push({
        idempotencyKey,
        contentType,
        fileName,
        body,
      });
      check(
        idempotencyKey.startsWith("portal-patient-import-validate-"),
        `${testCase.name}: patient import validation is missing its caller-owned idempotency key`,
      );
      check(
        contentType.startsWith("text/csv") &&
          fileName === "patients-ui.csv",
        `${testCase.name}: patient import validation file contract drift ${JSON.stringify({
          contentType,
          fileName,
          bodyLength: body.length,
          expectedBodyLength: patientImportCsv.length,
          bodyMatches: body === patientImportCsv,
        })}`,
      );
      await jsonResponse(route, {
        batch: patientImportBatchFixture("validated"),
        replayed: false,
      }, 201);
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath ===
        "/api/portal/patients/import/pimport-ui-foundation"
    ) {
      requestedFeatures.add("patient-import-detail");
      await jsonResponse(route, {
        batch: patientImportBatchFixture("validated"),
      });
      return;
    }
    if (
      request.method() === "POST" &&
      apiPath ===
        "/api/portal/patients/import/pimport-ui-foundation/commit"
    ) {
      requestedFeatures.add("patient-import-commit");
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      patientImportCommits.push({ idempotencyKey });
      check(
        idempotencyKey.startsWith(
          "portal-patient-import-commit-pimport-ui-foundation-",
        ),
        `${testCase.name}: patient import commit is missing its caller-owned idempotency key`,
      );
      await jsonResponse(route, {
        batch: patientImportBatchFixture("committed"),
        importedCount: 1,
        patientIds: ["Patient_Import_Ui-01"],
        replayed: false,
      });
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/v1/portal/billing"
    ) {
      requestedFeatures.add("billing");
      await jsonResponse(route, billingFixture());
      return;
    }
    if (
      request.method() === "GET" &&
      apiPath === "/api/v1/portal/overview"
    ) {
      requestedFeatures.add("overview");
      const range = url.searchParams.get("range");
      const timezoneOffsetMinutes = Number(
        url.searchParams.get("timezoneOffsetMinutes"),
      );
      check(
        range === "today",
        `${testCase.name}: dashboard requested an unsupported range ${range}`,
      );
      check(
        Number.isInteger(timezoneOffsetMinutes) &&
          timezoneOffsetMinutes >= -720 &&
          timezoneOffsetMinutes <= 840,
        `${testCase.name}: dashboard requested an invalid timezone offset`,
      );
      await jsonResponse(route, overviewFixture(timezoneOffsetMinutes));
      return;
    }
    if (
      request.method() === "POST" &&
      apiPath === "/api/v1/portal/support"
    ) {
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      const payload = request.postDataJSON();
      supportMutations.push({ idempotencyKey, payload });
      check(
        idempotencyKey.startsWith("portal-support-"),
        `${testCase.name}: support request is missing its caller-owned idempotency key`,
      );
      check(
        payload?.type === "device_connection" &&
          typeof payload?.description === "string" &&
          payload.description.length >= 10 &&
          !Object.hasOwn(payload, "workspaceId") &&
          !Object.hasOwn(payload, "requesterUserId"),
        `${testCase.name}: support payload drift ${JSON.stringify(payload)}`,
      );
      await jsonResponse(route, {
        ticket: {
          id: `support-ticket-${testCase.name}`,
          workspaceId: "workspace-ui-foundation",
          requesterUserId: "user-ui-foundation",
          type: "device_connection",
          status: "open",
          createdAt: "2026-07-29T10:00:00.000Z",
        },
        replayed: false,
      }, 201);
      return;
    }
    if (request.method() === "GET" && apiPath === "/api/portal/scans") {
      if (url.searchParams.get("patientId")) {
        requestedFeatures.add("patient-scans");
        check(
          url.searchParams.get("patientId") === "Patient_Ui-01" &&
            url.searchParams.get("limit") === "100",
          `${testCase.name}: patient scan history query is not bound to the canonical patient`,
        );
        await jsonResponse(route, { scans: [] });
        return;
      }
      requestedFeatures.add("recent-scans");
      check(
        url.searchParams.get("organizationId") === "workspace-ui-foundation" &&
          url.searchParams.get("limit") === "5" &&
          url.searchParams.get("sort") === "createdAt:desc",
        `${testCase.name}: recent scans query is not workspace-bound`,
      );
      await jsonResponse(route, {
        scans: [
          {
            id: "scan-dashboard-ui",
            organizationId: "workspace-ui-foundation",
            patientId: "patient-ui-foundation",
            patient: {
              id: "patient-ui-foundation",
              name: "Nguyễn An",
              organizationId: "workspace-ui-foundation",
            },
            deviceId: "device-ui-foundation",
            status: "completed",
            aiLabel: "abnormal",
            createdAt: "2026-07-29T09:30:00.000Z",
          },
        ],
        pagination: {
          page: 1,
          limit: 5,
          total: 1,
          pageCount: 1,
          hasNextPage: false,
          sort: "createdAt:desc",
        },
      });
      return;
    }
    if (
      request.method() === "PATCH" &&
      apiPath === "/api/v1/portal/devices/Device_Ui-01"
    ) {
      const idempotencyKey = request.headers()["idempotency-key"] || "";
      const payload = request.postDataJSON();
      assignmentMutations.push({ idempotencyKey, payload });
      check(
        idempotencyKey.startsWith("portal-device-assignment-"),
        `${testCase.name}: assignment request is missing its caller-owned idempotency key`,
      );
      check(
        JSON.stringify(payload) ===
          JSON.stringify({ assignedPatientId: "Patient_Ui-01" }),
        `${testCase.name}: assignment payload drift ${JSON.stringify(payload)}`,
      );
      await jsonResponse(route, {
        device: {
          id: "Device_Ui-01",
          name: "Ống nghe Shcare UI",
          organizationId: "workspace-ui-foundation",
          assignedPatientId: "Patient_Ui-01",
          status: "available",
          online: false,
        },
        replayed: false,
      });
      return;
    }
    unknownRequests.push(`${request.method()} ${apiPath}`);
    await jsonResponse(
      route,
      {
        code: "UNEXPECTED_UI_FOUNDATION_REQUEST",
        message: "Unexpected API request in Portal UI foundation smoke.",
        requestId: "ui-foundation-unexpected",
      },
      404,
    );
  });

  try {
    for (const routeCase of routeCases) {
      if (routeCase.patientImportManager) {
        await page.evaluate(() => {
          window.localStorage.setItem(
            "smart_health_token",
            "ui-foundation-import-token",
          );
        });
      }
      if (routeCase.appointmentManager) {
        await page.evaluate(() => {
          window.localStorage.setItem(
            "smart_health_token",
            "ui-foundation-appointment-token",
          );
        });
      }
      if (routeCase.staffManager) {
        await page.evaluate(() => {
          window.localStorage.setItem(
            "smart_health_token",
            "ui-foundation-staff-token",
          );
        });
      }
      await page.goto(`${origin}${routeCase.path}`, {
        waitUntil: "domcontentloaded",
      });
      const main = page.getByRole("main");
      await main.getByTestId(routeCase.testId).waitFor();
      await main
        .getByRole("heading", { name: routeCase.heading, level: 1, exact: true })
        .waitFor();
      if (routeCase.path === "/portal/onboarding") {
        await main.getByText("5/6 bước hoàn tất", { exact: true }).waitFor();
      }

      const h1Count = await main.locator("h1").count();
      check(
        h1Count === 1,
        `${testCase.name} ${routeCase.path}: expected one main h1, received ${h1Count}`,
      );

      const legacyClassCount = await main
        .locator(
          ".glass-panel, .hero-gradient-text, .brand-gradient-text, .premium-button, .premium-card",
        )
        .count();
      check(
        legacyClassCount === 0,
        `${testCase.name} ${routeCase.path}: found ${legacyClassCount} legacy UI classes`,
      );

      const theme = await page.evaluate(() => ({
        preference: document.documentElement.dataset.theme,
        resolved: document.documentElement.dataset.resolvedTheme,
      }));
      check(
        theme.preference === testCase.preference &&
          theme.resolved === testCase.colorScheme,
        `${testCase.name} ${routeCase.path}: theme drift ${JSON.stringify(theme)}`,
      );

      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      check(
        layout.documentWidth <= layout.viewport,
        `${testCase.name} ${routeCase.path}: horizontal overflow ${layout.documentWidth}px > ${layout.viewport}px`,
      );

      const targets = await main
        .locator(
          'button:visible, a[href]:visible, input:visible, textarea:visible, [role="combobox"]:visible, [data-action-label]:visible',
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label:
                element.getAttribute("aria-label") ||
                element.textContent?.trim() ||
                element.tagName,
              width: rect.width,
              height: rect.height,
            };
          }),
        );
      check(
        targets.every((target) => target.width >= 44 && target.height >= 44),
        `${testCase.name} ${routeCase.path}: undersized targets ${JSON.stringify(
          targets.filter(
            (target) => target.width < 44 || target.height < 44,
          ),
        )}`,
      );

      const axe = await new AxeBuilder({ page }).include("main").analyze();
      const serious = axe.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact || ""),
      );
      const seriousDiagnostics = serious.length
        ? await main.locator("label").evaluateAll((labels) =>
            labels.map((label) => {
              const style = window.getComputedStyle(label);
              return {
                text: label.textContent?.trim(),
                color: style.color,
                background: style.backgroundColor,
                opacity: style.opacity,
              };
            }),
          )
        : [];
      check(
        serious.length === 0,
        `${testCase.name} ${routeCase.path}: axe serious/critical ${serious
          .map(
            (violation) =>
              `${violation.id}(${violation.nodes
                .map(
                  (node) =>
                    `${node.target.join(" ")}: ${node.failureSummary || node.html}`,
                )
                .join(", ")})`,
          )
          .join(", ")}; label styles ${JSON.stringify(seriousDiagnostics)}`,
      );

      if (routeCase.path === "/portal/devices/assign") {
        await main.getByRole("combobox", { name: "Thiết bị" }).click();
        await page
          .getByRole("option", { name: /Ống nghe Shcare UI/ })
          .click();
        await main.getByRole("combobox", { name: "Bệnh nhân" }).click();
        await page.getByRole("option", { name: /Nguyễn An/ }).click();
        await main
          .getByRole("button", { name: "Xác nhận gán thiết bị" })
          .click();
        await page.waitForURL("**/portal/devices", { timeout: 10_000 });
        await page
          .getByRole("main")
          .getByText("Ống nghe Shcare UI", { exact: true })
          .first()
          .waitFor();
      }
      if (routeCase.path === "/portal/billing") {
        await main
          .getByText(/Thanh toán trực tuyến chưa được tích hợp/i)
          .waitFor();
        await main
          .getByRole("progressbar", { name: /Bệnh nhân: Trong hạn mức/i })
          .waitFor();
        check(
          (await main.getByText(/Provider:/i).count()) === 0,
          `${testCase.name}: billing leaked a technical provider label`,
        );
      }
      if (routeCase.path === "/portal/dashboard") {
        await main.getByTestId("dashboard-metric-patients").waitFor();
        await main.getByText("Hoàn tất", { exact: true }).waitFor();
        check(
          (await main.getByText("abnormal", { exact: true }).count()) === 0,
          `${testCase.name}: dashboard leaked the supplemental AI label`,
        );
      }
      if (routeCase.path === "/portal/onboarding") {
        check(
          (await main.getByText("Chưa xác minh", { exact: true }).count()) === 0,
          `${testCase.name}: onboarding left a backend-backed step unverified`,
        );
        await main
          .getByRole("progressbar", { name: "Tiến độ bắt đầu nhanh" })
          .waitFor();
      }
      if (routeCase.path === "/portal/help") {
        await main
          .getByRole("button", { name: /Thiết bị offline:/i })
          .click();
        await main
          .getByRole("textbox", { name: "Mô tả vấn đề" })
          .fill(
            `Thiết bị vẫn ngoại tuyến trong browser smoke ${testCase.name}.`,
          );
        await main
          .getByRole("button", { name: "Gửi yêu cầu hỗ trợ" })
          .click();
        await main
          .getByRole("heading", {
            name: "Đã ghi nhận yêu cầu",
            level: 2,
          })
          .waitFor();
        await main
          .getByText(`support-ticket-${testCase.name}`, { exact: true })
          .waitFor();
        check(
          (await main.getByText(/1-4 giờ/i).count()) === 0 &&
            (await main.getByText(/1800 1234/i).count()) === 0,
          `${testCase.name}: help surface exposed an invented SLA or hotline`,
        );
        const successAxe = await new AxeBuilder({ page })
          .include("#support-ticket-success")
          .analyze();
        const successSerious = successAxe.violations.filter((violation) =>
          ["serious", "critical"].includes(violation.impact || ""),
        );
        check(
          successSerious.length === 0,
          `${testCase.name} /portal/help success: axe serious/critical ${successSerious
            .map((violation) => violation.id)
            .join(", ")}`,
        );
      }
      if (routeCase.path === "/portal/workspace") {
        await main.locator("[data-workspace-card]").first().waitFor();
        check(
          (await main.getByText("0 bệnh nhân", { exact: true }).count()) === 0,
          `${testCase.name}: workspace switcher fabricated a zero metric`,
        );
        await main
          .getByText("Số liệu vận hành chưa sẵn sàng", { exact: true })
          .waitFor();
      }
      if (routeCase.path === "/portal/settings") {
        await main.getByRole("tab", { name: "Bảo mật" }).click();
        await main
          .getByRole("heading", { name: "Phiên đăng nhập", level: 2 })
          .waitFor();
        await main
          .getByTestId("auth-session-session-ui-foundation")
          .waitFor();
        await main.getByRole("tab", { name: "Thông báo" }).click();
        await main
          .getByRole("checkbox", { name: /Lịch hẹn/i })
          .waitFor();
        await main.getByRole("tab", { name: "Workspace" }).click();
        await main.getByLabel("Tên workspace").waitFor();
      }
      if (routeCase.path === "/portal/patients") {
        await main
          .locator('[data-testid="patient-name-Patient_Ui-01"]:visible')
          .waitFor();
        check(
          (await main
            .getByRole("button", { name: "Thêm bệnh nhân" })
            .count()) === 0,
          `${testCase.name}: view-only patient route exposed a manage action`,
        );
      }
      if (routeCase.path === "/portal/patients/Patient_Ui-01") {
        await main
          .getByText(
            "Bạn đang có quyền xem; các trường chỉnh sửa đã được khóa.",
            { exact: true },
          )
          .waitFor();
        check(
          (await main.getByRole("button", { name: "Lưu hồ sơ" }).count()) ===
            0 &&
            (await main.getByRole("button", { name: "Xóa hồ sơ" }).count()) ===
              0,
          `${testCase.name}: view-only patient detail exposed a manage action`,
        );
      }
      if (routeCase.path === "/portal/records/review") {
        await main
          .getByRole("heading", {
            name: "Lượt đo Scan_Ui-Review-01",
          })
          .waitFor();
        await main
          .getByRole("button", {
            name: "Ghi nhận quyết định",
            exact: true,
          })
          .click();
        await main
          .getByText("Không có lượt đo đang chờ xem lại.", {
            exact: true,
          })
          .waitFor();
        const reviewAxe = await new AxeBuilder({ page })
          .include('[data-testid="portal-review-queue-page"]')
          .analyze();
        check(
          reviewAxe.violations.every(
            (violation) =>
              !["serious", "critical"].includes(violation.impact || ""),
          ),
          `${testCase.name} /portal/records/review mutation: axe serious/critical`,
        );
      }
      if (routeCase.path === "/portal/alerts") {
        await main
          .getByRole("heading", {
            name: "Tín hiệu cần kiểm tra",
          })
          .waitFor();
        await main
          .getByRole("button", { name: "Tiếp nhận", exact: true })
          .click();
        await main
          .getByText("Không có cảnh báo ở trạng thái đã chọn.", {
            exact: true,
          })
          .waitFor();
        const alertAxe = await new AxeBuilder({ page })
          .include('[data-testid="portal-alert-center-page"]')
          .analyze();
        check(
          alertAxe.violations.every(
            (violation) =>
              !["serious", "critical"].includes(violation.impact || ""),
          ),
          `${testCase.name} /portal/alerts mutation: axe serious/critical`,
        );
      }
      if (routeCase.path === "/portal/live") {
        await main.getByText("WSS đã xác thực", { exact: true }).waitFor();
        await main.getByText("Online 0/1", { exact: true }).waitFor();
        await main.getByText("68 bpm", { exact: true }).waitFor();
        await main
          .getByText(
            "Thiết bị Device_Ui-01 · Lượt đo Scan_Ui-Live-01",
            { exact: true },
          )
          .waitFor();
        check(
          requestedFeatures.has("portal-live-monitoring"),
          `${testCase.name}: Live Monitoring did not request the canonical v1 snapshot`,
        );
        check(
          (await main.getByText("0 bpm", { exact: true }).count()) === 0,
          `${testCase.name}: Live Monitoring invented a zero-valued metric`,
        );
      }
      if (routeCase.path === "/portal/devices") {
        await main.getByText("Offline", { exact: true }).first().waitFor();
        check(
          requestedFeatures.has("portal-devices-v1"),
          `${testCase.name}: Devices did not request the canonical workspace-bound v1 list`,
        );
        check(
          (await main.getByText("Online", { exact: true }).count()) === 0,
          `${testCase.name}: Devices promoted legacy connected=true into Online`,
        );
      }
      if (routeCase.path === "/portal/patients/import") {
        await main.getByLabel("Chọn file CSV").setInputFiles({
          name: "patients-ui.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(patientImportCsv, "utf8"),
        });
        await main
          .getByRole("button", { name: "Kiểm tra file" })
          .click();
        await main.getByTestId("patient-import-preview").waitFor();
        await main
          .locator('[data-testid="patient-import-row-2"]:visible')
          .waitFor();
        const capturedImportBodies = await page.evaluate(
          () => window.__shcareSmokePatientImportBodies || [],
        );
        check(
          capturedImportBodies.some(
            (capture) => capture.bodyText === patientImportCsv,
          ),
          `${testCase.name}: browser fetch did not receive the selected CSV bytes`,
        );
        await main
          .getByRole("button", { name: "Làm mới trạng thái" })
          .click();
        await main
          .getByRole("button", { name: "Import 1 hồ sơ" })
          .click();
        const importDialog = page.getByRole("alertdialog");
        await importDialog
          .getByRole("button", { name: "Xác nhận import" })
          .click();
        await main.getByText("Import hoàn tất", { exact: true }).waitFor();
        await main
          .getByText(
            "Backend đã xác nhận tạo trọn vẹn 1 hồ sơ. Không có kết quả từng phần.",
            { exact: true },
          )
          .waitFor();

        const committedAxe = await new AxeBuilder({ page })
          .include('[data-testid="patient-import-page"]')
          .analyze();
        const committedSerious = committedAxe.violations.filter((violation) =>
          ["serious", "critical"].includes(violation.impact || ""),
        );
        check(
          committedSerious.length === 0,
          `${testCase.name} /portal/patients/import committed: axe serious/critical ${committedSerious
            .map((violation) => violation.id)
            .join(", ")}`,
        );
      }
      if (routeCase.path === "/portal/appointments") {
        const initialRow = main.locator(
          '[data-appointment-row="Appointment_Ui-01"]:visible',
        );
        await initialRow.waitFor();
        await initialRow
          .getByRole("button", { name: "Chi tiết", exact: true })
          .click();
        const detailDialog = page.getByRole("dialog", {
          name: "Chi tiết lịch hẹn",
        });
        await detailDialog
          .getByText("Tái khám tim phổi", { exact: true })
          .waitFor();
        await detailDialog
          .getByRole("button", { name: "Đóng", exact: true })
          .click();

        await initialRow
          .getByRole("button", { name: "Xác nhận", exact: true })
          .click();
        await initialRow
          .getByText("Đã xác nhận", { exact: true })
          .waitFor();

        await main
          .getByRole("button", { name: "Tạo lịch hẹn", exact: true })
          .click();
        const createDialog = page.getByRole("dialog", {
          name: "Tạo lịch hẹn",
        });
        await createDialog
          .getByLabel("Bệnh nhân")
          .selectOption("Patient_Ui-01");
        await createDialog
          .getByLabel("Bác sĩ phụ trách")
          .selectOption("Doctor_Ui-01");
        await createDialog
          .getByLabel("Bắt đầu")
          .fill("2027-01-20T09:00");
        await createDialog
          .getByLabel("Kết thúc")
          .fill("2027-01-20T09:45");
        await createDialog
          .getByLabel("Lý do hẹn")
          .fill("Đánh giá lại sau đo tại nhà");
        await createDialog
          .getByLabel("Địa điểm / kênh")
          .fill("Phòng tư vấn 2");
        await createDialog
          .getByRole("button", { name: "Gửi tới backend", exact: true })
          .click();
        await main
          .locator(
            '[data-appointment-row="Appointment_Ui-Created"]:visible',
          )
          .waitFor();

        const appointmentAxe = await new AxeBuilder({ page })
          .include('[data-testid="portal-appointments-page"]')
          .analyze();
        const appointmentSerious = appointmentAxe.violations.filter(
          (violation) =>
            ["serious", "critical"].includes(violation.impact || ""),
        );
        check(
          appointmentSerious.length === 0,
          `${testCase.name} /portal/appointments mutations: axe serious/critical ${appointmentSerious
            .map((violation) => violation.id)
            .join(", ")}`,
        );
      }
      if (routeCase.path === "/portal/consent") {
        await main
          .getByLabel("Hồ sơ bệnh nhân")
          .selectOption("Patient_Ui-01");
        await main
          .getByText("Chưa có quyền truy cập nào", { exact: true })
          .waitFor();
        await main
          .getByLabel("Bác sĩ nhận quyền")
          .selectOption("Doctor_Ui-01");
        await main
          .getByRole("button", { name: "Cấp quyền truy cập", exact: true })
          .click();
        const shareRow = main.locator(
          '[data-share-row="Share_Ui-01"]:visible',
        );
        await shareRow.waitFor();
        await shareRow.getByText("Đang hiệu lực", { exact: true }).waitFor();
        await shareRow
          .locator('[data-share-revoke="Share_Ui-01"]:visible')
          .click();
        const revokeDialog = page.getByRole("alertdialog");
        await revokeDialog
          .getByRole("button", { name: "Xác nhận thu hồi", exact: true })
          .click();
        await shareRow.getByText("Đã thu hồi", { exact: true }).waitFor();
        const consentAxe = await new AxeBuilder({ page })
          .include('[data-testid="portal-consent"]')
          .analyze();
        const consentSerious = consentAxe.violations.filter((violation) =>
          ["serious", "critical"].includes(violation.impact || ""),
        );
        check(
          consentSerious.length === 0,
          `${testCase.name} /portal/consent mutations: axe serious/critical ${consentSerious
            .map(
              (violation) =>
                `${violation.id}(${violation.nodes
                  .map(
                    (node) =>
                      `${node.target.join(" ")}: ${node.failureSummary || node.html}`,
                  )
                  .join(" | ")})`,
            )
            .join(", ")}`,
        );
      }
      if (routeCase.path === "/portal/staff") {
        await main.getByText("BS. Trần Bình", { exact: true }).waitFor();
        await main
          .getByRole("tab", { name: "Lời mời (1)", exact: true })
          .click();
        await main
          .getByText("nurse.ui@shcare.test", { exact: true })
          .waitFor();
        await main
          .getByRole("button", { name: "Mời nhân sự", exact: true })
          .click();
        const inviteDialog = page.getByRole("dialog");
        await inviteDialog.getByLabel("Họ và tên").waitFor();
        const inviteAxe = await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .analyze();
        check(
          inviteAxe.violations.every(
            (violation) =>
              !["serious", "critical"].includes(violation.impact || ""),
          ),
          `${testCase.name} /portal/staff dialog: axe serious/critical ${inviteAxe.violations
            .filter((violation) =>
              ["serious", "critical"].includes(violation.impact || ""),
            )
            .map(
              (violation) =>
                `${violation.id}(${violation.nodes
                  .map(
                    (node) =>
                      `${node.target.join(" ")}: ${node.failureSummary || node.html}`,
                  )
                  .join(" | ")})`,
            )
            .join(", ")}`,
        );
        await inviteDialog
          .getByRole("button", { name: "Hủy", exact: true })
          .click();
      }
      if (routeCase.path === "/portal/notifications") {
        await main
          .getByRole("article", {
            name: "Lịch hẹn mới đã xác nhận. Chưa đọc",
            exact: true,
          })
          .waitFor();
        await main
          .getByRole("button", {
            name: "Đánh dấu đã đọc",
            exact: true,
          })
          .click();
        await main
          .getByRole("article", {
            name: "Lịch hẹn mới đã xác nhận. Đã đọc",
            exact: true,
          })
          .waitFor();
      }
    }

    check(
      requestedFeatures.has("reports") &&
        requestedFeatures.has("audit") &&
        requestedFeatures.has("portal-devices-v1") &&
        requestedFeatures.has("consent-targets") &&
        requestedFeatures.has("consent-ledger") &&
        requestedFeatures.has("patients") &&
        requestedFeatures.has("billing") &&
        requestedFeatures.has("overview") &&
        requestedFeatures.has("recent-scans") &&
        requestedFeatures.has("settings-sessions") &&
        requestedFeatures.has("settings-2fa") &&
        requestedFeatures.has("settings-notifications") &&
        requestedFeatures.has("settings-workspace") &&
        requestedFeatures.has("patient-detail") &&
        requestedFeatures.has("patient-scans") &&
        requestedFeatures.has("patient-import-validate") &&
        requestedFeatures.has("patient-import-detail") &&
        requestedFeatures.has("patient-import-commit") &&
        requestedFeatures.has("appointment-list") &&
        requestedFeatures.has("appointment-detail") &&
        requestedFeatures.has("appointment-staff") &&
        requestedFeatures.has("staff-ledger") &&
        requestedFeatures.has("staff-invitations") &&
        requestedFeatures.has("portal-shell-notifications") &&
        requestedFeatures.has("notification-inbox") &&
        requestedFeatures.has("notification-inbox-mutation") &&
        requestedFeatures.has("clinical-review-list") &&
        requestedFeatures.has("clinical-alert-list"),
      `${testCase.name}: migrated routes did not request all canonical datasets`,
    );
    check(
      notificationInboxMutations.length === 1,
      `${testCase.name}: expected one confirmed notification mutation, received ${notificationInboxMutations.length}`,
    );
    check(
      assignmentMutations.length === 1,
      `${testCase.name}: expected one confirmed assignment mutation, received ${assignmentMutations.length}`,
    );
    check(
      supportMutations.length === 1,
      `${testCase.name}: expected one confirmed support mutation, received ${supportMutations.length}`,
    );
    check(
      patientImportValidations.length === 1,
      `${testCase.name}: expected one patient import validation, received ${patientImportValidations.length}`,
    );
    check(
      patientImportCommits.length === 1,
      `${testCase.name}: expected one confirmed patient import commit, received ${patientImportCommits.length}`,
    );
    check(
      appointmentDetailRequests.length === 1 &&
        appointmentDetailRequests[0] === "Appointment_Ui-01",
      `${testCase.name}: appointment detail was not fetched from the exact canonical endpoint`,
    );
    check(
      appointmentMutations.length === 2 &&
        appointmentMutations.some(
          (mutation) => mutation.operation === "confirm",
        ) &&
        appointmentMutations.some(
          (mutation) => mutation.operation === "create",
        ),
      `${testCase.name}: expected confirmed appointment create + status mutations, received ${JSON.stringify(appointmentMutations)}`,
    );
    check(
      clinicalReviewMutations.length === 1,
      `${testCase.name}: expected one confirmed review decision, received ${JSON.stringify(clinicalReviewMutations)}`,
    );
    check(
      clinicalAlertMutations.length === 1 &&
        clinicalAlertMutations[0].action === "acknowledge",
      `${testCase.name}: expected one confirmed alert acknowledgement, received ${JSON.stringify(clinicalAlertMutations)}`,
    );
    check(
      patientShareMutations.length === 2 &&
        patientShareMutations.some(
          (mutation) => mutation.operation === "create",
        ) &&
        patientShareMutations.some(
          (mutation) => mutation.operation === "revoke",
        ),
      `${testCase.name}: expected confirmed consent create + revoke mutations, received ${JSON.stringify(patientShareMutations)}`,
    );
    check(
      unknownRequests.length === 0,
      `${testCase.name}: unexpected API requests ${unknownRequests.join(", ")}`,
    );
    check(
      consoleErrors.length === 0,
      `${testCase.name}: console/page errors ${consoleErrors.join(" | ")}`,
    );
    check(
      requestFailures.length === 0,
      `${testCase.name}: failed requests ${requestFailures.join(" | ")}`,
    );
  } finally {
    await context.close();
  }
}

let browser;
try {
  const [webPort, apiPort] = await Promise.all([freePort(), freePort()]);
  const vite = startVite(webPort, apiPort);
  await waitForUrl(`http://127.0.0.1:${webPort}`);
  browser = await browserRuntime.browserType.launch({ headless: true });
  for (const testCase of selectedCases) {
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
    `Portal UI foundation browser smoke failed (${failures.length}/${checks} checks):`,
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Portal UI foundation browser smoke passed on ${browserRuntime.name} (${checks} checks; ${routeCases.length} routes x ${selectedCases.length} viewport/theme cases).`,
  );
}
