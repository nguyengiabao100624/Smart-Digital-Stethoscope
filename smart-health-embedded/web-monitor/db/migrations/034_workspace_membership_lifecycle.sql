ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE memberships
SET
  status = COALESCE(NULLIF(LOWER(status), ''), 'active'),
  updated_at = COALESCE(updated_at, created_at, now());

ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_status_check;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_status_check
  CHECK (status IN ('active', 'suspended'));

CREATE INDEX IF NOT EXISTS memberships_workspace_status_role_idx
  ON memberships (organization_id, status, role);
