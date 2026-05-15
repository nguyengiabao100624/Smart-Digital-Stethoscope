import {
  ArrowLeft,
  Bell,
  BellOff,
  Volume2,
  Vibrate,
  AlertTriangle,
  CheckCircle,
  Info,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export default function NotificationSettings() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState({
    enabled: true,
    sound: true,
    vibration: true,
    abnormalResults: true,
    deviceConnection: true,
    appointments: true,
    aiUpdates: false,
    messages: true,
  });

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-6 shadow-md">
        <div className="flex items-center gap-4 text-white">
          <button
            onClick={() => navigate(-1)}
            className="hover:bg-white/10 p-2 rounded-full transition-colors -ml-2"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Tùy chọn thông báo</h1>
            <p className="text-white/80 text-sm">Quản lý cảnh báo và nhắc nhở</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 overflow-y-auto space-y-6">
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Tổng Quan
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#0B5C9A]/10 rounded-xl">
                    <Bell className="w-5 h-5 text-[#0B5C9A]" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Bật thông báo</p>
                    <p className="text-sm text-muted-foreground">
                      Nhận tất cả thông báo
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotification('enabled')}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    notifications.enabled ? 'bg-[#10B981]' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      notifications.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-xl">
                    <Volume2 className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Âm thanh</p>
                    <p className="text-sm text-muted-foreground">
                      Phát âm thanh cảnh báo
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotification('sound')}
                  disabled={!notifications.enabled}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    notifications.sound && notifications.enabled
                      ? 'bg-[#10B981]'
                      : 'bg-muted'
                  } ${!notifications.enabled && 'opacity-50'}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      notifications.sound && notifications.enabled
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-xl">
                    <Vibrate className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Rung</p>
                    <p className="text-sm text-muted-foreground">
                      Rung khi có thông báo
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotification('vibration')}
                  disabled={!notifications.enabled}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    notifications.vibration && notifications.enabled
                      ? 'bg-[#10B981]'
                      : 'bg-muted'
                  } ${!notifications.enabled && 'opacity-50'}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      notifications.vibration && notifications.enabled
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Loại Thông Báo
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">
                      Kết quả bất thường
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Cảnh báo khi phát hiện dấu hiệu bất thường
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotification('abnormalResults')}
                  disabled={!notifications.enabled}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    notifications.abnormalResults && notifications.enabled
                      ? 'bg-[#10B981]'
                      : 'bg-muted'
                  } ${!notifications.enabled && 'opacity-50'}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      notifications.abnormalResults && notifications.enabled
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">
                      Kết nối thiết bị
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Thông báo trạng thái ống nghe
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotification('deviceConnection')}
                  disabled={!notifications.enabled}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    notifications.deviceConnection && notifications.enabled
                      ? 'bg-[#10B981]'
                      : 'bg-muted'
                  } ${!notifications.enabled && 'opacity-50'}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      notifications.deviceConnection && notifications.enabled
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-xl">
                    <Calendar className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Lịch hẹn</p>
                    <p className="text-sm text-muted-foreground">
                      Nhắc nhở lịch khám bệnh
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotification('appointments')}
                  disabled={!notifications.enabled}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    notifications.appointments && notifications.enabled
                      ? 'bg-[#10B981]'
                      : 'bg-muted'
                  } ${!notifications.enabled && 'opacity-50'}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      notifications.appointments && notifications.enabled
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#00A896]/10 rounded-xl">
                    <MessageSquare className="w-5 h-5 text-[#00A896]" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Tin nhắn</p>
                    <p className="text-sm text-muted-foreground">
                      Chat AI và hỗ trợ
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotification('messages')}
                  disabled={!notifications.enabled}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    notifications.messages && notifications.enabled
                      ? 'bg-[#10B981]'
                      : 'bg-muted'
                  } ${!notifications.enabled && 'opacity-50'}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      notifications.messages && notifications.enabled
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-xl">
                    <Info className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Cập nhật AI</p>
                    <p className="text-sm text-muted-foreground">
                      Mô hình và tính năng mới
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toggleNotification('aiUpdates')}
                  disabled={!notifications.enabled}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    notifications.aiUpdates && notifications.enabled
                      ? 'bg-[#10B981]'
                      : 'bg-muted'
                  } ${!notifications.enabled && 'opacity-50'}`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      notifications.aiUpdates && notifications.enabled
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900 mb-1">Lưu ý</p>
              <p className="text-sm text-blue-800 leading-relaxed">
                Khuyến nghị bật thông báo "Kết quả bất thường" để nhận cảnh báo
                kịp thời về tình trạng sức khỏe bệnh nhân.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
