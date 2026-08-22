import { Link, useLocation } from "react-router";
import { CheckCircle, Stethoscope, Bell, FileText, Shield } from "lucide-react";
import { useSEO } from "@/lib/useSEO";

const features = [
  {
    icon: Stethoscope,
    title: "Workspace riêng của bạn",
    desc: "Tạo workspace bác sĩ cá nhân. Quản lý toàn bộ bệnh nhân ngoại trú trong một nơi.",
  },
  {
    icon: Bell,
    title: "Cảnh báo kịp thời",
    desc: "Nhận thông báo khi có lượt đo mới cần xem, thiết bị offline hoặc cảnh báo phù hợp quyền.",
  },
  {
    icon: FileText,
    title: "Lịch sử lượt đo đầy đủ",
    desc: "Xem waveform, trạng thái chất lượng tín hiệu và ghi chú lâm sàng của mọi lượt đo.",
  },
  {
    icon: Shield,
    title: "Consent minh bạch",
    desc: "Bệnh nhân tự quyết định quyền chia sẻ dữ liệu. Đủ pháp lý cho thực hành y tế từ xa.",
  },
];

export default function DoctorSolutionPage() {
  const { pathname } = useLocation();
  const isIndex = pathname === "/giai-phap" || pathname === "/giai-phap/";
  useSEO({
    title: isIndex
      ? "Giải pháp Shcare cho bác sĩ và phòng khám"
      : "Giải pháp cho bác sĩ cá nhân | Shcare",
    description: isIndex
      ? "Khám phá các giải pháp Shcare dành cho bác sĩ, phòng khám và bệnh nhân theo dõi sức khỏe tim phổi từ xa."
      : "Workspace cho bác sĩ cá nhân theo dõi bệnh nhân ngoại trú với cảnh báo, lịch sử lượt đo và consent minh bạch.",
    path: isIndex ? "/giai-phap" : "/giai-phap/bac-si-ca-nhan",
  });
  return (
    <div>
      <section className="py-20 relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center relative">
          <div>
            <div className="shc-public-eyebrow mb-5">
              <Stethoscope size={14} /> Giải pháp cho bác sĩ cá nhân
            </div>
            <h1 className="shc-public-heading mb-4">
              Theo dõi bệnh nhân từ xa — không rời phòng khám
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Shcare giúp bác sĩ tư và bác sĩ hành nghề độc lập quản lý bệnh
              nhân ngoại trú, nhận cảnh báo kịp thời và xem lịch sử lượt đo từ
              bất cứ đâu.
            </p>
            <Link
              to="/register/doctor"
              className="shc-button shc-button-primary inline-flex"
            >
              Đăng ký bác sĩ miễn phí
            </Link>
          </div>
          <div className="shc-public-card p-5">
            <div className="text-xs font-semibold mb-3 text-muted-foreground">
              Bệnh nhân của tôi
            </div>
            <div className="space-y-2">
              {[
                {
                  name: "Nguyễn Văn An",
                  alert: "Scan mới cần xem",
                  tone: "is-warning",
                },
                {
                  name: "Trần Minh Châu",
                  alert: "Thiết bị offline 12 phút",
                  tone: "is-danger",
                },
                {
                  name: "Phạm Ngọc Mai",
                  alert: "Bình thường",
                  tone: "is-success",
                },
              ].map((p) => (
                <div key={p.name} className={`shc-public-status-row ${p.tone}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="shc-public-avatar">{p.name.charAt(0)}</div>
                    <span className="text-sm font-medium text-foreground">
                      {p.name}
                    </span>
                  </div>
                  <span className="shc-public-status-label">{p.alert}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="shc-public-heading text-center mb-3">
            Được thiết kế cho bác sĩ
          </h2>
          <p className="text-center text-muted-foreground mb-10">
            Tất cả tính năng bạn cần, không gì thừa.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            {features.map((f) => (
              <div key={f.title} className="shc-public-card p-5 flex gap-4">
                <div className="shc-public-icon flex-shrink-0">
                  <f.icon size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">
                    {f.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shc-public-section-muted py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="shc-public-heading text-center mb-10">
            Quy trình từ A đến Z
          </h2>
          <div className="grid md:grid-cols-5 gap-4 items-start">
            {[
              {
                step: "01",
                label: "Đăng ký & xác minh",
                desc: "Điền hồ sơ bác sĩ và theo dõi trạng thái xét duyệt do backend cung cấp.",
              },
              {
                step: "02",
                label: "Tạo bệnh nhân",
                desc: "Thêm bệnh nhân và gán thiết bị ống nghe.",
              },
              {
                step: "03",
                label: "Gửi consent",
                desc: "Mời bệnh nhân chấp nhận quyền theo dõi qua app.",
              },
              {
                step: "04",
                label: "Bệnh nhân đo",
                desc: "Bệnh nhân thực hiện lượt đo và theo dõi tải lên cho đến khi backend xác nhận.",
              },
              {
                step: "05",
                label: "Bác sĩ xem xét",
                desc: "Xem dạng sóng, chất lượng tín hiệu và thêm ghi chú lâm sàng.",
              },
            ].map((s, idx) => (
              <div key={s.step} className="relative text-center">
                <div className="shc-public-step mx-auto mb-3">{s.step}</div>
                {idx < 4 && (
                  <div className="shc-public-step-line hidden md:block" />
                )}
                <h3 className="text-xs font-semibold text-foreground mb-1">
                  {s.label}
                </h3>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="shc-public-heading mb-3">
            Bắt đầu theo dõi bệnh nhân từ xa hôm nay
          </h2>
          <p className="text-muted-foreground mb-8">
            Đăng ký miễn phí, không cần thẻ tín dụng. Bắt đầu trong vài phút.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link
              to="/register/doctor"
              className="shc-button shc-button-primary"
            >
              Đăng ký ngay
            </Link>
            <Link to="/lien-he" className="shc-button shc-button-secondary">
              Đăng ký tư vấn
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground flex-wrap">
            {[
              "Quy trình đăng ký rõ ràng",
              "Trạng thái xét duyệt minh bạch",
              "Hỗ trợ onboarding",
            ].map((t) => (
              <span key={t} className="flex items-center gap-1">
                <CheckCircle size={12} className="text-primary" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
