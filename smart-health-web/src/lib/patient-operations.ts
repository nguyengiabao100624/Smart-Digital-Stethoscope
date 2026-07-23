import type { Patient } from "./smart-health-api";

export type PatientEmergencyContact = {
  name: string;
  phone: string;
  relationship: string;
};

export type PatientMutationIntent = {
  patientId?: string;
  name: string;
  patientCode?: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email?: string;
  address?: string;
  bloodType?: string;
  allergies: string[];
  emergencyContact: PatientEmergencyContact;
  notes?: string;
};

export type PatientOperation = "create" | "update" | "delete";

export type PatientOperationAttempt = {
  fingerprint: string;
  idempotencyKey: string;
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi bệnh nhân thiếu ${label}.`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Phản hồi bệnh nhân có ${label} không hợp lệ.`);
  }
  return value.trim();
}

function optionalDate(value: unknown, label: string) {
  const normalized = optionalString(value, label);
  if (!normalized) return normalized;
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`Phản hồi bệnh nhân có ${label} không hợp lệ.`);
  }
  return normalized;
}

function optionalCount(value: unknown, label: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Phản hồi bệnh nhân có ${label} không hợp lệ.`);
  }
  return value;
}

function parseEmergencyContact(
  value: unknown,
): PatientEmergencyContact | undefined {
  if (value === undefined || value === null) return undefined;
  const record = recordOf(value);
  return {
    name: optionalString(record.name, "tên liên hệ khẩn cấp") || "",
    phone: optionalString(record.phone, "số liên hệ khẩn cấp") || "",
    relationship:
      optionalString(record.relationship, "quan hệ liên hệ khẩn cấp") || "",
  };
}

export function parseCanonicalPatient(value: unknown): Patient {
  const record = recordOf(value);
  if (record.allergies !== undefined && !Array.isArray(record.allergies)) {
    throw new Error("Phản hồi bệnh nhân có danh sách dị ứng không hợp lệ.");
  }
  const allergies = Array.isArray(record.allergies)
    ? record.allergies.map((item) => requiredString(item, "mục dị ứng"))
    : undefined;
  const age = optionalCount(record.age, "tuổi");
  if (age !== undefined && age > 130) {
    throw new Error("Phản hồi bệnh nhân có tuổi ngoài phạm vi hợp lệ.");
  }
  return {
    id: requiredString(record.id, "ID canonical"),
    patientCode: optionalString(record.patientCode, "mã hồ sơ"),
    name: optionalString(record.name, "họ tên"),
    age: age ?? (record.age === null ? null : undefined),
    dateOfBirth: optionalString(record.dateOfBirth, "ngày sinh"),
    bloodType: optionalString(record.bloodType, "nhóm máu"),
    allergies,
    emergencyContact: parseEmergencyContact(record.emergencyContact),
    gender: optionalString(record.gender, "giới tính"),
    phone: optionalString(record.phone, "số điện thoại"),
    email: optionalString(record.email, "email"),
    address: optionalString(record.address, "địa chỉ"),
    notes: optionalString(record.notes, "ghi chú"),
    organizationId: optionalString(record.organizationId, "workspace ID"),
    ownerUserId: optionalString(record.ownerUserId, "owner user ID"),
    profileType: optionalString(record.profileType, "loại hồ sơ"),
    relationship: optionalString(record.relationship, "quan hệ hồ sơ"),
    doctorName: optionalString(record.doctorName, "tên bác sĩ"),
    scanCount: optionalCount(record.scanCount, "số lượt đo"),
    lastScanAt: optionalDate(record.lastScanAt, "thời điểm đo gần nhất"),
    lastAiLabel: optionalString(record.lastAiLabel, "nhãn xử lý gần nhất"),
    createdAt: optionalDate(record.createdAt, "thời điểm tạo"),
    updatedAt: optionalDate(record.updatedAt, "thời điểm cập nhật"),
  };
}

export function parsePatientListResponse(response: unknown) {
  const value = recordOf(response).patients;
  if (!Array.isArray(value)) {
    throw new Error("Phản hồi bệnh nhân thiếu danh sách canonical.");
  }
  const patients = value.map(parseCanonicalPatient);
  const ids = new Set<string>();
  for (const patient of patients) {
    if (ids.has(patient.id))
      throw new Error(`Phản hồi bệnh nhân bị trùng ID ${patient.id}.`);
    ids.add(patient.id);
  }
  return patients;
}

export function parsePatientDetailResponse(response: unknown) {
  return parseCanonicalPatient(recordOf(response).patient);
}

function normalizeIntent(intent: PatientMutationIntent) {
  return {
    patientId: intent.patientId?.trim() || "",
    name: intent.name.trim(),
    patientCode: intent.patientCode?.trim() || "",
    dateOfBirth: intent.dateOfBirth.trim(),
    gender: intent.gender.trim(),
    phone: intent.phone.trim(),
    email: intent.email?.trim().toLowerCase() || "",
    address: intent.address?.trim() || "",
    bloodType: intent.bloodType?.trim().toUpperCase() || "",
    allergies: Array.from(
      new Set(intent.allergies.map((item) => item.trim()).filter(Boolean)),
    ),
    emergencyContact: {
      name: intent.emergencyContact.name.trim(),
      phone: intent.emergencyContact.phone.trim(),
      relationship: intent.emergencyContact.relationship.trim(),
    },
    notes: intent.notes?.trim() || "",
  };
}

export function patientIntentFingerprint(intent: PatientMutationIntent) {
  return JSON.stringify(normalizeIntent(intent));
}

export function createPatientIdempotencyKey(
  operation: PatientOperation,
  target = "new",
) {
  const safeTarget = target.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-") || "new";
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `portal-patient-${operation}-${safeTarget}-${nonce}`;
}

export function resolvePatientOperationAttempt(
  previous: PatientOperationAttempt | null | undefined,
  operation: PatientOperation,
  intent: PatientMutationIntent,
): PatientOperationAttempt {
  const fingerprint = `${operation}:${patientIntentFingerprint(intent)}`;
  if (previous?.fingerprint === fingerprint) return previous;
  return {
    fingerprint,
    idempotencyKey: createPatientIdempotencyKey(
      operation,
      intent.patientId || intent.patientCode || "new",
    ),
  };
}

function assertMatches(patient: Patient, intent: PatientMutationIntent) {
  const expected = normalizeIntent(intent);
  if (expected.patientId && patient.id !== expected.patientId) {
    throw new Error("Backend trả về hồ sơ khác ID canonical đang thao tác.");
  }
  const actual = {
    name: patient.name?.trim() || "",
    patientCode: patient.patientCode?.trim() || "",
    dateOfBirth: patient.dateOfBirth?.trim() || "",
    gender: patient.gender?.trim() || "",
    phone: patient.phone?.trim() || "",
    email: patient.email?.trim().toLowerCase() || "",
    address: patient.address?.trim() || "",
    bloodType: patient.bloodType?.trim().toUpperCase() || "",
    allergies: patient.allergies || [],
    emergencyContact: {
      name: patient.emergencyContact?.name?.trim() || "",
      phone: patient.emergencyContact?.phone?.trim() || "",
      relationship: patient.emergencyContact?.relationship?.trim() || "",
    },
    notes: patient.notes?.trim() || "",
  };
  for (const field of [
    "name",
    "dateOfBirth",
    "gender",
    "phone",
    "email",
    "address",
    "bloodType",
    "notes",
  ] as const) {
    if (actual[field] !== expected[field]) {
      throw new Error(
        `Backend chưa xác nhận đúng trường ${field} của hồ sơ bệnh nhân.`,
      );
    }
  }
  if (
    (expected.patientId || expected.patientCode) &&
    actual.patientCode !== expected.patientCode
  ) {
    throw new Error("Backend chưa xác nhận đúng mã hồ sơ bệnh nhân.");
  }
  if (JSON.stringify(actual.allergies) !== JSON.stringify(expected.allergies)) {
    throw new Error(
      "Backend chưa xác nhận đúng danh sách dị ứng của bệnh nhân.",
    );
  }
  if (
    JSON.stringify(actual.emergencyContact) !==
    JSON.stringify(expected.emergencyContact)
  ) {
    throw new Error(
      "Backend chưa xác nhận đúng liên hệ khẩn cấp của bệnh nhân.",
    );
  }
}

export function parsePatientMutationOutcome(
  response: unknown,
  intent: PatientMutationIntent,
) {
  const record = recordOf(response);
  if (typeof record.replayed !== "boolean") {
    throw new Error(
      "Phản hồi mutation bệnh nhân thiếu trạng thái replayed canonical.",
    );
  }
  const patient = parseCanonicalPatient(record.patient);
  assertMatches(patient, intent);
  return { patient, replayed: record.replayed };
}

export function parsePatientDeleteOutcome(
  response: unknown,
  expectedPatientId: string,
) {
  const record = recordOf(response);
  if (record.deleted !== true)
    throw new Error("Backend chưa xác nhận đã xóa hồ sơ bệnh nhân.");
  const patientId = requiredString(record.patientId, "patientId đã xóa");
  if (patientId !== expectedPatientId) {
    throw new Error(
      "Backend xác nhận xóa một hồ sơ khác ID canonical đang thao tác.",
    );
  }
  if (typeof record.replayed !== "boolean") {
    throw new Error(
      "Phản hồi xóa bệnh nhân thiếu trạng thái replayed canonical.",
    );
  }
  return { deleted: true as const, patientId, replayed: record.replayed };
}
