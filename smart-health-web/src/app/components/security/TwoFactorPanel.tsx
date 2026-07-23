import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clipboard,
  Download,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";

import {
  smartHealthApi,
  type ApiError,
  type TwoFactorEnrollment,
  type TwoFactorStatusResponse,
} from "../../../lib/smart-health-api";

type PanelStep = "status" | "verify" | "recovery" | "disable";

function errorMessage(error: unknown) {
  const code = error && typeof error === "object" ? (error as ApiError).code : "";
  if (code === "TWO_FACTOR_ENROLLMENT_EXPIRED") {
    return "Phiên thiết lập đã hết hạn. Hãy bắt đầu lại để nhận khóa mới.";
  }
  if (code === "TWO_FACTOR_CODE_REPLAYED") {
    return "Mã này đã được sử dụng. Hãy đợi mã mới trên ứng dụng xác thực.";
  }
  if (code === "TWO_FACTOR_CODE_INVALID") {
    return "Mã xác thực chưa đúng. Hãy kiểm tra thời gian trên thiết bị và thử lại.";
  }
  if (code === "TWO_FACTOR_UNAVAILABLE") {
    return "Hạ tầng lưu khóa bảo mật chưa sẵn sàng. 2FA chưa được thay đổi.";
  }
  return error instanceof Error
    ? error.message
    : "Không thể cập nhật xác thực hai lớp.";
}

