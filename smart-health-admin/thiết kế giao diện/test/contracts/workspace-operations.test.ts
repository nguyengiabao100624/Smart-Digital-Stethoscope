import assert from "node:assert/strict";
import test from "node:test";

import {
  assertWorkspaceStatusTransition,
  parseWorkspaceArchiveOutcome,
  parseWorkspaceMutationOutcome,
  parseWorkspaceOwnerApprovalOutcome,
  resolveWorkspaceOperationAttempt,
  workspaceIntentFingerprint,
} from "../../src/lib/workspace-operations.ts";

const canonicalWorkspace = {
  id: "org_clinic_1",
  name: "Phòng khám An Tâm",
  type: "general",
  workspaceType: "clinic",
  address: "12 Nguyễn Huệ, TP.HCM",
  phone: "0900000001",
  email: "contact@antam.vn",
  website: "https://antam.vn",
  status: "pending",
  ownerUserId: "usr_owner_1",
  packageId: "pkg_clinic_basic",
  subscriptionStatus: "trial",
  billingCycle: "monthly",
  version: 1,
  createdAt: "2026-07-19T01:00:00.000Z",
  updatedAt: "2026-07-19T01:00:00.000Z",
} as const;

test("accepts only the canonical workspace status transitions", () => {
  const allowed = [
    ["pending", "active"],
    ["pending", "needs_info"],
    ["pending", "rejected"],
    ["needs_info", "pending"],
    ["rejected", "pending"],
    ["active", "inactive"],
    ["inactive", "active"],
  ] as const;

  for (const [fromStatus, toStatus] of allowed) {
    assert.doesNotThrow(() => assertWorkspaceStatusTransition(fromStatus, toStatus));
  }

  for (const [fromStatus, toStatus] of [
    ["needs_info", "active"],
    ["rejected", "active"],
    ["active", "rejected"],
    ["pending", "inactive"],
    ["active", "active"],
  ] as const) {
    assert.throws(
      () => assertWorkspaceStatusTransition(fromStatus, toStatus),
      /chuyển trạng thái workspace không hợp lệ/i,
    );
  }
});

test("keeps the idempotency attempt stable for the same normalized intent", () => {
  const firstIntent = {
    workspaceId: " org_clinic_1 ",
    expectedVersion: 4,
    name: " Phòng khám An Tâm ",
    email: "CONTACT@ANTAM.VN",
    requiredFields: ["phone", "address", "phone"],
  };
  const equivalentIntent = {
    requiredFields: ["address", "phone"],
    email: "contact@antam.vn",
    name: "Phòng khám An Tâm",
    expectedVersion: 4,
    workspaceId: "org_clinic_1",
  };

  assert.equal(
    workspaceIntentFingerprint(firstIntent),
    workspaceIntentFingerprint(equivalentIntent),
  );

  const firstAttempt = resolveWorkspaceOperationAttempt(null, "update", firstIntent);
  const retryAttempt = resolveWorkspaceOperationAttempt(firstAttempt, "update", equivalentIntent);
  assert.equal(retryAttempt.idempotencyKey, firstAttempt.idempotencyKey);
  assert.match(firstAttempt.idempotencyKey, /^admin-workspace-update-org_clinic_1-/);

  const changedAttempt = resolveWorkspaceOperationAttempt(firstAttempt, "update", {
    ...equivalentIntent,
    expectedVersion: 5,
  });
  assert.notEqual(changedAttempt.idempotencyKey, firstAttempt.idempotencyKey);

  const differentOperation = resolveWorkspaceOperationAttempt(firstAttempt, "archive", firstIntent);
  assert.notEqual(differentOperation.idempotencyKey, firstAttempt.idempotencyKey);
});

test("accepts an exact canonical workspace create outcome", () => {
  const outcome = parseWorkspaceMutationOutcome(
    {
      workspace: canonicalWorkspace,
      operationId: "workspace-operation-1",
      idempotent: false,
    },
    "create",
    {
      name: canonicalWorkspace.name,
      type: canonicalWorkspace.type,
      workspaceType: canonicalWorkspace.workspaceType,
      address: canonicalWorkspace.address,
      phone: canonicalWorkspace.phone,
      email: canonicalWorkspace.email,
      website: canonicalWorkspace.website,
      ownerUserId: canonicalWorkspace.ownerUserId,
    },
  );

  assert.equal(outcome.workspace.id, canonicalWorkspace.id);
  assert.equal(outcome.workspace.version, 1);
  assert.equal(outcome.operationId, "workspace-operation-1");
  assert.equal(outcome.idempotent, false);
  assert.equal(outcome.transition, undefined);
});

