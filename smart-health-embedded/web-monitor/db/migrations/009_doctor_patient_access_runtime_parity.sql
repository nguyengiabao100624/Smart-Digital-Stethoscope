ALTER TABLE doctor_patient_access
  ALTER COLUMN doctor_user_id DROP NOT NULL;

ALTER TABLE doctor_patient_access
  ADD COLUMN IF NOT EXISTS doctor_id text,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'patient_profile',
  ADD COLUMN IF NOT EXISTS scan_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE doctor_patient_access
  DROP CONSTRAINT IF EXISTS doctor_patient_access_doctor_user_id_patient_id_key,
  DROP CONSTRAINT IF EXISTS doctor_patient_access_doctor_user_id_fkey,
  DROP CONSTRAINT IF EXISTS doctor_patient_access_patient_id_fkey,
  DROP CONSTRAINT IF EXISTS doctor_patient_access_organization_id_fkey,
  DROP CONSTRAINT IF EXISTS doctor_patient_access_granted_by_user_id_fkey,
  DROP CONSTRAINT IF EXISTS doctor_patient_access_revoked_by_user_id_fkey;

ALTER TABLE doctor_patient_access
  ADD CONSTRAINT doctor_patient_access_doctor_user_id_fkey
    FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT doctor_patient_access_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  ADD CONSTRAINT doctor_patient_access_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  ADD CONSTRAINT doctor_patient_access_granted_by_user_id_fkey
    FOREIGN KEY (granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT doctor_patient_access_revoked_by_user_id_fkey
    FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS doctor_patient_access_patient_idx
  ON doctor_patient_access (patient_id, revoked_at, created_at DESC);

CREATE INDEX IF NOT EXISTS doctor_patient_access_doctor_idx
  ON doctor_patient_access (doctor_user_id, revoked_at, created_at DESC);

CREATE INDEX IF NOT EXISTS doctor_patient_access_workspace_idx
  ON doctor_patient_access (organization_id, revoked_at, created_at DESC);
