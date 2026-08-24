const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_ACTIVE_NOTIFICATION_DEVICES_PER_USER,
  MAX_NOTIFICATION_PUSH_FANOUT,
  assertNotificationDeviceCapacity,
  isValidFcmRegistrationToken,
  selectBoundedNotificationDevices,
} = require("../src/notificationDeviceLimits");
const { createRepositories } = require("../src/repositories");

test("FCM registration tokens have a bounded provider-safe shape", () => {
  assert.equal(isValidFcmRegistrationToken("fcm-token_123:ABC"), true);
  assert.equal(isValidFcmRegistrationToken("short"), false);
  assert.equal(isValidFcmRegistrationToken("token with whitespace"), false);
  assert.equal(isValidFcmRegistrationToken(`fcm-${"a".repeat(4096)}`), false);
});

test("a user cannot accumulate more active notification devices than the cap", () => {
  const devices = Array.from(
    { length: MAX_ACTIVE_NOTIFICATION_DEVICES_PER_USER },
    (_, index) => ({
      id: `device-${index}`,
      userId: "user-a",
      fcmToken: `fcm-token-${index}`,
      enabled: true,
    }),
  );

  assert.throws(
    () => assertNotificationDeviceCapacity(devices, "user-a", "fcm-token-new", true),
    (error) => error?.code === "NOTIFICATION_DEVICE_LIMIT_REACHED",
  );
  assert.doesNotThrow(() =>
    assertNotificationDeviceCapacity(devices, "user-a", "fcm-token-0", true),
  );
  assert.doesNotThrow(() =>
    assertNotificationDeviceCapacity(devices, "user-b", "fcm-token-new", true),
  );
});

test("push delivery selection is deterministic and bounded", () => {
  const devices = Array.from(
    { length: MAX_NOTIFICATION_PUSH_FANOUT + 4 },
    (_, index) => ({
      id: `device-${index}`,
      updatedAt: new Date(Date.UTC(2026, 6, 27, 0, index)).toISOString(),
    }),
  );

  const selected = selectBoundedNotificationDevices(devices);
  assert.equal(selected.length, MAX_NOTIFICATION_PUSH_FANOUT);
  assert.equal(selected[0].id, `device-${devices.length - 1}`);
});

test("repository serializes concurrent registrations and enforces the per-user cap", async () => {
  const db = { notificationDevices: [] };
  let sequence = 0;
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}-${++sequence}`,
    nowIso: () => `2026-07-27T00:00:${String(sequence).padStart(2, "0")}.000Z`,
  });
  const attempts = await Promise.allSettled(
    Array.from({ length: MAX_ACTIVE_NOTIFICATION_DEVICES_PER_USER + 4 }, (_, index) =>
      repositories.notificationDevices.register({
        userId: "user-a",
        workspaceId: "workspace-a",
        authSessionId: "session-a",
        notificationProtocolVersion: 2,
        fcmToken: `valid-fcm-token-${index}`,
      }),
    ),
  );

  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 8);
  assert.equal(
    attempts
      .filter((attempt) => attempt.status === "rejected")
      .every((attempt) => attempt.reason?.code === "NOTIFICATION_DEVICE_LIMIT_REACHED"),
    true,
  );
  assert.equal(
    (await repositories.notificationDevices.listForUser("user-a", "workspace-a")).length,
    MAX_NOTIFICATION_PUSH_FANOUT,
  );
});
