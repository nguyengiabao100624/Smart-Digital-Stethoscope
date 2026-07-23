import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TwoFactorPanel } from "../../src/app/components/security/TwoFactorPanel";

const api = vi.hoisted(() => ({
  getTwoFactorStatus: vi.fn(),
  startTwoFactorEnrollment: vi.fn(),
  verifyTwoFactorEnrollment: vi.fn(),
  disableTwoFactor: vi.fn(),
}));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPanel(onStatusChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TwoFactorPanel onStatusChange={onStatusChange} />
    </QueryClientProvider>,
  );
  return onStatusChange;
}

describe("TwoFactorPanel", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
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
      twoFactor: { enabled: true, method: "app", enrollmentPending: false },
      recoveryCodes: [
        "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8",
      ],
      twoFactorToken: "verified-token-0123456789abcdef",
      tokenExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    const onStatusChange = renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Bắt đầu thiết lập" }),
    );
    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeVisible();
    expect(screen.getByText("Chưa bật 2FA")).toBeVisible();
    expect(screen.queryByText("Đang bảo vệ bằng OTP")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mã OTP 6 chữ số"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Xác minh và bật 2FA" }),
    );

    expect(await screen.findByText("Lưu mã khôi phục ngay")).toBeVisible();
    expect(screen.getByText("Đang bảo vệ bằng OTP")).toBeVisible();
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(true, "app"));
  });
});
