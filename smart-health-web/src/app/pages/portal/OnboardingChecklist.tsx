import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const patients = useQuery({
    queryKey: ["portal", "patients", "onboarding"],
    queryFn: () => smartHealthApi.listPatients(),
  });
  const devices = useQuery({
    queryKey: ["portal", "devices", "onboarding"],
    queryFn: smartHealthApi.listDevices,
  });
  const items = [
    {
      label: "Hồ sơ tài khoản đã đồng bộ",
      done: Boolean(user?.name && user.email),
      to: "/portal/settings",
    },
    {
      label: "Workspace đã được gán",
      done: Boolean(user?.currentWorkspace.id),
      to: "/portal/workspace",
    },
    {
      label: "Có ít nhất một bệnh nhân",
      done: Boolean(patients.data?.patients.length),
      to: "/portal/patients",
    },
    {
      label: "Có ít nhất một thiết bị",
      done: Boolean(devices.data?.devices.length),
      to: "/portal/devices",
    },
    {
      label: "Thiết bị đang online",
      done: Boolean(devices.data?.devices.some((device) => device.online || device.connected)),
      to: "/portal/live",
    },
  ];
  const completed = items.filter((item) => item.done).length;
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <Rocket size={22} />
          Bắt đầu với Smart Health
        </h1>
        <p className="text-sm text-[#94b8d0]">
          Tiến độ được tính từ dữ liệu backend thật: {completed}/{items.length} bước.
        </p>
      </div>
      <div className="glass-panel rounded-2xl divide-y divide-white/5">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="p-5 flex items-center gap-3 hover:bg-white/5"
          >
            {item.done ? (
              <CheckCircle2 className="text-[#00FFD1]" size={20} />
            ) : (
              <Circle className="text-[#94b8d0]" size={20} />
            )}
            <span className={item.done ? "text-white" : "text-[#94b8d0]"}>{item.label}</span>
            <span className="ml-auto text-xs text-[#00FFD1]">Mở →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
