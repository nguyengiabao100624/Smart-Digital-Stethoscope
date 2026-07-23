import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi } from "../../../lib/smart-health-api";

function hasAnyCapability(capabilities: string[], candidates: string[]) {
  return candidates.some((capability) => capabilities.includes(capability));
}

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const capabilities = user?.capabilities || [];
  const workspace = user?.raw.currentWorkspace || user?.raw.workspace;
  const canViewPatients = hasAnyCapability(capabilities, [
    "workspace.patients.view",
    "workspace.patients.manage",
    "personal.profiles.manage",
  ]);
  const canViewDevices = hasAnyCapability(capabilities, [
    "workspace.devices.view",
    "workspace.devices.manage",
    "personal.devices.manage",
  ]);
  const canViewBilling = capabilities.includes("billing.view");

  const patients = useQuery({
    queryKey: ["portal", "patients", "onboarding", user?.currentWorkspace.id],
    queryFn: () => smartHealthApi.listPatients(),
    enabled: canViewPatients,
  });
  const devices = useQuery({
    queryKey: ["portal", "devices", "onboarding", user?.currentWorkspace.id],
    queryFn: smartHealthApi.listDevices,
    enabled: canViewDevices,
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
  ];

  if (canViewPatients) {
    items.push({
      label: "Có ít nhất một bệnh nhân",
      done: Boolean(patients.data?.patients.length),
      to: "/portal/patients",
    });
  }

  if (canViewDevices) {
    items.push(
      {
        label: "Có ít nhất một thiết bị",
        done: Boolean(devices.data?.devices.length),
        to: "/portal/devices",
      },
      {
        label: "Thiết bị đang online",
        done: Boolean(
          devices.data?.devices.some((device) => device.online || device.connected),
        ),
        to: "/portal/live",
      },
    );
  }

  if (canViewBilling) {
    items.push({
      label: "Gói dịch vụ đã sẵn sàng",
      done: Boolean(workspace?.packageId || workspace?.subscriptionStatus),
      to: "/portal/billing",
    });
  }

  const completed = items.filter((item) => item.done).length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="hero-gradient-text flex items-center gap-2">
          <Rocket size={22} />
          Bắt đầu với Smart Health
        </h1>
        <p className="text-sm text-[#94b8d0]">
          Tiến độ được tính từ dữ liệu backend thật và các quyền của role hiện tại:{" "}
          {completed}/{items.length} bước.
        </p>
      </div>
      <div className="glass-panel divide-y divide-white/5 rounded-2xl">
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="flex items-center gap-3 p-5 hover:bg-white/5"
          >
            {item.done ? (
              <CheckCircle2 className="text-[#00FFD1]" size={20} />
            ) : (
              <Circle className="text-[#94b8d0]" size={20} />
            )}
            <span className={item.done ? "text-white" : "text-[#94b8d0]"}>
              {item.label}
            </span>
            <span className="ml-auto text-xs text-[#00FFD1]">Mở →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
