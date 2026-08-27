import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Search } from "lucide-react";
import { Link } from "react-router";

import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { DataTableShell } from "../../../components/ui/data-table-shell";
import { FilterBar } from "../../../components/ui/filter-bar";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { PageHeader } from "../../../components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../../components/ui/state-surface";
import {
  StatusBadge,
  type StatusTone,
} from "../../../components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { smartHealthApi, type Scan } from "../../../lib/smart-health-api";
import { portalWorkspaceQueryKey } from "../../../lib/workspace-query-cache";
import { useAuth } from "../../context/AuthContext";

const PAGE_LIMIT = 25;

const STATUS_LABELS: Record<string, string> = {
  created: "Đã tạo",
  uploading: "Đang tải lên",
  queued: "Trong hàng đợi",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  failed: "Thất bại",
  needs_review: "Cần xem lại",
  interrupted: "Bị gián đoạn",
};

function statusTone(status?: string): StatusTone {
  if (status === "completed") {
    return "success";
  }
  if (status === "failed" || status === "interrupted") {
    return "danger";
  }
  if (status === "needs_review") {
    return "warning";
  }
  if (
    status === "processing" ||
    status === "uploading" ||
    status === "queued"
  ) {
    return "info";
  }
  return "neutral";
}

function formatScanTime(scan: Scan) {
  const value = scan.createdAt || scan.startedAt;
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Không xác định"
    : parsed.toLocaleString("vi-VN");
}

function formatAiResult(scan: Scan) {
  const label = scan.aiLabel || "Đang chờ";
  return scan.aiConfidence == null
    ? label
    : `${label} (${Math.round(scan.aiConfidence * 100)}%)`;
}

function ScanStatusBadge({ status }: { status?: string }) {
  return (
    <StatusBadge tone={statusTone(status)}>
      {STATUS_LABELS[status || ""] || status || "Chưa xác định"}
    </StatusBadge>
  );
}

export default function RecordsPage() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspace.id || "";
  const [status, setStatus] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);
  const scans = useQuery({
    queryKey: portalWorkspaceQueryKey(
      workspaceId,
      "scans",
      "records",
      search,
      status,
      sort,
      page,
      PAGE_LIMIT,
    ),
    queryFn: () =>
      smartHealthApi.listScans({
        q: search,
        status,
        page,
        limit: PAGE_LIMIT,
        sort,
      }),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  const rows = scans.data?.scans || [];
  const pagination = scans.data?.pagination;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchDraft.trim());
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lượt đo & hồ sơ"
        description="Tra cứu dữ liệu thật trong workspace hiện tại. Bộ lọc và phân trang được xử lý bởi backend."
        icon={<FileText aria-hidden="true" className="size-[1.375rem]" />}
      />

      <FilterBar
        aria-label="Tìm kiếm và lọc lượt đo"
        title="Tìm kiếm và lọc"
        description="Nhập từ khóa rồi chọn Tìm kiếm để tránh gửi yêu cầu khi đang gõ."
        contentClassName="sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_13rem_13rem_auto]"
        onSubmit={submitSearch}
      >
        <div className="space-y-2 sm:col-span-2 xl:col-span-1">
          <Label htmlFor="portal-record-search">Từ khóa</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="portal-record-search"
              name="portalRecordSearch"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="min-h-11 pl-10"
              placeholder="Mã lượt đo, bệnh nhân..."
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="portal-record-status">Trạng thái</Label>
          <Select
            value={status || "all"}
            onValueChange={(value) => {
              setStatus(value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger id="portal-record-status" className="min-h-11">
              <SelectValue placeholder="Tất cả trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
              <SelectItem value="needs_review">Cần xem lại</SelectItem>
              <SelectItem value="completed">Hoàn tất</SelectItem>
              <SelectItem value="processing">Đang xử lý</SelectItem>
              <SelectItem value="failed">Thất bại</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="portal-record-sort">Sắp xếp</Label>
          <Select
            value={sort}
            onValueChange={(value) => {
              setSort(value);
              setPage(1);
            }}
          >
            <SelectTrigger id="portal-record-sort" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt:desc">Mới nhất trước</SelectItem>
              <SelectItem value="createdAt:asc">Cũ nhất trước</SelectItem>
              <SelectItem value="status:asc">Trạng thái A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="min-h-11 self-end">
          <Search aria-hidden="true" />
          Tìm kiếm
        </Button>
      </FilterBar>

      {scans.isPending ? (
        <LoadingState label="Đang tải danh sách lượt đo..." rows={4} />
      ) : scans.error ? (
        <ErrorState
          title="Không thể tải danh sách lượt đo"
          error={scans.error}
          retry={() => void scans.refetch()}
        />
      ) : !rows.length ? (
        <EmptyState
          title="Không có lượt đo phù hợp"
          description="Không có lượt đo phù hợp trên trang này."
          action={
            page > 1 ? (
              <Button variant="outline" onClick={() => setPage(page - 1)}>
                <ChevronLeft aria-hidden="true" />
                Quay lại trang trước
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTableShell
            label="Danh sách lượt đo trong workspace hiện tại"
            className="hidden md:block"
          >
            <Table className="min-w-[52rem]">
              <caption className="sr-only">
                Danh sách lượt đo trong workspace hiện tại
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Bệnh nhân</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>Chất lượng tín hiệu</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell className="font-medium text-foreground">
                      {scan.patient?.name || scan.patientId || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatScanTime(scan)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {scan.deviceId || "—"}
                    </TableCell>
                    <TableCell>{formatAiResult(scan)}</TableCell>
                    <TableCell>
                      <ScanStatusBadge status={scan.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" className="min-h-11">
                        <Link to={`/portal/records/${scan.id}`}>
                          Chi tiết
                          <ChevronRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableShell>

          <div className="grid gap-3 md:hidden">
            {rows.map((scan) => (
              <Card key={scan.id} className="shadow-sm">
                <CardHeader className="gap-3 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {scan.patient?.name ||
                          scan.patientId ||
                          "Chưa xác định"}
                      </CardTitle>
                      <CardDescription className="mt-1 font-mono">
                        {scan.id}
                      </CardDescription>
                    </div>
                    <ScanStatusBadge status={scan.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Thời gian
                      </dt>
                      <dd className="mt-1 text-foreground">
                        {formatScanTime(scan)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Thiết bị
                      </dt>
                      <dd className="mt-1 break-all font-mono text-xs text-foreground">
                        {scan.deviceId || "—"}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">
                        Chất lượng tín hiệu
                      </dt>
                      <dd className="mt-1 text-foreground">
                        {formatAiResult(scan)}
                      </dd>
                    </div>
                  </dl>
                  <Button asChild variant="outline" className="min-h-11 w-full">
                    <Link to={`/portal/records/${scan.id}`}>
                      Xem chi tiết
                      <ChevronRight aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {scans.data && (rows.length > 0 || page > 1) ? (
        <nav
          aria-label="Phân trang lượt đo"
          className="flex flex-col items-center justify-between gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-sm sm:flex-row"
        >
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {pagination?.total == null
              ? `Trang ${page} · ${rows.length} mục trên trang`
              : `Trang ${page} · ${rows.length} / ${pagination.total} lượt đo`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={page <= 1 || scans.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label="Trang trước"
            >
              <ChevronLeft aria-hidden="true" />
              Trước
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={!pagination?.hasNextPage || scans.isFetching}
              onClick={() => setPage((current) => current + 1)}
              aria-label="Trang tiếp theo"
            >
              Sau
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
