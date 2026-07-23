const crypto = require("node:crypto");

const PATIENT_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const PATIENT_IMPORT_MAX_ROWS = 5000;
const PATIENT_IMPORT_TTL_MS = 24 * 60 * 60 * 1000;

class PatientImportContractError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "PatientImportContractError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES = new Map(
  Object.entries({
    name: ["name", "fullName", "patientName", "hoTen", "tenBenhNhan"],
    patientCode: ["patientCode", "code", "maBenhNhan", "maHoSo"],
    dateOfBirth: ["dateOfBirth", "dob", "birthDate", "ngaySinh"],
    gender: ["gender", "gioiTinh"],
    phone: ["phone", "phoneNumber", "soDienThoai", "dienThoai"],
    email: ["email", "emailAddress"],
    address: ["address", "diaChi"],
    bloodType: ["bloodType", "bloodGroup", "nhomMau"],
    allergies: ["allergies", "allergy", "diUng"],
    emergencyContactName: ["emergencyContactName", "emergencyName", "tenLienHeKhanCap"],
    emergencyContactPhone: ["emergencyContactPhone", "emergencyPhone", "sdtLienHeKhanCap"],
    emergencyContactRelationship: [
      "emergencyContactRelationship",
      "emergencyRelationship",
      "quanHeLienHeKhanCap",
    ],
    notes: ["notes", "note", "ghiChu"],
  }).flatMap(([canonical, aliases]) =>
    aliases.map((alias) => [normalizeHeader(alias), canonical]),
  ),
);

function contractError(status, code, message, details) {
  throw new PatientImportContractError(status, code, message, details);
}

function decodeUtf8Csv(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    contractError(400, "PATIENT_IMPORT_FILE_REQUIRED", "Cần chọn một file CSV UTF-8");
  }
  if (buffer.byteLength === 0) {
    contractError(422, "PATIENT_IMPORT_FILE_EMPTY", "File CSV đang trống");
  }
  if (buffer.byteLength > PATIENT_IMPORT_MAX_BYTES) {
    contractError(
      413,
      "PATIENT_IMPORT_FILE_TOO_LARGE",
      "File CSV vượt quá giới hạn 5 MB",
      { maxBytes: PATIENT_IMPORT_MAX_BYTES },
    );
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    contractError(400, "PATIENT_IMPORT_UTF8_REQUIRED", "File CSV phải dùng mã hóa UTF-8 hợp lệ");
  }
}

function parseCsvRecords(text) {
  const records = [];
  let record = [];
  let value = "";
  let quoted = false;
  let rowNumber = 1;
  let recordStart = 1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
        if (char === "\n") rowNumber += 1;
      }
      continue;
    }

    if (char === '"') {
      if (value.length > 0) {
        contractError(422, "PATIENT_IMPORT_CSV_MALFORMED", "Dấu ngoặc kép CSV không hợp lệ", {
          row: rowNumber,
        });
      }
      quoted = true;
    } else if (char === ",") {
      record.push(value.trim());
      value = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(value.trim());
      value = "";
      if (record.some((cell) => cell !== "")) records.push({ rowNumber: recordStart, cells: record });
      record = [];
      rowNumber += 1;
      recordStart = rowNumber;
    } else {
      value += char;
    }
  }

  if (quoted) {
    contractError(422, "PATIENT_IMPORT_CSV_MALFORMED", "File CSV có trường trích dẫn chưa đóng", {
      row: recordStart,
    });
  }
  record.push(value.trim());
  if (record.some((cell) => cell !== "")) records.push({ rowNumber: recordStart, cells: record });
  return records;
}

function issue(field, code, message, severity = "error") {
  return { field, code, message, severity };
}

function normalizeGender(value, issues) {
  const normalized = normalizeHeader(value);
  if (!normalized) return "";
  const genders = {
    male: "male",
    nam: "male",
    female: "female",
    nu: "female",
    other: "other",
    khac: "other",
    unknown: "unknown",
    khongxacdinh: "unknown",
  };
  if (!genders[normalized]) {
    issues.push(issue("gender", "PATIENT_IMPORT_GENDER_INVALID", "Giới tính không hợp lệ"));
    return "";
  }
  return genders[normalized];
}

