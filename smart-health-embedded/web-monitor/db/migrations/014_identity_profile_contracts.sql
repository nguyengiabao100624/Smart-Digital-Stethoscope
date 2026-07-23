-- Additive identity/family profile contract used by Web and Android clients.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS blood_type text,
  ADD COLUMN IF NOT EXISTS allergies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS emergency_contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS guardian_user_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS profile_type text NOT NULL DEFAULT 'patient',
  ADD COLUMN IF NOT EXISTS relationship text,
  ADD COLUMN IF NOT EXISTS family_group_id text,
  ADD COLUMN IF NOT EXISTS account_user_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_doctor_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS doctor_name text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Fail before mutating an ambiguous legacy identity graph. Silently skipping
-- these rows would let first-login reconciliation create a second self profile.
DO $$
DECLARE
  tenant_mismatch_count bigint;
  duplicate_account_count bigint;
  ownership_conflict_count bigint;
BEGIN
  SELECT COUNT(*) INTO tenant_mismatch_count
  FROM users account
  JOIN patients legacy_patient ON legacy_patient.id = account.patient_id
  WHERE account.patient_id IS NOT NULL
    AND account.role = 'patient'
    AND NOT (account.organization_id IS NOT DISTINCT FROM legacy_patient.organization_id);

  SELECT COUNT(*) INTO duplicate_account_count
  FROM (
    SELECT account.patient_id
    FROM users account
    WHERE account.patient_id IS NOT NULL
      AND account.role = 'patient'
    GROUP BY account.patient_id
    HAVING COUNT(*) > 1
  ) duplicate_accounts;

  SELECT COUNT(*) INTO ownership_conflict_count
  FROM users account
  JOIN patients legacy_patient ON legacy_patient.id = account.patient_id
  WHERE account.patient_id IS NOT NULL
    AND account.role = 'patient'
    AND (
      (legacy_patient.account_user_id IS NOT NULL AND legacy_patient.account_user_id <> account.id)
      OR (legacy_patient.owner_user_id IS NOT NULL AND legacy_patient.owner_user_id <> account.id)
      OR legacy_patient.deleted_at IS NOT NULL
    );

  IF tenant_mismatch_count > 0 OR duplicate_account_count > 0 OR ownership_conflict_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'identity profile backfill blocked: tenant_mismatch=%s duplicate_accounts=%s ownership_conflicts=%s',
        tenant_mismatch_count,
        duplicate_account_count,
        ownership_conflict_count
      );
  END IF;
END;
$$;

DO $$
DECLARE
  legacy_owner_count bigint;
  inferred_self_count bigint;
  inferred_dependent_count bigint;
BEGIN
  SELECT COUNT(*) INTO legacy_owner_count FROM patients WHERE owner_user_id IS NOT NULL;
  SELECT COUNT(*) INTO inferred_self_count
  FROM patients
  WHERE (account_user_id IS NOT NULL AND account_user_id = owner_user_id)
     OR EXISTS (
       SELECT 1
       FROM users
       WHERE users.patient_id = patients.id
         AND users.role = 'patient'
         AND users.organization_id IS NOT DISTINCT FROM patients.organization_id
       GROUP BY users.patient_id
       HAVING COUNT(*) = 1
     );
  SELECT COUNT(*) INTO inferred_dependent_count
  FROM patients
  WHERE owner_user_id IS NOT NULL
    AND account_user_id IS DISTINCT FROM owner_user_id
    AND NOT EXISTS (SELECT 1 FROM users WHERE users.patient_id = patients.id)
    AND EXISTS (
      SELECT 1
      FROM users owner
      JOIN organizations organization ON organization.id = patients.organization_id
      WHERE owner.id = patients.owner_user_id
        AND owner.role = 'patient'
        AND COALESCE(organization.workspace_type, organization.type, '') = 'personal'
    );
  RAISE NOTICE 'identity profile backfill preflight: legacy_owner=%, self=%, dependent=%',
    legacy_owner_count, inferred_self_count, inferred_dependent_count;
END;
$$;

-- Link only unambiguous, active legacy patient accounts. Older data stored the
-- relationship on users.patient_id but left the inverse ownership columns
-- empty. Without this bridge, first-login reconciliation can create a second
-- self profile and account deletion cannot safely identify the legacy record.
WITH unique_patient_accounts AS (
  SELECT legacy_patient.id AS patient_id, MIN(account.id) AS user_id
  FROM users account
  JOIN patients legacy_patient ON legacy_patient.id = account.patient_id
  WHERE account.patient_id IS NOT NULL
    AND account.role = 'patient'
    AND account.organization_id IS NOT DISTINCT FROM legacy_patient.organization_id
    AND legacy_patient.deleted_at IS NULL
  GROUP BY legacy_patient.id
  HAVING COUNT(*) = 1
)
UPDATE patients
SET account_user_id = COALESCE(patients.account_user_id, unique_patient_accounts.user_id),
    owner_user_id = COALESCE(patients.owner_user_id, unique_patient_accounts.user_id),
    profile_type = 'self',
    updated_at = now()
FROM unique_patient_accounts
WHERE patients.id = unique_patient_accounts.patient_id
  AND patients.deleted_at IS NULL
  AND (patients.account_user_id IS NULL OR patients.account_user_id = unique_patient_accounts.user_id)
  AND (patients.owner_user_id IS NULL OR patients.owner_user_id = unique_patient_accounts.user_id);

UPDATE patients
SET profile_type = CASE
  WHEN account_user_id IS NOT NULL AND account_user_id = owner_user_id THEN 'self'
  WHEN guardian_user_id IS NOT NULL OR NULLIF(family_group_id, '') IS NOT NULL THEN 'dependent'
  WHEN owner_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM users owner
    JOIN organizations organization ON organization.id = patients.organization_id
    WHERE owner.id = patients.owner_user_id
      AND owner.role = 'patient'
      AND COALESCE(organization.workspace_type, organization.type, '') = 'personal'
  ) THEN 'dependent'
  ELSE 'patient'
END
WHERE profile_type IS NULL OR profile_type = '' OR profile_type = 'patient';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_profile_type_check') THEN
    ALTER TABLE patients
      ADD CONSTRAINT patients_profile_type_check
      CHECK (profile_type IN ('self', 'dependent', 'patient'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_blood_type_check') THEN
    ALTER TABLE patients
      ADD CONSTRAINT patients_blood_type_check
      CHECK (
        blood_type IS NULL OR
        blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown')
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS patients_owner_profile_idx
  ON patients (owner_user_id, profile_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS auth_sessions_user_binding_idx
  ON auth_sessions (user_id, refresh_token_hash);