function normalizeOtp(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function TwoFactorPanel({
  onStatusChange,
}: {
  onStatusChange?: (enabled: boolean, method: string) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<PanelStep>("status");
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(null);
  const [otp, setOtp] = useState("");
  const [formError, setFormError] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["account-two-factor"],
    queryFn: () => smartHealthApi.getTwoFactorStatus(),
    staleTime: 15_000,
  });

  const updateStatus = (twoFactor: TwoFactorStatusResponse["twoFactor"]) => {
    queryClient.setQueryData<TwoFactorStatusResponse>(
      ["account-two-factor"],
      (current) =>
        current
          ? { ...current, twoFactor }
          : {
              availability: {
                available: true,
                status: "available",
                methods: ["app"],
                reason: "",
              },
              twoFactor,
            },
    );
    onStatusChange?.(twoFactor.enabled, twoFactor.method);
  };

  const beginEnrollment = useMutation({
    mutationFn: () => smartHealthApi.startTwoFactorEnrollment(),
    onSuccess: (result) => {
      updateStatus(result.twoFactor);
      setEnrollment(result.enrollment);
      setOtp("");
      setFormError("");
      setStep("verify");
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const verifyEnrollment = useMutation({
    mutationFn: () => {
      if (!enrollment) throw new Error("Phiên thiết lập không còn hợp lệ.");
      if (!/^\d{6}$/.test(otp)) {
        throw new Error("Nhập đủ 6 chữ số trên ứng dụng xác thực.");
      }
      if (Date.parse(enrollment.expiresAt) <= Date.now()) {
        throw new Error("Phiên thiết lập đã hết hạn. Hãy bắt đầu lại.");
      }
      return smartHealthApi.verifyTwoFactorEnrollment({
        enrollmentId: enrollment.id,
        code: otp,
      });
    },
    onSuccess: (result) => {
      updateStatus(result.twoFactor);
      setRecoveryCodes(result.recoveryCodes);
      setRecoveryAcknowledged(false);
      setOtp("");
      setFormError("");
      setStep("recovery");
      toast.success("Đã xác minh ứng dụng OTP");
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const disableTwoFactor = useMutation({
    mutationFn: () => {
      if (!/^\d{6}$/.test(otp)) {
        throw new Error("Nhập mã OTP hiện tại để xác nhận tắt 2FA.");
      }
      return smartHealthApi.disableTwoFactor(otp);
    },
    onSuccess: (result) => {
      updateStatus(result.twoFactor);
      setOtp("");
      setFormError("");
      setStep("status");
      toast.success("Đã tắt xác thực hai lớp");
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      toast.success("Đã sao chép mã khôi phục");
    } catch {
      toast.error("Trình duyệt không cho phép sao chép. Hãy lưu tệp thay thế.");
    }
  };

  const downloadRecoveryCodes = () => {
    const blob = new Blob(
      [
        "Shcare — Mã khôi phục xác thực hai lớp\n",
        "Mỗi mã chỉ dùng được một lần. Không chia sẻ tệp này.\n\n",
        recoveryCodes.join("\n"),
        "\n",
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "shcare-ma-khoi-phuc-2fa.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const status = statusQuery.data;
  const enabled = Boolean(status?.twoFactor.enabled);
  const busy =
    beginEnrollment.isPending ||
    verifyEnrollment.isPending ||
    disableTwoFactor.isPending;

  return (
    <section className="shc-two-factor-panel" aria-labelledby="account-2fa-title">
      <div className="shc-two-factor-heading">
        <span className="shc-two-factor-icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h2 id="account-2fa-title">Xác thực hai lớp</h2>
          <p>Thêm mã dùng một lần từ ứng dụng xác thực sau bước đăng nhập chính.</p>
        </div>
      </div>

      {statusQuery.isLoading ? (
        <div className="shc-two-factor-state" role="status">
          <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
          Đang tải trạng thái bảo mật…
        </div>
      ) : statusQuery.isError ? (
        <div className="shc-two-factor-state shc-two-factor-state-error" role="alert">
          <span>{errorMessage(statusQuery.error)}</span>
          <button type="button" onClick={() => void statusQuery.refetch()}>
            <RefreshCw size={16} aria-hidden="true" />
            Thử lại
          </button>
        </div>
      ) : !status?.availability.available ? (
        <div
          data-testid="account-2fa-unavailable"
          className="shc-two-factor-state shc-two-factor-state-warning"
          role="status"
        >
          <ShieldOff size={18} aria-hidden="true" />
          <span>
            2FA đang tạm không khả dụng. Tài khoản chưa bị thay đổi; quản trị viên cần cấu hình kho khóa bảo mật.
          </span>
        </div>
      ) : (
        <>
          <div className="shc-two-factor-status" data-enabled={enabled}>
            <span className="shc-two-factor-status-mark" aria-hidden="true">
              {enabled ? <Check size={16} /> : <KeyRound size={16} />}
            </span>
            <span>
              <strong>{enabled ? "Đang bảo vệ bằng OTP" : "Chưa bật 2FA"}</strong>
              <small>
                {enabled
                  ? "Mỗi phiên đăng nhập mới phải vượt qua bước xác minh thứ hai."
                  : "Thiết lập chưa làm thay đổi tài khoản cho đến khi mã OTP được backend xác minh."}
              </small>
            </span>
          </div>

          {step === "status" && (
            <div className="shc-two-factor-actions">
              {enabled ? (
                <button
                  id="account-2fa-disable"
                  type="button"
                  className="shc-two-factor-button shc-two-factor-button-danger"
                  onClick={() => {
                    setOtp("");
                    setFormError("");
                    setStep("disable");
                  }}
                >
                  Tắt 2FA…
                </button>
              ) : (
                <button
                  id="account-2fa-app"
                  type="button"
                  className="shc-two-factor-button shc-two-factor-button-primary"
                  onClick={() => beginEnrollment.mutate()}
                  disabled={busy}
                >
                  {beginEnrollment.isPending ? (
                    <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
                  ) : (
                    <ShieldCheck size={17} aria-hidden="true" />
                  )}
                  Bắt đầu thiết lập
                </button>
              )}
            </div>
          )}

          {step === "verify" && enrollment && (
            <div className="shc-two-factor-step">
              <div className="shc-two-factor-step-title">
                <span>1</span>
                <div>
                  <strong>Liên kết ứng dụng xác thực</strong>
                  <small>Nhập khóa thủ công hoặc mở liên kết trên thiết bị có ứng dụng OTP.</small>
                </div>
              </div>
              <code className="shc-two-factor-key">{enrollment.manualKey}</code>
              <div className="shc-two-factor-inline-actions">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(enrollment.manualKey)}
                >
                  <Clipboard size={16} aria-hidden="true" />
                  Sao chép khóa
                </button>
                <a href={enrollment.otpauthUri}>Mở ứng dụng xác thực</a>
              </div>

              <label className="shc-two-factor-field" htmlFor="account-2fa-code">
                <span>Mã OTP 6 chữ số</span>
                <input
                  id="account-2fa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => {
                    setOtp(normalizeOtp(event.target.value));
                    setFormError("");
                  }}
                  placeholder="000000"
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? "account-2fa-error" : undefined}
                />
              </label>
              <p className="shc-two-factor-expiry">
                Phiên thiết lập hết hạn lúc {new Intl.DateTimeFormat("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(enrollment.expiresAt))}.
              </p>
              {formError && (
                <p id="account-2fa-error" className="shc-two-factor-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="shc-two-factor-actions">
                <button
                  type="button"
                  className="shc-two-factor-button shc-two-factor-button-primary"
                  onClick={() => verifyEnrollment.mutate()}
                  disabled={busy || otp.length !== 6}
                >
                  {verifyEnrollment.isPending && (
                    <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
                  )}
                  Xác minh và bật 2FA
                </button>
                <button
                  type="button"
                  className="shc-two-factor-button"
                  onClick={() => {
                    setEnrollment(null);
                    setOtp("");
                    setFormError("");
                    setStep("status");
                  }}
                  disabled={busy}
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          {step === "recovery" && (
            <div className="shc-two-factor-step" aria-live="polite">
              <div className="shc-two-factor-step-title">
                <span>2</span>
                <div>
                  <strong>Lưu mã khôi phục ngay</strong>
                  <small>Danh sách này chỉ xuất hiện một lần; mỗi mã chỉ dùng được một lần.</small>
                </div>
              </div>
              <div className="shc-two-factor-recovery" role="list" aria-label="Mã khôi phục">
                {recoveryCodes.map((code) => (
                  <code role="listitem" key={code}>{code}</code>
                ))}
              </div>
              <div className="shc-two-factor-inline-actions">
                <button type="button" onClick={() => void copyRecoveryCodes()}>
                  <Clipboard size={16} aria-hidden="true" />
                  Sao chép
                </button>
                <button type="button" onClick={downloadRecoveryCodes}>
                  <Download size={16} aria-hidden="true" />
                  Lưu tệp
                </button>
              </div>
              <label className="shc-two-factor-acknowledge">
                <input
                  type="checkbox"
                  checked={recoveryAcknowledged}
                  onChange={(event) => setRecoveryAcknowledged(event.target.checked)}
                />
                <span>Tôi đã lưu mã khôi phục ở nơi an toàn.</span>
              </label>
              <button
                type="button"
                className="shc-two-factor-button shc-two-factor-button-primary"
                disabled={!recoveryAcknowledged}
                onClick={() => {
                  setRecoveryCodes([]);
                  setRecoveryAcknowledged(false);
                  setEnrollment(null);
                  setStep("status");
                }}
              >
                Hoàn tất
              </button>
            </div>
          )}

          {step === "disable" && (
            <div className="shc-two-factor-step shc-two-factor-step-danger">
              <div className="shc-two-factor-step-title">
                <span>!</span>
                <div>
                  <strong>Xác nhận tắt 2FA</strong>
                  <small>Nhập mã OTP hiện tại. Thao tác chỉ hoàn tất khi backend xác minh thành công.</small>
                </div>
              </div>
              <label className="shc-two-factor-field" htmlFor="account-2fa-disable-code">
                <span>Mã OTP hiện tại</span>
                <input
                  id="account-2fa-disable-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => {
                    setOtp(normalizeOtp(event.target.value));
                    setFormError("");
                  }}
                  placeholder="000000"
                  aria-invalid={Boolean(formError)}
                />
              </label>
              {formError && <p className="shc-two-factor-error" role="alert">{formError}</p>}
              <div className="shc-two-factor-actions">
                <button
                  type="button"
                  className="shc-two-factor-button shc-two-factor-button-danger"
                  onClick={() => disableTwoFactor.mutate()}
                  disabled={busy || otp.length !== 6}
                >
                  {disableTwoFactor.isPending && (
                    <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
                  )}
                  Xác minh và tắt
                </button>
                <button
                  type="button"
                  className="shc-two-factor-button"
                  onClick={() => {
                    setOtp("");
                    setFormError("");
                    setStep("status");
                  }}
                  disabled={busy}
                >
                  Giữ 2FA
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
