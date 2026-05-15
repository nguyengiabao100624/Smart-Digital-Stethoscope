import { Home, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <AlertTriangle className="w-10 h-10 text-red-500" />
      </div>
      <h1 className="text-4xl font-bold text-[#0B5C9A] mb-2">404</h1>
      <h2 className="text-xl font-semibold text-foreground mb-4">Không tìm thấy trang</h2>
      <p className="text-muted-foreground mb-8 max-w-[250px] font-medium">
        Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di dời.
      </p>
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 bg-[#0B5C9A] text-white px-6 py-3 rounded-xl hover:bg-[#094A7D] transition-colors font-semibold shadow-md"
      >
        <Home className="w-5 h-5" />
        Quay lại
      </button>
    </div>
  );
}
