import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Circle, Square, Heart, Wind, AlertTriangle, Activity, Battery, Bluetooth, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';

export default function LiveMonitoring() {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [mode, setMode] = useState<'heart' | 'lung'>('heart');
  const [heartRate, setHeartRate] = useState(72);
  const [respRate, setRespRate] = useState(16); // Nhịp thở (Respiratory Rate)
  const [sqi, setSqi] = useState(98); // Signal Quality Index
  const [hasAlert, setHasAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const offsetRef = useRef(0);

  // Waveform simulation effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    const drawWaveform = () => {
      // Clear canvas with white background for light theme
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      // Draw Medical Grid (Standard Pink/Red grid for medical papers)
      ctx.lineWidth = 1;
      
      // Minor grid
      ctx.strokeStyle = 'rgba(255, 116, 139, 0.15)'; 
      for (let i = 0; i < width; i += 10) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
      }
      for (let i = 0; i < height; i += 10) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
      }
      
      // Major grid
      ctx.strokeStyle = 'rgba(255, 116, 139, 0.35)';
      for (let i = 0; i < width; i += 50) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
      }
      for (let i = 0; i < height; i += 50) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
      }

      // Draw Signal Line
      ctx.strokeStyle = mode === 'heart' ? '#0B5C9A' : '#00A896'; // Deep Blue for Heart, Turquoise for Lung
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 2;
      ctx.shadowColor = mode === 'heart' ? 'rgba(11, 92, 154, 0.2)' : 'rgba(0, 168, 150, 0.2)';
      ctx.lineJoin = 'round';
      ctx.beginPath();

      const speed = 3; // Constant sweep speed
      offsetRef.current += speed;

      for (let x = 0; x < width; x++) {
        const t = (offsetRef.current + x) * 0.04;
        let y = centerY;

        if (mode === 'heart') {
          // PCG (Phonocardiogram) Simulation with S1 and S2 sounds
          const cycle = t % 150; 
          let amplitude = 0;
          if (cycle > 10 && cycle < 25) {
             // S1 (Lubb)
             amplitude = Math.sin(t * 4) * 45 * Math.exp(-((cycle - 17.5) ** 2) / 20);
          } else if (cycle > 60 && cycle < 75) {
             // S2 (Dubb)
             amplitude = Math.sin(t * 5) * 35 * Math.exp(-((cycle - 67.5) ** 2) / 15);
          }
          const noise = (Math.random() - 0.5) * 4;
          y = centerY + amplitude + noise;
        } else {
          // Lung Sound Simulation
          const cycle = t % 250;
          let amplitude = 0;
          if (cycle > 20 && cycle < 100) {
             // Inspiration
             amplitude = (Math.random() - 0.5) * 35 * Math.sin(Math.PI * (cycle - 20) / 80);
          } else if (cycle > 120 && cycle < 180) {
             // Expiration
             amplitude = (Math.random() - 0.5) * 25 * Math.sin(Math.PI * (cycle - 120) / 60);
          }
          // Simulate crackles/wheezing if alert is active
          if (hasAlert && isRecording && cycle > 140 && cycle < 160) {
             if (Math.random() > 0.7) amplitude += (Math.random() - 0.5) * 70; 
          }
          const noise = (Math.random() - 0.5) * 3;
          y = centerY + amplitude + noise;
        }
        
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      animationRef.current = requestAnimationFrame(drawWaveform);
    };

    drawWaveform();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRecording, mode, hasAlert]);

  // Vitals simulation effect
  useEffect(() => {
    const vitalsInterval = setInterval(() => {
      setHeartRate(prev => {
        const change = Math.floor(Math.random() * 3) - 1;
        return Math.max(60, Math.min(100, prev + change));
      });
      setRespRate(prev => {
        const change = Math.floor(Math.random() * 3) - 1;
        return Math.max(12, Math.min(25, prev + change));
      });
      setSqi(prev => {
        const change = Math.floor(Math.random() * 3) - 1;
        return Math.max(85, Math.min(100, prev + change));
      });
    }, 2000);

    return () => clearInterval(vitalsInterval);
  }, []);

  // AI Alert simulation effect during recording
  useEffect(() => {
    let alertTimeout: NodeJS.Timeout;
    if (isRecording) {
      alertTimeout = setTimeout(() => {
        if (mode === 'lung') {
          setHasAlert(true);
          setAlertMessage('Phát hiện tiếng ran nổ (Crackles) ở thuỳ dưới phổi trái. Đề nghị kiểm tra thêm lâm sàng.');
        } else {
          setHasAlert(false);
        }
      }, 5000);
    } else {
      setHasAlert(false);
    }

    return () => {
      if (alertTimeout) clearTimeout(alertTimeout);
    };
  }, [isRecording, mode]);

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans flex flex-col">
      {/* Top Header */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-200 shadow-sm z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-gray-900 text-lg font-semibold tracking-wide">Theo Dõi Tín Hiệu</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Bluetooth className="w-3.5 h-3.5 text-[#00A896]" />
            <span className="text-[#00A896] text-xs font-medium">StethoEdge Pro - Đã kết nối</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Battery className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      {/* Patient Info Strip */}
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-200">
         <div className="flex items-center gap-3">
           <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
             <span className="text-[#0B5C9A] font-bold text-sm">BN</span>
           </div>
           <div>
             <p className="text-gray-900 text-sm font-semibold">Phiên khám ẩn danh</p>
             <p className="text-gray-500 text-xs mt-0.5">ID: #4928 • Lưu trữ cục bộ</p>
           </div>
         </div>
         <div className="flex items-center gap-2">
           <span className="px-2.5 py-1 rounded-md bg-[#00A896]/10 text-[#00A896] text-xs font-semibold border border-[#00A896]/20">
             FDA Clear
           </span>
         </div>
      </div>

      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        
        {/* Waveform Display */}
        <div className="bg-white rounded-2xl p-4 mb-4 border border-gray-200 shadow-sm flex-1 min-h-[260px] flex flex-col relative overflow-hidden">
          <div className="flex items-center justify-between mb-3 z-10 relative">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#0B5C9A]" />
              <span className="text-gray-900 text-sm font-bold uppercase tracking-wider">
                {mode === 'heart' ? 'Tín Hiệu Âm Tim (PCG)' : 'Tín Hiệu Âm Phổi'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {isRecording && (
                <motion.div
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-md border border-red-200"
                >
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                  <span className="text-red-600 text-xs font-bold tracking-wide">ĐANG GHI</span>
                </motion.div>
              )}
              <span className="text-gray-500 text-xs font-medium bg-gray-100 px-2 py-1 rounded-md border border-gray-200">25 mm/s</span>
            </div>
          </div>
          
          <div className="relative flex-1 rounded-xl overflow-hidden bg-white border border-gray-200">
            <canvas
              ref={canvasRef}
              width={800}
              height={300}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Edge fade overlays to simulate standard monitor sweep look */}
            <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
            <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>
          </div>
        </div>

        {/* Vital Signs Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-50/50 rounded-bl-full -mr-4 -mt-4 pointer-events-none"></div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider">
                {mode === 'heart' ? 'Nhịp Tim' : 'Nhịp Thở'}
              </span>
              {mode === 'heart' ? (
                <Heart className={`w-4 h-4 ${isRecording ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
              ) : (
                <Wind className={`w-4 h-4 ${isRecording ? 'text-teal-500 animate-pulse' : 'text-gray-400'}`} />
              )}
            </div>
            <div className="flex items-end gap-2 mt-auto">
              <span className="text-gray-900 text-5xl tabular-nums font-bold leading-none tracking-tight">
                {mode === 'heart' ? heartRate : respRate}
              </span>
              <span className="text-gray-500 text-sm font-medium mb-1">
                {mode === 'heart' ? 'BPM' : 'RPM'}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col relative overflow-hidden">
             <div className="absolute top-0 right-0 w-20 h-20 bg-teal-50/50 rounded-bl-full -mr-4 -mt-4 pointer-events-none"></div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Chất Lượng Tín Hiệu</span>
              <ShieldCheck className="w-4 h-4 text-[#00A896]" />
            </div>
            <div className="flex items-end gap-2 mt-auto">
              <span className="text-[#00A896] text-5xl tabular-nums font-bold leading-none tracking-tight">{sqi}</span>
              <span className="text-[#00A896]/70 text-sm font-medium mb-1">% SQI</span>
            </div>
          </div>
        </div>

        {/* AI Analysis Alert */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className={`rounded-2xl p-4 flex items-start gap-3 border ${
                hasAlert 
                  ? 'bg-red-50 border-red-200' 
                  : 'bg-blue-50 border-blue-200'
              }`}>
                {hasAlert ? (
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <Activity className="w-5 h-5 text-[#0B5C9A] flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                    hasAlert ? 'text-red-700' : 'text-[#0B5C9A]'
                  }`}>
                    {hasAlert ? 'Cảnh Báo Lâm Sàng (Edge AI)' : 'Phân Tích Edge AI Trực Tiếp'}
                  </p>
                  <p className={`text-sm leading-relaxed font-medium ${
                    hasAlert ? 'text-red-900' : 'text-blue-900'
                  }`}>
                    {hasAlert ? alertMessage : 'Đang theo dõi và phân tích tín hiệu âm thanh theo thời gian thực...'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="bg-white rounded-2xl p-4 mb-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
             <span className="text-gray-700 text-sm font-semibold">Chế độ phân tích</span>
             <span className="text-[#00A896] text-xs font-semibold px-2 py-0.5 rounded-full bg-[#00A896]/10">Chuẩn Bell & Diaphragm</span>
          </div>
          <div className="flex bg-gray-100 rounded-xl p-1 border border-gray-200">
            <button
              onClick={() => { setMode('heart'); setHasAlert(false); }}
              className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all font-semibold text-sm ${
                mode === 'heart'
                  ? 'bg-white text-[#0B5C9A] shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 border border-transparent'
              }`}
            >
              <Heart className="w-4 h-4" />
              <span>Tim mạch</span>
            </button>
            <button
              onClick={() => { setMode('lung'); setHasAlert(false); }}
              className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all font-semibold text-sm ${
                mode === 'lung'
                  ? 'bg-white text-[#00A896] shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 border border-transparent'
              }`}
            >
              <Wind className="w-4 h-4" />
              <span>Hô hấp</span>
            </button>
          </div>
        </div>

        {/* Record Button */}
        <div className="flex items-center justify-center pb-8 mt-auto">
          <button
            onClick={() => setIsRecording(!isRecording)}
            className={`relative group flex items-center justify-center ${
              isRecording ? 'w-20 h-20' : 'w-[72px] h-[72px]'
            } transition-all duration-300`}
            aria-label={isRecording ? "Dừng ghi" : "Bắt đầu ghi"}
          >
            {/* Ripple Effect */}
            <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
              isRecording 
                ? 'bg-red-500/20 animate-ping' 
                : 'bg-[#0B5C9A]/10 group-hover:bg-[#0B5C9A]/20 scale-110'
            }`}></div>
            
            {/* Button Surface */}
            <div className={`relative z-10 w-full h-full rounded-full flex items-center justify-center shadow-[0_8px_20px_rgba(0,0,0,0.15)] transition-all duration-300 border-[3px] ${
              isRecording 
                ? 'bg-red-500 border-white scale-95' 
                : 'bg-[#0B5C9A] border-white group-hover:scale-105'
            }`}>
              {isRecording ? (
                <Square className="w-7 h-7 text-white fill-current rounded-sm" />
              ) : (
                <Circle className="w-8 h-8 text-white fill-current" />
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}