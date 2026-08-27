import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function billingPayload(workspaceId = "workspace-1") {
  return {
    generatedAt: "2026-07-29T02:00:00.000Z",
    workspace: {
      id: workspaceId,
      name: "Phòng khám Shcare",
      type: "clinic",
      workspaceType: "clinic",
      packageId: "pkg-clinic",
      subscriptionStatus: "active",
      billingCycle: "monthly",
    },
    package: {
      id: "pkg-clinic",
      name: "Clinic",
      price: 1200000,
      currency: "VND",
      duration: "monthly",
      features: { cloudStorage: true },
    },
    subscription: {
      id: "",
      organizationId: workspaceId,
      packageId: "pkg-clinic",
      status: "active",
      billingCycle: "monthly",
      source: "workspace",
      startedAt: "2026-07-01T00:00:00.000Z",
      renewsAt: "",
      canceledAt: "",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-29T02:00:00.000Z",
    },
    usage: {
      doctors: 2,
      patients: 3,
      devices: 1,
      aiMonthly: 4,
      storageGb: 0.25,
      storageMetric: "total_storage",
    },
    quota: {
      maxDoctors: 5,
      maxPatients: 10,
      maxDevices: 10,
      storageGb: 10,
      aiMonthly: 100,
      retentionDays: 30,
    },
    usageRows: [
      {
        key: "patients",
        label: "Bệnh nhân",
        used: 3,
        limit: 10,
        unit: "hồ sơ",
        percent: 30,
        status: "ok",
      },
    ],
    currentCharge: {
      packageId: "pkg-clinic",
      amount: 1200000,
      currency: "VND",
      cycle: "monthly",
      source: "service_package",
    },
    billingContact: {
      name: "Phòng khám Shcare",
      email: "billing@example.test",
      phone: "0281234567",
      address: "Hồ Chí Minh",
    },
    invoicePolicy: {
      mode: "manual",
      providerConfigured: false,
      message: "Liên hệ Shcare để xác nhận thay đổi gói.",
    },
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi billing summary contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "billing-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses the canonical v1 route and returns an exact manual billing snapshot", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(billingPayload()));

    const result = await smartHealthApi.portalBilling("workspace-1");

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      "http://localhost:3000/api/v1/portal/billing",
    );
    expect(result.workspace.id).toBe("workspace-1");
    expect(result.invoicePolicy).toEqual(
      expect.objectContaining({
        mode: "manual",
        providerConfigured: false,
      }),
    );
  });

  it("fails closed when the backend snapshot belongs to another workspace", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(billingPayload("workspace-other")),
    );

    await expect(
      smartHealthApi.portalBilling("workspace-1"),
    ).rejects.toMatchObject({
      code: "BILLING_RESPONSE_WORKSPACE_MISMATCH",
    });
  });

  it("rejects an unsupported online-payment claim and malformed usage", async () => {
    const payload = billingPayload();
    payload.invoicePolicy.providerConfigured = true;
    payload.usageRows[0].percent = 140;

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload));

    await expect(
      smartHealthApi.portalBilling("workspace-1"),
    ).rejects.toMatchObject({
      code: "BILLING_RESPONSE_INVALID",
    });
  });
});