test("accepts an update only when the backend confirms the intended next version", () => {
  const outcome = parseWorkspaceMutationOutcome(
    {
      workspace: {
        ...canonicalWorkspace,
        phone: "0900000099",
        version: 5,
        updatedAt: "2026-07-19T02:00:00.000Z",
      },
      operationId: "workspace-operation-update-1",
      idempotent: true,
    },
    "update",
    {
      workspaceId: canonicalWorkspace.id,
      expectedVersion: 4,
      fromStatus: "pending",
      phone: "0900000099",
    },
  );

  assert.equal(outcome.workspace.version, 5);
  assert.equal(outcome.workspace.phone, "0900000099");
  assert.equal(outcome.idempotent, true);
  assert.equal(outcome.transition, undefined);
});

test("accepts a transition only with an exact canonical transition receipt", () => {
  const outcome = parseWorkspaceMutationOutcome(
    {
      workspace: {
        ...canonicalWorkspace,
        status: "active",
        version: 5,
        updatedAt: "2026-07-19T02:00:00.000Z",
      },
      transition: {
        from: "pending",
        to: "active",
      },
      operationId: "workspace-operation-transition-1",
      idempotent: false,
    },
    "transition",
    {
      workspaceId: canonicalWorkspace.id,
      expectedVersion: 4,
      fromStatus: "pending",
      toStatus: "active",
    },
  );

  assert.equal(outcome.workspace.status, "active");
  assert.deepEqual(outcome.transition, {
    from: "pending",
    to: "active",
  });
});

test("mutation outcomes fail closed on aliases, missing receipts, and stale versions", () => {
  assert.throws(() =>
    parseWorkspaceMutationOutcome({ workspace: canonicalWorkspace, idempotent: false }, "create", {
      name: canonicalWorkspace.name,
    }),
  );
  assert.throws(() =>
    parseWorkspaceMutationOutcome(
      {
        workspace: canonicalWorkspace,
        operationId: "workspace-operation-2",
        idempotent: "false",
      },
      "create",
      { name: canonicalWorkspace.name },
    ),
  );
  assert.throws(() =>
    parseWorkspaceMutationOutcome(
      {
        workspace: { ...canonicalWorkspace, status: "active" },
        operationId: "workspace-operation-active-create",
        idempotent: false,
      },
      "create",
      { name: canonicalWorkspace.name },
    ),
  );
  assert.throws(() =>
    parseWorkspaceMutationOutcome(
      {
        workspace: { ...canonicalWorkspace, id: "org_other", version: 5 },
        operationId: "workspace-operation-3",
        idempotent: false,
      },
      "update",
      { workspaceId: canonicalWorkspace.id, expectedVersion: 4 },
    ),
  );
  assert.throws(() =>
    parseWorkspaceMutationOutcome(
      {
        workspace: { ...canonicalWorkspace, version: 4 },
        operationId: "workspace-operation-4",
        idempotent: false,
      },
      "update",
      { workspaceId: canonicalWorkspace.id, expectedVersion: 4 },
    ),
  );
  assert.throws(() =>
    parseWorkspaceMutationOutcome(
      {
        workspace: { ...canonicalWorkspace, version: 5 },
        transition: {
          from: "pending",
          to: "active",
        },
        operationId: "workspace-operation-5",
        idempotent: false,
      },
      "update",
      { workspaceId: canonicalWorkspace.id, expectedVersion: 4 },
    ),
  );
  assert.throws(() =>
    parseWorkspaceMutationOutcome(
      {
        workspace: { ...canonicalWorkspace, status: "active", version: 5 },
        transition: {
          from: "pending",
          to: "inactive",
        },
        operationId: "workspace-operation-6",
        idempotent: false,
      },
      "transition",
      {
        workspaceId: canonicalWorkspace.id,
        expectedVersion: 4,
        fromStatus: "pending",
        toStatus: "active",
      },
    ),
  );
  assert.throws(() =>
    parseWorkspaceMutationOutcome(
      {
        workspace: { ...canonicalWorkspace, status: "active", version: 5 },
        transition: {
          from: "needs_info",
          to: "active",
        },
        operationId: "workspace-operation-7",
        idempotent: false,
      },
      "transition",
      {
        workspaceId: canonicalWorkspace.id,
        expectedVersion: 4,
        fromStatus: "needs_info",
        toStatus: "active",
      },
    ),
  );
  assert.throws(() =>
    parseWorkspaceMutationOutcome(
      {
        workspace: {
          ...canonicalWorkspace,
          status: "active",
          ownerUserId: undefined,
          version: 5,
        },
        transition: {
          from: "pending",
          to: "active",
        },
        operationId: "workspace-operation-8",
        idempotent: false,
      },
      "transition",
      {
        workspaceId: canonicalWorkspace.id,
        expectedVersion: 4,
        fromStatus: "pending",
        toStatus: "active",
      },
    ),
  );
});

