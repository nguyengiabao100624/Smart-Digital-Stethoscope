import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RegisterDoctorPage from "../../src/app/pages/auth/RegisterDoctorPage";
import { inspectRoleRequestDocument } from "../../src/lib/role-request-document-contract";

const mocks = vi.hoisted(() => ({
  currentUid: "firebase-a",
  tokenSnapshot: "",
  createFirebaseAccount: vi.fn(),
  authenticateFirebase: vi.fn(),
  getTokenSnapshot: vi.fn(),
  clearTokenIfMatches: vi.fn(),
  listPublicClinics: vi.fn(),
  requestRole: vi.fn(),
  uploadRoleRequestDocument: vi.fn(),
  sendEmailVerification: vi.fn(),
}));

vi.mock("@/lib/useSEO", () => ({ useSEO: () => undefined }));
vi.mock("../../src/lib/firebase-client", () => ({
  createFirebaseAccount: mocks.createFirebaseAccount,
  getCurrentFirebaseUid: () => mocks.currentUid,
}));
vi.mock("../../src/lib/smart-health-api", () => ({
  smartHealthApi: {
    authenticateFirebase: mocks.authenticateFirebase,
    getTokenSnapshot: mocks.getTokenSnapshot,
    clearTokenIfMatches: mocks.clearTokenIfMatches,
    listPublicClinics: mocks.listPublicClinics,
    requestRole: mocks.requestRole,
    uploadRoleRequestDocument: mocks.uploadRoleRequestDocument,
    sendEmailVerification: mocks.sendEmailVerification,
  },
}));

function doctorReceipt({
  organizationId = "solo-a",
  accountType = "solo_doctor",
  workspaceType = "solo_practice",
}: {
  organizationId?: string;
  accountType?: "doctor" | "solo_doctor";
  workspaceType?: "clinic" | "solo_practice";
} = {}) {
  return {
    user: {
      id: "user-a",
      role: "patient",
      requestedRole: "doctor",
      roleRequestStatus: "pending",
      roleRequestedAt: "2026-08-01T12:00:00.000Z",
      accountStatus: "active",
      accountType,
      workspaceType,
      organizationId,
    },
    roleRequest: {
      requestedRole: "doctor",
      status: "pending",
      requestedAt: "2026-08-01T12:00:00.000Z",
    },
    operationId: "role-request-operation-a",
    replayed: false,
  };
}

function renderPage() {
  const router = createMemoryRouter([
    { path: "/", element: <RegisterDoctorPage /> },
    { path: "/xac-nhan-email", element: <h1>Xác minh email</h1> },
  ]);
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

function submitCurrentStep() {
  fireEvent.submit(
    screen.getByRole("button", { name: /Tiếp tục|Gửi hồ sơ/ }).closest("form")!,
  );
}

async function reachPrivateConfirmation(
  file = new File(["a"], "license-a.pdf", { type: "application/pdf" }),
) {
  fireEvent.change(screen.getByLabelText("Họ và tên"), {
    target: { value: "Bác sĩ An" },
  });
  fireEvent.change(screen.getByLabelText("Email đăng nhập"), {
    target: { value: "doctor@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Số điện thoại"), {
    target: { value: "0901234567" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "Password123!" },
  });
  fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), {
    target: { value: "Password123!" },
  });
  submitCurrentStep();

  fireEvent.click(
    screen.getByRole("radio", { name: /Bác sĩ hành nghề độc lập/ }),
  );
  submitCurrentStep();

  fireEvent.change(screen.getByLabelText("Chuyên khoa"), {
    target: { value: "Tim mạch" },
  });
  fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
    target: { value: "CCHN-001" },
  });
  submitCurrentStep();

  fireEvent.change(screen.getByLabelText("Tên phòng khám"), {
    target: { value: "Phòng khám An" },
  });
  fireEvent.change(screen.getByLabelText("Địa chỉ"), {
    target: { value: "1 Đường A" },
  });
  submitCurrentStep();

  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { files: [file] } });
  await screen.findByText("Nội dung tài liệu đã được kiểm tra.");
  submitCurrentStep();

  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Gửi hồ sơ" })).toBeVisible();
}

async function retryAfterEditingLicense(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
  fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
  fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
  fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
    target: { value },
  });
  submitCurrentStep();
  submitCurrentStep();
  submitCurrentStep();
  fireEvent.submit(
    screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
  );
}

