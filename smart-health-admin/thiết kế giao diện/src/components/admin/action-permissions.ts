export const WORKSPACE_MANAGE_CAPABILITIES = ["platform.workspaces.manage"] as const;

export const STAFF_MANAGE_CAPABILITIES = [
  "platform.users.manage",
  "workspace.staff.manage",
] as const;

export const PLATFORM_USER_MANAGE_CAPABILITIES = ["platform.users.manage"] as const;

export const PATIENT_MANAGE_CAPABILITIES = [
  "platform.patients.manage",
  "workspace.patients.manage",
  "personal.profiles.manage",
] as const;

export const DEVICE_MANAGE_CAPABILITIES = [
  "platform.devices.manage",
  "workspace.devices.manage",
  "personal.devices.manage",
] as const;

export const PACKAGE_MANAGE_CAPABILITIES = ["platform.packages.manage"] as const;

export const STORAGE_MANAGE_CAPABILITIES = [
  "platform.storage.manage",
  "workspace.storage.manage",
] as const;

export const REPORT_EXPORT_CAPABILITIES = [
  "platform.reports.view",
  "workspace.reports.view",
  "platform.storage.manage",
  "workspace.storage.manage",
  "billing.view",
] as const;

export const NOTIFICATION_MANAGE_CAPABILITIES = [
  "platform.settings.manage",
  "workspace.settings.manage",
] as const;

export const DOCTOR_REQUEST_MANAGE_CAPABILITIES = ["platform.doctorRequests.manage"] as const;
