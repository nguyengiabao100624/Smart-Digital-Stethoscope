import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const doctorsPath = new URL("../../src/components/admin/Doctors.tsx", import.meta.url);
const inviteDialogPath = new URL(
  "../../src/components/admin/dialogs/AddDoctorDialog.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("doctor list delegates filters and pagination to the real API without fabricating activity", async () => {
  const source = await readFile(doctorsPath, "utf8");
  const api = await readFile(apiPath, "utf8");

  assert.match(source, /smartHealthApi\.listApprovedDoctors\(\{/);
  assert.match(source, /status: filterStatus === "all" \? undefined : filterStatus/);
  assert.match(source, /specialty: filterSpecialty === "all" \? undefined : filterSpecialty/);
  assert.match(source, /clinic: filterClinic === "all" \? undefined : filterClinic/);
  assert.match(source, /response\.facets\?\.specialties/);
  assert.match(source, /response\.pagination/);
  assert.match(api, /X-Total-Count/);
  assert.match(source, /patientsCount: user\.patientsCount \?\? null/);
  assert.match(source, /formatOptionalMetric/);
  assert.doesNotMatch(source, /patientsCount: 0|measurementsCount: 0/);
  assert.doesNotMatch(source, /value="cardio"|value="tamanh"|PK Đa khoa Tâm Anh/);
  assert.doesNotMatch(source, /animate-pulse/);
});

test("doctor detail removes synthetic audit, assignment and dead edit controls", async () => {
  const source = await readFile(doctorsPath, "utf8");

  assert.doesNotMatch(source, /145 hồ sơ|Audit timeline|Cập nhật quyền truy cập/);
  assert.doesNotMatch(source, />\s*Gán phòng khám\s*</);
  assert.doesNotMatch(source, />\s*Gán bệnh nhân\s*</);
  assert.doesNotMatch(source, />\s*Chỉnh sửa\s*</);
  assert.doesNotMatch(source, /Timeline/);
});

test("doctor active states use the accessible success text token", async () => {
  const source = await readFile(doctorsPath, "utf8");

  assert.match(source, /bg-success\/10 text-success-foreground/);
  assert.doesNotMatch(source, /text-success(?:\s|")/);
});

test("Firebase action is a report-only reconciliation with canonical parsing", async () => {
  const [source, apiSource] = await Promise.all([
    readFile(doctorsPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(source, /Đối soát Firebase/);
  assert.match(source, /parseFirebaseReconciliationOutcome/);
  assert.doesNotMatch(source, /Đã đồng bộ Firebase|Xóa \$\{deletedCount\}/);
  assert.match(apiSource, /SmartHealthFirebaseReconciliation/);
});

test("doctor creation UI is a retry-safe staff invitation workflow", async () => {
  const [source, apiSource] = await Promise.all([
    readFile(inviteDialogPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(source, /Mời bác sĩ/);
  assert.match(source, /createStaffInvitation/);
  assert.match(source, /parseStaffInvitationOutcome/);
  assert.match(source, /attemptRef\.current\?\.fingerprint === fingerprint/);
  assert.match(source, /catalogError/);
  assert.match(source, /Tải lại danh mục/);
  assert.match(source, /if \(isSubmitting\) return/);
  assert.doesNotMatch(source, /smartHealthApi\.createDoctor|Đã tạo tài khoản bác sĩ/);
  assert.doesNotMatch(apiSource, /async createDoctor\(/);
  assert.match(apiSource, /async createStaffInvitation\(/);
  assert.match(apiSource, /async resendStaffInvitation\(/);
  assert.match(apiSource, /async revokeStaffInvitation\(/);
  assert.doesNotMatch(apiSource, /async acceptStaffInvitation\(/);
  assert.match(apiSource, /\/admin\/staff-invitations/);
  assert.match(apiSource, /"Idempotency-Key": idempotencyKey/);
});

test("platform-only doctor identity controls are not exposed to workspace staff managers", async () => {
  const source = await readFile(doctorsPath, "utf8");

  assert.match(source, /canManagePlatformUsers &&/);
  assert.match(source, /assertDoctorAccountStateOutcome/);
  assert.match(source, /assertDoctorDeleteOutcome/);
  assert.match(source, /confirmError/);
  assert.match(source, /isConfirming/);
});
