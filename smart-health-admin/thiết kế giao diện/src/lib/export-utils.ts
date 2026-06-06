import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import XLSX from "xlsx-js-style";
import { RobotoRegularBase64 } from "./fonts/roboto-regular";
import { RobotoBoldBase64 } from "./fonts/roboto-bold";
import { buildSmartHealthFilename } from "./filename-utils";

// ─── Brand ──────────────────────────────────────────────────────────────────
const BRAND = {
  name: "Smart Health",
  tagline: "Nền tảng quản lý y tế thông minh",
  primary: [37, 99, 235] as [number, number, number], // #2563EB
  primaryDark: [30, 64, 175] as [number, number, number],
  accent: [16, 185, 129] as [number, number, number],
  danger: [239, 68, 68] as [number, number, number],
  warning: [245, 158, 11] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  zebra: [248, 250, 252] as [number, number, number],
  primaryHex: "2563EB",
  primaryDarkHex: "1E40AF",
  zebraHex: "F8FAFC",
  borderHex: "E2E8F0",
  mutedHex: "64748B",
  textHex: "0F172A",
  successHex: "10B981",
  dangerHex: "EF4444",
  warningHex: "F59E0B",
};

// ─── Types ──────────────────────────────────────────────────────────────────
export interface ExportSheet {
  name: string;
  headers: readonly string[];
  rows: readonly (readonly (string | number)[])[];
  /** Optional per-column alignment hints (l/c/r) */
  align?: readonly ("left" | "center" | "right")[];
}

export interface ExportContext {
  /** Report title, e.g. "Báo cáo lượt đo AI" */
  title: string;
  /** Reporting period, e.g. "Tháng 04/2026" */
  period?: string;
  /** Filters / extra metadata key→value */
  meta?: Record<string, string>;
  /** KPIs displayed on cover page */
  kpis?: { label: string; value: string; hint?: string }[];
  /** Author / exporter name */
  author?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function nowVN() {
  return new Date().toLocaleString("vi-VN", { hour12: false });
}

export function buildFilename(kind: string, period?: string, ext = "pdf") {
  const normalizedKind = kind.toLowerCase();
  const isData = normalizedKind.includes("du-lieu") || normalizedKind.includes("data");
  const isNotification = normalizedKind.includes("thong-bao") || normalizedKind.includes("notification");
  return buildSmartHealthFilename({
    kind: isNotification ? "notification" : isData ? "data" : "report",
    ext,
    reportType: kind,
    table: kind,
    type: kind,
    period,
    scope: "he-thong",
  });
}

// ─── jsPDF font registration (Vietnamese support) ──────────────────────────
let pdfFontReady = false;

function getFontSignature(base64: string) {
  try {
    const prefix = base64.trim().slice(0, 16);
    const binary =
      typeof globalThis.atob === "function"
        ? globalThis.atob(prefix)
        : Buffer.from(prefix, "base64").toString("binary");
    return binary.slice(0, 4);
  } catch {
    return "";
  }
}

function assertValidPdfFont(fontName: string, base64: string) {
  const signature = getFontSignature(base64);
  const isTtf = signature === String.fromCharCode(0, 1, 0, 0) || signature === "true";
  const isOtf = signature === "OTTO";

  if (!isTtf && !isOtf) {
    const message = `Font PDF "${fontName}" không hợp lệ. File base64 phải là TTF/OTF thật, không phải HTML hoặc dữ liệu tải lỗi.`;
    console.error(message);
    throw new Error(message);
  }
}

function ensurePdfFonts(doc: jsPDF) {
  if (pdfFontReady) {
    // jsPDF instances are independent — must re-register on every doc.
  }

  assertValidPdfFont("Roboto-Regular.ttf", RobotoRegularBase64);
  assertValidPdfFont("Roboto-Bold.ttf", RobotoBoldBase64);

  try {
    doc.addFileToVFS("Roboto-Regular.ttf", RobotoRegularBase64);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.addFileToVFS("Roboto-Bold.ttf", RobotoBoldBase64);
    doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
    doc.setFont("Roboto", "normal");
    pdfFontReady = true;
  } catch (error) {
    console.error("Không thể đăng ký font PDF tiếng Việt cho jsPDF.", error);
    throw error;
  }
}

// ─── PDF: header / footer / cover ──────────────────────────────────────────
function drawLogo(doc: jsPDF, x: number, y: number, size = 22) {
  // Rounded square with stylized stethoscope-ish glyph
  doc.setFillColor(...BRAND.primary);
  doc.roundedRect(x, y, size, size, 5, 5, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1.6);
  // simple "heartbeat" line
  const cx = x + size / 2;
  const cy = y + size / 2;
  doc.line(x + 4, cy, cx - 4, cy);
  doc.line(cx - 4, cy, cx - 2, cy - 4);
  doc.line(cx - 2, cy - 4, cx + 1, cy + 5);
  doc.line(cx + 1, cy + 5, cx + 4, cy);
  doc.line(cx + 4, cy, x + size - 4, cy);
}

function drawHeader(doc: jsPDF, ctx: ExportContext) {
  const w = doc.internal.pageSize.getWidth();
  // top band
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, w, 32, "F");
  drawLogo(doc, 20, 5, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(13);
  doc.text(BRAND.name, 50, 16);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.text(ctx.title + (ctx.period ? ` · ${ctx.period}` : ""), 50, 26);
  // right side: date
  doc.setFontSize(8);
  doc.text(`Xuất: ${nowVN()}`, w - 20, 26, { align: "right" });
  doc.setTextColor(15, 23, 42);
}

function drawFooter(doc: jsPDF) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...BRAND.border);
  doc.setLineWidth(0.5);
  doc.line(20, h - 24, w - 20, h - 24);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  doc.text("Smart Health · Confidential — Internal use only", 20, h - 12);
  const page = doc.getCurrentPageInfo().pageNumber;
  const total = doc.getNumberOfPages();
  doc.text(`Trang ${page}/${total}`, w - 20, h - 12, { align: "right" });
  doc.setTextColor(15, 23, 42);
}

