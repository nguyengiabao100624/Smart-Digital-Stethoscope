import * as React from "react";

import { cn } from "@/lib/utils";

interface DataTableShellProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  viewportClassName?: string;
}

const DataTableShell = React.forwardRef<HTMLDivElement, DataTableShellProps>(
  ({ label, className, viewportClassName, children, ...props }, ref) => (
    <div
      ref={ref}
      data-ui="data-table-shell"
      className={cn(
        "max-w-full overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        "[&_a]:min-h-11 [&_button]:min-h-11",
        className,
      )}
      {...props}
    >
      <div
        role="region"
        aria-label={label}
        data-responsive="horizontal-scroll"
        tabIndex={0}
        className={cn(
          "max-w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          "[&>div]:overflow-visible",
          viewportClassName,
        )}
      >
        {children}
      </div>
    </div>
  ),
);
DataTableShell.displayName = "DataTableShell";

export { DataTableShell, type DataTableShellProps };
