import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExportReportDialog } from "./dialogs/ExportReportDialog";
import {
  Search,
  Filter,
  FileText,
  Clock,
  User,
  Monitor,
  ArrowRightCircle,
  Download,
  ShieldCheck,
  Code2,
} from "lucide-react";
import { PageHeader } from "./design-system";
import { PaginationFooter } from "./PaginationFooter";
import { ADMIN_TABLE_PAGE_SIZE, paginateItems } from "./pagination-utils";
import { smartHealthApi, type SmartHealthAccessLog } from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";

type AuditRow = {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  resource: string;
  status: string;
  ipAddress: string;
};

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
    second: "2-digit",
  }).format(date);
}

function mapBackendLog(log: SmartHealthAccessLog, index: number): AuditRow {
  const metadata = log.metadata ? JSON.stringify(log.metadata) : "Backend event";

  return {
    id: log.id || `LOG-BE-${index + 1}`,
    timestamp: formatDateTime(log.createdAt),
    user: log.userId || "backend",
    role: "Backend",
    action: log.action || "Sự kiện hệ thống",
    resource: metadata,
    status: log.severity === "error" ? "failure" : "success",
    ipAddress: log.ip || "--",
  };
}

export function AuditLog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    smartHealthApi
      .listAccessLogs()
      .then(({ logs: backendLogs }) => {
        if (cancelled) return;
        setLogs(backendLogs.map(mapBackendLog));
        setBackendError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setLogs([]);
          setBackendError(toVietnameseErrorMessage(err, "Không thể tải audit log."));
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

  const visibleLogs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return logs;
    }

    return logs.filter((log) =>
      [log.id, log.timestamp, log.user, log.role, log.action, log.resource, log.ipAddress]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [logs, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, logs.length]);

  const pagedLogs = useMemo(
    () => paginateItems(visibleLogs, page, ADMIN_TABLE_PAGE_SIZE),
    [page, visibleLogs],
  );

  return (
    <div className="space-y-6 h-full flex flex-col">
      <ExportReportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <PageHeader
        eyebrow="Bảo mật y tế"
        title="Audit log"
        description="Theo dõi actor, vai trò, tổ chức, hành động, tài nguyên, IP, user agent và kết quả để phục vụ truy vết."
        action={
          <motion.button
            onClick={() => setExportOpen(true)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            className="group flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Download className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
            Xuất báo cáo CSV
          </motion.button>
        }
      />

      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Audit log là bất biến. Dữ liệu chỉ được export theo quyền quản trị.</span>
      </div>

      {backendError && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#B45309]">
          Chưa tải được audit log từ backend. Trang không dùng dữ liệu mẫu để tránh hiển thị sai:{" "}
          {backendError}
        </div>
      )}

      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center bg-muted/20">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm user, hành động, IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-shadow"
            />
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <input
              type="date"
              className="bg-card border border-border rounded-md px-3 py-2 text-sm outline-none w-full sm:w-auto text-muted-foreground"
            />
            <select className="bg-card border border-border rounded-md px-3 py-2 text-sm outline-none w-full sm:w-auto text-muted-foreground">
              <option value="all">Tất cả hành động</option>
              <option value="auth">Xác thực</option>
              <option value="data">Dữ liệu</option>
              <option value="system">Hệ thống</option>
            </select>
            <button className="flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex-shrink-0">
              <Filter className="w-4 h-4" /> Lọc
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr>
                <th className="px-5 py-3 font-medium">Thời gian</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">Vai trò</th>
                <th className="px-5 py-3 font-medium">Tổ chức</th>
                <th className="px-5 py-3 font-medium">Hành động</th>
                <th className="px-5 py-3 font-medium">Resource type</th>
                <th className="px-5 py-3 font-medium">Resource ID</th>
                <th className="px-5 py-3 font-medium">IP</th>
                <th className="px-5 py-3 font-medium">User agent</th>
                <th className="px-5 py-3 font-medium">Kết quả</th>
                <th className="px-5 py-3 font-medium text-right">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors font-mono text-xs">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {log.timestamp}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <div>
                        <div className="text-foreground font-medium">{log.user}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{log.role}</td>
                  <td className="px-5 py-4 text-muted-foreground">Smart Health</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 font-medium">
                      <ArrowRightCircle className="w-3.5 h-3.5 text-primary" />
                      {log.action}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">admin_event</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" />
                      {log.resource}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5" />
                      {log.ipAddress}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">Chrome / Windows</td>
                  <td className="px-5 py-4">
                    {log.status === "success" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-success/10 text-success border border-success/20 uppercase tracking-wider">
                        Thành công
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20 uppercase tracking-wider">
                        Thất bại
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right text-muted-foreground">
                    <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted">
                      <Code2 className="w-3.5 h-3.5" />
                      JSON
                    </button>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={11} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}
              {!isLoading && visibleLogs.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không tìm thấy log phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          totalItems={visibleLogs.length}
          sourceTotalItems={logs.length}
          itemLabel="logs"
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
