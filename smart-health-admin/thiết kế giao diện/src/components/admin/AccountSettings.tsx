import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  LogOut,
  Mail,
  Monitor,
  Phone,
  Save,
  Shield,
  Smartphone,
  Trash2,
  UploadCloud,
  User,
  Lock,
} from "lucide-react";
import { useId } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  clearSmartHealthStoredTokenIfMatches,
  getSmartHealthStoredTokenSnapshot,
  smartHealthApi,
  type SmartHealthAuthSession,
  type SmartHealthAuthUser,
  type SmartHealthNotificationPreferencesResponse,
  type SmartHealthTwoFactorStatus,
} from "@/lib/smart-health-api";
import {
  getCurrentFirebaseUid,
  hasFirebaseWebConfig,
  reauthenticateFirebasePassword,
  signOutFirebaseIfUidMatches,
} from "@/lib/firebase-client";
import {
  createPasswordChangeIntent,
  executePasswordChange,
  isAmbiguousPasswordMutationError,
  isPasswordChangeAuthorityError,
  PasswordChangeAuthorityError,
  passwordIntentMatches,
  type PasswordChangeAuthority,
  type PasswordChangeIntent,
} from "@/lib/password-change";
import {
  AuthSessionRevokeIntentRegistry,
  executeAuthSessionRevoke,
  isAuthSessionIdempotencyCollision,
} from "@/lib/auth-session-revoke";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { useNavigate } from "./router-shim";

type ProfileState = {
  name: string;
  title: string;
  email: string;
  phone: string;
  license: string;
  hospital: string;
  department: string;
  specialty: string;
  address: string;
  avatarFileId: string;
  avatarUrl: string;
  notificationPreferences: {
    doctorRequests: boolean;
    abnormalResults: boolean;
    deviceOffline: boolean;
    newLogin: boolean;
  };
};

type ConfirmTask = {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  run: () => Promise<void>;
};

const emptyProfile: ProfileState = {
  name: "",
  title: "",
  email: "",
  phone: "",
  license: "",
  hospital: "",
  department: "",
  specialty: "",
  address: "",
  avatarFileId: "",
  avatarUrl: "",
  notificationPreferences: {
    doctorRequests: true,
    abnormalResults: true,
    deviceOffline: true,
    newLogin: true,
  },
};

function profileFromUser(user: SmartHealthAuthUser): ProfileState {
  const preferences = user.notificationPreferences || {};
  return {
    name: user.name || "",
    title: user.title || (user.role === "admin" ? "Quản trị viên hệ thống" : user.role || ""),
    email: user.email || "",
    phone: user.phone || "",
    license: user.license || "",
    hospital: user.hospital || user.clinicName || "",
    department: user.department || "",
    specialty: user.specialty || user.department || "",
    address: user.address || "",
    avatarFileId: user.avatarFileId || "",
    avatarUrl: user.avatarUrl || "",
    notificationPreferences: {
      doctorRequests: preferences.doctorRequests !== false,
      abnormalResults: preferences.abnormalResults !== false,
      deviceOffline: preferences.deviceOffline !== false,
      newLogin: preferences.newLogin !== false,
    },
  };
}

type AccountNotificationPreferenceKey = keyof ProfileState["notificationPreferences"];

const notificationPreferenceRows: ReadonlyArray<{
  key: AccountNotificationPreferenceKey;
  title: string;
  description: string;
}> = [
  {
    key: "doctorRequests",
    title: "Bác sĩ mới đăng ký",
    description: "Thông báo khi có bác sĩ cần duyệt",
  },
  {
    key: "abnormalResults",
    title: "Cảnh báo kết quả cần xem xét",
    description: "Thông báo khi backend ghi nhận cảnh báo cần người có chuyên môn xem xét",
  },
  {
    key: "deviceOffline",
    title: "Thiết bị offline",
    description: "Thông báo khi thiết bị mất kết nối quá 30 phút",
  },
  {
    key: "newLogin",
    title: "Đăng nhập từ thiết bị lạ",
    description: "Thông báo khi tài khoản có phiên đăng nhập mới",
  },
];

function accountPreferencesFromResponse(
  response: SmartHealthNotificationPreferencesResponse,
): ProfileState["notificationPreferences"] {
  return {
    doctorRequests: response.preferences.doctorRequests,
    abnormalResults: response.preferences.abnormalResults,
    deviceOffline: response.preferences.deviceOffline,
    newLogin: response.preferences.newLogin,
  };
}

function assertOwnedNotificationPreferences(
  response: SmartHealthNotificationPreferencesResponse,
  expectedUserId: string,
) {
  if (
    !expectedUserId ||
    response.userId !== expectedUserId ||
    response.ownership.kind !== "self" ||
    response.ownership.userId !== expectedUserId
  ) {
    throw new Error("Notification preference receipt does not belong to the signed-in account");
  }
}

