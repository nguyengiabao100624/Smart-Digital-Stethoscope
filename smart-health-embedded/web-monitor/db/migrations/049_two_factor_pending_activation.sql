ALTER TABLE two_factor_enrollments
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_activation jsonb;

CREATE INDEX IF NOT EXISTS two_factor_enrollments_pending_delivery_idx
  ON two_factor_enrollments ((pending_activation->'delivery'->>'id'))
  WHERE consumed_at IS NULL AND pending_activation IS NOT NULL;

-- Existing credential rows were activated by the legacy verify transaction and
-- remain valid. New enrollment material stays on two_factor_enrollments until
-- the recovery delivery ACK atomically promotes it into this table.
