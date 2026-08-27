import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileUp,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router";
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
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import { Progress } from "../../../components/ui/progress";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { useAuth } from "../../context/AuthContext";
import {
  createPatientImportIdempotencyKey,
  parsePatientImportCommitOutcome,
  parsePatientImportDetail,
  parsePatientImportValidationOutcome,
} from "../../../lib/patient-import-operations";
import {
  smartHealthApi,
  type ApiError,
  type PatientImportBatch,
  type PatientImportRow,
} from "../../../lib/smart-health-api";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 50;
const MANAGE_CAPABILITIES = [
  "platform.patients.manage",
  "workspace.patients.manage",
];

type RowFilter = "all" | "valid" | "invalid";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function patientGender(value?: string) {
  if (value === "male") return "Nam";
  if (value === "female") return "Nữ";
  if (value === "other") return "Khác";
  if (value === "unknown") return "Không xác định";
  return value || "—";
}

function importErrorMessage(error: unknown) {
  const apiError = error as ApiError;
  const byCode: Record<string, string> = {
    PATIENT_IMPORT_UTF8_REQUIRED: "File phải dùng mã hóa UTF-8 hợp lệ.",
    PATIENT_IMPORT_FILE_TOO_LARGE: "File vượt quá giới hạn 5 MB.",
    PATIENT_IMPORT_TOO_MANY_ROWS: "File vượt quá giới hạn 5.000 dòng dữ liệu.",
    PATIENT_IMPORT_CSV_MALFORMED: "Cấu trúc CSV không hợp lệ. Hãy kiểm tra dấu phẩy và dấu ngoặc kép.",
    PATIENT_IMPORT_NAME_HEADER_REQUIRED: "File thiếu cột name hoặc họ tên.",
    PATIENT_IMPORT_DUPLICATE_HEADER: "File có cột bị lặp.",
    PATIENT_IMPORT_BATCH_EXPIRED: "Batch đã hết hạn. Hãy kiểm tra lại file để tạo batch mới.",
    PATIENT_IMPORT_BATCH_INVALID: "Batch còn dòng lỗi nên chưa thể import.",
    PATIENT_IMPORT_DUPLICATES_CHANGED:
      "Dữ liệu workspace đã thay đổi và phát sinh trùng lặp. Hãy kiểm tra lại file.",
    IDEMPOTENCY_KEY_REUSED:
      "Yêu cầu thử lại không còn khớp với file ban đầu. Hãy chọn lại file.",
    PATIENT_IMPORT_SCOPE_DENIED: "Batch import nằm ngoài workspace hiện tại.",
  };
  return (
    byCode[apiError?.code || ""] ||
    (error instanceof Error ? error.message : "Không thể xử lý file CSV.")
  );
}

