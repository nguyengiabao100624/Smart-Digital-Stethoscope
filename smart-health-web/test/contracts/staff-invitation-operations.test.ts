import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMembershipLifecycleOutcome,
  clearStaffInvitationAcceptanceIdempotencyKey,
  createPortalStaffIdempotencyKey,
  getStaffInvitationAcceptanceIdempotencyKey,
  parseStaffInvitationAcceptanceOutcome,
  parsePortalStaffInvitationList,
  parsePortalStaffInvitationOutcome,
  validateStaffInvitationToken,
} from "../../src/lib/staff-invitation-operations.ts";

test("validates canonical staff invitation outcomes without assuming email delivery", () => {
  const outcome = parsePortalStaffInvitationOutcome(
    {
      invitation: {
        id: "staff_inv_1",
        organizationId: "clinic_1",
        email: "doctor@example.com",
        role: "doctor",
        status: "pending",
      },
      delivery: { email: "unavailable" },
      oneTimeAcceptanceUrl:
        "https://portal.example/staff-invitations/accept?token=one-time",
    },
    { organizationId: "clinic_1", email: "doctor@example.com", role: "doctor" },
  );

  assert.equal(outcome.invitation.id, "staff_inv_1");
  assert.equal(outcome.delivery.email, "unavailable");
  assert.match(outcome.acceptanceUrl || "", /^https:\/\//);
});

test("rejects drifted invitation and membership success responses", () => {
  assert.throws(
    () =>
      parsePortalStaffInvitationOutcome(
        {
          invitation: {
            id: "staff_inv_1",
            organizationId: "other_workspace",
            email: "doctor@example.com",
            role: "doctor",
            status: "pending",
          },
          delivery: { email: "sent" },
        },
        {
          organizationId: "clinic_1",
          email: "doctor@example.com",
          role: "doctor",
        },
      ),
    /workspace.*không khớp/i,
  );
  assert.throws(
    () =>
      assertMembershipLifecycleOutcome(
        {
          action: "suspend",
          membership: { userId: "staff_2", status: "suspended" },
          user: { id: "staff_2" },
        },
        "staff_1",
        "suspend",
        "clinic_1",
      ),
    /không khớp/i,
  );
});

test("validates list and each workspace membership lifecycle", () => {
  const list = parsePortalStaffInvitationList(
    {
      invitations: [
        {
          id: "staff_inv_1",
          organizationId: "clinic_1",
          email: "viewer@example.com",
          role: "viewer",
          status: "accepted",
        },
      ],
    },
    "clinic_1",
  );
  assert.equal(list.length, 1);

  assert.doesNotThrow(() =>
    assertMembershipLifecycleOutcome(
      {
        action: "reactivate",
        membership: {
          userId: "staff_1",
          organizationId: "clinic_1",
          status: "active",
        },
        user: { id: "staff_1" },
        revoked: false,
      },
      "staff_1",
      "reactivate",
      "clinic_1",
    ),
  );
  assert.doesNotThrow(() =>
    assertMembershipLifecycleOutcome(
      {
        action: "revoke",
        membership: {
          userId: "staff_1",
          organizationId: "clinic_1",
          status: "revoked",
        },
        user: { id: "staff_1" },
        revoked: true,
      },
      "staff_1",
      "revoke",
      "clinic_1",
    ),
  );
});

test("rejects foreign or duplicate invitation and membership ledger rows", () => {
  assert.throws(
    () =>
      parsePortalStaffInvitationList(
        {
          invitations: [
            {
              id: "staff_inv_foreign",
              organizationId: "clinic_2",
              email: "viewer@example.com",
              role: "viewer",
              status: "pending",
            },
          ],
        },
        "clinic_1",
      ),
    /workspace/i,
  );
  const duplicate = {
    id: "staff_inv_duplicate",
    organizationId: "clinic_1",
    email: "viewer@example.com",
    role: "viewer",
    status: "pending",
  };
  assert.throws(
    () =>
      parsePortalStaffInvitationList(
        { invitations: [duplicate, duplicate] },
        "clinic_1",
      ),
    /trùng ID/i,
  );
  assert.throws(
    () =>
      assertMembershipLifecycleOutcome(
        {
          action: "suspend",
          membership: {
            userId: "staff_1",
            organizationId: "clinic_2",
            status: "suspended",
          },
          user: { id: "staff_1" },
        },
        "staff_1",
        "suspend",
        "clinic_1",
      ),
    /workspace/i,
  );
});

test("creates intent-scoped idempotency keys", () => {
  const first = createPortalStaffIdempotencyKey("invite-create", "clinic_1");
  const second = createPortalStaffIdempotencyKey("invite-create", "clinic_1");
  assert.match(first, /^portal-staff-invite-create-clinic_1-/);
  assert.notEqual(first, second);
});

test("validates the exact invitation, membership and authenticated identity after acceptance", () => {
  const outcome = parseStaffInvitationAcceptanceOutcome(
    {
      invitation: {
        id: "staff_inv_1",
        organizationId: "clinic_1",
        email: "doctor@example.com",
        role: "doctor",
        status: "accepted",
      },
      membership: {
        id: "membership_1",
        organizationId: "clinic_1",
        userId: "user_1",
        role: "doctor",
        status: "active",
      },
      user: {
        id: "user_1",
        email: "doctor@example.com",
      },
      idempotent: true,
    },
    { userId: "user_1", email: "doctor@example.com" },
  );

  assert.equal(outcome.invitation.status, "accepted");
  assert.equal(outcome.membership.organizationId, "clinic_1");
  assert.equal(outcome.idempotent, true);
});

test("rejects an acceptance response that drifts from the signed-in identity or workspace", () => {
  assert.throws(
    () =>
      parseStaffInvitationAcceptanceOutcome(
        {
          invitation: {
            id: "staff_inv_1",
            organizationId: "clinic_1",
            email: "doctor@example.com",
            role: "doctor",
            status: "accepted",
          },
          membership: {
            organizationId: "other_clinic",
            userId: "user_1",
            role: "doctor",
            status: "active",
          },
          user: { id: "user_1", email: "doctor@example.com" },
        },
        { userId: "user_1", email: "doctor@example.com" },
      ),
    /workspace/i,
  );

  assert.throws(
    () => validateStaffInvitationToken("short-secret"),
    /không hợp lệ/i,
  );
});

test("reuses an acceptance idempotency key across reload without storing the raw token", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
  const token = "secret-token-".padEnd(48, "x");
  const first = await getStaffInvitationAcceptanceIdempotencyKey(
    token,
    "user_1",
    storage,
  );
  const reloaded = await getStaffInvitationAcceptanceIdempotencyKey(
    token,
    "user_1",
    storage,
  );

  assert.equal(reloaded, first);
  assert.equal(
    [...values.keys()].some((key) => key.includes(token)),
    false,
  );
  assert.equal(
    [...values.values()].some((value) => value.includes(token)),
    false,
  );

  await clearStaffInvitationAcceptanceIdempotencyKey(token, "user_1", storage);
  assert.equal(values.size, 0);
});
