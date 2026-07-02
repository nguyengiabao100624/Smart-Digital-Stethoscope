import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import {
  ArrowRight,
  ChevronDown,
  Facebook,
  Github,
  Linkedin,
  Menu,
  MessageCircle,
  Pause,
  Play,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import logoUrl from "../../../../docs/Logo.png";
import { PublicMotionContext } from "@/app/context/PublicMotionContext";

const navLinks = [
  {
    label: "Sản phẩm",
    href: "/san-pham",
    children: [
      { label: "Ống nghe thông minh", href: "/san-pham/ong-nghe-thong-minh" },
      { label: "Theo dõi từ xa", href: "/san-pham/theo-doi-tu-xa" },
      { label: "Hồ sơ lượt đo", href: "/san-pham/ho-so-luot-do" },
    ],
  },
  {
    label: "Giải pháp",
    href: "/giai-phap",
    children: [
      { label: "Bác sĩ cá nhân", href: "/giai-phap/bac-si-ca-nhan" },
      { label: "Phòng khám", href: "/giai-phap/phong-kham" },
      { label: "Bệnh nhân tại nhà", href: "/giai-phap/benh-nhan-tai-nha" },
    ],
  },
  { label: "Bảng giá", href: "/bang-gia" },
  { label: "Bảo mật", href: "/bao-mat" },
  { label: "Tài nguyên", href: "/tai-nguyen" },
  { label: "Liên hệ", href: "/lien-he" },
];

const footerColumns = [
  {
    title: "Sản phẩm",
    links: [
      ["Ống nghe thông minh", "/san-pham/ong-nghe-thong-minh"],
      ["Theo dõi từ xa", "/san-pham/theo-doi-tu-xa"],
      ["Hồ sơ lượt đo", "/san-pham/ho-so-luot-do"],
    ],
  },
  {
    title: "Giải pháp",
    links: [
      ["Bác sĩ cá nhân", "/giai-phap/bac-si-ca-nhan"],
      ["Phòng khám", "/giai-phap/phong-kham"],
      ["Bệnh nhân tại nhà", "/giai-phap/benh-nhan-tai-nha"],
    ],
  },
  {
    title: "Công ty",
    links: [
      ["Bảng giá", "/bang-gia"],
      ["Liên hệ", "/lien-he"],
      ["Kiến thức RPM", "/tai-nguyen/kien-thuc-rpm"],
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PublicLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMobileGroup, setOpenMobileGroup] = useState<string | null>(null);
  const [openDesktopGroup, setOpenDesktopGroup] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [homeHeroActive, setHomeHeroActive] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const closeDesktopTimer = useRef<number | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const publicMainRef = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const isHome = location.pathname === "/";

  const clearDesktopCloseTimer = () => {
    if (closeDesktopTimer.current !== null) {
      window.clearTimeout(closeDesktopTimer.current);
      closeDesktopTimer.current = null;
    }
  };

  const openDesktopMenu = (label: string) => {
    clearDesktopCloseTimer();
    setOpenDesktopGroup(label);
  };

  const closeDesktopMenuSoon = () => {
    clearDesktopCloseTimer();
    closeDesktopTimer.current = window.setTimeout(() => {
      setOpenDesktopGroup(null);
      closeDesktopTimer.current = null;
    }, 140);
  };

  useEffect(() => {
    const storedMotion = window.localStorage.getItem("shc-public-motion");
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setMotionEnabled(
      storedMotion ? storedMotion === "enabled" : !prefersReducedMotion,
    );
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const hero =
        publicMainRef.current?.querySelector<HTMLElement>(".shc-hero");
      const heroHeight = hero?.offsetHeight || window.innerHeight;
      const fadeStart = Math.max(0, heroHeight - window.innerHeight * 1.04);
      const fadeDistance = Math.max(
        260,
        Math.min(560, window.innerHeight * 0.48),
      );
      const heroExitProgress = isHome
        ? Math.min(1, Math.max(0, (scrollY - fadeStart) / fadeDistance))
        : 1;

      setScrolled(scrollY > 16);
      shellRef.current?.style.setProperty(
        "--shc-hero-exit-progress",
        heroExitProgress.toFixed(3),
      );
      setHomeHeroActive(isHome && heroExitProgress < 0.96);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHome]);

  useEffect(
    () => () => {
      if (closeDesktopTimer.current !== null) {
        window.clearTimeout(closeDesktopTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    setMobileOpen(false);
    setOpenMobileGroup(null);
    setOpenDesktopGroup(null);
    setScrolled(false);
    setHomeHeroActive(location.pathname === "/");
    shellRef.current?.style.setProperty(
      "--shc-hero-exit-progress",
      location.pathname === "/" ? "0" : "1",
    );
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    publicMainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      publicMainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    if (closeDesktopTimer.current !== null) {
      window.clearTimeout(closeDesktopTimer.current);
      closeDesktopTimer.current = null;
    }
  }, [location.pathname]);

  useLayoutEffect(() => {
    const main = publicMainRef.current;
    if (!main) return;

    const resetTargets = () => {
      main
        .querySelectorAll<HTMLElement>("[data-shc-reveal]")
        .forEach((element) => {
          delete element.dataset.shcReveal;
          delete element.dataset.shcRevealState;
          element.style.removeProperty("--shc-reveal-delay");
        });
    };

    if (!motionEnabled) {
      resetTargets();
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const homeSelector = ".shc-home:not(.shc-simple-page)";
      const gridSelector = [
        ".grid",
        ".shc-product-grid",
        ".shc-plan-grid",
        ".shc-faq-grid",
        ".shc-contact-grid",
        ".shc-proof-grid",
        ".shc-workflow-rail",
        ".shc-operating-cards",
        ".shc-role-table",
        ".shc-flow-list",
      ].join(", ");
      const isHomeElement = (element: HTMLElement) =>
        Boolean(element.closest(homeSelector));
      const containers = Array.from(
        main.querySelectorAll<HTMLElement>(
          ":scope > div > section > :not(.absolute):not([data-shc-reveal]), :scope > section > :not(.absolute):not([data-shc-reveal])",
        ),
      ).filter(
        (element) => !isHomeElement(element) && !element.matches(gridSelector),
      );
      const gridItems = Array.from(
        main.querySelectorAll<HTMLElement>(
          `:scope > div:not(.shc-home) section :is(${gridSelector}) > *, :scope > .shc-simple-page section :is(${gridSelector}) > *`,
        ),
      ).filter((element) => !element.closest("[data-shc-reveal]"));
      const targets = [...containers, ...gridItems].filter(
        (element, index, source) => source.indexOf(element) === index,
      );
      const directions = ["left", "right", "up"] as const;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const element = entry.target as HTMLElement;
            element.dataset.shcRevealState = entry.isIntersecting
              ? "visible"
              : "pending";
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
      );

      targets.forEach((element, index) => {
        element.dataset.shcReveal = directions[index % directions.length];
        element.dataset.shcRevealState = "pending";
        element.style.setProperty(
          "--shc-reveal-delay",
          `${Math.min((index % 5) * 70, 280)}ms`,
        );
        observer.observe(element);
      });

      main.dataset.shcRevealObserver = "active";
      main.addEventListener("shc:dispose-reveal", () => observer.disconnect(), {
        once: true,
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      main.dispatchEvent(new Event("shc:dispose-reveal"));
      delete main.dataset.shcRevealObserver;
      resetTargets();
    };
  }, [location.pathname, motionEnabled]);

  const toggleMotion = () => {
    setMotionEnabled((current) => {
      const next = !current;
      window.localStorage.setItem(
        "shc-public-motion",
        next ? "enabled" : "reduced",
      );
      return next;
    });
  };

  return (
    <PublicMotionContext.Provider value={motionEnabled}>
      <div
        ref={shellRef}
        className="app-shell public-shell shc-public-layout"
        data-shc-home-hero={homeHeroActive ? "active" : "rest"}
        data-shc-motion={motionEnabled ? "enabled" : "reduced"}
      >
        <div className="shc-announcement">
          <span>shcare.web.app</span>
          <p>
            Workspace bác sĩ, thiết bị và hồ sơ lượt đo trong cùng một cổng vận
            hành.
          </p>
          <Link to="/bang-gia">
            Xem triển khai <ArrowRight size={14} />
          </Link>
        </div>

        <header
          className={scrolled ? "shc-header is-scrolled" : "shc-header"}
          style={{
            backdropFilter: scrolled ? "blur(44px) saturate(195%)" : "none",
            WebkitBackdropFilter: scrolled
              ? "blur(44px) saturate(195%)"
              : "none",
          }}
        >
          <div className="shc-container shc-header-inner">
            <Link to="/" className="shc-brand" aria-label="Smart Health Care">
              <span className="shc-brand-mark">
                <img src={logoUrl} alt="" />
              </span>
              <span>Smart Health Care</span>
            </Link>

            <nav className="shc-desktop-nav" aria-label="Điều hướng chính">
              {navLinks.map((item) =>
                item.children ? (
                  <div
                    className={
                      openDesktopGroup === item.label
                        ? "shc-nav-group is-open"
                        : "shc-nav-group"
                    }
                    key={item.label}
                    onMouseEnter={() => openDesktopMenu(item.label)}
                    onMouseLeave={closeDesktopMenuSoon}
                    onFocus={() => openDesktopMenu(item.label)}
                    onBlur={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null,
                        )
                      ) {
                        closeDesktopMenuSoon();
                      }
                    }}
                  >
                    <Link
                      to={item.href}
                      className={
                        isActive(location.pathname, item.href)
                          ? "is-active"
                          : ""
                      }
                      aria-expanded={openDesktopGroup === item.label}
                    >
                      {item.label}
                      <ChevronDown size={14} />
                    </Link>
                    <div className="shc-dropdown">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          to={child.href}
                          onClick={() => setOpenDesktopGroup(null)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={
                      isActive(location.pathname, item.href) ? "is-active" : ""
                    }
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>

            <div className="shc-header-actions">
              <button
                type="button"
                className="shc-motion-toggle"
                onClick={toggleMotion}
                aria-pressed={motionEnabled}
                aria-label={
                  motionEnabled
                    ? "Tắt hiệu ứng chuyển động"
                    : "Bật hiệu ứng chuyển động"
                }
                title={motionEnabled ? "Tắt hiệu ứng" : "Bật hiệu ứng"}
              >
                {motionEnabled ? <Pause size={15} /> : <Play size={15} />}
                <span>Hiệu ứng</span>
              </button>
              <Link to="/login" className="shc-login-link">
                Đăng nhập
              </Link>
              <Link
                to="/register"
                className="shc-button shc-button-primary shc-header-cta"
              >
                Bắt đầu
              </Link>
            </div>

            <button
              type="button"
              className="shc-mobile-toggle"
              onClick={() => setMobileOpen((value) => !value)}
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="shc-mobile-menu"
              >
                {navLinks.map((item) =>
                  item.children ? (
                    <div key={item.label} className="shc-mobile-group">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMobileGroup((current) =>
                            current === item.label ? null : item.label,
                          )
                        }
                      >
                        {item.label}
                        <ChevronDown
                          size={16}
                          className={
                            openMobileGroup === item.label ? "rotate-180" : ""
                          }
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {openMobileGroup === item.label && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                          >
                            {item.children.map((child) => (
                              <Link key={child.href} to={child.href}>
                                {child.label}
                              </Link>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <Link key={item.href} to={item.href}>
                      {item.label}
                    </Link>
                  ),
                )}
                <div className="shc-mobile-actions">
                  <button
                    type="button"
                    className="shc-motion-toggle shc-mobile-motion-toggle"
                    onClick={toggleMotion}
                    aria-pressed={motionEnabled}
                  >
                    {motionEnabled ? <Pause size={15} /> : <Play size={15} />}
                    <span>
                      {motionEnabled ? "Tắt hiệu ứng" : "Bật hiệu ứng"}
                    </span>
                  </button>
                  <Link to="/login" className="shc-button shc-button-secondary">
                    Đăng nhập
                  </Link>
                  <Link
                    to="/register"
                    className="shc-button shc-button-primary"
                  >
                    Bắt đầu
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <main className="min-h-[60vh] flex-1" ref={publicMainRef}>
          <Outlet />
        </main>

        <footer className="shc-footer">
          <div className="shc-container">
            <div className="shc-footer-grid">
              <div className="shc-footer-brand">
                <Link to="/" className="shc-brand">
                  <span className="shc-brand-mark">
                    <img src={logoUrl} alt="" />
                  </span>
                  <span>Smart Health Care</span>
                </Link>
                <p>
                  Cổng vận hành theo dõi tim phổi từ xa cho bác sĩ và cơ sở y
                  tế: thiết bị, lượt đo, cảnh báo, consent và audit.
                </p>
                <div className="shc-socials">
                  {[
                    [
                      Facebook,
                      "Facebook",
                      "mailto:support@smarthealth.vn?subject=Kết nối Facebook",
                    ],
                    [MessageCircle, "Zalo", "/lien-he"],
                    [
                      Github,
                      "GitHub",
                      "https://github.com/nguyengiabao100624/Smart-Digital-Stethoscope",
                    ],
                    [
                      Linkedin,
                      "LinkedIn",
                      "mailto:support@smarthealth.vn?subject=Kết nối LinkedIn",
                    ],
                  ].map(([Icon, label, href]) => (
                    <a
                      key={label as string}
                      href={href as string}
                      aria-label={label as string}
                      target={
                        (href as string).startsWith("http")
                          ? "_blank"
                          : undefined
                      }
                      rel={
                        (href as string).startsWith("http")
                          ? "noreferrer"
                          : undefined
                      }
                    >
                      <Icon size={18} />
                    </a>
                  ))}
                </div>
              </div>

              {footerColumns.map((column) => (
                <div key={column.title} className="shc-footer-column">
                  <h2>{column.title}</h2>
                  {column.links.map(([label, href]) => (
                    <Link key={href} to={href}>
                      {label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>

            <div className="shc-footer-bottom">
              <span>© 2026 Smart Health Care Platform.</span>
              <div>
                <Link to="/phap-ly">Điều khoản</Link>
                <Link to="/bao-mat">Chính sách bảo mật</Link>
                <Link to="/lien-he">Hỗ trợ</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </PublicMotionContext.Provider>
  );
}