function createIdempotencyKey(scope: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${scope}:${crypto.randomUUID()}`;
  }
  return `${scope}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function formatSessionTime(value?: string) {
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

function sessionDevice(session: SmartHealthAuthSession) {
  const userAgent = session.userAgent || "Thiết bị không xác định";
  if (userAgent.includes("Chrome")) return "Chrome / Web Admin";
  if (userAgent.includes("Safari")) return "Safari / Web Admin";
  if (userAgent.includes("Firefox")) return "Firefox / Web Admin";
  return userAgent.slice(0, 64);
}

function sessionIcon(session: SmartHealthAuthSession) {
  const userAgent = (session.userAgent || "").toLowerCase();
  return userAgent.includes("iphone") ||
    userAgent.includes("android") ||
    userAgent.includes("mobile")
    ? Smartphone
    : Monitor;
}

export function AccountSettings() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarObjectUrlRef = useRef("");
  const passwordChangeIntentRef = useRef<PasswordChangeIntent | null>(null);
  const profileSaveIntentRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const avatarUploadIntentRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(
    null,
  );
  const avatarDeleteIntentRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(
    null,
  );
  const sessionRevokeIntentsRef = useRef<AuthSessionRevokeIntentRegistry | null>(null);
  const sessionAuthorityUserIdRef = useRef("");
  if (!sessionRevokeIntentsRef.current) {
    sessionRevokeIntentsRef.current = new AuthSessionRevokeIntentRegistry();
  }
  const passwordAuthorityRef = useRef<{
    userId: string;
    firebaseUid: string | null;
  }>({ userId: "", firebaseUid: null });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success">("idle");
  const [isLoading, setIsLoading] = useState(true);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessions, setSessions] = useState<SmartHealthAuthSession[]>([]);
  const [confirmTask, setConfirmTask] = useState<ConfirmTask | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);
  const [accountUserId, setAccountUserId] = useState("");
  const [accountWorkspaceId, setAccountWorkspaceId] = useState("");
  const [accountFirebaseUid, setAccountFirebaseUid] = useState<string | null>(null);
  const [twoFactorStatus, setTwoFactorStatus] = useState<SmartHealthTwoFactorStatus | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState("");
  const [notificationPreferencesReady, setNotificationPreferencesReady] = useState(false);
  const [notificationPreferencesError, setNotificationPreferencesError] = useState("");
  const [preferencePendingKeys, setPreferencePendingKeys] = useState<
    Set<AccountNotificationPreferenceKey>
  >(() => new Set());

  const setObjectAvatarPreview = useCallback((blob: Blob) => {
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(blob);
    avatarObjectUrlRef.current = objectUrl;
    setAvatarPreview(objectUrl);
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const response = await smartHealthApi.listSessions();
      setSessions(response.sessions.filter((session) => !session.revokedAt));
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể tải phiên đăng nhập."));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const refreshTwoFactorStatus = useCallback(async () => {
    setTwoFactorLoading(true);
    setTwoFactorError("");
    try {
      const status = await smartHealthApi.getTwoFactorStatus();
      setTwoFactorStatus(status);
    } catch (error) {
      setTwoFactorError(
        toVietnameseErrorMessage(error, "Không thể tải trạng thái xác thực hai yếu tố."),
      );
    } finally {
      setTwoFactorLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [{ user }, twoFactorResult, preferencesResult] = await Promise.all([
          smartHealthApi.me(),
          smartHealthApi.getTwoFactorStatus().then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
          smartHealthApi.getNotificationPreferences().then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
          loadSessions(),
        ]);
        if (cancelled) return;

        const nextProfile = profileFromUser(user);
        const nextFirebaseUid = user.firebaseUid || null;
        const nextWorkspaceId =
          user.organizationId ||
          user.currentWorkspaceId ||
          user.workspaceId ||
          user.currentWorkspace?.id ||
          user.workspace?.id ||
          "";
        const previousAuthority = passwordAuthorityRef.current;
        if (
          previousAuthority.userId &&
          (previousAuthority.userId !== user.id ||
            previousAuthority.firebaseUid !== nextFirebaseUid)
        ) {
          passwordChangeIntentRef.current = null;
          profileSaveIntentRef.current = null;
          avatarUploadIntentRef.current = null;
          avatarDeleteIntentRef.current = null;
          setPasswordForm({
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
          });
          setPasswordError("Tài khoản hiện tại đã thay đổi. Thao tác đổi mật khẩu cũ đã bị hủy.");
        }
        passwordAuthorityRef.current = {
          userId: user.id,
          firebaseUid: nextFirebaseUid,
        };
        sessionAuthorityUserIdRef.current = user.id;
        setAccountUserId(user.id);
        setAccountWorkspaceId(nextWorkspaceId);
        setAccountFirebaseUid(nextFirebaseUid);

        if (twoFactorResult.ok) {
          setTwoFactorStatus(twoFactorResult.value);
          setTwoFactorError("");
        } else {
          setTwoFactorStatus(null);
          setTwoFactorError(
            toVietnameseErrorMessage(
              twoFactorResult.error,
              "Không thể tải trạng thái xác thực hai yếu tố.",
            ),
          );
        }

        if (preferencesResult.ok) {
          try {
            assertOwnedNotificationPreferences(preferencesResult.value, user.id);
            nextProfile.notificationPreferences = accountPreferencesFromResponse(
              preferencesResult.value,
            );
            setNotificationPreferencesReady(true);
            setNotificationPreferencesError("");
          } catch (error) {
            setNotificationPreferencesReady(false);
            setNotificationPreferencesError(
              toVietnameseErrorMessage(error, "Phản hồi tùy chọn thông báo không hợp lệ."),
            );
          }
        } else {
          setNotificationPreferencesReady(false);
          setNotificationPreferencesError(
            toVietnameseErrorMessage(preferencesResult.error, "Không thể tải tùy chọn thông báo."),
          );
        }

        setProfile(nextProfile);
      } catch (error) {
        if (!cancelled) {
          toast.error(toVietnameseErrorMessage(error, "Không thể tải thông tin tài khoản."));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  useEffect(() => {
    let cancelled = false;
    if (!profile.avatarFileId) {
      setAvatarPreview(profile.avatarUrl || "");
      return undefined;
    }
    smartHealthApi
      .downloadMyAvatar()
      .then((blob) => {
        if (cancelled) return;
        setObjectAvatarPreview(blob);
      })
      .catch(() => {
        if (!cancelled) {
          setAvatarPreview(
            profile.avatarUrl && !profile.avatarUrl.includes("/me/avatar") ? profile.avatarUrl : "",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profile.avatarFileId, profile.avatarUrl, setObjectAvatarPreview]);

  useEffect(() => {
    return () => {
      sessionAuthorityUserIdRef.current = "";
      profileSaveIntentRef.current = null;
      avatarUploadIntentRef.current = null;
      avatarDeleteIntentRef.current = null;
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
      }
    };
  }, []);

  const activeSessions = useMemo(
    () => sessions.filter((session) => !session.revokedAt),
    [sessions],
  );
  const otherSessions = useMemo(
    () => activeSessions.filter((session) => !session.current),
    [activeSessions],
  );

  const updateProfile = (patch: Partial<ProfileState>) => {
    setProfile((current) => ({ ...current, ...patch }));
  };

  const applyUserProfile = (user?: SmartHealthAuthUser | null) => {
    if (!user) return;
    setProfile((current) => ({
      ...profileFromUser(user),
      notificationPreferences: current.notificationPreferences,
    }));
  };

  const handleSave = async () => {
    setSaveStatus("saving");
    const patch = {
      name: profile.name.trim(),
      title: profile.title.trim(),
      phone: profile.phone.trim(),
      license: profile.license.trim(),
      hospital: profile.hospital.trim(),
      department: profile.department.trim(),
      specialty: profile.specialty.trim(),
      address: profile.address.trim(),
    };
    const fingerprint = JSON.stringify([accountUserId, Object.entries(patch)]);
    let activeIntent = profileSaveIntentRef.current;
    if (!activeIntent || activeIntent.fingerprint !== fingerprint) {
      activeIntent = {
        fingerprint,
        idempotencyKey: createIdempotencyKey("account-profile"),
      };
      profileSaveIntentRef.current = activeIntent;
    }
    try {
      const receipt = await smartHealthApi.updateMe(
        patch,
        activeIntent.idempotencyKey,
        accountUserId,
      );
      if (!accountUserId || receipt.userId !== accountUserId) {
        throw new Error("Biên nhận hồ sơ không thuộc tài khoản quản trị hiện tại.");
      }
      const { user } = await smartHealthApi.me();
      if (
        user.id !== accountUserId ||
        Object.entries(patch).some(
          ([field, value]) => user[field as keyof SmartHealthAuthUser] !== value,
        )
      ) {
        throw new Error("Backend chưa đồng bộ đầy đủ hồ sơ tài khoản vừa lưu.");
      }
      profileSaveIntentRef.current = null;
      applyUserProfile(user);
      setSaveStatus("success");
      toast.success("Đã lưu cài đặt tài khoản");
      window.setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      if (isAuthSessionIdempotencyCollision(error)) {
        profileSaveIntentRef.current = null;
      }
      setSaveStatus("idle");
      toast.error(toVietnameseErrorMessage(error, "Không thể lưu cài đặt tài khoản."));
    }
  };

  const refreshNotificationPreferences = async () => {
    if (!accountUserId) return;
    setNotificationPreferencesError("");
    try {
      const response = await smartHealthApi.getNotificationPreferences();
      assertOwnedNotificationPreferences(response, accountUserId);
      setProfile((current) => ({
        ...current,
        notificationPreferences: accountPreferencesFromResponse(response),
      }));
      setNotificationPreferencesReady(true);
    } catch (error) {
      setNotificationPreferencesReady(false);
      setNotificationPreferencesError(
        toVietnameseErrorMessage(error, "Không thể tải tùy chọn thông báo."),
      );
    }
  };

  const updateNotificationPreference = async (
    key: AccountNotificationPreferenceKey,
    value: boolean,
  ) => {
    if (!accountUserId || !notificationPreferencesReady || preferencePendingKeys.has(key)) {
      return;
    }

    setPreferencePendingKeys((current) => new Set(current).add(key));
    try {
      const response = await smartHealthApi.patchNotificationPreference(
        { key, enabled: value },
        createIdempotencyKey(`notification-preference:${key}`),
      );
      assertOwnedNotificationPreferences(response, accountUserId);
      if (response.preferences[key] !== value) {
        throw new Error("Backend did not confirm the requested notification preference");
      }
      setProfile((current) => ({
        ...current,
        notificationPreferences: {
          ...current.notificationPreferences,
          [key]: response.preferences[key],
        },
      }));
      setNotificationPreferencesError("");
      toast.success("Đã lưu tùy chọn thông báo.");
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Không thể lưu tùy chọn thông báo.");
      setNotificationPreferencesError(message);
      toast.error(message);
    } finally {
      setPreferencePendingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ảnh đại diện tối đa 2MB.");
      return;
    }
    setAvatarUploading(true);
    setObjectAvatarPreview(file);
    try {
      const authority = await smartHealthApi.resolveAvatarMutationAuthority(
        accountUserId,
        accountWorkspaceId,
      );
      const fingerprint = JSON.stringify([
        authority.userId,
        authority.workspaceId,
        authority.authSessionId,
        file.name,
        file.type,
        file.size,
        file.lastModified,
      ]);
      let activeIntent = avatarUploadIntentRef.current;
      if (!activeIntent || activeIntent.fingerprint !== fingerprint) {
        activeIntent = {
          fingerprint,
          idempotencyKey: createIdempotencyKey("avatar-upload"),
        };
        avatarUploadIntentRef.current = activeIntent;
      }
      const receipt = await smartHealthApi.uploadMyAvatar(file, {
        ...authority,
        idempotencyKey: activeIntent.idempotencyKey,
      });
      const { user } = await smartHealthApi.me();
      if (user.id !== authority.userId) {
        throw new Error("Ảnh đại diện không thuộc tài khoản quản trị hiện tại.");
      }
      if (!user.avatarFileId || user.avatarFileId !== receipt.avatar.fileId) {
        throw new Error("Backend chưa xác nhận file ảnh đại diện mới.");
      }
      avatarUploadIntentRef.current = null;
      applyUserProfile(user);
      window.dispatchEvent(new Event("shcare:avatar-updated"));
      toast.success("Đã cập nhật ảnh đại diện.");
    } catch (error) {
      if (isAuthSessionIdempotencyCollision(error)) {
        avatarUploadIntentRef.current = null;
      }
      toast.error(toVietnameseErrorMessage(error, "Không thể tải ảnh đại diện."));
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = () => {
    if (!profile.avatarFileId && !profile.avatarUrl) return;
    setConfirmError("");
    setConfirmTask({
      title: "Gỡ ảnh đại diện",
      description:
        "Ảnh đại diện sẽ được gỡ khỏi hồ sơ tài khoản và file avatar hiện tại sẽ bị xóa khỏi storage nếu còn tồn tại.",
      confirmLabel: "Gỡ ảnh",
      run: async () => {
        const authority = await smartHealthApi.resolveAvatarMutationAuthority(
          accountUserId,
          accountWorkspaceId,
        );
        const fingerprint = JSON.stringify([
          authority.userId,
          authority.workspaceId,
          authority.authSessionId,
          profile.avatarFileId,
        ]);
        let activeIntent = avatarDeleteIntentRef.current;
        if (!activeIntent || activeIntent.fingerprint !== fingerprint) {
          activeIntent = {
            fingerprint,
            idempotencyKey: createIdempotencyKey("avatar-delete"),
          };
          avatarDeleteIntentRef.current = activeIntent;
        }
        const receipt = await smartHealthApi.deleteMyAvatar({
          ...authority,
          expectedAvatarFileId: profile.avatarFileId,
          idempotencyKey: activeIntent.idempotencyKey,
        });
        const { user } = await smartHealthApi.me();
        if (user.id !== authority.userId) {
          throw new Error("Biên nhận gỡ ảnh không thuộc tài khoản quản trị hiện tại.");
        }
        if (user.avatarFileId || receipt.avatar.fileId !== profile.avatarFileId) {
          throw new Error("Backend chưa xác nhận ảnh đại diện đã được gỡ.");
        }
        avatarDeleteIntentRef.current = null;
        if (avatarObjectUrlRef.current) {
          URL.revokeObjectURL(avatarObjectUrlRef.current);
          avatarObjectUrlRef.current = "";
        }
        setAvatarPreview("");
        applyUserProfile(user);
        window.dispatchEvent(new Event("shcare:avatar-updated"));
        toast.success("Đã gỡ ảnh đại diện.");
      },
    });
  };

  const abandonPasswordIntent = (message?: string) => {
    passwordChangeIntentRef.current = null;
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    if (message) setPasswordError(message);
  };

  const updatePasswordField = (key: keyof typeof passwordForm, value: string) => {
    passwordChangeIntentRef.current = null;
    setPasswordError("");
    setPasswordForm((current) => ({ ...current, [key]: value }));
  };

  const handlePasswordChange = async () => {
    if (passwordSubmitting) return;

    const { currentPassword, newPassword, confirmPassword } = passwordForm;
    const failValidation = (message: string) => {
      setPasswordError(message);
      toast.error(message);
    };

    if (currentPassword.length === 0 || newPassword.length === 0) {
      failValidation("Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.");
      return;
    }
    if (newPassword !== confirmPassword) {
      failValidation("Mật khẩu xác nhận không khớp.");
      return;
    }
    if (newPassword.length < 8) {
      failValidation("Mật khẩu mới cần tối thiểu 8 ký tự.");
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      failValidation("Mật khẩu mới phải có chữ hoa, chữ thường và chữ số.");
      return;
    }
    if (newPassword === currentPassword) {
      failValidation("Mật khẩu mới phải khác mật khẩu hiện tại.");
      return;
    }

    const firebaseConfigured = hasFirebaseWebConfig();
    const authority: PasswordChangeAuthority = {
      userId: accountUserId,
      firebaseConfigured,
      firebaseUid: firebaseConfigured ? accountFirebaseUid : null,
      authToken: getSmartHealthStoredTokenSnapshot(),
    };
    const input = { currentPassword, newPassword };
    let intent = passwordChangeIntentRef.current;

    try {
      if (!intent || !passwordIntentMatches(intent, input, authority)) {
        intent = createPasswordChangeIntent(
          input,
          authority,
          createIdempotencyKey("password-change"),
        );
        passwordChangeIntentRef.current = intent;
      }

      setPasswordSubmitting(true);
      setPasswordError("");
      const result = await executePasswordChange(intent, authority, {
        currentAuthToken: getSmartHealthStoredTokenSnapshot,
        currentFirebaseUid: () => (firebaseConfigured ? getCurrentFirebaseUid() : null),
        reauthenticateFirebase: reauthenticateFirebasePassword,
        authenticateFirebase: smartHealthApi.authenticateFirebase.bind(smartHealthApi),
        changePassword: smartHealthApi.changePassword.bind(smartHealthApi),
      });

      const completedIntent = intent;
      passwordChangeIntentRef.current = null;
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      const currentAuthority = passwordAuthorityRef.current;
      if (
        currentAuthority.userId !== completedIntent.userId ||
        currentAuthority.firebaseUid !== completedIntent.firebaseUid ||
        getSmartHealthStoredTokenSnapshot() !== completedIntent.authToken ||
        (result.provider === "firebase" &&
          (!firebaseConfigured ||
            !completedIntent.firebaseUid ||
            getCurrentFirebaseUid() !== completedIntent.firebaseUid))
      ) {
        throw new PasswordChangeAuthorityError(
          "Mật khẩu của tài khoản ban đầu có thể đã thay đổi, nhưng danh tính hiện tại đã chuyển. Phiên mới không bị đăng xuất.",
        );
      }

      let backendSessionClosed = false;
      try {
        backendSessionClosed = await smartHealthApi.logoutIfTokenMatches(completedIntent.authToken);
      } catch {
        backendSessionClosed = getSmartHealthStoredTokenSnapshot() === "";
      }
      if (!backendSessionClosed) {
        throw new PasswordChangeAuthorityError(
          "Mật khẩu đã đổi nhưng phiên backend hiện tại không còn thuộc tài khoản ban đầu; phiên mới không bị xóa.",
        );
      }

      if (result.provider === "firebase") {
        const firebaseSessionClosed = await signOutFirebaseIfUidMatches(
          completedIntent.firebaseUid || "",
        ).catch(() => false);
        if (!firebaseSessionClosed) {
          throw new PasswordChangeAuthorityError(
            "Mật khẩu đã đổi nhưng không thể kết thúc đúng phiên Firebase ban đầu. Tài khoản Firebase thay thế không bị đăng xuất.",
          );
        }
      }

      toast.success("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
      navigate("/login");
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Không thể cập nhật mật khẩu.");
      if (isPasswordChangeAuthorityError(error)) {
        const oldTokenCleared = intent
          ? clearSmartHealthStoredTokenIfMatches(intent.authToken)
          : false;
        const originalSessionIsAbsent =
          Boolean(intent) &&
          getSmartHealthStoredTokenSnapshot() === "" &&
          passwordAuthorityRef.current.userId === intent?.userId;
        if (oldTokenCleared || originalSessionIsAbsent) {
          passwordAuthorityRef.current = { userId: "", firebaseUid: null };
          setAccountUserId("");
          setAccountWorkspaceId("");
          setAccountFirebaseUid(null);
          setProfile(emptyProfile);
          setAvatarPreview("");
          setSessions([]);
          setTwoFactorStatus(null);
          setNotificationPreferencesReady(false);
        }
        abandonPasswordIntent(message);
      } else {
        if (!isAmbiguousPasswordMutationError(error)) {
          passwordChangeIntentRef.current = null;
        }
        setPasswordError(message);
      }
      toast.error(message);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const revokeSession = (session: SmartHealthAuthSession) => {
    setConfirmError("");
    setConfirmTask({
      title: "Đăng xuất phiên đăng nhập",
      description: (
        <span>
          Đăng xuất phiên <strong>{sessionDevice(session)}</strong> tại IP{" "}
          {session.ip || "không rõ"}? Người dùng trên thiết bị đó sẽ phải đăng nhập lại.
        </span>
      ),
      confirmLabel: "Đăng xuất phiên",
      run: async () => {
        const ownerUserId = sessionAuthorityUserIdRef.current.trim();
        const registry = sessionRevokeIntentsRef.current!;
        const intent = registry.getOrCreate(ownerUserId, session.id);
        try {
          await executeAuthSessionRevoke(
            intent,
            () => sessionAuthorityUserIdRef.current,
            (pendingIntent) => smartHealthApi.revokeSession(pendingIntent),
          );
          registry.confirm(intent);
        } catch (error) {
          registry.fail(intent, error);
          throw error;
        }
        await loadSessions();
        toast.success("Đã đăng xuất phiên đăng nhập.");
      },
    });
  };

  const revokeOtherSessions = () => {
    if (otherSessions.length === 0) return;
    setConfirmError("");
    setConfirmTask({
      title: "Đăng xuất tất cả thiết bị khác",
      description: `Hệ thống sẽ thu hồi ${otherSessions.length} phiên đăng nhập khác, trừ phiên hiện tại của bạn.`,
      confirmLabel: "Đăng xuất thiết bị khác",
      run: async () => {
        const ownerUserId = sessionAuthorityUserIdRef.current.trim();
        const registry = sessionRevokeIntentsRef.current!;
        const targets = [...otherSessions];
        const results = await Promise.allSettled(
          targets.map(async (session) => {
            const intent = registry.getOrCreate(ownerUserId, session.id);
            try {
              const receipt = await executeAuthSessionRevoke(
                intent,
                () => sessionAuthorityUserIdRef.current,
                (pendingIntent) => smartHealthApi.revokeSession(pendingIntent),
              );
              registry.confirm(intent);
              return receipt;
            } catch (error) {
              registry.fail(intent, error);
              throw error;
            }
          }),
        );
        await loadSessions();
        const confirmed = results.filter((result) => result.status === "fulfilled").length;
        if (confirmed !== targets.length) {
          const collision = results.some(
            (result) =>
              result.status === "rejected" && isAuthSessionIdempotencyCollision(result.reason),
          );
          const error = new Error(
            `Backend chỉ xác nhận thu hồi ${confirmed}/${targets.length} phiên. Danh sách đã được tải lại; vui lòng kiểm tra rồi thử lại.`,
          ) as Error & { code?: string; status?: number };
          if (collision) {
            error.code = "IDEMPOTENCY_KEY_REUSED";
            error.status = 409;
          }
          throw error;
        }
        toast.success("Đã đăng xuất tất cả thiết bị khác.");
      },
    });
  };

  const runConfirmTask = async () => {
    const task = confirmTask;
    if (!task) return;
    setConfirmLoading(true);
    setConfirmError("");
    try {
      await task.run();
      setConfirmTask(null);
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Không thể hoàn tất thao tác.");
      setConfirmError(message);
      toast.error(message);
    } finally {
      setConfirmLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
        Đang tải thông tin tài khoản...
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col max-w-4xl mx-auto w-full">
      <ConfirmActionDialog
        open={Boolean(confirmTask)}
        onOpenChange={(open) => {
          if (!open && !confirmLoading) {
            setConfirmTask(null);
            setConfirmError("");
          }
        }}
        title={confirmTask?.title || "Xác nhận thao tác"}
        description={confirmTask?.description || "Bạn có chắc chắn muốn tiếp tục?"}
        confirmLabel={confirmTask?.confirmLabel || "Xác nhận"}
        tone="danger"
        loading={confirmLoading}
        error={confirmError}
        onConfirm={runConfirmTask}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Cài đặt tài khoản</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Quản lý hồ sơ cá nhân, avatar, mật khẩu và phiên đăng nhập của tài khoản admin.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saveStatus === "saving"}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saveStatus === "saving"
            ? "Đang lưu..."
            : saveStatus === "success"
              ? "Đã lưu"
              : "Lưu thay đổi"}
        </button>
      </div>

      <Tabs.Root defaultValue="profile" className="flex-1 flex flex-col">
        <Tabs.List className="flex space-x-6 border-b border-border mb-6 overflow-x-auto">
          <Tabs.Trigger
            value="profile"
            className="pb-3 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all flex items-center gap-2 whitespace-nowrap"
          >
            <User className="w-4 h-4" /> Thông tin cá nhân
          </Tabs.Trigger>
          <Tabs.Trigger
            value="security"
            className="pb-3 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all flex items-center gap-2 whitespace-nowrap"
          >
            <Shield className="w-4 h-4" /> Bảo mật tài khoản
          </Tabs.Trigger>
          <Tabs.Trigger
            value="notifications"
            className="pb-3 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all flex items-center gap-2 whitespace-nowrap"
          >
            <Bell className="w-4 h-4" /> Thông báo cá nhân
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="profile" className="space-y-6">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-6">
            <div>
              <h3 className="text-base font-semibold mb-4">Ảnh đại diện</h3>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-border bg-primary/10 text-primary">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-semibold">
                      {(profile.name || profile.email || "SH").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                    title="Tải ảnh đại diện"
                    aria-label="Tải ảnh đại diện"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Kích thước tối đa 2MB. Hỗ trợ JPG, PNG, WebP.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={handleAvatarFile}
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                    >
                      <UploadCloud className="h-4 w-4" />{" "}
                      {avatarUploading ? "Đang tải..." : "Tải ảnh lên"}
                    </button>
                    <button
                      type="button"
                      onClick={removeAvatar}
                      disabled={!profile.avatarFileId && !profile.avatarUrl}
                      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" /> Gỡ ảnh
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px w-full bg-border" />

            <div>
              <h3 className="text-base font-semibold mb-4">Thông tin cơ bản</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Field
                  label="Họ và tên"
                  value={profile.name}
                  onChange={(value) => updateProfile({ name: value })}
                />
                <Field
                  label="Chức vụ"
                  value={profile.title}
                  onChange={(value) => updateProfile({ title: value })}
                />
                <IconField
                  label="Email"
                  icon={Mail}
                  value={profile.email}
                  readOnly
                  note="Email do Firebase Auth quản lý, không đổi trong admin."
                />
                <IconField
                  label="Số điện thoại"
                  icon={Phone}
                  value={profile.phone}
                  onChange={(value) => updateProfile({ phone: value })}
                />
                <Field
                  label="Mã chứng chỉ / license"
                  value={profile.license}
                  onChange={(value) => updateProfile({ license: value })}
                />
                <Field
                  label="Bệnh viện / đơn vị"
                  value={profile.hospital}
                  onChange={(value) => updateProfile({ hospital: value })}
                />
                <Field
                  label="Khoa / phòng ban"
                  value={profile.department}
                  onChange={(value) => updateProfile({ department: value })}
                />
                <Field
                  label="Chuyên môn"
                  value={profile.specialty}
                  onChange={(value) => updateProfile({ specialty: value })}
                />
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="account-address" className="text-sm font-medium text-foreground">
                    Địa chỉ
                  </label>
                  <textarea
                    id="account-address"
                    name="address"
                    value={profile.address}
                    onChange={(event) => updateProfile({ address: event.target.value })}
                    rows={3}
                    className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="security" className="space-y-6">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
            Cài đặt bảo mật trong tab này chỉ áp dụng cho tài khoản của bạn. Chính sách toàn hệ
            thống nằm ở Cài đặt hệ thống.
          </div>

          <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-6">
            <div>
              <h3 className="text-base font-semibold mb-4">Đổi mật khẩu</h3>
              <form
                className="max-w-md space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handlePasswordChange();
                }}
              >
                <PasswordField
                  id="admin-current-password"
                  label="Mật khẩu hiện tại"
                  value={passwordForm.currentPassword}
                  show={showCurrentPw}
                  autoComplete="current-password"
                  disabled={passwordSubmitting}
                  onToggle={() => setShowCurrentPw((value) => !value)}
                  onChange={(value) => updatePasswordField("currentPassword", value)}
                />
                <PasswordField
                  id="admin-new-password"
                  label="Mật khẩu mới"
                  value={passwordForm.newPassword}
                  show={showNewPw}
                  autoComplete="new-password"
                  disabled={passwordSubmitting}
                  onToggle={() => setShowNewPw((value) => !value)}
                  onChange={(value) => updatePasswordField("newPassword", value)}
                />
                <PasswordField
                  id="admin-confirm-password"
                  label="Xác nhận mật khẩu mới"
                  value={passwordForm.confirmPassword}
                  show={showConfirmPw}
                  autoComplete="new-password"
                  disabled={passwordSubmitting}
                  onToggle={() => setShowConfirmPw((value) => !value)}
                  onChange={(value) => updatePasswordField("confirmPassword", value)}
                />
                <button
                  type="submit"
                  disabled={passwordSubmitting}
                  aria-busy={passwordSubmitting}
                  className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {passwordSubmitting ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
                </button>
                {passwordError && (
                  <div
                    role="alert"
                    className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                  >
                    <p>{passwordError}</p>
                    {passwordForm.currentPassword &&
                      passwordForm.newPassword &&
                      passwordForm.confirmPassword && (
                        <button
                          type="button"
                          disabled={passwordSubmitting}
                          onClick={() => void handlePasswordChange()}
                          className="min-h-11 rounded-md border border-destructive/30 px-3 py-2 font-medium hover:bg-destructive/10 disabled:opacity-60"
                        >
                          Thử lại cùng thao tác
                        </button>
                      )}
                  </div>
                )}
              </form>
            </div>

            <div className="h-px w-full bg-border" />

            <div>
              <h3 className="text-base font-semibold mb-4">Xác thực hai yếu tố (2FA)</h3>
              <div className="space-y-3">
                {twoFactorLoading ? (
                  <div
                    role="status"
                    className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground"
                  >
                    Đang tải trạng thái xác thực hai yếu tố...
                  </div>
                ) : twoFactorError ? (
                  <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>{twoFactorError}</span>
                    <button
                      type="button"
                      onClick={() => void refreshTwoFactorStatus()}
                      className="shrink-0 rounded-md border border-destructive/30 px-3 py-2 font-medium hover:bg-destructive/10"
                    >
                      Tải lại trạng thái
                    </button>
                  </div>
                ) : (
                  <div
                    className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-primary"
                    aria-live="polite"
                  >
                    <p className="font-semibold">
                      Trạng thái:{" "}
                      {twoFactorStatus?.twoFactor.enabled
                        ? `Đã bật (${twoFactorStatus.twoFactor.method || "app"})`
                        : twoFactorStatus?.twoFactor.enrollmentPending
                          ? "Đang chờ xác minh"
                          : "Chưa bật"}
                    </p>
                    <p className="mt-2 text-foreground">
                      Backend chỉ đánh dấu 2FA là đã bật sau khi quy trình đăng ký hoàn tất xác minh
                      mã OTP. Platform Admin hiện chỉ đọc trạng thái để không tạo kết quả thành công
                      giả hoặc làm khóa tài khoản bằng một quy trình chưa đầy đủ.
                    </p>
                    <p className="mt-2 text-muted-foreground">
                      Phương thức khả dụng:{" "}
                      {twoFactorStatus?.availability.available &&
                      twoFactorStatus.availability.methods.length > 0
                        ? twoFactorStatus.availability.methods.join(", ")
                        : "chưa có"}
                      . SMS chỉ xuất hiện khi provider thật được cấu hình.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="h-px w-full bg-border" />

            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Phiên đăng nhập hiện tại</h3>
                <button
                  onClick={loadSessions}
                  disabled={sessionsLoading}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                >
                  {sessionsLoading ? "Đang tải..." : "Tải lại"}
                </button>
              </div>
              <div className="space-y-3">
                {activeSessions.length === 0 ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Chưa có phiên đăng nhập nào được backend ghi nhận.
                  </div>
                ) : (
                  activeSessions.map((session) => {
                    const Icon = sessionIcon(session);
                    return (
                      <div
                        key={session.id}
                        className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${session.current ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${session.current ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              <span>{sessionDevice(session)}</span>
                              {session.current && (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                                  Phiên này
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {session.ip || "IP không rõ"} • {session.provider || "nội bộ"} •{" "}
                              {formatSessionTime(session.lastSeenAt || session.createdAt)}
                            </div>
                          </div>
                        </div>
                        {!session.current && (
                          <button
                            onClick={() => revokeSession(session)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <LogOut className="h-3.5 w-3.5" /> Đăng xuất
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
                <button
                  onClick={revokeOtherSessions}
                  disabled={otherSessions.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/30 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4" /> Đăng xuất tất cả thiết bị khác
                </button>
              </div>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="notifications" className="space-y-6">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
            Mỗi tùy chọn được lưu độc lập và chỉ đổi trạng thái sau khi backend xác nhận đúng tài
            khoản đang đăng nhập.
          </div>
          {notificationPreferencesError && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{notificationPreferencesError}</span>
              <button
                type="button"
                onClick={() => void refreshNotificationPreferences()}
                className="shrink-0 rounded-md border border-destructive/30 px-3 py-2 font-medium hover:bg-destructive/10"
              >
                Tải lại tùy chọn
              </button>
            </div>
          )}
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-4">
            {notificationPreferenceRows.map(({ key, title, description }) => (
              <div
                key={title}
                className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
              >
                <div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
                </div>
                <Switch
                  checked={profile.notificationPreferences[key]}
                  onCheckedChange={(checked) => void updateNotificationPreference(key, checked)}
                  disabled={preferencePendingKeys.has(key) || !notificationPreferencesReady}
                  aria-busy={preferencePendingKeys.has(key)}
                  aria-label={title}
                />
              </div>
            ))}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={inputId}
        name={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
      />
    </div>
  );
}

function IconField({
  label,
  icon: Icon,
  value,
  onChange,
  readOnly,
  note,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  note?: string;
}) {
  const inputId = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          name={inputId}
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
          className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring read-only:bg-muted/40"
        />
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  show,
  autoComplete,
  disabled,
  onToggle,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  show: boolean;
  autoComplete: "current-password" | "new-password";
  disabled?: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-12 text-sm outline-none focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={`${show ? "Ẩn" : "Hiện"} ${label.toLocaleLowerCase("vi-VN")}`}
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
