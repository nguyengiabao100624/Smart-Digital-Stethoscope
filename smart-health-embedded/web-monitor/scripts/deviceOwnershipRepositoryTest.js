const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createRepositories } = require("../src/repositories");

const DEVICE_ID = "device_ownership_repository";
const ORG_ALPHA = "org_ownership_alpha";
const ORG_BETA = "org_ownership_beta";
const ORG_GAMMA = "org_ownership_gamma";
const OWNER_ALPHA = "user_owner_alpha";
const OWNER_BETA = "user_owner_beta";
const OWNER_GAMMA = "user_owner_gamma";
const ADMIN_ALPHA = "user_admin_alpha";
const PLATFORM_ADMIN = "user_platform_admin";
const PATIENT_ALPHA = "patient_ownership_alpha";
const PATIENT_ALPHA_SECOND = "patient_ownership_alpha_second";
const PATIENT_BETA = "patient_ownership_beta";
const BASE_TIME = "2026-07-18T08:00:00.000Z";
const CANONICAL_SECRET_HASH = `sha256:${"a".repeat(64)}`;
const STALE_SECRET_HASH = `sha256:${"b".repeat(64)}`;
const ROTATION_NEXT_SECRET_HASH = `sha256:${"e".repeat(64)}`;
const ROTATION_MISMATCH_SECRET_HASH = `sha256:${"f".repeat(64)}`;
const NON_PROMOTING_ROTATION_STATES = [
  "initiated",
  "pending_device_ack",
  "confirming",
  "rolled_back",
  "expired",
  "failed",
];

function canonicalCredentialRotation() {
  return {
    id: "rotation_canonical",
    state: "pending_device_ack",
    nextSecretHash: `sha256:${"c".repeat(64)}`,
    requestedByUserId: ADMIN_ALPHA,
    commandId: "command_rotation_canonical",
    requestedAt: "2026-07-18T09:07:00.000Z",
    expiresAt: "2026-07-18T09:17:00.000Z",
    updatedAt: "2026-07-18T09:07:00.000Z",
  };
}

function staleCredentialRotation() {
  return {
    id: "rotation_stale_clone",
    state: "pending_device_ack",
    nextSecretHash: `sha256:${"d".repeat(64)}`,
    requestedByUserId: "user_stale_clone",
    commandId: "command_rotation_stale_clone",
    requestedAt: "2026-07-18T08:57:00.000Z",
    expiresAt: "2026-07-18T09:07:00.000Z",
    updatedAt: "2026-07-18T08:57:00.000Z",
  };
}

function activeCredentialRotation() {
  return {
    id: "rotation_security_cas",
    state: "pending_device_ack",
    nextSecretHash: ROTATION_NEXT_SECRET_HASH,
    requestedByUserId: ADMIN_ALPHA,
    commandId: "command_rotation_security_cas",
    requestedAt: "2026-07-18T09:10:00.000Z",
    expiresAt: "2026-07-18T09:20:00.000Z",
    updatedAt: "2026-07-18T09:10:00.000Z",
  };
}

function rotationExpected(rotation) {
  return {
    id: rotation.id,
    state: rotation.state,
    updatedAt: rotation.updatedAt,
  };
}

function proposedRotationDevice(device, state, proposedSecretHash, updatedAt) {
  return {
    ...device,
    secretHash: proposedSecretHash,
    credentialRotation: {
      ...activeCredentialRotation(),
      state,
      updatedAt,
    },
    updatedAt,
  };
}

function createRuntimeDb() {
  return {
    organizations: [
      { id: ORG_ALPHA, status: "active", workspaceType: "clinic", type: "clinic" },
      { id: ORG_BETA, status: "active", workspaceType: "clinic", type: "clinic" },
      { id: ORG_GAMMA, status: "active", workspaceType: "clinic", type: "clinic" },
    ],
    users: [
      { id: OWNER_ALPHA, role: "patient", organizationId: ORG_ALPHA, accountStatus: "active" },
      { id: OWNER_BETA, role: "patient", organizationId: ORG_BETA, accountStatus: "active" },
      { id: OWNER_GAMMA, role: "patient", organizationId: ORG_GAMMA, accountStatus: "active" },
      {
        id: ADMIN_ALPHA,
        role: "workspace_admin",
        organizationId: ORG_ALPHA,
        accountStatus: "active",
        roleRequestStatus: "approved",
      },
      { id: PLATFORM_ADMIN, role: "admin", organizationId: "", accountStatus: "active" },
    ],
    memberships: [
      { id: "membership_owner_alpha", userId: OWNER_ALPHA, organizationId: ORG_ALPHA, role: "patient" },
      { id: "membership_owner_beta", userId: OWNER_BETA, organizationId: ORG_BETA, role: "patient" },
      { id: "membership_owner_gamma", userId: OWNER_GAMMA, organizationId: ORG_GAMMA, role: "patient" },
      { id: "membership_admin_alpha", userId: ADMIN_ALPHA, organizationId: ORG_ALPHA, role: "workspace_admin" },
    ],
    patients: [
      { id: PATIENT_ALPHA, organizationId: ORG_ALPHA, ownerUserId: OWNER_ALPHA, name: "Alpha patient" },
      {
        id: PATIENT_ALPHA_SECOND,
        organizationId: ORG_ALPHA,
        ownerUserId: OWNER_ALPHA,
        name: "Second alpha patient",
      },
      { id: PATIENT_BETA, organizationId: ORG_BETA, ownerUserId: OWNER_BETA, name: "Beta patient" },
    ],
    devices: [
      {
        id: DEVICE_ID,
        organizationId: ORG_ALPHA,
        ownershipState: "claimed",
        ownerUserId: OWNER_ALPHA,
        pairedUserId: OWNER_ALPHA,
        assignedPatientId: "",
        revokedAt: "",
        revokedByUserId: "",
        name: "Canonical device",
        type: "stethoscope",
        status: "available",
        connected: false,
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      },
    ],
    deviceClaims: [
      {
        id: "claim_ownership_alpha",
        deviceId: DEVICE_ID,
        organizationId: ORG_ALPHA,
        claimedAt: "",
        revokedAt: "",
        revokedByUserId: "",
        createdAt: BASE_TIME,
        updatedAt: BASE_TIME,
      },
    ],
    auditLogs: [],
  };
}

function createHarness(options = {}) {
  const db = createRuntimeDb();
  let sequence = 0;
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: options.saveDb || (async () => {}),
    createId: (prefix) => `${prefix}_ownership_repository_${++sequence}`,
    nowIso: () => `2026-07-18T08:00:${String(sequence).padStart(2, "0")}.000Z`,
    getPool: () => null,
  });
  return { db, repositories };
}

function claimedExpected() {
  return {
    organizationId: ORG_ALPHA,
    ownershipState: "claimed",
    ownerUserId: OWNER_ALPHA,
    assignedPatientId: "",
    revokedAt: "",
  };
}

function auditInput(action, overrides = {}) {
  return {
    action,
    actorUserId: ADMIN_ALPHA,
    organizationId: ORG_ALPHA,
    metadata: {},
    ...overrides,
  };
}

function assignmentIdempotency(key, fingerprint = `assign:${PATIENT_ALPHA}`) {
  return {
    scope: `${ADMIN_ALPHA}:${ORG_ALPHA}`,
    operation: `device.ownership.update:${DEVICE_ID}`,
    key,
    fingerprint,
  };
}

function transferIdempotency(key) {
  return {
    scope: PLATFORM_ADMIN,
    operation: `device.transfer:${DEVICE_ID}`,
    key,
    fingerprint: `transfer:${ORG_BETA}:${OWNER_BETA}`,
  };
}

function transferIntent(at, idempotency = null) {
  return {
    deviceId: DEVICE_ID,
    operation: "transfer",
    actorUserId: PLATFORM_ADMIN,
    expected: claimedExpected(),
    organizationId: ORG_BETA,
    ownerUserId: OWNER_BETA,
    at,
    revokeOpenClaims: true,
    claimOrganizationId: ORG_ALPHA,
    ...(idempotency ? { idempotency } : {}),
  };
}

function transferAudits() {
  return [
    auditInput("device.transfer_out", { actorUserId: PLATFORM_ADMIN }),
    auditInput("device.transfer_in", {
      actorUserId: PLATFORM_ADMIN,
      organizationId: ORG_BETA,
    }),
  ];
}

function transferredExpected() {
  return {
    organizationId: ORG_BETA,
    ownershipState: "claimed",
    ownerUserId: OWNER_BETA,
    assignedPatientId: "",
    revokedAt: "",
  };
}

function assignIntent(patientId, at, idempotency = null) {
  return {
    deviceId: DEVICE_ID,
    operation: "assign",
    actorUserId: ADMIN_ALPHA,
    expected: claimedExpected(),
    assignedPatientId: patientId,
    at,
    ...(idempotency ? { idempotency } : {}),
  };
}

function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim();
}

function toSqlDeviceRow(device) {
  return {
    id: device.id,
    organization_id: device.organizationId || null,
    paired_user_id: device.pairedUserId || null,
    ownership_state: device.ownershipState || "provisioned",
    owner_user_id: device.ownerUserId || null,
    assigned_patient_id: device.assignedPatientId || null,
    revoked_by_user_id: device.revokedByUserId || null,
    name: device.name,
    type: device.type,
    status: device.status,
    signal: device.signal ?? null,
    battery: device.battery ?? null,
    connected: Boolean(device.connected),
    connection_method: device.connectionMethod || null,
    secret_hash: device.secretHash || null,
    firmware_version: device.firmwareVersion || null,
    manufacturer: device.manufacturer || null,
    model: device.model || null,
    serial_number: device.serialNumber || null,
    purchase_date: device.purchaseDate || null,
    last_seen_at: device.lastSeenAt || null,
    revoked_at: device.revokedAt || null,
    created_at: device.createdAt,
    updated_at: device.updatedAt,
    telemetry: device.telemetry || {},
    credential_rotation: device.credentialRotation || {},
  };
}

