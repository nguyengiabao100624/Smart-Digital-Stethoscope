import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarDays,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Link } from "react-router";
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
import { PatientEditorFields } from "../../components/PatientEditorFields";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi, type ApiError } from "../../../lib/smart-health-api";
import {
  parsePatientListResponse,
  parsePatientMutationOutcome,
  patientIntentFingerprint,
  resolvePatientOperationAttempt,
  type PatientOperationAttempt,
} from "../../../lib/patient-operations";
import {
  EMPTY_PATIENT_FORM,
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

function formatDate(value?: string | null) {
  if (!value) return "Chưa ghi nhận";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không hợp lệ";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function patientGender(value?: string) {
  if (value === "male") return "Nam";
  if (value === "female") return "Nữ";
  if (value === "other") return "Khác";
  return value || "Chưa cập nhật";
}

function mutationError(error: unknown) {
  const apiError = error as ApiError;
  const byCode: Record<string, string> = {
    IDEMPOTENCY_KEY_REUSED:
      "Nội dung đã thay đổi sau lần gửi trước. Hãy đóng biểu mẫu rồi mở lại để tạo thao tác mới.",
    PATIENT_DATE_OF_BIRTH_INVALID: "Ngày sinh không hợp lệ.",
    PATIENT_BLOOD_TYPE_INVALID: "Nhóm máu không hợp lệ.",
    PATIENT_STORAGE_UNAVAILABLE:
      "Kho hồ sơ bệnh nhân đang tạm thời không khả dụng.",
  };
  return (
    byCode[apiError.code || ""] ||
    (error instanceof Error ? error.message : "Không thể lưu hồ sơ.")
  );
}

export default function PatientsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = user?.currentWorkspace.id || "";
  const requiresPersonalMutationAuthority =
    user?.role === "patient" || user?.raw?.role === "patient";
  const canManage = Boolean(
    user?.capabilities?.some((capability) =>
      MANAGE_CAPABILITIES.includes(capability),
    ),
  );
  const [search, setSearch] = useState("");
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [form, setForm] = useState<PatientFormData>({ ...EMPTY_PATIENT_FORM });
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof PatientFormData, string>>
  >({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialFingerprintRef = useRef("");
  const attemptRef = useRef<PatientOperationAttempt | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const patientsQuery = useQuery({
    queryKey: ["portal", "workspace", workspaceId, "patients", search],
    queryFn: async () =>
      parsePatientListResponse(
        await smartHealthApi.listPatients(search),
        workspaceId,
      ),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const patients = patientsQuery.data || [];
  const formIntent = patientIntentFromForm(form);
  const formDirty =
    createOpen &&
    patientIntentFingerprint(formIntent) !== initialFingerprintRef.current;

  useEffect(() => {
    if (!formDirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [formDirty]);

  const openCreate = () => {
    const next = { ...EMPTY_PATIENT_FORM };
    setForm(next);
    setFieldErrors({});
    setSubmitError("");
    setDiscardOpen(false);
    attemptRef.current = null;
    initialFingerprintRef.current = patientIntentFingerprint(
      patientIntentFromForm(next),
    );
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setDiscardOpen(false);
    setCreateOpen(false);
  };

  const requestCreateOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      if (!createOpen) openCreate();
      return;
    }
    if (isSubmitting) return;
    if (formDirty) {
      setDiscardOpen(true);
      return;
    }
    closeCreate();
  };

  const updateField = (field: keyof PatientFormData, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSubmitError("");
  };

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlightRef.current || !canManage) return;
    if (!online) {
      setSubmitError("Thiết bị đang ngoại tuyến. Kết nối mạng rồi thử lại.");
      return;
    }
    const errors = validatePatientForm(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitError("Vui lòng kiểm tra các trường được đánh dấu.");
      return;
    }
    const intent = patientIntentFromForm(form);
    const attempt = resolvePatientOperationAttempt(
      attemptRef.current,
      "create",
      intent,
    );
    attemptRef.current = attempt;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const authority = requiresPersonalMutationAuthority
        ? await smartHealthApi.resolvePatientMutationAuthority(
            user?.id || "",
            workspaceId,
          )
        : undefined;
      const response = await smartHealthApi.createPatient(
        patientPayloadFromIntent(intent),
        attempt.idempotencyKey,
        authority,
      );
      const outcome = parsePatientMutationOutcome(response, intent);
      toast.success("Đã tạo hồ sơ bệnh nhân", {
        description: `${outcome.patient.name || "Hồ sơ"} đã được backend xác nhận.`,
      });
      initialFingerprintRef.current = patientIntentFingerprint(intent);
      attemptRef.current = null;
      closeCreate();
      await queryClient.invalidateQueries({
        queryKey: ["portal", "workspace", workspaceId, "patients"],
      });
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.fieldErrors) setFieldErrors(apiError.fieldErrors);
      setSubmitError(mutationError(error));
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const content = useMemo(() => {
    if (patientsQuery.isLoading) {
      return (
        <div
          className="grid gap-3"
          role="status"
          aria-label="Đang tải bệnh nhân"
        >
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-24 rounded-xl" />
          ))}
        </div>
      );
    }
    if (patientsQuery.error && patients.length === 0) {
      return (
        <Card role="alert" className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="flex-1 text-sm text-destructive">
              {patientsQuery.error instanceof Error
                ? patientsQuery.error.message
                : "Không thể tải hồ sơ bệnh nhân."}
            </p>
            <Button
              variant="outline"
              onClick={() => void patientsQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      );
    }
    if (patients.length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="h-9 w-9 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">
                {search ? "Không có hồ sơ phù hợp" : "Chưa có hồ sơ bệnh nhân"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {search
                  ? "Hãy thử từ khóa khác."
                  : "Danh sách chỉ hiển thị dữ liệu backend của workspace hiện tại."}
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <>
        <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Bệnh nhân</th>
                <th className="px-4 py-3 font-medium">Liên hệ</th>
                <th className="px-4 py-3 font-medium">Hồ sơ</th>
                <th className="px-4 py-3 font-medium">Lượt đo</th>
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {patients.map((patient) => (
                <tr
                  key={patient.id}
                  className="transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-4">
                    <p
                      className="font-semibold text-foreground"
                      data-testid={`patient-name-${patient.id}`}
                    >
                      {patient.name || "Chưa có tên"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {patientGender(patient.gender)}
                      {patient.age === undefined || patient.age === null
                        ? ""
                        : ` • ${patient.age} tuổi`}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    <p>{patient.phone || "Chưa có số điện thoại"}</p>
                    <p className="mt-1 text-xs">
                      {patient.email || "Chưa có email"}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant="outline">
                      {patient.patientCode || "Chưa có mã"}
                    </Badge>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Sinh: {formatDate(patient.dateOfBirth)}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-foreground">
                      {patient.scanCount === undefined
                        ? "Chưa có số liệu"
                        : `${patient.scanCount} lượt`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cuối: {formatDate(patient.lastScanAt)}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                    >
                      <Link to={`/portal/patients/${patient.id}`}>
                        Mở hồ sơ
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">
          {patients.map((patient) => (
            <Card key={patient.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle
                      className="text-base"
                      data-testid={`patient-name-${patient.id}`}
                    >
                      {patient.name || "Chưa có tên"}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {patient.patientCode || "Chưa có mã hồ sơ"}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {patientGender(patient.gender)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Liên hệ</p>
                    <p className="mt-1 text-foreground">
                      {patient.phone || "Chưa cập nhật"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lượt đo</p>
                    <p className="mt-1 text-foreground">
                      {patient.scanCount === undefined
                        ? "Chưa có số liệu"
                        : patient.scanCount}
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" className="min-h-12 w-full">
                  <Link to={`/portal/patients/${patient.id}`}>Mở hồ sơ</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </>
    );
  }, [patients, patientsQuery, search]);

  return (
    <div className="space-y-6" data-testid="portal-patients-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Users className="h-4 w-4" />
            Hồ sơ y tế
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Bệnh nhân
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hồ sơ thuộc {user?.currentWorkspace.name || "workspace hiện tại"}.
          </p>
        </div>
        {canManage ? (
          <Button
            id="portal-add-patient"
            onClick={openCreate}
            className="min-h-11"
          >
            <Plus className="h-4 w-4" />
            Thêm bệnh nhân
          </Button>
        ) : null}
      </div>

      {!online ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <AlertCircle className="h-4 w-4" />
          Đang ngoại tuyến. Dữ liệu đã tải vẫn xem được nhưng không thể tạo hồ
          sơ.
        </div>
      ) : null}
      {patientsQuery.error && patients.length > 0 ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <AlertCircle className="h-4 w-4" />
          <span className="flex-1">
            Không thể làm mới; đang giữ dữ liệu backend gần nhất.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void patientsQuery.refetch()}
          >
            Thử lại
          </Button>
        </div>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <Label htmlFor="portal-patient-search" className="sr-only">
            Tìm bệnh nhân
          </Label>
          <div className="relative max-w-xl">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="portal-patient-search"
              name="portalPatientSearch"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên, mã hồ sơ hoặc số điện thoại..."
              className="min-h-11 pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {content}

      <Dialog open={createOpen} onOpenChange={requestCreateOpen}>
        <DialogContent
          className="max-h-[92vh] max-w-3xl overflow-y-auto sm:max-w-3xl"
          onInteractOutside={(event) => isSubmitting && event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Thêm hồ sơ bệnh nhân</DialogTitle>
            <DialogDescription>
              Dùng biểu mẫu Portal tối ưu trình duyệt; backend phải xác nhận
              đúng dữ liệu trước khi hiển thị thành công.
            </DialogDescription>
          </DialogHeader>
          <form
            method="post"
            onSubmit={submitCreate}
            noValidate
            className="space-y-5"
          >
            {submitError ? (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {submitError}
              </div>
            ) : null}
            <PatientEditorFields
              form={form}
              errors={fieldErrors}
              disabled={isSubmitting}
              onChange={updateField}
            />
            <DialogFooter className="border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => requestCreateOpen(false)}
              >
                Hủy
              </Button>
              <Button
                id="portal-save-patient"
                type="submit"
                disabled={isSubmitting || !online}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <CalendarDays className="h-4 w-4" />
                )}
                {isSubmitting ? "Đang chờ backend..." : "Tạo hồ sơ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bỏ các thay đổi chưa lưu?</AlertDialogTitle>
            <AlertDialogDescription>
              Dữ liệu chưa được gửi tới backend và sẽ mất nếu bạn đóng biểu mẫu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tiếp tục chỉnh sửa</AlertDialogCancel>
            <AlertDialogAction onClick={closeCreate}>
              Bỏ thay đổi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
