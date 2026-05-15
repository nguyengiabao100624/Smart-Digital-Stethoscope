import { ArrowLeft, Mail, Send, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
    setTimeout(() => {
      navigate('/login');
    }, 3000);
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
          <AnimatePresence mode="wait">
            {!sent ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-[#0B5C9A]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-8 h-8 text-[#0B5C9A]" />
                  </div>
                  <h1 className="text-2xl text-[#0B5C9A] mb-2 font-semibold">Quên mật khẩu?</h1>
                  <p className="text-muted-foreground">
                    Nhập địa chỉ email của bạn và chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm mb-2 text-foreground/80 font-medium">
                      Địa chỉ Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="bacsituan@benhvien.com"
                        required
                        className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#0B5C9A] text-white py-3 rounded-xl hover:bg-[#094A7D] transition-colors shadow-lg shadow-[#0B5C9A]/20 font-semibold flex items-center justify-center gap-2"
                  >
                    <Send className="w-5 h-5" />
                    Gửi hướng dẫn
                  </button>
                </form>

                <div className="mt-6 text-center text-sm text-foreground/70">
                  Nhớ mật khẩu?{' '}
                  <button
                    onClick={() => navigate('/login')}
                    className="text-[#0B5C9A] hover:underline font-medium"
                  >
                    Đăng nhập ngay
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="w-20 h-20 bg-[#10B981]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-10 h-10 text-[#10B981]" />
                </div>
                <h2 className="text-2xl font-semibold text-foreground mb-3">Đã gửi email!</h2>
                <p className="text-muted-foreground mb-6">
                  Vui lòng kiểm tra hộp thư của bạn tại <br />
                  <span className="text-[#0B5C9A] font-medium">{email}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Đang chuyển hướng về trang đăng nhập...
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center text-xs text-muted-foreground pt-6 border-t border-border">
          <p>Phần Mềm Y Tế v2.1.0</p>
          <p className="mt-1">Đạt Chuẩn HIPAA & Được FDA Cấp Phép</p>
        </div>
      </div>
    </div>
  );
}
