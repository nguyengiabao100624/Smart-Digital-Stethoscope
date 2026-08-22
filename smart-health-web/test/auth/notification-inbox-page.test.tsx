import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NotificationsPage from "../../src/app/pages/portal/NotificationsPage";
import type {
  NotificationInboxItem,
  NotificationInboxMutationResponse,
  NotificationInboxResponse,
} from "../../src/lib/smart-health-api";

const api = vi.hoisted(() => ({
  getNotificationInbox: vi.fn(),
  markNotificationInboxRead: vi.fn(),
  markAllNotificationInboxRead: vi.fn(),
  deleteNotificationInboxItem: vi.fn(),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
let onlineSpy: ReturnType<typeof vi.spyOn>;

const authUser = {
  id: "user-1",
  name: "Bác sĩ Test",
  email: "doctor@example.test",
  role: "doctor",
  capabilities: ["notifications.view"],
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
vi.mock("sonner", () => ({ toast }));

function inboxItem(
  overrides: Partial<NotificationInboxItem> = {},
): NotificationInboxItem {
  return {
    id: "notification-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    organizationId: "workspace-1",
    type: "appointment_scheduled",
    title: "Lịch hẹn mới",
    message: "Lịch hẹn đã được máy chủ xác nhận.",
    campaignId: "",
    audienceType: "direct",
    audienceRole: "doctor",
    requestedChannels: ["in_app", "push"],
    inAppStatus: "ready",
    emailStatus: "skipped",
    pushStatus: "sent",
    read: false,
    readAt: null,
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    ...overrides,
  };
}

function inbox(
  notifications: NotificationInboxItem[] = [inboxItem()],
  overrides: Partial<NotificationInboxResponse> = {},
): NotificationInboxResponse {
  return {
    userId: "user-1",
    workspaceId: "workspace-1",
    notifications,
    updatedAt: "2026-07-29T08:00:01.000Z",
    ...overrides,
  };
}

function receipt(
  action: NotificationInboxMutationResponse["action"],
  notifications: NotificationInboxItem[],
  overrides: Partial<NotificationInboxMutationResponse> = {},
): NotificationInboxMutationResponse {
  const target = inboxItem({
    read: action === "read",
    readAt: action === "read" ? "2026-07-29T08:01:00.000Z" : null,
    updatedAt: "2026-07-29T08:01:00.000Z",
  });
  return {
    userId: "user-1",
    workspaceId: "workspace-1",
    action,
    notification: action === "read_all" ? null : target,
    notifications,
    affectedIds:
      action === "read_all"
        ? notifications.map((notification) => notification.id)
        : ["notification-1"],
    deletedId: action === "delete" ? "notification-1" : null,
    updatedAt: "2026-07-29T08:01:00.000Z",
    replayed: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const ui = () => (
    <QueryClientProvider client={client}>
      <NotificationsPage />
    </QueryClientProvider>
  );
  const view = render(ui());
  return {
    ...view,
    client,
    rerenderPage: () => view.rerender(ui()),
  };
}

describe("NotificationsPage personal inbox truth", () => {
  beforeEach(() => {
    authUser.currentWorkspace.id = "workspace-1";
    authUser.currentWorkspace.name = "Phòng khám Test";
    authUser.capabilities = ["notifications.view"];
    Object.values(api).forEach((mock) => mock.mockReset());
    Object.values(toast).forEach((mock) => mock.mockReset());
    onlineSpy = vi
      .spyOn(window.navigator, "onLine", "get")
      .mockReturnValue(true);
    onlineManager.setOnline(true);
    api.getNotificationInbox.mockResolvedValue(inbox());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders only the backend-confirmed current-workspace inbox with canonical UI primitives", async () => {
    const { container } = renderPage();

    expect(await screen.findByText("Lịch hẹn mới")).toBeVisible();
    expect(
      screen.getByRole("article", {
        name: "Lịch hẹn mới. Chưa đọc",
      }),
    ).toBeVisible();
    expect(api.getNotificationInbox).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("portal-notifications")).toHaveAttribute(
      "data-workspace-id",
      "workspace-1",
    );
    expect(
      container.querySelector(
        ".glass-panel, .premium-button, .brand-gradient-text, .clinical-page-header, .clinical-page-title",
      ),
    ).toBeNull();
  });

  it("fails closed when the server snapshot belongs to another workspace", async () => {
    api.getNotificationInbox.mockResolvedValue(
      inbox([], { workspaceId: "workspace-stale" }),
    );

    renderPage();

    expect(
      await screen.findByText(/đã chặn phản hồi.*workspace hiện tại/i),
    ).toBeVisible();
    expect(screen.queryByText("Lịch hẹn mới")).not.toBeInTheDocument();
  });

  it("keeps the unread state until the exact read receipt is confirmed", async () => {
    const pending = deferred<NotificationInboxMutationResponse>();
    api.markNotificationInboxRead.mockReturnValue(pending.promise);
    renderPage();

    await screen.findByText("Lịch hẹn mới");
    fireEvent.click(
      screen.getByRole("button", { name: "Đánh dấu đã đọc" }),
    );

    await waitFor(() =>
      expect(api.markNotificationInboxRead).toHaveBeenCalledWith(
        "notification-1",
        expect.any(String),
      ),
    );
    expect(
      screen.getByRole("article", {
        name: "Lịch hẹn mới. Chưa đọc",
      }),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();

    const confirmed = inboxItem({
      read: true,
      readAt: "2026-07-29T08:01:00.000Z",
      updatedAt: "2026-07-29T08:01:00.000Z",
    });
    await act(async () => {
      pending.resolve(receipt("read", [confirmed]));
      await pending.promise;
    });

    expect(
      await screen.findByRole("article", {
        name: "Lịch hẹn mới. Đã đọc",
      }),
    ).toBeVisible();
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it("requires destructive confirmation and removes the item only after backend acknowledgement", async () => {
    const pending = deferred<NotificationInboxMutationResponse>();
    api.deleteNotificationInboxItem.mockReturnValue(pending.promise);
    renderPage();

    await screen.findByText("Lịch hẹn mới");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Xóa thông báo Lịch hẹn mới",
      }),
    );
    expect(api.deleteNotificationInboxItem).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Xóa$/i }),
    );
    await waitFor(() =>
      expect(api.deleteNotificationInboxItem).toHaveBeenCalledWith(
        "notification-1",
        expect.any(String),
      ),
    );
    expect(screen.getByText("Lịch hẹn mới")).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(receipt("delete", []));
      await pending.promise;
    });

    await waitFor(() =>
      expect(screen.queryByText("Lịch hẹn mới")).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it("reuses one idempotency key after an ambiguous network failure", async () => {
    const confirmed = inboxItem({
      read: true,
      readAt: "2026-07-29T08:01:00.000Z",
      updatedAt: "2026-07-29T08:01:00.000Z",
    });
    api.markNotificationInboxRead
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce(receipt("read", [confirmed]));
    renderPage();

    await screen.findByText("Lịch hẹn mới");
    fireEvent.click(
      screen.getByRole("button", { name: "Đánh dấu đã đọc" }),
    );
    await waitFor(() =>
      expect(api.markNotificationInboxRead).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());

    fireEvent.click(
      screen.getByRole("button", { name: "Đánh dấu đã đọc" }),
    );
    await waitFor(() =>
      expect(api.markNotificationInboxRead).toHaveBeenCalledTimes(2),
    );

    expect(api.markNotificationInboxRead.mock.calls[0][1]).toBeTruthy();
    expect(api.markNotificationInboxRead.mock.calls[1][1]).toBe(
      api.markNotificationInboxRead.mock.calls[0][1],
    );
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it("keeps the confirmed snapshot visible and blocks mutations while offline", async () => {
    renderPage();
    await screen.findByText("Lịch hẹn mới");

    onlineSpy.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));

    expect(await screen.findByText(/đang ngoại tuyến/i)).toBeVisible();
    expect(screen.getByText("Lịch hẹn mới")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Đánh dấu đã đọc" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /tải lại/i }),
    ).toBeDisabled();
  });

  it("keeps cached data visible after a failed refresh", async () => {
    renderPage();
    await screen.findByText("Lịch hẹn mới");
    api.getNotificationInbox.mockRejectedValueOnce(
      new Error("refresh failed"),
    );

    fireEvent.click(screen.getByRole("button", { name: /tải lại/i }));

    expect(
      await screen.findByText(/đang giữ ảnh chụp hộp thư/i),
    ).toBeVisible();
    expect(screen.getByText("Lịch hẹn mới")).toBeVisible();
  });

  it("suppresses a late mutation receipt after the active workspace changes", async () => {
    const pending = deferred<NotificationInboxMutationResponse>();
    api.markNotificationInboxRead.mockReturnValue(pending.promise);
    const view = renderPage();
    await screen.findByText("Lịch hẹn mới");
    fireEvent.click(
      screen.getByRole("button", { name: "Đánh dấu đã đọc" }),
    );
    await waitFor(() =>
      expect(api.markNotificationInboxRead).toHaveBeenCalledOnce(),
    );

    authUser.currentWorkspace.id = "workspace-2";
    authUser.currentWorkspace.name = "Phòng khám B";
    api.getNotificationInbox.mockResolvedValue(
      inbox(
        [
          inboxItem({
            id: "notification-2",
            workspaceId: "workspace-2",
            organizationId: "workspace-2",
            title: "Thông báo workspace B",
          }),
        ],
        { workspaceId: "workspace-2" },
      ),
    );
    view.rerenderPage();
    expect(await screen.findByText("Thông báo workspace B")).toBeVisible();

    const confirmed = inboxItem({
      read: true,
      readAt: "2026-07-29T08:01:00.000Z",
    });
    await act(async () => {
      pending.resolve(receipt("read", [confirmed]));
      await pending.promise;
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText("Thông báo workspace B")).toBeVisible();
    expect(screen.getByTestId("portal-notifications")).toHaveAttribute(
      "data-workspace-id",
      "workspace-2",
    );
  });
});
