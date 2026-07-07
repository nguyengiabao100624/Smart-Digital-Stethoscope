import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  Fingerprint,
  Lock,
  Mail,
} from "lucide-react";
import { motion } from "motion/react";
import { useSEO } from "@/lib/useSEO";

function getLoginErrorMessage(error?: string) {
  if (error === "wrong_surface_admin") {
    return "Tài khoản quản trị hệ thống dùng cổng shcare-admin.web.app.";
  }
  if (error === "wrong_surface_android") {
    return "Tài khoản này hiện chỉ có quyền dùng ứng dụng Android. Nếu bạn là bác sĩ hoặc cơ sở y tế, hãy gửi yêu cầu cấp quyền workspace.";
  }
  if (error === "role_request_pending") {
    return "Hồ sơ bác sĩ/cơ sở y tế đang chờ duyệt. Sau khi được duyệt, tài khoản sẽ vào được Shcare Web Portal.";
  }
  if (error === "role_request_needs_info") {
    return "Hồ sơ cần bổ sung thông tin trước khi được cấp quyền vào Shcare Web Portal.";
  }
  if (error === "role_request_rejected") {
    return "Hồ sơ đã bị từ chối. Vui lòng kiểm tra lý do từ quản trị viên hoặc gửi lại yêu cầu.";
  }
  if (error === "portal_access_denied") {
    return "Tài khoản chưa có quyền truy cập Shcare Web Portal.";
  }
  return error || "Thông tin đăng nhập không hợp lệ.";
}

export default function LoginPage() {
  useSEO({
    title: "Đăng nhập Workspace | Smart Health Care",
    description: "Đăng nhập cổng Smart Health Care cho bác sĩ và cơ sở y tế.",
    path: "/login",
  });

  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      navigate("/portal");
    } else if (result.error === "role_request_pending") {
      navigate("/cho-duyet");
    } else if (result.error === "role_request_needs_info") {
      navigate("/can-bo-sung");
    } else if (result.error === "role_request_rejected") {
      navigate("/bi-tu-choi");
    } else {
      setError(getLoginErrorMessage(result.error));
    }
  };

  const inputClass =
    "w-full pl-11 pr-4 py-3.5 rounded-xl border border-white/10 bg-white/8 focus:outline-none focus:border-[#00FFD1]/50 focus:ring-1 focus:ring-[#00FFD1]/50 text-white text-sm transition-all placeholder:text-white/55 backdrop-blur-md";

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#0B5C9A]/40 to-[#00FFD1]/20 mx-auto flex items-center justify-center mb-5 border border-[#00FFD1]/20 shadow-[0_0_20px_rgba(0,255,209,0.15)]">
          <Fingerprint size={28} className="text-[#00FFD1]" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">
          Đăng nhập workspace
        </h1>
        <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mt-3">
          Cổng bác sĩ và cơ sở y tế
        </p>
      </div>

      <form method="post" onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-2 relative">
          <label
            htmlFor="login-email"
            className="block text-[11px] font-bold uppercase tracking-wider text-white/60"
          >
            Email đăng nhập
          </label>
          <div className="relative">
            <Mail
              size={18}
              className="shc-auth-input-icon absolute left-4 top-1/2 -translate-y-1/2"
            />
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="bacsia@phongkham.vn"
              className={inputClass}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="login-password"
              className="block text-[11px] font-bold uppercase tracking-wider text-white/60"
            >
              Mật khẩu
            </label>
            <Link
              to="/quen-mat-khau"
              className="text-[11px] font-bold text-[#00FFD1] hover:text-white transition-colors uppercase tracking-wider"
            >
              Quên mật khẩu?
            </Link>
          </div>
          <div className="relative">
            <Lock
              size={18}
              className="shc-auth-input-icon absolute left-4 top-1/2 -translate-y-1/2"
            />
            <input
              id="login-password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className={inputClass + " pr-12"}
              required
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="shc-auth-password-toggle absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
              aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {error && (
          <motion.div
            id="login-error"
            role="alert"
            aria-live="polite"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#FF4B4B]/10 border border-[#FF4B4B]/30 rounded-xl px-4 py-3 text-xs text-[#FF4B4B] flex items-center gap-2 font-medium"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF4B4B] animate-pulse flex-shrink-0" />
            {error}
          </motion.div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="group relative w-full h-14 bg-gradient-to-r from-[#0B5C9A] to-[#00A896] text-white rounded-xl font-bold uppercase tracking-widest text-sm shadow-[0_0_20px_rgba(0,168,150,0.3)] hover:shadow-[0_0_30px_rgba(0,255,209,0.5)] transition-all disabled:opacity-50 overflow-hidden flex items-center justify-center gap-2"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#00A896] to-[#00FFD1] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <span className="relative z-10 flex items-center gap-2">
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                Đăng nhập{" "}
                <ArrowRight
                  size={16}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </>
            )}
          </span>
        </button>
      </form>

      <div className="mt-6 text-center text-[11px] font-bold uppercase tracking-wider text-white/60">
        Chưa được cấp quyền?{" "}
        <Link
          to="/register"
          className="text-[#00FFD1] hover:text-white transition-colors ml-1 border-b border-[#00FFD1]/30 hover:border-white"
        >
          Yêu cầu truy cập →
        </Link>
      </div>
    </div>
  );
}
