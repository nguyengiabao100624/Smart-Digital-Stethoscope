-- One unresolved provider mutation per account prevents an older unlock from
-- being applied after a newer lock/delete. The repository also takes a
-- target-scoped advisory lock; this index is the durable invariant.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM identity_operations
    WHERE status IN ('pending_provider', 'provider_applied', 'provider_failed')
    GROUP BY target_user_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'identity operation serialization preflight failed: multiple unresolved operations exist for one or more users';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS identity_operations_one_unresolved_per_target_idx
  ON identity_operations (target_user_id)
  WHERE status IN ('pending_provider', 'provider_applied', 'provider_failed');
