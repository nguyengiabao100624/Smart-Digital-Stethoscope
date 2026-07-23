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
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  smartHealthApi,
  type SmartHealthAuthSession,
  type SmartHealthAuthUser,
} from "@/lib/smart-health-api";
import { changeFirebasePassword, hasFirebaseWebConfig } from "@/lib/firebase-client";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { ConfirmActionDialog } from "./ConfirmActionDialog";

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
  twoFactorEnabled: boolean;
  twoFactorMethod: string;
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
  twoFactorEnabled: false,
  twoFactorMethod: "",
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
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    twoFactorMethod: user.twoFactorMethod || "",
    notificationPreferences: {
      doctorRequests: preferences.doctorRequests !== false,
      abnormalResults: preferences.abnormalResults !== false,
      deviceOffline: preferences.deviceOffline !== false,
      newLogin: preferences.newLogin !== false,
    },
  };
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarObjectUrlRef = useRef("");
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
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [{ user }] = await Promise.all([smartHealthApi.me(), loadSessions()]);
        if (!cancelled) setProfile(profileFromUser(user));
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

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      const { user } = await smartHealthApi.updateMe({
        name: profile.name,
        title: profile.title,
        phone: profile.phone,
        license: profile.license,
        hospital: profile.hospital,
        department: profile.department,
        specialty: profile.specialty,
        address: profile.address,
        avatarFileId: profile.avatarFileId,
        avatarUrl: profile.avatarUrl,
        notificationPreferences: profile.notificationPreferences,
      });
      setProfile(profileFromUser(user));
      setSaveStatus("success");
      toast.success("Đã lưu cài đặt tài khoản");
      window.setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      setSaveStatus("idle");
      toast.error(toVietnameseErrorMessage(error, "Không thể lưu cài đặt tài khoản."));
    }
  };

  const updateTwoFactor = async (method: "app" | "sms" | "disable") => {
    try {
      const { user, twoFactor } = await smartHealthApi.updateTwoFactor(
        method === "disable" ? { action: "disable" } : { action: "enable", method },
      );
      setProfile(profileFromUser(user));
      if (twoFactor.recoveryCodes?.length) {
        toast.success(`Đã bật 2FA ${method.toUpperCase()}. Recovery codes đã được backend tạo.`);
      } else {
        toast.success(method === "disable" ? "Đã tắt 2FA." : "Đã cập nhật 2FA.");
      }
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể cập nhật 2FA."));
    }
  };

  const updateNotificationPreference = async (
    key: keyof ProfileState["notificationPreferences"],
    value: boolean,
  ) => {
    const nextPreferences = {
      ...profile.notificationPreferences,
      [key]: value,
    };
    setProfile((current) => ({ ...current, notificationPreferences: nextPreferences }));
    try {
      const { user } = await smartHealthApi.updateMe({ notificationPreferences: nextPreferences });
      setProfile(profileFromUser(user));
      toast.success("Đã lưu tùy chọn thông báo.");
    } catch (error) {
      setProfile((current) => ({
        ...current,
        notificationPreferences: {
          ...current.notificationPreferences,
          [key]: !value,
        },
      }));
      toast.error(toVietnameseErrorMessage(error, "Không thể lưu tùy chọn thông báo."));
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
      const { user } = await smartHealthApi.uploadMyAvatar(file);
      setProfile(profileFromUser(user));
      toast.success("Đã cập nhật ảnh đại diện.");
    } catch (error) {
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
        const { user } = await smartHealthApi.deleteMyAvatar();
        if (avatarObjectUrlRef.current) {
          URL.revokeObjectURL(avatarObjectUrlRef.current);
          avatarObjectUrlRef.current = "";
        }
        setAvatarPreview("");
        setProfile(profileFromUser(user));
        toast.success("Đã gỡ ảnh đại diện.");
      },
    });
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error("Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp.");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error("Mật khẩu mới cần tối thiểu 8 ký tự.");
      return;
    }
    try {
      if (hasFirebaseWebConfig()) {
        const idToken = await changeFirebasePassword(
          passwordForm.currentPassword,
          passwordForm.newPassword,
        );
        await smartHealthApi.authenticateFirebase(idToken);
        await smartHealthApi.changePassword({ firebaseClientUpdated: true });
      } else {
        await smartHealthApi.changePassword({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        });
      }
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Đã cập nhật mật khẩu thành công.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể cập nhật mật khẩu."));
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
        await smartHealthApi.revokeSession(session.id);
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
        await Promise.all(otherSessions.map((session) => smartHealthApi.revokeSession(session.id)));
        await loadSessions();
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
                  <label className="text-sm font-medium text-foreground">Địa chỉ</label>
                  <textarea
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
              <div className="space-y-4 max-w-md">
                <PasswordField
                  label="Mật khẩu hiện tại"
                  value={passwordForm.currentPassword}
                  show={showCurrentPw}
                  onToggle={() => setShowCurrentPw((value) => !value)}
                  onChange={(value) =>
                    setPasswordForm((current) => ({ ...current, currentPassword: value }))
                  }
                />
                <PasswordField
                  label="Mật khẩu mới"
                  value={passwordForm.newPassword}
                  show={showNewPw}
                  onToggle={() => setShowNewPw((value) => !value)}
                  onChange={(value) =>
                    setPasswordForm((current) => ({ ...current, newPassword: value }))
                  }
                />
                <PasswordField
                  label="Xác nhận mật khẩu mới"
                  value={passwordForm.confirmPassword}
                  show={showConfirmPw}
                  onToggle={() => setShowConfirmPw((value) => !value)}
                  onChange={(value) =>
                    setPasswordForm((current) => ({ ...current, confirmPassword: value }))
                  }
                />
                <button
                  onClick={handlePasswordChange}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Cập nhật mật khẩu
                </button>
              </div>
            </div>

            <div className="h-px w-full bg-border" />

            <div>
              <h3 className="text-base font-semibold mb-4">Xác thực hai yếu tố (2FA)</h3>
              <div className="space-y-3">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                  Trạng thái:{" "}
                  {profile.twoFactorEnabled
                    ? `Đã bật (${profile.twoFactorMethod || "app"})`
                    : "Chưa bật"}
                  . Trạng thái 2FA và recovery code được backend ghi nhận; OTP provider có thể nối
                  thêm theo môi trường triển khai.
                </div>
                <ActionRow
                  title="Xác thực qua ứng dụng"
                  description="Bật 2FA bằng ứng dụng và tạo recovery codes trên backend"
                  button={
                    profile.twoFactorEnabled && profile.twoFactorMethod === "app"
                      ? "Đang bật"
                      : "Bật app 2FA"
                  }
                  disabled={profile.twoFactorEnabled && profile.twoFactorMethod === "app"}
                  onClick={() => void updateTwoFactor("app")}
                />
                <ActionRow
                  title="Xác thực qua SMS"
                  description="Bật 2FA qua SMS; yêu cầu tài khoản có số điện thoại"
                  button={
                    profile.twoFactorEnabled && profile.twoFactorMethod === "sms"
                      ? "Đang bật"
                      : "Bật SMS 2FA"
                  }
                  disabled={profile.twoFactorEnabled && profile.twoFactorMethod === "sms"}
                  onClick={() => void updateTwoFactor("sms")}
                />
                <button
                  onClick={() => void updateTwoFactor("disable")}
                  disabled={!profile.twoFactorEnabled}
                  className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Tắt 2FA
                </button>
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
            Tùy chọn thông báo cá nhân được lưu trực tiếp vào hồ sơ tài khoản backend.
          </div>
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-4">
            {[
              ["doctorRequests", "Bác sĩ mới đăng ký", "Thông báo khi có bác sĩ cần duyệt"],
              [
                "abnormalResults",
                "Cảnh báo kết quả cần xem xét",
                "Thông báo khi backend ghi nhận cảnh báo cần người có chuyên môn xem xét",
              ],
              [
                "deviceOffline",
                "Thiết bị offline",
                "Thông báo khi thiết bị mất kết nối quá 30 phút",
              ],
              [
                "newLogin",
                "Đăng nhập từ thiết bị lạ",
                "Thông báo khi tài khoản có phiên đăng nhập mới",
              ],
            ].map(([key, title, description]) => (
              <div
                key={title}
                className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
              >
                <div>
                  <div className="text-sm font-medium">{title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
                </div>
                <Switch
                  checked={
                    profile.notificationPreferences[
                      key as keyof ProfileState["notificationPreferences"]
                    ]
                  }
                  onCheckedChange={(checked) =>
                    void updateNotificationPreference(
                      key as keyof ProfileState["notificationPreferences"],
                      checked,
                    )
                  }
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
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
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
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
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
  label,
  value,
  show,
  onToggle,
  onChange,
}: {
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-10 text-sm outline-none focus:border-ring"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ActionRow({
  title,
  description,
  button,
  disabled = false,
  onClick,
}: {
  title: string;
  description: string;
  button: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-4">
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        {button}
      </button>
    </div>
  );
}
