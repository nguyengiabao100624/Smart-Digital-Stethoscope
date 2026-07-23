import { buildRealtimeConnection } from "./realtime";

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

export interface TwoFactorEnrollmentResponse {
  twoFactor: TwoFactorState;
  enrollment: TwoFactorEnrollment;
}

export interface TwoFactorVerifiedResponse {
  twoFactor: TwoFactorState;
  recoveryCodes: string[];
  twoFactorToken: string;
  tokenExpiresAt: string;
}

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
  status?: "active" | "suspended" | "revoked" | string;
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
  generatedAt?: string;
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
  usage: Record<string, number>;
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
  invoicePolicy?: {
    mode?: string;
    providerConfigured?: boolean;
    message?: string;
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

export interface SendDeviceCommandInput {
  type: DeviceCommandType;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  correlationId?: string;
  ttlMs?: number;
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
  organizationId?: string;
  type?: string;
  title?: string;
  message?: string;
  campaignId?: string;
  audienceType?: "workspace" | "role" | "users" | "legacy";
  audienceRole?: string;
  requestedChannels?: Array<"in_app" | "email" | "push">;
  inAppStatus?: string;
  emailStatus?: string;
  pushStatus?: string;
  read?: boolean;
  readAt?: string;
  createdAt?: string;
  updatedAt?: string;
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

export interface OverviewPayload {
  stats: {
    patientsCount?: number;
    devicesOnline?: number;
    scansCount?: number;
    pendingDoctors?: number;
    aiJobsFailed?: number;
    storageUsed?: string;
  };
  measureData?: Array<{ time?: string; count?: number }>;
  deviceData?: Array<{ name: string; value: number; color: string }>;
  aiJobData?: Array<{ name: string; value: number; color: string }>;
}

export interface PortalStatusPayload {
  ok: boolean;
  service: string;
  now: string;
  mode: {
    authMode: string;
    dataBackend: string;
    firebaseAuth: boolean;
  };
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
    type?: string;
    esp?: number;
    wsEsp?: number;
    udpEsp?: number;
    listeners?: number;
    recording?: boolean;
    activeScanId?: string | null;
    activeScanStartedAt?: string | null;
    sampleRate?: number;
    udpPort?: number;
    httpPort?: number;
    updatedAt?: string;
  };
}

const API_BASE = (
  import.meta.env.VITE_SMART_HEALTH_API_BASE_URL || "http://localhost:3000/api"
).replace(/\/+$/, "");
const TOKEN_KEY = "smart_health_token";
const TWO_FACTOR_TOKEN_KEY = "shcare_two_factor_token";

function getToken() {
  return typeof window === "undefined"
    ? ""
    : window.localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token: string) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
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
      setTwoFactorToken("");
      if (!isTwoFactorAuthCode(code)) setToken("");
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
      setTwoFactorToken("");
      if (!isTwoFactorAuthCode(code)) setToken("");
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
  getRealtimeConnection: () => buildRealtimeConnection(API_BASE, getToken()),
  clearToken: () => {
    setToken("");
    setTwoFactorToken("");
  },
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
        setToken("");
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
  async logout() {
    try {
      await request<{ ok: boolean }>("/auth/logout", { method: "POST" });
    } finally {
      setToken("");
      setTwoFactorToken("");
    }
  },
  me: () => request<{ user: ApiUser }>("/me"),
  updateMe: (payload: Partial<ApiUser> & { organizationId?: string }) =>
    request<{ user: ApiUser }>("/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  uploadMyAvatar: (file: File) =>
    request<{ user: ApiUser; file: { id: string; name: string } }>(
      "/me/avatar",
      {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": file.name,
        },
        body: file,
      },
    ),
  downloadMyAvatar: () => requestBlob("/me/avatar"),
  deleteMyAvatar: () =>
    request<{ user: ApiUser; deleted: boolean }>("/me/avatar", {
      method: "DELETE",
    }),
  changePassword: (payload: {
    currentPassword?: string;
    newPassword?: string;
    firebaseClientUpdated?: boolean;
  }) =>
    request<{ ok: boolean; user: ApiUser }>("/me/password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getTwoFactorStatus: () => request<TwoFactorStatusResponse>("/me/2fa"),
  startTwoFactorEnrollment: () =>
    request<TwoFactorEnrollmentResponse>("/me/2fa/enroll", {
      method: "POST",
      body: JSON.stringify({ method: "app" }),
    }),
  async verifyTwoFactorEnrollment(payload: {
    enrollmentId: string;
    code: string;
  }) {
    const result = await request<TwoFactorVerifiedResponse>("/me/2fa/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setTwoFactorToken(result.twoFactorToken);
    return result;
  },
  disableTwoFactor: (code: string) =>
    request<{ twoFactor: TwoFactorState }>("/me/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  listSessions: () => request<{ sessions: AuthSession[] }>("/auth/sessions"),
  revokeSession: (sessionId: string, idempotencyKey: string) =>
    request<{ session: AuthSession; revoked: boolean }>(
      `/auth/sessions/${encodeURIComponent(sessionId)}/revoke`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    ),
  requestRole: (payload: Record<string, unknown>) =>
    request<{ user: ApiUser; roleRequest: { status: string } }>(
      "/auth/role-request",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  uploadRoleRequestDocument: (file: File) =>
    request<{ document: { id: string; name: string } }>(
      "/auth/role-request-document",
      {
        method: "POST",
        headers: { "Content-Type": file.type, "X-File-Name": file.name },
        body: file,
      },
    ),
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
  portalBilling: () => request<PortalBillingPayload>("/portal/billing"),
  overview: () => request<OverviewPayload>("/portal/overview"),
  monitoring: () =>
    request<{
      status: unknown;
      devices: Device[];
      scans: Scan[];
      alerts: Array<Record<string, unknown>>;
    }>("/portal/monitoring"),
  listPatients: (q?: string) =>
    request<{ patients: Patient[] }>("/portal/patients", { query: { q } }),
  getPatient: (id: string) =>
    request<unknown>(`/portal/patients/${encodeURIComponent(id)}`),
  createPatient: (payload: Partial<Patient>, idempotencyKey: string) =>
    request<unknown>("/portal/patients", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }),
  updatePatient: (
    id: string,
    payload: Partial<Patient>,
    idempotencyKey: string,
  ) =>
    request<unknown>(`/portal/patients/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }),
  deletePatient: (id: string, idempotencyKey: string) =>
    request<unknown>(`/portal/patients/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": idempotencyKey },
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
  listPatientShares: (id: string) =>
    request<{ shares: PatientShare[] }>(
      `/portal/patients/${encodeURIComponent(id)}/shares`,
    ),
  createPatientShare: (
    id: string,
    payload: CreatePatientSharePayload,
    idempotencyKey: string,
  ) =>
    request<{ share: PatientShare }>(
      `/portal/patients/${encodeURIComponent(id)}/shares`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      },
    ),
  revokePatientShare: (
    patientId: string,
    shareId: string,
    idempotencyKey: string,
  ) =>
    request<{ revoked: boolean; share: PatientShare }>(
      `/portal/patients/${encodeURIComponent(patientId)}/shares/${encodeURIComponent(shareId)}`,
      {
        method: "DELETE",
        headers: { "Idempotency-Key": idempotencyKey },
      },
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
  deleteAppointment: (id: string) =>
    request<{ deleted: boolean }>(
      `/portal/appointments/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
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
    request<{ reviews: ClinicalReview[]; reviewQueue?: ClinicalReview[] }>(
      "/portal/review-queue",
      { query },
    ),
  decideReview: (
    scanId: string,
    input: {
      decision: ReviewDecision;
      note: string;
      expectedVersion: number;
      idempotencyKey: string;
    },
  ) =>
    request<{ review: ClinicalReview }>(
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
    request<{ alerts: ClinicalAlert[] }>("/portal/alerts", { query }),
  acknowledgeClinicalAlert: (
    alertId: string,
    input: { note: string; expectedVersion: number; idempotencyKey: string },
  ) =>
    request<{ alert: ClinicalAlert }>(
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
    request<{ alert: ClinicalAlert }>(
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
  listDevices: () => request<{ devices: Device[] }>("/portal/devices"),
  updateDevice: (id: string, payload: Partial<Device>) =>
    request<{ device: Device }>(`/portal/devices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  activateDeviceByClaim: (
    payload: {
      deviceId: string;
      claimCode: string;
      connectionMethod: "QR" | "manual";
    },
    idempotencyKey: string,
  ) =>
    request<DevicePairingResponse>("/portal/devices/pair", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    }),
  sendDeviceCommand: (id: string, input: SendDeviceCommandInput) =>
    request<DeviceCommandResponse>(
      `/portal/devices/${encodeURIComponent(id)}/commands`,
      {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: JSON.stringify({
          type: input.type,
          payload: input.payload || {},
          ...(input.correlationId
            ? { correlationId: input.correlationId }
            : {}),
          ...(input.ttlMs ? { ttlMs: input.ttlMs } : {}),
        }),
      },
    ),
  getDeviceCommand: (id: string, commandId: string, signal?: AbortSignal) =>
    request<{ command: DeviceCommand }>(
      `/portal/devices/${encodeURIComponent(id)}/commands/${encodeURIComponent(commandId)}`,
      { signal },
    ),
  listDeviceCommands: (id: string, signal?: AbortSignal) =>
    request<{ commands: DeviceCommand[] }>(
      `/portal/devices/${encodeURIComponent(id)}/commands`,
      { signal },
    ),
  listStaff: () =>
    request<{ staff: ApiUser[]; doctors: ApiUser[] }>("/portal/staff"),
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
  reports: () =>
    request<{ summary: Record<string, number>; latestScans: Scan[] }>(
      "/portal/reports",
    ),
  listNotifications: () =>
    request<{ notifications: Notification[] }>("/portal/notifications"),
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
  updateWorkspace: (payload: Partial<WorkspaceSummary>) =>
    request<{ workspace: WorkspaceSummary }>("/portal/settings/workspace", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  createSupportTicket: (payload: { type: string; description: string }) =>
    request<{ ticket: { id: string; status: string } }>("/portal/support", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  shareTargets: (q?: string) =>
    request<{ doctors: ShareTarget[]; workspaces: ShareTarget[] }>(
      "/share-targets",
      {
        query: { q },
      },
    ),
};
