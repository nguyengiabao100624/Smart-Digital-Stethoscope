import { Link, useLocation } from "react-router";
import { Cpu, Battery, Wifi, AlertTriangle, CheckCircle, Stethoscope } from "lucide-react";
import { useSEO } from "@/lib/useSEO";

const specs = [
  { label: "Kết nối", value: "Bluetooth 5.0 + WiFi 802.11n" },
  { label: "Pin", value: "Lên đến 12 giờ liên tục" },
  { label: "Bộ nhớ", value: "Lưu trữ cục bộ 2GB khi offline" },
  { label: "Âm thanh", value: "24-bit / 44.1 kHz high-fidelity" },
  { label: "Tương thích", value: "Android 8.0+" },
  { label: "Bảo hành", value: "12 tháng chính hãng" },
];

export default function DevicePage() {
  const { pathname } = useLocation();
  const isRemote = pathname.includes("theo-doi-tu-xa");
  const meta = isRemote
    ? {
        title: "Dịch vụ theo dõi sức khỏe từ xa | Smart Health Care",
        description:
          "Dịch vụ theo dõi tim phổi từ xa của Smart Health Care kết hợp ống nghe thông minh, AI phân tích và cảnh báo bất thường realtime.",
        path: "/san-pham/theo-doi-tu-xa",
      }
    : {
        title: "Ống nghe thông minh Smart Health | Thiết bị IoT y tế",
        description:
          "Ống nghe điện tử thông minh Smart Health: Bluetooth 5.0, WiFi, pin 12 giờ, âm thanh 24-bit, lưu offline 2GB, bảo hành 12 tháng.",
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
      brand: { "@type": "Brand", name: "Smart Health Care" },
      category: isRemote ? "Remote Health Monitoring Service" : "Smart Medical Stethoscope",
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
              <Cpu size={14} /> Thiết bị IoT y tế
            </div>
            <h1 className="brand-gradient-text mb-4">Ống nghe thông minh Smart Health</h1>
            <p className="text-[#8aa5ba] text-lg leading-relaxed mb-8">
              Thiết bị ghi âm và thu tín hiệu tim phổi, kết nối với Android app qua Bluetooth, cho
              phép bệnh nhân đo tại nhà và gửi dữ liệu đến bác sĩ.
            </p>
            <Link to="/lien-he" className="premium-button inline-block">
              Liên hệ triển khai thiết bị
            </Link>
          </div>
          <div className="glass-panel rounded-2xl p-5">
            <div className="text-xs font-semibold text-[#8aa5ba] uppercase tracking-wider mb-3">
              Trạng thái thiết bị — Live
            </div>
            <div className="space-y-3">
              {[
                {
                  icon: Battery,
                  id: "SHS-2406-001",
                  status: "78% pin",
                  color: "#00FFD1",
                  bg: "rgba(0,255,209,0.08)",
                  border: "rgba(0,255,209,0.2)",
                },
                {
                  icon: Wifi,
                  id: "SHS-2406-014",
                  status: "Offline 12 phút",
                  color: "#FF4B4B",
                  bg: "rgba(255,75,75,0.08)",
                  border: "rgba(255,75,75,0.2)",
                },
                {
                  icon: AlertTriangle,
                  id: "SHS-2501-008",
                  status: "Đang đo",
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
              Đồng bộ mỗi 30 giây
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="brand-gradient-text text-center mb-3">Cách hoạt động</h2>
          <p className="text-center text-[#8aa5ba] mb-10">
            Từ bệnh nhân đến bác sĩ trong vài giây.
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
                desc: "Thiết bị ghi âm 30-60 giây. AI xử lý tín hiệu ngay trên thiết bị.",
              },
              {
                icon: Wifi,
                step: "03",
                label: "Gửi qua cloud",
                desc: "Waveform + kết quả AI gửi lên server qua WiFi hoặc dữ liệu di động.",
              },
              {
                icon: CheckCircle,
                step: "04",
                label: "Bác sĩ nhận kết quả",
                desc: "Bác sĩ nhận thông báo, xem waveform và ghi chú lâm sàng.",
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
                title: "Kết nối Bluetooth",
                desc: "Kết nối không dây với Android app trong phạm vi 10 mét.",
              },
              {
                title: "Theo dõi pin",
                desc: "Hiển thị mức pin realtime. Cảnh báo khi pin dưới 20%.",
              },
              {
                title: "Gán cho bệnh nhân",
                desc: "Dùng claim code hoặc quét QR để gán thiết bị cho bệnh nhân cụ thể.",
              },
              {
                title: "Cảnh báo mất kết nối",
                desc: "Bác sĩ/phòng khám nhận cảnh báo ngay khi thiết bị offline bất thường.",
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
            Liên hệ đội ngũ Smart Health để nhận tư vấn và chương trình hỗ trợ.
          </p>
          <Link to="/lien-he" className="premium-button inline-block">
            Liên hệ triển khai
          </Link>
        </div>
      </section>
    </div>
  );
}
