import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Link, Outlet, useLocation, useNavigate } from "@/components/admin/router-shim";
import {
  LayoutDashboard,
  UserCheck,
  Building2,
  Stethoscope,
  Users,
  MonitorSpeaker,
  Activity,
  Package,
  Bell,
  FileText,
  Settings,
  Search,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  Menu,
  X,
  Database,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  clearSmartHealthStoredToken,
  smartHealthApi,
  type SmartHealthAuthUser,
  type SmartHealthDevice,
  type SmartHealthNotification,
} from "@/lib/smart-health-api";
import {
  hasFirebaseWebConfig,
  onFirebaseAuthStateChange,
  signOutFirebase,
} from "@/lib/firebase-client";
import {
  NotificationDetailDialog,
  type NotificationItem,
} from "./dialogs/NotificationDetailDialog";
import {
  dispatchNotificationSync,
  getNotificationTone,
  getNotificationTypeLabel,
  NOTIFICATION_SYNC_EVENT,
} from "@/lib/notification-events";
import { AdminAccessProvider } from "./AdminAccessContext";
import { ThemeToggle } from "./ThemeToggle";
import { userHasAnyCapability } from "./admin-access-context";
import {
  findAdminRouteContract,
  getAdminNavigationContracts,
  type AdminNavigationRouteContract,
  type AdminNavigationRouteContractId,
} from "@/contracts/admin-route-contract";
import {
  getSurfaceAccessTargetUrl,
  getWrongSurfaceMessage,
  hasCurrentWebSurfaceAccess,
  IS_ADMIN_SURFACE,
  IS_PORTAL_SURFACE,
  WEB_SURFACE,
  WEB_SURFACE_TITLE,
} from "@/lib/surface";
import { parseOverviewStatsResponse } from "@/lib/overview-operations";

const ROUTE_ICONS = {
  "admin.overview": LayoutDashboard,
  "admin.doctor-approval": UserCheck,
  "admin.clinics": Building2,
  "admin.patients": Users,
  "admin.doctors": Stethoscope,
  "admin.devices": MonitorSpeaker,
  "admin.ai-measurements": Activity,
  "admin.admin-actions": ShieldCheck,
  "admin.admin-accounts": UserCog,
  "admin.packages": Package,
  "admin.storage": Database,
  "admin.notifications": Bell,
  "admin.audit-log": FileText,
  "admin.settings": Settings,
  "portal.overview": LayoutDashboard,
  "portal.patients": Users,
  "portal.ai-measurements": Activity,
  "portal.devices": MonitorSpeaker,
  "portal.doctors": Stethoscope,
  "portal.storage": Database,
  "portal.notifications": Bell,
  "portal.audit-log": FileText,
  "portal.settings": Settings,
} satisfies Record<AdminNavigationRouteContractId, LucideIcon>;

function toMenuItem(contract: AdminNavigationRouteContract) {
  const icon = ROUTE_ICONS[contract.id];
  return {
    id: contract.id,
    path: contract.path,
    label: contract.nav.label,
    icon,
  };
}

type MenuItem = ReturnType<typeof toMenuItem>;

const formatBadgeCount = (count: number) => (count > 99 ? "99+" : String(count));

const workspaceTypeLabels: Record<string, string> = {
  hospital: "Bệnh viện",
  clinic: "Phòng khám",
  solo_practice: "Bác sĩ tư",
  personal: "Cá nhân/gia đình",
};

function AccessDeniedPanel({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Không có quyền truy cập</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Tài khoản hiện tại không có quyền mở màn hình này trong workspace đang chọn.
        </p>
        <button
          type="button"
          onClick={onNavigate}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Về màn hình được cấp quyền
        </button>
      </div>
    </div>
  );
}

function AccessCheckingPanel() {
  return (
    <div className="flex min-h-[55vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm font-medium text-foreground">Đang kiểm tra quyền truy cập</p>
        <p className="mt-1 text-xs text-muted-foreground">Vui lòng chờ trong giây lát.</p>
      </div>
    </div>
  );
}