function normalizeDate(value, issues, now) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    issues.push(issue("dateOfBirth", "PATIENT_IMPORT_DOB_INVALID", "Ngày sinh phải có dạng YYYY-MM-DD"));
    return "";
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw || date > now) {
    issues.push(issue("dateOfBirth", "PATIENT_IMPORT_DOB_INVALID", "Ngày sinh không hợp lệ"));
    return "";
  }
  if (date.getUTCFullYear() < 1900) {
    issues.push(issue("dateOfBirth", "PATIENT_IMPORT_DOB_RANGE", "Ngày sinh phải từ năm 1900 trở đi"));
    return "";
  }
  return raw;
}

function normalizePhone(value, field, issues) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!/^\+?[\d\s().-]+$/.test(raw) || digits.length < 7 || digits.length > 15) {
    issues.push(issue(field, "PATIENT_IMPORT_PHONE_INVALID", "Số điện thoại không hợp lệ"));
    return "";
  }
  return raw.slice(0, 40);
}

function normalizeEmail(value, issues) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    issues.push(issue("email", "PATIENT_IMPORT_EMAIL_INVALID", "Email không hợp lệ"));
    return "";
  }
  return raw;
}

function normalizeBloodType(value, issues) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "UNKNOWN" || normalizeHeader(raw) === "khongxacdinh") return "unknown";
  if (!["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(raw)) {
    issues.push(issue("bloodType", "PATIENT_IMPORT_BLOOD_TYPE_INVALID", "Nhóm máu không hợp lệ"));
    return "";
  }
  return raw;
}

function duplicateKeys(patient) {
  const keys = [];
  const patientCode = String(patient.patientCode || "").trim().toLowerCase();
  const email = String(patient.email || "").trim().toLowerCase();
  const phone = String(patient.phone || "").replace(/\D/g, "");
  if (patientCode) keys.push(["patientCode", patientCode]);
  if (email) keys.push(["email", email]);
  if (phone) keys.push(["phone", phone]);
  return keys;
}

