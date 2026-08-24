import { cn } from "@/lib/utils";
import { IS_PORTAL_SURFACE } from "@/lib/surface";
import { Stethoscope } from "lucide-react";

export function ShcareBrand({
  compact = false,
  centered = false,
  className,
}: {
  compact?: boolean;
  centered?: boolean;
  className?: string;
}) {
  const surfaceLabel = IS_PORTAL_SURFACE ? "Workspace Portal" : "Platform Admin";
  const legacyBrandLabel = IS_PORTAL_SURFACE ? "Shcare Portal" : "Smart Health";

  if (compact && centered) {
    return (
      <div
        className={cn(
          "float-soft flex h-16 w-16 items-center justify-center rounded-full bg-primary/10",
          className,
        )}
        role="img"
        aria-label={`${legacyBrandLabel} — ${surfaceLabel}`}
      >
        <Stethoscope className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (compact) {
    return (
      <Stethoscope
        className={cn("h-6 w-6 text-primary", className)}
        role="img"
        aria-label={`${legacyBrandLabel} — ${surfaceLabel}`}
      />
    );
  }

  return (
    <div
      className={cn("flex min-w-0 items-center gap-3 text-lg font-bold text-primary", className)}
      role="img"
      aria-label={`${legacyBrandLabel} — ${surfaceLabel}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Stethoscope className="h-5 w-5" aria-hidden="true" />
      </span>
      <span>{legacyBrandLabel}</span>
    </div>
  );
}
