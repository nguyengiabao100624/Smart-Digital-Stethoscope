import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const webRoot = new URL("../../", import.meta.url);
const layoutSource = readFileSync(
  new URL("src/app/layouts/PublicLayout.tsx", webRoot),
  "utf8",
);
const homeSource = readFileSync(
  new URL("src/app/pages/public/HomePage.tsx", webRoot),
  "utf8",
);
const notFoundSource = readFileSync(
  new URL("src/app/pages/public/NotFoundPage.tsx", webRoot),
  "utf8",
);
const routesSource = readFileSync(
  new URL("src/app/routes.tsx", webRoot),
  "utf8",
);
const clinicalPolishSource = readFileSync(
  new URL("src/web-styles/clinical-polish.css", webRoot),
  "utf8",
);
const signalHorizonSource = readFileSync(
  new URL("src/web-styles/signal-horizon.css", webRoot),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(new URL("package.json", webRoot), "utf8"),
) as { scripts?: Record<string, string> };
const publicPageDirectory = new URL("src/app/pages/public/", webRoot);
const publicPageSources = readdirSync(publicPageDirectory)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => ({
    name,
    source: readFileSync(new URL(name, publicPageDirectory), "utf8"),
  }));

test("publishes a RouteContract-driven browser sweep for every Public route", () => {
  const smokeSource = readFileSync(
    new URL("scripts/publicUiFoundationBrowserSmokeTest.mjs", webRoot),
    "utf8",
  );

  assert.equal(
    packageJson.scripts?.["smoke:public-ui-foundation"],
    "node scripts/publicUiFoundationBrowserSmokeTest.mjs",
  );
  assert.match(smokeSource, /import\s+\{\s*routeContracts\s*\}/);
  assert.match(smokeSource, /route\.surface\s*===\s*"public"/);
  assert.match(smokeSource, /public\.not-found\.catch-all/);
  for (const width of [360, 390, 768, 1024, 1440]) {
    assert.match(smokeSource, new RegExp(`width:\\s*${width}\\b`));
  }
  for (const preference of ["light", "dark", "system"]) {
    assert.match(smokeSource, new RegExp(`preference:\\s*"${preference}"`));
  }
});

test("keeps Public production markup free of the retired demo-style classes", () => {
  const retired =
    /glass-panel|premium-button|premium-card|navy-card|brand-gradient-text|hero-gradient-text|vietnamese-gradient-text|medical-grid|blur-3xl|bg-gradient|radial-gradient|linear-gradient|boxShadow|drop-shadow|#(?:00FFD1|0B5C9A|4AA4E0|7257E8|eefbff|8aa5ba)/i;

  for (const page of publicPageSources) {
    assert.doesNotMatch(page.source, retired, page.name);
    assert.doesNotMatch(
      page.source,
      /1800\s*1234|18001234|href=["']tel:1800/i,
      `${page.name} contains an unverified support number`,
    );
  }
});

test("uses purposeful bounded Public motion without glass or looping hero media", () => {
  assert.doesNotMatch(layoutSource, /backdropFilter|WebkitBackdropFilter/);
  assert.doesNotMatch(
    layoutSource,
    /entry\.isIntersecting\s*\?\s*"visible"\s*:\s*"pending"/,
  );
  assert.match(layoutSource, /index\s*%\s*4/);
  assert.match(layoutSource, /systemReducedMotion/);

  assert.doesNotMatch(
    homeSource,
    /backdropFilter|WebkitBackdropFilter|<video\b|autoPlay|\bloop\b/,
  );
  assert.doesNotMatch(homeSource, /\bHeartPulse\b/);
});

test("keeps Public section eyebrows semantic and contrast-token driven", () => {
  assert.equal(
    homeSource.match(/<span className="shc-section-eyebrow">/g)?.length,
    4,
  );
  assert.match(
    clinicalPolishSource,
    /--shc-public-eyebrow:\s*var\(--clinical-teal\);/,
  );

  const eyebrowRule = clinicalPolishSource.match(
    /\.shc-public-layout\[data-shcare-public-foundation="v1"\] \.shc-section-eyebrow\s*\{([^}]*)\}/,
  );
  assert.ok(eyebrowRule, "canonical Public eyebrow rule is missing");
  assert.match(eyebrowRule[1], /color:\s*var\(--shc-public-eyebrow\);/);
  assert.doesNotMatch(eyebrowRule[1], /!important/);

  const announcementAction = clinicalPolishSource.match(
    /\.shc-public-layout\[data-shcare-public-foundation="v1"\] \.shc-announcement a\s*\{([^}]*)\}/,
  );
  assert.ok(announcementAction, "Public announcement action rule is missing");
  assert.match(announcementAction[1], /min-height:\s*2\.75rem;/);
  assert.doesNotMatch(announcementAction[1], /!important/);
});

test("keeps the Public entry free of the motion runtime while preserving bounded reveals", () => {
  for (const [name, source] of [
    ["PublicLayout", layoutSource],
    ["HomePage", homeSource],
  ] as const) {
    assert.doesNotMatch(
      source,
      /motion\/react|AnimatePresence|<motion\./,
      name,
    );
  }

  assert.match(homeSource, /"data-shc-reveal":\s*direction/);
  assert.match(homeSource, /"data-shc-reveal-state":\s*"pending"/);
  assert.match(homeSource, /Math\.min\(Math\.max\(delaySeconds, 0\), 0\.24\)/);
  assert.match(layoutSource, /const authoredTargets\s*=/);
  assert.match(layoutSource, /dataset\.shcRevealAuto\s*=\s*"true"/);
  assert.match(layoutSource, /observer\.unobserve\(element\)/);

  assert.match(
    clinicalPolishSource,
    /transition-property:\s*opacity, transform;/,
  );
  assert.match(clinicalPolishSource, /transition-duration:\s*420ms;/);
  assert.doesNotMatch(clinicalPolishSource, /!important/);
  assert.match(clinicalPolishSource, /shc-mobile-menu-enter 320ms/);
  assert.match(clinicalPolishSource, /shc-mobile-submenu-enter 300ms/);
  assert.match(
    clinicalPolishSource,
    /@media \(prefers-reduced-motion: reduce\)/,
  );
  assert.match(
    clinicalPolishSource,
    /data-shcare-public-foundation="v1"\]\[data-shc-motion="reduced"\]::before,/,
  );
  assert.match(
    clinicalPolishSource,
    /data-shcare-public-foundation="v1"\]::before,/,
  );

  assert.doesNotMatch(signalHorizonSource, /shc-premium-breathe/);
  assert.doesNotMatch(signalHorizonSource, /data-shc-home-reveal/);
});

test("keeps maintenance and 404 inside the Public shell without fabricated support details", () => {
  assert.match(
    routesSource,
    /routeChildPath\("public\.not-found\.catch-all"\)/,
  );
  assert.doesNotMatch(notFoundSource, /1800\s*1234|18001234/);
  assert.doesNotMatch(
    notFoundSource,
    /radial-gradient|drop-shadow|boxShadow|\bHeart\b/,
  );
  assert.match(notFoundSource, /shc-public-state/);
});
