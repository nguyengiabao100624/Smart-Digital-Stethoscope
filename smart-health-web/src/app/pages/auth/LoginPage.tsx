import { useState } from "react";
import { ArrowLeft, ArrowRight, LogIn, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router";

import {
  AuthAlert,
  AuthField,
  AuthPageIntro,
  AuthPrimaryButton,
} from "../../components/auth/AuthPrimitives";
import { useAuth } from "../../context/AuthContext";
import {
  getSafeAuthErrorMessage,
  validateLogin,
  type AuthFieldErrors,
} from "../../auth/auth-form";
import { useSEO } from "@/lib/useSEO";

function getLoginErrorMessage(error?: string) {
  if (error === "wrong_surface_admin") {
    return "Tài khoản quản trị hệ thống dùng cổng shcare-admin.web.app.";
  }
  if (error === "wrong_surface_android") {
    return "Tài khoản này hiện chỉ có quyền dùng ứng dụng Android. Nếu bạn là bác sĩ hoặc cơ sở y tế, hãy gửi yêu cầu cấp quyền workspace.";
  }
  if (error === "portal_access_denied") {
    return "Tài khoản chưa có quyền truy cập Shcare Workspace Portal.";
  }
  return getSafeAuthErrorMessage(error);
}

function getTwoFactorErrorMessage(error?: string) {
  if (error === "TWO_FACTOR_CHALLENGE_EXPIRED" || error === "two_factor_expired") {
    return "Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.";
  }
  if (error === "TWO_FACTOR_CHALLENGE_LOCKED") {
    return "Đã vượt quá số lần thử. Vui lòng đăng nhập lại để tạo phiên xác thực mới.";
  }
  if (error === "TWO_FACTOR_CODE_REPLAYED") {
    return "Mã này đã được sử dụng. Hãy đợi mã mới trên ứng dụng xác thực.";
  }
  return "Mã xác thực chưa đúng hoặc đã hết hạn. Vui lòng kiểm tra và thử lại.";
}

export default function LoginPage() {
  useSEO({
    title: "Đăng nhập Workspace | Shcare",
    description: "Đăng nhập Shcare Workspace Portal cho bác sĩ và cơ sở y tế.",
    path: "/login",
  });

  const navigate = useNavigate();
  const {
    login,
    twoFactorChallenge,
    completeTwoFactorLogin,
    cancelTwoFactorLogin,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");

  const updateEmail = (value: string) => {
    setEmail(value);
    setFieldErrors((current) => ({ ...current, email: "" }));
    setError("");
  };

  const updatePassword = (value: string) => {
    setPassword(value);
    setFieldErrors((current) => ({ ...current, password: "" }));
    setError("");
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateLogin({ email, password });
    setFieldErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      if (result.success) {
        navigate("/portal");
      } else if (result.error === "two_factor_required") {
        setOtp("");
        setOtpError("");
      } else if (result.error === "role_request_pending") {
        navigate("/cho-duyet");
      } else if (result.error === "role_request_needs_info") {
        navigate("/can-bo-sung");
      } else if (result.error === "role_request_rejected") {
        navigate("/bi-tu-choi");
      } else {
        setError(getLoginErrorMessage(result.error));
      }
    } catch (cause) {
      setError(getSafeAuthErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    setOtpError("");
    if (!/^\d{6}$/.test(otp)) {
      setOtpError("Nhập đủ 6 chữ số trên ứng dụng xác thực.");
      return;
    }
    if (
      twoFactorChallenge &&
      Date.parse(twoFactorChallenge.expiresAt) <= Date.now()
    ) {
      setOtpError(getTwoFactorErrorMessage("two_factor_expired"));
      return;
    }

    setLoading(true);
    try {
      const result = await completeTwoFactorLogin(otp);
      if (result.success) {
        navigate("/portal");
      } else if (result.error === "role_request_pending") {
        navigate("/cho-duyet");
      } else if (result.error === "role_request_needs_info") {
        navigate("/can-bo-sung");
      } else if (result.error === "role_request_rejected") {
        navigate("/bi-tu-choi");
      } else {
        setOtpError(getTwoFactorErrorMessage(result.error));
      }
    } finally {
      setLoading(false);
    }
  };

  if (twoFactorChallenge) {
    return (
      <div className="shc-auth-page shc-auth-page-login">
        <AuthPageIntro
          icon={ShieldCheck}
          title="Xác minh bước thứ hai"
          description="Mở ứng dụng xác thực đã liên kết với Shcare và nhập mã gồm 6 chữ số."
        />

        <form method="post" noValidate onSubmit={handleTwoFactor} className="shc-auth-form">
          <AuthField
            id="login-otp"
            label="Mã xác thực"
            hint={`Phiên xác thực hết hạn lúc ${new Intl.DateTimeFormat("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(twoFactorChallenge.expiresAt))}.`}
            error={otpError}
            required
          >
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(event) => {
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                setOtpError("");
              }}
              className="shc-auth-otp-input"
              placeholder="000000"
              autoFocus
            />
          </AuthField>

          <AuthAlert tone="info">
            Shcare chỉ xác nhận đăng nhập sau khi backend kiểm tra mã này. Hệ thống không yêu cầu bạn gửi mã qua email hoặc tin nhắn.
          </AuthAlert>

          <AuthPrimaryButton
            type="submit"
            loading={loading}
            loadingLabel="Đang xác minh mã..."
          >
            Xác minh và tiếp tục
            <ArrowRight size={17} aria-hidden="true" />
          </AuthPrimaryButton>

          <button
            type="button"
            className="shc-auth-secondary-button"
            onClick={() => void cancelTwoFactorLogin()}
            disabled={loading}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Quay lại đăng nhập
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="shc-auth-page shc-auth-page-login">
      <AuthPageIntro
        icon={LogIn}
        title="Đăng nhập workspace"
        description="Dùng tài khoản đã được cấp quyền cho bác sĩ hoặc cơ sở y tế."
      />

      <form method="post" noValidate onSubmit={handleLogin} className="shc-auth-form">
        <AuthField
          id="login-email"
          label="Email đăng nhập"
          error={fieldErrors.email}
          required
        >
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => updateEmail(event.target.value)}
            placeholder="bacsi@phongkham.vn"
          />
        </AuthField>

        <AuthField
          id="login-password"
          label="Mật khẩu"
          error={fieldErrors.password}
          required
          action={
            <button
              type="button"
              className="shc-auth-inline-action"
              onClick={() => setShowPassword((current) => !current)}
              aria-controls="login-password"
              aria-pressed={showPassword}
            >
              {showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            </button>
          }
        >
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => updatePassword(event.target.value)}
            placeholder="Nhập mật khẩu"
          />
        </AuthField>

        <div className="shc-auth-form-meta">
          <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
        </div>

        {error ? (
          <AuthAlert tone="error" id="login-error">
            {error}
          </AuthAlert>
        ) : null}

        <AuthPrimaryButton
          type="submit"
          loading={loading}
          loadingLabel="Đang kiểm tra tài khoản..."
        >
          Đăng nhập
          <ArrowRight size={17} aria-hidden="true" />
        </AuthPrimaryButton>
      </form>

      <div className="shc-auth-account-switch">
        <span>Chưa có quyền workspace?</span>
        <Link to="/register">Đăng ký bác sĩ</Link>
        <span aria-hidden="true">·</span>
        <Link to="/register/phong-kham">Đăng ký cơ sở</Link>
      </div>
    </div>
  );
}
