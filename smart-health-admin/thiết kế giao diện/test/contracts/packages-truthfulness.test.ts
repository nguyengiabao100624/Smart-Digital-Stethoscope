import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packagesPath = new URL("../../src/components/admin/Packages.tsx", import.meta.url);
const dialogPath = new URL(
  "../../src/components/admin/dialogs/CreatePackageDialog.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("package mutations carry Idempotency-Key and validate canonical outcomes", async () => {
  const [api, dialog, packages] = await Promise.all([
    readFile(apiPath, "utf8"),
    readFile(dialogPath, "utf8"),
    readFile(packagesPath, "utf8"),
  ]);

  assert.match(api, /async createPackage\([\s\S]*?idempotencyKey: string/);
  assert.match(api, /async updatePackage\([\s\S]*?idempotencyKey: string/);
  assert.match(api, /async archivePackage\([\s\S]*?idempotencyKey: string/);
  assert.match(api, /headers: \{ "Idempotency-Key": idempotencyKey \}/);
  assert.match(dialog, /parsePackageMutationOutcome/);
  assert.match(packages, /parsePackageMutationOutcome/);
});

test("package UI uses truthful partial, empty, retry, archive and status states", async () => {
  const source = await readFile(packagesPath, "utf8");

  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /Không thể tải số workspace đang sử dụng gói/);
  assert.match(source, /Chưa có gói dịch vụ/);
  assert.match(source, /Thử lại/);
  assert.match(source, /Lưu trữ gói/);
  assert.match(source, /status === "archived"/);
  assert.doesNotMatch(source, /isPopular = pkg\.type === "professional"/);
  assert.doesNotMatch(source, /Quota cần theo dõi/);
});

test("package editor exposes validation and no unsupported diagnosis claim", async () => {
  const source = await readFile(dialogPath, "utf8");

  assert.match(source, /const \[submitError, setSubmitError\]/);
  assert.match(source, /const \[fieldErrors, setFieldErrors\]/);
  assert.match(source, /aria-invalid/);
  assert.match(source, /Thay đổi chưa được lưu/);
  assert.doesNotMatch(source, /aiDiagnosis[^\n]*Chẩn đoán/);
});
