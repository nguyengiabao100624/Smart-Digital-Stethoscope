import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AssignDevicePage from "../../src/app/pages/portal/AssignDevicePage";

const api = vi.hoisted(() => ({
  listDevices: vi.fn(),
  listPatients: vi.fn(),
  updateDevice: vi.fn(),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const authUser = {
  id: "user-1",
  name: "Quản trị viên",
  email: "admin@example.test",
  role: "workspace_admin",
  capabilities: [
    "workspace.devices.view",
    "workspace.devices.manage",
    "workspace.patients.view",
  ],
  allowedSurfaces: ["portal"],
  currentWorkspaceId: "workspace-1",
  currentWorkspace: {
    id: "workspace-1",
    name: "Phòng khám Test",
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

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderAssignDevice() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateQueries = vi.spyOn(client, "invalidateQueries");
  const view = render(
    <MemoryRouter initialEntries={["/portal/devices/assign"]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/portal/devices/assign" element={<AssignDevicePage />} />
          <Route path="/portal/devices" element={<p>Danh sách thiết bị</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...view, client, invalidateQueries };
}

function defaultDevices() {
  return {
    devices: [
      {
        id: "Device_Aa-01",
        name: "Ống nghe Shcare A1",
        organizationId: "workspace-1",
        assignedPatientId: "",
        online: false,
      },
      {
        id: "Device_Assigned-02",
        name: "Ống nghe đang sử dụng",
        organizationId: "workspace-1",
        assignedPatientId: "Patient_Other-02",
        online: true,
      },
    ],
  };
}

function defaultPatients() {
  return {
    patients: [
      {
        id: "Patient_Aa-01",
        name: "Nguyễn An",
        patientCode: "BN-001",
        organizationId: "workspace-1",
      },
    ],
  };
}

async function chooseCombobox(
  accessibleName: RegExp,
  optionName: RegExp,
) {
  const trigger = screen.getByRole("combobox", { name: accessibleName });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const option = await screen.findByRole("option", { name: optionName });
  fireEvent.click(option);
}

describe("AssignDevicePage", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    Object.values(toast).forEach((mock) => mock.mockReset());
    api.listDevices.mockResolvedValue(defaultDevices());
    api.listPatients.mockResolvedValue(defaultPatients());
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  });

  it("uses canonical UI, exposes one heading and excludes already assigned devices", async () => {
    const { container } = renderAssignDevice();

    expect(
      await screen.findByRole("heading", { name: "Gán thiết bị", level: 1 }),
    ).toBeVisible();
    expect(
      container.querySelector(
        ".glass-panel, .hero-gradient-text, .brand-gradient-text, .premium-button",
      ),
    ).toBeNull();
    expect(
      screen.getByRole("combobox", { name: /^Thiết bị$/i }),
    ).toHaveClass("h-11");
    expect(
      screen.getByRole("button", { name: /xác nhận gán thiết bị/i }),
    ).toHaveClass("h-11");

    await chooseCombobox(/^Thiết bị$/i, /Ống nghe Shcare A1/);
    expect(
      screen.queryByRole("option", { name: /Ống nghe đang sử dụng/ }),
    ).not.toBeInTheDocument();
  });

  it("blocks double submit, keeps one intent key for retry, and only succeeds on an exact receipt", async () => {
    const pending = deferred<{
      device: {
        id: string;
        organizationId: string;
        assignedPatientId: string;
      };
      replayed: boolean;
    }>();
    api.updateDevice
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(
        new Error("Không thể kết nối backend Smart Health."),
      )
      .mockResolvedValueOnce({
        device: {
          id: "Device_Aa-01",
          organizationId: "workspace-1",
          assignedPatientId: "Patient_Aa-01",
        },
        replayed: true,
      });
    const { invalidateQueries } = renderAssignDevice();
    await screen.findByRole("heading", { name: "Gán thiết bị" });
    await chooseCombobox(/^Thiết bị$/i, /Ống nghe Shcare A1/);
    await chooseCombobox(/^Bệnh nhân$/i, /Nguyễn An/);

    const submit = screen.getByRole("button", {
      name: /xác nhận gán thiết bị/i,
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(api.updateDevice).toHaveBeenCalledTimes(1));
    const firstKey = api.updateDevice.mock.calls[0][2];
    expect(firstKey).toEqual(expect.any(String));

    await act(async () => {
      pending.reject(new Error("Không thể kết nối backend Smart Health."));
    });
    expect(
      await screen.findByText(/chưa xác định backend đã nhận yêu cầu hay chưa/i),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /thử lại cùng yêu cầu/i }),
    );
    await waitFor(() => expect(api.updateDevice).toHaveBeenCalledTimes(2));
    expect(api.updateDevice.mock.calls[1][2]).toBe(firstKey);

    fireEvent.click(
      screen.getByRole("button", { name: /thử lại cùng yêu cầu/i }),
    );
    await waitFor(() => expect(api.updateDevice).toHaveBeenCalledTimes(3));
    expect(api.updateDevice.mock.calls[2][2]).toBe(firstKey);
    expect(toast.success).toHaveBeenCalledWith(
      "Đã gán thiết bị cho bệnh nhân",
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["portal", "workspace", "workspace-1", "devices"],
    });
    expect(await screen.findByText("Danh sách thiết bị")).toBeVisible();
  });

  it("does not claim success when the backend receipt belongs to another workspace", async () => {
    api.updateDevice.mockResolvedValue({
      device: {
        id: "Device_Aa-01",
        organizationId: "workspace-other",
        assignedPatientId: "Patient_Aa-01",
      },
      replayed: false,
    });
    renderAssignDevice();
    await screen.findByRole("heading", { name: "Gán thiết bị" });
    await chooseCombobox(/^Thiết bị$/i, /Ống nghe Shcare A1/);
    await chooseCombobox(/^Bệnh nhân$/i, /Nguyễn An/);
    fireEvent.click(
      screen.getByRole("button", { name: /xác nhận gán thiết bị/i }),
    );

    expect(
      await screen.findByText(/backend trả về kết quả gán không đúng workspace/i),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText("Danh sách thiết bị")).not.toBeInTheDocument();
  });

  it("renders actionable empty states instead of an unusable form", async () => {
    api.listDevices.mockResolvedValueOnce({ devices: [] });
    const first = renderAssignDevice();
    expect(
      await screen.findByText("Không có thiết bị chưa gán"),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /ghép thiết bị mới/i }),
    ).toHaveAttribute("href", "/portal/devices/claim");
    expect(
      screen.queryByRole("button", { name: /xác nhận gán thiết bị/i }),
    ).not.toBeInTheDocument();

    first.unmount();
    api.listDevices.mockResolvedValue(defaultDevices());
    api.listPatients.mockResolvedValueOnce({ patients: [] });
    renderAssignDevice();
    expect(await screen.findByText("Chưa có bệnh nhân")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /thêm bệnh nhân/i }),
    ).toHaveAttribute("href", "/portal/patients/new");
  });

  it("does not call the backend while offline", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderAssignDevice();
    await screen.findByRole("heading", { name: "Gán thiết bị" });
    await chooseCombobox(/^Thiết bị$/i, /Ống nghe Shcare A1/);
    await chooseCombobox(/^Bệnh nhân$/i, /Nguyễn An/);
    fireEvent.click(
      screen.getByRole("button", { name: /xác nhận gán thiết bị/i }),
    );

    expect(await screen.findByText("Bạn đang ngoại tuyến")).toBeVisible();
    expect(api.updateDevice).not.toHaveBeenCalled();
  });
});
