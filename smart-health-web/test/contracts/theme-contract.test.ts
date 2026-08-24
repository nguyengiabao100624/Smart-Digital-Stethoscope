import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  THEME_INIT_SCRIPT,
  nextThemePreference,
  normalizeThemePreference,
  resolveTheme,
} from "../../src/lib/theme.ts";

test("defaults invalid and missing preferences to system", () => {
  assert.equal(normalizeThemePreference(null), "system");
  assert.equal(normalizeThemePreference(""), "system");
  assert.equal(normalizeThemePreference("unknown"), "system");
  assert.equal(normalizeThemePreference("light"), "light");
  assert.equal(normalizeThemePreference("dark"), "dark");
  assert.equal(normalizeThemePreference("system"), "system");
});

test("resolves system preference without changing the saved preference", () => {
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("cycles through all three user choices", () => {
  assert.equal(nextThemePreference("system"), "light");
  assert.equal(nextThemePreference("light"), "dark");
  assert.equal(nextThemePreference("dark"), "system");
});

test("pre-paint script follows system, migrates legacy storage and prevents flash", () => {
  assert.match(THEME_INIT_SCRIPT, /prefers-color-scheme:\s*dark/);
  assert.match(THEME_INIT_SCRIPT, /shcare-theme/);
  assert.match(THEME_INIT_SCRIPT, /lovable-theme/);
  assert.match(THEME_INIT_SCRIPT, /resolvedTheme/);
  assert.match(THEME_INIT_SCRIPT, /colorScheme/);
});

test("HTML pre-paint bootstrap preserves the system preference and resolved theme", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.match(html, /prefers-color-scheme:\s*dark/);
  assert.match(html, /dataset\.theme\s*=\s*preference/);
  assert.match(html, /dataset\.resolvedTheme\s*=\s*resolvedTheme/);
  assert.match(html, /localStorage\.setItem\(storageKey, preference\)/);
  assert.doesNotMatch(html, /localStorage\.setItem\(["']shcare-theme["'], selected\)/);
});

test("application toaster follows the resolved document theme", () => {
  const app = readFileSync(
    new URL("../../src/app/App.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /dataset\.resolvedTheme\s*===\s*["']dark["']/);
  assert.match(app, /attributeFilter:\s*\[["']data-resolved-theme["']\]/);
  assert.match(app, /<Toaster\s+theme=\{toasterTheme\}/);
});
