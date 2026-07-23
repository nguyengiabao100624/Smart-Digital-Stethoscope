import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePatientDeleteOutcome,
  parsePatientListResponse,
  parsePatientMutationOutcome,
  resolvePatientOperationAttempt,
  type PatientMutationIntent,
} from "../../src/lib/patient-operations.ts";

const intent: PatientMutationIntent = {
  patientId: "pat_canonical_1",
  name: "Nguyễn Văn An",
  patientCode: "HS-001",
  dateOfBirth: "1990-04-12",
  gender: "male",
  phone: "0901234567",
  email: "AN@example.com",
  address: "Đà Nẵng",
  bloodType: "o+",
  allergies: ["penicillin", "hải sản", "penicillin"],
  emergencyContact: {
    name: "Nguyễn Thị Bình",
    phone: "0907654321",
    relationship: "Vợ",
  },
  notes: "Theo dõi định kỳ",
};

const canonicalPatient = {
  id: "pat_canonical_1",
  patientCode: "HS-001",
  name: "Nguyễn Văn An",
  dateOfBirth: "1990-04-12",
  age: 36,
  gender: "male",
  phone: "0901234567",
  email: "an@example.com",
  address: "Đà Nẵng",
  bloodType: "O+",
  allergies: ["penicillin", "hải sản"],
  emergencyContact: {
    name: "Nguyễn Thị Bình",
    phone: "0907654321",
    relationship: "Vợ",
  },
  notes: "Theo dõi định kỳ",
  scanCount: 0,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

test("keeps canonical patient id separate from the display patient code", () => {
  const patients = parsePatientListResponse({ patients: [canonicalPatient] });
  assert.equal(patients[0].id, "pat_canonical_1");
  assert.equal(patients[0].patientCode, "HS-001");
  assert.notEqual(patients[0].id, patients[0].patientCode);
});

test("rejects malformed or duplicate patient list identities", () => {
  assert.throws(() => parsePatientListResponse({}), /thiếu danh sách canonical/);
  assert.throws(
    () => parsePatientListResponse({ patients: [canonicalPatient, canonicalPatient] }),
    /trùng ID canonical/,
  );
  assert.throws(
    () => parsePatientListResponse({ patients: [{ ...canonicalPatient, id: "" }] }),
    /ID canonical/,
  );
});

test("accepts a mutation only when every submitted structured field is confirmed", () => {
  const outcome = parsePatientMutationOutcome(
    { patient: canonicalPatient, replayed: false },
    intent,
  );
  assert.equal(outcome.patient.id, intent.patientId);
  assert.equal(outcome.replayed, false);

  assert.throws(
    () =>
      parsePatientMutationOutcome(
        {
          patient: {
            ...canonicalPatient,
            emergencyContact: { ...canonicalPatient.emergencyContact, phone: "00000000" },
          },
          replayed: false,
        },
        intent,
      ),
    /liên hệ khẩn cấp/,
  );
});

test("requires a delete receipt for the exact canonical patient id", () => {
  assert.deepEqual(
    parsePatientDeleteOutcome(
      { deleted: true, patientId: "pat_canonical_1", replayed: false },
      "pat_canonical_1",
    ),
    { deleted: true, patientId: "pat_canonical_1", replayed: false },
  );
  assert.throws(
    () =>
      parsePatientDeleteOutcome(
        { deleted: true, patientId: "HS-001", replayed: false },
        "pat_canonical_1",
      ),
    /khác ID canonical/,
  );
});

test("reuses one idempotency key only for an unchanged patient intent", () => {
  const first = resolvePatientOperationAttempt(null, "update", intent);
  const replay = resolvePatientOperationAttempt(first, "update", { ...intent });
  const changed = resolvePatientOperationAttempt(first, "update", {
    ...intent,
    phone: "0911111111",
  });
  assert.equal(replay.idempotencyKey, first.idempotencyKey);
  assert.notEqual(changed.idempotencyKey, first.idempotencyKey);
});

test("allows backend-generated patient codes only for create intents that omit one", () => {
  const createIntent = { ...intent, patientId: undefined, patientCode: "" };
  const outcome = parsePatientMutationOutcome(
    {
      patient: { ...canonicalPatient, id: "pat_generated", patientCode: "PAT-20260723" },
      replayed: false,
    },
    createIntent,
  );
  assert.equal(outcome.patient.patientCode, "PAT-20260723");
});
