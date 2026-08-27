import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTwoFactorEnrollmentIdempotencyKey,
  parseTwoFactorEnrollmentStartReceipt,
  parseTwoFactorEnrollmentReceipt,
  parseTwoFactorRecoveryAckReceipt,
  type TwoFactorEnrollmentIntent,
  type TwoFactorEnrollmentStartIntent,
} from "../../src/lib/two-factor-enrollment-operations";

const startIntent: TwoFactorEnrollmentStartIntent = {
  userId: "user-alpha",
  authSessionEpoch: 7,
  idempotencyKey: "two-factor-enrollment-start-alpha-stable-intent",
};

const intent: TwoFactorEnrollmentIntent = {
  userId: "user-alpha",
  authSessionEpoch: 7,
  enrollmentId: "2fa-enroll-alpha",
  code: "123456",
  idempotencyKey: "two-factor-enrollment-alpha-stable-intent",
};

function verifiedReceipt() {
  return {
    userId: intent.userId,
    enrollmentId: intent.enrollmentId,
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
      id: "2fa_delivery_alpha",
      expiresAt: "2030-08-09T04:10:00.000Z",
      acknowledged: false,
    },
    recoveryAckToken: "safe_pending_recovery_ack_token",
    replayed: false,
  };
}

describe("two-factor enrollment operation contract", () => {
  beforeEach(() =>
    vi.useFakeTimers({ now: new Date("2030-08-09T04:00:00.000Z") }),
  );
  afterEach(() => vi.useRealTimers());

  it("accepts an exact owner-bound enrollment start receipt", () => {
    const receipt = {
      userId: startIntent.userId,
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      enrollment: {
        id: "2fa-enroll-start-alpha",
        method: "app",
        manualKey: "JBSWY3DPEHPK3PXP",
        otpauthUri:
          "otpauth://totp/Shcare:user-alpha?secret=JBSWY3DPEHPK3PXP&issuer=Shcare",
        expiresAt: "2030-08-09T04:10:00.000Z",
      },
      replayed: false,
      superseded: true,
    } as const;

    expect(parseTwoFactorEnrollmentStartReceipt(receipt, startIntent)).toEqual(
      receipt,
    );
    expect(
      parseTwoFactorEnrollmentStartReceipt(
        { ...receipt, replayed: true },
        startIntent,
      ),
    ).toMatchObject({
      userId: startIntent.userId,
      replayed: true,
      superseded: true,
    });
  });

  it("keeps enrollment-start contract errors in valid Vietnamese UTF-8", () => {
    expect(() =>
      parseTwoFactorEnrollmentStartReceipt({}, {
        ...startIntent,
        userId: "",
      }),
    ).toThrow("Biên nhận thiết lập 2FA không hợp lệ: thiếu chủ tài khoản.");
  });

  it.each([
    ["another owner", { userId: "user-beta" }],
    [
      "enabled before acknowledgement",
      {
        twoFactor: {
          enabled: true,
          method: "app",
          enrollmentPending: false,
        },
      },
    ],
    ["coerced replay flag", { replayed: "false" }],
    ["unexpected field", { unexpected: true }],
  ])("rejects enrollment start receipt for %s", (_label, mutation) => {
    const receipt = {
      userId: startIntent.userId,
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      enrollment: {
        id: "2fa-enroll-start-alpha",
        method: "app",
        manualKey: "JBSWY3DPEHPK3PXP",
        otpauthUri:
          "otpauth://totp/Shcare:user-alpha?secret=JBSWY3DPEHPK3PXP&issuer=Shcare",
        expiresAt: "2030-08-09T04:10:00.000Z",
      },
      replayed: false,
      superseded: false,
      ...mutation,
    };
    expect(() =>
      parseTwoFactorEnrollmentStartReceipt(receipt, startIntent),
    ).toThrow(/2FA/i);
  });

  it("accepts an exact owner-bound delivery receipt", () => {
    expect(parseTwoFactorEnrollmentReceipt(verifiedReceipt(), intent)).toEqual(
      verifiedReceipt(),
    );
  });

  it("accepts the exact replay for the same stable intent", () => {
    const replay = { ...verifiedReceipt(), replayed: true };
    expect(parseTwoFactorEnrollmentReceipt(replay, intent)).toEqual(replay);
  });

  it.each([
    ["another owner", () => ({ ...verifiedReceipt(), userId: "user-beta" })],
    [
      "another enrollment",
      () => ({ ...verifiedReceipt(), enrollmentId: "other" }),
    ],
    [
      "missing replay state",
      () => {
        const { replayed: _replayed, ...receipt } = verifiedReceipt();
        return receipt;
      },
    ],
    [
      "duplicate recovery code",
      () => ({
        ...verifiedReceipt(),
        recoveryCodes: Array(8).fill("111111-AAAAAA"),
      }),
    ],
    [
      "acknowledged delivery",
      () => ({
        ...verifiedReceipt(),
        recoveryDelivery: {
          ...verifiedReceipt().recoveryDelivery,
          acknowledged: true,
          acknowledgedAt: "2030-08-09T04:01:00.000Z",
        },
      }),
    ],
    [
      "expired delivery",
      () => ({
        ...verifiedReceipt(),
        recoveryDelivery: {
          ...verifiedReceipt().recoveryDelivery,
          expiresAt: "2030-08-09T03:59:00.000Z",
        },
      }),
    ],
    ["unexpected key", () => ({ ...verifiedReceipt(), success: true })],
  ])("rejects %s without inventing success", (_label, candidate) => {
    expect(() => parseTwoFactorEnrollmentReceipt(candidate(), intent)).toThrow(
      /biên nhận thiết lập 2FA/i,
    );
  });

  it("validates acknowledgement against the active owner and delivery", () => {
    const receipt = {
      userId: intent.userId,
      enrollmentId: intent.enrollmentId,
      twoFactor: { enabled: true, method: "app", enrollmentPending: false },
      recoveryDelivery: {
        id: "2fa_delivery_alpha",
        expiresAt: "2030-08-09T04:10:00.000Z",
        acknowledged: true,
        acknowledgedAt: "2030-08-09T04:02:00.000Z",
      },
      twoFactorToken: "safe_completed_second_factor_token",
      tokenExpiresAt: "2030-08-09T04:20:00.000Z",
      replayed: false,
    };
    expect(
      parseTwoFactorRecoveryAckReceipt(receipt, {
        userId: intent.userId,
        enrollmentId: intent.enrollmentId,
        deliveryId: "2fa_delivery_alpha",
      }),
    ).toEqual(receipt);
    expect(() =>
      parseTwoFactorRecoveryAckReceipt(receipt, {
        userId: "user-beta",
        enrollmentId: intent.enrollmentId,
        deliveryId: "2fa_delivery_alpha",
      }),
    ).toThrow(/chủ tài khoản/i);
  });

  it("rejects enabled state or completed-session material before recovery acknowledgement", () => {
    expect(() =>
      parseTwoFactorEnrollmentReceipt(
        {
          ...verifiedReceipt(),
          twoFactor: { enabled: true, method: "app", enrollmentPending: false },
        },
        intent,
      ),
    ).toThrow();
    expect(() =>
      parseTwoFactorEnrollmentReceipt(
        { ...verifiedReceipt(), twoFactorToken: "must-not-exist-before-ack" },
        intent,
      ),
    ).toThrow();
  });

  it("creates opaque bounded idempotency keys", () => {
    const key = createTwoFactorEnrollmentIdempotencyKey();
    expect(key).toMatch(/^two-factor-enrollment-/);
    expect(key.length).toBeLessThanOrEqual(160);
    expect(key).not.toContain(intent.userId);
    expect(key).not.toContain(intent.enrollmentId);
  });
});
