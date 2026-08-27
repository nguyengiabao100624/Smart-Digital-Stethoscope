import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StaffPage from "../../src/app/pages/portal/StaffPage";

const api = vi.hoisted(() => ({
  listStaff: vi.fn(),
  listStaffInvitations: vi.fn(),
  createStaffInvitation: vi.fn(),
  resendStaffInvitation: vi.fn(),
  revokeStaffInvitation: vi.fn(),
  suspendStaffMember: vi.fn(),
  reactivateStaffMember: vi.fn(),
  revokeStaffMember: vi.fn(),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
let onlineSpy: ReturnType<typeof vi.spyOn>;

const auth = vi.hoisted(() => ({
  user: {
    id: "staff-admin-1",
    name: "Quản trị viên",
    email: "admin@example.test",
    role: "workspace_admin",
    capabilities: ["workspace.staff.manage"],
    currentWorkspace: {
      id: "workspace-a",
      name: "Phòng khám A",
    },
    raw: {},
  },
}));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));
vi.mock("sonner", () => ({ toast }));

function member(id: string, workspaceId: string) {
  return {
    id,
    role: "doctor",
    name: `Bác sĩ ${id}`,
    email: `${id}@example.test`,
    phone: "0901234567",
    accountStatus: "active",
    roleRequestStatus: "approved",
    workspaceMembership: {
      id: `membership-${id}`,
      userId: id,
      organizationId: workspaceId,
      workspaceId,
      role: "doctor",
      status: "active",
      operational: true,
      createdAt: "2026-07-29T08:00:00.000Z",
      updatedAt: "2026-07-29T08:00:00.000Z",
    },
  };
}

function ledger(workspaceId = auth.user.currentWorkspace.id) {
  const doctor = member(`doctor-${workspaceId}`, workspaceId);
  return {
    workspaceId,
    generatedAt: "2026-07-29T08:01:00.000Z",
    staff: [doctor],
    doctors: [doctor],
  };
}

function invitationList(workspaceId = auth.user.currentWorkspace.id) {
  return {
    invitations: [
      {
        id: `invitation-${workspaceId}`,
        organizationId: workspaceId,
        email: "pending@example.test",
        role: "viewer",
        status: "pending",
        delivery: { email: "unavailable" },
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const ui = () => (
    <QueryClientProvider client={client}>
      <StaffPage />
    </QueryClientProvider>
  );
  const view = render(ui());
  return {
    ...view,
    client,
    rerenderPage: () => view.rerender(ui()),
  };
}

describe("Portal Staff UI foundation", () => {
  beforeEach(() => {
    auth.user.currentWorkspace = {
      id: "workspace-a",
      name: "Phòng khám A",
    };
    auth.user.capabilities = ["workspace.staff.manage"];
    Object.values(api).forEach((mock) => mock.mockReset());
    Object.values(toast).forEach((mock) => mock.mockReset());
    onlineSpy = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(true);
    api.listStaff.mockImplementation(() =>
      Promise.resolve(ledger(auth.user.currentWorkspace.id)),
    );
    api.listStaffInvitations.mockImplementation(() =>
      Promise.resolve(invitationList(auth.user.currentWorkspace.id)),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an exact workspace-bound ledger on the canonical route surface", async () => {
    const { container } = renderPage();

    expect(
      await screen.findByText("Bác sĩ doctor-workspace-a"),
    ).toBeVisible();
    expect(screen.getByTestId("portal-staff")).toHaveAttribute(
      "data-workspace-id",
      "workspace-a",
    );
    expect(api.listStaff).toHaveBeenCalledOnce();
    expect(
      container.querySelector(
        ".glass-panel, .premium-button, .clinical-page-header, .clinical-page-title",
      ),
    ).toBeNull();
  });

  it("fails closed for a foreign staff snapshot", async () => {
    api.listStaff.mockResolvedValue(ledger("workspace-b"));

    renderPage();

    expect(
      await screen.findByText(/workspace.*không khớp/i),
    ).toBeVisible();
    expect(
      screen.queryByText("Bác sĩ doctor-workspace-b"),
    ).not.toBeInTheDocument();
  });

  it("shows a terminal backend permission state", async () => {
    api.listStaff.mockRejectedValue(
      Object.assign(new Error("denied"), {
        status: 403,
        requestId: "req-staff-403",
      }),
    );

    renderPage();

    expect(
      await screen.findByText(/không có quyền xem nhân sự/i),
    ).toBeVisible();
    expect(screen.getByText(/req-staff-403/i)).toBeVisible();
  });

  it("does not request or mutate staff while offline", async () => {
    onlineSpy.mockReturnValue(false);

    renderPage();

    expect(await screen.findByText(/đang ngoại tuyến/i)).toBeVisible();
    expect(api.listStaff).not.toHaveBeenCalled();
    expect(api.listStaffInvitations).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Mời nhân sự" }),
    ).toBeDisabled();
  });

  it("protects an unfinished invitation draft from browser unload", async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mời nhân sự" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Họ và tên"), {
      target: { value: "Bản nháp chưa lưu" },
    });

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("suppresses a late invitation receipt after switching workspace", async () => {
    const pending = deferred<{
      invitation: {
        id: string;
        organizationId: string;
        email: string;
        role: "doctor";
        status: "pending";
      };
      delivery: { email: "unavailable" };
      oneTimeAcceptanceUrl: string;
    }>();
    api.createStaffInvitation.mockReturnValue(pending.promise);
    const view = renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mời nhân sự" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Họ và tên"), {
      target: { value: "BS. Trễ" },
    });
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: "late@example.test" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Mời nhân sự" }),
    );
    await waitFor(() =>
      expect(api.createStaffInvitation).toHaveBeenCalledOnce(),
    );

    auth.user.currentWorkspace = {
      id: "workspace-b",
      name: "Phòng khám B",
    };
    view.rerenderPage();
    expect(
      await screen.findByText("Bác sĩ doctor-workspace-b"),
    ).toBeVisible();

    await act(async () => {
      pending.resolve({
        invitation: {
          id: "invitation-late-a",
          organizationId: "workspace-a",
          email: "late@example.test",
          role: "doctor",
          status: "pending",
        },
        delivery: { email: "unavailable" },
        oneTimeAcceptanceUrl:
          "https://shcare.test/staff-invitations/accept?token=late",
      });
      await pending.promise;
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Liên kết chấp nhận một lần"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("portal-staff")).toHaveAttribute(
      "data-workspace-id",
      "workspace-b",
    );
  });
});
