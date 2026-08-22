import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

const snapshot = {
  userId: "user-1",
  workspaceId: "workspace-1",
  ownership: { kind: "self" as const, userId: "user-1" },
  preferences: {
    enabled: true,
    doctorRequests: true,
    abnormalResults: true,
    deviceOffline: true,
    appointments: false,
    messages: true,
    aiUpdates: false,
    newLogin: true,
  },
  channels: {
    inApp: { available: true, status: "ready", reasonCode: "" },
    email: {
      available: false,
      status: "unavailable",
      reasonCode: "PROVIDER_UNAVAILABLE",
    },
    push: { available: true, status: "ready", reasonCode: "" },
  },
  updatedAt: "2026-07-28T10:00:00.000Z",
  replayed: false,
};

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi notification preference contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("smart_health_token", "primary-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the versioned canonical self preference snapshot", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(snapshot));

    await expect(smartHealthApi.getNotificationPreferences()).resolves.toEqual(
      snapshot,
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3000/api/v1/me/notification-preferences",
    );
    expect(init?.method).toBeUndefined();
  });

  it("patches exactly one field with the caller-owned idempotency key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(snapshot));

    await smartHealthApi.patchNotificationPreference(
      "appointments",
      false,
      "notification-appointments-operation-1",
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe(
      "http://localhost:3000/api/v1/me/notification-preferences",
    );
    expect(init?.method).toBe("PATCH");
    expect(headers.get("Idempotency-Key")).toBe(
      "notification-appointments-operation-1",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      key: "appointments",
      enabled: false,
    });
  });
});