function drawCover(doc: jsPDF, ctx: ExportContext) {
  const w = doc.internal.pageSize.getWidth();
  let y = 90;

  doc.setFont("Roboto", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.primary);
  doc.text("BÁO CÁO HỆ THỐNG", 40, y);
  y += 24;

  doc.setFontSize(26);
  doc.setTextColor(15, 23, 42);
  // wrap title
  const titleLines = doc.splitTextToSize(ctx.title, w - 80);
  doc.text(titleLines, 40, y);
  y += titleLines.length * 30;

  if (ctx.period) {
    doc.setFont("Roboto", "normal");
    doc.setFontSize(13);
    doc.setTextColor(...BRAND.muted);
    doc.text(`Kỳ báo cáo: ${ctx.period}`, 40, y);
    y += 20;
  }

  // Meta block (author, exported at)
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.muted);
  doc.text(`Người xuất: ${ctx.author ?? "Quản trị viên hệ thống"}`, 40, y);
  y += 14;
  doc.text(`Thời điểm xuất: ${nowVN()}`, 40, y);
  y += 30;

  // Divider
  doc.setDrawColor(...BRAND.primary);
  doc.setLineWidth(2);
  doc.line(40, y, 90, y);
  y += 30;

  // KPI cards
  if (ctx.kpis?.length) {
    doc.setFont("Roboto", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("Chỉ số nổi bật", 40, y);
    y += 16;

    const cols = Math.min(ctx.kpis.length, 4);
    const gap = 12;
    const cardW = (w - 80 - gap * (cols - 1)) / cols;
    const cardH = 70;
    ctx.kpis.slice(0, 8).forEach((kpi, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 40 + col * (cardW + gap);
      const cy = y + row * (cardH + gap);
      // card
      doc.setFillColor(...BRAND.zebra);
      doc.setDrawColor(...BRAND.border);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, cy, cardW, cardH, 6, 6, "FD");
      // accent bar
      doc.setFillColor(...BRAND.primary);
      doc.roundedRect(x, cy, 4, cardH, 2, 2, "F");
      // label
      doc.setFont("Roboto", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.muted);
      doc.text(kpi.label.toUpperCase(), x + 14, cy + 18);
      // value
      doc.setFont("Roboto", "bold");
      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42);
      doc.text(kpi.value, x + 14, cy + 44);
      if (kpi.hint) {
        doc.setFont("Roboto", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.muted);
        doc.text(kpi.hint, x + 14, cy + 60);
      }
    });
    const rows = Math.ceil(ctx.kpis.length / cols);
    y += rows * (cardH + gap) + 10;
  }

  // Meta table
  if (ctx.meta && Object.keys(ctx.meta).length) {
    autoTable(doc, {
      startY: y,
      head: [["Thông tin", "Giá trị"]],
      body: Object.entries(ctx.meta),
      theme: "grid",
      styles: { font: "Roboto", fontSize: 9, cellPadding: 6, textColor: [15, 23, 42] },
      headStyles: {
        font: "Roboto",
        fontStyle: "bold",
        fillColor: BRAND.primary,
        textColor: [255, 255, 255],
      },
      alternateRowStyles: { fillColor: BRAND.zebra },
      margin: { left: 40, right: 40 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 160 } },
    });
  }
}

