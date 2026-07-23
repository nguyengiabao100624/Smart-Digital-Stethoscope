const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PATIENT_IMPORT_MAX_BYTES,
  validatePatientImportCsv,
} = require("../src/patientImportContract");

const now = new Date("2026-07-23T00:00:00.000Z");

test("parses UTF-8 Vietnamese aliases, quotes and structured fields", () => {
  const csv = [
    "Họ tên,Mã bệnh nhân,Ngày sinh,Giới tính,Số điện thoại,Email,Nhóm máu,Dị ứng,Ten lien he khan cap,SDT lien he khan cap,Quan he lien he khan cap",
    '"Nguyễn, An",BN-001,1990-02-03,Nam,0901234567,AN@EXAMPLE.COM,O+,penicillin;bụi,Nguyễn Bình,0912345678,Anh trai',
  ].join("\r\n");
  const result = validatePatientImportCsv(Buffer.from(`\uFEFF${csv}`, "utf8"), { now });
  assert.equal(result.status, "validated");
  assert.equal(result.rowCount, 1);
  assert.deepEqual(result.rows[0].patient, {
    patientCode: "BN-001",
    name: "Nguyễn, An",
    dateOfBirth: "1990-02-03",
    gender: "male",
    phone: "0901234567",
    email: "an@example.com",
    address: "",
    bloodType: "O+",
    allergies: ["penicillin", "bụi"],
    emergencyContact: { name: "Nguyễn Bình", phone: "0912345678", relationship: "Anh trai" },
    notes: "",
    profileType: "patient",
  });
});

test("reports validation and duplicate issues without creating partial success", () => {
  const csv = [
    "name,patientCode,dateOfBirth,phone,email,bloodType",
    "An,BN-001,2030-01-01,0901234567,an@example.com,X+",
    "Bình,BN-001,1991-02-03,0901234567,bad-email,A+",
    "Chi,BN-003,1992-03-04,0912345678,existing@example.com,B+",
  ].join("\n");
  const result = validatePatientImportCsv(Buffer.from(csv), {
    now,
    existingPatients: [{ id: "pat_existing", patientCode: "OLD", email: "existing@example.com" }],
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.rowCount, 3);
  assert.equal(result.invalidCount, 3);
  assert.equal(result.duplicateCount, 3);
  assert.ok(result.rows[0].issues.some((item) => item.code === "PATIENT_IMPORT_DOB_INVALID"));
  assert.ok(result.rows[0].issues.some((item) => item.code === "PATIENT_IMPORT_DUPLICATE_FILE"));
  assert.ok(result.rows[1].issues.some((item) => item.code === "PATIENT_IMPORT_EMAIL_INVALID"));
  assert.ok(result.rows[2].issues.some((item) => item.code === "PATIENT_IMPORT_DUPLICATE_EXISTING"));
});

test("generates stable patient codes for blank codes", () => {
  const source = Buffer.from("name,dateOfBirth\nAn,1990-01-02\nBình,1991-02-03", "utf8");
  const first = validatePatientImportCsv(source, { now });
  const second = validatePatientImportCsv(source, { now });
  assert.equal(first.rows[0].patient.patientCode, second.rows[0].patient.patientCode);
  assert.notEqual(first.rows[0].patient.patientCode, first.rows[1].patient.patientCode);
});

test("rejects invalid UTF-8, oversized files and more than 5000 rows", () => {
  assert.throws(
    () => validatePatientImportCsv(Buffer.from([0xc3, 0x28])),
    (error) => error.code === "PATIENT_IMPORT_UTF8_REQUIRED" && error.status === 400,
  );
  assert.throws(
    () => validatePatientImportCsv(Buffer.alloc(PATIENT_IMPORT_MAX_BYTES + 1, 65)),
    (error) => error.code === "PATIENT_IMPORT_FILE_TOO_LARGE" && error.status === 413,
  );
  const tooMany = `name\n${Array.from({ length: 5001 }, (_, index) => `Patient ${index}`).join("\n")}`;
  assert.throws(
    () => validatePatientImportCsv(Buffer.from(tooMany)),
    (error) => error.code === "PATIENT_IMPORT_TOO_MANY_ROWS" && error.details.maxRows === 5000,
  );
});

test("rejects malformed CSV and missing canonical name header", () => {
  assert.throws(
    () => validatePatientImportCsv(Buffer.from('name,email\n"Unclosed,test@example.com')),
    (error) => error.code === "PATIENT_IMPORT_CSV_MALFORMED",
  );
  assert.throws(
    () => validatePatientImportCsv(Buffer.from("phone,email\n0901234567,a@example.com")),
    (error) => error.code === "PATIENT_IMPORT_NAME_HEADER_REQUIRED",
  );
});
