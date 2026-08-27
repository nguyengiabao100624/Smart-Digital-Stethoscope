import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Trash2,
  UserRound,
  XCircle,
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
} from "../../../components/ui/alert-dialog";
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
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { Textarea } from "../../../components/ui/textarea";
import { useAuth } from "../../context/AuthContext";
import {
  parseAppointmentDetailResponse,
  parseAppointmentDeletionReceipt,
  parseAppointmentListResponse,
  parseAppointmentMutationOutcome,
  parseAppointmentStaffResponse,
  resolveAppointmentOperationAttempt,
  type AppointmentOperation,
  type AppointmentOperationAttempt,
} from "../../../lib/appointment-operations";
import { parsePatientListResponse } from "../../../lib/patient-operations";
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
  return appointment.status as AppointmentStatus;
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
    return "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]";
  }
  if (status === "completed") {
    return "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]";
  }
  if (status === "confirmed")
    return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]";
  return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]";
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

class AppointmentOperationSupersededError extends Error {
  constructor() {
    super("Workspace đã thay đổi; phản hồi lịch hẹn cũ đã bị bỏ qua.");
    this.name = "AppointmentOperationSupersededError";
  }
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
  const previousWorkspaceRef = useRef(workspaceId);
  const activeWorkspaceRef = useRef(workspaceId);
  const operationEpochRef = useRef(0);
  const workspaceChanging =
    Boolean(previousWorkspaceRef.current) &&
    previousWorkspaceRef.current !== workspaceId;
  const saveAttemptRef = useRef<AppointmentOperationAttempt | null>(null);
  const statusAttemptRef = useRef<AppointmentOperationAttempt | null>(null);
  const cancelAttemptRef = useRef<AppointmentOperationAttempt | null>(null);
  const deleteAttemptRef = useRef<AppointmentOperationAttempt | null>(null);
  const formBaselineRef = useRef("");

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(() => !isOffline());
  const [detailTargetId, setDetailTargetId] = useState("");
  const [formMode, setFormMode] = useState<AppointmentFormMode | null>(null);
  const [formTarget, setFormTarget] = useState<Appointment | null>(null);
  const [form, setForm] = useState<AppointmentForm>(defaultForm);
  const [formError, setFormError] = useState("");
  const [discardFormOpen, setDiscardFormOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const formDirty = Boolean(
    formMode &&
      formBaselineRef.current &&
      formBaselineRef.current !== JSON.stringify(form),
  );

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useLayoutEffect(() => {
    activeWorkspaceRef.current = workspaceId;
    if (previousWorkspaceRef.current === workspaceId) return;
    operationEpochRef.current += 1;
    previousWorkspaceRef.current = workspaceId;
    saveAttemptRef.current = null;
    statusAttemptRef.current = null;
    cancelAttemptRef.current = null;
    deleteAttemptRef.current = null;
    formBaselineRef.current = "";
    setStatusFilter("");
    setSearch("");
    setDetailTargetId("");
    setFormMode(null);
    setFormTarget(null);
    setForm(defaultForm());
    setFormError("");
    setDiscardFormOpen(false);
    setCancelTarget(null);
    setCancellationReason("");
    setCancelError("");
    setDeleteTarget(null);
    setDeleteError("");
  }, [workspaceId]);

  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => {
      if (!formDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [formDirty]);

  const appointmentsQuery = useQuery({
    queryKey: [
      "portal",
      "workspace",
      workspaceId,
      "appointments",
      statusFilter,
    ],
    queryFn: async () =>
      parseAppointmentListResponse(
        await smartHealthApi.listAppointments({ status: statusFilter }),
        workspaceId,
      ),
    enabled: Boolean(workspaceId && !workspaceChanging),
    retry: false,
  });
  const patientsQuery = useQuery({
    queryKey: ["portal", "workspace", workspaceId, "patients"],
    queryFn: async () => ({
      patients: parsePatientListResponse(
        await smartHealthApi.listPatients(),
        workspaceId,
      ),
    }),
    enabled: Boolean(workspaceId && canManage && !workspaceChanging),
    retry: false,
  });
  const staffQuery = useQuery({
    queryKey: ["portal", "workspace", workspaceId, "staff"],
    queryFn: async () =>
      parseAppointmentStaffResponse(
        await smartHealthApi.listStaff(),
        workspaceId,
      ),
    enabled: Boolean(workspaceId && canManageStaff && !workspaceChanging),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: [
      "portal",
      "workspace",
      workspaceId,
      "appointments",
      "detail",
      detailTargetId,
    ],
    queryFn: async () =>
      parseAppointmentDetailResponse(
        await smartHealthApi.getAppointment(detailTargetId),
        { workspaceId, appointmentId: detailTargetId },
      ),
    enabled: Boolean(
      workspaceId && detailTargetId && !workspaceChanging,
    ),
    retry: false,
  });

  const refresh = (operationWorkspaceId = workspaceId) => {
    void queryClient.invalidateQueries({
      queryKey: [
        "portal",
        "workspace",
        operationWorkspaceId,
        "appointments",
      ],
    });
    void queryClient.invalidateQueries({
      queryKey: ["portal", "notifications", operationWorkspaceId],
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
      const operationWorkspaceId = workspaceId;
      const operationEpoch = operationEpochRef.current;
      const appointmentId = appointment?.id || "new";
      const operation: AppointmentOperation =
        mode === "create" ? "create" : mode;
      let requestPayload: Partial<Appointment>;
      if (mode === "create") {
        requestPayload = {
          patientId: payload.patientId,
          doctorUserId: payload.doctorUserId,
          type: payload.type,
          startsAt: toIsoFromLocal(payload.startsAt),
          endsAt: toIsoFromLocal(payload.endsAt),
          location: payload.location,
          reason: payload.reason,
          notes: payload.notes,
        };
      } else if (mode === "reschedule") {
        requestPayload = {
          startsAt: toIsoFromLocal(payload.startsAt),
          endsAt: toIsoFromLocal(payload.endsAt),
          reason: payload.reason,
        };
      } else {
        requestPayload = {
          doctorUserId: payload.doctorUserId,
          type: payload.type,
          location: payload.location,
          reason: payload.reason,
          notes: payload.notes,
        };
      }
      const attempt = resolveAppointmentOperationAttempt(
        saveAttemptRef.current,
        {
          operation,
          workspaceId: operationWorkspaceId,
          appointmentId,
          payload: requestPayload as Record<string, unknown>,
        },
      );
      saveAttemptRef.current = attempt;
      let response: unknown;
      if (mode === "create") {
        response = await smartHealthApi.createAppointment(
          requestPayload,
          attempt.idempotencyKey,
        );
      } else {
        if (!appointment) {
          throw new Error("Không tìm thấy lịch hẹn cần cập nhật.");
        }
        if (mode === "reschedule") {
          response = await smartHealthApi.rescheduleAppointment(
            appointment.id,
            requestPayload as Pick<Appointment, "startsAt" | "endsAt"> & {
              reason?: string;
            },
            attempt.idempotencyKey,
          );
        } else {
          response = await smartHealthApi.updateAppointment(
            appointment.id,
            requestPayload,
            attempt.idempotencyKey,
          );
        }
      }
      if (
        activeWorkspaceRef.current !== operationWorkspaceId ||
        operationEpochRef.current !== operationEpoch
      ) {
        throw new AppointmentOperationSupersededError();
      }
      return {
        receipt: parseAppointmentMutationOutcome(response, {
          workspaceId: operationWorkspaceId,
          appointmentId: appointment?.id,
          expected: requestPayload,
        }),
        operationWorkspaceId,
      };
    },
    onSuccess: (result, variables) => {
      const message =
        variables.mode === "create"
          ? "Backend đã tạo lịch hẹn."
          : variables.mode === "reschedule"
            ? "Backend đã xác nhận lịch mới."
            : "Backend đã cập nhật lịch hẹn.";
      toast.success(message);
      saveAttemptRef.current = null;
      formBaselineRef.current = "";
      setFormMode(null);
      setFormTarget(null);
      setFormError("");
      refresh(result.operationWorkspaceId);
    },
    onError: (error) => {
      if (error instanceof AppointmentOperationSupersededError) return;
      setFormError(
        error instanceof Error ? error.message : "Không thể lưu lịch hẹn.",
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({
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
      const operationWorkspaceId = workspaceId;
      const operationEpoch = operationEpochRef.current;
      const operation = (
        nextStatus === "confirmed"
          ? "confirm"
          : nextStatus === "completed"
            ? "complete"
            : "no_show"
      ) as AppointmentOperation;
      const payload = { status: nextStatus };
      const attempt = resolveAppointmentOperationAttempt(
        statusAttemptRef.current,
        {
          operation,
          workspaceId: operationWorkspaceId,
          appointmentId: appointment.id,
          payload,
        },
      );
      statusAttemptRef.current = attempt;
      const response = await smartHealthApi.updateAppointment(
        appointment.id,
        payload,
        attempt.idempotencyKey,
      );
      if (
        activeWorkspaceRef.current !== operationWorkspaceId ||
        operationEpochRef.current !== operationEpoch
      ) {
        throw new AppointmentOperationSupersededError();
      }
      return {
        receipt: parseAppointmentMutationOutcome(response, {
          workspaceId: operationWorkspaceId,
          appointmentId: appointment.id,
          expected: payload,
        }),
        operationWorkspaceId,
      };
    },
    onSuccess: (result, variables) => {
      statusAttemptRef.current = null;
      toast.success(
        `Backend đã cập nhật trạng thái: ${STATUS_LABELS[variables.nextStatus]}.`,
      );
      refresh(result.operationWorkspaceId);
    },
    onError: (error) => {
      if (error instanceof AppointmentOperationSupersededError) return;
      toast.error(
        error instanceof Error
          ? error.message
          : "Không thể cập nhật trạng thái.",
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({
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
      const operationWorkspaceId = workspaceId;
      const operationEpoch = operationEpochRef.current;
      const payload = { cancellationReason: normalizedReason };
      const attempt = resolveAppointmentOperationAttempt(
        cancelAttemptRef.current,
        {
          operation: "cancel",
          workspaceId: operationWorkspaceId,
          appointmentId: appointment.id,
          payload,
        },
      );
      cancelAttemptRef.current = attempt;
      const response = await smartHealthApi.cancelAppointment(
        appointment.id,
        payload,
        attempt.idempotencyKey,
      );
      if (
        activeWorkspaceRef.current !== operationWorkspaceId ||
        operationEpochRef.current !== operationEpoch
      ) {
        throw new AppointmentOperationSupersededError();
      }
      return {
        receipt: parseAppointmentMutationOutcome(response, {
          workspaceId: operationWorkspaceId,
          appointmentId: appointment.id,
          expected: {
            status: "cancelled",
            cancellationReason: normalizedReason,
          },
        }),
        operationWorkspaceId,
      };
    },
    onSuccess: (result) => {
      cancelAttemptRef.current = null;
      toast.success("Backend đã xác nhận hủy lịch hẹn.");
      setCancelTarget(null);
      setCancellationReason("");
      setCancelError("");
      refresh(result.operationWorkspaceId);
    },
    onError: (error) => {
      if (error instanceof AppointmentOperationSupersededError) return;
      setCancelError(
        error instanceof Error ? error.message : "Không thể hủy lịch hẹn.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (appointment: Appointment) => {
      if (isOffline()) {
        throw new Error("Thiết bị đang ngoại tuyến. Vui lòng kết nối mạng rồi thử lại.");
      }
      const operationWorkspaceId = workspaceId;
      const operationEpoch = operationEpochRef.current;
      const attempt = resolveAppointmentOperationAttempt(deleteAttemptRef.current, {
        operation: "delete",
        workspaceId: operationWorkspaceId,
        appointmentId: appointment.id,
        payload: {},
      });
      deleteAttemptRef.current = attempt;
      const response = await smartHealthApi.deleteAppointment(
        appointment.id,
        attempt.idempotencyKey,
      );
      if (
        activeWorkspaceRef.current !== operationWorkspaceId ||
        operationEpochRef.current !== operationEpoch
      ) {
        throw new AppointmentOperationSupersededError();
      }
      return {
        receipt: parseAppointmentDeletionReceipt(response, {
          workspaceId: operationWorkspaceId,
          appointmentId: appointment.id,
        }),
        operationWorkspaceId,
      };
    },
    onSuccess: (result) => {
      deleteAttemptRef.current = null;
      setDeleteTarget(null);
      setDeleteError("");
      setDetailTargetId("");
      toast.success("Backend đã xác nhận xóa mềm lịch hẹn.");
      refresh(result.operationWorkspaceId);
    },
    onError: (error) => {
      if (error instanceof AppointmentOperationSupersededError) return;
      setDeleteError(error instanceof Error ? error.message : "Không thể xóa lịch hẹn.");
    },
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
  const patientCatalogUnavailable = Boolean(
    formMode === "create" &&
      (patientsQuery.isPending ||
        patientsQuery.isError ||
        patients.length === 0),
  );
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
  const mutationBusy =
    statusMutation.isPending ||
    saveMutation.isPending ||
    cancelMutation.isPending ||
    deleteMutation.isPending;

  const openForm = (
    mode: AppointmentFormMode,
    appointment: Appointment | null = null,
  ) => {
    const nextForm = appointment ? formFromAppointment(appointment) : defaultForm();
    if (mode === "create" && !canManageStaff && user?.role === "doctor") {
      nextForm.doctorUserId = user.id;
    }
    saveAttemptRef.current = null;
    formBaselineRef.current = JSON.stringify(nextForm);
    setFormMode(mode);
    setFormTarget(appointment);
    setForm(nextForm);
    setFormError("");
  };

  const closeForm = () => {
    if (saveMutation.isPending) return;
    saveAttemptRef.current = null;
    formBaselineRef.current = "";
    setDiscardFormOpen(false);
    setFormMode(null);
    setFormTarget(null);
    setFormError("");
  };

  const requestFormClose = () => {
    if (saveMutation.isPending) return;
    if (formDirty) {
      setDiscardFormOpen(true);
      return;
    }
    closeForm();
  };

  const canModify = (appointment: Appointment) =>
    canManage && !TERMINAL_STATUSES.has(statusOf(appointment));

  const renderActions = (appointment: Appointment) => {
    const currentStatus = statusOf(appointment);
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => setDetailTargetId(appointment.id)}
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
          disabled={mutationBusy}
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
          disabled={mutationBusy}
            onClick={() => openForm("reschedule", appointment)}
          >
            <RotateCcw aria-hidden="true" />
            Đổi lịch
          </Button>
        ) : null}
        {canClinicalManage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 text-destructive hover:text-destructive"
            disabled={mutationBusy}
            data-appointment-delete={appointment.id}
            onClick={() => {
              deleteAttemptRef.current = null;
              setDeleteTarget(appointment);
              setDeleteError("");
            }}
          >
            <Trash2 aria-hidden="true" />
            Xóa
          </Button>
        ) : null}
        {canClinicalManage && currentStatus === "scheduled" ? (
          <Button
            type="button"
            size="sm"
            className="min-h-11"
            disabled={mutationBusy}
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
            disabled={mutationBusy}
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
            disabled={mutationBusy}
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
            disabled={mutationBusy}
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

  if (workspaceChanging) {
    return (
      <div
        data-testid="portal-appointments-page"
        className="space-y-6"
      >
        <header className="clinical-page-header">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Điều phối chăm sóc
          </p>
          <h1 className="clinical-page-title mt-2 flex items-center gap-2 text-foreground">
            <CalendarDays aria-hidden="true" size={24} />
            Lịch hẹn
          </h1>
        </header>
        <Card role="status" className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-5">
            <Loader2
              aria-hidden="true"
              className="animate-spin text-primary motion-reduce:animate-none"
            />
            <div>
              <p className="font-semibold text-foreground">
                Đang đổi workspace
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Shcare đang đóng dữ liệu lịch hẹn cũ trước khi tải workspace
                mới.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="portal-appointments-page" className="space-y-6">
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
            disabled={!online || mutationBusy}
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
                    <dt className="sr-only">Thời gian</dt>
                    <dd className="flex gap-3">
                      <Clock3
                        aria-hidden="true"
                        className="mt-0.5 text-muted-foreground"
                      />
                      <div>
                        <span className="block font-medium text-foreground">
                          {formatDateTime(appointment.startsAt)}
                        </span>
                        <span className="block text-muted-foreground">
                          đến {formatDateTime(appointment.endsAt)}
                        </span>
                      </div>
                    </dd>
                    <dt className="text-xs text-muted-foreground">Bác sĩ</dt>
                    <dd className="text-foreground">
                      {appointment.doctor?.name ||
                        appointment.doctorUserId ||
                        "Chưa gán"}
                    </dd>
                    <dt className="text-xs text-muted-foreground">Loại lịch</dt>
                    <dd className="text-foreground">
                      {TYPE_LABELS[appointment.type || ""] ||
                        appointment.type ||
                        "Chưa xác định"}
                    </dd>
                  </dl>
                  {renderActions(appointment)}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden shadow-sm md:block">
            <Table className="min-w-[980px]">
              <TableCaption className="sr-only">
                Danh sách lịch hẹn thuộc workspace hiện tại
              </TableCaption>
              <TableHeader className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <TableRow>
                  <TableHead className="px-4 py-3">Thời gian</TableHead>
                  <TableHead className="px-4 py-3">Bệnh nhân</TableHead>
                  <TableHead className="px-4 py-3">Bác sĩ</TableHead>
                  <TableHead className="px-4 py-3">Loại</TableHead>
                  <TableHead className="px-4 py-3">Trạng thái</TableHead>
                  <TableHead className="px-4 py-3 text-right">
                    Thao tác
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y">
                {appointments.map((appointment) => (
                  <TableRow
                    key={appointment.id}
                    data-appointment-row={appointment.id}
                    className="transition-colors hover:bg-muted/20"
                  >
                    <TableCell className="px-4 py-4">
                      <p className="font-medium text-foreground">
                        {formatDateTime(appointment.startsAt)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        đến {formatDateTime(appointment.endsAt)}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <p className="font-medium text-foreground">
                        {appointment.patient?.name ||
                          appointment.patientId ||
                          "—"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {appointment.patient?.patientCode || appointment.id}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-muted-foreground">
                      {appointment.doctor?.name ||
                        appointment.doctorUserId ||
                        "Chưa gán"}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-foreground">
                      {TYPE_LABELS[appointment.type || ""] ||
                        appointment.type ||
                        "—"}
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <AppointmentStatusBadge appointment={appointment} />
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      {renderActions(appointment)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <Dialog
        open={Boolean(detailTargetId)}
        onOpenChange={(open) => !open && setDetailTargetId("")}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Chi tiết lịch hẹn</DialogTitle>
            <DialogDescription>
              Dữ liệu dưới đây được lấy từ bản ghi backend hiện tại.
            </DialogDescription>
          </DialogHeader>
          {detailQuery.isLoading ? (
            <div
              role="status"
              aria-label="Đang tải chi tiết lịch hẹn"
              className="space-y-3"
            >
              <Skeleton className="h-6 w-28 motion-reduce:animate-none" />
              <Skeleton className="h-48 w-full motion-reduce:animate-none" />
            </div>
          ) : detailQuery.error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
            >
              <p className="font-semibold text-destructive">
                Không thể tải chi tiết lịch hẹn
              </p>
              <p className="mt-1 text-sm text-destructive">
                {detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : "Backend chưa trả về bản ghi hợp lệ."}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 min-h-11"
                onClick={() => void detailQuery.refetch()}
              >
                <RefreshCw aria-hidden="true" />
                Thử lại
              </Button>
            </div>
          ) : detailQuery.data?.appointment ? (
            <AppointmentDetails appointment={detailQuery.data.appointment} />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setDetailTargetId("")}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(formMode)}
        onOpenChange={(open) => !open && requestFormClose()}
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
                    disabled={
                      formMode !== "create" ||
                      saveMutation.isPending ||
                      patientsQuery.isPending ||
                      patientsQuery.isError
                    }
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
                  {formMode === "create" && patientsQuery.isPending ? (
                    <p role="status" className="text-xs text-muted-foreground">
                      Đang tải danh mục bệnh nhân của workspace...
                    </p>
                  ) : null}
                  {formMode === "create" && patientsQuery.isError ? (
                    <div
                      role="alert"
                      className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
                    >
                      <p className="text-destructive">
                        Không tải được danh mục bệnh nhân. Chưa thể gửi lịch hẹn
                        mới.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => void patientsQuery.refetch()}
                      >
                        Thử tải lại
                      </Button>
                    </div>
                  ) : null}
                  {formMode === "create" &&
                  patientsQuery.isSuccess &&
                  patients.length === 0 ? (
                    <p role="status" className="text-xs text-muted-foreground">
                      Workspace chưa có bệnh nhân để tạo lịch hẹn.
                    </p>
                  ) : null}
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
              onClick={requestFormClose}
            >
              Đóng
            </Button>
            <Button
              form="appointment-form"
              className="min-h-11"
              disabled={
                saveMutation.isPending || !online || patientCatalogUnavailable
              }
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

      <AlertDialog
        open={discardFormOpen}
        onOpenChange={(open) => setDiscardFormOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bỏ thay đổi chưa lưu?</AlertDialogTitle>
            <AlertDialogDescription>
              Nội dung bạn vừa nhập chưa được backend xác nhận. Nếu đóng, bản
              nháp lịch hẹn này sẽ bị bỏ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">
              Tiếp tục chỉnh sửa
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                closeForm();
              }}
            >
              Bỏ thay đổi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            deleteAttemptRef.current = null;
            setDeleteTarget(null);
            setDeleteError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa lịch hẹn khỏi vận hành?</AlertDialogTitle>
            <AlertDialogDescription>
              Lịch hẹn sẽ được xóa mềm và ẩn khỏi danh sách, nhưng dấu vết audit vẫn được giữ để
              truy vết. Thao tác chỉ hoàn tất sau khi backend trả receipt đúng lịch và workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={deleteMutation.isPending}>
              Giữ lịch hẹn
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || !online}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget);
              }}
            >
              {deleteMutation.isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {deleteMutation.isPending ? "Đang xóa..." : "Xác nhận xóa mềm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
