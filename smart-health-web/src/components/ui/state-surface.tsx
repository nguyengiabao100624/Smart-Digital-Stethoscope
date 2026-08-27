import * as React from "react";
import { AlertCircle, LockKeyhole, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  rows?: number;
}

function LoadingState({
  label = "Đang tải dữ liệu...",
  rows = 3,
  className,
  ...props
}: LoadingStateProps) {
  const safeRows = Math.min(8, Math.max(1, rows));

  return (
    <div
      data-ui="state-surface"
      data-state="loading"
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(
        "space-y-3 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: safeRows }, (_, index) => (
        <Skeleton
          key={index}
          className="h-12 w-full motion-reduce:animate-none"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-ui="state-surface"
      data-state="empty"
      role="status"
      className={cn(
        "rounded-xl border border-border bg-card p-10 text-center text-card-foreground shadow-sm",
        "[&_a]:min-h-11 [&_button]:min-h-11",
        className,
      )}
      {...props}
    >
      <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon || <SearchX aria-hidden="true" className="size-5" />}
      </span>
      <h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mx-auto mt-1 max-w-[60ch] text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  error?: unknown;
  description?: React.ReactNode;
  retry?: () => void;
  retryLabel?: string;
}

function ErrorState({
  title = "Không thể tải dữ liệu",
  error,
  description,
  retry,
  retryLabel = "Thử lại",
  className,
  ...props
}: ErrorStateProps) {
  const errorMessage =
    error instanceof Error
      ? error.message
      : description || "Yêu cầu backend thất bại.";

  return (
    <div
      data-ui="state-surface"
      data-state="error"
      role="alert"
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-5 text-card-foreground shadow-sm",
        "[&_a]:min-h-11 [&_button]:min-h-11",
        className,
      )}
      {...props}
    >
      <AlertCircle
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-[var(--status-danger-fg)]"
      />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-[70ch] text-sm text-[var(--status-danger-fg)]">
          {errorMessage}
        </p>
      </div>
      {retry ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={retry}
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

interface PermissionStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

function PermissionState({
  title = "Bạn chưa có quyền truy cập",
  description = "Hãy liên hệ quản trị viên workspace nếu bạn cần thực hiện thao tác này.",
  action,
  className,
  ...props
}: PermissionStateProps) {
  return (
    <div
      data-ui="state-surface"
      data-state="permission"
      role="alert"
      className={cn(
        "rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-6 text-center text-card-foreground shadow-sm",
        "[&_a]:min-h-11 [&_button]:min-h-11",
        className,
      )}
      {...props}
    >
      <LockKeyhole
        aria-hidden="true"
        className="mx-auto size-6 text-[var(--status-warning-fg)]"
      />
      <h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-[60ch] text-sm text-[var(--status-warning-fg)]">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionState,
  type EmptyStateProps,
  type ErrorStateProps,
  type LoadingStateProps,
  type PermissionStateProps,
};