function createSqlHarness(options = {}) {
  const db = createRuntimeDb();
  let canonicalDeviceRow = toSqlDeviceRow({
    ...db.devices[0],
    ...(options.canonicalDevice || {}),
  });
  const auditRowCounts = [...(options.auditRowCounts || [])];
  const mutationIdempotencyRows = [
    ...(options.mutationIdempotencyRows || []),
  ];
  const queries = [];
  const transaction = {
    committed: false,
    released: false,
    rolledBack: false,
  };

  const client = {
    async query(text, params = []) {
      const sql = normalizeSql(text);
      const entry = { kind: "unknown", sql, params: [...params] };
      queries.push(entry);

      if (sql === "BEGIN") {
        entry.kind = "begin";
        return { rows: [], rowCount: 0 };
      }
      if (sql === "COMMIT") {
        entry.kind = "commit";
        transaction.committed = true;
        return { rows: [], rowCount: 0 };
      }
      if (sql === "ROLLBACK") {
        entry.kind = "rollback";
        transaction.rolledBack = true;
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
        entry.kind = "advisory_lock";
        return { rows: [{}], rowCount: 1 };
      }
      if (sql === "SELECT * FROM devices WHERE id = $1 FOR UPDATE") {
        entry.kind = "device_lock";
        return params[0] === DEVICE_ID
          ? { rows: [{ ...canonicalDeviceRow }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql === "SELECT id FROM organizations WHERE id = $1 LIMIT 1") {
        entry.kind = "organization_target";
        const organization = db.organizations.find((item) => item.id === params[0]);
        return organization
          ? { rows: [{ id: organization.id }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM users actor") && sql.includes("FOR SHARE OF actor, workspace")) {
        entry.kind = "ownership_replay_actor";
        const user = db.users.find((item) => item.id === params[0]);
        const workspace = db.organizations.find((item) => item.id === params[1]);
        if (!user || !workspace) return { rows: [], rowCount: 0 };
        return {
          rows: [{
            id: user.id,
            role: user.role,
            account_status: user.accountStatus || "active",
            requested_role: user.requestedRole || null,
            role_request_status: user.roleRequestStatus || null,
            workspace_id: workspace.id,
            workspace_status: workspace.status || null,
            workspace_type: workspace.workspaceType || null,
            workspace_type_legacy: workspace.type || null,
            workspace_owner_user_id: workspace.ownerUserId || null,
            workspace_deleted_at: workspace.deletedAt || null,
          }],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM memberships") && sql.includes("FOR SHARE")) {
        entry.kind = "ownership_replay_membership";
        const membership = db.memberships.find(
          (item) =>
            item.userId === params[0] &&
            item.organizationId === params[1],
        );
        return membership
          ? {
              rows: [{
                role: membership.role,
                status: membership.status || "active",
              }],
              rowCount: 1,
            }
          : { rows: [], rowCount: 0 };
      }
      if (sql.includes("FROM users target")) {
        entry.kind = "owner_target";
        const user = db.users.find((item) => item.id === params[0]);
        if (!user) return { rows: [], rowCount: 0 };
        const hasActiveMembership = db.memberships.some(
          (membership) =>
            membership.userId === user.id &&
            membership.organizationId === params[1] &&
            !membership.revokedAt &&
            !["inactive", "suspended", "revoked"].includes(
              String(membership.status || "active").toLowerCase(),
            ),
        );
        return {
          rows: [
            {
              id: user.id,
              role: user.role,
              organization_id: user.organizationId || null,
              account_status: user.accountStatus || "active",
              has_active_membership: hasActiveMembership,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM patients") && sql.includes("organization_id = $2")) {
        entry.kind = "patient_target";
        const patient = db.patients.find(
          (item) =>
            item.id === params[0] &&
            item.organizationId === params[1] &&
            !item.deletedAt,
        );
        return patient
          ? { rows: [{ id: patient.id }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql === "SELECT id FROM users WHERE id = $1 LIMIT 1") {
        entry.kind = "audit_actor";
        const actor = db.users.find((item) => item.id === params[0]);
        return actor
          ? { rows: [{ id: actor.id }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("INSERT INTO devices")) {
        entry.kind = "device_upsert";
        const previous = canonicalDeviceRow;
        canonicalDeviceRow = {
          ...previous,
          name: params[7],
          type: params[8],
          status: previous.ownership_state === "revoked" || previous.revoked_at
            ? "revoked"
            : params[9],
          signal: params[10],
          battery: params[11],
          connected: previous.ownership_state === "revoked" || previous.revoked_at
            ? false
            : Boolean(params[12]),
          connection_method: params[13],
          firmware_version: params[15],
          manufacturer: params[16],
          model: params[17],
          serial_number: params[18],
          purchase_date: params[19],
          last_seen_at: params[20],
          revoked_at: previous.revoked_at || params[21],
          updated_at: params[23],
          telemetry: JSON.parse(params[24]),
        };
        if (sql.includes("organization_id = EXCLUDED.organization_id")) {
          canonicalDeviceRow.organization_id = params[1];
          canonicalDeviceRow.paired_user_id = params[2];
          canonicalDeviceRow.ownership_state = params[3];
          canonicalDeviceRow.owner_user_id = params[4];
          canonicalDeviceRow.assigned_patient_id = params[5];
          canonicalDeviceRow.revoked_by_user_id = params[6];
        }
        if (sql.includes("secret_hash = EXCLUDED.secret_hash")) {
          canonicalDeviceRow.secret_hash = params[14];
        } else if (
          sql.includes("secret_hash = COALESCE(NULLIF(devices.secret_hash, ''), EXCLUDED.secret_hash)") &&
          !canonicalDeviceRow.secret_hash
        ) {
          canonicalDeviceRow.secret_hash = params[14];
        }
        if (sql.includes("credential_rotation = EXCLUDED.credential_rotation")) {
          canonicalDeviceRow.credential_rotation = JSON.parse(params[25]);
        }
        return { rows: [{ ...canonicalDeviceRow }], rowCount: 1 };
      }
      if (sql.startsWith("UPDATE device_claims")) {
        entry.kind = "claim_revoke";
        const matchingClaims = db.deviceClaims.filter(
          (claim) =>
            claim.deviceId === params[0] &&
            !claim.claimedAt &&
            !claim.revokedAt &&
            (!params[3] || claim.organizationId === params[3]),
        );
        return {
          rows: matchingClaims.map((claim) => ({ id: claim.id })),
          rowCount: matchingClaims.length,
        };
      }
      if (sql.startsWith("INSERT INTO audit_logs")) {
        entry.kind = "audit_insert";
        const rowCount = auditRowCounts.length > 0 ? auditRowCounts.shift() : 1;
        return { rows: [], rowCount };
      }
      if (sql.includes("FROM mutation_idempotency")) {
        entry.kind = "idempotency_lookup";
        const match = mutationIdempotencyRows.find(
          (row) =>
            row.scope === params[0] &&
            row.operation === params[1] &&
            row.idempotency_key === params[2],
        );
        return match
          ? { rows: [{ ...match }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("INSERT INTO mutation_idempotency")) {
        entry.kind = "idempotency_insert";
        mutationIdempotencyRows.push({
          id: params[0],
          scope: params[1],
          operation: params[2],
          idempotency_key: params[3],
          fingerprint: params[4],
          resource_type: params[5],
          resource_id: params[6],
          response_status: params[7],
          response_json: JSON.parse(params[8]),
        });
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO device_claims")) {
        entry.kind = "claim_insert";
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO notifications")) {
        entry.kind = "notification_upsert";
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in ownership repository test: ${sql}`);
    },
    release() {
      transaction.released = true;
    },
  };
  const pool = {
    async connect() {
      return client;
    },
    async query(text, params) {
      return client.query(text, params);
    },
  };
  let sequence = 0;
  const repositories = createRepositories({
    getDb: () => db,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_ownership_sql_${++sequence}`,
    nowIso: () => `2026-07-18T09:00:${String(sequence).padStart(2, "0")}.000Z`,
    getPool: () => pool,
    onSqlError: () => {},
  });
  return {
    db,
    queries,
    repositories,
    transaction,
    mutationIdempotencyRows,
  };
}

test("two assignment intents derived from the same claimed device cannot both commit", async () => {
  const { db, repositories } = createHarness();
  const attempts = await Promise.allSettled([
    repositories.devices.saveOwnershipMutationWithAudit(
      assignIntent(PATIENT_ALPHA, "2026-07-18T08:01:00.000Z"),
      [auditInput("device.assign_patient", { metadata: { patientId: PATIENT_ALPHA } })],
    ),
    repositories.devices.saveOwnershipMutationWithAudit(
      assignIntent(PATIENT_ALPHA_SECOND, "2026-07-18T08:01:01.000Z"),
      [auditInput("device.assign_patient", { metadata: { patientId: PATIENT_ALPHA_SECOND } })],
    ),
  ]);

  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
  const persisted = await repositories.devices.findById(DEVICE_ID);
  assert.equal(persisted.ownershipState, "assigned");
  assert.ok([PATIENT_ALPHA, PATIENT_ALPHA_SECOND].includes(persisted.assignedPatientId));
  assert.equal(db.auditLogs.length, 1);
});

test("a transfer intent based on pre-revoke state cannot overwrite a committed revoke", async () => {
  const { db, repositories } = createHarness();
  const revokeAt = "2026-07-18T08:02:00.000Z";
  await repositories.devices.saveOwnershipMutationWithAudit(
    {
      deviceId: DEVICE_ID,
      operation: "revoke",
      actorUserId: ADMIN_ALPHA,
      expected: claimedExpected(),
      at: revokeAt,
      revokeOpenClaims: true,
    },
    [auditInput("device.revoke")],
  );

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: DEVICE_ID,
        operation: "transfer",
        actorUserId: PLATFORM_ADMIN,
        expected: claimedExpected(),
        organizationId: ORG_BETA,
        ownerUserId: OWNER_BETA,
        at: "2026-07-18T08:02:01.000Z",
        revokeOpenClaims: true,
      },
      [
        auditInput("device.transfer_out", { actorUserId: PLATFORM_ADMIN }),
        auditInput("device.transfer_in", {
          actorUserId: PLATFORM_ADMIN,
          organizationId: ORG_BETA,
        }),
      ],
    ),
  );

  const persisted = await repositories.devices.findById(DEVICE_ID);
  assert.equal(persisted.ownershipState, "revoked");
  assert.equal(persisted.revokedAt, revokeAt);
  assert.equal(persisted.organizationId, ORG_ALPHA);
  assert.equal(db.auditLogs.length, 1);
});

test("a JSON persistence failure restores device, claim, and audit state", async () => {
  const { db, repositories } = createHarness({
    saveDb: async () => {
      throw new Error("simulated JSON persistence failure");
    },
  });

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: DEVICE_ID,
        operation: "revoke",
        actorUserId: ADMIN_ALPHA,
        expected: claimedExpected(),
        at: "2026-07-18T08:03:00.000Z",
        revokeOpenClaims: true,
      },
      [auditInput("device.revoke")],
    ),
    /simulated JSON persistence failure/,
  );

  const persisted = await repositories.devices.findById(DEVICE_ID);
  assert.equal(persisted.ownershipState, "claimed");
  assert.equal(persisted.revokedAt, "");
  assert.equal(db.deviceClaims[0].revokedAt, "");
  assert.equal(db.deviceClaims[0].revokedByUserId, "");
  assert.equal(db.auditLogs.length, 0);
});

test("an assignment cannot bind a device to a patient in another tenant", async () => {
  const { db, repositories } = createHarness();

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      assignIntent(PATIENT_BETA, "2026-07-18T08:04:00.000Z"),
      [auditInput("device.assign_patient", { metadata: { patientId: PATIENT_BETA } })],
    ),
  );

  const persisted = await repositories.devices.findById(DEVICE_ID);
  assert.equal(persisted.ownershipState, "claimed");
  assert.equal(persisted.assignedPatientId, "");
  assert.equal(db.auditLogs.length, 0);
});

test("a transfer cannot bind the target workspace to an owner from another tenant", async () => {
  const { db, repositories } = createHarness();

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: DEVICE_ID,
        operation: "transfer",
        actorUserId: PLATFORM_ADMIN,
        expected: claimedExpected(),
        organizationId: ORG_BETA,
        ownerUserId: OWNER_GAMMA,
        at: "2026-07-18T08:05:00.000Z",
        revokeOpenClaims: true,
      },
      [
        auditInput("device.transfer_out", { actorUserId: PLATFORM_ADMIN }),
        auditInput("device.transfer_in", {
          actorUserId: PLATFORM_ADMIN,
          organizationId: ORG_BETA,
        }),
      ],
    ),
  );

  const persisted = await repositories.devices.findById(DEVICE_ID);
  assert.equal(persisted.organizationId, ORG_ALPHA);
  assert.equal(persisted.ownerUserId, OWNER_ALPHA);
  assert.equal(db.auditLogs.length, 0);
});

test("a suspended default-workspace membership cannot retain canonical device ownership", async () => {
  const { db, repositories } = createHarness();
  const ownerMembership = db.memberships.find(
    (membership) =>
      membership.userId === OWNER_ALPHA &&
      membership.organizationId === ORG_ALPHA,
  );
  ownerMembership.status = "suspended";

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: DEVICE_ID,
        operation: "update",
        actorUserId: ADMIN_ALPHA,
        expected: claimedExpected(),
        patch: { name: "Must not preserve a suspended owner" },
        at: "2026-07-18T08:05:30.000Z",
      },
      [auditInput("device.update")],
    ),
    (error) => error.code === "DEVICE_OWNER_WORKSPACE_MISMATCH",
  );

  assert.equal(db.devices[0].name, "Canonical device");
  assert.equal(db.auditLogs.length, 0);
});

test("an ownership mutation rejects an audit record without an actor", async () => {
  const { db, repositories } = createHarness();

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: DEVICE_ID,
        operation: "update",
        actorUserId: "",
        expected: claimedExpected(),
        patch: { name: "Rejected rename" },
        at: "2026-07-18T08:06:00.000Z",
      },
      [auditInput("device.update", { actorUserId: "" })],
    ),
  );

  const persisted = await repositories.devices.findById(DEVICE_ID);
  assert.equal(persisted.name, "Canonical device");
  assert.equal(db.auditLogs.length, 0);
});

