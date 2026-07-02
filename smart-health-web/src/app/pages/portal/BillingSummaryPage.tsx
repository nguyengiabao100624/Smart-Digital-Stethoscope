import { CreditCard } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";

export default function BillingSummaryPage() {
  const { user } = useAuth();
  const workspace = user?.raw.currentWorkspace || user?.raw.workspace;
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <CreditCard size={22} />
          Gói dịch vụ
        </h1>
        <p className="text-sm text-[#94b8d0]">
          Thông tin do backend trả về cho workspace hiện tại.
        </p>
      </div>
      <div className="glass-panel rounded-2xl p-6">
        <div className="text-xs text-[#94b8d0] uppercase">Workspace</div>
        <h2 className="text-2xl text-white font-black mt-2">
          {workspace?.name || user?.currentWorkspace.name}
        </h2>
        <div className="grid sm:grid-cols-2 gap-4 mt-6 text-sm">
          <div className="rounded-xl bg-white/5 p-4">
            <div className="text-[#94b8d0]">Mã gói</div>
            <div className="text-[#00FFD1] font-semibold mt-1">
              {workspace?.packageId || "Chưa gán gói"}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <div className="text-[#94b8d0]">Trạng thái thuê bao</div>
            <div className="text-white font-semibold mt-1">
              {workspace?.subscriptionStatus || "Chưa cập nhật"}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <div className="text-[#94b8d0]">Chu kỳ thanh toán</div>
            <div className="text-white font-semibold mt-1">
              {workspace?.billingCycle || "Chưa cập nhật"}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <div className="text-[#94b8d0]">Loại workspace</div>
            <div className="text-white font-semibold mt-1">
              {workspace?.workspaceType || workspace?.type || "—"}
            </div>
          </div>
        </div>
        <Link to="/lien-he" className="premium-button block text-center mt-6">
          Liên hệ nâng gói
        </Link>
      </div>
    </div>
  );
}
