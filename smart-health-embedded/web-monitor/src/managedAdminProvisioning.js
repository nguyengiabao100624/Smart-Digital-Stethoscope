function normalize(value) {
  return String(value || "").trim();
}

function managedAdminProvisioningError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function managedAdminIdempotencyPayload(input = {}) {
  return {
    email: normalize(input.email).toLowerCase(),
    name: normalize(input.name),
    phone: normalize(input.phone),
    role: normalize(input.role).toLowerCase(),
    organizationId: normalize(input.organizationId),
    title: normalize(input.title),
    hospital: normalize(input.hospital),
  };
}

function assertManagedAdminAssignableRole(input = {}) {
  const targetRole = normalize(input.targetRole).toLowerCase();
  const currentRole = normalize(input.currentRole).toLowerCase();
  const operation = normalize(input.operation).toLowerCase();
  if (targetRole === "workspace_owner" || (operation === "transition" && currentRole === "workspace_owner")) {
    throw managedAdminProvisioningError(
      409,
      "WORKSPACE_OWNER_TRANSFER_REQUIRED",
      "Workspace owner access can only be changed by the dedicated approval or transfer workflow",
    );
  }
  return targetRole;
}

function assertActiveManagedAdminWorkspace(targetRole, workspace) {
  const operationalWorkspaceRoles = new Set([
    "workspace_admin", "doctor", "nurse", "technician", "billing", "viewer",
  ]);
  if (!operationalWorkspaceRoles.has(normalize(targetRole).toLowerCase())) return workspace;
  if (!workspace || normalize(workspace.status || "active").toLowerCase() !== "active") {
    throw managedAdminProvisioningError(
      409,
      "WORKSPACE_NOT_ACTIVE",
      "Workspace admin access can only be granted in an active workspace",
    );
  }
  const workspaceType = normalize(workspace.workspaceType || workspace.workspace_type || workspace.type).toLowerCase();
  if (workspaceType === "personal") {
    throw managedAdminProvisioningError(
      409,
      "WORKSPACE_NOT_SHARED",
      "Workspace admin access cannot be granted in a personal workspace",
    );
  }
  return workspace;
}

function assertPendingManagedAdminProvider(input = {}) {
  const providerUser = input.providerUser || null;
  const reservation = input.reservation || {};
  const expectedEmail = normalize(input.email).toLowerCase();
  const actualClaims = providerUser?.customClaims || {};
  const actualMarker = normalize(
    actualClaims.shcareProvisioningOperationId || actualClaims.smartHealth?.provisioningOperationId,
  );
  if (
    !providerUser ||
    normalize(providerUser.uid) !== normalize(reservation.providerUid) ||
    normalize(providerUser.email).toLowerCase() !== expectedEmail
  ) {
    throw managedAdminProvisioningError(
      409,
      "MANAGED_ADMIN_PROVIDER_ACCOUNT_CONFLICT",
      "Firebase account does not match the durable managed-admin reservation",
    );
  }
  if (actualMarker === normalize(reservation.operationId)) {
    if (providerUser.disabled !== true) {
      throw managedAdminProvisioningError(
        409,
        "MANAGED_ADMIN_PROVIDER_ACCOUNT_CONFLICT",
        "Pending managed-admin provider identity must remain disabled until backend commit",
      );
    }
    return { providerUser, responseRecovered: false };
  }
  if (actualMarker || providerUser.disabled !== true) {
    throw managedAdminProvisioningError(
      409,
      "MANAGED_ADMIN_PROVIDER_ACCOUNT_CONFLICT",
      "Firebase account is not owned by this managed-admin provisioning operation",
    );
  }
  return { providerUser, responseRecovered: true };
}

