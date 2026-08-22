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
    a: "RPM — theo dõi bệnh nhân từ xa — là mô hình thu thập các chỉ số hoặc lượt đo ngoài cơ sở khám, sau đó chuyển tới đội ngũ chăm sóc để xem xét theo quy trình đã thống nhất.",
  },
  {
    q: "RPM khác gì so với Telehealth?",
    a: "Telehealth thường tập trung vào buổi tư vấn từ xa. RPM bổ sung dữ liệu đo giữa các lần hẹn; tần suất và cách sử dụng dữ liệu phụ thuộc kế hoạch chăm sóc của cơ sở.",
  },
  {
    q: "Những bệnh nhân nào phù hợp với RPM?",
    a: "Đối tượng phù hợp phải do người có chuyên môn và cơ sở triển khai xác định theo mục tiêu theo dõi, khả năng sử dụng thiết bị và quy trình phản hồi.",
  },
  {
    q: "Bệnh nhân cần thiết bị gì để tham gia RPM?",
    a: "Trong luồng Shcare hiện tại, bệnh nhân dùng ứng dụng Android để claim thiết bị bằng QR, cấu hình Wi-Fi và thực hiện lượt đo theo hướng dẫn.",
  },
  {
    q: "Dữ liệu RPM được bảo mật như thế nào?",
    a: "Hệ thống hỗ trợ mã hóa khi truyền, cấu hình lưu trữ bảo mật, phân quyền workspace và consent rõ ràng để bệnh nhân có thể kiểm soát quyền truy cập. Yêu cầu tuân thủ cụ thể phụ thuộc cấu hình triển khai và chính sách pháp lý của từng cơ sở.",
  },
  {
    q: "Bác sĩ mất bao nhiêu thời gian mỗi ngày cho RPM?",
    a: "Khối lượng công việc phụ thuộc số bệnh nhân, tần suất đo, ngưỡng cảnh báo và quy trình của cơ sở. Shcare không đưa ra một thời lượng chuẩn khi chưa có dữ liệu vận hành đã xác minh.",
  },
  {
    q: "RPM có giúp giảm tái nhập viện không?",
    a: "Hiệu quả phụ thuộc chương trình, nhóm bệnh nhân và chất lượng vận hành. Shcare không công bố tỷ lệ cải thiện lâm sàng khi chưa có nghiên cứu hoặc dữ liệu triển khai được xác minh.",
  },
  {
    q: "Triển khai RPM tại phòng khám mất bao lâu?",
    a: "Thời gian triển khai được xác định sau khi chốt hạ tầng, vai trò, consent, thiết bị, đào tạo và kiểm thử. Hãy liên hệ để lập phạm vi thay vì dựa vào một mốc thời gian cố định.",
  },
];