test("an ownership mutation rejects an audit record without an organization", async () => {
  const { db, repositories } = createHarness();

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: DEVICE_ID,
        operation: "update",
        actorUserId: ADMIN_ALPHA,
        expected: claimedExpected(),
        patch: { name: "Rejected rename" },
        at: "2026-07-18T08:07:00.000Z",
      },
      [auditInput("device.update", { organizationId: "" })],
    ),
  );

  const persisted = await repositories.devices.findById(DEVICE_ID);
  assert.equal(persisted.name, "Canonical device");
  assert.equal(db.auditLogs.length, 0);
});

test("a successful assignment persists one canonical device state and exactly one audit", async () => {
  const { db, repositories } = createHarness();

  const result = await repositories.devices.saveOwnershipMutationWithAudit(
    assignIntent(PATIENT_ALPHA, "2026-07-18T08:08:00.000Z"),
    [auditInput("device.assign_patient", { metadata: { patientId: PATIENT_ALPHA } })],
  );

  const persisted = await repositories.devices.findById(DEVICE_ID);
  assert.equal(result.device.id, DEVICE_ID);
  assert.equal(persisted.ownershipState, "assigned");
  assert.equal(persisted.assignedPatientId, PATIENT_ALPHA);
  assert.equal(persisted.ownerUserId, OWNER_ALPHA);
  assert.equal(persisted.pairedUserId, OWNER_ALPHA);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.auditLogs[0].action, "device.assign_patient");
  assert.equal(db.auditLogs[0].actorUserId, ADMIN_ALPHA);
  assert.equal(db.auditLogs[0].organizationId, ORG_ALPHA);
  assert.equal(db.auditLogs[0].resourceType, "device");
  assert.equal(db.auditLogs[0].resourceId, DEVICE_ID);
});

test("a platform allocation atomically moves workspace, responsible account, and patient", async () => {
  const { db, repositories } = createHarness();
  const result = await repositories.devices.saveOwnershipMutationWithAudit(
    {
      deviceId: DEVICE_ID,
      operation: "allocate",
      actorUserId: PLATFORM_ADMIN,
      expected: claimedExpected(),
      organizationId: ORG_BETA,
      ownerUserId: OWNER_BETA,
      assignedPatientId: PATIENT_BETA,
      at: "2026-07-18T08:08:10.000Z",
      revokeOpenClaims: true,
      claimOrganizationId: ORG_ALPHA,
    },
    [
      auditInput("device.assignment.update", { actorUserId: PLATFORM_ADMIN }),
      auditInput("device.assignment.update", {
        actorUserId: PLATFORM_ADMIN,
        organizationId: ORG_BETA,
      }),
    ],
  );

  assert.equal(result.device.organizationId, ORG_BETA);
  assert.equal(result.device.ownerUserId, OWNER_BETA);
  assert.equal(result.device.pairedUserId, OWNER_BETA);
  assert.equal(result.device.assignedPatientId, PATIENT_BETA);
  assert.equal(result.device.ownershipState, "assigned");
  assert.equal(db.deviceClaims[0].revokedByUserId, PLATFORM_ADMIN);
  assert.equal(db.auditLogs.length, 2);
  assert.deepEqual(
    db.auditLogs.map((item) => item.organizationId).sort(),
    [ORG_ALPHA, ORG_BETA].sort(),
  );
});

test("a platform allocation can return a device to unassigned workspace inventory", async () => {
  const { db, repositories } = createHarness();
  const result = await repositories.devices.saveOwnershipMutationWithAudit(
    {
      deviceId: DEVICE_ID,
      operation: "allocate",
      actorUserId: PLATFORM_ADMIN,
      expected: claimedExpected(),
      organizationId: ORG_ALPHA,
      ownerUserId: "",
      assignedPatientId: "",
      at: "2026-07-18T08:08:11.000Z",
      revokeOpenClaims: true,
      claimOrganizationId: ORG_ALPHA,
    },
    [auditInput("device.assignment.update", { actorUserId: PLATFORM_ADMIN })],
  );

  assert.equal(result.device.organizationId, ORG_ALPHA);
  assert.equal(result.device.ownerUserId, null);
  assert.equal(result.device.pairedUserId, null);
  assert.equal(result.device.assignedPatientId, null);
  assert.equal(result.device.ownershipState, "provisioned");
  assert.equal(db.auditLogs.length, 1);
});

test("a runtime assignment replays one exact receipt without duplicating the audit", async () => {
  const { db, repositories } = createHarness();
  const idempotency = assignmentIdempotency("assignment-runtime-replay");
  const intent = assignIntent(
    PATIENT_ALPHA,
    "2026-07-18T08:08:30.000Z",
    idempotency,
  );
  const audits = [
    auditInput("device.assign_patient", {
      metadata: { patientId: PATIENT_ALPHA },
    }),
  ];

  const first = await repositories.devices.saveOwnershipMutationWithAudit(
    intent,
    audits,
  );
  const replay = await repositories.devices.saveOwnershipMutationWithAudit(
    intent,
    audits,
  );

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.device.id, DEVICE_ID);
  assert.equal(replay.device.assignedPatientId, PATIENT_ALPHA);
  assert.equal(replay.auditLogs.length, 0);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(db.idempotencyKeys.length, 1);
});

test("a runtime transfer replay rejects a raw platform_admin account without platform capability", async () => {
  const { db, repositories } = createHarness();
  const intent = transferIntent(
    "2026-07-18T08:08:30.100Z",
    transferIdempotency("transfer-runtime-raw-platform-admin"),
  );
  const audits = transferAudits();

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  const adminReplay = await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  assert.equal(adminReplay.replayed, true);
  assert.equal(adminReplay.auditLogs.length, 0);
  const actor = db.users.find((item) => item.id === PLATFORM_ADMIN);
  actor.role = "platform_admin";
  const beforeReplay = JSON.stringify({
    devices: db.devices,
    claims: db.deviceClaims,
    audits: db.auditLogs,
    idempotency: db.idempotencyKeys,
  });

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
  assert.equal(JSON.stringify({
    devices: db.devices,
    claims: db.deviceClaims,
    audits: db.auditLogs,
    idempotency: db.idempotencyKeys,
  }), beforeReplay);
});

test("a runtime transfer replay follows an operational platform_admin membership capability", async () => {
  const { db, repositories } = createHarness();
  const intent = transferIntent(
    "2026-07-18T08:08:30.150Z",
    transferIdempotency("transfer-runtime-platform-membership"),
  );
  const audits = transferAudits();

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  const actor = db.users.find((item) => item.id === PLATFORM_ADMIN);
  Object.assign(actor, {
    role: "workspace_admin",
    roleRequestStatus: "approved",
  });
  const membership = {
    id: "membership_platform_beta",
    userId: PLATFORM_ADMIN,
    organizationId: ORG_BETA,
    role: "platform_admin",
    status: "active",
  };
  db.memberships.push(membership);

  const replay = await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  assert.equal(replay.replayed, true);
  assert.equal(replay.auditLogs.length, 0);
  assert.equal(db.auditLogs.length, 2);
  assert.equal(db.idempotencyKeys.length, 1);

  membership.status = "suspended";
  const beforeRejectedReplay = JSON.stringify({
    devices: db.devices,
    claims: db.deviceClaims,
    audits: db.auditLogs,
    idempotency: db.idempotencyKeys,
  });
  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
  assert.equal(JSON.stringify({
    devices: db.devices,
    claims: db.deviceClaims,
    audits: db.auditLogs,
    idempotency: db.idempotencyKeys,
  }), beforeRejectedReplay);
});

test("a runtime patient replay rejects canonical role demotion while patient membership remains active", async () => {
  const { db, repositories } = createHarness();
  const intent = {
    ...assignIntent(PATIENT_ALPHA, "2026-07-18T08:08:30.200Z"),
    actorUserId: OWNER_ALPHA,
    idempotency: {
      scope: `${OWNER_ALPHA}:${ORG_ALPHA}`,
      operation: `device.ownership.update:${DEVICE_ID}`,
      key: "assignment-runtime-patient-role-demotion",
      fingerprint: `assign:${PATIENT_ALPHA}:patient-owner`,
    },
  };
  const audits = [
    auditInput("device.assign_patient", {
      actorUserId: OWNER_ALPHA,
      metadata: { patientId: PATIENT_ALPHA },
    }),
  ];

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  db.users.find((item) => item.id === OWNER_ALPHA).role = "viewer";
  const beforeReplay = JSON.stringify({
    devices: db.devices,
    claims: db.deviceClaims,
    audits: db.auditLogs,
    idempotency: db.idempotencyKeys,
  });

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
  assert.equal(JSON.stringify({
    devices: db.devices,
    claims: db.deviceClaims,
    audits: db.auditLogs,
    idempotency: db.idempotencyKeys,
  }), beforeReplay);
});

