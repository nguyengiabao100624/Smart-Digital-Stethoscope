import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientDetail from "../../src/app/pages/portal/PatientDetail";
import PatientImportPage from "../../src/app/pages/portal/PatientImportPage";
import PatientsPage from "../../src/app/pages/portal/PatientsPage";

const api = vi.hoisted(() => ({
  listPatients: vi.fn(),
  resolvePatientMutationAuthority: vi.fn(),
  createPatient: vi.fn(),
  getPatient: vi.fn(),
  updatePatient: vi.fn(),
  deletePatient: vi.fn(),
  validatePatientImport: vi.fn(),
  getPatientImportBatch: vi.fn(),
  commitPatientImport: vi.fn(),
  listScans: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  user: {
    id: "doctor-a",
    role: "doctor",
    raw: { role: "doctor" },
    currentWorkspace: { id: "workspace-a", name: "Phòng khám A" },
    capabilities: ["workspace.patients.manage"],
  },
}));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const patient = {
  id: "pat_01",
  organizationId: "workspace-a",
  patientCode: "HS-900",
  name: "Trần Minh Anh",
  dateOfBirth: "1988-11-02",
  age: 37,
  gender: "female",
  phone: "0901112233",
  email: "anh@example.com",
  address: "Huế",
  bloodType: "AB+",
  allergies: ["latex"],
  emergencyContact: {
    name: "Trần Văn Bình",
    phone: "0909988776",
    relationship: "Anh trai",
  },
  notes: "Theo dõi huyết áp",
  scanCount: 0,
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
};

function renderWithClient(node: React.ReactNode, initialEntries = ["/"]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}

