import { useState } from "react";
import { Link } from "react-router";
import { CheckCircle, Loader2, Mail, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { sendFirebasePasswordReset } from "../../../lib/firebase-client";
import { useSEO } from "@/lib/useSEO";

export default function ForgotPasswordPage() {
  useSEO({
    title: "Khôi phục mật khẩu | Smart Health Care",
    description: "Nhận liên kết đặt lại mật khẩu cho tài khoản Smart Health Care Workspace.",
    path: "/quen-mat-khau",
  });

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendFirebasePasswordReset(email);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể gửi email đặt lại mật khẩu.");
    } finally {
      setLoading(false);
    }
  };
  if (sent)
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-5">
        <CheckCircle size={44} className="text-[#00FFD1] mx-auto mb-5" />
        <h1 className="text-xl font-black text-white">Đã gửi email khôi phục</h1>
        <p className="text-sm text-white/70 mt-3">
          Kiểm tra hộp thư <b className="text-[#00FFD1]">{email}</b> và làm theo liên kết đặt lại
          mật khẩu.
        </p>
        <Link to="/login" className="premium-button block mt-7">
          Về đăng nhập
        </Link>
      </motion.div>
    );
  return (
    <div>
      <h1 className="text-2xl font-black text-white">Khôi phục mật khẩu</h1>
      <p className="text-sm text-white/70 mt-2 mb-6">
        Hệ thống sẽ gửi liên kết đặt lại mật khẩu an toàn đến email của bạn.
      </p>
      {error && (
        <div className="mb-4 rounded-xl border border-[#FF4B4B]/30 bg-[#FF4B4B]/10 p-3 text-xs text-[#FF6B6B] flex gap-2">
          <ShieldAlert size={14} />
          {error}
        </div>
      )}
      <form method="post" onSubmit={submit} className="space-y-5">
        <div className="relative">
          <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
          <input
            id="reset-email"
            name="email"
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-12 rounded-xl border border-white/10 bg-white/8 pl-11 pr-4 text-white outline-none"
            placeholder="doctor@clinic.vn"
          />
        </div>
        <button
          disabled={loading}
          className="premium-button w-full h-12 flex justify-center items-center gap-2"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}Gửi liên kết khôi phục
        </button>
      </form>
      <Link to="/login" className="block text-center mt-6 text-xs text-white/60">
        ← Về đăng nhập
      </Link>
    </div>
  );
}
