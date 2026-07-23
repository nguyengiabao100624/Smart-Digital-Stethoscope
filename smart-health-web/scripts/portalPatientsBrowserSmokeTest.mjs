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
const webRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(webRoot, "..");
const backendRoot = path.join(
  workspaceRoot,
  "smart-health-embedded",
  "web-monitor",
);
const backendEntry = path.join(backendRoot, "server.js");
const viteEntry = path.join(webRoot, "node_modules", "vite", "bin", "vite.js");
const dataDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "shcare-portal-patients-browser-"),
);
const children = [];
const failures = [];
let checks = 0;

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 1000 },
];
const themes = [
  { preference: "light", colorScheme: "light" },
  { preference: "dark", colorScheme: "dark" },
  { preference: "system", colorScheme: "dark" },
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
      failures.push(
        `${label} exited early with code ${code}: ${output.join("").slice(-2000)}`,
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

async function waitForUrl(url, label, timeoutMs = 60_000) {
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

async function readJson(response, label) {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    throw new Error(
      `${label}: HTTP ${response.status} ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

function seedWorkspaceAdminFixture() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  const userId = `usr_portal_patients_${suffix}`;
  const workspaceId = `org_portal_patients_${suffix}`;
  const email = `portal-patients-${suffix}@smarthealth.test`;
  const password = "BrowserSmoke-Workspace-12345678";
  const fixture = {
    version: 1,
    createdAt,
    updatedAt: createdAt,
    users: [
      {
        id: userId,
        role: "workspace_admin",
        requestedRole: "workspace_admin",
        roleRequestStatus: "approved",
        accountStatus: "active",
        name: "Portal Patients Browser Smoke",
        email,
        password,
        organizationId: workspaceId,
        verifiedEmail: true,
        verifiedPhone: false,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    organizations: [
      {
        id: workspaceId,
        name: "Portal Patients Browser Clinic",
        type: "clinic",
        workspaceType: "clinic",
        status: "active",
        version: 1,
        createdAt,
        updatedAt: createdAt,
      },
    ],
    memberships: [
      {
        id: `mbr_portal_patients_${suffix}`,
        userId,
        organizationId: workspaceId,
        role: "workspace_admin",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
    ],
  };
  fs.writeFileSync(
    path.join(dataDir, "db.json"),
    JSON.stringify(fixture, null, 2),
  );
  return { suffix, email, password };
}

async function loginWorkspaceAdmin(apiOrigin, fixture) {
  const loginResponse = await fetch(`${apiOrigin}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: fixture.email,
      password: fixture.password,
    }),
  });
  const login = await readJson(loginResponse, "login workspace admin");
  if (loginResponse.status !== 200 || !login?.token) {
    throw new Error("login workspace admin: response did not include a token");
  }
  return { token: login.token, suffix: fixture.suffix };
}

