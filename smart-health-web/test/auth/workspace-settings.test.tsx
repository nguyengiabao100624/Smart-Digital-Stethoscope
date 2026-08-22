import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createContext, useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceSettings from "../../src/app/pages/portal/WorkspaceSettings";
import {
  hashAvatarFile,
  type AvatarDeleteIntent,
  type AvatarUploadIntent,
} from "../../src/lib/avatar-operations";
import type { AccountProfileUpdateIntent } from "../../src/lib/smart-health-api";

const api = vi.hoisted(() => ({
  me: vi.fn(),
  getSettings: vi.fn(),
  listSessions: vi.fn(),
  getNotificationPreferences: vi.fn(),
  patchNotificationPreference: vi.fn(),
  updateMe: vi.fn(),
  uploadMyAvatar: vi.fn(),
  downloadMyAvatar: vi.fn(),
  deleteMyAvatar: vi.fn(),
  getMyAvatarCleanupStatus: vi.fn(),
  changePassword: vi.fn(),
  revokeSession: vi.fn(),
  updateWorkspace: vi.fn(),
  authenticateFirebase: vi.fn(),
  getTokenSnapshot: vi.fn(),
  getAuthSessionEpochSnapshot: vi.fn(),
  resolveAvatarMutationAuthority: vi.fn(),
  clearTokenIfMatches: vi.fn(),
}));

const avatarAuthorityState = vi.hoisted(() => ({
  token: "backend-token-user-1",
  epoch: 1,
  sessionId: "auth-session-e1",
}));

const refreshUser = vi.hoisted(() => vi.fn());
const logout = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
const authState = vi.hoisted(() => ({ user: null as unknown }));
const firebasePassword = vi.hoisted(() => ({
  configured: vi.fn(),
  currentUid: vi.fn(),
  reauthenticate: vi.fn(),
}));

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

const notificationPreferences = {
  enabled: true,
  doctorRequests: true,
  abnormalResults: true,
  deviceOffline: true,
  appointments: true,
  messages: true,
  aiUpdates: false,
  newLogin: true,
};

function notificationSnapshot(preferences = notificationPreferences) {
  return {
    userId: "user-1",
    workspaceId: "workspace-1",
    ownership: { kind: "self" as const, userId: "user-1" },
    preferences,
    channels: {
      inApp: { available: true, status: "ready", reasonCode: "" },
      email: {
        available: false,
        status: "unavailable",
        reasonCode: "PROVIDER_UNAVAILABLE",
      },
      push: { available: true, status: "ready", reasonCode: "" },
    },
    updatedAt: "2026-07-28T10:00:00.000Z",
    replayed: false,
  };
}

vi.mock("../../src/lib/smart-health-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/smart-health-api")>();
  return { ...actual, smartHealthApi: api };
});
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user, refreshUser, logout }),
}));
vi.mock("../../src/lib/firebase-client", () => ({
  getCurrentFirebaseUid: firebasePassword.currentUid,
  reauthenticateFirebasePassword: firebasePassword.reauthenticate,
  hasFirebaseWebConfig: firebasePassword.configured,
}));
vi.mock("../../src/app/components/security/TwoFactorPanel", () => ({
  TwoFactorPanel: ({
    onPendingRecoveryChange,
  }: {
    onPendingRecoveryChange?: (pending: boolean) => void;
  }) => (
    <div data-testid="two-factor-panel">
      <button
        type="button"
        onClick={() => onPendingRecoveryChange?.(true)}
      >
        Hiện mã khôi phục thử nghiệm
      </button>
    </div>
  ),
}));
vi.mock("sonner", () => ({ toast }));

function apiError(status: number, message: string, code = "FORBIDDEN") {
  return Object.assign(new Error(message), { status, code });
}

const RenderRevisionContext = createContext(0);

function WorkspaceSettingsTestHarness() {
  useContext(RenderRevisionContext);
  return <WorkspaceSettings />;
}

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [
      { path: "/portal/settings", element: <WorkspaceSettingsTestHarness /> },
      {
        path: "/portal/patients",
        element: <div data-testid="patients-route" />,
      },
    ],
    { initialEntries: ["/portal/settings"] },
  );
  let renderRevision = 0;
  const settings = () => (
    <QueryClientProvider client={client}>
      <RenderRevisionContext.Provider value={renderRevision}>
        <RouterProvider router={router} />
      </RenderRevisionContext.Provider>
    </QueryClientProvider>
  );
  const result = render(settings());
  return {
    ...result,
    client,
    router,
    rerenderSettings: () => {
      renderRevision += 1;
      result.rerender(settings());
    },
  };
}

function sessionRevokeReceipt(sessionId: string, replayed = false) {
  return {
    session: {
      id: sessionId,
      provider: "firebase",
      device: "Remote Chrome",
      userAgent: "Mozilla/5.0 Chrome/140",
      ip: "203.0.113.8",
      createdAt: "2026-07-13T23:00:00.000Z",
      lastSeenAt: "2026-07-14T00:00:00.000Z",
      revokedAt: "2026-07-14T00:01:00.000Z",
      current: false,
    },
    revoked: true as const,
    replayed,
  };
}

function workspaceSettingsReceipt(
  workspace: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  },
  overrides: Record<string, unknown> = {},
) {
  return {
    ownership: { userId: "user-1", workspaceId: "workspace-1" },
    workspace: {
      id: "workspace-1",
      name: workspace.name,
      address: workspace.address || "",
      phone: workspace.phone || "",
      email: workspace.email || "",
      website: workspace.website || "",
      version: 8,
      updatedAt: "2026-07-28T10:00:00.000Z",
    },
    operationId: "workspace_settings_operation_1",
    replayed: false,
    ...overrides,
  };
}

function accountProfileReceipt(
  intent: AccountProfileUpdateIntent,
  replayed = false,
) {
  return {
    userId: intent.userId,
    intent: "profile_update" as const,
    changedFields: Object.keys(intent.patch).sort(),
    user: {
      id: intent.userId,
      name: intent.patch.name ?? rawUser.name,
      title: intent.patch.title ?? "",
      phone: intent.patch.phone ?? "",
      license: intent.patch.license ?? "",
      hospital: intent.patch.hospital ?? "",
      department: intent.patch.department ?? "",
      specialty: intent.patch.specialty ?? "",
      address: intent.patch.address ?? "",
      organizationId: rawUser.organizationId,
      updatedAt: "2026-08-09T10:00:00.000Z",
    },
    replayed,
  };
}

function avatarCleanupSnapshot(
  overrides: Record<string, unknown> = {},
) {
  return {
    userId: "user-1",
    workspaceId: "workspace-1",
    status: "not_required",
    operationId: "",
    action: "none",
    previousFileId: "",
    attempts: 0,
    lastErrorCode: "",
    updatedAt: "",
    manualSupportRequired: false,
    ...overrides,
  };
}

function avatarUploadReceipt(intent: AvatarUploadIntent) {
  return {
    avatar: {
      fileId: `file-${intent.authSessionId}`,
      ownerUserId: intent.userId,
      name: intent.fileName,
      contentType: intent.contentType,
      byteSize: intent.byteSize,
      sha256: intent.sha256,
      downloadUrl: "/api/v1/me/avatar",
      uploadedAt: "2026-08-14T16:00:00.000Z",
    },
    cleanup: { status: "completed" as const, previousFileId: "" },
    operationId: `avatar-upload-${intent.authSessionId}`,
    replayed: false,
  };
}

function avatarDeleteReceipt(intent: AvatarDeleteIntent) {
  return {
    deleted: true as const,
    avatar: {
      fileId: intent.expectedAvatarFileId,
      ownerUserId: intent.userId,
      deletedAt: "2026-08-14T16:05:00.000Z",
    },
    cleanup: {
      status: "completed" as const,
      previousFileId: intent.expectedAvatarFileId,
    },
    operationId: `avatar-delete-${intent.authSessionId}`,
    replayed: false,
  };
}

