import { useState } from 'react';
import { ArrowLeft, Network, Cloud, BrainCircuit, Users } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function DataAccess() {
  const navigate = useNavigate();
  
  const [toggles, setToggles] = useState({
    doctors: true,
    cloud: false,
    aiResearch: false,
    thirdParty: false
  });

  const handleToggle = (key: keyof typeof toggles) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const ToggleSwitch = ({ isOn, onClick }: { isOn: boolean, onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#00A896] focus:ring-offset-2 ${
        isOn ? 'bg-[#00A896]' : 'bg-gray-300'
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
        <h1 className="text-gray-900 text-lg font-semibold ml-2">Quyền Truy Cập Dữ Liệu</h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <p className="text-sm text-gray-500 mb-6">Quản lý cách dữ liệu y tế, bản ghi âm thanh và báo cáo phân tích của bạn được sử dụng và chia sẻ.</p>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex items-center justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Users className="w-6 h-6 text-[#0B5C9A] mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Chia sẻ với Bác sĩ</h3>
                <p className="text-xs text-gray-500 mt-1 mr-4">Cho phép các bác sĩ trong hệ thống của phòng khám xem hồ sơ và bản thu âm của bạn.</p>
              </div>
            </div>
            <ToggleSwitch isOn={toggles.doctors} onClick={() => handleToggle('doctors')} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex items-center justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Cloud className="w-6 h-6 text-[#0B5C9A] mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Đồng bộ Đám mây (Cloud)</h3>
                <p className="text-xs text-gray-500 mt-1 mr-4">Tự động sao lưu dữ liệu đo nhịp tim, nhịp thở lên máy chủ bảo mật chuẩn HIPAA.</p>
              </div>
            </div>
            <ToggleSwitch isOn={toggles.cloud} onClick={() => handleToggle('cloud')} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex items-center justify-between">
            <div className="flex items-start gap-3 flex-1">
              <BrainCircuit className="w-6 h-6 text-[#0B5C9A] mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Nghiên cứu Edge AI</h3>
                <p className="text-xs text-gray-500 mt-1 mr-4">Đóng góp dữ liệu ẩn danh (không chứa thông tin cá nhân) để cải thiện mô hình AI phát hiện bệnh lý.</p>
              </div>
            </div>
            <ToggleSwitch isOn={toggles.aiResearch} onClick={() => handleToggle('aiResearch')} />
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex items-center justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Network className="w-6 h-6 text-gray-500 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Ứng dụng bên thứ ba</h3>
                <p className="text-xs text-gray-500 mt-1 mr-4">Cấp quyền cho các ứng dụng theo dõi sức khỏe khác (như Google Fit) đọc dữ liệu.</p>
              </div>
            </div>
            <ToggleSwitch isOn={toggles.thirdParty} onClick={() => handleToggle('thirdParty')} />
          </div>
        </div>
      </div>
    </div>
  );
}