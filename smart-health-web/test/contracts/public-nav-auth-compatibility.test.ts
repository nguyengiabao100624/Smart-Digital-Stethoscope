import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const publicLayoutSource = readSource("src/app/layouts/PublicLayout.tsx");
const homePageSource = readSource("src/app/pages/public/HomePage.tsx");
const authLayoutSource = readSource("src/app/layouts/AuthLayout.tsx");
const forgotPasswordSource = readSource(
  "src/app/pages/auth/ForgotPasswordPage.tsx",
);
const loginSource = readSource("src/app/pages/auth/LoginPage.tsx");
const doctorRegistrationSource = readSource(
  "src/app/pages/auth/RegisterDoctorPage.tsx",
);
const themeSource = readSource("src/web-styles/theme.css");
const signalSource = readSource("src/web-styles/signal-horizon.css");
const polishSource = readSource("src/web-styles/clinical-polish.css");
const themeToggleSource = readSource("src/components/ThemeToggle.tsx");

test("animates the original desktop navigation without hover-locked dropdowns", () => {
  assert.match(signalSource, /transform-origin:\s*left center/);
  assert.match(
    signalSource,
    /transition:\s*transform 300ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
  );
  assert.match(signalSource, /\.shc-nav-group\.is-open > a::after/);

  assert.match(
    themeSource,
    /transform:\s*translate3d\(0, -10px, 0\) scale\(0\.98\)/,
  );
  assert.match(
    themeSource,
    /\.shc-nav-group\.is-open \.shc-dropdown\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?visibility:\s*visible;/,
  );
  assert.doesNotMatch(
    `${themeSource}\n${signalSource}`,
    /\.shc-nav-group(?::hover|:focus-within) \.shc-dropdown/,
  );

  assert.match(publicLayoutSource, /closeDesktopMenuAfterNavigation/);
  assert.match(
    publicLayoutSource,
    /setOpenDesktopGroup\(null\);\s*event\.currentTarget\.blur\(\);/,
  );
});

test("keeps mobile navigation semantic and closes it after route selection", () => {
  assert.match(
    publicLayoutSource,
    /<motion\.nav[\s\S]*?aria-label="Điều hướng di động"/,
  );
  assert.match(publicLayoutSource, /closeMobileMenuAfterNavigation/);
  assert.match(
    publicLayoutSource,
    /setMobileOpen\(false\);[\s\S]*?setOpenMobileGroup\(null\);/,
  );
  assert.match(
    publicLayoutSource,
    /onClick=\{closeMobileMenuAfterNavigation\}/,
  );
});

test("reveals content once without hiding it again after scrolling", () => {
  assert.match(publicLayoutSource, /if \(!entry\.isIntersecting\) return;/);
  assert.match(publicLayoutSource, /observer\.unobserve\(element\);/);
  assert.doesNotMatch(
    publicLayoutSource,
    /element\.dataset\.shcRevealState\s*=\s*entry\.isIntersecting\s*\?\s*"visible"\s*:\s*"pending"/,
  );
  assert.match(homePageSource, /if \(!entry\.isIntersecting\) return;/);
  assert.match(homePageSource, /observer\.unobserve\(element\);/);
  assert.doesNotMatch(
    homePageSource,
    /element\.dataset\.shcHomeRevealState\s*=\s*entry\.isIntersecting\s*\?\s*"visible"\s*:\s*"pending"/,
  );
});

test("keeps original Auth actions readable and reachable on mobile", () => {
  assert.match(
    authLayoutSource,
    /className="app-shell auth-shell shc-auth-layout"/,
  );
  assert.match(authLayoutSource, /data-shcare-auth-visual="live-legacy"/);
  assert.match(authLayoutSource, /shcare-horizontal\.svg/);
  assert.doesNotMatch(authLayoutSource, /shc-auth-canonical/);
  assert.match(forgotPasswordSource, /shc-auth-page-forgot/);
  assert.match(loginSource, /shc-auth-legacy-intro/);
  assert.match(doctorRegistrationSource, /createRoleRequestIdempotencyKey/);
  assert.match(
    polishSource,
    /data-shcare-auth-visual="live-legacy"[\s\S]*?\.shc-auth-page-forgot[\s\S]*?\.shc-auth-primary-button[\s\S]*?background-color:\s*#2457d6;[\s\S]*?background-image:\s*none;[\s\S]*?color:\s*#ffffff;/,
  );
  assert.match(
    polishSource,
    /@media \(max-width: 1023px\)[\s\S]*?\.shc-auth-layout:not\(\.shc-auth-canonical\)[\s\S]*?\.shc-auth-form-scroll[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/,
  );
  assert.match(
    polishSource,
    /data-shcare-auth-visual="live-legacy"[\s\S]*?\.shc-auth-back\s*\{[^}]*min-height:\s*2\.75rem/,
  );
  assert.match(
    polishSource,
    /data-shcare-auth-visual="live-legacy"[\s\S]*?\.shc-auth-preview-card\s*\{[^}]*backdrop-filter:\s*none;[^}]*-webkit-backdrop-filter:\s*none;/,
  );
});

test("exposes light, dark and system theme preferences", () => {
  assert.match(themeToggleSource, /system:\s*"Theo hệ thống"/);
  assert.match(themeToggleSource, /light:\s*"Sáng"/);
  assert.match(themeToggleSource, /dark:\s*"Tối"/);
  assert.match(themeToggleSource, /data-theme-preference=\{preference\}/);
});
