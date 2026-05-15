import {
  ArrowLeft,
  Bell,
  CheckCircle,
  AlertTriangle,
  Info,
  Calendar,
  Trash2,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'warning',
      title: 'Kết quả bất thường',
      message: 'Bệnh nhân Trần Thị Mai - Phát hiện tiếng ran nổ đáy phổi trái. Cần tái khám.',
      time: '10 phút trước',
      read: false,
    },
    {
      id: '2',
      type: 'success',
      title: 'Kết nối thành công',
      message: 'Ống nghe thông minh đã được kết nối. Pin: 85%',
      time: '1 giờ trước',
      read: false,
    },
    {
      id: '3',
      type: 'info',
      title: 'Lịch hẹn sắp tới',
      message: 'Bệnh nhân Nguyễn Văn An - Tái khám vào 15:30 hôm nay',
      time: '2 giờ trước',
      read: true,
    },
    {
      id: '4',
      type: 'success',
      title: 'Cập nhật mô hình AI',
      message: 'Mô hình nhận diện tim phổi v3.2.1 đã được cài đặt thành công',
      time: '1 ngày trước',
      read: true,
    },
    {
      id: '5',
      type: 'info',
      title: 'Sao lưu dữ liệu',
      message: 'Dữ liệu đã được đồng bộ lên cloud. 247 hồ sơ mới',
      time: '2 ngày trước',
      read: true,
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-[#10B981]" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />;
      case 'info':
        return <Info className="w-5 h-5 text-[#0B5C9A]" />;
      default:
        return <Bell className="w-5 h-5 text-[#0B5C9A]" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-[#10B981]/10';
      case 'warning':
        return 'bg-[#F59E0B]/10';
      case 'info':
        return 'bg-[#0B5C9A]/10';
      default:
        return 'bg-muted';
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-6 shadow-md">
        <div className="flex items-center justify-between text-white mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="hover:bg-white/10 p-2 rounded-full transition-colors -ml-2"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Thông báo</h1>
              {unreadCount > 0 && (
                <p className="text-white/80 text-sm">
                  {unreadCount} thông báo chưa đọc
                </p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/30 hover:bg-white/30 transition-colors text-sm font-medium flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Đánh dấu đã đọc
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-6 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Bell className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Không có thông báo</h3>
            <p className="text-muted-foreground text-sm">
              Bạn sẽ nhận được thông báo khi có cập nhật mới
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`bg-white border rounded-2xl p-4 transition-all ${
                  notification.read
                    ? 'border-border opacity-70'
                    : 'border-[#0B5C9A]/30 shadow-sm'
                }`}
              >
                <div className="flex gap-3">
                  <div className={`p-2 rounded-xl ${getBgColor(notification.type)} shrink-0`}>
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-foreground">
                        {notification.title}
                      </h3>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-[#0B5C9A] rounded-full shrink-0 mt-2"></div>
                      )}
                    </div>
                    <p className="text-sm text-foreground/70 mb-2 leading-relaxed">
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{notification.time}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!notification.read && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="text-xs text-[#0B5C9A] hover:underline font-medium"
                          >
                            Đánh dấu đã đọc
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotification(notification.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