function drawSectionHeading(doc: jsPDF, text: string, y: number) {
  doc.setDrawColor(...BRAND.primary);
  doc.setLineWidth(3);
  doc.line(40, y, 48, y);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(text, 54, y + 4);
  return y + 16;
}

// ─── PDF: main builder ─────────────────────────────────────────────────────
export function exportPDF(filename: string, ctx: ExportContext, sheets: ExportSheet[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  ensurePdfFonts(doc);

  // Cover
  drawCover(doc, ctx);

  // Data sheets — one section per sheet
  sheets.forEach((sheet) => {
    doc.addPage();
    const y = drawSectionHeading(doc, sheet.name, 60);

    autoTable(doc, {
      startY: y + 6,
      head: [sheet.headers.map((h) => h)],
      body: sheet.rows.map((r) => r.map((c) => String(c ?? ""))),
      theme: "grid",
      styles: {
        font: "Roboto",
        fontSize: 9,
        cellPadding: 6,
        textColor: [15, 23, 42],
        lineColor: BRAND.border,
        lineWidth: 0.4,
      },
      headStyles: {
        font: "Roboto",
        fontStyle: "bold",
        fillColor: BRAND.primary,
        textColor: [255, 255, 255],
        halign: "left",
      },
      alternateRowStyles: { fillColor: BRAND.zebra },
      columnStyles: sheet.align
        ? Object.fromEntries(sheet.align.map((a, i) => [i, { halign: a }]))
        : undefined,
      margin: { left: 40, right: 40, top: 50, bottom: 40 },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const v = String(data.cell.raw ?? "").toLowerCase();
        if (/(online|hoạt động|hoàn thành|thành công|đã duyệt)/.test(v)) {
          data.cell.styles.textColor = [16, 185, 129];
          data.cell.styles.fontStyle = "bold";
        } else if (/(offline|lỗi|thất bại|bất thường|từ chối)/.test(v)) {
          data.cell.styles.textColor = [239, 68, 68];
          data.cell.styles.fontStyle = "bold";
        } else if (/(chờ duyệt|cảnh báo|đang xử lý)/.test(v)) {
          data.cell.styles.textColor = [245, 158, 11];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  });

  // Apply header + footer on every page
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    drawHeader(doc, ctx);
    drawFooter(doc);
  }

  doc.save(filename);
}

// ─── Excel ─────────────────────────────────────────────────────────────────
type CellStyle = NonNullable<XLSX.CellObject["s"]>;

const STYLE_TITLE: CellStyle = {
  font: { name: "Calibri", sz: 18, bold: true, color: { rgb: BRAND.primaryDarkHex } },
  alignment: { vertical: "center", horizontal: "left" },
};
const STYLE_SUBTITLE: CellStyle = {
  font: { name: "Calibri", sz: 11, color: { rgb: BRAND.mutedHex } },
  alignment: { vertical: "center", horizontal: "left" },
};
const STYLE_META_KEY: CellStyle = {
  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: BRAND.textHex } },
  fill: { fgColor: { rgb: BRAND.zebraHex } },
  border: borderAll(BRAND.borderHex),
  alignment: { vertical: "center" },
};
const STYLE_META_VAL: CellStyle = {
  font: { name: "Calibri", sz: 10, color: { rgb: BRAND.textHex } },
  border: borderAll(BRAND.borderHex),
  alignment: { vertical: "center" },
};
const STYLE_HEADER: CellStyle = {
  font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: BRAND.primaryHex } },
  alignment: { vertical: "center", horizontal: "left", wrapText: true },
  border: borderAll(BRAND.primaryDarkHex),
};
const STYLE_CELL: CellStyle = {
  font: { name: "Calibri", sz: 10, color: { rgb: BRAND.textHex } },
  border: borderAll(BRAND.borderHex),
  alignment: { vertical: "center" },
};
const STYLE_CELL_ZEBRA: CellStyle = {
  ...STYLE_CELL,
  fill: { fgColor: { rgb: BRAND.zebraHex } },
};

