import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMAND_STATUS_PRESENTATION,
  DEVICE_OTA_STATUS_PRESENTATION,
  DEVICE_ROTATION_STATUS_PRESENTATION,
  createDeviceOperationIdempotencyKey,
  getDeviceOtaState,
  isDeviceCommandTerminal,
  isDeviceOnline,
  isDeviceOtaSuccessful,
  isDeviceOtaTerminal,
  isDeviceRotationSuccessful,
  isDeviceRotationTerminal,
  pollDeviceCommandToTerminal,
  pollDeviceOtaToTerminal,
  summarizeDeviceEvent,
  validateOtaDraft,
} from "../../src/lib/device-operations.ts";

test("uses only backend-confirmed online presence", () => {
  assert.equal(isDeviceOnline({ id: "dev-online", online: true }), true);
  assert.equal(isDeviceOnline({ id: "dev-offline", online: false, connected: true }), false);
  assert.equal(isDeviceOnline({ id: "dev-legacy", connected: true, status: "connected" }), false);
  assert.equal(
    isDeviceOnline({ id: "dev-heartbeat", lastSeenAt: new Date().toISOString() }),
    false,
  );
});

test("presents every command lifecycle state and marks only final outcomes terminal", () => {
  const states = [
    "accepted",
    "queued",
    "delivered",
    "acknowledged",
    "applying",
    "applied",
    "failed",
    "expired",
  ] as const;

  assert.deepEqual(Object.keys(COMMAND_STATUS_PRESENTATION), states);
  for (const state of states) {
    assert.ok(COMMAND_STATUS_PRESENTATION[state].label.length > 0);
    assert.equal(isDeviceCommandTerminal(state), ["applied", "failed", "expired"].includes(state));
  }
});

test("polls command state until the device reports a terminal outcome", async () => {
  const states = ["delivered", "acknowledged", "applying", "applied"] as const;
  const observed: string[] = [];
  let index = 0;

  const result = await pollDeviceCommandToTerminal({
    initialCommand: {
      id: "cmd-1",
      deviceId: "dev-1",
      type: "restart",
      state: "delivered",
    },
    load: async () => ({
      id: "cmd-1",
      deviceId: "dev-1",
      type: "restart",
      state: states[Math.min(index++, states.length - 1)],
    }),
    wait: async () => undefined,
    onUpdate: (command) => observed.push(command.state),
    maxAttempts: 6,
  });

  assert.equal(result.timedOut, false);
  assert.equal(result.command.state, "applied");
  assert.deepEqual(observed, ["delivered", "acknowledged", "applying", "applied"]);
});

test("returns a retryable timeout instead of inventing a successful command", async () => {
  const result = await pollDeviceCommandToTerminal({
    initialCommand: {
      id: "cmd-2",
      deviceId: "dev-2",
      type: "ota.update",
      state: "delivered",
    },
    load: async () => ({
      id: "cmd-2",
      deviceId: "dev-2",
      type: "ota.update",
      state: "acknowledged",
    }),
    wait: async () => undefined,
    maxAttempts: 2,
  });

  assert.equal(result.timedOut, true);
  assert.equal(result.command.state, "acknowledged");
});

test("presents the canonical OTA lifecycle and never treats command applied as OTA success", () => {
  const states = [
    "pending",
    "delivered",
    "downloading",
    "verifying",
    "rebooting",
    "confirmed",
    "rolled_back",
    "failed",
  ] as const;

  assert.deepEqual(Object.keys(DEVICE_OTA_STATUS_PRESENTATION), states);
  for (const state of states) {
    assert.ok(DEVICE_OTA_STATUS_PRESENTATION[state].label.length > 0);
    assert.equal(
      isDeviceOtaTerminal(state),
      ["confirmed", "rolled_back", "failed"].includes(state),
    );
  }

  const expectation = { commandId: "cmd-ota-1", firmwareVersion: "1.2.3" };
  const rebootingDevice = {
    id: "dev-ota",
    firmwareVersion: "1.2.2",
    otaStatus: "rebooting",
    ota: {
      commandId: "cmd-ota-1",
      firmwareVersion: "1.2.3",
      status: "rebooting",
    },
    lastCommand: {
      id: "cmd-ota-1",
      deviceId: "dev-ota",
      type: "ota.update",
      state: "applied" as const,
    },
  };

  assert.equal(getDeviceOtaState(rebootingDevice), "rebooting");
  assert.equal(isDeviceOtaSuccessful(rebootingDevice, expectation), false);

  const confirmedDevice = {
    ...rebootingDevice,
    firmwareVersion: "1.2.3",
    otaStatus: "confirmed",
    ota: { ...rebootingDevice.ota, status: "confirmed" },
  };
  assert.equal(isDeviceOtaSuccessful(confirmedDevice, expectation), true);
  assert.equal(
    isDeviceOtaSuccessful({ ...confirmedDevice, firmwareVersion: "1.2.2" }, expectation),
    false,
  );
  assert.equal(
    isDeviceOtaSuccessful(
      {
        ...confirmedDevice,
        ota: { ...confirmedDevice.ota, commandId: "cmd-older-ota" },
      },
      expectation,
    ),
    false,
  );
});

