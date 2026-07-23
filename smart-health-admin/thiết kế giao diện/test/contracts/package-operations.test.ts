import assert from "node:assert/strict";
import test from "node:test";

import {
  createPackageOperationIdempotencyKey,
  packageIntentFingerprint,
  parsePackageMutationOutcome,
} from "../../src/lib/package-operations.ts";

const canonicalPackage = {
  id: "pkg_clinic_pro",
  name: "Clinic Pro",
  type: "professional",
  segment: "organization",
  price: 500000,
  currency: "VND",
  duration: "monthly",
  maxDevices: 20,
  maxDoctors: 10,
  maxPatients: 1000,
  storageGb: 200,
  aiMonthly: 2000,
  retentionDays: 365,
  features: { analytics: true },
  status: "active",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

test("accepts an exact canonical package mutation outcome", () => {
  const parsed = parsePackageMutationOutcome({ package: canonicalPackage }, "update", {
    id: canonicalPackage.id,
    name: canonicalPackage.name,
    type: canonicalPackage.type,
    segment: canonicalPackage.segment,
    price: String(canonicalPackage.price),
  });

  assert.equal(parsed.id, canonicalPackage.id);
  assert.equal(parsed.price, canonicalPackage.price);
});

test("rejects malformed or mismatched success responses", () => {
  assert.throws(
    () => parsePackageMutationOutcome({ package: {} }, "create", { name: "Clinic Pro" }),
    /thiếu ID canonical/,
  );
  assert.throws(
    () =>
      parsePackageMutationOutcome({ package: canonicalPackage }, "update", { id: "pkg_different" }),
    /khác thao tác/,
  );
});

test("requires explicit canonical archive confirmation", () => {
  const archivedPackage = { ...canonicalPackage, status: "archived" };
  const parsed = parsePackageMutationOutcome(
    {
      package: archivedPackage,
      archived: true,
      packageId: archivedPackage.id,
    },
    "archive",
    { id: archivedPackage.id },
  );
  assert.equal(parsed.status, "archived");

  assert.throws(
    () =>
      parsePackageMutationOutcome(
        { package: archivedPackage, archived: false, packageId: archivedPackage.id },
        "archive",
        { id: archivedPackage.id },
      ),
    /chưa xác nhận/,
  );
});

test("creates operation-scoped keys and stable intent fingerprints", () => {
  const first = createPackageOperationIdempotencyKey("update", canonicalPackage.id);
  const second = createPackageOperationIdempotencyKey("update", canonicalPackage.id);
  assert.match(first, /^admin-package-update-pkg_clinic_pro-/);
  assert.notEqual(first, second);
  assert.equal(
    packageIntentFingerprint({ name: "Clinic Pro", price: "500000" }),
    packageIntentFingerprint({ price: "500000", name: "Clinic Pro" }),
  );
});