test("a runtime ownership replay reauthorizes the actor's current workspace membership", async () => {
  const { db, repositories } = createHarness();
  const idempotency = assignmentIdempotency("assignment-runtime-actor-reauthorization");
  const intent = assignIntent(
    PATIENT_ALPHA,
    "2026-07-18T08:08:30.500Z",
    idempotency,
  );
  const audits = [
    auditInput("device.assign_patient", {
      metadata: { patientId: PATIENT_ALPHA },
    }),
  ];

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  const membership = db.memberships.find(
    (item) => item.userId === ADMIN_ALPHA && item.organizationId === ORG_ALPHA,
  );
  membership.status = "suspended";

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
  assert.equal(db.auditLogs.length, 1);
});

test("a runtime ownership replay rejects a workspace role whose approval was withdrawn", async () => {
  const { db, repositories } = createHarness();
  const intent = assignIntent(
    PATIENT_ALPHA,
    "2026-07-18T08:08:30.600Z",
    assignmentIdempotency("assignment-runtime-workspace-approval"),
  );
  const audits = [
    auditInput("device.assign_patient", {
      metadata: { patientId: PATIENT_ALPHA },
    }),
  ];

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  db.users.find((item) => item.id === ADMIN_ALPHA).roleRequestStatus = "rejected";

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
  assert.equal(db.auditLogs.length, 1);
});

for (const scenario of [
  {
    name: "requested doctor role was removed",
    revoke: ({ user }) => {
      user.requestedRole = "";
    },
  },
  {
    name: "doctor approval was withdrawn",
    revoke: ({ user }) => {
      user.roleRequestStatus = "rejected";
    },
  },
  {
    name: "canonical user role was demoted",
    revoke: ({ user }) => {
      user.role = "viewer";
    },
  },
  {
    name: "workspace became personal",
    revoke: ({ workspace }) => {
      workspace.workspaceType = "personal";
      workspace.type = "personal";
    },
  },
]) {
  test(`a runtime doctor replay rejects when ${scenario.name}`, async () => {
    const { db, repositories } = createHarness();
    const user = db.users.find((item) => item.id === ADMIN_ALPHA);
    const membership = db.memberships.find(
      (item) => item.userId === ADMIN_ALPHA && item.organizationId === ORG_ALPHA,
    );
    const workspace = db.organizations.find((item) => item.id === ORG_ALPHA);
    Object.assign(user, {
      role: "doctor",
      requestedRole: "doctor",
      roleRequestStatus: "approved",
    });
    membership.role = "doctor";
    Object.assign(workspace, {
      workspaceType: "solo_practice",
      type: "clinic",
      ownerUserId: ADMIN_ALPHA,
    });
    const intent = assignIntent(
      PATIENT_ALPHA,
      "2026-07-18T08:08:30.700Z",
      assignmentIdempotency(`assignment-runtime-doctor-${scenario.name}`),
    );
    const audits = [
      auditInput("device.assign_patient", {
        metadata: { patientId: PATIENT_ALPHA },
      }),
    ];

    await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
    const authorizedReplay = await repositories.devices.saveOwnershipMutationWithAudit(
      intent,
      audits,
    );
    assert.equal(authorizedReplay.replayed, true);
    scenario.revoke({ user, membership, workspace });

    await assert.rejects(
      repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
      (error) => {
        assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
        return true;
      },
    );
    assert.equal(db.auditLogs.length, 1);
  });
}

test("a runtime transfer receipt becomes stale after the canonical device is revoked", async () => {
  const { db, repositories } = createHarness();
  const transfer = transferIntent(
    "2026-07-18T08:08:31.000Z",
    transferIdempotency("transfer-runtime-revoke-replay"),
  );

  await repositories.devices.saveOwnershipMutationWithAudit(transfer, transferAudits());
  await repositories.devices.saveOwnershipMutationWithAudit(
    {
      deviceId: DEVICE_ID,
      operation: "revoke",
      actorUserId: PLATFORM_ADMIN,
      expected: transferredExpected(),
      at: "2026-07-18T08:08:32.000Z",
      revokeOpenClaims: true,
    },
    [
      auditInput("device.revoke", {
        actorUserId: PLATFORM_ADMIN,
        organizationId: ORG_BETA,
      }),
    ],
  );

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(transfer, transferAudits()),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_STALE");
      assert.deepEqual(error.details.mismatches.sort(), ["ownershipState", "revokedAt"]);
      return true;
    },
  );
  assert.equal(db.devices[0].ownershipState, "revoked");
  assert.equal(db.devices[0].organizationId, ORG_BETA);
  assert.equal(db.auditLogs.length, 3);
});

test("a runtime assignment rejects one key reused for a different patient", async () => {
  const { db, repositories } = createHarness();
  const key = "assignment-runtime-conflict";
  await repositories.devices.saveOwnershipMutationWithAudit(
    assignIntent(
      PATIENT_ALPHA,
      "2026-07-18T08:08:31.000Z",
      assignmentIdempotency(key, `assign:${PATIENT_ALPHA}`),
    ),
    [
      auditInput("device.assign_patient", {
        metadata: { patientId: PATIENT_ALPHA },
      }),
    ],
  );

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      assignIntent(
        PATIENT_ALPHA_SECOND,
        "2026-07-18T08:08:32.000Z",
        assignmentIdempotency(key, `assign:${PATIENT_ALPHA_SECOND}`),
      ),
      [
        auditInput("device.assign_patient", {
          metadata: { patientId: PATIENT_ALPHA_SECOND },
        }),
      ],
    ),
    (error) => {
      assert.equal(error.code, "IDEMPOTENCY_KEY_REUSED");
      return true;
    },
  );

  assert.equal(db.devices[0].assignedPatientId, PATIENT_ALPHA);
  assert.equal(db.auditLogs.length, 1);
});

test("a runtime persistence failure rolls back assignment, audit, and idempotency receipt", async () => {
  const { db, repositories } = createHarness({
    saveDb: async () => {
      throw new Error("forced ownership persistence failure");
    },
  });

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      assignIntent(
        PATIENT_ALPHA,
        "2026-07-18T08:08:33.000Z",
        assignmentIdempotency("assignment-runtime-rollback"),
      ),
      [
        auditInput("device.assign_patient", {
          metadata: { patientId: PATIENT_ALPHA },
        }),
      ],
    ),
    /forced ownership persistence failure/,
  );

  assert.equal(db.devices[0].ownershipState, "claimed");
  assert.equal(db.devices[0].assignedPatientId, "");
  assert.equal(db.auditLogs.length, 0);
  assert.equal((db.idempotencyKeys || []).length, 0);
});

test("SQL locks the canonical device before persisting direct ownership values", async () => {
  const { db, queries, repositories, transaction } = createSqlHarness();
  db.devices[0] = {
    ...db.devices[0],
    ownershipState: "revoked",
    revokedAt: "2026-07-18T08:59:00.000Z",
    status: "revoked",
  };

  const result = await repositories.devices.saveOwnershipMutationWithAudit(
    assignIntent(PATIENT_ALPHA, "2026-07-18T09:01:00.000Z"),
    [auditInput("device.assign_patient", { metadata: { patientId: PATIENT_ALPHA } })],
  );

  const lockIndex = queries.findIndex((query) => query.kind === "device_lock");
  const upsertIndex = queries.findIndex((query) => query.kind === "device_upsert");
  assert.ok(lockIndex >= 0);
  assert.ok(upsertIndex > lockIndex);
  const upsert = queries[upsertIndex];
  assert.match(upsert.sql, /VALUES \( \$1, \$2, \$3, \$4, \$5, \$6, \$7,/);
  assert.deepEqual(upsert.params.slice(1, 6), [
    ORG_ALPHA,
    OWNER_ALPHA,
    "assigned",
    OWNER_ALPHA,
    PATIENT_ALPHA,
  ]);
  assert.equal(
    upsert.params[21],
    null,
    "an empty revokedAt value must be persisted as SQL NULL, not an invalid empty timestamp",
  );
  assert.equal(result.device.ownershipState, "assigned");
  assert.equal(result.device.assignedPatientId, PATIENT_ALPHA);
  assert.equal(transaction.committed, true);
  assert.equal(transaction.rolledBack, false);
  assert.equal(transaction.released, true);
});

test("SQL persists one atomic platform allocation across workspace, owner, and patient", async () => {
  const { queries, repositories, transaction } = createSqlHarness();
  const result = await repositories.devices.saveOwnershipMutationWithAudit(
    {
      deviceId: DEVICE_ID,
      operation: "allocate",
      actorUserId: PLATFORM_ADMIN,
      expected: claimedExpected(),
      organizationId: ORG_BETA,
      ownerUserId: OWNER_BETA,
      assignedPatientId: PATIENT_BETA,
      at: "2026-07-18T09:01:10.000Z",
      revokeOpenClaims: true,
      claimOrganizationId: ORG_ALPHA,
    },
    [
      auditInput("device.assignment.update", { actorUserId: PLATFORM_ADMIN }),
      auditInput("device.assignment.update", {
        actorUserId: PLATFORM_ADMIN,
        organizationId: ORG_BETA,
      }),
    ],
  );

  const upsert = queries.find((query) => query.kind === "device_upsert");
  assert.ok(upsert);
  assert.deepEqual(upsert.params.slice(1, 6), [
    ORG_BETA,
    OWNER_BETA,
    "assigned",
    OWNER_BETA,
    PATIENT_BETA,
  ]);
  assert.equal(result.device.organizationId, ORG_BETA);
  assert.equal(result.device.ownerUserId, OWNER_BETA);
  assert.equal(result.device.assignedPatientId, PATIENT_BETA);
  assert.equal(queries.filter((query) => query.kind === "audit_insert").length, 2);
  assert.equal(transaction.committed, true);
  assert.equal(transaction.rolledBack, false);
});

test("SQL assignment replay returns the stored receipt without another device or audit write", async () => {
  const {
    db,
    queries,
    repositories,
    mutationIdempotencyRows,
  } = createSqlHarness();
  const idempotency = assignmentIdempotency("assignment-sql-replay");
  const intent = assignIntent(
    PATIENT_ALPHA,
    "2026-07-18T09:01:30.000Z",
    idempotency,
  );
  const audits = [
    auditInput("device.assign_patient", {
      metadata: { patientId: PATIENT_ALPHA },
    }),
  ];

  const first = await repositories.devices.saveOwnershipMutationWithAudit(
    intent,
    audits,
  );
  const replay = await repositories.devices.saveOwnershipMutationWithAudit(
    intent,
    audits,
  );

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.device.id, DEVICE_ID);
  assert.equal(replay.device.assignedPatientId, PATIENT_ALPHA);
  const replayDeviceLockIndex = queries.findLastIndex(
    (query) => query.kind === "device_lock",
  );
  const replayLookupIndex = queries.findLastIndex(
    (query) => query.kind === "idempotency_lookup",
  );
  assert.ok(replayDeviceLockIndex >= 0);
  assert.ok(replayLookupIndex > replayDeviceLockIndex);
  assert.equal(queries.filter((query) => query.kind === "device_upsert").length, 1);
  assert.equal(queries.filter((query) => query.kind === "audit_insert").length, 1);
  assert.equal(
    queries.filter((query) => query.kind === "idempotency_insert").length,
    1,
  );
  assert.equal(mutationIdempotencyRows.length, 1);
  assert.equal(db.auditLogs.length, 1);
});

