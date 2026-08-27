function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function workerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function stableErrorCode(error) {
  const code = String(error?.code || "AVATAR_STORAGE_CLEANUP_FAILED")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 120);
  return code || "AVATAR_STORAGE_CLEANUP_FAILED";
}

async function withTimeout(operation, timeoutMillis) {
  let timeout = null;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            workerError(
              "AVATAR_CLEANUP_PROVIDER_TIMEOUT",
              "Avatar cleanup provider operation timed out",
            ),
          );
        }, timeoutMillis);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function createAvatarCleanupWorker(options = {}) {
  const repository = options.repository;
  const storageAdapter = options.storageAdapter;
  const workerId = String(options.workerId || "").trim();
  const onError = typeof options.onError === "function" ? options.onError : () => {};
  if (
    !repository?.claimCleanupBatch ||
    !repository?.completeCleanupClaim ||
    !repository?.failCleanupClaim ||
    !repository?.cleanupMetrics ||
    !repository?.pruneCleanupHistory ||
    !repository?.isObjectActive ||
    !storageAdapter?.deleteObject ||
    !workerId
  ) {
    throw new TypeError("Avatar cleanup worker dependencies are incomplete");
  }

  const intervalMillis = boundedInteger(
    options.intervalMillis,
    30_000,
    1_000,
    24 * 60 * 60_000,
  );
  const leaseMillis = boundedInteger(
    options.leaseMillis,
    60_000,
    1_000,
    10 * 60_000,
  );
  const operationTimeoutMillis = boundedInteger(
    options.operationTimeoutMillis,
    30_000,
    100,
    Math.max(100, leaseMillis - 100),
  );
  const batchSize = boundedInteger(options.batchSize, 20, 1, 100);
  const maxAttempts = boundedInteger(options.maxAttempts, 8, 1, 50);
  const baseBackoffMillis = boundedInteger(
    options.baseBackoffMillis,
    30_000,
    100,
    24 * 60 * 60_000,
  );
  const maxBackoffMillis = boundedInteger(
    options.maxBackoffMillis,
    30 * 60_000,
    baseBackoffMillis,
    7 * 24 * 60 * 60_000,
  );
  const retentionMillis = boundedInteger(
    options.retentionMillis,
    30 * 24 * 60 * 60_000,
    1_000,
    365 * 24 * 60 * 60_000,
  );

  let activeRun = null;
  let interval = null;

  async function runCycle() {
    const claimed = await repository.claimCleanupBatch({
      workerId,
      limit: batchSize,
      leaseMillis,
    });
    const result = {
      claimed: claimed.length,
      completed: 0,
      failed: 0,
      deadLettered: 0,
      pruned: 0,
    };

    for (const operation of claimed) {
      try {
        const objectIsCurrent = await repository.isObjectActive({
          userId: operation.userId,
          fileId: "",
          objectKey: operation.cleanupObjectKey,
        });
        if (objectIsCurrent) {
          const recorded = await repository.failCleanupClaim({
            operationId: operation.id,
            userId: operation.userId,
            workerId,
            objectKey: operation.cleanupObjectKey,
            errorCode: "AVATAR_CLEANUP_OBJECT_ACTIVE",
            terminal: true,
            maxAttempts,
            baseBackoffMillis,
            maxBackoffMillis,
          });
          if (recorded.cleanupStatus === "dead_letter") {
            result.deadLettered += 1;
          } else {
            result.failed += 1;
          }
          continue;
        }

        await withTimeout(
          () => storageAdapter.deleteObject(operation.cleanupObjectKey),
          operationTimeoutMillis,
        );
        await repository.completeCleanupClaim({
          operationId: operation.id,
          userId: operation.userId,
          workerId,
          objectKey: operation.cleanupObjectKey,
        });
        result.completed += 1;
      } catch (error) {
        try {
          const recorded = await repository.failCleanupClaim({
            operationId: operation.id,
            userId: operation.userId,
            workerId,
            objectKey: operation.cleanupObjectKey,
            errorCode: stableErrorCode(error),
            maxAttempts,
            baseBackoffMillis,
            maxBackoffMillis,
          });
          if (recorded.cleanupStatus === "dead_letter") {
            result.deadLettered += 1;
          } else {
            result.failed += 1;
          }
        } catch (recordError) {
          onError(recordError);
          result.failed += 1;
        }
      }
    }

    const retention = await repository.pruneCleanupHistory({
      retentionMillis,
      limit: Math.max(batchSize, 100),
    });
    result.pruned = Number(retention?.pruned || 0);

    return result;
  }

  function runOnce() {
    if (activeRun) return activeRun;
    activeRun = runCycle().finally(() => {
      activeRun = null;
    });
    return activeRun;
  }

  function start() {
    if (!interval) {
      interval = setInterval(() => {
        void runOnce().catch(onError);
      }, intervalMillis);
      interval.unref?.();
    }
    return runOnce();
  }

  async function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (activeRun) await activeRun.catch(() => {});
  }

  function metrics() {
    return repository.cleanupMetrics({ retentionMillis });
  }

  return {
    metrics,
    runOnce,
    start,
    stop,
  };
}

module.exports = {
  createAvatarCleanupWorker,
  stableErrorCode,
};
