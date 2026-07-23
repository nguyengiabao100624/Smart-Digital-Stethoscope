import { useRef, useState } from "react";
import {
  ArrowRight,
  KeyRound,
  LogOut,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";

import {
  AuthAlert,
  AuthField,
  AuthPageIntro,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthSubmissionStatus,
} from "../../components/auth/AuthPrimitives";
import {
  getSafeAuthErrorMessage,
  validateLogin,
  type AuthFieldErrors,
} from "../../auth/auth-form";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi, type ApiError } from "../../../lib/smart-health-api";
import {
  createFirebaseAccount,
  hasFirebaseWebConfig,
  isProductionAuthMode,
  refreshFirebaseVerification,
} from "../../../lib/firebase-client";
import {
  clearStaffInvitationAcceptanceIdempotencyKey,
  createPortalStaffIdempotencyKey,
  getStaffInvitationAcceptanceIdempotencyKey,
  parseStaffInvitationAcceptanceOutcome,
  validateStaffInvitationToken,
} from "../../../lib/staff-invitation-operations";
import { useSEO } from "@/lib/useSEO";

function invitationErrorMessage(cause: unknown) {
  const code =
    cause && typeof cause === "object"
      ? String((cause as ApiError).code || "")
      : "";
  if (code === "STAFF_INVITATION_EXPIRED") {
    return "Lời mời đã hết hạn. Hãy liên hệ quản trị viên workspace để nhận lời mời mới.";
  }
  if (
    ["STAFF_INVITATION_NOT_FOUND", "STAFF_INVITATION_TOKEN_INVALID"].includes(
      code,
    )
  ) {
    return "Liên kết mời không hợp lệ hoặc không còn tồn tại.";
  }
  if (
    [
      "STAFF_INVITATION_EMAIL_MISMATCH",
      "STAFF_INVITATION_IDENTITY_MISMATCH",
    ].includes(code)
  ) {
    return "Email của tài khoản đang đăng nhập không trùng với email nhận lời mời.";
  }
  if (code === "STAFF_MEMBERSHIP_EXISTS") {
    return "Tài khoản này đã là thành viên của workspace. Bạn có thể đăng nhập Portal để tiếp tục.";
  }
  if (code === "STAFF_INVITATION_NOT_PENDING") {
    return "Lời mời đã được xử lý hoặc bị thu hồi. Hãy yêu cầu quản trị viên kiểm tra trạng thái.";
  }
  return getSafeAuthErrorMessage(
    cause,
    "Không thể chấp nhận lời mời lúc này. Vui lòng thử lại.",
  );
}

