const test = require("node:test");
const assert = require("node:assert/strict");

const { createRepositories } = require("../src/repositories");
const { transitionDeviceCommand } = require("../src/deviceCommandLifecycle");
const {
  createDeviceOtaOwnershipBinding,
  transitionDeviceOtaLifecycle,
} = require("../src/deviceOtaLifecycle");

const DEVICE_ID = "device_private_ota_repo";
const COMMAND_ID = "command_private_ota_repo";
const ORG_ALPHA = "org_private_ota_alpha";
const ORG_BETA = "org_private_ota_beta";
const OWNER_ALPHA = "user_private_ota_alpha";
const OWNER_BETA = "user_private_ota_beta";
const PLATFORM_ADMIN = "user_private_ota_platform_admin";
const BASE_TIME = "2026-08-15T00:00:00.000Z";

function activeOta(status = "pending") {
  const grant = {
    protocolVersion: 1,
    id: "ota_private_repo",
    commandId: COMMAND_ID,
    correlationId: "correlation_private_repo",
    firmwareVersion: "1.2.3",
    checksum: "a".repeat(64),
    firmwareFileId: "firmware_private_repo",
    firmwareFileName: "firmware.bin",
    firmwareStorageBucket: "device-firmware",
    firmwareObjectKey: "org/org_private_ota_alpha/storage/device-firmware/firmware.bin",
    firmwareByteSize: 4096,
    hardwareTarget: "MSM261S4030H0",
    partitionTarget: "app",
    minimumProtocolVersion: 1,
    tokenHash: `sha256:${"b".repeat(64)}`,
    expiresAt: "2026-08-16T00:00:00.000Z",
    requestedByUserId: PLATFORM_ADMIN,
    organizationId: ORG_ALPHA,
    ownerUserId: OWNER_ALPHA,
    ownershipState: "claimed",
    status,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  };
  return {
    ...grant,
    ownershipBinding: createDeviceOtaOwnershipBinding(grant),
  };
}

function activeCommand(state = "accepted") {
  return {
    protocolVersion: 1,
    id: COMMAND_ID,
    deviceId: DEVICE_ID,
    organizationId: ORG_ALPHA,
    type: "ota.update",
    correlationId: "correlation_private_repo",
    state,
    code: "COMMAND_ACCEPTED",
    detail: "",
    requestedByUserId: PLATFORM_ADMIN,
    issuedAt: BASE_TIME,
    expiresAt: "2026-08-15T00:05:00.000Z",
    executionExpiresAt: "2026-08-16T00:00:00.000Z",
    acceptedAt: BASE_TIME,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  };
}

function runtimeDb(status = "pending") {
  return {
    organizations: [
      { id: ORG_ALPHA, status: "active", workspaceType: "clinic" },
      { id: ORG_BETA, status: "active", workspaceType: "clinic" },
    ],
    users: [
      { id: OWNER_ALPHA, role: "patient", accountStatus: "active" },
      { id: OWNER_BETA, role: "patient", accountStatus: "active" },
      { id: PLATFORM_ADMIN, role: "admin", accountStatus: "active" },
    ],
    memberships: [
      { id: "membership_alpha", userId: OWNER_ALPHA, organizationId: ORG_ALPHA, role: "patient" },
      { id: "membership_beta", userId: OWNER_BETA, organizationId: ORG_BETA, role: "patient" },
    ],
    patients: [],
    devices: [{
      id: DEVICE_ID,
      organizationId: ORG_ALPHA,
      ownershipState: "claimed",
      ownerUserId: OWNER_ALPHA,
      pairedUserId: OWNER_ALPHA,
      assignedPatientId: "",
      revokedAt: "",
      revokedByUserId: "",
      name: "Private OTA device",
      type: "stethoscope",
      status: "available",
      connected: false,
      ota: activeOta(status),
      otaStatus: status,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    }],
    deviceCommands: [activeCommand()],
    deviceClaims: [],
    auditLogs: [],
  };
}

function harness(options = {}) {
  const db = runtimeDb(options.status);
  let rejectSave = Boolean(options.rejectSave);
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {
      if (rejectSave) throw new Error("injected durable save failure");
    },
    createId: (prefix) => `${prefix}_private_ota_repo`,
    nowIso: () => "2026-08-15T00:01:00.000Z",
    getPool: () => null,
  });
  return {
    db,
    repositories,
    allowSave() {
      rejectSave = false;
    },
  };
}

