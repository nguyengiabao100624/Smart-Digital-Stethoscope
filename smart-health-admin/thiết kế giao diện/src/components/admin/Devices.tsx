import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Battery,
  BatteryLow,
  BatteryMedium,
  Clock,
  FileCode2,
  Info,
  MonitorSpeaker,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Router,
  Search,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AddDeviceDialog } from "./dialogs/AddDeviceDialog";
import { ActivateDeviceDialog } from "./dialogs/ActivateDeviceDialog";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { PageHeader, StatusBadge, Timeline } from "./design-system";
import {
  smartHealthApi,
  type SmartHealthDevice,
  type SmartHealthDeviceEvent,
  type SmartHealthStorageFile,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { CapabilityGate } from "./AdminAccessContext";
import { useAdminAccess } from "./useAdminAccess";
import { DEVICE_MANAGE_CAPABILITIES } from "./action-permissions";

type DangerKind = "revoke" | "unpair" | "delete" | "restart";

type DangerAction = {
  kind: DangerKind;
  device: SmartHealthDevice;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
};

function isDeviceOnline(device: SmartHealthDevice) {
  if (typeof device.online === "boolean") return device.online;
  if (device.connected) return true;
  if (device.lastSeenAt) {
    const lastSeen = Date.parse(device.lastSeenAt);
    return Number.isFinite(lastSeen) && Date.now() - lastSeen < 90_000;
  }
  return device.status === "connected";
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

function deviceSuffix(device: SmartHealthDevice) {
  return (
    String(device.id || "xxxxxx")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-6) || "xxxxxx"
  );
}

function eventTone(eventType: string): "success" | "warning" | "error" | "primary" | "muted" {
  if (/failed|rejected|error/i.test(eventType)) return "error";
  if (/ota|command|rotate|revoke|unpair/i.test(eventType)) return "warning";
  if (/telemetry|connected|hello/i.test(eventType)) return "success";
  return "muted";
}

export function Devices() {
  const { hasAnyCapability } = useAdminAccess();
  const canManageDevices = hasAnyCapability(DEVICE_MANAGE_CAPABILITIES);
  const [devices, setDevices] = useState<SmartHealthDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<SmartHealthDevice | null>(null);
  const [events, setEvents] = useState<SmartHealthDeviceEvent[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [dangerAction, setDangerAction] = useState<DangerAction | null>(null);
  const [dangerLoading, setDangerLoading] = useState(false);
  const [dangerError, setDangerError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [otaForm, setOtaForm] = useState({
    firmwareVersion: "",
    url: "",
    checksum: "",
    firmwareFileId: "",
  });
  const [firmwareFiles, setFirmwareFiles] = useState<SmartHealthStorageFile[]>([]);
  const [firmwareLoading, setFirmwareLoading] = useState(false);
  const [firmwareError, setFirmwareError] = useState("");

  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    try {
      const { devices: nextDevices } = await smartHealthApi.listDevices();
      setDevices(nextDevices);
      setBackendError(null);
      setSelectedDevice((current) =>
        current ? nextDevices.find((item) => item.id === current.id) || null : current,
      );
    } catch (error) {
      setDevices([]);
      setBackendError(toVietnameseErrorMessage(error, "Không thể tải dữ liệu thiết bị."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async (deviceId: string) => {
    try {
      const result = await smartHealthApi.listDeviceEvents(deviceId);
      setEvents(result.events || []);
    } catch {
      setEvents([]);
    }
  }, []);

  const loadFirmwareFiles = useCallback(async () => {
    setFirmwareLoading(true);
    try {
      const result = await smartHealthApi.listStorageFiles();
      setFirmwareFiles(
        (result.files || [])
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
    void loadDevices();
    void loadFirmwareFiles();
  }, [loadDevices, loadFirmwareFiles]);

  useEffect(() => {
    if (!selectedDevice) {
      setEvents([]);
      return;
    }
    setOtaForm({
      firmwareVersion: selectedDevice.firmwareVersion || selectedDevice.ota?.firmwareVersion || "",
      url: selectedDevice.ota?.url || "",
      checksum: selectedDevice.ota?.checksum || "",
      firmwareFileId: selectedDevice.ota?.firmwareFileId || "",
    });
    void loadEvents(selectedDevice.id);
  }, [loadEvents, selectedDevice]);

  const visibleDevices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return devices.filter((device) => {
      const online = isDeviceOnline(device);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "online" && online) ||
        (statusFilter === "offline" && !online) ||
        (statusFilter === "revoked" && device.status === "revoked");
      const matchesSearch =
        !query ||
        [
          device.id,
          device.name,
          device.organizationId,
          device.pairedUserId,
          device.firmwareVersion,
          device.wifiSsid,
          device.ipAddress,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [devices, searchTerm, statusFilter]);

  const onlineCount = devices.filter(isDeviceOnline).length;
  const offlineCount = Math.max(0, devices.length - onlineCount);

  const updateDevice = (device: SmartHealthDevice) => {
    setDevices((current) => current.map((item) => (item.id === device.id ? device : item)));
    setSelectedDevice((current) => (current?.id === device.id ? device : current));
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
        const { device } = await smartHealthApi.revokeDevice(dangerAction.device.id);
        updateDevice(device);
        toast.success("Đã thu hồi thiết bị.");
      } else if (dangerAction.kind === "unpair") {
        const { device } = await smartHealthApi.unpairDevice(dangerAction.device.id);
        updateDevice(device);
        toast.success("Đã hủy ghép đôi thiết bị.");
      } else if (dangerAction.kind === "restart") {
        const { device } = await smartHealthApi.sendDeviceCommand(dangerAction.device.id, {
          type: "restart",
        });
        updateDevice(device);
        toast.success("Đã gửi lệnh khởi động lại.");
      } else {
        await smartHealthApi.deleteDevice(dangerAction.device.id);
        setDevices((current) => current.filter((item) => item.id !== dangerAction.device.id));
        setSelectedDevice(null);
        toast.success("Đã xóa thiết bị.");
      }
      setDangerAction(null);
    } catch (error) {
      setDangerError(toVietnameseErrorMessage(error, "Không thể thực hiện thao tác thiết bị."));
    } finally {
      setDangerLoading(false);
    }
  };

  const rotateSecret = async (device: SmartHealthDevice) => {
    setActionLoading(`rotate-${device.id}`);
    try {
      const result = await smartHealthApi.rotateDeviceSecret(device.id);
      updateDevice(result.device);
      toast.success("Đã xoay khóa thiết bị. Thiết bị cần dùng secret mới ở lần kết nối tiếp theo.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể xoay khóa thiết bị."));
    } finally {
      setActionLoading("");
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
  };

  const pushOta = async (device: SmartHealthDevice) => {
    if (!otaForm.firmwareFileId && !otaForm.url.trim()) {
      toast.error("Cloud OTA cần chọn firmware từ storage hoặc nhập URL firmware HTTPS/HTTP.");
      return;
    }
    setActionLoading(`ota-${device.id}`);
    try {
      const result = await smartHealthApi.pushDeviceOta(device.id, {
        firmwareVersion: otaForm.firmwareVersion.trim(),
        url: otaForm.url.trim(),
        checksum: otaForm.checksum.trim(),
        firmwareFileId: otaForm.firmwareFileId,
      });
      updateDevice(result.device);
      toast.success(
        result.delivery?.delivered
          ? "Đã gửi lệnh OTA qua cloud."
          : "Đã lưu lệnh OTA. Thiết bị sẽ nhận khi kênh cloud hoạt động.",
      );
      void loadEvents(device.id);
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể gửi lệnh OTA."));
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
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#B45309]">
          {backendError}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase text-muted-foreground">Tổng thiết bị</div>
          <div className="mt-2 text-2xl font-bold">{devices.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase text-muted-foreground">Online cloud</div>
          <div className="mt-2 text-2xl font-bold text-success">{onlineCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase text-muted-foreground">Offline</div>
          <div className="mt-2 text-2xl font-bold text-destructive">{offlineCount}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase text-muted-foreground">OTA đang chờ</div>
          <div className="mt-2 text-2xl font-bold text-warning">
            {
              devices.filter((device) =>
                ["pending", "queued", "sent"].includes(String(device.otaStatus)),
              ).length
            }
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm ID, tên, firmware, WiFi, IP..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring"
            />
          </div>
          <select
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
              {visibleDevices.map((device) => {
                const online = isDeviceOnline(device);
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
                        {device.name || "Ống nghe Smart Health"}
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
                      {device.otaStatus ? (
                        <div className="mt-1 text-xs text-warning">OTA: {device.otaStatus}</div>
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
                      {formatRelative(device.lastSeenAt || device.updatedAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setSelectedDevice(device)}
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        title="Mở chi tiết thiết bị"
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
              {!isLoading && visibleDevices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không tìm thấy thiết bị phù hợp.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedDevice ? (
          <>
            <motion.div
              key="device-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px]"
              onClick={() => setSelectedDevice(null)}
            />
            <motion.aside
              key="device-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-[560px] border-l border-border bg-card shadow-2xl"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-border p-5">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold leading-tight">
                      <Stethoscope className="h-5 w-5 text-primary" />
                      {selectedDevice.name || "Ống nghe Smart Health"}
                    </h2>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {selectedDevice.id}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDevice(null)}
                    className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    title="Đóng"
                  >
                    <X className="h-5 w-5" />
                  </button>
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
                          <span className="text-sm font-semibold uppercase tracking-wide text-destructive">
                            Offline
                          </span>
                        </>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Heartbeat cuối</div>
                        <div className="font-medium">
                          {formatDateTime(selectedDevice.lastSeenAt)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Realtime audio</div>
                        <div className="font-medium">
                          {selectedDevice.audioStatus || "Chưa báo cáo"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">WiFi</div>
                        <div className="font-medium">
                          {selectedDevice.wifiSsid || "Chưa báo cáo"}
                        </div>
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
                          {selectedDevice.lastCommand?.type || "Chưa có lệnh"}
                          {selectedDevice.lastCommand?.status
                            ? ` / ${selectedDevice.lastCommand.status}`
                            : ""}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-3 flex items-center gap-2 font-semibold">
                      <Router className="h-4 w-4 text-primary" />
                      Khôi phục WiFi khi thiết bị mất mạng
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Khi ESP không vào được WiFi, thiết bị tự phát AP{" "}
                      <span className="font-mono text-foreground">
                        SmartHealth-{deviceSuffix(selectedDevice)}
                      </span>
                      . Người dùng kết nối AP đó, mở{" "}
                      <span className="font-mono text-foreground">http://192.168.4.1</span> và chỉ
                      nhập SSID/password WiFi mới. Trang local không cho đổi OTA, backend host,
                      secret hay quyền quản trị.
                    </p>
                  </div>

                  <CapabilityGate capabilities={DEVICE_MANAGE_CAPABILITIES}>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="mb-3 flex items-center gap-2 font-semibold">
                        <FileCode2 className="h-4 w-4 text-primary" />
                        Cloud OTA firmware
                      </div>
                      <div className="space-y-3">
                        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                          <select
                            value={otaForm.firmwareFileId}
                            onChange={(event) => applyFirmwareFile(event.target.value)}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                          >
                            <option value="">
                              {firmwareLoading
                                ? "Đang tải firmware từ storage..."
                                : "Chọn firmware đã upload trong bucket device-firmware"}
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
                            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${firmwareLoading ? "animate-spin" : ""}`}
                            />
                          </button>
                        </div>
                        {firmwareError ? (
                          <div className="rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-[#B45309]">
                            {firmwareError}
                          </div>
                        ) : null}
                        {otaForm.firmwareFileId ? (
                          <div className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">
                            Backend sẽ tạo URL OTA có token riêng cho ESP tải firmware, không cần
                            đăng nhập admin trên thiết bị.
                          </div>
                        ) : (
                          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            Chưa có file trong storage thì có thể nhập URL thủ công ở dưới. URL phải
                            truy cập được từ ESP qua Internet.
                          </div>
                        )}
                        <input
                          value={otaForm.firmwareVersion}
                          onChange={(event) =>
                            setOtaForm((current) => ({
                              ...current,
                              firmwareVersion: event.target.value,
                            }))
                          }
                          placeholder="Phiên bản firmware, ví dụ 1.0.2"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                        />
                        <input
                          value={otaForm.url}
                          onChange={(event) =>
                            setOtaForm((current) => ({ ...current, url: event.target.value }))
                          }
                          placeholder="HTTPS/HTTP firmware .bin URL từ storage hoặc release server"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                        />
                        <input
                          value={otaForm.checksum}
                          onChange={(event) =>
                            setOtaForm((current) => ({ ...current, checksum: event.target.value }))
                          }
                          placeholder="SHA-256 checksum, nếu có"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                        />
                        <button
                          onClick={() => void pushOta(selectedDevice)}
                          disabled={actionLoading === `ota-${selectedDevice.id}`}
                          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FileCode2 className="h-4 w-4" />
                          {actionLoading === `ota-${selectedDevice.id}`
                            ? "Đang gửi OTA..."
                            : "Gửi OTA qua cloud"}
                        </button>
                      </div>
                    </div>
                  </CapabilityGate>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Lịch sử thiết bị
                    </h3>
                    <Timeline
                      items={(events.length ? events : []).slice(0, 8).map((event) => ({
                        title: event.eventType,
                        time: formatRelative(event.createdAt),
                        description: event.payload
                          ? JSON.stringify(event.payload).slice(0, 160)
                          : "Không có payload.",
                        tone: eventTone(event.eventType),
                      }))}
                    />
                    {events.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                        Chưa có sự kiện cloud nào cho thiết bị này.
                      </div>
                    ) : null}
                  </div>
                </div>

                <CapabilityGate capabilities={DEVICE_MANAGE_CAPABILITIES}>
                  <div className="border-t border-border bg-muted/20 p-5">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => void rotateSecret(selectedDevice)}
                        disabled={actionLoading === `rotate-${selectedDevice.id}`}
                        className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
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
                            description:
                              "Backend sẽ gửi lệnh restart qua kênh cloud. Nếu thiết bị đang offline, lệnh chỉ được ghi nhận và cần gửi lại khi thiết bị online.",
                          })
                        }
                        className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
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
                            description:
                              "Thiết bị sẽ bị khóa khỏi workspace hiện tại và không được chấp nhận telemetry/audio cho đến khi được kích hoạt lại.",
                          })
                        }
                        className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Thu hồi
                      </button>
                      <button
                        onClick={() =>
                          setDangerAction({
                            kind: "unpair",
                            device: selectedDevice,
                            title: "Hủy ghép đôi thiết bị",
                            confirmLabel: "Hủy ghép đôi",
                            description:
                              "Liên kết giữa thiết bị và người dùng/workspace hiện tại sẽ bị gỡ. Hành động này được ghi audit log.",
                          })
                        }
                        className="flex items-center justify-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
                      >
                        <PowerOff className="h-3.5 w-3.5" />
                        Hủy ghép đôi
                      </button>
                      <button
                        onClick={() =>
                          setDangerAction({
                            kind: "delete",
                            device: selectedDevice,
                            title: "Xóa thiết bị",
                            confirmLabel: "Xóa thiết bị",
                            description:
                              "Thiết bị sẽ bị xóa khỏi danh sách quản trị. Chỉ thực hiện khi chắc chắn không còn dùng trong vận hành hoặc báo cáo.",
                          })
                        }
                        className="col-span-2 flex items-center justify-center gap-2 rounded-md bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa thiết bị
                      </button>
                    </div>
                  </div>
                </CapabilityGate>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <AddDeviceDialog
        open={canManageDevices && addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={loadDevices}
      />
      <ActivateDeviceDialog
        open={canManageDevices && activateDialogOpen}
        onOpenChange={setActivateDialogOpen}
        onActivated={loadDevices}
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
