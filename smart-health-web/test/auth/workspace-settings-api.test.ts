import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWorkspaceSettingsIdempotencyKey,
  parseWorkspaceSettingsReceipt,
  type WorkspaceSettingsUpdateIntent,
} from "../../src/lib/workspace-settings-operations";
import { smartHealthApi } from "../../src/lib/smart-health-api";

const intent: WorkspaceSettingsUpdateIntent = {
  userId: "user-1",
  workspaceId: "workspace-1",
  expectedVersion: 7,
  idempotencyKey: "workspace-settings-intent-1",
  payload: {
    name: "Phòng khám Test",
    address: "1 Test Street",
    phone: "0281234567",
    email: "ops@test.example",
    website: "https://test.example",
  },
};

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    ownership: { userId: intent.userId, workspaceId: intent.workspaceId },
    workspace: {
      id: intent.workspaceId,
      ...intent.payload,
      version: intent.expectedVersion + 1,
      updatedAt: "2026-08-09T08:00:00.000Z",
    },
    operationId: "workspace_settings_operation_1",
    replayed: false,
    ...overrides,
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("workspace settings update contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "workspace-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends the canonical v1 payload and caller-owned operation key", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(receipt()));

    await expect(smartHealthApi.updateWorkspace(intent)).resolves.toEqual(
      receipt(),
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3000/api/v1/portal/settings/workspace",
    );
    expect(init?.method).toBe("PATCH");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      intent.idempotencyKey,
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      ...intent.payload,
      expectedVersion: intent.expectedVersion,
    });
  });

  it("rejects a receipt bound to another account or workspace", () => {
    expect(() =>
      parseWorkspaceSettingsReceipt(
        receipt({
          ownership: { userId: "user-other", workspaceId: intent.workspaceId },
        }),
        intent,
        intent.userId,
        intent.workspaceId,
      ),
    ).toThrow(/tài khoản hoặc workspace hiện tại/i);
  });

  it.each([
    ["missing operation id", () => ({ ...receipt(), operationId: "" })],
    [
      "wrong version",
      () => ({
        ...receipt(),
        workspace: { ...receipt().workspace, version: intent.expectedVersion },
      }),
    ],
    [
      "unconfirmed field",
      () => ({
        ...receipt(),
        workspace: { ...receipt().workspace, phone: "0280000000" },
      }),
    ],
    ["extra field", () => ({ ...receipt(), success: true })],
  ])("rejects %s instead of confirming success", (_label, candidate) => {
    expect(() =>
      parseWorkspaceSettingsReceipt(
        candidate(),
        intent,
        intent.userId,
        intent.workspaceId,
      ),
    ).toThrow(/biên nhận cập nhật workspace/i);
  });

  it("creates an opaque bounded operation key", () => {
    const key = createWorkspaceSettingsIdempotencyKey();
    expect(key).toMatch(/^workspace-settings-/);
    expect(key.length).toBeLessThanOrEqual(160);
    expect(key).not.toContain(intent.userId);
    expect(key).not.toContain(intent.workspaceId);
  });
});
