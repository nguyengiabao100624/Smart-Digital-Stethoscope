import { buildRealtimeConnection } from "./realtime";
import {
  parsePatientShareCreateResponse,
  parsePatientShareListResponse,
  parsePatientShareRevokeResponse,
  parseShareTargetsResponse,
} from "./consent-operations";
import {
  parseDevicePairingResponse,
  parsePortalDeviceListResponse,
} from "./device-operations";
import { parsePortalMonitoringResponse } from "./monitoring-operations";
import {
  parsePublicClinicCatalog,
  type PublicClinicOption,
  type RoleRequestReceipt,
} from "./role-request-contract";
import {
  assertAuthSessionRevokeIntent,
  parseAuthSessionRevokeReceipt,
  type AuthSessionRevokeIntent,
} from "./auth-session-operations";
import {
  assertWorkspaceSettingsIntent,
  parseWorkspaceSettingsReceipt,
  type WorkspaceSettingsUpdateIntent,
} from "./workspace-settings-operations";
import type {
  AvatarDeleteReceipt,
  AvatarDeleteIntent,
  AvatarMutationAuthority,
  AvatarUploadReceipt,
  AvatarUploadIntent,
} from "./avatar-operations";
import {
  assertTwoFactorEnrollmentStartIntent,
  assertTwoFactorEnrollmentIntent,
  assertTwoFactorRecoveryAckIntent,
  parseTwoFactorEnrollmentStartReceipt,
  parseTwoFactorEnrollmentReceipt,
  parseTwoFactorRecoveryAckReceipt,
  TwoFactorEnrollmentContractError,
  type TwoFactorEnrollmentIntent,
  type TwoFactorEnrollmentReceipt,
  type TwoFactorEnrollmentStartIntent,
  type TwoFactorEnrollmentStartReceipt,
  type TwoFactorRecoveryAckIntent,
} from "./two-factor-enrollment-operations";

type QueryValue = string | number | boolean | null | undefined;

export type ApiError = Error & {
  status?: number;
  code?: string;
  details?: unknown;
  requestId?: string;
  payload?: unknown;
  fieldErrors?: Record<string, string>;
};

export interface BlobDownloadProgress {
  loaded: number;
  total: number | null;
  percent: number | null;
}

export interface BlobDownloadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BlobDownloadProgress) => void;
}

export interface PageMetadata {
  page: number;
  limit: number;
  total: number | null;
  hasNextPage: boolean;
}

export type ReviewDecision =
  | "accepted"
  | "repeat_measurement"
  | "follow_up_required";

export interface ClinicalReview {
  id: string;
  scanId: string;
  organizationId?: string;
  patientId?: string;
  deviceId?: string;
  status: "pending" | "reviewed";
  decision?: ReviewDecision | "";
  note?: string;
  reviewerUserId?: string;
  reviewedAt?: string;
  version: number;
  scanStatus?: string;
  scanCreatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ClinicalAlertStatus = "open" | "acknowledged" | "resolved";

export interface ClinicalAlert {
  id: string;
  organizationId?: string;
  sourceType?: "device" | "scan" | string;
  sourceId?: string;
  dedupeKey?: string;
  occurrenceNumber?: number;
  previousAlertId?: string;
  occurredAt?: string;
  status: ClinicalAlertStatus;
  severity?: "info" | "warning" | "critical" | string;
  title?: string;
  message?: string;
  patientId?: string;
  deviceId?: string;
  scanId?: string;
  acknowledgedByUserId?: string;
  acknowledgedAt?: string;
  acknowledgementNote?: string;
  resolvedByUserId?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  version: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export type TwoFactorMethod = "app";

export interface TwoFactorAvailability {
  available: boolean;
  status: "available" | "unavailable";
  methods: TwoFactorMethod[];
  reason: string;
}

export interface TwoFactorState {
  enabled: boolean;
  method: TwoFactorMethod | "";
  enrollmentPending: boolean;
}

export interface TwoFactorStatusResponse {
  availability: TwoFactorAvailability;
  twoFactor: TwoFactorState;
}

export interface TwoFactorEnrollment {
  id: string;
  method: TwoFactorMethod;
  manualKey: string;
  otpauthUri: string;
  expiresAt: string;
}

export type TwoFactorEnrollmentResponse = TwoFactorEnrollmentStartReceipt;

export type TwoFactorVerifiedResponse = TwoFactorEnrollmentReceipt;

export interface TwoFactorChallengeDetails {
  challengeId: string;
  method: TwoFactorMethod;
  expiresAt: string;
}

export interface TwoFactorChallengeResponse {
  twoFactorToken: string;
  expiresAt: string;
  token?: string;
  user?: ApiUser;
}

export interface WorkspaceMembership {
  id?: string;
  userId?: string;
  workspaceId?: string;
  organizationId?: string;
  workspaceName?: string;
  workspaceType?: string;
  role?: string;
  patientCount?: number;
  patientsCount?: number;
  deviceCount?: number;
  devicesCount?: number;
  deviceOnline?: number;
  devicesOnline?: number;
  alertCount?: number;
  alertsCount?: number;
  scanCount?: number;
  scansCount?: number;
  operational?: boolean;
  status?: "active" | "suspended" | "revoked" | string;
  workspaceStatus?: string;
  suspendedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type StaffInvitationRole =
  | "workspace_admin"
  | "doctor"
  | "nurse"
  | "technician"
  | "billing"
  | "viewer";

export type StaffInvitationDelivery = {
  email: "ready" | "unavailable" | "sent" | "failed";
  provider?: string;
  messageId?: string;
  lastAttemptAt?: string;
  errorCode?: string;
};

export type StaffInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: StaffInvitationRole;
  name?: string;
  phone?: string;
  specialty?: string;
  license?: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt?: string;
  acceptedAt?: string;
  revokedAt?: string;
  revokeReason?: string;
  sendCount?: number;
  delivery?: StaffInvitationDelivery;
  createdAt?: string;
  updatedAt?: string;
};

export type StaffInvitationMutationResponse = {
  invitation: StaffInvitation;
  delivery?: StaffInvitationDelivery;
  oneTimeAcceptanceToken?: string;
  oneTimeAcceptanceUrl?: string;
  idempotent?: boolean;
};

export type WorkspaceMembershipAction = "suspend" | "reactivate" | "revoke";

export type WorkspaceMembershipRoleChangeResponse = {
  action: "change_role";
  membership: WorkspaceMembership;
  user: ApiUser;
  replayed?: boolean;
};

export interface WorkspaceSummary {
  id: string;
  name?: string;
  type?: string;
  workspaceType?: string;
  status?: string;
  version?: number;
  ownerUserId?: string;
  packageId?: string;
  subscriptionStatus?: string;
  billingCycle?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  legalName?: string;
  representative?: string;
  usage?: Record<string, unknown>;
  quota?: Record<string, unknown>;
  userCount?: number;
  doctorCount?: number;
  patientCount?: number;
  patientsCount?: number;
  deviceCount?: number;
  devicesCount?: number;
  deviceOnline?: number;
  devicesOnline?: number;
  alertCount?: number;
  alertsCount?: number;
  scanCount?: number;
  scansCount?: number;
  settings?: Record<string, unknown>;
}

export interface ServicePackageSummary {
  id: string;
  name?: string;
  type?: string;
  segment?: string;
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
}

export interface BillingUsageRow {
  key: string;
  label: string;
  used: number;
  limit: number;
  unit: string;
  percent: number | null;
  status: "ok" | "warning" | "exceeded" | "unlimited" | string;
}

export interface PortalBillingPayload {
  generatedAt: string;
  workspace: WorkspaceSummary;
  package: ServicePackageSummary | null;
  subscription: {
    id?: string;
    organizationId?: string;
    packageId?: string;
    status?: string;
    billingCycle?: string;
    source?: string;
    startedAt?: string;
    renewsAt?: string;
    canceledAt?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  usage: Record<string, number | string>;
  quota: Record<string, number>;
  usageRows: BillingUsageRow[];
  currentCharge: {
    packageId?: string;
    amount?: number;
    currency?: string;
    cycle?: string;
    source?: string;
  } | null;
  billingContact: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  invoicePolicy: {
    mode: "manual";
    providerConfigured: false;
    message: string;
  };
}

export interface ApiUser {
  id: string;
  role?: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  avatarFileId?: string | null;
  license?: string;
  hospital?: string;
  clinicName?: string;
  department?: string;
  specialty?: string;
  address?: string;
  twoFactorEnabled?: boolean;
  twoFactorMethod?: string | null;
  twoFactorSecretPreview?: string | null;
  organizationId?: string;
  currentWorkspaceId?: string;
  currentMembership?: WorkspaceMembership | null;
  workspaceMembership?: WorkspaceMembership | null;
  memberships?: WorkspaceMembership[];
  currentWorkspace?: WorkspaceSummary | null;
  workspace?: WorkspaceSummary | null;
  capabilities?: string[];
  allowedSurfaces?: string[];
  defaultSurface?: string;
  accountStatus?: string;
  roleRequestStatus?: string;
  verifiedEmail?: boolean;
  notificationPreferences?: Record<string, boolean>;
  [key: string]: unknown;
}

export const ACCOUNT_PROFILE_MUTATION_FIELDS = [
  "name",
  "title",
  "phone",
  "license",
  "hospital",
  "department",
  "specialty",
  "address",
] as const;

export type AccountProfileMutationField =
  (typeof ACCOUNT_PROFILE_MUTATION_FIELDS)[number];

export type AccountProfilePatch = Partial<
  Record<AccountProfileMutationField, string>
>;

export interface AccountProfileUpdateIntent {
  userId: string;
  patch: AccountProfilePatch;
  idempotencyKey: string;
}

export interface AccountProfileUserSnapshot {
  id: string;
  name: string;
  title: string;
  phone: string;
  license: string;
  hospital: string;
  department: string;
  specialty: string;
  address: string;
  organizationId: string;
  updatedAt: string;
}

export interface AccountProfileUpdateReceipt {
  userId: string;
  intent: "profile_update";
  changedFields: AccountProfileMutationField[];
  user: AccountProfileUserSnapshot;
  replayed: boolean;
}

function accountProfileRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function accountProfileText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function accountProfileError(code: string, message: string, status = 502) {
  return buildApiError({ code, message }, status);
}

function validAccountProfileTimestamp(value: unknown) {
  const text = accountProfileText(value);
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      text,
    ) && Number.isFinite(Date.parse(text))
  );
}

export function assertAccountProfileUpdateIntent(
  intent: AccountProfileUpdateIntent,
) {
  const patch = accountProfileRecord(intent?.patch);
  const keys = patch ? Object.keys(patch).sort() : [];
  const allowed = new Set<string>(ACCOUNT_PROFILE_MUTATION_FIELDS);
  const validPatch =
    patch &&
    keys.length > 0 &&
    keys.every((field) => allowed.has(field)) &&
    keys.every((field) => {
      const value = patch[field];
      const maxLength = field === "address" ? 1000 : 160;
      return (
        typeof value === "string" &&
        value === value.trim() &&
        value.length <= maxLength &&
        (field !== "name" || value.length > 0)
      );
    });
  if (
    !intent?.userId?.trim() ||
    intent.userId.trim().length > 120 ||
    !intent?.idempotencyKey?.trim() ||
    intent.idempotencyKey.trim().length > 160 ||
    !validPatch
  ) {
    throw accountProfileError(
      "ACCOUNT_PROFILE_INTENT_INVALID",
      "Không thể xác định chính xác thay đổi hồ sơ tài khoản cần gửi.",
      400,
    );
  }
  return intent;
}

export function createAccountProfileIdempotencyKey() {
  const randomId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `account-profile-${randomId}`.slice(0, 160);
}

export function accountProfileIntentFingerprint(
  intent: Omit<AccountProfileUpdateIntent, "idempotencyKey">,
) {
  const fields = Object.entries(intent.patch).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify([intent.userId, fields]);
}

export function isAccountProfileIdempotencyCollision(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "IDEMPOTENCY_KEY_REUSED",
  );
}

