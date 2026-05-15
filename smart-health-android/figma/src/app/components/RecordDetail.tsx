import { ArrowLeft, Play, Pause, RotateCcw, Download, Share2, Heart, Calendar, Clock, Timer, FileText, Brain } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';

export default function RecordDetail() {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration] = useState(154);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    ctx.fillStyle = '#F5F7FA';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#0B5C9A';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      const frequency = 0.015;
      const amplitude = 40;
      const breathWave = Math.sin(x * frequency) * amplitude;
      const noise = (Math.random() - 0.5) * 5;
      const y = centerY + breathWave + noise;

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    for (let i = 0; i < height; i += 15) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    for (let i = 0; i < width; i += 15) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }

    const markerX = (currentTime / duration) * width;
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(markerX, 0);
    ctx.lineTo(markerX, height);
    ctx.stroke();
  }, [currentTime, duration]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && currentTime < duration) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentTime, duration]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-4 flex items-center justify-between shadow-md relative z-10">
        <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-white text-lg font-semibold">Chi Tiết Hồ Sơ</h1>
        <button className="text-white/80 hover:text-white transition-colors">
          <Share2 className="w-6 h-6" />
        </button>
      </div>

      <div className="px-6 py-6">
        <div className="bg-white border border-border rounded-2xl p-5 mb-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1 font-medium">HS-2844</p>
              <h2 className="text-xl mb-1 font-semibold text-foreground">Trần Thị Mai</h2>
              <p className="text-sm text-muted-foreground font-medium">Mã BN: BN-2844</p>
            </div>
            <div className="bg-[#F59E0B]/10 text-[#F59E0B] px-4 py-2 rounded-xl text-sm font-semibold border border-[#F59E0B]/20">
              Bất thường
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground/80 font-medium">12-05-2026</span>
            </div>
            <div className="flex items-center gap-2 text-sm bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground/80 font-medium">13:20</span>
            </div>
            <div className="flex items-center gap-2 text-sm bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground/80 font-medium">2:34 phút</span>
            </div>
            <div className="flex items-center gap-2 text-sm bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <Heart className="w-4 h-4 text-[#0EA5E9]" />
              <span className="text-foreground/80 font-medium">Đo Phổi</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-2xl p-5 mb-6 shadow-sm">
          <h3 className="text-sm text-foreground/80 font-semibold mb-3">Dạng sóng âm thanh đã lưu</h3>
          <canvas
            ref={canvasRef}
            width={800}
            height={200}
            className="w-full h-auto rounded-xl border border-border mb-4 bg-[#F5F7FA]"
          />

          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 font-medium">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden cursor-pointer">
              <div
                className="absolute h-full bg-[#0B5C9A] rounded-full transition-all duration-300"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => setCurrentTime(Math.max(0, currentTime - 10))}
              className="bg-slate-100 p-3 rounded-full hover:bg-slate-200 transition-colors"
            >
              <RotateCcw className="w-5 h-5 text-foreground/80" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="bg-[#0B5C9A] text-white w-14 h-14 rounded-full flex items-center justify-center hover:bg-[#094A7D] transition-all shadow-lg hover:scale-105 active:scale-95"
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
            </button>
            <button className="bg-slate-100 p-3 rounded-full hover:bg-slate-200 transition-colors">
              <Download className="w-5 h-5 text-foreground/80" />
            </button>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#F59E0B]/10 to-[#EF4444]/10 border-2 border-[#F59E0B] rounded-2xl p-5 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-5 h-5 text-[#F59E0B]" />
            <h3 className="font-semibold text-[#F59E0B]">Tóm tắt phân tích AI</h3>
          </div>
          <div className="bg-white/90 rounded-xl p-4 mb-3 border border-[#F59E0B]/20">
            <p className="text-sm mb-2 text-foreground/90">
              <span className="font-semibold text-foreground">Kết luận:</span> Phát hiện tiếng ran nổ - Đáy phổi trái
            </p>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Mô hình AI đã phát hiện các âm thanh hô hấp bất thường tương thích với tiếng ran nổ nhỏ ở thuỳ dưới phổi trái. Mẫu âm thanh này thường liên quan đến sự tích tụ dịch hoặc viêm nhiễm ở các phế nang.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/90 rounded-xl p-3 border border-[#F59E0B]/20">
              <p className="text-xs text-muted-foreground font-medium mb-1">Độ tin cậy</p>
              <p className="text-2xl font-bold text-[#0B5C9A]">94%</p>
            </div>
            <div className="bg-white/90 rounded-xl p-3 border border-[#F59E0B]/20">
              <p className="text-xs text-muted-foreground font-medium mb-1">Mức độ</p>
              <p className="text-2xl font-bold text-[#F59E0B]">Trung bình</p>
            </div>
          </div>
          <div className="mt-3 bg-white/90 rounded-xl p-3 border border-[#F59E0B]/20">
            <p className="text-xs text-muted-foreground font-medium mb-2">Mẫu âm thanh phát hiện:</p>
            <div className="flex flex-wrap gap-2">
              <span className="bg-[#F59E0B]/20 text-[#F59E0B] px-3 py-1 rounded-full text-xs font-semibold">
                Ran nổ nhỏ
              </span>
              <span className="bg-[#F59E0B]/20 text-[#F59E0B] px-3 py-1 rounded-full text-xs font-semibold">
                Cuối thì hít vào
              </span>
              <span className="bg-[#F59E0B]/20 text-[#F59E0B] px-3 py-1 rounded-full text-xs font-semibold">
                Bên trái
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-2xl p-5 mb-20 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-[#0B5C9A]" />
            <h3 className="font-semibold text-foreground">Ghi chú của bác sĩ</h3>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-sm text-foreground/80 italic mb-4 leading-relaxed">
              Bệnh nhân nhập viện với triệu chứng khó thở nhẹ. Đã xác nhận tiếng ran nổ khi nghe ống nghe. 
              Kết quả AI phù hợp với biểu hiện lâm sàng. Đề nghị chụp X-quang phổi và cân nhắc viêm phổi 
              giai đoạn đầu hoặc phù phổi. Đã bắt đầu dùng kháng sinh theo kinh nghiệm trong khi chờ kết quả cấy vi khuẩn.
            </p>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-slate-200 font-medium">
              <span>Bs. Tuấn, CK1</span>
              <span>12-05-2026 - 13:45</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
