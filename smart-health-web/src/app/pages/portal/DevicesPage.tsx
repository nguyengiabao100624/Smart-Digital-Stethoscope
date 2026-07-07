import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BatteryWarning, Plus, RotateCw, Stethoscope, WifiOff } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi, type Device } from "../../../lib/smart-health-api";

export default function DevicesPage() {
  const { user } = useAuth();
  const canManage = Boolean(
    user?.capabilities.includes("workspace.devices.manage") ||
    user?.capabilities.includes("platform.devices.manage"),
  );
  const canClaim = Boolean(
    user?.capabilities.includes("workspace.devices.view") ||
      user?.capabilities.includes("workspace.devices.manage") ||
      user?.capabilities.includes("platform.devices.manage") ||
      user?.capabilities.includes("personal.devices.manage"),
  );
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryKey: ["portal", "devices", user?.currentWorkspace.id],
    queryFn: smartHealthApi.listDevices,
    refetchInterval: 15_000,
  });
  const command = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) =>
      smartHealthApi.sendDeviceCommand(id, type),
    onSuccess: () => {
      toast.success("Đã gửi lệnh tới thiết bị");
      queryClient.invalidateQueries({ queryKey: ["portal", "devices"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const list = devices.data?.devices || [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex items-center gap-2">
            <Stethoscope size={22} />
            Quản lý thiết bị
          </h1>
          <p className="text-[#94b8d0] text-sm">
            Heartbeat và trạng thái cloud được làm mới mỗi 15 giây.
          </p>
        </div>
        {canClaim && (
          <Link to="/portal/devices/claim" className="premium-button flex items-center gap-2">
            <Plus size={15} />
            Thêm thiết bị
          </Link>
        )}
        {canManage && (
          <Link to="/portal/devices/assign" className="premium-button">
            Gán thiết bị
          </Link>
        )}
      </div>
      {!canManage && (
        <div className="rounded-xl border border-[#4AA4E0]/20 bg-[#4AA4E0]/5 p-3 text-sm text-[#94b8d0]">
          Tài khoản hiện tại có quyền xem thiết bị nhưng không có quyền gửi lệnh hoặc gán thiết bị.
        </div>
      )}
      {devices.isLoading ? (
        <PortalLoading />
      ) : devices.error ? (
        <PortalError error={devices.error} retry={() => devices.refetch()} />
      ) : !list.length ? (
        <PortalEmpty label="Workspace chưa có thiết bị." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              canManage={canManage}
              busy={command.isPending}
              send={(type) => command.mutate({ id: device.id, type })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  send,
  busy,
  canManage,
}: {
  device: Device;
  send: (type: string) => void;
  busy: boolean;
  canManage: boolean;
}) {
  const online = Boolean(device.online || device.connected);
  const battery = device.battery ?? 0;
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex justify-between gap-3">
        <div>
          <div className="font-mono text-white font-semibold">{device.name || device.id}</div>
          <div className="text-xs text-[#94b8d0] mt-1">{device.id}</div>
        </div>
        <span
          className={`text-xs rounded-full px-2 py-1 border ${online ? "text-[#00FFD1] border-[#00FFD1]/30" : "text-[#F59E0B] border-[#F59E0B]/30"}`}
        >
          {online ? (
            "Online"
          ) : (
            <span className="flex gap-1 items-center">
              <WifiOff size={11} />
              Offline
            </span>
          )}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-[#94b8d0]">
        <div>
          Pin <b className={battery <= 20 ? "text-[#FF4B4B]" : "text-white"}>{battery}%</b>
          {battery <= 20 && <BatteryWarning size={12} className="inline ml-1" />}
        </div>
        <div>
          Firmware <b className="text-white">{device.firmwareVersion || "—"}</b>
        </div>
        <div>
          WiFi <b className="text-white">{device.wifiSsid || "—"}</b>
        </div>
        <div>
          RSSI <b className="text-white">{device.wifiRssi ?? "—"}</b>
        </div>
      </div>
      {canManage && (
        <div className="mt-5 flex gap-2">
          <button
            disabled={busy}
            onClick={() => send("restart")}
            className="flex-1 rounded-xl border border-white/10 py-2 text-xs text-white hover:border-[#00FFD1]/30 flex justify-center gap-1"
          >
            <RotateCw size={13} />
            Khởi động lại
          </button>
          <button
            disabled={busy || !online}
            onClick={() => send("calibrate")}
            className="flex-1 rounded-xl border border-white/10 py-2 text-xs text-white disabled:opacity-40"
          >
            Hiệu chuẩn
          </button>
        </div>
      )}
    </div>
  );
}