export default function StaffInvitationAcceptancePage() {
  useSEO({
    title: "Chấp nhận lời mời nhân sự | Shcare",
    description:
      "Xác thực danh tính và tham gia workspace Shcare theo lời mời.",
    path: "/staff-invitations/accept",
  });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    identityUser,
    isLoading,
    twoFactorChallenge,
    loginForStaffInvitation,
    completeStaffInvitationTwoFactorLogin,
    cancelTwoFactorLogin,
    logout,
    refreshUser,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const acceptingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const signupAvailable = isProductionAuthMode() && hasFirebaseWebConfig();
  const requiresEmailVerification = signupAvailable;

  let invitationToken = "";
  let tokenError = "";
  try {
    invitationToken = validateStaffInvitationToken(searchParams.get("token"));
  } catch (cause) {
    tokenError =
      cause instanceof Error ? cause.message : "Liên kết mời không hợp lệ.";
  }

  const submitIdentity = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateLogin({ email, password });
    setFieldErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;

    setIsSigningIn(true);
    try {
      const result = await loginForStaffInvitation(email.trim(), password);
      if (!result.success && result.error !== "two_factor_required") {
        setError(getSafeAuthErrorMessage(result.error));
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const submitSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateLogin({ email, password });
    if (password.length < 8) {
      nextErrors.password = "Mật khẩu cần có ít nhất 8 ký tự.";
    }
    if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Mật khẩu xác nhận chưa khớp.";
    }
    setFieldErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;
    if (!isProductionAuthMode() || !hasFirebaseWebConfig()) {
      setError(
        "Tạo tài khoản nhận lời mời hiện chưa khả dụng trong môi trường này. Hãy nhờ quản trị viên gửi lại lời mời sau khi Firebase Auth được cấu hình.",
      );
      return;
    }

    setIsSigningIn(true);
    try {
      const account = await createFirebaseAccount(email.trim(), password);
      await smartHealthApi.authenticateFirebase(account.idToken);
      await smartHealthApi.sendEmailVerification();
      setVerificationPending(true);
    } catch (cause) {
      setError(
        getSafeAuthErrorMessage(
          cause,
          "Không thể tạo tài khoản nhận lời mời. Vui lòng thử lại.",
        ),
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const checkEmailVerification = async () => {
    setIsSigningIn(true);
    setError("");
    try {
      const firebaseState = await refreshFirebaseVerification();
      if (!firebaseState.verified) {
        setError(
          "Email chưa được xác minh. Hãy mở liên kết trong hộp thư rồi kiểm tra lại.",
        );
        return;
      }
      await smartHealthApi.authenticateFirebase(firebaseState.idToken);
      await refreshUser();
      setVerificationPending(false);
    } catch (cause) {
      setError(
        getSafeAuthErrorMessage(
          cause,
          "Không thể kiểm tra trạng thái xác minh email. Vui lòng thử lại.",
        ),
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const submitTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(otp)) {
      setError("Nhập đủ 6 chữ số trên ứng dụng xác thực.");
      return;
    }
    setIsSigningIn(true);
    try {
      const result = await completeStaffInvitationTwoFactorLogin(otp);
      if (!result.success) {
        setError("Mã xác thực chưa đúng hoặc đã hết hạn. Vui lòng thử lại.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const acceptInvitation = async () => {
    if (!identityUser || !invitationToken || acceptingRef.current) return;
    acceptingRef.current = true;
    setIsAccepting(true);
    setError("");
    try {
      idempotencyKeyRef.current ||=
        await getStaffInvitationAcceptanceIdempotencyKey(
          invitationToken,
          identityUser.id,
        ).catch(() =>
          createPortalStaffIdempotencyKey("invite-accept", identityUser.id),
        );
      const outcome = parseStaffInvitationAcceptanceOutcome(
        await smartHealthApi.acceptStaffInvitation(
          invitationToken,
          idempotencyKeyRef.current,
        ),
        { userId: identityUser.id, email: identityUser.email },
      );
      const refreshed = await refreshUser();
      const matchingMembership = refreshed?.raw.memberships?.find(
        (membership) =>
          (membership.organizationId || membership.workspaceId) ===
            outcome.invitation.organizationId &&
          membership.userId === identityUser.id &&
          membership.role === outcome.invitation.role &&
          membership.status === "active",
      );
      if (
        !refreshed ||
        !refreshed.allowedSurfaces.includes("portal") ||
        !matchingMembership
      ) {
        throw new Error(
          "Backend chưa làm mới quyền Portal và workspace vừa chấp nhận.",
        );
      }
      await clearStaffInvitationAcceptanceIdempotencyKey(
        invitationToken,
        identityUser.id,
      );
      navigate("/portal", { replace: true });
    } catch (cause) {
      setError(invitationErrorMessage(cause));
    } finally {
      acceptingRef.current = false;
      setIsAccepting(false);
    }
  };

  if (tokenError) {
    return (
      <div className="shc-auth-page shc-auth-result">
        <AuthPageIntro
          icon={KeyRound}
          title="Liên kết mời không hợp lệ"
          description="Shcare không thể đọc mã xác nhận trong liên kết này."
        />
        <AuthAlert tone="error">{tokenError}</AuthAlert>
        <div className="shc-auth-result-actions">
          <Link to="/login" className="shc-auth-link-button">
            Về đăng nhập
          </Link>
          <Link to="/lien-he" className="shc-auth-back-link">
            Liên hệ hỗ trợ
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="shc-auth-page shc-auth-result">
        <AuthPageIntro
          icon={UserCheck}
          title="Kiểm tra phiên xác thực"
          description="Shcare đang kiểm tra tài khoản trước khi cho phép nhận lời mời."
        />
        <AuthSubmissionStatus label="Đang kiểm tra danh tính..." />
      </div>
    );
  }

  if (!identityUser && !verificationPending) {
    return (
      <div className="shc-auth-page shc-auth-page-login">
        <AuthPageIntro
          icon={ShieldCheck}
          title="Xác thực để nhận lời mời"
          description="Đăng nhập đúng tài khoản có email nhận lời mời. Quyền workspace chỉ được mở sau khi backend xác nhận."
        />

        {twoFactorChallenge ? (
          <form className="shc-auth-form" noValidate onSubmit={submitTwoFactor}>
            <AuthField
              id="invitation-otp"
              label="Mã xác thực"
              error={error}
              required
            >
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) => {
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                className="shc-auth-otp-input"
                placeholder="000000"
                autoFocus
              />
            </AuthField>
            <AuthPrimaryButton
              type="submit"
              loading={isSigningIn}
              loadingLabel="Đang xác minh mã..."
            >
              Xác minh tài khoản
              <ArrowRight size={17} aria-hidden="true" />
            </AuthPrimaryButton>
            <AuthSecondaryButton
              type="button"
              disabled={isSigningIn}
              onClick={() => void cancelTwoFactorLogin()}
            >
              <LogOut size={16} aria-hidden="true" />
              Dùng tài khoản khác
            </AuthSecondaryButton>
          </form>
        ) : (
          <form
            className="shc-auth-form"
            noValidate
            onSubmit={authMode === "signup" ? submitSignup : submitIdentity}
          >
            <AuthField
              id="invitation-email"
              label="Email nhận lời mời"
              error={fieldErrors.email}
              required
            >
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setFieldErrors((current) => ({ ...current, email: "" }));
                  setError("");
                }}
                placeholder="bacsi@phongkham.vn"
              />
            </AuthField>
            <AuthField
              id="invitation-password"
              label="Mật khẩu"
              error={fieldErrors.password}
              required
              action={
                <button
                  type="button"
                  className="shc-auth-inline-action"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-controls="invitation-password"
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                </button>
              }
            >
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={
                  authMode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((current) => ({ ...current, password: "" }));
                  setError("");
                }}
                placeholder="Nhập mật khẩu"
              />
            </AuthField>
            {authMode === "signup" ? (
              <AuthField
                id="invitation-confirm-password"
                label="Xác nhận mật khẩu"
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
                    setError("");
                  }}
                  placeholder="Nhập lại mật khẩu"
                />
              </AuthField>
            ) : null}
            {authMode === "signup" && !signupAvailable ? (
              <AuthAlert tone="warning">
                Tạo tài khoản nhận lời mời chưa khả dụng trong môi trường này.
                Hãy nhờ quản trị viên gửi lại lời mời sau khi Firebase Auth được
                cấu hình.
              </AuthAlert>
            ) : null}
            {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
            <AuthPrimaryButton
              type="submit"
              loading={isSigningIn}
              disabled={authMode === "signup" && !signupAvailable}
              loadingLabel="Đang xác thực tài khoản..."
            >
              {authMode === "signup"
                ? "Tạo tài khoản và xác minh email"
                : "Tiếp tục"}
              <ArrowRight size={17} aria-hidden="true" />
            </AuthPrimaryButton>
            <AuthSecondaryButton
              type="button"
              disabled={isSigningIn}
              onClick={() => {
                setAuthMode((current) =>
                  current === "login" ? "signup" : "login",
                );
                setFieldErrors({});
                setError("");
              }}
            >
              {authMode === "login"
                ? "Chưa có tài khoản? Tạo tài khoản nhận lời mời"
                : "Đã có tài khoản? Đăng nhập"}
            </AuthSecondaryButton>
          </form>
        )}
      </div>
    );
  }

  if (
    verificationPending ||
    (requiresEmailVerification && identityUser?.raw.verifiedEmail !== true)
  ) {
    return (
      <div className="shc-auth-page shc-auth-result">
        <AuthPageIntro
          icon={KeyRound}
          title="Xác minh email trước khi tham gia"
          description="Lời mời chỉ được gắn với tài khoản sau khi Firebase và backend cùng xác nhận email."
        />
        <AuthAlert tone="info">
          Mở liên kết xác minh trong email đã đăng ký, sau đó quay lại trang
          này.
        </AuthAlert>
        {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
        <div className="shc-auth-action-stack">
          <AuthPrimaryButton
            type="button"
            loading={isSigningIn}
            loadingLabel="Đang kiểm tra email..."
            onClick={() => void checkEmailVerification()}
          >
            Tôi đã xác minh email
          </AuthPrimaryButton>
          <AuthSecondaryButton
            type="button"
            disabled={isSigningIn}
            onClick={() => void logout()}
          >
            <LogOut size={16} aria-hidden="true" />
            Dùng tài khoản khác
          </AuthSecondaryButton>
        </div>
      </div>
    );
  }

  if (!identityUser) return null;

  return (
    <div className="shc-auth-page shc-auth-result">
      <AuthPageIntro
        icon={UserCheck}
        title="Xác nhận tham gia workspace"
        description="Backend sẽ đối chiếu email, lời mời và tạo membership trong cùng một thao tác có thể thử lại an toàn."
      />
      <AuthAlert tone="info" title="Tài khoản đang xác thực">
        {identityUser.email}
      </AuthAlert>
      {error ? <AuthAlert tone="error">{error}</AuthAlert> : null}
      <div className="shc-auth-action-stack">
        <AuthPrimaryButton
          type="button"
          onClick={() => void acceptInvitation()}
          loading={isAccepting}
          loadingLabel="Đang xác nhận membership..."
        >
          Chấp nhận lời mời
          <ArrowRight size={17} aria-hidden="true" />
        </AuthPrimaryButton>
        <AuthSecondaryButton
          type="button"
          disabled={isAccepting}
          onClick={() => void logout()}
        >
          <LogOut size={16} aria-hidden="true" />
          Dùng tài khoản khác
        </AuthSecondaryButton>
      </div>
    </div>
  );
}