function assertManagedAdminReplayProvider(input = {}) {
  const providerUser = input.providerUser || null;
  const reservation = input.reservation || {};
  const expectedClaims = input.expectedClaims || {};
  const expectedSmartHealth = expectedClaims.smartHealth || {};
  const expectedEmail = normalize(input.email).toLowerCase();
  const actualClaims = providerUser?.customClaims || {};
  const actualSmartHealth = actualClaims.smartHealth || {};
  const ownershipMarker = normalize(
    actualClaims.shcareProvisioningOperationId || actualSmartHealth.provisioningOperationId,
  );
  const driftFields = [];

  if (!providerUser) driftFields.push("providerUser");
  if (normalize(providerUser?.uid) !== normalize(reservation.firebaseUid)) driftFields.push("uid");
  if (normalize(providerUser?.email).toLowerCase() !== expectedEmail) driftFields.push("email");
  if (input.allowDisabled) {
    if (typeof providerUser?.disabled !== "boolean") driftFields.push("disabled");
  } else if (providerUser?.disabled !== false) {
    driftFields.push("disabled");
  }
  if (providerUser?.emailVerified !== true) driftFields.push("emailVerified");
  if (ownershipMarker !== normalize(reservation.operationId)) driftFields.push("ownershipMarker");
  if (normalize(actualClaims.role) !== normalize(expectedClaims.role)) driftFields.push("role");
  if (normalize(actualClaims.organizationId) !== normalize(expectedClaims.organizationId)) {
    driftFields.push("organizationId");
  }
  if (normalize(actualSmartHealth.role) !== normalize(expectedSmartHealth.role)) {
    driftFields.push("smartHealth.role");
  }
  if (normalize(actualSmartHealth.organizationId) !== normalize(expectedSmartHealth.organizationId)) {
    driftFields.push("smartHealth.organizationId");
  }

  if (driftFields.length > 0) {
    throw managedAdminProvisioningError(
      409,
      "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
      "Managed admin provider account requires reconciliation before replay",
      { driftFields: [...new Set(driftFields)] },
    );
  }
  return providerUser;
}

function assertManagedAdminReplayBackendState(input = {}) {
  const backendUser = input.backendUser || null;
  const reservation = input.reservation || {};
  const expectedEmail = normalize(input.email).toLowerCase();
  const expectedRole = normalize(input.role || reservation.role).toLowerCase();
  const expectedOrganizationId = normalize(input.organizationId || reservation.organizationId);
  const activationStatus = normalize(reservation.providerActivationStatus).toLowerCase();
  const activationPending = reservation.state === "activation_pending" && activationStatus === "pending";
  const activationConfirmed = reservation.state === "completed" && activationStatus === "confirmed";
  const legacyCompleted = reservation.state === "completed" && !activationStatus;
  const expectedAccountStatus = activationPending ? "provisioning_pending" : "active";
  const driftFields = [];

  if (!backendUser) driftFields.push("backendUser");
  if (!activationPending && !activationConfirmed && !legacyCompleted) driftFields.push("providerActivationStatus");
  if (normalize(backendUser?.id) !== normalize(reservation.userId)) driftFields.push("userId");
  if (normalize(backendUser?.firebaseUid) !== normalize(reservation.firebaseUid)) driftFields.push("firebaseUid");
  if (normalize(backendUser?.email).toLowerCase() !== expectedEmail) driftFields.push("email");
  if (normalize(backendUser?.role).toLowerCase() !== expectedRole) driftFields.push("role");
  if (normalize(backendUser?.organizationId) !== expectedOrganizationId) driftFields.push("organizationId");
  if (normalize(backendUser?.accountStatus || "active").toLowerCase() !== expectedAccountStatus) {
    driftFields.push("accountStatus");
  }

  if (driftFields.length > 0) {
    throw managedAdminProvisioningError(
      409,
      "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
      "Managed admin backend account requires reconciliation before provider activation or replay",
      { driftFields: [...new Set(driftFields)] },
    );
  }
  return { backendUser, activationPending, activationConfirmed: activationConfirmed || legacyCompleted };
}

