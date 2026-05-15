import { ArrowLeft, Bluetooth, BluetoothSearching, CheckCircle2, Info, Loader2, Smartphone } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';

export default function BluetoothPairing() {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(true);
  const [devices, setDevices] = useState<any[]>([]);
  const [connectingTo, setConnectingTo] = useState<string | null>(null);

  useEffect(() => {
    // Mock scanning delay
    const timer = setTimeout(() => {
      setDevices([
        { id: '1', name: 'Stetho-AI-204A', signal: -45, status: 'available' },
        { id: '2', name: 'Stetho-Pro-91B', signal: -78, status: 'available' },
      ]);
      setIsScanning(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const connectToDevice = (id: string) => {
    setConnectingTo(id);
    setTimeout(() => {
      // Mock successful connection
      navigate(-1);
    }, 2000);
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-4 flex items-center justify-between shadow-md relative z-10">
        <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-white text-lg font-semibold">Ghép Nối Thiết Bị</h1>
        <div className="w-6" /> {/* Spacer */}
      </div>

      <div className="flex-1 p-6 flex flex-col items-center">
        <div className="my-8 relative">
          <div className={`absolute inset-0 bg-[#0B5C9A]/10 rounded-full blur-3xl transition-all duration-1000 ${isScanning ? 'scale-150 animate-pulse' : 'scale-100'}`} />
          <div className="relative w-32 h-32 bg-gradient-to-br from-[#0B5C9A] to-[#0E7AB8] rounded-full flex items-center justify-center shadow-2xl shadow-[#0B5C9A]/30">
            {isScanning ? (
              <BluetoothSearching className="w-16 h-16 text-white animate-pulse" />
            ) : (
              <Bluetooth className="w-16 h-16 text-white" />
            )}
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-[#0B5C9A] mb-2">
            {isScanning ? 'Đang tìm kiếm thiết bị...' : 'Thiết Bị Khả Dụng'}
          </h2>
          <p className="text-muted-foreground text-sm max-w-[250px] font-medium">
            Hãy đảm bảo Ống nghe Thông minh của bạn đã được bật và ở chế độ ghép nối.
          </p>
        </div>

        <div className="w-full max-w-md space-y-3">
          {devices.map((device) => (
            <button
              key={device.id}
              onClick={() => connectToDevice(device.id)}
              disabled={connectingTo !== null}
              className={`w-full bg-white border rounded-2xl p-4 flex items-center justify-between transition-all ${
                connectingTo === device.id 
                  ? 'border-[#0B5C9A] shadow-md ring-2 ring-[#0B5C9A]/20' 
                  : 'border-border hover:shadow-md hover:border-[#0B5C9A]/50'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-xl ${connectingTo === device.id ? 'bg-[#0B5C9A]/10' : 'bg-muted'}`}>
                  <Smartphone className={`w-6 h-6 ${connectingTo === device.id ? 'text-[#0B5C9A]' : 'text-muted-foreground'}`} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">{device.name}</p>
                  <p className="text-xs text-muted-foreground font-medium">Tín hiệu: {device.signal} dBm</p>
                </div>
              </div>
              
              {connectingTo === device.id ? (
                <Loader2 className="w-5 h-5 text-[#0B5C9A] animate-spin" />
              ) : (
                <span className="text-xs font-semibold text-[#00A896] bg-[#00A896]/10 px-3 py-1 rounded-full">
                  Kết Nối
                </span>
              )}
            </button>
          ))}

          {!isScanning && devices.length === 0 && (
            <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-2xl border border-dashed border-border">
              <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Không tìm thấy thiết bị nào</p>
            </div>
          )}
        </div>

        {!isScanning && (
          <button 
            onClick={() => {
              setIsScanning(true);
              setDevices([]);
              setTimeout(() => {
                setDevices([
                  { id: '1', name: 'Stetho-AI-204A', signal: -45, status: 'available' },
                  { id: '2', name: 'Stetho-Pro-91B', signal: -78, status: 'available' },
                ]);
                setIsScanning(false);
              }, 3000);
            }}
            className="mt-8 text-[#0B5C9A] font-semibold text-sm hover:underline"
          >
            Quét Lại
          </button>
        )}
      </div>
    </div>
  );
}
