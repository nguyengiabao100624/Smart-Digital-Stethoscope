"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("the canonical settings PATCH persists through the durable configuration repository", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
  const handlerStart = source.indexOf("async function handleSettingsApi");
  const handlerEnd = source.indexOf("async function handleNotificationsApi", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handler = source.slice(handlerStart, handlerEnd);
  const patchStart = handler.lastIndexOf(
    'if (segments.length === 2 && method === "PATCH")',
  );
  assert.ok(patchStart >= 0);
  const patchRoute = handler.slice(patchStart);

  assert.match(patchRoute, /getMutableSettingsForUser\(user\)/);
  assert.match(patchRoute, /await persistMutableSettings\(user, nextSettings, workspace\)/);
  assert.doesNotMatch(patchRoute, /await saveDb\(\)/);
});
