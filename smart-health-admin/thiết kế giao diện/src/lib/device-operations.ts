import type {
  SmartHealthDevice,
  SmartHealthDeviceCommand,
  SmartHealthDeviceCredentialRotationState,
  SmartHealthDeviceEvent,
} from "./smart-health-api";

export type OtaDraft = {
  firmwareVersion: string;
  url: string;
  checksum: string;
  firmwareFileId: string;
  hardwareTarget: string;
  partitionTarget: string;
  minimumProtocolVersion: string;
};

export type OtaDraftField = keyof OtaDraft;

export const COMMAND_STATUS_PRESENTATION = {
  accepted: {
    label: "Backend đã chấp nhận",
    description: "Yêu cầu đã được ghi nhận, chưa xác nhận đã tới thiết bị.",
    tone: "info",
  },
  queued: {
    label: "Đang chờ kênh thiết bị",
    description: "Lệnh chưa được giao tới một kết nối thiết bị đã xác thực.",
    tone: "warning",
  },
  delivered: {
    label: "Đã giao tới thiết bị",
    description: "Kênh thiết bị đã nhận lệnh, đang chờ thiết bị xác nhận.",
    tone: "info",
  },
  acknowledged: {
    label: "Thiết bị đã xác nhận",
    description: "Thiết bị xác nhận đã nhận lệnh nhưng chưa báo áp dụng xong.",
    tone: "info",
  },
  applying: {
    label: "Thiết bị đang áp dụng",
    description: "Thiết bị đang thực hiện lệnh. Không ngắt nguồn hoặc mạng.",
    tone: "warning",
  },
  applied: {
    label: "Thiết bị đã áp dụng",
    description: "Thiết bị đã xác nhận hoàn tất lệnh.",
    tone: "success",
  },
  failed: {
    label: "Thiết bị báo thất bại",
    description: "Lệnh không được áp dụng. Kiểm tra mã lỗi và thử lại khi an toàn.",
    tone: "error",
  },
  expired: {
    label: "Lệnh đã hết hạn",
    description: "Không có xác nhận hoàn tất trong thời hạn của lệnh.",
    tone: "error",
  },
} as const;

export type DeviceCommandState = keyof typeof COMMAND_STATUS_PRESENTATION;

export const DEVICE_OTA_STATUS_PRESENTATION = {
  pending: {
    label: "Đang chờ thiết bị",
    description:
      "Backend đã chấp nhận manifest OTA; chưa có bằng chứng thiết bị bắt đầu tải firmware.",
    tone: "warning",
  },
  delivered: {
    label: "Đã giao manifest",
    description:
      "Manifest đã tới phiên thiết bị được xác thực. Đây chưa phải xác nhận cập nhật thành công.",
    tone: "info",
  },
  downloading: {
    label: "Đang tải firmware",
    description: "Thiết bị đang tải firmware qua HTTPS. Không ngắt nguồn hoặc kết nối mạng.",
    tone: "info",
  },
  verifying: {
    label: "Đang xác minh firmware",
    description: "Thiết bị đang kiểm tra SHA-256, chữ ký, hardware target và partition đích.",
    tone: "warning",
  },
  rebooting: {
    label: "Đang khởi động lại",
    description:
      "Thiết bị đã áp dụng image và đang khởi động lại. Chỉ xác nhận thành công sau reconnect WSS và telemetry đúng phiên bản.",
    tone: "warning",
  },
  confirmed: {
    label: "OTA đã xác nhận",
    description: "Backend đã nhận reconnect được xác thực và telemetry báo đúng firmware mục tiêu.",
    tone: "success",
  },
  rolled_back: {
    label: "OTA đang/đã hoàn tác",
    description:
      "Thiết bị báo quy trình rollback sau kiểm tra sức khỏe. Kiểm tra firmware hiện tại trước khi phát hành lại.",
    tone: "error",
  },
  failed: {
    label: "OTA thất bại",
    description:
      "Thiết bị hoặc backend báo OTA thất bại. Kiểm tra mã lỗi và lịch sử trước khi thử lại.",
    tone: "error",
  },
} as const;

export type DeviceOtaState = keyof typeof DEVICE_OTA_STATUS_PRESENTATION;

export type DeviceOtaExpectation = {
  commandId: string;
  firmwareVersion: string;
};

export const DEVICE_ROTATION_STATUS_PRESENTATION: Record<
  SmartHealthDeviceCredentialRotationState,
  { label: string; detail: string; tone: string }
