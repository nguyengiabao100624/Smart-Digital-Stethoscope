import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useSEO } from "@/lib/useSEO";

const plans = [
  {
    name: "Bác sĩ cá nhân",
    price: "499.000",
    priceYear: "399.000",
    unit: "/tháng",
    desc: "Dành cho bác sĩ hành nghề độc lập hoặc phòng khám nhỏ muốn theo dõi nhóm bệnh nhân từ xa.",
    features: [
      "Tối đa 30 bệnh nhân theo dõi",
      "2 thiết bị ống nghe thông minh",
      "Xem lượt đo và waveform tim phổi",
      "Cảnh báo bất thường cần xem",
      "Ghi chú lâm sàng số hóa",
      "Consent và chia sẻ dữ liệu",
    ],
    cta: "Đăng ký bác sĩ",
    href: "/register",
    highlight: false,
  },
  {
    name: "Phòng khám",
    price: "1.499.000",
    priceYear: "1.199.000",
    unit: "/tháng",
    desc: "Cho cơ sở có nhiều bác sĩ, nhiều thiết bị và cần hàng đợi xử lý lượt đo rõ ràng.",
    features: [
      "Tối đa 200 bệnh nhân active",
      "10 thiết bị thu âm tim phổi",
      "5 tài khoản chuyên gia y tế",
      "Quản lý kho thiết bị",
      "Live monitoring theo trạng thái thiết bị",
      "Dashboard, báo cáo và phân quyền",
    ],
    cta: "Tạo workspace",
    href: "/register/phong-kham",
    highlight: true,
  },
  {
    name: "Cơ sở lớn",
    price: "Tùy chỉnh",
    priceYear: "Tùy chỉnh",
    unit: "",
    desc: "Triển khai theo quy trình, lưu trữ, tích hợp và SLA riêng của từng bệnh viện hoặc chuỗi cơ sở.",
    features: [
      "Không giới hạn theo hợp đồng",
      "Multi-workspace cho chuỗi cơ sở",
      "Tích hợp HIS / EMR / HL7 khi triển khai",
      "Miền hoặc branding riêng",
      "SLA theo hợp đồng",
      "Hỗ trợ kỹ thuật theo dự án",
    ],
    cta: "Liên hệ tư vấn",
    href: "/lien-he",
    highlight: false,
  },
];

const faqs = [
  [
    "Có cần trả trước dài hạn không?",
    "Không bắt buộc. Cơ sở có thể bắt đầu theo tháng, sau đó chuyển sang năm khi quy trình đã ổn định.",
  ],
  [
    "Thiết bị được cung cấp thế nào?",
    "Thiết bị có thể được cấp theo gói triển khai hoặc mua riêng tùy số lượng và mô hình vận hành.",
  ],
  [
    "Có cần thẻ thanh toán để bắt đầu?",
    "Không. Trong giai đoạn kiểm thử, đội ngũ Shcare có thể mở workspace sau khi hồ sơ được duyệt.",
  ],
  [
    "Dữ liệu y tế được bảo vệ ra sao?",
    "Hệ thống hỗ trợ TLS, phân quyền theo workspace, audit log và cấu hình lưu trữ bảo mật. Yêu cầu tuân thủ cụ thể phụ thuộc cấu hình triển khai và chính sách pháp lý của từng cơ sở.",
  ],
];

export default function PricingPage() {
  useSEO({
    title: "Bảng giá Shcare | Các gói cho bác sĩ và cơ sở y tế",
    description:
      "So sánh phạm vi các gói Shcare dành cho bác sĩ cá nhân, phòng khám và cơ sở y tế; thanh toán trực tuyến chưa nằm trong đợt triển khai này.",
    path: "/bang-gia",
  });

  const [yearly, setYearly] = useState(false);

  return (
    <div data-themable-page className="shc-home shc-simple-page">
      <section className="shc-page-hero">
        <div className="shc-container">
          <p>Bảng giá</p>
          <h1>Gói triển khai rõ chi phí, không dùng số liệu phóng đại.</h1>
          <span>
            Chọn quy mô phù hợp với cách bạn vận hành: bác sĩ cá nhân, phòng khám hoặc cơ sở lớn cần
            tích hợp và SLA riêng.
          </span>
          <div className="shc-billing-toggle" aria-label="Chọn chu kỳ thanh toán">
            <button type="button" className={!yearly ? "is-active" : ""} onClick={() => setYearly(false)}>
              Theo tháng
            </button>
            <button type="button" className={yearly ? "is-active" : ""} onClick={() => setYearly(true)}>
              Theo năm
              <small>tiết kiệm 20%</small>
            </button>
          </div>
        </div>
      </section>

      <section className="shc-section">
        <div className="shc-container shc-plan-grid">
          {plans.map((plan) => (
            <article key={plan.name} className={plan.highlight ? "shc-plan is-featured" : "shc-plan"}>
              {plan.highlight && <span className="shc-plan-badge">Phù hợp phòng khám</span>}
              <h2>{plan.name}</h2>
              <p>{plan.desc}</p>
              <div className="shc-price">
                <strong>{yearly && plan.priceYear !== "Tùy chỉnh" ? plan.priceYear : plan.price}</strong>
                {plan.unit && <span>{yearly ? "/tháng" : plan.unit}</span>}
              </div>
              {plan.price !== "Tùy chỉnh" && <small>VNĐ · chưa bao gồm VAT</small>}
              <Link
                to={plan.href}
                className={plan.highlight ? "shc-button shc-button-primary" : "shc-button shc-button-secondary"}
              >
                {plan.cta} <ArrowRight size={17} />
              </Link>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <CheckCircle2 size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="shc-section shc-section-tight">
        <div className="shc-container shc-faq-grid">
          <div className="shc-section-heading">
            <p>Câu hỏi thường gặp</p>
            <h2>Những điểm cần rõ trước khi triển khai.</h2>
          </div>
          <div className="shc-faq-list">
            {faqs.map(([question, answer]) => (
              <article key={question}>
                <h3>{question}</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="shc-cta">
        <div className="shc-container shc-cta-card">
          <div>
            <p>Cần cấu hình riêng?</p>
            <h2>Gửi quy mô cơ sở, chúng tôi đề xuất gói phù hợp.</h2>
          </div>
          <div className="shc-cta-actions">
            <Link to="/lien-he" className="shc-button shc-button-primary">
              Liên hệ tư vấn <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
