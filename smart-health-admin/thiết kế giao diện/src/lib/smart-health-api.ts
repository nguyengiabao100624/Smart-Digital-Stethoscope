import { toVietnameseErrorMessage } from "./error-messages";
import { WEB_SURFACE, IS_PORTAL_SURFACE } from "./surface";
import type { ShcareDeviceSetupQrPayload } from "./device-provisioning";
import type { PasswordChangeInput, PasswordChangeReceipt } from "./password-change";
import {
  assertAuthSessionRevokeIntent,
  parseAuthSessionRevokeReceipt,
  type AuthSessionRevokeIntent,
} from "./auth-session-revoke";

type QueryValue = string | number | boolean | null | undefined;

export type SmartHealthApiError = Error & {
  status?: number;
  payload?: unknown;
  code?: string;
  requestId?: string;
  fieldErrors?: Record<string, string>;
};

export function parsePasswordChangeReceipt(payload: unknown): PasswordChangeReceipt {
  const receipt =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const user =
    receipt?.user && typeof receipt.user === "object" && !Array.isArray(receipt.user)
      ? (receipt.user as Record<string, unknown>)
      : null;
  const rootKeys = receipt ? Object.keys(receipt).sort() : [];
  const userKeys = user ? Object.keys(user).sort() : [];
  const valid =
    receipt !== null &&
    rootKeys.length === 5 &&
    rootKeys.join("|") === "ok|operationId|provider|replayed|user" &&
    receipt.ok === true &&
    (receipt.provider === "firebase" || receipt.provider === "demo") &&
    typeof receipt.operationId === "string" &&
    receipt.operationId.length > 0 &&
    receipt.operationId.length <= 160 &&
    receipt.operationId === receipt.operationId.trim() &&
    typeof receipt.replayed === "boolean" &&
    user !== null &&
    userKeys.length === 1 &&
    userKeys[0] === "id" &&
    typeof user.id === "string" &&
    user.id.length > 0 &&
    user.id.length <= 120 &&
    user.id === user.id.trim();

  if (!valid) {
    const error = new Error(
      "Backend trả về biên nhận đổi mật khẩu không đúng contract.",
    ) as SmartHealthApiError;
    error.status = 502;
    error.code = "PASSWORD_CHANGE_RESPONSE_INVALID";
    error.payload = payload;
    throw error;
  }

  return receipt as PasswordChangeReceipt;
}

export type SmartHealthMembership = {
  id?: string;
  workspaceId?: string;
  organizationId?: string;
  workspaceName?: string;
  workspaceType?: string;
  role?: string;
  legacyRole?: string;
  createdAt?: string;
};

export type SmartHealthWorkspaceSummary = {
  id: string;
  name?: string;
  type?: string;
  workspaceType?: string;
  packageId?: string;
  subscriptionStatus?: string;
  billingCycle?: string;
};

export type SmartHealthAuthUser = {
  id: string;
  role?: "admin" | "doctor" | "patient" | string;
  accountStatus?: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  license?: string;
  hospital?: string;
  department?: string;
  address?: string;
  accountType?: string;
  workspaceType?: string;
  avatarFileId?: string;
  avatarUrl?: string;
  twoFactorEnabled?: boolean;
  twoFactorMethod?: string;
  notificationPreferences?: {
    doctorRequests?: boolean;
    abnormalResults?: boolean;
    deviceOffline?: boolean;
    newLogin?: boolean;
  };
  organizationId?: string;
  workspaceId?: string;
  currentWorkspaceId?: string;
  currentMembership?: SmartHealthMembership | null;
  memberships?: SmartHealthMembership[];
  workspace?: SmartHealthWorkspaceSummary | null;
  currentWorkspace?: SmartHealthWorkspaceSummary | null;
  capabilities?: string[];
  allowedSurfaces?: string[];
  defaultSurface?: string;
  firebaseUid?: string;
  verifiedEmail?: boolean;
  verifiedPhone?: boolean;
  roleRequestStatus?: string;
  requestedRole?: string;
  /** Workspace selected when the doctor role request was submitted. */
  roleRequestOrganizationId?: string;
  roleRequestedAt?: string;
  roleApprovedAt?: string;
  roleRejectedAt?: string;
  roleRejectReason?: string;
  roleInfoRequestAt?: string;
  roleInfoRequestMessage?: string;
  roleInfoRequiredFields?: string[];
  registrationReason?: string;
  clinicName?: string;
  clinicSuggestion?: string;
  specialty?: string;
  status?: string;
  requestedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
  createdAt?: string;
  updatedAt?: string;
  patientsCount?: number | null;
  measurementsCount?: number | null;
};

export type SmartHealthTwoFactorStatus = {
  availability: {
    available: boolean;
    status: string;
    methods: string[];
    reason?: string;
  };
  twoFactor: {
    enabled: boolean;
    method?: string;
    enrollmentPending: boolean;
  };
};

export type SmartHealthNotificationPreferenceKey =
  | "enabled"
  | "doctorRequests"
  | "abnormalResults"
  | "deviceOffline"
  | "appointments"
  | "messages"
  | "aiUpdates"
  | "newLogin";

export type SmartHealthNotificationPreferences = Record<
  SmartHealthNotificationPreferenceKey,
  boolean
>;

export type SmartHealthNotificationPreferenceChannelAvailability = {
  available: boolean;
  status: "ready" | "disabled" | "unavailable";
  reasonCode: string;
};

export type SmartHealthNotificationPreferencesResponse = {
  userId: string;
  workspaceId: string | null;
  ownership: {
    kind: "self";
    userId: string;
  };
  preferences: SmartHealthNotificationPreferences;
  channels: {
    inApp: SmartHealthNotificationPreferenceChannelAvailability;
    email: SmartHealthNotificationPreferenceChannelAvailability;
    push: SmartHealthNotificationPreferenceChannelAvailability;
  };
  updatedAt: string;
  replayed: boolean;
};

export type SmartHealthStaffRole =
  | "workspace_admin"
  | "doctor"
  | "nurse"
  | "technician"
  | "billing"
  | "viewer";

export type SmartHealthStaffInvitationDelivery = {
  email: "ready" | "unavailable" | "sent" | "failed";
  provider?: string;
  messageId?: string;
  lastAttemptAt?: string;
  errorCode?: string;
};

export type SmartHealthStaffInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: SmartHealthStaffRole;
  name?: string;
  phone?: string;
  specialty?: string;
  license?: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt?: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
  revokedAt?: string;
  revokedByUserId?: string;
  revokeReason?: string;
  createdByUserId?: string;
  lastSentAt?: string;
  sendCount?: number;
  delivery?: SmartHealthStaffInvitationDelivery;
  createdAt?: string;
  updatedAt?: string;
};

export type SmartHealthStaffInvitationMutation = {
  invitation: SmartHealthStaffInvitation;
  delivery?: SmartHealthStaffInvitationDelivery;
  oneTimeAcceptanceToken?: string;
  oneTimeAcceptanceUrl?: string;
  idempotent?: boolean;
};

export type SmartHealthFirebaseReconciliation = {
  mode: "report_only";
  destructiveAction: false;
  deletedCount: 0;
  providerAccountCount: number;
  backendLinkedAccountCount: number;
  missingProviderAccountCount: number;
  missingBackendAccountCount: number;
  missingProviderAccounts: string[];
  missingBackendAccounts: string[];
  resultsTruncated: boolean;
};

export type SmartHealthAdminAccountRole =
  | "admin"
  | "platform_admin"
  | "workspace_admin"
  | "workspace_owner";

export type SmartHealthAdminAccount = SmartHealthAuthUser & {
  managedAdmin?: boolean;
  workspaceName?: string;
  workspaceType?: string;
  activeSessionCount?: number;
  lastLoginAt?: string;
};

export type CreateAdminAccountPayload = {
  role: SmartHealthAdminAccountRole;
  email: string;
  password: string;
  name: string;
  phone?: string;
  title?: string;
  organizationId?: string;
};

