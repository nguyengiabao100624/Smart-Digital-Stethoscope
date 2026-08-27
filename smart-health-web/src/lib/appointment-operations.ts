import type { ApiUser, Appointment } from "./smart-health-api";

export type CanonicalAppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type CanonicalAppointmentType =
  | "remote_consultation"
  | "clinic_visit"
  | "measurement"
  | "follow_up";

export type AppointmentOperation =
  | "create"
  | "edit"
  | "reschedule"
  | "confirm"
  | "complete"
  | "no_show"
  | "cancel"
  | "delete";

export type AppointmentOperationIntent = {
  operation: AppointmentOperation;
  workspaceId: string;
  appointmentId: string;
  payload: Record<string, unknown>;
};

export type AppointmentOperationAttempt = {
  fingerprint: string;
  idempotencyKey: string;
};

export type AppointmentIdentityExpectation = {
  workspaceId: string;
  appointmentId: string;
};

export type AppointmentMutationExpectation = {
  workspaceId: string;
  appointmentId?: string;
  expected: Partial<
    Pick<
      Appointment,
      | "patientId"
      | "doctorUserId"
      | "type"
      | "status"
      | "startsAt"
      | "endsAt"
      | "location"
      | "reason"
      | "notes"
      | "cancellationReason"
    >
  >;
};

export type AppointmentDeletionExpectation = {
  workspaceId: string;
  appointmentId: string;
};

export type AppointmentDeletionReceipt = {
  deleted: true;
  appointmentId: string;
  workspaceId: string;
  deletedAt: string;
  replayed: boolean;
};

const APPOINTMENT_STATUSES = new Set<CanonicalAppointmentStatus>([
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

const APPOINTMENT_TYPES = new Set<CanonicalAppointmentType>([
  "remote_consultation",
  "clinic_visit",
  "measurement",
  "follow_up",
]);

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi lịch hẹn thiếu ${label}.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`Phản hồi lịch hẹn có ${label} không hợp lệ.`);
  }
  return value.trim();
}

