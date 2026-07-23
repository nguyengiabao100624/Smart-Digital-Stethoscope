-- A share may target one doctor OR one workspace, never both. Historical
-- ambiguous rows are narrowed to the explicitly named doctor (least privilege)
-- before the invariant is installed.

LOCK TABLE doctor_patient_access IN SHARE ROW EXCLUSIVE MODE;

UPDATE doctor_patient_access
SET organization_id = NULL,
    updated_at = now()
WHERE doctor_user_id IS NOT NULL
  AND organization_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'doctor_patient_access'::regclass
      AND conname = 'doctor_patient_access_principal_exclusive_check'
  ) THEN
    ALTER TABLE doctor_patient_access
      ADD CONSTRAINT doctor_patient_access_principal_exclusive_check
      CHECK (
        NOT (doctor_user_id IS NOT NULL AND organization_id IS NOT NULL)
        AND (
          revoked_at IS NOT NULL
          OR doctor_user_id IS NOT NULL
          OR organization_id IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE doctor_patient_access
  VALIDATE CONSTRAINT doctor_patient_access_principal_exclusive_check;
