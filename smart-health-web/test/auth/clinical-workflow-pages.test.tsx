import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AlertCenterPage from "../../src/app/pages/portal/AlertCenterPage";
import ReviewQueuePage from "../../src/app/pages/portal/ReviewQueuePage";

const api = vi.hoisted(() => ({
  listReviewQueue: vi.fn(),
  decideReview: vi.fn(),
  listClinicalAlerts: vi.fn(),
  acknowledgeClinicalAlert: vi.fn(),
  resolveClinicalAlert: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  user: {
    currentWorkspace: { id: "workspace-a" },
    capabilities: ["workspace.review.manage", "workspace.alerts.manage"],
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

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "review-1",
    scanId: "scan-1",
    organizationId: "workspace-a",
    patientId: "patient-1",
    deviceId: "device-1",
    status: "pending" as const,
    decision: "",
    note: "",
    reviewerUserId: "",
    reviewedAt: "",
    version: 1,
    scanStatus: "needs_review",
    scanCreatedAt: "2026-07-29T08:00:00.000Z",
    createdAt: "",
    updatedAt: "2026-07-29T08:00:00.000Z",
    ...overrides,
  };
}

function alert(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-1",
    organizationId: "workspace-a",
    title: "Tín hiệu cần chú ý",
    message: "Chất lượng tín hiệu thấp",
    sourceType: "scan",
    sourceId: "scan-1",
    dedupeKey: "scan:scan-1",
    occurrenceNumber: 1,
    previousAlertId: "",
    occurredAt: "2026-07-29T08:00:00.000Z",
    patientId: "patient-1",
    deviceId: "device-1",
    scanId: "scan-1",
    status: "open" as const,
    severity: "warning",
    acknowledgedByUserId: "",
    acknowledgedAt: "",
    acknowledgementNote: "",
    resolvedByUserId: "",
    resolvedAt: "",
    resolutionNote: "",
    version: 1,
    metadata: {},
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    ...overrides,
  };
}

function pageTree(page: "review" | "alert", client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {page === "review" ? <ReviewQueuePage /> : <AlertCenterPage />}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage(page: "review" | "alert") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return { ...render(pageTree(page, client)), client };
}

describe("clinical workflow pages", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    toast.success.mockReset();
    toast.error.mockReset();
    auth.user.currentWorkspace = { id: "workspace-a" };
    auth.user.capabilities = [
      "workspace.review.manage",
      "workspace.alerts.manage",
    ];
    api.listReviewQueue.mockResolvedValue({
      workspaceId: "workspace-a",
      reviews: [review()],
    });
    api.listClinicalAlerts.mockResolvedValue({
      workspaceId: "workspace-a",
      alerts: [alert()],
    });
  });

  it("retries one review submission with the same idempotency key", async () => {
    api.decideReview
      .mockRejectedValueOnce(new Error("Network offline"))
      .mockResolvedValueOnce({
        workspaceId: "workspace-a",
        review: review({
          status: "reviewed",
          decision: "accepted",
          reviewerUserId: "doctor-1",
          reviewedAt: "2026-07-29T08:10:00.000Z",
          version: 2,
        }),
      });
    renderPage("review");

    fireEvent.click(
      await screen.findByRole("button", { name: "Ghi nhận quyết định" }),
    );
    expect(await screen.findByText("Network offline")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Thử gửi lại" }));

    await waitFor(() => expect(api.decideReview).toHaveBeenCalledTimes(2));
    const first = api.decideReview.mock.calls[0][1];
    const replay = api.decideReview.mock.calls[1][1];
    expect(replay.idempotencyKey).toBe(first.idempotencyKey);
    expect(first).toMatchObject({
      decision: "accepted",
      note: "",
      expectedVersion: 1,
    });
  });

  it("resets the review intent key when its note changes", async () => {
    api.decideReview.mockRejectedValue(new Error("Try again"));
    renderPage("review");

    fireEvent.click(
      await screen.findByRole("button", { name: "Ghi nhận quyết định" }),
    );
    expect(await screen.findByText("Try again")).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Ghi chú/i), {
      target: { value: "Ghi chú mới" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ghi nhận quyết định" }));

    await waitFor(() => expect(api.decideReview).toHaveBeenCalledTimes(2));
    expect(api.decideReview.mock.calls[1][1].idempotencyKey).not.toBe(
      api.decideReview.mock.calls[0][1].idempotencyKey,
    );
  });

  it("refreshes a review after a 409 instead of showing success", async () => {
    const conflict = Object.assign(new Error("Review changed"), {
      status: 409,
      code: "REVIEW_VERSION_CONFLICT",
    });
    api.listReviewQueue
      .mockResolvedValueOnce({
        workspaceId: "workspace-a",
        reviews: [review()],
      })
      .mockResolvedValue({
        workspaceId: "workspace-a",
        reviews: [review({ version: 2 })],
      });
    api.decideReview.mockRejectedValueOnce(conflict);
    renderPage("review");

    fireEvent.click(
      await screen.findByRole("button", { name: "Ghi nhận quyết định" }),
    );

    await waitFor(() => expect(api.listReviewQueue).toHaveBeenCalledTimes(2));
    expect(api.decideReview).toHaveBeenCalledWith(
      "scan-1",
      expect.objectContaining({ expectedVersion: 1 }),
    );
  });

  it("requires a resolution note before calling the alert API", async () => {
    renderPage("alert");

    fireEvent.click(
      await screen.findByRole("button", { name: "Xác nhận đã xử lý" }),
    );

    expect(
      screen.getByText("Cần ghi nội dung xử lý trước khi đóng cảnh báo."),
    ).toBeVisible();
    expect(api.resolveClinicalAlert).not.toHaveBeenCalled();
  });

  it("retries one acknowledgement with the same idempotency key", async () => {
    api.acknowledgeClinicalAlert
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce({
        workspaceId: "workspace-a",
        alert: alert({
          status: "acknowledged",
          acknowledgedByUserId: "doctor-1",
          acknowledgedAt: "2026-07-29T08:10:00.000Z",
          version: 2,
        }),
      });
    renderPage("alert");

    fireEvent.click(await screen.findByRole("button", { name: "Tiếp nhận" }));
    expect(await screen.findByText("Connection lost")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp nhận" }));

    await waitFor(() =>
      expect(api.acknowledgeClinicalAlert).toHaveBeenCalledTimes(2),
    );
    expect(api.acknowledgeClinicalAlert.mock.calls[1][1].idempotencyKey).toBe(
      api.acknowledgeClinicalAlert.mock.calls[0][1].idempotencyKey,
    );
  });

  it("fails closed instead of rendering a foreign-workspace review row", async () => {
    api.listReviewQueue.mockResolvedValue({
      workspaceId: "workspace-a",
      reviews: [
        review({
          organizationId: "workspace-b",
          patientId: "PHI workspace B",
        }),
      ],
    });

    renderPage("review");

    expect(
      await screen.findByText(/không thuộc workspace hiện tại/i),
    ).toBeVisible();
    expect(screen.queryByText("PHI workspace B")).not.toBeInTheDocument();
  });

  it("does not publish review success for a foreign mutation receipt", async () => {
    api.decideReview.mockResolvedValue({
      workspaceId: "workspace-b",
      review: review({
        organizationId: "workspace-b",
        status: "reviewed",
        decision: "accepted",
        reviewerUserId: "doctor-b",
        reviewedAt: "2026-07-29T08:10:00.000Z",
        version: 2,
      }),
    });

    renderPage("review");
    fireEvent.click(
      await screen.findByRole("button", { name: "Ghi nhận quyết định" }),
    );

    expect(
      await screen.findByText(/không thuộc workspace hiện tại/i),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("suppresses a late review outcome after the workspace changes", async () => {
    let resolveDecision:
      | ((value: {
          workspaceId: string;
          review: ReturnType<typeof review>;
        }) => void)
      | undefined;
    api.decideReview.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDecision = resolve;
        }),
    );

    const { rerender, client } = renderPage("review");
    fireEvent.click(
      await screen.findByRole("button", { name: "Ghi nhận quyết định" }),
    );
    await waitFor(() => expect(api.decideReview).toHaveBeenCalledTimes(1));

    auth.user.currentWorkspace = { id: "workspace-b" };
    api.listReviewQueue.mockResolvedValue({
      workspaceId: "workspace-b",
      reviews: [
        review({
          id: "review-b",
          scanId: "scan-b",
          organizationId: "workspace-b",
          patientId: "Bệnh nhân B",
          deviceId: "device-b",
        }),
      ],
    });
    rerender(pageTree("review", client));

    resolveDecision?.({
      workspaceId: "workspace-a",
      review: review({
        status: "reviewed",
        decision: "accepted",
        reviewerUserId: "doctor-a",
        reviewedAt: "2026-07-29T08:10:00.000Z",
        version: 2,
      }),
    });

    expect(await screen.findByText("Bệnh nhân B")).toBeVisible();
    await waitFor(() => expect(toast.success).not.toHaveBeenCalled());
  });

  it("does not publish alert success for a mismatched receipt", async () => {
    api.acknowledgeClinicalAlert.mockResolvedValue({
      workspaceId: "workspace-a",
      alert: alert({
        id: "alert-other",
        status: "acknowledged",
        acknowledgedByUserId: "doctor-1",
        acknowledgedAt: "2026-07-29T08:10:00.000Z",
        version: 2,
      }),
    });

    renderPage("alert");
    fireEvent.click(await screen.findByRole("button", { name: "Tiếp nhận" }));

    expect(
      await screen.findByText(/không trả về đúng cảnh báo/i),
    ).toBeVisible();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
