CREATE TABLE IF NOT EXISTS patient_import_batches (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id text REFERENCES users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_size_bytes integer NOT NULL,
  file_sha256 text NOT NULL,
  status text NOT NULL,
  row_count integer NOT NULL,
  valid_count integer NOT NULL,
  invalid_count integer NOT NULL,
  duplicate_count integer NOT NULL,
  rows_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  patient_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_import_batches_status_check
    CHECK (status IN ('validated', 'invalid', 'committed', 'expired')),
  CONSTRAINT patient_import_batches_counts_check
    CHECK (
      row_count >= 0 AND valid_count >= 0 AND invalid_count >= 0 AND duplicate_count >= 0
      AND valid_count + invalid_count = row_count
      AND imported_count >= 0 AND imported_count <= row_count
    ),
  CONSTRAINT patient_import_batches_size_check
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 5242880),
  CONSTRAINT patient_import_batches_version_check CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_patient_import_batches_workspace_created
  ON patient_import_batches (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patient_import_batches_expiry
  ON patient_import_batches (expires_at)
  WHERE status IN ('validated', 'invalid');
