-- Re-run the legacy patient identity bridge for databases where migration 014
-- was already recorded before the stricter reconciliation contract existed.

-- The preflight, reconciliation, postflight and trigger installation are one
-- atomic schema operation. Holding this lock until the migration transaction
-- commits prevents a concurrent identity write from slipping in between the
-- final validation query and the deferred guards below.
LOCK TABLE users, patients IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  tenant_mismatch_count bigint;
  duplicate_legacy_link_count bigint;
  legacy_conflict_count bigint;
  duplicate_account_count bigint;
  account_inverse_conflict_count bigint;
  deleted_account_count bigint;
BEGIN
  SELECT COUNT(*) INTO tenant_mismatch_count
  FROM users account
  JOIN patients patient ON patient.id = account.patient_id
  WHERE account.patient_id IS NOT NULL
    AND NOT (account.organization_id IS NOT DISTINCT FROM patient.organization_id);

  SELECT COUNT(*) INTO duplicate_legacy_link_count
  FROM (
    SELECT account.patient_id
    FROM users account
    WHERE account.patient_id IS NOT NULL
    GROUP BY account.patient_id
    HAVING COUNT(*) > 1
  ) duplicate_links;

  SELECT COUNT(*) INTO legacy_conflict_count
  FROM users account
  JOIN patients patient ON patient.id = account.patient_id
  WHERE account.patient_id IS NOT NULL
    AND (
      patient.deleted_at IS NOT NULL
      OR (patient.account_user_id IS NOT NULL AND patient.account_user_id <> account.id)
      OR (patient.owner_user_id IS NOT NULL AND patient.owner_user_id <> account.id)
    );

  SELECT COUNT(*) INTO duplicate_account_count
  FROM (
    SELECT patient.account_user_id
    FROM patients patient
    WHERE patient.account_user_id IS NOT NULL
      AND patient.deleted_at IS NULL
    GROUP BY patient.account_user_id
    HAVING COUNT(*) > 1
  ) duplicate_accounts;

  SELECT COUNT(*) INTO account_inverse_conflict_count
  FROM patients patient
  LEFT JOIN users account ON account.id = patient.account_user_id
  WHERE patient.account_user_id IS NOT NULL
    AND patient.deleted_at IS NULL
    AND (
      account.id IS NULL
      OR NOT (account.organization_id IS NOT DISTINCT FROM patient.organization_id)
      OR (account.patient_id IS NOT NULL AND account.patient_id <> patient.id)
      OR (patient.owner_user_id IS NOT NULL AND patient.owner_user_id <> patient.account_user_id)
    );

  SELECT COUNT(*) INTO deleted_account_count
  FROM patients patient
  WHERE patient.account_user_id IS NOT NULL
    AND patient.deleted_at IS NOT NULL;

  IF tenant_mismatch_count > 0
    OR duplicate_legacy_link_count > 0
    OR legacy_conflict_count > 0
    OR duplicate_account_count > 0
    OR account_inverse_conflict_count > 0
    OR deleted_account_count > 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'patient identity reconciliation blocked: tenant_mismatch=%s duplicate_legacy_links=%s legacy_conflicts=%s duplicate_accounts=%s account_inverse_conflicts=%s deleted_accounts=%s',
        tenant_mismatch_count,
        duplicate_legacy_link_count,
        legacy_conflict_count,
        duplicate_account_count,
        account_inverse_conflict_count,
        deleted_account_count
      );
  END IF;
END;
$$;

WITH unique_patient_accounts AS (
  SELECT patient.id AS patient_id, MIN(account.id) AS user_id
  FROM users account
  JOIN patients patient ON patient.id = account.patient_id
  WHERE account.patient_id IS NOT NULL
    AND account.organization_id IS NOT DISTINCT FROM patient.organization_id
    AND patient.deleted_at IS NULL
  GROUP BY patient.id
  HAVING COUNT(*) = 1
)
UPDATE patients patient
SET account_user_id = COALESCE(patient.account_user_id, account.user_id),
    owner_user_id = COALESCE(patient.owner_user_id, account.user_id),
    profile_type = 'self',
    relationship = COALESCE(NULLIF(patient.relationship, ''), 'self'),
    updated_at = now()
FROM unique_patient_accounts account
WHERE patient.id = account.patient_id
  AND patient.deleted_at IS NULL
  AND (patient.account_user_id IS NULL OR patient.account_user_id = account.user_id)
  AND (patient.owner_user_id IS NULL OR patient.owner_user_id = account.user_id);

