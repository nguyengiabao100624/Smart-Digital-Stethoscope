import { Activity, Brain } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useEffect } from 'react';

export default function SplashScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/login');
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="h-screen w-full bg-gradient-to-br from-[#0B5C9A] via-[#0E7AB8] to-[#00A896] flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white rounded-full blur-3xl"></div>
      </div>

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center"
      >
        <div className="relative mb-8">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 bg-white/20 rounded-full blur-xl"
            style={{ width: '140px', height: '140px', margin: '-10px' }}
          />
          <div className="relative bg-white/10 backdrop-blur-sm p-8 rounded-3xl border-2 border-white/30 shadow-2xl">
            <div className="flex items-center justify-center gap-2">
              <Activity className="w-12 h-12 text-white" strokeWidth={2.5} />
              <Brain className="w-10 h-10 text-white" strokeWidth={2.5} />
            </div>
          </div>
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-center"
        >
          <h1 className="text-4xl text-white mb-3 tracking-tight font-semibold">Ống Nghe</h1>
          <h2 className="text-3xl text-white mb-4 tracking-tight font-semibold">Thông Minh</h2>

          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/30 mb-8">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span className="text-white text-sm font-medium">Được hỗ trợ bởi Edge AI</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mt-8"
        >
          <div className="flex gap-2">
            <motion.div
              animate={{ scaleX: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
              className="w-2 h-2 bg-white rounded-full"
            />
            <motion.div
              animate={{ scaleX: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
              className="w-2 h-2 bg-white rounded-full"
            />
            <motion.div
              animate={{ scaleX: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
              className="w-2 h-2 bg-white rounded-full"
            />
          </div>
        </motion.div>
      </motion.div>

      <div className="absolute bottom-8 text-white/80 text-sm font-medium">
        Thiết bị chuẩn Y khoa
      </div>
    </div>
  );
}