test("SQL transfer replay rejects a raw platform_admin account without platform capability", async () => {
  const { db, queries, repositories, mutationIdempotencyRows } = createSqlHarness();
  const intent = transferIntent(
    "2026-07-18T09:01:30.100Z",
    transferIdempotency("transfer-sql-raw-platform-admin"),
  );
  const audits = transferAudits();

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  const adminReplay = await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  assert.equal(adminReplay.replayed, true);
  assert.equal(adminReplay.auditLogs.length, 0);
  db.users.find((item) => item.id === PLATFORM_ADMIN).role = "platform_admin";
  const writesBeforeReplay = queries.filter((query) =>
    ["device_upsert", "claim_revoke", "audit_insert", "idempotency_insert"].includes(query.kind)
  ).length;

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
  const writesAfterReplay = queries.filter((query) =>
    ["device_upsert", "claim_revoke", "audit_insert", "idempotency_insert"].includes(query.kind)
  ).length;
  assert.equal(writesAfterReplay, writesBeforeReplay);
  assert.equal(db.auditLogs.length, 2);
  assert.equal(mutationIdempotencyRows.length, 1);
});

test("SQL transfer replay follows an operational platform_admin membership capability", async () => {
  const { db, queries, repositories, mutationIdempotencyRows } = createSqlHarness();
  const intent = transferIntent(
    "2026-07-18T09:01:30.150Z",
    transferIdempotency("transfer-sql-platform-membership"),
  );
  const audits = transferAudits();

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  const actor = db.users.find((item) => item.id === PLATFORM_ADMIN);
  Object.assign(actor, {
    role: "workspace_admin",
    roleRequestStatus: "approved",
  });
  const membership = {
    id: "membership_sql_platform_beta",
    userId: PLATFORM_ADMIN,
    organizationId: ORG_BETA,
    role: "platform_admin",
    status: "active",
  };
  db.memberships.push(membership);

  const replay = await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  assert.equal(replay.replayed, true);
  assert.equal(replay.auditLogs.length, 0);
  assert.equal(db.auditLogs.length, 2);
  assert.equal(mutationIdempotencyRows.length, 1);

  membership.status = "suspended";
  const writesBeforeRejectedReplay = queries.filter((query) =>
    ["device_upsert", "claim_revoke", "audit_insert", "idempotency_insert"].includes(query.kind)
  ).length;
  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
  const writesAfterRejectedReplay = queries.filter((query) =>
    ["device_upsert", "claim_revoke", "audit_insert", "idempotency_insert"].includes(query.kind)
  ).length;
  assert.equal(writesAfterRejectedReplay, writesBeforeRejectedReplay);
  assert.equal(db.auditLogs.length, 2);
  assert.equal(mutationIdempotencyRows.length, 1);
});

test("SQL patient replay rejects canonical role demotion while patient membership remains active", async () => {
  const { db, queries, repositories, mutationIdempotencyRows } = createSqlHarness();
  const intent = {
    ...assignIntent(PATIENT_ALPHA, "2026-07-18T09:01:30.200Z"),
    actorUserId: OWNER_ALPHA,
    idempotency: {
      scope: `${OWNER_ALPHA}:${ORG_ALPHA}`,
      operation: `device.ownership.update:${DEVICE_ID}`,
      key: "assignment-sql-patient-role-demotion",
      fingerprint: `assign:${PATIENT_ALPHA}:patient-owner`,
    },
  };
  const audits = [
    auditInput("device.assign_patient", {
      actorUserId: OWNER_ALPHA,
      metadata: { patientId: PATIENT_ALPHA },
    }),
  ];

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  db.users.find((item) => item.id === OWNER_ALPHA).role = "viewer";
  const writesBeforeReplay = queries.filter((query) =>
    ["device_upsert", "claim_revoke", "audit_insert", "idempotency_insert"].includes(query.kind)
  ).length;

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
  const writesAfterReplay = queries.filter((query) =>
    ["device_upsert", "claim_revoke", "audit_insert", "idempotency_insert"].includes(query.kind)
  ).length;
  assert.equal(writesAfterReplay, writesBeforeReplay);
  assert.equal(db.auditLogs.length, 1);
  assert.equal(mutationIdempotencyRows.length, 1);
});

test("SQL ownership replay reauthorizes the actor against canonical membership state", async () => {
  const { db, repositories } = createSqlHarness();
  const idempotency = assignmentIdempotency("assignment-sql-actor-reauthorization");
  const intent = assignIntent(
    PATIENT_ALPHA,
    "2026-07-18T09:01:31.000Z",
    idempotency,
  );
  const audits = [
    auditInput("device.assign_patient", {
      metadata: { patientId: PATIENT_ALPHA },
    }),
  ];

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  const membership = db.memberships.find(
    (item) => item.userId === ADMIN_ALPHA && item.organizationId === ORG_ALPHA,
  );
  membership.status = "suspended";

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
});

test("SQL ownership replay rejects a workspace role whose approval was withdrawn", async () => {
  const { db, repositories } = createSqlHarness();
  const intent = assignIntent(
    PATIENT_ALPHA,
    "2026-07-18T09:01:31.100Z",
    assignmentIdempotency("assignment-sql-workspace-approval"),
  );
  const audits = [
    auditInput("device.assign_patient", {
      metadata: { patientId: PATIENT_ALPHA },
    }),
  ];

  await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
  db.users.find((item) => item.id === ADMIN_ALPHA).roleRequestStatus = "rejected";

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
      return true;
    },
  );
});

for (const scenario of [
  {
    name: "requested doctor role was removed",
    revoke: ({ user }) => {
      user.requestedRole = "";
    },
  },
  {
    name: "doctor approval was withdrawn",
    revoke: ({ user }) => {
      user.roleRequestStatus = "rejected";
    },
  },
  {
    name: "canonical user role was demoted",
    revoke: ({ user }) => {
      user.role = "viewer";
    },
  },
  {
    name: "workspace became personal",
    revoke: ({ workspace }) => {
      workspace.workspaceType = "personal";
      workspace.type = "personal";
    },
  },
]) {
  test(`SQL doctor replay rejects when ${scenario.name}`, async () => {
    const { db, repositories } = createSqlHarness();
    const user = db.users.find((item) => item.id === ADMIN_ALPHA);
    const membership = db.memberships.find(
      (item) => item.userId === ADMIN_ALPHA && item.organizationId === ORG_ALPHA,
    );
    const workspace = db.organizations.find((item) => item.id === ORG_ALPHA);
    Object.assign(user, {
      role: "doctor",
      requestedRole: "doctor",
      roleRequestStatus: "approved",
    });
    membership.role = "doctor";
    Object.assign(workspace, {
      workspaceType: "solo_practice",
      type: "clinic",
      ownerUserId: ADMIN_ALPHA,
    });
    const intent = assignIntent(
      PATIENT_ALPHA,
      "2026-07-18T09:01:31.200Z",
      assignmentIdempotency(`assignment-sql-doctor-${scenario.name}`),
    );
    const audits = [
      auditInput("device.assign_patient", {
        metadata: { patientId: PATIENT_ALPHA },
      }),
    ];

    await repositories.devices.saveOwnershipMutationWithAudit(intent, audits);
    const authorizedReplay = await repositories.devices.saveOwnershipMutationWithAudit(
      intent,
      audits,
    );
    assert.equal(authorizedReplay.replayed, true);
    scenario.revoke({ user, membership, workspace });

    await assert.rejects(
      repositories.devices.saveOwnershipMutationWithAudit(intent, audits),
      (error) => {
        assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_FORBIDDEN");
        return true;
      },
    );
  });
}

test("SQL transfer replay fails closed after a later canonical revoke", async () => {
  const { db, queries, repositories } = createSqlHarness();
  const transfer = transferIntent(
    "2026-07-18T09:01:32.000Z",
    transferIdempotency("transfer-sql-revoke-replay"),
  );

  await repositories.devices.saveOwnershipMutationWithAudit(transfer, transferAudits());
  await repositories.devices.saveOwnershipMutationWithAudit(
    {
      deviceId: DEVICE_ID,
      operation: "revoke",
      actorUserId: PLATFORM_ADMIN,
      expected: transferredExpected(),
      at: "2026-07-18T09:01:33.000Z",
      revokeOpenClaims: true,
    },
    [
      auditInput("device.revoke", {
        actorUserId: PLATFORM_ADMIN,
        organizationId: ORG_BETA,
      }),
    ],
  );
  const writesBeforeReplay = queries.filter(
    (query) => ["device_upsert", "audit_insert", "claim_revoke"].includes(query.kind),
  ).length;

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(transfer, transferAudits()),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_REPLAY_STALE");
      assert.deepEqual(error.details.mismatches.sort(), ["ownershipState", "revokedAt"]);
      return true;
    },
  );
  const writesAfterReplay = queries.filter(
    (query) => ["device_upsert", "audit_insert", "claim_revoke"].includes(query.kind),
  ).length;
  assert.equal(writesAfterReplay, writesBeforeReplay);
  assert.equal(db.devices[0].ownershipState, "revoked");
  assert.equal(db.devices[0].organizationId, ORG_BETA);
});

test("SQL target validation rejects invalid patient and owner ids before upsert", async () => {
  const invalidTargets = [
    {
      label: "patient",
      intent: assignIntent("patient_missing", "2026-07-18T09:02:00.000Z"),
      audits: [auditInput("device.assign_patient", { metadata: { patientId: "patient_missing" } })],
      expectedCode: "DEVICE_PATIENT_WORKSPACE_MISMATCH",
    },
    {
      label: "owner",
      intent: {
        deviceId: DEVICE_ID,
        operation: "transfer",
        actorUserId: PLATFORM_ADMIN,
        expected: claimedExpected(),
        organizationId: ORG_BETA,
        ownerUserId: "user_owner_missing",
        at: "2026-07-18T09:02:01.000Z",
        revokeOpenClaims: true,
      },
      audits: [
        auditInput("device.transfer_out", { actorUserId: PLATFORM_ADMIN }),
        auditInput("device.transfer_in", {
          actorUserId: PLATFORM_ADMIN,
          organizationId: ORG_BETA,
        }),
      ],
      expectedCode: "DEVICE_OWNER_WORKSPACE_MISMATCH",
    },
  ];

  for (const scenario of invalidTargets) {
    const { queries, repositories, transaction } = createSqlHarness();
    await assert.rejects(
      repositories.devices.saveOwnershipMutationWithAudit(
        scenario.intent,
        scenario.audits,
      ),
      (error) => {
        assert.equal(error.code, scenario.expectedCode, scenario.label);
        return true;
      },
    );
    assert.equal(
      queries.some((query) => query.kind === "device_upsert"),
      false,
      `${scenario.label} must be rejected before device upsert`,
    );
    assert.equal(
      queries.some((query) => query.kind === "audit_insert"),
      false,
      `${scenario.label} must be rejected before audit insert`,
    );
    assert.equal(transaction.committed, false);
    assert.equal(transaction.rolledBack, true);
  }
});

