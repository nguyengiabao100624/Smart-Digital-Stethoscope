import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ClipboardCheck,
  Lock,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Link, Outlet, useLocation } from "react-router";

import logoUrl from "../../../../docs/Logo.png";

const authFacts = [
  ["Workspace", "Bác sĩ và cơ sở y tế dùng chung một cổng vận hành."],
  ["Phân quyền", "Quyền truy cập được kiểm tra trước khi vào portal."],
  ["Rà soát", "Các thao tác nhạy cảm có lịch sử để cơ sở đối chiếu."],
];

export function AuthLayout() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div
      className="app-shell auth-shell shc-auth-layout"
      data-shcare-auth-foundation="legacy-enhanced-v1"
      data-shcare-auth-visual="live-legacy"
    >
      <div className="shc-auth-skip-host">
        <a className="shc-auth-skip-link" href="#shcare-auth-main">
          Đi đến biểu mẫu
        </a>
      </div>

      <aside className="shc-auth-aside" aria-label="Thông tin cổng đăng nhập">
        <div className="shc-auth-aside-top">
          <Link to="/" className="shc-auth-back">
            <ArrowLeft size={16} aria-hidden="true" />
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
            <ShieldCheck size={14} aria-hidden="true" /> Phiên truy cập bảo mật
          </span>
          <h2>Cổng workspace cho bác sĩ và cơ sở y tế.</h2>
          <p>
            Đăng nhập để xem bệnh nhân, lượt đo, live monitoring, cảnh báo, thiết
            bị và audit log theo đúng quyền được cấp trong workspace.
          </p>

          <div className="shc-auth-preview-card">
            <div className="shc-auth-preview-head">
              <div>
                <ShieldCheck size={18} aria-hidden="true" />
                <span>Kiểm tra trước khi vào portal</span>
              </div>
              <strong>Theo quyền được cấp</strong>
            </div>
            <ul className="shc-auth-access-list">
              <li>
                <ClipboardCheck size={14} aria-hidden="true" /> Bệnh nhân và lượt
                đo theo workspace
              </li>
              <li>
                <ClipboardCheck size={14} aria-hidden="true" /> Thiết bị, cảnh báo
                và lịch sử thao tác
              </li>
              <li>
                <ClipboardCheck size={14} aria-hidden="true" /> Quyền hiển thị
                theo vai trò tài khoản
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
            <Lock size={12} aria-hidden="true" /> Kiểm soát truy cập
          </span>
        </div>
      </aside>

      <main
        id="shcare-auth-main"
        className="shc-auth-form-region"
        tabIndex={-1}
      >
        <div className="shc-auth-mobile-top">
          <Link to="/" className="shc-brand">
            <span className="shc-brand-mark">
              <img src={logoUrl} alt="" />
            </span>
            <span>Smart Health Care</span>
          </Link>
          <Link to="/" aria-label="Về trang chủ">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
        </div>

        {!online ? (
          <div
            className="shc-auth-offline-banner"
            role="status"
            aria-live="polite"
          >
            <WifiOff size={18} aria-hidden="true" />
            <span>
              <strong>Bạn đang ngoại tuyến.</strong> Kiểm tra kết nối trước khi
              gửi biểu mẫu hoặc xác minh tài khoản.
            </span>
          </div>
        ) : null}

        <div className="shc-auth-form-scroll">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
              className="shc-auth-card"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
