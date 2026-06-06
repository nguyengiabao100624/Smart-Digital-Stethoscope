import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { 
  ChevronLeft, 
  QrCode, 
  Bluetooth, 
  CheckCircle2, 
  Loader2,
  AlertCircle,
  Smartphone,
  ChevronRight,
  RefreshCw,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Screen = 'connect_mode' | 'qr_scan' | 'manual_code' | 'bluetooth_scan' | 'success';

export default function DeviceConnectionFlow() {
  const navigate = useNavigate();
  const [currentScreen, setCurrentScreen] = useState<Screen>('connect_mode');

  // Navigate back handling
  const handleBack = () => {
    if (currentScreen === 'connect_mode') {
      navigate(-1); // Back to dashboard or previous screen
    } else if (currentScreen === 'manual_code') {
      setCurrentScreen('qr_scan');
    } else {
      setCurrentScreen('connect_mode');
    }
  };

  const handleSuccess = () => {
    setCurrentScreen('success');
  };

  return (
    <div className="min-h-screen bg-slate-50 w-full overflow-hidden relative">
      <AnimatePresence mode="wait">
        {currentScreen === 'connect_mode' && (
          <ConnectionMode 
            key="connect_mode" 
            onBack={handleBack}
            onSelectQR={() => setCurrentScreen('qr_scan')}
            onSelectBluetooth={() => setCurrentScreen('bluetooth_scan')}
          />
        )}

        {currentScreen === 'qr_scan' && (
          <QRScanner 
            key="qr_scan"
            onBack={handleBack}
            onSuccess={handleSuccess}
            onManual={() => setCurrentScreen('manual_code')}
          />
        )}

        {currentScreen === 'manual_code' && (
          <ManualCode 
            key="manual_code"
            onBack={handleBack}
            onSuccess={handleSuccess}
          />
        )}

        {currentScreen === 'bluetooth_scan' && (
          <BluetoothScanner 
            key="bluetooth_scan"
            onBack={handleBack}
            onSuccess={handleSuccess}
          />
        )}

        {currentScreen === 'success' && (
          <ConnectionSuccess 
            key="success"
            onFinish={() => navigate('/dashboard')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ConnectionSuccess({ onFinish }: { onFinish: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 2500);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative"
    >
      <motion.div 
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
        className="w-24 h-24 bg-[#10B981] rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/20"
      >
        <Check className="w-12 h-12 text-white" strokeWidth={3} />
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center space-y-2"
      >
        <h2 className="text-2xl font-bold text-slate-800">Kết nối thành công!</h2>
        <p className="text-slate-500 text-sm">
          Thiết bị <span className="font-semibold text-slate-700">Stetho-AI-Pro</span> đã sẵn sàng để sử dụng.
        </p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="absolute bottom-10 left-0 w-full px-6"
      >
        <button 
          onClick={onFinish}
          className="w-full bg-primary text-white py-4 rounded-xl font-semibold shadow-md shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98]"
        >
          Đến Bảng điều khiển
        </button>
      </motion.div>
    </motion.div>
  );
}

// --- Components ---

function ConnectionMode({ 
  onBack, 
  onSelectQR, 
  onSelectBluetooth 
}: { 
  onBack: () => void, 
  onSelectQR: () => void, 
  onSelectBluetooth: () => void 
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-slate-50 flex flex-col"
    >
      <header className="bg-gradient-to-br from-primary to-secondary px-4 py-4 flex items-center gap-4 sticky top-0 z-10 shadow-md">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-white">Chọn phương thức kết nối</h1>
      </header>

      <div className="flex-1 p-6 space-y-4">
        <p className="text-slate-500 text-sm mb-6">
          Vui lòng chọn một trong các phương thức dưới đây để ghép nối ống nghe kỹ thuật số với ứng dụng.
        </p>

        {/* QR Mode */}
        <button 
          onClick={onSelectQR}
          className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex items-start gap-5 hover:border-primary/50 transition-all active:bg-slate-50 text-left group"
        >
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <QrCode className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-800 text-base">Quét mã QR</h3>
              <span className="text-[10px] uppercase tracking-wider font-bold bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">Khuyên dùng</span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">
              Kết nối nhanh và chính xác nhất bằng cách quét mã QR in trên hộp hoặc thân thiết bị.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 self-center" />
        </button>

        {/* Bluetooth Mode */}
        <button 
          onClick={onSelectBluetooth}
          className="w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 flex items-start gap-5 hover:border-primary/50 transition-all active:bg-slate-50 text-left group"
        >
          <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-slate-200 transition-colors">
            <Bluetooth className="w-7 h-7 text-slate-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-800 text-base mb-1">Bluetooth truyền thống</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Tìm kiếm và ghép nối thủ công qua danh sách thiết bị Bluetooth xung quanh.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-300 self-center" />
        </button>
        
        <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            Hãy đảm bảo thiết bị đã được bật nguồn và đèn tín hiệu đang nhấp nháy màu xanh dương trước khi kết nối.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function QRScanner({ onBack, onSuccess, onManual }: { onBack: () => void, onSuccess: () => void, onManual: () => void }) {
  const [isScanning, setIsScanning] = useState(true);

  // Simulate automatic scan after 3 seconds for demo purposes
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsScanning(false);
      setTimeout(onSuccess, 1000); // Wait 1s on success state before redirecting
    }, 3000);
    return () => clearTimeout(timer);
  }, [onSuccess]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-slate-900 text-white flex flex-col"
    >
      <header className="px-4 py-4 flex items-center gap-4 sticky top-0 z-10 bg-slate-900/80 backdrop-blur-md">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold">Quét mã thiết bị</h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {/* Viewport mask simulation */}
        <div className="absolute inset-0 bg-black/40 pointer-events-none z-0" />
        
        {/* Scanner frame */}
        <div className="relative z-10 w-72 h-72 border-2 border-white/20 rounded-3xl overflow-hidden shadow-2xl">
          {/* Mock Camera View */}
          <div className="absolute inset-0 bg-slate-800/80 backdrop-blur-sm flex items-center justify-center">
            {isScanning ? (
              <QrCode className="w-32 h-32 text-white/10" />
            ) : (
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center"
              >
                <CheckCircle2 className="w-10 h-10 text-white" />
              </motion.div>
            )}
          </div>

          {/* Corner brackets */}
          <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-secondary rounded-tl-3xl" />
          <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-secondary rounded-tr-3xl" />
          <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-secondary rounded-bl-3xl" />
          <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-secondary rounded-br-3xl" />

          {/* Scanning line animation */}
          {isScanning && (
            <motion.div 
              animate={{ y: [0, 280, 0] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
              className="absolute top-0 left-0 w-full h-1 bg-secondary shadow-[0_0_15px_rgba(0,168,150,0.8)]"
            />
          )}
        </div>

        <div className="mt-12 text-center z-10 space-y-2">
          <p className="text-lg font-medium text-white">
            {isScanning ? "Đang tìm kiếm mã QR..." : "Quét mã thành công!"}
          </p>
          <p className="text-white/60 text-sm max-w-[260px] mx-auto">
            {isScanning && "Hướng camera vào mã QR được dán trên thân ống nghe hoặc bên trong hộp."}
          </p>
        </div>

        {/* Manual entry option */}
        <div className="absolute bottom-10 left-0 w-full px-6 flex justify-center z-10">
          <button 
            onClick={onManual}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-medium transition-colors"
          >
            Không thể quét mã? Nhập thủ công
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ManualCode({ onBack, onSuccess }: { onBack: () => void, onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return;
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      onSuccess();
    }, 1500);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-slate-50 flex flex-col"
    >
      <header className="bg-gradient-to-br from-primary to-secondary px-4 py-4 flex items-center gap-4 sticky top-0 z-10 shadow-md">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-white">Nhập mã thủ công</h1>
      </header>

      <div className="flex-1 p-6">
        <p className="text-slate-500 text-sm mb-8">
          Nhập mã seri gồm 6-8 ký tự được in bên cạnh mã QR trên thân thiết bị của bạn.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Mã thiết bị (Serial Number)</label>
            <input 
              type="text" 
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="VD: STAI-XXXXX"
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-4 text-lg font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-400"
              maxLength={10}
            />
          </div>

          <button 
            type="submit"
            disabled={code.length < 6 || isVerifying}
            className="w-full bg-primary text-white py-4 px-6 rounded-xl font-medium shadow-md shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Đang xác thực...
              </>
            ) : "Xác nhận kết nối"}
          </button>
        </form>
      </div>
    </motion.div>
  );
}

function BluetoothScanner({ onBack, onSuccess }: { onBack: () => void, onSuccess: () => void }) {
  const [devices, setDevices] = useState<{id: string, name: string, status: 'idle'|'connecting'}[]>([]);
  const [isScanning, setIsScanning] = useState(true);

  // Mock finding devices
  useEffect(() => {
    const timer = setTimeout(() => {
      setDevices([
        { id: '1', name: 'Stetho-AI-Pro-08B', status: 'idle' },
        { id: '2', name: 'Stetho-AI-Lite-11C', status: 'idle' }
      ]);
      setIsScanning(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleConnect = (id: string) => {
    setDevices(devices.map(d => d.id === id ? { ...d, status: 'connecting' } : d));
    setTimeout(() => {
      onSuccess();
    }, 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-slate-50 flex flex-col"
    >
      <header className="bg-gradient-to-br from-primary to-secondary px-4 py-4 flex items-center gap-4 sticky top-0 z-10 shadow-md">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-white">Kết nối Bluetooth</h1>
      </header>

      <div className="flex-1 flex flex-col">
        {/* Radar Animation Area */}
        <div className="h-64 bg-slate-800 flex items-center justify-center relative overflow-hidden shrink-0">
          {/* Radar Circles */}
          <div className="absolute w-[400px] h-[400px] rounded-full border border-slate-700" />
          <div className="absolute w-[280px] h-[280px] rounded-full border border-slate-600" />
          <div className="absolute w-[160px] h-[160px] rounded-full border border-slate-500" />
          
          <div className="relative z-10 w-20 h-20 bg-primary rounded-full shadow-[0_0_30px_rgba(11,92,154,0.6)] flex items-center justify-center">
            <Smartphone className="w-8 h-8 text-white" />
          </div>

          {/* Radar sweep */}
          {isScanning && (
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
              className="absolute w-[200px] h-[200px] top-1/2 left-1/2 origin-top-left"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(11,92,154,0.4) 90deg, transparent 90deg)'
              }}
            />
          )}

          <div className="absolute bottom-6 text-center w-full">
            <p className="text-slate-300 text-sm font-medium">
              {isScanning ? "Đang tìm kiếm thiết bị xung quanh..." : "Đã quét xong"}
            </p>
          </div>
        </div>

        {/* Device List */}
        <div className="p-6 flex-1 bg-slate-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Thiết bị khả dụng</h3>
            {!isScanning && (
              <button 
                onClick={() => {
                  setIsScanning(true);
                  setDevices([]);
                  setTimeout(() => {
                    setDevices([
                      { id: '1', name: 'Stetho-AI-Pro-08B', status: 'idle' },
                      { id: '2', name: 'Stetho-AI-Lite-11C', status: 'idle' }
                    ]);
                    setIsScanning(false);
                  }, 2500);
                }}
                className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline px-3 py-1.5 bg-primary/10 rounded-full transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Quét lại
              </button>
            )}
          </div>
          
          {devices.length === 0 && !isScanning && (
            <div className="text-center py-8">
              <p className="text-slate-500">Không tìm thấy thiết bị nào.</p>
            </div>
          )}

          <div className="space-y-3">
            {devices.map(device => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={device.id}
                className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <Bluetooth className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800">{device.name}</h4>
                    <p className="text-xs text-slate-500">Sẵn sàng kết nối</p>
                  </div>
                </div>
                
                <button
                  disabled={device.status === 'connecting'}
                  onClick={() => handleConnect(device.id)}
                  className="px-4 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
                >
                  {device.status === 'connecting' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Đang kết nối</>
                  ) : "Kết nối"}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}