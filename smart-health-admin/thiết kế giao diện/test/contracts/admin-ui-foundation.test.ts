import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testRoot, "..", "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function sourceFiles(directory: string): string[] {
  return fs
    .readdirSync(path.join(projectRoot, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(directory.replaceAll("\\", "/"), entry.name);
      if (entry.isDirectory()) return sourceFiles(relativePath);
      return /\.(?:css|ts|tsx)$/.test(entry.name) ? [relativePath] : [];
    });
}

test("publishes a self-starting RouteContract browser sweep for every Admin route", () => {
  const smoke = read("scripts/adminUiFoundationBrowserSmokeTest.mjs");

  assert.match(smoke, /getAdminSmokeContracts/);
  assert.match(smoke, /adminRoutes\s*=\s*getAdminSmokeContracts\("admin"\)/);
  assert.match(smoke, /width:\s*360/);
  assert.match(smoke, /width:\s*390/);
  assert.match(smoke, /width:\s*768/);
  assert.match(smoke, /width:\s*1024/);
  assert.match(smoke, /width:\s*1440/);
  assert.match(smoke, /preference:\s*"light"/);
  assert.match(smoke, /preference:\s*"dark"/);
  assert.match(smoke, /preference:\s*"system"/);
  assert.match(smoke, /browserTypes\s*=\s*\{\s*chromium,\s*firefox,\s*webkit\s*\}/);
  assert.match(smoke, /readOption\("browser"\)\s*\|\|\s*"chromium"/);
  assert.match(smoke, /new AxeBuilder/);
  assert.match(smoke, /context\.setOffline\(true\)/);
  assert.match(smoke, /prefers-reduced-motion|reducedMotion:\s*"reduce"/);
  assert.match(smoke, /startNode\("Admin Vite"/);
  assert.match(smoke, /startNode\("backend"/);
});

test("locks real Account cleanup, drawer interaction and representative permission proof into the browser sweep", () => {
  const smoke = read("scripts/adminUiFoundationBrowserSmokeTest.mjs");

  assert.match(smoke, /async function proveAccountBackendContracts/);
  assert.match(smoke, /GET \/api\/me\/2fa returned an invalid/);
  assert.match(smoke, /GET \/api\/me\/notification-preferences/);
  assert.match(smoke, /patchKeys !== "enabled,key"/);
  assert.match(smoke, /patchBody\?\.key !== "doctorRequests"/);
  assert.match(smoke, /headers\(\)\["idempotency-key"\]/);
  assert.match(smoke, /cleanupReceipt/);
  assert.match(smoke, /cleanup did not restore the original backend value/);
  assert.match(smoke, /accountContractChecks \+= 1/);

  assert.match(smoke, /async function proveRepresentativeDrawer/);
  assert.match(smoke, /drawerSemantics\.modal !== "true"/);
  assert.match(smoke, /keyboard\.press\("Tab"\)/);
  assert.match(smoke, /keyboard\.press\("Shift\+Tab"\)/);
  assert.match(smoke, /keyboard\.press\("Escape"\)/);
  assert.match(smoke, /drawerInteractionChecks \+= 1/);

  assert.match(smoke, /async function proveRepresentativeRouteStates/);
  assert.match(smoke, /state === "loading"/);
  assert.match(smoke, /state === "empty"/);
  assert.match(smoke, /state = "forbidden"/);
  assert.match(smoke, /representativeStateChecks \+= 2/);
  assert.match(smoke, /async function proveLimitedDirectUrlDenial/);
  assert.match(smoke, /protectedDataRequests\.length/);
  assert.match(smoke, /Limited principal reached the protected Admin route content/);
  assert.match(smoke, /directPermissionChecks \+= 1/);
});

test("uses the Shcare brand asset and copy on Admin shell and auth surfaces", () => {
  const sources = [
    "src/lib/surface.ts",
    "src/routes/__root.tsx",
    "src/components/admin/Layout.tsx",
    "src/components/admin/Login.tsx",
    "src/components/admin/ForgotPassword.tsx",
    "src/components/admin/ShcareBrand.tsx",
  ].map(read);
  const combined = sources.join("\n");

  assert.match(combined, /shcare-symbol\.svg/);
  assert.match(combined, /Shcare Platform Admin/);
  assert.doesNotMatch(combined, /Smart Health Admin|nền tảng Smart Health|Web Admin Smart Health/);
  assert.doesNotMatch(combined, /float-soft/);
});

test("keeps Admin production UI free of demo gradients, blur glass and looping decoration", () => {
  const combined = sourceFiles("src")
    .map((relativePath) => read(relativePath))
    .join("\n");

  assert.doesNotMatch(combined, /bg-gradient|linear-gradient\s*\(/);
  assert.doesNotMatch(combined, /backdrop-blur/);
  assert.doesNotMatch(combined, /repeat:\s*Infinity|animate-ping/);
  assert.doesNotMatch(combined, /health-pulse|scan-sheen|float-soft/);
});

test("turns global search into a real navigation command palette", () => {
  const layout = read("src/components/admin/Layout.tsx");
  const palette = read("src/components/admin/AdminCommandPalette.tsx");

  assert.match(layout, /AdminCommandPalette/);
  assert.match(layout, /aria-keyshortcuts="Control\+K Meta\+K"/);
  assert.doesNotMatch(layout, /<input[\s\S]*?id="admin-global-search"/);
  assert.match(palette, /role="dialog"/);
  assert.match(palette, /aria-modal="true"/);
  assert.match(palette, /visibleMenuItems|items/);
  assert.match(palette, /onNavigate/);
  assert.match(palette, /Không tìm thấy màn hình phù hợp/);
});

test("marks top-bar notifications read only after backend confirmation", () => {
  const layout = read("src/components/admin/Layout.tsx");
  const functionSource =
    layout.match(
      /const openTopNotification = async \(item: NotificationItem\) => \{[\s\S]*?\n[ ]{2}\};/,
    )?.[0] || "";

  assert.match(functionSource, /await smartHealthApi\.markNotificationRead/);
  assert.ok(
    functionSource.indexOf("await smartHealthApi.markNotificationRead") <
      functionSource.indexOf("setTopNotifications"),
    "local read state must follow the backend acknowledgement",
  );
  assert.match(functionSource, /catch/);
  assert.match(functionSource, /setTopNotificationError/);
});
