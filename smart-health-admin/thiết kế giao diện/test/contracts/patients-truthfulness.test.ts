import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const patientsPath = new URL("../../src/components/admin/Patients.tsx", import.meta.url);
const editorPath = new URL(
  "../../src/components/admin/dialogs/AddPatientDialog.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("does not infer clinical risk or render seeded patient activity", async () => {
  const source = await readFile(patientsPath, "utf8");

  for (const syntheticValue of [
    "riskFromPatient",
    "conditionFromAiLabel",
    "AI confidence 94%",
    "Hôm nay 09:12",
    "18/05/2026",
    "Consent chia sẻ hồ sơ",
    "Smart Health Clinic",
    "Đang có quyền",
  ]) {
    assert.doesNotMatch(source, new RegExp(syntheticValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(source, /filterRisk|filterCondition|getRiskBadge|<Timeline/);
});

test("removes patient controls that have no canonical backend mutation", async () => {
  const source = await readFile(patientsPath, "utf8");

  for (const deadControl of [
    "Lịch sử đo",
    "Đơn thuốc",
    "Cấp quyền",
    "Thu hồi quyền",
    "Link chia sẻ",
    "Export",
  ]) {
    assert.doesNotMatch(source, new RegExp(deadControl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("renders only backend-confirmed patient and scan summary fields", async () => {
  const source = await readFile(patientsPath, "utf8");

  assert.match(source, /lastScanAt:\s*patient\.lastScanAt/);
  assert.match(source, /lastSignalLabel:\s*patient\.lastAiLabel/);
  assert.match(source, /scanCount:\s*normalizeScanCount\(patient\.scanCount\)/);
  assert.match(source, /Không có dữ liệu lượt đo từ backend/);
  assert.match(source, /Nhãn xử lý do backend trả về, không phải chẩn đoán/);
  assert.match(source, /Không thể hiển thị danh sách vì backend chưa phản hồi/);
  assert.match(source, /Backend chưa trả về hồ sơ bệnh nhân nào/);

  assert.doesNotMatch(
    source,
    /patient\.lastScanAt\s*\|\|\s*patient\.updatedAt\s*\|\|\s*patient\.createdAt/,
  );
  assert.doesNotMatch(source, /patient\.address\s*\|\|\s*patient\.notes/);
  assert.doesNotMatch(
    source,
    /patient\.doctorName\s*\|\|\s*patient\.primaryDoctorId\s*\|\|\s*patient\.ownerUserId/,
  );
});

test("never substitutes the display patient code for the canonical resource id", async () => {
  const source = await readFile(patientsPath, "utf8");

  assert.match(source, /id:\s*patient\.id/);
  assert.match(source, /patientCode:\s*patient\.patientCode/);
  assert.match(source, /deletePatient\(deleteTarget\.id/);
  assert.match(source, /parsePatientDeleteOutcome\(response, deleteTarget\.id\)/);
  assert.doesNotMatch(source, /id:\s*patient\.patientCode\s*\|\|\s*patient\.id/);
});

test("patient editor sends structured fields and guards unsafe dismissal", async () => {
  const [editor, api] = await Promise.all([
    readFile(editorPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  for (const field of [
    "dateOfBirth",
    "patientCode",
    "bloodType",
    "allergies",
    "emergencyContact",
  ]) {
    assert.match(editor, new RegExp(field));
  }
  assert.match(editor, /resolvePatientOperationAttempt/);
  assert.match(editor, /parsePatientMutationOutcome/);
  assert.match(editor, /ConfirmActionDialog/);
  assert.match(editor, /htmlFor=\{id\}/);
  assert.doesNotMatch(editor, /CCCD:|Nhóm máu:|Dị ứng:/);
  assert.match(api, /async updatePatient/);
  assert.match(api, /async deletePatient/);
  assert.match(api, /"Idempotency-Key"/);
});
