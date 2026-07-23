import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ForgotPasswordPage from "../../src/app/pages/auth/ForgotPasswordPage";

const sendPasswordReset = vi.fn();

vi.mock("../../src/lib/firebase-client", () => ({
  sendFirebasePasswordReset: (...args: unknown[]) => sendPasswordReset(...args),
}));

vi.mock("@/lib/useSEO", () => ({ useSEO: () => undefined }));

function renderPage() {
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => sendPasswordReset.mockReset());

  it("validates the labelled email field before calling Firebase", async () => {
    renderPage();
    fireEvent.submit(screen.getByRole("button", { name: "Gửi liên kết khôi phục" }).closest("form")!);

    expect(await screen.findByText("Vui lòng nhập email.")).toBeVisible();
    expect(screen.getByLabelText("Email nhận liên kết")).toHaveAttribute("aria-invalid", "true");
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it("shows an account-enumeration-safe recovery result after provider confirmation", async () => {
    sendPasswordReset.mockResolvedValue(undefined);
    renderPage();
    fireEvent.change(screen.getByLabelText("Email nhận liên kết"), {
      target: { value: "doctor@clinic.vn" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Gửi liên kết khôi phục" }).closest("form")!);

    await waitFor(() => expect(sendPasswordReset).toHaveBeenCalledWith("doctor@clinic.vn"));
    expect(
      await screen.findByText(/Nếu email doctor@clinic\.vn thuộc một tài khoản Shcare/i),
    ).toBeVisible();
  });

  it("does not leak raw provider errors", async () => {
    sendPasswordReset.mockImplementationOnce(() => {
      throw new Error("Firebase: Error (auth/network-request-failed).");
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Email nhận liên kết"), {
      target: { value: "doctor@clinic.vn" },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Gửi liên kết khôi phục" }).closest("form")!);

    expect(
      await screen.findByText("Không thể kết nối dịch vụ xác thực. Kiểm tra mạng rồi thử lại."),
    ).toBeVisible();
    expect(screen.queryByText(/Firebase: Error/i)).not.toBeInTheDocument();
  });
});
