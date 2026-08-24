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

export const SHCARE_THEME_CHANGE_EVENT = "shcare:theme-preference-change";

type ThemeToggleProps = {
  variant?: "floating" | "menu";
};

export function ThemeToggle({ variant = "floating" }: ThemeToggleProps) {
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
    const handleSameTabChange = (event: Event) => {
      const nextPreference = (event as CustomEvent<string>).detail;
      setPreference(normalizeThemePreference(nextPreference));
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(SHCARE_THEME_CHANGE_EVENT, handleSameTabChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SHCARE_THEME_CHANGE_EVENT, handleSameTabChange);
    };
  }, []);

  if (!mounted) return null;

  const nextPreference = nextThemePreference(preference);
  const label = `Giao diện: ${preferenceLabels[preference]}. Chuyển sang ${preferenceLabels[nextPreference]}.`;
  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  const handlePreferenceChange = () => {
    setPreference(nextPreference);
    window.dispatchEvent(
      new CustomEvent(SHCARE_THEME_CHANGE_EVENT, {
        detail: nextPreference,
      }),
    );
  };

  return (
    <button
      type="button"
      onClick={handlePreferenceChange}
      aria-label={label}
      title={label}
      data-theme-preference={preference}
      data-theme-variant={variant}
      className={
        variant === "menu"
          ? "theme-toggle clinical-theme-action"
          : "theme-toggle fixed bottom-5 right-5 z-[100] inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-[transform,border-color] duration-200 hover:scale-105 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      }
    >
      <Icon size={19} aria-hidden="true" />
      {variant === "menu" ? (
        <span>Giao diện: {preferenceLabels[preference]}</span>
      ) : null}
    </button>
  );
}

export default ThemeToggle;
