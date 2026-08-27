import type {
  PatientImportBatch,
  PatientImportIssue,
  PatientImportRow,
} from "./smart-health-api";

export type PatientImportValidationExpectation = {
  workspaceId: string;
  fileName: string;
  fileSizeBytes: number;
};

export type PatientImportBatchExpectation = {
  workspaceId: string;
  batchId: string;
  minimumVersion: number;
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi import thiếu ${label}.`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`Phản hồi import có ${label} không hợp lệ.`);
  }
  return value.trim();
}

function nonNegativeInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Phản hồi import có ${label} không hợp lệ.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string) {
  const parsed = nonNegativeInteger(value, label);
  if (parsed < 1) throw new Error(`Phản hồi import có ${label} không hợp lệ.`);
  return parsed;
}

function isoTimestamp(value: unknown, label: string, allowEmpty = false) {
  const normalized = optionalString(value, label);
  if (!normalized && allowEmpty) return "";
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new Error(`Phản hồi import có ${label} không hợp lệ.`);
  }
  return normalized;
}

function parseIssue(value: unknown): PatientImportIssue {
  const record = recordOf(value);
  const severity = requiredString(record.severity, "mức lỗi");
  if (severity !== "error" && severity !== "warning") {
    throw new Error("Phản hồi import có mức lỗi không hợp lệ.");
  }
  return {
    field: requiredString(record.field, "trường lỗi"),
    code: requiredString(record.code, "mã lỗi"),
    message: requiredString(record.message, "nội dung lỗi"),
    severity,
  };
}

function parsePreviewPatient(value: unknown, requireId: boolean) {
  const record = recordOf(value);
  const id = optionalString(record.id, "patientId");
  if (requireId && !id) {
    throw new Error("Phản hồi import thiếu patientId được giữ chỗ cho dòng hợp lệ.");
  }
  const allergies = record.allergies;
  if (!Array.isArray(allergies)) {
    throw new Error("Phản hồi import có danh sách dị ứng không hợp lệ.");
  }
  const emergencyContact = recordOf(record.emergencyContact);
  return {
    id,
    patientCode: requiredString(record.patientCode, "mã hồ sơ"),
    name: optionalString(record.name, "họ tên"),
    dateOfBirth: optionalString(record.dateOfBirth, "ngày sinh"),
    gender: optionalString(record.gender, "giới tính"),
    phone: optionalString(record.phone, "số điện thoại"),
    email: optionalString(record.email, "email"),
    address: optionalString(record.address, "địa chỉ"),
    bloodType: optionalString(record.bloodType, "nhóm máu"),
    allergies: allergies.map((item) => requiredString(item, "dị ứng")),
    emergencyContact: {
      name: optionalString(emergencyContact.name, "tên liên hệ khẩn cấp"),
      phone: optionalString(emergencyContact.phone, "số liên hệ khẩn cấp"),
      relationship: optionalString(
        emergencyContact.relationship,
        "quan hệ liên hệ khẩn cấp",
      ),
    },
    notes: optionalString(record.notes, "ghi chú"),
    profileType: optionalString(record.profileType, "loại hồ sơ"),
  };
}

function parseRow(value: unknown): PatientImportRow {
  const record = recordOf(value);
  const status = requiredString(record.status, "trạng thái dòng");
  if (status !== "valid" && status !== "invalid") {
    throw new Error("Phản hồi import có trạng thái dòng không hợp lệ.");
  }
  if (!Array.isArray(record.issues)) {
    throw new Error("Phản hồi import thiếu danh sách lỗi theo dòng.");
  }
  const issues = record.issues.map(parseIssue);
  const hasError = issues.some((item) => item.severity === "error");
  if ((status === "invalid") !== hasError) {
    throw new Error("Trạng thái dòng import mâu thuẫn với danh sách lỗi.");
  }
  return {
    rowNumber: positiveInteger(record.rowNumber, "số dòng"),
    status,
    issues,
    patient: parsePreviewPatient(record.patient, status === "valid"),
  };
}

export function parsePatientImportBatch(value: unknown): PatientImportBatch {
  const record = recordOf(value);
  const status = requiredString(record.status, "trạng thái batch");
  if (!["validated", "invalid", "committed", "expired"].includes(status)) {
    throw new Error("Phản hồi import có trạng thái batch không hợp lệ.");
  }
  if (!Array.isArray(record.rows) || !Array.isArray(record.patientIds)) {
    throw new Error("Phản hồi import thiếu rows hoặc patientIds canonical.");
  }
  const rows = record.rows.map(parseRow);
  const rowCount = nonNegativeInteger(record.rowCount, "tổng số dòng");
  const validCount = nonNegativeInteger(record.validCount, "số dòng hợp lệ");
  const invalidCount = nonNegativeInteger(
    record.invalidCount,
    "số dòng không hợp lệ",
  );
  const duplicateCount = nonNegativeInteger(
    record.duplicateCount,
    "số dòng trùng",
  );
  const importedCount = nonNegativeInteger(
    record.importedCount,
    "số hồ sơ đã import",
  );
  if (
    rows.length !== rowCount ||
    validCount + invalidCount !== rowCount ||
    rows.filter((row) => row.status === "valid").length !== validCount ||
    rows.filter((row) => row.status === "invalid").length !== invalidCount ||
    duplicateCount > invalidCount
  ) {
    throw new Error("Phản hồi import có tổng số dòng mâu thuẫn.");
  }
  const patientIds = record.patientIds.map((item) =>
    requiredString(item, "patientId đã import"),
  );
  if (new Set(patientIds).size !== patientIds.length) {
    throw new Error("Phản hồi import bị trùng patientId canonical.");
  }
  if (status === "committed") {
    if (importedCount !== rowCount || patientIds.length !== importedCount) {
      throw new Error("Batch đã commit có số hồ sơ không khớp.");
    }
  } else if (importedCount !== 0 || patientIds.length !== 0) {
    throw new Error("Batch chưa commit không được chứa kết quả import.");
  }
  return {
    id: requiredString(record.id, "batchId"),
    organizationId: requiredString(record.organizationId, "workspaceId"),
    fileName: requiredString(record.fileName, "tên file"),
    fileSizeBytes: positiveInteger(record.fileSizeBytes, "kích thước file"),
    status: status as PatientImportBatch["status"],
    rowCount,
    validCount,
    invalidCount,
    duplicateCount,
    importedCount,
    patientIds,
    rows,
    version: positiveInteger(record.version, "version"),
    expiresAt: isoTimestamp(record.expiresAt, "thời điểm hết hạn"),
    committedAt: isoTimestamp(
      record.committedAt,
      "thời điểm commit",
      status !== "committed",
    ),
    createdAt: isoTimestamp(record.createdAt, "thời điểm tạo"),
    updatedAt: isoTimestamp(record.updatedAt, "thời điểm cập nhật"),
  };
}

function requireBatchWorkspace(
  batch: PatientImportBatch,
  expectedWorkspaceId: string,
) {
  if (!expectedWorkspaceId || batch.organizationId !== expectedWorkspaceId) {
    throw new Error("Batch import không thuộc workspace hiện tại.");
  }
  return batch;
}

function requireBatchIdentity(
  batch: PatientImportBatch,
  expectation: PatientImportBatchExpectation,
) {
  requireBatchWorkspace(batch, expectation.workspaceId);
  if (batch.id !== expectation.batchId) {
    throw new Error("Backend chưa xác nhận đúng batch import hiện tại.");
  }
  if (batch.version < expectation.minimumVersion) {
    throw new Error("Backend trả về version cũ hơn batch import đang hiển thị.");
  }
  return batch;
}

export function parsePatientImportValidationOutcome(
  response: unknown,
  expectation: PatientImportValidationExpectation,
) {
  const record = recordOf(response);
  if (typeof record.replayed !== "boolean") {
    throw new Error("Phản hồi validate import thiếu trạng thái replayed.");
  }
  const batch = requireBatchWorkspace(
    parsePatientImportBatch(record.batch),
    expectation.workspaceId,
  );
  if (
    batch.fileName !== expectation.fileName ||
    batch.fileSizeBytes !== expectation.fileSizeBytes
  ) {
    throw new Error("Backend chưa xác nhận đúng file đã chọn để import.");
  }
  if (batch.status === "committed") {
    throw new Error("Validate import không được trả về batch đã commit.");
  }
  return { batch, replayed: record.replayed };
}

export function parsePatientImportDetail(
  response: unknown,
  expectation: PatientImportBatchExpectation,
) {
  return requireBatchIdentity(
    parsePatientImportBatch(recordOf(response).batch),
    expectation,
  );
}

export function parsePatientImportCommitOutcome(
  response: unknown,
  expectation: PatientImportBatchExpectation,
) {
  const record = recordOf(response);
  if (typeof record.replayed !== "boolean") {
    throw new Error("Phản hồi commit import thiếu trạng thái replayed.");
  }
  const batch = requireBatchIdentity(
    parsePatientImportBatch(record.batch),
    expectation,
  );
  if (batch.status !== "committed") {
    throw new Error("Backend chưa xác nhận đúng batch import đã commit.");
  }
  if (batch.version <= expectation.minimumVersion) {
    throw new Error(
      "Backend chưa xác nhận version mới hơn sau khi commit batch import.",
    );
  }
  const importedCount = nonNegativeInteger(
    record.importedCount,
    "số hồ sơ commit",
  );
  if (!Array.isArray(record.patientIds)) {
    throw new Error("Phản hồi commit import thiếu patientIds.");
  }
  const patientIds = record.patientIds.map((item) =>
    requiredString(item, "patientId commit"),
  );
  if (
    importedCount !== batch.importedCount ||
    JSON.stringify(patientIds) !== JSON.stringify(batch.patientIds)
  ) {
    throw new Error("Kết quả commit import mâu thuẫn với batch canonical.");
  }
  return { batch, importedCount, patientIds, replayed: record.replayed };
}

export function createPatientImportIdempotencyKey(
  operation: "validate" | "commit",
  target = "batch",
) {
  const safeTarget = target.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-") || "batch";
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `portal-patient-import-${operation}-${safeTarget}-${nonce}`;
}
