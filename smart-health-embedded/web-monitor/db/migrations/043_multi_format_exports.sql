ALTER TABLE exports
  ADD COLUMN IF NOT EXISTS artifact_sha256 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS renderer_version text NOT NULL DEFAULT 'shcare.export-artifact.v1',
  ADD COLUMN IF NOT EXISTS dataset text NOT NULL DEFAULT 'clinical_bundle',
  ADD COLUMN IF NOT EXISTS scope_kind text NOT NULL DEFAULT 'workspace',
  ADD COLUMN IF NOT EXISTS filters_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN exports.artifact_sha256 IS
  'SHA-256 of the deterministic backend-generated artifact for integrity verification at download time.';

CREATE INDEX IF NOT EXISTS exports_workspace_format_created_idx
  ON exports (organization_id, format, created_at DESC);