test("accepts only an exact canonical archive receipt", () => {
  const outcome = parseWorkspaceArchiveOutcome(
    {
      deleted: true,
      workspaceId: canonicalWorkspace.id,
      operationId: "workspace-operation-archive-1",
      idempotent: false,
    },
    { workspaceId: canonicalWorkspace.id, expectedVersion: 4 },
  );

  assert.deepEqual(outcome, {
    deleted: true,
    workspaceId: canonicalWorkspace.id,
    operationId: "workspace-operation-archive-1",
    idempotent: false,
  });

  for (const response of [
    {
      deleted: false,
      workspaceId: canonicalWorkspace.id,
      operationId: "workspace-operation-archive-2",
      idempotent: false,
    },
    {
      deleted: true,
      clinicId: canonicalWorkspace.id,
      operationId: "workspace-operation-archive-3",
      idempotent: false,
    },
    {
      deleted: true,
      workspaceId: "org_other",
      operationId: "workspace-operation-archive-4",
      idempotent: false,
    },
    {
      deleted: true,
      workspaceId: canonicalWorkspace.id,
      operationId: "workspace-operation-archive-5",
      idempotent: "false",
    },
  ]) {
    assert.throws(() =>
      parseWorkspaceArchiveOutcome(response, {
        workspaceId: canonicalWorkspace.id,
        expectedVersion: 4,
      }),
    );
  }

  assert.throws(() =>
    parseWorkspaceArchiveOutcome(
      {
        deleted: true,
        workspaceId: canonicalWorkspace.id,
        operationId: "workspace-operation-archive-6",
        idempotent: false,
      },
      { workspaceId: canonicalWorkspace.id, expectedVersion: 0 },
    ),
  );
});

test("accepts only an exact workspace owner approval receipt", () => {
  const intent = {
    workspaceId: canonicalWorkspace.id,
    expectedVersion: canonicalWorkspace.version,
    ownerUserId: canonicalWorkspace.ownerUserId,
    fromStatus: "pending" as const,
    toStatus: "active" as const,
  };
  const receipt = {
    workspace: canonicalWorkspace,
    ownerApproval: {
      userId: canonicalWorkspace.ownerUserId,
      role: "workspace_owner",
      requestedRole: "workspace_owner",
      roleRequestStatus: "approved",
      identityOperationId: "identity-operation-1",
    },
    operationId: "workspace-owner-approval-1",
    idempotent: false,
  };

  assert.deepEqual(parseWorkspaceOwnerApprovalOutcome(receipt, intent), receipt);

  assert.throws(() =>
    parseWorkspaceOwnerApprovalOutcome(
      {
        ...receipt,
        ownerApproval: { ...receipt.ownerApproval, userId: "usr_other" },
      },
      intent,
    ),
  );
  assert.throws(() =>
    parseWorkspaceOwnerApprovalOutcome(
      {
        ...receipt,
        workspace: { ...canonicalWorkspace, version: canonicalWorkspace.version + 1 },
      },
      intent,
    ),
  );
  assert.throws(() =>
    parseWorkspaceOwnerApprovalOutcome(
      {
        ...receipt,
        ownerApproval: { ...receipt.ownerApproval, roleRequestStatus: "pending" },
      },
      intent,
    ),
  );
});
