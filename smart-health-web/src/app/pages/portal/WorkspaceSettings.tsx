import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "react-router";
import {
  Bell,
  Building2,
  Camera,
  CheckCircle2,
  CircleAlert,
  CloudOff,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Save,
  Settings,
  ShieldCheck,
  RefreshCw,
  Smartphone,
  Trash2,
  UploadCloud,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { TwoFactorPanel } from "../../components/security/TwoFactorPanel";
import { useAuth } from "../../context/AuthContext";
import {
  ACCOUNT_PROFILE_MUTATION_FIELDS,
  accountProfileIntentFingerprint,
  createAccountProfileIdempotencyKey,
  isAccountProfileIdempotencyCollision,
  parseAccountProfileUpdateReceipt,
  smartHealthApi,
  type AccountProfilePatch,
  type AccountProfileUpdateIntent,
  type ApiError,
  type ApiUser,
  type AuthSession,
  type NotificationChannelAvailability,
  type NotificationCloudPreferences,
  type NotificationPreferencesResponse,
} from "../../../lib/smart-health-api";
import {
  getCurrentFirebaseUid,
  hasFirebaseWebConfig,
  reauthenticateFirebasePassword,
} from "../../../lib/firebase-client";
import {
  AuthSessionRevokeContractError,
  createAuthSessionRevokeIdempotencyKey,
  isAuthSessionIdempotencyCollision,
  parseAuthSessionRevokeReceipt,
  type AuthSessionRevokeIntent,
  type AuthSessionRevokeReceipt,
} from "../../../lib/auth-session-operations";
import {
  WorkspaceSettingsContractError,
  createWorkspaceSettingsIdempotencyKey,
  isWorkspaceSettingsIdempotencyCollision,
  parseWorkspaceSettingsReceipt,
  workspaceSettingsIntentFingerprint,
  type WorkspaceSettingsUpdateIntent,
} from "../../../lib/workspace-settings-operations";
import {
  AvatarContractError,
  assertAvatarFile,
  avatarDeleteIntentFingerprint,
  avatarUploadIntentFingerprint,
  createAvatarIdempotencyKey,
  hashAvatarFile,
  isAvatarIdempotencyCollision,
  parseAvatarCleanupStatus,
  parseAvatarDeleteReceipt,
  parseAvatarUploadReceipt,
  type AvatarCleanupAction,
  type AvatarCleanupStatus,
  type AvatarDeleteIntent,
  type AvatarMutationAuthority,
  type AvatarUploadIntent,
} from "../../../lib/avatar-operations";

type SettingsTab = "profile" | "security" | "notifications" | "workspace";

type AvatarCleanupNotice = {
  userId: string;
  workspaceId: string;
  status: Extract<AvatarCleanupStatus, "pending" | "dead_letter">;
  action: Exclude<AvatarCleanupAction, "none">;
  previousFileId: string;
};

type ProfileForm = {
  name: string;
  title: string;
  email: string;
  phone: string;
  license: string;
  hospital: string;
  department: string;
  specialty: string;
  address: string;
  avatarUrl: string;
  avatarFileId: string;
  twoFactorEnabled: boolean;
  twoFactorMethod: string;
};

type WorkspaceForm = {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
};

const preferenceFields = [
  {
    key: "enabled",
    label: "Nhận thông báo",
    description: "Bật hoặc tắt toàn bộ kênh thông báo của tài khoản.",
  },
  {
    key: "doctorRequests",
    label: "Yêu cầu bác sĩ",
    description: "Hồ sơ mới, lời mời cộng tác hoặc phân công từ workspace.",
  },
  {
    key: "abnormalResults",
    label: "Kết quả bất thường",
    description:
      "Cảnh báo từ nguồn dữ liệu hoặc bác sĩ đánh dấu cần xem xét ngay.",
  },
  {
    key: "deviceOffline",
    label: "Thiết bị offline",
    description: "Thiết bị được giao cho workspace mất kết nối.",
  },
  {
    key: "appointments",
    label: "Lịch hẹn",
    description: "Nhắc lịch đo, tái khám hoặc lịch chăm sóc từ xa.",
  },
  {
    key: "messages",
    label: "Tin nhắn",
    description: "Trao đổi nội bộ và phản hồi từ bệnh nhân.",
  },
  {
    key: "aiUpdates",
    label: "Xử lý tín hiệu",
    description: "Trạng thái xử lý, chất lượng dữ liệu đo và yêu cầu đo lại.",
  },
  {
    key: "newLogin",
    label: "Đăng nhập mới",
    description: "Thông báo khi tài khoản có phiên đăng nhập mới.",
  },
] as const;

const notificationChannelFields = [
  { key: "inApp", label: "Trong ứng dụng" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" },
] as const;

type PreferenceForm = NotificationCloudPreferences;

const emptyProfile: ProfileForm = {
  name: "",
  title: "",
  email: "",
  phone: "",
  license: "",
  hospital: "",
  department: "",
  specialty: "",
  address: "",
  avatarUrl: "",
  avatarFileId: "",
  twoFactorEnabled: false,
  twoFactorMethod: "",
};

const emptyWorkspace: WorkspaceForm = {
  name: "",
  address: "",
  phone: "",
  email: "",
  website: "",
};

class SettingsActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsActionError";
  }
}

type AvatarMutationErrorBinding = Readonly<{
  authority: Readonly<AvatarMutationAuthority>;
  idempotencyKey: string;
}>;

class AvatarMutationBoundError extends Error {
  readonly binding!: AvatarMutationErrorBinding;
  readonly originalError!: unknown;

  constructor(
    originalError: unknown,
    authority: AvatarMutationAuthority,
    idempotencyKey = "",
  ) {
    super(
      originalError instanceof Error
        ? originalError.message
        : "Avatar mutation failed",
    );
    this.name = "AvatarMutationBoundError";
    const binding = Object.freeze({
      authority: Object.freeze({ ...authority }),
      idempotencyKey,
    });
    Object.defineProperties(this, {
      binding: { value: binding, enumerable: false },
      originalError: { value: originalError, enumerable: false },
    });
  }
}

function bindAvatarMutationError(
  error: unknown,
  authority: AvatarMutationAuthority,
  idempotencyKey = "",
) {
  return error instanceof AvatarMutationBoundError ||
    isAvatarAuthorityReplaced(error)
    ? error
    : new AvatarMutationBoundError(error, authority, idempotencyKey);
}

function avatarMutationErrorBinding(error: unknown) {
  return error instanceof AvatarMutationBoundError ? error.binding : null;
}

function avatarAuthorityReplacedError() {
  return Object.assign(
    new SettingsActionError(
      "Phiên đăng nhập đã thay đổi; kết quả thao tác ảnh đại diện cũ đã bị loại bỏ.",
    ),
    { code: "AUTH_SESSION_REPLACED", status: 409 },
  );
}

function isAvatarAuthorityReplaced(error: unknown) {
  if (error instanceof AvatarMutationBoundError) {
    return isAvatarAuthorityReplaced(error.originalError);
  }
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "AUTH_SESSION_REPLACED",
  );
}

function requireConfirmedUser(
  result: { user?: ApiUser },
  expectedUserId: string | undefined,
  action: string,
) {
  if (!expectedUserId || result.user?.id !== expectedUserId) {
    throw new SettingsActionError(
      `Backend chưa xác nhận ${action}. Dữ liệu hiển thị vẫn giữ nguyên; vui lòng thử lại.`,
    );
  }
  return result.user;
}

function requireAccountSnapshotOwner(
  result: { user?: ApiUser },
  expectedUserId: string | undefined,
) {
  if (!expectedUserId || result.user?.id !== expectedUserId) {
    throw new SettingsActionError(
      "Backend trả về hồ sơ không thuộc tài khoản hiện tại. Dữ liệu chưa được hiển thị.",
    );
  }
  return result;
}

function requireWorkspaceSnapshotOwner<
  T extends { workspace?: { id?: string } },
>(result: T, expectedWorkspaceId: string | undefined) {
  if (
    result.workspace &&
    (!expectedWorkspaceId || result.workspace.id !== expectedWorkspaceId)
  ) {
    throw new SettingsActionError(
      "Backend trả về cài đặt không thuộc workspace hiện tại. Dữ liệu chưa được hiển thị.",
    );
  }
  return result;
}

function profileFromUser(user?: ApiUser | null): ProfileForm {
  if (!user) return emptyProfile;
  return {
    name: user.name || "",
    title: user.title || "",
    email: user.email || "",
    phone: user.phone || "",
    license: user.license || "",
    hospital: user.hospital || user.clinicName || "",
    department: user.department || "",
    specialty: user.specialty || "",
    address: user.address || "",
    avatarUrl: user.avatarUrl || "",
    avatarFileId: user.avatarFileId || "",
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    twoFactorMethod: user.twoFactorMethod || "",
  };
}

function accountProfilePatchFromDraft(
  draft: ProfileForm,
  current?: ApiUser | null,
): AccountProfilePatch {
  const baseline = profileFromUser(current);
  return ACCOUNT_PROFILE_MUTATION_FIELDS.reduce((patch, field) => {
    const value = draft[field].trim();
    if (value !== baseline[field].trim()) patch[field] = value;
    return patch;
  }, {} as AccountProfilePatch);
}

function preferencesFromUser(user?: ApiUser | null): PreferenceForm {
  const current = user?.notificationPreferences || {};
  return preferenceFields.reduce((result, field) => {
    result[field.key] =
      field.key === "aiUpdates"
        ? current[field.key] === true
        : current[field.key] !== false;
    return result;
  }, {} as PreferenceForm);
}

function requireNotificationPreferencesOwner(
  result: NotificationPreferencesResponse,
  expectedUserId: string | undefined,
  expectedWorkspaceId: string | undefined,
  action: string,
) {
  if (
    !expectedUserId ||
    !expectedWorkspaceId ||
    result.userId !== expectedUserId ||
    result.workspaceId !== expectedWorkspaceId ||
    result.ownership.kind !== "self" ||
    result.ownership.userId !== expectedUserId
  ) {
    throw new SettingsActionError(
      `Backend chưa xác nhận đúng chủ tài khoản/workspace khi ${action}. Dữ liệu hiển thị vẫn giữ nguyên; vui lòng thử lại.`,
    );
  }
  return result;
}

function notificationChannelStatus(channel: NotificationChannelAvailability) {
  if (channel.available && channel.status === "ready") return "Sẵn sàng";
  if (channel.status === "disabled") return "Đã tắt";
  if (channel.status === "unavailable") return "Chưa khả dụng";
  return "Chưa xác định";
}

function workspaceFromUser(user?: ApiUser | null): WorkspaceForm {
  const workspace = user?.currentWorkspace || user?.workspace;
  if (!workspace) return emptyWorkspace;
  return {
    name: workspace.name || "",
    address: workspace.address || "",
    phone: workspace.phone || "",
    email: workspace.email || "",
    website: workspace.website || "",
  };
}

