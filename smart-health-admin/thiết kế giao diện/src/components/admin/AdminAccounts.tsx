import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import {
  smartHealthApi,
  type SmartHealthAdminAccount,
  type SmartHealthAdminAccountRole,
  type SmartHealthClinic,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { CreateAdminAccountDialog } from "./dialogs/CreateAdminAccountDialog";

type ConfirmTask = {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: "danger" | "warning" | "success";
  run: () => Promise<void>;
};

type AccountDraft = {
  name: string;
  phone: string;
  title: string;
  role: SmartHealthAdminAccountRole;
  organizationId: string;
  accountStatus: string;
};

const roleLabels: Record<string, string> = {
  admin: "Admin toàn hệ thống",
  platform_admin: "Admin toàn hệ thống",
  workspace_admin: "Admin bệnh viện",
  workspace_owner: "Chủ sở hữu bệnh viện",
};

const statusLabels: Record<string, string> = {
  active: "Đang hoạt động",
  locked: "Đã khóa",
};

const emptyDraft: AccountDraft = {
  name: "",
  phone: "",
  title: "",
  role: "workspace_admin",
  organizationId: "",
  accountStatus: "active",
};

function normalizeRole(role?: string): SmartHealthAdminAccountRole {
  if (
    role === "admin" ||
    role === "platform_admin" ||
    role === "workspace_admin" ||
    role === "workspace_owner"
  ) {
    return role;
  }
  return "workspace_admin";
}

function formatDateTime(value?: string) {
  if (!value) return "Chưa có";
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

function draftFromAccount(account: SmartHealthAdminAccount | null): AccountDraft {
  if (!account) return emptyDraft;
  return {
    name: account.name || "",
    phone: account.phone || "",
    title: account.title || "",
    role: normalizeRole(account.role),
    organizationId:
      account.organizationId || account.workspaceId || account.currentWorkspaceId || "",
    accountStatus: account.accountStatus || "active",
  };
}

function isWorkspaceRole(role: string) {
  return role === "workspace_admin" || role === "workspace_owner";
}

export function AdminAccounts() {
  const [accounts, setAccounts] = useState<SmartHealthAdminAccount[]>([]);
  const [clinics, setClinics] = useState<SmartHealthClinic[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmTask, setConfirmTask] = useState<ConfirmTask | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const resetPasswordRef = useRef("");

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId) || null,
    [accounts, selectedId],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountResponse, clinicResponse] = await Promise.all([
        smartHealthApi.listAdminAccounts({
          q: query.trim() || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
        }),
        smartHealthApi.listClinics(),
      ]);
      setAccounts(accountResponse.users);
      setClinics(clinicResponse.clinics);
      setSelectedId((current) => {
        if (current && accountResponse.users.some((account) => account.id === current))
          return current;
        return accountResponse.users[0]?.id || "";
      });
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể tải danh sách tài khoản admin."));
    } finally {
      setLoading(false);
    }
  }, [query, roleFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setDraft(draftFromAccount(selectedAccount));
  }, [selectedAccount]);

  const saveSelected = async () => {
    if (!selectedAccount) return;
    if (!draft.name.trim()) {
      toast.error("Họ tên admin là bắt buộc.");
      return;
    }
    if (isWorkspaceRole(draft.role) && !draft.organizationId) {
      toast.error("Admin bệnh viện phải được gán vào một workspace.");
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof smartHealthApi.updateAdminAccount>[1] = {};
      const nextName = draft.name.trim();
      const nextPhone = draft.phone.trim();
      const nextTitle = draft.title.trim();
      const currentRole = normalizeRole(selectedAccount.role);
      const currentOrganizationId =
        selectedAccount.organizationId ||
        selectedAccount.workspaceId ||
        selectedAccount.currentWorkspaceId ||
        "";

      if (nextName !== (selectedAccount.name || "")) payload.name = nextName;
      if (nextPhone !== (selectedAccount.phone || "")) payload.phone = nextPhone;
      if (nextTitle !== (selectedAccount.title || "")) payload.title = nextTitle;
      if (draft.accountStatus !== (selectedAccount.accountStatus || "active")) {
        payload.accountStatus = draft.accountStatus;
      }
      if (draft.role !== currentRole) {
        payload.role = draft.role;
      }
      if (isWorkspaceRole(draft.role) && draft.organizationId !== currentOrganizationId) {
        payload.organizationId = draft.organizationId;
      }
      if (Object.keys(payload).length === 0) {
        toast.info("Không có thay đổi nào để lưu.");
        return;
      }
      const { user } = await smartHealthApi.updateAdminAccount(selectedAccount.id, payload);
      setAccounts((current) => current.map((account) => (account.id === user.id ? user : account)));
      setSelectedId(user.id);
      toast.success("Đã lưu tài khoản admin.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể lưu tài khoản admin."));
    } finally {
      setSaving(false);
    }
  };

  const runConfirmTask = async () => {
    const task = confirmTask;
    if (!task) return;
    setConfirmLoading(true);
    setConfirmError("");
    try {
      await task.run();
      setConfirmTask(null);
      resetPasswordRef.current = "";
      setResetPassword("");
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Không thể hoàn tất thao tác.");
      setConfirmError(message);
      toast.error(message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const refreshAfterMutation = async (targetId?: string) => {
    await loadData();
    if (targetId) setSelectedId(targetId);
  };

  const askLockToggle = (account: SmartHealthAdminAccount) => {
    const locked = account.accountStatus === "locked";
    setConfirmError("");
    setConfirmTask({
      title: locked ? "Mở khóa tài khoản admin" : "Khóa tài khoản admin",
      description: (
        <span>
          {locked ? "Mở khóa" : "Khóa"} tài khoản <strong>{account.email}</strong>?{" "}
          {!locked ? "Tất cả phiên đăng nhập hiện tại của tài khoản này sẽ bị thu hồi." : ""}
        </span>
      ),
      confirmLabel: locked ? "Mở khóa" : "Khóa tài khoản",
      tone: locked ? "success" : "warning",
      run: async () => {
        const { user } = locked
          ? await smartHealthApi.unlockAdminAccount(account.id)
          : await smartHealthApi.lockAdminAccount(account.id);
        await refreshAfterMutation(user.id);
        toast.success(locked ? "Đã mở khóa tài khoản admin." : "Đã khóa tài khoản admin.");
      },
    });
  };

  const askResetPassword = (account: SmartHealthAdminAccount) => {
    resetPasswordRef.current = "";
    setResetPassword("");
    setConfirmError("");
    setConfirmTask({
      title: "Đặt lại mật khẩu admin",
      description: (
        <span>
          Nhập mật khẩu tạm thời mới cho <strong>{account.email}</strong>. Sau khi đặt lại, các
          phiên cũ sẽ bị thu hồi.
        </span>
      ),
      confirmLabel: "Đặt lại mật khẩu",
      tone: "warning",
      run: async () => {
        const password = resetPasswordRef.current;
        if (password.length < 8) {
          throw new Error("Mật khẩu tạm thời cần tối thiểu 8 ký tự.");
        }
        const { user } = await smartHealthApi.resetAdminAccountPassword(account.id, password);
        await refreshAfterMutation(user.id);
        toast.success("Đã đặt lại mật khẩu admin.");
      },
    });
  };

  const askDelete = (account: SmartHealthAdminAccount) => {
    setConfirmError("");
    setConfirmTask({
      title: "Xóa tài khoản admin",
      description: (
        <span>
          Xóa tài khoản <strong>{account.email}</strong>? Backend sẽ xóa user backend, membership,
          phiên đăng nhập và tài khoản Firebase liên kết nếu có. Hành động này không thể hoàn tác.
        </span>
      ),
      confirmLabel: "Xóa tài khoản",
      tone: "danger",
      run: async () => {
        await smartHealthApi.deleteAdminAccount(account.id);
        setSelectedId("");
        await refreshAfterMutation();
        toast.success("Đã xóa tài khoản admin.");
      },
    });
  };

  return (
    <div className="space-y-6">
      <ConfirmActionDialog
        open={Boolean(confirmTask)}
        title={confirmTask?.title || ""}
        description={
          confirmTask?.title === "Đặt lại mật khẩu admin" ? (
            <div className="space-y-3">
              <p>{confirmTask.description}</p>
              <input
                type="password"
                value={resetPassword}
                onChange={(event) => {
                  resetPasswordRef.current = event.target.value;
                  setResetPassword(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                placeholder="Mật khẩu tạm thời tối thiểu 8 ký tự"
              />
            </div>
          ) : (
            confirmTask?.description || ""
          )
        }
        confirmLabel={confirmTask?.confirmLabel || "Xác nhận"}
        tone={confirmTask?.tone || "danger"}
        loading={confirmLoading}
        error={confirmError}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTask(null);
            setConfirmError("");
            resetPasswordRef.current = "";
            setResetPassword("");
          }
        }}
        onConfirm={runConfirmTask}
      />
      <CreateAdminAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (user) => {
          await refreshAfterMutation(user.id);
        }}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Quản lý tài khoản admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tạo, cấp quyền, khóa/mở khóa, đặt lại mật khẩu và xóa tài khoản quản trị.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Làm mới
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Tạo admin
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên, email, số điện thoại, workspace..."
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-ring"
            />
          </label>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="">Tất cả vai trò</option>
            <option value="admin">Admin toàn hệ thống</option>
            <option value="workspace_admin">Admin bệnh viện</option>
            <option value="workspace_owner">Chủ sở hữu bệnh viện</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Đã khóa</option>
          </select>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.9fr)]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            Danh sách tài khoản ({accounts.length})
          </div>
          {loading ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải tài khoản admin...
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <UserCog className="mb-3 h-10 w-10 text-muted-foreground/60" />
              Chưa có tài khoản admin phù hợp bộ lọc.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Tài khoản</th>
                    <th className="px-4 py-3 text-left font-semibold">Vai trò</th>
                    <th className="px-4 py-3 text-left font-semibold">Workspace</th>
                    <th className="px-4 py-3 text-left font-semibold">Trạng thái</th>
                    <th className="px-4 py-3 text-left font-semibold">Phiên</th>
                    <th className="px-4 py-3 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accounts.map((account) => {
                    const active = account.id === selectedId;
                    const locked = account.accountStatus === "locked";
                    return (
                      <tr
                        key={account.id}
                        className={active ? "bg-primary/5" : "hover:bg-muted/30"}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedId(account.id)}
                            className="text-left"
                          >
                            <div className="font-medium text-foreground">
                              {account.name || "Chưa đặt tên"}
                            </div>
                            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3.5 w-3.5" /> {account.email || "Chưa có email"}
                            </div>
                            {account.phone ? (
                              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3.5 w-3.5" /> {account.phone}
                              </div>
                            ) : null}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                            <ShieldCheck className="h-3.5 w-3.5" />{" "}
                            {roleLabels[account.role || ""] || account.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {account.role === "admin"
                            ? "Toàn hệ thống"
                            : account.workspaceName || account.hospital || "Chưa gán"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-semibold ${locked ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}
                          >
                            {statusLabels[account.accountStatus || "active"] ||
                              account.accountStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div>{account.activeSessionCount || 0} phiên</div>
                          <div className="text-xs">Cuối: {formatDateTime(account.lastLoginAt)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => askResetPassword(account)}
                              className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground"
                              title="Đặt lại mật khẩu"
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => askLockToggle(account)}
                              className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground"
                              title={locked ? "Mở khóa" : "Khóa"}
                            >
                              {locked ? (
                                <Unlock className="h-4 w-4" />
                              ) : (
                                <Lock className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => askDelete(account)}
                              className="rounded-md border border-destructive/20 p-2 text-destructive hover:bg-destructive/10"
                              title="Xóa tài khoản"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Chi tiết tài khoản</h2>
              <p className="text-xs text-muted-foreground">
                Chọn một tài khoản để chỉnh thông tin và quyền.
              </p>
            </div>
          </div>

          {!selectedAccount ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Chưa chọn tài khoản admin.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Email
                </label>
                <input
                  value={selectedAccount.email || ""}
                  readOnly
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Email là định danh Firebase Auth, không đổi tại đây.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Họ tên
                </label>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Chức vụ
                </label>
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Số điện thoại
                </label>
                <input
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, phone: event.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Vai trò
                </label>
                <select
                  value={draft.role}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, role: normalizeRole(event.target.value) }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                >
                  <option value="admin">Admin toàn hệ thống</option>
                  <option value="workspace_admin">Admin bệnh viện</option>
                  <option value="workspace_owner">Chủ sở hữu bệnh viện</option>
                </select>
              </div>
              {isWorkspaceRole(draft.role) ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Workspace/Bệnh viện
                  </label>
                  <select
                    value={draft.organizationId}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, organizationId: event.target.value }))
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="">Chọn workspace</option>
                    {clinics.map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinic.name || clinic.id}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Trạng thái
                </label>
                <select
                  value={draft.accountStatus}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, accountStatus: event.target.value }))
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                >
                  <option value="active">Đang hoạt động</option>
                  <option value="locked">Đã khóa</option>
                </select>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Workspace hiện tại:{" "}
                  {selectedAccount.workspaceName || selectedAccount.hospital || "Chưa gán"}
                </div>
                <div className="mt-1">
                  Cập nhật cuối: {formatDateTime(selectedAccount.updatedAt)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void saveSelected()}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
