import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Bell, Mail, Smartphone, AlertCircle, MessageSquare, Activity } from "lucide-react";
import { toast } from "sonner";

interface NotificationSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationSettingsDialog({
  open,
  onOpenChange,
}: NotificationSettingsDialogProps) {
  const [settings, setSettings] = useState({
    email: {
      newPatient: true,
      newMeasurement: true,
      deviceAlert: true,
      systemUpdate: false,
      weeklyReport: true,
    },
    push: {
      newPatient: true,
      newMeasurement: true,
      deviceAlert: true,
      systemUpdate: false,
      weeklyReport: false,
    },
    sms: {
      newPatient: false,
      newMeasurement: false,
      deviceAlert: true,
      systemUpdate: false,
      weeklyReport: false,
    },
  });

  const toggleSetting = (channel: keyof typeof settings, key: string) => {
    setSettings({
      ...settings,
      [channel]: {
        ...settings[channel],
        [key]: !settings[channel][key as keyof (typeof settings)[typeof channel]],
      },
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Lưu cài đặt thành công!", {
      description: "Cài đặt thông báo đã được cập nhật",
    });
    onOpenChange(false);
  };

  const notificationTypes = [
    { id: "newPatient", label: "Bệnh nhân mới", icon: Activity },
    { id: "newMeasurement", label: "Kết quả đo mới", icon: Activity },
    { id: "deviceAlert", label: "Cảnh báo thiết bị", icon: AlertCircle },
    { id: "systemUpdate", label: "Cập nhật hệ thống", icon: Bell },
    { id: "weeklyReport", label: "Báo cáo tuần", icon: MessageSquare },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl z-50 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">
                  Cài đặt thông báo
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Quản lý cách thức nhận thông báo
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSave} className="p-6 space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-foreground">
                      Loại thông báo
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <Mail className="w-4 h-4" />
                        <span className="text-xs">Email</span>
                      </div>
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <Smartphone className="w-4 h-4" />
                        <span className="text-xs">Push</span>
                      </div>
                    </th>
                    <th className="text-center py-3 px-4 font-medium text-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <MessageSquare className="w-4 h-4" />
                        <span className="text-xs">SMS</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {notificationTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <tr key={type.id} className="hover:bg-muted/30">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{type.label}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={settings.email[type.id as keyof typeof settings.email]}
                            onChange={() => toggleSetting("email", type.id)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={settings.push[type.id as keyof typeof settings.push]}
                            onChange={() => toggleSetting("push", type.id)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={settings.sms[type.id as keyof typeof settings.sms]}
                            onChange={() => toggleSetting("sms", type.id)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="font-medium text-foreground">Thiết lập nâng cao</h3>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 mt-1 rounded border-border text-primary focus:ring-ring"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Thông báo âm thanh</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Phát âm thanh khi có thông báo mới
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={false}
                    className="w-4 h-4 mt-1 rounded border-border text-primary focus:ring-ring"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      Không làm phiền (22:00 - 07:00)
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tắt thông báo trong khoảng thời gian này
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="w-4 h-4 mt-1 rounded border-border text-primary focus:ring-ring"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Tóm tắt hàng ngày</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Nhận email tóm tắt hoạt động mỗi ngày lúc 18:00
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-4 border border-border">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Lưu ý về thông báo khẩn cấp</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Các cảnh báo khẩn cấp về thiết bị và y tế sẽ luôn được gửi qua tất cả các kênh
                    bất kể cài đặt này.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
                >
                  Hủy
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Lưu cài đặt
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
