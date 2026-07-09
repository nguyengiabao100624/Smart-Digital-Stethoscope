import { useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, CheckCircle, Cpu, LayoutGrid, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function WorkspaceSwitcher() {
  const { user, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const [switchingId, setSwitchingId] = useState("");
  const [switchError, setSwitchError] = useState("");

  if (!user) return null;

  const handleSwitch = async (workspaceId: string) => {
    if (workspaceId === user.currentWorkspace.id || switchingId) return;
    setSwitchError("");
    setSwitchingId(workspaceId);
    try {
      await switchWorkspace(workspaceId);
      navigate("/portal/dashboard");
    } catch (error) {
      setSwitchError(
        error instanceof Error
          ? error.message
          : "Không thể chuyển workspace lúc này.",
      );
    } finally {
      setSwitchingId("");
    }
  };

  const workspaceTypeLabel = (type: string) => {
    if (type === "solo_practice" || type === "doctor_private") return "Bác sĩ tư";
    if (type === "clinic") return "Phòng khám";
    if (type === "hospital") return "Bệnh viện";
    if (type === "personal") return "Cá nhân/gia đình";
    return "Cơ sở y tế";
  };

  const roleLabel = (role: string) => {
    if (role === "doctor") return "Bác sĩ";
    if (role === "workspace_owner") return "Chủ workspace";
    if (role === "workspace_admin" || role === "clinic_manager")
      return "Quản lý workspace";
    if (role === "nurse") return "Điều dưỡng";
    if (role === "technician") return "Kỹ thuật viên";
    if (role === "billing") return "Tài chính";
    if (role === "viewer") return "Chỉ xem";
    return role;
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="brand-gradient-text flex items-center gap-2">
          <LayoutGrid size={22} className="text-[#00FFD1]" />
          Chọn workspace
        </h1>
        <p className="text-[#8aa5ba] text-sm mt-0.5">
          Bạn có nhiều workspace/vai trò trong Smart Health
        </p>
      </div>

      {switchError && (
        <div
          role="alert"
          className="rounded-xl border border-[#FF4B4B]/30 bg-[#FF4B4B]/10 px-4 py-3 text-sm text-[#ffd6d6]"
        >
          {switchError}
        </div>
      )}

      <div className="space-y-3">
        {user.workspaces.map((workspace) => {
          const active = workspace.id === user.currentWorkspace.id;
          const switching = switchingId === workspace.id;
          return (
            <button
              type="button"
              key={workspace.id}
              data-workspace-card={workspace.id}
              data-workspace-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              disabled={Boolean(switchingId)}
              className={`w-full rounded-2xl border p-5 text-left transition-all disabled:cursor-wait disabled:opacity-70 ${
                active
                  ? "border-[#00FFD1]/35 shadow-[0_0_20px_rgba(0,255,209,0.1)]"
                  : "glass-panel cursor-pointer hover:-translate-y-0.5 hover:border-[#00FFD1]/20"
              }`}
              style={
                active
                  ? {
                      background: "rgba(0,255,209,0.06)",
                      borderColor: "rgba(0,255,209,0.35)",
                    }
                  : undefined
              }
              onClick={() => void handleSwitch(workspace.id)}
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <div
                    className={`mb-0.5 text-base font-semibold ${
                      active ? "text-[#00FFD1]" : "text-[#eefbff]"
                    }`}
                  >
                    {workspace.name}
                  </div>
                  <div className="text-sm text-[#8aa5ba]">
                    {workspaceTypeLabel(workspace.type)}
                    {" · "}
                    {roleLabel(workspace.role)}
                  </div>
                </div>
                {active && (
                  <div className="flex items-center gap-1 rounded-full border border-[#00FFD1]/20 bg-[#00FFD1]/10 px-2.5 py-1 text-xs font-medium text-[#00FFD1]">
                    <CheckCircle
                      size={12}
                      className="drop-shadow-[0_0_4px_rgba(0,255,209,0.6)]"
                    />
                    Đang dùng
                  </div>
                )}
                {!active && switching && (
                  <div className="text-xs font-medium text-[#00FFD1]">
                    Đang chuyển...
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#8aa5ba]">
                <span
                  className="flex items-center gap-1"
                  data-workspace-patient-count={workspace.patientCount}
                >
                  <Users size={12} />
                  {workspace.patientCount} bệnh nhân
                </span>
                <span
                  className="flex items-center gap-1"
                  data-workspace-device-online={workspace.deviceOnline}
                >
                  <Cpu size={12} />
                  {workspace.deviceOnline} thiết bị online
                </span>
                {workspace.alertCount > 0 && (
                  <span
                    className="flex items-center gap-1 text-[#FF4B4B]"
                    data-workspace-alert-count={workspace.alertCount}
                  >
                    <AlertTriangle size={12} />
                    {workspace.alertCount} cảnh báo
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
