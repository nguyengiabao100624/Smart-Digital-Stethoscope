const path = require("node:path");
const PDFDocument = require("pdfkit");

const LEGACY_EXPORT_ARTIFACT_RENDERER_VERSION = "shcare.export-artifact.v1";
const EXPORT_ARTIFACT_RENDERER_VERSION = "shcare.export-artifact.v2";
const EXPORT_ARTIFACT_RENDERER_VERSIONS = Object.freeze([
  LEGACY_EXPORT_ARTIFACT_RENDERER_VERSION,
  EXPORT_ARTIFACT_RENDERER_VERSION,
]);
const EXPORT_FORMATS = Object.freeze(["json", "csv", "xlsx", "pdf"]);
const EXPORT_SCOPE_KINDS = Object.freeze(["platform", "workspace", "assigned_patients", "personal"]);

const EXPORT_FORMAT_METADATA = Object.freeze({
  json: Object.freeze({
    extension: "json",
    contentType: "application/json; charset=utf-8",
    label: "JSON",
  }),
  csv: Object.freeze({
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    label: "CSV",
  }),
  xlsx: Object.freeze({
    extension: "xlsx",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "XLSX",
  }),
  pdf: Object.freeze({
    extension: "pdf",
    contentType: "application/pdf",
    label: "PDF",
  }),
});

function normalizeExportFormat(value) {
  const format = String(value === undefined || value === null ? "json" : value)
    .trim()
    .toLowerCase();
  return EXPORT_FORMATS.includes(format) ? format : "";
}

function formatMetadata(value) {
  const format = normalizeExportFormat(value);
  return format ? EXPORT_FORMAT_METADATA[format] : null;
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJsonValue(value[key])]),
  );
}

function recordTimestamp(record = {}) {
  return String(
    record.createdAt ||
      record.startedAt ||
      record.startsAt ||
      record.updatedAt ||
      record.recordedAt ||
      "",
  );
}

function snapshotRows(snapshot = {}) {
  const rows = [];
  const data = snapshot && typeof snapshot.data === "object" && snapshot.data ? snapshot.data : {};
  for (const [dataset, records] of Object.entries(data)) {
    if (!Array.isArray(records)) continue;
    records.forEach((record, index) => {
      const item = record && typeof record === "object" && !Array.isArray(record) ? record : { value: record };
      rows.push({
        dataset,
        recordId: String(item.id || `${dataset}-${index + 1}`),
        recordedAt: recordTimestamp(item),
        payload: JSON.stringify(item),
      });
    });
  }
  return rows;
}

function snapshotTable(snapshot = {}) {
  if (snapshot.dataset === "audit_logs" && Array.isArray(snapshot.data?.auditLogs)) {
    return {
      headers: [
        "created_at",
        "actor_user_id",
        "actor_name",
        "actor_role",
        "workspace_id",
        "workspace_name",
        "action",
        "resource_type",
        "resource_id",
        "outcome",
        "ip",
        "user_agent",
        "metadata_json",
      ],
      rows: snapshot.data.auditLogs.map((log) => [
        log.createdAt || "",
        log.actorUserId || "",
        log.actorName || "",
        log.actorRole || "",
        log.workspaceId || log.organizationId || "",
        log.organizationName || "",
        log.action || "",
        log.resourceType || "",
        log.resourceId || "",
        log.outcome || "recorded",
        log.ip || "",
        log.userAgent || "",
        JSON.stringify(log.metadata || {}),
      ]),
    };
  }
  const rows = snapshotRows(snapshot);
  return {
    headers: ["dataset", "record_id", "recorded_at", "payload_json"],
    rows: rows.map((row) => [row.dataset, row.recordId, row.recordedAt, row.payload]),
  };
}

function spreadsheetSafeText(value) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const safe = spreadsheetSafeText(value).replace(/"/g, '""');
  return `"${safe}"`;
}

function buildCsv(snapshot) {
  const table = snapshotTable(snapshot);
  const lines = [
    table.headers.map(csvCell).join(","),
    ...table.rows.map((row) => row.map(csvCell).join(",")),
  ];
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelColumn(index) {
  let value = index + 1;
  let column = "";
  while (value > 0) {
    value -= 1;
    column = String.fromCharCode(65 + (value % 26)) + column;
    value = Math.floor(value / 26);
  }
  return column;
}

function xlsxCell(value, rowIndex, columnIndex, style = 0) {
  const reference = `${excelColumn(columnIndex)}${rowIndex}`;
  const safe = spreadsheetSafeText(value).slice(0, 32767);
  return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(safe)}</t></is></c>`;
}

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
  return crcTable;
}

function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStoredEntries(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildXlsx(snapshot) {
  const table = snapshotTable(snapshot);
  const sheetRows = [
    table.headers,
    ...table.rows,
  ];
  const worksheetRows = sheetRows
    .map((row, rowOffset) => {
      const rowIndex = rowOffset + 1;
      const cells = row
        .map((value, columnIndex) => xlsxCell(value, rowIndex, columnIndex, rowOffset === 0 ? 1 : 0))
        .join("");
      return `<row r="${rowIndex}">${cells}</row>`;
    })
    .join("");
  const lastRow = Math.max(1, sheetRows.length);
  const lastColumn = excelColumn(Math.max(0, table.headers.length - 1));
  const worksheetColumns = table.headers
    .map((header, index) => {
      const width = /metadata|payload/.test(header) ? 80 : /user_agent/.test(header) ? 48 : 24;
      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");
  const generatedAt = String(snapshot.generatedAt || new Date(0).toISOString());
  const coreTimestamp = Number.isFinite(Date.parse(generatedAt)) ? new Date(generatedAt).toISOString() : new Date(0).toISOString();

  const entries = [
    {
      name: "[Content_Types].xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
    },
    {
      name: "_rels/.rels",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
    },
    {
      name: "docProps/core.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Shcare data export</dc:title><dc:creator>Shcare</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(coreTimestamp)}</dcterms:created></cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Shcare</Application></Properties>',
    },
    {
      name: "xl/workbook.xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Shcare export" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    },
    {
      name: "xl/styles.xml",
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2457D6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>',
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${worksheetColumns}</cols><sheetData>${worksheetRows}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`,
    },
  ];

  return zipStoredEntries(entries);
}

