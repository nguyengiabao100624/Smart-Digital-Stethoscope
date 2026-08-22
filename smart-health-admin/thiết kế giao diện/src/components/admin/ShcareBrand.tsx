import { cn } from "@/lib/utils";
import { IS_PORTAL_SURFACE } from "@/lib/surface";

import symbolUrl from "../../../../../packages/shcare-brand/assets/shcare-symbol.svg";

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

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        centered && "flex-col justify-center gap-2 text-center",
        className,
      )}
      role="img"
      aria-label={`Shcare — ${surfaceLabel}`}
    >
      <img
        src={symbolUrl}
        alt=""
        aria-hidden="true"
        className={cn("h-9 w-9 shrink-0", centered && "h-14 w-14")}
      />
      {!compact ? (
        <span className={cn("min-w-0", centered ? "" : "leading-tight")}>
          <span className="block font-brand text-lg font-bold tracking-tight text-foreground">
            Shcare
          </span>
          <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {surfaceLabel}
          </span>
        </span>
      ) : null}
    </div>
  );
}
