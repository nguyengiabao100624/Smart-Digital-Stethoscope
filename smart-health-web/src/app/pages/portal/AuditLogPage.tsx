import { type FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  Filter,
  LockKeyhole,
  RotateCcw,
  Search,
  WifiOff,
} from "lucide-react";

import { PortalExportDialog } from "../../components/PortalExportDialog";
import { PortalLoading } from "../../components/PortalState";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
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
import {
  smartHealthApi,
  type ApiError,
  type AuditLog,
  type AuditLogOutcome,
  type AuditLogQuery,
  type AuditLogSort,
  type ExportFilters,
} from "../../../lib/smart-health-api";

const PAGE_SIZE = 20;

type FilterDraft = {
  q: string;
  action: string;
  resourceType: string;
  actorUserId: string;
  startDate: string;
  endDate: string;
  sort: AuditLogSort;
};

const EMPTY_FILTERS: FilterDraft = {
  q: "",
  action: "",
  resourceType: "",
  actorUserId: "",
  startDate: "",
  endDate: "",
  sort: "createdAt:desc",
};

const OUTCOME_COPY: Record<AuditLogOutcome, string> = {
  success: "Thành công",
  failure: "Thất bại",
  warning: "Cảnh báo",
  denied: "Bị từ chối",
  recorded: "Đã ghi nhận",
};

