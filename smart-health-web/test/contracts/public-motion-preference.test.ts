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

test("uses system reduced motion by default but lets the user explicitly override it", () => {
  assert.match(
    publicLayoutSource,
    /motionPreference\s*===\s*"enabled"[\s\S]*motionPreference\s*===\s*"system"[\s\S]*!systemReducedMotion/,
  );
  assert.doesNotMatch(publicLayoutSource, /disabled=\{systemReducedMotion\}/);
  assert.doesNotMatch(publicLayoutSource, /if\s*\(systemReducedMotion\)\s*return/);
  assert.match(publicLayoutSource, /Nhấn để bật hiệu ứng/);
  assert.match(
    publicLayoutSource,
    /media\.addEventListener\("change", syncWithSystem\)/,
  );
  assert.match(
    publicLayoutSource,
    /media\.removeEventListener\("change", syncWithSystem\)/,
  );
});
