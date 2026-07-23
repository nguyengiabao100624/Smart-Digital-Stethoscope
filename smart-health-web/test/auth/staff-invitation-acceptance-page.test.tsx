import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StaffInvitationAcceptancePage from "../../src/app/pages/auth/StaffInvitationAcceptancePage";

const TOKEN = "a".repeat(48);
const identityUser = {
  id: "user_1",
  email: "doctor@example.com",
  name: "Doctor",
  role: "viewer",
  capabilities: [],
  allowedSurfaces: [],
  currentWorkspace: {
    id: "",
    name: "Workspace",
    type: "clinic",
    role: "viewer",
  },
  workspaces: [],
  raw: { id: "user_1", email: "doctor@example.com", verifiedEmail: true },
};

const auth = vi.hoisted(() => ({
  identityUser: null as null | typeof identityUser,
  isLoading: false,
  twoFactorChallenge: null,
  loginForStaffInvitation: vi.fn(),
  completeStaffInvitationTwoFactorLogin: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
}));

const api = vi.hoisted(() => ({ acceptStaffInvitation: vi.fn() }));
const firebase = vi.hoisted(() => ({
  hasFirebaseWebConfig: vi.fn(() => false),
  isProductionAuthMode: vi.fn(() => false),
  createFirebaseAccount: vi.fn(),
  refreshFirebaseVerification: vi.fn(),
}));

vi.mock("../../src/app/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/lib/firebase-client", () => firebase);
vi.mock("@/lib/useSEO", () => ({ useSEO: () => undefined }));

function canonicalAcceptance() {
  return {
    invitation: {
      id: "staff_inv_1",
      organizationId: "clinic_1",
      email: "doctor@example.com",
      role: "doctor",
      status: "accepted",
    },
    membership: {
      id: "membership_1",
      organizationId: "clinic_1",
      userId: "user_1",
      role: "doctor",
      status: "active",
    },
    user: { id: "user_1", email: "doctor@example.com" },
  };
}

function renderPage(path = `/staff-invitations/accept?token=${TOKEN}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/staff-invitations/accept"
          element={<StaffInvitationAcceptancePage />}
        />
        <Route path="/portal" element={<div>Portal ready</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StaffInvitationAcceptancePage", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    auth.loginForStaffInvitation.mockReset();
    auth.completeStaffInvitationTwoFactorLogin.mockReset();
    auth.logout.mockReset();
    auth.refreshUser.mockReset();
    auth.identityUser = null;
    auth.isLoading = false;
    auth.twoFactorChallenge = null;
  });

  it("shows a recovery state and never calls the mutation without a valid token", () => {
    renderPage("/staff-invitations/accept");

    expect(
      screen.getByRole("heading", { name: "Liên kết mời không hợp lệ" }),
    ).toBeVisible();
    expect(api.acceptStaffInvitation).not.toHaveBeenCalled();
  });

  it("offers generic invited-user signup and reports provider unavailability honestly", () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Chưa có tài khoản? Tạo tài khoản nhận lời mời",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /chưa khả dụng.*Firebase Auth/i,
    );
    expect(
      screen.getByRole("button", { name: /Tạo tài khoản và xác minh email/i }),
    ).toBeDisabled();
  });

  it("does not dead-end an identity-only local session on Firebase verification", () => {
    auth.identityUser = {
      ...identityUser,
      raw: { ...identityUser.raw, verifiedEmail: false },
    };
    firebase.isProductionAuthMode.mockReturnValue(false);
    firebase.hasFirebaseWebConfig.mockReturnValue(false);

    renderPage();

    expect(
      screen.getByRole("button", { name: "Chấp nhận lời mời" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("heading", {
        name: "Xác minh email trước khi tham gia",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps one idempotency key across retry and redirects only after refreshed Portal membership", async () => {
    auth.identityUser = identityUser;
    api.acceptStaffInvitation
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce(canonicalAcceptance());
    auth.refreshUser.mockResolvedValue({
      ...identityUser,
      role: "doctor",
      allowedSurfaces: ["portal"],
      currentWorkspace: {
        id: "clinic_1",
        name: "Clinic",
        type: "clinic",
        role: "doctor",
      },
      workspaces: [
        { id: "clinic_1", name: "Clinic", type: "clinic", role: "doctor" },
      ],
      raw: {
        id: "user_1",
        email: "doctor@example.com",
        verifiedEmail: true,
        memberships: [
          {
            organizationId: "clinic_1",
            userId: "user_1",
            role: "doctor",
            status: "active",
          },
        ],
      },
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Chấp nhận lời mời" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/thử lại/i);
    fireEvent.click(screen.getByRole("button", { name: "Chấp nhận lời mời" }));

    await waitFor(() =>
      expect(api.acceptStaffInvitation).toHaveBeenCalledTimes(2),
    );
    expect(api.acceptStaffInvitation.mock.calls[0][0]).toBe(TOKEN);
    expect(api.acceptStaffInvitation.mock.calls[0][1]).toBe(
      api.acceptStaffInvitation.mock.calls[1][1],
    );
    expect(await screen.findByText("Portal ready")).toBeVisible();
    expect(auth.refreshUser).toHaveBeenCalledTimes(1);
  });

  it("guards a double submit while the acceptance request is in flight", async () => {
    auth.identityUser = identityUser;
    let resolveRequest: (
      value: ReturnType<typeof canonicalAcceptance>,
    ) => void = () => undefined;
    api.acceptStaffInvitation.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    auth.refreshUser.mockResolvedValue({
      ...identityUser,
      allowedSurfaces: ["portal"],
      workspaces: [
        { id: "clinic_1", name: "Clinic", type: "clinic", role: "doctor" },
      ],
      raw: {
        id: "user_1",
        email: "doctor@example.com",
        verifiedEmail: true,
        memberships: [
          {
            organizationId: "clinic_1",
            userId: "user_1",
            role: "doctor",
            status: "active",
          },
        ],
      },
    });
    renderPage();

    const button = screen.getByRole("button", { name: "Chấp nhận lời mời" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() =>
      expect(api.acceptStaffInvitation).toHaveBeenCalledTimes(1),
    );

    resolveRequest(canonicalAcceptance());
    expect(await screen.findByText("Portal ready")).toBeVisible();
  });
});
