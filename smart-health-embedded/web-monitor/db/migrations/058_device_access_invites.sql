BEGIN;

CREATE TABLE IF NOT EXISTS device_access_invites (
  id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id),
  access_level text NOT NULL CHECK (access_level IN ('viewer', 'manager')),
  code_hash text NOT NULL UNIQUE,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revoked_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (redeemed_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS device_access_invites_creator_idempotency_idx
  ON device_access_invites (created_by_user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS device_access_invites_device_idx
  ON device_access_invites (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS device_access_invites_active_idx
  ON device_access_invites (device_id, expires_at)
  WHERE redeemed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS device_access_grants (
  id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level text NOT NULL CHECK (access_level IN ('viewer', 'manager')),
  source_invite_id text REFERENCES device_access_invites(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, user_id)
);

CREATE INDEX IF NOT EXISTS device_access_grants_user_idx
  ON device_access_grants (user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS device_access_grants_device_idx
  ON device_access_grants (device_id, status, updated_at DESC);

ALTER TABLE device_access_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE device_access_invites FROM anon, authenticated;
REVOKE ALL ON TABLE device_access_grants FROM anon, authenticated;

COMMIT;
