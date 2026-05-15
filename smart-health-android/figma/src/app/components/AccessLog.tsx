import { ArrowLeft, Clock, ShieldAlert, MonitorSmartphone, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function AccessLog() {
  const navigate = useNavigate();

  const logs = [
    {
      id: 1,
      action: 'Đăng nhập thành công',
      device: 'Samsung Galaxy S23 Ultra',
      location: 'Hồ Chí Minh, Việt Nam (IP: 14.161.x.x)',
      time: '14:30 - Hôm nay',
      icon: <MonitorSmartphone className="w-5 h-5 text-[#00A896]" />,
      type: 'success'
    },
    {
      id: 2,
      action: 'Bác sĩ Nguyễn Trần B xem hồ sơ',
      device: 'Hệ thống Bệnh viện Đa khoa',
      location: 'Cổng thông tin nội bộ',
      time: '09:15 - Hôm nay',
      icon: <Clock className="w-5 h-5 text-[#0B5C9A]" />,
      type: 'info'
    },
    {
      id: 3,
      action: 'Xuất tệp báo cáo âm phổi (PDF)',
      device: 'Samsung Galaxy S23 Ultra',
      location: 'Ứng dụng di động',
      time: '18:45 - Hôm qua',
      icon: <Clock className="w-5 h-5 text-[#0B5C9A]" />,
      type: 'info'
    },
    {
      id: 4,
      action: 'Cảnh báo: Sai mật khẩu 3 lần',
      device: 'Trình duyệt Chrome (Windows)',
      location: 'Hà Nội, Việt Nam (IP: 113.190.x.x)',
      time: '20:10 - 12/05/2026',
      icon: <ShieldAlert className="w-5 h-5 text-red-500" />,
      type: 'danger'
    },
    {
      id: 5,
      action: 'Đổi mật khẩu tài khoản',
      device: 'Samsung Galaxy S23 Ultra',
      location: 'Hồ Chí Minh, Việt Nam',
      time: '19:00 - 10/05/2026',
      icon: <KeyRound className="w-5 h-5 text-[#0B5C9A]" />,
      type: 'info'
    }
  ];

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans flex flex-col">
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-200 shadow-sm z-10 sticky top-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-gray-900 text-lg font-semibold ml-2">Nhật Ký Truy Cập</h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <p className="text-sm text-gray-500 mb-6">Theo dõi các hoạt động đăng nhập và lịch sử truy cập dữ liệu y tế của bạn.</p>

        <div className="relative border-l-2 border-gray-200 ml-4 space-y-8 pb-8">
          {logs.map((log) => (
            <div key={log.id} className="relative pl-6">
              {/* Icon Marker */}
              <div className={`absolute -left-3 top-0 w-6 h-6 rounded-full flex items-center justify-center bg-white border-2 border-gray-200 shadow-sm`}>
                 <div className={`w-2.5 h-2.5 rounded-full ${
                   log.type === 'success' ? 'bg-[#00A896]' : log.type === 'danger' ? 'bg-red-500' : 'bg-[#0B5C9A]'
                 }`}></div>
              </div>

              {/* Content Card */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className={`text-sm font-bold ${log.type === 'danger' ? 'text-red-600' : 'text-gray-900'}`}>
                    {log.action}
                  </h3>
                  <span className="text-[11px] font-medium text-gray-400 whitespace-nowrap bg-gray-100 px-2 py-0.5 rounded-md">{log.time}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-600 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span> {log.device}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span> {log.location}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}