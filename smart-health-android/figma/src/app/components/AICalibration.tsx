import {
  ArrowLeft,
  Brain,
  Download,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Activity,
  Gauge,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export default function AICalibration() {
  const navigate = useNavigate();
  const [selectedModel, setSelectedModel] = useState('balanced');

  const models = [
    {
      id: 'fast',
      name: 'Nhanh',
      description: 'Phân tích nhanh, độ chính xác cơ bản',
      accuracy: 92,
      speed: 'Rất nhanh (< 1s)',
      color: 'emerald',
    },
    {
      id: 'balanced',
      name: 'Cân bằng',
      description: 'Cân bằng giữa tốc độ và độ chính xác',
      accuracy: 96,
      speed: 'Nhanh (1-2s)',
      color: 'blue',
    },
    {
      id: 'accurate',
      name: 'Chính xác cao',
      description: 'Độ chính xác tối đa, thời gian xử lý lâu hơn',
      accuracy: 98.5,
      speed: 'Trung bình (2-4s)',
      color: 'purple',
    },
  ];

  const metrics = [
    {
      label: 'Phát hiện bệnh tim',
      value: '96.8%',
      change: '+2.3%',
      status: 'up',
      icon: Activity,
      color: 'text-[#10B981]',
    },
    {
      label: 'Phát hiện bệnh phổi',
      value: '94.2%',
      change: '+1.8%',
      status: 'up',
      icon: TrendingUp,
      color: 'text-[#0B5C9A]',
    },
    {
      label: 'Độ nhạy tổng thể',
      value: '95.5%',
      change: '+0.9%',
      status: 'up',
      icon: Gauge,
      color: 'text-purple-500',
    },
    {
      label: 'Độ đặc hiệu',
      value: '97.1%',
      change: '+1.2%',
      status: 'up',
      icon: BarChart3,
      color: 'text-orange-500',
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
            <h1 className="text-xl font-semibold">Hiệu chuẩn mô hình AI</h1>
            <p className="text-white/80 text-sm">Tối ưu hiệu suất phân tích</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 overflow-y-auto space-y-6">
        <div className="bg-gradient-to-br from-[#0B5C9A]/10 to-[#00A896]/10 border border-[#0B5C9A]/20 rounded-2xl p-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
              <Brain className="w-6 h-6 text-[#0B5C9A]" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">
                Mô hình hiện tại
              </h3>
              <p className="text-sm text-muted-foreground">
                AI Medical Analysis v3.2.1
              </p>
            </div>
            <div className="px-3 py-1 bg-[#10B981]/10 rounded-full">
              <p className="text-xs font-medium text-[#10B981]">Đã cập nhật</p>
            </div>
          </div>
          <button className="w-full bg-white hover:bg-slate-50 text-[#0B5C9A] py-2.5 rounded-xl transition-colors font-medium flex items-center justify-center gap-2 shadow-sm border border-border">
            <Download className="w-4 h-4" />
            Cập nhật mô hình mới
          </button>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Chế Độ Phân Tích
          </h3>
          <div className="space-y-3">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`w-full bg-white rounded-2xl p-4 border-2 transition-all ${
                  selectedModel === model.id
                    ? 'border-[#0B5C9A] shadow-lg shadow-[#0B5C9A]/10'
                    : 'border-border hover:border-[#0B5C9A]/30'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-foreground">{model.name}</h4>
                      {selectedModel === model.id && (
                        <CheckCircle className="w-5 h-5 text-[#10B981]" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {model.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-muted-foreground">Độ chính xác: </span>
                    <span className="font-semibold text-[#10B981]">
                      {model.accuracy}%
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tốc độ: </span>
                    <span className="font-semibold text-foreground">
                      {model.speed}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Hiệu Suất Mô Hình
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {metrics.map((metric, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-border p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`p-1.5 bg-${metric.color.split('-')[1]}-500/10 rounded-lg`}>
                    <metric.icon className={`w-4 h-4 ${metric.color}`} />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {metric.label}
                  </p>
                </div>
                <p className="text-xl font-semibold text-foreground mb-1">
                  {metric.value}
                </p>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-[#10B981]" />
                  <span className="text-xs text-[#10B981] font-medium">
                    {metric.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Tùy Chỉnh Nâng Cao
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <button className="w-full p-4 border-b border-border flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-purple-500/10 rounded-xl">
                <Brain className="w-5 h-5 text-purple-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">Huấn luyện mô hình</p>
                <p className="text-sm text-muted-foreground">
                  Tối ưu dựa trên dữ liệu của bạn
                </p>
              </div>
            </button>

            <button className="w-full p-4 border-b border-border flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-orange-500/10 rounded-xl">
                <Gauge className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">Ngưỡng phát hiện</p>
                <p className="text-sm text-muted-foreground">
                  Điều chỉnh độ nhạy cảnh báo
                </p>
              </div>
            </button>

            <button className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-[#0B5C9A]/10 rounded-xl">
                <RefreshCw className="w-5 h-5 text-[#0B5C9A]" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">Reset về mặc định</p>
                <p className="text-sm text-muted-foreground">
                  Khôi phục cài đặt gốc
                </p>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 mb-1">Lưu ý quan trọng</p>
              <p className="text-sm text-amber-800 leading-relaxed">
                Mô hình AI được đào tạo trên hàng triệu mẫu dữ liệu y khoa.
                Kết quả chỉ mang tính tham khảo, quyết định cuối cùng phải dựa
                trên đánh giá lâm sàng của bác sĩ.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
