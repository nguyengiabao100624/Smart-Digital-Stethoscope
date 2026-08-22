import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

import BillingSummaryPage from "../../src/app/pages/portal/BillingSummaryPage";

const api = vi.hoisted(() => ({
  portalBilling: vi.fn(),
}));

const authUser = {
  id: "user-billing",
  name: "Nhân sự tài chính",
  email: "billing@example.test",
  role: "billing",
  capabilities: ["billing.view"],
  allowedSurfaces: ["portal"],
  currentWorkspaceId: "workspace-1",
  currentWorkspace: {
    id: "workspace-1",
    name: "Phòng khám Shcare",
    type: "clinic",
    role: "billing",
    patientCount: 3,
    deviceOnline: 1,
    alertCount: 0,
  },
  workspaces: [],
  raw: {},
};

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
}));

function billingPayload() {
  return {
    generatedAt: "2026-07-29T02:00:00.000Z",
    workspace: {
      id: "workspace-1",
      name: "Phòng khám Shcare",
      type: "clinic",
      workspaceType: "clinic",
      packageId: "pkg-clinic",
      subscriptionStatus: "active",
      billingCycle: "monthly",
    },
    package: {
      id: "pkg-clinic",
      name: "Clinic",
      price: 1200000,
      currency: "VND",
      duration: "monthly",
      features: { cloudStorage: true, prioritySupport: true },
    },
    subscription: {
      organizationId: "workspace-1",
      packageId: "pkg-clinic",
      status: "active",
      billingCycle: "monthly",
      source: "workspace",
    },
    usage: { patients: 3 },
    quota: { maxPatients: 10 },
    usageRows: [
      {
        key: "patients",
        label: "Bệnh nhân",
        used: 3,
        limit: 10,
        unit: "hồ sơ",
        percent: 30,
        status: "ok",
      },
    ],
    currentCharge: {
      packageId: "pkg-clinic",
      amount: 1200000,
      currency: "VND",
      cycle: "monthly",
      source: "service_package",
    },
    billingContact: {
      name: "Phòng khám Shcare",
      email: "billing@example.test",
      phone: "0281234567",
      address: "Hồ Chí Minh",
    },
    invoicePolicy: {
      mode: "manual",
      providerConfigured: false,
      message: "Liên hệ Shcare để xác nhận thay đổi gói.",
    },
  };
}

function renderBilling() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <BillingSummaryPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("BillingSummaryPage", () => {
  beforeEach(() => {
    api.portalBilling.mockReset();
    api.portalBilling.mockResolvedValue(billingPayload());
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it("uses canonical theme-safe primitives and explains the manual billing boundary", async () => {
    const { container } = renderBilling();

    expect(
      await screen.findByRole("heading", { name: "Gói dịch vụ", level: 1 }),
    ).toBeVisible();
    expect(api.portalBilling).toHaveBeenCalledWith("workspace-1");
    expect(
      container.querySelector(
        ".glass-panel, .hero-gradient-text, .brand-gradient-text, .premium-button",
      ),
    ).toBeNull();
    expect(container.innerHTML).not.toContain("[#");
    expect(
      screen.getByRole("button", { name: /làm mới thông tin gói/i }),
    ).toHaveClass("h-11");
    expect(
      screen.getByText(/thanh toán trực tuyến chưa được tích hợp/i),
    ).toBeVisible();
    expect(screen.queryByText(/provider:/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: /bệnh nhân/i }),
    ).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByText("Trong hạn mức")).toBeVisible();
  });

  it("shows explicit empty states instead of blank plan and usage panels", async () => {
    const payload = billingPayload();
    payload.package = null;
    payload.currentCharge = null;
    payload.usageRows = [];
    api.portalBilling.mockResolvedValueOnce(payload);

    renderBilling();

    expect(await screen.findByText("Chưa có gói dịch vụ")).toBeVisible();
    expect(screen.getByText("Chưa có dữ liệu hạn mức")).toBeVisible();
    expect(
      screen.getAllByText(/liên hệ bộ phận hỗ trợ để xác nhận gói/i),
    ).toHaveLength(2);
  });

  it("keeps cached data visible but blocks refresh while offline", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderBilling();

    const refresh = await screen.findByRole("button", {
      name: /làm mới thông tin gói/i,
    });
    expect(refresh).toBeDisabled();
    expect(screen.getByText(/đang ngoại tuyến/i)).toBeVisible();
    expect(api.portalBilling).toHaveBeenCalledTimes(1);

    fireEvent.click(refresh);
    await waitFor(() => expect(api.portalBilling).toHaveBeenCalledTimes(1));
  });
});
