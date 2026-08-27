import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    ticket: {
      id: "support-ticket-1",
      workspaceId: "workspace-1",
      requesterUserId: "user-1",
      type: "device_connection",
      status: "open",
      createdAt: "2026-07-29T04:00:00.000Z",
      ...overrides,
    },
    replayed: false,
  };
}

describe("smartHealthApi support ticket contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "support-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends a caller-owned idempotency key and validates the exact owner receipt", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(receipt(), 201));

    const result = await smartHealthApi.createSupportTicket(
      {
        type: "device_connection",
        description: "Thiết bị không thể kết nối sau khi đã khởi động lại.",
      },
      "portal-support-intent-1",
      { workspaceId: "workspace-1", requesterUserId: "user-1" },
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3000/api/v1/portal/support",
    );
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "portal-support-intent-1",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "device_connection",
      description: "Thiết bị không thể kết nối sau khi đã khởi động lại.",
    });
    expect(result).toEqual(receipt());
  });

  it("fails closed when the receipt belongs to another account or workspace", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(receipt({ workspaceId: "workspace-other" }), 201),
    );

    await expect(
      smartHealthApi.createSupportTicket(
        {
          type: "other",
          description: "Yêu cầu hỗ trợ có đủ nội dung để gửi.",
        },
        "portal-support-intent-2",
        { workspaceId: "workspace-1", requesterUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SUPPORT_TICKET_RECEIPT_OWNER_MISMATCH",
    });
  });

  it("rejects malformed success payloads instead of manufacturing local success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        ticket: {
          id: "",
          workspaceId: "workspace-1",
          requesterUserId: "user-1",
          type: "made_up",
          status: "done",
          createdAt: "not-a-date",
        },
      }, 201),
    );

    await expect(
      smartHealthApi.createSupportTicket(
        {
          type: "other",
          description: "Yêu cầu hỗ trợ có đủ nội dung để gửi.",
        },
        "portal-support-intent-3",
        { workspaceId: "workspace-1", requesterUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SUPPORT_TICKET_RECEIPT_INVALID",
    });
  });
});
