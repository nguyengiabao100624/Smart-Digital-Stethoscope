import { toVietnameseErrorMessage } from "./error-messages";

type QueryValue = string | number | boolean | null | undefined;

export type SmartHealthApiError = Error & {
  status?: number;
  payload?: unknown;
};

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
  capabilities?: string[];
  firebaseUid?: string;
  verifiedEmail?: boolean;
  verifiedPhone?: boolean;
  roleRequestStatus?: string;
  requestedRole?: string;
  roleRequestedAt?: string;
  roleApprovedAt?: string;
  roleRejectedAt?: string;
  roleRejectReason?: string;
  roleInfoRequestAt?: string;
  roleInfoRequestMessage?: string;
  roleInfoRequiredFields?: string[];
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
};

export type SmartHealthPatient = {
  id: string;
  patientCode?: string;
  name?: string;
  age?: number | null;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  organizationId?: string;
  ownerUserId?: string;
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

export type SmartHealthDevice = {
  id: string;
  name?: string;
  type?: string;
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
  organizationId?: string;
  firmwareVersion?: string;
  otaStatus?: string;
  audioStatus?: string;
  backendHost?: string;
  backendPort?: number;
  ota?: {
    id?: string;
    firmwareVersion?: string;
    url?: string;
    checksum?: string;
    firmwareFileId?: string;
    firmwareFileName?: string;
    expiresAt?: string;
    status?: string;
    createdAt?: string;
  };
  lastCommand?: {
    id?: string;
    type?: string;
    status?: string;
    createdAt?: string;
    deliveredVia?: Record<string, unknown>;
  };
  lastSeenAt?: string;
  updatedAt?: string;
  revokedAt?: string;
  secretRotatedAt?: string;
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
  type?: string;
  title?: string;
  message?: string;
  read?: boolean;
  createdAt?: string;
  updatedAt?: string;
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
  name: string;
  value: number;
  color: string;
};

export type SmartHealthOverviewStats = {
  clinics: number;
  pendingDoctors: number;
  devicesOnline: number;
  scansCount: number;
  aiJobsFailed: number;
  storageUsed: string;
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
  quota: number;
  quotaGb?: number;
  files: number;
  createdAt: string;
  visibility: "public" | "private" | "encrypted" | string;
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
  maxFileSizeMb?: number;
  retentionDays?: number;
  encryptionRequired?: boolean;
  system?: boolean;
  color?: string;
};

export type SmartHealthStorageFile = {
  id: string;
  name: string;
  bucket: string;
  type: string;
  size: string;
  uploader: string;
  uploadedAt: string;
  visibility: "public" | "private" | "encrypted";
  previewUrl?: string;
  downloadUrl?: string;
  shareUrl?: string;
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

export type SmartHealthAccessLog = {
  id?: string;
  action?: string;
  severity?: "success" | "warning" | "error" | string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
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
  createdAt?: string;
  updatedAt?: string;
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
};

const DEFAULT_HTTP_BASE_URL = "http://localhost:3000";
const LOCAL_BACKEND_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "10.0.2.2"]);
const TOKEN_STORAGE_KEYS = ["smart_health_admin_token", "smart_health_token"];

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  const base = (value || fallback).trim();
  return base.replace(/\/+$/, "");
}

