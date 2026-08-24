import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = path.join(webRoot, "src");
const entryPath = path.join(sourceRoot, "styles.css");

const retiredClassPattern =
  /\.(?:glass-panel|premium-button|brand-gradient-text|cyber(?:-[\w-]+)?)\b/i;
const retiredSourceTokenPattern =
  /\b(?:glass-panel|premium-button|brand-gradient-text|cyber-[\w-]+)\b/i;

const legacyImportantBudgets = new Map([
  ["src/web-styles/theme.css", 0],
  ["src/web-styles/clinical-system.css", 0],
  ["src/web-styles/signal-horizon.css", 0],
  ["src/web-styles/clinical-polish.css", 0],
]);

const legacyImportantMultisetDigests = new Map([
  [
    "src/web-styles/theme.css",
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  ],
  [
    "src/web-styles/clinical-system.css",
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  ],
  [
    "src/web-styles/signal-horizon.css",
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  ],
  [
    "src/web-styles/clinical-polish.css",
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  ],
]);

function relativePath(filePath: string) {
  return path.relative(webRoot, filePath).replaceAll(path.sep, "/");
}

function cssImportSpecifiers(source: string) {
  const imports = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .matchAll(
      /@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^'"\s)]+))\s*\)|"([^"]+)"|'([^']+)')[^;]*;/gi,
    );

  return [...imports].flatMap((match) => {
    const specifier = match
      .slice(1)
      .find((candidate): candidate is string => Boolean(candidate));
    return specifier ? [specifier] : [];
  });
}

function localCssImports(filePath: string) {
  return cssImportSpecifiers(readFileSync(filePath, "utf8"))
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => path.resolve(path.dirname(filePath), specifier));
}

function activeCssGraph(entry: string) {
  const pending = [entry];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || visited.has(filePath)) continue;

    assert.ok(
      filePath.startsWith(sourceRoot + path.sep) || filePath === entryPath,
      `Active CSS import escapes src: ${filePath}`,
    );
    visited.add(filePath);
    pending.push(...localCssImports(filePath));
  }

  return [...visited].sort();
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function normalizeCssFragment(source: string) {
  return source.replace(/\s+/g, " ").trim();
}

