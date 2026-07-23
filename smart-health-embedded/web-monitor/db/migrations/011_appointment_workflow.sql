ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reschedule_reason text,
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_by_user_id text REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS mutation_idempotency (
  id text PRIMARY KEY,
  scope text NOT NULL,
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  response_status integer NOT NULL DEFAULT 200,
  response_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mutation_idempotency_unique UNIQUE (scope, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS mutation_idempotency_created_idx
  ON mutation_idempotency (created_at);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