function normalizeSql(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toSqlDeviceRow(device) {
  return {
    id: device.id,
    organization_id: device.organizationId,
    paired_user_id: device.pairedUserId || null,
    owner_user_id: device.ownerUserId || null,
    assigned_patient_id: device.assignedPatientId || null,
    ownership_state: device.ownershipState,
    revoked_by_user_id: device.revokedByUserId || null,
    name: device.name,
    type: device.type,
    status: device.status,
    signal: null,
    battery: null,
    connected: Boolean(device.connected),
    connection_method: null,
    secret_hash: "",
    credential_rotation: {},
    ota: structuredClone(device.ota || {}),
    ota_status: device.otaStatus || device.ota?.status || null,
    firmware_version: "1.1.0",
    telemetry: {},
    last_seen_at: null,
    revoked_at: device.revokedAt || null,
    created_at: device.createdAt,
    updated_at: device.updatedAt,
  };
}

function toSqlCommandRow(command) {
  return {
    protocol_version: command.protocolVersion,
    id: command.id,
    device_id: command.deviceId,
    organization_id: command.organizationId,
    command_type: command.type,
    correlation_id: command.correlationId,
    state: command.state,
    code: command.code,
    detail: command.detail,
    requested_by_user_id: command.requestedByUserId,
    idempotency_key: command.idempotencyKey || null,
    request_fingerprint: command.requestFingerprint || null,
    delivery: command.delivery || {},
    issued_at: command.issuedAt,
    expires_at: command.expiresAt,
    execution_expires_at: command.executionExpiresAt || null,
    accepted_at: command.acceptedAt || null,
    queued_at: command.queuedAt || null,
    delivered_at: command.deliveredAt || null,
    acknowledged_at: command.acknowledgedAt || null,
    applying_at: command.applyingAt || null,
    applied_at: command.appliedAt || null,
    failed_at: command.failedAt || null,
    expired_at: command.expiredAt || null,
    created_at: command.createdAt,
    updated_at: command.updatedAt,
  };
}

function sqlHarness(options = {}) {
  const db = runtimeDb(options.status);
  let deviceRow = toSqlDeviceRow(db.devices[0]);
  let commandRow = toSqlCommandRow(db.deviceCommands[0]);
  let failCommandUpsert = Boolean(options.failCommandUpsert);
  let transactionSnapshot = null;
  const transaction = { committed: false, rolledBack: false };

  const client = {
    async query(text, params = []) {
      const sql = normalizeSql(text);
      if (sql === "BEGIN") {
        transactionSnapshot = {
          deviceRow: structuredClone(deviceRow),
          commandRow: structuredClone(commandRow),
        };
        return { rows: [], rowCount: 0 };
      }
      if (sql === "COMMIT") {
        transaction.committed = true;
        transactionSnapshot = null;
        return { rows: [], rowCount: 0 };
      }
      if (sql === "ROLLBACK") {
        transaction.rolledBack = true;
        if (transactionSnapshot) {
          deviceRow = transactionSnapshot.deviceRow;
          commandRow = transactionSnapshot.commandRow;
        }
        transactionSnapshot = null;
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [{}], rowCount: 1 };
      }
      if (sql === "SELECT * FROM devices WHERE id = $1 FOR UPDATE") {
        return params[0] === DEVICE_ID
          ? { rows: [structuredClone(deviceRow)], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("UPDATE devices SET ota = $2::jsonb")) {
        deviceRow = {
          ...deviceRow,
          ota: JSON.parse(params[1]),
          ota_status: params[2],
          updated_at: params[3],
        };
        return { rows: [structuredClone(deviceRow)], rowCount: 1 };
      }
      if (
        sql === "SELECT * FROM device_commands WHERE device_id = $1 AND id = $2 FOR UPDATE"
      ) {
        return params[0] === DEVICE_ID && params[1] === COMMAND_ID
          ? { rows: [structuredClone(commandRow)], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("INSERT INTO device_commands")) {
        if (failCommandUpsert) throw new Error("injected SQL command write failure");
        commandRow = {
          protocol_version: params[4],
          id: params[0],
          device_id: params[1],
          organization_id: params[2],
          requested_by_user_id: params[3],
          command_type: params[5],
          correlation_id: params[6],
          state: params[7],
          code: params[8],
          detail: params[9],
          delivery: JSON.parse(params[10]),
          idempotency_key: params[11],
          request_fingerprint: params[12],
          issued_at: params[13],
          expires_at: params[14],
          execution_expires_at: params[15],
          accepted_at: params[16],
          queued_at: params[17],
          delivered_at: params[18],
          acknowledged_at: params[19],
          applying_at: params[20],
          applied_at: params[21],
          failed_at: params[22],
          expired_at: params[23],
          created_at: params[24],
          updated_at: params[25],
        };
        return { rows: [], rowCount: 1 };
      }
      if (sql === "SELECT id FROM organizations WHERE id = $1 LIMIT 1") {
        const exists = [ORG_ALPHA, ORG_BETA].includes(params[0]);
        return exists ? { rows: [{ id: params[0] }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM users target")) {
        const exists = [OWNER_ALPHA, OWNER_BETA].includes(params[0]);
        return exists
          ? {
              rows: [{
                id: params[0],
                role: "patient",
                organization_id: params[1],
                account_status: "active",
                has_active_membership: true,
              }],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }
      if (sql === "SELECT id FROM users WHERE id = $1 LIMIT 1") {
        return params[0] === PLATFORM_ADMIN
          ? { rows: [{ id: PLATFORM_ADMIN }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("INSERT INTO devices")) {
        deviceRow = {
          ...deviceRow,
          id: params[0],
          organization_id: params[1],
          paired_user_id: params[2],
          ownership_state: params[3],
          owner_user_id: params[4],
          assigned_patient_id: params[5],
          revoked_by_user_id: params[6],
          name: params[7],
          type: params[8],
          status: params[9],
          connected: Boolean(params[12]),
          revoked_at: params[21],
          updated_at: params[23],
          ota: sql.includes("ota = EXCLUDED.ota") ? JSON.parse(params[26]) : deviceRow.ota,
          ota_status: sql.includes("ota_status = EXCLUDED.ota_status")
            ? params[27]
            : deviceRow.ota_status,
        };
        return { rows: [structuredClone(deviceRow)], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO audit_logs")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in private OTA repository test: ${sql}`);
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
    async query(text, params) {
      return client.query(text, params);
    },
  };
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_private_ota_sql`,
    nowIso: () => "2026-08-15T00:01:00.000Z",
    getPool: () => pool,
    onSqlError: () => {},
  });
  return {
    db,
    repositories,
    transaction,
    allowCommandWrite() {
      failCommandUpsert = false;
    },
    persisted() {
      return {
        deviceRow: structuredClone(deviceRow),
        commandRow: structuredClone(commandRow),
      };
    },
  };
}

function expectedAuthority(ota = activeOta()) {
  return {
    otaId: ota.id,
    commandId: ota.commandId,
    tokenHash: ota.tokenHash,
    expiresAt: ota.expiresAt,
    firmwareFileId: ota.firmwareFileId,
    firmwareStorageBucket: ota.firmwareStorageBucket,
    firmwareObjectKey: ota.firmwareObjectKey,
    firmwareByteSize: ota.firmwareByteSize,
    checksum: ota.checksum,
    organizationId: ORG_ALPHA,
    ownerUserId: OWNER_ALPHA,
    ownershipState: "claimed",
    ownershipBinding: ota.ownershipBinding,
  };
}

test("PostgreSQL device command persistence converts blank optional timestamps to null", async () => {
  const state = sqlHarness();
  const command = {
    ...activeCommand(),
    id: "command_without_optional_timestamps",
    type: "audio.session.start",
    correlationId: "scan_without_optional_timestamps",
    executionExpiresAt: "",
    queuedAt: "",
    deliveredAt: "",
    acknowledgedAt: "",
    applyingAt: "",
    appliedAt: "",
    failedAt: "",
    expiredAt: "",
  };

  await state.repositories.deviceCommands.save(command);

  const persisted = state.persisted().commandRow;
  assert.equal(persisted.execution_expires_at, null);
  assert.equal(persisted.queued_at, null);
  assert.equal(persisted.delivered_at, null);
  assert.equal(persisted.acknowledged_at, null);
  assert.equal(persisted.applying_at, null);
  assert.equal(persisted.applied_at, null);
  assert.equal(persisted.failed_at, null);
  assert.equal(persisted.expired_at, null);
});

test("a stale download failure cannot regress an OTA that already started downloading", async () => {
  const { db, repositories } = harness({ status: "downloading" });
  const failed = transitionDeviceOtaLifecycle(db.devices[0].ota, "failed", {
    at: "2026-08-15T00:02:00.000Z",
    metadata: { failureCode: "OTA_FIRMWARE_STORAGE_UNAVAILABLE" },
  }).ota;
  const failedCommand = structuredClone(db.deviceCommands[0]);
  transitionDeviceCommand(failedCommand, "failed", {
    at: "2026-08-15T00:02:00.000Z",
    code: "OTA_FIRMWARE_STORAGE_UNAVAILABLE",
  });

  await assert.rejects(
    repositories.devices.saveOtaLifecycle(DEVICE_ID, failed, {
      expectedOtaId: failed.id,
      expectedAuthority: expectedAuthority(activeOta("downloading")),
      allowedCurrentStatuses: ["pending", "delivered"],
      command: failedCommand,
    }),
    (error) => error?.code === "DEVICE_OTA_STATE_CHANGED",
  );
  assert.equal(db.devices[0].ota.status, "downloading");
  assert.equal(db.deviceCommands[0].state, "accepted");
});

test("an ownership or immutable binding mismatch rejects the OTA mutation under lock", async () => {
  const { db, repositories } = harness();
  const downloading = transitionDeviceOtaLifecycle(db.devices[0].ota, "downloading", {
    at: "2026-08-15T00:02:00.000Z",
  }).ota;

  await assert.rejects(
    repositories.devices.saveOtaLifecycle(DEVICE_ID, downloading, {
      expectedOtaId: downloading.id,
      expectedAuthority: { ...expectedAuthority(), ownerUserId: OWNER_BETA },
      allowedCurrentStatuses: ["pending", "delivered"],
    }),
    (error) => error?.code === "DEVICE_OTA_AUTHORITY_CHANGED",
  );
  assert.equal(db.devices[0].ota.status, "pending");
});

test("JSON firmware GET authority expires an unacknowledged command at its delivery deadline", async () => {
  const { db, repositories } = harness();

  const result = await repositories.devices.refreshOtaDownloadAuthority(
    DEVICE_ID,
    db.devices[0].ota.id,
    "2026-08-15T00:05:00.001Z",
  );

  assert.equal(result.expired, true);
  assert.equal(result.device.ota.status, "expired");
  assert.equal(Object.hasOwn(result.device.ota, "tokenHash"), false);
  assert.equal(result.command.state, "expired");
  assert.equal(result.command.code, "COMMAND_EXPIRED");
  assert.equal(db.devices[0].ota.status, "expired");
  assert.equal(Object.hasOwn(db.devices[0].ota, "tokenHash"), false);
  assert.equal(db.deviceCommands[0].state, "expired");
  assert.ok(
    Date.parse(db.deviceCommands[0].executionExpiresAt) > Date.parse("2026-08-15T00:05:00.001Z"),
    "the longer execution deadline must not keep an unacknowledged download grant alive",
  );
});

test("JSON firmware GET authority rolls back both expiry records when durable save fails", async () => {
  const state = harness({ rejectSave: true });

  await assert.rejects(
    state.repositories.devices.refreshOtaDownloadAuthority(
      DEVICE_ID,
      state.db.devices[0].ota.id,
      "2026-08-15T00:05:00.001Z",
    ),
    /injected durable save failure/,
  );

  assert.equal(state.db.devices[0].ota.status, "pending");
  assert.equal(Boolean(state.db.devices[0].ota.tokenHash), true);
  assert.equal(state.db.deviceCommands[0].state, "accepted");
});

test("JSON firmware GET authority keeps the execution deadline after device acknowledgement", async () => {
  const { db, repositories } = harness();
  Object.assign(db.deviceCommands[0], {
    state: "acknowledged",
    code: "OTA_ACCEPTED",
    acknowledgedAt: "2026-08-15T00:04:00.000Z",
    updatedAt: "2026-08-15T00:04:00.000Z",
  });

  const result = await repositories.devices.refreshOtaDownloadAuthority(
    DEVICE_ID,
    db.devices[0].ota.id,
    "2026-08-15T00:05:00.001Z",
  );

  assert.equal(result.expired, false);
  assert.equal(result.device.ota.status, "pending");
  assert.equal(Boolean(result.device.ota.tokenHash), true);
  assert.equal(result.command.state, "acknowledged");
});

test("expiry and its matching command commit or roll back together in JSON storage", async () => {
  const state = harness({ rejectSave: true });
  const expired = transitionDeviceOtaLifecycle(state.db.devices[0].ota, "expired", {
    at: "2026-08-16T00:00:00.000Z",
    metadata: { failureCode: "OTA_DOWNLOAD_AUTHORIZATION_EXPIRED" },
  }).ota;
  const expiredCommand = structuredClone(state.db.deviceCommands[0]);
  transitionDeviceCommand(expiredCommand, "expired", {
    at: "2026-08-16T00:00:00.000Z",
    code: "OTA_DOWNLOAD_AUTHORIZATION_EXPIRED",
  });

  const persist = () => state.repositories.devices.saveOtaLifecycle(DEVICE_ID, expired, {
    expectedOtaId: expired.id,
    expectedAuthority: expectedAuthority(),
    allowedCurrentStatuses: ["pending", "delivered", "downloading"],
    command: expiredCommand,
  });
  await assert.rejects(persist(), /injected durable save failure/);
  assert.equal(state.db.devices[0].ota.status, "pending");
  assert.equal(state.db.deviceCommands[0].state, "accepted");
  assert.equal(Boolean(state.db.devices[0].ota.tokenHash), true);

  state.allowSave();
  await persist();
  assert.equal(state.db.devices[0].ota.status, "expired");
  assert.equal(Boolean(state.db.devices[0].ota.tokenHash), false);
  assert.equal(state.db.deviceCommands[0].state, "expired");
});

for (const operation of ["transfer", "revoke"]) {
  test(`${operation} atomically terminalizes an active OTA grant and its command`, async () => {
    const { db, repositories } = harness();
    const intent = {
      deviceId: DEVICE_ID,
      operation,
      actorUserId: PLATFORM_ADMIN,
      expected: {
        organizationId: ORG_ALPHA,
        ownershipState: "claimed",
        ownerUserId: OWNER_ALPHA,
        assignedPatientId: "",
        revokedAt: "",
      },
      at: "2026-08-15T00:03:00.000Z",
      ...(operation === "transfer"
        ? { organizationId: ORG_BETA, ownerUserId: OWNER_BETA }
        : {}),
    };
    const auditLogs = operation === "transfer"
      ? [
          { action: "device.transfer_out", actorUserId: PLATFORM_ADMIN, organizationId: ORG_ALPHA },
          { action: "device.transfer_in", actorUserId: PLATFORM_ADMIN, organizationId: ORG_BETA },
        ]
      : [{ action: "device.revoke", actorUserId: PLATFORM_ADMIN, organizationId: ORG_ALPHA }];

    await repositories.devices.saveOwnershipMutationWithAudit(intent, auditLogs);
    assert.equal(db.devices[0].ota.status, "failed");
    assert.equal(Boolean(db.devices[0].ota.tokenHash), false);
    assert.equal(db.deviceCommands[0].state, "failed");
    assert.equal(
      db.deviceCommands[0].code,
      operation === "revoke" ? "OTA_DEVICE_REVOKED" : "OTA_OWNERSHIP_CHANGED",
    );
  });
}

test("PostgreSQL rolls back OTA expiry when the matching command write fails", async () => {
  const state = sqlHarness({ failCommandUpsert: true });
  const expired = transitionDeviceOtaLifecycle(state.db.devices[0].ota, "expired", {
    at: "2026-08-16T00:00:00.000Z",
    metadata: { failureCode: "OTA_DOWNLOAD_AUTHORIZATION_EXPIRED" },
  }).ota;
  const expiredCommand = structuredClone(state.db.deviceCommands[0]);
  transitionDeviceCommand(expiredCommand, "expired", {
    at: "2026-08-16T00:00:00.000Z",
    code: "OTA_DOWNLOAD_AUTHORIZATION_EXPIRED",
  });
  const persist = () => state.repositories.devices.saveOtaLifecycle(DEVICE_ID, expired, {
    expectedOtaId: expired.id,
    expectedAuthority: expectedAuthority(),
    allowedCurrentStatuses: ["pending", "delivered", "downloading"],
    command: expiredCommand,
  });

  await assert.rejects(persist(), /injected SQL command write failure/);
  assert.equal(state.transaction.rolledBack, true);
  assert.equal(state.persisted().deviceRow.ota_status, "pending");
  assert.equal(state.persisted().commandRow.state, "accepted");

  state.allowCommandWrite();
  await persist();
  assert.equal(state.persisted().deviceRow.ota_status, "expired");
  assert.equal(Boolean(state.persisted().deviceRow.ota.tokenHash), false);
  assert.equal(state.persisted().commandRow.state, "expired");
});

test("PostgreSQL firmware GET authority atomically expires the delivery deadline before OTA expiry", async () => {
  const state = sqlHarness();

  const result = await state.repositories.devices.refreshOtaDownloadAuthority(
    DEVICE_ID,
    activeOta().id,
    "2026-08-15T00:05:00.001Z",
  );

  assert.equal(state.transaction.committed, true);
  assert.equal(result.expired, true);
  assert.equal(result.device.ota.status, "expired");
  assert.equal(Object.hasOwn(result.device.ota, "tokenHash"), false);
  assert.equal(result.command.state, "expired");
  assert.equal(result.command.code, "COMMAND_EXPIRED");
  assert.equal(state.persisted().deviceRow.ota_status, "expired");
  assert.equal(Object.hasOwn(state.persisted().deviceRow.ota, "tokenHash"), false);
  assert.equal(state.persisted().commandRow.state, "expired");
  assert.ok(
    Date.parse(state.persisted().commandRow.execution_expires_at) >
      Date.parse("2026-08-15T00:05:00.001Z"),
  );
});

test("PostgreSQL firmware GET authority rolls back OTA expiry when command expiry cannot commit", async () => {
  const state = sqlHarness({ failCommandUpsert: true });

  await assert.rejects(
    state.repositories.devices.refreshOtaDownloadAuthority(
      DEVICE_ID,
      activeOta().id,
      "2026-08-15T00:05:00.001Z",
    ),
    /injected SQL command write failure/,
  );

  assert.equal(state.transaction.rolledBack, true);
  assert.equal(state.persisted().deviceRow.ota_status, "pending");
  assert.equal(Boolean(state.persisted().deviceRow.ota.tokenHash), true);
  assert.equal(state.persisted().commandRow.state, "accepted");
});

for (const operation of ["transfer", "revoke"]) {
  test(`PostgreSQL ${operation} persists OTA and command invalidation in its ownership transaction`, async () => {
    const state = sqlHarness();
    const intent = {
      deviceId: DEVICE_ID,
      operation,
      actorUserId: PLATFORM_ADMIN,
      expected: {
        organizationId: ORG_ALPHA,
        ownershipState: "claimed",
        ownerUserId: OWNER_ALPHA,
        assignedPatientId: "",
        revokedAt: "",
      },
      at: "2026-08-15T00:03:00.000Z",
      ...(operation === "transfer"
        ? { organizationId: ORG_BETA, ownerUserId: OWNER_BETA }
        : {}),
    };
    const auditLogs = operation === "transfer"
      ? [
          { action: "device.transfer_out", actorUserId: PLATFORM_ADMIN, organizationId: ORG_ALPHA },
          { action: "device.transfer_in", actorUserId: PLATFORM_ADMIN, organizationId: ORG_BETA },
        ]
      : [{ action: "device.revoke", actorUserId: PLATFORM_ADMIN, organizationId: ORG_ALPHA }];

    await state.repositories.devices.saveOwnershipMutationWithAudit(intent, auditLogs);
    assert.equal(state.transaction.committed, true);
    assert.equal(state.persisted().deviceRow.ota_status, "failed");
    assert.equal(Boolean(state.persisted().deviceRow.ota.tokenHash), false);
    assert.equal(state.persisted().commandRow.state, "failed");
    assert.equal(
      state.persisted().commandRow.code,
      operation === "revoke" ? "OTA_DEVICE_REVOKED" : "OTA_OWNERSHIP_CHANGED",
    );
  });
}
