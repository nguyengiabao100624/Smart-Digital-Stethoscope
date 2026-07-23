import { Link, useLocation } from "react-router";
import { Cpu, Wifi, AlertTriangle, CheckCircle, Stethoscope } from "lucide-react";
import { useSEO } from "@/lib/useSEO";

const specs = [
  { label: "Kết nối sản phẩm", value: "Wi-Fi + WSS đã xác thực" },
  { label: "Ghép thiết bị", value: "QR hoặc mã claim dùng một lần" },
  { label: "Âm thanh", value: "PCM16 little-endian, mono, 16 kHz" },
  { label: "Gói tương thích", value: "128 mẫu mỗi gói" },
  { label: "Trạng thái hiện diện", value: "Ngoại tuyến · Đang kết nối · Trực tuyến · Suy giảm" },
];

export default function DevicePage() {
  const { pathname } = useLocation();
  const isRemote = pathname.includes("theo-doi-tu-xa");
  const meta = isRemote
    ? {
        title: "Theo dõi sức khỏe từ xa | Shcare",
        description:
          "Dịch vụ theo dõi tim phổi từ xa của Shcare kết hợp ống nghe thông minh, kiểm tra chất lượng tín hiệu và theo dõi trạng thái theo thời gian thực.",
        path: "/san-pham/theo-doi-tu-xa",
      }
    : {
        title: "Ống nghe thông minh Shcare | Thu tín hiệu tim phổi",
        description:
          "Ống nghe thông minh Shcare thu tín hiệu PCM16 mono 16 kHz, ghép bằng QR và kết nối Wi-Fi tới phiên WSS đã xác thực.",
        path: "/san-pham/ong-nghe-thong-minh",
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
      category: isRemote ? "Remote Health Monitoring Service" : "Connected Stethoscope",
    },
  });
  return (
    <div>
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 medical-grid opacity-40" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 70% 50%, rgba(11,92,154,0.2) 0%, transparent 60%)",
          }}
        />
        <div className="max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center relative">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm mb-5 bg-[#0B5C9A]/15 border border-[#0B5C9A]/30 text-[#4AA4E0]">
              <Cpu size={14} /> Thiết bị thu tín hiệu tim phổi
            </div>
            <h1 className="brand-gradient-text mb-4">Ống nghe thông minh Shcare</h1>
            <p className="text-[#8aa5ba] text-lg leading-relaxed mb-8">
              Thiết bị thu tín hiệu tim phổi theo phiên đo đã xác thực. Ứng dụng Android quét QR,
              hướng dẫn cấu hình Wi-Fi và chỉ hoàn tất ghép nối sau khi backend xác nhận thiết bị online.
            </p>
            <Link to="/lien-he" className="premium-button inline-block">
              Liên hệ triển khai thiết bị
            </Link>
          </div>
          <div className="glass-panel rounded-2xl p-5">
            <div className="text-xs font-semibold text-[#8aa5ba] uppercase tracking-wider mb-3">
              Ý nghĩa trạng thái thiết bị
            </div>
            <div className="space-y-3">
              {[
                {
                  icon: CheckCircle,
                  id: "Trực tuyến",
                  status: "Backend đã xác nhận thiết bị hoạt động",
                  color: "#00FFD1",
                  bg: "rgba(0,255,209,0.08)",
                  border: "rgba(0,255,209,0.2)",
                },
                {
                  icon: Wifi,
                  id: "Ngoại tuyến",
                  status: "Chưa nhận tín hiệu trạng thái",
                  color: "#FF4B4B",
                  bg: "rgba(255,75,75,0.08)",
                  border: "rgba(255,75,75,0.2)",
                },
                {
                  icon: AlertTriangle,
                  id: "Suy giảm",
                  status: "Cần kiểm tra chất lượng luồng âm thanh",
                  color: "#4AA4E0",
                  bg: "rgba(11,92,154,0.15)",
                  border: "rgba(11,92,154,0.3)",
                },
              ].map((dev) => (
                <div
                  key={dev.id}
                  className="flex items-center justify-between p-3 rounded-xl border"
                  style={{ background: dev.bg, borderColor: dev.border }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center"
                      style={{ background: dev.bg, border: `1px solid ${dev.border}` }}
                    >
                      <dev.icon size={15} style={{ color: dev.color }} />
                    </div>
                    <span className="text-sm font-mono font-semibold text-[#eefbff]">{dev.id}</span>
                  </div>
                  <span className="text-xs font-medium" style={{ color: dev.color }}>
                    {dev.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-[#8aa5ba]">
              <div
                className="w-1.5 h-1.5 rounded-full bg-[#00FFD1] animate-pulse"
                style={{ boxShadow: "0 0 6px rgba(0,255,209,0.8)" }}
              />
              Trạng thái chỉ đổi sau xác nhận từ backend hoặc thiết bị
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-3">Cách hoạt động</h2>
          <p className="text-center text-[#8aa5ba] mb-10">
            Từ phiên đo đã xác thực đến hồ sơ bác sĩ có thể xem lại.
          </p>
          <div className="grid md:grid-cols-4 gap-5">
            {[
              {
                icon: Stethoscope,
                step: "01",
                label: "Đặt ống nghe",
                desc: "Bệnh nhân đặt thiết bị đúng vị trí theo hướng dẫn trong app.",
              },
              {
                icon: Cpu,
                step: "02",
                label: "Ghi âm & xử lý",
                desc: "Thiết bị ghi âm 30-60 giây và gửi dữ liệu theo phiên đo đã xác thực.",
              },
              {
                icon: Wifi,
                step: "03",
                label: "Gửi lên hệ thống",
                desc: "Dạng sóng và trạng thái chất lượng tín hiệu được gửi lên backend qua kết nối bảo mật.",
              },
              {
                icon: CheckCircle,
                step: "04",
                label: "Bác sĩ nhận kết quả",
                desc: "Bác sĩ nhận thông báo, xem dạng sóng và ghi chú lâm sàng.",
              },
            ].map((s) => (
              <div key={s.step} className="premium-card p-5 text-center">
                <div
                  className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-[#0d1a30] font-black text-sm"
                  style={{
                    background: "linear-gradient(135deg,#0B5C9A,#00FFD1)",
                    boxShadow: "0 0 15px rgba(0,255,209,0.4)",
                  }}
                >
                  {s.step}
                </div>
                <h3 className="text-sm font-semibold text-[#eefbff] mb-2">{s.label}</h3>
                <p className="text-xs text-[#8aa5ba] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16" style={{ background: "rgba(255,255,255,0.02)" }}>
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-3">Tính năng thiết bị</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
            {[
              {
                title: "Ghi âm & thu tín hiệu",
                desc: "Ghi lại âm thanh tim phổi rõ nét tại nhiều vị trí đo khác nhau.",
              },
              {
                title: "Ghép thiết bị bằng QR",
                desc: "Claim thiết bị bằng QR hoặc mã dùng một lần, sau đó cấu hình Wi-Fi an toàn.",
              },
              {
                title: "Theo dõi sức khỏe kết nối",
                desc: "Hiển thị presence, RSSI, phiên bản firmware/protocol và trạng thái audio khi thiết bị gửi telemetry.",
              },
              {
                title: "Gán cho bệnh nhân",
                desc: "Dùng claim code hoặc quét QR để gán thiết bị cho bệnh nhân cụ thể.",
              },
              {
                title: "Cảnh báo mất kết nối",
                desc: "Sự kiện mất kết nối được ghi nhận để hệ thống tạo cảnh báo theo quy tắc đã cấu hình.",
              },
              {
                title: "Quản lý firmware",
                desc: "Cập nhật firmware từ xa qua portal để đảm bảo thiết bị luôn mới nhất.",
              },
            ].map((f) => (
              <div key={f.title} className="premium-card p-5">
                <CheckCircle
                  size={18}
                  className="text-[#00FFD1] mb-3"
                  style={{ filter: "drop-shadow(0 0 5px rgba(0,255,209,0.6))" }}
                />
                <h3 className="text-sm font-semibold text-[#eefbff] mb-2">{f.title}</h3>
                <p className="text-xs text-[#8aa5ba] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-10">Thông số kỹ thuật</h2>
          <div className="glass-panel rounded-2xl overflow-hidden">
            {specs.map((spec, idx) => (
              <div
                key={spec.label}
                className={`flex items-center justify-between px-6 py-4 ${idx < specs.length - 1 ? "border-b border-white/10" : ""}`}
              >
                <span className="text-sm text-[#8aa5ba]">{spec.label}</span>
                <span className="text-sm font-medium text-[#eefbff]">{spec.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="brand-gradient-text mb-3">Triển khai thiết bị cho phòng khám của bạn</h2>
          <p className="text-[#8aa5ba] mb-8">
            Liên hệ đội ngũ Shcare để xác nhận phạm vi thiết bị, quy trình và điều kiện triển khai.
          </p>
          <Link to="/lien-he" className="premium-button inline-block">
            Liên hệ triển khai
          </Link>
        </div>
      </section>
    </div>
  );
}
