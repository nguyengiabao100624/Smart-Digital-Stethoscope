import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const requiredFiles = [
  "package.json",
  "tokens.css",
  "tokens.json",
  "tokens.ts",
  "fonts.css",
  "fonts/Manrope-Vietnamese.woff2",
  "fonts/SourceSans3-Vietnamese.woff2",
  "fonts/OFL-Manrope.txt",
  "fonts/OFL-SourceSans3.txt",
  "motion.css",
  "assets/manifest.json",
  "assets/shcare-symbol.svg",
  "assets/shcare-symbol-mono.svg",
  "assets/shcare-horizontal.svg",
  "assets/shcare-horizontal-light.svg",
  "assets/shcare-horizontal-dark.svg",
  "assets/shcare-horizontal-mono.svg",
  "assets/shcare-favicon.svg",
  "assets/shcare-og.svg",
];

const coreColors = {
  ink: "#0B1F33",
  primary: "#2457D6",
  accent: "#087F75",
  info: "#2563A6",
  success: "#18794E",
  warning: "#A15C00",
  danger: "#B4233A",
  lightBackground: "#F4F8FB",
  lightSurface: "#FFFFFF",
  lightBorder: "#D8E3EA",
  lightText: "#102A43",
  lightTextMuted: "#52677A",
  darkBackground: "#071722",
  darkSurface: "#0D2533",
};

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

test("publishes the complete React-free brand contract", async () => {
  for (const relativePath of requiredFiles) {
    const file = await stat(path.join(packageRoot, relativePath));
    assert.equal(file.isFile(), true, `${relativePath} must be a file`);
  }

  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(packageJson.name, "@shcare/brand");
  assert.equal(packageJson.type, "module");
  assert.deepEqual(packageJson.sideEffects, ["*.css"]);
  assert.equal("react" in (packageJson.dependencies ?? {}), false);
  assert.equal("react" in (packageJson.peerDependencies ?? {}), false);
});

test("keeps core color values aligned across JSON, TypeScript and CSS", async () => {
  const [jsonSource, tsSource, cssSource] = await Promise.all([
    readFile(path.join(packageRoot, "tokens.json"), "utf8"),
    readFile(path.join(packageRoot, "tokens.ts"), "utf8"),
    readFile(path.join(packageRoot, "tokens.css"), "utf8"),
  ]);
  const tokens = JSON.parse(jsonSource);

  assert.equal(tokens.color.brand.primary, coreColors.primary);
  assert.equal(tokens.color.brand.accent, coreColors.accent);
  assert.equal(tokens.color.brand.ink, coreColors.ink);
  assert.equal(tokens.color.semantic.info, coreColors.info);
  assert.equal(tokens.color.semantic.success, coreColors.success);
  assert.equal(tokens.color.semantic.warning, coreColors.warning);
  assert.equal(tokens.color.semantic.danger, coreColors.danger);
  assert.equal(tokens.color.light.background, coreColors.lightBackground);
  assert.equal(tokens.color.light.surface, coreColors.lightSurface);
  assert.equal(tokens.color.light.border, coreColors.lightBorder);
  assert.equal(tokens.color.light.text, coreColors.lightText);
  assert.equal(tokens.color.light.textMuted, coreColors.lightTextMuted);
  assert.equal(tokens.color.dark.background, coreColors.darkBackground);
  assert.equal(tokens.color.dark.surface, coreColors.darkSurface);

  for (const value of Object.values(coreColors)) {
    assert.match(
      tsSource,
      new RegExp(value.replace("#", "#"), "i"),
      `${value} missing from tokens.ts`,
    );
    assert.match(
      cssSource,
      new RegExp(value.replace("#", "#"), "i"),
      `${value} missing from tokens.css`,
    );
  }

  assert.match(cssSource, /@import\s+"\.\/fonts\.css"/);
  assert.match(cssSource, /@import\s+"\.\/motion\.css"/);
  assert.match(tokens.typography.family.brand, /Manrope/);
  assert.match(tokens.typography.family.product, /Source Sans 3/);
});

test("self-hosts the approved Vietnamese brand and product fonts", async () => {
  const [fontCss, manrope, sourceSans] = await Promise.all([
    readFile(path.join(packageRoot, "fonts.css"), "utf8"),
    stat(path.join(packageRoot, "fonts/Manrope-Vietnamese.woff2")),
    stat(path.join(packageRoot, "fonts/SourceSans3-Vietnamese.woff2")),
  ]);

  assert.match(fontCss, /font-family:\s*"Manrope"/);
  assert.match(fontCss, /font-family:\s*"Source Sans 3"/);
  assert.match(fontCss, /font-display:\s*swap/);
  assert.match(fontCss, /format\("woff2"\)/);
  assert.ok(manrope.size + sourceSans.size <= 220 * 1024);
});

test("keeps core text and action color pairs at WCAG AA contrast", async () => {
  const tokens = JSON.parse(
    await readFile(path.join(packageRoot, "tokens.json"), "utf8"),
  );
  const pairs = [
    [tokens.color.light.text, tokens.color.light.background],
    [tokens.color.light.textMuted, tokens.color.light.surface],
    [tokens.color.dark.text, tokens.color.dark.background],
    [tokens.color.dark.textMuted, tokens.color.dark.background],
    [tokens.color.brand.primary, tokens.color.light.surface],
    [tokens.color.brand.accentStrong, tokens.color.light.surface],
    [tokens.color.semantic.successText, tokens.color.light.surface],
    [tokens.color.semantic.warningText, tokens.color.light.surface],
    [tokens.color.semantic.dangerText, tokens.color.light.surface],
  ];

  for (const [foreground, background] of pairs) {
    assert.ok(
      contrastRatio(foreground, background) >= 4.5,
      `${foreground} on ${background} must meet WCAG AA`,
    );
  }
});

test("ships accessible, flat SVG sources without forbidden visual effects", async () => {
  const svgFiles = requiredFiles.filter((file) => file.endsWith(".svg"));

  for (const relativePath of svgFiles) {
    const source = await readFile(path.join(packageRoot, relativePath), "utf8");
    assert.match(source, /<svg\b/);
    assert.match(source, /viewBox=/);
    assert.match(source, /<title\b/);
    assert.doesNotMatch(
      source,
      /linearGradient|radialGradient|filter\b|feGaussianBlur|glow|neon/i,
    );
  }

  const lockupSources = await Promise.all(
    [
      "assets/shcare-horizontal.svg",
      "assets/shcare-horizontal-light.svg",
      "assets/shcare-horizontal-dark.svg",
      "assets/shcare-horizontal-mono.svg",
    ].map((relativePath) => readFile(path.join(packageRoot, relativePath), "utf8")),
  );
  for (const source of lockupSources) {
    assert.match(source, /SMART HEALTH CARE/i);
    assert.doesNotMatch(source, /LISTEN\s*·\s*ANALYZE\s*·\s*CARE/i);
  }
});
