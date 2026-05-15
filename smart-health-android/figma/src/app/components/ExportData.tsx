import { useState } from 'react';
import { ArrowLeft, Download, FileText, FileAudio, FileSpreadsheet, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function ExportData() {
  const navigate = useNavigate();
  const [format, setFormat] = useState('pdf');
  const [types, setTypes] = useState({
    audio: true,
    reports: true,
    history: true
  });

  const handleToggleType = (key: keyof typeof types) => {
    setTypes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen w-full bg-gray-50 font-sans flex flex-col">
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-200 shadow-sm z-10 sticky top-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:text-gray-900 transition-colors rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-gray-900 text-lg font-semibold ml-2">Xuất Dữ Liệu</h1>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <p className="text-sm text-gray-500 mb-6">Trích xuất hồ sơ bệnh án, bản ghi âm và báo cáo phân tích để lưu trữ hoặc chia sẻ với Bác sĩ khác.</p>

        {/* Date Range Selection (Mock) */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Phạm vi thời gian</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="w-4 h-4 text-gray-400" />
              </div>
              <input type="text" readOnly value="01/01/2026" className="block w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:outline-none" />
            </div>
            <span className="text-gray-400 text-sm">đến</span>
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Calendar className="w-4 h-4 text-gray-400" />
              </div>
              <input type="text" readOnly value="13/05/2026" className="block w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:outline-none" />
            </div>
          </div>
        </div>

        {/* Data Types */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Loại dữ liệu</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
              <div className="relative flex items-center justify-center">
                <input type="checkbox" className="peer sr-opacity-0 w-5 h-5 opacity-0 absolute" checked={types.history} onChange={() => handleToggleType('history')} />
                <div className={`w-5 h-5 border-2 rounded transition-colors ${types.history ? 'bg-[#0B5C9A] border-[#0B5C9A]' : 'border-gray-300 bg-white'}`}>
                  {types.history && <svg className="w-3.5 h-3.5 text-white mx-auto mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
              <FileSpreadsheet className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-700">Lịch sử khám & thông số</span>
            </label>

            <label className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
              <div className="relative flex items-center justify-center">
                <input type="checkbox" className="peer sr-opacity-0 w-5 h-5 opacity-0 absolute" checked={types.reports} onChange={() => handleToggleType('reports')} />
                <div className={`w-5 h-5 border-2 rounded transition-colors ${types.reports ? 'bg-[#0B5C9A] border-[#0B5C9A]' : 'border-gray-300 bg-white'}`}>
                  {types.reports && <svg className="w-3.5 h-3.5 text-white mx-auto mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
              <FileText className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-700">Báo cáo phân tích AI</span>
            </label>

            <label className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
              <div className="relative flex items-center justify-center">
                <input type="checkbox" className="peer sr-opacity-0 w-5 h-5 opacity-0 absolute" checked={types.audio} onChange={() => handleToggleType('audio')} />
                <div className={`w-5 h-5 border-2 rounded transition-colors ${types.audio ? 'bg-[#0B5C9A] border-[#0B5C9A]' : 'border-gray-300 bg-white'}`}>
                  {types.audio && <svg className="w-3.5 h-3.5 text-white mx-auto mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
              <FileAudio className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-700">Bản ghi âm thanh gốc (.wav)</span>
            </label>
          </div>
        </div>

        {/* Format Selection */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm mb-8">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Định dạng tập tin</h3>
          <div className="grid grid-cols-2 gap-3">
             <button
                onClick={() => setFormat('pdf')}
                className={`py-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                  format === 'pdf' ? 'border-[#0B5C9A] bg-blue-50 text-[#0B5C9A]' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
             >
                <span className="font-bold text-sm">PDF + WAV</span>
             </button>
             <button
                onClick={() => setFormat('zip')}
                className={`py-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                  format === 'zip' ? 'border-[#0B5C9A] bg-blue-50 text-[#0B5C9A]' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
             >
                <span className="font-bold text-sm">Nén ZIP</span>
             </button>
          </div>
        </div>

        <button className="w-full py-3.5 bg-[#0B5C9A] hover:bg-[#094A7D] text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]">
          <Download className="w-5 h-5" />
          Tạo bản xuất dữ liệu
        </button>
      </div>
    </div>
  );
}