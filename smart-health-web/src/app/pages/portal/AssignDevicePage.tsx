import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Link2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { useAuth } from "../../context/AuthContext";

export default function AssignDevicePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const client = useQueryClient();
  const [deviceId, setDeviceId] = useState("");
  const [patientId, setPatientId] = useState("");
  const devices = useQuery({
    queryKey: ["portal", "devices"],
    queryFn: smartHealthApi.listDevices,
  });
  const patients = useQuery({
    queryKey: ["portal", "patients"],
    queryFn: () => smartHealthApi.listPatients(),
  });
  const assign = useMutation({
    mutationFn: () => smartHealthApi.updateDevice(deviceId, { assignedPatientId: patientId }),
    onSuccess: () => {
      toast.success("Đã gán thiết bị cho bệnh nhân");
      client.invalidateQueries({ queryKey: ["portal", "devices"] });
      navigate("/portal/devices");
    },
    onError: (error) => toast.error(error.message),
  });
  if (
    !user?.capabilities.includes("workspace.devices.manage") &&
    !user?.capabilities.includes("platform.devices.manage")
  )
    return (
      <PortalError
        error={new Error("Tài khoản không có quyền gán thiết bị trong workspace này.")}
      />
    );
  if (devices.isLoading || patients.isLoading) return <PortalLoading />;
  if (devices.error || patients.error)
    return <PortalError error={devices.error || patients.error} />;
  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Link to="/portal/devices" className="text-sm text-[#94b8d0] flex gap-2 items-center">
        <ArrowLeft size={15} />
        Quay lại
      </Link>
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <Link2 size={22} />
          Gán thiết bị
        </h1>
        <p className="text-sm text-[#94b8d0]">
          Backend kiểm tra cả thiết bị và bệnh nhân cùng workspace.
        </p>
      </div>
      <form
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          assign.mutate();
        }}
        className="glass-panel rounded-2xl p-6 space-y-5"
      >
        <label className="block text-sm text-white">
          Thiết bị
          <select
            id="assign-device-id"
            name="assignDeviceId"
            required
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="portal-input mt-2"
          >
            <option value="">Chọn thiết bị</option>
            {devices.data?.devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name || device.id} — {device.online ? "Online" : "Offline"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-white">
          Bệnh nhân
          <select
            id="assign-patient-id"
            name="assignPatientId"
            required
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="portal-input mt-2"
          >
            <option value="">Chọn bệnh nhân</option>
            {patients.data?.patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name || patient.id} — {patient.patientCode || patient.id}
              </option>
            ))}
          </select>
        </label>
        <button id="assign-device-submit" disabled={assign.isPending} className="premium-button w-full">
          {assign.isPending ? "Đang gán..." : "Xác nhận gán thiết bị"}
        </button>
      </form>
    </div>
  );
}
