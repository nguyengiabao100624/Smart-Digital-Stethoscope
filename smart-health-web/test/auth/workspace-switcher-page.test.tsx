import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceSwitcher from "../../src/app/pages/portal/WorkspaceSwitcher";

const navigate = vi.hoisted(() => vi.fn());
const switchWorkspace = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({
  isLoading: false,
  switchWorkspace,
  user: {
    id: "user-1",
    name: "Bác sĩ An",
    email: "doctor@shcare.test",
    role: "workspace_admin",
    capabilities: ["workspace.dashboard.view"],
    allowedSurfaces: ["portal"],
    currentWorkspace: {
      id: "workspace-1",
      name: "Phòng khám An Khang",
      type: "clinic",
      role: "workspace_admin",
      patientCount: 12,
      deviceOnline: 4,
      alertCount: 1,
      scanCount: 8,
      operational: true,
      membershipStatus: "active",
      workspaceStatus: "active",
      metricsAvailable: true,
    },
    workspaces: [],
    raw: {},
  },
}));

auth.user.workspaces = [
  auth.user.currentWorkspace,
  {
    id: "workspace-2",
    name: "Bệnh viện Bình An",
    type: "hospital",
    role: "doctor",
    patientCount: null,
    deviceOnline: null,
    alertCount: null,
    scanCount: null,
    operational: true,
    membershipStatus: "active",
    workspaceStatus: "active",
    metricsAvailable: false,
  },
  {
    id: "workspace-3",
    name: "Phòng khám tạm khóa",
    type: "clinic",
    role: "viewer",
    patientCount: null,
    deviceOnline: null,
    alertCount: null,
    scanCount: null,
    operational: false,
    membershipStatus: "suspended",
    workspaceStatus: "active",
    metricsAvailable: false,
  },
];

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => auth,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkspaceSwitcher />
    </MemoryRouter>,
  );
}

describe("Portal WorkspaceSwitcher", () => {
  beforeEach(() => {
    navigate.mockReset();
    switchWorkspace.mockReset();
    auth.isLoading = false;
    auth.user = {
      ...auth.user,
      workspaces: [...auth.user.workspaces],
    };
    switchWorkspace.mockResolvedValue(undefined);
  });

  it("uses one canonical heading, no legacy visual classes and never fabricates unavailable metrics", () => {
    const { container } = renderPage();

    expect(
      screen.getByRole("heading", { name: "Chọn workspace", level: 1 }),
    ).toBeVisible();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(
      container.querySelector(
        ".glass-panel, .brand-gradient-text, .premium-button, .premium-card",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("12 bệnh nhân")).toBeVisible();
    expect(screen.getByText("Số liệu vận hành chưa sẵn sàng")).toBeVisible();
    expect(
      screen.queryByText("0 bệnh nhân", { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("disables a non-operational membership and explains the backend state", () => {
    renderPage();

    const suspended = screen.getByRole("button", {
      name: /Phòng khám tạm khóa/i,
    });
    expect(suspended).toBeDisabled();
    expect(screen.getByText("Membership đang tạm khóa")).toBeVisible();
  });

  it("navigates only after the backend switch promise is confirmed", async () => {
    let confirmSwitch: (() => void) | undefined;
    switchWorkspace.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          confirmSwitch = resolve;
        }),
    );
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /Bệnh viện Bình An/i }),
    );
    expect(switchWorkspace).toHaveBeenCalledWith("workspace-2");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText("Đang chuyển…")).toBeVisible();

    confirmSwitch?.();
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/portal/dashboard", {
        replace: true,
      }),
    );
  });

  it("keeps the selected workspace retryable when backend confirmation fails", async () => {
    switchWorkspace.mockRejectedValueOnce(
      new Error("Backend chưa xác nhận workspace đã chọn."),
    );
    renderPage();

    const target = screen.getByRole("button", {
      name: /Bệnh viện Bình An/i,
    });
    fireEvent.click(target);

    expect(
      await screen.findByText("Backend chưa xác nhận workspace đã chọn."),
    ).toBeVisible();
    expect(target).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
