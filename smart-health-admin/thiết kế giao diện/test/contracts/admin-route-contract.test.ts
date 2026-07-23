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
