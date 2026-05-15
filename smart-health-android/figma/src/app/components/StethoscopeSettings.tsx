import {
  ArrowLeft,
  Stethoscope,
  Volume2,
  VolumeX,
  Battery,
  Bluetooth,
  RefreshCw,
  Settings as SettingsIcon,
  Zap,
  Signal,
  AlertCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export default function StethoscopeSettings() {
  const navigate = useNavigate();
  const [volume, setVolume] = useState(75);
  const [sensitivity, setSensitivity] = useState(60);
  const [noiseCancel, setNoiseCancel] = useState(true);
  const [autoConnect, setAutoConnect] = useState(true);

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-6 shadow-md">
        <div className="flex items-center gap-4 text-white mb-6">
          <button
            onClick={() => navigate(-1)}
            className="hover:bg-white/10 p-2 rounded-full transition-colors -ml-2"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Cài đặt ống nghe</h1>
            <p className="text-white/80 text-sm">Thiết bị AI Stethoscope Pro</p>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-white" />
              </div>
              <div className="text-white">
                <p className="font-semibold">Đã kết nối</p>
                <p className="text-white/80 text-sm">Thiết bị #ST-4892</p>
              </div>
            </div>
            <div className="text-right text-white">
              <div className="flex items-center gap-1 justify-end mb-1">
                <Battery className="w-5 h-5 text-[#10B981]" />
                <span className="font-semibold">85%</span>
              </div>
              <div className="flex items-center gap-1 justify-end">
                <Signal className="w-4 h-4 text-[#10B981]" />
                <span className="text-xs">Tín hiệu mạnh</span>
              </div>
            </div>
          </div>
          <button className="w-full bg-white/20 hover:bg-white/30 text-white py-2.5 rounded-xl transition-colors font-medium flex items-center justify-center gap-2 border border-white/30">
            <RefreshCw className="w-4 h-4" />
            Kết nối lại
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 overflow-y-auto space-y-6">
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Âm Thanh
          </h3>
          <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="font-semibold text-foreground/90 flex items-center gap-2">
                  <Volume2 className="w-5 h-5 text-[#0B5C9A]" />
                  Âm lượng
                </label>
                <span className="text-[#0B5C9A] font-semibold">{volume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#0B5C9A] [&::-webkit-slider-thumb]:shadow-lg"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="font-semibold text-foreground/90 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-orange-500" />
                  Độ nhạy
                </label>
                <span className="text-orange-500 font-semibold">{sensitivity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:shadow-lg"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Độ nhạy cao phát hiện âm thanh yếu hơn
              </p>
            </div>

            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-xl">
                    <VolumeX className="w-5 h-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Khử nhiễu AI</p>
                    <p className="text-sm text-muted-foreground">
                      Lọc tiếng ồn môi trường
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setNoiseCancel(!noiseCancel)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    noiseCancel ? 'bg-[#10B981]' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      noiseCancel ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Kết Nối
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-xl">
                    <Bluetooth className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground/90">Tự động kết nối</p>
                    <p className="text-sm text-muted-foreground">
                      Kết nối khi mở ứng dụng
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setAutoConnect(!autoConnect)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    autoConnect ? 'bg-[#10B981]' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      autoConnect ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button onClick={() => navigate('/bluetooth-settings')} className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-[#0B5C9A]/10 rounded-xl">
                <SettingsIcon className="w-5 h-5 text-[#0B5C9A]" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">Cài đặt Bluetooth</p>
                <p className="text-sm text-muted-foreground">
                  Quản lý thiết bị đã ghép nối
                </p>
              </div>
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Hiệu Chuẩn
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <button className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <RefreshCw className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">
                  Hiệu chuẩn cảm biến
                </p>
                <p className="text-sm text-muted-foreground">
                  Lần cuối: 3 ngày trước
                </p>
              </div>
              <span className="text-[#0B5C9A] font-medium text-sm">Chạy ngay</span>
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900 mb-1">Lời khuyên</p>
              <p className="text-sm text-blue-800 leading-relaxed">
                Hiệu chuẩn cảm biến mỗi tuần để đảm bảo độ chính xác tốt nhất.
                Pin dưới 20% có thể ảnh hưởng chất lượng âm thanh.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
