import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  FileText,
  HeartPulse,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
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
import { Skeleton } from "../../../components/ui/skeleton";
import { PatientEditorFields } from "../../components/PatientEditorFields";
import { useAuth } from "../../context/AuthContext";
import {
  smartHealthApi,
  type ApiError,
  type Patient,
} from "../../../lib/smart-health-api";
import {
  parsePatientDeleteOutcome,
  parsePatientDetailResponse,
  parsePatientMutationOutcome,
  parsePatientScanHistoryResponse,
  patientIntentFingerprint,
  resolvePatientOperationAttempt,
  type PatientOperationAttempt,
} from "../../../lib/patient-operations";
import {
  EMPTY_PATIENT_FORM,
  patientFormFromRecord,
  patientIntentFromForm,
  patientPayloadFromIntent,
  validatePatientForm,
  type PatientFormData,
} from "../../../lib/patient-form";

const MANAGE_CAPABILITIES = [
  "platform.patients.manage",
  "workspace.patients.manage",
  "personal.profiles.manage",
];

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "Chưa ghi nhận";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không hợp lệ";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function mutationError(error: unknown, fallback: string) {
  const apiError = error as ApiError;
  const byCode: Record<string, string> = {
    IDEMPOTENCY_KEY_REUSED:
      "Nội dung đã đổi sau lần gửi trước. Hãy tải lại hồ sơ rồi thực hiện thao tác mới.",
    SELF_PROFILE_DELETE_FORBIDDEN:
      "Không thể xóa hồ sơ chính gắn với tài khoản.",
    PATIENT_STORAGE_UNAVAILABLE:
      "Kho hồ sơ bệnh nhân đang tạm thời không khả dụng.",
    PATIENT_DATE_OF_BIRTH_INVALID: "Ngày sinh không hợp lệ.",
    PATIENT_BLOOD_TYPE_INVALID: "Nhóm máu không hợp lệ.",
  };
  return (
    byCode[apiError.code || ""] ||
    (error instanceof Error ? error.message : fallback)
  );
}

function patientIntent(patient: Patient) {
  return patientIntentFromForm(patientFormFromRecord(patient), patient.id);
}

