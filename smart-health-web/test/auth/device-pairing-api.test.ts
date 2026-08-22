import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi device pairing contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the caller-owned idempotency key and preserves exact identifiers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        device: {
          id: "Device_Aa-01",
          organizationId: "workspace-1",
          connected: false,
          online: false,
        },
        pairing: {
          outcome: "accepted",
          presence: "awaiting_online",
          onlineConfirmed: false,
          authenticatedTransport: null,
        },
      }),
    );

    const result = await smartHealthApi.activateDeviceByClaim(
      {
        deviceId: "Device_Aa-01",
        claimCode: "Claim_aB-123",
        connectionMethod: "QR",
        organizationId: "workspace-1",
      },
      "portal-claim-intent-1",
    );

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("Idempotency-Key")).toBe("portal-claim-intent-1");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      deviceId: "Device_Aa-01",
      claimCode: "Claim_aB-123",
      connectionMethod: "QR",
      organizationId: "workspace-1",
    });
    expect(result.pairing).toEqual({
      outcome: "accepted",
      presence: "awaiting_online",
      onlineConfirmed: false,
      authenticatedTransport: null,
    });
  });

  it("rejects a pairing receipt from a different workspace", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        device: {
          id: "Device_Aa-01",
          organizationId: "workspace-other",
          connected: false,
          online: false,
        },
        pairing: {
          outcome: "accepted",
          presence: "awaiting_online",
          onlineConfirmed: false,
          authenticatedTransport: null,
        },
      }),
    );

    await expect(
      smartHealthApi.activateDeviceByClaim(
        {
          deviceId: "Device_Aa-01",
          claimCode: "Claim_aB-123",
          connectionMethod: "QR",
          organizationId: "workspace-1",
        },
        "portal-claim-intent-workspace",
      ),
    ).rejects.toThrow(/không thuộc workspace hiện tại/i);
  });
});
