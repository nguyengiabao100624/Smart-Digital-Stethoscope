ALTER TABLE avatar_mutation_operations
  ADD COLUMN IF NOT EXISTS cleanup_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_lease_owner text,
  ADD COLUMN IF NOT EXISTS cleanup_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

UPDATE avatar_mutation_operations
SET cleanup_next_attempt_at = COALESCE(cleanup_next_attempt_at, created_at, now())
WHERE cleanup_status = 'pending';

ALTER TABLE avatar_mutation_operations
  DROP CONSTRAINT IF EXISTS avatar_cleanup_status_check,
  DROP CONSTRAINT IF EXISTS avatar_cleanup_state_check;

ALTER TABLE avatar_mutation_operations
  ADD CONSTRAINT avatar_cleanup_status_check
    CHECK (cleanup_status IN ('not_required', 'pending', 'completed', 'dead_letter')),
  ADD CONSTRAINT avatar_cleanup_state_check
    CHECK (
      (
        cleanup_status = 'not_required'
        AND cleanup_object_key IS NULL
        AND completed_at IS NOT NULL
        AND dead_lettered_at IS NULL
      )
      OR (
        cleanup_status = 'pending'
        AND cleanup_object_key IS NOT NULL
        AND cleanup_next_attempt_at IS NOT NULL
        AND completed_at IS NULL
        AND dead_lettered_at IS NULL
      )
      OR (
        cleanup_status = 'completed'
        AND completed_at IS NOT NULL
        AND dead_lettered_at IS NULL
      )
      OR (
        cleanup_status = 'dead_letter'
        AND cleanup_object_key IS NOT NULL
        AND completed_at IS NULL
        AND dead_lettered_at IS NOT NULL
      )
    );

CREATE INDEX IF NOT EXISTS avatar_cleanup_due_worker_idx
  ON avatar_mutation_operations (cleanup_next_attempt_at ASC, created_at ASC)
  WHERE cleanup_status = 'pending';

-- The worker claim query uses this exact lock mode so multiple backend replicas
-- can sweep the same durable queue without sharing an in-process mutex.
COMMENT ON INDEX avatar_cleanup_due_worker_idx IS
  'Claimed by the avatar cleanup worker with FOR UPDATE SKIP LOCKED';
