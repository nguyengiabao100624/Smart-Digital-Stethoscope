import { useState } from "react";
import { ChevronDown, Search, HelpCircle } from "lucide-react";
import { Link } from "react-router";
import { useSEO } from "@/lib/useSEO";

const faqGroups = [
  {
    group: "Bác sĩ",
    items: [
      {
        q: "Làm sao để đăng ký tài khoản bác sĩ?",
        a: "Truy cập /register/doctor, điền thông tin cá nhân, chuyên môn và tải tài liệu xác minh. Trạng thái xử lý được hiển thị theo dữ liệu backend.",
      },
      {
        q: "Bác sĩ có thể xem lượt đo của bệnh nhân ở phòng khám khác không?",
        a: "Không. Bác sĩ chỉ xem được bệnh nhân đã được gán cho mình trong workspace mà bác sĩ có quyền truy cập.",
      },
      {
        q: "Làm sao để gửi lời mời consent cho bệnh nhân?",
        a: "Vào Bệnh nhân > chọn bệnh nhân > Gửi lời mời. Nhập email hoặc số điện thoại và chọn phạm vi quyền theo dõi.",
      },
    ],
  },
  {
    group: "Phòng khám",
    items: [
      {
        q: "Phòng khám mới đăng ký như thế nào?",
        a: "Truy cập /register/clinic, điền thông tin cơ sở, quy mô và tải tài liệu được yêu cầu. Đội ngũ Shcare sẽ liên hệ theo quy trình triển khai đã thống nhất.",
      },
      {
        q: "Có thể mời bác sĩ từ ngoài phòng khám vào workspace không?",
        a: "Có, nhưng bác sĩ phải có tài khoản Shcare đã được xác minh. Vào Bác sĩ/nhân sự > Mời nhân sự để gửi lời mời.",
      },
      {
        q: "Làm sao để xuất báo cáo tháng?",
        a: "Vào Báo cáo, chọn khoảng thời gian và nhấn Xuất PDF hoặc Excel.",
      },
    ],
  },
  {
    group: "Bệnh nhân",
    items: [
      {
        q: "Bệnh nhân dùng gì để đo sức khỏe?",
        a: "Bệnh nhân cần bản Android Shcare do chương trình triển khai cung cấp và thiết bị đã được provision từ bác sĩ/phòng khám.",
      },
      {
        q: "Tôi có thể thu hồi quyền theo dõi của bác sĩ không?",
        a: "Có, bạn có thể thu hồi quyền bất cứ lúc nào trong Android app. Sau khi thu hồi, bác sĩ không còn xem dữ liệu mới của bạn.",
      },
      {
        q: "Dữ liệu sức khỏe của tôi có được bảo mật không?",
        a: "Dữ liệu được mã hóa và chỉ chia sẻ với người bạn đồng ý. Bạn kiểm soát hoàn toàn quyền truy cập qua consent.",
      },
    ],
  },
  {
    group: "Thiết bị",
    items: [
      {
        q: "Thiết bị offline thì phải làm gì?",
        a: "Kiểm tra Wi-Fi, nguồn điện và trạng thái provision. Nếu vẫn offline, làm theo hướng dẫn recovery trong app hoặc liên hệ hỗ trợ.",
      },
      {
        q: "Làm sao biết thiết bị đã sẵn sàng?",
        a: "Ghép nối chỉ hoàn tất sau khi firmware đăng nhập WSS và backend xác nhận thiết bị online. Nếu thiết bị vẫn offline, ứng dụng sẽ hiển thị hướng dẫn kết nối lại.",
      },
      {
        q: "Làm sao để gán thiết bị cho bệnh nhân?",
        a: "Vào Thiết bị > Gán thiết bị, hoặc dùng Wizard 3 bước: chọn bệnh nhân, nhập claim code/quét QR thiết bị, xác nhận.",
      },
    ],
  },
  {
    group: "Tài khoản",
    items: [
      {
        q: "Quên mật khẩu phải làm gì?",
        a: 'Nhấn "Quên mật khẩu" trên trang đăng nhập, nhập email và kiểm tra hộp thư để nhận hướng dẫn đặt lại.',
      },
      {
        q: "Tài khoản bị từ chối thì có đăng ký lại không?",
        a: "Có, bạn có thể liên hệ hỗ trợ để biết lý do và đăng ký lại nếu bổ sung đủ thông tin.",
      },
    ],
  },
];