test("normalizes backend and firmware OTA progress without inventing confirmation", () => {
  const statuses = [
    ["accepted", "pending"],
    ["queued", "pending"],
    ["acknowledged", "delivered"],
    ["downloading", "downloading"],
    ["verifying", "verifying"],
    ["applied", "rebooting"],
    ["rolling_back", "rolled_back"],
    ["expired", "failed"],
  ] as const;

  for (const [rawStatus, expectedStatus] of statuses) {
    assert.equal(
      getDeviceOtaState({
        id: "dev-ota",
        otaStatus: rawStatus,
        ota: { commandId: "cmd-ota", firmwareVersion: "2.0.0", status: rawStatus },
      }),
      expectedStatus,
    );
  }
});

test("polls device OTA until authenticated reconnect confirmation with the target version", async () => {
  const states = ["downloading", "verifying", "rebooting", "confirmed"] as const;
  const observed: string[] = [];
  let index = 0;

  const result = await pollDeviceOtaToTerminal({
    initialDevice: {
      id: "dev-ota",
      firmwareVersion: "1.2.2",
      otaStatus: "delivered",
      ota: { commandId: "cmd-ota", firmwareVersion: "1.2.3", status: "delivered" },
    },
    expectation: { commandId: "cmd-ota", firmwareVersion: "1.2.3" },
    load: async () => {
      const state = states[Math.min(index++, states.length - 1)];
      return {
        id: "dev-ota",
        firmwareVersion: state === "confirmed" ? "1.2.3" : "1.2.2",
        otaStatus: state,
        ota: { commandId: "cmd-ota", firmwareVersion: "1.2.3", status: state },
      };
    },
    onUpdate: (_device, state) => observed.push(state),
    wait: async () => undefined,
    maxAttempts: 6,
  });

  assert.equal(result.timedOut, false);
  assert.equal(result.replaced, false);
  assert.equal(result.confirmationMismatch, false);
  assert.equal(result.state, "confirmed");
  assert.deepEqual(observed, ["downloading", "verifying", "rebooting", "confirmed"]);
});

test("returns honest OTA timeout and detects a replaced or mismatched confirmation", async () => {
  const initialDevice = {
    id: "dev-ota",
    firmwareVersion: "1.2.2",
    otaStatus: "rebooting",
    ota: { commandId: "cmd-ota", firmwareVersion: "1.2.3", status: "rebooting" },
  };
  const expectation = { commandId: "cmd-ota", firmwareVersion: "1.2.3" };

  const timedOut = await pollDeviceOtaToTerminal({
    initialDevice,
    expectation,
    load: async () => initialDevice,
    wait: async () => undefined,
    maxAttempts: 2,
  });
  assert.equal(timedOut.timedOut, true);
  assert.equal(timedOut.state, "rebooting");

  const replaced = await pollDeviceOtaToTerminal({
    initialDevice,
    expectation,
    load: async () => ({
      ...initialDevice,
      ota: { ...initialDevice.ota, commandId: "cmd-newer" },
    }),
    wait: async () => undefined,
    maxAttempts: 1,
  });
  assert.equal(replaced.replaced, true);
  assert.equal(replaced.timedOut, false);

  const mismatch = await pollDeviceOtaToTerminal({
    initialDevice,
    expectation,
    load: async () => ({
      ...initialDevice,
      firmwareVersion: "1.2.2",
      otaStatus: "confirmed",
      ota: { ...initialDevice.ota, status: "confirmed" },
    }),
    wait: async () => undefined,
    maxAttempts: 1,
  });
  assert.equal(mismatch.confirmationMismatch, true);
  assert.equal(mismatch.timedOut, false);
});