async function activateManagedAdminProvider(input = {}) {
  const backendState = assertManagedAdminReplayBackendState({
    backendUser: input.backendUser,
    reservation: input.reservation,
    email: input.email,
    role: input.role,
    organizationId: input.organizationId,
  });
  if (!backendState.activationPending) {
    throw managedAdminProvisioningError(
      409,
      "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
      "Only a durably pending managed-admin activation may enable a provider account",
      { driftFields: ["providerActivationStatus"] },
    );
  }

  let providerUser = assertManagedAdminReplayProvider({
    providerUser: input.providerUser,
    reservation: input.reservation,
    expectedClaims: input.expectedClaims,
    email: input.email,
    allowDisabled: true,
  });
  const enableProvider = input.enableProvider;
  const reloadProvider = input.reloadProvider;
  const disableProvider = input.disableProvider;
  const confirmActivation = input.confirmActivation;
  const readActivationState = input.readActivationState;
  if (
    typeof enableProvider !== "function" ||
    typeof reloadProvider !== "function" ||
    typeof disableProvider !== "function" ||
    typeof confirmActivation !== "function" ||
    typeof readActivationState !== "function"
  ) {
    throw managedAdminProvisioningError(
      500,
      "MANAGED_ADMIN_ACTIVATION_INVALID",
      "Managed admin activation dependencies are incomplete",
    );
  }

  const forceDisabled = async (activationError) => {
    try {
      await disableProvider(providerUser.uid);
    } catch (disableError) {
      throw managedAdminProvisioningError(
        502,
        "MANAGED_ADMIN_PROVIDER_ACTIVATION_COMPENSATION_FAILED",
        "Managed admin activation failed and the provider account could not be forced back to disabled",
        {
          providerUid: providerUser.uid,
          activationError: normalize(activationError?.code || activationError?.message),
          disableError: normalize(disableError?.code || disableError?.message),
        },
      );
    }
  };

  // Provider preparation failures happen before the canonical activation
  // transaction starts, so compensation is definitive and safe.
  try {
    if (providerUser.disabled) {
      await enableProvider(providerUser.uid);
    }
    providerUser = await reloadProvider(providerUser.uid);
    assertManagedAdminReplayProvider({
      providerUser,
      reservation: input.reservation,
      expectedClaims: input.expectedClaims,
      email: input.email,
    });
  } catch (error) {
    await forceDisabled(error);
    throw error;
  }

  try {
    const confirmation = await confirmActivation();
    return { providerUser, confirmation, recovered: false };
  } catch (confirmationError) {
    // COMMIT may have succeeded even when the driver reports a timeout or a
    // broken connection. Never blindly disable an account which canonical
    // storage already activated, because it may be the admin that satisfies
    // the last-platform-admin invariant.
    let canonical;
    try {
      canonical = await readActivationState();
    } catch (readError) {
      const statusCode = Number(confirmationError?.statusCode || 0);
      if (statusCode >= 400 && statusCode < 500) {
        await forceDisabled(confirmationError);
        throw confirmationError;
      }
      throw managedAdminProvisioningError(
        503,
        "MANAGED_ADMIN_ACTIVATION_RECONCILIATION_REQUIRED",
        "Managed admin activation result is ambiguous and must be reconciled before retry",
        {
          providerUid: providerUser.uid,
          providerLeftEnabled: true,
          activationError: normalize(confirmationError?.code || confirmationError?.message),
          readError: normalize(readError?.code || readError?.message),
        },
      );
    }

    let canonicalState;
    try {
      canonicalState = assertManagedAdminReplayBackendState({
        backendUser: canonical?.user,
        reservation: canonical?.reservation,
        email: input.email,
        role: input.role,
        organizationId: input.organizationId,
      });
    } catch (driftError) {
      await forceDisabled(driftError);
      throw driftError;
    }

    if (canonicalState.activationConfirmed) {
      // The activation transaction committed. Re-read the provider and require
      // exact enabled state, but never mutate it here: a later lifecycle action
      // may have intentionally disabled the account.
      providerUser = await reloadProvider(providerUser.uid);
      assertManagedAdminReplayProvider({
        providerUser,
        reservation: canonical.reservation,
        expectedClaims: input.expectedClaims,
        email: input.email,
      });
      return {
        providerUser,
        confirmation: { ...canonical, replayed: true, recoveredAfterAmbiguousCommit: true },
        recovered: true,
      };
    }

    // A successful canonical read proving activation is still pending removes
    // transaction ambiguity. Restore the provider to disabled and let an
    // idempotent retry resume the durable activation operation.
    await forceDisabled(confirmationError);
    throw confirmationError;
  }
}

module.exports = {
  activateManagedAdminProvider,
  assertActiveManagedAdminWorkspace,
  assertManagedAdminAssignableRole,
  assertPendingManagedAdminProvider,
  assertManagedAdminReplayBackendState,
  assertManagedAdminReplayProvider,
  managedAdminIdempotencyPayload,
};
