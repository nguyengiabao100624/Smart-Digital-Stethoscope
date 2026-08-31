"use strict";

const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const backendRoot = path.resolve(__dirname, "..");
const productionRoots = [path.join(backendRoot, "server.js"), path.join(backendRoot, "src")];
const mojibakePattern = /(?:Ã[\u0080-\u00bf]|Ä[\u0080-\u00bf]|Æ[\u0080-\u00bf]|Ă[\u0080-\u00bf]|á[º»][\u0080-\u00bf]|â[€†][\u0080-\u00bf]?|ï¿½|�)/u;

function sourceFiles(target) {
  if (!target.endsWith(path.sep + "src")) return [target];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(target, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    return /\.(?:js|mjs|cjs|json|html|css)$/.test(entry.name) ? [absolutePath] : [];
  });
}

test("production backend source contains no UTF-8 mojibake", () => {
  const failures = productionRoots.flatMap(sourceFiles).flatMap((file) => {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    return lines.flatMap((line, index) =>
      mojibakePattern.test(line)
        ? [`${path.relative(backendRoot, file)}:${index + 1}: ${line.trim()}`]
        : [],
    );
  });

  assert.deepEqual(failures, []);
});
