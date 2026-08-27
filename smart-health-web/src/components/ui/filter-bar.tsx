import * as React from "react";

import { cn } from "@/lib/utils";

interface FilterBarProps extends Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  "title"
> {
  "aria-label": string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  contentClassName?: string;
}

const FilterBar = React.forwardRef<HTMLFormElement, FilterBarProps>(
  (
    { title, description, children, className, contentClassName, ...props },
    ref,
  ) => (
    <form
      ref={ref}
      data-ui="filter-bar"
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        "[&_a]:min-h-11 [&_button]:min-h-11 [&_[role=button]]:min-h-11",
        className,
      )}
      {...props}
    >
      {title || description ? (
        <div className="border-b border-border px-5 py-4">
          {title ? (
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
          ) : null}
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      <div className={cn("grid gap-3 p-5", contentClassName)}>{children}</div>
    </form>
  ),
);
FilterBar.displayName = "FilterBar";

export { FilterBar, type FilterBarProps };