-- Complete the opposite side of the identity graph. Explicit account links
-- are authoritative only when they do not conflict with an existing
-- users.patient_id value (the preflight above rejects that case).
UPDATE patients patient
SET owner_user_id = patient.account_user_id,
    profile_type = 'self',
    relationship = COALESCE(NULLIF(patient.relationship, ''), 'self'),
    updated_at = now()
WHERE patient.deleted_at IS NULL
  AND patient.account_user_id IS NOT NULL
  AND (patient.owner_user_id IS NULL OR patient.owner_user_id = patient.account_user_id);

UPDATE users account
SET patient_id = patient.id,
    updated_at = now()
FROM patients patient
WHERE patient.deleted_at IS NULL
  AND patient.account_user_id = account.id
  AND account.patient_id IS NULL;

UPDATE patients
SET profile_type = CASE
  WHEN account_user_id IS NOT NULL AND account_user_id = owner_user_id THEN 'self'
  WHEN guardian_user_id IS NOT NULL OR NULLIF(family_group_id, '') IS NOT NULL THEN 'dependent'
  WHEN owner_user_id IS NOT NULL THEN 'dependent'
  ELSE 'patient'
END,
relationship = CASE
  WHEN account_user_id IS NOT NULL AND account_user_id = owner_user_id
    THEN COALESCE(NULLIF(relationship, ''), 'self')
  ELSE relationship
END,
updated_at = now()
WHERE deleted_at IS NULL;

DO $$
DECLARE
  duplicate_account_count bigint;
  invalid_account_count bigint;
  invalid_owner_count bigint;
  invalid_self_count bigint;
  invalid_user_inverse_count bigint;
