import assert from "node:assert/strict";
import test from "node:test";

import { parsePortalStaffLedger } from "../../src/lib/staff-operations.ts";

function staffMember(
  id = "staff_1",
  workspaceId = "workspace-a",
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    role: "doctor",
    name: "BS. Nguyễn An",
    email: "doctor@example.test",
    phone: "0901234567",
    accountStatus: "active",
    roleRequestStatus: "approved",
    workspaceMembership: {
      id: `membership-${id}`,
      userId: id,
      organizationId: workspaceId,
      workspaceId,
      role: "doctor",
      status: "active",
      operational: true,
      createdAt: "2026-07-29T08:00:00.000Z",
      updatedAt: "2026-07-29T08:00:00.000Z",
    },
    ...overrides,
  };
}

function staffResponse(overrides: Record<string, unknown> = {}) {
  const member = staffMember();
  return {
    workspaceId: "workspace-a",
    generatedAt: "2026-07-29T08:01:00.000Z",
    staff: [member],
    doctors: [member],
    ...overrides,
  };
}

test("accepts only an exact workspace-bound canonical staff ledger", () => {
  const parsed = parsePortalStaffLedger(staffResponse(), "workspace-a");

  assert.equal(parsed.workspaceId, "workspace-a");
  assert.equal(parsed.staff[0].id, "staff_1");
  assert.equal(
    parsed.staff[0].workspaceMembership?.workspaceId,
    "workspace-a",
  );
  assert.equal(parsed.doctors[0].id, "staff_1");
});

test("rejects a foreign workspace at the envelope or membership boundary", () => {
  assert.throws(
    () =>
      parsePortalStaffLedger(
        staffResponse({ workspaceId: "workspace-b" }),
        "workspace-a",
      ),
    /workspace/i,
  );
  const foreign = staffMember("staff_2", "workspace-b");
  assert.throws(
    () =>
      parsePortalStaffLedger(
        staffResponse({ staff: [foreign], doctors: [] }),
        "workspace-a",
      ),
    /workspace/i,
  );
});

test("rejects duplicate identities and a doctor catalog that drifts from staff", () => {
  const member = staffMember();
  assert.throws(
    () =>
      parsePortalStaffLedger(
        staffResponse({ staff: [member, member], doctors: [member] }),
        "workspace-a",
      ),
    /trùng ID/i,
  );
  assert.throws(
    () =>
      parsePortalStaffLedger(
        staffResponse({
          doctors: [staffMember("doctor_missing_from_staff")],
        }),
        "workspace-a",
      ),
    /danh mục bác sĩ/i,
  );
});

test("rejects non-operational, unapproved, or sensitive doctor rows", () => {
  const suspended = staffMember("staff_suspended", "workspace-a", {
    workspaceMembership: {
      id: "membership-suspended",
      userId: "staff_suspended",
      organizationId: "workspace-a",
      workspaceId: "workspace-a",
      role: "doctor",
      status: "suspended",
      operational: false,
    },
  });
  assert.throws(
    () =>
      parsePortalStaffLedger(
        staffResponse({ staff: [suspended], doctors: [suspended] }),
        "workspace-a",
      ),
    /bác sĩ.*vận hành/i,
  );

  assert.throws(
    () =>
      parsePortalStaffLedger(
        staffResponse({
          staff: [
            {
              ...staffMember(),
              password: "must-never-cross-the-contract",
            },
          ],
        }),
        "workspace-a",
      ),
    /nhạy cảm/i,
  );
});
