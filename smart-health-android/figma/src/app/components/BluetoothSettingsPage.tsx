import { useState } from 'react';
import { ArrowLeft, Stethoscope, Info, RefreshCw, Settings2, Power, Battery } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function BluetoothSettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans flex flex-col">
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-200 shadow-sm z-10 sticky top-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-gray-900 text-lg font-semibold ml-2">Quản Lý Thiết Bị</h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {/* Connected Device */}
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">Thiết Bị Đang Kết Nối</h4>
        <div className="bg-white rounded-2xl p-4 border border-[#10B981]/20 shadow-sm mb-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-[#10B981]"></div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#10B981]/10 rounded-full">
                <Stethoscope className="w-6 h-6 text-[#10B981]" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Stetho-AI-Pro</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
                  <p className="text-xs text-[#10B981] font-medium">Đang hoạt động</p>
                </div>
              </div>
            </div>
            <button className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5">
              <Power className="w-3.5 h-3.5" />
              Ngắt kết nối
            </button>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 px-1">
            <div className="flex items-center gap-1.5">
              <Battery className="w-4 h-4 text-emerald-500" />
              <span>Pin: 85%</span>
            </div>
            <span>Phương thức: Quét mã QR</span>
          </div>
        </div>

        {/* Saved Devices */}
        <div className="flex items-center justify-between mb-3 px-2">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Lịch Sử Ghép Nối</h4>
          <button 
            onClick={() => navigate('/bluetooth')}
            className="text-xs font-semibold text-[#0B5C9A] flex items-center gap-1 hover:underline bg-[#0B5C9A]/10 px-3 py-1.5 rounded-full"
          >
            + Thêm thiết bị
          </button>
        </div>
            
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
              <div className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Stethoscope className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">LiteSteth-A92</h3>
                    <p className="text-xs text-gray-500">Đã lưu (ghép nối qua QR)</p>
                  </div>
                </div>
                <button className="text-xs text-red-500 font-medium px-2 py-1 hover:bg-red-50 rounded-lg transition-colors">Xóa</button>
              </div>
              
              <div className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer rounded-b-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Stethoscope className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">MACS-Audio 2.0</h3>
                    <p className="text-xs text-gray-500">Đã lưu (ghép nối qua Bluetooth)</p>
                  </div>
                </div>
                <button className="text-xs text-red-500 font-medium px-2 py-1 hover:bg-red-50 rounded-lg transition-colors">Xóa</button>
              </div>
            </div>

            <div className="mt-6 flex items-start gap-2 px-2 text-gray-500">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                Quản lý các thiết bị ống nghe đã từng kết nối. Để thêm thiết bị mới bằng QR code hoặc Bluetooth, vui lòng nhấn "Thêm thiết bị".
              </p>
            </div>
      </div>
    </div>
  );
}