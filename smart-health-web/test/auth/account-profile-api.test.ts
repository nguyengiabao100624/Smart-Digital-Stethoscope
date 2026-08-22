import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAccountProfileIdempotencyKey,
  parseAccountProfileUpdateReceipt,
  smartHealthApi,
  type AccountProfileUpdateIntent,
} from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function receipt(intent: AccountProfileUpdateIntent, replayed = false) {
  return {
    userId: intent.userId,
    intent: "profile_update",
    changedFields: Object.keys(intent.patch).sort(),
    user: {
      id: intent.userId,
      name: intent.patch.name ?? "Bác sĩ Test",
      title: intent.patch.title ?? "Bác sĩ",
      phone: intent.patch.phone ?? "0900000000",
      license: intent.patch.license ?? "LIC-001",
      hospital: intent.patch.hospital ?? "Phòng khám Test",
      department: intent.patch.department ?? "Tim mạch",
      specialty: intent.patch.specialty ?? "Tim mạch",
      address: intent.patch.address ?? "1 Đường Test",
      organizationId: "workspace-1",
      updatedAt: "2026-08-09T10:00:00.000Z",
    },
    replayed,
  };
}

describe("account profile update API contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "profile-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("PATCHes canonical v1 with a header-owned stable key and no workspace fields", async () => {
    const intent: AccountProfileUpdateIntent = {
      userId: "user-1",
      patch: { name: "Tên đã sửa", phone: "0911222333" },
      idempotencyKey: "account-profile-key-1",
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(receipt(intent)));

    await expect(smartHealthApi.updateMe(intent)).resolves.toEqual(
      receipt(intent),
    );
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("http://localhost:3000/api/v1/me");
    expect(init?.method).toBe("PATCH");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      intent.idempotencyKey,
    );
    expect(JSON.parse(String(init?.body))).toEqual(intent.patch);
    expect(String(init?.body)).not.toMatch(/userId|organizationId|workspace/i);
  });

  it("accepts an exact replay for the same owner and field intent", () => {
    const intent: AccountProfileUpdateIntent = {
      userId: "user-1",
      patch: { address: "2 Đường Mới", phone: "0999888777" },
      idempotencyKey: "account-profile-key-1",
    };
    expect(
      parseAccountProfileUpdateReceipt(receipt(intent, true), intent, "user-1"),
    ).toEqual(receipt(intent, true));
  });

  it.each([
    [
      "foreign owner",
      (intent: AccountProfileUpdateIntent) => ({
        ...receipt(intent),
        userId: "user-2",
        user: { ...receipt(intent).user, id: "user-2" },
      }),
    ],
    [
      "wrong changed fields",
      (intent: AccountProfileUpdateIntent) => ({
        ...receipt(intent),
        changedFields: ["address"],
      }),
    ],
    [
      "unconfirmed submitted value",
      (intent: AccountProfileUpdateIntent) => ({
        ...receipt(intent),
        user: { ...receipt(intent).user, phone: "0900000000" },
      }),
    ],
    [
      "extra receipt field",
      (intent: AccountProfileUpdateIntent) => ({
        ...receipt(intent),
        success: true,
      }),
    ],
  ])("rejects a %s receipt", (_label, mutate) => {
    const intent: AccountProfileUpdateIntent = {
      userId: "user-1",
      patch: { phone: "0911222333" },
      idempotencyKey: "account-profile-key-1",
    };
    expect(() =>
      parseAccountProfileUpdateReceipt(mutate(intent), intent, "user-1"),
    ).toThrow(/biên nhận hồ sơ/i);
  });

  it("rejects account, avatar and workspace authority in the request patch", async () => {
    for (const field of ["userId", "avatarUrl", "organizationId"] as const) {
      const intent = {
        userId: "user-1",
        patch: { [field]: "forbidden" },
        idempotencyKey: "account-profile-key-1",
      } as unknown as AccountProfileUpdateIntent;
      await expect(smartHealthApi.updateMe(intent)).rejects.toMatchObject({
        code: "ACCOUNT_PROFILE_INTENT_INVALID",
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates opaque bounded operation keys", () => {
    const key = createAccountProfileIdempotencyKey();
    expect(key).toMatch(/^account-profile-/);
    expect(key.length).toBeLessThanOrEqual(160);
    expect(key).not.toContain("user-1");
  });
});
