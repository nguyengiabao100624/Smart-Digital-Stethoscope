import { ArrowLeft, Mail, Lock, User, Phone, Building, IdCard } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';

export default function SignUp() {
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<'doctor' | 'patient'>('doctor');

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    // Sau khi đăng ký thành công, chuyển đến trang xác thực email
    navigate('/verify-email');
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="flex-1 flex flex-col p-6 max-w-md mx-auto w-full">
        <div className="py-4">
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-[#0B5C9A] hover:bg-[#0B5C9A]/5 p-2 rounded-xl transition-colors -ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Quay lại</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center mb-6"
          >
            <h1 className="text-3xl text-[#0B5C9A] mb-2 font-semibold">Tạo tài khoản mới</h1>
            <p className="text-muted-foreground">Điền thông tin để bắt đầu</p>
          </motion.div>

          <div className="bg-muted/50 rounded-xl p-1 mb-6 flex gap-1">
            <button
              onClick={() => setAccountType('doctor')}
              className={`flex-1 py-2.5 rounded-lg transition-all font-medium ${
                accountType === 'doctor'
                  ? 'bg-white shadow-sm text-[#0B5C9A]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Bác sĩ
            </button>
            <button
              onClick={() => setAccountType('patient')}
              className={`flex-1 py-2.5 rounded-lg transition-all font-medium ${
                accountType === 'patient'
                  ? 'bg-white shadow-sm text-[#0B5C9A]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Bệnh nhân
            </button>
          </div>

          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-sm mb-2 text-foreground/80 font-medium">Họ và tên</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={accountType === 'doctor' ? 'Bs. Nguyễn Văn Tuấn' : 'Nguyễn Văn An'}
                  required
                  className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            {accountType === 'doctor' && (
              <>
                <div>
                  <label className="block text-sm mb-2 text-foreground/80 font-medium">
                    Số chứng chỉ hành nghề
                  </label>
                  <div className="relative">
                    <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="VD: 123456/BYT-CCHN"
                      required
                      className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-2 text-foreground/80 font-medium">
                    Cơ sở y tế
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Bệnh viện Đa khoa Trung ương"
                      required
                      className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm mb-2 text-foreground/80 font-medium">Số điện thoại</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="tel"
                  placeholder="0912 345 678"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2 text-foreground/80 font-medium">Địa chỉ Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="email"
                  placeholder={
                    accountType === 'doctor' ? 'bacsituan@benhvien.com' : 'nguyenvana@gmail.com'
                  }
                  required
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
                  placeholder="Tối thiểu 8 ký tự"
                  required
                  minLength={8}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm mb-2 text-foreground/80 font-medium">
                Xác nhận mật khẩu
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="Nhập lại mật khẩu"
                  required
                  minLength={8}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                />
              </div>
            </div>

            <div className="flex items-start gap-3 pt-2">
              <input
                type="checkbox"
                id="terms"
                required
                className="w-4 h-4 rounded border-border accent-[#0B5C9A] mt-1"
              />
              <label htmlFor="terms" className="text-sm text-foreground/70 leading-relaxed">
                Tôi đồng ý với{' '}
                <a href="#" className="text-[#0B5C9A] hover:underline font-medium">
                  Điều khoản sử dụng
                </a>{' '}
                và{' '}
                <a href="#" className="text-[#0B5C9A] hover:underline font-medium">
                  Chính sách bảo mật
                </a>
              </label>
            </div>

            <button
              type="submit"
              className="w-full bg-[#0B5C9A] text-white py-3 rounded-xl hover:bg-[#094A7D] transition-colors shadow-lg shadow-[#0B5C9A]/20 font-semibold mt-2"
            >
              Đăng Ký
            </button>

            <div className="text-center text-sm text-foreground/70 mt-4">
              Đã có tài khoản?{' '}
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-[#0B5C9A] hover:underline font-medium"
              >
                Đăng nhập ngay
              </button>
            </div>
          </form>
        </div>

        <div className="text-center text-xs text-muted-foreground pt-6 border-t border-border mt-6">
          <p>Phần Mềm Y Tế v2.1.0</p>
          <p className="mt-1">Đạt Chuẩn HIPAA & Được FDA Cấp Phép</p>
        </div>
      </div>
    </div>
  );
}
