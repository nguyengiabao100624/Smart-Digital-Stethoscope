const DEFAULT_BACKEND_URL = "https://smart-health-api-xj0a.onrender.com";
const DEFAULT_ADMIN_URL = "https://shcare-admin.web.app";
const DEFAULT_PORTAL_URL = "https://shcare.web.app";
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || process.env.SMOKE_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": "smart-health-public-smoke/1.0",
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function expectJsonOk(name, url, validate) {
  const response = await fetchWithTimeout(url);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${name} returned non-JSON response: ${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(`${name} returned HTTP ${response.status}: ${text.slice(0, 160)}`);
  }
  if (validate && !validate(data)) {
    throw new Error(`${name} returned unexpected JSON: ${JSON.stringify(data).slice(0, 240)}`);
  }
  return { status: response.status, data };
}

async function expectStatus(name, url, expectedStatuses, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${name} returned HTTP ${response.status}, expected ${expectedStatuses.join("/")}: ${text.slice(0, 160)}`);
  }
  return { status: response.status, text };
}

async function main() {
  const backendUrl = normalizeUrl(process.env.SMOKE_BACKEND_URL || process.env.PUBLIC_BACKEND_URL || DEFAULT_BACKEND_URL);
  const adminUrl = normalizeUrl(process.env.SMOKE_ADMIN_URL || DEFAULT_ADMIN_URL);
  const portalUrl = normalizeUrl(process.env.SMOKE_PORTAL_URL || DEFAULT_PORTAL_URL);
  const results = [];

  const health = await expectJsonOk(
    "Backend health",
    `${backendUrl}/api/health`,
    (data) => data && data.ok === true && data.service === "smart-health-backend",
  );
  results.push(`PASS backend health HTTP ${health.status}`);

  const me = await expectStatus("Unauthenticated /api/me", `${backendUrl}/api/me`, [401]);
  results.push(`PASS unauthenticated /api/me rejected with HTTP ${me.status}`);

  const login = await expectStatus("Web Admin /login", `${adminUrl}/login`, [200]);
  if (!/Smart Health|root|id="root"/i.test(login.text)) {
    throw new Error("Web Admin /login did not look like the Smart Health SPA shell.");
  }
  results.push(`PASS web admin /login HTTP ${login.status}`);

  const adminActions = await expectStatus("Web Admin /admin-actions rewrite", `${adminUrl}/admin-actions`, [200]);
  if (!/Smart Health|root|id="root"/i.test(adminActions.text)) {
    throw new Error("Web Admin /admin-actions did not return the SPA shell.");
  }
  results.push(`PASS web admin /admin-actions rewrite HTTP ${adminActions.status}`);

  const portalLogin = await expectStatus("Shcare Portal /login", `${portalUrl}/login`, [200]);
  if (!/Shcare|Smart Health|root|id="root"/i.test(portalLogin.text)) {
    throw new Error("Shcare Portal /login did not look like the Smart Health SPA shell.");
  }
  results.push(`PASS shcare portal /login HTTP ${portalLogin.status}`);

  const portalPatients = await expectStatus("Shcare Portal /portal/patients rewrite", `${portalUrl}/portal/patients`, [200]);
  if (!/Shcare|Smart Health|root|id="root"/i.test(portalPatients.text)) {
    throw new Error("Shcare Portal /portal/patients did not return the SPA shell.");
  }
  results.push(`PASS shcare portal /portal/patients rewrite HTTP ${portalPatients.status}`);

  console.log("Smart Health public deployment smoke: PASS");
  console.log(`Backend: ${backendUrl}`);
  console.log(`Web Admin: ${adminUrl}`);
  console.log(`Shcare Portal: ${portalUrl}`);
  for (const line of results) {
    console.log(`- ${line}`);
  }
}

main().catch((error) => {
  console.error("Smart Health public deployment smoke: FAIL");
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
