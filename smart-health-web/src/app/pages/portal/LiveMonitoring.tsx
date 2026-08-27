import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Radio,
  RefreshCw,
  ShieldAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

import {
  PortalEmpty,
  PortalLoading,
} from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
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
  LiveAudioFrameGuard,
  LiveAudioIdentityGuard,
  appendWaveformSamples,
  decodeAudioFrameV2,
  parseAudioSessionMetadata,
  parseLiveMetricsMessage,
  parseLiveStatusMessage,
  type AudioSessionMetadata,
  type LiveAudioSourceIdentity,
  type LiveMetricsMessage,
  type LiveStatusMessage,
} from "../../../lib/live-audio";
import {
  smartHealthApi,
  type ApiError,
  type ClinicalAlert,
} from "../../../lib/smart-health-api";

type ConnectionState =
  | "connecting"
  | "open"
  | "reconnecting"
  | "offline"
  | "error";

function Waveform({
  samples,
  metrics,
}: {
  samples: readonly number[];
  metrics: LiveMetricsMessage | null;
}) {
  const points = useMemo(() => {
    if (!samples.length) return "0,80 760,80";
    const width = 760;
    const height = 160;
    const stride = Math.max(1, Math.floor(samples.length / width));
    const visible = samples
      .filter((_, index) => index % stride === 0)
      .slice(-width);
    return visible
      .map((sample, index) => {
        const x =
          visible.length === 1 ? 0 : (index / (visible.length - 1)) * width;
        const y = height / 2 - (sample / 32768) * (height / 2 - 8);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [samples]);

  const accessibleSummary = metrics
    ? `Dạng sóng âm thanh trực tiếp. Đỉnh ${metrics.peak}, RMS ${metrics.rms}, mức tín hiệu ${metrics.levelPercent} phần trăm, nhịp ước tính ${metrics.bpm} lần mỗi phút.`
    : "Dạng sóng âm thanh trực tiếp. Chưa có dữ liệu metric được backend xác nhận.";

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <svg
        viewBox="0 0 760 160"
        className="h-44 w-full"
        role="img"
        aria-label={accessibleSummary}
        preserveAspectRatio="none"
      >
        <line x1="0" y1="80" x2="760" y2="80" className="stroke-border" />
        <polyline
          points={points}
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric
          label="Đỉnh"
          value={metrics ? String(metrics.peak) : "Chưa có dữ liệu"}
        />
        <Metric
          label="RMS"
          value={metrics ? String(metrics.rms) : "Chưa có dữ liệu"}
        />
        <Metric
          label="Mức tín hiệu"
          value={metrics ? `${metrics.levelPercent}%` : "Chưa có dữ liệu"}
        />
        <Metric
          label="Nhịp ước tính"
          value={metrics ? `${metrics.bpm} bpm` : "Chưa có dữ liệu"}
        />
      </dl>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function connectionCopy(state: ConnectionState) {
  if (state === "open")
    return { label: "WSS đã xác thực", tone: "text-success", icon: Wifi };
  if (state === "offline")
    return {
      label: "Trình duyệt đang ngoại tuyến",
      tone: "text-warning",
      icon: WifiOff,
    };
  if (state === "error")
    return {
      label: "Kết nối realtime lỗi",
      tone: "text-destructive",
      icon: AlertTriangle,
    };
  return {
    label: state === "reconnecting" ? "Đang kết nối lại…" : "Đang kết nối WSS…",
    tone: "text-info",
    icon: RefreshCw,
  };
}

const ALERT_STATUS_LABELS = {
  open: "Đang mở",
  acknowledged: "Đã tiếp nhận",
  resolved: "Đã xử lý",
} as const;

function severityLabel(severity?: string) {
  if (severity === "critical") return "Khẩn cấp";
  if (severity === "warning") return "Cảnh báo";
  if (severity === "info") return "Thông tin";
  return "Chưa phân loại";
}

function severityClass(severity?: string) {
  if (severity === "critical")
    return "border-destructive/40 bg-destructive/10 text-destructive";
  if (severity === "warning")
    return "border-warning/40 bg-warning/10 text-warning";
  return "border-info/40 bg-info/10 text-info";
}

function alertStatusClass(status: ClinicalAlert["status"]) {
  if (status === "resolved")
    return "border-success/40 bg-success/10 text-success";
  if (status === "acknowledged")
    return "border-info/40 bg-info/10 text-info";
  return "border-warning/40 bg-warning/10 text-warning";
}

function audioStatusLabel(status?: string) {
  if (!status || status === "idle") return "Không truyền âm thanh";
  if (status === "streaming" || status === "recording")
    return "Đang truyền âm thanh";
  if (status === "degraded") return "Tín hiệu suy giảm";
  if (status === "error" || status === "failed") return "Có lỗi";
  return "Chưa xác định";
}

function formatTimestamp(value?: string) {
  if (!value) return "Chưa xác định";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Chưa xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(parsed);
}

function MonitoringQueryError({
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
          <AlertTriangle aria-hidden="true" className="text-destructive" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">
            {forbidden
              ? "Không có quyền xem theo dõi trực tiếp"
              : "Không thể tải trạng thái theo dõi"}
          </p>
          <p className="mt-1 text-sm text-destructive">
            {apiError?.message || "Yêu cầu backend thất bại."}
          </p>
          {apiError?.requestId ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              Request ID: {apiError.requestId}
            </p>
          ) : null}
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

function sourceMatchesSession(
  identity: LiveAudioSourceIdentity | null,
  session: AudioSessionMetadata | null,
) {
  return Boolean(
    identity &&
      session &&
      identity.workspaceId === session.workspaceId &&
      identity.patientId === session.patientId &&
      identity.deviceId === session.deviceId &&
      identity.scanId === session.scanId &&
      identity.sessionId === session.sessionId,
  );
}

function scanIdFromEvent(message: Record<string, unknown>) {
  if (!message.scan || typeof message.scan !== "object") return "";
  const scanId = (message.scan as Record<string, unknown>).id;
  return typeof scanId === "string" ? scanId : "";
}

export default function LiveMonitoringPage() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspace.id || "";
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [connectionError, setConnectionError] = useState("");
  const [session, setSession] = useState<AudioSessionMetadata | null>(null);
  const [status, setStatus] = useState<LiveStatusMessage | null>(null);
  const [metrics, setMetrics] = useState<LiveMetricsMessage | null>(null);
  const [samples, setSamples] = useState<number[]>([]);
  const [droppedPackets, setDroppedPackets] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);

  const query = useQuery({
    queryKey: ["portal", "workspace", workspaceId, "monitoring"],
    queryFn: () => smartHealthApi.monitoring(workspaceId),
    enabled: Boolean(workspaceId),
    refetchInterval: connectionState === "open" ? 15_000 : 5_000,
  });

  const retryRealtime = useCallback(
    () => setRetryKey((value) => value + 1),
    [],
  );

  useEffect(() => {
    if (!workspaceId) return undefined;

    let disposed = false;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    let animationFrame: number | null = null;
    let pendingSamples: number[] = [];
    let activeSession: AudioSessionMetadata | null = null;
    let latestStatus: LiveStatusMessage | null = null;
    const identity = new LiveAudioIdentityGuard();
    const frameGuard = new LiveAudioFrameGuard();

    const cancelSampleFlush = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      pendingSamples = [];
    };

    const clearAudioSession = () => {
      cancelSampleFlush();
      identity.reset();
      frameGuard.reset();
      activeSession = null;
      setSession(null);
      setMetrics(null);
      setSamples([]);
      setDroppedPackets(0);
    };

    const clearRealtimeSource = () => {
      clearAudioSession();
      latestStatus = null;
      setStatus(null);
    };

    const queueWaveformSamples = (incoming: readonly number[]) => {
      pendingSamples = appendWaveformSamples(pendingSamples, incoming, 2_048);
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        const nextSamples = pendingSamples;
        pendingSamples = [];
        if (!disposed && nextSamples.length) {
          setSamples((current) =>
            appendWaveformSamples(current, nextSamples),
          );
        }
      });
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      if (!window.navigator.onLine) {
        setConnectionState("offline");
        return;
      }
      reconnectAttempt += 1;
      setConnectionState("reconnecting");
      const delay = Math.min(
        15_000,
        1_000 * 2 ** Math.min(reconnectAttempt - 1, 4),
      );
      reconnectTimer = window.setTimeout(connect, delay);
    };

    const handleTextMessage = (raw: string) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error("Backend gửi realtime message không hợp lệ.");
      }

      if (message.type === "audio.session") {
        const nextSession = parseAudioSessionMetadata(message);
        if (nextSession.workspaceId !== workspaceId) {
          throw new Error(
            "Backend gửi phiên âm thanh ngoài workspace hiện tại.",
          );
        }
        if (
          latestStatus?.recording &&
          !sourceMatchesSession(latestStatus.identity, nextSession)
        ) {
          throw new Error(
            "Metadata phiên âm thanh không khớp nguồn realtime đang hoạt động.",
          );
        }
        const isNewSession = !sourceMatchesSession(nextSession, activeSession);
        identity.acceptSession(nextSession);
        activeSession = nextSession;
        setSession(nextSession);
        if (isNewSession) {
          cancelSampleFlush();
          frameGuard.reset();
          setMetrics(null);
          setSamples([]);
          setDroppedPackets(0);
        }
        return;
      }
      if (message.type === "status") {
        const nextStatus = parseLiveStatusMessage(message, workspaceId);
        if (!nextStatus.recording) {
          clearAudioSession();
          latestStatus = nextStatus;
          setStatus(nextStatus);
          return;
        }
        if (
          activeSession &&
          !sourceMatchesSession(nextStatus.identity, activeSession)
        ) {
          throw new Error(
            "Trạng thái realtime không khớp metadata phiên âm thanh.",
          );
        }
        latestStatus = nextStatus;
        setStatus(nextStatus);
        return;
      }
      if (message.type === "metrics") {
        const currentSession = identity.requireSession();
        setMetrics(
          parseLiveMetricsMessage(message, workspaceId, currentSession),
        );
        return;
      }
      if (
        message.type === "scan_start_accepted" ||
        message.type === "scan_started"
      ) {
        void query.refetch();
        return;
      }
      if (
        message.type === "scan_stopped" ||
        message.type === "scan_interrupted"
      ) {
        const eventScanId = scanIdFromEvent(message);
        if (!eventScanId) {
          throw new Error("Sự kiện kết thúc lượt đo thiếu scan ID.");
        }
        if (!activeSession || activeSession.scanId === eventScanId) {
          clearRealtimeSource();
        }
        void query.refetch();
        return;
      }
      if (message.type === "error") {
        throw new Error(
          typeof message.message === "string"
            ? message.message
            : "Backend báo lỗi realtime không xác định.",
        );
      }
    };

    const connect = () => {
      if (
        disposed ||
        socketRef.current?.readyState === WebSocket.OPEN ||
        socketRef.current?.readyState === WebSocket.CONNECTING
      )
        return;
      if (!window.navigator.onLine) {
        setConnectionState("offline");
        return;
      }

      window.clearTimeout(reconnectTimer);
      setConnectionState(reconnectAttempt ? "reconnecting" : "connecting");
      setConnectionError("");
      clearRealtimeSource();

      try {
        const connection = smartHealthApi.getRealtimeConnection();
        const socket = new WebSocket(connection.url, connection.protocols);
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;

        socket.onopen = () => {
          if (disposed) return;
          reconnectAttempt = 0;
          setConnectionState("open");
          setConnectionError("");
        };
        socket.onmessage = (event) => {
          if (disposed) return;
          try {
            if (typeof event.data === "string") {
              handleTextMessage(event.data);
              return;
            }
            if (!(event.data instanceof ArrayBuffer)) {
              throw new Error(
                "Backend gửi khung âm thanh ở định dạng trình duyệt không hỗ trợ.",
              );
            }
            const currentSession = identity.requireSession();
            const frame = decodeAudioFrameV2(event.data);
            const result = frameGuard.accept(frame, currentSession);
            if (result.droppedPackets) {
              setDroppedPackets(
                (current) => current + result.droppedPackets,
              );
            }
            queueWaveformSamples(frame.samples);
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Luồng realtime không hợp lệ.";
            setConnectionError(message);
            setConnectionState("error");
            socket.close(1008, "REALTIME_CONTRACT_ERROR");
          }
        };
        socket.onerror = () => {
          if (!disposed)
            setConnectionError(
              "Không thể duy trì kết nối realtime với backend.",
            );
        };
        socket.onclose = () => {
          if (disposed || socketRef.current !== socket) return;
          socketRef.current = null;
          clearRealtimeSource();
          scheduleReconnect();
        };
      } catch (error) {
        setConnectionError(
          error instanceof Error
            ? error.message
            : "Không thể tạo kết nối realtime.",
        );
        setConnectionState("error");
        scheduleReconnect();
      }
    };

    const handleOffline = () => {
      window.clearTimeout(reconnectTimer);
      setConnectionState("offline");
      socketRef.current?.close(1000, "OFFLINE");
    };
    const handleOnline = () => {
      reconnectAttempt = 0;
      connect();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    connect();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close(1000, "PAGE_CLOSED");
      cancelSampleFlush();
      identity.reset();
      frameGuard.reset();
    };
  }, [query.refetch, retryKey, workspaceId]);

  if (query.isLoading && !query.data) {
    return <PortalLoading label="Đang tải trạng thái thiết bị…" />;
  }
  if ((query.error || !query.data) && !query.data) {
    return (
      <MonitoringQueryError
        error={query.error || new Error("Không có dữ liệu monitoring")}
        retry={() => query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data) return null;
  const online = data.devices.filter((device) => device.online);
  const activeAlerts = data.alerts.filter(
    (alert) => alert.status !== "resolved",
  );
  const connection = connectionCopy(connectionState);
  const ConnectionIcon = connection.icon;
  const isRecording = Boolean(
    status?.recording && sourceMatchesSession(status.identity, session),
  );
  const restFallbackStatus =
    connectionState === "open" ? null : data.status;
  const restFallbackRecording = Boolean(restFallbackStatus?.recording);

  return (
    <div
      className="space-y-6"
      data-testid="portal-live-monitoring-page"
      data-workspace-id={workspaceId}
    >
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            <Radio size={18} aria-hidden="true" />
            Realtime lâm sàng
          </div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            Theo dõi trực tiếp
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            WSS là nguồn realtime chính. REST chỉ làm fallback cho trạng thái
            thiết bị, cảnh báo và không tạo dạng sóng hay metric.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Snapshot REST: {formatTimestamp(data.generatedAt)}
            {query.isFetching ? " · Đang đồng bộ" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            role="status"
            aria-live="polite"
            className={`min-h-11 gap-2 rounded-full bg-card px-4 text-sm ${connection.tone}`}
          >
            <ConnectionIcon
              size={16}
              className={
                connectionState === "connecting" ||
                connectionState === "reconnecting"
                  ? "motion-safe:animate-spin"
                  : ""
              }
              aria-label={
                connectionState === "offline"
                  ? "Trình duyệt ngoại tuyến"
                  : undefined
              }
              aria-hidden={connectionState !== "offline"}
            />
            {connection.label}
          </Badge>
          {connectionState !== "open" ? (
            <Button
              type="button"
              variant="outline"
              onClick={retryRealtime}
              className="min-h-11"
            >
              <RefreshCw aria-hidden="true" />
              Kết nối lại
            </Button>
          ) : null}
        </div>
      </header>

      {query.error && data ? (
        <Card
          role="alert"
          className="border-warning/40 bg-warning/5 shadow-sm"
        >
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <AlertTriangle aria-hidden="true" className="text-warning" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">
                Đang hiển thị snapshot gần nhất
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Không thể làm mới dữ liệu REST. Thông tin thiết bị và cảnh báo
                có thể đã cũ.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => query.refetch()}
            >
              <RefreshCw aria-hidden="true" />
              Thử lại REST
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {connectionError ? (
        <Card role="alert" className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-destructive"
            />
            <div>
              <p className="font-semibold text-foreground">
                Luồng WSS chưa sẵn sàng
              </p>
              <p className="mt-1 text-destructive">{connectionError}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {restFallbackRecording ? (
        <Card
          role="status"
          className="border-info/40 bg-info/5 shadow-sm"
          data-testid="rest-recording-fallback"
        >
          <CardContent className="flex items-start gap-3 p-4">
            <Radio aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
            <div>
              <p className="font-semibold text-foreground">
                REST báo có phiên đang ghi
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Đây chỉ là snapshot trạng thái. Dạng sóng và metric vẫn để
                trống cho đến khi WSS xác thực gửi đúng metadata nguồn.
              </p>
              {restFallbackStatus?.identity ? (
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  Thiết bị {restFallbackStatus.identity.deviceId} · Lượt đo{" "}
                  {restFallbackStatus.identity.scanId}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card
        aria-labelledby="live-waveform-title"
      >
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle
              id="live-waveform-title"
              role="heading"
              aria-level={2}
            >
              Dạng sóng phiên đo
            </CardTitle>
            <CardDescription className="mt-1">
              {session
                ? `Thiết bị ${session.deviceId} · Lượt đo ${session.scanId}`
                : "Đang chờ backend gửi metadata phiên trước dữ liệu PCM."}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              isRecording
                ? "border-success/40 bg-success/10 text-success"
                : restFallbackRecording
                  ? "border-info/40 bg-info/10 text-info"
                  : "text-muted-foreground"
            }
          >
            {isRecording
              ? "ĐANG GHI"
              : status?.recording
                ? "CHỜ METADATA"
                : restFallbackRecording
                  ? "REST CHỈ BÁO TRẠNG THÁI"
                : "CHƯA CÓ PHIÊN"}
          </Badge>
        </CardHeader>
        <CardContent>
          <Waveform samples={samples} metrics={metrics} />
          {session ? (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Workspace" value={session.workspaceId} />
              <Metric label="Bệnh nhân" value={session.patientId} />
              <Metric label="Thiết bị" value={session.deviceId} />
              <Metric label="Protocol" value="SHC2 · PCM16 · 16 kHz" />
            </dl>
          ) : null}
          {droppedPackets > 0 ? (
            <p className="mt-3 text-sm text-warning" role="status">
              Phát hiện {droppedPackets} gói âm thanh bị gián đoạn; dạng sóng
              chỉ hiển thị dữ liệu đã nhận hợp lệ.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!data.devices.length ? (
        <PortalEmpty label="Workspace chưa có thiết bị." />
      ) : (
        <section aria-labelledby="device-presence-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="device-presence-title"
              className="font-semibold text-foreground"
            >
              Trạng thái thiết bị
            </h2>
            <span className="text-sm text-muted-foreground">
              Online {online.length}/{data.devices.length}
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.devices.map((device) => {
              const deviceOnline = device.online;
              return (
                <Card
                  key={device.id}
                  role="article"
                  aria-labelledby={`device-${device.id}-title`}
                  className="shadow-sm"
                >
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                    <div className="min-w-0">
                      <CardTitle
                        id={`device-${device.id}-title`}
                        role="heading"
                        aria-level={3}
                        className="truncate"
                      >
                        {device.name || device.id}
                      </CardTitle>
                      <CardDescription className="mt-1 truncate font-mono text-xs">
                        {device.id}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        deviceOnline
                          ? "gap-1.5 border-success/40 bg-success/10 text-success"
                          : "gap-1.5 border-warning/40 bg-warning/10 text-warning"
                      }
                    >
                      {deviceOnline ? (
                        <Activity aria-hidden="true" />
                      ) : (
                        <WifiOff
                          aria-label="Đang offline"
                          className="shrink-0"
                        />
                      )}
                      {deviceOnline ? "Online" : "Offline"}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Audio</dt>
                      <dd className="font-medium text-foreground">
                        {audioStatusLabel(device.audioStatus)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Pin</dt>
                      <dd className="font-medium text-foreground">
                        {typeof device.battery === "number"
                          ? `${device.battery}%`
                          : "Chưa báo cáo"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">IP</dt>
                      <dd className="truncate font-medium text-foreground">
                        {device.ipAddress || "Chưa báo cáo"}
                      </dd>
                    </div>
                    </dl>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <Card
        aria-labelledby="realtime-alerts-title"
      >
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle
              id="realtime-alerts-title"
              role="heading"
              aria-level={2}
            >
              Cảnh báo cần xử lý ({activeAlerts.length})
            </CardTitle>
            <CardDescription>
              Trạng thái từ ledger backend; thao tác xử lý nằm tại Trung tâm
              cảnh báo.
            </CardDescription>
          </div>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/portal/alerts">Mở sổ cảnh báo</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {activeAlerts.length ? (
            <div className="space-y-3">
              {activeAlerts.map((alert) => (
                <article
                  key={alert.id}
                  className="rounded-lg border bg-muted/20 p-4"
                  aria-labelledby={`live-alert-${alert.id}-title`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3
                        id={`live-alert-${alert.id}-title`}
                        className="font-semibold text-foreground"
                      >
                        {alert.title || "Cảnh báo chưa có tiêu đề"}
                      </h3>
                      {alert.message ? (
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                          {alert.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className={severityClass(alert.severity)}
                      >
                        {severityLabel(alert.severity)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={alertStatusClass(alert.status)}
                      >
                        {ALERT_STATUS_LABELS[alert.status]}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatTimestamp(alert.occurredAt || alert.createdAt)} ·
                    Nguồn {alert.sourceType || "chưa xác định"}:{" "}
                    {alert.sourceId || "chưa xác định"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Không có cảnh báo đang mở hoặc đã tiếp nhận.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
