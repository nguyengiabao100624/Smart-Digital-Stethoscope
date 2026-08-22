import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

const PRIMARY_TOKEN_KEY = "smart_health_token";
const SECOND_FACTOR_TOKEN_KEY = "shcare_two_factor_token";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi two-factor contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the verified Firebase primary factor while asking for OTP", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          code: "TWO_FACTOR_REQUIRED",
          message: "Cần mã OTP",
          requestId: "req_tfa_1",
          details: {
            challengeId: "challenge_1",
            method: "app",
            expiresAt: "2026-07-14T14:10:00.000Z",
          },
        },
        401,
      ),
    );

    await expect(
      smartHealthApi.authenticateFirebase("firebase-primary-token"),
    ).rejects.toMatchObject({
      status: 401,
      code: "TWO_FACTOR_REQUIRED",
      details: { challengeId: "challenge_1" },
    });

    expect(window.localStorage.getItem(PRIMARY_TOKEN_KEY)).toBe(
      "firebase-primary-token",
    );
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBeNull();
  });

  it("stores a bounded second-factor token per tab and sends both factors", async () => {
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "firebase-primary-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          twoFactorToken: "tfa-session-token-0123456789abcdef",
          expiresAt: "2026-07-14T22:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ user: { id: "usr_1", role: "doctor" } }),
      );

    await smartHealthApi.completeTwoFactorChallenge({
      challengeId: "challenge_1",
      code: "123456",
    });
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBe(
      "tfa-session-token-0123456789abcdef",
    );

    await smartHealthApi.me();
    const [, requestInit] = vi.mocked(fetch).mock.calls[1];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("Authorization")).toBe("Bearer firebase-primary-token");
    expect(headers.get("X-Shcare-2FA-Token")).toBe(
      "tfa-session-token-0123456789abcdef",
    );
  });

  it("accepts a demo primary session only after the OTP challenge succeeds", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        token: "demo-primary-session-token-0123456789",
        twoFactorToken: "demo-tfa-session-token-0123456789abcdef",
        expiresAt: "2026-07-14T22:00:00.000Z",
        user: { id: "usr_demo", role: "doctor" },
      }),
    );

    await smartHealthApi.completeTwoFactorChallenge({
      challengeId: "demo_challenge_1",
      code: "123456",
    });

    expect(window.localStorage.getItem(PRIMARY_TOKEN_KEY)).toBe(
      "demo-primary-session-token-0123456789",
    );
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBe(
      "demo-tfa-session-token-0123456789abcdef",
    );
  });

  it("does not enable 2FA locally when enrollment merely starts", async () => {
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "primary-token");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          userId: "usr_1",
          twoFactor: {
            enabled: false,
            method: "",
            enrollmentPending: true,
          },
          enrollment: {
            id: "enroll_1",
            method: "app",
            manualKey: "JBSWY3DPEHPK3PXP",
            otpauthUri:
              "otpauth://totp/Shcare:user?secret=JBSWY3DPEHPK3PXP&issuer=Shcare",
              expiresAt: "2026-07-14T14:15:00.000Z",
          },
          replayed: false,
          superseded: false,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          twoFactor: {
            enabled: false,
            method: "",
            enrollmentPending: true,
          },
          userId: "usr_1",
          enrollmentId: "enroll_1",
          recoveryCodes: [
            "111111-AAAAAA",
            "222222-BBBBBB",
            "333333-CCCCCC",
            "444444-DDDDDD",
            "555555-EEEEEE",
            "666666-FFFFFF",
            "777777-ABCDEF",
            "888888-FEDCBA",
          ],
          recoveryDelivery: {
            id: "2fa_delivery_usr_1",
            expiresAt: "2030-07-14T22:00:00.000Z",
            acknowledged: false,
          },
          recoveryAckToken: "pending-recovery-ack-token-0123456789abcdef",
          replayed: false,
        }),
      );

    const enrollmentStartIntent = {
      userId: "usr_1",
      authSessionEpoch: smartHealthApi.getAuthSessionEpochSnapshot(),
      idempotencyKey: "two-factor-start-api-stable-key",
    };
    const enrollment = await smartHealthApi.startTwoFactorEnrollment(
      enrollmentStartIntent,
    );
    expect(enrollment.twoFactor.enabled).toBe(false);
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBeNull();
    const [, startInit] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(startInit?.headers).get("Idempotency-Key")).toBe(
      enrollmentStartIntent.idempotencyKey,
    );
    expect(JSON.parse(String(startInit?.body))).toEqual({ method: "app" });

    const verified = await smartHealthApi.verifyTwoFactorEnrollment({
      userId: "usr_1",
      authSessionEpoch: smartHealthApi.getAuthSessionEpochSnapshot(),
      enrollmentId: enrollment.enrollment.id,
      code: "123456",
      idempotencyKey: "two-factor-enrollment-api-stable-key",
    });
    expect(verified.twoFactor.enabled).toBe(false);
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBeNull();
    const [, verifyInit] = vi.mocked(fetch).mock.calls[1];
    expect(new Headers(verifyInit?.headers).get("Idempotency-Key")).toBe(
      "two-factor-enrollment-api-stable-key",
    );
    expect(JSON.parse(String(verifyInit?.body))).toEqual({
      enrollmentId: "enroll_1",
      code: "123456",
    });
  });

  it("rejects a late enrollment start receipt after the primary auth session changes", async () => {
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "primary-session-a");
    const intent = {
      userId: "usr_1",
      authSessionEpoch: smartHealthApi.getAuthSessionEpochSnapshot(),
      idempotencyKey: "two-factor-start-late-response-key",
    };
    let resolveResponse: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const pending = smartHealthApi.startTwoFactorEnrollment(intent);
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "primary-session-b");
    smartHealthApi.clearToken();
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "primary-session-b");
    resolveResponse?.(
      jsonResponse({
        userId: "usr_1",
        twoFactor: { enabled: false, method: "", enrollmentPending: true },
        enrollment: {
          id: "enroll_late",
          method: "app",
          manualKey: "JBSWY3DPEHPK3PXP",
          otpauthUri:
            "otpauth://totp/Shcare:user?secret=JBSWY3DPEHPK3PXP&issuer=Shcare",
          expiresAt: "2030-07-14T14:15:00.000Z",
        },
        replayed: false,
        superseded: false,
      }),
    );

    await expect(pending).rejects.toThrow(/phiên xác thực chính đã thay đổi/i);
  });

  it("acknowledges the exact recovery delivery without sending owner authority in the body", async () => {
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "primary-token");
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        userId: "usr_1",
        enrollmentId: "enroll_1",
        twoFactor: { enabled: true, method: "app", enrollmentPending: false },
        recoveryDelivery: {
          id: "2fa_delivery_usr_1",
          expiresAt: "2030-07-14T22:00:00.000Z",
          acknowledged: true,
          acknowledgedAt: "2030-07-14T21:05:00.000Z",
        },
        twoFactorToken: "completed-tfa-token-0123456789abcdef",
        tokenExpiresAt: "2030-07-14T22:15:00.000Z",
        replayed: false,
      }),
    );

    await expect(
      smartHealthApi.acknowledgeTwoFactorRecoveryCodes({
        userId: "usr_1",
        authSessionEpoch: smartHealthApi.getAuthSessionEpochSnapshot(),
        enrollmentId: "enroll_1",
        deliveryId: "2fa_delivery_usr_1",
        recoveryAckToken: "pending-recovery-ack-token-0123456789abcdef",
        idempotencyKey: "two-factor-enrollment-api-stable-key",
      }),
    ).resolves.toMatchObject({
      userId: "usr_1",
      recoveryDelivery: { acknowledged: true },
    });
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBe(
      "completed-tfa-token-0123456789abcdef",
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3000/api/v1/me/2fa/recovery-codes/ack",
    );
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "two-factor-enrollment-api-stable-key",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      deliveryId: "2fa_delivery_usr_1",
      recoveryAckToken: "pending-recovery-ack-token-0123456789abcdef",
    });
  });

  it("rejects a late verification receipt after the primary auth session changes", async () => {
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "primary-session-a");
    const authSessionEpoch = smartHealthApi.getAuthSessionEpochSnapshot();
    let resolveResponse: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const verification = smartHealthApi.verifyTwoFactorEnrollment({
      userId: "usr_1",
      authSessionEpoch,
      enrollmentId: "enroll_1",
      code: "123456",
      idempotencyKey: "two-factor-session-a-key",
    });
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "primary-session-b");
    resolveResponse?.(
      jsonResponse({
        userId: "usr_1",
        enrollmentId: "enroll_1",
        twoFactor: { enabled: false, method: "", enrollmentPending: true },
        recoveryCodes: [
          "111111-AAAAAA",
          "222222-BBBBBB",
          "333333-CCCCCC",
          "444444-DDDDDD",
          "555555-EEEEEE",
          "666666-FFFFFF",
          "777777-ABCDEF",
          "888888-FEDCBA",
        ],
        recoveryDelivery: {
          id: "2fa_delivery_usr_1",
          expiresAt: "2030-07-14T22:00:00.000Z",
          acknowledged: false,
        },
        recoveryAckToken: "pending-recovery-ack-token-session-a",
        replayed: false,
      }),
    );

    await expect(verification).rejects.toThrow(
      /phiên xác thực chính đã thay đổi/i,
    );
  });

  it("does not install a completed second factor from a stale ACK response", async () => {
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "primary-session-a");
    const authSessionEpoch = smartHealthApi.getAuthSessionEpochSnapshot();
    let resolveResponse: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const acknowledgement = smartHealthApi.acknowledgeTwoFactorRecoveryCodes({
      userId: "usr_1",
      authSessionEpoch,
      enrollmentId: "enroll_1",
      deliveryId: "2fa_delivery_usr_1",
      recoveryAckToken: "pending-recovery-ack-token-session-a",
      idempotencyKey: "two-factor-session-a-key",
    });
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "primary-session-b");
    resolveResponse?.(
      jsonResponse({
        userId: "usr_1",
        enrollmentId: "enroll_1",
        twoFactor: { enabled: true, method: "app", enrollmentPending: false },
        recoveryDelivery: {
          id: "2fa_delivery_usr_1",
          expiresAt: "2030-07-14T22:00:00.000Z",
          acknowledged: true,
          acknowledgedAt: "2030-07-14T21:05:00.000Z",
        },
        twoFactorToken: "stale-completed-token-0123456789abcdef",
        tokenExpiresAt: "2030-07-14T22:15:00.000Z",
        replayed: false,
      }),
    );

    await expect(acknowledgement).rejects.toThrow(
      /phiên xác thực chính đã thay đổi/i,
    );
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBeNull();
  });

  it("clears both factors for a non-2FA unauthorized response", async () => {
    window.localStorage.setItem(PRIMARY_TOKEN_KEY, "expired-primary-token");
    window.sessionStorage.setItem(
      SECOND_FACTOR_TOKEN_KEY,
      "expired-tfa-token-0123456789abcdef",
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { code: "UNAUTHENTICATED", message: "Phiên đã hết hạn" },
        401,
      ),
    );

    await expect(smartHealthApi.me()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(window.localStorage.getItem(PRIMARY_TOKEN_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBeNull();
  });
});
