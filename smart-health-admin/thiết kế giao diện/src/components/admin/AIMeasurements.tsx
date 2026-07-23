import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Download,
  Eye,
  FileAudio,
  RefreshCw,
  Search,
  ShieldAlert,
  Stethoscope,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ExportDataDialog } from "./dialogs/ExportDataDialog";
import { StatusBadge } from "./design-system";
import { REPORT_EXPORT_CAPABILITIES, SCAN_MANAGE_CAPABILITIES } from "./action-permissions";
import { useAdminAccess } from "./useAdminAccess";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  smartHealthApi,
  smartHealthAudioUrl,
  type SmartHealthApiError,
  type SmartHealthScan,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { buildSmartHealthFilename } from "@/lib/filename-utils";
import {
  SMART_HEALTH_SCAN_LIFECYCLE_STATUSES,
  createScanReprocessIdempotencyKey,
  formatSmartHealthAiConfidence,
  normalizeSmartHealthAiConfidence,
  normalizeSmartHealthScanLifecycleStatus,
  type SmartHealthScanLifecycleStatus,
} from "@/lib/scan-lifecycle";

type ScanFilter = "all" | SmartHealthScanLifecycleStatus;

type ScanSession = {
  id: string;
  patientId: string | null;
  patientName: string | null;
  deviceId: string | null;
  bodySite: string | null;
  mode: string | null;
  duration: string | null;
  status: SmartHealthScanLifecycleStatus;
  rawStatus: string | null;
  confidence: number | null;
  aiLabel: string | null;
  aiSummary: string | null;
  doctorNotes: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  createdAtRaw: string | null;
  updatedAt: string | null;
  peak: number | null;
  rms: number | null;
  levelPercent: number | null;
  audioUrl: string | null;
};

type FailureKind = "offline" | "forbidden" | "error";
type FailureState = {
  kind: FailureKind;
  message: string;
};
type RetryableAction = "reprocess" | "download";

const STATUS_PRESENTATION: Record<
  SmartHealthScanLifecycleStatus,
  { label: string; tone: "success" | "warning" | "error" | "info" | "muted" }
> = {
  created: { label: "Đã tạo", tone: "muted" },
  uploading: { label: "Đang tải lên", tone: "info" },
  queued: { label: "Đang chờ xử lý", tone: "warning" },
  processing: { label: "Đang xử lý", tone: "info" },
  completed: { label: "Hoàn tất", tone: "success" },
  failed: { label: "Thất bại", tone: "error" },
  needs_review: { label: "Cần xem lại", tone: "warning" },
  unknown: { label: "Không xác định", tone: "muted" },
};

const STATUS_TABS: Array<{ value: ScanFilter; label: string }> = [
  { value: "all", label: "Tất cả" },
  ...SMART_HEALTH_SCAN_LIFECYCLE_STATUSES.map((status) => ({
    value: status,
    label: STATUS_PRESENTATION[status].label,
  })),
  { value: "unknown", label: STATUS_PRESENTATION.unknown.label },
];

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds?: number): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatMeasurement(value: number | null, suffix = "") {
  return value === null ? "Chưa có dữ liệu" : `${value}${suffix}`;
}

