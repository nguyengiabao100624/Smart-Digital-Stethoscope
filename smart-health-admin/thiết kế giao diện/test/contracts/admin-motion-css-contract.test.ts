import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testRoot, "..", "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function dialogSources() {
  const directory = path.join(projectRoot, "src", "components", "admin", "dialogs");

  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => ({
      name,
      source: fs.readFileSync(path.join(directory, name), "utf8"),
    }));
}

test("maps the Admin brand font utility to the shared Shcare font token", () => {
  const styles = read("src/styles.css");

  assert.match(styles, /--font-brand:\s*var\(--shcare-font-brand\)/);
});

test("maps danger labels to the shared theme-aware text token", () => {
  const styles = read("src/styles.css");
  const designSystem = read("src/components/admin/design-system.tsx");
  const brandTokens = read("../../packages/shcare-brand/tokens.css");

  assert.match(styles, /--color-danger-text:\s*var\(--shcare-color-danger-text\)/);
  assert.match(designSystem, /error:\s*"[^"]*text-danger-text[^"]*"/);
  assert.match(brandTokens, /:root\.dark,[\s\S]*--shcare-color-danger-text:\s*#[0-9a-f]{6}/i);
});

test("canonical dialog primitives own their responsive layout without global important overrides", () => {
  const styles = read("src/styles.css");
  const dialog = read("src/components/ui/dialog.tsx");
  const alertDialog = read("src/components/ui/alert-dialog.tsx");

  assert.doesNotMatch(styles, /!important/);
  assert.doesNotMatch(styles, /\[role=["']dialog["']\]\[data-state\]/);
  assert.doesNotMatch(styles, /main\s+table\s+(?:th|td)/);

  assert.match(dialog, /h-dvh/);
  assert.match(dialog, /sm:max-w-lg/);
  assert.match(alertDialog, /left-4/);
  assert.match(alertDialog, /sm:max-w-lg/);
});

test("canonical and Admin dialogs explicitly disable CSS motion for reduced-motion users", () => {
  const sources = [
    {
      name: "src/components/ui/dialog.tsx",
      source: read("src/components/ui/dialog.tsx"),
    },
    {
      name: "src/components/ui/alert-dialog.tsx",
      source: read("src/components/ui/alert-dialog.tsx"),
    },
    ...dialogSources().map(({ name, source }) => ({
      name: `src/components/admin/dialogs/${name}`,
      source,
    })),
  ];

  for (const { name, source } of sources) {
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      if (/(?:^|\s)(?:data-\[[^\]]+\]:)?animate-(?!none)/.test(line)) {
        assert.match(
          line,
          /motion-reduce:animate-none/,
          `${name}:${index + 1} must disable animation in reduced-motion mode`,
        );
      }

      if (/(?:^|\s)transition-(?:colors|opacity|shadow|transform|all)/.test(line)) {
        assert.match(
          line,
          /motion-reduce:transition-none/,
          `${name}:${index + 1} must disable transition in reduced-motion mode`,
        );
      }
    }
  }
});
