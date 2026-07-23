import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  BarChart2,
  Download,
  FileHeart,
  RotateCcw,
  Stethoscope,
  Users,
} from "lucide-react";

import { PortalExportDialog } from "../../components/PortalExportDialog";
import { PortalLoading } from "../../components/PortalState";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi, type Scan } from "../../../lib/smart-health-api";

const NUMBER_FORMAT = new Intl.NumberFormat("vi-VN");

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })
    : value;
}

function statusLabel(status?: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") return "Hoàn tất";
  if (normalized === "processing") return "Đang xử lý";
  if (normalized === "failed") return "Thất bại";
  if (normalized === "uploading") return "Đang tải lên";
  if (normalized === "queued") return "Đang chờ";
  if (normalized === "recording") return "Đang ghi";
  if (normalized === "interrupted") return "Bị gián đoạn";
  return status || "Chưa xác định";
}

function statusClass(status?: string) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") {
    return "border-emerald-600/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  }
  if (normalized === "failed" || normalized === "interrupted") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (["processing", "uploading", "queued", "recording"].includes(normalized)) {
    return "border-primary/25 bg-primary/10 text-primary";
  }
  return "border-border bg-muted text-muted-foreground";
}

function ReportLoadError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <section
      className="rounded-xl border border-destructive/25 bg-destructive/5 p-5"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-destructive"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Chưa thể tải báo cáo</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "Backend chưa trả về dữ liệu báo cáo workspace."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 h-11"
            onClick={retry}
          >
            <RotateCcw aria-hidden="true" />
            Thử lại
          </Button>
        </div>
      </div>
    </section>
  );
}

function MobileScanCard({ scan }: { scan: Scan }) {
  return (
    <article className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-all font-mono text-xs font-semibold text-foreground">
            {scan.id}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(scan.createdAt)}
          </p>
        </div>
        <Badge variant="outline" className={statusClass(scan.status)}>
          {statusLabel(scan.status)}
        </Badge>
      </div>
      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Bệnh nhân</dt>
          <dd className="min-w-0 break-words text-right text-foreground">
            {scan.patient?.name || scan.patientId || "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Thiết bị</dt>
          <dd className="min-w-0 break-all text-right text-foreground">
            {scan.deviceId || "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Nhãn xử lý</dt>
          <dd className="min-w-0 break-words text-right text-foreground">
            {scan.aiLabel || "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const query = useQuery({
    queryKey: ["portal", "reports", user?.currentWorkspace.id],
    queryFn: smartHealthApi.reports,
  });
  const canExport = Boolean(
    user?.capabilities.some((capability) =>
      [
        "workspace.exports.manage",
        "workspace.assigned_data.export",
        "personal.data.export",
      ].includes(capability),
    ),
  );

  if (query.isLoading) {
    return <PortalLoading label="Đang tải báo cáo workspace..." />;
  }
  if (query.error || !query.data) {
    return (
      <ReportLoadError error={query.error} retry={() => query.refetch()} />
    );
  }

  const { summary, latestScans } = query.data;
  const metrics = [
    {
      label: "Bệnh nhân trong phạm vi",
      value: summary.patientsCount,
      Icon: Users,
    },
    {
      label: "Thiết bị trong phạm vi",
      value: summary.devicesCount,
      Icon: Stethoscope,
    },
    {
      label: "Tổng lượt đo",
      value: summary.scansCount,
      Icon: Activity,
    },
    {
      label: "Được đánh dấu bất thường",
      value: summary.abnormalScansCount,
      Icon: FileHeart,
    },
  ];

  return (
    <div className="space-y-6" data-testid="portal-reports-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-primary">
            <BarChart2 aria-hidden="true" className="size-5" />
            <span className="text-sm font-semibold">Tổng hợp workspace</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-foreground">
            Báo cáo vận hành
          </h1>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            Số liệu thật từ{" "}
            {user?.currentWorkspace.name || "workspace hiện tại"}, giới hạn theo
            quyền và phạm vi dữ liệu của tài khoản.
          </p>
        </div>

        {canExport ? (
          <Button
            id="portal-report-export"
            type="button"
            className="h-11 shrink-0"
            onClick={() => setExportOpen(true)}
          >
            <Download aria-hidden="true" />
            Xuất dữ liệu
          </Button>
        ) : (
          <p className="max-w-xs rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Bạn có thể xem báo cáo nhưng chưa có quyền xuất dữ liệu.
          </p>
        )}
      </header>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Chỉ số báo cáo"
      >
        {metrics.map(({ label, value, Icon }) => (
          <article
            key={label}
            className="rounded-xl border bg-card p-5 text-card-foreground"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted-foreground">{label}</p>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon aria-hidden="true" className="size-4" />
              </span>
            </div>
            <p className="mt-4 text-3xl font-bold tabular-nums tracking-[-0.03em] text-foreground">
              {NUMBER_FORMAT.format(Number(value || 0))}
            </p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground">
        <div className="border-b px-4 py-4">
          <h2 className="text-base font-semibold">Lượt đo gần đây</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhãn xử lý chỉ hỗ trợ ưu tiên review, không thay thế kết luận của
            người có chuyên môn.
          </p>
        </div>

        {latestScans.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Activity
              aria-hidden="true"
              className="mx-auto size-8 text-muted-foreground"
            />
            <h3 className="mt-3 text-base font-semibold">Chưa có lượt đo</h3>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              Backend chưa ghi nhận lượt đo nào trong phạm vi tài khoản hiện
              tại.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableCaption className="sr-only">
                  Hai mươi lượt đo gần nhất trong phạm vi báo cáo workspace
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Lượt đo</TableHead>
                    <TableHead>Bệnh nhân</TableHead>
                    <TableHead>Thiết bị</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Nhãn xử lý</TableHead>
                    <TableHead>Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latestScans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="px-4 font-mono text-xs text-foreground">
                        {scan.id}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {scan.patient?.name || scan.patientId || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {scan.deviceId || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusClass(scan.status)}
                        >
                          {statusLabel(scan.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {scan.aiLabel || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(scan.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">
              {latestScans.map((scan) => (
                <MobileScanCard key={scan.id} scan={scan} />
              ))}
            </div>
          </>
        )}
      </section>

      <PortalExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        dataset="clinical_bundle"
        expectedWorkspaceId={user?.currentWorkspace.id || ""}
        title="Xuất dữ liệu được phép truy cập"
        description="Backend tự xác định phạm vi workspace, bệnh nhân được phân công hoặc dữ liệu cá nhân theo capability hiện tại; Portal không thể mở rộng phạm vi này."
      />
    </div>
  );
}
