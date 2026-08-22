import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Link2Off } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import {
  AuthAlert,
  AuthField,
  AuthPageIntro,
  AuthPrimaryButton,
  AuthSubmissionStatus,
  AuthUnsavedChangesGuard,
} from "../../components/auth/AuthPrimitives";
import {
  getSafeAuthErrorMessage,
  type AuthFieldErrors,
} from "../../auth/auth-form";
import {
  confirmFirebasePasswordReset,
  verifyFirebasePasswordResetCode,
} from "../../../lib/firebase-client";
import { useSEO } from "@/lib/useSEO";

type ResetState =
  | "verifying"
  | "ready"
  | "submitting"
  | "complete"
  | "invalid"
  | "expired";

function firebaseErrorCode(cause: unknown) {
  return cause && typeof cause === "object" && "code" in cause
    ? String((cause as { code?: unknown }).code || "")
    : "";
}

function resetFailureState(cause: unknown): "invalid" | "expired" {
  return firebaseErrorCode(cause) === "auth/expired-action-code"
    ? "expired"
    : "invalid";
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "tài khoản của bạn";
  return `${local.slice(0, 1)}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

export default function ResetPasswordPage() {
  useSEO({
    title: "Đặt lại mật khẩu | Shcare",
    description:
      "Xác minh liên kết một lần và đặt mật khẩu mới cho tài khoản Shcare.",
    path: "/dat-lai-mat-khau",
  });

  const [searchParams] = useSearchParams();
  const actionCode = searchParams.get("oobCode")?.trim() || "";
  const mode = searchParams.get("mode")?.trim() || "";
  const requestIsValid =
    Boolean(actionCode) && (!mode || mode === "resetPassword");
  const [state, setState] = useState<ResetState>(
    requestIsValid ? "verifying" : "invalid",
  );
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let active = true;
    setAccountEmail("");
    setSubmitError("");
    setFieldErrors({});
    setPassword("");
    setConfirmPassword("");

    if (!requestIsValid) {
      setState("invalid");
      return () => {
        active = false;
      };
    }

    setState("verifying");
    verifyFirebasePasswordResetCode(actionCode)
      .then((email) => {
        if (!active) return;
        setAccountEmail(email);
        setState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setState(resetFailureState(cause));
      });

    return () => {
      active = false;
    };
  }, [actionCode, requestIsValid]);

  const dirty = useMemo(
    () =>
      state === "ready" && (password.length > 0 || confirmPassword.length > 0),
    [confirmPassword.length, password.length, state],
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state !== "ready") return;

    const nextErrors: AuthFieldErrors = {};
    if (!password) {
      nextErrors.password = "Vui lòng nhập mật khẩu mới.";
    } else if (password.length < 8) {
      nextErrors.password = "Mật khẩu mới cần ít nhất 8 ký tự.";
    }
    if (!confirmPassword) {
      nextErrors.confirmPassword = "Vui lòng xác nhận mật khẩu mới.";
    } else if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Mật khẩu xác nhận chưa khớp.";
    }
    setFieldErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0) return;

    setState("submitting");
    try {
      await confirmFirebasePasswordReset(actionCode, password);
      setPassword("");
      setConfirmPassword("");
      setState("complete");
    } catch (cause) {
      const failureState = resetFailureState(cause);
      if (
        ["auth/expired-action-code", "auth/invalid-action-code"].includes(
          firebaseErrorCode(cause),
        )
      ) {
        setState(failureState);
        return;
      }
      setSubmitError(
        getSafeAuthErrorMessage(
          cause,
          "Không thể cập nhật mật khẩu. Vui lòng kiểm tra và thử lại.",
        ),
      );
      setState("ready");
    }
  };

  if (state === "verifying") {
    return (
      <section className="shc-auth-page shc-auth-result">
        <AuthPageIntro
          icon={KeyRound}
          title="Đang kiểm tra liên kết"
          description="Firebase đang xác minh mã một lần trước khi Shcare mở biểu mẫu."
        />
        <AuthSubmissionStatus label="Đang xác minh liên kết đặt lại mật khẩu..." />
      </section>
    );
  }

  if (state === "invalid" || state === "expired") {
    return (
      <section className="shc-auth-page shc-auth-result">
        <AuthPageIntro
          icon={Link2Off}
          title={
            state === "expired"
              ? "Liên kết đặt lại mật khẩu đã hết hạn"
              : "Liên kết đặt lại mật khẩu không hợp lệ"
          }
          description="Mã một lần có thể đã được sử dụng, hết hạn hoặc không thuộc luồng đặt lại mật khẩu."
        />
        <AuthAlert tone="warning">
          Hãy yêu cầu liên kết mới. Shcare không hiển thị hoặc ghi lại mã bảo
          mật trong giao diện.
        </AuthAlert>
        <div className="shc-auth-actions shc-auth-actions-stack">
          <Link to="/quen-mat-khau" className="shc-auth-primary-link">
            Yêu cầu liên kết mới
          </Link>
          <Link to="/login" className="shc-auth-text-link">
            Về đăng nhập
          </Link>
        </div>
      </section>
    );
  }

  if (state === "complete") {
    return (
      <section className="shc-auth-page shc-auth-result">
        <AuthPageIntro
          icon={CheckCircle2}
          title="Mật khẩu đã được cập nhật"
          description="Firebase đã xác nhận thay đổi bằng mã một lần hợp lệ."
        />
        <AuthAlert tone="success">
          Bạn có thể đăng nhập bằng mật khẩu mới. Shcare không tự đăng nhập thay
          bạn sau bước này.
        </AuthAlert>
        <Link to="/login" className="shc-auth-primary-link">
          Đăng nhập
        </Link>
      </section>
    );
  }

  return (
    <section className="shc-auth-page shc-auth-page-login">
      <AuthUnsavedChangesGuard when={dirty && state !== "submitting"} />
      <AuthPageIntro
        icon={KeyRound}
        title="Tạo mật khẩu mới"
        description={`Liên kết đã được xác minh cho ${maskEmail(accountEmail)}.`}
      />
      <AuthAlert tone="info">
        Mật khẩu cần ít nhất 8 ký tự. Không dùng lại mật khẩu của email hoặc
        dịch vụ khác.
      </AuthAlert>
      <form className="shc-auth-form" noValidate onSubmit={submit}>
        <AuthField
          id="reset-new-password"
          label="Mật khẩu mới"
          error={fieldErrors.password}
          required
          action={
            <button
              type="button"
              className="shc-auth-inline-action"
              onClick={() => setShowPassword((current) => !current)}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff size={16} aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
              {showPassword ? "Ẩn" : "Hiện"}
            </button>
          }
        >
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((current) => ({
                ...current,
                password: "",
              }));
              setSubmitError("");
            }}
          />
        </AuthField>
        <AuthField
          id="reset-confirm-password"
          label="Xác nhận mật khẩu mới"
          error={fieldErrors.confirmPassword}
          required
        >
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setFieldErrors((current) => ({
                ...current,
                confirmPassword: "",
              }));
              setSubmitError("");
            }}
          />
        </AuthField>
        {submitError ? <AuthAlert tone="error">{submitError}</AuthAlert> : null}
        <AuthPrimaryButton
          type="submit"
          loading={state === "submitting"}
          loadingLabel="Đang cập nhật mật khẩu..."
        >
          Đặt mật khẩu mới
        </AuthPrimaryButton>
      </form>
      <Link to="/login" className="shc-auth-back-link">
        Về đăng nhập
      </Link>
    </section>
  );
}
