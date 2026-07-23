import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceSettings from "../../src/app/pages/portal/WorkspaceSettings";

const api = vi.hoisted(() => ({
  me: vi.fn(),
  getSettings: vi.fn(),
  listSessions: vi.fn(),
  updateMe: vi.fn(),
  uploadMyAvatar: vi.fn(),
  downloadMyAvatar: vi.fn(),
  deleteMyAvatar: vi.fn(),
  changePassword: vi.fn(),
  revokeSession: vi.fn(),
  updateWorkspace: vi.fn(),
  authenticateFirebase: vi.fn(),
}));

const refreshUser = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

const rawUser = {
  id: "user-1",
  name: "Bác sĩ Test",
  email: "doctor@example.test",
  role: "workspace_admin",
  capabilities: ["workspace.settings.manage"],
  allowedSurfaces: ["portal"],
  organizationId: "workspace-1",
  currentWorkspaceId: "workspace-1",
  currentWorkspace: {
    id: "workspace-1",
    name: "Phòng khám Test",
    workspaceType: "clinic",
  },
  memberships: [
    {
      workspaceId: "workspace-1",
      role: "workspace_admin",
      workspaceName: "Phòng khám Test",
      workspaceType: "clinic",
    },
  ],
};

const authUser = {
  id: rawUser.id,
  name: rawUser.name,
  email: rawUser.email,
  role: rawUser.role,
  capabilities: rawUser.capabilities,
  allowedSurfaces: rawUser.allowedSurfaces,
  currentWorkspace: {
    id: "workspace-1",
    name: "Phòng khám Test",
    type: "clinic",
    role: "workspace_admin",
    patientCount: 0,
    deviceOnline: 0,
    alertCount: 0,
  },
  workspaces: [],
  raw: rawUser,
};

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: authUser, refreshUser }),
}));
vi.mock("../../src/lib/firebase-client", () => ({
  changeFirebasePassword: vi.fn(),
  hasFirebaseWebConfig: () => false,
}));
vi.mock("../../src/app/components/security/TwoFactorPanel", () => ({
  TwoFactorPanel: () => <div data-testid="two-factor-panel" />,
}));
vi.mock("sonner", () => ({ toast }));

function apiError(status: number, message: string) {
  return Object.assign(new Error(message), { status, code: "FORBIDDEN" });
}

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceSettings />
    </QueryClientProvider>,
  );
}

describe("WorkspaceSettings", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    refreshUser.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    api.me.mockResolvedValue({ user: rawUser });
    api.getSettings.mockResolvedValue({
      settings: {},
      workspace: {
        id: "workspace-1",
        name: "Phòng khám Test",
        type: "clinic",
      },
    });
    api.listSessions.mockResolvedValue({ sessions: [] });
    refreshUser.mockResolvedValue(authUser);
  });

  it("keeps account settings usable when workspace settings are forbidden", async () => {
    api.getSettings.mockRejectedValue(
      apiError(403, "internal workspace policy details"),
    );

    const { container } = renderSettings();

    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-workspace-tab")!);

    expect(
      await screen.findByText(/không có quyền.*workspace/i),
    ).toBeVisible();
    expect(screen.queryByText(/internal workspace policy details/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.getSettings).toHaveBeenCalledTimes(2));
  });

  it("shows a retryable session error instead of a false empty state", async () => {
    api.listSessions.mockRejectedValue(
      new Error("Failed to fetch internal session endpoint"),
    );

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);

    expect(
      await screen.findByText(/không thể.*phiên đăng nhập/i),
    ).toBeVisible();
    expect(screen.queryByText(/chưa có dữ liệu phiên đăng nhập/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/internal session endpoint/i),
    ).not.toBeInTheDocument();

    api.listSessions.mockResolvedValue({ sessions: [] });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/chưa có dữ liệu phiên đăng nhập/i)).toBeVisible();
  });

  it("requires confirmation and backend acknowledgement before reporting a revoked session", async () => {
    api.listSessions.mockResolvedValue({
      sessions: [
        {
          id: "session-current",
          current: true,
          provider: "firebase",
          deviceLabel: "Trình duyệt hiện tại",
        },
        {
          id: "session-other",
          current: false,
          provider: "firebase",
          deviceLabel: "Máy tính lạ",
        },
      ],
    });
    api.revokeSession.mockResolvedValue({
      revoked: false,
      session: { id: "session-other", current: false },
    });

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);

    const sessionRow = (await screen.findByText("Máy tính lạ")).closest(
      "div.bg-white\\/\\[0\\.02\\]",
    );
    expect(sessionRow).not.toBeNull();
    fireEvent.click(within(sessionRow!).getByRole("button", { name: "Thu hồi" }));
    expect(api.revokeSession).not.toHaveBeenCalled();

    fireEvent.click(
      within(sessionRow!).getByRole("button", { name: /xác nhận thu hồi/i }),
    );
    await waitFor(() =>
      expect(api.revokeSession).toHaveBeenCalledWith(
        "session-other",
        expect.any(String),
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/backend chưa xác nhận.*thu hồi phiên/i),
    ).toBeVisible();
  });

  it("reuses one idempotency key when a session revoke is retried", async () => {
    api.listSessions.mockResolvedValue({
      sessions: [
        {
          id: "session-other",
          current: false,
          provider: "firebase",
          deviceLabel: "Remote Chrome",
        },
      ],
    });
    api.revokeSession
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        revoked: true,
        session: {
          id: "session-other",
          current: false,
          revokedAt: "2026-07-14T00:00:00.000Z",
        },
      });

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    const sessionRow = (await screen.findByText("Remote Chrome")).closest(
      "div.bg-white\\/\\[0\\.02\\]",
    );
    expect(sessionRow).not.toBeNull();

    fireEvent.click(within(sessionRow!).getAllByRole("button")[0]);
    fireEvent.click(within(sessionRow!).getAllByRole("button")[0]);
    await waitFor(() =>
      expect(within(sessionRow!).getAllByRole("button")).toHaveLength(3),
    );
    fireEvent.click(within(sessionRow!).getAllByRole("button")[2]);
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledTimes(2));

    const firstKey = api.revokeSession.mock.calls[0][1];
    const secondKey = api.revokeSession.mock.calls[1][1];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("does not report profile success when the backend echoes unchanged user data", async () => {
    api.updateMe.mockResolvedValue({
      user: rawUser,
    });

    const { container } = renderSettings();
    const name = await waitFor(() => {
      const field = container.querySelector<HTMLInputElement>("#account-name");
      expect(field).toBeInTheDocument();
      return field!;
    });
    fireEvent.change(name, { target: { value: "Tên đã sửa" } });
    fireEvent.click(container.querySelector("#account-save-profile")!);

    expect(
      await screen.findByText(/backend chưa xác nhận.*hồ sơ/i),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeVisible();
  });

  it("rejects a workspace update response that does not contain the submitted values", async () => {
    api.updateWorkspace.mockResolvedValue({
      workspace: {
        id: "workspace-1",
        name: "Phòng khám Test",
        type: "clinic",
      },
    });

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-workspace-tab")!);
    await waitFor(() =>
      expect(container.querySelector("#workspace-save")).toBeInTheDocument(),
    );
    fireEvent.change(container.querySelector("#workspace-name")!, {
      target: { value: "Tên workspace mới" },
    });
    fireEvent.click(container.querySelector("#workspace-save")!);

    expect(
      await screen.findByText(/backend chưa xác nhận.*workspace hiện tại/i),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
  });
});
