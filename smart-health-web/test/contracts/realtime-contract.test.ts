import assert from "node:assert/strict";
import test from "node:test";

import { buildRealtimeConnection } from "../../src/lib/realtime.ts";

test("builds an authenticated WSS connection without leaking the bearer in the URL", () => {
  const connection = buildRealtimeConnection(
    "https://api.shcare.vn/api/v1",
    "header.payload.signature",
  );

  assert.equal(connection.url, "wss://api.shcare.vn/app");
  assert.equal(connection.url.includes("header.payload.signature"), false);
  assert.deepEqual(connection.protocols, [
    "shcare.realtime.v1",
    "shcare.bearer.header.payload.signature",
  ]);
});

test("uses ws locally and keeps an unauthenticated development handshake explicit", () => {
  assert.deepEqual(buildRealtimeConnection("http://localhost:3000/api", ""), {
    url: "ws://localhost:3000/app",
    protocols: ["shcare.realtime.v1"],
  });
});

test("rejects unsupported API transports and protocol-unsafe bearer values", () => {
  assert.throws(
    () => buildRealtimeConnection("ftp://api.shcare.vn/api", "token"),
    /HTTP/i,
  );
  assert.throws(
    () =>
      buildRealtimeConnection("https://api.shcare.vn/api", "token with spaces"),
    /WebSocket/i,
  );
});
