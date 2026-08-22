import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ApprovalPendingPage from "../../src/app/pages/auth/ApprovalPendingPage";
import { inspectRoleRequestDocument } from "../../src/lib/role-request-document-contract";

const mocks = vi.hoisted(() => ({
  tokenSnapshot: "backend-token-a",
  me: vi.fn(),
  refreshUser: vi.fn(),
  requestRole: vi.fn(),
  requestWorkspace: vi.fn(),
  uploadRoleRequestDocument: vi.fn(),
  useAuth: vi.fn(),
}));

function doctorRoleRequestReceipt(userId = "user-a") {
  return {
    user: {
      id: userId,
      role: "patient",
      requestedRole: "doctor",
      roleRequestStatus: "pending",
      roleRequestedAt: "2026-07-30T00:00:00.000Z",
      accountStatus: "active",
      accountType: "doctor",
      workspaceType: "clinic",
      organizationId: "workspace-a",
    },
    roleRequest: {
      requestedRole: "doctor",
      status: "pending",
      requestedAt: "2026-07-30T00:00:00.000Z",
    },
    operationId: "role-request-operation-a",
    replayed: false,
  };
}

function approvedAuthorityRaw(role: "doctor" | "workspace_owner" = "doctor") {
  const workspaceId = "workspace-a";
  return {
    id: role === "doctor" ? "doctor-a" : "owner-a",
    role,
    accountStatus: "active",
    requestedRole: role,
    roleRequestStatus: "approved",
    organizationId: workspaceId,
    currentWorkspaceId: workspaceId,
    currentMembership: {
      workspaceId,
      organizationId: workspaceId,
      role,
      operational: true,
      status: "active",
      workspaceStatus: "active",
    },
    currentWorkspace: {
      id: workspaceId,
      status: "active",
    },
    allowedSurfaces: ["portal", ...(role === "doctor" ? ["android"] : [])],
  };
}

vi.mock("@/lib/useSEO", () => ({ useSEO: () => undefined }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: mocks.useAuth,
}));
vi.mock("../../src/lib/smart-health-api", () => ({
  smartHealthApi: {
    getTokenSnapshot: () => mocks.tokenSnapshot,
    me: mocks.me,
    requestRole: mocks.requestRole,
    requestWorkspace: mocks.requestWorkspace,
    uploadRoleRequestDocument: mocks.uploadRoleRequestDocument,
  },
}));

let forceAuthRender = () => undefined;

function ApprovalHarness({
  state,
}: {
  state?: "info_requested" | "rejected" | "approved";
}) {
  const [, setRevision] = useState(0);
  forceAuthRender = () => setRevision((current) => current + 1);
  return <ApprovalPendingPage state={state} />;
}

