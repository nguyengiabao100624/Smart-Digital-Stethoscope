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

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      currentWorkspace: { id: "workspace-a" },
      capabilities: ["workspace.review.manage", "workspace.alerts.manage"],
    },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const pendingReview = {
  id: "review-1",
  scanId: "scan-1",
  patientId: "patient-1",
  deviceId: "device-1",
  status: "pending" as const,
  version: 1,
};

const openAlert = {
  id: "alert-1",
  title: "Tín hiệu cần chú ý",
  message: "Chất lượng tín hiệu thấp",
  sourceType: "scan",
  sourceId: "scan-1",
  scanId: "scan-1",
  status: "open" as const,
  severity: "warning",
  version: 1,
};

function renderPage(page: "review" | "alert") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {page === "review" ? <ReviewQueuePage /> : <AlertCenterPage />}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("clinical workflow pages", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.listReviewQueue.mockResolvedValue({ reviews: [pendingReview] });
    api.listClinicalAlerts.mockResolvedValue({ alerts: [openAlert] });
  });

  it("retries one review submission with the same idempotency key", async () => {
    api.decideReview
      .mockRejectedValueOnce(new Error("Network offline"))
      .mockResolvedValueOnce({
        review: { ...pendingReview, status: "reviewed", decision: "accepted", version: 2 },
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
      .mockResolvedValueOnce({ reviews: [pendingReview] })
      .mockResolvedValue({ reviews: [{ ...pendingReview, version: 2 }] });
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
        alert: { ...openAlert, status: "acknowledged", version: 2 },
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
});
