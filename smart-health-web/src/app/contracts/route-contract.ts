export type RouteSurface = "public" | "auth" | "portal";

export type RouteState =
  | "loading"
  | "empty"
  | "partial"
  | "stale"
  | "offline"
  | "error"
  | "retry"
  | "permission_denied"
  | "destructive_confirmation"
  | "not_found"
  | "maintenance";

export type RouteNavigationPlacement =
  | "public"
  | "primary"
  | "footer"
  | "account";

export interface RouteNavigation {
  label: string;
  placement: RouteNavigationPlacement;
  order: number;
  icon: string;
  badge?: boolean;
  parentId?: string;
}

export interface RouteContract {
  id: string;
  path: string;
  surface: RouteSurface;
  title: string;
  requiredCapabilities: readonly string[];
  nav: RouteNavigation | null;
  stateCoverage: readonly RouteState[];
  smokeId: string;
}

const PUBLIC_STATES = ["loading", "error", "retry", "not_found"] as const;
const AUTH_STATES = ["loading", "offline", "error", "retry"] as const;
const PORTAL_STATES = [
  "loading",
  "empty",
  "partial",
  "stale",
  "offline",
  "error",
  "retry",
  "permission_denied",
] as const;
const PORTAL_MUTATION_STATES = [
  ...PORTAL_STATES,
  "destructive_confirmation",
] as const;

const DASHBOARD_CAPABILITIES = [
  "workspace.dashboard.view",
  "platform.dashboard.view",
  "personal.dashboard.view",
] as const;
const PATIENT_VIEW_CAPABILITIES = [
  "workspace.patients.view",
  "workspace.patients.manage",
  "platform.patients.view",
  "platform.patients.manage",
  "personal.profiles.manage",
] as const;
const PATIENT_MANAGE_CAPABILITIES = [
  "workspace.patients.manage",
  "platform.patients.manage",
] as const;
const APPOINTMENT_CAPABILITIES = [
  "workspace.appointments.view",
  "workspace.appointments.manage",
  "platform.appointments.view",
  "platform.appointments.manage",
  "personal.appointments.view",
  "personal.appointments.manage",
] as const;
const SCAN_CAPABILITIES = [
  "workspace.scans.view",
  "workspace.scans.manage",
  "platform.scans.view",
  "platform.scans.manage",
  "personal.scans.manage",
] as const;
const REVIEW_CAPABILITIES = [
  "workspace.review.view",
  "workspace.review.manage",
  "platform.review.view",
  "platform.review.manage",
] as const;
const ALERT_CAPABILITIES = [
  "workspace.alerts.view",
  "workspace.alerts.manage",
  "platform.alerts.view",
  "platform.alerts.manage",
] as const;
const DEVICE_CAPABILITIES = [
  "workspace.devices.view",
  "workspace.devices.manage",
  "platform.devices.view",
  "platform.devices.manage",
  "personal.devices.manage",
] as const;
const DEVICE_MANAGE_CAPABILITIES = [
  "workspace.devices.manage",
  "platform.devices.manage",
] as const;
const DEVICE_CLAIM_CAPABILITIES = [
  "workspace.devices.manage",
  "platform.devices.manage",
  "personal.devices.manage",
] as const;
const LIVE_CAPABILITIES = [
  "workspace.dashboard.view",
  "workspace.devices.view",
  "workspace.scans.view",
] as const;
const CONSENT_CAPABILITIES = [
  "platform.patients.manage",
  "workspace.patients.manage",
  "personal.sharing.manage",
] as const;

function defineRoute<const T extends RouteContract>(contract: T) {
  return contract;
}

function publicNav(
  label: string,
  order: number,
  icon: string,
  parentId?: string,
): RouteNavigation {
  return { label, placement: "public", order, icon, parentId };
}

