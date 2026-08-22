import assert from "node:assert/strict";
import test from "node:test";

import { resolveBrowserSmokeRuntime } from "../../scripts/browserSmokeRuntime.mjs";

test("selects each supported Playwright engine for UI smoke proof", () => {
  for (const browserName of ["chromium", "firefox", "webkit"] as const) {
    const runtime = resolveBrowserSmokeRuntime(browserName);

    assert.equal(runtime.name, browserName);
    assert.equal(runtime.browserType.name(), browserName);
  }
});

test("defaults to Chromium and rejects unknown browser labels", () => {
  assert.equal(resolveBrowserSmokeRuntime().name, "chromium");
  assert.throws(
    () => resolveBrowserSmokeRuntime("edge"),
    /Unsupported UI smoke browser "edge"\. Expected chromium, firefox, or webkit\./,
  );
});