> = {
  initiated: {
    label: "Đã khởi tạo",
    detail: "Backend đã tạo candidate và ghi audit; chưa xác nhận thiết bị đã nhận.",
    tone: "text-info",
  },
  pending_device_ack: {
    label: "Chờ thiết bị xác nhận",
    detail: "Candidate đã được bọc theo phiên WSS và gửi tới thiết bị.",
    tone: "text-info",
  },
  confirming: {
    label: "Đang xác minh kết nối lại",
    detail: "Thiết bị đã lưu candidate và đang đăng nhập lại bằng credential mới.",
    tone: "text-warning",
  },
  confirmed: {
    label: "Đã xác nhận",
    detail: "Backend đã xác thực phiên mới, thu hồi credential cũ và đóng socket cũ.",
    tone: "text-success",
  },
  expired: {
    label: "Đã hết hạn",
    detail: "Không có reconnect hợp lệ trong thời hạn; backend tiếp tục dùng credential cũ.",
    tone: "text-destructive",
  },
  rolled_back: {
    label: "Đã hoàn tác",
    detail: "Thiết bị không áp dụng được candidate; credential cũ vẫn có hiệu lực.",
    tone: "text-destructive",
  },
  failed: {
    label: "Không thể giao candidate",
    detail: "Phiên thiết bị bị mất trước khi candidate được giao; credential cũ vẫn có hiệu lực.",
    tone: "text-destructive",
  },
};

const TERMINAL_DEVICE_ROTATION_STATES = new Set<SmartHealthDeviceCredentialRotationState>([
  "confirmed",
  "expired",
  "rolled_back",
  "failed",
]);

export function isDeviceRotationTerminal(state: SmartHealthDeviceCredentialRotationState) {
  return TERMINAL_DEVICE_ROTATION_STATES.has(state);
}

export function isDeviceRotationSuccessful(state: SmartHealthDeviceCredentialRotationState) {
  return state === "confirmed";
}

const TERMINAL_COMMAND_STATES = new Set<DeviceCommandState>(["applied", "failed", "expired"]);

export function isDeviceCommandState(value: unknown): value is DeviceCommandState {
  return typeof value === "string" && value in COMMAND_STATUS_PRESENTATION;
}

export function isDeviceCommandTerminal(state: DeviceCommandState) {
  return TERMINAL_COMMAND_STATES.has(state);
}

const TERMINAL_DEVICE_OTA_STATES = new Set<DeviceOtaState>(["confirmed", "rolled_back", "failed"]);

export function isDeviceOtaTerminal(state: DeviceOtaState) {
  return TERMINAL_DEVICE_OTA_STATES.has(state);
}

export function getDeviceOtaState(
  device: Pick<SmartHealthDevice, "otaStatus" | "ota" | "lastCommand">,
): DeviceOtaState {
  const rawStatus = String(
    device.otaStatus || device.ota?.status || device.lastCommand?.state || "pending",
  )
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["confirmed", "success", "succeeded"].includes(rawStatus)) return "confirmed";
  if (["rolled_back", "rollback", "rolling_back"].includes(rawStatus)) return "rolled_back";
  if (["failed", "failure", "expired"].includes(rawStatus)) return "failed";
  if (["rebooting", "restarting", "applied"].includes(rawStatus)) return "rebooting";
  if (["verifying", "verified"].includes(rawStatus)) return "verifying";
  if (["downloading", "downloaded"].includes(rawStatus)) return "downloading";
  if (["delivered", "acknowledged"].includes(rawStatus)) return "delivered";
  return "pending";
}

export function isDeviceOtaSuccessful(
  device: Pick<SmartHealthDevice, "firmwareVersion" | "otaStatus" | "ota" | "lastCommand">,
  expectation: DeviceOtaExpectation,
) {
  return (
    device.ota?.commandId === expectation.commandId &&
    device.ota?.firmwareVersion === expectation.firmwareVersion &&
    device.ota?.status === "confirmed" &&
    device.firmwareVersion === expectation.firmwareVersion
  );
}

export function isDeviceOnline(device: Pick<SmartHealthDevice, "online">) {
  return device.online === true;
}

export function createDeviceOperationIdempotencyKey(
  operation: string,
  deviceId: string,
  randomId: () => string = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
) {
  const normalizedOperation = operation
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .slice(0, 40);
  const normalizedDeviceId = deviceId
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .slice(0, 80);
  return `shcare-admin:${normalizedOperation}:${normalizedDeviceId}:${randomId()}`;
}

