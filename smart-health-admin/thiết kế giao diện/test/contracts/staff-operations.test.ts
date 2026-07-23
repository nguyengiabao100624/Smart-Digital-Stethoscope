import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDoctorAccountStateOutcome,
  assertDoctorDeleteOutcome,
  createStaffOperationIdempotencyKey,
  parseFirebaseReconciliationOutcome,
  parseStaffInvitationList,
  parseStaffInvitationOutcome,
} from "../../src/lib/staff-operations.ts";
import { toVietnameseErrorMessage } from "../../src/lib/error-messages.ts";

test("accepts exact canonical staff invitation and doctor lifecycle outcomes", () => {
  const outcome = parseStaffInvitationOutcome(
    {
      invitation: {
        id: "staff_inv_1",
        organizationId: "clinic_1",
        email: "doctor@example.com",
        role: "doctor",
        status: "pending",
        expiresAt: "2026-07-20T10:00:00.000Z",
      },
      delivery: { email: "unavailable" },
      oneTimeAcceptanceUrl: "https://portal.example/staff-invitations/accept?token=one-time",
    },
    {
      organizationId: "clinic_1",
      email: "doctor@example.com",
      role: "doctor",
    },
  );

  assert.equal(outcome.invitation.id, "staff_inv_1");
  assert.equal(outcome.delivery.email, "unavailable");
  assert.match(outcome.acceptanceUrl || "", /^https:\/\//);

  assert.doesNotThrow(() =>
    assertDoctorAccountStateOutcome(
      { request: { id: "doctor_1", accountStatus: "locked" } },
      "doctor_1",
      "locked",
    ),
  );
  assert.doesNotThrow(() =>
    assertDoctorDeleteOutcome({ deleted: true, userId: "doctor_1" }, "doctor_1"),
  );
});

test("rejects mismatched or incomplete staff mutation success responses", () => {
  assert.throws(
    () =>
      parseStaffInvitationOutcome(
        {
          invitation: {
            id: "staff_inv_1",
            organizationId: "other_clinic",
            email: "doctor@example.com",
            role: "doctor",
            status: "pending",
          },
          delivery: { email: "ready" },
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
      assertDoctorAccountStateOutcome(
        { request: { id: "doctor_1", accountStatus: "active" } },
        "doctor_1",
        "locked",
      ),
    /chưa xác nhận đúng trạng thái/i,
  );
  assert.throws(
    () => assertDoctorDeleteOutcome({ deleted: true, userId: "doctor_2" }, "doctor_1"),
    /không khớp/i,
  );
});

test("normalizes report-only Firebase reconciliation without destructive claims", () => {
  const report = parseFirebaseReconciliationOutcome({
    mode: "report_only",
    destructiveAction: false,
    deletedCount: 0,
    providerAccountCount: 11,
    backendLinkedAccountCount: 10,
    missingProviderAccountCount: 1,
    missingBackendAccountCount: 2,
    missingProviderAccounts: ["backend-only@example.com"],
    missingBackendAccounts: ["provider-only@example.com"],
    resultsTruncated: false,
  });

  assert.equal(report.mode, "report_only");
  assert.equal(report.missingProviderAccountCount, 1);
  assert.equal(report.missingBackendAccountCount, 2);
  assert.throws(
    () => parseFirebaseReconciliationOutcome({ mode: "delete", destructiveAction: true }),
    /chỉ hỗ trợ đối soát/i,
  );
});

test("creates operation-scoped staff idempotency keys", () => {
  const first = createStaffOperationIdempotencyKey("invite-create", "clinic_1");
  const second = createStaffOperationIdempotencyKey("invite-create", "clinic_1");
  assert.match(first, /^admin-staff-invite-create-clinic_1-/);
  assert.notEqual(first, second);
});

test("accepts only the canonical secure Web acceptance route", () => {
  const expected = {
    organizationId: "clinic_1",
    email: "doctor@example.com",
    role: "doctor" as const,
  };
  const invitation = {
    id: "staff_inv_1",
    ...expected,
    status: "pending",
  };
  assert.throws(
    () =>
      parseStaffInvitationOutcome(
        {
          invitation,
          delivery: { email: "unavailable" },
          oneTimeAcceptanceUrl: "https://portal.example/portal/invitations/accept?token=bad",
        },
        expected,
      ),
    /sai route.*canonical/i,
  );
  assert.throws(
    () =>
      parseStaffInvitationOutcome(
        {
          invitation,
          delivery: { email: "unavailable" },
          oneTimeAcceptanceUrl: "http://portal.example/staff-invitations/accept?token=insecure",
        },
        expected,
      ),
    /phải dùng HTTPS/i,
  );
  assert.doesNotThrow(() =>
    parseStaffInvitationOutcome(
      {
        invitation,
        delivery: { email: "unavailable" },
        oneTimeAcceptanceUrl: "http://localhost:8080/staff-invitations/accept?token=local-only",
      },
      expected,
    ),
  );
});

test("validates every invitation returned by the list contract", () => {
  const invitations = parseStaffInvitationList({
    invitations: [
      {
        id: "staff_inv_1",
        organizationId: "clinic_1",
        email: "doctor@example.com",
        role: "doctor",
        status: "pending",
      },
    ],
  });
  assert.equal(invitations.length, 1);
  assert.throws(() => parseStaffInvitationList({ invitations: [{}] }), /thiếu .*canonical/);
  assert.throws(() => parseStaffInvitationList({}), /thiếu danh sách lời mời/);
});

test("presents staff invitation failures in actionable Vietnamese", () => {
  assert.match(
    toVietnameseErrorMessage({ code: "STAFF_INVITATION_PENDING", message: "Conflict" }),
    /đã có một lời mời đang chờ/,
  );
  assert.match(
    toVietnameseErrorMessage({ code: "STAFF_INVITATION_EMAIL_MISMATCH", message: "Forbidden" }),
    /không khớp/,
  );
});
