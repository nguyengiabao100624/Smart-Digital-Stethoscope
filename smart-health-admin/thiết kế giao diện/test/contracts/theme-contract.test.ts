import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  THEME_INIT_SCRIPT,
  nextThemePreference,
  normalizeThemePreference,
  resolveTheme,
} from "../../src/lib/theme.ts";

const rootPath = new URL("../../src/routes/__root.tsx", import.meta.url);
const providerPath = new URL("../../src/components/admin/ThemeProvider.tsx", import.meta.url);
const togglePath = new URL("../../src/components/admin/ThemeToggle.tsx", import.meta.url);
const layoutPath = new URL("../../src/components/admin/Layout.tsx", import.meta.url);
const loginPath = new URL("../../src/components/admin/Login.tsx", import.meta.url);
const forgotPasswordPath = new URL(
  "../../src/components/admin/ForgotPassword.tsx",
  import.meta.url,
);
const stylesPath = new URL("../../src/styles.css", import.meta.url);
const viteConfigPath = new URL("../../vite.config.ts", import.meta.url);
const designSystemPath = new URL("../../src/components/admin/design-system.tsx", import.meta.url);

test("normalizes, resolves, and cycles every supported Admin theme preference", () => {
  assert.equal(normalizeThemePreference(null), "system");
  assert.equal(normalizeThemePreference("unknown"), "system");
  assert.equal(normalizeThemePreference("light"), "light");
  assert.equal(normalizeThemePreference("dark"), "dark");
  assert.equal(normalizeThemePreference("system"), "system");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(nextThemePreference("system"), "light");
  assert.equal(nextThemePreference("light"), "dark");
  assert.equal(nextThemePreference("dark"), "system");
});

test("pre-paint bootstrap preserves system preference and resolved theme", () => {
  assert.match(THEME_INIT_SCRIPT, /prefers-color-scheme:\s*dark/);
  assert.match(THEME_INIT_SCRIPT, /shcare-theme/);
  assert.match(THEME_INIT_SCRIPT, /lovable-theme/);
  assert.match(THEME_INIT_SCRIPT, /dataset\.theme = preference/);
  assert.match(THEME_INIT_SCRIPT, /dataset\.resolvedTheme = resolvedTheme/);
  assert.match(THEME_INIT_SCRIPT, /colorScheme = resolvedTheme/);
  assert.match(THEME_INIT_SCRIPT, /localStorage\.setItem\(storageKey, preference\)/);
});

test("root mounts theme before paint and gives the toaster the resolved theme", async () => {
  const source = await readFile(rootPath, "utf8");

  assert.match(source, /suppressHydrationWarning/);
  assert.match(source, /dangerouslySetInnerHTML=\{\{ __html: THEME_INIT_SCRIPT \}\}/);
  assert.match(source, /<ThemeProvider>/);
  assert.match(source, /theme=\{resolvedTheme\}/);
  assert.match(source, /<MotionConfig reducedMotion="user">/);
});

test("provider follows system changes and synchronizes the saved preference across tabs", async () => {
  const source = await readFile(providerPath, "utf8");

  assert.match(source, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(source, /media\.addEventListener\("change", handleSystemTheme\)/);
  assert.match(source, /window\.addEventListener\("storage", handleStorage\)/);
  assert.match(source, /persistThemePreference\(window\.localStorage, preference\)/);
});

test("Admin and auth surfaces expose an accessible 44px theme control", async () => {
  const [toggle, layout, login, forgotPassword] = await Promise.all([
    readFile(togglePath, "utf8"),
    readFile(layoutPath, "utf8"),
    readFile(loginPath, "utf8"),
    readFile(forgotPasswordPath, "utf8"),
  ]);

  assert.match(toggle, /aria-label=\{label\}/);
  assert.match(toggle, /h-11 w-11/);
  assert.match(toggle, /data-theme-preference=\{preference\}/);
  assert.match(layout, /<ThemeToggle \/>/);
  assert.match(login, /<ThemeToggle className="absolute right-4 top-4" \/>/);
  assert.match(forgotPassword, /<ThemeToggle className="absolute right-4 top-4" \/>/);
});

test("Admin semantic colors and typography derive from the shared Shcare brand", async () => {
  const source = await readFile(stylesPath, "utf8");

  assert.match(source, /--background: var\(--shcare-background\)/);
  assert.match(source, /--card: var\(--shcare-surface\)/);
  assert.match(source, /--primary: var\(--shcare-color-primary\)/);
  assert.match(source, /--border: var\(--shcare-border\)/);
  assert.match(source, /var\(--shcare-font-product, "Source Sans 3"\)/);
  assert.doesNotMatch(source, /oklch\(/);
  assert.doesNotMatch(source, /\.data-table th\s*\{[\s\S]*?background:\s*#f8fafc/);
});

test("local browser QA can load shared fonts and reduced motion removes choreography", async () => {
  const [viteConfig, layout, designSystem, styles] = await Promise.all([
    readFile(viteConfigPath, "utf8"),
    readFile(layoutPath, "utf8"),
    readFile(designSystemPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(viteConfig, /sharedPackagesRoot/);
  assert.match(viteConfig, /allow:\s*\[projectRoot, sharedPackagesRoot\]/);
  assert.match(layout, /useReducedMotion\(\)/);
  assert.match(layout, /initial=\{shouldReduceMotion \? false/);
  assert.match(designSystem, /useReducedMotion\(\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(styles, /health-pulse|float-soft|scan-sheen/);
});
