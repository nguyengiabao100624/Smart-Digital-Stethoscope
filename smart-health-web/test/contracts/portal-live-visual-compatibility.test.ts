import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../..", import.meta.url));

async function source(relativePath: string) {
  return readFile(path.join(webRoot, relativePath), "utf8");
}

test("Portal keeps the deployed visual identity while retaining route authority", async () => {
  const layout = await source("src/app/layouts/PortalLayout.tsx");

  assert.match(layout, /shcare-horizontal\.svg/);
  assert.match(layout, /data-shcare-portal-visual="live-legacy"/);
  assert.match(layout, /aria-label="Về Shcare — Smart Health Care"/);
  assert.match(layout, />Shcare<\/span>/);
  assert.match(layout, /navigationForCapabilities\(user\.capabilities, "primary"\)/);
  assert.match(layout, /canAccessPortalRoute\(user, location\.pathname\)/);
  assert.match(layout, /canSwitchWorkspace/);
  assert.match(layout, /canViewNotifications/);
  assert.match(
    layout,
    /className="flex min-w-0 flex-1 items-center gap-2"/,
  );
});

test("Portal exposes theme selection in the account menu without covering mobile content", async () => {
  const layout = await source("src/app/layouts/PortalLayout.tsx");
  const toggle = await source("src/components/ThemeToggle.tsx");
  const css = await source("src/web-styles/clinical-polish.css");
  const themeCss = await source("src/web-styles/theme.css");

  assert.match(layout, /<ThemeToggle variant="menu"\s*\/>/);
  assert.match(toggle, /variant\s*=\s*"floating"/);
  assert.match(toggle, /data-theme-variant=\{variant\}/);
  assert.match(toggle, /SHCARE_THEME_CHANGE_EVENT/);
  assert.match(
    css,
    /body:has\(\.clinical-portal\)\s+\.theme-toggle\[data-theme-variant="floating"\]\s*\{[^}]*display:\s*none/,
  );
  assert.match(
    css,
    /\.clinical-popover-menu\s+\.clinical-theme-action\s*\{[^}]*min-height:\s*2\.75rem/,
  );
  assert.match(
    themeCss,
    /\.theme-toggle\[data-theme-variant="floating"\]\s*\{[^}]*box-shadow:/,
  );
  assert.doesNotMatch(themeCss, /\n\.theme-toggle\s*\{[^}]*box-shadow:/);
});

test("Portal keeps the compact backend status dot visible", async () => {
  const css = await source("src/web-styles/clinical-polish.css");

  assert.doesNotMatch(
    css,
    /\.clinical-portal\s+\.clinical-backend-status\s+span\s*,/,
  );
  assert.match(
    css,
    /\.clinical-portal\s+\.clinical-backend-status\s*>\s*span:not\(\.clinical-backend-dot\)/,
  );
});

test("Portal browser QA covers the full responsive and theme matrix", async () => {
  const smoke = await source("scripts/portalUiFoundationBrowserSmokeTest.mjs");

  for (const width of [360, 390, 768, 1024, 1440]) {
    assert.match(smoke, new RegExp(`width:\\s*${width}\\b`));
  }
  for (const preference of ["light", "dark", "system"]) {
    assert.match(smoke, new RegExp(`preference:\\s*"${preference}"`));
  }
  assert.match(smoke, /readFilter\("viewport"\)/);
  assert.match(smoke, /readFilter\("theme"\)/);
  assert.match(smoke, /selectedViewports\.flatMap/);
});

test("Dashboard maps the new data and state contract into the live visual composition", async () => {
  const dashboard = await source("src/app/pages/portal/DashboardPage.tsx");

  assert.match(dashboard, /className="portal-live-dashboard space-y-5"/);
  assert.match(dashboard, /dashboard-metric-patients/);
  assert.match(dashboard, /dashboard-metric-scans/);
  assert.match(dashboard, /dashboard-metric-failed/);
  assert.match(dashboard, /dashboard-metric-devices/);
  assert.match(dashboard, /organizationId:\s*workspaceId/);
  assert.match(dashboard, /outsideWorkspace/);
  assert.match(dashboard, /PortalLoading/);
  assert.match(dashboard, /PortalError/);
  assert.match(dashboard, /PortalEmpty/);
  assert.match(dashboard, /navigator\.onLine/);
  assert.doesNotMatch(
    dashboard,
    /glass-panel|hero-gradient-text|brand-gradient-text|premium-button/,
  );
});

test("Portal adapter follows the Admin FE language without glass or gradient debt", async () => {
  const css = await source("src/web-styles/clinical-polish.css");
  const start = css.indexOf("/* Portal live visual compatibility");
  const end = css.indexOf("/*", start + 10);
  const adapter = css.slice(start, end === -1 ? css.length : end);

  assert.ok(start >= 0, "Portal live visual adapter is missing");
  assert.match(adapter, /data-shcare-portal-visual="live-legacy"/);
  assert.match(adapter, /--portal-admin-primary:\s*#0b5c9a/);
  assert.match(adapter, /--portal-admin-accent:\s*#00a896/);
  assert.match(adapter, /--clinical-canvas:\s*#f5f7fa/);
  assert.match(adapter, /--clinical-surface:\s*#ffffff/);
  assert.match(adapter, /--clinical-line:\s*#e2e8f0/);
  assert.match(adapter, /--clinical-muted:\s*#52677a/);
  assert.match(adapter, /background:\s*var\(--clinical-canvas\)/);
  assert.match(adapter, /background:\s*var\(--clinical-surface\)/);
  assert.match(adapter, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(adapter, /var\(--signal-/);
  assert.doesNotMatch(adapter, /backdrop-filter/);
  assert.doesNotMatch(adapter, /linear-gradient/);
  assert.doesNotMatch(adapter, /!\s*important/);
});
