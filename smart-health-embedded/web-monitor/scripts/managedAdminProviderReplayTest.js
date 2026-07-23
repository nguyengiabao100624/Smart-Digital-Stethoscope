const assert = require("node:assert/strict");
const test = require("node:test");
const {
  activateManagedAdminProvider,
  assertActiveManagedAdminWorkspace,
  assertManagedAdminAssignableRole,
  assertPendingManagedAdminProvider,
  assertManagedAdminReplayBackendState,
  assertManagedAdminReplayProvider,
  managedAdminIdempotencyPayload,
} = require("../src/managedAdminProvisioning");

const reservation = {
  firebaseUid: "firebase_managed_admin",
  operationId: "admin_create_operation",
};
const expectedClaims = {
  role: "workspace_admin",
  organizationId: "org_managed_admin",
  smartHealth: {
    role: "workspace_admin",
    organizationId: "org_managed_admin",
  },
};
const expectedEmail = "managed-admin@smarthealth.test";

function provider(overrides = {}) {
  const customClaims = overrides.customClaims || {
    ...expectedClaims,
    shcareProvisioningOperationId: reservation.operationId,
    smartHealth: {
      ...expectedClaims.smartHealth,
      provisioningOperationId: reservation.operationId,
    },
  };
  return {
    uid: reservation.firebaseUid,
    email: expectedEmail,
    disabled: false,
    emailVerified: true,
    ...overrides,
    customClaims,
  };
}

function assertDrift(providerUser, expectedField) {
  assert.throws(
    () => assertManagedAdminReplayProvider({
      providerUser,
      reservation,
      expectedClaims,
      email: expectedEmail,
    }),
    (error) =>
      error?.statusCode === 409 &&
      error?.code === "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED" &&
      error?.details?.driftFields?.includes(expectedField),
  );
}

function activationReservation(overrides = {}) {
  return {
    operationId: reservation.operationId,
    providerUid: reservation.firebaseUid,
    firebaseUid: reservation.firebaseUid,
    userId: "usr_managed_admin",
    email: expectedEmail,
    role: "workspace_admin",
    organizationId: "org_managed_admin",
    state: "activation_pending",
    providerActivationStatus: "pending",
    activationOperationId: "identityop_admin_create_operation",
    ...overrides,
  };
}

function backendUser(overrides = {}) {
  return {
    id: "usr_managed_admin",
    firebaseUid: reservation.firebaseUid,
    email: expectedEmail,
    role: "workspace_admin",
    organizationId: "org_managed_admin",
    accountStatus: "provisioning_pending",
    ...overrides,
  };
}

test("completed managed-admin replay accepts the exact enabled verified provider identity", () => {
  const account = provider();
  assert.equal(
    assertManagedAdminReplayProvider({
      providerUser: account,
      reservation,
      expectedClaims,
      email: expectedEmail,
    }),
    account,
  );
});

test("completed replay rejects disabled and unverified provider accounts", () => {
  assertDrift(provider({ disabled: true }), "disabled");
  assertDrift(provider({ emailVerified: false }), "emailVerified");
});

test("activation-pending flow may inspect an exact disabled provider before strict verification", () => {
  const account = provider({ disabled: true });
  assert.equal(
    assertManagedAdminReplayProvider({
      providerUser: account,
      reservation,
      expectedClaims,
      email: expectedEmail,
      allowDisabled: true,
    }),
    account,
  );
});

test("completed replay rejects missing or foreign provisioning ownership markers", () => {
  assertDrift(provider({ customClaims: { ...expectedClaims } }), "ownershipMarker");
  assertDrift(provider({
    customClaims: {
      ...expectedClaims,
      shcareProvisioningOperationId: "foreign_operation",
      smartHealth: {
        ...expectedClaims.smartHealth,
        provisioningOperationId: "foreign_operation",
      },
    },
  }), "ownershipMarker");
});