function wrapPdfLine(value, width = 92) {
  const input = String(value ?? "").normalize("NFC");
  if (!input) return [""];
  const output = [];
  let remaining = input;
  while (remaining.length > width) {
    let splitAt = remaining.lastIndexOf(" ", width);
    if (splitAt < Math.floor(width / 2)) splitAt = width;
    output.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  output.push(remaining);
  return output;
}

function renderPdfLine(doc, value, x, y, options = {}) {
  const fontSize = Number(options.fontSize || 9);
  doc.font("ShcarePdf").fontSize(fontSize).text(String(value ?? "").normalize("NFC"), x, y, {
    lineBreak: false,
  });
}

async function buildPdf(snapshot) {
  const table = snapshotTable(snapshot);
  const counts = snapshot && typeof snapshot.counts === "object" && snapshot.counts ? snapshot.counts : {};
  const filters = snapshot && typeof snapshot.filters === "object" && snapshot.filters ? snapshot.filters : {};
  const lines = [
    "SHCARE — SMART HEALTH CARE",
    `Mã bản xuất: ${snapshot.exportId || ""}`,
    `Thời điểm tạo: ${snapshot.generatedAt || ""}`,
    `Workspace: ${snapshot.scope?.organizationId || (snapshot.scope?.kind === "platform" ? "Toàn nền tảng" : "")}`,
    `Bộ lọc: ${JSON.stringify(filters)}`,
    `Số bản ghi: ${JSON.stringify(counts)}`,
    "",
    "PDF là báo cáo dễ đọc. JSON, CSV và XLSX giữ cấu trúc dữ liệu dành cho máy xử lý.",
    "",
  ];
  lines.push(...wrapPdfLine(table.headers.join(" | ")));
  for (const row of table.rows) {
    lines.push(...wrapPdfLine(row.join(" | ")));
  }
  if (table.rows.length === 0) lines.push("Không có bản ghi phù hợp với bộ lọc đã chọn.");

  const doc = new PDFDocument({
    size: "A4",
    pdfVersion: "1.4",
    margins: { top: 42, right: 42, bottom: 42, left: 42 },
    info: {
      Title: `Shcare export ${snapshot.exportId || ""}`,
      Author: "Shcare",
      Subject: "Smart Health Care data export",
      CreationDate: Number.isFinite(Date.parse(snapshot.generatedAt || ""))
        ? new Date(snapshot.generatedAt)
        : new Date(0),
    },
    compress: true,
  });
  doc.registerFont(
    "ShcarePdf",
    path.join(path.dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf", "DejaVuSans.ttf"),
  );
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });
  let y = 42;
  lines.forEach((line, index) => {
    if (y > 790) {
      doc.addPage();
      y = 42;
    }
    renderPdfLine(doc, line, 42, y, { fontSize: index === 0 ? 14 : 8.5 });
    y += index === 0 ? 22 : 12;
  });
  doc.end();
  return completed;
}

async function buildExportArtifact(snapshot, value, rendererVersion = EXPORT_ARTIFACT_RENDERER_VERSION) {
  if (!EXPORT_ARTIFACT_RENDERER_VERSIONS.includes(rendererVersion)) {
    const error = new Error("The export artifact renderer version is unavailable");
    error.code = "EXPORT_RENDERER_UNAVAILABLE";
    throw error;
  }
  const format = normalizeExportFormat(value);
  const metadata = formatMetadata(format);
  if (!metadata) {
    const error = new Error("Unsupported export format");
    error.code = "EXPORT_FORMAT_UNSUPPORTED";
    error.supportedFormats = [...EXPORT_FORMATS];
    throw error;
  }
  const rendererSnapshot =
    rendererVersion === EXPORT_ARTIFACT_RENDERER_VERSION ? canonicalJsonValue(snapshot) : snapshot;
  let buffer;
  switch (format) {
    case "csv":
      buffer = buildCsv(rendererSnapshot);
      break;
    case "xlsx":
      buffer = buildXlsx(rendererSnapshot);
      break;
    case "pdf":
      buffer = await buildPdf(rendererSnapshot);
      break;
    default:
      buffer = Buffer.from(`${JSON.stringify(rendererSnapshot, null, 2)}\n`, "utf8");
      break;
  }
  return { ...metadata, format, buffer };
}

module.exports = {
  EXPORT_ARTIFACT_RENDERER_VERSION,
  EXPORT_ARTIFACT_RENDERER_VERSIONS,
  EXPORT_FORMATS,
  EXPORT_FORMAT_METADATA,
  EXPORT_SCOPE_KINDS,
  buildExportArtifact,
  formatMetadata,
  normalizeExportFormat,
  snapshotRows,
  snapshotTable,
};
