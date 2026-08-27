import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TwoFactorPanel } from "../../src/app/components/security/TwoFactorPanel";

const api = vi.hoisted(() => ({
  getAuthSessionEpochSnapshot: vi.fn(),
  getTwoFactorStatus: vi.fn(),
  startTwoFactorEnrollment: vi.fn(),
  verifyTwoFactorEnrollment: vi.fn(),
  acknowledgeTwoFactorRecoveryCodes: vi.fn(),
  disableTwoFactor: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("sonner", () => ({ toast }));

function renderPanel(
  onStatusChange = vi.fn(),
  onPendingRecoveryChange = vi.fn(),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TwoFactorPanel
        userId="user-1"
        onStatusChange={onStatusChange}
        onPendingRecoveryChange={onPendingRecoveryChange}
      />
    </QueryClientProvider>,
  );
  return onStatusChange;
}

describe("TwoFactorPanel", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    Object.values(toast).forEach((mock) => mock.mockReset());
    api.getAuthSessionEpochSnapshot.mockReturnValue(1);
  });

  it("refetches account-scoped status after the active account changes", async () => {
    api.getTwoFactorStatus
      .mockResolvedValueOnce({
        availability: {
          available: true,
          status: "available",
          methods: ["app"],
          reason: "",
        },
        twoFactor: { enabled: true, method: "app", enrollmentPending: false },
      })
      .mockResolvedValueOnce({
        availability: {
          available: true,
          status: "available",
          methods: ["app"],
          reason: "",
        },
        twoFactor: { enabled: false, method: "", enrollmentPending: false },
      });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <TwoFactorPanel userId="user-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Đang bảo vệ bằng OTP")).toBeVisible();
    view.rerender(
      <QueryClientProvider client={client}>
        <TwoFactorPanel userId="user-2" />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(api.getTwoFactorStatus).toHaveBeenCalledTimes(2),
    );
    expect(await screen.findByText("Chưa bật 2FA")).toBeVisible();
  });

  it("discards a late enrollment response after the active account changes", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: true,
        status: "available",
        methods: ["app"],
        reason: "",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: false },
    });
    let resolveEnrollment:
      | ((value: {
          twoFactor: {
            enabled: boolean;
            method: string;
            enrollmentPending: boolean;
          };
          enrollment: {
            id: string;
            method: string;
            manualKey: string;
            otpauthUri: string;
            expiresAt: string;
          };
        }) => void)
      | undefined;
    api.startTwoFactorEnrollment.mockReturnValue(
      new Promise((resolve) => {
        resolveEnrollment = resolve;
      }),
    );
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <TwoFactorPanel userId="user-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Bắt đầu thiết lập" }),
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <TwoFactorPanel userId="user-2" />
      </QueryClientProvider>,
    );
    resolveEnrollment?.({
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      enrollment: {
        id: "enrollment-user-1",
        method: "app",
        manualKey: "OLDACCOUNTKEY",
        otpauthUri:
          "otpauth://totp/Shcare:user-1?secret=OLDACCOUNTKEY&issuer=Shcare",
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    });

    await waitFor(() =>
      expect(api.startTwoFactorEnrollment).toHaveBeenCalled(),
    );
    expect(screen.queryByText("OLDACCOUNTKEY")).not.toBeInTheDocument();
  });

  it("fails closed when secure 2FA storage is unavailable", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: false,
        status: "unavailable",
        methods: [],
        reason: "secure_storage_not_configured",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: false },
    });

    renderPanel();

    expect(
      await screen.findByText(/2FA đang tạm không khả dụng/i),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Bắt đầu thiết lập" }),
    ).not.toBeInTheDocument();
  });

  it("retries an ambiguous enrollment start with one owner and epoch bound key", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: true,
        status: "available",
        methods: ["app"],
        reason: "",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: false },
    });
    api.startTwoFactorEnrollment
      .mockRejectedValueOnce(new Error("ambiguous enrollment response loss"))
      .mockResolvedValueOnce({
        userId: "user-1",
        twoFactor: { enabled: false, method: "", enrollmentPending: true },
        enrollment: {
          id: "enroll_start_retry",
          method: "app",
          manualKey: "JBSWY3DPEHPK3PXP",
          otpauthUri:
            "otpauth://totp/Shcare:user?secret=JBSWY3DPEHPK3PXP&issuer=Shcare",
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
        replayed: true,
        superseded: false,
      });
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Bắt đầu thiết lập" }),
    );
    expect(await screen.findByText("ambiguous enrollment response loss")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Bắt đầu thiết lập" }),
    );

    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeVisible();
    expect(api.startTwoFactorEnrollment).toHaveBeenCalledTimes(2);
    const [firstIntent] = api.startTwoFactorEnrollment.mock.calls[0];
    const [retryIntent] = api.startTwoFactorEnrollment.mock.calls[1];
    expect(firstIntent).toMatchObject({
      userId: "user-1",
      authSessionEpoch: 1,
    });
    expect(firstIntent.idempotencyKey).toMatch(/^two-factor-enrollment-/);
    expect(retryIntent).toEqual(firstIntent);
  });

  it("reuses the exact verification key after an ambiguous response and never reports early success", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: true,
        status: "available",
        methods: ["app"],
        reason: "",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: false },
    });
    api.startTwoFactorEnrollment.mockResolvedValue({
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      enrollment: {
        id: "enroll_retry",
        method: "app",
        manualKey: "RETRYENROLLMENTKEY",
        otpauthUri:
          "otpauth://totp/Shcare:user?secret=RETRYENROLLMENTKEY&issuer=Shcare",
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    });
    api.verifyTwoFactorEnrollment
      .mockRejectedValueOnce(new Error("ambiguous response loss"))
      .mockResolvedValueOnce({
        userId: "user-1",
        enrollmentId: "enroll_retry",
        twoFactor: { enabled: false, method: "", enrollmentPending: true },
        recoveryCodes: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"],
        recoveryDelivery: {
          id: "2fa_delivery_retry",
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          acknowledged: false,
        },
        recoveryAckToken: "pending-recovery-ack-token-retry",
        replayed: true,
      });
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Bắt đầu thiết lập" }),
    );
    fireEvent.change(await screen.findByLabelText("Mã OTP 6 chữ số"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Xác minh mã OTP" }),
    );
    expect(await screen.findByText("ambiguous response loss")).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Xác minh mã OTP" }),
    );
    expect(await screen.findByText("Lưu mã khôi phục ngay")).toBeVisible();
    expect(api.verifyTwoFactorEnrollment).toHaveBeenCalledTimes(2);
    expect(api.verifyTwoFactorEnrollment.mock.calls[1][0].idempotencyKey).toBe(
      api.verifyTwoFactorEnrollment.mock.calls[0][0].idempotencyKey,
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("does not show enabled until the backend verifies the OTP", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: true,
        status: "available",
        methods: ["app"],
        reason: "",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: false },
    });
    api.startTwoFactorEnrollment.mockResolvedValue({
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      enrollment: {
        id: "enroll_1",
        method: "app",
        manualKey: "JBSWY3DPEHPK3PXP",
        otpauthUri:
          "otpauth://totp/Shcare:user?secret=JBSWY3DPEHPK3PXP&issuer=Shcare",
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    });
    api.verifyTwoFactorEnrollment.mockResolvedValue({
      userId: "user-1",
      enrollmentId: "enroll_1",
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      recoveryCodes: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"],
      recoveryDelivery: {
        id: "2fa_delivery_user_1",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        acknowledged: false,
      },
      recoveryAckToken: "pending-recovery-ack-token-user-1",
      replayed: false,
    });
    api.acknowledgeTwoFactorRecoveryCodes.mockResolvedValue({
      userId: "user-1",
      enrollmentId: "enroll_1",
      twoFactor: { enabled: true, method: "app", enrollmentPending: false },
      recoveryDelivery: {
        id: "2fa_delivery_user_1",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
      },
      twoFactorToken: "completed-two-factor-token-user-1",
      tokenExpiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
      replayed: false,
    });
    const onPendingRecoveryChange = vi.fn();
    const onStatusChange = renderPanel(undefined, onPendingRecoveryChange);

    fireEvent.click(
      await screen.findByRole("button", { name: "Bắt đầu thiết lập" }),
    );
    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeVisible();
    expect(
      screen.getByText("Đang chờ xác nhận mã khôi phục"),
    ).toBeVisible();
    expect(screen.queryByText("Đang bảo vệ bằng OTP")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mã OTP 6 chữ số"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Xác minh mã OTP" }),
    );

    expect(await screen.findByText("Lưu mã khôi phục ngay")).toBeVisible();
    expect(onPendingRecoveryChange).toHaveBeenLastCalledWith(true);
    expect(
      screen.getByText("Đang chờ xác nhận mã khôi phục"),
    ).toBeVisible();
    expect(screen.queryByText("Đang bảo vệ bằng OTP")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith(false, ""),
    );

    const verifyIntent = api.verifyTwoFactorEnrollment.mock.calls[0][0];
    expect(verifyIntent).toMatchObject({
      userId: "user-1",
      enrollmentId: "enroll_1",
      code: "123456",
    });
    expect(verifyIntent.idempotencyKey).toMatch(/^two-factor-enrollment-/);

    fireEvent.click(
      screen.getByRole("checkbox", { name: /tôi đã lưu mã khôi phục/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Xác nhận và bật 2FA" }),
    );
    await waitFor(() =>
      expect(api.acknowledgeTwoFactorRecoveryCodes).toHaveBeenCalledWith({
        userId: "user-1",
        authSessionEpoch: 1,
        enrollmentId: "enroll_1",
        deliveryId: "2fa_delivery_user_1",
        recoveryAckToken: "pending-recovery-ack-token-user-1",
        idempotencyKey: verifyIntent.idempotencyKey,
      }),
    );
    expect(await screen.findByText("Đang bảo vệ bằng OTP")).toBeVisible();
    expect(onPendingRecoveryChange).toHaveBeenLastCalledWith(false);
  });

  it("returns an already-used enrollment to a safe restart with a fresh start key", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: true,
        status: "available",
        methods: ["app"],
        reason: "",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: false },
    });
    api.startTwoFactorEnrollment
      .mockResolvedValueOnce({
        userId: "user-1",
        twoFactor: { enabled: false, method: "", enrollmentPending: true },
        enrollment: {
          id: "enroll_used",
          method: "app",
          manualKey: "ALREADYUSEDKEY",
          otpauthUri:
            "otpauth://totp/Shcare:user?secret=ALREADYUSEDKEY&issuer=Shcare",
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
        replayed: false,
        superseded: false,
      })
      .mockResolvedValueOnce({
        userId: "user-1",
        twoFactor: { enabled: false, method: "", enrollmentPending: true },
        enrollment: {
          id: "enroll_fresh",
          method: "app",
          manualKey: "FRESHSTARTKEY",
          otpauthUri:
            "otpauth://totp/Shcare:user?secret=FRESHSTARTKEY&issuer=Shcare",
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        },
        replayed: false,
        superseded: true,
      });
    api.verifyTwoFactorEnrollment.mockRejectedValue(
      Object.assign(new Error("Enrollment is no longer available."), {
        code: "TWO_FACTOR_ENROLLMENT_ALREADY_USED",
      }),
    );
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Bắt đầu thiết lập" }),
    );
    fireEvent.change(await screen.findByLabelText("Mã OTP 6 chữ số"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Xác minh mã OTP" }));

    expect(
      await screen.findByText(/lần thiết lập này không còn hiệu lực/i),
    ).toBeVisible();
    expect(screen.queryByText("ALREADYUSEDKEY")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Bắt đầu/ }),
    );

    expect(await screen.findByText("FRESHSTARTKEY")).toBeVisible();
    const firstIntent = api.startTwoFactorEnrollment.mock.calls[0][0];
    const secondIntent = api.startTwoFactorEnrollment.mock.calls[1][0];
    expect(secondIntent.idempotencyKey).not.toBe(firstIntent.idempotencyKey);
  });

  it("keeps valid recovery codes after an ambiguous ACK but clears them after definitive expiry", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: true,
        status: "available",
        methods: ["app"],
        reason: "",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: false },
    });
    api.startTwoFactorEnrollment.mockResolvedValue({
      userId: "user-1",
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      enrollment: {
        id: "enroll_ack_expiry",
        method: "app",
        manualKey: "ACKEXPIRYKEY",
        otpauthUri:
          "otpauth://totp/Shcare:user?secret=ACKEXPIRYKEY&issuer=Shcare",
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
      replayed: false,
      superseded: false,
    });
    api.verifyTwoFactorEnrollment.mockResolvedValue({
      userId: "user-1",
      enrollmentId: "enroll_ack_expiry",
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      recoveryCodes: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"],
      recoveryDelivery: {
        id: "delivery_ack_expiry",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        acknowledged: false,
      },
      recoveryAckToken: "pending-recovery-ack-token-expiry",
      replayed: false,
    });
    api.acknowledgeTwoFactorRecoveryCodes
      .mockRejectedValueOnce(new Error("ambiguous acknowledgement response loss"))
      .mockRejectedValueOnce(
        Object.assign(new Error("Recovery acknowledgement expired."), {
          code: "TWO_FACTOR_DELIVERY_EXPIRED",
        }),
      );
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Bắt đầu thiết lập" }),
    );
    fireEvent.change(await screen.findByLabelText("Mã OTP 6 chữ số"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Xác minh mã OTP" }));
    expect(await screen.findByText("A1")).toBeVisible();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /tôi đã lưu mã khôi phục/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Xác nhận và bật 2FA" }),
    );

    expect(
      await screen.findByText("ambiguous acknowledgement response loss"),
    ).toBeVisible();
    expect(screen.getByText("A1")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Xác nhận và bật 2FA" }),
    );

    expect(
      await screen.findByText(/thời hạn xác nhận bộ mã khôi phục đã hết/i),
    ).toBeVisible();
    expect(screen.queryByText("A1")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bắt đầu thiết lập" }),
    ).toBeEnabled();
  });

  it("shows a truthful restart state when recovery acknowledgement is pending after reload", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: true,
        status: "available",
        methods: ["app"],
        reason: "",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
    });

    renderPanel();

    expect(
      await screen.findByText("Đang chờ xác nhận mã khôi phục"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Bắt đầu lại an toàn" }),
    ).toBeEnabled();
    expect(screen.queryByText("Đang bảo vệ bằng OTP")).not.toBeInTheDocument();
  });

  it("guards unload and reports when one-time recovery codes are visible", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: true,
        status: "available",
        methods: ["app"],
        reason: "",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: false },
    });
    api.startTwoFactorEnrollment.mockResolvedValue({
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      enrollment: {
        id: "enroll_guard",
        method: "app",
        manualKey: "GUARDENROLLMENTKEY",
        otpauthUri:
          "otpauth://totp/Shcare:user?secret=GUARDENROLLMENTKEY&issuer=Shcare",
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    });
    api.verifyTwoFactorEnrollment.mockResolvedValue({
      userId: "user-1",
      enrollmentId: "enroll_guard",
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      recoveryCodes: [
        "G1",
        "G2",
        "G3",
        "G4",
        "G5",
        "G6",
        "G7",
        "G8",
      ],
      recoveryDelivery: {
        id: "delivery_guard",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        acknowledged: false,
      },
      recoveryAckToken: "pending-recovery-ack-token-guard",
      replayed: false,
    });
    const onPendingRecoveryChange = vi.fn();
    renderPanel(undefined, onPendingRecoveryChange);

    fireEvent.click(
      await screen.findByRole("button", { name: "Bắt đầu thiết lập" }),
    );
    fireEvent.change(await screen.findByLabelText("Mã OTP 6 chữ số"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Xác minh mã OTP" }));
    expect(await screen.findByText("Lưu mã khôi phục ngay")).toBeVisible();
    expect(onPendingRecoveryChange).toHaveBeenLastCalledWith(true);

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it("rejects a late verification receipt after the same user starts a new auth session", async () => {
    api.getTwoFactorStatus.mockResolvedValue({
      availability: {
        available: true,
        status: "available",
        methods: ["app"],
        reason: "",
      },
      twoFactor: { enabled: false, method: "", enrollmentPending: false },
    });
    api.startTwoFactorEnrollment.mockResolvedValue({
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      enrollment: {
        id: "enroll_session_a",
        method: "app",
        manualKey: "SESSIONAENROLLMENTKEY",
        otpauthUri:
          "otpauth://totp/Shcare:user?secret=SESSIONAENROLLMENTKEY&issuer=Shcare",
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      },
    });
    let resolveVerification:
      | ((value: {
          userId: string;
          enrollmentId: string;
          twoFactor: {
            enabled: boolean;
            method: string;
            enrollmentPending: boolean;
          };
          recoveryCodes: string[];
          recoveryDelivery: {
            id: string;
            expiresAt: string;
            acknowledged: boolean;
          };
          recoveryAckToken: string;
          replayed: boolean;
        }) => void)
      | undefined;
    api.verifyTwoFactorEnrollment.mockReturnValue(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <TwoFactorPanel userId="user-1" />
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Bắt đầu thiết lập" }),
    );
    fireEvent.change(await screen.findByLabelText("Mã OTP 6 chữ số"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Xác minh mã OTP" }));
    await waitFor(() => expect(api.verifyTwoFactorEnrollment).toHaveBeenCalled());
    expect(api.verifyTwoFactorEnrollment.mock.calls[0][0].authSessionEpoch).toBe(
      1,
    );

    api.getAuthSessionEpochSnapshot.mockReturnValue(2);
    view.rerender(
      <QueryClientProvider client={client}>
        <TwoFactorPanel userId="user-1" />
      </QueryClientProvider>,
    );
    resolveVerification?.({
      userId: "user-1",
      enrollmentId: "enroll_session_a",
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      recoveryCodes: [
        "OLD1",
        "OLD2",
        "OLD3",
        "OLD4",
        "OLD5",
        "OLD6",
        "OLD7",
        "OLD8",
      ],
      recoveryDelivery: {
        id: "delivery_session_a",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        acknowledged: false,
      },
      recoveryAckToken: "pending-recovery-ack-token-session-a",
      replayed: false,
    });

    expect(
      await screen.findByText(/tài khoản hoặc phiên đăng nhập đã thay đổi/i),
    ).toBeVisible();
    expect(screen.queryByText("OLD1")).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