test("completed replay rejects top-level role and workspace claim drift", () => {
  assertDrift(provider({
    customClaims: {
      ...provider().customClaims,
      role: "patient",
    },
  }), "role");
  assertDrift(provider({
    customClaims: {
      ...provider().customClaims,
      organizationId: "org_foreign",
    },
  }), "organizationId");
});

test("completed replay rejects nested Smart Health claim drift", () => {
  assertDrift(provider({
    customClaims: {
      ...provider().customClaims,
      smartHealth: {
        ...provider().customClaims.smartHealth,
        role: "patient",
      },
    },
  }), "smartHealth.role");
  assertDrift(provider({
    customClaims: {
      ...provider().customClaims,
      smartHealth: {
        ...provider().customClaims.smartHealth,
        organizationId: "org_foreign",
      },
    },
  }), "smartHealth.organizationId");
});

test("completed replay rejects provider UID and email drift", () => {
  assertDrift(provider({ uid: "firebase_foreign" }), "uid");
  assertDrift(provider({ email: "foreign@smarthealth.test" }), "email");
  assertDrift(null, "providerUser");
});

test("pending replay safely adopts a response-lost deterministic disabled provider", () => {
  const pendingReservation = {
    operationId: reservation.operationId,
    providerUid: reservation.firebaseUid,
  };
  const responseLostProvider = provider({ customClaims: {}, disabled: true });
  const recovered = assertPendingManagedAdminProvider({
    providerUser: responseLostProvider,
    reservation: pendingReservation,
    email: expectedEmail,
  });
  assert.equal(recovered.responseRecovered, true);

  assert.throws(
    () => assertPendingManagedAdminProvider({
      providerUser: provider({ customClaims: {}, disabled: false }),
      reservation: pendingReservation,
      email: expectedEmail,
    }),
    (error) => error?.code === "MANAGED_ADMIN_PROVIDER_ACCOUNT_CONFLICT",
  );
  assert.throws(
    () => assertPendingManagedAdminProvider({
      providerUser: provider({ uid: "foreign_uid", customClaims: {}, disabled: true }),
      reservation: pendingReservation,
      email: expectedEmail,
    }),
    (error) => error?.code === "MANAGED_ADMIN_PROVIDER_ACCOUNT_CONFLICT",
  );
});

test("pending owned provider must still remain disabled until backend commit", () => {
  assert.throws(
    () => assertPendingManagedAdminProvider({
      providerUser: provider({ disabled: false }),
      reservation: { operationId: reservation.operationId, providerUid: reservation.firebaseUid },
      email: expectedEmail,
    }),
    (error) => error?.code === "MANAGED_ADMIN_PROVIDER_ACCOUNT_CONFLICT",
  );
});

test("backend replay state rejects a later lock instead of reopening the provider", () => {
  const completed = activationReservation({
    state: "completed",
    providerActivationStatus: "confirmed",
  });
  assert.throws(
    () => assertManagedAdminReplayBackendState({
      backendUser: backendUser({ accountStatus: "locked" }),
      reservation: completed,
      email: expectedEmail,
      role: "workspace_admin",
      organizationId: "org_managed_admin",
    }),
    (error) =>
      error?.code === "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED" &&
      error?.details?.driftFields?.includes("accountStatus"),
  );
});

test("activation confirms a disabled provider and returns canonical completion", async () => {
  const pending = activationReservation();
  let currentProvider = provider({ disabled: true });
  let disableCalls = 0;
  const result = await activateManagedAdminProvider({
    backendUser: backendUser(),
    reservation: pending,
    providerUser: currentProvider,
    expectedClaims,
    email: expectedEmail,
    role: "workspace_admin",
    organizationId: "org_managed_admin",
    enableProvider: async () => { currentProvider = provider({ disabled: false }); },
    reloadProvider: async () => currentProvider,
    disableProvider: async () => { disableCalls += 1; currentProvider = provider({ disabled: true }); },
    confirmActivation: async () => ({
      user: backendUser({ accountStatus: "active" }),
      reservation: { ...pending, state: "completed", providerActivationStatus: "confirmed" },
      replayed: false,
    }),
    readActivationState: async () => assert.fail("canonical reread is only for failed confirmation"),
  });
  assert.equal(result.confirmation.user.accountStatus, "active");
  assert.equal(result.providerUser.disabled, false);
  assert.equal(result.recovered, false);
  assert.equal(disableCalls, 0);
});

