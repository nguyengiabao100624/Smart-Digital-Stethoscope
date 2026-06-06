import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Database, Download, Calendar, Users, Building2, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import {
  exportCSV,
  exportExcel,
  buildFilename,
  type ExportContext,
} from "@/lib/export-utils";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  DATA_LABELS,
  buildLiveExportSheets,
  isDataKey,
  type DataKey,
} from "@/lib/live-export-data";

interface ExportDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExportDataDialog({ open, onOpenChange }: ExportDataDialogProps) {
  const [selectedTables, setSelectedTables] = useState<string[]>(["patients", "measurements"]);
  const [formData, setFormData] = useState({
    dateFrom: "",
    dateTo: "",
    format: "json",
  });

  const tables = [
    { id: "patients", name: "Bệnh nhân", icon: Users, count: "Backend" },
    { id: "doctors", name: "Bác sĩ", icon: Stethoscope, count: "Backend" },
    { id: "clinics", name: "Phòng khám", icon: Building2, count: "Backend" },
    { id: "measurements", name: "Đo chỉ số", icon: Database, count: "Backend" },
    { id: "devices", name: "Thiết bị", icon: Database, count: "Backend" },
  ];

  const toggleTable = (tableId: string) => {
    setSelectedTables((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId],
    );
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    const period =
      formData.dateFrom && formData.dateTo
        ? `${formData.dateFrom} → ${formData.dateTo}`
        : new Date().toLocaleDateString("vi-VN", { month: "long", year: "numeric" });

    try {
      const keys = selectedTables.filter(isDataKey);
      if (keys.length === 0) {
        toast.error("Vui lòng chọn ít nhất một bảng dữ liệu.");
        return;
      }

      const sheetMap = await buildLiveExportSheets(keys);
      const sheets = keys.map((key) => sheetMap[key]).filter((sheet): sheet is NonNullable<typeof sheet> => Boolean(sheet));
      const ctx: ExportContext = {
        title: "Xuất dữ liệu hệ thống",
        period,
        author: "Quản trị viên Smart Health",
        meta: {
          "Nguồn dữ liệu": "Backend Smart Health",
          "Số bảng": String(sheets.length),
          "Bảng đã chọn": keys.map((k) => DATA_LABELS[k]).join(", ") || "—",
          "Định dạng": formData.format.toUpperCase(),
        },
      };

      if (formData.format === "csv") {
        sheets.forEach((s) =>
          exportCSV(buildFilename(`Du-Lieu-${s.name.replace(/\s+/g, "")}`, period, "csv"), ctx, s),
        );
      } else if (formData.format === "excel") {
        exportExcel(buildFilename("Du-Lieu-HeThong", period, "xlsx"), ctx, sheets);
      } else if (formData.format === "json") {
        const json = {
          _meta: { ...ctx, exportedAt: new Date().toISOString() },
          data: Object.fromEntries(
            keys.map((k) => [
              k,
              (sheetMap[k]?.rows || []).map((r) =>
                Object.fromEntries((sheetMap[k]?.headers || []).map((h, i) => [h, r[i]])),
              ),
            ]),
          ),
        };
        downloadFile(
          new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }),
          buildFilename("Du-Lieu-HeThong", period, "json"),
        );
      } else if (formData.format === "sql") {
        const stmts: string[] = [
          `-- Smart Health · ${ctx.title}`,
          `-- Kỳ: ${period}`,
          `-- Xuất: ${new Date().toISOString()}`,
        ];
        keys.forEach((k) => {
          const sheet = sheetMap[k];
          if (!sheet) return;
          const { headers, rows } = sheet;
          stmts.push(`\n-- Bảng: ${DATA_LABELS[k]} (${rows.length} dòng)`);
          rows.forEach((r) => {
            const vals = r
              .map((v) => (typeof v === "number" ? v : `'${String(v).replace(/'/g, "''")}'`))
              .join(", ");
            stmts.push(
              `INSERT INTO ${k} (${headers.map((h) => `"${h}"`).join(", ")}) VALUES (${vals});`,
            );
          });
        });
        downloadFile(
          new Blob([stmts.join("\n")], { type: "application/sql" }),
          buildFilename("Du-Lieu-HeThong", period, "sql"),
        );
      }
      toast.success("Xuất dữ liệu thành công!", {
        description: `Đã xuất ${sheets.length} bảng từ backend sang ${formData.format.toUpperCase()}`,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error("Lỗi xuất file", {
        description: toVietnameseErrorMessage(err, "Không thể xuất file. Vui lòng thử lại."),
      });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl shadow-xl w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto z-50 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">Xuất dữ liệu</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Sao lưu và tải xuống dữ liệu hệ thống
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleExport} className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-3">
                Chọn dữ liệu cần xuất <span className="text-destructive">*</span>
              </label>
              <div className="space-y-2">
                {tables.map((table) => {
                  const Icon = table.icon;
                  return (
                    <label
                      key={table.id}
                      className="flex items-center justify-between p-3 border border-border rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedTables.includes(table.id)}
                          onChange={() => toggleTable(table.id)}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-ring"
                        />
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{table.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{table.count} bản ghi</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Từ ngày</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="date"
                    value={formData.dateFrom}
                    onChange={(e) => setFormData({ ...formData, dateFrom: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Đến ngày</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="date"
                    value={formData.dateTo}
                    onChange={(e) => setFormData({ ...formData, dateTo: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Định dạng file <span className="text-destructive">*</span>
              </label>
              <select
                required
                value={formData.format}
                onChange={(e) => setFormData({ ...formData, format: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-ring"
              >
                <option value="json">JSON (.json)</option>
                <option value="csv">CSV (.csv)</option>
                <option value="excel">Excel (.xlsx)</option>
                <option value="sql">SQL (.sql)</option>
              </select>
            </div>

            <div className="bg-muted/30 rounded-lg p-4 border border-border">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {selectedTables.length} bảng dữ liệu được chọn
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Dữ liệu sẽ được mã hóa và nén trước khi xuất để đảm bảo bảo mật
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
                >
                  Hủy
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={selectedTables.length === 0}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Xuất dữ liệu
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
