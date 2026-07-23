import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  ArrowRightCircle,
  Building2,
  Clock,
  Code2,
  Download,
  FileText,
  Filter,
  LockKeyhole,
  Monitor,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  User,
  WifiOff,
  X,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  smartHealthApi,
  type SmartHealthApiError,
  type SmartHealthAuditLog,
  type SmartHealthAuditLogFilters,
  type SmartHealthAuditLogPagination,
  type SmartHealthAuditLogSort,
} from "@/lib/smart-health-api";
import { ExportReportDialog } from "./dialogs/ExportReportDialog";
import { PageHeader, StatusBadge } from "./design-system";
import { PaginationFooter } from "./PaginationFooter";
import { ADMIN_TABLE_PAGE_SIZE } from "./pagination-utils";
import { AUDIT_EXPORT_CAPABILITIES, AUDIT_VIEW_CAPABILITIES } from "./action-permissions";
import { useAdminAccess } from "./useAdminAccess";

type AuditFilterForm = Required<
  Pick<
    SmartHealthAuditLogFilters,
    "q" | "action" | "resourceType" | "actorUserId" | "startDate" | "endDate" | "sort"
  >
>;

type FailureKind = "offline" | "forbidden" | "error" | null;

const EMPTY_FILTERS: AuditFilterForm = {
  q: "",
  action: "",
  resourceType: "",
  actorUserId: "",
  startDate: "",
  endDate: "",
  sort: "createdAt:desc",
};

const EMPTY_PAGINATION: SmartHealthAuditLogPagination = {
  page: 1,
  limit: ADMIN_TABLE_PAGE_SIZE,
  total: 0,
  pageCount: 0,
  hasNextPage: false,
  sort: "createdAt:desc",
};

const SORT_OPTIONS: Array<{ value: SmartHealthAuditLogSort; label: string }> = [
  { value: "createdAt:desc", label: "Mới nhất trước" },
  { value: "createdAt:asc", label: "Cũ nhất trước" },
  { value: "action:asc", label: "Hành động A–Z" },
  { value: "action:desc", label: "Hành động Z–A" },
];

