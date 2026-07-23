import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ScanDetail from "../../src/app/pages/portal/ScanDetail";

const api = vi.hoisted(() => ({
  getScan: vi.fn(),
  updateScan: vi.fn(),
  downloadScanAudio: vi.fn(),
}));

vi.mock("../../src/lib/smart-health-api", () => ({ smartHealthApi: api }));
vi.mock("../../src/app/context/AuthContext", () => ({
  useAuth: () => ({
    user: { currentWorkspace: { id: "workspace-a" } },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/portal/records/scan-a"]}>
        <Routes>
          <Route path="/portal/records/:id" element={<ScanDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ScanDetail protected audio", () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.getScan.mockResolvedValue({
      scan: {
        id: "scan-a",
        patientId: "patient-a",
        deviceId: "device-a",
        audioUrl: "/api/scans/scan-a/audio",
      },
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn().mockReturnValue("blob:scan-audio"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders real progress, plays only the authenticated blob, and revokes its URL", async () => {
    const audio = deferred<Blob>();
    api.downloadScanAudio.mockImplementation(
      (_id: string, options: { onProgress: (value: unknown) => void }) => {
        options.onProgress({ loaded: 5, total: 10, percent: 50 });
        return audio.promise;
      },
    );
    const view = renderPage();

    expect(await screen.findByText("50%")).toBeVisible();
    await act(async () => {
      audio.resolve(new Blob(["audio"], { type: "audio/wav" }));
    });

    const player = await screen.findByLabelText("Âm thanh lượt đo scan-a");
    expect(player).toHaveAttribute("src", "blob:scan-audio");
    expect(player).not.toHaveAttribute("src", "/api/scans/scan-a/audio");
    expect(api.downloadScanAudio).toHaveBeenCalledWith(
      "scan-a",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:scan-audio");
  });

  it("shows an honest error and retries the authenticated request", async () => {
    api.downloadScanAudio
      .mockRejectedValueOnce(new Error("Permission denied"))
      .mockResolvedValueOnce(new Blob(["audio"], { type: "audio/wav" }));
    renderPage();

    expect(await screen.findByText("Permission denied")).toBeVisible();
    screen.getByRole("button", { name: /thử lại/i }).click();

    await waitFor(() => expect(api.downloadScanAudio).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("Âm thanh lượt đo scan-a")).toHaveAttribute(
      "src",
      "blob:scan-audio",
    );
  });
});
