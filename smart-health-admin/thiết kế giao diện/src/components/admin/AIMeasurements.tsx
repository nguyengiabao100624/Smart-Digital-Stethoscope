import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Download,
  FileAudio,
  Filter,
  Play,
  RefreshCw,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ExportDataDialog } from "./dialogs/ExportDataDialog";
import { PageHeader, StatusBadge, Timeline, WaveformPreview } from "./design-system";
import { itemMotion, listMotion } from "./motion-presets";
import { smartHealthApi, smartHealthAudioUrl, type SmartHealthScan } from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { buildSmartHealthFilename } from "@/lib/filename-utils";

type ScanStatus = "recording" | "uploading" | "processing" | "completed" | "failed";

type ScanSession = {
  id: string;
  patient: string;
  doctor: string;
  device: string;
  region: "Tim" | "Phổi";
  duration: string;
  audioFile: string;
  status: ScanStatus;
  model: string;
  confidence: number | null;
  createdAt: string;
  result: string;
  clipCount: number;
  signalLevel: string;
  noiseLevel: string;
  audioUrl?: string;
};

const STATUS_TABS: Array<{ value: ScanStatus; label: string }> = [
  { value: "recording", label: "Đang ghi" },
  { value: "uploading", label: "Đang tải lên" },
  { value: "processing", label: "Đang xử lý" },
  { value: "completed", label: "Hoàn tất" },
  { value: "failed", label: "Thất bại" },
];

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Chưa có thời gian";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(seconds?: number) {
  if (!Number.isFinite(Number(seconds))) {
    return "00:00";
  }

  const total = Math.max(0, Math.round(Number(seconds)));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function normalizeScanStatus(status?: string): ScanStatus {
  if (status === "recording" || status === "uploading" || status === "processing") {
    return status;
  }
  if (status === "failed" || status === "error") {
    return "failed";
  }
  return "completed";
}

function normalizeConfidence(value?: number | null) {
  if (!Number.isFinite(Number(value))) {
    return null;
  }

  const confidence = Number(value);
  return Math.round(confidence <= 1 ? confidence * 100 : confidence);
}

function mapBackendScan(scan: SmartHealthScan): ScanSession {
  const modeText = `${scan.mode || ""} ${scan.bodySite || ""}`.toLowerCase();
  const isLung =
    modeText.includes("lung") || modeText.includes("phổi") || modeText.includes("resp");
  const audioUrl = smartHealthAudioUrl(scan.audioUrl || `/api/scans/${scan.id}/audio`);
  const audioFile = scan.audioUrl ? audioUrl.split("/").pop() || "audio.wav" : "audio.wav";

  return {
    id: scan.id,
    patient: scan.patient?.name || scan.patientId || "Bệnh nhân chưa xác định",
    doctor: "Backend Smart Health",
    device: scan.deviceId || "Chưa gán thiết bị",
    region: isLung ? "Phổi" : "Tim",
    duration: formatDuration(scan.durationSeconds),
    audioFile,
    status: normalizeScanStatus(scan.status),
    model: "Signal Quality Demo",
    confidence: normalizeConfidence(scan.aiConfidence),
    createdAt: formatDateTime(scan.startedAt || scan.createdAt),
    result: scan.aiSummary || scan.aiLabel || "Backend chưa có kết quả AI chi tiết.",
    clipCount: 0,
    signalLevel: Number.isFinite(Number(scan.rms)) ? `RMS ${Math.round(Number(scan.rms))}` : "--",
    noiseLevel: Number.isFinite(Number(scan.peak)) ? `Peak ${Math.round(Number(scan.peak))}` : "--",
    audioUrl,
  };
}

function renderStatus(status: ScanStatus) {
  if (status === "completed") return <StatusBadge label="Hoàn tất" tone="success" />;
  if (status === "failed") return <StatusBadge label="Thất bại" tone="error" />;
  if (status === "processing") return <StatusBadge label="Đang xử lý" tone="info" pulse />;
  if (status === "uploading") return <StatusBadge label="Đang tải lên" tone="warning" pulse />;
  return <StatusBadge label="Đang ghi" tone="success" pulse />;
}

