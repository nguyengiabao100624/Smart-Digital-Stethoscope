import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Battery,
  BatteryLow,
  BatteryMedium,
  Clock,
  FileCode2,
  Info,
  MonitorSpeaker,
  PencilLine,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  Router,
  Search,
  ShieldAlert,
  Stethoscope,
  UserRoundCog,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { AddDeviceDialog } from "./dialogs/AddDeviceDialog";
import { ActivateDeviceDialog } from "./dialogs/ActivateDeviceDialog";
import { RotateDeviceSecretDialog } from "./dialogs/RotateDeviceSecretDialog";
import { EditDeviceDialog } from "./dialogs/EditDeviceDialog";
import { AssignDevicePatientDialog } from "./dialogs/AssignDevicePatientDialog";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { PageHeader, StatusBadge, Timeline } from "./design-system";
import { PaginationFooter } from "./PaginationFooter";
import { ADMIN_TABLE_PAGE_SIZE } from "./pagination-utils";
import {
  smartHealthApi,
  type SmartHealthDevice,
  type SmartHealthDeviceCommand,
  type SmartHealthDeviceEvent,
  type SmartHealthListPagination,
  type SmartHealthStorageFile,
} from "@/lib/smart-health-api";
import {
  COMMAND_STATUS_PRESENTATION,
  DEVICE_OTA_STATUS_PRESENTATION,
  createDeviceOperationIdempotencyKey,
  getDeviceOtaState,
  isDeviceCommandState,
  isDeviceCommandTerminal,
  isDeviceOnline,
  isDeviceOtaSuccessful,
  isDeviceOtaTerminal,
  pollDeviceCommandToTerminal,
  pollDeviceOtaToTerminal,
  summarizeDeviceEvent,
  validateOtaDraft,
  type DeviceOtaExpectation,
  type DeviceOtaState,
  type OtaDraft,
  type OtaDraftField,
} from "@/lib/device-operations";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { parseStorageFilesResponse } from "@/lib/storage-operations";
import { CapabilityGate } from "./AdminAccessContext";
import {
  DetailDrawer,
  DetailDrawerClose,
  DetailDrawerDescription,
  DetailDrawerTitle,
} from "./DetailDrawer";
import { useAdminAccess } from "./useAdminAccess";
import { DEVICE_MANAGE_CAPABILITIES } from "./action-permissions";

type DangerKind = "revoke" | "restart";

type DangerAction = {
  kind: DangerKind;
  device: SmartHealthDevice;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  idempotencyKey?: string;
};

type CommandOperationState = {
  deviceId: string;
  command: SmartHealthDeviceCommand;
  polling: boolean;
  timedOut: boolean;
  error: string;
};

type OtaOperationState = DeviceOtaExpectation & {
  deviceId: string;
  state: DeviceOtaState;
  polling: boolean;
  timedOut: boolean;
  error: string;
};

const EMPTY_OTA_FORM: OtaDraft = {
  firmwareVersion: "",
  url: "",
  checksum: "",
  firmwareFileId: "",
  hardwareTarget: "MSM261S4030H0",
  partitionTarget: "app",
  minimumProtocolVersion: "1",
};

function getCommandOperationPresentation(command: SmartHealthDeviceCommand) {
  if (command.type === "ota.update" && command.state === "applied") {
    return DEVICE_OTA_STATUS_PRESENTATION.rebooting;
  }
  return COMMAND_STATUS_PRESENTATION[command.state];
}

function formatDateTime(value?: string | null) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatRelative(value?: string | null) {
  if (!value) return "Chưa có heartbeat";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 2) return "Vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) return `${diffHours} giờ trước`;
  return `${Math.round(diffHours / 24)} ngày trước`;
}

