import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "@/components/admin/router-shim";
import { ExportReportDialog } from "./dialogs/ExportReportDialog";
import { useAdminAccess } from "./AdminAccessContext";
import { AnimatedCard, PageHeader, StatusBadge } from "./design-system";
import {
  smartHealthApi,
  type SmartHealthChartPoint,
  type SmartHealthChartSlice,
  type SmartHealthOverviewStats,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  Building2,
  UserCheck,
  Users,
  MonitorSpeaker,
  Activity,
  AlertTriangle,
  Database,
  ArrowUpRight,
  ArrowDownRight,
  MoreVertical,
  ChevronRight,
  Download,
  Loader2,
  RadioTower,
  ShieldCheck,
} from "lucide-react";
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
} from "recharts";

type OverviewStatsData = {
  stats: SmartHealthOverviewStats;
  measureData: SmartHealthChartPoint[];
  deviceData: SmartHealthChartSlice[];
  aiJobData: SmartHealthChartSlice[];
};

const DEFAULT_OVERVIEW_DATA: OverviewStatsData = {
  stats: {
    clinics: 0,
    pendingDoctors: 0,
    devicesOnline: 0,
    scansCount: 0,
    aiJobsFailed: 0,
    storageUsed: "0 GB",
  },
  measureData: [],
  deviceData: [],
  aiJobData: [],
};

