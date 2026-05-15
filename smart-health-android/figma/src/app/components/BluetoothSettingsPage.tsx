import { useState } from 'react';
import { ArrowLeft, Bluetooth, Stethoscope, Info, RefreshCw, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function BluetoothSettingsPage() {
  const navigate = useNavigate();
  const [isSearching, setIsSearching] = useState(false);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(true);

  const handleSearch = () => {
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 3000);
  };

  const ToggleSwitch = ({ isOn, onClick }: { isOn: boolean, onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        isOn ? 'bg-[#0B5C9A]' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${
          isOn ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans flex flex-col">
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-200 shadow-sm z-10 sticky top-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-gray-900 text-lg font-semibold ml-2">Cài Đặt Bluetooth</h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {/* Main Toggle */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${bluetoothEnabled ? 'bg-blue-100 text-[#0B5C9A]' : 'bg-gray-100 text-gray-400'}`}>
              <Bluetooth className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Bluetooth</h3>
              <p className="text-xs text-gray-500">{bluetoothEnabled ? 'Đang bật' : 'Đang tắt'}</p>
            </div>
          </div>
          <ToggleSwitch isOn={bluetoothEnabled} onClick={() => setBluetoothEnabled(!bluetoothEnabled)} />
        </div>

        {bluetoothEnabled && (
          <>
            {/* Connected Device */}
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">Thiết Bị Của Tôi</h4>
            <div className="bg-white rounded-2xl p-2 border border-gray-200 shadow-sm mb-6">
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#00A896]/10 flex items-center justify-center">
                    <Stethoscope className="w-5 h-5 text-[#00A896]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">StethoEdge Pro</h3>
                    <p className="text-xs text-[#00A896] font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00A896]"></span> Đã kết nối
                    </p>
                  </div>
                </div>
                <button className="p-2 text-gray-400 hover:text-[#0B5C9A] transition-colors rounded-full hover:bg-gray-100">
                  <Settings2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Available Devices */}
            <div className="flex items-center justify-between mb-3 px-2">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Thiết Bị Hiện Có</h4>
              <button 
                onClick={handleSearch}
                className="text-xs font-semibold text-[#0B5C9A] flex items-center gap-1 hover:underline"
              >
                <RefreshCw className={`w-3 h-3 ${isSearching ? 'animate-spin' : ''}`} />
                {isSearching ? 'Đang tìm...' : 'Quét lại'}
              </button>
            </div>
            
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
              <div className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Bluetooth className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">LiteSteth-A92</h3>
                    <p className="text-xs text-gray-500">Sẵn sàng ghép nối</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer rounded-b-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Bluetooth className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">MACS-Audio 2.0</h3>
                    <p className="text-xs text-gray-500">Sẵn sàng ghép nối</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-start gap-2 px-2 text-gray-500">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                Đảm bảo ống nghe của bạn đang ở chế độ chờ ghép nối (đèn LED chớp xanh). Khoảng cách tối ưu để kết nối là dưới 2 mét.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}