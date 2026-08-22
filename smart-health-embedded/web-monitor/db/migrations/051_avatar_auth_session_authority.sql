ALTER TABLE avatar_mutation_operations
  ADD COLUMN IF NOT EXISTS auth_session_id text;

ALTER TABLE mutation_idempotency
  ADD COLUMN IF NOT EXISTS auth_session_id text;

CREATE INDEX IF NOT EXISTS avatar_mutation_session_authority_idx
  ON avatar_mutation_operations (user_id, auth_session_id, created_at DESC)
  WHERE auth_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mutation_idempotency_auth_session_idx
  ON mutation_idempotency (scope, operation, auth_session_id)
  WHERE auth_session_id IS NOT NULL;

COMMENT ON COLUMN avatar_mutation_operations.auth_session_id IS
  'Exact authenticated session that owns the avatar mutation and cleanup generation';

COMMENT ON COLUMN mutation_idempotency.auth_session_id IS
  'Exact authenticated session allowed to replay this mutation receipt';
