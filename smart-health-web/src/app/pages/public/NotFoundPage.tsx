import { Link } from "react-router";
import { Heart, Home, LogIn } from "lucide-react";

interface NotFoundPageProps {
  maintenance?: boolean;
}

export default function NotFoundPage({ maintenance }: NotFoundPageProps) {
  if (maintenance) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 medical-grid opacity-30" />
        <div className="max-w-md mx-auto px-6 text-center relative">
          <div className="text-5xl mb-6">🔧</div>
          <h1 className="brand-gradient-text mb-3">Hệ thống đang bảo trì</h1>
          <p className="text-[#8aa5ba] leading-relaxed mb-8">
            Shcare đang thực hiện nâng cấp hệ thống để phục vụ bạn tốt hơn. Chúng tôi sẽ sớm
            trở lại.
          </p>
          <a
            href="tel:18001234"
            className="inline-block px-5 py-2.5 rounded-xl border border-white/10 bg-white/8 text-sm font-medium text-[#eefbff] hover:border-[#00FFD1]/30 transition-all"
          >
            Liên hệ hỗ trợ: 1800 1234
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 medical-grid opacity-30" />
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(11,92,154,0.15) 0%, transparent 70%)" }}
      />
      <div className="max-w-md mx-auto px-6 text-center relative">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-[#0B5C9A]/15 border border-[#0B5C9A]/30"
          style={{ boxShadow: "0 0 30px rgba(11,92,154,0.25)" }}
        >
          <Heart
            size={36}
            className="text-[#00FFD1]"
            style={{ filter: "drop-shadow(0 0 10px rgba(0,255,209,0.7))" }}
          />
        </div>
        <div
          className="text-8xl font-black mb-4 leading-none"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.15), rgba(11,92,154,0.4))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          404
        </div>
        <h1 className="brand-gradient-text mb-3">Không tìm thấy trang</h1>
        <p className="text-[#8aa5ba] leading-relaxed mb-8">
          Trang bạn tìm kiếm không tồn tại hoặc đã bị di chuyển. Hãy kiểm tra lại đường dẫn hoặc
          quay về trang chủ.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/" className="premium-button flex items-center gap-2">
            <Home size={15} /> Về trang chủ
          </Link>
          <Link
            to="/login"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 bg-white/8 text-sm font-medium text-[#eefbff] hover:border-[#00FFD1]/30 transition-all"
          >
            <LogIn size={15} /> Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
