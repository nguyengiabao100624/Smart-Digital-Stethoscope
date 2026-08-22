import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi portal device list", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the canonical v1 route and verifies the active workspace", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-a",
        devices: [
          {
            id: "device-1",
            organizationId: "workspace-a",
            online: false,
            connected: true,
          },
        ],
      }),
    );

    const result = await smartHealthApi.listDevices("workspace-a");

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "/api/v1/portal/devices",
    );
    expect(result.devices[0].online).toBe(false);
  });

  it("fails closed when a cached/foreign workspace payload is returned", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-b",
        devices: [],
      }),
    );

    await expect(
      smartHealthApi.listDevices("workspace-a"),
    ).rejects.toThrow(/workspace/i);
  });
});
