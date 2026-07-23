import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "./ui/button";

export function PortalLoading({
  label = "Đang tải dữ liệu...",
}: {
  label?: string;
}) {
  return (
    <div
      className="portal-state portal-state-loading flex min-h-32 items-center justify-center gap-3 rounded-xl border bg-card p-8 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2
        aria-hidden="true"
        className="size-5 animate-spin text-primary motion-reduce:animate-none"
      />
      {label}
    </div>
  );
}

export function PortalError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div
      className="portal-state portal-state-error flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-foreground"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
      <span className="flex-1">
        {error instanceof Error ? error.message : "Không thể tải dữ liệu."}
      </span>
      {retry && (
        <Button
          type="button"
          variant="outline"
          onClick={retry}
          className="h-11"
        >
          Thử lại
        </Button>
      )}
    </div>
  );
}

export function PortalEmpty({ label }: { label: string }) {
  return (
    <div className="portal-state portal-state-empty rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
