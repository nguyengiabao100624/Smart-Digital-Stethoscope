import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LiveMonitoringPage from "../../src/app/pages/portal/LiveMonitoring";

const api = vi.hoisted(() => ({
  monitoring: vi.fn(),
  getRealtimeConnection: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  user: {
    currentWorkspace: { id: "workspace-a" },
  },
}));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly protocols: string[];
  readyState = FakeWebSocket.CONNECTING;
  binaryType: BinaryType = "blob";
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  closeCode = 0;
  closeReason = "";

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = String(url);
    this.protocols =
      typeof protocols === "string" ? [protocols] : protocols || [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  emitText(value: Record<string, unknown>) {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(value) }),
    );
  }

  close(code = 1000, reason = "") {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.closeCode = code;
    this.closeReason = reason;
    this.onclose?.(new CloseEvent("close", { code, reason }));
  }
}

function alert(workspaceId: string, deviceId: string) {
  return {
    id: `alert-${workspaceId}`,
    organizationId: workspaceId,
    sourceType: "device",
    sourceId: deviceId,
    dedupeKey: `device:${deviceId}`,
    occurrenceNumber: 1,
    previousAlertId: "",
    occurredAt: "2026-07-29T10:55:00.000Z",
    status: "open",
    severity: "warning",
    title: "Thiết bị cần kiểm tra",
    message: `Cảnh báo ${workspaceId}`,
    patientId: `patient-${workspaceId}`,
    deviceId,
    scanId: "",
    acknowledgedByUserId: "",
    acknowledgedAt: "",
    acknowledgementNote: "",
    resolvedByUserId: "",
    resolvedAt: "",
    resolutionNote: "",
    version: 1,
    metadata: {},
    createdAt: "2026-07-29T10:55:00.000Z",
    updatedAt: "2026-07-29T10:55:00.000Z",
  };
}

function snapshot(workspaceId: string) {
  const deviceId = `device-${workspaceId}`;
  return {
    generatedAt: "2026-07-29T11:00:00.000Z",
    workspaceId,
    status: {
      type: "status",
      recording: false,
      identity: null,
      updatedAt: "2026-07-29T11:00:00.000Z",
    },
    devices: [
      {
        id: deviceId,
        name: `Shcare ${workspaceId}`,
        organizationId: workspaceId,
        connected: true,
        online: false,
        status: "available",
        audioStatus: "idle",
      },
    ],
    scans: [],
    alerts: [alert(workspaceId, deviceId)],
  };
}

function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return { ...render(tree(client)), client };
}