BEGIN
  SELECT COUNT(*) INTO duplicate_account_count
  FROM (
    SELECT account_user_id
    FROM patients
    WHERE account_user_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY account_user_id
    HAVING COUNT(*) > 1
  ) duplicate_accounts;

  SELECT COUNT(*) INTO invalid_account_count
  FROM patients patient
  LEFT JOIN users account ON account.id = patient.account_user_id
  WHERE patient.account_user_id IS NOT NULL
    AND (
      patient.deleted_at IS NOT NULL
      OR account.id IS NULL
      OR NOT (account.organization_id IS NOT DISTINCT FROM patient.organization_id)
      OR account.patient_id IS DISTINCT FROM patient.id
      OR patient.profile_type <> 'self'
      OR patient.owner_user_id IS DISTINCT FROM patient.account_user_id
    );

  SELECT COUNT(*) INTO invalid_owner_count
  FROM patients patient
  LEFT JOIN users owner_account ON owner_account.id = patient.owner_user_id
  WHERE patient.owner_user_id IS NOT NULL
    AND (
      owner_account.id IS NULL
      OR NOT (owner_account.organization_id IS NOT DISTINCT FROM patient.organization_id)
    );

  SELECT COUNT(*) INTO invalid_self_count
  FROM patients patient
  WHERE patient.profile_type = 'self'
    AND patient.deleted_at IS NULL
    AND (
      patient.account_user_id IS NULL
      OR patient.owner_user_id IS DISTINCT FROM patient.account_user_id
    );

  SELECT COUNT(*) INTO invalid_user_inverse_count
  FROM users account
  LEFT JOIN patients patient ON patient.id = account.patient_id
  WHERE account.patient_id IS NOT NULL
    AND (
      patient.id IS NULL
      OR patient.deleted_at IS NOT NULL
      OR patient.account_user_id IS DISTINCT FROM account.id
      OR patient.owner_user_id IS DISTINCT FROM account.id
      OR NOT (account.organization_id IS NOT DISTINCT FROM patient.organization_id)
    );

  IF duplicate_account_count > 0
    OR invalid_account_count > 0
    OR invalid_owner_count > 0
    OR invalid_self_count > 0
    OR invalid_user_inverse_count > 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'patient identity validation blocked: duplicate_accounts=%s invalid_accounts=%s invalid_owners=%s invalid_self=%s invalid_user_inverse=%s',
        duplicate_account_count,
        invalid_account_count,
        invalid_owner_count,
        invalid_self_count,
        invalid_user_inverse_count
      );
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS patients_active_account_user_uidx
  ON patients (account_user_id)
  WHERE account_user_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_patient_identity_uidx
  ON users (patient_id)
  WHERE patient_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_self_identity_check'
  ) THEN
    ALTER TABLE patients
      ADD CONSTRAINT patients_self_identity_check
      CHECK (
        profile_type <> 'self'
        OR deleted_at IS NOT NULL
        OR (
          account_user_id IS NOT NULL
          AND owner_user_id IS NOT DISTINCT FROM account_user_id
        )
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE patients VALIDATE CONSTRAINT patients_self_identity_check;

CREATE OR REPLACE FUNCTION validate_patient_identity_references()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  current_patient patients%ROWTYPE;
  account_organization_id text;
  account_patient_id text;
  owner_organization_id text;
BEGIN
  -- A deferred constraint trigger can observe several writes to the same row.
  -- Validate the final transaction state instead of the intermediate NEW row,
  -- so a user and its patient identity can move tenant atomically in either
  -- statement order.
  SELECT *
  INTO current_patient
  FROM patients
  WHERE id = NEW.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF current_patient.account_user_id IS NOT NULL THEN
    SELECT organization_id, patient_id
    INTO account_organization_id, account_patient_id
    FROM users
    WHERE id = current_patient.account_user_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'patient account user does not exist';
    END IF;
    IF NOT (account_organization_id IS NOT DISTINCT FROM current_patient.organization_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'patient account user tenant is invalid';
    END IF;
    IF account_patient_id IS DISTINCT FROM current_patient.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'patient account user inverse identity is invalid';
    END IF;
    IF current_patient.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'deleted patient cannot retain an account identity';
    END IF;
    IF current_patient.profile_type <> 'self'
      OR current_patient.owner_user_id IS DISTINCT FROM current_patient.account_user_id
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'patient account user requires a canonical self profile';
    END IF;
  END IF;

  IF current_patient.owner_user_id IS NOT NULL THEN
    SELECT organization_id
    INTO owner_organization_id
    FROM users
    WHERE id = current_patient.owner_user_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'patient owner user does not exist';
    END IF;
    IF NOT (owner_organization_id IS NOT DISTINCT FROM current_patient.organization_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'patient owner user tenant is invalid';
    END IF;
  END IF;

  IF current_patient.profile_type = 'self' AND current_patient.deleted_at IS NULL AND (
    current_patient.account_user_id IS NULL
    OR current_patient.owner_user_id IS DISTINCT FROM current_patient.account_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'self patient identity graph is invalid';
  END IF;

  PERFORM 1
  FROM users account
  WHERE account.patient_id = current_patient.id
    AND (
      current_patient.deleted_at IS NOT NULL
      OR current_patient.account_user_id IS DISTINCT FROM account.id
      OR current_patient.owner_user_id IS DISTINCT FROM account.id
      OR NOT (account.organization_id IS NOT DISTINCT FROM current_patient.organization_id)
    )
  LIMIT 1
  FOR KEY SHARE;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'patient identity conflicts with its user inverse';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS patients_validate_identity_references ON patients;
CREATE CONSTRAINT TRIGGER patients_validate_identity_references
AFTER INSERT OR UPDATE ON patients
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_patient_identity_references();

CREATE OR REPLACE FUNCTION validate_user_patient_identity_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user users%ROWTYPE;
  current_identity_patient patients%ROWTYPE;
BEGIN
  SELECT *
  INTO current_user
  FROM users
  WHERE id = NEW.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF current_user.patient_id IS NOT NULL THEN
    SELECT *
    INTO current_identity_patient
    FROM patients
    WHERE id = current_user.patient_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'user patient identity does not exist';
    END IF;
    IF current_identity_patient.deleted_at IS NOT NULL
      OR current_identity_patient.account_user_id IS DISTINCT FROM current_user.id
      OR current_identity_patient.owner_user_id IS DISTINCT FROM current_user.id
      OR NOT (current_identity_patient.organization_id IS NOT DISTINCT FROM current_user.organization_id)
    THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'user patient inverse identity is invalid';
    END IF;
  END IF;

  PERFORM 1
  FROM patients patient
  WHERE patient.deleted_at IS NULL
    AND patient.account_user_id = current_user.id
    AND current_user.patient_id IS DISTINCT FROM patient.id
  LIMIT 1
  FOR KEY SHARE;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'user is missing the canonical patient inverse identity';
  END IF;

  PERFORM 1
  FROM patients patient
  WHERE patient.deleted_at IS NULL
    AND (patient.account_user_id = current_user.id OR patient.owner_user_id = current_user.id)
    AND (
      NOT (current_user.organization_id IS NOT DISTINCT FROM patient.organization_id)
    )
  LIMIT 1
  FOR KEY SHARE;

  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'user tenant change conflicts with an active patient identity';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS users_validate_patient_identity_transition ON users;
CREATE CONSTRAINT TRIGGER users_validate_patient_identity_transition
AFTER INSERT OR UPDATE ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_user_patient_identity_transition();