function errorText(error: unknown, fallback = "Không thể thực hiện yêu cầu.") {
  if (error instanceof AvatarMutationBoundError) {
    return errorText(error.originalError, fallback);
  }
  if (
    error instanceof SettingsActionError ||
    error instanceof AuthSessionRevokeContractError ||
    error instanceof WorkspaceSettingsContractError ||
    error instanceof AvatarContractError
  ) {
    return error.message;
  }
  const apiError =
    error && typeof error === "object" ? (error as ApiError) : null;
  if (apiError?.code?.startsWith("ACCOUNT_PROFILE_")) {
    return apiError.message;
  }
  const status = apiError?.status;
  if (status === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại trước khi thử tiếp.";
  }
  if (status === 403) {
    return "Bạn không có quyền xem hoặc cập nhật workspace này. Dữ liệu tài khoản khác vẫn có thể sử dụng.";
  }
  if (status === 409) {
    return "Dữ liệu vừa được thay đổi ở nơi khác. Hãy tải lại dữ liệu rồi thử lại.";
  }
  if (status === 429) {
    return "Bạn đã thực hiện quá nhiều yêu cầu. Vui lòng chờ một lúc rồi thử lại.";
  }
  if (typeof status === "number" && status >= 500) {
    return `${fallback} Backend Smart Health đang tạm gián đoạn; dữ liệu chưa được thay đổi. Vui lòng thử lại.`;
  }
  if (
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
    (error instanceof Error &&
      /kết nối backend|failed to fetch|network/i.test(error.message))
  ) {
    return `${fallback} Thiết bị đang offline hoặc không thể kết nối backend; dữ liệu chưa được thay đổi. Hãy kiểm tra mạng và thử lại.`;
  }
  if (status === 400 || status === 422) {
    return `${fallback} Dữ liệu gửi lên chưa hợp lệ hoặc chưa đầy đủ. Hãy kiểm tra các trường rồi thử lại.`;
  }
  return fallback;
}

const passwordMutationTokenRecoveryCodes = new Set([
  "FIREBASE_ID_TOKEN_REVOKED",
  "FIREBASE_ID_TOKEN_EXPIRED",
]);

function isPasswordMutationTokenRecoveryError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const apiError = error as ApiError;
  return (
    apiError.status === 401 &&
    passwordMutationTokenRecoveryCodes.has(String(apiError.code || ""))
  );
}

