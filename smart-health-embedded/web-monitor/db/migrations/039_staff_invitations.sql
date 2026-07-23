CREATE TABLE IF NOT EXISTS staff_invitations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  email text NOT NULL,
  role text NOT NULL,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  specialty text NOT NULL DEFAULT '',
  license text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason text NOT NULL DEFAULT '',
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  last_sent_at timestamptz,
  send_count integer NOT NULL DEFAULT 0,
  email_delivery_status text NOT NULL DEFAULT 'unavailable',
  email_provider text NOT NULL DEFAULT '',
  email_message_id text NOT NULL DEFAULT '',
  email_last_attempt_at timestamptz,
  email_error_code text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_invitations_email_check
    CHECK (email = lower(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  CONSTRAINT staff_invitations_role_check
    CHECK (role IN ('workspace_admin', 'doctor', 'nurse', 'technician', 'billing', 'viewer')),
  CONSTRAINT staff_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT staff_invitations_token_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT staff_invitations_delivery_status_check
    CHECK (email_delivery_status IN ('ready', 'unavailable', 'sent', 'failed')),
  CONSTRAINT staff_invitations_send_count_check
    CHECK (send_count >= 0),
  CONSTRAINT staff_invitations_terminal_state_check
    CHECK (
      (
        status = 'accepted'
        AND accepted_at IS NOT NULL
        AND accepted_by_user_id IS NOT NULL
        AND revoked_at IS NULL
        AND revoked_by_user_id IS NULL
        AND revoke_reason = ''
      )
      OR (
        status = 'revoked'
        AND revoked_at IS NOT NULL
        AND accepted_at IS NULL
        AND accepted_by_user_id IS NULL
      )
      OR (
        status IN ('pending', 'expired')
        AND accepted_at IS NULL
        AND accepted_by_user_id IS NULL
        AND revoked_at IS NULL
        AND revoked_by_user_id IS NULL
        AND revoke_reason = ''
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_pending_email_workspace_unique
  ON staff_invitations (organization_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS staff_invitations_workspace_status_created_idx
  ON staff_invitations (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS staff_invitations_email_created_idx
  ON staff_invitations (lower(email), created_at DESC);

DO $$
BEGIN
  ALTER TABLE staff_invitations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE staff_invitations FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE staff_invitations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE staff_invitations FROM authenticated;
  END IF;
END;
$$;
