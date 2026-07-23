import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessRoute,
  getNavigationContracts,
  matchRouteContract,
  routeChildPath,
  routeContracts,
  routePath,
} from "../../src/app/contracts/route-contract.ts";

test("publishes one complete, unique route contract", () => {
  assert.ok(routeContracts.length >= 60);
  assert.equal(
    new Set(routeContracts.map((route) => route.id)).size,
    routeContracts.length,
  );
  assert.equal(
    new Set(routeContracts.map((route) => route.path)).size,
    routeContracts.length,
  );
  assert.equal(
    new Set(routeContracts.map((route) => route.smokeId)).size,
    routeContracts.length,
  );

  for (const contract of routeContracts) {
    assert.ok(
      contract.stateCoverage.length > 0,
      `${contract.id} needs state coverage`,
    );
    assert.equal(contract.smokeId.includes("mock"), false);
    if (
      contract.surface === "portal" &&
      contract.id !== "portal.permission-denied"
    ) {
      assert.ok(contract.stateCoverage.includes("permission_denied"));
    }
  }
});

test("matches static portal routes before dynamic detail routes", () => {
  assert.equal(
    matchRouteContract("/staff-invitations/accept?token=secret")?.id,
    "auth.staff-invitation.accept",
  );
  assert.equal(
    matchRouteContract("/portal/patients/import")?.id,
    "portal.patients.import",
  );
  assert.equal(
    matchRouteContract("/portal/patients/patient-123")?.id,
    "portal.patients.detail",
  );
  assert.equal(
    matchRouteContract("/portal/records/review")?.id,
    "portal.records.review",
  );
  assert.equal(
    matchRouteContract("/portal/records/scan-123?source=notification")?.id,
    "portal.records.detail",
  );
  assert.equal(
    matchRouteContract("/does-not-exist")?.id,
    "public.not-found.catch-all",
  );
});

test("uses backend capabilities for direct URLs and navigation", () => {
  const patientViewer = ["workspace.patients.view"];
  const patientManager = ["workspace.patients.manage"];

  assert.equal(
    canAccessRoute(patientViewer, "/portal/patients/patient-123"),
    true,
  );
  assert.equal(canAccessRoute(patientViewer, "/portal/patients/import"), false);
  assert.equal(canAccessRoute(patientManager, "/portal/patients/import"), true);

  const viewerNavigation = getNavigationContracts(patientViewer, "primary");
  assert.equal(
    viewerNavigation.some((route) => route.id === "portal.patients"),
    true,
  );
  assert.equal(
    viewerNavigation.some((route) => route.id === "portal.staff"),
    false,
  );
});

test("exposes canonical absolute and nested-router paths", () => {
  assert.equal(
    routePath("auth.staff-invitation.accept"),
    "/staff-invitations/accept",
  );
  assert.equal(routePath("public.security"), "/bao-mat");
  assert.equal(routeChildPath("public.security"), "bao-mat");
  assert.equal(routePath("portal.records.review"), "/portal/records/review");
  assert.equal(routeChildPath("portal.records.review"), "records/review");
  assert.equal(routeChildPath("portal.root"), undefined);
});