test("commit-applied-then-throw is recovered without disabling an active admin", async () => {
  const pending = activationReservation();
  const completed = { ...pending, state: "completed", providerActivationStatus: "confirmed" };
  let currentProvider = provider({ disabled: true });
  let disableCalls = 0;
  const result = await activateManagedAdminProvider({
    backendUser: backendUser(),
    reservation: pending,
    providerUser: currentProvider,
    expectedClaims,
    email: expectedEmail,
    role: "workspace_admin",
    organizationId: "org_managed_admin",
    enableProvider: async () => { currentProvider = provider({ disabled: false }); },
    reloadProvider: async () => currentProvider,
    disableProvider: async () => { disableCalls += 1; currentProvider = provider({ disabled: true }); },
    confirmActivation: async () => {
      const error = new Error("connection lost after COMMIT");
      error.statusCode = 503;
      error.code = "DATA_BACKEND_UNAVAILABLE";
      throw error;
    },
    readActivationState: async () => ({
      user: backendUser({ accountStatus: "active" }),
      reservation: completed,
      replayed: true,
    }),
  });
  assert.equal(result.recovered, true);
  assert.equal(result.confirmation.recoveredAfterAmbiguousCommit, true);
  assert.equal(result.providerUser.disabled, false);
  assert.equal(disableCalls, 0, "an active canonical admin must not be disabled after ambiguous COMMIT");
});

test("definitively pending confirmation failure restores provider disabled", async () => {
  const pending = activationReservation();
  let currentProvider = provider({ disabled: true });
  let disableCalls = 0;
  await assert.rejects(
    activateManagedAdminProvider({
      backendUser: backendUser(),
      reservation: pending,
      providerUser: currentProvider,
      expectedClaims,
      email: expectedEmail,
      role: "workspace_admin",
      organizationId: "org_managed_admin",
      enableProvider: async () => { currentProvider = provider({ disabled: false }); },
      reloadProvider: async () => currentProvider,
      disableProvider: async () => { disableCalls += 1; currentProvider = provider({ disabled: true }); },
      confirmActivation: async () => {
        const error = new Error("activation lock changed");
        error.statusCode = 409;
        error.code = "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED";
        throw error;
      },
      readActivationState: async () => ({ user: backendUser(), reservation: pending, replayed: true }),
    }),
    (error) => error?.code === "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
  );
  assert.equal(disableCalls, 1);
  assert.equal(currentProvider.disabled, true);
});

test("lifecycle drift between provider enable and confirmation fails closed", async () => {
  const pending = activationReservation();
  let currentProvider = provider({ disabled: true });
  let disableCalls = 0;
  await assert.rejects(
    activateManagedAdminProvider({
      backendUser: backendUser(),
      reservation: pending,
      providerUser: currentProvider,
      expectedClaims,
      email: expectedEmail,
      role: "workspace_admin",
      organizationId: "org_managed_admin",
      enableProvider: async () => { currentProvider = provider({ disabled: false }); },
      reloadProvider: async () => currentProvider,
      disableProvider: async () => { disableCalls += 1; currentProvider = provider({ disabled: true }); },
      confirmActivation: async () => {
        const error = new Error("canonical lifecycle changed");
        error.statusCode = 409;
        error.code = "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED";
        throw error;
      },
      readActivationState: async () => ({
        user: backendUser({ accountStatus: "locked" }),
        reservation: pending,
        replayed: true,
      }),
    }),
    (error) =>
      error?.code === "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED" &&
      error?.details?.driftFields?.includes("accountStatus"),
  );
  assert.equal(disableCalls, 1);
  assert.equal(currentProvider.disabled, true);
});

