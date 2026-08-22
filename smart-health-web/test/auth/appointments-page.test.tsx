import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppointmentsPage from "../../src/app/pages/portal/AppointmentsPage";

const api = vi.hoisted(() => ({
  listAppointments: vi.fn(),
  getAppointment: vi.fn(),
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
  listPatients: vi.fn(),
  listStaff: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  user: {
    id: "doctor_01",
    name: "BS. Trần Bình",
    email: "doctor@example.com",
    role: "doctor",
    raw: {},
    currentWorkspace: { id: "workspace-a", name: "Phòng khám A" },
    capabilities: [
      "workspace.appointments.view",
      "workspace.appointments.manage",
      "workspace.staff.manage",
    ],
  },
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));
vi.mock("sonner", () => ({ toast }));

const patient = {
  id: "pat_01",
  organizationId: "workspace-a",
  patientCode: "BN-001",
  name: "Nguyễn An",
};

const doctor = {
  id: "doctor_01",
  role: "doctor",
  name: "BS. Trần Bình",
  email: "doctor@example.com",
  workspaceMembership: {
    id: "membership-doctor-01",
    organizationId: "workspace-a",
    role: "doctor",
    status: "active",
    operational: true,
  },
  accountStatus: "active",
  roleRequestStatus: "approved",
};

function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "appt_01",
    organizationId: "workspace-a",
    patientId: "pat_01",
    doctorUserId: "doctor_01",
    type: "remote_consultation",
    status: "scheduled",
    startsAt: "2026-08-01T08:00:00.000Z",
    endsAt: "2026-08-01T08:30:00.000Z",
    location: "Phòng tư vấn 1",
    channel: "video",
    reason: "Tái khám",
    notes: "Mang theo kết quả đo",
    cancellationReason: "",
    cancelledAt: "",
    completedAt: "",
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    patient,
    doctor,
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppointmentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

async function openCreateForm() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Tạo lịch hẹn" }),
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Bệnh nhân"), {
    target: { value: "pat_01" },
  });
  return dialog;
}

