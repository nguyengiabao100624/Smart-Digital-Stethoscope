import { FileText } from "lucide-react";
import { useLocation } from "react-router";
import { useSEO } from "@/lib/useSEO";

const sections = [
  {
    title: "Chính sách bảo mật",
    content: [
      {
        heading: "1. Thông tin chúng tôi thu thập",
        body: "Shcare thu thập thông tin cá nhân bạn cung cấp khi đăng ký (họ tên, email, số điện thoại, thông tin chuyên môn), dữ liệu y tế từ thiết bị đo (với consent của bạn), và dữ liệu sử dụng dịch vụ.",
      },
      {
        heading: "2. Cách chúng tôi sử dụng thông tin",
        body: "Thông tin được dùng để cung cấp dịch vụ theo dõi sức khỏe, xác minh tài khoản bác sĩ/phòng khám, và hỗ trợ kỹ thuật. Chúng tôi không bán dữ liệu cho bên thứ ba.",
      },
      {
        heading: "3. Bảo vệ dữ liệu",
        body: "Tất cả dữ liệu y tế được mã hóa khi truyền và lưu trữ. Chúng tôi áp dụng các biện pháp bảo mật kỹ thuật và tổ chức phù hợp để bảo vệ dữ liệu của bạn.",
      },
      {
        heading: "4. Quyền của bạn",
        body: "Bạn có quyền truy cập, chỉnh sửa hoặc yêu cầu xóa dữ liệu cá nhân của mình. Liên hệ privacy@smarthealth.vn để thực hiện quyền này.",
      },
    ],
  },
  {
    title: "Điều khoản sử dụng",
    content: [
      {
        heading: "1. Điều kiện sử dụng",
        body: "Dịch vụ Shcare chỉ dành cho bác sĩ, phòng khám và cơ sở y tế đã được xác minh. Người dùng phải tuân thủ các quy định pháp luật về y tế và bảo vệ dữ liệu.",
      },
      {
        heading: "2. Giới hạn trách nhiệm",
        body: "Shcare cung cấp công cụ hỗ trợ theo dõi, không thay thế chẩn đoán y tế. Quyết định lâm sàng hoàn toàn thuộc về bác sĩ có thẩm quyền.",
      },
      {
        heading: "3. Sở hữu trí tuệ",
        body: "Phần mềm, giao diện và nội dung của Shcare là tài sản của công ty. Người dùng không được sao chép hoặc sử dụng lại mà không có sự đồng ý bằng văn bản.",
      },
    ],
  },
  {
    title: "Chính sách Consent dữ liệu",
    content: [
      {
        heading: "1. Nguyên tắc consent",
        body: "Dữ liệu y tế chỉ được chia sẻ khi bệnh nhân đồng ý rõ ràng thông qua Android app. Bệnh nhân có thể thu hồi consent bất cứ lúc nào.",
      },
      {
        heading: "2. Phạm vi consent",
        body: "Khi bác sĩ gửi lời mời, phạm vi quyền truy cập (xem hồ sơ, lượt đo, monitoring) được hiển thị rõ ràng để bệnh nhân quyết định.",
      },
      {
        heading: "3. Sau khi thu hồi consent",
        body: "Sau khi thu hồi, bác sĩ/phòng khám không còn xem được dữ liệu mới. Dữ liệu đã chia sẻ trước đó được xử lý theo chính sách lưu trữ.",
      },
    ],
  },
];

export default function LegalPage() {
  const { pathname } = useLocation();
  const meta = pathname.includes("dieu-khoan")
    ? {
        title: "Điều khoản sử dụng | Shcare",
        description:
          "Điều khoản sử dụng dịch vụ Shcare dành cho bác sĩ, phòng khám và cơ sở y tế.",
        path: "/dieu-khoan",
      }
    : pathname.includes("chinh-sach")
      ? {
          title: "Chính sách bảo mật | Shcare",
          description:
            "Cách Shcare thu thập, sử dụng và bảo vệ thông tin cá nhân, dữ liệu y tế của người dùng.",
          path: "/chinh-sach-bao-mat",
        }
      : {
          title: "Pháp lý & Điều khoản | Shcare",
          description:
            "Tài liệu pháp lý của Shcare: chính sách bảo mật, điều khoản sử dụng và chính sách consent dữ liệu.",
          path: "/phap-ly",
        };
  useSEO(meta);
  return (
    <div>
      <section className="py-16 relative overflow-hidden">
        <div className="absolute inset-0 medical-grid opacity-30" />
        <div className="max-w-3xl mx-auto px-6 text-center relative">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[#0B5C9A]/15 border border-[#0B5C9A]/30"
            style={{ boxShadow: "0 0 20px rgba(11,92,154,0.3)" }}
          >
            <FileText size={24} className="text-[#00FFD1]" />
          </div>
          <h1 className="brand-gradient-text mb-2">Pháp lý & Điều khoản</h1>
          <p className="text-[#8aa5ba] text-sm">Cập nhật lần cuối: Tháng 6, 2026</p>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-3xl mx-auto px-6 space-y-8">
          {sections.map((section) => (
            <div key={section.title} className="glass-panel rounded-2xl p-6">
              <h2 className="text-lg font-bold text-[#00FFD1] mb-4 pb-3 border-b border-white/10">
                {section.title}
              </h2>
              <div className="space-y-5">
                {section.content.map((item) => (
                  <div key={item.heading}>
                    <h3 className="text-sm font-semibold text-[#eefbff] mb-2">{item.heading}</h3>
                    <p className="text-sm text-[#8aa5ba] leading-relaxed">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10 border-t border-white/10">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-[#8aa5ba] text-sm mb-2">Câu hỏi về pháp lý hoặc quyền riêng tư?</p>
          <a
            href="mailto:legal@smarthealth.vn"
            className="text-[#00FFD1] text-sm font-medium hover:underline"
          >
            legal@smarthealth.vn
          </a>
        </div>
      </section>
    </div>
  );
}
