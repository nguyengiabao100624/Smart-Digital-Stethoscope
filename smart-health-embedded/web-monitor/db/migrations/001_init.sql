CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'clinic',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  firebase_uid text UNIQUE,
  email text UNIQUE,
  phone text,
  role text NOT NULL CHECK (role IN ('admin', 'doctor', 'patient')),
  name text NOT NULL,
  password_hash text,
  license text,
  hospital text,
  department text,
  address text,
  organization_id text REFERENCES organizations(id),
  patient_id text,
  verified_email boolean NOT NULL DEFAULT false,
  verified_phone boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  user_id text NOT NULL REFERENCES users(id),
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS patients (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  owner_user_id text REFERENCES users(id),
  patient_code text NOT NULL,
  name text NOT NULL,
  age integer,
  gender text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_patient_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS doctor_patient_access (
  id text PRIMARY KEY,
  doctor_user_id text NOT NULL REFERENCES users(id),
  patient_id text NOT NULL REFERENCES patients(id),
  organization_id text REFERENCES organizations(id),
  access_level text NOT NULL DEFAULT 'read',
  granted_by_user_id text REFERENCES users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_user_id, patient_id)
);

CREATE TABLE IF NOT EXISTS devices (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  paired_user_id text REFERENCES users(id),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'stethoscope',
  status text NOT NULL DEFAULT 'unclaimed',
  signal integer,
  battery integer,
  connected boolean NOT NULL DEFAULT false,
  connection_method text,
  secret_hash text,
  firmware_version text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_claims (
  id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id),
  organization_id text REFERENCES organizations(id),
  claim_code_hash text NOT NULL,
  created_by_user_id text REFERENCES users(id),
  claimed_by_user_id text REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_sessions (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  patient_id text NOT NULL REFERENCES patients(id),
  device_id text REFERENCES devices(id),
  created_by_user_id text REFERENCES users(id),
  idempotency_key text,
  status text NOT NULL DEFAULT 'recording',
  processing_status text NOT NULL DEFAULT 'recording',
  mode text NOT NULL DEFAULT 'heart',
  body_site text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  sample_rate integer NOT NULL DEFAULT 16000,
  sample_count integer NOT NULL DEFAULT 0,
  duration_seconds numeric NOT NULL DEFAULT 0,
  peak integer NOT NULL DEFAULT 0,
  rms integer NOT NULL DEFAULT 0,
  level_percent integer NOT NULL DEFAULT 0,
  bpm integer NOT NULL DEFAULT 0,
  ai_label text,
  ai_confidence numeric,
  ai_summary text,
  doctor_notes text,
  audio_url text,
  wav_file text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by_user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audio_files (
  id text PRIMARY KEY,
  scan_id text NOT NULL REFERENCES scan_sessions(id),
  patient_id text NOT NULL REFERENCES patients(id),
  storage_provider text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL DEFAULT 'audio/wav',
  byte_size bigint NOT NULL DEFAULT 0,
  sample_rate integer NOT NULL DEFAULT 16000,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_results (
  id text PRIMARY KEY,
  scan_id text NOT NULL REFERENCES scan_sessions(id),
  model_version text NOT NULL,
  label text,
  confidence numeric,
  summary text,
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id),
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_devices (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  platform text NOT NULL DEFAULT 'android',
  fcm_token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fcm_token)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  refresh_token_hash text NOT NULL,
  access_token_hash text,
  device text,
  ip inet,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id text PRIMARY KEY,
  key text NOT NULL,
  scope text NOT NULL,
  operation text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, scope, operation)
);

CREATE TABLE IF NOT EXISTS device_events (
  id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES devices(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS access_logs (
  id text PRIMARY KEY,
  action text NOT NULL,
  device text,
  location text,
  ip inet,
  severity text NOT NULL DEFAULT 'info',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES users(id),
  organization_id text REFERENCES organizations(id),
  action text NOT NULL,
  resource_type text,
  resource_id text,
  ip inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exports (
  id text PRIMARY KEY,
  format text NOT NULL DEFAULT 'pdf',
  status text NOT NULL DEFAULT 'ready',
  include_audio boolean NOT NULL DEFAULT true,
  include_reports boolean NOT NULL DEFAULT true,
  include_history boolean NOT NULL DEFAULT true,
  record_count integer NOT NULL DEFAULT 0,
  download_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id text PRIMARY KEY DEFAULT 'default',
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_runtime_state (
  id text PRIMARY KEY,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_append_only_update ON audit_logs;
CREATE TRIGGER audit_logs_append_only_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS audit_logs_append_only_delete ON audit_logs;
CREATE TRIGGER audit_logs_append_only_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE INDEX IF NOT EXISTS idx_patients_org ON patients(organization_id);
CREATE INDEX IF NOT EXISTS idx_patients_owner ON patients(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_scans_patient ON scan_sessions(patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_processing ON scan_sessions(processing_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audio_scan ON audio_files(scan_id);
CREATE INDEX IF NOT EXISTS idx_ai_scan ON ai_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_devices_org ON devices(organization_id);
CREATE INDEX IF NOT EXISTS idx_device_events_device ON device_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id, created_at DESC);
