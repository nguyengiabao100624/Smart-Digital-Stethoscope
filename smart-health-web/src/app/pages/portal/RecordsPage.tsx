import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { Link } from "react-router";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function RecordsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const scans = useQuery({
    queryKey: ["portal", "scans", user?.currentWorkspace.id, status],
    queryFn: () => smartHealthApi.listScans({ status, limit: 200 }),
  });
  const rows = (scans.data?.scans || []).filter(
    (scan) =>
      !search ||
      [scan.patient?.name, scan.patientId, scan.id, scan.aiLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search.toLowerCase())),
  );
  return (
    <div className="space-y-5">
      <div>
        <h1 className="hero-gradient-text flex items-center gap-2">
          <FileText size={22} />
          Lượt đo & hồ sơ
        </h1>
        <p className="text-sm text-[#94b8d0]">Dữ liệu thật từ workspace hiện tại</p>
      </div>
      <div className="glass-panel rounded-2xl p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-60">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94b8d0]" />
          <input
            id="portal-record-search"
            name="portalRecordSearch"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="portal-input pl-10"
            placeholder="Tìm lượt đo, bệnh nhân..."
          />
        </div>
        <select
          id="portal-record-status"
          name="portalRecordStatus"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="portal-input max-w-52"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="needs_review">Cần xem lại</option>
          <option value="completed">Hoàn tất</option>
          <option value="processing">Đang xử lý</option>
        </select>
      </div>
      {scans.isLoading ? (
        <PortalLoading />
      ) : scans.error ? (
        <PortalError error={scans.error} retry={() => scans.refetch()} />
      ) : !rows.length ? (
        <PortalEmpty label="Không có lượt đo phù hợp." />
      ) : (
        <div className="glass-panel rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="text-left text-xs uppercase text-[#94b8d0] border-b border-white/10">
                {["Bệnh nhân", "Thời gian", "Thiết bị", "Kết quả AI", "Trạng thái", ""].map((h) => (
                  <th key={h} className="p-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((scan) => (
                <tr key={scan.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-4 text-white">{scan.patient?.name || scan.patientId || "—"}</td>
                  <td className="p-4 text-sm text-[#94b8d0]">
                    {scan.createdAt || scan.startedAt
                      ? new Date(scan.createdAt || scan.startedAt || "").toLocaleString("vi-VN")
                      : "—"}
                  </td>
                  <td className="p-4 text-sm font-mono text-[#94b8d0]">{scan.deviceId || "—"}</td>
                  <td className="p-4 text-sm text-white">
                    {scan.aiLabel || "Đang chờ"}
                    {scan.aiConfidence != null ? ` (${Math.round(scan.aiConfidence * 100)}%)` : ""}
                  </td>
                  <td className="p-4 text-sm text-[#F59E0B]">{scan.status || "—"}</td>
                  <td className="p-4">
                    <Link to={`/portal/records/${scan.id}`} className="text-[#00FFD1] text-sm">
                      Chi tiết →
                    </Link>
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