function cssDeclarationBlocks(source: string) {
  return [...withoutComments(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    (match) => ({
      selector: normalizeCssFragment(match[1]),
      body: match[2],
    }),
  );
}

function importantDeclarations(source: string) {
  const declarations: string[] = [];

  for (const { selector, body } of cssDeclarationBlocks(source)) {
    for (const declaration of body.matchAll(
      /([-\w]+)\s*:\s*([^;{}]*?)\s*!\s*important\b/gi,
    )) {
      const property = declaration[1].toLowerCase();
      const value = normalizeCssFragment(declaration[2]);
      declarations.push(`${selector}\0${property}\0${value}`);
    }
  }

  return declarations.sort();
}

function importantMultisetDigest(declarations: readonly string[]) {
  return createHash("sha256")
    .update(JSON.stringify([...declarations].sort()))
    .digest("hex");
}

function assertImportantDebt(
  label: string,
  source: string,
  budget: number,
  expectedDigest: string,
) {
  const declarations = importantDeclarations(source);

  assert.ok(
    declarations.length <= budget,
    `${label} has ${declarations.length} !important declarations; budget is ${budget}`,
  );
  assert.equal(
    importantMultisetDigest(declarations),
    expectedDigest,
    `${label} changed the normalized !important declaration multiset; lower the ceiling and refresh the reviewed digest only when removing legacy debt`,
  );
}

test("keeps the active CSS import graph explicit and recursively reviewable", () => {
  const activeFiles = activeCssGraph(entryPath).map(relativePath);

  assert.deepEqual(activeFiles, [
    "src/styles.css",
    "src/web-styles/clinical-polish.css",
    "src/web-styles/clinical-system.css",
    "src/web-styles/fonts.css",
    "src/web-styles/signal-horizon.css",
    "src/web-styles/theme.css",
  ]);
});

test("discovers case-insensitive, comment-separated and unquoted CSS imports", () => {
  assert.deepEqual(
    cssImportSpecifiers(`
      @import "./quoted.css";
      @import url('./url-single.css') screen;
      @import url("./url-double.css");
      @import url(./url-unquoted.css) layer(legacy);
      @IMPORT URL(./legacy.css);
      @import/**/url(./comment-separated.css);
      @import "tailwindcss";
    `),
    [
      "./quoted.css",
      "./url-single.css",
      "./url-double.css",
      "./url-unquoted.css",
      "./legacy.css",
      "./comment-separated.css",
      "tailwindcss",
    ],
  );
});

test("rejects retired glass, premium, gradient-brand and cyber selectors", () => {
  for (const filePath of activeCssGraph(entryPath)) {
    const source = withoutComments(readFileSync(filePath, "utf8"));
    assert.doesNotMatch(
      source,
      retiredClassPattern,
      `${relativePath(filePath)} reintroduces a retired selector`,
    );
  }

  for (const filePath of sourceFiles(sourceRoot)) {
    const source = readFileSync(filePath, "utf8");
    assert.doesNotMatch(
      source,
      retiredSourceTokenPattern,
      `${relativePath(filePath)} consumes a retired class`,
    );
  }
});

test("forbids new !important debt and prevents quarantined legacy debt growth", () => {
  for (const filePath of activeCssGraph(entryPath)) {
    const source = withoutComments(readFileSync(filePath, "utf8"));
    const label = relativePath(filePath);
    const budget = legacyImportantBudgets.get(label) ?? 0;
    const expectedDigest =
      legacyImportantMultisetDigests.get(label) ?? importantMultisetDigest([]);

    assertImportantDebt(label, source, budget, expectedDigest);
  }
});

test("rejects delete-old/add-new !important replacement at the same count", () => {
  const baseline = ".legacy { color: red !important; }";
  const spacedImportant = ".legacy { color: red ! important; }";
  const baselineDigest = importantMultisetDigest(
    importantDeclarations(baseline),
  );
  const emptyDigest = importantMultisetDigest([]);

  assert.deepEqual(
    importantDeclarations(spacedImportant),
    importantDeclarations(baseline),
  );
  assert.doesNotThrow(() =>
    assertImportantDebt("fixture.css", baseline, 1, baselineDigest),
  );
  assert.doesNotThrow(() =>
    assertImportantDebt("fixture.css", spacedImportant, 1, baselineDigest),
  );
  assert.throws(
    () =>
      assertImportantDebt(
        "fixture.css",
        ".legacy { color: red; }",
        1,
        baselineDigest,
      ),
    /changed the normalized !important declaration multiset/,
  );
  assert.doesNotThrow(() =>
    assertImportantDebt(
      "fixture.css",
      ".legacy { color: red; }",
      0,
      emptyDigest,
    ),
  );
  assert.throws(
    () =>
      assertImportantDebt(
        "fixture.css",
        ".replacement { color: blue !important; }",
        1,
        baselineDigest,
      ),
    /changed the normalized !important declaration multiset/,
  );
});

test("keeps the Portal title semantic and visible on compact layouts", () => {
  const layoutSource = readFileSync(
    path.join(sourceRoot, "app", "layouts", "PortalLayout.tsx"),
    "utf8",
  );
  const cssSource = activeCssGraph(entryPath)
    .map((filePath) => withoutComments(readFileSync(filePath, "utf8")))
    .join("\n");

  assert.match(
    layoutSource,
    /<h1\s+className="clinical-topbar-page-title">\{title\}<\/h1>/,
  );
  assert.doesNotMatch(
    layoutSource,
    /<p\s+className="clinical-topbar-page-title">/,
  );
  assert.match(
    cssSource,
    /\.clinical-topbar-title\s+\.clinical-topbar-context\s*\{[^}]*display:\s*none/,
  );
  assert.doesNotMatch(
    cssSource,
    /\.clinical-topbar-title\s+p\s*\{[^}]*display:\s*none/,
  );

  for (const { selector, body } of cssDeclarationBlocks(cssSource)) {
    if (!selector.includes(".clinical-topbar-page-title")) continue;
    assert.doesNotMatch(
      body,
      /display\s*:\s*none/,
      `Portal page title is hidden by ${selector}`,
    );
  }
});

test("keeps every Portal shell surface opaque and free of glass", () => {
  const layoutSource = readFileSync(
    path.join(sourceRoot, "app", "layouts", "PortalLayout.tsx"),
    "utf8",
  );
  const activeSources = activeCssGraph(entryPath).map((filePath) => ({
    filePath,
    source: withoutComments(readFileSync(filePath, "utf8")),
  }));
  const cssSource = activeSources.map(({ source }) => source).join("\n");

  assert.doesNotMatch(
    layoutSource,
    /popoverBackdropStyle|backdropFilter|WebkitBackdropFilter/,
  );
  assert.match(
    cssSource,
    /\.clinical-popover\s*\{[\s\S]*?border:\s*1px solid var\(--clinical-line\)[\s\S]*?background:\s*var\(--clinical-surface\)/,
  );
  assert.doesNotMatch(
    cssSource,
    /\.clinical-user-trigger\s*>\s*svg,\s*\.clinical-user-trigger\s*>\s*span\s*\{[\s\S]*?display:\s*none/,
  );
  for (const { selector, body } of cssDeclarationBlocks(cssSource)) {
    if (
      !selector.includes(".clinical-portal .clinical-top-actions") ||
      !selector.includes(".clinical-portal .portal-toolbar")
    ) {
      continue;
    }
    assert.doesNotMatch(
      body,
      /width\s*:\s*100%/,
      `Portal top actions inherit a full-width toolbar rule from ${selector}`,
    );
  }

  for (const { filePath, source } of activeSources) {
    for (const { selector, body } of cssDeclarationBlocks(source)) {
      if (
        !/(?:\.clinical-(?:portal|sidebar|topbar|workspace-link)\b|\.portal-[\w-]+\b)/.test(
          selector,
        )
      ) {
        continue;
      }

      assert.doesNotMatch(
        body,
        /(?:backdrop-filter|filter)\s*:\s*[^;]*(?:blur|saturate)/i,
        `${relativePath(filePath)} keeps Portal glass in ${selector}`,
      );

      for (const individualSelector of selector.split(",")) {
        if (
          !/^(?:html(?:[^ ]*)\s+body\s+)?(?:\.clinical-portal\s+)?\.clinical-(?:sidebar|topbar|workspace-link)(?::[\w-]+)?$/.test(
            individualSelector.trim(),
          )
        ) {
          continue;
        }

        for (const background of body.matchAll(
          /background(?:-image)?\s*:\s*([^;]+)/gi,
        )) {
          assert.doesNotMatch(
            background[1],
            /(?:transparent|rgba?\(|gradient|color-mix|--signal-card\))/i,
            `${relativePath(filePath)} keeps a translucent Portal shell surface in ${individualSelector.trim()}`,
          );
        }
      }
    }
  }
});
