import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Skeleton } from "../../../components/ui/skeleton";
import { Textarea } from "../../../components/ui/textarea";
import { useAuth } from "../../context/AuthContext";
import {
  smartHealthApi,
  type ApiError,
  type Appointment,
} from "../../../lib/smart-health-api";

type AppointmentFormMode = "create" | "edit" | "reschedule";
type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

type AppointmentForm = {
  patientId: string;
  doctorUserId: string;
  type: string;
  startsAt: string;
  endsAt: string;
  location: string;
  reason: string;
  notes: string;
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Đã đặt",
  confirmed: "Đã xác nhận",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  no_show: "Không đến",
};

const TYPE_LABELS: Record<string, string> = {
  remote_consultation: "Tư vấn từ xa",
  clinic_visit: "Khám tại cơ sở",
  measurement: "Lượt đo",
  follow_up: "Tái khám",
};

const TERMINAL_STATUSES = new Set<AppointmentStatus>([
  "completed",
  "cancelled",
  "no_show",
]);
const CLINICAL_MANAGE_CAPABILITIES = [
  "workspace.appointments.manage",
  "platform.appointments.manage",
];
const PERSONAL_MANAGE_CAPABILITY = "personal.appointments.manage";

function createAppointmentIntentKey(operation: string, appointmentId = "new") {
  const uniquePart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `portal-appointment-${operation}-${appointmentId}-${uniquePart}`;
}

function toDatetimeLocal(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoFromLocal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function defaultForm(): AppointmentForm {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    patientId: "",
    doctorUserId: "",
    type: "remote_consultation",
    startsAt: toDatetimeLocal(start),
    endsAt: toDatetimeLocal(end),
    location: "",
    reason: "",
    notes: "",
  };
}

function formFromAppointment(appointment: Appointment): AppointmentForm {
  return {
    patientId: appointment.patientId || "",
    doctorUserId: appointment.doctorUserId || "",
    type: appointment.type || "remote_consultation",
    startsAt: appointment.startsAt ? toDatetimeLocal(appointment.startsAt) : "",
    endsAt: appointment.endsAt ? toDatetimeLocal(appointment.endsAt) : "",
    location: appointment.location || "",
    reason: appointment.reason || "",
    notes: appointment.notes || "",
  };
}

function statusOf(appointment: Appointment): AppointmentStatus {
  return (appointment.status || "scheduled") as AppointmentStatus;
}

function formatDateTime(value?: string) {
  if (!value) return "Chưa có thời gian";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Không xác định"
    : date.toLocaleString("vi-VN");
}

function statusClass(status: AppointmentStatus) {
  if (status === "cancelled" || status === "no_show") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (status === "completed") {
    return "border-[var(--clinical-success)]/30 bg-[var(--clinical-success)]/10 text-[var(--clinical-success)]";
  }
  if (status === "confirmed")
    return "border-primary/30 bg-primary/10 text-primary";
  return "border-[var(--clinical-warning)]/30 bg-[var(--clinical-warning)]/10 text-[var(--clinical-warning)]";
}

function validateForm(mode: AppointmentFormMode, form: AppointmentForm) {
  if (mode === "create" && !form.patientId) return "Vui lòng chọn bệnh nhân.";
  if (mode !== "edit") {
    const startsAt = toIsoFromLocal(form.startsAt);
    const endsAt = toIsoFromLocal(form.endsAt);
    if (!startsAt || !endsAt) return "Vui lòng nhập thời gian hợp lệ.";
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      return "Thời gian kết thúc phải sau thời gian bắt đầu.";
    }
  }
  return "";
}

