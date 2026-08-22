import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EmailVerificationPage from "../../src/app/pages/auth/EmailVerificationPage";

const refreshVerification = vi.fn();
const authenticateFirebase = vi.fn();
const sendEmailVerification = vi.fn();

vi.mock("../../src/lib/firebase-client", () => ({
  refreshFirebaseVerification: (...args: unknown[]) =>
    refreshVerification(...args),
}));

vi.mock("../../src/lib/smart-health-api", () => ({
  smartHealthApi: {
    authenticateFirebase: (...args: unknown[]) => authenticateFirebase(...args),
    sendEmailVerification: (...args: unknown[]) =>
      sendEmailVerification(...args),
  },
}));

vi.mock("@/lib/useSEO", () => ({ useSEO: () => undefined }));

function renderPage() {
  render(
    <MemoryRouter>
      <EmailVerificationPage />
    </MemoryRouter>,
  );
}

describe("EmailVerificationPage", () => {
  beforeEach(() => {
    refreshVerification.mockReset();
    authenticateFirebase.mockReset();
    sendEmailVerification.mockReset();
  });

  it("keeps the user in a recoverable pending state until Firebase confirms verification", async () => {
    refreshVerification.mockResolvedValue({
      verified: false,
      idToken: "token",
    });
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "Kiểm tra trạng thái" }),
    );

    await waitFor(() => expect(refreshVerification).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        "Email chưa được xác minh. Mở liên kết trong hộp thư rồi kiểm tra lại.",
      ),
    ).toBeVisible();
    expect(authenticateFirebase).not.toHaveBeenCalled();
  });

  it("reports provider errors with safe recovery copy", async () => {
    refreshVerification.mockImplementationOnce(() => {
      throw new Error("Firebase: Error (auth/network-request-failed).");
    });
    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: "Kiểm tra trạng thái" }),
    );

    expect(
      await screen.findByText(
        "Không thể kết nối dịch vụ xác thực. Kiểm tra mạng rồi thử lại.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Firebase: Error/i)).not.toBeInTheDocument();
  });

  it("does not expose the delivery provider in user-facing confirmation", async () => {
    refreshVerification.mockResolvedValue({
      verified: false,
      idToken: "token",
    });
    authenticateFirebase.mockResolvedValue(undefined);
    sendEmailVerification.mockResolvedValue({
      status: "sent",
      email: "doctor@clinic.vn",
      provider: "internal-provider-name",
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Gửi lại email" }));

    expect(
      await screen.findByText(
        "Email xác minh đã được gửi đến doctor@clinic.vn.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/internal-provider-name/i),
    ).not.toBeInTheDocument();
  });
});
