import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "../../src/app/context/AuthContext";
import AlertCenterPage from "../../src/app/pages/portal/AlertCenterPage";
import ReviewQueuePage from "../../src/app/pages/portal/ReviewQueuePage";
import ScanDetail from "../../src/app/pages/portal/ScanDetail";

const api = vi.hoisted(() => ({
  hasToken: vi.fn(),
  me: vi.fn(),
  switchWorkspace: vi.fn(),
  updateMe: vi.fn(),
  clearToken: vi.fn(),
  authenticateFirebase: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  completeTwoFactorChallenge: vi.fn(),
  listScans: vi.fn(),
  monitoring: vi.fn(),
  listReviewQueue: vi.fn(),
  listClinicalAlerts: vi.fn(),
  getScan: vi.fn(),
  updateScan: vi.fn(),
}));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/lib/firebase-client", () => ({
  hasFirebaseWebConfig: () => false,
  isProductionAuthMode: () => false,
  onFirebaseAuthStateChange: vi.fn(),
  signInWithFirebaseEmail: vi.fn(),
  signOutFirebase: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function rawUser(workspaceId: "workspace-a" | "workspace-b") {
  return {
    id: "user-1",
    name: "Doctor Test",
    email: "doctor@example.test",
    role: "workspace_admin",
    capabilities: ["workspace.scans.view", "workspace.scans.manage"],
    allowedSurfaces: ["portal"],
    organizationId: workspaceId,
    currentWorkspaceId: workspaceId,
    currentWorkspace: {
      id: workspaceId,
      name: workspaceId === "workspace-a" ? "Clinic A" : "Clinic B",
      workspaceType: "clinic",
    },
    memberships: [
      {
        workspaceId: "workspace-a",
        role: "workspace_admin",
        workspaceName: "Clinic A",
        workspaceType: "clinic",
      },
      {
        workspaceId: "workspace-b",
        role: "workspace_admin",
        workspaceName: "Clinic B",
        workspaceType: "clinic",
      },
    ],
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

function canonicalReview(
  workspaceId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `review-${workspaceId}`,
    scanId: `scan-${workspaceId}`,
    organizationId: workspaceId,
    patientId: `patient-${workspaceId}`,
    deviceId: `device-${workspaceId}`,
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

function canonicalAlert(
  workspaceId: string,
  overrides: Record<string, unknown> = {},
) {
  const sourceId = `scan-${workspaceId}`;
  return {
    id: `alert-${workspaceId}`,
    organizationId: workspaceId,
    sourceType: "scan",
    sourceId,
    dedupeKey: `scan:${sourceId}`,
    occurrenceNumber: 1,
    previousAlertId: "",
    occurredAt: "2026-07-29T08:00:00.000Z",
    status: "open" as const,
    severity: "warning",
    title: `Alert ${workspaceId}`,
    message: "Tín hiệu cần được kiểm tra.",
    patientId: `patient-${workspaceId}`,
    deviceId: `device-${workspaceId}`,
    scanId: sourceId,
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

function WorkspaceSwitchProbe() {
  const { user, switchWorkspace } = useAuth();
  const [error, setError] = useState("");
  return (
    <div>
      <output aria-label="active workspace">
        {user?.currentWorkspace.id || "none"}
      </output>
      {error ? <div role="alert">{error}</div> : null}
      <button
        type="button"
        onClick={() =>
          void switchWorkspace("workspace-b").catch((reason: unknown) =>
            setError(reason instanceof Error ? reason.message : "unknown"),
          )
        }
      >
        Switch to workspace B
      </button>
    </div>
  );
}

function renderReviewQueue(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter>
          <WorkspaceSwitchProbe />
          <ReviewQueuePage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function renderAlertCenter(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter>
          <WorkspaceSwitchProbe />
          <AlertCenterPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function renderScanDetail(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={["/portal/records/scan-shared"]}>
          <WorkspaceSwitchProbe />
          <Routes>
            <Route path="/portal/records/:id" element={<ScanDetail />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("workspace PHI surfaces", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.hasToken.mockReturnValue(true);
    api.me.mockResolvedValue({ user: rawUser("workspace-a") });
    api.switchWorkspace.mockResolvedValue({ user: rawUser("workspace-b") });
  });

  it("never flashes workspace A review data while workspace B refetch is slow", async () => {
    const workspaceB = deferred<{
      workspaceId: string;
      reviews: Array<ReturnType<typeof canonicalReview>>;
    }>();
    api.listReviewQueue
      .mockResolvedValueOnce({
        workspaceId: "workspace-a",
        reviews: [
          canonicalReview("workspace-a", {
            id: "review-a",
            scanId: "scan-a",
            patientId: "Patient A",
          }),
        ],
      })
      .mockReturnValueOnce(workspaceB.promise);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderReviewQueue(client);

    expect(await screen.findByText("Patient A")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to workspace B" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("active workspace")).toHaveTextContent(
        "workspace-b",
      ),
    );
    expect(screen.queryByText("Patient A")).not.toBeInTheDocument();
    expect(screen.getByText(/Đang tải hàng đợi duyệt/i)).toBeVisible();

    await act(async () => {
      workspaceB.resolve({
        workspaceId: "workspace-b",
        reviews: [
          canonicalReview("workspace-b", {
            id: "review-b",
            scanId: "scan-b",
            patientId: "Patient B",
          }),
        ],
      });
    });
    expect(await screen.findByText("Patient B")).toBeVisible();
    expect(api.listReviewQueue).toHaveBeenCalledTimes(2);
    expect(
      client.getQueryData([
        "portal",
        "workspace",
        "workspace-b",
        "clinical-review-queue",
        "pending",
      ]),
    ).toMatchObject({
      workspaceId: "workspace-b",
      reviews: [
        {
          id: "review-b",
          scanId: "scan-b",
          patientId: "Patient B",
          organizationId: "workspace-b",
        },
      ],
    });
  });

  it("keeps workspace A alerts hidden when workspace B is offline and retries only workspace B", async () => {
    api.listClinicalAlerts
      .mockResolvedValueOnce({
        workspaceId: "workspace-a",
        alerts: [
          canonicalAlert("workspace-a", {
            id: "alert-a",
            title: "Alert A",
          }),
        ],
      })
      .mockRejectedValueOnce(new Error("Network offline"))
      .mockResolvedValueOnce({
        workspaceId: "workspace-b",
        alerts: [
          canonicalAlert("workspace-b", {
            id: "alert-b",
            title: "Alert B",
          }),
        ],
      });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderAlertCenter(client);

    expect(await screen.findByText("Alert A")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to workspace B" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("active workspace")).toHaveTextContent(
        "workspace-b",
      ),
    );
    expect(screen.queryByText("Alert A")).not.toBeInTheDocument();
    expect(await screen.findByText("Network offline")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /thử lại/i }));
    expect(await screen.findByText("Alert B")).toBeVisible();
    expect(api.listClinicalAlerts).toHaveBeenCalledTimes(3);
    expect(
      client.getQueryData([
        "portal",
        "workspace",
        "workspace-b",
        "clinical-alert-ledger",
        "open",
      ]),
    ).toMatchObject({ alerts: [{ id: "alert-b", title: "Alert B" }] });
  });

  it("keeps direct scan detail tenant-safe across a 403 and retries in the confirmed workspace", async () => {
    api.getScan
      .mockResolvedValueOnce({
        scan: {
          id: "scan-shared",
          patient: { name: "Patient A" },
          deviceId: "device-a",
        },
      })
      .mockRejectedValueOnce(
        Object.assign(new Error("Permission denied"), { status: 403 }),
      )
      .mockResolvedValueOnce({
        scan: {
          id: "scan-shared",
          patient: { name: "Patient B" },
          deviceId: "device-b",
        },
      });
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    renderScanDetail(client);

    expect(await screen.findByText("Patient A")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to workspace B" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("active workspace")).toHaveTextContent(
        "workspace-b",
      ),
    );
    expect(screen.queryByText("Patient A")).not.toBeInTheDocument();
    expect(await screen.findByText("Permission denied")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /thử lại/i }));
    expect(await screen.findByText("Patient B")).toBeVisible();
    expect(api.getScan).toHaveBeenCalledTimes(3);
    expect(
      client.getQueryData([
        "portal",
        "workspace",
        "workspace-b",
        "scan",
        "scan-shared",
      ]),
    ).toMatchObject({ scan: { patient: { name: "Patient B" } } });
  });
});
