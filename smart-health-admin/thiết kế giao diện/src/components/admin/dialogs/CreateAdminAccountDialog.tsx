import React, { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, CheckCircle2, KeyRound, Loader2, Mail, Phone, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  smartHealthApi,
  type CreateAdminAccountPayload,
  type SmartHealthClinic,
  type SmartHealthAuthUser,
} from "@/lib/smart-health-api";

type FormData = {
  role: CreateAdminAccountPayload["role"];
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  organizationId: string;
};

interface CreateAdminAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (user: SmartHealthAuthUser) => void | Promise<void>;
}

const emptyForm: FormData = {
  role: "workspace_admin",
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  organizationId: "",
};

const roleOptions = [
  {
    value: "workspace_admin" as const,
    label: "Admin bệnh viện",
    description: "Quản lý bác sĩ, bệnh nhân, thiết bị, lưu trữ và cài đặt của một bệnh viện.",
  },
  {
    value: "admin" as const,
    label: "Admin toàn hệ thống",
    description: "Quản lý toàn bộ workspace, gói dịch vụ, hạ tầng và tài khoản quản trị.",
  },
];

export function CreateAdminAccountDialog({ open, onOpenChange, onCreated }: CreateAdminAccountDialogProps) {
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [clinics, setClinics] = useState<SmartHealthClinic[]>([]);
  const [isLoadingClinics, setIsLoadingClinics] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdUser, setCreatedUser] = useState<SmartHealthAuthUser | null>(null);

  const selectedRole = useMemo(
    () => roleOptions.find((item) => item.value === formData.role) || roleOptions[0],
    [formData.role],
  );
  const requiresWorkspace = formData.role === "workspace_admin" || formData.role === "workspace_owner";

  useEffect(() => {
    if (!open) return;
    setCreatedUser(null);
    setIsLoadingClinics(true);
    smartHealthApi
      .listClinics()
      .then((response) => {
        const activeClinics = response.clinics.filter((clinic) => String(clinic.status || "active") === "active");
        setClinics(activeClinics);
        setFormData((current) => ({
          ...current,
          organizationId: current.organizationId || activeClinics[0]?.id || "",
        }));
      })
      .catch((error) => {
        toast.error("Không thể tải danh sách bệnh viện", {
          description: error instanceof Error ? error.message : "Vui lòng kiểm tra backend.",
        });
      })
      .finally(() => setIsLoadingClinics(false));
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) {
      setFormData(emptyForm);
      setCreatedUser(null);
    }
    onOpenChange(nextOpen);
  };

  const handleRoleChange = (role: FormData["role"]) => {
    setFormData((current) => ({
      ...current,
      role,
      organizationId: role === "admin" ? "" : current.organizationId || clinics[0]?.id || "",
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (formData.password.length < 8) {
      toast.error("Mật khẩu tạm thời quá ngắn", {
        description: "Vui lòng dùng ít nhất 8 ký tự cho tài khoản admin.",
      });
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error("Mật khẩu nhập lại chưa khớp");
      return;
    }
    if (requiresWorkspace && !formData.organizationId) {
      toast.error("Chưa chọn bệnh viện", {
        description: "Admin bệnh viện phải được gán vào một workspace cụ thể.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await smartHealthApi.createAdminAccount({
        role: formData.role,
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        password: formData.password,
        organizationId: requiresWorkspace ? formData.organizationId : undefined,
      });
      setCreatedUser(response.user);
      setFormData((current) => ({
        ...current,
        password: "",
        confirmPassword: "",
      }));
      toast.success("Đã tạo tài khoản admin", {
        description: `${response.user.email || formData.email} có thể đăng nhập bằng Firebase Auth.`,
      });
      await onCreated?.(response.user);
    } catch (error) {
      toast.error("Không thể tạo tài khoản admin", {
        description: error instanceof Error ? error.message : "Vui lòng kiểm tra backend và Firebase Admin.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">Tạo tài khoản admin</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Tạo Firebase user và cấp quyền quản trị trực tiếp từ Web Admin.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {createdUser ? (
            <div className="space-y-5 p-6">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Tài khoản đã sẵn sàng</p>
                    <p className="mt-1 text-sm">
                      {createdUser.email} đã được cấp quyền{" "}
                      {createdUser.role === "admin" ? "admin toàn hệ thống" : "admin bệnh viện"}.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <InfoCard label="Email" value={createdUser.email || ""} />
                <InfoCard label="Vai trò" value={createdUser.role === "admin" ? "Admin toàn hệ thống" : "Admin bệnh viện"} />
                <InfoCard label="Workspace" value={createdUser.workspace?.name || createdUser.hospital || "Smart Health"} />
                <InfoCard label="Firebase UID" value={createdUser.firebaseUid || ""} />
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Mật khẩu tạm thời không được lưu trong backend. Hãy gửi mật khẩu cho người dùng qua kênh riêng và yêu cầu đổi mật khẩu sau khi đăng nhập.
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setFormData(emptyForm);
                    setCreatedUser(null);
                  }}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Tạo thêm tài khoản
                </button>
                <Dialog.Close asChild>
                  <button type="button" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                    Hoàn tất
                  </button>
                </Dialog.Close>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 p-6">
              <section className="space-y-4">
                <h3 className="font-medium text-foreground">Quyền quản trị</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {roleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleRoleChange(option.value)}
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        formData.role === option.value
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-background hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span className="font-medium">{option.label}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{option.description}</p>
                    </button>
                  ))}
                </div>
              </section>

              {requiresWorkspace && (
                <section className="space-y-4 border-t border-border pt-4">
                  <h3 className="font-medium text-foreground">Workspace được quản lý</h3>
                  <Field label="Bệnh viện / phòng khám" required icon={<Building2 className="h-4 w-4" />}>
                    <select
                      required
                      disabled={isLoadingClinics}
                      value={formData.organizationId}
                      onChange={(event) => setFormData({ ...formData, organizationId: event.target.value })}
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60"
                    >
                      <option value="">{isLoadingClinics ? "Đang tải workspace..." : "Chọn workspace"}</option>
                      {clinics.map((clinic) => (
                        <option key={clinic.id} value={clinic.id}>
                          {clinic.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </section>
              )}

              <section className="space-y-4 border-t border-border pt-4">
                <h3 className="font-medium text-foreground">Thông tin đăng nhập</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Họ và tên" required className="sm:col-span-2" icon={<UserPlus className="h-4 w-4" />}>
                    <input
                      required
                      value={formData.name}
                      onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                      placeholder="VD: Nguyễn Văn A"
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field label="Email" required icon={<Mail className="h-4 w-4" />}>
                    <input
                      required
                      type="email"
                      value={formData.email}
                      onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                      placeholder="admin@hospital.vn"
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field label="Số điện thoại" icon={<Phone className="h-4 w-4" />}>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                      placeholder="0901 234 567"
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field label="Mật khẩu tạm thời" required icon={<KeyRound className="h-4 w-4" />}>
                    <input
                      required
                      minLength={8}
                      type="password"
                      value={formData.password}
                      onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                      placeholder="Tối thiểu 8 ký tự"
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field label="Nhập lại mật khẩu" required icon={<KeyRound className="h-4 w-4" />}>
                    <input
                      required
                      minLength={8}
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(event) => setFormData({ ...formData, confirmPassword: event.target.value })}
                      placeholder="Nhập lại mật khẩu"
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                </div>
              </section>

              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Đang tạo quyền: <span className="font-medium text-foreground">{selectedRole.label}</span>. Email đã tạo sẽ đăng nhập bằng Firebase Auth và nhận quyền qua custom claims.
              </div>

              <div className="flex gap-3 pt-2">
                <Dialog.Close asChild>
                  <button type="button" className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                    Hủy
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={isSubmitting || isLoadingClinics}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Tạo tài khoản admin
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  required,
  icon,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {icon ? (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium text-foreground" title={value}>
        {value || "-"}
      </p>
    </div>
  );
}
