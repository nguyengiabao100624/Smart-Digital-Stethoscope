ALTER TABLE scan_sessions
  ADD COLUMN IF NOT EXISTS uploaded_bytes bigint,
  ADD COLUMN IF NOT EXISTS audio_chunk_count integer,
  ADD COLUMN IF NOT EXISTS audio_upload_completed_at timestamptz;

UPDATE scan_sessions
SET
  uploaded_bytes = COALESCE(uploaded_bytes, 0),
  audio_chunk_count = COALESCE(audio_chunk_count, 0)
WHERE uploaded_bytes IS NULL OR audio_chunk_count IS NULL;

ALTER TABLE scan_sessions
  ALTER COLUMN uploaded_bytes SET DEFAULT 0,
  ALTER COLUMN uploaded_bytes SET NOT NULL,
  ALTER COLUMN audio_chunk_count SET DEFAULT 0,
  ALTER COLUMN audio_chunk_count SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.scan_sessions'::regclass
      AND conname = 'scan_sessions_uploaded_bytes_check'
  ) THEN
    ALTER TABLE scan_sessions
      ADD CONSTRAINT scan_sessions_uploaded_bytes_check CHECK (uploaded_bytes >= 0) NOT VALID;
    ALTER TABLE scan_sessions VALIDATE CONSTRAINT scan_sessions_uploaded_bytes_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.scan_sessions'::regclass
      AND conname = 'scan_sessions_audio_chunk_count_check'
  ) THEN
    ALTER TABLE scan_sessions
      ADD CONSTRAINT scan_sessions_audio_chunk_count_check CHECK (audio_chunk_count >= 0) NOT VALID;
    ALTER TABLE scan_sessions VALIDATE CONSTRAINT scan_sessions_audio_chunk_count_check;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS scan_audio_chunks (
  id text PRIMARY KEY,
  scan_id text NOT NULL REFERENCES scan_sessions(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id),
  actor_user_id text NOT NULL,
  idempotency_key text NOT NULL,
  chunk_sequence integer NOT NULL CHECK (chunk_sequence >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  file_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id, chunk_sequence),
  UNIQUE (organization_id, actor_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS scan_audio_chunks_scan_order_idx
  ON scan_audio_chunks (scan_id, chunk_sequence ASC);

CREATE TABLE IF NOT EXISTS scan_audio_completions (
  id text PRIMARY KEY,
  scan_id text NOT NULL UNIQUE REFERENCES scan_sessions(id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES organizations(id),
  actor_user_id text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  chunk_count integer NOT NULL CHECK (chunk_count > 0),
  total_bytes bigint NOT NULL CHECK (total_bytes > 0),
  response_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  lease_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (organization_id, actor_user_id, idempotency_key)
);

ALTER TABLE scan_audio_completions
  ADD COLUMN IF NOT EXISTS lease_token text;

CREATE INDEX IF NOT EXISTS scan_audio_completions_workspace_status_idx
  ON scan_audio_completions (organization_id, status, updated_at DESC);

ALTER TABLE scan_audio_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_audio_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE scan_audio_chunks FROM PUBLIC;
REVOKE ALL ON TABLE scan_audio_completions FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE scan_audio_chunks FROM anon;
    REVOKE ALL ON TABLE scan_audio_completions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE scan_audio_chunks FROM authenticated;
    REVOKE ALL ON TABLE scan_audio_completions FROM authenticated;
  END IF;
END
$$;
