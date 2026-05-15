import { useState } from 'react';
import { ArrowLeft, AlertOctagon, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function DeleteData() {
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  
  const isConfirmed = confirmText === 'XOA DU LIEU';

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans flex flex-col">
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-200 shadow-sm z-10 sticky top-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-gray-900 text-lg font-semibold ml-2">Xoá Toàn Bộ Dữ Liệu</h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertOctagon className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Khu Vực Nguy Hiểm</h2>
          <p className="text-sm text-gray-600 leading-relaxed max-w-[280px]">
            Bạn đang yêu cầu xoá vĩnh viễn toàn bộ dữ liệu. Hành động này không thể hoàn tác.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-red-200 shadow-sm mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Dữ liệu sẽ bị xoá vĩnh viễn:</h3>
          <ul className="space-y-2 mb-4">
            <li className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
              Hồ sơ bệnh án và lịch sử khám
            </li>
            <li className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
              Tất cả bản ghi âm thanh (PCG/Phổi)
            </li>
            <li className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
              Báo cáo phân tích từ AI
            </li>
            <li className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
              Thiết lập thiết bị & thông tin cá nhân
            </li>
          </ul>

          <div className="pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Nhập <strong className="text-red-600 font-bold">XOA DU LIEU</strong> để xác nhận:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="block w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-red-500 focus:border-red-500 sm:text-sm bg-gray-50 text-gray-900 placeholder-gray-400"
              placeholder="Nhập vào đây..."
            />
          </div>
        </div>

        <button
          disabled={!isConfirmed}
          className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-sm transition-all ${
            isConfirmed 
              ? 'bg-red-600 hover:bg-red-700 text-white active:scale-[0.98]' 
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Trash2 className="w-5 h-5" />
          Xoá Toàn Bộ Dữ Liệu
        </button>
      </div>
    </div>
  );
}