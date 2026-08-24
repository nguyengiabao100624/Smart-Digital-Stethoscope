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
const motionContextSource = readFileSync(
  new URL("src/app/context/PublicMotionContext.ts", webRoot),
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
const stylesSource = readFileSync(
  new URL("src/styles.css", webRoot),
  "utf8",
);
const fontsSource = readFileSync(
  new URL("src/web-styles/fonts.css", webRoot),
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

test("preserves the established classic Public visual without losing motion safety", () => {
  assert.match(
    layoutSource,
    /\.\.\/\.\.\/\.\.\/\.\.\/packages\/shcare-brand\/assets\/shcare-horizontal\.svg/,
  );
  assert.match(layoutSource, /data-shcare-public-visual="legacy"/);
  assert.match(layoutSource, /id="shcare-public-main"/);
  assert.match(layoutSource, /systemReducedMotion/);
  assert.match(layoutSource, /aria-label="Shcare — Smart Health Care"/);
  assert.match(layoutSource, />Shcare<\/span>/);

  assert.equal(homeSource.match(/<video\b/g)?.length, 1);
  assert.doesNotMatch(homeSource, /autoPlay=/);
  assert.match(homeSource, /window\.setTimeout\([\s\S]*?video\.play\(\)/);
  assert.doesNotMatch(homeSource, /shc-hero-video-edge/);
  assert.match(homeSource, /shc-hero-video-main/);
  assert.match(homeSource, /video\.pause\(\)/);
  assert.match(homeSource, /video\.play\(\)/);
  assert.match(homeSource, /Đăng ký sử dụng/);
  assert.match(homeSource, /Xem giải pháp/);
  assert.doesNotMatch(
    homeSource,
    /pin\/kết nối|online\/offline, pin|Heartbeat, pin/,
  );
});

test("isolates classic Public typography and stacking from the newer product surfaces", () => {
  assert.ok(
    stylesSource.indexOf('@import "./web-styles/fonts.css";') <
      stylesSource.indexOf('@import "tailwindcss";'),
    "local font boundary must load before generated CSS",
  );
  assert.doesNotMatch(fontsSource, /fonts\.(?:googleapis|gstatic)\.com/);
  assert.match(
    clinicalPolishSource,
    /data-shcare-public-visual="legacy"\][\s\S]*--clinical-display:[\s\S]*"Manrope"/,
  );
  const headerRule = clinicalPolishSource.match(
    /data-shcare-public-visual="legacy"\]\s*> \.shc-header\s*\{([^}]*)\}/,
  );
  assert.ok(headerRule, "classic fixed-header preservation rule is missing");
  assert.match(headerRule[1], /position:\s*fixed;/);
  assert.match(headerRule[1], /z-index:\s*140;/);
  assert.doesNotMatch(headerRule[1], /!important/);
});

test("makes the classic animation control authoritative for CSS and hero media", () => {
  assert.match(layoutSource, /resolveInitialMotionPreference/);
  assert.match(layoutSource, /media\.addEventListener\("change", syncWithSystem\)/);
  assert.match(layoutSource, /motionRequested\s*&&\s*!systemReducedMotion/);
  assert.match(layoutSource, /PublicMotionContext\.Provider value=\{motionEnabled\}/);
  assert.match(motionContextSource, /createContext\(true\)/);
  assert.match(motionContextSource, /return useContext\(PublicMotionContext\)/);
  assert.doesNotMatch(motionContextSource, /createContext<\(\) => boolean>/);
  assert.match(homeSource, /const motionEnabled = usePublicMotionEnabled\(\)/);
  assert.doesNotMatch(homeSource, /autoPlay=/);
  assert.match(homeSource, /video\.pause\(\)/);

  const legacyMotionRules = clinicalPolishSource.slice(
    clinicalPolishSource.indexOf("Legacy public visual preservation"),
  );
  assert.match(
    legacyMotionRules,
    /data-shcare-public-visual="legacy"\]\[data-shc-motion="reduced"\]/,
  );
  assert.match(
    legacyMotionRules,
    /@media \(prefers-reduced-motion: reduce\)/,
  );
  assert.match(legacyMotionRules, /animation:\s*none;/);
  assert.doesNotMatch(legacyMotionRules, /!important/);
  assert.match(signalHorizonSource, /\.shc-hero-video-main/);
  assert.doesNotMatch(signalHorizonSource, /\.shc-hero-video-edge/);
});

test("keeps classic Public emphasis and active controls readable in dark mode", () => {
  assert.match(
    clinicalPolishSource,
    /html\.dark[\s\S]*?data-shcare-public-visual="legacy"\][\s\S]*?\.shc-flow-list[\s\S]*?strong\s*\{\s*color:\s*#70c4ba/,
  );
  assert.match(
    clinicalPolishSource,
    /html\.dark[\s\S]*?data-shcare-public-visual="legacy"\][\s\S]*?\.shc-billing-toggle[\s\S]*?button\.is-active\s*\{\s*color:\s*#fff/,
  );
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
