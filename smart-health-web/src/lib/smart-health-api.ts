type QueryValue = string | number | boolean | null | undefined;

export type ApiError = Error & { status?: number; payload?: unknown };

export interface WorkspaceMembership {
  id?: string;
  workspaceId?: string;
  organizationId?: string;
  workspaceName?: string;
  workspaceType?: string;
  role?: string;
}

export interface WorkspaceSummary {
  id: string;
  name?: string;
  type?: string;
  workspaceType?: string;
  packageId?: string;
  subscriptionStatus?: string;
  billingCycle?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  legalName?: string;
  representative?: string;
  settings?: Record<string, unknown>;
}

export interface ApiUser {
  id: string;
  role?: string;
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  organizationId?: string;
  currentWorkspaceId?: string;
  currentMembership?: WorkspaceMembership | null;
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
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  organizationId?: string;
  doctorName?: string;
  scanCount?: number;
  lastScanAt?: string | null;
  lastAiLabel?: string | null;
  createdAt?: string;
  updatedAt?: string;
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
  lastSeenAt?: string;
  updatedAt?: string;
}

export interface Notification {
  id: string;
  type?: string;
  title?: string;
  message?: string;
  read?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccessLog {
  id?: string;
  action?: string;
  severity?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
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

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(path.replace(/^\/+/, ""), `${API_BASE}/`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function errorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "message" in value)
      return String((value as { message: unknown }).message);
  }
  return `Yêu cầu backend thất bại (${status}).`;
}

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, QueryValue> } = {},
) {
  const { query, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
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
    if (response.status === 401) setToken("");
    const error = new Error(errorMessage(payload, response.status)) as ApiError;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload as T;
}

export const smartHealthApi = {
  hasToken: () => Boolean(getToken()),
  clearToken: () => setToken(""),
  async login(email: string, password: string) {
    const result = await request<{ token: string; user: ApiUser }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    setToken(result.token);
    return result;
  },
  async authenticateFirebase(idToken: string) {
    setToken(idToken);
    try {
      return await request<{ user: ApiUser }>("/auth/firebase", {
        method: "POST",
      });
    } catch (error) {
      setToken("");
      throw error;
    }
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
    }
  },
  me: () => request<{ user: ApiUser }>("/me"),
  updateMe: (payload: Partial<ApiUser> & { organizationId?: string }) =>
    request<{ user: ApiUser }>("/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
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
  requestWorkspace: (payload: Record<string, unknown>) =>
    request<{ workspace: WorkspaceSummary; user: ApiUser }>(
      "/auth/workspace-request",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  contact: (payload: Record<string, unknown>) =>
    request<{ ok: boolean; requestId: string }>("/contact", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  portalStatus: () => request<PortalStatusPayload>("/portal/status"),
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
    request<{ patient: Patient }>(`/portal/patients/${encodeURIComponent(id)}`),
  createPatient: (payload: Partial<Patient>) =>
    request<{ patient: Patient }>("/portal/patients", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePatient: (id: string, payload: Partial<Patient>) =>
    request<{ patient: Patient }>(
      `/portal/patients/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),
  deletePatient: (id: string) =>
    request<{ deleted: boolean }>(
      `/portal/patients/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    ),
  listPatientShares: (id: string) =>
    request<{ shares: Array<Record<string, unknown>> }>(
      `/portal/patients/${encodeURIComponent(id)}/shares`,
    ),
  createPatientShare: (id: string, payload: Record<string, unknown>) =>
    request<{ share: Record<string, unknown> }>(
      `/portal/patients/${encodeURIComponent(id)}/shares`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  revokePatientShare: (patientId: string, shareId: string) =>
    request<{ revoked: boolean }>(
      `/portal/patients/${encodeURIComponent(patientId)}/shares/${encodeURIComponent(shareId)}`,
      { method: "DELETE" },
    ),
  listScans: (query: Record<string, QueryValue> = {}) =>
    request<{ scans: Scan[] }>("/portal/scans", { query }),
  getScan: (id: string) =>
    request<{ scan: Scan }>(`/portal/scans/${encodeURIComponent(id)}`),
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
  activateDeviceByClaim: (payload: {
    deviceId: string;
    claimCode?: string;
    name?: string;
    connectionMethod?: string;
  }) =>
    request<{ device: Device }>("/portal/devices/pair", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sendDeviceCommand: (
    id: string,
    type: string,
    payload: Record<string, unknown> = {},
  ) =>
    request(`/portal/devices/${encodeURIComponent(id)}/commands`, {
      method: "POST",
      body: JSON.stringify({ type, payload }),
    }),
  listStaff: () => request<{ doctors: ApiUser[] }>("/portal/staff"),
  createStaff: (payload: Record<string, unknown>) =>
    request<{ doctor: ApiUser }>("/portal/staff", {
      method: "POST",
      body: JSON.stringify(payload),
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
  listAuditLogs: () => request<{ logs: AccessLog[] }>("/portal/audit-log"),
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
    request<{ doctors: ApiUser[]; workspaces: WorkspaceSummary[] }>(
      "/share-targets",
      {
        query: { q },
      },
    ),
};
