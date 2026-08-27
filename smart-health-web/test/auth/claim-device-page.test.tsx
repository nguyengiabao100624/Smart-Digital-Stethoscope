import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ClaimDevicePage from "../../src/app/pages/portal/ClaimDevicePage";

const api = vi.hoisted(() => ({
  activateDeviceByClaim: vi.fn(),
  listDevices: vi.fn(),
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

function renderClaimPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateQueries = vi.spyOn(client, "invalidateQueries");
  const ui = () => (
    <MemoryRouter initialEntries={["/portal/devices/claim"]}>
      <QueryClientProvider client={client}>
        <ClaimDevicePage />
      </QueryClientProvider>
    </MemoryRouter>
  );
  const view = render(ui());
  return {
    ...view,
    client,
    invalidateQueries,
    rerenderClaimPage: () => view.rerender(ui()),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fillExactClaim(
  deviceId = "Device_Aa-01",
  claimCode = "Claim_aB-123",
) {
  fireEvent.change(screen.getByLabelText(/^Device ID$/i), {
    target: { value: deviceId },
  });
  fireEvent.change(screen.getByLabelText(/^Claim code$/i), {
    target: { value: claimCode },
  });
}

function awaitingResponse() {
  return {
    device: {
      id: "Device_Aa-01",
      name: "Shcare A1",
      organizationId: "workspace-1",
      connected: false,
      online: false,
    },
    pairing: {
      outcome: "accepted" as const,
      presence: "awaiting_online" as const,
      onlineConfirmed: false,
      authenticatedTransport: null,
    },
  };
}

describe("ClaimDevicePage", () => {
  beforeEach(() => {
    authUser.currentWorkspace.id = "workspace-1";
    authUser.capabilities = ["workspace.devices.view", "workspace.devices.manage"];
    Object.values(api).forEach((mock) => mock.mockReset());
    api.listDevices.mockResolvedValue({ devices: [] });
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  });

  it("drops a late claim result after the active workspace changes", async () => {
    const pending = deferred<ReturnType<typeof awaitingResponse>>();
    api.activateDeviceByClaim.mockReturnValueOnce(pending.promise);
    const view = renderClaimPage();
    fillExactClaim();
    fireEvent.click(screen.getByRole("button", { name: /xác nhận ghép thiết bị/i }));
    await waitFor(() => expect(api.activateDeviceByClaim).toHaveBeenCalledTimes(1));

    authUser.currentWorkspace.id = "workspace-2";
    view.rerenderClaimPage();
    await act(async () => {
      pending.resolve(awaitingResponse());
    });

    expect(screen.queryByText("Backend đã chấp nhận")).not.toBeInTheDocument();
    expect(view.invalidateQueries).not.toHaveBeenCalled();
  });

  it("does not treat workspace view access as permission to claim a device", async () => {
    authUser.capabilities = ["workspace.devices.view"];
    renderClaimPage();

    expect(
      await screen.findByText(/không có quyền ghép thiết bị/i),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /xác nhận ghép thiết bị/i }),
    ).not.toBeInTheDocument();
    expect(api.activateDeviceByClaim).not.toHaveBeenCalled();
  });

  it("requires exact canonical device and claim identifiers without mutating case", async () => {
    api.activateDeviceByClaim.mockResolvedValue(awaitingResponse());
    renderClaimPage();

    fillExactClaim("bad id", "ABC");
    fireEvent.click(screen.getByRole("button", { name: /xác nhận ghép thiết bị/i }));

    expect(await screen.findByText(/Device ID chỉ được chứa/i)).toBeVisible();
    expect(screen.getByText(/Claim code phải có từ 6 đến 80/i)).toBeVisible();
    expect(api.activateDeviceByClaim).not.toHaveBeenCalled();

    fillExactClaim();
    fireEvent.click(screen.getByRole("button", { name: /xác nhận ghép thiết bị/i }));
    await waitFor(() => expect(api.activateDeviceByClaim).toHaveBeenCalledTimes(1));
    expect(api.activateDeviceByClaim.mock.calls[0][0]).toEqual({
      deviceId: "Device_Aa-01",
      claimCode: "Claim_aB-123",
      connectionMethod: "Manual",
      organizationId: "workspace-1",
    });
  });

  it("reuses one intent key for double-submit and ambiguous retry, then resets it after input changes", async () => {
    let rejectFirst!: (reason: unknown) => void;
    const firstAttempt = new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });
    api.activateDeviceByClaim
      .mockReturnValueOnce(firstAttempt)
      .mockRejectedValueOnce(new Error("Không thể kết nối backend Smart Health."))
      .mockResolvedValueOnce(awaitingResponse());
    renderClaimPage();
    fillExactClaim();

    const submit = screen.getByRole("button", { name: /xác nhận ghép thiết bị/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(api.activateDeviceByClaim).toHaveBeenCalledTimes(1));
    const firstKey = api.activateDeviceByClaim.mock.calls[0][1];
    expect(firstKey).toEqual(expect.any(String));

    await act(async () => {
      rejectFirst(new Error("Không thể kết nối backend Smart Health."));
    });
    expect(await screen.findByText(/chưa xác định backend đã nhận yêu cầu/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /thử lại cùng yêu cầu/i }));
    await waitFor(() => expect(api.activateDeviceByClaim).toHaveBeenCalledTimes(2));
    expect(api.activateDeviceByClaim.mock.calls[1][1]).toBe(firstKey);

    fireEvent.change(screen.getByLabelText(/^Claim code$/i), {
      target: { value: "Claim_zZ-456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /xác nhận ghép thiết bị/i }));
    await waitFor(() => expect(api.activateDeviceByClaim).toHaveBeenCalledTimes(3));
    expect(api.activateDeviceByClaim.mock.calls[2][1]).not.toBe(firstKey);
  });

  it("renders accepted and awaiting-online truth, then confirms online from backend data", async () => {
    api.activateDeviceByClaim.mockResolvedValue(awaitingResponse());
    api.listDevices
      .mockResolvedValueOnce({
        devices: [
          {
            id: "Device_Aa-01",
            name: "Shcare A1",
            organizationId: "workspace-1",
            online: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        devices: [
          {
            id: "Device_Aa-01",
            name: "Shcare A1",
            organizationId: "workspace-1",
            online: true,
          },
        ],
      });
    const { invalidateQueries } = renderClaimPage();
    fillExactClaim();
    fireEvent.click(screen.getByRole("button", { name: /xác nhận ghép thiết bị/i }));

    expect(await screen.findByText("Backend đã chấp nhận")).toBeVisible();
    expect(screen.getByText(/đang chờ thiết bị xác thực trực tuyến/i)).toBeVisible();
    expect(screen.queryByText(/thiết bị đã sẵn sàng/i)).not.toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["portal", "workspace", "workspace-1", "devices"],
    });

    fireEvent.click(screen.getByRole("button", { name: /kiểm tra trạng thái/i }));
    expect(await screen.findByText(/thiết bị vẫn chưa online/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /kiểm tra lại/i }));
    expect(await screen.findByText("Thiết bị đã xác thực trực tuyến")).toBeVisible();
  });

  it.each([
    [
      "offline",
      new Error("Không thể kết nối backend Smart Health."),
      /chưa xác định backend đã nhận yêu cầu/i,
      /thử lại cùng yêu cầu/i,
    ],
    [
      "expired",
      Object.assign(new Error("The device claim has expired"), {
        status: 409,
        code: "DEVICE_CLAIM_EXPIRED",
      }),
      /claim code đã hết hạn/i,
      /nhập claim code mới/i,
    ],
    [
      "permission",
      Object.assign(new Error("Permission denied"), { status: 403 }),
      /không có quyền ghép thiết bị/i,
      /liên hệ quản trị viên/i,
    ],
  ])("shows an inline %s failure state instead of relying on a toast", async (_kind, error, message, action) => {
    api.activateDeviceByClaim.mockRejectedValue(error);
    renderClaimPage();
    fillExactClaim();
    fireEvent.click(screen.getByRole("button", { name: /xác nhận ghép thiết bị/i }));

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByText(action)).toBeVisible();
  });

  it("does not transmit while the browser is offline and retries the same intent after reconnecting", async () => {
    const online = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(false);
    api.activateDeviceByClaim.mockResolvedValue(awaitingResponse());
    renderClaimPage();
    fillExactClaim();

    fireEvent.click(screen.getByRole("button", { name: /xác nhận ghép thiết bị/i }));

    expect(await screen.findByText("Thiết bị đang ngoại tuyến")).toBeVisible();
    expect(api.activateDeviceByClaim).not.toHaveBeenCalled();

    online.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /thử lại cùng yêu cầu/i }));
    await waitFor(() => expect(api.activateDeviceByClaim).toHaveBeenCalledTimes(1));
    expect(api.activateDeviceByClaim.mock.calls[0][1]).toEqual(expect.any(String));
  });

  it("does not use the retired glass, gradient-text or premium-button primitives", () => {
    const { container } = renderClaimPage();
    expect(
      container.querySelector(".glass-panel, .hero-gradient-text, .premium-button"),
    ).toBeNull();
  });
});
