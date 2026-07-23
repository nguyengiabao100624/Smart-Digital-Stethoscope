import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicLayoutSource = readFileSync(
  new URL("../../src/app/layouts/PublicLayout.tsx", import.meta.url),
  "utf8",
);

test("resolves the public motion preference before the first animated render", () => {
  assert.doesNotMatch(publicLayoutSource, /useState\(true\)/);
  assert.match(publicLayoutSource, /useState\(resolveInitialMotionPreference\)/);
  assert.match(publicLayoutSource, /prefers-reduced-motion:\s*reduce/);
});

test("keeps following system reduced-motion changes until the user overrides it", () => {
  assert.match(publicLayoutSource, /media\.addEventListener\("change", syncWithSystem\)/);
  assert.match(publicLayoutSource, /media\.removeEventListener\("change", syncWithSystem\)/);
});