export type SmartHealthPatient = {
  id: string;
  patientCode?: string;
  name?: string;
  age?: number | null;
  dateOfBirth?: string;
  bloodType?: string;
  allergies?: string[];
  emergencyContact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  organizationId?: string;
  ownerUserId?: string;
  profileType?: string;
  relationship?: string;
  primaryDoctorId?: string;
  doctorName?: string;
  scanCount?: number;
  lastScanAt?: string | null;
  lastAiLabel?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SmartHealthScan = {
  id: string;
  patientId?: string;
  patient?: SmartHealthPatient;
  status?: string;
  processingStatus?: string;
  mode?: string;
  bodySite?: string;
  deviceId?: string;
  startedAt?: string;
  endedAt?: string;
  sampleRate?: number;
  sampleCount?: number;
  durationSeconds?: number;
  peak?: number;
  rms?: number;
  levelPercent?: number;
  bpm?: number;
  aiLabel?: string;
  aiConfidence?: number | null;
  aiSummary?: string;
  doctorNotes?: string;
  audioUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SmartHealthDeviceTelemetry = {
  uptimeMs?: number;
  resetReason?: string;
  freeHeapBytes?: number;
  i2sStatus?: string;
  audioPacketsSent?: number;
  audioPacketsDropped?: number;
  audioSendFailures?: number;
  lastCommandId?: string;
  lastCommandState?: string;
  lastCommandCode?: string;
  lastCommandUptimeMs?: number;
  otaStatus?: string;
  audioStatus?: string;
  connectionMethod?: string;
};

export type SmartHealthDeviceCredentialRotationState =
  | "initiated"
  | "pending_device_ack"
  | "confirming"
  | "confirmed"
  | "expired"
  | "rolled_back"
  | "failed";

export type SmartHealthDeviceCredentialRotation = {
  id: string;
  state: SmartHealthDeviceCredentialRotationState;
  commandId?: string;
  requestedAt?: string;
  expiresAt?: string;
  acknowledgedAt?: string;
  confirmingAt?: string;
  confirmedAt?: string;
  expiredAt?: string;
  rolledBackAt?: string;
  failedAt?: string;
  failureCode?: string;
  confirmed?: boolean;
};

export type SmartHealthDevice = {
  id: string;
  name?: string;
  type?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: string;
  status?: string;
  signal?: number;
  wifiRssi?: number;
  wifiSsid?: string;
  ipAddress?: string;
  battery?: number;
  connected?: boolean;
  online?: boolean;
  connectionMethod?: string;
  pairedUserId?: string | null;
  ownerUserId?: string | null;
  assignedPatientId?: string | null;
  revokedByUserId?: string | null;
  ownershipState?: "provisioned" | "claimed" | "assigned" | "unassigned" | "revoked";
  organizationId?: string;
  firmwareVersion?: string;
  otaStatus?: string;
  audioStatus?: string;
  backendHost?: string;
  backendPort?: number;
  telemetry?: SmartHealthDeviceTelemetry;
  credentialRotation?: SmartHealthDeviceCredentialRotation;
  ota?: {
    id?: string;
    commandId?: string;
    correlationId?: string;
    firmwareVersion?: string;
    url?: string;
    checksum?: string;
    firmwareFileId?: string;
    firmwareFileName?: string;
    hardwareTarget?: string;
    partitionTarget?: string;
    minimumProtocolVersion?: number;
    expiresAt?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  lastCommand?: SmartHealthDeviceCommand;
  lastSeenAt?: string;
  updatedAt?: string;
  revokedAt?: string;
  secretRotatedAt?: string;
};

export type SmartHealthDeviceProvisionResponse = {
  device: SmartHealthDevice;
  claim: {
    deviceId: string;
    claimCode: string;
    expiresAt: string;
    qrPayload: ShcareDeviceSetupQrPayload;
  };
  idempotent?: boolean;
};

export type SmartHealthDeviceCommandState =
  | "accepted"
  | "queued"
  | "delivered"
  | "acknowledged"
  | "applying"
  | "applied"
  | "failed"
  | "expired";

export type SmartHealthDeviceCommandDelivery = {
  websocket?: boolean;
  mqtt?: boolean;
  delivered?: boolean;
};

export type SmartHealthDeviceCommand = {
  protocolVersion?: number;
  id: string;
  deviceId: string;
  organizationId?: string;
  type: string;
  correlationId?: string;
  state: SmartHealthDeviceCommandState;
  status?: SmartHealthDeviceCommandState;
  code?: string;
  detail?: string;
  requestedByUserId?: string;
  issuedAt?: string;
  expiresAt?: string;
  acceptedAt?: string;
  queuedAt?: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  applyingAt?: string;
  appliedAt?: string;
  failedAt?: string;
  expiredAt?: string;
  delivery?: SmartHealthDeviceCommandDelivery;
  createdAt?: string;
  updatedAt?: string;
};

export type SmartHealthDevicePairing = {
  outcome: "accepted" | "success";
  presence: "awaiting_online" | "online";
  onlineConfirmed: boolean;
  authenticatedTransport?: "wss" | null;
};

export type SmartHealthDevicePairingResponse = {
  device: SmartHealthDevice;
  pairing: SmartHealthDevicePairing;
  idempotent?: boolean;
};

export type SmartHealthDeviceCommandResponse = {
  device: SmartHealthDevice;
  command: SmartHealthDeviceCommand;
  delivery?: SmartHealthDeviceCommandDelivery;
  responseStatus?: number;
  idempotent?: boolean;
};

export type SmartHealthDeviceCredentialRotationResponse = {
  device: SmartHealthDevice;
  rotation: SmartHealthDeviceCredentialRotation;
  command?: SmartHealthDeviceCommand | null;
  confirmed: boolean;
  idempotent?: boolean;
};

export type SmartHealthDeviceOtaRequest = {
  firmwareVersion: string;
  url?: string;
  checksum: string;
  firmwareFileId?: string;
  hardwareTarget: "MSM261S4030H0";
  partitionTarget: "app";
  minimumProtocolVersion: number;
};

export type SmartHealthDeviceEvent = {
  id: string;
  deviceId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
};

export type SmartHealthNotification = {
  id: string;
  userId?: string;
  organizationId?: string;
  type?: string;
  title?: string;
  message?: string;
  channel?: string;
  campaignId?: string;
  audienceType?: SmartHealthNotificationAudienceType | "legacy";
  audienceRole?: string;
  requestedChannels?: SmartHealthNotificationChannel[];
  inAppStatus?: SmartHealthNotificationDeliveryStatus;
  emailStatus?: SmartHealthNotificationDeliveryStatus;
  emailErrorMessage?: string;
  deliveryStatus?: string;
  sentAt?: string;
  failedAt?: string;
  retryCount?: number;
  pushStatus?: string;
  pushSentAt?: string;
  pushFailedAt?: string;
  metadata?: Record<string, unknown>;
  read?: boolean;
  readAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SmartHealthNotificationChannel = "in_app" | "email" | "push";
export type SmartHealthNotificationAudienceType = "workspace" | "role" | "users";
export type SmartHealthNotificationDeliveryStatus =
  | "ready"
  | "disabled"
  | "unavailable"
  | "skipped"
  | "no_recipient"
  | "no_devices"
  | "sent"
  | "partial"
  | "failed";

export type SmartHealthNotificationAudience = {
  type: SmartHealthNotificationAudienceType;
  workspaceId: string;
  role?: string;
  userIds?: string[];
};

export type SmartHealthNotificationChannelAvailability = {
  available: boolean;
  status: SmartHealthNotificationDeliveryStatus;
  provider: string;
  reasonCode?: string;
};

export type SmartHealthNotificationOptions = {
  audiences: {
    workspaces: Array<{ id: string; name: string; workspaceType: string }>;
    roles: string[];
    users: Array<{ id: string; workspaceId: string; name: string; email?: string; role: string }>;
  };
  channels: Record<SmartHealthNotificationChannel, SmartHealthNotificationChannelAvailability>;
};

export type SmartHealthNotificationCampaign = {
  id: string;
  operationId: string;
  organizationId: string;
  audience: SmartHealthNotificationAudience;
  requestedChannels: SmartHealthNotificationChannel[];
  recipientCount: number;
  notificationIds: string[];
  channelSummary: Record<string, Record<string, number>>;
  status: "ready" | "partial" | "unavailable";
  createdAt: string;
};

export type SmartHealthNotificationCampaignResponse = {
  campaign: SmartHealthNotificationCampaign;
  notifications: SmartHealthNotification[];
  notification?: SmartHealthNotification | null;
  idempotent: boolean;
  channelAvailability: SmartHealthNotificationOptions["channels"];
};

export type SmartHealthExportFormat = "json" | "csv" | "xlsx" | "pdf";

export type SmartHealthExportDataset = "clinical_bundle" | "audit_logs";

export type SmartHealthAuditLogSort =
  | "createdAt:desc"
  | "createdAt:asc"
  | "action:asc"
  | "action:desc";

export type SmartHealthAuditLogFilters = {
  q?: string;
  action?: string;
  resourceType?: string;
  actorUserId?: string;
  startDate?: string;
  endDate?: string;
  sort?: SmartHealthAuditLogSort;
};

export type SmartHealthExportJob = {
  id: string;
  organizationId?: string;
  createdByUserId?: string;
  format: SmartHealthExportFormat;
  dataset?: SmartHealthExportDataset;
  scopeKind?: "platform" | "workspace" | "assigned" | "personal" | string;
  filters?: SmartHealthAuditLogFilters | Record<string, unknown>;
  rendererVersion?: string;
  artifactSha256?: string;
  status: "pending" | "ready" | "failed" | string;
  includeAudio?: boolean;
  includeReports?: boolean;
  includeHistory?: boolean;
  startDate?: string;
  endDate?: string;
  recordCount?: number;
  downloadUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SmartHealthExportSnapshot = Record<string, unknown> & {
  exportId?: string;
  generatedAt?: string;
};

export type SmartHealthAuthSession = {
  id: string;
  provider?: string;
  ip?: string;
  userAgent?: string;
  createdAt?: string;
  lastSeenAt?: string;
  revokedAt?: string;
  current?: boolean;
};

export type SmartHealthReadinessItem = {
  id: string;
  group: string;
  label: string;
  status: "pass" | "warn" | "fail" | "manual" | string;
  required?: boolean;
  detail?: string;
  env?: string[];
  setup?: string;
};

export type SmartHealthProductionReadiness = {
  ok: boolean;
  generatedAt: string;
  environment?: Record<string, string>;
  counts?: Record<string, number>;
  requiredFailures?: string[];
  items: SmartHealthReadinessItem[];
};

export type SmartHealthChartPoint = {
  time?: string;
  day?: string;
  count?: number;
  gb?: number;
};

export type SmartHealthChartSlice = {
  key?: string;
  name: string;
  value: number;
  color: string;
};

export type SmartHealthOverviewStats = {
  clinics: number;
  workspaces?: number;
  patientsCount?: number;
  pendingDoctors: number;
  devicesOnline: number;
  scansCount: number;
  aiJobsFailed: number;
  storageBytes?: number;
  storageUsed: string;
};

export type SmartHealthOverviewRangeKey = "today" | "7d" | "30d";

export type SmartHealthOverviewRange = {
  key: SmartHealthOverviewRangeKey;
  label: string;
  startAt: string;
  endAt: string;
  timezoneOffsetMinutes: number;
  bucket: "4h" | "day";
};

export type SmartHealthOverviewResponse = {
  generatedAt: string;
  range: SmartHealthOverviewRange;
  stats: SmartHealthOverviewStats;
  measureData: SmartHealthChartPoint[];
  deviceData: SmartHealthChartSlice[];
  aiJobData: SmartHealthChartSlice[];
};

export type SmartHealthStorageBucket = {
  id: string;
  name?: string;
  description?: string;
  desc: string;
  iconKey?: string;
  colorKey?: string;
  category?: string;
  used: number;
  files: number;
  createdAt: string;
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
  maxFileSizeMb?: number;
  system?: boolean;
};

export type SmartHealthStorageFile = {
  id: string;
  name: string;
  bucket: string;
  type: string;
  size: string;
  uploader: string;
  uploadedAt: string;
  visibility: "private";
  previewUrl?: string;
  downloadUrl?: string;
  createdAt?: string;
  byteSize?: number;
  checksum?: string;
  sha256?: string;
  firmwareVersion?: string;
  organizationId?: string;
  tags?: string[];
};

export type SmartHealthStorageActivity = {
  action: string;
  who: string;
  what: string;
  target: string;
  when: string;
};

export type SmartHealthTopBucket = {
  name: string;
  gb: number;
};

export type SmartHealthClinicUsage = {
  name: string;
  gb: number;
  percent: number;
};

export type SmartHealthAuditLogOutcome =
  | "success"
  | "failure"
  | "warning"
  | "denied"
  | "recorded"
  | string;

export type SmartHealthAuditLog = {
  id: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  organizationId: string;
  organizationName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: SmartHealthAuditLogOutcome;
  ip: string;
  userAgent: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type SmartHealthAccessLog = SmartHealthAuditLog;

export type SmartHealthAuditLogPagination = {
  page: number;
  limit: number;
  total: number;
  pageCount: number;
  hasNextPage: boolean;
  sort: SmartHealthAuditLogSort;
};

export type SmartHealthAuditLogQuery = SmartHealthAuditLogFilters & {
  organizationId?: string;
  page?: number;
  limit?: number;
};

export type SmartHealthAuditLogResponse = {
  logs: SmartHealthAuditLog[];
  pagination: SmartHealthAuditLogPagination;
};

export type SmartHealthClinic = {
  id: string;
  name: string;
  type?: string;
  workspaceType?: "hospital" | "clinic" | "solo_practice" | "personal" | string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  status?: string;
  legalName?: string;
  representative?: string;
  requestMetadata?: Record<string, unknown>;
  ownerUserId?: string;
  packageId?: string;
  subscriptionStatus?: string;
  billingCycle?: string;
  usage?: {
    doctors?: number;
    patients?: number;
    devices?: number;
    storageGb?: number;
    aiMonthly?: number;
  };
  quota?: {
    maxDoctors?: number;
    maxPatients?: number;
    maxDevices?: number;
    storageGb?: number;
    aiMonthly?: number;
    retentionDays?: number;
  };
  userCount?: number;
  doctorCount?: number;
  patientCount?: number;
  deviceCount?: number;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type SmartHealthClinicListPagination = {
  totalCount: number;
  page: number;
  limit: number;
  pageCount: number;
};

export type SmartHealthListPagination = SmartHealthClinicListPagination;

function readListPagination(response: Response): SmartHealthListPagination | undefined {
  const headerValues = [
    response.headers.get("X-Total-Count"),
    response.headers.get("X-Page"),
    response.headers.get("X-Page-Limit"),
    response.headers.get("X-Page-Count"),
  ];
  if (headerValues.some((value) => value === null || !value.trim())) return undefined;
  const [totalCount, page, limit, pageCount] = headerValues.map(Number);
  if (
    ![totalCount, page, limit, pageCount].every(Number.isInteger) ||
    totalCount < 0 ||
    page < 1 ||
    limit < 1 ||
    pageCount < 0
  ) {
    return undefined;
  }
  return { totalCount, page, limit, pageCount };
}

export type SmartHealthClinicListResponse = {
  clinics: SmartHealthClinic[];
  workspaces?: SmartHealthClinic[];
  pagination?: SmartHealthClinicListPagination;
};

export type SmartHealthWorkspaceTransitionReceipt = {
  from: string;
  to: string;
};

export type SmartHealthWorkspaceMutationResponse = {
  workspace: SmartHealthClinic;
  clinic?: SmartHealthClinic;
  transition?: SmartHealthWorkspaceTransitionReceipt;
  operationId: string;
  idempotent: boolean;
};

export type SmartHealthWorkspaceArchiveResponse = {
  deleted: true;
  workspaceId: string;
  clinicId?: string;
  operationId: string;
  idempotent: boolean;
};

export type SmartHealthWorkspaceOwnerApprovalResponse = {
  workspace: SmartHealthClinic;
  clinic?: SmartHealthClinic;
  ownerApproval: {
    userId: string;
    role: "workspace_owner";
    requestedRole: "workspace_owner";
    roleRequestStatus: "approved";
    identityOperationId: string;
  };
  operationId: string;
  idempotent: boolean;
};

export type SmartHealthSpecialty = {
  id: string;
  name: string;
};

export type SmartHealthServicePackage = {
  id: string;
  name: string;
  type?: string;
  segment?: "organization" | "solo_practice" | "personal" | string;
  price?: number;
  currency?: string;
  duration?: string;
  maxDevices?: number;
  maxDoctors?: number;
  maxPatients?: number;
  storageGb?: number;
  aiMonthly?: number;
  retentionDays?: number;
  features?: Record<string, unknown>;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type RequestOptions = RequestInit & {
  query?: Record<string, QueryValue>;
  onResponse?: (response: Response) => void;
};

const DEFAULT_HTTP_BASE_URL = "http://localhost:3000";
const LOCAL_BACKEND_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "10.0.2.2"]);
const TOKEN_STORAGE_KEYS = ["smart_health_admin_token", "smart_health_token"];

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  const base = (value || fallback).trim();
  return base.replace(/\/+$/, "");
}

function assertProductionBackendUrl(label: string, value: string) {
  if (!import.meta.env.PROD || import.meta.env.VITE_SMART_HEALTH_ALLOW_LOCAL_BACKEND === "true") {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL: ${value}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS in production builds: ${value}`);
  }

  if (LOCAL_BACKEND_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`${label} must not point to a local backend in production builds: ${value}`);
  }
}

function getHttpBaseUrl() {
  const baseUrl = normalizeBaseUrl(
    import.meta.env.VITE_SMART_HEALTH_BASE_URL,
    DEFAULT_HTTP_BASE_URL,
  );
  assertProductionBackendUrl("VITE_SMART_HEALTH_BASE_URL", baseUrl);
  return baseUrl;
}

function getApiBaseUrl() {
  const configured = import.meta.env.VITE_SMART_HEALTH_API_BASE_URL;
  const baseUrl = normalizeBaseUrl(configured, `${getHttpBaseUrl()}/api`);
  assertProductionBackendUrl("VITE_SMART_HEALTH_API_BASE_URL", baseUrl);
  return baseUrl;
}

function getStoredToken() {
  if (typeof window === "undefined") {
    return "";
  }

  for (const key of TOKEN_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value) {
      return value;
    }
  }

  return "";
}

function storeToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEYS[0], token);
  window.localStorage.setItem(TOKEN_STORAGE_KEYS[1], token);
}

function clearToken() {
  if (typeof window === "undefined") {
    return;
  }

  TOKEN_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

function clearTokenIfMatches(expectedToken: string) {
  if (!expectedToken || getStoredToken() !== expectedToken) return false;
  clearToken();
  return true;
}

export function clearSmartHealthStoredToken() {
  clearToken();
}

export function getSmartHealthStoredTokenSnapshot() {
  return getStoredToken();
}

export function clearSmartHealthStoredTokenIfMatches(expectedToken: string) {
  return clearTokenIfMatches(expectedToken);
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path.replace(/^\/+/, ""), `${getApiBaseUrl()}/`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function getErrorMetadata(payload: unknown) {
  const root =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const nested =
    root.error && typeof root.error === "object" && !Array.isArray(root.error)
      ? (root.error as Record<string, unknown>)
      : {};
  const details =
    nested.details && typeof nested.details === "object" && !Array.isArray(nested.details)
      ? (nested.details as Record<string, unknown>)
      : root.details && typeof root.details === "object" && !Array.isArray(root.details)
        ? (root.details as Record<string, unknown>)
        : {};
  const fieldErrorsCandidate = details.fieldErrors ?? root.fieldErrors;
  const fieldErrors =
    fieldErrorsCandidate &&
    typeof fieldErrorsCandidate === "object" &&
    !Array.isArray(fieldErrorsCandidate)
      ? Object.fromEntries(
          Object.entries(fieldErrorsCandidate as Record<string, unknown>).flatMap(
            ([field, value]) => (typeof value === "string" ? [[field, value]] : []),
          ),
        )
      : undefined;
  const stringError = typeof root.error === "string" ? root.error : "";
  return {
    code:
      typeof nested.code === "string"
        ? nested.code
        : typeof root.code === "string"
          ? root.code
          : "",
    message:
      typeof nested.message === "string"
        ? nested.message
        : typeof root.message === "string"
          ? root.message
          : stringError,
    requestId:
      typeof nested.requestId === "string"
        ? nested.requestId
        : typeof root.requestId === "string"
          ? root.requestId
          : "",
    fieldErrors,
  };
}

function getErrorMessage(payload: unknown, fallback: string) {
  const metadata = getErrorMetadata(payload);
  if (metadata.message || metadata.code) {
    return toVietnameseErrorMessage({ message: metadata.message, code: metadata.code }, fallback);
  }
  return toVietnameseErrorMessage(payload, fallback);
}

function assignApiErrorMetadata(error: SmartHealthApiError, payload: unknown) {
  const metadata = getErrorMetadata(payload);
  if (metadata.code) error.code = metadata.code;
  if (metadata.requestId) error.requestId = metadata.requestId;
  if (metadata.fieldErrors && Object.keys(metadata.fieldErrors).length > 0) {
    error.fieldErrors = metadata.fieldErrors;
  }
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, body, onResponse, ...init } = options;
  const requestHeaders = new Headers(headers);
  const token = getStoredToken();

  if (token && !requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (body && typeof body === "string" && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (!requestHeaders.has("X-Smart-Health-Surface")) {
    requestHeaders.set("X-Smart-Health-Surface", WEB_SURFACE);
  }

  if (!requestHeaders.has("X-Smart-Health-Client")) {
    requestHeaders.set("X-Smart-Health-Client", "web");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      headers: requestHeaders,
      body,
    });
    onResponse?.(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(
      toVietnameseErrorMessage(
        error,
        "Không thể kết nối backend Shcare. Vui lòng kiểm tra backend đang chạy và cấu hình CORS.",
      ),
    );
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearTokenIfMatches(token);
    }
    const error = new Error(
      getErrorMessage(payload, `Không thể kết nối backend Shcare (${response.status}).`),
    ) as SmartHealthApiError;
    error.status = response.status;
    error.payload = payload;
    assignApiErrorMetadata(error, payload);
    throw error;
  }

  return payload as T;
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { query, headers, body, onResponse, ...init } = options;
  const requestHeaders = new Headers(headers);
  const token = getStoredToken();

  if (token && !requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (!requestHeaders.has("X-Smart-Health-Surface")) {
    requestHeaders.set("X-Smart-Health-Surface", WEB_SURFACE);
  }

  if (!requestHeaders.has("X-Smart-Health-Client")) {
    requestHeaders.set("X-Smart-Health-Client", "web");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      headers: requestHeaders,
      body,
    });
    onResponse?.(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(
      toVietnameseErrorMessage(
        error,
        "Không thể kết nối backend Shcare. Vui lòng kiểm tra backend đang chạy và cấu hình CORS.",
      ),
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearTokenIfMatches(token);
    }
    const text = await response.text();
    let payload: unknown = text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    const error = new Error(
      getErrorMessage(payload, `Không thể tải tệp từ backend Shcare (${response.status}).`),
    ) as SmartHealthApiError;
    error.status = response.status;
    error.payload = payload;
    assignApiErrorMetadata(error, payload);
    throw error;
  }

  return response.blob();
}

export function smartHealthAudioUrl(path?: string | null) {
  if (!path) {
    return "";
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${getHttpBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export const smartHealthApi = {
  async login(email: string, password: string, role?: string) {
    const result = await requestJson<{ token?: string; user?: SmartHealthAuthUser }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password, role }),
      },
    );

    if (result.token) {
      storeToken(result.token);
    }

    return result;
  },

  async logoutIfTokenMatches(expectedToken: string) {
    if (!expectedToken || getStoredToken() !== expectedToken) return false;
    let replacementTokenDetected = false;
    try {
      await requestJson<{ ok?: boolean }>("/auth/logout", { method: "POST" });
    } finally {
      const currentToken = getStoredToken();
      if (currentToken === expectedToken) {
        clearTokenIfMatches(expectedToken);
      } else if (currentToken) {
        replacementTokenDetected = true;
      }
    }
    return !replacementTokenDetected;
  },

  async logout() {
    const token = getStoredToken();
    if (!token) return;
    await this.logoutIfTokenMatches(token);
  },

  async authenticateFirebase(idToken: string) {
    const result = await requestJson<{
      provider?: string;
      user?: SmartHealthAuthUser;
      session?: unknown;
    }>("/auth/firebase", {
      method: "GET",
      headers: { Authorization: `Bearer ${idToken}` },
    });

    storeToken(idToken);
    return result;
  },

  async me() {
    return requestJson<{ user: SmartHealthAuthUser }>("/me");
  },

  async updateMe(payload: Partial<SmartHealthAuthUser>) {
    return requestJson<{ user: SmartHealthAuthUser }>("/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async uploadMyAvatar(file: File) {
    return requestJson<{ user: SmartHealthAuthUser; file: SmartHealthStorageFile }>("/me/avatar", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": file.name,
      },
      body: file,
    });
  },

  async downloadMyAvatar() {
    return requestBlob("/me/avatar");
  },

  async deleteMyAvatar() {
    return requestJson<{ user: SmartHealthAuthUser }>("/me/avatar", {
      method: "DELETE",
    });
  },

  async changePassword(payload: PasswordChangeInput, idempotencyKey: string) {
    if (!idempotencyKey.trim()) {
      const error = new Error(
        "Đổi mật khẩu cần mã thao tác ổn định để có thể thử lại an toàn.",
      ) as SmartHealthApiError;
      error.status = 400;
      error.code = "IDEMPOTENCY_KEY_REQUIRED";
      throw error;
    }
    return parsePasswordChangeReceipt(
      await requestJson<unknown>("/v1/me/password", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      }),
    );
  },

  async getTwoFactorStatus() {
    return requestJson<SmartHealthTwoFactorStatus>("/me/2fa");
  },

  async getNotificationPreferences() {
    return requestJson<SmartHealthNotificationPreferencesResponse>("/me/notification-preferences");
  },

  async patchNotificationPreference(
    payload: {
      key: SmartHealthNotificationPreferenceKey;
      enabled: boolean;
    },
    idempotencyKey: string,
  ) {
    if (!idempotencyKey.trim()) {
      throw new Error("Idempotency-Key is required for notification preference changes");
    }
    return requestJson<SmartHealthNotificationPreferencesResponse>("/me/notification-preferences", {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ key: payload.key, enabled: payload.enabled }),
    });
  },

  async listSessions() {
    return requestJson<{ sessions: SmartHealthAuthSession[] }>("/auth/sessions");
  },

  async revokeSession(intent: AuthSessionRevokeIntent) {
    assertAuthSessionRevokeIntent(intent, intent.userId);
    return parseAuthSessionRevokeReceipt(
      await requestJson<unknown>(
        `/v1/auth/sessions/${encodeURIComponent(intent.sessionId)}/revoke`,
        {
          method: "POST",
          headers: { "Idempotency-Key": intent.idempotencyKey },
        },
      ),
      intent,
      intent.userId,
    );
  },

  async listPatients(
    params:
      | string
      | {
          q?: string;
          page?: number;
          limit?: number;
          sort?: string;
          signal?: AbortSignal;
        } = {},
  ) {
    const normalized = typeof params === "string" ? { q: params } : params;
    let pagination: SmartHealthListPagination | undefined;
    const payload = await requestJson<{ patients: SmartHealthPatient[] }>(
      IS_PORTAL_SURFACE ? "/portal/patients" : "/patients",
      {
        query: {
          q: normalized.q,
          page: normalized.page,
          limit: normalized.limit,
          sort: normalized.sort,
        },
        signal: normalized.signal,
        onResponse: (response) => {
          pagination = readListPagination(response);
        },
      },
    );
    return { ...payload, pagination };
  },

  async listScans(params: { patientId?: string; status?: string; limit?: number } = {}) {
    return requestJson<{ scans: SmartHealthScan[] }>(
      IS_PORTAL_SURFACE ? "/portal/scans" : "/scans",
      { query: params },
    );
  },

  async downloadScanAudio(audioUrl: string) {
    return requestBlob(audioUrl);
  },

  async reprocessScanAi(scanId: string, idempotencyKey: string) {
    return requestJson<{ scan: SmartHealthScan }>(
      `/scans/${encodeURIComponent(scanId)}/reprocess`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    );
  },

  async listDevices(
    params: {
      q?: string;
      page?: number;
      limit?: number;
      sort?: string;
      status?: string;
      signal?: AbortSignal;
    } = {},
  ) {
    let pagination: SmartHealthListPagination | undefined;
    const payload = await requestJson<{
      devices: SmartHealthDevice[];
      summary?: {
        total: number;
        online: number;
        offline: number;
        revoked: number;
        otaPending: number;
      };
    }>(IS_PORTAL_SURFACE ? "/portal/devices" : "/devices", {
      query: {
        q: params.q,
        page: params.page,
        limit: params.limit,
        sort: params.sort,
        status: params.status,
      },
      signal: params.signal,
      onResponse: (response) => {
        pagination = readListPagination(response);
      },
    });
    return { ...payload, pagination };
  },

  async getDevice(id: string, signal?: AbortSignal) {
    return requestJson<{ device: SmartHealthDevice }>(`/devices/${encodeURIComponent(id)}`, {
      signal,
    });
  },

  async patchDevice(id: string, payload: Partial<SmartHealthDevice>) {
    return requestJson<{ device: SmartHealthDevice }>(`/devices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async connectDevice(id: string) {
    return requestJson<{ device: SmartHealthDevice }>(
      `/devices/${encodeURIComponent(id)}/connect`,
      {
        method: "POST",
      },
    );
  },

  async disconnectDevice(id: string) {
    return requestJson<{ device: SmartHealthDevice }>(
      `/devices/${encodeURIComponent(id)}/disconnect`,
      { method: "POST" },
    );
  },

  async calibrateDevice(id: string) {
    return requestJson<{ device: SmartHealthDevice; settings?: unknown }>(
      `/devices/${encodeURIComponent(id)}/calibrate`,
      { method: "POST" },
    );
  },

  async revokeDevice(id: string, idempotencyKey: string) {
    return requestJson<{ device: SmartHealthDevice }>(`/devices/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({}),
    });
  },

  async rotateDeviceSecret(id: string, idempotencyKey: string) {
    return requestJson<SmartHealthDeviceCredentialRotationResponse>(
      `/devices/${encodeURIComponent(id)}/rotate-secret`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({}),
      },
    );
  },

  async pushDeviceOta(id: string, payload: SmartHealthDeviceOtaRequest, idempotencyKey: string) {
    return requestJson<
      SmartHealthDeviceCommandResponse & {
        ota?: unknown;
      }
    >(`/devices/${encodeURIComponent(id)}/ota`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  },

  async sendDeviceCommand(
    id: string,
    payload: { type: string; payload?: Record<string, unknown> },
    idempotencyKey: string,
  ) {
    return requestJson<SmartHealthDeviceCommandResponse>(
      `/devices/${encodeURIComponent(id)}/commands`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      },
    );
  },

  async listDeviceCommands(id: string) {
    return requestJson<{ commands: SmartHealthDeviceCommand[] }>(
      `/devices/${encodeURIComponent(id)}/commands`,
    );
  },

  async getDeviceCommand(id: string, commandId: string, signal?: AbortSignal) {
    return requestJson<{ command: SmartHealthDeviceCommand }>(
      `/devices/${encodeURIComponent(id)}/commands/${encodeURIComponent(commandId)}`,
      { signal },
    );
  },

  async listDeviceEvents(id: string) {
    return requestJson<{ events: SmartHealthDeviceEvent[] }>(
      `/devices/${encodeURIComponent(id)}/events`,
    );
  },

  async listNotifications() {
    return requestJson<{ notifications: SmartHealthNotification[] }>("/notifications");
  },

  async getNotificationOptions() {
    return requestJson<SmartHealthNotificationOptions>("/notifications/options");
  },

  async createExport(
    payload: {
      format: SmartHealthExportFormat;
      dataset?: SmartHealthExportDataset;
      filters?: SmartHealthAuditLogFilters;
      startDate?: string;
      endDate?: string;
      includeAudio?: boolean;
      includeReports?: boolean;
      includeHistory?: boolean;
      organizationId?: string;
    },
    idempotencyKey: string,
  ) {
    return requestJson<{ export: SmartHealthExportJob }>("/exports", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  },

  async downloadExport(exportId: string, onResponse?: (response: Response) => void) {
    return requestBlob(`/exports/download/${encodeURIComponent(exportId)}`, { onResponse });
  },

  async createNotification(
    payload: {
      title: string;
      message: string;
      type?: string;
      audience: SmartHealthNotificationAudience;
      channels: SmartHealthNotificationChannel[];
    },
    idempotencyKey: string,
  ) {
    return requestJson<SmartHealthNotificationCampaignResponse>("/notifications", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  },

  async markAllNotificationsRead() {
    return requestJson<{ notifications: SmartHealthNotification[] }>("/notifications/read-all", {
      method: "POST",
    });
  },

  async markNotificationRead(id: string) {
    return requestJson<{ notification: SmartHealthNotification }>(
      `/notifications/${encodeURIComponent(id)}/read`,
      { method: "POST" },
    );
  },

  async deleteNotification(id: string) {
    return requestJson<{ deleted: boolean }>(`/notifications/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  async deleteAllNotifications() {
    return requestJson<{ deleted: boolean; count: number }>("/notifications", {
      method: "DELETE",
    });
  },

  async listAuditLogs(params: SmartHealthAuditLogQuery = {}, signal?: AbortSignal) {
    return requestJson<SmartHealthAuditLogResponse>("/audit-logs", {
      query: params,
      signal,
    });
  },

  async listAccessLogs(params: SmartHealthAuditLogQuery = {}, signal?: AbortSignal) {
    return requestJson<SmartHealthAuditLogResponse>("/access-logs", {
      query: params,
      signal,
    });
  },

  async listDoctorRoleRequests(status?: string) {
    return requestJson<{ requests: SmartHealthAuthUser[] }>("/admin/doctor-requests", {
      query: { status },
    });
  },

  async listApprovedDoctors(
    params: {
      q?: string;
      page?: number;
      limit?: number;
      sort?: string;
      status?: string;
      specialty?: string;
      clinic?: string;
      signal?: AbortSignal;
    } = {},
  ) {
    let pagination: SmartHealthListPagination | undefined;
    const payload = await requestJson<{
      doctors: SmartHealthAuthUser[];
      facets?: { specialties?: string[]; clinics?: string[] };
    }>(IS_PORTAL_SURFACE ? "/portal/staff" : "/admin/doctors", {
      query: {
        q: params.q,
        page: params.page,
        limit: params.limit,
        sort: params.sort,
        status: params.status,
        specialty: params.specialty,
        clinic: params.clinic,
      },
      signal: params.signal,
      onResponse: (response) => {
        pagination = readListPagination(response);
      },
    });
    return { ...payload, pagination };
  },

  async listStaffInvitations(
    params: {
      organizationId?: string;
      role?: SmartHealthStaffRole;
      status?: SmartHealthStaffInvitation["status"];
    } = {},
  ) {
    return requestJson<{ invitations: SmartHealthStaffInvitation[] }>("/admin/staff-invitations", {
      query: params,
    });
  },

  async createStaffInvitation(
    payload: {
      email: string;
      role: SmartHealthStaffRole;
      organizationId: string;
      name?: string;
      phone?: string;
      specialty?: string;
      license?: string;
    },
    idempotencyKey: string,
  ) {
    return requestJson<SmartHealthStaffInvitationMutation>("/admin/staff-invitations", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  },

  async resendStaffInvitation(invitationId: string, idempotencyKey: string) {
    return requestJson<SmartHealthStaffInvitationMutation>(
      `/admin/staff-invitations/${encodeURIComponent(invitationId)}/resend`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({}),
      },
    );
  },

  async revokeStaffInvitation(invitationId: string, reason: string, idempotencyKey: string) {
    return requestJson<SmartHealthStaffInvitationMutation>(
      `/admin/staff-invitations/${encodeURIComponent(invitationId)}/revoke`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ reason }),
      },
    );
  },

  async createAdminAccount(payload: CreateAdminAccountPayload) {
    return requestJson<{
      user: SmartHealthAuthUser;
      firebase: {
        uid: string;
        email: string;
        created: boolean;
        claims?: unknown;
      };
    }>("/admin/admin-users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listAdminAccounts(params: { q?: string; role?: string; status?: string } = {}) {
    return requestJson<{ users: SmartHealthAdminAccount[] }>("/admin/admin-users", {
      query: params,
    });
  },

  async updateAdminAccount(
    userId: string,
    payload: Partial<
      Pick<
        SmartHealthAdminAccount,
        "name" | "phone" | "title" | "role" | "organizationId" | "accountStatus"
      >
    >,
  ) {
    return requestJson<{ user: SmartHealthAdminAccount }>(
      `/admin/admin-users/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
  },

  async resetAdminAccountPassword(userId: string, password: string) {
    return requestJson<{ ok: boolean; user: SmartHealthAdminAccount }>(
      `/admin/admin-users/${encodeURIComponent(userId)}/reset-password`,
      {
        method: "POST",
        body: JSON.stringify({ password }),
      },
    );
  },

  async lockAdminAccount(userId: string) {
    return requestJson<{ user: SmartHealthAdminAccount }>(
      `/admin/admin-users/${encodeURIComponent(userId)}`,
      { method: "PATCH", body: JSON.stringify({ accountStatus: "locked" }) },
    );
  },

  async unlockAdminAccount(userId: string) {
    return requestJson<{ user: SmartHealthAdminAccount }>(
      `/admin/admin-users/${encodeURIComponent(userId)}`,
      { method: "PATCH", body: JSON.stringify({ accountStatus: "active" }) },
    );
  },

  async deleteAdminAccount(userId: string) {
    return requestJson<{
      deleted: boolean;
      userId: string;
      firebaseUid?: string;
      firebaseDeleted?: boolean;
      firebaseAlreadyMissing?: boolean;
    }>(`/admin/admin-users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  },

  async deleteDoctor(userId: string, idempotencyKey: string) {
    return requestJson<{
      deleted: boolean;
      userId?: string;
      firebaseDeleted?: boolean;
      firebaseAlreadyMissing?: boolean;
      firebaseUid?: string;
      warning?: string;
    }>(`/admin/doctors/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },

  async lockDoctor(userId: string, idempotencyKey: string) {
    return requestJson<{
      request: SmartHealthAuthUser;
      firebaseDisabled?: boolean;
      firebaseTokensRevoked?: boolean;
      firebaseAlreadyMissing?: boolean;
      demoSessionsRevoked?: number;
      firebaseSessionsRevoked?: number;
      warning?: string;
    }>(`/admin/doctors/${encodeURIComponent(userId)}/lock`, {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },

  async approveDoctorRoleRequest(
    userId: string,
    payload: { organizationId?: string; role?: string } = {},
  ) {
    return requestJson<{ request: SmartHealthAuthUser; firebaseClaims?: unknown }>(
      `/admin/doctor-requests/${encodeURIComponent(userId)}/approve`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  async rejectDoctorRoleRequest(userId: string, reason: string) {
    return requestJson<{ request: SmartHealthAuthUser }>(
      `/admin/doctor-requests/${encodeURIComponent(userId)}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      },
    );
  },

  async requestDoctorRoleMoreInfo(userId: string, message: string, requiredFields: string[] = []) {
    return requestJson<{ request: SmartHealthAuthUser }>(
      `/admin/doctor-requests/${encodeURIComponent(userId)}/request-info`,
      {
        method: "POST",
        body: JSON.stringify({ message, requiredFields }),
      },
    );
  },

  async getOverviewStats({
    range = "today",
    timezoneOffsetMinutes = 0,
  }: {
    range?: SmartHealthOverviewRangeKey;
    timezoneOffsetMinutes?: number;
  } = {}) {
    return requestJson<unknown>(IS_PORTAL_SURFACE ? "/portal/overview" : "/admin/overview-stats", {
      query: { range, timezoneOffsetMinutes },
    });
  },

  async syncFirebase() {
    return requestJson<SmartHealthFirebaseReconciliation>("/admin/sync-firebase", {
      method: "POST",
    });
  },

  async getSettings() {
    return requestJson<{ settings: Record<string, unknown> }>("/settings");
  },

  async getProductionReadiness() {
    return requestJson<{ readiness: SmartHealthProductionReadiness }>(
      "/settings/production-readiness",
    );
  },

  async updateSettings(payload: Record<string, unknown>) {
    return requestJson<{ settings: Record<string, unknown> }>("/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async testEmail(payload: { to: string; subject?: string; message?: string }) {
    return requestJson<{ ok: boolean; result?: unknown }>("/settings/test-email", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async testOutbound(payload: {
    channel: "sms" | "zalo";
    to?: string;
    message?: string;
    templateId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return requestJson<{ ok: boolean; result?: unknown }>("/settings/test-outbound", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async runBackupCheck() {
    return requestJson<{ ok: boolean; backup: unknown; settings: Record<string, unknown> }>(
      "/settings/backup-check",
      { method: "POST" },
    );
  },

  async createApiKey(payload: { name?: string }) {
    return requestJson<{
      ok: boolean;
      apiKey: unknown;
      secret?: string;
      settings: Record<string, unknown>;
    }>("/settings/api-keys", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async rotateApiKey(keyId: string) {
    return requestJson<{
      ok: boolean;
      apiKey: unknown;
      secret?: string;
      settings: Record<string, unknown>;
    }>(`/settings/api-keys/${encodeURIComponent(keyId)}/rotate`, { method: "POST" });
  },

  async revokeApiKey(keyId: string) {
    return requestJson<{ ok: boolean; apiKey: unknown; settings: Record<string, unknown> }>(
      `/settings/api-keys/${encodeURIComponent(keyId)}`,
      { method: "DELETE" },
    );
  },

  async checkAiModelUpdate() {
    return requestJson<{ ok: boolean; update: unknown }>("/settings/ai/check-update", {
      method: "POST",
    });
  },

  async updateAiModel() {
    return requestJson<{ ok: boolean; settings: Record<string, unknown>; ai?: unknown }>(
      "/settings/ai/update",
      { method: "POST" },
    );
  },

  async unlockDoctor(userId: string, idempotencyKey: string) {
    return requestJson<{
      request: SmartHealthAuthUser;
      firebaseDisabled?: boolean;
      firebaseAlreadyMissing?: boolean;
      firebaseClaims?: unknown;
      warning?: string;
    }>(`/admin/doctors/${encodeURIComponent(userId)}/unlock`, {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },

  async listClinics(
    params: {
      q?: string;
      status?: string;
      workspaceType?: string;
      page?: number;
      limit?: number;
      sort?: string;
      signal?: AbortSignal;
    } = {},
  ) {
    let pagination: SmartHealthClinicListPagination | undefined;
    const payload = await requestJson<{
      clinics?: SmartHealthClinic[];
      workspaces?: SmartHealthClinic[];
    }>("/admin/clinics", {
      query: {
        q: params.q,
        status: params.status,
        workspaceType: params.workspaceType,
        page: params.page,
        limit: params.limit,
        sort: params.sort,
      },
      signal: params.signal,
      onResponse: (response) => {
        const headerValues = [
          response.headers.get("X-Total-Count"),
          response.headers.get("X-Page"),
          response.headers.get("X-Page-Limit"),
          response.headers.get("X-Page-Count"),
        ];
        if (headerValues.some((value) => value === null || !value.trim())) return;
        const [totalCount, page, limit, pageCount] = headerValues.map(Number);
        if (
          [totalCount, page, limit, pageCount].every(Number.isInteger) &&
          totalCount >= 0 &&
          page >= 1 &&
          limit >= 1 &&
          pageCount >= 0
        ) {
          pagination = { totalCount, page, limit, pageCount };
        }
      },
    });
    return {
      ...payload,
      clinics: payload.clinics ?? payload.workspaces ?? [],
      pagination,
    } satisfies SmartHealthClinicListResponse;
  },

  async listCatalogClinics() {
    return requestJson<{ clinics: SmartHealthClinic[] }>("/catalog/clinics");
  },

  async listSpecialties() {
    return requestJson<{ specialties: SmartHealthSpecialty[] }>("/catalog/specialties");
  },

  async createClinic(
    payload: {
      name: string;
      type: string;
      workspaceType: string;
      address?: string;
      phone?: string;
      email?: string;
      website?: string;
      legalName?: string;
      representative?: string;
      ownerUserId?: string;
      packageId?: string;
      subscriptionStatus?: string;
      billingCycle?: string;
    },
    idempotencyKey: string,
  ) {
    return requestJson<SmartHealthWorkspaceMutationResponse>("/admin/clinics", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  },

  async updateClinic(
    clinicId: string,
    payload: {
      name?: string;
      type?: string;
      address?: string;
      phone?: string;
      email?: string;
      website?: string;
      status?: string;
      legalName?: string;
      representative?: string;
      workspaceType?: string;
      ownerUserId?: string;
      packageId?: string;
      subscriptionStatus?: string;
      billingCycle?: string;
      reason?: string;
      rejectReason?: string;
      message?: string;
      requestInfoMessage?: string;
      requiredFields?: string[];
      expectedVersion: number;
    },
    idempotencyKey: string,
  ) {
    return requestJson<SmartHealthWorkspaceMutationResponse>(
      `/admin/clinics/${encodeURIComponent(clinicId)}`,
      {
        method: "PATCH",
        headers: {
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(payload.expectedVersion),
        },
        body: JSON.stringify(payload),
      },
    );
  },

  async approveWorkspaceOwner(clinicId: string, expectedVersion: number, idempotencyKey: string) {
    return requestJson<SmartHealthWorkspaceOwnerApprovalResponse>(
      `/admin/clinics/${encodeURIComponent(clinicId)}/owner-approval`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(expectedVersion),
        },
        body: JSON.stringify({ expectedVersion }),
      },
    );
  },

  async deleteClinic(clinicId: string, expectedVersion: number, idempotencyKey: string) {
    return requestJson<SmartHealthWorkspaceArchiveResponse>(
      `/admin/clinics/${encodeURIComponent(clinicId)}`,
      {
        method: "DELETE",
        query: { version: expectedVersion },
        headers: {
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(expectedVersion),
        },
      },
    );
  },

  async createPatient(
    payload: {
      name: string;
      age?: number | null;
      dateOfBirth?: string;
      bloodType?: string;
      allergies?: string[];
      emergencyContact?: {
        name: string;
        phone: string;
        relationship: string;
      };
      gender?: string;
      phone?: string;
      email?: string;
      address?: string;
      notes?: string;
      patientCode?: string;
      organizationId?: string;
    },
    idempotencyKey?: string,
  ) {
    return requestJson<unknown>(IS_PORTAL_SURFACE ? "/portal/patients" : "/patients", {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      body: JSON.stringify(payload),
    });
  },

  async getPatient(patientId: string) {
    return requestJson<unknown>(
      `${IS_PORTAL_SURFACE ? "/portal/patients" : "/patients"}/${encodeURIComponent(patientId)}`,
    );
  },

  async updatePatient(
    patientId: string,
    payload: Partial<Omit<SmartHealthPatient, "id">>,
    idempotencyKey?: string,
  ) {
    return requestJson<unknown>(
      `${IS_PORTAL_SURFACE ? "/portal/patients" : "/patients"}/${encodeURIComponent(patientId)}`,
      {
        method: "PATCH",
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        body: JSON.stringify(payload),
      },
    );
  },

  async deletePatient(patientId: string, idempotencyKey?: string) {
    return requestJson<unknown>(
      `${IS_PORTAL_SURFACE ? "/portal/patients" : "/patients"}/${encodeURIComponent(patientId)}`,
      {
        method: "DELETE",
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      },
    );
  },

  async createDeviceProvision(
    payload: {
      deviceId: string;
      name?: string;
      type?: string;
      manufacturer?: string;
      model?: string;
      serialNumber?: string;
      purchaseDate?: string;
      organizationId?: string;
    },
    idempotencyKey: string,
  ) {
    if (!idempotencyKey.trim()) {
      throw new Error("Idempotency-Key is required for device provisioning");
    }
    return requestJson<SmartHealthDeviceProvisionResponse>("/devices/provision-qr", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  },

  async activateDeviceByClaim(
    payload: {
      deviceId: string;
      claimCode?: string;
      connectionMethod?: string;
    },
    idempotencyKey: string,
  ) {
    return requestJson<SmartHealthDevicePairingResponse>("/devices/pair", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  },

  async listPackages(
    params: {
      q?: string;
      page?: number;
      limit?: number;
      sort?: string;
      status?: string;
      signal?: AbortSignal;
    } = {},
  ) {
    let pagination: SmartHealthListPagination | undefined;
    const payload = await requestJson<{
      packages: SmartHealthServicePackage[];
      summary?: {
        total: number;
        active: number;
        archived: number;
        assignedWorkspaceCount?: number;
        assignedByPackage?: Record<string, number>;
      };
    }>("/admin/packages", {
      query: {
        q: params.q,
        page: params.page,
        limit: params.limit,
        sort: params.sort,
        status: params.status,
      },
      signal: params.signal,
      onResponse: (response) => {
        pagination = readListPagination(response);
      },
    });
    return { ...payload, pagination };
  },

  async createPackage(
    payload: {
      packageName?: string;
      name?: string;
      packageType?: string;
      type?: string;
      segment?: string;
      price?: string | number;
      duration?: string;
      maxDevices?: string | number;
      maxDoctors?: string | number;
      maxPatients?: string | number;
      storageGb?: string | number;
      aiMonthly?: string | number;
      retentionDays?: string | number;
      features?: Record<string, unknown>;
      status?: string;
    },
    idempotencyKey: string,
  ) {
    return requestJson<{ package: SmartHealthServicePackage; idempotent?: boolean }>(
      "/admin/packages",
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      },
    );
  },

  async updatePackage(
    packageId: string,
    payload: {
      packageName?: string;
      name?: string;
      packageType?: string;
      type?: string;
      segment?: string;
      price?: string | number;
      duration?: string;
      maxDevices?: string | number;
      maxDoctors?: string | number;
      maxPatients?: string | number;
      storageGb?: string | number;
      aiMonthly?: string | number;
      retentionDays?: string | number;
      features?: Record<string, unknown>;
      status?: string;
    },
    idempotencyKey: string,
  ) {
    return requestJson<{ package: SmartHealthServicePackage; idempotent?: boolean }>(
      `/admin/packages/${encodeURIComponent(packageId)}`,
      {
        method: "PATCH",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      },
    );
  },

  async archivePackage(packageId: string, idempotencyKey: string) {
    return requestJson<{
      package: SmartHealthServicePackage;
      archived: true;
      packageId: string;
      idempotent?: boolean;
    }>(`/admin/packages/${encodeURIComponent(packageId)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },

  async getStorageStats() {
    return requestJson<unknown>(
      IS_PORTAL_SURFACE ? "/portal/storage/stats" : "/admin/storage-stats",
    );
  },

  async listStorageFiles(
    params: {
      q?: string;
      bucket?: string;
      type?: string;
      page?: number;
      limit?: number;
      sort?: string;
      signal?: AbortSignal;
    } = {},
  ) {
    let pagination: SmartHealthListPagination | undefined;
    const payload = await requestJson<{ files: SmartHealthStorageFile[] }>(
      IS_PORTAL_SURFACE ? "/portal/storage/files" : "/admin/storage-files",
      {
        query: {
          q: params.q,
          bucket: params.bucket,
          type: params.type,
          page: params.page,
          limit: params.limit,
          sort: params.sort,
        },
        signal: params.signal,
        onResponse: (response) => {
          pagination = readListPagination(response);
        },
      },
    );
    return { ...payload, pagination };
  },

  async createStorageBucket(
    payload: {
      id?: string;
      name: string;
      description?: string;
      iconKey?: string;
      colorKey?: string;
      category?: string;
      allowedExtensions?: string[];
      allowedMimeTypes?: string[];
      maxFileSizeMb?: number;
    },
    idempotencyKey: string,
  ) {
    return requestJson<{ bucket: SmartHealthStorageBucket; idempotent?: boolean }>(
      "/admin/storage-buckets",
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      },
    );
  },

  async deleteStorageBucket(bucketId: string, idempotencyKey: string) {
    return requestJson<{ deleted: boolean; bucketId: string; idempotent?: boolean }>(
      `/admin/storage-buckets/${encodeURIComponent(bucketId)}`,
      { method: "DELETE", headers: { "Idempotency-Key": idempotencyKey } },
    );
  },

  async uploadStorageFile(payload: {
    bucket: string;
    file: File;
    tags?: string[];
    idempotencyKey: string;
  }) {
    return requestJson<{ file: SmartHealthStorageFile; idempotent?: boolean }>(
      "/admin/storage-files",
      {
        method: "POST",
        query: {
          bucket: payload.bucket,
          filename: payload.file.name,
          tags: payload.tags?.join(",") || "",
        },
        headers: {
          "Idempotency-Key": payload.idempotencyKey,
          "Content-Type": payload.file.type || "application/octet-stream",
          "X-File-Name": payload.file.name,
        },
        body: payload.file,
      },
    );
  },

  async deleteStorageFile(fileId: string, idempotencyKey: string) {
    return requestJson<{ deleted: boolean; fileId: string; idempotent?: boolean }>(
      `/admin/storage-files/${encodeURIComponent(fileId)}`,
      { method: "DELETE", headers: { "Idempotency-Key": idempotencyKey } },
    );
  },

  async shareStorageFile(fileId: string, idempotencyKey: string) {
    return requestJson<{
      url: string;
      shareUrl: string;
      expiresInSeconds?: number;
      idempotent?: boolean;
    }>(`/admin/storage-files/${encodeURIComponent(fileId)}/share`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },

  async downloadStorageFile(fileId: string, downloadUrl?: string) {
    const path = downloadUrl?.startsWith("/api/")
      ? downloadUrl.slice(4)
      : downloadUrl || `/admin/storage-files/${encodeURIComponent(fileId)}/download`;
    return requestBlob(path);
  },
};
