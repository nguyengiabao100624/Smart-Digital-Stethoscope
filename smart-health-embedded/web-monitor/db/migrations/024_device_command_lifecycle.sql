-- Durable metadata-only ledger for accepted device commands and correlated
-- device outcomes. Raw command data is deliberately never stored here.

CREATE TABLE IF NOT EXISTS device_commands (
  id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  requested_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  protocol_version integer NOT NULL DEFAULT 1 CHECK (protocol_version = 1),
  command_type text NOT NULL,
  correlation_id text NOT NULL,
  state text NOT NULL DEFAULT 'accepted'
    CHECK (state IN ('accepted', 'queued', 'delivered', 'acknowledged', 'applying', 'applied', 'failed', 'expired')),
  code text,
  detail text,
  delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  request_fingerprint text,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz NOT NULL,
  queued_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  applying_at timestamptz,
  applied_at timestamptz,
  failed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > issued_at),
  UNIQUE (device_id, correlation_id)
);

CREATE INDEX IF NOT EXISTS device_commands_device_issued_idx
  ON device_commands (device_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS device_commands_workspace_state_idx
  ON device_commands (organization_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS device_commands_expiry_idx
  ON device_commands (expires_at)
  WHERE state NOT IN ('applied', 'failed', 'expired');

ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE device_commands FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE device_commands FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE device_commands FROM authenticated;
  END IF;
END
$$;