async function apiRequest(apiOrigin, token, route, options = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-Smart-Health-Surface": options.surface || "portal",
    "X-Smart-Health-Client": "portal-patients-browser-smoke",
  };
  if (options.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.rawBody !== undefined) {
    headers["Content-Type"] = options.contentType || "application/octet-stream";
    if (options.fileName) headers["X-File-Name"] = encodeURIComponent(options.fileName);
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${apiOrigin}/api${route}`, {
    method: options.method || "GET",
    headers,
    body:
      options.rawBody !== undefined
        ? options.rawBody
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { ok: response.ok, status: response.status, payload };
}

function assertPatientReceipt(payload, expected, label, replayed) {
  const patient = payload?.patient;
  if (!patient?.id || payload?.replayed !== replayed) {
    throw new Error(`${label}: missing canonical patient or replay state`);
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
        `${label}: field ${field} did not match the submitted intent`,
      );
    }
  }
  if (
    JSON.stringify(patient.allergies || []) !==
    JSON.stringify(expected.allergies || [])
  ) {
    throw new Error(`${label}: allergies did not match the submitted intent`);
  }
  for (const field of ["name", "phone", "relationship"]) {
    if (
      (patient.emergencyContact?.[field] || "") !==
      (expected.emergencyContact?.[field] || "")
    ) {
      throw new Error(
        `${label}: emergencyContact.${field} did not match the submitted intent`,
      );
    }
  }
  return patient;
}

function requestIdempotencyKey(response, label) {
  const value = response.request().headers()["idempotency-key"] || "";
  if (!value)
    throw new Error(`${label}: request did not include Idempotency-Key`);
  return value;
}

async function inspectPortalSurface(
  page,
  viewport,
  theme,
  runtimeErrors,
  responseErrors,
  options,
) {
  await page
    .waitForSelector(options.readySelector, { timeout: 20_000 })
    .catch(async (error) => {
      const body = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      const tokenLength = await page
        .evaluate(
          () => window.localStorage.getItem("smart_health_token")?.length || 0,
        )
        .catch(() => 0);
      throw new Error(
        `${options.label} surface unavailable at ${page.url()} (tokenLength=${tokenLength}, responses=${responseErrors.join(" | ")}): ${body.slice(0, 1200)}`,
        { cause: error },
      );
    });
  if (options.secondarySelector) {
    await page.waitForSelector(options.secondarySelector, { timeout: 20_000 });
  }
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
        if (style.display === "none" || style.visibility === "hidden")
          return false;
        if (rect.width === 0 || rect.height === 0) return false;
        if (element.tagName === "A" && style.display === "inline") return false;
        return rect.width < 44 || rect.height < 44;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const name =
          element.getAttribute("aria-label") ||
          element.textContent?.trim() ||
          element.id;
        return `${element.tagName.toLowerCase()}[${Math.round(rect.width)}x${Math.round(rect.height)}] ${name}`;
      });
    return {
      theme: root.dataset.theme,
      overflow: root.scrollWidth - innerWidth,
      tinyTargets,
    };
  });
  const label = `${options.label}/${viewport.name}/${theme.preference}`;
  if (layout.theme !== theme.preference)
    failures.push(`${label}: theme=${layout.theme || "missing"}`);
  if (layout.overflow > 1)
    failures.push(`${label}: horizontal overflow ${layout.overflow}px`);
  if (layout.tinyTargets.length) {
    failures.push(
      `${label}: targets below 44px: ${layout.tinyTargets.slice(0, 12).join(", ")}`,
    );
  }
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  for (const violation of axe.violations.filter((item) =>
    ["serious", "critical"].includes(item.impact || ""),
  )) {
    const nodes = violation.nodes
      .slice(0, 3)
      .map(
        (node) =>
          `${node.target.join(" ")} (${node.failureSummary || node.html || "no detail"})`,
      )
      .join("; ");
    failures.push(
      `${label}: axe ${violation.impact} ${violation.id}: ${nodes}`,
    );
  }
  for (const error of runtimeErrors.splice(0))
    failures.push(`${label}: console ${error}`);
  for (const error of responseErrors.splice(0))
    failures.push(`${label}: response ${error}`);
  checks += 1;
}

async function exercisePatientMutation(page, apiOrigin, account, state) {
  const expected = {
    patientCode: `PORTAL-${account.suffix}`,
    name: `Portal Patient ${account.suffix}`,
    dateOfBirth: "1984-06-15",
    gender: "female",
    phone: "0900000000",
    email: `patient-${account.suffix}@smarthealth.test`,
    address: "12 Nguyen Trai, District 1",
    bloodType: "O+",
    allergies: ["penicillin", "latex"],
    emergencyContact: {
      name: "Portal Emergency Contact",
      phone: "0911111111",
      relationship: "family",
    },
    notes: "Browser-confirmed structured patient profile",
  };
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

  const createResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/portal/patients" &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.locator("#portal-save-patient").click();
  const createResponse = await createResponsePromise;
  const createPayload = await readJson(createResponse, "create patient");
  if (createResponse.status() !== 201) {
    throw new Error(
      `create patient: expected HTTP 201, got ${createResponse.status()}`,
    );
  }
  const patient = assertPatientReceipt(
    createPayload,
    expected,
    "create patient",
    false,
  );
  if (patient.id === expected.patientCode) {
    throw new Error("create patient: canonical id was replaced by patientCode");
  }
  state.patientId = patient.id;
  const createKey = requestIdempotencyKey(createResponse, "create patient");
  const createReplay = await apiRequest(
    apiOrigin,
    account.token,
    "/portal/patients",
    {
      method: "POST",
      body: expected,
      idempotencyKey: createKey,
    },
  );
  if (createReplay.status !== 201) {
    throw new Error(
      `create replay: expected HTTP 201, got ${createReplay.status}`,
    );
  }
  assertPatientReceipt(
    createReplay.payload,
    { ...expected, id: patient.id },
    "create replay",
    true,
  );

  await page.goto(
    `${page.url().split("/portal/")[0]}/portal/patients/${encodeURIComponent(patient.id)}`,
  );
  await page.waitForSelector("#patient-save-profile", { timeout: 20_000 });
  const updatePayload = {
    ...expected,
    phone: "0922222222",
    address: "88 Le Loi, District 3",
    allergies: [...expected.allergies, "shellfish"],
    notes: "Browser-confirmed updated patient profile",
  };
  await page.locator("#patient-phone").fill(updatePayload.phone);
  await page.locator("#patient-address").fill(updatePayload.address);
  await page
    .locator("#patient-allergies")
    .fill(updatePayload.allergies.join(", "));
  await page.locator("#patient-notes").fill(updatePayload.notes);
  const updateResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/portal/patients/${encodeURIComponent(patient.id)}` &&
      response.request().method() === "PATCH",
    { timeout: 30_000 },
  );
  await page.locator("#patient-save-profile").click();
  const updateResponse = await updateResponsePromise;
  const updateResponsePayload = await readJson(
    updateResponse,
    "update patient",
  );
  assertPatientReceipt(
    updateResponsePayload,
    { ...updatePayload, id: patient.id },
    "update patient",
    false,
  );
  const updateKey = requestIdempotencyKey(updateResponse, "update patient");
  if (updateKey === createKey)
    throw new Error("update reused the create idempotency key");
  const updateReplay = await apiRequest(
    apiOrigin,
    account.token,
    `/portal/patients/${encodeURIComponent(patient.id)}`,
    { method: "PATCH", body: updatePayload, idempotencyKey: updateKey },
  );
  assertPatientReceipt(
    updateReplay.payload,
    { ...updatePayload, id: patient.id },
    "update replay",
    true,
  );

  await page.locator("#patient-delete").click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.waitFor({ state: "visible", timeout: 10_000 });
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/portal/patients/${encodeURIComponent(patient.id)}` &&
      response.request().method() === "DELETE",
    { timeout: 30_000 },
  );
  await confirmation.getByRole("button", { name: "Xóa hồ sơ" }).click();
  const deleteResponse = await deleteResponsePromise;
  const deletePayload = await readJson(deleteResponse, "delete patient");
  if (
    deletePayload?.deleted !== true ||
    deletePayload?.patientId !== patient.id ||
    deletePayload?.replayed !== false
  ) {
    throw new Error(
      "delete patient: backend did not confirm the exact canonical id",
    );
  }
  const deleteKey = requestIdempotencyKey(deleteResponse, "delete patient");
  if ([createKey, updateKey].includes(deleteKey)) {
    throw new Error("delete reused an earlier mutation idempotency key");
  }
  const deleteReplay = await apiRequest(
    apiOrigin,
    account.token,
    `/portal/patients/${encodeURIComponent(patient.id)}`,
    { method: "DELETE", idempotencyKey: deleteKey },
  );
  if (
    deleteReplay.status !== 200 ||
    deleteReplay.payload?.deleted !== true ||
    deleteReplay.payload?.patientId !== patient.id ||
    deleteReplay.payload?.replayed !== true
  ) {
    throw new Error(
      "delete replay: backend did not return the canonical replay receipt",
    );
  }
  const afterDelete = await apiRequest(
    apiOrigin,
    account.token,
    `/portal/patients/${encodeURIComponent(patient.id)}`,
  );
  if (afterDelete.status !== 404) {
    throw new Error(
      `delete patient: expected follow-up HTTP 404, got ${afterDelete.status}`,
    );
  }
  state.patientId = "";
}

async function exercisePatientImport(page, apiOrigin, account, state) {
  const csv = [
    "name,patientCode,dateOfBirth,gender,phone,email,bloodType,allergies",
    `Browser Import One,IMPORT-${account.suffix}-01,1990-01-02,Nam,0903111222,import-one-${account.suffix}@smarthealth.test,O+,bụi`,
    `Browser Import Two,IMPORT-${account.suffix}-02,1991-02-03,Nữ,0903111333,import-two-${account.suffix}@smarthealth.test,A+,`,
  ].join("\n");
  await page.locator("#patient-import-file").setInputFiles({
    name: "browser-patients.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  const validationResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        "/api/portal/patients/import/validate" &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.locator('[data-testid="patient-import-validate"]').click();
  const validationResponse = await validationResponsePromise;
  const validationPayload = await readJson(
    validationResponse,
    "validate patient import",
  );
  if (
    validationResponse.status() !== 201 ||
    validationPayload?.batch?.status !== "validated" ||
    validationPayload?.batch?.rowCount !== 2 ||
    validationPayload?.batch?.validCount !== 2 ||
    validationPayload?.replayed !== false
  ) {
    throw new Error("validate patient import: batch receipt is not exact");
  }
  const batchId = validationPayload.batch.id;
  const reservedIds = validationPayload.batch.rows.map(
    (row) => row?.patient?.id,
  );
  if (
    !batchId ||
    reservedIds.some((id) => !id) ||
    new Set(reservedIds).size !== reservedIds.length
  ) {
    throw new Error("validate patient import: canonical row identities are invalid");
  }
  const validationKey = requestIdempotencyKey(
    validationResponse,
    "validate patient import",
  );
  const validationReplay = await apiRequest(
    apiOrigin,
    account.token,
    "/portal/patients/import/validate",
    {
      method: "POST",
      rawBody: Buffer.from(csv, "utf8"),
      contentType: "text/csv; charset=utf-8",
      fileName: "browser-patients.csv",
      idempotencyKey: validationKey,
    },
  );
  if (
    validationReplay.status !== 201 ||
    validationReplay.payload?.batch?.id !== batchId ||
    validationReplay.payload?.replayed !== true
  ) {
    throw new Error("validate patient import replay did not return one batch");
  }

  await page.locator('[data-testid="patient-import-commit"]').click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.waitFor({ state: "visible", timeout: 10_000 });
  const commitResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/portal/patients/import/${encodeURIComponent(batchId)}/commit` &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await confirmation.getByRole("button", { name: "Xác nhận import" }).click();
  const commitResponse = await commitResponsePromise;
  const commitPayload = await readJson(commitResponse, "commit patient import");
  if (
    commitResponse.status() !== 201 ||
    commitPayload?.batch?.id !== batchId ||
    commitPayload?.batch?.status !== "committed" ||
    commitPayload?.importedCount !== 2 ||
    commitPayload?.replayed !== false ||
    JSON.stringify(commitPayload?.patientIds) !== JSON.stringify(reservedIds)
  ) {
    throw new Error("commit patient import: atomic receipt is not exact");
  }
  state.importedPatientIds = [...reservedIds];
  const commitKey = requestIdempotencyKey(
    commitResponse,
    "commit patient import",
  );
  const commitReplay = await apiRequest(
    apiOrigin,
    account.token,
    `/portal/patients/import/${encodeURIComponent(batchId)}/commit`,
    { method: "POST", idempotencyKey: commitKey },
  );
  if (
    commitReplay.status !== 201 ||
    commitReplay.payload?.replayed !== true ||
    JSON.stringify(commitReplay.payload?.patientIds) !== JSON.stringify(reservedIds)
  ) {
    throw new Error("commit patient import replay did not return one outcome");
  }
  await page.getByText("Import hoàn tất", { exact: true }).waitFor({
    state: "visible",
    timeout: 10_000,
  });

  for (const patientId of reservedIds) {
    const cleanup = await apiRequest(
      apiOrigin,
      account.token,
      `/portal/patients/${encodeURIComponent(patientId)}`,
      {
        method: "DELETE",
        idempotencyKey: `portal-import-cleanup-${patientId}`,
      },
    );
    if (
      cleanup.status !== 200 ||
      cleanup.payload?.deleted !== true ||
      cleanup.payload?.patientId !== patientId
    ) {
      throw new Error(`patient import cleanup failed for ${patientId}`);
    }
  }
  state.importedPatientIds = [];
}

