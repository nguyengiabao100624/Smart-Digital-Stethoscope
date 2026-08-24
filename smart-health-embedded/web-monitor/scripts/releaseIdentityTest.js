const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildReleaseIdentity,
  normalizeReleaseId,
} = require("../src/releaseIdentity");
const {
  assertExpectedReleaseIdentity,
} = require("./publicDeploymentSmokeTest");

test("prefers an explicit bounded release marker", () => {
  assert.deepEqual(
    buildReleaseIdentity({
      SMART_HEALTH_RELEASE_ID: "shcare-v1.0.0-rc.2-4727e183",
      RENDER_GIT_COMMIT: "a".repeat(40),
    }),
    {
      id: "shcare-v1.0.0-rc.2-4727e183",
      commit: "aaaaaaaaaaaa",
    },
  );
});

test("uses the Render commit when no explicit marker is configured", () => {
  assert.deepEqual(
    buildReleaseIdentity({ RENDER_GIT_COMMIT: "4727e183d85e8368203d2f0bcd1ba9f6154105ca" }),
    {
      id: "git-4727e183d85e",
      commit: "4727e183d85e",
    },
  );
});

test("rejects control characters and overlong or malformed markers", () => {
  assert.equal(normalizeReleaseId("candidate\nforged"), "");
  assert.equal(normalizeReleaseId("x".repeat(121)), "");
  assert.equal(normalizeReleaseId("candidate with spaces"), "");
  assert.deepEqual(buildReleaseIdentity({ SMART_HEALTH_RELEASE_ID: "bad value" }), {
    id: "development",
    commit: "",
  });
});

test("deployment smoke rejects a missing, malformed, or stale backend marker", () => {
  const health = {
    release: {
      id: "shcare-v1.0.0-rc.2-candidate",
      commit: "4727e183d85e",
    },
  };
  assert.doesNotThrow(() =>
    assertExpectedReleaseIdentity(
      health,
      "shcare-v1.0.0-rc.2-candidate",
      "4727e183d85e8368203d2f0bcd1ba9f6154105ca",
    ),
  );
  assert.throws(
    () => assertExpectedReleaseIdentity(health, "shcare-v1.0.0-rc.2-stale"),
    /Backend release mismatch/,
  );
  assert.throws(
    () => assertExpectedReleaseIdentity({}, "shcare-v1.0.0-rc.2-candidate"),
    /received missing/,
  );
  assert.throws(
    () => assertExpectedReleaseIdentity(health, "bad release"),
    /malformed/,
  );
  assert.throws(
    () => assertExpectedReleaseIdentity(health, "", "deadbeef"),
    /Backend commit mismatch/,
  );
  assert.throws(
    () => assertExpectedReleaseIdentity(health, "", "not-a-commit"),
    /SMOKE_EXPECTED_COMMIT is malformed/,
  );
});
