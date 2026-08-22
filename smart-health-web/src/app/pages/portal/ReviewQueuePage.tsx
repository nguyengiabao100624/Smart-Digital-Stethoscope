import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
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
  parseClinicalReviewListResponse,
  parseClinicalReviewMutationResponse,
} from "../../../lib/clinical-workflow-operations";
import {
  resolveClinicalWorkflowIntent,
  type ClinicalWorkflowIntent,
} from "../../../lib/clinical-workflow-intent";
import { validateReviewDecision } from "../../../lib/clinical-workflow-validation";
import {
  smartHealthApi,
  type ApiError,
  type ClinicalReview,
  type ReviewDecision,
} from "../../../lib/smart-health-api";
import { portalWorkspaceQueryKey } from "../../../lib/workspace-query-cache";
import { useAuth } from "../../context/AuthContext";

const DECISION_LABELS: Record<ReviewDecision, string> = {
  accepted: "Chấp nhận kết quả",
  repeat_measurement: "Yêu cầu đo lại",
  follow_up_required: "Cần theo dõi thêm",
};

type ClinicalWorkflowAuthority = {
  workspaceId: string;
  epoch: number;
};

class ClinicalWorkflowSupersededError extends Error {
  constructor() {
    super("Thao tác thuộc workspace trước đã được hủy.");
    this.name = "ClinicalWorkflowSupersededError";
  }
}

function formatDate(value?: string) {
  if (!value) return "Chưa có thời điểm";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Không xác định"
    : date.toLocaleString("vi-VN");
}

function canManageReviews(capabilities: string[]) {
  return capabilities.some((capability) =>
    ["platform.review.manage", "workspace.review.manage"].includes(capability),
  );
}

