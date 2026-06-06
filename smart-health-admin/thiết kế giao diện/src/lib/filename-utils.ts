type FilenameKind = "report" | "data" | "scan-audio" | "storage" | "notification";

type FilenameInput = {
  kind: FilenameKind;
  ext: string;
  reportType?: string;
  clinic?: string;
  period?: string;
  table?: string;
  scope?: string;
  scanId?: string;
  patientName?: string;
  bodySite?: string;
  bucket?: string;
  originalName?: string;
  type?: string;
  id?: string;
  createdAt?: string;
};

function timestamp(value?: string) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${safeDate.getFullYear()}${pad(safeDate.getMonth() + 1)}${pad(safeDate.getDate())}-${pad(
    safeDate.getHours(),
  )}${pad(safeDate.getMinutes())}`;
}

export function filenameSlug(value?: string | null, fallback = "smart-health") {
  const text = (value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
}

function stripExtension(value?: string) {
  const name = value || "file";
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(0, index) : name;
}

export function buildSmartHealthFilename(input: FilenameInput) {
  const ext = input.ext.replace(/^\./, "").toLowerCase() || "bin";
  const stamp = timestamp(input.createdAt);

  if (input.kind === "report") {
    return `smart-health_bao-cao-${filenameSlug(input.reportType, "tong-hop")}_${filenameSlug(
      input.clinic,
      "tat-ca",
    )}_${filenameSlug(input.period, stamp)}_${stamp}.${ext}`;
  }

  if (input.kind === "data") {
    return `smart-health_du-lieu-${filenameSlug(input.table, "he-thong")}_${filenameSlug(
      input.scope,
      "toan-bo",
    )}_${stamp}.${ext}`;
  }

  if (input.kind === "scan-audio") {
    return `smart-health_scan-${filenameSlug(input.scanId, "scan")}_${filenameSlug(
      input.patientName,
      "benh-nhan",
    )}_${filenameSlug(input.bodySite, "luot-do")}_${stamp}.${ext}`;
  }

  if (input.kind === "notification") {
    return `smart-health_thong-bao-${filenameSlug(input.type, "chi-tiet")}_${stamp}.${ext}`;
  }

  return `smart-health_${filenameSlug(input.bucket, "storage")}_${filenameSlug(
    stripExtension(input.originalName),
    "file",
  )}_${stamp}_${filenameSlug(input.id, "id").slice(-10)}.${ext}`;
}
