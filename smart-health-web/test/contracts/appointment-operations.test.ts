import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAppointmentDetailResponse,
  parseAppointmentDeletionReceipt,
  parseAppointmentListResponse,
  parseAppointmentMutationOutcome,
  parseAppointmentStaffResponse,
  resolveAppointmentOperationAttempt,
} from "../../src/lib/appointment-operations.ts";

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt_01",
    organizationId: "workspace-a",
    patientId: "pat_01",
    doctorUserId: "doctor_01",
    type: "remote_consultation",
    status: "scheduled",
    startsAt: "2026-08-01T08:00:00.000Z",
    endsAt: "2026-08-01T08:30:00.000Z",
    location: "Phòng tư vấn 1",
    channel: "video",
    reason: "Tái khám",
    notes: "Mang theo kết quả đo",
    cancellationReason: "",
    cancelledAt: "",
    completedAt: "",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    patient: {
      id: "pat_01",
      patientCode: "BN-001",
      name: "Nguyễn An",
      organizationId: "workspace-a",
    },
    doctor: {
      id: "doctor_01",
      name: "BS. Trần Bình",
      email: "doctor@example.com",
      specialty: "Nội tổng quát",
    },
    ...overrides,
  };
}

test("parses only canonical appointments from the active workspace", () => {
  const result = parseAppointmentListResponse(
    { appointments: [appointment()] },
    "workspace-a",
  );

  assert.equal(result.appointments[0].id, "appt_01");
  assert.equal(result.appointments[0].status, "scheduled");
  assert.throws(
    () =>
      parseAppointmentListResponse(
        {
          appointments: [
            appointment({ organizationId: "workspace-b" }),
          ],
        },
        "workspace-a",
      ),
    /workspace hiện tại/,
  );
  assert.throws(
    () =>
      parseAppointmentListResponse(
        { appointments: [appointment(), appointment()] },
        "workspace-a",
      ),
    /trùng ID/,
  );
});

test("rejects malformed lifecycle, time and nested patient identity", () => {
  assert.throws(
    () =>
      parseAppointmentListResponse(
        { appointments: [appointment({ status: "pending" })] },
        "workspace-a",
      ),
    /trạng thái/,
  );
  assert.throws(
    () =>
      parseAppointmentListResponse(
        {
          appointments: [
            appointment({
              endsAt: "2026-08-01T07:30:00.000Z",
            }),
          ],
        },
        "workspace-a",
      ),
    /thời gian/,
  );
  assert.throws(
    () =>
      parseAppointmentListResponse(
        {
          appointments: [
            appointment({
              patient: {
                id: "pat_other",
                patientCode: "BN-X",
                name: "Sai bệnh nhân",
                organizationId: "workspace-a",
              },
            }),
          ],
        },
        "workspace-a",
      ),
    /bệnh nhân/,
  );
});

test("binds detail and mutation receipts to the exact operation intent", () => {
  const detail = parseAppointmentDetailResponse(
    { appointment: appointment() },
    { workspaceId: "workspace-a", appointmentId: "appt_01" },
  );
  assert.equal(detail.appointment.patient?.name, "Nguyễn An");

  assert.throws(
    () =>
      parseAppointmentDetailResponse(
        { appointment: appointment({ id: "appt_other" }) },
        { workspaceId: "workspace-a", appointmentId: "appt_01" },
      ),
    /đúng lịch hẹn/,
  );

  const confirmed = parseAppointmentMutationOutcome(
    {
      appointment: appointment({
        status: "confirmed",
        updatedAt: "2026-07-29T09:00:00.000Z",
      }),
    },
    {
      workspaceId: "workspace-a",
      appointmentId: "appt_01",
      expected: { status: "confirmed" },
    },
  );
  assert.equal(confirmed.appointment.status, "confirmed");

  assert.throws(
    () =>
      parseAppointmentMutationOutcome(
        {
          appointment: appointment({
            organizationId: "workspace-b",
            status: "confirmed",
          }),
        },
        {
          workspaceId: "workspace-a",
          appointmentId: "appt_01",
          expected: { status: "confirmed" },
        },
      ),
    /workspace hiện tại/,
  );
  assert.throws(
    () =>
      parseAppointmentMutationOutcome(
        { appointment: appointment({ status: "scheduled" }) },
        {
          workspaceId: "workspace-a",
          appointmentId: "appt_01",
          expected: { status: "confirmed" },
        },
      ),
    /trạng thái/,
  );
});

