import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, Clock, Stethoscope, Users } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function DashboardPage() {
  const { user } = useAuth();
  const overview = useQuery({
    queryKey: ["portal", "overview", user?.currentWorkspace.id],
    queryFn: smartHealthApi.overview,
  });
  const scans = useQuery({
    queryKey: ["portal", "scans", "recent", user?.currentWorkspace.id],
    queryFn: () => smartHealthApi.listScans({ limit: 5 }),
  });
  const devices = useQuery({
    queryKey: ["portal", "devices", user?.currentWorkspace.id],
    queryFn: smartHealthApi.listDevices,
  });
  if (overview.isLoading || scans.isLoading || devices.isLoading)
    return <PortalLoading label="Đang tổng hợp dữ liệu workspace..." />;
  if (overview.error)
    return <PortalError error={overview.error} retry={() => overview.refetch()} />;
  const stats = overview.data?.stats || {};
  const recentScans = scans.data?.scans || [];
  const deviceList = devices.data?.devices || [];
  const online = deviceList.filter((device) => device.online || device.connected).length;
  const needsReview = recentScans.filter(
    (scan) =>
      ["needs_review", "abnormal", "warning"].includes(scan.status || "") ||
      scan.aiLabel?.toLowerCase().includes("abnormal"),
  ).length;
  const cards = [
    {
      label: "Bệnh nhân",
      value: stats.patientsCount || 0,
      icon: Users,
      color: "#00FFD1",
      to: "/portal/patients",
    },
    {
      label: "Lượt đo",
      value: stats.scansCount || 0,
      icon: Activity,
      color: "#4AA4E0",
      to: "/portal/records",
    },
    {
      label: "Cần xem lại",
      value: needsReview,
      icon: AlertCircle,
      color: "#F59E0B",
      to: "/portal/records/review",
    },
    {
      label: "Thiết bị online",
      value: online,
      icon: Stethoscope,
      color: "#7257E8",
      to: "/portal/devices",
    },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="hero-gradient-text">Tổng quan</h1>
          <p className="text-[#94b8d0] text-sm">{user?.currentWorkspace.name}</p>
        </div>
        <Link to="/portal/patients" className="premium-button text-sm">
          Thêm bệnh nhân
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color, to }) => (
          <Link
            key={label}
            to={to}
            className="rounded-2xl p-5 border transition hover:-translate-y-1"
            style={{
              background: `linear-gradient(135deg,${color}14,rgba(11,28,52,.65))`,
              borderColor: `${color}35`,
            }}
          >
            <div className="flex justify-between text-xs uppercase tracking-wider text-[#94b8d0]">
              <span>{label}</span>
              <Icon size={18} style={{ color }} />
            </div>
            <div className="text-3xl font-black mt-5" style={{ color }}>
              {value}
            </div>
          </Link>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 glass-panel rounded-2xl overflow-hidden">
          <div className="p-4 flex justify-between border-b border-white/10">
            <h2 className="font-semibold text-white">Lượt đo gần đây</h2>
            <Link to="/portal/records" className="text-xs text-[#00FFD1]">
              Xem tất cả
            </Link>
          </div>
          <div className="divide-y divide-white/5">
            {recentScans.length ? (
              recentScans.map((scan) => (
                <Link
                  key={scan.id}
                  to={`/portal/records/${scan.id}`}
                  className="p-4 flex items-center gap-3 hover:bg-white/5"
                >
                  <Clock size={15} className="text-[#4AA4E0]" />
                  <div className="flex-1">
                    <div className="text-sm text-white">
                      {scan.patient?.name || scan.patientId || "Chưa gán bệnh nhân"}
                    </div>
                    <div className="text-xs text-[#94b8d0]">
                      {scan.aiLabel || scan.status || "Đang xử lý"}
                    </div>
                  </div>
                  <div className="text-xs text-[#94b8d0]">
                    {scan.createdAt ? new Date(scan.createdAt).toLocaleString("vi-VN") : ""}
                  </div>
                </Link>
              ))
            ) : (
              <div className="p-8 text-center text-[#94b8d0]">Chưa có lượt đo.</div>
            )}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <h2 className="font-semibold text-white mb-4">Thiết bị</h2>
          <div className="text-sm text-[#94b8d0] space-y-2">
            <div className="flex justify-between">
              <span>Tổng số</span>
              <b className="text-white">{deviceList.length}</b>
            </div>
            <div className="flex justify-between">
              <span>Online</span>
              <b className="text-[#00FFD1]">{online}</b>
            </div>
            <div className="flex justify-between">
              <span>Offline</span>
              <b className="text-[#F59E0B]">{deviceList.length - online}</b>
            </div>
          </div>
          <Link
            to="/portal/devices"
            className="mt-5 block text-center rounded-xl border border-white/10 py-2 text-sm text-[#00FFD1]"
          >
            Quản lý thiết bị
          </Link>
        </div>
      </div>
    </div>
  );
}
