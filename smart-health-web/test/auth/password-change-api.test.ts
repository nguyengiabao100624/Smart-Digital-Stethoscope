import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parsePasswordChangeReceipt,
  smartHealthApi,
} from "../../src/lib/smart-health-api";

const user = {
  id: "user-1",
};

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi password change contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("smart_health_token", "primary-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves exact secrets and sends the caller-owned idempotency key", async () => {
    const receipt = {
      ok: true,
      user,
      provider: "demo",
      operationId: "identity-operation-1",
      replayed: false,
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(receipt));

    await expect(
      smartHealthApi.changePassword(
        {
          currentPassword: " CurrentPass1 ",
          newPassword: " NewPass2 ",
        },
        "password-operation-1",
      ),
    ).resolves.toEqual(receipt);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe("http://localhost:3000/api/v1/me/password");
    expect(init?.method).toBe("POST");
    expect(headers.get("Idempotency-Key")).toBe("password-operation-1");
    expect(JSON.parse(String(init?.body))).toEqual({
      currentPassword: " CurrentPass1 ",
      newPassword: " NewPass2 ",
    });
  });

  it("rejects a blank operation key before sending a request", async () => {
    await expect(
      smartHealthApi.changePassword(
        {
          currentPassword: "CurrentPass1",
          newPassword: "NewPass2",
        },
        " ",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not clear a replacement bearer when an older Firebase authentication fails", async () => {
    let resolveAuthentication:
      | ((response: Response) => void)
      | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveAuthentication = resolve;
        }),
    );

    const staleAuthentication =
      smartHealthApi.authenticateFirebase("firebase-token-user-a");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    window.localStorage.setItem("smart_health_token", "firebase-token-user-b");
    resolveAuthentication?.(
      new Response(
        JSON.stringify({
          code: "INVALID_FIREBASE_TOKEN",
          message: "Token A is no longer valid",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(staleAuthentication).rejects.toMatchObject({
      code: "INVALID_FIREBASE_TOKEN",
    });
    expect(smartHealthApi.getTokenSnapshot()).toBe("firebase-token-user-b");
  });

  it("fails closed when the receipt is not the exact canonical shape", () => {
    expect(() =>
      parsePasswordChangeReceipt({
        ok: true,
        user,
        provider: "firebase",
        operationId: "identity-operation-1",
        replayed: false,
        firebaseClientUpdated: true,
      }),
    ).toThrow(/biên nhận đổi mật khẩu/i);

    expect(() =>
      parsePasswordChangeReceipt({
        ok: true,
        user,
        provider: "firebase",
        operationId: "",
        replayed: false,
      }),
    ).toThrow(/biên nhận đổi mật khẩu/i);

    expect(() =>
      parsePasswordChangeReceipt({
        ok: true,
        user: { ...user, role: "patient" },
        provider: "firebase",
        operationId: "identity-operation-1",
        replayed: false,
      }),
    ).toThrow(/biên nhận đổi mật khẩu/i);

    expect(() =>
      parsePasswordChangeReceipt({
        ok: true,
        user,
        provider: "firebase",
        operationId: "identity-operation-1",
        replayed: false,
        requestId: "request-not-in-canonical-receipt",
      }),
    ).toThrow(/biên nhận đổi mật khẩu/i);
  });
});