describe("patient portal pages", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    auth.user.currentWorkspace = {
      id: "workspace-a",
      name: "Phòng khám A",
    };
    auth.user.capabilities = ["workspace.patients.manage"];
    auth.user.id = "doctor-a";
    auth.user.role = "doctor";
    auth.user.raw.role = "doctor";
    api.resolvePatientMutationAuthority.mockResolvedValue({
      expectedUserId: "patient-a",
      expectedWorkspaceId: "workspace-a",
      expectedAuthSessionId: "auth-session-a",
      authSessionEpoch: 7,
    });
    api.listPatients.mockResolvedValue({ patients: [patient] });
    api.getPatient.mockResolvedValue({ patient });
    api.listScans.mockResolvedValue({ scans: [] });
  });

  it("fails closed instead of rendering a patient from another workspace", async () => {
    api.listPatients.mockResolvedValue({
      patients: [
        {
          ...patient,
          organizationId: "workspace-b",
          name: "Bệnh nhân workspace B",
        },
      ],
    });

    renderWithClient(<PatientsPage />);

    expect(
      await screen.findByText(/không thuộc workspace hiện tại/i),
    ).toBeVisible();
    expect(
      screen.queryByText("Bệnh nhân workspace B"),
    ).not.toBeInTheDocument();
  });

  it("protects a dirty create draft from browser unload", async () => {
    renderWithClient(<PatientsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Thêm bệnh nhân" }),
    );
    fireEvent.change(screen.getByLabelText("Họ và tên *"), {
      target: { value: "Bản nháp chưa lưu" },
    });

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("fails closed instead of rendering scan history from another workspace", async () => {
    api.listScans.mockResolvedValue({
      scans: [
        {
          id: "scan_tenant_b",
          organizationId: "workspace-b",
          patientId: "pat_01",
          aiLabel: "Tenant B scan",
        },
      ],
    });

    renderWithClient(
      <Routes>
        <Route path="/portal/patients/:id" element={<PatientDetail />} />
      </Routes>,
      ["/portal/patients/pat_01"],
    );

    expect(
      await screen.findByText(/Không thể tải lịch sử lượt đo/i),
    ).toBeVisible();
    expect(screen.queryByText("Tenant B scan")).not.toBeInTheDocument();
  });

  it("retries one unchanged patient create with the same idempotency key", async () => {
    auth.user.id = "patient-a";
    auth.user.role = "patient";
    auth.user.raw.role = "patient";
    auth.user.capabilities = ["personal.profiles.manage"];
    api.createPatient
      .mockRejectedValueOnce(new Error("Network offline"))
      .mockResolvedValueOnce({
        patient: {
          ...patient,
          id: "pat_new",
          patientCode: "PAT-20260723",
          name: "Nguyễn Văn An",
          dateOfBirth: "1990-04-12",
          age: 36,
          gender: "male",
          phone: "0901234567",
          email: "",
          address: "",
          bloodType: "",
          allergies: [],
          emergencyContact: { name: "", phone: "", relationship: "" },
          notes: "",
        },
        replayed: false,
      });

    renderWithClient(<PatientsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Thêm bệnh nhân" }),
    );
    fireEvent.change(screen.getByLabelText("Họ và tên *"), {
      target: { value: "Nguyễn Văn An" },
    });
    fireEvent.change(screen.getByLabelText("Ngày sinh *"), {
      target: { value: "1990-04-12" },
    });
    fireEvent.change(screen.getByLabelText("Số điện thoại *"), {
      target: { value: "0901234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo hồ sơ" }));

    expect(await screen.findByText("Network offline")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Tạo hồ sơ" }));

    await waitFor(() => expect(api.createPatient).toHaveBeenCalledTimes(2));
    expect(api.createPatient.mock.calls[1][1]).toBe(
      api.createPatient.mock.calls[0][1],
    );
    expect(api.createPatient.mock.calls[0][0]).toMatchObject({
      name: "Nguyễn Văn An",
      dateOfBirth: "1990-04-12",
      phone: "0901234567",
      allergies: [],
      emergencyContact: { name: "", phone: "", relationship: "" },
    });
    expect(api.resolvePatientMutationAuthority).toHaveBeenCalledWith(
      "patient-a",
      "workspace-a",
    );
    expect(api.createPatient.mock.calls[0][2]).toEqual({
      expectedUserId: "patient-a",
      expectedWorkspaceId: "workspace-a",
      expectedAuthSessionId: "auth-session-a",
      authSessionEpoch: 7,
    });
  });

  it("saves and deletes only by canonical id with stable retry keys", async () => {
    api.updatePatient.mockResolvedValue({
      patient: {
        ...patient,
        name: "Trần Minh Anh mới",
        updatedAt: "2026-07-23T01:00:00.000Z",
      },
      replayed: false,
    });
    api.deletePatient
      .mockResolvedValueOnce({
        deleted: true,
        patientId: "HS-900",
        replayed: false,
      })
      .mockResolvedValueOnce({
        deleted: true,
        patientId: "pat_01",
        replayed: true,
      });

    renderWithClient(
      <Routes>
        <Route path="/portal/patients/:id" element={<PatientDetail />} />
        <Route path="/portal/patients" element={<div>Danh sách sau xóa</div>} />
      </Routes>,
      ["/portal/patients/pat_01"],
    );

    const nameInput = await screen.findByLabelText("Họ và tên *");
    fireEvent.change(nameInput, { target: { value: "Trần Minh Anh mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu hồ sơ" }));

    await waitFor(() => expect(api.updatePatient).toHaveBeenCalledTimes(1));
    expect(api.updatePatient.mock.calls[0][0]).toBe("pat_01");
    expect(api.updatePatient.mock.calls[0][1]).toMatchObject({
      name: "Trần Minh Anh mới",
      patientCode: "HS-900",
      dateOfBirth: "1988-11-02",
    });

    fireEvent.click(screen.getByRole("button", { name: "Xóa hồ sơ" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Xóa hồ sơ" }));

    expect(await within(dialog).findByText(/khác ID canonical/)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Xóa hồ sơ" }));

    expect(await screen.findByText("Danh sách sau xóa")).toBeVisible();
    expect(api.deletePatient).toHaveBeenCalledTimes(2);
    expect(api.deletePatient.mock.calls[0][0]).toBe("pat_01");
    expect(api.deletePatient.mock.calls[1][0]).toBe("pat_01");
    expect(api.deletePatient.mock.calls[1][1]).toBe(
      api.deletePatient.mock.calls[0][1],
    );
  });

  it("fails closed when import validation returns a batch from another workspace", async () => {
    const file = new File(["name\nTenant B"], "patients.csv", {
      type: "text/csv",
    });
    api.validatePatientImport.mockResolvedValue({
      batch: {
        id: "pimport_foreign",
        organizationId: "workspace-b",
        fileName: file.name,
        fileSizeBytes: file.size,
        status: "validated",
        rowCount: 0,
        validCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        importedCount: 0,
        patientIds: [],
        rows: [],
        version: 1,
        expiresAt: "2026-07-24T00:00:00.000Z",
        committedAt: "",
        createdAt: "2026-07-23T00:00:00.000Z",
        updatedAt: "2026-07-23T00:00:00.000Z",
      },
      replayed: false,
    });

    renderWithClient(<PatientImportPage />);
    fireEvent.change(screen.getByLabelText("Chọn file CSV"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra file" }));

    expect(
      await screen.findByText(/không thuộc workspace hiện tại/i),
    ).toBeVisible();
    expect(
      screen.queryByTestId("patient-import-preview"),
    ).not.toBeInTheDocument();
  });

  it("does not overlap import refresh with validate or commit", async () => {
    const file = new File(["name\nNguyễn An"], "patients.csv", {
      type: "text/csv",
    });
    const validatedBatch = {
      id: "pimport_busy",
      organizationId: "workspace-a",
      fileName: file.name,
      fileSizeBytes: file.size,
      status: "validated",
      rowCount: 1,
      validCount: 1,
      invalidCount: 0,
      duplicateCount: 0,
      importedCount: 0,
      patientIds: [],
      rows: [
        {
          rowNumber: 2,
          status: "valid",
          issues: [],
          patient: {
            id: "pat_busy",
            patientCode: "BUSY-001",
            name: "Nguyễn An",
            dateOfBirth: "",
            gender: "",
            phone: "",
            email: "",
            address: "",
            bloodType: "",
            allergies: [],
            emergencyContact: {},
            notes: "",
            profileType: "patient",
          },
        },
      ],
      version: 1,
      expiresAt: "2026-07-24T00:00:00.000Z",
      committedAt: "",
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    api.validatePatientImport.mockResolvedValue({
      batch: validatedBatch,
      replayed: false,
    });
    api.getPatientImportBatch.mockImplementation(
      () => new Promise(() => undefined),
    );

    renderWithClient(<PatientImportPage />);
    fireEvent.change(screen.getByLabelText("Chọn file CSV"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra file" }));
    await screen.findByTestId("patient-import-preview");

    fireEvent.click(
      screen.getByRole("button", { name: "Làm mới trạng thái" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Kiểm tra lại" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Import 1 hồ sơ" }),
      ).toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Import 1 hồ sơ" }));
    expect(api.commitPatientImport).not.toHaveBeenCalled();
  });

  it("keeps import permission denial accessible with one route heading", () => {
    auth.user.capabilities = ["workspace.patients.view"];

    renderWithClient(<PatientImportPage />);

    expect(
      screen.getByRole("heading", { name: "Import bệnh nhân", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText("Không có quyền import")).toBeVisible();
  });

  it("validates then commits one whole import batch without per-row creates", async () => {
    const validatedBatch = {
      id: "pimport_01",
      organizationId: "workspace-a",
      fileName: "patients.csv",
      fileSizeBytes: 128,
      status: "validated",
      rowCount: 1,
      validCount: 1,
      invalidCount: 0,
      duplicateCount: 0,
      importedCount: 0,
      patientIds: [],
      rows: [
        {
          rowNumber: 2,
          status: "valid",
          issues: [],
          patient: {
            id: "pat_import_01",
            patientCode: "IMPORT-001",
            name: "Bệnh nhân Import",
            dateOfBirth: "1990-01-02",
            gender: "female",
            phone: "0901234567",
            email: "import@example.com",
            address: "",
            bloodType: "O+",
            allergies: [],
            emergencyContact: {},
            notes: "",
            profileType: "patient",
          },
        },
      ],
      version: 1,
      expiresAt: "2026-07-24T00:00:00.000Z",
      committedAt: "",
      createdAt: "2026-07-23T00:00:00.000Z",
      updatedAt: "2026-07-23T00:00:00.000Z",
    };
    api.validatePatientImport.mockResolvedValue({
      batch: validatedBatch,
      replayed: false,
    });
    api.commitPatientImport.mockResolvedValue({
      batch: {
        ...validatedBatch,
        status: "committed",
        importedCount: 1,
        patientIds: ["pat_import_01"],
        version: 2,
        committedAt: "2026-07-23T01:00:00.000Z",
        updatedAt: "2026-07-23T01:00:00.000Z",
      },
      importedCount: 1,
      patientIds: ["pat_import_01"],
      replayed: false,
    });

    const { client } = renderWithClient(<PatientImportPage />);
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const file = new File(
      ["name,patientCode\nBệnh nhân Import,IMPORT-001"],
      "patients.csv",
      { type: "text/csv" },
    );
    validatedBatch.fileSizeBytes = file.size;
    fireEvent.change(screen.getByLabelText("Chọn file CSV"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra file" }));

    expect((await screen.findAllByText("Bệnh nhân Import")).length).toBeGreaterThan(0);
    expect(api.validatePatientImport).toHaveBeenCalledTimes(1);
    const validationKey = api.validatePatientImport.mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra lại" }));
    await waitFor(() => expect(api.validatePatientImport).toHaveBeenCalledTimes(2));
    expect(api.validatePatientImport.mock.calls[1][1]).toBe(validationKey);

    fireEvent.click(screen.getByRole("button", { name: "Import 1 hồ sơ" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Xác nhận import" }),
    );

    expect(await screen.findByText("Import hoàn tất")).toBeVisible();
    expect(api.commitPatientImport).toHaveBeenCalledTimes(1);
    expect(api.commitPatientImport.mock.calls[0][0]).toBe("pimport_01");
    expect(api.createPatient).not.toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["portal", "workspace", "workspace-a", "patients"],
    });
  });
});
