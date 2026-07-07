export type SmartHealthWebSurface = "admin" | "portal";

const rawSurface =
  import.meta.env.VITE_SMART_HEALTH_WEB_SURFACE ||
  (import.meta.env.MODE === "portal" ? "portal" : "admin");

export const WEB_SURFACE: SmartHealthWebSurface = rawSurface === "portal" ? "portal" : "admin";
export const IS_PORTAL_SURFACE = WEB_SURFACE === "portal";
export const IS_ADMIN_SURFACE = WEB_SURFACE === "admin";

export const ADMIN_WEB_URL = (
  import.meta.env.VITE_SMART_HEALTH_ADMIN_WEB_URL || "https://shcare-admin.web.app"
).replace(/\/+$/, "");

export const PORTAL_WEB_URL = (
  import.meta.env.VITE_SMART_HEALTH_PORTAL_WEB_URL || "https://shcare.web.app"
).replace(/\/+$/, "");

export const WEB_SURFACE_TITLE = IS_PORTAL_SURFACE ? "Shcare Web Portal" : "Smart Health Admin";

export const WEB_SURFACE_DESCRIPTION = IS_PORTAL_SURFACE
  ? "Cổng vận hành dành cho bác sĩ và phòng khám/cơ sở y tế Smart Health"
  : "Platform Admin Console cho quản trị hệ thống Smart Health";

export function getSurfaceAccessTargetUrl() {
  return IS_PORTAL_SURFACE ? ADMIN_WEB_URL : PORTAL_WEB_URL;
}

export function hasPlatformSurfaceAccess(
  user?: {
    role?: string;
    capabilities?: string[];
    allowedSurfaces?: string[];
  } | null,
) {
  const capabilities = user?.capabilities || [];
  return (
    user?.allowedSurfaces?.includes("admin") ||
    user?.role === "admin" ||
    capabilities.some((capability) => capability.startsWith("platform."))
  );
}

export function hasPortalSurfaceAccess(
  user?: {
    role?: string;
    capabilities?: string[];
    allowedSurfaces?: string[];
  } | null,
) {
  if (!user) return false;
  if (user.allowedSurfaces?.includes("portal")) return true;
  if (hasPlatformSurfaceAccess(user)) return false;

  const capabilities = user.capabilities || [];
  return capabilities.some((capability) => capability.startsWith("workspace."));
}

export function hasCurrentWebSurfaceAccess(
  user?: {
    role?: string;
    capabilities?: string[];
    allowedSurfaces?: string[];
  } | null,
) {
  return IS_PORTAL_SURFACE ? hasPortalSurfaceAccess(user) : hasPlatformSurfaceAccess(user);
}

export function getWrongSurfaceMessage() {
  return IS_PORTAL_SURFACE
    ? "Tài khoản Platform Admin sử dụng Smart Health Admin Console."
    : "Tài khoản bác sĩ hoặc phòng khám sử dụng Shcare Web Portal.";
}
