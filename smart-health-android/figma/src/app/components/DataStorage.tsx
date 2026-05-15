import {
  ArrowLeft,
  Database,
  Cloud,
  HardDrive,
  Trash2,
  Download,
  Upload,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export default function DataStorage() {
  const navigate = useNavigate();
  const [autoSync, setAutoSync] = useState(true);
  const [cloudBackup, setCloudBackup] = useState(true);

  const storageData = {
    local: {
      used: 2.4,
      total: 8.0,
      percentage: 30,
    },
    cloud: {
      used: 12.8,
      total: 50.0,
      percentage: 26,
    },
  };

  const dataCategories = [
    {
      name: 'Hồ sơ bệnh án',
      size: '1.8 GB',
      count: '247 hồ sơ',
      icon: Database,
      color: 'text-[#0B5C9A]',
      bg: 'bg-[#0B5C9A]/10',
    },
    {
      name: 'File âm thanh',
      size: '3.2 GB',
      count: '892 file',
      icon: HardDrive,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      name: 'Hình ảnh y tế',
      size: '1.5 GB',
      count: '1,245 ảnh',
      icon: Upload,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      name: 'Báo cáo AI',
      size: '890 MB',
      count: '564 báo cáo',
      icon: CheckCircle,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
  ];

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
            <h1 className="text-xl font-semibold">Lưu trữ dữ liệu</h1>
            <p className="text-white/80 text-sm">Quản lý dung lượng và sao lưu</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 overflow-y-auto space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-[#0B5C9A]/10 rounded-lg">
                <HardDrive className="w-4 h-4 text-[#0B5C9A]" />
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Bộ nhớ thiết bị
              </p>
            </div>
            <p className="text-2xl font-semibold text-foreground mb-1">
              {storageData.local.used} GB
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              / {storageData.local.total} GB
            </p>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#0B5C9A] to-[#00A896]"
                style={{ width: `${storageData.local.percentage}%` }}
              ></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-blue-500/10 rounded-lg">
                <Cloud className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Bộ nhớ đám mây
              </p>
            </div>
            <p className="text-2xl font-semibold text-foreground mb-1">
              {storageData.cloud.used} GB
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              / {storageData.cloud.total} GB
            </p>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400"
                style={{ width: `${storageData.cloud.percentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Phân Loại Dữ Liệu
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            {dataCategories.map((category, idx) => (
              <div
                key={idx}
                className={`p-4 flex items-center gap-4 ${
                  idx !== dataCategories.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <div className={`p-2 ${category.bg} rounded-xl`}>
                  <category.icon className={`w-5 h-5 ${category.color}`} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground/90">{category.name}</p>
                  <p className="text-sm text-muted-foreground">{category.count}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">{category.size}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Đồng Bộ & Sao Lưu
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-xl">
                    <RefreshCw className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Tự động đồng bộ</p>
                    <p className="text-sm text-muted-foreground">
                      Đồng bộ khi có Wi-Fi
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAutoSync(!autoSync)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    autoSync ? 'bg-[#10B981]' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      autoSync ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-xl">
                    <Cloud className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Sao lưu đám mây</p>
                    <p className="text-sm text-muted-foreground">
                      Lần cuối: 2 giờ trước
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCloudBackup(!cloudBackup)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    cloudBackup ? 'bg-[#10B981]' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      cloudBackup ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button onClick={() => navigate('/export-data')} className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-purple-500/10 rounded-xl">
                <Download className="w-5 h-5 text-purple-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">
                  Xuất dữ liệu
                </p>
                <p className="text-sm text-muted-foreground">
                  Tải xuống bản sao toàn bộ dữ liệu
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground opacity-50" />
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Quản Lý Dung Lượng
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <button className="w-full p-4 border-b border-border flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-orange-500/10 rounded-xl">
                <Trash2 className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">
                  Xóa bộ nhớ tạm
                </p>
                <p className="text-sm text-muted-foreground">
                  Giải phóng 450 MB
                </p>
              </div>
              <span className="text-orange-500 font-medium text-sm">Xóa</span>
            </button>

            <button onClick={() => navigate('/delete-data')} className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-red-500/10 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">
                  Xóa toàn bộ dữ liệu
                </p>
                <p className="text-sm text-muted-foreground">
                  Không thể khôi phục
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground opacity-50" />
            </button>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 mb-1">
                Bảo Mật Dữ Liệu
              </p>
              <p className="text-sm text-amber-800 leading-relaxed">
                Tất cả dữ liệu được mã hóa AES-256 cả trên thiết bị và đám mây.
                Tuân thủ chuẩn HIPAA về bảo mật thông tin y tế.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
