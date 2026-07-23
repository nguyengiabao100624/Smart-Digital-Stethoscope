import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RecordsPage from "../../src/app/pages/portal/RecordsPage";

const api = vi.hoisted(() => ({ listScans: vi.fn() }));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: { currentWorkspace: { id: "workspace-a" } } }),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RecordsPage server-driven list", () => {
  beforeEach(() => {
    api.listScans.mockReset();
  });

  it("submits search to the backend instead of filtering a 200-row client cache", async () => {
    api.listScans
      .mockResolvedValueOnce({
        scans: [{ id: "scan-a", patient: { name: "Patient A" } }],
        pagination: { page: 1, limit: 25, total: null, hasNextPage: false },
      })
      .mockResolvedValueOnce({
        scans: [{ id: "scan-b", patient: { name: "Server B" } }],
        pagination: { page: 1, limit: 25, total: null, hasNextPage: false },
      });
    renderPage();

    expect((await screen.findAllByText("Patient A")).length).toBeGreaterThan(0);
    expect(api.listScans).toHaveBeenLastCalledWith({
      q: "",
      status: "",
      page: 1,
      limit: 25,
      sort: "createdAt:desc",
    });

    fireEvent.change(screen.getByLabelText("Từ khóa"), {
      target: { value: "Server B" },
    });
    expect(api.listScans).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Tìm kiếm" }));

    await waitFor(() =>
      expect(api.listScans).toHaveBeenLastCalledWith({
        q: "Server B",
        status: "",
        page: 1,
        limit: 25,
        sort: "createdAt:desc",
      }),
    );
    expect((await screen.findAllByText("Server B")).length).toBeGreaterThan(0);
  });

  it("navigates pages without displaying a fabricated total", async () => {
    api.listScans
      .mockResolvedValueOnce({
        scans: [{ id: "scan-a", patient: { name: "Page One" } }],
        pagination: { page: 1, limit: 25, total: null, hasNextPage: true },
      })
      .mockResolvedValueOnce({
        scans: [{ id: "scan-b", patient: { name: "Page Two" } }],
        pagination: { page: 2, limit: 25, total: null, hasNextPage: false },
      });
    renderPage();

    expect(await screen.findByText("Trang 1 · 1 mục trên trang")).toBeVisible();
    expect(screen.queryByText(/tổng/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Trang tiếp theo" }));

    await waitFor(() =>
      expect(api.listScans).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, limit: 25 }),
      ),
    );
    expect(await screen.findByText("Trang 2 · 1 mục trên trang")).toBeVisible();
  });
});
