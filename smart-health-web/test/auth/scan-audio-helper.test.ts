import { describe, expect, it, vi } from "vitest";

import {
  buildScanAudioFilename,
  downloadScanAudio,
  shareScanAudio,
} from "../../src/lib/scan-audio";

describe("scan audio browser actions", () => {
  it("creates a filesystem-safe filename without changing the canonical scan id elsewhere", () => {
    expect(buildScanAudioFilename(" Scan / 01 ", "audio/mpeg")).toBe(
      "shcare-scan-Scan-01.mp3",
    );
  });

  it("uses native file sharing only when the browser confirms file support", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const navigatorApi = {
      canShare: vi.fn().mockReturnValue(true),
      share,
    } as unknown as Pick<Navigator, "canShare" | "share">;

    await expect(
      shareScanAudio(
        new Blob(["audio"], { type: "audio/wav" }),
        "scan.wav",
        "Scan audio",
        navigatorApi,
      ),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    expect(share.mock.calls[0][0].files[0]).toMatchObject({
      name: "scan.wav",
      type: "audio/wav",
    });
  });

  it("reports unsupported sharing so the caller can fall back to download", async () => {
    const navigatorApi = {
      canShare: vi.fn().mockReturnValue(false),
      share: vi.fn(),
    } as unknown as Pick<Navigator, "canShare" | "share">;

    await expect(
      shareScanAudio(new Blob(["audio"]), "scan.wav", "Scan", navigatorApi),
    ).resolves.toBe("unsupported");
    expect(navigatorApi.share).not.toHaveBeenCalled();
  });

  it("triggers a browser download without claiming that the file was saved", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const anchor = { href: "", download: "", hidden: false, click, remove };
    const documentApi = {
      createElement: vi.fn().mockReturnValue(anchor),
      body: { appendChild },
    } as unknown as Pick<Document, "createElement" | "body">;

    downloadScanAudio("blob:protected-audio", "scan.wav", documentApi);

    expect(anchor).toMatchObject({
      href: "blob:protected-audio",
      download: "scan.wav",
      hidden: true,
    });
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});