function formatDateTime(value?: string | null) {
  if (!value) return "Không ghi nhận";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function displayValue(value?: string | null) {
  return value?.trim() || "Không ghi nhận";
}

function outcomePresentation(outcome: string) {
  switch (outcome) {
    case "success":
      return { label: "Thành công", tone: "success" as const };
    case "failure":
      return { label: "Thất bại", tone: "error" as const };
    case "warning":
      return { label: "Cảnh báo", tone: "warning" as const };
    case "denied":
      return { label: "Bị từ chối", tone: "error" as const };
    default:
      return {
        label: outcome === "recorded" ? "Đã ghi nhận" : displayValue(outcome),
        tone: "muted" as const,
      };
  }
}

function apiStatus(error: unknown) {
  return error && typeof error === "object" && "status" in error
    ? Number((error as SmartHealthApiError).status || 0)
    : 0;
}

function normalizeFilters(filters: AuditFilterForm): AuditFilterForm {
  return {
    q: filters.q.trim(),
    action: filters.action.trim(),
    resourceType: filters.resourceType.trim(),
    actorUserId: filters.actorUserId.trim(),
    startDate: filters.startDate,
    endDate: filters.endDate,
    sort: filters.sort,
  };
}

function countActiveFilters(filters: AuditFilterForm) {
  return [
    filters.q,
    filters.action,
    filters.resourceType,
    filters.actorUserId,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;
}

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}

export function AuditLog() {
  const { accessCheckComplete, hasAnyCapability } = useAdminAccess();
  const canViewAudit = accessCheckComplete && hasAnyCapability(AUDIT_VIEW_CAPABILITIES);
  const canExportAudit = accessCheckComplete && hasAnyCapability(AUDIT_EXPORT_CAPABILITIES);
  const isOnline = useOnlineStatus();
  const [draftFilters, setDraftFilters] = useState<AuditFilterForm>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilterForm>(EMPTY_FILTERS);
  const [filterError, setFilterError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SmartHealthAuditLog | null>(null);
  const [logs, setLogs] = useState<SmartHealthAuditLog[]>([]);
  const [pagination, setPagination] = useState<SmartHealthAuditLogPagination>(EMPTY_PAGINATION);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [failureKind, setFailureKind] = useState<FailureKind>(null);
  const [backendError, setBackendError] = useState("");
  const [page, setPage] = useState(1);
  const [reloadVersion, setReloadVersion] = useState(0);
  const hasLoadedData = useRef(false);
  const activeFilterCount = countActiveFilters(appliedFilters);
  const exportFilters = useMemo<SmartHealthAuditLogFilters>(
    () => ({ ...appliedFilters }),
    [appliedFilters],
  );

  useEffect(() => {
    if (!accessCheckComplete) return;
    if (!canViewAudit) {
      setLogs([]);
      setPagination(EMPTY_PAGINATION);
      hasLoadedData.current = false;
      setFailureKind("forbidden");
      setBackendError("Tài khoản hiện tại không có capability xem audit log.");
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const controller = new AbortController();
    const hasCurrentData = hasLoadedData.current;
    setIsLoading(!hasCurrentData);
    setIsRefreshing(hasCurrentData);
    setFailureKind(null);
    setBackendError("");

    smartHealthApi
      .listAuditLogs(
        {
          ...appliedFilters,
          page,
          limit: ADMIN_TABLE_PAGE_SIZE,
        },
        controller.signal,
      )
      .then((response) => {
        setLogs(response.logs);
        setPagination(response.pagination);
        hasLoadedData.current = response.logs.length > 0;
        setFailureKind(null);
        setBackendError("");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const denied = apiStatus(error) === 403;
        const offline = !navigator.onLine;
        if (denied) {
          setLogs([]);
          setPagination(EMPTY_PAGINATION);
          hasLoadedData.current = false;
        }
        setFailureKind(denied ? "forbidden" : offline ? "offline" : "error");
        setBackendError(
          denied
            ? "Backend từ chối quyền xem audit log của phạm vi hiện tại."
            : offline
              ? "Thiết bị đang ngoại tuyến. Dữ liệu chưa thể đồng bộ với backend."
              : toVietnameseErrorMessage(error, "Không thể tải nhật ký audit."),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      });

    return () => controller.abort();
  }, [accessCheckComplete, appliedFilters, canViewAudit, page, reloadVersion]);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      draftFilters.startDate &&
      draftFilters.endDate &&
      draftFilters.endDate < draftFilters.startDate
    ) {
      setFilterError("Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.");
      return;
    }
    setFilterError("");
    setPage(1);
    setAppliedFilters(normalizeFilters(draftFilters));
    setReloadVersion((value) => value + 1);
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setFilterError("");
    setPage(1);
    setReloadVersion((value) => value + 1);
  };

  const retry = () => setReloadVersion((value) => value + 1);

  return (
    <div className="flex h-full flex-col space-y-6">
      {canExportAudit ? (
        <ExportReportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          dataset="audit_logs"
          filters={exportFilters}
        />
      ) : null}
      <AuditMetadataDialog
        log={selectedLog}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      />

      <PageHeader
        title="Nhật ký audit"
        description="Truy vết actor, workspace, hành động, tài nguyên, thiết bị truy cập và kết quả từ ledger backend bất biến."
        action={
          canExportAudit ? (
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Xuất audit
            </button>
          ) : null
        }
      />

      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          Giao diện chỉ đọc ledger và gửi bộ lọc tới backend. Metadata nhạy cảm được backend che
          trước khi trả về.
        </span>
      </div>

      {!accessCheckComplete ? (
        <AuditLoadingState />
      ) : !canViewAudit || failureKind === "forbidden" ? (
        <AuditState
          icon={LockKeyhole}
          title="Không có quyền xem nhật ký audit"
          description={backendError || "Hãy yêu cầu quản trị viên cấp capability audit phù hợp."}
        />
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <form
            onSubmit={applyFilters}
            aria-label="Bộ lọc nhật ký audit"
            className="space-y-4 border-b border-border bg-muted/15 p-4"
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(150px,0.38fr)_minmax(150px,0.38fr)_minmax(170px,0.38fr)]">
              <label className="space-y-1.5 text-sm font-medium text-foreground">
                <span>Tìm trong audit log</span>
                <span className="relative block">
                  <Search
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={draftFilters.q}
                    onChange={(event) =>
                      setDraftFilters((current) => ({ ...current, q: event.target.value }))
                    }
                    placeholder="ID, actor, workspace, hành động, IP..."
                    className="min-h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </span>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-foreground">
                <span>Từ ngày</span>
                <input
                  type="date"
                  value={draftFilters.startDate}
                  onChange={(event) =>
                    setDraftFilters((current) => ({ ...current, startDate: event.target.value }))
                  }
                  className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-foreground">
                <span>Đến ngày</span>
                <input
                  type="date"
                  value={draftFilters.endDate}
                  onChange={(event) =>
                    setDraftFilters((current) => ({ ...current, endDate: event.target.value }))
                  }
                  className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-foreground">
                <span>Sắp xếp</span>
                <select
                  value={draftFilters.sort}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      sort: event.target.value as SmartHealthAuditLogSort,
                    }))
                  }
                  className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <details className="rounded-lg border border-border bg-background">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Bộ lọc chính xác
                </span>
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {activeFilterCount} đang áp dụng
                  </span>
                ) : null}
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-border p-3 md:grid-cols-3">
                <label className="space-y-1.5 text-sm font-medium text-foreground">
                  <span>Hành động chính xác</span>
                  <input
                    type="text"
                    value={draftFilters.action}
                    onChange={(event) =>
                      setDraftFilters((current) => ({ ...current, action: event.target.value }))
                    }
                    placeholder="Ví dụ: export.download"
                    className="min-h-11 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-foreground">
                  <span>Loại tài nguyên</span>
                  <input
                    type="text"
                    value={draftFilters.resourceType}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        resourceType: event.target.value,
                      }))
                    }
                    placeholder="Ví dụ: export"
                    className="min-h-11 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-foreground">
                  <span>Actor user ID</span>
                  <input
                    type="text"
                    value={draftFilters.actorUserId}
                    onChange={(event) =>
                      setDraftFilters((current) => ({
                        ...current,
                        actorUserId: event.target.value,
                      }))
                    }
                    placeholder="User ID chính xác"
                    className="min-h-11 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
            </details>

            {filterError ? (
              <p role="alert" className="text-sm text-destructive">
                {filterError}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                Lọc và phân trang được xử lý trên backend; giao diện không lọc lại một trang dữ liệu
                cục bộ.
              </p>
              <div className="flex flex-wrap gap-2">
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Xóa bộ lọc
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={isRefreshing || !isOnline}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Filter className="h-4 w-4" aria-hidden="true" />
                  {isRefreshing ? "Đang cập nhật..." : "Áp dụng bộ lọc"}
                </button>
              </div>
            </div>
          </form>

          {!isOnline ? (
            <AuditInlineNotice
              icon={WifiOff}
              title="Đang ngoại tuyến"
              description={
                logs.length
                  ? "Bảng đang giữ dữ liệu đã tải gần nhất. Hãy kết nối mạng rồi tải lại để đồng bộ."
                  : "Chưa có dữ liệu cục bộ để hiển thị. Hãy kết nối mạng rồi tải lại."
              }
              onRetry={isOnline ? retry : undefined}
            />
          ) : failureKind === "error" || failureKind === "offline" ? (
            <AuditInlineNotice
              icon={AlertTriangle}
              title={logs.length ? "Không thể làm mới dữ liệu" : "Không thể tải nhật ký audit"}
              description={backendError}
              onRetry={retry}
            />
          ) : null}

          {isLoading ? (
            <AuditLoadingState embedded />
          ) : logs.length === 0 ? (
            <AuditEmptyState hasFilters={activeFilterCount > 0} onClear={clearFilters} />
          ) : (
            <>
              <div className="hidden overflow-x-auto xl:block">
                <table className="data-table min-w-[1440px] table-fixed text-left text-sm">
                  <caption className="sr-only">
                    Nhật ký audit từ backend, gồm actor, workspace, hành động, tài nguyên và kết
                    quả.
                  </caption>
                  <thead>
                    <tr>
                      <th className="w-44 px-4 py-3 font-medium">Thời gian</th>
                      <th className="w-52 px-4 py-3 font-medium">Actor</th>
                      <th className="w-32 px-4 py-3 font-medium">Vai trò</th>
                      <th className="w-52 px-4 py-3 font-medium">Workspace</th>
                      <th className="w-48 px-4 py-3 font-medium">Hành động</th>
                      <th className="w-40 px-4 py-3 font-medium">Tài nguyên</th>
                      <th className="w-36 px-4 py-3 font-medium">IP</th>
                      <th className="w-64 px-4 py-3 font-medium">User agent</th>
                      <th className="w-36 px-4 py-3 font-medium">Kết quả</th>
                      <th className="w-28 px-4 py-3 text-right font-medium">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {logs.map((log) => (
                      <AuditTableRow key={log.id} log={log} onInspect={() => setSelectedLog(log)} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 p-3 xl:hidden">
                {logs.map((log) => (
                  <AuditMobileCard key={log.id} log={log} onInspect={() => setSelectedLog(log)} />
                ))}
              </div>
            </>
          )}

          {!isLoading && pagination.total > 0 ? (
            <PaginationFooter
              page={pagination.page || page}
              pageSize={pagination.limit || ADMIN_TABLE_PAGE_SIZE}
              totalItems={pagination.total}
              itemLabel="bản ghi"
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function AuditTableRow({ log, onInspect }: { log: SmartHealthAuditLog; onInspect: () => void }) {
  const outcome = outcomePresentation(log.outcome);
  const actorLabel = log.actorName || log.actorUserId;
  const workspaceLabel = log.organizationName || log.organizationId;
  return (
    <tr className="transition-colors hover:bg-muted/25">
      <td className="px-4 py-3 align-top">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{formatDateTime(log.createdAt)}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex min-w-0 items-start gap-2">
          <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground" title={actorLabel}>
              {displayValue(actorLabel)}
            </div>
            {log.actorName && log.actorUserId ? (
              <div
                className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                title={log.actorUserId}
              >
                {log.actorUserId}
              </div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
        {displayValue(log.actorRole)}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex min-w-0 items-start gap-2">
          <Building2
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="truncate text-xs text-foreground" title={workspaceLabel}>
              {displayValue(workspaceLabel)}
            </div>
            {log.organizationName && log.organizationId ? (
              <div
                className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                title={log.organizationId}
              >
                {log.organizationId}
              </div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-start gap-2 text-xs font-medium text-foreground">
          <ArrowRightCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span className="break-words">{displayValue(log.action)}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="text-xs text-foreground">{displayValue(log.resourceType)}</div>
        <div
          className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
          title={log.resourceId}
        >
          {displayValue(log.resourceId)}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {displayValue(log.ip)}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <p
          className="line-clamp-2 break-all text-xs leading-5 text-muted-foreground"
          title={log.userAgent}
        >
          {displayValue(log.userAgent)}
        </p>
      </td>
      <td className="px-4 py-3 align-top">
        <StatusBadge label={outcome.label} tone={outcome.tone} />
      </td>
      <td className="px-4 py-3 text-right align-top">
        <button
          type="button"
          onClick={onInspect}
          aria-label={`Xem metadata của bản ghi ${log.id}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
          JSON
        </button>
      </td>
    </tr>
  );
}

function AuditMobileCard({ log, onInspect }: { log: SmartHealthAuditLog; onInspect: () => void }) {
  const outcome = outcomePresentation(log.outcome);
  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDateTime(log.createdAt)}
          </div>
          <h2 className="mt-2 break-words text-sm font-semibold text-foreground">
            {displayValue(log.action)}
          </h2>
        </div>
        <StatusBadge label={outcome.label} tone={outcome.tone} />
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Actor</dt>
          <dd className="mt-1 break-words font-medium text-foreground">
            {displayValue(log.actorName || log.actorUserId)}
          </dd>
          {log.actorName && log.actorUserId ? (
            <dd className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
              {log.actorUserId}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-muted-foreground">Workspace</dt>
          <dd className="mt-1 break-words font-medium text-foreground">
            {displayValue(log.organizationName || log.organizationId)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tài nguyên</dt>
          <dd className="mt-1 break-words text-foreground">
            {displayValue(log.resourceType)} · {displayValue(log.resourceId)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">IP</dt>
          <dd className="mt-1 break-all font-mono text-foreground">{displayValue(log.ip)}</dd>
        </div>
      </dl>
      <p className="mt-3 line-clamp-2 break-all text-xs leading-5 text-muted-foreground">
        {displayValue(log.userAgent)}
      </p>
      <button
        type="button"
        onClick={onInspect}
        aria-label={`Xem metadata của bản ghi ${log.id}`}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Code2 className="h-4 w-4" aria-hidden="true" />
        Xem metadata JSON
      </button>
    </article>
  );
}

function AuditMetadataDialog({
  log,
  onOpenChange,
}: {
  log: SmartHealthAuditLog | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={Boolean(log)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content className="fixed inset-4 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-auto max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Chi tiết bản ghi audit
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Dữ liệu dưới đây do backend trả về sau khi che trường nhạy cảm.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Đóng chi tiết bản ghi audit"
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {log ? (
            <div className="mt-5 min-h-0 space-y-5 overflow-y-auto pr-1">
              <dl className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4 text-sm sm:grid-cols-2">
                {[
                  ["Audit ID", log.id],
                  ["Thời gian", formatDateTime(log.createdAt)],
                  ["Actor", log.actorName || log.actorUserId],
                  ["Actor user ID", log.actorUserId],
                  ["Vai trò", log.actorRole],
                  ["Workspace", log.organizationName || log.organizationId],
                  ["Workspace ID", log.organizationId],
                  ["Hành động", log.action],
                  ["Loại tài nguyên", log.resourceType],
                  ["Resource ID", log.resourceId],
                  ["IP", log.ip],
                  ["Kết quả", outcomePresentation(log.outcome).label],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-all text-foreground">{displayValue(value)}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <h3 className="text-sm font-semibold text-foreground">User agent</h3>
                <p className="mt-2 break-all rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 text-muted-foreground">
                  {displayValue(log.userAgent)}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">Metadata JSON</h3>
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-border bg-background p-4 font-mono text-xs leading-5 text-foreground">
                  {JSON.stringify(log.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AuditInlineNotice({
  icon: Icon,
  title,
  description,
  onRetry,
}: {
  icon: typeof AlertTriangle;
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 border-b border-warning/25 bg-warning/10 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Thử lại
        </button>
      ) : null}
    </div>
  );
}

function AuditState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof LockKeyhole;
  title: string;
  description: string;
}) {
  return (
    <section className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
    </section>
  );
}

function AuditEmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <section className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <FileText className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">
        {hasFilters ? "Không có bản ghi phù hợp" : "Chưa có bản ghi audit"}
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        {hasFilters
          ? "Hãy điều chỉnh từ khóa, khoảng ngày hoặc bộ lọc chính xác rồi thử lại."
          : "Ledger backend chưa trả về sự kiện nào trong phạm vi được phép xem."}
      </p>
      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Xóa bộ lọc
        </button>
      ) : null}
    </section>
  );
}

function AuditLoadingState({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Đang tải nhật ký audit"
      className={
        embedded ? "space-y-3 p-4" : "space-y-4 rounded-xl border border-border bg-card p-4"
      }
    >
      <span className="sr-only">Đang tải nhật ký audit...</span>
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex min-h-14 items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-44" />
          <Skeleton className="hidden h-4 flex-1 md:block" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}