function isDeviceAttentionEvent(device: SmartHealthDevice) {
  const status = String(device.status || "").toLowerCase();

  return (
    device.connected === false ||
    status.includes("offline") ||
    status.includes("mất") ||
    status.includes("disconnect") ||
    status.includes("error") ||
    status.includes("fail") ||
    status.includes("warning") ||
    status.includes("revoked")
  );
}

function formatNotificationTime(value?: string | null) {
  if (!value) return "Chưa có thời gian";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 2) return "Vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) return `${diffHours} giờ trước`;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function mapNotification(notification: SmartHealthNotification): NotificationItem {
  return {
    id: notification.id,
    title: notification.title || "Thông báo Smart Health",
    message: notification.message || "Backend chưa có nội dung chi tiết.",
    time: formatNotificationTime(notification.createdAt || notification.updatedAt),
    type: notification.type || "info",
    isRead: Boolean(notification.read),
    channel: notification.channel,
    campaignId: notification.campaignId,
    audienceType: notification.audienceType,
    audienceRole: notification.audienceRole,
    requestedChannels: notification.requestedChannels,
    inAppStatus: notification.inAppStatus,
    emailStatus: notification.emailStatus,
    organizationId: notification.organizationId,
    userId: notification.userId,
    deliveryStatus: notification.deliveryStatus,
    pushStatus: notification.pushStatus,
    sentAt: notification.sentAt,
    failedAt: notification.failedAt,
    pushSentAt: notification.pushSentAt,
    pushFailedAt: notification.pushFailedAt,
    readAt: notification.readAt,
    retryCount: notification.retryCount,
    metadata: notification.metadata,
  };
}

function getAccessMode(user: SmartHealthAuthUser | null) {
  const capabilities = user?.capabilities || [];
  const isPlatform =
    user?.role === "admin" || capabilities.some((capability) => capability.startsWith("platform."));
  if (isPlatform) {
    return {
      label: "Quản trị toàn hệ thống",
      shortLabel: "Platform admin",
      toneClass: "border-primary/20 bg-primary/10 text-primary",
    };
  }
  const role = user?.currentMembership?.role || user?.role || "";
  if (role === "workspace_admin" || role === "workspace_owner") {
    return {
      label: "Admin bệnh viện",
      shortLabel: "Workspace admin",
      toneClass: "border-success/20 bg-success/10 text-success",
    };
  }
  if (role === "doctor") {
    return {
      label: "Bác sĩ",
      shortLabel: "Doctor",
      toneClass: "border-primary/20 bg-primary/10 text-primary",
    };
  }
  return {
    label: "Tài khoản giới hạn",
    shortLabel: "Limited",
    toneClass: "border-border bg-muted text-muted-foreground",
  };
}

function hasAdminConsoleAccess(user?: SmartHealthAuthUser | null) {
  return hasCurrentWebSurfaceAccess(user);
}

function SurfaceAccessPanel({
  user,
  onSignOut,
}: {
  user: SmartHealthAuthUser | null;
  onSignOut: () => void;
}) {
  const targetUrl = getSurfaceAccessTargetUrl();
  const targetLabel = IS_PORTAL_SURFACE ? "Smart Health Admin" : "Shcare Web Portal";
  const currentLabel = IS_PORTAL_SURFACE ? "Shcare Web Portal" : "Smart Health Admin";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-warning/10 text-warning">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Tài khoản không thuộc cổng này</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {getWrongSurfaceMessage()} Bạn đang đăng nhập vào {currentLabel}
          {user?.email ? ` bằng ${user.email}` : ""}.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={targetUrl}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Mở {targetLabel}
          </a>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Đăng xuất tài khoản này
          </button>
        </div>
      </div>
    </div>
  );
}

type Variant = "rail" | "expanded";

