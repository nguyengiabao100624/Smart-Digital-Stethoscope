import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

describe("smartHealthApi scan audio contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("smart_health_token", "primary-token");
    window.sessionStorage.setItem("shcare_two_factor_token", "two-factor-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams the tenant-protected audio blob with auth headers and real byte progress", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 2));
        controller.enqueue(bytes.slice(2));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: {
          "Content-Length": String(bytes.byteLength),
          "Content-Type": "audio/wav",
        },
      }),
    );
    const progress = vi.fn();

    const blob = await smartHealthApi.downloadScanAudio("Scan_Aa-01", {
      onProgress: progress,
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe("http://localhost:3000/api/scans/Scan_Aa-01/audio");
    expect(headers.get("Authorization")).toBe("Bearer primary-token");
    expect(headers.get("X-Shcare-2FA-Token")).toBe("two-factor-token");
    expect(headers.get("X-Smart-Health-Surface")).toBe("portal");
    expect(blob).toMatchObject({ size: 5, type: "audio/wav" });
    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { loaded: 0, total: 5, percent: 0 },
      { loaded: 2, total: 5, percent: 40 },
      { loaded: 5, total: 5, percent: 100 },
      { loaded: 5, total: 5, percent: 100 },
    ]);
  });

  it("preserves cancellation instead of reporting a false connectivity failure", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.mocked(fetch).mockRejectedValueOnce(
      new DOMException("Request aborted", "AbortError"),
    );

    await expect(
      smartHealthApi.downloadScanAudio("scan-1", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps progress indeterminate when the server omits Content-Length", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "audio/wav" } },
      ),
    );
    const progress = vi.fn();

    await smartHealthApi.downloadScanAudio("scan-no-length", {
      onProgress: progress,
    });

    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { loaded: 0, total: null, percent: 0 },
      { loaded: 3, total: null, percent: null },
      { loaded: 3, total: 3, percent: 100 },
    ]);
  });
});
