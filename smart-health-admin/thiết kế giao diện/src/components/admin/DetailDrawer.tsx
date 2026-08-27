"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

type DetailDrawerProps = React.PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  className?: string;
}>;

const returnFocusSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[role="button"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getReturnFocusTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const candidate = target.closest<HTMLElement>(returnFocusSelector);
  return candidate?.isConnected ? candidate : null;
}

function DetailDrawer({ open, onOpenChange, title, className, children }: DetailDrawerProps) {
  const shouldReduceMotion = useReducedMotion();
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) return;

    const rememberReturnFocus = (event: Event) => {
      const candidate = getReturnFocusTarget(event.target);
      if (candidate) returnFocusRef.current = candidate;
    };

    document.addEventListener("focusin", rememberReturnFocus, true);
    document.addEventListener("pointerdown", rememberReturnFocus, true);
    return () => {
      document.removeEventListener("focusin", rememberReturnFocus, true);
      document.removeEventListener("pointerdown", rememberReturnFocus, true);
    };
  }, [open]);

  return (
    <DialogPrimitive.Root modal open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-slate-950/40",
            !shouldReduceMotion &&
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:duration-150 data-[state=open]:duration-200",
          )}
        />
        <DialogPrimitive.Content
          role="dialog"
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            if (!returnFocusRef.current?.isConnected) {
              returnFocusRef.current = getReturnFocusTarget(document.activeElement);
            }
          }}
          onCloseAutoFocus={(event) => {
            const returnTarget = returnFocusRef.current;
            returnFocusRef.current = null;
            if (returnTarget?.isConnected) {
              event.preventDefault();
              returnTarget.focus();
            }
          }}
          className={cn(
            "fixed right-0 top-0 z-50 flex h-dvh w-full max-w-[520px] flex-col border-l border-border bg-card shadow-2xl focus:outline-none",
            !shouldReduceMotion &&
              "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:duration-150 data-[state=open]:duration-[220ms]",
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function DetailDrawerTitle({ className, ...props }: React.ComponentPropsWithoutRef<"h2">) {
  return <h2 className={cn("text-lg font-semibold text-foreground", className)} {...props} />;
}

function DetailDrawerDescription({ className, ...props }: React.ComponentPropsWithoutRef<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function DetailDrawerClose({ label, className }: { label: string; className?: string }) {
  return (
    <DialogPrimitive.Close asChild>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
    </DialogPrimitive.Close>
  );
}

export { DetailDrawer, DetailDrawerClose, DetailDrawerDescription, DetailDrawerTitle };
