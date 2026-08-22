import {
  Shield,
  Lock,
  CheckCircle,
  Eye,
  RotateCcw,
  FileText,
} from "lucide-react";
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
    tone: "is-info",
  },
  {
    status: "Chờ chấp nhận",
    desc: "Bệnh nhân xem chi tiết quyền trước khi quyết định.",
    tone: "is-warning",
  },
  {
    status: "Đã chấp nhận",
    desc: "Bác sĩ có thể xem dữ liệu trong phạm vi được cấp quyền.",
    tone: "is-success",
  },
  {
    status: "Thu hồi",
    desc: "Bệnh nhân thu hồi quyền bất cứ lúc nào. Bác sĩ không còn xem dữ liệu mới.",
    tone: "is-danger",
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
        <div className="max-w-3xl mx-auto px-6 text-center relative">
          <div className="shc-public-icon shc-public-icon-lg mx-auto mb-6">
            <Shield size={32} />
          </div>
          <h1 className="shc-public-heading mb-4">Bảo mật & Quyền riêng tư</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Shcare áp dụng kiểm tra workspace, vai trò và consent tại backend.
            Phạm vi bảo vệ thực tế còn phụ thuộc cấu hình triển khai và không
            được dùng thay cho đánh giá tuân thủ pháp lý.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="shc-public-heading text-center mb-3">
            Nguyên tắc bảo mật
          </h2>
          <p className="text-center text-muted-foreground mb-10">
            Được thiết kế để bảo vệ dữ liệu y tế ở mọi tầng.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {principles.map((p) => (
              <div key={p.title} className="shc-public-card p-5">
                <div className="shc-public-icon mb-3">
                  <p.icon size={20} />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  {p.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shc-public-section-muted py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="shc-public-heading text-center mb-3">
            Vòng đời của Consent
          </h2>
          <p className="text-center text-muted-foreground mb-10">
            Mỗi quyết định chia sẻ dữ liệu đều thuộc về bệnh nhân.
          </p>
          <div className="grid md:grid-cols-4 gap-4">
            {consentSteps.map((step) => (
              <div
                key={step.status}
                className={`shc-public-status-card ${step.tone}`}
              >
                <div className="shc-public-status-label mb-3">
                  {step.status}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="shc-public-heading text-center mb-3">
            Phân quyền theo vai trò
          </h2>
          <p className="text-center text-muted-foreground mb-10">
            Mỗi vai trò chỉ thấy thông tin trong phạm vi quyền hạn của mình.
          </p>
          <div className="shc-public-card overflow-hidden">
            <div
              className="overflow-x-auto"
              role="region"
              aria-label="Bảng phân quyền theo vai trò"
              tabIndex={0}
            >
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="shc-public-table-head border-b border-border">
                    <th className="text-left px-4 py-3 text-sm font-semibold text-foreground">
                      Chức năng
                    </th>
                    {["Bác sĩ tư", "Bác sĩ PK", "Điều dưỡng", "Quản lý PK"].map(
                      (role) => (
                        <th
                          key={role}
                          className="text-center px-4 py-3 text-sm font-semibold text-foreground"
                        >
                          {role}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      fn: "Xem bệnh nhân",
                      vals: [
                        "✓ Của mình",
                        "✓ Được gán",
                        "✓ Được giao",
                        "✓ Toàn PK",
                      ],
                    },
                    { fn: "Xem lượt đo", vals: ["✓", "✓", "✓", "✓"] },
                    { fn: "Ghi chú lâm sàng", vals: ["✓", "✓", "✗", "✗"] },
                    { fn: "Thu hồi consent", vals: ["✓", "✓", "✗", "✓"] },
                    {
                      fn: "Gán thiết bị",
                      vals: ["✓", "✗ (yêu cầu)", "✓", "✓"],
                    },
                    { fn: "Mời bác sĩ/nhân sự", vals: ["✗", "✗", "✗", "✓"] },
                    { fn: "Xuất báo cáo", vals: ["✓", "✗", "✗", "✓"] },
                    {
                      fn: "Cài đặt workspace",
                      vals: ["✓ (của mình)", "✗", "✗", "✓"],
                    },
                  ].map((row) => (
                    <tr
                      key={row.fn}
                      className="border-b border-border transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {row.fn}
                      </td>
                      {row.vals.map((v, i) => (
                        <td
                          key={i}
                          className={`px-4 py-3 text-sm text-center ${
                            v.startsWith("✓")
                              ? "text-success"
                              : v === "✗"
                                ? "text-danger"
                                : "text-muted-foreground"
                          }`}
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
          <h2 className="shc-public-heading mb-3">Câu hỏi về bảo mật?</h2>
          <p className="text-muted-foreground mb-8">
            Chúng tôi sẵn sàng giải đáp phạm vi bảo vệ dữ liệu và cấu hình triển
            khai của Shcare.
          </p>
          <Link
            to="/lien-he"
            className="shc-button shc-button-primary inline-flex"
          >
            Liên hệ đội ngũ bảo mật
          </Link>
        </div>
      </section>
    </div>
  );
}
