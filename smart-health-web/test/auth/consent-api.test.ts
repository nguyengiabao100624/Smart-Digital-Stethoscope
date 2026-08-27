import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function activeShare() {
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
  };
}

describe("smartHealthApi consent/data-access contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a patient ledger through v1 and verifies workspace/patient ownership", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-a",
        patientId: "patient-1",
        shares: [activeShare()],
      }),
    );

    const result = await smartHealthApi.listPatientShares(
      "patient-1",
      "workspace-a",
    );

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "/api/v1/portal/patients/patient-1/shares",
    );
    expect(result.shares[0].recipient.id).toBe("doctor-1");
  });

  it("does not accept a create receipt for a different recipient", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-a",
        patientId: "patient-1",
        share: {
          ...activeShare(),
          recipient: {
            id: "doctor-2",
            type: "doctor",
            name: "BS Bình",
            workspaceId: "workspace-a",
          },
        },
        replayed: false,
      }),
    );

    await expect(
      smartHealthApi.createPatientShare(
        "patient-1",
        {
          doctorUserId: "doctor-1",
          scope: "patient_profile",
        },
        "share-intent-1",
        "workspace-a",
      ),
    ).rejects.toThrow(/người nhận/i);
  });

  it("binds share-target results to the active source workspace", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-a",
        doctors: [],
        workspaces: [],
      }),
    );

    await smartHealthApi.shareTargets("workspace-a");

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "/api/v1/share-targets",
    );
  });
});
