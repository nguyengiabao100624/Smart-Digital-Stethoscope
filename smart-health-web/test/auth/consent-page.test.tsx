import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import InvitationsPage from "../../src/app/pages/portal/InvitationsPage";

const api = vi.hoisted(() => ({
  listPatients: vi.fn(),
  shareTargets: vi.fn(),
  listScans: vi.fn(),
  listPatientShares: vi.fn(),
  createPatientShare: vi.fn(),
  revokePatientShare: vi.fn(),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const authUser = {
  id: "admin-1",
  name: "Quản trị viên",
  email: "admin@example.test",
  role: "workspace_admin",
  capabilities: ["workspace.patients.manage"],
  allowedSurfaces: ["portal"],
  currentWorkspace: {
    id: "workspace-1",
    name: "Phòng khám A",
    type: "clinic",
    role: "workspace_admin",
    patientCount: 1,
    deviceOnline: 0,
    alertCount: 0,
  },
  workspaces: [],
  raw: {},
};

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
}));
vi.mock("sonner", () => ({ toast }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function patient(id = "patient-1", workspaceId = "workspace-1") {
  return {
    id,
    organizationId: workspaceId,
    name: id === "patient-1" ? "Nguyễn An" : "Trần Bình",
    patientCode: id === "patient-1" ? "BN-001" : "BN-002",
  };
}

function activeShare() {
  return {
    id: "share-1",
    patientId: "patient-1",
    doctorUserId: "doctor-1",
    scope: "patient_profile" as const,
    scanIds: [],
    accessLevel: "read" as const,
    purpose: "",
    consentedAt: "",
    active: true,
    authorityType: "clinician_access_grant" as const,
    status: "active" as const,
    recipient: {
      id: "doctor-1",
      type: "doctor" as const,
      name: "BS An",
      workspaceId: "workspace-1",
    },
    audit: {
      grantedByUserId: "admin-1",
      grantedAt: "2026-07-29T02:00:00.000Z",
      revokedByUserId: "",
      revokedAt: "",
    },
    createdAt: "2026-07-29T02:00:00.000Z",
    updatedAt: "2026-07-29T02:00:00.000Z",
  };
}

function targets(workspaceId = "workspace-1") {
  return {
    generatedAt: "2026-07-29T02:00:01.000Z",
    workspaceId,
    doctors: [
      {
        id: workspaceId === "workspace-1" ? "doctor-1" : "doctor-2",
        name: workspaceId === "workspace-1" ? "BS An" : "BS Bình",
        organizationId: workspaceId,
      },
    ],
    workspaces: [],
  };
}

function renderConsent() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const ui = () => (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <InvitationsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = render(ui());
  return {
    ...view,
    rerenderConsent: () => view.rerender(ui()),
  };
}

describe("Portal consent/data-access page", () => {
  beforeEach(() => {
    authUser.currentWorkspace.id = "workspace-1";
    authUser.currentWorkspace.name = "Phòng khám A";
    Object.values(api).forEach((mock) => mock.mockReset());
    Object.values(toast).forEach((mock) => mock.mockReset());
    api.listPatients.mockResolvedValue({ patients: [patient()] });
    api.shareTargets.mockResolvedValue(targets());
    api.listScans.mockResolvedValue({ scans: [], pagination: {} });
    api.listPatientShares.mockResolvedValue({
      generatedAt: "2026-07-29T02:00:01.000Z",
      workspaceId: "workspace-1",
      patientId: "patient-1",
      shares: [],
    });
  });

  it("binds patient, target, and ledger reads to the active workspace", async () => {
    renderConsent();

    expect(
      await screen.findByRole("heading", { name: /quyền truy cập dữ liệu/i }),
    ).toBeVisible();
    expect(screen.getByTestId("portal-consent")).toHaveAttribute(
      "data-workspace-id",
      "workspace-1",
    );
    expect(api.shareTargets).toHaveBeenCalledWith("workspace-1");

    fireEvent.change(screen.getByLabelText("Hồ sơ bệnh nhân"), {
      target: { value: "patient-1" },
    });

    await waitFor(() =>
      expect(api.listPatientShares).toHaveBeenCalledWith(
        "patient-1",
        "workspace-1",
      ),
    );
  });

  it("renders a permission state when the backend denies the patient source", async () => {
    api.listPatients.mockRejectedValue(
      Object.assign(new Error("denied"), { status: 403 }),
    );

    renderConsent();

    expect(
      await screen.findByText(/không có quyền quản lý truy cập dữ liệu/i),
    ).toBeVisible();
  });

  it("keeps cached patient data visibly stale after refresh failure", async () => {
    renderConsent();
    expect(await screen.findByText("Nguyễn An")).toBeVisible();

    api.listPatients.mockRejectedValueOnce(new Error("refresh failed"));
    fireEvent.click(screen.getByRole("button", { name: /làm mới/i }));

    expect(
      await screen.findByText(/không thể làm mới danh sách hồ sơ/i),
    ).toBeVisible();
    expect(screen.getByText("Nguyễn An")).toBeVisible();
  });

  it("drops a late create receipt after switching workspace", async () => {
    const pending = deferred<{
      generatedAt: string;
      workspaceId: string;
      patientId: string;
      share: ReturnType<typeof activeShare>;
      replayed: boolean;
    }>();
    api.createPatientShare.mockReturnValue(pending.promise);

    const view = renderConsent();
    await screen.findByRole("heading", { name: /quyền truy cập dữ liệu/i });
    fireEvent.change(screen.getByLabelText("Hồ sơ bệnh nhân"), {
      target: { value: "patient-1" },
    });
    fireEvent.change(
      await screen.findByLabelText("Bác sĩ nhận quyền"),
      { target: { value: "doctor-1" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /cấp quyền truy cập/i }),
    );
    await waitFor(() =>
      expect(api.createPatientShare).toHaveBeenCalledWith(
        "patient-1",
        {
          doctorUserId: "doctor-1",
          scope: "patient_profile",
        },
        expect.any(String),
        "workspace-1",
      ),
    );

    authUser.currentWorkspace.id = "workspace-2";
    authUser.currentWorkspace.name = "Phòng khám B";
    api.listPatients.mockResolvedValue({
      patients: [patient("patient-2", "workspace-2")],
    });
    api.shareTargets.mockResolvedValue(targets("workspace-2"));
    view.rerenderConsent();
    await waitFor(() =>
      expect(screen.getByTestId("portal-consent")).toHaveAttribute(
        "data-workspace-id",
        "workspace-2",
      ),
    );

    await act(async () => {
      pending.resolve({
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-1",
        patientId: "patient-1",
        share: activeShare(),
        replayed: false,
      });
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Hồ sơ bệnh nhân")).toHaveValue("");
  });
});
