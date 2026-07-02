import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function AlertCenterPage() {
  const monitoring = useQuery({
    queryKey: ["portal", "monitoring", "alerts"],
    queryFn: smartHealthApi.monitoring,
    refetchInterval: 10_000,
  });
  if (monitoring.isLoading) return <PortalLoading />;
  if (monitoring.error || !monitoring.data) return <PortalError error={monitoring.error} />;
  const alerts = monitoring.data.alerts;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <AlertTriangle size={22} />
          Trung tâm cảnh báo
        </h1>
        <p className="text-sm text-[#94b8d0]">
          Cảnh báo được suy ra từ heartbeat và trạng thái thiết bị backend.
        </p>
      </div>
      {!alerts.length ? (
        <PortalEmpty label="Không có cảnh báo đang hoạt động." />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <div
              key={String(alert.id || index)}
              className="rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-5"
            >
              <div className="font-semibold text-[#F59E0B]">
                {String(alert.title || "Cảnh báo")}
              </div>
              <div className="text-sm text-[#94b8d0] mt-2">{String(alert.message || "")}</div>
              <div className="text-xs text-white/50 mt-3">
                {alert.createdAt ? new Date(String(alert.createdAt)).toLocaleString("vi-VN") : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
