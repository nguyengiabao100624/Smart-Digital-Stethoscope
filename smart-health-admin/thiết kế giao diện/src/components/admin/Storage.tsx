import React, { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
} from "recharts";
import {
  HardDrive,
  Database,
  Files,
  FolderPlus,
  UploadCloud,
  Download,
  Search,
  Image as ImageIcon,
  AudioLines,
  FileText,
  Video,
  File as FileIcon,
  MoreVertical,
  Lock,
  Shield,
  Trash2,
  Share2,
  Eye,
  AlertTriangle,
  Archive,
  Bot,
  BrainCircuit,
  FileAudio,
  FileCheck,
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
import { PaginationFooter } from "./PaginationFooter";
import { ADMIN_TABLE_PAGE_SIZE, paginateItems } from "./pagination-utils";
import {
  smartHealthApi,
  type SmartHealthChartSlice,
  type SmartHealthClinicUsage,
  type SmartHealthStorageActivity,
  type SmartHealthStorageBucket,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { buildSmartHealthFilename } from "@/lib/filename-utils";
import {
  assertStorageDeleteOutcome,
  createStorageOperationIdempotencyKey,
  parseStorageBucketOutcome,
  parseStorageFilesResponse,
  parseStorageFileOutcome,
  parseStorageShareOutcome,
  parseStorageStatsResponse,
  type StorageOperation,
  type StorageStatsData,
} from "@/lib/storage-operations";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CapabilityGate } from "./AdminAccessContext";
import { useAdminAccess } from "./useAdminAccess";
import { REPORT_EXPORT_CAPABILITIES, STORAGE_MANAGE_CAPABILITIES } from "./action-permissions";

type IconComponent = React.ComponentType<{ className?: string }>;

type StorageConfirmAction = {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  run: () => Promise<void>;
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
  blue: {
    gradient: "linear-gradient(135deg, #0B5C9A 0%, #0EA5E9 100%)",
    soft: "rgba(14, 165, 233, 0.10)",
    accent: "#0B5C9A",
  },
  emerald: {
    gradient: "linear-gradient(135deg, #00A896 0%, #10B981 100%)",
    soft: "rgba(0, 168, 150, 0.10)",
    accent: "#00A896",
  },
  amber: {
    gradient: "linear-gradient(135deg, #F59E0B 0%, #F97316 100%)",
    soft: "rgba(245, 158, 11, 0.12)",
    accent: "#B45309",
  },
  rose: {
    gradient: "linear-gradient(135deg, #EF4444 0%, #F97316 100%)",
    soft: "rgba(239, 68, 68, 0.10)",
    accent: "#EF4444",
  },
  violet: {
    gradient: "linear-gradient(135deg, #7C3AED 0%, #0B5C9A 100%)",
    soft: "rgba(124, 58, 237, 0.10)",
    accent: "#7C3AED",
  },
  slate: {
    gradient: "linear-gradient(135deg, #334155 0%, #0B5C9A 100%)",
    soft: "rgba(15, 23, 42, 0.08)",
    accent: "#334155",
  },
  teal: {
    gradient: "linear-gradient(135deg, #0F766E 0%, #00A896 100%)",
    soft: "rgba(15, 118, 110, 0.10)",
    accent: "#0F766E",
  },
  cyan: {
    gradient: "linear-gradient(135deg, #0EA5E9 0%, #00A896 100%)",
    soft: "rgba(14, 165, 233, 0.10)",
    accent: "#0EA5E9",
  },
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

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function Storage() {
  const shouldReduceMotion = useReducedMotion();
  const { hasAnyCapability, hasCapability, isPlatformAdmin } = useAdminAccess();
  const canManageStorage = hasAnyCapability(STORAGE_MANAGE_CAPABILITIES);
  const canManageBucketLifecycle = isPlatformAdmin && hasCapability("platform.storage.manage");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBucket, setUploadBucket] = useState<string | undefined>();
  const [bucketOpen, setBucketOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<StorageFile | null>(null);
  const [search, setSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<StorageConfirmAction | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const storageOperationKeysRef = React.useRef(new Map<string, string>());
  const loadRequestIdRef = React.useRef(0);

  const [statsData, setStatsData] = useState<StorageStatsData | null>(null);
  const [filesData, setFilesData] = useState<StorageFile[] | null>(null);

  const getStorageOperationKey = (operation: StorageOperation, target: string) => {
    const mapKey = `${operation}:${target}`;
    const existingKey = storageOperationKeysRef.current.get(mapKey);
    if (existingKey) return existingKey;
    const nextKey = createStorageOperationIdempotencyKey(operation, target);
    storageOperationKeysRef.current.set(mapKey, nextKey);
    return nextKey;
  };

  const clearStorageOperationKey = (operation: StorageOperation, target: string) => {
    storageOperationKeysRef.current.delete(`${operation}:${target}`);
  };

  const loadStorage = React.useCallback(async (showLoading = true) => {
    const requestId = ++loadRequestIdRef.current;
    if (showLoading) {
      setIsLoading(true);
    }
    const [statsResult, filesResult] = await Promise.allSettled([
      smartHealthApi.getStorageStats(),
      smartHealthApi.listStorageFiles(),
    ]);
    if (requestId !== loadRequestIdRef.current) return;

    if (statsResult.status === "fulfilled") {
      try {
        setStatsData(parseStorageStatsResponse(statsResult.value));
        setStatsError(null);
      } catch (error) {
        setStatsError(toVietnameseErrorMessage(error, "Dữ liệu thống kê lưu trữ không hợp lệ."));
      }
    } else {
      setStatsError(
        toVietnameseErrorMessage(statsResult.reason, "Không thể tải thống kê lưu trữ."),
      );
    }

    if (filesResult.status === "fulfilled") {
      try {
        setFilesData(parseStorageFilesResponse(filesResult.value).files);
        setFilesError(null);
      } catch (error) {
        setFilesError(toVietnameseErrorMessage(error, "Danh sách tệp lưu trữ không hợp lệ."));
      }
    } else {
      setFilesError(
        toVietnameseErrorMessage(filesResult.reason, "Không thể tải danh sách tệp lưu trữ."),
      );
    }

    if (showLoading) {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadStorage();

    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [loadStorage]);

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

  const createBucket = async (
    payload: Parameters<typeof smartHealthApi.createStorageBucket>[0],
    idempotencyKey: string,
  ) => {
    if (!canManageBucketLifecycle) {
      throw new Error("Chỉ Platform Admin có thể tạo bucket lưu trữ.");
    }
    const response = await smartHealthApi.createStorageBucket(payload, idempotencyKey);
    parseStorageBucketOutcome(response, payload.name);
    toast.success("Đã tạo bucket");
    await loadStorage(false);
  };

  const uploadStorageFile = async (
    payload: Parameters<typeof smartHealthApi.uploadStorageFile>[0],
  ) => {
    if (!canManageStorage) {
      throw new Error("Tài khoản không có quyền tải tệp lên storage.");
    }
    const response = await smartHealthApi.uploadStorageFile(payload);
    parseStorageFileOutcome(response, {
      name: payload.file.name,
      bucket: payload.bucket,
    });
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
      throw new Error("Tài khoản không có quyền xóa tệp storage.");
    }
    const idempotencyKey = getStorageOperationKey("file-delete", file.id);
    const response = await smartHealthApi.deleteStorageFile(file.id, idempotencyKey);
    assertStorageDeleteOutcome(response, "fileId", file.id);
    clearStorageOperationKey("file-delete", file.id);
    toast.success(`Đã xóa ${file.name}`);
    setSelectedFile(null);
    await loadStorage(false);
  };

  const shareStorageFile = async (file: StorageFile) => {
    if (!canManageStorage) {
      throw new Error("Tài khoản không có quyền tạo liên kết chia sẻ.");
    }
    const idempotencyKey = getStorageOperationKey("file-share", file.id);
    const response = await smartHealthApi.shareStorageFile(file.id, idempotencyKey);
    const { shareUrl } = parseStorageShareOutcome(response);
    clearStorageOperationKey("file-share", file.id);
    return shareUrl;
  };

  const copyStorageShareLink = async (file: StorageFile) => {
    try {
      const link = await shareStorageFile(file);
      await navigator.clipboard.writeText(link);
      toast.success("Đã sao chép liên kết chia sẻ");
    } catch (err) {
      toast.error(toVietnameseErrorMessage(err, "Không thể tạo liên kết chia sẻ."));
    }
  };

  const deleteBucket = (bucket: SmartHealthStorageBucket) => {
    if (!canManageBucketLifecycle) {
      return;
    }
    if (bucket.system) {
      toast.error("Bucket hệ thống không thể xóa");
      return;
    }
    const idempotencyKey = createStorageOperationIdempotencyKey("bucket-delete", bucket.id);
    setConfirmError("");
    setConfirmAction({
      title: "Xóa bucket lưu trữ",
      description: (
        <span>
          Bạn có chắc chắn muốn xóa bucket <strong>{bucket.id}</strong>? Chỉ bucket rỗng mới xóa
          được.
        </span>
      ),
      confirmLabel: "Xóa bucket",
      run: async () => {
        const response = await smartHealthApi.deleteStorageBucket(bucket.id, idempotencyKey);
        assertStorageDeleteOutcome(response, "bucketId", bucket.id);
        toast.success(`Đã xóa bucket ${bucket.id}`);
        await loadStorage(false);
      },
    });
  };

  const totalUsed = statsData?.totalUsed ?? 0;
  const totalFiles = statsData?.totalFiles ?? 0;
  const buckets = statsData?.buckets ?? [];
  const growthData = statsData?.growthData ?? [];
  const typeData = statsData?.typeData ?? [];
  const topBuckets = statsData?.topBuckets ?? [];
  const recentActivity = statsData?.recentActivity ?? [];
  const topClinicUsage = statsData?.topClinicUsage ?? [];
  const confirmedFiles = useMemo(() => filesData ?? [], [filesData]);
  const canUploadStorage = canManageStorage && Boolean(statsData) && buckets.length > 0;

  const filteredFiles = useMemo(() => {
    return confirmedFiles.filter((f) => {
      if (bucketFilter !== "all" && f.bucket !== bucketFilter) return false;
      if (typeFilter !== "all" && f.type !== typeFilter) return false;
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [bucketFilter, confirmedFiles, search, typeFilter]);

  React.useEffect(() => {
    setPage(1);
  }, [bucketFilter, search, typeFilter, confirmedFiles.length]);

  const pagedFiles = useMemo(
    () => paginateItems(filteredFiles, page, ADMIN_TABLE_PAGE_SIZE),
    [filteredFiles, page],
  );

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card"
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary motion-reduce:animate-none" />
          <p className="text-sm text-muted-foreground">Đang tải dữ liệu lưu trữ...</p>
        </div>
      </div>
    );
  }

  if (!statsData && filesData === null && (statsError || filesError)) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card">
        <div role="alert" className="flex max-w-md flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">Không thể tải dữ liệu lưu trữ</h1>
          <p className="text-sm text-destructive">
            {[statsError, filesError].filter(Boolean).join(" ")}
          </p>
          <button
            type="button"
            onClick={() => void loadStorage()}
            className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UploadFileDialog
        open={canUploadStorage && uploadOpen}
        onOpenChange={setUploadOpen}
        defaultBucket={uploadBucket}
        buckets={buckets}
        onUpload={uploadStorageFile}
      />
      <CreateBucketDialog
        open={canManageBucketLifecycle && bucketOpen}
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
        onShare={canManageStorage ? shareStorageFile : undefined}
        onDelete={canManageStorage ? deleteStorageFile : undefined}
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
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Quản lý Lưu trữ</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Theo dõi bucket, dung lượng thực tế và tệp y khoa của toàn hệ thống Shcare.
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" /> Chỉ Platform Admin quản lý vòng đời bucket
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageBucketLifecycle ? (
            <button
              onClick={() => setBucketOpen(true)}
              className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FolderPlus className="w-4 h-4" /> Tạo bucket
            </button>
          ) : null}
          <CapabilityGate capabilities={REPORT_EXPORT_CAPABILITIES}>
            <button
              onClick={() => setExportOpen(true)}
              className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="w-4 h-4" /> Xuất báo cáo
            </button>
          </CapabilityGate>
          <CapabilityGate capabilities={STORAGE_MANAGE_CAPABILITIES}>
            <motion.button
              whileHover={shouldReduceMotion ? undefined : { y: -1 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
              onClick={() => {
                setUploadBucket(undefined);
                setUploadOpen(true);
              }}
              disabled={!canUploadStorage}
              title={
                canUploadStorage
                  ? "Tải tệp lên storage"
                  : "Cần tải thành công catalog bucket trước khi tải tệp"
              }
              className="flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" /> Tải lên tệp
            </motion.button>
          </CapabilityGate>
        </div>
      </div>

      {statsError ? (
        <StorageLoadNotice
          title={statsData ? "Thống kê chưa được làm mới" : "Không thể tải thống kê lưu trữ"}
          message={statsError}
          stale={Boolean(statsData)}
          onRetry={() => void loadStorage(false)}
        />
      ) : null}

      {filesError ? (
        <StorageLoadNotice
          title={filesData ? "Danh sách tệp chưa được làm mới" : "Không thể tải danh sách tệp"}
          message={filesError}
          stale={Boolean(filesData)}
          onRetry={() => void loadStorage(false)}
        />
      ) : null}

      {!canManageStorage ? (
        <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
            <div>
              <p className="text-sm font-medium text-foreground">Chế độ chỉ xem</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Tài khoản hiện tại có thể xem dữ liệu nhưng không thể tải lên, chia sẻ hoặc xóa tệp.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {statsData ? (
        <>
          {/* KPI */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KPI title="Dung lượng đã ghi nhận" value={formatGB(totalUsed)} icon={HardDrive} />
            <KPI title="Tổng tệp" value={totalFiles.toLocaleString("vi-VN")} icon={Files} />
            <KPI title="Bucket từ backend" value={String(buckets.length)} icon={Database} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">Dung lượng tệp tải lên (30 ngày)</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tổng kích thước tệp được backend ghi nhận theo ngày
                  </p>
                </div>
              </div>
              {growthData.length > 0 ? (
                <div
                  className="h-[280px]"
                  role="img"
                  aria-label={`Biểu đồ dung lượng tệp tải lên trong 30 ngày gồm ${growthData.length} mốc dữ liệu`}
                >
                  <div className="h-full w-full" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        accessibilityLayer={false}
                        data={growthData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="grad-storage" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <XAxis
                          dataKey="day"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--card)",
                            color: "var(--foreground)",
                          }}
                          itemStyle={{ color: "var(--foreground)" }}
                          labelStyle={{ color: "var(--muted-foreground)" }}
                          formatter={(value: number | string) => [`${value} GB`, "Dung lượng"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="gb"
                          name="Dung lượng"
                          stroke="var(--chart-1)"
                          strokeWidth={2}
                          fill="url(#grad-storage)"
                          isAnimationActive={!shouldReduceMotion}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <EmptyDataState message="Chưa có tệp tải lên để hiển thị biểu đồ 30 ngày." />
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h2 className="text-base font-semibold mb-1">Phân bổ theo loại</h2>
              <p className="text-xs text-muted-foreground mb-3">Tổng {formatGB(totalUsed)}</p>
              {typeData.length > 0 ? (
                <>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart accessibilityLayer={false}>
                        <Pie
                          data={typeData}
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="none"
                          rootTabIndex={-1}
                          isAnimationActive={!shouldReduceMotion}
                        >
                          {typeData.map((entry: SmartHealthChartSlice) => (
                            <Cell
                              key={entry.name}
                              fill={entry.color}
                              aria-label={`${entry.name}: ${entry.value} GB`}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number | string) => `${value} GB`}
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--card)",
                            color: "var(--foreground)",
                          }}
                          itemStyle={{ color: "var(--foreground)" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {typeData.map((type: SmartHealthChartSlice) => (
                      <div key={type.name} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: type.color }}
                        />
                        <span className="flex-1 text-muted-foreground">{type.name}</span>
                        <span className="font-medium">{type.value} GB</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyDataState message="Backend chưa trả về phân bổ theo loại tệp." compact />
              )}
            </div>
          </div>

          {/* Buckets grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Các bucket</h2>
              {canManageBucketLifecycle ? (
                <button
                  onClick={() => setBucketOpen(true)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FolderPlus className="w-3.5 h-3.5" /> Bucket mới
                </button>
              ) : null}
            </div>
            {buckets.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {buckets.map((b: SmartHealthStorageBucket, i: number) => {
                  const bucketStyle = getBucketStyleForBucket(b);
                  const BucketIcon = bucketStyle.icon;
                  return (
                    <motion.div
                      key={b.id}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        shouldReduceMotion ? { duration: 0 } : { delay: Math.min(i, 3) * 0.04 }
                      }
                      className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-md"
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
                            <button
                              type="button"
                              aria-label={`Mở thao tác bucket ${b.name || b.id}`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content
                              align="end"
                              className="min-w-[160px] bg-popover border border-border rounded-md shadow-lg p-1 z-50"
                            >
                              {canManageStorage ? (
                                <DropdownMenu.Item
                                  onClick={() => {
                                    setUploadBucket(b.id);
                                    setUploadOpen(true);
                                  }}
                                  className="text-sm px-2 py-1.5 rounded hover:bg-accent cursor-pointer flex items-center gap-2 outline-none"
                                >
                                  <UploadCloud className="w-4 h-4" /> Tải lên
                                </DropdownMenu.Item>
                              ) : null}
                              <DropdownMenu.Item
                                onClick={() => setBucketFilter(b.id)}
                                className="text-sm px-2 py-1.5 rounded hover:bg-accent cursor-pointer flex items-center gap-2 outline-none"
                              >
                                <Search className="w-4 h-4" /> Lọc tệp bucket này
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                onClick={() => void loadStorage(false)}
                                className="text-sm px-2 py-1.5 rounded hover:bg-accent cursor-pointer flex items-center gap-2 outline-none"
                              >
                                <ActivityIcon className="w-4 h-4" /> Đồng bộ
                              </DropdownMenu.Item>
                              {canManageBucketLifecycle ? (
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
                              ) : null}
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

                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{formatGB(b.used)}</span>
                        <span>{b.files.toLocaleString("vi-VN")} tệp</span>
                      </div>
                      <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                        {b.system ? (
                          <Shield className="h-3 w-3" />
                        ) : (
                          <Database className="h-3 w-3" />
                        )}
                        {b.system ? "Bucket hệ thống" : "Bucket tùy chỉnh"}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <EmptyDataState message="Backend chưa trả về bucket lưu trữ nào." />
            )}
          </div>
        </>
      ) : null}

      {/* Files + side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Files table */}
        {filesData === null ? (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm xl:col-span-3">
            <UnavailableStorageSection
              title="Danh sách tệp chưa khả dụng"
              message="Phần thống kê vẫn được giữ nguyên nếu đã tải thành công. Hãy thử tải lại riêng dữ liệu storage."
              onRetry={() => void loadStorage(false)}
            />
          </div>
        ) : (
          <div
            className={`${statsData ? "xl:col-span-2" : "xl:col-span-3"} overflow-hidden rounded-xl border border-border bg-card shadow-sm`}
          >
            <div className="p-4 border-b border-border bg-muted/20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm tệp..."
                  aria-label="Tìm tệp lưu trữ"
                  className="min-h-11 w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={bucketFilter}
                  onChange={(e) => setBucketFilter(e.target.value)}
                  aria-label="Lọc theo bucket"
                  className="min-h-11 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  aria-label="Lọc theo loại tệp"
                  className="min-h-11 rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">Mọi loại</option>
                  <option value="dcm">DICOM</option>
                  <option value="wav">Audio</option>
                  <option value="pdf">PDF</option>
                  <option value="mp4">Video</option>
                  <option value="jpg">Hình ảnh</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-muted/40 text-muted-foreground text-xs">
                  <tr>
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
                          <button
                            type="button"
                            onClick={() => setSelectedFile(f)}
                            className="flex min-h-11 items-center gap-2 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[200px]">{f.name}</div>
                              <div className="text-xs text-muted-foreground uppercase">
                                {f.type}
                              </div>
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
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3" /> Theo quyền truy cập
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedFile(f)}
                              aria-label={`Xem chi tiết ${f.name}`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title="Xem"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadStorageFile(f)}
                              aria-label={`Tải xuống ${f.name}`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              title="Tải xuống"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <CapabilityGate capabilities={STORAGE_MANAGE_CAPABILITIES}>
                              <button
                                type="button"
                                onClick={() => void copyStorageShareLink(f)}
                                aria-label={`Chia sẻ ${f.name}`}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        colSpan={7}
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
              sourceTotalItems={confirmedFiles.length}
              itemLabel="tệp"
              onPageChange={setPage}
            />
          </div>
        )}

        {/* Side column */}
        {statsData ? (
          <div className="space-y-6">
            {/* Top bucket bar */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h2 className="text-base font-semibold mb-3">Top bucket theo dung lượng</h2>
              {topBuckets.length > 0 ? (
                <div
                  className="h-[200px]"
                  role="img"
                  aria-label={`Biểu đồ ${topBuckets.length} bucket có dung lượng cao nhất`}
                >
                  <div className="h-full w-full" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        accessibilityLayer={false}
                        data={topBuckets}
                        layout="vertical"
                        margin={{ left: 10, right: 20 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                          stroke="var(--border)"
                        />
                        <XAxis
                          type="number"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          width={110}
                        />
                        <Tooltip
                          formatter={(value: number | string) => `${value} GB`}
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            backgroundColor: "var(--card)",
                            color: "var(--foreground)",
                          }}
                          itemStyle={{ color: "var(--foreground)" }}
                        />
                        <Bar
                          dataKey="gb"
                          name="Dung lượng"
                          fill="var(--chart-1)"
                          radius={[0, 4, 4, 0]}
                          isAnimationActive={!shouldReduceMotion}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <EmptyDataState message="Chưa có dung lượng bucket để so sánh." compact />
              )}
            </div>

            {/* Recent */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h2 className="text-base font-semibold mb-3">Tệp mới tải gần đây</h2>
              {recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {recentActivity.map((activity: SmartHealthStorageActivity, index: number) => (
                    <div
                      key={`${activity.target}-${activity.when}-${index}`}
                      className="flex gap-3 text-sm"
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <UploadCloud className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">
                          <span className="font-medium">{activity.who}</span>{" "}
                          <span className="text-muted-foreground">đã tải lên</span>{" "}
                          <span className="font-mono text-xs">{activity.target}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{activity.when}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyDataState message="Chưa có tệp tải lên gần đây." compact />
              )}
            </div>

            {/* Top clinic */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <h2 className="text-base font-semibold mb-1">Phân bổ theo workspace</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Tỷ trọng dung lượng đã ghi nhận, không phải hạn mức quota.
              </p>
              {topClinicUsage.length > 0 ? (
                <div className="space-y-3">
                  {topClinicUsage.map((clinic: SmartHealthClinicUsage) => (
                    <div key={clinic.name}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{clinic.name}</span>
                        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                          {formatGB(clinic.gb)} · {clampPercent(clinic.percent)}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${clampPercent(clinic.percent)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyDataState message="Chưa có dữ liệu phân bổ theo workspace." compact />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KPI({ title, value, icon: Icon }: { title: string; value: string; icon: IconComponent }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm hover:border-primary/40 hover:shadow-md transition-all">
      <div className="mb-3 flex items-start justify-between">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-sm text-muted-foreground mt-0.5">{title}</div>
    </div>
  );
}

function EmptyDataState({ message, compact = false }: { message: string; compact?: boolean }) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 text-center ${compact ? "min-h-24 py-4" : "min-h-48 py-8"}`}
    >
      <Database className="mb-2 h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function StorageLoadNotice({
  title,
  message,
  stale,
  onRetry,
}: {
  title: string;
  message: string;
  stale: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role={stale ? "status" : "alert"}
      className="flex flex-col gap-3 rounded-lg border border-warning/35 bg-warning/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {stale
              ? "Dữ liệu đang hiển thị là bản đã được backend xác nhận gần nhất. "
              : "Không hiển thị số liệu thay thế cho phần chưa tải được. "}
            {message}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 flex-shrink-0 items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Thử tải lại
      </button>
    </div>
  );
}

function UnavailableStorageSection({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-4 py-8 text-center">
      <AlertTriangle className="mb-3 h-7 w-7 text-warning" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Thử tải lại
      </button>
    </div>
  );
}