export function parseAccountProfileUpdateReceipt(
  payload: unknown,
  intent: AccountProfileUpdateIntent,
  currentUserId: string,
): AccountProfileUpdateReceipt {
  assertAccountProfileUpdateIntent(intent);
  const root = accountProfileRecord(payload);
  const user = accountProfileRecord(root?.user);
  const expectedFields = Object.keys(intent.patch).sort();
  const changedFields = Array.isArray(root?.changedFields)
    ? root.changedFields
    : [];
  const ownerValid =
    currentUserId.trim() === intent.userId.trim() &&
    root?.userId === intent.userId &&
    user?.id === intent.userId;
  if (!ownerValid) {
    throw accountProfileError(
      "ACCOUNT_PROFILE_RECEIPT_OWNER_MISMATCH",
      "Biên nhận hồ sơ không thuộc tài khoản hiện tại; dữ liệu chưa được áp dụng.",
    );
  }
  const userKeys = [
    "id",
    "name",
    "title",
    "phone",
    "license",
    "hospital",
    "department",
    "specialty",
    "address",
    "organizationId",
    "updatedAt",
  ] as const;
  const snapshotValid =
    hasExactKeys(user, userKeys) &&
    userKeys
      .filter((field) => field !== "updatedAt")
      .every((field) => typeof user?.[field] === "string") &&
    accountProfileText(user?.id).length <= 120 &&
    accountProfileText(user?.organizationId).length <= 120 &&
    ACCOUNT_PROFILE_MUTATION_FIELDS.every((field) => {
      const maxLength = field === "address" ? 1000 : 160;
      return accountProfileText(user?.[field]).length <= maxLength;
    }) &&
    validAccountProfileTimestamp(user?.updatedAt);
  const receiptValid =
    hasExactKeys(root, [
      "userId",
      "intent",
      "changedFields",
      "user",
      "replayed",
    ]) &&
    root?.intent === "profile_update" &&
    typeof root?.replayed === "boolean" &&
    changedFields.length === expectedFields.length &&
    changedFields.every((field) => typeof field === "string") &&
    JSON.stringify(changedFields) === JSON.stringify(expectedFields) &&
    new Set(changedFields).size === changedFields.length &&
    snapshotValid &&
    expectedFields.every(
      (field) =>
        user?.[field] === intent.patch[field as AccountProfileMutationField],
    );
  if (!receiptValid) {
    throw accountProfileError(
      "ACCOUNT_PROFILE_RECEIPT_INVALID",
      "Backend chưa trả biên nhận hồ sơ chính xác; thao tác chưa được báo thành công.",
    );
  }
  return payload as AccountProfileUpdateReceipt;
}

export interface PasswordChangeReceipt {
  ok: true;
  user: {
    id: string;
  };
  provider: "firebase" | "demo";
  operationId: string;
  replayed: boolean;
}

export function parsePasswordChangeReceipt(
  payload: unknown,
): PasswordChangeReceipt {
  const receipt =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const user =
    receipt?.user &&
    typeof receipt.user === "object" &&
    !Array.isArray(receipt.user)
      ? (receipt.user as Record<string, unknown>)
      : null;
  const rootKeys = receipt ? Object.keys(receipt).sort() : [];
  const userKeys = user ? Object.keys(user).sort() : [];
  const exactRoot =
    receipt !== null &&
    rootKeys.length === 5 &&
    rootKeys.join("|") === "ok|operationId|provider|replayed|user";
  const exactUser =
    user !== null && userKeys.length === 1 && userKeys[0] === "id";

  if (
    !exactRoot ||
    !exactUser ||
    receipt?.ok !== true ||
    (receipt.provider !== "firebase" && receipt.provider !== "demo") ||
    typeof receipt.operationId !== "string" ||
    receipt.operationId.length === 0 ||
    receipt.operationId.length > 160 ||
    receipt.operationId !== receipt.operationId.trim() ||
    typeof receipt.replayed !== "boolean" ||
    typeof user?.id !== "string" ||
    user.id.length === 0 ||
    user.id.length > 120 ||
    user.id !== user.id.trim()
  ) {
    throw buildApiError(
      {
        code: "PASSWORD_CHANGE_RESPONSE_INVALID",
        message:
          "Backend trả về biên nhận đổi mật khẩu không đầy đủ hoặc không đúng contract.",
      },
      502,
    );
  }

  return payload as PasswordChangeReceipt;
}

export interface PortalStaffResponse {
  workspaceId: string;
  generatedAt: string;
  staff: ApiUser[];
  doctors: ApiUser[];
}

export type NotificationPreferenceKey =
  | "enabled"
  | "doctorRequests"
  | "abnormalResults"
  | "deviceOffline"
  | "appointments"
  | "messages"
  | "aiUpdates"
  | "newLogin";

export type NotificationCloudPreferences = Record<
  NotificationPreferenceKey,
  boolean
>;

export interface NotificationChannelAvailability {
  available: boolean;
  status: "ready" | "disabled" | "unavailable" | string;
  reasonCode: string;
}

export interface NotificationPreferencesResponse {
  userId: string;
  workspaceId: string | null;
  ownership: {
    kind: "self";
    userId: string;
  };
  preferences: NotificationCloudPreferences;
  channels: {
    inApp: NotificationChannelAvailability;
    email: NotificationChannelAvailability;
    push: NotificationChannelAvailability;
  };
  updatedAt: string;
  replayed: boolean;
}

