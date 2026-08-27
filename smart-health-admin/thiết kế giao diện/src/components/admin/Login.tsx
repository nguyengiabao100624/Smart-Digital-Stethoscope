import React, { useState } from "react";
import { motion } from "framer-motion";
import { useRef } from "react";
import { useNavigate, Link } from "@/components/admin/router-shim";
import { ShieldCheck, Mail, Lock } from "lucide-react";
import { smartHealthApi, type SmartHealthAuthUser } from "@/lib/smart-health-api";
import {
  hasFirebaseWebConfig,
  isProductionAuthMode,
  signInWithFirebaseEmail,
} from "@/lib/firebase-client";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { ThemeToggle } from "./ThemeToggle";
import { ShcareBrand } from "./ShcareBrand";
import {
  getSurfaceAccessTargetUrl,
  getWrongSurfaceMessage,
  hasCurrentWebSurfaceAccess,
  IS_PORTAL_SURFACE,
} from "@/lib/surface";

function assertSurfaceAccess(user?: SmartHealthAuthUser) {
  if (!isProductionAuthMode()) {
    return;
  }

  if (!hasCurrentWebSurfaceAccess(user)) {
    throw new Error(getWrongSurfaceMessage());
  }
}

export function Login() {
  const navigate = useNavigate();
  const productionAuthMode = isProductionAuthMode();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      if (hasFirebaseWebConfig()) {
        const idToken = await signInWithFirebaseEmail(email, password);
        const result = await smartHealthApi.authenticateFirebase(idToken);
        assertSurfaceAccess(result.user);
      } else if (!productionAuthMode) {
        const result = await smartHealthApi.login(email, password);
        assertSurfaceAccess(result.user);
      } else {
        throw new Error("Chưa cấu hình Firebase Web Auth cho môi trường production.");
      }
      navigate("/");
    } catch (err) {
      setError(toVietnameseErrorMessage(err, "Tài khoản hoặc mật khẩu không đúng."));
      setIsLoading(false);
      window.requestAnimationFrame(() => passwordInputRef.current?.focus());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-sm p-8"
      >
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="flex flex-col items-center mb-8 text-center">
          <ShcareBrand compact centered className="mb-4" />
          <h1 className="text-2xl font-bold text-foreground">
            {IS_PORTAL_SURFACE ? "Shcare Web Portal" : "Smart Health Admin"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {IS_PORTAL_SURFACE
              ? "Đăng nhập để vận hành bệnh nhân, thiết bị và lượt đo"
              : "Đăng nhập để quản trị nền tảng Smart Health"}
          </p>
        </div>

        {error && (
          <div
            id="admin-login-error"
            role="alert"
            aria-live="assertive"
            className="mb-6 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <form method="post" onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="admin-email" className="text-sm font-medium text-foreground">
              {productionAuthMode
                ? IS_PORTAL_SURFACE
                  ? "Email tài khoản"
                  : "Email quản trị"
                : "Email hoặc tên tài khoản demo"}
            </label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                id="admin-email"
                name="email"
                type={productionAuthMode ? "email" : "text"}
                autoComplete={productionAuthMode ? "email" : "username"}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "admin-login-error" : undefined}
                placeholder={productionAuthMode ? "admin@smarthealth.vn" : "admin"}
                className="min-h-11 w-full rounded-md border border-border py-2 pl-10 pr-4 outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-password" className="text-sm font-medium text-foreground">
              Mật khẩu
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={passwordInputRef}
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "admin-login-error" : undefined}
                placeholder="••••••••"
                className="min-h-11 w-full rounded-md border border-border py-2 pl-10 pr-4 outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                required
              />
            </div>
          </div>

          <motion.button
            type="submit"
            disabled={isLoading}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className="flex min-h-11 w-full items-center justify-center rounded-md bg-primary py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
          >
            {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
          </motion.button>
        </form>

        <div className="mt-4 text-center">
          <Link to="/forgot-password" className="text-sm text-primary hover:underline">
            Quên mật khẩu?
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-success" />
          <span>
            {IS_PORTAL_SURFACE
              ? "Xác thực tài khoản bằng Firebase"
              : "Xác thực quản trị bằng Firebase"}
          </span>
        </div>
        <div className="mt-4 text-center text-xs text-muted-foreground">
          {IS_PORTAL_SURFACE ? "Platform Admin dùng " : "Bác sĩ/phòng khám dùng "}
          <a
            href={getSurfaceAccessTargetUrl()}
            className="font-medium text-primary hover:underline"
          >
            {IS_PORTAL_SURFACE ? "Smart Health Admin" : "Shcare Web Portal"}
          </a>
        </div>
      </motion.div>
    </div>
  );
}
