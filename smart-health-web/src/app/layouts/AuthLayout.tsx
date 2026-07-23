import { useEffect } from "react";
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Link, Outlet, useLocation } from "react-router";

import logoUrl from "../../../../packages/shcare-brand/assets/shcare-symbol.svg";

const authFacts = [
  ["Một tài khoản", "Đăng nhập, xác minh email và theo dõi hồ sơ trong cùng một luồng."],
  ["Quyền theo workspace", "Tính năng hiển thị theo vai trò và quyền do hệ thống cấp."],
  ["Trạng thái rõ ràng", "Các bước chờ duyệt, cần bổ sung hoặc bị từ chối đều có hướng xử lý."],
];

export function AuthLayout() {
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="app-shell shc-auth-layout shc-auth-canonical">
      <div className="shc-auth-skip-host">
        <a className="shc-auth-skip-link" href="#shcare-auth-main">Đi đến biểu mẫu</a>
      </div>

      <aside className="shc-auth-brand-panel" aria-label="Giới thiệu cổng tài khoản Shcare">
        <div className="shc-auth-brand-top">
          <Link to="/" className="shc-auth-back-link">
            <ArrowLeft size={16} aria-hidden="true" />
            Về trang chủ
          </Link>
          <Link to="/" className="shc-auth-brand-link">
            <span className="shc-auth-brand-mark" aria-hidden="true">
              <img src={logoUrl} alt="" />
            </span>
            <span>
              <strong>Shcare</strong>
              <small>Smart Health Care</small>
            </span>
          </Link>
        </div>

        <div className="shc-auth-brand-copy">
          <span className="shc-auth-context-label">
            <ShieldCheck size={15} aria-hidden="true" />
            Cổng tài khoản và workspace
          </span>
          <h2>Đăng nhập an tâm. Làm việc đúng quyền.</h2>
          <p>
            Shcare kiểm tra danh tính, trạng thái hồ sơ và quyền workspace trước khi mở các
            chức năng phù hợp với tài khoản.
          </p>

          <ul className="shc-auth-brand-checks">
            <li><CheckCircle2 size={17} aria-hidden="true" />Biểu mẫu có hướng dẫn và lỗi theo từng trường.</li>
            <li><CheckCircle2 size={17} aria-hidden="true" />Không báo hoàn tất trước khi dịch vụ phản hồi.</li>
            <li><CheckCircle2 size={17} aria-hidden="true" />Có đường phục hồi khi hồ sơ cần bổ sung.</li>
          </ul>
        </div>

        <div className="shc-auth-fact-grid" aria-label="Đặc điểm của cổng tài khoản">
          {authFacts.map(([title, description]) => (
            <article key={title}>
              <strong>{title}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>

        <footer className="shc-auth-brand-footer">
          <span>© 2026 Shcare</span>
          <span><LockKeyhole size={13} aria-hidden="true" />Truy cập theo tài khoản</span>
        </footer>
      </aside>

      <main id="shcare-auth-main" className="shc-auth-workspace" tabIndex={-1}>
        <header className="shc-auth-mobile-header">
          <Link to="/" className="shc-auth-brand-link">
            <span className="shc-auth-brand-mark" aria-hidden="true"><img src={logoUrl} alt="" /></span>
            <span><strong>Shcare</strong><small>Smart Health Care</small></span>
          </Link>
          <Link className="shc-auth-mobile-home" to="/" aria-label="Về trang chủ">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
        </header>

        <div className="shc-auth-scroll-region">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
              className="shc-auth-canonical-card"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
