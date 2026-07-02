import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function ReviewQueuePage() {
  const query = useQuery({
    queryKey: ["portal", "scans", "review"],
    queryFn: () => smartHealthApi.listScans({ status: "needs_review", limit: 200 }),
  });
  const scans = query.data?.scans || [];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <AlertTriangle size={22} />
          Hàng đợi cần xem lại
        </h1>
        <p className="text-sm text-[#94b8d0]">Các lượt đo backend đánh dấu needs_review.</p>
      </div>
      {query.isLoading ? (
        <PortalLoading />
      ) : query.error ? (
        <PortalError error={query.error} />
      ) : !scans.length ? (
        <PortalEmpty label="Không có lượt đo chờ xem lại." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {scans.map((scan) => (
            <Link
              key={scan.id}
              to={`/portal/records/${scan.id}`}
              className="glass-panel rounded-2xl p-5 hover:border-[#F59E0B]/40"
            >
              <div className="text-white font-semibold">
                {scan.patient?.name || scan.patientId || scan.id}
              </div>
              <div className="text-[#F59E0B] text-sm mt-2">
                {scan.aiLabel || "Cần bác sĩ xem lại"}
              </div>
              <div className="text-xs text-[#94b8d0] mt-3">
                {scan.createdAt ? new Date(scan.createdAt).toLocaleString("vi-VN") : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
