import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BatteryWarning,
  CircleAlert,
  CircleCheck,
  Cpu,
  Clock3,
  Info,
  Loader2,
  MemoryStick,
  Plus,
  Radio,
  RotateCw,
  Stethoscope,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "../../../components/ui/card";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  smartHealthApi,
  type ApiError,
  type Device,
  type DeviceCommand,
  type DeviceCommandState,
  type DeviceCommandType,
} from "../../../lib/smart-health-api";
import { useAuth } from "../../context/AuthContext";

const COMMAND_POLL_INTERVAL_MS = 2_000;
const COMMAND_POLL_MAX_DURATION_MS = 45_000;
const TERMINAL_COMMAND_STATES = new Set<DeviceCommandState>([
  "applied",
  "failed",
  "expired",
]);

type StatusTone = "info" | "success" | "warning" | "danger" | "neutral";

interface CommandOperation {
  type: DeviceCommandType;
  idempotencyKey: string;
  sending: boolean;
  command?: DeviceCommand;
  error?: string;
}

const COMMAND_COPY: Record<
  DeviceCommandState,
  { label: string; message: string; tone: StatusTone }
> = {
  accepted: {
    label: "Đã chấp nhận",
    message: "Backend đã chấp nhận lệnh — đang chờ chuyển tới thiết bị.",
    tone: "info",
  },
  queued: {
    label: "Đang chờ truyền",
    message: "Lệnh đang chờ kênh truyền khả dụng; thiết bị chưa xác nhận.",
    tone: "warning",
  },
  delivered: {
    label: "Đã chuyển",
    message: "Đã chuyển tới thiết bị — chờ xác nhận đã nhận lệnh.",
    tone: "info",
  },
  acknowledged: {
    label: "Đã nhận",
    message: "Thiết bị đã nhận lệnh — chưa bắt đầu áp dụng.",
    tone: "info",
  },
  applying: {
    label: "Đang áp dụng",
    message: "Thiết bị đang áp dụng lệnh; vui lòng chờ kết quả cuối.",
    tone: "warning",
  },
  applied: {
    label: "Đã áp dụng",
    message: "Thiết bị đã áp dụng lệnh thành công.",
    tone: "success",
  },
  failed: {
    label: "Thất bại",
    message: "Thiết bị báo không thể hoàn tất lệnh.",
    tone: "danger",
  },
  expired: {
    label: "Hết hạn",
    message: "Lệnh đã hết thời gian chờ mà chưa được thiết bị áp dụng.",
    tone: "neutral",
  },
};

const COMMAND_TYPE_LABELS: Record<DeviceCommandType, string> = {
  restart: "Khởi động lại thiết bị",
  "wifi.status": "Kiểm tra trạng thái Wi-Fi",
  "device.lock": "Khóa thiết bị",
  "device.revoke": "Thu hồi thiết bị",
  "wifi.update": "Cập nhật Wi-Fi",
  "ota.update": "Cập nhật firmware",
  "audio.session.start": "Bắt đầu phiên âm thanh",
  "audio.session.stop": "Dừng phiên âm thanh",
};

const STATUS_TOKENS: Record<
  StatusTone,
  { background: string; border: string; foreground: string }
> = {
  info: {
    background: "var(--status-info-bg)",
    border: "var(--status-info-border)",
    foreground: "var(--status-info-fg)",
  },
  success: {
    background: "var(--status-success-bg)",
    border: "var(--status-success-border)",
    foreground: "var(--status-success-fg)",
  },
  warning: {
    background: "var(--status-warning-bg)",
    border: "var(--status-warning-border)",
    foreground: "var(--status-warning-fg)",
  },
  danger: {
    background: "var(--status-danger-bg)",
    border: "var(--status-danger-border)",
    foreground: "var(--status-danger-fg)",
  },
  neutral: {
    background: "var(--clinical-canvas-raised)",
    border: "var(--clinical-line)",
    foreground: "var(--clinical-muted)",
  },
};

function isTerminalCommand(command?: DeviceCommand | null) {
  return Boolean(command && TERMINAL_COMMAND_STATES.has(command.state));
}

