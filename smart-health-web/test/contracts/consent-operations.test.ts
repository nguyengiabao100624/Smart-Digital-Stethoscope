import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePatientShareCreateResponse,
  parsePatientShareListResponse,
  parsePatientShareRevokeResponse,
  parseShareTargetsResponse,
} from "../../src/lib/consent-operations.ts";

function share(overrides: Record<string, unknown> = {}) {
  return {
    id: "share-1",
    patientId: "patient-1",
    doctorUserId: "doctor-1",
    scope: "patient_profile",
    scanIds: [],
    accessLevel: "read",
    purpose: "",
    consentedAt: "",
    active: true,
    authorityType: "clinician_access_grant",
    status: "active",
    recipient: {
      id: "doctor-1",
      type: "doctor",
      name: "BS An",
      workspaceId: "workspace-a",
    },
    audit: {
      grantedByUserId: "admin-1",
      grantedAt: "2026-07-29T02:00:00.000Z",
      revokedByUserId: "",
      revokedAt: "",
    },
    createdAt: "2026-07-29T02:00:00.000Z",
    updatedAt: "2026-07-29T02:00:00.000Z",
    ...overrides,
  };
}

test("patient data access ledger is bound to workspace and patient", () => {
    const result = parsePatientShareListResponse(
      {
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-a",
        patientId: "patient-1",
        shares: [share()],
      },
      {
        workspaceId: "workspace-a",
        patientId: "patient-1",
      },
    );

    assert.equal(result.shares[0].id, "share-1");
    assert.equal(result.shares[0].authorityType, "clinician_access_grant");
    assert.equal(result.shares[0].status, "active");
    assert.equal(result.shares[0].active, true);
});

test("patient data access rejects stale ledgers and contradictory lifecycle", () => {
    assert.throws(() => {
      parsePatientShareListResponse(
        {
          generatedAt: "2026-07-29T02:00:01.000Z",
          workspaceId: "workspace-b",
          patientId: "patient-1",
          shares: [share()],
        },
        {
          generatedAt: "2026-07-29T02:00:01.000Z",
          workspaceId: "workspace-a",
          patientId: "patient-1",
        },
      );
    }, /workspace/i);

    assert.throws(() => {
      parsePatientShareListResponse(
        {
          workspaceId: "workspace-a",
          patientId: "patient-1",
          shares: [share({ active: false })],
        },
        {
          workspaceId: "workspace-a",
          patientId: "patient-1",
        },
      );
    }, /lifecycle/i);
});

test("patient data access create and revoke receipts bind to caller intent", () => {
    const created = parsePatientShareCreateResponse(
      {
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-a",
        patientId: "patient-1",
        share: share(),
        replayed: false,
      },
      {
        workspaceId: "workspace-a",
        patientId: "patient-1",
        intent: {
          doctorUserId: "doctor-1",
          scope: "patient_profile",
        },
      },
    );
    assert.equal(created.share.status, "active");

    const revokedShare = share({
      active: false,
      status: "revoked",
      revokedAt: "2026-07-29T02:05:00.000Z",
      revokedByUserId: "admin-1",
      audit: {
        grantedByUserId: "admin-1",
        grantedAt: "2026-07-29T02:00:00.000Z",
        revokedByUserId: "admin-1",
        revokedAt: "2026-07-29T02:05:00.000Z",
      },
      updatedAt: "2026-07-29T02:05:00.000Z",
    });
    const revoked = parsePatientShareRevokeResponse(
      {
        generatedAt: "2026-07-29T02:05:01.000Z",
        workspaceId: "workspace-a",
        patientId: "patient-1",
        revoked: true,
        share: revokedShare,
        replayed: false,
      },
      {
        workspaceId: "workspace-a",
        patientId: "patient-1",
        shareId: "share-1",
      },
    );
    assert.equal(revoked.share.status, "revoked");

    assert.throws(() => {
      parsePatientShareCreateResponse(
        {
          generatedAt: "2026-07-29T02:00:01.000Z",
          workspaceId: "workspace-a",
          patientId: "patient-1",
          share: share({
            recipient: {
              id: "doctor-2",
              type: "doctor",
              name: "BS Bình",
              workspaceId: "workspace-a",
            },
          }),
          replayed: false,
        },
        {
          workspaceId: "workspace-a",
          patientId: "patient-1",
          intent: {
            doctorUserId: "doctor-1",
            scope: "patient_profile",
          },
        },
      );
    }, /người nhận/i);
});

test("share-target results bind to the active source workspace", () => {
    const result = parseShareTargetsResponse(
      {
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-a",
        doctors: [
          {
            id: "doctor-1",
            name: "BS An",
            organizationId: "workspace-a",
          },
        ],
        workspaces: [
          {
            id: "workspace-b",
            name: "Phòng khám B",
            type: "clinic",
          },
        ],
      },
      "workspace-a",
    );

    assert.equal(result.doctors.length, 1);
    assert.equal(result.workspaces.length, 1);
});
