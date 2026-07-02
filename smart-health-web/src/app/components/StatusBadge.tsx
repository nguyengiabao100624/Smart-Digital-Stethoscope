interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const statusConfig: Record<
  string,
  { label: string; bg: string; color: string; border: string; dot?: string }
> = {
  online: {
    label: "Online",
    bg: "rgba(0,255,209,0.10)",
    color: "#00FFD1",
    border: "rgba(0,255,209,0.25)",
    dot: "#00FFD1",
  },
  offline: {
    label: "Offline",
    bg: "rgba(255,75,75,0.10)",
    color: "#FF6B6B",
    border: "rgba(255,75,75,0.25)",
    dot: "#FF6B6B",
  },
  measuring: {
    label: "Đang đo",
    bg: "rgba(74,164,224,0.12)",
    color: "#4AA4E0",
    border: "rgba(74,164,224,0.25)",
    dot: "#4AA4E0",
  },
  low_battery: {
    label: "Pin yếu",
    bg: "rgba(245,158,11,0.12)",
    color: "#F59E0B",
    border: "rgba(245,158,11,0.25)",
    dot: "#F59E0B",
  },
  unassigned: {
    label: "Chưa gán",
    bg: "rgba(255,255,255,0.06)",
    color: "#94b8d0",
    border: "rgba(255,255,255,0.12)",
  },
  revoked: {
    label: "Đã thu hồi",
    bg: "rgba(255,75,75,0.10)",
    color: "#FF6B6B",
    border: "rgba(255,75,75,0.25)",
  },
  active: {
    label: "Đang theo dõi",
    bg: "rgba(0,255,209,0.10)",
    color: "#00FFD1",
    border: "rgba(0,255,209,0.25)",
    dot: "#00FFD1",
  },
  pending_consent: {
    label: "Chờ consent",
    bg: "rgba(245,158,11,0.12)",
    color: "#F59E0B",
    border: "rgba(245,158,11,0.25)",
  },
  consent_accepted: {
    label: "Đã chấp nhận",
    bg: "rgba(0,255,209,0.10)",
    color: "#00FFD1",
    border: "rgba(0,255,209,0.25)",
  },
  consent_revoked: {
    label: "Đã thu hồi",
    bg: "rgba(255,75,75,0.10)",
    color: "#FF6B6B",
    border: "rgba(255,75,75,0.25)",
  },
  paused: {
    label: "Tạm dừng",
    bg: "rgba(255,255,255,0.06)",
    color: "#94b8d0",
    border: "rgba(255,255,255,0.12)",
  },
  pending: {
    label: "Chờ chấp nhận",
    bg: "rgba(245,158,11,0.12)",
    color: "#F59E0B",
    border: "rgba(245,158,11,0.25)",
  },
  accepted: {
    label: "Đã chấp nhận",
    bg: "rgba(0,255,209,0.10)",
    color: "#00FFD1",
    border: "rgba(0,255,209,0.25)",
  },
  expired: {
    label: "Hết hạn",
    bg: "rgba(255,255,255,0.06)",
    color: "#94b8d0",
    border: "rgba(255,255,255,0.12)",
  },
  new: {
    label: "Mới chưa xem",
    bg: "rgba(74,164,224,0.12)",
    color: "#4AA4E0",
    border: "rgba(74,164,224,0.25)",
  },
  needs_review: {
    label: "Cần xem lại",
    bg: "rgba(245,158,11,0.12)",
    color: "#F59E0B",
    border: "rgba(245,158,11,0.25)",
    dot: "#F59E0B",
  },
  reviewed: {
    label: "Đã xem",
    bg: "rgba(0,255,209,0.10)",
    color: "#00FFD1",
    border: "rgba(0,255,209,0.25)",
  },
  processing: {
    label: "Đang xử lý",
    bg: "rgba(74,164,224,0.12)",
    color: "#4AA4E0",
    border: "rgba(74,164,224,0.25)",
    dot: "#4AA4E0",
  },
  error: {
    label: "Lỗi",
    bg: "rgba(255,75,75,0.10)",
    color: "#FF6B6B",
    border: "rgba(255,75,75,0.25)",
  },
  high: {
    label: "Cao",
    bg: "rgba(255,75,75,0.10)",
    color: "#FF6B6B",
    border: "rgba(255,75,75,0.25)",
  },
  medium: {
    label: "Trung bình",
    bg: "rgba(245,158,11,0.12)",
    color: "#F59E0B",
    border: "rgba(245,158,11,0.25)",
  },
  low: {
    label: "Thấp",
    bg: "rgba(0,255,209,0.08)",
    color: "#00FFD1",
    border: "rgba(0,255,209,0.20)",
  },
  doctor: {
    label: "Bác sĩ",
    bg: "rgba(11,92,154,0.20)",
    color: "#4AA4E0",
    border: "rgba(11,92,154,0.35)",
  },
  nurse: {
    label: "Điều dưỡng",
    bg: "rgba(0,168,150,0.15)",
    color: "#00FFD1",
    border: "rgba(0,168,150,0.30)",
  },
  technician: {
    label: "Kỹ thuật viên",
    bg: "rgba(255,255,255,0.07)",
    color: "#94b8d0",
    border: "rgba(255,255,255,0.15)",
  },
  clinic_manager: {
    label: "Quản lý PK",
    bg: "rgba(114,87,232,0.15)",
    color: "#a78bfa",
    border: "rgba(114,87,232,0.30)",
  },
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    bg: "rgba(255,255,255,0.06)",
    color: "#94b8d0",
    border: "rgba(255,255,255,0.12)",
  };
  const padding = size === "sm" ? "2px 8px" : "3px 10px";
  const fontSize = size === "sm" ? 11 : 12;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-semibold"
      style={{
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        padding,
        fontSize: `${fontSize}px`,
        whiteSpace: "nowrap",
        letterSpacing: "0.01em",
      }}
    >
      {config.dot && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: config.dot, boxShadow: `0 0 5px ${config.dot}` }}
        />
      )}
      {config.label}
    </span>
  );
}
