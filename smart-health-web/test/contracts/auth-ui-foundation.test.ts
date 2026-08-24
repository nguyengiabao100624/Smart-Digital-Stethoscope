import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { routeContracts } from "../../src/app/contracts/route-contract.ts";

const webRoot = new URL("../../", import.meta.url);
const layoutSource = readFileSync(
  new URL("src/app/layouts/AuthLayout.tsx", webRoot),
  "utf8",
);
const routesSource = readFileSync(
  new URL("src/app/routes.tsx", webRoot),
  "utf8",
);
const approvalSource = readFileSync(
  new URL("src/app/pages/auth/ApprovalPendingPage.tsx", webRoot),
  "utf8",
);
const verificationSource = readFileSync(
  new URL("src/app/pages/auth/EmailVerificationPage.tsx", webRoot),
  "utf8",
);
const clinicalPolishSource = readFileSync(
  new URL("src/web-styles/clinical-polish.css", webRoot),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(new URL("package.json", webRoot), "utf8"),
) as { scripts?: Record<string, string> };
const authPageDirectory = new URL("src/app/pages/auth/", webRoot);
const authPageSources = readdirSync(authPageDirectory)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => ({
    name,
    source: readFileSync(new URL(name, authPageDirectory), "utf8"),
  }));

test("publishes a self-starting RouteContract browser sweep for every Auth route", () => {
  const smokeSource = readFileSync(
    new URL("scripts/authBrowserSmokeTest.mjs", webRoot),
    "utf8",
  );
  const authRoutes = routeContracts.filter((route) => route.surface === "auth");

  assert.equal(authRoutes.length, 15);
  assert.equal(
    packageJson.scripts?.["smoke:auth-browser"],
    "node scripts/authBrowserSmokeTest.mjs",
  );
  assert.match(smokeSource, /import\s+\{\s*routeContracts\s*\}/);
  assert.match(smokeSource, /route\.surface\s*===\s*"auth"/);
  assert.match(smokeSource, /startVite/);
  assert.match(smokeSource, /VITE_SMART_HEALTH_API_BASE_URL/);
  assert.match(smokeSource, /setOffline\(true\)/);
  for (const width of [360, 390, 768, 1024, 1440]) {
    assert.match(smokeSource, new RegExp(`width:\\s*${width}\\b`));
  }
  for (const preference of ["light", "dark", "system"]) {
    assert.match(smokeSource, new RegExp(`preference:\\s*"${preference}"`));
  }
});

test("routes password-reset confirmation to a dedicated action-code screen", () => {
  assert.match(
    routesSource,
    /routeChildPath\("auth\.reset-password"\)[\s\S]*?ResetPasswordPage/,
  );
  assert.doesNotMatch(
    routesSource,
    /routeChildPath\("auth\.reset-password"\)[\s\S]{0,180}?ForgotPasswordPage/,
  );
});

test("makes Auth offline and anonymous approval states explicit", () => {
  for (const route of routeContracts.filter(
    (candidate) => candidate.surface === "auth",
  )) {
    assert.ok(
      route.stateCoverage.includes("offline"),
      `${route.id} is missing offline coverage`,
    );
  }

  assert.match(
    layoutSource,
    /data-shcare-auth-foundation="legacy-enhanced-v1"/,
  );
  assert.match(layoutSource, /data-shcare-auth-visual="live-legacy"/);
  assert.match(layoutSource, /docs\/Logo\.png/);
  assert.match(layoutSource, /className="app-shell auth-shell shc-auth-layout"/);
  assert.match(layoutSource, /navigator\.onLine/);
  assert.match(layoutSource, /addEventListener\("offline"/);
  assert.match(layoutSource, /Bạn đang ngoại tuyến/);
  assert.match(approvalSource, /\bisLoading\b/);
  assert.match(approvalSource, /Đăng nhập để xem trạng thái hồ sơ/);
});

test("keeps Auth production markup free of retired demo styling and provider leakage", () => {
  const retired =
    /glass-panel|premium-button|premium-card|brand-gradient-text|hero-gradient-text|vietnamese-gradient-text|medical-grid|blur-3xl|bg-gradient|radial-gradient|linear-gradient|backdropFilter|WebkitBackdropFilter|boxShadow|drop-shadow|#(?:00FFD1|0B5C9A|4AA4E0|7257E8)/i;

  assert.doesNotMatch(layoutSource, retired);
  for (const page of authPageSources) {
    assert.doesNotMatch(page.source, retired, page.name);
  }
  assert.doesNotMatch(
    verificationSource,
    /delivery\.provider|qua \$\{delivery\.provider\}/,
  );
});

test("uses bounded native Web motion and authoritative reduced-motion handling", () => {
  assert.match(layoutSource, /useReducedMotion/);
  assert.match(layoutSource, /opacity:\s*0,\s*y:\s*10/);
  assert.match(layoutSource, /duration:\s*reduceMotion\s*\?\s*0\s*:\s*0\.2/);
  assert.doesNotMatch(
    layoutSource,
    /backdropFilter|WebkitBackdropFilter|repeat:\s*Infinity/,
  );
});

test("keeps the live Auth mobile header blur-free at every breakpoint", () => {
  assert.match(
    clinicalPolishSource,
    /data-shcare-auth-visual="live-legacy"\]\s+\.shc-auth-mobile-top\s*\{[^}]*backdrop-filter:\s*none;[^}]*-webkit-backdrop-filter:\s*none;/,
  );
});