export function deviceCommandPollInterval(
  command: DeviceCommand,
  pollingStartedAt: number,
  now = Date.now(),
) {
  if (isTerminalCommand(command)) return false;
  const parsedExpiry = Date.parse(command.expiresAt);
  const boundedDeadline = pollingStartedAt + COMMAND_POLL_MAX_DURATION_MS;
  const deadline = Number.isFinite(parsedExpiry)
    ? Math.min(parsedExpiry, boundedDeadline)
    : boundedDeadline;
  return now >= deadline ? false : COMMAND_POLL_INTERVAL_MS;
}

function createCommandIdempotencyKey(
  deviceId: string,
  type: DeviceCommandType,
) {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `web:${deviceId}:${type}:${randomPart}`.slice(0, 160);
}

function submissionErrorMessage(error: unknown) {
  if (
    (error as ApiError | undefined)?.code === "DEVICE_COMMAND_DEVICE_OFFLINE"
  ) {
    return "Backend xác nhận thiết bị đang Offline. Hãy chờ thiết bị kết nối lại rồi thử gửi lại.";
  }
  return "Chưa xác định backend đã nhận lệnh hay chưa. Thử gửi lại sẽ dùng cùng mã chống trùng.";
}

export default function DevicesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [operations, setOperations] = useState<
    Record<string, CommandOperation>
  >({});
  const inFlightDevices = useRef(new Set<string>());
  const canManage = Boolean(
    user?.capabilities.includes("workspace.devices.manage") ||
    user?.capabilities.includes("platform.devices.manage"),
  );
  const canClaim = Boolean(
    user?.capabilities.includes("workspace.devices.view") ||
    user?.capabilities.includes("workspace.devices.manage") ||
    user?.capabilities.includes("platform.devices.manage") ||
    user?.capabilities.includes("personal.devices.manage"),
  );
  const devices = useQuery({
    queryKey: ["portal", "devices", user?.currentWorkspace.id],
    queryFn: smartHealthApi.listDevices,
    refetchInterval: 15_000,
  });

  const submitCommand = useCallback(
    async (
      deviceId: string,
      type: DeviceCommandType,
      existingIdempotencyKey?: string,
    ) => {
      if (inFlightDevices.current.has(deviceId)) return;
      const idempotencyKey =
        existingIdempotencyKey || createCommandIdempotencyKey(deviceId, type);
      inFlightDevices.current.add(deviceId);
      setOperations((current) => ({
        ...current,
        [deviceId]: {
          type,
          idempotencyKey,
          sending: true,
          ...(existingIdempotencyKey && current[deviceId]?.command
            ? { command: current[deviceId].command }
            : {}),
        },
      }));

      try {
        const result = await smartHealthApi.sendDeviceCommand(deviceId, {
          type,
          payload: {},
          idempotencyKey,
        });
        setOperations((current) => ({
          ...current,
          [deviceId]: {
            type,
            idempotencyKey,
            sending: false,
            command: result.command,
          },
        }));
        queryClient.setQueryData(
          ["portal", "device-command", deviceId, result.command.id],
          { command: result.command },
        );
        void queryClient.invalidateQueries({ queryKey: ["portal", "devices"] });

        if (result.command.state === "applied") {
          toast.success("Thiết bị đã xác nhận áp dụng lệnh.");
        } else if (
          result.command.state === "failed" ||
          result.command.state === "expired"
        ) {
          toast.error(COMMAND_COPY[result.command.state].message);
        } else {
          toast.info("Backend đã chấp nhận lệnh; đang chờ thiết bị xác nhận.");
        }
      } catch (error) {
        const message = submissionErrorMessage(error);
        setOperations((current) => ({
          ...current,
          [deviceId]: {
            type,
            idempotencyKey,
            sending: false,
            error: message,
          },
        }));
        toast.error(message);
      } finally {
        inFlightDevices.current.delete(deviceId);
      }
    },
    [queryClient],
  );

  const list = devices.data?.devices || [];

  return (
    <div className="space-y-5">
      <header className="clinical-page-header flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="clinical-page-title flex items-center gap-2 text-foreground">
            <Stethoscope aria-hidden="true" size={22} />
            Quản lý thiết bị
          </h1>
          <p className="clinical-page-subtitle mt-1 text-sm text-muted-foreground">
            Trạng thái Online do thiết bị xác nhận và được làm mới mỗi 15 giây.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canClaim && (
            <Button asChild className="min-h-11">
              <Link to="/portal/devices/claim">
                <Plus aria-hidden="true" />
                Thêm thiết bị
              </Link>
            </Button>
          )}
          {canManage && (
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/portal/devices/assign">Gán thiết bị</Link>
            </Button>
          )}
        </div>
      </header>

      {!canManage && (
        <div
          className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
          role="note"
        >
          <Info
            aria-hidden="true"
            className="mr-2 inline size-4 text-primary"
          />
          Tài khoản hiện tại có quyền xem nhưng không có quyền gửi lệnh hoặc gán
          thiết bị.
        </div>
      )}

      {devices.isLoading ? (
        <DeviceListLoading />
      ) : devices.error ? (
        <DeviceListError retry={() => void devices.refetch()} />
      ) : !list.length ? (
        <Card className="shadow-sm" role="status">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Workspace chưa có thiết bị.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((device) => {
            const operation = operations[device.id];
            return (
              <DeviceCard
                key={device.id}
                device={device}
                canManage={canManage}
                operation={operation}
                send={() => void submitCommand(device.id, "restart")}
                retry={() =>
                  void submitCommand(
                    device.id,
                    operation?.type || "restart",
                    operation?.idempotencyKey,
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeviceListLoading() {
  return (
    <div
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label="Đang tải danh sách thiết bị"
    >
      <span className="sr-only">Đang tải danh sách thiết bị...</span>
      {[0, 1, 2].map((index) => (
        <Card key={index} className="shadow-sm">
          <CardHeader className="gap-3">
            <Skeleton className="h-5 w-2/3 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-1/2 motion-reduce:animate-none" />
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Skeleton className="h-10 motion-reduce:animate-none" />
            <Skeleton className="h-10 motion-reduce:animate-none" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DeviceListError({ retry }: { retry: () => void }) {
  return (
    <Card className="border-destructive/40 shadow-sm" role="alert">
      <CardContent className="flex flex-wrap items-center gap-3 p-5">
        <CircleAlert aria-hidden="true" className="size-5 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">
            Không thể tải danh sách thiết bị
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Kiểm tra kết nối rồi thử lại. Dữ liệu cũ không được dùng thay cho
            trạng thái hiện tại.
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={retry}>
          Thử lại
        </Button>
      </CardContent>
    </Card>
  );
}

function DeviceCard({
  device,
  operation,
  send,
  retry,
  canManage,
}: {
  device: Device;
  operation?: CommandOperation;
  send: () => void;
  retry: () => void;
  canManage: boolean;
}) {
  const online = device.online === true;
  const batteryAvailable = Number.isFinite(device.battery);
  const battery = batteryAvailable ? Number(device.battery) : null;
  const currentCommand =
    operation?.command ||
    (!operation?.sending && !operation?.error
      ? device.lastCommand || undefined
      : undefined);
  const commandInProgress = Boolean(
    currentCommand && !isTerminalCommand(currentCommand),
  );
  const actionDisabled =
    !online ||
    Boolean(operation?.sending) ||
    Boolean(operation?.error) ||
    commandInProgress;
  const presenceTokens = STATUS_TOKENS[online ? "success" : "neutral"];

  return (
    <Card className="overflow-hidden shadow-sm transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none hover:border-primary/30">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-foreground">
            {device.name || device.id}
          </h2>
          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {device.id}
          </p>
        </div>
        <Badge
          variant="outline"
          className="shrink-0 gap-1.5"
          style={{
            background: presenceTokens.background,
            borderColor: presenceTokens.border,
            color: presenceTokens.foreground,
          }}
        >
          {online ? (
            <Wifi aria-hidden="true" className="size-3" />
          ) : (
            <WifiOff aria-hidden="true" className="size-3" />
          )}
          {online ? "Online" : "Offline"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <DeviceMetric label="Pin">
            <span
              className={
                battery !== null && battery <= 20
                  ? "text-destructive"
                  : "text-foreground"
              }
            >
              {battery === null ? "—" : `${battery}%`}
              {battery !== null && battery <= 20 && (
                <BatteryWarning
                  aria-label="Pin yếu"
                  className="ml-1 inline size-4"
                />
              )}
            </span>
          </DeviceMetric>
          <DeviceMetric label="Firmware">
            {device.firmwareVersion || "—"}
          </DeviceMetric>
          <DeviceMetric label="Wi-Fi">{device.wifiSsid || "—"}</DeviceMetric>
          <DeviceMetric label="RSSI">
            {device.wifiRssi === undefined ? "—" : device.wifiRssi}
          </DeviceMetric>
        </dl>

        <DeviceTelemetryHealth
          telemetry={device.telemetry}
          lastSeenAt={device.lastSeenAt}
        />

        {currentCommand && (
          <DeviceCommandStatus deviceId={device.id} command={currentCommand} />
        )}

        {operation?.error && (
          <div
            className="rounded-lg border p-3 text-sm"
            style={{
              background: STATUS_TOKENS.danger.background,
              borderColor: STATUS_TOKENS.danger.border,
              color: STATUS_TOKENS.danger.foreground,
            }}
            role="alert"
          >
            <p className="font-medium">{operation.error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 min-h-11 bg-background"
              onClick={retry}
              disabled={operation.sending}
            >
              {operation.sending && (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              )}
              Thử gửi lại
            </Button>
          </div>
        )}

        {!online && canManage && (
          <p className="text-xs text-muted-foreground">
            Thiết bị phải Online trước khi nhận lệnh. Portal không xếp hàng lệnh
            cho thiết bị Offline.
          </p>
        )}
      </CardContent>

      {canManage && (
        <CardFooter>
          <Button
            variant="outline"
            className="min-h-11 w-full"
            disabled={actionDisabled}
            onClick={send}
            aria-busy={operation?.sending || undefined}
            title={
              !online
                ? "Thiết bị phải Online trước khi nhận lệnh"
                : commandInProgress
                  ? "Đang chờ kết quả lệnh hiện tại"
                  : undefined
            }
          >
            {operation?.sending ? (
              <Loader2
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
            ) : (
              <RotateCw aria-hidden="true" />
            )}
            {operation?.sending ? "Đang gửi lệnh..." : "Khởi động lại"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function formatTelemetryUptime(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "Chưa báo cáo";
  }
  const uptimeMs = value;

  const totalSeconds = Math.floor(uptimeMs / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    days > 0 ? `${days} ngày` : "",
    hours > 0 ? `${hours} giờ` : "",
    minutes > 0 ? `${minutes} phút` : "",
    days === 0 && hours === 0 && minutes === 0 ? `${seconds} giây` : "",
  ].filter(Boolean);
  return parts.join(" ") || "0 giây";
}

function formatTelemetryBytes(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "Chưa báo cáo";
  }
  const bytes = value;
  if (bytes < 1_024) return `${Math.round(bytes)} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function formatTelemetryCount(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value.toLocaleString("vi-VN")
    : "Chưa báo cáo";
}

function formatTelemetryCommand(telemetry?: Device["telemetry"]) {
  if (!telemetry) return "Chưa báo cáo";
  const parts = [telemetry.lastCommandState, telemetry.lastCommandCode].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return parts.join(" · ") || "Chưa báo cáo";
}

function hasReportedTelemetry(
  telemetry?: Device["telemetry"],
): telemetry is NonNullable<Device["telemetry"]> {
  return Boolean(
    telemetry &&
      Object.values(telemetry).some(
        (value) =>
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value.trim().length > 0),
      ),
  );
}

function formatSystemContact(value?: string) {
  if (!value) return "Chưa có thời điểm liên hệ hệ thống";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không xác định";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function DeviceTelemetryHealth({
  telemetry,
  lastSeenAt,
}: {
  telemetry?: Device["telemetry"];
  lastSeenAt?: string;
}) {
  const headingId = useId();

  if (!hasReportedTelemetry(telemetry)) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground"
        role="note"
      >
        Thiết bị chưa gửi dữ liệu sức khỏe.
      </div>
    );
  }

  const reportedTelemetry = telemetry;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-border bg-muted/20 p-3"
    >
      <div className="mb-3 flex items-center gap-2">
        <Activity aria-hidden="true" className="size-4 text-primary" />
        <h3
          id={headingId}
          className="text-xs font-semibold uppercase tracking-wide text-foreground"
        >
          Dữ liệu sức khỏe thiết bị
        </h3>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-xs sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
        <DeviceMetric label="Âm thanh (I2S)">
          <span className="inline-flex items-center gap-1.5">
            <Radio aria-hidden="true" className="size-3.5 text-primary" />
            {reportedTelemetry.i2sStatus || "Chưa báo cáo"}
          </span>
        </DeviceMetric>
        <DeviceMetric label="Thời gian hoạt động">
          <span className="inline-flex items-center gap-1.5">
            <Clock3
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
            {formatTelemetryUptime(reportedTelemetry.uptimeMs)}
          </span>
        </DeviceMetric>
        <DeviceMetric label="Bộ nhớ trống">
          <span className="inline-flex items-center gap-1.5">
            <MemoryStick
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
            {formatTelemetryBytes(reportedTelemetry.freeHeapBytes)}
          </span>
        </DeviceMetric>
        <DeviceMetric label="Gói âm thanh bị mất">
          <span className="inline-flex items-center gap-1.5">
            <Cpu
              aria-hidden="true"
              className="size-3.5 text-muted-foreground"
            />
            {formatTelemetryCount(reportedTelemetry.audioPacketsDropped)}
          </span>
        </DeviceMetric>
        <DeviceMetric label="Trạng thái lệnh gần nhất">
          {formatTelemetryCommand(reportedTelemetry)}
        </DeviceMetric>
        <DeviceMetric label="Trạng thái cập nhật">
          {reportedTelemetry.otaStatus || "Chưa báo cáo"}
        </DeviceMetric>
      </dl>
      <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        Lần thiết bị liên hệ hệ thống gần nhất: {formatSystemContact(lastSeenAt)}.{" "}
        Đây không phải thời điểm đo riêng của từng chỉ số.
      </p>
    </section>
  );
}

function DeviceMetric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-foreground [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

function DeviceCommandStatus({
  deviceId,
  command,
}: {
  deviceId: string;
  command: DeviceCommand;
}) {
  const [pollingStartedAt, setPollingStartedAt] = useState(() => Date.now());
  const commandQuery = useQuery({
    queryKey: ["portal", "device-command", deviceId, command.id],
    queryFn: ({ signal }) =>
      smartHealthApi.getDeviceCommand(deviceId, command.id, signal),
    initialData: { command },
    initialDataUpdatedAt: 0,
    enabled: !isTerminalCommand(command),
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const latest = query.state.data?.command || command;
      return deviceCommandPollInterval(latest, pollingStartedAt);
    },
    refetchIntervalInBackground: false,
  });
  const latest = commandQuery.data?.command || command;
  const copy = COMMAND_COPY[latest.state];
  const tokens = STATUS_TOKENS[copy.tone];
  const pollingStopped =
    !isTerminalCommand(latest) &&
    deviceCommandPollInterval(latest, pollingStartedAt) === false;
  const StateIcon =
    latest.state === "applied"
      ? CircleCheck
      : latest.state === "failed"
        ? CircleAlert
        : Clock3;

  const retryPolling = () => {
    setPollingStartedAt(Date.now());
    void commandQuery.refetch();
  };

  return (
    <div
      className="rounded-lg border p-3 transition-colors duration-200 motion-reduce:transition-none"
      style={{
        background: tokens.background,
        borderColor: tokens.border,
        color: tokens.foreground,
      }}
      role={latest.state === "failed" ? "alert" : "status"}
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <StateIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide">
              {COMMAND_TYPE_LABELS[latest.type]}
            </span>
            <Badge
              variant="outline"
              className="border-current bg-transparent text-current"
            >
              {copy.label}
            </Badge>
          </div>
          <p className="mt-2 text-sm font-medium">{copy.message}</p>
          {commandQuery.isFetching && !isTerminalCommand(latest) && (
            <p className="mt-2 flex items-center gap-1.5 text-xs">
              <Loader2
                aria-hidden="true"
                className="size-3.5 animate-spin motion-reduce:animate-none"
              />
              Đang cập nhật trạng thái thiết bị...
            </p>
          )}
          {commandQuery.isError && (
            <div className="mt-3" role="alert">
              <p className="text-xs">
                Không thể cập nhật trạng thái lệnh. Chưa có xác nhận mới từ
                thiết bị.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-11 bg-background"
                onClick={retryPolling}
              >
                Thử cập nhật lại
              </Button>
            </div>
          )}
          {pollingStopped && !commandQuery.isError && (
            <div className="mt-3">
              <p className="text-xs">
                Đã dừng cập nhật tự động sau thời gian chờ an toàn.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-11 bg-background"
                onClick={retryPolling}
              >
                Cập nhật trạng thái
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
