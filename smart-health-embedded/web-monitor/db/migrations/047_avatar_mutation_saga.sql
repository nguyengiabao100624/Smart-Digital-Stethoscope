CREATE TABLE IF NOT EXISTS avatar_mutation_operations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  mutation_type text NOT NULL,
  cleanup_kind text NOT NULL DEFAULT 'previous_avatar',
  idempotency_operation text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  active_file_id text REFERENCES storage_files(id) ON DELETE SET NULL,
  previous_file_id text REFERENCES storage_files(id) ON DELETE SET NULL,
  cleanup_object_key text,
  cleanup_status text NOT NULL DEFAULT 'pending',
  cleanup_attempts integer NOT NULL DEFAULT 0,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT avatar_mutation_type_check
    CHECK (mutation_type IN ('upload', 'delete', 'rollback')),
  CONSTRAINT avatar_cleanup_kind_check
    CHECK (cleanup_kind IN ('previous_avatar', 'deleted_avatar', 'staged_rollback')),
  CONSTRAINT avatar_cleanup_status_check
    CHECK (cleanup_status IN ('not_required', 'pending', 'completed')),
  CONSTRAINT avatar_cleanup_attempts_check
    CHECK (cleanup_attempts >= 0),
  CONSTRAINT avatar_cleanup_state_check
    CHECK (
      (cleanup_status = 'not_required' AND cleanup_object_key IS NULL AND completed_at IS NOT NULL)
      OR (cleanup_status = 'pending' AND cleanup_object_key IS NOT NULL AND completed_at IS NULL)
      OR (cleanup_status = 'completed' AND completed_at IS NOT NULL)
    ),
  UNIQUE (user_id, idempotency_operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS avatar_cleanup_pending_idx
  ON avatar_mutation_operations (user_id, created_at ASC)
  WHERE cleanup_status = 'pending';

DO $$
BEGIN
  ALTER TABLE avatar_mutation_operations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE avatar_mutation_operations FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE avatar_mutation_operations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE avatar_mutation_operations FROM authenticated;
  END IF;
END;
$$;
