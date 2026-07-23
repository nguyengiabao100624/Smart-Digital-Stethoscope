import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ApprovalPendingPage from "../../src/app/pages/auth/ApprovalPendingPage";

const mocks = vi.hoisted(() => ({
  refreshUser: vi.fn(),
  requestRole: vi.fn(),
  requestWorkspace: vi.fn(),
  uploadRoleRequestDocument: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/lib/useSEO", () => ({ useSEO: () => undefined }));
vi.mock("../../src/app/context/AuthContext", () => ({ useAuth: mocks.useAuth }));
vi.mock("../../src/lib/smart-health-api", () => ({
  smartHealthApi: {
    requestRole: mocks.requestRole,
    requestWorkspace: mocks.requestWorkspace,
    uploadRoleRequestDocument: mocks.uploadRoleRequestDocument,
  },
}));

function renderPage() {
  const router = createMemoryRouter([{ path: "/", element: <ApprovalPendingPage /> }]);
  render(<RouterProvider router={router} />);
}

describe("ApprovalPendingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({
      user: {
        raw: {
          roleRequestStatus: "needs_info",
          requestedRole: "doctor",
          roleInfoRequiredFields: ["license"],
          name: "Bác sĩ Minh",
        },
      },
      refreshUser: mocks.refreshUser,
    });
  });

  it("associates missing requested information with its field and blocks the mutation", async () => {
    renderPage();

    fireEvent.submit(screen.getByRole("button", { name: "Gửi lại hồ sơ" }).closest("form")!);

    expect(await screen.findByText("Vui lòng nhập mã chứng chỉ hành nghề.")).toBeVisible();
    expect(screen.getByLabelText("Mã chứng chỉ hành nghề")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.requestRole).not.toHaveBeenCalled();
  });

  it("does not expose a raw provider error when status refresh fails", async () => {
    mocks.useAuth.mockReturnValue({
      user: { raw: { roleRequestStatus: "pending", requestedRole: "doctor" } },
      refreshUser: mocks.refreshUser,
    });
    mocks.refreshUser.mockRejectedValueOnce(new Error("FirebaseError: auth/internal-error stack trace"));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Cập nhật trạng thái" }));

    expect(await screen.findByText("Không thể cập nhật trạng thái. Vui lòng thử lại.")).toBeVisible();
    expect(screen.queryByText(/FirebaseError/i)).not.toBeInTheDocument();
  });
});