function downloadTemplate() {
  const headers = [
    "name",
    "patientCode",
    "dateOfBirth",
    "gender",
    "phone",
    "email",
    "address",
    "bloodType",
    "allergies",
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelationship",
    "notes",
  ];
  const example = [
    "Nguyễn Văn An",
    "BN-001",
    "1990-01-31",
    "male",
    "0901234567",
    "an@example.com",
    "12 Nguyễn Trãi",
    "O+",
    "penicillin;bụi",
    "Nguyễn Thị Bình",
    "0912345678",
    "Chị gái",
    "",
  ];
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const blob = new Blob(
    [`\uFEFF${headers.map(quote).join(",")}\r\n${example.map(quote).join(",")}\r\n`],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "shcare-patient-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ batch }: { batch: PatientImportBatch }) {
  if (batch.status === "committed") {
    return (
      <Badge
        variant="outline"
        style={{
          borderColor: "var(--status-success-border)",
          background: "var(--status-success-bg)",
          color: "var(--status-success-fg)",
        }}
      >
        Đã import
      </Badge>
    );
  }
  if (batch.status === "validated") {
    return (
      <Badge
        variant="outline"
        style={{
          borderColor: "var(--status-info-border)",
          background: "var(--status-info-bg)",
          color: "var(--status-info-fg)",
        }}
      >
        Sẵn sàng
      </Badge>
    );
  }
  if (batch.status === "expired") {
    return <Badge variant="secondary">Đã hết hạn</Badge>;
  }
  return <Badge variant="destructive">Cần sửa file</Badge>;
}

function RowIssues({ row }: { row: PatientImportRow }) {
  if (row.issues.length === 0) {
    return (
      <span className="text-sm text-[var(--status-success-fg)]">
        Hợp lệ
      </span>
    );
  }
  return (
    <ul className="space-y-1" aria-label={`Lỗi tại dòng ${row.rowNumber}`}>
      {row.issues.map((item, index) => (
        <li key={`${item.code}-${item.field}-${index}`} className="text-sm text-destructive">
          {item.message}
        </li>
      ))}
    </ul>
  );
}

export default function PatientImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validationKeyRef = useRef("");
  const commitKeyRef = useRef("");
  const inFlightRef = useRef(false);
  const operationEpochRef = useRef(0);
  const draftWorkspaceIdRef = useRef("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<PatientImportBatch | null>(null);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [page, setPage] = useState(1);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [isValidating, setIsValidating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState("");
  const [staleWarning, setStaleWarning] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);

  const workspaceId = user?.currentWorkspace.id || "";
  const activeWorkspaceRef = useRef(workspaceId);
  const previousWorkspaceRef = useRef(workspaceId);
  activeWorkspaceRef.current = workspaceId;
  const canManage = Boolean(
    user?.capabilities?.some((capability) =>
      MANAGE_CAPABILITIES.includes(capability),
    ),
  );
  const unfinished = Boolean(selectedFile && batch?.status !== "committed");
  const isBusy = isValidating || isRefreshing || isCommitting;
  const draftWorkspaceMismatch = Boolean(
    draftWorkspaceIdRef.current &&
      draftWorkspaceIdRef.current !== workspaceId,
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

  useEffect(() => {
    if (!unfinished) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unfinished]);

  useEffect(() => {
    if (previousWorkspaceRef.current === workspaceId) return;
    const discardedDraft = Boolean(draftWorkspaceIdRef.current);
    previousWorkspaceRef.current = workspaceId;
    operationEpochRef.current += 1;
    inFlightRef.current = false;
    draftWorkspaceIdRef.current = "";
    validationKeyRef.current = "";
    commitKeyRef.current = "";
    setSelectedFile(null);
    setBatch(null);
    setFilter("all");
    setPage(1);
    setIsValidating(false);
    setIsRefreshing(false);
    setIsCommitting(false);
    setStaleWarning("");
    setDiscardOpen(false);
    setCommitOpen(false);
    setError(
      discardedDraft
        ? "Workspace đã thay đổi. Hãy chọn lại file để tránh dùng dữ liệu của workspace trước."
        : "",
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [workspaceId]);

  const filteredRows = useMemo(() => {
    if (!batch) return [];
    if (filter === "all") return batch.rows;
    return batch.rows.filter((row) => row.status === filter);
  }, [batch, filter]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [filter, batch?.id]);

  const resetSelection = () => {
    operationEpochRef.current += 1;
    inFlightRef.current = false;
    draftWorkspaceIdRef.current = "";
    setSelectedFile(null);
    setBatch(null);
    setFilter("all");
    setPage(1);
    setError("");
    setStaleWarning("");
    setIsValidating(false);
    setIsRefreshing(false);
    setIsCommitting(false);
    setDiscardOpen(false);
    setCommitOpen(false);
    validationKeyRef.current = "";
    commitKeyRef.current = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectFile = (file: File | undefined) => {
    if (!file || inFlightRef.current || !workspaceId) return;
    const csvName = file.name.toLocaleLowerCase().endsWith(".csv");
    if (!csvName) {
      setError("Chỉ hỗ trợ file có phần mở rộng .csv.");
      return;
    }
    if (file.size === 0) {
      setError("File CSV đang trống.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File vượt quá giới hạn 5 MB.");
      return;
    }
    operationEpochRef.current += 1;
    draftWorkspaceIdRef.current = workspaceId;
    setSelectedFile(file);
    setBatch(null);
    setFilter("all");
    setPage(1);
    setError("");
    setStaleWarning("");
    validationKeyRef.current = createPatientImportIdempotencyKey(
      "validate",
      file.name,
    );
    commitKeyRef.current = "";
  };

  const validateFile = async () => {
    if (!selectedFile || inFlightRef.current) return;
    if (!online) {
      setError("Đang ngoại tuyến. Kết nối mạng để kiểm tra file với backend.");
      return;
    }
    const operationEpoch = operationEpochRef.current;
    const operationWorkspaceId = workspaceId;
    inFlightRef.current = true;
    setIsValidating(true);
    setError("");
    setStaleWarning("");
    try {
      validationKeyRef.current ||= createPatientImportIdempotencyKey(
        "validate",
        selectedFile.name,
      );
      const response = await smartHealthApi.validatePatientImport(
          selectedFile,
          validationKeyRef.current,
        );
      if (
        operationEpochRef.current !== operationEpoch ||
        activeWorkspaceRef.current !== operationWorkspaceId
      ) {
        return;
      }
      const outcome = parsePatientImportValidationOutcome(
        response,
        {
          workspaceId: operationWorkspaceId,
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
        },
      );
      setBatch(outcome.batch);
      commitKeyRef.current = createPatientImportIdempotencyKey(
        "commit",
        outcome.batch.id,
      );
      if (outcome.batch.status === "validated") {
        toast.success(`Đã kiểm tra ${outcome.batch.rowCount} dòng. Batch sẵn sàng import.`);
      } else {
        toast.warning(
          `Có ${outcome.batch.invalidCount} dòng cần sửa trước khi import.`,
        );
      }
    } catch (validationError) {
      if (operationEpochRef.current === operationEpoch) {
        setError(importErrorMessage(validationError));
      }
    } finally {
      if (operationEpochRef.current === operationEpoch) {
        inFlightRef.current = false;
        setIsValidating(false);
      }
    }
  };

  const refreshBatch = async () => {
    if (!batch || inFlightRef.current) return;
    if (!online) {
      setStaleWarning("Đang ngoại tuyến. Dữ liệu xem trước bên dưới là lần xác nhận gần nhất.");
      return;
    }
    const operationEpoch = operationEpochRef.current;
    const operationWorkspaceId = workspaceId;
    const previousBatch = batch;
    inFlightRef.current = true;
    setIsRefreshing(true);
    setStaleWarning("");
    try {
      const response = await smartHealthApi.getPatientImportBatch(batch.id);
      if (
        operationEpochRef.current !== operationEpoch ||
        activeWorkspaceRef.current !== operationWorkspaceId
      ) {
        return;
      }
      const refreshedBatch = parsePatientImportDetail(
        response,
        {
          workspaceId: operationWorkspaceId,
          batchId: previousBatch.id,
          minimumVersion: previousBatch.version,
        },
      );
      setBatch(refreshedBatch);
      if (
        refreshedBatch.status === "committed" &&
        previousBatch.status !== "committed"
      ) {
        await queryClient.invalidateQueries({
          queryKey: [
            "portal",
            "workspace",
            operationWorkspaceId,
            "patients",
          ],
        });
      }
    } catch (refreshError) {
      if (operationEpochRef.current === operationEpoch) {
        setStaleWarning(
          `${importErrorMessage(refreshError)} Dữ liệu xem trước cũ vẫn được giữ lại.`,
        );
      }
    } finally {
      if (operationEpochRef.current === operationEpoch) {
        inFlightRef.current = false;
        setIsRefreshing(false);
      }
    }
  };

  const commitBatch = async () => {
    if (!batch || batch.status !== "validated" || inFlightRef.current) return;
    if (!online) {
      setError("Đang ngoại tuyến. Chưa có hồ sơ nào được tạo.");
      setCommitOpen(false);
      return;
    }
    const operationEpoch = operationEpochRef.current;
    const operationWorkspaceId = workspaceId;
    const previousBatch = batch;
    inFlightRef.current = true;
    setIsCommitting(true);
    setError("");
    try {
      commitKeyRef.current ||= createPatientImportIdempotencyKey(
        "commit",
        batch.id,
      );
      const response = await smartHealthApi.commitPatientImport(
        batch.id,
        commitKeyRef.current,
      );
      if (
        operationEpochRef.current !== operationEpoch ||
        activeWorkspaceRef.current !== operationWorkspaceId
      ) {
        return;
      }
      const outcome = parsePatientImportCommitOutcome(
        response,
        {
          workspaceId: operationWorkspaceId,
          batchId: previousBatch.id,
          minimumVersion: previousBatch.version,
        },
      );
      setBatch(outcome.batch);
      await queryClient.invalidateQueries({
        queryKey: [
          "portal",
          "workspace",
          operationWorkspaceId,
          "patients",
        ],
      });
      toast.success(`Đã import trọn vẹn ${outcome.importedCount} hồ sơ bệnh nhân.`);
      setCommitOpen(false);
    } catch (commitError) {
      if (operationEpochRef.current === operationEpoch) {
        setError(importErrorMessage(commitError));
        setCommitOpen(false);
      }
    } finally {
      if (operationEpochRef.current === operationEpoch) {
        inFlightRef.current = false;
        setIsCommitting(false);
      }
    }
  };

  const requestBack = () => {
    if (isBusy) return;
    if (unfinished) setDiscardOpen(true);
    else navigate("/portal/patients");
  };

  if (draftWorkspaceMismatch) {
    return (
      <div
        className="mx-auto max-w-2xl space-y-5"
        data-testid="patient-import-page"
      >
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Import bệnh nhân
        </h1>
        <Card role="status">
          <CardHeader className="text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <RefreshCw
                className="motion-safe:animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            </span>
            <CardTitle>Đang đổi workspace</CardTitle>
            <CardDescription>
              Shcare đang loại dữ liệu xem trước của workspace trước khi mở
              phiên import mới.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div
        className="mx-auto max-w-2xl space-y-5"
        data-testid="patient-import-page"
      >
        <Button variant="ghost" className="min-h-11" onClick={() => navigate("/portal/patients")}>
          <ArrowLeft aria-hidden="true" />
          Bệnh nhân
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Import bệnh nhân
        </h1>
        <Card>
          <CardHeader className="text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert aria-hidden="true" />
            </span>
            <CardTitle>Không có quyền import</CardTitle>
            <CardDescription>
              Chỉ người có quyền quản lý bệnh nhân của workspace mới được tạo batch import.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="patient-import-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Button
            variant="ghost"
            className="min-h-11 px-0"
            onClick={requestBack}
            disabled={isBusy}
          >
            <ArrowLeft aria-hidden="true" />
            Bệnh nhân
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Import bệnh nhân
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Backend kiểm tra toàn bộ file trước. Không hồ sơ nào được tạo cho đến khi bạn xác
              nhận một batch hợp lệ.
            </p>
          </div>
        </div>
        <Button variant="outline" className="min-h-11" onClick={downloadTemplate}>
          <Download aria-hidden="true" />
          Tải file mẫu
        </Button>
      </div>

      {!online && (
        <Alert variant="destructive" role="status">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Đang ngoại tuyến</AlertTitle>
          <AlertDescription>
            Bạn vẫn có thể xem batch đã tải, nhưng kiểm tra và commit được khóa cho đến khi có mạng.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" role="alert" data-testid="patient-import-error">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Chưa thể hoàn tất thao tác</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            {selectedFile && !batch && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 shrink-0"
                onClick={validateFile}
                disabled={isBusy || !online}
              >
                <RefreshCw aria-hidden="true" />
                Thử lại
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet className="size-5" aria-hidden="true" />
            </span>
            1. Chọn file CSV
          </CardTitle>
          <CardDescription>
            UTF-8, tối đa 5 MB và 5.000 dòng. Cột name/họ tên là bắt buộc; mã hồ sơ trống sẽ được
            sinh ổn định khi kiểm tra.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center transition-colors hover:border-primary/50 sm:p-8"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              selectFile(event.dataTransfer.files[0]);
            }}
          >
            <UploadCloud className="mx-auto size-9 text-primary" aria-hidden="true" />
            <p className="mt-3 font-medium text-foreground">Kéo file CSV vào đây</p>
            <p className="mt-1 text-sm text-muted-foreground">hoặc chọn file từ máy tính</p>
            <Label
              data-action-label
              aria-disabled={isBusy}
              className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-[var(--clinical-primary-strong)] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
              <FileUp className="size-4" aria-hidden="true" />
              Chọn file CSV
              <input
                ref={fileInputRef}
                id="patient-import-file"
                name="patientImportFile"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={isBusy}
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
            </Label>
          </div>

          {selectedFile && (
            <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileCheck2 aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={resetSelection}
                  disabled={isBusy}
                >
                  Chọn lại
                </Button>
                <Button
                  className="min-h-11"
                  onClick={validateFile}
                  disabled={isBusy || !online}
                  data-testid="patient-import-validate"
                >
                  {isValidating ? (
                    <Loader2 className="motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <FileCheck2 aria-hidden="true" />
                  )}
                  {isValidating ? "Đang tải và kiểm tra…" : batch ? "Kiểm tra lại" : "Kiểm tra file"}
                </Button>
              </div>
            </div>
          )}

          {isValidating && (
            <div role="status" aria-live="polite" className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Backend đang kiểm tra toàn bộ file</span>
                <span>Không tạo hồ sơ ở bước này</span>
              </div>
              <Progress value={undefined} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {batch && (
        <Card data-testid="patient-import-preview">
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                2. Kiểm tra kết quả
                <StatusBadge batch={batch} />
              </CardTitle>
              <CardDescription className="mt-2">
                Batch {batch.id} · hết hạn {formatDateTime(batch.expiresAt)}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={refreshBatch}
              disabled={isBusy || !online}
            >
              <RefreshCw
                className={isRefreshing ? "motion-safe:animate-spin motion-reduce:animate-none" : ""}
                aria-hidden="true"
              />
              Làm mới trạng thái
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {staleWarning && (
              <Alert role="status">
                <Clock3 aria-hidden="true" />
                <AlertTitle>Dữ liệu xem trước có thể đã cũ</AlertTitle>
                <AlertDescription>{staleWarning}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Tổng số dòng", batch.rowCount, "text-foreground"],
                [
                  "Hợp lệ",
                  batch.validCount,
                  "text-[var(--status-success-fg)]",
                ],
                ["Cần sửa", batch.invalidCount, "text-destructive"],
                [
                  "Phát hiện trùng",
                  batch.duplicateCount,
                  "text-[var(--status-warning-fg)]",
                ],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {batch.status === "invalid" && (
              <Alert variant="destructive">
                <XCircle aria-hidden="true" />
                <AlertTitle>Batch chưa thể import</AlertTitle>
                <AlertDescription>
                  Sửa các dòng được đánh dấu trong file gốc, sau đó chọn lại file. Không hồ sơ nào
                  đã được tạo.
                </AlertDescription>
              </Alert>
            )}
            {batch.status === "expired" && (
              <Alert>
                <Clock3 aria-hidden="true" />
                <AlertTitle>Batch đã hết hạn</AlertTitle>
                <AlertDescription>
                  Batch chỉ có hiệu lực 24 giờ. Hãy kiểm tra lại file để đối chiếu với dữ liệu hiện tại.
                </AlertDescription>
              </Alert>
            )}
            {batch.status === "committed" && (
              <Alert
                style={{
                  borderColor: "var(--status-success-border)",
                  background: "var(--status-success-bg)",
                }}
              >
                <CheckCircle2
                  className="text-[var(--status-success-fg)]"
                  aria-hidden="true"
                />
                <AlertTitle>Import hoàn tất</AlertTitle>
                <AlertDescription>
                  Backend đã xác nhận tạo trọn vẹn {batch.importedCount} hồ sơ. Không có kết quả từng
                  phần.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2" aria-label="Lọc dòng import">
              {([
                ["all", `Tất cả (${batch.rowCount})`],
                ["invalid", `Cần sửa (${batch.invalidCount})`],
                ["valid", `Hợp lệ (${batch.validCount})`],
              ] as const).map(([value, label]) => (
                <Button
                  key={value}
                  variant={filter === value ? "default" : "outline"}
                  size="sm"
                  className="min-h-11"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                >
                  {label}
                </Button>
              ))}
            </div>

            {visibleRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Không có dòng nào trong bộ lọc này.
              </div>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border border-border md:block">
                  <Table>
                    <TableCaption className="sr-only">
                      Xem trước các dòng trong batch import bệnh nhân
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Dòng</TableHead>
                        <TableHead>Bệnh nhân</TableHead>
                        <TableHead>Liên hệ</TableHead>
                        <TableHead>Kết quả kiểm tra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row) => (
                        <TableRow key={row.rowNumber} data-testid={`patient-import-row-${row.rowNumber}`}>
                          <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                          <TableCell>
                            <p className="font-medium text-foreground">{row.patient.name || "Chưa có họ tên"}</p>
                            <p className="text-sm text-muted-foreground">
                              {row.patient.patientCode} · {row.patient.dateOfBirth || "Chưa có ngày sinh"} · {patientGender(row.patient.gender)}
                            </p>
                          </TableCell>
                          <TableCell className="text-sm">
                            <p>{row.patient.phone || "—"}</p>
                            <p className="text-muted-foreground">{row.patient.email || "—"}</p>
                          </TableCell>
                          <TableCell className="max-w-sm"><RowIssues row={row} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 md:hidden">
                  {visibleRows.map((row) => (
                    <div
                      key={row.rowNumber}
                      className="rounded-xl border border-border p-4"
                      data-testid={`patient-import-row-${row.rowNumber}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{row.patient.name || "Chưa có họ tên"}</p>
                          <p className="text-sm text-muted-foreground">Dòng {row.rowNumber} · {row.patient.patientCode}</p>
                        </div>
                        <Badge variant={row.status === "valid" ? "secondary" : "destructive"}>
                          {row.status === "valid" ? "Hợp lệ" : "Cần sửa"}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">Ngày sinh</span>
                        <span className="text-right">{row.patient.dateOfBirth || "—"}</span>
                        <span className="text-muted-foreground">Liên hệ</span>
                        <span className="break-all text-right">{row.patient.phone || row.patient.email || "—"}</span>
                      </div>
                      <div className="mt-3 border-t border-border pt-3"><RowIssues row={row} /></div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {filteredRows.length > PAGE_SIZE && (
              <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} / {filteredRows.length}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="min-h-11" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>
                    <ChevronLeft aria-hidden="true" />
                    Trước
                  </Button>
                  <Button variant="outline" size="sm" className="min-h-11" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>
                    Sau
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {batch && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Xác nhận import</CardTitle>
            <CardDescription>
              Commit là một transaction toàn vẹn: tạo đủ mọi hồ sơ hoặc không tạo hồ sơ nào.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {batch.status === "validated" && `${batch.validCount} hồ sơ đang chờ xác nhận.`}
              {batch.status === "invalid" && "Sửa file trước khi có thể xác nhận."}
              {batch.status === "expired" && "Kiểm tra lại file để tạo batch mới."}
              {batch.status === "committed" && `Đã tạo ${batch.importedCount} hồ sơ.`}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {batch.status === "committed" ? (
                <Button className="min-h-11" onClick={() => navigate("/portal/patients")}>
                  Xem danh sách bệnh nhân
                </Button>
              ) : (
                <Button
                  className="min-h-11"
                  onClick={() => setCommitOpen(true)}
                  disabled={batch.status !== "validated" || isBusy || !online}
                  data-testid="patient-import-commit"
                >
                  {isCommitting ? (
                    <Loader2 className="motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" />
                  )}
                  {isCommitting ? "Đang xác nhận…" : `Import ${batch.validCount} hồ sơ`}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedFile && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <FileUp className="size-10 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 font-medium text-foreground">Chưa có file nào được chọn</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Tải file mẫu để giữ đúng tên cột, sau đó chọn CSV để backend kiểm tra.
            </p>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={commitOpen}
        onOpenChange={(open) => !isBusy && setCommitOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận import {batch?.validCount || 0} hồ sơ?</AlertDialogTitle>
            <AlertDialogDescription>
              Backend sẽ kiểm tra trùng lặp lần cuối rồi tạo toàn bộ hồ sơ trong một transaction. Nếu
              dữ liệu đã thay đổi, không hồ sơ nào được tạo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={isCommitting}>Quay lại kiểm tra</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={(event) => {
                event.preventDefault();
                void commitBatch();
              }}
              disabled={isBusy || !online}
            >
              {isCommitting && <Loader2 className="motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              Xác nhận import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rời khỏi batch chưa hoàn tất?</AlertDialogTitle>
            <AlertDialogDescription>
              File đã chọn và kết quả xem trước trong màn hình này sẽ bị bỏ. Backend không tạo hồ sơ
              khi bạn chưa xác nhận commit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Tiếp tục kiểm tra</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={() => navigate("/portal/patients")}>
              Rời trang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
