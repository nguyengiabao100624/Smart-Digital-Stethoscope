import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePatientDeleteOutcome,
  parsePatientDetailResponse,
  parsePatientListResponse,
  parsePatientMutationOutcome,
  parsePatientScanHistoryResponse,
  resolvePatientOperationAttempt,
  type PatientMutationIntent,
} from "../../src/lib/patient-operations.ts";
import {
  patientIntentFromForm,
  validatePatientForm,
} from "../../src/lib/patient-form.ts";

const intent: PatientMutationIntent = {
  patientId: "pat_01",
  name: "Trần Minh Anh",
  patientCode: "HS-900",
  dateOfBirth: "1988-11-02",
  gender: "female",
  phone: "0901112233",
  email: "ANH@example.com",
  address: "Huế",
  bloodType: "ab+",
  allergies: ["latex", "bụi", "latex"],
  emergencyContact: {
    name: "Trần Văn Bình",
    phone: "0909988776",
    relationship: "Anh trai",
  },
  notes: "Theo dõi huyết áp",
};

const patient = {
  id: "pat_01",
  organizationId: "workspace-a",
  patientCode: "HS-900",
  name: "Trần Minh Anh",
  dateOfBirth: "1988-11-02",
  age: 37,
  gender: "female",
  phone: "0901112233",
  email: "anh@example.com",
  address: "Huế",
  bloodType: "AB+",
  allergies: ["latex", "bụi"],
  emergencyContact: {
    name: "Trần Văn Bình",
    phone: "0909988776",
    relationship: "Anh trai",
  },
  notes: "Theo dõi huyết áp",
  scanCount: 0,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

test("parses list and detail with canonical id separate from patient code", () => {
  const list = parsePatientListResponse({ patients: [patient] }, "workspace-a");
  const detail = parsePatientDetailResponse({ patient }, "workspace-a");
  assert.equal(list[0].id, "pat_01");
  assert.equal(list[0].patientCode, "HS-900");
  assert.equal(detail.id, "pat_01");
  assert.notEqual(detail.id, detail.patientCode);
});

test("fails closed when a patient snapshot does not belong to the active workspace", () => {
  assert.throws(
    () =>
      parsePatientListResponse(
        {
          patients: [
            { ...patient, organizationId: "workspace-b", name: "Tenant B" },
          ],
        },
        "workspace-a",
      ),
    /workspace hiện tại/,
  );
  assert.throws(
    () =>
      parsePatientDetailResponse(
        { patient: { ...patient, organizationId: "" } },
        "workspace-a",
      ),
    /workspace hiện tại/,
  );
});

test("accepts scan history only when workspace and patient identity both match", () => {
  const valid = parsePatientScanHistoryResponse(
    {
      scans: [
        {
          id: "scan_01",
          organizationId: "workspace-a",
          patientId: "pat_01",
          status: "completed",
        },
      ],
    },
    "workspace-a",
    "pat_01",
  );
  assert.equal(valid.scans[0].id, "scan_01");
  assert.throws(
    () =>
      parsePatientScanHistoryResponse(
        {
          scans: [
            {
              id: "scan_02",
              organizationId: "workspace-b",
              patientId: "pat_01",
            },
          ],
        },
        "workspace-a",
        "pat_01",
      ),
    /nguồn lượt đo/,
  );
  assert.throws(
    () =>
      parsePatientScanHistoryResponse(
        {
          scans: [
            {
              id: "scan_03",
              organizationId: "workspace-a",
              patientId: "pat_other",
            },
          ],
        },
        "workspace-a",
        "pat_01",
      ),
    /nguồn lượt đo/,
  );
});

test("rejects duplicated identities and malformed clinical fields", () => {
  assert.throws(
    () =>
      parsePatientListResponse(
        { patients: [patient, patient] },
        "workspace-a",
      ),
    /trùng ID/,
  );
  assert.throws(
    () =>
      parsePatientDetailResponse({
        patient: { ...patient, allergies: "latex" },
      }, "workspace-a"),
    /danh sách dị ứng/,
  );
});

test("validates exact structured mutation and delete receipts", () => {
  const saved = parsePatientMutationOutcome(
    { patient, replayed: false },
    intent,
  );
  assert.equal(saved.patient.id, "pat_01");
  assert.throws(
    () =>
      parsePatientMutationOutcome(
        { patient: { ...patient, bloodType: "O+" }, replayed: false },
        intent,
      ),
    /bloodType/,
  );

  assert.deepEqual(
    parsePatientDeleteOutcome(
      { deleted: true, patientId: "pat_01", replayed: true },
      "pat_01",
    ),
    { deleted: true, patientId: "pat_01", replayed: true },
  );
  assert.throws(
    () =>
      parsePatientDeleteOutcome(
        { deleted: true, patientId: "HS-900", replayed: false },
        "pat_01",
      ),
    /khác ID canonical/,
  );
});

test("keeps the same key for retry and rotates it after form changes", () => {
  const first = resolvePatientOperationAttempt(null, "update", intent);
  const retry = resolvePatientOperationAttempt(first, "update", { ...intent });
  const changed = resolvePatientOperationAttempt(first, "update", {
    ...intent,
    notes: "Nội dung mới",
  });
  assert.equal(retry.idempotencyKey, first.idempotencyKey);
  assert.notEqual(changed.idempotencyKey, first.idempotencyKey);
});

test("validates DOB, phone, email and all-or-none emergency contact fields", () => {
  const form = {
    name: "Người bệnh",
    patientCode: "",
    dateOfBirth: "2035-02-30",
    gender: "male",
    phone: "123",
    email: "invalid",
    address: "",
    bloodType: "",
    allergies: "penicillin, penicillin\nhải sản",
    emergencyName: "Người nhà",
    emergencyPhone: "",
    emergencyRelationship: "",
    notes: "",
  };
  const errors = validatePatientForm(form);
  assert.ok(errors.dateOfBirth);
  assert.ok(errors.phone);
  assert.ok(errors.email);
  assert.ok(errors.emergencyPhone);
  assert.ok(errors.emergencyRelationship);
  assert.deepEqual(patientIntentFromForm(form).allergies, [
    "penicillin",
    "hải sản",
  ]);
});