describe("RegisterDoctorPage security checkpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUid = "firebase-a";
    mocks.tokenSnapshot = "";
    mocks.createFirebaseAccount.mockResolvedValue({
      user: { uid: "firebase-a" },
      idToken: "firebase-token-a",
    });
    mocks.authenticateFirebase.mockImplementation(async (idToken: string) => {
      mocks.tokenSnapshot = idToken;
      return { user: { id: "user-a", firebaseUid: "firebase-a" } };
    });
    mocks.getTokenSnapshot.mockImplementation(() => mocks.tokenSnapshot);
    mocks.clearTokenIfMatches.mockImplementation((expectedToken: string) => {
      if (mocks.tokenSnapshot !== expectedToken) return false;
      mocks.tokenSnapshot = "";
      return true;
    });
    mocks.listPublicClinics.mockResolvedValue({
      clinics: [
        {
          id: "workspace-a",
          name: "Bệnh viện A",
          type: "hospital",
          status: "active",
        },
      ],
    });
    mocks.requestRole.mockResolvedValue(doctorReceipt());
    mocks.uploadRoleRequestDocument.mockImplementation(async (file: File) => {
      const identity = await inspectRoleRequestDocument(file);
      return {
        document: {
          id: "document-a",
          userId: "user-a",
          organizationId: "solo-a",
          name: file.name,
          contentType: file.type,
          byteSize: file.size,
          sha256: identity.sha256,
          uploadedAt: "2026-08-01T12:00:00.000Z",
        },
        operationId: "document-operation-a",
        replayed: false,
      };
    });
    mocks.sendEmailVerification.mockResolvedValue({
      status: "sent",
      email: "doctor@example.test",
    });
  });

  it("retains one role key when the exact same intent is retried after an ambiguous failure", async () => {
    mocks.requestRole
      .mockRejectedValueOnce(new Error("network-request-failed"))
      .mockResolvedValueOnce(doctorReceipt());
    renderPage();
    await reachPrivateConfirmation();

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Gửi hồ sơ" })).toBeEnabled(),
    );

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(2));
    expect(mocks.requestRole.mock.calls[1][1]).toBe(
      mocks.requestRole.mock.calls[0][1],
    );
  });

  it("creates a new role key when a role-request field changes after an ambiguous failure", async () => {
    mocks.requestRole
      .mockRejectedValueOnce(new Error("network-request-failed"))
      .mockResolvedValueOnce(doctorReceipt());
    renderPage();
    await reachPrivateConfirmation();

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Gửi hồ sơ" })).toBeEnabled(),
    );

    await retryAfterEditingLicense("CCHN-002");

    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(2));
    expect(mocks.requestRole.mock.calls[1][1]).not.toBe(
      mocks.requestRole.mock.calls[0][1],
    );
    expect(mocks.requestRole.mock.calls[1][0]).toMatchObject({
      license: "CCHN-002",
    });
  });

  it("does not accept an upload result after Firebase switches to another owner", async () => {
    let resolveUpload!: (value: unknown) => void;
    mocks.uploadRoleRequestDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    renderPage();
    await reachPrivateConfirmation();

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.uploadRoleRequestDocument).toHaveBeenCalledTimes(1),
    );
    mocks.currentUid = "firebase-b";
    resolveUpload({ document: { id: "document-a", name: "license-a.pdf" } });

    expect(
      await screen.findByText(/Tài khoản xác thực đã thay đổi/),
    ).toBeVisible();
    expect(mocks.sendEmailVerification).not.toHaveBeenCalled();
    expect(mocks.clearTokenIfMatches).toHaveBeenCalledWith("firebase-token-a");
    expect(
      screen.queryByRole("heading", {
        name: "Hồ sơ bác sĩ đã được tiếp nhận",
      }),
    ).not.toBeInTheDocument();
  });

  it("does not mark registration complete when the owner changes during email delivery", async () => {
    let resolveDelivery!: (value: unknown) => void;
    mocks.sendEmailVerification.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelivery = resolve;
        }),
    );
    renderPage();
    await reachPrivateConfirmation();

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.sendEmailVerification).toHaveBeenCalledTimes(1),
    );
    mocks.currentUid = "firebase-b";
    resolveDelivery({ status: "sent", email: "doctor@example.test" });

    expect(
      await screen.findByText(/Tài khoản xác thực đã thay đổi/),
    ).toBeVisible();
    expect(mocks.clearTokenIfMatches).toHaveBeenCalledWith("firebase-token-a");
    expect(
      screen.queryByRole("heading", {
        name: "Hồ sơ bác sĩ đã được tiếp nhận",
      }),
    ).not.toBeInTheDocument();
  });

  it("binds a clinic doctor request to the selected canonical workspace ID", async () => {
    mocks.requestRole.mockResolvedValueOnce(
      doctorReceipt({
        organizationId: "workspace-a",
        accountType: "doctor",
        workspaceType: "clinic",
      }),
    );
    renderPage();

    fireEvent.change(screen.getByLabelText("Họ và tên"), {
      target: { value: "Bác sĩ An" },
    });
    fireEvent.change(screen.getByLabelText("Email đăng nhập"), {
      target: { value: "doctor@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Số điện thoại"), {
      target: { value: "0901234567" },
    });
    fireEvent.change(screen.getByLabelText("Mật khẩu"), {
      target: { value: "Password123!" },
    });
    fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), {
      target: { value: "Password123!" },
    });
    submitCurrentStep();
    fireEvent.click(
      screen.getByRole("radio", { name: /Bác sĩ thuộc cơ sở y tế/ }),
    );
    submitCurrentStep();
    fireEvent.change(screen.getByLabelText("Chuyên khoa"), {
      target: { value: "Tim mạch" },
    });
    fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
      target: { value: "CCHN-001" },
    });
    submitCurrentStep();

    await waitFor(() => expect(mocks.listPublicClinics).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Cơ sở y tế đang làm việc"), {
      target: { value: "workspace-a" },
    });
    submitCurrentStep();
    const file = new File(["a"], "license-a.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(
      document.querySelector<HTMLInputElement>('input[type="file"]')!,
      { target: { files: [file] } },
    );
    await screen.findByText("Nội dung tài liệu đã được kiểm tra.");
    submitCurrentStep();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );

    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(1));
    expect(mocks.requestRole.mock.calls[0][0]).toMatchObject({
      organizationId: "workspace-a",
      clinicName: "Bệnh viện A",
    });
  });

  it("uploads distinct same-metadata files by binding the checkpoint to content digest", async () => {
    const metadata = {
      type: "application/pdf",
      lastModified: 1_754_000_000_000,
    };
    const firstFile = new File(["A"], "license.pdf", metadata);
    const secondFile = new File(["B"], "license.pdf", metadata);
    let resolveDelivery!: (value: unknown) => void;
    mocks.sendEmailVerification.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelivery = resolve;
        }),
    );
    renderPage();
    await reachPrivateConfirmation(firstFile);

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.sendEmailVerification).toHaveBeenCalledTimes(1),
    );
    mocks.currentUid = "firebase-b";
    resolveDelivery({ status: "sent", email: "doctor@example.test" });
    await screen.findByText(/Tài khoản xác thực đã thay đổi/);

    mocks.currentUid = "firebase-a";
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [secondFile] } });
    await screen.findByText("Nội dung tài liệu đã được kiểm tra.");
    submitCurrentStep();
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );

    await waitFor(() =>
      expect(mocks.uploadRoleRequestDocument).toHaveBeenCalledTimes(2),
    );
    expect(mocks.uploadRoleRequestDocument.mock.calls[1][0]).toBe(secondFile);
  });

  it("reauthenticates account A before an A-to-B-to-A retry can use the backend bearer", async () => {
    let resolveDelivery!: (value: unknown) => void;
    mocks.sendEmailVerification.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelivery = resolve;
        }),
    );
    renderPage();
    await reachPrivateConfirmation();

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.sendEmailVerification).toHaveBeenCalledTimes(1),
    );

    mocks.currentUid = "firebase-b";
    mocks.tokenSnapshot = "firebase-token-b";
    resolveDelivery({ status: "sent", email: "doctor@example.test" });
    await screen.findByText(/Tài khoản xác thực đã thay đổi/);

    mocks.currentUid = "firebase-a";
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );

    await waitFor(() =>
      expect(mocks.authenticateFirebase).toHaveBeenCalledTimes(2),
    );
    expect(mocks.authenticateFirebase).toHaveBeenLastCalledWith(
      "firebase-token-a",
    );
    expect(mocks.tokenSnapshot).toBe("firebase-token-a");
    await waitFor(() =>
      expect(mocks.sendEmailVerification).toHaveBeenCalledTimes(2),
    );
  });

  it("locks Firebase identity fields after account creation instead of creating a second account", async () => {
    mocks.requestRole.mockRejectedValueOnce(
      new Error("network-request-failed"),
    );
    renderPage();
    await reachPrivateConfirmation();

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Gửi hồ sơ" })).toBeEnabled(),
    );

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    }

    expect(screen.getByLabelText("Email đăng nhập")).toBeDisabled();
    expect(screen.getByLabelText("Mật khẩu")).toBeDisabled();
    expect(screen.getByLabelText("Xác nhận mật khẩu")).toBeDisabled();
    expect(screen.getByText(/Tài khoản xác thực đã được tạo/)).toBeVisible();
    expect(mocks.createFirebaseAccount).toHaveBeenCalledTimes(1);
  });

  it("reuses one document upload idempotency key after an ambiguous upload failure", async () => {
    mocks.uploadRoleRequestDocument.mockRejectedValueOnce(
      new Error("network-request-failed"),
    );
    renderPage();
    await reachPrivateConfirmation();

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.uploadRoleRequestDocument).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Gửi hồ sơ" })).toBeEnabled(),
    );

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.uploadRoleRequestDocument).toHaveBeenCalledTimes(2),
    );
    expect(mocks.uploadRoleRequestDocument.mock.calls[0][1]).toBeTruthy();
    expect(mocks.uploadRoleRequestDocument.mock.calls[1][1]).toBe(
      mocks.uploadRoleRequestDocument.mock.calls[0][1],
    );
  });

  it("binds a solo-practice document receipt to the workspace returned by the role request", async () => {
    mocks.uploadRoleRequestDocument.mockImplementationOnce(
      async (file: File) => {
        const identity = await inspectRoleRequestDocument(file);
        return {
          document: {
            id: "document-other",
            userId: "user-a",
            organizationId: "solo-other",
            name: file.name,
            contentType: file.type,
            byteSize: file.size,
            sha256: identity.sha256,
            uploadedAt: "2026-08-01T12:00:00.000Z",
          },
          operationId: "document-operation-other",
          replayed: false,
        };
      },
    );
    renderPage();
    await reachPrivateConfirmation();
    submitCurrentStep();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /không khớp chủ sở hữu, workspace hoặc nội dung/,
    );
    expect(mocks.sendEmailVerification).not.toHaveBeenCalled();
  });

  it("allows identity correction after Firebase account creation definitively fails", async () => {
    mocks.createFirebaseAccount
      .mockRejectedValueOnce(new Error("auth/invalid-email"))
      .mockResolvedValueOnce({
        user: { uid: "firebase-a" },
        idToken: "firebase-token-a",
      });
    renderPage();
    await reachPrivateConfirmation();
    submitCurrentStep();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Gửi hồ sơ" })).toBeEnabled(),
    );

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    }
    expect(screen.getByLabelText("Email đăng nhập")).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Email đăng nhập"), {
      target: { value: "doctor.corrected@example.test" },
    });
    for (let index = 0; index < 5; index += 1) submitCurrentStep();
    submitCurrentStep();

    await waitFor(() =>
      expect(mocks.createFirebaseAccount).toHaveBeenCalledTimes(2),
    );
    expect(mocks.createFirebaseAccount).toHaveBeenLastCalledWith(
      "doctor.corrected@example.test",
      "Password123!",
    );
  });

  it("ignores an older file hash that completes after the newly selected file", async () => {
    const firstFile = new File(["A"], "first.pdf", {
      type: "application/pdf",
    });
    const secondFile = new File(["B"], "second.pdf", {
      type: "application/pdf",
    });
    let resolveFirst!: (value: ArrayBuffer) => void;
    let resolveSecond!: (value: ArrayBuffer) => void;
    const firstBytes = new Promise<ArrayBuffer>((resolve) => {
      resolveFirst = resolve;
    });
    const secondBytes = new Promise<ArrayBuffer>((resolve) => {
      resolveSecond = resolve;
    });
    Object.defineProperty(firstFile, "arrayBuffer", {
      configurable: true,
      value: () => firstBytes,
    });
    Object.defineProperty(secondFile, "arrayBuffer", {
      configurable: true,
      value: () => secondBytes,
    });

    renderPage();
    await reachPrivateConfirmation();
    fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [firstFile] } });
    fireEvent.change(input, { target: { files: [secondFile] } });

    await act(async () => {
      resolveSecond(new TextEncoder().encode("B").buffer as ArrayBuffer);
    });
    await screen.findByText("Nội dung tài liệu đã được kiểm tra.");
    await act(async () => {
      resolveFirst(new TextEncoder().encode("A").buffer as ArrayBuffer);
      await Promise.resolve();
    });

    submitCurrentStep();
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi hồ sơ" }).closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.uploadRoleRequestDocument).toHaveBeenCalledTimes(1),
    );
    expect(mocks.uploadRoleRequestDocument.mock.calls[0][0]).toBe(secondFile);
  });
});