export function Overview() {
  const navigate = useNavigate();
  const { currentUser, isPlatformAdmin, hasAnyCapability } = useAdminAccess();
  const [exportOpen, setExportOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<OverviewStatsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    smartHealthApi
      .getOverviewStats()
      .then((data) => {
        if (!cancelled) {
          setStatsData(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(toVietnameseErrorMessage(err, "Không thể tải dữ liệu tổng quan."));
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

  const { stats, measureData, deviceData, aiJobData } = statsData || DEFAULT_OVERVIEW_DATA;
  const workspaceName =
    currentUser?.workspace?.name ||
    currentUser?.currentMembership?.workspaceName ||
    currentUser?.hospital ||
    "Smart Health";
  const roleLabel = currentUser?.currentMembership?.role || currentUser?.role || "";
  const portalModules = [
    {
      label: "Overview",
      icon: ShieldCheck,
      path: "/",
      enabled: true,
    },
    {
      label: "Staff",
      icon: UserCheck,
      path: "/doctors",
      enabled: hasAnyCapability(["platform.users.manage", "workspace.staff.manage"]),
    },
    {
      label: "Patients / family groups",
      icon: Users,
      path: "/patients",
      enabled: hasAnyCapability(["platform.patients.view", "workspace.patients.view"]),
    },
    {
      label: "Devices",
      icon: MonitorSpeaker,
      path: "/devices",
      enabled: hasAnyCapability(["platform.devices.view", "workspace.devices.view"]),
    },
    {
      label: "Live monitoring",
      icon: RadioTower,
      path: "/ai-measurements",
      enabled: hasAnyCapability(["platform.scans.view", "workspace.scans.view"]),
    },
  ].filter((item) => item.enabled);
  const totalDevices = deviceData.reduce(
    (sum: number, item: SmartHealthChartSlice) => sum + Number(item.value || 0),
    0,
  );
  const onlineDevices =
    deviceData.find((item: SmartHealthChartSlice) =>
      String(item.name || "")
        .toLowerCase()
        .includes("hoạt"),
    )?.value ??
    stats.devicesOnline ??
    0;
  const offlineDevices = Math.max(0, totalDevices - Number(onlineDevices || 0));
  const onlinePercent =
    totalDevices > 0 ? Math.round((Number(onlineDevices || 0) / totalDevices) * 100) : 0;
  const devicePieData =
    totalDevices > 0
      ? deviceData.filter((item: SmartHealthChartSlice) => Number(item.value || 0) > 0)
      : [{ name: "Chưa có dữ liệu", value: 1, color: "#E2E8F0" }];
  const devicePiePadding = devicePieData.length > 1 ? 3 : 0;
  const totalAiJobs = aiJobData.reduce(
    (sum: number, item: SmartHealthChartSlice) => sum + Number(item.value || 0),
    0,
  );
  const recentAlerts = [
    stats.pendingDoctors > 0 && {
      type: "info" as const,
      title: "Bác sĩ mới chờ duyệt",
      desc: `${stats.pendingDoctors} yêu cầu cần kiểm tra hồ sơ và cấp quyền.`,
      time: "Cập nhật theo dữ liệu thật",
      onClick: () => navigate("/doctor-approval"),
    },
    offlineDevices > 0 && {
      type: "error" as const,
      title: "Thiết bị mất kết nối",
      desc: `${offlineDevices} thiết bị cần kiểm tra heartbeat và kết nối.`,
      time: "Theo trạng thái thiết bị",
      onClick: () => navigate("/devices"),
    },
    stats.aiJobsFailed > 0 && {
      type: "warning" as const,
      title: "AI job lỗi",
      desc: `${stats.aiJobsFailed} job cần chạy lại hoặc kiểm tra chất lượng audio.`,
      time: "Theo hàng xử lý AI",
      onClick: () => navigate("/ai-measurements"),
    },
    {
      type: "info" as const,
      title: "Dung lượng audio",
      desc: `Đã sử dụng ${stats.storageUsed} cho dữ liệu lượt đo.`,
      time: "Theo storage backend",
      onClick: () => navigate("/storage"),
    },
  ].filter(Boolean) as Array<{
    type: "error" | "warning" | "info";
    title: string;
    desc: string;
    time: string;
    onClick: () => void;
  }>;

  return (
    <div className="space-y-6">
      <ExportReportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <PageHeader
        eyebrow={isPlatformAdmin ? "Platform Admin Console" : "Workspace Portal"}
        title={isPlatformAdmin ? "Tổng quan hệ thống" : workspaceName}
        description={
          isPlatformAdmin
            ? "Theo dõi workspaces, gói dịch vụ, thiết bị, storage, lượt đo và AI trên toàn nền tảng."
            : `Vai trò ${roleLabel || "workspace"} đang xem dữ liệu trong workspace hiện tại.`
        }
        action={
          <>
            <select
              id="overview-time-range"
              name="overview-time-range"
              aria-label="Khoảng thời gian thống kê"
              className="bg-card border border-border rounded-md px-3 py-1.5 text-sm outline-none"
            >
              <option>Hôm nay</option>
              <option>7 ngày qua</option>
              <option>30 ngày qua</option>
            </select>
            <motion.button
              onClick={() => setExportOpen(true)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="group inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Download className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
              Xuất báo cáo
            </motion.button>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!isPlatformAdmin && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {portalModules.map((module) => (
            <button
              key={module.path}
              type="button"
              onClick={() => navigate(module.path)}
              className="flex min-h-20 flex-col items-start justify-between rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <module.icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-foreground">{module.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          title="Phòng khám"
          value={isLoading ? "..." : String(stats.clinics)}
          icon={Building2}
          trend="+1"
          trendUp={true}
          onClick={() => navigate("/clinics")}
        />
        <KPICard
          title="Bác sĩ chờ duyệt"
          value={isLoading ? "..." : String(stats.pendingDoctors)}
          icon={UserCheck}
          trend="Mới"
          trendUp={true}
          alert={!isLoading && stats.pendingDoctors > 0}
          onClick={() => navigate("/doctor-approval")}
        />
        <KPICard
          title="Thiết bị online"
          value={isLoading ? "..." : String(stats.devicesOnline)}
          icon={MonitorSpeaker}
          trend="Đang chạy"
          trendUp={true}
          onClick={() => navigate("/devices")}
        />
        <KPICard
          title="Tổng Lượt đo"
          value={isLoading ? "..." : String(stats.scansCount)}
          icon={Activity}
          trend="Ghi nhận"
          trendUp={true}
          onClick={() => navigate("/ai-measurements")}
        />
        <KPICard
          title="AI Job thất bại"
          value={isLoading ? "..." : String(stats.aiJobsFailed)}
          icon={AlertTriangle}
          trend={!isLoading && stats.aiJobsFailed > 0 ? "Chú ý" : "Tốt"}
          trendUp={!isLoading && stats.aiJobsFailed === 0}
          alert={!isLoading && stats.aiJobsFailed > 0}
          onClick={() => navigate("/ai-measurements")}
        />
        <KPICard
          title="Storage đã dùng"
          value={isLoading ? "..." : stats.storageUsed}
          icon={Database}
          trend="Bình thường"
          trendUp={true}
          onClick={() => navigate("/storage")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <AnimatedCard className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold">Lượt đo theo thời gian (Hôm nay)</h2>
            <button
              onClick={() => navigate("/ai-measurements")}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Xem chi tiết <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                id="main-area"
                data={measureData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs key="defs">
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0B5C9A" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0B5C9A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid key="grid" strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  key="x-axis"
                  id="x-axis"
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748B" }}
                  dy={10}
                />
                <YAxis
                  key="y-axis"
                  id="y-axis"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748B" }}
                />
                <Tooltip
                  key="tooltip"
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  itemStyle={{ color: "#0F172A", fontWeight: 500 }}
                />
                <Area
                  key="area"
                  type="monotone"
                  dataKey="count"
                  stroke="#0B5C9A"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCount)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AnimatedCard>

        {/* Device Status & Alerts */}
        <div className="space-y-6">
          <AnimatedCard className="p-5" delay={0.05}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Trạng thái thiết bị</h2>
              <button
                onClick={() => navigate("/devices")}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="rounded-xl border border-primary/10 bg-gradient-to-br from-primary/5 via-card to-success/5 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Tỷ lệ online</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{onlinePercent}%</p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  Đang nhận heartbeat
                </div>
              </div>
              <div className="flex items-center">
                <div className="relative h-[132px] w-[132px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart id="main-pie">
                      <Pie
                        data={devicePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={60}
                        paddingAngle={devicePiePadding}
                        dataKey="value"
                        stroke="none"
                      >
                        {devicePieData.map((entry: SmartHealthChartSlice) => (
                          <Cell key={`cell-${entry.name}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-foreground">{totalDevices}</span>
                    <span className="text-[11px] text-muted-foreground">thiết bị</span>
                  </div>
                </div>
                <div className="ml-4 flex-1 space-y-3">
                  <button
                    onClick={() => navigate("/devices")}
                    className="flex w-full items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors hover:border-success/20 hover:bg-success/5"
                  >
                    <div className="w-3 h-3 rounded-full bg-success flex-shrink-0"></div>
                    <span className="text-muted-foreground">Đang hoạt động</span>
                    <span className="font-semibold text-foreground ml-auto">{onlineDevices}</span>
                  </button>
                  <button
                    onClick={() => navigate("/devices")}
                    className="flex w-full items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors hover:border-border hover:bg-muted/50"
                  >
                    <div className="w-3 h-3 rounded-full bg-border flex-shrink-0"></div>
                    <span className="text-muted-foreground">Mất kết nối</span>
                    <span className="font-semibold text-foreground ml-auto">{offlineDevices}</span>
                  </button>
                </div>
              </div>
            </div>
          </AnimatedCard>

          <AnimatedCard className="p-5" delay={0.08}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Trạng thái AI job</h2>
              {stats.aiJobsFailed > 0 && (
                <StatusBadge label={`${stats.aiJobsFailed} thất bại`} tone="error" />
              )}
            </div>
            <div className="space-y-3">
              {aiJobData.map((job: SmartHealthChartSlice) => (
                <button
                  key={job.name}
                  onClick={() => navigate("/ai-measurements")}
                  className="w-full rounded-lg border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-muted/40"
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
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.max(7, Math.min(100, totalAiJobs > 0 ? (job.value / totalAiJobs) * 100 : 0))}%`,
                      }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: job.color }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </AnimatedCard>

          <AnimatedCard className="p-5" delay={0.1}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Cảnh báo gần đây</h2>
              <button
                onClick={() => navigate("/notifications")}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Tất cả <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <AlertItem
                  key={alert.title}
                  type={alert.type}
                  title={alert.title}
                  desc={alert.desc}
                  time={alert.time}
                  onClick={alert.onClick}
                />
              ))}
            </div>
          </AnimatedCard>
        </div>
      </div>
    </div>
  );
}

type IconComponent = React.ComponentType<{ className?: string }>;

function KPICard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  alert = false,
  onClick,
}: {
  title: string;
  value: string;
  icon: IconComponent;
  trend: string;
  trendUp: boolean;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="bg-card border border-border rounded-xl p-4 shadow-sm text-left w-full hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 group cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={`p-2 rounded-lg ${alert ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div
          className={`flex items-center text-xs font-medium ${trendUp ? "text-success" : "text-destructive"}`}
        >
          {trendUp ? (
            <ArrowUpRight className="w-3 h-3 mr-1" />
          ) : (
            <ArrowDownRight className="w-3 h-3 mr-1" />
          )}
          {trend}
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
          {value}
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-1">
          {title}
          <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
        </div>
      </div>
    </motion.button>
  );
}

function AlertItem({
  type,
  title,
  desc,
  time,
  onClick,
}: {
  type: "error" | "warning" | "info";
  title: string;
  desc: string;
  time: string;
  onClick: () => void;
}) {
  const isError = type === "error";
  const isWarning = type === "warning";

  return (
    <button
      onClick={onClick}
      className="flex gap-3 w-full text-left p-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors group"
    >
      <div
        className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${isError ? "bg-destructive" : isWarning ? "bg-warning" : "bg-primary"}`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {title}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</div>
        <div className="text-xs text-muted-foreground mt-1 opacity-70">{time}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex-shrink-0" />
    </button>
  );
}