export default function RPMGuidePage() {
  useSEO({
    title: "Kiến thức RPM: Theo dõi bệnh nhân từ xa | Shcare",
    description:
      "Tổng quan RPM cho bác sĩ và phòng khám: khái niệm, quy trình, thiết bị, quyền truy cập và cách đánh giá phạm vi triển khai với Shcare.",
    path: "/tai-nguyen/kien-thuc-rpm",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Kiến thức RPM: Theo dõi bệnh nhân từ xa",
        description:
          "Tổng quan Remote Patient Monitoring: khái niệm, quy trình, thiết bị và các điều kiện cần đánh giá trước khi triển khai.",
        author: { "@type": "Organization", name: "Shcare" },
        publisher: { "@type": "Organization", name: "Shcare" },
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
        <div className="max-w-4xl mx-auto px-6 text-center relative">
          <div className="shc-public-eyebrow mb-5">
            <BookOpen size={14} />
            Tài nguyên · Kiến thức RPM
          </div>
          <h1 className="shc-public-heading mb-5 text-3xl md:text-5xl">
            Kiến thức RPM: Theo dõi bệnh nhân từ xa
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            Tổng quan dành cho bác sĩ và phòng khám về Remote Patient Monitoring
            — từ khái niệm, quy trình triển khai đến quyền truy cập và cách bảo
            vệ dữ liệu bệnh nhân.
          </p>
        </div>
      </section>

      {/* What is RPM */}
      <section className="py-10 md:py-14">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="shc-public-heading mb-4 text-2xl md:text-3xl">
            RPM là gì?
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            <strong className="text-foreground">
              RPM (Remote Patient Monitoring)
            </strong>{" "}
            — Theo dõi bệnh nhân từ xa — là một mô hình thu thập chỉ số hoặc
            lượt đo ngoài cơ sở khám và chuyển tới đội ngũ chăm sóc theo lịch
            hoặc sự kiện đã thống nhất. Dữ liệu bổ sung ngữ cảnh giữa các lần
            hẹn; tần suất review và hành động tiếp theo do cơ sở chuyên môn quy
            định.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Tại Shcare, RPM được xây dựng quanh chiếc{" "}
            <strong className="text-foreground">ống nghe thông minh</strong> —
            thiết bị thu tín hiệu âm tim, âm phổi để đồng bộ với cổng thông tin
            bác sĩ/phòng khám và app cho bệnh nhân. Hệ thống hiện kiểm tra chất
            lượng tín hiệu; nhận định lâm sàng do người có chuyên môn thực hiện.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="shc-public-heading mb-8 text-2xl md:text-3xl">
            Lợi ích của RPM
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: HeartPulse,
                title: "Hỗ trợ theo dõi giữa các lần hẹn",
                desc: "Dữ liệu lượt đo giúp đội ngũ chăm sóc có thêm thông tin để sắp xếp ưu tiên review theo quy trình của cơ sở.",
              },
              {
                icon: Users,
                title: "Mở rộng khả năng chăm sóc",
                desc: "Workspace tập trung lượt đo, cảnh báo theo quy tắc và trạng thái review để giảm thao tác rời rạc.",
              },
              {
                icon: BarChart3,
                title: "Dữ liệu theo phiên đo",
                desc: "Lịch sử lượt đo giúp người có chuyên môn xem lại diễn tiến; Shcare không thay thế quyết định lâm sàng.",
              },
            ].map((b) => (
              <div key={b.title} className="shc-public-card p-6">
                <div className="shc-public-icon mb-4">
                  <b.icon size={22} />
                </div>
                <h3 className="text-foreground font-semibold mb-2">
                  {b.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {b.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="py-10 md:py-14">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="shc-public-heading mb-8 text-2xl md:text-3xl">
            Quy trình RPM với Shcare
          </h2>
          <div className="space-y-4">
            {[
              {
                step: "01",
                title: "Đăng ký & xác minh",
                desc: "Bác sĩ/phòng khám tạo tài khoản, nộp thông tin được yêu cầu và theo dõi trạng thái phê duyệt từ backend.",
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
                title: "Theo dõi theo kế hoạch",
                desc: "Dữ liệu được đồng bộ về portal cùng trạng thái chất lượng tín hiệu để bác sĩ ưu tiên xem xét.",
              },
              {
                step: "05",
                title: "Can thiệp & báo cáo",
                desc: "Bác sĩ xem hồ sơ, ghi chú và chọn hành động phù hợp. Export chỉ khả dụng theo quyền và định dạng backend hỗ trợ.",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="shc-public-card p-5 flex gap-5 items-start"
              >
                <div className="shc-public-step shrink-0">{s.step}</div>
                <div>
                  <h3 className="text-foreground font-semibold mb-1">
                    {s.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="shc-public-heading mb-8 text-2xl md:text-3xl">
            Bệnh lý phù hợp với RPM
          </h2>
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
                desc: "Chương trình hô hấp có thể thu thập âm phổi hoặc chỉ số khác theo chỉ định; người có chuyên môn chịu trách nhiệm review.",
              },
              {
                icon: Stethoscope,
                title: "Hậu phẫu & xuất viện",
                desc: "Chương trình sau xuất viện có thể đặt lịch lượt đo và tái khám theo phác đồ của cơ sở.",
              },
              {
                icon: Users,
                title: "Người cao tuổi",
                desc: "Người sống một mình hoặc đa bệnh — gia đình và bác sĩ cùng theo dõi từ xa.",
              },
            ].map((u) => (
              <div
                key={u.title}
                className="shc-public-card p-6 flex gap-4 items-start"
              >
                <div className="shc-public-icon shrink-0">
                  <u.icon size={20} />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold mb-1">
                    {u.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {u.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-10 md:py-14">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="shc-public-heading mb-4 text-2xl md:text-3xl">
            Bảo mật & tuân thủ trong RPM
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Dữ liệu sức khỏe cần được bảo vệ theo cấu hình và chính sách của
            từng cơ sở. Shcare cung cấp các cơ chế kỹ thuật sau, không tự tuyên
            bố chứng nhận hoặc mức tuân thủ pháp lý:
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            {[
              "Bảo vệ dữ liệu trong quá trình truyền và lưu trữ theo cấu hình triển khai",
              "Consent rõ ràng — bệnh nhân kiểm soát và thu hồi quyền",
              "Phân quyền theo vai trò (RBAC) và audit cho các hành động được hỗ trợ",
              "Hỗ trợ phân quyền, audit và chính sách bảo vệ dữ liệu cá nhân",
            ].map((s) => (
              <div
                key={s}
                className="flex items-start gap-3 shc-public-card p-4"
              >
                <ShieldCheck
                  size={18}
                  className="text-primary mt-0.5 shrink-0"
                />
                <span className="text-sm text-foreground">{s}</span>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Link
              to="/bao-mat"
              className="text-primary text-sm hover:underline"
            >
              Xem chi tiết về bảo mật →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-10 md:py-14">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="shc-public-heading mb-6 text-2xl md:text-3xl">
            Câu hỏi thường gặp về RPM
          </h2>
          <div className="space-y-2">
            {faqs.map((f, i) => {
              const isOpen = open === i;
              return (
                <div
                  key={i}
                  className={`shc-public-card overflow-hidden ${isOpen ? "is-open" : ""}`}
                >
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <span
                      className={`text-sm font-medium ${isOpen ? "text-primary" : "text-foreground"}`}
                    >
                      {f.q}
                    </span>
                    <ChevronDown
                      size={16}
                      className="text-muted-foreground shrink-0 transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : "none" }}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 pt-3 border-t border-border text-sm text-muted-foreground leading-relaxed">
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
          <div className="shc-public-card p-8 md:p-12">
            <Workflow size={32} className="text-primary mx-auto mb-4" />
            <h2 className="shc-public-heading mb-3 text-2xl md:text-3xl">
              Sẵn sàng triển khai RPM?
            </h2>
            <p className="text-muted-foreground mb-7 max-w-xl mx-auto">
              Đội ngũ Shcare sẽ cùng cơ sở xác định phạm vi, điều kiện thiết bị,
              quyền truy cập và tiêu chí nghiệm thu trước khi chốt lịch triển
              khai.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/lien-he" className="shc-button shc-button-primary">
                Liên hệ tư vấn
              </Link>
              <Link to="/bang-gia" className="shc-button shc-button-secondary">
                Xem bảng giá
              </Link>
              <Link
                to="/tai-nguyen/faq"
                className="shc-button shc-button-secondary"
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
