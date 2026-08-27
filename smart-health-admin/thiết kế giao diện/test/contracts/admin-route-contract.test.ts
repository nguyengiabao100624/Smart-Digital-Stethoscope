import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_ROUTE_STATE_REQUIREMENTS,
  adminRouteContracts,
  findAdminRouteContract,
  getAdminNavigationContracts,
  getAdminSmokeContracts,
  type AdminWebSurface,
} from "../../src/contracts/admin-route-contract.ts";
import { userHasAnyCapability } from "../../src/components/admin/admin-access-context.ts";
import type { SmartHealthAuthUser } from "../../src/lib/smart-health-api.ts";

const surfaces: AdminWebSurface[] = ["admin", "portal"];

test("declares a unique typed contract for every surface and path", () => {
  const keys = adminRouteContracts.map((contract) => `${contract.surface}:${contract.path}`);
  const smokeIds = adminRouteContracts.map((contract) => contract.smokeId);

  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(smokeIds).size, smokeIds.length);
  assert.ok(adminRouteContracts.every((contract) => contract.requiredCapabilities.length > 0));
  assert.ok(
    adminRouteContracts.every((contract) =>
      ADMIN_ROUTE_STATE_REQUIREMENTS.every((state) => contract.stateCoverage.includes(state)),
    ),
  );
});

test("resolves direct URLs independently from whether a route appears in navigation", () => {
  const account = findAdminRouteContract("admin", "/account");
  const accountChild = findAdminRouteContract("admin", "/account/security");

  assert.equal(account?.id, "admin.account");
  assert.equal(account?.nav, null);
  assert.equal(accountChild?.id, "admin.account");
  assert.equal(findAdminRouteContract("admin", "/devices-legacy"), undefined);
  assert.equal(findAdminRouteContract("portal", "/admin-accounts"), undefined);
});

test("derives ordered navigation from the same contracts and capability truth", () => {
  const patientNavigation = getAdminNavigationContracts("admin", ["platform.patients.view"]);
  const storageNavigation = getAdminNavigationContracts("admin", ["platform.storage.manage"]);
  const portalPatientNavigation = getAdminNavigationContracts("portal", [
    "workspace.patients.view",
  ]);

  assert.deepEqual(
    patientNavigation.map((contract) => contract.id),
    ["admin.patients"],
  );
  assert.ok(storageNavigation.some((contract) => contract.id === "admin.storage"));
  assert.ok(storageNavigation.some((contract) => contract.id === "admin.admin-actions"));
  assert.deepEqual(
    portalPatientNavigation.map((contract) => contract.id),
    ["portal.patients"],
  );
});

test("keeps the Storage sidebar and direct-route permission boundary aligned", () => {
  const storageCapability = "platform.storage.manage";
  const storageManager: SmartHealthAuthUser = {
    id: "storage-manager",
    role: "managed_admin",
    capabilities: [storageCapability],
  };
  const deniedAdmin: SmartHealthAuthUser = {
    id: "storage-denied",
    role: "managed_admin",
    capabilities: ["platform.dashboard.view"],
  };

  const storageNavigation = getAdminNavigationContracts("admin", storageManager.capabilities || []);
  const storageMenuItem = storageNavigation.find((contract) => contract.id === "admin.storage");
  const storageRoute = findAdminRouteContract("admin", "/storage");

  assert.equal(storageMenuItem?.nav.label, "Lưu trữ");
  assert.equal(storageMenuItem?.path, "/storage");
  assert.equal(storageRoute?.id, "admin.storage");
  assert.equal(
    userHasAnyCapability(storageManager, storageRoute?.requiredCapabilities || []),
    true,
  );

  const deniedNavigation = getAdminNavigationContracts("admin", deniedAdmin.capabilities || []);
  assert.equal(
    deniedNavigation.some((contract) => contract.id === "admin.storage"),
    false,
  );
  assert.equal(userHasAnyCapability(deniedAdmin, storageRoute?.requiredCapabilities || []), false);
});

test("keeps the platform_admin compatibility alias authorized at the Storage boundary", () => {
  const storageRoute = findAdminRouteContract("admin", "/storage");
  const platformAdmin: SmartHealthAuthUser = {
    id: "platform-admin-alias",
    role: "platform_admin",
    capabilities: [],
  };

  assert.ok(storageRoute);
  assert.equal(userHasAnyCapability(platformAdmin, storageRoute.requiredCapabilities), true);
});

test("derives the admin browser sweep from smoke-enabled route contracts", () => {
  const smokeContracts = getAdminSmokeContracts("admin");
  const smokePaths = smokeContracts.map((contract) => contract.path);

  assert.equal(smokePaths[0], "/");
  assert.ok(smokePaths.includes("/account"));
  assert.ok(smokePaths.includes("/patients"));
  assert.ok(smokePaths.includes("/storage"));
  assert.ok(smokePaths.includes("/admin-actions"));
  assert.equal(smokePaths.length, new Set(smokePaths).size);
});

test("keeps both current router surfaces represented", () => {
  for (const surface of surfaces) {
    assert.ok(findAdminRouteContract(surface, "/"));
    assert.ok(findAdminRouteContract(surface, "/account"));
    assert.ok(findAdminRouteContract(surface, "/devices"));
    assert.ok(findAdminRouteContract(surface, "/notifications"));
    assert.ok(findAdminRouteContract(surface, "/settings"));
  }
});
