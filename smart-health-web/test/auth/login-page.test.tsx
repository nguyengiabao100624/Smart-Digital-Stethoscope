import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "../../src/app/pages/auth/LoginPage";

const authState = vi.hoisted(() => ({
  login: vi.fn(),
  completeTwoFactorLogin: vi.fn(),
  cancelTwoFactorLogin: vi.fn(),
  twoFactorChallenge: null as null | {
    challengeId: string;
    method: "app";
    expiresAt: string;
  },
}));

const login = authState.login;

vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/useSEO", () => ({ useSEO: () => undefined }));

describe("LoginPage", () => {
  beforeEach(() => {
    login.mockReset();
    authState.completeTwoFactorLogin.mockReset();
    authState.cancelTwoFactorLogin.mockReset();
    authState.twoFactorChallenge = null;
  });

  it("shows field-level validation and does not call login for an empty form", async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: "Đăng nhập" });
    fireEvent.submit(button.closest("form")!);

    expect(await screen.findByText("Vui lòng nhập email.")).toBeVisible();
    expect(screen.getByText("Vui lòng nhập mật khẩu.")).toBeVisible();
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email đăng nhập")).toHaveAttribute("aria-invalid", "true");
  });

  it("renders a safe recovery message instead of a raw provider error", async () => {
    login.mockResolvedValue({
      success: false,
      error: "Firebase: Error (auth/invalid-credential).",
    });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email đăng nhập"), {
      target: { value: "doctor@clinic.vn" },
    });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), {
      target: { value: "valid-password" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Đăng nhập" }).closest("form")!);

    await waitFor(() => expect(login).toHaveBeenCalledWith("doctor@clinic.vn", "valid-password"));
    expect(
      await screen.findByText("Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại."),
    ).toBeVisible();
    expect(screen.queryByText(/Firebase: Error/i)).not.toBeInTheDocument();
  });

  it("requires a six-digit backend-confirmed OTP for the second step", async () => {
    authState.twoFactorChallenge = {
      challengeId: "challenge_1",
      method: "app",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
    authState.completeTwoFactorLogin.mockResolvedValue({
      success: false,
      error: "TWO_FACTOR_CODE_INVALID",
    });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Xác minh bước thứ hai")).toBeVisible();
    expect(screen.queryByLabelText("Mật khẩu")).not.toBeInTheDocument();
    const otp = screen.getByLabelText("Mã xác thực");
    fireEvent.change(otp, { target: { value: "12ab" } });
    fireEvent.submit(
      screen.getByRole("button", { name: "Xác minh và tiếp tục" }).closest("form")!,
    );
    expect(await screen.findByText("Nhập đủ 6 chữ số trên ứng dụng xác thực.")).toBeVisible();
    expect(authState.completeTwoFactorLogin).not.toHaveBeenCalled();

    fireEvent.change(otp, { target: { value: "123456" } });
    fireEvent.submit(
      screen.getByRole("button", { name: "Xác minh và tiếp tục" }).closest("form")!,
    );
    await waitFor(() =>
      expect(authState.completeTwoFactorLogin).toHaveBeenCalledWith("123456"),
    );
    expect(
      await screen.findByText(
        "Mã xác thực chưa đúng hoặc đã hết hạn. Vui lòng kiểm tra và thử lại.",
      ),
    ).toBeVisible();
  });
});