function borderAll(rgb: string) {
  const side = { style: "thin" as const, color: { rgb } };
  return { top: side, bottom: side, left: side, right: side };
}

function isNumeric(v: string | number) {
  if (typeof v === "number") return true;
  return /^-?\d+([.,]\d+)?$/.test(String(v).trim());
}

function colLetter(n: number) {
  let s = "";
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function buildSummarySheet(ctx: ExportContext, sheets: ExportSheet[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const data: (string | number)[][] = [];

  data.push([BRAND.name]); // A1
  data.push([ctx.title]); // A2
  if (ctx.period) data.push([`Kỳ báo cáo: ${ctx.period}`]);
  else data.push([""]);
  data.push([`Xuất bởi ${ctx.author ?? "Quản trị viên"} · ${nowVN()}`]);
  data.push([""]);
  data.push(["THÔNG TIN"]);
  const metaStart = data.length;
  Object.entries(ctx.meta ?? {}).forEach(([k, v]) => data.push([k, v]));
  data.push([""]);
  if (ctx.kpis?.length) {
    data.push(["CHỈ SỐ NỔI BẬT"]);
    data.push(["Chỉ số", "Giá trị", "Ghi chú"]);
    ctx.kpis.forEach((k) => data.push([k.label, k.value, k.hint ?? ""]));
    data.push([""]);
  }
  data.push(["NỘI DUNG WORKBOOK"]);
  data.push(["Sheet", "Số dòng", "Cột"]);
  sheets.forEach((s) => data.push([s.name, s.rows.length, s.headers.length]));

  data.forEach((row, r) => {
    row.forEach((v, c) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      ws[addr] = { t: typeof v === "number" ? "n" : "s", v: v as never };
    });
  });

  // Style
  (ws["A1"] as XLSX.CellObject).s = {
    font: { name: "Calibri", sz: 22, bold: true, color: { rgb: BRAND.primaryHex } },
  };
  (ws["A2"] as XLSX.CellObject).s = STYLE_TITLE;
  if (ws["A3"]) (ws["A3"] as XLSX.CellObject).s = STYLE_SUBTITLE;
  if (ws["A4"]) (ws["A4"] as XLSX.CellObject).s = STYLE_SUBTITLE;

  // Section headers
  ["A6", `A${metaStart + Object.keys(ctx.meta ?? {}).length + 2}`].forEach(() => {});

  // Style meta key/val
  Object.keys(ctx.meta ?? {}).forEach((_, i) => {
    const r = metaStart + i;
    const kA = XLSX.utils.encode_cell({ r, c: 0 });
    const vA = XLSX.utils.encode_cell({ r, c: 1 });
    if (ws[kA]) (ws[kA] as XLSX.CellObject).s = STYLE_META_KEY;
    if (ws[vA]) (ws[vA] as XLSX.CellObject).s = STYLE_META_VAL;
  });

  // Style section titles (uppercase rows we manually added)
  data.forEach((row, r) => {
    const v = String(row[0] ?? "");
    if (v === v.toUpperCase() && v.length > 3 && row.length === 1) {
      const a = XLSX.utils.encode_cell({ r, c: 0 });
      if (ws[a]) {
        (ws[a] as XLSX.CellObject).s = {
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: BRAND.primaryDarkHex } },
        };
      }
    }
  });

  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: data.length - 1, c: 4 },
  });
  ws["!cols"] = [{ wch: 32 }, { wch: 40 }, { wch: 32 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
  ];
  ws["!rows"] = [{ hpt: 28 }, { hpt: 26 }];
  return ws;
}

