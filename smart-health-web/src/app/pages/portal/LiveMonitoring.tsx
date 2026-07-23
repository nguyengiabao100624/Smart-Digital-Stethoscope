import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Radio,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  PortalEmpty,
  PortalError,
  PortalLoading,
} from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
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
import { smartHealthApi } from "../../../lib/smart-health-api";

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

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <svg
        viewBox="0 0 760 160"
        className="h-44 w-full"
        role="img"
        aria-label={`Dạng sóng âm thanh trực tiếp. Đỉnh ${metrics?.peak ?? 0}, RMS ${metrics?.rms ?? 0}, nhịp ước tính ${metrics?.bpm ?? 0} lần mỗi phút.`}
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
        <Metric label="Đỉnh" value={String(metrics?.peak ?? 0)} />
        <Metric label="RMS" value={String(metrics?.rms ?? 0)} />
        <Metric label="Mức tín hiệu" value={`${metrics?.levelPercent ?? 0}%`} />
        <Metric label="Nhịp ước tính" value={`${metrics?.bpm ?? 0} bpm`} />
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
    return { label: "WSS đã kết nối", tone: "text-success", icon: Wifi };
  if (state === "offline")
    return {
      label: "Thiết bị này đang ngoại tuyến",
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
    queryKey: ["portal", "monitoring", user?.currentWorkspace.id],
    queryFn: smartHealthApi.monitoring,
    refetchInterval: connectionState === "open" ? 15_000 : 5_000,
  });

  const retryRealtime = useCallback(
    () => setRetryKey((value) => value + 1),
    [],
  );

  useEffect(() => {
    const workspaceId = user?.currentWorkspace.id;
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
  }, [query.refetch, retryKey, user?.currentWorkspace.id]);

  if (query.isLoading && !query.data) {
    return <PortalLoading label="Đang tải trạng thái thiết bị…" />;
  }
  if ((query.error || !query.data) && !query.data) {
    return (
      <PortalError
        error={query.error || new Error("Không có dữ liệu monitoring")}
        retry={() => query.refetch()}
      />
    );
  }

  const data = query.data;
  if (!data) return null;
  const online = data.devices.filter(
    (device) => device.online || device.connected,
  );
  const connection = connectionCopy(connectionState);
  const ConnectionIcon = connection.icon;
  const isRecording = Boolean(
    status?.recording && sourceMatchesSession(status.identity, session),
  );

  return (
    <div className="space-y-6">
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
            thiết bị và cảnh báo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium ${connection.tone}`}
          >
            <ConnectionIcon
              size={16}
              className={
                connectionState === "connecting" ||
                connectionState === "reconnecting"
                  ? "motion-safe:animate-spin"
                  : ""
              }
              aria-hidden="true"
            />
            {connection.label}
          </span>
          {connectionState !== "open" ? (
            <button
              type="button"
              onClick={retryRealtime}
              className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Thử lại
            </button>
          ) : null}
        </div>
      </header>

      {connectionError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {connectionError}
        </div>
      ) : null}

      <section
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby="live-waveform-title"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="live-waveform-title"
              className="font-semibold text-foreground"
            >
              Dạng sóng phiên đo
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {session
                ? `Thiết bị ${session.deviceId} · Lượt đo ${session.scanId}`
                : "Đang chờ backend gửi metadata phiên trước dữ liệu PCM."}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${isRecording ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
          >
            {isRecording
              ? "ĐANG GHI"
              : status?.recording
                ? "CHỜ METADATA"
                : "CHƯA CÓ PHIÊN"}
          </span>
        </div>
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
            Phát hiện {droppedPackets} gói âm thanh bị gián đoạn; dạng sóng chỉ
            hiển thị dữ liệu đã nhận hợp lệ.
          </p>
        ) : null}
      </section>

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
              const deviceOnline = Boolean(device.online || device.connected);
              return (
                <article
                  key={device.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-foreground">
                        {device.name || device.id}
                      </h3>
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {device.id}
                      </p>
                    </div>
                    {deviceOnline ? (
                      <Activity
                        className="shrink-0 text-success"
                        size={20}
                        aria-label="Đang online"
                      />
                    ) : (
                      <WifiOff
                        className="shrink-0 text-warning"
                        size={20}
                        aria-label="Đang offline"
                      />
                    )}
                  </div>
                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Audio</dt>
                      <dd className="font-medium text-foreground">
                        {device.audioStatus || "idle"}
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
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby="realtime-alerts-title"
      >
        <h2
          id="realtime-alerts-title"
          className="font-semibold text-foreground"
        >
          Cảnh báo ({data.alerts.length})
        </h2>
        {data.alerts.length ? (
          <div className="mt-4 space-y-2">
            {data.alerts.map((alert, index) => (
              <div
                key={String(alert.id || index)}
                className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground"
              >
                {String(alert.message || alert.title || "Cảnh báo thiết bị")}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Không có cảnh báo đang mở.
          </p>
        )}
      </section>
    </div>
  );
}
