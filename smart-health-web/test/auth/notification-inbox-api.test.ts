import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

const item = {
  id: "notification-1",
  userId: "user-1",
  workspaceId: "workspace-1",
  organizationId: "workspace-1",
  type: "info",
  title: "Shcare update",
  message: "Backend-confirmed update",
  campaignId: "",
  audienceType: "direct" as const,
  audienceRole: "doctor",
  requestedChannels: ["in_app"] as const,
  inAppStatus: "ready",
  emailStatus: "skipped",
  pushStatus: "skipped",
  read: false,
  readAt: null,
  createdAt: "2026-07-29T08:00:00.000Z",
  updatedAt: "2026-07-29T08:00:00.000Z",
};

const snapshot = {
  userId: "user-1",
  workspaceId: "workspace-1",
  notifications: [item],
  updatedAt: "2026-07-29T08:00:01.000Z",
};

const readReceipt = {
  ...snapshot,
  action: "read" as const,
  notification: {
    ...item,
    read: true,
    readAt: "2026-07-29T08:01:00.000Z",
  },
  notifications: [
    {
      ...item,
      read: true,
      readAt: "2026-07-29T08:01:00.000Z",
    },
  ],
  affectedIds: ["notification-1"],
  deletedId: null,
  replayed: false,
};

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi personal notification inbox contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("smart_health_token", "primary-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the account and active-workspace inbox endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(snapshot));

    await expect(smartHealthApi.getNotificationInbox()).resolves.toEqual(
      snapshot,
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3000/api/portal/notifications/inbox",
    );
    expect(init?.method).toBeUndefined();
  });

  it("marks one item read with the caller-owned idempotency key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(readReceipt));

    await smartHealthApi.markNotificationInboxRead(
      "notification-1",
      "notification-read-operation-1",
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe(
      "http://localhost:3000/api/portal/notifications/inbox/notification-1/read",
    );
    expect(init?.method).toBe("POST");
    expect(headers.get("Idempotency-Key")).toBe(
      "notification-read-operation-1",
    );
  });

  it("deletes through the canonical endpoint and never returns a bare boolean", async () => {
    const receipt = {
      ...readReceipt,
      action: "delete",
      notification: item,
      notifications: [],
      deletedId: "notification-1",
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(receipt));

    await expect(
      smartHealthApi.deleteNotificationInboxItem(
        "notification-1",
        "notification-delete-operation-1",
      ),
    ).resolves.toEqual(receipt);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe(
      "http://localhost:3000/api/portal/notifications/inbox/notification-1",
    );
    expect(init?.method).toBe("DELETE");
    expect(headers.get("Idempotency-Key")).toBe(
      "notification-delete-operation-1",
    );
  });
});