export default function FAQPage() {
  useSEO({
    title: "Tài nguyên & Câu hỏi thường gặp | Shcare",
    description:
      "Câu hỏi thường gặp về Shcare: đăng ký tài khoản bác sĩ và phòng khám, sử dụng ống nghe thông minh, consent dữ liệu và bảo mật.",
    path: "/tai-nguyen",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqGroups.flatMap((g) =>
        g.items.map((i) => ({
          "@type": "Question",
          name: i.q,
          acceptedAnswer: { "@type": "Answer", text: i.a },
        })),
      ),
    },
  });
  const [search, setSearch] = useState("");
  const [openItems, setOpenItems] = useState<string[]>([]);

  const toggle = (key: string) =>
    setOpenItems((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const filtered = faqGroups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          !search ||
          i.q.toLowerCase().includes(search.toLowerCase()) ||
          i.a.toLowerCase().includes(search.toLowerCase()),
      ),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <section className="relative overflow-hidden pt-14 pb-8 md:pt-16 md:pb-10">
        <div className="max-w-3xl mx-auto px-6 text-center relative">
          <div className="shc-public-icon shc-public-icon-lg mx-auto mb-6">
            <HelpCircle size={30} />
          </div>
          <h1 className="shc-public-heading mb-4">
            Tài nguyên & Câu hỏi thường gặp
          </h1>
          <p className="text-muted-foreground text-lg mb-8">
            Tìm câu trả lời nhanh cho các thắc mắc về Shcare.
          </p>
          <div className="shc-public-search max-w-md mx-auto">
            <Search size={16} className="text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm câu hỏi..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </section>

      <section className="pt-4 pb-10 md:pt-6 md:pb-12">
        <div className="max-w-3xl mx-auto px-6">
          {filtered.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground">
              Không tìm thấy câu hỏi phù hợp.
            </div>
          ) : (
            <div className="space-y-8">
              {filtered.map((group) => (
                <div key={group.group}>
                  <h2 className="text-lg font-semibold mb-4 text-primary">
                    {group.group}
                  </h2>
                  <div className="space-y-2">
                    {group.items.map((item, idx) => {
                      const key = `${group.group}-${idx}`;
                      const open = openItems.includes(key);
                      return (
                        <div
                          key={key}
                          className={`shc-public-card overflow-hidden ${open ? "is-open" : ""}`}
                        >
                          <button
                            className="flex items-center justify-between w-full px-5 py-4 text-left"
                            onClick={() => toggle(key)}
                          >
                            <span
                              className={`text-sm font-medium ${open ? "text-primary" : "text-foreground"}`}
                            >
                              {item.q}
                            </span>
                            <ChevronDown
                              size={16}
                              className="text-muted-foreground flex-shrink-0 transition-transform"
                              style={{
                                transform: open ? "rotate(180deg)" : "none",
                              }}
                            />
                          </button>
                          {open && (
                            <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
                              {item.a}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="pt-6 pb-12 md:pt-8 md:pb-14">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="shc-public-heading mb-3">
            Không tìm thấy câu trả lời?
          </h2>
          <p className="text-muted-foreground mb-8">
            Liên hệ đội ngũ hỗ trợ Shcare để được giải đáp theo phạm vi triển
            khai.
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/lien-he" className="shc-button shc-button-primary">
              Liên hệ hỗ trợ
            </Link>
            <Link to="/bao-mat" className="shc-button shc-button-secondary">
              Xem chính sách bảo mật
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