test("SQL device ownership rejects a default-workspace owner whose membership is suspended", async () => {
  const { db, queries, repositories, transaction } = createSqlHarness();
  const ownerMembership = db.memberships.find(
    (membership) =>
      membership.userId === OWNER_BETA &&
      membership.organizationId === ORG_BETA,
  );
  ownerMembership.status = "suspended";

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: DEVICE_ID,
        operation: "transfer",
        actorUserId: PLATFORM_ADMIN,
        expected: claimedExpected(),
        organizationId: ORG_BETA,
        ownerUserId: OWNER_BETA,
        at: "2026-07-18T09:02:30.000Z",
        revokeOpenClaims: true,
      },
      [
        auditInput("device.transfer_out", { actorUserId: PLATFORM_ADMIN }),
        auditInput("device.transfer_in", {
          actorUserId: PLATFORM_ADMIN,
          organizationId: ORG_BETA,
        }),
      ],
    ),
    (error) => error.code === "DEVICE_OWNER_WORKSPACE_MISMATCH",
  );

  assert.equal(queries.some((query) => query.kind === "device_upsert"), false);
  assert.equal(transaction.committed, false);
  assert.equal(transaction.rolledBack, true);
});

test("SQL stale expected ownership aborts before upsert and audit", async () => {
  const { queries, repositories, transaction } = createSqlHarness();
  const staleIntent = assignIntent(PATIENT_ALPHA, "2026-07-18T09:03:00.000Z");
  staleIntent.expected = {
    ...staleIntent.expected,
    ownershipState: "assigned",
    assignedPatientId: PATIENT_ALPHA_SECOND,
  };

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      staleIntent,
      [auditInput("device.assign_patient", { metadata: { patientId: PATIENT_ALPHA } })],
    ),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_STALE");
      return true;
    },
  );

  assert.equal(queries.some((query) => query.kind === "device_lock"), true);
  assert.equal(queries.some((query) => query.kind === "device_upsert"), false);
  assert.equal(queries.some((query) => query.kind === "audit_insert"), false);
  assert.equal(transaction.committed, false);
  assert.equal(transaction.rolledBack, true);
  assert.equal(transaction.released, true);
});

test("SQL cross-workspace transfer writes two audits and scopes claim revoke to source workspace", async () => {
  const { db, queries, repositories, transaction } = createSqlHarness();
  const transferAt = "2026-07-18T09:04:00.000Z";
  const result = await repositories.devices.saveOwnershipMutationWithAudit(
    {
      deviceId: DEVICE_ID,
      operation: "transfer",
      actorUserId: PLATFORM_ADMIN,
      expected: claimedExpected(),
      organizationId: ORG_BETA,
      ownerUserId: OWNER_BETA,
      at: transferAt,
      revokeOpenClaims: true,
    },
    [
      auditInput("device.transfer_out", { actorUserId: PLATFORM_ADMIN }),
      auditInput("device.transfer_in", {
        actorUserId: PLATFORM_ADMIN,
        organizationId: ORG_BETA,
      }),
    ],
  );

  const claimRevoke = queries.find((query) => query.kind === "claim_revoke");
  const auditInserts = queries.filter((query) => query.kind === "audit_insert");
  const upsert = queries.find((query) => query.kind === "device_upsert");
  assert.ok(claimRevoke);
  assert.deepEqual(claimRevoke.params, [DEVICE_ID, PLATFORM_ADMIN, transferAt, ORG_ALPHA]);
  assert.equal(auditInserts.length, 2);
  assert.deepEqual(
    auditInserts.map((query) => query.params[2]).sort(),
    [ORG_ALPHA, ORG_BETA].sort(),
  );
  assert.equal(upsert.params[1], ORG_BETA);
  assert.equal(upsert.params[2], OWNER_BETA);
  assert.equal(upsert.params[4], OWNER_BETA);
  assert.equal(result.auditLogs.length, 2);
  assert.equal(result.device.organizationId, ORG_BETA);
  assert.equal(result.device.ownerUserId, OWNER_BETA);
  assert.equal(db.auditLogs.length, 2);
  assert.equal(db.deviceClaims[0].organizationId, ORG_ALPHA);
  assert.equal(db.deviceClaims[0].revokedAt, transferAt);
  assert.equal(transaction.committed, true);
  assert.equal(transaction.rolledBack, false);
});

test("SQL zero-row audit insert rolls back an otherwise valid ownership mutation", async () => {
  const { db, queries, repositories, transaction } = createSqlHarness({
    auditRowCounts: [0],
  });

  await assert.rejects(
    repositories.devices.saveOwnershipMutationWithAudit(
      assignIntent(PATIENT_ALPHA, "2026-07-18T09:05:00.000Z"),
      [auditInput("device.assign_patient", { metadata: { patientId: PATIENT_ALPHA } })],
    ),
    (error) => {
      assert.equal(error.code, "DEVICE_OWNERSHIP_AUDIT_CONFLICT");
      return true;
    },
  );

  assert.equal(queries.some((query) => query.kind === "device_upsert"), true);
  assert.equal(queries.filter((query) => query.kind === "audit_insert").length, 1);
  assert.equal(transaction.committed, false);
  assert.equal(transaction.rolledBack, true);
  assert.equal(transaction.released, true);
  assert.equal(db.devices[0].ownershipState, "claimed");
  assert.equal(db.devices[0].assignedPatientId, "");
  assert.equal(db.auditLogs.length, 0);
});

test("generic JSON telemetry save cannot overwrite canonical ownership assignment or revoke", async () => {
  const { db, repositories } = createHarness();
  const revokedAt = "2026-07-18T09:06:00.000Z";
  db.devices[0] = {
    ...db.devices[0],
    ownershipState: "revoked",
    assignedPatientId: PATIENT_ALPHA,
    revokedAt,
    revokedByUserId: ADMIN_ALPHA,
    connected: false,
    status: "revoked",
  };

  const staleTelemetrySnapshot = {
    ...db.devices[0],
    organizationId: ORG_BETA,
    ownershipState: "claimed",
    ownerUserId: OWNER_BETA,
    pairedUserId: OWNER_BETA,
    assignedPatientId: PATIENT_BETA,
    revokedAt: "",
    revokedByUserId: "",
    connected: true,
    status: "connected",
    battery: 87,
    lastSeenAt: "2026-07-18T09:06:30.000Z",
    telemetry: { rssi: -54, audioHealth: "healthy" },
    updatedAt: "2026-07-18T09:06:30.000Z",
  };

  const saved = await repositories.devices.save(staleTelemetrySnapshot);
  const persisted = await repositories.devices.findById(DEVICE_ID);
  for (const device of [saved, persisted]) {
    assert.equal(device.organizationId, ORG_ALPHA);
    assert.equal(device.ownershipState, "revoked");
    assert.equal(device.ownerUserId, OWNER_ALPHA);
    assert.equal(device.pairedUserId, OWNER_ALPHA);
    assert.equal(device.assignedPatientId, PATIENT_ALPHA);
    assert.equal(device.revokedAt, revokedAt);
    assert.equal(device.revokedByUserId, ADMIN_ALPHA);
    assert.equal(device.connected, false);
    assert.equal(device.status, "revoked");
    assert.equal(device.battery, 87);
    assert.deepEqual(device.telemetry, { rssi: -54, audioHealth: "healthy" });
  }
});

test("generic JSON save preserves security-owned secret and credential rotation", async () => {
  const { db, repositories } = createHarness();
  const canonicalRotation = canonicalCredentialRotation();
  db.devices[0] = {
    ...db.devices[0],
    secretHash: CANONICAL_SECRET_HASH,
    credentialRotation: canonicalRotation,
  };
  const staleClone = {
    ...db.devices[0],
    secretHash: STALE_SECRET_HASH,
    credentialRotation: staleCredentialRotation(),
    battery: 73,
    telemetry: { rssi: -61 },
    updatedAt: "2026-07-18T09:08:00.000Z",
  };

  const saved = await repositories.devices.save(staleClone);
  const persisted = await repositories.devices.findById(DEVICE_ID);
  for (const device of [saved, persisted]) {
    assert.equal(device.secretHash, CANONICAL_SECRET_HASH);
    assert.deepEqual(device.credentialRotation, canonicalRotation);
    assert.equal(device.battery, 73);
    assert.deepEqual(device.telemetry, { rssi: -61 });
  }
});

test("generic SQL save writes canonical security-owned secret and credential rotation", async () => {
  const canonicalRotation = canonicalCredentialRotation();
  const { db, queries, repositories } = createSqlHarness({
    canonicalDevice: {
      secretHash: CANONICAL_SECRET_HASH,
      credentialRotation: canonicalRotation,
    },
  });
  db.devices[0] = {
    ...db.devices[0],
    secretHash: CANONICAL_SECRET_HASH,
    credentialRotation: canonicalRotation,
  };
  const staleClone = {
    ...db.devices[0],
    secretHash: STALE_SECRET_HASH,
    credentialRotation: staleCredentialRotation(),
    battery: 74,
    telemetry: { freeHeapBytes: 62_000 },
    updatedAt: "2026-07-18T09:09:00.000Z",
  };

  const saved = await repositories.devices.save(staleClone);
  const upsert = queries.find((query) => query.kind === "device_upsert");
  assert.ok(upsert);
  assert.equal(upsert.params[14], CANONICAL_SECRET_HASH);
  const persistedRotation = JSON.parse(upsert.params[25]);
  for (const [field, value] of Object.entries(canonicalRotation)) {
    assert.deepEqual(persistedRotation[field], value);
  }
  assert.equal(saved.secretHash, CANONICAL_SECRET_HASH);
  for (const [field, value] of Object.entries(canonicalRotation)) {
    assert.deepEqual(saved.credentialRotation[field], value);
  }
  assert.equal(saved.battery, 74);
  assert.deepEqual(saved.telemetry, { freeHeapBytes: 62_000 });
});

test("JSON credential rotation retains the active secret in every non-confirmed state", async (t) => {
  for (const [index, state] of NON_PROMOTING_ROTATION_STATES.entries()) {
    await t.test(state, async () => {
      const { db, repositories } = createHarness();
      const currentRotation = activeCredentialRotation();
      db.devices[0] = {
        ...db.devices[0],
        secretHash: CANONICAL_SECRET_HASH,
        credentialRotation: currentRotation,
      };
      const proposed = proposedRotationDevice(
        db.devices[0],
        state,
        ROTATION_MISMATCH_SECRET_HASH,
        `2026-07-18T09:1${index + 1}:00.000Z`,
      );
      if (["rolled_back", "expired", "failed"].includes(state)) {
        proposed.credentialRotation.nextSecretHash = "";
      }

      const result = await repositories.devices.saveCredentialRotationWithAudit(
        proposed,
        auditInput(`device.secret_rotation.${state}`),
        null,
        200,
        null,
        rotationExpected(currentRotation),
      );

      assert.equal(result.device.secretHash, CANONICAL_SECRET_HASH);
      assert.equal(db.devices[0].secretHash, CANONICAL_SECRET_HASH);
      assert.equal(db.devices[0].credentialRotation.state, state);
    });
  }
});