function buildDataSheet(ctx: ExportContext, sheet: ExportSheet): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  // Row 0: title, Row 1: period, Row 2: empty, Row 3: header, Row 4+: data
  const titleAddr = "A1";
  ws[titleAddr] = { t: "s", v: `${sheet.name} — ${ctx.title}`, s: STYLE_TITLE };
  ws["A2"] = {
    t: "s",
    v: `${ctx.period ? `Kỳ: ${ctx.period} · ` : ""}Xuất ${nowVN()}`,
    s: STYLE_SUBTITLE,
  };

  const headerRow = 3;
  sheet.headers.forEach((h, c) => {
    const a = XLSX.utils.encode_cell({ r: headerRow, c });
    ws[a] = { t: "s", v: h, s: STYLE_HEADER };
  });

  sheet.rows.forEach((row, ri) => {
    row.forEach((val, c) => {
      const a = XLSX.utils.encode_cell({ r: headerRow + 1 + ri, c });
      const numeric = isNumeric(val);
      const baseStyle: CellStyle = ri % 2 === 0 ? STYLE_CELL : STYLE_CELL_ZEBRA;
      const align = sheet.align?.[c] ?? (numeric ? "right" : "left");
      const style: CellStyle = {
        ...baseStyle,
        alignment: { ...(baseStyle.alignment ?? {}), horizontal: align },
      };
      // status coloring
      const text = String(val ?? "").toLowerCase();
      if (/(online|hoạt động|hoàn thành|thành công|đã duyệt)/.test(text)) {
        style.font = { ...(style.font ?? {}), color: { rgb: BRAND.successHex }, bold: true };
      } else if (/(offline|lỗi|thất bại|bất thường|từ chối)/.test(text)) {
        style.font = { ...(style.font ?? {}), color: { rgb: BRAND.dangerHex }, bold: true };
      } else if (/(chờ duyệt|cảnh báo|đang xử lý)/.test(text)) {
        style.font = { ...(style.font ?? {}), color: { rgb: BRAND.warningHex }, bold: true };
      }

      if (numeric && typeof val !== "number") {
        const n = parseFloat(String(val).replace(/,/g, ""));
        if (!Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(String(val).trim())) {
          ws[a] = { t: "n", v: n, z: "#,##0.##", s: style };
          return;
        }
      }
      if (typeof val === "number") {
        ws[a] = { t: "n", v: val, z: "#,##0.##", s: style };
      } else {
        ws[a] = { t: "s", v: String(val ?? ""), s: style };
      }
    });
  });

  const lastRow = headerRow + sheet.rows.length;
  const lastCol = sheet.headers.length - 1;
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: lastRow, c: lastCol },
  });

  // Merge title/subtitle across columns
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } },
  ];

  // Auto column widths
  ws["!cols"] = sheet.headers.map((h, i) => {
    const max = Math.max(h.length, ...sheet.rows.map((r) => String(r[i] ?? "").length));
    return { wch: Math.min(Math.max(max + 4, 12), 42) };
  });

  // Row heights
  ws["!rows"] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 6 }, { hpt: 24 }];

  // Freeze pane below header
  ws["!freeze"] = { xSplit: 0, ySplit: headerRow + 1 };

  ws["!autofilter"] = {
    ref: `${colLetter(0)}${headerRow + 1}:${colLetter(lastCol)}${lastRow + 1}`,
  };

  return ws;
}

export function exportExcel(filename: string, ctx: ExportContext, sheets: ExportSheet[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(ctx, sheets), "Tóm tắt");
  sheets.forEach((s) => {
    XLSX.utils.book_append_sheet(wb, buildDataSheet(ctx, s), s.name.substring(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

// ─── CSV ───────────────────────────────────────────────────────────────────
export function exportCSV(filename: string, ctx: ExportContext, sheet: ExportSheet) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push(`# ${BRAND.name} — ${ctx.title}`);
  if (ctx.period) lines.push(`# Kỳ báo cáo: ${ctx.period}`);
  lines.push(`# Xuất bởi: ${ctx.author ?? "Quản trị viên"}`);
  lines.push(`# Thời điểm xuất: ${nowVN()}`);
  if (ctx.meta) {
    Object.entries(ctx.meta).forEach(([k, v]) => lines.push(`# ${k}: ${v}`));
  }
  lines.push(`# Bảng: ${sheet.name} (${sheet.rows.length} dòng)`);
  lines.push("");
  lines.push(sheet.headers.map(escape).join(","));
  sheet.rows.forEach((r) => lines.push(r.map(escape).join(",")));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

// ─── JSON / SQL passthrough (already used by ExportDataDialog) ─────────────
export function exportJSON(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, filename);
}
export function exportSQL(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/sql" });
  downloadBlob(blob, filename);
}
