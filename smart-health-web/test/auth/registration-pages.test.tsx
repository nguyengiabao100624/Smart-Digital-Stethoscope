import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import RegisterClinicPage from "../../src/app/pages/auth/RegisterClinicPage";
import RegisterDoctorPage from "../../src/app/pages/auth/RegisterDoctorPage";

vi.mock("@/lib/useSEO", () => ({ useSEO: () => undefined }));

vi.mock("../../src/lib/firebase-client", () => ({
  createFirebaseAccount: vi.fn(),
}));

vi.mock("../../src/lib/smart-health-api", () => ({
  smartHealthApi: {
    authenticateFirebase: vi.fn(),
    requestRole: vi.fn(),
    requestWorkspace: vi.fn(),
    uploadRoleRequestDocument: vi.fn(),
    sendEmailVerification: vi.fn(),
  },
}));

function renderRoute(node: React.ReactNode) {
  const router = createMemoryRouter([{ path: "/", element: node }]);
  render(<RouterProvider router={router} />);
  return router;
}

describe("registration pages", () => {
  it("keeps doctor registration on the account step until its fields are valid", async () => {
    renderRoute(<RegisterDoctorPage />);
    fireEvent.submit(screen.getByRole("button", { name: "Tiếp tục" }).closest("form")!);

    expect(await screen.findByText("Vui lòng nhập họ và tên.")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Tiến trình đăng ký" })).toHaveTextContent(
      "Bước 1 / 6",
    );
    expect(screen.getByLabelText("Email đăng nhập")).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps clinic registration on the representative step until its fields are valid", async () => {
    renderRoute(<RegisterClinicPage />);
    fireEvent.submit(screen.getByRole("button", { name: "Tiếp tục" }).closest("form")!);

    expect(await screen.findByText("Vui lòng nhập người đại diện.")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Tiến trình đăng ký" })).toHaveTextContent(
      "Bước 1 / 5",
    );
    expect(screen.getByLabelText("Email đăng nhập")).toHaveAttribute("aria-invalid", "true");
  });

  it("warns before leaving a registration form that has unsaved input", async () => {
    const router = createMemoryRouter([
      { path: "/", element: <RegisterDoctorPage /> },
      { path: "/away", element: <h1>Trang khác</h1> },
    ]);
    render(<RouterProvider router={router} />);
    fireEvent.change(screen.getByLabelText("Họ và tên"), { target: { value: "Bác sĩ Minh" } });

    await act(async () => {
      await router.navigate("/away");
    });

    expect(await screen.findByRole("alertdialog", { name: "Bạn chưa gửi hồ sơ" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục chỉnh sửa" }));
    expect(screen.getByRole("heading", { name: "Đăng ký tài khoản bác sĩ" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
  });
});