test("JSON credential rotation promotes only the current candidate hash on confirmed", async () => {
  const { db, repositories } = createHarness();
  const currentRotation = activeCredentialRotation();
  db.devices[0] = {
    ...db.devices[0],
    secretHash: CANONICAL_SECRET_HASH,
    credentialRotation: currentRotation,
  };

  const mismatch = proposedRotationDevice(
    db.devices[0],
    "confirmed",
    ROTATION_MISMATCH_SECRET_HASH,
    "2026-07-18T09:16:00.000Z",
  );
  mismatch.credentialRotation.nextSecretHash = "";
  await assert.rejects(
    repositories.devices.saveCredentialRotationWithAudit(
      mismatch,
      auditInput("device.secret_rotation.confirmed"),
      null,
      200,
      null,
      rotationExpected(currentRotation),
    ),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "DEVICE_SECRET_ROTATION_CANDIDATE_MISMATCH");
      return true;
    },
  );
  assert.equal(db.devices[0].secretHash, CANONICAL_SECRET_HASH);
  assert.equal(db.auditLogs.length, 0);

  const matching = proposedRotationDevice(
    db.devices[0],
    "confirmed",
    ROTATION_NEXT_SECRET_HASH,
    "2026-07-18T09:17:00.000Z",
  );
  matching.credentialRotation.nextSecretHash = "";
  const result = await repositories.devices.saveCredentialRotationWithAudit(
    matching,
    auditInput("device.secret_rotation.confirmed"),
    null,
    200,
    null,
    rotationExpected(currentRotation),
  );
  assert.equal(result.device.secretHash, ROTATION_NEXT_SECRET_HASH);
  assert.equal(db.devices[0].secretHash, ROTATION_NEXT_SECRET_HASH);
});

test("SQL credential rotation writes the secret column only for a matching confirmation", async (t) => {
  await t.test("non-confirmed states retain the canonical secret", async () => {
    for (const [index, state] of NON_PROMOTING_ROTATION_STATES.entries()) {
      const currentRotation = activeCredentialRotation();
      const { db, queries, repositories } = createSqlHarness({
        canonicalDevice: {
          secretHash: CANONICAL_SECRET_HASH,
          credentialRotation: currentRotation,
        },
      });
      db.devices[0] = {
        ...db.devices[0],
        secretHash: CANONICAL_SECRET_HASH,
        credentialRotation: currentRotation,
      };
      const proposed = proposedRotationDevice(
        db.devices[0],
        state,
        ROTATION_MISMATCH_SECRET_HASH,
        `2026-07-18T09:2${index + 1}:00.000Z`,
      );
      if (["rolled_back", "expired", "failed"].includes(state)) {
        proposed.credentialRotation.nextSecretHash = "";
      }

      const result = await repositories.devices.saveCredentialRotationWithAudit(
        proposed,
        auditInput(`device.secret_rotation.${state}`),
        null,
        200,
        null,
        rotationExpected(currentRotation),
      );
      const upsert = queries.find((query) => query.kind === "device_upsert");
      assert.ok(upsert);
      assert.equal(upsert.sql.includes("secret_hash = EXCLUDED.secret_hash"), false);
      assert.equal(result.device.secretHash, CANONICAL_SECRET_HASH);
      assert.equal(db.devices[0].secretHash, CANONICAL_SECRET_HASH);
    }
  });

  await t.test("confirmed rejects a mismatched candidate before SQL writes", async () => {
    const currentRotation = activeCredentialRotation();
    const { queries, repositories, transaction } = createSqlHarness({
      canonicalDevice: {
        secretHash: CANONICAL_SECRET_HASH,
        credentialRotation: currentRotation,
      },
    });
    const proposed = proposedRotationDevice(
      createRuntimeDb().devices[0],
      "confirmed",
      ROTATION_MISMATCH_SECRET_HASH,
      "2026-07-18T09:26:00.000Z",
    );
    proposed.credentialRotation.nextSecretHash = "";

    await assert.rejects(
      repositories.devices.saveCredentialRotationWithAudit(
        proposed,
        auditInput("device.secret_rotation.confirmed"),
        null,
        200,
        null,
        rotationExpected(currentRotation),
      ),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.equal(error.code, "DEVICE_SECRET_ROTATION_CANDIDATE_MISMATCH");
        return true;
      },
    );
    assert.equal(queries.some((query) => query.kind === "device_upsert"), false);
    assert.equal(queries.some((query) => query.kind === "audit_insert"), false);
    assert.equal(transaction.rolledBack, true);
  });

  await t.test("confirmed promotes the matching candidate through RETURNING", async () => {
    const currentRotation = activeCredentialRotation();
    const { db, queries, repositories } = createSqlHarness({
      canonicalDevice: {
        secretHash: CANONICAL_SECRET_HASH,
        credentialRotation: currentRotation,
      },
    });
    const proposed = proposedRotationDevice(
      db.devices[0],
      "confirmed",
      ROTATION_NEXT_SECRET_HASH,
      "2026-07-18T09:27:00.000Z",
    );
    proposed.credentialRotation.nextSecretHash = "";
    const result = await repositories.devices.saveCredentialRotationWithAudit(
      proposed,
      auditInput("device.secret_rotation.confirmed"),
      null,
      200,
      null,
      rotationExpected(currentRotation),
    );
    const upsert = queries.find((query) => query.kind === "device_upsert");
    assert.ok(upsert);
    assert.equal(upsert.sql.includes("secret_hash = EXCLUDED.secret_hash"), true);
    assert.equal(result.device.secretHash, ROTATION_NEXT_SECRET_HASH);
    assert.equal(db.devices[0].secretHash, ROTATION_NEXT_SECRET_HASH);
  });
});

test("SQL provision consumes the canonical RETURNING device for runtime and caller state", async () => {
  const { db, repositories } = createSqlHarness({
    canonicalDevice: {
      ownershipState: "provisioned",
      ownerUserId: "",
      pairedUserId: "",
      assignedPatientId: "",
      secretHash: CANONICAL_SECRET_HASH,
    },
  });
  db.devices[0] = {
    ...db.devices[0],
    ownershipState: "provisioned",
    ownerUserId: "",
    pairedUserId: "",
    assignedPatientId: "",
    secretHash: CANONICAL_SECRET_HASH,
  };
  const incoming = {
    ...db.devices[0],
    secretHash: CANONICAL_SECRET_HASH,
    name: "Provisioned stale input",
    updatedAt: "2026-07-18T09:30:00.000Z",
  };
  const claim = {
    id: "claim_returning_provision",
    deviceId: DEVICE_ID,
    organizationId: ORG_ALPHA,
    claimCodeHash: `sha256:${"1".repeat(64)}`,
    createdByUserId: ADMIN_ALPHA,
    expiresAt: "2026-07-18T10:30:00.000Z",
    createdAt: "2026-07-18T09:30:00.000Z",
    updatedAt: "2026-07-18T09:30:00.000Z",
  };

  const result = await repositories.devices.saveProvisionWithAudit(
    incoming,
    claim,
    auditInput("device.provision"),
    {
      scope: "workspace:org_ownership_alpha",
      operation: "device.provision",
      key: "provision-returning",
      fingerprint: "fingerprint-provision-returning",
    },
    { device: { id: DEVICE_ID } },
    201,
  );

  assert.equal(result.device.secretHash, CANONICAL_SECRET_HASH);
  assert.equal(incoming.secretHash, CANONICAL_SECRET_HASH);
  assert.equal(db.devices[0].secretHash, CANONICAL_SECRET_HASH);
});

test("SQL claim provisioning cannot replace a factory-enrolled credential", async () => {
  const { db, queries, repositories } = createSqlHarness({
    canonicalDevice: {
      ownershipState: "provisioned",
      ownerUserId: "",
      pairedUserId: "",
      assignedPatientId: "",
      secretHash: CANONICAL_SECRET_HASH,
    },
  });
  db.devices[0] = {
    ...db.devices[0],
    ownershipState: "provisioned",
    ownerUserId: "",
    pairedUserId: "",
    assignedPatientId: "",
    secretHash: CANONICAL_SECRET_HASH,
  };
  const incoming = {
    ...db.devices[0],
    secretHash: STALE_SECRET_HASH,
    updatedAt: "2026-07-18T09:30:00.000Z",
  };
  const claim = {
    id: "claim_factory_credential_mismatch",
    deviceId: DEVICE_ID,
    organizationId: ORG_ALPHA,
    claimCodeHash: `sha256:${"2".repeat(64)}`,
    createdByUserId: ADMIN_ALPHA,
    expiresAt: "2026-07-18T10:30:00.000Z",
    createdAt: "2026-07-18T09:30:00.000Z",
    updatedAt: "2026-07-18T09:30:00.000Z",
  };

  await assert.rejects(
    repositories.devices.saveProvisionWithAudit(
      incoming,
      claim,
      auditInput("device.provision"),
      {
        scope: "workspace:org_ownership_alpha",
        operation: "device.provision",
        key: "provision-factory-credential-mismatch",
        fingerprint: "fingerprint-provision-factory-credential-mismatch",
      },
      { device: { id: DEVICE_ID } },
      201,
    ),
    (error) => error?.code === "DEVICE_FACTORY_CREDENTIAL_MISMATCH",
  );
  assert.equal(queries.some((query) => query.kind === "device_upsert"), false);
  assert.equal(db.auditLogs.length, 0);
});

test("SQL pairing consumes the canonical RETURNING device for runtime and caller state", async () => {
  const { db, repositories } = createSqlHarness({
    canonicalDevice: {
      ownershipState: "provisioned",
      ownerUserId: "",
      pairedUserId: "",
      assignedPatientId: "",
      secretHash: CANONICAL_SECRET_HASH,
    },
  });
  db.devices[0] = { ...db.devices[0], secretHash: CANONICAL_SECRET_HASH };
  const incoming = {
    ...db.devices[0],
    secretHash: STALE_SECRET_HASH,
    name: "Pairing stale input",
    updatedAt: "2026-07-18T09:31:00.000Z",
  };

  const result = await repositories.devices.savePairingWithAudit(
    incoming,
    auditInput("device.pair"),
    {
      userId: OWNER_ALPHA,
      organizationId: ORG_ALPHA,
      title: "Device paired",
      message: "Pairing accepted",
    },
    null,
    { device: { id: DEVICE_ID } },
    200,
    null,
  );

  assert.equal(result.device.secretHash, CANONICAL_SECRET_HASH);
  assert.equal(incoming.secretHash, CANONICAL_SECRET_HASH);
  assert.equal(db.devices[0].secretHash, CANONICAL_SECRET_HASH);
});