export function AIMeasurements() {
  const [activeTab, setActiveTab] = useState<ScanStatus>("processing");
  const [selectedScan, setSelectedScan] = useState<ScanSession | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [scans, setScans] = useState<ScanSession[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    smartHealthApi
      .listScans({ limit: 200 })
      .then(({ scans: backendScans }) => {
        if (cancelled) {
          return;
        }
        setScans(backendScans.map(mapBackendScan));
        setBackendError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setScans([]);
          setBackendError(toVietnameseErrorMessage(err, "Không thể tải dữ liệu lượt đo."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(
    () =>
      STATUS_TABS.reduce(
        (acc, tab) => ({
          ...acc,
          [tab.value]: scans.filter((scan) => scan.status === tab.value).length,
        }),
        {} as Record<ScanStatus, number>,
      ),
    [scans],
  );

  const rows = scans.filter((scan) => scan.status === activeTab);

  const rerunAI = () => {
    toast.success("Đã đưa job AI vào hàng đợi xử lý lại");
  };

  const downloadAudio = async () => {
    if (selectedScan?.audioUrl) {
      try {
        const blob = await smartHealthApi.downloadScanAudio(selectedScan.audioUrl);
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = buildSmartHealthFilename({
          kind: "scan-audio",
          ext: "wav",
          scanId: selectedScan.id,
          patientName: selectedScan.patient,
          bodySite: selectedScan.region,
          createdAt: selectedScan.createdAt,
        });
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
        toast.success("Đã tải audio từ backend.");
      } catch (error) {
        toast.error(
          toVietnameseErrorMessage(error, "Không thể tải audio. Vui lòng đăng nhập lại."),
        );
      }
      return;
    }

    toast.error("Lượt đo này chưa có audio để tải xuống");
  };

  return (
    <div className="relative flex h-full flex-col space-y-6">
      <ExportDataDialog open={exportOpen} onOpenChange={setExportOpen} />
      <PageHeader
        eyebrow="AI processing"
        title="Lượt đo & AI Processing"
        description="Theo dõi scan session, audio file, chất lượng tín hiệu, trạng thái xử lý và kết quả AI."
        action={
          <motion.button
            onClick={() => setExportOpen(true)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="group flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <Download className="h-4 w-4 transition-transform group-hover:translate-y-0.5" />
            Xuất dữ liệu
          </motion.button>
        }
      />

      {backendError && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#B45309]">
          Chưa tải được dữ liệu lượt đo từ backend. Trang không dùng dữ liệu mẫu để tránh hiển thị
          sai: {backendError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Lượt đo đã tải"
          value={String(scans.length)}
          tone="primary"
        />
        <MetricCard
          icon={CheckCircle2}
          label="AI hoàn tất"
          value={String(counts.completed)}
          tone="success"
        />
        <MetricCard
          icon={BrainCircuit}
          label="Đang xử lý"
          value={String(counts.processing)}
          tone="warning"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Job thất bại"
          value={String(counts.failed)}
          tone="error"
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border bg-muted/20 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                }`}
              >
                {tab.label}
                <span className="ml-2 rounded-full bg-background/80 px-2 py-0.5 text-xs text-foreground">
                  {counts[tab.value]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Tìm Scan ID, bệnh nhân, thiết bị..."
                className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              <Filter className="h-4 w-4" />
              Lọc
            </button>
          </div>
        </div>

        <motion.div
          variants={listMotion}
          initial="hidden"
          animate="show"
          className="overflow-x-auto scrollbar-subtle"
        >
          <table className="data-table w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3">Scan ID</th>
                <th className="px-5 py-3">Bệnh nhân</th>
                <th className="px-5 py-3">Bác sĩ</th>
                <th className="px-5 py-3">Thiết bị</th>
                <th className="px-5 py-3">Vùng nghe</th>
                <th className="px-5 py-3">Thời lượng</th>
                <th className="px-5 py-3">Audio file</th>
                <th className="px-5 py-3">Processing status</th>
                <th className="px-5 py-3">Model version</th>
                <th className="px-5 py-3">Confidence</th>
                <th className="px-5 py-3">Thời gian tạo</th>
                <th className="sticky right-0 bg-muted px-5 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((scan) => (
                <motion.tr key={scan.id} variants={itemMotion}>
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-primary">
                    {scan.id}
                  </td>
                  <td className="px-5 py-4 font-medium text-foreground">{scan.patient}</td>
                  <td className="px-5 py-4 text-muted-foreground">{scan.doctor}</td>
                  <td className="px-5 py-4 font-mono text-xs">{scan.device}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                      <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                      {scan.region}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{scan.duration}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      <FileAudio className="h-4 w-4 text-primary" />
                      {scan.audioFile}
                    </span>
                  </td>
                  <td className="px-5 py-4">{renderStatus(scan.status)}</td>
                  <td className="px-5 py-4 text-muted-foreground">{scan.model}</td>
                  <td className="px-5 py-4">
                    {scan.confidence ? `${scan.confidence}%` : "Đang chờ"}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{scan.createdAt}</td>
                  <td className="sticky right-0 bg-card px-5 py-4 text-right shadow-[-12px_0_16px_-18px_rgba(15,23,42,0.45)]">
                    <button
                      onClick={() => setSelectedScan(scan)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      aria-label="Xem chi tiết lượt đo"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={12} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không có lượt đo phù hợp trong tab này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </motion.div>
      </div>

      <AnimatePresence>
        {selectedScan && (
          <>
            <motion.div
              key="scan-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedScan(null)}
              className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px]"
            />
            <motion.aside
              key="scan-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col border-l border-border bg-card shadow-2xl"
            >
              <div className="border-b border-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs font-semibold text-primary">
                      {selectedScan.id}
                    </div>
                    <h2 className="mt-1 text-lg font-semibold text-foreground">
                      {selectedScan.patient} / {selectedScan.region}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {renderStatus(selectedScan.status)}
                      <StatusBadge label={selectedScan.model} tone="info" />
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedScan(null)}
                    className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Đóng chi tiết lượt đo"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                <WaveformPreview />

                <section className="grid grid-cols-2 gap-3">
                  <InfoTile label="Audio file" value={selectedScan.audioFile} />
                  <InfoTile label="Thời lượng" value={selectedScan.duration} />
                  <InfoTile label="Thiết bị" value={selectedScan.device} />
                  <InfoTile label="Bác sĩ" value={selectedScan.doctor} />
                </section>

                <section className="rounded-xl border border-border bg-muted/30 p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Quality check</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <InfoTile label="Clip count" value={String(selectedScan.clipCount)} compact />
                    <InfoTile label="Signal level" value={selectedScan.signalLevel} compact />
                    <InfoTile label="Noise level" value={selectedScan.noiseLevel} compact />
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <BrainCircuit className="h-4 w-4 text-primary" />
                    Kết quả AI
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">{selectedScan.result}</p>
                  <div className="mt-3 text-sm">
                    Confidence:{" "}
                    <span className="font-semibold text-foreground">
                      {selectedScan.confidence ? `${selectedScan.confidence}%` : "Chưa có kết quả"}
                    </span>
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 text-sm font-semibold text-foreground">Job retry history</h3>
                  <Timeline
                    items={[
                      {
                        title: "Tạo scan session",
                        time: selectedScan.createdAt,
                        description: "Metadata được ghi vào Firestore.",
                        tone: "primary",
                      },
                      {
                        title: "Tải audio lên storage",
                        time: "Sau ghi âm",
                        description: selectedScan.audioFile,
                        tone: selectedScan.status === "recording" ? "warning" : "success",
                      },
                      {
                        title:
                          selectedScan.status === "failed"
                            ? "AI job thất bại"
                            : "AI job được xử lý",
                        time: "Hàng đợi AI",
                        description: selectedScan.result,
                        tone: selectedScan.status === "failed" ? "error" : "success",
                      },
                    ]}
                  />
                </section>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border bg-muted/30 p-5">
                <button
                  onClick={rerunAI}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <RefreshCw className="h-4 w-4" />
                  Chạy lại AI
                </button>
                <button
                  onClick={downloadAudio}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <Download className="h-4 w-4" />
                  Tải audio
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${toneClass}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-xl font-bold text-foreground md:text-2xl">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </motion.div>
  );
}

function InfoTile({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card ${compact ? "p-3" : "p-4"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
