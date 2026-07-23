import { Shield, Lock, CheckCircle, Eye, RotateCcw, FileText } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useSEO } from "@/lib/useSEO";

const principles = [
  {
    icon: Lock,
    title: "Bảo vệ dữ liệu theo từng lớp",
    desc: "Kết nối sản phẩm dùng HTTPS/WSS; quyền đọc và ghi được backend kiểm tra theo workspace và capability.",
  },
  {
    icon: Eye,
    title: "Consent rõ ràng, minh bạch",
    desc: "Bệnh nhân biết chính xác ai được xem dữ liệu gì và có thể thu hồi bất cứ lúc nào.",
  },
  {
    icon: Shield,
    title: "Role-based access control",
    desc: "Mỗi vai trò chỉ thấy dữ liệu trong phạm vi quyền của mình.",
  },
  {
    icon: FileText,
    title: "Lịch sử audit trong workspace",
    desc: "Các mutation thuộc phạm vi audit được ghi kèm actor, workspace và thời điểm xử lý.",
  },
  {
    icon: RotateCcw,
    title: "Bệnh nhân kiểm soát quyền",
    desc: "Bệnh nhân là chủ sở hữu dữ liệu và có thể thu hồi quyền bất cứ lúc nào.",
  },
  {
    icon: CheckCircle,
    title: "Workspace được kiểm tra độc lập",
    desc: "Mọi truy vấn và mutation nhạy cảm phải qua kiểm tra tenant; kiểm thử chéo workspace là tiêu chí phát hành.",
  },
];

const consentSteps = [
  {
    status: "Gửi lời mời",
    desc: "Bác sĩ gửi lời mời consent qua email hoặc SMS.",
    color: "#00FFD1",
    border: "rgba(0,255,209,0.3)",
    bg: "rgba(0,255,209,0.08)",
  },
  {
    status: "Chờ chấp nhận",
    desc: "Bệnh nhân xem chi tiết quyền trước khi quyết định.",
    color: "#F59E0B",
    border: "rgba(245,158,11,0.3)",
    bg: "rgba(245,158,11,0.08)",
  },
  {
    status: "Đã chấp nhận",
    desc: "Bác sĩ có thể xem dữ liệu trong phạm vi được cấp quyền.",
    color: "#00FFD1",
    border: "rgba(0,255,209,0.3)",
    bg: "rgba(0,255,209,0.08)",
  },
  {
    status: "Thu hồi",
    desc: "Bệnh nhân thu hồi quyền bất cứ lúc nào. Bác sĩ không còn xem dữ liệu mới.",
    color: "#FF4B4B",
    border: "rgba(255,75,75,0.3)",
    bg: "rgba(255,75,75,0.08)",
  },
];

