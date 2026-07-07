import { useQuery } from "@tanstack/react-query";
import { BarChart2, Download } from "lucide-react";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi } from "../../../lib/smart-health-api";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function ReportsPage() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["portal", "reports", user?.currentWorkspace.id],
    queryFn: smartHealthApi.reports,
  });
  if (query.isLoading) return <PortalLoading />;
  if (query.error || !query.data) return <PortalError error={query.error} />;
  const { summary, latestScans } = query.data;
  const downloadCsv = () => {
    const rows = [
      ["Mã lượt đo", "Bệnh nhân", "Thiết bị", "Trạng thái", "Kết quả AI", "Thời gian"],
      ...latestScans.map((scan) => [
        scan.id,
        scan.patient?.name || scan.patientId,
        scan.deviceId,
        scan.status,
        scan.aiLabel,
        scan.createdAt,
      ]),
    ];
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `smart-health-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex gap-2 items-center">
            <BarChart2 size={22} />
            Báo cáo vận hành
          </h1>
          <p className="text-sm text-[#94b8d0]">{user?.currentWorkspace.name}</p>
        </div>
        <button id="portal-export-csv" onClick={downloadCsv} className="premium-button flex gap-2 items-center">
          <Download size={15} />
          Xuất CSV
        </button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Bệnh nhân", summary.patientsCount],
          ["Thiết bị", summary.devicesCount],
          ["Lượt đo", summary.scansCount],
          ["Lượt đo bất thường", summary.abnormalScansCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="glass-panel rounded-2xl p-5">
            <div className="text-xs text-[#94b8d0]">{label}</div>
            <div className="text-3xl font-black text-[#00FFD1] mt-3">{value || 0}</div>
          </div>
        ))}
      </div>
      <div className="glass-panel rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="text-left text-xs uppercase text-[#94b8d0] border-b border-white/10">
              {["Lượt đo", "Bệnh nhân", "Thiết bị", "Kết quả AI", "Thời gian"].map((h) => (
                <th key={h} className="p-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {latestScans.map((scan) => (
              <tr key={scan.id} className="border-b border-white/5">
                <td className="p-4 text-xs font-mono text-white">{scan.id}</td>
                <td className="p-4 text-sm text-white">
                  {scan.patient?.name || scan.patientId || "—"}
                </td>
                <td className="p-4 text-sm text-[#94b8d0]">{scan.deviceId || "—"}</td>
                <td className="p-4 text-sm text-[#00FFD1]">{scan.aiLabel || "—"}</td>
                <td className="p-4 text-xs text-[#94b8d0]">
                  {scan.createdAt ? new Date(scan.createdAt).toLocaleString("vi-VN") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