function formatBattery(value?: number) {
  const battery = Number(value);
  return Number.isFinite(battery) ? `${Math.round(battery)}%` : "Chưa báo cáo";
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

function formatTelemetryCommand(telemetry?: SmartHealthDevice["telemetry"]) {
  if (!telemetry) return "Chưa báo cáo";
  const parts = [telemetry.lastCommandState, telemetry.lastCommandCode].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  return parts.join(" · ") || "Chưa báo cáo";
}

function hasReportedTelemetry(
  telemetry?: SmartHealthDevice["telemetry"],
): telemetry is NonNullable<SmartHealthDevice["telemetry"]> {
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

function formatDeviceType(value?: string) {
  switch (value) {
    case "stethoscope":
      return "Ống nghe thông minh";
    case "respiratory":
      return "Thiết bị hô hấp";
    case "other":
      return "Thiết bị khác";
    default:
      return value || "Chưa cập nhật";
  }
}

function formatInventoryDate(value?: string) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(date);
}

function isDeviceWaitingForClaim(device: SmartHealthDevice) {
  if (device.ownershipState) return device.ownershipState === "provisioned";
  return !device.ownerUserId && !device.pairedUserId && !device.assignedPatientId;
}

function eventTone(eventType: string): "success" | "warning" | "error" | "primary" | "muted" {
  if (/failed|rejected|error/i.test(eventType)) return "error";
  if (/ota|command|rotate|revoke|unpair/i.test(eventType)) return "warning";
  if (/telemetry|connected|hello/i.test(eventType)) return "success";
  return "muted";
}

export function Devices() {
  const { hasAnyCapability, isPlatformAdmin } = useAdminAccess();
  const canManageDevices = hasAnyCapability(DEVICE_MANAGE_CAPABILITIES);
  const [devices, setDevices] = useState<SmartHealthDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<SmartHealthDevice | null>(null);
  const [events, setEvents] = useState<SmartHealthDeviceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<SmartHealthListPagination>({
    totalCount: 0,
    page: 1,
    limit: ADMIN_TABLE_PAGE_SIZE,
    pageCount: 0,
  });
  const [deviceSummary, setDeviceSummary] = useState({
    total: 0,
    online: 0,
    offline: 0,
    revoked: 0,
    otaPending: 0,
  });
  const deferredSearchTerm = React.useDeferredValue(searchTerm.trim());
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [claimDevice, setClaimDevice] = useState<SmartHealthDevice | null>(null);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [rotateSecretDevice, setRotateSecretDevice] = useState<SmartHealthDevice | null>(null);
  const [editingDevice, setEditingDevice] = useState<SmartHealthDevice | null>(null);
  const [assignmentDevice, setAssignmentDevice] = useState<SmartHealthDevice | null>(null);
  const [dangerAction, setDangerAction] = useState<DangerAction | null>(null);
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerError, setDangerError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [commandOperation, setCommandOperation] = useState<CommandOperationState | null>(null);
  const [otaOperation, setOtaOperation] = useState<OtaOperationState | null>(null);
  const [otaForm, setOtaForm] = useState<OtaDraft>(EMPTY_OTA_FORM);
  const [otaFieldErrors, setOtaFieldErrors] = useState<Partial<Record<OtaDraftField, string>>>({});
  const [otaSubmitError, setOtaSubmitError] = useState("");
  const [otaIdempotencyKey, setOtaIdempotencyKey] = useState("");
  const [firmwareFiles, setFirmwareFiles] = useState<SmartHealthStorageFile[]>([]);
  const [firmwareLoading, setFirmwareLoading] = useState(false);
  const [firmwareError, setFirmwareError] = useState("");
  const commandPollController = useRef<AbortController | null>(null);
  const otaPollController = useRef<AbortController | null>(null);
  const eventRequestId = useRef(0);

  const loadDevices = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      try {
        const response = await smartHealthApi.listDevices({
          q: deferredSearchTerm || undefined,
          page,
          limit: ADMIN_TABLE_PAGE_SIZE,
          sort: "lastSeenAt:desc",
          status: statusFilter === "all" ? undefined : statusFilter,
          signal,
        });
        const nextDevices = response.devices;
        setDevices(nextDevices);
        const nextPagination = response.pagination || {
          totalCount: nextDevices.length,
          page,
          limit: ADMIN_TABLE_PAGE_SIZE,
          pageCount: nextDevices.length > 0 ? 1 : 0,
        };
        setPagination(nextPagination);
        if (page > Math.max(1, nextPagination.pageCount)) {
          setPage(Math.max(1, nextPagination.pageCount));
        }
        setDeviceSummary(
          response.summary || {
            total: nextDevices.length,
            online: nextDevices.filter(isDeviceOnline).length,
            offline: nextDevices.filter((item) => !isDeviceOnline(item)).length,
            revoked: nextDevices.filter((item) => item.status === "revoked").length,
            otaPending: nextDevices.filter(
              (item) =>
                Boolean(item.otaStatus || item.ota) &&
                !isDeviceOtaTerminal(getDeviceOtaState(item)),
            ).length,
          },
        );
        setBackendError(null);
        setSelectedDevice((current) =>
          current ? nextDevices.find((item) => item.id === current.id) || null : current,
        );
      } catch (error) {
        if (signal?.aborted) return;
        setDevices([]);
        setBackendError(toVietnameseErrorMessage(error, "Không thể tải dữ liệu thiết bị."));
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [deferredSearchTerm, page, statusFilter],
  );

  const loadEvents = useCallback(async (deviceId: string) => {
    const requestId = ++eventRequestId.current;
    setEventsLoading(true);
    setEventsError("");
    try {
      const result = await smartHealthApi.listDeviceEvents(deviceId);
      if (eventRequestId.current === requestId) {
        setEvents(result.events || []);
      }
    } catch (error) {
      if (eventRequestId.current === requestId) {
        setEvents([]);
        setEventsError(toVietnameseErrorMessage(error, "Không thể tải lịch sử thiết bị."));
      }
    } finally {
      if (eventRequestId.current === requestId) {
        setEventsLoading(false);
      }
    }
  }, []);

  const loadFirmwareFiles = useCallback(async () => {
    setFirmwareLoading(true);
    try {
      const result = await smartHealthApi.listStorageFiles();
      const { files } = parseStorageFilesResponse(result);
      setFirmwareFiles(
        files
          .filter((file) => file.bucket === "device-firmware" && file.type?.toLowerCase() === "bin")
          .sort((a, b) =>
            String(b.createdAt || b.uploadedAt).localeCompare(String(a.createdAt || a.uploadedAt)),
          ),
      );
      setFirmwareError("");
    } catch (error) {
      setFirmwareFiles([]);
      setFirmwareError(toVietnameseErrorMessage(error, "Không thể tải firmware từ storage."));
    } finally {
      setFirmwareLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDevices(controller.signal);
    return () => controller.abort();
  }, [loadDevices]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, statusFilter]);

  useEffect(() => {
    if (isPlatformAdmin) {
      void loadFirmwareFiles();
    }
  }, [isPlatformAdmin, loadFirmwareFiles]);

  useEffect(() => {
    return () => {
      commandPollController.current?.abort();
      otaPollController.current?.abort();
    };
  }, []);

  const hasDevices = useMemo(() => devices.length > 0, [devices.length]);

  const updateDevice = useCallback((device: SmartHealthDevice) => {
    setDevices((current) => current.map((item) => (item.id === device.id ? device : item)));
    setSelectedDevice((current) => (current?.id === device.id ? device : current));
  }, []);

  const updateDeviceCommand = useCallback((deviceId: string, command: SmartHealthDeviceCommand) => {
    setDevices((current) =>
      current.map((device) =>
        device.id === deviceId ? { ...device, lastCommand: command } : device,
      ),
    );
    setSelectedDevice((current) =>
      current?.id === deviceId ? { ...current, lastCommand: command } : current,
    );
  }, []);

  const trackOta = useCallback(
    async (
      deviceId: string,
      initialDevice: SmartHealthDevice,
      expectation: DeviceOtaExpectation,
    ) => {
      otaPollController.current?.abort();
      const controller = new AbortController();
      otaPollController.current = controller;
      const initialState = getDeviceOtaState(initialDevice);
      setOtaOperation({
        deviceId,
        ...expectation,
        state: initialState,
        polling: !isDeviceOtaTerminal(initialState),
        timedOut: false,
        error: "",
      });

      try {
        const result = await pollDeviceOtaToTerminal({
          initialDevice,
          expectation,
          signal: controller.signal,
          load: async (signal) => {
            const response = await smartHealthApi.getDevice(deviceId, signal);
            return response.device;
          },
          onUpdate: (device, state) => {
            updateDevice(device);
            setOtaOperation({
              deviceId,
              ...expectation,
              state,
              polling: !isDeviceOtaTerminal(state),
              timedOut: false,
              error: "",
            });
          },
        });
        if (controller.signal.aborted) return;

        updateDevice(result.device);
        const error = result.replaced
          ? "Thiết bị đang báo một OTA khác với lệnh đang theo dõi. Tải lại danh sách trước khi thao tác tiếp."
          : result.confirmationMismatch
            ? "Backend báo confirmed nhưng command hoặc phiên bản firmware không khớp mục tiêu. Kết quả này không được coi là thành công."
            : result.timedOut
              ? "Chưa nhận được reconnect WSS và telemetry đúng phiên bản trong thời gian chờ. Có thể thử tải lại trạng thái mà không phát hành OTA mới."
              : "";
        const finalState = result.replaced || result.confirmationMismatch ? "failed" : result.state;
        setOtaOperation({
          deviceId,
          ...expectation,
          state: finalState,
          polling: false,
          timedOut: result.timedOut,
          error,
        });

        if (!error && result.state === "confirmed") {
          const presentation = DEVICE_OTA_STATUS_PRESENTATION.confirmed;
          toast.success(presentation.label, { description: presentation.description });
        } else if (!error && ["rolled_back", "failed"].includes(result.state)) {
          const presentation = DEVICE_OTA_STATUS_PRESENTATION[result.state];
          toast.error(presentation.label, { description: presentation.description });
        }
        void loadEvents(deviceId);
      } catch (error) {
        if (controller.signal.aborted) return;
        setOtaOperation((current) =>
          current?.deviceId === deviceId && current.commandId === expectation.commandId
            ? {
                ...current,
                polling: false,
                error: toVietnameseErrorMessage(
                  error,
                  "Không thể cập nhật trạng thái OTA. Hãy thử tải lại trạng thái mà không phát hành lệnh mới.",
                ),
              }
            : current,
        );
      }
    },
    [loadEvents, updateDevice],
  );

  const trackCommand = useCallback(
    async (deviceId: string, initialCommand: SmartHealthDeviceCommand) => {
      commandPollController.current?.abort();
      const controller = new AbortController();
      commandPollController.current = controller;
      setCommandOperation({
        deviceId,
        command: initialCommand,
        polling: !isDeviceCommandTerminal(initialCommand.state),
        timedOut: false,
        error: "",
      });
      updateDeviceCommand(deviceId, initialCommand);

      try {
        const result = await pollDeviceCommandToTerminal({
          initialCommand,
          signal: controller.signal,
          load: async (signal) => {
            const response = await smartHealthApi.getDeviceCommand(
              deviceId,
              initialCommand.id,
              signal,
            );
            return response.command;
          },
          onUpdate: (command) => {
            updateDeviceCommand(deviceId, command);
            setCommandOperation({
              deviceId,
              command,
              polling: !isDeviceCommandTerminal(command.state),
              timedOut: false,
              error: "",
            });
          },
        });
        if (controller.signal.aborted) return;

        updateDeviceCommand(deviceId, result.command);
        setCommandOperation({
          deviceId,
          command: result.command,
          polling: false,
          timedOut: result.timedOut,
          error: result.timedOut
            ? "Chưa nhận được trạng thái cuối từ thiết bị. Có thể thử tải lại mà không gửi lệnh mới."
            : "",
        });
        if (!result.timedOut) {
          const presentation = COMMAND_STATUS_PRESENTATION[result.command.state];
          if (result.command.type === "ota.update" && result.command.state === "applied") {
            const otaPresentation = DEVICE_OTA_STATUS_PRESENTATION.rebooting;
            toast.info(otaPresentation.label, { description: otaPresentation.description });
          } else if (result.command.state === "applied") {
            toast.success(presentation.label, { description: presentation.description });
          } else {
            toast.error(presentation.label, { description: presentation.description });
          }
        }
        void loadEvents(deviceId);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCommandOperation((current) =>
          current?.deviceId === deviceId
            ? {
                ...current,
                polling: false,
                error: toVietnameseErrorMessage(
                  error,
                  "Không thể cập nhật trạng thái lệnh. Hãy thử tải lại trạng thái.",
                ),
              }
            : current,
        );
      }
    },
    [loadEvents, updateDeviceCommand],
  );

  const openDevice = useCallback(
    (device: SmartHealthDevice) => {
      commandPollController.current?.abort();
      otaPollController.current?.abort();
      setSelectedDevice(device);
      setEvents([]);
      setEventsError("");
      setOtaForm({
        ...EMPTY_OTA_FORM,
        firmwareVersion: device.firmwareVersion || device.ota?.firmwareVersion || "",
        checksum: device.ota?.checksum || "",
        firmwareFileId: device.ota?.firmwareFileId || "",
        hardwareTarget: device.ota?.hardwareTarget || EMPTY_OTA_FORM.hardwareTarget,
        partitionTarget: device.ota?.partitionTarget || EMPTY_OTA_FORM.partitionTarget,
        minimumProtocolVersion: String(
          device.ota?.minimumProtocolVersion || EMPTY_OTA_FORM.minimumProtocolVersion,
        ),
      });
      setOtaFieldErrors({});
      setOtaSubmitError("");
      setOtaIdempotencyKey("");
      void loadEvents(device.id);

      const lastCommand = device.lastCommand;
      if (lastCommand && isDeviceCommandState(lastCommand.state)) {
        if (isDeviceCommandTerminal(lastCommand.state)) {
          setCommandOperation({
            deviceId: device.id,
            command: lastCommand,
            polling: false,
            timedOut: false,
            error: "",
          });
        } else {
          void trackCommand(device.id, lastCommand);
        }
      } else {
        setCommandOperation(null);
      }

      const otaCommandId = device.ota?.commandId;
      const otaFirmwareVersion = device.ota?.firmwareVersion;
      if (otaCommandId && otaFirmwareVersion) {
        const expectation = {
          commandId: otaCommandId,
          firmwareVersion: otaFirmwareVersion,
        };
        const otaState = getDeviceOtaState(device);
        const confirmationMismatch =
          otaState === "confirmed" && !isDeviceOtaSuccessful(device, expectation);
        setOtaOperation({
          deviceId: device.id,
          ...expectation,
          state: confirmationMismatch ? "failed" : otaState,
          polling: false,
          timedOut: false,
          error: confirmationMismatch
            ? "Backend báo confirmed nhưng command hoặc phiên bản firmware không khớp mục tiêu."
            : "",
        });
        if (!isDeviceOtaTerminal(otaState)) {
          void trackOta(device.id, device, expectation);
        }
      } else {
        setOtaOperation(null);
      }
    },
    [loadEvents, trackCommand, trackOta],
  );

  const closeDevice = () => {
    commandPollController.current?.abort();
    otaPollController.current?.abort();
    setSelectedDevice(null);
    setCommandOperation(null);
    setOtaOperation(null);
    setEvents([]);
    setEventsError("");
  };

  const updateOtaField = (field: OtaDraftField, value: string) => {
    setOtaForm((current) => ({ ...current, [field]: value }));
    setOtaFieldErrors((current) => ({ ...current, [field]: undefined }));
    setOtaSubmitError("");
    setOtaIdempotencyKey("");
  };

  const retryCommandStatus = () => {
    if (commandOperation) {
      void trackCommand(commandOperation.deviceId, commandOperation.command);
    }
  };

  const retryOtaStatus = () => {
    if (!otaOperation) return;
    const device =
      selectedDevice?.id === otaOperation.deviceId
        ? selectedDevice
        : devices.find((item) => item.id === otaOperation.deviceId);
    if (!device) return;
    void trackOta(device.id, device, {
      commandId: otaOperation.commandId,
      firmwareVersion: otaOperation.firmwareVersion,
    });
  };

  const runDangerAction = async () => {
    if (!dangerAction) return;
    if (!canManageDevices) {
      setDangerError("Tài khoản không có quyền quản lý thiết bị.");
      return;
    }
    setDangerLoading(true);
    setDangerError("");
    try {
      if (dangerAction.kind === "revoke") {
        const operationKey =
          dangerAction.idempotencyKey ||
          createDeviceOperationIdempotencyKey("revoke", dangerAction.device.id);
        if (!dangerAction.idempotencyKey) {
          setDangerAction((current) =>
            current?.kind === "revoke" ? { ...current, idempotencyKey: operationKey } : current,
          );
        }
        const { device } = await smartHealthApi.revokeDevice(dangerAction.device.id, operationKey);
        updateDevice(device);
        toast.success("Đã thu hồi thiết bị.");
      } else {
        if (!isDeviceOnline(dangerAction.device)) {
          setDangerError(
            "Thiết bị đang offline. Backend không xếp hàng giả; hãy chờ thiết bị xác thực trực tuyến rồi thử lại.",
          );
          return;
        }
        const operationKey =
          dangerAction.idempotencyKey ||
          createDeviceOperationIdempotencyKey("restart", dangerAction.device.id);
        const result = await smartHealthApi.sendDeviceCommand(
          dangerAction.device.id,
          { type: "restart" },
          operationKey,
        );
        updateDevice({ ...result.device, lastCommand: result.command });
        if (!isDeviceCommandTerminal(result.command.state)) {
          const presentation = COMMAND_STATUS_PRESENTATION[result.command.state];
          toast.info(presentation.label, { description: presentation.description });
        }
        void trackCommand(dangerAction.device.id, result.command);
      }
      setDangerAction(null);
    } catch (error) {
      setDangerError(toVietnameseErrorMessage(error, "Không thể thực hiện thao tác thiết bị."));
    } finally {
      setDangerLoading(false);
    }
  };

  const applyFirmwareFile = (fileId: string) => {
    const file = firmwareFiles.find((item) => item.id === fileId);
    setOtaForm((current) => ({
      ...current,
      firmwareFileId: fileId,
      url: fileId ? "" : current.url,
      firmwareVersion: file?.firmwareVersion || current.firmwareVersion,
      checksum: file?.checksum || file?.sha256 || current.checksum,
    }));
    setOtaFieldErrors({});
    setOtaSubmitError("");
    setOtaIdempotencyKey("");
  };

  const pushOta = async (device: SmartHealthDevice) => {
    if (!isPlatformAdmin) {
      setOtaSubmitError("Chỉ Platform Admin mới có quyền phát hành OTA.");
      return;
    }
    if (!isDeviceOnline(device)) {
      setOtaSubmitError("Thiết bị đang offline. OTA chỉ được tạo khi có kết nối WSS đã xác thực.");
      return;
    }

    const validation = validateOtaDraft(otaForm);
    setOtaFieldErrors(validation.fieldErrors);
    if (!validation.valid) {
      setOtaSubmitError("Kiểm tra lại các trường manifest OTA được đánh dấu.");
      return;
    }

    const operationKey = otaIdempotencyKey || createDeviceOperationIdempotencyKey("ota", device.id);
    const targetFirmwareVersion = otaForm.firmwareVersion.trim();
    setOtaIdempotencyKey(operationKey);
    setOtaSubmitError("");
    setActionLoading(`ota-${device.id}`);
    try {
      const result = await smartHealthApi.pushDeviceOta(
        device.id,
        {
          firmwareVersion: targetFirmwareVersion,
          url: otaForm.firmwareFileId ? undefined : otaForm.url.trim(),
          checksum: otaForm.checksum.trim().toLowerCase(),
          firmwareFileId: otaForm.firmwareFileId || undefined,
          hardwareTarget: "MSM261S4030H0",
          partitionTarget: "app",
          minimumProtocolVersion: Number(otaForm.minimumProtocolVersion),
        },
        operationKey,
      );
      setOtaIdempotencyKey("");
      updateDevice({ ...result.device, lastCommand: result.command });
      if (!isDeviceCommandTerminal(result.command.state)) {
        const presentation = COMMAND_STATUS_PRESENTATION[result.command.state];
        toast.info(presentation.label, { description: presentation.description });
      }
      void trackCommand(device.id, result.command);
      void trackOta(device.id, result.device, {
        commandId: result.command.id,
        firmwareVersion: targetFirmwareVersion,
      });
      void loadEvents(device.id);
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Không thể tạo lệnh OTA.");
      setOtaSubmitError(message);
      toast.error("Không thể tạo lệnh OTA", { description: message });
    } finally {
      setActionLoading("");
    }
  };

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        eyebrow="Cloud device control"
        title="Quản lý thiết bị"
        description="Theo dõi ống nghe qua backend cloud: online/offline, realtime audio, firmware OTA, trạng thái WiFi và lịch sử lệnh kỹ thuật."
        action={
          <CapabilityGate capabilities={DEVICE_MANAGE_CAPABILITIES}>
            <button
              onClick={() => setAddDialogOpen(true)}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Thêm thiết bị
            </button>
            <button
              onClick={() => setActivateDialogOpen(true)}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Wifi className="h-4 w-4" />
              Kích hoạt thiết bị
            </button>
          </CapabilityGate>
        }
      />

      {backendError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{backendError}</span>
          <button
            type="button"
            onClick={() => void loadDevices()}
            className="min-h-11 shrink-0 rounded-md border border-border bg-card px-3 py-2 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Thử tải lại thiết bị
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase text-muted-foreground">Tổng thiết bị</div>
          <div className="mt-2 text-2xl font-bold">{deviceSummary.total}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase text-muted-foreground">Online cloud</div>
          <div className="mt-2 text-2xl font-bold text-success">{deviceSummary.online}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase text-muted-foreground">Offline</div>
          <div className="mt-2 text-2xl font-bold text-destructive">{deviceSummary.offline}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase text-muted-foreground">OTA đang chờ</div>
          <div className="mt-2 text-2xl font-bold text-warning">{deviceSummary.otaPending}</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              aria-label="Tìm thiết bị"
              placeholder="Tìm ID, tên, firmware, WiFi, IP..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring"
            />
          </div>
          <select
            aria-label="Lọc thiết bị theo trạng thái"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="online">Đang online</option>
            <option value="offline">Offline</option>
            <option value="revoked">Đã thu hồi</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3 font-medium">Thiết bị</th>
                <th className="px-5 py-3 font-medium">Workspace</th>
                <th className="px-5 py-3 font-medium">Cloud</th>
                <th className="px-5 py-3 font-medium">WiFi / IP</th>
                <th className="px-5 py-3 font-medium">Firmware</th>
                <th className="px-5 py-3 font-medium">Pin</th>
                <th className="px-5 py-3 font-medium">Heartbeat</th>
                <th className="px-5 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {devices.map((device) => {
                const online = isDeviceOnline(device);
                const otaPresentation =
                  device.otaStatus || device.ota
                    ? DEVICE_OTA_STATUS_PRESENTATION[getDeviceOtaState(device)]
                    : null;
                return (
                  <motion.tr
                    key={device.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <MonitorSpeaker className="h-4 w-4 text-primary" />
                        {device.name || "Thiết bị Shcare"}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {device.id}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {device.organizationId || "Chưa gán workspace"}
                    </td>
                    <td className="px-5 py-4">
                      {online ? (
                        <StatusBadge label="Online" tone="success" pulse />
                      ) : device.status === "revoked" ? (
                        <StatusBadge label="Đã thu hồi" tone="error" />
                      ) : (
                        <StatusBadge label="Offline" tone="error" />
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {device.audioStatus || device.connectionMethod || "Cloud WSS"}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">
                      <div>{device.wifiSsid || "Chưa báo cáo WiFi"}</div>
                      <div className="text-xs">
                        {device.ipAddress || "Chưa có IP"}{" "}
                        {typeof device.wifiRssi === "number" ? `/ RSSI ${device.wifiRssi} dBm` : ""}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-muted-foreground">
                        {device.firmwareVersion || device.ota?.firmwareVersion || "Chưa báo cáo"}
                      </div>
                      {otaPresentation ? (
                        <div className="mt-1 text-xs text-warning">
                          OTA: {otaPresentation.label}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        {Number(device.battery) > 50 ? (
                          <Battery className="h-4 w-4 text-success" />
                        ) : Number(device.battery) > 20 ? (
                          <BatteryMedium className="h-4 w-4 text-warning" />
                        ) : (
                          <BatteryLow className="h-4 w-4 text-destructive" />
                        )}
                        {formatBattery(device.battery)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      {formatRelative(device.lastSeenAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => openDevice(device)}
                        className="min-h-11 min-w-11 rounded-md p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Mở chi tiết thiết bị ${device.name || device.id}`}
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Đang tải dữ liệu thiết bị...
                  </td>
                </tr>
              ) : null}
              {!isLoading && !hasDevices ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không tìm thấy thiết bị phù hợp.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <PaginationFooter
          page={page}
          pageSize={pagination.limit}
          totalItems={pagination.totalCount}
          itemLabel="thiết bị"
          onPageChange={setPage}
        />
      </div>

      <DetailDrawer
        open={Boolean(selectedDevice)}
        onOpenChange={(open) => {
          if (!open) closeDevice();
        }}
        title={
          selectedDevice
            ? `Chi tiết thiết bị ${selectedDevice.name || selectedDevice.id}`
            : "Chi tiết thiết bị"
        }
        className="max-w-[560px]"
      >
        {selectedDevice ? (
          <>
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border p-5">
                <div>
                  <DetailDrawerTitle className="flex items-center gap-2 leading-tight">
                    <Stethoscope className="h-5 w-5 text-primary" />
                    {selectedDevice.name || "Thiết bị Shcare"}
                  </DetailDrawerTitle>
                  <DetailDrawerDescription className="mt-1 font-mono text-xs">
                    {selectedDevice.id}
                  </DetailDrawerDescription>
                </div>
                <DetailDrawerClose label="Đóng chi tiết thiết bị" />
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    {isDeviceOnline(selectedDevice) ? (
                      <>
                        <Wifi className="h-5 w-5 text-success" />
                        <span className="text-sm font-semibold uppercase tracking-wide text-success">
                          Online qua cloud
                        </span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-5 w-5 text-destructive" />
                        <span className="text-sm font-semibold uppercase tracking-wide text-danger-text">
                          Offline
                        </span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Heartbeat cuối</div>
                      <div className="font-medium">{formatDateTime(selectedDevice.lastSeenAt)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Realtime audio</div>
                      <div className="font-medium">
                        {selectedDevice.audioStatus || "Chưa báo cáo"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">WiFi</div>
                      <div className="font-medium">{selectedDevice.wifiSsid || "Chưa báo cáo"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">IP thiết bị</div>
                      <div className="font-medium">
                        {selectedDevice.ipAddress || "Chưa báo cáo"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Firmware</div>
                      <div className="font-medium">
                        {selectedDevice.firmwareVersion || "Chưa báo cáo"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Lệnh cuối</div>
                      <div className="font-medium">
                        {selectedDevice.lastCommand &&
                        isDeviceCommandState(selectedDevice.lastCommand.state)
                          ? `${selectedDevice.lastCommand.type} · ${COMMAND_STATUS_PRESENTATION[selectedDevice.lastCommand.state].label}`
                          : "Chưa có lệnh"}
                      </div>
                    </div>
                  </div>
                </div>

                <section
                  aria-labelledby="device-telemetry-heading"
                  className="rounded-xl border border-border bg-muted/20 p-5"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                    <h3
                      id="device-telemetry-heading"
                      className="text-sm font-semibold text-foreground"
                    >
                      Dữ liệu sức khỏe thiết bị
                    </h3>
                  </div>
                  {hasReportedTelemetry(selectedDevice.telemetry) ? (
                    <dl className="grid grid-cols-1 gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">Âm thanh (I2S)</dt>
                        <dd className="mt-1 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                          {selectedDevice.telemetry.i2sStatus || "Chưa báo cáo"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Thời gian hoạt động</dt>
                        <dd className="mt-1 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                          {formatTelemetryUptime(selectedDevice.telemetry.uptimeMs)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Bộ nhớ trống</dt>
                        <dd className="mt-1 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                          {formatTelemetryBytes(selectedDevice.telemetry.freeHeapBytes)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Gói âm thanh bị mất</dt>
                        <dd className="mt-1 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                          {formatTelemetryCount(selectedDevice.telemetry.audioPacketsDropped)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Trạng thái lệnh gần nhất</dt>
                        <dd className="mt-1 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                          {formatTelemetryCommand(selectedDevice.telemetry)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Trạng thái cập nhật</dt>
                        <dd className="mt-1 break-words font-medium text-foreground [overflow-wrap:anywhere]">
                          {selectedDevice.telemetry.otaStatus
                            ? DEVICE_OTA_STATUS_PRESENTATION[
                                getDeviceOtaState({
                                  otaStatus: selectedDevice.telemetry.otaStatus,
                                })
                              ].label
                            : "Chưa báo cáo"}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-sm leading-6 text-muted-foreground" role="note">
                      Thiết bị chưa gửi dữ liệu sức khỏe. Không suy diễn trạng thái này từ kết nối
                      cloud.
                    </p>
                  )}
                </section>

                <section
                  aria-labelledby="device-inventory-heading"
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <h3
                    id="device-inventory-heading"
                    className="text-sm font-semibold text-foreground"
                  >
                    Thông tin quản lý thiết bị
                  </h3>
                  <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted-foreground">Loại thiết bị</dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {formatDeviceType(selectedDevice.type)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Nhà sản xuất</dt>
                      <dd className="mt-1 break-words font-medium text-foreground">
                        {selectedDevice.manufacturer || "Chưa cập nhật"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Model</dt>
                      <dd className="mt-1 break-words font-medium text-foreground">
                        {selectedDevice.model || "Chưa cập nhật"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Số serial</dt>
                      <dd className="mt-1 break-words font-mono text-foreground">
                        {selectedDevice.serialNumber || "Chưa cập nhật"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Ngày mua</dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {formatInventoryDate(selectedDevice.purchaseDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Workspace ID</dt>
                      <dd className="mt-1 break-words font-mono text-foreground">
                        {selectedDevice.organizationId || "Chưa gán"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Tài khoản chịu trách nhiệm</dt>
                      <dd className="mt-1 break-words font-mono text-foreground">
                        {selectedDevice.ownerUserId || selectedDevice.pairedUserId || "Chưa cấp"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Bệnh nhân được gán</dt>
                      <dd className="mt-1 break-words font-mono text-foreground">
                        {selectedDevice.assignedPatientId || "Chưa gán"}
                      </dd>
                    </div>
                  </dl>
                </section>

                {commandOperation?.deviceId === selectedDevice.id ? (
                  <div className="rounded-xl border border-border bg-card p-4" aria-live="polite">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          Trạng thái lệnh {commandOperation.command.type}
                        </div>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          {getCommandOperationPresentation(commandOperation.command).description}
                        </p>
                      </div>
                      <StatusBadge
                        label={getCommandOperationPresentation(commandOperation.command).label}
                        tone={getCommandOperationPresentation(commandOperation.command).tone}
                        pulse={commandOperation.polling}
                      />
                    </div>
                    {commandOperation.polling ? (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Đang chờ ACK hoặc kết quả cuối từ đúng thiết bị...
                      </div>
                    ) : null}
                    {commandOperation.command.code &&
                    /^[A-Z0-9_]{1,80}$/.test(commandOperation.command.code) ? (
                      <div className="mt-3 font-mono text-xs text-muted-foreground">
                        Mã trạng thái: {commandOperation.command.code}
                      </div>
                    ) : null}
                    {commandOperation.error ? (
                      <div
                        role="alert"
                        className="mt-3 rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm text-foreground"
                      >
                        <p className="leading-5">{commandOperation.error}</p>
                        <button
                          type="button"
                          onClick={retryCommandStatus}
                          className="mt-3 min-h-11 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Thử tải lại trạng thái
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {otaOperation?.deviceId === selectedDevice.id ? (
                  <div className="rounded-xl border border-border bg-card p-4" aria-live="polite">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          OTA firmware {otaOperation.firmwareVersion}
                        </div>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          {DEVICE_OTA_STATUS_PRESENTATION[otaOperation.state].description}
                        </p>
                      </div>
                      <StatusBadge
                        label={DEVICE_OTA_STATUS_PRESENTATION[otaOperation.state].label}
                        tone={DEVICE_OTA_STATUS_PRESENTATION[otaOperation.state].tone}
                        pulse={otaOperation.polling}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      {(
                        [
                          "pending",
                          "delivered",
                          "downloading",
                          "verifying",
                          "rebooting",
                          "confirmed",
                        ] as const
                      ).map((state) => (
                        <div
                          key={state}
                          className={`rounded-md border px-2 py-1.5 ${
                            otaOperation.state === state
                              ? "border-primary/40 bg-primary/10 font-medium text-foreground"
                              : "border-border bg-muted/20 text-muted-foreground"
                          }`}
                        >
                          {DEVICE_OTA_STATUS_PRESENTATION[state].label}
                        </div>
                      ))}
                    </div>
                    {otaOperation.polling ? (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Đang đối chiếu OTA ID, reconnect WSS và firmware telemetry...
                      </div>
                    ) : null}
                    {otaOperation.error ? (
                      <div
                        role="alert"
                        className="mt-3 rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm text-foreground"
                      >
                        <p className="leading-5">{otaOperation.error}</p>
                        <button
                          type="button"
                          onClick={retryOtaStatus}
                          className="mt-3 min-h-11 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Thử tải lại trạng thái OTA
                        </button>
                      </div>
                    ) : null}
                    <p className="mt-3 font-mono text-xs text-muted-foreground">
                      Command: {otaOperation.commandId}
                    </p>
                  </div>
                ) : null}

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center gap-2 font-semibold">
                    <Router className="h-4 w-4 text-primary" />
                    Cấu hình Wi‑Fi cho thiết bị
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Sau khi Admin phân công trực tiếp, người dùng chỉ nhập Device ID trong App rồi
                    dùng màn Kết nối Wi‑Fi để phát cấu hình ESPTouch V2 Broadcast. Claim code chỉ
                    dùng khi bàn giao một thiết bị còn ở kho workspace qua Portal; mã không chứa
                    device secret hoặc mật khẩu Wi‑Fi. SoftAP chỉ là phương án khôi phục vật lý có
                    thời hạn, không thuộc luồng chính trên App.
                  </p>
                </div>

                <CapabilityGate capabilities={DEVICE_MANAGE_CAPABILITIES}>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 font-semibold">
                        <FileCode2 className="h-4 w-4 text-primary" />
                        Cloud OTA firmware
                      </div>
                      <StatusBadge label="Chỉ Platform Admin" tone="warning" />
                    </div>

                    {isPlatformAdmin ? (
                      <div className="space-y-4">
                        <p className="text-xs leading-5 text-muted-foreground">
                          Backend chỉ xác nhận “đã áp dụng” sau khi thiết bị khởi động lại, mở một
                          phiên WSS đã xác thực và báo đúng phiên bản firmware đích.
                        </p>

                        <div>
                          <label
                            htmlFor="ota-firmware-file"
                            className="mb-1.5 block text-xs font-medium text-foreground"
                          >
                            Firmware đã kiểm soát trong storage
                          </label>
                          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                            <select
                              id="ota-firmware-file"
                              name="firmwareFileId"
                              value={otaForm.firmwareFileId}
                              onChange={(event) => applyFirmwareFile(event.target.value)}
                              className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                            >
                              <option value="">
                                {firmwareLoading
                                  ? "Đang tải firmware từ storage..."
                                  : "Chọn file .bin hoặc dùng URL HTTPS bên dưới"}
                              </option>
                              {firmwareFiles.map((file) => (
                                <option key={file.id} value={file.id}>
                                  {file.name}
                                  {file.firmwareVersion ? ` · v${file.firmwareVersion}` : ""}
                                  {file.size ? ` · ${file.size}` : ""}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void loadFirmwareFiles()}
                              disabled={firmwareLoading}
                              aria-label="Thử tải lại danh sách firmware"
                              className="min-h-11 min-w-11 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                            >
                              <RefreshCw
                                className={`h-4 w-4 ${firmwareLoading ? "animate-spin" : ""}`}
                              />
                            </button>
                          </div>
                        </div>

                        {firmwareError ? (
                          <div
                            role="alert"
                            className="rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-foreground"
                          >
                            <div>{firmwareError}</div>
                            <button
                              type="button"
                              onClick={() => void loadFirmwareFiles()}
                              className="mt-2 min-h-11 rounded-md border border-border bg-card px-3 py-2 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              Thử tải lại firmware
                            </button>
                          </div>
                        ) : null}

                        <div>
                          <label
                            htmlFor="ota-firmware-version"
                            className="mb-1.5 block text-xs font-medium text-foreground"
                          >
                            Phiên bản firmware <span className="text-destructive">*</span>
                          </label>
                          <input
                            id="ota-firmware-version"
                            name="firmwareVersion"
                            value={otaForm.firmwareVersion}
                            onChange={(event) =>
                              updateOtaField("firmwareVersion", event.target.value)
                            }
                            placeholder="1.2.3"
                            aria-invalid={Boolean(otaFieldErrors.firmwareVersion)}
                            aria-describedby={
                              otaFieldErrors.firmwareVersion
                                ? "ota-firmware-version-error"
                                : undefined
                            }
                            className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          />
                          {otaFieldErrors.firmwareVersion ? (
                            <p
                              id="ota-firmware-version-error"
                              className="mt-1 text-xs text-destructive"
                            >
                              {otaFieldErrors.firmwareVersion}
                            </p>
                          ) : null}
                        </div>

                        <div>
                          <label
                            htmlFor="ota-firmware-url"
                            className="mb-1.5 block text-xs font-medium text-foreground"
                          >
                            URL firmware HTTPS
                            {!otaForm.firmwareFileId ? (
                              <span className="text-destructive"> *</span>
                            ) : null}
                          </label>
                          <input
                            id="ota-firmware-url"
                            name="url"
                            type="url"
                            disabled={Boolean(otaForm.firmwareFileId)}
                            value={otaForm.url}
                            onChange={(event) => updateOtaField("url", event.target.value)}
                            placeholder="https://releases.shcare.vn/firmware-1.2.3.bin"
                            aria-invalid={Boolean(otaFieldErrors.url)}
                            aria-describedby={
                              otaFieldErrors.url ? "ota-firmware-url-error" : undefined
                            }
                            className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                          />
                          {otaFieldErrors.url ? (
                            <p
                              id="ota-firmware-url-error"
                              className="mt-1 text-xs text-destructive"
                            >
                              {otaFieldErrors.url}
                            </p>
                          ) : null}
                        </div>

                        <div>
                          <label
                            htmlFor="ota-checksum"
                            className="mb-1.5 block text-xs font-medium text-foreground"
                          >
                            SHA-256 <span className="text-destructive">*</span>
                          </label>
                          <input
                            id="ota-checksum"
                            name="checksum"
                            value={otaForm.checksum}
                            onChange={(event) => updateOtaField("checksum", event.target.value)}
                            placeholder="64 ký tự thập lục phân"
                            autoComplete="off"
                            spellCheck={false}
                            aria-invalid={Boolean(otaFieldErrors.checksum)}
                            aria-describedby={
                              otaFieldErrors.checksum ? "ota-checksum-error" : undefined
                            }
                            className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          />
                          {otaFieldErrors.checksum ? (
                            <p id="ota-checksum-error" className="mt-1 text-xs text-destructive">
                              {otaFieldErrors.checksum}
                            </p>
                          ) : null}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor="ota-hardware-target"
                              className="mb-1.5 block text-xs font-medium text-foreground"
                            >
                              Hardware target
                            </label>
                            <input
                              id="ota-hardware-target"
                              name="hardwareTarget"
                              readOnly
                              value={otaForm.hardwareTarget}
                              className="min-h-11 w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="ota-partition-target"
                              className="mb-1.5 block text-xs font-medium text-foreground"
                            >
                              Partition target
                            </label>
                            <input
                              id="ota-partition-target"
                              name="partitionTarget"
                              readOnly
                              value={otaForm.partitionTarget}
                              className="min-h-11 w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="ota-minimum-protocol"
                            className="mb-1.5 block text-xs font-medium text-foreground"
                          >
                            Minimum protocol version <span className="text-destructive">*</span>
                          </label>
                          <input
                            id="ota-minimum-protocol"
                            name="minimumProtocolVersion"
                            type="number"
                            min="1"
                            step="1"
                            value={otaForm.minimumProtocolVersion}
                            onChange={(event) =>
                              updateOtaField("minimumProtocolVersion", event.target.value)
                            }
                            aria-invalid={Boolean(otaFieldErrors.minimumProtocolVersion)}
                            aria-describedby={
                              otaFieldErrors.minimumProtocolVersion
                                ? "ota-minimum-protocol-error"
                                : undefined
                            }
                            className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          />
                          {otaFieldErrors.minimumProtocolVersion ? (
                            <p
                              id="ota-minimum-protocol-error"
                              className="mt-1 text-xs text-destructive"
                            >
                              {otaFieldErrors.minimumProtocolVersion}
                            </p>
                          ) : null}
                        </div>

                        {otaSubmitError ? (
                          <div
                            role="alert"
                            className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                          >
                            {otaSubmitError}
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => void pushOta(selectedDevice)}
                          disabled={
                            actionLoading === `ota-${selectedDevice.id}` ||
                            (otaOperation?.deviceId === selectedDevice.id &&
                              !isDeviceOtaTerminal(otaOperation.state)) ||
                            !isDeviceOnline(selectedDevice)
                          }
                          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FileCode2 className="h-4 w-4" />
                          {actionLoading === `ota-${selectedDevice.id}`
                            ? "Backend đang xác minh manifest..."
                            : otaOperation?.deviceId === selectedDevice.id &&
                                !isDeviceOtaTerminal(otaOperation.state)
                              ? otaOperation.polling
                                ? "Đang theo dõi OTA hiện tại"
                                : "Tải lại trạng thái OTA hiện tại trước"
                              : isDeviceOnline(selectedDevice)
                                ? "Tạo lệnh OTA an toàn"
                                : "Thiết bị offline — chưa thể OTA"}
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
                        Chỉ Platform Admin được tạo và phát hành manifest OTA. Tài khoản quản trị
                        workspace vẫn có thể xem trạng thái firmware nhưng không thể điều khiển
                        fleet.
                      </div>
                    )}
                  </div>
                </CapabilityGate>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">Lịch sử thiết bị</h3>
                    <button
                      type="button"
                      onClick={() => void loadEvents(selectedDevice.id)}
                      disabled={eventsLoading}
                      className="min-h-11 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      {eventsLoading ? "Đang tải..." : "Thử tải lại"}
                    </button>
                  </div>
                  {eventsLoading ? (
                    <div className="space-y-3" role="status" aria-live="polite">
                      <div className="h-14 animate-pulse rounded-lg bg-muted" />
                      <div className="h-14 animate-pulse rounded-lg bg-muted" />
                      <span className="sr-only">Đang tải lịch sử thiết bị</span>
                    </div>
                  ) : null}
                  {!eventsLoading && eventsError ? (
                    <div
                      role="alert"
                      className="rounded-lg border border-warning/25 bg-warning/10 p-4 text-sm text-foreground"
                    >
                      <p className="leading-5">{eventsError}</p>
                      <button
                        type="button"
                        onClick={() => void loadEvents(selectedDevice.id)}
                        className="mt-3 min-h-11 rounded-md border border-border bg-card px-3 py-2 font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Thử tải lại lịch sử
                      </button>
                    </div>
                  ) : null}
                  {!eventsLoading && !eventsError && events.length > 0 ? (
                    <Timeline
                      items={events.slice(0, 8).map((event) => ({
                        title: event.eventType,
                        time: formatRelative(event.createdAt),
                        description: summarizeDeviceEvent(event),
                        tone: eventTone(event.eventType),
                      }))}
                    />
                  ) : null}
                  {!eventsLoading && !eventsError && events.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Chưa có sự kiện cloud nào. Khi thiết bị xác thực, nhận lệnh hoặc báo trạng
                      thái, lịch sử an toàn sẽ xuất hiện ở đây.
                    </div>
                  ) : null}
                </div>
              </div>

              <CapabilityGate capabilities={DEVICE_MANAGE_CAPABILITIES}>
                <div className="border-t border-border bg-muted/20 p-5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setEditingDevice(selectedDevice)}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                      Chỉnh sửa thông tin
                    </button>
                    <button
                      onClick={() => setAssignmentDevice(selectedDevice)}
                      disabled={selectedDevice.status === "revoked"}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <UserRoundCog className="h-3.5 w-3.5" aria-hidden="true" />
                      {isPlatformAdmin ? "Phân công thiết bị" : "Gán bệnh nhân"}
                    </button>
                    {isPlatformAdmin ? (
                      <button
                        onClick={() => {
                          if (isDeviceWaitingForClaim(selectedDevice)) {
                            setClaimDevice(selectedDevice);
                            return;
                          }
                          toast.info("Thiết bị đã được phân công nên không cần claim code.", {
                            description:
                              "Tài khoản được Admin cấp trực tiếp chỉ cần nhập Device ID trong App. Muốn bàn giao bằng mã một lần, mở Phân công thiết bị, bỏ tài khoản và bệnh nhân, lưu về kho workspace rồi tạo mã claim.",
                          });
                        }}
                        disabled={selectedDevice.status === "revoked"}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                        Tạo mã claim
                      </button>
                    ) : null}
                    <button
                      onClick={() => setRotateSecretDevice(selectedDevice)}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Xoay khóa
                    </button>
                    <button
                      onClick={() =>
                        setDangerAction({
                          kind: "restart",
                          device: selectedDevice,
                          title: "Khởi động lại thiết bị",
                          confirmLabel: "Gửi lệnh restart",
                          idempotencyKey: createDeviceOperationIdempotencyKey(
                            "restart",
                            selectedDevice.id,
                          ),
                          description:
                            "Backend chỉ chấp nhận khi thiết bị đang online qua kênh đã xác thực. Thông báo giao lệnh không có nghĩa thiết bị đã khởi động lại; cần chờ trạng thái Đã áp dụng.",
                        })
                      }
                      disabled={!isDeviceOnline(selectedDevice) || commandOperation?.polling}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Power className="h-3.5 w-3.5" />
                      Restart
                    </button>
                    <button
                      onClick={() =>
                        setDangerAction({
                          kind: "revoke",
                          device: selectedDevice,
                          title: "Thu hồi thiết bị",
                          confirmLabel: "Thu hồi thiết bị",
                          idempotencyKey: createDeviceOperationIdempotencyKey(
                            "revoke",
                            selectedDevice.id,
                          ),
                          description:
                            "Thiết bị sẽ bị khóa khỏi workspace hiện tại và không được chấp nhận telemetry/audio cho đến khi được kích hoạt lại.",
                        })
                      }
                      className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Thu hồi
                    </button>
                  </div>
                </div>
              </CapabilityGate>
            </div>
          </>
        ) : null}
      </DetailDrawer>

      <AddDeviceDialog
        open={canManageDevices && addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={loadDevices}
      />
      <AddDeviceDialog
        initialDevice={claimDevice}
        open={isPlatformAdmin && Boolean(claimDevice)}
        onOpenChange={(open) => {
          if (!open) setClaimDevice(null);
        }}
        onCreated={loadDevices}
      />
      <ActivateDeviceDialog
        open={canManageDevices && activateDialogOpen}
        onOpenChange={setActivateDialogOpen}
        onActivated={loadDevices}
      />
      <RotateDeviceSecretDialog
        device={rotateSecretDevice}
        open={canManageDevices && Boolean(rotateSecretDevice)}
        onOpenChange={(open) => {
          if (!open) setRotateSecretDevice(null);
        }}
        onRotated={(device) => {
          updateDevice(device);
          void loadEvents(device.id);
        }}
      />
      <EditDeviceDialog
        device={editingDevice}
        open={canManageDevices && Boolean(editingDevice)}
        onOpenChange={(open) => {
          if (!open) setEditingDevice(null);
        }}
        onUpdated={(device) => {
          updateDevice(device);
          setSelectedDevice(device);
          void loadEvents(device.id);
        }}
      />
      <AssignDevicePatientDialog
        device={assignmentDevice}
        open={canManageDevices && Boolean(assignmentDevice)}
        onOpenChange={(open) => {
          if (!open) setAssignmentDevice(null);
        }}
        onAssigned={(device) => {
          updateDevice(device);
          setSelectedDevice(device);
          void loadEvents(device.id);
        }}
      />

      <ConfirmActionDialog
        open={Boolean(dangerAction)}
        title={dangerAction?.title || ""}
        description={dangerAction?.description || ""}
        confirmLabel={dangerAction?.confirmLabel || "Xác nhận"}
        tone={dangerAction?.kind === "restart" ? "warning" : "danger"}
        loading={dangerLoading}
        error={dangerError}
        onOpenChange={(open) => {
          if (!open) {
            setDangerAction(null);
            setDangerError("");
          }
        }}
        onConfirm={runDangerAction}
      />
    </div>
  );
}