export default function PatientDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const workspaceId = user?.currentWorkspace.id || "";
  const requiresPersonalMutationAuthority =
    user?.role === "patient" || user?.raw?.role === "patient";
  const canManage = Boolean(
    user?.capabilities?.some((capability) =>
      MANAGE_CAPABILITIES.includes(capability),
    ),
  );
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [form, setForm] = useState<PatientFormData>({ ...EMPTY_PATIENT_FORM });
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof PatientFormData, string>>
  >({});
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [externalUpdate, setExternalUpdate] = useState(false);
  const initialFingerprintRef = useRef("");
  const initializedRecordRef = useRef("");
  const saveAttemptRef = useRef<PatientOperationAttempt | null>(null);
  const deleteAttemptRef = useRef<PatientOperationAttempt | null>(null);
  const inFlightRef = useRef(false);

  const patientQuery = useQuery({
    queryKey: ["portal", "workspace", workspaceId, "patient", id],
    queryFn: async () =>
      parsePatientDetailResponse(
        await smartHealthApi.getPatient(id),
        workspaceId,
      ),
    enabled: Boolean(id && workspaceId),
    retry: false,
  });
  const scansQuery = useQuery({
    queryKey: [
      "portal",
      "workspace",
      workspaceId,
      "scans",
      "patient",
      id,
    ],
    queryFn: async () =>
      parsePatientScanHistoryResponse(
        await smartHealthApi.listScans({ patientId: id, limit: 100 }),
        workspaceId,
        id,
      ),
    enabled: Boolean(id && workspaceId),
    retry: false,
  });

  const currentIntent = patientIntentFromForm(form, id);
  const dirty =
    Boolean(initialFingerprintRef.current) &&
    patientIntentFingerprint(currentIntent) !== initialFingerprintRef.current;

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
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const patient = patientQuery.data;
    if (!patient) return;
    const recordKey = `${patient.id}:${patient.updatedAt || "unknown"}`;
    if (recordKey === initializedRecordRef.current) return;
    if (initializedRecordRef.current && dirty) {
      setExternalUpdate(true);
      return;
    }
    const nextForm = patientFormFromRecord(patient);
    setForm(nextForm);
    setFieldErrors({});
    setSaveError("");
    setExternalUpdate(false);
    saveAttemptRef.current = null;
    initializedRecordRef.current = recordKey;
    initialFingerprintRef.current = patientIntentFingerprint(
      patientIntentFromForm(nextForm, patient.id),
    );
  }, [dirty, patientQuery.data]);

  const updateField = (field: keyof PatientFormData, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSaveError("");
  };

  const savePatient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !patientQuery.data || inFlightRef.current) return;
    if (!online) {
      setSaveError("Thiết bị đang ngoại tuyến. Kết nối mạng rồi thử lại.");
      return;
    }
    const errors = validatePatientForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSaveError("Vui lòng kiểm tra các trường được đánh dấu.");
      return;
    }
    const intent = patientIntentFromForm(form, patientQuery.data.id);
    const attempt = resolvePatientOperationAttempt(
      saveAttemptRef.current,
      "update",
      intent,
    );
    saveAttemptRef.current = attempt;
    inFlightRef.current = true;
    setIsSaving(true);
    setSaveError("");
    try {
      const authority = requiresPersonalMutationAuthority
        ? await smartHealthApi.resolvePatientMutationAuthority(
            user?.id || "",
            workspaceId,
          )
        : undefined;
      const response = await smartHealthApi.updatePatient(
        patientQuery.data.id,
        patientPayloadFromIntent(intent),
        attempt.idempotencyKey,
        authority,
      );
      const outcome = parsePatientMutationOutcome(response, intent);
      initialFingerprintRef.current = patientIntentFingerprint(intent);
      initializedRecordRef.current = `${outcome.patient.id}:${outcome.patient.updatedAt || "unknown"}`;
      saveAttemptRef.current = null;
      setExternalUpdate(false);
      client.setQueryData(
        ["portal", "workspace", workspaceId, "patient", id],
        outcome.patient,
      );
      await client.invalidateQueries({
        queryKey: ["portal", "workspace", workspaceId, "patients"],
      });
      toast.success("Đã cập nhật hồ sơ", {
        description: "Backend đã xác nhận đúng ID và nội dung vừa lưu.",
      });
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.fieldErrors) setFieldErrors(apiError.fieldErrors);
      setSaveError(
        mutationError(error, "Backend chưa xác nhận cập nhật hồ sơ."),
      );
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const deletePatient = async () => {
    const patient = patientQuery.data;
    if (!patient || isDeleting || !canManage) return;
    if (!online) {
      setDeleteError("Thiết bị đang ngoại tuyến. Kết nối mạng rồi thử lại.");
      return;
    }
    const attempt = resolvePatientOperationAttempt(
      deleteAttemptRef.current,
      "delete",
      patientIntent(patient),
    );
    deleteAttemptRef.current = attempt;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const authority = requiresPersonalMutationAuthority
        ? await smartHealthApi.resolvePatientMutationAuthority(
            user?.id || "",
            workspaceId,
          )
        : undefined;
      const response = await smartHealthApi.deletePatient(
        patient.id,
        attempt.idempotencyKey,
        authority,
      );
      parsePatientDeleteOutcome(response, patient.id);
      deleteAttemptRef.current = null;
      initialFingerprintRef.current = "";
      await client.invalidateQueries({
        queryKey: ["portal", "workspace", workspaceId, "patients"],
      });
      toast.success("Đã xóa hồ sơ bệnh nhân", {
        description:
          "Backend đã xác nhận soft-delete và ghi nhận đúng ID hồ sơ.",
      });
      navigate("/portal/patients", { replace: true });
    } catch (error) {
      setDeleteError(mutationError(error, "Backend chưa xác nhận xóa hồ sơ."));
    } finally {
      setIsDeleting(false);
    }
  };

  if (patientQuery.isLoading) {
    return (
      <div
        className="space-y-4"
        role="status"
        aria-label="Đang tải hồ sơ bệnh nhân"
      >
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }
  if (patientQuery.error || !patientQuery.data) {
    return (
      <Card role="alert" className="border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col items-start gap-4 p-6">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p className="font-medium">
              {patientQuery.error instanceof Error
                ? patientQuery.error.message
                : "Không tìm thấy hồ sơ bệnh nhân."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => void patientQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
              Thử lại
            </Button>
            <Button asChild variant="ghost">
              <Link to="/portal/patients">Về danh sách</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const patient = patientQuery.data;
  return (
    <div className="space-y-6" data-testid="portal-patient-detail-page">
      <Button
        type="button"
        variant="ghost"
        onClick={() =>
          dirty ? setLeaveOpen(true) : navigate("/portal/patients")
        }
        className="min-h-11 px-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách bệnh nhân
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <UserRound className="h-4 w-4" />
            Chi tiết hồ sơ
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {patient.name || "Hồ sơ bệnh nhân"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {patient.patientCode || "Chưa có mã hồ sơ"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              ID hệ thống: {patient.id}
            </span>
          </div>
        </div>
        {canManage ? (
          <Button
            id="patient-delete"
            variant="destructive"
            disabled={isSaving}
            onClick={() => {
              setDeleteError("");
              deleteAttemptRef.current = null;
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Xóa hồ sơ
          </Button>
        ) : null}
      </div>

      {!online ? (
        <div
          role="status"
          className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <AlertCircle className="mt-0.5 h-4 w-4" />
          Đang ngoại tuyến. Bạn vẫn xem được dữ liệu đã tải nhưng chưa thể lưu
          hoặc xóa.
        </div>
      ) : null}
      {externalUpdate ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <AlertCircle className="h-4 w-4" />
          <span className="flex-1">
            Backend có phiên bản mới trong khi bạn đang chỉnh sửa.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = patientFormFromRecord(patientQuery.data);
              setForm(next);
              initialFingerprintRef.current = patientIntentFingerprint(
                patientIntentFromForm(next, patientQuery.data.id),
              );
              initializedRecordRef.current = `${patientQuery.data.id}:${patientQuery.data.updatedAt || "unknown"}`;
              setExternalUpdate(false);
              saveAttemptRef.current = null;
            }}
          >
            Tải phiên bản mới
          </Button>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin bệnh nhân</CardTitle>
            <CardDescription>
              {canManage
                ? "Chỉnh sửa dữ liệu có cấu trúc; thao tác được audit tại backend."
                : "Bạn đang có quyền xem; các trường chỉnh sửa đã được khóa."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              method="post"
              onSubmit={savePatient}
              noValidate
              className="space-y-5"
            >
              {saveError ? (
                <div
                  role="alert"
                  className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {saveError}
                </div>
              ) : null}
              <PatientEditorFields
                form={form}
                errors={fieldErrors}
                disabled={!canManage || isSaving}
                onChange={updateField}
              />
              {canManage ? (
                <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!dirty || isSaving}
                    onClick={() => {
                      const next = patientFormFromRecord(patient);
                      setForm(next);
                      setFieldErrors({});
                      setSaveError("");
                      saveAttemptRef.current = null;
                    }}
                  >
                    Hoàn tác
                  </Button>
                  <Button
                    id="patient-save-profile"
                    type="submit"
                    disabled={!dirty || isSaving || !online || externalUpdate}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isSaving ? "Đang chờ backend..." : "Lưu hồ sơ"}
                  </Button>
                </div>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tóm tắt đã xác nhận</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Summary
                icon={CalendarDays}
                label="Ngày sinh"
                value={formatDate(patient.dateOfBirth)}
              />
              <Summary
                icon={HeartPulse}
                label="Nhóm máu"
                value={patient.bloodType || "Chưa cập nhật"}
              />
              <Summary
                icon={ShieldAlert}
                label="Dị ứng"
                value={
                  patient.allergies?.length
                    ? patient.allergies.join(", ")
                    : "Chưa khai báo"
                }
              />
              <Summary
                icon={FileText}
                label="Cập nhật"
                value={formatDate(patient.updatedAt, true)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Liên hệ khẩn cấp</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {patient.emergencyContact?.name ||
              patient.emergencyContact?.phone ? (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {patient.emergencyContact.name || "Chưa có tên"}
                  </p>
                  <p className="text-muted-foreground">
                    {patient.emergencyContact.phone || "Chưa có số điện thoại"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {patient.emergencyContact.relationship ||
                      "Chưa ghi quan hệ"}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Chưa khai báo liên hệ khẩn cấp.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử lượt đo</CardTitle>
          <CardDescription>
            Chỉ hiển thị lượt đo backend trả về cho đúng ID bệnh nhân.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scansQuery.isLoading ? (
            <div
              className="space-y-3"
              role="status"
              aria-label="Đang tải lượt đo"
            >
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : scansQuery.error ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4" />
              <span className="flex-1">Không thể tải lịch sử lượt đo.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void scansQuery.refetch()}
              >
                Thử lại
              </Button>
            </div>
          ) : !scansQuery.data?.scans.length ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Backend chưa trả về lượt đo nào cho hồ sơ này.
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {scansQuery.data.scans.map((scan) => (
                <Link
                  key={scan.id}
                  to={`/portal/records/${scan.id}`}
                  className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {scan.aiLabel || scan.status || "Lượt đo"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {scan.deviceId || "Backend chưa ghi thiết bị"}
                    </p>
                  </div>
                  <span className="text-right text-xs text-muted-foreground">
                    {formatDate(scan.createdAt, true)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(nextOpen) => !isDeleting && setDeleteOpen(nextOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa hồ sơ bệnh nhân?</AlertDialogTitle>
            <AlertDialogDescription>
              Backend sẽ soft-delete hồ sơ <strong>{patient.name}</strong> theo
              ID hệ thống <strong>{patient.id}</strong> và ghi audit. Mã hồ sơ{" "}
              {patient.patientCode || "chưa có"} không được dùng làm khóa xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {deleteError}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void deletePatient();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {isDeleting ? "Đang chờ backend..." : "Xóa hồ sơ"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rời hồ sơ khi chưa lưu?</AlertDialogTitle>
            <AlertDialogDescription>
              Các thay đổi hiện tại chưa được backend xác nhận và sẽ bị mất.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tiếp tục chỉnh sửa</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate("/portal/patients")}>
              Bỏ thay đổi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}