function validatePatientImportCsv(buffer, options = {}) {
  const text = decodeUtf8Csv(buffer);
  const records = parseCsvRecords(text);
  if (records.length < 2) {
    contractError(422, "PATIENT_IMPORT_NO_ROWS", "File CSV phải có tiêu đề và ít nhất một dòng dữ liệu");
  }
  const [headerRecord, ...dataRecords] = records;
  if (dataRecords.length > PATIENT_IMPORT_MAX_ROWS) {
    contractError(
      422,
      "PATIENT_IMPORT_TOO_MANY_ROWS",
      "File CSV vượt quá giới hạn 5.000 dòng dữ liệu",
      { maxRows: PATIENT_IMPORT_MAX_ROWS, rowCount: dataRecords.length },
    );
  }

  const canonicalHeaders = headerRecord.cells.map((header) => HEADER_ALIASES.get(normalizeHeader(header)) || "");
  if (!canonicalHeaders.includes("name")) {
    contractError(422, "PATIENT_IMPORT_NAME_HEADER_REQUIRED", "File CSV thiếu cột name (họ tên)");
  }
  const duplicateHeaders = canonicalHeaders.filter(
    (header, index) => header && canonicalHeaders.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    contractError(422, "PATIENT_IMPORT_DUPLICATE_HEADER", "File CSV có cột bị lặp", {
      fields: Array.from(new Set(duplicateHeaders)),
    });
  }

  const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const rows = dataRecords.map((record, index) => {
    const raw = Object.fromEntries(
      canonicalHeaders.flatMap((header, columnIndex) =>
        header ? [[header, record.cells[columnIndex] || ""]] : [],
      ),
    );
    const issues = [];
    const name = String(raw.name || "").trim().slice(0, 160);
    if (!name) issues.push(issue("name", "PATIENT_IMPORT_NAME_REQUIRED", "Họ tên là bắt buộc"));
    const patientCode = String(raw.patientCode || "").trim().slice(0, 80) ||
      `PAT-${fileSha256.slice(0, 6).toUpperCase()}-${String(index + 1).padStart(4, "0")}`;
    const emergencyContact = {
      name: String(raw.emergencyContactName || "").trim().slice(0, 160),
      phone: normalizePhone(raw.emergencyContactPhone, "emergencyContact.phone", issues),
      relationship: String(raw.emergencyContactRelationship || "").trim().slice(0, 80),
    };
    const hasEmergencyContact = Object.values(emergencyContact).some(Boolean);
    if (hasEmergencyContact && !Object.values(emergencyContact).every(Boolean)) {
      issues.push(
        issue(
          "emergencyContact",
          "PATIENT_IMPORT_EMERGENCY_CONTACT_INCOMPLETE",
          "Liên hệ khẩn cấp cần đủ họ tên, số điện thoại và quan hệ",
        ),
      );
    }
    const patient = {
      patientCode,
      name,
      dateOfBirth: normalizeDate(raw.dateOfBirth, issues, now),
      gender: normalizeGender(raw.gender, issues),
      phone: normalizePhone(raw.phone, "phone", issues),
      email: normalizeEmail(raw.email, issues),
      address: String(raw.address || "").trim().slice(0, 240),
      bloodType: normalizeBloodType(raw.bloodType, issues),
      allergies: String(raw.allergies || "")
        .split(/[;|]/)
        .map((value) => value.trim().slice(0, 160))
        .filter(Boolean)
        .filter((value, allergyIndex, all) => all.indexOf(value) === allergyIndex)
        .slice(0, 100),
      emergencyContact: hasEmergencyContact ? emergencyContact : {},
      notes: String(raw.notes || "").trim().slice(0, 2000),
      profileType: "patient",
    };
    return { rowNumber: record.rowNumber, patient, issues };
  });

  const existingKeyOwners = new Map();
  for (const patient of options.existingPatients || []) {
    for (const [field, value] of duplicateKeys(patient)) existingKeyOwners.set(`${field}:${value}`, patient.id || "existing");
  }
  const fileKeyOwners = new Map();
  for (const row of rows) {
    for (const [field, value] of duplicateKeys(row.patient)) {
      const key = `${field}:${value}`;
      if (existingKeyOwners.has(key)) {
        row.issues.push(
          issue(field, "PATIENT_IMPORT_DUPLICATE_EXISTING", `${field} đã tồn tại trong workspace`),
        );
      }
      const previous = fileKeyOwners.get(key);
      if (previous) {
        row.issues.push(issue(field, "PATIENT_IMPORT_DUPLICATE_FILE", `${field} bị lặp trong file`));
        const previousRow = rows.find((candidate) => candidate.rowNumber === previous);
        if (previousRow && !previousRow.issues.some((item) => item.field === field && item.code === "PATIENT_IMPORT_DUPLICATE_FILE")) {
          previousRow.issues.push(issue(field, "PATIENT_IMPORT_DUPLICATE_FILE", `${field} bị lặp trong file`));
        }
      } else {
        fileKeyOwners.set(key, row.rowNumber);
      }
    }
  }

  const invalidRows = rows.filter((row) => row.issues.some((item) => item.severity === "error"));
  const duplicateRows = rows.filter((row) => row.issues.some((item) => item.code.includes("DUPLICATE")));
  return {
    fileName: String(options.fileName || "patients.csv").trim().slice(0, 240) || "patients.csv",
    fileSizeBytes: buffer.byteLength,
    fileSha256,
    status: invalidRows.length > 0 ? "invalid" : "validated",
    rowCount: rows.length,
    validCount: rows.length - invalidRows.length,
    invalidCount: invalidRows.length,
    duplicateCount: duplicateRows.length,
    rows: rows.map((row) => ({
      ...row,
      status: row.issues.some((item) => item.severity === "error") ? "invalid" : "valid",
    })),
  };
}

module.exports = {
  PATIENT_IMPORT_MAX_BYTES,
  PATIENT_IMPORT_MAX_ROWS,
  PATIENT_IMPORT_TTL_MS,
  PatientImportContractError,
  decodeUtf8Csv,
  parseCsvRecords,
  validatePatientImportCsv,
};