function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export default function AppointmentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = user?.currentWorkspace.id || "";
  const capabilities = user?.capabilities || [];
  const canClinicalManage = capabilities.some((capability) =>
    CLINICAL_MANAGE_CAPABILITIES.includes(capability),
  );
  const canPersonalManage = capabilities.includes(PERSONAL_MANAGE_CAPABILITY);
  const canManageStaff = capabilities.includes("workspace.staff.manage");
  const canManage = canClinicalManage || canPersonalManage;

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(() => !isOffline());
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [formMode, setFormMode] = useState<AppointmentFormMode | null>(null);
  const [formTarget, setFormTarget] = useState<Appointment | null>(null);
  const [form, setForm] = useState<AppointmentForm>(defaultForm);
  const [formError, setFormError] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const appointmentsQuery = useQuery({
    queryKey: ["portal", "appointments", workspaceId, statusFilter],
    queryFn: () => smartHealthApi.listAppointments({ status: statusFilter }),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  const patientsQuery = useQuery({
    queryKey: ["portal", "patients", workspaceId],
    queryFn: () => smartHealthApi.listPatients(),
    enabled: Boolean(workspaceId && canManage),
    retry: false,
  });
  const staffQuery = useQuery({
    queryKey: ["portal", "staff", workspaceId],
    queryFn: smartHealthApi.listStaff,
    enabled: Boolean(workspaceId && canManageStaff),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["portal", "appointments", workspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["portal", "notifications"],
    });
  };

  const saveMutation = useMutation({
    mutationFn: async ({
      mode,
      appointment,
      payload,
    }: {
      mode: AppointmentFormMode;
      appointment: Appointment | null;
      payload: AppointmentForm;
    }) => {
      if (isOffline())
        throw new Error(
          "Thiết bị đang ngoại tuyến. Vui lòng kết nối mạng rồi thử lại.",
        );
      const validationError = validateForm(mode, payload);
      if (validationError) throw new Error(validationError);
      if (mode === "create") {
        return smartHealthApi.createAppointment(
          {
            patientId: payload.patientId,
            doctorUserId: payload.doctorUserId || undefined,
            type: payload.type,
            startsAt: toIsoFromLocal(payload.startsAt),
            endsAt: toIsoFromLocal(payload.endsAt),
            location: payload.location,
            reason: payload.reason,
            notes: payload.notes,
          },
          createAppointmentIntentKey("create"),
        );
      }
      if (!appointment)
        throw new Error("Không tìm thấy lịch hẹn cần cập nhật.");
      if (mode === "reschedule") {
        return smartHealthApi.rescheduleAppointment(
          appointment.id,
          {
            startsAt: toIsoFromLocal(payload.startsAt),
            endsAt: toIsoFromLocal(payload.endsAt),
            reason: payload.reason,
          },
          createAppointmentIntentKey("reschedule", appointment.id),
        );
      }
      return smartHealthApi.updateAppointment(
        appointment.id,
        {
          doctorUserId: payload.doctorUserId || undefined,
          type: payload.type,
          location: payload.location,
          reason: payload.reason,
          notes: payload.notes,
        },
        createAppointmentIntentKey("edit", appointment.id),
      );
    },
    onSuccess: (_result, variables) => {
      const message =
        variables.mode === "create"
          ? "Backend đã tạo lịch hẹn."
          : variables.mode === "reschedule"
            ? "Backend đã xác nhận lịch mới."
            : "Backend đã cập nhật lịch hẹn.";
      toast.success(message);
      setFormMode(null);
      setFormTarget(null);
      setFormError("");
      refresh();
    },
    onError: (error) =>
      setFormError(
        error instanceof Error ? error.message : "Không thể lưu lịch hẹn.",
      ),
  });

  const statusMutation = useMutation({
    mutationFn: ({
      appointment,
      nextStatus,
    }: {
      appointment: Appointment;
      nextStatus: AppointmentStatus;
    }) => {
      if (isOffline())
        throw new Error(
          "Thiết bị đang ngoại tuyến. Vui lòng kết nối mạng rồi thử lại.",
        );
      return smartHealthApi.updateAppointment(
        appointment.id,
        { status: nextStatus },
        createAppointmentIntentKey(`status-${nextStatus}`, appointment.id),
      );
    },
    onSuccess: (_result, variables) => {
      toast.success(
        `Backend đã cập nhật trạng thái: ${STATUS_LABELS[variables.nextStatus]}.`,
      );
      refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Không thể cập nhật trạng thái.",
      ),
  });

  const cancelMutation = useMutation({
    mutationFn: ({
      appointment,
      reason,
    }: {
      appointment: Appointment;
      reason: string;
    }) => {
      if (isOffline())
        throw new Error(
          "Thiết bị đang ngoại tuyến. Vui lòng kết nối mạng rồi thử lại.",
        );
      const normalizedReason = reason.trim();
      if (!normalizedReason)
        throw new Error("Vui lòng nhập lý do hủy lịch hẹn.");
      return smartHealthApi.cancelAppointment(
        appointment.id,
        { cancellationReason: normalizedReason },
        createAppointmentIntentKey("cancel", appointment.id),
      );
    },
    onSuccess: () => {
      toast.success("Backend đã xác nhận hủy lịch hẹn.");
      setCancelTarget(null);
      setCancellationReason("");
      setCancelError("");
      refresh();
    },
    onError: (error) =>
      setCancelError(
        error instanceof Error ? error.message : "Không thể hủy lịch hẹn.",
      ),
  });

  const appointments = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("vi");
    return (appointmentsQuery.data?.appointments || []).filter(
      (appointment) => {
        if (!needle) return true;
        return [
          appointment.patient?.name,
          appointment.patient?.patientCode,
          appointment.doctor?.name,
          appointment.reason,
          appointment.id,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("vi").includes(needle),
          );
      },
    );
  }, [appointmentsQuery.data?.appointments, search]);

  const patients = patientsQuery.data?.patients || [];
  const doctors =
    staffQuery.data?.doctors ||
    (user?.role === "doctor"
      ? [
          {
            ...user.raw,
            id: user.id,
            name: user.name,
            email: user.email,
          },
        ]
      : []);
  const upcomingCount = appointments.filter((appointment) =>
    ["scheduled", "confirmed"].includes(statusOf(appointment)),
  ).length;
  const attentionCount = appointments.filter(
    (appointment) => statusOf(appointment) === "scheduled",
  ).length;

  const openForm = (
    mode: AppointmentFormMode,
    appointment: Appointment | null = null,
  ) => {
    const nextForm = appointment ? formFromAppointment(appointment) : defaultForm();
    if (mode === "create" && !canManageStaff && user?.role === "doctor") {
      nextForm.doctorUserId = user.id;
    }
    setFormMode(mode);
    setFormTarget(appointment);
    setForm(nextForm);
    setFormError("");
  };

  const canModify = (appointment: Appointment) =>
    canManage && !TERMINAL_STATUSES.has(statusOf(appointment));

  const renderActions = (appointment: Appointment) => {
    const currentStatus = statusOf(appointment);
    const busy =
      statusMutation.isPending ||
      saveMutation.isPending ||
      cancelMutation.isPending;
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => setDetail(appointment)}
        >
          <Eye aria-hidden="true" />
          Chi tiết
        </Button>
        {canClinicalManage && canModify(appointment) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={busy}
            onClick={() => openForm("edit", appointment)}
          >
            <Pencil aria-hidden="true" />
            Sửa
          </Button>
        ) : null}
        {canModify(appointment) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={busy}
            onClick={() => openForm("reschedule", appointment)}
          >
            <RotateCcw aria-hidden="true" />
            Đổi lịch
          </Button>
        ) : null}
        {canClinicalManage && currentStatus === "scheduled" ? (
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={busy}
            onClick={() =>
              statusMutation.mutate({ appointment, nextStatus: "confirmed" })
            }
          >
            <CheckCircle2 aria-hidden="true" />
            Xác nhận
          </Button>
        ) : null}
        {canClinicalManage && currentStatus === "confirmed" ? (
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={busy}
            onClick={() =>
              statusMutation.mutate({ appointment, nextStatus: "completed" })
            }
          >
            <CheckCircle2 aria-hidden="true" />
            Hoàn tất
          </Button>
        ) : null}
        {canClinicalManage &&
        ["scheduled", "confirmed"].includes(currentStatus) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={busy}
            onClick={() =>
              statusMutation.mutate({ appointment, nextStatus: "no_show" })
            }
          >
            <UserRound aria-hidden="true" />
            Không đến
          </Button>
        ) : null}
        {canModify(appointment) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => {
              setCancelTarget(appointment);
              setCancellationReason("");
              setCancelError("");
            }}
          >
            <XCircle aria-hidden="true" />
            Hủy
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header className="clinical-page-header flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Điều phối chăm sóc
          </p>
          <h1 className="clinical-page-title mt-2 flex items-center gap-2 text-foreground">
            <CalendarDays aria-hidden="true" size={24} />
            Lịch hẹn
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Theo dõi lịch tư vấn, tái khám và trạng thái đã được backend xác
            nhận trong workspace hiện tại.
          </p>
        </div>
        {canManage ? (
          <Button
            id="portal-add-appointment"
            type="button"
            className="min-h-11"
            disabled={!online}
            onClick={() => openForm("create")}
          >
            <Plus aria-hidden="true" />
            Tạo lịch hẹn
          </Button>
        ) : null}
      </header>

      {!online ? (
        <Card
          role="status"
          className="border-[var(--clinical-warning)]/40 bg-[var(--clinical-warning)]/5"
        >
          <CardContent className="flex gap-3 p-4 text-sm">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 text-[var(--clinical-warning)]"
            />
            <div>
              <p className="font-medium text-foreground">Đang ngoại tuyến</p>
              <p className="mt-1 text-muted-foreground">
                Bạn vẫn có thể xem dữ liệu đã tải; mọi thao tác thay đổi tạm
                khóa cho đến khi có mạng.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section
        aria-label="Tổng quan lịch hẹn"
        className="grid gap-3 sm:grid-cols-3"
      >
        {[
          { label: "Đang hiển thị", value: appointments.length },
          { label: "Sắp tới", value: upcomingCount },
          { label: "Chờ xác nhận", value: attentionCount },
        ].map((item) => (
          <Card key={item.label} className="shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="shadow-sm">
        <CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_14rem]">
          <div className="space-y-2">
            <Label htmlFor="portal-appointment-search">Tìm lịch hẹn</Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                size={16}
              />
              <Input
                id="portal-appointment-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-h-11 pl-10"
                placeholder="Bệnh nhân, bác sĩ, mã hoặc lý do"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-appointment-status">Trạng thái</Label>
            <select
              id="portal-appointment-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {appointmentsQuery.isLoading ? (
        <AppointmentLoading />
      ) : appointmentsQuery.error ? (
        <AppointmentError
          error={appointmentsQuery.error}
          retry={() => void appointmentsQuery.refetch()}
        />
      ) : appointments.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center px-5 py-12 text-center">
            <CalendarDays
              aria-hidden="true"
              className="text-muted-foreground"
              size={28}
            />
            <p className="mt-3 font-semibold text-foreground">
              Chưa có lịch hẹn phù hợp
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Thử đổi bộ lọc hoặc tạo lịch hẹn mới nếu bạn có quyền.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:hidden">
            {appointments.map((appointment) => (
              <Card
                key={appointment.id}
                data-appointment-row={appointment.id}
                className="shadow-sm"
              >
                <CardHeader className="gap-3 p-4 pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {appointment.patient?.name ||
                          appointment.patientId ||
                          "Chưa có bệnh nhân"}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {appointment.patient?.patientCode || appointment.id}
                      </CardDescription>
                    </div>
                    <AppointmentStatusBadge appointment={appointment} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-2">
                  <dl className="grid gap-3 text-sm">
                    <div className="flex gap-3">
                      <Clock3
                        aria-hidden="true"
                        className="mt-0.5 text-muted-foreground"
                      />
                      <div>
                        <dt className="sr-only">Thời gian</dt>
                        <dd className="font-medium text-foreground">
                          {formatDateTime(appointment.startsAt)}
                        </dd>
                        <dd className="text-muted-foreground">
                          đến {formatDateTime(appointment.endsAt)}
                        </dd>
                      </div>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Bác sĩ</dt>
                      <dd className="mt-1 text-foreground">
                        {appointment.doctor?.name ||
                          appointment.doctorUserId ||
                          "Chưa gán"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Loại lịch
                      </dt>
                      <dd className="mt-1 text-foreground">
                        {TYPE_LABELS[appointment.type || ""] ||
                          appointment.type ||
                          "Chưa xác định"}
                      </dd>
                    </div>
                  </dl>
                  {renderActions(appointment)}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden md:block overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Thời gian</th>
                    <th className="px-4 py-3">Bệnh nhân</th>
                    <th className="px-4 py-3">Bác sĩ</th>
                    <th className="px-4 py-3">Loại</th>
                    <th className="px-4 py-3">Trạng thái</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {appointments.map((appointment) => (
                    <tr
                      key={appointment.id}
                      data-appointment-row={appointment.id}
                      className="transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-4">
                        <p className="font-medium text-foreground">
                          {formatDateTime(appointment.startsAt)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          đến {formatDateTime(appointment.endsAt)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-medium text-foreground">
                          {appointment.patient?.name ||
                            appointment.patientId ||
                            "—"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {appointment.patient?.patientCode || appointment.id}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {appointment.doctor?.name ||
                          appointment.doctorUserId ||
                          "Chưa gán"}
                      </td>
                      <td className="px-4 py-4 text-foreground">
                        {TYPE_LABELS[appointment.type || ""] ||
                          appointment.type ||
                          "—"}
                      </td>
                      <td className="px-4 py-4">
                        <AppointmentStatusBadge appointment={appointment} />
                      </td>
                      <td className="px-4 py-4">
                        {renderActions(appointment)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Chi tiết lịch hẹn</DialogTitle>
            <DialogDescription>
              Dữ liệu dưới đây được lấy từ bản ghi backend hiện tại.
            </DialogDescription>
          </DialogHeader>
          {detail ? <AppointmentDetails appointment={detail} /> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setDetail(null)}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(formMode)}
        onOpenChange={(open) =>
          !open && !saveMutation.isPending && setFormMode(null)
        }
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create"
                ? "Tạo lịch hẹn"
                : formMode === "reschedule"
                  ? "Đổi lịch hẹn"
                  : "Chỉnh sửa lịch hẹn"}
            </DialogTitle>
            <DialogDescription>
              {formMode === "reschedule"
                ? "Thời gian mới chỉ có hiệu lực sau khi backend xác nhận không xung đột."
                : "Điền thông tin cần thiết; hệ thống chỉ báo thành công sau phản hồi backend."}
            </DialogDescription>
          </DialogHeader>
          <form
            id="appointment-form"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!formMode) return;
              const validationError = validateForm(formMode, form);
              if (validationError) {
                setFormError(validationError);
                return;
              }
              setFormError("");
              saveMutation.mutate({
                mode: formMode,
                appointment: formTarget,
                payload: form,
              });
            }}
          >
            {formMode !== "reschedule" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="appointment-patient-id">Bệnh nhân</Label>
                  <select
                    id="appointment-patient-id"
                    required={formMode === "create"}
                    disabled={formMode !== "create" || saveMutation.isPending}
                    value={form.patientId}
                    onChange={(event) =>
                      setForm({ ...form, patientId: event.target.value })
                    }
                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    <option value="">Chọn bệnh nhân</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name || patient.patientCode || patient.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appointment-doctor-id">
                    Bác sĩ phụ trách
                  </Label>
                   <select
                     id="appointment-doctor-id"
                     disabled={!canManageStaff || saveMutation.isPending}
                    value={form.doctorUserId}
                    onChange={(event) =>
                      setForm({ ...form, doctorUserId: event.target.value })
                    }
                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    <option value="">Chưa gán</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name || doctor.email || doctor.id}
                      </option>
                    ))}
                  </select>
                  {canManageStaff && staffQuery.error ? (
                    <p className="text-xs text-destructive">
                      Không tải được danh sách nhân sự; bạn vẫn có thể lưu mà
                      không đổi bác sĩ.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appointment-type">Loại lịch</Label>
                  <select
                    id="appointment-type"
                    disabled={saveMutation.isPending}
                    value={form.type}
                    onChange={(event) =>
                      setForm({ ...form, type: event.target.value })
                    }
                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appointment-location">Địa điểm / kênh</Label>
                  <Input
                    id="appointment-location"
                    className="min-h-11"
                    maxLength={240}
                    disabled={saveMutation.isPending}
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                    placeholder="Phòng khám hoặc liên kết tư vấn"
                  />
                </div>
              </>
            ) : null}
            {formMode !== "edit" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="appointment-starts-at">Bắt đầu</Label>
                  <Input
                    id="appointment-starts-at"
                    type="datetime-local"
                    required
                    className="min-h-11"
                    disabled={saveMutation.isPending}
                    value={form.startsAt}
                    onChange={(event) =>
                      setForm({ ...form, startsAt: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appointment-ends-at">Kết thúc</Label>
                  <Input
                    id="appointment-ends-at"
                    type="datetime-local"
                    required
                    className="min-h-11"
                    disabled={saveMutation.isPending}
                    value={form.endsAt}
                    onChange={(event) =>
                      setForm({ ...form, endsAt: event.target.value })
                    }
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="appointment-reason">
                {formMode === "reschedule" ? "Lý do đổi lịch" : "Lý do hẹn"}
              </Label>
              <Input
                id="appointment-reason"
                className="min-h-11"
                maxLength={1000}
                disabled={saveMutation.isPending}
                value={form.reason}
                onChange={(event) =>
                  setForm({ ...form, reason: event.target.value })
                }
              />
            </div>
            {formMode !== "reschedule" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="appointment-notes">Ghi chú nội bộ</Label>
                <Textarea
                  id="appointment-notes"
                  rows={4}
                  maxLength={2000}
                  disabled={saveMutation.isPending}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </div>
            ) : null}
            {formError ? (
              <p
                role="alert"
                className="text-sm text-destructive sm:col-span-2"
              >
                {formError}
              </p>
            ) : null}
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={saveMutation.isPending}
              onClick={() => setFormMode(null)}
            >
              Đóng
            </Button>
            <Button
              form="appointment-form"
              className="min-h-11"
              disabled={saveMutation.isPending || !online}
            >
              {saveMutation.isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : null}
              {saveMutation.isPending ? "Đang lưu..." : "Gửi tới backend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) =>
          !open && !cancelMutation.isPending && setCancelTarget(null)
        }
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Hủy lịch hẹn</DialogTitle>
            <DialogDescription>
              Lý do hủy là bắt buộc và sẽ được lưu trong audit của backend.
            </DialogDescription>
          </DialogHeader>
          <form
            id="appointment-cancel-form"
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (cancelTarget)
                cancelMutation.mutate({
                  appointment: cancelTarget,
                  reason: cancellationReason,
                });
            }}
          >
            <Label htmlFor="appointment-cancellation-reason">Lý do hủy</Label>
            <Textarea
              id="appointment-cancellation-reason"
              required
              rows={4}
              maxLength={1000}
              disabled={cancelMutation.isPending}
              value={cancellationReason}
              onChange={(event) => {
                setCancellationReason(event.target.value);
                setCancelError("");
              }}
              aria-invalid={Boolean(cancelError)}
            />
            {cancelError ? (
              <p role="alert" className="text-sm text-destructive">
                {cancelError}
              </p>
            ) : null}
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={cancelMutation.isPending}
              onClick={() => setCancelTarget(null)}
            >
              Giữ lịch
            </Button>
            <Button
              form="appointment-cancel-form"
              variant="destructive"
              className="min-h-11"
              disabled={
                cancelMutation.isPending ||
                !online ||
                !cancellationReason.trim()
              }
            >
              {cancelMutation.isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <XCircle aria-hidden="true" />
              )}
              {cancelMutation.isPending ? "Đang hủy..." : "Xác nhận hủy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AppointmentStatusBadge({ appointment }: { appointment: Appointment }) {
  const status = statusOf(appointment);
  return (
    <Badge variant="outline" className={statusClass(status)}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

function AppointmentDetails({ appointment }: { appointment: Appointment }) {
  const rows = [
    ["Mã lịch", appointment.id],
    [
      "Bệnh nhân",
      appointment.patient?.name || appointment.patientId || "Chưa xác định",
    ],
    ["Mã bệnh nhân", appointment.patient?.patientCode || "Chưa có"],
    [
      "Bác sĩ",
      appointment.doctor?.name || appointment.doctorUserId || "Chưa gán",
    ],
    ["Bắt đầu", formatDateTime(appointment.startsAt)],
    ["Kết thúc", formatDateTime(appointment.endsAt)],
    [
      "Loại",
      TYPE_LABELS[appointment.type || ""] ||
        appointment.type ||
        "Chưa xác định",
    ],
    [
      "Địa điểm / kênh",
      appointment.location || appointment.channel || "Chưa có",
    ],
    ["Lý do", appointment.reason || "Chưa có"],
    ["Ghi chú", appointment.notes || "Chưa có"],
    ["Lý do hủy", appointment.cancellationReason || "Không áp dụng"],
  ];
  return (
    <div className="space-y-4">
      <AppointmentStatusBadge appointment={appointment} />
      <dl className="divide-y rounded-lg border">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]"
          >
            <dt className="text-xs font-medium text-muted-foreground">
              {label}
            </dt>
            <dd className="break-words text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AppointmentLoading() {
  return (
    <div className="grid gap-4" role="status" aria-label="Đang tải lịch hẹn">
      <span className="sr-only">Đang tải lịch hẹn...</span>
      {[0, 1, 2].map((item) => (
        <Card key={item} className="shadow-sm">
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-5 w-2/5 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-3/4 motion-reduce:animate-none" />
            <Skeleton className="h-11 w-full motion-reduce:animate-none" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AppointmentError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const apiError = error as ApiError;
  const forbidden = apiError?.status === 403;
  return (
    <Card role="alert" className="border-destructive/40 shadow-sm">
      <CardContent className="flex flex-wrap items-center gap-3 p-5">
        {forbidden ? (
          <ShieldAlert aria-hidden="true" className="text-destructive" />
        ) : (
          <AlertCircle aria-hidden="true" className="text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">
            {forbidden
              ? "Không có quyền xem lịch hẹn"
              : "Không thể tải lịch hẹn"}
          </p>
          <p className="mt-1 text-sm text-destructive">
            {apiError?.message || "Yêu cầu backend thất bại."}
          </p>
        </div>
        {!forbidden ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={retry}
          >
            <RefreshCw aria-hidden="true" />
            Thử lại
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
