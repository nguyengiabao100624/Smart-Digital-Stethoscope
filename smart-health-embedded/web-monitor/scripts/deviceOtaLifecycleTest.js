const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OTA_LIFECYCLE_STATUSES,
  createDeviceOtaOwnershipBinding,
  isCanonicalDeviceOtaLifecycle,
  isCanonicalPrivateDeviceOtaGrant,
  normalizeDeviceOtaStatus,
  sanitizeDeviceOtaLifecycle,
  transitionDeviceOtaLifecycle,
} = require("../src/deviceOtaLifecycle");
const {
  applyDeviceCommandDelivery,
  applyDeviceReportedCommandStatus,
  createDeviceCommandEnvelope,
  createDeviceCommandRecord,
  expireDeviceCommandIfOverdue,
} = require("../src/deviceCommandLifecycle");

function activeOta(overrides = {}) {
  return {
    protocolVersion: 1,
    id: "cmd-ota-001",
    commandId: "cmd-ota-001",
    correlationId: "corr-ota-001",
    firmwareVersion: "1.2.3",
    tokenHash: "a".repeat(64),
    status: "pending",
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

test("canonical OTA status vocabulary is complete and aliases are normalized", () => {
  assert.deepEqual(OTA_LIFECYCLE_STATUSES, [
    "pending", "delivered", "downloading", "verifying", "rebooting",
    "rolling_back", "confirmed", "rolled_back", "failed", "expired",
  ]);
  for (const legacy of ["accepted", "queued", "acknowledged", "applying"]) {
    assert.equal(normalizeDeviceOtaStatus(legacy), "pending");
  }
  assert.equal(normalizeDeviceOtaStatus("", "ota.rollback"), "rolling_back");
  assert.equal(normalizeDeviceOtaStatus("unknown"), "");
});

test("durable OTA sanitizer strips transport secrets and download locations", () => {
  const safe = sanitizeDeviceOtaLifecycle({
    ...activeOta(),
    url: "https://backend.example/firmware?token=secret",
    downloadUrl: "https://object.example/signed",
    downloadAuthorization: "raw-bearer",
    token: "raw-token",
    signature: "raw-signature",
    privateKey: "raw-private-key",
  });
  assert.equal(safe.tokenHash, "a".repeat(64));
  for (const forbidden of [
    "url", "downloadUrl", "downloadAuthorization", "token", "signature", "privateKey",
  ]) {
    assert.equal(Object.hasOwn(safe, forbidden), false, forbidden);
  }
});

test("only a complete canonical OTA lifecycle can enter the public projection", () => {
  assert.equal(isCanonicalDeviceOtaLifecycle(activeOta()), false);
  assert.equal(isCanonicalDeviceOtaLifecycle({
    ...activeOta(),
    protocolVersion: 1,
    correlationId: "corr-ota-001",
    firmwareVersion: "1.2.3",
    checksum: "b".repeat(64),
    hardwareTarget: "MSM261S4030H0",
    partitionTarget: "app",
    minimumProtocolVersion: 1,
    expiresAt: "2026-08-15T02:00:00.000Z",
  }), true);
  assert.equal(isCanonicalDeviceOtaLifecycle({
    ...activeOta(),
    protocolVersion: 1,
    correlationId: "corr-ota-001",
    checksum: "sha256:not-canonical",
    hardwareTarget: "MSM261S4030H0",
    partitionTarget: "app",
    minimumProtocolVersion: 1,
    expiresAt: "2026-08-15T02:00:00.000Z",
  }), false);
});

test("a private OTA grant is finite and bound to its exact ownership and storage authority", () => {
  const privateGrantBase = {
    ...activeOta(),
    checksum: "b".repeat(64),
    hardwareTarget: "MSM261S4030H0",
    partitionTarget: "app",
    minimumProtocolVersion: 1,
    expiresAt: "2026-08-15T02:00:00.000Z",
    tokenHash: `sha256:${"c".repeat(64)}`,
    firmwareFileId: "firmware_private_001",
    firmwareStorageBucket: "device-firmware",
    firmwareObjectKey: "org/org_alpha/storage/device-firmware/firmware_private_001.bin",
    firmwareByteSize: 4096,
    organizationId: "org_alpha",
    ownerUserId: "user_alpha",
    ownershipState: "assigned",
  };
  const privateGrant = {
    ...privateGrantBase,
    ownershipBinding: createDeviceOtaOwnershipBinding(privateGrantBase),
  };

  const validationOptions = { now: new Date("2026-08-15T01:00:00.000Z") };
  assert.equal(isCanonicalPrivateDeviceOtaGrant(privateGrant, validationOptions), true);
  for (const field of [
    "expiresAt",
    "tokenHash",
    "firmwareFileId",
    "firmwareObjectKey",
    "organizationId",
    "ownershipState",
    "ownershipBinding",
  ]) {
    const invalid = { ...privateGrant };
    delete invalid[field];
    assert.equal(
      isCanonicalPrivateDeviceOtaGrant(invalid, validationOptions),
      false,
      `${field} is required for a private OTA grant`,
    );
  }
  assert.equal(
    isCanonicalPrivateDeviceOtaGrant(
      { ...privateGrant, expiresAt: "not-a-date" },
      validationOptions,
    ),
    false,
  );
  assert.equal(
    isCanonicalPrivateDeviceOtaGrant(
      { ...privateGrant, expiresAt: "2026-08-15T01:00:00.000Z" },
      validationOptions,
    ),
    false,
  );
  assert.equal(
    isCanonicalPrivateDeviceOtaGrant(
      { ...privateGrant, ownerUserId: "another-owner" },
      validationOptions,
    ),
    false,
  );

  const provisionedGrantBase = {
    ...privateGrant,
    ownerUserId: "",
    ownershipState: "provisioned",
  };
  const provisionedGrant = {
    ...provisionedGrantBase,
    ownershipBinding: createDeviceOtaOwnershipBinding(provisionedGrantBase),
  };
  assert.equal(
    isCanonicalPrivateDeviceOtaGrant(provisionedGrant, validationOptions),
    true,
    "a factory-provisioned device binds the explicit empty owner through its fingerprint",
  );
});

test("OTA lifecycle is monotonic and confirmation requires reconnect authority", () => {
  let ota = activeOta();
  for (const status of ["delivered", "downloading", "verifying", "rebooting"]) {
    const transition = transitionDeviceOtaLifecycle(ota, status, {
      at: "2026-08-15T00:05:00.000Z",
    });
    assert.equal(transition.changed, true);
    ota = transition.ota;
  }
  assert.throws(
    () => transitionDeviceOtaLifecycle(ota, "confirmed"),
    { code: "DEVICE_OTA_CONFIRMATION_RECONNECT_REQUIRED" },
  );
  const confirmed = transitionDeviceOtaLifecycle(ota, "confirmed", {
    allowConfirmed: true,
    at: "2026-08-15T00:10:00.000Z",
  });
  assert.equal(confirmed.ota.status, "confirmed");
  assert.equal(confirmed.ota.confirmedAt, "2026-08-15T00:10:00.000Z");
  assert.equal(Object.hasOwn(confirmed.ota, "tokenHash"), false);
  assert.equal(transitionDeviceOtaLifecycle(confirmed.ota, "failed").changed, false);
});

test("out-of-order progress cannot regress and rollback has a terminal path", () => {
  const verifying = activeOta({ status: "verifying" });
  const stale = transitionDeviceOtaLifecycle(verifying, "downloading");
  assert.equal(stale.changed, false);
  assert.equal(stale.ota.status, "verifying");

  const rollingBack = transitionDeviceOtaLifecycle(verifying, "rolling_back", {
    at: "2026-08-15T00:11:00.000Z",
  });
  assert.equal(rollingBack.ota.status, "rolling_back");
  assert.equal(transitionDeviceOtaLifecycle(rollingBack.ota, "rebooting").changed, false);
  const rolledBack = transitionDeviceOtaLifecycle(rollingBack.ota, "rolled_back", {
    at: "2026-08-15T00:12:00.000Z",
  });
  assert.equal(rolledBack.ota.status, "rolled_back");
  assert.equal(Object.hasOwn(rolledBack.ota, "tokenHash"), false);
});

test("failed and expired OTA grants are terminal and revoked", () => {
  for (const status of ["failed", "expired"]) {
    const hydratedTerminal = sanitizeDeviceOtaLifecycle(activeOta({ status }));
    assert.equal(
      Object.hasOwn(hydratedTerminal, "tokenHash"),
      false,
      "a legacy terminal snapshot must lose its verifier during hydration",
    );
    const terminal = transitionDeviceOtaLifecycle(activeOta(), status, {
      at: "2026-08-15T00:20:00.000Z",
    });
    assert.equal(terminal.ota.status, status);
    assert.equal(Object.hasOwn(terminal.ota, "tokenHash"), false);
    assert.equal(
      transitionDeviceOtaLifecycle(terminal.ota, "confirmed", { allowConfirmed: true }).changed,
      false,
    );
  }
});

function otaCommand() {
  const envelope = createDeviceCommandEnvelope({
    id: "cmd-ota-ttl-001",
    type: "ota.update",
    correlationId: "corr-ota-ttl-001",
    issuedAt: "2026-08-15T00:00:00.000Z",
    expiresAt: "2026-08-15T00:00:30.000Z",
  });
  return createDeviceCommandRecord({
    envelope,
    deviceId: "device-ota-001",
    executionExpiresAt: "2026-08-15T02:00:00.000Z",
  });
}

function reportedOtaState(command, state, code) {
  return {
    protocolVersion: 1,
    type: "command.status",
    commandId: command.id,
    correlationId: command.correlationId,
    state,
    code,
  };
}

test("OTA delivery TTL stops applying after an authenticated acknowledgement", () => {
  const command = otaCommand();
  applyDeviceCommandDelivery(
    command,
    { websocket: true, mqtt: false, delivered: true },
    new Date("2026-08-15T00:00:01.000Z"),
  );
  applyDeviceReportedCommandStatus(
    command,
    reportedOtaState(command, "acknowledged", "OTA_ACCEPTED"),
    command.deviceId,
    new Date("2026-08-15T00:00:20.000Z"),
  );

  const overdue = expireDeviceCommandIfOverdue(
    command,
    new Date("2026-08-15T00:00:31.000Z"),
  );
  assert.equal(overdue.changed, false);
  assert.equal(command.state, "acknowledged");

  applyDeviceReportedCommandStatus(
    command,
    reportedOtaState(command, "applying", "OTA_REBOOTING"),
    command.deviceId,
    new Date("2026-08-15T00:01:00.000Z"),
  );
  assert.equal(command.state, "applying");

  const applied = applyDeviceReportedCommandStatus(
    command,
    reportedOtaState(command, "applied", "OTA_BOOT_HEALTH_CONFIRMED"),
    command.deviceId,
    new Date("2026-08-15T00:02:00.000Z"),
  );
  assert.equal(applied.changed, true);
  assert.equal(command.state, "applied");
  assert.equal(
    applyDeviceReportedCommandStatus(
      command,
      reportedOtaState(command, "applied", "OTA_BOOT_HEALTH_CONFIRMED"),
      command.deviceId,
      new Date("2026-08-15T00:02:01.000Z"),
    ).changed,
    false,
  );
});

test("an OTA command that never acknowledges still expires at the delivery deadline", () => {
  const command = otaCommand();
  applyDeviceCommandDelivery(
    command,
    { websocket: true, mqtt: false, delivered: true },
    new Date("2026-08-15T00:00:01.000Z"),
  );
  const overdue = expireDeviceCommandIfOverdue(
    command,
    new Date("2026-08-15T00:00:31.000Z"),
  );
  assert.equal(overdue.changed, true);
  assert.equal(command.state, "expired");
  assert.equal(command.code, "COMMAND_EXPIRED");
});

test("an acknowledged OTA reaches a bounded terminal expiry without boot-health proof", () => {
  const command = otaCommand();
  applyDeviceCommandDelivery(
    command,
    { websocket: true, mqtt: false, delivered: true },
    new Date("2026-08-15T00:00:01.000Z"),
  );
  applyDeviceReportedCommandStatus(
    command,
    reportedOtaState(command, "acknowledged", "OTA_ACCEPTED"),
    command.deviceId,
    new Date("2026-08-15T00:00:20.000Z"),
  );
  const overdue = expireDeviceCommandIfOverdue(
    command,
    new Date("2026-08-15T02:00:00.001Z"),
  );
  assert.equal(overdue.changed, true);
  assert.equal(command.state, "expired");
  assert.equal(command.code, "OTA_EXECUTION_EXPIRED");
});

test("late OTA progress cannot revive execution after its terminal deadline", () => {
  const command = otaCommand();
  applyDeviceCommandDelivery(
    command,
    { websocket: true, mqtt: false, delivered: true },
    new Date("2026-08-15T00:00:01.000Z"),
  );
  applyDeviceReportedCommandStatus(
    command,
    reportedOtaState(command, "acknowledged", "OTA_ACCEPTED"),
    command.deviceId,
    new Date("2026-08-15T00:00:20.000Z"),
  );
  const late = applyDeviceReportedCommandStatus(
    command,
    reportedOtaState(command, "applying", "OTA_REBOOTING"),
    command.deviceId,
    new Date("2026-08-15T02:00:00.001Z"),
  );
  assert.equal(late.changed, true);
  assert.equal(command.state, "expired");
  assert.equal(command.code, "OTA_EXECUTION_EXPIRED");
});
