import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const page = fs.readFileSync(path.join(root, "src/app/pages/portal/StaffPage.tsx"), "utf8");
const api = fs.readFileSync(path.join(root, "src/lib/smart-health-api.ts"), "utf8");
const operations = fs.readFileSync(path.join(root, "src/lib/staff-invitation-operations.ts"), "utf8");
const backend = fs.readFileSync(
  path.resolve(root, "../smart-health-embedded/web-monitor/server.js"),
  "utf8",
);

test("workspace role editor is tenant-scoped and separate from Platform Admin", () => {
  assert.match(page, /Điều chỉnh quyền workspace/);
  assert.match(page, /changeStaffMemberRole/);
  assert.match(page, /member\.workspaceMembership\?\.role/);
  assert.match(api, /\/portal\/staff\/\$\{encodeURIComponent\(userId\)\}\/role/);
  assert.match(api, /WorkspaceMembershipRoleChangeResponse/);
  assert.match(operations, /\| "member-role"/);
  assert.match(backend, /rawAction === "role"\) action = "change_role"/);
  assert.match(backend, /MEMBERSHIP_ROLE_SELF_CHANGE_DENIED/);
  assert.match(backend, /MEMBERSHIP_ROLE_INVALID/);
});
