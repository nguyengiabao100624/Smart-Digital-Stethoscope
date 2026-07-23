import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  applyThemePreference,
  normalizeThemePreference,
  persistThemePreference,
  readThemePreference,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";
import { ThemeContext } from "./theme-context";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedPreference = readThemePreference(window.localStorage);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setPreferenceState(savedPreference);
    setResolvedTheme(applyThemePreference(savedPreference, document.documentElement, prefersDark));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setResolvedTheme(applyThemePreference(preference, document.documentElement, media.matches));
    persistThemePreference(window.localStorage, preference);

    if (preference !== "system") return;
    const handleSystemTheme = (event: MediaQueryListEvent) => {
      setResolvedTheme(applyThemePreference("system", document.documentElement, event.matches));
    };
    media.addEventListener("change", handleSystemTheme);
    return () => media.removeEventListener("change", handleSystemTheme);
  }, [mounted, preference]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      setPreferenceState(normalizeThemePreference(event.newValue));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(normalizeThemePreference(nextPreference));
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
