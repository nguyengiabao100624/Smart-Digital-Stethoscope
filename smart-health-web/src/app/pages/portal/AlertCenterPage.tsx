import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Link } from "react-router";
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
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Skeleton } from "../../../components/ui/skeleton";
import { Textarea } from "../../../components/ui/textarea";
import {
  resolveClinicalWorkflowIntent,
  type ClinicalWorkflowIntent,
} from "../../../lib/clinical-workflow-intent";
import {
  validateClinicalAlertAction,
  type ClinicalAlertAction,
} from "../../../lib/clinical-workflow-validation";
import {
  smartHealthApi,
  type ApiError,
  type ClinicalAlert,
  type ClinicalAlertStatus,
} from "../../../lib/smart-health-api";
import { portalWorkspaceQueryKey } from "../../../lib/workspace-query-cache";
import { useAuth } from "../../context/AuthContext";

type AlertFilter = "all" | ClinicalAlertStatus;
type AlertAction = ClinicalAlertAction;

const STATUS_LABELS: Record<ClinicalAlertStatus, string> = {
  open: "Đang mở",
  acknowledged: "Đã tiếp nhận",
  resolved: "Đã xử lý",
};

function formatDate(value?: string) {
  if (!value) return "Chưa có thời điểm";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Không xác định"
    : date.toLocaleString("vi-VN");
}

function canManageAlerts(capabilities: string[]) {
  return capabilities.some((capability) =>
    ["platform.alerts.manage", "workspace.alerts.manage"].includes(capability),
  );
}

function alertStatusClass(status: ClinicalAlertStatus) {
  if (status === "resolved") {
    return "border-[var(--clinical-success)] text-[var(--clinical-success)]";
  }
  if (status === "acknowledged") return "border-primary text-primary";
  return "border-[var(--clinical-warning)] text-[var(--clinical-warning)]";
}

function severityClass(severity?: string) {
  if (severity === "critical") return "border-destructive text-destructive";
  if (severity === "warning") {
    return "border-[var(--clinical-warning)] text-[var(--clinical-warning)]";
  }
  return "border-border text-muted-foreground";
}

