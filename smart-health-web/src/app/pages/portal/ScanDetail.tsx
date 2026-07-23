import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Download,
  Headphones,
  Loader2,
  Save,
  Share2,
} from "lucide-react";
import { Link, useParams } from "react-router";
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
import { Progress } from "../../../components/ui/progress";
import { Skeleton } from "../../../components/ui/skeleton";
import { Textarea } from "../../../components/ui/textarea";
import {
  buildScanAudioFilename,
  canShareScanAudio,
  downloadScanAudio,
  shareScanAudio,
} from "../../../lib/scan-audio";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { portalWorkspaceQueryKey } from "../../../lib/workspace-query-cache";
import { useAuth } from "../../context/AuthContext";

export default function ScanDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspace.id || "";
  const client = useQueryClient();
  const scanQueryKey = portalWorkspaceQueryKey(workspaceId, "scan", id);
  const query = useQuery({
    queryKey: scanQueryKey,
    queryFn: () => smartHealthApi.getScan(id),
    enabled: Boolean(workspaceId && id),
    retry: false,
  });
  const [notes, setNotes] = useState("");
  const [audioProgress, setAudioProgress] = useState<{
    loaded: number;
    total: number | null;
    percent: number | null;
  }>({ loaded: 0, total: null, percent: 0 });
  const [audioObjectUrl, setAudioObjectUrl] = useState("");
  const [sharePending, setSharePending] = useState(false);
  const [shareError, setShareError] = useState("");

  useEffect(
    () => setNotes(query.data?.scan.doctorNotes || ""),
    [query.data?.scan.doctorNotes],
  );

  const audioQueryKey = portalWorkspaceQueryKey(
    workspaceId,
    "scan-audio",
    id,
  );
  const audioQuery = useQuery({
    queryKey: audioQueryKey,
    queryFn: ({ signal }) =>
      smartHealthApi.downloadScanAudio(id, {
        signal,
        onProgress: setAudioProgress,
      }),
    enabled: Boolean(workspaceId && id && query.data?.scan.audioUrl),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  });

  useEffect(() => {
    setAudioProgress({ loaded: 0, total: null, percent: 0 });
    setShareError("");
  }, [workspaceId, id]);

  useEffect(() => {
    if (!audioQuery.data) {
      setAudioObjectUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(audioQuery.data);
    setAudioObjectUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [audioQuery.data]);

  const save = useMutation({
    mutationFn: () => smartHealthApi.updateScan(id, { doctorNotes: notes }),
    onSuccess: () => {
      toast.success("Đã lưu nhận xét bác sĩ");
      void client.invalidateQueries({ queryKey: scanQueryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isPending) return <ScanDetailLoading />;
  if (query.error || !query.data) {
    return (
      <ScanDetailError
        error={query.error || new Error("Không tìm thấy lượt đo")}
        retry={() => void query.refetch()}
      />
    );
  }

  const scan = query.data.scan;
  const audioFilename = buildScanAudioFilename(
    scan.id,
    audioQuery.data?.type,
  );
  const shareSupported = Boolean(
    audioQuery.data &&
      typeof navigator !== "undefined" &&
      canShareScanAudio(audioQuery.data, audioFilename, navigator),
  );

  const handleShareOrDownload = async () => {
    if (!audioQuery.data || !audioObjectUrl) return;
    setSharePending(true);
    setShareError("");
    try {
      const result = await shareScanAudio(
        audioQuery.data,
        audioFilename,
        `Âm thanh lượt đo ${scan.id}`,
        navigator,
      );
      if (result === "unsupported") {
        downloadScanAudio(audioObjectUrl, audioFilename);
      } else if (result === "shared") {
        toast.success("Đã chia sẻ tệp âm thanh");
      }
    } catch (error) {
      setShareError(
        error instanceof Error
          ? error.message
          : "Không thể chia sẻ tệp âm thanh.",
      );
    } finally {
      setSharePending(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Button asChild variant="ghost" className="min-h-11 px-2">
        <Link to="/portal/records">
          <ArrowLeft aria-hidden="true" />
          Lượt đo & hồ sơ
        </Link>
      </Button>

      <header className="clinical-page-header">
        <h1 className="clinical-page-title flex items-center gap-2 text-foreground">
          <Activity aria-hidden="true" size={22} />
          Chi tiết lượt đo
        </h1>
        <p className="clinical-page-subtitle mt-1 break-all font-mono text-xs text-muted-foreground">
          {scan.id}
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Bệnh nhân", scan.patient?.name || scan.patientId],
          ["Thiết bị", scan.deviceId],
          ["Vị trí", scan.bodySite],
          ["BPM", scan.bpm],
        ].map(([label, value]) => (
          <Card key={String(label)} className="shadow-sm">
            <CardContent className="p-4">
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-2 break-words font-semibold text-foreground">
                {value || "—"}
              </dd>
            </CardContent>
          </Card>
        ))}
      </dl>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="shadow-sm" aria-labelledby="scan-ai-heading">
          <CardHeader>
            <CardTitle id="scan-ai-heading">Phân tích chất lượng tín hiệu</CardTitle>
            <CardDescription>
              Bộ quy tắc cục bộ chỉ đánh giá chất lượng bản ghi, không đưa ra chẩn đoán.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xl font-bold text-primary">
              {scan.aiLabel || "Chưa có kết quả"}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              {scan.aiSummary || "Backend chưa trả về tóm tắt chất lượng tín hiệu."}
            </p>
            {scan.aiConfidence != null ? (
              <Badge variant="outline">
                Độ tin cậy: {Math.round(scan.aiConfidence * 100)}%
              </Badge>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-sm" aria-labelledby="scan-notes-heading">
          <CardHeader>
            <CardTitle id="scan-notes-heading">Nhận xét bác sĩ</CardTitle>
            <CardDescription>
              Nhận xét được lưu vào lượt đo trong workspace hiện tại.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="sr-only" htmlFor="scan-review-notes">
              Nội dung nhận xét bác sĩ
            </label>
            <Textarea
              id="scan-review-notes"
              name="scanReviewNotes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={6}
              className="min-h-32 resize-y"
            />
            <Button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="mt-3 min-h-11"
              aria-busy={save.isPending || undefined}
            >
              {save.isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Save aria-hidden="true" />
              )}
              {save.isPending ? "Đang lưu..." : "Lưu nhận xét"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm" aria-labelledby="scan-audio-heading">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle id="scan-audio-heading" className="flex items-center gap-2">
              <Headphones aria-hidden="true" />
              Âm thanh lượt đo
            </CardTitle>
            <CardDescription className="mt-1">
              Tệp chỉ được tải sau khi backend xác thực quyền trong workspace hiện tại.
            </CardDescription>
          </div>
          {audioObjectUrl && audioQuery.data ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="min-h-11"
                disabled={sharePending}
                onClick={() => void handleShareOrDownload()}
              >
                {sharePending ? (
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : shareSupported ? (
                  <Share2 aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
                {sharePending
                  ? "Đang mở chia sẻ..."
                  : shareSupported
                    ? "Chia sẻ"
                    : "Tải xuống"}
              </Button>
              {shareSupported ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => downloadScanAudio(audioObjectUrl, audioFilename)}
                >
                  <Download aria-hidden="true" />
                  Tải xuống
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {!scan.audioUrl ? (
            <div
              className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground"
              role="status"
            >
              Lượt đo chưa có tệp âm thanh khả dụng.
            </div>
          ) : audioQuery.isPending ? (
            <div role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                  Đang tải âm thanh có xác thực
                </span>
                <span>
                  {audioProgress.percent == null
                    ? `${Math.round(audioProgress.loaded / 1024)} KB`
                    : `${audioProgress.percent}%`}
                </span>
              </div>
              <Progress
                className="mt-3"
                value={audioProgress.percent ?? 0}
                aria-label="Tiến trình tải âm thanh"
                aria-valuetext={
                  audioProgress.percent == null
                    ? `${Math.round(audioProgress.loaded / 1024)} KB đã tải`
                    : `${audioProgress.percent}%`
                }
              />
            </div>
          ) : audioQuery.error ? (
            <InlineError
              error={audioQuery.error}
              retry={() => {
                setAudioProgress({ loaded: 0, total: null, percent: 0 });
                void audioQuery.refetch();
              }}
            />
          ) : audioObjectUrl ? (
            <audio
              controls
              preload="metadata"
              src={audioObjectUrl}
              className="w-full"
              aria-label={`Âm thanh lượt đo ${scan.id}`}
            />
          ) : null}

          {shareError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {shareError}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ScanDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5" role="status" aria-label="Đang tải chi tiết lượt đo">
      <span className="sr-only">Đang tải chi tiết lượt đo...</span>
      <Skeleton className="h-8 w-56 motion-reduce:animate-none" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-24 motion-reduce:animate-none" />
        ))}
      </div>
      <Skeleton className="h-64 motion-reduce:animate-none" />
    </div>
  );
}

function ScanDetailError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <Card role="alert" className="mx-auto max-w-5xl border-destructive/40 shadow-sm">
      <CardContent className="flex flex-wrap items-center gap-3 p-5">
        <AlertCircle aria-hidden="true" className="text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Không thể tải chi tiết lượt đo</p>
          <p className="mt-1 text-sm text-destructive">
            {error instanceof Error ? error.message : "Yêu cầu backend thất bại."}
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={retry}>
          Thử lại
        </Button>
      </CardContent>
    </Card>
  );
}

function InlineError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="text-destructive" />
      <p className="min-w-0 flex-1 text-sm text-destructive">
        {error instanceof Error ? error.message : "Không thể tải tệp âm thanh."}
      </p>
      <Button variant="outline" className="min-h-11" onClick={retry}>
        Thử lại
      </Button>
    </div>
  );
}
