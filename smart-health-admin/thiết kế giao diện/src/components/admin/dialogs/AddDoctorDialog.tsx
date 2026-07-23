import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clipboard,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Send,
  Stethoscope,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  smartHealthApi,
  type SmartHealthClinic,
  type SmartHealthSpecialty,
  type SmartHealthStaffInvitationDelivery,
} from "@/lib/smart-health-api";
import {
  createStaffOperationIdempotencyKey,
  parseStaffInvitationOutcome,
} from "@/lib/staff-operations";
import { toVietnameseErrorMessage } from "@/lib/error-messages";

type DoctorInvitationFormData = {
  fullName: string;
  specialty: string;
  clinic: string;
  phone: string;
  email: string;
  licenseNumber: string;
};

type InvitationResult = {
  email: string;
  name: string;
  acceptanceUrl?: string;
  delivery: SmartHealthStaffInvitationDelivery;
};

interface AddDoctorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
  lockedOrganizationId?: string | null;
}

const emptyForm: DoctorInvitationFormData = {
  fullName: "",
  specialty: "",
  clinic: "",
  phone: "",
  email: "",
  licenseNumber: "",
};

function getDeliveryCopy(delivery: SmartHealthStaffInvitationDelivery) {
  if (delivery.email === "sent") {
    return {
      title: "Provider đã xác nhận gửi email",
      description: "Người nhận có thể mở email để tiếp tục quy trình chấp nhận lời mời.",
      tone: "success" as const,
    };
  }
  if (delivery.email === "ready") {
    return {
      title: "Email đang ở trạng thái sẵn sàng",
      description:
        "Hệ thống chưa xác nhận email đã được gửi. Có thể chuyển liên kết một lần thủ công.",
      tone: "warning" as const,
    };
  }
  if (delivery.email === "failed") {
    return {
      title: "Provider chưa gửi được email",
      description:
        "Lời mời đã được lưu, nhưng lần gửi email thất bại. Hãy dùng liên kết một lần hoặc gửi lại.",
      tone: "warning" as const,
    };
  }
  return {
    title: "Chưa cấu hình provider email",
    description:
      "Lời mời đã được lưu. Hãy chuyển liên kết một lần cho người nhận bằng kênh an toàn.",
    tone: "warning" as const,
  };
}

