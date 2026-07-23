ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS version integer,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE organizations
SET version = 1
WHERE version IS NULL OR version < 1;

ALTER TABLE organizations
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN version SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'organizations'::regclass
      AND conname = 'organizations_version_positive_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_version_positive_check
      CHECK (version > 0) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE organizations
  VALIDATE CONSTRAINT organizations_version_positive_check;

CREATE INDEX IF NOT EXISTS organizations_active_status_updated_idx
  ON organizations (status, updated_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS organizations_deleted_at_idx
  ON organizations (deleted_at DESC, id)
  WHERE deleted_at IS NOT NULL;