describe("Portal Appointments", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    toast.success.mockReset();
    toast.error.mockReset();
    auth.user.currentWorkspace = {
      id: "workspace-a",
      name: "Phòng khám A",
    };
    auth.user.capabilities = [
      "workspace.appointments.view",
      "workspace.appointments.manage",
      "workspace.staff.manage",
    ];
    api.listAppointments.mockResolvedValue({
      appointments: [appointment()],
    });
    api.getAppointment.mockResolvedValue({ appointment: appointment() });
    api.listPatients.mockResolvedValue({ patients: [patient] });
    api.listStaff.mockResolvedValue({
      staff: [doctor],
      doctors: [doctor],
    });
    api.deleteAppointment.mockResolvedValue({
      deleted: true,
      appointmentId: "appt_01",
      workspaceId: "workspace-a",
      deletedAt: "2026-08-22T08:30:00.000Z",
      replayed: false,
    });
  });

  it("fails closed instead of rendering a foreign-workspace appointment", async () => {
    api.listAppointments.mockResolvedValue({
      appointments: [
        appointment({
          organizationId: "workspace-b",
          reason: "PHI workspace B",
        }),
      ],
    });

    renderPage();

    expect(
      await screen.findByText(/không thuộc workspace hiện tại/i),
    ).toBeVisible();
    expect(screen.queryByText("PHI workspace B")).not.toBeInTheDocument();
  });

  it("loads canonical detail and rejects a mismatched detail response", async () => {
    api.getAppointment.mockResolvedValue({
      appointment: appointment({
        id: "appt_other",
        notes: "Ghi chú từ lịch khác",
      }),
    });

    renderPage();
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Chi tiết" }))[0],
    );

    await waitFor(() =>
      expect(api.getAppointment).toHaveBeenCalledWith("appt_01"),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(/không trả về đúng lịch hẹn/i),
    ).toBeVisible();
    expect(
      within(dialog).queryByText("Ghi chú từ lịch khác"),
    ).not.toBeInTheDocument();
  });

  it("protects a dirty appointment draft from browser unload", async () => {
    renderPage();
    const dialog = await openCreateForm();
    fireEvent.change(within(dialog).getByLabelText("Lý do hẹn"), {
      target: { value: "Bản nháp chưa lưu" },
    });

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("retries one unchanged create intent with the same idempotency key", async () => {
    api.createAppointment
      .mockRejectedValueOnce(new Error("Mạng tạm thời gián đoạn"))
      .mockImplementationOnce(async (payload) => ({
        appointment: appointment({ ...payload, id: "appt_created" }),
      }));

    renderPage();
    const dialog = await openCreateForm();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Gửi tới backend" }),
    );
    expect(
      await within(dialog).findByText("Mạng tạm thời gián đoạn"),
    ).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Gửi tới backend" }),
    );

    await waitFor(() => expect(api.createAppointment).toHaveBeenCalledTimes(2));
    expect(api.createAppointment.mock.calls[1][1]).toBe(
      api.createAppointment.mock.calls[0][1],
    );
  });

  it("does not publish success for a foreign mutation receipt", async () => {
    api.createAppointment.mockResolvedValue({
      appointment: appointment({
        id: "appt_foreign",
        organizationId: "workspace-b",
      }),
    });

    renderPage();
    const dialog = await openCreateForm();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Gửi tới backend" }),
    );

    expect(
      await within(dialog).findByText(/không thuộc workspace hiện tại/i),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("suppresses a late mutation result after the active workspace changes", async () => {
    let resolveCreate:
      | ((value: { appointment: ReturnType<typeof appointment> }) => void)
      | undefined;
    api.createAppointment.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const { rerender, client } = renderPage();
    const dialog = await openCreateForm();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Gửi tới backend" }),
    );
    await waitFor(() => expect(api.createAppointment).toHaveBeenCalledTimes(1));
    const submittedPayload = api.createAppointment.mock.calls[0][0];

    auth.user.currentWorkspace = {
      id: "workspace-b",
      name: "Phòng khám B",
    };
    api.listAppointments.mockResolvedValue({
      appointments: [
        appointment({
          id: "appt_workspace_b",
          organizationId: "workspace-b",
          patientId: "pat_workspace_b",
          patient: {
            ...patient,
            id: "pat_workspace_b",
            organizationId: "workspace-b",
            patientCode: "BN-B-001",
            name: "Bệnh nhân B",
          },
          doctor: null,
          doctorUserId: "",
          reason: "Lịch workspace B",
        }),
      ],
    });
    rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AppointmentsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    resolveCreate?.({
      appointment: appointment({
        ...submittedPayload,
        id: "appt_late_workspace_a",
      }),
    });

    await screen.findAllByText("Bệnh nhân B");
    await waitFor(() => expect(toast.success).not.toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Backend đã tạo lịch hẹn."),
    ).not.toBeInTheDocument();
  });

  it("blocks create and exposes retry while the patient catalog is unavailable", async () => {
    api.listPatients
      .mockRejectedValueOnce(new Error("Danh mục tạm thời gián đoạn"))
      .mockResolvedValueOnce({ patients: [patient] });

    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Tạo lịch hẹn" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(/không tải được danh mục bệnh nhân/i),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Gửi tới backend" }),
    ).toBeDisabled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Thử tải lại" }),
    );
    await waitFor(() => expect(api.listPatients).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Gửi tới backend" }),
      ).toBeEnabled(),
    );
  });

  it("confirms soft-delete and reuses one idempotency key after a transient failure", async () => {
    api.deleteAppointment
      .mockRejectedValueOnce(new Error("Mạng tạm thời gián đoạn"))
      .mockResolvedValueOnce({
        deleted: true,
        appointmentId: "appt_01",
        workspaceId: "workspace-a",
        deletedAt: "2026-08-22T08:30:00.000Z",
        replayed: true,
      });

    renderPage();
    fireEvent.click((await screen.findAllByRole("button", { name: "Xóa" }))[0]);
    const alert = await screen.findByRole("alertdialog");
    expect(within(alert).getByText(/xóa mềm và ẩn khỏi danh sách/i)).toBeVisible();
    fireEvent.click(within(alert).getByRole("button", { name: "Xác nhận xóa mềm" }));
    expect(await within(alert).findByText("Mạng tạm thời gián đoạn")).toBeVisible();
    fireEvent.click(within(alert).getByRole("button", { name: "Xác nhận xóa mềm" }));

    await waitFor(() => expect(api.deleteAppointment).toHaveBeenCalledTimes(2));
    expect(api.deleteAppointment.mock.calls[1][1]).toBe(api.deleteAppointment.mock.calls[0][1]);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Backend đã xác nhận xóa mềm lịch hẹn."),
    );
  });
});
