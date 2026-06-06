import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  HardDrive,
  Database,
  Files,
  FolderPlus,
  UploadCloud,
  Download,
  Search,
  Filter,
  Image as ImageIcon,
  AudioLines,
  FileText,
  Video,
  File as FileIcon,
  MoreVertical,
  Lock,
  Globe2,
  Shield,
  Trash2,
  Share2,
  Eye,
  ChevronRight,
  AlertTriangle,
  ArrowUpRight,
  Archive,
  Bot,
  BrainCircuit,
  FileAudio,
  FileCheck,
  TrendingUp,
  Activity as ActivityIcon,
  AudioWaveform,
  Stethoscope,
  UserRound,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { UploadFileDialog } from "./dialogs/UploadFileDialog";
import { CreateBucketDialog } from "./dialogs/CreateBucketDialog";
import { ExportReportDialog } from "./dialogs/ExportReportDialog";
import { FileDetailDialog, type StorageFile } from "./dialogs/FileDetailDialog";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { ADMIN_TABLE_PAGE_SIZE, PaginationFooter, paginateItems } from "./PaginationFooter";
import {
  smartHealthApi,
  type SmartHealthChartPoint,
  type SmartHealthChartSlice,
  type SmartHealthClinicUsage,
  type SmartHealthStorageActivity,
  type SmartHealthStorageBucket,
  type SmartHealthTopBucket,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { buildSmartHealthFilename } from "@/lib/filename-utils";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CapabilityGate, useAdminAccess } from "./AdminAccessContext";
import {
  REPORT_EXPORT_CAPABILITIES,
  STORAGE_MANAGE_CAPABILITIES,
} from "./action-permissions";

type IconComponent = React.ComponentType<{ className?: string }>;

type StorageStatsData = {
  totalUsed: number;
  totalQuota: number;
  totalFiles: number;
  buckets: SmartHealthStorageBucket[];
  growthData: SmartHealthChartPoint[];
  typeData: SmartHealthChartSlice[];
  topBuckets: SmartHealthTopBucket[];
  recentActivity: SmartHealthStorageActivity[];
  topClinicUsage: SmartHealthClinicUsage[];
};

type StorageConfirmAction = {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  run: () => Promise<void>;
};

const DEFAULT_STORAGE_STATS: StorageStatsData = {
  totalUsed: 0,
  totalQuota: 0,
  totalFiles: 0,
  buckets: [],
  growthData: [],
  typeData: [],
  topBuckets: [],
  recentActivity: [],
  topClinicUsage: [],
};

const TYPE_ICON: Record<string, IconComponent> = {
  dcm: ImageIcon,
  jpg: ImageIcon,
  png: ImageIcon,
  wav: AudioLines,
  mp3: AudioLines,
  pdf: FileText,
  mp4: Video,
  bin: FileIcon,
};

const BUCKET_STYLES: Record<
  string,
  { label: string; icon: IconComponent; gradient: string; soft: string; accent: string }
> = {
  "medical-images": {
    label: "Hình ảnh y khoa",
    icon: ImageIcon,
    gradient: "linear-gradient(135deg, #0B5C9A 0%, #0EA5E9 100%)",
    soft: "rgba(14, 165, 233, 0.10)",
    accent: "#0B5C9A",
  },
  "heart-audio": {
    label: "Âm thanh tim/phổi",
    icon: AudioLines,
    gradient: "linear-gradient(135deg, #00A896 0%, #10B981 100%)",
    soft: "rgba(0, 168, 150, 0.10)",
    accent: "#00A896",
  },
  "patient-reports": {
    label: "Báo cáo bệnh nhân",
    icon: FileText,
    gradient: "linear-gradient(135deg, #F59E0B 0%, #F97316 100%)",
    soft: "rgba(245, 158, 11, 0.12)",
    accent: "#B45309",
  },
  "device-firmware": {
    label: "Firmware thiết bị",
    icon: Shield,
    gradient: "linear-gradient(135deg, #334155 0%, #0B5C9A 100%)",
    soft: "rgba(15, 23, 42, 0.08)",
    accent: "#334155",
  },
  avatars: {
    label: "Ảnh đại diện",
    icon: ImageIcon,
    gradient: "linear-gradient(135deg, #EF4444 0%, #F97316 100%)",
    soft: "rgba(239, 68, 68, 0.10)",
    accent: "#EF4444",
  },
};

