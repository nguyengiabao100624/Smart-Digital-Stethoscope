import { ArrowLeft, Filter, Heart, Wind, AlertTriangle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export default function MedicalRecords() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'recent' | 'heart' | 'lung' | 'abnormal'>('recent');

  const records = [
    {
      id: 'HS-2845',
      patientId: 'BN-2845',
      patientName: 'Nguyễn Văn An',
      date: '12-05-2026',
      time: '14:35',
      duration: '2:34',
      type: 'heart',
      status: 'normal',
      diagnosis: 'Nhịp xoang bình thường',
      aiConfidence: 98
    },
    {
      id: 'HS-2844',
      patientId: 'BN-2844',
      patientName: 'Trần Thị Mai',
      date: '12-05-2026',
      time: '13:20',
      duration: '3:12',
      type: 'lung',
      status: 'abnormal',
      diagnosis: 'Phát hiện tiếng ran nổ - Đáy phổi trái',
      aiConfidence: 94
    },
    {
      id: 'HS-2843',
      patientId: 'BN-2843',
      patientName: 'Lê Văn Minh',
      date: '12-05-2026',
      time: '11:45',
      duration: '2:18',
      type: 'heart',
      status: 'normal',
      diagnosis: 'Âm sắc tim bình thường',
      aiConfidence: 99
    },
    {
      id: 'HS-2842',
      patientId: 'BN-2842',
      patientName: 'Phạm Thuỳ Linh',
      date: '11-05-2026',
      time: '16:20',
      duration: '4:05',
      type: 'lung',
      status: 'abnormal',
      diagnosis: 'Tiếng rít - Cả hai bên phổi',
      aiConfidence: 91
    },
    {
      id: 'HS-2841',
      patientId: 'BN-2841',
      patientName: 'Hoàng Minh Tuấn',
      date: '11-05-2026',
      time: '15:10',
      duration: '2:45',
      type: 'heart',
      status: 'abnormal',
      diagnosis: 'Âm thổi tim - Mức 2/6',
      aiConfidence: 96
    },
    {
      id: 'HS-2840',
      patientId: 'BN-2840',
      patientName: 'Đặng Mai Phương',
      date: '11-05-2026',
      time: '14:00',
      duration: '2:55',
      type: 'lung',
      status: 'normal',
      diagnosis: 'Âm thanh nhịp thở rõ ràng',
      aiConfidence: 97
    }
  ];

  const filteredRecords = records.filter(record => {
    if (activeTab === 'recent') return true;
    if (activeTab === 'heart') return record.type === 'heart';
    if (activeTab === 'lung') return record.type === 'lung';
    if (activeTab === 'abnormal') return record.status === 'abnormal';
    return true;
  });

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-4 flex items-center justify-between shadow-md relative z-10">
        <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-white text-lg font-semibold">Hồ Sơ Bệnh Án</h1>
        <button className="text-white/80 hover:text-white transition-colors">
          <Filter className="w-6 h-6" />
        </button>
      </div>

      <div className="px-6 py-4">
        <div className="flex gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar">
          <button
            onClick={() => setActiveTab('recent')}
            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all font-medium ${
              activeTab === 'recent'
                ? 'bg-[#0B5C9A] text-white shadow-lg shadow-[#0B5C9A]/30 border-transparent'
                : 'bg-white text-foreground border border-border hover:bg-slate-50'
            }`}
          >
            Gần đây
          </button>
          <button
            onClick={() => setActiveTab('heart')}
            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-2 font-medium ${
              activeTab === 'heart'
                ? 'bg-[#0B5C9A] text-white shadow-lg shadow-[#0B5C9A]/30 border-transparent'
                : 'bg-white text-foreground border border-border hover:bg-slate-50'
            }`}
          >
            <Heart className="w-4 h-4" />
            Đo Tim
          </button>
          <button
            onClick={() => setActiveTab('lung')}
            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-2 font-medium ${
              activeTab === 'lung'
                ? 'bg-[#0B5C9A] text-white shadow-lg shadow-[#0B5C9A]/30 border-transparent'
                : 'bg-white text-foreground border border-border hover:bg-slate-50'
            }`}
          >
            <Wind className="w-4 h-4" />
            Đo Phổi
          </button>
          <button
            onClick={() => setActiveTab('abnormal')}
            className={`px-4 py-2 rounded-xl whitespace-nowrap transition-all flex items-center gap-2 font-medium ${
              activeTab === 'abnormal'
                ? 'bg-[#0B5C9A] text-white shadow-lg shadow-[#0B5C9A]/30 border-transparent'
                : 'bg-white text-foreground border border-border hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Chỉ cảnh báo
          </button>
        </div>

        <div className="space-y-3 pb-6">
          {filteredRecords.map((record) => (
            <button
              key={record.id}
              onClick={() => navigate('/records/detail')}
              className="w-full bg-white border border-border rounded-2xl p-4 hover:shadow-md transition-shadow text-left group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-muted-foreground font-medium">{record.id}</span>
                    {record.type === 'heart' ? (
                      <div className="bg-[#EF4444]/10 p-1 rounded">
                        <Heart className="w-3 h-3 text-[#EF4444]" />
                      </div>
                    ) : (
                      <div className="bg-[#0EA5E9]/10 p-1 rounded">
                        <Wind className="w-3 h-3 text-[#0EA5E9]" />
                      </div>
                    )}
                  </div>
                  <p className="font-semibold text-foreground group-hover:text-[#0B5C9A] transition-colors mb-1">{record.patientName}</p>
                  <p className="text-sm text-muted-foreground">{record.patientId}</p>
                </div>
                <div>
                  {record.status === 'normal' ? (
                    <div className="bg-[#10B981]/10 text-[#10B981] px-3 py-1 rounded-full text-xs flex items-center gap-1 font-medium">
                      <CheckCircle className="w-3 h-3" />
                      Bình thường
                    </div>
                  ) : (
                    <div className="bg-[#F59E0B]/10 text-[#F59E0B] px-3 py-1 rounded-full text-xs flex items-center gap-1 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      Bất thường
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-3">
                <p className="text-sm text-foreground/80 font-medium">{record.diagnosis}</p>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground font-medium">
                    {record.date} • {record.time}
                  </span>
                  <span className="text-muted-foreground">Thời lượng: {record.duration}</span>
                </div>
                <div className="flex items-center gap-1 bg-[#0B5C9A]/5 px-2 py-1 rounded-md">
                  <span className="text-xs text-muted-foreground font-medium">AI:</span>
                  <span className="text-xs text-[#0B5C9A] font-bold">{record.aiConfidence}%</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
