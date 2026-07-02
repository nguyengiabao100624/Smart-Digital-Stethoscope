import { Link } from "react-router";
import { Users, Cpu, BarChart2, Shield, CheckCircle, Building2 } from "lucide-react";
import { useSEO } from "@/lib/useSEO";

const capabilities = [
  {
    icon: Users,
    title: "Quản lý bác sĩ/nhân sự",
    desc: "Mời bác sĩ, điều dưỡng, kỹ thuật viên vào workspace. Phân vai trò và quyền rõ ràng.",
  },
  {
    icon: Users,
    title: "Quản lý bệnh nhân",
    desc: "Tạo, import, gán bác sĩ chính/phụ cho từng bệnh nhân. Filter và tìm kiếm nhanh.",
  },
  {
    icon: Cpu,
    title: "Quản lý thiết bị",
    desc: "Kho thiết bị workspace, gán/thu hồi thiết bị, theo dõi pin và trạng thái realtime.",
  },
  {
    icon: BarChart2,
    title: "Báo cáo vận hành",
    desc: "Xuất báo cáo lượt đo, thiết bị, cảnh báo và hoạt động theo ngày/tuần/tháng.",
  },
  {
    icon: Shield,
    title: "Role & Permission",
    desc: "Kiểm soát ai được xem, sửa hoặc xuất dữ liệu trong workspace của phòng khám.",
  },
  {
    icon: CheckCircle,
    title: "Theo dõi toàn workspace",
    desc: "Dashboard tổng hợp KPI, cảnh báo và scan mới chưa được bác sĩ xem.",
  },
];

export default function ClinicSolutionPage() {
  useSEO({
    title: "Giải pháp cho phòng khám | Smart Health Care",
    description:
      "Quản lý workspace phòng khám: bác sĩ, nhân sự, bệnh nhân, thiết bị ống nghe và báo cáo vận hành theo dõi sức khỏe từ xa.",
    path: "/giai-phap/phong-kham",
  });
  return (
    <div>
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 medical-grid opacity-40" />
        <div
          className="absolute top-0 right-0 w-[500px] h-[400px] rounded-full blur-3xl pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(11,92,154,0.25) 0%, transparent 70%)",
          }}
        />
        <div className="max-w-5xl mx-auto px-6 text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm mb-5 bg-[#0B5C9A]/15 border border-[#0B5C9A]/30 text-[#4AA4E0]">
            <Building2 size={14} /> Giải pháp cho phòng khám & cơ sở y tế
          </div>
          <h1 className="brand-gradient-text mb-4">
            Vận hành phòng khám hiệu quả hơn với Smart Health
          </h1>
          <p className="text-[#8aa5ba] text-lg leading-relaxed max-w-2xl mx-auto mb-8">
            Một workspace để quản lý toàn bộ nhân sự, bệnh nhân, thiết bị và báo cáo cho phòng khám
            hoặc cơ sở y tế của bạn.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link to="/register/clinic" className="premium-button">
              Đăng ký phòng khám
            </Link>
            <Link
              to="/lien-he"
              className="px-6 py-3 rounded-full border border-white/10 bg-white/8 font-semibold text-[#eefbff] hover:border-[#00FFD1]/30 transition-all"
            >
              Liên hệ tư vấn
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-3">Đầy đủ công cụ vận hành</h2>
          <p className="text-center text-[#8aa5ba] mb-10">
            Mọi thứ một phòng khám cần để quản lý theo dõi sức khỏe từ xa.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {capabilities.map((cap) => (
              <div key={cap.title} className="premium-card p-5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-[#0B5C9A]/15 border border-[#0B5C9A]/30">
                  <cap.icon size={20} className="text-[#00FFD1]" />
                </div>
                <h3 className="text-sm font-semibold text-[#eefbff] mb-2">{cap.title}</h3>
                <p className="text-xs text-[#8aa5ba] leading-relaxed">{cap.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-10">Quy trình triển khai phòng khám</h2>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                step: 1,
                title: "Tạo workspace phòng khám",
                desc: "Đăng ký, gửi hồ sơ và được cấp workspace sau khi xét duyệt.",
              },
              {
                step: 2,
                title: "Mời bác sĩ & nhân sự",
                desc: "Mời bác sĩ, điều dưỡng, kỹ thuật viên vào workspace với vai trò phù hợp.",
              },
              {
                step: 3,
                title: "Thêm bệnh nhân & thiết bị",
                desc: "Import bệnh nhân từ file, gán bác sĩ và thiết bị ống nghe cho từng bệnh nhân.",
              },
            ].map((item) => (
              <div key={item.step} className="premium-card p-5">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-[#0d1a30] mb-3"
                  style={{
                    background: "linear-gradient(135deg,#0B5C9A,#00FFD1)",
                    boxShadow: "0 0 15px rgba(0,255,209,0.4)",
                  }}
                >
                  {item.step}
                </div>
                <h3 className="text-sm font-semibold text-[#eefbff] mb-2">{item.title}</h3>
                <p className="text-xs text-[#8aa5ba] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
