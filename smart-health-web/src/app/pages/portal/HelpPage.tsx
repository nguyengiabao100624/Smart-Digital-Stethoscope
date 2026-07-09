import { useState } from "react";
import {
  Search,
  MessageCircle,
  CheckCircle,
  Loader2,
  HelpCircle,
  UserPlus,
  Link2,
  WifiOff,
  MailWarning,
  ShieldMinus,
  FileText,
  Phone,
  Mail,
} from "lucide-react";
import { smartHealthApi } from "../../../lib/smart-health-api";

const guides = [
  {
    icon: UserPlus,
    title: "Mời bệnh nhân",
    desc: "Cách tạo bệnh nhân và gửi lời mời consent",
    issueType: "Lỗi tài khoản / quyền truy cập",
  },
  {
    icon: Link2,
    title: "Gán thiết bị",
    desc: "Cách gán ống nghe thông minh cho bệnh nhân",
    issueType: "Thiết bị không kết nối",
  },
  {
    icon: WifiOff,
    title: "Thiết bị offline",
    desc: "Xử lý khi thiết bị mất kết nối",
    issueType: "Thiết bị không kết nối",
  },
  {
    icon: MailWarning,
    title: "BN chưa nhận email",
    desc: "Kiểm tra và gửi lại lời mời",
    issueType: "Lỗi tài khoản / quyền truy cập",
  },
  {
    icon: ShieldMinus,
    title: "Thu hồi consent",
    desc: "Cách thu hồi quyền theo dõi bệnh nhân",
    issueType: "Khác",
  },
  {
    icon: FileText,
    title: "Xem scan & waveform",
    desc: "Cách đọc kết quả lượt đo",
    issueType: "Không nhận được lượt đo",
  },
];

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [ticketForm, setTicketForm] = useState({ type: "", desc: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async () => {
    if (!ticketForm.type || !ticketForm.desc.trim()) {
      setSubmitError("Vui lòng chọn loại vấn đề và nhập mô tả.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await smartHealthApi.createSupportTicket({
        type: ticketForm.type,
        description: ticketForm.desc,
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Không thể gửi yêu cầu hỗ trợ.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="brand-gradient-text flex items-center gap-2">
          <HelpCircle size={22} className="text-[#00FFD1]" /> Hỗ trợ & Trợ giúp
        </h1>
      </div>

      <div className="portal-search-field max-w-lg">
        <Search size={16} className="text-[#8aa5ba]" />
        <input
          id="portal-help-search"
          name="portalHelpSearch"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm câu hỏi, hướng dẫn..."
          className="portal-input"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold text-[#eefbff] mb-3">Hướng dẫn nhanh</h2>
          <div className="grid grid-cols-2 gap-3">
            {guides
              .filter((g) => !search || g.title.toLowerCase().includes(search.toLowerCase()))
              .map((guide) => {
                const GuideIcon = guide.icon;
                return (
                  <button
                    key={guide.title}
                    type="button"
                    data-support-guide={guide.title}
                    onClick={() =>
                      setTicketForm((current) => ({
                        type: guide.issueType,
                        desc: current.desc || guide.desc,
                      }))
                    }
                    className="premium-card p-4 text-left transition hover:border-[#00FFD1]/30"
                  >
                  <div className="mb-2 text-[#00FFD1]">
                    <GuideIcon size={22} aria-hidden="true" />
                  </div>
                  <div className="text-sm font-semibold text-[#eefbff] mb-1">{guide.title}</div>
                  <div className="text-xs text-[#8aa5ba] leading-relaxed">{guide.desc}</div>
                  </button>
                );
              })}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#eefbff] mb-3">Gửi yêu cầu hỗ trợ</h2>
          {submitted ? (
            <div id="support-ticket-success" className="glass-panel rounded-2xl p-8 text-center">
              <CheckCircle
                size={32}
                className="mx-auto mb-3 text-[#00FFD1] drop-shadow-[0_0_10px_rgba(0,255,209,0.5)]"
              />
              <div className="text-sm font-semibold text-[#eefbff] mb-2">Đã gửi yêu cầu hỗ trợ</div>
              <div className="text-sm text-[#8aa5ba]">
                Chúng tôi sẽ phản hồi trong 1-4 giờ làm việc.
              </div>
              <button
                onClick={() => setSubmitted(false)}
                className="mt-4 text-xs text-[#00FFD1] hover:underline"
              >
                Gửi yêu cầu khác
              </button>
            </div>
          ) : (
            <div className="glass-panel rounded-2xl p-5">
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[#eefbff]">
                    Loại vấn đề
                  </label>
                  <select
                    id="support-ticket-type"
                    name="supportTicketType"
                    value={ticketForm.type}
                    onChange={(e) => setTicketForm({ ...ticketForm, type: e.target.value })}
                    className="w-full px-3 h-10 rounded-xl border border-white/10 bg-[#04111f] text-[#eefbff] outline-none text-sm focus:border-[#00FFD1]/50 transition"
                  >
                    <option value="">Chọn loại vấn đề</option>
                    <option>Thiết bị không kết nối</option>
                    <option>Không nhận được lượt đo</option>
                    <option>Lỗi tài khoản / quyền truy cập</option>
                    <option>Lỗi giao diện</option>
                    <option>Khác</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-[#eefbff]">
                    Mô tả vấn đề
                  </label>
                  <textarea
                    id="support-ticket-description"
                    name="supportTicketDescription"
                    value={ticketForm.desc}
                    onChange={(e) => setTicketForm({ ...ticketForm, desc: e.target.value })}
                    rows={4}
                    placeholder="Mô tả chi tiết vấn đề bạn gặp phải..."
                    className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/8 text-[#eefbff] placeholder:text-white/55 outline-none text-sm resize-none focus:border-[#00FFD1]/50 transition"
                  />
                </div>
                {submitError && <p className="text-xs text-[#FF6B6B]">{submitError}</p>}
              </div>
              <button
                id="support-ticket-submit"
                onClick={handleSubmit}
                disabled={submitting || !ticketForm.type || !ticketForm.desc}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                style={{
                  background:
                    ticketForm.type && ticketForm.desc
                      ? "linear-gradient(135deg,#0B5C9A,#00FFD1)"
                      : "rgba(255,255,255,0.05)",
                  color: ticketForm.type && ticketForm.desc ? "#0d1a30" : "#8aa5ba",
                  boxShadow:
                    ticketForm.type && ticketForm.desc ? "0 0 15px rgba(0,255,209,0.3)" : "none",
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Đang gửi...
                  </>
                ) : (
                  <>
                    <MessageCircle size={14} /> Gửi yêu cầu hỗ trợ
                  </>
                )}
              </button>
            </div>
          )}
          <div className="mt-4 p-4 rounded-2xl border border-[#0B5C9A]/30 bg-[#0B5C9A]/10">
            <div className="text-sm font-semibold text-[#4AA4E0] mb-2">Liên hệ trực tiếp</div>
            <div className="flex items-center gap-2 text-sm text-[#8aa5ba]">
              <Phone size={14} aria-hidden="true" />
              <span>Hotline: 1800 1234 (T2-T6, 8:00-18:00)</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm text-[#8aa5ba]">
              <Mail size={14} aria-hidden="true" />
              <span>support@smarthealth.vn</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
