import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const portalLayout = readFileSync(
  new URL("../../src/app/layouts/PortalLayout.tsx", import.meta.url),
  "utf8",
);

test("gates the avatar audit link with the canonical route capability contract", () => {
  const auditLink = 'to={routePath("portal.audit")}';
  const auditLinkIndex = portalLayout.indexOf(auditLink);

  assert.notEqual(auditLinkIndex, -1, "avatar menu must use the canonical audit route");

  const capabilityGate = portalLayout.slice(
    Math.max(0, auditLinkIndex - 400),
    auditLinkIndex,
  );
  assert.match(capabilityGate, /canAccessRoute\(\s*user\.capabilities,/);
  assert.match(capabilityGate, /routePath\("portal\.audit"\)/);
  assert.doesNotMatch(portalLayout, /to="\/portal\/audit"/);
});

test("gates auxiliary portal queries and account navigation with route capabilities", () => {
  assert.match(
    portalLayout,
    /routePath\("portal\.notifications"\)/,
  );
  assert.match(
    portalLayout,
    /enabled: Boolean\(user && canViewNotifications\)/,
  );
  assert.match(
    portalLayout,
    /canAccessRoute\(user\.capabilities, routePath\("portal\.settings"\)\)/,
  );
  assert.match(
    portalLayout,
    /canAccessRoute\(user\.capabilities, routePath\("portal\.workspace"\)\)/,
  );
  assert.match(portalLayout, /\{canViewNotifications \? \(/);
  assert.match(portalLayout, /\{canManageAccount \? \(/);
  assert.match(portalLayout, /\{canSwitchWorkspace \? \(/);
  assert.doesNotMatch(portalLayout, /to="\/portal\/settings"/);
  assert.doesNotMatch(portalLayout, /to="\/portal\/workspace"/);
  assert.doesNotMatch(portalLayout, /to="\/portal\/notifications"/);
});
