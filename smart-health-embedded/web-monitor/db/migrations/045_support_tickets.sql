CREATE TABLE IF NOT EXISTS support_tickets (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  requester_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  acknowledged_at timestamptz,
  acknowledged_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  resolution_note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_type_check
    CHECK (
      type IN (
        'device_connection',
        'measurement_missing',
        'account_access',
        'interface_issue',
        'other'
      )
    ),
  CONSTRAINT support_tickets_description_check
    CHECK (char_length(description) BETWEEN 10 AND 3000),
  CONSTRAINT support_tickets_status_check
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  CONSTRAINT support_tickets_version_check
    CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS support_tickets_workspace_status_created_idx
  ON support_tickets (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS support_tickets_requester_created_idx
  ON support_tickets (requester_user_id, created_at DESC);

DO $$
BEGIN
  ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE support_tickets FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE support_tickets FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE support_tickets FROM authenticated;
  END IF;
END;
$$;
