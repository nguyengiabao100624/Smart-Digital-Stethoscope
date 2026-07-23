import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL(
  "../../src/app/pages/portal/StaffPage.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("Portal staff page uses native brand primitives instead of demo CSS", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /Card/);
  assert.match(source, /Button/);
  assert.match(source, /Dialog/);
  assert.doesNotMatch(
    source,
    /glass-panel|premium-button|hero-gradient-text|portal-input/,
  );
});

test("Portal staff page replaces direct account creation with invitation lifecycle", async () => {
  const [source, apiSource] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(source, /createStaffInvitation/);
  assert.match(source, /resendStaffInvitation/);
  assert.match(source, /revokeStaffInvitation/);
  assert.match(source, /parsePortalStaffInvitationOutcome/);
  assert.match(source, /Mời nhân sự/);
  assert.doesNotMatch(source, /createStaff\(|Đã tạo hồ sơ bác sĩ|Tạo hồ sơ/);
  assert.doesNotMatch(apiSource, /createStaff:\s*/);
  assert.match(apiSource, /\/admin\/staff-invitations/);
});

test("Portal staff page exposes real role, delivery, retry and one-time link states", async () => {
  const source = await readFile(pagePath, "utf8");

  for (const role of [
    "workspace_admin",
    "doctor",
    "nurse",
    "technician",
    "billing",
    "viewer",
  ]) {
    assert.match(source, new RegExp(`value=["']${role}["']`));
  }
  assert.match(source, /oneTimeAcceptance|manualAcceptance/);
  assert.match(source, /Provider đã xác nhận gửi/);
  assert.match(source, /Chưa có provider/);
  assert.match(source, /Tải lại/);
  assert.match(source, /attemptRef\.current/);
});

test("Portal staff membership mutations are exact, retry-safe, and capability scoped", async () => {
  const [source, apiSource] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(source, /workspace\.staff\.manage/);
  assert.match(source, /assertMembershipLifecycleOutcome/);
  assert.match(source, /suspendStaffMember/);
  assert.match(source, /reactivateStaffMember/);
  assert.match(source, /revokeStaffMember/);
  assert.match(apiSource, /"Idempotency-Key": idempotencyKey/);
});