function mapBackendScan(scan: SmartHealthScan): ScanSession {
  const rawStatus = nonEmptyText(scan.processingStatus) || nonEmptyText(scan.status);
  const backendAudioUrl = nonEmptyText(scan.audioUrl);
  const createdAtRaw = nonEmptyText(scan.startedAt) || nonEmptyText(scan.createdAt);

  return {
    id: scan.id,
    patientId: nonEmptyText(scan.patientId),
    patientName: nonEmptyText(scan.patient?.name),
    deviceId: nonEmptyText(scan.deviceId),
    bodySite: nonEmptyText(scan.bodySite),
    mode: nonEmptyText(scan.mode),
    duration: formatDuration(scan.durationSeconds),
    status: normalizeSmartHealthScanLifecycleStatus(rawStatus),
    rawStatus,
    confidence: normalizeSmartHealthAiConfidence(scan.aiConfidence),
    aiLabel: nonEmptyText(scan.aiLabel),
    aiSummary: nonEmptyText(scan.aiSummary),
    doctorNotes: nonEmptyText(scan.doctorNotes),
    startedAt: formatDateTime(scan.startedAt),
    endedAt: formatDateTime(scan.endedAt),
    createdAt: formatDateTime(createdAtRaw),
    createdAtRaw,
    updatedAt: formatDateTime(scan.updatedAt),
    peak: finiteNumber(scan.peak),
    rms: finiteNumber(scan.rms),
    levelPercent: finiteNumber(scan.levelPercent),
    audioUrl: backendAudioUrl ? smartHealthAudioUrl(backendAudioUrl) : null,
  };
}

function renderStatus(status: SmartHealthScanLifecycleStatus, rawStatus?: string | null) {
  const presentation = STATUS_PRESENTATION[status];
  const label =
    status === "unknown" && rawStatus ? `${presentation.label}: ${rawStatus}` : presentation.label;
  return <StatusBadge label={label} tone={presentation.tone} />;
}

function browserIsOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function apiStatus(error: unknown) {
  return (error as SmartHealthApiError | null)?.status;
}

function describeFailure(error: unknown, fallback: string): FailureState {
  if (browserIsOffline()) {
    return {
      kind: "offline",
      message: "Thiết bị đang ngoại tuyến. Hãy kiểm tra kết nối mạng rồi thử lại.",
    };
  }
  if (apiStatus(error) === 403) {
    return {
      kind: "forbidden",
      message: "Tài khoản hiện tại không có quyền thực hiện thao tác này.",
    };
  }
  return { kind: "error", message: toVietnameseErrorMessage(error, fallback) };
}

