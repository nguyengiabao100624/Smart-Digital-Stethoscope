import { useState } from "react";
import { Link } from "react-router";
import {
  Activity,
  Stethoscope,
  ShieldCheck,
  Workflow,
  ChevronDown,
  BookOpen,
  HeartPulse,
  Users,
  BarChart3,
} from "lucide-react";
import { useSEO } from "@/lib/useSEO";

const faqs = [
  {
    q: "RPM (Remote Patient Monitoring) là gì?",
    a: "RPM — Theo dõi bệnh nhân từ xa — là mô hình chăm sóc sử dụng thiết bị y tế kết nối để thu thập dữ liệu sinh hiệu (nhịp tim, SpO2, huyết áp, âm phổi…) tại nhà bệnh nhân và truyền an toàn về bác sĩ hoặc phòng khám để theo dõi liên tục, can thiệp sớm khi có bất thường.",
  },
  {
    q: "RPM khác gì so với Telehealth?",
    a: "Telehealth tập trung vào tư vấn trực tuyến theo từng buổi hẹn. RPM thu thập dữ liệu khách quan liên tục giữa các buổi khám, cho phép bác sĩ ra quyết định dựa trên xu hướng dài hạn thay vì một thời điểm.",
  },
  {
    q: "Những bệnh nhân nào phù hợp với RPM?",
    a: "Bệnh nhân mạn tính (tăng huyết áp, suy tim, COPD, hen, đái tháo đường), bệnh nhân hậu phẫu, người cao tuổi sống một mình, và bệnh nhân cần theo dõi sau xuất viện để giảm nguy cơ tái nhập viện.",
  },
  {
    q: "Bệnh nhân cần thiết bị gì để tham gia RPM?",
    a: "Với Smart Health Care, bệnh nhân cần một ống nghe thông minh (do bác sĩ/phòng khám cấp phát) và điện thoại Android cài Smart Health app. Thiết bị tự động đồng bộ dữ liệu qua Bluetooth và 4G/WiFi.",
  },
  {
    q: "Dữ liệu RPM được bảo mật như thế nào?",
    a: "Hệ thống hỗ trợ mã hóa khi truyền, cấu hình lưu trữ bảo mật, phân quyền workspace và consent rõ ràng để bệnh nhân có thể kiểm soát quyền truy cập. Yêu cầu tuân thủ cụ thể phụ thuộc cấu hình triển khai và chính sách pháp lý của từng cơ sở.",
  },
  {
    q: "Bác sĩ mất bao nhiêu thời gian mỗi ngày cho RPM?",
    a: "Trung bình 5–10 phút/bệnh nhân/tuần nhờ tự động hóa: hệ thống chỉ cảnh báo khi có giá trị bất thường, tự tổng hợp xu hướng và đề xuất hành động. Bác sĩ chỉ can thiệp khi cần.",
  },
  {
    q: "RPM có giúp giảm tái nhập viện không?",
    a: "Có. Các nghiên cứu lâm sàng cho thấy RPM giảm 25–50% tỷ lệ tái nhập viện ở bệnh nhân suy tim và COPD nhờ phát hiện sớm dấu hiệu xấu đi trước khi cần cấp cứu.",
  },
  {
    q: "Triển khai RPM tại phòng khám mất bao lâu?",
    a: "Với Smart Health Care, một phòng khám có thể bắt đầu nhận dữ liệu RPM trong 1–2 tuần: 3 ngày đào tạo nhân sự, 1 tuần cấp phát thiết bị cho 20–50 bệnh nhân pilot, sau đó mở rộng.",
  },
];

