import { useState } from "react";
import { CheckCircle2, MailCheck, RotateCw } from "lucide-react";
import { Link } from "react-router";

import {
  AuthAlert,
  AuthPageIntro,
  AuthPrimaryButton,
  AuthSecondaryButton,
} from "../../components/auth/AuthPrimitives";
import { getSafeAuthErrorMessage } from "../../auth/auth-form";
import { refreshFirebaseVerification } from "../../../lib/firebase-client";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { useSEO } from "@/lib/useSEO";

type Feedback = {
  tone: "error" | "warning" | "success" | "info";
  message: string;
};

export default function EmailVerificationPage() {
  useSEO({
    title: "Xác minh email | Shcare",
    description:
      "Kiểm tra trạng thái xác minh email cho tài khoản Shcare Workspace.",
    path: "/xac-nhan-email",
  });

  const [busyAction, setBusyAction] = useState<"check" | "resend" | null>(null);
  const [verified, setVerified] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const completeVerification = async (idToken: string) => {
    await smartHealthApi.authenticateFirebase(idToken);
    setVerified(true);
    setFeedback({
      tone: "success",
      message: "Firebase và backend Shcare đã xác nhận email của bạn.",
    });
  };

  const check = async () => {
    setBusyAction("check");
    setFeedback(null);
    try {
      const result = await refreshFirebaseVerification();
      if (!result.verified) {
        setFeedback({
          tone: "warning",
          message:
            "Email chưa được xác minh. Mở liên kết trong hộp thư rồi kiểm tra lại.",
        });
        return;
      }
      await completeVerification(result.idToken);
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: getSafeAuthErrorMessage(
          cause,
          "Không thể kiểm tra trạng thái. Vui lòng thử lại.",
        ),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const resend = async () => {
    setBusyAction("resend");
    setFeedback(null);
    try {
      const firebaseState = await refreshFirebaseVerification();
      await smartHealthApi.authenticateFirebase(firebaseState.idToken);
      if (firebaseState.verified) {
        setVerified(true);
        setFeedback({
          tone: "success",
          message: "Email đã được xác minh. Bạn có thể tiếp tục.",
        });
        return;
      }

      const delivery = await smartHealthApi.sendEmailVerification();
      if (delivery.status === "verified") {
        setVerified(true);
        setFeedback({
          tone: "success",
          message: "Email đã được xác minh. Bạn có thể tiếp tục.",
        });
        return;
      }
      setFeedback({
        tone: "info",
        message: `Email xác minh đã được gửi đến ${delivery.email}.`,
      });
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: getSafeAuthErrorMessage(
          cause,
          "Không thể gửi lại email. Vui lòng thử lại.",
        ),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="shc-auth-page shc-auth-result">
      <AuthPageIntro
        icon={verified ? CheckCircle2 : MailCheck}
        title={verified ? "Email đã được xác minh" : "Xác minh email"}
        description={
          verified
            ? "Phiên đăng nhập đã được làm mới với backend Shcare."
            : "Mở liên kết trong email, sau đó quay lại để Shcare kiểm tra trạng thái từ Firebase."
        }
      />

      <div className="shc-auth-checklist" aria-label="Các bước xác minh">
        <div data-complete="true">
          <span>1</span>
          <p>
            <strong>Mở email xác minh</strong>
            <small>
              Chỉ dùng liên kết Firebase được gửi cho tài khoản của bạn.
            </small>
          </p>
        </div>
        <div data-complete={verified ? "true" : undefined}>
          <span>2</span>
          <p>
            <strong>Đồng bộ với Shcare</strong>
            <small>
              Quyền workspace chỉ được cập nhật sau khi backend xác nhận.
            </small>
          </p>
        </div>
      </div>

      {feedback ? (
        <AuthAlert tone={feedback.tone}>{feedback.message}</AuthAlert>
      ) : null}

      {verified ? (
        <div className="shc-auth-result-actions">
          <Link to="/cho-duyet" className="shc-auth-link-button">
            Xem trạng thái hồ sơ
          </Link>
          <Link to="/login" className="shc-auth-back-link">
            Về đăng nhập
          </Link>
        </div>
      ) : (
        <div className="shc-auth-action-stack">
          <AuthPrimaryButton
            type="button"
            onClick={() => void check()}
            loading={busyAction === "check"}
            disabled={busyAction !== null}
            loadingLabel="Đang kiểm tra..."
          >
            Kiểm tra trạng thái
          </AuthPrimaryButton>
          <AuthSecondaryButton
            type="button"
            onClick={() => void resend()}
            disabled={busyAction !== null}
          >
            <RotateCw size={16} aria-hidden="true" />
            {busyAction === "resend" ? "Đang gửi lại..." : "Gửi lại email"}
          </AuthSecondaryButton>
        </div>
      )}
    </div>
  );
}
