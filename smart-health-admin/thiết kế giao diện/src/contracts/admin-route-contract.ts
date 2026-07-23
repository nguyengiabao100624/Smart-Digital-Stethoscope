export type AdminWebSurface = "admin" | "portal";

export type AdminRouteState =
  | "loading"
  | "empty"
  | "partial"
  | "stale"
  | "offline"
  | "error"
  | "retry"
  | "permission-denied"
  | "destructive-confirmation";

export const ADMIN_ROUTE_STATE_REQUIREMENTS = [
  "loading",
  "empty",
  "offline",
  "error",
  "retry",
  "permission-denied",
] as const satisfies readonly AdminRouteState[];

export type AdminRouteNavigation = Readonly<{
  label: string;
  order: number;
}>;

export type AdminRouteContract = Readonly<{
  id: `${AdminWebSurface}.${string}`;
  path: `/${string}` | "/";
  surface: AdminWebSurface;
  title: string;
  requiredCapabilities: readonly string[];
  nav: AdminRouteNavigation | null;
  /** Required acceptance states. Runtime coverage is proven separately by browser smoke results. */
  stateCoverage: readonly AdminRouteState[];
  smokeId: string;
}>;

const standardStateCoverage = [
  ...ADMIN_ROUTE_STATE_REQUIREMENTS,
  "partial",
  "stale",
] as const satisfies readonly AdminRouteState[];

const mutationStateCoverage = [
  ...standardStateCoverage,
  "destructive-confirmation",
] as const satisfies readonly AdminRouteState[];

function defineRoute<const Contract extends AdminRouteContract>(contract: Contract) {
  return contract;
}

