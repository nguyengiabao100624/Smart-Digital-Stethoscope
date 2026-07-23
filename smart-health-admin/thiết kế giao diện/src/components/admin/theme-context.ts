import { createContext, useContext } from "react";

import type { ResolvedTheme, ThemePreference } from "@/lib/theme";

export interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useAdminTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAdminTheme must be used within ThemeProvider");
  }
  return context;
}
