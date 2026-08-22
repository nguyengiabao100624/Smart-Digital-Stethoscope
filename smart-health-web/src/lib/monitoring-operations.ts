import { parseClinicalAlertListResponse } from "./clinical-workflow-operations.ts";
import {
  parseLiveStatusMessage,
  type LiveStatusMessage,
} from "./live-audio.ts";
import type {
  ClinicalAlert,
  Device,
  Scan,
} from "./smart-health-api";

const SENSITIVE_DEVICE_FIELDS = [
  "secret",
  "deviceSecret",
  "secretHash",
  "claimCode",
  "claimCodeHash",
] as const;

export type PortalMonitoringDevice = Device & {
  id: string;
  organizationId: string;
  online: boolean;
};

export type PortalMonitoringScan = Scan & {
  id: string;
  organizationId: string;
};

export interface PortalMonitoringSnapshot {
  generatedAt: string;
  workspaceId: string;
  status: LiveStatusMessage;
  devices: PortalMonitoringDevice[];
  scans: PortalMonitoringScan[];
  alerts: ClinicalAlert[];
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

function validTimestamp(value: unknown, label: string) {
  const timestamp = requiredText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return timestamp;
}

function parseDevice(
  value: unknown,
  expectedWorkspaceId: string,
): PortalMonitoringDevice {
  const device = recordOf(value, "Thiết bị monitoring");
  for (const field of SENSITIVE_DEVICE_FIELDS) {
    if (Object.hasOwn(device, field)) {
      throw new Error(
        "Phản hồi thiết bị chứa verification material nhạy cảm.",
      );
    }
  }

  const id = requiredText(device.id, "ID thiết bị");
  const organizationId = requiredText(
    device.organizationId,
    "workspace của thiết bị",
  );
  if (organizationId !== expectedWorkspaceId) {
    throw new Error("Thiết bị monitoring không thuộc workspace hiện tại.");
  }
  if (typeof device.online !== "boolean") {
    throw new Error(
      "Thiết bị monitoring thiếu trạng thái online canonical từ WSS đã xác thực.",
    );
  }
  if (
    device.connected !== undefined &&
    typeof device.connected !== "boolean"
  ) {
    throw new Error("Trạng thái connected tương thích của thiết bị không hợp lệ.");
  }
  optionalText(device.name, "Tên thiết bị");
  optionalText(device.status, "Trạng thái thiết bị");
  optionalText(device.audioStatus, "Trạng thái audio");
  optionalText(device.ipAddress, "Địa chỉ IP thiết bị");
  if (
    device.battery !== undefined &&
    (typeof device.battery !== "number" ||
      !Number.isFinite(device.battery) ||
      device.battery < 0 ||
      device.battery > 100)
  ) {
    throw new Error("Mức pin thiết bị không hợp lệ.");
  }
  if (device.updatedAt !== undefined) {
    validTimestamp(device.updatedAt, "Thời điểm cập nhật thiết bị");
  }

  return {
    ...(device as unknown as Device),
    id,
    organizationId,
    online: device.online,
  };
}

function parseScan(
  value: unknown,
  expectedWorkspaceId: string,
): PortalMonitoringScan {
  const scan = recordOf(value, "Lượt đo monitoring");
  const id = requiredText(scan.id, "ID lượt đo");
  const organizationId = requiredText(
    scan.organizationId,
    "workspace của lượt đo",
  );
  if (organizationId !== expectedWorkspaceId) {
    throw new Error("Lượt đo monitoring không thuộc workspace hiện tại.");
  }
  optionalText(scan.patientId, "patientId của lượt đo");
  optionalText(scan.deviceId, "deviceId của lượt đo");
  optionalText(scan.status, "Trạng thái lượt đo");
  if (scan.createdAt !== undefined) {
    validTimestamp(scan.createdAt, "Thời điểm tạo lượt đo");
  }
  if (scan.updatedAt !== undefined) {
    validTimestamp(scan.updatedAt, "Thời điểm cập nhật lượt đo");
  }

  return {
    ...(scan as unknown as Scan),
    id,
    organizationId,
  };
}

function parseUniqueRows<T>(
  value: unknown,
  label: string,
  parser: (item: unknown) => T & { id: string },
) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} phải là danh sách.`);
  }
  const ids = new Set<string>();
  return value.map((item) => {
    const parsed = parser(item);
    if (ids.has(parsed.id)) {
      throw new Error(`${label} bị trùng ID ${parsed.id}.`);
    }
    ids.add(parsed.id);
    return parsed;
  });
}

export function parsePortalMonitoringResponse(
  response: unknown,
  expectedWorkspaceId: string,
): PortalMonitoringSnapshot {
  const expected = requiredText(
    expectedWorkspaceId,
    "Workspace monitoring dự kiến",
  );
  const root = recordOf(response, "Phản hồi monitoring");
  const workspaceId = requiredText(
    root.workspaceId,
    "Workspace monitoring",
  );
  if (workspaceId !== expected) {
    throw new Error("Phản hồi monitoring không thuộc workspace hiện tại.");
  }

  const devices = parseUniqueRows(
    root.devices,
    "Danh sách thiết bị monitoring",
    (item) => parseDevice(item, workspaceId),
  );
  const scans = parseUniqueRows(
    root.scans,
    "Danh sách lượt đo monitoring",
    (item) => parseScan(item, workspaceId),
  );
  const alerts = parseClinicalAlertListResponse(
    { workspaceId, alerts: root.alerts },
    workspaceId,
  ).alerts;

  return {
    generatedAt: validTimestamp(
      root.generatedAt,
      "Thời điểm tạo snapshot monitoring",
    ),
    workspaceId,
    status: parseLiveStatusMessage(root.status, workspaceId),
    devices,
    scans,
    alerts,
  };
}
