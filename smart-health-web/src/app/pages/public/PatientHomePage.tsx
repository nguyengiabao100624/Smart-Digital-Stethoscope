import {
  Activity,
  ChevronDown,
  PackageCheck,
  Shield,
  Smartphone,
  Stethoscope,
} from "lucide-react";
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
        <div className="max-w-4xl mx-auto px-6 text-center relative">
          <div className="shc-public-icon shc-public-icon-lg mx-auto mb-6">
            <Activity size={32} />
          </div>
          <h1 className="shc-public-heading mb-4">
            Dành cho bệnh nhân tại nhà
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-xl mx-auto mb-8">
            Đo sức khỏe tim phổi tại nhà, chia sẻ kết quả với bác sĩ và kiểm
            soát quyền riêng tư của bạn — tất cả trên Android app.
          </p>
          <Link
            to="/lien-he"
            className="shc-button shc-button-primary inline-flex"
          >
            Nhận ứng dụng Android
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            Phiên bản Android và điều kiện sử dụng được xác nhận theo từng
            chương trình triển khai
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="shc-public-heading text-center mb-10">
            Cách sử dụng đơn giản
          </h2>
          <div className="grid md:grid-cols-4 gap-5">
            {[
              {
                icon: PackageCheck,
                step: 1,
                title: "Nhận thiết bị từ bác sĩ",
                desc: "Bác sĩ cho mượn hoặc hướng dẫn mua ống nghe thông minh.",
              },
              {
                icon: Smartphone,
                step: 2,
                title: "Tải và đăng nhập app",
                desc: "Cài bản Android do chương trình triển khai cung cấp và đăng nhập bằng phương thức đã được hệ thống bật.",
              },
              {
                icon: Shield,
                step: 3,
                title: "Chấp nhận consent",
                desc: "Xem quyền mà bác sĩ yêu cầu và chấp nhận nếu đồng ý.",
              },
              {
                icon: Stethoscope,
                step: 4,
                title: "Đo và gửi kết quả",
                desc: "Đặt ống nghe đúng vị trí, bắt đầu đo và theo dõi trạng thái tải lên cho đến khi backend xác nhận.",
              },
            ].map((s) => (
              <div key={s.step} className="shc-public-card p-5 text-center">
                <s.icon className="mx-auto mb-3 text-primary" size={28} />
                <div className="shc-public-step shc-public-step-sm mx-auto mb-3">
                  {s.step}
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  {s.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shc-public-section-muted py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="shc-public-heading text-center mb-4">
            Bạn kiểm soát dữ liệu của mình
          </h2>
          <p className="text-center text-muted-foreground mb-10">
            Shcare giúp bệnh nhân nhìn rõ phạm vi chia sẻ và chủ động quản lý
            consent.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Shield,
                title: "Consent rõ ràng",
                desc: "Bạn biết chính xác bác sĩ nào được xem dữ liệu gì. Không có chia sẻ ngầm.",
              },
              {
                icon: Smartphone,
                title: "Thu hồi trong tích tắc",
                desc: "Gửi yêu cầu thu hồi trong app và chỉ xem là hoàn tất sau khi backend xác nhận.",
              },
              {
                icon: Activity,
                title: "Dữ liệu được mã hóa",
                desc: "Dữ liệu được bảo vệ khi truyền; quyền truy cập do backend kiểm tra theo workspace, vai trò và consent.",
              },
            ].map((item) => (
              <div key={item.title} className="shc-public-card p-5">
                <div className="shc-public-icon mb-3">
                  <item.icon size={20} />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="shc-public-heading text-center mb-8">
            Câu hỏi thường gặp
          </h2>
          <div className="space-y-2">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className={`shc-public-card overflow-hidden ${openFaq === idx ? "is-open" : ""}`}
              >
                <button
                  className="flex items-center justify-between w-full px-5 py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <span
                    className={`text-sm font-medium ${openFaq === idx ? "text-primary" : "text-foreground"}`}
                  >
                    {faq.q}
                  </span>
                  <ChevronDown
                    size={16}
                    className="text-muted-foreground flex-shrink-0 transition-transform"
                    style={{
                      transform: openFaq === idx ? "rotate(180deg)" : "none",
                    }}
                  />
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
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
