import {
  cloneElement,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  useBeforeUnload,
  useBlocker,
  type BlockerFunction,
} from "react-router";

type ControlProps = {
  id?: string;
  name?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
};

export function AuthPageIntro({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <header className="shc-auth-page-intro">
      <span className="shc-auth-page-icon" aria-hidden="true">
        <Icon size={24} />
      </span>
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}

export function AuthField({
  id,
  label,
  hint,
  error,
  required,
  action,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  action?: ReactNode;
  children: ReactElement<ControlProps>;
}) {
  const descriptionIds = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="shc-auth-field" data-invalid={error ? "true" : undefined}>
      <div className="shc-auth-label-row">
        <div className="shc-auth-label">
          <label htmlFor={id}>{label}</label>
          {required ? <span aria-hidden="true">*</span> : null}
        </div>
        {action}
      </div>
      {cloneElement(children, {
        id,
        name: children.props.name || id,
        className: `shc-auth-control ${children.props.className || ""}`.trim(),
        "aria-invalid": Boolean(error),
        "aria-describedby": descriptionIds || undefined,
        "aria-required": required || undefined,
      })}
      {hint ? (
        <p id={`${id}-hint`} className="shc-auth-field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="shc-auth-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const alertIcons = {
  error: AlertCircle,
  warning: TriangleAlert,
  success: CheckCircle2,
  info: Info,
} satisfies Record<string, LucideIcon>;

export function AuthAlert({
  tone = "info",
  title,
  children,
  id,
}: {
  tone?: keyof typeof alertIcons;
  title?: string;
  children: ReactNode;
  id?: string;
}) {
  const Icon = alertIcons[tone];
  return (
    <div
      id={id}
      className="shc-auth-alert"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
    >
      <Icon size={18} aria-hidden="true" />
      <div>
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function AuthPrimaryButton({
  loading,
  loadingLabel = "Đang xử lý...",
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`shc-auth-primary-button ${className}`.trim()}
    >
      {loading ? (
        <Loader2 size={18} className="shc-auth-spinner" aria-hidden="true" />
      ) : null}
      {loading ? <span>{loadingLabel}</span> : children}
    </button>
  );
}

export const AuthSecondaryButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(({ children, className = "", ...props }, ref) => (
  <button
    ref={ref}
    {...props}
    className={`shc-auth-secondary-button ${className}`.trim()}
  >
    {children}
  </button>
));

AuthSecondaryButton.displayName = "AuthSecondaryButton";

export function AuthStepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <nav className="shc-auth-progress" aria-label="Tiến trình đăng ký">
      <p>
        Bước {current + 1} / {steps.length}: <strong>{steps[current]}</strong>
      </p>
      <ol>
        {steps.map((label, index) => (
          <li
            key={label}
            data-state={
              index < current
                ? "complete"
                : index === current
                  ? "current"
                  : "upcoming"
            }
            aria-current={index === current ? "step" : undefined}
          >
            <span aria-hidden="true">{index < current ? "✓" : index + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AuthSubmissionStatus({ label }: { label: string }) {
  return (
    <div
      className="shc-auth-submission-status"
      role="status"
      aria-live="polite"
    >
      <Loader2 size={17} className="shc-auth-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function AuthUnsavedChangesGuard({ when }: { when: boolean }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        when && currentLocation.pathname !== nextLocation.pathname,
      [when],
    ),
  );

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!when) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [when],
    ),
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") blocker.reset();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [blocker]);

  if (blocker.state !== "blocked") return null;

  return (
    <div className="shc-auth-guard-backdrop" role="presentation">
      <section
        className="shc-auth-guard-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="auth-unsaved-title"
        aria-describedby="auth-unsaved-description"
      >
        <span className="shc-auth-guard-icon" aria-hidden="true">
          <TriangleAlert size={22} />
        </span>
        <h2 id="auth-unsaved-title">Bạn chưa gửi hồ sơ</h2>
        <p id="auth-unsaved-description">
          Thông tin đang nhập sẽ mất nếu bạn rời trang này.
        </p>
        <div className="shc-auth-guard-actions">
          <AuthSecondaryButton
            ref={cancelRef}
            type="button"
            onClick={() => blocker.reset()}
          >
            Tiếp tục chỉnh sửa
          </AuthSecondaryButton>
          <button
            type="button"
            className="shc-auth-danger-button"
            onClick={() => blocker.proceed()}
          >
            Rời trang
          </button>
        </div>
      </section>
    </div>
  );
}