function getBucketStyle(bucketId: string) {
  return (
    BUCKET_STYLES[bucketId] || {
      label: "Kho dữ liệu",
      icon: Database,
      gradient: "linear-gradient(135deg, #0B5C9A 0%, #00A896 100%)",
      soft: "rgba(11, 92, 154, 0.10)",
      accent: "#0B5C9A",
    }
  );
}

const ICON_STYLES: Record<string, { label: string; icon: IconComponent }> = {
  audio: { label: "Âm thanh", icon: FileAudio },
  waveform: { label: "Waveform", icon: AudioWaveform },
  image: { label: "Hình ảnh", icon: ImageIcon },
  dicom: { label: "DICOM", icon: Stethoscope },
  report: { label: "Báo cáo", icon: FileText },
  document: { label: "Tài liệu", icon: FileText },
  firmware: { label: "Firmware", icon: Shield },
  avatar: { label: "Ảnh đại diện", icon: UserRound },
  ai: { label: "AI", icon: BrainCircuit },
  export: { label: "Export", icon: FileCheck },
  backup: { label: "Backup", icon: Archive },
  audit: { label: "Audit", icon: HardDrive },
  consent: { label: "Consent", icon: Bot },
  video: { label: "Video", icon: Video },
  database: { label: "Dữ liệu", icon: Database },
};

const COLOR_STYLES: Record<string, { gradient: string; soft: string; accent: string }> = {
  blue: { gradient: "linear-gradient(135deg, #0B5C9A 0%, #0EA5E9 100%)", soft: "rgba(14, 165, 233, 0.10)", accent: "#0B5C9A" },
  emerald: { gradient: "linear-gradient(135deg, #00A896 0%, #10B981 100%)", soft: "rgba(0, 168, 150, 0.10)", accent: "#00A896" },
  amber: { gradient: "linear-gradient(135deg, #F59E0B 0%, #F97316 100%)", soft: "rgba(245, 158, 11, 0.12)", accent: "#B45309" },
  rose: { gradient: "linear-gradient(135deg, #EF4444 0%, #F97316 100%)", soft: "rgba(239, 68, 68, 0.10)", accent: "#EF4444" },
  violet: { gradient: "linear-gradient(135deg, #7C3AED 0%, #0B5C9A 100%)", soft: "rgba(124, 58, 237, 0.10)", accent: "#7C3AED" },
  slate: { gradient: "linear-gradient(135deg, #334155 0%, #0B5C9A 100%)", soft: "rgba(15, 23, 42, 0.08)", accent: "#334155" },
  teal: { gradient: "linear-gradient(135deg, #0F766E 0%, #00A896 100%)", soft: "rgba(15, 118, 110, 0.10)", accent: "#0F766E" },
  cyan: { gradient: "linear-gradient(135deg, #0EA5E9 0%, #00A896 100%)", soft: "rgba(14, 165, 233, 0.10)", accent: "#0EA5E9" },
};

function getBucketStyleForBucket(bucket: SmartHealthStorageBucket) {
  const base = getBucketStyle(bucket.id);
  const iconStyle = bucket.iconKey ? ICON_STYLES[bucket.iconKey] : undefined;
  const colorStyle = bucket.colorKey ? COLOR_STYLES[bucket.colorKey] : undefined;
  return {
    label: bucket.name || iconStyle?.label || base.label,
    icon: iconStyle?.icon || base.icon,
    gradient: colorStyle?.gradient || base.gradient,
    soft: colorStyle?.soft || base.soft,
    accent: colorStyle?.accent || base.accent,
  };
}