export default function RPMGuidePage() {
  useSEO({
    title: "Kiến thức RPM: Theo dõi bệnh nhân từ xa toàn diện | Smart Health Care",
    description:
      "Hướng dẫn RPM (Remote Patient Monitoring) cho bác sĩ và phòng khám: định nghĩa, quy trình, thiết bị, bảo mật, lợi ích lâm sàng và cách triển khai với Smart Health Care.",
    path: "/tai-nguyen/kien-thuc-rpm",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Kiến thức RPM: Theo dõi bệnh nhân từ xa toàn diện",
        description:
          "Hướng dẫn đầy đủ về Remote Patient Monitoring: khái niệm, lợi ích, quy trình, thiết bị và triển khai thực tế.",
        author: { "@type": "Organization", name: "Smart Health Care" },
        publisher: { "@type": "Organization", name: "Smart Health Care" },
        mainEntityOfPage: "https://shcare.web.app/tai-nguyen/kien-thuc-rpm",
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Trang chủ",
            item: "https://shcare.web.app/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Tài nguyên",
            item: "https://shcare.web.app/tai-nguyen",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: "Kiến thức RPM",
            item: "https://shcare.web.app/tai-nguyen/kien-thuc-rpm",
          },
        ],
      },
    ],
  });

  const [open, setOpen] = useState<number | null>(0);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden pt-14 pb-10 md:pt-20 md:pb-14">
        <div className="absolute inset-0 medical-grid opacity-40" />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[40rem] h-[40rem] rounded-full blur-3xl pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(0,255,209,0.18) 0%, transparent 70%)",
          }}
        />
        <div className="max-w-4xl mx-auto px-6 text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 border border-white/10 text-xs text-[#8aa5ba] mb-5">
            <BookOpen size={14} className="text-[#00FFD1]" />
            Tài nguyên · Kiến thức RPM
          </div>
          <h1 className="brand-gradient-text mb-5 text-3xl md:text-5xl">
            Kiến thức RPM: Theo dõi bệnh nhân từ xa toàn diện
          </h1>
          <p className="text-[#8aa5ba] text-base md:text-lg max-w-2xl mx-auto">
            Tất cả những gì bác sĩ và phòng khám cần biết về Remote Patient Monitoring — từ khái
            niệm, quy trình triển khai đến lợi ích lâm sàng và cách bảo vệ dữ liệu bệnh nhân.
          </p>
        </div>
      </section>

      {/* What is RPM */}
      <section className="py-10 md:py-14">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="brand-gradient-text mb-4 text-2xl md:text-3xl">RPM là gì?</h2>
          <p className="text-[#8aa5ba] leading-relaxed mb-4">
            <strong className="text-[#eefbff]">RPM (Remote Patient Monitoring)</strong> — Theo dõi
            bệnh nhân từ xa — là một phương pháp chăm sóc sử dụng các thiết bị y tế kết nối để thu
            thập dữ liệu sinh hiệu của bệnh nhân tại nhà và truyền liên tục, an toàn về bác sĩ điều
            trị. Thay vì chỉ dựa vào những lần khám trực tiếp, bác sĩ có bức tranh đầy đủ về tình
            trạng bệnh nhân theo thời gian thực.
          </p>
          <p className="text-[#8aa5ba] leading-relaxed">
            Tại Smart Health Care, RPM được xây dựng quanh chiếc{" "}
            <strong className="text-[#eefbff]">ống nghe thông minh</strong> — thiết bị y tế cấp phép
            sử dụng AI để phân tích âm tim, âm phổi và sinh hiệu — kết hợp với cổng thông tin bác
            sĩ/phòng khám và app cho bệnh nhân.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="brand-gradient-text mb-8 text-2xl md:text-3xl">Lợi ích của RPM</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: HeartPulse,
                color: "#00FFD1",
                title: "Giảm tái nhập viện",
                desc: "Phát hiện sớm dấu hiệu xấu đi giúp giảm 25–50% tỷ lệ tái nhập viện ở bệnh nhân suy tim, COPD.",
              },
              {
                icon: Users,
                color: "#4AA4E0",
                title: "Mở rộng khả năng chăm sóc",
                desc: "Một bác sĩ có thể theo dõi nhiều bệnh nhân mạn tính nhờ tự động hóa cảnh báo và báo cáo.",
              },
              {
                icon: BarChart3,
                color: "#7257E8",
                title: "Dữ liệu khách quan & liên tục",
                desc: "Ra quyết định dựa trên xu hướng dài hạn thay vì một lần đo tại phòng khám.",
              },
            ].map((b) => (
              <div key={b.title} className="glass-panel rounded-2xl p-6">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${b.color}15`, border: `1px solid ${b.color}30` }}
                >
                  <b.icon size={22} style={{ color: b.color }} />
                </div>
                <h3 className="text-[#eefbff] font-semibold mb-2">{b.title}</h3>
                <p className="text-[#8aa5ba] text-sm leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="py-10 md:py-14">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="brand-gradient-text mb-8 text-2xl md:text-3xl">
            Quy trình RPM với Smart Health Care
          </h2>
          <div className="space-y-4">
            {[
              {
                step: "01",
                title: "Đăng ký & xác minh",
                desc: "Bác sĩ/phòng khám tạo tài khoản, gửi giấy phép hành nghề và được Smart Health xét duyệt trong 1–3 ngày.",
              },
              {
                step: "02",
                title: "Cấp phát thiết bị",
                desc: "Phòng khám nhận lô ống nghe thông minh, gán cho từng bệnh nhân qua wizard 3 bước (chọn bệnh nhân → quét QR → xác nhận).",
              },
              {
                step: "03",
                title: "Bệnh nhân đồng ý consent",
                desc: "Bệnh nhân cài Android app, đồng ý phạm vi dữ liệu chia sẻ với bác sĩ. Có thể thu hồi bất cứ lúc nào.",
              },
              {
                step: "04",
                title: "Theo dõi liên tục",
                desc: "Dữ liệu sinh hiệu tự động đồng bộ về portal. AI tự động phát hiện bất thường và gửi cảnh báo cho bác sĩ.",
              },
              {
                step: "05",
                title: "Can thiệp & báo cáo",
                desc: "Bác sĩ xem xu hướng, ghi chú, gọi điện hoặc đặt lịch tái khám. Báo cáo tháng tự động xuất PDF/Excel.",
              },
            ].map((s) => (
              <div key={s.step} className="glass-panel rounded-2xl p-5 flex gap-5 items-start">
                <div className="text-2xl font-bold brand-gradient-text shrink-0">{s.step}</div>
                <div>
                  <h3 className="text-[#eefbff] font-semibold mb-1">{s.title}</h3>
                  <p className="text-[#8aa5ba] text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="brand-gradient-text mb-8 text-2xl md:text-3xl">Bệnh lý phù hợp với RPM</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                icon: HeartPulse,
                title: "Tim mạch",
                desc: "Suy tim, tăng huyết áp, rối loạn nhịp — theo dõi nhịp tim, huyết áp và âm tim hằng ngày.",
              },
              {
                icon: Activity,
                title: "Hô hấp",
                desc: "COPD, hen phế quản, hậu COVID — phát hiện sớm cơn cấp qua phân tích âm phổi và SpO2.",
              },
              {
                icon: Stethoscope,
                title: "Hậu phẫu & xuất viện",
                desc: "Theo dõi 30 ngày sau phẫu thuật để phát hiện biến chứng sớm và giảm tái nhập viện.",
              },
              {
                icon: Users,
                title: "Người cao tuổi",
                desc: "Người sống một mình hoặc đa bệnh — gia đình và bác sĩ cùng theo dõi từ xa.",
              },
            ].map((u) => (
              <div key={u.title} className="glass-panel rounded-2xl p-6 flex gap-4 items-start">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-[#00FFD1]/12 border border-[#00FFD1]/25">
                  <u.icon size={20} className="text-[#00FFD1]" />
                </div>
                <div>
                  <h3 className="text-[#eefbff] font-semibold mb-1">{u.title}</h3>
                  <p className="text-[#8aa5ba] text-sm leading-relaxed">{u.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-10 md:py-14">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="brand-gradient-text mb-4 text-2xl md:text-3xl">
            Bảo mật & tuân thủ trong RPM
          </h2>
          <p className="text-[#8aa5ba] leading-relaxed mb-6">
            Dữ liệu sức khỏe là loại dữ liệu nhạy cảm nhất. Smart Health Care áp dụng các biện pháp
            bảo mật nhiều lớp và tuân thủ chuẩn quốc tế:
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              "Bảo vệ dữ liệu trong quá trình truyền và lưu trữ theo cấu hình triển khai",
              "Consent rõ ràng — bệnh nhân kiểm soát và thu hồi quyền",
              "Phân quyền theo vai trò (RBAC) và audit log đầy đủ",
              "Hỗ trợ phân quyền, audit và chính sách bảo vệ dữ liệu cá nhân",
            ].map((s) => (
              <div key={s} className="flex items-start gap-3 glass-panel rounded-xl p-4">
                <ShieldCheck size={18} className="text-[#00FFD1] mt-0.5 shrink-0" />
                <span className="text-sm text-[#eefbff]">{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Link to="/bao-mat" className="text-[#00FFD1] text-sm hover:underline">
              Xem chi tiết về bảo mật →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-10 md:py-14">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="brand-gradient-text mb-6 text-2xl md:text-3xl">
            Câu hỏi thường gặp về RPM
          </h2>
          <div className="space-y-2">
            {faqs.map((f, i) => {
              const isOpen = open === i;
              return (
                <div
                  key={i}
                  className={`glass-panel rounded-2xl overflow-hidden ${isOpen ? "border-[#00FFD1]/20" : ""}`}
                >
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <span
                      className={`text-sm font-medium ${isOpen ? "text-[#00FFD1]" : "text-[#eefbff]"}`}
                    >
                      {f.q}
                    </span>
                    <ChevronDown
                      size={16}
                      className="text-[#8aa5ba] shrink-0 transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 pt-3 border-t border-white/10 text-sm text-[#8aa5ba] leading-relaxed">
                      {f.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="glass-panel rounded-3xl p-8 md:p-12">
            <Workflow size={32} className="text-[#00FFD1] mx-auto mb-4" />
            <h2 className="brand-gradient-text mb-3 text-2xl md:text-3xl">
              Sẵn sàng triển khai RPM?
            </h2>
            <p className="text-[#8aa5ba] mb-7 max-w-xl mx-auto">
              Đội ngũ Smart Health hỗ trợ bác sĩ và phòng khám triển khai RPM trong 1–2 tuần, từ cấp
              phát thiết bị đến đào tạo và đi vào vận hành.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/lien-he" className="premium-button">
                Liên hệ tư vấn
              </Link>
              <Link
                to="/bang-gia"
                className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/8 text-sm font-medium text-[#eefbff] hover:border-[#00FFD1]/30 transition-all"
              >
                Xem bảng giá
              </Link>
              <Link
                to="/tai-nguyen/faq"
                className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/8 text-sm font-medium text-[#eefbff] hover:border-[#00FFD1]/30 transition-all"
              >
                Tất cả FAQ
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
