import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clinicsPath = new URL("../../src/components/admin/Clinics.tsx", import.meta.url);
const dialogPath = new URL(
  "../../src/components/admin/dialogs/AddClinicDialog.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("workspace API carries pagination metadata, optimistic versions, and Idempotency-Key", async () => {
  const source = await readFile(apiPath, "utf8");

  assert.match(
    source,
    /async listClinics\([\s\S]*?q\?: string[\s\S]*?page\?: number[\s\S]*?limit\?: number[\s\S]*?sort\?: string/,
  );
  assert.match(source, /X-Total-Count/);
  assert.match(source, /X-Page-Limit/);
  assert.match(source, /async createClinic\([\s\S]*?idempotencyKey: string/);
  assert.match(
    source,
    /async updateClinic\([\s\S]*?expectedVersion: number[\s\S]*?idempotencyKey: string/,
  );
  assert.match(
    source,
    /async deleteClinic\([\s\S]*?expectedVersion: number[\s\S]*?idempotencyKey: string/,
  );
  assert.match(
    source,
    /async approveWorkspaceOwner\([\s\S]*?expectedVersion: number[\s\S]*?idempotencyKey: string/,
  );
  assert.match(source, /owner-approval/);
  assert.match(source, /headers: \{ "Idempotency-Key": idempotencyKey \}/);
  assert.match(source, /"If-Match": String\(expectedVersion\)/);
});

test("workspace mutations validate canonical receipts before showing success", async () => {
  const [clinics, dialog] = await Promise.all([
    readFile(clinicsPath, "utf8"),
    readFile(dialogPath, "utf8"),
  ]);

  assert.match(clinics, /resolveWorkspaceOperationAttempt/);
  assert.match(clinics, /parseWorkspaceMutationOutcome/);
  assert.match(clinics, /parseWorkspaceArchiveOutcome/);
  assert.match(clinics, /if \(statusActionLoading\) return/);
  assert.match(dialog, /resolveWorkspaceOperationAttempt/);
  assert.match(dialog, /parseWorkspaceMutationOutcome/);
  assert.match(dialog, /attemptRef/);
  assert.match(dialog, /if \(isSubmitting\) return/);
});

test("workspace UI exposes explicit lifecycle dialogs and truthful data states", async () => {
  const source = await readFile(clinicsPath, "utf8");

  for (const copy of [
    "Phê duyệt workspace",
    "Yêu cầu bổ sung hồ sơ",
    "Từ chối yêu cầu workspace",
    "Kích hoạt lại workspace",
    "Tạm ngưng workspace",
    "Lưu trữ workspace",
    "Đang hiển thị dữ liệu gần nhất",
    "Không có kết nối mạng",
    "Bạn không có quyền xem danh sách workspace",
    "Thử lại",
  ]) {
    assert.match(source, new RegExp(copy));
  }

  assert.match(source, /WorkspaceTableSkeleton/);
  assert.match(source, /aria-label="Tìm workspace"/);
  assert.doesNotMatch(source, /Timeline/);
  assert.doesNotMatch(source, /status \|\| "active"/);
  assert.doesNotMatch(source, /doctorCount \|\| 0/);
  assert.doesNotMatch(source, /representative \|\| selectedClinic\.phone/);
});

test("workspace editor has field errors, unsaved-change guard, and pending dismissal guard", async () => {
  const source = await readFile(dialogPath, "utf8");

  assert.match(source, /const \[fieldErrors, setFieldErrors\]/);
  assert.match(source, /const \[discardDialogOpen, setDiscardDialogOpen\]/);
  assert.match(source, /Thay đổi chưa được lưu/);
  assert.match(source, /aria-invalid/);
  assert.match(source, /onEscapeKeyDown/);
  assert.match(source, /onPointerDownOutside/);
  assert.match(source, /disabled=\{isSubmitting\}/);
});
