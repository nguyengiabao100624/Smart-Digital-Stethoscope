ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_active_workspace_start_idx
  ON appointments (organization_id, starts_at)
  WHERE deleted_at IS NULL;
