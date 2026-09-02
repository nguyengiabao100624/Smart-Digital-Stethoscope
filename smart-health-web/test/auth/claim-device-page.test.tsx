import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ClaimDevicePage from "../../src/app/pages/portal/ClaimDevicePage";

const api = vi.hoisted(() => ({ redeemDeviceAccess: vi.fn() }));

const authUser = {
  id: "user-1",
  name: "Bác sĩ Nguyễn An",
  email: "doctor@example.test",
  role: "doctor",
  capabilities: ["workspace.devices.view"],
  allowedSurfaces: ["portal"],
  currentWorkspace: {
    id: "workspace-1",
    name: "Phòng khám Test",
    type: "clinic",
    role: "doctor",
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

function redeemResponse(
  accessLevel: "viewer" | "manager" = "viewer",
  workspaceId = "workspace-1",
  userId = "user-1",
) {
  return {
    device: {
      id: "device-1",
      name: "Shcare A1",
      organizationId: workspaceId,
      accessLevel,
      accessGrantId: "grant-1",
      online: false,
    },
    grant: {
      id: "grant-1",
      deviceId: "device-1",
      organizationId: workspaceId,
      userId,
      accessLevel,
      status: "active" as const,
      grantedAt: "2026-09-02T10:00:00.000Z",
    },
    idempotent: false,
  };
}

function fillCode(value = "SHC-2345-6789-ABCD-EFGH") {
  fireEvent.change(screen.getByLabelText(/^Mã truy cập$/i), {
    target: { value },
  });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /^Thêm thiết bị$/i }));
}