test("uses an environment-safe default timer for command polling", async () => {
  const result = await pollDeviceCommandToTerminal({
    initialCommand: {
      id: "cmd-3",
      deviceId: "dev-3",
      type: "restart",
      state: "delivered",
    },
    load: async () => ({
      id: "cmd-3",
      deviceId: "dev-3",
      type: "restart",
      state: "applied",
    }),
    intervalMs: 0,
    maxAttempts: 1,
  });

  assert.equal(result.command.state, "applied");
});

test("forwards cancellation to each command status request", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  await pollDeviceCommandToTerminal({
    initialCommand: {
      id: "cmd-cancellable",
      deviceId: "dev-cancellable",
      type: "restart",
      state: "delivered",
    },
    signal: controller.signal,
    wait: async () => undefined,
    load: async (signal) => {
      receivedSignal = signal;
      return {
        id: "cmd-cancellable",
        deviceId: "dev-cancellable",
        type: "restart",
        state: "applied",
      };
    },
  });

  assert.equal(receivedSignal, controller.signal);
});

test("requires a production-safe OTA manifest", () => {
  const validChecksum = "a".repeat(64);
  const valid = validateOtaDraft({
    firmwareVersion: "1.2.3",
    url: "https://releases.shcare.vn/msm261-1.2.3.bin",
    checksum: validChecksum,
    firmwareFileId: "",
    hardwareTarget: "MSM261S4030H0",
    partitionTarget: "app",
    minimumProtocolVersion: "1",
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.fieldErrors, {});

  const invalid = validateOtaDraft({
    firmwareVersion: "v1",
    url: "http://local.invalid/firmware.bin",
    checksum: "optional",
    firmwareFileId: "",
    hardwareTarget: "another-board",
    partitionTarget: "factory",
    minimumProtocolVersion: "0",
  });
  assert.equal(invalid.valid, false);
  assert.deepEqual(Object.keys(invalid.fieldErrors).sort(), [
    "checksum",
    "firmwareVersion",
    "hardwareTarget",
    "minimumProtocolVersion",
    "partitionTarget",
    "url",
  ]);
});

test("summarizes device events without rendering raw secret-bearing payloads", () => {
  const description = summarizeDeviceEvent({
    id: "evt-1",
    deviceId: "dev-1",
    eventType: "ota.requested",
    payload: {
      state: "delivered",
      firmwareVersion: "1.2.3",
      commandId: "cmd-1",
      token: "top-secret-token",
      signature: "top-secret-signature",
      url: "https://private.invalid/file?token=top-secret-token",
      deviceSecret: "top-secret-device-key",
    },
  });

  assert.match(description, /delivered/);
  assert.match(description, /1\.2\.3/);
  assert.doesNotMatch(description, /top-secret|token=|signature|deviceSecret|https:\/\//i);
});

test("creates an operation-scoped idempotency key without embedding device secrets", () => {
  const key = createDeviceOperationIdempotencyKey("restart", "dev_123", () => "uuid-1");
  assert.equal(key, "shcare-admin:restart:dev_123:uuid-1");
});

test("presents the full rotation lifecycle and treats only confirmed reconnect as success", () => {
  const states = [
    "initiated",
    "pending_device_ack",
    "confirming",
    "confirmed",
    "expired",
    "rolled_back",
    "failed",
  ] as const;
  assert.deepEqual(Object.keys(DEVICE_ROTATION_STATUS_PRESENTATION), states);
  for (const state of states) {
    assert.ok(DEVICE_ROTATION_STATUS_PRESENTATION[state].label.length > 0);
    assert.equal(
      isDeviceRotationTerminal(state),
      ["confirmed", "expired", "rolled_back", "failed"].includes(state),
    );
    assert.equal(isDeviceRotationSuccessful(state), state === "confirmed");
  }
});
