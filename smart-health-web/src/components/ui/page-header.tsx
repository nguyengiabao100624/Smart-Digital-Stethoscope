import * as React from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  "title"
> {
  title: React.ReactNode;
  description?: React.ReactNode;
  kicker?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  titleId?: string;
}

const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  (
    { title, description, kicker, icon, actions, titleId, className, ...props },
    ref,
  ) => {
    const generatedTitleId = React.useId();
    const resolvedTitleId = titleId || generatedTitleId;

    return (
      <header
        ref={ref}
        data-ui="page-header"
        aria-labelledby={resolvedTitleId}
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
          "[&_a]:min-h-11 [&_button]:min-h-11",
          className,
        )}
        {...props}
      >
        <div className="min-w-0">
          {kicker ? (
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
              {icon}
              <span>{kicker}</span>
            </div>
          ) : null}
          <h1
            id={resolvedTitleId}
            className={cn(
              "text-2xl font-bold tracking-[-0.02em] text-foreground",
              !kicker && icon ? "flex items-center gap-2" : undefined,
            )}
          >
            {!kicker ? icon : null}
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </header>
    );
  },
);
PageHeader.displayName = "PageHeader";

export { PageHeader, type PageHeaderProps };