describe("ClaimDevicePage access-code contract", () => {
  beforeEach(() => {
    authUser.currentWorkspace.id = "workspace-1";
    authUser.capabilities = ["workspace.devices.view"];
    api.redeemDeviceAccess.mockReset();
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  });

  it("lets an authenticated doctor redeem a code without a global manage capability", async () => {
    api.redeemDeviceAccess.mockResolvedValue(redeemResponse("viewer"));
    renderClaimPage();

    expect(screen.queryByLabelText(/^Device ID$/i)).not.toBeInTheDocument();
    fillCode();
    submit();

    await waitFor(() => expect(api.redeemDeviceAccess).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Đã thêm thiết bị")).toBeVisible();
    expect(screen.getByText("Xem & kết nối Wi-Fi")).toBeVisible();
  });

  it("normalizes only the canonical opaque code and never sends a Device ID", async () => {
    api.redeemDeviceAccess.mockResolvedValue(redeemResponse("manager"));
    renderClaimPage();

    fillCode("s h c 2345 6789 abcd efgh");
    submit();

    await waitFor(() => expect(api.redeemDeviceAccess).toHaveBeenCalledTimes(1));
    expect(api.redeemDeviceAccess.mock.calls[0][0]).toBe(
      "SHC-2345-6789-ABCD-EFGH",
    );
    expect(api.redeemDeviceAccess.mock.calls[0][1]).toEqual(expect.any(String));
    expect(screen.getByText("Quản lý thiết bị")).toBeVisible();
  });

  it("rejects a malformed code before transmitting", async () => {
    renderClaimPage();
    fillCode("SHC-123");
    submit();

    expect(
      await screen.findByText("Mã phải có dạng SHC-XXXX-XXXX-XXXX-XXXX."),
    ).toBeVisible();
    expect(api.redeemDeviceAccess).not.toHaveBeenCalled();
  });

  it("drops a late receipt after the active workspace changes", async () => {
    const pending = deferred<ReturnType<typeof redeemResponse>>();
    api.redeemDeviceAccess.mockReturnValueOnce(pending.promise);
    const view = renderClaimPage();
    fillCode();
    submit();
    await waitFor(() => expect(api.redeemDeviceAccess).toHaveBeenCalledTimes(1));

    authUser.currentWorkspace.id = "workspace-2";
    view.rerenderClaimPage();
    await act(async () => pending.resolve(redeemResponse("viewer")));

    expect(screen.queryByText("Đã thêm thiết bị")).not.toBeInTheDocument();
    expect(view.invalidateQueries).not.toHaveBeenCalled();
  });

  it("fails closed when the backend receipt belongs to another authority", async () => {
    api.redeemDeviceAccess.mockResolvedValue(
      redeemResponse("manager", "workspace-foreign", "user-foreign"),
    );
    renderClaimPage();
    fillCode();
    submit();

    expect(
      await screen.findByText("Biên nhận không khớp quyền hiện tại"),
    ).toBeVisible();
    expect(screen.queryByText("Đã thêm thiết bị")).not.toBeInTheDocument();
  });

  it("reuses one intent key for retry and rotates it only after the code changes", async () => {
    api.redeemDeviceAccess
      .mockRejectedValueOnce(new Error("network failed"))
      .mockRejectedValueOnce(new Error("network failed again"))
      .mockResolvedValueOnce(redeemResponse("viewer"));
    renderClaimPage();
    fillCode();
    submit();

    expect(await screen.findByText("Chưa kết nối được máy chủ")).toBeVisible();
    const firstKey = api.redeemDeviceAccess.mock.calls[0][1];
    fireEvent.click(
      screen.getByRole("button", { name: /Thử lại cùng yêu cầu/i }),
    );
    await waitFor(() => expect(api.redeemDeviceAccess).toHaveBeenCalledTimes(2));
    expect(api.redeemDeviceAccess.mock.calls[1][1]).toBe(firstKey);

    fillCode("SHC-2345-6789-ABCD-EFGJ");
    submit();
    await waitFor(() => expect(api.redeemDeviceAccess).toHaveBeenCalledTimes(3));
    expect(api.redeemDeviceAccess.mock.calls[2][1]).not.toBe(firstKey);
  });

  it("does not transmit offline and retries the same intent after reconnecting", async () => {
    const online = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(false);
    api.redeemDeviceAccess.mockResolvedValue(redeemResponse("viewer"));
    renderClaimPage();
    fillCode();
    submit();

    expect(await screen.findByText("Chưa kết nối được máy chủ")).toBeVisible();
    expect(api.redeemDeviceAccess).not.toHaveBeenCalled();

    online.mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: /Thử lại cùng yêu cầu/i }),
    );
    await waitFor(() => expect(api.redeemDeviceAccess).toHaveBeenCalledTimes(1));
  });

  it.each([
    [
      "used",
      Object.assign(new Error("used"), {
        status: 409,
        code: "DEVICE_ACCESS_CODE_ALREADY_USED",
      }),
      "Mã đã được sử dụng",
    ],
    [
      "expired",
      Object.assign(new Error("expired"), {
        status: 410,
        code: "DEVICE_ACCESS_CODE_EXPIRED",
      }),
      "Mã không còn hiệu lực",
    ],
    [
      "foreign",
      Object.assign(new Error("forbidden"), { status: 403 }),
      "Không thể cấp quyền thiết bị",
    ],
  ])("renders the terminal %s state inline", async (_kind, error, message) => {
    api.redeemDeviceAccess.mockRejectedValue(error);
    renderClaimPage();
    fillCode();
    submit();

    expect(await screen.findByText(message)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Thử lại cùng yêu cầu/i }),
    ).not.toBeInTheDocument();
  });

  it("invalidates only the active workspace device ledger after success", async () => {
    api.redeemDeviceAccess.mockResolvedValue(redeemResponse("viewer"));
    const { invalidateQueries } = renderClaimPage();
    fillCode();
    submit();

    await screen.findByText("Đã thêm thiết bị");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["portal", "workspace", "workspace-1", "devices"],
    });
  });

  it("keeps the page free of retired visual primitives", () => {
    const { container } = renderClaimPage();
    expect(
      container.querySelector(".glass-panel, .hero-gradient-text, .premium-button"),
    ).toBeNull();
  });
});
