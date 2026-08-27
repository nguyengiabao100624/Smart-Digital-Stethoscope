import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicLayoutSource = readFileSync(
  new URL("../../src/app/layouts/PublicLayout.tsx", import.meta.url),
  "utf8",
);

test("resolves the public motion preference before the first animated render", () => {
  assert.doesNotMatch(publicLayoutSource, /useState\(true\)/);
  assert.match(
    publicLayoutSource,
    /useState\(\s*resolveInitialMotionPreference,\s*\)/,
  );
  assert.match(publicLayoutSource, /prefers-reduced-motion:\s*reduce/);
});

test("keeps system reduced motion authoritative over a stored user preference", () => {
  assert.match(
    publicLayoutSource,
    /motionEnabled\s*=\s*motionRequested\s*&&\s*!systemReducedMotion/,
  );
  assert.match(publicLayoutSource, /if\s*\(systemReducedMotion\)\s*return/);
  assert.match(
    publicLayoutSource,
    /media\.addEventListener\("change", syncWithSystem\)/,
  );
  assert.match(
    publicLayoutSource,
    /media\.removeEventListener\("change", syncWithSystem\)/,
  );
});
