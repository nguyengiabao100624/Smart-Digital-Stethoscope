import { useEffect, useRef, useState } from "react";
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
import {
  createTwoFactorEnrollmentIdempotencyKey,
  type TwoFactorEnrollmentIntent,
  type TwoFactorEnrollmentStartIntent,
  type TwoFactorRecoveryDelivery,
} from "../../../lib/two-factor-enrollment-operations";

type PanelStep = "status" | "verify" | "recovery" | "disable";

function errorMessage(error: unknown) {
  if (
    error instanceof Error &&
    error.message.includes("Phiên xác thực chính đã thay đổi")
  ) {
    return "Phiên đăng nhập đã thay đổi. Shcare đã loại kết quả 2FA cũ; hãy bắt đầu lại trong phiên hiện tại.";
  }
  const code =
    error && typeof error === "object" ? (error as ApiError).code : "";
  if (code === "TWO_FACTOR_ENROLLMENT_EXPIRED") {
    return "Phiên thiết lập đã hết hạn. Hãy bắt đầu lại để nhận khóa mới.";
  }
  if (
    code === "TWO_FACTOR_ENROLLMENT_ALREADY_USED" ||
    code === "TWO_FACTOR_ENROLLMENT_CONSUMED"
  ) {
    return "Lần thiết lập này không còn hiệu lực. Hãy bắt đầu lại để nhận khóa mới.";
  }
  if (code === "TWO_FACTOR_ATTEMPTS_EXCEEDED") {
    return "Đã vượt quá số lần thử cho lần thiết lập này. Hãy bắt đầu lại để nhận khóa mới.";
  }
  if (code === "TWO_FACTOR_DELIVERY_EXPIRED") {
    return "Thời hạn xác nhận bộ mã khôi phục đã hết. 2FA chưa được bật; hãy bắt đầu lại.";
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
  userId,
  onStatusChange,
  onPendingRecoveryChange,
}: {
  userId: string;
  onStatusChange?: (enabled: boolean, method: string) => void;
  onPendingRecoveryChange?: (pending: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<PanelStep>("status");
  const [enrollment, setEnrollment] = useState<TwoFactorEnrollment | null>(
    null,
  );
  const [otp, setOtp] = useState("");
  const [formError, setFormError] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryDelivery, setRecoveryDelivery] =
    useState<TwoFactorRecoveryDelivery | null>(null);
  const [recoveryAckToken, setRecoveryAckToken] = useState("");
  const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);
  const enrollmentIntentRef = useRef<TwoFactorEnrollmentIntent | null>(null);
  const enrollmentStartIntentRef =
    useRef<TwoFactorEnrollmentStartIntent | null>(null);
  const recoveryGuardActiveRef = useRef(false);
  const authSessionEpoch = smartHealthApi.getAuthSessionEpochSnapshot();
  const activeUserIdRef = useRef(userId);
  const activeAuthSessionEpochRef = useRef(authSessionEpoch);
  const previousAuthorityRef = useRef({ userId, authSessionEpoch });
  activeUserIdRef.current = userId;
  activeAuthSessionEpochRef.current = authSessionEpoch;
  const twoFactorStatusQueryKey = [
    "account-two-factor",
    userId,
    authSessionEpoch,
  ] as const;

  useEffect(() => {
    const previous = previousAuthorityRef.current;
    if (
      previous.userId === userId &&
      previous.authSessionEpoch === authSessionEpoch
    ) {
      return;
    }
    previousAuthorityRef.current = { userId, authSessionEpoch };
    enrollmentStartIntentRef.current = null;
    enrollmentIntentRef.current = null;
    setEnrollment(null);
    setOtp("");
    setRecoveryCodes([]);
    setRecoveryDelivery(null);
    setRecoveryAckToken("");
    setRecoveryAcknowledged(false);
    setFormError("");
    setStep("status");
  }, [authSessionEpoch, userId]);

  const statusQuery = useQuery({
    queryKey: twoFactorStatusQueryKey,
    queryFn: () => smartHealthApi.getTwoFactorStatus(),
    staleTime: 15_000,
  });

  const updateStatus = (twoFactor: TwoFactorStatusResponse["twoFactor"]) => {
    queryClient.setQueryData<TwoFactorStatusResponse>(
      twoFactorStatusQueryKey,
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
    mutationFn: (authority: {
      ownerUserId: string;
      authSessionEpoch: number;
    }) => {
      const previousIntent = enrollmentStartIntentRef.current;
      const intent: TwoFactorEnrollmentStartIntent =
        previousIntent &&
        previousIntent.userId === authority.ownerUserId &&
        previousIntent.authSessionEpoch === authority.authSessionEpoch
          ? previousIntent
          : {
              userId: authority.ownerUserId,
              authSessionEpoch: authority.authSessionEpoch,
              idempotencyKey: createTwoFactorEnrollmentIdempotencyKey(),
            };
      enrollmentStartIntentRef.current = intent;
      return smartHealthApi.startTwoFactorEnrollment(intent);
    },
    onSuccess: (result, authority) => {
      if (
        activeUserIdRef.current !== authority.ownerUserId ||
        smartHealthApi.getAuthSessionEpochSnapshot() !==
          authority.authSessionEpoch
      ) {
        return;
      }
      updateStatus(result.twoFactor);
      enrollmentIntentRef.current = null;
      setRecoveryAckToken("");
      setEnrollment(result.enrollment);
      setOtp("");
      setFormError("");
      setStep("verify");
    },
    onError: (error, authority) => {
      if (
        activeUserIdRef.current === authority.ownerUserId &&
        smartHealthApi.getAuthSessionEpochSnapshot() ===
          authority.authSessionEpoch
      ) {
        if ((error as ApiError)?.code === "IDEMPOTENCY_KEY_REUSED") {
          enrollmentStartIntentRef.current = null;
        }
        setFormError(errorMessage(error));
      }
    },
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
      if (!userId)
        throw new Error("Không xác định được chủ tài khoản hiện tại.");
      const previousIntent = enrollmentIntentRef.current;
      const currentAuthSessionEpoch =
        smartHealthApi.getAuthSessionEpochSnapshot();
      const intent: TwoFactorEnrollmentIntent =
        previousIntent &&
        previousIntent.userId === userId &&
        previousIntent.authSessionEpoch === currentAuthSessionEpoch &&
        previousIntent.enrollmentId === enrollment.id &&
        previousIntent.code === otp
          ? previousIntent
          : {
              userId,
              authSessionEpoch: currentAuthSessionEpoch,
              enrollmentId: enrollment.id,
              code: otp,
              idempotencyKey: createTwoFactorEnrollmentIdempotencyKey(),
            };
      enrollmentIntentRef.current = intent;
      return smartHealthApi.verifyTwoFactorEnrollment(intent);
    },
    onSuccess: (result) => {
      const intent = enrollmentIntentRef.current;
      if (
        !intent ||
        activeUserIdRef.current !== result.userId ||
        activeAuthSessionEpochRef.current !== intent.authSessionEpoch ||
        smartHealthApi.getAuthSessionEpochSnapshot() !==
          intent.authSessionEpoch
      ) {
        setFormError(
          "Tài khoản hoặc phiên đăng nhập đã thay đổi trước khi backend trả kết quả. Không áp dụng kết quả cũ.",
        );
        return;
      }
      updateStatus(result.twoFactor);
      setRecoveryCodes(result.recoveryCodes);
      setRecoveryDelivery(result.recoveryDelivery);
      setRecoveryAckToken(result.recoveryAckToken);
      setRecoveryAcknowledged(false);
      setOtp("");
      setFormError("");
      setStep("recovery");
      toast.success("Backend đã xác minh ứng dụng OTP");
    },
    onError: (error) => {
      const intent = enrollmentIntentRef.current;
      if (
        intent &&
        activeUserIdRef.current === intent.userId &&
        smartHealthApi.getAuthSessionEpochSnapshot() ===
          intent.authSessionEpoch
      ) {
        const terminalEnrollmentError = [
          "TWO_FACTOR_ENROLLMENT_EXPIRED",
          "TWO_FACTOR_ENROLLMENT_CONSUMED",
          "TWO_FACTOR_ENROLLMENT_ALREADY_USED",
          "TWO_FACTOR_ATTEMPTS_EXCEEDED",
          "TWO_FACTOR_DELIVERY_EXPIRED",
        ].includes((error as ApiError)?.code || "");
        if (terminalEnrollmentError) {
          enrollmentStartIntentRef.current = null;
          enrollmentIntentRef.current = null;
          setEnrollment(null);
          setOtp("");
          setStep("status");
          void queryClient.invalidateQueries({ queryKey: twoFactorStatusQueryKey });
        }
        setFormError(errorMessage(error));
      }
    },
  });

  const acknowledgeRecoveryCodes = useMutation({
    mutationFn: () => {
      const intent = enrollmentIntentRef.current;
      if (!intent || !recoveryDelivery || !recoveryAckToken) {
        throw new Error("Biên nhận giao mã khôi phục không còn hợp lệ.");
      }
      if (
        intent.userId !== userId ||
        activeUserIdRef.current !== intent.userId ||
        activeAuthSessionEpochRef.current !== intent.authSessionEpoch ||
        smartHealthApi.getAuthSessionEpochSnapshot() !==
          intent.authSessionEpoch
      ) {
        throw new Error(
          "Tài khoản đã thay đổi. Không thể xác nhận mã của tài khoản cũ.",
        );
      }
      return smartHealthApi.acknowledgeTwoFactorRecoveryCodes({
        userId: intent.userId,
        authSessionEpoch: intent.authSessionEpoch,
        enrollmentId: intent.enrollmentId,
        deliveryId: recoveryDelivery.id,
        recoveryAckToken,
        idempotencyKey: intent.idempotencyKey,
      });
    },
    onSuccess: (result) => {
      const intent = enrollmentIntentRef.current;
      if (
        !intent ||
        activeUserIdRef.current !== result.userId ||
        activeAuthSessionEpochRef.current !== intent.authSessionEpoch ||
        smartHealthApi.getAuthSessionEpochSnapshot() !==
          intent.authSessionEpoch
      ) {
        setFormError(
          "Tài khoản hoặc phiên đăng nhập đã thay đổi trước khi backend xác nhận. Không đóng danh sách mã.",
        );
        return;
      }
      updateStatus(result.twoFactor);
      enrollmentStartIntentRef.current = null;
      enrollmentIntentRef.current = null;
      setRecoveryCodes([]);
      setRecoveryDelivery(null);
      setRecoveryAckToken("");
      setRecoveryAcknowledged(false);
      setEnrollment(null);
      setFormError("");
      setStep("status");
      toast.success("Backend đã ghi nhận bạn lưu mã khôi phục");
    },
    onError: (error) => {
      const intent = enrollmentIntentRef.current;
      if (
        intent &&
        activeUserIdRef.current === intent.userId &&
        smartHealthApi.getAuthSessionEpochSnapshot() ===
          intent.authSessionEpoch
      ) {
        if ((error as ApiError)?.code === "TWO_FACTOR_DELIVERY_EXPIRED") {
          enrollmentStartIntentRef.current = null;
          enrollmentIntentRef.current = null;
          updateStatus({ enabled: false, method: "", enrollmentPending: false });
          setRecoveryCodes([]);
          setRecoveryDelivery(null);
          setRecoveryAckToken("");
          setRecoveryAcknowledged(false);
          setEnrollment(null);
          setStep("status");
        }
        setFormError(errorMessage(error));
      }
    },
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

  const recoveryCodesVisible = step === "recovery" && recoveryCodes.length > 0;

  useEffect(() => {
    recoveryGuardActiveRef.current = recoveryCodesVisible;
    onPendingRecoveryChange?.(recoveryCodesVisible);
  }, [onPendingRecoveryChange, recoveryCodesVisible]);

  useEffect(
    () => () => {
      if (recoveryGuardActiveRef.current) {
        onPendingRecoveryChange?.(false);
      }
    },
    [onPendingRecoveryChange],
  );

  useEffect(() => {
    if (!recoveryCodesVisible) return;
    const guardUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guardUnload);
    return () => {
      window.removeEventListener("beforeunload", guardUnload);
    };
  }, [recoveryCodesVisible]);

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
  const enrollmentPending = Boolean(
    status?.twoFactor.enrollmentPending && !enabled,
  );
  const busy =
    beginEnrollment.isPending ||
    verifyEnrollment.isPending ||
    acknowledgeRecoveryCodes.isPending ||
    disableTwoFactor.isPending;

  return (
    <section
      className="shc-two-factor-panel"
      aria-labelledby="account-2fa-title"
    >
      <div className="shc-two-factor-heading">
        <span className="shc-two-factor-icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h2 id="account-2fa-title">Xác thực hai lớp</h2>
          <p>
            Thêm mã dùng một lần từ ứng dụng xác thực sau bước đăng nhập chính.
          </p>
        </div>
      </div>

      {statusQuery.isLoading ? (
        <div className="shc-two-factor-state" role="status">
          <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
          Đang tải trạng thái bảo mật…
        </div>
      ) : statusQuery.isError ? (
        <div
          className="shc-two-factor-state shc-two-factor-state-error"
          role="alert"
        >
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
            2FA đang tạm không khả dụng. Tài khoản chưa bị thay đổi; quản trị
            viên cần cấu hình kho khóa bảo mật.
          </span>
        </div>
      ) : (
        <>
          <div className="shc-two-factor-status" data-enabled={enabled}>
            <span className="shc-two-factor-status-mark" aria-hidden="true">
              {enabled ? <Check size={16} /> : <KeyRound size={16} />}
            </span>
            <span>
              <strong>
                {enabled
                  ? "Đang bảo vệ bằng OTP"
                  : enrollmentPending
                    ? "Đang chờ xác nhận mã khôi phục"
                    : "Chưa bật 2FA"}
              </strong>
              <small>
                {enabled
                  ? "Mỗi phiên đăng nhập mới phải vượt qua bước xác minh thứ hai."
                  : enrollmentPending
                    ? "2FA vẫn chưa bật. Sau khi tải lại, hãy bắt đầu lại an toàn để nhận bộ mã mới và xác nhận với backend."
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
                  onClick={() =>
                    beginEnrollment.mutate({
                      ownerUserId: userId,
                      authSessionEpoch:
                        smartHealthApi.getAuthSessionEpochSnapshot(),
                    })
                  }
                  disabled={busy}
                >
                  {beginEnrollment.isPending ? (
                    <LoaderCircle
                      className="animate-spin"
                      size={17}
                      aria-hidden="true"
                    />
                  ) : (
                    <ShieldCheck size={17} aria-hidden="true" />
                  )}
                  {enrollmentPending
                    ? "Bắt đầu lại an toàn"
                    : "Bắt đầu thiết lập"}
                </button>
              )}
            </div>
          )}
          {step === "status" && formError && (
            <p className="shc-two-factor-error" role="alert">
              {formError}
            </p>
          )}

          {step === "verify" && enrollment && (
            <div className="shc-two-factor-step">
              <div className="shc-two-factor-step-title">
                <span>1</span>
                <div>
                  <strong>Liên kết ứng dụng xác thực</strong>
                  <small>
                    Nhập khóa thủ công hoặc mở liên kết trên thiết bị có ứng
                    dụng OTP.
                  </small>
                </div>
              </div>
              <code className="shc-two-factor-key">{enrollment.manualKey}</code>
              <div className="shc-two-factor-inline-actions">
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(enrollment.manualKey)
                  }
                >
                  <Clipboard size={16} aria-hidden="true" />
                  Sao chép khóa
                </button>
                <a href={enrollment.otpauthUri}>Mở ứng dụng xác thực</a>
              </div>

              <label
                className="shc-two-factor-field"
                htmlFor="account-2fa-code"
              >
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
                Phiên thiết lập hết hạn lúc{" "}
                {new Intl.DateTimeFormat("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(enrollment.expiresAt))}
                .
              </p>
              {formError && (
                <p
                  id="account-2fa-error"
                  className="shc-two-factor-error"
                  role="alert"
                >
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
                    <LoaderCircle
                      className="animate-spin"
                      size={17}
                      aria-hidden="true"
                    />
                  )}
                  Xác minh mã OTP
                </button>
                <button
                  type="button"
                  className="shc-two-factor-button"
                  onClick={() => {
                    enrollmentIntentRef.current = null;
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
                  <small>
                    Danh sách này chỉ xuất hiện một lần; mỗi mã chỉ dùng được
                    một lần.
                  </small>
                </div>
              </div>
              <p className="shc-two-factor-expiry" role="note">
                2FA vẫn chưa bật. Đừng rời trang cho đến khi backend xác nhận;
                nếu phiên bị đóng, hãy bắt đầu lại an toàn để nhận bộ mã mới.
              </p>
              <div
                className="shc-two-factor-recovery"
                role="list"
                aria-label="Mã khôi phục"
              >
                {recoveryCodes.map((code) => (
                  <code role="listitem" key={code}>
                    {code}
                  </code>
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
              {recoveryDelivery && (
                <p className="shc-two-factor-expiry">
                  Có thể thử nhận lại an toàn đến{" "}
                  {new Intl.DateTimeFormat("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(recoveryDelivery.expiresAt))}
                  ; sau khi backend ghi nhận đã lưu, danh sách sẽ không được trả
                  lại.
                </p>
              )}
              <label className="shc-two-factor-acknowledge">
                <input
                  type="checkbox"
                  checked={recoveryAcknowledged}
                  onChange={(event) =>
                    setRecoveryAcknowledged(event.target.checked)
                  }
                />
                <span>Tôi đã lưu mã khôi phục ở nơi an toàn.</span>
              </label>
              {formError && (
                <p className="shc-two-factor-error" role="alert">
                  {formError}
                </p>
              )}
              <button
                type="button"
                className="shc-two-factor-button shc-two-factor-button-primary"
                disabled={
                  !recoveryAcknowledged ||
                  !recoveryDelivery ||
                  !recoveryAckToken ||
                  busy
                }
                onClick={() => acknowledgeRecoveryCodes.mutate()}
                aria-busy={acknowledgeRecoveryCodes.isPending || undefined}
              >
                {acknowledgeRecoveryCodes.isPending && (
                  <LoaderCircle
                    className="animate-spin"
                    size={17}
                    aria-hidden="true"
                  />
                )}
                Xác nhận và bật 2FA
              </button>
            </div>
          )}

          {step === "disable" && (
            <div className="shc-two-factor-step shc-two-factor-step-danger">
              <div className="shc-two-factor-step-title">
                <span>!</span>
                <div>
                  <strong>Xác nhận tắt 2FA</strong>
                  <small>
                    Nhập mã OTP hiện tại. Thao tác chỉ hoàn tất khi backend xác
                    minh thành công.
                  </small>
                </div>
              </div>
              <label
                className="shc-two-factor-field"
                htmlFor="account-2fa-disable-code"
              >
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
              {formError && (
                <p className="shc-two-factor-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="shc-two-factor-actions">
                <button
                  type="button"
                  className="shc-two-factor-button shc-two-factor-button-danger"
                  onClick={() => disableTwoFactor.mutate()}
                  disabled={busy || otp.length !== 6}
                >
                  {disableTwoFactor.isPending && (
                    <LoaderCircle
                      className="animate-spin"
                      size={17}
                      aria-hidden="true"
                    />
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
