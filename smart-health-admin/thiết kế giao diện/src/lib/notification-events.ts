export type NotificationTone = "info" | "success" | "warning" | "error";

export const NOTIFICATION_SYNC_EVENT = "smart-health:notifications-changed";

const EVENT_LABELS: Record<string, string> = {
  info: "Thông tin hệ thống",
  success: "Thao tác thành công",
  warning: "Cảnh báo cần xử lý",
  error: "Lỗi cần kiểm tra",
  danger: "Lỗi cần kiểm tra",
  failed: "Lỗi cần kiểm tra",
  failure: "Lỗi cần kiểm tra",
  doctor_approval: "Duyệt tài khoản bác sĩ",
  doctor_pending: "Bác sĩ chờ duyệt",
  doctor_approved: "Bác sĩ đã được duyệt",
  doctor_rejected: "Yêu cầu bác sĩ bị từ chối",
  doctor_info_requested: "Yêu cầu bổ sung hồ sơ bác sĩ",
  device_offline: "Thiết bị mất kết nối",
  device_online: "Thiết bị trực tuyến",
  device_heartbeat: "Heartbeat thiết bị",
  device_warning: "Cảnh báo thiết bị",
  ai_completed: "AI xử lý xong",
  ai_failed: "AI xử lý thất bại",
  ai_warning: "Cảnh báo AI",
  storage_warning: "Cảnh báo dung lượng lưu trữ",
  subscription_warning: "Cảnh báo gói dịch vụ",
  audit_export: "Xuất audit log",
  notification_sent: "Thông báo đã gửi",
};

function normalizeEventCode(type?: string | null) {
  return String(type || "info")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

export function getNotificationTone(type?: string | null): NotificationTone {
  const code = normalizeEventCode(type);

  if (
    code.includes("error") ||
    code.includes("fail") ||
    code.includes("rejected") ||
    code.includes("danger")
  ) {
    return "error";
  }

  if (
    code.includes("warning") ||
    code.includes("warn") ||
    code.includes("offline") ||
    code.includes("pending") ||
    code.includes("requested")
  ) {
    return "warning";
  }

  if (
    code.includes("success") ||
    code.includes("completed") ||
    code.includes("approved") ||
    code.includes("online") ||
    code.includes("sent")
  ) {
    return "success";
  }

  return "info";
}

export function getNotificationTypeLabel(type?: string | null) {
  const code = normalizeEventCode(type);
  if (EVENT_LABELS[code]) {
    return EVENT_LABELS[code];
  }

  switch (getNotificationTone(code)) {
    case "success":
      return "Thao tác thành công";
    case "warning":
      return "Cảnh báo cần xử lý";
    case "error":
      return "Lỗi cần kiểm tra";
    case "info":
    default:
      return "Thông tin hệ thống";
  }
}

export function dispatchNotificationSync() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(NOTIFICATION_SYNC_EVENT));
}
