import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi clinical workflow contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "clinical-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads the workspace review queue and sends an exact versioned decision", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ reviews: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          review: {
            id: "review-1",
            scanId: "Scan_Aa-01",
            status: "reviewed",
            decision: "repeat_measurement",
            version: 2,
          },
        }),
      );

    await smartHealthApi.listReviewQueue({ status: "pending", limit: 50 });
    await smartHealthApi.decideReview("Scan_Aa-01", {
      decision: "repeat_measurement",
      note: "Đo lại vùng phổi phải",
      expectedVersion: 1,
      idempotencyKey: "review-intent-1",
    });

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      "http://localhost:3000/api/portal/review-queue?status=pending&limit=50",
    );
    const [url, init] = vi.mocked(fetch).mock.calls[1];
    expect(String(url)).toBe(
      "http://localhost:3000/api/portal/review-queue/Scan_Aa-01/decision",
    );
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "review-intent-1",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      decision: "repeat_measurement",
      note: "Đo lại vùng phổi phải",
      expectedVersion: 1,
    });
  });

  it("uses separate acknowledge and resolve endpoints with caller-owned keys", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ alerts: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ alert: { id: "Alert_Aa-01", status: "acknowledged", version: 2 } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ alert: { id: "Alert_Aa-01", status: "resolved", version: 3 } }),
      );

    await smartHealthApi.listClinicalAlerts({ status: "open", limit: 50 });
    await smartHealthApi.acknowledgeClinicalAlert("Alert_Aa-01", {
      note: "Đang kiểm tra",
      expectedVersion: 1,
      idempotencyKey: "alert-ack-intent",
    });
    await smartHealthApi.resolveClinicalAlert("Alert_Aa-01", {
      note: "Đã đo lại và xác nhận ổn định",
      expectedVersion: 2,
      idempotencyKey: "alert-resolve-intent",
    });

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "/portal/alerts?status=open&limit=50",
    );
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain(
      "/portal/alerts/Alert_Aa-01/acknowledge",
    );
    expect(new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get("Idempotency-Key"))
      .toBe("alert-ack-intent");
    expect(String(vi.mocked(fetch).mock.calls[2][0])).toContain(
      "/portal/alerts/Alert_Aa-01/resolve",
    );
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body))).toEqual({
      note: "Đã đo lại và xác nhận ổn định",
      expectedVersion: 2,
    });
  });

  it("preserves structured 409 conflict details for refresh handling", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "REVIEW_VERSION_CONFLICT",
            message: "Review changed",
            details: { currentVersion: 2 },
            requestId: "req-conflict",
          },
        },
        409,
      ),
    );

    await expect(
      smartHealthApi.decideReview("scan-1", {
        decision: "accepted",
        note: "",
        expectedVersion: 1,
        idempotencyKey: "stale-review",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "REVIEW_VERSION_CONFLICT",
      details: { currentVersion: 2 },
      requestId: "req-conflict",
    });
  });
});