function assertProductionBackendUrl(label: string, value: string) {
  if (
    !import.meta.env.PROD ||
    import.meta.env.VITE_SMART_HEALTH_ALLOW_LOCAL_BACKEND === "true"
  ) {
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
  const baseUrl = normalizeBaseUrl(import.meta.env.VITE_SMART_HEALTH_BASE_URL, DEFAULT_HTTP_BASE_URL);
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

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path.replace(/^\/+/, ""), `${getApiBaseUrl()}/`);

  for (const [key, value] of Object.entries(query || {})) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return toVietnameseErrorMessage(error, fallback);
    }
  }

  return toVietnameseErrorMessage(payload, fallback);
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, body, ...init } = options;
  const requestHeaders = new Headers(headers);
  const token = getStoredToken();

  if (token && !requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  if (body && typeof body === "string" && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      headers: requestHeaders,
      body,
    });
  } catch (error) {
    throw new Error(
      toVietnameseErrorMessage(
        error,
        "Không thể kết nối backend Smart Health. Vui lòng kiểm tra backend đang chạy và cấu hình CORS.",
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
      clearToken();
    }
    const error = new Error(
      getErrorMessage(payload, `Không thể kết nối backend Smart Health (${response.status}).`),
    ) as SmartHealthApiError;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload as T;
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { query, headers, body, ...init } = options;
  const requestHeaders = new Headers(headers);
  const token = getStoredToken();

  if (token && !requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      headers: requestHeaders,
      body,
    });
  } catch (error) {
    throw new Error(
      toVietnameseErrorMessage(
        error,
        "Không thể kết nối backend Smart Health. Vui lòng kiểm tra backend đang chạy và cấu hình CORS.",
      ),
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
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
    throw new Error(
      getErrorMessage(
        payload,
        `Không thể tải file audio từ backend Smart Health (${response.status}).`,
      ),
    );
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

  async logout() {
    try {
      await requestJson<{ ok?: boolean }>("/auth/logout", { method: "POST" });
    } finally {
      clearToken();
    }
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

  async changePassword(payload: { currentPassword: string; newPassword: string }) {
    return requestJson<{ ok: boolean }>("/me/password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async updateTwoFactor(payload: { action: "enable" | "disable"; method?: "app" | "sms" }) {
    return requestJson<{
      user: SmartHealthAuthUser;
      twoFactor: {
        enabled: boolean;
        method?: string;
        secretPreview?: string;
        recoveryCodes?: string[];
        note?: string;
      };
    }>("/me/2fa", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listSessions() {
    return requestJson<{ sessions: SmartHealthAuthSession[] }>("/auth/sessions");
  },

  async revokeSession(sessionId: string) {
    return requestJson<{ session: SmartHealthAuthSession }>(
      `/auth/sessions/${encodeURIComponent(sessionId)}/revoke`,
      { method: "POST" },
    );
  },

  async listPatients(q?: string) {
    return requestJson<{ patients: SmartHealthPatient[] }>("/patients", { query: { q } });
  },

  async listScans(params: { patientId?: string; status?: string; limit?: number } = {}) {
    return requestJson<{ scans: SmartHealthScan[] }>("/scans", { query: params });
  },

  async downloadScanAudio(audioUrl: string) {
    return requestBlob(audioUrl);
  },

  async listDevices() {
    return requestJson<{ devices: SmartHealthDevice[] }>("/devices");
  },

  async patchDevice(id: string, payload: Partial<SmartHealthDevice>) {
    return requestJson<{ device: SmartHealthDevice }>(`/devices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async deleteDevice(id: string) {
    return requestJson<{ deleted: boolean; deviceId: string }>(
      `/devices/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
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

  async revokeDevice(id: string) {
    return requestJson<{ device: SmartHealthDevice }>(`/devices/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
    });
  },

  async unpairDevice(id: string) {
    return requestJson<{ device: SmartHealthDevice }>(`/devices/${encodeURIComponent(id)}/unpair`, {
      method: "POST",
    });
  },

  async rotateDeviceSecret(id: string) {
    return requestJson<{ device: SmartHealthDevice; rotated?: boolean }>(
      `/devices/${encodeURIComponent(id)}/rotate-secret`,
      { method: "POST" },
    );
  },

  async pushDeviceOta(
    id: string,
    payload: { firmwareVersion?: string; url?: string; checksum?: string; firmwareFileId?: string },
  ) {
    return requestJson<{ device: SmartHealthDevice; ota?: unknown; command?: unknown; delivery?: { delivered?: boolean } }>(
      `/devices/${encodeURIComponent(id)}/ota`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  async sendDeviceCommand(id: string, payload: { type: string; payload?: Record<string, unknown> }) {
    return requestJson<{
      device: SmartHealthDevice;
      command: { id: string; type: string; payload?: Record<string, unknown>; createdAt?: string };
      delivery?: Record<string, unknown>;
    }>(`/devices/${encodeURIComponent(id)}/commands`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listDeviceEvents(id: string) {
    return requestJson<{ events: SmartHealthDeviceEvent[] }>(
      `/devices/${encodeURIComponent(id)}/events`,
    );
  },

  async listNotifications() {
    return requestJson<{ notifications: SmartHealthNotification[] }>("/notifications");
  },

  async createNotification(payload: {
    title: string;
    message: string;
    type?: string;
    channel?: string;
  }) {
    return requestJson<{ notification: SmartHealthNotification }>("/notifications", {
      method: "POST",
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

  async listAccessLogs() {
    return requestJson<{ logs: SmartHealthAccessLog[] }>("/access-logs");
  },

  async listDoctorRoleRequests(status?: string) {
    return requestJson<{ requests: SmartHealthAuthUser[] }>("/admin/doctor-requests", {
      query: { status },
    });
  },

  async listApprovedDoctors() {
    return requestJson<{ doctors: SmartHealthAuthUser[] }>("/admin/doctors");
  },

  async createDoctor(payload: {
    fullName?: string;
    name?: string;
    specialty?: string;
    department?: string;
    clinic?: string;
    clinicName?: string;
    phone?: string;
    email?: string;
    licenseNumber?: string;
    license?: string;
    organizationId?: string;
  }) {
    return requestJson<{ doctor: SmartHealthAuthUser }>("/admin/doctors", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async deleteDoctor(userId: string) {
    return requestJson<{
      deleted: boolean;
      firebaseDeleted?: boolean;
      firebaseAlreadyMissing?: boolean;
      firebaseUid?: string;
      warning?: string;
    }>(`/admin/doctors/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  },

  async lockDoctor(userId: string) {
    return requestJson<{ request: SmartHealthAuthUser }>(
      `/admin/doctors/${encodeURIComponent(userId)}/lock`,
      {
        method: "PATCH",
      },
    );
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

  async getOverviewStats() {
    return requestJson<{
      stats: SmartHealthOverviewStats;
      measureData: SmartHealthChartPoint[];
      deviceData: SmartHealthChartSlice[];
      aiJobData: SmartHealthChartSlice[];
    }>("/admin/overview-stats");
  },

  async syncFirebase() {
    return requestJson<{ deletedCount: number }>("/admin/sync-firebase", { method: "POST" });
  },

  async getSettings() {
    return requestJson<{ settings: Record<string, unknown> }>("/settings");
  },

  async getProductionReadiness() {
    return requestJson<{ readiness: SmartHealthProductionReadiness }>("/settings/production-readiness");
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
    return requestJson<{ ok: boolean; apiKey: unknown; secret?: string; settings: Record<string, unknown> }>(
      "/settings/api-keys",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  async rotateApiKey(keyId: string) {
    return requestJson<{ ok: boolean; apiKey: unknown; secret?: string; settings: Record<string, unknown> }>(
      `/settings/api-keys/${encodeURIComponent(keyId)}/rotate`,
      { method: "POST" },
    );
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

  async unlockDoctor(userId: string) {
    return requestJson<{ request: SmartHealthAuthUser }>(
      `/admin/doctors/${encodeURIComponent(userId)}/unlock`,
      {
        method: "PATCH",
      },
    );
  },

  async listClinics() {
    return requestJson<{ clinics: SmartHealthClinic[] }>("/admin/clinics");
  },

  async listCatalogClinics() {
    return requestJson<{ clinics: SmartHealthClinic[] }>("/catalog/clinics");
  },

  async listSpecialties() {
    return requestJson<{ specialties: SmartHealthSpecialty[] }>("/catalog/specialties");
  },

  async createClinic(payload: {
    name: string;
    type?: string;
    workspaceType?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    packageId?: string;
    subscriptionStatus?: string;
    billingCycle?: string;
  }) {
    return requestJson<{ clinic: SmartHealthClinic }>("/admin/clinics", {
      method: "POST",
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
    },
  ) {
    return requestJson<{ clinic: SmartHealthClinic }>(
      `/admin/clinics/${encodeURIComponent(clinicId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
  },

  async deleteClinic(clinicId: string) {
    return requestJson<{ deleted: boolean; clinicId: string }>(
      `/admin/clinics/${encodeURIComponent(clinicId)}`,
      { method: "DELETE" },
    );
  },

  async createPatient(payload: {
    name: string;
    age?: number | null;
    gender?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    patientCode?: string;
    organizationId?: string;
  }) {
    return requestJson<{ patient: SmartHealthPatient }>("/patients", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async createDeviceProvision(payload: {
    deviceId?: string;
    name?: string;
    organizationId?: string;
  }) {
    return requestJson<{
      device: SmartHealthDevice;
      claim: { deviceId: string; claimCode: string; expiresAt: string; qrPayload: unknown };
    }>("/devices/provision-qr", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async activateDeviceByClaim(payload: {
    deviceId: string;
    claimCode?: string;
    connectionMethod?: string;
  }) {
    return requestJson<{ device: SmartHealthDevice }>("/devices/pair", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async listPackages() {
    return requestJson<{ packages: SmartHealthServicePackage[] }>("/admin/packages");
  },

  async createPackage(payload: {
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
  }) {
    return requestJson<{ package: SmartHealthServicePackage }>("/admin/packages", {
      method: "POST",
      body: JSON.stringify(payload),
    });
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
  ) {
    return requestJson<{ package: SmartHealthServicePackage }>(
      `/admin/packages/${encodeURIComponent(packageId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
  },

  async deletePackage(packageId: string) {
    return requestJson<{ deleted: boolean; packageId: string }>(
      `/admin/packages/${encodeURIComponent(packageId)}`,
      { method: "DELETE" },
    );
  },

  async assignPackageToClinic(
    clinicId: string,
    payload: { packageId: string; subscriptionStatus?: string; billingCycle?: string },
  ) {
    return requestJson<{ clinic: SmartHealthClinic }>(
      `/admin/workspaces/${encodeURIComponent(clinicId)}/package`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  async getStorageStats() {
    return requestJson<{
      totalUsed: number;
      totalQuota: number;
      totalFiles: number;
      buckets: SmartHealthStorageBucket[];
      growthData: SmartHealthChartPoint[];
      typeData: SmartHealthChartSlice[];
      topBuckets: SmartHealthTopBucket[];
      recentActivity: SmartHealthStorageActivity[];
      topClinicUsage: SmartHealthClinicUsage[];
    }>("/admin/storage-stats");
  },

  async listStorageFiles() {
    return requestJson<{ files: SmartHealthStorageFile[] }>("/admin/storage-files");
  },

  async createStorageBucket(payload: {
    id?: string;
    name: string;
    description?: string;
    iconKey?: string;
    colorKey?: string;
    category?: string;
    quotaGb?: number;
    visibility?: string;
    allowedExtensions?: string[];
    allowedMimeTypes?: string[];
    maxFileSizeMb?: number;
    retentionDays?: number;
    encryptionRequired?: boolean;
  }) {
    return requestJson<{ bucket: SmartHealthStorageBucket }>("/admin/storage-buckets", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async deleteStorageBucket(bucketId: string) {
    return requestJson<{ deleted: boolean; bucketId: string }>(
      `/admin/storage-buckets/${encodeURIComponent(bucketId)}`,
      { method: "DELETE" },
    );
  },

  async uploadStorageFile(payload: {
    bucket: string;
    file: File;
    visibility?: string;
    tags?: string[];
  }) {
    return requestJson<{ file: SmartHealthStorageFile }>("/admin/storage-files", {
      method: "POST",
      query: {
        bucket: payload.bucket,
        filename: payload.file.name,
        visibility: payload.visibility || "private",
        tags: payload.tags?.join(",") || "",
      },
      headers: {
        "Content-Type": payload.file.type || "application/octet-stream",
        "X-File-Name": payload.file.name,
      },
      body: payload.file,
    });
  },

  async deleteStorageFile(fileId: string) {
    return requestJson<{ deleted: boolean; fileId: string }>(
      `/admin/storage-files/${encodeURIComponent(fileId)}`,
      { method: "DELETE" },
    );
  },

  async shareStorageFile(fileId: string) {
    return requestJson<{ url: string; shareUrl: string; expiresInSeconds?: number }>(
      `/admin/storage-files/${encodeURIComponent(fileId)}/share`,
      { method: "POST" },
    );
  },

  async downloadStorageFile(fileId: string, downloadUrl?: string) {
    const path = downloadUrl?.startsWith("/api/")
      ? downloadUrl.slice(4)
      : downloadUrl || `/admin/storage-files/${encodeURIComponent(fileId)}/download`;
    return requestBlob(path);
  },
};
