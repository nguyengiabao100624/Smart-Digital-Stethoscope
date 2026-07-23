import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DevicesPage, {
  deviceCommandPollInterval,
} from "../../src/app/pages/portal/DevicesPage";

const api = vi.hoisted(() => ({
  listDevices: vi.fn(),
  sendDeviceCommand: vi.fn(),
  getDeviceCommand: vi.fn(),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

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
vi.mock("sonner", () => ({ toast }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function command(state: string) {
  return {
    protocolVersion: 1 as const,
    id: "command-1",
    deviceId: "device-1",
    organizationId: "workspace-1",
    type: "restart" as const,
    correlationId: "correlation-1",
    state,
    status: state,
    code: `COMMAND_${state.toUpperCase()}`,
    detail: "",
    requestedByUserId: "user-1",
    issuedAt: "2026-07-17T00:00:00.000Z",
    expiresAt: "2099-07-17T00:00:30.000Z",
    acceptedAt: "2026-07-17T00:00:00.000Z",
    delivery: { websocket: true, mqtt: false, delivered: true },
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:01.000Z",
  };
}

function renderDevices() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DevicesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("DevicesPage command truth", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    Object.values(toast).forEach((mock) => mock.mockReset());
    api.listDevices.mockResolvedValue({
      devices: [
        {
          id: "device-1",
          name: "Ống nghe A1",
          online: true,
          connected: true,
          battery: 84,
          firmwareVersion: "1.2.3",
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses backend online as the sole presence truth and removes unsupported calibration", async () => {
    api.listDevices.mockResolvedValue({
      devices: [
        {
          id: "device-1",
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
      screen.getByRole("button", { name: /khởi động lại/i }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /hiệu chuẩn/i }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(
        ".glass-panel, .hero-gradient-text, .premium-button",
      ),
    ).toBeNull();
  });

  it("renders reported telemetry health and keeps missing telemetry explicit", async () => {
    api.listDevices.mockResolvedValueOnce({
      devices: [
        {
          id: "device-1",
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
          lastSeenAt: "2026-07-17T07:30:00.000Z",
        },
      ],
    });

    const first = renderDevices();

    expect(
      await screen.findByRole("heading", { name: "Dữ liệu sức khỏe thiết bị" }),
    ).toBeVisible();
    expect(screen.getByText("ready")).toBeVisible();
    expect(screen.getByText("1 ngày 1 giờ 1 phút")).toBeVisible();
    expect(screen.getByText("4.0 KB")).toBeVisible();
    expect(screen.getByText("12")).toBeVisible();
    expect(screen.getByText("applying · OTA_PENDING")).toBeVisible();
    expect(screen.getByText("downloading")).toBeVisible();
    expect(
      screen.getByText(/Lần thiết bị liên hệ hệ thống gần nhất:/),
    ).toBeVisible();
    expect(
      screen.getByText(/Đây không phải thời điểm đo riêng của từng chỉ số/),
    ).toBeVisible();

    first.unmount();
    api.listDevices.mockResolvedValueOnce({
      devices: [
        {
          id: "device-1",
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

  it("uses unique accessible headings for multiple telemetry cards and wraps long values", async () => {
    const longState = `applying_${"x".repeat(96)}`;
    api.listDevices.mockResolvedValueOnce({
      devices: [
        {
          id: "device-1",
          name: "Ống nghe A1",
          online: true,
          telemetry: { i2sStatus: "ready", lastCommandState: longState },
        },
        {
          id: "device-2",
          name: "Ống nghe A2",
          online: false,
          telemetry: { uptimeMs: 0 },
        },
      ],
    });

    renderDevices();

    const headings = await screen.findAllByRole("heading", {
      name: "Dữ liệu sức khỏe thiết bị",
    });
    expect(headings).toHaveLength(2);
    expect(new Set(headings.map((heading) => heading.id)).size).toBe(2);
    for (const heading of headings) {
      const section = heading.closest("section");
      expect(section).toHaveAttribute("aria-labelledby", heading.id);
    }

    const longValue = screen.getByText(longState);
    expect(longValue.closest("dd")?.className).toContain(
      "[overflow-wrap:anywhere]",
    );
    expect(longValue.closest("dd")?.className).not.toContain("truncate");
    expect(screen.getByText("0 giây")).toBeVisible();
    expect(screen.getAllByText("Chưa báo cáo").length).toBeGreaterThan(0);
  });

  it("does not double-submit and reports delivery without claiming the command was applied", async () => {
    const pending = deferred<{
      command: ReturnType<typeof command>;
      delivery: { websocket: boolean; mqtt: boolean; delivered: boolean };
    }>();
    api.sendDeviceCommand.mockReturnValue(pending.promise);
    api.getDeviceCommand.mockReturnValue(new Promise(() => {}));

    renderDevices();
    const restart = await screen.findByRole("button", {
      name: /khởi động lại/i,
    });
    fireEvent.click(restart);
    fireEvent.click(restart);

    expect(api.sendDeviceCommand).toHaveBeenCalledTimes(1);
    const request = api.sendDeviceCommand.mock.calls[0][1];
    expect(request).toMatchObject({
      type: "restart",
      payload: {},
      idempotencyKey: expect.any(String),
    });

    await act(async () => {
      pending.resolve({
        command: command("delivered"),
        delivery: { websocket: true, mqtt: false, delivered: true },
      });
    });

    expect(
      await screen.findByText(/đã chuyển tới thiết bị.*chờ xác nhận/i),
    ).toBeVisible();
    expect(screen.queryByText(/thiết bị đã áp dụng/i)).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringMatching(/chờ thiết bị xác nhận/i),
    );
  });

  it("reuses the same idempotency key when an uncertain submission is retried", async () => {
    api.sendDeviceCommand
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({
        command: command("accepted"),
        delivery: { websocket: false, mqtt: false, delivered: false },
      });
    api.getDeviceCommand.mockReturnValue(new Promise(() => {}));

    renderDevices();
    fireEvent.click(
      await screen.findByRole("button", { name: /khởi động lại/i }),
    );

    expect(
      await screen.findByText(/chưa xác định backend đã nhận lệnh hay chưa/i),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /thử gửi lại/i }));

    await waitFor(() => expect(api.sendDeviceCommand).toHaveBeenCalledTimes(2));
    expect(api.sendDeviceCommand.mock.calls[1][1].idempotencyKey).toBe(
      api.sendDeviceCommand.mock.calls[0][1].idempotencyKey,
    );
  });

  it("polls non-terminal commands and only reports applied after device confirmation", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.sendDeviceCommand.mockResolvedValue({
      command: command("delivered"),
      delivery: { websocket: true, mqtt: false, delivered: true },
    });
    api.getDeviceCommand
      .mockResolvedValueOnce({ command: command("acknowledged") })
      .mockResolvedValueOnce({ command: command("applied") });

    renderDevices();
    fireEvent.click(
      await screen.findByRole("button", { name: /khởi động lại/i }),
    );

    expect(await screen.findByText(/thiết bị đã nhận lệnh/i)).toBeVisible();
    expect(screen.queryByText(/thiết bị đã áp dụng/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(await screen.findByText(/thiết bị đã áp dụng/i)).toBeVisible();
    expect(api.getDeviceCommand).toHaveBeenCalledTimes(2);
  });

  it("shows a retryable polling error without inventing a terminal result", async () => {
    api.sendDeviceCommand.mockResolvedValue({
      command: command("delivered"),
      delivery: { websocket: true, mqtt: false, delivered: true },
    });
    api.getDeviceCommand
      .mockRejectedValueOnce(new Error("temporary status failure"))
      .mockResolvedValueOnce({ command: command("applied") });

    renderDevices();
    fireEvent.click(
      await screen.findByRole("button", { name: /khởi động lại/i }),
    );

    expect(
      await screen.findByText(/không thể cập nhật trạng thái lệnh/i),
    ).toBeVisible();
    expect(screen.queryByText(/thiết bị đã áp dụng/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /thử cập nhật lại/i }));
    expect(await screen.findByText(/thiết bị đã áp dụng/i)).toBeVisible();
  });

  it("labels a server-provided OTA command by its real command type", async () => {
    api.listDevices.mockResolvedValue({
      devices: [
        {
          id: "device-1",
          name: "Ống nghe A1",
          online: true,
          lastCommand: { ...command("applying"), type: "ota.update" },
        },
      ],
    });
    api.getDeviceCommand.mockReturnValue(new Promise(() => {}));

    renderDevices();

    expect(await screen.findByText(/^Cập nhật firmware$/i)).toBeVisible();
  });

  it("cancels an in-flight status request when the command card unmounts", async () => {
    api.sendDeviceCommand.mockResolvedValue({
      command: command("delivered"),
      delivery: { websocket: true, mqtt: false, delivered: true },
    });
    api.getDeviceCommand.mockImplementation(
      (_deviceId: string, _commandId: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const view = renderDevices();
    fireEvent.click(
      await screen.findByRole("button", { name: /khởi động lại/i }),
    );
    await waitFor(() => expect(api.getDeviceCommand).toHaveBeenCalledTimes(1));
    const signal = api.getDeviceCommand.mock.calls[0][2] as AbortSignal;
    expect(signal.aborted).toBe(false);

    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it("bounds polling and stops immediately for a terminal command", () => {
    const start = Date.parse("2026-07-17T00:00:00.000Z");
    expect(deviceCommandPollInterval(command("applied"), start, start)).toBe(
      false,
    );
    expect(
      deviceCommandPollInterval(command("delivered"), start, start + 45_001),
    ).toBe(false);
    expect(
      deviceCommandPollInterval(command("delivered"), start, start + 1_000),
    ).toBe(2_000);
  });
});
