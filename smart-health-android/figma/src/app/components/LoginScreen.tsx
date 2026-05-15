import { useState } from 'react';
import { Mail, Lock, User, Phone } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';

export default function LoginScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'doctor' | 'patient'>('doctor');

  const handleLogin = () => {
    if (mode === 'doctor') {
      navigate('/dashboard');
    } else {
      navigate('/patient-dashboard');
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="flex-1 flex flex-col p-6 max-w-md mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center mb-8"
          >
            <h1 className="text-3xl text-[#0B5C9A] mb-2 font-semibold">Chào mừng trở lại</h1>
            <p className="text-muted-foreground">Đăng nhập để tiếp tục</p>
          </motion.div>

          <div className="bg-muted/50 rounded-xl p-1 mb-6 flex gap-1">
            <button
              onClick={() => setMode('doctor')}
              className={`flex-1 py-3 rounded-lg transition-all font-medium ${
                mode === 'doctor'
                  ? 'bg-white shadow-sm text-[#0B5C9A]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Bác sĩ
            </button>
            <button
              onClick={() => setMode('patient')}
              className={`flex-1 py-3 rounded-lg transition-all font-medium ${
                mode === 'patient'
                  ? 'bg-white shadow-sm text-[#0B5C9A]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Bệnh nhân
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-2 text-foreground/80 font-medium">Địa chỉ Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  placeholder={mode === 'doctor' ? "bacsytuan@benhvien.com" : "nguyenvana@gmail.com"}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2 text-foreground/80 font-medium">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-border accent-[#0B5C9A]" />
                <span className="text-foreground/70">Ghi nhớ đăng nhập</span>
              </label>
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-[#0B5C9A] hover:underline font-medium"
              >
                Quên mật khẩu?
              </button>
            </div>

            <button
              onClick={handleLogin}
              className="w-full bg-[#0B5C9A] text-white py-3 rounded-xl hover:bg-[#094A7D] transition-colors shadow-lg shadow-[#0B5C9A]/20 font-semibold mt-2"
            >
              Đăng Nhập
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-background text-muted-foreground">Hoặc tiếp tục với</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="flex items-center justify-center gap-2 py-3 border border-border rounded-xl hover:bg-muted/50 transition-colors font-medium"
              >
                <User className="w-5 h-5" />
                <span>Google</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/phone-login')}
                className="flex items-center justify-center gap-2 py-3 border border-border rounded-xl hover:bg-muted/50 transition-colors font-medium"
              >
                <Phone className="w-5 h-5" />
                <span>Số ĐT</span>
              </button>
            </div>

            <div className="text-center text-sm text-foreground/70 mt-6">
              Chưa có tài khoản?{' '}
              <button
                type="button"
                onClick={() => navigate('/signup')}
                className="text-[#0B5C9A] hover:underline font-medium"
              >
                Đăng ký ngay
              </button>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground pt-6 border-t border-border mt-8">
          <p>Phần Mềm Y Tế v2.1.0</p>
          <p className="mt-1">Đạt Chuẩn HIPAA & Được FDA Cấp Phép</p>
        </div>
      </div>
    </div>
  );
}