function formatGB(gb: number) {
  if (!Number.isFinite(gb) || gb <= 0) return "0 GB";
  if (gb < 1) return `${Math.max(1, Math.round(gb * 1024))} MB`;
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

export function Storage() {
  const { hasAnyCapability } = useAdminAccess();
  const canManageStorage = hasAnyCapability(STORAGE_MANAGE_CAPABILITIES);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bucketOpen, setBucketOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<StorageFile | null>(null);
  const [search, setSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<StorageConfirmAction | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [statsData, setStatsData] = useState<StorageStatsData | null>(null);
  const [filesData, setFilesData] = useState<StorageFile[]>([]);

  const loadStorage = React.useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const [statsRes, filesRes] = await Promise.all([
        smartHealthApi.getStorageStats(),
        smartHealthApi.listStorageFiles(),
      ]);
      setStatsData(statsRes);
      setFilesData(filesRes.files);
      setSelectedIds([]);
      setError(null);
    } catch (err) {
      setError(toVietnameseErrorMessage(err, "Không thể tải dữ liệu lưu trữ."));
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all([smartHealthApi.getStorageStats(), smartHealthApi.listStorageFiles()])
      .then(([statsRes, filesRes]) => {
        if (!cancelled) {
          setStatsData(statsRes);
          setFilesData(filesRes.files);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(toVietnameseErrorMessage(err, "Không thể tải dữ liệu lưu trữ."));
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

  const downloadStorageFile = async (file: StorageFile) => {
    try {
      const blob = await smartHealthApi.downloadStorageFile(file.id, file.downloadUrl);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = buildSmartHealthFilename({
        kind: "storage",
        bucket: file.bucket,
        originalName: file.name,
        id: file.id,
        createdAt: file.createdAt || file.uploadedAt,
        ext: file.type || file.name.split(".").pop() || "bin",
      });
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success(`Đã tải ${file.name}`);
    } catch (err) {
      toast.error(toVietnameseErrorMessage(err, "Không thể tải tệp. Vui lòng đăng nhập lại."));
    }
  };

  const createBucket = async (payload: Parameters<typeof smartHealthApi.createStorageBucket>[0]) => {
    if (!canManageStorage) {
      toast.error("Tai khoan khong co quyen quan ly luu tru.");
      return;
    }
    await smartHealthApi.createStorageBucket(payload);
    toast.success("Đã tạo bucket");
    await loadStorage(false);
  };

  const uploadStorageFile = async (payload: Parameters<typeof smartHealthApi.uploadStorageFile>[0]) => {
    if (!canManageStorage) {
      toast.error("Tai khoan khong co quyen quan ly luu tru.");
      return;
    }
    await smartHealthApi.uploadStorageFile(payload);
    await loadStorage(false);
  };

  const runConfirmAction = async () => {
    const action = confirmAction;
    if (!action) return;
    setConfirmLoading(true);
    setConfirmError("");
    try {
      await action.run();
      setConfirmAction(null);
    } catch (err) {
      const message = toVietnameseErrorMessage(err, "Không thể hoàn tất thao tác.");
      setConfirmError(message);
      toast.error(message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const deleteStorageFile = async (file: StorageFile) => {
    if (!canManageStorage) {
      toast.error("Tai khoan khong co quyen quan ly luu tru.");
      return;
    }
    await smartHealthApi.deleteStorageFile(file.id);
    toast.success(`Đã xóa ${file.name}`);
    setSelectedFile(null);
    await loadStorage(false);
  };

  const shareStorageFile = async (file: StorageFile) => {
    if (!canManageStorage) {
      toast.error("Tai khoan khong co quyen quan ly luu tru.");
      return "";
    }
    const { shareUrl, url } = await smartHealthApi.shareStorageFile(file.id);
    const link = shareUrl || url;
    await navigator.clipboard.writeText(link);
    toast.success("Đã sao chép liên kết chia sẻ");
    return link;
  };

  const deleteBucket = (bucket: SmartHealthStorageBucket) => {
    if (!canManageStorage) {
      toast.error("Tai khoan khong co quyen quan ly luu tru.");
      return;
    }
    if (bucket.system) {
      toast.error("Bucket hệ thống không thể xóa");
      return;
    }
    setConfirmError("");
    setConfirmAction({
      title: "Xóa bucket lưu trữ",
      description: (
        <span>
          Bạn có chắc chắn muốn xóa bucket <strong>{bucket.id}</strong>? Chỉ bucket rỗng mới xóa được.
        </span>
      ),
      confirmLabel: "Xóa bucket",
      run: async () => {
        await smartHealthApi.deleteStorageBucket(bucket.id);
        toast.success(`Đã xóa bucket ${bucket.id}`);
        await loadStorage(false);
      },
    });
  };

  const requestDeleteSelectedFiles = () => {
    const selectedFiles = filesData.filter((file) => selectedIds.includes(file.id));
    if (selectedFiles.length === 0) return;
    setConfirmError("");
    setConfirmAction({
      title: "Xóa các tệp đã chọn",
      description: (
        <span>
          Bạn có chắc chắn muốn xóa {selectedFiles.length} tệp đã chọn? Hành động này không thể hoàn tác.
        </span>
      ),
      confirmLabel: "Xóa tệp đã chọn",
      run: async () => {
        await Promise.all(selectedFiles.map((file) => smartHealthApi.deleteStorageFile(file.id)));
        toast.success(`Đã xóa ${selectedFiles.length} tệp`);
        setSelectedIds([]);
        await loadStorage(false);
      },
    });
  };

  const {
    totalUsed = 0,
    totalQuota = 0,
    totalFiles = 0,
    buckets = [],
    growthData = [],
    typeData = [],
    topBuckets = [],
    recentActivity = [],
    topClinicUsage = [],
  } = statsData || DEFAULT_STORAGE_STATS;

  const filteredFiles = useMemo(() => {
    return filesData.filter((f) => {
      if (bucketFilter !== "all" && f.bucket !== bucketFilter) return false;
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [bucketFilter, filesData, search, typeFilter]);

  React.useEffect(() => {
    setPage(1);
  }, [bucketFilter, search, typeFilter, filesData.length]);

  const pagedFiles = useMemo(
    () => paginateItems(filteredFiles, page, ADMIN_TABLE_PAGE_SIZE),
    [filteredFiles, page],
  );

  const toggleSelect = (id: string) =>
    setSelectedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const toggleSelectAll = () =>
    setSelectedIds((p) =>
      pagedFiles.every((file) => p.includes(file.id))
        ? p.filter((id) => !pagedFiles.some((file) => file.id === id))
        : Array.from(new Set([...p, ...pagedFiles.map((file) => file.id)])),
    );

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Đang tải dữ liệu lưu trữ...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card">
        <div className="flex flex-col items-center gap-3 max-w-md text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UploadFileDialog
        open={canManageStorage && uploadOpen}
        onOpenChange={setUploadOpen}
        buckets={buckets}
        onUpload={uploadStorageFile}
      />
      <CreateBucketDialog
        open={canManageStorage && bucketOpen}
        onOpenChange={setBucketOpen}
        onCreate={createBucket}
      />
      <ExportReportDialog
        open={hasAnyCapability(REPORT_EXPORT_CAPABILITIES) && exportOpen}
        onOpenChange={setExportOpen}
      />
      <FileDetailDialog
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
        onDownload={downloadStorageFile}
        onShare={shareStorageFile}
        onDelete={deleteStorageFile}
      />
      <ConfirmActionDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open && !confirmLoading) {
            setConfirmAction(null);
            setConfirmError("");
          }
        }}
        title={confirmAction?.title || "Xác nhận thao tác"}
        description={confirmAction?.description || "Bạn có chắc chắn muốn thực hiện thao tác này?"}
        confirmLabel={confirmAction?.confirmLabel || "Xác nhận"}
        tone="danger"
        loading={confirmLoading}
        error={confirmError}
        onConfirm={runConfirmAction}
      />
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Quản lý Lưu trữ</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Theo dõi bucket, tệp y khoa, băng thông và quota của toàn hệ thống Smart Health
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CapabilityGate capabilities={STORAGE_MANAGE_CAPABILITIES}>
            <button
              onClick={() => setBucketOpen(true)}
              className="flex items-center gap-2 bg-card border border-border text-foreground px-3 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              <FolderPlus className="w-4 h-4" /> Tạo bucket
            </button>
          </CapabilityGate>
          <CapabilityGate capabilities={REPORT_EXPORT_CAPABILITIES}>
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-2 bg-card border border-border text-foreground px-3 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              <Download className="w-4 h-4" /> Xuất báo cáo
            </button>
          </CapabilityGate>
          <CapabilityGate capabilities={STORAGE_MANAGE_CAPABILITIES}>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              <UploadCloud className="w-4 h-4" /> Tải lên tệp
            </motion.button>
          </CapabilityGate>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPI
          title="Dung lượng đã dùng"
          value={formatGB(totalUsed)}
          sub={`/ ${formatGB(totalQuota)}`}
          icon={HardDrive}
          progress={(totalUsed / totalQuota) * 100}
        />
        <KPI
          title="Tổng tệp"
          value={totalFiles.toLocaleString("vi-VN")}
          icon={Files}
          trend="+1.2k hôm nay"
        />
        <KPI title="Số bucket" value={String(buckets.length)} icon={Database} trend="+1 tuần này" />
        <KPI title="Tải lên (24h)" value="1,284" icon={UploadCloud} trend="+18%" />
        <KPI title="Băng thông tháng" value="3.8 TB" icon={TrendingUp} trend="+0.4 TB" />
        <KPI title="Tệp công khai" value="4,280" icon={Globe2} trend="2.3%" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Tăng trưởng dung lượng (30 ngày)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tổng dung lượng đã sử dụng tích lũy theo ngày
              </p>
            </div>
            <span className="text-xs font-medium text-success inline-flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> +12.4%
            </span>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-storage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0B5C9A" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0B5C9A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0" }}
                  formatter={(value: number | string) => [`${value} GB`, "Dung lượng"]}
                />
                <Area
                  type="monotone"
                  dataKey="gb"
                  stroke="#0B5C9A"
                  strokeWidth={2}
                  fill="url(#grad-storage)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-1">Phân bổ theo loại</h2>
          <p className="text-xs text-muted-foreground mb-3">Tổng {formatGB(totalUsed)}</p>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {typeData.map((e: SmartHealthChartSlice) => (
                    <Cell key={e.name} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | string) => `${value} GB`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {typeData.map((t: SmartHealthChartSlice) => (
              <div key={t.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                <span className="text-muted-foreground flex-1">{t.name}</span>
                <span className="font-medium">{t.value} GB</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Buckets grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Các bucket</h2>
          <CapabilityGate capabilities={STORAGE_MANAGE_CAPABILITIES}>
            <button
              onClick={() => setBucketOpen(true)}
              className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              <FolderPlus className="w-3.5 h-3.5" /> Bucket mới
            </button>
          </CapabilityGate>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {buckets.map((b: SmartHealthStorageBucket, i: number) => {
            const pct = (b.used / b.quota) * 100;
            const isWarn = pct >= 80;
            const bucketStyle = getBucketStyleForBucket(b);
            const BucketIcon = bucketStyle.icon;
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative overflow-hidden bg-card border border-border rounded-xl p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all group"
                style={{
                  background: `linear-gradient(180deg, ${bucketStyle.soft} 0%, rgba(255,255,255,0) 46%), #FFFFFF`,
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-white shadow-sm ring-1 ring-white/50"
                    style={{ background: bucketStyle.gradient }}
                  >
                    <BucketIcon className="w-5 h-5" />
                  </div>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        className="min-w-[160px] bg-popover border border-border rounded-md shadow-lg p-1 z-50"
                      >
                        {canManageStorage && (
                          <DropdownMenu.Item
                            onClick={() => setUploadOpen(true)}
                            className="text-sm px-2 py-1.5 rounded hover:bg-accent cursor-pointer flex items-center gap-2 outline-none"
                          >
                            <UploadCloud className="w-4 h-4" /> Tải lên
                          </DropdownMenu.Item>
                        )}
                        <DropdownMenu.Item className="text-sm px-2 py-1.5 rounded hover:bg-accent cursor-pointer flex items-center gap-2 outline-none">
                          <Eye className="w-4 h-4" /> Xem chi tiết
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onClick={() => void loadStorage(false)}
                          className="text-sm px-2 py-1.5 rounded hover:bg-accent cursor-pointer flex items-center gap-2 outline-none"
                        >
                          <ActivityIcon className="w-4 h-4" /> Đồng bộ
                        </DropdownMenu.Item>
                        {canManageStorage && (
                          <>
                            <DropdownMenu.Separator className="h-px bg-border my-1" />
                            <DropdownMenu.Item
                              onClick={() => void deleteBucket(b)}
                              disabled={Boolean(b.system)}
                              className="text-sm px-2 py-1.5 rounded hover:bg-destructive hover:text-destructive-foreground text-destructive cursor-pointer flex items-center gap-2 outline-none"
                            >
                              <Trash2 className="w-4 h-4" /> Xoá bucket
                            </DropdownMenu.Item>
                          </>
                        )}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
                <div className="text-sm font-semibold text-foreground truncate">
                  {bucketStyle.label}
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground truncate">
                  {b.id}
                </div>
                <div className="text-xs text-muted-foreground mt-2 line-clamp-2 min-h-[32px]">
                  {b.description || b.desc}
                </div>

                <div className="mt-3 mb-1 flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-foreground">{formatGB(b.used)}</span>
                  <span className="text-muted-foreground">
                    {Math.round(pct)}% / {formatGB(b.quota)}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: isWarn ? "#F59E0B" : bucketStyle.accent,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground mt-3">
                  <span>{b.files.toLocaleString("vi-VN")} tệp</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      b.visibility === "public"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-emerald-500/10 text-emerald-600"
                    }`}
                  >
                    {b.visibility === "public" ? (
                      <Globe2 className="w-3 h-3" />
                    ) : (
                      <Lock className="w-3 h-3" />
                    )}
                    {b.visibility === "public" ? "Public" : "Private"}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Files + side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Files table */}
        <div className="xl:col-span-2 bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tệp..."
                className="w-full pl-9 pr-3 py-1.5 bg-card border border-border rounded-md text-sm outline-none focus:border-ring"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={bucketFilter}
                onChange={(e) => setBucketFilter(e.target.value)}
                className="px-3 py-1.5 bg-card border border-border rounded-md text-sm outline-none"
              >
                <option value="all">Mọi bucket</option>
                {buckets.map((b: SmartHealthStorageBucket) => (
                  <option key={b.id} value={b.id}>
                    {b.id}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 bg-card border border-border rounded-md text-sm outline-none"
              >
                <option value="all">Mọi loại</option>
                <option value="dcm">DICOM</option>
                <option value="wav">Audio</option>
                <option value="pdf">PDF</option>
                <option value="mp4">Video</option>
                <option value="jpg">Hình ảnh</option>
              </select>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-sm hover:bg-muted">
                <Filter className="w-4 h-4" /> Lọc nâng cao
              </button>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="px-4 py-2 bg-primary/10 border-b border-primary/20 flex items-center justify-between text-sm">
              <span className="font-medium text-primary">Đã chọn {selectedIds.length} tệp</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    filesData
                      .filter((file) => selectedIds.includes(file.id))
                      .forEach((file) => void downloadStorageFile(file));
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-card border border-border rounded text-xs hover:bg-muted"
                >
                  <Download className="w-3.5 h-3.5" /> Tai da chon
                </button>
                <CapabilityGate capabilities={STORAGE_MANAGE_CAPABILITIES}>
                  <button
                    onClick={requestDeleteSelectedFiles}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-destructive text-destructive-foreground rounded text-xs hover:bg-destructive/90"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xoá
                  </button>
                </CapabilityGate>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={
                        pagedFiles.length > 0 && pagedFiles.every((file) => selectedIds.includes(file.id))
                      }
                      onChange={toggleSelectAll}
                      className="rounded border-border"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Tên tệp</th>
                  <th className="px-4 py-2.5 font-medium hidden md:table-cell">Bucket</th>
                  <th className="px-4 py-2.5 font-medium">Kích thước</th>
                  <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Người tải</th>
                  <th className="px-4 py-2.5 font-medium hidden md:table-cell">Ngày tải</th>
                  <th className="px-4 py-2.5 font-medium">Quyền</th>
                  <th className="px-4 py-2.5 font-medium text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedFiles.map((f) => {
                  const Icon = TYPE_ICON[f.type] || FileIcon;
                  return (
                    <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(f.id)}
                          onChange={() => toggleSelect(f.id)}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedFile(f)}
                          className="flex items-center gap-2 text-left hover:text-primary transition-colors"
                        >
                          <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate max-w-[200px]">{f.name}</div>
                            <div className="text-xs text-muted-foreground uppercase">{f.type}</div>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="font-mono text-xs px-2 py-0.5 bg-muted rounded">
                          {f.bucket}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{f.size}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                        {f.uploader}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                        {f.uploadedAt}
                      </td>
                      <td className="px-4 py-3">
                        {f.visibility === "public" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-600">
                            <Globe2 className="w-3 h-3" /> Public
                          </span>
                        ) : f.visibility === "encrypted" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-violet-500/10 text-violet-600">
                            <Shield className="w-3 h-3" /> Mã hoá
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-600">
                            <Lock className="w-3 h-3" /> Private
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => setSelectedFile(f)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                            title="Xem"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => downloadStorageFile(f)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                            title="Tải xuống"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <CapabilityGate capabilities={STORAGE_MANAGE_CAPABILITIES}>
                            <button
                              onClick={() => void shareStorageFile(f)}
                              className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                              title="Chia sẻ"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          </CapabilityGate>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredFiles.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-muted-foreground text-sm"
                    >
                      Không tìm thấy tệp phù hợp
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationFooter
            page={page}
            totalItems={filteredFiles.length}
            sourceTotalItems={filesData.length}
            itemLabel="tệp"
            onPageChange={setPage}
          />
        </div>

        {/* Side column */}
        <div className="space-y-6">
          {/* Alerts */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" /> Cảnh báo dung lượng
              </h2>
            </div>
            <div className="space-y-2.5">
              {buckets
                .filter((b: SmartHealthStorageBucket) => b.used / b.quota >= 0.7)
                .map((b: SmartHealthStorageBucket) => {
                  const pct = (b.used / b.quota) * 100;
                  const danger = pct >= 90;
                  return (
                    <div
                      key={b.id}
                      className={`rounded-lg p-3 border ${
                        danger
                          ? "bg-destructive/5 border-destructive/30"
                          : "bg-warning/5 border-warning/30"
                      }`}
                    >
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono font-medium">{b.id}</span>
                        <span
                          className={`text-xs font-semibold ${danger ? "text-destructive" : "text-warning"}`}
                        >
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                        <div
                          className={`h-full ${danger ? "bg-destructive" : "bg-warning"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatGB(b.used)} / {formatGB(b.quota)} —{" "}
                        {danger ? "Cần mở rộng quota gấp" : "Đang gần đầy"}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Top bucket bar */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-3">Top bucket theo dung lượng</h2>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topBuckets} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#64748B" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    width={110}
                  />
                  <Tooltip
                    formatter={(value: number | string) => `${value} GB`}
                    contentStyle={{ borderRadius: 8 }}
                  />
                  <Bar dataKey="gb" fill="#0B5C9A" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-3">Hoạt động gần ??y</h2>
            <div className="space-y-3">
              {recentActivity.map((a: SmartHealthStorageActivity, i: number) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      a.action === "upload"
                        ? "bg-primary/10 text-primary"
                        : a.action === "delete"
                          ? "bg-destructive/10 text-destructive"
                          : a.action === "share"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-success/10 text-success"
                    }`}
                  >
                    {a.action === "upload" ? (
                      <UploadCloud className="w-3.5 h-3.5" />
                    ) : a.action === "delete" ? (
                      <Trash2 className="w-3.5 h-3.5" />
                    ) : a.action === "share" ? (
                      <Share2 className="w-3.5 h-3.5" />
                    ) : (
                      <Shield className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium">{a.who}</span>{" "}
                      <span className="text-muted-foreground">{a.what}</span>{" "}
                      <span className="font-mono text-xs">{a.target}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top clinic */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-3">Quota theo phòng khám</h2>
            <div className="space-y-3">
              {topClinicUsage.map((c: SmartHealthClinicUsage) => (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground font-medium">{c.gb} GB</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${c.percent * 3.5}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({
  title,
  value,
  sub,
  icon: Icon,
  trend,
  progress,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: IconComponent;
  trend?: string;
  progress?: number;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className="text-xs font-medium text-success inline-flex items-center gap-0.5">
            <ArrowUpRight className="w-3 h-3" /> {trend}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className="text-sm text-muted-foreground mt-0.5">{title}</div>
      {typeof progress === "number" && (
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full ${progress > 85 ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}

