ALTER TABLE doctor_patient_access
  ADD COLUMN IF NOT EXISTS authority_type text,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS consented_at timestamptz;

UPDATE doctor_patient_access access
SET authority_type = CASE
      WHEN access.granted_by_user_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM patients patient
         JOIN users grantor ON grantor.id = access.granted_by_user_id
         WHERE patient.id = access.patient_id
           AND grantor.role = 'patient'
           AND access.granted_by_user_id IN (
             patient.owner_user_id,
             patient.account_user_id,
             patient.guardian_user_id
           )
       )
        THEN 'patient_consent'
      WHEN access.doctor_user_id IS NOT NULL
        THEN 'clinician_access_grant'
      ELSE 'administrative_assignment'
    END,
    consented_at = CASE
      WHEN access.granted_by_user_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM patients patient
         JOIN users grantor ON grantor.id = access.granted_by_user_id
         WHERE patient.id = access.patient_id
           AND grantor.role = 'patient'
           AND access.granted_by_user_id IN (
             patient.owner_user_id,
             patient.account_user_id,
             patient.guardian_user_id
           )
       )
        THEN COALESCE(access.consented_at, access.created_at)
      ELSE NULL
    END
WHERE access.authority_type IS NULL
   OR access.authority_type NOT IN (
     'patient_consent',
     'clinician_access_grant',
     'administrative_assignment'
   )
   OR (access.authority_type = 'patient_consent' AND access.consented_at IS NULL)
   OR (access.authority_type <> 'patient_consent' AND access.consented_at IS NOT NULL);

ALTER TABLE doctor_patient_access
  ALTER COLUMN authority_type SET DEFAULT 'administrative_assignment',
  ALTER COLUMN authority_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'doctor_patient_access'::regclass
      AND conname = 'doctor_patient_access_authority_type_check'
  ) THEN
    ALTER TABLE doctor_patient_access
      ADD CONSTRAINT doctor_patient_access_authority_type_check
      CHECK (
        authority_type IN (
          'patient_consent',
          'clinician_access_grant',
          'administrative_assignment'
        )
        AND (
          (authority_type = 'patient_consent' AND consented_at IS NOT NULL)
          OR (authority_type <> 'patient_consent' AND consented_at IS NULL)
        )
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE doctor_patient_access
  VALIDATE CONSTRAINT doctor_patient_access_authority_type_check;

CREATE INDEX IF NOT EXISTS doctor_patient_access_authority_idx
  ON doctor_patient_access (patient_id, authority_type, revoked_at, expires_at);