export function validateOtaDraft(draft: OtaDraft) {
  const fieldErrors: Partial<Record<OtaDraftField, string>> = {};
  const firmwareVersion = draft.firmwareVersion.trim();
  const checksum = draft.checksum.trim();
  const url = draft.url.trim();

  if (!/^\d+\.\d+\.\d+$/.test(firmwareVersion)) {
    fieldErrors.firmwareVersion = "Phiên bản phải theo dạng x.y.z, ví dụ 1.2.3.";
  }

  if (!draft.firmwareFileId.trim()) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        fieldErrors.url = "URL firmware thủ công bắt buộc dùng HTTPS.";
      }
    } catch {
      fieldErrors.url = "Chọn file firmware hoặc nhập một URL HTTPS hợp lệ.";
    }
  }

  if (!/^[a-f0-9]{64}$/i.test(checksum)) {
    fieldErrors.checksum = "SHA-256 phải gồm đúng 64 ký tự thập lục phân.";
  }
  if (draft.hardwareTarget.trim() !== "MSM261S4030H0") {
    fieldErrors.hardwareTarget = "Bản phát hành này chỉ hỗ trợ MSM261S4030H0.";
  }
  if (draft.partitionTarget.trim() !== "app") {
    fieldErrors.partitionTarget = "Partition đích phải là app.";
  }
  if (!/^[1-9]\d*$/.test(draft.minimumProtocolVersion.trim())) {
    fieldErrors.minimumProtocolVersion = "Protocol tối thiểu phải là số nguyên từ 1 trở lên.";
  }

  return { valid: Object.keys(fieldErrors).length === 0, fieldErrors };
}

const EVENT_FIELD_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["state", "Trạng thái"],
  ["reportedState", "Thiết bị báo"],
  ["type", "Loại lệnh"],
  ["code", "Mã"],
  ["firmwareVersion", "Firmware"],
  ["hardwareTarget", "Phần cứng"],
  ["partitionTarget", "Partition"],
  ["minimumProtocolVersion", "Protocol tối thiểu"],
  ["presence", "Hiện diện"],
  ["onlineConfirmed", "Xác nhận online"],
];

function safeEventValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim();
  if (!text || /https?:\/\/|token|secret|signature|password/i.test(text)) return "";
  return text.slice(0, 80);
}

export function summarizeDeviceEvent(event: Pick<SmartHealthDeviceEvent, "eventType" | "payload">) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  const segments = EVENT_FIELD_LABELS.flatMap(([field, label]) => {
    const value = safeEventValue(payload[field]);
    return value ? [`${label}: ${value}`] : [];
  });

  return segments.length
    ? segments.join(" · ")
    : "Sự kiện đã được ghi nhận; payload kỹ thuật và dữ liệu nhạy cảm được ẩn.";
}

type PollDeviceCommandOptions = {
  initialCommand: SmartHealthDeviceCommand;
  load: (signal?: AbortSignal) => Promise<SmartHealthDeviceCommand>;
  onUpdate?: (command: SmartHealthDeviceCommand) => void;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  intervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
};

type PollDeviceOtaOptions = {
  initialDevice: SmartHealthDevice;
  expectation: DeviceOtaExpectation;
  load: (signal?: AbortSignal) => Promise<SmartHealthDevice>;
  onUpdate?: (device: SmartHealthDevice, state: DeviceOtaState) => void;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  intervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
};

function waitFor(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Command polling aborted", "AbortError"));
      return;
    }
    const timeout = globalThis.setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timeout);
        reject(new DOMException("Command polling aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function pollDeviceCommandToTerminal({
  initialCommand,
  load,
  onUpdate,
  wait = waitFor,
  intervalMs = 1_200,
  maxAttempts = 25,
  signal,
}: PollDeviceCommandOptions) {
  let command = initialCommand;
  if (isDeviceCommandTerminal(command.state)) {
    return { command, timedOut: false };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await wait(intervalMs, signal);
    if (signal?.aborted) {
      throw new DOMException("Command polling aborted", "AbortError");
    }
    command = await load(signal);
    onUpdate?.(command);
    if (isDeviceCommandTerminal(command.state)) {
      return { command, timedOut: false };
    }
  }

  return { command, timedOut: true };
}

export async function pollDeviceOtaToTerminal({
  initialDevice,
  expectation,
  load,
  onUpdate,
  wait = waitFor,
  intervalMs = 2_500,
  maxAttempts = 48,
  signal,
}: PollDeviceOtaOptions) {
  let device = initialDevice;
  let state = getDeviceOtaState(device);

  const inspect = () => {
    const commandId = device.ota?.commandId;
    if (commandId && commandId !== expectation.commandId) {
      return {
        device,
        state,
        timedOut: false,
        replaced: true,
        confirmationMismatch: false,
      };
    }
    if (state === "confirmed" && !isDeviceOtaSuccessful(device, expectation)) {
      return {
        device,
        state,
        timedOut: false,
        replaced: false,
        confirmationMismatch: true,
      };
    }
    if (isDeviceOtaTerminal(state)) {
      return {
        device,
        state,
        timedOut: false,
        replaced: false,
        confirmationMismatch: false,
      };
    }
    return null;
  };

  const initialResult = inspect();
  if (initialResult) return initialResult;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await wait(intervalMs, signal);
    if (signal?.aborted) {
      throw new DOMException("OTA polling aborted", "AbortError");
    }
    device = await load(signal);
    state = getDeviceOtaState(device);
    onUpdate?.(device, state);
    const result = inspect();
    if (result) return result;
  }

  return {
    device,
    state,
    timedOut: true,
    replaced: false,
    confirmationMismatch: false,
  };
}
