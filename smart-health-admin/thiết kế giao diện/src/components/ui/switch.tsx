import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "group peer relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center rounded-full bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={ref}
  >
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-1/2 h-6 w-11 -translate-y-1/2 rounded-full border border-border bg-muted shadow-inner transition-colors duration-200 group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:shadow-primary/20 motion-reduce:transition-none"
    />
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none absolute left-0.5 top-1/2 block h-5 w-5 -translate-y-1/2 rounded-full border border-white/80 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.25)] ring-0 transition-transform duration-200 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 motion-reduce:transition-none",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