function isAmbiguousPasswordMutationError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const status = (error as ApiError).status;
  return (
    typeof status !== "number" ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function SettingsInlineError({
  error,
  fallback,
  retry,
}: {
  error: unknown;
  fallback: string;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground"
    >
      <CircleAlert
        className="size-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">{errorText(error, fallback)}</span>
      {retry && (
        <Button
          type="button"
          variant="outline"
          onClick={retry}
          className="min-h-11"
        >
          <RefreshCw aria-hidden="true" />
          Thử lại
        </Button>
      )}
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "Chưa ghi nhận";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function sessionDevice(session: AuthSession) {
  const label = String(session.deviceLabel || "").trim();
  if (label) return label;
  const agent = String(session.userAgent || "").toLowerCase();
  if (agent.includes("android")) return "Android";
  if (agent.includes("iphone") || agent.includes("ipad")) return "iOS";
  if (agent.includes("mobile")) return "Mobile browser";
  if (agent.includes("windows")) return "Windows browser";
  if (agent.includes("mac")) return "macOS browser";
  return "Web session";
}

function sessionIcon(session: AuthSession) {
  const agent = String(session.userAgent || "").toLowerCase();
  return agent.includes("mobile") ||
    agent.includes("android") ||
    agent.includes("iphone") ? (
    <Smartphone size={18} />
  ) : (
    <Laptop size={18} />
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  disabled,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={type}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="h-11"
      />
    </div>
  );
}

function createIdempotencyKey(scope: string) {
  const randomId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}-${randomId}`;
}

export default function WorkspaceSettings() {
  const { user, refreshUser, logout } = useAuth();
  const client = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarObjectUrlRef = useRef("");
  const avatarAuthorityUserIdRef = useRef("");
  const avatarAuthorityWorkspaceIdRef = useRef("");
  const avatarAuthoritySessionIdRef = useRef("");
  const avatarAuthorityEpochRef = useRef(0);
  const avatarAuthorityBearerRef = useRef("");
  const profileAuthorityUserIdRef = useRef("");
  const profileUpdateIntentRef = useRef<{
    fingerprint: string;
    intent: AccountProfileUpdateIntent;
  } | null>(null);
  const avatarUploadIntentRef = useRef<{
    fingerprint: string;
    intent: AvatarUploadIntent;
  } | null>(null);
  const avatarDeleteIntentRef = useRef<{
    fingerprint: string;
    intent: AvatarDeleteIntent;
  } | null>(null);
  const sessionRevokeKeysRef = useRef(new Map<string, string>());
  const revokeAllSessionKeysRef = useRef(new Map<string, string>());
  const sessionAuthorityUserIdRef = useRef("");
  const notificationPreferenceKeysRef = useRef(new Map<string, string>());
  const workspaceSettingsIntentRef = useRef<{
    fingerprint: string;
    intent: WorkspaceSettingsUpdateIntent;
  } | null>(null);
  const passwordChangeIntentRef = useRef<{
    idempotencyKey: string;
    userId: string;
    authToken: string;
    firebaseUid: string | null;
    firebasePrepared: boolean;
    mutationOutcomeAmbiguous: boolean;
    tokenRecoveryAttempted: boolean;
  } | null>(null);
  const passwordAuthorityUserIdRef = useRef("");
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [twoFactorRecoveryPending, setTwoFactorRecoveryPending] =
    useState(false);
  const [pendingSettingsTab, setPendingSettingsTab] =
    useState<SettingsTab | null>(null);
  const recoveryNavigationBlocker = useBlocker(twoFactorRecoveryPending);
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [workspaceForm, setWorkspaceForm] =
    useState<WorkspaceForm>(emptyWorkspace);
  const [preferences, setPreferences] = useState<PreferenceForm>(() =>
    preferencesFromUser(user?.raw),
  );
  const [profileDraftDirty, setProfileDraftDirty] = useState(false);
  const [workspaceDraftDirty, setWorkspaceDraftDirty] = useState(false);
  const [notificationDraftDirty, setNotificationDraftDirty] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarCleanupNotice, setAvatarCleanupNotice] =
    useState<AvatarCleanupNotice | null>(null);
  const [confirmAvatarDelete, setConfirmAvatarDelete] = useState(false);
  const [confirmSessionId, setConfirmSessionId] = useState("");
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const canManageWorkspace = Boolean(
    user?.capabilities.includes("workspace.settings.manage") ||
    user?.capabilities.includes("platform.settings.manage"),
  );
  const avatarBearerToken = smartHealthApi.getTokenSnapshot();
  const avatarAuthSessionEpoch = smartHealthApi.getAuthSessionEpochSnapshot();
  const avatarAuthorityQueryKey = [
    "portal",
    "avatar-authority",
    user?.id,
    user?.currentWorkspace.id,
    avatarAuthSessionEpoch,
  ] as const;
  const avatarAuthorityQuery = useQuery({
    queryKey: avatarAuthorityQueryKey,
    queryFn: () =>
      smartHealthApi.resolveAvatarMutationAuthority(
        user?.id || "",
        user?.currentWorkspace.id || "",
      ),
    enabled: Boolean(
      user?.id && user?.currentWorkspace.id && avatarBearerToken,
    ),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const notificationPreferencesQueryKey = [
    "portal",
    "notification-preferences",
    user?.id,
    user?.currentWorkspace.id,
  ] as const;
  const avatarCleanupQueryKey = [
    "portal",
    "avatar-cleanup",
    user?.id,
    user?.currentWorkspace.id,
    avatarAuthorityQuery.data?.authSessionId || "resolving",
    avatarAuthSessionEpoch,
    avatarAuthorityQuery.data?.bearerToken === avatarBearerToken
      ? "current-bearer"
      : "resolving-bearer",
  ] as const;

  const accountQuery = useQuery({
    queryKey: [
      "portal",
      "me",
      user?.id,
      user?.currentWorkspace.id,
      avatarAuthorityQuery.data?.authSessionId || "resolving",
      avatarAuthSessionEpoch,
      avatarAuthorityQuery.data?.bearerToken === avatarBearerToken
        ? "current-bearer"
        : "resolving-bearer",
    ],
    queryFn: async () =>
      requireAccountSnapshotOwner(await smartHealthApi.me(), user?.id),
    enabled: Boolean(
      user &&
        avatarAuthorityQuery.data?.authSessionId &&
        avatarAuthorityQuery.data.bearerToken === avatarBearerToken,
    ),
  });

  const avatarCleanupQuery = useQuery({
    queryKey: avatarCleanupQueryKey,
    queryFn: async () =>
      parseAvatarCleanupStatus(
        await smartHealthApi.getMyAvatarCleanupStatus(),
        user?.id || "",
        user?.currentWorkspace.id || "",
      ),
    enabled: Boolean(
      user?.id &&
        user?.currentWorkspace.id &&
        avatarAuthorityQuery.data?.authSessionId,
    ),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 15_000 : false,
  });

  const settingsQuery = useQuery({
    queryKey: ["portal", "settings", user?.currentWorkspace.id],
    queryFn: async () =>
      requireWorkspaceSnapshotOwner(
        await smartHealthApi.getSettings(),
        user?.currentWorkspace.id,
      ),
    enabled: Boolean(user && activeTab === "workspace"),
  });

  const sessionsQuery = useQuery({
    queryKey: ["portal", "auth-sessions", user?.id],
    queryFn: smartHealthApi.listSessions,
    enabled: Boolean(user && activeTab === "security"),
  });

  const notificationPreferencesQuery = useQuery({
    queryKey: notificationPreferencesQueryKey,
    queryFn: async () =>
      requireNotificationPreferencesOwner(
        await smartHealthApi.getNotificationPreferences(),
        user?.id,
        user?.currentWorkspace.id,
        "tải cài đặt thông báo",
      ),
    enabled: Boolean(
      user?.id && user?.currentWorkspace.id && activeTab === "notifications",
    ),
  });

  const currentUser = useMemo(
    () => accountQuery.data?.user || user?.raw || null,
    [accountQuery.data?.user, user?.raw],
  );
  sessionAuthorityUserIdRef.current = user?.id || "";
  passwordAuthorityUserIdRef.current = currentUser?.id || user?.id || "";
  avatarAuthorityUserIdRef.current = currentUser?.id || user?.id || "";
  avatarAuthorityWorkspaceIdRef.current = user?.currentWorkspace.id || "";
  avatarAuthorityEpochRef.current = avatarAuthSessionEpoch;
  avatarAuthorityBearerRef.current = avatarBearerToken;
  avatarAuthoritySessionIdRef.current =
    avatarAuthorityQuery.data?.userId === avatarAuthorityUserIdRef.current &&
    avatarAuthorityQuery.data?.workspaceId ===
      avatarAuthorityWorkspaceIdRef.current &&
    avatarAuthorityQuery.data?.authSessionEpoch === avatarAuthSessionEpoch &&
    avatarAuthorityQuery.data?.bearerToken === avatarBearerToken
      ? avatarAuthorityQuery.data.authSessionId
      : "";
  profileAuthorityUserIdRef.current = user?.id || "";
  const isCurrentAvatarAuthority = useCallback(
    (authority: AvatarMutationAuthority) =>
      authority.userId === avatarAuthorityUserIdRef.current &&
      authority.workspaceId === avatarAuthorityWorkspaceIdRef.current &&
      authority.authSessionId === avatarAuthoritySessionIdRef.current &&
      authority.authSessionEpoch === avatarAuthorityEpochRef.current &&
      authority.bearerToken === avatarAuthorityBearerRef.current &&
      smartHealthApi.getAuthSessionEpochSnapshot() ===
        authority.authSessionEpoch &&
      smartHealthApi.getTokenSnapshot() === authority.bearerToken,
    [],
  );
  const isCurrentAvatarMutationError = useCallback(
    (error: unknown) => {
      if (isAvatarAuthorityReplaced(error)) return false;
      const binding = avatarMutationErrorBinding(error);
      return !binding || isCurrentAvatarAuthority(binding.authority);
    },
    [isCurrentAvatarAuthority],
  );
  if (
    profileUpdateIntentRef.current &&
    profileUpdateIntentRef.current.intent.userId !==
      profileAuthorityUserIdRef.current
  ) {
    profileUpdateIntentRef.current = null;
  }
  if (
    avatarUploadIntentRef.current &&
    !isCurrentAvatarAuthority(avatarUploadIntentRef.current.intent)
  ) {
    avatarUploadIntentRef.current = null;
  }
  if (
    avatarDeleteIntentRef.current &&
    !isCurrentAvatarAuthority(avatarDeleteIntentRef.current.intent)
  ) {
    avatarDeleteIntentRef.current = null;
  }

  useEffect(() => {
    const ownerUserId = currentUser?.id || user?.id || "";
    const workspaceId = user?.currentWorkspace.id || "";
    setAvatarCleanupNotice((current) =>
      current &&
      (current.userId !== ownerUserId || current.workspaceId !== workspaceId)
        ? null
        : current,
    );
  }, [currentUser?.id, user?.currentWorkspace.id, user?.id]);

  useEffect(() => {
    const ownerUserId = currentUser?.id || user?.id || "";
    const workspaceId = user?.currentWorkspace.id || "";
    const cleanup = avatarCleanupQuery.data;
    if (
      !ownerUserId ||
      !workspaceId ||
      !cleanup ||
      cleanup.userId !== ownerUserId ||
      cleanup.workspaceId !== workspaceId
    ) {
      return;
    }
    if (
      (cleanup.status === "pending" || cleanup.status === "dead_letter") &&
      cleanup.action !== "none"
    ) {
      setAvatarCleanupNotice({
        userId: cleanup.userId,
        workspaceId: cleanup.workspaceId,
        status: cleanup.status,
        action: cleanup.action,
        previousFileId: cleanup.previousFileId,
      });
      return;
    }
    setAvatarCleanupNotice(null);
  }, [
    avatarCleanupQuery.data,
    currentUser?.id,
    user?.currentWorkspace.id,
    user?.id,
  ]);

  const activeSessions = useMemo(
    () =>
      (sessionsQuery.data?.sessions || []).filter((item) => !item.revokedAt),
    [sessionsQuery.data?.sessions],
  );

  const otherSessions = activeSessions.filter((item) => !item.current);
  const passwordDraftDirty = Object.values(password).some(Boolean);
  const hasUnsavedChanges =
    profileDraftDirty ||
    workspaceDraftDirty ||
    notificationDraftDirty ||
    passwordDraftDirty;

  const handlePendingRecoveryChange = useCallback((pending: boolean) => {
    setTwoFactorRecoveryPending(pending);
    if (!pending) setPendingSettingsTab(null);
  }, []);

  const handleSettingsTabChange = useCallback(
    (value: string) => {
      const nextTab = value as SettingsTab;
      if (nextTab === activeTab) return;
      if (twoFactorRecoveryPending) {
        setPendingSettingsTab(nextTab);
        return;
      }
      setActiveTab(nextTab);
    },
    [activeTab, twoFactorRecoveryPending],
  );

  const cancelRecoveryNavigation = useCallback(() => {
    setPendingSettingsTab(null);
    if (recoveryNavigationBlocker.state === "blocked") {
      recoveryNavigationBlocker.reset();
    }
  }, [recoveryNavigationBlocker]);

  const confirmRecoveryNavigation = useCallback(() => {
    const nextTab = pendingSettingsTab;
    setPendingSettingsTab(null);
    setTwoFactorRecoveryPending(false);
    if (nextTab) setActiveTab(nextTab);
    if (recoveryNavigationBlocker.state === "blocked") {
      recoveryNavigationBlocker.proceed();
    }
  }, [pendingSettingsTab, recoveryNavigationBlocker]);

  useEffect(() => {
    if (profileDraftDirty) return;
    setProfile(profileFromUser(currentUser));
  }, [currentUser, profileDraftDirty]);

  useEffect(() => {
    if (!notificationPreferencesQuery.data || notificationDraftDirty) return;
    setPreferences(notificationPreferencesQuery.data.preferences);
  }, [notificationDraftDirty, notificationPreferencesQuery.data]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const guardUnsavedDrafts = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guardUnsavedDrafts);
    return () => {
      window.removeEventListener("beforeunload", guardUnsavedDrafts);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (workspaceDraftDirty) return;
    const workspace = settingsQuery.data?.workspace;
    if (workspace) {
      setWorkspaceForm({
        name: workspace.name || "",
        address: workspace.address || "",
        phone: workspace.phone || "",
        email: workspace.email || "",
        website: workspace.website || "",
      });
      return;
    }
    setWorkspaceForm(workspaceFromUser(currentUser));
  }, [currentUser, settingsQuery.data?.workspace, workspaceDraftDirty]);

  const setObjectAvatarPreview = useCallback((blob: Blob | File | null) => {
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = "";
    }
    if (!blob) {
      setAvatarPreview("");
      return;
    }
    const url = URL.createObjectURL(blob);
    avatarObjectUrlRef.current = url;
    setAvatarPreview(url);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!profile.avatarFileId) {
      setObjectAvatarPreview(null);
      setAvatarPreview(
        profile.avatarUrl && !profile.avatarUrl.includes("/me/avatar")
          ? profile.avatarUrl
          : "",
      );
      return undefined;
    }
    smartHealthApi
      .downloadMyAvatar()
      .then((blob) => {
        if (!cancelled) setObjectAvatarPreview(blob);
      })
      .catch(() => {
        if (!cancelled) {
          setObjectAvatarPreview(null);
          setAvatarPreview(
            profile.avatarUrl && !profile.avatarUrl.includes("/me/avatar")
              ? profile.avatarUrl
              : "",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profile.avatarFileId, profile.avatarUrl, setObjectAvatarPreview]);

  useEffect(() => {
    return () => {
      if (avatarObjectUrlRef.current)
        URL.revokeObjectURL(avatarObjectUrlRef.current);
    };
  }, []);

  const refreshAccountState = async () => {
    await refreshUser();
    await Promise.all([
      client.invalidateQueries({ queryKey: ["portal", "me"] }),
      client.invalidateQueries({ queryKey: ["portal", "settings"] }),
      client.invalidateQueries({ queryKey: ["portal", "auth-sessions"] }),
      client.invalidateQueries({ queryKey: avatarCleanupQueryKey }),
    ]);
  };

  const saveProfile = useMutation({
    mutationFn: async (patch: AccountProfilePatch) => {
      if (!profile.name.trim()) {
        throw new SettingsActionError("Vui lòng nhập họ tên.");
      }
      const ownerUserId = profileAuthorityUserIdRef.current;
      if (!ownerUserId || Object.keys(patch).length === 0) {
        throw new SettingsActionError(
          "Không thể xác định thay đổi hồ sơ cần lưu.",
        );
      }
      const fingerprint = accountProfileIntentFingerprint({
        userId: ownerUserId,
        patch,
      });
      let active = profileUpdateIntentRef.current;
      if (!active || active.fingerprint !== fingerprint) {
        active = {
          fingerprint,
          intent: {
            userId: ownerUserId,
            patch,
            idempotencyKey: createAccountProfileIdempotencyKey(),
          },
        };
        profileUpdateIntentRef.current = active;
      }
      try {
        const result = parseAccountProfileUpdateReceipt(
          await smartHealthApi.updateMe(active.intent),
          active.intent,
          profileAuthorityUserIdRef.current,
        );
        profileUpdateIntentRef.current = null;
        return result;
      } catch (error) {
        if (isAccountProfileIdempotencyCollision(error)) {
          profileUpdateIntentRef.current = null;
        }
        throw error;
      }
    },
    onSuccess: async (result) => {
      setProfile((current) => ({
        ...current,
        name: result.user.name,
        title: result.user.title,
        phone: result.user.phone,
        license: result.user.license,
        hospital: result.user.hospital,
        department: result.user.department,
        specialty: result.user.specialty,
        address: result.user.address,
      }));
      setProfileDraftDirty(false);
      toast.success("Đã lưu hồ sơ cá nhân");
      await refreshAccountState();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      assertAvatarFile(file);
      const ownerUserId = avatarAuthorityUserIdRef.current;
      const workspaceId = avatarAuthorityWorkspaceIdRef.current;
      if (!ownerUserId || !workspaceId) {
        throw new SettingsActionError(
          "Không thể xác định tài khoản/workspace đang sở hữu thao tác tải ảnh.",
        );
      }
      let operationAuthority: AvatarMutationAuthority = {
        userId: ownerUserId,
        workspaceId,
        authSessionId: avatarAuthoritySessionIdRef.current,
        authSessionEpoch: avatarAuthorityEpochRef.current,
        bearerToken: avatarAuthorityBearerRef.current,
      };
      let intent: AvatarUploadIntent | null = null;
      try {
        const authority = await smartHealthApi.resolveAvatarMutationAuthority(
          ownerUserId,
          workspaceId,
        );
        if (
          authority.userId !== avatarAuthorityUserIdRef.current ||
          authority.workspaceId !== avatarAuthorityWorkspaceIdRef.current ||
          authority.authSessionEpoch !== avatarAuthorityEpochRef.current ||
          authority.bearerToken !== avatarAuthorityBearerRef.current
        ) {
          throw avatarAuthorityReplacedError();
        }
        if (
          operationAuthority.authSessionId &&
          authority.authSessionId !== operationAuthority.authSessionId
        ) {
          avatarUploadIntentRef.current = null;
          avatarAuthoritySessionIdRef.current = authority.authSessionId;
          client.setQueryData(avatarAuthorityQueryKey, authority);
          throw avatarAuthorityReplacedError();
        }
        avatarAuthoritySessionIdRef.current = authority.authSessionId;
        operationAuthority = authority;
        const sha256 = await hashAvatarFile(file);
        if (!isCurrentAvatarAuthority(authority)) {
          throw avatarAuthorityReplacedError();
        }
        const fingerprint = avatarUploadIntentFingerprint({
          ...authority,
          fileName: file.name,
          contentType: file.type,
          byteSize: file.size,
          sha256,
        });
        let active = avatarUploadIntentRef.current;
        if (!active || active.fingerprint !== fingerprint) {
          active = {
            fingerprint,
            intent: {
              ...authority,
              fileName: file.name,
              contentType: file.type,
              byteSize: file.size,
              sha256,
              idempotencyKey: createAvatarIdempotencyKey("upload"),
            },
          };
          avatarUploadIntentRef.current = active;
        }
        intent = active.intent;
        const result = parseAvatarUploadReceipt(
          await smartHealthApi.uploadMyAvatar(file, intent),
          intent,
          avatarAuthorityUserIdRef.current,
        );
        if (!isCurrentAvatarAuthority(intent)) {
          throw avatarAuthorityReplacedError();
        }
        if (
          avatarUploadIntentRef.current?.intent.idempotencyKey ===
          intent.idempotencyKey
        ) {
          avatarUploadIntentRef.current = null;
        }
        return { ...result, authority: intent };
      } catch (error) {
        const ownsActiveIntent = Boolean(
          intent &&
            avatarUploadIntentRef.current?.intent.idempotencyKey ===
              intent.idempotencyKey,
        );
        const authority = intent || operationAuthority;
        const authorityReplaced = isAvatarAuthorityReplaced(error);
        if (authorityReplaced || !isCurrentAvatarAuthority(authority)) {
          if (ownsActiveIntent) avatarUploadIntentRef.current = null;
          if (authorityReplaced) throw error;
          throw avatarAuthorityReplacedError();
        }
        if (isAvatarIdempotencyCollision(error) && ownsActiveIntent) {
          avatarUploadIntentRef.current = null;
        }
        throw bindAvatarMutationError(
          error,
          authority,
          intent?.idempotencyKey,
        );
      }
    },
    onSuccess: async (result, file) => {
      if (!isCurrentAvatarAuthority(result.authority)) return;
      setObjectAvatarPreview(file);
      setProfile((current) => ({
        ...current,
        avatarFileId: result.avatar.fileId,
        avatarUrl: result.avatar.downloadUrl,
      }));
      setConfirmAvatarDelete(false);
      if (
        result.cleanup.status === "pending" ||
        result.cleanup.status === "dead_letter"
      ) {
        setAvatarCleanupNotice({
          userId: result.avatar.ownerUserId,
          workspaceId: result.authority.workspaceId,
          status: result.cleanup.status,
          action: "upload",
          previousFileId: result.cleanup.previousFileId,
        });
        toast.warning(
          result.cleanup.status === "dead_letter"
            ? "Ảnh mới đã được xác nhận, nhưng cần hỗ trợ để dọn tệp cũ."
            : "Ảnh mới đã được xác nhận; việc dọn tệp cũ vẫn đang chạy.",
        );
      } else {
        setAvatarCleanupNotice(null);
        toast.success("Đã cập nhật ảnh đại diện");
      }
      await refreshAccountState();
    },
    onError: (error) => {
      if (!isCurrentAvatarMutationError(error)) {
        const binding = avatarMutationErrorBinding(error);
        if (
          binding?.idempotencyKey &&
          avatarUploadIntentRef.current?.intent.idempotencyKey ===
            binding.idempotencyKey
        ) {
          avatarUploadIntentRef.current = null;
        }
        uploadAvatar.reset();
        return;
      }
      toast.error(errorText(error));
    },
  });

  const deleteAvatar = useMutation({
    mutationFn: async () => {
      const ownerUserId = avatarAuthorityUserIdRef.current;
      const workspaceId = avatarAuthorityWorkspaceIdRef.current;
      const expectedAvatarFileId = profile.avatarFileId.trim();
      if (!ownerUserId || !workspaceId || !expectedAvatarFileId) {
        throw new SettingsActionError(
          "Không thể xác định chính xác ảnh đại diện đang cần xoá.",
        );
      }
      let operationAuthority: AvatarMutationAuthority = {
        userId: ownerUserId,
        workspaceId,
        authSessionId: avatarAuthoritySessionIdRef.current,
        authSessionEpoch: avatarAuthorityEpochRef.current,
        bearerToken: avatarAuthorityBearerRef.current,
      };
      let intent: AvatarDeleteIntent | null = null;
      try {
        const authority = await smartHealthApi.resolveAvatarMutationAuthority(
          ownerUserId,
          workspaceId,
        );
        if (
          authority.userId !== avatarAuthorityUserIdRef.current ||
          authority.workspaceId !== avatarAuthorityWorkspaceIdRef.current ||
          authority.authSessionEpoch !== avatarAuthorityEpochRef.current ||
          authority.bearerToken !== avatarAuthorityBearerRef.current
        ) {
          throw avatarAuthorityReplacedError();
        }
        if (
          operationAuthority.authSessionId &&
          authority.authSessionId !== operationAuthority.authSessionId
        ) {
          avatarDeleteIntentRef.current = null;
          avatarAuthoritySessionIdRef.current = authority.authSessionId;
          client.setQueryData(avatarAuthorityQueryKey, authority);
          throw avatarAuthorityReplacedError();
        }
        avatarAuthoritySessionIdRef.current = authority.authSessionId;
        operationAuthority = authority;
        const fingerprint = avatarDeleteIntentFingerprint({
          ...authority,
          expectedAvatarFileId,
        });
        let active = avatarDeleteIntentRef.current;
        if (!active || active.fingerprint !== fingerprint) {
          active = {
            fingerprint,
            intent: {
              ...authority,
              expectedAvatarFileId,
              idempotencyKey: createAvatarIdempotencyKey("delete"),
            },
          };
          avatarDeleteIntentRef.current = active;
        }
        intent = active.intent;
        const result = parseAvatarDeleteReceipt(
          await smartHealthApi.deleteMyAvatar(intent),
          intent,
          avatarAuthorityUserIdRef.current,
        );
        if (!isCurrentAvatarAuthority(intent)) {
          throw avatarAuthorityReplacedError();
        }
        if (
          avatarDeleteIntentRef.current?.intent.idempotencyKey ===
          intent.idempotencyKey
        ) {
          avatarDeleteIntentRef.current = null;
        }
        return { ...result, authority: intent };
      } catch (error) {
        const ownsActiveIntent = Boolean(
          intent &&
            avatarDeleteIntentRef.current?.intent.idempotencyKey ===
              intent.idempotencyKey,
        );
        const authority = intent || operationAuthority;
        const authorityReplaced = isAvatarAuthorityReplaced(error);
        if (authorityReplaced || !isCurrentAvatarAuthority(authority)) {
          if (ownsActiveIntent) avatarDeleteIntentRef.current = null;
          if (authorityReplaced) throw error;
          throw avatarAuthorityReplacedError();
        }
        if (isAvatarIdempotencyCollision(error) && ownsActiveIntent) {
          avatarDeleteIntentRef.current = null;
        }
        throw bindAvatarMutationError(
          error,
          authority,
          intent?.idempotencyKey,
        );
      }
    },
    onSuccess: async (result) => {
      if (!isCurrentAvatarAuthority(result.authority)) return;
      setObjectAvatarPreview(null);
      setProfile((current) => ({
        ...current,
        avatarFileId: "",
        avatarUrl: "",
      }));
      setConfirmAvatarDelete(false);
      if (
        result.cleanup.status === "pending" ||
        result.cleanup.status === "dead_letter"
      ) {
        setAvatarCleanupNotice({
          userId: result.avatar.ownerUserId,
          workspaceId: result.authority.workspaceId,
          status: result.cleanup.status,
          action: "delete",
          previousFileId: result.cleanup.previousFileId,
        });
        toast.warning(
          result.cleanup.status === "dead_letter"
            ? "Ảnh đã được gỡ khỏi hồ sơ, nhưng cần hỗ trợ để dọn tệp lưu trữ."
            : "Ảnh đã được gỡ khỏi hồ sơ; việc dọn tệp lưu trữ vẫn đang chạy.",
        );
      } else {
        setAvatarCleanupNotice(null);
        toast.success("Đã xoá ảnh đại diện");
      }
      await refreshAccountState();
    },
    onError: (error) => {
      if (!isCurrentAvatarMutationError(error)) {
        const binding = avatarMutationErrorBinding(error);
        if (
          binding?.idempotencyKey &&
          avatarDeleteIntentRef.current?.intent.idempotencyKey ===
            binding.idempotencyKey
        ) {
          avatarDeleteIntentRef.current = null;
        }
        deleteAvatar.reset();
        return;
      }
      toast.error(errorText(error));
    },
  });

  useEffect(() => {
    if (
      uploadAvatar.error &&
      !isCurrentAvatarMutationError(uploadAvatar.error)
    ) {
      const binding = avatarMutationErrorBinding(uploadAvatar.error);
      if (
        binding?.idempotencyKey &&
        avatarUploadIntentRef.current?.intent.idempotencyKey ===
          binding.idempotencyKey
      ) {
        avatarUploadIntentRef.current = null;
      }
      uploadAvatar.reset();
    }
    if (
      deleteAvatar.error &&
      !isCurrentAvatarMutationError(deleteAvatar.error)
    ) {
      const binding = avatarMutationErrorBinding(deleteAvatar.error);
      if (
        binding?.idempotencyKey &&
        avatarDeleteIntentRef.current?.intent.idempotencyKey ===
          binding.idempotencyKey
      ) {
        avatarDeleteIntentRef.current = null;
      }
      deleteAvatar.reset();
    }
  }, [
    avatarAuthSessionEpoch,
    avatarBearerToken,
    avatarAuthorityQuery.data?.authSessionId,
    currentUser?.id,
    user?.currentWorkspace.id,
    uploadAvatar.error,
    uploadAvatar.reset,
    deleteAvatar.error,
    deleteAvatar.reset,
    isCurrentAvatarMutationError,
  ]);

  const downloadAvatar = useMutation({
    mutationFn: smartHealthApi.downloadMyAvatar,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `smart-health-avatar-${user?.id || "user"}.png`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const authenticatePasswordAuthority = async (
    credentialPassword: string,
    expectedUserId: string,
    action: string,
  ) => {
    const closeOwnedPasswordSession = async (
      authToken: string,
      firebaseUid: string | null,
    ) => {
      if (!authToken) return;
      await logout({
        userId: expectedUserId,
        firebaseUid,
        authToken,
      }).catch(() => false);
      smartHealthApi.clearTokenIfMatches(authToken);
    };

    const abandonStalePasswordIntent = async () => {
      passwordChangeIntentRef.current = null;
      setPassword({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      try {
        await refreshUser();
      } catch {
        // The stale operation is already destroyed; authority refresh is best effort.
      }
    };

    if (passwordAuthorityUserIdRef.current !== expectedUserId) {
      const staleIntent = passwordChangeIntentRef.current;
      if (staleIntent) {
        await closeOwnedPasswordSession(
          staleIntent.authToken,
          staleIntent.firebaseUid,
        );
      }
      await abandonStalePasswordIntent();
      throw new SettingsActionError(
        "Tài khoản hiện tại đã thay đổi. Thao tác đổi mật khẩu đã dừng; vui lòng bắt đầu lại từ tài khoản cần cập nhật.",
      );
    }
    const priorAuthToken = smartHealthApi.getTokenSnapshot();
    const firebaseReceipt =
      await reauthenticateFirebasePassword(credentialPassword);
    if (
      passwordAuthorityUserIdRef.current !== expectedUserId ||
      getCurrentFirebaseUid() !== firebaseReceipt.uid
    ) {
      await closeOwnedPasswordSession(priorAuthToken, firebaseReceipt.uid);
      await abandonStalePasswordIntent();
      throw new SettingsActionError(
        "Tài khoản hiện tại đã thay đổi trong lúc xác thực. Mật khẩu chưa được gửi lại.",
      );
    }
    const authenticated = await smartHealthApi.authenticateFirebase(
      firebaseReceipt.idToken,
    );
    if (
      authenticated.user?.id !== expectedUserId ||
      passwordAuthorityUserIdRef.current !== expectedUserId ||
      getCurrentFirebaseUid() !== firebaseReceipt.uid ||
      smartHealthApi.getTokenSnapshot() !== firebaseReceipt.idToken ||
      (authenticated.user.firebaseUid !== undefined &&
        authenticated.user.firebaseUid !== firebaseReceipt.uid)
    ) {
      await closeOwnedPasswordSession(
        firebaseReceipt.idToken,
        firebaseReceipt.uid,
      );
      await abandonStalePasswordIntent();
      throw new SettingsActionError(
        `Backend chưa xác nhận đúng tài khoản khi ${action}. Thao tác cũ đã bị hủy; tài khoản hiện tại không bị đăng xuất.`,
      );
    }
    return firebaseReceipt;
  };

  const changePassword = useMutation({
    mutationFn: async () => {
      const { currentPassword, newPassword, confirmPassword } = password;
      if (currentPassword.length === 0)
        throw new SettingsActionError("Vui lòng nhập mật khẩu hiện tại.");
      if (newPassword.length < 8)
        throw new SettingsActionError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      if (
        !/[A-Z]/.test(newPassword) ||
        !/[a-z]/.test(newPassword) ||
        !/\d/.test(newPassword)
      ) {
        throw new SettingsActionError(
          "Mật khẩu mới phải có chữ hoa, chữ thường và chữ số.",
        );
      }
      if (newPassword === currentPassword) {
        throw new SettingsActionError(
          "Mật khẩu mới phải khác mật khẩu hiện tại.",
        );
      }
      if (newPassword !== confirmPassword)
        throw new SettingsActionError("Mật khẩu xác nhận chưa khớp.");

      const expectedUserId = currentUser?.id || user?.id;
      if (!expectedUserId) {
        throw new SettingsActionError(
          "Không xác định được tài khoản cần đổi mật khẩu. Vui lòng đăng nhập lại.",
        );
      }

      let intent = passwordChangeIntentRef.current;
      if (!intent || intent.userId !== expectedUserId) {
        const authToken = smartHealthApi.getTokenSnapshot();
        if (!authToken) {
          throw new SettingsActionError(
            "Phiên backend hiện tại không còn khả dụng. Vui lòng đăng nhập lại.",
          );
        }
        intent = {
          idempotencyKey: createIdempotencyKey("password-change"),
          userId: expectedUserId,
          authToken,
          firebaseUid: null,
          firebasePrepared: false,
          mutationOutcomeAmbiguous: false,
          tokenRecoveryAttempted: false,
        };
        passwordChangeIntentRef.current = intent;
      }

      if (hasFirebaseWebConfig() && !intent.firebasePrepared) {
        const firebaseReceipt = await authenticatePasswordAuthority(
          currentPassword,
          expectedUserId,
          "xác thực lại tài khoản trước khi đổi mật khẩu",
        );
        intent.authToken = firebaseReceipt.idToken;
        intent.firebaseUid = firebaseReceipt.uid;
        intent.firebasePrepared = true;
      }

      if (
        passwordAuthorityUserIdRef.current !== expectedUserId ||
        smartHealthApi.getTokenSnapshot() !== intent.authToken ||
        (intent.firebaseUid && getCurrentFirebaseUid() !== intent.firebaseUid)
      ) {
        passwordChangeIntentRef.current = null;
        throw new SettingsActionError(
          "Tài khoản hoặc phiên đăng nhập đã thay đổi. Thao tác đổi mật khẩu cũ đã bị hủy.",
        );
      }

      const mutationPayload = { currentPassword, newPassword };
      const hadPreviousAmbiguousMutation = intent.mutationOutcomeAmbiguous;
      let result: Awaited<ReturnType<typeof smartHealthApi.changePassword>>;
      try {
        result = await smartHealthApi.changePassword(
          mutationPayload,
          intent.idempotencyKey,
        );
      } catch (error) {
        const canRecoverRevokedToken =
          hasFirebaseWebConfig() &&
          hadPreviousAmbiguousMutation &&
          !intent.tokenRecoveryAttempted &&
          isPasswordMutationTokenRecoveryError(error);
        intent.mutationOutcomeAmbiguous =
          intent.mutationOutcomeAmbiguous ||
          isAmbiguousPasswordMutationError(error);
        if (!canRecoverRevokedToken) throw error;

        intent.tokenRecoveryAttempted = true;
        const firebaseReceipt = await authenticatePasswordAuthority(
          newPassword,
          expectedUserId,
          "khôi phục biên nhận đổi mật khẩu",
        );
        intent.authToken = firebaseReceipt.idToken;
        intent.firebaseUid = firebaseReceipt.uid;
        intent.firebasePrepared = true;
        result = await smartHealthApi.changePassword(
          mutationPayload,
          intent.idempotencyKey,
        );
      }
      requireConfirmedUser(result, expectedUserId, "đổi mật khẩu");
      if (
        result.ok !== true ||
        (result.provider !== "firebase" && result.provider !== "demo") ||
        !result.operationId ||
        typeof result.replayed !== "boolean"
      ) {
        throw new SettingsActionError(
          "Backend chưa xác nhận đổi mật khẩu. Trạng thái mật khẩu chưa được suy diễn; vui lòng thử lại bằng cùng thao tác.",
        );
      }

      if (result.provider === "firebase" && !intent.firebaseUid) {
        smartHealthApi.clearTokenIfMatches(intent.authToken);
        passwordChangeIntentRef.current = null;
        setPassword({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        throw new SettingsActionError(
          "Backend xác nhận Firebase nhưng thao tác không còn định danh phiên Firebase ban đầu. Phiên backend cũ đã bị loại bỏ.",
        );
      }

      passwordChangeIntentRef.current = null;
      setPassword({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      const loggedOut = await logout({
        userId: expectedUserId,
        firebaseUid: result.provider === "firebase" ? intent.firebaseUid : null,
        authToken: intent.authToken,
      });
      if (!loggedOut) {
        smartHealthApi.clearTokenIfMatches(intent.authToken);
        throw new SettingsActionError(
          "Mật khẩu của tài khoản ban đầu đã thay đổi, nhưng phiên hiện tại không còn thuộc tài khoản đó nên không bị đăng xuất.",
        );
      }
      return result;
    },
    onSuccess: () => {
      toast.success("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const revokeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const ownerUserId = String(user?.id || "").trim();
      if (!ownerUserId) {
        throw new SettingsActionError(
          "Không thể xác định tài khoản đang sở hữu thao tác thu hồi phiên.",
        );
      }
      const operationScope = `${ownerUserId}:${sessionId}`;
      const key =
        sessionRevokeKeysRef.current.get(operationScope) ||
        createAuthSessionRevokeIdempotencyKey();
      sessionRevokeKeysRef.current.set(operationScope, key);
      const intent: AuthSessionRevokeIntent = {
        userId: ownerUserId,
        sessionId,
        idempotencyKey: key,
      };
      let result: AuthSessionRevokeReceipt;
      try {
        result = parseAuthSessionRevokeReceipt(
          await smartHealthApi.revokeSession(intent),
          intent,
          sessionAuthorityUserIdRef.current,
        );
      } catch (error) {
        if (isAuthSessionIdempotencyCollision(error)) {
          sessionRevokeKeysRef.current.delete(operationScope);
        }
        throw error;
      }
      sessionRevokeKeysRef.current.delete(operationScope);
      return result;
    },
    onSuccess: async () => {
      setConfirmSessionId("");
      toast.success("Đã thu hồi phiên đăng nhập");
      await client.invalidateQueries({ queryKey: ["portal", "auth-sessions"] });
    },
    onError: (error) => {
      if (isAuthSessionIdempotencyCollision(error)) {
        setConfirmSessionId("");
      }
      toast.error(errorText(error));
    },
  });

  const revokeOtherSessions = useMutation({
    mutationFn: async () => {
      const ownerUserId = String(user?.id || "").trim();
      if (!ownerUserId) {
        throw new SettingsActionError(
          "Không thể xác định tài khoản đang sở hữu thao tác thu hồi phiên.",
        );
      }
      const targets = [...otherSessions];
      const results = await Promise.allSettled(
        targets.map(async (session) => {
          const operationScope = `${ownerUserId}:${session.id}`;
          const key =
            revokeAllSessionKeysRef.current.get(operationScope) ||
            createAuthSessionRevokeIdempotencyKey();
          revokeAllSessionKeysRef.current.set(operationScope, key);
          const intent: AuthSessionRevokeIntent = {
            userId: ownerUserId,
            sessionId: session.id,
            idempotencyKey: key,
          };
          let result: AuthSessionRevokeReceipt;
          try {
            result = parseAuthSessionRevokeReceipt(
              await smartHealthApi.revokeSession(intent),
              intent,
              sessionAuthorityUserIdRef.current,
            );
          } catch (error) {
            if (isAuthSessionIdempotencyCollision(error)) {
              revokeAllSessionKeysRef.current.delete(operationScope);
            }
            throw error;
          }
          revokeAllSessionKeysRef.current.delete(operationScope);
          return result;
        }),
      );
      const confirmed = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const collision = results.some(
        (result) =>
          result.status === "rejected" &&
          isAuthSessionIdempotencyCollision(result.reason),
      );
      if (confirmed !== targets.length) {
        const error = new SettingsActionError(
          `Backend chỉ xác nhận thu hồi ${confirmed}/${targets.length} phiên. Danh sách sẽ được tải lại; hãy kiểm tra và thử lại.`,
        );
        if (collision) {
          Object.assign(error, {
            code: "IDEMPOTENCY_KEY_REUSED",
            status: 409,
          });
        }
        throw error;
      }
      return confirmed;
    },
    onSuccess: async () => {
      setConfirmRevokeAll(false);
      toast.success("Đã thu hồi các phiên khác");
    },
    onError: (error) => {
      if (isAuthSessionIdempotencyCollision(error)) {
        setConfirmRevokeAll(false);
      }
      toast.error(errorText(error));
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["portal", "auth-sessions"] });
    },
  });

  const savePreferences = useMutation({
    mutationFn: async () => {
      const expectedUserId = currentUser?.id || user?.id;
      const expectedWorkspaceId = user?.currentWorkspace.id;
      if (!notificationPreferencesQuery.data) {
        throw new SettingsActionError(
          "Chưa tải được cài đặt thông báo đã xác nhận. Vui lòng tải lại trước khi lưu.",
        );
      }
      const baseline = requireNotificationPreferencesOwner(
        notificationPreferencesQuery.data,
        expectedUserId,
        expectedWorkspaceId,
        "đối chiếu cài đặt thông báo",
      );
      const changes = preferenceFields.filter(
        (field) => baseline.preferences[field.key] !== preferences[field.key],
      );
      if (changes.length === 0) {
        throw new SettingsActionError(
          "Không có thay đổi cài đặt thông báo cần lưu.",
        );
      }
      let confirmed = baseline;
      for (const field of changes) {
        const enabled = preferences[field.key];
        const mutationIdentity = `${field.key}:${enabled}`;
        const operationKey =
          notificationPreferenceKeysRef.current.get(mutationIdentity) ||
          createIdempotencyKey(`notification-${field.key}`);
        notificationPreferenceKeysRef.current.set(
          mutationIdentity,
          operationKey,
        );
        const response = requireNotificationPreferencesOwner(
          await smartHealthApi.patchNotificationPreference(
            field.key,
            enabled,
            operationKey,
          ),
          expectedUserId,
          expectedWorkspaceId,
          `lưu tùy chọn ${field.label}`,
        );
        if (response.preferences[field.key] !== enabled) {
          throw new SettingsActionError(
            `Backend chưa xác nhận tùy chọn ${field.label}. Lựa chọn hiện tại chưa được coi là đã lưu; vui lòng thử lại.`,
          );
        }
        notificationPreferenceKeysRef.current.delete(mutationIdentity);
        confirmed = response;
        client.setQueryData(notificationPreferencesQueryKey, response);
      }
      return confirmed;
    },
    onSuccess: async (result) => {
      client.setQueryData(notificationPreferencesQueryKey, result);
      setPreferences(result.preferences);
      setNotificationDraftDirty(false);
      toast.success("Đã lưu cài đặt thông báo");
      await refreshAccountState();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const saveWorkspace = useMutation({
    mutationFn: async () => {
      const payload = {
        name: workspaceForm.name.trim(),
        address: workspaceForm.address.trim(),
        phone: workspaceForm.phone.trim(),
        email: workspaceForm.email.trim().toLowerCase(),
        website: workspaceForm.website.trim(),
      };
      if (!payload.name) {
        throw new SettingsActionError("Vui lòng nhập tên workspace.");
      }
      if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        throw new SettingsActionError("Email workspace chưa đúng định dạng.");
      }
      if (payload.website) {
        try {
          const website = new URL(payload.website);
          if (!["http:", "https:"].includes(website.protocol))
            throw new Error();
        } catch {
          throw new SettingsActionError(
            "Website phải là địa chỉ HTTP hoặc HTTPS hợp lệ.",
          );
        }
      }
      const userId = user?.id || "";
      const workspaceId = user?.currentWorkspace.id || "";
      const expectedVersion = Number(settingsQuery.data?.workspace?.version);
      if (
        !userId ||
        !workspaceId ||
        !Number.isInteger(expectedVersion) ||
        expectedVersion < 1
      ) {
        throw new SettingsActionError(
          "Không thể xác định tài khoản, workspace hoặc phiên bản hiện tại. Vui lòng tải lại trước khi lưu.",
        );
      }
      const baseIntent = { userId, workspaceId, expectedVersion, payload };
      const fingerprint = workspaceSettingsIntentFingerprint(baseIntent);
      let intent = workspaceSettingsIntentRef.current?.intent;
      if (
        !intent ||
        workspaceSettingsIntentRef.current?.fingerprint !== fingerprint
      ) {
        intent = {
          ...baseIntent,
          idempotencyKey: createWorkspaceSettingsIdempotencyKey(),
        };
        workspaceSettingsIntentRef.current = { fingerprint, intent };
      }
      try {
        const result = parseWorkspaceSettingsReceipt(
          await smartHealthApi.updateWorkspace(intent),
          intent,
          user?.id || "",
          user?.currentWorkspace.id || "",
        );
        workspaceSettingsIntentRef.current = null;
        return result;
      } catch (error) {
        if (isWorkspaceSettingsIdempotencyCollision(error)) {
          workspaceSettingsIntentRef.current = null;
        }
        throw error;
      }
    },
    onSuccess: async (result) => {
      setWorkspaceForm({
        name: result.workspace.name || "",
        address: result.workspace.address || "",
        phone: result.workspace.phone || "",
        email: result.workspace.email || "",
        website: result.workspace.website || "",
      });
      setWorkspaceDraftDirty(false);
      toast.success("Đã cập nhật workspace");
      await refreshAccountState();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      assertAvatarFile(file);
    } catch (error) {
      toast.error(errorText(error, "Tệp ảnh đại diện không hợp lệ."));
      return;
    }
    uploadAvatar.mutate(file);
  };

  const updateProfileField = <K extends keyof ProfileForm>(
    key: K,
    value: ProfileForm[K],
  ) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setProfileDraftDirty(true);
    saveProfile.reset();
  };

  const updateWorkspaceField = <K extends keyof WorkspaceForm>(
    key: K,
    value: WorkspaceForm[K],
  ) => {
    setWorkspaceForm((current) => ({ ...current, [key]: value }));
    setWorkspaceDraftDirty(true);
    saveWorkspace.reset();
  };

  const updatePasswordField = (
    key: "currentPassword" | "newPassword" | "confirmPassword",
    value: string,
  ) => {
    passwordChangeIntentRef.current = null;
    setPassword((current) => ({ ...current, [key]: value }));
    changePassword.reset();
  };

  const avatarSrc = avatarPreview || profile.avatarUrl || user?.avatar || "";
  const passwordInputType = showPassword ? "text" : "password";

  if (accountQuery.isLoading && !currentUser) return <PortalLoading />;
  if (accountQuery.error)
    return (
      <PortalError
        error={
          new Error(
            errorText(accountQuery.error, "Không thể tải hồ sơ tài khoản."),
          )
        }
        retry={() => void accountQuery.refetch()}
      />
    );

  return (
    <div
      className="mx-auto max-w-6xl space-y-6"
      data-testid="portal-workspace-settings-page"
    >
      <header className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Settings aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Tài khoản & workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Quản lý danh tính, bảo mật, kênh thông báo và thông tin tổ chức từ
            một nơi nhất quán.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
          <span className="truncate font-semibold text-foreground">
            {profile.email || user?.email}
          </span>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <Badge variant="secondary">
              {user?.role === "workspace_admin"
                ? "Quản trị workspace"
                : user?.role || "Thành viên"}
            </Badge>
            <span className="truncate">
              {user?.currentWorkspace.name || "Workspace"}
            </span>
          </div>
        </div>
      </header>

      {!online && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-sm text-[var(--status-warning-fg)]"
        >
          <CloudOff className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Bạn đang ngoại tuyến</p>
            <p className="mt-1">
              Có thể xem dữ liệu đã tải, nhưng thao tác lưu sẽ mở lại khi kết
              nối được khôi phục.
            </p>
          </div>
        </div>
      )}

      {hasUnsavedChanges && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-4 py-3 text-sm text-[var(--status-info-fg)]"
        >
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Có thay đổi chưa lưu.</strong> Dữ liệu nháp được giữ khi
            chuyển tab trong trang này.
          </span>
        </div>
      )}

      <AlertDialog
        open={
          Boolean(pendingSettingsTab) ||
          recoveryNavigationBlocker.state === "blocked"
        }
        onOpenChange={(open) => {
          if (!open) cancelRecoveryNavigation();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Rời mã khôi phục dùng một lần?
            </AlertDialogTitle>
            <AlertDialogDescription>
              2FA vẫn chưa được bật. Nếu rời bước này, bộ mã đang hiển thị sẽ
              bị bỏ và bạn phải bắt đầu lại an toàn để nhận bộ mã mới.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ở lại và xác nhận</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmRecoveryNavigation}
            >
              Rời và bắt đầu lại
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs value={activeTab} onValueChange={handleSettingsTabChange}>
        <TabsList
          aria-label="Nhóm cài đặt"
          className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl p-1 lg:grid-cols-4"
        >
          <TabsTrigger
            id="portal-settings-profile-tab"
            value="profile"
            onClick={() => handleSettingsTabChange("profile")}
            className="min-h-11 gap-2 px-3"
          >
            <UserRound aria-hidden="true" />
            Hồ sơ
          </TabsTrigger>
          <TabsTrigger
            id="portal-settings-security-tab"
            value="security"
            onClick={() => handleSettingsTabChange("security")}
            className="min-h-11 gap-2 px-3"
          >
            <ShieldCheck aria-hidden="true" />
            Bảo mật
          </TabsTrigger>
          <TabsTrigger
            id="portal-settings-notifications-tab"
            value="notifications"
            onClick={() => handleSettingsTabChange("notifications")}
            className="min-h-11 gap-2 px-3"
          >
            <Bell aria-hidden="true" />
            Thông báo
          </TabsTrigger>
          <TabsTrigger
            id="portal-settings-workspace-tab"
            value="workspace"
            onClick={() => handleSettingsTabChange("workspace")}
            className="min-h-11 gap-2 px-3"
          >
            <Building2 aria-hidden="true" />
            Workspace
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-5">
          <Card className="p-5 md:p-6">
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="lg:w-64">
                <div className="flex items-center gap-4 lg:block">
                  <Avatar className="size-24 rounded-2xl border bg-muted text-3xl font-bold">
                    {avatarSrc && (
                      <AvatarImage
                        src={avatarSrc}
                        alt={`Ảnh đại diện của ${profile.name || "tài khoản Shcare"}`}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="rounded-2xl text-2xl font-bold text-primary">
                      {(profile.name || profile.email || "S")
                        .slice(0, 1)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="space-y-1 lg:mt-4">
                    <h2 className="text-lg font-semibold text-foreground">
                      Hồ sơ cá nhân
                    </h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Thông tin hiển thị trong workspace và hồ sơ chuyên môn.
                    </p>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  id="account-avatar-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <div className="mt-5 grid gap-2">
                  <Button
                    id="account-upload-avatar"
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadAvatar.isPending || !online}
                    className="min-h-11 w-full"
                  >
                    <UploadCloud aria-hidden="true" />
                    {uploadAvatar.isPending ? "Đang tải ảnh..." : "Tải ảnh lên"}
                  </Button>
                  <Button
                    id="account-download-avatar"
                    type="button"
                    variant="outline"
                    onClick={() => downloadAvatar.mutate()}
                    disabled={
                      !profile.avatarFileId ||
                      downloadAvatar.isPending ||
                      !online
                    }
                    className="min-h-11 w-full"
                  >
                    <Camera aria-hidden="true" />
                    Tải ảnh xuống
                  </Button>
                  <Button
                    id="account-delete-avatar"
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmAvatarDelete(true)}
                    disabled={
                      (!profile.avatarFileId && !profile.avatarUrl) ||
                      deleteAvatar.isPending ||
                      !online
                    }
                    className="min-h-11 w-full border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                    {deleteAvatar.isPending ? "Đang xoá ảnh..." : "Xoá ảnh"}
                  </Button>
                </div>
                <AlertDialog
                  open={confirmAvatarDelete}
                  onOpenChange={setConfirmAvatarDelete}
                >
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Xoá ảnh đại diện?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Ảnh hiện tại sẽ bị xoá khỏi tài khoản. Bạn có thể tải
                        ảnh mới lên sau.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleteAvatar.isPending}>
                        Huỷ
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteAvatar.mutate()}
                        disabled={deleteAvatar.isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Xác nhận xoá
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {uploadAvatar.error &&
                  isCurrentAvatarMutationError(uploadAvatar.error) && (
                  <div className="mt-3">
                    <SettingsInlineError
                      error={uploadAvatar.error}
                      fallback="Không thể cập nhật ảnh đại diện."
                      retry={
                        uploadAvatar.variables
                          ? () => uploadAvatar.mutate(uploadAvatar.variables)
                          : undefined
                      }
                    />
                  </div>
                  )}
                {deleteAvatar.error &&
                  isCurrentAvatarMutationError(deleteAvatar.error) && (
                  <div className="mt-3">
                    <SettingsInlineError
                      error={deleteAvatar.error}
                      fallback="Không thể xoá ảnh đại diện."
                      retry={() => deleteAvatar.mutate()}
                    />
                  </div>
                  )}
                {downloadAvatar.error && (
                  <div className="mt-3">
                    <SettingsInlineError
                      error={downloadAvatar.error}
                      fallback="Không thể tải ảnh đại diện xuống."
                      retry={() => downloadAvatar.mutate()}
                    />
                  </div>
                )}
                {avatarCleanupQuery.error && (
                  <div className="mt-3">
                    <SettingsInlineError
                      error={avatarCleanupQuery.error}
                      fallback="Không thể kiểm tra trạng thái dọn tệp ảnh."
                      retry={() => void avatarCleanupQuery.refetch()}
                    />
                  </div>
                )}
                {avatarCleanupNotice &&
                  avatarCleanupNotice.userId ===
                    avatarAuthorityUserIdRef.current &&
                  avatarCleanupNotice.workspaceId ===
                    avatarAuthorityWorkspaceIdRef.current && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="mt-3 flex items-start gap-3 rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-sm text-[var(--status-warning-fg)]"
                    >
                      {avatarCleanupNotice.status === "dead_letter" ? (
                        <CircleAlert
                          className="mt-0.5 size-4 shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <RefreshCw
                          className="mt-0.5 size-4 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <div>
                        <p className="font-semibold">
                          {avatarCleanupNotice.status === "dead_letter"
                            ? "Cần hỗ trợ để dọn tệp ảnh"
                            : "Đang dọn tệp ảnh trong nền"}
                        </p>
                        <p className="mt-1 leading-6">
                          {avatarCleanupNotice.action === "upload"
                            ? "Ảnh mới đã hiển thị, nhưng tệp cũ chưa được xác nhận là đã dọn xong."
                            : avatarCleanupNotice.action === "delete"
                              ? "Ảnh đã được gỡ khỏi hồ sơ, nhưng tệp lưu trữ chưa được xác nhận là đã dọn xong."
                              : "Tệp ảnh tải lên chưa hoàn tất liên kết với hồ sơ và chưa được xác nhận là đã dọn xong."}{" "}
                          {avatarCleanupNotice.status === "dead_letter"
                            ? "Hệ thống đã dừng tự thử lại. Vui lòng liên hệ hỗ trợ và không tải lại cùng tệp chỉ để xoá cảnh báo này."
                            : "Backend sẽ tự thử lại; trạng thái này chưa phải là hoàn tất cuối."}
                        </p>
                      </div>
                    </div>
                  )}
              </div>

              <form
                className="grid flex-1 gap-4 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const patch = accountProfilePatchFromDraft(
                    profile,
                    currentUser,
                  );
                  if (Object.keys(patch).length === 0) {
                    setProfileDraftDirty(false);
                    saveProfile.reset();
                    return;
                  }
                  saveProfile.mutate(patch);
                }}
              >
                <Field
                  id="account-name"
                  label="Họ tên"
                  value={profile.name}
                  onChange={(value) => updateProfileField("name", value)}
                  autoComplete="name"
                />
                <Field
                  id="account-title"
                  label="Chức danh"
                  value={profile.title}
                  onChange={(value) => updateProfileField("title", value)}
                  autoComplete="organization-title"
                />
                <Field
                  id="account-email"
                  label="Email đăng nhập"
                  value={profile.email}
                  onChange={() => undefined}
                  disabled
                  autoComplete="email"
                />
                <Field
                  id="account-phone"
                  label="Số điện thoại"
                  value={profile.phone}
                  onChange={(value) => updateProfileField("phone", value)}
                  autoComplete="tel"
                />
                <Field
                  id="account-license"
                  label="Số chứng chỉ hành nghề"
                  value={profile.license}
                  onChange={(value) => updateProfileField("license", value)}
                />
                <Field
                  id="account-hospital"
                  label="Bệnh viện / phòng khám"
                  value={profile.hospital}
                  onChange={(value) => updateProfileField("hospital", value)}
                />
                <Field
                  id="account-department"
                  label="Khoa / bộ phận"
                  value={profile.department}
                  onChange={(value) => updateProfileField("department", value)}
                />
                <Field
                  id="account-specialty"
                  label="Chuyên khoa"
                  value={profile.specialty}
                  onChange={(value) => updateProfileField("specialty", value)}
                />
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="account-address">Địa chỉ liên hệ</Label>
                  <Textarea
                    id="account-address"
                    name="account-address"
                    value={profile.address}
                    onChange={(event) =>
                      updateProfileField("address", event.target.value)
                    }
                    className="min-h-24 resize-y"
                  />
                </div>
                <Button
                  id="account-save-profile"
                  type="submit"
                  disabled={
                    saveProfile.isPending || !profileDraftDirty || !online
                  }
                  className="min-h-11 md:max-w-xs"
                >
                  <Save aria-hidden="true" />
                  {saveProfile.isPending ? "Đang lưu hồ sơ..." : "Lưu hồ sơ"}
                </Button>
                {saveProfile.error && (
                  <div className="md:col-span-2">
                    <SettingsInlineError
                      error={saveProfile.error}
                      fallback="Không thể lưu hồ sơ."
                      retry={
                        saveProfile.variables
                          ? () => saveProfile.mutate(saveProfile.variables)
                          : undefined
                      }
                    />
                  </div>
                )}
              </form>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-5">
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="p-5 md:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Lock aria-hidden="true" />
                    Đổi mật khẩu
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Cập nhật mật khẩu đăng nhập cho tài khoản hiện tại.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPassword((value) => !value)}
                  className="size-11 shrink-0"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </Button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  changePassword.mutate();
                }}
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <Field
                    id="account-current-password"
                    label="Mật khẩu hiện tại"
                    type={passwordInputType}
                    value={password.currentPassword}
                    onChange={(value) =>
                      updatePasswordField("currentPassword", value)
                    }
                    autoComplete="current-password"
                  />
                  <Field
                    id="account-new-password"
                    label="Mật khẩu mới"
                    type={passwordInputType}
                    value={password.newPassword}
                    onChange={(value) =>
                      updatePasswordField("newPassword", value)
                    }
                    autoComplete="new-password"
                  />
                  <Field
                    id="account-confirm-password"
                    label="Xác nhận mật khẩu"
                    type={passwordInputType}
                    value={password.confirmPassword}
                    onChange={(value) =>
                      updatePasswordField("confirmPassword", value)
                    }
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  id="account-change-password"
                  type="submit"
                  disabled={
                    changePassword.isPending || !passwordDraftDirty || !online
                  }
                  className="mt-5 min-h-11"
                >
                  <KeyRound aria-hidden="true" />
                  {changePassword.isPending
                    ? "Đang đổi mật khẩu..."
                    : "Đổi mật khẩu"}
                </Button>
              </form>
              {changePassword.error && (
                <div className="mt-4">
                  <SettingsInlineError
                    error={changePassword.error}
                    fallback="Không thể đổi mật khẩu."
                    retry={() => changePassword.mutate()}
                  />
                </div>
              )}
            </Card>

            <TwoFactorPanel
              userId={currentUser?.id || user?.id || ""}
              onPendingRecoveryChange={handlePendingRecoveryChange}
              onStatusChange={(enabled, method) =>
                setProfile((current) => ({
                  ...current,
                  twoFactorEnabled: enabled,
                  twoFactorMethod: method,
                }))
              }
            />

            <Card className="p-5 md:p-6 lg:col-span-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <LogOut aria-hidden="true" />
                    Phiên đăng nhập
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Theo dõi phiên hiện tại và thu hồi các phiên không còn dùng.
                  </p>
                </div>
                <Button
                  id="account-revoke-other-sessions"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    revokeOtherSessions.reset();
                    setConfirmRevokeAll(true);
                  }}
                  disabled={
                    revokeOtherSessions.isPending ||
                    sessionsQuery.isLoading ||
                    Boolean(sessionsQuery.error) ||
                    otherSessions.length === 0 ||
                    !online
                  }
                  className="min-h-11 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                >
                  {revokeOtherSessions.isPending
                    ? "Đang thu hồi..."
                    : "Thu hồi phiên khác"}
                </Button>
              </div>
              {confirmRevokeAll && (
                <div
                  role="alert"
                  className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-4 text-sm text-[var(--status-danger-fg)]"
                >
                  <span className="min-w-0 flex-1">
                    Thu hồi {otherSessions.length} phiên khác? Các thiết bị đó
                    sẽ phải đăng nhập lại.
                  </span>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => revokeOtherSessions.mutate()}
                    disabled={revokeOtherSessions.isPending || !online}
                    className="min-h-11"
                  >
                    Xác nhận thu hồi tất cả
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmRevokeAll(false)}
                    disabled={revokeOtherSessions.isPending}
                    className="min-h-11"
                  >
                    Huỷ
                  </Button>
                </div>
              )}
              {revokeOtherSessions.error && (
                <div className="mt-5">
                  <SettingsInlineError
                    error={revokeOtherSessions.error}
                    fallback="Không thể thu hồi toàn bộ phiên khác."
                    retry={() => revokeOtherSessions.mutate()}
                  />
                </div>
              )}
              {sessionsQuery.isLoading && (
                <div className="mt-5">
                  <PortalLoading label="Đang tải phiên đăng nhập..." />
                </div>
              )}
              {sessionsQuery.error && (
                <div className="mt-5">
                  <SettingsInlineError
                    error={sessionsQuery.error}
                    fallback="Không thể tải phiên đăng nhập."
                    retry={() => void sessionsQuery.refetch()}
                  />
                </div>
              )}
              {!sessionsQuery.isLoading && !sessionsQuery.error && (
                <div className="mt-5 divide-y overflow-hidden rounded-xl border">
                  {activeSessions.length === 0 && (
                    <div className="p-5 text-sm text-muted-foreground">
                      Chưa có dữ liệu phiên đăng nhập.
                    </div>
                  )}
                  {activeSessions.map((session) => (
                    <div
                      key={session.id}
                      data-testid={`auth-session-${session.id}`}
                      className="flex flex-col gap-3 bg-card p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="mt-1 flex size-11 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground"
                          aria-hidden="true"
                        >
                          {sessionIcon(session)}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                            {sessionDevice(session)}
                            {session.current && (
                              <Badge variant="secondary">Hiện tại</Badge>
                            )}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">
                            {String(session.provider || "smart-health")} ·{" "}
                            {session.ip || "IP ẩn"} ·{" "}
                            {formatDateTime(
                              session.lastSeenAt || session.createdAt,
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {confirmSessionId === session.id ? (
                          <div
                            role="alert"
                            className="flex flex-wrap items-center justify-end gap-2 text-sm"
                          >
                            <span className="text-[var(--status-danger-fg)]">
                              Thiết bị này sẽ phải đăng nhập lại.
                            </span>
                            <Button
                              type="button"
                              variant="destructive"
                              onClick={() => revokeSession.mutate(session.id)}
                              disabled={revokeSession.isPending || !online}
                              className="min-h-11"
                            >
                              Xác nhận thu hồi
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setConfirmSessionId("")}
                              disabled={revokeSession.isPending}
                              className="min-h-11"
                            >
                              Huỷ
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              revokeSession.reset();
                              setConfirmSessionId(session.id);
                            }}
                            disabled={
                              session.current ||
                              revokeSession.isPending ||
                              !online
                            }
                            className="min-h-11"
                          >
                            Thu hồi
                          </Button>
                        )}
                        {revokeSession.error &&
                          revokeSession.variables === session.id && (
                            <SettingsInlineError
                              error={revokeSession.error}
                              fallback="Không thể thu hồi phiên đăng nhập."
                              retry={() => revokeSession.mutate(session.id)}
                            />
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="notifications" className="mt-5">
          <Card className="p-5 md:p-6">
            <div className="mb-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Bell aria-hidden="true" />
                Thông báo cá nhân
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Tùy chọn được lưu theo tài khoản và đồng bộ với ứng dụng
                Android.
              </p>
            </div>
            {notificationPreferencesQuery.isLoading ? (
              <PortalLoading label="Đang tải cài đặt thông báo..." />
            ) : notificationPreferencesQuery.error ? (
              <SettingsInlineError
                error={notificationPreferencesQuery.error}
                fallback="Không thể tải cài đặt thông báo."
                retry={() => notificationPreferencesQuery.refetch()}
              />
            ) : (
              <>
                <div
                  className="mb-5 grid gap-3 sm:grid-cols-3"
                  aria-label="Trạng thái kênh thông báo"
                >
                  {notificationChannelFields.map((channelField) => {
                    const channel =
                      notificationPreferencesQuery.data?.channels[
                        channelField.key
                      ];
                    const ready = Boolean(
                      channel?.available && channel.status === "ready",
                    );
                    return (
                      <div
                        key={channelField.key}
                        className="rounded-xl border bg-muted/30 p-4"
                      >
                        <div className="text-sm font-semibold text-foreground">
                          {channelField.label}
                        </div>
                        <div
                          className={`mt-2 flex items-center gap-2 text-sm font-medium ${
                            ready
                              ? "text-[var(--status-success-fg)]"
                              : "text-[var(--status-warning-fg)]"
                          }`}
                        >
                          {ready && (
                            <CheckCircle2
                              className="size-4"
                              aria-hidden="true"
                            />
                          )}
                          {channel
                            ? notificationChannelStatus(channel)
                            : "Chưa xác định"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className="grid gap-3 md:grid-cols-2"
                  aria-busy={savePreferences.isPending}
                >
                  {preferenceFields.map((field) => (
                    <div
                      key={field.key}
                      className="flex min-h-28 items-start justify-between gap-4 rounded-xl border bg-card p-4 transition-colors duration-200 focus-within:border-primary/50 motion-reduce:transition-none"
                    >
                      <div>
                        <Label
                          htmlFor={`notification-${field.key}`}
                          className="block text-sm font-semibold text-foreground"
                        >
                          {field.label}
                        </Label>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {field.description}
                        </p>
                      </div>
                      <Checkbox
                        id={`notification-${field.key}`}
                        checked={preferences[field.key]}
                        disabled={
                          savePreferences.isPending ||
                          notificationPreferencesQuery.isFetching ||
                          (field.key !== "enabled" && !preferences.enabled)
                        }
                        onCheckedChange={(checked) => {
                          const enabled = checked === true;
                          const nextPreferences = {
                            ...preferences,
                            [field.key]: enabled,
                          };
                          const confirmed =
                            notificationPreferencesQuery.data?.preferences;
                          setPreferences(nextPreferences);
                          setNotificationDraftDirty(
                            !confirmed ||
                              preferenceFields.some(
                                (item) =>
                                  confirmed[item.key] !==
                                  nextPreferences[item.key],
                              ),
                          );
                          savePreferences.reset();
                        }}
                        className="size-11 rounded-lg"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  id="workspace-save-notifications"
                  type="button"
                  onClick={() => savePreferences.mutate()}
                  disabled={
                    savePreferences.isPending ||
                    notificationPreferencesQuery.isFetching ||
                    !notificationDraftDirty ||
                    !online
                  }
                  className="mt-5 min-h-11"
                >
                  <Save aria-hidden="true" />
                  {savePreferences.isPending
                    ? "Đang lưu thông báo..."
                    : "Lưu thông báo"}
                </Button>
                {savePreferences.error && (
                  <div className="mt-4">
                    <SettingsInlineError
                      error={savePreferences.error}
                      fallback="Không thể lưu cài đặt thông báo."
                      retry={() => savePreferences.mutate()}
                    />
                  </div>
                )}
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="workspace" className="mt-5">
          <Card className="p-5 md:p-6">
            <div className="mb-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Building2 aria-hidden="true" />
                Thông tin workspace
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {canManageWorkspace
                  ? "Bạn có quyền cập nhật thông tin tổ chức."
                  : "Thông tin tổ chức đang ở chế độ chỉ đọc với tài khoản này."}
              </p>
            </div>
            {!canManageWorkspace && (
              <div className="mb-5 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                Quyền chỉnh sửa do backend quyết định. Liên hệ quản trị
                workspace nếu thông tin cần được cập nhật.
              </div>
            )}
            {settingsQuery.isLoading && (
              <PortalLoading label="Đang tải thông tin workspace..." />
            )}
            {settingsQuery.error && (
              <SettingsInlineError
                error={settingsQuery.error}
                fallback="Không thể tải thông tin workspace."
                retry={() => void settingsQuery.refetch()}
              />
            )}
            {!settingsQuery.isLoading && !settingsQuery.error && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  saveWorkspace.mutate();
                }}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    id="workspace-name"
                    label="Tên workspace"
                    value={workspaceForm.name}
                    disabled={!canManageWorkspace}
                    onChange={(value) => updateWorkspaceField("name", value)}
                  />
                  <Field
                    id="workspace-phone"
                    label="Điện thoại"
                    value={workspaceForm.phone}
                    disabled={!canManageWorkspace}
                    onChange={(value) => updateWorkspaceField("phone", value)}
                  />
                  <Field
                    id="workspace-email"
                    label="Email"
                    type="email"
                    value={workspaceForm.email}
                    disabled={!canManageWorkspace}
                    onChange={(value) => updateWorkspaceField("email", value)}
                  />
                  <Field
                    id="workspace-website"
                    label="Website"
                    type="url"
                    value={workspaceForm.website}
                    disabled={!canManageWorkspace}
                    onChange={(value) => updateWorkspaceField("website", value)}
                  />
                  <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="workspace-address">Địa chỉ</Label>
                    <Textarea
                      id="workspace-address"
                      name="workspace-address"
                      disabled={!canManageWorkspace}
                      value={workspaceForm.address}
                      onChange={(event) =>
                        updateWorkspaceField("address", event.target.value)
                      }
                      className="min-h-24 resize-y"
                    />
                  </div>
                </div>
                {canManageWorkspace && (
                  <Button
                    id="workspace-save"
                    type="submit"
                    disabled={
                      saveWorkspace.isPending || !workspaceDraftDirty || !online
                    }
                    className="mt-5 min-h-11"
                  >
                    <Save aria-hidden="true" />
                    {saveWorkspace.isPending
                      ? "Đang lưu workspace..."
                      : "Lưu workspace"}
                  </Button>
                )}
                {saveWorkspace.error && (
                  <div className="mt-4">
                    <SettingsInlineError
                      error={saveWorkspace.error}
                      fallback="Không thể lưu workspace."
                      retry={() => saveWorkspace.mutate()}
                    />
                  </div>
                )}
              </form>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
