import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  Camera,
  CircleAlert,
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
import { PortalError, PortalLoading } from "../../components/PortalState";
import { TwoFactorPanel } from "../../components/security/TwoFactorPanel";
import { useAuth } from "../../context/AuthContext";
import {
  smartHealthApi,
  type ApiError,
  type ApiUser,
  type AuthSession,
} from "../../../lib/smart-health-api";
import {
  changeFirebasePassword,
  hasFirebaseWebConfig,
} from "../../../lib/firebase-client";

type SettingsTab = "profile" | "security" | "notifications" | "workspace";

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
    key: "doctorRequests",
    label: "Yêu cầu bác sĩ",
    description: "Hồ sơ mới, lời mời cộng tác hoặc phân công từ workspace.",
  },
  {
    key: "abnormalResults",
    label: "Kết quả bất thường",
    description: "Cảnh báo từ nguồn dữ liệu hoặc bác sĩ đánh dấu cần xem xét ngay.",
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

type PreferenceKey = (typeof preferenceFields)[number]["key"];
type PreferenceForm = Record<PreferenceKey, boolean>;

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

function requireConfirmedTextFields(
  source: Record<string, unknown>,
  expected: Record<string, string>,
  action: string,
) {
  const confirmed = Object.entries(expected).every(
    ([key, value]) => String(source[key] ?? "").trim() === value,
  );
  if (!confirmed) {
    throw new SettingsActionError(
      `Backend chưa xác nhận ${action}. Dữ liệu hiển thị vẫn giữ nguyên; vui lòng thử lại.`,
    );
  }
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
  if (error instanceof SettingsActionError) return error.message;
  const apiError = error && typeof error === "object" ? (error as ApiError) : null;
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
    (error instanceof Error && /kết nối backend|failed to fetch|network/i.test(error.message))
  ) {
    return `${fallback} Thiết bị đang offline hoặc không thể kết nối backend; dữ liệu chưa được thay đổi. Hãy kiểm tra mạng và thử lại.`;
  }
  if (status === 400 || status === 422) {
    return `${fallback} Dữ liệu gửi lên chưa hợp lệ hoặc chưa đầy đủ. Hãy kiểm tra các trường rồi thử lại.`;
  }
  return fallback;
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
      className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-4 text-sm text-[var(--status-danger-fg)]"
    >
      <CircleAlert size={17} aria-hidden="true" />
      <span className="min-w-0 flex-1">{errorText(error, fallback)}</span>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="flex min-h-9 items-center justify-center gap-2 rounded-xl border border-[var(--status-danger-border)] px-3 font-semibold text-current hover:bg-[var(--status-danger-bg)]"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Thử lại
        </button>
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

function TabButton({
  id,
  active,
  icon,
  label,
  onClick,
}: {
  id: string;
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
        active
          ? "border-[#00FFD1]/50 bg-[#00FFD1]/15 text-white"
          : "border-white/10 bg-white/[0.03] text-[#94b8d0] hover:border-[#4AA4E0]/40 hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
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
    <label className="text-xs font-medium text-[#94b8d0]">
      {label}
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="portal-input mt-2 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function createIdempotencyKey(scope: string) {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}-${randomId}`;
}

export default function WorkspaceSettings() {
  const { user, refreshUser } = useAuth();
  const client = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarObjectUrlRef = useRef("");
  const sessionRevokeKeysRef = useRef(new Map<string, string>());
  const revokeAllSessionKeysRef = useRef(new Map<string, string>());
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile);
  const [workspaceForm, setWorkspaceForm] =
    useState<WorkspaceForm>(emptyWorkspace);
  const [preferences, setPreferences] = useState<PreferenceForm>(() =>
    preferencesFromUser(user?.raw),
  );
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [confirmAvatarDelete, setConfirmAvatarDelete] = useState(false);
  const [confirmSessionId, setConfirmSessionId] = useState("");
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const canManageWorkspace = Boolean(
    user?.capabilities.includes("workspace.settings.manage") ||
      user?.capabilities.includes("platform.settings.manage"),
  );

  const accountQuery = useQuery({
    queryKey: ["portal", "me", user?.id],
    queryFn: smartHealthApi.me,
    enabled: Boolean(user),
  });

  const settingsQuery = useQuery({
    queryKey: ["portal", "settings", user?.currentWorkspace.id],
    queryFn: smartHealthApi.getSettings,
    enabled: Boolean(user),
  });

  const sessionsQuery = useQuery({
    queryKey: ["portal", "auth-sessions", user?.id],
    queryFn: smartHealthApi.listSessions,
    enabled: Boolean(user),
  });

  const currentUser = useMemo(
    () => accountQuery.data?.user || user?.raw || null,
    [accountQuery.data?.user, user?.raw],
  );

  const activeSessions = useMemo(
    () => (sessionsQuery.data?.sessions || []).filter((item) => !item.revokedAt),
    [sessionsQuery.data?.sessions],
  );

  const otherSessions = activeSessions.filter((item) => !item.current);

  useEffect(() => {
    setProfile(profileFromUser(currentUser));
    setPreferences(preferencesFromUser(currentUser));
  }, [currentUser]);

  useEffect(() => {
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
  }, [currentUser, settingsQuery.data?.workspace]);

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
      if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current);
    };
  }, []);

  const refreshAccountState = async () => {
    await refreshUser();
    await Promise.all([
      client.invalidateQueries({ queryKey: ["portal", "me"] }),
      client.invalidateQueries({ queryKey: ["portal", "settings"] }),
      client.invalidateQueries({ queryKey: ["portal", "auth-sessions"] }),
    ]);
  };

  const saveProfile = useMutation({
    mutationFn: async () => {
      const payload = {
        name: profile.name.trim(),
        title: profile.title.trim(),
        phone: profile.phone.trim(),
        license: profile.license.trim(),
        hospital: profile.hospital.trim(),
        department: profile.department.trim(),
        specialty: profile.specialty.trim(),
        address: profile.address.trim(),
      };
      const result = await smartHealthApi.updateMe(payload);
      const confirmedUser = requireConfirmedUser(
        result,
        currentUser?.id || user?.id,
        "lưu hồ sơ",
      );
      requireConfirmedTextFields(
        confirmedUser as unknown as Record<string, unknown>,
        payload,
        "lưu hồ sơ",
      );
      return result;
    },
    onSuccess: async (result) => {
      setProfile(profileFromUser(result.user));
      toast.success("Đã lưu hồ sơ cá nhân");
      await refreshAccountState();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const result = await smartHealthApi.uploadMyAvatar(file);
      requireConfirmedUser(
        result,
        currentUser?.id || user?.id,
        "cập nhật ảnh đại diện",
      );
      if (!result.file?.id) {
        throw new SettingsActionError(
          "Backend chưa xác nhận file ảnh đại diện. Ảnh hiện tại vẫn được giữ nguyên; vui lòng thử lại.",
        );
      }
      if (result.user.avatarFileId !== result.file.id) {
        throw new SettingsActionError(
          "Backend chưa xác nhận ảnh đại diện mới cho tài khoản. Ảnh hiện tại vẫn được giữ nguyên; vui lòng thử lại.",
        );
      }
      return result;
    },
    onSuccess: async (result) => {
      setProfile(profileFromUser(result.user));
      setConfirmAvatarDelete(false);
      toast.success("Đã cập nhật ảnh đại diện");
      await refreshAccountState();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const deleteAvatar = useMutation({
    mutationFn: async () => {
      const result = await smartHealthApi.deleteMyAvatar();
      requireConfirmedUser(
        result,
        currentUser?.id || user?.id,
        "xoá ảnh đại diện",
      );
      if (result.deleted !== true) {
        throw new SettingsActionError(
          "Backend chưa xác nhận xoá ảnh đại diện. Ảnh hiện tại vẫn được giữ nguyên; vui lòng thử lại.",
        );
      }
      return result;
    },
    onSuccess: async (result) => {
      setObjectAvatarPreview(null);
      setProfile(profileFromUser(result.user));
      setConfirmAvatarDelete(false);
      toast.success("Đã xoá ảnh đại diện");
      await refreshAccountState();
    },
    onError: (error) => toast.error(errorText(error)),
  });

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

  const changePassword = useMutation({
    mutationFn: async () => {
      const currentPassword = password.currentPassword.trim();
      const newPassword = password.newPassword.trim();
      const confirmPassword = password.confirmPassword.trim();
      if (!currentPassword)
        throw new SettingsActionError("Vui lòng nhập mật khẩu hiện tại.");
      if (newPassword.length < 8)
        throw new SettingsActionError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      if (newPassword !== confirmPassword)
        throw new SettingsActionError("Mật khẩu xác nhận chưa khớp.");

      let firebaseClientUpdated = false;
      if (hasFirebaseWebConfig()) {
        try {
          const idToken = await changeFirebasePassword(
            currentPassword,
            newPassword,
          );
          firebaseClientUpdated = true;
          await smartHealthApi.authenticateFirebase(idToken);
          const result = await smartHealthApi.changePassword({
            firebaseClientUpdated: true,
          });
          requireConfirmedUser(
            result,
            currentUser?.id || user?.id,
            "đổi mật khẩu",
          );
          if (result.ok !== true) {
            throw new SettingsActionError(
              "Mật khẩu Firebase đã được cập nhật nhưng backend chưa xác nhận đồng bộ. Hãy đăng nhập lại bằng mật khẩu mới rồi thử tiếp.",
            );
          }
          return result;
        } catch (error) {
          if (firebaseClientUpdated && !(error instanceof SettingsActionError)) {
            throw new SettingsActionError(
              "Mật khẩu Firebase có thể đã được cập nhật nhưng Smart Health chưa xác nhận đồng bộ. Hãy đăng nhập lại bằng mật khẩu mới.",
            );
          }
          throw error;
        }
      }
      const result = await smartHealthApi.changePassword({
        currentPassword,
        newPassword,
      });
      requireConfirmedUser(
        result,
        currentUser?.id || user?.id,
        "đổi mật khẩu",
      );
      if (result.ok !== true) {
        throw new SettingsActionError(
          "Backend chưa xác nhận đổi mật khẩu. Mật khẩu cũ vẫn có hiệu lực; vui lòng thử lại.",
        );
      }
      return result;
    },
    onSuccess: async () => {
      setPassword({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success("Đã đổi mật khẩu");
      await refreshAccountState();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const revokeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const key = sessionRevokeKeysRef.current.get(sessionId)
        || createIdempotencyKey(`session-revoke-${sessionId}`);
      sessionRevokeKeysRef.current.set(sessionId, key);
      const result = await smartHealthApi.revokeSession(sessionId, key);
      if (
        result.revoked !== true
        || result.session?.id !== sessionId
        || !result.session.revokedAt
      ) {
        throw new SettingsActionError(
          "Backend chưa xác nhận thu hồi phiên đăng nhập. Phiên có thể vẫn hoạt động; vui lòng thử lại.",
        );
      }
      sessionRevokeKeysRef.current.delete(sessionId);
      return result;
    },
    onSuccess: async () => {
      setConfirmSessionId("");
      toast.success("Đã thu hồi phiên đăng nhập");
      await client.invalidateQueries({ queryKey: ["portal", "auth-sessions"] });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const revokeOtherSessions = useMutation({
    mutationFn: async () => {
      const targets = [...otherSessions];
      const results = await Promise.allSettled(
        targets.map(async (session) => {
          const key = revokeAllSessionKeysRef.current.get(session.id)
            || createIdempotencyKey(`session-revoke-${session.id}`);
          revokeAllSessionKeysRef.current.set(session.id, key);
          const result = await smartHealthApi.revokeSession(session.id, key);
          if (
            result.revoked !== true
            || result.session?.id !== session.id
            || !result.session.revokedAt
          ) {
            throw new Error("unconfirmed");
          }
          return result;
        }),
      );
      const confirmed = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      if (confirmed !== targets.length) {
        throw new SettingsActionError(
          `Backend chỉ xác nhận thu hồi ${confirmed}/${targets.length} phiên. Danh sách sẽ được tải lại; hãy kiểm tra và thử lại.`,
        );
      }
      return confirmed;
    },
    onSuccess: async () => {
      revokeAllSessionKeysRef.current.clear();
      setConfirmRevokeAll(false);
      toast.success("Đã thu hồi các phiên khác");
    },
    onError: (error) => toast.error(errorText(error)),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["portal", "auth-sessions"] });
    },
  });

  const savePreferences = useMutation({
    mutationFn: async () => {
      const result = await smartHealthApi.updateMe({
        notificationPreferences: preferences,
      });
      const confirmedUser = requireConfirmedUser(
        result,
        currentUser?.id || user?.id,
        "lưu cài đặt thông báo",
      );
      const confirmedPreferences = confirmedUser.notificationPreferences;
      const isConfirmed = preferenceFields.every(
        (field) => confirmedPreferences?.[field.key] === preferences[field.key],
      );
      if (!isConfirmed) {
        throw new SettingsActionError(
          "Backend chưa xác nhận lưu cài đặt thông báo. Lựa chọn hiện tại chưa được coi là đã lưu; vui lòng thử lại.",
        );
      }
      return result;
    },
    onSuccess: async (result) => {
      setPreferences(preferencesFromUser(result.user));
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
        email: workspaceForm.email.trim(),
        website: workspaceForm.website.trim(),
      };
      const result = await smartHealthApi.updateWorkspace(payload);
      if (result.workspace?.id !== user?.currentWorkspace.id) {
        throw new SettingsActionError(
          "Backend chưa xác nhận cập nhật đúng workspace hiện tại. Dữ liệu hiển thị vẫn giữ nguyên; vui lòng tải lại và thử lại.",
        );
      }
      requireConfirmedTextFields(
        result.workspace as unknown as Record<string, unknown>,
        payload,
        "cập nhật workspace hiện tại",
      );
      return result;
    },
    onSuccess: async (result) => {
      setWorkspaceForm({
        name: result.workspace.name || "",
        address: result.workspace.address || "",
        phone: result.workspace.phone || "",
        email: result.workspace.email || "",
        website: result.workspace.website || "",
      });
      toast.success("Đã cập nhật workspace");
      await refreshAccountState();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ hỗ trợ file ảnh.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ảnh đại diện tối đa 2MB.");
      return;
    }
    uploadAvatar.mutate(file);
  };

  const avatarSrc = avatarPreview || profile.avatarUrl || user?.avatar || "";
  const passwordInputType = showPassword ? "text" : "password";

  if (accountQuery.isLoading) return <PortalLoading />;
  if (accountQuery.error)
    return (
      <PortalError
        error={new Error(
          errorText(accountQuery.error, "Không thể tải hồ sơ tài khoản."),
        )}
        retry={() => void accountQuery.refetch()}
      />
    );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="hero-gradient-text flex items-center gap-2">
            <Settings size={22} />
            Tài khoản & workspace
          </h1>
          <p className="mt-2 text-sm text-[#94b8d0]">
            Quản lý hồ sơ cá nhân, bảo mật, thông báo và thông tin workspace.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[#94b8d0]">
          <span className="text-white">{profile.email || user?.email}</span>
          <span className="mx-2 text-white/30">•</span>
          {user?.currentWorkspace.name || "Workspace"}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <TabButton
          id="portal-settings-profile-tab"
          active={activeTab === "profile"}
          icon={<UserRound size={16} />}
          label="Hồ sơ"
          onClick={() => setActiveTab("profile")}
        />
        <TabButton
          id="portal-settings-security-tab"
          active={activeTab === "security"}
          icon={<ShieldCheck size={16} />}
          label="Bảo mật"
          onClick={() => setActiveTab("security")}
        />
        <TabButton
          id="portal-settings-notifications-tab"
          active={activeTab === "notifications"}
          icon={<Bell size={16} />}
          label="Thông báo"
          onClick={() => setActiveTab("notifications")}
        />
        <TabButton
          id="portal-settings-workspace-tab"
          active={activeTab === "workspace"}
          icon={<Building2 size={16} />}
          label="Workspace"
          onClick={() => setActiveTab("workspace")}
        />
      </div>

      {activeTab === "profile" && (
        <section className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="lg:w-64">
              <div className="flex items-center gap-4 lg:block">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-3xl font-bold text-white">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt="Ảnh đại diện"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (profile.name || profile.email || "S").slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="space-y-1 lg:mt-4">
                  <h2 className="text-lg font-semibold text-white">
                    Hồ sơ cá nhân
                  </h2>
                  <p className="text-sm text-[#94b8d0]">
                    Thông tin hiển thị trong workspace và hồ sơ chuyên môn.
                  </p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                id="account-avatar-file"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <div className="mt-5 grid gap-2">
                <button
                  id="account-upload-avatar"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAvatar.isPending}
                  className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#4AA4E0]/30 px-3 text-sm font-semibold text-white transition hover:bg-[#4AA4E0]/10 disabled:opacity-60"
                >
                  <UploadCloud size={15} />
                  {uploadAvatar.isPending ? "Đang tải ảnh..." : "Tải ảnh lên"}
                </button>
                <button
                  id="account-download-avatar"
                  type="button"
                  onClick={() => downloadAvatar.mutate()}
                  disabled={!profile.avatarFileId || downloadAvatar.isPending}
                  className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-semibold text-[#94b8d0] transition hover:text-white disabled:opacity-40"
                >
                  <Camera size={15} />
                  Tải ảnh xuống
                </button>
                <button
                  id="account-delete-avatar"
                  type="button"
                  onClick={() =>
                    confirmAvatarDelete
                      ? deleteAvatar.mutate()
                      : setConfirmAvatarDelete(true)
                  }
                  disabled={
                    (!profile.avatarFileId && !profile.avatarUrl) ||
                    deleteAvatar.isPending
                  }
                  className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#EF4444]/30 px-3 text-sm font-semibold text-[#FCA5A5] transition hover:bg-[#EF4444]/10 disabled:opacity-40"
                >
                  <Trash2 size={15} />
                  {deleteAvatar.isPending
                    ? "Đang xoá ảnh..."
                    : confirmAvatarDelete
                      ? "Bấm lần nữa để xoá"
                      : "Xoá ảnh"}
                </button>
              </div>
              {uploadAvatar.error && (
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
              {deleteAvatar.error && (
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
            </div>

            <div className="grid flex-1 gap-4 md:grid-cols-2">
              <Field
                id="account-name"
                label="Họ tên"
                value={profile.name}
                onChange={(value) => setProfile({ ...profile, name: value })}
                autoComplete="name"
              />
              <Field
                id="account-title"
                label="Chức danh"
                value={profile.title}
                onChange={(value) => setProfile({ ...profile, title: value })}
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
                onChange={(value) => setProfile({ ...profile, phone: value })}
                autoComplete="tel"
              />
              <Field
                id="account-license"
                label="Số chứng chỉ hành nghề"
                value={profile.license}
                onChange={(value) =>
                  setProfile({ ...profile, license: value })
                }
              />
              <Field
                id="account-hospital"
                label="Bệnh viện / phòng khám"
                value={profile.hospital}
                onChange={(value) =>
                  setProfile({ ...profile, hospital: value })
                }
              />
              <Field
                id="account-department"
                label="Khoa / bộ phận"
                value={profile.department}
                onChange={(value) =>
                  setProfile({ ...profile, department: value })
                }
              />
              <Field
                id="account-specialty"
                label="Chuyên khoa"
                value={profile.specialty}
                onChange={(value) =>
                  setProfile({ ...profile, specialty: value })
                }
              />
              <label className="text-xs font-medium text-[#94b8d0] md:col-span-2">
                Địa chỉ liên hệ
                <textarea
                  id="account-address"
                  name="account-address"
                  value={profile.address}
                  onChange={(event) =>
                    setProfile({ ...profile, address: event.target.value })
                  }
                  className="portal-input mt-2 min-h-24 resize-y py-3"
                />
              </label>
              <button
                id="account-save-profile"
                type="button"
                onClick={() => saveProfile.mutate()}
                disabled={saveProfile.isPending}
                className="premium-button flex items-center justify-center gap-2 md:max-w-xs"
              >
                <Save size={15} />
                {saveProfile.isPending ? "Đang lưu hồ sơ..." : "Lưu hồ sơ"}
              </button>
              {saveProfile.error && (
                <div className="md:col-span-2">
                  <SettingsInlineError
                    error={saveProfile.error}
                    fallback="Không thể lưu hồ sơ."
                    retry={() => saveProfile.mutate()}
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "security" && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="glass-panel rounded-2xl p-5 md:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <Lock size={18} />
                  Đổi mật khẩu
                </h2>
                <p className="mt-1 text-sm text-[#94b8d0]">
                  Cập nhật mật khẩu đăng nhập cho tài khoản hiện tại.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-[#94b8d0] hover:text-white"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field
                id="account-current-password"
                label="Mật khẩu hiện tại"
                type={passwordInputType}
                value={password.currentPassword}
                onChange={(value) =>
                  setPassword({ ...password, currentPassword: value })
                }
                autoComplete="current-password"
              />
              <Field
                id="account-new-password"
                label="Mật khẩu mới"
                type={passwordInputType}
                value={password.newPassword}
                onChange={(value) =>
                  setPassword({ ...password, newPassword: value })
                }
                autoComplete="new-password"
              />
              <Field
                id="account-confirm-password"
                label="Xác nhận mật khẩu"
                type={passwordInputType}
                value={password.confirmPassword}
                onChange={(value) =>
                  setPassword({ ...password, confirmPassword: value })
                }
                autoComplete="new-password"
              />
            </div>
            <button
              id="account-change-password"
              type="button"
              onClick={() => changePassword.mutate()}
              disabled={changePassword.isPending}
              className="premium-button mt-5 flex items-center justify-center gap-2"
            >
              <KeyRound size={15} />
              {changePassword.isPending ? "Đang đổi mật khẩu..." : "Đổi mật khẩu"}
            </button>
            {changePassword.error && (
              <div className="mt-4">
                <SettingsInlineError
                  error={changePassword.error}
                  fallback="Không thể đổi mật khẩu."
                  retry={() => changePassword.mutate()}
                />
              </div>
            )}
          </div>

          <TwoFactorPanel
            onStatusChange={(enabled, method) =>
              setProfile((current) => ({
                ...current,
                twoFactorEnabled: enabled,
                twoFactorMethod: method,
              }))
            }
          />

          <div className="glass-panel rounded-2xl p-5 md:p-6 lg:col-span-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <LogOut size={18} />
                  Phiên đăng nhập
                </h2>
                <p className="mt-1 text-sm text-[#94b8d0]">
                  Theo dõi phiên hiện tại và thu hồi các phiên không còn dùng.
                </p>
              </div>
              <button
                id="account-revoke-other-sessions"
                type="button"
                onClick={() => {
                  revokeOtherSessions.reset();
                  setConfirmRevokeAll(true);
                }}
                disabled={
                  revokeOtherSessions.isPending ||
                  sessionsQuery.isLoading ||
                  Boolean(sessionsQuery.error) ||
                  otherSessions.length === 0
                }
                className="flex min-h-10 items-center justify-center rounded-xl border border-[#EF4444]/30 px-4 text-sm font-semibold text-[#FCA5A5] hover:bg-[#EF4444]/10 disabled:opacity-40"
              >
                {revokeOtherSessions.isPending
                  ? "Đang thu hồi..."
                  : "Thu hồi phiên khác"}
              </button>
            </div>
            {confirmRevokeAll && (
              <div
                role="alert"
                className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-4 text-sm text-[var(--status-danger-fg)]"
              >
                <span className="min-w-0 flex-1">
                  Thu hồi {otherSessions.length} phiên khác? Các thiết bị đó sẽ
                  phải đăng nhập lại.
                </span>
                <button
                  type="button"
                  onClick={() => revokeOtherSessions.mutate()}
                  disabled={revokeOtherSessions.isPending}
                  className="min-h-9 rounded-xl bg-destructive px-3 font-semibold text-destructive-foreground disabled:opacity-60"
                >
                  Xác nhận thu hồi tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRevokeAll(false)}
                  disabled={revokeOtherSessions.isPending}
                  className="min-h-9 rounded-xl border border-white/15 px-3 font-semibold text-white disabled:opacity-60"
                >
                  Huỷ
                </button>
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
              <div className="mt-5 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
                {activeSessions.length === 0 && (
                  <div className="p-5 text-sm text-[#94b8d0]">
                    Chưa có dữ liệu phiên đăng nhập.
                  </div>
                )}
                {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-col gap-3 bg-white/[0.02] p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-[#94b8d0]">
                      {sessionIcon(session)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                        {sessionDevice(session)}
                        {session.current && (
                          <span className="rounded-full border border-[#00FFD1]/30 bg-[#00FFD1]/10 px-2 py-0.5 text-xs text-[#BFFAF0]">
                            Hiện tại
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-[#94b8d0]">
                        {String(session.provider || "smart-health")} ·{" "}
                        {session.ip || "IP ẩn"} ·{" "}
                        {formatDateTime(session.lastSeenAt || session.createdAt)}
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
                        <button
                          type="button"
                          onClick={() => revokeSession.mutate(session.id)}
                          disabled={revokeSession.isPending}
                          className="min-h-9 rounded-xl bg-destructive px-3 font-semibold text-destructive-foreground disabled:opacity-60"
                        >
                          Xác nhận thu hồi
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmSessionId("")}
                          disabled={revokeSession.isPending}
                          className="min-h-9 rounded-xl border border-white/10 px-3 font-semibold text-white disabled:opacity-60"
                        >
                          Huỷ
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          revokeSession.reset();
                          setConfirmSessionId(session.id);
                        }}
                        disabled={session.current || revokeSession.isPending}
                        className="min-h-9 rounded-xl border border-white/10 px-3 text-sm font-semibold text-[#94b8d0] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Thu hồi
                      </button>
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
          </div>
        </section>
      )}

      {activeTab === "notifications" && (
        <section className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="mb-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Bell size={18} />
              Thông báo cá nhân
            </h2>
            <p className="mt-1 text-sm text-[#94b8d0]">
              Chọn loại cảnh báo bạn muốn nhận trong workspace.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {preferenceFields.map((field) => (
              <label
                key={field.key}
                className="flex min-h-24 items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <span>
                  <span className="block text-sm font-semibold text-white">
                    {field.label}
                  </span>
                  <span className="mt-1 block text-sm text-[#94b8d0]">
                    {field.description}
                  </span>
                </span>
                <input
                  id={`notification-${field.key}`}
                  name={`notification-${field.key}`}
                  type="checkbox"
                  checked={preferences[field.key]}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      [field.key]: event.target.checked,
                    })
                  }
                  className="mt-1 h-5 w-5 accent-[#00FFD1]"
                />
              </label>
            ))}
          </div>
          <button
            id="workspace-save-notifications"
            type="button"
            onClick={() => savePreferences.mutate()}
            disabled={savePreferences.isPending}
            className="premium-button mt-5 flex items-center justify-center gap-2"
          >
            <Save size={15} />
            {savePreferences.isPending
              ? "Đang lưu thông báo..."
              : "Lưu thông báo"}
          </button>
          {savePreferences.error && (
            <div className="mt-4">
              <SettingsInlineError
                error={savePreferences.error}
                fallback="Không thể lưu cài đặt thông báo."
                retry={() => savePreferences.mutate()}
              />
            </div>
          )}
        </section>
      )}

      {activeTab === "workspace" && (
        <section className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="mb-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Building2 size={18} />
              Thông tin workspace
            </h2>
            <p className="mt-1 text-sm text-[#94b8d0]">
              {canManageWorkspace
                ? "Bạn có quyền cập nhật thông tin tổ chức."
                : "Thông tin tổ chức đang ở chế độ chỉ đọc với tài khoản này."}
            </p>
          </div>
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
            <>
              <div className="grid gap-4 md:grid-cols-2">
            <Field
              id="workspace-name"
              label="Tên workspace"
              value={workspaceForm.name}
              disabled={!canManageWorkspace}
              onChange={(value) =>
                setWorkspaceForm({ ...workspaceForm, name: value })
              }
            />
            <Field
              id="workspace-phone"
              label="Điện thoại"
              value={workspaceForm.phone}
              disabled={!canManageWorkspace}
              onChange={(value) =>
                setWorkspaceForm({ ...workspaceForm, phone: value })
              }
            />
            <Field
              id="workspace-email"
              label="Email"
              value={workspaceForm.email}
              disabled={!canManageWorkspace}
              onChange={(value) =>
                setWorkspaceForm({ ...workspaceForm, email: value })
              }
            />
            <Field
              id="workspace-website"
              label="Website"
              value={workspaceForm.website}
              disabled={!canManageWorkspace}
              onChange={(value) =>
                setWorkspaceForm({ ...workspaceForm, website: value })
              }
            />
            <label className="text-xs font-medium text-[#94b8d0] md:col-span-2">
              Địa chỉ
              <textarea
                id="workspace-address"
                name="workspace-address"
                disabled={!canManageWorkspace}
                value={workspaceForm.address}
                onChange={(event) =>
                  setWorkspaceForm({
                    ...workspaceForm,
                    address: event.target.value,
                  })
                }
                className="portal-input mt-2 min-h-24 resize-y py-3 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
              </div>
              {canManageWorkspace && (
                <button
                  id="workspace-save"
                  type="button"
                  onClick={() => saveWorkspace.mutate()}
                  disabled={saveWorkspace.isPending}
                  className="premium-button mt-5 flex items-center justify-center gap-2"
                >
                  <Save size={15} />
                  {saveWorkspace.isPending
                    ? "Đang lưu workspace..."
                    : "Lưu workspace"}
                </button>
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
            </>
          )}
        </section>
      )}
    </div>
  );
}
