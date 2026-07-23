import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL(
  "../../src/app/pages/portal/AppointmentsPage.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("appointment mutations use dedicated backend contracts and idempotency keys", async () => {
  const [page, api] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(api, /rescheduleAppointment/);
  assert.match(api, /cancelAppointment/);
  assert.match(api, /Idempotency-Key/);
  assert.match(page, /cancellationReason/);
  assert.match(page, /createAppointmentIntentKey/);
});

test("appointment actions are capability gated and respect terminal states", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /workspace\.appointments\.manage/);
  assert.match(source, /platform\.appointments\.manage/);
  assert.match(source, /personal\.appointments\.manage/);
  assert.match(source, /TERMINAL_STATUSES/);
  assert.match(source, /completed/);
  assert.match(source, /no_show/);
  assert.doesNotMatch(
    source,
    /deleteAppointment|data-appointment-delete|Trash2/,
  );
});

test("appointment forms do not fetch the staff-management ledger without permission", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(
    source,
    /const canManageStaff = capabilities\.includes\("workspace\.staff\.manage"\)/,
  );
  assert.match(
    source,
    /enabled: Boolean\(workspaceId && canManageStaff\)/,
  );
  assert.match(
    source,
    /mode === "create" && !canManageStaff && user\?\.role === "doctor"/,
  );
});

test("appointment page uses canonical responsive primitives instead of legacy visual classes", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /components\/ui\/button/);
  assert.match(source, /components\/ui\/dialog/);
  assert.match(source, /md:hidden/);
  assert.match(source, /hidden md:block/);
  assert.doesNotMatch(source, /glass-panel|premium-button|hero-gradient-text/);
});
