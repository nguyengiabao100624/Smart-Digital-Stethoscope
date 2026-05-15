import { Search, Bell, Battery, Bluetooth, Wifi, Activity, FileText, MessageSquare, Stethoscope, AlertTriangle, CheckCircle, Plus, Settings as SettingsIcon } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function Dashboard() {
  const navigate = useNavigate();
  const recentScans = [
    {
      id: 'BN-2845',
      name: 'Nguyễn Văn An',
      date: '12-05-2026',
      time: '14:35',
      type: 'Tim',
      status: 'normal',
      diagnosis: 'Nhịp xoang bình thường'
    },
    {
      id: 'BN-2844',
      name: 'Trần Thị Mai',
      date: '12-05-2026',
      time: '13:20',
      type: 'Phổi',
      status: 'abnormal',
      diagnosis: 'Phát hiện tiếng ran nổ - Đáy phổi trái'
    },
    {
      id: 'BN-2843',
      name: 'Lê Văn Minh',
      date: '12-05-2026',
      time: '11:45',
      type: 'Tim',
      status: 'normal',
      diagnosis: 'Âm sắc tim bình thường'
    }
  ];

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 pt-12 pb-24 rounded-b-[2rem]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-white/80 text-sm mb-1">Chào mừng trở lại,</p>
            <h1 className="text-white text-2xl font-semibold">Bs. Tuấn</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="relative bg-white/20 backdrop-blur-sm p-3 rounded-full border border-white/30 hover:bg-white/30 transition-colors"
            >
              <SettingsIcon className="w-6 h-6 text-white" />
            </button>
            <button
              onClick={() => navigate('/notifications')}
              className="relative bg-white/20 backdrop-blur-sm p-3 rounded-full border border-white/30 hover:bg-white/30 transition-colors"
            >
              <Bell className="w-6 h-6 text-white" />
              <span className="absolute top-1 right-1 w-3 h-3 bg-[#EF4444] rounded-full border-2 border-[#0B5C9A]"></span>
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60" />
          <input
            type="text"
            placeholder="Tìm kiếm bệnh nhân..."
            className="w-full pl-12 pr-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-2xl text-white placeholder:text-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 transition-shadow"
          />
        </div>
      </div>

      <div className="px-6 -mt-16 pb-20">
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-[#10B981]/10 p-2 rounded-xl">
                <Stethoscope className="w-6 h-6 text-[#10B981]" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">Trạng thái thiết bị</p>
                <p className="text-[#10B981] font-semibold text-sm">Đã kết nối</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <Battery className="w-5 h-5 text-[#10B981]" />
                <span className="text-sm font-medium">85%</span>
              </div>
              <button onClick={() => navigate('/bluetooth')} className="hover:scale-110 transition-transform">
                <Bluetooth className="w-5 h-5 text-[#0B5C9A]" />
              </button>
              <Wifi className="w-5 h-5 text-[#0B5C9A]" />
            </div>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full w-[85%] bg-gradient-to-r from-[#10B981] to-[#00A896]"></div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4 text-foreground/90">Tác Vụ Nhanh</h2>
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => navigate('/monitoring')}
              className="bg-gradient-to-br from-[#0B5C9A] to-[#0E7AB8] text-white p-4 rounded-2xl shadow-lg shadow-[#0B5C9A]/20 flex flex-col items-center gap-2 hover:scale-105 transition-transform"
            >
              <Activity className="w-8 h-8 mb-1" />
              <span className="text-xs text-center font-medium">Đo Ngay</span>
            </button>
            <button
              onClick={() => navigate('/records')}
              className="bg-white border-2 border-[#0B5C9A] text-[#0B5C9A] p-4 rounded-2xl shadow-sm flex flex-col items-center gap-2 hover:scale-105 transition-transform hover:bg-slate-50"
            >
              <FileText className="w-8 h-8 mb-1" />
              <span className="text-xs text-center font-medium">Hồ Sơ</span>
            </button>
            <button
              onClick={() => navigate('/assistant')}
              className="bg-gradient-to-br from-[#00A896] to-[#00C9B7] text-white p-4 rounded-2xl shadow-lg shadow-[#00A896]/20 flex flex-col items-center gap-2 hover:scale-105 transition-transform"
            >
              <MessageSquare className="w-8 h-8 mb-1" />
              <span className="text-xs text-center font-medium">Chat AI</span>
            </button>
            <button
              onClick={() => navigate('/new-scan')}
              className="bg-white border-2 border-dashed border-[#0B5C9A] text-[#0B5C9A] p-4 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-2 hover:scale-105 transition-transform hover:bg-[#0B5C9A]/5"
            >
              <Plus className="w-8 h-8 mb-1" />
              <span className="text-xs text-center font-medium">Đo Mới</span>
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground/90">Kết Quả Gần Đây</h2>
            <button onClick={() => navigate('/records')} className="text-[#0B5C9A] text-sm font-medium hover:underline">Xem Tất Cả</button>
          </div>
          <div className="space-y-3">
            {recentScans.map((scan) => (
              <button
                key={scan.id}
                onClick={() => navigate('/records/detail')}
                className="w-full bg-white border border-border rounded-2xl p-4 hover:shadow-md transition-shadow text-left group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">{scan.id}</p>
                    <p className="font-semibold text-foreground group-hover:text-[#0B5C9A] transition-colors">{scan.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {scan.status === 'normal' ? (
                      <div className="bg-[#10B981]/10 text-[#10B981] px-3 py-1 rounded-full text-xs flex items-center gap-1 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Bình thường
                      </div>
                    ) : (
                      <div className="bg-[#F59E0B]/10 text-[#F59E0B] px-3 py-1 rounded-full text-xs flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Bất thường
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-muted-foreground font-medium">Đo {scan.type}</span>
                  <span className="text-muted-foreground font-medium">{scan.time}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-sm text-foreground/80 font-medium">Kết luận AI:</p>
                  <p className="text-sm text-foreground mt-1">{scan.diagnosis}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
