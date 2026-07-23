import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "../../src/app/context/AuthContext";

const api = vi.hoisted(() => ({
  hasToken: vi.fn(),
  me: vi.fn(),
  updateMe: vi.fn(),
  clearToken: vi.fn(),
  authenticateFirebase: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  completeTwoFactorChallenge: vi.fn(),
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

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/lib/firebase-client", () => ({
  hasFirebaseWebConfig: () => false,
  isProductionAuthMode: () => false,
  onFirebaseAuthStateChange: vi.fn(),
  signInWithFirebaseEmail: vi.fn(),
  signOutFirebase: vi.fn(),
}));

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
    api.hasToken.mockReturnValue(true);
    api.me.mockResolvedValue({ user: rawUser });
  });

  it("keeps the current workspace when a 200 response does not confirm the requested workspace", async () => {
    api.updateMe.mockResolvedValue({ user: rawUser });
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
    api.updateMe.mockResolvedValue({ user: workspaceTwoUser });

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
});
