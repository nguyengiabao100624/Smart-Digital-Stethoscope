import { ArrowLeft, Phone, Send, CheckCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';

export default function PhoneLogin() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'phone' | 'otp' | 'success'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('otp');
    setResendCooldown(60);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit khi nhập đủ 6 số
    if (newOtp.every((digit) => digit !== '')) {
      handleVerifyOtp(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (!/^\d+$/.test(pastedData)) return;

    const newOtp = [...otp];
    pastedData.split('').forEach((char, i) => {
      if (i < 6) newOtp[i] = char;
    });
    setOtp(newOtp);

    const nextEmptyIndex = newOtp.findIndex((val) => !val);
    const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    inputRefs.current[focusIndex]?.focus();

    // Auto-submit nếu paste đủ 6 số
    if (newOtp.every((digit) => digit !== '')) {
      handleVerifyOtp(newOtp.join(''));
    }
  };

  const handleVerifyOtp = async (otpCode: string) => {
    setIsVerifying(true);
    setError('');

    // Giả lập xác thực (trong thực tế sẽ gọi API backend)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Giả sử mã đúng là "123456"
    if (otpCode === '123456') {
      setStep('success');
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } else {
      setError('Mã OTP không chính xác. Vui lòng thử lại.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }

    setIsVerifying(false);
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length === 6) {
      handleVerifyOtp(otpCode);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setResendCooldown(60);
    setOtp(['', '', '', '', '', '']);
    setError('');
    // Giả lập gửi lại OTP (trong thực tế sẽ gọi API backend)
    await new Promise((resolve) => setTimeout(resolve, 500));
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="flex-1 flex flex-col p-6 max-w-md mx-auto w-full">
        <div className="py-4">
          <button
            onClick={() => (step === 'otp' ? setStep('phone') : navigate('/login'))}
            className="flex items-center gap-2 text-[#0B5C9A] hover:bg-[#0B5C9A]/5 p-2 rounded-xl transition-colors -ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Quay lại</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {step === 'phone' ? (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-[#0B5C9A]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Phone className="w-8 h-8 text-[#0B5C9A]" />
                  </div>
                  <h1 className="text-2xl text-[#0B5C9A] mb-2 font-semibold">Đăng nhập bằng SĐT</h1>
                  <p className="text-muted-foreground">
                    Nhập số điện thoại để nhận mã xác thực OTP
                  </p>
                </div>

                <form onSubmit={handlePhoneSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm mb-2 text-foreground/80 font-medium">
                      Số điện thoại
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="0912 345 678"
                        required
                        pattern="[0-9]{10}"
                        className="w-full pl-11 pr-4 py-3 bg-white border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent transition-shadow"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Vui lòng nhập số điện thoại 10 chữ số
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#0B5C9A] text-white py-3 rounded-xl hover:bg-[#094A7D] transition-colors shadow-lg shadow-[#0B5C9A]/20 font-semibold flex items-center justify-center gap-2"
                  >
                    <Send className="w-5 h-5" />
                    Gửi mã OTP
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {step === 'success' ? (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-12 h-12 text-white" />
                    </div>
                    <div className="text-center">
                      <h2 className="text-2xl text-green-600 font-semibold mb-1">
                        Đăng nhập thành công!
                      </h2>
                      <p className="text-muted-foreground">Đang chuyển đến trang chính...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-6">
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="w-20 h-20 bg-gradient-to-br from-[#0B5C9A] to-[#00A896] rounded-full flex items-center justify-center mx-auto mb-4"
                      >
                        <Phone className="w-10 h-10 text-white" />
                      </motion.div>
                      <h1 className="text-3xl text-[#0B5C9A] mb-2 font-semibold">Xác thực OTP</h1>
                      <p className="text-muted-foreground">
                        Mã OTP đã được gửi đến số
                      </p>
                      <p className="text-foreground font-semibold mt-1">{phone}</p>
                    </div>

                    <form onSubmit={handleOtpSubmit} className="space-y-6">
                      <div className="flex gap-3 justify-center" onPaste={handlePaste}>
                        {otp.map((digit, index) => (
                          <input
                            key={index}
                            ref={(el) => (inputRefs.current[index] = el)}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleOtpChange(index, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(index, e)}
                            disabled={isVerifying}
                            className={`w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none transition-all ${
                              error
                                ? 'border-red-500 bg-red-50'
                                : digit
                                ? 'border-[#0B5C9A] bg-[#0B5C9A]/5'
                                : 'border-border bg-white'
                            } ${
                              isVerifying ? 'opacity-50 cursor-not-allowed' : ''
                            } focus:ring-2 focus:ring-[#0B5C9A] focus:border-transparent`}
                          />
                        ))}
                      </div>

                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-center text-sm"
                        >
                          {error}
                        </motion.div>
                      )}

                      {isVerifying && (
                        <div className="flex items-center justify-center gap-2 text-[#0B5C9A]">
                          <div className="w-5 h-5 border-2 border-[#0B5C9A] border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm font-medium">Đang xác thực...</span>
                        </div>
                      )}

                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <p className="text-sm text-blue-800 text-center">
                          💡 <strong>Mẹo:</strong> Mã OTP demo là{' '}
                          <code className="bg-blue-100 px-2 py-0.5 rounded font-mono">123456</code>
                        </p>
                      </div>

                      <div className="text-center space-y-3">
                        <p className="text-sm text-foreground/70">Không nhận được mã?</p>
                        <button
                          type="button"
                          onClick={handleResend}
                          disabled={resendCooldown > 0}
                          className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-medium transition-colors ${
                            resendCooldown > 0
                              ? 'bg-muted text-muted-foreground cursor-not-allowed'
                              : 'bg-[#0B5C9A]/10 text-[#0B5C9A] hover:bg-[#0B5C9A]/20'
                          }`}
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${resendCooldown > 0 ? '' : 'animate-spin'}`}
                          />
                          {resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : 'Gửi lại'}
                        </button>

                        <button
                          type="button"
                          onClick={() => setStep('phone')}
                          className="text-sm text-[#0B5C9A] hover:underline font-medium"
                        >
                          Thay đổi số điện thoại
                        </button>
                      </div>
                    </form>
                  </>
                )}
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