test("SQL pairing shares the ownership lock and locks the current row before transitioning it", async () => {
  const { db, queries, repositories } = createSqlHarness({
    canonicalDevice: {
      ownershipState: "provisioned",
      ownerUserId: "",
      pairedUserId: "",
      assignedPatientId: "",
      secretHash: CANONICAL_SECRET_HASH,
    },
  });
  const incoming = {
    ...db.devices[0],
    ownershipState: "claimed",
    ownerUserId: OWNER_ALPHA,
    pairedUserId: OWNER_ALPHA,
    secretHash: STALE_SECRET_HASH,
    connectionMethod: "QR",
    updatedAt: "2026-07-18T09:32:00.000Z",
  };

  await repositories.devices.savePairingWithAudit(
    incoming,
    auditInput("device.pair"),
    {
      userId: OWNER_ALPHA,
      organizationId: ORG_ALPHA,
      title: "Device paired",
      message: "Pairing accepted",
    },
    null,
    { device: { id: DEVICE_ID, organizationId: ORG_ALPHA } },
    200,
    null,
  );

  const ownershipLockIndex = queries.findIndex(
    (query) =>
      query.kind === "advisory_lock" &&
      query.params[0] === `device-ownership:${DEVICE_ID}`,
  );
  const rowLockIndex = queries.findIndex((query) => query.kind === "device_lock");
  const upsertIndex = queries.findIndex((query) => query.kind === "device_upsert");
  assert.ok(ownershipLockIndex >= 0);
  assert.ok(rowLockIndex > ownershipLockIndex);
  assert.ok(upsertIndex > rowLockIndex);
  assert.equal(incoming.organizationId, ORG_ALPHA);
  assert.equal(incoming.ownershipState, "claimed");
  assert.equal(incoming.secretHash, CANONICAL_SECRET_HASH);
});

test("SQL pairing cannot overwrite a revoke committed after its stale input snapshot", async () => {
  const { db, queries, repositories } = createSqlHarness({
    canonicalDevice: {
      ownershipState: "revoked",
      ownerUserId: "",
      pairedUserId: "",
      assignedPatientId: "",
      status: "revoked",
      revokedAt: "2026-07-18T09:32:30.000Z",
      secretHash: CANONICAL_SECRET_HASH,
    },
  });
  const incoming = {
    ...db.devices[0],
    ownershipState: "claimed",
    ownerUserId: OWNER_ALPHA,
    pairedUserId: OWNER_ALPHA,
    secretHash: STALE_SECRET_HASH,
    connectionMethod: "QR",
    updatedAt: "2026-07-18T09:33:00.000Z",
  };

  await assert.rejects(
    repositories.devices.savePairingWithAudit(
      incoming,
      auditInput("device.pair"),
      { userId: OWNER_ALPHA, organizationId: ORG_ALPHA },
      null,
      { device: { id: DEVICE_ID, organizationId: ORG_ALPHA } },
      200,
      null,
    ),
    (error) => error?.code === "DEVICE_CLAIM_REVOKED",
  );
  assert.ok(queries.some((query) => query.kind === "device_lock"));
  assert.equal(queries.some((query) => query.kind === "device_upsert"), false);
  assert.equal(queries.some((query) => query.kind === "audit_insert"), false);
});

test("SQL pairing cannot overwrite a transfer committed after its stale input snapshot", async () => {
  const { db, queries, repositories } = createSqlHarness({
    canonicalDevice: {
      organizationId: ORG_BETA,
      ownershipState: "provisioned",
      ownerUserId: "",
      pairedUserId: "",
      assignedPatientId: "",
      secretHash: CANONICAL_SECRET_HASH,
    },
  });
  const incoming = {
    ...db.devices[0],
    organizationId: ORG_ALPHA,
    ownershipState: "claimed",
    ownerUserId: OWNER_ALPHA,
    pairedUserId: OWNER_ALPHA,
    secretHash: STALE_SECRET_HASH,
    connectionMethod: "QR",
    updatedAt: "2026-07-18T09:34:00.000Z",
  };

  await assert.rejects(
    repositories.devices.savePairingWithAudit(
      incoming,
      auditInput("device.pair"),
      { userId: OWNER_ALPHA, organizationId: ORG_ALPHA },
      null,
      { device: { id: DEVICE_ID, organizationId: ORG_ALPHA } },
      200,
      null,
    ),
    (error) => error?.code === "DEVICE_CLAIM_WORKSPACE_CHANGED",
  );
  assert.ok(queries.some((query) => query.kind === "device_lock"));
  assert.equal(queries.some((query) => query.kind === "device_upsert"), false);
});

test("JSON pairing revalidates the current canonical row instead of a stale clone", async () => {
  const { db, repositories } = createHarness();
  const incoming = {
    ...db.devices[0],
    ownershipState: "claimed",
    ownerUserId: OWNER_ALPHA,
    pairedUserId: OWNER_ALPHA,
    connectionMethod: "QR",
    updatedAt: "2026-07-18T09:35:00.000Z",
  };
  Object.assign(db.devices[0], {
    ownershipState: "revoked",
    status: "revoked",
    revokedAt: "2026-07-18T09:34:30.000Z",
  });

  await assert.rejects(
    repositories.devices.savePairingWithAudit(
      incoming,
      auditInput("device.pair"),
      { userId: OWNER_ALPHA, organizationId: ORG_ALPHA },
      null,
      { device: { id: DEVICE_ID, organizationId: ORG_ALPHA } },
      200,
      null,
    ),
    (error) => error?.code === "DEVICE_CLAIM_REVOKED",
  );
  assert.equal(db.devices[0].ownershipState, "revoked");
  assert.equal(db.auditLogs.length, 0);
});

function pairingReplayInput() {
  const idempotency = {
    scope: `${OWNER_ALPHA}:${ORG_ALPHA}`,
    operation: "device.pair",
    key: "pairing-replay-authority",
    fingerprint: "pairing-replay-authority-fingerprint",
  };
  const responseBody = {
    device: { id: DEVICE_ID, organizationId: ORG_ALPHA },
    pairing: { outcome: "accepted", presence: "offline", onlineConfirmed: false },
  };
  const claimInput = {
    organizationId: ORG_ALPHA,
    claimCodeHash: `sha256:${"7".repeat(64)}`,
    claimedByUserId: OWNER_ALPHA,
    at: "2026-07-18T09:36:00.000Z",
  };
  return { idempotency, responseBody, claimInput };
}

test("JSON pairing replay is allowed only for the same claimed owner and workspace", async () => {
  const { db, repositories } = createHarness();
  const { idempotency, responseBody, claimInput } = pairingReplayInput();
  db.idempotencyKeys = [{
    id: "idem_pairing_replay_authority",
    ...idempotency,
    responseStatus: 200,
    responseResource: responseBody,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    lastSeenAt: BASE_TIME,
  }];
  const incoming = {
    ...db.devices[0],
    connectionMethod: "QR",
    updatedAt: claimInput.at,
  };

  const replay = await repositories.devices.savePairingWithAudit(
    incoming,
    auditInput("device.pair"),
    { userId: OWNER_ALPHA, organizationId: ORG_ALPHA },
    idempotency,
    responseBody,
    200,
    claimInput,
  );

  assert.equal(replay.replayed, true);
  assert.equal(replay.device.organizationId, ORG_ALPHA);
  assert.equal(replay.device.ownerUserId, OWNER_ALPHA);
  assert.equal(db.auditLogs.length, 0);
});

test("JSON pairing replay rejects canonical revoke, transfer, and owner replacement", async () => {
  const scenarios = [
    {
      canonical: {
        ownershipState: "revoked",
        status: "revoked",
        revokedAt: "2026-07-18T09:36:30.000Z",
      },
      code: "DEVICE_CLAIM_REVOKED",
    },
    {
      canonical: {
        organizationId: ORG_BETA,
        ownershipState: "claimed",
        ownerUserId: OWNER_BETA,
        pairedUserId: OWNER_BETA,
      },
      code: "DEVICE_CLAIM_WORKSPACE_CHANGED",
    },
    {
      canonical: {
        ownershipState: "claimed",
        ownerUserId: OWNER_BETA,
        pairedUserId: OWNER_BETA,
      },
      code: "DEVICE_CLAIM_REPLAY_STALE",
    },
  ];

  for (const scenario of scenarios) {
    const { db, repositories } = createHarness();
    const { idempotency, responseBody, claimInput } = pairingReplayInput();
    db.idempotencyKeys = [{
      id: `idem_pairing_${scenario.code}`,
      ...idempotency,
      responseStatus: 200,
      responseResource: responseBody,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      lastSeenAt: BASE_TIME,
    }];
    const incoming = {
      ...db.devices[0],
      connectionMethod: "QR",
      updatedAt: claimInput.at,
    };
    Object.assign(db.devices[0], scenario.canonical);

    await assert.rejects(
      repositories.devices.savePairingWithAudit(
        incoming,
        auditInput("device.pair"),
        { userId: OWNER_ALPHA, organizationId: ORG_ALPHA },
        idempotency,
        responseBody,
        200,
        claimInput,
      ),
      (error) => error?.code === scenario.code,
    );
    assert.equal(db.auditLogs.length, 0);
  }
});

test("SQL pairing replay rejects canonical revoke, transfer, and owner replacement", async () => {
  const { idempotency, responseBody, claimInput } = pairingReplayInput();
  const storedReceipt = {
    scope: idempotency.scope,
    operation: idempotency.operation,
    idempotency_key: idempotency.key,
    fingerprint: idempotency.fingerprint,
    response_status: 200,
    response_json: responseBody,
  };
  const scenarios = [
    {
      canonicalDevice: {
        ownershipState: "revoked",
        status: "revoked",
        revokedAt: "2026-07-18T09:36:30.000Z",
      },
      code: "DEVICE_CLAIM_REVOKED",
    },
    {
      canonicalDevice: {
        organizationId: ORG_BETA,
        ownershipState: "claimed",
        ownerUserId: OWNER_BETA,
        pairedUserId: OWNER_BETA,
      },
      code: "DEVICE_CLAIM_WORKSPACE_CHANGED",
    },
    {
      canonicalDevice: {
        ownershipState: "claimed",
        ownerUserId: OWNER_BETA,
        pairedUserId: OWNER_BETA,
      },
      code: "DEVICE_CLAIM_REPLAY_STALE",
    },
  ];

  for (const scenario of scenarios) {
    const { db, repositories, queries } = createSqlHarness({
      canonicalDevice: scenario.canonicalDevice,
      mutationIdempotencyRows: [storedReceipt],
    });
    const incoming = {
      ...db.devices[0],
      connectionMethod: "QR",
      updatedAt: claimInput.at,
    };

    await assert.rejects(
      repositories.devices.savePairingWithAudit(
        incoming,
        auditInput("device.pair"),
        { userId: OWNER_ALPHA, organizationId: ORG_ALPHA },
        idempotency,
        responseBody,
        200,
        claimInput,
      ),
      (error) => error?.code === scenario.code,
    );
    assert.ok(queries.some((query) => query.kind === "device_lock"));
    assert.equal(queries.some((query) => query.kind === "device_upsert"), false);
  }
});
