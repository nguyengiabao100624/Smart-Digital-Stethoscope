const assert = require("node:assert/strict");
const test = require("node:test");

const {
  executeIdentityProviderMutationOnce,
} = require("../src/identityProviderExecution");

test("provider mutation is never called again after an uncertain crash window", async () => {
  const operation = {
    id: "identity_operation_uncertain",
    status: "pending_provider",
    providerStatus: "pending",
    providerResult: {},
  };
  let providerCalls = 0;
  const identityOperations = {
    async markProviderApplying() {
      if (operation.providerStatus === "applying") {
        return { identityOperation: operation, replayed: true };
      }
      operation.providerStatus = "applying";
      return { identityOperation: operation, replayed: false };
    },
    async markProviderApplied() {
      throw new Error("simulated crash before durable provider result");
    },
  };
  const execute = () =>
    executeIdentityProviderMutationOnce({
      operationId: operation.id,
      identityOperations,
      providerAction: async () => {
        providerCalls += 1;
        return { updated: true };
      },
      sanitizeResult: (result) => ({ updated: result.updated === true }),
      isConfirmed: (result) => result.updated === true,
    });

  await assert.rejects(
    execute(),
    (error) =>
      error.code === "IDENTITY_PROVIDER_RECONCILIATION_REQUIRED" &&
      error.statusCode === 409,
  );
  await assert.rejects(
    execute(),
    (error) =>
      error.code === "IDENTITY_PROVIDER_RECONCILIATION_REQUIRED" &&
      error.statusCode === 409,
  );
  assert.equal(providerCalls, 1);
});

test("provider-applied replay returns the durable result without provider call", async () => {
  let providerCalls = 0;
  const operation = {
    id: "identity_operation_applied",
    status: "provider_applied",
    providerStatus: "applied",
    providerResult: { updated: true },
  };
  const result = await executeIdentityProviderMutationOnce({
    operationId: operation.id,
    identityOperations: {
      async markProviderApplying() {
        return { identityOperation: operation, replayed: true };
      },
      async markProviderApplied() {
        throw new Error("must not be called");
      },
    },
    providerAction: async () => {
      providerCalls += 1;
      return { updated: true };
    },
    sanitizeResult: (value) => value,
    isConfirmed: () => true,
  });

  assert.equal(result.replayed, true);
  assert.deepEqual(result.providerResult, { updated: true });
  assert.equal(providerCalls, 0);
});
