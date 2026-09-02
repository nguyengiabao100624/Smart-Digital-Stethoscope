const assert = require("node:assert/strict");
const test = require("node:test");
const { createDeviceAccessRepository } = require("../src/deviceAccessRepository");
const { hashDeviceAccessCode } = require("../src/deviceAccessContract");

function fixture() {
  let counter = 0;
  const db = {
    devices: [
      {
        id: "dev_1",
        organizationId: "org_1",
        status: "available",
      },
    ],
    deviceAccessInvites: [],
    deviceAccessGrants: [],
    auditLogs: [],
  };
  const repository = createDeviceAccessRepository({
    getDb: () => db,
    saveDb: async () => {},
    createId: (prefix) => `${prefix}_${++counter}`,
    nowIso: () => "2026-09-02T10:00:00.000Z",
    getPool: () => null,
  });
  return { db, repository };
}

const viewerCode = "SHC-ABCD-EFGH-JKLM-NPQR";

test("Platform-created invite is public-safe and replayable", async () => {
  const { db, repository } = fixture();
  const input = {
    invite: {
      id: "dai_1",
      deviceId: "dev_1",
      organizationId: "org_1",
      accessLevel: "viewer",
      codeHash: hashDeviceAccessCode(viewerCode),
      createdByUserId: "admin_1",
      idempotencyKey: "idem_1",
      requestFingerprint: "fp_1",
      expiresAt: "2026-09-03T10:00:00.000Z",
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
    },
    audit: { actorUserId: "admin_1", organizationId: "org_1", action: "device.access.invite.create" },
  };
  const created = await repository.createInvite(input);
  const replay = await repository.createInvite(input);
  assert.equal(created.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(Object.prototype.hasOwnProperty.call(created.invite, "codeHash"), false);
  assert.equal(db.deviceAccessInvites.length, 1);
  assert.equal(db.auditLogs.length, 1);
});

test("viewer code redeems once and grants view plus Wi-Fi scope", async () => {
  const { db, repository } = fixture();
  db.deviceAccessInvites.push({
    id: "dai_view",
    deviceId: "dev_1",
    organizationId: "org_1",
    accessLevel: "viewer",
    codeHash: hashDeviceAccessCode(viewerCode),
    expiresAt: "2026-09-03T10:00:00.000Z",
    createdAt: "2026-09-02T10:00:00.000Z",
  });
  const input = {
    codeHash: hashDeviceAccessCode(viewerCode),
    userId: "doctor_1",
    allowedOrganizationIds: ["org_1"],
    at: "2026-09-02T11:00:00.000Z",
    audit: { actorUserId: "doctor_1", action: "device.access.redeem" },
  };
  const redeemed = await repository.redeem(input);
  const replay = await repository.redeem(input);
  assert.equal(redeemed.grant.accessLevel, "viewer");
  assert.equal(replay.replayed, true);
  assert.equal(repository.findActiveGrant("doctor_1", "dev_1").accessLevel, "viewer");
  await assert.rejects(
    () => repository.redeem({ ...input, userId: "doctor_2" }),
    (error) => error.code === "DEVICE_ACCESS_CODE_ALREADY_USED",
  );
});

test("manager code upgrades an existing viewer without cross-workspace access", async () => {
  const { db, repository } = fixture();
  const managerCode = "SHC-RSTU-VWXY-2345-6789";
  db.deviceAccessGrants.push({
    id: "dag_1",
    deviceId: "dev_1",
    organizationId: "org_1",
    userId: "doctor_1",
    accessLevel: "viewer",
    status: "active",
  });
  db.deviceAccessInvites.push({
    id: "dai_manage",
    deviceId: "dev_1",
    organizationId: "org_1",
    accessLevel: "manager",
    codeHash: hashDeviceAccessCode(managerCode),
    expiresAt: "2026-09-03T10:00:00.000Z",
  });
  await assert.rejects(
    () => repository.redeem({
      codeHash: hashDeviceAccessCode(managerCode),
      userId: "doctor_1",
      allowedOrganizationIds: ["org_other"],
      at: "2026-09-02T11:00:00.000Z",
      audit: {},
    }),
    (error) => error.code === "DEVICE_ACCESS_WORKSPACE_FORBIDDEN",
  );
  const redeemed = await repository.redeem({
    codeHash: hashDeviceAccessCode(managerCode),
    userId: "doctor_1",
    allowedOrganizationIds: ["org_1"],
    at: "2026-09-02T11:00:00.000Z",
    audit: {},
  });
  assert.equal(redeemed.grant.accessLevel, "manager");
  assert.equal(db.deviceAccessGrants.length, 1);
});

test("unused invite can be revoked and no longer redeemed", async () => {
  const { db, repository } = fixture();
  db.deviceAccessInvites.push({
    id: "dai_view",
    deviceId: "dev_1",
    organizationId: "org_1",
    accessLevel: "viewer",
    codeHash: hashDeviceAccessCode(viewerCode),
    expiresAt: "2026-09-03T10:00:00.000Z",
  });
  const revoked = await repository.revokeInvite({
    inviteId: "dai_view",
    deviceId: "dev_1",
    actorUserId: "admin_1",
    at: "2026-09-02T11:00:00.000Z",
    audit: { actorUserId: "admin_1", action: "device.access.invite.revoke" },
  });
  assert.equal(revoked.status, "revoked");
  await assert.rejects(
    () => repository.redeem({
      codeHash: hashDeviceAccessCode(viewerCode),
      userId: "doctor_1",
      allowedOrganizationIds: ["org_1"],
      at: "2026-09-02T12:00:00.000Z",
      audit: {},
    }),
    (error) => error.code === "DEVICE_ACCESS_CODE_REVOKED",
  );
});

test("Platform Admin can revoke an active grant without affecting another user", async () => {
  const { db, repository } = fixture();
  db.deviceAccessGrants.push(
    {
      id: "dag_target",
      deviceId: "dev_1",
      organizationId: "org_1",
      userId: "doctor_1",
      accessLevel: "manager",
      status: "active",
    },
    {
      id: "dag_other",
      deviceId: "dev_1",
      organizationId: "org_1",
      userId: "doctor_2",
      accessLevel: "viewer",
      status: "active",
    },
  );
  const revoked = await repository.revokeGrant({
    grantId: "dag_target",
    deviceId: "dev_1",
    actorUserId: "admin_1",
    at: "2026-09-02T11:00:00.000Z",
    audit: { actorUserId: "admin_1", action: "device.access.grant.revoke" },
  });
  assert.equal(revoked.status, "revoked");
  assert.equal(repository.findActiveGrant("doctor_1", "dev_1"), null);
  assert.equal(repository.findActiveGrant("doctor_2", "dev_1").accessLevel, "viewer");
  await assert.rejects(
    () => repository.revokeGrant({
      grantId: "dag_target",
      deviceId: "dev_1",
      actorUserId: "admin_1",
      audit: {},
    }),
    (error) => error.code === "DEVICE_ACCESS_GRANT_NOT_ACTIVE",
  );
});

test("a viewer code cannot reactivate a revoked manager grant as manager", async () => {
  const { db, repository } = fixture();
  const replacementViewerCode = "SHC-2345-6789-ABCD-EFGH";
  db.deviceAccessGrants.push({
    id: "dag_manager",
    deviceId: "dev_1",
    organizationId: "org_1",
    userId: "doctor_1",
    accessLevel: "manager",
    status: "active",
  });
  await repository.revokeGrant({
    grantId: "dag_manager",
    deviceId: "dev_1",
    actorUserId: "admin_1",
    at: "2026-09-02T11:00:00.000Z",
    audit: { actorUserId: "admin_1", action: "device.access.grant.revoke" },
  });
  db.deviceAccessInvites.push({
    id: "dai_replacement_viewer",
    deviceId: "dev_1",
    organizationId: "org_1",
    accessLevel: "viewer",
    codeHash: hashDeviceAccessCode(replacementViewerCode),
    expiresAt: "2026-09-03T10:00:00.000Z",
  });

  const redeemed = await repository.redeem({
    codeHash: hashDeviceAccessCode(replacementViewerCode),
    userId: "doctor_1",
    allowedOrganizationIds: ["org_1"],
    at: "2026-09-02T12:00:00.000Z",
    audit: { actorUserId: "doctor_1", action: "device.access.redeem" },
  });

  assert.equal(redeemed.grant.id, "dag_manager");
  assert.equal(redeemed.grant.status, "active");
  assert.equal(redeemed.grant.accessLevel, "viewer");
});

test("redemption cannot consume a code after the device is revoked", async () => {
  const { db, repository } = fixture();
  db.devices[0].status = "revoked";
  db.devices[0].revokedAt = "2026-09-02T10:30:00.000Z";
  db.deviceAccessInvites.push({
    id: "dai_revoked_device",
    deviceId: "dev_1",
    organizationId: "org_1",
    accessLevel: "manager",
    codeHash: hashDeviceAccessCode(viewerCode),
    expiresAt: "2026-09-03T10:00:00.000Z",
  });

  await assert.rejects(
    () => repository.redeem({
      codeHash: hashDeviceAccessCode(viewerCode),
      userId: "doctor_1",
      allowedOrganizationIds: ["org_1"],
      at: "2026-09-02T12:00:00.000Z",
      audit: {},
    }),
    (error) => error.code === "DEVICE_ACCESS_DEVICE_UNAVAILABLE",
  );
  assert.equal(db.deviceAccessInvites[0].redeemedAt, undefined);
  assert.equal(db.deviceAccessGrants.length, 0);
});
