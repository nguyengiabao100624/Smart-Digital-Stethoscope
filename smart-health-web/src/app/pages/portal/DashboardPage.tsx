import { useEffect, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Clock3,
  RefreshCw,
  Stethoscope,
  Users,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  smartHealthApi,
  type Scan,
} from "../../../lib/smart-health-api";
import { canAccessRoute } from "../../contracts/route-contract";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";

const scanStatusLabels: Record<string, string> = {
  created: "Đã tạo",
  uploading: "Đang tải lên",
  queued: "Đang chờ xử lý",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  failed: "Thất bại",
  error: "Thất bại",
  recording: "Đang ghi âm",
  interrupted: "Bị gián đoạn",
  needs_review: "Chờ chuyên môn xem lại",
};

function formatDateTime(value?: string) {
  if (!value) return "Chưa cập nhật thời gian";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Thời gian không hợp lệ";
  return date.toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function scanStatus(scan: Scan) {
  const normalized = String(scan.status || "").trim().toLowerCase();
  return {
    label: scanStatusLabels[normalized] || "Trạng thái chưa xác định",
    className:
      normalized === "failed" || normalized === "error"
        ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]"
        : normalized === "needs_review" || normalized === "interrupted"
          ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
          : "border-border bg-muted text-muted-foreground",
  };
}

