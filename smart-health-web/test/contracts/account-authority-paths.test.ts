import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync("src/lib/smart-health-api.ts", "utf8");

test("keeps every Portal account authority read and mutation on canonical v1", () => {
  assert.match(api, /me: \(\) => request<\{ user: ApiUser \}>\("\/v1\/me"\)/);
  assert.match(api, /"\/v1\/me\/notification-preferences"/);
  assert.match(api, /"\/v1\/me\/2fa"/);
  assert.match(api, /"\/v1\/me\/2fa\/disable"/);
  assert.match(api, /"\/v1\/auth\/sessions"/);
  assert.doesNotMatch(api, /request<[^\n]+>\("\/me"\)/);
  assert.doesNotMatch(api, /"\/me\/2fa/);
  assert.doesNotMatch(api, /"\/auth\/sessions"/);
});
