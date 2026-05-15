import { ArrowLeft, User, Shield, Bell, Database, LogOut, ChevronRight, Stethoscope, Sliders } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function Settings() {
  const navigate = useNavigate();

  const settingsGroups = [
    {
      title: 'Tài Khoản',
      items: [
        { icon: User, label: 'Thông tin cá nhân', color: 'text-blue-500', bg: 'bg-blue-500/10', path: '/profile' },
        { icon: Shield, label: 'Bảo mật & Quyền riêng tư', color: 'text-emerald-500', bg: 'bg-emerald-500/10', path: '/privacy' },
      ]
    },
    {
      title: 'Thiết Bị & AI',
      items: [
        { icon: Stethoscope, label: 'Cài đặt ống nghe', color: 'text-purple-500', bg: 'bg-purple-500/10', path: '/stethoscope-settings' },
        { icon: Sliders, label: 'Hiệu chuẩn mô hình AI', color: 'text-orange-500', bg: 'bg-orange-500/10', path: '/ai-calibration' },
        { icon: Database, label: 'Lưu trữ dữ liệu cục bộ', color: 'text-[#0B5C9A]', bg: 'bg-[#0B5C9A]/10', path: '/data-storage' },
      ]
    },
    {
      title: 'Tùy Chọn',
      items: [
        { icon: Bell, label: 'Thông báo', color: 'text-pink-500', bg: 'bg-pink-500/10', path: '/notification-settings' },
      ]
    }
  ];

  return (
    <div className="min-h-screen w-full bg-muted/30 flex flex-col">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-6 pb-8 shadow-md">
        <div className="flex items-center gap-4 text-white">
          <button onClick={() => navigate(-1)} className="hover:bg-white/10 p-2 rounded-full transition-colors -ml-2">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-semibold">Cài Đặt</h1>
        </div>
        
        <div className="mt-6 flex items-center gap-4 bg-white/10 p-4 rounded-2xl border border-white/20 backdrop-blur-sm">
          <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-[#0B5C9A] text-xl font-bold shadow-inner">
            NT
          </div>
          <div className="flex-1 text-white">
            <h2 className="font-semibold text-lg leading-tight">Nguyễn Tuấn</h2>
            <p className="text-white/80 text-sm font-medium">Bác sĩ Tim mạch • ID: 89432</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 overflow-y-auto space-y-6">
        {settingsGroups.map((group, idx) => (
          <div key={idx}>
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
              {group.title}
            </h3>
            <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
              {group.items.map((item, itemIdx) => (
                <button
                  key={itemIdx}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors ${
                    itemIdx !== group.items.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className={`p-2 rounded-xl ${item.bg}`}>
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <span className="flex-1 text-left font-semibold text-foreground/90">{item.label}</span>
                  <ChevronRight className="w-5 h-5 text-muted-foreground opacity-50" />
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-4 pb-8">
          <button 
            onClick={() => navigate('/login')}
            className="w-full flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 rounded-2xl font-semibold hover:bg-red-100 transition-colors border border-red-100 shadow-sm"
          >
            <LogOut className="w-5 h-5" />
            <span>Đăng Xuất</span>
          </button>
        </div>
      </div>
    </div>
  );
}