function portalNav(
  label: string,
  placement: Exclude<RouteNavigationPlacement, "public">,
  order: number,
  icon: string,
  badge = false,
): RouteNavigation {
  return { label, placement, order, icon, ...(badge ? { badge: true } : {}) };
}

export const routeContracts = [
  defineRoute({
    id: "public.home",
    path: "/",
    surface: "public",
    title: "Shcare",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-home",
  }),
  defineRoute({
    id: "public.product",
    path: "/san-pham",
    surface: "public",
    title: "Sản phẩm",
    requiredCapabilities: [],
    nav: publicNav("Sản phẩm", 10, "device"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-product",
  }),
  defineRoute({
    id: "public.product.device",
    path: "/san-pham/ong-nghe-thong-minh",
    surface: "public",
    title: "Thiết bị Shcare",
    requiredCapabilities: [],
    nav: publicNav("Thiết bị Shcare", 11, "device", "public.product"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-product-device",
  }),
  defineRoute({
    id: "public.product.rpm",
    path: "/san-pham/theo-doi-tu-xa",
    surface: "public",
    title: "Theo dõi từ xa",
    requiredCapabilities: [],
    nav: publicNav("Theo dõi từ xa", 12, "activity", "public.product"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-product-rpm",
  }),
  defineRoute({
    id: "public.product.records",
    path: "/san-pham/ho-so-luot-do",
    surface: "public",
    title: "Hồ sơ lượt đo",
    requiredCapabilities: [],
    nav: publicNav("Hồ sơ lượt đo", 13, "records", "public.product"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-product-records",
  }),
  defineRoute({
    id: "public.solution.doctor",
    path: "/giai-phap/bac-si-ca-nhan",
    surface: "public",
    title: "Giải pháp cho bác sĩ",
    requiredCapabilities: [],
    nav: publicNav("Bác sĩ cá nhân", 21, "doctor", "public.solutions"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-solution-doctor",
  }),
  defineRoute({
    id: "public.solution.clinic",
    path: "/giai-phap/phong-kham",
    surface: "public",
    title: "Giải pháp cho phòng khám",
    requiredCapabilities: [],
    nav: publicNav("Phòng khám", 22, "clinic", "public.solutions"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-solution-clinic",
  }),
  defineRoute({
    id: "public.solution.patient",
    path: "/giai-phap/benh-nhan-tai-nha",
    surface: "public",
    title: "Giải pháp cho bệnh nhân",
    requiredCapabilities: [],
    nav: publicNav("Bệnh nhân tại nhà", 23, "patient", "public.solutions"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-solution-patient",
  }),
  defineRoute({
    id: "public.solutions",
    path: "/giai-phap",
    surface: "public",
    title: "Giải pháp",
    requiredCapabilities: [],
    nav: publicNav("Giải pháp", 20, "solutions"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-solutions",
  }),
  defineRoute({
    id: "public.pricing",
    path: "/bang-gia",
    surface: "public",
    title: "Bảng giá",
    requiredCapabilities: [],
    nav: publicNav("Bảng giá", 30, "pricing"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-pricing",
  }),
  defineRoute({
    id: "public.contact",
    path: "/lien-he",
    surface: "public",
    title: "Liên hệ",
    requiredCapabilities: [],
    nav: publicNav("Liên hệ", 60, "contact"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-contact",
  }),
  defineRoute({
    id: "public.resources",
    path: "/tai-nguyen",
    surface: "public",
    title: "Tài nguyên",
    requiredCapabilities: [],
    nav: publicNav("Tài nguyên", 50, "resources"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-resources",
  }),
  defineRoute({
    id: "public.resources.faq",
    path: "/tai-nguyen/faq",
    surface: "public",
    title: "Câu hỏi thường gặp",
    requiredCapabilities: [],
    nav: publicNav("Câu hỏi thường gặp", 51, "help", "public.resources"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-resources-faq",
  }),
  defineRoute({
    id: "public.resources.rpm",
    path: "/tai-nguyen/kien-thuc-rpm",
    surface: "public",
    title: "Kiến thức RPM",
    requiredCapabilities: [],
    nav: publicNav("Kiến thức RPM", 52, "resources", "public.resources"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-resources-rpm",
  }),
  defineRoute({
    id: "public.security-consent",
    path: "/bao-mat-consent",
    surface: "public",
    title: "Bảo mật và consent",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-security-consent",
  }),
  defineRoute({
    id: "public.security",
    path: "/bao-mat",
    surface: "public",
    title: "Bảo mật",
    requiredCapabilities: [],
    nav: publicNav("Bảo mật", 40, "security"),
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-security",
  }),
  defineRoute({
    id: "public.privacy",
    path: "/chinh-sach-bao-mat",
    surface: "public",
    title: "Chính sách bảo mật",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-privacy",
  }),
  defineRoute({
    id: "public.terms",
    path: "/dieu-khoan",
    surface: "public",
    title: "Điều khoản",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-terms",
  }),
  defineRoute({
    id: "public.legal",
    path: "/phap-ly",
    surface: "public",
    title: "Pháp lý",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: PUBLIC_STATES,
    smokeId: "public-legal",
  }),
  defineRoute({
    id: "public.not-found",
    path: "/404",
    surface: "public",
    title: "Không tìm thấy trang",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: ["not_found"],
    smokeId: "public-not-found",
  }),
  defineRoute({
    id: "public.maintenance",
    path: "/bao-tri",
    surface: "public",
    title: "Bảo trì",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: ["maintenance", "retry"],
    smokeId: "public-maintenance",
  }),

  defineRoute({
    id: "auth.login",
    path: "/login",
    surface: "auth",
    title: "Đăng nhập",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-login",
  }),
  defineRoute({
    id: "auth.register",
    path: "/register",
    surface: "auth",
    title: "Đăng ký bác sĩ",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-register",
  }),
  defineRoute({
    id: "auth.register.doctor",
    path: "/register/bac-si",
    surface: "auth",
    title: "Đăng ký bác sĩ",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-register-doctor",
  }),
  defineRoute({
    id: "auth.register.doctor-alias",
    path: "/register/doctor",
    surface: "auth",
    title: "Đăng ký bác sĩ",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-register-doctor-alias",
  }),
  defineRoute({
    id: "auth.register.clinic",
    path: "/register/phong-kham",
    surface: "auth",
    title: "Đăng ký phòng khám",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-register-clinic",
  }),
  defineRoute({
    id: "auth.register.clinic-alias",
    path: "/register/clinic",
    surface: "auth",
    title: "Đăng ký phòng khám",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-register-clinic-alias",
  }),
  defineRoute({
    id: "auth.forgot-password",
    path: "/quen-mat-khau",
    surface: "auth",
    title: "Quên mật khẩu",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-forgot-password",
  }),
  defineRoute({
    id: "auth.reset-password",
    path: "/dat-lai-mat-khau",
    surface: "auth",
    title: "Đặt lại mật khẩu",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-reset-password",
  }),
  defineRoute({
    id: "auth.verify-email",
    path: "/xac-nhan-email",
    surface: "auth",
    title: "Xác nhận email",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-verify-email",
  }),
  defineRoute({
    id: "auth.verify-email-alias",
    path: "/xac-thuc-email",
    surface: "auth",
    title: "Xác thực email",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-verify-email-alias",
  }),
  defineRoute({
    id: "auth.staff-invitation.accept",
    path: "/staff-invitations/accept",
    surface: "auth",
    title: "Chấp nhận lời mời nhân sự",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-staff-invitation-accept",
  }),
  defineRoute({
    id: "auth.approval.pending",
    path: "/cho-duyet",
    surface: "auth",
    title: "Đang chờ duyệt",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-approval-pending",
  }),
  defineRoute({
    id: "auth.approval.info",
    path: "/can-bo-sung",
    surface: "auth",
    title: "Cần bổ sung thông tin",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-approval-info",
  }),
  defineRoute({
    id: "auth.approval.rejected",
    path: "/bi-tu-choi",
    surface: "auth",
    title: "Yêu cầu bị từ chối",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-approval-rejected",
  }),
  defineRoute({
    id: "auth.approval.approved",
    path: "/da-duoc-duyet",
    surface: "auth",
    title: "Đã được duyệt",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: AUTH_STATES,
    smokeId: "auth-approval-approved",
  }),

  defineRoute({
    id: "portal.root",
    path: "/portal",
    surface: "portal",
    title: "Workspace",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-root",
  }),
  defineRoute({
    id: "portal.dashboard",
    path: "/portal/dashboard",
    surface: "portal",
    title: "Tổng quan",
    requiredCapabilities: DASHBOARD_CAPABILITIES,
    nav: portalNav("Tổng quan", "primary", 10, "home"),
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-dashboard",
  }),
  defineRoute({
    id: "portal.dashboard.overview",
    path: "/portal/dashboard/overview",
    surface: "portal",
    title: "Tổng quan workspace",
    requiredCapabilities: DASHBOARD_CAPABILITIES,
    nav: null,
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-dashboard-overview",
  }),
  defineRoute({
    id: "portal.dashboard.doctor",
    path: "/portal/dashboard/doctor",
    surface: "portal",
    title: "Tổng quan bác sĩ",
    requiredCapabilities: DASHBOARD_CAPABILITIES,
    nav: null,
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-dashboard-doctor",
  }),
  defineRoute({
    id: "portal.dashboard.clinic",
    path: "/portal/dashboard/clinic",
    surface: "portal",
    title: "Tổng quan phòng khám",
    requiredCapabilities: DASHBOARD_CAPABILITIES,
    nav: null,
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-dashboard-clinic",
  }),
  defineRoute({
    id: "portal.patients",
    path: "/portal/patients",
    surface: "portal",
    title: "Bệnh nhân",
    requiredCapabilities: PATIENT_VIEW_CAPABILITIES,
    nav: portalNav("Bệnh nhân", "primary", 20, "patients"),
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-patients",
  }),
  defineRoute({
    id: "portal.patients.import",
    path: "/portal/patients/import",
    surface: "portal",
    title: "Nhập bệnh nhân",
    requiredCapabilities: PATIENT_MANAGE_CAPABILITIES,
    nav: null,
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-patients-import",
  }),
  defineRoute({
    id: "portal.patients.detail",
    path: "/portal/patients/:id",
    surface: "portal",
    title: "Chi tiết bệnh nhân",
    requiredCapabilities: PATIENT_VIEW_CAPABILITIES,
    nav: null,
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-patient-detail",
  }),
  defineRoute({
    id: "portal.appointments",
    path: "/portal/appointments",
    surface: "portal",
    title: "Lịch hẹn",
    requiredCapabilities: APPOINTMENT_CAPABILITIES,
    nav: portalNav("Lịch hẹn", "primary", 30, "calendar"),
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-appointments",
  }),
  defineRoute({
    id: "portal.live",
    path: "/portal/live",
    surface: "portal",
    title: "Theo dõi trực tiếp",
    requiredCapabilities: LIVE_CAPABILITIES,
    nav: portalNav("Theo dõi trực tiếp", "primary", 40, "activity"),
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-live",
  }),
  defineRoute({
    id: "portal.records.review",
    path: "/portal/records/review",
    surface: "portal",
    title: "Hàng đợi duyệt",
    requiredCapabilities: REVIEW_CAPABILITIES,
    nav: null,
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-records-review",
  }),
  defineRoute({
    id: "portal.records.detail",
    path: "/portal/records/:id",
    surface: "portal",
    title: "Chi tiết lượt đo",
    requiredCapabilities: SCAN_CAPABILITIES,
    nav: null,
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-record-detail",
  }),
  defineRoute({
    id: "portal.records",
    path: "/portal/records",
    surface: "portal",
    title: "Lượt đo và hồ sơ",
    requiredCapabilities: SCAN_CAPABILITIES,
    nav: portalNav("Lượt đo & hồ sơ", "primary", 50, "records"),
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-records",
  }),
  defineRoute({
    id: "portal.devices",
    path: "/portal/devices",
    surface: "portal",
    title: "Thiết bị",
    requiredCapabilities: DEVICE_CAPABILITIES,
    nav: portalNav("Thiết bị", "primary", 60, "device"),
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-devices",
  }),
  defineRoute({
    id: "portal.devices.claim",
    path: "/portal/devices/claim",
    surface: "portal",
    title: "Ghép thiết bị",
    requiredCapabilities: DEVICE_CLAIM_CAPABILITIES,
    nav: null,
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-devices-claim",
  }),
  defineRoute({
    id: "portal.devices.assign",
    path: "/portal/devices/assign",
    surface: "portal",
    title: "Gán thiết bị",
    requiredCapabilities: DEVICE_MANAGE_CAPABILITIES,
    nav: null,
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-devices-assign",
  }),
  defineRoute({
    id: "portal.consent",
    path: "/portal/consent",
    surface: "portal",
    title: "Quyền truy cập dữ liệu",
    requiredCapabilities: CONSENT_CAPABILITIES,
    nav: portalNav("Quyền truy cập", "primary", 70, "consent"),
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-consent",
  }),
  defineRoute({
    id: "portal.staff",
    path: "/portal/staff",
    surface: "portal",
    title: "Nhân sự",
    requiredCapabilities: ["workspace.staff.manage", "platform.users.manage"],
    nav: portalNav("Bác sĩ / nhân sự", "primary", 80, "staff"),
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-staff",
  }),
  defineRoute({
    id: "portal.reports",
    path: "/portal/reports",
    surface: "portal",
    title: "Báo cáo",
    requiredCapabilities: ["workspace.reports.view", "platform.reports.view"],
    nav: portalNav("Báo cáo", "primary", 90, "reports"),
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-reports",
  }),
  defineRoute({
    id: "portal.settings",
    path: "/portal/settings",
    surface: "portal",
    title: "Cài đặt",
    requiredCapabilities: ["account.manage"],
    nav: portalNav("Cài đặt", "footer", 20, "settings"),
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-settings",
  }),
  defineRoute({
    id: "portal.workspace",
    path: "/portal/workspace",
    surface: "portal",
    title: "Workspace",
    requiredCapabilities: ["account.manage"],
    nav: portalNav("Chuyển workspace", "account", 10, "workspace"),
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-workspace",
  }),
  defineRoute({
    id: "portal.alerts",
    path: "/portal/alerts",
    surface: "portal",
    title: "Cảnh báo",
    requiredCapabilities: ALERT_CAPABILITIES,
    nav: portalNav("Cảnh báo", "primary", 100, "alert"),
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-alerts",
  }),
  defineRoute({
    id: "portal.notifications",
    path: "/portal/notifications",
    surface: "portal",
    title: "Thông báo",
    requiredCapabilities: ["notifications.view"],
    nav: portalNav("Thông báo", "primary", 110, "notification", true),
    stateCoverage: PORTAL_MUTATION_STATES,
    smokeId: "portal-notifications",
  }),
  defineRoute({
    id: "portal.billing",
    path: "/portal/billing",
    surface: "portal",
    title: "Gói dịch vụ",
    requiredCapabilities: ["billing.view", "billing.manage"],
    nav: portalNav("Gói dịch vụ", "primary", 85, "billing"),
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-billing",
  }),
  defineRoute({
    id: "portal.audit",
    path: "/portal/audit",
    surface: "portal",
    title: "Nhật ký audit",
    requiredCapabilities: ["workspace.audit.view", "platform.audit.view"],
    nav: portalNav("Nhật ký audit", "account", 20, "audit"),
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-audit",
  }),
  defineRoute({
    id: "portal.help",
    path: "/portal/help",
    surface: "portal",
    title: "Hỗ trợ",
    requiredCapabilities: [],
    nav: portalNav("Hỗ trợ", "footer", 30, "help"),
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-help",
  }),
  defineRoute({
    id: "portal.onboarding",
    path: "/portal/onboarding",
    surface: "portal",
    title: "Bắt đầu nhanh",
    requiredCapabilities: [],
    nav: portalNav("Bắt đầu nhanh", "footer", 10, "onboarding"),
    stateCoverage: PORTAL_STATES,
    smokeId: "portal-onboarding",
  }),
  defineRoute({
    id: "portal.permission-denied",
    path: "/portal/permission-denied",
    surface: "portal",
    title: "Không có quyền truy cập",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: ["permission_denied"],
    smokeId: "portal-permission-denied",
  }),

  defineRoute({
    id: "public.not-found.catch-all",
    path: "*",
    surface: "public",
    title: "Không tìm thấy trang",
    requiredCapabilities: [],
    nav: null,
    stateCoverage: ["not_found"],
    smokeId: "public-not-found-catch-all",
  }),
] as const;

export type RouteId = (typeof routeContracts)[number]["id"];
export type ShcareRouteContract = (typeof routeContracts)[number];

function normalizePathname(pathname: string) {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || "/";
  if (pathOnly === "/") return pathOnly;
  return pathOnly.replace(/\/+$/, "") || "/";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPath(contractPath: string, pathname: string) {
  if (contractPath === "*") return true;
  const expression = contractPath
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? "[^/]+" : escapeRegExp(segment),
    )
    .join("/");
  return new RegExp(`^${expression}$`).test(pathname);
}

function routeSpecificity(path: string) {
  if (path === "*") return -1;
  const segments = path.split("/").filter(Boolean);
  const staticSegments = segments.filter((segment) => !segment.startsWith(":"));
  return segments.length * 100 + staticSegments.length * 10 + path.length;
}

export function matchRouteContract(
  pathname: string,
): ShcareRouteContract | undefined {
  const normalizedPath = normalizePathname(pathname);
  return [...routeContracts]
    .sort(
      (left, right) =>
        routeSpecificity(right.path) - routeSpecificity(left.path),
    )
    .find((contract) => matchesPath(contract.path, normalizedPath));
}

export function canAccessRoute(
  capabilities: readonly string[],
  pathname: string,
) {
  const contract = matchRouteContract(pathname);
  if (!contract) return false;
  return (
    contract.requiredCapabilities.length === 0 ||
    contract.requiredCapabilities.some((capability) =>
      capabilities.includes(capability),
    )
  );
}

export function getNavigationContracts(
  capabilities: readonly string[],
  placement: RouteNavigationPlacement,
) {
  return routeContracts
    .filter(
      (contract) =>
        contract.nav?.placement === placement &&
        canAccessRoute(capabilities, contract.path),
    )
    .sort((left, right) => (left.nav?.order ?? 0) - (right.nav?.order ?? 0));
}

export function routePath(id: RouteId) {
  const contract = routeContracts.find((candidate) => candidate.id === id);
  if (!contract) throw new Error(`Unknown route contract: ${id}`);
  return contract.path;
}

export function routeChildPath(id: RouteId): string | undefined {
  const contract = routeContracts.find((candidate) => candidate.id === id);
  if (!contract) throw new Error(`Unknown route contract: ${id}`);
  if (contract.id === "public.home" || contract.id === "portal.root")
    return undefined;
  if (contract.path === "*") return "*";
  if (contract.surface === "portal")
    return contract.path.replace(/^\/portal\/?/, "");
  return contract.path.replace(/^\//, "");
}
