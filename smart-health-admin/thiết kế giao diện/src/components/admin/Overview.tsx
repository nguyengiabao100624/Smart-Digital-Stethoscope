import React, { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "@/components/admin/router-shim";
import { ExportReportDialog } from "./dialogs/ExportReportDialog";
import { useAdminAccess } from "./useAdminAccess";
import { REPORT_EXPORT_CAPABILITIES } from "./action-permissions";
import { AnimatedCard, PageHeader, StatusBadge } from "./design-system";
import { Skeleton } from "@/components/ui/skeleton";
import { smartHealthApi, type SmartHealthOverviewRangeKey } from "@/lib/smart-health-api";
import {
  OVERVIEW_RANGE_OPTIONS,
  overviewTimezoneLabel,
  parseOverviewStatsResponse,
  type OverviewStatsData,
} from "@/lib/overview-operations";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Building2,
  ChevronRight,
  Database,
  Download,
  Info,
  Loader2,
  MonitorSpeaker,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type IconComponent = React.ComponentType<{ className?: string }>;
type BadgeTone = "online" | "success" | "warning" | "error" | "info" | "muted";

type PortalModule = {
  label: string;
  icon: IconComponent;
  path: string;
  enabled: boolean;
};

type OperationalSignal = {
  type: "error" | "warning" | "info";
  title: string;
  description: string;
  source: string;
  onClick: () => void;
};

export function Overview() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const { currentUser, isPlatformAdmin, hasAnyCapability } = useAdminAccess();
  const canExportData = hasAnyCapability(REPORT_EXPORT_CAPABILITIES);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<SmartHealthOverviewRangeKey>("today");
  const [retryVersion, setRetryVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<OverviewStatsData | null>(null);
  const timezoneOffsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    smartHealthApi
      .getOverviewStats({ range: selectedRange, timezoneOffsetMinutes })
      .then((rawData) => parseOverviewStatsResponse(rawData, selectedRange))
      .then((data) => {
        if (!cancelled) {
          setStatsData(data);
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(toVietnameseErrorMessage(requestError, "Không thể tải dữ liệu tổng quan."));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [retryVersion, selectedRange, timezoneOffsetMinutes]);

  const workspaceName =
    currentUser?.workspace?.name ||
    currentUser?.currentMembership?.workspaceName ||
    currentUser?.hospital ||
    "Shcare";

  const portalModules: PortalModule[] = [
    { label: "Tổng quan", icon: ShieldCheck, path: "/", enabled: true },
    {
      label: "Bác sĩ/nhân sự",
      icon: UserCheck,
      path: "/doctors",
      enabled: hasAnyCapability(["platform.users.manage", "workspace.staff.manage"]),
    },
    {
      label: "Bệnh nhân",
      icon: Users,
      path: "/patients",
      enabled: hasAnyCapability(["platform.patients.view", "workspace.patients.view"]),
    },
    {
      label: "Thiết bị",
      icon: MonitorSpeaker,
      path: "/devices",
      enabled: hasAnyCapability(["platform.devices.view", "workspace.devices.view"]),
    },
    {
      label: "Theo dõi trực tiếp",
      icon: RadioTower,
      path: "/ai-measurements",
      enabled: hasAnyCapability(["platform.scans.view", "workspace.scans.view"]),
    },
  ].filter((item) => item.enabled);

  const retry = () => setRetryVersion((value) => value + 1);

  return (
    <div className="space-y-6">
      {canExportData ? <ExportReportDialog open={exportOpen} onOpenChange={setExportOpen} /> : null}
      <PageHeader
        eyebrow={isPlatformAdmin ? "Platform Admin Console" : "Workspace Portal"}
        title={isPlatformAdmin ? "Tổng quan hệ thống" : workspaceName}
        description={
          isPlatformAdmin
            ? "Theo dõi workspace, thiết bị, lượt đo và trạng thái vận hành bằng dữ liệu backend thật."
            : "Theo dõi bệnh nhân, thiết bị và lượt đo trong workspace hiện tại."
        }
        action={
          <>
            <div className="relative">
              <select
                id="overview-time-range"
                name="overview-time-range"
                aria-label="Khoảng thời gian thống kê"
                value={selectedRange}
                onChange={(event) =>
                  setSelectedRange(event.target.value as SmartHealthOverviewRangeKey)
                }
                className="min-h-11 rounded-md border border-border bg-card px-3 pr-9 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              >
                {OVERVIEW_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {isLoading && (
                <Loader2
                  aria-label="Đang cập nhật thống kê"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
                />
              )}
            </div>
            {canExportData ? (
              <motion.button
                type="button"
                onClick={() => setExportOpen(true)}
                whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                className="group inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Download className="h-4 w-4" />
                Xuất dữ liệu
              </motion.button>
            ) : null}
          </>
        }
      />

      {!isPlatformAdmin && (
        <nav aria-label="Lối tắt workspace" className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {portalModules.map((module) => (
            <button
              key={module.path}
              type="button"
              onClick={() => navigate(module.path)}
              className="flex min-h-20 flex-col items-start justify-between rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <module.icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">{module.label}</span>
            </button>
          ))}
        </nav>
      )}

      {statsData && error && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">Đang hiển thị dữ liệu đã tải trước đó</p>
              <p className="mt-0.5 text-muted-foreground">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-warning/40 bg-card px-4 font-medium text-foreground transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-4 w-4" />
            Thử lại
          </button>
        </div>
      )}

      {isLoading && !statsData ? (
        <OverviewSkeleton />
      ) : !statsData ? (
        <OverviewErrorState message={error || "Không thể tải dữ liệu tổng quan."} onRetry={retry} />
      ) : (
        <OverviewDashboard
          data={statsData}
          isPlatformAdmin={isPlatformAdmin}
          isRefreshing={isLoading}
          requestedRange={selectedRange}
          navigate={navigate}
        />
      )}
    </div>
  );
}

function OverviewDashboard({
  data,
  isPlatformAdmin,
  isRefreshing,
  requestedRange,
  navigate,
}: {
  data: OverviewStatsData;
  isPlatformAdmin: boolean;
  isRefreshing: boolean;
  requestedRange: SmartHealthOverviewRangeKey;
  navigate: (path: string) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { stats, range, generatedAt, measureData, deviceData, aiJobData } = data;
  const onlineDevices = deviceData.find((item) => item.key === "online")?.value ?? 0;
  const offlineDevices = deviceData.find((item) => item.key === "offline")?.value ?? 0;
  const totalDevices = onlineDevices + offlineDevices;
  const onlinePercent = totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0;
  const totalAiJobs = aiJobData.reduce((sum, item) => sum + item.value, 0);
  const hasMeasurements = measureData.some((point) => Number(point.count || 0) > 0);
  const visibleDeviceData = deviceData.filter((item) => item.value > 0);
  const isShowingPreviousRange = isRefreshing && requestedRange !== range.key;

  const operationalSignals: OperationalSignal[] = [
    isPlatformAdmin && stats.pendingDoctors > 0
      ? {
          type: "info",
          title: "Hồ sơ bác sĩ chờ duyệt",
          description: `${stats.pendingDoctors} yêu cầu đang chờ kiểm tra và cấp quyền.`,
          source: "Nguồn: trạng thái tài khoản hiện tại",
          onClick: () => navigate("/doctor-approval"),
        }
      : null,
    offlineDevices > 0
      ? {
          type: "warning",
          title: "Thiết bị đang mất kết nối",
          description: `${offlineDevices}/${totalDevices} thiết bị không ở trạng thái online.`,
          source: "Nguồn: ảnh chụp trạng thái thiết bị",
          onClick: () => navigate("/devices"),
        }
      : null,
    stats.aiJobsFailed > 0
      ? {
          type: "error",
          title: "Lượt phân tích thất bại",
          description: `${stats.aiJobsFailed} lượt trong ${range.label.toLowerCase()} cần được kiểm tra.`,
          source: "Nguồn: lifecycle lượt đo trong khoảng đã chọn",
          onClick: () => navigate("/ai-measurements"),
        }
      : null,
  ].filter((signal): signal is OperationalSignal => Boolean(signal));

  return (
    <div className="space-y-6" aria-busy={isRefreshing}>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/35 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          Cập nhật lúc {formatDateTime(generatedAt)} ·{" "}
          {overviewTimezoneLabel(range.timezoneOffsetMinutes)}
        </span>
        <span className="font-medium text-foreground">
          {isShowingPreviousRange
            ? "Đang tải khoảng thời gian mới…"
            : `${range.label}: ${formatDate(range.startAt)} – ${formatDate(range.endAt)}`}
        </span>
      </div>

      <section
        aria-label="Chỉ số tổng quan"
        className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6"
      >
        <KPICard
          title={isPlatformAdmin ? "Workspace/phòng khám" : "Bệnh nhân"}
          value={String(isPlatformAdmin ? stats.clinics : (stats.patientsCount ?? 0))}
          icon={isPlatformAdmin ? Building2 : Users}
          statusLabel="Hiện tại"
          statusTone="muted"
          onClick={() => navigate(isPlatformAdmin ? "/clinics" : "/patients")}
        />
        {isPlatformAdmin ? (
          <KPICard
            title="Bác sĩ chờ duyệt"
            value={String(stats.pendingDoctors)}
            icon={UserCheck}
            statusLabel={stats.pendingDoctors > 0 ? "Cần duyệt" : "Không có yêu cầu"}
            statusTone={stats.pendingDoctors > 0 ? "warning" : "success"}
            alert={stats.pendingDoctors > 0}
            onClick={() => navigate("/doctor-approval")}
          />
        ) : (
          <KPICard
            title="Tổng thiết bị"
            value={String(totalDevices)}
            icon={MonitorSpeaker}
            statusLabel="Workspace"
            statusTone="muted"
            onClick={() => navigate("/devices")}
          />
        )}
        <KPICard
          title="Thiết bị online"
          value={String(stats.devicesOnline)}
          icon={MonitorSpeaker}
          statusLabel={totalDevices > 0 ? `${totalDevices} tổng` : "Chưa có thiết bị"}
          statusTone={totalDevices > 0 && offlineDevices === 0 ? "success" : "muted"}
          onClick={() => navigate("/devices")}
        />
        <KPICard
          title="Lượt đo trong khoảng"
          value={String(stats.scansCount)}
          icon={Activity}
          statusLabel={range.label}
          statusTone="info"
          onClick={() => navigate("/ai-measurements")}
        />
        <KPICard
          title="Phân tích tín hiệu thất bại"
          value={String(stats.aiJobsFailed)}
          icon={AlertTriangle}
          statusLabel={stats.aiJobsFailed > 0 ? "Cần xử lý" : "Không có lỗi"}
          statusTone={stats.aiJobsFailed > 0 ? "error" : "success"}
          alert={stats.aiJobsFailed > 0}
          onClick={() => navigate("/ai-measurements")}
        />
        <KPICard
          title="Dung lượng đang dùng"
          value={stats.storageUsed}
          icon={Database}
          statusLabel="Hiện tại"
          statusTone="muted"
          onClick={() => navigate("/storage")}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <AnimatedCard className="p-5 xl:col-span-2">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Lượt đo · {range.label}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Bucket {range.bucket === "4h" ? "4 giờ" : "theo ngày"}, không nội suy dữ liệu.
              </p>
            </div>
            <TextLinkButton label="Xem chi tiết" onClick={() => navigate("/ai-measurements")} />
          </div>
          {hasMeasurements ? (
            <div
              className="h-[300px] w-full"
              role="img"
              aria-label={`${stats.scansCount} lượt đo trong ${range.label.toLowerCase()}`}
            >
              <div className="h-full w-full" aria-hidden="true">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart
                    accessibilityLayer={false}
                    data={measureData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="overview-count-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="time"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                      dy={10}
                      minTickGap={20}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--card)",
                        color: "var(--foreground)",
                        boxShadow: "var(--shadow-md)",
                      }}
                      itemStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                      labelStyle={{ color: "var(--muted-foreground)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Lượt đo"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      fill="url(#overview-count-fill)"
                      isAnimationActive={!shouldReduceMotion}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <ChartEmptyState
              icon={Activity}
              title="Chưa có lượt đo trong khoảng này"
              description="Biểu đồ đang trống vì backend trả về 0 lượt đo, không phải do lỗi tải dữ liệu."
              actionLabel="Mở danh sách lượt đo"
              onAction={() => navigate("/ai-measurements")}
            />
          )}
        </AnimatedCard>

        <div className="space-y-6">
          <AnimatedCard className="p-5" delay={0.05}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">Trạng thái thiết bị</h2>
              <TextLinkButton label="Xem tất cả" onClick={() => navigate("/devices")} />
            </div>
            {totalDevices === 0 ? (
              <CompactEmptyState
                icon={MonitorSpeaker}
                title="Chưa có thiết bị"
                description="Không có thiết bị nào trong phạm vi được cấp quyền."
              />
            ) : (
              <div className="rounded-xl border border-border bg-muted/25 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Tỷ lệ online</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{onlinePercent}%</p>
                  </div>
                  <StatusBadge label="Ảnh chụp hiện tại" tone="muted" />
                </div>
                <div className="flex items-center">
                  <div className="relative h-[132px] w-[132px] shrink-0">
                    <div className="absolute inset-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart accessibilityLayer={false}>
                          <Pie
                            data={visibleDeviceData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={60}
                            paddingAngle={visibleDeviceData.length > 1 ? 3 : 0}
                            dataKey="value"
                            stroke="none"
                            rootTabIndex={-1}
                            isAnimationActive={!shouldReduceMotion}
                          >
                            {visibleDeviceData.map((entry) => (
                              <Cell
                                key={entry.key}
                                fill={entry.color}
                                aria-label={`${entry.name}: ${entry.value} thiết bị`}
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div
                      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                      aria-hidden="true"
                    >
                      <span className="text-xl font-bold text-foreground">{totalDevices}</span>
                      <span className="text-[11px] text-muted-foreground">thiết bị</span>
                    </div>
                    <span className="sr-only">
                      {onlineDevices} thiết bị online, {offlineDevices} thiết bị mất kết nối
                    </span>
                  </div>
                  <div className="ml-4 flex-1 space-y-2">
                    <DeviceStatusButton
                      label="Đang hoạt động"
                      value={onlineDevices}
                      dotClass="bg-success"
                      onClick={() => navigate("/devices")}
                    />
                    <DeviceStatusButton
                      label="Mất kết nối"
                      value={offlineDevices}
                      dotClass="bg-border"
                      onClick={() => navigate("/devices")}
                    />
                  </div>
                </div>
              </div>
            )}
          </AnimatedCard>

          <AnimatedCard className="p-5" delay={0.08}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">Trạng thái phân tích</h2>
              {stats.aiJobsFailed > 0 && (
                <StatusBadge label={`${stats.aiJobsFailed} thất bại`} tone="error" />
              )}
            </div>
            {totalAiJobs === 0 ? (
              <CompactEmptyState
                icon={Activity}
                title="Không có lượt phân tích"
                description={`Backend không ghi nhận lượt đo trong ${range.label.toLowerCase()}.`}
              />
            ) : (
              <div className="space-y-2">
                {aiJobData.map((job) => {
                  const percent = totalAiJobs > 0 ? (job.value / totalAiJobs) * 100 : 0;
                  return (
                    <button
                      key={job.key}
                      type="button"
                      onClick={() => navigate("/ai-measurements")}
                      className="min-h-12 w-full rounded-lg border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: job.color }}
                          />
                          {job.name}
                        </span>
                        <span className="font-semibold text-foreground">{job.value}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={shouldReduceMotion ? false : { width: 0 }}
                          animate={{ width: `${percent}%` }}
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { duration: 0.25, ease: "easeOut" }
                          }
                          className="h-full rounded-full"
                          style={{ backgroundColor: job.color }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </AnimatedCard>

          <AnimatedCard className="p-5" delay={0.1}>
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">Tín hiệu vận hành</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Tổng hợp từ snapshot hiện tại, không phải timeline cảnh báo.
              </p>
            </div>
            {operationalSignals.length === 0 ? (
              <CompactEmptyState
                icon={Info}
                title="Không có tín hiệu cần xử lý"
                description="Các chỉ số hiện tại không tạo ra cảnh báo vận hành tổng hợp."
              />
            ) : (
              <div className="space-y-2">
                {operationalSignals.map((signal) => (
                  <SignalItem key={signal.title} signal={signal} />
                ))}
              </div>
            )}
          </AnimatedCard>
        </div>
      </div>
    </div>
  );
}

function KPICard({
  title,
  value,
  icon: Icon,
  statusLabel,
  statusTone,
  alert = false,
  onClick,
}: {
  title: string;
  value: string;
  icon: IconComponent;
  statusLabel: string;
  statusTone: BadgeTone;
  alert?: boolean;
  onClick: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
      className="group min-h-36 w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${title}: ${value}. ${statusLabel}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div
          className={`rounded-lg p-2 ${alert ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </div>
      <div className="mb-1 text-2xl font-bold text-foreground transition-colors group-hover:text-primary">
        {value}
      </div>
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        {title}
        <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />
      </div>
    </motion.button>
  );
}

function TextLinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label} <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}

function DeviceStatusButton({
  label,
  value,
  dotClass,
  onClick,
}: {
  label: string;
  value: number;
  dotClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={`h-3 w-3 shrink-0 rounded-full ${dotClass}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold text-foreground">{value}</span>
    </button>
  );
}

function SignalItem({ signal }: { signal: OperationalSignal }) {
  const dotClass =
    signal.type === "error"
      ? "bg-destructive"
      : signal.type === "warning"
        ? "bg-warning"
        : "bg-primary";
  return (
    <button
      type="button"
      onClick={signal.onClick}
      className="group flex min-h-16 w-full gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground transition-colors group-hover:text-primary">
          {signal.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{signal.description}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{signal.source}</span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function OverviewErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section
      role="alert"
      className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-destructive/25 bg-card px-6 py-12 text-center"
    >
      <span className="mb-4 rounded-full bg-destructive/10 p-3 text-destructive">
        <AlertCircle className="h-6 w-6" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">Không tải được tổng quan</h2>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">{message}</p>
      <p className="mt-2 max-w-lg text-xs text-muted-foreground">
        Không có số liệu dự phòng được hiển thị để tránh nhầm dữ liệu lỗi thành số 0 thật.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RefreshCw className="h-4 w-4" />
        Thử tải lại
      </button>
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải dữ liệu tổng quan">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="min-h-36 rounded-xl border border-border bg-card p-4">
            <div className="mb-5 flex items-center justify-between">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="mt-2 h-4 w-28" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 xl:col-span-2">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="mt-6 h-[300px] w-full rounded-lg" />
        </div>
        <div className="space-y-6">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-4 h-28 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChartEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
      <span className="mb-3 rounded-full bg-primary/10 p-3 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {actionLabel} <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function CompactEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: IconComponent;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
      <Icon className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
