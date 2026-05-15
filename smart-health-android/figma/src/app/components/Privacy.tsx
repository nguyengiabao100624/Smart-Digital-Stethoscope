import {
  ArrowLeft,
  Lock,
  Shield,
  Eye,
  EyeOff,
  Fingerprint,
  Smartphone,
  Key,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export default function Privacy() {
  const navigate = useNavigate();
  const [biometric, setBiometric] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="bg-gradient-to-br from-[#0B5C9A] to-[#00A896] px-6 py-6 shadow-md">
        <div className="flex items-center gap-4 text-white">
          <button
            onClick={() => navigate(-1)}
            className="hover:bg-white/10 p-2 rounded-full transition-colors -ml-2"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Bảo mật & Quyền riêng tư</h1>
            <p className="text-white/80 text-sm">Quản lý bảo mật tài khoản</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 overflow-y-auto space-y-6">
        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Xác Thực
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-emerald-500/10 rounded-xl">
                  <Fingerprint className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground/90">Xác thực sinh trắc học</p>
                  <p className="text-sm text-muted-foreground">
                    Vân tay hoặc Face ID
                  </p>
                </div>
                <button
                  onClick={() => setBiometric(!biometric)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    biometric ? 'bg-[#10B981]' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      biometric ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-[#0B5C9A]/10 rounded-xl">
                  <Smartphone className="w-5 h-5 text-[#0B5C9A]" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground/90">Xác thực 2 yếu tố (2FA)</p>
                  <p className="text-sm text-muted-foreground">
                    Mã OTP qua SMS
                  </p>
                </div>
                <button
                  onClick={() => setTwoFactor(!twoFactor)}
                  className={`w-12 h-7 rounded-full transition-colors relative ${
                    twoFactor ? 'bg-[#10B981]' : 'bg-muted'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform absolute top-1 ${
                      twoFactor ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Mật Khẩu
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <button onClick={() => navigate('/change-password')} className="w-full p-4 border-b border-border flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-purple-500/10 rounded-xl">
                <Lock className="w-5 h-5 text-purple-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">Đổi mật khẩu</p>
                <p className="text-sm text-muted-foreground">
                  Cập nhật lần cuối: 2 tháng trước
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground opacity-50" />
            </button>

            <div className="p-4">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-orange-500/10 rounded-xl mt-1">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-foreground/90 mb-2">
                    Độ mạnh mật khẩu
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full w-[75%] bg-gradient-to-r from-[#10B981] to-[#00A896]"></div>
                    </div>
                    <span className="text-xs font-medium text-[#10B981]">Mạnh</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Khuyến nghị đổi mật khẩu mỗi 3 tháng
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 px-2">
            Quyền Riêng Tư
          </h3>
          <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
            <button onClick={() => navigate('/data-access')} className="w-full p-4 border-b border-border flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-blue-500/10 rounded-xl">
                <Shield className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">
                  Quyền truy cập dữ liệu
                </p>
                <p className="text-sm text-muted-foreground">
                  Quản lý ai có thể truy cập hồ sơ
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground opacity-50" />
            </button>

            <button className="w-full p-4 border-b border-border flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-[#00A896]/10 rounded-xl">
                <Key className="w-5 h-5 text-[#00A896]" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">Mã hóa dữ liệu</p>
                <p className="text-sm text-muted-foreground">
                  AES-256 end-to-end encryption
                </p>
              </div>
              <div className="px-3 py-1 bg-[#10B981]/10 rounded-full">
                <p className="text-xs font-medium text-[#10B981]">Đang bật</p>
              </div>
            </button>

            <button onClick={() => navigate('/access-log')} className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="p-2 bg-pink-500/10 rounded-xl">
                <Eye className="w-5 h-5 text-pink-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-foreground/90">Nhật ký truy cập</p>
                <p className="text-sm text-muted-foreground">
                  Xem lịch sử đăng nhập
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground opacity-50" />
            </button>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 mb-1">
                Tuân Thủ HIPAA & FDA
              </p>
              <p className="text-sm text-amber-800 leading-relaxed">
                Mọi dữ liệu y tế được mã hóa và lưu trữ tuân thủ chuẩn HIPAA.
                Hệ thống được FDA cấp phép Class IIa.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
