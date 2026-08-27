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
  assert.match(page, /resolveAppointmentOperationAttempt/);
  assert.match(page, /parseAppointmentMutationOutcome/);
  assert.match(page, /AppointmentOperationSupersededError/);
});

test("appointment actions are capability gated, respect terminal states and soft-delete truthfully", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /workspace\.appointments\.manage/);
  assert.match(source, /platform\.appointments\.manage/);
  assert.match(source, /personal\.appointments\.manage/);
  assert.match(source, /TERMINAL_STATUSES/);
  assert.match(source, /completed/);
  assert.match(source, /no_show/);
  assert.match(source, /deleteAppointment/);
  assert.match(source, /parseAppointmentDeletionReceipt/);
  assert.match(source, /resolveAppointmentOperationAttempt/);
  assert.match(source, /data-appointment-delete/);
  assert.match(source, /Backend đã xác nhận xóa mềm lịch hẹn/);
});

test("appointment forms do not fetch the staff-management ledger without permission", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(
    source,
    /const canManageStaff = capabilities\.includes\("workspace\.staff\.manage"\)/,
  );
  assert.match(
    source,
    /enabled: Boolean\(workspaceId && canManageStaff && !workspaceChanging\)/,
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
  assert.match(source, /components\/ui\/table/);
  assert.match(source, /TableCaption/);
  assert.match(source, /md:hidden/);
  assert.match(source, /md:block/);
  assert.match(source, /data-testid="portal-appointments-page"/);
  assert.match(source, /beforeunload/);
  assert.doesNotMatch(source, /glass-panel|premium-button|hero-gradient-text/);
});
