const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveEligibleNotificationDevices,
} = require("../src/notificationDeviceEligibility");

function createHarness() {
  const state = {
    accountActive: true,
    workspaceAllowed: true,
    sessionActive: true,
    loadCount: 0,
    listCount: 0,
    devices: [
      {
        id: "notification_device_a",
        userId: "user_a",
        workspaceId: "workspace_a",
        authSessionId: "auth_session_a",
        notificationProtocolVersion: 2,
        fcmToken: "fcm-token-a",
        enabled: true,
      },
    ],
  };
  return {
    state,
    resolve: (deviceIds = []) =>
      resolveEligibleNotificationDevices({
        notification: {
          id: "notification_a",
          userId: "user_a",
          organizationId: "workspace_a",
        },
        deviceIds,
        loadCanonicalUser: async (userId) => {
          state.loadCount += 1;
          return { id: userId, accountStatus: state.accountActive ? "active" : "locked" };
        },
        isUserActive: () => state.accountActive,
        hasWorkspaceAccess: () => state.workspaceAllowed,
        listDevices: async () => {
          state.listCount += 1;
          return state.devices;
        },
        isSessionActive: async () => state.sessionActive,
      }),
  };
}

test("every delivery attempt reloads account, workspace, device, and auth-session eligibility", async () => {
  const harness = createHarness();
  const firstAttempt = await harness.resolve(["notification_device_a"]);
  assert.deepEqual(firstAttempt.map((device) => device.id), ["notification_device_a"]);

  harness.state.sessionActive = false;
  const retryAfterSessionRevocation = await harness.resolve(["notification_device_a"]);
  assert.deepEqual(retryAfterSessionRevocation, []);
  assert.equal(harness.state.loadCount, 2);
  assert.equal(harness.state.listCount, 2);

  harness.state.sessionActive = true;
  harness.state.accountActive = false;
  assert.deepEqual(await harness.resolve(["notification_device_a"]), []);

  harness.state.accountActive = true;
  harness.state.workspaceAllowed = false;
  assert.deepEqual(await harness.resolve(["notification_device_a"]), []);
});

test("a stale retry device id cannot bypass a token reassignment to another workspace", async () => {
  const harness = createHarness();
  harness.state.devices = [
    {
      ...harness.state.devices[0],
      workspaceId: "workspace_b",
      authSessionId: "auth_session_b",
    },
  ];

  assert.deepEqual(await harness.resolve(["notification_device_a"]), []);
});

test("legacy protocol and cross-user rows remain ineligible even if a loader returns them", async () => {
  const harness = createHarness();
  harness.state.devices = [
    {
      ...harness.state.devices[0],
      notificationProtocolVersion: 1,
    },
    {
      ...harness.state.devices[0],
      id: "notification_device_b",
      userId: "user_b",
    },
  ];

  assert.deepEqual(await harness.resolve(), []);
});
