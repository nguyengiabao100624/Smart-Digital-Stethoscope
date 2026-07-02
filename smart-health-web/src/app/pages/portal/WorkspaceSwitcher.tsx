import { useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { Users, Cpu, AlertTriangle, CheckCircle, LayoutGrid } from "lucide-react";

export default function WorkspaceSwitcher() {
  const { user, switchWorkspace } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleSwitch = (wsId: string) => {
    switchWorkspace(wsId);
    navigate("/portal/dashboard");
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="brand-gradient-text flex items-center gap-2">
          <LayoutGrid size={22} className="text-[#00FFD1]" /> Chọn workspace
        </h1>
        <p className="text-[#8aa5ba] text-sm mt-0.5">
          Bạn có nhiều workspace/vai trò trong Smart Health
        </p>
      </div>

      <div className="space-y-3">
        {user.workspaces.map((ws) => {
          const active = ws.id === user.currentWorkspace.id;
          return (
            <div
              key={ws.id}
              className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                active
                  ? "border-[#00FFD1]/35 shadow-[0_0_20px_rgba(0,255,209,0.1)]"
                  : "glass-panel hover:border-[#00FFD1]/20 hover:-translate-y-0.5"
              }`}
              style={
                active
                  ? { background: "rgba(0,255,209,0.06)", borderColor: "rgba(0,255,209,0.35)" }
                  : undefined
              }
              onClick={() => handleSwitch(ws.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div
                    className={`text-base font-semibold mb-0.5 ${active ? "text-[#00FFD1]" : "text-[#eefbff]"}`}
                  >
                    {ws.name}
                  </div>
                  <div className="text-sm text-[#8aa5ba]">
                    {ws.type === "doctor_private"
                      ? "Bác sĩ tư"
                      : ws.type === "clinic"
                        ? "Phòng khám"
                        : "Cơ sở y tế"}
                    {" · "}
                    {ws.role === "doctor"
                      ? "Bác sĩ"
                      : ws.role === "clinic_manager"
                        ? "Quản lý phòng khám"
                        : ws.role}
                  </div>
                </div>
                {active && (
                  <div className="flex items-center gap-1 text-xs font-medium text-[#00FFD1] bg-[#00FFD1]/10 border border-[#00FFD1]/20 px-2.5 py-1 rounded-full">
                    <CheckCircle size={12} className="drop-shadow-[0_0_4px_rgba(0,255,209,0.6)]" />{" "}
                    Đang dùng
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-[#8aa5ba]">
                <span className="flex items-center gap-1">
                  <Users size={12} /> {ws.patientCount} bệnh nhân
                </span>
                <span className="flex items-center gap-1">
                  <Cpu size={12} /> {ws.deviceOnline} thiết bị online
                </span>
                {ws.alertCount > 0 && (
                  <span className="flex items-center gap-1 text-[#FF4B4B]">
                    <AlertTriangle size={12} /> {ws.alertCount} cảnh báo
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
