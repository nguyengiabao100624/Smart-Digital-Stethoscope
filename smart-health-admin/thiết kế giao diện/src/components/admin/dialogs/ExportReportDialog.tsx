import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  FileText,
  Calendar,
  Building2,
  Download,
  FileSpreadsheet,
  FileBarChart,
} from "lucide-react";
import { toast } from "sonner";
import {
  exportCSV,
  exportExcel,
  exportPDF,
  buildFilename,
  type ExportContext,
  type ExportSheet,
} from "@/lib/export-utils";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  DATA_KEYS,
  DATA_LABELS,
  buildLiveExportSheets,
  buildLiveKpis,
  type DataKey,
} from "@/lib/live-export-data";

const REPORT_LABEL: Record<string, string> = {
  measurements: "Lượt đo",
  patients: "Bệnh nhân",
  devices: "Thiết bị",
  doctors: "Bác sĩ",
  clinics: "Phòng khám",
  comprehensive: "Tổng hợp",
};

interface ExportReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const REPORT_TO_KEY: Record<string, DataKey> = {
  measurements: "measurements",
  patients: "patients",
  devices: "devices",
  doctors: "doctors",
  clinics: "clinics",
};

const CLINIC_LABEL: Record<string, string> = {
  all: "Tất cả phòng khám",
  "CL-1001": "PK Đa khoa Tâm Anh",
  "CL-1002": "PK Hô hấp Việt",
  "CL-1003": "PK Tim mạch Minh Tâm",
};

export function ExportReportDialog({ open, onOpenChange }: ExportReportDialogProps) {
  const [formData, setFormData] = useState({
    reportType: "measurements",
    format: "pdf",
    dateFrom: "",
    dateTo: "",
    clinic: "all",
    includeCharts: true,
    includeStatistics: true,
  });

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    const period =
      formData.dateFrom && formData.dateTo
        ? `${formData.dateFrom} → ${formData.dateTo}`
        : new Date().toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
    const meta: Record<string, string> = {
      "Loại báo cáo": REPORT_LABEL[formData.reportType] ?? formData.reportType,
      "Từ ngày": formData.dateFrom || "—",
      "Đến ngày": formData.dateTo || "—",
      "Phòng khám": CLINIC_LABEL[formData.clinic] ?? formData.clinic,
      "Bao gồm biểu đồ": formData.includeCharts ? "Có" : "Không",
      "Bao gồm thống kê": formData.includeStatistics ? "Có" : "Không",
    };

    try {
      const keys =
        formData.reportType === "comprehensive"
          ? DATA_KEYS
          : [REPORT_TO_KEY[formData.reportType] ?? "measurements"];
      const sheetMap = await buildLiveExportSheets(keys);
      const sheets: ExportSheet[] = keys
        .map((key) => sheetMap[key])
        .filter((sheet): sheet is ExportSheet => Boolean(sheet));
      const kpiKey = keys[0] ?? "measurements";
      const kpis = sheets[0] ? buildLiveKpis(kpiKey, sheets[0]) : [];
      const ctx: ExportContext = {
        title: `Báo cáo ${REPORT_LABEL[formData.reportType] ?? formData.reportType}`,
        period,
        meta: {
          ...meta,
          "Nguồn dữ liệu": "Backend Smart Health",
        },
        kpis,
        author: "Quản trị viên Smart Health",
      };
      const kind = `BaoCao-${(REPORT_LABEL[formData.reportType] ?? "TongHop").replace(/\s+/g, "")}`;

      if (formData.format === "pdf") {
        exportPDF(buildFilename(kind, period, "pdf"), ctx, sheets);
      } else if (formData.format === "excel") {
        exportExcel(buildFilename(kind, period, "xlsx"), ctx, sheets);
      } else {
        exportCSV(buildFilename(kind, period, "csv"), ctx, sheets[0]);
      }
      toast.success("Xuất báo cáo thành công!", {
        description: `File ${formData.format.toUpperCase()} đã được tải xuống.`,
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
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">Xuất báo cáo</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Tạo và tải xuống báo cáo chi tiết
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleExport} className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Loại báo cáo <span className="text-destructive">*</span>
              </label>
              <select
                required
                value={formData.reportType}
                onChange={(e) => setFormData({ ...formData, reportType: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-ring"
              >
                <option value="measurements">Báo cáo đo chỉ số</option>
                <option value="patients">Báo cáo bệnh nhân</option>
                <option value="devices">Báo cáo thiết bị</option>
                <option value="doctors">Báo cáo bác sĩ</option>
                <option value="clinics">Báo cáo phòng khám</option>
                <option value="comprehensive">Báo cáo tổng hợp</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Định dạng file <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, format: "pdf" })}
                  className={`flex items-center justify-center gap-2 px-3 py-2 border rounded-md text-sm font-medium transition-colors ${
                    formData.format === "pdf"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <FileText className="w-4 h-4" /> PDF
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, format: "excel" })}
                  className={`flex items-center justify-center gap-2 px-3 py-2 border rounded-md text-sm font-medium transition-colors ${
                    formData.format === "excel"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" /> Excel
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, format: "csv" })}
                  className={`flex items-center justify-center gap-2 px-3 py-2 border rounded-md text-sm font-medium transition-colors ${
                    formData.format === "csv"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  <FileBarChart className="w-4 h-4" /> CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Từ ngày <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="date"
                    required
                    value={formData.dateFrom}
                    onChange={(e) => setFormData({ ...formData, dateFrom: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-2">
                  Đến ngày <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="date"
                    required
                    value={formData.dateTo}
                    onChange={(e) => setFormData({ ...formData, dateTo: e.target.value })}
                    className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Phòng khám</label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={formData.clinic}
                  onChange={(e) => setFormData({ ...formData, clinic: e.target.value })}
                  className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-ring appearance-none"
                >
                  <option value="all">Tất cả phòng khám</option>
                  <option value="CL-1001">PK Đa khoa Tâm Anh</option>
                  <option value="CL-1002">PK Hô hấp Việt</option>
                  <option value="CL-1003">PK Tim mạch Minh Tâm</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-sm font-medium text-foreground block">Tùy chọn thêm</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.includeCharts}
                    onChange={(e) => setFormData({ ...formData, includeCharts: e.target.checked })}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-ring"
                  />
                  <span className="text-sm text-foreground">Bao gồm biểu đồ</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.includeStatistics}
                    onChange={(e) =>
                      setFormData({ ...formData, includeStatistics: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-border text-primary focus:ring-ring"
                  />
                  <span className="text-sm text-foreground">Bao gồm thống kê chi tiết</span>
                </label>
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
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Xuất báo cáo
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
