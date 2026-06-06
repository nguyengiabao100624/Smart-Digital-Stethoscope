import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  ExternalLink,
  Download,
  Stethoscope,
  Building2,
  Activity,
  UserCheck,
  Wifi,
  FileText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { exportPDF, buildFilename } from "@/lib/export-utils";
import { getNotificationTone, getNotificationTypeLabel } from "@/lib/notification-events";

export interface NotificationItem {
  id: number | string;
  title: string;
  message: string;
  time: string;
  type: "warning" | "success" | "info" | string;
  isRead: boolean;
}

interface Props {
  notification: NotificationItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const META: Record<
  number,
  {
    label: string;
    items: { icon: LucideIcon; label: string; value: string }[];
    action?: { label: string; icon: LucideIcon; to?: string; download?: boolean };
  }
> = {
  1: {
    label: "Chi tiết cảnh báo AI",
    items: [
      { icon: Stethoscope, label: "Thiết bị", value: "Stetho-X1 · SN A3F2-991" },
      { icon: Building2, label: "Phòng khám", value: "PK Đa khoa Tâm Anh" },
      { icon: Activity, label: "Độ tin cậy AI", value: "94%" },
      { icon: Activity, label: "Chỉ số phát hiện", value: "Nhịp tim 142 bpm (bất thường)" },
    ],
    action: { label: "Xem lượt đo AI", icon: ExternalLink, to: "/ai-measurements" },
  },
  2: {
    label: "Yêu cầu chờ duyệt",
    items: [
      { icon: UserCheck, label: "Bác sĩ", value: "BS. Nguyễn Văn Tùng" },
      { icon: Stethoscope, label: "Chuyên khoa", value: "Tim mạch" },
      { icon: Building2, label: "Phòng khám", value: "PK Tim mạch Hà Nội" },
    ],
    action: { label: "Đi tới duyệt bác sĩ", icon: ExternalLink, to: "/doctor-approval" },
  },
  3: {
    label: "Thông tin cập nhật",
    items: [
      { icon: Activity, label: "Phiên bản", value: "Respiratory AI v1.8.0" },
      {
        icon: FileText,
        label: "Thay đổi chính",
        value: "Cải thiện độ chính xác 12%, giảm false-positive",
      },
      { icon: CheckCircle2, label: "Trạng thái triển khai", value: "100% thiết bị (89/89)" },
    ],
  },
  4: {
    label: "Báo cáo doanh thu",
    items: [
      { icon: FileText, label: "Kỳ báo cáo", value: "Tháng 04/2026" },
      { icon: Activity, label: "Tổng lượt đo", value: "12,845 lượt" },
      { icon: Building2, label: "Phòng khám đối tác", value: "23 phòng khám" },
    ],
    action: { label: "Tải báo cáo PDF", icon: Download, download: true },
  },
  5: {
    label: "Chi tiết thiết bị",
    items: [
      { icon: Stethoscope, label: "Thiết bị", value: "Stetho-Pro · SN B7K1-432" },
      { icon: Building2, label: "Phòng khám", value: "PK Hô hấp Việt" },
      { icon: Wifi, label: "Lần online cuối", value: "29/04/2026 18:42" },
      { icon: Clock, label: "Thời gian offline", value: "Hơn 24 giờ" },
    ],
    action: { label: "Xem chi tiết thiết bị", icon: ExternalLink, to: "/devices" },
  },
};

export function NotificationDetailDialog({ notification, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  if (!notification) return null;

  const normalizedTitle = notification.title.toLowerCase();
  const isDoctorApprovalNotice =
    normalizedTitle.includes("bác sĩ") || normalizedTitle.includes("duyệt");
  const meta = (typeof notification.id === "number" ? META[notification.id] : undefined) ?? {
    label: "Thông tin chi tiết",
    items: [
      { icon: Info, label: "Loại sự kiện", value: getNotificationTypeLabel(notification.type) },
      { icon: FileText, label: "Mã thông báo", value: String(notification.id) },
      { icon: Clock, label: "Thời gian", value: notification.time },
      {
        icon: CheckCircle2,
        label: "Trạng thái đọc",
        value: notification.isRead ? "Đã đọc" : "Chưa đọc",
      },
    ],
    action: isDoctorApprovalNotice
      ? { label: "Đi tới duyệt bác sĩ", icon: ExternalLink, to: "/doctor-approval" }
      : undefined,
  };

  const tone = getNotificationTone(notification.type);
  const Icon =
    tone === "warning" || tone === "error"
      ? AlertTriangle
      : tone === "success"
        ? CheckCircle2
        : Info;
  const iconColor =
    tone === "warning"
      ? "text-warning"
      : tone === "error"
        ? "text-destructive"
        : tone === "success"
          ? "text-success"
          : "text-primary";
  const iconBg =
    tone === "warning"
      ? "bg-warning/10"
      : tone === "error"
        ? "bg-destructive/10"
        : tone === "success"
          ? "bg-success/10"
          : "bg-primary/10";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content asChild>
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl shadow-xl w-full max-w-lg z-50 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${iconBg}`}>
                  <Icon className={`w-5 h-5 ${iconColor}`} />
                </div>
                <div>
                  <Dialog.Title className="font-semibold text-foreground leading-snug">
                    {notification.title}
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                    <Clock className="w-3.5 h-3.5" />
                    {notification.time}
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>

            <div className="p-6 space-y-5">
              <p className="text-sm text-foreground/85 leading-relaxed">{notification.message}</p>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  {meta.label}
                </h4>
                <div className="space-y-2">
                  {meta.items.map((item, i) => {
                    const ItemIcon = item.icon;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 + i * 0.04, duration: 0.2 }}
                        className="flex items-start gap-3 p-3 rounded-md bg-muted/40 border border-border/60"
                      >
                        <ItemIcon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">{item.label}</p>
                          <p className="text-sm font-medium text-foreground mt-0.5 break-words">
                            {item.value}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
                  >
                    Đóng
                  </button>
                </Dialog.Close>
                {meta.action && (
                  <button
                    type="button"
                    onClick={() => {
                      const a = meta.action!;
                      if (a.download) {
                        exportPDF(
                          buildFilename("BaoCao-DoanhThu", "042026", "pdf"),
                          {
                            title: "Báo cáo doanh thu",
                            period: "Tháng 04/2026",
                            author: "Quản trị viên Smart Health",
                            meta: {
                              "Kỳ báo cáo": "Tháng 04/2026",
                              "Tổng lượt đo": "12.845",
                              "Phòng khám đối tác": "23",
                            },
                            kpis: [
                              {
                                label: "Doanh thu",
                                value: "₫1.24 tỷ",
                                hint: "+18% so với kỳ trước",
                              },
                              { label: "Lượt đo", value: "12.845" },
                              { label: "Phòng khám", value: "23" },
                              { label: "Bệnh nhân", value: "4.218" },
                            ],
                          },
                          [
                            {
                              name: "Chi tiết thông báo",
                              headers: ["Trường", "Giá trị"],
                              rows: [
                                ["Tiêu đề", notification.title],
                                ["Nội dung", notification.message],
                                ["Loại sự kiện", getNotificationTypeLabel(notification.type)],
                                ["Thời gian", notification.time],
                                ["Trạng thái đọc", notification.isRead ? "Đã đọc" : "Chưa đọc"],
                              ],
                              align: ["left", "left"],
                            },
                          ],
                        );
                        toast.success("Đã tải báo cáo PDF");
                      } else if (a.to) {
                        navigate({ to: a.to });
                      }
                      onOpenChange(false);
                    }}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <meta.action.icon className="w-4 h-4" />
                    {meta.action.label}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
