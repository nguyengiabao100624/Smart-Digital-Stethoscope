ALTER TABLE two_factor_enrollments
  ADD COLUMN IF NOT EXISTS start_intent jsonb;

CREATE INDEX IF NOT EXISTS two_factor_enrollments_start_intent_idx
  ON two_factor_enrollments (
    user_id,
    (start_intent->>'idempotencyKeyHash')
  )
  WHERE start_intent IS NOT NULL;

-- Only keyed hashes and non-secret lifecycle flags are persisted here. The
-- raw Idempotency-Key, primary-session binding, TOTP secret and otpauth URI
-- must never be written into start_intent.