test("reuses an idempotency key only for the same workspace operation intent", () => {
  const intent = {
    operation: "create" as const,
    workspaceId: "workspace-a",
    appointmentId: "new",
    payload: {
      patientId: "pat_01",
      startsAt: "2026-08-01T08:00:00.000Z",
      endsAt: "2026-08-01T08:30:00.000Z",
      reason: "Tái khám",
    },
  };
  const first = resolveAppointmentOperationAttempt(null, intent);
  const retry = resolveAppointmentOperationAttempt(first, {
    ...intent,
    payload: { ...intent.payload },
  });
  const changed = resolveAppointmentOperationAttempt(retry, {
    ...intent,
    payload: { ...intent.payload, reason: "Đổi lý do" },
  });
  const otherWorkspace = resolveAppointmentOperationAttempt(retry, {
    ...intent,
    workspaceId: "workspace-b",
  });

  assert.equal(retry.idempotencyKey, first.idempotencyKey);
  assert.notEqual(changed.idempotencyKey, first.idempotencyKey);
  assert.notEqual(otherWorkspace.idempotencyKey, first.idempotencyKey);
  assert.match(first.idempotencyKey, /^portal-appointment-create-new-/);
});

test("accepts only an exact soft-delete receipt", () => {
  const intent = {
    workspaceId: "workspace-a",
    appointmentId: "appt_01",
  };
  const receipt = parseAppointmentDeletionReceipt(
    {
      deleted: true,
      appointmentId: "appt_01",
      workspaceId: "workspace-a",
      deletedAt: "2026-08-22T08:00:00.000Z",
      replayed: false,
    },
    intent,
  );
  assert.equal(receipt.deleted, true);
  assert.equal(receipt.appointmentId, intent.appointmentId);
  assert.throws(
    () => parseAppointmentDeletionReceipt({ ...receipt, appointmentId: "appt_other" }, intent),
    /đúng lịch hẹn/,
  );
  assert.throws(
    () => parseAppointmentDeletionReceipt({ ...receipt, workspaceId: "workspace-b" }, intent),
    /workspace hiện tại/,
  );
  assert.throws(
    () => parseAppointmentDeletionReceipt({ ...receipt, deletedAt: "" }, intent),
    /thời điểm xóa/,
  );
});

test("accepts only active operational doctors from the active workspace", () => {
  const assignableDoctor = {
    id: "doctor_01",
    role: "doctor",
    name: "BS. Trần Bình",
    email: "doctor@example.com",
    accountStatus: "active",
    roleRequestStatus: "approved",
    workspaceMembership: {
      id: "membership-doctor-01",
      organizationId: "workspace-a",
      role: "doctor",
      status: "active",
      operational: true,
    },
  };

  assert.equal(
    parseAppointmentStaffResponse(
      { staff: [assignableDoctor], doctors: [assignableDoctor] },
      "workspace-a",
    ).doctors[0].id,
    "doctor_01",
  );
  for (const rejected of [
    {
      ...assignableDoctor,
      workspaceMembership: {
        ...assignableDoctor.workspaceMembership,
        organizationId: "workspace-b",
      },
    },
    {
      ...assignableDoctor,
      workspaceMembership: {
        ...assignableDoctor.workspaceMembership,
        status: "suspended",
        operational: false,
      },
    },
    {
      ...assignableDoctor,
      accountStatus: "locked",
      workspaceMembership: {
        ...assignableDoctor.workspaceMembership,
        operational: false,
      },
    },
  ]) {
    assert.throws(
      () =>
        parseAppointmentStaffResponse(
          { staff: [rejected], doctors: [rejected] },
          "workspace-a",
        ),
      /bác sĩ/,
    );
  }
});
