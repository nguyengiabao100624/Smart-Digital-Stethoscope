import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

import DashboardPage from "../../src/app/pages/portal/DashboardPage";

const api = vi.hoisted(() => ({
  overview: vi.fn(),
  listScans: vi.fn(),
  listDevices: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  user: {
    id: "user-dashboard",
    name: "Bác sĩ Dashboard",
    email: "doctor@example.test",
    role: "doctor",
    capabilities: [
      "workspace.dashboard.view",
      "workspace.patients.view",
      "workspace.scans.view",
      "workspace.devices.view",
    ],
    allowedSurfaces: ["portal"],
    currentWorkspaceId: "workspace-1",
    currentWorkspace: {
      id: "workspace-1",
      name: "Phòng khám Shcare",
      type: "clinic",
      role: "doctor",
      patientCount: 3,
      deviceOnline: 1,
      alertCount: 0,
    },
    workspaces: [],
    raw: {},
  },
}));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));

function overviewPayload() {
  return {
    generatedAt: "2026-07-29T03:00:00.000Z",
    workspaceId: "workspace-1",
    range: {
      key: "today",
      label: "Hôm nay",
      startAt: "2026-07-28T17:00:00.000Z",
      endAt: "2026-07-29T03:00:00.000Z",
      timezoneOffsetMinutes: 420,
      bucket: "4h",
    },
    stats: {
      clinics: 1,
      workspaces: 1,
      patientsCount: 3,
      pendingDoctors: 0,
      devicesCount: 2,
      devicesOnline: 1,
      scansCount: 4,
      aiJobsFailed: 1,
      storageBytes: 2048,
      storageUsed: "0 MB",
    },
    measureData: [
      { time: "00:00", count: 1 },
      { time: "04:00", count: 1 },
      { time: "08:00", count: 2 },
    ],
    deviceData: [
      { key: "online", name: "Đang hoạt động", value: 1, color: "#18794E" },
      { key: "offline", name: "Mất kết nối", value: 1, color: "#D8E3EA" },
    ],
    aiJobData: [
      { key: "processing", name: "Đang xử lý", value: 1, color: "#2563A6" },
      { key: "completed", name: "Hoàn tất", value: 2, color: "#18794E" },
      { key: "failed", name: "Thất bại", value: 1, color: "#B4233A" },
      { key: "pending", name: "Chờ xử lý", value: 0, color: "#A15C00" },
    ],
  };
}

function scansPayload() {
  return {
    scans: [
      {
        id: "scan-1",
        organizationId: "workspace-1",
        patientId: "patient-1",
        patient: {
          id: "patient-1",
          patientCode: "BN-001",
          name: "Nguyễn An",
          organizationId: "workspace-1",
        },
        status: "completed",
        aiLabel: "abnormal",
        createdAt: "2026-07-29T02:30:00.000Z",
      },
    ],
    pagination: {
      page: 1,
      limit: 5,
      total: 1,
      pageCount: 1,
      hasNextPage: false,
      sort: "createdAt:desc",
    },
  };
}

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DashboardPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    api.overview.mockReset();
    api.listScans.mockReset();
    api.listDevices.mockReset();
    api.overview.mockResolvedValue(overviewPayload());
    api.listScans.mockResolvedValue(scansPayload());
    api.listDevices.mockResolvedValue({ devices: [] });
    auth.user.capabilities = [
      "workspace.dashboard.view",
      "workspace.patients.view",
      "workspace.scans.view",
      "workspace.devices.view",
    ];
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders the live Portal visual adapter from backend truth and not from AI-label inference", async () => {
    const { container } = renderDashboard();

    expect(
      await screen.findByRole("heading", { name: "Tổng quan", level: 1 }),
    ).toBeVisible();
    expect(api.overview).toHaveBeenCalledWith("workspace-1", {
      range: "today",
      timezoneOffsetMinutes: expect.any(Number),
    });
    expect(api.listScans).toHaveBeenCalledWith({
      organizationId: "workspace-1",
      limit: 5,
      sort: "createdAt:desc",
    });
    expect(api.listDevices).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId("dashboard-metric-patients")).getByText("3"),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("dashboard-metric-scans")).getByText("4"),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("dashboard-metric-failed")).getByText("1"),
    ).toBeVisible();
    expect(screen.getByText("Hoàn tất")).toBeVisible();
    expect(screen.queryByText("abnormal")).not.toBeInTheDocument();
    expect(container.querySelector(".portal-live-dashboard")).not.toBeNull();
    expect(
      container.querySelector(
        ".glass-panel, .hero-gradient-text, .brand-gradient-text, .premium-button",
      ),
    ).toBeNull();
    expect(container.innerHTML).not.toContain("[#");
    expect(
      screen.getByRole("button", { name: /làm mới tổng quan/i }),
    ).toHaveClass("h-11");
  });

  it("keeps truthful overview metrics visible when recent scans fail and retries only that section", async () => {
    api.listScans
      .mockRejectedValueOnce(new Error("Không thể tải lượt đo"))
      .mockResolvedValueOnce(scansPayload());

    renderDashboard();

    expect(
      await screen.findByTestId("dashboard-metric-patients"),
    ).toBeVisible();
    expect(screen.getByText("Không thể tải lượt đo gần đây")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /thử tải lại lượt đo/i }),
    );
    await waitFor(() => expect(api.listScans).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Nguyễn An")).toBeVisible();
    expect(api.overview).toHaveBeenCalledTimes(1);
  });

  it("shows an explicit empty state and keeps refresh disabled while offline", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    api.listScans.mockResolvedValueOnce({ ...scansPayload(), scans: [] });

    renderDashboard();

    expect(await screen.findByText("Bạn đang ngoại tuyến")).toBeVisible();
    expect(screen.getByText("Chưa có lượt đo gần đây")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /làm mới tổng quan/i }),
    ).toBeDisabled();
  });

  it("does not issue or advertise scan/device detail access without capability", async () => {
    auth.user.capabilities = ["workspace.dashboard.view"];

    renderDashboard();

    expect(
      await screen.findByTestId("dashboard-metric-patients"),
    ).toBeVisible();
    expect(api.listScans).not.toHaveBeenCalled();
    expect(api.listDevices).not.toHaveBeenCalled();
    expect(
      screen.getByText("Bạn không có quyền xem danh sách lượt đo gần đây."),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /xem tất cả lượt đo/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /quản lý thiết bị/i })).toBeNull();
  });
});
