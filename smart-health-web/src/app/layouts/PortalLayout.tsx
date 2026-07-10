import { useEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  FileText,
  Fingerprint,
  HelpCircle,
  Home,
  LogOut,
  Mail,
  Menu,
  Settings,
  Shield,
  Stethoscope,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import logoUrl from "../../../../docs/Logo.png";
import { smartHealthApi } from "../../lib/smart-health-api";
import { useAuth } from "../context/AuthContext";

const doctorNav = [
  { to: "/portal/dashboard", icon: Home, label: "Tổng quan" },
  { to: "/portal/patients", icon: Users, label: "Bệnh nhân" },
  { to: "/portal/appointments", icon: CalendarDays, label: "Lịch hẹn" },
  { to: "/portal/live", icon: Activity, label: "Theo dõi trực tiếp" },
  { to: "/portal/records", icon: FileText, label: "Lượt đo & hồ sơ" },
  { to: "/portal/devices", icon: Stethoscope, label: "Thiết bị" },
  { to: "/portal/consent", icon: Mail, label: "Lời mời & consent" },
  { to: "/portal/alerts", icon: AlertTriangle, label: "Cảnh báo" },
  { to: "/portal/notifications", icon: Bell, label: "Thông báo", badge: true },
];

const clinicNav = [
  { to: "/portal/dashboard", icon: Home, label: "Tổng quan" },
  { to: "/portal/patients", icon: Users, label: "Bệnh nhân" },
  { to: "/portal/appointments", icon: CalendarDays, label: "Lịch hẹn" },
  { to: "/portal/live", icon: Activity, label: "Theo dõi trực tiếp" },
  { to: "/portal/records", icon: FileText, label: "Lượt đo & hồ sơ" },
  { to: "/portal/devices", icon: Stethoscope, label: "Thiết bị" },
  { to: "/portal/consent", icon: Mail, label: "Lời mời & consent" },
  { to: "/portal/staff", icon: Building2, label: "Bác sĩ / nhân sự" },
  { to: "/portal/reports", icon: BarChart2, label: "Báo cáo" },
  { to: "/portal/alerts", icon: AlertTriangle, label: "Cảnh báo" },
  { to: "/portal/notifications", icon: Bell, label: "Thông báo", badge: true },
];

const footerNav = [
  { to: "/portal/onboarding", icon: Zap, label: "Bắt đầu nhanh" },
  { to: "/portal/settings", icon: Settings, label: "Cài đặt" },
  { to: "/portal/help", icon: HelpCircle, label: "Hỗ trợ" },
];

function isActive(pathname: string, target: string) {
  return (
    pathname === target ||
    (target !== "/portal/dashboard" && pathname.startsWith(`${target}/`))
  );
}

function pageTitle(
  pathname: string,
  items: Array<{ to: string; label: string }>,
) {
  const match = items.find((item) => isActive(pathname, item.to));
  if (match) return match.label;
  if (pathname.includes("/workspace")) return "Workspace";
  if (pathname.includes("/billing")) return "Gói dịch vụ";
  if (pathname.includes("/audit")) return "Nhật ký audit";
  return "Workspace";
}

export default function PortalLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement | null>(null);

  const notificationsQuery = useQuery({
    queryKey: ["portal", "notifications", user?.currentWorkspace.id],
    queryFn: smartHealthApi.listNotifications,
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
  const backendStatusQuery = useQuery({
    queryKey: ["portal", "status", user?.currentWorkspace.id],
    queryFn: smartHealthApi.portalStatus,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    retry: 1,
    staleTime: 20_000,
  });

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node))
        setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(event.target as Node))
        setUserMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    setNotifOpen(false);
    setUserMenuOpen(false);
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  if (isLoading) {
    return (
      <div className="clinical-portal grid min-h-screen place-items-center">
        Đang xác thực phiên đăng nhập…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (
    user.allowedSurfaces.length > 0 &&
    !user.allowedSurfaces.includes("portal") &&
    location.pathname !== "/portal/permission-denied"
  ) {
    return <Navigate to="/portal/permission-denied" replace />;
  }

  const isClinic =
    ["workspace_admin", "workspace_owner"].includes(user.role) ||
    user.capabilities.includes("workspace.staff.manage");
  const navigation = isClinic ? clinicNav : doctorNav;
  const notifications = notificationsQuery.data?.notifications || [];
  const unread = notifications.filter(
    (notification) => !notification.read,
  ).length;
  const recentNotifications = notifications.slice(0, 4);
  const workspaceName = user.currentWorkspace.name;
  const roleLabel = isClinic ? "Quản lý cơ sở" : "Bác sĩ";
  const title = pageTitle(location.pathname, [...navigation, ...footerNav]);
  const backendStatus = backendStatusQuery.data;
  const backendOnline = Boolean(backendStatusQuery.isSuccess && backendStatus);
  const backendStatusLabel = backendOnline
    ? "BE online"
    : backendStatusQuery.isError
      ? "BE lỗi"
      : "Đang kiểm tra BE";
  const backendStatusTitle = backendStatus
    ? `Backend ${backendStatus.service} · ${backendStatus.mode.dataBackend} · ${backendStatus.scoped.devicesOnline}/${backendStatus.scoped.devicesCount} thiết bị online`
    : "Portal đang kiểm tra kết nối backend Smart Health";

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className={`clinical-portal${sidebarOpen ? " is-sidebar-open" : ""}`}>
      <div className="clinical-portal-shell">
        <AnimatePresence>
          {sidebarOpen && (
            <motion.button
              type="button"
              aria-label="Đóng menu workspace"
              className="clinical-mobile-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <aside className="clinical-sidebar" aria-label="Điều hướng workspace">
          <div className="clinical-sidebar-brand">
            <Link
              to="/"
              className="flex min-w-0 items-center gap-3"
              aria-label="Về Smart Health Care"
            >
              <img src={logoUrl} alt="" />
              <span className="truncate">Smart Health Care</span>
            </Link>
            <button
              type="button"
              className="clinical-sidebar-close ml-auto"
              aria-label="Đóng menu"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          <Link to="/portal/workspace" className="clinical-workspace-link">
            <span className="clinical-workspace-avatar" aria-hidden="true">
              {workspaceName.charAt(0).toUpperCase()}
            </span>
            <span className="clinical-workspace-copy">
              <strong>{workspaceName}</strong>
              <span>{roleLabel}</span>
            </span>
            <ChevronDown size={15} aria-hidden="true" />
          </Link>

          <nav className="clinical-side-nav">
            {navigation.map(({ to, icon: Icon, label, badge }) => {
              const active = isActive(location.pathname, to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={active ? "is-active" : ""}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {badge && unread > 0 && (
                    <span className="clinical-notification-count">
                      {unread}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <nav className="clinical-side-footer">
            {footerNav.map(({ to, icon: Icon, label }) => {
              const active = isActive(location.pathname, to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={active ? "is-active" : ""}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="clinical-main">
          <header className="clinical-topbar">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="clinical-mobile-trigger"
                aria-label="Mở menu workspace"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu size={20} />
              </button>
              <div className="clinical-topbar-title">
                <p>
                  {workspaceName} · {roleLabel}
                </p>
                <h1>{title}</h1>
              </div>
            </div>

            <div className="clinical-top-actions">
              <div
                className={`clinical-backend-status ${
                  backendOnline
                    ? "is-online"
                    : backendStatusQuery.isError
                      ? "is-error"
                      : "is-checking"
                }`}
                title={backendStatusTitle}
                aria-label={backendStatusTitle}
              >
                <span className="clinical-backend-dot" aria-hidden="true" />
                <span>{backendStatusLabel}</span>
              </div>

              <div ref={notifRef} className="relative">
                <button
                  id="portal-notifications-trigger"
                  type="button"
                  className="clinical-top-action"
                  aria-label={
                    unread > 0 ? `${unread} thông báo chưa đọc` : "Thông báo"
                  }
                  aria-expanded={notifOpen}
                  onClick={() => {
                    setNotifOpen((open) => !open);
                    setUserMenuOpen(false);
                  }}
                >
                  <Bell size={19} />
                  {unread > 0 && (
                    <span className="clinical-notification-count absolute -right-1 -top-1">
                      {unread}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      className="clinical-popover"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                    >
                      <header>
                        <strong>Thông báo gần đây</strong>
                        {unread > 0 && (
                          <span className="clinical-notification-count">
                            {unread}
                          </span>
                        )}
                      </header>
                      {recentNotifications.length > 0 ? (
                        recentNotifications.map((notification) => (
                          <Link
                            className="clinical-popover-notice"
                            key={notification.id}
                            to="/portal/notifications"
                          >
                            <p>{notification.title || "Thông báo workspace"}</p>
                            {notification.createdAt && (
                              <time>
                                {new Date(
                                  notification.createdAt,
                                ).toLocaleString("vi-VN")}
                              </time>
                            )}
                          </Link>
                        ))
                      ) : (
                        <div className="clinical-popover-notice">
                          <p>Chưa có thông báo mới trong workspace.</p>
                        </div>
                      )}
                      <Link
                        className="clinical-popover-footer"
                        to="/portal/notifications"
                      >
                        Xem tất cả thông báo
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div ref={userRef} className="relative">
                <button
                  id="portal-user-menu-trigger"
                  type="button"
                  className="clinical-user-trigger"
                  aria-label="Mở menu tài khoản"
                  aria-expanded={userMenuOpen}
                  onClick={() => {
                    setUserMenuOpen((open) => !open);
                    setNotifOpen(false);
                  }}
                >
                  <span className="clinical-user-avatar" aria-hidden="true">
                    {user.name.charAt(user.name.lastIndexOf(" ") + 1) || (
                      <User size={16} />
                    )}
                  </span>
                  <ChevronDown size={15} />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      className="clinical-popover"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                    >
                      <header className="block">
                        <strong className="block truncate">{user.name}</strong>
                        <span className="mt-1 block truncate text-xs text-[var(--clinical-muted)]">
                          {user.email}
                        </span>
                      </header>
                      <div className="clinical-popover-menu">
                        <Link
                          className="clinical-popover-link"
                          to="/portal/settings"
                        >
                          <Fingerprint size={16} /> Hồ sơ & bảo mật
                        </Link>
                        <Link
                          className="clinical-popover-link"
                          to="/portal/audit"
                        >
                          <Shield size={16} /> Nhật ký audit
                        </Link>
                        <button
                          id="portal-logout"
                          type="button"
                          onClick={handleLogout}
                        >
                          <LogOut size={16} /> Đăng xuất
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          <main ref={contentRef} className="clinical-content">
            <div>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