async function runBrowser(siteOrigin, apiOrigin, account, state) {
  const browser = await chromium.launch({ headless: true });
  let mutationVerified = false;
  try {
    for (const viewport of viewports) {
      for (const theme of themes) {
        const context = await browser.newContext({
          viewport,
          colorScheme: theme.colorScheme,
          reducedMotion: "reduce",
          locale: "vi-VN",
        });
        await context.addInitScript(
          ({ token, preference }) => {
            window.localStorage.setItem("smart_health_token", token);
            window.localStorage.setItem("shcare-theme", preference);
          },
          { token: account.token, preference: theme.preference },
        );
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
              `${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`,
            );
          }
        });
        page.on("response", (response) => {
          const resourceType = response.request().resourceType();
          if (
            response.status() >= 400 &&
            [
              "document",
              "stylesheet",
              "script",
              "font",
              "image",
              "fetch",
              "xhr",
            ].includes(resourceType)
          ) {
            responseErrors.push(
              `${response.status()} ${response.request().method()} ${response.url()}`,
            );
          }
        });

        await page.goto(`${siteOrigin}/portal/patients`, {
          waitUntil: "domcontentloaded",
        });
        await inspectPortalSurface(
          page,
          viewport,
          theme,
          runtimeErrors,
          responseErrors,
          {
            label: "patients",
            readySelector: "#portal-patient-search",
            secondarySelector: "#portal-add-patient",
          },
        );
        if (!mutationVerified) {
          await exercisePatientMutation(page, apiOrigin, account, state);
        }
        await page.goto(`${siteOrigin}/portal/patients/import`, {
          waitUntil: "domcontentloaded",
        });
        await inspectPortalSurface(
          page,
          viewport,
          theme,
          runtimeErrors,
          responseErrors,
          {
            label: "patient-import",
            readySelector: '[data-testid="patient-import-page"]',
            secondarySelector: "#patient-import-file",
          },
        );
        if (!mutationVerified) {
          await exercisePatientImport(page, apiOrigin, account, state);
          mutationVerified = true;
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (!mutationVerified) throw new Error("patient mutation was not exercised");
}

