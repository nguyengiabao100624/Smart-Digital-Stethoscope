import { Smartphone, Shield, Heart, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useSEO } from "@/lib/useSEO";

const faqs = [
  {
    q: "Tôi cần tải app ở đâu?",
    a: "Ứng dụng Android đang được cung cấp theo từng chương trình triển khai Shcare. Hãy gửi yêu cầu để nhận đúng bản cài đặt và hướng dẫn kết nối thiết bị.",
  },
  {
    q: "Thiết bị ống nghe có phức tạp không?",
    a: "Ứng dụng hướng dẫn quét QR, cấu hình Wi-Fi và xác nhận thiết bị online trước khi đo.",
  },
  {
    q: "Dữ liệu của tôi có an toàn không?",
    a: "Hệ thống bảo vệ dữ liệu khi truyền và áp dụng phân quyền workspace. Quyền xem còn phụ thuộc consent và capability do backend xác nhận.",
  },
  {
    q: "Làm sao để thu hồi quyền của bác sĩ?",
    a: "Vào phần Consent trong app, chọn bác sĩ muốn thu hồi và xác nhận. Bác sĩ sẽ không còn xem dữ liệu mới.",
  },
];

export default function PatientHomePage() {
  useSEO({
    title: "Theo dõi sức khỏe tại nhà cho bệnh nhân | Shcare",
    description:
      "Hướng dẫn bệnh nhân sử dụng ống nghe thông minh và ứng dụng Android Shcare để thực hiện lượt đo tim phổi tại nhà.",
    path: "/giai-phap/benh-nhan-tai-nha",
  });
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div>
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 medical-grid opacity-40" />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(0,168,150,0.2) 0%, transparent 70%)" }}
        />
        <div className="max-w-4xl mx-auto px-6 text-center relative">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-[#00A896]/15 border border-[#00A896]/30"
            style={{ boxShadow: "0 0 30px rgba(0,168,150,0.35)" }}
          >
            <Heart
              size={36}
              className="text-[#00FFD1]"
              style={{ filter: "drop-shadow(0 0 10px rgba(0,255,209,0.7))" }}
            />
          </div>
          <h1 className="brand-gradient-text mb-4">Dành cho bệnh nhân tại nhà</h1>
          <p className="text-[#8aa5ba] text-lg leading-relaxed max-w-xl mx-auto mb-8">
            Đo sức khỏe tim phổi tại nhà, chia sẻ kết quả với bác sĩ và kiểm soát quyền riêng tư của
            bạn — tất cả trên Android app.
          </p>
          <Link to="/lien-he" className="premium-button inline-block">
            Nhận ứng dụng Android
          </Link>
          <p className="mt-4 text-sm text-white/55">
            Phiên bản Android và điều kiện sử dụng được xác nhận theo từng chương trình triển khai
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-10">Cách sử dụng đơn giản</h2>
          <div className="grid md:grid-cols-4 gap-5">
            {[
              {
                icon: "📲",
                step: 1,
                title: "Nhận thiết bị từ bác sĩ",
                desc: "Bác sĩ cho mượn hoặc hướng dẫn mua ống nghe thông minh.",
              },
              {
                icon: "📱",
                step: 2,
                title: "Tải và đăng nhập app",
                desc: "Cài bản Android do chương trình triển khai cung cấp và đăng nhập bằng phương thức đã được hệ thống bật.",
              },
              {
                icon: "💙",
                step: 3,
                title: "Chấp nhận consent",
                desc: "Xem quyền mà bác sĩ yêu cầu và chấp nhận nếu đồng ý.",
              },
              {
                icon: "🎯",
                step: 4,
                title: "Đo và gửi kết quả",
                desc: "Đặt ống nghe đúng vị trí, bắt đầu đo và theo dõi trạng thái tải lên cho đến khi backend xác nhận.",
              },
            ].map((s) => (
              <div key={s.step} className="premium-card p-5 text-center">
                <div className="text-3xl mb-3">{s.icon}</div>
                <div
                  className="w-6 h-6 rounded-full mx-auto mb-3 flex items-center justify-center text-xs font-bold text-[#0d1a30]"
                  style={{
                    background: "linear-gradient(135deg,#0B5C9A,#00FFD1)",
                    boxShadow: "0 0 10px rgba(0,255,209,0.4)",
                  }}
                >
                  {s.step}
                </div>
                <h3 className="text-sm font-semibold text-[#eefbff] mb-2">{s.title}</h3>
                <p className="text-xs text-[#8aa5ba] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-4">Bạn kiểm soát dữ liệu của mình</h2>
          <p className="text-center text-[#8aa5ba] mb-10">
            Shcare giúp bệnh nhân nhìn rõ phạm vi chia sẻ và chủ động quản lý consent.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Shield,
                title: "Consent rõ ràng",
                desc: "Bạn biết chính xác bác sĩ nào được xem dữ liệu gì. Không có chia sẻ ngầm.",
                color: "#00FFD1",
              },
              {
                icon: Smartphone,
                title: "Thu hồi trong tích tắc",
                desc: "Gửi yêu cầu thu hồi trong app và chỉ xem là hoàn tất sau khi backend xác nhận.",
                color: "#4AA4E0",
              },
              {
                icon: Heart,
                title: "Dữ liệu được mã hóa",
                desc: "Dữ liệu được bảo vệ khi truyền; quyền truy cập do backend kiểm tra theo workspace, vai trò và consent.",
                color: "#FF4B4B",
              },
            ].map((item) => (
              <div key={item.title} className="premium-card p-5">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: `${item.color}18`, border: `1px solid ${item.color}30` }}
                >
                  <item.icon size={20} style={{ color: item.color }} />
                </div>
                <h3 className="text-sm font-semibold text-[#eefbff] mb-2">{item.title}</h3>
                <p className="text-xs text-[#8aa5ba] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-8">Câu hỏi thường gặp</h2>
          <div className="space-y-2">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className={`glass-panel rounded-2xl overflow-hidden transition-all ${openFaq === idx ? "border-[#00FFD1]/20" : ""}`}
              >
                <button
                  className="flex items-center justify-between w-full px-5 py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <span
                    className={`text-sm font-medium ${openFaq === idx ? "text-[#00FFD1]" : "text-[#eefbff]"}`}
                  >
                    {faq.q}
                  </span>
                  <ChevronDown
                    size={16}
                    className="text-[#8aa5ba] flex-shrink-0 transition-transform"
                    style={{ transform: openFaq === idx ? "rotate(180deg)" : "none" }}
                  />
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-4 text-sm text-[#8aa5ba] leading-relaxed border-t border-white/10 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
