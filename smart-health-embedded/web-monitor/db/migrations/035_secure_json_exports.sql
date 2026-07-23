ALTER TABLE exports
  ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS artifact_byte_size bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS downloaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE exports
  ALTER COLUMN format SET DEFAULT 'json',
  ALTER COLUMN status SET DEFAULT 'pending';

UPDATE exports
SET status = 'failed',
    updated_at = now()
WHERE status = 'ready'
  AND (snapshot_json IS NULL OR snapshot_json = '{}'::jsonb);

CREATE INDEX IF NOT EXISTS exports_workspace_created_idx
  ON exports (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS exports_creator_created_idx
  ON exports (created_by_user_id, created_at DESC);