export default function AlertCenterPage() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspace.id || "";
  const [status, setStatus] = useState<AlertFilter>("open");
  const queryKey = portalWorkspaceQueryKey(
    workspaceId,
    "clinical-alert-ledger",
    status,
  );
  const query = useQuery({
    queryKey,
    queryFn: () =>
      smartHealthApi.listClinicalAlerts({
        status: status === "all" ? "" : status,
        limit: 50,
      }),
    enabled: Boolean(workspaceId),
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const alerts = query.data?.alerts || [];
  const canManage = canManageAlerts(user?.capabilities || []);

  return (
    <div className="space-y-5">
      <header className="clinical-page-header flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="clinical-page-title flex items-center gap-2 text-foreground">
            <AlertTriangle aria-hidden="true" size={22} />
            Trung tâm cảnh báo
          </h1>
          <p className="clinical-page-subtitle mt-1 text-sm text-muted-foreground">
            Sổ cảnh báo backend theo trạng thái mở, tiếp nhận và xử lý; không suy diễn từ local state.
          </p>
        </div>
        <div className="w-full space-y-2 sm:w-52">
          <Label htmlFor="alert-status-filter">Trạng thái</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as AlertFilter)}>
            <SelectTrigger id="alert-status-filter" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Đang mở</SelectItem>
              <SelectItem value="acknowledged">Đã tiếp nhận</SelectItem>
              <SelectItem value="resolved">Đã xử lý</SelectItem>
              <SelectItem value="all">Tất cả trạng thái</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {!canManage && !query.error ? (
        <Card role="note" className="shadow-sm">
          <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
            <ShieldAlert aria-hidden="true" className="shrink-0 text-primary" />
            Tài khoản hiện tại chỉ được xem cảnh báo, không được tiếp nhận hoặc xử lý.
          </CardContent>
        </Card>
      ) : null}

      {query.isPending ? (
        <AlertLedgerLoading />
      ) : query.error ? (
        <AlertQueryError error={query.error} retry={() => void query.refetch()} />
      ) : !alerts.length ? (
        <Card role="status" className="shadow-sm">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Không có cảnh báo ở trạng thái đã chọn.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {alerts.map((alert) => (
            <AlertCard
              key={`${alert.id}:${alert.version}`}
              alert={alert}
              canManage={canManage}
              refresh={() => query.refetch()}
              queryKey={queryKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  canManage,
  refresh,
  queryKey,
}: {
  alert: ClinicalAlert;
  canManage: boolean;
  refresh: () => Promise<unknown>;
  queryKey: readonly unknown[];
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState("");
  const intentRef = useRef<ClinicalWorkflowIntent | null>(null);
  const mutation = useMutation({
    mutationFn: (input: {
      action: AlertAction;
      note: string;
      expectedVersion: number;
      idempotencyKey: string;
    }) => {
      const payload = {
        note: input.note,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
      };
      return input.action === "acknowledge"
        ? smartHealthApi.acknowledgeClinicalAlert(alert.id, payload)
        : smartHealthApi.resolveClinicalAlert(alert.id, payload);
    },
    onSuccess: async (result, input) => {
      intentRef.current = null;
      toast.success(
        input.action === "acknowledge"
          ? "Backend đã ghi nhận tiếp nhận cảnh báo"
          : "Backend đã ghi nhận xử lý cảnh báo",
      );
      await queryClient.invalidateQueries({ queryKey });
      return result;
    },
    onError: async (error: ApiError) => {
      if (error.status === 409) {
        intentRef.current = null;
        toast.error("Cảnh báo đã thay đổi. Dữ liệu mới đang được tải lại.");
        await refresh();
      }
    },
  });
  const mutationError = mutation.error as ApiError | null;

  const resetIntent = () => {
    intentRef.current = null;
    setValidationError("");
    mutation.reset();
  };

  const submit = (action: AlertAction) => {
    const trimmedNote = note.trim();
    const actionError = validateClinicalAlertAction(action, trimmedNote);
    if (actionError) {
      setValidationError(actionError);
      return;
    }
    setValidationError("");
    const payload = {
      action,
      note: trimmedNote,
      expectedVersion: alert.version,
    };
    const intent = resolveClinicalWorkflowIntent(
      intentRef.current,
      `alert-${action}-${alert.id}`,
      payload,
    );
    intentRef.current = intent;
    mutation.mutate({ ...payload, idempotencyKey: intent.idempotencyKey });
  };

  const canAcknowledge = canManage && alert.status === "open";
  const canResolve = canManage && ["open", "acknowledged"].includes(alert.status);

  return (
    <Card className="shadow-sm" aria-labelledby={`alert-${alert.id}-heading`}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle id={`alert-${alert.id}-heading`}>
              {alert.title || "Cảnh báo"}
            </CardTitle>
            <CardDescription className="mt-1">
              {formatDate(alert.createdAt)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={severityClass(alert.severity)}>
              {alert.severity || "warning"}
            </Badge>
            <Badge variant="outline" className={alertStatusClass(alert.status)}>
              {alert.status === "resolved" ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <Clock3 aria-hidden="true" />
              )}
              {STATUS_LABELS[alert.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {alert.message ? (
          <p className="text-sm leading-6 text-muted-foreground">{alert.message}</p>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Nguồn</dt>
            <dd className="mt-1 break-all font-medium text-foreground">
              {alert.sourceType || "Không xác định"}: {alert.sourceId || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Phiên bản</dt>
            <dd className="mt-1 font-mono text-foreground">{alert.version}</dd>
          </div>
        </dl>

        {alert.acknowledgedAt ? (
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="font-medium text-foreground">Đã tiếp nhận</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {alert.acknowledgedByUserId || "Không xác định"} · {formatDate(alert.acknowledgedAt)}
            </p>
            {alert.acknowledgementNote ? (
              <p className="mt-2 text-muted-foreground">{alert.acknowledgementNote}</p>
            ) : null}
          </div>
        ) : null}

        {alert.resolvedAt ? (
          <div className="rounded-lg border border-[var(--clinical-success)]/30 bg-muted/20 p-3 text-sm">
            <p className="font-medium text-foreground">Đã xử lý</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {alert.resolvedByUserId || "Không xác định"} · {formatDate(alert.resolvedAt)}
            </p>
            {alert.resolutionNote ? (
              <p className="mt-2 text-muted-foreground">{alert.resolutionNote}</p>
            ) : null}
          </div>
        ) : null}

        {canAcknowledge || canResolve ? (
          <div className="space-y-3 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor={`alert-${alert.id}-note`}>
                Ghi chú xử lý {canResolve ? "(bắt buộc khi đóng cảnh báo)" : ""}
              </Label>
              <Textarea
                id={`alert-${alert.id}-note`}
                rows={3}
                maxLength={2000}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  resetIntent();
                }}
                disabled={mutation.isPending}
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? `alert-${alert.id}-error` : undefined}
              />
              {validationError ? (
                <p id={`alert-${alert.id}-error`} role="alert" className="text-sm text-destructive">
                  {validationError}
                </p>
              ) : null}
            </div>
            {mutationError ? (
              <p role="alert" className="text-sm text-destructive">
                {mutationError.status === 409
                  ? "Dữ liệu đã thay đổi; vui lòng kiểm tra bản mới trước khi gửi lại."
                  : mutationError.message}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              {canAcknowledge ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1"
                  disabled={mutation.isPending}
                  onClick={() => submit("acknowledge")}
                >
                  {mutation.isPending && mutation.variables?.action === "acknowledge" ? (
                    <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Clock3 aria-hidden="true" />
                  )}
                  Tiếp nhận
                </Button>
              ) : null}
              {canResolve ? (
                <Button
                  type="button"
                  className="min-h-11 flex-1"
                  disabled={mutation.isPending}
                  onClick={() => submit("resolve")}
                >
                  {mutation.isPending && mutation.variables?.action === "resolve" ? (
                    <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" />
                  )}
                  Xác nhận đã xử lý
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {alert.scanId ? (
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link to={`/portal/records/${alert.scanId}`}>
              Xem lượt đo liên quan
              <ExternalLink aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AlertLedgerLoading() {
  return (
    <div className="grid gap-4 xl:grid-cols-2" role="status" aria-label="Đang tải sổ cảnh báo">
      <span className="sr-only">Đang tải sổ cảnh báo...</span>
      {[0, 1, 2, 3].map((item) => (
        <Card key={item} className="shadow-sm">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-6 w-2/3 motion-reduce:animate-none" />
            <Skeleton className="h-16 w-full motion-reduce:animate-none" />
            <Skeleton className="h-11 w-full motion-reduce:animate-none" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AlertQueryError({ error, retry }: { error: unknown; retry: () => void }) {
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
            {forbidden ? "Không có quyền truy cập cảnh báo" : "Không thể tải sổ cảnh báo"}
          </p>
          <p className="mt-1 text-sm text-destructive">
            {apiError?.message || "Yêu cầu backend thất bại."}
          </p>
        </div>
        {!forbidden ? (
          <Button variant="outline" className="min-h-11" onClick={retry}>
            <RefreshCw aria-hidden="true" />
            Thử lại
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