export default function SecurityPage() {
  const { pathname } = useLocation();
  const isConsent = pathname.includes("consent");
  useSEO({
    title: isConsent
      ? "Quy trình Consent dữ liệu | Shcare"
      : "Bảo mật dữ liệu sức khỏe | Shcare",
    description: isConsent
      ? "Cách Shcare quản lý consent dữ liệu: yêu cầu, chấp nhận, hết hạn, thu hồi và kiểm tra quyền truy cập."
      : "Mô hình bảo mật Shcare gồm kết nối HTTPS/WSS, consent, kiểm tra capability, tenant isolation và audit cho các mutation được hỗ trợ.",
    path: isConsent ? "/bao-mat-consent" : "/bao-mat",
  });
  return (
    <div>
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 medical-grid opacity-50" />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(11,92,154,0.3) 0%, transparent 70%)" }}
        />
        <div className="max-w-3xl mx-auto px-6 text-center relative">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-[#0B5C9A]/20 border border-[#0B5C9A]/30"
            style={{ boxShadow: "0 0 30px rgba(11,92,154,0.4)" }}
          >
            <Shield
              size={36}
              className="text-[#00FFD1]"
              style={{ filter: "drop-shadow(0 0 10px rgba(0,255,209,0.7))" }}
            />
          </div>
          <h1 className="brand-gradient-text mb-4">Bảo mật & Quyền riêng tư</h1>
          <p className="text-[#8aa5ba] text-lg leading-relaxed">
            Shcare áp dụng kiểm tra workspace, vai trò và consent tại backend. Phạm vi bảo vệ thực tế
            còn phụ thuộc cấu hình triển khai và không được dùng thay cho đánh giá tuân thủ pháp lý.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-3">Nguyên tắc bảo mật</h2>
          <p className="text-center text-[#8aa5ba] mb-10">
            Được thiết kế để bảo vệ dữ liệu y tế ở mọi tầng.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {principles.map((p) => (
              <div key={p.title} className="premium-card p-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-[#00FFD1]/10 border border-[#00FFD1]/20">
                  <p.icon size={20} className="text-[#00FFD1]" />
                </div>
                <h3 className="text-sm font-semibold text-[#eefbff] mb-2">{p.title}</h3>
                <p className="text-xs text-[#8aa5ba] leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-3">Vòng đời của Consent</h2>
          <p className="text-center text-[#8aa5ba] mb-10">
            Mỗi quyết định chia sẻ dữ liệu đều thuộc về bệnh nhân.
          </p>
          <div className="grid md:grid-cols-4 gap-4">
            {consentSteps.map((step) => (
              <div
                key={step.status}
                className="p-4 rounded-2xl border"
                style={{ borderColor: step.border, background: step.bg }}
              >
                <div
                  className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold mb-3 border"
                  style={{
                    color: step.color,
                    borderColor: step.border,
                    background: "rgba(2,8,19,0.3)",
                  }}
                >
                  {step.status}
                </div>
                <p className="text-xs text-[#8aa5ba] leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-3">Phân quyền theo vai trò</h2>
          <p className="text-center text-[#8aa5ba] mb-10">
            Mỗi vai trò chỉ thấy thông tin trong phạm vi quyền hạn của mình.
          </p>
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr
                    className="border-b border-white/10"
                    style={{ background: "rgba(255,255,255,0.03)" }}
                  >
                    <th className="text-left px-4 py-3 text-sm font-semibold text-[#eefbff]">
                      Chức năng
                    </th>
                    {["Bác sĩ tư", "Bác sĩ PK", "Điều dưỡng", "Quản lý PK"].map((role) => (
                      <th
                        key={role}
                        className="text-center px-4 py-3 text-sm font-semibold text-[#eefbff]"
                      >
                        {role}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      fn: "Xem bệnh nhân",
                      vals: ["✓ Của mình", "✓ Được gán", "✓ Được giao", "✓ Toàn PK"],
                    },
                    { fn: "Xem lượt đo", vals: ["✓", "✓", "✓", "✓"] },
                    { fn: "Ghi chú lâm sàng", vals: ["✓", "✓", "✗", "✗"] },
                    { fn: "Thu hồi consent", vals: ["✓", "✓", "✗", "✓"] },
                    { fn: "Gán thiết bị", vals: ["✓", "✗ (yêu cầu)", "✓", "✓"] },
                    { fn: "Mời bác sĩ/nhân sự", vals: ["✗", "✗", "✗", "✓"] },
                    { fn: "Xuất báo cáo", vals: ["✓", "✗", "✗", "✓"] },
                    { fn: "Cài đặt workspace", vals: ["✓ (của mình)", "✗", "✗", "✓"] },
                  ].map((row) => (
                    <tr
                      key={row.fn}
                      className="border-b border-white/5 hover:bg-white/7 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-[#eefbff]">{row.fn}</td>
                      {row.vals.map((v, i) => (
                        <td
                          key={i}
                          className="px-4 py-3 text-sm text-center"
                          style={{
                            color: v.startsWith("✓")
                              ? "#00FFD1"
                              : v === "✗"
                                ? "#FF4B4B"
                                : "#8aa5ba",
                          }}
                        >
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="brand-gradient-text mb-3">Câu hỏi về bảo mật?</h2>
          <p className="text-[#8aa5ba] mb-8">
            Chúng tôi sẵn sàng giải đáp phạm vi bảo vệ dữ liệu và cấu hình triển khai của Shcare.
          </p>
          <Link to="/lien-he" className="premium-button inline-block">
            Liên hệ đội ngũ bảo mật
          </Link>
        </div>
      </section>
    </div>
  );
}
