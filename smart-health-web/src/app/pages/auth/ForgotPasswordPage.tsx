import { useState } from "react";
import { ArrowLeft, MailCheck, RotateCcw } from "lucide-react";
import { Link } from "react-router";

import {
  AuthAlert,
  AuthField,
  AuthPageIntro,
  AuthPrimaryButton,
  AuthSecondaryButton,
} from "../../components/auth/AuthPrimitives";
import {
  getSafeAuthErrorMessage,
  validateEmailOnly,
  type AuthFieldErrors,
} from "../../auth/auth-form";
import { sendFirebasePasswordReset } from "../../../lib/firebase-client";
import { useSEO } from "@/lib/useSEO";

export default function ForgotPasswordPage() {
  useSEO({
    title: "Khôi phục mật khẩu | Shcare",
    description: "Nhận liên kết đặt lại mật khẩu cho tài khoản Shcare Workspace.",
    path: "/quen-mat-khau",
  });

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateEmailOnly(email);
    setFieldErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      await sendFirebasePasswordReset(email.trim());
      setSent(true);
    } catch (cause) {
      setError(
        getSafeAuthErrorMessage(
          cause,
          "Không thể gửi liên kết khôi phục. Vui lòng thử lại.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="shc-auth-page shc-auth-result">
        <AuthPageIntro
          icon={MailCheck}
          title="Kiểm tra hộp thư"
          description={`Nếu email ${email.trim()} thuộc một tài khoản Shcare, bạn sẽ nhận được liên kết đặt lại mật khẩu.`}
        />
        <AuthAlert tone="info">
          Liên kết có thể mất vài phút để đến. Hãy kiểm tra cả thư rác và chỉ mở email có
          nguồn gửi Shcare mà bạn tin cậy.
        </AuthAlert>
        <div className="shc-auth-result-actions">
          <Link to="/login" className="shc-auth-link-button">
            <ArrowLeft size={17} aria-hidden="true" />
            Về đăng nhập
          </Link>
          <AuthSecondaryButton type="button" onClick={() => setSent(false)}>
            <RotateCcw size={16} aria-hidden="true" />
            Dùng email khác
          </AuthSecondaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="shc-auth-page">
      <AuthPageIntro
        icon={MailCheck}
        title="Khôi phục mật khẩu"
        description="Nhập email tài khoản. Firebase sẽ gửi liên kết đặt lại mật khẩu nếu yêu cầu hợp lệ."
      />

      <form method="post" noValidate onSubmit={submit} className="shc-auth-form">
        <AuthField
          id="reset-email"
          label="Email nhận liên kết"
          error={fieldErrors.email}
          hint="Dùng đúng email đã đăng ký với Shcare."
          required
        >
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors({});
              setError("");
            }}
            placeholder="bacsi@phongkham.vn"
          />
        </AuthField>

        {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}

        <AuthPrimaryButton
          type="submit"
          loading={loading}
          loadingLabel="Đang gửi liên kết..."
        >
          Gửi liên kết khôi phục
        </AuthPrimaryButton>
      </form>

      <Link to="/login" className="shc-auth-back-link">
        <ArrowLeft size={16} aria-hidden="true" />
        Về đăng nhập
      </Link>
    </div>
  );
}
