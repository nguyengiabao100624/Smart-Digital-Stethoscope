import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DevicesPage from "../../src/app/pages/portal/DevicesPage";

const api = vi.hoisted(() => ({ listDevices: vi.fn() }));

const authUser = {
  id: "user-1",
  name: "Quản trị viên",
  email: "admin@example.test",
  role: "workspace_admin",
  capabilities: ["workspace.devices.view", "workspace.devices.manage"],
  allowedSurfaces: ["portal"],
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
  raw: {},
};

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
}));

function renderDevices() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DevicesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("DevicesPage state-only Portal contract", () => {
  beforeEach(() => {
    api.listDevices.mockReset();
    api.listDevices.mockResolvedValue({
      generatedAt: "2026-07-17T07:30:00.000Z",
      workspaceId: "workspace-1",
      devices: [
        {
          id: "device-1",
          organizationId: "workspace-1",
          name: "Ống nghe A1",
          online: true,
          connected: true,
          battery: 84,
          firmwareVersion: "1.2.3",
        },
      ],
    });
  });

  it("uses backend online as the sole presence truth and exposes no device command", async () => {
    api.listDevices.mockResolvedValueOnce({
      generatedAt: "2026-07-17T07:30:00.000Z",
      workspaceId: "workspace-1",
      devices: [
        {
          id: "device-1",
          organizationId: "workspace-1",
          name: "Ống nghe A1",
          online: false,
          connected: true,
          battery: 84,
        },
      ],
    });

    const { container } = renderDevices();

    expect(await screen.findByText("Ống nghe A1")).toBeVisible();
    expect(screen.getByText("Offline")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /khởi động|gửi lệnh|cập nhật firmware/i }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".glass-panel, .hero-gradient-text, .premium-button")).toBeNull();
    expect(api.listDevices).toHaveBeenCalledWith("workspace-1");
    expect(screen.getByTestId("portal-devices")).toHaveAttribute(
      "data-workspace-id",
      "workspace-1",
    );
  });

  it("renders a terminal permission state for backend 403", async () => {
    api.listDevices.mockRejectedValueOnce(
      Object.assign(new Error("denied"), {
        status: 403,
        requestId: "req-device-403",
      }),
    );

    renderDevices();

    expect(
      await screen.findByText(/không có quyền xem thiết bị/i),
    ).toBeVisible();
    expect(screen.getByText(/req-device-403/i)).toBeVisible();
  });

  it("keeps a cached snapshot visibly stale after a refresh failure", async () => {
    renderDevices();
    expect(await screen.findByText("Ống nghe A1")).toBeVisible();

    api.listDevices.mockRejectedValueOnce(new Error("refresh failed"));
    fireEvent.click(screen.getByRole("button", { name: /làm mới/i }));

    expect(
      await screen.findByText(/không thể làm mới trạng thái thiết bị/i),
    ).toBeVisible();
    expect(screen.getByText("Ống nghe A1")).toBeVisible();
  });

  it("renders reported telemetry and an honest read-only Admin command snapshot", async () => {
    api.listDevices.mockResolvedValueOnce({
      generatedAt: "2026-07-17T07:30:00.000Z",
      workspaceId: "workspace-1",
      devices: [
        {
          id: "device-1",
          organizationId: "workspace-1",
          name: "Ống nghe A1",
          online: true,
          telemetry: {
            i2sStatus: "ready",
            uptimeMs: 90_061_000,
            freeHeapBytes: 4_096,
            audioPacketsDropped: 12,
            lastCommandState: "applying",
            lastCommandCode: "OTA_PENDING",
            otaStatus: "downloading",
          },
          lastCommand: {
            protocolVersion: 1,
            id: "command-1",
            deviceId: "device-1",
            organizationId: "workspace-1",
            type: "ota.update",
            correlationId: "correlation-1",
            state: "applying",
            status: "applying",
            issuedAt: "2026-07-17T07:29:00.000Z",
            expiresAt: "2026-07-17T07:34:00.000Z",
            delivery: { websocket: true, mqtt: false, delivered: true },
          },
          lastSeenAt: "2026-07-17T07:30:00.000Z",
        },
      ],
    });

    renderDevices();

    expect(
      await screen.findByRole("heading", { name: "Dữ liệu sức khỏe thiết bị" }),
    ).toBeVisible();
    expect(screen.getByText("1 ngày 1 giờ 1 phút")).toBeVisible();
    expect(screen.getByText("4.0 KB")).toBeVisible();
    expect(screen.getByText("applying · OTA_PENDING")).toBeVisible();
    expect(screen.getByText(/^Cập nhật firmware$/i)).toBeVisible();
    expect(screen.getByText(/trạng thái chỉ đọc từ snapshot backend/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /cập nhật trạng thái|thử gửi lại/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps missing telemetry explicit", async () => {
    api.listDevices.mockResolvedValueOnce({
      generatedAt: "2026-07-17T07:30:00.000Z",
      workspaceId: "workspace-1",
      devices: [
        {
          id: "device-1",
          organizationId: "workspace-1",
          name: "Ống nghe A1",
          online: true,
          telemetry: {},
        },
      ],
    });

    renderDevices();
    expect(
      await screen.findByText("Thiết bị chưa gửi dữ liệu sức khỏe."),
    ).toBeVisible();
  });
});
