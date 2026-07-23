import { type CSSProperties, useEffect, useRef, useState } from "react";
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
  CreditCard,
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
import logoUrl from "../../../../packages/shcare-brand/assets/shcare-symbol.svg";
import { smartHealthApi } from "../../lib/smart-health-api";
import { useAuth, type AuthUser } from "../context/AuthContext";
import {
  canAccessRoute,
  getNavigationContracts,
  matchRouteContract,
  routePath,
  type RouteNavigationPlacement,
} from "../contracts/route-contract";

const routeIcons = {
  activity: Activity,
  alert: AlertTriangle,
  audit: Shield,
  billing: CreditCard,
  calendar: CalendarDays,
  consent: Mail,
  device: Stethoscope,
  help: HelpCircle,
  home: Home,
  notification: Bell,
  onboarding: Zap,
  patients: Users,
  records: FileText,
  reports: BarChart2,
  settings: Settings,
  staff: Building2,
  workspace: Building2,
} as const;

function isActive(pathname: string, target: string) {
  return (
    pathname === target ||
    (target !== "/portal/dashboard" && pathname.startsWith(`${target}/`))
  );
}

function pageTitle(pathname: string) {
  return matchRouteContract(pathname)?.title ?? "Workspace";
}

function navigationForCapabilities(
  capabilities: readonly string[],
  placement: Exclude<RouteNavigationPlacement, "public">,
) {
  return getNavigationContracts(capabilities, placement).map((contract) => {
    const nav = contract.nav;
    if (!nav)
      throw new Error(`Route ${contract.id} is missing navigation metadata`);
    const Icon = routeIcons[nav.icon as keyof typeof routeIcons] ?? Shield;
    return {
      to: contract.path,
      icon: Icon,
      label: nav.label,
      badge: nav.badge,
    };
  });
}

function portalRoleLabel(user: AuthUser | null, isClinic: boolean) {
  if (user?.role === "billing") return "Billing";
  if (user?.role === "technician") return "Kỹ thuật viên";
  if (user?.role === "viewer") return "Người xem";
  return isClinic ? "Quản lý cơ sở" : "Bác sĩ";
}

function canAccessPortalRoute(user: AuthUser, pathname: string) {
  return canAccessRoute(user.capabilities, pathname);
}

const popoverBackdropStyle = {
  backdropFilter: "blur(18px) saturate(140%)",
  WebkitBackdropFilter: "blur(18px) saturate(140%)",
} satisfies CSSProperties;

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
  const canViewNotifications = Boolean(
    user &&
      canAccessRoute(
        user.capabilities,
        routePath("portal.notifications"),
      ),
  );
  const canManageAccount = Boolean(
    user &&
      canAccessRoute(user.capabilities, routePath("portal.settings")),
  );
  const canSwitchWorkspace = Boolean(
    user &&
      canAccessRoute(user.capabilities, routePath("portal.workspace")),
  );

  const notificationsQuery = useQuery({
    queryKey: ["portal", "notifications", user?.currentWorkspace.id],
    queryFn: smartHealthApi.listNotifications,
    enabled: Boolean(user && canViewNotifications),
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

  if (
    location.pathname !== "/portal/permission-denied" &&
    !canAccessPortalRoute(user, location.pathname)
  ) {
    return <Navigate to="/portal/permission-denied" replace />;
  }

  const isClinic =
    ["workspace_admin", "workspace_owner"].includes(user.role) ||
    user.capabilities.includes("workspace.staff.manage");
  const navigation = navigationForCapabilities(user.capabilities, "primary");
  const footerNavigation = navigationForCapabilities(
    user.capabilities,
    "footer",
  );
  const notifications = notificationsQuery.data?.notifications || [];
  const unread = notifications.filter(
    (notification) => !notification.read,
  ).length;
  const recentNotifications = notifications.slice(0, 4);
  const workspaceName = user.currentWorkspace.name;
  const roleLabel = portalRoleLabel(user, isClinic);
  const title = pageTitle(location.pathname);
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
              aria-label="Về Shcare — Smart Health Care"
            >
              <img src={logoUrl} alt="" />
              <span className="truncate">Shcare</span>
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

          {canSwitchWorkspace ? (
            <Link
              to={routePath("portal.workspace")}
              className="clinical-workspace-link"
            >
              <span className="clinical-workspace-avatar" aria-hidden="true">
                {workspaceName.charAt(0).toUpperCase()}
              </span>
              <span className="clinical-workspace-copy">
                <strong>{workspaceName}</strong>
                <span>{roleLabel}</span>
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </Link>
          ) : (
            <div
              className="clinical-workspace-link cursor-default"
              aria-label={`${workspaceName}, ${roleLabel}`}
            >
              <span className="clinical-workspace-avatar" aria-hidden="true">
                {workspaceName.charAt(0).toUpperCase()}
              </span>
              <span className="clinical-workspace-copy">
                <strong>{workspaceName}</strong>
                <span>{roleLabel}</span>
              </span>
            </div>
          )}

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
            {footerNavigation.map(({ to, icon: Icon, label }) => {
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
                role="status"
                aria-live="polite"
                title={backendStatusTitle}
                aria-label={backendStatusTitle}
              >
                <span className="clinical-backend-dot" aria-hidden="true" />
                <span>{backendStatusLabel}</span>
              </div>

              {canViewNotifications ? (
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
                      style={popoverBackdropStyle}
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
                            to={routePath("portal.notifications")}
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
                        to={routePath("portal.notifications")}
                      >
                        Xem tất cả thông báo
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              ) : null}

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
                      style={popoverBackdropStyle}
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
                        {canManageAccount ? (
                          <Link
                            className="clinical-popover-link"
                            to={routePath("portal.settings")}
                          >
                            <Fingerprint size={16} /> Hồ sơ & bảo mật
                          </Link>
                        ) : null}
                        {canAccessRoute(
                          user.capabilities,
                          routePath("portal.audit"),
                        ) ? (
                          <Link
                            className="clinical-popover-link"
                            to={routePath("portal.audit")}
                          >
                            <Shield size={16} /> Nhật ký audit
                          </Link>
                        ) : null}
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
