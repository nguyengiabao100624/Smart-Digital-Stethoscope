import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function monitoringPayload(workspaceId = "workspace-live") {
  return {
    generatedAt: "2026-07-29T11:00:00.000Z",
    workspaceId,
    status: {
      type: "status",
      recording: false,
      workspaceId: null,
      patientId: null,
      deviceId: null,
      scanId: null,
      sessionId: null,
      updatedAt: "2026-07-29T11:00:00.000Z",
    },
    devices: [
      {
        id: "device-live",
        organizationId: workspaceId,
        name: "Shcare Live",
        connected: true,
        online: false,
        audioStatus: "idle",
      },
    ],
    scans: [],
    alerts: [],
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi Portal monitoring contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "monitoring-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("requests the canonical v1 fallback and preserves authenticated online authority", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(monitoringPayload()));

    const result = await smartHealthApi.monitoring("workspace-live");

    const requestUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/api/v1/portal/monitoring");
    expect(result.workspaceId).toBe("workspace-live");
    expect(result.status.recording).toBe(false);
    expect(result.devices[0]).toMatchObject({
      connected: true,
      online: false,
    });
  });

  it("fails closed when the backend snapshot belongs to another workspace", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(monitoringPayload("workspace-foreign")),
    );

    await expect(
      smartHealthApi.monitoring("workspace-live"),
    ).rejects.toThrow("không thuộc workspace hiện tại");
  });
});
