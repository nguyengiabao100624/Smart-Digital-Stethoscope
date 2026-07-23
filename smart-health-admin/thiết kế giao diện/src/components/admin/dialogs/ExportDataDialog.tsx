import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Calendar,
  Database,
  Download,
  FileJson2,
  FileSpreadsheet,
  FileText,
  Loader2,
  ShieldCheck,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  smartHealthApi,
  type SmartHealthApiError,
  type SmartHealthAuditLogFilters,
  type SmartHealthExportDataset,
  type SmartHealthExportFormat,
} from "@/lib/smart-health-api";

export interface ExportDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "data" | "report";
  dataset?: SmartHealthExportDataset;
  filters?: SmartHealthAuditLogFilters;
  organizationId?: string;
}

type ExportForm = {
  format: SmartHealthExportFormat;
  startDate: string;
  endDate: string;
  includeAudio: boolean;
  includeReports: boolean;
  includeHistory: boolean;
};

type PendingStage = "creating" | "downloading" | null;

const FORMAT_OPTIONS: Array<{
  value: SmartHealthExportFormat;
  label: string;
  description: string;
  icon: typeof FileJson2;
}> = [
  { value: "json", label: "JSON", description: "Dữ liệu có cấu trúc", icon: FileJson2 },
  { value: "csv", label: "CSV", description: "Mở bằng bảng tính", icon: FileText },
  { value: "xlsx", label: "XLSX", description: "Workbook Excel", icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", description: "Tài liệu để đọc và in", icon: FileText },
];

const FORMAT_MIME: Record<SmartHealthExportFormat, string> = {
  json: "application/json",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

function initialForm(
  variant: "data" | "report",
  dataset: SmartHealthExportDataset,
  filters?: SmartHealthAuditLogFilters,
): ExportForm {
  return {
    format: "csv",
    startDate: filters?.startDate || "",
    endDate: filters?.endDate || "",
    includeAudio: dataset === "clinical_bundle" && variant === "data",
    includeReports: dataset === "clinical_bundle",
    includeHistory: true,
  };
}

function createExportIdempotencyKey(
  dataset: SmartHealthExportDataset,
  format: SmartHealthExportFormat,
) {
  const suffix =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `shcare-admin:export:${dataset}:${format}:${suffix}`;
}

function safeDownloadFilename(contentDisposition: string, fallback: string) {
  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  const quotedMatch = /filename="([^"]+)"/i.exec(contentDisposition);
  const plainMatch = /filename=([^;]+)/i.exec(contentDisposition);
  const candidate = encodedMatch?.[1] || quotedMatch?.[1] || plainMatch?.[1] || "";
  let decoded = candidate.trim();
  if (encodedMatch && decoded) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      decoded = "";
    }
  }
  const filename = Array.from(decoded)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || /[\\/:*?"<>|]/.test(character) ? "-" : character;
    })
    .join("")
    .slice(0, 180);
  return filename || fallback;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function validateDateRange(startDate: string, endDate: string) {
  if (startDate && endDate && endDate < startDate) {
    return "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.";
  }
  return "";
}

function apiStatus(error: unknown) {
  return error && typeof error === "object" && "status" in error
    ? Number((error as SmartHealthApiError).status || 0)
    : 0;
}

function auditFilterSummary(filters?: SmartHealthAuditLogFilters) {
  if (!filters) return [];
  return [
    filters.q ? `Từ khóa: ${filters.q}` : "",
    filters.action ? `Hành động: ${filters.action}` : "",
    filters.resourceType ? `Tài nguyên: ${filters.resourceType}` : "",
    filters.actorUserId ? `Actor: ${filters.actorUserId}` : "",
  ].filter(Boolean);
}

