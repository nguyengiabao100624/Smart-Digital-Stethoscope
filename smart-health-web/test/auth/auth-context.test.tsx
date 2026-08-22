import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "../../src/app/context/AuthContext";

const api = vi.hoisted(() => ({
  hasToken: vi.fn(),
  me: vi.fn(),
  switchWorkspace: vi.fn(),
  updateMe: vi.fn(),
  clearToken: vi.fn(),
  clearTokenIfMatches: vi.fn(),
  authenticateFirebase: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getTokenSnapshot: vi.fn(),
  logoutIfTokenMatches: vi.fn(),
  completeTwoFactorChallenge: vi.fn(),
}));

const firebase = vi.hoisted(() => ({
  hasFirebaseWebConfig: vi.fn(),
  isProductionAuthMode: vi.fn(),
  onFirebaseAuthStateChange: vi.fn(),
  signInWithFirebaseEmail: vi.fn(),
  signOutFirebase: vi.fn(),
  getCurrentFirebaseUid: vi.fn(),
  signOutFirebaseIfUidMatches: vi.fn(),
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
    {
      workspaceId: "workspace-2",
      role: "doctor",
      workspaceName: "Bệnh viện Hai",
      workspaceType: "hospital",
    },
  ],
};

const workspaceTwoUser = {
  ...rawUser,
  organizationId: "workspace-2",
  currentWorkspaceId: "workspace-2",
  currentWorkspace: {
    id: "workspace-2",
    name: "Bệnh viện Hai",
    workspaceType: "hospital",
  },
};

const replacementUser = {
  ...rawUser,
  id: "user-2",
  name: "Replacement User",
  email: "replacement@example.test",
};

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/lib/firebase-client", () => firebase);

function AuthProbe() {
  const { user, switchWorkspace } = useAuth();
  const [error, setError] = useState("");
  return (
    <div>
      <output aria-label="workspace">
        {user?.currentWorkspace.id || "none"}
      </output>
      <output aria-label="switch-error">{error}</output>
      <button
        type="button"
        onClick={() =>
          void switchWorkspace("workspace-2").catch((reason: unknown) =>
            setError(reason instanceof Error ? reason.message : "unknown"),
          )
        }
      >
        Chuyển workspace
      </button>
    </div>
  );
}

function InvitationIdentityProbe() {
  const {
    identityUser,
    isAuthenticated,
    loginForStaffInvitation,
    twoFactorChallenge,
    completeStaffInvitationTwoFactorLogin,
  } = useAuth();
  const [result, setResult] = useState("");
  return (
    <div>
      <output aria-label="identity-email">
        {identityUser?.email || "none"}
      </output>
      <output aria-label="portal-authenticated">
        {String(isAuthenticated)}
      </output>
      <output aria-label="identity-result">{result}</output>
      <output aria-label="identity-challenge">
        {twoFactorChallenge?.challengeId || "none"}
      </output>
      <button
        type="button"
        onClick={() =>
          void loginForStaffInvitation(
            "invitee@example.test",
            "valid-password",
          ).then((value) =>
            setResult(value.success ? "success" : value.error || "failed"),
          )
        }
      >
        Xác thực lời mời
      </button>
      <button
        type="button"
        onClick={() =>
          void completeStaffInvitationTwoFactorLogin("123456").then((value) =>
            setResult(value.success ? "success" : value.error || "failed"),
          )
        }
      >
        Hoàn tất 2FA lời mời
      </button>
    </div>
  );
}

function LogoutRaceProbe() {
  const { user, logout, refreshUser } = useAuth();
  const [result, setResult] = useState("idle");
  return (
    <div>
      <output aria-label="active-user">{user?.id || "none"}</output>
      <output aria-label="logout-result">{result}</output>
      <button
        type="button"
        onClick={() =>
          void logout({
            userId: "user-1",
            firebaseUid: "firebase-user-1",
            authToken: "token-user-1",
          }).then((closed) => setResult(String(closed)))
        }
      >
        Đăng xuất tài khoản cũ
      </button>
      <button type="button" onClick={() => void refreshUser()}>
        Làm mới tài khoản
      </button>
    </div>
  );
}

function renderAuthProbe(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AuthContext workspace switching", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    Object.values(firebase).forEach((mock) => mock.mockReset());
    api.hasToken.mockReturnValue(true);
    api.me.mockResolvedValue({ user: rawUser });
    firebase.hasFirebaseWebConfig.mockReturnValue(false);
    firebase.isProductionAuthMode.mockReturnValue(false);
  });

  it("keeps the current workspace when a 200 response does not confirm the requested workspace", async () => {
    api.switchWorkspace.mockResolvedValue({ user: rawUser });
    api.me.mockResolvedValueOnce({ user: rawUser }).mockResolvedValueOnce({
      user: rawUser,
    });
    renderAuthProbe();

    await waitFor(() =>
      expect(screen.getByLabelText("workspace")).toHaveTextContent(
        "workspace-1",
      ),
    );
    screen.getByRole("button", { name: "Chuyển workspace" }).click();

    expect(
      await screen.findByText(/backend chưa xác nhận.*workspace/i),
    ).toBeVisible();
    expect(screen.getByLabelText("workspace")).toHaveTextContent("workspace-1");
  });

  it("removes workspace PHI cache before exposing the confirmed workspace and preserves account cache", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const oldReviewKey = ["portal", "scans", "review"] as const;
    const oldAlertKey = ["portal", "monitoring", "alerts"] as const;
    const accountKey = ["portal", "me", "user-1"] as const;
    const sessionsKey = ["portal", "auth-sessions", "user-1"] as const;
    client.setQueryData(oldReviewKey, { scans: [{ id: "scan-workspace-1" }] });
    client.setQueryData(oldAlertKey, { alerts: [{ id: "alert-workspace-1" }] });
    client.setQueryData(accountKey, { user: { id: "user-1" } });
    client.setQueryData(sessionsKey, { sessions: [{ id: "session-1" }] });
    api.switchWorkspace.mockResolvedValue({ user: workspaceTwoUser });

    renderAuthProbe(client);
    await waitFor(() =>
      expect(screen.getByLabelText("workspace")).toHaveTextContent(
        "workspace-1",
      ),
    );
    screen.getByRole("button", { name: /chuyển workspace/i }).click();

    await waitFor(() =>
      expect(screen.getByLabelText("workspace")).toHaveTextContent(
        "workspace-2",
      ),
    );
    expect(client.getQueryData(oldReviewKey)).toBeUndefined();
    expect(client.getQueryData(oldAlertKey)).toBeUndefined();
    expect(client.getQueryData(accountKey)).toEqual({ user: { id: "user-1" } });
    expect(client.getQueryData(sessionsKey)).toEqual({
      sessions: [{ id: "session-1" }],
    });
  });

  it("reuses one idempotency key when the same failed workspace intent is retried", async () => {
    api.switchWorkspace
      .mockRejectedValueOnce(new Error("temporary transport failure"))
      .mockResolvedValueOnce({ user: workspaceTwoUser });
    api.me
      .mockResolvedValueOnce({ user: rawUser })
      .mockResolvedValueOnce({ user: rawUser });
    renderAuthProbe();

    await waitFor(() =>
      expect(screen.getByLabelText("workspace")).toHaveTextContent(
        "workspace-1",
      ),
    );
    screen.getByRole("button", { name: /chuyển workspace/i }).click();
    await screen.findByText("temporary transport failure");
    screen.getByRole("button", { name: /chuyển workspace/i }).click();

    await waitFor(() =>
      expect(screen.getByLabelText("workspace")).toHaveTextContent(
        "workspace-2",
      ),
    );
    expect(api.switchWorkspace).toHaveBeenCalledTimes(2);
    expect(api.switchWorkspace.mock.calls[0][0]).toBe("workspace-2");
    expect(api.switchWorkspace.mock.calls[0][1]).toMatch(
      /^portal-workspace-switch-/,
    );
    expect(api.switchWorkspace.mock.calls[1][1]).toBe(
      api.switchWorkspace.mock.calls[0][1],
    );
  });

  it("keeps an invitation identity session without granting Portal access", async () => {
    api.hasToken.mockReturnValue(false);
    api.login.mockResolvedValue({
      token: "identity-session",
      user: {
        id: "invitee-1",
        email: "invitee@example.test",
        name: "Invitee",
        role: "viewer",
        capabilities: [],
        allowedSurfaces: [],
        memberships: [],
      },
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <InvitationIdentityProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(api.hasToken).toHaveBeenCalled());
    screen.getByRole("button", { name: "Xác thực lời mời" }).click();

    await waitFor(() =>
      expect(screen.getByLabelText("identity-result")).toHaveTextContent(
        "success",
      ),
    );
    expect(screen.getByLabelText("identity-email")).toHaveTextContent(
      "invitee@example.test",
    );
    expect(screen.getByLabelText("portal-authenticated")).toHaveTextContent(
      "false",
    );
  });

  it("completes invitation 2FA as identity-only without opening Portal", async () => {
    api.hasToken.mockReturnValue(false);
    api.login.mockResolvedValue({
      twoFactorRequired: true,
      details: {
        challengeId: "challenge_invitation",
        method: "app",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    api.completeTwoFactorChallenge.mockResolvedValue({
      user: {
        id: "invitee-1",
        email: "invitee@example.test",
        name: "Invitee",
        role: "viewer",
        capabilities: [],
        allowedSurfaces: [],
        memberships: [],
      },
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <InvitationIdentityProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(api.hasToken).toHaveBeenCalled());
    screen.getByRole("button", { name: "Xác thực lời mời" }).click();
    expect(await screen.findByText("challenge_invitation")).toBeVisible();

    screen.getByRole("button", { name: "Hoàn tất 2FA lời mời" }).click();
    await waitFor(() =>
      expect(screen.getByLabelText("identity-email")).toHaveTextContent(
        "invitee@example.test",
      ),
    );
    expect(api.completeTwoFactorChallenge).toHaveBeenCalledWith({
      challengeId: "challenge_invitation",
      code: "123456",
    });
    expect(screen.getByLabelText("portal-authenticated")).toHaveTextContent(
      "false",
    );
  });

  it("preserves a replacement account that appears while the previous owner is logging out", async () => {
    let currentToken = "token-user-1";
    let currentFirebaseUid: string | null = "firebase-user-1";
    let resolveBackendLogout: ((closed: boolean) => void) | undefined;
    const backendLogout = new Promise<boolean>((resolve) => {
      resolveBackendLogout = resolve;
    });

    api.getTokenSnapshot.mockImplementation(() => currentToken);
    api.logoutIfTokenMatches.mockReturnValue(backendLogout);
    firebase.getCurrentFirebaseUid.mockImplementation(
      () => currentFirebaseUid,
    );
    firebase.signOutFirebaseIfUidMatches.mockResolvedValue(true);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <LogoutRaceProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("active-user")).toHaveTextContent("user-1"),
    );
    screen
      .getByRole("button", { name: "Đăng xuất tài khoản cũ" })
      .click();
    await waitFor(() =>
      expect(api.logoutIfTokenMatches).toHaveBeenCalledWith("token-user-1"),
    );

    currentToken = "token-user-2";
    currentFirebaseUid = "firebase-user-2";
    api.me.mockResolvedValueOnce({ user: replacementUser });
    screen.getByRole("button", { name: "Làm mới tài khoản" }).click();
    await waitFor(() =>
      expect(screen.getByLabelText("active-user")).toHaveTextContent("user-2"),
    );

    await act(async () => {
      resolveBackendLogout?.(true);
      await backendLogout;
    });

    await waitFor(() =>
      expect(screen.getByLabelText("logout-result")).toHaveTextContent("false"),
    );
    expect(screen.getByLabelText("active-user")).toHaveTextContent("user-2");
    expect(firebase.signOutFirebaseIfUidMatches).not.toHaveBeenCalled();
  });

  it("does not clear replacement state when it appears while the old Firebase sign-out is pending", async () => {
    let currentToken = "token-user-1";
    let currentFirebaseUid: string | null = "firebase-user-1";
    let resolveFirebaseLogout: ((closed: boolean) => void) | undefined;
    const firebaseLogout = new Promise<boolean>((resolve) => {
      resolveFirebaseLogout = resolve;
    });

    api.getTokenSnapshot.mockImplementation(() => currentToken);
    api.logoutIfTokenMatches.mockImplementation(async () => {
      currentToken = "";
      return true;
    });
    firebase.getCurrentFirebaseUid.mockImplementation(
      () => currentFirebaseUid,
    );
    firebase.signOutFirebaseIfUidMatches.mockReturnValue(firebaseLogout);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <LogoutRaceProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("active-user")).toHaveTextContent("user-1"),
    );

    screen
      .getByRole("button", { name: "Đăng xuất tài khoản cũ" })
      .click();
    await waitFor(() =>
      expect(firebase.signOutFirebaseIfUidMatches).toHaveBeenCalledWith(
        "firebase-user-1",
      ),
    );

    currentToken = "token-user-2";
    currentFirebaseUid = "firebase-user-2";
    api.me.mockResolvedValueOnce({ user: replacementUser });
    screen.getByRole("button", { name: "Làm mới tài khoản" }).click();
    await waitFor(() =>
      expect(screen.getByLabelText("active-user")).toHaveTextContent("user-2"),
    );

    await act(async () => {
      resolveFirebaseLogout?.(true);
      await firebaseLogout;
    });

    await waitFor(() =>
      expect(screen.getByLabelText("logout-result")).toHaveTextContent("false"),
    );
    expect(screen.getByLabelText("active-user")).toHaveTextContent("user-2");
    expect(currentToken).toBe("token-user-2");
  });

  it("preserves a replacement account when an older Firebase auth callback fails late", async () => {
    type FirebaseUserStub = {
      uid: string;
      getIdToken: () => Promise<string>;
    };
    let authStateListener:
      | ((firebaseUser: FirebaseUserStub | null) => Promise<void>)
      | undefined;
    let rejectStaleAuthentication: ((reason: Error) => void) | undefined;
    let currentToken = "";
    let currentFirebaseUid: string | null = "firebase-user-1";

    firebase.isProductionAuthMode.mockReturnValue(true);
    firebase.hasFirebaseWebConfig.mockReturnValue(true);
    firebase.getCurrentFirebaseUid.mockImplementation(
      () => currentFirebaseUid,
    );
    firebase.onFirebaseAuthStateChange.mockImplementation((listener) => {
      authStateListener = listener;
      return vi.fn();
    });
    api.getTokenSnapshot.mockImplementation(() => currentToken);
    api.clearTokenIfMatches.mockImplementation((expectedToken: string) => {
      if (currentToken !== expectedToken) return false;
      currentToken = "";
      return true;
    });
    api.authenticateFirebase.mockImplementation((token: string) => {
      currentToken = token;
      if (token === "firebase-token-user-a") {
        return new Promise((_, reject) => {
          rejectStaleAuthentication = reject;
        });
      }
      return Promise.resolve({ user: replacementUser });
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <LogoutRaceProbe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(authStateListener).toBeTypeOf("function"));

    const staleCallback = authStateListener?.({
      uid: "firebase-user-1",
      getIdToken: async () => "firebase-token-user-a",
    });
    await waitFor(() =>
      expect(api.authenticateFirebase).toHaveBeenCalledWith(
        "firebase-token-user-a",
      ),
    );

    currentFirebaseUid = "firebase-user-2";
    await authStateListener?.({
      uid: "firebase-user-2",
      getIdToken: async () => "firebase-token-user-b",
    });
    await waitFor(() =>
      expect(screen.getByLabelText("active-user")).toHaveTextContent("user-2"),
    );

    await authStateListener?.(null);
    expect(screen.getByLabelText("active-user")).toHaveTextContent("user-2");
    expect(currentToken).toBe("firebase-token-user-b");

    await act(async () => {
      rejectStaleAuthentication?.(new Error("stale user A request failed"));
      await staleCallback;
    });

    expect(screen.getByLabelText("active-user")).toHaveTextContent("user-2");
    expect(currentToken).toBe("firebase-token-user-b");
    expect(api.clearToken).not.toHaveBeenCalled();
  });
});
