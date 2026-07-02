import { useState } from "react";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../../context/AuthContext";

export default function ApprovalPendingPage({
  state,
}: {
  state?: "info_requested" | "rejected" | "approved";
}) {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const backendStatus = user?.raw.roleRequestStatus || user?.raw.roleRequestStatus;
  const status =
    state ||
    (backendStatus === "needs_info"
      ? "info_requested"
      : backendStatus === "rejected"
        ? "rejected"
        : backendStatus === "approved"
          ? "approved"
          : "pending");
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      await refreshUser();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật trạng thái.");
    } finally {
      setLoading(false);
    }
  };
  const config =
    status === "approved"
      ? {
          icon: CheckCircle,
          color: "#00FFD1",
          title: "Hồ sơ đã được duyệt",
          text: "Tài khoản đã có quyền truy cập portal.",
        }
      : status === "rejected"
        ? {
            icon: XCircle,
            color: "#FF6B6B",
            title: "Hồ sơ bị từ chối",
            text: String(
              user?.raw.roleRejectReason || "Liên hệ quản trị viên để biết thêm chi tiết.",
            ),
          }
        : status === "info_requested"
          ? {
              icon: Clock,
              color: "#F59E0B",
              title: "Cần bổ sung thông tin",
              text: String(
                user?.raw.roleInfoRequestMessage || "Quản trị viên yêu cầu cập nhật hồ sơ.",
              ),
            }
          : {
              icon: Clock,
              color: "#4AA4E0",
              title: "Hồ sơ đang chờ duyệt",
              text: "Trạng thái được lấy trực tiếp từ backend Smart Health.",
            };
  const Icon = config.icon;
  return (
    <div className="text-center py-5">
      <Icon size={48} className="mx-auto mb-5" style={{ color: config.color }} />
      <h1 className="text-2xl font-black text-white">{config.title}</h1>
      <p className="text-sm text-white/70 mt-3">{config.text}</p>
      {error && <p className="mt-4 text-xs text-[#FF6B6B]">{error}</p>}
      <div className="grid gap-3 mt-7">
        {status === "approved" && (
          <Link to="/portal" className="premium-button">
            Mở portal
          </Link>
        )}
        <button
          onClick={refresh}
          disabled={loading}
          className="h-12 rounded-xl border border-white/10 text-white text-sm flex justify-center items-center gap-2"
        >
          {loading && <Loader2 size={15} className="animate-spin" />}Cập nhật trạng thái
        </button>
        <Link to="/login" className="text-xs text-white/60">
          Về đăng nhập
        </Link>
      </div>
    </div>
  );
}
