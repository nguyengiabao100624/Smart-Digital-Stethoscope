function reconciliationError(operationId) {
  const error = new Error(
    "The identity provider outcome is uncertain and requires reconciliation",
  );
  error.statusCode = 409;
  error.code = "IDENTITY_PROVIDER_RECONCILIATION_REQUIRED";
  error.details = { operationId: String(operationId || "") };
  return error;
}

async function executeIdentityProviderMutationOnce(input = {}) {
  const operationId = String(input.operationId || "");
  const identityOperations = input.identityOperations;
  if (
    !operationId ||
    !identityOperations ||
    typeof identityOperations.markProviderApplying !== "function" ||
    typeof identityOperations.markProviderApplied !== "function" ||
    typeof input.providerAction !== "function" ||
    typeof input.sanitizeResult !== "function" ||
    typeof input.isConfirmed !== "function"
  ) {
    const error = new Error("Identity provider execution gate is incomplete");
    error.statusCode = 503;
    error.code = "IDENTITY_PROVIDER_GATE_UNAVAILABLE";
    throw error;
  }

  const applying = await identityOperations.markProviderApplying({
    operationId,
  });
  const applyingOperation = applying?.identityOperation || {};
  if (
    applyingOperation.status === "completed" ||
    applyingOperation.status === "provider_applied"
  ) {
    return {
      identityOperation: applyingOperation,
      providerResult: applyingOperation.providerResult || {},
      replayed: true,
    };
  }
  if (
    applying.replayed === true ||
    applyingOperation.providerStatus !== "applying"
  ) {
    throw reconciliationError(operationId);
  }

  let rawResult;
  try {
    rawResult = await input.providerAction();
  } catch {
    throw reconciliationError(operationId);
  }
  const providerResult = input.sanitizeResult(rawResult);
  if (!input.isConfirmed(rawResult)) {
    throw reconciliationError(operationId);
  }

  let applied;
  try {
    applied = await identityOperations.markProviderApplied({
      operationId,
      providerStatus: rawResult?.skipped ? "skipped" : "applied",
      providerResult,
    });
  } catch {
    throw reconciliationError(operationId);
  }
  return {
    identityOperation: applied.identityOperation,
    providerResult:
      applied.identityOperation?.providerResult || providerResult,
    replayed: Boolean(applied.replayed),
  };
}

module.exports = {
  executeIdentityProviderMutationOnce,
  reconciliationError,
};