function requiredDate(value: unknown, label: string) {
  const text = requiredText(value, label);
  const timestamp = Date.parse(text);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Phản hồi lịch hẹn có ${label} không hợp lệ.`);
  }
  return { text, timestamp };
}

function optionalDate(value: unknown, label: string) {
  const text = optionalText(value, label);
  if (!text) return "";
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`Phản hồi lịch hẹn có ${label} không hợp lệ.`);
  }
  return text;
}

function parseAppointmentPerson(
  value: unknown,
  kind: "patient" | "doctor",
) {
  if (value === undefined || value === null) return null;
  const record = recordOf(value);
  const id = requiredText(
    record.id,
    kind === "patient" ? "ID bệnh nhân" : "ID bác sĩ",
  );
  return {
    id,
    name: optionalText(
      record.name,
      kind === "patient" ? "tên bệnh nhân" : "tên bác sĩ",
    ),
    ...(kind === "patient"
      ? {
          patientCode: optionalText(record.patientCode, "mã bệnh nhân"),
          organizationId: requiredText(
            record.organizationId,
            "workspace của bệnh nhân",
          ),
        }
      : {
          email: optionalText(record.email, "email bác sĩ"),
          specialty: optionalText(record.specialty, "chuyên khoa bác sĩ"),
        }),
  };
}

export function parseCanonicalAppointment(
  value: unknown,
  expectedWorkspaceId: string,
): Appointment {
  const record = recordOf(value);
  const workspaceId = requiredText(
    expectedWorkspaceId,
    "workspace kỳ vọng",
  );
  const organizationId = requiredText(record.organizationId, "workspace ID");
  if (organizationId !== workspaceId) {
    throw new Error("Lịch hẹn không thuộc workspace hiện tại.");
  }

  const id = requiredText(record.id, "ID canonical");
  const patientId = requiredText(record.patientId, "patientId");
  const doctorUserId = optionalText(record.doctorUserId, "doctorUserId");
  const type = requiredText(record.type, "loại lịch");
  if (!APPOINTMENT_TYPES.has(type as CanonicalAppointmentType)) {
    throw new Error(`Phản hồi lịch hẹn có loại lịch không hợp lệ: ${type}.`);
  }
  const status = requiredText(record.status, "trạng thái");
  if (!APPOINTMENT_STATUSES.has(status as CanonicalAppointmentStatus)) {
    throw new Error(`Phản hồi lịch hẹn có trạng thái không hợp lệ: ${status}.`);
  }

  const startsAt = requiredDate(record.startsAt, "thời gian bắt đầu");
  const endsAt = requiredDate(record.endsAt, "thời gian kết thúc");
  if (endsAt.timestamp <= startsAt.timestamp) {
    throw new Error("Phản hồi lịch hẹn có thời gian bắt đầu/kết thúc mâu thuẫn.");
  }

  const patient = parseAppointmentPerson(record.patient, "patient");
  if (
    patient &&
    (patient.id !== patientId ||
      !("organizationId" in patient) ||
      patient.organizationId !== workspaceId)
  ) {
    throw new Error(
      "Phản hồi lịch hẹn có bệnh nhân không khớp workspace và patientId.",
    );
  }
  const doctor = parseAppointmentPerson(record.doctor, "doctor");
  if (doctor && (!doctorUserId || doctor.id !== doctorUserId)) {
    throw new Error("Phản hồi lịch hẹn có bác sĩ không khớp doctorUserId.");
  }

  const cancellationReason = optionalText(
    record.cancellationReason,
    "lý do hủy",
  );
  if (status === "cancelled" && !cancellationReason) {
    throw new Error("Phản hồi lịch hẹn đã hủy nhưng thiếu lý do hủy.");
  }

  return {
    id,
    organizationId,
    patientId,
    doctorUserId,
    type,
    status,
    startsAt: startsAt.text,
    endsAt: endsAt.text,
    location: optionalText(record.location, "địa điểm"),
    channel: optionalText(record.channel, "kênh"),
    reason: optionalText(record.reason, "lý do"),
    notes: optionalText(record.notes, "ghi chú"),
    cancellationReason,
    cancelledAt: optionalDate(record.cancelledAt, "thời điểm hủy"),
    completedAt: optionalDate(record.completedAt, "thời điểm hoàn tất"),
    createdAt: optionalDate(record.createdAt, "thời điểm tạo"),
    updatedAt: optionalDate(record.updatedAt, "thời điểm cập nhật"),
    patient: patient as Appointment["patient"],
    doctor: doctor as Appointment["doctor"],
  };
}

export function parseAppointmentListResponse(
  response: unknown,
  expectedWorkspaceId: string,
) {
  const value = recordOf(response).appointments;
  if (!Array.isArray(value)) {
    throw new Error("Phản hồi lịch hẹn thiếu danh sách canonical.");
  }
  const ids = new Set<string>();
  const appointments = value.map((item) => {
    const appointment = parseCanonicalAppointment(item, expectedWorkspaceId);
    if (ids.has(appointment.id)) {
      throw new Error(`Phản hồi lịch hẹn bị trùng ID ${appointment.id}.`);
    }
    ids.add(appointment.id);
    return appointment;
  });
  return { appointments };
}

export function parseAppointmentDetailResponse(
  response: unknown,
  expectation: AppointmentIdentityExpectation,
) {
  const appointment = parseCanonicalAppointment(
    recordOf(response).appointment,
    expectation.workspaceId,
  );
  if (appointment.id !== expectation.appointmentId) {
    throw new Error("Backend không trả về đúng lịch hẹn đang xem.");
  }
  return { appointment };
}

function parseAssignableDoctor(
  value: unknown,
  expectedWorkspaceId: string,
): ApiUser {
  const doctor = recordOf(value);
  const id = requiredText(doctor.id, "ID bác sĩ");
  const membership = recordOf(doctor.workspaceMembership);
  const membershipWorkspaceId = requiredText(
    membership.organizationId ?? membership.workspaceId,
    "workspace của bác sĩ",
  );
  if (membershipWorkspaceId !== expectedWorkspaceId) {
    throw new Error("Danh mục bác sĩ chứa tài khoản ngoài workspace hiện tại.");
  }
  if (
    requiredText(membership.role, "vai trò bác sĩ") !== "doctor" ||
    requiredText(membership.status, "trạng thái membership bác sĩ") !==
      "active" ||
    membership.operational !== true
  ) {
    throw new Error(
      "Danh mục bác sĩ chứa membership không còn quyền vận hành.",
    );
  }
  if (
    requiredText(doctor.role, "vai trò tài khoản bác sĩ") !== "doctor" ||
    requiredText(doctor.accountStatus, "trạng thái tài khoản bác sĩ") !==
      "active" ||
    requiredText(doctor.roleRequestStatus, "trạng thái duyệt bác sĩ") !==
      "approved"
  ) {
    throw new Error(
      "Danh mục bác sĩ chứa tài khoản chưa được duyệt hoặc đã bị khóa.",
    );
  }
  return {
    ...(doctor as ApiUser),
    id,
    workspaceMembership: {
      ...(membership as ApiUser["workspaceMembership"]),
      organizationId: membershipWorkspaceId,
      workspaceId: membershipWorkspaceId,
      role: "doctor",
      status: "active",
      operational: true,
    },
  };
}

export function parseAppointmentStaffResponse(
  response: unknown,
  expectedWorkspaceId: string,
) {
  const workspaceId = requiredText(
    expectedWorkspaceId,
    "workspace kỳ vọng của bác sĩ",
  );
  const value = recordOf(response).doctors;
  if (!Array.isArray(value)) {
    throw new Error("Phản hồi nhân sự thiếu danh mục bác sĩ canonical.");
  }
  const ids = new Set<string>();
  const doctors = value.map((item) => {
    const doctor = parseAssignableDoctor(item, workspaceId);
    if (ids.has(doctor.id)) {
      throw new Error(`Danh mục bác sĩ bị trùng ID ${doctor.id}.`);
    }
    ids.add(doctor.id);
    return doctor;
  });
  return { doctors };
}

function normalizedExpectedValue(
  key: keyof AppointmentMutationExpectation["expected"],
  value: unknown,
) {
  if (key === "startsAt" || key === "endsAt") {
    const timestamp = Date.parse(String(value || ""));
    return Number.isNaN(timestamp) ? String(value || "") : timestamp;
  }
  return typeof value === "string" ? value.trim() : value;
}

export function parseAppointmentMutationOutcome(
  response: unknown,
  expectation: AppointmentMutationExpectation,
) {
  const appointment = parseCanonicalAppointment(
    recordOf(response).appointment,
    expectation.workspaceId,
  );
  if (
    expectation.appointmentId &&
    appointment.id !== expectation.appointmentId
  ) {
    throw new Error("Backend không trả về đúng lịch hẹn đang thao tác.");
  }

  for (const [rawKey, expectedValue] of Object.entries(
    expectation.expected,
  )) {
    const key = rawKey as keyof AppointmentMutationExpectation["expected"];
    const actualValue = appointment[key];
    if (
      normalizedExpectedValue(key, actualValue) !==
      normalizedExpectedValue(key, expectedValue)
    ) {
      const label =
        key === "status"
          ? "trạng thái"
          : key === "startsAt" || key === "endsAt"
            ? "thời gian"
            : key;
      throw new Error(`Backend chưa xác nhận đúng ${label} của lịch hẹn.`);
    }
  }
  return { appointment };
}

export function parseAppointmentDeletionReceipt(
  response: unknown,
  expectation: AppointmentDeletionExpectation,
): AppointmentDeletionReceipt {
  const record = recordOf(response);
  if (record.deleted !== true) {
    throw new Error("Backend chưa xác nhận xóa mềm lịch hẹn.");
  }
  const appointmentId = requiredText(record.appointmentId, "ID lịch hẹn đã xóa");
  if (appointmentId !== expectation.appointmentId) {
    throw new Error("Backend không trả về đúng lịch hẹn đang xóa.");
  }
  const workspaceId = requiredText(record.workspaceId, "workspace của lịch hẹn đã xóa");
  if (workspaceId !== expectation.workspaceId) {
    throw new Error("Lịch hẹn đã xóa không thuộc workspace hiện tại.");
  }
  const deletedAt = requiredDate(record.deletedAt, "thời điểm xóa").text;
  if (typeof record.replayed !== "boolean") {
    throw new Error("Phản hồi xóa lịch hẹn thiếu trạng thái replay.");
  }
  return {
    deleted: true,
    appointmentId,
    workspaceId,
    deletedAt,
    replayed: record.replayed,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.trim() : value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function appointmentIntentFingerprint(intent: AppointmentOperationIntent) {
  return JSON.stringify(
    stableValue({
      operation: intent.operation,
      workspaceId: intent.workspaceId,
      appointmentId: intent.appointmentId,
      payload: intent.payload,
    }),
  );
}

function createAppointmentIdempotencyKey(
  operation: AppointmentOperation,
  appointmentId: string,
) {
  const safeTarget =
    appointmentId.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-") || "new";
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `portal-appointment-${operation}-${safeTarget}-${nonce}`;
}

export function resolveAppointmentOperationAttempt(
  previous: AppointmentOperationAttempt | null | undefined,
  intent: AppointmentOperationIntent,
): AppointmentOperationAttempt {
  const fingerprint = appointmentIntentFingerprint(intent);
  if (previous?.fingerprint === fingerprint) return previous;
  return {
    fingerprint,
    idempotencyKey: createAppointmentIdempotencyKey(
      intent.operation,
      intent.appointmentId,
    ),
  };
}
