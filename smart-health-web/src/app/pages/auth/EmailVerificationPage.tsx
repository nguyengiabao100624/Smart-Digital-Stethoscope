import { useState } from "react";
import { CheckCircle, Loader2, Mail } from "lucide-react";
import { Link } from "react-router";
import { refreshFirebaseVerification } from "../../../lib/firebase-client";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { useSEO } from "@/lib/useSEO";

export default function EmailVerificationPage() {
  useSEO({
    title: "Xác minh email | Smart Health Care",
    description:
      "Kiểm tra trạng thái xác minh email cho tài khoản Smart Health Care Workspace.",
    path: "/xac-thuc-email",
  });

  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState("");
  const check = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await refreshFirebaseVerification();
      if (!result.verified) {
        setMessage(
          "Email chưa được xác minh. Hãy mở liên kết trong hộp thư rồi thử lại.",
        );
        return;
      }
      await smartHealthApi.authenticateFirebase(result.idToken);
      setVerified(true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Không thể kiểm tra xác minh.",
      );
    } finally {
      setLoading(false);
    }
  };
  const resend = async () => {
    setLoading(true);
    setMessage("");
    try {
      const firebaseState = await refreshFirebaseVerification();
      await smartHealthApi.authenticateFirebase(firebaseState.idToken);
      if (firebaseState.verified) {
        setVerified(true);
        setMessage("Email đã được xác minh. Bạn có thể tiếp tục.");
        return;
      }
      const delivery = await smartHealthApi.sendEmailVerification();
      if (delivery.status === "verified") {
        setVerified(true);
        setMessage("Email đã được xác minh. Bạn có thể tiếp tục.");
        return;
      }
      setMessage(
        `Đã gửi lại email xác minh đến ${delivery.email}${delivery.provider ? ` qua ${delivery.provider}` : ""}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Không thể gửi lại email.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-full bg-[#00FFD1]/10 border border-[#00FFD1]/30 grid place-items-center mx-auto mb-5">
        {verified ? (
          <CheckCircle className="text-[#00FFD1]" />
        ) : (
          <Mail className="text-[#4AA4E0]" />
        )}
      </div>
      <h1 className="text-2xl font-black text-white">
        {verified ? "Email đã xác minh" : "Xác minh email"}
      </h1>
      <p className="text-sm text-white/70 mt-3">
        {verified
          ? "Phiên đăng nhập đã được làm mới. Bạn có thể xem trạng thái hồ sơ."
          : "Mở email xác minh, sau đó quay lại kiểm tra trạng thái."}
      </p>
      {message && (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-[#F59E0B]">
          {message}
        </p>
      )}
      {verified ? (
        <Link to="/cho-duyet" className="premium-button block mt-6">
          Xem trạng thái hồ sơ
        </Link>
      ) : (
        <div className="grid gap-3 mt-6">
          <button
            onClick={check}
            disabled={loading}
            className="premium-button h-12 flex justify-center items-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}Tôi đã
            xác minh
          </button>
          <button
            onClick={resend}
            disabled={loading}
            className="h-12 rounded-xl border border-white/10 text-sm text-white"
          >
            Gửi lại email
          </button>
        </div>
      )}
    </div>
  );
}
