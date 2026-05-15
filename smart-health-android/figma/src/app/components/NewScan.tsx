import { ArrowLeft, User, Calendar, Stethoscope, Activity, FileText, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export default function NewScan() {
  const navigate = useNavigate();
  const [scanType, setScanType] = useState<'heart' | 'lung'>('heart');
  const [patientId, setPatientId] = useState('');

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/monitoring');
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-4 flex items-center justify-between shadow-md z-10">
        <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-white text-lg font-semibold">Tạo Lượt Đo Mới</h1>
        <div className="w-6" />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <form onSubmit={handleStart} className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Thông Tin Bệnh Nhân</h2>
            
            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Mã bệnh nhân hoặc Họ tên" 
                  className="w-full pl-12 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A]/50 focus:border-[#0B5C9A] font-medium"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  required
                />
              </div>
              
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input 
                  type="date" 
                  className="w-full pl-12 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A]/50 focus:border-[#0B5C9A] text-foreground font-medium"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Loại Kiểm Tra</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setScanType('heart')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${
                  scanType === 'heart' 
                    ? 'border-[#0B5C9A] bg-[#0B5C9A]/5 text-[#0B5C9A]' 
                    : 'border-border bg-white text-muted-foreground hover:border-[#0B5C9A]/30'
                }`}
              >
                <div className={`p-3 rounded-full ${scanType === 'heart' ? 'bg-[#0B5C9A]/10' : 'bg-muted'}`}>
                  <Activity className="w-8 h-8" />
                </div>
                <span className="font-semibold">Tim</span>
              </button>
              
              <button
                type="button"
                onClick={() => setScanType('lung')}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${
                  scanType === 'lung' 
                    ? 'border-[#00A896] bg-[#00A896]/5 text-[#00A896]' 
                    : 'border-border bg-white text-muted-foreground hover:border-[#00A896]/30'
                }`}
              >
                <div className={`p-3 rounded-full ${scanType === 'lung' ? 'bg-[#00A896]/10' : 'bg-muted'}`}>
                  <Stethoscope className="w-8 h-8" />
                </div>
                <span className="font-semibold">Phổi</span>
              </button>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Ghi Chú Lâm Sàng (Tùy chọn)</h2>
            <div className="relative">
              <FileText className="absolute left-4 top-4 w-5 h-5 text-muted-foreground" />
              <textarea 
                placeholder="Thêm triệu chứng sơ bộ hoặc ghi chú..." 
                className="w-full pl-12 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A]/50 focus:border-[#0B5C9A] min-h-[100px] resize-none font-medium"
              />
            </div>
          </div>

          <div className="pt-6">
            <button 
              type="submit"
              className="w-full bg-gradient-to-r from-[#0B5C9A] to-[#00A896] text-white py-4 rounded-2xl font-bold shadow-lg shadow-[#0B5C9A]/20 hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
            >
              Tiếp tục để Theo dõi
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