export function AIMeasurements() {
  const { accessCheckComplete, hasAnyCapability } = useAdminAccess();
  const canManageScans = accessCheckComplete && hasAnyCapability(SCAN_MANAGE_CAPABILITIES);
  const canExportData = accessCheckComplete && hasAnyCapability(REPORT_EXPORT_CAPABILITIES);
  const [activeTab, setActiveTab] = useState<ScanFilter>("all");
  const [selectedScan, setSelectedScan] = useState<ScanSession | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [scans, setScans] = useState<ScanSession[]>([]);
  const [loadFailure, setLoadFailure] = useState<FailureState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [actionFailure, setActionFailure] = useState<FailureState | null>(null);
  const [retryableAction, setRetryableAction] = useState<RetryableAction | null>(null);
  const reprocessInFlightRef = useRef(false);
  const reprocessIdempotencyKeysRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!accessCheckComplete) return;

    let cancelled = false;
    setIsLoading(true);
    setLoadFailure(null);

    if (browserIsOffline()) {
      setLoadFailure({
        kind: "offline",
        message: "Bạn đang ngoại tuyến. Dữ liệu lượt đo chưa thể được tải từ backend.",
      });
      setIsLoading(false);
      return;
    }

    smartHealthApi
      .listScans({ limit: 200 })
      .then(({ scans: backendScans }) => {
        if (cancelled) return;
        const nextScans = backendScans.map(mapBackendScan);
        setScans(nextScans);
        setSelectedScan((current) =>
          current ? nextScans.find((scan) => scan.id === current.id) || null : null,
        );
        setLoadFailure(null);
      })
      .catch((error) => {
        if (cancelled) return;
        const failure = describeFailure(error, "Không thể tải dữ liệu lượt đo từ backend.");
        if (failure.kind === "forbidden") {
          setScans([]);
          setSelectedScan(null);
        }
        setLoadFailure(failure);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessCheckComplete, reloadVersion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reloadWhenOnline = () => setReloadVersion((value) => value + 1);
    window.addEventListener("online", reloadWhenOnline);
    return () => window.removeEventListener("online", reloadWhenOnline);
  }, []);

  useEffect(() => {
    setActionFailure(null);
    setRetryableAction(null);
  }, [selectedScan?.id]);

  const filteredScans = useMemo(() => {
    const keyword = searchTerm.trim().toLocaleLowerCase("vi-VN");
    if (!keyword) return scans;

    return scans.filter((scan) =>
      [
        scan.id,
        scan.patientId,
        scan.patientName,
        scan.deviceId,
        scan.bodySite,
        scan.mode,
        scan.rawStatus,
        scan.aiLabel,
        scan.aiSummary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("vi-VN")
        .includes(keyword),
    );
  }, [scans, searchTerm]);

  const counts = useMemo(() => {
    const initial = Object.fromEntries(
      [...SMART_HEALTH_SCAN_LIFECYCLE_STATUSES, "unknown"].map((status) => [status, 0]),
    ) as Record<SmartHealthScanLifecycleStatus, number>;
    for (const scan of filteredScans) initial[scan.status] += 1;
    return initial;
  }, [filteredScans]);

  const rows =
    activeTab === "all" ? filteredScans : filteredScans.filter((scan) => scan.status === activeTab);
  const pendingCount = counts.created + counts.uploading + counts.queued + counts.processing;
  const attentionCount = counts.failed + counts.needs_review + counts.unknown;
  const metricsUnavailable = scans.length === 0 && (isLoading || loadFailure !== null);
  const actionPending = isReprocessing || isDownloading;
  const canReprocessSelected =
    selectedScan !== null &&
    ["completed", "failed", "needs_review"].includes(selectedScan.status) &&
    Boolean(selectedScan.audioUrl);

  const reloadScans = () => setReloadVersion((value) => value + 1);

  const rerunAI = async () => {
    if (!selectedScan || !canManageScans || reprocessInFlightRef.current) return;
    if (!selectedScan.audioUrl || !canReprocessSelected) {
      setActionFailure({
        kind: "error",
        message: "Backend chưa xác nhận audio ở trạng thái có thể xử lý lại.",
      });
      setRetryableAction(null);
      return;
    }
    if (browserIsOffline()) {
      setActionFailure(describeFailure(null, "Không thể kết nối backend."));
      setRetryableAction("reprocess");
      return;
    }

    const idempotencyKey =
      reprocessIdempotencyKeysRef.current.get(selectedScan.id) ||
      createScanReprocessIdempotencyKey(selectedScan.id);
    reprocessIdempotencyKeysRef.current.set(selectedScan.id, idempotencyKey);
    reprocessInFlightRef.current = true;
    setIsReprocessing(true);
    setActionFailure(null);
    setRetryableAction(null);

    try {
      const { scan } = await smartHealthApi.reprocessScanAi(selectedScan.id, idempotencyKey);
      if (!scan || scan.id !== selectedScan.id) {
        throw new Error("Backend trả về lượt đo không khớp với yêu cầu xử lý lại.");
      }

      const updatedScan = mapBackendScan(scan);
      setScans((current) =>
        current.map((item) => (item.id === updatedScan.id ? updatedScan : item)),
      );
      setSelectedScan(updatedScan);
      setActiveTab("all");
      reprocessIdempotencyKeysRef.current.delete(selectedScan.id);

      if (updatedScan.status === "completed") {
        toast.success("Backend đã hoàn tất phân tích lại chất lượng tín hiệu.");
      } else if (updatedScan.status === "failed") {
        toast.error("Backend xác nhận lượt xử lý lại đã thất bại.");
      } else {
        toast.info(
          `Backend đã nhận yêu cầu. Trạng thái hiện tại: ${STATUS_PRESENTATION[updatedScan.status].label}.`,
        );
      }
    } catch (error) {
      const failure = describeFailure(
        error,
        "Không thể phân tích lại chất lượng tín hiệu cho lượt đo này.",
      );
      setActionFailure(failure);
      setRetryableAction(failure.kind === "forbidden" ? null : "reprocess");
      toast.error(failure.message);
    } finally {
      reprocessInFlightRef.current = false;
      setIsReprocessing(false);
    }
  };

  const downloadAudio = async () => {
    if (!selectedScan || !canManageScans || !selectedScan.audioUrl || isDownloading) return;
    if (browserIsOffline()) {
      setActionFailure(describeFailure(null, "Không thể kết nối backend."));
      setRetryableAction("download");
      return;
    }

    setIsDownloading(true);
    setActionFailure(null);
    setRetryableAction(null);
    try {
      const blob = await smartHealthApi.downloadScanAudio(selectedScan.audioUrl);
      if (blob.size === 0) throw new Error("Backend trả về file audio rỗng.");

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = buildSmartHealthFilename({
        kind: "scan-audio",
        ext: blob.type.includes("wav") ? "wav" : "bin",
        scanId: selectedScan.id,
        patientName: selectedScan.patientName || undefined,
        bodySite: selectedScan.bodySite || undefined,
        createdAt: selectedScan.createdAtRaw || undefined,
      });
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("Đã tải file audio do backend cung cấp.");
    } catch (error) {
      const failure = describeFailure(error, "Không thể tải file audio từ backend.");
      setActionFailure(failure);
      setRetryableAction(failure.kind === "forbidden" ? null : "download");
      toast.error(failure.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const retryFailedAction = () => {
    if (retryableAction === "reprocess") void rerunAI();
    if (retryableAction === "download") void downloadAudio();
  };

  return (
    <div className="relative flex h-full flex-col space-y-6">
      {canExportData && <ExportDataDialog open={exportOpen} onOpenChange={setExportOpen} />}

      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            Theo dõi xử lý
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            Lượt đo và chất lượng tín hiệu
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Trạng thái, chỉ số và kết quả phân tích chất lượng tín hiệu chỉ phản ánh dữ liệu backend
            đã xác nhận.
          </p>
        </div>
        {canExportData && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setExportOpen(true)}
            className="min-h-11 motion-reduce:transition-none"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Xuất dữ liệu
          </Button>
        )}
      </header>

      {loadFailure && (
        <LoadFailurePanel
          failure={loadFailure}
          onRetry={reloadScans}
          hasStaleData={scans.length > 0}
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Lượt đo"
          value={metricsUnavailable ? "—" : String(scans.length)}
          tone="primary"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Hoàn tất"
          value={metricsUnavailable ? "—" : String(counts.completed)}
          tone="success"
        />
        <MetricCard
          icon={BrainCircuit}
          label="Đang trong luồng xử lý"
          value={metricsUnavailable ? "—" : String(pendingCount)}
          tone="warning"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Cần chú ý"
          value={metricsUnavailable ? "—" : String(attentionCount)}
          tone="error"
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ScanFilter)}
        className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        <div className="flex flex-col gap-4 border-b border-border bg-muted/20 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="overflow-x-auto pb-1 scrollbar-subtle">
            <TabsList
              aria-label="Lọc lượt đo theo trạng thái"
              className="h-auto min-h-11 w-max justify-start gap-1 bg-muted/70"
            >
              {STATUS_TABS.map((tab) => {
                const count = tab.value === "all" ? filteredScans.length : counts[tab.value];
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="min-h-11 motion-reduce:transition-none"
                  >
                    {tab.label}
                    <span className="ml-2 rounded-full bg-background/80 px-2 py-0.5 text-xs text-foreground">
                      {count}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-72">
              <label htmlFor="scan-search" className="sr-only">
                Tìm lượt đo
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="scan-search"
                type="search"
                placeholder="Tìm ID, bệnh nhân, thiết bị..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="min-h-11 w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSearchTerm("")}
              disabled={!searchTerm.trim()}
              className="min-h-11 motion-reduce:transition-none"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Xóa tìm
            </Button>
          </div>
        </div>

        <TabsContent
          value={activeTab}
          forceMount
          className="m-0 flex-1 overflow-x-auto scrollbar-subtle"
        >
          <table
            className="data-table w-full whitespace-nowrap text-left text-sm"
            aria-busy={isLoading}
          >
            <caption className="sr-only">
              Danh sách lượt đo được tải từ backend theo trạng thái đã chọn
            </caption>
            <thead>
              <tr>
                <th scope="col" className="px-5 py-3">
                  Scan ID
                </th>
                <th scope="col" className="px-5 py-3">
                  Bệnh nhân
                </th>
                <th scope="col" className="px-5 py-3">
                  Thiết bị
                </th>
                <th scope="col" className="px-5 py-3">
                  Chế độ
                </th>
                <th scope="col" className="px-5 py-3">
                  Vị trí đo
                </th>
                <th scope="col" className="px-5 py-3">
                  Thời lượng
                </th>
                <th scope="col" className="px-5 py-3">
                  Audio
                </th>
                <th scope="col" className="px-5 py-3">
                  Trạng thái
                </th>
                <th scope="col" className="px-5 py-3">
                  Tin cậy phân tích
                </th>
                <th scope="col" className="px-5 py-3">
                  Thời gian tạo
                </th>
                <th scope="col" className="sticky right-0 bg-muted px-5 py-3 text-right">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((scan) => (
                <tr key={scan.id}>
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-primary">
                    {scan.id}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">
                      {scan.patientName || "Chưa có tên"}
                    </div>
                    {scan.patientId && (
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {scan.patientId}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                    {scan.deviceId || "Chưa có dữ liệu"}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {scan.mode || "Chưa có dữ liệu"}
                  </td>
                  <td className="px-5 py-4">
                    {scan.bodySite ? (
                      <span className="inline-flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                        <Stethoscope
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {scan.bodySite}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Chưa có dữ liệu</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {scan.duration || "Chưa có dữ liệu"}
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <FileAudio className="h-4 w-4" aria-hidden="true" />
                      {scan.audioUrl ? "Backend đã xác nhận" : "Chưa có"}
                    </span>
                  </td>
                  <td className="px-5 py-4">{renderStatus(scan.status, scan.rawStatus)}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {formatSmartHealthAiConfidence(scan.confidence)}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {scan.createdAt || "Chưa có dữ liệu"}
                  </td>
                  <td className="sticky right-0 bg-card px-5 py-4 text-right shadow-[-12px_0_16px_-18px_rgba(15,23,42,0.45)]">
                    <button
                      type="button"
                      onClick={() => setSelectedScan(scan)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                      aria-label={`Xem chi tiết lượt đo ${scan.id}`}
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
              {isLoading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="px-5 py-10 text-center text-sm text-muted-foreground"
                    role="status"
                  >
                    Đang tải dữ liệu lượt đo từ backend...
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && !loadFailure && (
                <tr>
                  <td colSpan={11} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không có lượt đo phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TabsContent>
      </Tabs>

      <Dialog
        open={selectedScan !== null}
        onOpenChange={(open) => {
          if (!open && !actionPending) setSelectedScan(null);
        }}
      >
        {selectedScan && (
          <DialogContent
            onEscapeKeyDown={(event) => {
              if (actionPending) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (actionPending) event.preventDefault();
            }}
            className="left-auto right-0 top-0 flex h-dvh w-full max-w-[560px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-l border-border bg-card p-0 shadow-2xl motion-reduce:animate-none motion-reduce:transition-none sm:rounded-none [&>button]:hidden"
          >
            <DialogHeader className="border-b border-border p-5 pr-16 text-left">
              <div className="font-mono text-xs font-semibold text-primary">{selectedScan.id}</div>
              <DialogTitle className="mt-1 leading-snug">
                {selectedScan.patientName || "Chi tiết lượt đo"}
                {selectedScan.bodySite ? ` / ${selectedScan.bodySite}` : ""}
              </DialogTitle>
              <DialogDescription>
                Chi tiết chỉ gồm các trường backend đã trả về cho lượt đo này.
              </DialogDescription>
              <div className="mt-2 flex flex-wrap gap-2">
                {renderStatus(selectedScan.status, selectedScan.rawStatus)}
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  disabled={actionPending}
                  className="absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                  aria-label="Đóng chi tiết lượt đo"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </DialogClose>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
              <section aria-labelledby="scan-source-heading">
                <h3 id="scan-source-heading" className="mb-3 text-sm font-semibold text-foreground">
                  Nguồn lượt đo
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InfoTile label="Patient ID" value={selectedScan.patientId} />
                  <InfoTile label="Thiết bị" value={selectedScan.deviceId} />
                  <InfoTile label="Chế độ" value={selectedScan.mode} />
                  <InfoTile label="Vị trí đo" value={selectedScan.bodySite} />
                  <InfoTile label="Thời lượng" value={selectedScan.duration} />
                  <InfoTile
                    label="Trạng thái backend"
                    value={selectedScan.rawStatus || selectedScan.status}
                  />
                </div>
              </section>

              <section
                className="rounded-xl border border-border bg-muted/25 p-4"
                aria-labelledby="scan-audio-heading"
              >
                <h3
                  id="scan-audio-heading"
                  className="flex items-center gap-2 text-sm font-semibold text-foreground"
                >
                  <FileAudio className="h-4 w-4 text-primary" aria-hidden="true" />
                  Dữ liệu âm thanh
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selectedScan.audioUrl
                    ? "Backend đã cung cấp đường dẫn audio được bảo vệ cho lượt đo này."
                    : "Backend chưa xác nhận audio khả dụng; giao diện không tự tạo đường dẫn hoặc waveform thay thế."}
                </p>
              </section>

              <section aria-labelledby="scan-quality-heading">
                <h3
                  id="scan-quality-heading"
                  className="mb-3 text-sm font-semibold text-foreground"
                >
                  Chỉ số tín hiệu backend
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <InfoTile label="RMS" value={formatMeasurement(selectedScan.rms)} compact />
                  <InfoTile label="Peak" value={formatMeasurement(selectedScan.peak)} compact />
                  <InfoTile
                    label="Mức tín hiệu"
                    value={formatMeasurement(selectedScan.levelPercent, "%")}
                    compact
                  />
                </div>
              </section>

              <section
                className="rounded-xl border border-border bg-card p-4"
                aria-labelledby="scan-ai-heading"
              >
                <h3
                  id="scan-ai-heading"
                  className="flex items-center gap-2 text-sm font-semibold text-foreground"
                >
                  <BrainCircuit className="h-4 w-4 text-primary" aria-hidden="true" />
                  Kết quả phân tích chất lượng tín hiệu
                </h3>
                {selectedScan.aiSummary ||
                selectedScan.aiLabel ||
                selectedScan.confidence !== null ? (
                  <div className="mt-3 space-y-3 text-sm">
                    {selectedScan.aiSummary && (
                      <p className="leading-6 text-muted-foreground">{selectedScan.aiSummary}</p>
                    )}
                    {selectedScan.aiLabel && (
                      <InfoTile
                        label="Nhãn chất lượng từ backend"
                        value={selectedScan.aiLabel}
                        compact
                      />
                    )}
                    <div>
                      Độ tin cậy phân tích:{" "}
                      <span className="font-semibold text-foreground">
                        {formatSmartHealthAiConfidence(selectedScan.confidence)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Backend chưa cung cấp kết quả phân tích chất lượng tín hiệu cho lượt đo này.
                  </p>
                )}
                <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                  Bộ quy tắc này chỉ đánh giá chất lượng tín hiệu, không phải chẩn đoán và không
                  thay thế kết luận của người có chuyên môn.
                </p>
              </section>

              {selectedScan.doctorNotes && (
                <section aria-labelledby="scan-note-heading">
                  <h3 id="scan-note-heading" className="mb-2 text-sm font-semibold text-foreground">
                    Ghi chú chuyên môn
                  </h3>
                  <p className="rounded-lg border border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
                    {selectedScan.doctorNotes}
                  </p>
                </section>
              )}

              <section aria-labelledby="scan-time-heading">
                <h3 id="scan-time-heading" className="mb-3 text-sm font-semibold text-foreground">
                  Mốc thời gian backend
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <InfoTile label="Bắt đầu" value={selectedScan.startedAt} />
                  <InfoTile label="Kết thúc" value={selectedScan.endedAt} />
                  <InfoTile label="Tạo" value={selectedScan.createdAt} />
                  <InfoTile label="Cập nhật" value={selectedScan.updatedAt} />
                </div>
              </section>

              {actionFailure && (
                <ActionFailurePanel
                  failure={actionFailure}
                  canRetry={retryableAction !== null}
                  onRetry={retryFailedAction}
                />
              )}
            </div>

            {canManageScans && (
              <div className="border-t border-border bg-muted/25 p-5">
                {selectedScan.audioUrl ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void rerunAI()}
                      disabled={!canReprocessSelected || actionPending}
                      className="min-h-11 motion-reduce:transition-none"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${isReprocessing ? "animate-spin motion-reduce:animate-none" : ""}`}
                        aria-hidden="true"
                      />
                      {isReprocessing ? "Đang gửi yêu cầu" : "Phân tích lại tín hiệu"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void downloadAudio()}
                      disabled={actionPending}
                      className="min-h-11 motion-reduce:transition-none"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      {isDownloading ? "Đang tải audio" : "Tải audio"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Không có thao tác audio vì backend chưa xác nhận file khả dụng.
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function LoadFailurePanel({
  failure,
  onRetry,
  hasStaleData,
}: {
  failure: FailureState;
  onRetry: () => void;
  hasStaleData: boolean;
}) {
  const Icon =
    failure.kind === "offline"
      ? WifiOff
      : failure.kind === "forbidden"
        ? ShieldAlert
        : AlertTriangle;
  const title =
    failure.kind === "offline"
      ? "Ngoại tuyến"
      : failure.kind === "forbidden"
        ? "Không có quyền truy cập dữ liệu lượt đo"
        : "Không thể tải dữ liệu lượt đo";

  return (
    <section
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-warning/25 bg-warning/10 p-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{failure.message}</p>
          {hasStaleData && (
            <p className="mt-1 text-xs text-muted-foreground">
              Dữ liệu đang hiển thị là lần tải gần nhất và có thể đã cũ.
            </p>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="min-h-11 shrink-0 motion-reduce:transition-none"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Thử lại
      </Button>
    </section>
  );
}

function ActionFailurePanel({
  failure,
  canRetry,
  onRetry,
}: {
  failure: FailureState;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <section role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
      <div className="flex gap-3">
        {failure.kind === "offline" ? (
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {failure.kind === "forbidden" ? "Không có quyền thực hiện" : "Thao tác chưa hoàn tất"}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{failure.message}</p>
          {canRetry && (
            <Button
              type="button"
              variant="outline"
              onClick={onRetry}
              className="mt-3 min-h-11 motion-reduce:transition-none"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử lại
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone: "primary" | "success" | "warning" | "error";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-warning/10 text-warning"
        : tone === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-primary/10 text-primary";

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${toneClass}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-foreground md:text-2xl">{value}</div>
        <div className="text-sm leading-5 text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function InfoTile({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string | null;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card ${compact ? "p-3" : "p-4"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">
        {value || "Chưa có dữ liệu"}
      </div>
    </div>
  );
}
