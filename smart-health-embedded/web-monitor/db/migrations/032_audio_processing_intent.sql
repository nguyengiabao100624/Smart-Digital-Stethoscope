ALTER TABLE scan_sessions
  ADD COLUMN IF NOT EXISTS processing_generation bigint,
  ADD COLUMN IF NOT EXISTS processing_intent text,
  ADD COLUMN IF NOT EXISTS processing_artifact_fingerprint text,
  ADD COLUMN IF NOT EXISTS processing_run_id text,
  ADD COLUMN IF NOT EXISTS audio_file_id text,
  ADD COLUMN IF NOT EXISTS ai_result_id text;

UPDATE scan_sessions
SET
  processing_generation = COALESCE(processing_generation, 0),
  processing_intent = COALESCE(processing_intent, ''),
  processing_artifact_fingerprint = COALESCE(processing_artifact_fingerprint, ''),
  processing_run_id = COALESCE(processing_run_id, '')
WHERE
  processing_generation IS NULL OR
  processing_intent IS NULL OR
  processing_artifact_fingerprint IS NULL OR
  processing_run_id IS NULL;

UPDATE scan_sessions AS scan
SET audio_file_id = (
  SELECT audio.id
  FROM audio_files AS audio
  WHERE audio.scan_id = scan.id
  ORDER BY audio.created_at DESC, audio.id DESC
  LIMIT 1
)
WHERE scan.audio_file_id IS NULL
  AND EXISTS (SELECT 1 FROM audio_files AS audio WHERE audio.scan_id = scan.id);

UPDATE scan_sessions AS scan
SET ai_result_id = (
  SELECT result.id
  FROM ai_results AS result
  WHERE result.scan_id = scan.id
  ORDER BY result.updated_at DESC, result.created_at DESC, result.id DESC
  LIMIT 1
)
WHERE scan.ai_result_id IS NULL
  AND EXISTS (SELECT 1 FROM ai_results AS result WHERE result.scan_id = scan.id);

ALTER TABLE scan_sessions
  ALTER COLUMN processing_generation SET DEFAULT 0,
  ALTER COLUMN processing_generation SET NOT NULL,
  ALTER COLUMN processing_intent SET DEFAULT '',
  ALTER COLUMN processing_intent SET NOT NULL,
  ALTER COLUMN processing_artifact_fingerprint SET DEFAULT '',
  ALTER COLUMN processing_artifact_fingerprint SET NOT NULL,
  ALTER COLUMN processing_run_id SET DEFAULT '',
  ALTER COLUMN processing_run_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.scan_sessions'::regclass
      AND conname = 'scan_sessions_processing_generation_check'
  ) THEN
    ALTER TABLE scan_sessions
      ADD CONSTRAINT scan_sessions_processing_generation_check
      CHECK (processing_generation >= 0) NOT VALID;
    ALTER TABLE scan_sessions
      VALIDATE CONSTRAINT scan_sessions_processing_generation_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.scan_sessions'::regclass
      AND conname = 'scan_sessions_processing_fingerprint_check'
  ) THEN
    ALTER TABLE scan_sessions
      ADD CONSTRAINT scan_sessions_processing_fingerprint_check
      CHECK (
        processing_artifact_fingerprint = '' OR
        processing_artifact_fingerprint ~ '^[0-9a-f]{64}$'
      ) NOT VALID;
    ALTER TABLE scan_sessions
      VALIDATE CONSTRAINT scan_sessions_processing_fingerprint_check;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS scan_sessions_processing_intent_idx
  ON scan_sessions (processing_status, processing_intent, processing_generation, updated_at DESC);
