import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

import HelpPage from "../../src/app/pages/portal/HelpPage";

const api = vi.hoisted(() => ({
  createSupportTicket: vi.fn(),
}));

const authUser = {
  id: "user-support",
  name: "Nguyễn An",
  email: "an@shcare.test",
  role: "workspace_admin",
  capabilities: [],
  allowedSurfaces: ["portal"],
  currentWorkspace: {
    id: "workspace-support",
    name: "Phòng khám Shcare",
    type: "clinic",
    role: "workspace_admin",
    patientCount: 0,
    deviceOnline: 0,
    alertCount: 0,
  },
  workspaces: [],
  raw: {},
};

function supportReceipt(replayed = false) {
  return {
    ticket: {
      id: "support-ticket-1",
      workspaceId: "workspace-support",
      requesterUserId: "user-support",
      type: "device_connection",
      status: "open",
      createdAt: "2026-07-29T04:00:00.000Z",
    },
    replayed,
  };
}

vi.mock("../../src/lib/smart-health-api", () => ({
  smartHealthApi: api,
}));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
}));

function renderHelp() {
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  );
}

function chooseDeviceGuide() {
  fireEvent.click(
    screen.getByRole("button", { name: /thiết bị offline/i }),
  );
}

describe("HelpPage", () => {
  beforeEach(() => {
    api.createSupportTicket.mockReset();
    api.createSupportTicket.mockResolvedValue(supportReceipt());
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders a canonical, searchable and theme-safe help surface", () => {
    const { container } = renderHelp();

    expect(
      screen.getByRole("heading", { name: "Hỗ trợ Shcare", level: 1 }),
    ).toBeVisible();
    expect(container.querySelectorAll("main h1, h1")).toHaveLength(1);
    expect(
      container.querySelector(
        ".glass-panel, .hero-gradient-text, .brand-gradient-text, .premium-button, .premium-card",
      ),
    ).toBeNull();
    expect(container.innerHTML).not.toContain("[#");
    expect(
      screen.getByRole("searchbox", { name: "Tìm hướng dẫn" }),
    ).toHaveClass("h-11");
    expect(
      screen.getByRole("button", { name: /thiết bị offline/i }),
    ).toHaveClass("min-h-11");

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Tìm hướng dẫn" }),
      { target: { value: "không tồn tại" } },
    );
    expect(screen.getByText("Không tìm thấy hướng dẫn phù hợp")).toBeVisible();
  });

  it("shows success only after an exact backend receipt and removes invented contact promises", async () => {
    renderHelp();
    chooseDeviceGuide();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Mô tả vấn đề" }),
      {
        target: {
          value: "Thiết bị vẫn ngoại tuyến sau khi đã kiểm tra nguồn và Wi-Fi.",
        },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Gửi yêu cầu hỗ trợ" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Đã ghi nhận yêu cầu",
        level: 2,
      }),
    ).toBeVisible();
    expect(screen.getByText("support-ticket-1")).toBeVisible();
    expect(screen.getByText("Đang mở")).toBeVisible();
    expect(screen.queryByText(/1-4 giờ/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1800 1234/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/support@smarthealth/i)).not.toBeInTheDocument();
    expect(api.createSupportTicket).toHaveBeenCalledWith(
      {
        type: "device_connection",
        description:
          "Thiết bị vẫn ngoại tuyến sau khi đã kiểm tra nguồn và Wi-Fi.",
      },
      expect.stringMatching(/^portal-support-/),
      {
        workspaceId: "workspace-support",
        requesterUserId: "user-support",
      },
    );
  });

  it("keeps the same idempotency key across a safe retry", async () => {
    api.createSupportTicket
      .mockRejectedValueOnce(new Error("Backend tạm thời chưa phản hồi"))
      .mockResolvedValueOnce(supportReceipt(true));
    renderHelp();
    chooseDeviceGuide();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Mô tả vấn đề" }),
      {
        target: {
          value: "Thiết bị vẫn ngoại tuyến sau khi đã kiểm tra nguồn và Wi-Fi.",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Gửi yêu cầu hỗ trợ" }),
    );
    expect(
      await screen.findByText("Backend tạm thời chưa phản hồi"),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Thử gửi lại" }),
    );

    await waitFor(() =>
      expect(api.createSupportTicket).toHaveBeenCalledTimes(2),
    );
    expect(api.createSupportTicket.mock.calls[0][1]).toBe(
      api.createSupportTicket.mock.calls[1][1],
    );
    expect(await screen.findByText("Yêu cầu đã được ghi nhận trước đó")).toBeVisible();
  });

  it("blocks submission while offline without reporting success", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderHelp();
    chooseDeviceGuide();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Mô tả vấn đề" }),
      {
        target: {
          value: "Thiết bị vẫn ngoại tuyến sau khi đã kiểm tra nguồn và Wi-Fi.",
        },
      },
    );

    expect(screen.getByText("Bạn đang ngoại tuyến")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Gửi yêu cầu hỗ trợ" }),
    ).toBeDisabled();
    expect(api.createSupportTicket).not.toHaveBeenCalled();
  });
});