export function ExportDataDialog({
  open,
  onOpenChange,
  variant = "data",
  dataset = "clinical_bundle",
  filters,
  organizationId,
}: ExportDataDialogProps) {
  const filterFingerprint = JSON.stringify(filters || {});
  const stableFilters = useMemo<SmartHealthAuditLogFilters>(
    () => JSON.parse(filterFingerprint) as SmartHealthAuditLogFilters,
    [filterFingerprint],
  );
  const [form, setForm] = useState<ExportForm>(() => initialForm(variant, dataset, stableFilters));
  const [pendingStage, setPendingStage] = useState<PendingStage>(null);
  const [error, setError] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const idempotencyIntent = useRef<{ fingerprint: string; key: string } | null>(null);
  const isSubmitting = pendingStage !== null;
  const filterSummary = auditFilterSummary(stableFilters);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(variant, dataset, stableFilters));
    setError("");
    setPermissionDenied(false);
    setPendingStage(null);
    idempotencyIntent.current = null;
  }, [dataset, open, stableFilters, variant]);

  const title =
    dataset === "audit_logs"
      ? "Xuất nhật ký audit"
      : variant === "report"
        ? "Xuất báo cáo dữ liệu"
        : "Xuất dữ liệu";
  const description =
    dataset === "audit_logs"
      ? "Backend tạo artifact từ đúng bộ lọc audit đang áp dụng và ghi nhận cả thao tác tạo lẫn tải xuống."
      : "Backend tạo artifact trong phạm vi dữ liệu mà tài khoản và workspace hiện tại được phép truy cập.";

  const updateForm = (patch: Partial<ExportForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError("");
    setPermissionDenied(false);
  };

  const handleExport = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateDateRange(form.startDate, form.endDate);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!isOnline) {
      setError("Thiết bị đang ngoại tuyến. Hãy kết nối mạng rồi thử lại để backend tạo artifact.");
      return;
    }

    const auditFilters =
      dataset === "audit_logs"
        ? {
            ...stableFilters,
            startDate: form.startDate || undefined,
            endDate: form.endDate || undefined,
          }
        : undefined;
    const payload = {
      format: form.format,
      dataset,
      filters: auditFilters,
      startDate: dataset === "clinical_bundle" ? form.startDate || undefined : undefined,
      endDate: dataset === "clinical_bundle" ? form.endDate || undefined : undefined,
      includeAudio: dataset === "clinical_bundle" ? form.includeAudio : false,
      includeReports: dataset === "clinical_bundle" ? form.includeReports : false,
      includeHistory: form.includeHistory,
      organizationId,
    };
    const fingerprint = JSON.stringify(payload);
    if (!idempotencyIntent.current || idempotencyIntent.current.fingerprint !== fingerprint) {
      idempotencyIntent.current = {
        fingerprint,
        key: createExportIdempotencyKey(dataset, form.format),
      };
    }

    setPendingStage("creating");
    setError("");
    setPermissionDenied(false);
    try {
      const { export: exportJob } = await smartHealthApi.createExport(
        payload,
        idempotencyIntent.current.key,
      );
      if (!exportJob.id || exportJob.status !== "ready") {
        throw new Error(
          exportJob.status === "failed"
            ? "Backend không tạo được artifact xuất dữ liệu."
            : "Artifact chưa sẵn sàng nên chưa có tệp nào được tải xuống.",
        );
      }

      setPendingStage("downloading");
      let contentDisposition = "";
      let artifactHash = exportJob.artifactSha256 || "";
      const blob = await smartHealthApi.downloadExport(exportJob.id, (response) => {
        contentDisposition = response.headers.get("Content-Disposition") || "";
        artifactHash = response.headers.get("X-Shcare-Artifact-SHA256") || artifactHash;
      });
      if (blob.size === 0) {
        throw new Error("Backend trả về artifact rỗng. Không có tệp nào được lưu.");
      }
      const fallbackFilename = `${dataset === "audit_logs" ? "shcare-audit" : "shcare-export"}-${exportJob.id}.${form.format}`;
      const filename = safeDownloadFilename(contentDisposition, fallbackFilename);
      triggerBlobDownload(
        blob.type ? blob : new Blob([blob], { type: FORMAT_MIME[form.format] }),
        filename,
      );

      toast.success("Đã tải artifact do backend tạo.", {
        description: `${filename} · ${exportJob.recordCount ?? 0} bản ghi${artifactHash ? ` · SHA-256 ${artifactHash.slice(0, 12)}…` : ""}`,
      });
      idempotencyIntent.current = null;
      onOpenChange(false);
    } catch (caughtError) {
      const denied = apiStatus(caughtError) === 403;
      const message = denied
        ? "Tài khoản hiện tại không có quyền xuất phạm vi dữ liệu này."
        : toVietnameseErrorMessage(
            caughtError,
            "Không thể tạo hoặc tải artifact. Vui lòng thử lại; lần thử lại sẽ dùng cùng khóa chống gửi lặp.",
          );
      setPermissionDenied(denied);
      setError(message);
      toast.error("Xuất dữ liệu chưa hoàn tất", { description: message });
    } finally {
      setPendingStage(null);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        if (!nextOpen) idempotencyIntent.current = null;
        setError("");
        setPermissionDenied(false);
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content
          aria-busy={isSubmitting}
          className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Database className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-semibold text-foreground">{title}</Dialog.Title>
                <Dialog.Description className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">
                  {description}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              aria-label="Đóng hộp thoại xuất dữ liệu"
              disabled={isSubmitting}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <form method="post" onSubmit={handleExport} className="space-y-5 p-5 sm:p-6">
            <fieldset disabled={isSubmitting} className="space-y-3">
              <legend className="text-sm font-semibold text-foreground">Định dạng tệp</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FORMAT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = form.format === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`flex min-h-[72px] cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring ${
                        selected
                          ? "border-primary bg-primary/8 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="export-format"
                        value={option.value}
                        checked={selected}
                        onChange={() => updateForm({ format: option.value })}
                        className="sr-only"
                      />
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? "text-primary" : ""}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className="mt-0.5 block text-xs leading-4">{option.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Từ ngày</span>
                <span className="relative block">
                  <Calendar
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="date"
                    value={form.startDate}
                    disabled={isSubmitting}
                    onChange={(event) => updateForm({ startDate: event.target.value })}
                    className="min-h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </span>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Đến ngày</span>
                <span className="relative block">
                  <Calendar
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="date"
                    value={form.endDate}
                    disabled={isSubmitting}
                    onChange={(event) => updateForm({ endDate: event.target.value })}
                    className="min-h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </span>
              </label>
            </div>

            {dataset === "clinical_bundle" ? (
              <fieldset className="space-y-3" disabled={isSubmitting}>
                <legend className="text-sm font-semibold text-foreground">Nội dung artifact</legend>
                {[
                  ["includeHistory", "Lịch sử và bản ghi nghiệp vụ"],
                  ["includeReports", "Kết quả và báo cáo đã có"],
                  ["includeAudio", "Metadata tệp âm thanh được phép truy cập"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 text-sm text-foreground transition-colors hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={form[key as keyof ExportForm] as boolean}
                      onChange={(event) => updateForm({ [key]: event.target.checked })}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            ) : (
              <div className="rounded-lg border border-border bg-muted/25 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Bộ lọc audit được đưa vào artifact
                </p>
                {filterSummary.length ? (
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                    {filterSummary.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Không có từ khóa hoặc trường lọc bổ sung; phạm vi workspace vẫn do backend quyết
                    định.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Phạm vi do backend quyết định
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Giao diện không tự mở rộng phạm vi dữ liệu. Artifact chỉ được tải sau khi
                    backend xác nhận trạng thái sẵn sàng; thao tác tạo và tải đều được ghi audit.
                  </p>
                </div>
              </div>
            </div>

            {!isOnline ? (
              <div
                role="status"
                className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground"
              >
                <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                <span>Đang ngoại tuyến. Nút xuất sẽ hoạt động lại sau khi có kết nối mạng.</span>
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className={`rounded-lg border p-4 text-sm ${
                  permissionDenied
                    ? "border-destructive/25 bg-destructive/10 text-destructive"
                    : "border-warning/30 bg-warning/10 text-foreground"
                }`}
              >
                <p className="font-semibold">
                  {permissionDenied
                    ? "Không có quyền xuất dữ liệu"
                    : "Chưa thể hoàn tất xuất dữ liệu"}
                </p>
                <p className="mt-1 leading-5">{error}</p>
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={isSubmitting}
                  className="min-h-11 rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-28"
                >
                  Hủy
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isSubmitting || !isOnline}
                className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-48"
              >
                {isSubmitting ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Download className="h-4 w-4" aria-hidden="true" />
                )}
                {pendingStage === "creating"
                  ? "Đang tạo artifact..."
                  : pendingStage === "downloading"
                    ? "Đang tải tệp..."
                    : `Tạo và tải ${form.format.toUpperCase()}`}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
