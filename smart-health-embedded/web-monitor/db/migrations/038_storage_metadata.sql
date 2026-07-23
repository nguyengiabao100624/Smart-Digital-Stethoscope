CREATE TABLE IF NOT EXISTS storage_buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon_key text NOT NULL DEFAULT 'database',
  color_key text NOT NULL DEFAULT 'blue',
  category text NOT NULL DEFAULT 'custom',
  allowed_extensions jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_mime_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_file_size_mb integer NOT NULL DEFAULT 500,
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_buckets_id_check
    CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  CONSTRAINT storage_buckets_name_check
    CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT storage_buckets_max_file_size_check
    CHECK (max_file_size_mb BETWEEN 1 AND 2048),
  CONSTRAINT storage_buckets_allowed_extensions_array_check
    CHECK (jsonb_typeof(allowed_extensions) = 'array'),
  CONSTRAINT storage_buckets_allowed_mime_types_array_check
    CHECK (jsonb_typeof(allowed_mime_types) = 'array')
);

CREATE TABLE IF NOT EXISTS storage_files (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  bucket_id text NOT NULL,
  name text NOT NULL,
  object_key text NOT NULL UNIQUE,
  storage_provider text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  file_type text NOT NULL DEFAULT 'bin',
  byte_size bigint NOT NULL,
  checksum_sha256 text NOT NULL,
  firmware_version text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploader text NOT NULL DEFAULT '',
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  deleted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_files_name_check
    CHECK (length(btrim(name)) BETWEEN 1 AND 240),
  CONSTRAINT storage_files_object_key_check
    CHECK (length(btrim(object_key)) BETWEEN 1 AND 1000),
  CONSTRAINT storage_files_byte_size_check
    CHECK (byte_size > 0),
  CONSTRAINT storage_files_checksum_check
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT storage_files_tags_array_check
    CHECK (jsonb_typeof(tags) = 'array'),
  CONSTRAINT storage_files_status_check
    CHECK (status IN ('active', 'deleted')),
  CONSTRAINT storage_files_deleted_state_check
    CHECK (
      (status = 'active' AND deleted_at IS NULL)
      OR (status = 'deleted' AND deleted_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS storage_files_workspace_created_idx
  ON storage_files (organization_id, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS storage_files_bucket_created_idx
  ON storage_files (bucket_id, created_at DESC)
  WHERE status = 'active';

DO $$
BEGIN
  ALTER TABLE storage_buckets ENABLE ROW LEVEL SECURITY;
  ALTER TABLE storage_files ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE storage_buckets, storage_files FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE storage_buckets, storage_files FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE storage_buckets, storage_files FROM authenticated;
  END IF;
END;
$$;