export interface Patient {
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
  doctorName?: string;
  scanCount?: number;
  lastScanAt?: string | null;
  lastAiLabel?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type PatientImportStatus =
  | "validated"
  | "invalid"
  | "committed"
  | "expired";

export interface PatientImportIssue {
  field: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface PatientImportRow {
  rowNumber: number;
  status: "valid" | "invalid";
  issues: PatientImportIssue[];
  patient: Partial<Patient>;
}

export interface PatientImportBatch {
  id: string;
  organizationId: string;
  fileName: string;
  fileSizeBytes: number;
  status: PatientImportStatus;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  importedCount: number;
  patientIds: string[];
  rows: PatientImportRow[];
  version: number;
  expiresAt: string;
  committedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  organizationId?: string;
  patientId?: string;
  doctorUserId?: string;
  createdByUserId?: string;
  type?:
    | "remote_consultation"
    | "clinic_visit"
    | "measurement"
    | "follow_up"
    | string;
  status?:
    | "scheduled"
    | "confirmed"
    | "completed"
    | "cancelled"
    | "no_show"
    | string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  channel?: string;
  reason?: string;
  notes?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  patient?: Pick<
    Patient,
    "id" | "patientCode" | "name" | "organizationId"
  > | null;
  doctor?: Pick<ApiUser, "id" | "name" | "email" | "specialty"> | null;
}

export interface Scan {
  id: string;
  organizationId?: string;
  patientId?: string;
  patient?: Patient;
  status?: string;
  mode?: string;
  bodySite?: string;
  deviceId?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  bpm?: number;
  aiLabel?: string;
  aiConfidence?: number | null;
  aiSummary?: string;
  doctorNotes?: string;
  audioUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type DeviceCommandState =
  | "accepted"
  | "queued"
  | "delivered"
  | "acknowledged"
  | "applying"
  | "applied"
  | "failed"
  | "expired";

export type DeviceCommandType =
  | "restart"
  | "wifi.status"
  | "device.lock"
  | "device.revoke"
  | "wifi.update"
  | "ota.update"
  | "audio.session.start"
  | "audio.session.stop";

export interface DeviceCommandDelivery {
  websocket: boolean;
  mqtt: boolean;
  delivered: boolean;
}

export interface DeviceCommand {
  protocolVersion: 1;
  id: string;
  deviceId: string;
  organizationId?: string;
  type: DeviceCommandType;
  correlationId: string;
  state: DeviceCommandState;
  status?: DeviceCommandState;
  code?: string;
  detail?: string;
  requestedByUserId?: string;
  issuedAt: string;
  expiresAt: string;
  acceptedAt?: string;
  queuedAt?: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  applyingAt?: string;
  appliedAt?: string;
  failedAt?: string;
  expiredAt?: string;
  delivery: DeviceCommandDelivery;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeviceCommandResponse {
  device?: Device;
  command: DeviceCommand;
  delivery?: DeviceCommandDelivery;
  responseStatus?: number;
  idempotent?: boolean;
}

export interface DeviceTelemetry {
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
}

export interface Device {
  id: string;
  name?: string;
  status?: string;
  connected?: boolean;
  online?: boolean;
  battery?: number;
  pairedUserId?: string | null;
  assignedPatientId?: string;
  organizationId?: string;
  firmwareVersion?: string;
  wifiRssi?: number;
  wifiSsid?: string;
  ipAddress?: string;
  audioStatus?: string;
  telemetry?: DeviceTelemetry;
  lastCommand?: DeviceCommand | null;
  lastSeenAt?: string;
  updatedAt?: string;
}

export type DevicePairingPresence = "awaiting_online" | "online";

export interface DevicePairingState {
  outcome: "accepted" | "success";
  presence: DevicePairingPresence;
  onlineConfirmed: boolean;
  authenticatedTransport?: "wss" | null;
}

export interface DevicePairingResponse {
  device: Device;
  pairing: DevicePairingState;
  idempotent?: boolean;
}

export interface Notification {
  id: string;
  userId?: string;
  workspaceId?: string;
  organizationId?: string;
  type?: string;
  title?: string;
  message?: string;
  campaignId?: string;
  audienceType?: "workspace" | "role" | "users" | "direct" | "legacy";
  audienceRole?: string;
  requestedChannels?: Array<"in_app" | "email" | "push">;
  inAppStatus?: string;
  emailStatus?: string;
  pushStatus?: string;
  read?: boolean;
  readAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationInboxItem extends Notification {
  userId: string;
  workspaceId: string;
  organizationId: string;
  type: string;
  title: string;
  message: string;
  campaignId: string;
  audienceType: "workspace" | "role" | "users" | "direct" | "legacy";
  audienceRole: string;
  requestedChannels: Array<"in_app" | "email" | "push">;
  inAppStatus: string;
  emailStatus: string;
  pushStatus: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationInboxResponse {
  userId: string;
  workspaceId: string;
  notifications: NotificationInboxItem[];
  updatedAt: string;
}

export type NotificationInboxAction = "read" | "read_all" | "delete";

export interface NotificationInboxMutationResponse {
  userId: string;
  workspaceId: string;
  action: NotificationInboxAction;
  notification: NotificationInboxItem | null;
  notifications: NotificationInboxItem[];
  affectedIds: string[];
  deletedId: string | null;
  updatedAt: string;
  replayed: boolean;
}

export type AuditLogOutcome =
  | "success"
  | "failure"
  | "warning"
  | "denied"
  | "recorded";

export interface AuditLog {
  id: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  workspaceId?: string;
  organizationId: string;
  organizationName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: AuditLogOutcome;
  ip: string;
  userAgent: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** @deprecated Use AuditLog. Kept during the /access-logs compatibility window. */
export type AccessLog = AuditLog;

export type AuditLogSort = "createdAt:asc" | "createdAt:desc";

export interface AuditLogQuery {
  q?: string;
  action?: string;
  resourceType?: string;
  actorUserId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sort?: AuditLogSort;
}

export interface AuditLogPagination extends PageMetadata {
  pageCount: number;
  sort: AuditLogSort;
}

export interface AuditLogPage {
  logs: AuditLog[];
  pagination: AuditLogPagination;
}

export type ExportFormat = "json" | "csv" | "xlsx" | "pdf";
export type ExportDataset = "clinical_bundle" | "audit_logs";

export interface ExportFilters {
  q?: string;
  action?: string;
  resourceType?: string;
  actorUserId?: string;
  startDate?: string;
  endDate?: string;
  sort?: AuditLogSort;
}

export interface ExportJob {
  id: string;
  organizationId: string;
  workspaceId?: string;
  createdByUserId: string;
  format: ExportFormat;
  dataset: ExportDataset;
  scopeKind:
    | "platform"
    | "workspace"
    | "assigned_patients"
    | "personal"
    | string;
  filters?: ExportFilters;
  rendererVersion: string;
  status: "pending" | "ready" | "failed" | string;
  includeAudio?: boolean;
  includeReports?: boolean;
  includeHistory?: boolean;
  startDate?: string;
  endDate?: string;
  recordCount: number;
  downloadUrl: string;
  artifactByteSize?: number;
  artifactSha256?: string;
  downloadedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateExportInput {
  format: ExportFormat;
  dataset: ExportDataset;
  filters?: ExportFilters;
  includeAudio?: boolean;
  includeReports?: boolean;
  includeHistory?: boolean;
}

export interface ExportListQuery {
  format?: ExportFormat;
  dataset?: ExportDataset;
  status?: string;
  page?: number;
  limit?: number;
  sort?: "createdAt:asc" | "createdAt:desc";
}

export interface ExportPage {
  exports: ExportJob[];
  pagination: PageMetadata & {
    pageCount: number;
    sort: "createdAt:asc" | "createdAt:desc";
  };
}

export interface ExportDownload {
  blob: Blob;
  fileName: string;
  contentType: string;
  artifactSha256: string;
  rendererVersion: string;
}

export interface AuthSession {
  id: string;
  provider?: string;
  current?: boolean;
  revokedAt?: string | null;
  createdAt?: string;
  lastSeenAt?: string;
  ip?: string;
  userAgent?: string;
  deviceLabel?: string;
  [key: string]: unknown;
}

export interface PatientMutationAuthority {
  expectedUserId: string;
  expectedWorkspaceId: string;
  expectedAuthSessionId: string;
  authSessionEpoch: number;
}

function patientMutationAuthorityHeaders(
  authority?: PatientMutationAuthority,
): Record<string, string> {
  if (!authority) return {};
  if (
    !Number.isSafeInteger(authority.authSessionEpoch) ||
    authority.authSessionEpoch < 0
  ) {
    throw buildApiError(
      {
        code: "PATIENT_MUTATION_AUTHORITY_INVALID",
        message: "Mốc phiên đăng nhập của thao tác hồ sơ không hợp lệ.",
      },
      409,
    );
  }
  if (getAuthSessionEpochSnapshot() !== authority.authSessionEpoch) {
    throw buildApiError(
      {
        code: "AUTH_SESSION_REPLACED",
        message: "Phiên đăng nhập đã thay đổi trước khi gửi thao tác hồ sơ.",
      },
      409,
    );
  }
  const values = [
    authority.expectedUserId,
    authority.expectedWorkspaceId,
    authority.expectedAuthSessionId,
  ];
  if (
    values.some(
      (value) =>
        !value || value !== value.trim() || value.length > 160 || value.includes(","),
    )
  ) {
    throw buildApiError(
      {
        code: "PATIENT_MUTATION_AUTHORITY_INVALID",
        message: "Phiên tài khoản hoặc workspace của thao tác hồ sơ không hợp lệ.",
      },
      409,
    );
  }
  return {
    "X-Shcare-Expected-User-Id": authority.expectedUserId,
    "X-Shcare-Expected-Workspace-Id": authority.expectedWorkspaceId,
    "X-Shcare-Expected-Auth-Session-Id": authority.expectedAuthSessionId,
  };
}

function avatarMutationAuthorityHeaders(
  authority: AvatarMutationAuthority,
): Record<string, string> {
  const values = [
    authority.userId,
    authority.workspaceId,
    authority.authSessionId,
    authority.bearerToken,
  ];
  if (
    !Number.isSafeInteger(authority.authSessionEpoch) ||
    authority.authSessionEpoch < 0 ||
    values.some(
      (value) =>
        !value ||
        value !== value.trim() ||
        value.length > 4096 ||
        value.includes(","),
    )
  ) {
    throw buildApiError(
      {
        code: "AVATAR_MUTATION_AUTHORITY_INVALID",
        message:
          "Không thể xác định chính xác tài khoản, workspace hoặc phiên đăng nhập của thao tác ảnh đại diện.",
      },
      409,
    );
  }
  if (
    authority.userId.length > 160 ||
    authority.workspaceId.length > 160 ||
    authority.authSessionId.length > 160
  ) {
    throw buildApiError(
      {
        code: "AVATAR_MUTATION_AUTHORITY_INVALID",
        message:
          "Định danh tài khoản, workspace hoặc phiên đăng nhập của thao tác ảnh đại diện không hợp lệ.",
      },
      409,
    );
  }
  if (
    getAuthSessionEpochSnapshot() !== authority.authSessionEpoch ||
    getToken() !== authority.bearerToken
  ) {
    throw buildApiError(
      {
        code: "AUTH_SESSION_REPLACED",
        message:
          "Phiên đăng nhập đã thay đổi; kết quả thao tác ảnh đại diện cũ đã bị loại bỏ.",
      },
      409,
    );
  }
  return {
    "X-Shcare-Expected-User-Id": authority.userId,
    "X-Shcare-Expected-Workspace-Id": authority.workspaceId,
    "X-Shcare-Expected-Auth-Session-Id": authority.authSessionId,
  };
}

function assertAvatarAuthSessionSnapshot(
  authSessionEpoch: number,
  bearerToken: string,
  message: string,
) {
  if (
    getAuthSessionEpochSnapshot() !== authSessionEpoch ||
    getToken() !== bearerToken
  ) {
    throw buildApiError(
      {
        code: "AUTH_SESSION_REPLACED",
        message,
      },
      409,
    );
  }
}

export interface ShareTarget {
  id: string;
  name?: string;
  email?: string;
  specialty?: string;
  organizationId?: string;
  clinicName?: string;
  type?: string;
  address?: string;
}

export type PatientShareAuthorityType =
  | "patient_consent"
  | "clinician_access_grant"
  | "administrative_assignment";

export type PatientShareStatus = "active" | "revoked" | "expired";

export interface PatientShareRecipient {
  id: string;
  type: "doctor" | "workspace";
  name: string;
  workspaceId: string;
  email?: string;
  specialty?: string;
  workspaceType?: string;
}

export interface PatientShareActor {
  id: string;
  name: string;
  role: string;
}

export interface PatientShareAuditMetadata {
  grantedByUserId: string;
  grantedAt: string;
  revokedByUserId: string;
  revokedAt: string;
  updatedAt?: string;
}

export type CreatePatientSharePayload = (
  | { doctorUserId: string; organizationId?: never }
  | { organizationId: string; doctorUserId?: never }
) & {
  scope: "patient_profile" | "selected_scans";
  scanIds?: string[];
  expiresAt?: string;
};

export interface PatientShare {
  id: string;
  patientId: string;
  doctorUserId?: string;
  doctorId?: string;
  organizationId?: string;
  scope: "patient_profile" | "selected_scans";
  scanIds: string[];
  expiresAt?: string;
  accessLevel: "read";
  purpose: string;
  consentedAt: string;
  active: boolean;
  authorityType: PatientShareAuthorityType;
  status: PatientShareStatus;
  recipient: PatientShareRecipient;
  recipientId?: string;
  recipientType?: "doctor" | "workspace" | string;
  recipientName?: string;
  recipientEmail?: string;
  grantedByUserId?: string;
  revokedByUserId?: string;
  grantedByActor?: PatientShareActor | null;
  revokedByActor?: PatientShareActor | null;
  audit: PatientShareAuditMetadata;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export type OverviewRangeKey = "today" | "7d" | "30d";

export interface OverviewQuery {
  range: OverviewRangeKey;
  timezoneOffsetMinutes: number;
}

export interface OverviewPayload {
  generatedAt: string;
  workspaceId: string;
  range: {
    key: OverviewRangeKey;
    label: string;
    startAt: string;
    endAt: string;
    timezoneOffsetMinutes: number;
    bucket: "4h" | "day";
  };
  stats: {
    clinics: number;
    workspaces: number;
    patientsCount: number;
    pendingDoctors: number;
    devicesCount: number;
    devicesOnline: number;
    scansCount: number;
    aiJobsFailed: number;
    storageBytes: number;
    storageUsed: string;
  };
  measureData: Array<{ time: string; day?: string; count: number }>;
  deviceData: Array<{
    key: "online" | "offline";
    name: string;
    value: number;
    color: string;
  }>;
  aiJobData: Array<{
    key: "processing" | "completed" | "failed" | "pending";
    name: string;
    value: number;
    color: string;
  }>;
}

export type SupportTicketType =
  | "device_connection"
  | "measurement_missing"
  | "account_access"
  | "interface_issue"
  | "other";

export interface SupportTicketCreateInput {
  type: SupportTicketType;
  description: string;
}

export interface SupportTicketReceipt {
  id: string;
  workspaceId: string;
  requesterUserId: string;
  type: SupportTicketType;
  status: "open";
  createdAt: string;
}

export interface SupportTicketCreateResponse {
  ticket: SupportTicketReceipt;
  replayed: boolean;
}

export interface SupportTicketReceiptExpectation {
  workspaceId: string;
  requesterUserId: string;
}

export interface PortalStatusPayload {
  ok: boolean;
  service: string;
  now: string;
  workspace: {
    id: string;
    name: string;
    type: string;
  };
  scoped: {
    patientsCount: number;
    devicesCount: number;
    devicesOnline: number;
    scansCount: number;
    alertsCount: number;
  };
  status: {
    workspaceId: string;
    devicesCount: number;
    devicesOnline: number;
    recording: boolean;
    activeScanId: string | null;
    updatedAt: string;
  };
}

const API_BASE = (
  import.meta.env.VITE_SMART_HEALTH_API_BASE_URL || "http://localhost:3000/api"
).replace(/\/+$/, "");
const TOKEN_KEY = "smart_health_token";
const TWO_FACTOR_TOKEN_KEY = "shcare_two_factor_token";
let observedPrimaryToken: string | undefined;
let primaryAuthSessionEpoch = 0;

function observePrimaryToken(token: string) {
  if (observedPrimaryToken === undefined) {
    observedPrimaryToken = token;
  } else if (observedPrimaryToken !== token) {
    observedPrimaryToken = token;
    primaryAuthSessionEpoch += 1;
  }
  return token;
}

function getToken() {
  const token =
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(TOKEN_KEY) || "";
  return observePrimaryToken(token);
}

function setToken(token: string) {
  if (typeof window === "undefined") return;
  const previousToken = getToken();
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
  if (token !== previousToken) {
    observedPrimaryToken = token;
    primaryAuthSessionEpoch += 1;
  }
}

function getAuthSessionEpochSnapshot() {
  getToken();
  return primaryAuthSessionEpoch;
}

function assertCurrentTwoFactorAuthSession(expectedEpoch: number) {
  if (getAuthSessionEpochSnapshot() !== expectedEpoch) {
    throw new TwoFactorEnrollmentContractError(
      "Phiên xác thực chính đã thay đổi; kết quả 2FA cũ đã bị loại bỏ.",
    );
  }
}

function clearTokenIfMatches(expectedToken: string) {
  if (!expectedToken || getToken() !== expectedToken) return false;
  setToken("");
  setTwoFactorToken("");
  return true;
}

function getTwoFactorToken() {
  return typeof window === "undefined"
    ? ""
    : window.sessionStorage.getItem(TWO_FACTOR_TOKEN_KEY) || "";
}

function setTwoFactorToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem(TWO_FACTOR_TOKEN_KEY, token);
  else window.sessionStorage.removeItem(TWO_FACTOR_TOKEN_KEY);
}

function clearTwoFactorTokenIfMatches(expectedToken: string) {
  if (!expectedToken || getTwoFactorToken() !== expectedToken) return false;
  setTwoFactorToken("");
  return true;
}

function nestedError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const direct = payload as Record<string, unknown>;
  const nested = direct.error;
  if (nested && typeof nested === "object") {
    return { ...direct, ...(nested as Record<string, unknown>) };
  }
  return direct;
}

function apiErrorCode(payload: unknown) {
  const parsed = nestedError(payload);
  return typeof parsed?.code === "string" ? parsed.code : "";
}

function isTwoFactorAuthCode(code: string) {
  return code === "TWO_FACTOR_REQUIRED" || code.startsWith("TWO_FACTOR_TOKEN_");
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path.replace(/^\/+/, ""), `${API_BASE}/`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function errorMessage(payload: unknown, status: number) {
  const parsed = nestedError(payload);
  if (typeof parsed?.message === "string") return parsed.message;
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string") return value;
  }
  return `Yêu cầu backend thất bại (${status}).`;
}

function buildApiError(payload: unknown, status: number) {
  const parsed = nestedError(payload);
  const error = new Error(errorMessage(payload, status)) as ApiError;
  error.status = status;
  error.code = typeof parsed?.code === "string" ? parsed.code : "";
  error.details = parsed?.details;
  error.requestId =
    typeof parsed?.requestId === "string" ? parsed.requestId : undefined;
  error.payload = payload;
  const details =
    parsed?.details &&
    typeof parsed.details === "object" &&
    !Array.isArray(parsed.details)
      ? (parsed.details as Record<string, unknown>)
      : {};
  const root =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const candidate = details.fieldErrors ?? root.fieldErrors;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const fieldErrors = Object.fromEntries(
      Object.entries(candidate as Record<string, unknown>).flatMap(
        ([field, value]) => (typeof value === "string" ? [[field, value]] : []),
      ),
    );
    if (Object.keys(fieldErrors).length > 0) error.fieldErrors = fieldErrors;
  }
  return error;
}

const supportTicketTypes = new Set<SupportTicketType>([
  "device_connection",
  "measurement_missing",
  "account_access",
  "interface_issue",
  "other",
]);

function supportTicketRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function supportTicketText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function supportTicketContractError(code: string, message: string) {
  return buildApiError({ code, message }, 502);
}

export function parseSupportTicketCreateResponse(
  payload: unknown,
  expected: SupportTicketReceiptExpectation,
): SupportTicketCreateResponse {
  const root = supportTicketRecord(payload);
  const ticket = supportTicketRecord(root?.ticket);
  const workspaceId = supportTicketText(ticket?.workspaceId);
  const requesterUserId = supportTicketText(ticket?.requesterUserId);
  const expectedWorkspaceId = expected.workspaceId.trim();
  const expectedRequesterUserId = expected.requesterUserId.trim();
  if (
    !expectedWorkspaceId ||
    !expectedRequesterUserId ||
    workspaceId !== expectedWorkspaceId ||
    requesterUserId !== expectedRequesterUserId
  ) {
    throw supportTicketContractError(
      "SUPPORT_TICKET_RECEIPT_OWNER_MISMATCH",
      "Backend trả về biên nhận hỗ trợ không thuộc tài khoản hoặc workspace hiện tại.",
    );
  }

  const rootKeys = ["ticket", "replayed"] as const;
  const ticketKeys = [
    "id",
    "workspaceId",
    "requesterUserId",
    "type",
    "status",
    "createdAt",
  ] as const;
  const id = supportTicketText(ticket?.id);
  const type = supportTicketText(ticket?.type) as SupportTicketType;
  const createdAt = supportTicketText(ticket?.createdAt);
  const rootIsExact =
    root !== null &&
    rootKeys.every((key) => Object.hasOwn(root, key)) &&
    Object.keys(root).every((key) =>
      (rootKeys as readonly string[]).includes(key),
    );
  const ticketIsExact =
    ticket !== null &&
    ticketKeys.every((key) => Object.hasOwn(ticket, key)) &&
    Object.keys(ticket).every((key) =>
      (ticketKeys as readonly string[]).includes(key),
    );
  const valid =
    rootIsExact &&
    ticketIsExact &&
    id.length > 0 &&
    id.length <= 160 &&
    supportTicketTypes.has(type) &&
    ticket?.status === "open" &&
    Boolean(createdAt) &&
    Number.isFinite(Date.parse(createdAt)) &&
    typeof root?.replayed === "boolean";

  if (!valid) {
    throw supportTicketContractError(
      "SUPPORT_TICKET_RECEIPT_INVALID",
      "Backend chưa trả về biên nhận hỗ trợ đầy đủ. Yêu cầu chưa được báo thành công.",
    );
  }
  return payload as SupportTicketCreateResponse;
}

function billingRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function billingText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isNonNegativeFinite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function billingContractError(code: string, message: string) {
  return buildApiError({ code, message }, 502);
}

function parsePortalBillingResponse(
  payload: unknown,
  expectedWorkspaceId: string,
): PortalBillingPayload {
  const root = billingRecord(payload);
  const workspace = billingRecord(root?.workspace);
  const subscription = billingRecord(root?.subscription);
  const servicePackage =
    root?.package === null ? null : billingRecord(root?.package);
  const usage = billingRecord(root?.usage);
  const quota = billingRecord(root?.quota);
  const billingContact = billingRecord(root?.billingContact);
  const invoicePolicy = billingRecord(root?.invoicePolicy);
  const currentCharge =
    root?.currentCharge === null ? null : billingRecord(root?.currentCharge);
  const workspaceId = billingText(workspace?.id);
  const subscriptionWorkspaceId = billingText(subscription?.organizationId);
  const expectedId = expectedWorkspaceId.trim();

  if (
    !expectedId ||
    workspaceId !== expectedId ||
    subscriptionWorkspaceId !== expectedId
  ) {
    throw billingContractError(
      "BILLING_RESPONSE_WORKSPACE_MISMATCH",
      "Backend trả về thông tin gói không thuộc workspace hiện tại. Dữ liệu chưa được hiển thị.",
    );
  }

  const topLevelKeys = new Set([
    "generatedAt",
    "workspace",
    "package",
    "subscription",
    "usage",
    "quota",
    "usageRows",
    "currentCharge",
    "billingContact",
    "invoicePolicy",
  ]);
  const requiredTopLevelKeys = [...topLevelKeys];
  const generatedAt = billingText(root?.generatedAt);
  const rows = root?.usageRows;
  const numericUsageKeys = [
    "doctors",
    "patients",
    "devices",
    "aiMonthly",
    "storageGb",
  ];
  const quotaKeys = [
    "maxDoctors",
    "maxPatients",
    "maxDevices",
    "storageGb",
    "aiMonthly",
    "retentionDays",
  ];

  const invalidTopLevel =
    !root ||
    Object.keys(root).some((key) => !topLevelKeys.has(key)) ||
    requiredTopLevelKeys.some((key) => !Object.hasOwn(root, key));
  const invalidUsage =
    !usage ||
    numericUsageKeys.some((key) => !isNonNegativeFinite(usage[key])) ||
    usage.storageMetric !== "total_storage";
  const invalidQuota =
    !quota || quotaKeys.some((key) => !isNonNegativeFinite(quota[key]));
  const invalidRows =
    !Array.isArray(rows) ||
    rows.length > 20 ||
    new Set(rows.map((row) => billingText(billingRecord(row)?.key))).size !==
      rows.length ||
    rows.some((candidate) => {
      const row = billingRecord(candidate);
      const key = billingText(row?.key);
      const label = billingText(row?.label);
      const unit = billingText(row?.unit);
      const used = row?.used;
      const limit = row?.limit;
      const percent = row?.percent;
      const status = billingText(row?.status);
      if (
        !key ||
        !label ||
        !unit ||
        !isNonNegativeFinite(used) ||
        !isNonNegativeFinite(limit)
      ) {
        return true;
      }
      const expectedPercent =
        Number(limit) > 0
          ? Math.min(100, Math.round((Number(used) / Number(limit)) * 100))
          : null;
      const expectedStatus =
        expectedPercent === null
          ? "unlimited"
          : expectedPercent >= 100
            ? "exceeded"
            : expectedPercent >= 80
              ? "warning"
              : "ok";
      return percent !== expectedPercent || status !== expectedStatus;
    });
  const invalidPackage =
    servicePackage !== null &&
    (!billingText(servicePackage?.id) ||
      !billingText(servicePackage?.name) ||
      !isNonNegativeFinite(servicePackage?.price) ||
      billingText(servicePackage?.currency).length !== 3 ||
      !billingText(servicePackage?.duration) ||
      !billingRecord(servicePackage?.features));
  const invalidCurrentCharge =
    currentCharge !== null &&
    (!billingText(currentCharge?.packageId) ||
      !isNonNegativeFinite(currentCharge?.amount) ||
      billingText(currentCharge?.currency).length !== 3 ||
      !billingText(currentCharge?.cycle) ||
      currentCharge?.source !== "service_package" ||
      (servicePackage !== null &&
        currentCharge?.packageId !== servicePackage?.id));
  const invalidSubscription =
    !subscription ||
    !billingText(subscription.status) ||
    !billingText(subscription.billingCycle) ||
    !["subscription", "workspace"].includes(billingText(subscription.source));
  const invalidContact =
    !billingContact ||
    ["name", "email", "phone", "address"].some(
      (key) => typeof billingContact[key] !== "string",
    );
  const invalidInvoicePolicy =
    !invoicePolicy ||
    invoicePolicy.mode !== "manual" ||
    invoicePolicy.providerConfigured !== false ||
    !billingText(invoicePolicy.message);

  if (
    invalidTopLevel ||
    !generatedAt ||
    Number.isNaN(Date.parse(generatedAt)) ||
    !billingText(workspace?.name) ||
    invalidUsage ||
    invalidQuota ||
    invalidRows ||
    invalidPackage ||
    invalidCurrentCharge ||
    invalidSubscription ||
    invalidContact ||
    invalidInvoicePolicy
  ) {
    throw billingContractError(
      "BILLING_RESPONSE_INVALID",
      "Backend trả về thông tin gói chưa đầy đủ hoặc chứa trạng thái thanh toán không được hỗ trợ. Dữ liệu chưa được hiển thị.",
    );
  }

  return payload as PortalBillingPayload;
}

function overviewRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function overviewText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isOverviewCount(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

function hasExactKeys(
  record: Record<string, unknown> | null,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  if (!record) return false;
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record).every((key) => allowed.has(key))
  );
}

function overviewContractError(code: string, message: string) {
  return buildApiError({ code, message }, 502);
}

function parsePortalOverviewResponse(
  payload: unknown,
  expectedWorkspaceId: string,
  expectedQuery: OverviewQuery,
): OverviewPayload {
  const root = overviewRecord(payload);
  const workspaceId = overviewText(root?.workspaceId);
  const expectedId = expectedWorkspaceId.trim();
  if (!expectedId || workspaceId !== expectedId) {
    throw overviewContractError(
      "OVERVIEW_RESPONSE_WORKSPACE_MISMATCH",
      "Backend trả về tổng quan không thuộc workspace hiện tại. Dữ liệu chưa được hiển thị.",
    );
  }

  const rootKeys = [
    "generatedAt",
    "workspaceId",
    "range",
    "stats",
    "measureData",
    "deviceData",
    "aiJobData",
  ] as const;
  const rangeKeys = [
    "key",
    "label",
    "startAt",
    "endAt",
    "timezoneOffsetMinutes",
    "bucket",
  ] as const;
  const statKeys = [
    "clinics",
    "workspaces",
    "patientsCount",
    "pendingDoctors",
    "devicesCount",
    "devicesOnline",
    "scansCount",
    "aiJobsFailed",
    "storageBytes",
    "storageUsed",
  ] as const;
  const rootIsExact = hasExactKeys(root, rootKeys);
  const range = overviewRecord(root?.range);
  const stats = overviewRecord(root?.stats);
  const generatedAt = overviewText(root?.generatedAt);
  const rangeStart = overviewText(range?.startAt);
  const rangeEnd = overviewText(range?.endAt);
  const rangeKey = overviewText(range?.key);
  const rangeBucket = overviewText(range?.bucket);
  const timezoneOffsetMinutes = range?.timezoneOffsetMinutes;
  const validRange =
    hasExactKeys(range, rangeKeys) &&
    rangeKey === expectedQuery.range &&
    overviewText(range?.label).length > 0 &&
    Number.isFinite(Date.parse(rangeStart)) &&
    Number.isFinite(Date.parse(rangeEnd)) &&
    Date.parse(rangeStart) <= Date.parse(rangeEnd) &&
    Number.isInteger(timezoneOffsetMinutes) &&
    Number(timezoneOffsetMinutes) >= -720 &&
    Number(timezoneOffsetMinutes) <= 840 &&
    timezoneOffsetMinutes === expectedQuery.timezoneOffsetMinutes &&
    rangeBucket === (rangeKey === "today" ? "4h" : "day");
  const validStats =
    hasExactKeys(stats, statKeys) &&
    statKeys
      .filter((key) => key !== "storageUsed")
      .every((key) =>
        key === "storageBytes"
          ? isNonNegativeFinite(stats?.[key])
          : isOverviewCount(stats?.[key]),
      ) &&
    overviewText(stats?.storageUsed).length > 0 &&
    Number(stats?.devicesOnline) <= Number(stats?.devicesCount);

  const measureData = root?.measureData;
  const validMeasureData =
    Array.isArray(measureData) &&
    measureData.length >= 1 &&
    measureData.length <= 30 &&
    measureData.every((candidate) => {
      const point = overviewRecord(candidate);
      return (
        hasExactKeys(point, ["time", "count"], ["day"]) &&
        overviewText(point?.time).length > 0 &&
        isOverviewCount(point?.count) &&
        (!Object.hasOwn(point || {}, "day") ||
          /^\d{4}-\d{2}-\d{2}$/.test(overviewText(point?.day)))
      );
    }) &&
    measureData.reduce(
      (sum, candidate) => sum + Number(overviewRecord(candidate)?.count || 0),
      0,
    ) === Number(stats?.scansCount);

  const deviceData = root?.deviceData;
  const expectedDeviceKeys = new Set(["online", "offline"]);
  const validDeviceData =
    Array.isArray(deviceData) &&
    deviceData.length === expectedDeviceKeys.size &&
    new Set(
      deviceData.map((candidate) =>
        overviewText(overviewRecord(candidate)?.key),
      ),
    ).size === expectedDeviceKeys.size &&
    deviceData.every((candidate) => {
      const point = overviewRecord(candidate);
      return (
        hasExactKeys(point, ["key", "name", "value", "color"]) &&
        expectedDeviceKeys.has(overviewText(point?.key)) &&
        overviewText(point?.name).length > 0 &&
        isOverviewCount(point?.value) &&
        /^#[0-9a-f]{6}$/i.test(overviewText(point?.color))
      );
    }) &&
    deviceData.reduce(
      (sum, candidate) => sum + Number(overviewRecord(candidate)?.value || 0),
      0,
    ) === Number(stats?.devicesCount) &&
    Number(
      overviewRecord(
        deviceData.find(
          (candidate) =>
            overviewText(overviewRecord(candidate)?.key) === "online",
        ),
      )?.value,
    ) === Number(stats?.devicesOnline);

  const aiJobData = root?.aiJobData;
  const expectedAiKeys = new Set([
    "processing",
    "completed",
    "failed",
    "pending",
  ]);
  const validAiJobData =
    Array.isArray(aiJobData) &&
    aiJobData.length === expectedAiKeys.size &&
    new Set(
      aiJobData.map((candidate) =>
        overviewText(overviewRecord(candidate)?.key),
      ),
    ).size === expectedAiKeys.size &&
    aiJobData.every((candidate) => {
      const point = overviewRecord(candidate);
      return (
        hasExactKeys(point, ["key", "name", "value", "color"]) &&
        expectedAiKeys.has(overviewText(point?.key)) &&
        overviewText(point?.name).length > 0 &&
        isOverviewCount(point?.value) &&
        /^#[0-9a-f]{6}$/i.test(overviewText(point?.color))
      );
    }) &&
    aiJobData.reduce(
      (sum, candidate) => sum + Number(overviewRecord(candidate)?.value || 0),
      0,
    ) === Number(stats?.scansCount) &&
    Number(
      overviewRecord(
        aiJobData.find(
          (candidate) =>
            overviewText(overviewRecord(candidate)?.key) === "failed",
        ),
      )?.value,
    ) === Number(stats?.aiJobsFailed);

  if (
    !rootIsExact ||
    !generatedAt ||
    !Number.isFinite(Date.parse(generatedAt)) ||
    !validRange ||
    !validStats ||
    !validMeasureData ||
    !validDeviceData ||
    !validAiJobData
  ) {
    throw overviewContractError(
      "OVERVIEW_RESPONSE_INVALID",
      "Backend trả về tổng quan thiếu dữ liệu đo được hoặc có KPI mâu thuẫn. Dữ liệu chưa được hiển thị.",
    );
  }

  return payload as OverviewPayload;
}

async function requestWithResponse<T>(
  path: string,
  init: RequestInit & { query?: Record<string, QueryValue> } = {},
) {
  const { query, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const twoFactorToken = getTwoFactorToken();
  if (twoFactorToken) headers.set("X-Shcare-2FA-Token", twoFactorToken);
  headers.set("X-Smart-Health-Surface", "portal");
  headers.set("X-Smart-Health-Client", "web");
  if (typeof requestInit.body === "string" && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { ...requestInit, headers });
  } catch {
    throw new Error(
      "Không thể kết nối backend Smart Health. Hãy kiểm tra backend và cấu hình CORS.",
    );
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const code = apiErrorCode(payload);
    if (response.status === 401) {
      clearTwoFactorTokenIfMatches(twoFactorToken);
      if (!isTwoFactorAuthCode(code)) clearTokenIfMatches(token);
    }
    throw buildApiError(payload, response.status);
  }
  return { data: payload as T, response };
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, QueryValue> } = {},
) {
  const result = await requestWithResponse<T>(path, init);
  return result.data;
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function scanPageMetadata(
  response: Response,
  query: Record<string, QueryValue>,
  rowCount: number,
  body?: Partial<PageMetadata>,
): PageMetadata {
  const page = positiveInteger(
    response.headers.get("X-Page") ?? body?.page ?? query.page,
    positiveInteger(query.page, 1),
  );
  const limit = positiveInteger(
    response.headers.get("X-Page-Limit") ??
      response.headers.get("X-Limit") ??
      body?.limit ??
      query.limit,
    positiveInteger(query.limit, 25),
  );
  const total = nonNegativeInteger(
    response.headers.get("X-Total-Count") ??
      response.headers.get("X-Pagination-Total") ??
      body?.total,
  );
  const hasNextHeader = response.headers.get("X-Has-Next-Page");
  const hasNextPage =
    hasNextHeader === "true"
      ? true
      : hasNextHeader === "false"
        ? false
        : typeof body?.hasNextPage === "boolean"
          ? body.hasNextPage
          : total !== null
            ? page * limit < total
            : rowCount === limit;
  return { page, limit, total, hasNextPage };
}

async function requestBlobWithResponse(
  path: string,
  init: RequestInit & {
    query?: Record<string, QueryValue>;
    onProgress?: (progress: BlobDownloadProgress) => void;
  } = {},
) {
  const { query, onProgress, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const twoFactorToken = getTwoFactorToken();
  if (twoFactorToken) headers.set("X-Shcare-2FA-Token", twoFactorToken);
  headers.set("X-Smart-Health-Surface", "portal");
  headers.set("X-Smart-Health-Client", "web");

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { ...requestInit, headers });
  } catch (error) {
    if (
      requestInit.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw error;
    }
    throw new Error(
      "Không thể kết nối backend Smart Health. Hãy kiểm tra backend và cấu hình CORS.",
    );
  }
  if (!response.ok) {
    let payload: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    const code = apiErrorCode(payload);
    if (response.status === 401) {
      clearTwoFactorTokenIfMatches(twoFactorToken);
      if (!isTwoFactorAuthCode(code)) clearTokenIfMatches(token);
    }
    throw buildApiError(payload, response.status);
  }
  const contentLengthHeader = response.headers.get("Content-Length");
  const contentLength =
    contentLengthHeader == null ? Number.NaN : Number(contentLengthHeader);
  const total =
    Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null;
  onProgress?.({ loaded: 0, total, percent: total === 0 ? 100 : 0 });

  if (!response.body) {
    const blob = await response.blob();
    onProgress?.({ loaded: blob.size, total: blob.size, percent: 100 });
    return { blob, response };
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    chunks.push(copy.buffer);
    loaded += value.byteLength;
    onProgress?.({
      loaded,
      total,
      percent:
        total && total > 0
          ? Math.min(100, Math.round((loaded / total) * 100))
          : null,
    });
  }

  const blob = new Blob(chunks, {
    type: response.headers.get("Content-Type") || "application/octet-stream",
  });
  onProgress?.({
    loaded,
    total: total ?? loaded,
    percent: 100,
  });
  return { blob, response };
}

async function requestBlob(
  path: string,
  init: RequestInit & {
    query?: Record<string, QueryValue>;
    onProgress?: (progress: BlobDownloadProgress) => void;
  } = {},
) {
  const result = await requestBlobWithResponse(path, init);
  return result.blob;
}

function downloadFileName(contentDisposition: string, fallback: string) {
  const extended = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const basic = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
  let value = extended || basic || fallback;
  try {
    value = decodeURIComponent(value);
  } catch {
    // A valid plain filename does not need URI decoding.
  }
  return value.split(/[\\/]/).pop() || fallback;
}

function exportContractError(code: string, message: string) {
  return buildApiError({ code, message }, 502);
}

function parseCreatedExportResponse(
  payload: unknown,
  input: CreateExportInput,
): { export: ExportJob; replayed: boolean } {
  const root =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const candidate =
    root?.export &&
    typeof root.export === "object" &&
    !Array.isArray(root.export)
      ? (root.export as Record<string, unknown>)
      : null;
  const id = typeof candidate?.id === "string" ? candidate.id.trim() : "";
  const rendererVersion =
    typeof candidate?.rendererVersion === "string"
      ? candidate.rendererVersion.trim()
      : "";
  const downloadUrl =
    typeof candidate?.downloadUrl === "string"
      ? candidate.downloadUrl.trim()
      : "";
  const recordCount = candidate?.recordCount;
  const organizationId =
    typeof candidate?.organizationId === "string"
      ? candidate.organizationId.trim()
      : "";
  const workspaceId =
    typeof candidate?.workspaceId === "string"
      ? candidate.workspaceId.trim()
      : "";
  const artifactSha256 =
    typeof candidate?.artifactSha256 === "string"
      ? candidate.artifactSha256.trim()
      : "";
  const scopeKind =
    typeof candidate?.scopeKind === "string" ? candidate.scopeKind : "";
  let downloadPath = "";
  try {
    downloadPath = new URL(downloadUrl, `${API_BASE}/`).pathname;
  } catch {
    // Invalid URLs are rejected by the contract check below.
  }

  if (
    !candidate ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) ||
    candidate.status !== "ready" ||
    candidate.format !== input.format ||
    candidate.dataset !== input.dataset ||
    !["workspace", "assigned_patients", "personal"].includes(scopeKind) ||
    !organizationId ||
    workspaceId !== organizationId ||
    !rendererVersion ||
    !/^[a-f0-9]{64}$/i.test(artifactSha256) ||
    !Number.isInteger(recordCount) ||
    Number(recordCount) < 0 ||
    downloadPath !== `/api/v1/exports/download/${encodeURIComponent(id)}` ||
    typeof root?.replayed !== "boolean"
  ) {
    throw exportContractError(
      "EXPORT_CREATE_RESPONSE_INVALID",
      "Backend trả về bản xuất chưa sẵn sàng hoặc sai định danh. Chưa có tệp nào được tải xuống.",
    );
  }

