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
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          twoFactor: {
            enabled: true,
            method: "app",
            enrollmentPending: false,
          },
          recoveryCodes: [
            "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8",
          ],
          twoFactorToken: "verified-tfa-token-0123456789abcdef",
          tokenExpiresAt: "2026-07-14T22:00:00.000Z",
        }),
      );

    const enrollment = await smartHealthApi.startTwoFactorEnrollment();
    expect(enrollment.twoFactor.enabled).toBe(false);
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBeNull();

    const verified = await smartHealthApi.verifyTwoFactorEnrollment({
      enrollmentId: enrollment.enrollment.id,
      code: "123456",
    });
    expect(verified.twoFactor.enabled).toBe(true);
    expect(window.sessionStorage.getItem(SECOND_FACTOR_TOKEN_KEY)).toBe(
      "verified-tfa-token-0123456789abcdef",
    );
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
