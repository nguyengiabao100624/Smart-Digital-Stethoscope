import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

import OnboardingChecklist from "../../src/app/pages/portal/OnboardingChecklist";

const api = vi.hoisted(() => ({
  listPatients: vi.fn(),
  listDevices: vi.fn(),
  portalBilling: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  user: {
    id: "user-onboarding",
    name: "Nguyễn An",
    email: "an@shcare.test",
    role: "workspace_admin",
    capabilities: [
      "account.manage",
      "workspace.patients.view",
      "workspace.devices.view",
      "workspace.scans.live",
      "billing.view",
    ],
    allowedSurfaces: ["portal"],
    currentWorkspace: {
      id: "workspace-1",
      name: "Phòng khám Shcare",
      type: "clinic",
      role: "workspace_admin",
      patientCount: 0,
      deviceOnline: 0,
      alertCount: 0,
    },
    workspaces: [],
    raw: {
      id: "user-onboarding",
      name: "Nguyễn An",
      email: "an@shcare.test",
      currentWorkspaceId: "workspace-1",
      currentWorkspace: {
        id: "workspace-1",
        name: "Phòng khám Shcare",
        status: "active",
      },
      currentMembership: {
        id: "membership-1",
        userId: "user-onboarding",
        workspaceId: "workspace-1",
        organizationId: "workspace-1",
        status: "active",
        role: "workspace_admin",
      },
    },
  },
}));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));

function billingPayload() {
  return {
    workspace: {
      id: "workspace-1",
      packageId: "package-1",
      subscriptionStatus: "active",
    },
    package: { id: "package-1", name: "Gói phòng khám" },
    subscription: {
      organizationId: "workspace-1",
      packageId: "package-1",
      status: "active",
    },
  };
}

function renderOnboarding() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <OnboardingChecklist />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("OnboardingChecklist", () => {
  beforeEach(() => {
    api.listPatients.mockReset();
    api.listDevices.mockReset();
    api.portalBilling.mockReset();
    api.listPatients.mockResolvedValue({
      patients: [
        {
          id: "patient-1",
          name: "Bệnh nhân Shcare",
          organizationId: "workspace-1",
        },
      ],
    });
    api.listDevices.mockResolvedValue({
      devices: [
        {
          id: "device-1",
          name: "Ống nghe Shcare",
          organizationId: "workspace-1",
          online: true,
        },
      ],
    });
    api.portalBilling.mockResolvedValue(billingPayload());
    auth.user.capabilities = [
      "account.manage",
      "workspace.patients.view",
      "workspace.devices.view",
      "workspace.scans.live",
      "billing.view",
    ];
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders a canonical, capability-aware checklist from exact workspace data", async () => {
    const { container } = renderOnboarding();

    expect(
      await screen.findByRole("heading", {
        name: "Bắt đầu với Shcare",
        level: 1,
      }),
    ).toBeVisible();
    expect(api.listPatients).toHaveBeenCalledTimes(1);
    expect(api.listDevices).toHaveBeenCalledTimes(1);
    expect(api.portalBilling).toHaveBeenCalledWith("workspace-1");
    expect(await screen.findByText("6/6 bước hoàn tất")).toBeVisible();
    expect(
      screen.getByRole("progressbar", { name: "Tiến độ bắt đầu nhanh" }),
    ).toHaveAttribute("aria-valuenow", "6");
    expect(
      within(screen.getByTestId("onboarding-step-devices-online")).getByText(
        "Hoàn tất",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /mở bước gói dịch vụ/i }),
    ).toHaveAttribute("href", "/portal/billing");
    expect(
      container.querySelector(
        ".glass-panel, .hero-gradient-text, .brand-gradient-text, .premium-button, .premium-card",
      ),
    ).toBeNull();
    expect(container.innerHTML).not.toContain("[#");
  });

  it("keeps failed supplemental checks unknown and retries only the failed dataset", async () => {
    api.listPatients
      .mockRejectedValueOnce(new Error("Không thể tải bệnh nhân"))
      .mockResolvedValueOnce({
        patients: [
          {
            id: "patient-1",
            organizationId: "workspace-1",
          },
        ],
      });

    renderOnboarding();

    expect(
      await screen.findByText("Một số bước chưa được xác minh"),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("onboarding-step-patients")).getByText(
        "Chưa xác minh",
      ),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Thử xác minh lại Bệnh nhân đầu tiên",
      }),
    );
    await waitFor(() => expect(api.listPatients).toHaveBeenCalledTimes(2));
    expect(api.listDevices).toHaveBeenCalledTimes(1);
    expect(api.portalBilling).toHaveBeenCalledTimes(1);
    expect(
      await within(
        screen.getByTestId("onboarding-step-patients"),
      ).findByText("Hoàn tất"),
    ).toBeVisible();
  });

  it("fails closed on cross-workspace rows instead of reporting an incomplete step", async () => {
    api.listDevices.mockResolvedValueOnce({
      devices: [
        {
          id: "device-other",
          organizationId: "workspace-2",
          online: true,
        },
      ],
    });

    renderOnboarding();

    expect(
      await screen.findByText("Một số bước chưa được xác minh"),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("onboarding-step-devices")).getByText(
        "Chưa xác minh",
      ),
    ).toBeVisible();
    expect(
      within(screen.getByTestId("onboarding-step-devices")).queryByText(
        "Chưa hoàn tất",
      ),
    ).toBeNull();
  });

  it("omits unauthorized datasets and exposes an honest offline state", async () => {
    auth.user.capabilities = [];
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);

    renderOnboarding();

    expect(await screen.findByText("Bạn đang ngoại tuyến")).toBeVisible();
    expect(api.listPatients).not.toHaveBeenCalled();
    expect(api.listDevices).not.toHaveBeenCalled();
    expect(api.portalBilling).not.toHaveBeenCalled();
    expect(screen.getByText("2/2 bước hoàn tất")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Làm mới tiến độ" }),
    ).toBeDisabled();
    expect(screen.queryByTestId("onboarding-step-patients")).toBeNull();
    expect(screen.queryByRole("link", { name: /gói dịch vụ/i })).toBeNull();
  });
});