function renderPage(state?: "info_requested" | "rejected" | "approved") {
  const router = createMemoryRouter([
    { path: "/", element: <ApprovalHarness state={state} /> },
    { path: "/cho-duyet", element: <ApprovalHarness state={state} /> },
  ]);
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

describe("ApprovalPendingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tokenSnapshot = "backend-token-a";
    mocks.me.mockResolvedValue({ user: { id: "user-a" } });
    mocks.useAuth.mockReturnValue({
      user: {
        raw: {
          id: "user-a",
          role: "patient",
          accountStatus: "active",
          roleRequestStatus: "needs_info",
          requestedRole: "doctor",
          workspaceType: "clinic",
          organizationId: "workspace-a",
          roleInfoRequiredFields: ["license"],
          name: "Bác sĩ Minh",
        },
      },
      isLoading: false,
      refreshUser: mocks.refreshUser,
    });
  });

  it("associates missing requested information with its field and blocks the mutation", async () => {
    renderPage();

    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi lại hồ sơ" }).closest("form")!,
    );

    expect(
      await screen.findByText("Vui lòng nhập mã chứng chỉ hành nghề."),
    ).toBeVisible();
    expect(screen.getByLabelText("Mã chứng chỉ hành nghề")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mocks.requestRole).not.toHaveBeenCalled();
  });

  it("does not expose a raw provider error when status refresh fails", async () => {
    mocks.useAuth.mockReturnValue({
      user: {
        raw: {
          id: "user-a",
          role: "patient",
          accountStatus: "active",
          roleRequestStatus: "pending",
          requestedRole: "doctor",
        },
      },
      isLoading: false,
      refreshUser: mocks.refreshUser,
    });
    mocks.refreshUser.mockRejectedValueOnce(
      new Error("FirebaseError: auth/internal-error stack trace"),
    );
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: "Cập nhật trạng thái" }),
    );

    expect(
      await screen.findByText(
        "Không thể cập nhật trạng thái. Vui lòng thử lại.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/FirebaseError/i)).not.toBeInTheDocument();
  });

  it("does not invent a pending approval state for an anonymous visitor", async () => {
    mocks.useAuth.mockReturnValue({
      user: null,
      isLoading: false,
      refreshUser: mocks.refreshUser,
    });
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Đăng nhập để xem trạng thái hồ sơ",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Trạng thái hiện tại")).not.toBeInTheDocument();
    expect(screen.queryByText("Chờ duyệt")).not.toBeInTheDocument();
  });

  it.each(["unknown", "", null])(
    "fails closed for a malformed lifecycle status: %s",
    async (roleRequestStatus) => {
      mocks.useAuth.mockReturnValue({
        user: {
          raw: {
            id: "user-a",
            role: "patient",
            accountStatus: "active",
            requestedRole: "doctor",
            roleRequestStatus,
          },
        },
        isLoading: false,
        refreshUser: mocks.refreshUser,
      });
      renderPage();

      expect(
        await screen.findByRole("heading", {
          name: "Không thể xác minh trạng thái hồ sơ",
        }),
      ).toBeVisible();
      expect(screen.queryByText("Chờ duyệt")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Mở portal" }),
      ).not.toBeInTheDocument();
    },
  );

  it("does not let an approved URL promote an ordinary patient", async () => {
    mocks.useAuth.mockReturnValue({
      user: {
        raw: {
          id: "patient-a",
          role: "patient",
          accountStatus: "active",
          requestedRole: "patient",
          roleRequestStatus: "approved",
          allowedSurfaces: ["android"],
        },
      },
      isLoading: false,
      refreshUser: mocks.refreshUser,
    });
    renderPage("approved");

    expect(
      await screen.findByRole("heading", {
        name: "Không thể xác minh trạng thái hồ sơ",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Mở portal" }),
    ).not.toBeInTheDocument();
  });

  it("opens the portal only for a backend-approved doctor with portal authority", async () => {
    mocks.useAuth.mockReturnValue({
      user: {
        raw: approvedAuthorityRaw(),
      },
      isLoading: false,
      refreshUser: mocks.refreshUser,
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Hồ sơ đã được duyệt" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Mở portal" })).toHaveAttribute(
      "href",
      "/portal",
    );
  });

  it("opens the portal for a backend-approved operational workspace owner", async () => {
    mocks.useAuth.mockReturnValue({
      user: {
        raw: approvedAuthorityRaw("workspace_owner"),
      },
      isLoading: false,
      refreshUser: mocks.refreshUser,
    });
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Workspace đã được duyệt",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Mở portal" })).toHaveAttribute(
      "href",
      "/portal",
    );
  });

  it.each([
    [
      "suspended membership",
      () => ({
        ...approvedAuthorityRaw(),
        currentMembership: {
          ...approvedAuthorityRaw().currentMembership,
          status: "suspended",
        },
      }),
    ],
    [
      "revoked membership",
      () => ({
        ...approvedAuthorityRaw(),
        currentMembership: {
          ...approvedAuthorityRaw().currentMembership,
          status: "revoked",
        },
      }),
    ],
    [
      "non-operational membership",
      () => ({
        ...approvedAuthorityRaw(),
        currentMembership: {
          ...approvedAuthorityRaw().currentMembership,
          operational: false,
        },
      }),
    ],
    [
      "suspended membership workspace lifecycle",
      () => ({
        ...approvedAuthorityRaw(),
        currentMembership: {
          ...approvedAuthorityRaw().currentMembership,
          workspaceStatus: "suspended",
        },
      }),
    ],
    [
      "suspended current workspace",
      () => ({
        ...approvedAuthorityRaw(),
        currentWorkspace: {
          ...approvedAuthorityRaw().currentWorkspace,
          status: "suspended",
        },
      }),
    ],
    [
      "contradictory workspace identity",
      () => ({
        ...approvedAuthorityRaw(),
        currentWorkspace: {
          ...approvedAuthorityRaw().currentWorkspace,
          id: "workspace-b",
        },
      }),
    ],
    [
      "contradictory effective role",
      () => ({
        ...approvedAuthorityRaw(),
        currentMembership: {
          ...approvedAuthorityRaw().currentMembership,
          role: "workspace_owner",
        },
      }),
    ],
  ])("fails closed for approved authority with %s", async (_label, raw) => {
    mocks.useAuth.mockReturnValue({
      user: { raw: raw() },
      isLoading: false,
      refreshUser: mocks.refreshUser,
    });
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Không thể xác minh trạng thái hồ sơ",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Mở portal" }),
    ).not.toBeInTheDocument();
  });

  it("retains one role-request key after edit and revert to the exact ambiguous intent", async () => {
    mocks.requestRole
      .mockRejectedValueOnce(new Error("network-request-failed"))
      .mockResolvedValueOnce(doctorRoleRequestReceipt());
    mocks.refreshUser.mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
      target: { value: "CCHN-001" },
    });
    const submit = screen.getByRole("button", {
      name: "Gửi lại hồ sơ",
    });
    fireEvent.submit(submit.closest("form")!);

    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
      target: { value: "CCHN-EDITED" },
    });
    fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
      target: { value: "CCHN-001" },
    });

    fireEvent.submit(submit.closest("form")!);

    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(2));
    const firstKey = mocks.requestRole.mock.calls[0][1];
    const retryKey = mocks.requestRole.mock.calls[1][1];
    expect(firstKey).toMatch(/^web-role-request-[A-Za-z0-9-]+$/);
    expect(retryKey).toBe(firstKey);
    await waitFor(() => expect(mocks.refreshUser).toHaveBeenCalledTimes(1));
  });

  it("keeps the account-bound ambiguous key across a same-account raw refresh", async () => {
    let currentUser = {
      raw: {
        id: "user-a",
        role: "patient",
        accountStatus: "active",
        roleRequestStatus: "needs_info",
        requestedRole: "doctor",
        workspaceType: "clinic",
        organizationId: "workspace-a",
        roleInfoRequiredFields: ["license"],
        name: "Bác sĩ Minh",
        license: "",
      },
    };
    mocks.requestRole
      .mockRejectedValueOnce(new Error("network-request-failed"))
      .mockResolvedValueOnce(doctorRoleRequestReceipt());
    mocks.refreshUser.mockResolvedValue(undefined);
    mocks.useAuth.mockImplementation(() => ({
      user: currentUser,
      isLoading: false,
      refreshUser: mocks.refreshUser,
    }));
    renderPage();

    fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
      target: { value: "CCHN-REFRESH" },
    });
    const submit = screen.getByRole("button", { name: "Gửi lại hồ sơ" });
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeEnabled());

    currentUser = {
      raw: {
        ...currentUser.raw,
        name: "Bác sĩ Minh cập nhật",
        license: "CCHN-REFRESH",
      },
    };
    await act(async () => {
      forceAuthRender();
    });
    fireEvent.submit(submit.closest("form")!);

    await waitFor(() => expect(mocks.requestRole).toHaveBeenCalledTimes(2));
    expect(mocks.requestRole.mock.calls[1][1]).toBe(
      mocks.requestRole.mock.calls[0][1],
    );
  });

  it("does not refresh or report success for a receipt owned by another account", async () => {
    mocks.requestRole.mockResolvedValueOnce(
      doctorRoleRequestReceipt("user-other"),
    );
    renderPage();

    fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
      target: { value: "CCHN-002" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi lại hồ sơ" }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(mocks.refreshUser).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Hệ thống đã tiếp nhận hồ sơ bổ sung."),
    ).not.toBeInTheDocument();
  });

  it("rejects a document receipt owned by another workspace", async () => {
    mocks.requestRole.mockResolvedValueOnce(doctorRoleRequestReceipt());
    const file = new File(["license"], "license.pdf", {
      type: "application/pdf",
    });
    const identity = await inspectRoleRequestDocument(file);
    mocks.uploadRoleRequestDocument.mockResolvedValueOnce({
      document: {
        id: "document-other",
        userId: "user-a",
        organizationId: "workspace-other",
        name: "license.pdf",
        contentType: "application/pdf",
        byteSize: 7,
        sha256: identity.sha256,
        uploadedAt: "2026-08-01T12:00:00.000Z",
      },
      operationId: "document-operation-other",
      replayed: false,
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
      target: { value: "CCHN-DOC" },
    });
    fireEvent.change(
      document.querySelector<HTMLInputElement>('input[type="file"]')!,
      { target: { files: [file] } },
    );
    await screen.findByText("Nội dung tài liệu đã được kiểm tra.");
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi lại hồ sơ" }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /không khớp chủ sở hữu, workspace hoặc nội dung/,
    );
    expect(mocks.refreshUser).not.toHaveBeenCalled();
  });

  it("rejects a late upload after the backend bearer changes", async () => {
    let resolveUpload!: (value: unknown) => void;
    mocks.requestRole.mockResolvedValueOnce(doctorRoleRequestReceipt());
    mocks.uploadRoleRequestDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    renderPage();
    fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
      target: { value: "CCHN-TOKEN" },
    });
    const file = new File(["license"], "license.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(
      document.querySelector<HTMLInputElement>('input[type="file"]')!,
      { target: { files: [file] } },
    );
    await screen.findByText("Nội dung tài liệu đã được kiểm tra.");
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi lại hồ sơ" }).closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.uploadRoleRequestDocument).toHaveBeenCalledOnce(),
    );

    mocks.tokenSnapshot = "backend-token-b";
    resolveUpload({
      document: {
        id: "document-a",
        userId: "user-a",
        organizationId: "workspace-a",
        name: "license.pdf",
        contentType: "application/pdf",
        byteSize: 7,
        sha256: "a".repeat(64),
        uploadedAt: "2026-08-01T12:00:00.000Z",
      },
      operationId: "document-operation-a",
      replayed: false,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /phiên xác thực|Tài khoản đã thay đổi/,
    );
    expect(mocks.refreshUser).not.toHaveBeenCalled();
  });

  it("does not mutate when the current bearer belongs to another displayed account", async () => {
    mocks.tokenSnapshot = "backend-token-b";
    mocks.me.mockResolvedValueOnce({ user: { id: "user-b" } });
    mocks.requestRole.mockResolvedValueOnce(doctorRoleRequestReceipt("user-b"));
    renderPage();
    fireEvent.change(screen.getByLabelText("Mã chứng chỉ hành nghề"), {
      target: { value: "CCHN-FOREIGN-BEARER" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Gửi lại hồ sơ" }).closest("form")!,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /không thuộc tài khoản|phiên xác thực/,
    );
    expect(mocks.me).toHaveBeenCalledOnce();
    expect(mocks.requestRole).not.toHaveBeenCalled();
    expect(mocks.requestWorkspace).not.toHaveBeenCalled();
    expect(mocks.uploadRoleRequestDocument).not.toHaveBeenCalled();
    expect(mocks.refreshUser).not.toHaveBeenCalled();
  });

  it("does not apply a refresh result after the active account changes", async () => {
    let currentUser = {
      raw: {
        id: "user-a",
        role: "patient",
        accountStatus: "active",
        requestedRole: "doctor",
        roleRequestStatus: "pending",
      },
    };
    let resolveRefresh!: () => void;
    mocks.refreshUser.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    mocks.useAuth.mockImplementation(() => ({
      user: currentUser,
      isLoading: false,
      refreshUser: mocks.refreshUser,
    }));
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: "Cập nhật trạng thái" }),
    );
    await waitFor(() => expect(mocks.refreshUser).toHaveBeenCalledTimes(1));

    currentUser = {
      raw: {
        id: "user-b",
        role: "patient",
        accountStatus: "active",
        requestedRole: "doctor",
        roleRequestStatus: "pending",
      },
    };
    await act(async () => {
      forceAuthRender();
    });
    await act(async () => {
      resolveRefresh();
    });

    expect(
      await screen.findByText(
        "Tài khoản đã thay đổi trong khi cập nhật trạng thái hồ sơ.",
      ),
    ).toBeVisible();
  });
});
