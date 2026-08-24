ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS phi_payload jsonb;

ALTER TABLE scan_sessions
  ADD COLUMN IF NOT EXISTS phi_payload jsonb;

ALTER TABLE ai_results
  ADD COLUMN IF NOT EXISTS phi_payload jsonb;

COMMENT ON COLUMN patients.phi_payload IS
  'AES-256-GCM application envelope for patient PHI; plaintext compatibility columns are scrubbed after backfill.';
COMMENT ON COLUMN scan_sessions.phi_payload IS
  'AES-256-GCM application envelope for scan clinical summaries and notes.';
COMMENT ON COLUMN ai_results.phi_payload IS
  'AES-256-GCM application envelope for AI summary and raw clinical result.';