describe("Portal Live Monitoring", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    auth.user.currentWorkspace = { id: "workspace-a" };
    api.monitoring.mockReset();
    api.getRealtimeConnection.mockReset();
    api.monitoring.mockImplementation((workspaceId: string) =>
      Promise.resolve(snapshot(workspaceId)),
    );
    api.getRealtimeConnection.mockReturnValue({
      url: "wss://api.shcare.test/app",
      protocols: ["shcare.realtime.v1", "shcare.bearer.test-token"],
    });
  });

  it("uses canonical online presence and never invents zero-valued clinical metrics", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Theo dõi trực tiếp" }),
    ).toBeVisible();
    expect(api.monitoring).toHaveBeenCalledWith("workspace-a");
    expect(screen.getByText("Online 0/1")).toBeVisible();
    expect(screen.getByLabelText("Đang offline")).toBeVisible();
    expect(screen.getAllByText("Chưa có dữ liệu").length).toBeGreaterThan(0);
    expect(
      screen.getByTestId("portal-live-monitoring-page"),
    ).toHaveAttribute("data-workspace-id", "workspace-a");
  });

  it("renders metrics only after matching status and session metadata", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Theo dõi trực tiếp" });
    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    socket.open();
    const identity = {
      workspaceId: "workspace-a",
      patientId: "patient-workspace-a",
      deviceId: "device-workspace-a",
      scanId: "scan-live-a",
      sessionId: "session-live-a",
    };
    socket.emitText({
      type: "status",
      recording: true,
      ...identity,
      updatedAt: "2026-07-29T11:01:00.000Z",
    });
    socket.emitText({
      type: "audio.session",
      protocolVersion: 2,
      frameEncoding: "shcare_audio_v2",
      ...identity,
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      encoding: "pcm_s16le",
      startedAt: "2026-07-29T11:01:00.000Z",
    });
    socket.emitText({
      type: "metrics",
      recording: true,
      ...identity,
      sampleRate: 16000,
      peak: 1200,
      rms: 480,
      levelPercent: 72,
      bpm: 68,
      updatedAt: "2026-07-29T11:01:01.000Z",
    });

    expect(await screen.findByText("ĐANG GHI")).toBeVisible();
    expect(screen.getByText("68 bpm")).toBeVisible();
    expect(screen.getByText("Thiết bị device-workspace-a · Lượt đo scan-live-a")).toBeVisible();
  });

  it("labels an active REST snapshot as fallback without inventing waveform metrics", async () => {
    const fallback = snapshot("workspace-a");
    fallback.status = {
      type: "status",
      recording: true,
      identity: {
        workspaceId: "workspace-a",
        patientId: "patient-workspace-a",
        deviceId: "device-workspace-a",
        scanId: "scan-rest-a",
        sessionId: "session-rest-a",
      },
      updatedAt: "2026-07-29T11:01:00.000Z",
    };
    api.monitoring.mockResolvedValue(fallback);

    renderPage();

    expect(
      await screen.findByTestId("rest-recording-fallback"),
    ).toHaveTextContent("REST báo có phiên đang ghi");
    expect(screen.getByText("REST CHỈ BÁO TRẠNG THÁI")).toBeVisible();
    expect(screen.getAllByText("Chưa có dữ liệu")).toHaveLength(4);
    expect(screen.queryByText(/0 bpm/)).not.toBeInTheDocument();
  });

  it("renders a terminal permission state for a 403 monitoring response", async () => {
    api.monitoring.mockRejectedValue(
      Object.assign(new Error("Capability bị từ chối."), {
        status: 403,
        requestId: "req-live-denied",
      }),
    );

    renderPage();

    expect(
      await screen.findByText("Không có quyền xem theo dõi trực tiếp"),
    ).toBeVisible();
    expect(screen.getByText("Capability bị từ chối.")).toBeVisible();
    expect(screen.getByText("Request ID: req-live-denied")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Thử lại" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the last valid snapshot visible when a REST refresh fails", async () => {
    const view = renderPage();
    await screen.findByText("Shcare workspace-a");
    api.monitoring.mockRejectedValueOnce(new Error("REST refresh failed"));

    await view.client.refetchQueries({
      queryKey: ["portal", "workspace", "workspace-a", "monitoring"],
    });

    expect(
      await screen.findByText("Đang hiển thị snapshot gần nhất"),
    ).toBeVisible();
    expect(screen.getByText("Shcare workspace-a")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Thử lại REST" }),
    ).toBeVisible();
  });

  it("distinguishes browser offline state from device presence", async () => {
    const online = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(false);

    renderPage();

    expect(
      await screen.findByText("Trình duyệt đang ngoại tuyến"),
    ).toBeVisible();
    expect(screen.getByText("Online 0/1")).toBeVisible();
    online.mockRestore();
  });

  it("closes the old socket and drops its late events when the workspace changes", async () => {
    const view = renderPage();
    await screen.findByText("Shcare workspace-a");
    const oldSocket = FakeWebSocket.instances[0];
    oldSocket.open();

    auth.user.currentWorkspace = { id: "workspace-b" };
    view.rerender(tree(view.client));

    expect(await screen.findByText("Shcare workspace-b")).toBeVisible();
    expect(screen.queryByText("Shcare workspace-a")).not.toBeInTheDocument();
    expect(oldSocket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(oldSocket.closeReason).toBe("PAGE_CLOSED");
    expect(
      screen.getByTestId("portal-live-monitoring-page"),
    ).toHaveAttribute("data-workspace-id", "workspace-b");

    oldSocket.emitText({
      type: "audio.session",
      protocolVersion: 2,
      frameEncoding: "shcare_audio_v2",
      workspaceId: "workspace-a",
      patientId: "patient-a",
      deviceId: "device-workspace-a",
      scanId: "stale-scan",
      sessionId: "stale-session",
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      encoding: "pcm_s16le",
      startedAt: "2026-07-29T11:02:00.000Z",
    });
    await waitFor(() =>
      expect(screen.queryByText(/stale-scan/)).not.toBeInTheDocument(),
    );
  });
});
