import type {
  Device,
  DeviceCommand,
  DeviceCommandResponse,
  DeviceCommandState,
  DeviceCommandType,
  DevicePairingResponse,
} from "./smart-health-api";

const DEVICE_COMMAND_STATES = new Set<DeviceCommandState>([
  "accepted",
  "queued",
  "delivered",
  "acknowledged",
  "applying",
  "applied",
  "failed",
  "expired",
]);

const DEVICE_COMMAND_TYPES = new Set<DeviceCommandType>([
  "restart",
  "wifi.status",
  "device.lock",
  "device.revoke",
  "wifi.update",
  "ota.update",
  "audio.session.start",
  "audio.session.stop",
]);

const SENSITIVE_DEVICE_KEY = /(?:secret|claimcode|wifipassword|tokenhash|signature|requestedsessionid)/i;

export type PortalDevice = Device & {
  id: string;
  organizationId: string;
  online: boolean;
};

export interface PortalDeviceListResponse {
  generatedAt: string;
  workspaceId: string;
  devices: PortalDevice[];
}

export interface DeviceCommandExpectation {
  workspaceId: string;
  deviceId: string;
  type?: DeviceCommandType;
}

export interface DevicePairingExpectation {
  workspaceId: string;
  deviceId: string;
}

function recordOf(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} phải là object.`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} là bắt buộc.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error(`${label} không hợp lệ.`);
  }
  return value;
}

function requiredTimestamp(value: unknown, label: string) {
  const timestamp = requiredText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return timestamp;
}

function optionalTimestamp(value: unknown, label: string) {
  const timestamp = optionalText(value, label);
  if (timestamp && !Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return timestamp;
}

function assertNoSensitiveDeviceMaterial(
  value: unknown,
  path = "device",
  seen = new WeakSet<object>(),
) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSensitiveDeviceMaterial(item, `${path}[${index}]`, seen),
    );
    return;
  }

  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (SENSITIVE_DEVICE_KEY.test(key.replace(/[_-]/g, ""))) {
      throw new Error(
        `Phản hồi thiết bị chứa verification material nhạy cảm tại ${path}.${key}.`,
      );
    }
    assertNoSensitiveDeviceMaterial(nested, `${path}.${key}`, seen);
  }
}

function parseDelivery(value: unknown) {
  const delivery = recordOf(value, "Trạng thái truyền lệnh");
  for (const field of ["websocket", "mqtt", "delivered"] as const) {
    if (typeof delivery[field] !== "boolean") {
      throw new Error(`Trạng thái truyền lệnh thiếu ${field} canonical.`);
    }
  }
  return {
    websocket: delivery.websocket as boolean,
    mqtt: delivery.mqtt as boolean,
    delivered: delivery.delivered as boolean,
  };
}

function parseCanonicalDeviceCommand(
  value: unknown,
  expectation: DeviceCommandExpectation,
): DeviceCommand {
  const command = recordOf(value, "Biên nhận lệnh thiết bị");
  assertNoSensitiveDeviceMaterial(command, "command");

  const expectedWorkspaceId = requiredText(
    expectation.workspaceId,
    "Workspace dự kiến của lệnh",
  );
  const expectedDeviceId = requiredText(
    expectation.deviceId,
    "Thiết bị dự kiến của lệnh",
  );
  const organizationId = requiredText(
    command.organizationId,
    "Workspace của lệnh thiết bị",
  );
  if (organizationId !== expectedWorkspaceId) {
    throw new Error(
      "Biên nhận lệnh thiết bị không thuộc workspace hiện tại.",
    );
  }

  const deviceId = requiredText(command.deviceId, "ID thiết bị của lệnh");
  if (deviceId !== expectedDeviceId) {
    throw new Error("Biên nhận lệnh không thuộc thiết bị đang thao tác.");
  }

  if (command.protocolVersion !== 1) {
    throw new Error("Biên nhận lệnh có protocolVersion không được hỗ trợ.");
  }
  const type = requiredText(command.type, "Loại lệnh") as DeviceCommandType;
  if (!DEVICE_COMMAND_TYPES.has(type)) {
    throw new Error("Biên nhận lệnh có loại lệnh không hợp lệ.");
  }
  if (expectation.type && type !== expectation.type) {
    throw new Error("Backend trả về biên nhận cho loại lệnh khác yêu cầu.");
  }

  const state = requiredText(
    command.state,
    "Trạng thái lệnh",
  ) as DeviceCommandState;
  if (!DEVICE_COMMAND_STATES.has(state)) {
    throw new Error("Biên nhận lệnh có lifecycle không hợp lệ.");
  }
  if (
    command.status !== undefined &&
    command.status !== "" &&
    command.status !== state
  ) {
    throw new Error("Biên nhận lệnh có state và status mâu thuẫn.");
  }

  const issuedAt = requiredTimestamp(command.issuedAt, "Thời điểm phát lệnh");
  const expiresAt = requiredTimestamp(command.expiresAt, "Thời điểm hết hạn lệnh");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new Error("Biên nhận lệnh có thời hạn không hợp lệ.");
  }

  for (const [field, label] of [
    ["acceptedAt", "Thời điểm backend chấp nhận lệnh"],
    ["queuedAt", "Thời điểm xếp hàng lệnh"],
    ["deliveredAt", "Thời điểm chuyển lệnh"],
    ["acknowledgedAt", "Thời điểm thiết bị nhận lệnh"],
    ["applyingAt", "Thời điểm thiết bị áp dụng lệnh"],
    ["appliedAt", "Thời điểm áp dụng lệnh"],
    ["failedAt", "Thời điểm lệnh thất bại"],
    ["expiredAt", "Thời điểm lệnh hết hạn"],
    ["createdAt", "Thời điểm tạo lệnh"],
    ["updatedAt", "Thời điểm cập nhật lệnh"],
  ] as const) {
    optionalTimestamp(command[field], label);
  }

  return {
    ...(command as unknown as DeviceCommand),
    protocolVersion: 1,
    id: requiredText(command.id, "ID lệnh"),
    deviceId,
    organizationId,
    type,
    correlationId: requiredText(command.correlationId, "correlationId"),
    state,
    status: state,
    issuedAt,
    expiresAt,
    delivery: parseDelivery(command.delivery),
  };
}

function parsePortalDevice(
  value: unknown,
  expectedWorkspaceId: string,
): PortalDevice {
  const device = recordOf(value, "Thiết bị Portal");
  assertNoSensitiveDeviceMaterial(device);

  const id = requiredText(device.id, "ID thiết bị");
  const organizationId = requiredText(
    device.organizationId,
    "Workspace của thiết bị",
  );
  if (organizationId !== expectedWorkspaceId) {
    throw new Error("Thiết bị không thuộc workspace hiện tại.");
  }
  if (typeof device.online !== "boolean") {
    throw new Error(
      "Thiết bị thiếu trạng thái online canonical từ WSS đã xác thực.",
    );
  }
  if (
    device.connected !== undefined &&
    typeof device.connected !== "boolean"
  ) {
    throw new Error("Trạng thái connected tương thích không hợp lệ.");
  }
  if (
    device.battery !== undefined &&
    (typeof device.battery !== "number" ||
      !Number.isFinite(device.battery) ||
      device.battery < 0 ||
      device.battery > 100)
  ) {
    throw new Error("Mức pin thiết bị không hợp lệ.");
  }
  if (
    device.wifiRssi !== undefined &&
    (typeof device.wifiRssi !== "number" ||
      !Number.isFinite(device.wifiRssi))
  ) {
    throw new Error("RSSI thiết bị không hợp lệ.");
  }
  for (const [field, label] of [
    ["name", "Tên thiết bị"],
    ["status", "Trạng thái thiết bị"],
    ["firmwareVersion", "Phiên bản firmware"],
    ["wifiSsid", "Tên mạng Wi-Fi"],
    ["ipAddress", "Địa chỉ IP"],
    ["audioStatus", "Trạng thái audio"],
  ] as const) {
    optionalText(device[field], label);
  }
  for (const [field, label] of [
    ["lastSeenAt", "Thời điểm thiết bị liên hệ gần nhất"],
    ["updatedAt", "Thời điểm cập nhật thiết bị"],
  ] as const) {
    optionalTimestamp(device[field], label);
  }

  let lastCommand: DeviceCommand | null | undefined;
  if (device.lastCommand !== undefined && device.lastCommand !== null) {
    const commandRecord = recordOf(device.lastCommand, "Lệnh gần nhất");
    lastCommand = parseCanonicalDeviceCommand(commandRecord, {
      workspaceId: expectedWorkspaceId,
      deviceId: id,
      type: requiredText(
        commandRecord.type,
        "Loại lệnh gần nhất",
      ) as DeviceCommandType,
    });
  } else {
    lastCommand = device.lastCommand as null | undefined;
  }

  return {
    ...(device as unknown as Device),
    id,
    organizationId,
    online: device.online,
    lastCommand,
  };
}

export function parsePortalDeviceListResponse(
  response: unknown,
  expectedWorkspaceId: string,
): PortalDeviceListResponse {
  const expected = requiredText(
    expectedWorkspaceId,
    "Workspace thiết bị dự kiến",
  );
  const root = recordOf(response, "Phản hồi danh sách thiết bị");
  const workspaceId = requiredText(root.workspaceId, "Workspace thiết bị");
  if (workspaceId !== expected) {
    throw new Error(
      "Phản hồi danh sách thiết bị không thuộc workspace hiện tại.",
    );
  }
  if (!Array.isArray(root.devices)) {
    throw new Error("Phản hồi thiết bị thiếu danh sách canonical.");
  }

  const ids = new Set<string>();
  const devices = root.devices.map((value) => {
    const parsed = parsePortalDevice(value, workspaceId);
    if (ids.has(parsed.id)) {
      throw new Error(`Danh sách thiết bị bị trùng ID ${parsed.id}.`);
    }
    ids.add(parsed.id);
    return parsed;
  });

  return {
    generatedAt: requiredTimestamp(
      root.generatedAt,
      "Thời điểm tạo danh sách thiết bị",
    ),
    workspaceId,
    devices,
  };
}

export function parseDevicePairingResponse(
  response: unknown,
  expectation: DevicePairingExpectation,
): DevicePairingResponse {
  const expectedWorkspaceId = requiredText(
    expectation.workspaceId,
    "Workspace ghép thiết bị dự kiến",
  );
  const expectedDeviceId = requiredText(
    expectation.deviceId,
    "ID thiết bị ghép dự kiến",
  );
  const root = recordOf(response, "Biên nhận ghép thiết bị");
  assertNoSensitiveDeviceMaterial(root, "pairingResponse");
  const device = parsePortalDevice(root.device, expectedWorkspaceId);
  if (device.id !== expectedDeviceId) {
    throw new Error("Biên nhận ghép không thuộc thiết bị đang thao tác.");
  }
  if (typeof device.connected !== "boolean") {
    throw new Error("Biên nhận ghép thiếu trạng thái connected canonical.");
  }

  const pairing = recordOf(root.pairing, "Trạng thái ghép thiết bị");
  const acceptedWaiting =
    pairing.outcome === "accepted" &&
    pairing.presence === "awaiting_online" &&
    pairing.onlineConfirmed === false &&
    pairing.authenticatedTransport === null;
  const confirmedOnline =
    pairing.outcome === "success" &&
    pairing.presence === "online" &&
    pairing.onlineConfirmed === true &&
    pairing.authenticatedTransport === "wss";
  if (!acceptedWaiting && !confirmedOnline) {
    throw new Error("Biên nhận ghép có outcome/presence không nhất quán.");
  }
  if (
    device.online !== pairing.onlineConfirmed ||
    device.connected !== pairing.onlineConfirmed
  ) {
    throw new Error("Biên nhận ghép mâu thuẫn với presence thiết bị.");
  }
  if (root.idempotent !== undefined && typeof root.idempotent !== "boolean") {
    throw new Error("Cờ idempotent của biên nhận ghép không hợp lệ.");
  }

  return {
    device,
    pairing: {
      outcome: pairing.outcome as "accepted" | "success",
      presence: pairing.presence as "awaiting_online" | "online",
      onlineConfirmed: pairing.onlineConfirmed as boolean,
      authenticatedTransport: pairing.authenticatedTransport as "wss" | null,
    },
    ...(typeof root.idempotent === "boolean"
      ? { idempotent: root.idempotent }
      : {}),
  };
}

export function parseDeviceCommandResponse(
  response: unknown,
  expectation: DeviceCommandExpectation,
): DeviceCommandResponse {
  const root = recordOf(response, "Phản hồi lệnh thiết bị");
  assertNoSensitiveDeviceMaterial(root, "commandResponse");
  const command = parseCanonicalDeviceCommand(root.command, expectation);
  if (root.replayed !== undefined && typeof root.replayed !== "boolean") {
    throw new Error("Cờ replayed của lệnh không hợp lệ.");
  }
  if (root.idempotent !== undefined && typeof root.idempotent !== "boolean") {
    throw new Error("Cờ idempotent của lệnh không hợp lệ.");
  }
  return {
    ...(root as unknown as DeviceCommandResponse),
    command,
  };
}
