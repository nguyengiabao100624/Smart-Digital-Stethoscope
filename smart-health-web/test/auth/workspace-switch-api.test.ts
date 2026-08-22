import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi workspace switch contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "workspace-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends only the canonical workspace selection with a caller-owned idempotency key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: "user-1",
          organizationId: "workspace-2",
          currentWorkspaceId: "workspace-2",
        },
        replayed: false,
      }),
    );

    const result = await smartHealthApi.switchWorkspace(
      "workspace-2",
      "portal-workspace-switch-intent-1",
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("http://localhost:3000/api/v1/me");
    expect(init?.method).toBe("PATCH");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "portal-workspace-switch-intent-1",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      organizationId: "workspace-2",
    });
    expect(result.user.currentWorkspaceId).toBe("workspace-2");
  });
});