  return {
    export: candidate as unknown as ExportJob,
    replayed: root.replayed,
  };
}

export const smartHealthApi = {
  hasToken: () => Boolean(getToken()),
  getTokenSnapshot: () => getToken(),
  getAuthSessionEpochSnapshot: () => getAuthSessionEpochSnapshot(),
  getRealtimeConnection: () => buildRealtimeConnection(API_BASE, getToken()),
  clearToken: () => {
    setToken("");
    setTwoFactorToken("");
  },
  clearTokenIfMatches: (expectedToken: string) =>
    clearTokenIfMatches(expectedToken),
  async login(email: string, password: string) {
    const result = await request<
      | { token: string; user: ApiUser }
      | ({ twoFactorRequired: true } & TwoFactorChallengeDetails)
      | { twoFactorRequired: true; details: TwoFactorChallengeDetails }
    >("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if ("token" in result && result.token) setToken(result.token);
    return result;
  },
  async authenticateFirebase(idToken: string) {
    setToken(idToken);
    try {
      return await request<{ user: ApiUser }>("/auth/firebase", {
        method: "POST",
      });
    } catch (error) {
      if (
        !(
          error &&
          typeof error === "object" &&
          isTwoFactorAuthCode(String((error as ApiError).code || ""))
        )
      ) {
        clearTokenIfMatches(idToken);
      }
      throw error;
    }
  },
  async completeTwoFactorChallenge(payload: {
    challengeId: string;
    code: string;
  }) {
    const result = await request<TwoFactorChallengeResponse>(
      "/auth/2fa/challenge",
      { method: "POST", body: JSON.stringify(payload) },
    );
    if (result.token) setToken(result.token);
    setTwoFactorToken(result.twoFactorToken);
    return result;
  },
  sendEmailVerification: () =>
    request<{
      status: "sent" | "verified";
      email: string;
      provider?: string;
      sentAt?: string;
      user?: ApiUser;
    }>("/auth/email-verification", { method: "POST" }),
  async logoutIfTokenMatches(expectedToken: string) {
    if (!expectedToken || getToken() !== expectedToken) return false;
    let replacementTokenDetected = false;
    try {
      await request<{ ok: boolean }>("/auth/logout", { method: "POST" });
    } finally {
      const currentToken = getToken();
      if (currentToken === expectedToken) {
        clearTokenIfMatches(expectedToken);
      } else if (currentToken) {
        replacementTokenDetected = true;
      }
    }
    return !replacementTokenDetected;
  },
  async logout() {
    const token = getToken();
    if (!token) {
      setTwoFactorToken("");
      return;
    }
    await this.logoutIfTokenMatches(token);
  },
  me: () => request<{ user: ApiUser }>("/v1/me"),
  getNotificationPreferences: () =>
    request<NotificationPreferencesResponse>("/v1/me/notification-preferences"),
  patchNotificationPreference: (
    key: NotificationPreferenceKey,
    enabled: boolean,
    idempotencyKey: string,
  ) =>
    request<NotificationPreferencesResponse>(
      "/v1/me/notification-preferences",
      {
        method: "PATCH",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ key, enabled }),
      },
    ),
  updateMe: async (intent: AccountProfileUpdateIntent) => {
    assertAccountProfileUpdateIntent(intent);
    return parseAccountProfileUpdateReceipt(
      await request<unknown>("/v1/me", {
        method: "PATCH",
        headers: { "Idempotency-Key": intent.idempotencyKey },
        body: JSON.stringify(intent.patch),
      }),
      intent,
      intent.userId,
    );
  },
  switchWorkspace: (workspaceId: string, idempotencyKey: string) =>
    request<{ user: ApiUser; replayed?: boolean }>("/v1/me", {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ organizationId: workspaceId }),
    }),
  resolveAvatarMutationAuthority: async (
    expectedUserId: string,
    expectedWorkspaceId: string,
  ): Promise<AvatarMutationAuthority> => {
    const authSessionEpoch = getAuthSessionEpochSnapshot();
    const bearerToken = getToken();
    if (!bearerToken || !expectedUserId.trim() || !expectedWorkspaceId.trim()) {
      throw buildApiError(
        {
          code: "AVATAR_MUTATION_AUTHORITY_REQUIRED",
          message:
            "Chưa xác nhận tài khoản, workspace và phiên đăng nhập hiện tại cho thao tác ảnh đại diện.",
        },
        409,
      );
    }
    let result: { sessions: AuthSession[] };
    try {
      result = await request<{ sessions: AuthSession[] }>("/v1/auth/sessions");
    } catch (error) {
      assertAvatarAuthSessionSnapshot(
        authSessionEpoch,
        bearerToken,
        "Phiên đăng nhập đã thay đổi trong khi xác định quyền thao tác ảnh đại diện.",
      );
      throw error;
    }
    assertAvatarAuthSessionSnapshot(
      authSessionEpoch,
      bearerToken,
      "Phiên đăng nhập đã thay đổi trước khi thao tác ảnh đại diện được gửi.",
    );
    const currentSession = result.sessions.find(
      (session) => session.current === true && !session.revokedAt,
    );
    const authority = {
      userId: expectedUserId.trim(),
      workspaceId: expectedWorkspaceId.trim(),
      authSessionId: String(currentSession?.id || "").trim(),
      authSessionEpoch,
      bearerToken,
    } satisfies AvatarMutationAuthority;
    avatarMutationAuthorityHeaders(authority);
    return authority;
  },
  uploadMyAvatar: async (file: File, intent: AvatarUploadIntent) => {
    if (!intent.idempotencyKey.trim()) {
      throw buildApiError(
        {
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message:
            "Tải ảnh đại diện cần mã thao tác ổn định để có thể thử lại an toàn.",
        },
        400,
      );
    }
    const authority = {
      userId: intent.userId,
      workspaceId: intent.workspaceId,
      authSessionId: intent.authSessionId,
      authSessionEpoch: intent.authSessionEpoch,
      bearerToken: intent.bearerToken,
    } satisfies AvatarMutationAuthority;
    const authorityHeaders = avatarMutationAuthorityHeaders(authority);
    let receipt: AvatarUploadReceipt;
    try {
      receipt = await request<AvatarUploadReceipt>("/v1/me/avatar", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": file.name,
          "Idempotency-Key": intent.idempotencyKey,
          ...authorityHeaders,
        },
        body: file,
      });
    } catch (error) {
      avatarMutationAuthorityHeaders(authority);
      throw error;
    }
    avatarMutationAuthorityHeaders(authority);
    return receipt;
  },
  downloadMyAvatar: () => requestBlob("/v1/me/avatar"),
  getMyAvatarCleanupStatus: () =>
    request<unknown>("/v1/me/avatar/cleanup"),
  deleteMyAvatar: async (intent: AvatarDeleteIntent) => {
    if (
      !intent.expectedAvatarFileId.trim() ||
      !intent.idempotencyKey.trim()
    ) {
      throw buildApiError(
        {
          code: "AVATAR_DELETE_INTENT_INVALID",
          message:
            "Không thể xác định ảnh hoặc mã thao tác cần dùng để xoá an toàn.",
        },
        400,
      );
    }
    const authority = {
      userId: intent.userId,
      workspaceId: intent.workspaceId,
      authSessionId: intent.authSessionId,
      authSessionEpoch: intent.authSessionEpoch,
      bearerToken: intent.bearerToken,
    } satisfies AvatarMutationAuthority;
    const authorityHeaders = avatarMutationAuthorityHeaders(authority);
    let receipt: AvatarDeleteReceipt;
    try {
      receipt = await request<AvatarDeleteReceipt>("/v1/me/avatar", {
        method: "DELETE",
        headers: {
          "Idempotency-Key": intent.idempotencyKey,
          ...authorityHeaders,
        },
        body: JSON.stringify({
          expectedAvatarFileId: intent.expectedAvatarFileId,
        }),
      });
    } catch (error) {
      avatarMutationAuthorityHeaders(authority);
      throw error;
    }
    avatarMutationAuthorityHeaders(authority);
    return receipt;
  },
  changePassword: async (
    payload: {
      currentPassword: string;
      newPassword: string;
    },
    idempotencyKey: string,
  ) => {
    if (!idempotencyKey.trim()) {
      throw buildApiError(
        {
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message:
            "Đổi mật khẩu cần mã thao tác ổn định để có thể thử lại an toàn.",
        },
        400,
      );
    }
    return parsePasswordChangeReceipt(
      await request<unknown>("/v1/me/password", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      }),
    );
  },
  getTwoFactorStatus: () => request<TwoFactorStatusResponse>("/v1/me/2fa"),
  async startTwoFactorEnrollment(intent: TwoFactorEnrollmentStartIntent) {
    assertTwoFactorEnrollmentStartIntent(intent);
    assertCurrentTwoFactorAuthSession(intent.authSessionEpoch);
    const payload = await request<unknown>("/v1/me/2fa/enroll", {
      method: "POST",
      headers: { "Idempotency-Key": intent.idempotencyKey },
      body: JSON.stringify({ method: "app" }),
    });
    assertCurrentTwoFactorAuthSession(intent.authSessionEpoch);
    return parseTwoFactorEnrollmentStartReceipt(payload, intent);
  },
  async verifyTwoFactorEnrollment(intent: TwoFactorEnrollmentIntent) {
    assertTwoFactorEnrollmentIntent(intent);
    assertCurrentTwoFactorAuthSession(intent.authSessionEpoch);
    const payload = await request<unknown>("/v1/me/2fa/verify", {
      method: "POST",
      headers: { "Idempotency-Key": intent.idempotencyKey },
      body: JSON.stringify({
        enrollmentId: intent.enrollmentId,
        code: intent.code,
      }),
    });
    assertCurrentTwoFactorAuthSession(intent.authSessionEpoch);
    const result = parseTwoFactorEnrollmentReceipt(
      payload,
      intent,
    );
    return result;
  },
  async acknowledgeTwoFactorRecoveryCodes(intent: TwoFactorRecoveryAckIntent) {
    assertTwoFactorRecoveryAckIntent(intent);
    assertCurrentTwoFactorAuthSession(intent.authSessionEpoch);
    const payload = await request<unknown>("/v1/me/2fa/recovery-codes/ack", {
      method: "POST",
      headers: { "Idempotency-Key": intent.idempotencyKey },
      body: JSON.stringify({
        deliveryId: intent.deliveryId,
        recoveryAckToken: intent.recoveryAckToken,
      }),
    });
    assertCurrentTwoFactorAuthSession(intent.authSessionEpoch);
    const result = parseTwoFactorRecoveryAckReceipt(
      payload,
      {
        userId: intent.userId,
        enrollmentId: intent.enrollmentId,
        deliveryId: intent.deliveryId,
      },
    );
    setTwoFactorToken(result.twoFactorToken);
    return result;
  },
  disableTwoFactor: (code: string) =>
    request<{ twoFactor: TwoFactorState }>("/v1/me/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  listSessions: () => request<{ sessions: AuthSession[] }>("/v1/auth/sessions"),
  revokeSession: async (intent: AuthSessionRevokeIntent) => {
    assertAuthSessionRevokeIntent(intent, intent.userId);
    return parseAuthSessionRevokeReceipt(
      await request<unknown>(
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
  requestRole: async (
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) => {
    if (!idempotencyKey.trim()) {
      throw buildApiError(
        {
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message:
            "Gửi hồ sơ quyền cần mã thao tác ổn định để có thể thử lại an toàn.",
        },
        400,
      );
    }
    return request<RoleRequestReceipt>("/v1/auth/role-request", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  },
  listPublicClinics: async (): Promise<{ clinics: PublicClinicOption[] }> => ({
    clinics: parsePublicClinicCatalog(
      await request<unknown>("/catalog/clinics"),
    ),
  }),
  uploadRoleRequestDocument: async (file: File, idempotencyKey: string) => {
    if (!idempotencyKey.trim()) {
      throw buildApiError(
        {
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message:
            "Tải tài liệu xác minh cần mã thao tác ổn định để có thể thử lại an toàn.",
        },
        400,
      );
    }
    return request<{
      document: {
        id: string;
        userId: string;
        organizationId: string;
        name: string;
        contentType: string;
        byteSize: number;
        sha256: string;
        uploadedAt: string;
      };
      operationId: string;
      replayed: boolean;
    }>("/auth/role-request-document", {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "X-File-Name": file.name,
        "Idempotency-Key": idempotencyKey,
      },
      body: file,
    });
  },
  requestWorkspace: (
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) =>
    request<{
      workspace: WorkspaceSummary;
      user: ApiUser;
      operationId: string;
      idempotent: boolean;
      notificationDelivery: "ready" | "failed" | "skipped";
    }>("/auth/workspace-request", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }),
  contact: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; requestId: string }>("/contact", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  portalStatus: () => request<PortalStatusPayload>("/portal/status"),
  portalBilling: async (expectedWorkspaceId: string) =>
    parsePortalBillingResponse(
      await request<unknown>("/v1/portal/billing"),
      expectedWorkspaceId,
    ),
  overview: async (
    expectedWorkspaceId: string,
    query: OverviewQuery = { range: "today", timezoneOffsetMinutes: 0 },
  ) =>
    parsePortalOverviewResponse(
      await request<unknown>("/v1/portal/overview", {
        query: {
          range: query.range,
          timezoneOffsetMinutes: query.timezoneOffsetMinutes,
        },
      }),
      expectedWorkspaceId,
      query,
    ),
  monitoring: async (expectedWorkspaceId: string) =>
    parsePortalMonitoringResponse(
      await request<unknown>("/v1/portal/monitoring"),
      expectedWorkspaceId,
    ),
  listPatients: (q?: string) =>
    request<{ patients: Patient[] }>("/portal/patients", { query: { q } }),
  getPatient: (id: string) =>
    request<unknown>(`/portal/patients/${encodeURIComponent(id)}`),
  resolvePatientMutationAuthority: async (
    expectedUserId: string,
    expectedWorkspaceId: string,
  ): Promise<PatientMutationAuthority> => {
    const authSessionEpoch = getAuthSessionEpochSnapshot();
    const bearerSnapshot = getToken();
    if (!bearerSnapshot || !expectedUserId.trim() || !expectedWorkspaceId.trim()) {
      throw buildApiError(
        {
          code: "PATIENT_MUTATION_AUTHORITY_REQUIRED",
          message: "Chưa xác nhận tài khoản, workspace và phiên đăng nhập hiện tại.",
        },
        409,
      );
    }
    const result = await request<{ sessions: AuthSession[] }>("/v1/auth/sessions");
    if (
      getAuthSessionEpochSnapshot() !== authSessionEpoch ||
      getToken() !== bearerSnapshot
    ) {
      throw buildApiError(
        {
          code: "AUTH_SESSION_REPLACED",
          message: "Phiên đăng nhập đã thay đổi trước khi gửi thao tác hồ sơ.",
        },
        409,
      );
    }
    const currentSession = result.sessions.find(
      (session) => session.current === true && !session.revokedAt,
    );
    const authority = {
      expectedUserId: expectedUserId.trim(),
      expectedWorkspaceId: expectedWorkspaceId.trim(),
      expectedAuthSessionId: String(currentSession?.id || "").trim(),
      authSessionEpoch,
    } satisfies PatientMutationAuthority;
    patientMutationAuthorityHeaders(authority);
    return authority;
  },
  createPatient: (
    payload: Partial<Patient>,
    idempotencyKey: string,
    authority?: PatientMutationAuthority,
  ) =>
    request<unknown>("/portal/patients", {
      method: "POST",
      headers: {
        "Idempotency-Key": idempotencyKey,
        ...patientMutationAuthorityHeaders(authority),
      },
      body: JSON.stringify(payload),
    }),
  updatePatient: (
    id: string,
    payload: Partial<Patient>,
    idempotencyKey: string,
    authority?: PatientMutationAuthority,
  ) =>
    request<unknown>(`/portal/patients/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Idempotency-Key": idempotencyKey,
        ...patientMutationAuthorityHeaders(authority),
      },
      body: JSON.stringify(payload),
    }),
  deletePatient: (
    id: string,
    idempotencyKey: string,
    authority?: PatientMutationAuthority,
  ) =>
    request<unknown>(`/portal/patients/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        "Idempotency-Key": idempotencyKey,
        ...patientMutationAuthorityHeaders(authority),
      },
    }),
  validatePatientImport: (file: File, idempotencyKey: string) =>
    request<unknown>("/portal/patients/import/validate", {
      method: "POST",
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Idempotency-Key": idempotencyKey,
        "X-File-Name": encodeURIComponent(file.name || "patients.csv"),
      },
      body: file,
    }),
  getPatientImportBatch: (batchId: string) =>
    request<unknown>(`/portal/patients/import/${encodeURIComponent(batchId)}`),
  commitPatientImport: (batchId: string, idempotencyKey: string) =>
    request<unknown>(
      `/portal/patients/import/${encodeURIComponent(batchId)}/commit`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    ),
  listPatientShares: async (id: string, expectedWorkspaceId: string) =>
    parsePatientShareListResponse(
      await request<unknown>(
        `/v1/portal/patients/${encodeURIComponent(id)}/shares`,
      ),
      { workspaceId: expectedWorkspaceId, patientId: id },
    ),
  createPatientShare: (
    id: string,
    payload: CreatePatientSharePayload,
    idempotencyKey: string,
    expectedWorkspaceId: string,
  ) =>
    request<unknown>(`/v1/portal/patients/${encodeURIComponent(id)}/shares`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }).then((response) =>
      parsePatientShareCreateResponse(response, {
        workspaceId: expectedWorkspaceId,
        patientId: id,
        intent: payload,
      }),
    ),
  revokePatientShare: (
    patientId: string,
    shareId: string,
    idempotencyKey: string,
    expectedWorkspaceId: string,
  ) =>
    request<unknown>(
      `/v1/portal/patients/${encodeURIComponent(patientId)}/shares/${encodeURIComponent(shareId)}`,
      {
        method: "DELETE",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    ).then((response) =>
      parsePatientShareRevokeResponse(response, {
        workspaceId: expectedWorkspaceId,
        patientId,
        shareId,
      }),
    ),
  listAppointments: (query: Record<string, QueryValue> = {}) =>
    request<{ appointments: Appointment[] }>("/portal/appointments", { query }),
  getAppointment: (id: string) =>
    request<{ appointment: Appointment }>(
      `/portal/appointments/${encodeURIComponent(id)}`,
    ),
  createAppointment: (payload: Partial<Appointment>, idempotencyKey: string) =>
    request<{ appointment: Appointment }>("/portal/appointments", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }),
  updateAppointment: (
    id: string,
    payload: Partial<Appointment>,
    idempotencyKey: string,
  ) =>
    request<{ appointment: Appointment }>(
      `/portal/appointments/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      },
    ),
  rescheduleAppointment: (
    id: string,
    payload: Pick<Appointment, "startsAt" | "endsAt"> & { reason?: string },
    idempotencyKey: string,
  ) =>
    request<{ appointment: Appointment }>(
      `/portal/appointments/${encodeURIComponent(id)}/reschedule`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      },
    ),
  cancelAppointment: (
    id: string,
    payload: { cancellationReason: string },
    idempotencyKey: string,
  ) =>
    request<{ appointment: Appointment }>(
      `/portal/appointments/${encodeURIComponent(id)}/cancel`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      },
    ),
  deleteAppointment: (id: string, idempotencyKey: string) =>
    request<{
      deleted: true;
      appointmentId: string;
      workspaceId: string;
      deletedAt: string;
      replayed: boolean;
    }>(
      `/portal/appointments/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    ),
  async listScans(query: Record<string, QueryValue> = {}) {
    const result = await requestWithResponse<{
      scans: Scan[];
      pagination?: Partial<PageMetadata>;
    }>("/portal/scans", { query });
    return {
      ...result.data,
      pagination: scanPageMetadata(
        result.response,
        query,
        result.data.scans.length,
        result.data.pagination,
      ),
    };
  },
  listReviewQueue: (query: Record<string, QueryValue> = {}) =>
    request<{
      workspaceId: string;
      reviews: ClinicalReview[];
      reviewQueue?: ClinicalReview[];
    }>("/portal/review-queue", { query }),
  decideReview: (
    scanId: string,
    input: {
      decision: ReviewDecision;
      note: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
  ) =>
    request<{ workspaceId: string; review: ClinicalReview }>(
      `/portal/review-queue/${encodeURIComponent(scanId)}/decision`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({
          decision: input.decision,
          note: input.note,
          expectedVersion: input.expectedVersion,
        }),
      },
    ),
  listClinicalAlerts: (query: Record<string, QueryValue> = {}) =>
    request<{ workspaceId: string; alerts: ClinicalAlert[] }>(
      "/portal/alerts",
      { query },
    ),
  acknowledgeClinicalAlert: (
    alertId: string,
    input: { note: string; expectedVersion: number; idempotencyKey: string },
  ) =>
    request<{ workspaceId: string; alert: ClinicalAlert }>(
      `/portal/alerts/${encodeURIComponent(alertId)}/acknowledge`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({
          note: input.note,
          expectedVersion: input.expectedVersion,
        }),
      },
    ),
  resolveClinicalAlert: (
    alertId: string,
    input: { note: string; expectedVersion: number; idempotencyKey: string },
  ) =>
    request<{ workspaceId: string; alert: ClinicalAlert }>(
      `/portal/alerts/${encodeURIComponent(alertId)}/resolve`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({
          note: input.note,
          expectedVersion: input.expectedVersion,
        }),
      },
    ),
  getScan: (id: string) =>
    request<{ scan: Scan }>(`/portal/scans/${encodeURIComponent(id)}`),
  downloadScanAudio: (id: string, options: BlobDownloadOptions = {}) =>
    requestBlob(`/scans/${encodeURIComponent(id)}/audio`, options),
  updateScan: (id: string, payload: Partial<Scan>) =>
    request<{ scan: Scan }>(`/portal/scans/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  listDevices: async (expectedWorkspaceId: string) =>
    parsePortalDeviceListResponse(
      await request<unknown>("/v1/portal/devices"),
      expectedWorkspaceId,
    ),
  updateDevice: (
    id: string,
    payload: Partial<Device>,
    idempotencyKey: string,
  ) =>
    request<{ device: Device; replayed: boolean }>(
      `/v1/portal/devices/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      },
    ),
  activateDeviceByClaim: (
    payload: {
      deviceId: string;
      claimCode: string;
      connectionMethod: "QR" | "Manual";
      organizationId: string;
    },
    idempotencyKey: string,
  ) =>
    request<unknown>("/portal/devices/pair", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }).then((response) =>
      parseDevicePairingResponse(response, {
        workspaceId: payload.organizationId,
        deviceId: payload.deviceId,
      }),
    ),
  listStaff: () => request<PortalStaffResponse>("/portal/staff"),
  listStaffInvitations: (
    query: {
      organizationId?: string;
      role?: StaffInvitationRole;
      status?: StaffInvitation["status"];
    } = {},
  ) =>
    request<{ invitations: StaffInvitation[] }>("/admin/staff-invitations", {
      query,
    }),
  createStaffInvitation: (
    payload: {
      email: string;
      role: StaffInvitationRole;
      organizationId: string;
      name?: string;
      phone?: string;
      specialty?: string;
      license?: string;
    },
    idempotencyKey: string,
  ) =>
    request<StaffInvitationMutationResponse>("/admin/staff-invitations", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }),
  resendStaffInvitation: (invitationId: string, idempotencyKey: string) =>
    request<StaffInvitationMutationResponse>(
      `/admin/staff-invitations/${encodeURIComponent(invitationId)}/resend`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({}),
      },
    ),
  revokeStaffInvitation: (
    invitationId: string,
    reason: string,
    idempotencyKey: string,
  ) =>
    request<StaffInvitationMutationResponse>(
      `/admin/staff-invitations/${encodeURIComponent(invitationId)}/revoke`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ reason }),
      },
    ),
  acceptStaffInvitation: (token: string, idempotencyKey: string) =>
    request<{
      invitation: StaffInvitation;
      membership: WorkspaceMembership;
      user: ApiUser;
      idempotent?: boolean;
    }>("/staff-invitations/accept", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ token }),
    }),
  suspendStaffMember: (userId: string, idempotencyKey: string) =>
    request<{
      action: WorkspaceMembershipAction;
      membership: WorkspaceMembership;
      user: ApiUser;
      revoked: boolean;
      replayed?: boolean;
    }>(`/portal/staff/${encodeURIComponent(userId)}/suspend`, {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  reactivateStaffMember: (userId: string, idempotencyKey: string) =>
    request<{
      action: WorkspaceMembershipAction;
      membership: WorkspaceMembership;
      user: ApiUser;
      revoked: boolean;
      replayed?: boolean;
    }>(`/portal/staff/${encodeURIComponent(userId)}/reactivate`, {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  revokeStaffMember: (userId: string, idempotencyKey: string) =>
    request<{
      action: WorkspaceMembershipAction;
      membership: WorkspaceMembership;
      user: ApiUser;
      revoked: boolean;
      replayed?: boolean;
    }>(`/portal/staff/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  changeStaffMemberRole: (
    userId: string,
    role: StaffInvitationRole,
    idempotencyKey: string,
  ) =>
    request<WorkspaceMembershipRoleChangeResponse>(
      `/portal/staff/${encodeURIComponent(userId)}/role`,
      {
        method: "PATCH",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ role }),
      },
    ),
  reports: () =>
    request<{ summary: Record<string, number>; latestScans: Scan[] }>(
      "/portal/reports",
    ),
  listNotifications: () =>
    request<{ notifications: Notification[] }>("/portal/notifications"),
  getNotificationInbox: () =>
    request<NotificationInboxResponse>("/portal/notifications/inbox"),
  markNotificationInboxRead: (id: string, idempotencyKey: string) =>
    request<NotificationInboxMutationResponse>(
      `/portal/notifications/inbox/${encodeURIComponent(id)}/read`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    ),
  markAllNotificationInboxRead: (idempotencyKey: string) =>
    request<NotificationInboxMutationResponse>(
      "/portal/notifications/inbox/read-all",
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    ),
  deleteNotificationInboxItem: (id: string, idempotencyKey: string) =>
    request<NotificationInboxMutationResponse>(
      `/portal/notifications/inbox/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    ),
  markNotificationRead: (id: string) =>
    request<{ notification: Notification }>(
      `/portal/notifications/${encodeURIComponent(id)}/read`,
      { method: "POST" },
    ),
  markAllNotificationsRead: () =>
    request<{ notifications: Notification[] }>(
      "/portal/notifications/read-all",
      {
        method: "POST",
      },
    ),
  deleteNotification: (id: string) =>
    request<{ deleted: boolean }>(
      `/portal/notifications/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    ),
  async listAuditLogs(query: AuditLogQuery = {}): Promise<AuditLogPage> {
    const queryParams: Record<string, QueryValue> = {
      q: query.q,
      action: query.action,
      resourceType: query.resourceType,
      actorUserId: query.actorUserId,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    };
    const result = await requestWithResponse<{
      logs: AuditLog[];
      pagination?: Partial<AuditLogPagination>;
    }>("/portal/audit-log", { query: queryParams });
    const logs = Array.isArray(result.data.logs) ? result.data.logs : [];
    const page = scanPageMetadata(
      result.response,
      queryParams,
      logs.length,
      result.data.pagination,
    );
    const pageCount =
      result.data.pagination?.pageCount ??
      (page.total === null || page.total === 0
        ? 0
        : Math.ceil(page.total / page.limit));
    return {
      logs,
      pagination: {
        ...page,
        pageCount,
        sort:
          result.data.pagination?.sort === "createdAt:asc"
            ? "createdAt:asc"
            : "createdAt:desc",
      },
    };
  },
  async listExports(query: ExportListQuery = {}): Promise<ExportPage> {
    const queryParams: Record<string, QueryValue> = {
      format: query.format,
      dataset: query.dataset,
      status: query.status,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    };
    const result = await requestWithResponse<{
      exports: ExportJob[];
      pagination?: Partial<ExportPage["pagination"]>;
    }>("/v1/exports", { query: queryParams });
    const exports = Array.isArray(result.data.exports)
      ? result.data.exports
      : [];
    const page = scanPageMetadata(
      result.response,
      queryParams,
      exports.length,
      result.data.pagination,
    );
    return {
      exports,
      pagination: {
        ...page,
        pageCount:
          result.data.pagination?.pageCount ??
          (page.total === null || page.total === 0
            ? 0
            : Math.ceil(page.total / page.limit)),
        sort:
          result.data.pagination?.sort === "createdAt:asc"
            ? "createdAt:asc"
            : "createdAt:desc",
      },
    };
  },
  async createExport(input: CreateExportInput, idempotencyKey: string) {
    const payload = await request<unknown>("/v1/exports", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    });
    return parseCreatedExportResponse(payload, input);
  },
  async downloadExport(
    exportId: string,
    options: BlobDownloadOptions = {},
  ): Promise<ExportDownload> {
    const result = await requestBlobWithResponse(
      `/v1/exports/download/${encodeURIComponent(exportId)}`,
      options,
    );
    const contentType =
      result.response.headers.get("Content-Type") ||
      result.blob.type ||
      "application/octet-stream";
    const contentDisposition =
      result.response.headers.get("Content-Disposition") || "";
    const artifactSha256 =
      result.response.headers.get("X-Shcare-Artifact-SHA256") || "";
    const rendererVersion =
      result.response.headers.get("X-Shcare-Renderer-Version") || "";
    if (result.blob.size <= 0) {
      throw exportContractError(
        "EXPORT_ARTIFACT_EMPTY",
        "Backend trả về tệp rỗng. Shcare đã dừng tải xuống để tránh báo hoàn tất sai.",
      );
    }
    if (
      !contentDisposition ||
      !/^[a-f0-9]{64}$/i.test(artifactSha256) ||
      !rendererVersion.trim()
    ) {
      throw exportContractError(
        "EXPORT_ARTIFACT_IDENTITY_INVALID",
        "Backend chưa cung cấp đủ định danh kiểm tra toàn vẹn cho tệp xuất.",
      );
    }
    return {
      blob: result.blob,
      fileName: downloadFileName(
        contentDisposition,
        `shcare-export-${exportId}`,
      ),
      contentType,
      artifactSha256,
      rendererVersion: rendererVersion.trim(),
    };
  },
  getSettings: () =>
    request<{
      settings: Record<string, unknown>;
      workspace?: WorkspaceSummary;
    }>("/portal/settings"),
  updateSettings: (payload: Record<string, unknown>) =>
    request<{
      settings: Record<string, unknown>;
      workspace?: WorkspaceSummary;
    }>("/portal/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  updateWorkspace: (intent: WorkspaceSettingsUpdateIntent) => {
    assertWorkspaceSettingsIntent(intent);
    return request<unknown>("/v1/portal/settings/workspace", {
      method: "PATCH",
      headers: { "Idempotency-Key": intent.idempotencyKey },
      body: JSON.stringify({
        ...intent.payload,
        expectedVersion: intent.expectedVersion,
      }),
    }).then((response) =>
      parseWorkspaceSettingsReceipt(
        response,
        intent,
        intent.userId,
        intent.workspaceId,
      ),
    );
  },
  createSupportTicket: (
    payload: SupportTicketCreateInput,
    idempotencyKey: string,
    expected: SupportTicketReceiptExpectation,
  ) =>
    request<unknown>("/v1/portal/support", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }).then((response) => parseSupportTicketCreateResponse(response, expected)),
  shareTargets: (expectedWorkspaceId: string, q?: string) =>
    request<unknown>("/v1/share-targets", {
      query: { q },
    }).then((response) =>
      parseShareTargetsResponse(response, expectedWorkspaceId),
    ),
};
