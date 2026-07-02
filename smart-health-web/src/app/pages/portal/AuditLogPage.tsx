import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Search } from "lucide-react";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function AuditLogPage() {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["portal", "audit-log"],
    queryFn: smartHealthApi.listAuditLogs,
  });
  const logs = (query.data?.logs || []).filter(
    (log) =>
      !search ||
      [log.action, log.userId, JSON.stringify(log.metadata || {})].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <ClipboardList size={22} />
          Audit log workspace
        </h1>
        <p className="text-sm text-[#94b8d0]">
          Lịch sử do backend ghi nhận, đã giới hạn theo workspace.
        </p>
      </div>
      <div className="glass-panel rounded-2xl p-4 relative max-w-md">
        <Search size={15} className="absolute left-7 top-1/2 -translate-y-1/2 text-[#94b8d0]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="portal-input pl-10"
          placeholder="Tìm hành động, người dùng..."
        />
      </div>
      {query.isLoading ? (
        <PortalLoading />
      ) : query.error ? (
        <PortalError error={query.error} retry={() => query.refetch()} />
      ) : !logs.length ? (
        <PortalEmpty label="Không có bản ghi audit phù hợp." />
      ) : (
        <div className="glass-panel rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="text-left text-xs uppercase text-[#94b8d0] border-b border-white/10">
                {["Thời gian", "Hành động", "Mức độ", "Người dùng", "Chi tiết"].map((h) => (
                  <th key={h} className="p-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <tr key={log.id || index} className="border-b border-white/5">
                  <td className="p-4 text-xs text-[#94b8d0]">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString("vi-VN") : "—"}
                  </td>
                  <td className="p-4 text-sm text-white">{log.action || "—"}</td>
                  <td className="p-4 text-sm text-[#F59E0B]">{log.severity || "info"}</td>
                  <td className="p-4 text-xs font-mono text-[#94b8d0]">{log.userId || "system"}</td>
                  <td className="p-4 text-xs text-[#94b8d0] max-w-sm truncate">
                    {JSON.stringify(log.metadata || {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
