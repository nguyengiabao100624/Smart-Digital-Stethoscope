import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import {
  applyThemePreference,
  nextThemePreference,
  normalizeThemePreference,
  persistThemePreference,
  readThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../lib/theme";

export { THEME_STORAGE_KEY } from "../lib/theme";

const preferenceLabels: Record<ThemePreference, string> = {
  system: "Theo hệ thống",
  light: "Sáng",
  dark: "Tối",
};

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPreference(readThemePreference(window.localStorage));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyThemePreference(preference, document.documentElement, media.matches);
    persistThemePreference(window.localStorage, preference);

    if (preference !== "system") return;
    const handleSystemTheme = (event: MediaQueryListEvent) => {
      applyThemePreference("system", document.documentElement, event.matches);
    };
    media.addEventListener("change", handleSystemTheme);
    return () => media.removeEventListener("change", handleSystemTheme);
  }, [mounted, preference]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      setPreference(normalizeThemePreference(event.newValue));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  if (!mounted) return null;

  const nextPreference = nextThemePreference(preference);
  const label = `Giao diện: ${preferenceLabels[preference]}. Chuyển sang ${preferenceLabels[nextPreference]}.`;
  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => setPreference(nextPreference)}
      aria-label={label}
      title={label}
      data-theme-preference={preference}
      className="theme-toggle fixed bottom-5 right-5 z-[100] inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-[transform,border-color] duration-200 hover:scale-105 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <Icon size={19} aria-hidden="true" />
    </button>
  );
}

export default ThemeToggle;