function SidebarNav({
  variant,
  activePath,
  items,
  badges,
  onItemClick,
}: {
  variant: Variant;
  activePath: string;
  items: MenuItem[];
  badges?: Record<string, number>;
  onItemClick?: () => void;
}) {
  const isRail = variant === "rail";
  const shouldReduceMotion = useReducedMotion();
  return (
    <Tooltip.Provider delayDuration={200}>
      <nav className={`space-y-1 ${isRail ? "px-2" : "px-3"}`}>
        {items.map((item, idx) => {
          const isActive =
            activePath === item.path || (item.path !== "/" && activePath.startsWith(item.path));
          const badgeCount = badges?.[item.path] ?? 0;
          const linkInner = (
            <Link
              to={item.path}
              onClick={onItemClick}
              aria-label={isRail ? item.label : undefined}
              className={`relative flex min-w-0 items-center ${
                isRail ? "min-h-11 justify-center px-2 py-2.5" : "min-h-11 gap-3 px-3 py-2.5"
              } rounded-md font-medium transition-colors ${
                isActive
                  ? "text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId={`sidebar-active-${variant}`}
                  className="absolute inset-0 rounded-md bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <item.icon className="w-5 h-5 relative z-10 shrink-0" />
              {!isRail && (
                <span className="relative z-10 min-w-0 flex-1 truncate">{item.label}</span>
              )}
              {badgeCount > 0 && (
                <span
                  className={`z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground shadow-sm ring-2 ring-sidebar ${
                    isRail ? "absolute right-0 top-0" : "relative ml-auto"
                  }`}
                  aria-label={`${badgeCount} sự kiện cần xử lý`}
                >
                  {formatBadgeCount(badgeCount)}
                </span>
              )}
            </Link>
          );
          return (
            <motion.div
              key={item.path}
              initial={shouldReduceMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                shouldReduceMotion ? { duration: 0 } : { delay: idx * 0.03, duration: 0.25 }
              }
            >
              {isRail ? (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>{linkInner}</Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      sideOffset={8}
                      className="bg-popover text-popover-foreground border border-border px-2 py-1 rounded-md text-xs shadow-md z-50"
                    >
                      {item.label}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              ) : (
                linkInner
              )}
            </motion.div>
          );
        })}
      </nav>
    </Tooltip.Provider>
  );
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [topNotifications, setTopNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [sidebarBadges, setSidebarBadges] = useState<Record<string, number>>({});
  const [notificationDetail, setNotificationDetail] = useState<NotificationItem | null>(null);
  const [notificationDetailOpen, setNotificationDetailOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<SmartHealthAuthUser | null>(null);
  const [surfaceBlockedUser, setSurfaceBlockedUser] = useState<SmartHealthAuthUser | null>(null);
  const [accessCheckComplete, setAccessCheckComplete] = useState(false);
  const visibleMenuItems = useMemo(() => {
    if (!currentUser) return [];
    return getAdminNavigationContracts(
      WEB_SURFACE,
      currentUser.capabilities || [],
      currentUser.role === "admin",
    ).map(toMenuItem);
  }, [currentUser]);
  const activeAccessRule = useMemo(
    () => findAdminRouteContract(WEB_SURFACE, location.pathname),
    [location.pathname],
  );
  const isRouteAllowed = useMemo(() => {
    if (!activeAccessRule) return false;
    if (!currentUser) return false;
    return userHasAnyCapability(currentUser, activeAccessRule.requiredCapabilities);
  }, [activeAccessRule, currentUser]);
  const firstAllowedPath = visibleMenuItems[0]?.path || "/";

  const refreshEventBadges = useCallback(async () => {
    const [notificationsResult, overviewResult, devicesResult] = await Promise.allSettled([
      smartHealthApi.listNotifications(),
      smartHealthApi.getOverviewStats({
        range: "today",
        timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
      }),
      smartHealthApi.listDevices(),
    ]);

    const nextBadges: Record<string, number> = {};

    if (notificationsResult.status === "fulfilled") {
      const mapped = notificationsResult.value.notifications.map(mapNotification);
      const unreadCount = mapped.filter((item) => !item.isRead).length;
      setTopNotifications(mapped.slice(0, 5));
      setUnreadNotificationCount(unreadCount);
      nextBadges["/notifications"] = unreadCount;
    }

    if (overviewResult.status === "fulfilled") {
      try {
        const overview = parseOverviewStatsResponse(overviewResult.value, "today");
        nextBadges["/doctor-approval"] = overview.stats.pendingDoctors || 0;
        nextBadges["/ai-measurements"] = overview.stats.aiJobsFailed || 0;
      } catch {
        // A malformed summary must not turn into a synthetic zero badge.
      }
    }

    if (devicesResult.status === "fulfilled") {
      nextBadges["/devices"] = devicesResult.value.devices.filter(isDeviceAttentionEvent).length;
    }

    setSidebarBadges((prev) => ({
      ...prev,
      ...nextBadges,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const finishAsSignedOut = () => {
      clearSmartHealthStoredToken();
      setCurrentUser(null);
      setSurfaceBlockedUser(null);
      setTopNotifications([]);
      setUnreadNotificationCount(0);
      setSidebarBadges({});
      setAccessCheckComplete(true);
      navigate("/login");
    };

    const applyBackendUser = (user?: SmartHealthAuthUser | null) => {
      if (!user || !hasAdminConsoleAccess(user)) {
        if (user) {
          setCurrentUser(null);
          setSurfaceBlockedUser(user);
          setTopNotifications([]);
          setUnreadNotificationCount(0);
          setSidebarBadges({});
          setAccessCheckComplete(true);
        } else {
          finishAsSignedOut();
        }
        return;
      }
      setCurrentUser(user);
      setSurfaceBlockedUser(null);
      setAccessCheckComplete(true);
    };

    setAccessCheckComplete(false);

    if (hasFirebaseWebConfig()) {
      const unsubscribe = onFirebaseAuthStateChange(async (firebaseUser) => {
        if (cancelled) return;
        setAccessCheckComplete(false);

        if (!firebaseUser) {
          finishAsSignedOut();
          return;
        }

        try {
          const idToken = await firebaseUser.getIdToken();
          const result = await smartHealthApi.authenticateFirebase(idToken);
          if (!cancelled) {
            applyBackendUser(result.user);
          }
        } catch {
          if (!cancelled) {
            finishAsSignedOut();
          }
        }
      });

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    smartHealthApi
      .me()
      .then(({ user }) => {
        if (!cancelled) {
          applyBackendUser(user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          finishAsSignedOut();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!accessCheckComplete || !currentUser) {
      return;
    }
    refreshEventBadges().catch(() => undefined);
  }, [accessCheckComplete, currentUser, refreshEventBadges]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    const handleNotificationSync = () => {
      refreshEventBadges().catch(() => undefined);
    };
    window.addEventListener(NOTIFICATION_SYNC_EVENT, handleNotificationSync);
    const intervalId = window.setInterval(handleNotificationSync, 15000);

    return () => {
      window.removeEventListener(NOTIFICATION_SYNC_EVENT, handleNotificationSync);
      window.clearInterval(intervalId);
    };
  }, [currentUser, refreshEventBadges]);

  const adminName = currentUser?.name?.trim() || "Quản trị hệ thống";
  const adminEmail = currentUser?.email?.trim() || "";
  const adminInitial = (adminName || adminEmail || "Q").trim().charAt(0).toUpperCase();
  const capabilities = currentUser?.capabilities || [];
  const isPlatformAdmin =
    currentUser?.role === "admin" ||
    capabilities.some((capability) => capability.startsWith("platform."));
  const workspaceName = isPlatformAdmin
    ? "Toàn hệ thống"
    : currentUser?.workspace?.name ||
      currentUser?.currentMembership?.workspaceName ||
      currentUser?.hospital ||
      "Smart Health";
  const workspaceType =
    currentUser?.workspace?.workspaceType ||
    currentUser?.workspace?.type ||
    currentUser?.currentMembership?.workspaceType ||
    "";
  const portalMode = !currentUser
    ? WEB_SURFACE_TITLE
    : isPlatformAdmin
      ? "Platform Admin Console"
      : "Shcare Web Portal";
  const workspaceLabel = isPlatformAdmin
    ? "Nền tảng"
    : workspaceTypeLabels[workspaceType] || portalMode;
  const accessMode = getAccessMode(currentUser);
  const sidebarAccessLabel = isPlatformAdmin ? "Quản trị hệ thống" : accessMode.label;
  const brandLabel = IS_PORTAL_SURFACE ? "Shcare Portal" : "Smart Health";
  const searchPlaceholder = IS_PORTAL_SURFACE
    ? "Tìm bệnh nhân, thiết bị, lượt đo, bác sĩ..."
    : "Tìm workspace, tài khoản, thiết bị, UID...";

  const handleLogout = useCallback(async () => {
    setAccessCheckComplete(false);
    try {
      await smartHealthApi.logout();
    } catch {
      clearSmartHealthStoredToken();
    }

    if (hasFirebaseWebConfig()) {
      try {
        await signOutFirebase();
      } catch {
        // Backend token cleanup above is still enough to leave the admin shell.
      }
    }

    setCurrentUser(null);
    setSurfaceBlockedUser(null);
    setTopNotifications([]);
    setUnreadNotificationCount(0);
    setSidebarBadges({});
    setAccessCheckComplete(true);
    navigate("/login");
  }, [navigate]);

  const openTopNotification = (item: NotificationItem) => {
    setNotificationDetail(item);
    setNotificationDetailOpen(true);
    if (!item.isRead) {
      setTopNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      );
      setUnreadNotificationCount((count) => Math.max(0, count - 1));
      setSidebarBadges((prev) => ({
        ...prev,
        "/notifications": Math.max(0, (prev["/notifications"] || 0) - 1),
      }));
      smartHealthApi
        .markNotificationRead(String(item.id))
        .then(() => dispatchNotificationSync())
        .catch(() => undefined);
    }
  };

  // Auto close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
    setMobileSearchOpen(false);
  }, [location.pathname]);

  const handleBlockedSignOut = async () => {
    clearSmartHealthStoredToken();
    try {
      await smartHealthApi.logout();
    } catch {
      // The user may only have a Firebase session on this origin.
    }
    if (hasFirebaseWebConfig()) {
      try {
        await signOutFirebase();
      } catch {
        // Local token cleanup is enough for this surface.
      }
    }
    setSurfaceBlockedUser(null);
    setCurrentUser(null);
    setAccessCheckComplete(true);
    navigate("/login");
  };

  if (!currentUser) {
    return (
      <AdminAccessProvider currentUser={currentUser} accessCheckComplete={accessCheckComplete}>
        {surfaceBlockedUser ? (
          <SurfaceAccessPanel user={surfaceBlockedUser} onSignOut={handleBlockedSignOut} />
        ) : (
          <div className="min-h-screen bg-background text-sm">
            <AccessCheckingPanel />
          </div>
        )}
      </AdminAccessProvider>
    );
  }

  return (
    <AdminAccessProvider currentUser={currentUser} accessCheckComplete={accessCheckComplete}>
      <div className="min-h-screen bg-background flex text-sm">
        {/* Desktop sidebar (>= lg) */}
        <aside className="hidden lg:flex w-64 bg-sidebar border-r border-sidebar-border flex-col fixed inset-y-0 left-0 z-20">
          <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3 text-primary font-bold text-lg">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Stethoscope className="w-5 h-5" />
              </span>
              <span>{brandLabel}</span>
            </div>
          </div>
          <div className="flex-1 py-4 overflow-y-auto">
            <SidebarNav
              variant="expanded"
              activePath={location.pathname}
              items={visibleMenuItems}
              badges={sidebarBadges}
            />
          </div>
          <div className="border-t border-sidebar-border p-4">
            <div
              className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${accessMode.toneClass}`}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{sidebarAccessLabel}</span>
            </div>
            {!isPlatformAdmin && (
              <div className="mt-2 text-xs leading-5 text-sidebar-foreground/70">
                <div className="truncate font-medium text-sidebar-foreground">{workspaceName}</div>
                <div className="truncate">{workspaceLabel}</div>
              </div>
            )}
          </div>
        </aside>

        {/* Tablet sidebar rail (md → lg) */}
        <aside className="hidden md:flex lg:hidden w-16 bg-sidebar border-r border-sidebar-border flex-col fixed inset-y-0 left-0 z-20">
          <div className="h-16 flex items-center justify-center border-b border-sidebar-border">
            <Stethoscope className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 py-4 overflow-y-auto">
            <SidebarNav
              variant="rail"
              activePath={location.pathname}
              items={visibleMenuItems}
              badges={sidebarBadges}
            />
          </div>
        </aside>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setMobileOpen(false)}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden"
              />
              <motion.aside
                key="drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
                className="fixed inset-y-0 left-0 z-40 w-64 max-w-[80vw] bg-sidebar border-r border-sidebar-border flex flex-col md:hidden"
              >
                <div className="h-16 flex items-center justify-between px-5 border-b border-sidebar-border">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <Stethoscope className="w-6 h-6" />
                    <span>{brandLabel}</span>
                  </div>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
                    aria-label="Đóng menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 py-4 overflow-y-auto">
                  <SidebarNav
                    variant="expanded"
                    activePath={location.pathname}
                    items={visibleMenuItems}
                    badges={sidebarBadges}
                    onItemClick={() => setMobileOpen(false)}
                  />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="flex-1 md:ml-16 lg:ml-64 flex flex-col min-h-screen min-w-0">
          {/* Topbar */}
          <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 lg:px-8 sticky top-0 z-10 gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Hamburger – mobile only */}
              <button
                onClick={() => setMobileOpen(true)}
                className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                aria-label="Mở menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Desktop / tablet search */}
              <div className="hidden md:flex items-center w-full max-w-md lg:max-w-lg relative">
                <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
                <input
                  id="admin-global-search"
                  name="admin-global-search"
                  type="text"
                  placeholder={searchPlaceholder}
                  className="min-h-11 w-full rounded-md border-transparent bg-input-background py-2 pl-9 pr-4 text-sm outline-none transition-all focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>

              {/* Mobile search icon */}
              <button
                onClick={() => setMobileSearchOpen((v) => !v)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                aria-label="Tìm kiếm"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 md:gap-4 lg:gap-6 shrink-0">
              <div className="hidden sm:flex min-w-0 max-w-[260px] flex-col items-end text-right text-sm">
                <div
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${accessMode.toneClass}`}
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{accessMode.label}</span>
                </div>
                <div className="mt-1 max-w-56 truncate text-xs text-muted-foreground">
                  {workspaceLabel}: {workspaceName}
                </div>
              </div>

              <ThemeToggle />

              <Popover.Root>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Mở thông báo"
                    className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold leading-none text-destructive-foreground shadow-sm ring-2 ring-card">
                        {formatBadgeCount(unreadNotificationCount)}
                      </span>
                    )}
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    className="bg-popover border border-border rounded-lg shadow-xl w-[calc(100vw-2rem)] max-w-sm md:w-96 z-50"
                    sideOffset={8}
                    align="end"
                    collisionPadding={16}
                  >
                    <div className="p-4 border-b border-border flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-sm">Thông báo</h3>
                        {unreadNotificationCount > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {unreadNotificationCount} thông báo chưa đọc
                          </p>
                        )}
                      </div>
                      <Link to="/notifications" className="text-xs text-primary hover:underline">
                        Xem tất cả
                      </Link>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto">
                      {topNotifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                          Chưa có thông báo mới.
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {topNotifications.map((item) => {
                            const tone = getNotificationTone(item.type);
                            const Icon =
                              tone === "warning" || tone === "error"
                                ? AlertTriangle
                                : tone === "success"
                                  ? CheckCircle2
                                  : Info;
                            const toneClass =
                              tone === "warning"
                                ? "bg-warning/10 text-warning"
                                : tone === "error"
                                  ? "bg-destructive/10 text-destructive"
                                  : tone === "success"
                                    ? "bg-success/10 text-success"
                                    : "bg-primary/10 text-primary";
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => openTopNotification(item)}
                                className={`block w-full p-4 text-left transition-colors hover:bg-muted/30 ${!item.isRead ? "bg-primary/5" : ""}`}
                              >
                                <div className="flex gap-3">
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${toneClass}`}
                                  >
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground leading-snug">
                                      {item.title}
                                    </p>
                                    <div className="mt-1">
                                      <span className="inline-flex rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                        {getNotificationTypeLabel(item.type)}
                                      </span>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                      {item.message}
                                    </p>
                                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                                      <Clock className="w-3 h-3" />
                                      <span>{item.time}</span>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="p-3 border-t border-border text-center">
                      <Link
                        to="/notifications"
                        className="text-sm text-primary hover:underline font-medium"
                      >
                        Xem tất cả thông báo
                      </Link>
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>

              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Mở menu tài khoản"
                    className="flex min-h-11 min-w-11 items-center gap-2 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-sm font-semibold text-primary">
                      {adminInitial}
                    </span>
                    <div className="text-left hidden lg:block">
                      <div className="text-sm font-medium leading-none mb-1">{adminName}</div>
                      <div className="text-xs text-muted-foreground">
                        {adminEmail || "Chưa có email"}
                      </div>
                    </div>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="min-w-[200px] bg-popover text-popover-foreground rounded-md shadow-lg border border-border p-1 z-50"
                    sideOffset={5}
                    align="end"
                    collisionPadding={16}
                  >
                    <div className="px-3 py-2">
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${accessMode.toneClass}`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {accessMode.label}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {workspaceLabel}: {workspaceName}
                      </div>
                    </div>
                    <DropdownMenu.Separator className="h-px bg-border my-1" />
                    <DropdownMenu.Item
                      className="text-sm px-3 py-2 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2"
                      onClick={() => navigate("/account")}
                    >
                      <Settings className="w-4 h-4" /> Cài đặt tài khoản
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="h-px bg-border my-1" />
                    <DropdownMenu.Item
                      className="text-sm px-3 py-2 cursor-pointer outline-none hover:bg-destructive hover:text-destructive-foreground text-destructive rounded-sm flex items-center gap-2"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-4 h-4" /> Đăng xuất
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </header>

          {/* Mobile search expandable */}
          <AnimatePresence>
            {mobileSearchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="md:hidden border-b border-border bg-card overflow-hidden"
              >
                <div className="p-3 relative">
                  <Search className="w-4 h-4 absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="admin-mobile-search"
                    name="admin-mobile-search"
                    autoFocus
                    type="text"
                    placeholder="Tìm kiếm..."
                    className="min-h-11 w-full rounded-md bg-input-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Page Content */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }
                }
              >
                {!accessCheckComplete ? (
                  <AccessCheckingPanel />
                ) : isRouteAllowed ? (
                  <Outlet />
                ) : (
                  <AccessDeniedPanel onNavigate={() => navigate(firstAllowedPath)} />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <NotificationDetailDialog
          notification={notificationDetail}
          open={notificationDetailOpen}
          onOpenChange={setNotificationDetailOpen}
        />
      </div>
    </AdminAccessProvider>
  );
}
