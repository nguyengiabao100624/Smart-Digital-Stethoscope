import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const adminRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = path.join(adminRoot, "src");
const mojibakePattern =
  /(?:Ã[\u0080-\u00bf]|Ä[\u0080-\u00bf]|Æ[\u0080-\u00bf]|Ă[\u0080-\u00bf]|á[º»][\u0080-\u00bf]|â[€†][\u0080-\u00bf]?|ï¿½|�)/u;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    return /\.(?:ts|tsx|js|jsx|css|html)$/.test(entry.name) ? [absolutePath] : [];
  });
}

test("production Admin source contains no UTF-8 mojibake", () => {
  const failures = sourceFiles(sourceRoot).flatMap((file) => {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    return lines.flatMap((line, index) =>
      mojibakePattern.test(line)
        ? [`${path.relative(adminRoot, file)}:${index + 1}: ${line.trim()}`]
        : [],
    );
  });

  assert.deepEqual(failures, []);
});
