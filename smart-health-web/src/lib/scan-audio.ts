export type ScanAudioShareResult = "shared" | "unsupported" | "cancelled";

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  return "wav";
}

export function buildScanAudioFilename(scanId: string, mimeType = "audio/wav") {
  const safeId = scanId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-") || "audio";
  return `shcare-scan-${safeId}.${extensionForMimeType(mimeType)}`;
}

export function canShareScanAudio(
  blob: Blob,
  filename: string,
  navigatorApi: Pick<Navigator, "canShare" | "share"> = navigator,
) {
  if (typeof File === "undefined" || typeof navigatorApi.share !== "function") {
    return false;
  }
  const file = new File([blob], filename, { type: blob.type || "audio/wav" });
  return typeof navigatorApi.canShare === "function" &&
    navigatorApi.canShare({ files: [file] });
}

export async function shareScanAudio(
  blob: Blob,
  filename: string,
  title: string,
  navigatorApi: Pick<Navigator, "canShare" | "share"> = navigator,
): Promise<ScanAudioShareResult> {
  if (!canShareScanAudio(blob, filename, navigatorApi)) return "unsupported";
  const file = new File([blob], filename, { type: blob.type || "audio/wav" });
  try {
    await navigatorApi.share({ files: [file], title });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return "cancelled";
    }
    throw error;
  }
}

export function downloadScanAudio(
  objectUrl: string,
  filename: string,
  documentApi: Pick<Document, "createElement" | "body"> = document,
) {
  const anchor = documentApi.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.hidden = true;
  documentApi.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