describe("WorkspaceSettings", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    refreshUser.mockReset();
    logout.mockReset();
    toast.success.mockReset();
    toast.warning.mockReset();
    toast.error.mockReset();
    firebasePassword.configured.mockReset();
    firebasePassword.currentUid.mockReset();
    firebasePassword.reauthenticate.mockReset();
    firebasePassword.configured.mockReturnValue(false);
    firebasePassword.currentUid.mockReturnValue(null);
    avatarAuthorityState.token = "backend-token-user-1";
    avatarAuthorityState.epoch = 1;
    avatarAuthorityState.sessionId = "auth-session-e1";
    authState.user = authUser;
    api.getTokenSnapshot.mockImplementation(() => {
      const calls = api.authenticateFirebase.mock.calls;
      return calls.length
        ? String(calls[calls.length - 1][0])
        : avatarAuthorityState.token;
    });
    api.getAuthSessionEpochSnapshot.mockImplementation(
      () => avatarAuthorityState.epoch,
    );
    api.resolveAvatarMutationAuthority.mockImplementation(
      async (userId: string, workspaceId: string) => ({
        userId,
        workspaceId,
        authSessionId: avatarAuthorityState.sessionId,
        authSessionEpoch: avatarAuthorityState.epoch,
        bearerToken: api.getTokenSnapshot(),
      }),
    );
    api.me.mockResolvedValue({ user: rawUser });
    api.getSettings.mockResolvedValue({
      settings: {},
      workspace: {
        id: "workspace-1",
        name: "Phòng khám Test",
        type: "clinic",
        version: 7,
      },
    });
    api.listSessions.mockResolvedValue({ sessions: [] });
    api.downloadMyAvatar.mockResolvedValue(new Blob(["avatar"]));
    api.getMyAvatarCleanupStatus.mockResolvedValue(avatarCleanupSnapshot());
    api.getNotificationPreferences.mockResolvedValue(notificationSnapshot());
    refreshUser.mockResolvedValue(authUser);
    logout.mockImplementation(
      async (authority?: {
        firebaseUid?: string | null;
        authToken?: string;
      }) => {
        if (
          authority?.firebaseUid &&
          firebasePassword.currentUid() !== authority.firebaseUid
        ) {
          return false;
        }
        return (
          !authority?.authToken ||
          api.getTokenSnapshot() === authority.authToken
        );
      },
    );
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

    expect(await screen.findByText(/không có quyền.*workspace/i)).toBeVisible();
    expect(
      screen.queryByText(/internal workspace policy details/i),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.getSettings).toHaveBeenCalledTimes(2));
  });

  it("renders one canonical, theme-safe settings surface with accessible tabs", async () => {
    const { container } = renderSettings();

    expect(
      await screen.findByRole("heading", {
        name: "Tài khoản & workspace",
        level: 1,
      }),
    ).toBeVisible();
    expect(screen.getByTestId("portal-workspace-settings-page")).toBeVisible();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("tablist", { name: "Nhóm cài đặt" })).toBeVisible();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(
      container.querySelector(
        ".glass-panel, .hero-gradient-text, .brand-gradient-text, .premium-button, .premium-card",
      ),
    ).not.toBeInTheDocument();
    expect(container.innerHTML).not.toContain("[#");
    expect(container.querySelector("#account-name")).toHaveClass("h-11");
    expect(screen.getByRole("tab", { name: "Hồ sơ" })).toHaveClass("min-h-11");
  });

  it("guards one-time recovery codes across pointer, keyboard, and router navigation", async () => {
    const { container, router } = renderSettings();

    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    const securityTab = screen.getByRole("tab", { name: "Bảo mật" });
    const notificationsTab = screen.getByRole("tab", { name: "Thông báo" });
    fireEvent.click(securityTab);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Hiện mã khôi phục thử nghiệm",
      }),
    );

    fireEvent.click(notificationsTab);
    let dialog = await screen.findByRole("alertdialog", {
      name: "Rời mã khôi phục dùng một lần?",
    });
    expect(securityTab).toHaveAttribute("aria-selected", "true");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Ở lại và xác nhận" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    securityTab.focus();
    fireEvent.keyDown(securityTab, { key: "ArrowRight", code: "ArrowRight" });
    dialog = await screen.findByRole("alertdialog", {
      name: "Rời mã khôi phục dùng một lần?",
    });
    expect(securityTab).toHaveAttribute("aria-selected", "true");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Ở lại và xác nhận" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    act(() => {
      void router.navigate("/portal/patients");
    });
    dialog = await screen.findByRole("alertdialog", {
      name: "Rời mã khôi phục dùng một lần?",
    });
    expect(router.state.location.pathname).toBe("/portal/settings");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Rời và bắt đầu lại" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/portal/patients"),
    );
    expect(screen.getByTestId("patients-route")).toBeVisible();
  });

  it("loads sensitive tab datasets only when the corresponding tab opens", async () => {
    const { container } = renderSettings();

    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(api.listSessions).not.toHaveBeenCalled();
    expect(api.getNotificationPreferences).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Bảo mật" }));
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(1));
    expect(api.getSettings).not.toHaveBeenCalled();
    expect(api.getNotificationPreferences).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Thông báo" }));
    await waitFor(() =>
      expect(api.getNotificationPreferences).toHaveBeenCalledTimes(1),
    );
    expect(api.getSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "Workspace" }));
    await waitFor(() => expect(api.getSettings).toHaveBeenCalledTimes(1));
  });

  it("fails closed when the account snapshot belongs to another user", async () => {
    api.me.mockResolvedValue({
      user: {
        ...rawUser,
        id: "user-other",
        name: "Không được hiển thị",
      },
    });

    renderSettings();

    expect(
      await screen.findByText(/hồ sơ không thuộc tài khoản hiện tại/i),
    ).toBeVisible();
    expect(
      screen.queryByDisplayValue("Không được hiển thị"),
    ).not.toBeInTheDocument();
  });

  it("guards a changed profile draft from accidental browser navigation", async () => {
    const { container } = renderSettings();
    const name = await waitFor(() => {
      const field = container.querySelector<HTMLInputElement>("#account-name");
      expect(field).toBeInTheDocument();
      return field!;
    });

    fireEvent.change(name, { target: { value: "Bác sĩ đang chỉnh sửa" } });
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);

    expect(beforeUnload.defaultPrevented).toBe(true);
    expect(screen.getByText(/Có thay đổi chưa lưu/)).toBeVisible();
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
    expect(
      screen.queryByText(/chưa có dữ liệu phiên đăng nhập/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/internal session endpoint/i),
    ).not.toBeInTheDocument();

    api.listSessions.mockResolvedValue({ sessions: [] });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText(/chưa có dữ liệu phiên đăng nhập/i),
    ).toBeVisible();
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
      ...sessionRevokeReceipt("session-other"),
      revoked: false,
    });

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);

    const sessionRow = await screen.findByTestId("auth-session-session-other");
    fireEvent.click(
      within(sessionRow).getByRole("button", { name: "Thu hồi" }),
    );
    expect(api.revokeSession).not.toHaveBeenCalled();

    fireEvent.click(
      within(sessionRow).getByRole("button", { name: /xác nhận thu hồi/i }),
    );
    await waitFor(() =>
      expect(api.revokeSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          sessionId: "session-other",
          idempotencyKey: expect.any(String),
        }),
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        /biên nhận thu hồi phiên.*backend chưa xác nhận/i,
      ),
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
      .mockResolvedValueOnce(sessionRevokeReceipt("session-other", true));

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    const sessionRow = await screen.findByTestId("auth-session-session-other");

    fireEvent.click(within(sessionRow).getAllByRole("button")[0]);
    fireEvent.click(within(sessionRow).getAllByRole("button")[0]);
    await waitFor(() =>
      expect(within(sessionRow).getAllByRole("button")).toHaveLength(3),
    );
    fireEvent.click(within(sessionRow).getAllByRole("button")[2]);
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledTimes(2));

    const firstIntent = api.revokeSession.mock.calls[0][0];
    const secondIntent = api.revokeSession.mock.calls[1][0];
    const firstKey = firstIntent.idempotencyKey;
    const secondKey = secondIntent.idempotencyKey;
    expect(firstIntent.userId).toBe("user-1");
    expect(secondIntent.userId).toBe("user-1");
    expect(firstIntent.sessionId).toBe("session-other");
    expect(secondIntent.sessionId).toBe("session-other");
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("keeps revoke-all truthful and retries only sessions that remain active after a partial failure", async () => {
    const currentSession = {
      id: "session-current",
      current: true,
      provider: "firebase",
      deviceLabel: "Current browser",
    };
    const firstRemoteSession = {
      id: "session-remote-a",
      current: false,
      provider: "firebase",
      deviceLabel: "Remote Chrome",
    };
    const secondRemoteSession = {
      id: "session-remote-b",
      current: false,
      provider: "firebase",
      deviceLabel: "Remote Android",
    };
    const firstRevokedSession = {
      ...firstRemoteSession,
      revokedAt: "2026-07-14T00:01:00.000Z",
    };
    const secondRevokedSession = {
      ...secondRemoteSession,
      revokedAt: "2026-07-14T00:02:00.000Z",
    };

    api.listSessions
      .mockResolvedValue({
        sessions: [currentSession, firstRevokedSession, secondRevokedSession],
      })
      .mockResolvedValueOnce({
        sessions: [currentSession, firstRemoteSession, secondRemoteSession],
      })
      .mockResolvedValueOnce({
        sessions: [currentSession, firstRevokedSession, secondRemoteSession],
      });

    let secondRemoteAttempts = 0;
    api.revokeSession.mockImplementation(
      async (intent: { sessionId: string }) => {
        if (intent.sessionId === firstRemoteSession.id) {
          return sessionRevokeReceipt(firstRemoteSession.id);
        }
        if (intent.sessionId === secondRemoteSession.id) {
          secondRemoteAttempts += 1;
          if (secondRemoteAttempts === 1) {
            throw new Error("temporary revoke failure");
          }
          return sessionRevokeReceipt(secondRemoteSession.id, true);
        }
        throw new Error(`unexpected session revoke: ${intent.sessionId}`);
      },
    );

    const initialLocation = window.location.href;
    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);

    await screen.findByTestId(`auth-session-${firstRemoteSession.id}`);
    await screen.findByTestId(`auth-session-${secondRemoteSession.id}`);
    fireEvent.click(container.querySelector("#account-revoke-other-sessions")!);
    fireEvent.click(
      screen.getByRole("button", { name: /xác nhận thu hồi tất cả/i }),
    );

    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledTimes(2));
    expect(toast.success).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/backend chỉ xác nhận thu hồi 1\/2 phiên/i),
    ).toBeVisible();
    expect(toast.error).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByTestId(`auth-session-${firstRemoteSession.id}`),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByTestId(`auth-session-${secondRemoteSession.id}`),
    ).toBeVisible();
    expect(
      screen.getByTestId(`auth-session-${currentSession.id}`),
    ).toBeVisible();
    expect(screen.getByText(/thu hồi 1 phiên khác/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(
        screen.queryByTestId(`auth-session-${secondRemoteSession.id}`),
      ).not.toBeInTheDocument(),
    );

    const intents = api.revokeSession.mock.calls.map(([intent]) => intent);
    expect(intents.map((intent) => intent.sessionId)).toEqual([
      firstRemoteSession.id,
      secondRemoteSession.id,
      secondRemoteSession.id,
    ]);
    expect(intents[2].idempotencyKey).toBe(intents[1].idempotencyKey);
    expect(
      intents.some((intent) => intent.sessionId === currentSession.id),
    ).toBe(false);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Đã thu hồi các phiên khác");
    expect(logout).not.toHaveBeenCalled();
    expect(window.location.href).toBe(initialLocation);
  });

  it("retires a collided idempotency key before a newly confirmed revoke", async () => {
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
      .mockRejectedValueOnce(
        apiError(409, "collision", "IDEMPOTENCY_KEY_REUSED"),
      )
      .mockResolvedValueOnce(sessionRevokeReceipt("session-other"));

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    const sessionRow = await screen.findByTestId("auth-session-session-other");

    fireEvent.click(
      within(sessionRow).getByRole("button", { name: "Thu hồi" }),
    );
    fireEvent.click(
      within(sessionRow).getByRole("button", { name: /xác nhận thu hồi/i }),
    );
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledTimes(1));

    fireEvent.click(
      within(sessionRow).getByRole("button", { name: "Thu hồi" }),
    );
    fireEvent.click(
      within(sessionRow).getByRole("button", { name: /xác nhận thu hồi/i }),
    );
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledTimes(2));

    const firstKey = api.revokeSession.mock.calls[0][0].idempotencyKey;
    const secondKey = api.revokeSession.mock.calls[1][0].idempotencyKey;
    expect(firstKey).not.toBe(secondKey);
    expect(firstKey.length).toBeLessThanOrEqual(160);
    expect(secondKey.length).toBeLessThanOrEqual(160);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("rejects a revoke receipt that settles after the authenticated owner changes", async () => {
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
    let resolveReceipt:
      | ((value: ReturnType<typeof sessionRevokeReceipt>) => void)
      | undefined;
    api.revokeSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReceipt = resolve;
        }),
    );

    const view = renderSettings();
    await waitFor(() =>
      expect(view.container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(
      view.container.querySelector("#portal-settings-security-tab")!,
    );
    const sessionRow = await screen.findByTestId("auth-session-session-other");
    fireEvent.click(
      within(sessionRow).getByRole("button", { name: "Thu hồi" }),
    );
    fireEvent.click(
      within(sessionRow).getByRole("button", { name: /xác nhận thu hồi/i }),
    );
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledTimes(1));

    const replacementRawUser = { ...rawUser, id: "user-2" };
    authState.user = {
      ...authUser,
      id: "user-2",
      raw: replacementRawUser,
    };
    api.me.mockResolvedValue({ user: replacementRawUser });
    view.rerenderSettings();
    resolveReceipt?.(sessionRevokeReceipt("session-other"));

    expect(
      await screen.findByText(
        /biên nhận thu hồi phiên đăng nhập không hợp lệ: thao tác không còn thuộc tài khoản hiện tại/i,
      ),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not report profile success when the backend echoes unchanged user data", async () => {
    api.updateMe.mockImplementation((intent: AccountProfileUpdateIntent) => {
      const exact = accountProfileReceipt(intent);
      return Promise.resolve({
        ...exact,
        user: { ...exact.user, name: rawUser.name },
      });
    });

    const { container } = renderSettings();
    const name = await waitFor(() => {
      const field = container.querySelector<HTMLInputElement>("#account-name");
      expect(field).toBeInTheDocument();
      return field!;
    });
    fireEvent.change(name, { target: { value: "Tên đã sửa" } });
    fireEvent.click(container.querySelector("#account-save-profile")!);

    expect(await screen.findByText(/biên nhận hồ sơ chính xác/i)).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeVisible();
  });

  it("reuses one account profile key after an ambiguous failure and sends only changed profile fields", async () => {
    api.updateMe
      .mockRejectedValueOnce(new Error("profile response lost"))
      .mockImplementationOnce((intent: AccountProfileUpdateIntent) =>
        Promise.resolve(accountProfileReceipt(intent, true)),
      );

    const { container } = renderSettings();
    const name = await waitFor(() => {
      const field = container.querySelector<HTMLInputElement>("#account-name");
      expect(field).toBeInTheDocument();
      return field!;
    });
    fireEvent.change(name, { target: { value: "Tên đã sửa" } });
    fireEvent.click(container.querySelector("#account-save-profile")!);
    expect(await screen.findByText(/không thể lưu hồ sơ/i)).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.updateMe).toHaveBeenCalledTimes(2));
    const firstIntent = api.updateMe.mock
      .calls[0][0] as AccountProfileUpdateIntent;
    const retryIntent = api.updateMe.mock
      .calls[1][0] as AccountProfileUpdateIntent;
    expect(firstIntent).toMatchObject({
      userId: "user-1",
      patch: { name: "Tên đã sửa" },
    });
    expect(Object.keys(firstIntent.patch)).toEqual(["name"]);
    expect(firstIntent.patch).not.toHaveProperty("organizationId");
    expect(retryIntent.idempotencyKey).toBe(firstIntent.idempotencyKey);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it("rejects a late exact profile receipt after the active account changes", async () => {
    let resolveReceipt: (() => void) | undefined;
    api.updateMe.mockImplementation(
      (intent: AccountProfileUpdateIntent) =>
        new Promise((resolve) => {
          resolveReceipt = () => resolve(accountProfileReceipt(intent));
        }),
    );

    const view = renderSettings();
    const name = await waitFor(() => {
      const field =
        view.container.querySelector<HTMLInputElement>("#account-name");
      expect(field).toBeInTheDocument();
      return field!;
    });
    fireEvent.change(name, { target: { value: "Tên tài khoản cũ" } });
    fireEvent.click(view.container.querySelector("#account-save-profile")!);
    await waitFor(() => expect(api.updateMe).toHaveBeenCalledTimes(1));

    const replacementRawUser = { ...rawUser, id: "user-2" };
    authState.user = {
      ...authUser,
      id: "user-2",
      raw: replacementRawUser,
    };
    api.me.mockResolvedValue({ user: replacementRawUser });
    view.rerenderSettings();
    resolveReceipt?.();

    expect(
      await screen.findByText(
        /biên nhận hồ sơ không thuộc tài khoản hiện tại/i,
      ),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it("reuses one avatar upload key after an ambiguous failure and toasts only an exact owner receipt", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    const sha256 = await hashAvatarFile(file);
    api.uploadMyAvatar
      .mockRejectedValueOnce(new Error("ambiguous network failure"))
      .mockResolvedValueOnce({
        avatar: {
          fileId: "file-avatar-confirmed",
          ownerUserId: "user-1",
          name: file.name,
          contentType: file.type,
          byteSize: file.size,
          sha256,
          downloadUrl: "/api/v1/me/avatar",
          uploadedAt: "2026-08-09T09:00:00.000Z",
        },
        cleanup: { status: "completed", previousFileId: "" },
        operationId: "avatar_upload_operation_1",
        replayed: true,
      });

    const { container } = renderSettings();
    const input = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(
        "#account-avatar-file",
      );
      expect(element).toBeInTheDocument();
      return element!;
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(2));
    const firstKey = api.uploadMyAvatar.mock.calls[0][1];
    const secondKey = api.uploadMyAvatar.mock.calls[1][1];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it("never carries an E1 upload retry across an authSessionId-only replacement", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    api.uploadMyAvatar
      .mockRejectedValueOnce(new Error("ambiguous E1 upload"))
      .mockImplementationOnce(
        async (_file: File, intent: AvatarUploadIntent) =>
          avatarUploadReceipt(intent),
      );

    const view = renderSettings();
    const input = await waitFor(() => {
      const element = view.container.querySelector<HTMLInputElement>(
        "#account-avatar-file",
      );
      expect(element).toBeInTheDocument();
      return element!;
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(1));
    const e1Intent = api.uploadMyAvatar.mock.calls[0][1] as AvatarUploadIntent;
    const retry = await screen.findByRole("button", { name: /th. l.i/i });
    const authorityCallsBeforeRetry =
      api.resolveAvatarMutationAuthority.mock.calls.length;

    avatarAuthorityState.sessionId = "auth-session-e2";
    fireEvent.click(retry);
    await waitFor(() =>
      expect(api.resolveAvatarMutationAuthority).toHaveBeenCalledTimes(
        authorityCallsBeforeRetry + 1,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /th. l.i/i })).not.toBeInTheDocument(),
    );

    expect(api.uploadMyAvatar).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(2));
    const e2Intent = api.uploadMyAvatar.mock.calls[1][1] as AvatarUploadIntent;
    expect(e2Intent.authSessionId).toBe("auth-session-e2");
    expect(e2Intent.idempotencyKey).not.toBe(e1Intent.idempotencyKey);
  });

  it("drops a stalled E1 upload after same-owner E2 replaces the auth session and never reuses its key", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    let settleE1: (() => void) | undefined;
    api.uploadMyAvatar
      .mockImplementationOnce(
        (_file: File, intent: AvatarUploadIntent) =>
          new Promise((resolve) => {
            settleE1 = () => resolve(avatarUploadReceipt(intent));
          }),
      )
      .mockImplementationOnce(
        async (_file: File, intent: AvatarUploadIntent) =>
          avatarUploadReceipt(intent),
      );

    const view = renderSettings();
    const input = await waitFor(() => {
      const element = view.container.querySelector<HTMLInputElement>(
        "#account-avatar-file",
      );
      expect(element).toBeInTheDocument();
      return element!;
    });
    const previewSpy = vi.spyOn(URL, "createObjectURL");
    const invalidateSpy = vi.spyOn(view.client, "invalidateQueries");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(1));
    const e1Intent = api.uploadMyAvatar.mock.calls[0][1] as AvatarUploadIntent;
    expect(e1Intent).toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-1",
      authSessionId: "auth-session-e1",
      authSessionEpoch: 1,
      bearerToken: "backend-token-user-1",
    });

    avatarAuthorityState.token = "backend-token-user-1-e2";
    avatarAuthorityState.epoch = 2;
    avatarAuthorityState.sessionId = "auth-session-e2";
    view.rerenderSettings();
    await act(async () => settleE1?.());
    await waitFor(() =>
      expect(view.container.querySelector("#account-upload-avatar")).toBeEnabled(),
    );

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(previewSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/phiên đăng nhập đã thay đổi.*ảnh đại diện cũ/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(2));
    const e2Intent = api.uploadMyAvatar.mock.calls[1][1] as AvatarUploadIntent;
    expect(e2Intent).toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-1",
      authSessionId: "auth-session-e2",
      authSessionEpoch: 2,
      bearerToken: "backend-token-user-1-e2",
    });
    expect(e2Intent.idempotencyKey).not.toBe(e1Intent.idempotencyKey);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(previewSpy).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("quarantines a late E1 upload rejection after same-owner E2 replaces the auth session", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    let rejectE1: (() => void) | undefined;
    api.uploadMyAvatar
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectE1 = () => reject(new Error("late E1 upload 500"));
          }),
      )
      .mockImplementationOnce(
        async (_file: File, intent: AvatarUploadIntent) =>
          avatarUploadReceipt(intent),
      );

    const view = renderSettings();
    const input = await waitFor(() => {
      const element = view.container.querySelector<HTMLInputElement>(
        "#account-avatar-file",
      );
      expect(element).toBeInTheDocument();
      return element!;
    });
    const previewSpy = vi.spyOn(URL, "createObjectURL");
    const invalidateSpy = vi.spyOn(view.client, "invalidateQueries");

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(1));
    const e1Intent = api.uploadMyAvatar.mock.calls[0][1] as AvatarUploadIntent;

    avatarAuthorityState.token = "backend-token-user-1-e2";
    avatarAuthorityState.epoch = 2;
    avatarAuthorityState.sessionId = "auth-session-e2";
    view.rerenderSettings();
    await act(async () => rejectE1?.());
    await waitFor(() =>
      expect(view.container.querySelector("#account-upload-avatar")).toBeEnabled(),
    );

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(previewSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("late E1 upload 500")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thá»­ láº¡i" })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(2));
    const e2Intent = api.uploadMyAvatar.mock.calls[1][1] as AvatarUploadIntent;
    expect(e2Intent).toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-1",
      authSessionId: "auth-session-e2",
      authSessionEpoch: 2,
      bearerToken: "backend-token-user-1-e2",
    });
    expect(e2Intent.idempotencyKey).not.toBe(e1Intent.idempotencyKey);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  });

  it("rechecks the bound upload authority when E2 replaces E1 between catch and onError", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    const lateError = new Error("upload authority changed before onError");
    let switchAuthority = () => undefined;
    let switched = false;
    Object.defineProperty(lateError, "code", {
      configurable: true,
      get: () => {
        if (!switched) {
          switched = true;
          switchAuthority();
        }
        return "NETWORK_FAILURE";
      },
    });
    let rejectE1: (() => void) | undefined;
    api.uploadMyAvatar
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectE1 = () => reject(lateError);
          }),
      )
      .mockImplementationOnce(
        async (_file: File, intent: AvatarUploadIntent) =>
          avatarUploadReceipt(intent),
      );

    const view = renderSettings();
    const input = await waitFor(() => {
      const element = view.container.querySelector<HTMLInputElement>(
        "#account-avatar-file",
      );
      expect(element).toBeInTheDocument();
      return element!;
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(1));
    const e1Intent = api.uploadMyAvatar.mock.calls[0][1] as AvatarUploadIntent;
    switchAuthority = () => {
      avatarAuthorityState.token = "backend-token-user-1-e2";
      avatarAuthorityState.epoch = 2;
      avatarAuthorityState.sessionId = "auth-session-e2";
      view.rerenderSettings();
    };

    await act(async () => rejectE1?.());
    await waitFor(() =>
      expect(view.container.querySelector("#account-upload-avatar")).toBeEnabled(),
    );
    expect(switched).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Thá»­ láº¡i" })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(2));
    const e2Intent = api.uploadMyAvatar.mock.calls[1][1] as AvatarUploadIntent;
    expect(e2Intent.authSessionId).toBe("auth-session-e2");
    expect(e2Intent.idempotencyKey).not.toBe(e1Intent.idempotencyKey);
  });

  it("retires an upload intent when the backend reports AUTH_SESSION_REPLACED before local epoch drift", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    api.uploadMyAvatar
      .mockRejectedValueOnce(
        apiError(409, "backend revoked E1", "AUTH_SESSION_REPLACED"),
      )
      .mockImplementationOnce(
        async (_file: File, intent: AvatarUploadIntent) =>
          avatarUploadReceipt(intent),
      );

    const view = renderSettings();
    const input = await waitFor(() => {
      const element = view.container.querySelector<HTMLInputElement>(
        "#account-avatar-file",
      );
      expect(element).toBeInTheDocument();
      return element!;
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(1));
    const rejectedIntent = api.uploadMyAvatar.mock.calls[0][1] as AvatarUploadIntent;
    await waitFor(() =>
      expect(view.container.querySelector("#account-upload-avatar")).toBeEnabled(),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /th. l.i/i })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(2));
    const replacementIntent = api.uploadMyAvatar.mock.calls[1][1] as AvatarUploadIntent;
    expect(replacementIntent.idempotencyKey).not.toBe(
      rejectedIntent.idempotencyKey,
    );
  });

  it("quarantines a stalled upload authority-resolution rejection after E2 replaces E1", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    const view = renderSettings();
    const input = await waitFor(() => {
      const element = view.container.querySelector<HTMLInputElement>(
        "#account-avatar-file",
      );
      expect(element).toBeInTheDocument();
      return element!;
    });
    await waitFor(() =>
      expect(api.resolveAvatarMutationAuthority).toHaveBeenCalled(),
    );
    const authorityCallsBeforeMutation =
      api.resolveAvatarMutationAuthority.mock.calls.length;
    let rejectE1: (() => void) | undefined;
    api.resolveAvatarMutationAuthority.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectE1 = () => reject(new Error("late E1 session-list failure"));
        }),
    );
    api.uploadMyAvatar.mockImplementationOnce(
      async (_file: File, intent: AvatarUploadIntent) =>
        avatarUploadReceipt(intent),
    );

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(api.resolveAvatarMutationAuthority).toHaveBeenCalledTimes(
        authorityCallsBeforeMutation + 1,
      ),
    );
    avatarAuthorityState.token = "backend-token-user-1-e2";
    avatarAuthorityState.epoch = 2;
    avatarAuthorityState.sessionId = "auth-session-e2";
    view.rerenderSettings();
    await act(async () => rejectE1?.());
    await waitFor(() =>
      expect(view.container.querySelector("#account-upload-avatar")).toBeEnabled(),
    );

    expect(api.uploadMyAvatar).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /th. l.i/i })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.uploadMyAvatar).toHaveBeenCalledTimes(1));
    const e2Intent = api.uploadMyAvatar.mock.calls[0][1] as AvatarUploadIntent;
    expect(e2Intent.authSessionId).toBe("auth-session-e2");
    expect(e2Intent.idempotencyKey).toBeTruthy();
  });

  it("drops a stalled E1 delete after same-owner E2 replaces the auth session and never reuses its key", async () => {
    const currentAvatar = {
      ...rawUser,
      avatarFileId: "file-avatar-current",
      avatarUrl: "/api/v1/me/avatar",
    };
    authState.user = { ...authUser, raw: currentAvatar };
    api.me.mockResolvedValue({ user: currentAvatar });
    let settleE1: (() => void) | undefined;
    api.deleteMyAvatar
      .mockImplementationOnce(
        (intent: AvatarDeleteIntent) =>
          new Promise((resolve) => {
            settleE1 = () => resolve(avatarDeleteReceipt(intent));
          }),
      )
      .mockImplementationOnce(async (intent: AvatarDeleteIntent) =>
        avatarDeleteReceipt(intent),
      );

    const previewSpy = vi.spyOn(URL, "createObjectURL");
    const revokePreviewSpy = vi.spyOn(URL, "revokeObjectURL");
    const view = renderSettings();
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );
    await waitFor(() => expect(previewSpy).toHaveBeenCalled());
    const previewCallsBeforeE1Settlement = previewSpy.mock.calls.length;
    const revokeCallsBeforeE1Settlement = revokePreviewSpy.mock.calls.length;
    const invalidateSpy = vi.spyOn(view.client, "invalidateQueries");
    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: "Xác nhận xoá" }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(1));
    const e1Intent = api.deleteMyAvatar.mock.calls[0][0] as AvatarDeleteIntent;

    avatarAuthorityState.token = "backend-token-user-1-e2";
    avatarAuthorityState.epoch = 2;
    avatarAuthorityState.sessionId = "auth-session-e2";
    view.rerenderSettings();
    await act(async () => settleE1?.());
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(previewSpy).toHaveBeenCalledTimes(previewCallsBeforeE1Settlement);
    expect(revokePreviewSpy).toHaveBeenCalledTimes(
      revokeCallsBeforeE1Settlement,
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();

    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: "Xác nhận xoá" }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(2));
    const e2Intent = api.deleteMyAvatar.mock.calls[1][0] as AvatarDeleteIntent;
    expect(e2Intent).toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-1",
      authSessionId: "auth-session-e2",
      authSessionEpoch: 2,
      bearerToken: "backend-token-user-1-e2",
      expectedAvatarFileId: "file-avatar-current",
    });
    expect(e2Intent.idempotencyKey).not.toBe(e1Intent.idempotencyKey);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("quarantines a late E1 delete rejection after same-owner E2 replaces the auth session", async () => {
    const currentAvatar = {
      ...rawUser,
      avatarFileId: "file-avatar-current",
      avatarUrl: "/api/v1/me/avatar",
    };
    authState.user = { ...authUser, raw: currentAvatar };
    api.me.mockResolvedValue({ user: currentAvatar });
    let rejectE1: (() => void) | undefined;
    api.deleteMyAvatar
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectE1 = () => reject(new Error("late E1 delete 500"));
          }),
      )
      .mockImplementationOnce(async (intent: AvatarDeleteIntent) =>
        avatarDeleteReceipt(intent),
      );

    const previewSpy = vi.spyOn(URL, "createObjectURL");
    const revokePreviewSpy = vi.spyOn(URL, "revokeObjectURL");
    const view = renderSettings();
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );
    await waitFor(() => expect(previewSpy).toHaveBeenCalled());
    const previewCallsBeforeE1Settlement = previewSpy.mock.calls.length;
    const revokeCallsBeforeE1Settlement = revokePreviewSpy.mock.calls.length;
    const invalidateSpy = vi.spyOn(view.client, "invalidateQueries");

    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(1));
    const e1Intent = api.deleteMyAvatar.mock.calls[0][0] as AvatarDeleteIntent;

    avatarAuthorityState.token = "backend-token-user-1-e2";
    avatarAuthorityState.epoch = 2;
    avatarAuthorityState.sessionId = "auth-session-e2";
    view.rerenderSettings();
    await act(async () => rejectE1?.());
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(previewSpy).toHaveBeenCalledTimes(previewCallsBeforeE1Settlement);
    expect(revokePreviewSpy).toHaveBeenCalledTimes(
      revokeCallsBeforeE1Settlement,
    );
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("late E1 delete 500")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thá»­ láº¡i" })).not.toBeInTheDocument();

    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(2));
    const e2Intent = api.deleteMyAvatar.mock.calls[1][0] as AvatarDeleteIntent;
    expect(e2Intent).toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-1",
      authSessionId: "auth-session-e2",
      authSessionEpoch: 2,
      bearerToken: "backend-token-user-1-e2",
      expectedAvatarFileId: "file-avatar-current",
    });
    expect(e2Intent.idempotencyKey).not.toBe(e1Intent.idempotencyKey);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  });

  it("rechecks the bound delete authority when E2 replaces E1 between catch and onError", async () => {
    const currentAvatar = {
      ...rawUser,
      avatarFileId: "file-avatar-current",
      avatarUrl: "/api/v1/me/avatar",
    };
    authState.user = { ...authUser, raw: currentAvatar };
    api.me.mockResolvedValue({ user: currentAvatar });
    const lateError = new Error("delete authority changed before onError");
    let switchAuthority = () => undefined;
    let switched = false;
    Object.defineProperty(lateError, "code", {
      configurable: true,
      get: () => {
        if (!switched) {
          switched = true;
          switchAuthority();
        }
        return "NETWORK_FAILURE";
      },
    });
    let rejectE1: (() => void) | undefined;
    api.deleteMyAvatar
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectE1 = () => reject(lateError);
          }),
      )
      .mockImplementationOnce(async (intent: AvatarDeleteIntent) =>
        avatarDeleteReceipt(intent),
      );

    const view = renderSettings();
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );
    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(1));
    const e1Intent = api.deleteMyAvatar.mock.calls[0][0] as AvatarDeleteIntent;
    switchAuthority = () => {
      avatarAuthorityState.token = "backend-token-user-1-e2";
      avatarAuthorityState.epoch = 2;
      avatarAuthorityState.sessionId = "auth-session-e2";
      view.rerenderSettings();
    };

    await act(async () => rejectE1?.());
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );
    expect(switched).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Thá»­ láº¡i" })).not.toBeInTheDocument();

    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(2));
    const e2Intent = api.deleteMyAvatar.mock.calls[1][0] as AvatarDeleteIntent;
    expect(e2Intent.authSessionId).toBe("auth-session-e2");
    expect(e2Intent.idempotencyKey).not.toBe(e1Intent.idempotencyKey);
  });

  it("retires a delete intent when the backend reports AUTH_SESSION_REPLACED before local epoch drift", async () => {
    const currentAvatar = {
      ...rawUser,
      avatarFileId: "file-avatar-current",
      avatarUrl: "/api/v1/me/avatar",
    };
    authState.user = { ...authUser, raw: currentAvatar };
    api.me.mockResolvedValue({ user: currentAvatar });
    api.deleteMyAvatar
      .mockRejectedValueOnce(
        apiError(409, "backend revoked E1", "AUTH_SESSION_REPLACED"),
      )
      .mockImplementationOnce(async (intent: AvatarDeleteIntent) =>
        avatarDeleteReceipt(intent),
      );

    const view = renderSettings();
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );
    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(1));
    const rejectedIntent = api.deleteMyAvatar.mock.calls[0][0] as AvatarDeleteIntent;
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /th. l.i/i })).not.toBeInTheDocument();

    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(2));
    const replacementIntent = api.deleteMyAvatar.mock.calls[1][0] as AvatarDeleteIntent;
    expect(replacementIntent.idempotencyKey).not.toBe(
      rejectedIntent.idempotencyKey,
    );
  });

  it("never carries an E1 delete retry across an authSessionId-only replacement", async () => {
    const currentAvatar = {
      ...rawUser,
      avatarFileId: "file-avatar-current",
      avatarUrl: "/api/v1/me/avatar",
    };
    authState.user = { ...authUser, raw: currentAvatar };
    api.me.mockResolvedValue({ user: currentAvatar });
    api.deleteMyAvatar
      .mockRejectedValueOnce(new Error("ambiguous E1 delete"))
      .mockImplementationOnce(async (intent: AvatarDeleteIntent) =>
        avatarDeleteReceipt(intent),
      );

    const view = renderSettings();
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );
    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(1));
    const e1Intent = api.deleteMyAvatar.mock.calls[0][0] as AvatarDeleteIntent;
    const retry = await screen.findByRole("button", { name: /th. l.i/i });
    const authorityCallsBeforeRetry =
      api.resolveAvatarMutationAuthority.mock.calls.length;

    avatarAuthorityState.sessionId = "auth-session-e2";
    fireEvent.click(retry);
    await waitFor(() =>
      expect(api.resolveAvatarMutationAuthority).toHaveBeenCalledTimes(
        authorityCallsBeforeRetry + 1,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /th. l.i/i })).not.toBeInTheDocument(),
    );

    expect(api.deleteMyAvatar).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);

    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(2));
    const e2Intent = api.deleteMyAvatar.mock.calls[1][0] as AvatarDeleteIntent;
    expect(e2Intent.authSessionId).toBe("auth-session-e2");
    expect(e2Intent.idempotencyKey).not.toBe(e1Intent.idempotencyKey);
  });

  it("quarantines a stalled delete authority-resolution rejection after E2 replaces E1", async () => {
    const currentAvatar = {
      ...rawUser,
      avatarFileId: "file-avatar-current",
      avatarUrl: "/api/v1/me/avatar",
    };
    authState.user = { ...authUser, raw: currentAvatar };
    api.me.mockResolvedValue({ user: currentAvatar });
    const view = renderSettings();
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );
    await waitFor(() =>
      expect(api.resolveAvatarMutationAuthority).toHaveBeenCalled(),
    );
    const authorityCallsBeforeMutation =
      api.resolveAvatarMutationAuthority.mock.calls.length;
    let rejectE1: (() => void) | undefined;
    api.resolveAvatarMutationAuthority.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectE1 = () => reject(new Error("late E1 session-list failure"));
        }),
    );
    api.deleteMyAvatar.mockImplementationOnce(async (intent: AvatarDeleteIntent) =>
      avatarDeleteReceipt(intent),
    );

    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() =>
      expect(api.resolveAvatarMutationAuthority).toHaveBeenCalledTimes(
        authorityCallsBeforeMutation + 1,
      ),
    );
    avatarAuthorityState.token = "backend-token-user-1-e2";
    avatarAuthorityState.epoch = 2;
    avatarAuthorityState.sessionId = "auth-session-e2";
    view.rerenderSettings();
    await act(async () => rejectE1?.());
    await waitFor(() =>
      expect(view.container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );

    expect(api.deleteMyAvatar).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /th. l.i/i })).not.toBeInTheDocument();

    fireEvent.click(view.container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: /nh.n xo./i }),
    );
    await waitFor(() => expect(api.deleteMyAvatar).toHaveBeenCalledTimes(1));
    const e2Intent = api.deleteMyAvatar.mock.calls[0][0] as AvatarDeleteIntent;
    expect(e2Intent.authSessionId).toBe("auth-session-e2");
    expect(e2Intent.idempotencyKey).toBeTruthy();
  });

  it("keeps a persistent warning and never emits success while avatar cleanup is pending", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    const sha256 = await hashAvatarFile(file);
    api.uploadMyAvatar.mockResolvedValue({
      avatar: {
        fileId: "file-avatar-pending",
        ownerUserId: "user-1",
        name: file.name,
        contentType: file.type,
        byteSize: file.size,
        sha256,
        downloadUrl: "/api/v1/me/avatar",
        uploadedAt: "2026-08-09T09:00:00.000Z",
      },
      cleanup: { status: "pending", previousFileId: "file-avatar-old" },
      operationId: "avatar_upload_operation_pending",
      replayed: false,
    });
    api.getMyAvatarCleanupStatus
      .mockResolvedValueOnce(avatarCleanupSnapshot())
      .mockResolvedValue(
        avatarCleanupSnapshot({
          status: "pending",
          operationId: "avatar_upload_operation_pending",
          action: "upload",
          previousFileId: "file-avatar-old",
          updatedAt: "2026-08-09T09:00:01.000Z",
        }),
      );

    const view = renderSettings();
    const input = await waitFor(() => {
      const element = view.container.querySelector<HTMLInputElement>(
        "#account-avatar-file",
      );
      expect(element).toBeInTheDocument();
      return element!;
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText("Đang dọn tệp ảnh trong nền"),
    ).toBeVisible();
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
    view.rerenderSettings();
    expect(screen.getByText("Đang dọn tệp ảnh trong nền")).toBeVisible();
  });

  it("shows the same non-success cleanup warning after an avatar deletion receipt", async () => {
    const currentAvatar = {
      ...rawUser,
      avatarFileId: "file-avatar-current",
      avatarUrl: "/api/v1/me/avatar",
    };
    api.me
      .mockResolvedValueOnce({ user: currentAvatar })
      .mockResolvedValue({
        user: { ...currentAvatar, avatarFileId: "", avatarUrl: "" },
      });
    api.deleteMyAvatar.mockResolvedValue({
      deleted: true,
      avatar: {
        fileId: "file-avatar-current",
        ownerUserId: "user-1",
        deletedAt: "2026-08-09T09:05:00.000Z",
      },
      cleanup: {
        status: "pending",
        previousFileId: "file-avatar-current",
      },
      operationId: "avatar_delete_operation_pending",
      replayed: false,
    });
    api.getMyAvatarCleanupStatus
      .mockResolvedValueOnce(avatarCleanupSnapshot())
      .mockResolvedValue(
        avatarCleanupSnapshot({
          status: "pending",
          operationId: "avatar_delete_operation_pending",
          action: "delete",
          previousFileId: "file-avatar-current",
          updatedAt: "2026-08-09T09:05:01.000Z",
        }),
      );

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-delete-avatar")).toBeEnabled(),
    );
    fireEvent.click(container.querySelector("#account-delete-avatar")!);
    fireEvent.click(
      await screen.findByRole("button", { name: "Xác nhận xoá" }),
    );

    expect(
      await screen.findByText("Đang dọn tệp ảnh trong nền"),
    ).toBeVisible();
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(api.deleteMyAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        authSessionId: "auth-session-e1",
        authSessionEpoch: 1,
        bearerToken: "backend-token-user-1",
        expectedAvatarFileId: "file-avatar-current",
        idempotencyKey: expect.any(String),
      }),
    );
  });

  it("hydrates the pending cleanup warning again after a full settings remount", async () => {
    api.getMyAvatarCleanupStatus.mockResolvedValue(
      avatarCleanupSnapshot({
        status: "pending",
        operationId: "avatar_orphan_cleanup_pending",
        action: "orphan_upload",
        previousFileId: "file-avatar-orphan",
        attempts: 2,
        lastErrorCode: "PROVIDER_DELETE_FAILED",
        updatedAt: "2026-08-09T09:10:00.000Z",
      }),
    );

    const firstMount = renderSettings();
    expect(
      await screen.findByText("Đang dọn tệp ảnh trong nền"),
    ).toBeVisible();
    expect(
      screen.getByText(/tệp ảnh tải lên chưa hoàn tất liên kết với hồ sơ/i),
    ).toBeVisible();
    firstMount.unmount();

    renderSettings();
    expect(
      await screen.findByText("Đang dọn tệp ảnh trong nền"),
    ).toBeVisible();
    expect(api.getMyAvatarCleanupStatus).toHaveBeenCalledTimes(2);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("hydrates a durable dead-letter warning without claiming success or automatic retry", async () => {
    api.getMyAvatarCleanupStatus.mockResolvedValue(
      avatarCleanupSnapshot({
        status: "dead_letter",
        operationId: "avatar_delete_operation_dead",
        action: "delete",
        previousFileId: "file-avatar-dead",
        attempts: 8,
        lastErrorCode: "PROVIDER_DELETE_FAILED",
        updatedAt: "2026-08-09T09:15:00.000Z",
        manualSupportRequired: true,
      }),
    );

    renderSettings();

    expect(
      await screen.findByText("Cần hỗ trợ để dọn tệp ảnh"),
    ).toBeVisible();
    expect(screen.getByText(/hệ thống đã dừng tự thử lại/i)).toBeVisible();
    expect(screen.queryByText(/backend sẽ tự thử lại/i)).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("rejects cleanup hydration owned by another account", async () => {
    api.getMyAvatarCleanupStatus.mockResolvedValue(
      avatarCleanupSnapshot({
        userId: "user-other",
        status: "pending",
        operationId: "avatar_other_owner_pending",
        action: "delete",
        previousFileId: "file-avatar-other-owner",
        updatedAt: "2026-08-09T09:20:00.000Z",
      }),
    );

    renderSettings();

    expect(
      await screen.findByText(/trạng thái dọn ảnh không thuộc tài khoản\/workspace hiện tại/i),
    ).toBeVisible();
    expect(
      screen.queryByText("Đang dọn tệp ảnh trong nền"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Cần hỗ trợ để dọn tệp ảnh")).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("drops cached cleanup state when the same account switches workspace", async () => {
    api.getMyAvatarCleanupStatus
      .mockResolvedValueOnce(
        avatarCleanupSnapshot({
          status: "pending",
          operationId: "avatar_workspace_1_pending",
          action: "delete",
          previousFileId: "file-workspace-1",
          updatedAt: "2026-08-09T09:25:00.000Z",
        }),
      )
      .mockResolvedValue(
        avatarCleanupSnapshot({
          workspaceId: "workspace-2",
        }),
      );

    const view = renderSettings();
    expect(
      await screen.findByText("Đang dọn tệp ảnh trong nền"),
    ).toBeVisible();

    const workspaceTwoRawUser = {
      ...rawUser,
      organizationId: "workspace-2",
      currentWorkspaceId: "workspace-2",
      currentWorkspace: {
        ...rawUser.currentWorkspace,
        id: "workspace-2",
        name: "Phòng khám thứ hai",
      },
    };
    authState.user = {
      ...authUser,
      currentWorkspace: {
        ...authUser.currentWorkspace,
        id: "workspace-2",
        name: "Phòng khám thứ hai",
      },
      raw: workspaceTwoRawUser,
    };
    api.me.mockResolvedValue({ user: workspaceTwoRawUser });
    view.rerenderSettings();

    await waitFor(() =>
      expect(api.getMyAvatarCleanupStatus).toHaveBeenCalledTimes(2),
    );
    expect(
      screen.queryByText("Đang dọn tệp ảnh trong nền"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/file-workspace-1/i)).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not report avatar success when the receipt settles for another account", async () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const file = new File([bytes], "avatar.png", { type: "image/png" });
    const sha256 = await hashAvatarFile(file);
    api.uploadMyAvatar.mockResolvedValue({
      avatar: {
        fileId: "file-avatar-other",
        ownerUserId: "user-other",
        name: file.name,
        contentType: file.type,
        byteSize: file.size,
        sha256,
        downloadUrl: "/api/v1/me/avatar",
        uploadedAt: "2026-08-09T09:00:00.000Z",
      },
      cleanup: { status: "completed", previousFileId: "" },
      operationId: "avatar_upload_operation_other",
      replayed: false,
    });

    const { container } = renderSettings();
    const input = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(
        "#account-avatar-file",
      );
      expect(element).toBeInTheDocument();
      return element!;
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText(/biên nhận ảnh không thuộc tài khoản hiện tại/i),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
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
      await screen.findByText(/biên nhận cập nhật workspace/i),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it("reuses one workspace settings operation key after an ambiguous failure and only confirms an exact receipt", async () => {
    const confirmed = workspaceSettingsReceipt({
      name: "Tên workspace mới",
      address: "",
      phone: "",
      email: "",
      website: "",
    });
    api.updateWorkspace
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(confirmed);

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

    expect(await screen.findByText(/không thể lưu workspace/i)).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(api.updateWorkspace).toHaveBeenCalledTimes(2));
    const firstIntent = api.updateWorkspace.mock.calls[0][0];
    const retryIntent = api.updateWorkspace.mock.calls[1][0];
    expect(firstIntent.idempotencyKey).toBeTruthy();
    expect(retryIntent.idempotencyKey).toBe(firstIntent.idempotencyKey);
    expect(firstIntent.userId).toBe("user-1");
    expect(firstIntent.workspaceId).toBe("workspace-1");
    expect(firstIntent.expectedVersion).toBe(7);
    expect(firstIntent.payload).toEqual({
      name: "Tên workspace mới",
      address: "",
      phone: "",
      email: "",
      website: "",
    });
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Đã cập nhật workspace");
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it("retires a collided workspace operation key before retrying", async () => {
    api.updateWorkspace
      .mockRejectedValueOnce(
        apiError(409, "Idempotency-Key was reused", "IDEMPOTENCY_KEY_REUSED"),
      )
      .mockResolvedValueOnce(
        workspaceSettingsReceipt({
          name: "Tên workspace mới",
        }),
      );

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
    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(api.updateWorkspace).toHaveBeenCalledTimes(2));
    expect(api.updateWorkspace.mock.calls[1][0].idempotencyKey).not.toBe(
      api.updateWorkspace.mock.calls[0][0].idempotencyKey,
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("loads canonical notification truth and patches only the changed field", async () => {
    api.patchNotificationPreference.mockResolvedValue(
      notificationSnapshot({
        ...notificationPreferences,
        appointments: false,
      }),
    );

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(
      container.querySelector("#portal-settings-notifications-tab")!,
    );

    const appointments = await screen.findByRole("checkbox", {
      name: /lịch hẹn/i,
    });
    expect(appointments).toBeChecked();
    fireEvent.click(appointments);
    fireEvent.click(container.querySelector("#workspace-save-notifications")!);

    await waitFor(() =>
      expect(api.patchNotificationPreference).toHaveBeenCalledWith(
        "appointments",
        false,
        expect.any(String),
      ),
    );
    expect(api.updateMe).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Đã lưu cài đặt thông báo");
  });

  it("reuses the exact notification field idempotency key after a failed save", async () => {
    api.patchNotificationPreference
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(
        notificationSnapshot({
          ...notificationPreferences,
          appointments: false,
        }),
      );

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(
      container.querySelector("#portal-settings-notifications-tab")!,
    );
    fireEvent.click(await screen.findByRole("checkbox", { name: /lịch hẹn/i }));
    fireEvent.click(container.querySelector("#workspace-save-notifications")!);

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    await waitFor(() =>
      expect(api.patchNotificationPreference).toHaveBeenCalledTimes(2),
    );
    expect(api.patchNotificationPreference.mock.calls[0][2]).toBeTruthy();
    expect(api.patchNotificationPreference.mock.calls[1][2]).toBe(
      api.patchNotificationPreference.mock.calls[0][2],
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("preserves exact password values, reuses one operation key, and logs out only after a confirmed receipt", async () => {
    api.changePassword
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        ok: true,
        user: rawUser,
        provider: "demo",
        operationId: "identity-operation-1",
        replayed: true,
      });

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    fireEvent.change(container.querySelector("#account-current-password")!, {
      target: { value: " CurrentPass1 " },
    });
    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: " NewPass2 " },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: " NewPass2 " },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledTimes(1));
    expect(api.changePassword.mock.calls[0][0]).toEqual({
      currentPassword: " CurrentPass1 ",
      newPassword: " NewPass2 ",
    });
    expect(api.changePassword.mock.calls[0][1]).toEqual(expect.any(String));
    expect(logout).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledTimes(2));
    expect(api.changePassword.mock.calls[1][1]).toBe(
      api.changePassword.mock.calls[0][1],
    );
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(
      "Đã đổi mật khẩu. Vui lòng đăng nhập lại.",
    );
  });

  it("never reports success or logs out for an unconfirmed or cross-account receipt", async () => {
    api.changePassword.mockResolvedValue({
      ok: true,
      user: { ...rawUser, id: "user-other" },
      provider: "demo",
      operationId: "identity-operation-other",
      replayed: false,
    });

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    fireEvent.change(container.querySelector("#account-current-password")!, {
      target: { value: "CurrentPass1" },
    });
    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);

    expect(
      await screen.findByText(/backend chưa xác nhận.*đổi mật khẩu/i),
    ).toBeVisible();
    expect(logout).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("recovers an ambiguous Firebase mutation with the new password and the identical intent", async () => {
    firebasePassword.configured.mockReturnValue(true);
    firebasePassword.currentUid.mockReturnValue("firebase-user-1");
    firebasePassword.reauthenticate
      .mockResolvedValueOnce({
        idToken: "fresh-current-password-token",
        uid: "firebase-user-1",
      })
      .mockResolvedValueOnce({
        idToken: "fresh-new-password-token",
        uid: "firebase-user-1",
      });
    api.authenticateFirebase
      .mockResolvedValueOnce({ user: rawUser })
      .mockResolvedValueOnce({ user: rawUser });
    api.changePassword
      .mockRejectedValueOnce(new Error("response lost"))
      .mockRejectedValueOnce(
        apiError(
          401,
          "Firebase ID token has been revoked",
          "FIREBASE_ID_TOKEN_REVOKED",
        ),
      )
      .mockResolvedValueOnce({
        ok: true,
        user: rawUser,
        provider: "firebase",
        operationId: "identity-operation-firebase",
        replayed: true,
      });

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    fireEvent.change(container.querySelector("#account-current-password")!, {
      target: { value: "CurrentPass1" },
    });
    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledTimes(3));

    expect(firebasePassword.reauthenticate).toHaveBeenNthCalledWith(
      1,
      "CurrentPass1",
    );
    expect(firebasePassword.reauthenticate).toHaveBeenNthCalledWith(
      2,
      "NewPass2",
    );
    expect(api.authenticateFirebase).toHaveBeenNthCalledWith(
      1,
      "fresh-current-password-token",
    );
    expect(api.authenticateFirebase).toHaveBeenNthCalledWith(
      2,
      "fresh-new-password-token",
    );
    expect(api.changePassword.mock.calls[2][0]).toEqual(
      api.changePassword.mock.calls[0][0],
    );
    expect(api.changePassword.mock.calls[2][1]).toBe(
      api.changePassword.mock.calls[0][1],
    );
    expect(api.changePassword.mock.calls[1][1]).toBe(
      api.changePassword.mock.calls[0][1],
    );
    expect(logout).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("does not log out or report success when Firebase switches accounts before the receipt settles", async () => {
    firebasePassword.configured.mockReturnValue(true);
    firebasePassword.currentUid.mockReturnValue("firebase-user-1");
    firebasePassword.reauthenticate.mockResolvedValue({
      idToken: "fresh-current-password-token",
      uid: "firebase-user-1",
    });
    api.authenticateFirebase.mockResolvedValue({
      user: { ...rawUser, firebaseUid: "firebase-user-1" },
    });

    let resolveReceipt:
      | ((value: {
          ok: true;
          user: { id: string };
          provider: "firebase";
          operationId: string;
          replayed: boolean;
        }) => void)
      | undefined;
    api.changePassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReceipt = resolve;
        }),
    );

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    fireEvent.change(container.querySelector("#account-current-password")!, {
      target: { value: "CurrentPass1" },
    });
    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledTimes(1));
    firebasePassword.currentUid.mockReturnValue("firebase-user-2");
    resolveReceipt?.({
      ok: true,
      user: { id: rawUser.id },
      provider: "firebase",
      operationId: "identity-operation-account-switch",
      replayed: false,
    });

    expect(
      await screen.findByText(/không còn thuộc tài khoản đó/i),
    ).toBeVisible();
    expect(logout).toHaveBeenCalledWith({
      userId: rawUser.id,
      firebaseUid: "firebase-user-1",
      authToken: "fresh-current-password-token",
    });
    expect(api.clearTokenIfMatches).toHaveBeenCalledWith(
      "fresh-current-password-token",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("never uses the new-password recovery before a previous mutation attempt became ambiguous", async () => {
    firebasePassword.configured.mockReturnValue(true);
    firebasePassword.currentUid.mockReturnValue("firebase-user-1");
    firebasePassword.reauthenticate.mockResolvedValue({
      idToken: "fresh-current-password-token",
      uid: "firebase-user-1",
    });
    api.authenticateFirebase.mockResolvedValue({ user: rawUser });
    api.changePassword.mockRejectedValue(
      apiError(
        401,
        "Firebase ID token has been revoked",
        "FIREBASE_ID_TOKEN_REVOKED",
      ),
    );

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    fireEvent.change(container.querySelector("#account-current-password")!, {
      target: { value: "CurrentPass1" },
    });
    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);

    await waitFor(() => expect(api.changePassword).toHaveBeenCalledTimes(1));
    expect(firebasePassword.reauthenticate).toHaveBeenCalledTimes(1);
    expect(firebasePassword.reauthenticate).toHaveBeenCalledWith(
      "CurrentPass1",
    );
    expect(logout).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not unlock new-password recovery after a definite rejected mutation", async () => {
    firebasePassword.configured.mockReturnValue(true);
    firebasePassword.currentUid.mockReturnValue("firebase-user-1");
    firebasePassword.reauthenticate.mockResolvedValue({
      idToken: "fresh-current-password-token",
      uid: "firebase-user-1",
    });
    api.authenticateFirebase.mockResolvedValue({ user: rawUser });
    api.changePassword
      .mockRejectedValueOnce(
        apiError(422, "Current password is invalid", "VALIDATION_ERROR"),
      )
      .mockRejectedValueOnce(
        apiError(
          401,
          "Firebase ID token has been revoked",
          "FIREBASE_ID_TOKEN_REVOKED",
        ),
      );

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    fireEvent.change(container.querySelector("#account-current-password")!, {
      target: { value: "CurrentPass1" },
    });
    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledTimes(2));

    expect(firebasePassword.reauthenticate).toHaveBeenCalledTimes(1);
    expect(firebasePassword.reauthenticate).toHaveBeenCalledWith(
      "CurrentPass1",
    );
    expect(logout).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not treat a generic invalid-token 401 as proof that the password mutation revoked the token", async () => {
    firebasePassword.configured.mockReturnValue(true);
    firebasePassword.currentUid.mockReturnValue("firebase-user-1");
    firebasePassword.reauthenticate.mockResolvedValue({
      idToken: "fresh-current-password-token",
      uid: "firebase-user-1",
    });
    api.authenticateFirebase.mockResolvedValue({ user: rawUser });
    api.changePassword
      .mockRejectedValueOnce(new Error("response lost"))
      .mockRejectedValueOnce(
        apiError(401, "Firebase token is invalid", "INVALID_FIREBASE_TOKEN"),
      );

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    fireEvent.change(container.querySelector("#account-current-password")!, {
      target: { value: "CurrentPass1" },
    });
    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledTimes(2));

    expect(firebasePassword.reauthenticate).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("fails closed and never replays when Firebase recovery resolves to another account", async () => {
    firebasePassword.configured.mockReturnValue(true);
    firebasePassword.currentUid.mockReturnValue("firebase-user-1");
    firebasePassword.reauthenticate
      .mockResolvedValueOnce({
        idToken: "fresh-current-password-token",
        uid: "firebase-user-1",
      })
      .mockResolvedValueOnce({
        idToken: "fresh-new-password-token",
        uid: "firebase-user-1",
      });
    api.authenticateFirebase
      .mockResolvedValueOnce({ user: rawUser })
      .mockResolvedValueOnce({
        user: { ...rawUser, id: "user-other" },
      });
    api.changePassword
      .mockRejectedValueOnce(new Error("response lost"))
      .mockRejectedValueOnce(
        apiError(
          401,
          "Firebase ID token has been revoked",
          "FIREBASE_ID_TOKEN_REVOKED",
        ),
      );

    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);
    fireEvent.change(container.querySelector("#account-current-password")!, {
      target: { value: "CurrentPass1" },
    });
    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: "NewPass2" },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    await waitFor(() =>
      expect(firebasePassword.reauthenticate).toHaveBeenCalledTimes(2),
    );

    expect(api.changePassword).toHaveBeenCalledTimes(2);
    expect(logout).toHaveBeenCalledWith({
      userId: rawUser.id,
      firebaseUid: "firebase-user-1",
      authToken: "fresh-new-password-token",
    });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(container.querySelector("#account-current-password")).toHaveValue(
      "",
    );
    expect(container.querySelector("#account-new-password")).toHaveValue("");
    expect(container.querySelector("#account-confirm-password")).toHaveValue(
      "",
    );
    expect(toast.success).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    await waitFor(() =>
      expect(
        screen.getByText(/vui lòng nhập mật khẩu hiện tại/i),
      ).toBeVisible(),
    );
    expect(api.changePassword).toHaveBeenCalledTimes(2);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("requires upper-case, lower-case, digit, and a password different from the current secret", async () => {
    const { container } = renderSettings();
    await waitFor(() =>
      expect(container.querySelector("#account-name")).toBeInTheDocument(),
    );
    fireEvent.click(container.querySelector("#portal-settings-security-tab")!);

    fireEvent.change(container.querySelector("#account-current-password")!, {
      target: { value: "SamePass1" },
    });
    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: "lowercase1" },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: "lowercase1" },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);
    expect(
      await screen.findByText(/chữ hoa, chữ thường và chữ số/i),
    ).toBeVisible();
    expect(api.changePassword).not.toHaveBeenCalled();

    fireEvent.change(container.querySelector("#account-new-password")!, {
      target: { value: "SamePass1" },
    });
    fireEvent.change(container.querySelector("#account-confirm-password")!, {
      target: { value: "SamePass1" },
    });
    fireEvent.click(container.querySelector("#account-change-password")!);
    expect(
      await screen.findByText(/phải khác mật khẩu hiện tại/i),
    ).toBeVisible();
    expect(api.changePassword).not.toHaveBeenCalled();
  });
});
