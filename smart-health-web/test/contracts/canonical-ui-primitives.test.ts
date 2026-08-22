import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = path.join(webRoot, "src");
const canonicalRoot = path.join(sourceRoot, "components", "ui");
const duplicateRoot = path.join(sourceRoot, "app", "components", "ui");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

test("uses one canonical Web primitive tree", () => {
  assert.equal(
    existsSync(duplicateRoot),
    false,
    "src/app/components/ui is a second primitive tree; migrate its consumers and remove it",
  );
  assert.equal(existsSync(canonicalRoot), true);

  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
      const resolved = specifier.startsWith("@/")
        ? path.resolve(sourceRoot, specifier.slice(2))
        : path.resolve(path.dirname(file), specifier);
      assert.equal(
        resolved.startsWith(duplicateRoot + path.sep),
        false,
        `${path.relative(webRoot, file)} still imports the duplicate primitive ${specifier}`,
      );
    }
  }
});
