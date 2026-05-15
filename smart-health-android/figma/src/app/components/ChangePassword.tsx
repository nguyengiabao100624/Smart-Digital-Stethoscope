import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-200 shadow-sm z-10 sticky top-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-gray-900 text-lg font-semibold ml-2">Đổi Mật Khẩu</h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-[#0B5C9A] flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#0B5C9A] mb-1">Bảo mật tài khoản y tế</p>
            <p className="text-xs text-gray-600 leading-relaxed">Mật khẩu cần tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường và số để đảm bảo an toàn cho dữ liệu bệnh nhân.</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Current Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu hiện tại</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-gray-400" />
              </div>
              <input
                type={showCurrent ? 'text' : 'password'}
                className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-[#0B5C9A] focus:border-[#0B5C9A] sm:text-sm bg-white text-gray-900 placeholder-gray-400 transition-shadow"
                placeholder="Nhập mật khẩu hiện tại"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                {showCurrent ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu mới</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-gray-400" />
              </div>
              <input
                type={showNew ? 'text' : 'password'}
                className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-[#0B5C9A] focus:border-[#0B5C9A] sm:text-sm bg-white text-gray-900 placeholder-gray-400 transition-shadow"
                placeholder="Nhập mật khẩu mới"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Xác nhận mật khẩu mới</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-gray-400" />
              </div>
              <input
                type={showConfirm ? 'text' : 'password'}
                className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl focus:ring-[#0B5C9A] focus:border-[#0B5C9A] sm:text-sm bg-white text-gray-900 placeholder-gray-400 transition-shadow"
                placeholder="Nhập lại mật khẩu mới"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <button className="w-full py-3.5 bg-[#0B5C9A] hover:bg-[#094A7D] text-white font-semibold rounded-xl shadow-md transition-all active:scale-[0.98]">
            Cập nhật mật khẩu
          </button>
          <div className="text-center mt-4">
            <button className="text-[#0B5C9A] text-sm font-medium hover:underline">Quên mật khẩu hiện tại?</button>
          </div>
        </div>
      </div>
    </div>
  );
}