import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { nextThemePreference, type ThemePreference } from "@/lib/theme";
import { useAdminTheme } from "./theme-context";

const preferenceLabels: Record<ThemePreference, string> = {
  system: "Theo hệ thống",
  light: "Sáng",
  dark: "Tối",
};

export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useAdminTheme();
  const nextPreference = nextThemePreference(preference);
  const label = `Giao diện: ${preferenceLabels[preference]}. Chuyển sang ${preferenceLabels[nextPreference]}.`;
  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setPreference(nextPreference)}
      aria-label={label}
      title={label}
      data-testid="admin-theme-toggle"
      data-theme-preference={preference}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
