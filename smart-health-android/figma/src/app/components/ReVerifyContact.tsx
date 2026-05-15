import { ArrowLeft, Mail, Phone, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router';

export default function ReVerifyContact() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') as 'email' | 'phone' || 'email';
  const contact = searchParams.get('contact') || '';

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleInputChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every((digit) => digit !== '')) {
      handleVerify(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (!/^\d+$/.test(pastedData)) return;

    const newCode = [...code];
    pastedData.split('').forEach((char, i) => {
      if (i < 6) newCode[i] = char;
    });
    setCode(newCode);

    const nextEmptyIndex = newCode.findIndex((val) => !val);
    const focusIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    inputRefs.current[focusIndex]?.focus();

    if (newCode.every((digit) => digit !== '')) {
      handleVerify(newCode.join(''));
    }
  };

  const handleVerify = async (verificationCode: string) => {
    setIsVerifying(true);
    setError('');

    // Giả lập xác thực (trong thực tế sẽ gọi API backend)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Giả sử mã đúng là "123456"
    if (verificationCode === '123456') {
      setIsVerified(true);
      setTimeout(() => {
        navigate('/profile');
      }, 1500);
    } else {
      setError('Mã xác thực không chính xác. Vui lòng thử lại.');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }

    setIsVerifying(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setResendCooldown(60);
    // Giả lập gửi lại mã (trong thực tế sẽ gọi API backend)
    await new Promise((resolve) => setTimeout(resolve, 500));
  };

  const isEmail = type === 'email';
  const Icon = isEmail ? Mail : Phone;
  const title = isEmail ? 'Xác thực Email mới' : 'Xác thực Số điện thoại mới';
  const description = isEmail
    ? 'Chúng tôi đã gửi mã xác thực 6 chữ số đến địa chỉ email mới'
    : 'Chúng tôi đã gửi mã xác thực 6 chữ số đến số điện thoại mới';

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="flex-1 flex flex-col p-6 max-w-md mx-auto w-full">
        <div className="py-4">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 text-[#0B5C9A] hover:bg-[#0B5C9A]/5 p-2 rounded-xl transition-colors -ml-2"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Quay lại hồ sơ</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex justify-center mb-6"
          >
            <div className="w-20 h-20 bg-gradient-to-br from-[#0B5C9A] to-[#00A896] rounded-full flex items-center justify-center">
              <Icon className="w-10 h-10 text-white" />
            </div>
          </motion.div>

          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center mb-6"
          >
            <h1 className="text-3xl text-[#0B5C9A] mb-2 font-semibold">{title}</h1>
            <p className="text-muted-foreground px-4">{description}</p>
            <p className="text-foreground font-semibold mt-2">{contact}</p>
          </motion.div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Lưu ý bảo mật</p>
              <p>
                Để bảo vệ tài khoản của bạn, vui lòng xác thực {isEmail ? 'email' : 'số điện thoại'} mới
                trước khi thay đổi được lưu vào hệ thống.
              </p>
            </div>
          </div>

          {isVerified ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl text-green-600 font-semibold mb-1">
                  Xác thực thành công!
                </h2>
                <p className="text-muted-foreground">
                  {isEmail ? 'Email' : 'Số điện thoại'} đã được cập nhật
                </p>
              </div>
            </motion.div>
          ) : (
            <>
              <div className="flex gap-3 justify-center mb-6" onPaste={handlePaste}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleInputChange(index, e.target.value)}
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
                  className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-center text-sm"
                >
                  {error}
                </motion.div>
              )}

              {isVerifying && (
                <div className="flex items-center justify-center gap-2 text-[#0B5C9A] mb-4">
                  <div className="w-5 h-5 border-2 border-[#0B5C9A] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm font-medium">Đang xác thực...</span>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p className="text-sm text-blue-800 text-center">
                  💡 <strong>Mẹo:</strong> Mã xác thực demo là <code className="bg-blue-100 px-2 py-0.5 rounded font-mono">123456</code>
                </p>
              </div>

              <div className="text-center space-y-3">
                <p className="text-sm text-foreground/70">Không nhận được mã?</p>
                <button
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-medium transition-colors ${
                    resendCooldown > 0
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-[#0B5C9A]/10 text-[#0B5C9A] hover:bg-[#0B5C9A]/20'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 ${resendCooldown > 0 ? '' : 'animate-spin'}`} />
                  {resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : 'Gửi lại mã'}
                </button>

                <button
                  onClick={() => navigate('/profile')}
                  className="text-sm text-[#0B5C9A] hover:underline font-medium"
                >
                  Hủy và quay lại
                </button>
              </div>
            </>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground pt-6 border-t border-border mt-6">
          <p>Phần Mềm Y Tế v2.1.0</p>
          <p className="mt-1">Đạt Chuẩn HIPAA & Được FDA Cấp Phép</p>
        </div>
      </div>
    </div>
  );
}