async function main() {
  if (!fs.existsSync(backendEntry) || !fs.existsSync(viteEntry)) {
    throw new Error("Portal Web or backend canonical entrypoint is missing");
  }
  const [backendPort, sitePort, audioPort] = await Promise.all([
    getFreePort(),
    getFreePort(),
    getFreePort(),
  ]);
  const backendOrigin = `http://127.0.0.1:${backendPort}`;
  const siteOrigin = `http://127.0.0.1:${sitePort}`;
  const fixture = seedWorkspaceAdminFixture();
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
  const account = await loginWorkspaceAdmin(backendOrigin, fixture);
  const identity = await apiRequest(backendOrigin, account.token, "/me");
  if (
    identity.status !== 200 ||
    !identity.payload?.user?.allowedSurfaces?.includes("portal")
  ) {
    throw new Error(
      `registered workspace admin does not have Portal access: HTTP ${identity.status} ${JSON.stringify(identity.payload)}`,
    );
  }
  startNode(
    "Portal Vite",
    [
      viteEntry,
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(sitePort),
      "--strictPort",
    ],
    {
      cwd: webRoot,
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
  await waitForUrl(`${siteOrigin}/portal/patients`, "Portal Vite");
  const state = { patientId: "", importedPatientIds: [] };
  try {
    await runBrowser(siteOrigin, backendOrigin, account, state);
  } finally {
    if (state.patientId) {
      await apiRequest(
        backendOrigin,
        account.token,
        `/portal/patients/${encodeURIComponent(state.patientId)}`,
        {
          method: "DELETE",
          idempotencyKey: `portal-patient-cleanup-${account.suffix}`,
        },
      ).catch(() => undefined);
    }
    for (const patientId of state.importedPatientIds) {
      await apiRequest(
        backendOrigin,
        account.token,
        `/portal/patients/${encodeURIComponent(patientId)}`,
        {
          method: "DELETE",
          idempotencyKey: `portal-import-final-cleanup-${patientId}`,
        },
      ).catch(() => undefined);
    }
  }
  if (failures.length) {
    throw new Error(
      `Portal Patients browser smoke failed:\n- ${failures.join("\n- ")}`,
    );
  }
  console.log(
    `Portal Patients browser smoke passed: ${checks} Patients/Import viewport-theme checks plus exact canonical CRUD, atomic import validation/commit, idempotency replay and temporary-data cleanup.`,
  );
}

try {
  await main();
} catch (error) {
  console.error("Portal Patients browser smoke failed:");
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
