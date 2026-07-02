import { Link, useNavigate } from "react-router";
import { ShieldOff } from "lucide-react";

export default function PermissionDeniedPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-96 flex items-center justify-center p-6">
      <div className="max-w-md mx-auto text-center">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{
            background: "rgba(255,75,75,0.12)",
            border: "1px solid rgba(255,75,75,0.25)",
            boxShadow: "0 0 30px rgba(255,75,75,0.15)",
          }}
        >
          <ShieldOff
            size={36}
            className="text-[#FF4B4B] drop-shadow-[0_0_8px_rgba(255,75,75,0.6)]"
          />
        </div>
        <h1 className="brand-gradient-text mb-3">Không có quyền truy cập</h1>
        <p className="text-[#8aa5ba] leading-relaxed mb-2">
          Bạn không có quyền xem workspace hoặc tính năng này.
        </p>
        <p className="text-[#8aa5ba] text-sm leading-relaxed mb-8">
          Nếu bạn cho rằng đây là lỗi, hãy liên hệ quản lý workspace hoặc đổi sang workspace phù
          hợp.
        </p>
        <div className="flex justify-center gap-3 flex-wrap">
          <button
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/8 text-sm font-medium text-[#eefbff] hover:border-[#00FFD1]/30 transition-all"
          >
            Quay lại
          </button>
          <Link
            to="/portal/dashboard"
            className="px-5 py-2.5 rounded-xl text-[#0d1a30] text-sm font-semibold hover:scale-[1.02] transition-all"
            style={{
              background: "linear-gradient(135deg,#0B5C9A,#00FFD1)",
              boxShadow: "0 0 15px rgba(0,255,209,0.35)",
            }}
          >
            Về dashboard
          </Link>
          <Link
            to="/portal/workspace"
            className="px-5 py-2.5 rounded-xl border border-[#0B5C9A]/30 bg-[#0B5C9A]/10 text-sm font-medium text-[#4AA4E0] hover:bg-[#0B5C9A]/20 transition-all"
          >
            Đổi workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