function outcomeClass(outcome: AuditLogOutcome) {
  if (outcome === "success") {
    return "border-emerald-600/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  }
  if (outcome === "failure" || outcome === "denied") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (outcome === "warning") {
    return "border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  }
  return "border-border bg-muted text-muted-foreground";
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" })
    : value;
}

function actorLabel(log: AuditLog) {
  return log.actorName || log.actorUserId || "Hệ thống";
}

function resourceLabel(log: AuditLog) {
  if (!log.resourceType && !log.resourceId) return "—";
  return [log.resourceType, log.resourceId].filter(Boolean).join(" · ");
}

function activeFilterCount(filters: FilterDraft) {
  return [
    filters.q,
    filters.action,
    filters.resourceType,
    filters.actorUserId,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;
}

function AuditLoadError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const apiError = error as ApiError;
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const forbidden = apiError?.status === 403;
  const Icon = forbidden ? LockKeyhole : offline ? WifiOff : AlertCircle;
  const title = forbidden
    ? "Không có quyền xem nhật ký"
    : offline
      ? "Thiết bị đang ngoại tuyến"
      : "Chưa thể tải nhật ký";
  const message = forbidden
    ? "Quyền workspace đã thay đổi hoặc tài khoản chưa được cấp workspace.audit.view."
    : offline
      ? "Kết nối mạng rồi thử lại. Dữ liệu cũ không được dùng thay cho audit ledger mới."
      : error instanceof Error
        ? error.message
        : "Backend chưa trả về audit ledger. Vui lòng thử lại.";

  return (
    <section
      className="rounded-xl border border-destructive/25 bg-destructive/5 p-5"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-destructive"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            {message}
          </p>
          {!forbidden ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 h-11"
              onClick={retry}
            >
              <RotateCcw aria-hidden="true" />
              Thử lại
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AuditDetailDialog({
  log,
  onOpenChange,
}: {
  log: AuditLog | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(log)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl [&>button.absolute]:flex [&>button.absolute]:size-11 [&>button.absolute]:items-center [&>button.absolute]:justify-center">
        {log ? (
          <>
            <DialogHeader>
              <DialogTitle>Chi tiết bản ghi audit</DialogTitle>
              <DialogDescription>
                Bản ghi {log.id || "không có mã"} do backend tạo lúc{" "}
                {formatDate(log.createdAt)}.
              </DialogDescription>
            </DialogHeader>

            <dl className="grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
              {[
                ["Hành động", log.action || "—"],
                ["Kết quả", OUTCOME_COPY[log.outcome] || log.outcome],
                ["Người thực hiện", actorLabel(log)],
                ["Vai trò", log.actorRole || "—"],
                [
                  "Workspace",
                  log.organizationName || log.organizationId || "—",
                ],
                ["Tài nguyên", resourceLabel(log)],
                ["Địa chỉ IP", log.ip || "—"],
                ["User agent", log.userAgent || "—"],
              ].map(([term, value]) => (
                <div key={term} className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">
                    {term}
                  </dt>
                  <dd className="mt-1 break-words text-foreground">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Metadata đã làm sạch</h3>
              <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-4 text-xs leading-6 text-foreground [overflow-wrap:anywhere] whitespace-pre-wrap">
                {JSON.stringify(log.metadata || {}, null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground">
                Trường nhạy cảm được backend che trước khi gửi đến Portal.
              </p>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const queryFilters = useMemo<AuditLogQuery>(
    () => ({
      q: applied.q || undefined,
      action: applied.action || undefined,
      resourceType: applied.resourceType || undefined,
      actorUserId: applied.actorUserId || undefined,
      startDate: applied.startDate || undefined,
      endDate: applied.endDate || undefined,
      page,
      limit: PAGE_SIZE,
      sort: applied.sort,
    }),
    [applied, page],
  );
  const query = useQuery({
    queryKey: ["portal", "audit-log", user?.currentWorkspace.id, queryFilters],
    queryFn: () => smartHealthApi.listAuditLogs(queryFilters),
    placeholderData: (previous) => previous,
  });

  const logs = query.data?.logs || [];
  const pagination = query.data?.pagination;
  const filterCount = activeFilterCount(applied);
  const canExportAudit = Boolean(
    user?.capabilities.includes("workspace.audit.export"),
  );
  const exportFilters = useMemo<ExportFilters>(
    () => ({
      q: applied.q || undefined,
      action: applied.action || undefined,
      resourceType: applied.resourceType || undefined,
      actorUserId: applied.actorUserId || undefined,
      startDate: applied.startDate || undefined,
      endDate: applied.endDate || undefined,
      sort: applied.sort,
    }),
    [applied],
  );

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApplied({ ...draft });
    setPage(1);
  };

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  return (
    <div className="space-y-6" data-testid="portal-audit-page">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-primary">
            <ClipboardList aria-hidden="true" className="size-5" />
            <span className="text-sm font-semibold">Kiểm soát workspace</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-foreground">
            Nhật ký audit
          </h1>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            Theo dõi hành động do backend ghi nhận trong{" "}
            {user?.currentWorkspace.name || "workspace hiện tại"}. Bộ lọc và
            phân trang được xử lý trên server.
          </p>
        </div>

        {canExportAudit ? (
          <Button
            id="portal-audit-export"
            type="button"
            className="h-11 shrink-0"
            onClick={() => setExportOpen(true)}
          >
            <Download aria-hidden="true" />
            Xuất nhật ký
          </Button>
        ) : (
          <p className="max-w-xs rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Bạn có quyền xem nhưng chưa có quyền xuất nhật ký workspace.
          </p>
        )}
      </header>

      <form
        onSubmit={applyFilters}
        className="rounded-xl border bg-card p-4 text-card-foreground"
        aria-label="Bộ lọc nhật ký audit"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter aria-hidden="true" className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Bộ lọc server</h2>
            {filterCount ? (
              <Badge variant="secondary">{filterCount} đang áp dụng</Badge>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={resetFilters}
          >
            <RotateCcw aria-hidden="true" />
            Đặt lại
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-5">
            <Label htmlFor="portal-audit-search">
              Tìm trong trường định danh
            </Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="portal-audit-search"
                name="q"
                value={draft.q}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, q: event.target.value }))
                }
                className="h-11 pl-10"
                placeholder="Mã, người thực hiện, hành động, tài nguyên, IP..."
                autoComplete="off"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Metadata không nằm trong phạm vi tìm kiếm.
            </p>
          </div>

          <div className="space-y-2 lg:col-span-3">
            <Label htmlFor="portal-audit-action">Hành động</Label>
            <Input
              id="portal-audit-action"
              name="action"
              value={draft.action}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  action: event.target.value,
                }))
              }
              className="h-11"
              placeholder="Ví dụ: scan.review"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="portal-audit-resource">Loại tài nguyên</Label>
            <Input
              id="portal-audit-resource"
              name="resourceType"
              value={draft.resourceType}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  resourceType: event.target.value,
                }))
              }
              className="h-11"
              placeholder="scan"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="portal-audit-actor">Mã người thực hiện</Label>
            <Input
              id="portal-audit-actor"
              name="actorUserId"
              value={draft.actorUserId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  actorUserId: event.target.value,
                }))
              }
              className="h-11"
              placeholder="user_..."
              autoComplete="off"
            />
          </div>

          <div className="space-y-2 lg:col-span-3">
            <Label htmlFor="portal-audit-start-date">Từ ngày</Label>
            <Input
              id="portal-audit-start-date"
              name="startDate"
              type="date"
              value={draft.startDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  startDate: event.target.value,
                }))
              }
              className="h-11"
            />
          </div>

          <div className="space-y-2 lg:col-span-3">
            <Label htmlFor="portal-audit-end-date">Đến ngày</Label>
            <Input
              id="portal-audit-end-date"
              name="endDate"
              type="date"
              min={draft.startDate || undefined}
              value={draft.endDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  endDate: event.target.value,
                }))
              }
              className="h-11"
            />
          </div>

          <div className="space-y-2 lg:col-span-3">
            <Label htmlFor="portal-audit-sort">Sắp xếp</Label>
            <Select
              value={draft.sort}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  sort: value as AuditLogSort,
                }))
              }
            >
              <SelectTrigger id="portal-audit-sort" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt:desc">Mới nhất trước</SelectItem>
                <SelectItem value="createdAt:asc">Cũ nhất trước</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end lg:col-span-3">
            <Button
              id="portal-audit-apply-filters"
              type="submit"
              className="h-11 w-full"
            >
              <Search aria-hidden="true" />
              Áp dụng bộ lọc
            </Button>
          </div>
        </div>
      </form>

      {query.isLoading ? (
        <PortalLoading label="Đang tải audit ledger..." />
      ) : query.isError ? (
        <AuditLoadError error={query.error} retry={() => query.refetch()} />
      ) : logs.length === 0 ? (
        <section className="rounded-xl border bg-card px-5 py-12 text-center">
          <ClipboardList
            aria-hidden="true"
            className="mx-auto size-8 text-muted-foreground"
          />
          <h2 className="mt-3 text-base font-semibold">
            Không có bản ghi phù hợp
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            Backend không trả về sự kiện nào trong phạm vi và bộ lọc hiện tại.
          </p>
          {filterCount ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 h-11"
              onClick={resetFilters}
            >
              Xóa bộ lọc
            </Button>
          ) : null}
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border bg-card text-card-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">Sự kiện đã ghi nhận</h2>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {pagination?.total?.toLocaleString("vi-VN") ??
                  logs.length.toLocaleString("vi-VN")}{" "}
                bản ghi
                {query.isFetching ? " · đang cập nhật" : ""}
              </p>
            </div>
            <Badge variant="outline">Trang {pagination?.page || page}</Badge>
          </div>

          <div className="hidden md:block">
            <Table>
              <TableCaption className="sr-only">
                Nhật ký audit workspace, phân trang và lọc bởi backend
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[10.5rem] px-4">Thời gian</TableHead>
                  <TableHead>Người thực hiện</TableHead>
                  <TableHead>Hành động</TableHead>
                  <TableHead>Tài nguyên</TableHead>
                  <TableHead>Kết quả</TableHead>
                  <TableHead className="w-20 text-right">Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="px-4 text-xs text-muted-foreground">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-foreground">
                        {actorLabel(log)}
                      </p>
                      <p className="max-w-56 truncate text-xs text-muted-foreground">
                        {log.actorRole || log.actorUserId || "system"}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground">
                      {log.action || "—"}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                      {resourceLabel(log)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={outcomeClass(log.outcome)}
                      >
                        {OUTCOME_COPY[log.outcome] || log.outcome}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        onClick={() => setSelectedLog(log)}
                        aria-label={`Xem chi tiết ${log.action || log.id}`}
                      >
                        <Eye aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="divide-y md:hidden">
            {logs.map((log) => (
              <article key={log.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs font-semibold text-foreground">
                      {log.action || "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(log.createdAt)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={outcomeClass(log.outcome)}
                  >
                    {OUTCOME_COPY[log.outcome] || log.outcome}
                  </Badge>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Người thực hiện</dt>
                    <dd className="min-w-0 break-words text-right text-foreground">
                      {actorLabel(log)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Tài nguyên</dt>
                    <dd className="min-w-0 break-all text-right text-foreground">
                      {resourceLabel(log)}
                    </dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => setSelectedLog(log)}
                >
                  <Eye aria-hidden="true" />
                  Xem chi tiết
                </Button>
              </article>
            ))}
          </div>

          <nav
            className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            aria-label="Phân trang nhật ký audit"
          >
            <p className="text-sm text-muted-foreground">
              Trang {pagination?.page || page}
              {pagination?.pageCount ? ` / ${pagination.pageCount}` : ""}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 sm:flex-none"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft aria-hidden="true" />
                Trang trước
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 sm:flex-none"
                disabled={!pagination?.hasNextPage || query.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Trang sau
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </nav>
        </section>
      )}

      <AuditDetailDialog
        log={selectedLog}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      />
      <PortalExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        dataset="audit_logs"
        expectedWorkspaceId={user?.currentWorkspace.id || ""}
        title="Xuất nhật ký audit"
        description="Tạo tệp từ đúng bộ lọc đang áp dụng. Backend kiểm tra quyền, đóng phạm vi workspace và ghi nhận cả thao tác tạo lẫn tải."
        filters={exportFilters}
      />
    </div>
  );
}
