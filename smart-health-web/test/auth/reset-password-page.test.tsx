import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ResetPasswordPage from "../../src/app/pages/auth/ResetPasswordPage";

const verifyResetCode = vi.fn();
const confirmReset = vi.fn();

vi.mock("../../src/lib/firebase-client", () => ({
  verifyFirebasePasswordResetCode: (...args: unknown[]) =>
    verifyResetCode(...args),
  confirmFirebasePasswordReset: (...args: unknown[]) => confirmReset(...args),
}));

vi.mock("@/lib/useSEO", () => ({ useSEO: () => undefined }));

function renderPage(entry = "/dat-lai-mat-khau") {
  const router = createMemoryRouter(
    [{ path: "/dat-lai-mat-khau", element: <ResetPasswordPage /> }],
    { initialEntries: [entry] },
  );
  render(<RouterProvider router={router} />);
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    verifyResetCode.mockReset();
    confirmReset.mockReset();
  });

  it("rejects a missing action code without calling Firebase", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Liên kết đặt lại mật khẩu không hợp lệ",
      }),
    ).toBeVisible();
    expect(verifyResetCode).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Yêu cầu liên kết mới" }),
    ).toHaveAttribute("href", "/quen-mat-khau");
  });

  it("verifies the one-time code before exposing the password form", async () => {
    verifyResetCode.mockResolvedValue("doctor@clinic.vn");
    renderPage("/dat-lai-mat-khau?mode=resetPassword&oobCode=one-time-secret");

    await waitFor(() =>
      expect(verifyResetCode).toHaveBeenCalledWith("one-time-secret"),
    );
    expect(
      await screen.findByRole("heading", { name: "Tạo mật khẩu mới" }),
    ).toBeVisible();
    expect(screen.getByText(/d\*+@clinic\.vn/i)).toBeVisible();
    expect(screen.queryByText("one-time-secret")).not.toBeInTheDocument();
  });

  it("validates both labelled fields before confirming the reset", async () => {
    verifyResetCode.mockResolvedValue("doctor@clinic.vn");
    renderPage("/dat-lai-mat-khau?mode=resetPassword&oobCode=one-time-secret");
    await screen.findByRole("heading", { name: "Tạo mật khẩu mới" });

    fireEvent.submit(
      screen.getByRole("button", { name: "Đặt mật khẩu mới" }).closest("form")!,
    );

    expect(
      await screen.findByText("Vui lòng nhập mật khẩu mới."),
    ).toBeVisible();
    expect(screen.getByLabelText("Mật khẩu mới")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(confirmReset).not.toHaveBeenCalled();
  });

  it("reports success only after Firebase confirms the one-time code", async () => {
    verifyResetCode.mockResolvedValue("doctor@clinic.vn");
    confirmReset.mockResolvedValue(undefined);
    renderPage("/dat-lai-mat-khau?mode=resetPassword&oobCode=one-time-secret");
    await screen.findByRole("heading", { name: "Tạo mật khẩu mới" });

    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), {
      target: { value: "secure-pass-123" },
    });
    fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu mới"), {
      target: { value: "secure-pass-123" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Đặt mật khẩu mới" }).closest("form")!,
    );

    await waitFor(() =>
      expect(confirmReset).toHaveBeenCalledWith(
        "one-time-secret",
        "secure-pass-123",
      ),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Mật khẩu đã được cập nhật",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("turns expired provider codes into a recoverable state", async () => {
    verifyResetCode.mockRejectedValue(
      Object.assign(new Error("Firebase internal detail"), {
        code: "auth/expired-action-code",
      }),
    );
    renderPage("/dat-lai-mat-khau?mode=resetPassword&oobCode=expired-secret");

    expect(
      await screen.findByRole("heading", {
        name: "Liên kết đặt lại mật khẩu đã hết hạn",
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(/Firebase internal detail/i),
    ).not.toBeInTheDocument();
  });
});