export default function ReviewQueuePage() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspace.id || "";
  const [status, setStatus] = useState<"pending" | "reviewed">("pending");
  const activeWorkspaceRef = useRef(workspaceId);
  const operationEpochRef = useRef(0);

  useLayoutEffect(() => {
    if (activeWorkspaceRef.current === workspaceId) return;
    activeWorkspaceRef.current = workspaceId;
    operationEpochRef.current += 1;
    setStatus("pending");
  }, [workspaceId]);

  const captureAuthority = (): ClinicalWorkflowAuthority => ({
    workspaceId: activeWorkspaceRef.current,
    epoch: operationEpochRef.current,
  });
  const isAuthorityCurrent = (authority: ClinicalWorkflowAuthority) =>
    authority.workspaceId === activeWorkspaceRef.current &&
    authority.epoch === operationEpochRef.current;

  const queryKey = portalWorkspaceQueryKey(
    workspaceId,
    "clinical-review-queue",
    status,
  );
  const query = useQuery({
    queryKey,
    queryFn: async () =>
      parseClinicalReviewListResponse(
        await smartHealthApi.listReviewQueue({ status, limit: 50 }),
        workspaceId,
      ),
    enabled: Boolean(workspaceId),
    retry: false,
  });
  const reviews = query.data?.reviews || [];
  const canManage = canManageReviews(user?.capabilities || []);

  return (
    <div
      className="space-y-5"
      data-testid="portal-review-queue-page"
      data-workspace-id={workspaceId}
    >
      <header className="clinical-page-header flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="clinical-page-title flex items-center gap-2 text-foreground">
            <AlertTriangle aria-hidden="true" size={22} />
            Hàng đợi cần xem lại
          </h1>
          <p className="clinical-page-subtitle mt-1 text-sm text-muted-foreground">
            Quyết định được lưu cùng người duyệt, thời điểm, phiên bản và audit backend.
          </p>
        </div>
        <div className="w-full space-y-2 sm:w-52">
          <Label htmlFor="review-status-filter">Trạng thái</Label>
          <Select
            value={status}
            onValueChange={(value) => setStatus(value as "pending" | "reviewed")}
          >
            <SelectTrigger id="review-status-filter" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Đang chờ duyệt</SelectItem>
              <SelectItem value="reviewed">Đã duyệt</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {!canManage && !query.error ? (
        <Card role="note" className="shadow-sm">
          <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
            <ShieldAlert aria-hidden="true" className="shrink-0 text-primary" />
            Tài khoản hiện tại chỉ được xem hàng đợi, không được ghi quyết định lâm sàng.
          </CardContent>
        </Card>
      ) : null}

      {query.isPending ? (
        <ReviewQueueLoading />
      ) : query.error ? (
        <ClinicalQueryError
          error={query.error}
          retry={() => void query.refetch()}
          resource="hàng đợi duyệt"
        />
      ) : !reviews.length ? (
        <Card role="status" className="shadow-sm">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {status === "pending"
              ? "Không có lượt đo đang chờ xem lại."
              : "Chưa có quyết định đã duyệt trong phạm vi hiện tại."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {reviews.map((review) => (
            <ReviewCard
              key={`${workspaceId}:${review.id}:${review.version}`}
              review={review}
              workspaceId={workspaceId}
              canManage={canManage}
              refresh={() => query.refetch()}
              captureAuthority={captureAuthority}
              isAuthorityCurrent={isAuthorityCurrent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  workspaceId,
  canManage,
  refresh,
  captureAuthority,
  isAuthorityCurrent,
}: {
  review: ClinicalReview;
  workspaceId: string;
  canManage: boolean;
  refresh: () => Promise<unknown>;
  captureAuthority: () => ClinicalWorkflowAuthority;
  isAuthorityCurrent: (authority: ClinicalWorkflowAuthority) => boolean;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<ReviewDecision>("accepted");
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState("");
  const intentRef = useRef<ClinicalWorkflowIntent | null>(null);
  const reviewed = review.status === "reviewed";
  const mutation = useMutation({
    mutationFn: (input: {
      decision: ReviewDecision;
      note: string;
      expectedVersion: number;
      idempotencyKey: string;
      authority: ClinicalWorkflowAuthority;
    }) =>
      smartHealthApi.decideReview(review.scanId, input).then((response) => {
        const result = parseClinicalReviewMutationResponse(response, {
          workspaceId: input.authority.workspaceId,
          scanId: review.scanId,
          decision: input.decision,
          note: input.note,
          previousVersion: input.expectedVersion,
        });
        if (!isAuthorityCurrent(input.authority)) {
          throw new ClinicalWorkflowSupersededError();
        }
        return { ...result, authority: input.authority };
      }),
    onSuccess: async (result) => {
      if (!isAuthorityCurrent(result.authority)) return;
      intentRef.current = null;
      toast.success("Backend đã ghi nhận quyết định duyệt");
      await queryClient.invalidateQueries({
        queryKey: portalWorkspaceQueryKey(
          result.authority.workspaceId,
          "clinical-review-queue",
        ),
      });
    },
    onError: async (error: ApiError | Error) => {
      if (error instanceof ClinicalWorkflowSupersededError) return;
      if ("status" in error && error.status === 409) {
        intentRef.current = null;
        toast.error("Lượt đo đã thay đổi. Dữ liệu mới đang được tải lại.");
        await refresh();
      }
    },
  });
  const mutationError = mutation.error as ApiError | Error | null;

  const resetIntent = () => {
    intentRef.current = null;
    setValidationError("");
    mutation.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedNote = note.trim();
    const decisionError = validateReviewDecision(decision, trimmedNote);
    if (decisionError) {
      setValidationError(decisionError);
      return;
    }
    setValidationError("");
    const payload = {
      decision,
      note: trimmedNote,
      expectedVersion: review.version,
    };
    const authority = captureAuthority();
    if (
      authority.workspaceId !== workspaceId ||
      !isAuthorityCurrent(authority)
    ) {
      return;
    }
    const intent = resolveClinicalWorkflowIntent(
      intentRef.current,
      `review-${authority.workspaceId}-${review.scanId}`,
      payload,
    );
    intentRef.current = intent;
    mutation.mutate({
      ...payload,
      idempotencyKey: intent.idempotencyKey,
      authority,
    });
  };

  return (
    <Card className="shadow-sm" aria-labelledby={`review-${review.id}-heading`}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle
              id={`review-${review.id}-heading`}
              role="heading"
              aria-level={2}
              className="break-all"
            >
              Lượt đo {review.scanId}
            </CardTitle>
            <CardDescription className="mt-1">
              {formatDate(review.scanCreatedAt || review.createdAt)}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              reviewed
                ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                : "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
            }
          >
            {reviewed ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <Clock3 aria-hidden="true" />
            )}
            {reviewed ? "Đã duyệt" : "Đang chờ"}
          </Badge>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-muted/30 p-3 text-sm">
          <dt className="text-xs text-muted-foreground">Bệnh nhân</dt>
          <dt className="text-xs text-muted-foreground">Thiết bị</dt>
          <dd className="break-all font-medium text-foreground">
            {review.patientId || "Chưa xác định"}
          </dd>
          <dd className="break-all font-mono text-xs text-foreground">
            {review.deviceId || "Chưa xác định"}
          </dd>
        </dl>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviewed ? (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
            <p className="font-semibold text-foreground">
              {review.decision
                ? DECISION_LABELS[review.decision]
                : "Đã duyệt, chưa có nhãn quyết định"}
            </p>
            {review.note ? <p className="text-muted-foreground">{review.note}</p> : null}
            <p className="text-xs text-muted-foreground">
              Người duyệt: {review.reviewerUserId || "Không xác định"} · {formatDate(review.reviewedAt)}
            </p>
          </div>
        ) : canManage ? (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor={`review-${review.id}-decision`}>Quyết định</Label>
              <Select
                value={decision}
                onValueChange={(value) => {
                  setDecision(value as ReviewDecision);
                  resetIntent();
                }}
                disabled={mutation.isPending}
              >
                <SelectTrigger id={`review-${review.id}-decision`} className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accepted">Chấp nhận kết quả</SelectItem>
                  <SelectItem value="repeat_measurement">Yêu cầu đo lại</SelectItem>
                  <SelectItem value="follow_up_required">Cần theo dõi thêm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`review-${review.id}-note`}>
                Ghi chú {decision === "accepted" ? "(không bắt buộc)" : "(bắt buộc)"}
              </Label>
              <Textarea
                id={`review-${review.id}-note`}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  resetIntent();
                }}
                disabled={mutation.isPending}
                rows={3}
                maxLength={4000}
                aria-invalid={Boolean(validationError)}
                aria-describedby={validationError ? `review-${review.id}-error` : undefined}
              />
              {validationError ? (
                <p id={`review-${review.id}-error`} role="alert" className="text-sm text-destructive">
                  {validationError}
                </p>
              ) : null}
            </div>
            {mutationError &&
            !(mutationError instanceof ClinicalWorkflowSupersededError) ? (
              <p role="alert" className="text-sm text-destructive">
                {"status" in mutationError && mutationError.status === 409
                  ? "Dữ liệu đã thay đổi; vui lòng kiểm tra bản mới trước khi gửi lại."
                  : mutationError.message}
              </p>
            ) : null}
            <Button
              type="submit"
              className="min-h-11 w-full sm:w-auto"
              disabled={mutation.isPending}
              aria-busy={mutation.isPending || undefined}
            >
              {mutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
              {mutation.isPending
                ? "Đang ghi nhận..."
                : mutation.isError &&
                    !(
                      mutationError &&
                      "status" in mutationError &&
                      mutationError.status === 409
                    )
                  ? "Thử gửi lại"
                  : "Ghi nhận quyết định"}
            </Button>
          </form>
        ) : null}

        <Button asChild variant="outline" className="min-h-11 w-full">
          <Link to={`/portal/records/${review.scanId}`}>
            Xem chi tiết lượt đo
            <ExternalLink aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewQueueLoading() {
  return (
    <div className="grid gap-4 xl:grid-cols-2" role="status" aria-label="Đang tải hàng đợi duyệt">
      <span className="sr-only">Đang tải hàng đợi duyệt...</span>
      {[0, 1, 2, 3].map((item) => (
        <Card key={item} className="shadow-sm">
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-6 w-2/3 motion-reduce:animate-none" />
            <Skeleton className="h-20 w-full motion-reduce:animate-none" />
            <Skeleton className="h-11 w-full motion-reduce:animate-none" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ClinicalQueryError({
  error,
  retry,
  resource,
}: {
  error: unknown;
  retry: () => void;
  resource: string;
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
            {forbidden ? "Không có quyền truy cập" : `Không thể tải ${resource}`}
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
