import { Link, Outlet, useLocation } from "react-router";
import { ArrowLeft, ClipboardCheck, Lock, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import logoUrl from "../../../../docs/Logo.png";

const authFacts = [
  ["Workspace", "Bác sĩ và cơ sở y tế dùng chung một cổng vận hành."],
  ["Phân quyền", "Quyền truy cập được kiểm tra trước khi vào portal."],
  ["Rà soát", "Các thao tác nhạy cảm có lịch sử để cơ sở đối chiếu."],
];

export function AuthLayout() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="app-shell auth-shell shc-auth-layout">
      <aside className="shc-auth-aside" aria-label="Thông tin cổng đăng nhập">
        <div className="shc-auth-aside-top">
          <Link to="/" className="shc-auth-back">
            <ArrowLeft size={16} />
            Về trang chủ
          </Link>
          <Link to="/" className="shc-brand">
            <span className="shc-brand-mark">
              <img src={logoUrl} alt="" />
            </span>
            <span>Smart Health Care</span>
          </Link>
        </div>

        <div className="shc-auth-story">
          <span className="shc-auth-chip">
            <ShieldCheck size={14} /> Phiên truy cập bảo mật
          </span>
          <h2>Cổng workspace cho bác sĩ và cơ sở y tế.</h2>
          <p>
            Đăng nhập để xem bệnh nhân, lượt đo, live monitoring, cảnh báo, thiết bị và audit log
            theo đúng quyền được cấp trong workspace.
          </p>

          <div className="shc-auth-preview-card">
            <div className="shc-auth-preview-head">
              <div>
                <ShieldCheck size={18} />
                <span>Kiểm tra trước khi vào portal</span>
              </div>
              <strong>Theo quyền được cấp</strong>
            </div>
            <ul className="shc-auth-access-list">
              <li>
                <ClipboardCheck size={14} /> Bệnh nhân và lượt đo theo workspace
              </li>
              <li>
                <ClipboardCheck size={14} /> Thiết bị, cảnh báo và lịch sử thao tác
              </li>
              <li>
                <ClipboardCheck size={14} /> Quyền hiển thị theo vai trò tài khoản
              </li>
            </ul>
          </div>
        </div>

        <div className="shc-auth-facts">
          {authFacts.map(([title, description]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          ))}
        </div>

        <div className="shc-auth-footnote">
          <span>© 2026 Smart Health Care Platform</span>
          <span>
            <Lock size={12} /> Kiểm soát truy cập
          </span>
        </div>
      </aside>

      <section className="shc-auth-form-region">
        <div className="shc-auth-mobile-top">
          <Link to="/" className="shc-brand">
            <span className="shc-brand-mark">
              <img src={logoUrl} alt="" />
            </span>
            <span>Smart Health Care</span>
          </Link>
          <Link to="/" aria-label="Về trang chủ">
            <ArrowLeft size={20} />
          </Link>
        </div>

        <div className="shc-auth-form-scroll">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="shc-auth-card"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
