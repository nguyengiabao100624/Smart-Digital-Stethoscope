import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi device assignment contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "device-assignment-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends a caller-owned idempotency key without leaking it into the body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        device: {
          id: "Device_Aa-01",
          organizationId: "workspace-1",
          assignedPatientId: "Patient_Aa-01",
        },
        replayed: false,
      }),
    );

    const result = await smartHealthApi.updateDevice(
      "Device_Aa-01",
      { assignedPatientId: "Patient_Aa-01" },
      "portal-device-assignment-intent-1",
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3000/api/v1/portal/devices/Device_Aa-01",
    );
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "portal-device-assignment-intent-1",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      assignedPatientId: "Patient_Aa-01",
    });
    expect(result).toMatchObject({
      device: {
        id: "Device_Aa-01",
        organizationId: "workspace-1",
        assignedPatientId: "Patient_Aa-01",
      },
      replayed: false,
    });
  });
});
