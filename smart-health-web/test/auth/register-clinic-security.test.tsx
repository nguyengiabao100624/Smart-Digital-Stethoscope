import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RegisterClinicPage from "../../src/app/pages/auth/RegisterClinicPage";
import { inspectRoleRequestDocument } from "../../src/lib/role-request-document-contract";

const mocks = vi.hoisted(() => ({
  currentUid: "firebase-a",
  tokenSnapshot: "",
  createFirebaseAccount: vi.fn(),
  authenticateFirebase: vi.fn(),
  getTokenSnapshot: vi.fn(),
  clearTokenIfMatches: vi.fn(),
  requestWorkspace: vi.fn(),
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
    requestWorkspace: mocks.requestWorkspace,
    uploadRoleRequestDocument: mocks.uploadRoleRequestDocument,
    sendEmailVerification: mocks.sendEmailVerification,
  },
}));

function workspaceReceipt(workspaceId = "workspace-a") {
  return {
    workspace: {
      id: workspaceId,
      name: "Phòng khám An",
      workspaceType: "clinic",
      status: "pending",
      version: 1,
    },
    user: {
      id: "user-a",
      role: "patient",
      requestedRole: "workspace_owner",
      roleRequestStatus: "pending",
      organizationId: workspaceId,
    },
    operationId: "workspace-operation-a",
    idempotent: false,
    notificationDelivery: "ready",
  };
}

function renderPage() {
  const router = createMemoryRouter([
    { path: "/", element: <RegisterClinicPage /> },
    { path: "/xac-nhan-email", element: <h1>Xác minh email</h1> },
  ]);
  return render(<RouterProvider router={router} />);
}

function submitCurrentStep() {
  fireEvent.submit(
    screen
      .getByRole("button", { name: /Tiếp tục|Gửi yêu cầu/ })
      .closest("form")!,
  );
}

async function reachConfirmation(
  file = new File(["license-a"], "clinic-license.pdf", {
    type: "application/pdf",
  }),
) {
  fireEvent.change(screen.getByLabelText("Người đại diện"), {
    target: { value: "Nguyễn An" },
  });
  fireEvent.change(screen.getByLabelText("Email đăng nhập"), {
    target: { value: "owner@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Số điện thoại"), {
    target: { value: "0901234567" },
  });
  fireEvent.change(screen.getByLabelText("Vai trò quản trị"), {
    target: { value: "owner" },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: "Password123!" },
  });
  fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu"), {
    target: { value: "Password123!" },
  });
  submitCurrentStep();

  fireEvent.change(screen.getByLabelText("Tên cơ sở"), {
    target: { value: "Phòng khám An" },
  });
  fireEvent.change(screen.getByLabelText("Loại hình cơ sở"), {
    target: { value: "private" },
  });
  fireEvent.change(screen.getByLabelText("Địa chỉ cơ sở"), {
    target: { value: "1 Đường A" },
  });
  fireEvent.change(screen.getByLabelText("Hotline cơ sở"), {
    target: { value: "0281234567" },
  });
  submitCurrentStep();
  submitCurrentStep();

  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { files: [file] } });
  await screen.findByText("Nội dung giấy phép đã được kiểm tra.");
  submitCurrentStep();
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("RegisterClinicPage security checkpoints", () => {
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
    mocks.clearTokenIfMatches.mockImplementation((expected: string) => {
      if (mocks.tokenSnapshot !== expected) return false;
      mocks.tokenSnapshot = "";
      return true;
    });
    mocks.requestWorkspace.mockResolvedValue(workspaceReceipt());
    mocks.uploadRoleRequestDocument.mockImplementation(async (file: File) => {
      const identity = await inspectRoleRequestDocument(file);
      return {
        document: {
          id: "document-a",
          userId: "user-a",
          organizationId: "workspace-a",
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
      email: "owner@example.test",
    });
  });

  it("locks Firebase identity after account creation and never creates a second account", async () => {
    mocks.requestWorkspace.mockRejectedValueOnce(
      new Error("network-request-failed"),
    );
    renderPage();
    await reachConfirmation();
    submitCurrentStep();
    await waitFor(() => expect(mocks.requestWorkspace).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Gửi yêu cầu" })).toBeEnabled(),
    );

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    }

    expect(screen.getByLabelText("Email đăng nhập")).toBeDisabled();
    expect(screen.getByLabelText("Mật khẩu")).toBeDisabled();
    expect(screen.getByLabelText("Xác nhận mật khẩu")).toBeDisabled();
    expect(mocks.createFirebaseAccount).toHaveBeenCalledOnce();
  });

  it("rotates the workspace key when the workspace intent changes after an ambiguous failure", async () => {
    mocks.requestWorkspace
      .mockRejectedValueOnce(new Error("network-request-failed"))
      .mockResolvedValueOnce({
        ...workspaceReceipt("workspace-b"),
        workspace: {
          ...workspaceReceipt("workspace-b").workspace,
          name: "Phòng khám Bình An",
        },
      });
    renderPage();
    await reachConfirmation();
    submitCurrentStep();
    await waitFor(() => expect(mocks.requestWorkspace).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Gửi yêu cầu" })).toBeEnabled(),
    );

    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Quay lại" }));
    }
    fireEvent.change(screen.getByLabelText("Tên cơ sở"), {
      target: { value: "Phòng khám Bình An" },
    });
    submitCurrentStep();
    submitCurrentStep();
    submitCurrentStep();
    submitCurrentStep();

    await waitFor(() =>
      expect(mocks.requestWorkspace).toHaveBeenCalledTimes(2),
    );
    expect(mocks.requestWorkspace.mock.calls[1][1]).not.toBe(
      mocks.requestWorkspace.mock.calls[0][1],
    );
    expect(mocks.requestWorkspace.mock.calls[1][0]).toMatchObject({
      name: "Phòng khám Bình An",
    });
  });

  it("reauthenticates account A before an A-to-B-to-A retry", async () => {
    let resolveDelivery!: (value: unknown) => void;
    mocks.sendEmailVerification.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelivery = resolve;
        }),
    );
    renderPage();
    await reachConfirmation();
    submitCurrentStep();
    await waitFor(() =>
      expect(mocks.sendEmailVerification).toHaveBeenCalledOnce(),
    );

    mocks.currentUid = "firebase-b";
    mocks.tokenSnapshot = "firebase-token-b";
    resolveDelivery({ status: "sent", email: "owner@example.test" });
    await screen.findByText(/Tài khoản xác thực đã thay đổi/);

    mocks.currentUid = "firebase-a";
    submitCurrentStep();
    await waitFor(() =>
      expect(mocks.authenticateFirebase).toHaveBeenCalledTimes(2),
    );
    expect(mocks.authenticateFirebase).toHaveBeenLastCalledWith(
      "firebase-token-a",
    );
  });

  it("rejects a document receipt for another workspace", async () => {
    mocks.uploadRoleRequestDocument.mockImplementationOnce(
      async (file: File) => {
        const identity = await inspectRoleRequestDocument(file);
        return {
          document: {
            id: "document-other",
            userId: "user-a",
            organizationId: "workspace-other",
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
    await reachConfirmation();
    submitCurrentStep();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /không khớp chủ sở hữu, workspace hoặc nội dung/,
    );
    expect(mocks.sendEmailVerification).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", {
        name: "Yêu cầu workspace đã được tiếp nhận",
      }),
    ).not.toBeInTheDocument();
  });
});
