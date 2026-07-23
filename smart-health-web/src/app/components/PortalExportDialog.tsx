import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileArchive,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import {
  smartHealthApi,
  type ApiError,
  type CreateExportInput,
  type ExportDataset,
  type ExportFilters,
  type ExportFormat,
} from "../../lib/smart-health-api";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const FORMAT_OPTIONS: ReadonlyArray<{
  value: ExportFormat;
  label: string;
  description: string;
}> = [
  { value: "csv", label: "CSV", description: "Dễ mở trong bảng tính" },
  { value: "xlsx", label: "XLSX", description: "Tệp Excel chuẩn OpenXML" },
  { value: "pdf", label: "PDF", description: "Phù hợp lưu trữ và in" },
  { value: "json", label: "JSON", description: "Dành cho tích hợp kỹ thuật" },
];

type ExportPhase = "idle" | "creating" | "downloading" | "complete" | "error";

export interface PortalExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: ExportDataset;
  expectedWorkspaceId: string;
  title: string;
  description: string;
  filters?: ExportFilters;
  onCompleted?: () => void;
}

function createIdempotencyKey(dataset: ExportDataset) {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return `portal-${dataset}-export-${webCrypto.randomUUID()}`;
  }
  if (typeof webCrypto?.getRandomValues === "function") {
    const bytes = new Uint32Array(4);
    webCrypto.getRandomValues(bytes);
    return `portal-${dataset}-export-${Array.from(bytes, (value) => value.toString(16)).join("")}`;
  }
  return `portal-${dataset}-export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

function exportErrorMessage(error: unknown) {
  const apiError = error as ApiError;
  if (apiError?.status === 403) {
    return "Tài khoản không có quyền xuất tập dữ liệu này.";
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "Thiết bị đang ngoại tuyến. Hãy kết nối mạng rồi thử lại; yêu cầu cũ sẽ được phát lại an toàn.";
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "Đã dừng tải bản xuất.";
  }
  return error instanceof Error
    ? error.message
    : "Không thể tạo hoặc tải bản xuất. Vui lòng thử lại.";
}

function countAppliedFilters(filters: ExportFilters) {
  return Object.values(filters).filter((value) => String(value || "").trim())
    .length;
}

export function PortalExportDialog({
  open,
  onOpenChange,
  dataset,
  expectedWorkspaceId,
  title,
  description,
  filters = {},
  onCompleted,
}: PortalExportDialogProps) {
  const isAudit = dataset === "audit_logs";
  const [format, setFormat] = useState<ExportFormat>(isAudit ? "csv" : "xlsx");
  const [startDate, setStartDate] = useState(filters.startDate || "");
  const [endDate, setEndDate] = useState(filters.endDate || "");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeReports, setIncludeReports] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [phase, setPhase] = useState<ExportPhase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    fileName: string;
    recordCount: number;
    artifactSha256: string;
  } | null>(null);
  const intentRef = useRef({ fingerprint: "", key: "" });

  const busy = phase === "creating" || phase === "downloading";
  const appliedFilters = useMemo<ExportFilters>(
    () => ({
      ...filters,
      startDate: isAudit ? filters.startDate : startDate || undefined,
      endDate: isAudit ? filters.endDate : endDate || undefined,
    }),
    [endDate, filters, isAudit, startDate],
  );

  useEffect(() => {
    if (!open) return;
    setStartDate(filters.startDate || "");
    setEndDate(filters.endDate || "");
    setPhase("idle");
    setProgress(null);
    setError("");
    setReceipt(null);
  }, [filters.endDate, filters.startDate, open]);

  const submit = async () => {
    if (Boolean(appliedFilters.startDate) !== Boolean(appliedFilters.endDate)) {
      setPhase("error");
      setError(
        "Hãy chọn đủ ngày bắt đầu và ngày kết thúc, hoặc để trống cả hai.",
      );
      return;
    }
    if (
      appliedFilters.startDate &&
      appliedFilters.endDate &&
      appliedFilters.endDate < appliedFilters.startDate
    ) {
      setPhase("error");
      setError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
      return;
    }

    const payload: CreateExportInput = {
      format,
      dataset,
      filters: appliedFilters,
      ...(isAudit ? {} : { includeAudio, includeReports, includeHistory }),
    };
    const fingerprint = JSON.stringify(payload);
    if (intentRef.current.fingerprint !== fingerprint) {
      intentRef.current = {
        fingerprint,
        key: createIdempotencyKey(dataset),
      };
    }

    setError("");
    setReceipt(null);
    setProgress(null);
    setPhase("creating");
    try {
      const created = await smartHealthApi.createExport(
        payload,
        intentRef.current.key,
      );
      if (
        !expectedWorkspaceId ||
        created.export.scopeKind === "platform" ||
        created.export.organizationId !== expectedWorkspaceId ||
        created.export.workspaceId !== expectedWorkspaceId
      ) {
        throw new Error(
          "Backend trả về bản xuất ngoài workspace đang hoạt động. Shcare đã dừng tải tệp.",
        );
      }
      setPhase("downloading");
      const downloaded = await smartHealthApi.downloadExport(
        created.export.id,
        {
          onProgress: ({ percent }) => setProgress(percent),
        },
      );
      if (
        downloaded.rendererVersion !== created.export.rendererVersion ||
        downloaded.artifactSha256 !== created.export.artifactSha256
      ) {
        throw new Error(
          "Định danh tệp tải về không khớp với bản xuất backend vừa xác nhận.",
        );
      }
      triggerBrowserDownload(downloaded.blob, downloaded.fileName);
      setReceipt({
        fileName: downloaded.fileName,
        recordCount: created.export.recordCount,
        artifactSha256:
          downloaded.artifactSha256 || created.export.artifactSha256 || "",
      });
      setPhase("complete");
      intentRef.current = { fingerprint: "", key: "" };
      onCompleted?.();
      toast.success(`Đã tải ${downloaded.fileName}`);
    } catch (caught) {
      setError(exportErrorMessage(caught));
      setPhase("error");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-xl [&>button.absolute]:flex [&>button.absolute]:size-11 [&>button.absolute]:items-center [&>button.absolute]:justify-center"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileArchive aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="max-w-[65ch]">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label htmlFor={`${dataset}-export-format`}>Định dạng tệp</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
              disabled={busy}
            >
              <SelectTrigger id={`${dataset}-export-format`} className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="font-semibold">{option.label}</span>
                    <span className="text-muted-foreground">
                      — {option.description}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAudit ? (
            <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Phạm vi xuất</p>
              <p className="mt-1 text-muted-foreground">
                Áp dụng {countAppliedFilters(appliedFilters)} điều kiện truy vấn
                đang hiển thị trên nhật ký. Backend giữ nguyên giới hạn
                workspace và ghi audit cho cả lúc tạo lẫn tải tệp.
              </p>
            </div>
          ) : (
            <>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">
                  Khoảng thời gian
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clinical-export-start-date">Từ ngày</Label>
                    <Input
                      id="clinical-export-start-date"
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      disabled={busy}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinical-export-end-date">Đến ngày</Label>
                    <Input
                      id="clinical-export-end-date"
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(event) => setEndDate(event.target.value)}
                      disabled={busy}
                      className="h-11"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Để trống cả hai trường để xuất toàn bộ dữ liệu được phép truy
                  cập.
                </p>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">
                  Nội dung kèm theo
                </legend>
                {[
                  {
                    id: "clinical-export-reports",
                    label: "Báo cáo đã tạo",
                    checked: includeReports,
                    onChange: setIncludeReports,
                  },
                  {
                    id: "clinical-export-history",
                    label: "Lịch sử chia sẻ và truy cập",
                    checked: includeHistory,
                    onChange: setIncludeHistory,
                  },
                  {
                    id: "clinical-export-audio",
                    label: "Thông tin tệp âm thanh",
                    checked: includeAudio,
                    onChange: setIncludeAudio,
                  },
                ].map((option) => (
                  <label
                    key={option.id}
                    htmlFor={option.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  >
                    <input
                      id={option.id}
                      type="checkbox"
                      checked={option.checked}
                      onChange={(event) =>
                        option.onChange(event.target.checked)
                      }
                      disabled={busy}
                      className="size-4 accent-primary"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
            </>
          )}

          {phase === "creating" || phase === "downloading" ? (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                  {phase === "creating"
                    ? "Backend đang tạo bản xuất có audit..."
                    : "Đang tải tệp đã xác minh..."}
                </span>
                {progress !== null ? <span>{progress}%</span> : null}
              </div>
              <Progress value={progress ?? (phase === "creating" ? 18 : 55)} />
            </div>
          ) : null}

          {phase === "error" ? (
            <Alert variant="destructive" role="alert">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Chưa thể hoàn tất bản xuất</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {phase === "complete" && receipt ? (
            <Alert
              className="border-emerald-600/30 bg-emerald-500/10 text-foreground"
              role="status"
            >
              <CheckCircle2
                aria-hidden="true"
                className="text-emerald-700 dark:text-emerald-300"
              />
              <AlertTitle>Tệp đã được tải xuống</AlertTitle>
              <AlertDescription>
                {receipt.fileName} ·{" "}
                {receipt.recordCount.toLocaleString("vi-VN")} bản ghi
                {receipt.artifactSha256
                  ? ` · SHA-256 ${receipt.artifactSha256.slice(0, 12)}…`
                  : ""}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            {phase === "complete" ? "Đóng" : "Hủy"}
          </Button>
          {phase !== "complete" ? (
            <Button
              id={`portal-${dataset}-export-submit`}
              type="button"
              className="h-11"
              onClick={submit}
              disabled={busy}
            >
              {busy ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Download aria-hidden="true" />
              )}
              {phase === "error" ? "Thử lại" : "Tạo và tải tệp"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
