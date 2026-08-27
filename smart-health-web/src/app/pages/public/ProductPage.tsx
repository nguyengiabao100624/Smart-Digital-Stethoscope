import { Link, useLocation } from "react-router";
import {
  Activity,
  ArrowRight,
  Bell,
  FileText,
  ShieldCheck,
  Smartphone,
  Stethoscope,
} from "lucide-react";
import { useSEO } from "@/lib/useSEO";

const products = [
  {
    icon: Stethoscope,
    title: "Ống nghe thông minh",
    desc: "Thu âm tim phổi, gửi trạng thái thiết bị và tạo phiên đo có đủ ngữ cảnh để bác sĩ xem lại.",
  },
  {
    icon: Smartphone,
    title: "Ứng dụng di động",
    desc: "Hỗ trợ đo tại nhà, quản lý consent, nhận thông báo và chia sẻ hồ sơ theo quyền.",
  },
  {
    icon: Activity,
    title: "Theo dõi trực tiếp",
    desc: "Theo dõi nguồn phiên đo, trạng thái kết nối và chất lượng luồng tín hiệu khi thiết bị online.",
  },
  {
    icon: FileText,
    title: "Hồ sơ lượt đo",
    desc: "Lưu dạng sóng, metadata, trạng thái chất lượng tín hiệu, ghi chú lâm sàng và lịch sử truy cập được hỗ trợ.",
  },
  {
    icon: Bell,
    title: "Hàng đợi cần xem",
    desc: "Gom cảnh báo, thiết bị offline và lượt đo ưu tiên để đội ngũ y tế xử lý trước.",
  },
  {
    icon: ShieldCheck,
    title: "Consent và audit",
    desc: "Kiểm soát người được xem hồ sơ, thời hạn chia sẻ và thao tác nhạy cảm trong workspace.",
  },
];

const flow = [
  ["Thiết bị", "Thu âm và gửi trạng thái phiên đo."],
  ["Ứng dụng", "Gắn người bệnh, consent và thông tin phiên đo."],
  ["Workspace", "Sắp hàng lượt đo, cảnh báo và hồ sơ cần xem."],
  ["Bác sĩ", "Xác nhận ghi chú và quyết định lâm sàng."],
];

export default function ProductPage() {
  const { pathname } = useLocation();
  const isRecords = pathname.includes("ho-so-luot-do");
  const meta = isRecords
    ? {
        title: "Hồ sơ lượt đo | Shcare",
        description:
          "Hồ sơ lượt đo Shcare lưu waveform, trạng thái chất lượng tín hiệu, ghi chú lâm sàng và lịch sử truy cập được hỗ trợ.",
        path: "/san-pham/ho-so-luot-do",
      }
    : {
        title: "Sản phẩm Shcare | Workspace theo dõi tim phổi",
        description:
          "Hệ sinh thái Shcare gồm ống nghe thông minh, ứng dụng di động, theo dõi trực tiếp, hồ sơ lượt đo, cảnh báo và consent.",
        path: "/san-pham",
      };

  useSEO({
    ...meta,
    ogType: "product",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Product",
      name: meta.title.split(" |")[0],
      description: meta.description,
      brand: { "@type": "Brand", name: "Shcare" },
    },
  });

  return (
    <div data-themable-page className="shc-home shc-simple-page">
      <section className="shc-page-hero">
        <div className="shc-container">
          <p>Sản phẩm</p>
          <h1>Hệ sinh thái theo dõi từ xa, thiết kế quanh lượt đo thật.</h1>
          <span>
            Từ thiết bị đến ứng dụng và workspace bác sĩ, mỗi phần đều có một
            nhiệm vụ rõ: thu dữ liệu, giữ quyền truy cập đúng, sắp hàng hồ sơ và
            giúp bác sĩ xem lại nhanh hơn.
          </span>
        </div>
      </section>

      <section className="shc-section">
        <div className="shc-container shc-product-grid">
          {products.map((item) => (
            <article key={item.title} className="shc-product-card">
              <item.icon size={22} />
              <h2>{item.title}</h2>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="shc-section shc-section-tight">
        <div className="shc-container shc-flow-panel">
          <div className="shc-section-heading">
            <p>Luồng dữ liệu</p>
            <h2>Một đường đi rõ từ phiên đo đến hồ sơ bác sĩ cần xem.</h2>
          </div>
          <div className="shc-flow-list">
            {flow.map(([title, desc], index) => (
              <article key={title}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <h3>{title}</h3>
                <p>{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="shc-cta">
        <div className="shc-container shc-cta-card">
          <div>
            <p>Chọn surface phù hợp</p>
            <h2>Bắt đầu bằng bác sĩ cá nhân hoặc workspace cơ sở.</h2>
          </div>
          <div className="shc-cta-actions">
            <Link
              to="/giai-phap/bac-si-ca-nhan"
              className="shc-button shc-button-secondary"
            >
              Giải pháp bác sĩ
            </Link>
            <Link
              to="/giai-phap/phong-kham"
              className="shc-button shc-button-primary"
            >
              Giải pháp cơ sở <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