test("unreadable ambiguous confirmation leaves provider enabled for safe reconciliation", async () => {
  const pending = activationReservation();
  let currentProvider = provider({ disabled: true });
  let disableCalls = 0;
  await assert.rejects(
    activateManagedAdminProvider({
      backendUser: backendUser(),
      reservation: pending,
      providerUser: currentProvider,
      expectedClaims,
      email: expectedEmail,
      role: "workspace_admin",
      organizationId: "org_managed_admin",
      enableProvider: async () => { currentProvider = provider({ disabled: false }); },
      reloadProvider: async () => currentProvider,
      disableProvider: async () => { disableCalls += 1; currentProvider = provider({ disabled: true }); },
      confirmActivation: async () => {
        const error = new Error("commit response lost");
        error.statusCode = 503;
        throw error;
      },
      readActivationState: async () => { throw new Error("database unavailable"); },
    }),
    (error) =>
      error?.code === "MANAGED_ADMIN_ACTIVATION_RECONCILIATION_REQUIRED" &&
      error?.details?.providerLeftEnabled === true,
  );
  assert.equal(disableCalls, 0);
  assert.equal(currentProvider.disabled, false);
});

test("generic managed-admin assignment rejects workspace owner and inactive or personal workspaces", () => {
  assert.throws(
    () => assertManagedAdminAssignableRole({ targetRole: "workspace_owner", operation: "create" }),
    (error) => error?.code === "WORKSPACE_OWNER_TRANSFER_REQUIRED",
  );
  assert.throws(
    () => assertManagedAdminAssignableRole({
      currentRole: "workspace_owner",
      targetRole: "workspace_admin",
      operation: "transition",
    }),
    (error) => error?.code === "WORKSPACE_OWNER_TRANSFER_REQUIRED",
  );
  assert.throws(
    () => assertActiveManagedAdminWorkspace("workspace_admin", { status: "pending", workspaceType: "clinic" }),
    (error) => error?.code === "WORKSPACE_NOT_ACTIVE",
  );
  assert.throws(
    () => assertActiveManagedAdminWorkspace("workspace_admin", { status: "active", workspaceType: "personal" }),
    (error) => error?.code === "WORKSPACE_NOT_SHARED",
  );
  assert.doesNotThrow(() => assertActiveManagedAdminWorkspace("admin", { status: "rejected", workspaceType: "personal" }));
});

test("managed-admin idempotency payload excludes password and unknown raw fields", () => {
  const safe = managedAdminIdempotencyPayload({
    email: expectedEmail,
    name: "Managed Admin",
    phone: "0900000000",
    role: "workspace_admin",
    organizationId: "org_managed_admin",
    title: "Administrator",
    hospital: "Clinic",
    password: "must-never-be-fingerprinted",
    rawSecret: "must-never-be-fingerprinted",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(safe, "password"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, "rawSecret"), false);
  assert.deepEqual(Object.keys(safe).sort(), [
    "email", "hospital", "name", "organizationId", "phone", "role", "title",
  ]);

  const omittedProfileBeforeRename = managedAdminIdempotencyPayload({
    email: expectedEmail,
    name: "Managed Admin",
    role: "workspace_admin",
    organizationId: "org_managed_admin",
    title: "",
    hospital: "",
  });
  const omittedProfileAfterRename = managedAdminIdempotencyPayload({
    email: expectedEmail,
    name: "Managed Admin",
    role: "workspace_admin",
    organizationId: "org_managed_admin",
    title: "",
    hospital: "",
  });
  assert.deepEqual(
    omittedProfileAfterRename,
    omittedProfileBeforeRename,
    "derived workspace names and role labels must never change the fingerprint of an omitted field",
  );
});
