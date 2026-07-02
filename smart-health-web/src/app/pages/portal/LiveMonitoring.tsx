import { useQuery } from "@tanstack/react-query";
import { Activity, Radio, WifiOff } from "lucide-react";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function LiveMonitoringPage() {
  const query = useQuery({
    queryKey: ["portal", "monitoring"],
    queryFn: smartHealthApi.monitoring,
    refetchInterval: 5_000,
  });
  if (query.isLoading) return <PortalLoading label="Đang kết nối giám sát cloud..." />;
  if (query.error || !query.data)
    return (
      <PortalError
        error={query.error || new Error("Không có dữ liệu monitoring")}
        retry={() => query.refetch()}
      />
    );
  const online = query.data.devices.filter((device) => device.online || device.connected);
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex gap-2 items-center">
            <Radio size={22} />
            Theo dõi trực tiếp
          </h1>
          <p className="text-sm text-[#94b8d0]">Tự làm mới mỗi 5 giây từ backend.</p>
        </div>
        <span className="text-xs text-[#00FFD1] flex gap-2 items-center">
          <span className="w-2 h-2 rounded-full bg-[#00FFD1] animate-pulse" />
          LIVE
        </span>
      </div>
      {!query.data.devices.length ? (
        <PortalEmpty label="Không có thiết bị trong workspace." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {query.data.devices.map((device) => (
            <div key={device.id} className="glass-panel rounded-2xl p-5">
              <div className="flex justify-between">
                <div className="text-white font-mono">{device.name || device.id}</div>
                {device.online || device.connected ? (
                  <Activity className="text-[#00FFD1]" size={18} />
                ) : (
                  <WifiOff className="text-[#F59E0B]" size={18} />
                )}
              </div>
              <div className="mt-5 text-sm text-[#94b8d0] space-y-2">
                <div className="flex justify-between">
                  <span>Audio</span>
                  <b className="text-white">{device.audioStatus || "idle"}</b>
                </div>
                <div className="flex justify-between">
                  <span>Pin</span>
                  <b className="text-white">{device.battery ?? 0}%</b>
                </div>
                <div className="flex justify-between">
                  <span>IP</span>
                  <b className="text-white">{device.ipAddress || "—"}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="glass-panel rounded-2xl p-5">
        <h2 className="text-white font-semibold mb-3">
          Cảnh báo realtime ({query.data.alerts.length})
        </h2>
        {query.data.alerts.length ? (
          <div className="space-y-2">
            {query.data.alerts.map((alert, index) => (
              <div
                key={String(alert.id || index)}
                className="rounded-xl border border-[#F59E0B]/20 bg-[#F59E0B]/5 p-3 text-sm text-[#F59E0B]"
              >
                {String(alert.message || alert.title || "Cảnh báo thiết bị")}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[#94b8d0]">Không có cảnh báo thiết bị.</div>
        )}
      </div>
      <div className="text-xs text-[#94b8d0]">
        Thiết bị online: {online.length}/{query.data.devices.length}
      </div>
    </div>
  );
}