export function AddDoctorDialog({
  open,
  onOpenChange,
  onCreated,
  lockedOrganizationId,
}: AddDoctorDialogProps) {
  const [formData, setFormData] = useState<DoctorInvitationFormData>(emptyForm);
  const [clinics, setClinics] = useState<SmartHealthClinic[]>([]);
  const [specialties, setSpecialties] = useState<SmartHealthSpecialty[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invitationResult, setInvitationResult] = useState<InvitationResult | null>(null);
  const attemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const loadCatalogs = useCallback(async () => {
    setIsCatalogLoading(true);
    setCatalogError("");
    try {
      const [clinicResponse, specialtyResponse] = await Promise.all([
        smartHealthApi.listCatalogClinics(),
        smartHealthApi.listSpecialties(),
      ]);
      if (lockedOrganizationId === null) {
        throw new Error(
          "Không xác định được workspace hiện tại. Hãy chọn lại workspace rồi thử lại.",
        );
      }
      const scopedClinics =
        typeof lockedOrganizationId === "string"
          ? clinicResponse.clinics.filter((clinic) => clinic.id === lockedOrganizationId)
          : clinicResponse.clinics;
      if (typeof lockedOrganizationId === "string" && scopedClinics.length !== 1) {
        throw new Error("Không tìm thấy workspace hiện tại trong danh mục được phép mời nhân sự.");
      }
      setClinics(scopedClinics);
      setSpecialties(specialtyResponse.specialties);
      if (typeof lockedOrganizationId === "string") {
        setFormData((current) => ({ ...current, clinic: lockedOrganizationId }));
      }
    } catch (error) {
      setClinics([]);
      setSpecialties([]);
      setCatalogError(
        toVietnameseErrorMessage(error, "Không thể tải danh mục phòng khám và chuyên khoa."),
      );
    } finally {
      setIsCatalogLoading(false);
    }
  }, [lockedOrganizationId]);

  useEffect(() => {
    if (open && !invitationResult) {
      void loadCatalogs();
    }
  }, [invitationResult, loadCatalogs, open]);

  const resetDialog = () => {
    setFormData(emptyForm);
    setSubmitError("");
    setCatalogError("");
    setInvitationResult(null);
    attemptRef.current = null;
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    if (!nextOpen) resetDialog();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError("");
    const clinic = clinics.find((item) => item.id === formData.clinic);
    const specialty = specialties.find((item) => item.id === formData.specialty);
    if (!clinic || !specialty) {
      setSubmitError(
        "Danh mục đã thay đổi hoặc chưa tải xong. Hãy tải lại rồi chọn lại thông tin.",
      );
      return;
    }

    const payload = {
      email: formData.email.trim().toLowerCase(),
      role: "doctor" as const,
      organizationId: clinic.id,
      name: formData.fullName.trim(),
      phone: formData.phone.trim(),
      specialty: specialty.name,
      license: formData.licenseNumber.trim(),
    };
    const fingerprint = JSON.stringify(payload);
    const idempotencyKey =
      attemptRef.current?.fingerprint === fingerprint
        ? attemptRef.current.idempotencyKey
        : createStaffOperationIdempotencyKey("invite-create", clinic.id);
    attemptRef.current = { fingerprint, idempotencyKey };

    setIsSubmitting(true);
    try {
      const response = await smartHealthApi.createStaffInvitation(payload, idempotencyKey);
      const outcome = parseStaffInvitationOutcome(response, payload);
      attemptRef.current = null;
      setInvitationResult({
        email: outcome.invitation.email,
        name: outcome.invitation.name || payload.name,
        acceptanceUrl: outcome.acceptanceUrl,
        delivery: outcome.delivery,
      });
      await onCreated?.();
      if (outcome.delivery.email === "sent") {
        toast.success("Provider đã xác nhận gửi lời mời bác sĩ.");
      } else {
        toast.warning("Lời mời đã được tạo nhưng email chưa được xác nhận là đã gửi.");
      }
    } catch (error) {
      setSubmitError(toVietnameseErrorMessage(error, "Không thể tạo lời mời bác sĩ."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyAcceptanceUrl = async () => {
    if (!invitationResult?.acceptanceUrl) return;
    try {
      await navigator.clipboard.writeText(invitationResult.acceptanceUrl);
      toast.success("Đã sao chép liên kết một lần.");
    } catch {
      toast.error("Không thể sao chép tự động. Hãy chọn và sao chép liên kết thủ công.");
    }
  };

  const deliveryCopy = invitationResult ? getDeliveryCopy(invitationResult.delivery) : null;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(94vw,672px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <UserPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">Mời bác sĩ</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Tạo lời mời vào workspace; tài khoản chỉ được cấp sau khi người nhận xác thực và
                  chấp nhận.
                </Dialog.Description>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
              aria-label="Đóng hộp thoại"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {invitationResult && deliveryCopy ? (
            <div className="space-y-5 p-6">
              <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <h3 className="font-semibold text-foreground">Lời mời đã được tạo</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {invitationResult.name || invitationResult.email} · {invitationResult.email}
                  </p>
                </div>
              </div>

              <div
                className={`rounded-xl border p-4 ${
                  deliveryCopy.tone === "success"
                    ? "border-success/25 bg-success/5"
                    : "border-warning/25 bg-warning/10"
                }`}
              >
                <h3 className="text-sm font-semibold text-foreground">{deliveryCopy.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {deliveryCopy.description}
                </p>
              </div>

              {invitationResult.acceptanceUrl ? (
                <div className="space-y-2">
                  <label
                    htmlFor="doctor-invitation-url"
                    className="text-sm font-medium text-foreground"
                  >
                    Liên kết chấp nhận một lần
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      id="doctor-invitation-url"
                      readOnly
                      value={invitationResult.acceptanceUrl}
                      className="min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
                    />
                    <button
                      type="button"
                      onClick={copyAcceptanceUrl}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                    >
                      <Clipboard className="h-4 w-4" /> Sao chép
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Liên kết chứa thông tin bí mật dùng một lần. Chỉ chuyển trực tiếp cho đúng người
                    nhận.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  Lần phản hồi này không còn trả lại liên kết bí mật. Nếu email chưa gửi, dùng “Gửi
                  lại” trong danh sách lời mời để tạo liên kết mới.
                </div>
              )}

              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Đóng
              </button>
            </div>
          ) : (
            <form method="post" onSubmit={handleSubmit} className="space-y-6 p-6">
              {catalogError && (
                <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                  <div className="flex items-start gap-2 text-sm text-foreground">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <span>{catalogError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadCatalogs()}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    <RefreshCw className="h-4 w-4" /> Tải lại danh mục
                  </button>
                </div>
              )}

              <section className="space-y-4">
                <h3 className="font-medium text-foreground">Thông tin người nhận</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field htmlFor="doctor-name" label="Họ và tên" required className="sm:col-span-2">
                    <input
                      id="doctor-name"
                      required
                      autoComplete="name"
                      value={formData.fullName}
                      onChange={(event) =>
                        setFormData({ ...formData, fullName: event.target.value })
                      }
                      placeholder="VD: Trần Văn Nam"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field
                    htmlFor="doctor-phone"
                    label="Số điện thoại"
                    required
                    icon={<Phone className="h-4 w-4" />}
                  >
                    <input
                      id="doctor-phone"
                      required
                      type="tel"
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                      placeholder="0901 234 567"
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field
                    htmlFor="doctor-email"
                    label="Email"
                    required
                    icon={<Mail className="h-4 w-4" />}
                  >
                    <input
                      id="doctor-email"
                      required
                      type="email"
                      autoComplete="email"
                      value={formData.email}
                      onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                      placeholder="doctor@clinic.vn"
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-4 border-t border-border pt-4">
                <h3 className="font-medium text-foreground">Thông tin chuyên môn</h3>
                {isCatalogLoading && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh mục thật từ
                    backend...
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    htmlFor="doctor-specialty"
                    label="Chuyên khoa"
                    required
                    icon={<Stethoscope className="h-4 w-4" />}
                  >
                    <select
                      id="doctor-specialty"
                      required
                      disabled={isCatalogLoading || Boolean(catalogError)}
                      value={formData.specialty}
                      onChange={(event) =>
                        setFormData({ ...formData, specialty: event.target.value })
                      }
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60"
                    >
                      <option value="">Chọn chuyên khoa</option>
                      {specialties.map((specialty) => (
                        <option key={specialty.id} value={specialty.id}>
                          {specialty.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field htmlFor="doctor-license" label="Số chứng chỉ hành nghề" required>
                    <input
                      id="doctor-license"
                      required
                      value={formData.licenseNumber}
                      onChange={(event) =>
                        setFormData({ ...formData, licenseNumber: event.target.value })
                      }
                      placeholder="VD: 12345/BYT-CCHN"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field
                    htmlFor="doctor-clinic"
                    label="Workspace"
                    required
                    icon={<Building2 className="h-4 w-4" />}
                    className="sm:col-span-2"
                  >
                    <select
                      id="doctor-clinic"
                      required
                      disabled={
                        isCatalogLoading ||
                        Boolean(catalogError) ||
                        lockedOrganizationId !== undefined
                      }
                      value={formData.clinic}
                      onChange={(event) => setFormData({ ...formData, clinic: event.target.value })}
                      className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:opacity-60"
                    >
                      <option value="">Chọn workspace</option>
                      {clinics.map((clinic) => (
                        <option key={clinic.id} value={clinic.id}>
                          {clinic.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>

              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {submitError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSubmitting}
                  className="min-h-11 flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isCatalogLoading || Boolean(catalogError)}
                  className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isSubmitting ? "Đang tạo lời mời..." : "Mời bác sĩ"}
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
  htmlFor,
  label,
  required,
  icon,
  className,
  children,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {icon ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
