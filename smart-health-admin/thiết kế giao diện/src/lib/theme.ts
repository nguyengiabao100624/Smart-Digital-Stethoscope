export const THEME_STORAGE_KEY = "shcare-theme";
export const LEGACY_THEME_STORAGE_KEY = "lovable-theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : "system";
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  return preference === "system" ? (prefersDark ? "dark" : "light") : preference;
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  if (preference === "system") return "light";
  if (preference === "light") return "dark";
  return "system";
}

export function readThemePreference(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  try {
    const current = storage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(current)) return current;

    const legacy = storage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (legacy === "light" || legacy === "dark") {
      storage.setItem(THEME_STORAGE_KEY, legacy);
      storage.removeItem(LEGACY_THEME_STORAGE_KEY);
      return legacy;
    }
  } catch {
    // Privacy-restricted contexts still receive the system-resolved theme.
  }
  return "system";
}

export function persistThemePreference(
  storage: Pick<Storage, "setItem" | "removeItem">,
  preference: ThemePreference,
) {
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
    storage.removeItem(LEGACY_THEME_STORAGE_KEY);
  } catch {
    // The active document can still apply the preference without persistence.
  }
}

export function applyThemePreference(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
  prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
) {
  const resolvedTheme = resolveTheme(preference, prefersDark);
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.classList.toggle("light", resolvedTheme === "light");
  root.dataset.theme = preference;
  root.dataset.resolvedTheme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
  return resolvedTheme;
}

export const THEME_INIT_SCRIPT = `(function(){
  try {
    var storageKey = "shcare-theme";
    var legacyKey = "lovable-theme";
    var preference = localStorage.getItem(storageKey);
    if (preference !== "light" && preference !== "dark" && preference !== "system") {
      var legacyPreference = localStorage.getItem(legacyKey);
      preference = legacyPreference === "light" || legacyPreference === "dark"
        ? legacyPreference
        : "system";
    }
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolvedTheme = preference === "system"
      ? (prefersDark ? "dark" : "light")
      : preference;
    var root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.classList.toggle("light", resolvedTheme === "light");
    root.dataset.theme = preference;
    root.dataset.resolvedTheme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
    localStorage.setItem(storageKey, preference);
    localStorage.removeItem(legacyKey);
  } catch (error) {
    var fallbackDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var fallbackRoot = document.documentElement;
    fallbackRoot.classList.toggle("dark", fallbackDark);
    fallbackRoot.classList.toggle("light", !fallbackDark);
    fallbackRoot.dataset.theme = "system";
    fallbackRoot.dataset.resolvedTheme = fallbackDark ? "dark" : "light";
    fallbackRoot.style.colorScheme = fallbackDark ? "dark" : "light";
  }
})();`;
