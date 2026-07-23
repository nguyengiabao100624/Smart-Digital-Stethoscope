DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.scan_sessions'::regclass
      AND conname = 'scan_sessions_id_organization_id_key'
  ) THEN
    ALTER TABLE scan_sessions
      ADD CONSTRAINT scan_sessions_id_organization_id_key UNIQUE (id, organization_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.scan_audio_chunks'::regclass
      AND conname = 'scan_audio_chunks_scan_workspace_fkey'
  ) THEN
    ALTER TABLE scan_audio_chunks
      ADD CONSTRAINT scan_audio_chunks_scan_workspace_fkey
      FOREIGN KEY (scan_id, organization_id)
      REFERENCES scan_sessions (id, organization_id)
      ON DELETE CASCADE
      NOT VALID;
    ALTER TABLE scan_audio_chunks
      VALIDATE CONSTRAINT scan_audio_chunks_scan_workspace_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.scan_audio_completions'::regclass
      AND conname = 'scan_audio_completions_scan_workspace_fkey'
  ) THEN
    ALTER TABLE scan_audio_completions
      ADD CONSTRAINT scan_audio_completions_scan_workspace_fkey
      FOREIGN KEY (scan_id, organization_id)
      REFERENCES scan_sessions (id, organization_id)
      ON DELETE CASCADE
      NOT VALID;
    ALTER TABLE scan_audio_completions
      VALIDATE CONSTRAINT scan_audio_completions_scan_workspace_fkey;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.scan_audio_chunks'::regclass
      AND conname = 'scan_audio_chunks_byte_size_cap_check'
  ) THEN
    ALTER TABLE scan_audio_chunks
      ADD CONSTRAINT scan_audio_chunks_byte_size_cap_check
      CHECK (byte_size <= 1048576) NOT VALID;
    ALTER TABLE scan_audio_chunks
      VALIDATE CONSTRAINT scan_audio_chunks_byte_size_cap_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.scan_audio_chunks'::regclass
      AND conname = 'scan_audio_chunks_sequence_cap_check'
  ) THEN
    ALTER TABLE scan_audio_chunks
      ADD CONSTRAINT scan_audio_chunks_sequence_cap_check
      CHECK (chunk_sequence < 32768) NOT VALID;
    ALTER TABLE scan_audio_chunks
      VALIDATE CONSTRAINT scan_audio_chunks_sequence_cap_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.scan_sessions'::regclass
      AND conname = 'scan_sessions_uploaded_bytes_cap_check'
  ) THEN
    ALTER TABLE scan_sessions
      ADD CONSTRAINT scan_sessions_uploaded_bytes_cap_check
      CHECK (uploaded_bytes <= 33554432) NOT VALID;
    ALTER TABLE scan_sessions
      VALIDATE CONSTRAINT scan_sessions_uploaded_bytes_cap_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.scan_audio_completions'::regclass
      AND conname = 'scan_audio_completions_total_bytes_cap_check'
  ) THEN
    ALTER TABLE scan_audio_completions
      ADD CONSTRAINT scan_audio_completions_total_bytes_cap_check
      CHECK (total_bytes <= 33554432 AND chunk_count <= 32768) NOT VALID;
    ALTER TABLE scan_audio_completions
      VALIDATE CONSTRAINT scan_audio_completions_total_bytes_cap_check;
  END IF;
END
$$;
