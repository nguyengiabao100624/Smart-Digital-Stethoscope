import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PortalExportDialog } from "../../src/app/components/PortalExportDialog";
import { smartHealthApi } from "../../src/lib/smart-health-api";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("PortalExportDialog", () => {
  const artifactSha256 = "a".repeat(64);

  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:shcare-export"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("only reports success after the backend artifact Blob has arrived", async () => {
    const create =
      deferred<Awaited<ReturnType<typeof smartHealthApi.createExport>>>();
    const download =
      deferred<Awaited<ReturnType<typeof smartHealthApi.downloadExport>>>();
    vi.spyOn(smartHealthApi, "createExport").mockReturnValue(create.promise);
    vi.spyOn(smartHealthApi, "downloadExport").mockReturnValue(
      download.promise,
    );

    render(
      <PortalExportDialog
        open
        onOpenChange={vi.fn()}
        dataset="audit_logs"
        expectedWorkspaceId="workspace-1"
        title="Xuất nhật ký"
        description="Xuất đúng bộ lọc hiện tại"
        filters={{ q: "scan", resourceType: "scan" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tạo và tải tệp" }));
    expect(smartHealthApi.createExport).toHaveBeenCalledWith(
      {
        format: "csv",
        dataset: "audit_logs",
        filters: {
          q: "scan",
          resourceType: "scan",
          startDate: undefined,
          endDate: undefined,
        },
      },
      expect.stringMatching(/^portal-audit_logs-export-/),
    );
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      create.resolve({
        export: {
          id: "export-1",
          organizationId: "workspace-1",
          workspaceId: "workspace-1",
          createdByUserId: "user-1",
          format: "csv",
          dataset: "audit_logs",
          scopeKind: "workspace",
          rendererVersion: "shcare.export-artifact.v1",
          status: "ready",
          recordCount: 4,
          artifactSha256,
          downloadUrl: "/api/v1/exports/download/export-1",
          createdAt: "2026-07-23T10:00:00.000Z",
        },
        replayed: false,
      });
      await Promise.resolve();
    });
    expect(smartHealthApi.downloadExport).toHaveBeenCalledWith(
      "export-1",
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      download.resolve({
        blob: new Blob(["audit"], { type: "text/csv" }),
        fileName: "shcare-audit-export-1.csv",
        contentType: "text/csv",
        artifactSha256,
        rendererVersion: "shcare.export-artifact.v1",
      });
      await download.promise;
    });

    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith(
      "Đã tải shcare-audit-export-1.csv",
    );
    expect(screen.getByText("Tệp đã được tải xuống")).toBeInTheDocument();
  });

  it("keeps the same idempotency key while retrying a failed download", async () => {
    const createSpy = vi
      .spyOn(smartHealthApi, "createExport")
      .mockResolvedValue({
        export: {
          id: "export-retry",
          organizationId: "workspace-1",
          workspaceId: "workspace-1",
          createdByUserId: "user-1",
          format: "csv",
          dataset: "audit_logs",
          scopeKind: "workspace",
          rendererVersion: "shcare.export-artifact.v1",
          status: "ready",
          recordCount: 4,
          artifactSha256,
          downloadUrl: "/api/v1/exports/download/export-retry",
          createdAt: "2026-07-23T10:00:00.000Z",
        },
        replayed: false,
      });
    vi.spyOn(smartHealthApi, "downloadExport").mockRejectedValue(
      new Error("download interrupted"),
    );

    render(
      <PortalExportDialog
        open
        onOpenChange={vi.fn()}
        dataset="audit_logs"
        expectedWorkspaceId="workspace-1"
        title="Xuất nhật ký"
        description="Xuất đúng bộ lọc hiện tại"
        filters={{ q: "scan" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tạo và tải tệp" }));
    const retryButton = await screen.findByRole("button", { name: "Thử lại" });
    const firstKey = createSpy.mock.calls[0]?.[1];
    fireEvent.click(retryButton);
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));

    expect(firstKey).toMatch(/^portal-audit_logs-export-/);
    expect(createSpy.mock.calls[1]?.[1]).toBe(firstKey);
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("stops before download when the create receipt belongs to another workspace", async () => {
    vi.spyOn(smartHealthApi, "createExport").mockResolvedValue({
      export: {
        id: "export-wrong-workspace",
        organizationId: "workspace-2",
        workspaceId: "workspace-2",
        createdByUserId: "user-1",
        format: "csv",
        dataset: "audit_logs",
        scopeKind: "workspace",
        rendererVersion: "shcare.export-artifact.v1",
        status: "ready",
        recordCount: 4,
        artifactSha256,
        downloadUrl: "/api/v1/exports/download/export-wrong-workspace",
        createdAt: "2026-07-23T10:00:00.000Z",
      },
      replayed: false,
    });
    const downloadSpy = vi.spyOn(smartHealthApi, "downloadExport");

    render(
      <PortalExportDialog
        open
        onOpenChange={vi.fn()}
        dataset="audit_logs"
        expectedWorkspaceId="workspace-1"
        title="Xuất nhật ký"
        description="Xuất đúng bộ lọc hiện tại"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tạo và tải tệp" }));
    expect(
      await screen.findByText(/ngoài workspace đang hoạt động/i),
    ).toBeInTheDocument();
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