export const adminRouteContracts = [
  defineRoute({
    id: "admin.overview",
    path: "/",
    surface: "admin",
    title: "Tổng quan",
    requiredCapabilities: ["platform.dashboard.view"],
    nav: { label: "Tổng quan", order: 10 },
    stateCoverage: standardStateCoverage,
    smokeId: "admin-overview",
  }),
  defineRoute({
    id: "admin.account",
    path: "/account",
    surface: "admin",
    title: "Thiết lập tài khoản",
    requiredCapabilities: ["account.manage"],
    nav: null,
    stateCoverage: standardStateCoverage,
    smokeId: "admin-account",
  }),
  defineRoute({
    id: "admin.devices",
    path: "/devices",
    surface: "admin",
    title: "Thiết bị",
    requiredCapabilities: ["platform.devices.view", "platform.devices.manage"],
    nav: { label: "Thiết bị", order: 60 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-devices",
  }),
  defineRoute({
    id: "admin.patients",
    path: "/patients",
    surface: "admin",
    title: "Bệnh nhân",
    requiredCapabilities: ["platform.patients.view", "platform.patients.manage"],
    nav: { label: "Bệnh nhân", order: 40 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-patients",
  }),
  defineRoute({
    id: "admin.doctors",
    path: "/doctors",
    surface: "admin",
    title: "Tài khoản bác sĩ",
    requiredCapabilities: ["platform.users.manage"],
    nav: { label: "Tài khoản bác sĩ", order: 50 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-doctors",
  }),
  defineRoute({
    id: "admin.doctor-approval",
    path: "/doctor-approval",
    surface: "admin",
    title: "Duyệt bác sĩ",
    requiredCapabilities: ["platform.doctorRequests.manage"],
    nav: { label: "Duyệt bác sĩ", order: 20 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-doctor-approval",
  }),
  defineRoute({
    id: "admin.ai-measurements",
    path: "/ai-measurements",
    surface: "admin",
    title: "Lượt đo và chất lượng tín hiệu",
    requiredCapabilities: ["platform.scans.view", "platform.scans.manage"],
    nav: { label: "Lượt đo & tín hiệu", order: 70 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-ai-measurements",
  }),
  defineRoute({
    id: "admin.clinics",
    path: "/clinics",
    surface: "admin",
    title: "Phòng khám",
    requiredCapabilities: ["platform.workspaces.manage"],
    nav: { label: "Phòng khám", order: 30 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-clinics",
  }),
  defineRoute({
    id: "admin.packages",
    path: "/packages",
    surface: "admin",
    title: "Gói dịch vụ",
    requiredCapabilities: ["platform.packages.manage"],
    nav: { label: "Gói dịch vụ", order: 100 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-packages",
  }),
  defineRoute({
    id: "admin.notifications",
    path: "/notifications",
    surface: "admin",
    title: "Thông báo",
    requiredCapabilities: ["notifications.view"],
    nav: { label: "Thông báo", order: 120 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-notifications",
  }),
  defineRoute({
    id: "admin.storage",
    path: "/storage",
    surface: "admin",
    title: "Lưu trữ nền tảng",
    requiredCapabilities: ["platform.storage.manage"],
    nav: { label: "Lưu trữ", order: 110 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-storage",
  }),
  defineRoute({
    id: "admin.settings",
    path: "/settings",
    surface: "admin",
    title: "Cấu hình hệ thống",
    requiredCapabilities: ["platform.settings.manage", "account.manage"],
    nav: { label: "Cấu hình hệ thống", order: 140 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-settings",
  }),
  defineRoute({
    id: "admin.admin-accounts",
    path: "/admin-accounts",
    surface: "admin",
    title: "Tài khoản admin",
    requiredCapabilities: ["platform.users.manage"],
    nav: { label: "Tài khoản admin", order: 90 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-admin-accounts",
  }),
  defineRoute({
    id: "admin.admin-actions",
    path: "/admin-actions",
    surface: "admin",
    title: "Hành động quản trị",
    requiredCapabilities: [
      "platform.workspaces.manage",
      "platform.users.manage",
      "platform.devices.manage",
      "platform.packages.manage",
      "platform.storage.manage",
      "platform.settings.manage",
    ],
    nav: { label: "Hành động quản trị", order: 80 },
    stateCoverage: mutationStateCoverage,
    smokeId: "admin-admin-actions",
  }),
  defineRoute({
    id: "admin.audit-log",
    path: "/audit-log",
    surface: "admin",
    title: "Audit toàn hệ thống",
    requiredCapabilities: ["platform.audit.view"],
    nav: { label: "Audit toàn hệ thống", order: 130 },
    stateCoverage: standardStateCoverage,
    smokeId: "admin-audit-log",
  }),
  defineRoute({
    id: "portal.overview",
    path: "/",
    surface: "portal",
    title: "Tổng quan workspace",
    requiredCapabilities: ["workspace.dashboard.view"],
    nav: { label: "Tổng quan", order: 10 },
    stateCoverage: standardStateCoverage,
    smokeId: "portal-overview",
  }),
  defineRoute({
    id: "portal.account",
    path: "/account",
    surface: "portal",
    title: "Thiết lập tài khoản",
    requiredCapabilities: ["account.manage"],
    nav: null,
    stateCoverage: standardStateCoverage,
    smokeId: "portal-account",
  }),
  defineRoute({
    id: "portal.patients",
    path: "/patients",
    surface: "portal",
    title: "Bệnh nhân",
    requiredCapabilities: ["workspace.patients.view", "workspace.patients.manage"],
    nav: { label: "Bệnh nhân", order: 20 },
    stateCoverage: mutationStateCoverage,
    smokeId: "portal-patients",
  }),
  defineRoute({
    id: "portal.ai-measurements",
    path: "/ai-measurements",
    surface: "portal",
    title: "Lượt đo và theo dõi",
    requiredCapabilities: ["workspace.scans.view", "workspace.scans.manage"],
    nav: { label: "Lượt đo & theo dõi", order: 30 },
    stateCoverage: mutationStateCoverage,
    smokeId: "portal-ai-measurements",
  }),
  defineRoute({
    id: "portal.devices",
    path: "/devices",
    surface: "portal",
    title: "Thiết bị",
    requiredCapabilities: ["workspace.devices.view", "workspace.devices.manage"],
    nav: { label: "Thiết bị", order: 40 },
    stateCoverage: mutationStateCoverage,
    smokeId: "portal-devices",
  }),
  defineRoute({
    id: "portal.doctors",
    path: "/doctors",
    surface: "portal",
    title: "Bác sĩ và nhân sự",
    requiredCapabilities: ["workspace.staff.manage"],
    nav: { label: "Bác sĩ/nhân sự", order: 50 },
    stateCoverage: mutationStateCoverage,
    smokeId: "portal-doctors",
  }),
  defineRoute({
    id: "portal.storage",
    path: "/storage",
    surface: "portal",
    title: "Hồ sơ và lưu trữ",
    requiredCapabilities: ["workspace.storage.manage", "workspace.scans.view"],
    nav: { label: "Hồ sơ & lưu trữ", order: 60 },
    stateCoverage: mutationStateCoverage,
    smokeId: "portal-storage",
  }),
  defineRoute({
    id: "portal.notifications",
    path: "/notifications",
    surface: "portal",
    title: "Thông báo",
    requiredCapabilities: ["notifications.view"],
    nav: { label: "Thông báo", order: 70 },
    stateCoverage: mutationStateCoverage,
    smokeId: "portal-notifications",
  }),
  defineRoute({
    id: "portal.audit-log",
    path: "/audit-log",
    surface: "portal",
    title: "Nhật ký vận hành",
    requiredCapabilities: ["workspace.audit.view"],
    nav: { label: "Nhật ký vận hành", order: 80 },
    stateCoverage: standardStateCoverage,
    smokeId: "portal-audit-log",
  }),
  defineRoute({
    id: "portal.settings",
    path: "/settings",
    surface: "portal",
    title: "Cài đặt workspace",
    requiredCapabilities: ["workspace.settings.manage", "account.manage"],
    nav: { label: "Cài đặt workspace", order: 90 },
    stateCoverage: mutationStateCoverage,
    smokeId: "portal-settings",
  }),
] as const satisfies readonly AdminRouteContract[];

export type AdminRouteContractId = (typeof adminRouteContracts)[number]["id"];
export type AdminNavigationRouteContract = Extract<
  (typeof adminRouteContracts)[number],
  { readonly nav: AdminRouteNavigation }
>;
export type AdminNavigationRouteContractId = AdminNavigationRouteContract["id"];

function pathMatches(contractPath: string, pathname: string) {
  if (contractPath === "/") return pathname === "/";
  return pathname === contractPath || pathname.startsWith(`${contractPath}/`);
}

export function findAdminRouteContract(surface: AdminWebSurface, pathname: string) {
  return [...adminRouteContracts]
    .filter((contract) => contract.surface === surface)
    .sort((left, right) => right.path.length - left.path.length)
    .find((contract) => pathMatches(contract.path, pathname));
}

export function getAdminNavigationContracts(
  surface: AdminWebSurface,
  capabilities: readonly string[],
  hasAllAccess = false,
) {
  const capabilitySet = new Set(capabilities);
  return [...adminRouteContracts]
    .filter(
      (contract): contract is AdminNavigationRouteContract =>
        contract.surface === surface && contract.nav !== null,
    )
    .filter(
      (contract) =>
        hasAllAccess ||
        contract.requiredCapabilities.some((capability) => capabilitySet.has(capability)),
    )
    .sort((left, right) => left.nav.order - right.nav.order);
}

export function getAdminSmokeContracts(surface: AdminWebSurface) {
  return adminRouteContracts.filter(
    (contract) => contract.surface === surface && contract.smokeId.length > 0,
  );
}