function MetricCard({
  testId,
  label,
  value,
  description,
  icon: Icon,
  iconClassName,
  to,
}: {
  testId: string;
  label: string;
  value: number;
  description: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClassName: string;
  to?: string;
}) {
  const content = (
    <>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div className="min-w-0">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="mt-2 text-3xl font-bold tabular-nums text-foreground">
            {value.toLocaleString("vi-VN")}
          </CardTitle>
        </div>
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
        >
          <Icon aria-hidden={true} className="size-5" />
        </span>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 pt-0 text-sm text-muted-foreground">
        <span>{description}</span>
        {to ? <ArrowRight aria-hidden="true" className="size-4 shrink-0" /> : null}
      </CardContent>
    </>
  );

  return (
    <Card
      data-testid={testId}
      className="h-full overflow-hidden transition-colors duration-200 hover:border-primary/30"
    >
      {to ? (
        <Link
          to={to}
          className="block min-h-36 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`${label}: ${value.toLocaleString("vi-VN")}. ${description}`}
        >
          {content}
        </Link>
      ) : (
        <div className="min-h-36">{content}</div>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const workspaceId =
    user?.currentWorkspace?.id || user?.currentWorkspaceId || "";
  const capabilities = user?.capabilities || [];
  const canViewPatients = canAccessRoute(capabilities, "/portal/patients");
  const canViewScans = canAccessRoute(capabilities, "/portal/records");
  const canViewDevices = canAccessRoute(capabilities, "/portal/devices");
  const timezoneOffsetMinutes = -new Date().getTimezoneOffset();
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const overview = useQuery({
    queryKey: [
      "portal",
      "overview",
      workspaceId,
      "today",
      timezoneOffsetMinutes,
    ],
    queryFn: () =>
      smartHealthApi.overview(workspaceId, {
        range: "today",
        timezoneOffsetMinutes,
      }),
    enabled: Boolean(user && workspaceId),
    retry: false,
  });

  const scans = useQuery({
    queryKey: ["portal", "scans", "recent", workspaceId],
    queryFn: async () => {
      const result = await smartHealthApi.listScans({
        organizationId: workspaceId,
        limit: 5,
        sort: "createdAt:desc",
      });
      const outsideWorkspace = result.scans.some(
        (scan) =>
          scan.organizationId !== workspaceId ||
          (scan.patient?.organizationId &&
            scan.patient.organizationId !== workspaceId),
      );
      if (outsideWorkspace) {
        throw new Error(
          "Backend trả về lượt đo không thuộc workspace hiện tại. Danh sách đã bị chặn.",
        );
      }
      return result;
    },
    enabled: Boolean(user && workspaceId && canViewScans),
    retry: false,
  });

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  if (!workspaceId) {
    return (
      <PortalError
        error={new Error(
          "Tài khoản chưa có workspace hoạt động để xem tổng quan.",
        )}
      />
    );
  }

  if (overview.isLoading) {
    return <PortalLoading label="Đang tổng hợp dữ liệu workspace..." />;
  }

  if (overview.error || !overview.data) {
    return (
      <PortalError
        error={
          overview.error ||
          new Error("Backend chưa trả về snapshot tổng quan hợp lệ.")
        }
        retry={online ? () => overview.refetch() : undefined}
      />
    );
  }

  const dashboard = overview.data;
  const stats = dashboard.stats;
  const recentScans = scans.data?.scans || [];
  const refreshing = overview.isFetching || scans.isFetching;
  const refresh = () => {
    if (!online || refreshing) return;
    void overview.refetch();
    if (canViewScans) void scans.refetch();
  };

  const metrics = [
    {
      testId: "dashboard-metric-patients",
      label: "Bệnh nhân",
      value: stats.patientsCount,
      description: "Hồ sơ trong workspace",
      icon: Users,
      iconClassName: "bg-primary/10 text-primary",
      to: canViewPatients ? "/portal/patients" : undefined,
    },
    {
      testId: "dashboard-metric-scans",
      label: "Lượt đo",
      value: stats.scansCount,
      description: dashboard.range.label,
      icon: Activity,
      iconClassName: "bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
      to: canViewScans ? "/portal/records" : undefined,
    },
    {
      testId: "dashboard-metric-failed",
      label: "Lỗi xử lý",
      value: stats.aiJobsFailed,
      description: dashboard.range.label,
      icon: AlertCircle,
      iconClassName:
        stats.aiJobsFailed > 0
          ? "bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]"
          : "bg-muted text-muted-foreground",
      to: canViewScans ? "/portal/records" : undefined,
    },
    {
      testId: "dashboard-metric-devices",
      label: "Thiết bị đang online",
      value: stats.devicesOnline,
      description: `${stats.devicesOnline.toLocaleString("vi-VN")} / ${stats.devicesCount.toLocaleString("vi-VN")} thiết bị`,
      icon: Stethoscope,
      iconClassName:
        "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
      to: canViewDevices ? "/portal/devices" : undefined,
    },
  ];

  return (
    <div
      id="portal-dashboard-page"
      data-testid="portal-dashboard-page"
      className="mx-auto max-w-7xl space-y-5"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Tổng quan
              </h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {user?.currentWorkspace?.name || workspaceId}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{dashboard.range.label}</Badge>
            <span className="text-xs text-muted-foreground">
              Cập nhật {formatDateTime(dashboard.generatedAt)}
            </span>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          {canViewPatients ? (
            <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
              <Link to="/portal/patients">Quản lý bệnh nhân</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-11 w-full sm:w-auto"
            onClick={refresh}
            disabled={!online || refreshing}
            aria-label="Làm mới tổng quan"
            aria-busy={refreshing}
          >
            <RefreshCw
              aria-hidden="true"
              className={
                refreshing ? "animate-spin motion-reduce:animate-none" : ""
              }
            />
            {refreshing ? "Đang làm mới" : "Làm mới"}
          </Button>
        </div>
      </header>

      {!online ? (
        <Alert className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Bạn đang ngoại tuyến</AlertTitle>
          <AlertDescription>
            Các KPI bên dưới là snapshot gần nhất đã tải. Kết nối mạng để làm
            mới tổng quan và lượt đo gần đây.
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-label="Chỉ số tổng quan workspace"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map((metric) => (
          <MetricCard key={metric.testId} {...metric} />
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,.75fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Lượt đo gần đây</CardTitle>
              <CardDescription>
                Tối đa 5 lượt đo mới nhất trong workspace hiện tại.
              </CardDescription>
            </div>
            {canViewScans ? (
              <Button asChild variant="ghost" className="h-11 shrink-0">
                <Link to="/portal/records" aria-label="Xem tất cả lượt đo">
                  Xem tất cả
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {!canViewScans ? (
              <div className="px-6 pb-6">
                <Alert>
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Quyền truy cập giới hạn</AlertTitle>
                  <AlertDescription>
                    Bạn không có quyền xem danh sách lượt đo gần đây.
                  </AlertDescription>
                </Alert>
              </div>
            ) : scans.isLoading ? (
              <div
                className="space-y-3 px-6 pb-6"
                role="status"
                aria-label="Đang tải lượt đo gần đây"
              >
                {[0, 1, 2].map((item) => (
                  <Skeleton key={item} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : scans.error ? (
              <div className="px-6 pb-6">
                <Alert className="border-destructive/30 bg-destructive/5">
                  <AlertCircle aria-hidden="true" className="text-destructive" />
                  <AlertTitle>Không thể tải lượt đo gần đây</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <span className="block">
                      {scans.error instanceof Error
                        ? scans.error.message
                        : "Backend chưa trả về danh sách lượt đo hợp lệ."}
                    </span>
                    {online ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={() => scans.refetch()}
                        disabled={scans.isFetching}
                        aria-label="Thử tải lại lượt đo"
                      >
                        <RefreshCw aria-hidden="true" />
                        Thử lại
                      </Button>
                    ) : null}
                  </AlertDescription>
                </Alert>
              </div>
            ) : recentScans.length === 0 ? (
              <div className="px-6 pb-6">
                <PortalEmpty label="Chưa có lượt đo gần đây" />
              </div>
            ) : (
              <ul className="divide-y" aria-label="Danh sách lượt đo gần đây">
                {recentScans.map((scan) => {
                  const status = scanStatus(scan);
                  return (
                    <li key={scan.id}>
                      <Link
                        to={`/portal/records/${encodeURIComponent(scan.id)}`}
                        className="flex min-h-16 flex-col gap-3 px-6 py-4 transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center"
                        aria-label={`Mở lượt đo của ${
                          scan.patient?.name ||
                          scan.patientId ||
                          "bệnh nhân chưa xác định"
                        }, ${status.label}`}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--status-info-bg)] text-[var(--status-info-fg)]">
                          <Clock3 aria-hidden="true" className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {scan.patient?.name ||
                              scan.patientId ||
                              "Chưa gán bệnh nhân"}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDateTime(
                              scan.createdAt || scan.startedAt || scan.updatedAt,
                            )}
                          </span>
                        </span>
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thiết bị</CardTitle>
            <CardDescription>
              Trạng thái hiện diện do backend xác nhận tại thời điểm tạo
              snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.devicesCount === 0 ? (
              <PortalEmpty label="Workspace chưa có thiết bị" />
            ) : (
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Tổng số</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {stats.devicesCount.toLocaleString("vi-VN")}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Online</dt>
                  <dd className="font-semibold tabular-nums text-[var(--status-success-fg)]">
                    {stats.devicesOnline.toLocaleString("vi-VN")}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Offline</dt>
                  <dd className="font-semibold tabular-nums text-[var(--status-warning-fg)]">
                    {(stats.devicesCount - stats.devicesOnline).toLocaleString(
                      "vi-VN",
                    )}
                  </dd>
                </div>
              </dl>
            )}
            {canViewDevices ? (
              <Button asChild variant="outline" className="h-11 w-full">
                <Link to="/portal/devices" aria-label="Quản lý thiết bị">
                  Quản lý thiết bị
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Bạn chỉ có quyền xem chỉ số tổng hợp, không có quyền mở danh
                sách thiết bị.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
